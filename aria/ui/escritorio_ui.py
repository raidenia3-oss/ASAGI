# -*- coding: utf-8 -*-
"""Pestañas del escritorio de ARIA: Apps (launcher), Archivos y Ventanas. Usa escritorio.py (la lógica)."""
import os
import sys

from PyQt5.QtCore import Qt, QFileInfo, QSize, QTimer
from PyQt5.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLineEdit, QLabel, QPushButton, QListWidget,
                             QListWidgetItem, QFileIconProvider, QMenu, QListView, QAbstractItemView)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import escritorio_pc as E  # noqa: E402

ORO, CARMESI, PAPEL, TINTA = "#FFD700", "#DC143C", "#F0F0F8", "#080408"
MONO = "Consolas"
_CAJA = ("background:rgba(24, 8, 15, 0.55);border:1px solid rgba(255, 215, 0, 0.30);border-radius:14px;")
_LISTA = ("QListWidget{%s color:%s;font:12px '%s';padding:10px;outline:0;}"
          "QListWidget::item{border-radius:10px;padding:6px;}"
          "QListWidget::item:hover{background:rgba(220, 20, 60, 0.18);}"
          "QListWidget::item:selected{background:rgba(255, 215, 0, 0.16);color:%s;}") % (_CAJA, PAPEL, MONO, ORO)
_BUSCA = ("QLineEdit{background:rgba(14, 5, 11, 0.7);border:1px solid rgba(255, 215, 0, 0.5);border-radius:12px;"
          "color:%s;font:14px '%s';padding:10px 14px;}QLineEdit:focus{border:1px solid %s;}") % (PAPEL, MONO, ORO)
_CHIP = ("QPushButton{background:rgba(14, 5, 11, 0.6);color:%s;border:1px solid rgba(255, 215, 0, 0.35);border-radius:12px;"
         "font:11px '%s';padding:6px 12px;text-align:left;}QPushButton:hover{border:1px solid %s;color:%s;}") % (PAPEL, MONO, ORO, ORO)


def _titulo(txt, sub=""):
    l = QLabel("%s%s" % (txt, ("  <span style='color:%s;font-size:11px;letter-spacing:1px'>%s</span>" % (CARMESI, sub)) if sub else ""))
    l.setStyleSheet("color:%s;font:700 13px '%s';letter-spacing:3px;" % (ORO, MONO))
    return l


def _dos_lineas(n, ancho=14):
    """Nombre en máx. 2 líneas cortas (Qt no parte bien el texto en la rejilla)."""
    l1, l2 = "", ""
    for p in n.split():
        if not l2 and len((l1 + " " + p).strip()) <= ancho:
            l1 = (l1 + " " + p).strip()
        else:
            l2 = (l2 + " " + p).strip()
    if not l1:
        l1, l2 = n[:ancho], n[ancho:]
    if len(l2) > ancho:
        l2 = l2[:ancho - 1] + "…"
    return l1 + ("\n" + l2 if l2 else "")


class _Iconos:
    _p = None

    @classmethod
    def de(cls, ruta):
        if cls._p is None:
            cls._p = QFileIconProvider()
        return cls._p.icon(QFileInfo(ruta))


