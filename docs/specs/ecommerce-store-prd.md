<!-- /autoplan restore point: "/Users/miesam/Desktop/ai-sdlc-poc-webapp/.gstack/tmp/autoplan/docs-ecommerce-prd-autoplan-restore-20261020-024144.md" -->
## Implementation plan
# PRD: Pocket Shop → Full E-commerce Store (Storefront + Admin)

| | |
|---|---|
| **Status** | Draft for review |
| **Repo** | `smiesamjafry/ai-sdlc-poc-webapp` |
| **Catalog** | Apparel & accessories |
| **Stack** | React SPA (Render static site; GitHub Pages for PR previews) · Node/Express API · Render Postgres · Render Key Value (Redis) |
| **Payments** | Mock provider (no real money) |
| **Last updated** | 2026-10-20 |

---

## 1. Problem Statement

Pocket Shop is the target repo for the ASDLC Slack-to-PR proof of concept, but it is a static, six-product demo with no backend. Its catalog, cart, and "orders" exist only in the JS bundle and in `localStorage`. Because of that, every change the agent can make is a frontend-only change. That **undersells the POC**. Stakeholders can't see Claude handle the work real engineering teams do every day: schema changes, API endpoints, cache invalidation, and admin tooling that changes what customers see.

We need a store with a real data layer and a real operator workflow. Then a Slack request like "add a 20%-off sale on hoodies" or "low-stock items should show a badge" produces a change that runs from database to API to cache to UI, and can be seen in both the storefront and the admin backend.

## 2. Goals

| # | Goal | Type | Measure |
|---|---|---|---|
| G1 | A shopper can go from browsing to a placed order end to end, against a real database | User | The checkout E2E test passes against the API. Orders persist across browsers and devices. |
| G2 | An admin can manage the catalog, inventory, orders, promotions and customers without touching code | User | Every P0 admin story is covered by an E2E test |
| G3 | The caching layer is *visible* and measurable in a demo | Demo | Catalog reads return `X-Cache: HIT/MISS`. The admin dashboard shows the cache hit rate. Edits invalidate within 1 s. |
| G4 | Typical Slack feature requests turn into a green ASDLC PR that touches more than one layer | Business (POC) | ≥ 8 of the 10 scripted demo requests (§10) produce a PR that passes CI without a human editing the code |
| G5 | The store stays fast and cheap enough to demo live | Non-functional | p95 catalog API < 150 ms with a warm cache. Total Render cost ≤ the starter tiers. |

## 3. Non-Goals

| Non-goal | Why it is out of scope |
|---|---|
| **Real payment processing** (Stripe, PayPal, etc.) | Mock payments were chosen. A payment-provider *interface* is specified so a real provider can be added later (P2). |
| **Production-grade security and compliance** (PCI, GDPR tooling, SOC2) | This is a demo. We still follow sound basics (hashed passwords, RBAC, input validation), but there are no audits or legal workflows. |
| **Multi-currency, multi-language, multi-store** | Adds complexity without demo value. USD and English only. |
| **Real shipping carriers and tax engines** | Flat-rate and threshold shipping plus a single configurable tax rate cover the demo. Carrier APIs are P2. |
| **Native mobile apps / headless CMS / marketplace (multi-vendor)** | Separate initiatives. The responsive web app is enough. |
| **Server-side rendering / SEO optimisation** | It stays a static SPA (Render static site in production, GitHub Pages for PR previews). |

## 4. Personas

- **Shopper (guest)**: browses and buys without an account.
- **Customer (registered)**: has an account, order history, saved addresses and a wishlist.
- **Store Admin**: full control of the catalog, orders, promotions, customers, settings and staff.
- **Store Staff**: day-to-day operations (orders, inventory). Cannot change settings or staff.
- **Demo Presenter**: drives the POC from Slack and needs visible, resettable state.

## 5. Architecture Overview

```
 Render static site (SPA, HashRouter)      Render
 ┌──────────────────────────┐   HTTPS   ┌──────────────────────┐
 │ Storefront  /#/...       │ ───────▶ │ API  (Node/Express)  │
 │ Admin       /#/admin/... │  Bearer   │  /api/v1/...         │
 └──────────────────────────┘   token   └──────┬────────┬──────┘
                                               │        │
                                     ┌─────────▼──┐  ┌──▼──────────────┐
                                     │ Postgres   │  │ Key Value/Redis │
                                     │ (source of │  │ cache entries,  │
                                     │  truth)    │  │ rate limits,    │
                                     └────────────┘  │ cache metrics   │
                                                     └─────────────────┘
```

**Key decisions**
- **One SPA, two areas.** The storefront and admin share the existing Vite app. Admin lives under `/#/admin/*` behind role guards. Production serves it from a Render static site (its own origin); GitHub Pages keeps serving untagged PR previews, which can only make anonymous GET calls to the production API.
- **Token auth, not cookies.** `*.github.io` and `*.onrender.com` are both on the Public Suffix List, so cookies would be cross-site. Use a short-lived access token (15 min) held in memory, plus a refresh token rotated on use: customers keep it in `localStorage`, staff and admin in `sessionStorage` (per tab, see Q6).
- **Postgres is the source of truth. Redis is never authoritative.** Redis holds only rebuildable data: cache entries, rate-limit counters and cache metrics. Carts and stock live in Postgres, so a Redis outage degrades latency and rate limiting, never correctness.
- **API layout:** a new `server/` workspace in the same repo (TypeScript, Express, Zod validation, a SQL migration tool, Vitest). The shared types live in `shared/`.
- **Money stays integer cents.** This extends the existing `formatPrice` convention to the API and the database.

### 5.1 Caching Strategy (the demo centrepiece)

| What | Pattern | Key | TTL | Invalidation |
|---|---|---|---|---|
| Product list pages (by category, filter, sort, page) | Cache-aside | `catalog:v{ver}:list:{sha1(normalized query)}` | 5 min | Any admin product, variant, price, category or status write increments `catalog:ver`, orphaning all list, detail and search keys |
| Product detail (content only) | Cache-aside | `catalog:v{ver}:product:{slug}` | 10 min | Version bump (admin writes, version stored in Postgres). Stock is read live per request; list pages may show stock up to 5 min stale; checkout always re-checks stock in Postgres |
| Category tree / nav | Cache-aside | `categories:tree` | 1 h | On category write |
| Search results | Cache-aside | `catalog:v{ver}:search:{sha1(normalized q + filters)}` | 2 min | Version bump |
| Rate limiting | Sliding window | `rl:{ip|user}:{route}` | 1 min | — |
| Admin dashboard KPIs | Cache-aside | `stats:dashboard` | 60 s | — |

Demo affordances:
- Every cacheable response carries `X-Cache: HIT|MISS` and `X-Cache-Key`.
- The admin **System → Cache** page shows the hit rate, key counts by prefix, a "flush catalog cache" button, and the last 20 invalidation events.
- The storefront footer can show an optional "served from cache" badge, toggled by `?debug=1`.

### 5.2 Core Data Model (Postgres)

`users` (id, email, password_hash, name, role: customer/staff/admin, status, token_version) · `refresh_tokens` (user_id, token_hash, expires_at, rotated_at, revoked_at) · `app_meta` (auth_epoch; never truncated by demo reset) ·
`addresses` · `categories` (tree via parent_id, slug, sort) ·
`products` (slug, name, description, brand, status: draft/active/archived, seo fields) ·
`product_images` · `product_options` (e.g. Size, Colour) ·
`variants` (sku, option values, price_cents, compare_at_cents, stock_on_hand, low_stock_threshold) ·
`inventory_movements` (audit of every stock change) ·
`carts` (user_id or guest_token, unique) / `cart_items` · `orders` (number, idempotency_key UNIQUE, status, totals snapshot, addresses snapshot) ·
`order_items` (price snapshot) · `payment_attempts` (idempotency_key, order_id nullable, provider, status, decline_reason) ·
`shipments` (carrier, tracking) · `refunds` · `returns` ·
`promotions` (type, value, conditions, schedule) / `coupon_codes` / `promotion_redemptions` ·
`reviews` (rating, body, status: pending/approved/rejected) · `wishlist_items` ·
`shipping_rates` · `tax_settings` · `store_settings` · `audit_log` · `email_outbox`

