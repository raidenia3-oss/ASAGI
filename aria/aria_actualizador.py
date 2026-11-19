# -*- coding: utf-8 -*-
"""ARIA - Se actualiza sola desde GitHub (sin que nadie copie archivos).

Lee aria/manifest.json del repo raidenia3-oss/ASAGI (rama main): la lista de archivos de ARIA con
su sha256. Por cada archivo:
  - si en la PC no existe            -> lo instala
  - si es igual al del repo          -> nada
  - si es el que ella misma instaló la última vez (no lo tocó nadie) -> lo actualiza (guarda copia .bak_auto)
  - si alguien lo cambió en la PC (Daniel o Kilo) -> NO lo pisa; lo reporta como conflicto
Corre al abrir ARIA y cada 6 h. Los cambios de código se aplican al reiniciar ARIA; los personajes
y datos se usan al instante. Chat: «actualízate» / «estado de actualización».
Solo HTTPS saliente con urllib (como el skill web); sin servidores ni dependencias.
"""
import hashlib
import json
import os
import shutil
import time
import urllib.request

_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_RAW = "https://raw.githubusercontent.com/raidenia3-oss/ASAGI/main/aria/"
ESTADO = os.path.join(_DIR, "data", "actualizador.json")
UA = {"User-Agent": "ARIA-actualizador"}


def sha(datos):
    return hashlib.sha256(datos).hexdigest()


def sha_archivo(ruta):
    try:
        with open(ruta, "rb") as f:
            return sha(f.read())
    except OSError:
        return None


def _get(url, timeout=15):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def leer_estado(ruta=ESTADO):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {"instalados": {}, "ultima": 0, "log": []}


def guardar_estado(e, ruta=ESTADO):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(e, f, ensure_ascii=False, indent=1)


def decidir(local, remoto, instalado, previos=()):
    """Qué hacer con un archivo. PURO. -> 'igual' | 'instalar' | 'actualizar' | 'conflicto'
    previos: sha256 de versiones que ya se entregaron antes (si la PC tiene una de esas, nadie la tocó)."""
    if local == remoto:
        return "igual"
    if local is None:
        return "instalar"
    if (instalado is not None and local == instalado) or local in (previos or ()):
        return "actualizar"
    return "conflicto"


def ruta_segura(base, rel):
    """Evita que un manifiesto raro escriba fuera de ARIA_APP. PURO."""
    rel = rel.replace("\\", "/").lstrip("/")
    if ".." in rel.split("/") or ":" in rel:
        return None
    destino = os.path.abspath(os.path.join(base, rel))
    return destino if destino.startswith(os.path.abspath(base) + os.sep) else None


def actualizar(base=_DIR, get=_get, raw=REPO_RAW, estado_ruta=ESTADO, forzar=False):
    """-> {"instalados":[...], "actualizados":[...], "conflictos":[...], "errores":[...], "reiniciar": bool}"""
    e = leer_estado(estado_ruta)
    res = {"instalados": [], "actualizados": [], "conflictos": [], "errores": [], "reiniciar": False}
    try:
        man = json.loads(get(raw + "manifest.json").decode("utf-8"))
    except Exception as exc:
        res["errores"].append("sin manifiesto (%s)" % exc)
        return res
    for rel, info in sorted((man.get("archivos") or {}).items()):
        destino = ruta_segura(base, rel)
        if not destino:
            res["errores"].append("ruta rechazada: %s" % rel)
            continue
        local, remoto, inst = sha_archivo(destino), info.get("sha256"), e["instalados"].get(rel)
        d = decidir(local, remoto, inst, info.get("previos") or ())
        if d == "igual":
            e["instalados"][rel] = remoto
            continue
        if d == "conflicto" and not forzar:
            res["conflictos"].append(rel)
            continue
        try:
            datos = get(raw + rel)
            if sha(datos) != remoto:
                res["errores"].append("%s: llegó distinto (sha)" % rel)
                continue
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            if local is not None:
                shutil.copy2(destino, destino + ".bak_auto")
            tmp = destino + ".tmp_auto"
            with open(tmp, "wb") as f:
                f.write(datos)
            os.replace(tmp, destino)
            e["instalados"][rel] = remoto
            (res["instalados"] if local is None else res["actualizados"]).append(rel)
            if rel.endswith(".py"):
                res["reiniciar"] = True
        except Exception as exc:
            res["errores"].append("%s: %s" % (rel, exc))
    e["ultima"] = int(time.time())
    if res["instalados"] or res["actualizados"] or res["conflictos"]:
        e["log"] = (e.get("log") or [])[-30:] + [{"t": e["ultima"], "i": res["instalados"], "a": res["actualizados"], "c": res["conflictos"]}]
    e["conflictos"] = res["conflictos"]
    guardar_estado(e, estado_ruta)
    return res


def resumen(r):
    """Texto para el chat. PURO."""
    p = []
    if r["instalados"]:
        p.append("instalé %d nuevo(s): %s" % (len(r["instalados"]), ", ".join(r["instalados"][:6])))
    if r["actualizados"]:
        p.append("actualicé %d: %s" % (len(r["actualizados"]), ", ".join(r["actualizados"][:6])))
    if r["conflictos"]:
        p.append("no toqué %d que se cambiaron en la PC: %s" % (len(r["conflictos"]), ", ".join(r["conflictos"][:6])))
    if r["errores"] and not p:
        return "No pude buscar actualizaciones (%s)." % r["errores"][0]
    if not p:
        return "Estoy al día."
    return "Me actualicé: " + "; ".join(p) + "." + (" Los cambios de código se aplican cuando me reinicies." if r["reiniciar"] else "")