class PaginaApps(QWidget):
    """Launcher: buscador (Enter abre la primera), favoritas arriba, todas en rejilla. Clic derecho: fijar / ocultar."""

    def __init__(self, decir=None, preguntar=None, parent=None):
        super().__init__(parent)
        self.decir = decir or (lambda t: None)
        self.preguntar = preguntar or (lambda t: None)
        self.apps = []
        lay = QVBoxLayout(self); lay.setContentsMargins(0, 0, 0, 0); lay.setSpacing(10)
        lay.addWidget(_titulo("APPS", "Enter abre la primera · clic derecho: fijar u ocultar"))
        self.busca = QLineEdit(); self.busca.setPlaceholderText("Busca una app… (ej. spo, vsc, chrome)")
        self.busca.setStyleSheet(_BUSCA)
        self.busca.textChanged.connect(self._pintar)
        self.busca.returnPressed.connect(self._abrir_primera)
        lay.addWidget(self.busca)
        self.fav = QHBoxLayout(); self.fav.setSpacing(8)
        lay.addLayout(self.fav)
        self.lista = QListWidget(); self.lista.setStyleSheet(_LISTA)
        self.lista.setViewMode(QListView.IconMode); self.lista.setResizeMode(QListView.Adjust); self.lista.setMovement(QListView.Static)
        self.lista.setIconSize(QSize(40, 40)); self.lista.setGridSize(QSize(118, 96)); self.lista.setWordWrap(True); self.lista.setTextElideMode(Qt.ElideNone)
        self.lista.setSelectionMode(QAbstractItemView.SingleSelection)
        self.lista.itemActivated.connect(lambda it: self._abrir(it.data(Qt.UserRole)))
        self.lista.itemClicked.connect(lambda it: self._abrir(it.data(Qt.UserRole)))
        self.lista.setContextMenuPolicy(Qt.CustomContextMenu)
        self.lista.customContextMenuRequested.connect(self._menu)
        lay.addWidget(self.lista, 1)
        self.pie = QLabel(""); self.pie.setStyleSheet("color:rgba(240,240,248,0.55);font:11px '%s';" % MONO)
        lay.addWidget(self.pie)
        self._cargada = False

    def showEvent(self, e):
        super().showEvent(e)
        if not self._cargada:
            self._cargada = True
            QTimer.singleShot(0, self.recargar)
        self.busca.setFocus()

    def recargar(self):
        try:
            self.apps = E.escanear()
        except Exception as exc:
            self.apps = []
            self.decir("No pude leer tu menú Inicio: %s" % exc)
        self._pintar()

    def _pintar(self, *_):
        d = E.leer()
        q = self.busca.text()
        while self.fav.count():
            w = self.fav.takeAt(0).widget()
            if w:
                w.deleteLater()
        favs = [] if q.strip() else E.favoritas(self.apps, d["usos"], d["fijadas"], 6)
        for a in favs:
            b = QPushButton(("📌 " if a["ruta"] in d["fijadas"] else "") + a["nombre"][:22])
            b.setIcon(_Iconos.de(a["ruta"])); b.setIconSize(QSize(18, 18)); b.setCursor(Qt.PointingHandCursor)
            b.setStyleSheet(_CHIP); b.clicked.connect(lambda _=False, r=a["ruta"]: self._abrir(r))
            self.fav.addWidget(b)
        self.fav.addStretch(1)
        res = E.buscar(self.apps, q, d["ocultas"], 0 if not q.strip() else 60)
        self.lista.clear()
        for a in res:
            it = QListWidgetItem(_Iconos.de(a["ruta"]), _dos_lineas(a["nombre"]))
            it.setData(Qt.UserRole, a["ruta"]); it.setToolTip(a["nombre"])
            self.lista.addItem(it)
        if res:
            self.lista.setCurrentRow(0)
        if not self.apps:
            self.pie.setText("Tu menú Inicio está vacío o no es Windows." if not sys.platform.startswith("win") else "Leyendo tus apps…")
        elif q.strip() and not res:
            self.pie.setText("Ninguna app se llama así. Enter le pregunta a ARIA.")
        else:
            oc = len(d["ocultas"])
            self.pie.setText("%d apps%s" % (len(res), (" · %d ocultas (clic derecho en una para mostrarla de nuevo desde «ocultas»)" % oc) if oc else ""))

    def _abrir_primera(self):
        it = self.lista.currentItem() or self.lista.item(0)
        if it:
            self._abrir(it.data(Qt.UserRole))
        elif self.busca.text().strip():
            self.preguntar(self.busca.text().strip())     # que lo resuelva el chat
            self.busca.clear()

    def _abrir(self, ruta):
        ok, txt = E.abrir(ruta)
        self.decir(txt)
        if ok:
            self.busca.clear()

    def _menu(self, pos):
        it = self.lista.itemAt(pos)
        d = E.leer()
        m = QMenu(self)
        m.setStyleSheet("QMenu{background:%s;color:%s;border:1px solid %s;font:12px '%s';}QMenu::item:selected{background:rgba(220,20,60,0.3);}" % (TINTA, PAPEL, ORO, MONO))
        if it:
            r = it.data(Qt.UserRole)
            m.addAction("Quitar de favoritas" if r in d["fijadas"] else "Fijar en favoritas", lambda: (E.alternar("fijadas", r), self._pintar()))
            m.addAction("Ocultar de la lista", lambda: (E.alternar("ocultas", r), self._pintar()))
        if d["ocultas"]:
            sub = m.addMenu("Mostrar oculta…")
            for r in d["ocultas"]:
                sub.addAction(E.nombre_de(r), lambda r=r: (E.alternar("ocultas", r), self._pintar()))
        m.addAction("Volver a leer el menú Inicio", self.recargar)
        m.exec_(self.lista.mapToGlobal(pos))


