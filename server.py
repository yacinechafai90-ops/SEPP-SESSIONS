import json
import os
import re
import sys
import unicodedata
from decimal import Decimal
from getpass import getpass
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg import sql
from flask import Flask, Response, abort, send_from_directory, session

app = Flask(__name__, static_folder=None)

DOSSIER = Path(__file__).resolve().parent
NOM_RECHERCHE = "Trial Database"

# --- CONFIGURATION DE LA CONNEXION POSTGRESQL ---
# Hebergement (Railway) : la plateforme fournit DATABASE_URL.
DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("SEPP_DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

HEBERGE = bool(DATABASE_URL)
if HEBERGE:
    # Mode cloud : administration accessible hors de localhost (derriere un proxy).
    os.environ.setdefault("SEPP_CLOUD_MODE", "1")
    NOM_BASE = "railway"
else:
    # Paramètres locaux forcés en IPv4 (127.0.0.1) pour éviter l'erreur réseau IPv6
    HOST_POSTGRES = "127.0.0.1"
    PORT_POSTGRES = 5432
    UTILISATEUR_POSTGRES = "postgres"
    NOM_BASE = "Trial Database"
    MOT_DE_PASSE = os.environ.get("POSTGRES_PASSWORD") or getpass("Mot de passe PostgreSQL : ")

CATEGORIES = {
    "aspirateur": "Aspirateurs",
    "aspirateurs": "Aspirateurs",
    "climatiseur": "Climatiseurs",
    "climatiseurs": "Climatiseurs",
    "crystal led": "Téléviseurs",
    "neo qled": "Téléviseurs",
    "o led": "Téléviseurs",
    "oled": "Téléviseurs",
    "qled": "Téléviseurs",
    "televiseur": "Téléviseurs",
    "televiseurs": "Téléviseurs",
    "micro-ondes": "Micro-ondes",
    "lave-linge": "Lave-linge",
    "refrigerateur": "Réfrigérateurs",
    "refrigerateurs": "Réfrigérateurs",
}


def normaliser(texte):
    texte = unicodedata.normalize("NFKD", str(texte))

    texte = "".join(
        c for c in texte
        if not unicodedata.combining(c)
    )

    return " ".join(texte.lower().split())


def ouvrir_connexion(nom_base=None):
    if DATABASE_URL:
        return psycopg.connect(DATABASE_URL, connect_timeout=5, row_factory=dict_row)
    return psycopg.connect(
        host=HOST_POSTGRES,
        port=PORT_POSTGRES,
        dbname=nom_base or NOM_BASE,
        user=UTILISATEUR_POSTGRES,
        password=MOT_DE_PASSE,
        connect_timeout=5,
        row_factory=dict_row,
    )


COLONNES_CATALOGUE = (
    "reference", "designation", "category", "prix_showroom",
    "prix_b2b_cash_timbre", "facilite_6_mois",
    "facilite_12_mois", "facilite_18_mois",
)

# Autres tables de la base, liees au site (creees par api.py).
TABLE_BOUTIQUES = "brandshops"
TABLE_SPECS = "specs"
TABLE_REMISES = "discount"
TABLE_REMISES_SECOURS = "database_catalogue"

# Noms des colonnes de la table specs pour chaque categorie, dans l'ordre
# des colonnes (apres type, reference, designation). Ainsi les fiches
# techniques ne dependent pas des lignes d'en-tete melangees dans la table.
ETIQUETTES_SPECS = {
    "Aspirateurs": [
        "Vacuum Type", "Max Power Consumption", "Suction Power",
        "Dust Capacity", "Filtration / Technology", "Color / Finish",
        "Key Features",
    ],
    "Climatiseurs": [
        "Capacity (BTU / Tons)", "AC Type / Compressor", "Refrigerant",
        "Energy Class", "Key Features",
    ],
    "Réfrigérateurs": [
        "Refrigerator Type", "Net Capacity", "Gross Capacity",
        "Cooling System / Technology", "Compressor", "Finish / Color",
        "Key Features",
    ],
    "Micro-ondes": [
        "Type / Installation", "Capacity", "Output Power",
        "Power Consumption", "Cavity Interior", "Dimensions (W x H x D)",
        "Finish / Design", "Key Features",
    ],
    "Lave-linge": [
        "Type / Loading", "Washing Capacity", "Max Spin Speed",
        "Motor / Technology", "Color / Finish", "Key Features",
    ],
    "Téléviseurs": [
        "Screen Size", "Resolution & Panel Type",
        "Picture Engine / Processor", "Refresh Rate", "HDMI / USB Specs",
        "HDR Support", "Audio Output", "Smart Platform",
    ],
}


def cle_identifiant(nom):
    return "".join(c for c in normaliser(nom) if c.isalnum())


def lister_tables(connexion):
    lignes = connexion.execute(
        """SELECT table_schema, table_name, column_name
           FROM information_schema.columns
           WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
           ORDER BY table_schema, table_name, ordinal_position"""
    ).fetchall()
    tables = {}
    for ligne in lignes:
        identite = (ligne["table_schema"], ligne["table_name"])
        tables.setdefault(identite, []).append(ligne["column_name"])
    return tables


def chercher_table(tables, nom, schema=None, obligatoire=True):
    candidates = [t for t in tables if cle_identifiant(t[1]) == cle_identifiant(nom)]
    if schema:
        # Preferer le schema de la table items.
        meme_schema = [t for t in candidates if t[0] == schema]
        if meme_schema:
            candidates = meme_schema
    if len(candidates) > 1:
        raise ValueError(f"Plusieurs tables {nom!r} : {candidates!r}")
    if not candidates:
        if obligatoire:
            raise ValueError(
                f"Table {nom!r} introuvable dans {NOM_BASE!r}. "
                f"Tables : {list(tables)!r}"
            )
        return None
    return candidates[0]


def trouver_colonne(colonnes, table, *alias):
    par_cle = {cle_identifiant(c): c for c in colonnes}
    for nom in alias:
        if cle_identifiant(nom) in par_cle:
            return par_cle[cle_identifiant(nom)]
    raise ValueError(
        f"Colonne {alias[0]!r} introuvable dans {table!r}. "
        f"Colonnes presentes : {colonnes!r}"
    )


def trouver_table(connexion):
    tables = lister_tables(connexion)
    candidates = [t for t in tables if cle_identifiant(t[1]) == "items"]
    if not candidates:
        return None, list(tables)
    if len(candidates) != 1:
        raise ValueError(f"Plusieurs tables catalogue : {candidates!r}")
    table = candidates[0]
    colonnes = {}
    for attendue in COLONNES_CATALOGUE:
        noms = ["prix_b2b_cash_plus_timbre" if attendue == "prix_b2b_cash_timbre" else attendue]
        if attendue == "category":
            noms.append("type")  # ancien nom de la colonne
        correspondances = []
        for nom in noms:
            correspondances = [c for c in tables[table]
                               if cle_identifiant(c) == cle_identifiant(nom)]
            if correspondances:
                break
        if len(correspondances) != 1:
            raise ValueError(
                f"Colonne {attendue!r} introuvable ou ambigue dans {table!r}. "
                f"Colonnes presentes : {tables[table]!r}"
            )
        colonnes[attendue] = correspondances[0]
    if "disponibilite" in tables[table]:
        colonnes["availability"] = "disponibilite"
    sous_categorie = next((c for c in tables[table] if cle_identifiant(c) == "subcategory"), None)
    if sous_categorie:
        colonnes["sub_category"] = sous_categorie
    photo = next((c for c in tables[table] if cle_identifiant(c) == "productphotos"), None)
    if photo:
        colonnes["photo"] = photo
    return (table, colonnes), list(tables)


def trouver_base():
    with ouvrir_connexion("postgres") as connexion:
        connexion.execute("SET TRANSACTION READ ONLY")
        lignes = connexion.execute(
            "SELECT datname FROM pg_database "
            "WHERE NOT datistemplate AND datallowconn ORDER BY datname"
        ).fetchall()
    noms = [ligne["datname"] for ligne in lignes]
    preferees = [n for n in noms if normaliser(n) == normaliser(NOM_RECHERCHE)]
    autres = [n for n in noms if n not in preferees]
    details = []
    for groupe in (preferees, autres):
        candidates = []
        for nom in groupe:
            try:
                with ouvrir_connexion(nom) as connexion:
                    connexion.execute("SET TRANSACTION READ ONLY")
                    catalogue, tables = trouver_table(connexion)
                details.append(f"{nom!r}: {tables!r}")
                if catalogue:
                    candidates.append((nom, catalogue[0]))
            except psycopg.OperationalError:
                details.append(f"{nom!r}: connexion impossible")
        if len(candidates) == 1:
            nom, table = candidates[0]
            print(f"Catalogue detecte : base={nom!r}, schema={table[0]!r}, table={table[1]!r}", flush=True)
            return nom
        if len(candidates) > 1:
            raise ValueError(f"Plusieurs bases contiennent le catalogue : {candidates!r}. "
                             "Indiquez la bonne base dans NOM_RECHERCHE de server.py.")
    raise ValueError("Table items introuvable. Tables detectees : " + "; ".join(details))


def lire_catalogue_local():
    # Lire les informations du site sans modifier data.js.
    fichier = DOSSIER / "data.js"
    texte = fichier.read_text(encoding="utf-8-sig")

    if "=" not in texte:
        raise ValueError(
            "data.js doit contenir window.CATALOGUE = {...};"
        )

    catalogue = json.loads(
        texte.split("=", 1)[1].strip().rstrip(";")
    )

    if (
        not isinstance(catalogue, dict)
        or not isinstance(catalogue.get("products"), list)
    ):
        raise ValueError(
            "Le contenu de data.js n'est pas un catalogue valide."
        )

    return catalogue


def trouver_image(reference):
    for dossier in ("assets", "assets/Product photos"):
        for extension in (
            ".png", ".jpg", ".jpeg", ".webp",
            ".PNG", ".JPG", ".JPEG",
        ):
            chemin = Path(dossier) / (reference + extension)

            if (DOSSIER / chemin).is_file():
                return chemin.as_posix()

    return None


def image_depuis_base(valeur):
    """Photo choisie dans l'administration : « assets/xxx.png » (fichier existant).

    Les anciennes valeurs (chemins Windows complets) sont ignorees."""
    chemin = "" if valeur is None else str(valeur).strip()
    if not chemin.startswith("assets/") or "\\" in chemin:
        return None
    base = (DOSSIER / "assets").resolve()
    cible = (DOSSIER / chemin).resolve()
    try:
        cible.relative_to(base)
    except ValueError:
        return None
    return chemin if cible.is_file() or os.environ.get("SEPP_CLOUD_MODE") == "1" else None


def montant(ligne, colonne):
    valeur = ligne[colonne]

    if valeur is None:
        raise ValueError(
            f"Prix vide : {ligne['reference']} / {colonne}"
        )

    texte = str(valeur).strip()
    texte = re.sub(r"(?i)\s*(?:DA|DZD)\.?$", "", texte)
    texte = "".join(texte.split())
    if "," in texte and "." in texte:
        if texte.rfind(",") > texte.rfind("."):
            texte = texte.replace(".", "").replace(",", ".")
        else:
            texte = texte.replace(",", "")
    else:
        texte = texte.replace(",", ".")
    try:
        nombre = Decimal(texte)
    except Exception as erreur:
        raise ValueError(
            f"Prix illisible : {ligne['reference']} / {colonne} = {valeur!r}"
        ) from erreur

    if not nombre.is_finite() or nombre < 0:
        raise ValueError(
            f"Prix invalide : {ligne['reference']} / {colonne}"
        )

    return float(nombre)


# ---------------------------------------------------------------------------
# Tables brandshops, specs, discount (et database_catalogue en secours)
# ---------------------------------------------------------------------------

def texte_propre(valeur):
    return "" if valeur is None else str(valeur).strip()


def telephone(valeur):
    # pandas lit « 0770167167 » comme un nombre : le 0 initial est perdu
    # a l'import. On le remet pour que le site affiche le vrai numero.
    if isinstance(valeur, (int, float, Decimal)) and not isinstance(valeur, bool):
        try:
            valeur = int(valeur)
        except (ValueError, OverflowError):
            valeur = ""
    chiffres = "".join(c for c in texte_propre(valeur) if c.isdigit())
    if len(chiffres) == 9:
        chiffres = "0" + chiffres
    return chiffres


def condition_statut(colonnes):
    """Condition SQL « statut = 'actif' » si la table a une colonne statut."""
    nom = next((c for c in colonnes if cle_identifiant(c) == "statut"), None)
    if nom is None:
        return None
    return sql.SQL("{} = 'actif'").format(sql.Identifier(nom))


def lire_table(connexion, table, ordre=None, condition=None):
    requete = sql.SQL("SELECT * FROM {}").format(sql.Identifier(*table))
    if condition is not None:
        requete += sql.SQL(" WHERE ") + condition
    if ordre:
        requete += sql.SQL(" ORDER BY {}").format(ordre)
    return connexion.execute(requete).fetchall()


def charger_boutiques(connexion, tables, schema):
    table = chercher_table(tables, TABLE_BOUTIQUES, schema)
    colonnes = tables[table]
    c_id = trouver_colonne(colonnes, table, "id")
    c_nom = trouver_colonne(colonnes, table, "nom_du_showroom", "nom", "name")
    c_ville = trouver_colonne(colonnes, table, "ville", "city")
    c_adresse = trouver_colonne(colonnes, table, "adresse", "address")
    c_contact = trouver_colonne(colonnes, table, "responsable_local", "responsable", "contact")
    c_tel = trouver_colonne(colonnes, table, "mobile", "telephone", "phone")
    c_email = trouver_colonne(colonnes, table, "email")

    # Seuls les magasins au statut « actif » sont visibles sur le site.
    lignes = lire_table(connexion, table, sql.Identifier(c_id), condition_statut(colonnes))
    if not lignes:
        raise ValueError(f"La table {table!r} dans {NOM_BASE!r} est vide (ou aucun magasin actif).")

    boutiques = []
    for ligne in lignes:
        nom = texte_propre(ligne[c_nom])
        if not nom:
            raise ValueError(f"Un magasin de {table!r} n'a pas de nom (id={ligne[c_id]!r}).")
        boutiques.append({
            "id": int(ligne[c_id]),
            "name": nom,
            "city": texte_propre(ligne[c_ville]),
            "address": texte_propre(ligne[c_adresse]),
            "contactName": texte_propre(ligne[c_contact]),
            "phone": telephone(ligne[c_tel]),
            "email": texte_propre(ligne[c_email]) or None,
        })
    return boutiques


def libelle_colonne(colonne):
    return " ".join(colonne.replace("_", " ").split()).title()


def charger_specs(connexion, tables, schema):
    """Retourne {reference: {libelle: valeur}}.

    La table specs vient d'un CSV a plusieurs blocs : chaque categorie a sa
    propre ligne d'en-tete (reference vide) qui nomme les colonnes du bloc.
    On relit donc les lignes dans l'ordre d'import et on applique a chaque
    produit les libelles du dernier en-tete rencontre.
    """
    table = chercher_table(tables, TABLE_SPECS, schema)
    colonnes = tables[table]
    c_ref = trouver_colonne(colonnes, table, "reference")
    c_type = trouver_colonne(colonnes, table, "category", "type")
    c_designation = trouver_colonne(colonnes, table, "designation")
    # Colonnes de gestion (statut, dates, sous-categorie) : ce ne sont pas des caracteristiques.
    gestion = ("statut", "createdat", "updatedat", "subcategory")
    autres = [c for c in colonnes
              if c not in (c_ref, c_type, c_designation)
              and cle_identifiant(c) not in gestion]

    # Ordre d'import : colonne d'ordre si elle existe, sinon ordre physique.
    c_ordre = next(
        (c for c in autres if cle_identifiant(c) in ("ordre", "ligne", "position", "rang")),
        None,
    )
    if c_ordre:
        autres.remove(c_ordre)
    ordre = sql.Identifier(c_ordre) if c_ordre else sql.SQL("ctid")
    # Seules les fiches au statut « actif » sont visibles sur le site.
    lignes = lire_table(connexion, table, ordre, condition_statut(colonnes))
    if not lignes:
        raise ValueError(f"La table {table!r} dans {NOM_BASE!r} est vide (ou aucune fiche active).")

    # Premier bloc : l'en-tete du CSV est devenu le nom des colonnes.
    libelles = {c: libelle_colonne(c) for c in autres}
    specs = {}
    for ligne in lignes:
        reference = texte_propre(ligne[c_ref])

        if not reference:
            # Ligne d'en-tete d'un nouveau bloc.
            nouveaux = {c: texte_propre(ligne[c]) for c in autres}
            libelles = {c: t for c, t in nouveaux.items() if t}
            continue

        if reference in specs:
            raise ValueError(f"Reference dupliquee dans {table!r} : {reference}")

        # Libelles selon la categorie du produit (colonne type) ; pour une
        # categorie inconnue, on utilise la derniere ligne d'en-tete lue.
        categorie = CATEGORIES.get(normaliser(texte_propre(ligne[c_type])))
        fixes = ETIQUETTES_SPECS.get(categorie)

        fiche = {}
        for i, c in enumerate(autres):
            valeur = texte_propre(ligne[c])
            if not valeur:
                continue
            if fixes is not None:
                cle = fixes[i] if i < len(fixes) else libelle_colonne(c)
            else:
                cle = libelles.get(c) or libelle_colonne(c)
            fiche[cle] = valeur
        specs[reference] = fiche
    return specs


def pourcentage(valeur, contexte):
    texte = "".join(str(valeur).replace("%", "").split()).replace(",", ".")
    try:
        nombre = Decimal(texte)
    except Exception as erreur:
        raise ValueError(f"Remise illisible : {contexte} = {valeur!r}") from erreur
    if not nombre.is_finite() or nombre < 0 or nombre >= 100:
        raise ValueError(f"Remise invalide : {contexte} = {valeur!r}")
    return int(nombre) if nombre == nombre.to_integral_value() else float(nombre)


def charger_remises(connexion, tables, schema):
    """Retourne {"6": 3, "12": 6, "18": 9} : remise (en %) du panier groupe."""
    for nom in (TABLE_REMISES, TABLE_REMISES_SECOURS):
        table = chercher_table(tables, nom, schema, obligatoire=False)
        if not table:
            continue
        lignes = lire_table(connexion, table)
        if lignes:
            break
    else:
        raise ValueError(
            f"Aucune remise : tables {TABLE_REMISES!r} et "
            f"{TABLE_REMISES_SECOURS!r} absentes ou vides dans {NOM_BASE!r}."
        )

    # Remises desactivees (statut inactif ou supprime) : aucune remise.
    col_statut = next((c for c in lignes[0] if cle_identifiant(c) == "statut"), None)
    if col_statut and texte_propre(lignes[0][col_statut]) != "actif":
        return {"6": 0, "12": 0, "18": 0}

    remises = {}
    for colonne, valeur in lignes[0].items():
        # « 6_months » -> "6"
        mois = re.match(r"\D*(\d+)", colonne)
        if mois and valeur is not None:
            remises[mois.group(1)] = pourcentage(valeur, f"{table[1]}.{colonne}")

    manquants = [m for m in ("6", "12", "18") if m not in remises]
    if manquants:
        raise ValueError(
            f"Remise absente pour {manquants!r} mois dans {table!r}. "
            f"Colonnes presentes : {list(lignes[0])!r}"
        )
    return {m: remises[m] for m in ("6", "12", "18")}


SPECS_SIGNALEES = set()


def charger_catalogue():
    initial = lire_catalogue_local()

    anciens = {
        str(p["reference"]).strip(): p
        for p in initial["products"]
    }

    # Conserver l'ordre actuel du catalogue.
    ordre = {
        reference: i
        for i, reference in enumerate(anciens)
    }

    with ouvrir_connexion(NOM_BASE) as connexion:
        connexion.execute("SET TRANSACTION READ ONLY")

        catalogue_sql, tables = trouver_table(connexion)
        if catalogue_sql is None:
            raise ValueError(f"Table catalogue absente de {NOM_BASE!r}. Tables : {tables!r}")
        table, colonnes = catalogue_sql
        selection = sql.SQL(", ").join(
            sql.SQL("{} AS {}").format(sql.Identifier(colonnes[c]), sql.Identifier(c))
            for c in colonnes
        )
        toutes = lister_tables(connexion)
        # Seuls les produits au statut « actif » sont visibles sur le site.
        condition = condition_statut(toutes[table])
        requete = sql.SQL("SELECT {} FROM {}").format(selection, sql.Identifier(*table))
        if condition is not None:
            requete += sql.SQL(" WHERE ") + condition
        requete += sql.SQL(" ORDER BY {}").format(sql.Identifier(colonnes["reference"]))
        lignes = connexion.execute(requete).fetchall()

        # Les autres tables, lues dans la meme transaction et le meme schema.
        boutiques = charger_boutiques(connexion, toutes, table[0])
        specs = charger_specs(connexion, toutes, table[0])
        remises = charger_remises(connexion, toutes, table[0])

    if not lignes:
        raise ValueError(f"La table {table!r} dans {NOM_BASE!r} est vide (ou aucun produit actif).")

    produits = []
    references = set()

    for ligne in lignes:
        reference = str(
            ligne["reference"] or ""
        ).strip()

        designation = str(
            ligne["designation"] or ""
        ).strip()

        type_produit = str(
            ligne["category"] or ""
        ).strip()

        sous_categorie = str(
            ligne.get("sub_category") or ""
        ).strip()

        if not reference or not designation:
            raise ValueError(
                "Un produit a une référence ou une désignation vide."
            )

        if reference in references:
            raise ValueError(
                f"Référence dupliquée : {reference}"
            )

        references.add(reference)

        ancien = anciens.get(reference, {})

        categorie = CATEGORIES.get(
            normaliser(type_produit)
        )

        if not categorie:
            categorie = ancien.get("category")

        if not categorie:
            raise ValueError(
                f"Type inconnu pour {reference} : "
                f"{type_produit!r}"
            )

        # Garder les informations existantes de ce produit.
        produit = dict(ancien)

        # Actualiser les informations venant de PostgreSQL.
        produit.update({
            "id": reference,
            "reference": reference,
            "name": designation,
            "type": type_produit,
            "subCategory": sous_categorie,
            "category": categorie,

            "marketPrice": montant(
                ligne,
                "prix_showroom",
            ),

            "offerPrice": montant(
                ligne,
                "prix_b2b_cash_timbre",
            ),

            "financing": {
                "3/6": montant(
                    ligne,
                    "facilite_6_mois",
                ),
                "12": montant(
                    ligne,
                    "facilite_12_mois",
                ),
                "18": montant(
                    ligne,
                    "facilite_18_mois",
                ),
            },

            "image": (
                image_depuis_base(ligne.get("photo"))
                or ancien.get("image")
                or trouver_image(reference)
            ),
        })

        # Ces informations ne sont pas dans la table PostgreSQL.
        produit["availability"] = str(ligne.get("availability") or ancien.get("availability") or "À confirmer").strip()
        produit.setdefault("box", None)

        produits.append(produit)

    produits.sort(
        key=lambda p: (
            ordre.get(p["reference"], len(ordre)),
            p["reference"],
        )
    )

    sans_produit = tuple(sorted(set(specs) - references))
    if sans_produit and sans_produit not in SPECS_SIGNALEES:
        SPECS_SIGNALEES.add(sans_produit)  # ne le dire qu'une fois
        print(f"Fiches techniques sans produit actif : {list(sans_produit)!r}", flush=True)

    # Conserver les autres informations de data.js, puis remplacer celles
    # qui viennent maintenant de PostgreSQL.
    catalogue = dict(initial)
    catalogue["products"] = produits
    catalogue["shops"] = boutiques
    catalogue["specs"] = specs
    catalogue["discount"] = remises

    return catalogue


@app.after_request
def desactiver_cache(response):
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/")
def accueil():
    return send_from_directory(
        DOSSIER,
        "index.html",
    )


@app.get("/monthly-payment-table.js")
def mensualites_utilisateur():
    catalogue = acces_utilisateurs.appliquer_offre(globals(), charger_catalogue(), session['utilisateur_id'])
    montants = {p['reference']: [round(p['financing'][cle] / mois / 100) * 100
                  for cle, mois in [('3/6', 6), ('12', 12), ('18', 18)]]
                for p in catalogue['products']}
    return Response('window.MONTHLY_PAYMENT_TABLE = ' + json.dumps(montants) + ';',
                    mimetype='application/javascript')

@app.get("/data.js")
def donnees_postgresql():
    try:
        catalogue = charger_catalogue()
        catalogue = acces_utilisateurs.appliquer_offre(globals(), catalogue, session['utilisateur_id'])

        javascript = (
            "window.CATALOGUE = "
            + json.dumps(
                catalogue,
                ensure_ascii=True,
                allow_nan=False,
            )
            + ";\n"
            # Les scripts du site (comparateur, fiche produit) lisent
            # window.PRODUCT_SPECS : on le remplit depuis la table specs.
            + "window.PRODUCT_SPECS = window.CATALOGUE.specs;"
        )

        return Response(
            javascript,
            mimetype="application/javascript",
        )

    except Exception as erreur:
        message = (
            f"{type(erreur).__name__} : {erreur}"
        )

        print(message, flush=True)

        return Response(
            message,
            status=500,
            mimetype="text/plain",
        )


# Page d'administration (CRUD) : http://127.0.0.1:5002/admin
import admin

admin.installer(app, globals())

# Bouton de publication locale (non utilise par le service Render).
if os.environ.get("SEPP_CLOUD_MODE") != "1":
    import publication
    publication.installer(app, globals())

import acces_utilisateurs
acces_utilisateurs.installer(app, globals())

import gestion_sessions
gestion_sessions.installer(app, globals())


def preparer_hebergement():
    """Sur l'hebergement, gunicorn n'execute pas le bloc __main__ : on prepare la base ici."""
    try:
        admin.preparer_base(globals())
        acces_utilisateurs.preparer_base(globals())
        admin.preparer_acces(globals())
        print("Base prete sur l'hebergement.", flush=True)
    except Exception as erreur:
        print(f"Preparation de la base impossible : {type(erreur).__name__} : {erreur}", flush=True)


if HEBERGE:
    preparer_hebergement()


@app.get("/assets/<path:nom>")
def photo_session(nom):
    if any(part.startswith(".") or part == ".." for part in Path(nom).parts):
        abort(404)
    chemin="assets/"+nom
    if (DOSSIER/chemin).is_file():
        return send_from_directory(DOSSIER,chemin)
    if os.environ.get("SEPP_CLOUD_MODE") == "1":
        with ouvrir_connexion(NOM_BASE) as cn:
            row=cn.execute('SELECT contenu,mime FROM public.photos_session WHERE chemin=%s',(chemin,)).fetchone()
        if row:
            return Response(bytes(row['contenu']),mimetype=row['mime'])
    abort(404)


@app.get("/<path:nom>")
def fichiers_site(nom):
    extensions = {
        ".html", ".js", ".css",
        ".png", ".jpg", ".jpeg",
        ".webp", ".svg", ".gif", ".ico",
        ".ttf", ".woff", ".woff2",
        ".pdf", ".xlsx",
    }

    if (
        Path(nom).suffix.lower() not in extensions
        or any(
            part.startswith(".")
            for part in Path(nom).parts
        )
    ):
        abort(404)

    return send_from_directory(DOSSIER, nom)


if __name__ == "__main__":
    MOT_DE_PASSE = getpass(
        "Mot de passe PostgreSQL : "
    )

    # Vérifier la connexion avant de démarrer le site.
    try:
        NOM_BASE = trouver_base()
        # Ajoute (si absentes) les colonnes statut, created_at et updated_at.
        admin.preparer_base(globals())
        acces_utilisateurs.preparer_base(globals())
        # Mot de passe administrateur (demandé une seule fois, la 1re utilisation).
        admin.preparer_acces(globals())
        catalogue_test = charger_catalogue()

    except Exception as erreur:
        print(
            "Connexion non démarrée : "
            f"{type(erreur).__name__} : {erreur}"
        )
        sys.exit(1)

    print(f"Base trouvée : {NOM_BASE!r}")

    print(
        f"Catalogue chargé : "
        f"{len(catalogue_test['products'])} produits, "
        f"{len(catalogue_test['shops'])} magasins, "
        f"{len(catalogue_test['specs'])} fiches techniques, "
        f"remises {catalogue_test['discount']}."
    )

    app.run(
        host="127.0.0.1",
        port=5002,
        debug=False,
    )
