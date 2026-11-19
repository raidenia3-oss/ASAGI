"""ARIA — punto de entrada único (una sola app).

Abre la ventana de ARIA (chat, Apps, Archivos, Ventanas, escritorio, mascota…) en un solo proceso, sin HTTP ni servidores.
El arranque de Windows, la limpieza de lo viejo y el orden de la carpeta los maneja ARIA sola desde dentro
(arranque_pc / limpieza_pc / ordenar_pc, llamados por aria_va_core al iniciar). Ábrelo con ARIA_ABRIR.bat.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

ARIA_APP = Path(__file__).resolve().parent
PROJECT_ROOT = ARIA_APP.parent

try:
    from dotenv import load_dotenv
    load_dotenv(str(ARIA_APP / ".env"))
except Exception:
    pass

os.environ.setdefault(
    "ARIA_SYSTEM_PROMPT",
    "Eres ARIA, el asistente personal de Daniel (estilo Jarvis). Respondes en español, directo y con iniciativa.")


def _abrir_ventana():
    if str(ARIA_APP) not in sys.path:
        sys.path.insert(0, str(ARIA_APP))
    # En Windows, importar llama_cpp ANTES que PyQt5 evita un choque de DLLs (basta el import, sin crear el modelo).
    try:
        import llama_cpp  # noqa: F401
        print("[ARIA] llama_cpp pre-importado", flush=True)
    except Exception as e:
        print("[ARIA] sin llama_cpp local: %s" % e, flush=True)
    # Para que la detección de modo «empaquetado» funcione dentro del .exe
    sys.frozen = True
    if not hasattr(sys, "_MEIPASS"):
        sys._MEIPASS = str(ARIA_APP)
    from desktop_ui import run_desktop
    run_desktop()


def main():
    print("[ARIA] Una sola app — sin HTTP, sin servidores", flush=True)
    if str(ARIA_APP) not in sys.path:
        sys.path.insert(0, str(ARIA_APP))

    # Dos procesos del mismo programa: uno piensa (lógica), el otro muestra la ventana. Un solo ejecutable, sin puertos.
    if "ARIA_LOGIC_PROCESS" in os.environ:
        import aria_logic_engine
        aria_logic_engine.main()
        return
    os.environ["ARIA_LOGIC_PROCESS"] = "1"

    inicio = time.time()
    _abrir_ventana()
    print("[ARIA] Cerró tras %.1fs" % (time.time() - inicio), flush=True)


if __name__ == "__main__":
    main()
