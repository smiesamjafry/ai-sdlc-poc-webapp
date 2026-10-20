import { Router, type Request } from "express";
import { z } from "zod";
import type { Db, Tx } from "../db/pool";
import { withTx } from "../db/pool";
import type { Cache } from "../cache/redis";
import { flushCategoryCache, invalidateCatalog, recordInvalidation } from "../cache/catalogCache";
import { TTL } from "../cache/config";
import type { Config } from "../lib/config";
import { ApiError, E } from "../lib/errors";
import { uuid } from "../lib/ids";
import { ah, parse } from "../middleware/common";
import { AuthService, fenceEpoch, requireRole } from "../services/auth";
import { resetDemo } from "../seed/reset";
import { slugify } from "../seed/catalog";
import { orderDetail } from "./shop";
import { healthReport } from "./health";

// §7.2 permissions: staff = read + fulfilment + stock; admin = everything.
const staff = requireRole("staff", "admin");
const admin = requireRole("admin");

const page = z.coerce.number().int().min(1).max(500).default(1);

async function audit(tx: Tx, req: Request, action: string, entity: string, entityId: string | null, detail?: unknown) {
  await tx.query("INSERT INTO audit_log (id, actor_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5,$6)",
    [uuid(), req.user?.id ?? null, action, entity, entityId, detail ?? null]);
}

/** Every admin mutation: one transaction, reset-fenced, audited. */
const mutate = <T>(db: Db, req: Request, fn: (tx: Tx) => Promise<T>) =>
  withTx(db, async (tx) => { await fenceEpoch(tx, req.user); return fn(tx); });

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().trim().min(1).max(80).regex(/^[A-Z0-9-]+$/, "Use A-Z, 0-9 and dashes"),
  size: z.string().trim().max(16).nullable().optional(),
  colour: z.string().trim().max(32).nullable().optional(),
  priceCents: z.number().int().min(0).max(10_000_000),
  compareAtCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
  lowStockThreshold: z.number().int().min(0).max(10_000).nullable().optional(),
  stock: z.number().int().min(0).max(100_000).optional(),
});

const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(96).regex(/^[a-z0-9-]*$/).optional(),
  description: z.string().max(4000).default(""),
  brand: z.string().trim().max(60).default("Pocket"),
  categoryId: z.string().uuid().nullable(),
  status: z.enum(["draft", "active", "archived"]).default("active"),
  featured: z.boolean().default(false),
  images: z.array(z.object({ url: z.string().trim().max(500).regex(/^(https?:\/\/|products\/)[^\s"'<>]+$/, "Use an https:// URL or products/<file>"),
    alt: z.string().trim().min(1).max(200) })).max(10).default([]),
  variants: z.array(variantSchema).min(1).max(100),
});

const promoSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().toUpperCase().min(3).max(40).regex(/^[A-Z0-9_-]+$/),
  type: z.enum(["percentage", "fixed", "free_shipping"]),
  value: z.number().int().min(0).max(10_000_000).default(0),
  scopeKind: z.enum(["all", "categories", "products"]).default("all"),
  scopeIds: z.array(z.string().uuid()).max(200).default([]),
  minSubtotalCents: z.number().int().min(0).max(10_000_000).default(0),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).nullable().optional(),
  active: z.boolean().default(true),
}).refine((p) => p.type !== "percentage" || (p.value >= 1 && p.value <= 100), { message: "Percentage must be 1-100", path: ["value"] });

const TRANSITIONS: Record<string, string[]> = { paid: ["packed"], packed: ["shipped"], shipped: ["delivered"] };

