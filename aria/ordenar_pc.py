# -*- coding: utf-8 -*-
"""ARIA - Ordenar la carpeta AURA (Daniel, 18-nov-2026: «unificar todo en uno solo, que no esté desordenado»).

La carpeta AURA tenía ~400 cosas sueltas de versiones viejas (v4, v5, v6, AURA OS, backends, logs, parches, pruebas).
ARIA hoy solo necesita: ARIA_APP (ella misma), .venv (su Python) y poco más. Esto MUEVE (no borra) lo demás a
    AURA\\_archivo_viejo\\basura\\     -> logs, salidas de pruebas, parches de un uso, copias .bak, archivos con nombre roto
    AURA\\_archivo_viejo\\proyectos\\  -> versiones y proyectos viejos (por si quieres algo de ahí)
y deja un índice QUE_HAY_AQUI.md con de dónde salió cada cosa. Dentro de ARIA_APP, los informes .md sueltos van a
ARIA_APP\\docs y las pruebas/restos a la basura del archivo.
No toca: ARIA_APP, .venv, asagi, git, configuraciones de tus editores ni tus claves (.env*, credentials, api_keys, secure_vault).
Borrar de verdad la «basura» SOLO con confirmación de Daniel (regla 9): «borra la basura vieja» -> «sí, bórrala».
Restaurar: «restaura <nombre>». Corre UNA vez (marca en data/orden.json).
"""
import json
import os
import re
import shutil
import subprocess
import sys
import time

_DIR = os.path.dirname(os.path.abspath(__file__))            # ...\AURA\ARIA_APP
AURA = os.path.dirname(_DIR)
ARCHIVO = os.path.join(AURA, "_archivo_viejo")
MARCA = os.path.join(_DIR, "data", "orden.json")
VERSION = 1

QUEDAN = {"ARIA_APP", ".venv", "dist", "asagi", "_archivo_viejo", ".git", ".gitignore", ".gitmodules", ".github",
          ".vscode", ".kilo", ".kilocode", ".env", ".env.ai", ".env.cloud", "credentials", "api_keys", "secure_vault",
          "README.md", "AGENTS.md", "cookies_copy"}
_BASURA = re.compile(
    r"(^_|\.log$|\.bak\d*$|\.bak_|^nul$|^cusers|^test_|^tests?_.*\.txt$|^patch|^fix|^debug_|^show\d*\.py$|^gen(_|\.py$)|^wire_|"
    r"^write_|^b\d+_|^tsc_|^suite|^linting_|^godot_check|^routes\d*\.txt$|^untitled-|^report\d*\.txt$|^tmp_|^imp_test|"
    r"^h\.txt$|^out\.txt$|^err\.|^full_out|^gate_out|^diffcheck|^main_(sync_)?check|^baseline_tests|^healing_check|"
    r"^profile_.*\.txt$|^memory_leaks|^scan_out|^tunnel_(err|url)|^organic_resp|^research_resp|^macro_payload|"
    r"^daemon_paths|^npmtest|^pytest_|^frontend_dev|^backend_.*\.log$|^coleccion|^permisos|^entorno|^git_(log|status)|"
    r"^test\d*\.(txt|db)$|^check(_\w+)?\.py$|^clean\d*\.py$|^do_patch|^prepend_stubs|^remove_header|^create_files|"
    r"^find_conflicts|^inspect_db|^limpiar_basura|^scan_aria|^verify_|^code_quality_report|^verification_report|"
    r"^media_(extract|transcript)_result|^winget_install|^aria_(stderr|stdout)|^aura_(stderr|stdout)|\.png$)", re.I)

# Dentro de ARIA_APP
APP_A_DOCS = ["AUDITORIA_SERVIDORES.md", "ERRORES_REPLICADOS.md", "IDEAS_NOCHE.md", "MEJORAS_REFERENCIAS.md",
              "REFERENCIAS.md", "WAKEWORD_ESTADO.md", "github_research_report.md"]
APP_A_BASURA_RE = re.compile(r"^(test_\w+\.py|training_data\.jsonl|rollercoin_games_full\.txt|asagi\.apk|aura\.spec|"
                             r"CONECTAR_ROLLERCOIN\.bat|PROBAR_REAL\.bat|prueba_real\.py|ARIA_PROBAR_NAVEGADOR\.bat)$", re.I)


def clasificar(nombre, es_dir=False):
    """'quedan' | 'basura' | 'proyectos' para algo suelto en AURA. PURO."""
    if nombre in QUEDAN or nombre.lower() in {q.lower() for q in QUEDAN}:
        return "quedan"
    if not es_dir and _BASURA.search(nombre):
        return "basura"
    if es_dir and nombre.lower() in ("__pycache__", ".mypy_cache", ".pytest_cache", ".scratch", "_dbg_story", "_dbg_sync",
                                      "cusersuserdownloadsaurabackend", "build", "logs", ".playwright-mcp"):
        return "basura"
    if es_dir and nombre.lower().startswith("cusers"):
        return "basura"
    return "proyectos"


def plan(nombres_aura, nombres_app):
    """[(nombre, es_dir)] de AURA y de ARIA_APP -> lista de movimientos [(origen_rel, destino_rel)]. PURO."""
    mov = []
    for n, d in nombres_aura:
        c = clasificar(n, d)
        if c != "quedan":
            mov.append((n, os.path.join("_archivo_viejo", c, n)))
    for n, d in nombres_app:
        if d:
            continue
        if n in APP_A_DOCS:
            mov.append((os.path.join("ARIA_APP", n), os.path.join("ARIA_APP", "docs", n)))
        elif APP_A_BASURA_RE.match(n):
            mov.append((os.path.join("ARIA_APP", n), os.path.join("_archivo_viejo", "basura", "ARIA_APP", n)))
    return mov


