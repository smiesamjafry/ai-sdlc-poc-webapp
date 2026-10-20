# Error codes

Every API error is `application/problem+json`:

```json
{ "type": "…/docs/errors.md#code", "title": "…", "status": 409, "detail": "…", "instance": "<request id>",
  "requestId": "<request id>", "code": "INSUFFICIENT_STOCK", "fix": "Set the quantity to 2 or less.", "retryable": false }
```

`fields` is added for validation errors; `Retry-After` is sent with 429 and 503. Quote the `requestId` when reporting a problem; it appears in the API logs.

| Code | Status | Meaning | What to do |
|---|---|---|---|
| <a id="validation_failed"></a>`VALIDATION_FAILED` | 422 | Input failed validation; see `fields` | Fix the listed fields and resend |
| <a id="malformed_json"></a>`MALFORMED_JSON` | 400 | Body is not JSON | Send JSON with `Content-Type: application/json` |
| <a id="not_found"></a>`NOT_FOUND` | 404 | Resource missing or not yours | Check the id/slug |
| <a id="route_not_found"></a>`ROUTE_NOT_FOUND` | 404 | No such route | See `api.md` |
| <a id="unauthenticated"></a>`UNAUTHENTICATED` | 401 | No or malformed bearer token | Sign in |
| <a id="token_expired"></a>`TOKEN_EXPIRED` | 401 | Access token expired (15 min) | `POST /auth/refresh`, retry once |
| <a id="token_revoked"></a>`TOKEN_REVOKED` | 401 | Session revoked or refresh token reused | Sign in again |
| <a id="auth_epoch_changed"></a>`AUTH_EPOCH_CHANGED` | 401 | The demo store was reset | Sign in again |
| <a id="account_disabled"></a>`ACCOUNT_DISABLED` | 401 | Customer disabled by an admin | Ask an admin |
| <a id="invalid_credentials"></a>`INVALID_CREDENTIALS` | 401 | Wrong email or password | Check and retry |
| <a id="forbidden_role"></a>`FORBIDDEN_ROLE` | 403 | Role not allowed (e.g. staff calling an admin-only route) | Ask an admin |
| <a id="preview_read_only"></a>`PREVIEW_READ_ONLY` | 403 | A read-only preview origin tried to sign in or write | Use the storefront or a `[render preview]` environment |
| <a id="email_taken"></a>`EMAIL_TAKEN` | 409 | Account already exists | Sign in |
| <a id="insufficient_stock"></a>`INSUFFICIENT_STOCK` | 409 | Not enough stock; `available` and `items` say how much | Lower the quantity |
| <a id="coupon_invalid"></a>`COUPON_INVALID` | 422 | Code unknown, expired, not started, used up or minimum not met (`detail` says which) | Remove or change the code |
| <a id="coupon_limit_reached"></a>`COUPON_LIMIT_REACHED` | 409 | Code ran out during checkout | Remove the code and retry |
| <a id="cart_empty"></a>`CART_EMPTY` | 422 | Nothing to check out (or another checkout already used the cart) | Add items |
| <a id="payment_declined"></a>`PAYMENT_DECLINED` | 402 | Mock card declined; nothing was charged and the cart is unchanged | Use another card **with a new Idempotency-Key** |
| <a id="idempotency_key_reused"></a>`IDEMPOTENCY_KEY_REUSED` | 409 | Same key, different request body | Generate a new key for a new attempt |
| <a id="checkout_in_progress"></a>`CHECKOUT_IN_PROGRESS` | 409 | Another request with this key is running | Wait 2 s, resend the same request and key |
| <a id="checkout_busy"></a>`CHECKOUT_BUSY` | 503 | Database contention after retries | Resend the same request with the same key; you'll get the order if it completed |
| <a id="rate_limited"></a>`RATE_LIMITED` | 429 | Too many requests from this IP | Wait `Retry-After` seconds |
| <a id="illegal_transition"></a>`ILLEGAL_TRANSITION` | 409 | Order status change not allowed | Allowed steps: paid→packed→shipped→delivered; cancel only paid/packed |
| <a id="already_cancelled"></a>`ALREADY_CANCELLED` | 409 | Order already cancelled | None |
| <a id="refund_exceeds_quantity"></a>`REFUND_EXCEEDS_QUANTITY` | 409 | Refund more units than remain | Lower the quantity |
| <a id="nothing_to_refund"></a>`NOTHING_TO_REFUND` | 409 | Order fully refunded | None |
| <a id="stock_negative"></a>`STOCK_NEGATIVE` | 409 | Adjustment would make stock negative | Use a smaller decrease |
| <a id="category_in_use"></a>`CATEGORY_IN_USE` | 409 | Category still has products or children | Move them first |
| <a id="internal"></a>`INTERNAL` | 500 | Unexpected failure (logged with the request id) | Retry once, then report the request id |
