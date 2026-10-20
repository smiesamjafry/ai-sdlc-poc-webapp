<!-- asdlc-context: describes 5295b5a554b1d8be635a691ed2d92eb330688323 (written 2026-10-20). Edit freely; ASDLC refreshes changed sections after merges. -->

# Conventions

Enforced by `CLAUDE.md` (human-reviewed) and `tsc --strict` (`tsconfig.json`, `server/tsconfig.json`). No ESLint/Prettier config exists. Match surrounding code.

## Structure
- Shared logic used by SPA and API goes in `shared/src/` (`shared/src/pricing.ts`); import as `@pocket/shared`.
- API: thin route handlers in `server/src/routes/`, business logic in `server/src/services/` (`services/checkout.ts`), cache code in `server/src/cache/`.
- SPA: one page component per route in `src/pages/` or `src/admin/`; shared UI in `src/components/ui.tsx`; server calls only via `src/lib/api.ts`; session/cart via `useStore()` (`src/lib/store.tsx`).
- Migrations: one file per change, next number, additive only, never drop or rename (`server/migrations/0001_init.sql`).
- Don't edit `.github/`, `.asdlc/`, `e2e/asdlc/`, `render.yaml`, `playwright.config.*`, `vite.config.*`, `tsconfig*.json`, `package.json` scripts. No new dependencies without approval.

## Naming and style
- TypeScript, ESM, double quotes, semicolons, 2-space indent, trailing commas in multi-line literals (`server/src/app.ts`).
- Components `PascalCase` in matching file names; functions/vars `camelCase`; DB columns `snake_case`, aliased to camelCase in SQL (`price_cents AS "priceCents"`, `routes/admin.ts`).
- Money fields end in `Cents` (`priceCents`, `totalCents`). Money is integer cents; format only with `formatPrice` (`shared/src/money.ts`, used in `src/components/ui.tsx`).
- Comments explain why or give a rule, short; block comments sketch flow (`server/src/app.ts`).

## State and data handling
- Totals come only from `priceCart()` on the server; the SPA never computes authoritative totals (`shared/src/pricing.ts`).
- Postgres is the source of truth; Redis is cache only. Every Redis call goes through `cache.run(...)`, which returns `null` when Redis is down (`server/src/cache/redis.ts`).
- Any admin write to products, variants, prices, categories or settings calls `invalidateCatalog(tx)` inside its transaction (`routes/admin.ts` `saveProduct`). Stock is never cached.
- Admin mutations go through `mutate()` (transaction + reset fence) and write an `audit()` row (`routes/admin.ts`).
- Customer data queries are always scoped to `req.user.id` (`routes/shop.ts`).
- Validate every input with Zod; use `parse(schema, input)` (`middleware/common.ts`; schemas in `routes/admin.ts`).
- Wrap handlers in `ah(...)` so async errors reach the error handler.
- Use parameterized SQL (`$1, $2`); never interpolate user input.
- IDs from `uuid()` in `server/src/lib/ids.ts`.

## Error handling
- Throw `ApiError` or helpers from `E` in `server/src/lib/errors.ts` (`E.notFound("Product")`, `E.validation({...})`). Responses are `application/problem+json` with stable `code`, `fix`, `requestId`.
- Add every new code to `docs/errors.md` (table row with anchor).
- Update `docs/api.md` when adding or changing routes.
- SPA catches `ApiProblem` and shows it with `ErrorNote` (`src/components/ui.tsx`), which shows `detail` and `fix`.
- Log with pino (`server/src/lib/log.ts`) using structured fields and the request id.

## Styling
- One global stylesheet, `src/styles.css`, plain class names (`topbar`, `notice error`, `muted`, `banner`). No CSS framework. Buttons and inputs are 44px high with visible focus states.

## Accessibility
- Every control has an accessible name (labels, roles, text) so Playwright selects by role (`e2e/helpers.ts`: `getByLabel("Email")`, `getByRole("button", { name: "Add to cart" })`).
- Loading uses `role="status"`, errors `role="alert"` (`src/components/ui.tsx`). Option groups are `role="group"` named by legend (Colour, Size). Images have alt text naming the product. Current nav link uses `NavLink` (`aria-current`).

## Tests
- Keep logic pure and testable: pure function beside a `*.test.ts` (`shared/src/pricing.test.ts`, `src/lib/env.test.ts`). Unit tests run with Vitest, jsdom, globals on (no import of `describe/it`).
- API behaviour: `server/test/<area>.test.ts` with supertest against real Postgres + Redis via `setup()` from `server/test/helpers.ts` (`checkout.test.ts`, `admin.test.ts`, `auth.test.ts`, `catalog.test.ts`, `platform.test.ts`).
- E2E: `e2e/*.spec.ts` with Playwright, `await page.goto("./#/...")` (hash routes), role/label locators, shared helpers in `e2e/helpers.ts`. Tests that reset data are named `*.serial.spec.ts`. ASDLC acceptance tests go in `e2e/asdlc/`.
- Test titles are plain sentences describing behaviour (`"searching by name shows only matches, each with its image"`). Use `it.each` tables for rule matrices.
- Fixture logins: `admin@shop.test`, `staff@shop.test`, `demo@shop.test`, password `demo1234`. Test cards: `4242 4242 4242 4242` OK, `4000 0000 0000 0002` declined, `4000 0000 0000 9995` insufficient funds.

## Review checklist
- Money in cents, formatted via `formatPrice`. Totals from `priceCart`.
- Cache invalidation present for catalog writes; no Redis call outside `cache.run`.
- Zod validation, ownership scoping, role guards (`staff` vs `admin`) on new routes.
- New error codes and routes documented. Migration additive.
- Tests added at the right level; `npm run verify` passes.
