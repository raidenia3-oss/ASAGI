# -*- coding: utf-8 -*-
"""ARIA - Informes con fuentes citadas (tarea larga en segundo plano).

  informe: <tema>      /  investiga a fondo <tema>
  -> busca en la web (DuckDuckGo HTML + Wikipedia), lee las mejores páginas, y escribe
     un informe donde CADA afirmación lleva su [n]. Las citas se verifican: una [n] que no
     existe se borra, y si el modelo no citó nada se avisa. Se guarda en data/informes/.

Regla v2: solo urllib saliente (como el skill web); sin servidores ni dependencias.
Sin modelo cargado, el informe sale igual en modo extractivo (investigacion.py).
Lo que decide (limpiar HTML, elegir fuentes, verificar citas, armar el markdown) es PURO.
"""
import html as _html
import json
import os
import re
import time
import urllib.parse
import urllib.request

_DIR = os.path.dirname(os.path.abspath(__file__))
CARPETA = os.path.join(_DIR, "data", "informes")
UA = {"User-Agent": "Mozilla/5.0 (ARIA informe)"}
BLOQUEO = ("facebook.com", "instagram.com", "tiktok.com", "pinterest.", "x.com", "twitter.com", "login", "signin")


# ----------------------------------------------------------------- PURO
def texto_de_html(h, maximo=12000):
    h = re.sub(r"(?is)<(script|style|noscript|svg|header|footer|nav|form)[^>]*>.*?</\1>", " ", h or "")
    h = re.sub(r"(?i)<br\s*/?>|</p>|</h\d>|</li>", "\n", h)
    t = _html.unescape(re.sub(r"<[^>]+>", " ", h))
    lineas = [re.sub(r"[ \t]+", " ", l).strip() for l in t.splitlines()]
    lineas = [l for l in lineas if len(l) > 40]          # fuera menús y migas
    return "\n".join(lineas)[:maximo]


def resultados_ddg(h):
    """Enlaces de la página HTML de DuckDuckGo. PURO."""
    out = []
    for m in re.finditer(r'(?is)<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', h or ""):
        url = _html.unescape(m.group(1))
        q = urllib.parse.urlparse(url)
        if "duckduckgo.com" in q.netloc and "uddg" in url:
            url = urllib.parse.parse_qs(q.query).get("uddg", [url])[0]
        titulo = _html.unescape(re.sub(r"<[^>]+>", "", m.group(2))).strip()
        out.append({"url": url, "titulo": titulo})
    return out


def elegir(resultados, n=5):
    """Sin repetidos por dominio, sin redes sociales ni logins. PURO."""
    vistos, out = set(), []
    for r in resultados:
        u = r.get("url", "")
        dom = urllib.parse.urlparse(u).netloc.lower().replace("www.", "")
        if not u.startswith("http") or not dom or dom in vistos or any(b in u.lower() for b in BLOQUEO):
            continue
        vistos.add(dom); out.append(r)
        if len(out) >= n:
            break
    return out


def fragmentos(tema, texto, k=4, largo=420):
    """Los párrafos del texto que más hablan del tema. PURO."""
    pal = [w for w in re.findall(r"\w{4,}", (tema or "").lower())]
    parrs = [p for p in re.split(r"\n+", texto or "") if len(p) > 60]
    if not pal:
        return [p[:largo] for p in parrs[:k]]
    pun = sorted(parrs, key=lambda p: -sum(p.lower().count(w) for w in pal))
    return [p[:largo] for p in pun[:k]]


def verificar_citas(texto, n_fuentes):
    """Quita [n] inexistentes; cuenta las válidas. PURO. -> (texto, validas, quitadas)"""
    validas, quitadas = set(), [0]

    def _f(m):
        nums = [int(x) for x in re.findall(r"\d+", m.group(0))]
        ok = [x for x in nums if 1 <= x <= n_fuentes]
        quitadas[0] += len(nums) - len(ok)
        validas.update(ok)
        return ("[" + "][".join(str(x) for x in ok) + "]") if ok else ""
    t = re.sub(r"\[(\d+(?:\s*[,;]\s*\d+)*)\]", _f, texto or "")
    return t.strip(), sorted(validas), quitadas[0]


def prompt_informe(tema, fuentes):
    bloques = []
    for i, f in enumerate(fuentes, 1):
        bloques.append("[%d] %s (%s)\n%s" % (i, f.get("titulo", ""), f.get("url", ""), "\n".join(f.get("fragmentos", []))))
    return ("Escribe un informe breve en español para Daniel sobre: %s\n"
            "Usa SOLO estas fuentes. Pon la cita [n] al final de cada afirmación. Si las fuentes no "
            "dicen algo, escribe que no está en las fuentes. Estructura: Resumen (3 líneas), "
            "Puntos clave (viñetas), Dudas o contradicciones.\n\nFuentes:\n%s" % (tema, "\n\n".join(bloques)))


