import { priceCart, type Totals } from "@pocket/shared";
import type { Request } from "express";
import type { Db, Tx } from "../db/pool";
import { ApiError, E } from "../lib/errors";
import { randomToken, sha256, uuid } from "../lib/ids";
import { loadValidPromotion, toPromotion } from "./promotions";

export interface CartRef { id: string; userId: string | null; couponCode: string | null; revision: number }

export const guestTokenHash = (token: string) => sha256(`cart:${token}`);

/** Find the caller's cart: signed-in users by user id, guests by the X-Cart-Token header. */
export async function findCart(db: Db | Tx, req: Request, opts: { lock?: boolean } = {}): Promise<CartRef | null> {
  const lock = opts.lock ? "FOR UPDATE" : "";
  if (req.user) {
    const { rows } = await db.query(`SELECT * FROM carts WHERE user_id = $1 ${lock}`, [req.user.id]);
    return rows[0] ? toRef(rows[0]) : null;
  }
  const token = req.header("x-cart-token");
  if (!token) return null;
  const { rows } = await db.query(`SELECT * FROM carts WHERE guest_token = $1 AND status = 'open' ${lock}`, [guestTokenHash(token)]);
  return rows[0] ? toRef(rows[0]) : null;
}

const toRef = (r: { id: string; user_id: string | null; coupon_code: string | null; revision: number }): CartRef =>
  ({ id: r.id, userId: r.user_id, couponCode: r.coupon_code, revision: r.revision });

export async function findOrCreateCart(tx: Tx, req: Request): Promise<{ cart: CartRef; newToken?: string }> {
  const existing = await findCart(tx, req, { lock: true });
  if (existing) return { cart: existing };
  if (req.user) {
    const { rows } = await tx.query(
      `INSERT INTO carts (id, user_id) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING *`,
      [uuid(), req.user.id]);
    return { cart: toRef(rows[0]) };
  }
  const token = randomToken(24);
  const { rows } = await tx.query("INSERT INTO carts (id, guest_token) VALUES ($1,$2) RETURNING *", [uuid(), guestTokenHash(token)]);
  return { cart: toRef(rows[0]), newToken: token };
}

export async function storeSettings(db: Db | Tx) {
  const { rows } = await db.query("SELECT * FROM store_settings");
  const s = rows[0];
  return { taxRateBps: s.tax_rate_bps, flatShippingCents: s.flat_shipping_cents,
    freeShippingThresholdCents: s.free_shipping_threshold_cents, storeName: s.store_name as string };
}

export interface CartLineRow {
  variant_id: string; quantity: number; product_id: string; category_id: string | null; price_cents: number;
  compare_at_cents: number | null; stock_on_hand: number; sku: string; size: string | null; colour: string | null;
  name: string; slug: string; status: string; image: string | null;
}

export async function cartLines(db: Db | Tx, cartId: string): Promise<CartLineRow[]> {
  const { rows } = await db.query(
    `SELECT ci.variant_id, ci.quantity, p.id AS product_id, p.category_id, v.price_cents, v.compare_at_cents,
       v.stock_on_hand, v.sku, v.size, v.colour, p.name, p.slug, p.status,
       (SELECT url FROM product_images i WHERE i.product_id = p.id ORDER BY sort LIMIT 1) AS image
     FROM cart_items ci JOIN variants v ON v.id = ci.variant_id JOIN products p ON p.id = v.product_id
     WHERE ci.cart_id = $1 ORDER BY p.name, v.sku`, [cartId]);
  return rows;
}

export const variantLabel = (l: { size: string | null; colour: string | null }) =>
  [l.colour, l.size].filter(Boolean).join(" / ") || "One size";

