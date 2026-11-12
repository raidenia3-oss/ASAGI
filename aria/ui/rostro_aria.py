# -*- coding: utf-8 -*-
"""ARIA - Rostro (cuerpo 'rostro'): cara original de ARIA en QPainter, sin dependencias.

Diseño propio: pelo ciruela con puntas doradas y flequillo recto, diadema dorada con
una gema lila, ojos violeta con aro dorado geometrico. Lo que toma de sus referencias
es el CARACTER, no el aspecto:
  - analitica (reposo):  parpados a media altura, mirada serena, runas que giran lento.
  - curiosa:             ladea la cabeza, ojos muy abiertos con destello, ceja arriba.
  - picara:              guiño y media sonrisa.
  - pensando:            mira arriba, los aros del iris giran como calculando.
  - hablando:            boca que sigue la voz.
La logica (apertura de boca, parpadeo, mirada) es pura y testeable; paint() dibuja.
"""
import math

ESTADOS = ("reposo", "analitica", "curiosa", "picara", "pensando", "hablando", "escuchando")

P = {"pelo": (34, 24, 52), "pelo2": (58, 40, 88), "oro": (230, 195, 106), "lila": (169, 155, 255),
     "rosa": (240, 140, 180), "piel": (246, 238, 236), "piel2": (232, 218, 220), "tinta": (22, 14, 34)}


def boca(t, hablando):
    """Apertura 0..1 (pura)."""
    if not hablando:
        return 0.0
    v = 0.5 + 0.3 * math.sin(t * 21) + 0.2 * math.sin(t * 13.7 + 1.1)
    return 0.15 + max(0.0, min(1.0, v)) * 0.85


def parpadeo(t):
    """1 abierto .. 0 cerrado; un parpadeo cada ~3.8 s (pura)."""
    f = (t * 1000) % 3800
    if f > 3800 - 140:
        p = (f - (3800 - 140)) / 140.0
        return abs(math.cos(p * math.pi))
    return 1.0


try:
    from PyQt5.QtCore import Qt, QPointF, QRectF
    from PyQt5.QtGui import (QPainter, QColor, QPen, QBrush, QPainterPath,
                             QLinearGradient, QRadialGradient)
    _QT = True
except Exception:  # pragma: no cover
    _QT = False


def _c(rgb, a=255):
    return QColor(rgb[0], rgb[1], rgb[2], int(a))


