-- Refonte de la table items : category + sub_category + toutes les valeurs
BEGIN;

-- 1. type -> category (seulement si ce n'est pas deja fait) + colonne sub_category
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'items' AND column_name = 'type') THEN
    ALTER TABLE items RENAME COLUMN type TO category;
  END IF;
END $$;
ALTER TABLE items ADD COLUMN IF NOT EXISTS sub_category text;

-- 2. Vos donnees (table temporaire, supprimee a la fin de la session)
CREATE TEMP TABLE nouveau (
  reference text, category text, sub_category text, designation text, product_photos text,
  prix_showroom text, prix_b2b_cash text, timbre text, prix_b2b_cash_plus_timbre text,
  facilite_6_mois text, facilite_12_mois text, facilite_18_mois text, disponibilite text);
INSERT INTO nouveau VALUES
('AR18DXFAAWK2DZ', 'Climatiseur', 'Wind Free', '18 Kbtu Wind Free', 'assets/AR18DXFZAWK2DZ.png', '174 000,00', '155 000,00', '2%', '158 100,00', '191 400,00', '208 800,00', '226 200,00', 'Quantité très limité'),
('AR18DXFZAWK2DZ', 'Climatiseur', 'Wind', '18 Kbtu Wind', 'assets/AR18DXFAAWK2DZ.png', '153 500,00', '137 000,00', '2%', '139 740,00', '168 850,00', '184 200,00', '199 550,00', 'Quantité limité'),
('AR50F12C1QH2DZ', 'Climatiseur', 'Wind', '12 Kbtu Wind', 'assets/AR50F12C1QH2DZ.jpg', '99 500,00', '88 500,00', '1,50%', '89 827,50', '109 450,00', '119 400,00', '129 350,00', 'Disponible'),
('AR50F18C1QH2DZ', 'Climatiseur', 'Wind', '18 Kbtu Wind', 'assets/AR50F18C1QH2DZ.jpg', '146 000,00', '130 000,00', '2%', '132 600,00', '160 600,00', '175 200,00', '189 800,00', 'Quantité limité'),
('AR50F24C1QH2DZ', 'Climatiseur', 'Wind', '24 Kbtu Wind', 'assets/AR50F24C1QH2DZ.jpg', '181 500,00', '162 000,00', '2%', '165 240,00', '199 650,00', '217 800,00', '235 950,00', 'Disponible'),
('AR60F12C1TW2DZ', 'Climatiseur', 'Wind Free', '12 Kbtu Windfree', 'assets/AR60F12C1TW2DZ.jpg', '130 000,00', '115 500,00', '2%', '117 810,00', '143 000,00', '156 000,00', '169 000,00', 'Disponible'),
('AR60F18C1TW2DZ', 'Climatiseur', 'Wind Free', '18 Kbtu Windfree', 'assets/AR60F18C1TW2DZ.jpg', '177 000,00', '157 500,00', '2%', '160 650,00', '194 700,00', '212 400,00', '230 100,00', 'Disponible'),
('MS23DG4504ATDZ', 'Micro-Ondes', '23L', '23L Dark Grey', 'assets/MS23DG4504ATDZ.png', '35 000,00', '31 000,00', '1,50%', '31 465,00', '38 500,00', '42 000,00', '45 500,00', 'Disponible'),
('MS32DG4504ATDZ', 'Micro-Ondes', '32L', '32L Dark Grey', 'assets/MS32DG4504ATDZ.png', '44 500,00', '39 500,00', '1,50%', '40 092,50', '48 950,00', '53 400,00', '57 850,00', 'Disponible'),
('QA55Q70DAU', 'Téléviseur', 'Qled', '55'''' Qled 4K Serie7', 'assets/QA55Q7FAAU.png', '163 500,00', '145 500,00', '2%', '148 410,00', '179 850,00', '196 200,00', '212 550,00', 'Disponible'),
('QA55Q7FAAU', 'Téléviseur', 'Qled', '55'''' Qled 4K Serie 7', 'assets/QA55Q70DAU.png', '163 500,00', '145 500,00', '2%', '148 410,00', '179 850,00', '196 200,00', '212 550,00', 'Quantité limité'),
('QA55Q80BAU', 'Téléviseur', 'Qled', '55'''' Qled 4K Serie 8', 'assets/QA55Q80BAU.png', '216 000,00', '192 500,00', '2%', '196 350,00', '237 600,00', '259 200,00', '280 800,00', 'Quantité limité'),
('QA55Q80CAU', 'Téléviseur', 'Qled', '55'''' Qled 4K Serie 8', 'assets/QA55Q80CAU.png', '216 000,00', '192 500,00', '2%', '196 350,00', '237 600,00', '259 200,00', '280 800,00', 'Quantité très limité'),
('QA55QN90DAU', 'Téléviseur', 'Neo Qled', '55'''' Neo Qled 4K Serie 9', 'assets/QA55QN90DAU.png', '459 000,00', '409 000,00', '2%', '417 180,00', '504 900,00', '550 800,00', '596 700,00', 'Quantité très limité'),
('QA55QN90FAU', 'Téléviseur', 'Neo Qled', '55'''' Neo Qled Serie 9', 'assets/QA55QN90FAU.png', '459 000,00', '409 000,00', '2%', '417 180,00', '504 900,00', '550 800,00', '596 700,00', 'Quantité très limité'),
('QA55S85FAE', 'Téléviseur', 'O LED', '55" O Serie 8', 'assets/QA55S85FAE.png', '367 500,00', '327 000,00', '2%', '333 540,00', '404 250,00', '441 000,00', '477 750,00', 'Quantité limité'),
('QA65Q70DAU', 'Téléviseur', 'Qled', '65'''' Qled 4K Serie 7', 'assets/QA65Q7FAAU.png', '202 000,00', '180 000,00', '2%', '183 600,00', '222 200,00', '242 400,00', '262 600,00', 'Quantité limité'),
('QA65Q7FAAU', 'Téléviseur', 'Qled', '65'''' Qled 4K Serie 7', 'assets/QA65Q70DAU.png', '202 000,00', '180 000,00', '2%', '183 600,00', '222 200,00', '242 400,00', '262 600,00', 'Quantité limité'),
('QA65QN90CAU', 'Téléviseur', 'Neo Qled', '65'''' Neo Qled 4K Serie 9', 'assets/QA65QN90CAU.png', '625 500,00', '557 000,00', '2%', '568 140,00', '688 050,00', '750 600,00', '813 150,00', 'Quantité très limité'),
('QA65QN90DAU', 'Téléviseur', 'Neo Qled', '65'''' Neo Qled 4K Serie 9', 'assets/QA65QN90DAU.png', '648 000,00', '577 000,00', '2%', '588 540,00', '712 800,00', '777 600,00', '842 400,00', 'Quantité limité'),
('QA65S85FAE', 'Téléviseur', 'O LED', '65" O Serie 8', 'assets/QA65S85FAE.png', '423 500,00', '377 000,00', '2%', '384 540,00', '465 850,00', '508 200,00', '550 550,00', 'Quantité limité'),
('QA75Q7FAAU', 'Téléviseur', 'Qled', '75'''' Qled 4K Serie 7', 'assets/QA75Q7FAAU.png', '331 500,00', '295 000,00', '2%', '300 900,00', '364 650,00', '397 800,00', '430 950,00', 'Quantité limité'),
('QA77S85FAE', 'Téléviseur', 'O LED', '77" O Serie 8', 'assets/QA77S85FAE.png', '756 000,00', '673 500,00', '2%', '686 970,00', '831 600,00', '907 200,00', '982 800,00', 'Quantité limité'),
('QA85QN800DU', 'Téléviseur', 'Neo Qled', '85'''' Neo Qled 8K Serie 8', 'assets/QA85QN800DU.png', '1 534 000,00', '1 365 500,00', '2%', '1 392 810,00', '1 687 400,00', '1 840 800,00', '1 994 200,00', 'Quantité très limité'),
('RT40K5012S8', 'Réfrigérateur', '400L', '2 Portes 400L A+ Inox', 'assets/RT40K5012S8.png', '92 000,00', '82 000,00', '1,50%', '83 230,00', '101 200,00', '110 400,00', '119 600,00', 'Quantité très limité'),
('RT49K5012WW', 'Réfrigérateur', '490L', '2 Portes 490L A+ Blanc', 'assets/RT49K5012WW.png', '103 000,00', '91 500,00', '1,50%', '92 872,50', '113 300,00', '123 600,00', '133 900,00', 'Disponible'),
('RT49K5532S8', 'Réfrigérateur', '490L', '2 Portes 490L A+ Inox', 'assets/RT49K5532S8.png', '116 000,00', '103 000,00', '2%', '105 060,00', '127 600,00', '139 200,00', '150 800,00', 'Quantité limité'),
('RT49K5532WWS3', 'Réfrigérateur', '490L', '2 Portes 490L A+ Blanc', 'assets/RT49K5532WWS3.png', '106 000,00', '94 500,00', '1,50%', '95 917,50', '116 600,00', '127 200,00', '137 800,00', 'Disponible'),
('RT59K6231B1', 'Réfrigérateur', '590L', '2 Portes 590L A+ Noire', 'assets/RT59K6231B1.png', '153 500,00', '137 000,00', '2%', '139 740,00', '168 850,00', '184 200,00', '199 550,00', 'Disponible'),
('RT59K6231S8', 'Réfrigérateur', '590L', '2 Portes 590L A+ Inox', 'assets/RT59K6231S8.png', '148 000,00', '132 000,00', '2%', '134 640,00', '162 800,00', '177 600,00', '192 400,00', 'Disponible'),
('RT59K6231WW', 'Réfrigérateur', '590L', '2 Portes 590L A+ Blanc', 'assets/RT59K6231WW.png', '143 500,00', '127 500,00', '2%', '130 050,00', '157 850,00', '172 200,00', '186 550,00', 'Disponible'),
('UA32N5000AS', 'Téléviseur', 'Crystal LED', '32'''' Serie 5', 'assets/UA32N5000AS.png', '27 000,00', '24 500,00', '1%', '24 745,00', '29 700,00', '32 400,00', '35 100,00', 'Quantité très limité'),
('UA43DU7000U', 'Téléviseur', 'Crystal LED', '43" S7 Smart', 'assets/UA43DU7000U.png', '60 000,00', '53 000,00', '1,50%', '53 795,00', '66 000,00', '72 000,00', '78 000,00', 'Quantité limité'),
('UA43F6000FU', 'Téléviseur', 'Crystal LED', '43'''' S6 Smart', 'assets/UA43F6000FU.png', '51 000,00', '45 500,00', '1,50%', '46 182,50', '56 100,00', '61 200,00', '66 300,00', 'Disponible'),
('UA43N5000AS', 'Téléviseur', 'Crystal LED', '43" Hd S5 No Smart', 'assets/UA43N5000AS.png', '41 000,00', '38 500,00', '1,50%', '39 077,50', '45 100,00', '49 200,00', '53 300,00', 'Quantité très limité'),
('UA43T5300AU', 'Téléviseur', 'Crystal LED', '43'''' S5 Smart', 'assets/UA43T5300AU.png', '54 000,00', '48 500,00', '1,50%', '49 227,50', '59 400,00', '64 800,00', '70 200,00', 'Quantité limité'),
('UA43U8000FU', 'Téléviseur', 'Crystal LED', '43" S8 Smart', 'assets/UA43U8000FU.png', '60 000,00', '53 000,00', '1,50%', '53 795,00', '66 000,00', '72 000,00', '78 000,00', 'Disponible'),
('UA50AU7000U', 'Téléviseur', 'Crystal LED', '50" S7 Smart', 'assets/UA50AU7000U.png', '82 000,00', '75 500,00', '1,50%', '76 632,50', '90 200,00', '98 400,00', '106 600,00', 'Quantité très limité'),
('UA50CU7000U', 'Téléviseur', 'Crystal LED', '50" S7 Smart', 'assets/UA50CU7000U.png', '79 500,00', '71 000,00', '1,50%', '72 065,00', '87 450,00', '95 400,00', '103 350,00', 'Quantité très limité'),
('UA50DU7000U', 'Téléviseur', 'Crystal LED', '50" S7 Smart', 'assets/UA50DU7000U.png', '83 000,00', '73 500,00', '1,50%', '74 602,50', '91 300,00', '99 600,00', '107 900,00', 'Disponible'),
('UA55AU7000U', 'Téléviseur', 'Crystal LED', '55" S7 Smart', 'assets/UA55AU7000U.png', '119 000,00', '106 000,00', '2%', '108 120,00', '130 900,00', '142 800,00', '154 700,00', 'Quantité très limité'),
('UA55CU7000U', 'Téléviseur', 'Crystal LED', '55" S7 Smart', 'assets/UA55CU7000U.png', '119 000,00', '106 000,00', '2%', '108 120,00', '130 900,00', '142 800,00', '154 700,00', 'Quantité très limité'),
('UA55CU8000U', 'Téléviseur', 'Crystal LED', '55" S8 Smart', 'assets/UA55CU8000U.png', '129 000,00', '120 500,00', '2%', '122 910,00', '141 900,00', '154 800,00', '167 700,00', 'Quantité très limité'),
('UA55U8000FU', 'Téléviseur', 'Crystal LED', '55" S8 Smart', 'assets/UA55U8000FU.png', '109 500,00', '97 500,00', '1,50%', '98 962,50', '120 450,00', '131 400,00', '142 350,00', 'Disponible'),
('UA58CU7000U', 'Téléviseur', 'Crystal LED', '58" S7 Smart', 'assets/UA58CU7000U.png', '125 000,00', '117 500,00', '2%', '119 850,00', '137 500,00', '150 000,00', '162 500,00', 'Quantité très limité'),
('UA58U8000FU', 'Téléviseur', 'Crystal LED', '58" S8 Smart', 'assets/UA58U8000FU.png', '129 500,00', '115 000,00', '2%', '117 300,00', '142 450,00', '155 400,00', '168 350,00', 'Disponible'),
('UA60DU7000U', 'Téléviseur', 'Crystal LED', '60" S7 Smart', 'assets/UA60DU7000U.png', '129 500,00', '115 000,00', '2%', '117 300,00', '142 450,00', '155 400,00', '168 350,00', 'Quantité limité'),
('UA65CU7000U', 'Téléviseur', 'Crystal LED', '65" S7 Smart', 'assets/UA65CU7000U.png', '165 000,00', '156 000,00', '2%', '159 120,00', '181 500,00', '198 000,00', '214 500,00', 'Quantité très limité'),
('UA65U8000FU', 'Téléviseur', 'Crystal LED', '65" S8 Smart', 'assets/UA65U8000FU.png', '167 000,00', '149 000,00', '2%', '151 980,00', '183 700,00', '200 400,00', '217 100,00', 'Disponible'),
('UA75DU7000U', 'Téléviseur', 'Crystal LED', '75" S7 Smart', 'assets/UA75DU7000U.png', '246 500,00', '219 500,00', '2%', '223 890,00', '271 150,00', '295 800,00', '320 450,00', 'Quantité limité'),
('UA85DU8000U', 'Téléviseur', 'Crystal LED', '85" S8 Smart', 'assets/UA85DU8000U.png', '402 000,00', '358 000,00', '2%', '365 160,00', '442 200,00', '482 400,00', '522 600,00', 'Quantité très limité'),
('VC18M3125XBDZ', 'Aspirateur', 'Canister', 'Canister 1800 W Blue Cosmo', 'assets/VC18M3125XBDZ.png', '29 000,00', '26 000,00', '1%', '26 260,00', '31 900,00', '34 800,00', '37 700,00', 'Disponible'),
('VC18M3125XPDZ', 'Aspirateur', 'Canister', 'Canister 1800 W Merlot Purple', 'assets/VC18M3125XPDZ.png', '29 000,00', '26 000,00', '1%', '26 260,00', '31 900,00', '34 800,00', '37 700,00', 'Disponible'),
('VS15A60AGX7DZ', 'Aspirateur', 'Jet', 'Jet Stick 410 W Teal Gold', 'assets/VS15A60AGX7DZ.png', '57 500,00', '51 000,00', '1,50%', '51 765,00', '63 250,00', '69 000,00', '74 750,00', 'Disponible'),
('WA70H4200SW', 'Lave-Linge', 'Top', 'Top 7 Kg 700 Tr Blanc', 'assets/WA70H4200SW.png', '49 500,00', '44 000,00', '1,50%', '44 660,00', '54 450,00', '59 400,00', '64 350,00', 'Disponible'),
('WA70H4200SY', 'Lave-Linge', 'Top', 'Top 7 Kg 700 Tr Gris', 'assets/WA70H4200SY.png', '52 000,00', '46 500,00', '1,50%', '47 197,50', '57 200,00', '62 400,00', '67 600,00', 'Quantité très limité'),
('WA90T5260BY', 'Lave-Linge', 'Top', 'Top 9 Kg 700 Tr Gris', 'assets/WA90T5260BY.png', '58 500,00', '52 000,00', '1,50%', '52 780,00', '64 350,00', '70 200,00', '76 050,00', 'Quantité très limité'),
('WD10T654DBN', 'Lave-Linge', 'Front', 'Front 10,5 Kg+7 Add Wash Séchante 1400 Tr Inox', 'assets/WD10T654DBN.png', '122 000,00', '108 500,00', '2%', '110 670,00', '134 200,00', '146 400,00', '158 600,00', 'Quantité très limité'),
('WW70T4020CX', 'Lave-Linge', 'Front', 'Front 7 Kg 1200 Tr Inox', 'assets/WW70T4020CX.png', '63 500,00', '56 500,00', '1,50%', '57 347,50', '69 850,00', '76 200,00', '82 550,00', 'Quantité limité'),
('WW70T4020EE', 'Lave-Linge', 'Front', 'Front 7 Kg 1200 Tr Blanc', 'assets/WW70T4020EE.png', '60 500,00', '53 500,00', '1,50%', '54 302,50', '66 550,00', '72 600,00', '78 650,00', 'Disponible'),
('WW80T554DAN', 'Lave-Linge', 'Front', 'Front 8 Kg 1400 Tr Inox Addwash', 'assets/WW80T554DAN.png', '79 000,00', '70 500,00', '1,50%', '71 557,50', '86 900,00', '94 800,00', '102 700,00', 'Quantité très limité'),
('WW80TA046AX', 'Lave-Linge', 'Front', 'Front 8 Kg 1400 Tr Inox', 'assets/WW80TA046AX.png', '75 000,00', '66 500,00', '1,50%', '67 497,50', '82 500,00', '90 000,00', '97 500,00', 'Disponible'),
('WW80TA046TE', 'Lave-Linge', 'Front', 'Front 8 Kg 1400 Tr Blanc', 'assets/WW80TA046TE.png', '71 500,00', '63 500,00', '1,50%', '64 452,50', '78 650,00', '85 800,00', '92 950,00', 'Disponible'),
('WW90T554DAN', 'Lave-Linge', 'Front', 'Front 9 Kg 1400 Tr Inox Addwash', 'assets/WW90T554DAN.png', '88 500,00', '79 000,00', '1,50%', '80 185,00', '97 350,00', '106 200,00', '115 050,00', 'Quantité limité');

-- 3. Table des couples (categorie, sous-categorie) autorises = le lien
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_category_sub_category_fk;
CREATE TABLE IF NOT EXISTS sub_categories (
  category text NOT NULL, sub_category text NOT NULL, PRIMARY KEY (category, sub_category));
TRUNCATE sub_categories;
INSERT INTO sub_categories SELECT DISTINCT category, sub_category FROM nouveau;

-- 4. Mise a jour des produits (statut, created_at et updated_at sont conserves/geres automatiquement)
UPDATE items i SET
  category = n.category, sub_category = n.sub_category, designation = n.designation,
  product_photos = n.product_photos, prix_showroom = n.prix_showroom,
  prix_b2b_cash = n.prix_b2b_cash, timbre = n.timbre,
  prix_b2b_cash_plus_timbre = n.prix_b2b_cash_plus_timbre,
  facilite_6_mois = n.facilite_6_mois, facilite_12_mois = n.facilite_12_mois,
  facilite_18_mois = n.facilite_18_mois, disponibilite = n.disponibilite
FROM nouveau n
WHERE trim(i.reference) = n.reference;

-- 5. Verrouillage du lien : la sous-categorie doit appartenir a la categorie
ALTER TABLE items ALTER COLUMN sub_category SET NOT NULL;
ALTER TABLE items ADD CONSTRAINT items_category_sub_category_fk
  FOREIGN KEY (category, sub_category) REFERENCES sub_categories (category, sub_category)
  ON UPDATE CASCADE;

COMMIT;

-- Verification (doit afficher 64 lignes, 64 avec sous-categorie)
SELECT category, sub_category, reference, designation, product_photos, disponibilite FROM items ORDER BY reference;