Rules: soft-delete only for products and customers. Orders copy prices and addresses at purchase time so later edits don't change history.

---

## 6. User Stories

### Shopper / Customer
1. As a shopper, I want to browse products by category, with filters (size, colour, price, in stock) and sorting, so I can find what fits me quickly.
2. As a shopper, I want to search case-insensitively and partially ("hood" finds "Zip Hoodie"), so typos and casing don't hide products.
3. As a shopper, I want a product page with images, size/colour pickers, the price (with the sale price shown against the original price), stock status and reviews, so I can decide confidently.
4. As a shopper, I want to be told when the variant I chose is out of stock *before* I add it to my cart, so I'm not surprised at checkout.
5. As a shopper, I want my cart to persist and to show line totals that respect quantity, so the total I see is the total I pay.
6. As a shopper, I want to apply a coupon code and see the discount itemised, or get a clear reason it was rejected (expired, minimum not met).
7. As a guest, I want to check out without creating an account, so I'm not forced to register.
8. As a shopper, I want to see shipping and tax before I pay, so there are no hidden costs.
9. As a shopper, I want a clear decline message if my (mock) payment fails, with my cart kept intact, so I can retry.
10. As a customer, I want to register, sign in, reset my password and manage my saved addresses.
11. As a customer, I want to see my order history and each order's status and tracking, so I don't need to contact support.
12. As a customer, I want to save items to a wishlist and move them to my cart later.
13. As a customer, I want to leave a rating and review for something I bought.
14. As a customer, I want to request a return for an eligible order item.
15. As a guest who later signs in, I want my guest cart merged into my account cart, so nothing is lost.

### Store Admin / Staff
16. As an admin, I want a dashboard with today's revenue, orders, average order value, low-stock items and the cache hit rate, so I can see the store's health at a glance.
17. As an admin, I want to create and edit products with variants, images, prices, sale prices and a draft/active status, so I can merchandise without a developer.
18. As an admin, I want product edits to appear on the storefront within seconds, so I can trust what customers see.
19. As staff, I want to adjust stock with a reason and see the movement history, so inventory discrepancies can be traced.
20. As staff, I want low-stock and out-of-stock lists, so I can reorder in time.
21. As staff, I want to view, filter and search orders, and move them through fulfilment (paid → packed → shipped with tracking → delivered).
22. As an admin, I want to cancel or refund an order (fully or partially), with stock restocked when appropriate.
23. As an admin, I want to create promotions (percentage or fixed off, free shipping, buy-X-get-Y) scoped to products, categories or the whole order, with start/end dates and usage limits.
24. As an admin, I want to view customers, their orders and lifetime value, and disable an abusive account.
25. As an admin, I want to moderate reviews before they are published.
26. As an admin, I want to configure store settings (name, currency display, tax rate, shipping rates, free-shipping threshold, low-stock threshold default).
27. As an admin, I want to invite staff and assign roles, so access matches responsibility.
28. As an admin, I want an audit log of who changed what, so mistakes can be traced.
29. As staff, I must **not** be able to change settings, staff or refunds above a limit. Attempts are blocked and shown a clear message.

### Demo Presenter
30. As the presenter, I want a one-command **reset and seed** (~40 apparel/accessory products, ~25 customers, ~120 historical orders), so every demo starts from a known state.
31. As the presenter, I want PR previews to call the deployed demo API, or their own preview API for PRs tagged `[render preview]`, so I can click through a Slack-generated PR (including backend changes) before merging.

---

## 7. Requirements

### P0: Must-Have (MVP)

#### Platform
| ID | Requirement | Acceptance criteria |
|---|---|---|
| PL-1 | **API service** on Render with versioned REST (`/api/v1`), Zod-validated input, `application/problem+json` errors with `code`, `fields`, `fix` and `retryable` (see the error contract at the end of this plan) | Invalid input returns 422 with field errors. Unknown routes return 404 JSON. `/healthz` reports DB and Redis status. |
| PL-2 | **Postgres schema + migrations** for the §5.2 tables needed by P0 stories | `npm run db:migrate` is idempotent. CI runs the migrations against a service container. |
| PL-3 | **Redis cache layer** per §5.1 for list, detail, categories and search | Second identical request → `X-Cache: HIT`. A product edit → the next request is a `MISS` with new data, within 1 s. **If Redis is down the API still serves from Postgres** (tested). |
| PL-4 | **Seed and reset script** (story 30) | `npm run db:seed` gives a deterministic dataset. Running it twice gives identical rows except timestamps, which are relative to seed time. |
| PL-5 | **Auth**: register/login/refresh/logout, bcrypt/argon2 hashes, roles `customer/staff/admin`, a route guard on the API and SPA | A customer token on `/api/v1/admin/*` → 403. An expired access token refreshes silently once. Rate limit: 10 login attempts / min / IP. |
| PL-6 | **Frontend API client** replacing the static `PRODUCTS`/`localStorage` logic | `VITE_API_URL` is configurable per build. Loading, empty and error states exist on every data view. |
| PL-7 | **CI** runs typecheck, unit, API integration (Postgres + Redis service containers) and Playwright E2E against a locally started API | The pipeline is green on `main`. E2E needs no external network. |

#### Storefront
| ID | Requirement | Acceptance criteria |
|---|---|---|
| SF-1 | **Home page**: hero, featured categories, new arrivals, on-sale strip | Content comes from the API. Featured items are set in admin. |
| SF-2 | **Catalog listing** with category nav, filters (size, colour, price range, in stock), sort (newest, price ↑↓, best-selling), pagination | Filter state lives in the URL (shareable). The empty result shows "No products match" with a "clear filters" button. |
| SF-3 | **Search**: case-insensitive, partial match on name/description/SKU | "hood", "HOOD" and "Hood" return the same results. A blank query returns everything. |
| SF-4 | **Product detail**: gallery, variant selector, price/compare-at price, stock status ("Only 3 left" ≤ threshold, "Out of stock"), description | Out-of-stock variants are disabled in the selector. "Add to cart" is disabled until a valid variant is chosen. |
| SF-5 | **Cart**: add/update/remove, line totals = price × qty, subtotal, persisted in Postgres (guest cart keyed by an opaque cart token kept in `localStorage`; customer cart by user id), merged on login | Quantity cannot exceed available stock (shows a message). Totals are always calculated on the server. |
| SF-6 | **Coupons** at cart/checkout | Valid code → discount line. Invalid code → a specific reason. Only one code per order (P0). |
| SF-7 | **Checkout** (guest or signed in): contact, shipping address, shipping method, order review, mock payment | Totals per §7.1. The client sends an idempotency key. In one Postgres transaction the API locks the variant rows (`SELECT … FOR UPDATE`), re-checks stock, calls the synchronous mock payment, then writes the order as `paid` and decrements stock. On decline nothing is written except a `failed` payment attempt. |
| SF-8 | **Mock payment provider** behind a `PaymentProvider` interface | Card `4242 4242 4242 4242` → success. `4000 0000 0000 0002` → decline. `4000 0000 0000 9995` → "insufficient funds". On decline the cart is kept and stock is untouched. |
| SF-9 | **Order confirmation** page + order number + confirmation "email" (written to `email_outbox`; a read-only Outbox list in admin, P0) | Refreshing the confirmation page does not create a duplicate order (idempotency key). |
| SF-10 | **Customer account**: profile, addresses, order history and order detail with status timeline | A customer can only see their own orders (verified by a test). |

