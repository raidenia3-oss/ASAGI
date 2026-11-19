# -*- coding: utf-8 -*-
"""ARIA - Manos en la PC: usa las apps de Windows leyendo su ÁRBOL DE ACCESIBILIDAD
(UI Automation), no capturas de pantalla. Idea tomada de vercel-labs/agent-desktop:

  observar (snapshot con refs) -> actuar sobre un ref -> volver a observar para verificar

- Cada snapshot tiene un id; sus refs son "@<id>:e<N>". Un ref de un snapshot viejo se
  rechaza (REF_VIEJO) en vez de tocar algo equivocado: se toma otro snapshot.
- Sin mover el mouse ni robar el foco: Invoke / Toggle / Select / Expand / SetValue de UIA.
  Solo si el elemento no ofrece ninguno de esos, y con permiso (con_mouse=True), hace clic
  físico en su centro.
- Cada error dice si es seguro reintentar (reintento: "seguro" | "no").
- Seguridad: nunca escribe en campos de contraseña; no opera ventanas de banca/pagos;
  lo irreversible (enviar, pagar, borrar, comprar, publicar…) pide confirmación.

Chat:  manos pc: abre notepad, escribe hola, toca Archivo        (pasos)
       manos pc: abre la calculadora y calcula 12 por 7           (objetivo: ARIA decide)
       mira la pantalla                                            (snapshot legible)

Sin dependencias nuevas: comtypes ya viene con pyttsx3 (la voz de ARIA). Sin servidores.
Lo que decide (refs, filtrar, describir, leer la decisión del modelo) es PURO y testeable;
el acceso a Windows está en UIABackend y se inyecta.
"""
import json
import random
import re
import string
import time

RIESGO = re.compile(r"\b(enviar|send|pagar|pago|comprar|compra|confirmar|transferir|borrar|eliminar|delete|publicar|post|aceptar|suscribir|instalar|desinstalar|formatear|vaciar)\b", re.I)
BANCA = re.compile(r"(bank|banco|bcp|interbank|bbva|scotiabank|yape|plin|paypal|binance|wallet|mercadopago|izipay)", re.I)
MAX_NODOS = 220
ROLES_ACCION = {"boton", "casilla", "combo", "campo", "enlace", "item", "menuitem", "radio", "pestana", "arbolitem",
                "splitbutton", "deslizador", "documento", "celda"}
ROL = {50000: "boton", 50002: "casilla", 50003: "combo", 50004: "campo", 50005: "enlace", 50007: "item",
       50008: "lista", 50009: "menu", 50010: "barramenu", 50011: "menuitem", 50013: "radio", 50015: "deslizador",
       50018: "pestanas", 50019: "pestana", 50020: "texto", 50021: "barraherr", 50023: "arbol", 50024: "arbolitem",
       50026: "grupo", 50028: "tabla", 50029: "celda", 50030: "documento", 50031: "splitbutton", 50032: "ventana",
       50033: "panel", 50037: "titulo"}


class ErrorManos(Exception):
    def __init__(self, codigo, msg, reintento="no"):
        Exception.__init__(self, msg)
        self.codigo, self.reintento = codigo, reintento


def _n(t):
    t = (t or "").strip().lower()
    for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n")):
        t = t.replace(a, b)
    return t


# ----------------------------------------------------------------- snapshot (PURO)
def nuevo_id():
    return "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(6))


