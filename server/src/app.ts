import express from "express";
import type { Db } from "./db/pool";
import type { Cache } from "./cache/redis";
import type { Config } from "./lib/config";
import { cors, errorHandler, notFound, requestId } from "./middleware/common";
import { rateLimit } from "./middleware/rateLimit";
import { AuthService } from "./services/auth";
import { catalogRouter } from "./routes/catalog";
import { shopRouter } from "./routes/shop";
import { adminRouter } from "./routes/admin";
import { healthReport } from "./routes/health";

/*
 *   request → requestId+log → CORS → JSON body → auth (optional bearer) → /api/v1 routers → problem+json errors
 */
export function createApp(db: Db, cache: Cache, cfg: Config) {
  const app = express();
  // Render terminates TLS in front of the service; one proxy hop gives the client IP in req.ip.
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.disable("x-powered-by");
  app.use(requestId);
  app.use(cors(cfg));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use(express.json({ limit: "200kb" }));

  app.get("/healthz", async (_req, res) => {
    const h = await healthReport(db, cache, cfg);
    res.status(h.db === "up" ? 200 : 503).json(h);
  });
  app.get("/", (_req, res) => res.json({ service: "pocket-shop-api", docs: "/api/v1", storefront: cfg.storefrontUrl }));

  const auth = new AuthService(db, cfg);
  const api = express.Router();
  api.use(auth.middleware());
  api.use(["/products", "/home", "/categories"], rateLimit(cache, "catalog", () => cfg.catalogRateLimit));
  api.use(catalogRouter(db, cache));
  api.use(shopRouter(db, cache, cfg, auth));
  api.use("/admin", adminRouter(db, cache, cfg, auth));
  app.use("/api/v1", api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
