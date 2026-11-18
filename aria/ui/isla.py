# -*- coding: utf-8 -*-
"""ARIA - Isla (idea de «Dynamic Island for Windows»): pastilla arriba al centro de la pantalla, siempre encima.
En reposo muestra la hora (12 h) y el estado de ASAGI; cuando ARIA dice o hace algo se ensancha con el texto unos segundos.
PyQt5 puro (sin dependencias). No roba el foco, no aparece en la barra de tareas, doble clic abre ARIA.
Paleta fija: #080408, #DC143C, #FFD700, #F0F0F8.
"""
import time

from PyQt5.QtCore import Qt, QTimer, QRectF, QPropertyAnimation, QEasingCurve, pyqtProperty
from PyQt5.QtGui import QColor, QFont, QPainter, QPainterPath, QPen
from PyQt5.QtWidgets import QApplication, QWidget

ALTO, ANCHO_MIN, ANCHO_MAX = 34, 190, 560


def hora12(t=None):
    """-> '8:05 p. m.' PURO."""
    x = time.localtime(t)
    return "%d:%02d %s" % (x.tm_hour % 12 or 12, x.tm_min, "a. m." if x.tm_hour < 12 else "p. m.")


def recortar(texto, n=70):
    """Una línea corta para la isla. PURO."""
    t = " ".join(str(texto or "").split())
    return t if len(t) <= n else t[: n - 1].rstrip() + "…"


class Isla(QWidget):
    def __init__(self, al_doble_clic=None, estado=None):
        super().__init__(None, Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool | Qt.WindowDoesNotAcceptFocus)
        self.setAttribute(Qt.WA_TranslucentBackground); self.setAttribute(Qt.WA_ShowWithoutActivating)
        self._al_doble, self._estado = al_doble_clic, estado          # estado() -> texto corto (p. ej. «ASAGI ● en línea»)
        self._texto, self._hasta, self._w, self._pulso = "", 0.0, float(ANCHO_MIN), 0.0
        self._anim = QPropertyAnimation(self, b"ancho", self); self._anim.setDuration(380); self._anim.setEasingCurve(QEasingCurve.OutBack)
        self._t = QTimer(self); self._t.timeout.connect(self._tick); self._t.start(250)
        self._colocar()

    def _get_ancho(self):
        return self._w

    def _set_ancho(self, v):
        self._w = float(v); self._colocar(); self.update()

    ancho = pyqtProperty(float, _get_ancho, _set_ancho)

    def _colocar(self):
        pant = QApplication.primaryScreen()
        g = pant.availableGeometry() if pant else None
        w = int(self._w)
        self.setFixedSize(w, ALTO)
        if g is not None:
            self.move(g.x() + (g.width() - w) // 2, g.y() + 6)

    def _ir_a(self, w):
        self._anim.stop(); self._anim.setStartValue(self._w); self._anim.setEndValue(float(w)); self._anim.start()

    def decir(self, texto, segundos=6.0):
        """Muestra un mensaje y luego vuelve al reposo."""
        self._texto = recortar(texto); self._hasta = time.time() + max(2.0, segundos)
        f = QFont("Segoe UI", 9); f.setBold(True)
        from PyQt5.QtGui import QFontMetrics
        self._ir_a(max(ANCHO_MIN, min(ANCHO_MAX, QFontMetrics(f).horizontalAdvance(self._texto) + 64)))
        self.update()

    def _tick(self):
        self._pulso = (self._pulso + 0.06) % 1.0
        if self._texto and time.time() > self._hasta:
            self._texto = ""
        if not self._texto:                                   # en reposo: el ancho justo para la hora + estado
            est = ""
            try:
                est = self._estado() if self._estado else ""
            except Exception:
                est = ""
            from PyQt5.QtGui import QFontMetrics
            w = QFontMetrics(QFont("Segoe UI", 9)).horizontalAdvance(hora12() + ("   " + recortar(est, 22) if est else "")) + 52
            w = max(120, min(ANCHO_MAX, w))
            if abs(w - self._w) > 3 and not self._anim.state():
                self._ir_a(w)
        self.update()

    def mouseDoubleClickEvent(self, _e):
        if self._al_doble:
            self._al_doble()

    def paintEvent(self, _e):
        p = QPainter(self); p.setRenderHint(QPainter.Antialiasing)
        r = QRectF(0.5, 0.5, self.width() - 1, self.height() - 1)
        camino = QPainterPath(); camino.addRoundedRect(r, ALTO / 2, ALTO / 2)
        p.fillPath(camino, QColor(8, 4, 8, 235))
        p.setPen(QPen(QColor(255, 215, 0, 110 if not self._texto else 200), 1)); p.drawPath(camino)
        vivo = 150 + int(105 * abs(0.5 - self._pulso) * 2)                       # punto carmesí que late
        p.setPen(Qt.NoPen); p.setBrush(QColor(220, 20, 60, vivo)); p.drawEllipse(QRectF(13, ALTO / 2 - 4, 8, 8))
        f = QFont("Segoe UI", 9); f.setBold(bool(self._texto)); p.setFont(f)
        if self._texto:
            p.setPen(QColor(240, 240, 248)); txt = self._texto
        else:
            est = ""
            try:
                est = self._estado() if self._estado else ""
            except Exception:
                est = ""
            p.setPen(QColor(255, 215, 0)); txt = hora12() + ("   " + recortar(est, 22) if est else "")
        p.drawText(QRectF(30, 0, self.width() - 42, ALTO), Qt.AlignVCenter | Qt.AlignLeft, txt)
        p.end()
