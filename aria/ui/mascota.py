# -*- coding: utf-8 -*-
"""ARIA - Mascota de escritorio: su rostro flotando sobre el escritorio, sin ventana.

- Sin bordes, fondo transparente, siempre encima, no aparece en la barra de tareas.
- Arrástrala a donde quieras (recuerda la posición). Te mira cuando pasas el mouse.
- Doble clic: abre/oculta la ventana grande de ARIA. Clic derecho: menú.
- Lo que ARIA dice (respuestas, avisos de bots) sale en un globo junto a ella unos segundos.
- Si está hablando, un clic la calla.
Todo en el mismo proceso Qt: sin servidores, sin dependencias nuevas.
"""
import json
import os
import time

from PyQt5.QtCore import Qt, QTimer, QPoint, QRectF
from PyQt5.QtGui import QPainter, QColor, QFont, QPainterPath, QPen, QFontMetrics
from PyQt5.QtWidgets import QWidget, QMenu, QApplication

_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_POS = os.path.join(_DIR, "data", "mascota.json")
LADO = 150
ORO = QColor(255, 218, 19)
TINTA = QColor(16, 6, 12, 236)
PAPEL = QColor(240, 240, 248)


def _cargar_pos():
    try:
        with open(_POS, encoding="utf-8") as f:
            d = json.load(f)
        return int(d["x"]), int(d["y"])
    except Exception:
        return None


def _guardar_pos(x, y):
    try:
        os.makedirs(os.path.dirname(_POS), exist_ok=True)
        with open(_POS, "w", encoding="utf-8") as f:
            json.dump({"x": x, "y": y}, f)
    except Exception:
        pass


def recortar(texto, n=180):
    """Texto del globo: una sola idea, sin markdown. PURO."""
    t = " ".join((texto or "").replace("**", "").replace("`", "").split())
    return t if len(t) <= n else t[: n - 1].rsplit(" ", 1)[0] + "…"


