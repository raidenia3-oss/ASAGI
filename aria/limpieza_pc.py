# -*- coding: utf-8 -*-
"""ARIA - Limpieza de lo viejo (Daniel, 17-nov-2026: «revisa las cosas viejas y bórralas para que no estorben»).

Manda a la PAPELERA (recuperable, no borrado definitivo) los archivos de ARIA_APP que ya nada usa.
La lista salió de revisar qué importa de verdad ARIA hoy (aria_main -> desktop_ui -> ui_shell -> aria_va_core)
y qué ya tiene reemplazo en lo nuevo:
  - actividad.py («0 COSAS HOY») -> tarjetas de hoy del Shell · presence.py (ocultaba ARIA) · hand_react.py (cámara)
  - escritorio.py viejo (boot/dock BrowOS) -> escritorio_pc.py (pestañas Apps/Archivos/Ventanas)
  - lanzadores y pruebas de versiones viejas (webview, Ollama, backend HTTP) que chocan con las reglas de hoy
  - copias .bak a mano y capturas de prueba
Corre UNA vez (marca en data/limpieza.json). Solo toca archivos de esta lista y solo dentro de ARIA_APP.
"""
import json
import os
import subprocess
import sys

_DIR = os.path.dirname(os.path.abspath(__file__))
MARCA = os.path.join(_DIR, "data", "limpieza.json")
VERSION = 1

VIEJOS = [
    # HUDs viejos que salían sueltos por el escritorio
    "actividad.py", "presence.py", "hand_react.py", "escritorio.py",
    # sin uso (nada los importa)
    "_aura_backend_only.py", "_diag_paths.py", "_start_aura.py", "_start_webview.py", "app_native.py", "aria_native.py",
    "aria_startup.py", "aria_va_core.CONMEMORIA.py", "auto_fix_bundle.py", "debug_perf.py", "desktop_autonomy.py",
    "desktop_tray.py", "dibujo_iterativo.py", "discord_bridge.py", "aria_discord.py", "engine_router.py",
    "entrenamiento_adaptativo.py", "entrenamiento_social.py", "hud_cyber.py", "migrar_secretos.py", "patch_fase5.py",
    "run_app.py", "sync_memoria.py", "validate_all.py", "validate_fases.py", "voz_edge.py", "voz_piper.py",
    "rollercoin_secure_setup.py",
    # copias a mano (las del actualizador, .bak_auto, se quedan: son su red de seguridad)
    "aria_va_core.py.bak", "aria_va_core.py.bak2", "aria_va_core.py.bak3", "aria_va_core.py.bak4", "aria_va_core.py.bak5",
    "aria_va_core.py.bak6", "aria_va_core.py.bak7", "aria_va_core.py.bak8",
    "desktop_ui.py.bak", "desktop_ui.py.bak2", "desktop_ui.py.bak3",
    "ui_shell.py.bak", "ui_shell.py.bak2", "ui_shell.py.bak3", "ui_shell.py.bak4", "ui_shell.py.bak5", "ui_shell.py.bak6",
    "brain_engine.py.bak", "brain_engine.py.bak2",
    # capturas y restos de pruebas
    "actividad_preview.png", "aria_ascii_preview.png", "aria_ascii_preview.txt", "aria_dither_ambar_preview.png",
    "aria_dither_gameboy_preview.png", "aria_dither_pico8_preview.png", "aria_matrix_crt_preview.png",
    "aria_matrix_sin_crt_preview.png", "escritorio_preview.png", "modos_preview.png", "nucleo_vivo_preview.png",
    "rollercoin_shot.png", "test.jpg", "debug.log",
]


def a_borrar(existentes):
    """De la lista fija, cuáles hay. Nunca rutas fuera de ARIA_APP. PURO."""
    ok = set(existentes)
    return [n for n in VIEJOS if n in ok and "/" not in n and "\\" not in n and not n.startswith("..")]


def limpiar():
    """-> cuántos fueron a la Papelera (0 si ya se hizo o no es Windows)."""
    if not sys.platform.startswith("win"):
        return 0
    try:
        if json.load(open(MARCA, encoding="utf-8")).get("version", 0) >= VERSION:
            return 0
    except Exception:
        pass
    lista = a_borrar(os.listdir(_DIR))
    try:      # si desktop_ui todavía es la versión vieja (los abre), esos 4 se quedan hasta la próxima
        dui = open(os.path.join(_DIR, "desktop_ui.py"), encoding="utf-8", errors="ignore").read()
        if "import actividad" in dui or "from presence import" in dui:
            return 0
    except OSError:
        pass
    hechos = 0
    if lista:
        rutas = ";".join(os.path.join(_DIR, n) for n in lista)
        ps = ("Add-Type -AssemblyName Microsoft.VisualBasic;$n=0;foreach($p in $env:RUTAS.Split(';')){"
              "try{[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p,'OnlyErrorDialogs','SendToRecycleBin');$n++}catch{}};Write-Output $n")
        try:
            r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], env=dict(os.environ, RUTAS=rutas),
                               timeout=120, capture_output=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            hechos = int(((r.stdout or b"0").decode().strip().split() or ["0"])[-1])
        except Exception:
            return 0
    try:
        os.makedirs(os.path.dirname(MARCA), exist_ok=True)
        json.dump({"version": VERSION, "papelera": hechos, "lista": lista}, open(MARCA, "w", encoding="utf-8"), ensure_ascii=False)
    except Exception:
        pass
    return hechos
