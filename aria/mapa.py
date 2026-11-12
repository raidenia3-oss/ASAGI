# -*- coding: utf-8 -*-
"""ARIA - Mapa de un tema: línea de tiempo + red de relaciones, en una página que se abre sola.

Idea tomada de los demos de Atria Dawn ("Xunji": búsqueda + cronología + grafo de relaciones
+ historiador IA, en papel y tinta). Le das un tema o un texto largo:

  mapa: la segunda guerra mundial        -> busca fuentes (informe.py), extrae hechos con fecha
  mapa: <pegas un texto largo>              y relaciones, y arma la página
Se guarda en data/informes/mapa-*.html (un solo archivo, sin internet ni servidores) y se abre
en el navegador. Sin modelo cargado sale igual: fechas sacadas del texto, sin relaciones.
Lo que decide (extraer, validar, armar HTML) es PURO.
"""
import html as _html
import json
import os
import re
import time

_DIR = os.path.dirname(os.path.abspath(__file__))
CARPETA = os.path.join(_DIR, "data", "informes")

PROMPT = ('Lee las fuentes y devuelve SOLO un JSON: {"resumen":"<2 líneas>",'
          '"eventos":[{"cuando":"<año o fecha>","que":"<hecho corto>","fuente":<n>}],'
          '"relaciones":[{"a":"<entidad>","rel":"<verbo corto>","b":"<entidad>"}]}. '
          'Máximo 14 eventos y 16 relaciones. Solo lo que digan las fuentes; nada inventado.\n\nTema: %s\n\nFuentes:\n%s')

_MESES = "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre"
_FECHA = re.compile(r"\b(\d{1,2} de (?:%s)(?: de \d{3,4})?|(?:%s) de \d{3,4}|(?:en|desde|hasta|hacia) (?:el )?(?:año )?\d{3,4}|\b1[0-9]{3}\b|\b20[0-9]{2}\b)" % (_MESES, _MESES), re.I)


def _anio(cuando):
    m = re.search(r"(-?\d{3,4})", str(cuando))
    return int(m.group(1)) if m else 10 ** 6


def extraer_json(txt):
    """Primer objeto JSON de la respuesta del modelo, validado y recortado. PURO."""
    m = re.search(r"\{.*\}", txt or "", re.S)
    if not m:
        return None
    try:
        o = json.loads(m.group(0))
    except ValueError:
        return None
    ev = [{"cuando": str(e.get("cuando", ""))[:30], "que": str(e.get("que", ""))[:200], "fuente": e.get("fuente")}
          for e in (o.get("eventos") or []) if isinstance(e, dict) and e.get("que")][:14]
    rel = [{"a": str(r.get("a", ""))[:40], "rel": str(r.get("rel", ""))[:30], "b": str(r.get("b", ""))[:40]}
           for r in (o.get("relaciones") or []) if isinstance(r, dict) and r.get("a") and r.get("b")][:16]
    ev.sort(key=lambda e: _anio(e["cuando"]))
    return {"resumen": str(o.get("resumen", ""))[:400], "eventos": ev, "relaciones": rel}


def extractivo(textos):
    """Sin modelo: frases con fecha -> eventos. PURO. textos = [(n_fuente, texto)]"""
    ev, vistos = [], set()
    for n, t in textos:
        for frase in re.split(r"(?<=[.!?])\s+", t or ""):
            m = _FECHA.search(frase)
            if m and 30 < len(frase) < 260 and frase[:60] not in vistos:
                vistos.add(frase[:60])
                ev.append({"cuando": m.group(1), "que": frase.strip(), "fuente": n})
    ev.sort(key=lambda e: _anio(e["cuando"]))
    return {"resumen": "", "eventos": ev[:14], "relaciones": []}


