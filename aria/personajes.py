# -*- coding: utf-8 -*-
"""ARIA - Aprender de personajes (carpeta personajes/): sus tácticas y cómo trabajan.

Mismo formato que ASAGI (los JSON se comparten): cada personaje tiene esencia, como_trabaja,
tacticas[{nombre, que_es, como, cuando, senales, practica}], para_aria.
Para sumar otro: copia un JSON, cambia el contenido y agrégalo a personajes/indice.json.

Chat:
  personajes                        -> de quién aprende
  tácticas de jane                  -> sus tácticas
  qué haría barney: <situación>     -> consejo con SUS tácticas aplicadas a tu caso, en su estilo
  táctica del día                   -> una táctica + ejercicio
  entréname como jane               -> un ejercicio de una de sus tácticas
Además, cuando lo que preguntas encaja con una táctica, ARIA la tiene presente al responder (contexto()).
Lo que decide es PURO; solo cargar() lee archivos.
"""
import datetime
import time
import json
import os
import random
import re

_DIR = os.path.dirname(os.path.abspath(__file__))
CARPETA = os.path.join(_DIR, "personajes")
_VACIAS = set("el la los las de del y en un una que por con para como al es mi me tu se lo le no".split())
_cache = {"lista": None, "mtime": None}


def _n(t):
    t = (t or "").strip().lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n"), ("¿", ""), ("¡", "")):
        t = t.replace(a, b)
    return t


def palabras(t):
    return [w for w in re.findall(r"[a-z0-9]{3,}", _n(t)) if w not in _VACIAS]


def cargar(carpeta=None):
    """Lee TODOS los .json de la carpeta (los del repo y los que ARIA/ASAGI crean solos). Caché por fechas. Nunca lanza."""
    carpeta = carpeta or CARPETA
    try:
        archivos = sorted(f for f in os.listdir(carpeta) if f.endswith(".json") and f != "indice.json")
        firma = (carpeta, tuple((f, os.path.getmtime(os.path.join(carpeta, f))) for f in archivos))
        if _cache["lista"] is not None and _cache["mtime"] == firma:
            return _cache["lista"]
        out = []
        for nom in archivos:
            try:
                with open(os.path.join(carpeta, nom), encoding="utf-8") as f:
                    d = json.load(f)
                if isinstance(d, dict) and d.get("nombre") and isinstance(d.get("tacticas"), list):
                    out.append(d)
            except (OSError, ValueError):
                pass
        _cache.update(lista=out, mtime=firma)
        return out
    except OSError:
        return []


def buscar(lista, nombre):
    q = _n(nombre)
    for p in lista:
        nom = _n(p.get("nombre"))
        if q in (nom, _n(p.get("id")), _n(p.get("apodo"))) or q in nom.split() or nom.split()[0] in q:
            return p
    return None


def parsear(texto):
    t = (texto or "").strip()
    n = _n(t)
    if re.match(r"^(?:personajes|mis personajes|de quien(?:es)? aprendes)\??$", n):
        return {"tipo": "lista"}
    m = re.match(r"^(?:tacticas|trucos|tecnicas)\s+de\s+(.{3,40})$", n)
    if m:
        return {"tipo": "tacticas", "quien": m.group(1)}
    m = re.match(r"^\s*(?:que|qué)\s+har[ií]a\s+([^:,]{3,40}?)\s*(?:[:,]|en|si|con)\s+(.{3,})$", t, re.I | re.S)
    if m:
        return {"tipo": "haria", "quien": m.group(1).strip(), "situacion": m.group(2).strip()}
    m = re.match(r"^(?:aprende|estudia|aprender)\s+(?:del|de|al|a)\s+personaje\s+(.{2,60})$|^nuevo personaje\s*:?\s*(.{2,60})$", t, re.I)
    if m:
        return {"tipo": "crear", "quien": (m.group(1) or m.group(2)).strip()}
    if re.match(r"^(?:tactica|truco|tecnica) del dia$", n):
        return {"tipo": "dia"}
    m = re.match(r"^(?:entrename|ensename) (?:como|a ser como|las tacticas de) (.{3,40})$", n)
    if m:
        return {"tipo": "entrena", "quien": m.group(1)}
    return None


