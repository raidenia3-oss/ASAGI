# -*- coding: utf-8 -*-
"""Orquestador de ARIA (parte BENIGNA de la idea de REA): un agente que coordina las herramientas
que ARIA ya tiene para cumplir una meta. NADA de ingeniería inversa ni ofensivo (regla 10).

Dada una meta en lenguaje natural, arma un PLAN ordenado de pasos mapeados a herramientas reales.
Los pasos que CAMBIAN algo (crear, mover, enviar, borrar) se marcan para que Daniel confirme (regla 9):
el orquestador propone; no ejecuta solo lo que tiene efectos. La elección de herramienta usa el LLM
si hay, con un respaldo por palabras clave si no. Funciones puras, se prueban sin PyQt."""
from __future__ import annotations

import re

# Catálogo de herramientas reales de ARIA. efecto: "lee" (seguro) | "cambia" (pide OK).
CATALOGO = [
    {"id": "musa", "nombre": "Musa", "efecto": "lee", "hace": "estudia y aprende un tema (busca y resume)",
     "claves": ["estudia", "aprende", "investiga", "busca sobre", "resume", "tema", "lee sobre"]},
    {"id": "wiki", "nombre": "Wiki", "efecto": "lee", "hace": "busca un dato concreto en la web/wiki",
     "claves": ["que es", "quien es", "dato", "define", "significa", "wiki"]},
    {"id": "navegador", "nombre": "Navegador", "efecto": "lee", "hace": "abre y navega páginas web",
     "claves": ["abre", "entra a", "navega", "pagina", "web", "sitio"]},
    {"id": "openverse", "nombre": "Openverse", "efecto": "lee", "hace": "busca imágenes libres",
     "claves": ["imagen", "foto libre", "ilustracion", "openverse"]},
    {"id": "correo", "nombre": "Correo", "efecto": "lee", "hace": "revisa el correo (leer es seguro; responder cambia)",
     "claves": ["correo", "email", "gmail", "bandeja", "mensajes"]},
    {"id": "taller", "nombre": "Taller", "efecto": "cambia", "hace": "crea una web/página (genera archivos)",
     "claves": ["crea una web", "haz una pagina", "landing", "sitio para", "taller"]},
    {"id": "video", "nombre": "Editor de video", "efecto": "cambia", "hace": "edita video (corta silencios, exporta)",
     "claves": ["video", "edita el video", "silencios", "corta", "exporta video"]},
    {"id": "orden", "nombre": "Ordenar PC", "efecto": "cambia", "hace": "ordena/mueve archivos de una carpeta",
     "claves": ["ordena", "organiza", "limpia la carpeta", "mueve", "acomoda"]},
    {"id": "radio", "nombre": "Radio", "efecto": "cambia", "hace": "pone una radio (SomaFM)",
     "claves": ["radio", "musica", "pon algo", "ambiental"]},
    {"id": "traspaso", "nombre": "Traspaso", "efecto": "cambia", "hace": "le pasa el contexto a ASAGI (celular)",
     "claves": ["pasa al celular", "manda a asagi", "traspaso", "sincroniza con el celular"]},
    {"id": "correo_resp", "nombre": "Responder correo", "efecto": "cambia", "hace": "redacta y envía un correo",
     "claves": ["responde el correo", "contesta", "envia un correo", "escribe a"]},
]

_POR_ID = {t["id"]: t for t in CATALOGO}


def _norm(t):
    import unicodedata
    t = unicodedata.normalize("NFD", str(t or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t).strip()


def _por_claves(meta):
    """Respaldo sin LLM: herramientas cuyas palabras clave aparecen en la meta, en orden de aparición."""
    n = _norm(meta)
    hits = []
    for t in CATALOGO:
        pos = min([n.find(_norm(k)) for k in t["claves"] if _norm(k) in n] or [-1])
        if pos >= 0:
            hits.append((pos, t))
    hits.sort(key=lambda x: x[0])
    vistos, out = set(), []
    for _p, t in hits:
        if t["id"] not in vistos:
            vistos.add(t["id"]); out.append(t)
    return out


def _prompt(meta):
    cat = "\n".join("- %s: %s (%s)" % (t["id"], t["hace"], t["efecto"]) for t in CATALOGO)
    return ("Eres ARIA. Divide la meta de Daniel en pasos cortos usando SOLO estas herramientas (por su id):\n"
            + cat + "\n\nMeta: «" + str(meta)[:300] + "»\n"
            "Responde UNA línea por paso, en orden, con el formato «id: qué haces en ese paso». "
            "Nada de texto extra, máximo 6 pasos. Si una herramienta no aplica, no la uses.")


def _parsear_plan(resp):
    pasos = []
    for linea in str(resp or "").splitlines():
        m = re.match(r"\s*[-*\d.)]*\s*([a-z_]+)\s*[:\-]\s*(.+)", linea.strip(), re.I)
        if not m:
            continue
        tid = m.group(1).lower().strip()
        if tid in _POR_ID:
            pasos.append({"id": tid, "accion": m.group(2).strip()[:120], "efecto": _POR_ID[tid]["efecto"]})
        if len(pasos) >= 6:
            break
    return pasos


def plan(meta, pensar=None):
    """Arma el plan para una meta. -> dict {pasos:[{id,nombre,accion,efecto}], texto, cambia:bool}."""
    pasos = []
    if callable(pensar):
        try:
            pasos = _parsear_plan(pensar(_prompt(meta)))
        except Exception:
            pasos = []
    if not pasos:                                   # respaldo por palabras clave
        for t in _por_claves(meta):
            pasos.append({"id": t["id"], "accion": t["hace"], "efecto": t["efecto"]})
    for p in pasos:
        p["nombre"] = _POR_ID[p["id"]]["nombre"]
    cambia = any(p["efecto"] == "cambia" for p in pasos)
    if not pasos:
        texto = "No encontré cómo hacer eso con mis herramientas. Dilo de otra forma o pídeme una habilidad concreta."
    else:
        lineas = []
        for i, p in enumerate(pasos, 1):
            marca = " ⚠ (cambia algo: necesito tu OK)" if p["efecto"] == "cambia" else ""
            lineas.append("%d. %s — %s%s" % (i, p["nombre"], p["accion"], marca))
        texto = "🧭 Plan:\n" + "\n".join(lineas)
        if cambia:
            texto += "\n\nLos pasos con ⚠ cambian cosas; dime «hazlo» y los confirmo uno por uno. Los demás son solo leer."
    return {"pasos": pasos, "texto": texto, "cambia": cambia}


def capacidades():
    """Texto de lo que ARIA puede coordinar."""
    return "🧰 Puedo coordinar: " + ", ".join(t["nombre"] for t in CATALOGO) + ".\nDime «orquesta <lo que quieres>» y armo el plan."