#### Admin
| ID | Requirement | Acceptance criteria |
|---|---|---|
| AD-1 | **Admin shell** at `/#/admin` with sidebar nav and a role guard | Non-staff are redirected to sign-in with a "not authorised" message. |
| AD-2 | **Dashboard**: revenue (today/7d/30d), order count, AOV, top products, low-stock list, cache hit rate | KPIs match a SQL reference query in the integration test. |
| AD-3 | **Products CRUD** with options/variants, images (by URL in P0), price, compare-at price, status, category assignment | Saving invalidates the relevant cache keys (asserted). Draft products are invisible on the storefront. A slug is unique. |
| AD-4 | **Categories CRUD** (nested, ordering) | Deleting a category that has products is blocked, with a message. |
| AD-5 | **Inventory**: per-variant stock adjust with reason, movement history, low/out-of-stock views | Every change writes an `inventory_movements` row. Stock can never go negative. |
| AD-6 | **Orders**: list with filters (status, date, customer, total), detail, status transitions, tracking number, cancel, full/partial refund | Illegal transitions are rejected (e.g. delivered → paid). Cancel and refund restock when chosen. The refund amount is ≤ the amount paid. |
| AD-7 | **Promotions & coupons**: percentage, fixed and free-shipping types, scoped to all/categories/products, schedule, minimum subtotal, total and per-customer usage limits | Expired or not-yet-started promotions are never applied. The usage limit is enforced under concurrent checkouts (test). |
| AD-8 | **Customers**: list/search, detail with orders and lifetime value, disable/enable | A disabled customer cannot sign in, and existing tokens are revoked. |
| AD-9 | **Settings**: store name, tax rate, flat shipping rate, free-shipping threshold, default low-stock threshold | Changes apply to new carts immediately (settings cache invalidated). |
| AD-10 | **System → Cache** page (§5.1 demo affordances) | Shows hit rate, keys by prefix and `/healthz`. "Flush catalog" asks for confirmation, works and is audit-logged. |

**§7.1 Totals, §7.2 Permissions, §7.3 Auth and reset:** see the accepted delivery requirements at the end of this plan.

### P1: Nice-to-Have (fast follow)

| ID | Requirement | Notes |
|---|---|---|
| P1-1 | Wishlist (story 12) | Postgres for guests (cart token) and customers |
| P1-2 | Reviews + moderation (stories 13, 25) | Only verified buyers can review. Average rating is cached. |
| P1-3 | Returns/RMA flow (story 14) | Admin approves, then receives, then refunds. Restock on receive. |
| P1-4 | Staff management & granular RBAC (stories 27, 29) | Invite by email (outbox), staff refund limit |
| P1-5 | Audit log UI (story 28) | Writes start in P0. This adds the viewer. |
| P1-6 | Password reset & email verification | Via `email_outbox`; adds resend/purge actions to the P0 Outbox list |
| P1-7 | Buy-X-get-Y and automatic (code-less) promotions | Extends the promotion engine |
| P1-8 | Bulk product CSV import/export | Async job, progress in admin |
| P1-9 | Image upload (Render disk or S3-compatible) instead of URL-only | |
| P1-10 | "Recently viewed" and "related products" | Redis sorted sets; per-viewer history is an allowed ephemeral exception to the Redis rule (losing it loses nothing of record) |
| P1-11 | Abandoned-cart list in admin | Carts idle > 24 h with an email address |
| P1-12 | Sales reports with CSV export (by day, product, category) | |

### P2: Future Considerations (design for, don't build)

- **Real payment provider** (Stripe) via the `PaymentProvider` interface and a webhook endpoint. Keep payment state transitions explicit now.
- **Carrier rates and real tax** via `ShippingRateProvider` / `TaxProvider` interfaces.
- **Multi-currency / i18n**: keep `currency` columns on orders and money fields now.
- **Event bus** (order.placed, stock.low) for webhooks and integrations. Writing `email_outbox` now is the seed of this.
- **Full-text search engine** (Postgres FTS → Meilisearch). Keep search behind a `SearchService`.
- **Gift cards, store credit, loyalty points.**
- **Server-side rendering for SEO.**

---

## 8. Success Metrics

**Leading (measured during the build and the first demos)**
| Metric | Target | Stretch | How measured |
|---|---|---|---|
| Checkout E2E pass rate on `main` | 100% | — | GitHub Actions history |
| Catalog cache hit rate during a scripted demo | ≥ 80% | ≥ 95% | Admin cache page / Redis INFO |
| p95 API latency, catalog list (warm cache) | < 150 ms | < 60 ms | API timing log, k6 smoke |
| Time from admin product edit to the storefront reflecting it | < 1 s | < 250 ms | Integration test timestamp |
| Slack request → PR opened (median) | < 15 min | < 8 min | ASDLC orchestrator logs |

**Lagging (measured over the POC evaluation window)**
| Metric | Target | How measured |
|---|---|---|
| Scripted demo requests merged without a human editing the code (§10) | ≥ 8 / 10 | PR history |
| Share of ASDLC PRs that touch more than one layer (DB/API/cache/UI) | ≥ 50% | PR diff classification |
| Stakeholder go/no-go on extending ASDLC to a real product repo | "Go" | POC review |

---

## 9. Open Questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| Q1 | ~~Guardrails vs. Phase 0~~ **Resolved 2026-10-20:** one-time engineer approval for this build to add dependencies and edit `.github/`, `package.json` scripts and config. The CLAUDE.md guardrails stay in force for the Slack agent afterwards. | Engineering | Resolved |
| Q2 | ~~Locked T-2 test~~ **Resolved 2026-10-20:** retire `e2e/asdlc/T-2` (it asserts the 6-product static catalog); its intent moves into a regular E2E (see the delivery requirements in §11). | Engineering | Resolved |
| Q3 | ~~Preview databases~~ **Resolved 2026-10-20:** untagged PRs get a GitHub Pages preview that can only make anonymous GET calls to the production API (no sign-in, no admin). A PR whose title contains `[render preview]` gets its own Render preview environment (web + API + Postgres + Key Value, own origins, expires after 3 days, admin enabled with fixture passwords), so backend PRs can be clicked through before merge. Destructive admin actions (reset, cache flush) need an explicit confirmation. | Engineering | Resolved |
| Q4 | ~~Demo backlog~~ **Resolved 2026-10-20:** the demo backlog is tracked outside this repo. | Demo owner | Resolved |
| Q5 | ~~Render plan~~ **Resolved 2026-10-20:** Render workspace "miesam's playground", paid tiers: API web service Starter, Postgres basic-256mb, Key Value Starter (about $23/month, estimated). | Stakeholder | Resolved |
| Q6 | ~~Admin origin~~ **Resolved 2026-10-20:** admin stays in the same SPA, served in production from the Render static site. PR previews run on other origins (GitHub Pages or per-PR Render URLs), so preview code cannot read production tokens. Staff/admin refresh tokens still live in `sessionStorage` (per tab); customers use `localStorage`. | Engineering / Security | Resolved |
| Q7 | ~~Product imagery~~ **Resolved 2026-10-20:** generated per-product SVG placeholders committed under `public/products/` (no licensing, no network in tests). | Design | Resolved |

---

## 10. Scripted Slack Demo Requests (acceptance set for G4)

None of these is built by the P0 delivery, and each touches more than one layer:

1. "Customers can **save items to a wishlist** and move them to the cart." *(migration + API + account UI)*
2. "Let buyers **leave a star rating and review**, and show the average on the product page." *(migration + API + cache invalidation + UI)*
3. "Add an **Abandoned carts** page to admin listing carts idle over 24 hours." *(SQL + admin API + admin UI)*
4. "Show **'Recently viewed'** products on the product page." *(Redis sorted set + API + UI)*
5. "Customers should be able to **re-order** a past order in one click." *(API + account UI + stock checks)*
6. "Cache the **product detail** for 30 minutes instead of 10, and show each key's TTL on the cache page." *(cache config + admin API + UI)*
7. "Block checkout when a US shipping address has an invalid ZIP code, with an inline error." *(validation on both API and UI)*
8. "Let admins **export sales by day as CSV**." *(SQL + admin API + download UI)*
9. "Write a **low-stock alert** to the outbox when a variant drops below its threshold." *(domain event + outbox + admin)*
10. "Email customers when their order **ships**." *(order state hook + outbox + admin)*