/** Full cart view with server-calculated totals. An invalid coupon is reported, not applied. */
export async function cartView(db: Db | Tx, cart: CartRef | null, customerKey: string | null) {
  const settings = await storeSettings(db);
  if (!cart) return emptyView(settings);
  const rows = (await cartLines(db, cart.id)).filter((l) => l.status === "active");
  const lines = rows.map((l) => ({ variantId: l.variant_id, productId: l.product_id, categoryId: l.category_id,
    unitPriceCents: l.price_cents, quantity: l.quantity }));
  const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  let promo = null;
  let couponError: string | null = null;
  if (cart.couponCode) {
    try {
      promo = await loadValidPromotion(db, cart.couponCode, { subtotalCents: subtotal, customerKey });
    } catch (err) {
      couponError = err instanceof ApiError ? (err.p.detail ?? err.p.title) : "Code unavailable";
    }
  }
  const totals = priceCart(lines, settings, promo ? toPromotion(promo) : null);
  return {
    id: cart.id,
    revision: cart.revision,
    items: rows.map((l, i) => ({
      variantId: l.variant_id, productSlug: l.slug, name: l.name, variantLabel: variantLabel(l), sku: l.sku,
      image: l.image, unitPriceCents: l.price_cents, quantity: l.quantity,
      lineTotalCents: totals.lines[i].lineTotalCents, stock: l.stock_on_hand,
      overStock: l.quantity > l.stock_on_hand,
    })),
    coupon: cart.couponCode ? { code: cart.couponCode, applied: !!promo, error: couponError,
      label: promo?.name ?? null } : null,
    totals: totalsView(totals),
    settings: { freeShippingThresholdCents: settings.freeShippingThresholdCents },
    itemCount: rows.reduce((s, l) => s + l.quantity, 0),
  };
}

function emptyView(settings: { freeShippingThresholdCents: number }) {
  return { id: null, revision: 0, items: [], coupon: null, itemCount: 0,
    totals: { subtotalCents: 0, discountCents: 0, shippingCents: 0, freeShipping: false, taxCents: 0, totalCents: 0 },
    settings: { freeShippingThresholdCents: settings.freeShippingThresholdCents } };
}

export const totalsView = (t: Totals) => ({ subtotalCents: t.subtotalCents, discountCents: t.discountCents,
  shippingCents: t.shippingCents, freeShipping: t.freeShipping, taxCents: t.taxCents, totalCents: t.totalCents });

export async function availableStock(db: Db | Tx, variantId: string) {
  const { rows } = await db.query(
    `SELECT v.stock_on_hand, p.status FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = $1`, [variantId]);
  if (!rows[0] || rows[0].status !== "active") throw E.notFound("Product variant");
  return rows[0].stock_on_hand as number;
}

export const insufficientStock = (available: number) => new ApiError({
  status: 409, code: "INSUFFICIENT_STOCK", title: "Not enough stock",
  detail: available === 0 ? "This item is out of stock." : `Only ${available} left.`,
  fix: available === 0 ? "Remove the item or choose another size or colour." : `Set the quantity to ${available} or less.`,
  extra: { available },
});

/** Merge a guest cart into the signed-in user's cart in one transaction; the guest token stops working. */
export async function mergeGuestCart(tx: Tx, userId: string, guestToken: string) {
  const { rows: g } = await tx.query(
    "SELECT * FROM carts WHERE guest_token = $1 AND status = 'open' FOR UPDATE", [guestTokenHash(guestToken)]);
  if (!g[0]) return;
  const { rows: u } = await tx.query(
    `INSERT INTO carts (id, user_id) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING *`,
    [uuid(), userId]);
  const target = u[0];
  await tx.query("SELECT 1 FROM carts WHERE id = $1 FOR UPDATE", [target.id]);
  await tx.query(
    `INSERT INTO cart_items (cart_id, variant_id, quantity)
       SELECT $1, gi.variant_id, LEAST(gi.quantity, GREATEST(v.stock_on_hand, 1)) FROM cart_items gi
       JOIN variants v ON v.id = gi.variant_id WHERE gi.cart_id = $2
     ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity =
       LEAST(cart_items.quantity + EXCLUDED.quantity,
             GREATEST((SELECT stock_on_hand FROM variants WHERE id = EXCLUDED.variant_id), 1))`,
    [target.id, g[0].id]);
  if (g[0].coupon_code && !target.coupon_code) {
    await tx.query("UPDATE carts SET coupon_code = $1 WHERE id = $2", [g[0].coupon_code, target.id]);
  }
  await tx.query("UPDATE carts SET revision = revision + 1, updated_at = now() WHERE id = $1", [target.id]);
  // Deleting the guest cart (and its items) makes the old token useless.
  await tx.query("DELETE FROM carts WHERE id = $1", [g[0].id]);
}
