"""Administration du catalogue : page /admin et API /admin/api/...

Permet d'ajouter, modifier et « supprimer » des lignes dans les tables
PostgreSQL du site (items, brandshops, specs, discount, database_catalogue).

Chaque table a trois colonnes de gestion :
  - statut      : actif (par defaut), inactif ou supprimé
  - created_at  : date de creation
  - updated_at  : date de derniere modification (mise a jour automatiquement)
Seules les lignes « actif » sont visibles sur le site. « Supprimer » ne
detruit rien : la ligne passe au statut « supprimé » et reste dans la base.

Ce module est branche dans server.py par :  admin.installer(app, globals())
"""
import json
import os
import re
import secrets
import time
from datetime import timedelta
from decimal import Decimal
from getpass import getpass
from pathlib import Path

import psycopg
from flask import (Response, abort, jsonify, redirect, request,
                   send_from_directory, session)
from psycopg import sql
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename


STATUTS = ["actif", "inactif", "supprimé"]
STATUT_DEFAUT = "actif"
STATUT_SUPPRIME = "supprimé"
COLONNES_DATES = ("created_at", "updated_at")

# --- Acces administrateur -------------------------------------------------
# L'identifiant et l'empreinte du mot de passe (jamais le mot de passe lui-meme)
# sont dans ce fichier, non telechargeable depuis le site. Pour changer
# l'identifiant ou le mot de passe : supprimez ce fichier et relancez le serveur.
FICHIER_ACCES = "admin-acces.json"
ANCIEN_FICHIER_ACCES = "admin-acces.hash"   # ancienne version (mot de passe seul)
# True : l'administration n'est accessible que depuis cet ordinateur.
# Mettre False seulement si le serveur est publie sur un reseau.
ADMIN_LOCAL_SEULEMENT = os.environ.get("SEPP_CLOUD_MODE") != "1"
TENTATIVES_MAX = 5          # essais rates avant blocage
BLOCAGE_SECONDES = 300      # duree du blocage (5 minutes)
MOT_DE_PASSE_MIN = 10       # longueur minimale (avec lettre et chiffre)

_acces = {"id": None, "hash": None}
_echecs = {}

PAGE_LOGIN = """<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connexion administrateur</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f5f9;font:15px Arial,Helvetica,sans-serif;color:#101726}
  form{background:#fff;border:1px solid #dfe3ec;border-radius:14px;padding:30px;width:min(380px,92vw);box-shadow:0 10px 30px #1428a022}
  h1{margin:0 0 6px;font-size:20px;color:#1428a0}
  p{margin:0 0 18px;color:#5b6475}
  input{width:100%;padding:11px 12px;border:1px solid #dfe3ec;border-radius:8px;font:inherit;box-sizing:border-box}
  button{margin-top:14px;width:100%;border:0;border-radius:8px;padding:11px;background:#1428a0;color:#fff;font:inherit;cursor:pointer}
  .erreur{color:#b3261e;margin-top:12px;min-height:1em}
  a{display:block;text-align:center;margin-top:16px;color:#1428a0;text-decoration:none;font-size:14px}
</style></head><body>
<form method="post" action="/admin/login">
  <h1>Administration</h1>
  <p>Entrez votre identifiant et votre mot de passe.</p>
  <input type="text" name="identifiant" placeholder="Identifiant" autocomplete="username" autofocus required>
  <input type="password" name="mot_de_passe" placeholder="Mot de passe" autocomplete="current-password" required style="margin-top:10px">
  <button type="submit">Se connecter</button>
  <div class="erreur">{{message}}</div>
  <a href="/">← Retour au site</a>
</form></body></html>"""


def demander_identifiant():
    while True:
        identifiant = input("Identifiant administrateur (3 à 32 caractères, sans espace) : ").strip()
        if re.fullmatch(r"[\w.@-]{3,32}", identifiant):
            return identifiant
        print("Identifiant invalide : 3 à 32 caractères (lettres, chiffres, . _ - @).", flush=True)


def demander_mot_de_passe():
    while True:
        premier = getpass(
            f"Mot de passe administrateur ({MOT_DE_PASSE_MIN} caractères minimum, "
            "avec au moins une lettre et un chiffre) : "
        )
        if (len(premier) < MOT_DE_PASSE_MIN
                or not re.search(r"[A-Za-z]", premier) or not re.search(r"\d", premier)):
            print(f"Trop faible : {MOT_DE_PASSE_MIN} caractères minimum, "
                  "avec au moins une lettre et un chiffre.", flush=True)
            continue
        if getpass("Confirmez le mot de passe : ") != premier:
            print("Les deux mots de passe sont différents. Recommencez.", flush=True)
            continue
        return premier


def preparer_acces(srv):
    """Charge l'identifiant et le mot de passe administrateur (demandés la 1re fois)."""
    if os.environ.get("SEPP_CLOUD_MODE") == "1":
        identifiant=os.environ.get("SEPP_ADMIN_ID", "").strip()
        empreinte=os.environ.get("SEPP_ADMIN_PASSWORD_HASH", "").strip()
        if not identifiant or not empreinte:
            raise ValueError("Définissez SEPP_ADMIN_ID et SEPP_ADMIN_PASSWORD_HASH sur Render.")
        _acces["id"],_acces["hash"]=identifiant,empreinte
        return
    dossier = Path(srv["DOSSIER"])
    fichier = dossier / FICHIER_ACCES
    ancien = dossier / ANCIEN_FICHIER_ACCES
    if not fichier.exists():
        if ancien.exists():
            # Ancienne version : un mot de passe seul. On le garde, on ajoute l'identifiant.
            print("\nL'administration utilise maintenant un identifiant en plus du mot de "
                  "passe. Votre mot de passe actuel est conservé.", flush=True)
            identifiant = demander_identifiant()
            empreinte = ancien.read_text(encoding="utf-8").strip()
        else:
            print("\nPremière utilisation de l'administration : "
                  "choisissez un identifiant et un mot de passe.", flush=True)
            identifiant = demander_identifiant()
            empreinte = generate_password_hash(demander_mot_de_passe())
        fichier.write_text(json.dumps({"id": identifiant, "hash": empreinte}), encoding="utf-8")
        if ancien.exists():
            try:
                ancien.unlink()
            except OSError:
                pass
        print("Accès administrateur enregistré.\n", flush=True)
    donnees = json.loads(fichier.read_text(encoding="utf-8"))
    _acces["id"] = donnees["id"]
    _acces["hash"] = donnees["hash"]


