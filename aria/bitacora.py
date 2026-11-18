# -*- coding: utf-8 -*-
"""Bitacora de ARIA: lo que aprendio/hizo cada dia, para que ASAGI lo lea en la manana.
Idea tomada del video de memoria compartida (Hermes/Obsidian): un diario que un asistente deja
para el otro. Sin HTTP ni servidores: solo un JSON local (data/bitacora.json).
para_celular() arma un resumen corto juntando lo anotado + lo que Musa ya registro con fecha."""
from __future__ import annotations

import json
import os
import time

_DIR = os.path.dirname(os.path.abspath(__file__))
_RUTA = os.path.join(_DIR, "data", "bitacora.json")
_MAX = 200


def _leer():
    try:
        return json.load(open(_RUTA, encoding="utf-8"))
    except Exception:
        return []


def _guardar(xs):
    try:
        os.makedirs(os.path.dirname(_RUTA), exist_ok=True)
        json.dump(xs[-_MAX:], open(_RUTA, "w", encoding="utf-8"), ensure_ascii=False)
    except Exception:
        pass


def anotar(cat, texto):
    """Agrega una linea a la bitacora. cat: 'aprendi' | 'hice' | 'nota'. Evita repetir lo del mismo dia."""
    texto = str(texto or "").replace("\n", " ").strip()[:220]
    if not texto:
        return
    xs = _leer()
    dia = time.strftime("%Y-%m-%d")
    for x in xs[-12:]:
        if x.get("dia") == dia and x.get("texto") == texto:
            return
    xs.append({"ts": int(time.time()), "dia": dia, "cat": str(cat or "nota")[:12], "texto": texto})
    _guardar(xs)


def _musa_lineas(desde_ts):
    """Lo que Musa estudio/anoto desde desde_ts (ya lo registra ella, con fecha)."""
    out = []
    try:
        import musa
        d = musa.leer()
        hoy = time.strftime("%Y-%m-%d")
        est = d.get("estudiado", {}) or {}
        temas = [t for t, day in est.items() if day == hoy and t != "mi youtube"]
        if temas:
            out.append("Estudie: " + ", ".join(temas[:5]))
        notas = [n for n in (d.get("notas") or []) if int(n.get("ts", 0)) >= int(desde_ts or 0)]
        ideas = [n.get("texto", "") for n in notas if n.get("tipo") in ("ideas", "la_gente_pide")]
        for it in ideas[-2:]:
            if it:
                out.append(it[:150])
    except Exception:
        pass
    return out


def para_celular(desde_ts=0):
    """Resumen corto de lo que ARIA aprendio/hizo desde desde_ts (epoch). -> dict {ts, dia, texto} o None."""
    desde_ts = int(desde_ts or 0)
    vistos = set()
    lineas = []
    for x in _leer():                              # eventos anotados (lo que hizo)
        if int(x.get("ts", 0)) >= desde_ts:
            t = x.get("texto", "")
            if t and t not in vistos:
                vistos.add(t)
                lineas.append(t)
    for t in _musa_lineas(desde_ts):               # lo que Musa aprendio
        if t and t not in vistos:
            vistos.add(t)
            lineas.append(t)
    if not lineas:
        return None
    texto = "\n".join("• " + l for l in lineas[:8])
    return {"ts": int(time.time()), "dia": time.strftime("%Y-%m-%d"), "texto": texto[:800]}
