import { Redis } from "ioredis";
import { log } from "../lib/log";

/**
 * Fail-fast Redis wrapper. Redis is never authoritative: every caller must work when this returns null.
 * No offline queue, no per-request retries, 50 ms command timeout, and a breaker that skips Redis
 * for 10 s after 5 consecutive failures.
 */
export class Cache {
  private failures = 0;
  private openUntil = 0;
  readonly client: Redis;

  constructor(url: string, readonly prefix: string) {
    this.client = new Redis(url, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      commandTimeout: 50,
      connectTimeout: 2000,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 2000),
      tls: url.startsWith("rediss://") ? {} : undefined,
    });
    this.client.on("error", (err) => log.debug({ err: err.message }, "redis_error"));
  }

  key(k: string) {
    return this.prefix + k;
  }

  get available(): boolean {
    return Date.now() >= this.openUntil && this.client.status === "ready";
  }

  /** Run a Redis op; returns null instead of throwing when Redis is down, slow or the breaker is open. */
  async run<T>(op: (r: Redis) => Promise<T>): Promise<T | null> {
    if (!this.available) return null;
    try {
      const v = await op(this.client);
      this.failures = 0;
      return v;
    } catch (err) {
      this.failures++;
      if (this.failures >= 5) {
        this.openUntil = Date.now() + 10_000;
        this.failures = 0;
        log.warn("redis_breaker_open");
      }
      log.debug({ err: (err as Error).message }, "cache_error");
      return null;
    }
  }

  async ping(): Promise<boolean> {
    return (await this.run((r) => r.ping())) === "PONG";
  }

  async quit() {
    this.client.disconnect();
  }
}
