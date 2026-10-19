import { Cache } from "../src/cache/redis";
import { createApp } from "../src/app";
import request from "supertest";
import { bearer, cfg, guestCart, guestCheckout, key, login, reseed, setup, teardown, variantOf, type Ctx } from "./helpers";

let ctx: Ctx;
beforeAll(async () => { ctx = await setup(); });
beforeEach(async () => reseed(ctx));
afterAll(async () => teardown(ctx));

describe("catalog + cache", () => {
  it("serves MISS then HIT for identical list requests", async () => {
    const a = await ctx.api.get("/api/v1/products?category=tops");
    const b = await ctx.api.get("/api/v1/products?category=tops");
    expect([a.headers["x-cache"], b.headers["x-cache"]]).toEqual(["MISS", "HIT"]);
    expect(b.body).toEqual(a.body);
  });

  it("an admin price edit orphans cached keys: next read is a MISS with the new price", async () => {
    await ctx.api.get("/api/v1/products/everyday-tee");
    const hit = await ctx.api.get("/api/v1/products/everyday-tee");
    expect(hit.headers["x-cache"]).toBe("HIT");
    const { accessToken } = await login(ctx, "admin@shop.test");
    const prod = await ctx.api.get(`/api/v1/admin/products/${hit.body.id}`).set(bearer(accessToken));
    const body = { ...prod.body, variants: prod.body.variants.map((v: Record<string, unknown>) => ({ ...v, priceCents: 1999 })) };
    delete body.id;
    const t0 = Date.now();
    expect((await ctx.api.put(`/api/v1/admin/products/${hit.body.id}`).set(bearer(accessToken)).send(body)).status).toBe(200);
    const after = await ctx.api.get("/api/v1/products/everyday-tee");
    expect(after.headers["x-cache"]).toBe("MISS");
    expect(after.body.variants[0].priceCents).toBe(1999);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("a Key Value flush cannot resurrect stale data because the version lives in Postgres", async () => {
    const v1 = await ctx.api.get("/api/v1/products?sort=price_asc");
    await ctx.db.query("UPDATE app_meta SET catalog_version = catalog_version + 1");
    await ctx.cache.run((r) => r.flushdb());
    const v2 = await ctx.api.get("/api/v1/products?sort=price_asc");
    expect(v2.headers["x-cache"]).toBe("MISS");
    expect(v2.headers["x-cache-key"]).not.toBe(v1.headers["x-cache-key"]);
  });

  it("product detail stock is live: a checkout shows up immediately even on a cache HIT", async () => {
    const v = await variantOf(ctx, "canvas-tote", 3);
    await ctx.api.get("/api/v1/products/canvas-tote");
    const token = await guestCart(ctx, v.id, 2);
    expect((await guestCheckout(ctx, token, key())).status).toBe(201);
    const after = await ctx.api.get("/api/v1/products/canvas-tote");
    expect(after.headers["x-cache"]).toBe("HIT");
    expect(after.body.variants.find((x: { id: string }) => x.id === v.id).stock).toBe(v.stock_on_hand - 2);
  });

  it("search is case-insensitive and partial on the API", async () => {
    const counts = await Promise.all(["hood", "HOOD", "Hood"].map(async (q) => (await ctx.api.get(`/api/v1/products?q=${q}`)).body.total));
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBeGreaterThan(0);
    const all = await ctx.api.get("/api/v1/products?q=");
    expect(all.body.total).toBe((await ctx.api.get("/api/v1/products")).body.total);
  });

  it("escapes LIKE wildcards and rejects unknown or oversized params", async () => {
    expect((await ctx.api.get("/api/v1/products?q=%25")).body.total).toBe(0);
    expect((await ctx.api.get("/api/v1/products?pageSize=500")).status).toBe(422);
    expect((await ctx.api.get("/api/v1/products?evil=1")).status).toBe(422);
  });

  it("draft products are invisible on the storefront", async () => {
    await ctx.db.query("UPDATE products SET status = 'draft' WHERE slug = 'canvas-tote'");
    await ctx.db.query("UPDATE app_meta SET catalog_version = catalog_version + 1");
    expect((await ctx.api.get("/api/v1/products/canvas-tote")).status).toBe(404);
    expect((await ctx.api.get("/api/v1/products?q=canvas tote")).body.total).toBe(0);
  });

  it("serves from Postgres with X-Cache: BYPASS when Redis is down or unresponsive", async () => {
    for (const url of ["redis://localhost:1", "redis://10.255.255.1:6379"]) {
      const dead = new Cache(url, "dead:");
      const app = createApp(ctx.db, dead, cfg);
      const t0 = Date.now();
      const res = await request(app).get("/api/v1/products?category=bags");
      expect(res.status).toBe(200);
      expect(res.headers["x-cache"]).toBe("BYPASS");
      expect(res.body.total).toBeGreaterThan(0);
      expect(Date.now() - t0).toBeLessThan(1500);
      const h = await request(app).get("/healthz");
      expect(h.status).toBe(200);
      expect(h.body.redis).toBe("down");
      await dead.quit();
    }
  });
});
