import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadConfig } from "../lib/config";
import { redactUrl } from "../lib/log";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");

/** Apply pending migrations, each in its own transaction. Safe to rerun: applied files are skipped. */
export async function migrate(databaseUrl: string, out: (s: string) => void = console.log): Promise<number> {
  const ssl = /render\.com|sslmode=require/.test(databaseUrl) ? { rejectUnauthorized: false } : undefined;
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000, ssl });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(727001)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const applied = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        out(`migrate: applied ${file}`);
        count++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        const e = err as { code?: string; message: string };
        throw new Error(
          `migrate: ${file} failed (SQLSTATE ${e.code ?? "?"}) on ${redactUrl(databaseUrl)}: ${e.message}. ` +
            `Safe to rerun: yes (the file was rolled back; fix it and run npm run db:migrate again).`,
        );
      }
    }
    if (count === 0) out("migrate: up to date");
    return count;
  } finally {
    await client.query("SELECT pg_advisory_unlock(727001)").catch(() => {});
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const cfg = loadConfig();
    await migrate(cfg.databaseUrl);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
