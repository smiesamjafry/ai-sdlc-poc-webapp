import { createPool, withTx } from "../db/pool";
import { migrate } from "../db/migrate";
import { Cache } from "../cache/redis";
import { loadConfig } from "../lib/config";
import { seedDatabase, truncateAll } from "./seed";
import { resetDemo } from "./reset";

// npm run db:seed            → migrate, then seed only if the store is empty
// npm run db:reset -- --yes  → wipe and reseed (same code path as the admin reset button)
const [cmd, ...args] = process.argv.slice(2);
const cfg = loadConfig();
const db = createPool(cfg.databaseUrl);
try {
  await migrate(cfg.databaseUrl);
  if (cmd === "seed") {
    const { rows } = await db.query("SELECT count(*)::int AS n FROM products");
    if (rows[0].n > 0 && !args.includes("--force")) {
      console.log("seed: store already has data; skipping (use npm run db:reset -- --yes to start over)");
    } else {
      const c = await withTx(db, async (tx) => { await truncateAll(tx); return seedDatabase(tx, cfg); });
      console.log(`seed: ${c.products} products, ${c.variants} variants, ${c.users} users, ${c.orders} orders`);
    }
  } else if (cmd === "reset") {
    if (!args.includes("--yes")) {
      console.error("db:reset deletes all store data. Rerun as: npm run db:reset -- --yes");
      process.exit(1);
    }
    const cache = new Cache(cfg.redisUrl, cfg.redisPrefix);
    await new Promise((r) => setTimeout(r, 300));
    const { counts, warnings } = await resetDemo(db, cache, cfg, null);
    console.log(`reset: ${counts.products} products, ${counts.orders} orders${warnings.length ? ` (warnings: ${warnings.join(", ")})` : ""}`);
    await cache.quit();
  } else {
    console.error("usage: tsx src/seed/cli.ts seed|reset [--yes] [--force]");
    process.exit(1);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await db.end();
}