def armar_snapshot(ventana, nodos, sid=None, solo_interactivos=True):
    """nodos: [{rol, nombre, valor?, clave?, acciones:[...], rect:(l,t,r,b), h:<handle>}] -> snapshot.
    Asigna refs @sid:eN solo a lo accionable (o a todo si solo_interactivos=False)."""
    sid = sid or nuevo_id()
    items, mapa = [], {}
    for nd in nodos[:MAX_NODOS * 3]:
        accionable = bool(nd.get("acciones")) or nd.get("rol") in ROLES_ACCION
        if solo_interactivos and not accionable:
            continue
        if not (nd.get("nombre") or nd.get("valor") or nd.get("rol") == "campo"):
            continue
        n = len(items) + 1
        ref = "@%s:e%d" % (sid, n)
        it = {"ref": ref, "rol": nd.get("rol", "?"), "nombre": (nd.get("nombre") or "")[:80]}
        if nd.get("valor"):
            it["valor"] = "••••" if nd.get("clave") else str(nd["valor"])[:60]
        if nd.get("clave"):
            it["clave"] = True
        if nd.get("acciones"):
            it["acciones"] = nd["acciones"]
        items.append(it)
        mapa[ref] = nd
        if len(items) >= MAX_NODOS:
            break
    return {"id": sid, "ventana": ventana.get("titulo", ""), "app": ventana.get("app", ""), "hwnd": ventana.get("hwnd"),
            "items": items, "completo": len(items) < MAX_NODOS, "ts": time.time()}, mapa


def texto_snapshot(snap, maximo=70):
    """Lo que ve el modelo: una línea por elemento. PURO."""
    lin = ["Ventana: %s" % snap.get("ventana", "?")]
    for it in snap["items"][:maximo]:
        ref = it["ref"].split(":")[-1]
        extra = (" = «%s»" % it["valor"]) if it.get("valor") else ""
        lin.append("%s %s «%s»%s%s" % (ref, it["rol"], it["nombre"], extra, " {clave}" if it.get("clave") else ""))
    if len(snap["items"]) > maximo:
        lin.append("… (%d más)" % (len(snap["items"]) - maximo))
    return "\n".join(lin)


def resolver_ref(ref, snap):
    """Acepta '@id:e5', 'e5' o 5 contra el snapshot ACTUAL. PURO. -> ref completo o ErrorManos."""
    r = str(ref).strip()
    m = re.match(r"^@(\w+):e(\d+)$", r)
    if m:
        if m.group(1) != snap["id"]:
            raise ErrorManos("REF_VIEJO", "ese ref es de una vista anterior; vuelvo a mirar", "seguro")
        r = "@%s:e%s" % (snap["id"], m.group(2))
    else:
        m = re.match(r"^e?(\d+)$", r)
        if not m:
            raise ErrorManos("REF_INVALIDO", "ref inválido: %s" % r)
        r = "@%s:e%s" % (snap["id"], m.group(1))
    if not any(it["ref"] == r for it in snap["items"]):
        raise ErrorManos("REF_INEXISTENTE", "no hay %s en la pantalla" % r, "seguro")
    return r


def buscar(snap, texto):
    """Mejor elemento por nombre: exacto > empieza > contiene. PURO."""
    q = _n(texto)
    mejor, pun = None, 0
    for it in snap["items"]:
        n = _n(it["nombre"])
        p = 3 if n == q else 2 if n.startswith(q) else 1 if q and q in n else 0
        if p > pun:
            mejor, pun = it, p
    return mejor


def cambio(a, b):
    """¿La pantalla cambió entre dos snapshots? PURO."""
    if a is None or b is None:
        return True
    fa = [(i["rol"], i["nombre"], i.get("valor")) for i in a["items"]]
    fb = [(i["rol"], i["nombre"], i.get("valor")) for i in b["items"]]
    return fa != fb or a.get("ventana") != b.get("ventana")