export function adminRouter(db: Db, cache: Cache, cfg: Config, auth: AuthService) {
  const r = Router();

  // ---------- dashboard ----------
  r.get("/dashboard", staff, ah(async (req, res) => {
    const bypass = req.query.nocache !== undefined;
    const load = async () => {
      const k = (await db.query(`
        SELECT
          COALESCE(sum(total_cents - refunded_cents) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'), 0)::int AS today,
          COALESCE(sum(total_cents - refunded_cents) FILTER (WHERE created_at >= now() - interval '7 days'), 0)::int AS d7,
          COALESCE(sum(total_cents - refunded_cents) FILTER (WHERE created_at >= now() - interval '30 days'), 0)::int AS d30,
          count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS orders30,
          count(*) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS orders_today
        FROM orders WHERE fulfilment_status <> 'cancelled'`)).rows[0];
      const top = (await db.query(`
        SELECT oi.product_name AS name, sum(oi.quantity)::int AS units, sum(oi.line_total_cents)::int AS "revenueCents"
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.created_at >= now() - interval '30 days' AND o.fulfilment_status <> 'cancelled'
        GROUP BY oi.product_name ORDER BY units DESC, name LIMIT 5`)).rows;
      const low = (await db.query(`
        SELECT v.id, v.sku, p.name, v.stock_on_hand AS stock FROM variants v JOIN products p ON p.id = v.product_id
        CROSS JOIN store_settings s WHERE p.deleted_at IS NULL
          AND v.stock_on_hand <= COALESCE(v.low_stock_threshold, s.low_stock_threshold)
        ORDER BY v.stock_on_hand, p.name LIMIT 10`)).rows;
      return {
        revenue: { todayCents: k.today, last7Cents: k.d7, last30Cents: k.d30 },
        orders: { today: k.orders_today, last30: k.orders30 },
        aovCents: k.orders30 ? Math.round(k.d30 / k.orders30) : 0,
        topProducts: top, lowStock: low,
      };
    };
    let value = bypass ? null : await cache.run(async (c) => c.get(cache.key("stats:dashboard")));
    let status = "HIT";
    if (!value) {
      const fresh = await load();
      value = JSON.stringify(fresh);
      status = bypass ? "BYPASS" : (await cache.run((c) => c.set(cache.key("stats:dashboard"), value!, "EX", TTL.dashboard))) ? "MISS" : "BYPASS";
    }
    const stats = await cacheStats(cache);
    res.set("X-Cache", status).json({ ...JSON.parse(value), cache: { hitRate: stats.hitRate } });
  }));

  // ---------- products ----------
  r.get("/products", staff, ah(async (req, res) => {
    const q = parse(z.object({ q: z.string().max(64).optional(), status: z.enum(["draft", "active", "archived"]).optional(), page }).passthrough(), req.query);
    const args: unknown[] = [];
    const where = ["p.deleted_at IS NULL"];
    if (q.q) { args.push(`%${q.q}%`); where.push(`p.name ILIKE $${args.length}`); }
    if (q.status) { args.push(q.status); where.push(`p.status = $${args.length}`); }
    const { rows } = await db.query(
      `SELECT p.id, p.slug, p.name, p.status, p.featured, c.name AS category,
         (SELECT min(price_cents) FROM variants WHERE product_id = p.id) AS "priceCents",
         (SELECT sum(stock_on_hand)::int FROM variants WHERE product_id = p.id) AS stock,
         (SELECT count(*)::int FROM variants WHERE product_id = p.id) AS variants
       FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE ${where.join(" AND ")}
       ORDER BY p.name LIMIT 50 OFFSET ${(q.page - 1) * 50}`, args);
    res.json({ items: rows });
  }));

  r.get("/products/:id", staff, ah(async (req, res) => {
    const id = parse(z.string().uuid(), req.params.id);
    const { rows } = await db.query("SELECT * FROM products WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (!rows[0]) throw E.notFound("Product");
    const p = rows[0];
    const images = (await db.query("SELECT url, alt FROM product_images WHERE product_id = $1 ORDER BY sort", [id])).rows;
    const variants = (await db.query(
      `SELECT id, sku, size, colour, price_cents AS "priceCents", compare_at_cents AS "compareAtCents",
         stock_on_hand AS stock, low_stock_threshold AS "lowStockThreshold" FROM variants WHERE product_id = $1 ORDER BY sku`, [id])).rows;
    res.json({ id: p.id, slug: p.slug, name: p.name, description: p.description, brand: p.brand, categoryId: p.category_id,
      status: p.status, featured: p.featured, images, variants });
  }));

  const saveProduct = async (req: Request, tx: Tx, id: string, b: z.infer<typeof productSchema>, isNew: boolean) => {
    const slug = b.slug || slugify(b.name);
    const dupe = await tx.query("SELECT 1 FROM products WHERE slug = $1 AND id <> $2", [slug, id]);
    if (dupe.rowCount) throw E.validation({ slug: `"${slug}" is already used by another product` });
    if (isNew) {
      await tx.query(
        `INSERT INTO products (id, slug, name, description, brand, category_id, status, featured) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, slug, b.name, b.description, b.brand, b.categoryId, b.status, b.featured]);
    } else {
      const u = await tx.query(
        `UPDATE products SET slug=$2, name=$3, description=$4, brand=$5, category_id=$6, status=$7, featured=$8, updated_at=now()
         WHERE id = $1 AND deleted_at IS NULL`, [id, slug, b.name, b.description, b.brand, b.categoryId, b.status, b.featured]);
      if (!u.rowCount) throw E.notFound("Product");
    }
    await tx.query("DELETE FROM product_images WHERE product_id = $1", [id]);
    for (const [i, img] of b.images.entries()) {
      await tx.query("INSERT INTO product_images (id, product_id, url, alt, sort) VALUES ($1,$2,$3,$4,$5)", [uuid(), id, img.url, img.alt, i]);
    }
    const keep: string[] = [];
    for (const v of b.variants) {
      const skuClash = await tx.query("SELECT product_id FROM variants WHERE sku = $1 AND id <> COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000')", [v.sku, v.id ?? null]);
      if (skuClash.rowCount) throw E.validation({ sku: `SKU ${v.sku} is already used` });
      if (v.id) {
        const u = await tx.query(
          `UPDATE variants SET sku=$3, size=$4, colour=$5, price_cents=$6, compare_at_cents=$7, low_stock_threshold=$8
           WHERE id = $1 AND product_id = $2`,
          [v.id, id, v.sku, v.size ?? null, v.colour ?? null, v.priceCents, v.compareAtCents ?? null, v.lowStockThreshold ?? null]);
        if (!u.rowCount) throw E.notFound("Variant");
        keep.push(v.id);
      } else {
        const vid = uuid();
        await tx.query(
          `INSERT INTO variants (id, product_id, sku, size, colour, price_cents, compare_at_cents, low_stock_threshold, stock_on_hand)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [vid, id, v.sku, v.size ?? null, v.colour ?? null, v.priceCents, v.compareAtCents ?? null, v.lowStockThreshold ?? null, v.stock ?? 0]);
        if (v.stock) {
          await tx.query("INSERT INTO inventory_movements (id, variant_id, delta, reason, actor_id) VALUES ($1,$2,$3,'initial stock',$4)",
            [uuid(), vid, v.stock, req.user!.id]);
        }
        keep.push(vid);
      }
    }
    if (!isNew) {
      // Variants still referenced by carts are removed from carts with them; past orders keep their snapshot.
      await tx.query("DELETE FROM variants WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))", [id, keep]);
    }
    await invalidateCatalog(tx);
    await audit(tx, req, isNew ? "product.create" : "product.update", "product", id, { name: b.name, status: b.status });
    return slug;
  };

  r.post("/products", admin, ah(async (req, res) => {
    const b = parse(productSchema, req.body);
    const id = uuid();
    const slug = await mutate(db, req, (tx) => saveProduct(req, tx, id, b, true));
    await recordInvalidation(cache, `product created: ${b.name}`);
    res.status(201).json({ id, slug });
  }));

  r.put("/products/:id", admin, ah(async (req, res) => {
    const id = parse(z.string().uuid(), req.params.id);
    const b = parse(productSchema, req.body);
    const slug = await mutate(db, req, (tx) => saveProduct(req, tx, id, b, false));
    await recordInvalidation(cache, `product updated: ${b.name}`);
    res.json({ id, slug });
  }));

  r.delete("/products/:id", admin, ah(async (req, res) => {
    const id = parse(z.string().uuid(), req.params.id);
    await mutate(db, req, async (tx) => {
      const u = await tx.query("UPDATE products SET status = 'archived', deleted_at = now() WHERE id = $1 AND deleted_at IS NULL", [id]);
      if (!u.rowCount) throw E.notFound("Product");
      await invalidateCatalog(tx);
      await audit(tx, req, "product.delete", "product", id);
    });
    await recordInvalidation(cache, "product deleted");
    res.status(204).end();
  }));

  // ---------- categories ----------
  r.get("/categories", staff, ah(async (_req, res) => {
    const { rows } = await db.query(
      `SELECT c.id, c.slug, c.name, c.parent_id AS "parentId", c.sort, c.featured,
         (SELECT count(*)::int FROM products p WHERE p.category_id = c.id AND p.deleted_at IS NULL) AS "productCount"
       FROM categories c ORDER BY c.sort, c.name`);
    res.json({ items: rows });
  }));

  const catSchema = z.object({ name: z.string().trim().min(1).max(80), slug: z.string().trim().max(64).regex(/^[a-z0-9-]*$/).optional(),
    parentId: z.string().uuid().nullable().default(null), sort: z.number().int().min(0).max(10_000).default(0), featured: z.boolean().default(false) });

  r.post("/categories", admin, ah(async (req, res) => {
    const b = parse(catSchema, req.body);
    const id = uuid();
    await mutate(db, req, async (tx) => {
      const slug = b.slug || slugify(b.name);
      if ((await tx.query("SELECT 1 FROM categories WHERE slug = $1", [slug])).rowCount) throw E.validation({ slug: "Already used" });
      await tx.query("INSERT INTO categories (id, slug, name, parent_id, sort, featured) VALUES ($1,$2,$3,$4,$5,$6)",
        [id, slug, b.name, b.parentId, b.sort, b.featured]);
      await invalidateCatalog(tx);
      await audit(tx, req, "category.create", "category", id, { name: b.name });
    });
    await flushCategoryCache(cache);
    res.status(201).json({ id });
  }));

  r.put("/categories/:id", admin, ah(async (req, res) => {
    const id = parse(z.string().uuid(), req.params.id);
    const b = parse(catSchema, req.body);
    if (b.parentId === id) throw E.validation({ parentId: "A category cannot be its own parent" });
    await mutate(db, req, async (tx) => {
      const slug = b.slug || slugify(b.name);
      if ((await tx.query("SELECT 1 FROM categories WHERE slug = $1 AND id <> $2", [slug, id])).rowCount) throw E.validation({ slug: "Already used" });
      const u = await tx.query("UPDATE categories SET slug=$2, name=$3, parent_id=$4, sort=$5, featured=$6 WHERE id=$1",
        [id, slug, b.name, b.parentId, b.sort, b.featured]);
      if (!u.rowCount) throw E.notFound("Category");
      await invalidateCatalog(tx);
      await audit(tx, req, "category.update", "category", id, { name: b.name });
    });
    await flushCategoryCache(cache);
    res.json({ id });
  }));

  r.delete("/categories/:id", admin, ah(async (req, res) => {
    const id = parse(z.string().uuid(), req.params.id);
    await mutate(db, req, async (tx) => {
      const { rows } = await tx.query(
        `SELECT (SELECT count(*)::int FROM products WHERE category_id = $1 AND deleted_at IS NULL) AS products,
                (SELECT count(*)::int FROM categories WHERE parent_id = $1) AS children`, [id]);
      if (rows[0].products || rows[0].children) {
        throw E.conflict("CATEGORY_IN_USE", "This category still has products or subcategories",
          "Move its products and subcategories to another category first.", rows[0]);
      }
      const d = await tx.query("DELETE FROM categories WHERE id = $1", [id]);
      if (!d.rowCount) throw E.notFound("Category");
      await invalidateCatalog(tx);
      await audit(tx, req, "category.delete", "category", id);
    });
    await flushCategoryCache(cache);
    res.status(204).end();
  }));

  // ---------- inventory ----------
  r.get("/inventory", staff, ah(async (req, res) => {
    const q = parse(z.object({ filter: z.enum(["all", "low", "out"]).default("all"), q: z.string().max(64).optional(), page }), req.query);
    const where = ["p.deleted_at IS NULL"];
    const args: unknown[] = [];
    if (q.filter === "low") where.push("v.stock_on_hand > 0 AND v.stock_on_hand <= COALESCE(v.low_stock_threshold, s.low_stock_threshold)");
    if (q.filter === "out") where.push("v.stock_on_hand = 0");
    if (q.q) { args.push(`%${q.q}%`); where.push(`(p.name ILIKE $${args.length} OR v.sku ILIKE $${args.length})`); }
    const { rows } = await db.query(
      `SELECT v.id, v.sku, p.name, p.id AS "productId", v.size, v.colour, v.stock_on_hand AS stock,
         COALESCE(v.low_stock_threshold, s.low_stock_threshold) AS threshold
       FROM variants v JOIN products p ON p.id = v.product_id CROSS JOIN store_settings s
       WHERE ${where.join(" AND ")} ORDER BY v.stock_on_hand, p.name, v.sku LIMIT 100 OFFSET ${(q.page - 1) * 100}`, args);
    res.json({ items: rows });
  }));

  r.post("/inventory/:variantId/adjust", staff, ah(async (req, res) => {
    const variantId = parse(z.string().uuid(), req.params.variantId);
    const b = parse(z.object({ delta: z.number().int().min(-100_000).max(100_000).refine((n) => n !== 0, "Must not be 0"),
      reason: z.string().trim().min(2).max(200) }), req.body);
    const stock = await mutate(db, req, async (tx) => {
      const { rows } = await tx.query("SELECT stock_on_hand FROM variants WHERE id = $1 FOR UPDATE", [variantId]);
      if (!rows[0]) throw E.notFound("Variant");
      const next = rows[0].stock_on_hand + b.delta;
      if (next < 0) throw E.conflict("STOCK_NEGATIVE", "Stock can't go below zero",
        `The current stock is ${rows[0].stock_on_hand}; use a delta of at least ${-rows[0].stock_on_hand}.`);
      await tx.query("UPDATE variants SET stock_on_hand = $2 WHERE id = $1", [variantId, next]);
      await tx.query("INSERT INTO inventory_movements (id, variant_id, delta, reason, actor_id) VALUES ($1,$2,$3,$4,$5)",
        [uuid(), variantId, b.delta, b.reason, req.user!.id]);
      await audit(tx, req, "inventory.adjust", "variant", variantId, b);
      return next;
    });
    res.json({ variantId, stock });
  }));

  r.get("/inventory/:variantId/movements", staff, ah(async (req, res) => {
    const variantId = parse(z.string().uuid(), req.params.variantId);
    const { rows } = await db.query(
      `SELECT m.delta, m.reason, m.ref, m.created_at AS "createdAt", u.email AS actor FROM inventory_movements m
       LEFT JOIN users u ON u.id = m.actor_id WHERE m.variant_id = $1 ORDER BY m.created_at DESC LIMIT 100`, [variantId]);
    res.json({ items: rows });
  }));

  // ---------- orders ----------
  r.get("/orders", staff, ah(async (req, res) => {
    const q = parse(z.object({ status: z.enum(["paid", "packed", "shipped", "delivered", "cancelled"]).optional(),
      q: z.string().max(100).optional(), from: z.string().date().optional(), to: z.string().date().optional(),
      minTotal: z.coerce.number().int().min(0).optional(), page }), req.query);
    const where: string[] = ["true"];
    const args: unknown[] = [];
    const a = (v: unknown) => { args.push(v); return `$${args.length}`; };
    if (q.status) where.push(`o.fulfilment_status = ${a(q.status)}`);
    if (q.q) where.push(`(o.number ILIKE ${a(`%${q.q}%`)} OR o.email ILIKE $${args.length})`);
    if (q.from) where.push(`o.created_at >= ${a(q.from)}::date`);
    if (q.to) where.push(`o.created_at < (${a(q.to)}::date + 1)`);
    if (q.minTotal !== undefined) where.push(`o.total_cents >= ${a(q.minTotal)}`);
    const { rows } = await db.query(
      `SELECT o.number, o.email, o.fulfilment_status AS status, o.payment_status AS "paymentStatus",
         o.total_cents AS "totalCents", o.created_at AS "createdAt" FROM orders o
       WHERE ${where.join(" AND ")} ORDER BY o.created_at DESC LIMIT 50 OFFSET ${(q.page - 1) * 50}`, args);
    const total = (await db.query(`SELECT count(*)::int AS n FROM orders o WHERE ${where.join(" AND ")}`, args)).rows[0].n;
    res.json({ items: rows, page: q.page, pageSize: 50, total });
  }));

  r.get("/orders/:number", staff, ah(async (req, res) => {
    const { rows } = await db.query("SELECT * FROM orders WHERE number = $1", [req.params.number]);
    if (!rows[0]) throw E.notFound("Order");
    res.json(await orderDetail(db, rows[0]));
  }));

  r.post("/orders/:number/transition", staff, ah(async (req, res) => {
    const b = parse(z.object({ to: z.enum(["packed", "shipped", "delivered"]), trackingNumber: z.string().trim().min(3).max(60).optional() }), req.body);
    if (b.to === "shipped" && !b.trackingNumber) throw E.validation({ trackingNumber: "Required when marking an order shipped" });
    await mutate(db, req, async (tx) => {
      const { rows } = await tx.query("SELECT id, fulfilment_status FROM orders WHERE number = $1 FOR UPDATE", [req.params.number]);
      const o = rows[0];
      if (!o) throw E.notFound("Order");
      if (!(TRANSITIONS[o.fulfilment_status] ?? []).includes(b.to)) {
        throw E.conflict("ILLEGAL_TRANSITION", `Can't move an order from ${o.fulfilment_status} to ${b.to}`,
          `Allowed next steps: ${(TRANSITIONS[o.fulfilment_status] ?? []).join(", ") || "none"}.`);
      }
      await tx.query("UPDATE orders SET fulfilment_status = $2, tracking_number = COALESCE($3, tracking_number), updated_at = now() WHERE id = $1",
        [o.id, b.to, b.trackingNumber ?? null]);
      await tx.query("INSERT INTO order_events (id, order_id, type, detail, actor_id) VALUES ($1,$2,$3,$4,$5)",
        [uuid(), o.id, b.to, b.trackingNumber ?? null, req.user!.id]);
      await audit(tx, req, "order.transition", "order", req.params.number, b);
    });
    const { rows } = await db.query("SELECT * FROM orders WHERE number = $1", [req.params.number]);
    res.json(await orderDetail(db, rows[0]));
  }));

  /** Full cancel: staff may cancel paid/packed orders; refunds the remaining balance and restocks every unit once. */
  r.post("/orders/:number/cancel", staff, ah(async (req, res) => {
    const b = parse(z.object({ operationId: z.string().min(8).max(80), reason: z.string().trim().max(200).optional() }), req.body);
    await mutate(db, req, async (tx) => {
      if ((await tx.query("SELECT 1 FROM refunds WHERE operation_id = $1", [b.operationId])).rowCount) return; // replay
      const { rows } = await tx.query("SELECT * FROM orders WHERE number = $1 FOR UPDATE", [req.params.number]);
      const o = rows[0];
      if (!o) throw E.notFound("Order");
      if (o.fulfilment_status === "cancelled") throw E.conflict("ALREADY_CANCELLED", "This order is already cancelled", "No action needed.");
      if (!["paid", "packed"].includes(o.fulfilment_status)) {
        throw E.conflict("ILLEGAL_TRANSITION", `Can't cancel a ${o.fulfilment_status} order`, "Refund items instead (admin).");
      }
      const items = (await tx.query("SELECT * FROM order_items WHERE order_id = $1 FOR UPDATE", [o.id])).rows;
      const remaining = o.total_cents - o.refunded_cents;
      for (const it of items) {
        const restock = it.quantity - it.restocked_quantity;
        if (restock > 0 && it.variant_id) {
          await tx.query("UPDATE variants SET stock_on_hand = stock_on_hand + $2 WHERE id = $1", [it.variant_id, restock]);
          await tx.query("INSERT INTO inventory_movements (id, variant_id, delta, reason, ref, actor_id) VALUES ($1,$2,$3,'cancel',$4,$5)",
            [uuid(), it.variant_id, restock, o.number, req.user!.id]);
        }
        await tx.query("UPDATE order_items SET restocked_quantity = quantity, refunded_quantity = quantity WHERE id = $1", [it.id]);
      }
      if (remaining > 0) {
        await tx.query("INSERT INTO refunds (id, order_id, operation_id, amount_cents, reason, lines, actor_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [uuid(), o.id, b.operationId, remaining, b.reason ?? "Order cancelled", JSON.stringify(items.map((i) => ({ itemId: i.id, quantity: i.quantity - i.refunded_quantity }))), req.user!.id]);
      }
      await tx.query("UPDATE orders SET fulfilment_status = 'cancelled', payment_status = 'refunded', refunded_cents = total_cents, updated_at = now() WHERE id = $1", [o.id]);
      await tx.query("INSERT INTO order_events (id, order_id, type, detail, actor_id) VALUES ($1,$2,'cancelled',$3,$4)",
        [uuid(), o.id, b.reason ?? null, req.user!.id]);
      await audit(tx, req, "order.cancel", "order", o.number, { refundedCents: remaining });
    });
    const { rows } = await db.query("SELECT * FROM orders WHERE number = $1", [req.params.number]);
    res.json(await orderDetail(db, rows[0]));
  }));

  /** Partial or full refund by line (admin). Discount and tax are prorated; shipping comes back on the final refund. */
  r.post("/orders/:number/refund", admin, ah(async (req, res) => {
    const b = parse(z.object({ operationId: z.string().min(8).max(80), reason: z.string().trim().max(200).optional(),
      restock: z.boolean().default(true),
      lines: z.array(z.object({ itemId: z.string().uuid(), quantity: z.number().int().min(1) })).min(1).max(100) }), req.body);
    await mutate(db, req, async (tx) => {
      if ((await tx.query("SELECT 1 FROM refunds WHERE operation_id = $1", [b.operationId])).rowCount) return; // replay
      const { rows } = await tx.query("SELECT * FROM orders WHERE number = $1 FOR UPDATE", [req.params.number]);
      const o = rows[0];
      if (!o) throw E.notFound("Order");
      const items = new Map((await tx.query("SELECT * FROM order_items WHERE order_id = $1 FOR UPDATE", [o.id])).rows.map((i) => [i.id, i]));
      let refundSub = 0;
      for (const l of b.lines) {
        const it = items.get(l.itemId);
        if (!it) throw E.validation({ lines: `Item ${l.itemId} is not on this order` });
        if (l.quantity > it.quantity - it.refunded_quantity) {
          throw E.conflict("REFUND_EXCEEDS_QUANTITY", `Only ${it.quantity - it.refunded_quantity} of ${it.product_name} can still be refunded`,
            "Lower the quantity.");
        }
        refundSub += it.unit_price_cents * l.quantity;
      }
      const discShare = o.subtotal_cents ? Math.round((o.discount_cents * refundSub) / o.subtotal_cents) : 0;
      const taxable = refundSub - discShare;
      const base = o.subtotal_cents - o.discount_cents;
      const taxShare = base > 0 ? Math.round((o.tax_cents * taxable) / base) : 0;
      let amount = taxable + taxShare;
      const allRefunded = [...items.values()].every((it) => {
        const l = b.lines.find((x) => x.itemId === it.id);
        return it.refunded_quantity + (l?.quantity ?? 0) === it.quantity;
      });
      const balance = o.total_cents - o.refunded_cents;
      if (allRefunded) amount = balance;
      amount = Math.min(amount, balance);
      if (amount <= 0) throw E.conflict("NOTHING_TO_REFUND", "Nothing left to refund on this order", "No action needed.");
      for (const l of b.lines) {
        const it = items.get(l.itemId)!;
        await tx.query("UPDATE order_items SET refunded_quantity = refunded_quantity + $2 WHERE id = $1", [it.id, l.quantity]);
        const restock = b.restock ? Math.min(l.quantity, it.quantity - it.restocked_quantity) : 0;
        if (restock > 0 && it.variant_id) {
          await tx.query("UPDATE order_items SET restocked_quantity = restocked_quantity + $2 WHERE id = $1", [it.id, restock]);
          await tx.query("UPDATE variants SET stock_on_hand = stock_on_hand + $2 WHERE id = $1", [it.variant_id, restock]);
          await tx.query("INSERT INTO inventory_movements (id, variant_id, delta, reason, ref, actor_id) VALUES ($1,$2,$3,'refund',$4,$5)",
            [uuid(), it.variant_id, restock, o.number, req.user!.id]);
        }
      }
      await tx.query("INSERT INTO refunds (id, order_id, operation_id, amount_cents, reason, lines, actor_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [uuid(), o.id, b.operationId, amount, b.reason ?? null, JSON.stringify(b.lines), req.user!.id]);
      const refunded = o.refunded_cents + amount;
      await tx.query("UPDATE orders SET refunded_cents = $2, payment_status = $3, updated_at = now() WHERE id = $1",
        [o.id, refunded, refunded >= o.total_cents ? "refunded" : "partially_refunded"]);
      await tx.query("INSERT INTO order_events (id, order_id, type, detail, actor_id) VALUES ($1,$2,'refunded',$3,$4)",
        [uuid(), o.id, `$${(amount / 100).toFixed(2)}`, req.user!.id]);
      await audit(tx, req, "order.refund", "order", o.number, { amountCents: amount, lines: b.lines });
    });
    const { rows } = await db.query("SELECT * FROM orders WHERE number = $1", [req.params.number]);
    res.json(await orderDetail(db, rows[0]));
  }));

  // ---------- promotions ----------
  r.get("/promotions", admin, ah(async (_req, res) => {
    const { rows } = await db.query(
      `SELECT id, name, code, type, value, scope_kind AS "scopeKind", scope_ids AS "scopeIds", min_subtotal_cents AS "minSubtotalCents",
         starts_at AS "startsAt", ends_at AS "endsAt", usage_limit AS "usageLimit", per_customer_limit AS "perCustomerLimit",
         used_count AS "usedCount", active FROM promotions ORDER BY created_at DESC`);
    res.json({ items: rows });
  }));

  const savePromo = async (req: Request, id: string, isNew: boolean) => {
    const b = parse(promoSchema, req.body);
    await mutate(db, req, async (tx) => {
      if ((await tx.query("SELECT 1 FROM promotions WHERE upper(code) = $1 AND id <> $2", [b.code, id])).rowCount) {
        throw E.validation({ code: "Already used by another promotion" });
      }
      const vals = [id, b.name, b.code, b.type, b.value, b.scopeKind, b.scopeIds, b.minSubtotalCents, b.startsAt ?? null,
        b.endsAt ?? null, b.usageLimit ?? null, b.perCustomerLimit ?? null, b.active];
      if (isNew) {
        await tx.query(`INSERT INTO promotions (id, name, code, type, value, scope_kind, scope_ids, min_subtotal_cents, starts_at, ends_at,
          usage_limit, per_customer_limit, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`, vals);
      } else {
        const u = await tx.query(`UPDATE promotions SET name=$2, code=$3, type=$4, value=$5, scope_kind=$6, scope_ids=$7,
          min_subtotal_cents=$8, starts_at=$9, ends_at=$10, usage_limit=$11, per_customer_limit=$12, active=$13 WHERE id=$1`, vals);
        if (!u.rowCount) throw E.notFound("Promotion");
      }
      await audit(tx, req, isNew ? "promotion.create" : "promotion.update", "promotion", id, { code: b.code });
    });
  };
  r.post("/promotions", admin, ah(async (req, res) => { const id = uuid(); await savePromo(req, id, true); res.status(201).json({ id }); }));
  r.put("/promotions/:id", admin, ah(async (req, res) => { const id = parse(z.string().uuid(), req.params.id); await savePromo(req, id, false); res.json({ id }); }));
  r.delete("/promotions/:id", admin, ah(async (req, res) => {
    const id = parse(z.string().uuid(), req.params.id);
    await mutate(db, req, async (tx) => {
      // Promotions with redemptions are deactivated, not deleted, so order history stays explainable.
      const used = await tx.query("SELECT 1 FROM promotion_redemptions WHERE promotion_id = $1 LIMIT 1", [id]);
      const q = used.rowCount ? "UPDATE promotions SET active = false WHERE id = $1" : "DELETE FROM promotions WHERE id = $1";
      if (!(await tx.query(q, [id])).rowCount) throw E.notFound("Promotion");
      await audit(tx, req, "promotion.delete", "promotion", id);
    });
    res.status(204).end();
  }));

  // ---------- customers ----------
  r.get("/customers", staff, ah(async (req, res) => {
    const q = parse(z.object({ q: z.string().max(100).optional(), page }), req.query);
    const args: unknown[] = [];
    let where = "u.role = 'customer'";
    if (q.q) { args.push(`%${q.q}%`); where += ` AND (u.email ILIKE $1 OR u.name ILIKE $1)`; }
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.name, u.status, u.created_at AS "createdAt",
         count(o.id)::int AS orders, COALESCE(sum(o.total_cents - o.refunded_cents), 0)::int AS "lifetimeValueCents"
       FROM users u LEFT JOIN orders o ON o.user_id = u.id WHERE ${where}
       GROUP BY u.id ORDER BY "lifetimeValueCents" DESC, u.email LIMIT 50 OFFSET ${(q.page - 1) * 50}`, args);
    res.json({ items: rows });
  }));

  r.get("/customers/:id", staff, ah(async (req, res) => {
    const id = parse(z.string().uuid(), req.params.id);
    const { rows } = await db.query("SELECT id, email, name, status, role, created_at AS \"createdAt\" FROM users WHERE id = $1", [id]);
    if (!rows[0] || rows[0].role !== "customer") throw E.notFound("Customer");
    const orders = (await db.query(
      `SELECT number, fulfilment_status AS status, total_cents AS "totalCents", created_at AS "createdAt"
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [id])).rows;
    res.json({ ...rows[0], orders, lifetimeValueCents: orders.reduce((s, o) => s + o.totalCents, 0) });
  }));

  for (const action of ["disable", "enable"] as const) {
    r.post(`/customers/:id/${action}`, admin, ah(async (req, res) => {
      const id = parse(z.string().uuid(), req.params.id);
      await mutate(db, req, async (tx) => {
        const u = await tx.query("UPDATE users SET status = $2 WHERE id = $1 AND role = 'customer'", [id, action === "disable" ? "disabled" : "active"]);
        if (!u.rowCount) throw E.notFound("Customer");
        if (action === "disable") await auth.revokeAll(tx, id);
        await audit(tx, req, `customer.${action}`, "user", id);
      });
      res.json({ id, status: action === "disable" ? "disabled" : "active" });
    }));
  }

  // ---------- settings ----------
  r.get("/settings", staff, ah(async (_req, res) => {
    const { rows } = await db.query("SELECT * FROM store_settings");
    const s = rows[0];
    res.json({ storeName: s.store_name, taxRateBps: s.tax_rate_bps, flatShippingCents: s.flat_shipping_cents,
      freeShippingThresholdCents: s.free_shipping_threshold_cents, lowStockThreshold: s.low_stock_threshold });
  }));

  r.put("/settings", admin, ah(async (req, res) => {
    const b = parse(z.object({ storeName: z.string().trim().min(1).max(80), taxRateBps: z.number().int().min(0).max(5000),
      flatShippingCents: z.number().int().min(0).max(100_000), freeShippingThresholdCents: z.number().int().min(0).max(10_000_000),
      lowStockThreshold: z.number().int().min(0).max(10_000) }), req.body);
    await mutate(db, req, async (tx) => {
      await tx.query(`UPDATE store_settings SET store_name=$1, tax_rate_bps=$2, flat_shipping_cents=$3,
        free_shipping_threshold_cents=$4, low_stock_threshold=$5`,
        [b.storeName, b.taxRateBps, b.flatShippingCents, b.freeShippingThresholdCents, b.lowStockThreshold]);
      await invalidateCatalog(tx);
      await audit(tx, req, "settings.update", "store_settings", null, b);
    });
    res.json(b);
  }));

  // ---------- outbox ----------
  r.get("/outbox", staff, ah(async (_req, res) => {
    const { rows } = await db.query(
      `SELECT id, to_email AS "to", subject, body, kind, ref, created_at AS "createdAt" FROM email_outbox ORDER BY created_at DESC LIMIT 100`);
    res.json({ items: rows });
  }));

  // ---------- product questions ----------
  r.get("/questions", admin, ah(async (_req, res) => {
    const { rows } = await db.query(
      `SELECT q.id, q.question, q.created_at AS "createdAt", p.name AS "productName", p.slug AS "productSlug"
       FROM product_questions q JOIN products p ON p.id = q.product_id
       WHERE q.answer IS NULL ORDER BY q.created_at LIMIT 200`);
    res.json({ items: rows });
  }));

  r.post("/questions/:id/answer", admin, ah(async (req, res) => {
    const id = parse(z.string().uuid(), req.params.id);
    const b = parse(z.object({ answer: z.string().trim().min(1, "Type an answer").max(2000) }), req.body);
    await mutate(db, req, async (tx) => {
      const u = await tx.query(
        "UPDATE product_questions SET answer = $2, answered_by = $3, answered_at = now() WHERE id = $1 AND answer IS NULL",
        [id, b.answer, req.user!.id]);
      if (!u.rowCount) {
        const exists = await tx.query("SELECT 1 FROM product_questions WHERE id = $1", [id]);
        if (!exists.rowCount) throw E.notFound("Question");
        throw E.conflict("QUESTION_ALREADY_ANSWERED", "This question already has an answer", "Reload the list; each question takes one answer.");
      }
      await audit(tx, req, "question.answer", "product_question", id);
    });
    res.json({ id, answered: true });
  }));

  // ---------- system / cache ----------
  r.get("/system", staff, ah(async (_req, res) => {
    const [health, stats] = await Promise.all([healthReport(db, cache, cfg), cacheStats(cache)]);
    res.json({ health, cache: stats });
  }));

  r.post("/cache/flush", admin, ah(async (req, res) => {
    parse(z.object({ confirm: z.literal("FLUSH", { errorMap: () => ({ message: 'Type "FLUSH" to confirm' }) }) }), req.body);
    await mutate(db, req, async (tx) => {
      await invalidateCatalog(tx);
      await audit(tx, req, "cache.flush", "cache", null);
    });
    await flushCategoryCache(cache);
    await cache.run((c) => c.del(cache.key("stats:dashboard")));
    await recordInvalidation(cache, "manual flush");
    res.json({ flushed: true, cache: await cacheStats(cache) });
  }));

  r.post("/demo/reset", admin, ah(async (req, res) => {
    parse(z.object({ confirm: z.literal("RESET", { errorMap: () => ({ message: 'Type "RESET" to confirm' }) }) }), req.body);
    const out = await resetDemo(db, cache, cfg, req.user!.id);
    res.json({ reset: true, ...out });
  }));

  r.get("/audit", admin, ah(async (_req, res) => {
    const { rows } = await db.query(
      `SELECT a.action, a.entity, a.entity_id AS "entityId", a.detail, a.created_at AS "createdAt", u.email AS actor
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 100`);
    res.json({ items: rows });
  }));

  return r;
}

