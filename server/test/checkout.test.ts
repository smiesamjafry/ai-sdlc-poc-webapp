import { address, bearer, card, guestCart, guestCheckout, key, login, reseed, setup, teardown, variantOf, type Ctx } from "./helpers";

let ctx: Ctx;
beforeAll(async () => { ctx = await setup(); });
beforeEach(async () => reseed(ctx));
afterAll(async () => teardown(ctx));

const orders = async () => Number((await ctx.db.query("SELECT count(*) FROM orders")).rows[0].count);

describe("checkout", () => {
  it("charges price × quantity plus shipping and tax, decrements stock and writes the outbox", async () => {
    const v = await variantOf(ctx, "everyday-tee", 3);
    const token = await guestCart(ctx, v.id, 3);
    const res = await guestCheckout(ctx, token, key());
    expect(res.status).toBe(201);
    expect(res.body.order.totals.subtotalCents).toBe(v.price_cents * 3);
    const stock = (await ctx.db.query("SELECT stock_on_hand FROM variants WHERE id = $1", [v.id])).rows[0].stock_on_hand;
    expect(stock).toBe(v.stock_on_hand - 3);
    const mail = await ctx.db.query("SELECT * FROM email_outbox WHERE ref = $1", [res.body.order.number]);
    expect(mail.rowCount).toBe(1);
    expect((await ctx.api.get("/api/v1/cart").set("X-Cart-Token", token)).body.items).toEqual([]);
  });

  it("decline leaves stock and cart untouched; a new key with a good card succeeds", async () => {
    const v = await variantOf(ctx, "steel-bottle", 2);
    const token = await guestCart(ctx, v.id);
    const k1 = key();
    const declined = await guestCheckout(ctx, token, k1, "4000000000000002");
    expect(declined.status).toBe(402);
    expect(JSON.parse(declined.text).code).toBe("PAYMENT_DECLINED");
    const replay = await guestCheckout(ctx, token, k1, "4000000000000002");
    expect(replay.status).toBe(402);
    const reused = await guestCheckout(ctx, token, k1);
    expect(JSON.parse(reused.text).code).toBe("IDEMPOTENCY_KEY_REUSED");
    const stock = (await ctx.db.query("SELECT stock_on_hand FROM variants WHERE id = $1", [v.id])).rows[0].stock_on_hand;
    expect(stock).toBe(v.stock_on_hand);
    const attempts = await ctx.db.query("SELECT status FROM payment_attempts WHERE idempotency_key = $1", [k1]);
    expect(attempts.rows.map((r) => r.status)).toEqual(["failed"]);
    expect((await guestCheckout(ctx, token, key())).status).toBe(201);
  });

  it("concurrent submits with the same key create exactly one order", async () => {
    const v = await variantOf(ctx, "glass-bottle");
    const token = await guestCart(ctx, v.id);
    const k = key();
    const before = await orders();
    const results = await Promise.all(Array.from({ length: 5 }, () => guestCheckout(ctx, token, k)));
    expect(await orders()).toBe(before + 1);
    const numbers = new Set(results.filter((r) => r.status < 300).map((r) => r.body.order.number));
    expect(numbers.size).toBe(1);
  });

  it("two different keys for the same cart: one order, the other sees an empty cart", async () => {
    const v = await variantOf(ctx, "glass-bottle");
    const token = await guestCart(ctx, v.id);
    const [a, b] = await Promise.all([guestCheckout(ctx, token, key()), guestCheckout(ctx, token, key())]);
    expect([a.status, b.status].sort()).toEqual([201, 422]);
    const loser = a.status === 422 ? a : b;
    expect(JSON.parse(loser.text).code).toBe("CART_EMPTY");
  });

  it("20 shoppers racing for the last unit: exactly one wins, stock never goes negative", async () => {
    const v = await variantOf(ctx, "dot-grid-notebook");
    await ctx.db.query("UPDATE variants SET stock_on_hand = 1 WHERE id = $1", [v.id]);
    const tokens = [];
    for (let i = 0; i < 20; i++) tokens.push(await guestCart(ctx, v.id));
    const results = await Promise.all(tokens.map((t) => guestCheckout(ctx, t, key())));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => JSON.parse(r.text).code === "INSUFFICIENT_STOCK")).toBe(true);
    const stock = (await ctx.db.query("SELECT stock_on_hand FROM variants WHERE id = $1", [v.id])).rows[0].stock_on_hand;
    expect(stock).toBe(0);
  });

  it("coupon usage limit holds under 20 concurrent checkouts", async () => {
    await ctx.db.query("UPDATE promotions SET usage_limit = 3 WHERE code = 'WELCOME10'");
    const v = await variantOf(ctx, "everyday-tee", 20);
    await ctx.db.query("UPDATE variants SET stock_on_hand = 100 WHERE id = $1", [v.id]);
    const tokens = [];
    for (let i = 0; i < 20; i++) {
      const t = await guestCart(ctx, v.id);
      await ctx.api.post("/api/v1/cart/coupon").set("X-Cart-Token", t).send({ code: "welcome10" });
      tokens.push(t);
    }
    const results = await Promise.all(tokens.map((t) => guestCheckout(ctx, t, key())));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    const used = (await ctx.db.query("SELECT used_count FROM promotions WHERE code = 'WELCOME10'")).rows[0].used_count;
    expect(used).toBe(3);
  });

  it("rejects invalid coupons with a specific reason and blocks quantities over stock", async () => {
    const v = await variantOf(ctx, "canvas-tote");
    const token = await guestCart(ctx, v.id);
    const bad = await ctx.api.post("/api/v1/cart/coupon").set("X-Cart-Token", token).send({ code: "NOPE" });
    expect(JSON.parse(bad.text)).toMatchObject({ code: "COUPON_INVALID" });
    const min = await ctx.api.post("/api/v1/cart/coupon").set("X-Cart-Token", token).send({ code: "SAVE15" });
    expect(JSON.parse(min.text).detail).toContain("at least");
    const over = await ctx.api.patch(`/api/v1/cart/items/${v.id}`).set("X-Cart-Token", token).send({ quantity: v.stock_on_hand + 1 });
    expect(JSON.parse(over.text)).toMatchObject({ code: "INSUFFICIENT_STOCK", available: v.stock_on_hand });
  });

  it("signed-in checkout links the order to the customer and validates input", async () => {
    const s = await login(ctx, "demo@shop.test");
    const v = await variantOf(ctx, "zip-hoodie");
    await ctx.api.post("/api/v1/cart/items").set(bearer(s.accessToken)).send({ variantId: v.id, quantity: 1 });
    const invalid = await ctx.api.post("/api/v1/checkout").set(bearer(s.accessToken)).set("Idempotency-Key", key())
      .send({ email: "nope", shippingAddress: { ...address, postcode: "" }, card: card("123") });
    expect(invalid.status).toBe(422);
    expect(Object.keys(JSON.parse(invalid.text).fields)).toEqual(expect.arrayContaining(["email", "shippingAddress.postcode", "card.number"]));
    const ok = await ctx.api.post("/api/v1/checkout").set(bearer(s.accessToken)).set("Idempotency-Key", key())
      .send({ email: "demo@shop.test", shippingAddress: address, card: card() });
    expect(ok.status).toBe(201);
    expect(ok.body.accessToken).toBeNull();
    const mine = await ctx.api.get("/api/v1/orders").set(bearer(s.accessToken));
    expect(mine.body.items[0].number).toBe(ok.body.order.number);
  });
});
