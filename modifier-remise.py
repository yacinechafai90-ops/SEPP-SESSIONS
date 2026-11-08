"""Modifier les taux de remise (table discount de PostgreSQL)."""
import re
from decimal import Decimal
from getpass import getpass

from psycopg import sql

import server


def lire_taux(texte, mois, entier):
    texte = "".join(texte.replace("%", "").split()).replace(",", ".")
    try:
        taux = Decimal(texte)
    except Exception:
        raise ValueError(f"« {texte} » n'est pas un nombre.")
    if not taux.is_finite() or taux < 0 or taux >= 100:
        raise ValueError("Le taux doit etre compris entre 0 et 99.")
    if entier and taux != taux.to_integral_value():
        raise ValueError(
            f"La colonne de {mois} mois n'accepte que des nombres entiers "
            "(par exemple 5, pas 5,5)."
        )
    return int(taux) if entier else taux


def main():
    server.MOT_DE_PASSE = getpass("Mot de passe PostgreSQL : ")
    server.NOM_BASE = server.trouver_base()
    print(f"Base utilisee : {server.NOM_BASE!r}")

    with server.ouvrir_connexion(server.NOM_BASE) as connexion:
        tables = server.lister_tables(connexion)
        items = [t for t in tables if server.cle_identifiant(t[1]) == "items"]
        table = server.chercher_table(
            tables, server.TABLE_REMISES, items[0][0] if items else None
        )

        colonnes = {}
        for colonne in tables[table]:
            m = re.match(r"\D*(\d+)", colonne)
            if m:
                colonnes[m.group(1)] = colonne
        for mois in ("6", "12", "18"):
            if mois not in colonnes:
                raise ValueError(f"Colonne de {mois} mois introuvable dans {table!r}.")

        types = {
            ligne["column_name"]: ligne["data_type"]
            for ligne in connexion.execute(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_schema = %s AND table_name = %s",
                table,
            ).fetchall()
        }

        lignes = server.lire_table(connexion, table)
        if len(lignes) != 1:
            raise ValueError(
                f"La table {table[1]!r} doit contenir une seule ligne "
                f"(elle en contient {len(lignes)})."
            )
        actuel = lignes[0]

        print("\nRemises actuelles (en %) :")
        for mois in ("6", "12", "18"):
            print(f"  {mois} mois : {actuel[colonnes[mois]]}")
        print("\nTapez le nouveau taux, ou appuyez sur Entree pour ne pas le changer.")

        nouveaux = {}
        for mois in ("6", "12", "18"):
            colonne = colonnes[mois]
            entier = types.get(colonne) in ("smallint", "integer", "bigint")
            while True:
                reponse = input(f"  Remise {mois} mois (actuellement {actuel[colonne]}) : ").strip()
                if not reponse:
                    break
                try:
                    nouveaux[colonne] = lire_taux(reponse, mois, entier)
                    break
                except ValueError as erreur:
                    print(f"    {erreur}")

        if not nouveaux:
            print("Aucun changement.")
            return

        modifs = sql.SQL(", ").join(
            sql.SQL("{} = %s").format(sql.Identifier(c)) for c in nouveaux
        )
        connexion.execute(
            sql.SQL("UPDATE {} SET {}").format(sql.Identifier(*table), modifs),
            list(nouveaux.values()),
        )
        connexion.commit()

        apres = server.lire_table(connexion, table)[0]
        print("\nRemises enregistrees dans PostgreSQL :")
        for mois in ("6", "12", "18"):
            print(f"  {mois} mois : {apres[colonnes[mois]]} %")
        print("\nRechargez le site (Ctrl + F5) pour voir le changement.")


if __name__ == "__main__":
    try:
        main()
    except Exception as erreur:
        print(f"\nErreur : {type(erreur).__name__} : {erreur}")
    input("\nAppuyez sur Entree pour fermer.")