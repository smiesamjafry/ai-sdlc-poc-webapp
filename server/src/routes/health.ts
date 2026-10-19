import type { Db } from "../db/pool";
import type { Cache } from "../cache/redis";
import type { Config } from "../lib/config";

const started = Date.now();

export async function healthReport(db: Db, cache: Cache, cfg: Config) {
  const dbOk = await db.query("SELECT 1").then(() => true).catch(() => false);
  const redisOk = await cache.ping();
  return { db: dbOk ? "up" : "down", redis: redisOk ? "up" : "down", version: cfg.version,
    appEnv: cfg.appEnv, uptimeSec: Math.round((Date.now() - started) / 1000) };
}
