from getpass import getpass
from werkzeug.security import generate_password_hash
from psycopg import sql
import server
import acces_utilisateurs
import session_templates

server.MOT_DE_PASSE = getpass('Mot de passe PostgreSQL : ')
server.NOM_BASE = server.trouver_base()
acces_utilisateurs.preparer_base(vars(server))
identifiant = input('Identifiant du nouvel utilisateur : ').strip()
if not identifiant:
    raise SystemExit('Identifiant obligatoire.')
mot_de_passe = getpass('Mot de passe du nouvel utilisateur : ')
confirmation = getpass('Confirmer ce mot de passe : ')
if len(mot_de_passe) < 12 or mot_de_passe != confirmation:
    raise SystemExit('Mot de passe invalide ou confirmation differente (12 caracteres minimum).')
references = [r.strip() for r in input('References visibles, separees par une virgule : ').split(',') if r.strip()]
if not references:
    raise SystemExit('Au moins une reference est necessaire.')
with server.ouvrir_connexion(server.NOM_BASE) as cn:
    table, colonnes = server.trouver_table(cn)[0]
    query = sql.SQL('SELECT {} AS reference FROM {}').format(sql.Identifier(colonnes['reference']),sql.Identifier(*table))
    existantes = {str(row['reference']).strip() for row in cn.execute(query).fetchall()}
    inconnues = sorted(set(references)-existantes)
    if inconnues:
        raise SystemExit('References inconnues : '+', '.join(inconnues))
    row = cn.execute('INSERT INTO public.utilisateurs_catalogue (identifiant,mot_de_passe_hash) VALUES (%s,%s) RETURNING id',(identifiant,generate_password_hash(mot_de_passe))).fetchone()
    for reference in set(references):
        cn.execute('INSERT INTO public.offres_utilisateur (utilisateur_id,reference) VALUES (%s,%s)',(row['id'],reference))
    catalogue = server.charger_catalogue()
    session_templates.initialize(cn, row['id'], {p['reference'] for p in catalogue['products']}, {b['id'] for b in catalogue['shops']})
print(f'Compte {identifiant} cree avec {len(set(references))} produits.')