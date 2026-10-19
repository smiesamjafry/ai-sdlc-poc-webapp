import { bearer, guestCart, guestCheckout, key, login, reseed, setup, teardown, variantOf, type Ctx } from "./helpers";
import { resetDemo } from "../src/seed/reset";
import { cfg } from "./helpers";

let ctx: Ctx;
beforeAll(async () => { ctx = await setup(); });
beforeEach(async () => reseed(ctx));
afterAll(async () => teardown(ctx));

async function placeOrder(qty = 2) {
  const v = await variantOf(ctx, "everyday-tee", qty);
  const token = await guestCart(ctx, v.id, qty);
  const res = await guestCheckout(ctx, token, key());
  return { number: res.body.order.number as string, variant: v, total: res.body.order.totals.totalCents as number };
}

describe("admin operations", () => {
  it("order transitions follow the state machine and need tracking to ship", async () => {
    const s = await login(ctx, "staff@shop.test");
    const { number } = await placeOrder(1);
    const go = (to: string, trackingNumber?: string) =>
      ctx.api.post(`/api/v1/admin/orders/${number}/transition`).set(bearer(s.accessToken)).send({ to, trackingNumber });
    expect(JSON.parse((await go("delivered")).text).code).toBe("ILLEGAL_TRANSITION");
    expect((await go("packed")).status).toBe(200);
    expect((await go("shipped")).status).toBe(422);
    expect((await go("shipped", "1Z999")).body.status).toBe("shipped");
    expect((await go("delivered")).body.status).toBe("delivered");
  });

  it("cancel refunds the balance and restocks once, even when repeated", async () => {
    const s = await login(ctx, "staff@shop.test");
    const { number, variant, total } = await placeOrder(2);
    const op = key("cancel");
    const first = await ctx.api.post(`/api/v1/admin/orders/${number}/cancel`).set(bearer(s.accessToken)).send({ operationId: op });
    expect(first.body).toMatchObject({ status: "cancelled", paymentStatus: "refunded" });
    expect(first.body.totals.refundedCents).toBe(total);
    const replay = await ctx.api.post(`/api/v1/admin/orders/${number}/cancel`).set(bearer(s.accessToken)).send({ operationId: op });
    expect(replay.status).toBe(200);
    const again = await ctx.api.post(`/api/v1/admin/orders/${number}/cancel`).set(bearer(s.accessToken)).send({ operationId: key("c2") });
    expect(JSON.parse(again.text).code).toBe("ALREADY_CANCELLED");
    const stock = (await ctx.db.query("SELECT stock_on_hand FROM variants WHERE id = $1", [variant.id])).rows[0].stock_on_hand;
    expect(stock).toBe(variant.stock_on_hand);
  });

  it("partial refunds prorate tax, never exceed the paid amount and are idempotent", async () => {
    const a = await login(ctx, "admin@shop.test");
    const { number, total } = await placeOrder(2);
    const detail = await ctx.api.get(`/api/v1/admin/orders/${number}`).set(bearer(a.accessToken));
    const item = detail.body.items[0];
    const refund = (quantity: number, op = key("r")) => ctx.api.post(`/api/v1/admin/orders/${number}/refund`)
      .set(bearer(a.accessToken)).send({ operationId: op, lines: [{ itemId: item.id, quantity }] });
    const op1 = key("r1");
    const r1 = await refund(1, op1);
    const expected = item.unitPriceCents + Math.round((detail.body.totals.taxCents * item.unitPriceCents) / detail.body.totals.subtotalCents);
    expect(r1.body.totals.refundedCents).toBe(expected);
    expect(r1.body.paymentStatus).toBe("partially_refunded");
    expect((await refund(1, op1)).body.totals.refundedCents).toBe(expected); // replay
    expect(JSON.parse((await refund(2)).text).code).toBe("REFUND_EXCEEDS_QUANTITY");
    const last = await refund(1);
    expect(last.body.totals.refundedCents).toBe(total); // final refund returns the balance incl. shipping
    expect(last.body.paymentStatus).toBe("refunded");
  });

  it("deleting a category with products is blocked", async () => {
    const a = await login(ctx, "admin@shop.test");
    const cat = (await ctx.db.query("SELECT id FROM categories WHERE slug = 'tops'")).rows[0].id;
    const res = await ctx.api.delete(`/api/v1/admin/categories/${cat}`).set(bearer(a.accessToken));
    expect(JSON.parse(res.text).code).toBe("CATEGORY_IN_USE");
  });

  it("stock adjustments write movements and never go negative", async () => {
    const s = await login(ctx, "staff@shop.test");
    const v = await variantOf(ctx, "steel-bottle");
    const neg = await ctx.api.post(`/api/v1/admin/inventory/${v.id}/adjust`).set(bearer(s.accessToken))
      .send({ delta: -(v.stock_on_hand + 1), reason: "count" });
    expect(JSON.parse(neg.text).code).toBe("STOCK_NEGATIVE");
    await ctx.api.post(`/api/v1/admin/inventory/${v.id}/adjust`).set(bearer(s.accessToken)).send({ delta: 5, reason: "restock" });
    const mv = await ctx.api.get(`/api/v1/admin/inventory/${v.id}/movements`).set(bearer(s.accessToken));
    expect(mv.body.items[0]).toMatchObject({ delta: 5, reason: "restock", actor: "staff@shop.test" });
  });

  it("dashboard KPIs match a SQL reference query", async () => {
    const a = await login(ctx, "admin@shop.test");
    const res = await ctx.api.get("/api/v1/admin/dashboard?nocache=1").set(bearer(a.accessToken));
    const ref = (await ctx.db.query(`SELECT COALESCE(sum(total_cents - refunded_cents),0)::int AS d30, count(*)::int AS n
      FROM orders WHERE fulfilment_status <> 'cancelled' AND created_at >= now() - interval '30 days'`)).rows[0];
    expect(res.body.revenue.last30Cents).toBe(ref.d30);
    expect(res.body.orders.last30).toBe(ref.n);
  });

  it("demo reset needs typed confirmation, restores seed data and ends every session", async () => {
    const a = await login(ctx, "admin@shop.test");
    const c = await login(ctx, "demo@shop.test");
    expect((await ctx.api.post("/api/v1/admin/demo/reset").set(bearer(a.accessToken)).send({})).status).toBe(422);
    await ctx.db.query("UPDATE products SET name = 'Mutated' WHERE slug = 'canvas-tote'");
    await ctx.api.get("/api/v1/products/canvas-tote");
    const res = await ctx.api.post("/api/v1/admin/demo/reset").set(bearer(a.accessToken)).send({ confirm: "RESET" });
    expect(res.status).toBe(200);
    const after = await ctx.api.get("/api/v1/products/canvas-tote");
    expect(after.headers["x-cache"]).toBe("MISS");
    expect(after.body.name).toBe("Canvas Tote");
    expect(JSON.parse((await ctx.api.get("/api/v1/me").set(bearer(c.accessToken))).text).code).toBe("AUTH_EPOCH_CHANGED");
    // A second reset invalidates tokens issued between the two.
    const c2 = await login(ctx, "demo@shop.test");
    await resetDemo(ctx.db, ctx.cache, cfg, null);
    expect(JSON.parse((await ctx.api.get("/api/v1/me").set(bearer(c2.accessToken))).text).code).toBe("AUTH_EPOCH_CHANGED");
  });

  it("a write holding the reset fence finishes before the reset proceeds", async () => {
    const client = await ctx.db.connect();
    await client.query("BEGIN");
    await client.query("SELECT auth_epoch FROM app_meta FOR SHARE");
    let done = false;
    const p = resetDemo(ctx.db, ctx.cache, cfg, null).then(() => { done = true; });
    await new Promise((r) => setTimeout(r, 400));
    expect(done).toBe(false);
    await client.query("COMMIT");
    client.release();
    await p;
    expect(done).toBe(true);
  });

  it("seeding twice yields identical catalog rows", async () => {
    const snap = async () => (await ctx.db.query("SELECT id, sku, price_cents FROM variants ORDER BY id")).rows;
    const a = await snap();
    await reseed(ctx);
    expect(await snap()).toEqual(a);
  });
});

