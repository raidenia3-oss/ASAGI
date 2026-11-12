# -*- coding: utf-8 -*-
"""ARIA - Memoria como ciclo: después de cada mensaje decide QUÉ vale la pena recordar.

La memoria semántica guarda las conversaciones (episodios). Esto guarda HECHOS cortos y
durables sobre Daniel — quién es, qué prefiere, qué tiene, fechas, y lo que pide recordar —
y los vuelve a poner delante del modelo cuando vienen al caso. Saludos, órdenes y preguntas
sueltas no se guardan. Mismo criterio que ASAGI (memoria.js valeRecordar).

  qué recuerdas de mí      -> lista
  olvida <algo>            -> borra lo que coincida
Archivo: data/recuerdos.json      Todo lo que decide es PURO.
"""
import json
import os
import re
import threading
import time

_DIR = os.path.dirname(os.path.abspath(__file__))
ARCH = os.path.join(_DIR, "data", "recuerdos.json")
MAX = 300
_lock = threading.Lock()

_SALUDO = re.compile(r"^(hola|buenas|buenos dias|buenas tardes|buenas noches|gracias|ok|okey|vale|si|no|jaja+|xd|perfecto|listo|dale|chao|adios)\b[\s!.?]*$")
_ORDEN = re.compile(r"^(abre|cierra|pon|activa|desactiva|busca|haz|ensename|equipo|informe|investiga|nivel|bots|cada|a las|corre|pausa|borra|/)")


def _n(t):
    t = (t or "").strip().lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n"), ("¿", ""), ("¡", "")):
        t = t.replace(a, b)
    return t


def vale(texto):
    """-> {"texto", "tema"} o None. PURO."""
    crudo = (texto or "").strip()
    t = _n(crudo)
    if len(t) < 10 or len(t) > 600 or _SALUDO.match(t) or _ORDEN.match(t):
        return None
    m = re.match(r"^(?:recuerda|recuerdalo|acuerdate|no olvides|anota|apunta)(?:\s+que)?\s*[:,]?\s+(.{4,})$", t)
    if m:
        return {"texto": crudo[len(crudo) - len(m.group(1)):].strip(), "tema": "pedido"}
    pregunta = t.rstrip().endswith("?")
    if re.search(r"\b(me gusta|me encanta|no me gusta|odio|prefiero|mi favorit|siempre uso|nunca uso)\b", t):
        return {"texto": crudo, "tema": "preferencia"}
    if not pregunta and re.search(r"\b(soy|me llamo|vivo en|trabajo en|trabajo de|estudio|tengo|mi (?:novia|novio|esposa|mama|papa|hermano|hermana|hijo|hija|jefe|perro|gato|pc|celular|carro|casa|cumpleanos|correo|horario|examen)|mis \w+ son)\b", t):
        return {"texto": crudo, "tema": "dato"}
    if not pregunta and re.search(r"\b(\d{1,2} de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)|el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b", t):
        return {"texto": crudo, "tema": "fecha"}
    return None


_VACIAS = set("que con una uno los las del por mis sus hay muy mas pero para como esta este eso esa ese tengo tiene "
              "algo cual cuando donde sobre entre todo toda nada solo tambien porque mucho poco".split())


def _palabras(t):
    return set(w for w in re.findall(r"\w{3,}", _n(t)) if w not in _VACIAS)


def relevantes(hechos, consulta, k=6):
    """Pedidos siempre primero; luego los que comparten palabras con el mensaje. PURO."""
    q = _palabras(consulta)
    pun = []
    for h in hechos:
        s = len(q & _palabras(h["texto"])) * 2 + (3 if h.get("tema") == "pedido" else 0)
        if s > 0:
            pun.append((s, h.get("ts", 0), h))
    pun.sort(key=lambda x: (-x[0], -x[1]))
    return [x[2] for x in pun[:k]]


def es_duplicado(hechos, texto):
    p = _palabras(texto)
    for h in hechos:
        q = _palabras(h["texto"])
        if p and q and len(p & q) / float(len(p | q)) >= 0.8:
            return h
    return None


class Recuerdos:
    def __init__(self, archivo=None):
        self.archivo = archivo or ARCH

    def todos(self):
        try:
            with open(self.archivo, encoding="utf-8") as f:
                d = json.load(f)
            return d if isinstance(d, list) else []
        except (OSError, ValueError):
            return []

    def _guardar(self, l):
        os.makedirs(os.path.dirname(self.archivo) or ".", exist_ok=True)
        tmp = self.archivo + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(l[-MAX:], f, ensure_ascii=False, indent=1)
        os.replace(tmp, self.archivo)

    def observar(self, mensaje):
        """Llamar con cada mensaje de Daniel. Devuelve el hecho guardado o None."""
        h = vale(mensaje)
        if not h:
            return None
        with _lock:
            l = self.todos()
            d = es_duplicado(l, h["texto"])
            if d:                                   # lo más nuevo reemplaza (cambió de opinión)
                l.remove(d)
            h["ts"] = int(time.time())
            l.append(h)
            self._guardar(l)
        return h

    def contexto(self, mensaje):
        r = relevantes(self.todos(), mensaje)
        return ("Lo que sabes de Daniel (dicho por él; úsalo solo si viene al caso):\n" +
                "\n".join("- " + x["texto"] for x in r)) if r else ""

    def manejar(self, texto):
        t = _n(texto)
        v = vale(texto)
        if v and v["tema"] == "pedido":            # "recuerda que…": se guarda y se confirma, sin gastar el modelo
            self.observar(texto)
            return "Anotado: %s" % v["texto"]
        if re.match(r"^(?:que|qué)?\s*(?:recuerdas|sabes) de mi\??$", t) or t in ("recuerdos", "mis recuerdos"):
            l = self.todos()
            if not l:
                return "Aún no guardé nada sobre ti. Dime cosas como «recuerda que…» o «prefiero…»."
            return "Lo que recuerdo de ti:\n" + "\n".join("· %s (%s)" % (x["texto"], x["tema"]) for x in l[-25:])
        m = re.match(r"^(?:olvida|borra el recuerdo|olvidate de)\s+(?:que\s+)?(.{3,})$", t)
        if m:
            q = _palabras(m.group(1))
            with _lock:
                l = self.todos()
                quedan = [x for x in l if not (q and len(q & _palabras(x["texto"])) >= max(1, len(q) // 2))]
                n = len(l) - len(quedan)
                if n:
                    self._guardar(quedan)
            return "Olvidé %d recuerdo(s)." % n if n else "No tenía nada sobre eso."
        return None
