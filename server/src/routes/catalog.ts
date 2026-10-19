import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/pool";
import type { Cache } from "../cache/redis";
import { cached, hashQuery } from "../cache/catalogCache";
import { TTL } from "../cache/config";
import { E } from "../lib/errors";
import { ah, parse } from "../middleware/common";

const SORTS = ["newest", "price_asc", "price_desc", "best_selling"] as const;
const bucket = (v: number | undefined) => (v === undefined ? undefined : Math.round(v / 500) * 500);

export const listQuery = z.object({
  category: z.string().max(64).optional(),
  size: z.string().max(16).optional(),
  colour: z.string().max(32).optional(),
  minPrice: z.coerce.number().int().min(0).max(1_000_000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(1_000_000).optional(),
  inStock: z.enum(["true", "false"]).optional(),
  onSale: z.enum(["true", "false"]).optional(),
  featured: z.enum(["true", "false"]).optional(),
  sort: z.enum(SORTS).default("newest"),
  q: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).max(50).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
  nocache: z.string().optional(),
}).strict();

const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

export async function queryProducts(db: Db, q: z.infer<typeof listQuery>) {
  const where = ["p.status = 'active'", "p.deleted_at IS NULL"];
  const args: unknown[] = [];
  const arg = (v: unknown) => { args.push(v); return `$${args.length}`; };
  if (q.category) where.push(`c.slug = ${arg(q.category)}`);
  if (q.featured === "true") where.push("p.featured");
  if (q.q?.trim()) {
    const pat = `%${escLike(q.q.trim())}%`;
    where.push(`(p.name ILIKE ${arg(pat)} OR p.description ILIKE $${args.length} OR EXISTS
      (SELECT 1 FROM variants sv WHERE sv.product_id = p.id AND sv.sku ILIKE $${args.length}))`);
  }
  const vf: string[] = [];
  if (q.size) vf.push(`v.size = ${arg(q.size)}`);
  if (q.colour) vf.push(`v.colour = ${arg(q.colour)}`);
  if (q.inStock === "true") vf.push("v.stock_on_hand > 0");
  if (q.onSale === "true") vf.push("v.compare_at_cents > v.price_cents");
  if (q.minPrice !== undefined) vf.push(`v.price_cents >= ${arg(q.minPrice)}`);
  if (q.maxPrice !== undefined) vf.push(`v.price_cents <= ${arg(q.maxPrice)}`);
  if (vf.length) where.push(`EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND ${vf.join(" AND ")})`);
  const order = {
    newest: "p.created_at DESC, p.name",
    price_asc: "agg.min_price ASC, p.name",
    price_desc: "agg.min_price DESC, p.name",
    best_selling: "COALESCE(sold.qty, 0) DESC, p.name",
  }[q.sort];
  const base = `FROM products p LEFT JOIN categories c ON c.id = p.category_id
    JOIN LATERAL (SELECT min(price_cents) AS min_price, max(compare_at_cents) AS compare_at,
      sum(stock_on_hand) AS stock FROM variants WHERE product_id = p.id) agg ON true
    LEFT JOIN LATERAL (SELECT sum(oi.quantity) AS qty FROM order_items oi WHERE oi.product_id = p.id) sold ON true
    WHERE ${where.join(" AND ")}`;
  const total = (await db.query(`SELECT count(*)::int AS n ${base}`, args)).rows[0].n;
  const offset = (q.page - 1) * q.pageSize;
  const { rows } = await db.query(
    `SELECT p.id, p.slug, p.name, c.slug AS category, c.name AS category_name, agg.min_price, agg.compare_at,
       agg.stock, (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY sort LIMIT 1) AS image
     ${base} ORDER BY ${order} LIMIT ${q.pageSize} OFFSET ${offset}`, args);
  return {
    items: rows.map((r) => ({
      id: r.id, slug: r.slug, name: r.name, category: r.category, categoryName: r.category_name,
      priceCents: r.min_price, compareAtCents: r.compare_at && r.compare_at > r.min_price ? r.compare_at : null,
      inStock: Number(r.stock) > 0, image: r.image, imageAlt: r.name,
    })),
    page: q.page, pageSize: q.pageSize, total,
  };
}

