import http from "node:http";
import type { AddressInfo } from "node:net";
import pg from "pg";
import request from "supertest";
import { createApp } from "../src/app";
import { createPool, withTx, type Db } from "../src/db/pool";
import { migrate } from "../src/db/migrate";
import { Cache } from "../src/cache/redis";
import { loadConfig } from "../src/lib/config";
import { seedDatabase, truncateAll } from "../src/seed/seed";

export const cfg = loadConfig();

async function ensureDatabase(url: string) {
  const u = new URL(url);
  const name = u.pathname.slice(1);
  u.pathname = "/postgres";
  const c = new pg.Client({ connectionString: u.toString() });
  await c.connect();
  const { rowCount } = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (!rowCount) await c.query(`CREATE DATABASE "${name}"`);
  await c.end();
}

export interface Ctx { db: Db; cache: Cache; app: ReturnType<typeof createApp>; api: ReturnType<typeof request>; server: http.Server }

export async function setup(): Promise<Ctx> {
  await ensureDatabase(cfg.databaseUrl);
  await migrate(cfg.databaseUrl, () => {});
  const db = createPool(cfg.databaseUrl);
  const cache = new Cache(cfg.redisUrl, cfg.redisPrefix);
  await waitReady(cache);
  const app = createApp(db, cache, cfg);
  // One listening server per file: supertest's per-request ephemeral servers stall under concurrent bursts.
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return { db, cache, app, server, api: request(`http://127.0.0.1:${port}`) };
}

export async function waitReady(cache: Cache) {
  for (let i = 0; i < 50 && cache.client.status !== "ready"; i++) await new Promise((r) => setTimeout(r, 50));
}

export async function reseed(ctx: Ctx) {
  await withTx(ctx.db, async (tx) => { await truncateAll(tx); await seedDatabase(tx, cfg); }, 0);
  await ctx.cache.run(async (r) => {
    const keys = await r.keys(`${cfg.redisPrefix}*`);
    if (keys.length) await r.del(...keys);
  });
}

export async function teardown(ctx: Ctx) {
  ctx.server.closeAllConnections();
  await new Promise((r) => ctx.server.close(r));
  await ctx.db.end();
  await ctx.cache.quit();
}

export async function login(ctx: Ctx, email: string, password = "demo1234") {
  const res = await ctx.api.post("/api/v1/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { accessToken: string; refreshToken: string; user: { id: string } };
}

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

export async function variantOf(ctx: Ctx, slug: string, minStock = 1) {
  const { rows } = await ctx.db.query(
    `SELECT v.id, v.stock_on_hand, v.price_cents FROM variants v JOIN products p ON p.id = v.product_id
     WHERE p.slug = $1 AND v.stock_on_hand >= $2 ORDER BY v.sku LIMIT 1`, [slug, minStock]);
  if (!rows[0]) throw new Error(`no variant for ${slug} with stock >= ${minStock}`);
  return rows[0] as { id: string; stock_on_hand: number; price_cents: number };
}

export const address = { name: "Test Buyer", line1: "1 Test St", city: "Testville", postcode: "12345", country: "US" };
export const card = (number = "4242424242424242") => ({ number, expiry: "12/30", cvc: "123" });

let n = 0;
export const key = (p = "k") => `${p}-${Date.now()}-${++n}-abcdef`;

/** Guest cart with one line; returns the cart token. */
export async function guestCart(ctx: Ctx, variantId: string, quantity = 1) {
  const res = await ctx.api.post("/api/v1/cart/items").send({ variantId, quantity });
  if (res.status !== 201) throw new Error(`add failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.cartToken as string;
}

export async function guestCheckout(ctx: Ctx, token: string, idem: string, cardNumber?: string) {
  return ctx.api.post("/api/v1/checkout").set("X-Cart-Token", token).set("Idempotency-Key", idem)
    .send({ email: "buyer@example.com", shippingAddress: address, card: card(cardNumber) });
}
