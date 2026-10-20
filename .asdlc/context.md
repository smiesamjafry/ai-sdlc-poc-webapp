<!-- asdlc-context: describes 5295b5a554b1d8be635a691ed2d92eb330688323 (written 2026-10-20). Edit freely; ASDLC refreshes changed sections after merges. -->

# Pocket Shop: context for coding agents

Demo e-commerce store: React SPA (storefront + admin), Express API, Postgres (truth), Redis (cache only). Source: `CLAUDE.md`, `README.md`, `docs/`.

## Stack and versions
- Node 22 required (`scripts/setup.mjs`, `render.yaml`, `.github/workflows/ci.yml`). TypeScript ^5.9, ESM everywhere (`package.json` `"type": "module"`).
- SPA: React ^19.3, react-router-dom ^7 (`HashRouter`, `src/App.tsx`), Vite ^7 (`vite.config.ts`, `base: "./"`). No UI or state library.
- API: Express, Zod, pg, ioredis, jose (JWT), bcryptjs, pino, run with `tsx` (`server/package.json`).
- Tests: Vitest ^3 (+ jsdom, Testing Library) for unit; Vitest + supertest for API; Playwright ^1.64 for E2E.
- npm workspaces: `server` (`@pocket/server`), `shared` (`@pocket/shared`) (`package.json`).
- Postgres 16, Redis 7 via `docker-compose.yml` (host ports 55432 and 56379).
- Deploy: Render (`render.yaml`): API web service, static site, Postgres, Key Value. GitHub Pages for browse-only PR previews (`.github/workflows/preview.yml`, `pages.yml`).

## Folder map
- `src/` SPA: `App.tsx` (routes, header), `main.tsx`, `pages/` (Home, Products, ProductDetail, Cart, Checkout, Order, Auth, Account), `admin/` (AdminLayout, Dashboard, Products, Operations, Settings), `components/ui.tsx` (Price, Loading, ErrorNote, Empty), `lib/api.ts` (fetch, token refresh, `ApiProblem`), `lib/store.tsx` (session + cart context), `lib/env.ts`, `lib/types.ts`, `styles.css`.
- `server/src/`: `index.ts` / `start.ts` (start; `start.ts` migrates, seeds empty DB, then serves), `app.ts` (middleware + routers), `routes/` (`catalog.ts`, `shop.ts`, `admin.ts`, `health.ts`), `services/` (`auth`, `cart`, `checkout`, `payments`, `promotions`), `cache/` (`redis.ts`, `catalogCache.ts`, `config.ts`), `db/` (`pool.ts`, `migrate.ts`), `seed/` (`catalog.ts`, `seed.ts`, `reset.ts`, `cli.ts`), `middleware/` (`common.ts`, `rateLimit.ts`), `lib/` (`config.ts`, `errors.ts`, `ids.ts`, `log.ts`).
- `server/migrations/0001_init.sql` schema. `server/test/*.test.ts` API tests.
- `shared/src/`: `money.ts` (`formatPrice`, `roundHalfUp`), `pricing.ts` (`priceCart`), `index.ts`.
- `e2e/` Playwright specs (`admin.spec.ts`, `storefront.spec.ts`, `reset.serial.spec.ts`, `helpers.ts`); `e2e/asdlc/` is reserved for ASDLC acceptance tests (ignored by `playwright.config.ts`).
- `scripts/` (`setup.mjs`, `dev.mjs`, `e2e-api.mjs`), `docs/` (`api.md`, `errors.md`, `demo-runbook.md`, `specs/ecommerce-store-prd.md`), `public/` product SVGs, `TODOS.md` deferred work.

## Request flow
Browser → `src/lib/api.ts` (Bearer access token, `X-Cart-Token` for guests, refresh on `TOKEN_EXPIRED`) → API `server/src/app.ts`: requestId+log → CORS → JSON body (200kb) → optional bearer auth (`AuthService.middleware()`) → `/api/v1` routers (catalog, shop, admin) → `notFound` → `errorHandler` (problem+json). `/healthz` and `/` sit outside `/api/v1`.
- Catalog reads: `cached()` in `server/src/cache/catalogCache.ts`; key embeds `app_meta.catalog_version`; response has `X-Cache`. Stock is read live.
- Checkout: `server/src/services/checkout.ts` (idempotency key, stock lock, `priceCart`, `payments.ts` mock charge, order + events + outbox in one transaction).
- Admin: `mutate()` in `server/src/routes/admin.ts` wraps a transaction + `fenceEpoch` (reset fence); `audit()` writes `audit_log`. Role guards: `staff` (staff/admin) vs `admin`.
- Money totals: `shared/src/pricing.ts` `priceCart()`, called by `server/src/services/cart.ts` and checkout.

