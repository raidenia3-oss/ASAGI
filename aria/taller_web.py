"""ARIA - Taller web: «crea una web de pollería en Breña» -> sitio de una página, listo para abrir.

ARIA escribe el contenido con su cerebro local (en JSON) y lo vuelca en una plantilla probada,
responsive y sin dependencias (un solo index.html). Si el cerebro no está, usa textos base.
Los sitios quedan en ARIA_APP/sitios/<nombre>/ y se abren en tu navegador para que los veas.
No publica nada: publicar siempre lo decides tú.
"""
import hashlib
import html
import json
import os
import re
import time
import unicodedata

BASE = os.path.dirname(os.path.abspath(__file__))
SITIOS = os.path.join(BASE, "sitios")

PALETAS = [   # fondo, superficie, texto, acento, acento2
    ("#0f1115", "#181b22", "#eef0f4", "#ff6b35", "#ffd166"),
    ("#fbf8f3", "#ffffff", "#1d1b19", "#b5452b", "#2f6f5e"),
    ("#0b132b", "#1c2541", "#f4f6fb", "#5bc0be", "#f7b801"),
    ("#f4f7f5", "#ffffff", "#14231c", "#1f7a4d", "#e09f3e"),
    ("#111111", "#1d1d1d", "#f5f5f5", "#e63946", "#f1faee"),
    ("#fffaf0", "#ffffff", "#222222", "#d97706", "#0f766e"),
]