export async function loadProduct(db: Db, slug: string) {
  const { rows } = await db.query(
    `SELECT p.id, p.slug, p.name, p.description, p.brand, p.status, c.slug AS category, c.name AS category_name
     FROM products p LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.slug = $1 AND p.status = 'active' AND p.deleted_at IS NULL`, [slug]);
  if (!rows[0]) return null;
  const p = rows[0];
  const images = (await db.query("SELECT url, alt FROM product_images WHERE product_id = $1 ORDER BY sort", [p.id])).rows;
  const variants = (await db.query(
    `SELECT id, sku, size, colour, price_cents, compare_at_cents FROM variants WHERE product_id = $1
     ORDER BY colour NULLS FIRST, array_position(ARRAY['XS','S','M','L','XL'], size), size`, [p.id])).rows;
  return {
    id: p.id, slug: p.slug, name: p.name, description: p.description, brand: p.brand,
    category: p.category, categoryName: p.category_name, images,
    variants: variants.map((v) => ({ id: v.id, sku: v.sku, size: v.size, colour: v.colour,
      priceCents: v.price_cents, compareAtCents: v.compare_at_cents })),
  };
}

export function catalogRouter(db: Db, cache: Cache) {
  const r = Router();

  r.get("/categories", ah(async (req, res) => {
    const { value, status, key } = await cached(cache, db,
      { kind: "categories", id: "tree", ttl: TTL.categories, bypass: req.query.nocache !== undefined },
      async () => (await db.query(
        `SELECT c.id, c.slug, c.name, c.parent_id AS "parentId", c.featured,
           (SELECT count(*)::int FROM products p WHERE p.category_id = c.id AND p.status='active' AND p.deleted_at IS NULL) AS "productCount"
         FROM categories c ORDER BY c.sort, c.name`)).rows);
    res.set({ "X-Cache": status, "X-Cache-Key": key }).json({ items: value });
  }));

  r.get("/products", ah(async (req, res) => {
    const q = parse(listQuery, req.query);
    const norm = { ...q, nocache: undefined, minPrice: bucket(q.minPrice), maxPrice: bucket(q.maxPrice),
      q: q.q?.trim().toLowerCase() };
    const kind = q.q ? "search" : "list";
    const { value, status, key } = await cached(cache, db,
      { kind, id: hashQuery(norm), ttl: kind === "search" ? TTL.search : TTL.list, bypass: q.nocache !== undefined },
      () => queryProducts(db, { ...q, minPrice: norm.minPrice, maxPrice: norm.maxPrice }));
    res.set({ "X-Cache": status, "X-Cache-Key": key }).json(value);
  }));

  r.get("/products/:slug", ah(async (req, res) => {
    const slug = parse(z.string().max(96).regex(/^[a-z0-9-]+$/), req.params.slug);
    const { value, status, key } = await cached(cache, db,
      { kind: "product", id: slug, ttl: TTL.product, bypass: req.query.nocache !== undefined },
      () => loadProduct(db, slug));
    if (!value) throw E.notFound("Product");
    // Stock is never cached: read live so the product page and checkout always agree.
    const { rows } = await db.query(
      `SELECT v.id, v.stock_on_hand, COALESCE(v.low_stock_threshold, s.low_stock_threshold) AS threshold
       FROM variants v CROSS JOIN store_settings s WHERE v.product_id = $1`, [value.id]);
    const stock = new Map(rows.map((r) => [r.id, r]));
    res.set({ "X-Cache": status, "X-Cache-Key": key }).json({
      ...value,
      variants: value.variants.map((v) => {
        const s = stock.get(v.id);
        const n = s?.stock_on_hand ?? 0;
        return { ...v, stock: n, inStock: n > 0, lowStock: n > 0 && n <= (s?.threshold ?? 5) };
      }),
    });
  }));

  r.get("/home", ah(async (req, res) => {
    const bypass = req.query.nocache !== undefined;
    const base = { sort: "newest" as const, page: 1, pageSize: 8 };
    const [featured, arrivals, sale] = await Promise.all([
      cached(cache, db, { kind: "list", id: "home-featured", ttl: TTL.list, bypass }, () => queryProducts(db, { ...base, featured: "true" })),
      cached(cache, db, { kind: "list", id: "home-new", ttl: TTL.list, bypass }, () => queryProducts(db, base)),
      cached(cache, db, { kind: "list", id: "home-sale", ttl: TTL.list, bypass }, () => queryProducts(db, { ...base, onSale: "true" })),
    ]);
    const cats = (await db.query("SELECT slug, name FROM categories WHERE featured ORDER BY sort")).rows;
    res.set({ "X-Cache": featured.status, "X-Cache-Key": featured.key }).json({
      featuredCategories: cats, featured: featured.value.items, newArrivals: arrivals.value.items, onSale: sale.value.items,
    });
  }));

  r.get("/store", ah(async (_req, res) => {
    const { rows } = await db.query("SELECT store_name, flat_shipping_cents, free_shipping_threshold_cents, tax_rate_bps FROM store_settings");
    const s = rows[0] ?? {};
    res.json({ storeName: s.store_name, flatShippingCents: s.flat_shipping_cents,
      freeShippingThresholdCents: s.free_shipping_threshold_cents, taxRateBps: s.tax_rate_bps });
  }));

  return r;
}