---

## 11. Timeline & Phasing

**Delivery decision (2026-10-20):** an engineer session builds and deploys all of P0 now (Phases 0-3 below as one delivery). The ASDLC/Slack agent then works the P1 backlog and §10 against the running store.

| Phase | Scope | Who | Exit criteria |
|---|---|---|---|
| **0. Foundations** | `server/` workspace, Render services (API, Postgres, Key Value) via `render.yaml`, migrations, CI with service containers, `VITE_API_URL`, seed script, CLAUDE.md updates | Engineer session | `/healthz` green on Render. CI green. |
| **1. Read path + cache** | PL-3, PL-6, SF-1–SF-4, AD-1, AD-10, retire the static catalog | Engineer session | Catalog served from the API with `X-Cache` headers. The cache page works. |
| **2. Transactions** | PL-5, SF-5–SF-10, mock payments | Engineer session | Guest and customer checkout E2E green. No overselling under a 20-way concurrent test. |
| **3. Admin operations** | AD-2–AD-9 | Engineer session | All P0 admin stories have E2E coverage. |
| **4. Demo hardening** | §10 dry run, latency budget | Mixed | ≥ 8/10 scripted requests pass in a dry run. |
| **5. P1 backlog** | §7 P1 items, driven live from Slack | ASDLC | — |

**Dependencies:** Render workspace and plan (resolved, Q5) · guardrail approval (resolved, Q1) · the orchestrator able to provide the DB/Redis env to the `check` job (service containers in `asdlc-run.yml`, engineer-owned).

**Suggested ticket granularity for ASDLC:** one route or one admin screen per ticket, each with Given/When/Then acceptance tests mapped to a `e2e/asdlc/T-N` spec, so the agent always has a runnable definition of done.

<!-- autoplan-accepted:ceo -->
- Delivery: build and deploy all P0 requirements (PL-1..7, SF-1..10, AD-1..10) in this session; P1 and §10 stay as the Slack/ASDLC backlog. Verify: CI runs unit, API integration and Playwright E2E locally against Postgres + Redis service containers (no external network); after deploy, a read-only smoke script checks `/healthz`, catalog list (MISS then HIT) and the Pages site loads; one manual checkout on the deployed store confirms the write path.
- §7.1 Totals (server is the only calculator): line = unit_price_cents × qty; subtotal = Σ lines; discount: percentage = round_half_up(eligible_subtotal × pct / 100), fixed = min(value, eligible_subtotal), free_shipping zeroes shipping; one code per order. shipping = 0 if (subtotal − discount) ≥ free_shipping_threshold else flat_rate. tax = round_half_up((subtotal − discount) × tax_rate_bps / 10000), with `tax_rate_bps` an integer setting (825 = 8.25%); shipping is not taxed. total = subtotal − discount + shipping + tax. Verify: table-driven unit tests including rounding at .5 cent and threshold equality.
- §7.2 P0 permission matrix. customer: own cart, orders, profile, addresses. staff: admin read of products, orders, customers, inventory, outbox; order status transitions, tracking, cancel; stock adjust. admin: everything staff can do plus product/category CRUD, promotions (AD-7), refunds, settings (AD-9), customer disable, cache flush, demo reset. Screens: dashboard (AD-2) staff+admin; System/Cache page (AD-10) staff read, admin flush; promotions and settings pages admin-only and hidden from staff; a staff call to an admin-only route returns 403 and the UI shows "Only admins can do this". Verify: integration test matrix asserts 403 for each forbidden role/route pair listed here.
- Demo reset (pulls the PRD Phase 4 reset forward): admin-only `POST /api/v1/admin/demo/reset` with body `{"confirm":"RESET"}` truncates and re-seeds in one transaction, then flushes all Redis keys under the app prefix, increments `app_meta.auth_epoch` (a table reset never truncates; access tokens carry `ep` and are rejected when it differs), deletes all refresh tokens and writes an audit row; the admin UI asks for typed confirmation. Verify: integration test mutates a product, resets, and the next catalog read is `X-Cache: MISS` with seed values; a token issued before reset gets 401; two resets in a row each invalidate tokens issued between them.
- Request ids and logs: accept inbound `X-Request-Id` only if it matches `^[A-Za-z0-9-]{8,64}$`, else generate a UUID v4; echo it on every response; one JSON log line per request (method, path, status, duration_ms, user_id, request_id); error bodies include `requestId`. Verify: integration tests for echo, regeneration of an invalid id, and error body field.
- `/healthz` returns `{db, redis, version, uptimeSec}` (E3 folded in, no separate endpoint); 200 when DB is up even if Redis is down (redis:"down"); 503 when DB is down. The admin System page shows it. Verify: integration test with Redis stopped.
- CORS: API allows only origins in `CORS_ORIGINS` (prod: `https://smiesamjafry.github.io`; dev: `http://localhost:5173`, `http://localhost:4173`); other origins get no CORS headers. Verify: integration test for allowed and rejected origin.
- Auth tokens: access JWT 15 min with `sub`, `role`, `tv` (token_version) and `ep` (auth epoch); each request loads the user and rejects disabled users, a stale `tv` or an `ep` that differs from `app_meta.auth_epoch`; refresh tokens are random, stored hashed in Postgres, rotated on use and revoked on logout, disable and reset. Express `trust proxy` = 1 so per-IP login rate limits work behind Render. Verify: tests for disabled user 401, refresh rotation, reuse of a rotated refresh token rejected.
- Seed: deterministic PRNG (fixed seed); order timestamps are relative to seed time (now − N days) so dashboard 7d/30d windows always have data. Seeded accounts: admin@shop.test (admin), staff@shop.test (staff), demo@shop.test (customer). Locally and in CI all use the fixture password demo1234. On the deployed store, admin and staff passwords come from `SEED_ADMIN_PASSWORD` / `SEED_STAFF_PASSWORD` env vars (the seed refuses to run in production without them); only demo@shop.test keeps the public fixture password. Verify: seeding twice yields identical product/variant/price rows.
- Cutover: the SPA ignores the old `pocket-shop.cart` / `pocket-shop.session` localStorage keys and removes them on first load. Verify: unit test.
- Secrets/env: API needs `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (generated by Render), `CORS_ORIGINS`, `NODE_ENV`, `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD`; SPA build needs `VITE_API_URL`. Documented in README. Verify: API refuses to start with a clear message when a required var is missing.
- PRD Q2 corrected (CI skips `e2e/asdlc`). Verify: Q2/Q4 text in §9.
- Stock cache rule: every stock change (checkout, staff adjust, cancel/refund restock) deletes that product's `catalog:v{ver}:product:{slug}` key in the same request after commit; list pages may show stock up to 5 min stale. Verify: integration test adjusts stock and the next detail read is a MISS with the new stock.
- Payment retry: an idempotency key whose attempts are all `failed` may be retried; a key with a `paid` order returns that order (HTTP 200, same order number) without charging again. Verify: tests for decline-then-retry-success and double submit.
- Retire `e2e/asdlc/T-2` (it asserts the 6-product static catalog); its intent (every product card shows an image with alt text naming the product) moves into a regular E2E in `e2e/`. Verify: new E2E passes; T-2 directory removed in this PR.
- Preview environments: `render.yaml` enables Render previews in manual mode (PR title contains `[render preview]`) with 3-day expiry; `preview.yml` builds the SPA with `VITE_API_URL=https://pocket-shop-api-pr-<N>.onrender.com` when the tag is present, else the production API. Verify: workflow logic unit-checked by a dry-run step that prints the chosen URL.
- Preview safety: PR-preview builds set `VITE_PREVIEW=1`, which hides admin sign-in and `/#/admin`; the API returns 403 for staff/admin tokens on requests whose `Referer` path starts with `/ai-sdlc-poc-webapp/pr-preview/`. Verify: unit test for the SPA flag and integration test for the API rule.
- §8 additions: hidden evaluation set (≥5 requests kept outside this repo, every attempt counted); lagging metrics reviewer minutes per PR, inference cost per merged PR, escaped defects, blocked guardrail attempts, time to roll back. Verify: §8 text.
- Deploy safety: `npm run db:migrate` runs as Render `preDeployCommand`; migrations are forward-only and additive; README has a rollback runbook. Verify: render.yaml contains preDeployCommand; README section exists.
- Resilience: checkout retries Postgres deadlock/serialization errors (40P01/40001) up to 2 times then 503; login rate limit falls back to an in-memory limiter when Redis is down; Redis errors produce `X-Cache: BYPASS`; `?nocache=1` forces BYPASS for a Postgres-only baseline. Verify: integration tests with Redis stopped and a forced 40P01.
- CI flake control: Playwright `retries: 1` in CI; README documents the local fallback stack (`docker compose up` for Postgres + Redis, then `npm run dev:all`). Verify: playwright.config.ts and README.
<!-- /autoplan-accepted:ceo -->