def _norm(t):
    t = unicodedata.normalize("NFD", str(t or "").lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def slug(t):
    """PURO."""
    return re.sub(r"[^a-z0-9]+", "-", _norm(t)).strip("-")[:40] or "sitio"


def parsear(t):
    """«crea una web de X» / «hazme una página para X» -> {'tema': X}. PURO."""
    s = re.sub(r"[¿?¡!]", "", str(t or "")).strip()
    m = re.match(r"^(?:crea(?:me)?|haz(?:me)?|arma(?:me)?|genera(?:me)?|dise[nñ]a(?:me)?)\s+(?:una?\s+)?(?:p[aá]gina(?:\s+web)?|web|sitio(?:\s+web)?|landing(?:\s+page)?)\s+(?:de|para|sobre|del|de la)\s+(.{3,200})$", s, re.I)
    return {"tema": m.group(1).strip()} if m else None


def telefono(t):
    """Si el pedido trae un celular peruano, para el botón de WhatsApp. PURO."""
    m = re.search(r"(?:\+?51\s?)?(9\d{2}\s?\d{3}\s?\d{3})", t or "")
    return "51" + re.sub(r"\s", "", m.group(1)) if m else None


def prompt(tema):
    return ("Escribe en español el contenido de una página web de una sola página para: %s.\n"
            "Responde SOLO un JSON válido con estas claves: nombre (corto), eslogan (máx 12 palabras), "
            "intro (2 frases), servicios (lista de 3 a 6 objetos {titulo, texto} con texto de 1 frase), "
            "porque (lista de 3 razones cortas), cta (texto del botón, máx 4 palabras), "
            "horario (texto corto o vacío), direccion (texto corto o vacío). Sin markdown." % tema)


def _json_de(txt):
    """Saca el primer objeto JSON de la respuesta del modelo. PURO."""
    if not txt:
        return None
    m = re.search(r"\{[\s\S]*\}", txt)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        try:
            return json.loads(re.sub(r",\s*([}\]])", r"\1", m.group(0)))
        except Exception:
            return None


def contenido_base(tema):
    nombre = tema.split(" en ")[0].strip().title()[:40]
    return {"nombre": nombre, "eslogan": "Calidad y atención que se notan",
            "intro": "Bienvenido a %s. Atendemos con dedicación para que vuelvas siempre." % nombre,
            "servicios": [{"titulo": "Atención personalizada", "texto": "Te escuchamos y resolvemos lo que necesitas."},
                          {"titulo": "Precios justos", "texto": "Buena calidad sin pagar de más."},
                          {"titulo": "Rapidez", "texto": "Tu tiempo vale; cumplimos lo que prometemos."}],
            "porque": ["Experiencia comprobada", "Clientes que regresan", "Trato cercano"],
            "cta": "Escríbenos", "horario": "", "direccion": ""}


def limpiar(c, tema):
    """Valida y recorta lo que devolvió el modelo; rellena lo que falte. PURO."""
    b = contenido_base(tema)
    if not isinstance(c, dict):
        return b
    o = {}
    for k in ("nombre", "eslogan", "intro", "cta", "horario", "direccion"):
        v = c.get(k)
        o[k] = str(v).strip()[:300] if isinstance(v, (str, int, float)) and str(v).strip() else b[k]
    sv = [x for x in (c.get("servicios") or []) if isinstance(x, dict) and x.get("titulo")]
    o["servicios"] = [{"titulo": str(x["titulo"])[:60], "texto": str(x.get("texto", ""))[:200]} for x in sv[:6]] or b["servicios"]
    pq = [str(x)[:80] for x in (c.get("porque") or []) if isinstance(x, (str, int, float))]
    o["porque"] = pq[:4] or b["porque"]
    return o


def paleta_de(tema):
    """PURO."""
    return int(hashlib.md5(_norm(tema).encode()).hexdigest(), 16) % len(PALETAS)


def render(c, tema, tel=None, paleta=None):
    """HTML completo de una página. PURO."""
    e = lambda x: html.escape(str(x or ""))
    fondo, sup, txt, ac, ac2 = PALETAS[(paleta_de(tema) if paleta is None else paleta) % len(PALETAS)]
    wa = ("https://wa.me/%s?text=%s" % (tel, "Hola%2C%20vi%20su%20p%C3%A1gina%20web")) if tel else "#contacto"
    serv = "\n".join('<article class="card"><h3>%s</h3><p>%s</p></article>' % (e(s["titulo"]), e(s["texto"])) for s in c["servicios"])
    porque = "\n".join("<li>%s</li>" % e(p) for p in c["porque"])
    datos = "".join("<p>%s</p>" % e(x) for x in (c.get("horario"), c.get("direccion")) if x)
    return """<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{nombre}</title><meta name="description" content="{eslogan}">
<style>
:root{{--f:{fondo};--s:{sup};--t:{txt};--a:{ac};--b:{ac2}}}
*{{box-sizing:border-box;margin:0}}body{{background:var(--f);color:var(--t);font:17px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}}
a{{color:inherit}}.w{{max-width:1080px;margin:0 auto;padding:0 20px}}
header{{padding:18px 0}}header .w{{display:flex;justify-content:space-between;align-items:center;gap:12px}}
.logo{{font-weight:800;letter-spacing:.02em;font-size:1.15rem}}nav a{{margin-left:18px;text-decoration:none;opacity:.8}}nav a:hover{{opacity:1}}
.hero{{padding:72px 0 64px}}.hero h1{{font-size:clamp(2.1rem,6vw,3.8rem);line-height:1.05;max-width:16ch}}
.hero p{{max-width:52ch;margin:18px 0 28px;opacity:.85;font-size:1.1rem}}
.btn{{display:inline-block;background:var(--a);color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:700}}
.btn:focus-visible{{outline:3px solid var(--b);outline-offset:3px}}
section{{padding:56px 0}}h2{{font-size:1.7rem;margin-bottom:22px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}}
.card{{background:var(--s);border-radius:16px;padding:22px;border-top:4px solid var(--a)}}.card h3{{margin-bottom:6px}}
.porque{{padding:0}}.porque li{{list-style:none;padding:12px 0;border-bottom:1px solid color-mix(in srgb,var(--t) 15%,transparent)}}
.porque li::before{{content:"✓ ";color:var(--a);font-weight:800}}
#contacto{{background:var(--s);border-radius:20px;padding:36px;text-align:center}}#contacto p{{margin:6px 0}}
footer{{padding:28px 0;opacity:.6;font-size:.9rem;text-align:center}}
.wa{{position:fixed;right:18px;bottom:18px;background:#25d366;color:#fff;border-radius:999px;padding:14px 18px;font-weight:700;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.25)}}
@media (max-width:560px){{nav{{display:none}}.hero{{padding:48px 0}}}}
@media (prefers-reduced-motion:no-preference){{.card{{transition:transform .2s}}.card:hover{{transform:translateY(-3px)}}}}
</style></head><body>
<header><div class="w"><div class="logo">{nombre}</div><nav><a href="#servicios">Servicios</a><a href="#porque">Nosotros</a><a href="#contacto">Contacto</a></nav></div></header>
<main>
<div class="hero"><div class="w"><h1>{eslogan}</h1><p>{intro}</p><a class="btn" href="{wa}">{cta}</a></div></div>
<section id="servicios"><div class="w"><h2>Lo que ofrecemos</h2><div class="grid">{serv}</div></div></section>
<section id="porque"><div class="w"><h2>Por qué elegirnos</h2><ul class="porque">{porque}</ul></div></section>
<section><div class="w"><div id="contacto"><h2>Contáctanos</h2>{datos}<p><a class="btn" href="{wa}">{cta}</a></p></div></div></section>
</main>
<footer>© {anio} {nombre}</footer>
{wa_btn}
</body></html>
""".format(nombre=e(c["nombre"]), eslogan=e(c["eslogan"]), intro=e(c["intro"]), cta=e(c["cta"]), wa=e(wa), serv=serv,
           porque=porque, datos=datos, anio=time.strftime("%Y"), fondo=fondo, sup=sup, txt=txt, ac=ac, ac2=ac2,
           wa_btn=('<a class="wa" href="%s" aria-label="Escríbenos por WhatsApp">WhatsApp</a>' % e(wa)) if tel else "")


def crear(tema, pensar=None, abrir=True, carpeta=SITIOS):
    """Genera el sitio. Devuelve {'ruta', 'nombre', 'con_cerebro'}."""
    c, con_cerebro = None, False
    if pensar:
        try:
            c = _json_de(pensar(prompt(tema)))
            con_cerebro = c is not None
        except Exception:
            c = None
    c = limpiar(c, tema)
    destino = os.path.join(carpeta, slug(c["nombre"] if con_cerebro else tema))
    datos = {"tema": tema, "contenido": c, "telefono": telefono(tema), "paleta": paleta_de(tema), "historial": []}
    ruta = _escribir(destino, datos)
    _abrir(ruta, abrir)
    return {"ruta": ruta, "nombre": c["nombre"], "con_cerebro": con_cerebro}


def _escribir(destino, datos):
    os.makedirs(destino, exist_ok=True)
    ruta = os.path.join(destino, "index.html")
    datos["fecha"] = time.strftime("%Y-%m-%d %H:%M")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(render(datos["contenido"], datos["tema"], datos.get("telefono"), datos.get("paleta")))
    with open(os.path.join(destino, "contenido.json"), "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    return ruta


def _abrir(ruta, abrir=True):
    if abrir and os.name == "nt":
        try:
            os.startfile(ruta)          # se abre en tu navegador; no cierra nada tuyo
        except Exception:
            pass


# ---------------- editar una web ya hecha ----------------
def mis_webs(carpeta=SITIOS):
    out = []
    if os.path.isdir(carpeta):
        for d in sorted(os.listdir(carpeta)):
            j = os.path.join(carpeta, d, "contenido.json")
            if os.path.exists(j):
                try:
                    with open(j, encoding="utf-8") as f:
                        x = json.load(f)
                    out.append({"slug": d, "nombre": x["contenido"]["nombre"], "fecha": x.get("fecha", ""), "url": x.get("url", "")})
                except Exception:
                    pass
    return out


def encontrar(nombre, carpeta=SITIOS):
    """La web cuyo nombre o carpeta se parece más a «nombre» (o la última si dice «la web»). """
    webs = mis_webs(carpeta)
    if not webs:
        return None
    n = slug(re.sub(r"^(?:la|mi|esta|ultima)?\s*(?:web|pagina|sitio)?\s*", "", _norm(nombre or "")).strip())
    if not n or n in ("sitio", "ultima"):
        return max(webs, key=lambda w: w["fecha"])["slug"]
    for w in webs:
        if n == w["slug"] or n == slug(w["nombre"]):
            return w["slug"]
    cand = [w for w in webs if n in w["slug"] or w["slug"] in n or set(n.split("-")) & set(w["slug"].split("-")) - {"de", "la", "el", "en", "y"}]
    return max(cand, key=lambda w: w["fecha"])["slug"] if cand else None


def parsear_edicion(t):
    """PURO. «cambia el color de la web pollería» · «edita la web pollería: agrega la carta» · «mis webs» ·
    «deshaz el cambio de la web pollería» · «publica la web pollería» · «confirmo publicar pollería»."""
    s = re.sub(r"[¿?¡!]", "", str(t or "")).strip()
    n = _norm(s)
    if re.match(r"^(mis webs|mis paginas|mis sitios|que webs (tienes|hiciste))$", n):
        return {"accion": "listar"}
    m = re.match(r"^confirmo publicar(?: la web)?\s*(.*)$", n)
    if m:
        return {"accion": "confirmar_publicar", "web": m.group(1).strip()}
    m = re.match(r"^(?:publica|sube)(?: a internet)?(?: la)? (?:web|pagina|sitio)\s*(.*?)(?: a internet| en internet)?$", n)
    if m:
        return {"accion": "publicar", "web": m.group(1).strip()}
    m = re.match(r"^(?:deshaz|revierte)(?: el)?(?: ultimo)? cambio(?: de| en)?(?: la)? (?:web|pagina)\s*(.*)$", n)
    if m:
        return {"accion": "deshacer", "web": m.group(1).strip()}
    m = re.match(r"^cambia(?: el)? colou?r(?:es)?(?: de| en)?(?: la)? (?:web|pagina)\s*(.*?)(?:\s+a\s+(\w+))?$", n)
    if m:
        return {"accion": "editar", "web": m.group(1).strip(), "cambio": "color" + ((" " + m.group(2)) if m.group(2) else "")}
    m = re.match(r"^(?:edita|cambia|modifica|mejora|corrige|agrega a|anade a|pon en)(?: la)? (?:web|pagina|sitio)\s*([^:]*?)\s*:\s*(.{2,400})$", s, re.I)
    if m:
        return {"accion": "editar", "web": m.group(1).strip(), "cambio": m.group(2).strip()}
    return None


COLORES = {"naranja": 0, "oscuro": 0, "rojo": 4, "negro": 4, "azul": 2, "turquesa": 2, "verde": 3, "claro": 1, "crema": 1, "blanco": 5, "dorado": 5, "amarillo": 5}


def cambio_simple(datos, cambio):
    """Cambios que no necesitan cerebro: color, teléfono/WhatsApp. Devuelve True si lo aplicó. """
    n = _norm(cambio)
    if n.startswith("color"):
        pal = next((v for k, v in COLORES.items() if k in n), None)
        datos["paleta"] = pal if pal is not None else (int(datos.get("paleta") or 0) + 1) % len(PALETAS)
        return True
    tel = telefono(cambio)
    if tel and re.search(r"whats|telefono|celular|numero", n):
        datos["telefono"] = tel
        return True
    return False


def prompt_edicion(c, cambio):
    return ("Este es el contenido actual de una página web, en JSON:\n%s\n\nAplica este cambio pedido por Daniel: %s\n"
            "Responde SOLO el JSON completo actualizado, con las mismas claves (nombre, eslogan, intro, servicios, porque, cta, "
            "horario, direccion). Sin markdown." % (json.dumps(c, ensure_ascii=False), cambio))


def editar(web, cambio, pensar=None, abrir=True, carpeta=SITIOS):
    sl = encontrar(web, carpeta)
    if not sl:
        raise ValueError("no encuentro esa web (di «mis webs» para verlas)")
    destino = os.path.join(carpeta, sl)
    with open(os.path.join(destino, "contenido.json"), encoding="utf-8") as f:
        datos = json.load(f)
    previo = {k: datos.get(k) for k in ("contenido", "telefono", "paleta")}
    if not cambio_simple(datos, cambio):
        if not pensar:
            raise RuntimeError("para ese cambio necesito mi cerebro y no está listo")
        nuevo = _json_de(pensar(prompt_edicion(datos["contenido"], cambio)))
        if not nuevo:
            raise RuntimeError("no entendí cómo aplicar el cambio; dilo de otra forma")
        datos["contenido"] = limpiar(nuevo, datos["tema"])
    datos["historial"] = (datos.get("historial") or [])[-4:] + [previo]
    ruta = _escribir(destino, datos)
    _abrir(ruta, abrir)
    return {"ruta": ruta, "nombre": datos["contenido"]["nombre"], "url": datos.get("url", "")}


def deshacer(web, abrir=True, carpeta=SITIOS):
    sl = encontrar(web, carpeta)
    if not sl:
        raise ValueError("no encuentro esa web")
    destino = os.path.join(carpeta, sl)
    with open(os.path.join(destino, "contenido.json"), encoding="utf-8") as f:
        datos = json.load(f)
    if not datos.get("historial"):
        raise ValueError("no hay cambios para deshacer")
    datos.update(datos["historial"].pop())
    ruta = _escribir(destino, datos)
    _abrir(ruta, abrir)
    return {"ruta": ruta, "nombre": datos["contenido"]["nombre"]}


# ---------------- una sola entrada para ARIA y para ASAGI ----------------
def es_comando(t):
    return bool(parsear(t) or parsear_edicion(t))


def ejecutar_texto(t, pensar=None, abrir=True, carpeta=SITIOS):
    """Hace lo que pide el texto y devuelve el mensaje para Daniel (o None si no es del taller)."""
    o = parsear(t)
    if o:
        r = crear(o["tema"], pensar=pensar, abrir=abrir, carpeta=carpeta)
        return "🛠 Lista: «%s». La abrí en el navegador de la PC.\nCarpeta: %s%s\nPuedes decir «edita la web %s: …», «cambia el color de la web %s» o «publica la web %s»." % (
            r["nombre"], os.path.dirname(r["ruta"]), "" if r["con_cerebro"] else "\n(usé textos base: mi cerebro no respondió)",
            slug(r["nombre"]), slug(r["nombre"]), slug(r["nombre"]))
    e = parsear_edicion(t)
    if not e:
        return None
    if e["accion"] == "listar":
        ws = mis_webs(carpeta)
        return ("🛠 Mis webs:\n" + "\n".join("• %s (%s)%s" % (w["nombre"], w["slug"], (" → " + w["url"]) if w["url"] else "") for w in ws)) if ws else "Aún no hice webs. Di «crea una web de …»."
    if e["accion"] == "editar":
        r = editar(e["web"], e["cambio"], pensar=pensar, abrir=abrir, carpeta=carpeta)
        return "✏ Cambié «%s» y la volví a abrir.%s Si no te gusta: «deshaz el cambio de la web %s»." % (
            r["nombre"], (" (Está publicada: di «publica la web %s» para subir el cambio.)" % e["web"]) if r.get("url") else "", e["web"] or "")
    if e["accion"] == "deshacer":
        r = deshacer(e["web"], abrir=abrir, carpeta=carpeta)
        return "↩ Deshice el último cambio de «%s»." % r["nombre"]
    import publicar_web as pw
    sl = encontrar(e["web"], carpeta)
    if not sl:
        return "No encuentro esa web. Di «mis webs»."
    if e["accion"] == "publicar":
        pw.pedir(sl)
        return ("🌐 Ojo: «%s» quedará PÚBLICA en internet (GitHub Pages de tu cuenta, repositorio web-%s). "
                "Si falta GitHub CLI lo instalo. Para hacerlo escribe: «confirmo publicar %s» (vale 10 minutos)." % (sl, sl, sl))
    if not pw.confirmado(sl):
        return "Primero pide «publica la web %s» y luego confirma." % sl
    try:
        url = pw.publicar(os.path.join(carpeta, sl), sl)
        return "🌐 Publicada: %s\n(GitHub tarda 1 o 2 minutos en mostrarla la primera vez.)" % url
    except PermissionError as exc:
        pw.pedir(sl)                       # la confirmación sigue vigente tras conectar GitHub
        return "🔑 " + str(exc)