class PaginaArchivos(QWidget):
    """Carpetas de siempre + lo último que abriste. Doble clic abre (con la app que Windows tenga para ese archivo)."""

    def __init__(self, decir=None, parent=None):
        super().__init__(parent)
        self.decir = decir or (lambda t: None)
        lay = QVBoxLayout(self); lay.setContentsMargins(0, 0, 0, 0); lay.setSpacing(10)
        lay.addWidget(_titulo("CARPETAS"))
        self.carp = QHBoxLayout(); self.carp.setSpacing(8)
        lay.addLayout(self.carp)
        lay.addWidget(_titulo("RECIENTES", "lo último que abriste en tu PC"))
        self.lista = QListWidget(); self.lista.setStyleSheet(_LISTA); self.lista.setIconSize(QSize(22, 22))
        self.lista.itemActivated.connect(lambda it: self.decir(E.abrir(it.data(Qt.UserRole))[1]))
        self.lista.itemDoubleClicked.connect(lambda it: self.decir(E.abrir(it.data(Qt.UserRole))[1]))
        lay.addWidget(self.lista, 1)

    def showEvent(self, e):
        super().showEvent(e)
        while self.carp.count():
            w = self.carp.takeAt(0).widget()
            if w:
                w.deleteLater()
        for c in E.carpetas():
            b = QPushButton("📁 " + c["nombre"]); b.setStyleSheet(_CHIP); b.setCursor(Qt.PointingHandCursor)
            b.clicked.connect(lambda _=False, r=c["ruta"]: self.decir(E.abrir(r)[1]))
            self.carp.addWidget(b)
        self.carp.addStretch(1)
        self.lista.clear()
        rs = E.recientes()
        for r in rs:
            it = QListWidgetItem(_Iconos.de(r["ruta"]), r["nombre"]); it.setData(Qt.UserRole, r["ruta"])
            self.lista.addItem(it)
        if not rs:
            self.lista.addItem("(nada reciente todavía)")


class PaginaVentanas(QWidget):
    """Lo que tienes abierto. Clic: la trae al frente. ARIA nunca cierra tus ventanas."""

    def __init__(self, decir=None, parent=None):
        super().__init__(parent)
        self.decir = decir or (lambda t: None)
        lay = QVBoxLayout(self); lay.setContentsMargins(0, 0, 0, 0); lay.setSpacing(10)
        fila = QHBoxLayout()
        fila.addWidget(_titulo("VENTANAS", "clic para traerla al frente · nunca las cierro")); fila.addStretch(1)
        bt = QPushButton("↻ actualizar"); bt.setStyleSheet(_CHIP); bt.clicked.connect(self._pintar); fila.addWidget(bt)
        lay.addLayout(fila)
        self.lista = QListWidget(); self.lista.setStyleSheet(_LISTA)
        self.lista.itemClicked.connect(self._ir)
        lay.addWidget(self.lista, 1)

    def showEvent(self, e):
        super().showEvent(e)
        self._pintar()

    def _pintar(self):
        self.lista.clear()
        vs = [v for v in E.ventanas() if not v["propia"]]
        for v in vs:
            it = QListWidgetItem("▸ " + v["titulo"][:90]); it.setData(Qt.UserRole, v["hwnd"])
            self.lista.addItem(it)
        if not vs:
            self.lista.addItem("(no veo otras ventanas abiertas)")

    def _ir(self, it):
        h = it.data(Qt.UserRole)
        if h:
            self.decir("Al frente: %s" % it.text()[2:52] if E.enfocar(h) else "Windows no me dejó traerla al frente.")