## Data
- Postgres schema: `server/migrations/0001_init.sql` (tables: app_meta, users, refresh_tokens, addresses, categories, products, product_images, variants, inventory_movements, store_settings, promotions, carts, cart_items, idempotency_keys, orders, order_items, order_events, payment_attempts, refunds, promotion_redemptions, order_access_tokens, email_outbox, audit_log). Applied by `server/src/db/migrate.ts`. Forward-only, additive; next file is `0002_<name>.sql`.
- Seed: `server/src/seed/catalog.ts` (apparel catalog), `seed.ts`, `reset.ts` (same code as admin "Reset demo data"), CLI `server/src/seed/cli.ts`. `SEED_SCALE=small` for tests, `full` otherwise.
- Redis (`server/src/cache/redis.ts`): catalog cache, dashboard cache (`TTL` in `cache/config.ts`), rate limits, cache counters. Fail-fast wrapper `cache.run()` returns `null` when down.
- Client storage: refresh tokens (customers in localStorage, staff/admin in sessionStorage) and cart token in localStorage (`src/lib/api.ts`).

## Commands (all from repo root)
- `npm ci`; `npm run setup` (Docker: Postgres+Redis, migrate, seed).
- `npm run dev` API :4000 + Vite :5173 (`scripts/dev.mjs`); `npm run dev:web`, `npm run dev:api`.
- `npm run typecheck` (root + server), `npm test` (Vitest: `src/**`, `shared/src/**`), `npm run test:api` (needs Postgres+Redis), `npm run test:e2e` (Playwright), `npm run build`, `npm run verify` (all).
- `npm run db:migrate`, `db:seed`, `db:reset -- --yes`.
- CI (`.github/workflows/ci.yml`, job `test`): ci, typecheck, test, test:api, build, playwright install, test:e2e.

## Environment variables (names only)
API (`server/.env.example`, `server/src/lib/config.ts`): `APP_ENV` (production|preview|development|test; not NODE_ENV), `DATABASE_URL`, `REDIS_URL`, `PORT`, `JWT_SECRET`, `CORS_ORIGINS`, `PREVIEW_ORIGINS`, `STOREFRONT_URL`, `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD`, `REDIS_PREFIX`, `SEED_SCALE`, `LOGIN_RATE_LIMIT_PER_MIN`, `CATALOG_RATE_LIMIT_PER_MIN`, `CACHE_TTL_{LIST,PRODUCT,CATEGORIES,SEARCH,DASHBOARD}_S`, `TRUST_PROXY_HOPS`, `LOG_LEVEL`, `RENDER_GIT_COMMIT`, `GIT_SHA`. Tests also use `E2E_DATABASE_URL`, `BASE_URL`. SPA build (`.env.example`, `src/lib/env.ts`): `VITE_API_URL`, `VITE_PREVIEW`, `VITE_BUILD_SHA`.
- Outside development/test, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `CORS_ORIGINS` are required; production also requires the seed admin/staff passwords.

## Test environments
- API tests: database `pocket_test`, Redis prefix `pt:` (`server/test/setup-env.ts`); files run serially (`server/vitest.config.ts`). Helpers in `server/test/helpers.ts`.
- E2E: `scripts/e2e-api.mjs` drops and recreates `pocket_e2e`, seeds, serves API on :4100; SPA is a production build on :4173 (`playwright.config.ts`). A `serial` project runs `*.serial.spec.ts` after the rest.

## External services
Postgres, Redis, Render, GitHub Pages. No payment, email or shipping provider: payments mocked in `server/src/services/payments.ts`; emails stored in `email_outbox`.

## Gotchas
- Preview origins (GitHub Pages) get anonymous GET only; sign-in and writes return `PREVIEW_READ_ONLY` (`server/src/middleware/common.ts`).
- Demo reset bumps an auth epoch; old tokens fail with `AUTH_EPOCH_CHANGED` (`services/auth.ts` `fenceEpoch`).
- A new card or body needs a new `Idempotency-Key`, since the request hash includes the card (`services/checkout.ts`).
- Catalog caches survive until `invalidateCatalog(tx)` runs; forgetting it serves stale data. Categories cache key is unversioned (`catalogCache.ts`), cleared by `flushCategoryCache`.
- Local DB port is 55432 and Redis 56379, not defaults.
- Protected paths per `CLAUDE.md`: `.github/`, `.asdlc/`, `e2e/asdlc/`, `render.yaml`, `playwright.config.*`, `vite.config.*`, `tsconfig*.json`, `package.json` scripts. No new dependencies without engineer approval.
- No linter or formatter config is present; `tsc --strict` and tests are the gates.