# Tables gerees. "mode" : "crud" = ajouter / modifier / supprimer,
# "edit" = table d'une seule ligne, modification uniquement.
TABLES = [
    {
        "nom": "items", "titre": "Produits", "mode": "crud", "cle": "reference",
        "liste": ["category", "sub_category", "reference", "designation", "prix_showroom",
                  "prix_b2b_cash_plus_timbre", "disponibilite"],
        "tri": ["category", "sub_category", "reference"],
        "obligatoires": ["category", "sub_category", "reference", "designation"],
        "aide": "Les prix sont lus tels quels : écrivez par exemple 174 000,00. "
                "Le prix remisé affiché au client est « Prix B2B cash + timbre ». "
                "Seuls les produits « actif » apparaissent sur le site.",
    },
    {
        "nom": "brandshops", "titre": "Magasins", "mode": "crud", "cle": "id",
        "liste": ["nom_du_showroom", "ville", "mobile", "email"],
        "tri": ["id"],
        "obligatoires": ["nom_du_showroom", "ville"],
        "aide": "L'identifiant est attribué automatiquement. "
                "Seuls les magasins « actif » apparaissent sur le site.",
    },
    {
        "nom": "specs", "titre": "Fiches techniques", "mode": "crud", "cle": "reference",
        "liste": ["category", "sub_category", "reference", "designation"],
        "tri": ["category", "sub_category", "reference"],
        "obligatoires": ["category", "reference"],
        "aide": "Choisissez la référence d'un produit : sa catégorie, sa sous-catégorie et sa "
                "désignation sont reprises automatiquement du produit. Les champs changent selon la catégorie.",
    },
    {
        "nom": "discount", "titre": "Remises", "mode": "edit",
        "obligatoires": [],
        "aide": "Remise en % appliquée au panier à partir de 3 articles : "
                "5 = 5 %. Nombres entiers de 0 à 99. "
                "Si le statut n'est pas « actif », aucune remise n'est appliquée.",
    },
    {
        "nom": "database_catalogue", "titre": "Remises (secours)", "mode": "edit",
        "obligatoires": [],
        "aide": "Table de secours : le site ne l'utilise que si la table "
                "« Remises » est vide.",
    },
]

ETIQUETTES = {
    "type": "Type",
    "category": "Catégorie",
    "sub_category": "Sous-catégorie",
    "reference": "Référence",
    "designation": "Désignation",
    "product_photos": "Photo du produit",
    "prix_showroom": "Prix showroom",
    "prix_b2b_cash": "Prix B2B cash",
    "timbre": "Timbre",
    "prix_b2b_cash_plus_timbre": "Prix B2B cash + timbre (prix remisé affiché)",
    "facilite_6_mois": "Total facilité 6 mois",
    "facilite_12_mois": "Total facilité 12 mois",
    "facilite_18_mois": "Total facilité 18 mois",
    "disponibilite": "Disponibilité",
    "id": "Identifiant",
    "nom_du_showroom": "Nom du showroom",
    "ville": "Ville",
    "adresse": "Adresse",
    "responsable_local": "Responsable local",
    "mobile": "Mobile",
    "email": "E-mail",
    "6_months": "Remise 6 mois (%)",
    "12_months": "Remise 12 mois (%)",
    "18_months": "Remise 18 mois (%)",
    "statut": "Statut",
    "created_at": "Créé le",
    "updated_at": "Modifié le",
}

# Ancien fonctionnement (colonne « type ») : utilise tant que la table
# sub_categories n'existe pas encore dans la base.
TYPES_CONNUS = [
    "Aspirateur", "Climatiseur", "Réfrigérateur", "Micro-Ondes",
    "Lave-Linge", "Crystal LED", "Qled", "Neo Qled", "O LED",
]
# Nom ancien -> nom actuel d'une colonne logique.
ALIAS_COLONNES = {"category": ("type",)}
DISPONIBILITES = ["Disponible", "Quantité limité", "Quantité très limité"]
CATEGORIES_ORDRE = ["Téléviseurs", "Climatiseurs", "Réfrigérateurs",
                    "Lave-linge", "Aspirateurs", "Micro-ondes"]

COLONNES_PRIX = (
    "prix_showroom", "prix_b2b_cash_plus_timbre",
    "facilite_6_mois", "facilite_12_mois", "facilite_18_mois",
)


class ErreurAdmin(Exception):
    pass


# --- Photos : images du dossier assets ------------------------------------
EXT_IMAGES = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg")
DOSSIERS_IGNORES = {"banners", "fonts", "smartthings"}
FICHIERS_IGNORES = re.compile(r"^(\d+|logo|smart|front tag)", re.IGNORECASE)


def lister_images(dossier_site):
    """Chemins des photos proposees, depuis le site : « assets/xxx.png »."""
    base = Path(dossier_site) / "assets"
    images = []
    if not base.is_dir():
        return images
    for chemin in sorted(base.rglob("*"), key=lambda p: p.as_posix().lower()):
        if not chemin.is_file() or chemin.suffix.lower() not in EXT_IMAGES:
            continue
        relatif = chemin.relative_to(base)
        if relatif.parts[0] in DOSSIERS_IGNORES:
            continue
        if len(relatif.parts) == 1 and FICHIERS_IGNORES.match(chemin.stem):
            continue
        images.append("assets/" + relatif.as_posix())
    return images


