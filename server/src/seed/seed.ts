import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { priceCart } from "@pocket/shared";
import type { Tx } from "../db/pool";
import type { Config } from "../lib/config";
import { CATEGORIES, FIRST_NAMES, LAST_NAMES, PRODUCTS, slugify } from "./catalog";

export const FIXTURE_PASSWORD = "demo1234";

/** Deterministic ids derived from a natural key, so reseeding produces identical rows. */
export function stableId(ns: string, key: string): string {
  const h = createHash("sha256").update(`${ns}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** mulberry32: small deterministic PRNG. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tables a demo reset truncates. Never app_meta or schema_migrations. */
export const RESET_TABLES = [
  "audit_log", "product_questions", "email_outbox", "order_access_tokens", "promotion_redemptions", "refunds", "payment_attempts",
  "order_events", "order_items", "orders", "idempotency_keys", "cart_items", "carts", "promotions",
  "store_settings", "inventory_movements", "variants", "product_images", "products", "categories",
  "addresses", "refresh_tokens", "users",
];

/**
 * Admin/staff passwords. In production they come only from SEED_ADMIN_PASSWORD / SEED_STAFF_PASSWORD;
 * a missing one means that account is not created (the storefront still works). Elsewhere the fixture is used.
 */
export function seedPasswords(cfg: Pick<Config, "appEnv" | "seedAdminPassword" | "seedStaffPassword">) {
  if (cfg.appEnv === "production") return { admin: cfg.seedAdminPassword, staff: cfg.seedStaffPassword };
  return { admin: cfg.seedAdminPassword ?? FIXTURE_PASSWORD, staff: cfg.seedStaffPassword ?? FIXTURE_PASSWORD };
}

/**
 * Create or update the admin/staff accounts from the current passwords (run at startup), so setting or
 * rotating SEED_*_PASSWORD in Render takes effect on the next restart.
 */
export async function ensureStaffAccounts(tx: Tx, cfg: Pick<Config, "appEnv" | "seedAdminPassword" | "seedStaffPassword">) {
  const pw = seedPasswords(cfg);
  const accounts = [
    { email: "admin@shop.test", name: "Ada Admin", role: "admin", password: pw.admin },
    { email: "staff@shop.test", name: "Sid Staff", role: "staff", password: pw.staff },
  ];
  const missing: string[] = [];
  for (const a of accounts) {
    if (!a.password) { missing.push(a.role === "admin" ? "SEED_ADMIN_PASSWORD" : "SEED_STAFF_PASSWORD"); continue; }
    const { rows } = await tx.query("SELECT password_hash FROM users WHERE email = $1", [a.email]);
    if (rows[0] && (await bcrypt.compare(a.password, rows[0].password_hash))) continue;
    const hash = await bcrypt.hash(a.password, 10);
    await tx.query(
      `INSERT INTO users (id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, token_version = users.token_version + 1`,
      [stableId("user", a.email), a.email, hash, a.name, a.role]);
  }
  return missing;
}

export async function truncateAll(tx: Tx) {
  await tx.query(`TRUNCATE ${RESET_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  await tx.query("ALTER SEQUENCE order_number_seq RESTART WITH 10001");
}

export async function seedDatabase(
  tx: Tx,
  cfg: Pick<Config, "appEnv" | "seedAdminPassword" | "seedStaffPassword" | "seedScale">,
  now = new Date(),
) {
  const pw = seedPasswords(cfg);
  const rand = prng(20261020);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const small = cfg.seedScale === "small";

  await tx.query("INSERT INTO store_settings DEFAULT VALUES ON CONFLICT DO NOTHING");

  // Users: the fixture hash is computed once; bcrypt cost 10.
  const fixtureHash = await bcrypt.hash(FIXTURE_PASSWORD, 10);
  const users: Array<{ email: string; name: string; role: string; hash: string }> = [];
  if (pw.admin) users.push({ email: "admin@shop.test", name: "Ada Admin", role: "admin",
    hash: pw.admin === FIXTURE_PASSWORD ? fixtureHash : await bcrypt.hash(pw.admin, 10) });
  if (pw.staff) users.push({ email: "staff@shop.test", name: "Sid Staff", role: "staff",
    hash: pw.staff === FIXTURE_PASSWORD ? fixtureHash : await bcrypt.hash(pw.staff, 10) });
  users.push({ email: "demo@shop.test", name: "Demo Customer", role: "customer", hash: fixtureHash });
  const customerCount = small ? 5 : 25;
  for (let i = 0; i < customerCount; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 7) % LAST_NAMES.length];
    users.push({ email: `${first}.${last}${i}@example.com`.toLowerCase(), name: `${first} ${last}`, role: "customer", hash: fixtureHash });
  }
  for (const u of users) {
    await tx.query("INSERT INTO users (id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,$5)",
      [stableId("user", u.email), u.email, u.hash, u.name, u.role]);
  }
  const customerIds = users.filter((u) => u.role === "customer").map((u) => stableId("user", u.email));
  await tx.query(
    `INSERT INTO addresses (id, user_id, name, line1, city, region, postcode) VALUES ($1,$2,'Demo Customer','1 Market St','San Francisco','CA','94105')`,
    [stableId("address", "demo"), stableId("user", "demo@shop.test")],
  );

  // Catalog
  const catIds: Record<string, string> = {};
  for (const [i, c] of CATEGORIES.entries()) {
    catIds[c.slug] = stableId("category", c.slug);
    await tx.query("INSERT INTO categories (id, slug, name, sort, featured) VALUES ($1,$2,$3,$4,$5)",
      [catIds[c.slug], c.slug, c.name, i, c.featured]);
  }
  const variants: Array<{ id: string; productId: string; categoryId: string; price: number; label: string; sku: string; name: string }> = [];
  const products = small ? PRODUCTS.slice(0, 16) : PRODUCTS;
  for (const [i, p] of products.entries()) {
    const slug = slugify(p.name);
    const pid = stableId("product", slug);
    // Spread creation times so "new arrivals" ordering is stable.
    const createdAt = new Date(now.getTime() - (products.length - i) * 86_400_000);
    await tx.query(
      `INSERT INTO products (id, slug, name, description, category_id, featured, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
      [pid, slug, p.name, p.description, catIds[p.category], p.featured ?? false, createdAt],
    );
    await tx.query("INSERT INTO product_images (id, product_id, url, alt) VALUES ($1,$2,$3,$4)",
      [stableId("image", slug), pid, `products/${slug}.svg`, p.name]);
    const sizes = p.sizes ?? [null];
    const colours = p.colours ?? [null];
    for (const colour of colours) {
      for (const size of sizes) {
        const sku = [slug, colour, size].filter(Boolean).join("-").toUpperCase().replace(/[^A-Z0-9-]/g, "");
        const vid = stableId("variant", sku);
        // A few deliberately low or zero stock variants make the low-stock views interesting.
        const r = rand();
        const stock = r < 0.05 ? 0 : r < 0.15 ? 2 + Math.floor(rand() * 3) : 15 + Math.floor(rand() * 40);
        await tx.query(
          `INSERT INTO variants (id, product_id, sku, size, colour, price_cents, compare_at_cents, stock_on_hand)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [vid, pid, sku, size, colour, p.price, p.compareAt ?? null, stock],
        );
        variants.push({ id: vid, productId: pid, categoryId: catIds[p.category], price: p.price, sku, name: p.name,
          label: [colour, size].filter(Boolean).join(" / ") || "One size" });
      }
    }
  }

  // Promotions
  const promos = [
    { code: "WELCOME10", name: "10% off your order", type: "percentage", value: 10, min: 0 },
    { code: "FREESHIP", name: "Free shipping", type: "free_shipping", value: 0, min: 2000 },
    { code: "HOODIES20", name: "20% off tops", type: "percentage", value: 20, min: 0, scope: [catIds.tops] },
    { code: "SAVE15", name: "$15 off $100+", type: "fixed", value: 1500, min: 10000 },
  ];
  for (const p of promos) {
    await tx.query(
      `INSERT INTO promotions (id, name, code, type, value, scope_kind, scope_ids, min_subtotal_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [stableId("promo", p.code), p.name, p.code, p.type, p.value, p.scope ? "categories" : "all", p.scope ?? [], p.min],
    );
  }

  // Historical orders over the last 30 days (relative to seed time) so dashboard windows have data.
  const settings = { taxRateBps: 825, flatShippingCents: 599, freeShippingThresholdCents: 7500 };
  const orderCount = small ? 12 : 120;
  const statuses = ["delivered", "delivered", "delivered", "shipped", "packed", "paid"] as const;
  for (let i = 0; i < orderCount; i++) {
    const userId = customerIds[Math.floor(rand() * customerIds.length)];
    const email = users.find((u) => stableId("user", u.email) === userId)!.email;
    const lineCount = 1 + Math.floor(rand() * 3);
    const chosen = new Map<string, { v: (typeof variants)[number]; qty: number }>();
    for (let j = 0; j < lineCount; j++) {
      const v = pick(variants);
      chosen.set(v.id, { v, qty: 1 + Math.floor(rand() * 2) });
    }
    const lines = [...chosen.values()];
    const t = priceCart(lines.map(({ v, qty }) => ({ variantId: v.id, productId: v.productId, categoryId: v.categoryId,
      unitPriceCents: v.price, quantity: qty })), settings);
    const daysAgo = Math.floor((i / orderCount) * 30);
    const createdAt = new Date(now.getTime() - daysAgo * 86_400_000 - Math.floor(rand() * 20) * 3_600_000);
    const status = daysAgo < 2 ? (i % 2 ? "paid" : "packed") : statuses[Math.floor(rand() * statuses.length)];
    const oid = stableId("order", String(i));
    await tx.query(
      `INSERT INTO orders (id, number, user_id, email, fulfilment_status, subtotal_cents, discount_cents, shipping_cents,
        tax_cents, total_cents, shipping_address, tracking_number, created_at, updated_at)
       VALUES ($1, 'PS-' || nextval('order_number_seq'), $2,$3,$4,$5,0,$6,$7,$8,$9,$10,$11,$11)`,
      [oid, userId, email, status, t.subtotalCents, t.shippingCents, t.taxCents, t.totalCents,
        { name: "Customer", line1: "1 Demo Way", city: "Portland", region: "OR", postcode: "97201", country: "US" },
        status === "shipped" || status === "delivered" ? `1Z${String(100000 + i)}` : null, createdAt],
    );
    for (const { v, qty } of lines) {
      await tx.query(
        `INSERT INTO order_items (id, order_id, variant_id, product_id, product_name, variant_label, sku, unit_price_cents,
          quantity, line_total_cents) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [stableId("order_item", `${i}:${v.id}`), oid, v.id, v.productId, v.name, v.label, v.sku, v.price, qty, v.price * qty],
      );
    }
    await tx.query("INSERT INTO order_events (id, order_id, type, created_at) VALUES ($1,$2,'placed',$3)",
      [stableId("order_event", String(i)), oid, createdAt]);
  }
  return { users: users.length, products: products.length, variants: variants.length, orders: orderCount };
}
