"""Build a curated, credential-free source archive for Render/Git."""
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parent
OUTPUT=ROOT/'SEPP-sessions-Render-source.zip'
BACKEND={'server.py','admin.py','acces_utilisateurs.py','gestion_sessions.py',
         'session_templates.py','wsgi.py','render.yaml','requirements-cloud.txt',
         'DEPLOY-SEPP-SESSIONS.md','generate_admin_hash.py',
         'export_sepp_database.ps1','restore_sepp_database.ps1',
         'build_netlify_sessions_zip.py','.gitignore'}
STATIC_EXT={'.html','.js','.css','.png','.jpg','.jpeg','.webp','.svg','.gif',
            '.ico','.ttf','.woff','.woff2','.pdf'}

files=[p for p in ROOT.iterdir() if p.is_file() and (p.name in BACKEND or p.suffix.lower() in STATIC_EXT)]
for folder in ('assets','session-defaults'):
    files.extend(p for p in (ROOT/folder).rglob('*') if p.is_file() and not any(part.startswith('.') for part in p.relative_to(ROOT).parts))
with zipfile.ZipFile(OUTPUT,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for path in sorted(files): archive.write(path,path.relative_to(ROOT).as_posix())
print(f'{OUTPUT} ({len(files)} files)')
