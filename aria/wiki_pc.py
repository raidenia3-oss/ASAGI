"""ARIA - Wikipedia en español SIN internet, en la tarjeta SD del celular.

«prepara wikipedia» (en ARIA, o en ASAGI que se lo pide a ARIA):
  1. baja de Kiwix la Wikipedia en español «mini» (la introducción de cada artículo, ~2 GB);
  2. la convierte aquí en la PC en una base SQLite con búsqueda (FTS4) — el trabajo pesado no lo hace el celular;
  3. ASAGI se la trae sola por WiFi (enlace cifrado con ARIA) a su carpeta en la SD; el archivo se
     comprueba con sha256 y la copia se reanuda si se corta.
ASAGI luego busca ahí con el SQLite de Android: casi nada de RAM, sin internet.
Dependencia nueva (aprobada): libzim (para leer el archivo de Kiwix). Se instala sola.
"""
import html
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import threading
import time
import unicodedata
import urllib.request
from html.parser import HTMLParser

BASE = os.path.dirname(os.path.abspath(__file__))
CARPETA = os.path.join(BASE, "data", "wiki")
DB = os.path.join(CARPETA, "wiki_es.db")
KIWIX = "https://download.kiwix.org/zim/wikipedia/"
PAQUETE = "com.asagi.app"
DESTINO_REL = "Android/data/%s/files/wiki" % PAQUETE
_FLAGS = 0x08000000 if os.name == "nt" else 0
_lock = threading.Lock()
estado = {"fase": "", "pct": 0, "error": ""}


