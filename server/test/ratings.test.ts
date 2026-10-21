import { reseed, setup, teardown, type Ctx } from "./helpers";

let ctx: Ctx;
beforeAll(async () => { ctx = await setup(); });
beforeEach(async () => reseed(ctx));
afterAll(async () => teardown(ctx));

const rate = (slug: string, stars: unknown) => ctx.api.post(`/api/v1/products/${slug}/ratings`).send({ stars });

describe("product ratings", () => {
  it("starts empty, then shows the average to one decimal and the count to everyone", async () => {
    expect((await ctx.api.get("/api/v1/products/steel-bottle/ratings")).body).toEqual({ average: null, count: 0 });

    const first = await rate("steel-bottle", 5);
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ average: 5, count: 1 });
    expect((await rate("steel-bottle", 4)).body).toEqual({ average: 4.5, count: 2 });
    expect((await rate("steel-bottle", 4)).body).toEqual({ average: 4.3, count: 3 });

    expect((await ctx.api.get("/api/v1/products/steel-bottle/ratings")).body).toEqual({ average: 4.3, count: 3 });
    expect((await ctx.api.get("/api/v1/products/canvas-tote/ratings")).body).toEqual({ average: null, count: 0 });
  });

  it("rejects anything but whole stars from 1 to 5 without saving", async () => {
    for (const stars of [0, 6, 3.5, "4", undefined]) {
      const res = await rate("steel-bottle", stars);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    }
    expect((await ctx.db.query("SELECT count(*)::int AS n FROM product_ratings")).rows[0].n).toBe(0);
  });

  it("404s for unknown products", async () => {
    expect((await rate("no-such-product", 4)).status).toBe(404);
    expect((await ctx.api.get("/api/v1/products/no-such-product/ratings")).status).toBe(404);
  });
});
