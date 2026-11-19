# -*- coding: utf-8 -*-
"""ARIA - Navegador propio (perfil dedicado de Chromium).

Lanza un Chromium con perfil propio en data/browser_profile y puerto de
depuracion remota, para que ARIA pueda abrir URLs y extraer cookies sin tocar
el navegador del usuario. Usa solo stdlib + websocket-client (ya instalado).
"""
import json
import os
import subprocess
import time
import urllib.request

_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
PROFILE = os.path.join(_DIR, "browser_profile")
PORT = 9333
PIDFILE = os.path.join(_DIR, "browser.pid")

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"


def binario():
    if os.path.isfile(CHROME):
        return CHROME
    if os.path.isfile(EDGE):
        return EDGE
    return None


def abierto():
    try:
        urllib.request.urlopen("http://127.0.0.1:%d/json/version" % PORT, timeout=1)
        return True
    except Exception:
        return False


def abrir():
    if abierto():
        return True
    exe = binario()
    if not exe:
        return False
    os.makedirs(PROFILE, exist_ok=True)
    os.makedirs(_DIR, exist_ok=True)
    proc = subprocess.Popen(
        [exe, "--user-data-dir=%s" % PROFILE, "--remote-debugging-port=%d" % PORT,
         "--no-first-run", "--no-default-browser-check", "--new-window"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    with open(PIDFILE, "w", encoding="utf-8") as f:
        f.write(str(proc.pid))
    for _ in range(50):
        if abierto():
            return True
        time.sleep(0.2)
    return False


def _linea_de_comando(pid):
    """Línea de comando del proceso (para saber si de verdad es el Chrome de ARIA)."""
    try:
        import psutil
        return " ".join(psutil.Process(pid).cmdline())
    except Exception:
        pass
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command",
                              "(Get-CimInstance Win32_Process -Filter 'ProcessId=%d').CommandLine" % int(pid)],
                             capture_output=True, text=True, timeout=8)
        return out.stdout or ""
    except Exception:
        return ""


def es_mio(pid):
    """True solo si el PID es un Chrome/Edge lanzado con el perfil de ARIA. PURO salvo la consulta."""
    cmd = _linea_de_comando(pid).lower()
    return bool(cmd) and os.path.normcase(PROFILE).lower() in os.path.normcase(cmd).lower()


def cerrar():
    """Cierra SOLO el navegador de ARIA. Antes hacía taskkill /T /F al PID guardado aunque ya no fuera
    el suyo: si Windows había reutilizado ese número, podía matar tu Chrome, VS Code u otra ventana."""
    if os.path.isfile(PIDFILE):
        try:
            pid = int(open(PIDFILE, encoding="utf-8").read().strip())
            if es_mio(pid):
                subprocess.run(["taskkill", "/PID", str(pid), "/T"],      # sin /F: cierre normal
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
        try:
            os.remove(PIDFILE)
        except OSError:
            pass


def abrir_url(url):
    if not abierto() and not abrir():
        return False
    try:
        urllib.request.urlopen("http://127.0.0.1:%d/json/new?%s" % (PORT, url), timeout=5)
        return True
    except Exception:
        return False


def exportar_cookies(destino, vault=None):
    if not abierto() and not abrir():
        return False
    try:
        import websocket
        info = json.load(urllib.request.urlopen(
            "http://127.0.0.1:%d/json/version" % PORT, timeout=5))
        ws = websocket.create_connection(info["webSocketDebuggerUrl"], timeout=10)
        ws.send(json.dumps({"id": 1, "method": "Network.getAllCookies"}))
        resp = json.loads(ws.recv())
        ws.close()
        cookies = resp.get("result", {}).get("cookies", [])
    except Exception:
        return False
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "w", encoding="utf-8") as f:
        f.write("# Netscape HTTP Cookie File\n")
        for c in cookies:
            domain = c.get("domain", "")
            flag = "TRUE" if domain.startswith(".") else "FALSE"
            secure = "TRUE" if c.get("secure") else "FALSE"
            expires = int(c.get("expires", 0) or 0)
            f.write("%s\t%s\t%s\t%s\t%d\t%s\t%s\n" % (
                domain, flag, c.get("path", "/"), secure, expires,
                c.get("name", ""), c.get("value", "")))
    if vault is not None and getattr(vault, "abierta", lambda: False)():
        try:
            import reel_analyzer
            reel_analyzer.importar_cookies(vault, destino)
        except Exception:
            pass
        try:
            os.remove(destino)
        except OSError:
            pass
    return True
