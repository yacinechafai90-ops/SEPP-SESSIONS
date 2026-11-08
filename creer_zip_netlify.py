"""Cree SEPP-CRUD.zip : la version PUBLIQUE du catalogue, a deposer sur Netlify.

Le zip contient le site tel qu'il est AUJOURD'HUI dans PostgreSQL (produits,
prix, magasins, fiches techniques, remises). Il ne contient PAS l'administration
(/admin), ni le mot de passe administrateur, ni le code Python : Netlify
n'heberge que des fichiers statiques.

A relancer apres chaque modification faite dans le CRUD, puis a redeposer sur Netlify.

Utilisation : double-cliquez sur CREER-ZIP-NETLIFY.cmd (ou : python creer_zip_netlify.py).
"""
import json
import re
import shutil
import sys
import zipfile
from getpass import getpass
from pathlib import Path

NOM_ZIP = "SEPP-CRUD.zip"
DOSSIER = Path(__file__).resolve().parent

# Fichiers racine toujours inclus s'ils existent (en plus de ceux cites par index.html).
FICHIERS_FIXES = ["index.html", "favicon.png", "_headers", "_redirects"]


def texte_data_js(catalogue):
    """Meme contenu que la route /data.js du serveur."""
    return (
        "window.CATALOGUE = "
        + json.dumps(catalogue, ensure_ascii=True, allow_nan=False)
        + ";\nwindow.PRODUCT_SPECS = window.CATALOGUE.specs;"
    )


def fichiers_du_site(dossier):
    """Liste (chemin_dans_le_zip, chemin_sur_disque) des fichiers a publier."""
    html = (dossier / "index.html").read_text(encoding="utf-8")
    cites = set(FICHIERS_FIXES)
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
        elif nom != "favicon.png":
            print(f"  Attention : fichier cite par index.html introuvable : {nom}")
    assets = dossier / "assets"
    for chemin in sorted(assets.rglob("*")):
        if chemin.is_file() and not any(p.startswith(".") for p in chemin.relative_to(assets).parts):
            resultat.append((chemin.relative_to(dossier).as_posix(), chemin))
    return resultat


def construire_zip(dossier, catalogue, destination):
    fichiers = fichiers_du_site(dossier)
    destination = Path(destination)
    temporaire = destination.with_suffix(".tmp")
    with zipfile.ZipFile(temporaire, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        z.writestr("data.js", texte_data_js(catalogue).encode("utf-8"))
        for nom_zip, chemin in fichiers:
            z.write(chemin, nom_zip)
    temporaire.replace(destination)
    return len(fichiers) + 1


def bureau(dossier):
    """Le Bureau (Desktop) de l'utilisateur."""
    for parent in [dossier, *dossier.parents]:
        if parent.name.lower() == "desktop" and parent.is_dir():
            return parent
    candidat = Path.home() / "Desktop"
    return candidat if candidat.is_dir() else None


def main():
    sys.path.insert(0, str(DOSSIER))
    import server

    server.MOT_DE_PASSE = getpass("Mot de passe PostgreSQL : ")
    server.NOM_BASE = server.trouver_base()
    print("Lecture de la base de donnees...")
    catalogue = server.charger_catalogue()
    print(f"  {len(catalogue['products'])} produits, {len(catalogue['shops'])} magasins, "
          f"{len(catalogue['specs'])} fiches techniques, remises {catalogue['discount']}")

    cible = DOSSIER / NOM_ZIP
    n = construire_zip(DOSSIER, catalogue, cible)
    taille = cible.stat().st_size / 1024 / 1024
    print(f"\n{NOM_ZIP} cree : {n} fichiers, {taille:.1f} Mo")

    sur_bureau = bureau(DOSSIER)
    if sur_bureau:
        shutil.copy2(cible, sur_bureau / NOM_ZIP)
        print(f"Copie placee sur le Bureau : {sur_bureau / NOM_ZIP}")
    else:
        print("Bureau introuvable : copiez le zip a la main.")

    print("\nPour publier : decompressez le zip si Netlify le demande, puis glissez le "
          "dossier (ou le zip) sur https://app.netlify.com/drop")


if __name__ == "__main__":
    try:
        main()
    except Exception as erreur:
        print(f"\nErreur : {type(erreur).__name__} : {erreur}")
    input("\nAppuyez sur Entree pour fermer.")
