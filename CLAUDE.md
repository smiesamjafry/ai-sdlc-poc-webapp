# Pocket Shop

Demo e-commerce store: React storefront + admin (Vite, React 19, React Router `HashRouter`), an Express API,
Postgres (source of truth) and Redis (cache only). It is the target repo for the ASDLC Slack-to-PR proof of concept.

## Commands
- `npm run setup` — start Postgres + Redis (Docker), migrate, seed. Needs Docker running.
- `npm run dev` — API on :4000 (watch) + storefront on :5173
- `npm run verify` — everything CI runs: typecheck (all workspaces), unit tests, API integration tests, Playwright E2E
- `npm run typecheck` · `npm test` (unit: `src/`, `shared/`) · `npm run test:api` (needs Postgres + Redis) · `npm run test:e2e`
- `npm run db:migrate` · `npm run db:seed` · `npm run db:reset -- --yes` (wipes and reseeds; same code as the admin reset)

## Layout
- `src/` — SPA. `pages/` storefront and account, `admin/` admin backend, `lib/api.ts` (fetch, auth refresh, errors), `lib/store.tsx` (session + cart state)
- `server/src/` — API. `routes/` (catalog, shop, admin, health), `services/` (auth, cart, checkout, payments, promotions), `cache/`, `db/`, `seed/`, `middleware/`
- `server/migrations/NNNN_name.sql` — schema
- `shared/src/` — code used by both sides: `money.ts` (`formatPrice`), `pricing.ts` (`priceCart`)
- `e2e/` — Playwright specs (start the API on :4100 with a fresh `pocket_e2e` database and a production SPA build on :4173)
- `docs/` — `api.md` (routes), `errors.md` (error codes), `demo-runbook.md`, `specs/` (PRD)

## Conventions
- Money is integer cents everywhere. Format only with `formatPrice`. Totals come only from `priceCart()` on the server.
- Migrations are forward-only and additive: add columns/tables, never drop or rename. One file per change, next number.
- Cache rules: any admin write to products, variants, prices, categories or settings must call `invalidateCatalog(tx)` inside its transaction (it bumps `app_meta.catalog_version`, which every catalog cache key embeds). Stock is never cached; read it live.
- Redis is never authoritative. Every Redis call goes through `cache.run(...)`, which returns `null` when Redis is down.
- Errors: throw `ApiError` / helpers in `server/src/lib/errors.ts`; responses are `application/problem+json` with a stable `code` and a `fix`. Add new codes to `docs/errors.md`.
- Admin mutations go through `mutate()` in `routes/admin.ts` (transaction + reset fence + audit log).
- Validate every input with Zod. Customer data queries are always scoped to `req.user.id`.
- Keep logic testable: pure functions next to a `*.test.ts`; API behaviour in `server/test/*.test.ts`.
- Use accessible names (labels, roles) so Playwright can select by role and text.
- No new dependencies without an engineer's approval.
- Do not edit `.github/`, `.asdlc/`, `e2e/asdlc/`, `render.yaml`, `playwright.config.*`, `vite.config.*`, `tsconfig*.json` or `package.json` scripts.

## Fixture logins (local, CI and `[render preview]` environments only; not secrets)
`admin@shop.test`, `staff@shop.test`, `demo@shop.test`, password `demo1234`. Production admin and staff passwords come from Render env vars.
Test cards: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined, `4000 0000 0000 9995` has insufficient funds.