class Rostro:
    def __init__(self):
        self.mira = [0.0, 0.0]
        self.mira_obj = [0.0, 0.0]

    def mirar(self, nx, ny):
        self.mira_obj = [max(-1.0, min(1.0, nx)), max(-1.0, min(1.0, ny))]

    def paint(self, p, rect, t, estado="reposo"):
        if not _QT:
            return
        est = estado if estado in ESTADOS else "reposo"
        if est == "reposo":
            est = "analitica"
        piensa, curiosa, picara = est == "pensando", est == "curiosa", est == "picara"
        habla = est == "hablando"
        escucha = est == "escuchando"
        if piensa:
            self.mira_obj = [-0.5, -0.65]
        elif self.mira_obj == [0.0, 0.0] or est == "analitica":
            self.mira_obj = [math.sin(t / 2.4) * 0.3, math.sin(t / 3.3) * 0.15]
        self.mira[0] += (self.mira_obj[0] - self.mira[0]) * 0.08
        self.mira[1] += (self.mira_obj[1] - self.mira[1]) * 0.08
        mx, my = self.mira

        W, H = rect.width(), rect.height()
        R = min(W, H) * 0.34
        p.save()
        p.setRenderHint(QPainter.Antialiasing)
        p.translate(rect.x() + W / 2, rect.y() + H / 2 + R * 0.12 + math.sin(t / 1.5) * R * 0.015)

        # sello del sabio: halo + anillo de runas que gira
        g = QRadialGradient(QPointF(0, 0), R * 1.8)
        g.setColorAt(0, _c(P["lila"], 60 + (40 if (habla or escucha) else 0)))
        g.setColorAt(1, _c(P["lila"], 0))
        p.setPen(Qt.NoPen); p.setBrush(QBrush(g)); p.drawEllipse(QPointF(0, 0), R * 1.8, R * 1.8)
        p.save(); p.rotate(t * (12 if piensa else 3))
        for k in range(24):
            a = k * math.pi / 12
            larga = k % 3 == 0
            p.setPen(QPen(_c(P["oro"], 150 if larga else 60), max(1.0, R * (0.02 if larga else 0.012))))
            r1, r2 = R * 1.45, R * (1.58 if larga else 1.52)
            p.drawLine(QPointF(math.cos(a) * r1, math.sin(a) * r1), QPointF(math.cos(a) * r2, math.sin(a) * r2))
        p.restore()

        ladeo = (9 if curiosa else 0) + (-4 if picara else 0) + math.sin(t / 2.7) * 1.2
        p.rotate(ladeo)
        hx, hy = mx * R * 0.05, my * R * 0.03

        # pelo de atras: largo y recto
        gp = QLinearGradient(0, -R * 1.2, 0, R * 1.6)
        gp.setColorAt(0, _c(P["pelo2"])); gp.setColorAt(0.8, _c(P["pelo"])); gp.setColorAt(1, _c(P["oro"], 200))
        back = QPainterPath()
        back.moveTo(-R * 1.0, R * 1.55)
        back.cubicTo(-R * 1.22, R * 0.2, -R * 1.1, -R * 1.25, hx, -R * 1.2)
        back.cubicTo(R * 1.1, -R * 1.25, R * 1.22, R * 0.2, R * 1.0, R * 1.55)
        back.lineTo(R * 0.5, R * 0.6); back.lineTo(-R * 0.5, R * 0.6); back.closeSubpath()
        p.setPen(Qt.NoPen); p.setBrush(QBrush(gp)); p.drawPath(back)

        p.save(); p.translate(hx, hy)
        # cara
        gf = QLinearGradient(0, -R * 0.9, 0, R * 0.95)
        gf.setColorAt(0, _c(P["piel"])); gf.setColorAt(1, _c(P["piel2"]))
        cara = QPainterPath()
        cara.moveTo(0, R * 0.9)
        cara.cubicTo(R * 0.42, R * 0.84, R * 0.72, R * 0.42, R * 0.74, -R * 0.1)
        cara.cubicTo(R * 0.78, -R * 0.75, R * 0.4, -R * 0.95, 0, -R * 0.95)
        cara.cubicTo(-R * 0.4, -R * 0.95, -R * 0.78, -R * 0.75, -R * 0.74, -R * 0.1)
        cara.cubicTo(-R * 0.72, R * 0.42, -R * 0.42, R * 0.84, 0, R * 0.9)
        p.setBrush(QBrush(gf)); p.drawPath(cara)
        for s in (-1, 1):
            gb = QRadialGradient(QPointF(s * R * 0.42, R * 0.3), R * 0.2)
            gb.setColorAt(0, _c(P["rosa"], 90 if (picara or curiosa) else 55)); gb.setColorAt(1, _c(P["rosa"], 0))
            p.setBrush(QBrush(gb)); p.drawEllipse(QPointF(s * R * 0.42, R * 0.3), R * 0.2, R * 0.2)

        # ojos
        ab = parpadeo(t)
        if est == "analitica":
            ab *= 0.72
        if curiosa or escucha:
            ab = min(1.15, ab * 1.12)
        if piensa:
            ab = 0.62
        ix, iy = mx * R * 0.06, my * R * 0.05
        for s in (-1, 1):
            guino = picara and s == 1
            self._ojo(p, R, s * R * 0.33, R * 0.06, s, 0.0 if guino else ab, ix, iy, t, piensa, curiosa)

        # boca
        p.save(); p.translate(0, R * 0.55)
        ap = boca(t, habla)
        if ap > 0.05:
            p.setBrush(_c((110, 34, 60))); p.setPen(Qt.NoPen)
            p.drawEllipse(QPointF(0, R * 0.02), R * 0.07 + ap * R * 0.03, R * 0.02 + ap * R * 0.07)
        else:
            p.setPen(QPen(_c((140, 60, 85)), R * 0.025, Qt.SolidLine, Qt.RoundCap)); p.setBrush(Qt.NoBrush)
            path = QPainterPath()
            if picara:                       # media sonrisa ladeada
                path.moveTo(-R * 0.08, R * 0.01); path.quadTo(R * 0.02, R * 0.05, R * 0.1, -R * 0.03)
            else:
                curva = R * (0.045 if curiosa else (0.0 if piensa else 0.02))
                path.moveTo(-R * 0.07, 0); path.quadTo(0, curva, R * 0.07, 0)
            p.drawPath(path)
        p.restore()

        # flequillo recto (corte limpio) con mechones laterales
        fl = QPainterPath()
        fl.moveTo(-R * 0.84, R * 0.0)
        fl.cubicTo(-R * 0.9, -R * 0.95, -R * 0.4, -R * 1.12, 0, -R * 1.08)
        fl.cubicTo(R * 0.42, -R * 1.12, R * 0.9, -R * 0.95, R * 0.84, R * 0.0)
        fl.lineTo(R * 0.7, -R * 0.2)
        n = 9
        for i in range(n + 1):
            x = R * 0.7 - i * (R * 1.4 / n)
            y = -R * 0.26 + (R * 0.035 if i % 2 else 0) + math.sin(t / 1.3 + i) * R * 0.004
            fl.lineTo(x, y)
        fl.lineTo(-R * 0.84, R * 0.0); fl.closeSubpath()
        p.setPen(Qt.NoPen); p.setBrush(QBrush(gp)); p.drawPath(fl)
        for s in (-1, 1):
            lat = QPainterPath()
            lat.moveTo(s * R * 0.8, -R * 0.25)
            lat.quadTo(s * R * 0.92, R * 0.6, s * R * (0.66 + math.sin(t / 1.6 + s) * 0.015), R * 1.12)
            lat.quadTo(s * R * 0.72, R * 0.45, s * R * 0.64, -R * 0.15); lat.closeSubpath()
            p.drawPath(lat)
        # brillo del pelo
        p.setPen(QPen(_c(P["lila"], 90), R * 0.03)); p.setBrush(Qt.NoBrush)
        p.drawArc(QRectF(-R * 0.75, -R * 0.95, R * 1.5, R * 1.4), 40 * 16, 50 * 16)

        # diadema dorada con gema
        p.setPen(QPen(_c(P["oro"]), R * 0.035)); p.setBrush(Qt.NoBrush)
        p.drawArc(QRectF(-R * 0.86, -R * 0.98, R * 1.72, R * 1.2), 20 * 16, 140 * 16)
        p.save(); p.translate(0, -R * 0.98)
        gem = QPainterPath(); gem.moveTo(0, -R * 0.09); gem.lineTo(R * 0.07, 0); gem.lineTo(0, R * 0.09); gem.lineTo(-R * 0.07, 0); gem.closeSubpath()
        p.setPen(QPen(_c(P["oro"]), R * 0.02)); p.setBrush(_c(P["lila"])); p.drawPath(gem)
        p.restore()

        # cejas (por encima del flequillo)
        p.setPen(QPen(_c(P["tinta"], 200), R * 0.032, Qt.SolidLine, Qt.RoundCap))
        for s in (-1, 1):
            sube = (R * 0.06 if (curiosa and s == -1) else 0) + (R * 0.03 if escucha else 0)
            y0 = -R * 0.2 - sube
            c = QPainterPath(); c.moveTo(s * R * 0.18, y0 + R * 0.02)
            c.quadTo(s * R * 0.33, y0 - R * 0.05, s * R * 0.48, y0 + (R * 0.03 if est == "analitica" else 0.0))
            p.drawPath(c)
        p.restore()

        # glifos en orbita al pensar
        if piensa:
            for i in range(3):
                a = t * 2.2 + i * 2.094
                p.setPen(Qt.NoPen); p.setBrush(_c(P["oro"] if i == 1 else P["lila"], 220 - i * 50))
                p.drawEllipse(QPointF(math.cos(a) * R * 1.1, math.sin(a) * R * 0.5 - R * 1.0), R * 0.045, R * 0.045)
        p.restore()

    def _ojo(self, p, R, x, y, s, ab, ix, iy, t, piensa, curiosa):
        w, h = R * 0.25, R * 0.3
        p.save(); p.translate(x, y)
        if ab < 0.08:
            p.setPen(QPen(_c(P["tinta"]), R * 0.045, Qt.SolidLine, Qt.RoundCap)); p.setBrush(Qt.NoBrush)
            c = QPainterPath(); c.moveTo(-w * 0.9, 0); c.quadTo(0, -h * 0.4, w * 0.9, 0); p.drawPath(c)
            p.restore(); return
        p.save(); p.scale(1, max(0.08, ab))
        blanco = QPainterPath(); blanco.addEllipse(QPointF(0, 0), w * 0.95, h * 0.55)
        p.setPen(Qt.NoPen); p.setBrush(_c((252, 250, 255))); p.drawPath(blanco)
        p.setClipPath(blanco)
        gi = QLinearGradient(0, -h * 0.5, 0, h * 0.5)
        gi.setColorAt(0, _c((40, 24, 80))); gi.setColorAt(0.55, _c(P["lila"])); gi.setColorAt(1, _c((226, 214, 255)))
        p.setBrush(QBrush(gi)); p.drawEllipse(QPointF(ix, iy + h * 0.04), w * 0.55, h * 0.62)
        # aro dorado geometrico (hexagono) que gira al pensar
        p.save(); p.translate(ix, iy + h * 0.04); p.rotate((t * 90) if piensa else 0)
        hexa = QPainterPath()
        for k in range(7):
            a = k * math.pi / 3
            pt = QPointF(math.cos(a) * w * 0.4, math.sin(a) * h * 0.44)
            hexa.moveTo(pt) if k == 0 else hexa.lineTo(pt)
        p.setPen(QPen(_c(P["oro"], 230), R * 0.014)); p.setBrush(Qt.NoBrush); p.drawPath(hexa)
        p.restore()
        p.setPen(Qt.NoPen); p.setBrush(_c((18, 10, 30))); p.drawEllipse(QPointF(ix, iy + h * 0.06), w * 0.2, h * 0.28)
        p.setBrush(_c((255, 255, 255), 245)); p.drawEllipse(QPointF(ix - w * 0.2, iy - h * 0.18), w * 0.13, h * 0.12)
        p.drawEllipse(QPointF(ix + w * 0.2, iy + h * 0.2), w * 0.055, w * 0.055)
        if curiosa:
            p.setBrush(_c(P["oro"], 230)); p.drawEllipse(QPointF(ix + w * 0.05, iy - h * 0.25), w * 0.06, w * 0.06)
        p.restore()
        # pestañas
        p.setPen(QPen(_c(P["tinta"]), R * 0.05, Qt.SolidLine, Qt.RoundCap)); p.setBrush(Qt.NoBrush)
        top = -h * 0.55 * max(0.08, ab)
        c = QPainterPath(); c.moveTo(-w * 1.0, top * 0.5); c.quadTo(0, top * 1.35, w * 1.02, top * 0.6); p.drawPath(c)
        p.setPen(QPen(_c(P["tinta"]), R * 0.028, Qt.SolidLine, Qt.RoundCap))
        p.drawLine(QPointF(s * w * 1.0, top * 0.6), QPointF(s * w * 1.24, top * 1.1))
        p.restore()
