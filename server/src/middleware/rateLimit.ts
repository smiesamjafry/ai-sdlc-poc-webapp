import type { NextFunction, Request, Response } from "express";
import type { Cache } from "../cache/redis";
import { E } from "../lib/errors";

/**
 * Fixed one-minute window per IP and route group. Uses Redis when available and falls back to an
 * in-process map, so limits still hold while Redis is down.
 */
export function rateLimit(cache: Cache, group: string, limitPerMin: () => number) {
  const local = new Map<string, { n: number; resetAt: number }>();
  return async (req: Request, _res: Response, next: NextFunction) => {
    const limit = limitPerMin();
    if (limit <= 0) return next();
    const window = Math.floor(Date.now() / 60_000);
    const id = `${group}:${req.ip}:${window}`;
    let count: number | null = await cache.run(async (r) => {
      const k = cache.key(`rl:${id}`);
      const [[, n]] = (await r.multi().incr(k).expire(k, 70).exec()) as [[null, number], unknown];
      return n;
    });
    if (count === null) {
      const now = Date.now();
      const entry = local.get(id) ?? { n: 0, resetAt: now + 60_000 };
      entry.n++;
      local.set(id, entry);
      if (local.size > 5000) for (const [k, v] of local) if (v.resetAt < now) local.delete(k);
      count = entry.n;
    }
    if (count > limit) return next(E.rateLimited(60 - (Math.floor(Date.now() / 1000) % 60)));
    next();
  };
}
