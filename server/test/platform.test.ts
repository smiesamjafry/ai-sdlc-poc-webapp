import { loadConfig, ConfigError } from "../src/lib/config";
import { log } from "../src/lib/log";
import { setup, teardown, reseed, type Ctx } from "./helpers";
import pino from "pino";
import { REDACT_PATHS } from "../src/lib/log";

let ctx: Ctx;
beforeAll(async () => { ctx = await setup(); await reseed(ctx); });
afterAll(async () => teardown(ctx));

describe("platform", () => {
  it("healthz reports db, redis, version and uptime", async () => {
    const res = await ctx.api.get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ db: "up", redis: "up", version: expect.any(String), uptimeSec: expect.any(Number) });
  });

  it("echoes a valid X-Request-Id and replaces an invalid one", async () => {
    const ok = await ctx.api.get("/healthz").set("X-Request-Id", "abc-12345678");
    expect(ok.headers["x-request-id"]).toBe("abc-12345678");
    const bad = await ctx.api.get("/healthz").set("X-Request-Id", "bad id!");
    expect(bad.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("unknown routes return problem+json with a fix and request id", async () => {
    const res = await ctx.api.get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(JSON.parse(res.text)).toMatchObject({ code: "ROUTE_NOT_FOUND", fix: expect.any(String), requestId: res.headers["x-request-id"] });
  });

  it("CORS: storefront origin gets full access, preview origin GET only, others nothing", async () => {
    const full = await ctx.api.options("/api/v1/cart/items").set("Origin", "https://store.example.com")
      .set("Access-Control-Request-Method", "POST").set("Access-Control-Request-Headers", "authorization,content-type");
    expect(full.status).toBe(204);
    expect(full.headers["access-control-allow-headers"]).toContain("Authorization");

    const prevGet = await ctx.api.get("/api/v1/products").set("Origin", "https://smiesamjafry.github.io");
    expect(prevGet.status).toBe(200);
    expect(prevGet.headers["access-control-allow-origin"]).toBe("https://smiesamjafry.github.io");

    const prevAuth = await ctx.api.options("/api/v1/me").set("Origin", "https://smiesamjafry.github.io")
      .set("Access-Control-Request-Method", "GET").set("Access-Control-Request-Headers", "authorization");
    expect(prevAuth.status).toBe(403);

    const prevPost = await ctx.api.post("/api/v1/cart/items").set("Origin", "https://smiesamjafry.github.io").send({});
    expect(JSON.parse(prevPost.text).code).toBe("PREVIEW_READ_ONLY");

    const other = await ctx.api.get("/api/v1/products").set("Origin", "https://evil.example.com");
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("exposes cache headers to the browser", async () => {
    const res = await ctx.api.get("/api/v1/products").set("Origin", "https://store.example.com");
    expect(res.headers["access-control-expose-headers"]).toContain("X-Cache");
  });

  it("refuses to start without required production variables and names them", () => {
    expect(() => loadConfig({ APP_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(ConfigError);
    try { loadConfig({ APP_ENV: "production", DATABASE_URL: "postgres://u:secret@h/db" } as NodeJS.ProcessEnv); } catch (e) {
      expect((e as Error).message).toContain("REDIS_URL");
      expect((e as Error).message).toContain("JWT_SECRET");
      expect((e as Error).message).not.toContain("secret@");
    }
  });

  it("redacts secrets from logs", () => {
    const lines: string[] = [];
    const l = pino({ redact: { paths: REDACT_PATHS, censor: "[redacted]" } }, { write: (s: string) => lines.push(s) });
    l.info({ headers: { authorization: "Bearer abc.def" }, password: "hunter22", refreshToken: "rt-xyz", card: "4242424242424242" }, "x");
    const out = lines.join("");
    for (const s of ["abc.def", "hunter22", "rt-xyz", "4242424242424242"]) expect(out).not.toContain(s);
    void log;
  });
});
