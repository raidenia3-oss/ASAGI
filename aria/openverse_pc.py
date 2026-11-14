"""ARIA - Openverse (api.openverse.org): imágenes y sonidos de uso libre, sin key.

«fondo de lluvia» / «busca fondos montañas» -> baja una imagen libre y la pone de fondo, con su crédito.
Solo HTTP de salida con urllib (sin dependencias nuevas, sin servidores).
"""
import json
import os
import re
import unicodedata
import urllib.parse
import urllib.request

API = "https://api.openverse.org/v1/"
UA = {"User-Agent": "ARIA/1.0 (asistente personal)", "Accept": "application/json"}
CARPETA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "fondos_openverse")


def _norm(t):
    t = unicodedata.normalize("NFD", str(t or "").lower())
    return re.sub(r"[.!?¿¡]", "", "".join(c for c in t if unicodedata.category(c) != "Mn")).strip()


def parsear(t):
    """«fondo de X» -> {'accion':'fondos','q':X}. PURO."""
    if re.search(r"[\\/]|^\s*\S*\s*[a-z]:", str(t or ""), re.I):      # rutas de archivo: eso es fondo_foto
        return None
    l = re.sub(r"[.!?¿¡]", "", str(t or "").lower()).strip()
    m = re.match(r"^(?:busca(?:r|me)?|pon(?:me)?|quiero|dame)?\s*(?:un |una )?(?:fondos?|wallpapers?)\s+(?:de |con |del |sobre )?(?:la |el |los |las )?(.{2,60})$", l)
    if not m:
        return None
    q = re.sub(r"^(?:pantalla|openverse)\s*(?:de |con )?", "", m.group(1)).strip()
    if not q or _norm(q) in ("pantalla", "mi foto", "foto") or os.path.splitext(q)[1] in (".jpg", ".png", ".jpeg", ".webp"):
        return None
    # estilos de fondo_foto («fondo suave», «fondo nítido»…) no son búsquedas
    if _norm(q) in ("auto", "paleta", "suave", "nitido", "info", "red", "matrix", "neuronal"):
        return None
    return {"accion": "fondos", "q": q}


def credito(r):
    lic = (r.get("license") or "").upper()
    lic = lic if lic in ("CC0", "PDM") else "CC %s%s" % (lic, (" " + r["license_version"]) if r.get("license_version") else "")
    return "«%s» de %s (%s)" % ((r.get("title") or "sin título")[:60], r.get("creator") or "autor desconocido", lic)


def _get_json(url, timeout=20):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as f:
        return json.loads(f.read().decode("utf-8"))


def imagenes(q, n=12, horizontal=True):
    base = API + "images/?q=%s&page_size=%d&mature=false" % (urllib.parse.quote(q), n)
    rs = _get_json(base + ("&aspect_ratio=wide&size=large" if horizontal else "")).get("results") or []
    return rs or (_get_json(base).get("results") or [])


def bajar(r, carpeta=CARPETA):
    """Baja la imagen (primero la original, si falla la versión grande de Openverse). Devuelve la ruta."""
    os.makedirs(carpeta, exist_ok=True)
    for url in (r.get("url"), API + "images/%s/thumb/?full_size=true" % r.get("id")):
        if not url:
            continue
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA["User-Agent"]}), timeout=40) as f:
                datos = f.read(25 * 1024 * 1024)
                tipo = f.headers.get("Content-Type", "")
            if len(datos) < 5000 or (tipo and not tipo.startswith("image/")):
                continue
            ext = ".png" if "png" in tipo else ".webp" if "webp" in tipo else ".jpg"
            ruta = os.path.join(carpeta, re.sub(r"[^\w-]", "", str(r.get("id")))[:40] + ext)
            with open(ruta, "wb") as g:
                g.write(datos)
            return ruta
        except Exception:
            continue
    raise RuntimeError("no pude bajar la imagen")


def fondo(q):
    """Busca y baja el mejor fondo para q. Devuelve (ruta, crédito)."""
    rs = [r for r in imagenes(q) if (r.get("width") or 0) >= 1200] or imagenes(q)
    if not rs:
        raise RuntimeError("no encontré fondos de «%s»" % q)
    ultimo = None
    for r in rs[:5]:
        try:
            return bajar(r), credito(r)
        except Exception as e:
            ultimo = e
    raise ultimo or RuntimeError("no pude bajar ninguna")
