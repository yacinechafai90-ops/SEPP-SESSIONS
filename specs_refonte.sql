-- Refonte de la table specs : category + sub_category, reliees aux produits (items)
-- A executer APRES items_refonte.sql.
BEGIN;

-- 0. Verification : items_refonte.sql doit avoir ete execute
DO $$
BEGIN
  IF to_regclass('sub_categories') IS NULL THEN
    RAISE EXCEPTION 'Executez d''abord items_refonte.sql (la table sub_categories est absente).';
  END IF;
END $$;

-- 1. type -> category (seulement si ce n'est pas deja fait) + colonne sub_category
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'specs' AND column_name = 'type')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'specs' AND column_name = 'category') THEN
    ALTER TABLE specs RENAME COLUMN type TO category;
  END IF;
END $$;
ALTER TABLE specs ADD COLUMN IF NOT EXISTS sub_category text;

-- 2. Les fiches reprennent categorie, sous-categorie et designation de leur produit
--    (les lignes d'en-tete de blocs, sans reference, ne sont pas touchees)
UPDATE specs s
SET category = i.category, sub_category = i.sub_category, designation = i.designation
FROM items i
WHERE btrim(s.reference) = btrim(i.reference);

-- 3. Lien avec la table des couples autorises (comme items)
--    Les lignes sans sous-categorie (en-tetes de blocs) ne sont pas controlees.
ALTER TABLE specs DROP CONSTRAINT IF EXISTS specs_category_sub_category_fk;
ALTER TABLE specs ADD CONSTRAINT specs_category_sub_category_fk
  FOREIGN KEY (category, sub_category) REFERENCES sub_categories (category, sub_category)
  ON UPDATE CASCADE;

-- 4. Une fiche reprend TOUJOURS les valeurs de son produit, meme si on la modifie dans pgAdmin
CREATE OR REPLACE FUNCTION specs_depuis_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p record;
BEGIN
  IF NEW.reference IS NULL OR btrim(NEW.reference) = '' THEN
    RETURN NEW;                       -- ligne d'en-tete de bloc : rien a faire
  END IF;
  SELECT category, sub_category, designation INTO p
  FROM items WHERE btrim(reference) = btrim(NEW.reference) LIMIT 1;
  IF FOUND THEN
    NEW.category := p.category;
    NEW.sub_category := p.sub_category;
    NEW.designation := p.designation;
  ELSIF TG_OP = 'INSERT' OR NEW.reference IS DISTINCT FROM OLD.reference THEN
    RAISE EXCEPTION 'La reference % n''existe pas dans items : creez d''abord le produit.', NEW.reference;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS specs_depuis_items ON specs;
CREATE TRIGGER specs_depuis_items BEFORE INSERT OR UPDATE ON specs
  FOR EACH ROW EXECUTE PROCEDURE specs_depuis_items();

-- 5. Produit modifie dans items => sa fiche suit (reference, categorie, sous-categorie, designation)
CREATE OR REPLACE FUNCTION items_vers_specs() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reference IS DISTINCT FROM OLD.reference THEN
    UPDATE specs SET reference = NEW.reference WHERE btrim(reference) = btrim(OLD.reference);
  END IF;
  UPDATE specs
  SET category = NEW.category, sub_category = NEW.sub_category, designation = NEW.designation
  WHERE btrim(reference) = btrim(NEW.reference);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS items_vers_specs ON items;
CREATE TRIGGER items_vers_specs AFTER UPDATE OF reference, category, sub_category, designation ON items
  FOR EACH ROW EXECUTE PROCEDURE items_vers_specs();

COMMIT;

-- Verification 1 : fiches dont la reference n'existe pas dans items (doit etre VIDE)
SELECT s.reference, s.category, s.designation
FROM specs s
WHERE s.reference IS NOT NULL AND btrim(s.reference) <> ''
  AND NOT EXISTS (SELECT 1 FROM items i WHERE btrim(i.reference) = btrim(s.reference));

-- Verification 2 : produits sans fiche technique (informatif)
SELECT i.category, i.sub_category, i.reference
FROM items i
WHERE NOT EXISTS (SELECT 1 FROM specs s WHERE btrim(s.reference) = btrim(i.reference))
ORDER BY 1, 2, 3;

-- Verification 3 : toutes les fiches
SELECT category, sub_category, reference, designation FROM specs
WHERE reference IS NOT NULL AND btrim(reference) <> ''
ORDER BY category, sub_category, reference;
