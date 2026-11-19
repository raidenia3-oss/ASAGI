# -*- coding: utf-8 -*-
"""ARIA - Bots que HACEN cosas (agenda + equipo). Convive con bot_factory.py (bots-proceso de Kilo).

Dos cosas, todo dentro del mismo proceso, sin servidores ni dependencias:

1) BOTS PROGRAMADOS: le dices en el chat qué hacer y cuándo, y un hilo los dispara.
     cada día a las 9 haz abrir trabajo          -> repite una rutina del modo enseñar
     cada 30 minutos recuérdame tomar agua       -> aviso en el chat
     cada lunes a las 8:30 pregunta resume mi semana   -> ARIA lo piensa y te deja la respuesta
     a las 18 recuérdame salir                   -> una sola vez (hoy o mañana)
     bots · pausa bot 2 · activa bot 2 · borra bot 2
   Archivo: data/bots.json

2) EQUIPO (patrón supervisor): "equipo: <tarea>" reparte la tarea entre roles que piensan
   EN PARALELO con tiempo límite, un Sintetizador une los aportes y un Crítico los revisa.

Lo que decide (analizar frases, calcular la próxima vez, planear el equipo) es PURO y testeable;
lo que hace (rutinas, pensar, avisar) se inyecta.
"""
import json
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, wait as _esperar
from datetime import datetime, timedelta

_DIR = os.path.dirname(os.path.abspath(__file__))
ARCH = os.path.join(_DIR, "data", "bots_agenda.json")
DIAS = {"lunes": 0, "martes": 1, "miercoles": 2, "jueves": 3, "viernes": 4, "sabado": 5, "domingo": 6}
MAX_BOTS = 30


def _norm(t):
    t = (t or "").strip().lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n")):
        t = t.replace(a, b)
    return t


# ----------------------------------------------------------------- analizar (PURO)
_HORA = r"(\d{1,2})(?:[:.h](\d{2}))?\s*(am|pm|de la manana|de la tarde|de la noche)?"


def _hora(h, m, suf):
    h, m = int(h), int(m or 0)
    suf = suf or ""
    if suf in ("pm", "de la tarde", "de la noche") and h < 12:
        h += 12
    if suf in ("am", "de la manana") and h == 12:
        h = 0
    if not (0 <= h <= 23 and 0 <= m <= 59):
        return None
    return h, m


def _accion(resto, crudo_resto):
    """'haz X' | 'recuérdame X' | 'pregunta X' -> dict. PURO. resto (normalizado) y crudo_resto miden lo mismo."""
    m = re.match(r"^(?:haz|hazme|ejecuta|repite)\s+(?:la\s+rutina\s+)?(.+)$", resto)
    if m:
        return {"tipo": "rutina", "valor": m.group(1).strip()[:60]}      # las rutinas se guardan normalizadas
    m = re.match(r"^(?:recuerdame|recordarme|avisame|aviso|dime)\s+(?:que\s+|de\s+)?(.+)$", resto)
    if m:
        return {"tipo": "aviso", "valor": crudo_resto[m.start(1):m.end(1)].strip()[:200]}
    m = re.match(r"^(?:pregunta|piensa)\s+(.+)$", resto)
    if m:
        return {"tipo": "pensar", "valor": crudo_resto[m.start(1):m.end(1)].strip()[:400]}
    m = re.match(r"^(?:investiga|informe de|informe sobre|haz un informe de)\s+(.+)$", resto)
    if m:
        return {"tipo": "informe", "valor": crudo_resto[m.start(1):m.end(1)].strip()[:200]}
    m = re.match(r"^(?:analiza|resume|revisa)\s+.+$", resto)
    if m:
        return {"tipo": "pensar", "valor": crudo_resto[:400]}
    return None


