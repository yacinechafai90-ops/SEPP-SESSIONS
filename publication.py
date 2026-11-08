"""Publication du site public sur Vercel, depuis la page d'administration.

Le bouton « Publier le site » :
  1. lit la base PostgreSQL (produits, prix, magasins, fiches, remises ; seules les
     lignes « actif » sont publiees) ;
  2. construit la version publique du site (SANS /admin, SANS mot de passe, SANS code Python) ;
  3. l'envoie a Vercel (API officielle) qui la met en ligne en production.

La cle d'acces Vercel est gardee dans publication-acces.json, sur CET ordinateur
uniquement (jamais renvoyee au navigateur, jamais publiee).
"""
import hashlib
import json
import re
import threading
import time
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from flask import jsonify, request

API = "https://api.vercel.com"
FICHIER_ACCES = "publication-acces.json"
FICHIER_ETAT = "publication-etat.json"
PROJET_PAR_DEFAUT = "sepp-crud"
FICHIERS_RACINE = ["index.html", "favicon.png"]
DELAI_DEPLOIEMENT = 300  # secondes d'attente maximum de la mise en ligne

VERCEL_JSON = json.dumps({
    "headers": [{
        "source": "/(.*)",
        "headers": [
            {"key": "X-Content-Type-Options", "value": "nosniff"},
            {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
            {"key": "X-Frame-Options", "value": "SAMEORIGIN"},
        ],
    }],
}, indent=2)


class ErreurPublication(Exception):
    pass


# ----------------------------------------------------------------------
# Construction de la version publique
# ----------------------------------------------------------------------
def texte_data_js(catalogue):
    """Meme contenu que la route /data.js du serveur."""
    return (
        "window.CATALOGUE = "
        + json.dumps(catalogue, ensure_ascii=True, allow_nan=False)
        + ";\nwindow.PRODUCT_SPECS = window.CATALOGUE.specs;"
    )


def fichiers_du_site(dossier):
    """[(chemin_dans_le_site, chemin_sur_disque)] : uniquement ce qui est public."""
    dossier = Path(dossier)
    html = (dossier / "index.html").read_text(encoding="utf-8")
    cites = set(FICHIERS_RACINE)
    for valeur in re.findall(r'(?:src|href)="([^"#]+)"', html):
        valeur = valeur.split("?")[0]
        if not re.match(r"^(https?:)?//", valeur) and not valeur.startswith("/"):
            cites.add(valeur)
    cites.discard("data.js")  # remplace par la version issue de PostgreSQL
    resultat = []
    for nom in sorted(cites):
        chemin = dossier / nom
        if chemin.is_file():
            resultat.append((nom, chemin))
    assets = dossier / "assets"
    if assets.is_dir():
        for chemin in sorted(assets.rglob("*")):
            relatif = chemin.relative_to(assets)
            if chemin.is_file() and not any(p.startswith(".") for p in relatif.parts):
                resultat.append((chemin.relative_to(dossier).as_posix(), chemin))
    return resultat


def empreinte_donnees(catalogue):
    return hashlib.sha1(texte_data_js(catalogue).encode("utf-8")).hexdigest()


# ----------------------------------------------------------------------
# Appels a l'API Vercel
# ----------------------------------------------------------------------
def appeler(token, methode, chemin, corps=None, donnees=None, entetes=None, team=None, timeout=60):
    url = API + chemin
    if team:
        # « team_xxx » = identifiant ; sinon c'est le nom (slug) de l'equipe dans l'adresse Vercel.
        cle = "teamId" if team.startswith("team_") else "slug"
        url += ("&" if "?" in chemin else "?") + cle + "=" + quote(team)
    en_tetes = {"Authorization": "Bearer " + token}
    if corps is not None:
        donnees = json.dumps(corps).encode("utf-8")
        en_tetes["Content-Type"] = "application/json"
    if entetes:
        en_tetes.update(entetes)
    requete = Request(url, data=donnees, method=methode, headers=en_tetes)
    try:
        with urlopen(requete, timeout=timeout) as reponse:
            brut = reponse.read()
            statut = reponse.status
    except HTTPError as erreur:
        brut = erreur.read()
        statut = erreur.code
    except (URLError, TimeoutError, OSError) as erreur:
        raise ErreurPublication(f"Connexion à Vercel impossible : {erreur}")
    try:
        return statut, (json.loads(brut) if brut else {})
    except ValueError:
        return statut, {}


def message_erreur(statut, reponse):
    erreur = reponse.get("error") if isinstance(reponse, dict) else None
    texte = (erreur or {}).get("message") if isinstance(erreur, dict) else None
    return f"{texte or 'erreur'} (code {statut})"


def verifier_acces(token, projet, team):
    statut, reponse = appeler(token, "GET", "/v9/projects/" + quote(projet), team=team)
    if statut == 200:
        return
    if statut in (401, 403):
        raise ErreurPublication("Clé Vercel refusée. Vérifiez qu'elle est complète et qu'elle n'a pas expiré.")
    if statut == 404:
        raise ErreurPublication(f"Projet « {projet} » introuvable. Vérifiez le nom exact du projet "
                                "(et l'équipe, si le projet appartient à une équipe).")
    raise ErreurPublication("Vercel a refusé la vérification : " + message_erreur(statut, reponse))


def deployer(acces, fichiers, progression):
    """fichiers : [{file, sha, size, octets}]. Retourne l'adresse du site publie."""
    token, projet, team = acces["token"], acces["projet"], acces.get("team") or None
    par_sha = {f["sha"]: f for f in fichiers}
    declaration = [{"file": f["file"], "sha": f["sha"], "size": f["size"]} for f in fichiers]
    corps = {
        "name": projet, "project": projet, "target": "production",
        "files": declaration, "projectSettings": {"framework": None},
    }
    deja_envoyes = set()
    for tentative in range(4):
        progression("Création de la version en ligne…", 35 + 5 * tentative)
        statut, reponse = appeler(token, "POST", "/v13/deployments?forceNew=1", corps=corps,
                                  team=team, timeout=120)
        if statut == 200:
            break
        erreur = reponse.get("error", {}) if isinstance(reponse, dict) else {}
        if erreur.get("code") == "missing_files":
            manquants = [m for m in (erreur.get("missing") or []) if isinstance(m, str)]
            if not manquants:  # reponse inattendue : on envoie tout
                manquants = [s for s in par_sha if s not in deja_envoyes]
            for i, sha in enumerate(manquants, 1):
                f = par_sha.get(sha)
                if not f:
                    continue
                progression(f"Envoi des fichiers ({i}/{len(manquants)})…",
                            40 + int(40 * i / len(manquants)))
                st, rep = appeler(token, "POST", "/v2/files", donnees=f["octets"], team=team, timeout=300,
                                  entetes={"Content-Type": "application/octet-stream",
                                           "x-vercel-digest": sha, "Content-Length": str(f["size"])})
                if st != 200:
                    raise ErreurPublication(f"Envoi de {f['file']} refusé : " + message_erreur(st, rep))
                deja_envoyes.add(sha)
            continue
        if statut in (401, 403):
            raise ErreurPublication("Clé Vercel refusée ou expirée : cliquez sur « Publier le site », "
                                    "puis « Changer la clé », et collez une nouvelle clé.")
        raise ErreurPublication("Vercel a refusé la publication : " + message_erreur(statut, reponse))
    else:
        raise ErreurPublication("Vercel réclame encore des fichiers après plusieurs essais.")

    identifiant = reponse.get("id")
    if not identifiant:
        raise ErreurPublication("Réponse inattendue de Vercel (pas d'identifiant de déploiement).")
    debut = time.time()
    while True:
        etat = reponse.get("readyState")
        if etat == "READY":
            break
        if etat in ("ERROR", "CANCELED"):
            raise ErreurPublication("La mise en ligne a échoué sur Vercel : "
                                    + str(reponse.get("errorMessage") or etat))
        if time.time() - debut > DELAI_DEPLOIEMENT:
            raise ErreurPublication("Vercel met trop de temps à publier. Réessayez dans quelques minutes.")
        progression("Mise en ligne en cours sur Vercel…", 85)
        time.sleep(2)
        statut, reponse = appeler(token, "GET", "/v13/deployments/" + quote(identifiant), team=team)
        if statut != 200:
            raise ErreurPublication("Suivi de la publication impossible : " + message_erreur(statut, reponse))
    adresses = [a for a in (reponse.get("alias") or []) if isinstance(a, str)]
    adresse = adresses[0] if adresses else reponse.get("url", "")
    return ("https://" + adresse) if adresse and not adresse.startswith("http") else adresse


# ----------------------------------------------------------------------
# Routes de l'administration
# ----------------------------------------------------------------------
def installer(app, srv):
    dossier = Path(srv["DOSSIER"])
    verrou = threading.Lock()
    travail = {"etat": "repos", "message": "", "pourcent": 0, "url": "", "erreur": ""}

    def lire_json(nom):
        try:
            return json.loads((Path(srv["DOSSIER"]) / nom).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def ecrire_json(nom, donnees):
        (Path(srv["DOSSIER"]) / nom).write_text(json.dumps(donnees, ensure_ascii=False, indent=1),
                                                encoding="utf-8")

    def progression(message, pourcent):
        with verrou:
            travail.update(message=message, pourcent=pourcent)

    def tache():
        try:
            acces = lire_json(FICHIER_ACCES)
            if not acces.get("token"):
                raise ErreurPublication("Aucune clé Vercel enregistrée.")
            progression("Lecture de la base de données…", 5)
            catalogue = srv["charger_catalogue"]()
            data_js = texte_data_js(catalogue).encode("utf-8")
            progression("Préparation des fichiers…", 15)
            fichiers = [("data.js", data_js), ("vercel.json", VERCEL_JSON.encode("utf-8"))]
            liste = []
            for nom, octets in fichiers:
                liste.append({"file": nom, "octets": octets})
            for nom, chemin in fichiers_du_site(srv["DOSSIER"]):
                liste.append({"file": nom, "octets": chemin.read_bytes()})
            for f in liste:
                f["sha"] = hashlib.sha1(f["octets"]).hexdigest()
                f["size"] = len(f["octets"])
            adresse = deployer(acces, liste, progression)
            ecrire_json(FICHIER_ETAT, {
                "date": datetime.now().isoformat(timespec="seconds"),
                "url": adresse, "empreinte": empreinte_donnees(catalogue),
                "produits": len(catalogue["products"]),
            })
            with verrou:
                travail.update(etat="ok", message="Site publié.", pourcent=100, url=adresse, erreur="")
            print(f"[admin] Site publié sur Vercel : {adresse}", flush=True)
        except ErreurPublication as erreur:
            with verrou:
                travail.update(etat="erreur", erreur=str(erreur), message="")
            print(f"[admin] Publication échouée : {erreur}", flush=True)
        except Exception as erreur:  # erreur imprevue : jamais de blocage silencieux
            with verrou:
                travail.update(etat="erreur", erreur=f"{type(erreur).__name__} : {erreur}", message="")
            print(f"[admin] Publication échouée : {type(erreur).__name__} : {erreur}", flush=True)

    @app.get("/admin/api/publication")
    def pub_statut():
        acces = lire_json(FICHIER_ACCES)
        derniere = lire_json(FICHIER_ETAT)
        a_publier, souci = None, ""
        if acces.get("token"):
            try:
                a_publier = empreinte_donnees(srv["charger_catalogue"]()) != derniere.get("empreinte")
            except Exception as erreur:
                souci = f"{type(erreur).__name__} : {erreur}"
        with verrou:
            en_cours = travail["etat"] == "en_cours"
        return jsonify({
            "configure": bool(acces.get("token")),
            "projet": acces.get("projet") or PROJET_PAR_DEFAUT,
            "equipe": acces.get("team") or "",
            "derniere": {"date": derniere.get("date"), "url": derniere.get("url")} if derniere else None,
            "a_publier": a_publier, "probleme": souci, "en_cours": en_cours,
        })

    @app.post("/admin/api/publication/config")
    def pub_config():
        corps = request.get_json(silent=True) or {}
        token = str(corps.get("token") or "").strip()
        projet = str(corps.get("projet") or "").strip()
        team = str(corps.get("team") or "").strip()
        ancien = lire_json(FICHIER_ACCES)
        token = token or ancien.get("token", "")   # champ laisse vide : on garde la cle actuelle
        if not token:
            raise srv["admin"].ErreurAdmin("Collez votre clé d'accès Vercel.")
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,100}", projet):
            raise srv["admin"].ErreurAdmin("Nom de projet invalide (lettres, chiffres, . _ -).")
        if team and not re.fullmatch(r"[A-Za-z0-9._-]{1,100}", team):
            raise srv["admin"].ErreurAdmin("Identifiant d'équipe invalide.")
        try:
            verifier_acces(token, projet, team or None)
        except ErreurPublication as erreur:
            raise srv["admin"].ErreurAdmin(str(erreur))
        ecrire_json(FICHIER_ACCES, {"token": token, "projet": projet, "team": team})
        return jsonify({"ok": True})

    @app.post("/admin/api/publication/lancer")
    def pub_lancer():
        if not lire_json(FICHIER_ACCES).get("token"):
            raise srv["admin"].ErreurAdmin("Enregistrez d'abord votre clé Vercel.")
        with verrou:
            if travail["etat"] == "en_cours":
                raise srv["admin"].ErreurAdmin("Une publication est déjà en cours.")
            travail.update(etat="en_cours", message="Démarrage…", pourcent=1, url="", erreur="")
        threading.Thread(target=tache, daemon=True).start()
        return jsonify({"ok": True})

    @app.get("/admin/api/publication/progression")
    def pub_progression():
        with verrou:
            return jsonify(dict(travail))
