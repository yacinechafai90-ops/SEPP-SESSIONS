INSERT INTO categories(name) VALUES
 ('Téléviseurs'),('Climatiseurs'),('Réfrigérateurs'),('Lave-linge'),('Aspirateurs'),('Micro-ondes')
ON CONFLICT (name) DO NOTHING;
INSERT INTO payment_plans(code,months,label) VALUES
 ('cash',0,'Comptant'),('3/6',6,'Financement 6 mois'),('12',12,'Financement 12 mois'),('18',18,'Financement 18 mois')
ON CONFLICT (code) DO NOTHING;
-- Subcategories are intentionally explicit so new catalogue series can be added safely.
INSERT INTO subcategories(category_id,name)
SELECT c.id,v.name FROM categories c CROSS JOIN (VALUES
 ('Téléviseurs','Crystal LED'),('Téléviseurs','QLED'),('Téléviseurs','Neo QLED'),('Téléviseurs','OLED'),
 ('Lave-linge','Front Load'),('Lave-linge','Top Load'),('Aspirateurs','Canister'),('Aspirateurs','Jet Stick'),('Climatiseurs','WindFree')
) AS v(category_name,name) WHERE c.name=v.category_name ON CONFLICT DO NOTHING;
