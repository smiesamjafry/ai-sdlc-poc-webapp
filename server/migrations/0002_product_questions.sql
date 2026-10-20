-- Product Q&A: visitors ask, admins answer. Only answered questions are public.
CREATE TABLE product_questions (
  id           uuid PRIMARY KEY,
  product_id   uuid NOT NULL REFERENCES products(id),
  question     text NOT NULL,
  answer       text,
  answered_by  uuid REFERENCES users(id),
  answered_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_questions_product ON product_questions(product_id, answered_at DESC);
CREATE INDEX product_questions_unanswered ON product_questions(created_at) WHERE answer IS NULL;
