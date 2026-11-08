"""Gunicorn entry point for a hosted SEPP backend."""
import os

import admin
import acces_utilisateurs
import server

if not os.environ.get("SEPP_DATABASE_URL"):
    raise RuntimeError("SEPP_DATABASE_URL is required for the hosted service")

admin.preparer_acces(vars(server))
acces_utilisateurs.preparer_base(vars(server))

app = server.app