def _largo(p):
    """Rutas «\\\\?\\» para nombres raros de Windows (como «nul»)."""
    return ("\\\\?\\" + os.path.abspath(p)) if sys.platform.startswith("win") else p


def ordenar():
    """Mueve según el plan. -> (movidos, fallidos). Solo Windows, una vez."""
    if not sys.platform.startswith("win"):
        return 0, 0
    try:
        if json.load(open(MARCA, encoding="utf-8")).get("version", 0) >= VERSION:
            return 0, 0
    except Exception:
        pass
    aura = [(n, os.path.isdir(os.path.join(AURA, n))) for n in os.listdir(AURA)]
    app = [(n, os.path.isdir(os.path.join(_DIR, n))) for n in os.listdir(_DIR)]
    movs, hechos, fallos = plan(aura, app), [], []
    for o, d in movs:
        src, dst = os.path.join(AURA, o), os.path.join(AURA, d)
        try:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if os.path.exists(dst):
                dst = dst + "_" + time.strftime("%H%M%S")
            try:
                os.replace(_largo(src), _largo(dst))
            except OSError:
                shutil.move(src, dst)
            hechos.append((o, os.path.relpath(dst, AURA)))
        except Exception as exc:
            fallos.append((o, str(exc)[:80]))
    try:
        os.makedirs(ARCHIVO, exist_ok=True)
        with open(os.path.join(ARCHIVO, "QUE_HAY_AQUI.md"), "a", encoding="utf-8") as f:
            f.write("# Archivo viejo de AURA (ordenado por ARIA el %s)\n\n" % time.strftime("%d-%m-%Y %H:%M"))
            f.write("Nada se borró: solo se movió aquí. «restaura <nombre>» en ARIA lo devuelve a su sitio.\n")
            f.write("- basura/: logs, pruebas, parches de un uso, copias .bak (se puede borrar con «borra la basura vieja»).\n")
            f.write("- proyectos/: versiones y proyectos viejos (v4, v5, v6, AURA OS, backends…).\n\n")
            for o, d in hechos:
                f.write("- `%s` -> `%s`\n" % (o, d))
            if fallos:
                f.write("\nNo se pudieron mover (en uso o protegidos):\n")
                for o, e in fallos:
                    f.write("- `%s`: %s\n" % (o, e))
        os.makedirs(os.path.dirname(MARCA), exist_ok=True)
        json.dump({"version": VERSION, "ts": int(time.time()), "movidos": hechos, "fallidos": fallos},
                  open(MARCA, "w", encoding="utf-8"), ensure_ascii=False)
    except Exception:
        pass
    return len(hechos), len(fallos)


def resumen():
    try:
        d = json.load(open(MARCA, encoding="utf-8"))
    except Exception:
        return "Aún no ordené la carpeta AURA."
    mov = d.get("movidos") or []
    b = sum(1 for _, x in mov if "basura" in x)
    p = sum(1 for _, x in mov if "proyectos" in x)
    dc = sum(1 for _, x in mov if x.startswith("ARIA_APP"))
    return ("🗂 Ordené AURA: %d cosas a _archivo_viejo\\basura, %d a _archivo_viejo\\proyectos y %d informes a ARIA_APP\\docs. "
            "Nada se borró. «restaura <nombre>» lo devuelve · «borra la basura vieja» la manda a la Papelera (te pido confirmación)." % (b, p, dc))


def restaurar(nombre):
    try:
        d = json.load(open(MARCA, encoding="utf-8"))
    except Exception:
        return "No tengo nada archivado."
    for o, x in d.get("movidos") or []:
        if os.path.basename(o).lower() == nombre.strip().lower():
            src, dst = os.path.join(AURA, x), os.path.join(AURA, o)
            if os.path.exists(dst):
                return "Ya existe «%s» en su sitio; no lo piso." % o
            try:
                os.replace(_largo(src), _largo(dst))
                return "Listo: «%s» volvió a %s." % (os.path.basename(o), os.path.dirname(dst) or AURA)
            except Exception as exc:
                return "No pude devolverlo: %s" % exc
    return "No encontré «%s» en el archivo viejo (mira _archivo_viejo\\QUE_HAY_AQUI.md)." % nombre


def borrar_basura():
    """A la Papelera (recuperable). SOLO después de que Daniel confirme."""
    if not sys.platform.startswith("win"):
        return "Solo en Windows."
    b = os.path.join(ARCHIVO, "basura")
    if not os.path.isdir(b):
        return "No hay basura archivada."
    ps = ("Add-Type -AssemblyName Microsoft.VisualBasic;try{[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($env:B,'OnlyErrorDialogs','SendToRecycleBin');"
          "Write-Output OK}catch{Write-Output ('ERR '+$_.Exception.Message)}")
    r = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], env=dict(os.environ, B=b), timeout=600,
                       capture_output=True, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    out = (r.stdout or b"").decode("utf-8", "ignore").strip()
    return "🗑 La basura vieja se fue a la Papelera (se puede recuperar desde ahí)." if out.startswith("OK") else "No pude: %s" % out[:120]
