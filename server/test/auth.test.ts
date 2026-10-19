import { bearer, guestCart, guestCheckout, key, login, reseed, setup, teardown, variantOf, type Ctx } from "./helpers";

let ctx: Ctx;
beforeAll(async () => { ctx = await setup(); });
beforeEach(async () => reseed(ctx));
afterAll(async () => teardown(ctx));

describe("auth", () => {
  it("rejects a wrong password with a clear code", async () => {
    const res = await ctx.api.post("/api/v1/auth/login").send({ email: "demo@shop.test", password: "nope" });
    expect(res.status).toBe(401);
    expect(JSON.parse(res.text).code).toBe("INVALID_CREDENTIALS");
  });

  it("rotates refresh tokens, tolerates a just-rotated token, and revokes the family on late reuse", async () => {
    const s = await login(ctx, "demo@shop.test");
    const r1 = await ctx.api.post("/api/v1/auth/refresh").send({ refreshToken: s.refreshToken });
    expect(r1.status).toBe(200);
    const grace = await ctx.api.post("/api/v1/auth/refresh").send({ refreshToken: s.refreshToken });
    expect(grace.status).toBe(200); // second tab / lost response within 10 s
    await ctx.db.query("UPDATE refresh_tokens SET rotated_at = now() - interval '1 minute' WHERE rotated_at IS NOT NULL");
    const late = await ctx.api.post("/api/v1/auth/refresh").send({ refreshToken: s.refreshToken });
    expect(JSON.parse(late.text).code).toBe("TOKEN_REVOKED");
    const fam = await ctx.api.post("/api/v1/auth/refresh").send({ refreshToken: r1.body.refreshToken });
    expect(fam.status).toBe(401);
  });

  it("disabling a customer revokes their access immediately", async () => {
    const s = await login(ctx, "demo@shop.test");
    const a = await login(ctx, "admin@shop.test");
    expect((await ctx.api.post(`/api/v1/admin/customers/${s.user.id}/disable`).set(bearer(a.accessToken))).status).toBe(200);
    const me = await ctx.api.get("/api/v1/me").set(bearer(s.accessToken));
    expect(JSON.parse(me.text).code).toBe("ACCOUNT_DISABLED");
    const relogin = await ctx.api.post("/api/v1/auth/login").send({ email: "demo@shop.test", password: "demo1234" });
    expect(JSON.parse(relogin.text).code).toBe("ACCOUNT_DISABLED");
  });

  it("enforces the §7.2 permission matrix", async () => {
    const c = await login(ctx, "demo@shop.test");
    const s = await login(ctx, "staff@shop.test");
    const deny: Array<[string, string, string]> = [
      [c.accessToken, "get", "/api/v1/admin/dashboard"],
      [c.accessToken, "get", "/api/v1/admin/orders"],
      [s.accessToken, "get", "/api/v1/admin/promotions"],
      [s.accessToken, "put", "/api/v1/admin/settings"],
      [s.accessToken, "post", "/api/v1/admin/products"],
      [s.accessToken, "post", "/api/v1/admin/cache/flush"],
      [s.accessToken, "post", "/api/v1/admin/demo/reset"],
      [s.accessToken, "post", "/api/v1/admin/orders/PS-10001/refund"],
      [s.accessToken, "post", "/api/v1/admin/customers/00000000-0000-4000-a000-000000000000/disable"],
    ];
    for (const [tok, m, url] of deny) {
      const res = await (ctx.api as any)[m](url).set(bearer(tok)).send({});
      expect([url, res.status]).toEqual([url, 403]);
      expect(JSON.parse(res.text).code).toBe("FORBIDDEN_ROLE");
    }
    const allow: Array<[string, string]> = [["get", "/api/v1/admin/dashboard"], ["get", "/api/v1/admin/inventory"],
      ["get", "/api/v1/admin/outbox"], ["get", "/api/v1/admin/system"], ["get", "/api/v1/admin/orders"]];
    for (const [m, url] of allow) expect([url, (await (ctx.api as any)[m](url).set(bearer(s.accessToken))).status]).toEqual([url, 200]);
    expect((await ctx.api.get("/api/v1/admin/dashboard")).status).toBe(401);
  });

  it("customers see only their own orders; guests need the order access token", async () => {
    const v = await variantOf(ctx, "glass-bottle");
    const token = await guestCart(ctx, v.id);
    const placed = await guestCheckout(ctx, token, key());
    const number = placed.body.order.number;
    const demo = await login(ctx, "demo@shop.test");
    expect((await ctx.api.get(`/api/v1/orders/${number}`).set(bearer(demo.accessToken))).status).toBe(404);
    expect((await ctx.api.get(`/api/v1/orders/${number}`)).status).toBe(404);
    expect((await ctx.api.get(`/api/v1/orders/${number}`).set("X-Order-Token", "wrong-token-123")).status).toBe(404);
    const ok = await ctx.api.get(`/api/v1/orders/${number}`).set("X-Order-Token", placed.body.accessToken);
    expect(ok.status).toBe(200);
    const mine = await ctx.api.get("/api/v1/orders").set(bearer(demo.accessToken));
    expect(mine.body.items.every((o: { number: string }) => o.number !== number)).toBe(true);
  });

  it("merging a guest cart moves its lines and kills the guest token", async () => {
    const v = await variantOf(ctx, "pocket-notebook");
    const token = await guestCart(ctx, v.id, 2);
    const demo = await login(ctx, "demo@shop.test");
    const merged = await ctx.api.post("/api/v1/cart/merge").set(bearer(demo.accessToken)).send({ cartToken: token });
    expect(merged.body.items.find((i: { variantId: string }) => i.variantId === v.id).quantity).toBe(2);
    const stale = await ctx.api.get("/api/v1/cart").set("X-Cart-Token", token);
    expect(stale.body.items).toEqual([]);
  });
});
