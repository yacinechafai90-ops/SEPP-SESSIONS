import json
from getpass import getpass
from pathlib import Path
import server

root = Path(__file__).resolve().parent
server.MOT_DE_PASSE = getpass("Mot de passe PostgreSQL : ")
result = []
with server.ouvrir_connexion("postgres") as cn:
    names = cn.execute("SELECT datname FROM pg_database WHERE NOT datistemplate AND datallowconn ORDER BY datname").fetchall()
for row in names:
    name = row['datname']
    try:
        with server.ouvrir_connexion(name) as cn:
            cn.execute("SET TRANSACTION READ ONLY")
            columns = cn.execute("SELECT table_schema,table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name,ordinal_position").fetchall()
            keys = cn.execute("SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype IN ('p','u','f') AND connamespace NOT IN (SELECT oid FROM pg_namespace WHERE nspname IN ('pg_catalog','information_schema')) ORDER BY conrelid,conname").fetchall()
            result.append(dict(database=name,columns=columns,constraints=keys))
    except Exception as exc:
        result.append(dict(database=name,error=str(exc)))
target = root / 'structure-postgresql.json'
target.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print("Structure relevee. Vous pouvez laisser Codex terminer la correction.",flush=True)
input("Appuyez sur Entree pour fermer.")