// npm run setup: start Postgres + Redis (Docker), migrate, seed, then print what to do next.
import { execSync } from "node:child_process";

const t0 = Date.now();
const run = (cmd, opts = {}) => execSync(cmd, { stdio: "inherit", ...opts });
const quiet = (cmd) => { try { execSync(cmd, { stdio: "ignore" }); return true; } catch { return false; } };

const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(`setup: Node ${process.versions.node} found; Node 22 or newer is required. Install it, then rerun npm run setup.`);
  process.exit(1);
}
if (!quiet("docker info")) {
  console.error("setup: Docker is not running. Start Docker Desktop (or `colima start`), then rerun npm run setup.");
  process.exit(1);
}
console.log("setup: starting Postgres and Redis…");
run("docker compose up -d --wait");
console.log("setup: migrating and seeding…");
run("npm run db:seed");
const secs = Math.round((Date.now() - t0) / 1000);
console.log(`
Ready in ${secs}s. Next:

  npm run dev

  Storefront   http://localhost:5173
  Admin        http://localhost:5173/#/admin
  API          http://localhost:4000/healthz

  Fixture logins (local only, password demo1234):
    admin@shop.test   staff@shop.test   demo@shop.test
  Test cards: 4242 4242 4242 4242 (paid) · 4000 0000 0000 0002 (declined)
`);
