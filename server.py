"""
Wijnkelder-server

Serveert de app en bewaart de gegevens en foto's centraal, zodat je op elk
apparaat dezelfde kelder ziet. Gebruikt alleen de standaardbibliotheek van
Python: er hoeft niets geïnstalleerd te worden.

Starten:   python server.py
Instellingen (omgevingsvariabelen):
  PORT      poort waarop de app draait (standaard 8080)
  DATA_DIR  map voor gegevens, foto's en back-ups (standaard: map 'data' naast dit bestand)

Er is geen wachtwoord: gebruik de app alleen op je thuisnetwerk of via een VPN
zoals Tailscale, en zet de poort niet open in je router.
"""

import json
import os
import re
import shutil
import signal
import sys
import threading
from datetime import date
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get('DATA_DIR', APP_DIR / 'data')).resolve()
DATA_FILE = DATA_DIR / 'wijnkelder.json'
PHOTO_DIR = DATA_DIR / 'photos'
BACKUP_DIR = DATA_DIR / 'backups'
PORT = int(os.environ.get('PORT', '8080'))

KEEP_BACKUPS = 30                      # aantal dagelijkse back-ups dat bewaard blijft
MAX_BODY = 20 * 1024 * 1024            # grootste verzoek dat we accepteren (20 MB)
PHOTO_URL = re.compile(r'^/api/photos/([a-z0-9]{1,40})$')

CONTENT_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
}

# Eén apparaat tegelijk mag de gegevens lezen of schrijven
lock = threading.Lock()


# ---------- Gegevens ----------

def read_store():
    """Geeft {'version': getal, 'data': gegevens of None} terug."""
    if not DATA_FILE.exists():
        return {'version': 0, 'data': None}
    with DATA_FILE.open(encoding='utf-8') as f:
        return json.load(f)


def write_store(store):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    backup_once_a_day()
    # Eerst naar een tijdelijk bestand, dan in één keer vervangen:
    # zo raakt het bestand nooit half geschreven, ook niet bij stroomuitval
    tmp = DATA_FILE.with_suffix('.tmp')
    with tmp.open('w', encoding='utf-8') as f:
        json.dump(store, f, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, DATA_FILE)


def backup_once_a_day():
    """Bewaart bij de eerste wijziging van de dag een kopie van de stand van daarvoor."""
    if not DATA_FILE.exists():
        return
    BACKUP_DIR.mkdir(exist_ok=True)
    target = BACKUP_DIR / f'wijnkelder-{date.today().isoformat()}.json'
    if not target.exists():
        shutil.copy2(DATA_FILE, target)
    for old in sorted(BACKUP_DIR.glob('wijnkelder-*.json'))[:-KEEP_BACKUPS]:
        old.unlink()


# ---------- Webserver ----------

class Handler(BaseHTTPRequestHandler):
    server_version = 'Wijnkelder'

    def do_GET(self):
        path = urlparse(self.path).path

        if path == '/api/data':
            with lock:
                return self.send_json(read_store())

        if path == '/api/version':
            with lock:
                return self.send_json({'version': read_store()['version']})

        if path == '/api/photos':
            photos = {p.stem: int(p.stat().st_mtime) for p in PHOTO_DIR.glob('*.jpg')} if PHOTO_DIR.exists() else {}
            return self.send_json({'photos': photos})

        match = PHOTO_URL.match(path)
        if match:
            return self.send_file(PHOTO_DIR / f'{match[1]}.jpg', cache=True)

        return self.serve_app(path)

    def do_PUT(self):
        path = urlparse(self.path).path

        if path == '/api/data':
            try:
                body = json.loads(self.read_body())
            except (ValueError, UnicodeDecodeError):
                return self.send_error_json(HTTPStatus.BAD_REQUEST, 'Ongeldige JSON')
            data = body.get('data') if isinstance(body, dict) else None
            if not isinstance(data, dict) or not isinstance(data.get('wines'), list):
                return self.send_error_json(HTTPStatus.BAD_REQUEST, 'Dit zijn geen wijnkelder-gegevens')
            with lock:
                store = read_store()
                # Alleen opslaan als het apparaat de nieuwste versie had;
                # anders zou het de wijzigingen van een ander apparaat overschrijven
                if body.get('version') != store['version']:
                    return self.send_json({'error': 'conflict', 'version': store['version']}, HTTPStatus.CONFLICT)
                new = {'version': store['version'] + 1, 'data': data}
                write_store(new)
            return self.send_json({'version': new['version']})

        match = PHOTO_URL.match(path)
        if match:
            image = self.read_body()
            if not image.startswith(b'\xff\xd8'):
                return self.send_error_json(HTTPStatus.BAD_REQUEST, 'Alleen JPEG-foto\'s worden geaccepteerd')
            PHOTO_DIR.mkdir(parents=True, exist_ok=True)
            tmp = PHOTO_DIR / f'{match[1]}.tmp'
            tmp.write_bytes(image)
            os.replace(tmp, PHOTO_DIR / f'{match[1]}.jpg')
            return self.send_json({'ok': True})

        self.send_error_json(HTTPStatus.NOT_FOUND, 'Onbekend adres')

    def do_DELETE(self):
        path = urlparse(self.path).path

        if path == '/api/photos':
            for photo in PHOTO_DIR.glob('*.jpg'):
                photo.unlink()
            return self.send_json({'ok': True})

        match = PHOTO_URL.match(path)
        if match:
            (PHOTO_DIR / f'{match[1]}.jpg').unlink(missing_ok=True)
            return self.send_json({'ok': True})

        self.send_error_json(HTTPStatus.NOT_FOUND, 'Onbekend adres')

    # ---------- Hulpfuncties ----------

    def serve_app(self, path):
        """Serveert alleen de app zelf (index.html, css/ en js/), nooit de gegevensmap."""
        rel = 'index.html' if path in ('', '/') else unquote(path.lstrip('/'))
        file = (APP_DIR / rel).resolve()
        # Pas na het oplossen van '..' controleren, anders kan /js/../server.py er toch doorheen
        allowed = file == APP_DIR / 'index.html' or any(APP_DIR / folder in file.parents for folder in ('css', 'js'))
        if not allowed:
            return self.send_error_json(HTTPStatus.NOT_FOUND, 'Niet gevonden')
        self.send_file(file)

    def send_file(self, file, cache=False):
        if not file.is_file():
            return self.send_error_json(HTTPStatus.NOT_FOUND, 'Niet gevonden')
        content = file.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header('Content-Type', CONTENT_TYPES.get(file.suffix.lower(), 'application/octet-stream'))
        self.send_header('Content-Length', str(len(content)))
        # De app zelf altijd opnieuw controleren, zodat een nieuwe versie meteen zichtbaar is
        self.send_header('Cache-Control', 'max-age=31536000, immutable' if cache else 'no-cache')
        self.end_headers()
        self.wfile.write(content)

    def read_body(self):
        length = int(self.headers.get('Content-Length') or 0)
        if length > MAX_BODY:
            raise ValueError('Verzoek te groot')
        return self.rfile.read(length)

    def send_json(self, value, status=HTTPStatus.OK):
        content = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(content)

    def send_error_json(self, status, message):
        self.send_json({'error': message}, status)


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # Netjes stoppen als Docker de container stopt
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    print(f'Wijnkelder draait op poort {PORT}, gegevens in {DATA_DIR}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()


if __name__ == '__main__':
    main()
