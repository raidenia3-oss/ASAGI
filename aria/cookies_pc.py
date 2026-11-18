# -*- coding: utf-8 -*-
"""ARIA - Usar las sesiones de TU Chrome (Daniel, 18-nov-2026): que ARIA entre a las páginas ya conectada,
sin que vuelvas a iniciar sesión, y así pueda ver tu YouTube/redes y aprender (Musa).

Qué hace: lee las cookies de TU perfil de Chrome en esta PC (la base «Cookies» y la llave de «Local State»),
las descifra y las mete en el navegador de ARIA. Todo pasa EN TU PC. Las cookies NO salen de aquí:
nunca se mandan por el enlace al celular ni a ningún servidor (regla 2 y 4). Solo lectura de tu perfil.

Chrome en Windows guarda la llave AES dentro de «Local State», envuelta con DPAPI (atada a tu usuario de Windows).
Se abre la llave con DPAPI (ctypes, sin dependencias nuevas) y se descifran las cookies con AES-GCM (cryptography,
que ARIA ya trae). Si falta «cryptography», ARIA lo instala en su .venv la primera vez.

Frases (en ARIA): «usa mis sesiones de chrome» · «importa mis cookies» · «olvida mis cookies importadas».
Musa y el navegador llaman a aplicar() solos cuando abren, si está activado.
"""
import base64
import ctypes
import ctypes.wintypes as wt
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import time

_DIR = os.path.dirname(os.path.abspath(__file__))
AURA = os.path.dirname(_DIR)
MARCA = os.path.join(_DIR, "data", "cookies_pc.json")

# de dónde leer: tu Chrome real; si no, la copia que dejaste en AURA\cookies_copy
def _perfiles_chrome():
    base = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "User Data")
    out = []
    if os.path.isdir(base):
        ls = os.path.join(base, "Local State")
        for p in ("Default",) + tuple("Profile %d" % i for i in range(1, 6)):
            d = os.path.join(base, p)
            if os.path.isdir(d):
                out.append((d, ls))
    copia = os.path.join(AURA, "cookies_copy")
    if os.path.isdir(copia):
        out.append((copia, os.path.join(copia, "Local State")))
    return out


# PURO: dominios que valen la pena (redes y Google, para aprender); nada de bancos ni pagos.
DOMINIOS = ("youtube.com", "google.com", "instagram.com", "tiktok.com", "x.com", "twitter.com",
            "facebook.com", "reddit.com", "twitch.tv", "pinterest.com")


def interesa(dominio):
    d = (dominio or "").lstrip(".").lower()
    return any(d == x or d.endswith("." + x) for x in DOMINIOS)


