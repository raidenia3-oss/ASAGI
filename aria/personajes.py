# -*- coding: utf-8 -*-
"""ARIA - Aprender de personajes (carpeta personajes/): sus tácticas y cómo trabajan.

Mismo formato que ASAGI (los JSON se comparten): cada personaje tiene esencia, como_trabaja,
tacticas[{nombre, que_es, como, cuando, senales, practica, limite}], no_copiar, para_aria.
Para sumar otro: copia un JSON, cambia el contenido y agrégalo a personajes/indice.json.

Chat:
  personajes                        -> de quién aprende
  tácticas de jane                  -> sus tácticas
  qué haría barney: <situación>     -> consejo con SUS tácticas aplicadas a tu caso (honesto, sin manipular)
  táctica del día                   -> una táctica + ejercicio
  entréname como jane               -> un ejercicio de una de sus tácticas
Además, cuando lo que preguntas encaja con una táctica, ARIA la tiene presente al responder (contexto()).
Lo que decide es PURO; solo cargar() lee archivos.
"""
import datetime
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
    """Lee la carpeta (con caché por fecha de indice.json). Nunca lanza."""
    carpeta = carpeta or CARPETA
    idx = os.path.join(carpeta, "indice.json")
    try:
        mt = os.path.getmtime(idx)
        if _cache["lista"] is not None and _cache["mtime"] == (carpeta, mt):
            return _cache["lista"]
        with open(idx, encoding="utf-8") as f:
            nombres = json.load(f).get("personajes", [])
        out = []
        for nom in nombres:
            try:
                with open(os.path.join(carpeta, nom), encoding="utf-8") as f:
                    out.append(json.load(f))
            except (OSError, ValueError):
                pass
        _cache.update(lista=out, mtime=(carpeta, mt))
        return out
    except (OSError, ValueError):
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
    return "Tácticas de %s:\n%s\n\nLo que NO copio: %s" % (
        p["nombre"], "\n".join("%d. %s — %s" % (i, t["nombre"], t["que_es"]) for i, t in enumerate(p["tacticas"], 1)),
        " · ".join(p.get("no_copiar", [])))


def texto_tactica(p, t):
    return "%s · %s\n%s\nCómo: %s\nEjercicio: %s\nOjo: %s" % (p["nombre"], t["nombre"], t["que_es"], t["como"], t["practica"], t["limite"])


def del_dia(lista, fecha=None):
    todas = [(p, t) for p in lista for t in p.get("tacticas", [])]
    if not todas:
        return None
    d = fecha or datetime.date.today()
    return todas[d.toordinal() % len(todas)]


def prompt_haria(p, ts, situacion):
    return ("Daniel te pide pensar como %s (%s): %s\nTácticas que aplican:\n%s\nNo copies de él: %s.\n\nSituación de Daniel: %s\n\n"
            "Da un consejo concreto en 3-5 pasos con el estilo de %s, pero siempre honesto y sin manipular a nadie. "
            "Termina con una frase corta para que Daniel la use.") % (
        p["nombre"], p.get("de", ""), p.get("esencia", ""),
        "\n".join("- %s: %s (límite: %s)" % (t["nombre"], t["como"], t["limite"]) for t in ts),
        "; ".join(p.get("no_copiar", [])), situacion, p.get("apodo") or p["nombre"])


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
    return "Táctica que puede servir (de %s, %s): %s. Úsala solo si viene al caso y con honestidad." % (p["nombre"], t["nombre"], t["como"])


def manejar(texto, pensar=None, lista=None):
    """Respuesta (str) si el mensaje es de personajes; None si no. pensar(prompt)->str opcional."""
    o = parsear(texto)
    if not o:
        return None
    lista = cargar() if lista is None else lista
    if o["tipo"] == "lista":
        return texto_lista(lista)
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