<!-- autoplan-accepted:dx -->
- Local bootstrap: `docker-compose.yml` (Postgres 16, Redis 7, healthchecks), `.env.example` (root and server), dev defaults when `NODE_ENV!=production` (fixed dev JWT secret with a startup warning, localhost CORS origins), `npm run setup` (checks Docker is running, `docker compose up -d --wait`, migrate, seed, prints URLs, fixture logins and elapsed seconds), `npm run dev` runs API and SPA together. Verify: on a clean clone with Docker running, setup + dev reach a seeded storefront; setup without Docker exits 1 with "Start Docker Desktop, then rerun npm run setup".
- npm workspaces (`server`, `shared`) with one root install; `npm run verify` runs typecheck for all workspaces, unit, API integration and E2E, and CI uses it; vitest and tsconfig cover server and shared. Verify: CI log shows verify running all four stages.
- Errors: `application/problem+json` with `type` (docs/errors.md anchor), `title`, `status`, `detail`, `instance` (request id), `code`, optional `fields`, `fix`, `retryable`; `Retry-After` on 429/503; 401 codes TOKEN_EXPIRED / TOKEN_REVOKED / AUTH_EPOCH_CHANGED / ACCOUNT_DISABLED; 403 codes FORBIDDEN_ROLE / PREVIEW_ADMIN_DISABLED; checkout 503 detail says no charge was made and to retry with the same Idempotency-Key; `docs/errors.md` lists every code. Verify: integration tests assert content type, code and fix for 422, 401 (each code), 403 (both codes), 409, 429, 503.
- Redaction: pino redacts authorization, refresh tokens, passwords, card numbers and connection strings; startup env check lists missing var names only and exits 1; migrate prints file, SQLSTATE, redacted host and "safe to rerun", with a 10 s connect timeout and one transaction per migration. Verify: unit test that a logged request with these fields contains none of their values.
- Idempotency keys are bound to the cart token or user plus a hash of the request body; reuse with a different body returns 409 IDEMPOTENCY_KEY_REUSED; keys are kept 24 h. Verify: integration tests for payload mismatch and concurrent identical submits.
- API conventions: list envelope `{items,page,pageSize,total}`; catalog query params category, size, colour, minPrice, maxPrice, inStock, sort (newest|price_asc|price_desc|best_selling), q, page; ISO-8601 UTC timestamps; additive changes only within /api/v1. Verify: docs/api.md matches routes (route list test).
- `npm run db:reset -- --yes` shares the reset function with the admin endpoint; reset returns `warnings:["cache_flush_failed"]` when Redis fails after the DB commit. Verify: unit test of the shared function and the warning path.
- Previews: preview.yml handles `edited`; fails with a fix message when the PR touches server/, shared/ or migrations without `[render preview]` in the title; for tagged PRs polls the preview API `/healthz` for up to 10 minutes and fails if unhealthy; admin is enabled on tagged previews (isolated DB, fixture passwords) and blocked (PREVIEW_ADMIN_DISABLED) only on previews that use the production API; the SPA shows a banner when the API version differs from the build's expected commit. Verify: workflow dry-run step output for the three branches.
- Release order: pages.yml deploys only after CI succeeds on main (`workflow_run`); API deploys on Render with preDeploy migrations; README documents deploy order, rollback and the one-time cutover loss of old localStorage carts.
- Docs: docs/README.md index, docs/api.md (route table + curl per resource group), docs/errors.md, docs/demo-runbook.md (reset, warm cache, MISS→HIT, flush, preview tag), CLAUDE.md rewritten (layout, verify, migrations, cache rules via `invalidateCatalog()` / `invalidateProductDetail(slug)`, cents, `priceCart()` sole calculator, error codes, fixture logins, guardrails). Verify: files exist and the quickstart in README is run verbatim in CI (setup smoke job).
- Escape hatches: cache TTLs in one `server/src/cache/config.ts` (env overridable), `REDIS_PREFIX`, `SEED_SCALE=small`, `?nocache=1` forwarded by the SPA. Verify: unit test for config overrides.
- Supersedes for previews and commands: the CEO preview-safety rule (admin hidden on every preview build) now applies only to previews that use the production API; tagged `[render preview]` builds keep admin. The local command is `npm run dev` (runs API and SPA together), replacing the earlier `npm run dev:all` wording. Verify: README and CLAUDE.md use `npm run dev`; preview dry-run shows admin enabled only for tagged PRs.
<!-- /autoplan-accepted:dx -->

