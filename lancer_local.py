"""Lance le serveur existant et ouvre le navigateur une fois disponible."""
import runpy
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:5002/"

def ouvrir_navigateur():
    while True:
        time.sleep(1)
        try:
            with urllib.request.urlopen(URL, timeout=1) as response:
                if response.status == 200:
                    webbrowser.open(URL)
                    return
        except OSError:
            pass

if __name__ == "__main__":
    print("Catalogue local : " + URL, flush=True)
    print("Gardez cette fenetre ouverte. Ctrl+C pour arreter le site.", flush=True)
    threading.Thread(target=ouvrir_navigateur, daemon=True).start()
    runpy.run_path(str(ROOT / "server.py"), run_name="__main__")