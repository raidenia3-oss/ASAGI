# -*- coding: utf-8 -*-
"""ARIA - «componentes»: todo lo que ARIA tiene cargado, a la vista (idea Linux From Scratch:
saber y controlar cada pieza de tu sistema).

  componentes          -> resumen: módulos propios cargados, librerías, modelos, datos y funciones
  componentes datos    -> cada archivo de data/ con su tamaño
Solo lee: no cambia nada. Lo que arma el texto es PURO.
"""
import importlib.util
import os
import sys
import time

_DIR = os.path.dirname(os.path.abspath(__file__))
LIBRERIAS = [("PyQt5", "ventana"), ("pyttsx3", "voz"), ("comtypes", "manos en la PC"), ("llama_cpp", "modelo local"),
             ("fastembed", "memoria por significado"), ("sqlite_vec", "memoria vectorial"), ("PIL", "capturas"),
             ("bluetooth", "Bluetooth (pybluez)")]


def _tam(n):
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024 or u == "GB":
            return ("%d %s" % (n, u)) if u == "B" else ("%.1f %s" % (n, u))
        n /= 1024.0


def modulos_propios(modulos=None, raiz=_DIR):
    """Módulos de ARIA_APP que están cargados ahora. PURO sobre el dict dado."""
    modulos = sys.modules if modulos is None else modulos
    out = []
    for nombre, m in list(modulos.items()):
        f = getattr(m, "__file__", None) or ""
        if f and os.path.abspath(f).startswith(raiz) and "__pycache__" not in f:
            out.append(nombre)
    return sorted(out)


def librerias(buscar=importlib.util.find_spec):
    out = []
    for nombre, para in LIBRERIAS:
        try:
            ok = buscar(nombre) is not None
        except (ImportError, ValueError):
            ok = False
        out.append((nombre, para, ok))
    return out


def archivos(carpeta, exts=None):
    out = []
    if not os.path.isdir(carpeta):
        return out
    for raiz, _d, fs in os.walk(carpeta):
        for f in fs:
            if exts and not f.lower().endswith(exts):
                continue
            p = os.path.join(raiz, f)
            try:
                out.append((os.path.relpath(p, carpeta), os.path.getsize(p)))
            except OSError:
                pass
    return sorted(out, key=lambda x: -x[1])


def _contar_json(ruta, clave=None):
    try:
        import json
        with open(ruta, encoding="utf-8") as f:
            d = json.load(f)
        return len(d.get(clave, [])) if clave and isinstance(d, dict) else len(d)
    except Exception:
        return 0


def funciones(raiz=_DIR):
    """Estado de cada función de ARIA según sus archivos. PURO salvo lecturas."""
    d = os.path.join(raiz, "data")
    kilo = os.path.join(os.path.dirname(raiz), ".kilo", "kilo.json")
    try:
        mcp = "aria_mcp.py" in open(kilo, encoding="utf-8").read()
    except OSError:
        mcp = False
    return [
        ("Bots programados", "%d" % _contar_json(os.path.join(d, "bots_agenda.json"))),
        ("Recuerdos de Daniel", "%d" % _contar_json(os.path.join(d, "recuerdos.json"))),
        ("Rutinas enseñadas", "%d" % _contar_json(os.path.join(d, "rutinas.json"))),
        ("Informes y mapas", "%d" % len(archivos(os.path.join(d, "informes")))),
        ("Enlace con ASAGI", "emparejado" if os.path.exists(os.path.join(raiz, ".aria_lan_clave")) else "sin emparejar"),
        ("Nivel de ASAGI recibido", "sí" if os.path.exists(os.path.join(d, "asagi_nivel.json")) else "no"),
        ("MCP para Kilo", "registrado" if mcp else "no registrado"),
        ("Mascota que ve tu pantalla", "lista" if os.path.exists(os.path.join(raiz, "ui", "mascota_vision.py"))
         else "PENDIENTE: la hace Kilo cuando apruebes el avatar (KILO_PROMPT.md)"),
    ]


def reporte(mods, libs, modelos, datos, funcs):
    """Texto para el chat. PURO."""
    lin = ["Componentes de ARIA · %s" % time.strftime("%d/%m %H:%M"), ""]
    lin.append("Funciones:")
    lin += ["  · %s: %s" % f for f in funcs]
    lin.append("")
    lin.append("Librerías:")
    lin += ["  %s %s — %s" % ("✓" if ok else "✗", n, para) for n, para, ok in libs]
    lin.append("")
    lin.append("Modelos (%d, %s):" % (len(modelos), _tam(sum(t for _, t in modelos))))
    lin += ["  · %s (%s)" % (n, _tam(t)) for n, t in modelos[:6]] or ["  (ninguno en models/)"]
    lin.append("")
    lin.append("Datos: %d archivos, %s. «componentes datos» los lista." % (len(datos), _tam(sum(t for _, t in datos))))
    lin.append("Módulos propios cargados ahora (%d): %s" % (len(mods), ", ".join(mods[:40]) + (" …" if len(mods) > 40 else "")))
    return "\n".join(lin)


def manejar(texto, raiz=_DIR):
    t = (texto or "").strip().lower().lstrip("/")
    if t in ("componentes", "sistema", "que tienes cargado", "qué tienes cargado"):
        return reporte(modulos_propios(raiz=raiz), librerias(),
                       archivos(os.path.join(raiz, "models"), (".gguf", ".bin", ".onnx", ".safetensors")),
                       archivos(os.path.join(raiz, "data")), funciones(raiz))
    if t in ("componentes datos", "sistema datos"):
        ds = archivos(os.path.join(raiz, "data"))
        return "data/ (%d):\n" % len(ds) + "\n".join("  %s  %s" % (_tam(s).rjust(9), n) for n, s in ds[:60])
    return None
