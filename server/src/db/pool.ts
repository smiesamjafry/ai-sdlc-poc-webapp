import pg from "pg";

// int8 (bigint) counts come back as strings by default; our counts fit in a JS number.
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(databaseUrl: string): pg.Pool {
  const ssl = /render\.com|sslmode=require/.test(databaseUrl) ? { rejectUnauthorized: false } : undefined;
  return new pg.Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 10_000, ssl });
}

const RETRYABLE = new Set(["40P01", "40001"]); // deadlock, serialization failure

export class RetriesExhausted extends Error {}

/**
 * Run fn in a transaction. Deadlock/serialization errors retry up to `retries` times with jitter;
 * after that RetriesExhausted is thrown so callers can answer 503 with Retry-After.
 */
export async function withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      const code = (err as { code?: string }).code;
      if (code && RETRYABLE.has(code)) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 60));
          continue;
        }
        throw new RetriesExhausted(`transaction failed after ${retries + 1} attempts (${code})`);
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
