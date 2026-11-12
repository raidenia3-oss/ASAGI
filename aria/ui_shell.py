# -*- coding: utf-8 -*-
"""ARIA - Shell cyberpunk-Linux estilo 'rice' (Hyprland-like).

Rework pesado para que parezca un escritorio Linux montado de verdad, no una terminal:
  - fondo animado (wallpaper personalizable + glow que deriva + montanas low-poly)
  - barra tipo polybar arriba
  - TARJETAS-widget glass cohesivas: reloj grande, info de sistema (avatar + uptime +
    shell + CPU/RAM), mini-calendario con el dia marcado
  - chat terminal al centro
  - DOCK abajo con los toggles (AUTO/CUERPO/VOZ)
Frameless (sin apagado), arrastrable. Paleta cyan/violeta. PyQt5, sin deps nuevas.
IMPORTANTE: QSS de Qt NO soporta box-shadow/transform/transition (se evita).
Regla v2 (solo UI local).
"""
import os
import json
import math
import time
import html
import inspect
import calendar
import re as _re
from datetime import date

try:
    from PyQt5.QtCore import Qt, QTimer, QPointF, QRectF, QThread, pyqtSignal, QEvent, QObject
    from PyQt5.QtGui import (QPainter, QColor, QPen, QBrush, QLinearGradient,
                             QRadialGradient, QPolygonF, QPixmap, QTextCursor, QFont)
    from PyQt5.QtWidgets import (QWidget, QApplication, QVBoxLayout, QHBoxLayout,
                                 QGridLayout, QTextEdit, QLineEdit, QLabel, QPushButton,
                                 QFrame, QScrollArea, QGraphicsDropShadowEffect)
    _QT = True
except Exception:
    _QT = False

CYAN = "#e5c064"
VIOLETA = "#cfc7ff"
TEAL = "#ec6da0"
TXT = "#f3e1b5"
VERDE = "#f4aeca"
MONO = "Consolas"
DISPLAY = "Georgia"
PAPEL = "#efe9f7"      # texto de lectura (blanco lila)
LILA = VIOLETA
ROSA = TEAL


def _cargar_fuentes():
    """Registra las fuentes de assets/fonts (si existen). Sin internet ni dependencias."""
    global MONO, DISPLAY
    try:
        from PyQt5.QtGui import QFontDatabase
        base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "fonts")
        fams = set()
        for n in ("JetBrainsMono-Regular.ttf", "JetBrainsMono-SemiBold.ttf",
                  "CormorantGaramond-SemiBold.ttf", "CormorantGaramond-Bold.ttf"):
            fid = QFontDatabase.addApplicationFont(os.path.join(base, n))
            if fid >= 0:
                fams.update(QFontDatabase.applicationFontFamilies(fid))
        if "JetBrains Mono" in fams:
            MONO = "JetBrains Mono"
        corm = [f for f in fams if f.startswith("Cormorant")]
        if corm:
            DISPLAY = corm[0]
    except Exception:
        pass

_DIR = os.path.dirname(os.path.abspath(__file__))
_CFG = os.path.join(_DIR, "data", "fondo.json")


def _cfg_fondo():
    try:
        return json.load(open(_CFG, encoding="utf-8"))
    except Exception:
        return {"wallpaper": "", "animaciones": True, "oscurecer": 0.5}


_ESTADO = os.path.join(_DIR, "data", "shell_state.json")


def _cargar_estado():
    try:
        return json.load(open(_ESTADO, encoding="utf-8"))
    except Exception:
        return {}


def _guardar_estado(d):
    try:
        os.makedirs(os.path.dirname(_ESTADO), exist_ok=True)
        json.dump(d, open(_ESTADO, "w", encoding="utf-8"))
    except Exception:
        pass


def _stats():
    try:
        import psutil
        return psutil.cpu_percent(None), psutil.virtual_memory().percent
    except Exception:
        return 0.0, 0.0


