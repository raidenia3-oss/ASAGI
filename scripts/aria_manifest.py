# -*- coding: utf-8 -*-
"""Genera aria/manifest.json (lo lee aria_actualizador.py en la PC).
Toma todo lo de aria/ salvo lo excluido. Si un archivo cambió, el sha anterior pasa a 'previos'
(así la PC sabe que esa versión vino de aquí y la puede actualizar sola). Uso: python scripts/aria_manifest.py
"""
import hashlib, json, os, sys

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "aria")
EXCLUIR = {"manifest.json", "lan.py", "enlace.py"}   # lan/enlace del repo son copias viejas: la PC manda


def generar(raiz=RAIZ, previo=None, extra_previos=None):
    previo = previo or {}
    viejos = previo.get("archivos") or {}
    out = {}
    for d, dirs, files in os.walk(raiz):
        dirs[:] = sorted(x for x in dirs if x != "__pycache__")
        for f in sorted(files):
            rel = os.path.relpath(os.path.join(d, f), raiz).replace("\\", "/")
            if rel in EXCLUIR or f.endswith((".pyc", ".bak_auto", ".tmp_auto")):
                continue
            with open(os.path.join(d, f), "rb") as fh:
                h = hashlib.sha256(fh.read()).hexdigest()
            prev = list((viejos.get(rel) or {}).get("previos") or [])
            ant = (viejos.get(rel) or {}).get("sha256")
            for x in ([ant] if ant else []) + list((extra_previos or {}).get(rel) or []):
                if x and x != h and x not in prev:
                    prev.append(x)
            out[rel] = {"sha256": h, "previos": prev[-20:]}
    return {"version": 1, "archivos": out}


if __name__ == "__main__":
    # los personajes son los mismos para ASAGI y ARIA: copia personajes/ -> aria/personajes/
    import shutil
    src = os.path.join(RAIZ, "..", "personajes")
    for f in os.listdir(src):
        shutil.copy2(os.path.join(src, f), os.path.join(RAIZ, "personajes", f))
    ruta = os.path.join(RAIZ, "manifest.json")
    try:
        previo = json.load(open(ruta, encoding="utf-8"))
    except (OSError, ValueError):
        previo = {}
    extra = json.loads(sys.argv[1]) if len(sys.argv) > 1 else None
    m = generar(previo=previo, extra_previos=extra)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(m, f, ensure_ascii=False, indent=1, sort_keys=True)
    print(len(m["archivos"]), "archivos en", ruta)
