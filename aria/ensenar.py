# -*- coding: utf-8 -*-
"""ARIA - Modo enseñar: le muestras una tarea UNA vez y queda guardada como rutina.

Uso en el chat:
  enséñame <nombre>        -> empieza a grabar (ej. "enséñame abrir trabajo")
  abre notepad             -> cada mensaje siguiente es un paso
  espera 2 / espera la ventana Bloc
  escribe hola mundo / enter / tab / clic 300 400 / desplaza abajo 3
  listo                    -> guarda la rutina  (cancela -> la descarta)
  haz <nombre>             -> la repite
  rutinas                  -> lista las guardadas      borra rutina <nombre>

Los pasos se ejecutan con app_automator (ctypes, sin dependencias ni servidores).
El analisis de pasos es PURO y testeable; ejecutar recibe el 'runner' inyectado.
Archivo: data/rutinas.json
"""
import json
import os
import re
import time

_DIR = os.path.dirname(os.path.abspath(__file__))
ARCH = os.path.join(_DIR, "data", "rutinas.json")
TECLAS = {"enter": 0x0D, "intro": 0x0D, "tab": 0x09, "escape": 0x1B, "esc": 0x1B,
          "espacio": 0x20, "borrar": 0x08, "arriba": 0x26, "abajo": 0x28,
          "izquierda": 0x25, "derecha": 0x27, "suprimir": 0x2E}
MAX_PASOS = 40


def _norm(t):
    t = (t or "").strip().lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n")):
        t = t.replace(a, b)
    return t


def paso(texto):
    """Convierte una frase en un paso {accion, ...} o None si no se entiende. PURO."""
    crudo = (texto or "").strip()
    t = _norm(crudo)
    m = re.match(r"^(?:abre|abrir|lanza|ejecuta)\s+(.+)$", t)
    if m:
        return {"accion": "launch", "path": crudo.split(None, 1)[1].strip().strip("\"'")}
    m = re.match(r"^(?:espera|esperar)\s+(?:a\s+)?(?:la\s+)?ventana\s+(.+)$", t)
    if m:
        return {"accion": "wait", "title": crudo.split("ventana", 1)[1].strip(), "timeout": 15.0}
    m = re.match(r"^(?:espera|esperar|pausa)\s+(\d+(?:[.,]\d+)?)\s*(?:s|seg|segundos?)?$", t)
    if m:
        return {"accion": "sleep", "s": min(60.0, float(m.group(1).replace(",", ".")))}
    m = re.match(r"^(?:escribe|escribir|teclea)\s+(.+)$", t, re.S)
    if m:
        return {"accion": "type", "text": crudo.split(None, 1)[1]}
    m = re.match(r"^(?:pulsa|presiona|tecla\s+)?\s*(" + "|".join(TECLAS) + r")$", t)
    if m:
        return {"accion": "key", "vk": TECLAS[m.group(1)], "nombre": m.group(1)}
    m = re.match(r"^(?:clic|click|haz clic en)\s+(\d+)\s*[, ]\s*(\d+)$", t)
    if m:
        return {"accion": "click", "x": int(m.group(1)), "y": int(m.group(2))}
    m = re.match(r"^(?:desplaza|scroll)\s+(arriba|abajo)(?:\s+(\d+))?$", t)
    if m:
        return {"accion": "scroll", "x": 0, "y": 0, "direction": "up" if m.group(1) == "arriba" else "down",
                "clicks": int(m.group(2) or 3)}
    return None


def describir(p):
    """Texto corto de un paso. PURO."""
    a = p.get("accion")
    return {"launch": lambda: "abrir %s" % p.get("path"),
            "wait": lambda: "esperar la ventana «%s»" % p.get("title"),
            "sleep": lambda: "esperar %g s" % p.get("s"),
            "type": lambda: "escribir «%s»" % (p.get("text", "")[:40]),
            "key": lambda: "tecla %s" % p.get("nombre"),
            "click": lambda: "clic en %d,%d" % (p.get("x"), p.get("y")),
            "scroll": lambda: "desplazar %s %d" % ("arriba" if p.get("direction") == "up" else "abajo", p.get("clicks")),
            }.get(a, lambda: a)()


