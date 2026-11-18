# -*- coding: utf-8 -*-
"""ARIA - Escritorio propio: launcher de apps + archivos + ventanas (un «sistema operativo» chico encima de Windows).

  Pestañas del Shell: 1 Chat · 2 Apps · 3 Archivos · 4 Ventanas (Ctrl+1..4 o clic arriba).
  Chat: «abre spotify» · «apps» · «mis archivos» · «ventanas» · «ve a chrome» (trae esa ventana al frente).

Lee el menú Inicio de Windows (accesos .lnk), aprende qué abres más (favoritas), y deja fijar/ocultar.
Reglas: nunca cierra ni mata ventanas ni procesos (solo abre y trae al frente). Sin servidores, sin dependencias nuevas.
La parte de buscar/ordenar es PURA y se prueba sin Windows.
"""
import json
import os
import re
import sys
import time
import unicodedata

_DIR = os.path.dirname(os.path.abspath(__file__))
DATOS = os.path.join(_DIR, "data", "escritorio_pc.json")
EXT_APP = (".lnk", ".url", ".appref-ms")
# accesos que no son apps para el usuario
_RUIDO = re.compile(r"\b(uninstall|desinstalar|readme|leeme|léame|help|ayuda|manual|documentation|documentacion|license|licencia|"
                    r"release notes|website|sitio web|changelog|support|soporte|what'?s new|novedades)\b", re.I)


def _norm(t):
    return "".join(c for c in unicodedata.normalize("NFD", (t or "").lower()) if unicodedata.category(c) != "Mn").strip()


# ── PURO ─────────────────────────────────────────────────────────────────────────────────────────
def nombre_de(archivo):
    """'Spotify.lnk' -> 'Spotify'. PURO."""
    b = os.path.basename(archivo or "")
    for e in EXT_APP + (".exe",):
        if b.lower().endswith(e):
            return b[: -len(e)].strip()
    return b.strip()


def es_app(nombre):
    """Descarta desinstaladores, manuales, webs de soporte. PURO."""
    return bool(nombre) and not _RUIDO.search(nombre) and len(nombre) <= 60


def indexar(rutas):
    """[rutas de accesos] -> [{nombre, ruta, letra}] sin repetidos, A–Z. PURO."""
    vistos, out = set(), []
    for r in rutas:
        n = nombre_de(r)
        k = _norm(n)
        if not es_app(n) or k in vistos:
            continue
        vistos.add(k)
        out.append({"nombre": n, "ruta": r, "letra": letra(n)})
    return sorted(out, key=lambda a: _norm(a["nombre"]))


def letra(n):
    c = _norm(n)[:1].upper()
    return c if "A" <= c <= "Z" else "#"


def puntaje(nombre, q):
    """Qué tan bien coincide «q» con el nombre (0 = nada). PURO."""
    n, q = _norm(nombre), _norm(q)
    if not q:
        return 1
    if n == q:
        return 1000
    if n.startswith(q):
        return 800 - len(n)
    palabras = re.split(r"[\s\-_.()]+", n)
    if any(p.startswith(q) for p in palabras):
        return 600 - len(n)
    if q in n:
        return 400 - len(n)
    iniciales = "".join(p[:1] for p in palabras if p)
    if len(q) >= 2 and iniciales.startswith(q):        # «vsc» -> Visual Studio Code
        return 350
    return 0


def buscar(apps, q, ocultas=(), n=60):
    """Apps visibles ordenadas por coincidencia (sin q: A–Z). PURO."""
    oc = set(ocultas or ())
    vis = [a for a in apps if a["ruta"] not in oc]
    if not (q or "").strip():
        return vis[:n] if n else vis
    con = [(puntaje(a["nombre"], q), a) for a in vis]
    con = [x for x in con if x[0] > 0]
    con.sort(key=lambda x: (-x[0], _norm(x[1]["nombre"])))
    return [a for _, a in con][:n]


def favoritas(apps, usos, fijadas=(), n=6):
    """Fijadas primero, luego las más abiertas. PURO."""
    por = {a["ruta"]: a for a in apps}
    out = [por[r] for r in (fijadas or ()) if r in por]
    resto = sorted((a for a in apps if a["ruta"] not in fijadas and usos.get(a["ruta"], 0) > 0), key=lambda a: -usos.get(a["ruta"], 0))
    for a in resto:
        if len(out) >= n:
            break
        out.append(a)
    return out[:n]


def ventanas_utiles(lista, propio="ARIA"):
    """[(hwnd, título)] -> solo ventanas de verdad (sin vacías ni las del sistema). PURO."""
    malas = ("Program Manager", "Microsoft Text Input Application", "Settings", "Configuración", "Windows Input Experience")
    out, vistos = [], set()
    for h, t in lista:
        t = (t or "").strip()
        if not t or t in malas or t in vistos:
            continue
        vistos.add(t)
        out.append({"hwnd": h, "titulo": t, "propia": t.startswith(propio)})
    return out


