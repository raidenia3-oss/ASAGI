"""ARIA - Pedirle trabajos a Claude Code (el agente de programación) cuando algo le queda grande.

  «claude: arregla el error que sale al abrir el correo»
  «pídele a claude que agregue una sección de reseñas a la web pollería»
  «conecta claude»                -> instala Claude Code si falta y abre su login (una vez)
  «activa revisión de claude»     -> abre Claude Code para conectar GitHub (revisión automática de ASAGI)

Claude trabaja SOLO dentro de la carpeta de ARIA y solo puede leer y editar archivos (no ejecuta comandos).
Gasta el plan de Claude de Daniel. Lo que Claude cambie en archivos de ARIA lo puede revisar con «deshaz claude».
"""
import os
import re
import shutil
import subprocess
import time

BASE = os.path.dirname(os.path.abspath(__file__))
_FLAGS = 0x08000000 if os.name == "nt" else 0
_NUEVA = 0x00000010                                       # CREATE_NEW_CONSOLE: ventana que Daniel ve y cierra
HERRAMIENTAS = "Read,Edit,Write,Glob,Grep"                # sin Bash: no ejecuta nada en la PC
RESPALDO = os.path.join(BASE, "data", "claude_respaldo")


def parsear(t):
    """PURO."""
    s = str(t or "").strip()
    n = re.sub(r"[¿?¡!.]", "", s.lower()).strip()
    if n in ("conecta claude", "instala claude", "conecta claude code", "instala claude code"):
        return {"accion": "conectar"}
    if n in ("activa revision de claude", "activa revisión de claude", "activa la revision de claude", "activa la revisión de claude"):
        return {"accion": "revision"}
    if n in ("deshaz claude", "deshaz lo de claude", "revierte claude"):
        return {"accion": "deshacer"}
    m = re.match(r"^(?:claude|claude code)\s*[:,]\s*(.{4,2000})$", s, re.I) or \
        re.match(r"^p[ií]dele a claude(?: code)?\s+(?:que\s+)?(.{4,2000})$", s, re.I)
    return {"accion": "tarea", "tarea": m.group(1).strip()} if m else None


def ruta_claude():
    cands = [shutil.which("claude"), os.path.join(os.path.expanduser("~"), ".local", "bin", "claude.exe"),
             os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "claude", "claude.exe")]
    for p in cands:
        if p and os.path.exists(p):
            return p
    return None


def conectar():
    """Instala (instalador oficial) si falta y abre una ventana con el login de Claude Code."""
    c = ruta_claude()
    if c:
        cmd = '"%s" & echo. & echo Si ya iniciaste sesion, escribe /exit y cierra esta ventana. & pause' % c
    else:
        cmd = ('curl -fsSL https://claude.ai/install.cmd -o "%TEMP%\\install-claude.cmd" && "%TEMP%\\install-claude.cmd" '
               '&& del "%TEMP%\\install-claude.cmd" & "%USERPROFILE%\\.local\\bin\\claude.exe" & pause')
    subprocess.Popen(["cmd", "/c", cmd], creationflags=_NUEVA, cwd=BASE)
    return "🔑 Abrí una ventana: %s inicia sesión con tu cuenta de Claude (se abre el navegador) y luego ciérrala." % (
        "" if c else "instalo Claude Code y")


def activar_revision():
    """Abre Claude Code dentro de una copia de ASAGI con /install-github-app (pone el secreto y el app de GitHub)."""
    c = ruta_claude()
    if not c:
        return "Primero di «conecta claude»."
    gh = shutil.which("gh") or r"C:\Program Files\GitHub CLI\gh.exe"
    copia = os.path.join(BASE, "data", "asagi_repo")
    if not os.path.isdir(os.path.join(copia, ".git")):
        if not os.path.exists(gh):
            return "Necesito GitHub CLI conectado: di «publica la web …» una vez o instala GitHub CLI."
        r = subprocess.run([gh, "repo", "clone", "raidenia3-oss/ASAGI", copia, "--", "--depth", "1"],
                           capture_output=True, text=True, timeout=300, creationflags=_FLAGS)
        if r.returncode != 0:
            return "⚠ No pude bajar ASAGI: %s" % (r.stderr or r.stdout)[-200:]
    subprocess.Popen(["cmd", "/c", '"%s" "/install-github-app"' % c], creationflags=_NUEVA, cwd=copia)
    return ("🔑 Abrí Claude Code en una ventana con /install-github-app: elige el repo ASAGI, tu suscripción (token largo) "
            "y acepta. Así cada cambio en ASAGI se revisa solo y si hay un error serio te aparece un aviso en GitHub.")


def _respaldar():
    """Copia de los .py/.js/.json/.bat de ARIA antes de que Claude toque algo (para «deshaz claude»)."""
    if os.path.isdir(RESPALDO):
        shutil.rmtree(RESPALDO, ignore_errors=True)
    for raiz, dirs, archivos in os.walk(BASE):
        dirs[:] = [d for d in dirs if d not in ("data", "logs", "__pycache__", ".git", "sitios_publicados")] if raiz == BASE else \
                  [d for d in dirs if d != "__pycache__"]
        for a in archivos:
            if a.endswith((".py", ".js", ".json", ".bat", ".html", ".css", ".md")):
                src = os.path.join(raiz, a)
                dst = os.path.join(RESPALDO, os.path.relpath(src, BASE))
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(src, dst)


def deshacer():
    if not os.path.isdir(RESPALDO):
        return "No hay nada de Claude que deshacer."
    n = 0
    for raiz, _, archivos in os.walk(RESPALDO):
        for a in archivos:
            src = os.path.join(raiz, a)
            dst = os.path.join(BASE, os.path.relpath(src, RESPALDO))
            try:
                with open(src, "rb") as f1, open(dst, "rb") as f2:
                    if f1.read() == f2.read():
                        continue
            except FileNotFoundError:
                pass
            shutil.copy2(src, dst)
            n += 1
    return "↩ Restauré %d archivo(s) a como estaban antes del último trabajo de Claude." % n


def tarea(texto, timeout=900):
    """Corre Claude Code sin ventana (-p) dentro de la carpeta de ARIA. Devuelve su respuesta."""
    c = ruta_claude()
    if not c:
        return "Aún no tengo Claude Code. Di «conecta claude»."
    _respaldar()
    instruccion = (texto + "\n\nReglas: trabaja solo dentro de esta carpeta (ARIA). Sigue CLAUDE.md o AGENTS.md si existen. "
                   "Sin dependencias nuevas, sin servidores HTTP. Si algo es código de ataque u ofensivo, no lo toques. "
                   "Al final resume en español, en pocas líneas, qué cambiaste y en qué archivos.")
    t0 = time.time()
    r = subprocess.run([c, "-p", instruccion, "--permission-mode", "acceptEdits", "--allowedTools", HERRAMIENTAS,
                        "--max-turns", "30", "--output-format", "text"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout,
                       creationflags=_FLAGS, cwd=BASE)
    salida = (r.stdout or "").strip() or (r.stderr or "").strip()
    if r.returncode != 0 and re.search(r"log ?in|auth|credential|/login", salida, re.I):
        return "🔑 Claude Code no tiene sesión iniciada. Di «conecta claude»."
    return "🤖 Claude (%d s):\n%s\n\nSi no te gusta, di «deshaz claude»." % (time.time() - t0, salida[-3500:] or "(sin respuesta)")


def ejecutar(o):
    if o["accion"] == "conectar":
        return conectar()
    if o["accion"] == "revision":
        return activar_revision()
    if o["accion"] == "deshacer":
        return deshacer()
    return tarea(o["tarea"])