def relevantes(p, situacion, k=2):
    q = palabras(situacion)
    pun = []
    for i, t in enumerate(p.get("tacticas", [])):
        campo = palabras(" ".join([t.get("nombre", ""), t.get("cuando", ""), t.get("senales", ""), t.get("que_es", "")]))
        s = sum(1 for w in q if any(c == w or (len(w) > 4 and c.startswith(w[:5])) for c in campo))
        pun.append((s, -i, t))
    pun.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return [x[2] for x in pun[:k]]


def texto_lista(lista):
    if not lista:
        return "Aún no tengo personajes en ARIA_APP/personajes/."
    return "Aprendo de:\n" + "\n".join("· %s (%s) — %d tácticas. %s." % (p["nombre"], p.get("de", ""), len(p.get("tacticas", [])),
                                                                         p.get("esencia", "").split(". ")[0]) for p in lista) + \
        "\n\nPrueba: «qué haría %s: <tu situación>» o «táctica del día»." % (lista[0].get("apodo") or lista[0]["nombre"])


def texto_tacticas(p):
    return "Tácticas de %s:\n%s" % (
        p["nombre"], "\n".join("%d. %s — %s" % (i, t["nombre"], t["que_es"]) for i, t in enumerate(p["tacticas"], 1)))


def texto_tactica(p, t):
    return "%s · %s\n%s\nCómo: %s\nEjercicio: %s" % (p["nombre"], t["nombre"], t["que_es"], t["como"], t["practica"])


def del_dia(lista, fecha=None):
    todas = [(p, t) for p in lista for t in p.get("tacticas", [])]
    if not todas:
        return None
    d = fecha or datetime.date.today()
    return todas[d.toordinal() % len(todas)]


def prompt_haria(p, ts, situacion):
    return ("Daniel te pide pensar como %s (%s): %s\nTácticas que aplican:\n%s\n\nSituación de Daniel: %s\n\n"
            "Da un consejo concreto en 3-5 pasos como lo haría %s de verdad, sonando como él. "
            "Termina con una frase corta para que Daniel la use.") % (
        p["nombre"], p.get("de", ""), p.get("esencia", ""),
        "\n".join("- %s: %s" % (t["nombre"], t["como"]) for t in ts), situacion, p.get("apodo") or p["nombre"])


def contexto(mensaje, lista=None, minimo=2):
    """Si el mensaje encaja con alguna táctica, una línea para el modelo. PURO salvo cargar()."""
    lista = cargar() if lista is None else lista
    q = palabras(mensaje)
    if len(q) < 3:
        return ""
    mejores = []
    for p in lista:
        for t in relevantes(p, mensaje, 1):
            campo = palabras(" ".join([t["nombre"], t.get("cuando", ""), t.get("senales", "")]))
            s = sum(1 for w in q if any(c == w or (len(w) > 4 and c.startswith(w[:5])) for c in campo))
            if s >= minimo:
                mejores.append((s, p, t))
    if not mejores:
        return ""
    mejores.sort(key=lambda x: -x[0])
    s, p, t = mejores[0]
    return "Táctica que puede servir (de %s, %s): %s" % (p["nombre"], t["nombre"], t["como"])


def manejar(texto, pensar=None, lista=None):
    """Respuesta (str) si el mensaje es de personajes; None si no. pensar(prompt)->str opcional."""
    o = parsear(texto)
    if not o:
        return None
    lista = cargar() if lista is None else lista
    if o["tipo"] == "lista":
        return texto_lista(lista)
    if o["tipo"] == "crear":
        return crear(o["quien"], pensar)[1]
    if o["tipo"] == "dia":
        x = del_dia(lista)
        return texto_tactica(*x) if x else texto_lista(lista)
    p = buscar(lista, o["quien"])
    if not p:
        return "No tengo a «%s» en mi carpeta de personajes. %s" % (o["quien"], texto_lista(lista).split("\n")[0])
    if o["tipo"] == "tacticas":
        return texto_tacticas(p)
    if o["tipo"] == "entrena":
        return texto_tactica(p, random.choice(p["tacticas"])) + "\n\nHazlo hoy y luego cuéntame cómo te fue."
    ts = relevantes(p, o["situacion"], 2)
    if pensar is not None:
        try:
            r = str(pensar(prompt_haria(p, ts, o["situacion"])) or "").strip()
            if r:
                return "%s haría esto:\n%s" % (p.get("apodo") or p["nombre"], r)
        except Exception:
            pass
    return "\n\n".join(texto_tactica(p, t) for t in ts)