def paso(frase):
    """Frase -> paso. PURO."""
    crudo = (frase or "").strip()
    t = _n(crudo)
    m = re.match(r"^(?:abre|abrir|lanza|ejecuta)\s+(.+)$", t)
    if m:
        return {"a": "abrir", "app": crudo.split(None, 1)[1].strip()}
    m = re.match(r"^(?:toca|tocar|clic en|click en|pulsa|presiona|selecciona)\s+(.+)$", t)
    if m:
        return {"a": "tocar", "texto": crudo[len(crudo) - len(m.group(1)):].strip().strip("\"'«»")}
    m = re.match(r"^(?:escribe|escribir|teclea)\s+(?:en\s+(.+?)\s*:\s*)?(.+)$", t)
    if m:
        campo = crudo[m.start(1):m.end(1)] if m.group(1) else None
        return {"a": "escribir", "texto": crudo[m.start(2):m.end(2)].strip().strip("\"'«»"), "campo": campo}
    m = re.match(r"^(?:pulsa|tecla)\s+(enter|intro|tab|escape|esc)$", t) or re.match(r"^(enter|intro|tab|escape|esc)$", t)
    if m:
        return {"a": "tecla", "tecla": m.group(1)}
    m = re.match(r"^(?:espera|esperar)\s+(\d+)\s*s?$", t)
    if m:
        return {"a": "esperar", "s": min(15, int(m.group(1)))}
    m = re.match(r"^(?:desplaza|baja|sube)\s*(arriba|abajo)?$", t)
    if m:
        return {"a": "desplazar", "dir": m.group(1) or ("arriba" if t.startswith("sube") else "abajo")}
    return None


def pasos(texto):
    partes = [x for x in re.split(r"\s*(?:,|;|\by luego\b|\bluego\b|\bdespu[eé]s\b)\s*", texto or "", flags=re.I) if x]
    out = []
    for p in partes:
        x = paso(p)
        if x is None:
            return None
        out.append(x)
    return out or None


REGLAS = ('Controlas apps de Windows de Daniel leyendo su árbol de accesibilidad. Responde SOLO un JSON con UNA acción: '
          '{"accion":"tocar","ref":"e12"} | {"accion":"escribir","ref":"e5","texto":"..."} | {"accion":"tecla","tecla":"enter"} | '
          '{"accion":"abrir","app":"notepad"} | {"accion":"desplazar","dir":"abajo"} | {"accion":"listo","resumen":"..."} | '
          '{"accion":"imposible","resumen":"por qué"}. Usa SOLO refs de la lista actual. Nunca escribas claves ni datos de '
          'tarjetas. Tras cada acción verás la pantalla nueva: comprueba que funcionó antes de seguir.')


def leer_decision(txt):
    m = re.search(r"\{.*?\}", txt or "", re.S)
    if not m:
        return None
    try:
        o = json.loads(m.group(0))
    except ValueError:
        return None
    a = _n(o.get("accion", ""))
    if a in ("listo", "imposible"):
        return {"a": a, "resumen": str(o.get("resumen", ""))}
    if a == "tocar":
        return {"a": "tocar", "ref": o.get("ref"), "texto": o.get("texto")}
    if a == "escribir":
        return {"a": "escribir", "ref": o.get("ref"), "texto": str(o.get("texto", ""))}
    if a == "tecla":
        return {"a": "tecla", "tecla": _n(o.get("tecla", "enter"))}
    if a == "abrir":
        return {"a": "abrir", "app": str(o.get("app", ""))}
    if a == "desplazar":
        return {"a": "desplazar", "dir": "arriba" if _n(o.get("dir", "")) == "arriba" else "abajo"}
    return None


def describir(p):
    return {"abrir": lambda: "abrir %s" % p.get("app"), "tocar": lambda: "tocar %s" % (p.get("texto") or p.get("ref")),
            "escribir": lambda: "escribir «%s»" % str(p.get("texto", ""))[:30], "tecla": lambda: "tecla %s" % p.get("tecla"),
            "esperar": lambda: "esperar %ss" % p.get("s"), "desplazar": lambda: "desplazar %s" % p.get("dir")}.get(p["a"], lambda: p["a"])()


