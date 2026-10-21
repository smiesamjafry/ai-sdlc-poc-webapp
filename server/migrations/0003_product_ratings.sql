-- Product star ratings: anyone can rate (no sign-in), each submission counts once. Only the average and count are public.
CREATE TABLE product_ratings (
  id          uuid PRIMARY KEY,
  product_id  uuid NOT NULL REFERENCES products(id),
  stars       smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_ratings_product ON product_ratings(product_id);
