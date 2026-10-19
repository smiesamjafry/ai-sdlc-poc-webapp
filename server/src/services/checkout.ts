import { priceCart } from "@pocket/shared";
import type { Request } from "express";
import { z } from "zod";
import type { Db, Tx } from "../db/pool";
import { withTx } from "../db/pool";
import { ApiError, E, problemBody } from "../lib/errors";
import { randomToken, sha256, uuid } from "../lib/ids";
import { fenceEpoch } from "./auth";
import { cartLines, findCart, guestTokenHash, insufficientStock, storeSettings, totalsView, variantLabel } from "./cart";
import { charge } from "./payments";
import { loadValidPromotion, toPromotion } from "./promotions";

/*
 * Checkout, in order:
 *
 *   reserve (principal, Idempotency-Key)      own statement; a duplicate gets the first result
 *        │
 *   BEGIN ── app_meta FOR SHARE (reset fence) ── cart FOR UPDATE ── variants ORDER BY id FOR UPDATE
 *        │                                                        └─ promotion FOR UPDATE
 *        ├─ stock check → 409 INSUFFICIENT_STOCK
 *        ├─ coupon check + conditional used_count update → 422 COUPON_INVALID
 *        ├─ priceCart() → mock charge (in-process, no side effects)
 *        │      └─ decline → ROLLBACK, then record the failed attempt in its own transaction → 402
 *        └─ order, items, events, payment, redemption, outbox, stock decrement, clear cart → COMMIT
 */

export const addressSchema = z.object({
  name: z.string().trim().min(1).max(100),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().max(100).optional().nullable(),
  postcode: z.string().trim().min(1).max(20),
  country: z.string().trim().length(2).default("US"),
});

export const checkoutSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  shippingAddress: addressSchema,
  card: z.object({
    number: z.string().transform((s) => s.replace(/[\s-]/g, "")).pipe(z.string().regex(/^\d{16}$/, "Card number must be 16 digits")),
    expiry: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Use MM/YY"),
    cvc: z.string().regex(/^\d{3,4}$/, "3 or 4 digits"),
  }),
});

type CheckoutInput = z.infer<typeof checkoutSchema>;

class Declined extends Error {
  constructor(readonly reason: string, readonly amount: number, readonly last4: string) { super(reason); }
}

export interface CheckoutResult { status: number; body: unknown }

function principalOf(req: Request): string {
  if (req.user) return `user:${req.user.id}`;
  const token = req.header("x-cart-token");
  if (!token) throw E.validation({ "X-Cart-Token": "Required for guest checkout" });
  return `guest:${guestTokenHash(token)}`;
}

/** Card details are part of the hash, so a new card means a new Idempotency-Key. */
function requestHash(input: CheckoutInput) {
  return sha256(JSON.stringify(input));
}

export async function checkout(db: Db, req: Request, raw: unknown): Promise<CheckoutResult> {
  const key = req.header("idempotency-key");
  if (!key || !/^[A-Za-z0-9-]{8,80}$/.test(key)) {
    throw E.validation({ "Idempotency-Key": "Send a unique key (8-80 letters, digits or dashes) per payment attempt" });
  }
  const input = checkoutSchema.parse(raw);
  const principal = principalOf(req);
  const hash = requestHash(input);

  const reserved = await reserve(db, principal, key, hash);
  if (reserved) return reserved;

  try {
    const body = await withTx(db, (tx) => placeOrder(tx, req, input, principal, key), 2);
    return { status: 201, body };
  } catch (err) {
    if (err instanceof Declined) {
      const problem = E.paymentDeclined(err.reason);
      const body = problemBody(problem.p, req.id);
      await withTx(db, async (tx) => {
        await tx.query(
          `INSERT INTO payment_attempts (id, principal, idempotency_key, status, amount_cents, card_last4, decline_reason)
           VALUES ($1,$2,$3,'failed',$4,$5,$6)`, [uuid(), principal, key, err.amount, err.last4, err.reason]);
        await tx.query(
          "UPDATE idempotency_keys SET status = 'failed', response = $3 WHERE principal = $1 AND key = $2",
          [principal, key, { status: 402, body }]);
      });
      throw problem;
    }
    // Anything else wrote nothing: release the key so the same request can be retried.
    await db.query("DELETE FROM idempotency_keys WHERE principal = $1 AND key = $2 AND status = 'pending'", [principal, key]);
    throw err;
  }
}