# --- Photo envoyee depuis l'ordinateur de l'administrateur -----------------
TAILLE_PHOTO_MAX = 5 * 1024 * 1024  # 5 Mo
EXT_PHOTOS_ENVOI = {".png", ".jpg", ".jpeg", ".webp"}


def type_image(octets):
    """Format reel d'une image d'apres son contenu (pas son nom) : 'png', 'jpg', 'webp' ou None."""
    if octets.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if octets.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if octets[:4] == b"RIFF" and octets[8:12] == b"WEBP":
        return "webp"
    return None


def copier_photo(dossier_site, nom_origine, octets):
    """Copie la photo dans assets/ et retourne « assets/nom.ext ».

    - extension et contenu doivent correspondre a une vraie image png/jpg/webp ;
    - le nom est nettoye (lettres, chiffres, . _ -) ;
    - un fichier existant n'est JAMAIS ecrase : si le nom est pris par une autre
      image, on ajoute -2, -3... ; si c'est exactement la meme image, on la reutilise.
    """
    if not octets:
        raise ErreurAdmin("Photo : fichier vide.")
    if len(octets) > TAILLE_PHOTO_MAX:
        raise ErreurAdmin("Photo : 5 Mo maximum.")
    nom = secure_filename(Path(str(nom_origine or "")).name)
    extension = Path(nom).suffix.lower()
    if extension not in EXT_PHOTOS_ENVOI:
        raise ErreurAdmin("Photo : formats acceptés : PNG, JPG ou WEBP.")
    reel = type_image(octets)
    if reel is None or (reel == "jpg") != (extension in (".jpg", ".jpeg")) \
            or (reel in ("png", "webp") and extension != "." + reel):
        raise ErreurAdmin("Photo : le contenu du fichier n'est pas une image PNG, JPG ou WEBP valide.")
    base = Path(dossier_site) / "assets"
    base.mkdir(exist_ok=True)
    racine = Path(nom).stem[:80] or "photo"
    numero = 1
    while True:
        candidat = f"{racine}{'' if numero == 1 else '-' + str(numero)}{extension}"
        cible = base / candidat
        try:
            with open(cible, "xb") as fichier:  # "x" : refuse d'ecraser
                fichier.write(octets)
            return "assets/" + candidat
        except FileExistsError:
            if cible.read_bytes() == octets:
                return "assets/" + candidat
            numero += 1
            if numero > 200:
                raise ErreurAdmin("Photo : trop de fichiers portant ce nom.")


def photo_valide(dossier_site, chemin):
    """Vrai si « chemin » designe une image existante dans assets."""
    if not chemin.startswith("assets/") or "\\" in chemin:
        return False
    base = (Path(dossier_site) / "assets").resolve()
    cible = (Path(dossier_site) / chemin).resolve()
    try:
        cible.relative_to(base)
    except ValueError:
        return False
    return (cible.is_file() or os.environ.get("SEPP_CLOUD_MODE") == "1") and cible.suffix.lower() in EXT_IMAGES


def ordre_categorie(srv, categorie):
    """Rang d'affichage d'une categorie (Téléviseur avant Climatiseur, etc.)."""
    site = srv["CATEGORIES"].get(srv["normaliser"](categorie))
    rang = CATEGORIES_ORDRE.index(site) if site in CATEGORIES_ORDRE else len(CATEGORIES_ORDRE)
    return (rang, srv["normaliser"](categorie))


def lire_classement(srv, cn, toutes=None, schema=None):
    """{ 'Téléviseur': ['Crystal LED', 'Qled', ...], ... } depuis la base.

    Source : la table sub_categories ; a defaut, les couples deja presents dans
    items ; a defaut (ancienne base avec la colonne « type »), la liste fixe
    TYPES_CONNUS regroupee par categorie du site.
    """
    toutes = toutes or srv["lister_tables"](cn)
    if schema is None:
        items = [t for t in toutes if srv["cle_identifiant"](t[1]) == "items"]
        schema = items[0][0] if items else None
    paires = []
    table = srv["chercher_table"](toutes, "sub_categories", schema, obligatoire=False)
    if table:
        cols = {srv["cle_identifiant"](c): c for c in toutes[table]}
        if "category" in cols and "subcategory" in cols:
            paires = [
                (r["c"], r["s"]) for r in cn.execute(
                    sql.SQL("SELECT {} AS c, {} AS s FROM {}").format(
                        sql.Identifier(cols["category"]), sql.Identifier(cols["subcategory"]),
                        sql.Identifier(*table),
                    )
                ).fetchall()
            ]
    if not paires:
        resultat = {}
        for libelle in TYPES_CONNUS:
            categorie = srv["CATEGORIES"].get(srv["normaliser"](libelle))
            if categorie:
                resultat.setdefault(categorie, []).append(libelle)
        return resultat, False
    resultat = {}
    for categorie, sous in sorted(paires, key=lambda p: (ordre_categorie(srv, p[0]),
                                                           srv["normaliser"](p[1]))):
        resultat.setdefault(categorie, []).append(sous)
    return resultat, True


def genre(type_sql):
    if type_sql in ("smallint", "integer", "bigint"):
        return "int"
    if type_sql in ("numeric", "double precision", "real"):
        return "num"
    return "text"


