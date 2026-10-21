# API reference (`/api/v1`)

Base URL: `http://localhost:4000` locally; the `pocket-shop-api` Render URL in production.
Auth: `Authorization: Bearer <accessToken>` (15 min). Guests identify their cart with `X-Cart-Token`.
Lists return `{ items, page, pageSize, total }`. Money is integer cents. Times are ISO-8601 UTC.
Catalog responses carry `X-Cache: HIT | MISS | BYPASS` and `X-Cache-Key`; add `?nocache=1` to bypass Redis.
Errors: see [`errors.md`](errors.md).

```bash
API=http://localhost:4000/api/v1
```

## Health
| Method | Path | Notes |
|---|---|---|
| GET | `/healthz` (no prefix) | `{ db, redis, version, appEnv, uptimeSec }`; 503 when the database is down |

## Catalog (public)
| Method | Path | Notes |
|---|---|---|
| GET | `/products` | Query: `category, size, colour, minPrice, maxPrice, inStock=true, onSale=true, featured=true, sort=newest\|price_asc\|price_desc\|best_selling, q, page, pageSize≤48`. Unknown params → 422 |
| GET | `/products/:slug` | Content is cached; `variants[].stock` is always live |
| GET | `/products/:slug/questions` | Answered questions, newest first (read live, not cached) |
| POST | `/products/:slug/questions` | `{ question }` (1-500 chars after trimming); no sign-in needed. Shown publicly once answered |
| GET | `/products/:slug/ratings` | `{ average, count }`: average stars rounded to one decimal (`null` when unrated); read live, not cached |
| POST | `/products/:slug/ratings` | `{ stars }` (whole number 1-5); no sign-in needed, every submission counts. Returns the new `{ average, count }` (201) |
| GET | `/categories` | Category tree with product counts |
| GET | `/home` | Featured categories, featured, new arrivals, on sale |
| GET | `/store` | Store name, shipping and tax settings |

```bash
curl -i "$API/products?category=tops&sort=price_asc" | grep -i x-cache
curl "$API/products/zip-hoodie"
```

## Auth and account
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | `{ name, email, password≥8 }` → `{ user, accessToken, refreshToken }` |
| POST | `/auth/login` | `{ email, password }` (rate limited per IP) |
| POST | `/auth/refresh` | `{ refreshToken }` → new pair (rotates; reuse within 10 s is tolerated) |
| POST | `/auth/logout` | `{ refreshToken }` revokes the session family |
| GET/PATCH | `/me` | Profile (`{ name }`) |
| GET/POST | `/me/addresses`, DELETE `/me/addresses/:id` | Saved addresses |
| GET | `/orders` | The signed-in customer's orders |
| GET | `/orders/:number` | Owner, staff/admin, or a guest sending `X-Order-Token` from checkout |

```bash
TOKEN=$(curl -s -XPOST $API/auth/login -H 'content-type: application/json' \
  -d '{"email":"demo@shop.test","password":"demo1234"}' | jq -r .accessToken)
curl $API/orders -H "Authorization: Bearer $TOKEN"
```

## Cart and checkout
| Method | Path | Notes |
|---|---|---|
| GET | `/cart` | Cart with server-calculated `totals` |
| POST | `/cart/items` | `{ variantId, quantity }`; a guest's first add returns `cartToken` |
| PATCH | `/cart/items/:variantId` | `{ quantity }` (≤ stock) |
| DELETE | `/cart/items/:variantId` | Remove a line |
| POST/DELETE | `/cart/coupon` | `{ code }` apply / remove |
| POST | `/cart/merge` | Signed in: `{ cartToken }` moves the guest cart into the account |
| POST | `/checkout` | Header `Idempotency-Key` (one per payment attempt). Body `{ email, shippingAddress{name,line1,line2?,city,region?,postcode,country}, card{number,expiry MM/YY,cvc} }` → 201 `{ order, accessToken }` (`accessToken` only for guests) |

```bash
V=$(curl -s $API/products/canvas-tote | jq -r '.variants[0].id')
CART=$(curl -s -XPOST $API/cart/items -H 'content-type: application/json' -d "{\"variantId\":\"$V\",\"quantity\":1}" | jq -r .cartToken)
curl -XPOST $API/checkout -H 'content-type: application/json' -H "X-Cart-Token: $CART" -H "Idempotency-Key: $(uuidgen)" \
  -d '{"email":"me@example.com","shippingAddress":{"name":"Me","line1":"1 Main St","city":"Portland","postcode":"97201","country":"US"},"card":{"number":"4242424242424242","expiry":"12/30","cvc":"123"}}'
```

## Admin (`/admin`, staff or admin; ★ = admin only)
| Method | Path | Notes |
|---|---|---|
| GET | `/admin/dashboard` | Revenue today/7d/30d (UTC), orders, AOV, top products, low stock, cache hit rate |
| GET | `/admin/products`, `/admin/products/:id` | List / detail with variants |
| POST ★ / PUT ★ / DELETE ★ | `/admin/products[/:id]` | `{ name, slug?, description, brand, categoryId, status, featured, images[{url,alt}], variants[{id?,sku,size,colour,priceCents,compareAtCents,lowStockThreshold,stock?}] }`; DELETE archives |
| GET; POST ★ / PUT ★ / DELETE ★ | `/admin/categories[/:id]` | Delete is blocked while products remain |
| GET | `/admin/inventory?filter=all\|low\|out&q=` | Stock by variant |
| POST | `/admin/inventory/:variantId/adjust` | `{ delta, reason }` (never below 0) |
| GET | `/admin/inventory/:variantId/movements` | Audit of stock changes |
| GET | `/admin/orders?status&q&from&to&minTotal&page`, `/admin/orders/:number` | Orders |
| POST | `/admin/orders/:number/transition` | `{ to: packed\|shipped\|delivered, trackingNumber? }` (tracking required to ship) |
| POST | `/admin/orders/:number/cancel` | `{ operationId, reason? }` paid/packed only; full refund + restock, idempotent |
| POST ★ | `/admin/orders/:number/refund` | `{ operationId, lines[{itemId, quantity}], restock, reason? }` prorated, idempotent |
| GET ★; POST ★ / PUT ★ / DELETE ★ | `/admin/promotions[/:id]` | `{ name, code, type: percentage\|fixed\|free_shipping, value, scopeKind, scopeIds, minSubtotalCents, startsAt, endsAt, usageLimit, perCustomerLimit, active }` |
| GET | `/admin/customers`, `/admin/customers/:id` | With order count and lifetime value |
| POST ★ | `/admin/customers/:id/disable`, `/enable` | Disabling revokes sessions |
| GET; PUT ★ | `/admin/settings` | `{ storeName, taxRateBps, flatShippingCents, freeShippingThresholdCents, lowStockThreshold }` |
| GET ★ | `/admin/questions` | Unanswered product questions, oldest first, with product name |
| POST ★ | `/admin/questions/:id/answer` | `{ answer }`; one answer per question (`QUESTION_ALREADY_ANSWERED` otherwise) |
| GET | `/admin/outbox` | Emails the store would have sent |
| GET | `/admin/system` | Health + cache stats, keys by prefix, recent invalidations |
| POST ★ | `/admin/cache/flush` | `{ "confirm": "FLUSH" }` |
| POST ★ | `/admin/demo/reset` | `{ "confirm": "RESET" }` reseeds and ends every session |
| GET ★ | `/admin/audit` | Last 100 admin actions |