def analizar(texto):
    """Frase -> {cuando, accion} o None. PURO.
    cuando: {"tipo": "diario", "h", "m"} | {"tipo": "semanal", "dia", "h", "m"} |
            {"tipo": "intervalo", "min"} | {"tipo": "una_vez", "h", "m"}"""
    crudo = (texto or "").strip()
    t = _norm(crudo)
    pos = None
    cuando = None
    m = re.match(r"^cada\s+(\d+)\s*(minutos?|min|horas?|h)\s+", t)
    if m:
        n = int(m.group(1)) * (60 if m.group(2).startswith("h") else 1)
        if n < 5:
            return None                    # nada de bots frenéticos
        cuando, pos = {"tipo": "intervalo", "min": min(n, 7 * 24 * 60)}, m.end()
    if cuando is None:
        m = re.match(r"^(?:cada\s+dia|todos\s+los\s+dias|diario|cada\s+manana)\s+(?:a\s+las?\s+)?" + _HORA + r"\s+", t)
        if m:
            hm = _hora(m.group(1), m.group(2), m.group(3))
            if hm:
                cuando, pos = {"tipo": "diario", "h": hm[0], "m": hm[1]}, m.end()
    if cuando is None:
        m = re.match(r"^(?:cada|todos\s+los)\s+(" + "|".join(DIAS) + r")s?\s+(?:a\s+las?\s+)?" + _HORA + r"\s+", t)
        if m:
            hm = _hora(m.group(2), m.group(3), m.group(4))
            if hm:
                cuando, pos = {"tipo": "semanal", "dia": DIAS[m.group(1)], "h": hm[0], "m": hm[1]}, m.end()
    if cuando is None:
        m = re.match(r"^(?:hoy\s+)?a\s+las?\s+" + _HORA + r"\s+", t)
        if m:
            hm = _hora(m.group(1), m.group(2), m.group(3))
            if hm:
                cuando, pos = {"tipo": "una_vez", "h": hm[0], "m": hm[1]}, m.end()
    if cuando is None:
        return None
    # la parte de la acción, con mayúsculas y tildes originales (mismo largo tras _norm)
    resto = t[pos:].strip()
    crudo_resto = crudo[pos:].strip() if len(crudo) == len(t) else resto
    acc = _accion(resto, crudo_resto)
    if acc is None:
        return None
    return {"cuando": cuando, "accion": acc}


def proxima(cuando, desde, ultimo=None):
    """Próxima vez (datetime) que toca, estrictamente después de 'desde'. PURO."""
    tipo = cuando.get("tipo")
    if tipo == "intervalo":
        base = datetime.fromtimestamp(ultimo) if ultimo else desde
        p = base + timedelta(minutes=int(cuando["min"]))
        return p if p > desde else desde + timedelta(minutes=int(cuando["min"]))
    p = desde.replace(hour=int(cuando["h"]), minute=int(cuando["m"]), second=0, microsecond=0)
    if tipo == "semanal":
        p += timedelta(days=(int(cuando["dia"]) - p.weekday()) % 7)
        if p <= desde:
            p += timedelta(days=7)
        return p
    if p <= desde:
        p += timedelta(days=1)
    return p