describe("production logins", () => {
  it("creates admin/staff only when their passwords are set, and rotates on change", async () => {
    const { withTx } = await import("../src/db/pool");
    const { ensureStaffAccounts, seedDatabase, truncateAll } = await import("../src/seed/seed");
    const prod = { ...cfg, appEnv: "production" as const, seedAdminPassword: null, seedStaffPassword: null };
    await withTx(ctx.db, async (tx) => { await truncateAll(tx); await seedDatabase(tx, prod); });
    const admins = async () => (await ctx.db.query("SELECT count(*)::int AS n FROM users WHERE role <> 'customer'")).rows[0].n;
    expect(await admins()).toBe(0);
    expect(await withTx(ctx.db, (tx) => ensureStaffAccounts(tx, prod))).toEqual(["SEED_ADMIN_PASSWORD", "SEED_STAFF_PASSWORD"]);
    await withTx(ctx.db, (tx) => ensureStaffAccounts(tx, { ...prod, seedAdminPassword: "first-secret-1" }));
    expect((await ctx.api.post("/api/v1/auth/login").send({ email: "admin@shop.test", password: "first-secret-1" })).status).toBe(200);
    await withTx(ctx.db, (tx) => ensureStaffAccounts(tx, { ...prod, seedAdminPassword: "second-secret-2" }));
    expect((await ctx.api.post("/api/v1/auth/login").send({ email: "admin@shop.test", password: "first-secret-1" })).status).toBe(401);
    expect((await ctx.api.post("/api/v1/auth/login").send({ email: "admin@shop.test", password: "second-secret-2" })).status).toBe(200);
  });
});
