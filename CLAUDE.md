# Pocket Shop

Small static React shop (Vite + React 19 + React Router `HashRouter`), deployed to GitHub Pages.
It is the target repo for the ASDLC Slack-to-PR proof of concept.

## Commands
- `npm run dev` — local dev server
- `npm run typecheck` — TypeScript, no emit
- `npm test` — unit tests (Vitest, jsdom)
- `npm run build` then `npm run preview` — production build served at http://localhost:4173/
- `npm run test:e2e` — Playwright regression suite in `e2e/` (builds and serves automatically)

## Layout
- `src/lib/` — pure logic: `catalog.ts` (seed products, search), `cart.ts` (cart math, localStorage), `auth.ts` (demo login)
- `src/pages/` — one component per route
- `src/App.tsx` — routes and shared state

## Conventions
- Keep logic in `src/lib/` and covered by a unit test next to it (`*.test.ts`).
- Prices are integer cents; format only with `formatPrice`.
- Use accessible names (labels, roles) so Playwright can select by role and text.
- No new dependencies without an engineer's approval.
- Do not edit `.github/`, `.asdlc/`, `e2e/asdlc/`, `playwright.config.*`, `vite.config.*`, `tsconfig*.json` or `package.json` scripts.

## Demo login
`demo@shop.test` / `demo1234` (fixture account for this static demo; not a secret).
