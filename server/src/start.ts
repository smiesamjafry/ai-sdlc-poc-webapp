// Production entry: migrate (a failure stops this instance, so Render keeps the previous deploy serving),
// seed an empty store, sync admin/staff logins from env, then start the API.
import { migrate } from "./db/migrate";
import { createPool, withTx } from "./db/pool";
import { loadConfig } from "./lib/config";
import { ensureStaffAccounts, seedDatabase } from "./seed/seed";

const cfg = loadConfig();
await migrate(cfg.databaseUrl);
const db = createPool(cfg.databaseUrl);
const { rows } = await db.query("SELECT count(*)::int AS n FROM products");
if (rows[0].n === 0) {
  const c = await withTx(db, (tx) => seedDatabase(tx, cfg), 0);
  console.log(`start: seeded empty store (${c.products} products, ${c.orders} orders)`);
}
const missing = await withTx(db, (tx) => ensureStaffAccounts(tx, cfg), 0);
if (missing.length) {
  console.warn(`start: ${missing.join(" and ")} not set; those admin logins are disabled until you set them in Render and restart.`);
}
await db.end();
await import("./index");
