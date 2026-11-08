import json,time,importlib,threading,webbrowser
from getpass import getpass
from pathlib import Path
import server
from psycopg import sql
root=Path(__file__).resolve().parent
password=getpass('Mot de passe PostgreSQL : ')
server.MOT_DE_PASSE=password
server.NOM_BASE='Trial Database'
rows={}
with server.ouvrir_connexion(server.NOM_BASE) as cn:
    cn.execute('SET TRANSACTION READ ONLY')
    for table in ('items','brandshops','specs','database_catalogue','discount'):
        rows[table]=cn.execute(sql.SQL('SELECT * FROM {}').format(sql.Identifier('public',table))).fetchall()
(root/'tables-inspection.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2,default=str),encoding='utf-8')
print('Tables inspectees. Correction en cours ; gardez cette fenetre ouverte.',flush=True)
marker=root/'integration-prete.signal'
while not marker.exists(): time.sleep(1)
marker.unlink()
try:
    server=importlib.reload(server)
    server.MOT_DE_PASSE=password
    server.NOM_BASE='Trial Database'
    catalogue=server.charger_catalogue()
    print(f"Connexion validee : {len(catalogue['products'])} produits, {len(catalogue['shops'])} magasins.",flush=True)
    threading.Timer(2,lambda:webbrowser.open('http://127.0.0.1:5002/')).start()
    server.app.run(host='127.0.0.1',port=5002,debug=False)
except Exception as exc:
    (root/'integration-erreur.txt').write_text(f'{type(exc).__name__}: {exc}',encoding='utf-8')
    print(f'{type(exc).__name__}: {exc}',flush=True)
    input('Entree pour fermer.')