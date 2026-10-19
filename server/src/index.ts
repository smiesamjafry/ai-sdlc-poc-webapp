import { createApp } from "./app";
import { createPool } from "./db/pool";
import { Cache } from "./cache/redis";
import { ConfigError, loadConfig } from "./lib/config";
import { log, redactUrl } from "./lib/log";

let cfg;
try {
  cfg = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`pocket-shop-api: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
for (const w of cfg.warnings) log.warn(w);
const db = createPool(cfg.databaseUrl);
const cache = new Cache(cfg.redisUrl, cfg.redisPrefix);
const app = createApp(db, cache, cfg);
const server = app.listen(cfg.port, () => {
  log.info({ port: cfg.port, appEnv: cfg.appEnv, db: redactUrl(cfg.databaseUrl), version: cfg.version }, "listening");
});
const shutdown = () => {
  server.close(() => { void db.end(); void cache.quit(); process.exit(0); });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