# ----------------------------------------------------------------------
# Preparation de la base : colonnes statut, created_at, updated_at
# ----------------------------------------------------------------------
def preparer_base(srv):
    """Ajoute (si absentes) les colonnes de gestion dans chaque table.

    Sans danger si elles existent deja : on peut l'appeler a chaque demarrage.
    Les lignes existantes recoivent le statut « actif » ; leur date de
    creation est celle du jour ou la colonne a ete ajoutee.
    """
    with srv["ouvrir_connexion"](srv["NOM_BASE"]) as cn:
        toutes = srv["lister_tables"](cn)
        items = [t for t in toutes if srv["cle_identifiant"](t[1]) == "items"]
        schema = items[0][0] if items else "public"

        # Fonction qui met updated_at a jour a chaque modification, meme
        # si la ligne est modifiee depuis pgAdmin.
        fonction = sql.Identifier(schema, "maj_updated_at")
        cn.execute(sql.SQL(
            "CREATE OR REPLACE FUNCTION {} () RETURNS trigger LANGUAGE plpgsql AS "
            "$$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$"
        ).format(fonction))

        prepares = []
        for cfg in TABLES:
            table = srv["chercher_table"](toutes, cfg["nom"], schema, obligatoire=False)
            if not table:
                continue
            cible = sql.Identifier(*table)
            cn.execute(sql.SQL(
                "ALTER TABLE {} ADD COLUMN IF NOT EXISTS statut text NOT NULL DEFAULT 'actif'"
            ).format(cible))
            cn.execute(sql.SQL(
                "ALTER TABLE {} ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()"
            ).format(cible))
            cn.execute(sql.SQL(
                "ALTER TABLE {} ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()"
            ).format(cible))
            try:
                with cn.transaction():
                    cn.execute(sql.SQL(
                        "ALTER TABLE {} ADD CONSTRAINT {} "
                        "CHECK (statut IN ('actif', 'inactif', 'supprimé'))"
                    ).format(cible, sql.Identifier(f"{table[1]}_statut_check")))
            except psycopg.errors.DuplicateObject:
                pass
            cn.execute(sql.SQL("DROP TRIGGER IF EXISTS maj_updated_at ON {}").format(cible))
            cn.execute(sql.SQL(
                "CREATE TRIGGER maj_updated_at BEFORE UPDATE ON {} "
                "FOR EACH ROW EXECUTE PROCEDURE {} ()"
            ).format(cible, fonction))
            prepares.append(table[1])
    print(f"Colonnes statut / created_at / updated_at prêtes : {', '.join(prepares)}", flush=True)
    return prepares


