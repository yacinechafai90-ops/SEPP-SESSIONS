# PostgreSQL setup

This folder is a starter database for the catalogue. The website remains static; these files are for a later data-backed version.

1. Install PostgreSQL 15 or newer and ensure `psql` is on your PATH.
2. Create a database: `createdb samsung_catalogue`.
3. Apply the structure and reference values:
   `psql -d samsung_catalogue -f database/schema.sql`
   `psql -d samsung_catalogue -f database/seed.sql`
4. Install the Node PostgreSQL client in a separate backend project: `npm install pg`.
5. Set a connection string, for example on Windows PowerShell: `$env:DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/samsung_catalogue"`.
6. Run the importer from this folder: `node import-products.mjs`. It loads the supplied catalogue data, keeps the exact references and prices, and upserts payment totals.
7. Build an API around `products`, `product_payment_totals`, `orders`, and `order_items`. Use parameterized queries and validate quantities and payment-plan values on the server.
8. Replace the static `data.js` fetch in the frontend with API calls once the backend is deployed.

The `product_payment_totals_view.monthly_amount_dzd` expression uses PostgreSQL integer division, matching the catalogue whole-dinar display. The source table financing totals remain the stored values.