<!-- autoplan-accepted:eng -->
- Hosting and preview isolation (supersedes the CEO preview-safety rule and the DX preview admin rule): production SPA is a Render static site in the same Blueprint as the API; GitHub Pages serves only untagged PR previews at /pr-preview/pr-N, built with `VITE_PREVIEW=1` (no sign-in UI, no token storage); the production API's CORS allows the Pages origin only for GET/HEAD without an Authorization header (preflights requesting Authorization from that origin are rejected); tagged `[render preview]` PRs get a Render preview environment (web + API + Postgres + Key Value, own origins, `APP_ENV=preview`, fixture passwords, admin enabled); the Referer rule and PREVIEW_ADMIN_DISABLED are removed; the Pages root page redirects to the Render storefront. Verify: integration tests for CORS (Render origin full access, Pages origin GET ok and Authorization preflight rejected, other origin rejected); preview dry-run.
- Release coordination: both Render services use `autoDeployTrigger: checksPass` and `preDeployCommand: npm run db:migrate` on the API; the SPA embeds its build SHA and shows a non-blocking "store is updating" banner when `/healthz.version` differs; pages.yml only publishes previews. Verify: render.yaml content; unit test for the banner condition.
- Preview provisioning: the preview web service gets `VITE_API_URL` from `fromService` (API host) so each preview resolves its own API; seeding is decided by `APP_ENV` (production requires SEED_* passwords; preview/dev use fixtures), never by NODE_ENV; the Pages preview diff guard treats server/, shared/, migrations, render.yaml, package.json and package-lock.json as backend-affecting. Verify: render.yaml; guard dry-run.
- Catalog version lives in Postgres (`app_meta.catalog_version`), incremented in the same transaction as any admin catalog write and read once per catalog request before the cache lookup; cache keys embed it, so a Key Value restart or eviction cannot resurrect stale namespaces. Product detail cache holds content only; stock is read live per request. Verify: integration tests for version bump, KV flush/restart and stock freshness after checkout.
- Redis client fails fast: `enableOfflineQueue:false`, `maxRetriesPerRequest:0`, `commandTimeout` 50 ms, circuit breaker (opens after 5 failures for 10 s) → `X-Cache: BYPASS`; CORS exposes X-Cache, X-Cache-Key and X-Request-Id; catalog hit/miss/bypass counters are separate keys used by the cache page. Verify: integration tests with Redis stopped and with a non-responding Redis socket.
- Catalog query hardening: whitelisted params only (unknown → 422), pageSize ≤ 48, page ≤ 50, q ≤ 64 chars with ILIKE wildcards escaped, price filters rounded to $5 buckets for cache keys, 120 requests/min/IP on catalog and search. Verify: table-driven tests.
- Checkout transaction: (1) reserve `(principal, idempotency_key)` with INSERT … ON CONFLICT in its own statement; a duplicate waits for or returns the first result; (2) one transaction locks the cart row, then variants ORDER BY id FOR UPDATE, then any promotion row; checkout binds to the cart's revision; (3) price with `priceCart()`, consume coupon with a conditional UPDATE (used < limit), call the synchronous in-process mock payment (no external side effects), write order, items, stock movements, redemption and outbox, decrement stock, mark the cart checked out, commit; (4) on decline, roll back and record the failed attempt in a separate transaction; `CHECK (stock_on_hand >= 0)` at the DB level. Verify: tests for duplicate same-key submits, different-key same-cart submits, cart edit during checkout, 20-way last-unit race, coupon limit under 20 concurrent checkouts.
- Retry semantics: an idempotency key identifies one payment attempt; transport retries reuse it and receive the stored result; after a definitive decline (402) the client mints a new key for the next attempt; the 503 detail says "Retry with the same Idempotency-Key; if the first attempt completed you will receive that order" (no claim that nothing happened). Verify: E2E decline 0002 → new key → 4242 succeeds; test that a lost response after commit is recovered by replay.
- Orders, cancel and refunds: separate fulfilment status (paid → packed → shipped → delivered | cancelled) and payment status (paid | partially_refunded | refunded); refunds are per line with quantities, prorated discount and tax, cumulative refunded ≤ paid, each operation carries an operation id (idempotent) and locks the order row; restock happens at most once per unit; staff may cancel only paid/packed orders, which issues a full mock refund and restocks; partial refunds are admin-only. Verify: table tests for proration; tests for double refund, double cancel, refund over balance.
- Guest ownership: checkout returns an order access token (random, stored hashed) that the confirmation page keeps in sessionStorage; guest order reads require it, customer reads require ownership; unknown or foreign orders return 404. Cart merge on login moves guest lines in one transaction (quantities clamped to stock) and invalidates the guest token; per-customer coupon limits for guests key on normalised email. Verify: IDOR tests, concurrent merge test.
- Reset fencing: the reset transaction first updates `app_meta` (auth_epoch + 1, catalog_version + 1), then truncates an explicit table allowlist (never app_meta or the migrations table), re-seeds and deletes refresh tokens, then commits; every mutating transaction reads `app_meta.auth_epoch FOR SHARE` and rejects a mismatched token `ep`, so writes in flight either finish before reset or fail after it; Redis is flushed after commit (warning on failure). Verify: test that pauses an authenticated write across a reset.
- Refresh tokens: single-flight refresh per tab plus cross-tab coordination (BroadcastChannel/navigator.locks) for customers; the server accepts a just-rotated token for 10 s and issues a fresh pair without revoking the family; reuse after the grace window revokes the family. Verify: two-tab E2E and lost-refresh-response test.
- Totals clarifications: a free-shipping coupon shows a "Free shipping" line and sets shipping to 0 (discount stays 0); dashboard day boundaries are UTC; admin stats honour `?nocache=1`. Verify: pricing table tests; KPI test with frozen clock.
- Ops details: `trust proxy` hop count is verified on Render by logging `req.ip` once in the smoke; login and catalog rate limits are env-configurable (high in CI); seed compares on natural keys (slug, sku) and derives ids deterministically. Verify: smoke output; seed test.
- Test isolation and fixtures: per-worker Postgres schema for API integration tests; Playwright uses one `SEED_SCALE=small` database with unique per-test users/products and a serial project for stock, concurrency and reset specs; per-product SVG images under `public/products/` (Q7); `e2e/storefront.spec.ts` keeps the T-2 intent (images with product-name alt text, search results each with an image) and the `e2e/shop.spec.ts` journey. Verify: CI green with retries=1.
- Scope consistency: SF-4 drops the reviews summary (reviews are P1); G4 is not claimed by deploying the store; it needs an owner-delivered ASDLC integration milestone (deferred, see TODOS.md). Verify: §7 SF-4 text; TODOS.md entry.
- Supersedes earlier delivery items: CORS allowlist is the Render storefront origin(s) plus the Pages origin for anonymous GET/HEAD only (replaces the github.io production origin); the stock cache rule is replaced by live stock reads (no detail-key deletion); preview API URLs come from `fromService`, not a guessed hostname; PREVIEW_ADMIN_DISABLED and the Referer rule are removed from the error catalog; pages.yml publishes previews only (no production Pages deploy, no `workflow_run` gating); reset order is the fenced order above (app_meta update first, Redis flush after commit); the env list adds `APP_ENV` (production | preview | development) and `STOREFRONT_URL`. Verify: docs/errors.md has no PREVIEW_ADMIN_DISABLED; render.yaml and README env tables list APP_ENV.
<!-- /autoplan-accepted:eng -->

## Accepted delivery requirements (later review phases)

