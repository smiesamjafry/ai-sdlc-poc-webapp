-- Pocket Shop schema v1. Forward-only and additive: later migrations add, never drop or rename.
-- Money is integer cents. Timestamps are timestamptz (UTC).

CREATE TABLE app_meta (
  id               boolean PRIMARY KEY DEFAULT true CHECK (id),
  auth_epoch       integer NOT NULL DEFAULT 1,
  catalog_version  integer NOT NULL DEFAULT 1
);
INSERT INTO app_meta DEFAULT VALUES;

CREATE TABLE users (
  id             uuid PRIMARY KEY,
  email          text NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  name           text NOT NULL,
  role           text NOT NULL CHECK (role IN ('customer', 'staff', 'admin')),
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  token_version  integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id    uuid NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  rotated_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_family ON refresh_tokens(family_id);

CREATE TABLE addresses (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       text NOT NULL DEFAULT 'Home',
  name        text NOT NULL,
  line1       text NOT NULL,
  line2       text,
  city        text NOT NULL,
  region      text,
  postcode    text NOT NULL,
  country     text NOT NULL DEFAULT 'US',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id         uuid PRIMARY KEY,
  parent_id  uuid REFERENCES categories(id),
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  sort       integer NOT NULL DEFAULT 0,
  featured   boolean NOT NULL DEFAULT false
);

CREATE TABLE products (
  id           uuid PRIMARY KEY,
  slug         text NOT NULL UNIQUE,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  brand        text NOT NULL DEFAULT 'Pocket',
  category_id  uuid REFERENCES categories(id),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  featured     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX products_status_created ON products(status, created_at DESC);
CREATE INDEX products_category ON products(category_id);

CREATE TABLE product_images (
  id          uuid PRIMARY KEY,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url         text NOT NULL,
  alt         text NOT NULL,
  sort        integer NOT NULL DEFAULT 0
);
CREATE INDEX product_images_product ON product_images(product_id);

CREATE TABLE variants (
  id                   uuid PRIMARY KEY,
  product_id           uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku                  text NOT NULL UNIQUE,
  size                 text,
  colour               text,
  price_cents          integer NOT NULL CHECK (price_cents >= 0),
  compare_at_cents     integer CHECK (compare_at_cents IS NULL OR compare_at_cents >= 0),
  stock_on_hand        integer NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0),
  low_stock_threshold  integer
);
CREATE INDEX variants_product ON variants(product_id);

CREATE TABLE inventory_movements (
  id          uuid PRIMARY KEY,
  variant_id  uuid NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  delta       integer NOT NULL,
  reason      text NOT NULL,
  ref         text,
  actor_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_variant ON inventory_movements(variant_id, created_at DESC);

CREATE TABLE store_settings (
  id                             boolean PRIMARY KEY DEFAULT true CHECK (id),
  store_name                     text NOT NULL DEFAULT 'Pocket Shop',
  tax_rate_bps                   integer NOT NULL DEFAULT 825 CHECK (tax_rate_bps >= 0),
  flat_shipping_cents            integer NOT NULL DEFAULT 599 CHECK (flat_shipping_cents >= 0),
  free_shipping_threshold_cents  integer NOT NULL DEFAULT 7500 CHECK (free_shipping_threshold_cents >= 0),
  low_stock_threshold            integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0)
);

CREATE TABLE promotions (
  id                         uuid PRIMARY KEY,
  name                       text NOT NULL,
  code                       text NOT NULL UNIQUE,
  type                       text NOT NULL CHECK (type IN ('percentage', 'fixed', 'free_shipping')),
  value                      integer NOT NULL DEFAULT 0 CHECK (value >= 0),
  scope_kind                 text NOT NULL DEFAULT 'all' CHECK (scope_kind IN ('all', 'categories', 'products')),
  scope_ids                  uuid[] NOT NULL DEFAULT '{}',
  min_subtotal_cents         integer NOT NULL DEFAULT 0,
  starts_at                  timestamptz,
  ends_at                    timestamptz,
  usage_limit                integer,
  per_customer_limit         integer,
  used_count                 integer NOT NULL DEFAULT 0,
  active                     boolean NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (usage_limit IS NULL OR used_count <= usage_limit)
);

CREATE TABLE carts (
  id           uuid PRIMARY KEY,
  user_id      uuid UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  guest_token  text UNIQUE,
  coupon_code  text,
  revision     integer NOT NULL DEFAULT 1,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'merged')),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR guest_token IS NOT NULL)
);