# ----------------------------------------------------------------- personajes nuevos, solos
PROMPT_NUEVO = ('Con este texto sobre el personaje %s, devuelve SOLO un JSON con este formato: {"de":"<obra y años>",'
                '"esencia":"<2 frases>","como_trabaja":["<5 a 7 frases: cómo piensa y actúa>"],"tacticas":[{"nombre":"",'
                '"que_es":"","como":"<pasos concretos para hacerlo como él>","cuando":"<situaciones de la vida real de Daniel>",'
                '"senales":"","practica":"<ejercicio para hoy>"}]} con 6 a 10 tácticas tal como las usa el personaje. En español.\n\nTexto:\n%s')


def slug(t):
    return re.sub(r"[^a-z0-9]+", "-", _n(t)).strip("-")[:40] or "personaje"


def desde_json(nombre, txt, fuente):
    """Respuesta del modelo -> personaje válido o None. PURO."""
    m = re.search(r"\{.*\}", txt or "", re.S)
    if not m:
        return None
    try:
        d = json.loads(m.group(0))
    except ValueError:
        return None
    tac = [t for t in (d.get("tacticas") or []) if isinstance(t, dict) and t.get("nombre") and t.get("como")]
    if len(tac) < 3:
        return None
    for t in tac:
        for k in ("que_es", "cuando", "senales", "practica"):
            t[k] = str(t.get(k, ""))
    partes = nombre.split()
    return {"id": slug(nombre), "nombre": nombre, "apodo": partes[-1] if len(partes) > 1 else nombre,
            "de": str(d.get("de", "")), "esencia": str(d.get("esencia", "")),
            "como_trabaja": [str(x) for x in (d.get("como_trabaja") or [])][:8], "tacticas": tac[:10],
            "para_asagi": "", "para_aria": "", "fuente": fuente, "creado": int(time.time())}


def wikipedia(nombre, get=None):
    import urllib.parse
    import urllib.request
    get = get or (lambda u: urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "ARIA"}), timeout=12).read())
    api = "https://es.wikipedia.org/w/api.php?format=json&"
    s = json.loads(get(api + "action=query&list=search&srlimit=1&srsearch=" + urllib.parse.quote(nombre + " personaje")))
    hits = s.get("query", {}).get("search", [])
    if not hits:
        return None
    p = json.loads(get(api + "action=query&prop=extracts&explaintext=1&redirects=1&titles=" + urllib.parse.quote(hits[0]["title"])))
    pages = p.get("query", {}).get("pages", {})
    txt = next(iter(pages.values()), {}).get("extract", "") if pages else ""
    return {"titulo": hits[0]["title"], "texto": txt[:12000]} if txt else None


def crear(nombre, pensar, carpeta=None, get=None):
    """Investiga al personaje y lo guarda en la carpeta. -> (personaje | None, mensaje)"""
    carpeta = carpeta or CARPETA
    lista = cargar(carpeta)
    ya = buscar(lista, nombre)
    if ya:
        return ya, "Ya aprendí de %s (%d tácticas)." % (ya["nombre"], len(ya["tacticas"]))
    try:
        w = wikipedia(nombre, get)
    except Exception as exc:
        return None, "No pude leer sobre %s (%s)." % (nombre, exc)
    if not w:
        return None, "No encontré a «%s» en Wikipedia." % nombre
    if pensar is None:
        return None, "Para sacar las tácticas de %s necesito el modelo cargado." % nombre
    p = desde_json(w["titulo"], str(pensar(PROMPT_NUEVO % (w["titulo"], w["texto"][:7000])) or ""), "Wikipedia: %s + análisis" % w["titulo"])
    if not p:
        return None, "Leí sobre %s pero no logré sacar sus tácticas; prueba otra vez." % w["titulo"]
    return guardar(p, carpeta), "Aprendí de %s: %d tácticas. Prueba «qué haría %s: …»." % (p["nombre"], len(p["tacticas"]), p["apodo"])


def guardar(p, carpeta=None):
    carpeta = carpeta or CARPETA
    os.makedirs(carpeta, exist_ok=True)
    ruta = os.path.join(carpeta, (p.get("id") or slug(p["nombre"])) + ".json")
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(p, f, ensure_ascii=False, indent=2)
    _cache["lista"] = None
    return p
