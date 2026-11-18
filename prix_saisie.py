"""Saisie des prix au format « 174 000,00 » (espaces entre les groupes de milliers, centimes ,00)."""
import re
from decimal import Decimal

FORMAT_PRIX = "174 000,00"
_ESPACES = re.compile(r"[\s\u00a0\u202f]")


def formater_prix(valeur):
    """Renvoie le prix au format « 174 000,00 », None si vide. Lève ValueError sinon."""
    if valeur is None:
        return None
    if isinstance(valeur, (int, float, Decimal)) and not isinstance(valeur, bool):
        texte = f"{Decimal(str(valeur)):.2f}"
    else:
        texte = str(valeur).strip()
    if texte == "":
        return None
    texte = re.sub(r"(?i)\s*(?:DA|DZD)\.?$", "", texte)
    texte = _ESPACES.sub("", texte)
    correspondance = re.fullmatch(r"(\d{1,12})(?:[,.](\d{1,2}))?", texte)
    if not correspondance:
        raise ValueError(f"format attendu : {FORMAT_PRIX} (reçu « {valeur} »)")
    entier = correspondance.group(1).lstrip("0") or "0"
    centimes = correspondance.group(2) or "00"
    if centimes != "00":
        raise ValueError(f"les centimes doivent être ,00 (format attendu : {FORMAT_PRIX})")
    groupes = []
    while entier:
        groupes.insert(0, entier[-3:])
        entier = entier[:-3]
    return " ".join(groupes) + ",00"
