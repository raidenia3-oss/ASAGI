"""Captura la interfaz de ARIA sin pantalla (para revisarla «con ojos de usuario» desde la nube o CI).
Uso:  QT_QPA_PLATFORM=offscreen python3 scripts/aria_captura.py salida.png
Solo necesita PyQt5 (ya es dependencia de ARIA). No abre ventanas ni servidores."""
import os, sys
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(AQUI, "..", "aria")); sys.path.insert(0, os.path.join(AQUI, "..", "aria", "ui"))
from PyQt5.QtWidgets import QApplication
from PyQt5.QtCore import QTimer

app = QApplication([])
import ui_shell
w = ui_shell.Shell(responder=lambda t: "(captura de prueba) " + t)
w.resize(1280, 760); w.show()
salida = sys.argv[1] if len(sys.argv) > 1 else "aria.png"
def _foto():
    w.grab().save(salida); print("guardado", salida); app.quit()
QTimer.singleShot(3000, _foto)
app.exec_()