# ----------------------------------------------------------------- motor (con backend inyectado)
class Manos:
    def __init__(self, backend=None, confirmar=None, dormir=time.sleep, con_mouse=False):
        self.b = backend
        self.confirmar = confirmar or (lambda texto: False)
        self.dormir = dormir
        self.con_mouse = con_mouse
        self.snap, self.mapa = None, {}

    def _backend(self):
        if self.b is None:
            self.b = UIABackend()
        return self.b

    def mirar(self, solo_interactivos=True):
        b = self._backend()
        v = b.ventana_activa()
        if not v:
            raise ErrorManos("SIN_VENTANA", "no hay ventana activa", "seguro")
        if BANCA.search(v.get("titulo", "") + " " + v.get("app", "")):
            raise ErrorManos("BANCA", "estás en una app de banca/pagos: no la opero")
        self.snap, self.mapa = armar_snapshot(v, b.nodos(v), solo_interactivos=solo_interactivos)
        return self.snap

    def _elem(self, p):
        if self.snap is None:
            self.mirar()
        if p.get("ref"):
            return self.mapa[resolver_ref(p["ref"], self.snap)]
        it = buscar(self.snap, p.get("texto") or p.get("campo") or "")
        if it is None:
            raise ErrorManos("NO_ENCONTRADO", "no veo «%s» en la ventana" % (p.get("texto") or p.get("campo")), "seguro")
        return self.mapa[it["ref"]]

    def hacer(self, p):
        b = self._backend()
        a = p["a"]
        if a == "abrir":
            if BANCA.search(p["app"]):
                raise ErrorManos("BANCA", "no abro apps de banca/pagos")
            b.abrir(p["app"])
            self.dormir(1.5)
            return "ok"
        if a == "esperar":
            self.dormir(p["s"]); return "ok"
        if a == "tecla":
            b.tecla(p["tecla"]); return "ok"
        if a == "desplazar":
            b.desplazar(self.snap and self.mapa or {}, p["dir"]); return "ok"
        if a == "escribir":
            if self.snap is None:
                self.mirar()
            if p.get("ref") or p.get("campo"):
                nd = self._elem({"ref": p.get("ref"), "texto": p.get("campo")})
            else:
                cand = [it for it in self.snap["items"] if it["rol"] in ("campo", "documento", "combo") and not it.get("clave")]
                if not cand:
                    raise ErrorManos("SIN_CAMPO", "no hay campo de texto en la ventana", "seguro")
                nd = self.mapa[cand[0]["ref"]]
            if nd.get("clave"):
                raise ErrorManos("CLAVE", "es un campo de contraseña: no escribo ahí")
            b.escribir(nd, p["texto"])
            return "ok"
        nd = self._elem(p)
        nombre = nd.get("nombre") or ""
        if a == "tocar":
            if RIESGO.search(_n(nombre)) and not self.confirmar("ARIA va a tocar «%s» (no se puede deshacer). ¿Sigo?" % nombre):
                raise ErrorManos("NO_CONFIRMADO", "no confirmaste «%s»" % nombre)
            b.activar(nd, self.con_mouse)
            return "ok"
        raise ErrorManos("PASO", "paso desconocido")

    def ejecutar(self, lista, cancelado=lambda: False):
        hechos = []
        for i, p in enumerate(lista, 1):
            if cancelado():
                return {"ok": False, "hechos": hechos, "motivo": "detenido"}
            antes = None
            for intento in range(2):                       # reintenta solo si el error lo permite
                try:
                    if p["a"] in ("tocar", "escribir"):
                        self.mirar()
                    antes = self.snap
                    self.hacer(p)
                    break
                except ErrorManos as e:
                    if e.reintento == "seguro" and intento == 0:
                        self.dormir(0.8); continue
                    return {"ok": False, "hechos": hechos, "en": i, "paso": describir(p), "motivo": str(e)}
                except Exception as e:
                    return {"ok": False, "hechos": hechos, "en": i, "paso": describir(p), "motivo": "Windows: %s" % e}
            self.dormir(0.5)
            try:
                despues = self.mirar()
                nota = "" if (p["a"] in ("abrir", "esperar") or cambio(antes, despues)) else " (sin cambio visible)"
            except ErrorManos:
                nota = ""
            hechos.append(describir(p) + nota)
        return {"ok": True, "hechos": hechos}

    def agente(self, objetivo, pensar, maximo=15, cancelado=lambda: False):
        hist, igual, prev = [], 0, None
        for _ in range(maximo):
            if cancelado():
                return {"ok": False, "hechos": hist, "motivo": "detenido"}
            try:
                snap = self.mirar()
            except ErrorManos as e:
                return {"ok": False, "hechos": hist, "motivo": str(e)}
            igual = igual + 1 if not cambio(prev, snap) else 0
            prev = snap
            if igual >= 3:
                return {"ok": False, "hechos": hist, "motivo": "la pantalla no cambia; me detengo"}
            d = leer_decision(pensar(REGLAS + "\n\nObjetivo: " + objetivo + "\nYa hice: " + (" → ".join(hist) or "nada") +
                                     "\n\n" + texto_snapshot(snap)))
            if d is None:
                return {"ok": False, "hechos": hist, "motivo": "no entendí la decisión del modelo"}
            if d["a"] == "listo":
                return {"ok": True, "hechos": hist, "resumen": d["resumen"]}
            if d["a"] == "imposible":
                return {"ok": False, "hechos": hist, "motivo": d["resumen"] or "no se puede"}
            try:
                self.hacer(d)
                hist.append(describir(d))
            except ErrorManos as e:
                hist.append("%s (falló: %s)" % (describir(d), e))
                if e.reintento != "seguro":
                    return {"ok": False, "hechos": hist, "motivo": str(e)}
            self.dormir(0.6)
        return {"ok": False, "hechos": hist, "motivo": "llegué al tope de %d pasos" % maximo}


