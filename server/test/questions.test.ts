import { bearer, login, reseed, setup, teardown, type Ctx } from "./helpers";

let ctx: Ctx;
beforeAll(async () => { ctx = await setup(); });
beforeEach(async () => reseed(ctx));
afterAll(async () => teardown(ctx));

const ask = (slug: string, question: unknown) => ctx.api.post(`/api/v1/products/${slug}/questions`).send({ question });

describe("product questions", () => {
  it("a guest can ask; the question stays hidden until an admin answers it", async () => {
    const res = await ask("linen-shirt", "  Does this run true to size?  ");
    expect(res.status).toBe(201);
    expect((await ctx.api.get("/api/v1/products/linen-shirt/questions")).body.items).toEqual([]);

    const { accessToken } = await login(ctx, "admin@shop.test");
    const list = await ctx.api.get("/api/v1/admin/questions").set(bearer(accessToken));
    expect(list.body.items).toEqual([expect.objectContaining({ id: res.body.id, question: "Does this run true to size?", productName: "Linen Shirt" })]);

    const ans = await ctx.api.post(`/api/v1/admin/questions/${res.body.id}/answer`).set(bearer(accessToken)).send({ answer: "Yes." });
    expect(ans.status).toBe(200);
    expect((await ctx.api.get("/api/v1/admin/questions").set(bearer(accessToken))).body.items).toEqual([]);
    expect((await ctx.api.get("/api/v1/products/linen-shirt/questions")).body.items)
      .toEqual([expect.objectContaining({ question: "Does this run true to size?", answer: "Yes." })]);
    expect((await ctx.api.get("/api/v1/products/canvas-tote/questions")).body.items).toEqual([]);

    const again = await ctx.api.post(`/api/v1/admin/questions/${res.body.id}/answer`).set(bearer(accessToken)).send({ answer: "No." });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("QUESTION_ALREADY_ANSWERED");
  });

  it("rejects empty, whitespace-only and over-long questions without creating anything", async () => {
    for (const q of ["", "   ", "x".repeat(501), undefined]) {
      const res = await ask("linen-shirt", q);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("VALIDATION_FAILED");
    }
    expect((await ctx.db.query("SELECT count(*)::int AS n FROM product_questions")).rows[0].n).toBe(0);
  });

  it("404s for unknown products", async () => {
    expect((await ask("no-such-product", "Hello?")).status).toBe(404);
  });

  it("only admins can list or answer questions", async () => {
    const { accessToken } = await login(ctx, "staff@shop.test");
    expect((await ctx.api.get("/api/v1/admin/questions").set(bearer(accessToken))).status).toBe(403);
    expect((await ctx.api.get("/api/v1/admin/questions")).status).toBe(401);
  });
});