def norm(t):
    """Clave de búsqueda: minúsculas, sin tildes, sin signos. PURO."""
    t = unicodedata.normalize("NFD", str(t or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", t)).strip()


class _Texto(HTMLParser):
    """HTML del artículo -> párrafos de texto (sin tablas, referencias ni estilos)."""
    SALTAR = {"style", "script", "table", "sup", "math", "figure", "nav", "footer"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.partes, self._salto, self._en_p = [], 0, False

    def handle_starttag(self, tag, attrs):
        if tag in self.SALTAR:
            self._salto += 1
        elif tag in ("p", "li") and not self._salto:
            self._en_p = True

    def handle_endtag(self, tag):
        if tag in self.SALTAR and self._salto:
            self._salto -= 1
        elif tag in ("p", "li"):
            if self._en_p:
                self.partes.append("\n")
            self._en_p = False

    def handle_data(self, d):
        if self._en_p and not self._salto:
            self.partes.append(d)


def texto_de_html(h, maximo=1500):
    """PURO."""
    p = _Texto()
    try:
        p.feed(h)
    except Exception:
        pass
    t = re.sub(r"[ \t]+", " ", "".join(p.partes))
    t = re.sub(r"\s*\n\s*", "\n", t).strip()
    t = re.sub(r"\[\d+\]", "", t)
    return t[:maximo]


def _avisar(avisar, txt):
    if avisar:
        try:
            avisar(txt)
        except Exception:
            pass


# ---------------- 1. bajar el ZIM ----------------
def ultimo_zim():
    with urllib.request.urlopen(urllib.request.Request(KIWIX, headers={"User-Agent": "ARIA/1.0"}), timeout=30) as f:
        listado = f.read().decode("utf-8", "replace")
    nombres = sorted(set(re.findall(r"wikipedia_es_all_mini_\d{4}-\d{2}\.zim", listado)))
    if not nombres:
        raise RuntimeError("no encontré la Wikipedia en español en Kiwix")
    return nombres[-1]


def bajar_zim(avisar=None):
    os.makedirs(CARPETA, exist_ok=True)
    nombre = ultimo_zim()
    dest = os.path.join(CARPETA, nombre)
    if os.path.exists(dest):
        return dest
    tmp = dest + ".part"
    hecho = os.path.getsize(tmp) if os.path.exists(tmp) else 0       # reanuda si se cortó
    req = urllib.request.Request(KIWIX + nombre, headers={"User-Agent": "ARIA/1.0", "Range": "bytes=%d-" % hecho})
    with urllib.request.urlopen(req, timeout=60) as f, open(tmp, "ab" if hecho else "wb") as g:
        total = hecho + int(f.headers.get("Content-Length") or 0)
        if f.status == 200 and hecho:                                   # el servidor no reanudó
            g.seek(0); g.truncate(); hecho = 0
        ultimo = 0
        while True:
            b = f.read(4 << 20)
            if not b:
                break
            g.write(b); hecho += len(b)
            pct = int(hecho * 100 / total) if total else 0
            estado.update(fase="bajando", pct=pct)
            if pct >= ultimo + 10:
                ultimo = pct - pct % 10
                _avisar(avisar, "📚 Wikipedia: bajando %d%% (%.1f GB)…" % (pct, hecho / 1e9))
    os.replace(tmp, dest)
    return dest


# ---------------- 2. convertir a SQLite ----------------
def _libzim():
    try:
        from libzim.reader import Archive  # noqa: F401
        return True
    except Exception:
        py = os.path.join(os.path.dirname(sys.executable), "python.exe")
        py = py if os.path.exists(py) else sys.executable
        subprocess.run([py, "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "libzim"],
                       capture_output=True, timeout=900, creationflags=_FLAGS)
        import importlib
        importlib.invalidate_caches()
        from libzim.reader import Archive  # noqa: F401
        return True


ESQUEMA = """
CREATE VIRTUAL TABLE w USING fts4(titulo, texto, tokenize=unicode61 "remove_diacritics=1");
CREATE TABLE idx(clave TEXT PRIMARY KEY, id INTEGER) WITHOUT ROWID;
CREATE TABLE meta(k TEXT PRIMARY KEY, v TEXT);
"""


def crear_db(ruta):
    if os.path.exists(ruta):
        os.remove(ruta)
    c = sqlite3.connect(ruta)
    c.executescript(ESQUEMA)
    return c


def agregar(c, titulo, texto):
    cur = c.execute("INSERT INTO w(titulo, texto) VALUES (?, ?)", (titulo, texto))
    c.execute("INSERT OR IGNORE INTO idx(clave, id) VALUES (?, ?)", (norm(titulo), cur.lastrowid))


def convertir(zim, avisar=None, destino=DB):
    _libzim()
    from libzim.reader import Archive
    a = Archive(zim)
    tmp = destino + ".tmp"
    c = crear_db(tmp)
    c.execute("PRAGMA journal_mode=OFF"); c.execute("PRAGMA synchronous=OFF")
    total = a.all_entry_count if hasattr(a, "all_entry_count") else a.entry_count
    n, ultimo = 0, 0
    for i in range(total):
        try:
            e = a._get_entry_by_id(i)
            if e.is_redirect:
                continue
            it = e.get_item()
            if not str(it.mimetype).startswith("text/html"):
                continue
            t = texto_de_html(bytes(it.content).decode("utf-8", "replace"))
            if len(t) < 40:
                continue
            agregar(c, html.unescape(e.title), t)
            n += 1
        except Exception:
            continue
        pct = int(i * 100 / max(1, total))
        if pct >= ultimo + 5:
            ultimo = pct - pct % 5
            estado.update(fase="convirtiendo", pct=pct)
            c.commit()
            _avisar(avisar, "📚 Wikipedia: preparando %d%% (%d artículos)…" % (pct, n))
    c.execute("INSERT OR REPLACE INTO meta VALUES ('articulos', ?)", (str(n),))
    c.execute("INSERT OR REPLACE INTO meta VALUES ('origen', ?)", (os.path.basename(zim),))
    c.execute("INSERT OR REPLACE INTO meta VALUES ('fecha', ?)", (time.strftime("%Y-%m-%d"),))
    c.commit()
    _avisar(avisar, "📚 Wikipedia: optimizando la búsqueda…")
    c.execute("INSERT INTO w(w) VALUES('optimize')")
    c.commit(); c.close()
    os.replace(tmp, destino)
    return n


# ---------------- búsqueda (la misma lógica que usa ASAGI en Android) ----------------
def buscar(q, ruta=DB, n=3):
    c = sqlite3.connect("file:%s?mode=ro" % ruta, uri=True)
    try:
        r = c.execute("SELECT w.titulo, w.texto FROM idx JOIN w ON w.docid = idx.id WHERE idx.clave = ?", (norm(q),)).fetchall()
        if not r:
            consulta = " ".join(x + "*" if len(x) > 3 else x for x in norm(q).split()[:8])
            r = c.execute("SELECT titulo, texto FROM w WHERE titulo MATCH ? LIMIT ?", (consulta, n)).fetchall() or \
                c.execute("SELECT titulo, texto FROM w WHERE w MATCH ? LIMIT ?", (consulta, n)).fetchall()
        return [{"titulo": a, "texto": b} for a, b in r[:n]]
    finally:
        c.close()


# ---------------- 3. copiar a la SD por USB ----------------
def adb():
    cands = [shutil.which("adb"), os.path.join(BASE, "platform-tools", "adb.exe"),
             os.path.join(os.path.expanduser("~"), "platform-tools", "adb.exe"),
             os.path.join(os.environ.get("LOCALAPPDATA", ""), "Android", "Sdk", "platform-tools", "adb.exe"),
             r"C:\platform-tools\adb.exe", r"C:\adb\adb.exe"]
    try:
        import enlace_adb as _ea
        for k in ("ADB", "adb", "ADB_PATH"):
            v = getattr(_ea, k, None)
            if isinstance(v, str):
                cands.insert(0, v)
    except Exception:
        pass
    for p in cands:
        if p and os.path.exists(p):
            return p
    raise RuntimeError("no encuentro adb en la PC")


def _sh(*args, timeout=60):
    r = subprocess.run([adb()] + list(args), capture_output=True, text=True, timeout=timeout, creationflags=_FLAGS)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[-300:])
    return r.stdout


def tarjeta_sd():
    """La SD del celular: /storage/XXXX-XXXX (o None si no hay)."""
    for l in _sh("shell", "ls", "/storage").split():
        if re.fullmatch(r"[0-9A-F]{4}-[0-9A-F]{4}", l.strip()):
            return "/storage/" + l.strip()
    return None


def copiar_al_celular(avisar=None, ruta=DB):
    sd = tarjeta_sd()
    base = sd or "/sdcard"
    destino = "%s/%s" % (base, DESTINO_REL)
    _sh("shell", "mkdir", "-p", destino)
    _avisar(avisar, "📚 Wikipedia: copiando %.1f GB a la %s del celular por USB…" % (os.path.getsize(ruta) / 1e9, "SD" if sd else "memoria interna"))
    _sh("push", ruta, destino + "/wiki_es.db.part", timeout=3 * 3600)
    _sh("shell", "mv", "-f", destino + "/wiki_es.db.part", destino + "/wiki_es.db")
    return destino + "/wiki_es.db"


def huella(ruta=DB):
    """sha256 del archivo, guardado al lado para no recalcularlo (2 GB tardan)."""
    import hashlib
    cache = ruta + ".sha256"
    try:
        h, tam, mt = open(cache, encoding="utf-8").read().split()
        if int(tam) == os.path.getsize(ruta) and float(mt) == os.path.getmtime(ruta):
            return h
    except Exception:
        pass
    d = hashlib.sha256()
    with open(ruta, "rb") as f:
        for b in iter(lambda: f.read(4 << 20), b""):
            d.update(b)
    with open(cache, "w", encoding="utf-8") as g:
        g.write("%s %d %r" % (d.hexdigest(), os.path.getsize(ruta), os.path.getmtime(ruta)))
    return d.hexdigest()


def preparar(avisar=None):
    """Todo el proceso. Bloqueante: llamar en un hilo."""
    if not _lock.acquire(blocking=False):
        _avisar(avisar, "📚 Ya estoy preparando la Wikipedia.")
        return None
    try:
        estado.update(fase="inicio", pct=0, error="")
        if not os.path.exists(DB):
            _avisar(avisar, "📚 Preparo la Wikipedia en español sin internet. Son ~2 GB y tarda (bajar + convertir); sigo funcionando mientras.")
            zim = bajar_zim(avisar)
            n = convertir(zim, avisar)
            _avisar(avisar, "📚 Wikipedia lista en la PC: %d artículos." % n)
            try:
                os.remove(zim)                    # ya no hace falta el original
            except Exception:
                pass
        huella()
        estado.update(fase="listo", pct=100)
        _avisar(avisar, "📚 Wikipedia lista en la PC. ASAGI se la trae sola por WiFi la próxima vez que me vea.")
        return DB
    except Exception as exc:
        estado.update(fase="error", error=str(exc))
        _avisar(avisar, "⚠ Wikipedia: %s" % exc)
        return None
    finally:
        _lock.release()


def en_fondo(avisar=None):
    threading.Thread(target=preparar, args=(avisar,), daemon=True, name="aria-wiki").start()
