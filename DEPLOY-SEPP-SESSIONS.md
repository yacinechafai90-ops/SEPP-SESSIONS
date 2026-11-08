# Deploy SEPP sessions

The session catalogue needs a running Flask service and PostgreSQL. Netlify Drop
cannot run the Flask service or connect to a PostgreSQL database that exists
only on your PC. This project uses Render for Flask and PostgreSQL. The Netlify
ZIP is a small entry point that redirects visitors to the working Render site;
the login and admin pages remain on Render.

## 1. Export the local data

Restart the local server once so it creates any new tables. Run
`export_sepp_database.ps1` in PowerShell. It asks for the local database name
(default: `Trial Database`) and the PostgreSQL password, then writes
`SEPP-sessions-data.dump`. This dump contains accounts and private catalogue
data. Keep it private and do not add it to Git or the Netlify ZIP.

## 2. Create the Render service and database

Extract `SEPP-sessions-Render-source.zip` into a private Git repository. That
archive includes the required source files, `session-defaults/`, and `assets/`.
Do not include `*.dump`, `admin-acces.json`, `publication-acces.json`, `.env`,
or generated ZIP files. Render reads `render.yaml` to create the Flask web
service and managed PostgreSQL database.
Review the service and database plans shown by Render before confirming the
Blueprint; this file does not choose a paid plan for you.

Before creating the Blueprint, run `python generate_admin_hash.py` locally and
copy its output. Render prompts for `SEPP_ADMIN_ID` and
`SEPP_ADMIN_PASSWORD_HASH`. Use an administrator password separate from any
PostgreSQL password. Render generates `SEPP_SECRET_KEY` and supplies the
database connection string automatically.

## 3. Restore the database

In Render's PostgreSQL dashboard, copy the **external** database URL and run
`restore_sepp_database.ps1` locally. It prompts for that URL without echoing
it and restores `SEPP-sessions-data.dump`. The local dump and the Render
database credentials must stay private. After restoration,
restart the Render web service and check `/connexion` and `/admin` on its
`https://...onrender.com` URL. Confirm that a test account sees its own prices.

The site reads `SEPP_DATABASE_URL` on Render. Uploaded session photos are saved
in PostgreSQL so they remain available when the web service restarts. The
`session-defaults/` CSV files seed newly created sessions.

## 4. Build the Netlify ZIP

Only after the Render site works, run:

```text
python build_netlify_sessions_zip.py https://YOUR-RENDER-SERVICE.onrender.com
```

This writes `SEPP-sessions.zip`. Drop that ZIP at
`https://app.netlify.com/drop`. If Netlify asks for a folder, extract the ZIP
and drop the extracted folder. Visitors to the Netlify URL are redirected to
Render. The ZIP contains no accounts, prices, administrator credentials, or
PostgreSQL connection string. Changes made in `/admin` take effect without
rebuilding the Netlify ZIP.

The app has no inactivity logout. Logout and account deactivation still end
access. Browser cookie clearing or browser privacy settings can require a new
login.
