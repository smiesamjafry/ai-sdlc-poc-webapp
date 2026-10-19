import { Router } from "express";
import { z } from "zod";
import type { Db } from "../db/pool";
import { withTx } from "../db/pool";
import type { Cache } from "../cache/redis";
import type { Config } from "../lib/config";
import { E } from "../lib/errors";
import { sha256, uuid } from "../lib/ids";
import { ah, parse } from "../middleware/common";
import { rateLimit } from "../middleware/rateLimit";
import { AuthService, fenceEpoch, publicUser, requireUser } from "../services/auth";
import { availableStock, cartView, findCart, findOrCreateCart, insufficientStock, mergeGuestCart } from "../services/cart";
import { checkout, addressSchema } from "../services/checkout";
import { loadValidPromotion } from "../services/promotions";
import bcrypt from "bcryptjs";

const customerKeyOf = (req: Express.Request) => (req.user ? `user:${req.user.id}` : null);

export function shopRouter(db: Db, cache: Cache, cfg: Config, auth: AuthService) {
  const r = Router();
  const loginLimit = rateLimit(cache, "login", () => cfg.loginRateLimit);

  // ---------- auth ----------
  r.post("/auth/register", loginLimit, ah(async (req, res) => {
    const b = parse(z.object({ email: z.string().trim().toLowerCase().email().max(200),
      password: z.string().min(8, "Use at least 8 characters").max(200), name: z.string().trim().min(1).max(100) }), req.body);
    const exists = await db.query("SELECT 1 FROM users WHERE email = $1", [b.email]);
    if (exists.rowCount) throw E.conflict("EMAIL_TAKEN", "An account with this email already exists", "Sign in instead, or use another email.");
    const id = uuid();
    await db.query("INSERT INTO users (id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,'customer')",
      [id, b.email, await bcrypt.hash(b.password, 10), b.name]);
    const tokens = await auth.issue({ id, role: "customer", token_version: 1 });
    res.status(201).json({ user: { id, email: b.email, name: b.name, role: "customer" }, ...tokens });
  }));

  r.post("/auth/login", loginLimit, ah(async (req, res) => {
    const b = parse(z.object({ email: z.string().max(200), password: z.string().max(200) }), req.body);
    res.json(await auth.login(b.email, b.password));
  }));

  r.post("/auth/refresh", ah(async (req, res) => {
    const b = parse(z.object({ refreshToken: z.string().min(10).max(200) }), req.body);
    res.json(await auth.refresh(b.refreshToken));
  }));

  r.post("/auth/logout", ah(async (req, res) => {
    const b = parse(z.object({ refreshToken: z.string().max(200).optional() }), req.body ?? {});
    if (b.refreshToken) await auth.logout(b.refreshToken);
    res.status(204).end();
  }));

  r.get("/me", requireUser, ah(async (req, res) => {
    res.json({ user: publicUser(req.user!) });
  }));

  r.patch("/me", requireUser, ah(async (req, res) => {
    const b = parse(z.object({ name: z.string().trim().min(1).max(100) }), req.body);
    await db.query("UPDATE users SET name = $2 WHERE id = $1", [req.user!.id, b.name]);
    res.json({ user: { ...publicUser(req.user!), name: b.name } });
  }));

  // ---------- addresses ----------
  r.get("/me/addresses", requireUser, ah(async (req, res) => {
    const { rows } = await db.query(
      `SELECT id, label, name, line1, line2, city, region, postcode, country FROM addresses WHERE user_id = $1 ORDER BY created_at`,
      [req.user!.id]);
    res.json({ items: rows });
  }));
  r.post("/me/addresses", requireUser, ah(async (req, res) => {
    const a = parse(addressSchema.extend({ label: z.string().trim().max(40).default("Home") }), req.body);
    const id = uuid();
    await db.query(
      `INSERT INTO addresses (id, user_id, label, name, line1, line2, city, region, postcode, country)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, req.user!.id, a.label, a.name, a.line1, a.line2 ?? null, a.city, a.region ?? null, a.postcode, a.country]);
    res.status(201).json({ id, ...a });
  }));
  r.delete("/me/addresses/:id", requireUser, ah(async (req, res) => {
    const id = parse(z.string().uuid(), req.params.id);
    const d = await db.query("DELETE FROM addresses WHERE id = $1 AND user_id = $2", [id, req.user!.id]);
    if (!d.rowCount) throw E.notFound("Address");
    res.status(204).end();
  }));

  // ---------- cart ----------
  r.get("/cart", ah(async (req, res) => {
    res.json(await cartView(db, await findCart(db, req), customerKeyOf(req)));
  }));

  r.post("/cart/items", ah(async (req, res) => {
    const b = parse(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(99).default(1) }), req.body);
    const { cart, newToken } = await withTx(db, async (tx) => {
      await fenceEpoch(tx, req.user);
      const out = await findOrCreateCart(tx, req);
      const stock = await availableStock(tx, b.variantId);
      const { rows } = await tx.query("SELECT quantity FROM cart_items WHERE cart_id = $1 AND variant_id = $2",
        [out.cart.id, b.variantId]);
      const next = (rows[0]?.quantity ?? 0) + b.quantity;
      if (next > stock) throw insufficientStock(stock);
      await tx.query(
        `INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1,$2,$3)
         ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = $3`, [out.cart.id, b.variantId, next]);
      await tx.query("UPDATE carts SET revision = revision + 1, updated_at = now() WHERE id = $1", [out.cart.id]);
      return out;
    });
    const view = await cartView(db, { ...cart }, customerKeyOf(req));
    res.status(201).json({ ...view, ...(newToken ? { cartToken: newToken } : {}) });
  }));

  r.patch("/cart/items/:variantId", ah(async (req, res) => {
    const variantId = parse(z.string().uuid(), req.params.variantId);
    const b = parse(z.object({ quantity: z.number().int().min(1).max(99) }), req.body);
    const cart = await withTx(db, async (tx) => {
      await fenceEpoch(tx, req.user);
      const c = await findCart(tx, req, { lock: true });
      if (!c) throw E.notFound("Cart");
      const stock = await availableStock(tx, variantId);
      if (b.quantity > stock) throw insufficientStock(stock);
      const u = await tx.query("UPDATE cart_items SET quantity = $3 WHERE cart_id = $1 AND variant_id = $2",
        [c.id, variantId, b.quantity]);
      if (!u.rowCount) throw E.notFound("Cart item");
      await tx.query("UPDATE carts SET revision = revision + 1, updated_at = now() WHERE id = $1", [c.id]);
      return c;
    });
    res.json(await cartView(db, cart, customerKeyOf(req)));
  }));

  r.delete("/cart/items/:variantId", ah(async (req, res) => {
    const variantId = parse(z.string().uuid(), req.params.variantId);
    const cart = await withTx(db, async (tx) => {
      await fenceEpoch(tx, req.user);
      const c = await findCart(tx, req, { lock: true });
      if (!c) throw E.notFound("Cart");
      await tx.query("DELETE FROM cart_items WHERE cart_id = $1 AND variant_id = $2", [c.id, variantId]);
      await tx.query("UPDATE carts SET revision = revision + 1, updated_at = now() WHERE id = $1", [c.id]);
      return c;
    });
    res.json(await cartView(db, cart, customerKeyOf(req)));
  }));

  r.post("/cart/coupon", ah(async (req, res) => {
    const b = parse(z.object({ code: z.string().trim().min(1).max(40) }), req.body);
    const cart = await findCart(db, req);
    if (!cart) throw E.notFound("Cart");
    const view = await cartView(db, cart, customerKeyOf(req));
    const promo = await loadValidPromotion(db, b.code, { subtotalCents: view.totals.subtotalCents, customerKey: customerKeyOf(req) });
    await db.query("UPDATE carts SET coupon_code = $2, revision = revision + 1 WHERE id = $1", [cart.id, promo.code]);
    res.json(await cartView(db, { ...cart, couponCode: promo.code }, customerKeyOf(req)));
  }));

  r.delete("/cart/coupon", ah(async (req, res) => {
    const cart = await findCart(db, req);
    if (!cart) throw E.notFound("Cart");
    await db.query("UPDATE carts SET coupon_code = NULL, revision = revision + 1 WHERE id = $1", [cart.id]);
    res.json(await cartView(db, { ...cart, couponCode: null }, customerKeyOf(req)));
  }));

  r.post("/cart/merge", requireUser, ah(async (req, res) => {
    const b = parse(z.object({ cartToken: z.string().min(10).max(100) }), req.body);
    await withTx(db, async (tx) => { await fenceEpoch(tx, req.user); await mergeGuestCart(tx, req.user!.id, b.cartToken); });
    res.json(await cartView(db, await findCart(db, req), customerKeyOf(req)));
  }));

  // ---------- checkout ----------
  r.post("/checkout", ah(async (req, res) => {
    const result = await checkout(db, req, req.body);
    res.status(result.status).json(result.body);
  }));

  // ---------- orders (customer + guest) ----------
  r.get("/orders", requireUser, ah(async (req, res) => {
    const { rows } = await db.query(
      `SELECT number, fulfilment_status AS status, payment_status AS "paymentStatus", total_cents AS "totalCents",
         created_at AS "createdAt", (SELECT sum(quantity)::int FROM order_items WHERE order_id = o.id) AS "itemCount"
       FROM orders o WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [req.user!.id]);
    res.json({ items: rows });
  }));

  r.get("/orders/:number", ah(async (req, res) => {
    const number = parse(z.string().regex(/^PS-\d{1,10}$/), req.params.number);
    const { rows } = await db.query("SELECT * FROM orders WHERE number = $1", [number]);
    const o = rows[0];
    // Owner, staff/admin, or a guest holding this order's access token. Everyone else gets 404.
    let allowed = false;
    if (o && req.user) allowed = o.user_id === req.user.id || req.user.role !== "customer";
    if (o && !allowed) {
      const t = req.header("x-order-token");
      if (t) {
        const { rows: a } = await db.query("SELECT token_hash FROM order_access_tokens WHERE order_id = $1", [o.id]);
        allowed = !!a[0] && a[0].token_hash === sha256(t);
      }
    }
    if (!o || !allowed) throw E.notFound("Order");
    res.json(await orderDetail(db, o));
  }));

  return r;
}

