"""
Wijnkelder-server

Serveert de app en bewaart de gegevens en foto's centraal, zodat je op elk
apparaat dezelfde kelder ziet. Gebruikt alleen de standaardbibliotheek van
Python: er hoeft niets geïnstalleerd te worden.

Starten:   python server.py
Instellingen (omgevingsvariabelen):
  PORT      poort waarop de app draait (standaard 8080)
  DATA_DIR  map voor gegevens, foto's en back-ups (standaard: map 'data' naast dit bestand)

Inloggen: bij het eerste bezoek maak je een admin-account aan. De admin kan
daarna gebruikers toevoegen; iedere gebruiker heeft een eigen kelder.
Gebruik de app toch alleen op je thuisnetwerk of via een VPN zoals Tailscale,
en zet de poort niet open in je router.

Indeling van de gegevensmap:
  users.json                gebruikers (wachtwoorden alleen als hash)
  secret.key                sleutel waarmee inlogcookies worden ondertekend
  users/<id>/               de kelder van één gebruiker:
    wijnkelder.json, photos/, backups/
  verwijderd/               kelders van verwijderde gebruikers (niet gewist)
"""

import hashlib
import hmac
import json
import os
import re
import secrets
import shutil
import signal
import sys
import threading
import time
import traceback
from datetime import date
from http import HTTPStatus
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get('DATA_DIR', APP_DIR / 'data')).resolve()
USERS_FILE = DATA_DIR / 'users.json'
SECRET_FILE = DATA_DIR / 'secret.key'
CELLARS_DIR = DATA_DIR / 'users'
REMOVED_DIR = DATA_DIR / 'verwijderd'
PORT = int(os.environ.get('PORT', '8080'))

# Vóór de inlogfunctie stond alles direct in de gegevensmap. Bij de eerste
# admin verhuist dat naar diens eigen kelder.
LEGACY_ITEMS = ('wijnkelder.json', 'photos', 'backups')

KEEP_BACKUPS = 30                      # aantal dagelijkse back-ups dat bewaard blijft
MAX_BODY = 20 * 1024 * 1024            # grootste verzoek dat we accepteren (20 MB)
PHOTO_URL = re.compile(r'^/api/photos/([a-z0-9]{1,40})$')
USER_URL = re.compile(r'^/api/users/([a-f0-9]{16})$')

COOKIE_NAME = 'wijnkelder_sessie'
SESSION_DAYS = 30                      # zo lang blijf je ingelogd
PASSWORD_ROUNDS = 600_000              # maakt wachtwoorden raden traag
MIN_PASSWORD = 8
USERNAME = re.compile(r'^[A-Za-z0-9._-]{1,32}$')
ROLES = ('admin', 'user')
MAX_FAILED_LOGINS = 10                 # per IP-adres per kwartier
FAILED_LOGIN_WINDOW = 15 * 60

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

# Eén verzoek tegelijk mag de gegevens lezen of schrijven
lock = threading.RLock()
failed_logins = {}                     # IP-adres -> tijdstippen van mislukte pogingen


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


# ---------- Bestanden ----------

def write_json(file, value):
    # Eerst naar een tijdelijk bestand, dan in één keer vervangen:
    # zo raakt het bestand nooit half geschreven, ook niet bij stroomuitval
    file.parent.mkdir(parents=True, exist_ok=True)
    tmp = file.with_suffix('.tmp')
    with tmp.open('w', encoding='utf-8') as f:
        json.dump(value, f, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, file)


# ---------- Kelder van één gebruiker ----------

def read_store(cellar):
    """Geeft {'version': getal, 'data': gegevens of None} terug."""
    file = cellar / 'wijnkelder.json'
    if not file.exists():
        return {'version': 0, 'data': None}
    # utf-8-sig: leest ook een bestand dat in Kladblok of PowerShell is opgeslagen
    with file.open(encoding='utf-8-sig') as f:
        return json.load(f)


def write_store(cellar, store):
    backup_once_a_day(cellar)
    write_json(cellar / 'wijnkelder.json', store)


def backup_once_a_day(cellar):
    """Bewaart bij de eerste wijziging van de dag een kopie van de stand van daarvoor."""
    file = cellar / 'wijnkelder.json'
    if not file.exists():
        return
    backups = cellar / 'backups'
    backups.mkdir(exist_ok=True)
    target = backups / f'wijnkelder-{date.today().isoformat()}.json'
    if not target.exists():
        shutil.copy2(file, target)
    for old in sorted(backups.glob('wijnkelder-*.json'))[:-KEEP_BACKUPS]:
        old.unlink()


