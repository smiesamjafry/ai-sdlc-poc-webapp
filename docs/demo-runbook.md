# Demo runbook

**Storefront:** https://pocket-shop-41pq.onrender.com · **API:** https://pocket-shop-api-c15t.onrender.com/healthz
**Admin:** storefront URL + `#/admin` (admin and staff passwords are in Render → `pocket-shop-api` → Environment)
**Customer login:** `demo@shop.test` / `demo1234` · **Cards:** `4242 4242 4242 4242` paid, `4000 0000 0000 0002` declined

## Before the demo (2 minutes)
1. Admin → **System & cache** → **Reset demo data** → type `RESET`. Sign in again.
2. Open the storefront home page and two product pages once to warm the cache.
3. Check `<api>/healthz` shows `db: up, redis: up`.

## Show the cache (the centrepiece)
1. Open any product with `?debug=1` on the URL, e.g. `<storefront>/?debug=1#/products/zip-hoodie`. The badge bottom-right shows `X-Cache: HIT`.
2. In another tab, admin → Products → Zip Hoodie → change a price → **Save product**.
3. Reload the product tab: the badge shows `MISS` with the new price, then `HIT` on the next reload.
4. Admin → **System & cache**: hit rate, keys by prefix and the invalidation you just caused.
5. Add `nocache=1` (`?debug=1&nocache=1`) to show the Postgres-only path (`BYPASS`).

From a terminal:
```bash
curl -si <api>/api/v1/products/zip-hoodie | grep -i x-cache
```

## Show a full order
Storefront → add an item → Checkout → decline card first (clear message, cart kept), then `4242…` → order page.
Admin → Orders → the new order → **Mark packed** → **Mark shipped** (tracking number) → Outbox shows the confirmation email.

## Previews of Slack-generated PRs
- Add `[render preview]` to a PR title and Render builds a full preview (own storefront, API, database and cache, fixture logins, expires after 3 days). This needs the `render.yaml` Blueprint attached in the Render dashboard.
- Without the tag there is no preview; review the PR's CI run instead.