class BarraTareas(QWidget):
    """Barra de tareas de ARIA (modo escritorio): Inicio · apps fijadas y ventanas abiertas · volumen · batería · hora.
    Clic en una app cerrada la abre; en una abierta la trae al frente. Nunca cierra nada."""

    def __init__(self, decir=None, al_inicio=None, parent=None):
        super().__init__(parent)
        self.decir = decir or (lambda t: None)
        self.al_inicio = al_inicio or (lambda: None)
        self.setObjectName("barraTareas")
        self.setStyleSheet("QWidget#barraTareas{background:rgba(8,4,8,0.82);border:1px solid rgba(255,215,0,0.22);border-radius:16px;}")
        lay = QHBoxLayout(self); lay.setContentsMargins(10, 6, 10, 6); lay.setSpacing(6)
        ini = QPushButton("◆ Inicio"); ini.setCursor(Qt.PointingHandCursor); ini.setToolTip("Tus apps (Ctrl+2)")
        ini.setStyleSheet("QPushButton{background:%s;color:%s;border:0;border-radius:11px;font:700 12px '%s';padding:7px 14px;}"
                          "QPushButton:hover{background:#ff2a55;}" % (CARMESI, PAPEL, MONO))
        ini.clicked.connect(lambda: self.al_inicio())
        lay.addWidget(ini)
        self.zona = QHBoxLayout(); self.zona.setSpacing(4)
        lay.addLayout(self.zona, 1)
        self.sis = QHBoxLayout(); self.sis.setSpacing(4)
        for txt, d, tip in (("🔉", "bajar", "Bajar volumen"), ("🔊", "subir", "Subir volumen"), ("🔇", "silencio", "Silencio")):
            b = QPushButton(txt); b.setToolTip(tip); b.setFixedSize(30, 30); b.setCursor(Qt.PointingHandCursor)
            b.setStyleSheet("QPushButton{background:transparent;border:0;font-size:14px;}QPushButton:hover{background:rgba(255,215,0,0.15);border-radius:8px;}")
            b.clicked.connect(lambda _=False, d=d: E.volumen(d))
            self.sis.addWidget(b)
        self.lbl = QLabel(""); self.lbl.setStyleSheet("color:%s;font:700 12px '%s';padding-left:8px;" % (ORO, MONO))
        self.sis.addWidget(self.lbl)
        lay.addLayout(self.sis)
        self._t = QTimer(self); self._t.timeout.connect(self.refrescar); self._t.start(4000)
        QTimer.singleShot(200, self.refrescar)

    def refrescar(self):
        if not self.isVisible():
            return
        import time as _time
        d = E.leer()
        try:
            apps = E.escanear() if not hasattr(self, "_apps") else self._apps
            self._apps = apps
        except Exception:
            apps = []
        favs = E.favoritas(apps, d["usos"], d["fijadas"], 6)
        items = E.barra(favs, E.ventanas())
        while self.zona.count():
            w = self.zona.takeAt(0).widget()
            if w:
                w.deleteLater()
        for it in items:
            b = QPushButton(E.nombre_corto(it["nombre"], 16)); b.setCursor(Qt.PointingHandCursor); b.setToolTip(it["nombre"])
            if it.get("ruta"):
                b.setIcon(_Iconos.de(it["ruta"])); b.setIconSize(QSize(16, 16))
            b.setStyleSheet("QPushButton{background:%s;color:%s;border:0;border-bottom:2px solid %s;border-radius:9px;font:11px '%s';padding:6px 10px;}"
                            "QPushButton:hover{background:rgba(255,215,0,0.14);}" % (
                                "rgba(240,240,248,0.08)" if it["abierta"] else "transparent", PAPEL,
                                CARMESI if it["abierta"] else "transparent", MONO))
            b.clicked.connect(lambda _=False, it=it: self._usar(it))
            self.zona.addWidget(b)
        self.zona.addStretch(1)
        pct, carga = E.bateria()
        h = _time.localtime()
        hora = "%d:%02d %s" % ((h.tm_hour % 12) or 12, h.tm_min, "a. m." if h.tm_hour < 12 else "p. m.")
        self.lbl.setText(("%s%d%%  " % ("⚡" if carga else "▮", pct) if pct is not None else "") + hora)

    def _usar(self, it):
        if it.get("hwnd"):
            if not E.enfocar(it["hwnd"]):
                self.decir("Windows no me dejó traer «%s» al frente." % it["nombre"][:40])
        elif it.get("ruta"):
            self.decir(E.abrir(it["ruta"])[1])
        QTimer.singleShot(800, self.refrescar)