def _dpapi_unprotect(datos):
    """Abre un blob DPAPI (CryptUnprotectData) con ctypes. Solo funciona como el MISMO usuario de Windows."""
    class BLOB(ctypes.Structure):
        _fields_ = [("cbData", wt.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]
    entrada = BLOB(len(datos), ctypes.cast(ctypes.create_string_buffer(datos, len(datos)), ctypes.POINTER(ctypes.c_char)))
    salida = BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(ctypes.byref(entrada), None, None, None, None, 0, ctypes.byref(salida)):
        raise OSError("DPAPI no pudo abrir la llave (¿otro usuario de Windows?)")
    try:
        return ctypes.string_at(salida.pbData, salida.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(salida.pbData)


def _llave(local_state):
    j = json.load(open(local_state, encoding="utf-8"))
    env = base64.b64decode(j["os_crypt"]["encrypted_key"])
    if env[:5] == b"DPAPI":
        return _dpapi_unprotect(env[5:])
    return _dpapi_unprotect(env)


def _descifrar(valor, llave, AESGCM):
    if valor[:3] in (b"v10", b"v11"):
        nonce, cuerpo, tag = valor[3:15], valor[15:-16], valor[-16:]
        return AESGCM(llave).decrypt(nonce, cuerpo + tag, None).decode("utf-8", "ignore")
    try:
        return _dpapi_unprotect(valor).decode("utf-8", "ignore")   # cookies viejas
    except Exception:
        return ""


def _tiene_cryptography():
    try:
        import cryptography.hazmat.primitives.ciphers.aead  # noqa: F401
        return True
    except Exception:
        return False


def instalar_cryptography():
    py = os.path.join(AURA, ".venv", "Scripts", "python.exe")
    if not os.path.isfile(py):
        py = sys.executable
    import subprocess
    try:
        subprocess.run([py, "-m", "pip", "install", "-q", "cryptography"], timeout=180,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except Exception:
        return False
    return _tiene_cryptography()


def leer_cookies():
    """Lee y descifra las cookies interesantes de tu Chrome. -> lista para Playwright add_cookies. Todo local."""
    if not sys.platform.startswith("win"):
        return []
    if not _tiene_cryptography() and not instalar_cryptography():
        raise RuntimeError("falta 'cryptography' y no pude instalarlo")
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    out, vistos = [], set()
    for perfil, local_state in _perfiles_chrome():
        db = os.path.join(perfil, "Network", "Cookies")
        if not os.path.isfile(db):
            db = os.path.join(perfil, "Cookies")
        if not os.path.isfile(db) or not os.path.isfile(local_state):
            continue
        try:
            llave = _llave(local_state)
        except Exception:
            continue
        tmp = os.path.join(tempfile.gettempdir(), "aria_ck_%d.db" % int(time.time() * 1000))
        try:
            shutil.copy2(db, tmp)                      # copia: Chrome tiene la original abierta
            con = sqlite3.connect(tmp)
            for host, nombre, enc, path, expira, seguro, httponly in con.execute(
                    "SELECT host_key,name,encrypted_value,path,expires_utc,is_secure,is_httponly FROM cookies"):
                if not interesa(host):
                    continue
                clave = (host, nombre, path)
                if clave in vistos:
                    continue
                try:
                    val = _descifrar(enc, llave, AESGCM)
                except Exception:
                    val = ""
                if not val:
                    continue
                vistos.add(clave)
                ck = {"name": nombre, "value": val, "domain": host, "path": path or "/",
                      "secure": bool(seguro), "httpOnly": bool(httponly)}
                if expira:                              # Chrome: microsegundos desde 1601
                    secs = expira / 1_000_000 - 11644473600
                    if secs > time.time():
                        ck["expires"] = int(secs)
                out.append(ck)
            con.close()
        except Exception:
            pass
        finally:
            try:
                os.remove(tmp)
            except OSError:
                pass
    return out


def activado():
    """Encendido por defecto (ARIA es autónoma): solo se apaga si Daniel dijo «olvida mis cookies»."""
    try:
        return bool(json.load(open(MARCA, encoding="utf-8")).get("activo", True))
    except Exception:
        return True


def _marcar(activo, n=0):
    try:
        os.makedirs(os.path.dirname(MARCA), exist_ok=True)
        json.dump({"activo": activo, "cookies": n, "ts": int(time.time())}, open(MARCA, "w", encoding="utf-8"))
    except Exception:
        pass


def aplicar(ctx):
    """Mete las cookies en un contexto de Playwright ya abierto. -> cuántas. Silencioso si está apagado."""
    if not activado():
        return 0
    try:
        cks = leer_cookies()
    except Exception:
        return 0
    if not cks:
        return 0
    try:
        ctx.add_cookies(cks)
    except Exception:
        buenas = []
        for c in cks:
            try:
                ctx.add_cookies([c]); buenas.append(c)
            except Exception:
                pass
        cks = buenas
    return len(cks)


def encender():
    """«usa mis sesiones de chrome»: prueba leerlas y, si hay, lo deja activado para siempre. -> texto."""
    if not sys.platform.startswith("win"):
        return "Esto solo funciona en tu PC con Windows."
    try:
        cks = leer_cookies()
    except Exception as exc:
        return "No pude leer tus cookies de Chrome: %s" % exc
    if not cks:
        return ("No encontré sesiones que me sirvan en tu Chrome (¿cerraste sesión, o usas otro navegador?). "
                "También puedes hacer «conecta google» e iniciar sesión tú una vez.")
    _marcar(True, len(cks))
    dom = sorted({c["domain"].lstrip(".") for c in cks})
    return ("Ya uso tus sesiones de Chrome (%d cookies de %s). Entro a esas páginas conectado y aprendo de tu feed solo. "
            "Se quedan en tu PC. «olvida mis cookies» si no quieres que las use." % (len(cks), ", ".join(dom[:6])))


def apagar():
    _marcar(False, 0)
    return "Ya no uso tus cookies de Chrome. (No guardé ninguna; las leo de tu perfil solo cuando navego.)"