def describir_cuando(c):
    """Texto corto. PURO."""
    hm = lambda: "%02d:%02d" % (c["h"], c["m"])
    if c["tipo"] == "intervalo":
        n = c["min"]
        return "cada %d h" % (n // 60) if n % 60 == 0 else "cada %d min" % n
    if c["tipo"] == "diario":
        return "cada día %s" % hm()
    if c["tipo"] == "semanal":
        return "cada %s %s" % ([k for k, v in DIAS.items() if v == c["dia"]][0], hm())
    return "una vez a las %s" % hm()


def describir_accion(a):
    return {"rutina": "hacer «%s»", "aviso": "recordarte «%s»", "pensar": "pensar «%s»", "informe": "informe con fuentes de «%s»"}.get(a["tipo"], "%s") % a["valor"]


def vencidos(bots, ahora):
    """Bots activos a los que ya les toca. PURO. ahora = datetime."""
    out = []
    for b in bots:
        if not b.get("activo", True) or not b.get("sig"):
            continue
        if b["sig"] <= ahora.timestamp():
            out.append(b)
    return out


# ----------------------------------------------------------------- agenda (hilo)
class Agenda:
    """Guarda los bots y los dispara desde un hilo propio (uno solo, liviano)."""

    def __init__(self, archivo=None, rutina=None, pensar=None, avisar=None, reloj=datetime.now, informe=None):
        self.informe = informe          # fn(tema) -> str (informe con fuentes)
        self.archivo = archivo or ARCH
        self.rutina = rutina            # fn(nombre) -> str
        self.pensar = pensar            # fn(texto) -> str
        self.avisar = avisar            # fn(texto)  (lo muestra en el chat / notificación)
        self.reloj = reloj
        self._lock = threading.Lock()
        self._hilo = None
        self._vivo = threading.Event()

    # persistencia
    def bots(self):
        try:
            with open(self.archivo, encoding="utf-8") as f:
                d = json.load(f)
            return d if isinstance(d, list) else []
        except (OSError, ValueError):
            return []

    def _guardar(self, bots):
        os.makedirs(os.path.dirname(self.archivo) or ".", exist_ok=True)
        tmp = self.archivo + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(bots, f, ensure_ascii=False, indent=1)
        os.replace(tmp, self.archivo)

    def crear(self, plan, nombre=None):
        with self._lock:
            bots = self.bots()
            if len(bots) >= MAX_BOTS:
                return None
            nid = max([b.get("id", 0) for b in bots] + [0]) + 1
            ahora = self.reloj()
            b = {"id": nid, "nombre": (nombre or describir_accion(plan["accion"]))[:60],
                 "cuando": plan["cuando"], "accion": plan["accion"], "activo": True,
                 "creado": int(ahora.timestamp()), "ultimo": None, "veces": 0, "ultimo_resultado": "",
                 "sig": proxima(plan["cuando"], ahora).timestamp()}
            bots.append(b)
            self._guardar(bots)
            return b

    def _cambiar(self, bid, fn):
        with self._lock:
            bots = self.bots()
            for b in bots:
                if b.get("id") == bid:
                    r = fn(bots, b)
                    self._guardar(bots)
                    return r if r is not None else b
        return None

    def pausar(self, bid):
        return self._cambiar(bid, lambda bs, b: b.update(activo=False))

    def activar(self, bid):
        def _a(bs, b):
            b["activo"] = True
            b["sig"] = proxima(b["cuando"], self.reloj()).timestamp()
        return self._cambiar(bid, _a)

    def borrar(self, bid):
        return self._cambiar(bid, lambda bs, b: (bs.remove(b), b)[1])

    # ejecutar
    def correr(self, b):
        a = b["accion"]
        try:
            if a["tipo"] == "rutina":
                r = self.rutina(a["valor"]) if self.rutina else "sin modo enseñar"
            elif a["tipo"] == "informe":
                r = self.informe(a["valor"]) if self.informe else "sin módulo de informes"
            elif a["tipo"] == "pensar":
                r = self.pensar(a["valor"]) if self.pensar else "sin cerebro"
            else:
                r = a["valor"]
        except Exception as exc:
            r = "falló: %s" % exc
        r = str(r or "").strip()
        if self.avisar:
            pref = {"aviso": "⏰ ", "rutina": "🤖 Bot «%s»: " % b["nombre"], "pensar": "🤖 Bot «%s»:\n" % b["nombre"], "informe": "📑 Bot «%s»:\n" % b["nombre"]}[a["tipo"]]
            if b.get("_tarde", 0) >= 10:
                pref = pref.rstrip() + " (atrasado %d min, la PC estaba apagada) " % b["_tarde"]
            try:
                self.avisar(pref + r)
            except Exception:
                pass
        return r

    def tick(self):
        """Dispara lo que toca y reprograma. Devuelve los ids disparados."""
        ahora = self.reloj()
        with self._lock:
            bots = self.bots()
            toca = vencidos(bots, ahora)
            for b in toca:
                b["_sig_previo"] = b.get("sig")
                b["ultimo"] = int(ahora.timestamp())
                b["veces"] = b.get("veces", 0) + 1
                if b["cuando"]["tipo"] == "una_vez":
                    b["activo"] = False
                    b["sig"] = None
                else:
                    b["sig"] = proxima(b["cuando"], ahora, b["ultimo"]).timestamp()
            if toca:
                self._guardar(bots)
        hechos = []
        for b in toca:
            b["_tarde"] = int((ahora.timestamp() - (b.get("_sig_previo") or ahora.timestamp())) // 60)
            r = self.correr(b)
            hechos.append(b["id"])
            self._cambiar(b["id"], lambda bs, x, r=r: x.update(ultimo_resultado=r[:300]))
        return hechos

    def iniciar(self, cada=20.0):
        if self._hilo and self._hilo.is_alive():
            return
        self._vivo.set()

        def _bucle():
            while self._vivo.is_set():
                try:
                    self.tick()
                except Exception:
                    pass
                time.sleep(cada)
        self._hilo = threading.Thread(target=_bucle, name="aria-bots", daemon=True)
        self._hilo.start()

    def detener(self):
        self._vivo.clear()

    # chat
    def manejar(self, texto):
        """Respuesta (str) si el mensaje es de bots; None si no."""
        t = _norm(texto)
        if t in ("bots", "mis bots", "/bots", "que bots tienes"):
            bs = self.bots()
            if not bs:
                return ("Aún no tengo bots. Ejemplos:\n· cada día a las 9 haz abrir trabajo\n"
                        "· cada 45 minutos recuérdame estirarme\n· cada viernes a las 18 pregunta resume mi semana\n"
                        "· equipo: compara estas dos laptops")
            lin = []
            for b in bs:
                sig = datetime.fromtimestamp(b["sig"]).strftime("%d/%m %H:%M") if b.get("sig") else "—"
                lin.append("%s %d · %s · %s · próxima %s · %d veces" % (
                    "▶" if b.get("activo") else "⏸", b["id"], describir_cuando(b["cuando"]),
                    describir_accion(b["accion"]), sig, b.get("veces", 0)))
            return "Bots:\n" + "\n".join(lin)
        m = re.match(r"^(?:corre|ejecuta|prueba|lanza)\s+(?:el\s+)?bot\s+(\d+)(?:\s+ahora)?$", t)
        if m:
            b = next((x for x in self.bots() if x.get("id") == int(m.group(1))), None)
            if not b:
                return "No tengo el bot %s." % m.group(1)
            threading.Thread(target=self.correr, args=(b,), daemon=True).start()
            return "Corriendo el bot %d ahora (%s)…" % (b["id"], describir_accion(b["accion"]))
        m = re.match(r"^(pausa|para|deten|activa|reanuda|borra|elimina)\s+(?:el\s+)?bot\s+(\d+)$", t)
        if m:
            bid, v = int(m.group(2)), m.group(1)
            fn = self.pausar if v in ("pausa", "para", "deten") else self.activar if v in ("activa", "reanuda") else self.borrar
            b = fn(bid)
            if not b:
                return "No tengo el bot %d." % bid
            return "Bot %d %s." % (bid, "en pausa" if fn == self.pausar else "activo" if fn == self.activar else "borrado")
        plan = analizar(texto)
        if plan:
            b = self.crear(plan)
            if not b:
                return "Ya tengo %d bots; borra alguno primero." % MAX_BOTS
            return "Bot %d creado: %s, %s. Primera vez: %s." % (
                b["id"], describir_cuando(b["cuando"]), describir_accion(b["accion"]),
                datetime.fromtimestamp(b["sig"]).strftime("%d/%m %H:%M"))
        return None


# ----------------------------------------------------------------- equipo (supervisor)
ROLES = {
    "investigador": "Eres el Investigador. Reúne los datos y hechos clave sobre la tarea. Di qué no sabes.",
    "analista": "Eres el Analista. Compara opciones, pros y contras, riesgos; recomienda con criterio.",
    "planificador": "Eres el Planificador. Convierte la tarea en pasos concretos y ordenados.",
    "programador": "Eres el Programador. Da la solución técnica o el código mínimo que funciona.",
    "redactor": "Eres el Redactor. Escribe el texto final claro y breve.",
}


def planear(tarea, maximo=3):
    """Elige roles por palabras clave. PURO."""
    t = _norm(tarea)
    roles = ["investigador"]
    if re.search(r"compar|decid|elig|convien|mejor|vs|versus|riesgo", t):
        roles.append("analista")
    if re.search(r"codigo|script|programa|python|bug|error|funcion|api", t):
        roles.append("programador")
    if re.search(r"plan|pasos|organiza|como hago|proyecto|agenda", t):
        roles.append("planificador")
    if re.search(r"escribe|redacta|correo|mensaje|texto|post", t):
        roles.append("redactor")
    if len(roles) == 1:
        roles.append("analista")
    return roles[:max(1, maximo)]


def _con_reintento(pensar, prompt, intentos=2):
    ult = None
    for k in range(intentos):
        try:
            r = str(pensar(prompt) or "").strip()
            if r:
                return r
            ult = "respuesta vacía"
        except Exception as exc:
            ult = str(exc)
        time.sleep(0.3 * (k + 1))
    raise RuntimeError(ult or "sin respuesta")


def equipo(tarea, pensar, roles=None, limite=60.0, al_evento=None, serie=False, revisar=True):
    """Roles (en paralelo, o en serie si el modelo local no aguanta dos a la vez) con tiempo límite
    y un reintento -> Sintetizador -> Crítico -> una Revisión si el Crítico encontró algo."""
    ev = al_evento or (lambda *a: None)
    roles = roles or planear(tarea)
    t0 = time.time()
    ev("plan", roles)
    trazas = []
    pool = ThreadPoolExecutor(max_workers=1 if serie else len(roles))
    ini = {}
    futuros = {}
    for r in roles:
        ini[r] = time.time()
        futuros[pool.submit(_con_reintento, pensar, ROLES[r] + "\n\nTarea: " + tarea)] = r
    hechos, _ = _esperar(futuros, timeout=limite * (len(roles) if serie else 1))
    for f, r in futuros.items():
        if f in hechos and not f.exception():
            trazas.append({"rol": r, "ok": True, "texto": f.result()})
        else:
            trazas.append({"rol": r, "ok": False, "texto": "", "error": str(f.exception()) if f in hechos else "tiempo"})
        ev("fin", trazas[-1])
    pool.shutdown(wait=False)
    buenos = [x for x in trazas if x["ok"]]
    final = buenos[0]["texto"] if len(buenos) == 1 else ""
    if len(buenos) > 1:
        try:
            final = _con_reintento(pensar, "Eres el Sintetizador. Une los aportes en UNA respuesta para Daniel: lo esencial "
                                   "primero, sin repetir, sin inventar. Si se contradicen, dilo.\n\nTarea: " + tarea + "\n\n" +
                                   "\n\n".join("[%s]\n%s" % (b["rol"], b["texto"]) for b in buenos))
        except Exception:
            final = "\n\n".join("• %s: %s" % (b["rol"], b["texto"]) for b in buenos)
    critica, revisada = "", False
    if final and len(buenos) > 1:
        try:
            critica = _con_reintento(pensar, "Eres el Crítico. Señala en máximo 3 viñetas cortas lo dudoso o lo que falta "
                                     "verificar. Si está bien, responde solo OK.\n\n" + final, 1)
        except Exception:
            critica = ""
        if re.match(r"^\s*ok\.?\s*$", critica, re.I):
            critica = ""
        if critica and revisar:
            ev("revision", critica)
            try:
                final = _con_reintento(pensar, "Eres el Sintetizador. Corrige tu respuesta aplicando SOLO las observaciones válidas "
                                       "del Crítico; si algo no se puede verificar, dilo. Devuelve la respuesta completa.\n\n"
                                       "Tarea: " + tarea + "\n\nRespuesta:\n" + final + "\n\nCrítico:\n" + critica, 1)
                revisada = True
            except Exception:
                pass
    return {"tarea": tarea, "final": final, "critica": critica, "revisada": revisada, "trazas": trazas, "s": round(time.time() - t0, 1)}


def formato_equipo(r):
    """Texto para el chat. PURO."""
    if not r["final"]:
        return "Ningún rol pudo pensar (¿modelo local apagado?)."
    cab = "Equipo (%s · %.1f s)" % (" + ".join(x["rol"] + ("" if x["ok"] else " ✗") for x in r["trazas"]), r["s"])
    nota = ("\n\n— Revisado según el Crítico:\n" if r.get("revisada") else "\n\n— Crítico:\n") + r["critica"] if r["critica"] else ""
    return cab + "\n\n" + r["final"] + nota


# ----------------------------------------------------------------- variantes + juez
ENFOQUES = [("Directo", "Da la solución más simple y práctica que funcione hoy."),
            ("Riguroso", "Da la solución más segura y verificable; señala supuestos."),
            ("Creativo", "Da una solución distinta y ambiciosa que otros no propondrían."),
            ("Económico", "Da la solución más barata en dinero y tiempo.")]


def leer_juicio(txt, n):
    """-> (indice 1..n, porque). PURO."""
    m = re.search(r"\{.*?\}", txt or "", re.S)
    if m:
        try:
            o = json.loads(m.group(0))
            k = int(o.get("mejor"))
            if 1 <= k <= n:
                return k, str(o.get("porque", ""))
        except (ValueError, TypeError):
            pass
    d = re.search(r"\b([1-9])\b", txt or "")
    if d and 1 <= int(d.group(1)) <= n:
        return int(d.group(1)), (txt or "")[:200]
    return 1, "el juez no decidió; muestro la primera"


def variantes(tarea, pensar, n=3, serie=False, limite=60.0):
    n = max(2, min(4, n))
    pool = ThreadPoolExecutor(max_workers=1 if serie else n)
    t0 = time.time()
    fut = {pool.submit(_con_reintento, pensar, "Eres el candidato %s. %s\n\nTarea: %s" % (nom, guia, tarea)): nom
           for nom, guia in ENFOQUES[:n]}
    hechos, _ = _esperar(fut, timeout=limite * (n if serie else 1))
    cands = []
    for f, nom in fut.items():
        ok = f in hechos and not f.exception()
        cands.append({"nombre": nom, "ok": ok, "texto": f.result() if ok else ""})
    pool.shutdown(wait=False)
    buenos = [c for c in cands if c["ok"]]
    if not buenos:
        return {"mejor": None, "porque": "ningún candidato respondió", "candidatos": cands, "s": round(time.time() - t0, 1)}
    if len(buenos) == 1:
        return {"mejor": buenos[0], "porque": "solo uno respondió", "candidatos": cands, "s": round(time.time() - t0, 1)}
    try:
        j = _con_reintento(pensar, 'Eres el Juez. Elige la MEJOR variante para Daniel (resuelve, es correcta, se puede hacer). '
                           'Responde SOLO {"mejor":<número>,"porque":"<una línea>"}.\n\nTarea: ' + tarea + "\n\n" +
                           "\n\n".join("Variante %d (%s):\n%s" % (k + 1, c["nombre"], c["texto"]) for k, c in enumerate(buenos)), 1)
        k, porque = leer_juicio(j, len(buenos))
    except Exception:
        k, porque = 1, "el juez no respondió"
    return {"mejor": buenos[k - 1], "porque": porque, "candidatos": cands, "s": round(time.time() - t0, 1)}


def formato_variantes(r):
    if not r["mejor"]:
        return "Ningún candidato pudo pensar (¿modelo apagado?)."
    otros = ["— %s: %s" % (c["nombre"], c["texto"].split("\n")[0][:140]) for c in r["candidatos"] if c["ok"] and c is not r["mejor"]]
    return "Gana «%s» (%s) · %.1f s\n\n%s%s" % (r["mejor"]["nombre"], r["porque"], r["s"], r["mejor"]["texto"],
                                                 ("\n\nLas otras:\n" + "\n".join(otros)) if otros else "")


def resumen_estado(bots, ahora=None):
    """Para «qué agentes tengo activos» y para ASAGI. PURO."""
    act = [b for b in bots if b.get("activo") and b.get("sig")]
    act.sort(key=lambda b: b["sig"])
    prox = None
    if act:
        b = act[0]
        prox = "%s (%s)" % (describir_accion(b["accion"]), datetime.fromtimestamp(b["sig"]).strftime("%d/%m %H:%M"))
    return {"activos": len(act), "proximo": prox, "lista": [describir_accion(b["accion"]) for b in act][:10]}