<!-- autoplan-accepted:ceo -->
- Delivery: build and deploy all P0 requirements (PL-1..7, SF-1..10, AD-1..10) in this session; P1 and §10 stay as the Slack/ASDLC backlog. Verify: CI runs unit, API integration and Playwright E2E locally against Postgres + Redis service containers (no external network); after deploy, a read-only smoke script checks `/healthz`, catalog list (MISS then HIT) and the Pages site loads; one manual checkout on the deployed store confirms the write path.
- §7.1 Totals (server is the only calculator): line = unit_price_cents × qty; subtotal = Σ lines; discount: percentage = round_half_up(eligible_subtotal × pct / 100), fixed = min(value, eligible_subtotal), free_shipping zeroes shipping; one code per order. shipping = 0 if (subtotal − discount) ≥ free_shipping_threshold else flat_rate. tax = round_half_up((subtotal − discount) × tax_rate_bps / 10000), with `tax_rate_bps` an integer setting (825 = 8.25%); shipping is not taxed. total = subtotal − discount + shipping + tax. Verify: table-driven unit tests including rounding at .5 cent and threshold equality.
- §7.2 P0 permission matrix. customer: own cart, orders, profile, addresses. staff: admin read of products, orders, customers, inventory, outbox; order status transitions, tracking, cancel; stock adjust. admin: everything staff can do plus product/category CRUD, promotions (AD-7), refunds, settings (AD-9), customer disable, cache flush, demo reset. Screens: dashboard (AD-2) staff+admin; System/Cache page (AD-10) staff read, admin flush; promotions and settings pages admin-only and hidden from staff; a staff call to an admin-only route returns 403 and the UI shows "Only admins can do this". Verify: integration test matrix asserts 403 for each forbidden role/route pair listed here.
- Demo reset (pulls the PRD Phase 4 reset forward): admin-only `POST /api/v1/admin/demo/reset` with body `{"confirm":"RESET"}` truncates and re-seeds in one transaction, then flushes all Redis keys under the app prefix, increments `app_meta.auth_epoch` (a table reset never truncates; access tokens carry `ep` and are rejected when it differs), deletes all refresh tokens and writes an audit row; the admin UI asks for typed confirmation. Verify: integration test mutates a product, resets, and the next catalog read is `X-Cache: MISS` with seed values; a token issued before reset gets 401; two resets in a row each invalidate tokens issued between them.
- Request ids and logs: accept inbound `X-Request-Id` only if it matches `^[A-Za-z0-9-]{8,64}$`, else generate a UUID v4; echo it on every response; one JSON log line per request (method, path, status, duration_ms, user_id, request_id); error bodies include `requestId`. Verify: integration tests for echo, regeneration of an invalid id, and error body field.
- `/healthz` returns `{db, redis, version, uptimeSec}` (E3 folded in, no separate endpoint); 200 when DB is up even if Redis is down (redis:"down"); 503 when DB is down. The admin System page shows it. Verify: integration test with Redis stopped.
- CORS: API allows only origins in `CORS_ORIGINS` (prod: `https://smiesamjafry.github.io`; dev: `http://localhost:5173`, `http://localhost:4173`); other origins get no CORS headers. Verify: integration test for allowed and rejected origin.
- Auth tokens: access JWT 15 min with `sub`, `role`, `tv` (token_version) and `ep` (auth epoch); each request loads the user and rejects disabled users, a stale `tv` or an `ep` that differs from `app_meta.auth_epoch`; refresh tokens are random, stored hashed in Postgres, rotated on use and revoked on logout, disable and reset. Express `trust proxy` = 1 so per-IP login rate limits work behind Render. Verify: tests for disabled user 401, refresh rotation, reuse of a rotated refresh token rejected.
- Seed: deterministic PRNG (fixed seed); order timestamps are relative to seed time (now − N days) so dashboard 7d/30d windows always have data. Seeded accounts: admin@shop.test (admin), staff@shop.test (staff), demo@shop.test (customer). Locally and in CI all use the fixture password demo1234. On the deployed store, admin and staff passwords come from `SEED_ADMIN_PASSWORD` / `SEED_STAFF_PASSWORD` env vars (the seed refuses to run in production without them); only demo@shop.test keeps the public fixture password. Verify: seeding twice yields identical product/variant/price rows.
- Cutover: the SPA ignores the old `pocket-shop.cart` / `pocket-shop.session` localStorage keys and removes them on first load. Verify: unit test.
- Secrets/env: API needs `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (generated by Render), `CORS_ORIGINS`, `NODE_ENV`, `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD`; SPA build needs `VITE_API_URL`. Documented in README. Verify: API refuses to start with a clear message when a required var is missing.
- PRD Q2 corrected (CI skips `e2e/asdlc`). Verify: Q2/Q4 text in §9.
- Stock cache rule: every stock change (checkout, staff adjust, cancel/refund restock) deletes that product's `catalog:v{ver}:product:{slug}` key in the same request after commit; list pages may show stock up to 5 min stale. Verify: integration test adjusts stock and the next detail read is a MISS with the new stock.
- Payment retry: an idempotency key whose attempts are all `failed` may be retried; a key with a `paid` order returns that order (HTTP 200, same order number) without charging again. Verify: tests for decline-then-retry-success and double submit.
- Retire `e2e/asdlc/T-2` (it asserts the 6-product static catalog); its intent (every product card shows an image with alt text naming the product) moves into a regular E2E in `e2e/`. Verify: new E2E passes; T-2 directory removed in this PR.
- Preview environments: `render.yaml` enables Render previews in manual mode (PR title contains `[render preview]`) with 3-day expiry; `preview.yml` builds the SPA with `VITE_API_URL=https://pocket-shop-api-pr-<N>.onrender.com` when the tag is present, else the production API. Verify: workflow logic unit-checked by a dry-run step that prints the chosen URL.
- Preview safety: PR-preview builds set `VITE_PREVIEW=1`, which hides admin sign-in and `/#/admin`; the API returns 403 for staff/admin tokens on requests whose `Referer` path starts with `/ai-sdlc-poc-webapp/pr-preview/`. Verify: unit test for the SPA flag and integration test for the API rule.
- §8 additions: hidden evaluation set (≥5 requests kept outside this repo, every attempt counted); lagging metrics reviewer minutes per PR, inference cost per merged PR, escaped defects, blocked guardrail attempts, time to roll back. Verify: §8 text.
- Deploy safety: `npm run db:migrate` runs as Render `preDeployCommand`; migrations are forward-only and additive; README has a rollback runbook. Verify: render.yaml contains preDeployCommand; README section exists.
- Resilience: checkout retries Postgres deadlock/serialization errors (40P01/40001) up to 2 times then 503; login rate limit falls back to an in-memory limiter when Redis is down; Redis errors produce `X-Cache: BYPASS`; `?nocache=1` forces BYPASS for a Postgres-only baseline. Verify: integration tests with Redis stopped and a forced 40P01.
- CI flake control: Playwright `retries: 1` in CI; README documents the local fallback stack (`docker compose up` for Postgres + Redis, then `npm run dev:all`). Verify: playwright.config.ts and README.
<!-- /autoplan-accepted:ceo -->

<!-- autoplan-accepted:dx -->
- Local bootstrap: `docker-compose.yml` (Postgres 16, Redis 7, healthchecks), `.env.example` (root and server), dev defaults when `NODE_ENV!=production` (fixed dev JWT secret with a startup warning, localhost CORS origins), `npm run setup` (checks Docker is running, `docker compose up -d --wait`, migrate, seed, prints URLs, fixture logins and elapsed seconds), `npm run dev` runs API and SPA together. Verify: on a clean clone with Docker running, setup + dev reach a seeded storefront; setup without Docker exits 1 with "Start Docker Desktop, then rerun npm run setup".
- npm workspaces (`server`, `shared`) with one root install; `npm run verify` runs typecheck for all workspaces, unit, API integration and E2E, and CI uses it; vitest and tsconfig cover server and shared. Verify: CI log shows verify running all four stages.
- Errors: `application/problem+json` with `type` (docs/errors.md anchor), `title`, `status`, `detail`, `instance` (request id), `code`, optional `fields`, `fix`, `retryable`; `Retry-After` on 429/503; 401 codes TOKEN_EXPIRED / TOKEN_REVOKED / AUTH_EPOCH_CHANGED / ACCOUNT_DISABLED; 403 codes FORBIDDEN_ROLE / PREVIEW_ADMIN_DISABLED; checkout 503 detail says no charge was made and to retry with the same Idempotency-Key; `docs/errors.md` lists every code. Verify: integration tests assert content type, code and fix for 422, 401 (each code), 403 (both codes), 409, 429, 503.
- Redaction: pino redacts authorization, refresh tokens, passwords, card numbers and connection strings; startup env check lists missing var names only and exits 1; migrate prints file, SQLSTATE, redacted host and "safe to rerun", with a 10 s connect timeout and one transaction per migration. Verify: unit test that a logged request with these fields contains none of their values.
- Idempotency keys are bound to the cart token or user plus a hash of the request body; reuse with a different body returns 409 IDEMPOTENCY_KEY_REUSED; keys are kept 24 h. Verify: integration tests for payload mismatch and concurrent identical submits.
- API conventions: list envelope `{items,page,pageSize,total}`; catalog query params category, size, colour, minPrice, maxPrice, inStock, sort (newest|price_asc|price_desc|best_selling), q, page; ISO-8601 UTC timestamps; additive changes only within /api/v1. Verify: docs/api.md matches routes (route list test).
- `npm run db:reset -- --yes` shares the reset function with the admin endpoint; reset returns `warnings:["cache_flush_failed"]` when Redis fails after the DB commit. Verify: unit test of the shared function and the warning path.
- Previews: preview.yml handles `edited`; fails with a fix message when the PR touches server/, shared/ or migrations without `[render preview]` in the title; for tagged PRs polls the preview API `/healthz` for up to 10 minutes and fails if unhealthy; admin is enabled on tagged previews (isolated DB, fixture passwords) and blocked (PREVIEW_ADMIN_DISABLED) only on previews that use the production API; the SPA shows a banner when the API version differs from the build's expected commit. Verify: workflow dry-run step output for the three branches.
- Release order: pages.yml deploys only after CI succeeds on main (`workflow_run`); API deploys on Render with preDeploy migrations; README documents deploy order, rollback and the one-time cutover loss of old localStorage carts.
- Docs: docs/README.md index, docs/api.md (route table + curl per resource group), docs/errors.md, docs/demo-runbook.md (reset, warm cache, MISS→HIT, flush, preview tag), CLAUDE.md rewritten (layout, verify, migrations, cache rules via `invalidateCatalog()` / `invalidateProductDetail(slug)`, cents, `priceCart()` sole calculator, error codes, fixture logins, guardrails). Verify: files exist and the quickstart in README is run verbatim in CI (setup smoke job).
- Escape hatches: cache TTLs in one `server/src/cache/config.ts` (env overridable), `REDIS_PREFIX`, `SEED_SCALE=small`, `?nocache=1` forwarded by the SPA. Verify: unit test for config overrides.
- Supersedes for previews and commands: the CEO preview-safety rule (admin hidden on every preview build) now applies only to previews that use the production API; tagged `[render preview]` builds keep admin. The local command is `npm run dev` (runs API and SPA together), replacing the earlier `npm run dev:all` wording. Verify: README and CLAUDE.md use `npm run dev`; preview dry-run shows admin enabled only for tagged PRs.
<!-- /autoplan-accepted:dx -->