def html_mapa(tema, datos, fuentes):
    """Página autocontenida: tinta y oro de ARIA, cronología + grafo SVG con física simple. PURO."""
    e = lambda s: _html.escape(str(s or ""))
    evs = "".join('<li><time>%s</time><p>%s%s</p></li>' % (e(x["cuando"]), e(x["que"]),
                  (' <sup>[%s]</sup>' % e(x["fuente"])) if x.get("fuente") else "") for x in datos["eventos"]) or "<li><p>Sin fechas en las fuentes.</p></li>"
    fts = "".join('<li><a href="%s">%s</a></li>' % (e(f.get("url")), e(f.get("titulo") or f.get("url"))) for f in fuentes)
    return """<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mapa · %(t)s</title><style>
:root{--tinta:#07080f;--papel:#ece8f5;--oro:#e6c36a;--lila:#a99bff;--rosa:#f08cb4;--niebla:#8d89a6}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 20%% 0%%,#151933,#07080f 60%%);color:var(--papel);font:16px/1.6 Georgia,serif}
header{padding:40px 6vw 10px}h1{font-weight:400;font-size:clamp(28px,5vw,52px);margin:0;letter-spacing:.02em}
.eyebrow{font:600 11px/1 Consolas,monospace;letter-spacing:.35em;color:var(--oro);text-transform:uppercase}
.res{color:var(--niebla);max-width:70ch}main{display:grid;grid-template-columns:minmax(280px,1fr) 1.4fr;gap:4vw;padding:10px 6vw 40px}
@media(max-width:860px){main{grid-template-columns:1fr}}
ol{list-style:none;margin:0;padding:0 0 0 22px;border-left:1px solid rgba(230,195,106,.35)}
li{position:relative;margin:0 0 18px}li:before{content:"";position:absolute;left:-27px;top:8px;width:9px;height:9px;border-radius:50%%;background:var(--oro);box-shadow:0 0 12px var(--oro)}
time{font:600 12px Consolas,monospace;color:var(--oro);letter-spacing:.12em}li p{margin:2px 0 0}sup{color:var(--lila)}
svg{width:100%%;height:560px;background:rgba(255,255,255,.02);border:1px solid rgba(230,195,106,.18);border-radius:14px}
.n circle{fill:#151933;stroke:var(--lila);stroke-width:1.4}.n text{fill:var(--papel);font:13px Georgia,serif;text-anchor:middle}
.l line{stroke:rgba(230,195,106,.6);stroke-width:1.3}.l text{fill:#c9b47a;font:11px Consolas,monospace;text-anchor:middle}
footer{padding:0 6vw 40px;color:var(--niebla);font-size:13px}footer a{color:var(--lila)}
</style></head><body><header><div class="eyebrow">ARIA · mapa del tema · %(f)s</div><h1>%(t)s</h1><p class="res">%(r)s</p></header>
<main><section><div class="eyebrow">Línea de tiempo</div><ol>%(ev)s</ol></section>
<section><div class="eyebrow">Relaciones</div><svg id="g" viewBox="0 0 800 560"></svg></section></main>
<footer><div class="eyebrow">Fuentes</div><ol>%(fts)s</ol></footer>
<script>
const R=%(rel)s, svg=document.getElementById('g'), NS='http://www.w3.org/2000/svg';
const ids=[...new Set(R.flatMap(r=>[r.a,r.b]))], N=ids.map((id,i)=>({id,x:400+260*Math.cos(i/ids.length*6.283),y:280+200*Math.sin(i/ids.length*6.283),vx:0,vy:0}));
const by=Object.fromEntries(N.map(n=>[n.id,n]));
if(!R.length){svg.innerHTML='<text x="400" y="280" fill="#8d89a6" text-anchor="middle" font-family="Georgia">Sin relaciones (hace falta el modelo cargado).</text>'}
for(let k=0;k<400;k++){for(const a of N)for(const b of N)if(a!==b){const dx=a.x-b.x,dy=a.y-b.y,d=Math.max(30,Math.hypot(dx,dy)),f=9000/(d*d);a.vx+=dx/d*f;a.vy+=dy/d*f}
for(const r of R){const a=by[r.a],b=by[r.b],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,f=(d-210)*0.01;a.vx+=dx/d*f;a.vy+=dy/d*f;b.vx-=dx/d*f;b.vy-=dy/d*f}
for(const n of N){n.vx+=(400-n.x)*0.0015;n.vy+=(280-n.y)*0.0015;n.x=Math.min(740,Math.max(60,n.x+n.vx));n.y=Math.min(520,Math.max(40,n.y+n.vy));n.vx*=.6;n.vy*=.6}}
const el=(t,a,p)=>{const e=document.createElementNS(NS,t);for(const k in a)e.setAttribute(k,a[k]);(p||svg).appendChild(e);return e};
for(const r of R){const a=by[r.a],b=by[r.b],g=el('g',{class:'l'});el('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y},g);const t=el('text',{x:(a.x+b.x)/2,y:(a.y+b.y)/2-4},g);t.textContent=r.rel}
for(const n of N){const g=el('g',{class:'n'});el('circle',{cx:n.x,cy:n.y,r:Math.max(22,Math.min(46,n.id.length*3.2))},g);const t=el('text',{x:n.x,y:n.y+4},g);t.textContent=n.id.length>22?n.id.slice(0,21)+'…':n.id}
</script></body></html>""" % {"t": e(tema), "f": time.strftime("%d/%m/%Y"), "r": e(datos.get("resumen")), "ev": evs, "fts": fts,
                              "rel": json.dumps(datos["relaciones"], ensure_ascii=False).replace("</", "<\\/")}


def mapa(tema_o_texto, pensar=None, abrir=True, buscar=None, leer=None):
    """-> {"ruta", "eventos", "relaciones", "texto"}"""
    import informe as inf
    t = (tema_o_texto or "").strip()
    if len(t) > 300:                                   # le pegaron un texto: se usa tal cual
        tema = t.split("\n")[0][:60] + "…"
        fuentes = [{"url": "", "titulo": "Texto que me diste", "fragmentos": [t[:6000]]}]
    else:
        tema = t
        r = inf.informe(t, None, buscar=buscar or inf.buscar_web, leer=leer or inf.leer_web, guardar=False)
        fuentes = r["fuentes"]
        if not fuentes:
            return {"ruta": None, "eventos": 0, "relaciones": 0, "texto": r["md"]}
    datos = None
    if pensar is not None:
        bloques = "\n\n".join("[%d] %s\n%s" % (i, f.get("titulo", ""), "\n".join(f.get("fragmentos", []))) for i, f in enumerate(fuentes, 1))
        try:
            datos = extraer_json(pensar(PROMPT % (tema, bloques)))
        except Exception:
            datos = None
    if not datos or not (datos["eventos"] or datos["relaciones"]):
        datos = extractivo([(i, "\n".join(f.get("fragmentos", []))) for i, f in enumerate(fuentes, 1)])
    os.makedirs(CARPETA, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", tema.lower())[:40].strip("-") or "mapa"
    ruta = os.path.join(CARPETA, "mapa-%s-%s.html" % (time.strftime("%Y%m%d-%H%M"), slug))
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(html_mapa(tema, datos, [x for x in fuentes if x.get("url")]))
    if abrir:
        try:
            os.startfile(ruta)                         # navegador por defecto, archivo local
        except Exception:
            pass
    return {"ruta": ruta, "eventos": len(datos["eventos"]), "relaciones": len(datos["relaciones"]),
            "texto": "Mapa de «%s»: %d hechos en la línea de tiempo y %d relaciones. Lo abrí en tu navegador.\n%s" % (
                tema, len(datos["eventos"]), len(datos["relaciones"]), ruta)}