/** Returns a stored result for a replayed key, or null when this request owns the key. */
async function reserve(db: Db, principal: string, key: string, hash: string): Promise<CheckoutResult | null> {
  for (let i = 0; i < 50; i++) {
    const ins = await db.query(
      `INSERT INTO idempotency_keys (principal, key, request_hash) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING key`,
      [principal, key, hash]);
    if (ins.rowCount) return null;
    const { rows } = await db.query(
      "SELECT request_hash, status, response, created_at FROM idempotency_keys WHERE principal = $1 AND key = $2",
      [principal, key]);
    const row = rows[0];
    if (!row) continue; // released between our insert and select; try again
    if (row.request_hash !== hash) {
      throw E.conflict("IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was used for a different request",
        "Generate a new Idempotency-Key for a new payment attempt (for example after changing the card).");
    }
    if (row.status !== "pending") {
      const stored = row.response as { status: number; body: unknown };
      if (stored.status >= 400) {
        const b = stored.body as { code: string; title: string; detail: string; fix: string };
        throw new ApiError({ status: stored.status, code: b.code, title: b.title, detail: b.detail, fix: b.fix });
      }
      return { status: 200, body: stored.body };
    }
    // Another request with this key is in flight. Take over if it was abandoned (crash), else wait.
    if (Date.now() - new Date(row.created_at).getTime() > 60_000) {
      const t = await db.query(
        `UPDATE idempotency_keys SET created_at = now() WHERE principal = $1 AND key = $2 AND status = 'pending'
         AND created_at < now() - interval '60 seconds' RETURNING key`, [principal, key]);
      if (t.rowCount) return null;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new ApiError({ status: 409, code: "CHECKOUT_IN_PROGRESS", title: "This checkout is still being processed",
    retryable: true, retryAfterSec: 2, fix: "Wait 2 seconds and resend the same request with the same Idempotency-Key." });
}

async function placeOrder(tx: Tx, req: Request, input: CheckoutInput, principal: string, key: string) {
  await fenceEpoch(tx, req.user);
  const cart = await findCart(tx, req, { lock: true });
  if (!cart) throw cartEmpty();
  const lines = (await cartLines(tx, cart.id)).filter((l) => l.status === "active");
  if (!lines.length) throw cartEmpty();

  // Lock variants in a fixed order so concurrent checkouts can't deadlock each other.
  const ids = lines.map((l) => l.variant_id).sort();
  const { rows: locked } = await tx.query(
    "SELECT id, stock_on_hand FROM variants WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", [ids]);
  const stock = new Map(locked.map((r) => [r.id, r.stock_on_hand as number]));
  const short = lines.filter((l) => (stock.get(l.variant_id) ?? 0) < l.quantity);
  if (short.length) {
    const first = short[0];
    const err = insufficientStock(stock.get(first.variant_id) ?? 0);
    err.p.extra = { ...err.p.extra, items: short.map((l) => ({ variantId: l.variant_id, name: l.name,
      requested: l.quantity, available: stock.get(l.variant_id) ?? 0 })) };
    err.p.detail = `${first.name} (${variantLabel(first)}): ${err.p.detail}`;
    throw err;
  }

  const settings = await storeSettings(tx);
  const priceLines = lines.map((l) => ({ variantId: l.variant_id, productId: l.product_id, categoryId: l.category_id,
    unitPriceCents: l.price_cents, quantity: l.quantity }));
  const subtotal = priceLines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const customerKey = req.user ? `user:${req.user.id}` : `email:${input.email}`;
  let promo = null;
  if (cart.couponCode) {
    promo = await loadValidPromotion(tx, cart.couponCode, { subtotalCents: subtotal, customerKey, lock: true });
    const used = await tx.query(
      "UPDATE promotions SET used_count = used_count + 1 WHERE id = $1 AND (usage_limit IS NULL OR used_count < usage_limit)",
      [promo.id]);
    if (!used.rowCount) throw E.conflict("COUPON_LIMIT_REACHED", `"${promo.code}" has reached its usage limit`, "Remove the code and try again.");
  }
  const totals = priceCart(priceLines, settings, promo ? toPromotion(promo) : null);

  const result = charge(input.card.number, totals.totalCents);
  if (!result.ok) throw new Declined(result.reason, totals.totalCents, input.card.number.slice(-4));

  const orderId = uuid();
  const accessToken = req.user ? null : randomToken(24);
  const { rows: o } = await tx.query(
    `INSERT INTO orders (id, number, user_id, email, subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents,
       coupon_code, shipping_address, idempotency_principal, idempotency_key)
     VALUES ($1, 'PS-' || nextval('order_number_seq'), $2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING number, created_at`,
    [orderId, req.user?.id ?? null, input.email, totals.subtotalCents, totals.discountCents, totals.shippingCents,
      totals.taxCents, totals.totalCents, promo?.code ?? null, input.shippingAddress, principal, key]);
  const number: string = o[0].number;
  for (const [i, l] of lines.entries()) {
    await tx.query(
      `INSERT INTO order_items (id, order_id, variant_id, product_id, product_name, variant_label, sku, unit_price_cents,
         quantity, line_total_cents) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [uuid(), orderId, l.variant_id, l.product_id, l.name, variantLabel(l), l.sku, l.price_cents, l.quantity,
        totals.lines[i].lineTotalCents]);
    await tx.query("UPDATE variants SET stock_on_hand = stock_on_hand - $2 WHERE id = $1", [l.variant_id, l.quantity]);
    await tx.query("INSERT INTO inventory_movements (id, variant_id, delta, reason, ref) VALUES ($1,$2,$3,'sale',$4)",
      [uuid(), l.variant_id, -l.quantity, number]);
  }
  await tx.query("INSERT INTO order_events (id, order_id, type) VALUES ($1,$2,'placed')", [uuid(), orderId]);
  await tx.query(
    `INSERT INTO payment_attempts (id, principal, idempotency_key, order_id, status, amount_cents, card_last4)
     VALUES ($1,$2,$3,$4,'succeeded',$5,$6)`, [uuid(), principal, key, orderId, totals.totalCents, input.card.number.slice(-4)]);
  if (promo) {
    await tx.query("INSERT INTO promotion_redemptions (id, promotion_id, order_id, customer_key) VALUES ($1,$2,$3,$4)",
      [uuid(), promo.id, orderId, customerKey]);
  }
  if (accessToken) {
    await tx.query("INSERT INTO order_access_tokens (order_id, token_hash) VALUES ($1,$2)", [orderId, sha256(accessToken)]);
  }
  await tx.query(
    "INSERT INTO email_outbox (id, to_email, subject, body, kind, ref) VALUES ($1,$2,$3,$4,'order_confirmation',$5)",
    [uuid(), input.email, `Your ${settings.storeName} order ${number}`,
      `Thanks for your order ${number}. Total charged: $${(totals.totalCents / 100).toFixed(2)}.`, number]);
  await tx.query("DELETE FROM cart_items WHERE cart_id = $1", [cart.id]);
  await tx.query("UPDATE carts SET coupon_code = NULL, revision = revision + 1, updated_at = now() WHERE id = $1", [cart.id]);

  const body = {
    order: { number, email: input.email, createdAt: o[0].created_at, totals: totalsView(totals),
      items: lines.map((l, i) => ({ name: l.name, variantLabel: variantLabel(l), quantity: l.quantity,
        lineTotalCents: totals.lines[i].lineTotalCents })) },
    accessToken,
  };
  await tx.query("UPDATE idempotency_keys SET status = 'succeeded', response = $3 WHERE principal = $1 AND key = $2",
    [principal, key, { status: 201, body }]);
  return body;
}

const cartEmpty = () => new ApiError({ status: 422, code: "CART_EMPTY", title: "Your cart is empty",
  fix: "Add at least one in-stock item to the cart before checking out." });