def installer(app, srv):
    """srv : globals() de server.py (les fonctions et variables du serveur)."""

    # ------------------------------------------------------------------
    # Protection : acces local uniquement + en-tete obligatoire pour l'API
    # (empeche qu'un autre site ouvert dans le navigateur ecrive dans la base).
    # ------------------------------------------------------------------
    secret=os.environ.get("SEPP_SECRET_KEY")
    if not secret:
        secret_path=Path.home()/".sepp-session-secret"
        if not secret_path.exists():
            try:
                with secret_path.open("x", encoding="ascii") as secret_file:
                    secret_file.write(secrets.token_hex(32))
            except FileExistsError:
                pass
        secret=secret_path.read_text(encoding="ascii").strip()
    app.secret_key = secret
    app.config.update(
        MAX_CONTENT_LENGTH=TAILLE_PHOTO_MAX + 512 * 1024,  # photo 5 Mo + en-tetes
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Strict",
        SESSION_COOKIE_SECURE=os.environ.get("SEPP_CLOUD_MODE") == "1",
        PERMANENT_SESSION_LIFETIME=timedelta(days=3650),
    )

    @app.before_request
    def proteger_admin():
        chemin = request.path
        if chemin == "/admin.html":
            return redirect("/admin")
        if chemin != "/admin" and not chemin.startswith("/admin/"):
            return None
        if ADMIN_LOCAL_SEULEMENT and request.remote_addr not in ("127.0.0.1", "::1"):
            abort(403)
        if not _acces["hash"]:
            return Response(
                "Administration désactivée : aucun mot de passe administrateur "
                "défini. Lancez le site avec « python server.py ».",
                status=503, mimetype="text/plain",
            )
        if chemin == "/admin/login":
            return None
        if not session.get("admin"):
            if chemin.startswith("/admin/api/"):
                return jsonify({"erreur": "Session expirée : reconnectez-vous."}), 401
            return redirect("/admin/login")
        if chemin.startswith("/admin/api/"):
            if request.headers.get("X-Admin") != "oui":
                abort(403)
            origine = request.headers.get("Origin")
            origines={request.host_url.rstrip("/")}
            if os.environ.get("SEPP_PUBLIC_ORIGIN"):
                origines.add(os.environ["SEPP_PUBLIC_ORIGIN"].rstrip("/"))
            if origine and origine not in origines:
                abort(403)
        return None

    @app.route("/admin/login", methods=["GET", "POST"])
    def login_admin():
        message = ""
        if request.method == "POST":
            ip = request.remote_addr
            maintenant = time.time()
            recents = [t for t in _echecs.get(ip, []) if maintenant - t < BLOCAGE_SECONDES]
            _echecs[ip] = recents
            if len(recents) >= TENTATIVES_MAX:
                message = "Trop de tentatives. Réessayez dans quelques minutes."
            else:
                identifiant = request.form.get("identifiant", "").strip()
                # Les deux verifications sont toujours faites (pas d'indice sur
                # lequel des deux est faux).
                id_ok = secrets.compare_digest(identifiant.encode(), _acces["id"].encode())
                mdp_ok = check_password_hash(_acces["hash"], request.form.get("mot_de_passe", ""))
                if id_ok and mdp_ok:
                    _echecs.pop(ip, None)
                    session.clear()
                    session.permanent = True
                    session["admin"] = True
                    return redirect("/admin")
                recents.append(maintenant)
                time.sleep(1)  # ralentit les essais au hasard
                print(f"[admin] Connexion refusée depuis {ip}", flush=True)
                message = "Identifiant ou mot de passe incorrect."
        return Response(PAGE_LOGIN.replace("{{message}}", message), mimetype="text/html")

    @app.get("/admin/logout")
    def logout_admin():
        session.clear()
        return redirect("/admin/login")

    @app.get("/admin/ui/<nom>")
    def fichier_interface_sessions(nom):
        if nom not in ("admin-sessions.css", "admin-sessions.js"):
            abort(404)
        return send_from_directory(srv["DOSSIER"], nom)

    @app.get("/admin")
    def page_admin():
        return send_from_directory(srv["DOSSIER"], "admin-sessions.html")

    # ------------------------------------------------------------------
    # Structure des tables
    # ------------------------------------------------------------------
    def structure(cn):
        toutes = srv["lister_tables"](cn)
        items = [t for t in toutes if srv["cle_identifiant"](t[1]) == "items"]
        schema = items[0][0] if items else None
        classement, depuis_base = lire_classement(srv, cn, toutes, schema)
        resultat = []
        for cfg in TABLES:
            table = srv["chercher_table"](toutes, cfg["nom"], schema, obligatoire=False)
            if not table:
                continue
            types = {
                r["column_name"]: r["data_type"]
                for r in cn.execute(
                    "SELECT column_name, data_type FROM information_schema.columns "
                    "WHERE table_schema = %s AND table_name = %s",
                    table,
                ).fetchall()
            }
            colonnes = list(toutes[table])
            if cfg["mode"] == "edit":
                colonnes = [c for c in colonnes if srv["cle_identifiant"](c) != "id"]

            def trouver(nom, colonnes=colonnes):
                for candidat in (nom, *ALIAS_COLONNES.get(nom, ())):
                    cible = srv["cle_identifiant"](candidat)
                    trouvee = next((c for c in colonnes if srv["cle_identifiant"](c) == cible), None)
                    if trouvee:
                        return trouvee
                return None

            systeme = [c for c in colonnes if srv["cle_identifiant"](c) in
                       [srv["cle_identifiant"](d) for d in COLONNES_DATES]]
            resultat.append({
                "cfg": cfg,
                "table": table,
                "colonnes": colonnes,
                "systeme": systeme,
                "ecriture": [c for c in colonnes if c not in systeme],
                "types": types,
                "trouver": trouver,
                "cle": trouver(cfg["cle"]) if cfg.get("cle") else None,
                "statut": trouver("statut"),
                "maj": trouver("updated_at"),
                "classement": classement,
                # Base migree : colonne sub_category + table sub_categories presentes.
                "migre": bool(depuis_base and trouver("sub_category")),
            })
        return resultat

    def une_table(cn, nom):
        for t in structure(cn):
            if t["cfg"]["nom"] == nom:
                return t
        raise ErreurAdmin(f"Table {nom!r} introuvable dans la base.")

    def etiquette(colonne):
        return ETIQUETTES.get(colonne) or colonne.replace("_", " ").capitalize()

    # ------------------------------------------------------------------
    # Conversion et validation
    # ------------------------------------------------------------------
    def convertir(valeur, g, nom_colonne):
        if valeur is None:
            return None
        texte = str(valeur).strip()
        if texte == "":
            return None
        if g == "int":
            propre = "".join(texte.split())
            if not re.fullmatch(r"-?\d+", propre):
                raise ErreurAdmin(
                    f"{etiquette(nom_colonne)} : nombre entier attendu (reçu « {texte} »)."
                )
            return int(propre)
        if g == "num":
            try:
                return Decimal("".join(texte.split()).replace(",", "."))
            except Exception:
                raise ErreurAdmin(
                    f"{etiquette(nom_colonne)} : nombre attendu (reçu « {texte} »)."
                )
        return texte

    def valider(t, valeurs):
        nom = t["cfg"]["nom"]
        for logique in t["cfg"]["obligatoires"]:
            col = t["trouver"](logique)
            if col and valeurs.get(col) is None:
                raise ErreurAdmin(f"« {etiquette(col)} » est obligatoire.")

        if t["statut"] and valeurs.get(t["statut"]) not in (None, *STATUTS):
            raise ErreurAdmin(
                f"Statut inconnu : « {valeurs[t['statut']]} ». "
                f"Valeurs acceptées : {', '.join(STATUTS)}."
            )

        if nom in ("items", "specs"):
            col_cat = t["trouver"]("category")
            col_sous = t["trouver"]("sub_category")
            categorie = valeurs.get(col_cat)
            if categorie is None or srv["normaliser"](categorie) not in srv["CATEGORIES"]:
                raise ErreurAdmin(
                    f"Catégorie inconnue : « {categorie} ». "
                    f"Catégories acceptées : {', '.join(t['classement'])}."
                )
            if col_sous and t["migre"]:
                sous = valeurs.get(col_sous)
                if nom == "items" and sous is None:
                    raise ErreurAdmin("« Sous-catégorie » est obligatoire.")
                if sous is not None and sous not in t["classement"].get(categorie, []):
                    raise ErreurAdmin(
                        f"La sous-catégorie « {sous} » n'appartient pas à la catégorie "
                        f"« {categorie} ». Choix possibles : "
                        f"{', '.join(t['classement'].get(categorie, [])) or '(aucun)'}."
                    )

        if nom == "items":
            reference = valeurs[t["cle"]]
            for logique in COLONNES_PRIX:
                col = t["trouver"](logique)
                if not col:
                    continue
                try:
                    srv["montant"]({"reference": reference, col: valeurs.get(col)}, col)
                except ValueError as erreur:
                    raise ErreurAdmin(f"{etiquette(col)} : {erreur}")
            photo = t["trouver"]("product_photos")
            if photo and valeurs.get(photo) is not None:
                if not photo_valide(srv["DOSSIER"], valeurs[photo]):
                    raise ErreurAdmin("Photo : choisissez une image du dossier assets.")

        if t["cfg"]["mode"] == "edit":
            for col in t["ecriture"]:
                if col == t["statut"]:
                    continue
                v = valeurs.get(col)
                if v is None or not 0 <= v <= 99:
                    raise ErreurAdmin(f"{etiquette(col)} : entier de 0 à 99 attendu.")

    def valeurs_depuis_json(t, brutes):
        if not isinstance(brutes, dict):
            raise ErreurAdmin("Requête invalide.")
        valeurs = {}
        for col in t["ecriture"]:
            valeurs[col] = convertir(brutes.get(col), genre(t["types"].get(col)), col)
        return valeurs

    def produit_de(cn, reference):
        """{category, sub_category, designation} du produit portant cette reference, sinon None."""
        p = une_table(cn, "items")
        col_sous = p["trouver"]("sub_category")
        ligne = cn.execute(
            sql.SQL("SELECT {} AS category, {} AS sub_category, {} AS designation FROM {} WHERE {} = %s").format(
                sql.Identifier(p["trouver"]("category")),
                sql.Identifier(col_sous) if col_sous else sql.SQL("NULL"),
                sql.Identifier(p["trouver"]("designation")),
                sql.Identifier(*p["table"]),
                sql.Identifier(p["cle"]),
            ),
            [reference],
        ).fetchone()
        return ligne

    def lier_produit(cn, t, valeurs):
        """Fiche technique : categorie, sous-categorie et designation viennent toujours du produit."""
        if t["cfg"]["nom"] != "specs":
            return
        produit = produit_de(cn, valeurs[t["cle"]])
        if not produit:
            raise ErreurAdmin(
                f"La référence « {valeurs[t['cle']]} » n'existe pas dans Produits. "
                "Créez d'abord le produit."
            )
        valeurs[t["trouver"]("category")] = produit["category"]
        if t["trouver"]("sub_category"):
            valeurs[t["trouver"]("sub_category")] = produit["sub_category"]
        valeurs[t["trouver"]("designation")] = produit["designation"]

    def propager_vers_fiches(cn, t, valeurs, reference):
        """Produit modifie : sa fiche technique reprend sa categorie, sa sous-categorie et sa designation."""
        if t["cfg"]["nom"] != "items":
            return
        try:
            s = une_table(cn, "specs")
        except ErreurAdmin:
            return
        affect = [sql.SQL("{} = %s").format(sql.Identifier(s["trouver"]("category"))),
                  sql.SQL("{} = %s").format(sql.Identifier(s["trouver"]("designation")))]
        params = [valeurs[t["trouver"]("category")], valeurs[t["trouver"]("designation")]]
        col_sous_fiche = s["trouver"]("sub_category")
        col_sous_produit = t["trouver"]("sub_category")
        if col_sous_fiche and col_sous_produit:
            affect.append(sql.SQL("{} = %s").format(sql.Identifier(col_sous_fiche)))
            params.append(valeurs[col_sous_produit])
        if s["maj"]:
            affect.append(sql.SQL("{} = now()").format(sql.Identifier(s["maj"])))
        cn.execute(
            sql.SQL("UPDATE {} SET {} WHERE {} = %s").format(
                sql.Identifier(*s["table"]), sql.SQL(", ").join(affect),
                sql.Identifier(s["cle"]),
            ),
            params + [reference],
        )

    def verifier_site():
        """Apres une ecriture : le site charge-t-il toujours ses donnees ?"""
        try:
            srv["charger_catalogue"]()
            return None
        except Exception as erreur:
            return f"{type(erreur).__name__} : {erreur}"

    def reponse_ok():
        return jsonify({"ok": True, "avertissement": verifier_site()})

    def ouvrir():
        return srv["ouvrir_connexion"](srv["NOM_BASE"])

    def affectations(t, colonnes, valeurs):
        """SET col = %s, ... (+ updated_at = now()) et les parametres."""
        morceaux = [sql.SQL("{} = %s").format(sql.Identifier(c)) for c in colonnes]
        if t["maj"]:
            morceaux.append(sql.SQL("{} = now()").format(sql.Identifier(t["maj"])))
        return sql.SQL(", ").join(morceaux), [valeurs[c] for c in colonnes]

    def insertion(cn, t, valeurs):
        colonnes = t["ecriture"]
        cn.execute(
            sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                sql.Identifier(*t["table"]),
                sql.SQL(", ").join(sql.Identifier(c) for c in colonnes),
                sql.SQL(", ").join(sql.Placeholder() for _ in colonnes),
            ),
            [valeurs[c] for c in colonnes],
        )

    @app.errorhandler(ErreurAdmin)
    def erreur_admin(erreur):
        if request.path.startswith("/admin/api/"):
            return jsonify({"erreur": str(erreur)}), 400
        raise erreur

    # ------------------------------------------------------------------
    # API
    # ------------------------------------------------------------------
    @app.get("/admin/api/schema")
    def api_schema():
        with ouvrir() as cn:
            tables = []
            for t in structure(cn):
                cfg = t["cfg"]
                if "liste" in cfg:
                    liste = [t["trouver"](n) for n in cfg["liste"]]
                else:  # table sans liste definie : toutes les colonnes de donnees
                    liste = [c for c in t["colonnes"]
                             if c not in t["systeme"] and c != t["statut"]]
                liste += [t["statut"]] + [t["trouver"](d) for d in COLONNES_DATES]
                liste = [c for c in liste if c]
                # Champs generes automatiquement : absents des formulaires.
                auto = t["cle"] if t["cle"] and genre(t["types"].get(t["cle"])) == "int" else None
                masques = {c for c in (t["statut"], auto) if c}
                tables.append({
                    "nom": cfg["nom"],
                    "titre": cfg["titre"],
                    "mode": cfg["mode"],
                    "aide": cfg["aide"],
                    "cle": t["cle"],
                    "statut": t["statut"],
                    "liste": liste or t["colonnes"],
                    "obligatoires": [t["trouver"](n) for n in cfg["obligatoires"] if t["trouver"](n)],
                    "colonnes": [
                        {
                            "nom": c,
                            "genre": genre(t["types"].get(c)),
                            "etiquette": etiquette(c),
                            "systeme": c in t["systeme"],
                            "masque": c in masques,
                        }
                        for c in t["colonnes"]
                    ],
                })
            structure_items = next((t for t in structure(cn) if t["cfg"]["nom"] == "items"), None)
        classement = structure_items["classement"] if structure_items else {}
        return jsonify({
            "tables": tables,
            "statuts": STATUTS,
            "migre": bool(structure_items and structure_items["migre"]),
            "sous_categories": classement,
            "categories_ordre": list(classement),
            "categories": srv["CATEGORIES"],
            "etiquettes_specs": srv["ETIQUETTES_SPECS"],
            "disponibilites": DISPONIBILITES,
        })

    @app.get("/admin/api/t/<nom>")
    def api_lire(nom):
        with ouvrir() as cn:
            t = une_table(cn, nom)
            requete = sql.SQL("SELECT * FROM {}").format(sql.Identifier(*t["table"]))
            if nom == "specs":
                col = t["cle"]
                requete += sql.SQL(" WHERE {0} IS NOT NULL AND btrim({0}) <> ''").format(
                    sql.Identifier(col)
                )
            tri = [t["trouver"](n) for n in t["cfg"].get("tri", [])]
            tri = [c for c in tri if c]
            if tri:
                requete += sql.SQL(" ORDER BY ") + sql.SQL(", ").join(
                    sql.Identifier(c) for c in tri
                )
            lignes = cn.execute(requete).fetchall()
            produits = {}
            if nom == "specs":
                # Categorie, sous-categorie et designation d'une fiche : celles du produit.
                p = une_table(cn, "items")
                c_cat, c_des = p["trouver"]("category"), p["trouver"]("designation")
                c_sous = p["trouver"]("sub_category")
                for r in cn.execute(sql.SQL("SELECT * FROM {}").format(
                        sql.Identifier(*p["table"]))).fetchall():
                    produits[r[p["cle"]]] = (r[c_cat], r[c_sous] if c_sous else None, r[c_des])

        def texte(v):
            return v.isoformat() if hasattr(v, "isoformat") else v

        resultat = []
        for ligne in lignes:
            ligne = dict(ligne)
            if nom == "specs" and ligne.get(t["cle"]) in produits:
                cat, sous, des = produits[ligne[t["cle"]]]
                ligne[t["trouver"]("category")] = cat
                if t["trouver"]("sub_category"):
                    ligne[t["trouver"]("sub_category")] = sous
                ligne[t["trouver"]("designation")] = des
            resultat.append({c: texte(ligne.get(c)) for c in t["colonnes"]})
        return jsonify({"lignes": resultat})

    @app.get("/admin/api/images")
    def api_images():
        return jsonify({"images": lister_images(srv["DOSSIER"])})

    @app.post("/admin/api/photo")
    def api_photo():
        """Recoit une photo choisie sur l'ordinateur et la copie dans assets/."""
        fichier = request.files.get("photo")
        if fichier is None or not fichier.filename:
            raise ErreurAdmin("Aucun fichier reçu.")
        octets = fichier.read(TAILLE_PHOTO_MAX + 1)
        nom=fichier.filename
        if os.environ.get("SEPP_CLOUD_MODE") == "1":
            original=Path(nom)
            nom=original.stem+"-"+secrets.token_hex(8)+original.suffix
        chemin = copier_photo(srv["DOSSIER"], nom, octets)
        if os.environ.get("SEPP_CLOUD_MODE") == "1":
            mime={"png":"image/png","jpg":"image/jpeg","webp":"image/webp"}[type_image(octets)]
            with ouvrir() as cn:
                cn.execute('INSERT INTO public.photos_session (chemin,contenu,mime) VALUES (%s,%s,%s)',(chemin,octets,mime))
        print(f"[admin] Photo copiée : {chemin}", flush=True)
        return jsonify({"chemin": chemin})

    @app.errorhandler(RequestEntityTooLarge)
    def trop_gros(erreur):
        if request.path.startswith("/admin/api/"):
            return jsonify({"erreur": "Photo : 5 Mo maximum."}), 413
        return erreur

    @app.post("/admin/api/t/<nom>")
    def api_creer(nom):
        corps = request.get_json(silent=True) or {}
        with ouvrir() as cn:
            t = une_table(cn, nom)
            if t["cfg"]["mode"] != "crud":
                raise ErreurAdmin("Cette table ne permet pas d'ajouter de ligne.")
            valeurs = valeurs_depuis_json(t, corps.get("valeurs"))
            if t["statut"] and valeurs.get(t["statut"]) is None:
                valeurs[t["statut"]] = STATUT_DEFAUT
            cle = t["cle"]
            if valeurs.get(cle) is None and t["types"].get(cle) in ("smallint", "integer", "bigint"):
                maxi = cn.execute(
                    sql.SQL("SELECT COALESCE(MAX({}), 0) AS m FROM {}").format(
                        sql.Identifier(cle), sql.Identifier(*t["table"])
                    )
                ).fetchone()["m"]
                valeurs[cle] = maxi + 1
            if valeurs.get(cle) is None:
                raise ErreurAdmin(f"« {etiquette(cle)} » est obligatoire.")
            lier_produit(cn, t, valeurs)
            valider(t, valeurs)
            existe = cn.execute(
                sql.SQL("SELECT * FROM {} WHERE {} = %s").format(
                    sql.Identifier(*t["table"]), sql.Identifier(cle)
                ),
                [valeurs[cle]],
            ).fetchone()
            if existe:
                statut = existe.get(t["statut"]) if t["statut"] else None
                detail = ""
                if statut and statut != STATUT_DEFAUT:
                    detail = (f" (statut : {statut}). Retrouvez-la avec le filtre de statut "
                              "et remettez-la à « actif »")
                raise ErreurAdmin(f"« {valeurs[cle]} » existe déjà dans cette table{detail}.")
            insertion(cn, t, valeurs)
        return reponse_ok()

    @app.put("/admin/api/t/<nom>")
    def api_modifier(nom):
        corps = request.get_json(silent=True) or {}
        with ouvrir() as cn:
            t = une_table(cn, nom)
            valeurs = valeurs_depuis_json(t, corps.get("valeurs"))
            # Un statut non renseigne ne change pas le statut existant.
            ignorees = {t["statut"]} if t["statut"] and valeurs.get(t["statut"]) is None else set()
            if t["cfg"]["mode"] == "edit":
                valider(t, valeurs)
                colonnes = [c for c in t["ecriture"] if c not in ignorees]
                modifs, params = affectations(t, colonnes, valeurs)
                curseur = cn.execute(
                    sql.SQL("UPDATE {} SET {}").format(sql.Identifier(*t["table"]), modifs),
                    params,
                )
                if curseur.rowcount == 0:
                    if t["statut"] and valeurs.get(t["statut"]) is None:
                        valeurs[t["statut"]] = STATUT_DEFAUT
                    insertion(cn, t, valeurs)
                elif curseur.rowcount > 1:
                    raise ErreurAdmin("La table contient plusieurs lignes : modification annulée.")
            else:
                cle = t["cle"]
                ancienne = convertir(corps.get("cle"), genre(t["types"].get(cle)), cle)
                if ancienne is None:
                    raise ErreurAdmin("Ligne à modifier introuvable.")
                valeurs[cle] = ancienne  # la clé ne change pas
                lier_produit(cn, t, valeurs)
                valider(t, valeurs)
                colonnes = [c for c in t["ecriture"] if c != cle and c not in ignorees]
                modifs, params = affectations(t, colonnes, valeurs)
                curseur = cn.execute(
                    sql.SQL("UPDATE {} SET {} WHERE {} = %s").format(
                        sql.Identifier(*t["table"]), modifs, sql.Identifier(cle)
                    ),
                    params + [ancienne],
                )
                if curseur.rowcount != 1:
                    raise ErreurAdmin(
                        f"{curseur.rowcount} ligne(s) correspondent à « {ancienne} » : "
                        "modification annulée."
                    )
                propager_vers_fiches(cn, t, valeurs, ancienne)
        return reponse_ok()

    @app.post("/admin/api/t/<nom>/statut")
    def api_statut(nom):
        """Active, desactive ou restaure une ligne (change seulement le statut)."""
        corps = request.get_json(silent=True) or {}
        nouveau = corps.get("statut")
        if nouveau not in STATUTS:
            raise ErreurAdmin(f"Statut inconnu. Valeurs acceptées : {', '.join(STATUTS)}.")
        with ouvrir() as cn:
            t = une_table(cn, nom)
            if not t["statut"]:
                raise ErreurAdmin("La colonne « statut » est absente : redémarrez le serveur.")
            modifs, params = affectations(t, [t["statut"]], {t["statut"]: nouveau})
            if t["cfg"]["mode"] == "edit":
                curseur = cn.execute(
                    sql.SQL("UPDATE {} SET {}").format(sql.Identifier(*t["table"]), modifs),
                    params,
                )
                if curseur.rowcount < 1:
                    raise ErreurAdmin("Aucune ligne à modifier.")
            else:
                cle = t["cle"]
                valeur = convertir(corps.get("cle"), genre(t["types"].get(cle)), cle)
                if valeur is None:
                    raise ErreurAdmin("Ligne introuvable.")
                curseur = cn.execute(
                    sql.SQL("UPDATE {} SET {} WHERE {} = %s").format(
                        sql.Identifier(*t["table"]), modifs, sql.Identifier(cle)
                    ),
                    params + [valeur],
                )
                if curseur.rowcount != 1:
                    raise ErreurAdmin(
                        f"{curseur.rowcount} ligne(s) correspondent à « {valeur} » : "
                        "changement annulé."
                    )
        return reponse_ok()

    @app.delete("/admin/api/t/<nom>")
    def api_supprimer(nom):
        """Suppression « douce » : la ligne passe au statut « supprimé »
        (masquée du site) mais reste dans la base de données."""
        corps = request.get_json(silent=True) or {}
        with ouvrir() as cn:
            t = une_table(cn, nom)
            if t["cfg"]["mode"] != "crud":
                raise ErreurAdmin("Cette table ne permet pas de supprimer de ligne.")
            if not t["statut"]:
                raise ErreurAdmin("La colonne « statut » est absente : redémarrez le serveur.")
            cle = t["cle"]
            valeur = convertir(corps.get("cle"), genre(t["types"].get(cle)), cle)
            if valeur is None:
                raise ErreurAdmin("Ligne à supprimer introuvable.")
            modifs, params = affectations(t, [t["statut"]], {t["statut"]: STATUT_SUPPRIME})
            curseur = cn.execute(
                sql.SQL("UPDATE {} SET {} WHERE {} = %s").format(
                    sql.Identifier(*t["table"]), modifs, sql.Identifier(cle)
                ),
                params + [valeur],
            )
            if curseur.rowcount != 1:
                raise ErreurAdmin(
                    f"{curseur.rowcount} ligne(s) correspondent à « {valeur} » : "
                    "suppression annulée."
                )
        return reponse_ok()
