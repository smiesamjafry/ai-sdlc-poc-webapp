import { createHash } from "node:crypto";
import type { Db, Tx } from "../db/pool";
import type { Cache } from "./redis";

export type CacheStatus = "HIT" | "MISS" | "BYPASS";

const sha1 = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

/** The catalog version lives in Postgres so a Key Value restart can never resurrect stale namespaces. */
export async function catalogVersion(db: Db | Tx): Promise<number> {
  const { rows } = await db.query("SELECT catalog_version FROM app_meta");
  return rows[0].catalog_version;
}

/** Call inside the same transaction as any admin catalog write. */
export async function invalidateCatalog(tx: Tx): Promise<void> {
  await tx.query("UPDATE app_meta SET catalog_version = catalog_version + 1");
}

export function hashQuery(parts: Record<string, unknown>): string {
  const keys = Object.keys(parts).sort();
  return sha1(JSON.stringify(keys.map((k) => [k, parts[k]])));
}

/**
 * Cache-aside read. The version is read BEFORE loading from Postgres, so a write that commits during
 * the load bumps the version and our fill lands in an orphaned key instead of the live one.
 */
export async function cached<T>(
  cache: Cache,
  db: Db,
  opts: { kind: "list" | "product" | "search" | "categories"; id: string; ttl: number; bypass: boolean },
  load: () => Promise<T>,
): Promise<{ value: T; status: CacheStatus; key: string }> {
  const version = opts.kind === "categories" ? 0 : await catalogVersion(db);
  const key = opts.kind === "categories" ? "categories:tree" : `catalog:v${version}:${opts.kind}:${opts.id}`;
  if (opts.bypass) {
    await counter(cache, "bypass");
    return { value: await load(), status: "BYPASS", key };
  }
  const hit = await cache.run((r) => r.get(cache.key(key)));
  if (hit !== null && hit !== undefined) {
    await counter(cache, "hit");
    return { value: JSON.parse(hit) as T, status: "HIT", key };
  }
  const value = await load();
  const stored = await cache.run((r) => r.set(cache.key(key), JSON.stringify(value), "EX", opts.ttl));
  await counter(cache, stored === null ? "bypass" : "miss");
  return { value, status: stored === null ? "BYPASS" : "MISS", key };
}

async function counter(cache: Cache, kind: "hit" | "miss" | "bypass") {
  await cache.run((r) => r.incr(cache.key(`metrics:catalog:${kind}`)));
}

export async function flushCategoryCache(cache: Cache) {
  await cache.run((r) => r.del(cache.key("categories:tree")));
}

export async function recordInvalidation(cache: Cache, what: string) {
  await cache.run((r) =>
    r.multi().lpush(cache.key("metrics:invalidations"), JSON.stringify({ at: new Date().toISOString(), what }))
      .ltrim(cache.key("metrics:invalidations"), 0, 19).exec(),
  );
}
