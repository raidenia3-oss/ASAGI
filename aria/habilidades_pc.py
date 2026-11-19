"""ARIA - Habilidades que Daniel le enseña (cadenas de comandos), igual que en ASAGI.

  «aprende buenos días: revisa mi correo; fondo de amanecer; estado rollercoin»
  «cuando diga modo trabajo haz: abre el navegador, luego busca en la web noticias de IA»
  «mis habilidades» · «olvida la habilidad buenos días»
Al decir el nombre, ARIA escribe cada paso en su propio chat, en orden. Lo delicado sigue pidiendo
confirmación como siempre. (Las «rutinas» de modo enseñar —clics que le muestras— siguen aparte.)
"""
import json
import os
import re
import time
import unicodedata

BASE = os.path.dirname(os.path.abspath(__file__))
ARCHIVO = os.path.join(BASE, "data", "habilidades.json")
MAX_PASOS = 8


def norm(t):
    t = unicodedata.normalize("NFD", str(t or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[¿?¡!.,;:\"«»]+", " ", t)).strip()


def partir_pasos(t):
    """PURO."""
    ps = re.split(r"\s*(?:;|\n|,?\s+(?:luego|despues|después|y despues|y después|y luego)\s+)\s*", str(t or ""), flags=re.I)
    return [re.sub(r"^[-•]\s*", "", p).strip() for p in ps if p and p.strip()][:MAX_PASOS]


def parsear(t):
    """PURO."""
    s = str(t or "").strip()
    m = (re.match(r"^(?:aprende|ens[eé][nñ]ate|crea (?:la )?habilidad)\s+[«\"']?([^:«»\"']{2,40}?)[»\"']?\s*:\s*([\s\S]{2,600})$", s, re.I)
         or re.match(r"^cuando (?:te )?diga\s+[«\"']?([^«»\"']{2,40}?)[»\"']?\s+(?:haz|has|ejecuta)\s*:?\s+([\s\S]{2,600})$", s, re.I))
    if m:
        pasos = partir_pasos(m.group(2))
        return {"accion": "aprender", "nombre": m.group(1).strip(), "pasos": pasos} if pasos else None
    n = norm(s)
    if re.match(r"^(mis habilidades|que habilidades (tienes|sabes)|habilidades)$", n):
        return {"accion": "listar"}
    m = re.match(r"^(?:olvida|borra|elimina) (?:la )?habilidad (.{2,40})$", n)
    if m:
        return {"accion": "olvidar", "nombre": m.group(1)}
    return None


def cargar(ruta=ARCHIVO):
    try:
        with open(ruta, encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


def guardar(h, ruta=ARCHIVO):
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(h, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def aprender(nombre, pasos, ruta=ARCHIVO):
    k = norm(nombre)
    if not k:
        return False, "nombre vacío"
    if any(norm(p) == k for p in pasos):
        return False, "un paso no puede ser la misma habilidad"
    h = cargar(ruta)
    h[k] = {"nombre": nombre, "pasos": pasos, "creada": time.time(), "usos": h.get(k, {}).get("usos", 0)}
    guardar(h, ruta)
    return True, ""


def olvidar(nombre, ruta=ARCHIVO):
    h = cargar(ruta)
    if h.pop(norm(nombre), None) is None:
        return False
    guardar(h, ruta)
    return True


def buscar(t, ruta=ARCHIVO):
    h = cargar(ruta)
    k = norm(t)
    return dict(h[k], clave=k) if k in h else None


def usar(clave, ruta=ARCHIVO):
    h = cargar(ruta)
    if clave in h:
        h[clave]["usos"] = h[clave].get("usos", 0) + 1
        guardar(h, ruta)


def listar(ruta=ARCHIVO):
    h = cargar(ruta)
    if not h:
        return "🧠 Aún no me enseñaste habilidades. Ejemplo: «aprende buenos días: revisa mi correo; fondo de amanecer»."
    return "🧠 Mis habilidades:\n" + "\n".join(
        "• «%s» → %s%s" % (v["nombre"], " → ".join(v["pasos"]), ("  (%d usos)" % v["usos"]) if v.get("usos") else "")
        for v in h.values())
