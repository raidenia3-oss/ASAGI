"""ARIA - Publicar una web del taller en internet (GitHub Pages de tu cuenta), solo si lo confirmas.

Flujo: «publica la web pollería» -> ARIA avisa que quedará PÚBLICA y pide «confirmo publicar pollería».
Usa GitHub CLI (gh). Si no está, lo instala con winget. Si no estás conectado, abre una ventana donde
GitHub te muestra un código y apruebas en el navegador (como el botón de Google): sin copiar tokens.
Cada web va a su propio repositorio público «web-<nombre>» y queda en https://<usuario>.github.io/web-<nombre>/.
Ojo: GitHub Pages es para demos y sitios personales; para webs de negocios conviene otro hosting más adelante.
"""
import base64
import json
import os
import shutil
import subprocess
import time

_FLAGS = 0x08000000 if os.name == "nt" else 0           # sin ventanas negras
PENDIENTE = {}                                           # slug -> hora en que se pidió (confirmación vale 10 min)


def gh():
    for p in (shutil.which("gh"), r"C:\Program Files\GitHub CLI\gh.exe",
              os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "GitHub CLI", "gh.exe")):
        if p and os.path.exists(p):
            return p
    return None


def _run(args, entrada=None, timeout=120):
    r = subprocess.run([gh()] + args, input=entrada, capture_output=True, text=True, timeout=timeout, creationflags=_FLAGS)
    return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()


def instalar_gh():
    """winget instala GitHub CLI (programa oficial de GitHub)."""
    w = shutil.which("winget")
    if not w:
        raise RuntimeError("no tengo winget para instalar GitHub CLI")
    r = subprocess.run([w, "install", "--id", "GitHub.cli", "-e", "--silent", "--accept-package-agreements",
                        "--accept-source-agreements"], capture_output=True, text=True, timeout=900, creationflags=_FLAGS)
    if not gh():
        raise RuntimeError("no pude instalar GitHub CLI: %s" % (r.stdout or r.stderr)[-200:])


def conectado():
    return bool(gh()) and _run(["auth", "status", "-h", "github.com"])[0] == 0


def abrir_login():
    """Ventana visible con el login web de GitHub (muestra un código; apruebas en el navegador)."""
    cmd = '"%s" auth login --web -h github.com -p https --skip-ssh-key & echo. & echo Listo, ya puedes cerrar esta ventana. & pause' % gh()
    subprocess.Popen(["cmd", "/c", cmd], creationflags=0x00000010)   # CREATE_NEW_CONSOLE: la ves y la cierras tú


def usuario():
    c, out, err = _run(["api", "user", "-q", ".login"])
    if c != 0 or not out:
        raise RuntimeError("no pude leer tu usuario de GitHub: %s" % err[-200:])
    return out


def _subir(repo, ruta_rel, contenido_bytes, mensaje):
    c, out, _ = _run(["api", "repos/%s/contents/%s" % (repo, ruta_rel), "-q", ".sha"])
    cuerpo = {"message": mensaje, "content": base64.b64encode(contenido_bytes).decode()}
    if c == 0 and out:
        cuerpo["sha"] = out                                   # actualizar un archivo que ya existe
    c, out, err = _run(["api", "-X", "PUT", "repos/%s/contents/%s" % (repo, ruta_rel), "--input", "-"], entrada=json.dumps(cuerpo))
    if c != 0:
        raise RuntimeError("no pude subir %s: %s" % (ruta_rel, err[-200:]))


def publicar(carpeta_web, slug):
    """Sube index.html (y nada privado) y activa Pages. Devuelve la URL pública."""
    if not gh():
        instalar_gh()
    if not conectado():
        abrir_login()
        raise PermissionError("abrí una ventana para conectar tu GitHub: aprueba el código en el navegador y vuelve a decir «confirmo publicar %s»" % slug)
    yo = usuario()
    nombre = "web-" + slug
    repo = "%s/%s" % (yo, nombre)
    if _run(["api", "repos/" + repo])[0] != 0:
        c, _, err = _run(["repo", "create", nombre, "--public", "--description", "Web hecha con ARIA"])
        if c != 0:
            raise RuntimeError("no pude crear el repositorio: %s" % err[-200:])
        time.sleep(2)
    with open(os.path.join(carpeta_web, "index.html"), "rb") as f:
        _subir(repo, "index.html", f.read(), "ARIA: publica la web")
    # Pages desde la rama principal (si ya estaba activo, GitHub responde 409 y está bien)
    _run(["api", "-X", "POST", "repos/%s/pages" % repo, "--input", "-"], entrada=json.dumps({"source": {"branch": "main", "path": "/"}}))
    url = "https://%s.github.io/%s/" % (yo.lower(), nombre)
    j = os.path.join(carpeta_web, "contenido.json")
    try:
        with open(j, encoding="utf-8") as f:
            d = json.load(f)
        d["url"], d["repo"] = url, repo
        with open(j, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
    except Exception:
        pass
    return url


def pedir(slug):
    PENDIENTE[slug] = time.time()


def confirmado(slug):
    t = PENDIENTE.get(slug)
    if t and time.time() - t < 600:
        PENDIENTE.pop(slug, None)
        return True
    return False
