"""ARIA - Instala sola los extras de voz (sin que Daniel haga nada a mano).

Extras aprobados por Daniel: faster-whisper (dictado y oído sin internet) y piper-tts (voz natural).
Se instalan una vez, en segundo plano, con el pip del mismo .venv de ARIA. Si algo falla, ARIA sigue
con lo de siempre (pyttsx3 / sin dictado) y lo reintenta al día siguiente.
También baja la voz de Piper (es_MX «claude», femenina) a data/voces.
"""
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
ESTADO = os.path.join(DATA, "extras_estado.json")
VOCES = os.path.join(DATA, "voces")

PAQUETES = {"faster_whisper": "faster-whisper", "piper": "piper-tts"}
VOZ = os.environ.get("ARIA_VOZ_PIPER", "es_MX-claude-high")
_HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
_lock = threading.Lock()


def _voz_url(nombre):
    """es_MX-claude-high -> es/es_MX/claude/high/es_MX-claude-high. PURO."""
    loc, quien, cal = nombre.split("-", 2)
    return _HF + "%s/%s/%s/%s/%s" % (loc.split("_")[0], loc, quien, cal, nombre)


def ruta_voz(nombre=VOZ):
    return os.path.join(VOCES, nombre + ".onnx")


def _hay(modulo):
    try:
        __import__(modulo)
        return True
    except Exception:
        return False


def _python():
    """El python.exe del venv (pythonw no muestra errores de pip)."""
    d = os.path.dirname(sys.executable)
    for n in ("python.exe", "python3", "python"):
        p = os.path.join(d, n)
        if os.path.exists(p):
            return p
    return sys.executable


def _leer():
    try:
        with open(ESTADO, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _guardar(e):
    os.makedirs(DATA, exist_ok=True)
    with open(ESTADO, "w", encoding="utf-8") as f:
        json.dump(e, f)


def faltan():
    return [pip for mod, pip in PAQUETES.items() if not _hay(mod)] + ([] if os.path.exists(ruta_voz()) else ["voz:" + VOZ])


def _pip(paquete):
    flags = 0x08000000 if os.name == "nt" else 0          # CREATE_NO_WINDOW: sin ventanas negras
    r = subprocess.run([_python(), "-m", "pip", "install", "--disable-pip-version-check", "--no-input", paquete],
                       capture_output=True, text=True, timeout=1800, creationflags=flags)
    return r.returncode == 0, (r.stderr or r.stdout or "")[-400:]


def _bajar_voz(nombre=VOZ):
    os.makedirs(VOCES, exist_ok=True)
    for ext in (".onnx.json", ".onnx"):
        dest = os.path.join(VOCES, nombre + ext)
        if os.path.exists(dest):
            continue
        tmp = dest + ".part"
        req = urllib.request.Request(_voz_url(nombre) + ext, headers={"User-Agent": "ARIA/1.0"})
        with urllib.request.urlopen(req, timeout=60) as f, open(tmp, "wb") as g:
            while True:
                b = f.read(1 << 20)
                if not b:
                    break
                g.write(b)
        os.replace(tmp, dest)


def instalar(avisar=None, forzar=False):
    """Instala lo que falte. Bloqueante (llamar en un hilo). Devuelve lista de lo que quedó pendiente."""
    with _lock:
        e = _leer()
        if not forzar and e.get("ultimo_fallo", 0) > time.time() - 24 * 3600 and faltan():
            return faltan()                                   # falló hace poco: no insistir hoy
        pendientes = faltan()
        if not pendientes:
            return []
        if avisar:
            avisar("🧩 Instalando mis mejoras de voz (dictado y voz natural). Tardo unos minutos, sigo funcionando.")
        errores = []
        for mod, pip in PAQUETES.items():
            if not _hay(mod):
                ok, log = _pip(pip)
                if not ok:
                    errores.append("%s: %s" % (pip, log.strip().splitlines()[-1] if log.strip() else "error"))
        try:
            _bajar_voz()
        except Exception as exc:
            errores.append("voz: %s" % exc)
        import importlib
        importlib.invalidate_caches()
        e["ultimo_fallo"] = time.time() if errores else 0
        e["errores"] = errores
        _guardar(e)
        if avisar:
            avisar("🧩 Listo: ya tengo dictado (Ctrl+Alt+Espacio) y voz natural." if not errores and not faltan()
                   else "🧩 No pude instalar todo (%s). Reintento mañana." % "; ".join(errores)[:300])
        return faltan()


def en_fondo(avisar=None):
    if os.environ.get("ARIA_SIN_EXTRAS") == "1" or not faltan():
        return False
    threading.Thread(target=instalar, args=(avisar,), daemon=True, name="aria-extras").start()
    return True