export async function cacheStats(cache: Cache) {
  const out = await cache.run(async (c) => {
    const [hit, miss, bypass] = await c.mget(cache.key("metrics:catalog:hit"), cache.key("metrics:catalog:miss"), cache.key("metrics:catalog:bypass"));
    const inv = await c.lrange(cache.key("metrics:invalidations"), 0, 19);
    const prefixes: Record<string, number> = {};
    let cursor = "0";
    let scanned = 0;
    do {
      const [next, keys] = await c.scan(cursor, "MATCH", `${cache.prefix}*`, "COUNT", 500);
      for (const k of keys) {
        const rest = k.slice(cache.prefix.length);
        const p = rest.startsWith("catalog:") ? `catalog:${rest.split(":")[2] ?? "?"}` : rest.split(":")[0];
        prefixes[p] = (prefixes[p] ?? 0) + 1;
      }
      cursor = next;
      scanned += keys.length;
    } while (cursor !== "0" && scanned < 5000);
    return { hit: Number(hit ?? 0), miss: Number(miss ?? 0), bypass: Number(bypass ?? 0),
      invalidations: inv.map((s) => JSON.parse(s)), keysByPrefix: prefixes };
  });
  if (!out) return { available: false, hit: 0, miss: 0, bypass: 0, hitRate: null as number | null, invalidations: [], keysByPrefix: {} };
  const total = out.hit + out.miss;
  return { available: true, ...out, hitRate: total ? Math.round((out.hit / total) * 1000) / 10 : null };
}

export type _Unused = ApiError;
