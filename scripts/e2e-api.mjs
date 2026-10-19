// Starts the API for Playwright on port 4100 with a freshly seeded e2e database (never your dev data).
import { spawn, execSync } from "node:child_process";
import pg from "pg";

const url = process.env.DATABASE_URL;
const u = new URL(url);
const name = u.pathname.slice(1);
u.pathname = "/postgres";
const admin = new pg.Client({ connectionString: u.toString() });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
await admin.query(`CREATE DATABASE "${name}"`);
await admin.end();

const env = { ...process.env, APP_ENV: "test", PORT: "4100", REDIS_PREFIX: "pe:", SEED_SCALE: "full",
  CORS_ORIGINS: "http://localhost:4173", LOGIN_RATE_LIMIT_PER_MIN: "1000", CATALOG_RATE_LIMIT_PER_MIN: "100000", LOG_LEVEL: "warn" };
execSync("npx tsx src/seed/cli.ts reset --yes", { cwd: "server", env, stdio: "inherit" });
const api = spawn("npx", ["tsx", "src/index.ts"], { cwd: "server", env, stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { api.kill(sig); process.exit(0); });
api.on("exit", (code) => process.exit(code ?? 0));