CREATE TABLE cart_items (
  cart_id     uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id  uuid NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  quantity    integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (cart_id, variant_id)
);

CREATE TABLE idempotency_keys (
  principal     text NOT NULL,
  key           text NOT NULL,
  request_hash  text NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  response      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (principal, key)
);

CREATE SEQUENCE order_number_seq START 10001;

CREATE TABLE orders (
  id                     uuid PRIMARY KEY,
  number                 text NOT NULL UNIQUE,
  user_id                uuid REFERENCES users(id),
  email                  text NOT NULL,
  access_token_hash      text,
  fulfilment_status      text NOT NULL DEFAULT 'paid'
                         CHECK (fulfilment_status IN ('paid', 'packed', 'shipped', 'delivered', 'cancelled')),
  payment_status         text NOT NULL DEFAULT 'paid'
                         CHECK (payment_status IN ('paid', 'partially_refunded', 'refunded')),
  subtotal_cents         integer NOT NULL,
  discount_cents         integer NOT NULL DEFAULT 0,
  shipping_cents         integer NOT NULL DEFAULT 0,
  tax_cents              integer NOT NULL DEFAULT 0,
  total_cents            integer NOT NULL,
  refunded_cents         integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  coupon_code            text,
  shipping_address       jsonb NOT NULL,
  tracking_number        text,
  idempotency_principal  text,
  idempotency_key        text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (refunded_cents <= total_cents),
  UNIQUE (idempotency_principal, idempotency_key)
);
CREATE INDEX orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX orders_created ON orders(created_at DESC);

CREATE TABLE order_items (
  id                 uuid PRIMARY KEY,
  order_id           uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id         uuid REFERENCES variants(id) ON DELETE SET NULL,
  product_id         uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name       text NOT NULL,
  variant_label      text NOT NULL,
  sku                text NOT NULL,
  unit_price_cents   integer NOT NULL,
  quantity           integer NOT NULL CHECK (quantity > 0),
  line_total_cents   integer NOT NULL,
  refunded_quantity  integer NOT NULL DEFAULT 0 CHECK (refunded_quantity >= 0),
  restocked_quantity integer NOT NULL DEFAULT 0 CHECK (restocked_quantity >= 0),
  CHECK (refunded_quantity <= quantity AND restocked_quantity <= quantity)
);
CREATE INDEX order_items_order ON order_items(order_id);

CREATE TABLE order_events (
  id          uuid PRIMARY KEY,
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type        text NOT NULL,
  detail      text,
  actor_id    uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order ON order_events(order_id, created_at);

CREATE TABLE payment_attempts (
  id               uuid PRIMARY KEY,
  principal        text NOT NULL,
  idempotency_key  text NOT NULL,
  order_id         uuid REFERENCES orders(id) ON DELETE SET NULL,
  provider         text NOT NULL DEFAULT 'mock',
  status           text NOT NULL CHECK (status IN ('succeeded', 'failed')),
  amount_cents     integer NOT NULL,
  card_last4       text,
  decline_reason   text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refunds (
  id            uuid PRIMARY KEY,
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  operation_id  text NOT NULL UNIQUE,
  amount_cents  integer NOT NULL CHECK (amount_cents > 0),
  reason        text,
  lines         jsonb NOT NULL,
  actor_id      uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refunds_order ON refunds(order_id);

CREATE TABLE promotion_redemptions (
  id            uuid PRIMARY KEY,
  promotion_id  uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_key  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promotion_redemptions_customer ON promotion_redemptions(promotion_id, customer_key);

CREATE TABLE order_access_tokens (
  order_id    uuid PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  token_hash  text NOT NULL
);

CREATE TABLE email_outbox (
  id          uuid PRIMARY KEY,
  to_email    text NOT NULL,
  subject     text NOT NULL,
  body        text NOT NULL,
  kind        text NOT NULL,
  ref         text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_outbox_created ON email_outbox(created_at DESC);

CREATE TABLE audit_log (
  id          uuid PRIMARY KEY,
  actor_id    uuid,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created ON audit_log(created_at DESC);