def manejar(t):
    """Chat -> None | tupla. PURO.
    ('pestana', 'apps'|'archivos'|'ventanas') · ('abrir', consulta) · ('enfocar', consulta)"""
    n = _norm(t).strip(" ?¿!.")
    if n in ("apps", "mis apps", "aplicaciones", "mis aplicaciones", "launcher", "inicio", "menu inicio"):
        return ("pestana", "apps")
    if n in ("archivos", "mis archivos", "recientes", "archivos recientes", "carpetas"):
        return ("pestana", "archivos")
    if n in ("ventanas", "mis ventanas", "que ventanas tengo abiertas", "ventanas abiertas", "que tengo abierto"):
        return ("pestana", "ventanas")
    m = re.match(r"^(?:ve a|cambia a|trae|pon al frente|muestrame)\s+(?:la ventana (?:de )?)?(.{2,40})$", n)
    if m and not re.search(r"\b(web|pagina|link|enlace|https?)\b", m.group(1)):
        return ("enfocar", m.group(1).strip())
    m = re.match(r"^(?:abre|abreme|abrir|lanza|inicia|ejecuta)\s+(?:la app |el programa |la aplicacion )?(.{2,40})$", n)
    if m and not re.search(r"https?|www\.|\.com|carpeta|archivo|video|foto|correo|la web|pagina|navegador aria", m.group(1)):
        return ("abrir", m.group(1).strip())
    return None


# ── lo que toca el sistema (solo Windows; en otro sistema devuelve vacío) ────────────────────────
def _carpetas_inicio():
    env = os.environ.get
    return [p for p in (
        os.path.join(env("ProgramData", r"C:\ProgramData"), "Microsoft", "Windows", "Start Menu", "Programs"),
        os.path.join(env("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs") if env("APPDATA") else "",
        os.path.join(os.path.expanduser("~"), "Desktop"),
    ) if p and os.path.isdir(p)]


def escanear():
    rutas = []
    for base in _carpetas_inicio():
        for raiz, _dirs, archivos in os.walk(base):
            if raiz.count(os.sep) - base.count(os.sep) > 2:
                continue
            for a in archivos:
                if a.lower().endswith(EXT_APP):
                    rutas.append(os.path.join(raiz, a))
    return indexar(rutas)


def leer():
    try:
        d = json.load(open(DATOS, encoding="utf-8"))
    except Exception:
        d = {}
    for k, v in (("usos", {}), ("fijadas", []), ("ocultas", [])):
        d.setdefault(k, v)
    return d


def guardar(d):
    try:
        os.makedirs(os.path.dirname(DATOS), exist_ok=True)
        json.dump(d, open(DATOS, "w", encoding="utf-8"), ensure_ascii=False)
    except Exception:
        pass


def abrir(ruta):
    """Abre una app o archivo con Windows y lo cuenta para favoritas. -> (ok, texto)"""
    try:
        if sys.platform.startswith("win"):
            os.startfile(ruta)
        else:
            return False, "Abrir apps solo funciona en Windows."
    except Exception as exc:
        return False, "No pude abrirla: %s" % exc
    d = leer(); d["usos"][ruta] = d["usos"].get(ruta, 0) + 1; guardar(d)
    return True, "Abriendo %s." % nombre_de(ruta)


def alternar(lista, ruta):
    d = leer(); l = d[lista]
    if ruta in l:
        l.remove(ruta)
    else:
        l.append(ruta)
    guardar(d)
    return ruta in l


def recientes(n=14):
    """Archivos que abriste hace poco (accesos de Windows «Recientes»)."""
    rec = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Recent")
    if not os.environ.get("APPDATA") or not os.path.isdir(rec):
        return []
    try:
        xs = [os.path.join(rec, a) for a in os.listdir(rec) if a.lower().endswith(".lnk")]
    except OSError:
        return []
    xs.sort(key=lambda p: os.path.getmtime(p), reverse=True)
    return [{"nombre": nombre_de(p), "ruta": p} for p in xs[:n]]


def carpetas():
    casa = os.path.expanduser("~")
    nombres = (("Descargas", "Downloads"), ("Documentos", "Documents"), ("Escritorio", "Desktop"),
               ("Imágenes", "Pictures"), ("Videos", "Videos"), ("Videos de ARIA", os.path.join("Videos", "ARIA")), ("Música", "Music"))
    return [{"nombre": n, "ruta": os.path.join(casa, c)} for n, c in nombres if os.path.isdir(os.path.join(casa, c))]


def ventanas():
    if not sys.platform.startswith("win"):
        return []
    import ctypes
    u = ctypes.windll.user32
    out = []
    proto = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    def cb(h, _):
        if u.IsWindowVisible(h) and not u.GetWindow(h, 4):          # 4 = GW_OWNER: sin dueño = ventana principal
            buf = ctypes.create_unicode_buffer(256)
            u.GetWindowTextW(h, buf, 256)
            out.append((h, buf.value))
        return True
    u.EnumWindows(proto(cb), 0)
    return ventanas_utiles(out)


def enfocar(hwnd):
    """Trae una ventana al frente (la restaura si estaba minimizada). Nunca la cierra."""
    if not sys.platform.startswith("win"):
        return False
    import ctypes
    u = ctypes.windll.user32
    if u.IsIconic(hwnd):
        u.ShowWindow(hwnd, 9)               # SW_RESTORE
    return bool(u.SetForegroundWindow(hwnd))


def responder(acc, apps=None):
    """Para el chat: abre o enfoca. -> texto | None (si no hay coincidencia: que siga el cerebro)."""
    if acc[0] == "abrir":
        r = buscar(apps if apps is not None else escanear(), acc[1], leer()["ocultas"], 1)
        if not r or puntaje(r[0]["nombre"], acc[1]) < 350:
            return None
        return abrir(r[0]["ruta"])[1]
    if acc[0] == "enfocar":
        vs = [v for v in ventanas() if not v["propia"]]
        mejor = max(vs, key=lambda v: puntaje(v["titulo"], acc[1]), default=None)
        if not mejor or puntaje(mejor["titulo"], acc[1]) <= 0:
            return None
        return "Listo, %s al frente." % mejor["titulo"][:50] if enfocar(mejor["hwnd"]) else "Windows no me dejó traerla al frente."
    return None