def markdown(tema, cuerpo, fuentes, validas, quitadas, modo):
    usadas = set(validas)
    lista = "\n".join("%d. [%s](%s)%s" % (i, f.get("titulo") or f["url"], f["url"], "" if i in usadas or not usadas else " (no citada)")
                      for i, f in enumerate(fuentes, 1))
    nota = []
    if modo == "extractivo":
        nota.append("Sin modelo cargado: informe extractivo (frases tomadas de las fuentes).")
    elif not validas:
        nota.append("Ojo: el modelo no citó fuentes; verifica antes de usarlo.")
    if quitadas:
        nota.append("Quité %d cita(s) a fuentes que no existen." % quitadas)
    return "# %s\n_%s · %d fuentes_\n\n%s%s\n\n## Fuentes\n%s\n" % (
        tema, time.strftime("%d/%m/%Y %H:%M"), len(fuentes), cuerpo,
        ("\n\n> " + " ".join(nota)) if nota else "", lista)


# ----------------------------------------------------------------- red (urllib saliente)
def _get(url, timeout=10, maximo=400000):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(maximo).decode(r.headers.get_content_charset() or "utf-8", "ignore")


def buscar_web(tema, n=8):
    res = []
    try:
        res += resultados_ddg(_get("https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(tema)))
    except Exception:
        pass
    try:
        j = json.loads(_get("https://es.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=2&srsearch="
                            + urllib.parse.quote(tema)))
        for s in j.get("query", {}).get("search", []):
            res.append({"url": "https://es.wikipedia.org/wiki/" + urllib.parse.quote(s["title"].replace(" ", "_")), "titulo": s["title"] + " — Wikipedia"})
    except Exception:
        pass
    return res[: n * 2]


def leer_web(url):
    return texto_de_html(_get(url, timeout=12))


# ----------------------------------------------------------------- tarea
def informe(tema, pensar=None, buscar=buscar_web, leer=leer_web, n=5, al_progreso=None, guardar=True):
    """-> {"md", "ruta", "fuentes", "citas", "modo"}"""
    prog = al_progreso or (lambda *_: None)
    prog("buscando fuentes…")
    cand = elegir(buscar(tema), n + 3)
    fuentes = []
    for r in cand:
        if len(fuentes) >= n:
            break
        try:
            t = leer(r["url"])
        except Exception:
            continue
        frs = fragmentos(tema, t)
        if frs:
            fuentes.append(dict(r, fragmentos=frs))
            prog("leída %d/%d: %s" % (len(fuentes), n, r.get("titulo", "")[:50]))
    if not fuentes:
        return {"md": "No encontré fuentes legibles sobre «%s» (¿sin internet?)." % tema, "ruta": None, "fuentes": [], "citas": 0, "modo": "nada"}
    cuerpo, modo = "", "modelo"
    if pensar is not None:
        prog("escribiendo el informe…")
        try:
            cuerpo = str(pensar(prompt_informe(tema, fuentes)) or "").strip()
        except Exception:
            cuerpo = ""
    if not cuerpo:
        modo = "extractivo"
        cuerpo = "\n".join("- %s [%d]" % (f["fragmentos"][0][:300], i) for i, f in enumerate(fuentes, 1))
    cuerpo, validas, quitadas = verificar_citas(cuerpo, len(fuentes))
    md = markdown(tema, cuerpo, fuentes, validas, quitadas, modo)
    ruta = None
    if guardar:
        try:
            os.makedirs(CARPETA, exist_ok=True)
            slug = re.sub(r"[^a-z0-9]+", "-", tema.lower())[:40].strip("-") or "informe"
            ruta = os.path.join(CARPETA, "%s-%s.md" % (time.strftime("%Y%m%d-%H%M"), slug))
            with open(ruta, "w", encoding="utf-8") as f:
                f.write(md)
        except Exception:
            ruta = None
    return {"md": md, "ruta": ruta, "fuentes": fuentes, "citas": len(validas), "modo": modo}


def para_chat(md):
    """El markdown del informe, legible en el chat de ARIA (sin #, _ ni [](...)). PURO."""
    t = re.sub(r"(?m)^#+\s*", "", md or "")
    t = re.sub(r"(?m)^_(.+)_$", r"\1", t)
    t = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r"\1 — \2", t)
    t = re.sub(r"(?m)^>\s*", "⚠ ", t)
    return t.strip()