<!-- autoplan-accepted:eng -->
- Hosting and preview isolation (supersedes the CEO preview-safety rule and the DX preview admin rule): production SPA is a Render static site in the same Blueprint as the API; GitHub Pages serves only untagged PR previews at /pr-preview/pr-N, built with `VITE_PREVIEW=1` (no sign-in UI, no token storage); the production API's CORS allows the Pages origin only for GET/HEAD without an Authorization header (preflights requesting Authorization from that origin are rejected); tagged `[render preview]` PRs get a Render preview environment (web + API + Postgres + Key Value, own origins, `APP_ENV=preview`, fixture passwords, admin enabled); the Referer rule and PREVIEW_ADMIN_DISABLED are removed; the Pages root page redirects to the Render storefront. Verify: integration tests for CORS (Render origin full access, Pages origin GET ok and Authorization preflight rejected, other origin rejected); preview dry-run.
- Release coordination: both Render services use `autoDeployTrigger: checksPass` and `preDeployCommand: npm run db:migrate` on the API; the SPA embeds its build SHA and shows a non-blocking "store is updating" banner when `/healthz.version` differs; pages.yml only publishes previews. Verify: render.yaml content; unit test for the banner condition.
- Preview provisioning: the preview web service gets `VITE_API_URL` from `fromService` (API host) so each preview resolves its own API; seeding is decided by `APP_ENV` (production requires SEED_* passwords; preview/dev use fixtures), never by NODE_ENV; the Pages preview diff guard treats server/, shared/, migrations, render.yaml, package.json and package-lock.json as backend-affecting. Verify: render.yaml; guard dry-run.
- Catalog version lives in Postgres (`app_meta.catalog_version`), incremented in the same transaction as any admin catalog write and read once per catalog request before the cache lookup; cache keys embed it, so a Key Value restart or eviction cannot resurrect stale namespaces. Product detail cache holds content only; stock is read live per request. Verify: integration tests for version bump, KV flush/restart and stock freshness after checkout.
- Redis client fails fast: `enableOfflineQueue:false`, `maxRetriesPerRequest:0`, `commandTimeout` 50 ms, circuit breaker (opens after 5 failures for 10 s) → `X-Cache: BYPASS`; CORS exposes X-Cache, X-Cache-Key and X-Request-Id; catalog hit/miss/bypass counters are separate keys used by the cache page. Verify: integration tests with Redis stopped and with a non-responding Redis socket.
- Catalog query hardening: whitelisted params only (unknown → 422), pageSize ≤ 48, page ≤ 50, q ≤ 64 chars with ILIKE wildcards escaped, price filters rounded to $5 buckets for cache keys, 120 requests/min/IP on catalog and search. Verify: table-driven tests.
- Checkout transaction: (1) reserve `(principal, idempotency_key)` with INSERT … ON CONFLICT in its own statement; a duplicate waits for or returns the first result; (2) one transaction locks the cart row, then variants ORDER BY id FOR UPDATE, then any promotion row; checkout binds to the cart's revision; (3) price with `priceCart()`, consume coupon with a conditional UPDATE (used < limit), call the synchronous in-process mock payment (no external side effects), write order, items, stock movements, redemption and outbox, decrement stock, mark the cart checked out, commit; (4) on decline, roll back and record the failed attempt in a separate transaction; `CHECK (stock_on_hand >= 0)` at the DB level. Verify: tests for duplicate same-key submits, different-key same-cart submits, cart edit during checkout, 20-way last-unit race, coupon limit under 20 concurrent checkouts.
- Retry semantics: an idempotency key identifies one payment attempt; transport retries reuse it and receive the stored result; after a definitive decline (402) the client mints a new key for the next attempt; the 503 detail says "Retry with the same Idempotency-Key; if the first attempt completed you will receive that order" (no claim that nothing happened). Verify: E2E decline 0002 → new key → 4242 succeeds; test that a lost response after commit is recovered by replay.
- Orders, cancel and refunds: separate fulfilment status (paid → packed → shipped → delivered | cancelled) and payment status (paid | partially_refunded | refunded); refunds are per line with quantities, prorated discount and tax, cumulative refunded ≤ paid, each operation carries an operation id (idempotent) and locks the order row; restock happens at most once per unit; staff may cancel only paid/packed orders, which issues a full mock refund and restocks; partial refunds are admin-only. Verify: table tests for proration; tests for double refund, double cancel, refund over balance.
- Guest ownership: checkout returns an order access token (random, stored hashed) that the confirmation page keeps in sessionStorage; guest order reads require it, customer reads require ownership; unknown or foreign orders return 404. Cart merge on login moves guest lines in one transaction (quantities clamped to stock) and invalidates the guest token; per-customer coupon limits for guests key on normalised email. Verify: IDOR tests, concurrent merge test.
- Reset fencing: the reset transaction first updates `app_meta` (auth_epoch + 1, catalog_version + 1), then truncates an explicit table allowlist (never app_meta or the migrations table), re-seeds and deletes refresh tokens, then commits; every mutating transaction reads `app_meta.auth_epoch FOR SHARE` and rejects a mismatched token `ep`, so writes in flight either finish before reset or fail after it; Redis is flushed after commit (warning on failure). Verify: test that pauses an authenticated write across a reset.
- Refresh tokens: single-flight refresh per tab plus cross-tab coordination (BroadcastChannel/navigator.locks) for customers; the server accepts a just-rotated token for 10 s and issues a fresh pair without revoking the family; reuse after the grace window revokes the family. Verify: two-tab E2E and lost-refresh-response test.
- Totals clarifications: a free-shipping coupon shows a "Free shipping" line and sets shipping to 0 (discount stays 0); dashboard day boundaries are UTC; admin stats honour `?nocache=1`. Verify: pricing table tests; KPI test with frozen clock.
- Ops details: `trust proxy` hop count is verified on Render by logging `req.ip` once in the smoke; login and catalog rate limits are env-configurable (high in CI); seed compares on natural keys (slug, sku) and derives ids deterministically. Verify: smoke output; seed test.
- Test isolation and fixtures: per-worker Postgres schema for API integration tests; Playwright uses one `SEED_SCALE=small` database with unique per-test users/products and a serial project for stock, concurrency and reset specs; per-product SVG images under `public/products/` (Q7); `e2e/storefront.spec.ts` keeps the T-2 intent (images with product-name alt text, search results each with an image) and the `e2e/shop.spec.ts` journey. Verify: CI green with retries=1.
- Scope consistency: SF-4 drops the reviews summary (reviews are P1); G4 is not claimed by deploying the store; it needs an owner-delivered ASDLC integration milestone (deferred, see TODOS.md). Verify: §7 SF-4 text; TODOS.md entry.
- Supersedes earlier delivery items: CORS allowlist is the Render storefront origin(s) plus the Pages origin for anonymous GET/HEAD only (replaces the github.io production origin); the stock cache rule is replaced by live stock reads (no detail-key deletion); preview API URLs come from `fromService`, not a guessed hostname; PREVIEW_ADMIN_DISABLED and the Referer rule are removed from the error catalog; pages.yml publishes previews only (no production Pages deploy, no `workflow_run` gating); reset order is the fenced order above (app_meta update first, Redis flush after commit); the env list adds `APP_ENV` (production | preview | development) and `STOREFRONT_URL`. Verify: docs/errors.md has no PREVIEW_ADMIN_DISABLED; render.yaml and README env tables list APP_ENV.
<!-- /autoplan-accepted:eng -->