def move_legacy_data(users):
    """Verhuist een kelder van vóór de inlogfunctie naar de eerste admin."""
    legacy = [DATA_DIR / name for name in LEGACY_ITEMS if (DATA_DIR / name).exists()]
    admin = next((u for u in users if u['role'] == 'admin'), None)
    if not legacy or not admin:
        return
    cellar = CELLARS_DIR / admin['id']
    if (cellar / 'wijnkelder.json').exists():
        return   # die admin heeft al een eigen kelder: niets overschrijven
    cellar.mkdir(parents=True, exist_ok=True)
    for item in legacy:
        if not (cellar / item.name).exists():
            shutil.move(str(item), str(cellar / item.name))
    print(f'Bestaande kelder verhuisd naar de kelder van {admin["username"]}', flush=True)


# ---------- Gebruikers ----------

def read_users():
    if not USERS_FILE.exists():
        return []
    with USERS_FILE.open(encoding='utf-8') as f:
        return json.load(f)['users']


def write_users(users):
    write_json(USERS_FILE, {'users': users})


def public(user):
    """Wat de app over een gebruiker mag weten (dus zonder wachtwoord-hash)."""
    return {key: user[key] for key in ('id', 'username', 'role', 'created')}


def find_user(users, username):
    return next((u for u in users if u['username'].casefold() == username.casefold()), None)


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, PASSWORD_ROUNDS)
    return {'salt': salt.hex(), 'hash': digest.hex(), 'rounds': PASSWORD_ROUNDS}


def check_password(user, password):
    p = user['password']
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(p['salt']), p['rounds'])
    return hmac.compare_digest(digest.hex(), p['hash'])


def set_password(user, password):
    user['password'] = hash_password(password)
    # Ingelogde apparaten met het oude wachtwoord worden hierdoor uitgelogd
    user['session'] = user.get('session', 0) + 1


def validate_username(value):
    name = value.strip() if isinstance(value, str) else ''
    if not USERNAME.match(name):
        raise ApiError(HTTPStatus.BAD_REQUEST,
                       'Gebruik voor de gebruikersnaam 1 tot 32 letters, cijfers, punten, streepjes of liggende streepjes.')
    return name


def validate_password(value):
    if not isinstance(value, str) or len(value) < MIN_PASSWORD:
        raise ApiError(HTTPStatus.BAD_REQUEST, f'Kies een wachtwoord van minstens {MIN_PASSWORD} tekens.')
    if len(value) > 200:
        raise ApiError(HTTPStatus.BAD_REQUEST, 'Dat wachtwoord is te lang.')
    return value


def new_user(username, password, role):
    user = {'id': secrets.token_hex(8), 'username': username, 'role': role,
            'created': date.today().isoformat(), 'session': 0}
    set_password(user, password)
    return user


# ---------- Inlogcookie ----------
# Het cookie bevat gebruiker, vervaldatum en sessienummer, ondertekend met een
# geheime sleutel. Zo hoeft de server geen sessies bij te houden en blijf je
# ook na een herstart van de container ingelogd.

def load_secret():
    if SECRET_FILE.exists():
        return bytes.fromhex(SECRET_FILE.read_text().strip())
    secret = secrets.token_bytes(32)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SECRET_FILE.write_text(secret.hex())
    return secret


SECRET = None   # wordt in main() geladen


def sign(payload):
    return hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest()


def make_session(user):
    expires = int(time.time()) + SESSION_DAYS * 86400
    payload = f'{user["id"]}.{expires}.{user["session"]}'
    return f'{payload}.{sign(payload)}'


def user_from_session(value, users):
    parts = value.split('.')
    if len(parts) != 4:
        return None
    user_id, expires, session, signature = parts
    if not hmac.compare_digest(sign(f'{user_id}.{expires}.{session}'), signature):
        return None
    if not expires.isdigit() or int(expires) < time.time():
        return None
    user = next((u for u in users if u['id'] == user_id), None)
    if not user or str(user['session']) != session:
        return None
    return user


def too_many_failed_logins(ip):
    now = time.time()
    with lock:
        recent = [t for t in failed_logins.get(ip, []) if now - t < FAILED_LOGIN_WINDOW]
        failed_logins[ip] = recent
        return len(recent) >= MAX_FAILED_LOGINS


