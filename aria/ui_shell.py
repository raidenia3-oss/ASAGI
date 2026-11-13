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

CYAN = "#ffd90d"
VIOLETA = "#e6e5ed"
TEAL = "#fb546f"
TXT = "#ffe66a"
VERDE = "#ff5c76"
MONO = "Consolas"
DISPLAY = "Georgia"
PAPEL = "#f0f0f8"      # texto de lectura (blanco lila)
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


def _hora12(segundos=False):
    """Reloj de 12 h (1-12) con a. m. / p. m."""
    t = time.localtime()
    h = t.tm_hour % 12 or 12
    base = "%d:%02d" % (h, t.tm_min) + (":%02d" % t.tm_sec if segundos else "")
    return base + (" a. m." if t.tm_hour < 12 else " p. m.")


def _cfg_fondo():
    try:
        return json.load(open(_CFG, encoding="utf-8"))
    except Exception:
        return {"wallpaper": "", "estilo": "auto", "animaciones": True, "oscurecer": 0.5}


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
    _CARD = ("background:rgba(24, 8, 15, 0.55); border:1px solid rgba(255, 217, 13, 0.30);"
             "border-radius:16px;")

    def _ventana_activa(w):
        """Solo animar si la ventana se ve: oculta, minimizada o en la bandeja = 0 CPU."""
        try:
            win = w.window()
            return win.isVisible() and not win.isMinimized()
        except Exception:
            return True

    class _Fondo(QWidget):
        """Fondo vivo de ARIA (paleta fija: negro #080408, carmesí #dc143c, oro #ffd700, blanco #f0f0f8).
        'red'    : red neuronal — nodos que derivan, enlaces carmesí y pulsos de oro que viajan por ellos,
                   sobre una retícula de puntos y un haz de escaneo lento. Es lo que ARIA "piensa".
        'matrix' : lluvia de código (clásico), ahora en carmesí/oro.
        Rendimiento: todo lo fijo (degradado, retícula, viñeta, scanlines) se pinta UNA vez en caché;
        por cuadro solo se dibujan ~40 nodos. 15 fps, y 0 fps si la ventana no se ve."""
        KATAKANA = list("ｱｶｻﾀﾅﾊﾏﾔﾗｦﾂﾇﾍﾐﾓﾜ0123456789:.=*+-<>¦|")
        NEGRO, CARMESI, ORO, BLANCO = (8, 4, 8), (220, 20, 60), (255, 215, 0), (240, 240, 248)
        FPS = 15

        def __init__(self, parent=None):
            super().__init__(parent)
            self.setAttribute(Qt.WA_OpaquePaintEvent, True)
            self._t = 0.0
            self._drag = None
            self._modo = "red"
            self._buf = None; self._fs = 0; self._cols = []
            self._base = None          # caché de la capa fija
            self._nodos = []
            self._pulsos = []
            cfg = _cfg_fondo()
            self._anim = bool(cfg.get("animaciones", True))
            self._osc = float(cfg.get("oscurecer", 0.55))
            self._wall = None
            self._foto_src = None; self._foto = None; self._foto_info = None; self._movie = None
            self._estilo = cfg.get("estilo") or "auto"
            self._timer = QTimer(self); self._timer.timeout.connect(self._tick)
            self._timer.start(int(1000 / self.FPS) if self._anim else 1000)
            if cfg.get("wallpaper"):
                QTimer.singleShot(0, lambda: self.set_wallpaper(cfg.get("wallpaper"), self._estilo))

        def set_modo(self, modo):
            if modo == "foto" and (self._foto_src is not None or self._movie is not None):
                self._modo = "foto"
            else:
                self._modo = "matrix" if modo == "matrix" else "red"
            self._buf = None; self._cols = []
            self.update()
            return self._modo

        def tiene_foto(self):
            return self._foto_src is not None or self._movie is not None

        def set_wallpaper(self, ruta, estilo=None):
            """Carga tu imagen (o gif animado) y la trata con fondo_foto. -> info dict o None."""
            self._wall = None; self._foto_src = None; self._foto = None; self._foto_info = None
            if getattr(self, "_movie", None) is not None:
                try:
                    self._movie.stop()
                except Exception:
                    pass
            self._movie = None
            self._estilo = estilo or getattr(self, "_estilo", None) or "auto"
            self._base = None
            if not ruta:
                self.update(); return None
            r = ruta if os.path.isabs(ruta) else os.path.join(_DIR, ruta)
            if not os.path.isfile(r):
                self.update(); return None
            try:
                from PyQt5.QtGui import QImage, QMovie
                import fondo_foto as _ff
                if r.lower().endswith(".gif"):
                    mv = QMovie(r)
                    if mv.isValid() and mv.frameCount() != 1:
                        mv.jumpToFrame(0)
                        info = _ff.analizar(mv.currentImage())
                        info["velo"] = _ff.oscurecer_para(info["lum"], self._estilo)
                        info["animada"] = True
                        self._movie = mv; self._foto_info = info
                        mv.frameChanged.connect(lambda _i: _ventana_activa(self) and self.update())
                        mv.start()
                        self.update(); return info
                img = QImage(r)
                if img.isNull():
                    return None
                lado = max(img.width(), img.height())
                if lado > 3840:     # fotos gigantes: bajarlas una vez y listo
                    img = img.scaled(3840, 3840, Qt.KeepAspectRatio, Qt.SmoothTransformation)
                self._foto_src = img
                self._preparar_foto()
                self.update()
                return dict(self._foto_info or {})
            except Exception as exc:
                print("[fondo] no pude cargar %s: %s" % (r, exc), flush=True)
                return None

        def set_estilo(self, estilo):
            self._estilo = estilo
            if self._movie is not None and self._foto_info is not None:
                import fondo_foto as _ff
                self._foto_info["velo"] = _ff.oscurecer_para(self._foto_info["lum"], estilo)
            else:
                self._preparar_foto()
            self.update()
            return dict(self._foto_info or {})

        def _preparar_foto(self):
            if self._foto_src is None or self.width() <= 0:
                return
            import fondo_foto as _ff
            img, info = _ff.preparar(self._foto_src, self.width(), self.height(), self._estilo)
            self._foto = QPixmap.fromImage(img); self._foto_info = info

        def _tick(self):
            if not _ventana_activa(self):
                return
            self._t += 1.0 / self.FPS
            self.update()

        def resizeEvent(self, e):
            self._base = None; self._buf = None
            if self._foto is not None and (abs(self._foto.width() - self.width() * 1.05) > 4 or abs(self._foto.height() - self.height() * 1.05) > 4):
                self._preparar_foto()
            super().resizeEvent(e)

        def mousePressEvent(self, e):
            if e.button() == Qt.LeftButton:
                self._drag = e.globalPos() - self.window().frameGeometry().topLeft()

        def mouseMoveEvent(self, e):
            if self._drag is not None:
                self.window().move(e.globalPos() - self._drag)

        def mouseReleaseEvent(self, e):
            self._drag = None

        # ---- capa fija (se pinta solo al cambiar tamaño) ----
        def _capa_fija(self, W, H):
            px = QPixmap(W, H)
            b = QPainter(px); b.setRenderHint(QPainter.Antialiasing)
            if self._wall is not None:
                esc = self._wall.scaled(W, H, Qt.KeepAspectRatioByExpanding, Qt.SmoothTransformation)
                b.drawPixmap(int((W - esc.width()) / 2), int((H - esc.height()) / 2), esc)
                b.fillRect(0, 0, W, H, QColor(*self.NEGRO, int(255 * self._osc)))
            else:
                g = QLinearGradient(0, 0, 0, H)
                g.setColorAt(0, QColor(15, 6, 11)); g.setColorAt(0.55, QColor(*self.NEGRO)); g.setColorAt(1, QColor(10, 5, 9))
                b.fillRect(0, 0, W, H, g)
            # brasas: dos halos muy tenues (carmesí abajo-izq, oro arriba-der)
            for cx, cy, r, col in ((0.12, 0.92, 0.75, QColor(*self.CARMESI, 34)), (0.92, 0.04, 0.55, QColor(*self.ORO, 14))):
                rg = QRadialGradient(W * cx, H * cy, W * r)
                rg.setColorAt(0, col); rg.setColorAt(1, QColor(8, 4, 8, 0))
                b.setPen(Qt.NoPen); b.setBrush(rg); b.drawRect(0, 0, W, H)
            # retícula de puntos (cada 28 px) — más moderno que las rayas
            b.setPen(QPen(QColor(*self.BLANCO, 22), 1.4))
            for y in range(14, H, 28):
                for x in range(14, W, 28):
                    b.drawPoint(x, y)
            # cruces de mira en las esquinas
            b.setPen(QPen(QColor(*self.ORO, 70), 1))
            for x0, y0, sx, sy in ((14, 14, 1, 1), (W - 15, 14, -1, 1), (14, H - 15, 1, -1), (W - 15, H - 15, -1, -1)):
                b.drawLine(x0, y0, x0 + 16 * sx, y0); b.drawLine(x0, y0, x0, y0 + 16 * sy)
            # viñeta
            rg = QRadialGradient(W / 2, H / 2, max(W, H) * 0.75)
            rg.setColorAt(0.5, QColor(8, 4, 8, 0)); rg.setColorAt(1, QColor(8, 4, 8, 170))
            b.setPen(Qt.NoPen); b.setBrush(rg); b.drawRect(0, 0, W, H)
            b.end()
            return px

        def paintEvent(self, e):
            W, H = self.width(), self.height()
            if W <= 0 or H <= 0:
                return
            p = QPainter(self)
            if self._modo == "matrix":
                self._matrix(p, W, H); p.end(); return
            if self._modo == "foto" and self._pintar_foto(p, W, H):
                p.setRenderHint(QPainter.Antialiasing)
                p.setOpacity(0.45)            # la red sigue viva encima, pero discreta
                self._red(p, W, H)
                p.end(); return
            if self._base is None or self._base.size() != self.size():
                self._base = self._capa_fija(W, H)
            p.drawPixmap(0, 0, self._base)
            p.setRenderHint(QPainter.Antialiasing)
            self._red(p, W, H)
            p.end()

        def _pintar_foto(self, p, W, H):
            if self._movie is not None:
                fr = self._movie.currentPixmap()
                if fr.isNull():
                    return False
                esc = fr.scaled(W, H, Qt.KeepAspectRatioByExpanding, Qt.FastTransformation)
                p.fillRect(0, 0, W, H, QColor(*self.NEGRO))
                p.drawPixmap(int((W - esc.width()) / 2), int((H - esc.height()) / 2), esc)
                p.fillRect(0, 0, W, H, QColor(*self.NEGRO, int(255 * (self._foto_info or {}).get("velo", 0.4))))
                return True
            if self._foto is None:
                self._preparar_foto()
            if self._foto is None:
                return False
            # deriva lenta (parallax): mover la imagen ya tratada cuesta casi nada
            mx = (self._foto.width() - W) / 2.0; my = (self._foto.height() - H) / 2.0
            dx = mx + (math.sin(self._t * 0.05) * mx * 0.9 if self._anim else 0)
            dy = my + (math.cos(self._t * 0.04) * my * 0.9 if self._anim else 0)
            p.drawPixmap(QPointF(-dx, -dy), self._foto)
            return True

        # ---- red neuronal ----
        def _red(self, p, W, H):
            import random as _r
            n = max(30, min(70, (W * H) // 10000))
            if len(self._nodos) != n:
                self._nodos = [[_r.uniform(0, W), _r.uniform(0, H), _r.uniform(-9, 9), _r.uniform(-9, 9), _r.random()] for _ in range(n)]
                self._pulsos = []
            dt = 1.0 / self.FPS if self._anim else 0
            for nd in self._nodos:
                nd[0] += nd[2] * dt; nd[1] += nd[3] * dt
                if nd[0] < -20 or nd[0] > W + 20: nd[2] = -nd[2]
                if nd[1] < -20 or nd[1] > H + 20: nd[3] = -nd[3]
            lim = 165.0; lim2 = lim * lim
            enlaces = []
            for i in range(n):
                a = self._nodos[i]
                for j in range(i + 1, n):
                    c = self._nodos[j]
                    dx = a[0] - c[0]; dy = a[1] - c[1]; d2 = dx * dx + dy * dy
                    if d2 < lim2:
                        f = 1.0 - (d2 ** 0.5) / lim
                        p.setPen(QPen(QColor(*self.CARMESI, int(150 * f * f + 20 * f)), 1))
                        p.drawLine(QPointF(a[0], a[1]), QPointF(c[0], c[1]))
                        enlaces.append((i, j))
            # pulsos de oro: viajan por un enlace (una "idea" pasando de nodo a nodo)
            if enlaces and len(self._pulsos) < 4 and _r.random() < 0.12:
                self._pulsos.append([_r.choice(enlaces), 0.0])
            vivos = []
            for (i, j), k in self._pulsos:
                if i < n and j < n:
                    a, c = self._nodos[i], self._nodos[j]
                    x = a[0] + (c[0] - a[0]) * k; y = a[1] + (c[1] - a[1]) * k
                    rg = QRadialGradient(x, y, 9)
                    rg.setColorAt(0, QColor(*self.ORO, 230)); rg.setColorAt(1, QColor(*self.ORO, 0))
                    p.setPen(Qt.NoPen); p.setBrush(rg); p.drawEllipse(QPointF(x, y), 9, 9)
                    if k + 0.08 < 1:
                        vivos.append([(i, j), k + 0.08])
            self._pulsos = vivos
            # nodos: los "brillantes" respiran
            p.setPen(Qt.NoPen)
            for nd in self._nodos:
                br = 0.5 + 0.5 * math.sin(self._t * 1.6 + nd[4] * 6.28)
                if nd[4] > 0.82:
                    p.setBrush(QColor(*self.BLANCO, int(120 + 100 * br))); p.drawEllipse(QPointF(nd[0], nd[1]), 2.4, 2.4)
                else:
                    p.setBrush(QColor(*self.CARMESI, int(110 + 80 * br))); p.drawEllipse(QPointF(nd[0], nd[1]), 1.7, 1.7)
            # haz de escaneo: una línea fina de oro que baja despacio
            y = (self._t * 38) % (H + 120) - 60
            g = QLinearGradient(0, y - 40, 0, y)
            g.setColorAt(0, QColor(*self.ORO, 0)); g.setColorAt(1, QColor(*self.ORO, 9))
            p.fillRect(QRectF(0, y - 40, W, 40), g)
            p.setPen(QPen(QColor(*self.ORO, 32), 1)); p.drawLine(QPointF(0, y), QPointF(W, y))

        def _matrix(self, p, W, H):
            """Lluvia de código con estela (buffer persistente + velo)."""
            import random as _r
            fs = max(13, int(W / 40))
            if (self._buf is None or self._buf.width() != W or self._buf.height() != H
                    or self._fs != fs or not self._cols):
                self._fs = fs
                self._buf = QPixmap(W, H); self._buf.fill(QColor(*self.NEGRO))
                self._cols = [{"y": _r.uniform(-H, 0), "v": _r.uniform(8, 22)} for _ in range(max(1, W // fs))]
            b = QPainter(self._buf)
            b.fillRect(0, 0, W, H, QColor(*self.NEGRO, 40))
            f = QFont("Consolas"); f.setPixelSize(fs); b.setFont(f)
            for i, c in enumerate(self._cols):
                if c["y"] > 0:
                    ch = _r.choice(self.KATAKANA)
                    b.setPen(QColor(*self.BLANCO, 230)); b.drawText(int(i * fs), int(c["y"]), ch)
                    b.setPen(QColor(*self.CARMESI, 170)); b.drawText(int(i * fs), int(c["y"] - fs), ch)
                c["y"] += c["v"]
                if c["y"] > H + _r.uniform(0, H * 0.7):
                    c["y"] = -_r.uniform(0, H * 0.4); c["v"] = _r.uniform(8, 22)
            b.end()
            p.drawPixmap(0, 0, self._buf)

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
            p.setBrush(QColor(240, 240, 248, 22)); p.setPen(Qt.NoPen)
            p.drawRoundedRect(QRectF(x, H / 2 - 4, bw, 8), 4, 4)
            p.setBrush(self._color)
            p.drawRoundedRect(QRectF(x, H / 2 - 4, bw * self._v, 8), 4, 4)
            p.end()

    class _CRT(QWidget):
        """Acabado de pantalla sobre toda la ventana: scanlines finas + viñeta. ESTÁTICO y en caché:
        antes repintaba toda la ventana 25 veces por segundo (y con ella cada tarjeta de abajo)."""
        def __init__(self, parent=None):
            super().__init__(parent)
            self.setAttribute(Qt.WA_TransparentForMouseEvents, True)
            self.setAttribute(Qt.WA_NoSystemBackground, True)
            self.setAttribute(Qt.WA_TranslucentBackground, True)
            self._activo = True
            self._cache = None

        def set_activo(self, v):
            self._activo = bool(v)
            self.update()
            return self._activo

        def resizeEvent(self, e):
            self._cache = None
            super().resizeEvent(e)

        def paintEvent(self, e):
            if not self._activo:
                return
            W, H = self.width(), self.height()
            if W <= 0 or H <= 0:
                return
            if self._cache is None or self._cache.size() != self.size():
                px = QPixmap(W, H); px.fill(Qt.transparent)
                b = QPainter(px)
                b.setPen(QPen(QColor(8, 4, 8, 34), 1))
                for y in range(0, H, 3):
                    b.drawLine(0, y, W, y)
                rg = QRadialGradient(W / 2, H / 2, max(W, H) * 0.75)
                rg.setColorAt(0.6, QColor(8, 4, 8, 0)); rg.setColorAt(1.0, QColor(8, 4, 8, 120))
                b.setPen(Qt.NoPen); b.setBrush(rg); b.drawRect(0, 0, W, H)
                b.setBrush(Qt.NoBrush); b.setPen(QPen(QColor(220, 20, 60, 40), 1)); b.drawRect(0, 0, W - 1, H - 1)
                b.end()
                self._cache = px
            p = QPainter(self)
            p.drawPixmap(e.rect(), self._cache, e.rect())   # solo la zona que Qt pide
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
            if not self.isVisible() or not _ventana_activa(self):
                return
            self._t += 0.03
            self.update()

        def paintEvent(self, e):
            p = QPainter(self); p.setRenderHint(QPainter.Antialiasing)
            p.fillRect(self.rect(), QColor(21, 7, 13))
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
            self._eff.setColor(QColor(255, 217, 13, 0))
            widget.setGraphicsEffect(self._eff)
            self._alpha = alpha
            widget.installEventFilter(self)

        def eventFilter(self, obj, ev):
            if ev.type() == QEvent.Enter:
                self._eff.setColor(QColor(255, 217, 13, self._alpha))
            elif ev.type() == QEvent.Leave:
                self._eff.setColor(QColor(255, 217, 13, 0))
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
                            "voz": bool(_estado.get("voz")), "fondo": _estado.get("fondo") if _estado.get("fondo") in ("matrix", "foto") else "red",
                            "crt": _estado.get("crt") is not False, "mascota": bool(_estado.get("mascota"))}
            self._hist = []
            self._es_chat = False
            self._worker = None
            self._acc = ""
            self._pend_idx = None
            self._t0 = 0.0
            self._pre_modo = False
            self.setWindowFlags(Qt.FramelessWindowHint)
            self.setAcceptDrops(True)        # arrastra una imagen sobre ARIA = tu fondo
            self.resize(w, h); self.setWindowTitle("ARIA")
            self._fondo = _Fondo(self)
            if self.toggles["fondo"] == "matrix":
                self._fondo.set_modo("matrix")
            elif self.toggles["fondo"] == "foto":
                QTimer.singleShot(50, lambda: self._fondo.set_modo("foto"))
            self._build(); self._reloj()
            self._crt = _CRT(self)
            self._crt.setGeometry(0, 0, self.width(), self.height())
            self._crt.raise_()
            self._crt.set_activo(self.toggles["crt"])
            QTimer.singleShot(2500, self._iniciar_bots)
            QTimer.singleShot(9000, self._auto_actualizar)
            QTimer.singleShot(60000, self._correo_auto)
            self._correo_t = QTimer(self); self._correo_t.timeout.connect(self._correo_auto); self._correo_t.start(3 * 3600 * 1000)
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
                pass   # sin acrylic: el fondo es opaco y el blur de Windows solo agregaba lag

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

        # ---- tu fondo de pantalla ----
        def dragEnterEvent(self, e):
            md = e.mimeData()
            if md.hasUrls() and any(u.isLocalFile() and u.toLocalFile().lower().endswith(
                    (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif")) for u in md.urls()):
                e.acceptProposedAction()

        def dropEvent(self, e):
            for u in e.mimeData().urls():
                if u.isLocalFile():
                    self._poner_fondo(u.toLocalFile()); break

        def _cmd_fondo(self, t):
            try:
                import fondo_foto as _ff
            except Exception:
                return False
            o = _ff.parsear(t)
            if not o:
                return False
            self.entrada.clear(); self._linea(t, "user")
            if o["accion"] == "elegir":
                from PyQt5.QtWidgets import QFileDialog
                ruta, _ = QFileDialog.getOpenFileName(self, "Elige tu fondo", os.path.expanduser("~/Pictures"),
                                                      "Imágenes (*.jpg *.jpeg *.png *.webp *.bmp *.gif)")
                if ruta:
                    self._poner_fondo(ruta)
                else:
                    self._linea("No elegiste nada. También puedes arrastrar la imagen sobre mí.", "aria")
            elif o["accion"] == "poner":
                self._poner_fondo(o["ruta"])
            elif o["accion"] == "estilo":
                if not self._fondo.tiene_foto():
                    self._linea("Primero ponme una imagen: escribe «fondo» o arrástrala sobre mí.", "aria")
                else:
                    info = self._fondo.set_estilo(o["estilo"])
                    self.toggles["fondo"] = self._fondo.set_modo("foto")
                    self._guardar_fondo(estilo=o["estilo"]); self._pintar_toggles(); self._guardar_toggles()
                    self._linea(_ff.describir(info, o["estilo"]), "aria")
            elif o["accion"] == "quitar":
                self._fondo.set_wallpaper(None)
                self.toggles["fondo"] = self._fondo.set_modo("red")
                self._guardar_fondo(wallpaper=""); self._pintar_toggles(); self._guardar_toggles()
                self._linea("Listo, volví a mi red neuronal.", "aria")
            elif o["accion"] == "info":
                inf = getattr(self._fondo, "_foto_info", None)
                self._linea(("Tengo tu imagen en estilo «%s» (luz %d%%, color %d%%, velo %d%%)." % (
                    self._fondo._estilo, inf["lum"] * 100, inf["sat"] * 100, inf.get("velo", 0) * 100)) if inf
                    else "Uso mi fondo propio (%s). Escribe «fondo» para poner el tuyo." % self.toggles["fondo"], "aria")
            return True

        # ---- Gmail (correo.py): API (C) -> IMAP (B) -> web (A) ----
        def _correo_hilo(self, fn, prefijo="📬 "):
            import threading as _th

            def _h():
                try:
                    txt = fn()
                except Exception as exc:
                    txt = "No pude con el correo: %s" % exc
                cola = getattr(self, "_bots_cola", None)
                if cola is not None and txt:
                    cola.put(txt if txt[:2] in ("📬", "🔒") else prefijo + txt)
            _th.Thread(target=_h, daemon=True).start()

        def _correo_revisar(self, silencioso=False):
            import correo as _co
            pensar = (lambda p: str(self.responder(p) or "")) if callable(self.responder) else None

            def fn():
                r = _co.revisar(pensar=pensar)
                if r.get("status") != "ok":
                    return None if silencioso else r["texto"]
                _co.guardar_ultimo(r)
                if silencioso:   # automático: solo avisa si hay algo de personas o pendientes nuevos
                    clave = "|".join(r.get("pendientes") or []) + str(r.get("n"))
                    if clave == getattr(self, "_correo_ult", None) or not (r.get("pendientes") or r.get("contactos")):
                        return None
                    self._correo_ult = clave
                extra = ("\n📝 Pendientes: " + " · ".join(r["pendientes"][:5])) if r.get("pendientes") and "Pendientes" not in r["texto"] else ""
                return r["texto"] + extra + "\n(vía %s)" % r.get("via")
            self._correo_hilo(fn)

        def _correo_auto(self):
            try:
                import correo as _co
                m = _co.metodos()
                if m["api"] or m["imap"]:
                    self._correo_revisar(silencioso=True)
            except Exception:
                pass

        def _cmd_correo(self, t):
            try:
                import correo as _co
            except Exception:
                return False
            acc = _co.manejar(t)
            if not acc:
                return False
            self.entrada.clear(); self._linea(t, "user")
            if acc == "revisar":
                self._linea("Reviso tu correo…", "sys"); self._correo_revisar()
            elif acc == "api":
                if not _co.cliente():
                    self._linea(_co.PASOS_CLIENTE, "aria"); return True
                self._linea("Te abro Google: toca «Permitir» (solo lectura). Vuelvo cuando llegue el permiso.", "aria")
                self._correo_hilo(lambda: _co.conectar_api()["texto"])
            elif acc == "imap":
                from PyQt5.QtWidgets import QInputDialog, QLineEdit
                mail, ok = QInputDialog.getText(self, "Gmail IMAP", "Tu correo de Gmail:")
                if not ok or not mail.strip():
                    self._linea("Cancelado.", "sys"); return True
                pw, ok = QInputDialog.getText(self, "Gmail IMAP", "Contraseña de aplicación (16 letras; no se muestra):",
                                              QLineEdit.Password)
                if not ok or not pw.strip():
                    self._linea("Cancelado.", "sys"); return True
                self._linea(_co.guardar_imap(mail, pw)["texto"] + " Probando…", "aria")
                pw = None
                self._correo_revisar()
            else:
                m = _co.metodos(); u = _co.ultimo()
                self._linea("Correo · API: %s · IMAP: %s · web: usa la sesión de Google del perfil de ARIA.%s" % (
                    "sí" if m["api"] else "no", "sí" if m["imap"] else "no",
                    ("\nÚltima revisión: %d correos." % u["n"]) if u else ""), "aria")
            return True

        def _cmd_rollercoin(self, t):
            """«conecta rollercoin»: login con Google en Chrome normal; ARIA no ve contraseñas."""
            try:
                import rollercoin_google as _rg
            except Exception:
                return False
            acc = _rg.manejar(t)
            if not acc:
                return False
            self.entrada.clear(); self._linea(t, "user")
            if acc == "conectar":
                self._linea("Te abro Chrome en RollerCoin. Toca «Log in With Google» y entra con tu cuenta. "
                            "Yo nunca cierro tus ventanas: cuando tú cierres esa, reviso que quedó la sesión. "
                            "No veo ni guardo contraseñas.", "aria")
            else:
                self._linea("Reviso la sesión de RollerCoin…", "sys")
            import threading as _th

            def _hilo():
                try:
                    r = _rg.conectar(esperar=True) if acc == "conectar" else _rg.estado()
                    txt = r.get("texto") or ("No pude: %s" % r.get("error", r.get("status")))
                except Exception as exc:
                    txt = "No pude revisar RollerCoin: %s" % exc
                cola = getattr(self, "_bots_cola", None)
                if cola is not None:
                    cola.put("🎮 " + txt)
            _th.Thread(target=_hilo, daemon=True).start()
            return True

        def _poner_fondo(self, ruta):
            import fondo_foto as _ff
            try:
                rel = _ff.importar(ruta)
            except Exception as exc:
                self._linea("No pude usar esa imagen: %s" % exc, "aria"); return
            estilo = getattr(self._fondo, "_estilo", None) or "auto"
            info = self._fondo.set_wallpaper(rel, estilo)
            if not info:
                self._linea("La imagen no se pudo abrir (¿está dañada?).", "aria"); return
            self.toggles["fondo"] = self._fondo.set_modo("foto")
            self._guardar_fondo(wallpaper=rel, estilo=estilo); self._pintar_toggles(); self._guardar_toggles()
            self._linea(_ff.describir(info, estilo), "aria")
            self._estado_orb("curiosa", 2000)

        def _guardar_fondo(self, **cambios):
            cfg = _cfg_fondo(); cfg.update(cambios)
            try:
                os.makedirs(os.path.dirname(_CFG), exist_ok=True)
                with open(_CFG, "w", encoding="utf-8") as f:
                    json.dump(cfg, f, ensure_ascii=False, indent=1)
            except OSError:
                pass

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
                "QLineEdit{background:rgba(14, 5, 11, 0.7);border:1px solid rgba(255, 217, 13, 0.5);"
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
                "QPushButton{background:rgba(255, 217, 13, 40);color:%s;border:1px solid %s;"
                "border-radius:8px;font:700 11px '%s';padding:6px;}"
                "QPushButton:hover{background:rgba(255, 217, 13, 70);}" % (CYAN, CYAN, MONO))
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
                    "QPushButton:hover{background:rgba(255, 92, 118, 40);color:%s;}" % (TXT, MONO, VERDE))
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
                             "color:#16070e;border-radius:20px;font:700 20px '%s';" % (CYAN, VIOLETA, MONO))
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
                        lab.setStyleSheet("background:%s;color:#16070e;border-radius:9px;"
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
                ciclo = (["foto"] if self._fondo.tiene_foto() else []) + ["red", "matrix"]
                act = self.toggles["fondo"] if self.toggles["fondo"] in ciclo else ciclo[-1]
                self.toggles["fondo"] = self._fondo.set_modo(ciclo[(ciclo.index(act) + 1) % len(ciclo)])
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
                col = CYAN if on else "#756e75"
                b.setText(txt)
                b.setStyleSheet(
                    "QPushButton{background:rgba(229, 192, 100,%d);color:%s;border:1px solid %s;"
                    "border-radius:9px;font:700 11px '%s';padding:6px 12px;}"
                    "QPushButton:hover{background:rgba(255, 217, 13, 60);}" % (40 if on else 16, col, col, MONO))

        def _fmt(self, texto, quien="aria"):
            cuerpo = html.escape(str(texto)).replace("\n", "<br>")
            if quien == "user":
                return ('<table width="100%%" cellspacing="0" cellpadding="0" style="margin:8px 0;"><tr>'
                        '<td width="22%%"></td><td align="right">'
                        '<table cellspacing="0" cellpadding="9" style="background-color:#1e0a12;border:1px solid %s;">'
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
            if self._cmd_fondo(t):
                return
            if self._cmd_rollercoin(t):
                return
            if self._cmd_correo(t):
                return
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
            # métricas: solo si tardó (antes salía «96 caracteres · total 0.3 s» bajo CADA respuesta = ruido)
            total = time.time() - self._t0
            if total >= 8:
                pt = getattr(self._worker, "primer_token", None)
                self._linea("tardé %.0f s%s" % (total, (" · empecé a los %.1f s" % pt) if pt else ""), "sys")
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
                self._lbl_rel.setText(_hora12(True))
                cpu, ram = _stats()
                self._lbl_sys.setText("CPU %2.0f%%  RAM %2.0f%%" % (cpu, ram))
                _h = _hora12(False).split(" ", 1)
                self._reloj_big.setText("%s<span style='font-size:16px;letter-spacing:2px;'> %s</span>" % (_h[0], _h[1]))
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