export async function orderDetail(db: Db, o: Record<string, any>) {
  const items = (await db.query(
    `SELECT product_name AS name, variant_label AS "variantLabel", sku, unit_price_cents AS "unitPriceCents",
       quantity, line_total_cents AS "lineTotalCents", refunded_quantity AS "refundedQuantity", id
     FROM order_items WHERE order_id = $1 ORDER BY product_name`, [o.id])).rows;
  const events = (await db.query(
    "SELECT type, detail, created_at AS \"createdAt\" FROM order_events WHERE order_id = $1 ORDER BY created_at", [o.id])).rows;
  const refunds = (await db.query(
    "SELECT amount_cents AS \"amountCents\", reason, created_at AS \"createdAt\" FROM refunds WHERE order_id = $1 ORDER BY created_at", [o.id])).rows;
  return {
    number: o.number, email: o.email, status: o.fulfilment_status, paymentStatus: o.payment_status,
    createdAt: o.created_at, trackingNumber: o.tracking_number, couponCode: o.coupon_code,
    shippingAddress: o.shipping_address, items, events, refunds,
    totals: { subtotalCents: o.subtotal_cents, discountCents: o.discount_cents, shippingCents: o.shipping_cents,
      taxCents: o.tax_cents, totalCents: o.total_cents, refundedCents: o.refunded_cents },
  };
}
