-- Samsung employee catalogue schema for PostgreSQL 15+
CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE subcategories (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE(category_id, name)
);
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  designation TEXT NOT NULL,
  category_id BIGINT NOT NULL REFERENCES categories(id),
  subcategory_id BIGINT REFERENCES subcategories(id),
  market_price_dzd INTEGER NOT NULL CHECK (market_price_dzd >= 0),
  offer_price_dzd INTEGER NOT NULL CHECK (offer_price_dzd >= 0),
  availability TEXT NOT NULL,
  image_path TEXT,
  specs JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_plans (
  id SMALLSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  months SMALLINT NOT NULL CHECK (months IN (0,6,12,18)),
  label TEXT NOT NULL
);
CREATE TABLE product_payment_totals (
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  payment_plan_id SMALLINT NOT NULL REFERENCES payment_plans(id),
  total_amount_dzd INTEGER NOT NULL CHECK (total_amount_dzd >= 0),
  PRIMARY KEY(product_id, payment_plan_id)
);
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_first_name TEXT,
  card_number TEXT,
  position TEXT,
  showroom TEXT,
  telephone TEXT,
  payment_plan_id SMALLINT REFERENCES payment_plans(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','collected','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_dzd INTEGER NOT NULL CHECK (unit_price_dzd >= 0),
  duration_months SMALLINT NOT NULL DEFAULT 0 CHECK (duration_months IN (0,6,12,18)),
  line_total_dzd INTEGER GENERATED ALWAYS AS (quantity * unit_price_dzd) STORED
);
CREATE INDEX products_category_idx ON products(category_id);
CREATE INDEX products_subcategory_idx ON products(subcategory_id);
CREATE INDEX order_items_order_idx ON order_items(order_id);

CREATE VIEW product_payment_totals_view AS
SELECT pp.product_id, pp.payment_plan_id, pp.total_amount_dzd, CASE WHEN pl.months=0 THEN pp.total_amount_dzd ELSE pp.total_amount_dzd / pl.months END AS monthly_amount_dzd
FROM product_payment_totals pp JOIN payment_plans pl ON pl.id=pp.payment_plan_id;
