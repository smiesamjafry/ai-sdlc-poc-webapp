import type { Db } from "../db/pool";
import { withTx } from "../db/pool";
import type { Cache } from "../cache/redis";
import type { Config } from "../lib/config";
import { uuid } from "../lib/ids";
import { seedDatabase, truncateAll } from "./seed";

/**
 * Demo reset, shared by POST /api/v1/admin/demo/reset and `npm run db:reset -- --yes`.
 * app_meta is updated FIRST: mutating transactions hold app_meta FOR SHARE, so in-flight writes finish
 * before the reset proceeds, and later ones see the new epoch and fail AUTH_EPOCH_CHANGED.
 */
export async function resetDemo(db: Db, cache: Cache | null, cfg: Config, actorId: string | null) {
  const counts = await withTx(db, async (tx) => {
    await tx.query("UPDATE app_meta SET auth_epoch = auth_epoch + 1, catalog_version = catalog_version + 1");
    await truncateAll(tx);
    const c = await seedDatabase(tx, cfg);
    await tx.query("INSERT INTO audit_log (id, actor_id, action, entity) VALUES ($1,$2,'demo.reset','store')",
      [uuid(), null]);
    return c;
  }, 0);
  const warnings: string[] = [];
  if (cache) {
    const flushed = await cache.run(async (r) => {
      let cursor = "0";
      do {
        const [next, keys] = await r.scan(cursor, "MATCH", `${cache.prefix}*`, "COUNT", 500);
        if (keys.length) await r.del(...keys);
        cursor = next;
      } while (cursor !== "0");
      return true;
    });
    if (!flushed) warnings.push("cache_flush_failed");
  }
  void actorId;
  return { counts, warnings };
}