class Ensenador:
    def __init__(self, archivo=None, runner=None, dormir=time.sleep):
        self.archivo = archivo or ARCH
        self.runner = runner
        self.dormir = dormir
        self.grabando = None          # {"nombre":..., "pasos":[...]}

    # ---------------- persistencia
    def rutinas(self):
        try:
            with open(self.archivo, encoding="utf-8") as f:
                d = json.load(f)
                return d if isinstance(d, dict) else {}
        except (OSError, ValueError):
            return {}

    def _guardar(self, d):
        os.makedirs(os.path.dirname(self.archivo) or ".", exist_ok=True)
        with open(self.archivo, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)

    # ---------------- chat
    def manejar(self, texto):
        """Devuelve la respuesta (str) si el mensaje es del modo enseñar; None si no."""
        t = _norm(texto)
        if self.grabando is not None:
            if t in ("listo", "fin", "termine", "ya", "guarda", "guardalo"):
                g, self.grabando = self.grabando, None
                if not g["pasos"]:
                    return "No grabé ningún paso; no guardé «%s»." % g["nombre"]
                d = self.rutinas(); d[g["nombre"]] = {"pasos": g["pasos"], "creada": int(time.time())}
                self._guardar(d)
                return "Aprendido «%s» (%d pasos). Repítelo con: haz %s" % (g["nombre"], len(g["pasos"]), g["nombre"])
            if t in ("cancela", "cancelar", "olvidalo"):
                n = self.grabando["nombre"]; self.grabando = None
                return "Descarté «%s»." % n
            p = paso(texto)
            if p is None:
                return ("No entendí ese paso. Usa: abre X · espera 2 · espera la ventana X · escribe X · "
                        "enter/tab/escape · clic X Y · desplaza abajo 3. «listo» para guardar.")
            if len(self.grabando["pasos"]) >= MAX_PASOS:
                return "Máximo %d pasos. Di «listo» para guardar." % MAX_PASOS
            self.grabando["pasos"].append(p)
            return "%d. %s ✓" % (len(self.grabando["pasos"]), describir(p))
        m = re.match(r"^(?:ensename|ensenar|aprende(?:te)?|graba(?:r)?)\s+(?:a\s+)?(.+)$", t)
        if m:
            nombre = m.group(1).strip()[:40]
            self.grabando = {"nombre": nombre, "pasos": []}
            return "Te miro. Dime los pasos de «%s» uno por mensaje; «listo» para guardar." % nombre
        if t in ("rutinas", "mis rutinas", "que sabes hacer"):
            d = self.rutinas()
            if not d:
                return "Aún no me enseñaste rutinas. Prueba: enséñame <nombre>"
            return "Rutinas: " + " · ".join("%s (%d)" % (k, len(v.get("pasos", []))) for k, v in sorted(d.items()))
        m = re.match(r"^borra(?:r)?\s+(?:la\s+)?rutina\s+(.+)$", t)
        if m:
            d = self.rutinas(); n = m.group(1).strip()
            if n not in d:
                return "No tengo la rutina «%s»." % n
            del d[n]; self._guardar(d)
            return "Borré «%s»." % n
        m = re.match(r"^(?:haz|hazme|ejecuta|repite)\s+(?:la\s+rutina\s+)?(.+)$", t)
        if m and m.group(1).strip() in self.rutinas():
            return self.ejecutar(m.group(1).strip())
        return None

    def ejecutar(self, nombre):
        r = self.rutinas().get(nombre)
        if not r:
            return "No tengo la rutina «%s»." % nombre
        if self.runner is None:
            try:
                from app_automator import run as _run
                self.runner = _run
            except Exception as exc:
                return "No puedo controlar el escritorio aquí (%s)." % exc
        hechos = []
        for i, p in enumerate(r.get("pasos", []), 1):
            try:
                if p["accion"] == "sleep":
                    self.dormir(float(p.get("s", 1)))
                    res = {"status": "ok"}
                else:
                    kw = {k: v for k, v in p.items() if k not in ("accion", "nombre")}
                    res = self.runner(p["accion"], **kw) or {}
                if isinstance(res, dict) and res.get("status") == "error":
                    return "Paré en el paso %d (%s): %s" % (i, describir(p), res.get("error"))
                hechos.append(describir(p))
                self.dormir(0.25)
            except Exception as exc:
                return "Paré en el paso %d (%s): %s" % (i, describir(p), exc)
        return "Hecho «%s»: %s." % (nombre, " → ".join(hechos))