class Mascota(QWidget):
    def __init__(self, al_doble_clic=None, al_callar=None, al_cerrar=None):
        super().__init__(None, Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setAttribute(Qt.WA_ShowWithoutActivating)
        self.al_doble_clic, self.al_callar, self.al_cerrar = al_doble_clic, al_callar, al_cerrar
        self._globo = ""
        self._globo_hasta = 0.0
        self._estado = "reposo"
        self._estado_hasta = 0.0
        self._t = 0.0
        self._arrastre = None
        self._movio = False
        self._rostro = None
        try:
            from ui.rostro_aria import Rostro
            self._rostro = Rostro()
        except Exception:
            self._rostro = None
        self._ajustar()
        p = _cargar_pos()
        if p:
            self.move(*p)
        else:
            g = QApplication.desktop().availableGeometry()
            self.move(g.right() - self.width() - 24, g.bottom() - self.height() - 24)
        self.setMouseTracking(True)
        self._timer = QTimer(self); self._timer.timeout.connect(self._tick); self._timer.start(33)

    # --- API
    def decir(self, texto, segundos=None):
        self._globo = recortar(texto)
        self._globo_hasta = time.time() + (segundos or max(4.0, min(12.0, len(self._globo) / 14.0)))
        self._ajustar()
        self.update()

    def set_estado(self, estado, durante_ms=None):
        self._estado = estado
        self._estado_hasta = time.time() + durante_ms / 1000.0 if durante_ms else 0.0
        self.update()

    # --- geometría: el globo crece hacia la izquierda, la cara queda fija abajo a la derecha
    def _medidas_globo(self):
        if not self._globo:
            return 0, 0
        fm = QFontMetrics(self._fuente())
        r = fm.boundingRect(0, 0, 230, 400, Qt.TextWordWrap, self._globo)
        return r.width() + 28, r.height() + 22

    def _fuente(self):
        f = QFont("JetBrains Mono"); f.setPointSize(9)
        return f

    def _ajustar(self):
        gw, gh = self._medidas_globo()
        w, h = LADO + (gw + 8 if gw else 0), max(LADO, gh + 40) if gw else LADO
        if (w, h) != (self.width(), self.height()):
            der, abajo = self.x() + self.width(), self.y() + self.height()
            self.resize(w, h)
            if self.isVisible():
                self.move(der - w, abajo - h)

    def _tick(self):
        self._t += 0.033
        if self._globo and time.time() > self._globo_hasta:
            self._globo = ""
            self._ajustar()
        if self._estado_hasta and time.time() > self._estado_hasta:
            self._estado, self._estado_hasta = "reposo", 0.0
        if self._rostro is not None:
            c = self.mapFromGlobal(self.cursor().pos())
            cx, cy = self.width() - LADO / 2, self.height() - LADO / 2
            self._rostro.mirar(max(-1, min(1, (c.x() - cx) / 400.0)), max(-1, min(1, (c.y() - cy) / 400.0)))
        self.update()

    def paintEvent(self, _e):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        cara = QRectF(self.width() - LADO, self.height() - LADO, LADO, LADO)
        # halo suave
        p.setPen(Qt.NoPen)
        for i, a in ((12, 18), (6, 28)):
            p.setBrush(QColor(243, 229, 237, a))
            p.drawEllipse(cara.adjusted(i, i, -i, -i))
        if self._rostro is not None:
            path = QPainterPath(); path.addEllipse(cara.adjusted(10, 10, -10, -10))
            p.save(); p.setClipPath(path)
            self._rostro.paint(p, cara.adjusted(10, 10, -10, -10), self._t, self._estado)
            p.restore()
        else:
            p.setBrush(ORO); p.drawEllipse(cara.adjusted(40, 40, -40, -40))
        p.setPen(QPen(ORO, 1.4)); p.setBrush(Qt.NoBrush)
        p.drawEllipse(cara.adjusted(10, 10, -10, -10))
        if self._globo:
            gw, gh = self._medidas_globo()
            r = QRectF(0, max(0, self.height() - LADO / 2 - gh), gw, gh)
            path = QPainterPath(); path.addRoundedRect(r, 12, 12)
            cola = QPainterPath(); cola.moveTo(r.right() - 2, r.bottom() - 18); cola.lineTo(r.right() + 10, r.bottom() - 6)
            cola.lineTo(r.right() - 2, r.bottom() - 6); cola.closeSubpath()
            path = path.united(cola)
            p.setPen(QPen(QColor(255, 218, 19, 150), 1)); p.setBrush(TINTA); p.drawPath(path)
            p.setPen(PAPEL); p.setFont(self._fuente())
            p.drawText(r.adjusted(14, 11, -14, -11), Qt.TextWordWrap, self._globo)
        p.end()

    # --- ratón
    def mousePressEvent(self, e):
        if e.button() == Qt.LeftButton:
            self._arrastre = e.globalPos() - self.frameGeometry().topLeft()
            self._movio = False

    def mouseMoveEvent(self, e):
        if self._arrastre is not None and e.buttons() & Qt.LeftButton:
            self.move(e.globalPos() - self._arrastre)
            self._movio = True

    def mouseReleaseEvent(self, e):
        if e.button() == Qt.LeftButton:
            if self._movio:
                _guardar_pos(self.x(), self.y())
            elif self.al_callar:
                self.al_callar()               # un clic la calla si está hablando
            self._arrastre = None

    def mouseDoubleClickEvent(self, _e):
        if self.al_doble_clic:
            self.al_doble_clic()

    def contextMenuEvent(self, e):
        m = QMenu(self)
        m.setStyleSheet("QMenu{background:#15070e;color:#f0f0f8;border:1px solid #ffda13;font:10pt 'JetBrains Mono';}"
                        "QMenu::item:selected{background:rgba(255, 218, 19, 60);}")
        a1 = m.addAction("Abrir ARIA")
        a2 = m.addAction("Callar")
        a3 = m.addAction("Ocultar mascota")
        r = m.exec_(e.globalPos())
        if r == a1 and self.al_doble_clic:
            self.al_doble_clic()
        elif r == a2 and self.al_callar:
            self.al_callar()
        elif r == a3:
            self.hide()
            if self.al_cerrar:
                self.al_cerrar()