def record_failed_login(ip):
    with lock:
        failed_logins.setdefault(ip, []).append(time.time())


# ---------- Webserver ----------

class Handler(BaseHTTPRequestHandler):
    server_version = 'Wijnkelder'

    def do_GET(self):
        self.handle_request('GET')

    def do_POST(self):
        self.handle_request('POST')

    def do_PUT(self):
        self.handle_request('PUT')

    def do_DELETE(self):
        self.handle_request('DELETE')

    def handle_request(self, method):
        path = urlparse(self.path).path
        if not path.startswith('/api/'):
            if method != 'GET':
                return self.send_error_json(HTTPStatus.METHOD_NOT_ALLOWED, 'Niet toegestaan')
            return self.serve_app(path)
        try:
            self.handle_api(method, path)
        except ApiError as err:
            self.send_error_json(err.status, str(err))
        except Exception:
            # Onverwachte fout: in het log zetten en de app een nette melding geven
            traceback.print_exc()
            self.send_error_json(HTTPStatus.INTERNAL_SERVER_ERROR, 'Er ging iets mis op de server.')

    def handle_api(self, method, path):
        # Zonder inloggen: status, eerste admin aanmaken, inloggen en uitloggen
        if (method, path) == ('GET', '/api/session'):
            with lock:
                users = read_users()
                user = self.session_user(users)
                legacy = any((DATA_DIR / name).exists() for name in LEGACY_ITEMS)
            return self.send_json({'setup': not users, 'legacy': legacy and not users,
                                   'user': public(user) if user else None})
        if (method, path) == ('POST', '/api/setup'):
            return self.create_first_admin()
        if (method, path) == ('POST', '/api/login'):
            return self.log_in()
        if (method, path) == ('POST', '/api/logout'):
            return self.send_json({'ok': True}, cookie='')

        # Al het andere alleen voor wie is ingelogd
        with lock:
            user = self.session_user(read_users())
        if not user:
            raise ApiError(HTTPStatus.UNAUTHORIZED, 'Je bent niet (meer) ingelogd.')

        if (method, path) == ('POST', '/api/password'):
            return self.change_own_password(user)
        if path == '/api/users' or USER_URL.match(path):
            if user['role'] != 'admin':
                raise ApiError(HTTPStatus.FORBIDDEN, 'Alleen een admin mag gebruikers beheren.')
            return self.manage_users(method, path, user)
        return self.handle_cellar(method, path, CELLARS_DIR / user['id'])

    # ---------- Inloggen ----------
    # (Let op: 'setup' en 'handle' zijn al namen van de webserver zelf)

    def create_first_admin(self):
        body = self.read_json()
        username = validate_username(body.get('username'))
        password = validate_password(body.get('password'))
        user = new_user(username, password, 'admin')
        with lock:
            if read_users():
                raise ApiError(HTTPStatus.FORBIDDEN, 'Er is al een admin-account. Log in.')
            write_users([user])
            move_legacy_data([user])
        print(f'Admin-account {username} aangemaakt', flush=True)
        self.send_json({'user': public(user)}, cookie=make_session(user))

    def log_in(self):
        ip = self.client_address[0]
        if too_many_failed_logins(ip):
            raise ApiError(HTTPStatus.TOO_MANY_REQUESTS,
                           'Te veel mislukte pogingen. Probeer het over een kwartier opnieuw.')
        body = self.read_json()
        username = body.get('username') if isinstance(body.get('username'), str) else ''
        password = body.get('password') if isinstance(body.get('password'), str) else ''
        with lock:
            user = find_user(read_users(), username.strip())
        # Het controleren duurt even; buiten het slot, zodat anderen niet hoeven te wachten
        if not user or not check_password(user, password):
            record_failed_login(ip)
            raise ApiError(HTTPStatus.BAD_REQUEST, 'Gebruikersnaam of wachtwoord klopt niet.')
        self.send_json({'user': public(user)}, cookie=make_session(user))

    def change_own_password(self, user):
        body = self.read_json()
        if not check_password(user, body.get('current') if isinstance(body.get('current'), str) else ''):
            raise ApiError(HTTPStatus.BAD_REQUEST, 'Je huidige wachtwoord klopt niet.')
        password = validate_password(body.get('password'))
        with lock:
            users = read_users()
            me = next(u for u in users if u['id'] == user['id'])
            set_password(me, password)
            write_users(users)
        # Andere apparaten worden uitgelogd, dit apparaat krijgt een nieuw cookie
        self.send_json({'ok': True}, cookie=make_session(me))

    # ---------- Gebruikers beheren (alleen admin) ----------

    def manage_users(self, method, path, admin):
        if (method, path) == ('GET', '/api/users'):
            with lock:
                users = read_users()
            return self.send_json({'users': [public(u) for u in sorted(users, key=lambda u: u['username'].casefold())]})

        if (method, path) == ('POST', '/api/users'):
            body = self.read_json()
            username = validate_username(body.get('username'))
            password = validate_password(body.get('password'))
            role = body.get('role')
            if role not in ROLES:
                raise ApiError(HTTPStatus.BAD_REQUEST, 'Onbekende rol')
            user = new_user(username, password, role)
            with lock:
                users = read_users()
                if find_user(users, username):
                    raise ApiError(HTTPStatus.BAD_REQUEST, f'De gebruikersnaam "{username}" bestaat al.')
                users.append(user)
                write_users(users)
            return self.send_json({'user': public(user)})

        match = USER_URL.match(path)
        if not match:
            raise ApiError(HTTPStatus.NOT_FOUND, 'Onbekend adres')

        if method == 'PUT':
            body = self.read_json()
            password = validate_password(body['password']) if body.get('password') else None
            role = body.get('role')
            if role is not None and role not in ROLES:
                raise ApiError(HTTPStatus.BAD_REQUEST, 'Onbekende rol')
            with lock:
                users = read_users()
                user = next((u for u in users if u['id'] == match[1]), None)
                if not user:
                    raise ApiError(HTTPStatus.NOT_FOUND, 'Deze gebruiker bestaat niet (meer).')
                if role and role != user['role']:
                    admins = [u for u in users if u['role'] == 'admin']
                    if user['role'] == 'admin' and len(admins) == 1:
                        raise ApiError(HTTPStatus.BAD_REQUEST, 'Er moet minstens één admin blijven.')
                    user['role'] = role
                if password:
                    set_password(user, password)
                write_users(users)
            # Eigen wachtwoord gewijzigd? Dan blijft dit apparaat ingelogd
            cookie = make_session(user) if password and user['id'] == admin['id'] else None
            return self.send_json({'user': public(user)}, cookie=cookie)

        if method == 'DELETE':
            if match[1] == admin['id']:
                raise ApiError(HTTPStatus.BAD_REQUEST, 'Je kunt je eigen account niet verwijderen.')
            with lock:
                users = read_users()
                user = next((u for u in users if u['id'] == match[1]), None)
                if not user:
                    raise ApiError(HTTPStatus.NOT_FOUND, 'Deze gebruiker bestaat niet (meer).')
                # De kelder niet wissen maar apart zetten, voor het geval het een vergissing was
                cellar = CELLARS_DIR / user['id']
                if cellar.exists():
                    REMOVED_DIR.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(cellar), str(REMOVED_DIR / f'{user["username"]}-{date.today().isoformat()}-{user["id"]}'))
                write_users([u for u in users if u['id'] != user['id']])
            return self.send_json({'ok': True})

        raise ApiError(HTTPStatus.METHOD_NOT_ALLOWED, 'Niet toegestaan')

    # ---------- De eigen kelder ----------

    def handle_cellar(self, method, path, cellar):
        photo_dir = cellar / 'photos'

        if (method, path) == ('GET', '/api/data'):
            with lock:
                return self.send_json(read_store(cellar))

        if (method, path) == ('GET', '/api/version'):
            with lock:
                return self.send_json({'version': read_store(cellar)['version']})

        if (method, path) == ('PUT', '/api/data'):
            body = self.read_json()
            data = body.get('data')
            if not isinstance(data, dict) or not isinstance(data.get('wines'), list):
                raise ApiError(HTTPStatus.BAD_REQUEST, 'Dit zijn geen wijnkelder-gegevens')
            with lock:
                store = read_store(cellar)
                # Alleen opslaan als het apparaat de nieuwste versie had;
                # anders zou het de wijzigingen van een ander apparaat overschrijven
                if body.get('version') != store['version']:
                    return self.send_json({'error': 'conflict', 'version': store['version']}, HTTPStatus.CONFLICT)
                new = {'version': store['version'] + 1, 'data': data}
                write_store(cellar, new)
            return self.send_json({'version': new['version']})

        if path == '/api/photos':
            if method == 'GET':
                photos = {p.stem: int(p.stat().st_mtime) for p in photo_dir.glob('*.jpg')} if photo_dir.exists() else {}
                return self.send_json({'photos': photos})
            if method == 'DELETE':
                for photo in photo_dir.glob('*.jpg'):
                    photo.unlink()
                return self.send_json({'ok': True})

        match = PHOTO_URL.match(path)
        if match:
            file = photo_dir / f'{match[1]}.jpg'
            if method == 'GET':
                return self.send_file(file, cache=True)
            if method == 'PUT':
                image = self.read_body()
                if not image.startswith(b'\xff\xd8'):
                    raise ApiError(HTTPStatus.BAD_REQUEST, 'Alleen JPEG-foto\'s worden geaccepteerd')
                photo_dir.mkdir(parents=True, exist_ok=True)
                tmp = photo_dir / f'{match[1]}.tmp'
                tmp.write_bytes(image)
                os.replace(tmp, file)
                return self.send_json({'ok': True})
            if method == 'DELETE':
                file.unlink(missing_ok=True)
                return self.send_json({'ok': True})

        raise ApiError(HTTPStatus.NOT_FOUND, 'Onbekend adres')

    # ---------- Hulpfuncties ----------

    def session_user(self, users):
        try:
            cookie = SimpleCookie(self.headers.get('Cookie') or '')
        except CookieError:
            return None
        morsel = cookie.get(COOKIE_NAME)
        return user_from_session(morsel.value, users) if morsel else None

    def serve_app(self, path):
        """Serveert alleen de app zelf (index.html, css/, js/ en img/), nooit de gegevensmap."""
        rel = 'index.html' if path in ('', '/') else unquote(path.lstrip('/'))
        file = (APP_DIR / rel).resolve()
        # Pas na het oplossen van '..' controleren, anders kan /js/../server.py er toch doorheen
        allowed = file == APP_DIR / 'index.html' or any(APP_DIR / folder in file.parents for folder in ('css', 'js', 'img'))
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
        # De app zelf altijd opnieuw controleren, zodat een nieuwe versie meteen zichtbaar is.
        # Foto's veranderen nooit onder hetzelfde adres, maar zijn wel privé.
        self.send_header('Cache-Control', 'private, max-age=31536000, immutable' if cache else 'no-cache')
        self.end_headers()
        self.wfile.write(content)

    def read_body(self):
        length = int(self.headers.get('Content-Length') or 0)
        if length > MAX_BODY:
            raise ApiError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, 'Verzoek te groot')
        return self.rfile.read(length)

    def read_json(self):
        # Alleen JSON accepteren: een formulier op een andere website kan dat niet sturen
        if not (self.headers.get('Content-Type') or '').startswith('application/json'):
            raise ApiError(HTTPStatus.UNSUPPORTED_MEDIA_TYPE, 'Verwacht JSON')
        try:
            body = json.loads(self.read_body())
        except (ValueError, UnicodeDecodeError):
            raise ApiError(HTTPStatus.BAD_REQUEST, 'Ongeldige JSON')
        if not isinstance(body, dict):
            raise ApiError(HTTPStatus.BAD_REQUEST, 'Ongeldige JSON')
        return body

    def send_json(self, value, status=HTTPStatus.OK, cookie=None):
        content = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        if cookie is not None:
            # Leeg cookie = uitloggen
            max_age = SESSION_DAYS * 86400 if cookie else 0
            secure = '; Secure' if self.headers.get('X-Forwarded-Proto') == 'https' else ''
            self.send_header('Set-Cookie', f'{COOKIE_NAME}={cookie}; Max-Age={max_age}; Path=/; HttpOnly; SameSite=Strict{secure}')
        self.end_headers()
        self.wfile.write(content)

    def send_error_json(self, status, message):
        self.send_json({'error': message}, status)


def main():
    global SECRET
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SECRET = load_secret()
    # Mocht het verhuizen bij het aanmaken van de admin onderbroken zijn, dan nu alsnog
    with lock:
        move_legacy_data(read_users())
    # Netjes stoppen als Docker de container stopt
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    print(f'Wijnkelder draait op poort {PORT}, gegevens in {DATA_DIR}', flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()


if __name__ == '__main__':
    main()
