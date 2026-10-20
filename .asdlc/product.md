<!-- asdlc-context: describes 055e8c3b9df91bda9c92217c095d006f53924d95 (written 2026-10-20). Edit freely; ASDLC refreshes changed sections after merges. -->

# Pocket Shop: product overview

## What it is
Pocket Shop is a demo online store selling apparel and accessories, with a customer storefront and a back-office admin. It is the target app for a proof of concept where business requests from Slack become pull requests. It is a demo: **payments are fake and no real email is sent**.

## Users and roles
- **Guest shopper**: browses, fills a cart and checks out with just an email. Can view their order with a link/token given at checkout.
- **Customer**: has an account (register/sign in), order history, saved addresses. Their guest cart merges into their account on sign-in.
- **Staff**: admin area access for day-to-day work: view data, move orders through fulfilment, cancel orders, adjust stock. Cannot change settings, promotions, products, categories, customers or refund.
- **Admin**: everything staff can do plus products, categories, promotions, settings, refunds, disabling customers, answering product questions, cache flush, demo reset, audit log.
- **Demo presenter**: uses the admin "System" page to see cache behaviour and reset the demo data.

## Storefront pages (hash routes, e.g. `/#/products`)
- `/` home: featured categories, featured products, new arrivals, on-sale items
- `/products` catalog with filters (category, size, colour, price, in stock, on sale), sorting and search
- `/products/:slug` product page with colour/size choice, "Add to cart" and a Questions & Answers section
- `/cart` cart with quantity changes, coupon code and totals
- `/checkout` email, shipping address and card
- `/orders/:number` order confirmation and status
- `/login`, `/register`, `/account` (profile, addresses, orders)

## Admin pages (`/#/admin/...`, staff or admin)
- `/admin` dashboard: revenue (today, 7 and 30 days), orders, average order value, top products, low stock, cache hit rate
- `/admin/products`, `/admin/products/:id` product list and editor (variants, images, status)
- `/admin/categories`, `/admin/inventory`, `/admin/orders`, `/admin/orders/:number`
- `/admin/promotions`, `/admin/customers`, `/admin/settings`
- `/admin/questions` (admin only) unanswered product questions, answered here
- `/admin/outbox` emails the store would have sent
- `/admin/system` health, cache stats, flush cache, reset demo data

## API (base `/api/v1`, details in docs/api.md)
Public catalog: `GET /products`, `/products/:slug`, `/products/:slug/questions` (GET, POST), `/categories`, `/home`, `/store`. Account: `/auth/register|login|refresh|logout`, `/me`, `/me/addresses`, `/orders`. Cart: `/cart`, `/cart/items`, `/cart/coupon`, `/cart/merge`. `POST /checkout`. Admin under `/admin/...`. Health: `GET /healthz`.

## Key flows
1. **Buy as a guest**: browse → open a product → choose colour/size → Add to cart → cart → (optional coupon) → checkout with email, address, card → order confirmation with an order number.
2. **Sign in and buy**: sign in; guest cart merges; checkout uses account; order appears in Account.
3. **Fulfil an order** (admin/staff): Orders → open order → Packed → Shipped (tracking number required) → Delivered. Cancel is allowed only while paid or packed and refunds in full and restocks.
4. **Refund** (admin): choose items and quantities, optionally restock; amount is prorated; repeat-safe.
5. **Manage catalog** (admin): create or edit a product with variants (SKU, size, colour, price, compare-at price, low-stock threshold); changes show on the storefront right away.
6. **Adjust stock**: Inventory → adjust by a positive or negative amount with a reason; stock never goes below 0; movements are logged.
7. **Promotions** (admin): create a code (percentage, fixed amount, or free shipping) with scope (all, categories, products), minimum spend, dates and usage limits.
8. **Reset demo**: System → Reset demo data (type RESET) reseeds everything and signs everyone out.
9. **Answer a product question** (admin): Questions → type an answer → Save answer; the question and answer appear on the product page straight away.

## Business rules and limits
- Money is whole cents, USD, English only.
- Total = subtotal − discount + shipping + tax. Shipping is a flat fee, free above a threshold, with a free-shipping coupon type. Tax is one store-wide rate. Rates and thresholds are admin settings.
- Prices and totals are always calculated by the server, never trusted from the browser.
- Stock is checked when adding to cart and at checkout; a sale of the last unit blocks others (INSUFFICIENT_STOCK).
- Payments are a mock: card `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined, `4000 0000 0000 9995` has insufficient funds; any other number is refused. A declined payment charges nothing and keeps the cart.
- Each checkout attempt needs its own idempotency key, so retries never create duplicate orders.
- Order flow: paid → packed → shipped → delivered; cancelled only from paid or packed.
- Deleting a product archives it. A category with products cannot be deleted.
- Disabling a customer ends their sessions.
- Product questions: anyone can ask (1-500 characters, no sign-in). Only answered questions are shown; each question takes one answer.
- Emails are not sent; they are stored in an outbox viewable by admins.
- Login and catalog requests are rate limited per IP.
- GitHub Pages PR previews are browse-only (no sign-in, cart, checkout or questions).
- No real payments, shipping carriers, tax engine, multi-currency or multi-language. A wishlist appears in the PRD but is not in the app routes (unknown whether planned).
- Fixture accounts exist only in local, CI and preview environments: admin@shop.test, staff@shop.test, demo@shop.test.

## Glossary
- **SKU / variant**: a purchasable size-and-colour version of a product, with its own price and stock.
- **Compare-at price**: the original price shown crossed out for sales.
- **Coupon / promotion**: a discount code.
- **Outbox**: stored "emails" that would have been sent.
- **Idempotency key**: token that makes a repeated checkout request safe.
- **Cache**: Redis copy of catalog pages for speed; the database is the truth.
- **Demo reset**: wipes and reseeds all data.

<!-- asdlc:questions -->
## Answers from the team

Asked in Slack when ASDLC first read this repo. Edit freely.

1. Who are the real stakeholders for this store: is it purely a demo for the ASDLC proof of concept, or could it become a real shop?
   - its a demo app (<@U0C9LR2QSEQ> in Slack)
2. Which flows matter most when a request changes behaviour: guest checkout, admin catalog and inventory, promotions, or order fulfilment and refunds?
   - all (<@U0C9LR2QSEQ> in Slack)
3. Are there areas agents must not touch beyond those in CLAUDE.md (for example pricing rules, payment mocking, auth, migrations already deployed)?
   - Anything can be touched. (<@U0C9LR2QSEQ> in Slack)
4. Which items in TODOS.md are planned next (real payment provider, OpenAPI, live order feed, wishlist), and which are off limits for now?
   - not sure atm, will keep sharing later (<@U0C9LR2QSEQ> in Slack)
5. Should guest checkout, tax (one flat rate) and shipping (flat rate with free threshold) stay as they are, or are there regional rules coming?
   - stay as it is. (<@U0C9LR2QSEQ> in Slack)
<!-- /asdlc:questions -->