def formato(r):
    s = ("🖐 Listo" + (": " + r["resumen"] if r.get("resumen") else ".")) if r["ok"] else \
        ("🖐 Paré" + (" en el paso %d (%s)" % (r["en"], r["paso"]) if r.get("en") else "") + ": " + r["motivo"])
    return s + ("\nHice: " + " → ".join(r["hechos"]) if r.get("hechos") else "")


# ----------------------------------------------------------------- Windows: UI Automation por comtypes
class UIABackend:
    """Acceso real a Windows. comtypes ya está instalado (lo usa pyttsx3)."""

    TECLAS = {"enter": 0x0D, "intro": 0x0D, "tab": 0x09, "escape": 0x1B, "esc": 0x1B}

    def __init__(self):
        import ctypes
        import comtypes.client
        comtypes.client.GetModule("UIAutomationCore.dll")
        from comtypes.gen import UIAutomationClient as U
        self.U = U
        self.ct = ctypes
        self.u32 = ctypes.windll.user32
        self.uia = comtypes.client.CreateObject(U.CUIAutomation, interface=U.IUIAutomation)
        self.walker = self.uia.ControlViewWalker

    def ventana_activa(self):
        h = self.u32.GetForegroundWindow()
        if not h:
            return None
        buf = self.ct.create_unicode_buffer(300)
        self.u32.GetWindowTextW(h, buf, 300)
        pid = self.ct.c_ulong()
        self.u32.GetWindowThreadProcessId(h, self.ct.byref(pid))
        return {"hwnd": h, "titulo": buf.value, "app": str(pid.value)}

    def _patrones(self, el):
        U, acc = self.U, []
        for nombre, pid in (("invocar", U.UIA_InvokePatternId), ("alternar", U.UIA_TogglePatternId),
                            ("seleccionar", U.UIA_SelectionItemPatternId), ("expandir", U.UIA_ExpandCollapsePatternId),
                            ("valor", U.UIA_ValuePatternId)):
            try:
                if el.GetCurrentPattern(pid):
                    acc.append(nombre)
            except Exception:
                pass
        return acc

    def nodos(self, ventana, limite_s=3.0):
        root = self.uia.ElementFromHandle(ventana["hwnd"])
        out, t0, pila = [], time.time(), [(root, 0)]
        while pila and len(out) < MAX_NODOS * 3 and time.time() - t0 < limite_s:
            el, prof = pila.pop()
            try:
                if not el.CurrentIsOffscreen:
                    r = el.CurrentBoundingRectangle
                    nd = {"rol": ROL.get(el.CurrentControlType, "otro"), "nombre": el.CurrentName or "",
                          "clave": bool(el.CurrentIsPassword), "rect": (r.left, r.top, r.right, r.bottom), "h": el}
                    if el.CurrentIsEnabled:
                        nd["acciones"] = self._patrones(el)
                    if "valor" in nd.get("acciones", []):
                        try:
                            vp = el.GetCurrentPattern(self.U.UIA_ValuePatternId).QueryInterface(self.U.IUIAutomationValuePattern)
                            nd["valor"] = vp.CurrentValue
                        except Exception:
                            pass
                    out.append(nd)
            except Exception:
                continue
            if prof < 30:
                hijos = []
                try:
                    c = self.walker.GetFirstChildElement(el)
                    while c is not None and len(hijos) < 400:
                        hijos.append(c)
                        c = self.walker.GetNextSiblingElement(c)
                except Exception:
                    pass
                for c in reversed(hijos):                   # orden de lectura natural
                    pila.append((c, prof + 1))
        return out

    def _pat(self, el, pid, iface):
        p = el.GetCurrentPattern(pid)
        return p.QueryInterface(iface) if p else None

    def activar(self, nd, con_mouse=False):
        U, el = self.U, nd["h"]
        try:
            for pid, iface, fn in ((U.UIA_InvokePatternId, U.IUIAutomationInvokePattern, "Invoke"),
                                   (U.UIA_TogglePatternId, U.IUIAutomationTogglePattern, "Toggle"),
                                   (U.UIA_SelectionItemPatternId, U.IUIAutomationSelectionItemPattern, "Select"),
                                   (U.UIA_ExpandCollapsePatternId, U.IUIAutomationExpandCollapsePattern, "Expand")):
                p = self._pat(el, pid, iface)
                if p is not None:
                    getattr(p, fn)()
                    return
        except Exception as exc:
            if "ElementNotAvailable" in str(exc) or "-2147220991" in str(exc):
                raise ErrorManos("REF_VIEJO", "ese elemento ya no está; vuelvo a mirar", "seguro")
            raise
        if not con_mouse:
            raise ErrorManos("SIN_ACCION", "«%s» no acepta clic por accesibilidad (activa el modo con mouse)" % nd.get("nombre"))
        l, t, r, b = nd["rect"]
        from app_automator import click
        click((l + r) // 2, (t + b) // 2)

    def escribir(self, nd, texto):
        el = nd["h"]
        p = self._pat(el, self.U.UIA_ValuePatternId, self.U.IUIAutomationValuePattern)
        if p is not None and not p.CurrentIsReadOnly:
            p.SetValue(texto)
            return
        el.SetFocus()                                       # editores ricos (Bloc de notas nuevo, Word): teclado
        from app_automator import send_text
        send_text(texto)

    def tecla(self, nombre):
        from app_automator import key_press
        key_press(self.TECLAS.get(nombre, 0x0D))

    def desplazar(self, mapa, direccion):
        U = self.U
        for nd in mapa.values():
            try:
                p = self._pat(nd["h"], U.UIA_ScrollPatternId, U.IUIAutomationScrollPattern)
                if p is not None:
                    p.Scroll(2, 3 if direccion == "abajo" else 0)      # NoAmount horiz, LargeIncrement/Decrement vert
                    return
            except Exception:
                continue
        from app_automator import scroll
        scroll(700, 450, 5, "down" if direccion == "abajo" else "up")

    def abrir(self, app):
        from app_automator import launch_app
        nombres = {"bloc de notas": "notepad", "calculadora": "calc", "explorador": "explorer", "paint": "mspaint",
                   "configuracion": "ms-settings:", "ajustes": "ms-settings:", "terminal": "wt", "cmd": "cmd"}
        r = launch_app(nombres.get(_n(app), app))
        if r.get("status") != "ok":
            raise ErrorManos("NO_ABRE", "no pude abrir %s: %s" % (app, r.get("error")))


def disponible():
    try:
        import comtypes.client  # noqa: F401
        import ctypes
        return hasattr(ctypes, "windll")
    except Exception:
        return False