if _QT:
    _CARD = ("background:rgba(14, 16, 30,0.55); border:1px solid rgba(229, 192, 100,0.30);"
             "border-radius:16px;")

    class _Fondo(QWidget):
        """Fondo rice ANIMADO: wallpaper (ken-burns) + glow que deriva + montanas.
        Modo 'matrix': lluvia de katakana ASCII con estela (idea de ascii-magic)."""
        KATAKANA = list("ｱｶｻﾀﾅﾊﾏﾔﾗｦﾂﾇﾍﾐﾓﾜ0123456789:.=*+-<>¦|ç")

        def __init__(self, parent=None):
            super().__init__(parent)
            self._t = 0.0
            self._drag = None
            self._modo = "rice"
            self._buf = None
            self._fs = 0
            self._cols = []
            cfg = _cfg_fondo()
            self._anim = bool(cfg.get("animaciones", True))
            self._osc = float(cfg.get("oscurecer", 0.5))
            self._wall = None
            self.set_wallpaper(cfg.get("wallpaper", ""))
            self._timer = QTimer(self); self._timer.timeout.connect(self._tick)
            self._timer.start(33 if self._anim else 1000)

        def set_modo(self, modo):
            self._modo = modo if modo in ("rice", "matrix") else "rice"
            self._buf = None; self._cols = []
            self.update()
            return self._modo

        def set_wallpaper(self, ruta):
            self._wall = None
            if ruta:
                r = ruta if os.path.isabs(ruta) else os.path.join(_DIR, ruta)
                if os.path.isfile(r):
                    px = QPixmap(r)
                    self._wall = px if not px.isNull() else None
            self.update(); return self._wall is not None

        def _tick(self):
            self._t += 0.016; self.update()

        def mousePressEvent(self, e):
            if e.button() == Qt.LeftButton:
                self._drag = e.globalPos() - self.window().frameGeometry().topLeft()

        def mouseMoveEvent(self, e):
            if self._drag is not None:
                self.window().move(e.globalPos() - self._drag)

        def mouseReleaseEvent(self, e):
            self._drag = None

        def paintEvent(self, e):
            p = QPainter(self); p.setRenderHint(QPainter.Antialiasing)
            W, H = self.width(), self.height(); t = self._t
            if self._modo == "matrix":
                self._matrix(p, W, H)
                p.end(); return
            if self._wall is not None:
                self._wallpaper(p, W, H, t)
            else:
                g = QLinearGradient(0, 0, W, H)
                g.setColorAt(0, QColor(18, 20, 36)); g.setColorAt(0.5, QColor(12, 13, 24))
                g.setColorAt(1, QColor(7, 8, 16)); p.fillRect(0, 0, W, H, g)
            d = 20 if self._anim else 0
            for i, (bx, by, rad, col) in enumerate((
                    (0.16, 0.18, 0.42, QColor(229, 192, 100, 55)),
                    (0.86, 0.14, 0.38, QColor(207, 199, 255, 55)),
                    (0.68, 0.9, 0.5, QColor(236, 109, 160, 38)))):
                cx = W * bx + math.sin(t * 0.3 + i) * d
                cy = H * by + math.cos(t * 0.25 + i) * d
                rg = QRadialGradient(cx, cy, W * rad)
                rg.setColorAt(0, col); rg.setColorAt(1, QColor(0, 0, 0, 0))
                p.setBrush(rg); p.setPen(Qt.NoPen)
                p.drawEllipse(QPointF(cx, cy), W * rad, W * rad)
            self._montanas(p, W, H, math.sin(t * 0.2) * 12 if self._anim else 0)
            p.setPen(QPen(QColor(229, 192, 100, 6), 1))
            for y in range(0, H, 3):
                p.drawLine(0, y, W, y)
            p.end()

        def _wallpaper(self, p, W, H, t):
            zoom = 1.06 + (0.03 * math.sin(t * 0.15) if self._anim else 0)
            esc = self._wall.scaled(int(W * zoom), int(H * zoom),
                                    Qt.KeepAspectRatioByExpanding, Qt.SmoothTransformation)
            px = (W - esc.width()) / 2 + (math.sin(t * 0.1) * 14 if self._anim else 0)
            py = (H - esc.height()) / 2
            p.drawPixmap(int(px), int(py), esc)
            p.fillRect(0, 0, W, H, QColor(8, 10, 18, int(255 * self._osc)))

        def _matrix(self, p, W, H):
            """Lluvia ASCII: buffer persistente + velo oscuro = estela real."""
            import random as _r
            fs = max(12, int(W / 34))
            if (self._buf is None or self._buf.width() != W or self._buf.height() != H
                    or self._fs != fs or not self._cols):
                self._fs = fs
                self._buf = QPixmap(W, H)
                self._buf.fill(QColor(2, 2, 4))
                n = max(1, W // fs)
                self._cols = [{"y": _r.uniform(-H, 0), "v": _r.uniform(5, 16)} for _ in range(n)]
            b = QPainter(self._buf)
            b.fillRect(0, 0, W, H, QColor(3, 3, 5, 24))          # velo -> estela
            f = QFont("MS Gothic"); f.setPixelSize(fs); f.setBold(True)
            b.setFont(f)
            paso = 1.9
            for i, c in enumerate(self._cols):
                x = i * fs
                if c["y"] > 0:
                    ch = _r.choice(self.KATAKANA)
                    b.setPen(QColor(250, 216, 230, 240))
                    b.drawText(int(x), int(c["y"]), ch)
                    b.setPen(QColor(240, 137, 178, 130))
                    b.drawText(int(x), int(c["y"] - fs), ch)
                c["y"] += c["v"] * paso
                if c["y"] > H + _r.uniform(0, H * 0.7):
                    c["y"] = -_r.uniform(0, H * 0.4)
                    c["v"] = _r.uniform(5, 16)
            b.end()
            p.drawPixmap(0, 0, self._buf)
            rg = QRadialGradient(W / 2, H / 2, max(W, H) * 0.7)
            rg.setColorAt(0.4, QColor(0, 0, 0, 0)); rg.setColorAt(1, QColor(1, 1, 3, 170))
            p.setPen(Qt.NoPen); p.setBrush(rg); p.drawRect(0, 0, W, H)

        def _montanas(self, p, W, H, off):
            base = H * 0.82
            for y0, col, picos, alt in ((base, QColor(229, 192, 100, 22), 7, 70),
                                        (base + 28, QColor(207, 199, 255, 22), 5, 120),
                                        (base + 60, QColor(16, 18, 34, 200), 4, 160)):
                poly = QPolygonF(); poly.append(QPointF(0, H))
                for i in range(picos + 1):
                    x = W * i / picos + off * (1 - (y0 - base) / 100.0)
                    poly.append(QPointF(x, y0 - abs(math.sin(i * 1.7 + y0)) * alt))
                poly.append(QPointF(W, H))
                p.setBrush(QBrush(col)); p.setPen(Qt.NoPen); p.drawPolygon(poly)

    # ---------------- widgets de sistema (barras pintadas) ----------------
    class _Barra(QWidget):
        def __init__(self, label, color):
            super().__init__(); self.setFixedHeight(16); self._v = 0.0
            self._label = label; self._color = QColor(color)
        def set_v(self, v): self._v = max(0.0, min(1.0, v)); self.update()
        def paintEvent(self, e):
            p = QPainter(self); p.setRenderHint(QPainter.Antialiasing)
            W, H = self.width(), self.height()
            p.setPen(QColor(TXT)); f = QFont(MONO, 8); p.setFont(f)
            p.drawText(0, 0, 44, H, Qt.AlignVCenter, self._label)
            x = 48; bw = W - x
            p.setBrush(QColor(255, 255, 255, 22)); p.setPen(Qt.NoPen)
            p.drawRoundedRect(QRectF(x, H / 2 - 4, bw, 8), 4, 4)
            p.setBrush(self._color)
            p.drawRoundedRect(QRectF(x, H / 2 - 4, bw * self._v, 8), 4, 4)
            p.end()

    class _CRT(QWidget):
        """Overlay CRT sobre toda la ventana: scanlines, viñeta, glitch y flicker de
        fosforo. WA_TransparentForMouseEvents: no se come ningun clic."""
        def __init__(self, parent=None):
            super().__init__(parent)
            self.setAttribute(Qt.WA_TransparentForMouseEvents, True)
            self.setAttribute(Qt.WA_NoSystemBackground, True)
            self.setAttribute(Qt.WA_TranslucentBackground, True)
            self._activo = True
            self._t = 0.0
            self._timer = QTimer(self); self._timer.timeout.connect(self._tick)
            self._timer.start(40)

        def set_activo(self, v):
            self._activo = bool(v)
            self.update()
            return self._activo

        def _tick(self):
            if not self._activo:
                return
            self._t += 0.04
            self.update()

        def paintEvent(self, e):
            if not self._activo:
                return
            import random as _r
            p = QPainter(self)
            W, H = self.width(), self.height()
            if W <= 0 or H <= 0:
                p.end(); return
            # 1) scanlines
            p.setPen(QPen(QColor(0, 0, 0, 58), 1))
            for y in range(0, H, 3):
                p.drawLine(0, y, W, y)
            # 2) flicker de fosforo (muy sutil, no epiléptico)
            flick = 5 + 4 * math.sin(self._t * 6.0) * math.sin(self._t * 2.3)
            p.fillRect(0, 0, W, H, QColor(244, 171, 200, int(max(0.0, flick))))
            # 3) glitch ocasional: bandas de color
            if _r.random() < 0.06:
                for _ in range(_r.randint(1, 3)):
                    y = _r.randint(0, max(0, H - 20)); h = _r.randint(2, 10)
                    col = (QColor(229, 192, 100, _r.randint(18, 46)) if _r.random() < 0.5
                           else QColor(241, 150, 187, _r.randint(14, 34)))
                    p.fillRect(0, y, W, h, col)
                    p.fillRect(_r.randint(0, 40), y, W, 1, QColor(255, 255, 255, 26))
            # 4) viñeta: esquinas oscuras (sensacion de tubo)
            rg = QRadialGradient(W / 2, H / 2, max(W, H) * 0.72)
            rg.setColorAt(0.55, QColor(0, 0, 0, 0))
            rg.setColorAt(1.0, QColor(0, 0, 0, 195))
            p.setPen(Qt.NoPen); p.setBrush(rg); p.drawRect(0, 0, W, H)
            # 5) aberracion cromatica barata en el filo
            p.setBrush(Qt.NoBrush)
            p.setPen(QPen(QColor(236, 108, 159, 14), 1)); p.drawRect(1, 1, W - 2, H - 2)
            p.setPen(QPen(QColor(236, 108, 159, 10), 1)); p.drawRect(2, 2, W - 4, H - 4)
            p.end()

    class _OrbMini(QWidget):
        """Orb compacto (nucleo_v2) para el 'cuerpo' de ARIA en el shell.
        Refleja el estado real del chat: reposo / pensando / hablando."""
        _NIVEL = {"reposo": 0.3, "pensando": 0.65, "hablando": 1.0,
                  "escuchando": 0.9, "alerta": 0.8, "curiosa": 0.5, "picara": 0.4}

        def __init__(self, parent=None):
            super().__init__(parent)
            self.setFixedSize(160, 160)
            self._nucleo = None
            self._t = 0.0
            self._estado = "reposo"
            try:
                from ui.nucleo_v2 import Nucleo
                self._nucleo = Nucleo()
            except Exception:
                self._nucleo = None
            self._rostro = None
            self.modo = "nucleo"
            try:
                from ui.rostro_aria import Rostro
                self._rostro = Rostro()
            except Exception:
                self._rostro = None
            self._timer = QTimer(self); self._timer.timeout.connect(self._tick)
            self._timer.start(30)

        def set_modo(self, modo):
            self.modo = modo if (modo != "rostro" or self._rostro is not None) else "nucleo"
            self.update()

        def set_estado(self, estado, durante=None):
            """durante (ms): expresion pasajera (curiosa/picara) y vuelve a reposo."""
            if estado in self._NIVEL:
                self._estado = estado
                self.update()
                if durante:
                    QTimer.singleShot(int(durante), lambda: self._estado == estado and self.set_estado("reposo"))

        def _tick(self):
            if not self.isVisible():
                return
            self._t += 0.03
            self.update()

        def paintEvent(self, e):
            p = QPainter(self); p.setRenderHint(QPainter.Antialiasing)
            p.fillRect(self.rect(), QColor(11, 13, 23))
            if self.modo == "rostro" and self._rostro is not None:
                self._rostro.paint(p, QRectF(0, 0, self.width(), self.height()), self._t, self._estado)
            elif self._nucleo is not None:
                self._nucleo.paint(p, QRectF(0, 0, self.width(), self.height()),
                                   self._t, self._estado,
                                   nivel=self._NIVEL.get(self._estado, 0.3),
                                   calidad=None, hud=False, escala=0.34)
            p.end()

    def _formato_skill(r, limite=1200):
        """Resultado de una skill -> texto legible para el log (sin volcar 4KB de WHOIS)."""
        if not isinstance(r, dict):
            return str(r)[:limite]
        if r.get("ok") is False:
            return "ERROR: %s" % r.get("texto", "fallo sin detalle")
        if r.get("registros") is not None:
            reg = r["registros"] or {}
            cab = "%s (proveedor %s)" % (r.get("dominio", ""), r.get("proveedor", "?"))
            lineas = [cab]
            for tipo, vals in reg.items():
                vals = list(vals or [])
                txt = ", ".join(vals[:4]) + (" … +%d" % (len(vals) - 4) if len(vals) > 4 else "")
                lineas.append("  %-4s %s" % (tipo, txt or "-"))
            return "\n".join(lineas)[:limite]
        if "estado" in r and "url" in r:
            return "%s -> HTTP %s · server %s · %s" % (
                r.get("url"), r.get("estado"), r.get("servidor") or "?", r.get("titulo") or "(sin titulo)")[:limite]
        if r.get("texto"):
            partes = [l for l in str(r["texto"]).splitlines() if l.strip()]
            cuerpo = "\n".join(partes[:14])
            if len(partes) > 14:
                cuerpo += "\n  … +%d lineas" % (len(partes) - 14)
            return cuerpo[:limite]
        return json.dumps(r, ensure_ascii=False, indent=1)[:limite]

    class _HoverGlow(QObject):
        """Glow cyan al pasar el cursor. Funciona sobre cualquier widget
        (tarjetas, botones) sin tocar el QSS ni el layout."""
        def __init__(self, widget, blur=18, alpha=110):
            super().__init__(widget)
            self._eff = QGraphicsDropShadowEffect(widget)
            self._eff.setBlurRadius(blur)
            self._eff.setOffset(0, 0)
            self._eff.setColor(QColor(229, 192, 100, 0))
            widget.setGraphicsEffect(self._eff)
            self._alpha = alpha
            widget.installEventFilter(self)

        def eventFilter(self, obj, ev):
            if ev.type() == QEvent.Enter:
                self._eff.setColor(QColor(229, 192, 100, self._alpha))
            elif ev.type() == QEvent.Leave:
                self._eff.setColor(QColor(229, 192, 100, 0))
            return False

    def _tarjeta():
        f = QFrame(); f.setObjectName("tarjeta")
        f.setStyleSheet("QFrame#tarjeta{%s}" % _CARD)   # solo la tarjeta, no sus etiquetas
        _HoverGlow(f)
        return f

    class _ChatWorker(QThread):
        """Un solo hilo para el LLM. El objeto Llama lo toca SOLO este hilo:
        los tokens salen de aqui unicamente por señal (QueuedConnection) y el
        slot del hilo principal es el unico que pinta. Nunca se toca un widget aqui."""
        token = pyqtSignal(str)
        listo = pyqtSignal(str)
        fallo = pyqtSignal(str)

        def __init__(self, responder, texto, parent=None):
            super().__init__(parent)
            self._responder = responder
            self._texto = texto
            self.t0 = time.time()
            self.primer_token = None

        @staticmethod
        def _acepta_on_token(f):
            try:
                sig = inspect.signature(f)
            except (TypeError, ValueError):
                return False
            if "on_token" in sig.parameters:
                return True
            return any(p.kind == inspect.Parameter.VAR_KEYWORD
                       for p in sig.parameters.values())

        def _emitir(self, pieza):
            if self.primer_token is None:
                self.primer_token = time.time() - self.t0
            self.token.emit(pieza)

        def run(self):
            try:
                if self._acepta_on_token(self._responder):
                    r = self._responder(self._texto, on_token=self._emitir)
                else:
                    r = self._responder(self._texto)
                if isinstance(r, dict):
                    r = r.get("response") or r.get("text") or str(r)
                self.listo.emit(str(r))
            except Exception as exc:
                self.fallo.emit("%s: %s" % (type(exc).__name__, exc))

    class Shell(QWidget):
        def __init__(self, responder=None, w=940, h=600, skills=None, runner_skill=None):
            super().__init__(None)
            self.responder = responder
            self.skills = list(skills or [])
            self.runner_skill = runner_skill
            _estado = _cargar_estado()
            if not _estado.get("rostro_v1"):
                _estado["cuerpo"] = "rostro"; _estado["rostro_v1"] = True
                _guardar_estado(_estado)
            self.toggles = {"autonomia": False, "cuerpo": _estado.get("cuerpo") or "rostro",
                            "voz": bool(_estado.get("voz")), "fondo": _estado.get("fondo") or "rice",
                            "crt": _estado.get("crt") is not False, "mascota": bool(_estado.get("mascota"))}
            self._hist = []
            self._es_chat = False
            self._worker = None
            self._acc = ""
            self._pend_idx = None
            self._t0 = 0.0
            self._pre_modo = False
            self.setWindowFlags(Qt.FramelessWindowHint)
            self.resize(w, h); self.setWindowTitle("ARIA")
            self._fondo = _Fondo(self)
            if self.toggles["fondo"] == "matrix":
                self._fondo.set_modo("matrix")
            self._build(); self._reloj()
            self._crt = _CRT(self)
            self._crt.setGeometry(0, 0, self.width(), self.height())
            self._crt.raise_()
            self._crt.set_activo(self.toggles["crt"])
            QTimer.singleShot(2500, self._iniciar_bots)
            QTimer.singleShot(9000, self._auto_actualizar)
            self._actu_t = QTimer(self); self._actu_t.timeout.connect(self._auto_actualizar); self._actu_t.start(6 * 3600 * 1000)
            if self.toggles.get("mascota"):
                QTimer.singleShot(1200, lambda: self._mascota_visible(True))

        # --- bots programados: corren en su hilo; lo que dicen llega al chat por una cola ---
        def _iniciar_bots(self):
            try:
                import queue as _q
                import bots_agenda
                self._bots_cola = _q.Queue()
                if not hasattr(self, "_ens"):
                    import ensenar
                    self._ens = ensenar.Ensenador()
                pensar = (lambda t: str(self.responder(t) or "")) if callable(self.responder) else None
                def _informe(tema):
                    import informe as _inf
                    r = _inf.informe(tema, pensar)
                    return _inf.para_chat(r["md"])[:1500] + (("\n\nCompleto en %s" % r["ruta"]) if r.get("ruta") else "")
                self._agenda = bots_agenda.Agenda(rutina=self._ens.ejecutar, pensar=pensar, avisar=self._bots_cola.put, informe=_informe)
                self._agenda.iniciar()
                self._bots_t = QTimer(self); self._bots_t.timeout.connect(self._bots_leer); self._bots_t.start(1000)
            except Exception as exc:
                print("[UI] bots no arrancaron: %s" % exc, flush=True)

        # --- se actualiza sola desde GitHub (aria/manifest.json del repo de ASAGI) ---
        def _auto_actualizar(self, avisar_si_nada=False):
            import threading as _th

            def _hilo():
                try:
                    import aria_actualizador as _au
                    r = _au.actualizar()
                    txt = _au.resumen(r)
                    if avisar_si_nada or r["instalados"] or r["actualizados"] or r["conflictos"]:
                        cola = getattr(self, "_bots_cola", None)
                        if cola is not None:
                            cola.put("🔄 " + txt)
                except Exception as exc:
                    print("[UI] actualizador: %s" % exc, flush=True)
            _th.Thread(target=_hilo, daemon=True).start()

        def _bots_leer(self):
            try:
                while True:
                    msg = self._bots_cola.get_nowait()
                    self._linea(msg, "aria")
                    self._estado_orb("picara" if msg.startswith("⏰") else "analitica", 2500)
                    if self.isHidden():
                        try:
                            self._bandeja_sistema.tray.showMessage("ARIA", msg[:200])
                        except Exception:
                            pass
            except Exception:
                pass

        def showEvent(self, e):
            super().showEvent(e)
            if not getattr(self, "_blur_ok", False):
                self._blur_ok = True
                try:
                    import pywinstyles           # blur nativo de Windows (opcional, liviano)
                    pywinstyles.apply_style(self, "acrylic")
                except Exception:
                    pass

        def closeEvent(self, e):
            """Cerrar la ventana NO cierra ARIA: la manda a la bandeja.
            Solo 'Salir' del menu (que marca _salir_real) la cierra de verdad."""
            if getattr(self, "_salir_real", False):
                e.accept()
                return
            if getattr(self, "_bandeja_sistema", None) is not None:
                e.ignore()
                self.hide()
                try:
                    self._bandeja_sistema._sincronizar()
                except Exception:
                    pass
                return
            # sin bandeja no hay forma de recuperarla: se acepta el cierre
            e.accept()

        def resizeEvent(self, e):
            self._fondo.setGeometry(0, 0, self.width(), self.height())
            crt = getattr(self, "_crt", None)
            if crt is not None:
                crt.setGeometry(0, 0, self.width(), self.height())
                crt.raise_()

        # --------- construccion ---------
        def _build(self):
            root = QVBoxLayout(self); root.setContentsMargins(18, 12, 18, 12); root.setSpacing(12)
            root.addLayout(self._polybar())
            fila = QHBoxLayout(); fila.setSpacing(12)
            fila.addLayout(self._centro(), 1)
            fila.addLayout(self._widgets(), 0)
            root.addLayout(fila, 1)
            root.addLayout(self._dock())
            self._pintar_toggles()

        def _polybar(self):
            bar = QHBoxLayout(); bar.setSpacing(10)
            ws = QLabel("● 1  2  3  4"); ws.setStyleSheet("color:%s;font:700 11px '%s';letter-spacing:2px;" % (CYAN, MONO))
            tit = QLabel("ARIA // SYSTEM"); tit.setStyleSheet("color:%s;font:700 12px '%s';letter-spacing:3px;" % (TXT, MONO))
            self._lbl_sys = QLabel(""); self._lbl_sys.setStyleSheet("color:%s;font:11px '%s';" % (TEAL, MONO))
            self._lbl_rel = QLabel(""); self._lbl_rel.setStyleSheet("color:%s;font:700 12px '%s';" % (CYAN, MONO))
            bar.addWidget(ws); bar.addStretch(1); bar.addWidget(tit); bar.addStretch(1)
            bar.addWidget(self._lbl_sys); bar.addSpacing(14); bar.addWidget(self._lbl_rel)
            return bar

        def _centro(self):
            col = QVBoxLayout(); col.setSpacing(10)
            self.log = QTextEdit(); self.log.setReadOnly(True)
            self.log.setStyleSheet("QTextEdit{%s color:%s;font:12px '%s';padding:14px;}" % (_CARD, TXT, MONO))
            col.addWidget(self.log, 1)
            self._linea("ARIA en linea · siempre presente", "sys")
            fila = QHBoxLayout(); fila.setSpacing(8)
            pr = QLabel("root@aria:~#"); pr.setStyleSheet("color:%s;font:700 12px '%s';" % (TEAL, MONO))
            self.entrada = QLineEdit(); self.entrada.setPlaceholderText("escribe y Enter...")
            self.entrada.setStyleSheet(
                "QLineEdit{background:rgba(5, 6, 11,0.7);border:1px solid rgba(229, 192, 100,0.5);"
                "border-radius:10px;color:%s;font:12px '%s';padding:10px;}"
                "QLineEdit:focus{border:1px solid %s;}" % (TXT, MONO, CYAN))
            self.entrada.returnPressed.connect(self._enviar)
            self.entrada.textEdited.connect(lambda _t: self._callar())      # empezar a escribirle la interrumpe
            fila.addWidget(pr); fila.addWidget(self.entrada, 1)
            col.addLayout(fila)
            return col

        def _widgets(self):
            col = QVBoxLayout(); col.setSpacing(12)
            self._orb_mini = _OrbMini()
            self._orb_mini.set_modo(self.toggles["cuerpo"])
            self._orb_mini.setVisible(self.toggles["cuerpo"] in ("nucleo", "rostro"))
            col.addWidget(self._orb_mini)
            col.addWidget(self._card_reloj())
            col.addWidget(self._card_sistema())
            col.addWidget(self._card_skills())
            col.addWidget(self._card_calendario())
            col.addStretch(1)
            return col

        def _card_skills(self):
            c = _tarjeta(); c.setFixedWidth(240)
            lay = QVBoxLayout(c); lay.setContentsMargins(12, 10, 12, 10); lay.setSpacing(6)
            self._btn_skills = QPushButton("SKILLS (%d)" % len(self.skills))
            self._btn_skills.setStyleSheet(
                "QPushButton{background:rgba(229, 192, 100,40);color:%s;border:1px solid %s;"
                "border-radius:8px;font:700 11px '%s';padding:6px;}"
                "QPushButton:hover{background:rgba(229, 192, 100,70);}" % (CYAN, CYAN, MONO))
            self._btn_skills.clicked.connect(self._alternar_skills)
            lay.addWidget(self._btn_skills)
            self._scroll_skills = QScrollArea()
            self._scroll_skills.setWidgetResizable(True)
            self._scroll_skills.setFixedHeight(190)
            self._scroll_skills.setStyleSheet(
                "QScrollArea{background:transparent;border:0;}"
                "QScrollBar:vertical{width:6px;background:transparent;}"
                "QScrollBar::handle:vertical{background:%s;border-radius:3px;}" % TEAL)
            self._scroll_skills.setVisible(False)
            dentro = QWidget()
            vl = QVBoxLayout(dentro); vl.setContentsMargins(0, 0, 0, 0); vl.setSpacing(2)
            for s in self.skills:
                sid = s.get("id", "")
                b = QPushButton("%s  ·  %s" % (s.get("name", sid)[:26], s.get("category", "")))
                b.setToolTip("%s\n/libro: /skill %s <parametro>" % (sid, sid))
                b.setStyleSheet(
                    "QPushButton{background:transparent;color:%s;border:0;text-align:left;"
                    "font:11px '%s';padding:3px 4px;}"
                    "QPushButton:hover{background:rgba(244, 174, 202,40);color:%s;}" % (TXT, MONO, VERDE))
                b.clicked.connect(lambda _c=False, _s=sid: self._preparar_skill(_s))
                vl.addWidget(b)
            vl.addStretch(1)
            self._scroll_skills.setWidget(dentro)
            lay.addWidget(self._scroll_skills)
            return c

        def _alternar_skills(self):
            vis = not self._scroll_skills.isVisible()
            self._scroll_skills.setVisible(vis)
            self._btn_skills.setText(("SKILLS (%d) ▾" if vis else "SKILLS (%d) ▸") % len(self.skills))

        def _preparar_skill(self, sid):
            self.entrada.setText("/skill %s " % sid)
            self.entrada.setFocus()
            self.entrada.setCursorPosition(len(self.entrada.text()))

        def _card_reloj(self):
            c = _tarjeta(); c.setFixedWidth(240)
            lay = QVBoxLayout(c); lay.setContentsMargins(16, 12, 16, 12); lay.setSpacing(2)
            self._reloj_big = QLabel("--:--"); self._reloj_big.setStyleSheet("color:%s;font:700 52px '%s';letter-spacing:1px;" % (PAPEL, DISPLAY))
            self._fecha_big = QLabel(""); self._fecha_big.setStyleSheet("color:%s;font:11px '%s';" % (TXT, MONO))
            lay.addWidget(self._reloj_big); lay.addWidget(self._fecha_big)
            return c

        def _card_sistema(self):
            c = _tarjeta(); c.setFixedWidth(240)
            lay = QVBoxLayout(c); lay.setContentsMargins(16, 12, 16, 12); lay.setSpacing(8)
            top = QHBoxLayout()
            av = QLabel("✦"); av.setFixedSize(40, 40); av.setAlignment(Qt.AlignCenter)
            av.setStyleSheet("background:qlineargradient(x1:0,y1:0,x2:1,y2:1,stop:0 %s,stop:1 %s);"
                             "color:#0c0e19;border-radius:20px;font:700 20px '%s';" % (CYAN, VIOLETA, MONO))
            nom = QVBoxLayout(); nom.setSpacing(0)
            n1 = QLabel("aria@raiden"); n1.setStyleSheet("color:%s;font:700 12px '%s';" % (TXT, MONO))
            n2 = QLabel("gran sabio · local"); n2.setStyleSheet("color:%s;font:9px '%s';" % (TEAL, MONO))
            nom.addWidget(n1); nom.addWidget(n2)
            top.addWidget(av); top.addSpacing(8); top.addLayout(nom); top.addStretch(1)
            lay.addLayout(top)
            self._up = QLabel(""); self._up.setStyleSheet("color:%s;font:9px '%s';" % (TXT, MONO))
            lay.addWidget(self._up)
            self._bcpu = _Barra("CPU", CYAN); self._bram = _Barra("RAM", VIOLETA)
            lay.addWidget(self._bcpu); lay.addWidget(self._bram)
            # evolucion (niveles de aprendizaje reales de modos.py)
            self._evo_lbl = QLabel("NV 1 · SEMILLA")
            self._evo_lbl.setStyleSheet("color:%s;font:700 10px '%s';letter-spacing:2px;margin-top:4px;" % (CYAN, MONO))
            self._evo_lbl.setToolTip("Sube con lo que ARIA aprende de verdad: conocimiento, temas dominados, lecciones y mejoras.")
            self._bevo = _Barra("EVO", ROSA)
            self._asagi_lbl = QLabel("")
            self._asagi_lbl.setStyleSheet("color:%s;font:9px '%s';letter-spacing:1px;" % (LILA, MONO))
            lay.addWidget(self._evo_lbl); lay.addWidget(self._bevo); lay.addWidget(self._asagi_lbl)
            QTimer.singleShot(1500, self._pintar_evo)
            self._evo_timer = QTimer(self); self._evo_timer.timeout.connect(self._pintar_evo); self._evo_timer.start(60000)
            self._t0 = time.time()
            return c

        def _pintar_evo(self):
            try:
                import modos
                e = modos.evolucion_actual()
                previo = getattr(self, "_evo_idx", None)
                self._evo_lbl.setText("NV %d · %s" % (e["idx"] + 1, e["nombre"]))
                self._evo_lbl.setToolTip("%s  ·  %d pts%s" % (e["desc"], e["puntaje"],
                                         "" if e["max"] else "  ·  faltan %d para %s" % (e["falta"], e["siguiente"])))
                self._bevo.set_v(e["progreso"])
                if previo is not None and e["idx"] > previo:
                    self._linea("evolucioné: %s — %s" % (e["nombre"], e["desc"]), "sys")
                    self._estado_orb("picara", 2600)
                self._evo_idx = e["idx"]
            except Exception:
                pass
            try:
                import json as _j
                a = _j.load(open(os.path.join(_DIR, "data", "asagi_nivel.json"), encoding="utf-8"))
                self._asagi_lbl.setText("ASAGI · NV %s · %s" % (a.get("nivel"), a.get("nombre")))
            except Exception:
                self._asagi_lbl.setText("ASAGI · sin enlazar")

        def _card_calendario(self):
            c = _tarjeta(); c.setFixedWidth(240)
            lay = QVBoxLayout(c); lay.setContentsMargins(14, 10, 14, 12); lay.setSpacing(4)
            hoy = date.today()
            tit = QLabel("%s %d" % (("Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre")[hoy.month - 1], hoy.year))
            tit.setStyleSheet("color:%s;font:700 12px '%s';" % (CYAN, MONO))
            lay.addWidget(tit)
            grid = QGridLayout(); grid.setSpacing(2)
            for i, d in enumerate(["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"]):
                h = QLabel(d); h.setAlignment(Qt.AlignCenter)
                h.setStyleSheet("color:%s;font:8px '%s';" % (TEAL, MONO)); grid.addWidget(h, 0, i)
            cal = calendar.Calendar(firstweekday=0)
            r = 1
            for semana in cal.monthdayscalendar(hoy.year, hoy.month):
                for i, dia in enumerate(semana):
                    if dia == 0:
                        continue
                    lab = QLabel(str(dia)); lab.setAlignment(Qt.AlignCenter)
                    if dia == hoy.day:
                        lab.setStyleSheet("background:%s;color:#0c0e19;border-radius:9px;"
                                          "font:700 10px '%s';padding:1px;" % (CYAN, MONO))
                    else:
                        lab.setStyleSheet("color:%s;font:10px '%s';" % (TXT, MONO))
                    grid.addWidget(lab, r, i)
                r += 1
            lay.addLayout(grid)
            return c

        def _dock(self):
            wrap = QHBoxLayout(); wrap.addStretch(1)
            dock = QFrame(); dock.setObjectName("tarjeta"); dock.setStyleSheet("QFrame#tarjeta{%s}" % _CARD)
            inner = QHBoxLayout(dock); inner.setContentsMargins(10, 6, 10, 6); inner.setSpacing(8)
            self._btn = {}
            for key in ("autonomia", "cuerpo", "voz", "mascota", "fondo", "crt"):
                b = QPushButton(); b.setFixedHeight(34)
                b.clicked.connect(lambda _, k=key: self._toggle(k))
                _HoverGlow(b, blur=14, alpha=95)
                self._btn[key] = b; inner.addWidget(b)
            wrap.addWidget(dock); wrap.addStretch(1)
            return wrap

        # --------- logica ---------
        def _toggle(self, key):
            if key == "cuerpo":
                orden = ["rostro", "nucleo", "avatar"]
                act = self.toggles["cuerpo"] if self.toggles["cuerpo"] in orden else "nucleo"
                self.toggles["cuerpo"] = orden[(orden.index(act) + 1) % len(orden)]
                if hasattr(self, "_orb_mini"):
                    self._orb_mini.setVisible(self.toggles["cuerpo"] in ("nucleo", "rostro"))
                    self._orb_mini.set_modo(self.toggles["cuerpo"])
                self._linea("cuerpo -> %s" % self.toggles["cuerpo"], "sys")
            elif key == "voz":
                self.toggles["voz"] = not self.toggles["voz"]
                self._linea("voz -> %s" % ("ON" if self.toggles["voz"] else "OFF"), "sys")
                if self.toggles["voz"]:
                    try:
                        import voz_local
                        voz_local.hablar("Voz activada.")
                    except Exception:
                        pass
            elif key == "mascota":
                self.toggles["mascota"] = not self.toggles["mascota"]
                self._mascota_visible(self.toggles["mascota"])
                self._linea("mascota -> %s" % ("ON: doble clic en ella abre ARIA" if self.toggles["mascota"] else "OFF"), "sys")
            elif key == "autonomia":
                self.toggles["autonomia"] = False
                self._linea("autonomia desactivada (regla v2)", "sys")
            elif key == "fondo":
                self.toggles["fondo"] = self._fondo.set_modo(
                    "matrix" if self.toggles["fondo"] == "rice" else "rice")
                self._linea("fondo -> %s" % self.toggles["fondo"], "sys")
            elif key == "crt":
                self.toggles["crt"] = self._crt.set_activo(not self.toggles["crt"])
                self._linea("crt -> %s" % ("ON" if self.toggles["crt"] else "OFF"), "sys")
            self._pintar_toggles()
            self._guardar_toggles()

        def _guardar_toggles(self):
            _guardar_estado(dict({k: self.toggles[k] for k in ("cuerpo", "voz", "fondo", "crt", "mascota")}, rostro_v1=True))

        def _estado_orb(self, estado, durante=None):
            orb = getattr(self, "_orb_mini", None)
            if orb is not None:
                orb.set_estado(estado, durante)
            m = getattr(self, "_mascota", None)
            if m is not None and m.isVisible():
                m.set_estado(estado, durante)

        # --- mascota de escritorio ---
        def _mascota_visible(self, si):
            if si and getattr(self, "_mascota", None) is None:
                try:
                    from ui.mascota import Mascota
                    self._mascota = Mascota(al_doble_clic=self._mascota_abrir, al_callar=self._callar,
                                            al_cerrar=lambda: (self.toggles.update(mascota=False), self._pintar_toggles(), self._guardar_toggles()))
                except Exception as exc:
                    self._mascota = None
                    self._linea("mascota no disponible: %s" % exc, "sys")
                    return
            m = getattr(self, "_mascota", None)
            if m is not None:
                m.setVisible(bool(si))
                if si:
                    m.decir("Aquí estoy. Doble clic para abrir.", 4)

        def _mascota_abrir(self):
            if self.isVisible() and not self.isMinimized():
                self.hide()
            else:
                self.showNormal(); self.raise_(); self.activateWindow()

        def _callar(self):
            try:
                import voz_local
                voz_local.callar()
            except Exception:
                pass

        def _expresion_final(self):
            """Caracter de ARIA al terminar: a veces picara (guiño), curiosa si le
            preguntaste algo abierto; si no, vuelve a su calma analitica."""
            import random as _rnd
            ultima = (self._hist[self._pend_idx - 1] if self._pend_idx else "") if getattr(self, "_pend_idx", None) else ""
            if "?" in ultima and _rnd.random() < 0.6:
                self._estado_orb("curiosa", 2200)
            elif _rnd.random() < 0.3:
                self._estado_orb("picara", 2000)
            else:
                self._estado_orb("reposo")

        def _pintar_toggles(self):
            for key, b in self._btn.items():
                val = self.toggles[key]
                if key == "cuerpo":
                    txt, on = "CUERPO:%s" % val, True
                elif key == "fondo":
                    txt, on = "FONDO:%s" % val, True
                elif key == "crt":
                    txt, on = "CRT:%s" % ("ON" if val else "OFF"), bool(val)
                else:
                    txt, on = "%s:%s" % (key.upper()[:4], "ON" if val else "OFF"), bool(val)
                col = CYAN if on else "#5d6387"
                b.setText(txt)
                b.setStyleSheet(
                    "QPushButton{background:rgba(229, 192, 100,%d);color:%s;border:1px solid %s;"
                    "border-radius:9px;font:700 11px '%s';padding:6px 12px;}"
                    "QPushButton:hover{background:rgba(229, 192, 100,60);}" % (40 if on else 16, col, col, MONO))

        def _fmt(self, texto, quien="aria"):
            cuerpo = html.escape(str(texto)).replace("\n", "<br>")
            if quien == "user":
                return ('<table width="100%%" cellspacing="0" cellpadding="0" style="margin:8px 0;"><tr>'
                        '<td width="22%%"></td><td align="right">'
                        '<table cellspacing="0" cellpadding="9" style="background-color:#1a1626;border:1px solid %s;">'
                        '<tr><td style="color:%s;font-family:\'%s\';font-size:13px;">%s</td></tr></table>'
                        '</td></tr></table>') % (CYAN, PAPEL, MONO, cuerpo)
            if quien == "sys":
                return ('<p style="margin:6px 0 6px 2px;color:%s;font-family:\'%s\';font-size:10px;'
                        'letter-spacing:2px;">· %s</p>') % (LILA, MONO, cuerpo.upper())
            return ('<table width="100%%" cellspacing="0" cellpadding="0" style="margin:10px 0;"><tr>'
                    '<td width="3" style="background-color:%s;"></td><td width="12"></td>'
                    '<td><span style="color:%s;font-family:\'%s\';font-size:9px;letter-spacing:3px;">ARIA</span><br>'
                    '<span style="color:%s;font-family:\'%s\';font-size:13px;">%s</span></td>'
                    '<td width="12%%"></td></tr></table>') % (CYAN, CYAN, MONO, PAPEL, MONO, cuerpo)

        def _bienvenida(self):
            h = time.localtime().tm_hour
            saludo = "Buenos días" if 5 <= h < 12 else ("Buenas tardes" if h < 19 else "Buenas noches")
            return ('<div align="center" style="margin-top:70px;">'
                    '<p style="color:%s;font-family:\'%s\';font-size:34px;font-weight:600;">%s, Raiden.</p>'
                    '<p style="color:%s;font-family:\'%s\';font-size:11px;letter-spacing:3px;">'
                    'ANALIZO · RECUERDO · ACTÚO EN LOCAL</p>'
                    '<p style="color:%s;font-family:\'%s\';font-size:12px;margin-top:22px;">'
                    'prueba &nbsp; <span style="color:%s">/skills</span> &nbsp;·&nbsp; '
                    '<span style="color:%s">dile a asagi …</span> &nbsp;·&nbsp; '
                    '<span style="color:%s">enséñame …</span> &nbsp;·&nbsp; '
                    '<span style="color:%s">qué es importante hoy</span></p></div>'
                    ) % (PAPEL, DISPLAY, saludo, CYAN, MONO, LILA, MONO, CYAN, ROSA, CYAN, LILA)

        def _render(self):
            reales = [h for h in self._hist if "siempre presente" not in h.lower()]
            self.log.setHtml(self._bienvenida() if not reales else "".join(self._hist))
            self.log.moveCursor(QTextCursor.End)

        def _linea(self, texto, quien="aria"):
            self._hist.append(self._fmt(texto, quien))
            self._render()
            m = getattr(self, "_mascota", None)
            if quien == "aria" and m is not None and m.isVisible() and (not self.isVisible() or self.isMinimized() or not self.isActiveWindow()):
                m.decir(texto)

        def _enviar(self):
            t = self.entrada.text().strip()
            if not t:
                return
            self._callar()
            if _re.match(r"^(?:calla(?:te)?|silencio|shh+|para de hablar|stop)[.!]*$", t.strip(), _re.I):
                self.entrada.clear(); return
            if _re.match(r"^(?:mascota|modo mascota)$", t.strip(), _re.I):
                self.entrada.clear(); self._toggle("mascota"); return
            if self._worker is not None and self._worker.isRunning():
                return
            # modo enseñar: rutinas que le muestras una vez
            try:
                if not hasattr(self, "_ens"):
                    import ensenar
                    self._ens = ensenar.Ensenador()
                mh = _re.match(r"^(?:haz|hazme|ejecuta|repite)\s+(?:la\s+rutina\s+)?(.+)$", t.strip(), _re.I)
                if mh and mh.group(1).strip().lower() in {k.lower() for k in self._ens.rutinas()}:
                    nombre = next(k for k in self._ens.rutinas() if k.lower() == mh.group(1).strip().lower())
                    self.entrada.clear()
                    self._lanzar_retro(t, lambda: self._ens.ejecutar(nombre))
                    return
                rta = self._ens.manejar(t)
                if rta is not None:
                    self.entrada.clear(); self._linea(t, "user"); self._linea(rta, "aria")
                    if rta.startswith("Aprendido"):
                        self._estado_orb("picara", 2200)
                    return
            except Exception:
                pass
            if t.lower().strip(" ?¿") in ("nivel", "/nivel", "tu nivel", "niveles", "que nivel tienes", "qué nivel tienes"):
                self.entrada.clear(); self._linea(t, "user")
                try:
                    import modos
                    e = modos.evolucion_actual()
                    barra = "▰" * int(round(e["progreso"] * 12)) + "▱" * (12 - int(round(e["progreso"] * 12)))
                    self._linea("Nivel %d · %s — %s\n%s %d pts%s" % (
                        e["idx"] + 1, e["nombre"], e["desc"], barra, e["puntaje"],
                        " (máximo)" if e["max"] else " · faltan %d para %s" % (e["falta"], e["siguiente"])), "aria")
                except Exception as exc:
                    self._linea("no pude leer mi evolución: %s" % exc, "sys")
                return
            # manos en la PC: árbol de accesibilidad de Windows (refs + verificar)
            mm = _re.match(r"^(?:manos\s*pc|manos|usa la pc|hazlo en la pc)\s*[:,]\s*(.+)$", t.strip(), _re.I)
            mv = _re.match(r"^(?:mira|lee) (?:la )?(?:pantalla|ventana)$", t.strip(), _re.I)
            if mm or mv:
                self.entrada.clear()
                orden = mm.group(1).strip() if mm else ""
                pensar = (lambda p: str(self.responder(p) or "")) if callable(self.responder) else None

                def _manos():
                    try:
                        import comtypes
                        comtypes.CoInitialize()                 # COM por hilo (el worker no es el hilo principal)
                    except Exception:
                        pass
                    import manos_pc as _mp
                    if not _mp.disponible():
                        return "Las manos en la PC necesitan Windows con comtypes (viene con la voz pyttsx3)."

                    def _confirmar(txt):
                        try:
                            import ctypes
                            return ctypes.windll.user32.MessageBoxW(0, txt, "ARIA", 0x00040024) == 6   # Sí/No, encima de todo
                        except Exception:
                            return False
                    h = _mp.Manos(confirmar=_confirmar)
                    if mv:
                        return _mp.texto_snapshot(h.mirar())
                    lista = _mp.pasos(orden)
                    if lista:
                        return _mp.formato(h.ejecutar(lista))
                    if pensar is None:
                        return "Para un objetivo libre necesito el modelo cargado; dame pasos: abre X, toca Y, escribe Z."
                    return _mp.formato(h.agente(orden, pensar))
                self._lanzar_retro(t, _manos)
                return
            # informes con fuentes (tarea larga en segundo plano) y recuerdos
            try:
                mi = _re.match(r"^(?:informe|reporte)\s*[:,]\s*(.+)$|^investiga a fondo\s+(.+)$", t.strip(), _re.I)
                if mi:
                    tema = (mi.group(1) or mi.group(2)).strip()
                    self.entrada.clear()
                    import informe as _inf
                    pensar = (lambda p: str(self.responder(p) or "")) if callable(self.responder) else None

                    def _hacer():
                        r = _inf.informe(tema, pensar)
                        return _inf.para_chat(r["md"]) + (("\n\nGuardado en %s" % r["ruta"]) if r.get("ruta") else "")
                    self._lanzar_retro(t, _hacer)
                    return
                mmap = _re.match(r"^(?:mapa|mapea|linea de tiempo|línea de tiempo)\s*(?:de|del|sobre)?\s*[:,]?\s*(.{3,})$", t.strip(), _re.I | _re.S)
                if mmap and _re.match(r"^(?:mapa|mapea|l[ií]nea de tiempo)\b", t.strip(), _re.I):
                    tema_m = mmap.group(1).strip()
                    self.entrada.clear()
                    import mapa as _mapa
                    pensar_m = (lambda p: str(self.responder(p) or "")) if callable(self.responder) else None
                    self._lanzar_retro(t[:80], lambda: _mapa.mapa(tema_m, pensar_m)["texto"])
                    return
                import recuerdos as _rec
                rr = _rec.Recuerdos().manejar(t)
                if rr is not None:
                    self.entrada.clear(); self._linea(t, "user"); self._linea(rr, "aria")
                    return
            except Exception as exc:
                self._linea("informe/recuerdos: %s" % exc, "sys")
            # personajes (carpeta personajes/): tácticas de Patrick Jane, Barney Stinson y los que agregues
            try:
                import personajes as _pj
                if _pj.parsear(t):
                    pensar_p = (lambda p: str(self.responder(p) or "")) if callable(self.responder) else None
                    if _pj.parsear(t)["tipo"] in ("haria", "crear"):
                        self.entrada.clear()
                        self._lanzar_retro(t, lambda: _pj.manejar(t, pensar_p))
                        return
                    rp = _pj.manejar(t, None)
                    if rp is not None:
                        self.entrada.clear(); self._linea(t, "user"); self._linea(rp, "aria")
                        return
            except Exception as exc:
                self._linea("personajes: %s" % exc, "sys")
            if _re.match(r"^(?:actualizate|actualízate|busca actualizaciones|actualiza aria)[.!]*$", t.strip(), _re.I):
                self.entrada.clear(); self._linea(t, "user"); self._linea("Buscando actualizaciones…", "aria")
                self._auto_actualizar(avisar_si_nada=True)
                return
            # componentes: todo lo que ARIA tiene cargado
            try:
                import componentes as _comp
                rc = _comp.manejar(t)
                if rc is not None:
                    self.entrada.clear(); self._linea(t, "user"); self._linea(rc, "aria")
                    return
            except Exception as exc:
                self._linea("componentes: %s" % exc, "sys")
            # variantes en paralelo + juez, y estado de agentes
            try:
                mvar = _re.match(r"^(?:variantes|opciones|candidatos)\s*[:,]\s*(.+)$", t.strip(), _re.I)
                if mvar and callable(self.responder):
                    import bots_agenda as _ba
                    tarea = mvar.group(1).strip()
                    self.entrada.clear()
                    self._lanzar_retro(t, lambda: _ba.formato_variantes(_ba.variantes(tarea, lambda p: str(self.responder(p) or ""), serie=True)))
                    return
                if _re.match(r"^[¿]?\s*(qu[eé] (?:agentes|bots) (?:tengo |hay )?(?:activos|trabajando)|estado de (?:los )?(?:agentes|bots)|mis agentes)\s*\??$", t.strip(), _re.I):
                    import bots_agenda as _ba
                    e = _ba.resumen_estado(_ba.Agenda().bots() if getattr(self, "_agenda", None) is None else self._agenda.bots())
                    ocupado = self._worker is not None and self._worker.isRunning()
                    txt = ("Tienes %d bot(s) programado(s)%s%s." % (e["activos"], (": " + "; ".join(e["lista"])) if e["lista"] else "",
                           (". El próximo: " + e["proximo"]) if e["proximo"] else "")) + (" Y ahora mismo estoy trabajando en algo." if ocupado else "")
                    self.entrada.clear(); self._linea(t, "user"); self._linea(txt, "aria")
                    if self.toggles.get("voz"):
                        try:
                            import voz_local
                            voz_local.hablar(txt)
                        except Exception:
                            pass
                    return
            except Exception as exc:
                self._linea("variantes/estado: %s" % exc, "sys")
            # bots programados y equipo
            try:
                ag = getattr(self, "_agenda", None)
                me = _re.match(r"^(?:equipo|enjambre)\s*[:,]\s*(.+)$", t, _re.I)
                if me and callable(self.responder):
                    import bots_agenda
                    tarea = me.group(1).strip()
                    self.entrada.clear()
                    self._lanzar_retro(t, lambda: bots_agenda.formato_equipo(
                        bots_agenda.equipo(tarea, lambda p: str(self.responder(p) or ""), serie=True)))
                    return
                if ag is not None:
                    rb = ag.manejar(t)
                    if rb is not None:
                        self.entrada.clear(); self._linea(t, "user"); self._linea(rb, "aria")
                        if rb.startswith("Bot "):
                            self._estado_orb("picara", 2200)
                        return
            except Exception:
                pass
            if t == "/skills" or t == "/skills ":
                self.entrada.clear(); self._linea(t, "user")
                self._listar_skills()
                return
            m = _re.match(r"^/skill\s+(\S+)\s*(.*)$", t)
            if m:
                self.entrada.clear()
                self._ejecutar_skill(m.group(1), self._params_de(m.group(1), m.group(2)), t)
                return
            m = _re.match(r"^/ascii\s+(.+)$", t)
            if m:
                partes = m.group(1).strip().split()
                ruta = partes[0].strip("\"'")
                ancho = int(partes[1]) if len(partes) > 1 and partes[1].isdigit() else 90
                self.entrada.clear()
                self._lanzar_retro("/ascii %s %d" % (ruta, ancho),
                                   lambda: self._ascii_txt(ruta, ancho), pre=True)
                return
            m = _re.match(r"^/dither\s+(\S+)(?:\s+(\S+))?$", t)
            if m:
                ruta = m.group(1).strip("\"'")
                paleta = m.group(2) or "gameboy"
                self.entrada.clear()
                self._lanzar_retro("/dither %s %s" % (ruta, paleta),
                                   lambda: self._dither_txt(ruta, paleta))
                return
            self.entrada.clear(); self._linea(t, "user")
            if not callable(self.responder):
                self._linea("(sin cerebro conectado)", "aria")
                return
            self._es_chat = True
            self._acc = ""
            self._pend_idx = len(self._hist)
            self._t0 = time.time()
            self._linea("está pensando…", "aria")
            self._estado_orb("pensando")
            # una sola generación a la vez
            self.entrada.setEnabled(False)
            self.entrada.setPlaceholderText("generando… espera a que termine")
            self._worker = _ChatWorker(self.responder, t, self)
            self._worker.token.connect(self._on_token)
            self._worker.listo.connect(self._on_listo)
            self._worker.fallo.connect(self._on_fallo)
            self._worker.start()

        def _listar_skills(self):
            if not self.skills:
                self._linea("no hay skills cargadas", "sys")
                return
            self._linea("%d skills disponibles (usa: /skill <id> <parametro>)" % len(self.skills), "sys")
            for s in self.skills:
                self._linea("%-20s %-14s %s" % (s.get("id", ""), s.get("category", ""), s.get("name", "")), "sys")

        def _params_de(self, sid, resto):
            """Acepta JSON o un valor suelto; lo mapea al parametro que espera la skill."""
            resto = (resto or "").strip()
            if not resto:
                return {}
            if resto.startswith("{"):
                try:
                    d = json.loads(resto)
                    return d if isinstance(d, dict) else {"texto": resto}
                except Exception:
                    pass
            if sid in ("dns_lookup", "whois_lookup"):
                return {"dominio": resto.split()[0]}
            if sid == "web_info":
                return {"url": resto.split()[0]}
            return {"texto": resto}

        def _ejecutar_skill(self, sid, params, linea=None):
            self._linea(linea or ("/skill %s" % sid), "user")
            if not callable(self.runner_skill):
                self._linea("(sin motor de skills)", "sys")
                return
            self._es_chat = False
            self._acc = ""
            self._pend_idx = len(self._hist)
            self._t0 = time.time()
            self._linea("ejecutando…", "aria")
            self._estado_orb("pensando")
            self.entrada.setEnabled(False)
            self.entrada.setPlaceholderText("ejecutando skill… espera")
            runner = self.runner_skill
            fn = lambda _t="", on_token=None: _formato_skill(runner(sid, params))
            self._worker = _ChatWorker(fn, "", self)
            self._worker.token.connect(self._on_token)
            self._worker.listo.connect(self._on_listo)
            self._worker.fallo.connect(self._on_fallo)
            self._worker.start()

        def _fmt_pre(self, texto, color=TXT):
            return ('<pre style="color:%s;font-family:%s;font-size:11px;margin:0;'
                    'line-height:100%%">%s</pre>' % (color, MONO, html.escape(str(texto))))

        # --- taller retro (imagen -> ASCII / dither) ---
        @staticmethod
        def _ascii_txt(ruta, ancho):
            import retro_ascii
            txt = retro_ascii.imagen_a_ascii(ruta, ancho=ancho)
            return txt

        @staticmethod
        def _dither_txt(ruta, paleta):
            import retro_ascii, tempfile, os as _os
            img = retro_ascii.dither(ruta, paleta, escala=0.5)
            destino = _os.path.join(tempfile.gettempdir(),
                                    "aria_dither_%s.png" % paleta)
            ok = img.save(destino)
            return ("dither %s -> %dx%d | guardado: %s (%s)\n"
                    "usa /ascii %s para verlo en ASCII"
                    % (paleta, img.width(), img.height(), destino,
                       "ok" if ok else "fallo", destino))

        def _lanzar_retro(self, etiqueta, fn, pre=False):
            if self._worker is not None and self._worker.isRunning():
                return
            self._linea(etiqueta, "user")
            self._es_chat = False
            self._acc = ""
            self._pend_idx = len(self._hist)
            self._t0 = time.time()
            self._pre_modo = bool(pre)
            self._linea("procesando…", "aria")
            self._estado_orb("pensando")
            self.entrada.setEnabled(False)
            self.entrada.setPlaceholderText("taller retro… espera")
            self._worker = _ChatWorker(lambda _t="", on_token=None: fn(), "", self)
            self._worker.token.connect(self._on_token)
            self._worker.listo.connect(self._on_listo)
            self._worker.fallo.connect(self._on_fallo)
            self._worker.start()

        # --- slots: SIEMPRE en el hilo principal (Qt encola la señal) ---
        def _on_token(self, pieza):
            if self._pend_idx is None:
                return
            self._estado_orb("hablando")
            self._acc += pieza
            self._hist[self._pend_idx] = self._fmt(self._acc, "aria")
            self._render()

        def _on_listo(self, completa):
            if self._pend_idx is None:
                return
            if not self._acc.strip():
                self._acc = completa or "(respuesta vacía)"
                if not self._pre_modo:
                    self._hist[self._pend_idx] = self._fmt(self._acc, "aria")
                    self._render()
            if self._pre_modo:
                self._hist[self._pend_idx] = self._fmt_pre(self._acc)
                self._render()
                self._pre_modo = False
                self._linea("%d lineas · %.1f s" % (len(self._acc.splitlines()),
                                                   time.time() - self._t0), "sys")
                self._fin_generacion()
                return
            pt = getattr(self._worker, "primer_token", None)
            if pt is None:
                self._linea("%d caracteres · total %.1f s" % (len(self._acc), time.time() - self._t0), "sys")
            else:
                self._linea("%d caracteres · primer token %.2f s · total %.1f s"
                            % (len(self._acc), pt, time.time() - self._t0), "sys")
            self._fin_generacion()

        def _on_fallo(self, err):
            if self._pend_idx is not None:
                self._hist[self._pend_idx] = self._fmt("ERROR", "aria")
            self._linea(err, "sys")
            self._fin_generacion()

        def _fin_generacion(self):
            self._expresion_final()
            m = getattr(self, "_mascota", None)
            if self._es_chat and m is not None and m.isVisible() and self._acc.strip() and not self.isActiveWindow():
                m.decir(self._acc)
            if self._es_chat and self.toggles.get("voz") and self._acc.strip():
                try:
                    import voz_local
                    voz_local.hablar(self._acc)
                    self._estado_orb("hablando", min(15000, 70 * len(self._acc)))
                except Exception:
                    pass
            self._es_chat = False
            self._pend_idx = None
            self.entrada.setEnabled(True)
            self.entrada.setPlaceholderText("escribe y Enter...")
            self.entrada.setFocus()

        def _reloj(self):
            def tick():
                self._lbl_rel.setText(time.strftime("%H:%M:%S"))
                cpu, ram = _stats()
                self._lbl_sys.setText("CPU %2.0f%%  RAM %2.0f%%" % (cpu, ram))
                self._reloj_big.setText(time.strftime("%H:%M"))
                _lt = time.localtime()
                self._fecha_big.setText("%s · %d %s" % (("LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO")[_lt.tm_wday], _lt.tm_mday, ("ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC")[_lt.tm_mon - 1]))
                self._bcpu.set_v(cpu / 100.0); self._bram.set_v(ram / 100.0)
                mins = int((time.time() - self._t0) / 60)
                self._up.setText("uptime %dm · shell: aria · wm: nucleo" % mins)
            self._timer = QTimer(self); self._timer.timeout.connect(tick); self._timer.start(1000); tick()

    def crear_shell(responder=None, w=940, h=600, skills=None, runner_skill=None):
        _cargar_fuentes()
        return Shell(responder, w, h, skills=skills, runner_skill=runner_skill)
else:
    def crear_shell(responder=None, w=940, h=600):
        return {"error": "PyQt5 no disponible"}


if __name__ == "__main__":
    app = QApplication([])
    s = crear_shell(lambda t: "recibido: " + t); s.show(); app.exec_()
