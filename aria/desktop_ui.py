# -*- coding: utf-8 -*-
"""ARIA Desktop UI - PyQt5 window with orb visual, chat, and IPC client."""

from __future__ import annotations

import json
import math
import os
import re
import sys
import threading
import time
import queue
from pathlib import Path

ARIA_APP = Path(__file__).resolve().parent
PROJECT_ROOT = ARIA_APP.parent
for p in [str(ARIA_APP)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from PyQt5.QtCore import Qt, QTimer, pyqtSignal, QThread, QSize, QEasingCurve, QSettings, QObject
from PyQt5.QtGui import QPainter, QColor, QFont, QPen, QBrush, QIcon, QRadialGradient, QFontDatabase, QKeySequence, QTextCursor
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
    QHBoxLayout, QTextEdit, QLineEdit, QPushButton, QLabel, QListWidget,
    QListWidgetItem, QFrame, QSizePolicy, QMessageBox, QSystemTrayIcon, QMenu,
    QScrollArea, QButtonGroup, QProxyStyle, QStyle, QStyleOptionButton, QShortcut,
    QTableWidget, QTableWidgetItem, QComboBox, QHeaderView, QFileDialog)
from PyQt5.QtWidgets import QPushButton as _QBtn
try:
    from themes import get_theme, resolve_theme
except Exception:
    try:
        from .themes import get_theme, resolve_theme
    except Exception:
        get_theme = None
        resolve_theme = None

# ── Serpentium Color Palette ──────────────────────────────────────────────────
C_BG_DEEP    = "#131526"   # primary deep blue
C_BG_MID     = "#1d213c"   # mid tone
C_BG_CARD    = "#1e223e"   # card background
C_ACCENT     = "#e5c064"   # cyan accent
C_SECONDARY  = "#ccc4ff"   # purple hover
C_SUCCESS    = "#e84f8c"   # green
C_WARNING    = "#f59e0b"   # orange
C_TEXT_DIM   = "#969ab6"   # dim text
C_TEXT_MAIN  = "#f3e2b7"   # main text
C_GLOW_CYAN  = QColor(229, 192, 100, 60)
C_GLOW_PURPLE= QColor(204, 196, 255, 50)
C_BORDER     = "rgba(229, 192, 100,0.25)"
C_BORDER_HOV = "rgba(204, 196, 255,0.5)"
C_TRANS      = "all 0.3s ease-out"

# Glassmorphism tokens (Neo Glass / Blucap style)
C_GLASS_BG      = "rgba(19, 21, 38, 0.55)"    # translucent backdrop
C_GLASS_BORDER  = "rgba(255, 255, 255, 0.08)"  # subtle white border
C_GLASS_GLOW    = "rgba(229, 192, 100, 0.15)"   # accent glow
C_BLUR_RADIUS   = 24                                  # backdrop blur px
C_CORNER_RADIUS = 16                                  # rounded corners
C_ELEVATION_1   = "0 4px 16px rgba(0, 0, 0,0.4)"    # shadow depth
C_ELEVATION_2   = "0 8px 32px rgba(0, 0, 0,0.5)"
C_ELEVATION_3   = "0 16px 48px rgba(0, 0, 0,0.6)"

# ── Phase 5: Epic Orb + Serpantinum x Caelestia Palette ────────────────────────
# Orb colors (Serpantinum vibrant)
C_ORB_BRIGHT    = "#e1b64b"
C_ORB_BASE      = "#e5c064"
C_ORB_DARK      = "#e0b546"
C_ORB_GLOW_1    = "rgba(229, 192, 100, 0.9)"
C_ORB_GLOW_2    = "rgba(229, 192, 100, 0.6)"
C_ORB_GLOW_3    = "rgba(229, 192, 100, 0.3)"
C_ORB_TALKING   = "#e1b64b"
C_ORB_LEARNING  = "#ccc4ff"
C_ORB_ERROR     = "#ef87b1"
# Backgrounds (Serpantinum dark aesthetic)
C_BG_DARK_0     = "#101221"
C_BG_DARK_1     = "#131526"
C_BG_DARK_2     = "#1b1f38"
C_BG_GLASS      = "rgba(19, 21, 38, 0.7)"
# ── Paleta ARIA: Ciel / Gran Sabio / Rafael - Echidna - Iroha Kohinata ─────────
# Ciel: cian #38bdf8 (informacion, energia fundamental, ojos/visor)
# Gran Sabio: violeta #a78bfa (sabiduria, analisis, observacion)
# Rafael: rosa-esmeralda #ec6c9f (transformacion, espada)
# Echidna: plata #e8edf4 + negro/blanco gótico (pelo blanco largo, vestido gótico)
# Iroha Kohinata: rosa/blanco #f193b8/#ffffff (audifonos, juguetona picara)
C_ACCENT      = "#e5c064"   # dorado calido (Gran Sabio Supremo / orb base)
C_ORB_BASE    = "#e5c064"
C_ORB_BRIGHT  = "#e1b64b"
C_ORB_DARK    = "#e0b546"
C_ORB_GLOW_1  = "rgba(229,192,100,0.9)"
C_ORB_GLOW_2  = "rgba(229,192,100,0.6)"
C_ORB_GLOW_3  = "rgba(229,192,100,0.3)"
C_ORB_TALKING = "#e1b64b"
C_ORB_LEARNING= "#ccc4ff"
C_ORB_ERROR   = "#ef87b1"
C_ACCENT_CYAN_BRIGHT   = "#38bdf8"   # Ciel (cian ojos/visor)
C_ACCENT_PURPLE        = "#beb3ff"   # Gran Sabio (lila)
C_ACCENT_GREEN         = "#ec6c9f"   # Rafael (rosa-esmeralda)
C_ACCENT_ORANGE        = "#f193b8"   # Iroha (rosa-naranja audifonos)
CYAN                   = "#38bdf8"   # Ciel
PLATA                  = "#e8edf4"   # Echidna (pelo plata)
CORE_BG                = "#0a0b12"   # fondo nucleo (gris-negro gótico Echidna)
# Text (Caelestia readability)
C_TEXT_PRIMARY   = "#ffffff"
C_TEXT_SECONDARY = "#f0daa3"
C_TEXT_TERTIARY  = "#969ab6"
# Global animation timing
C_EASE_MATERIAL = "cubic-bezier(0.4, 0.0, 0.2, 1)"
C_TRANS_FAST     = "all 150ms cubic-bezier(0.4, 0.0, 0.2, 1)"
C_TRANS_NORMAL   = "all 200ms cubic-bezier(0.4, 0.0, 0.2, 1)"
C_TRANS_SLOW     = "all 300ms cubic-bezier(0.4, 0.0, 0.2, 1)"

# ── Liquid Glass 3-Tier + Aspect Palette (viral, Raphael-Ciel style) ──────────
# Tier 1: heavy blur (paneles principales, fondo)
C_GLASS_T1_BG   = "rgba(19, 21, 38, 0.45)"
C_GLASS_T1_BORDER = "rgba(255, 255, 255, 0.06)"
C_GLASS_T1_BLUR  = 60
# Tier 2: medium blur (cards, controles)
C_GLASS_T2_BG   = "rgba(19, 21, 38, 0.35)"
C_GLASS_T2_BORDER = "rgba(255, 255, 255, 0.10)"
C_GLASS_T2_BLUR  = 30
# Tier 3: light blur (acentos, botones activos)
C_GLASS_T3_BG   = "rgba(19, 21, 38, 0.25)"
C_GLASS_T3_BORDER = "rgba(255, 255, 255, 0.14)"
C_GLASS_T3_BLUR  = 16
# XOR border trick (borde que se invierte sobre el fondo)
C_XOR_BORDER    = "rgba(255, 255, 255, 0.16)"
C_XOR_BORDER_GLOW = "rgba(225, 182, 75, 0.35)"

# Aspectos del núcleo (controlan colores del orbe y variables globales)
ASPECT_RGB = {
    "gran_sabio":   (139, 92, 246),   # violet
    "raphael":      (16, 185, 129),   # emerald
    "ciel":         (56, 189, 248),   # cyan
    "fused":        (236, 72, 153),   # rose
}
ASPECT_GLOW = {
    "gran_sabio":   "rgba(180, 168, 255, 0.5)",
    "raphael":      "rgba(232, 79, 140, 0.5)",
    "ciel":         "rgba(229, 192, 100, 0.5)",
    "fused":        "rgba(239, 136, 177, 0.5)",
}
ASPECT_CORE = {
    "gran_sabio":   "#b4a8ff",
    "raphael":      "#e84f8c",
    "ciel":         "#e5c064",
    "fused":        "#ef88b1",
}

# Colores de fase (idle/thinking/responding/listening)
PHASE_COLORS = {
    "idle":        QColor(229, 192, 100),
    "thinking":    QColor(245, 158, 11),
    "responding":  QColor(225, 182, 75),
    "listening":   QColor(204, 196, 255),
}

# Colores ASAGI (Lieselotte Sherlock - Asagi Aiba - Levi Kazama)
ASAGI_BG       = "#060a14"   # fondo oscuro hacker
ASAGI_VIOLET   = "#6b21a8"   # Lieselotte Sherlock (detective, deductiva)
ASAGI_AZUL     = "#2563eb"   # Asagi Aiba (lealtad, compañera cercana)
ASAGI_AMBAR    = "#f59e0b"   # Levi Kazama (energía alegre, juguetona)
ASAGI_PLATA    = "#cbd5e1"   # plata (compañera/devota)
ASAGI_GLOW     = "rgba(56, 189, 248, 0.35)"
ASAGI_PANEL    = "rgba(13, 20, 38, 0.72)"
ASAGI_TEXT     = "#e6f1ff"


def aspect_color(aspect: str = None, phase: str = None, t: float = 0.4) -> QColor:
    """Mezcla color de aspect con color de fase (interpolación t)."""
    a = _ASPECT_ACTIVE if aspect is None else aspect
    r, g, b = ASPECT_RGB.get(a, ASPECT_RGB["ciel"])
    base = QColor(r, g, b)
    if phase and phase in PHASE_COLORS:
        p = PHASE_COLORS[phase]
        return QColor(
            int(r * (1 - t) + p.red() * t),
            int(g * (1 - t) + p.green() * t),
            int(b * (1 - t) + p.blue() * t),
        )
    return base


def set_aspect(aspect: str):
    global _ASPECT_ACTIVE
    if aspect in ASPECT_RGB:
        _ASPECT_ACTIVE = aspect




# ── Phase 5: Epic Orb + Serpantinum x Caelestia Palette ────────────────────────
# (All palette constants defined above — this section documents the epic orb spec)



# ── Logging ──────────────────────────────────────────────────────────

import logging as _logging

_LOG_DIR = ARIA_APP / "logs"
_LOG_DIR.mkdir(exist_ok=True)

logger = _logging.getLogger("ARIA")
logger.setLevel(_logging.INFO)
_handler = _logging.FileHandler(_LOG_DIR / "aria.log", encoding="utf-8")
_handler.setFormatter(_logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(_handler)

try:
    _sh = _logging.StreamHandler()
    _sh.setFormatter(_logging.Formatter("[%(levelname)s] %(message)s"))
    logger.addHandler(_sh)
except Exception:
    pass


# ── Núcleo VA local (100% en proceso, sin HTTP, sin subprocess) ──────────────

sys.path.insert(0, str(ARIA_APP))
# Autonomia desactivada por regla del proyecto: ningun nombre real se importa,
# todos son stubs inofensivos para que el resto del codigo no rompa.
# autonomia desactivada: aria_says.emit (desactivado) - no hay latido
# autonomia desactivada: desktop_autonomy no se importa ni se ejecuta (regla v2)
_start_heartbeat = lambda *a, **k: None
_stop_heartbeat = lambda *a, **k: None
class _NoAutonomia:
    def ingest(self, *a, **k): pass
    def perception(self): return {"perception": {}}
    def status(self): return {}
    def toggle(self, *a, **k): pass
    def beat(self): return {}
_no_autonomia = _NoAutonomia()
_autonomy_runtime = lambda: _no_autonomia
_beat_summary = lambda *a, **k: ""
_episode_line = lambda *a, **k: ""
_goal_line = lambda *a, **k: ""
_last_episode = lambda *a, **k: None
_lesson_line = lambda *a, **k: ""
_autonomy_mode = lambda *a, **k: "off"
_pending_goals = lambda *a, **k: []
_summarize_perception = lambda *a, **k: "Autonomia: desactivada"

from aria_va_core import get_va, VirtualAssistant

class VAAdapter:
    """Adaptador síncrono al núcleo VA local. Reemplaza a IPCClient."""

    def __init__(self) -> None:
        self.brain = None
        self.skills = None
        try:
            from aria_va_core import LocalAIBrain, LocalSkills
            self.brain = LocalAIBrain()
            self.skills = LocalSkills(self.brain)
        except Exception as exc:
            import traceback
            print("[VA] ERROR creando cerebro:", exc, flush=True)
            traceback.print_exc()
        self.va = self  # compat
        self.healthy = self.brain is not None
        self.autonomous = False

    def _asegurar_cerebro(self):
        """Reintenta cargar el cerebro si fallo al arrancar (p.ej. por falta de RAM)."""
        if self.brain is not None:
            return True
        try:
            from aria_va_core import LocalAIBrain, LocalSkills
            self.brain = LocalAIBrain()
            self.skills = LocalSkills(self.brain)
            self.healthy = True
            return True
        except Exception as exc:
            self._ultimo_error = str(exc)
            return False

    def process_text(self, text: str, on_token=None) -> str:
        if not self._asegurar_cerebro():
            return ("No pude cargar mi cerebro local (%s). Suele ser falta de RAM: "
                    "cierra lo que la ocupe o libera el modelo de imagenes "
                    "(gen_local.liberar()) y reintento." % getattr(self, "_ultimo_error", "?"))
        result = self.brain.chat(text, on_token=on_token)
        return result.get("response", "") if isinstance(result, dict) else str(result)

    def get_status(self) -> dict:
        return {"status": "ok", "provider": "local"}

    def speak(self, text: str) -> None:
        pass

    def start_autonomous(self) -> None:
        self.autonomous = True

    def stop_autonomous(self) -> None:
        self.autonomous = False

    def run_training_stage(self, stage: str) -> dict:
        return {"status": "ok", "stage": stage}

    def training_summary(self) -> dict:
        return {"status": "ok"}

    def start_voice_listening(self) -> None:
        pass

    def stop_voice_listening(self) -> None:
        pass

    def send(self, request: dict, on_token=None) -> dict:
        req_type = request.get("type", "")
        if req_type == "chat":
            text = request.get("data", {}).get("message", "")
            response = self.va.process_text(text, on_token=on_token)
            return {"status": "ok", "response": response, "provider": "local", "source": "va"}
        if req_type == "list_skills":
            skills = self.va.skills.list()
            return {"status": "ok", "skills": skills, "count": len(skills)}
        if req_type == "skill":
            skill_id = request.get("skill", "")
            params = request.get("data", {}).get("params", {})
            result = self.va.skills.run(skill_id, params)
            return {"status": "ok", "result": result}
        if req_type == "status":
            return {"status": "ok", **self.va.get_status()}
        if req_type == "ping":
            return {"status": "ok", "type": "pong"}
        if req_type == "voice_speak":
            text = request.get("data", {}).get("text", "")
            self.va.speak(text)
            return {"status": "ok"}
        if req_type == "voice_start":
            self.va.start_voice_listening()
            return {"status": "ok"}
        if req_type == "voice_stop":
            self.va.stop_voice_listening()
            return {"status": "ok"}
        if req_type == "autonomous_toggle":
            params = request.get("data", {})
            enable = bool(params.get("enable", not self.va.autonomous))
            if enable:
                self.va.start_autonomous()
            else:
                self.va.stop_autonomous()
            # El flag solo no basta: el runtime es quien actúa, así que el
            # modo autónomo tiene que mover el runtime y el latido de verdad.
            try:
                _autonomy_runtime().toggle(enable)
            except Exception:  # noqa: BLE001 - el modo autónomo no rompe la app
                pass
            try:
                self.va.skills.run("autonomous_toggle", {"enable": enable})
            except Exception:  # noqa: BLE001
                pass
            return {"status": "ok", "autonomous": self.va.autonomous}
        if req_type == "training_stage":
            stage = request.get("data", {}).get("stage", "etapa1")
            return {"status": "ok", **self.va.run_training_stage(stage)}
        if req_type == "training_summary":
            return {"status": "ok", **self.va.training_summary()}
        if req_type == "training_reset":
            self.va.training_reset()
            return {"status": "ok", "reset": True}
        if req_type == "challenge_suite":
            return {"status": "ok", **self.va.run_challenge_suite()}
        if req_type == "memory_list":
            params = request.get("data", {})
            capa = str(params.get("capa", "") or "")
            limite = int(params.get("limite", 50) or 50)
            return {
                "status": "ok",
                "entries": self.va.memory_list(capa, limite=limite),
                "counts": self.va.memory_conteo(),
                "enabled": self.va.memory_enabled(),
            }
        if req_type == "memory_recall":
            params = request.get("data", {})
            consulta = str(params.get("consulta", "") or "")
            k = int(params.get("k", 30) or 30)
            return {"status": "ok", "hits": self.va.memory_recall(consulta, k=k)}
        if req_type == "memory_borrar":
            params = request.get("data", {})
            capa = str(params.get("capa", "") or "")
            id_ = int(params.get("id", 0) or 0)
            return {"status": "ok", "deleted": self.va.memory_borrar(capa, id_)}
        if req_type == "memory_fijar":
            params = request.get("data", {})
            texto = str(params.get("texto", "") or "")
            return {"status": "ok", "id": self.va.memory_fijar(texto)}
        if req_type == "memory_reflect":
            return {"status": "ok", "promoted": self.va.memory_reflect()}
        if req_type == "memory_export":
            return {"status": "ok", "entries": self.va.memory_export()}
        if req_type == "memory_toggle":
            params = request.get("data", {})
            enable = params.get("enable")
            if enable is None:
                enable = not self.va.memory_enabled()
            activo = self.va.memory_set_enabled(bool(enable))
            return {"status": "ok", "enabled": activo}
        if req_type == "memory_add":
            params = request.get("data", {})
            texto = str(params.get("texto", "") or "")
            capa = str(params.get("capa", "observaciones") or "observaciones")
            fuente = str(params.get("fuente", "usuario") or "usuario")
            confianza = str(params.get("confianza", "usuario") or "usuario")
            return {"status": "ok", "id": self.va.memory_add(texto, capa, fuente, confianza)}
        if req_type == "memory_import":
            params = request.get("data", {})
            ruta = str(params.get("ruta", "") or "")
            return {"status": "ok", **self.va.memory_import(ruta)}
        if req_type == "memory_session_add":
            params = request.get("data", {})
            texto = str(params.get("texto", "") or "")
            capa = str(params.get("capa", "observaciones") or "observaciones")
            return {"status": "ok", "id": self.va.memory_session_add(texto, capa)}
        if req_type == "memory_session_list":
            return {"status": "ok", "entries": self.va.memory_session_list()}
        if req_type == "memory_session_clear":
            return {"status": "ok", "cleared": self.va.memory_session_clear()}
        return {"status": "error", "error": f"tipo desconocido: {req_type}"}

    def stop(self) -> None:
        self.va.stop_voice_listening()


# ── Logging ──────────────────────────────────────────────────────────


# ── Orb Visual Widget ──────────────────────────────────────────────────────

import math as _math

class OrbWidget(QWidget):
    """Epic 9-layer orb: pulse rings, outer halo, orbit ring, evolution rings,
    fractal eye, core glow, solid sphere, burst rays, infon particles.
    Colores mezclan aspect activo + fase actual (idle/thinking/responding/listening)."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedSize(220, 220)
        self._phase = 0.0
        self._state = "idle"
        self._blink_phase = 0.0
        self._particles = []
        self._orbit_particles = []
        self._burst_rays = []
        self._pulse_ring_phase = 0.0
        self._orbit_angle = 0.0
        self._evo_ring_phases = [0.0, 0.0, 0.0, 0.0, 0.0]
        self._color = aspect_color("ciel", "idle")
        self._glow_color = QColor(229, 192, 100, 180)
        self._aspect = "ciel"
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._update_orb)
        self._timer.start(30)
        self._nucleo_v2 = None
        if os.environ.get("ARIA_NUCLEO_V2", "on").lower() not in ("0", "false", "no", "off"):
            try:
                from ui.nucleo_v2 import Nucleo
                self._nucleo_v2 = Nucleo()
                self._nucleo_t = 0.0
            except Exception:
                self._nucleo_v2 = None

    def set_aspect(self, aspect: str):
        self._aspect = aspect
        self._color = aspect_color(aspect, self._state)
        self.update()

    def set_state(self, state: str):
        self._state = state
        self._color = aspect_color(self._aspect, state)
        glows = {
            "idle": QColor(229, 192, 100, 180),
            "thinking": QColor(245, 158, 11, 180),
            "responding": QColor(225, 182, 75, 180),
            "listening": QColor(204, 196, 255, 180),
        }
        base = ASPECT_RGB.get(self._aspect, ASPECT_RGB["ciel"])
        self._glow_color = QColor(base[0], base[1], base[2], 180)
        if not hasattr(self, '_glow_transition'):
            self._glow_transition = 0.0
            self._glow_timer = QTimer(self)
            self._glow_timer.timeout.connect(self._animate_glow)
            self._glow_timer.start(30)
        self._glow_transition = 1.0

    def hideEvent(self, event):
        self._timer.stop()
        super().hideEvent(event)

    def showEvent(self, event):
        if not self._timer.isActive():
            self._timer.start(30)
        super().showEvent(event)

    def _animate_glow(self):
        self._glow_transition = max(0.0, self._glow_transition - 0.05)
        self.update()

    def _update_orb(self):
        if not self.isVisible():
            return
        self._phase += 0.03
        self._blink_phase += 0.05
        self._pulse_ring_phase = (self._pulse_ring_phase + 0.02) % 1.0
        self._orbit_angle = (self._orbit_angle + 0.04) % 6.283
        for i in range(len(self._evo_ring_phases)):
            self._evo_ring_phases[i] = (self._evo_ring_phases[i] + 0.015 * (i + 1)) % 6.283
        import random as _rnd
        if self._state in ("responding", "listening") and len(self._orbit_particles) < 14:
            self._orbit_particles.append({
                "angle": _rnd.uniform(0, 6.283), "r": 38,
                "life": 1.0, "speed": _rnd.uniform(0.015, 0.035)
            })
        if self._state in ("responding", "thinking") and len(self._burst_rays) < 18:
            for _ in range(3):
                self._burst_rays.append({
                    "angle": _rnd.uniform(0, 6.283),
                    "length": _rnd.uniform(12, 34),
                    "life": 1.0
                })
        for p in self._orbit_particles[:]:
            p["angle"] += p["speed"]
            p["life"] -= 0.005
            if p["life"] <= 0:
                self._orbit_particles.remove(p)
        for b in self._burst_rays[:]:
            b["life"] -= 0.03
            b["length"] += 2
            if b["life"] <= 0:
                self._burst_rays.remove(b)
        if self._state in ("responding", "listening") and len(self._particles) < 24:
            self._particles.append({
                "x": _rnd.uniform(0, 220), "y": _rnd.uniform(0, 220),
                "life": 1.0, "speed": _rnd.uniform(0.25, 0.65)
            })
        for p in self._particles[:]:
            p["life"] -= p["speed"] * 0.02
            p["y"] -= p["speed"]
            if p["life"] <= 0:
                self._particles.remove(p)
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        painter.setRenderHint(QPainter.SmoothPixmapTransform)
        w, h = self.width(), self.height()
        cx, cy = w // 2, h // 2
        base_r = min(w, h) * 0.26
        if self._nucleo_v2 is not None:
            self._nucleo_t += 0.03
            estado = {"idle": "reposo", "listening": "escuchando", "thinking": "pensando",
                      "responding": "hablando"}.get(self._state, "reposo")
            from PyQt5.QtCore import QRectF
            _t0 = time.perf_counter()
            self._nucleo_v2.paint(painter, QRectF(0, 0, w, h), self._nucleo_t, estado,
                                  nivel=0.5 if self._state in ("responding", "listening") else 0.0,
                                  calidad=None, hud=False, escala=0.34)
            self._nucleo_v2.calidad_auto((time.perf_counter() - _t0) * 1000.0)
            painter.end()
            return

        if self._state == "listening":
            breath = 1.0 + 0.16 * ((1 + _math.sin(self._phase * 2)) / 2)
        elif self._state == "responding":
            breath = 1.0 + 0.13 * ((1 + _math.sin(self._phase * 3)) / 2)
        elif self._state == "thinking":
            breath = 1.0 + 0.09 * ((1 + _math.sin(self._phase * 1.5)) / 2)
        else:
            breath = 1.0 + 0.11 * ((1 + _math.sin(self._phase)) / 2)

        r = int(base_r * breath)
        painter.setPen(Qt.NoPen)
        col = self._color

        # ── Layer 9: Outer Halo (respiración 12s, blur visual grande) ──
        halo_r = r + 62
        halo_alpha = int(30 + 25 * ((1 + _math.sin(self._phase * 0.5)) / 2))
        painter.setBrush(QBrush(QColor(col.red(), col.green(), col.blue(), halo_alpha)))
        painter.drawEllipse(cx - halo_r, cy - halo_r, halo_r*2, halo_r*2)

        # ── Layer 8: Pulse Rings (expansión outward, 2 capas) ──
        for i, pr in enumerate([self._pulse_ring_phase, (self._pulse_ring_phase + 0.5) % 1.0]):
            pulse_r = int(r + 55 * pr)
            pulse_alpha = max(0, int(45 * (1.0 - pr)))
            painter.setBrush(QBrush(QColor(col.red(), col.green(), col.blue(), pulse_alpha)))
            painter.drawEllipse(cx - pulse_r, cy - pulse_r, pulse_r*2, pulse_r*2)

        # ── Layer 7: Evolution Rings (5 anillos concéntricos rotativos) ──
        for i in range(5):
            er = int(r + 14 + i * 10)
            ea = int(60 + 20 * _math.sin(self._evo_ring_phases[i]))
            painter.setPen(QPen(QColor(col.red(), col.green(), col.blue(), ea), 1))
            painter.setBrush(Qt.NoBrush)
            painter.save()
            painter.translate(cx, cy)
            painter.rotate(self._evo_ring_phases[i] * 57.3)
            painter.drawEllipse(-er, -er, er*2, er*2)
            painter.restore()

        # ── Layer 6: Orbit Ring (rotando) ──
        painter.setPen(QPen(QColor(col.red(), col.green(), col.blue(), 150), 2))
        painter.setBrush(Qt.NoBrush)
        painter.save()
        painter.translate(cx, cy)
        painter.rotate(self._orbit_angle * 57.3)
        painter.drawEllipse(-38, -38, 76, 76)
        painter.restore()

        # ── Layer 5: Orbit Particles ──
        for p in self._orbit_particles:
            px = cx + 38 * _math.cos(p["angle"])
            py = cy + 38 * _math.sin(p["angle"])
            p_alpha = max(0, int(220 * p["life"]))
            painter.setBrush(QBrush(QColor(225, 182, 75, p_alpha)))
            painter.setPen(Qt.NoPen)
            painter.drawEllipse(int(px) - 2, int(py) - 2, 4, 4)

        # ── Layer 4: Core Glow (respiración 1.5s) ──
        glow_r = r + 14
        core_alpha = int(110 + 45 * ((1 + _math.sin(self._phase * 4)) / 2))
        painter.setBrush(QBrush(QColor(col.red(), col.green(), col.blue(), core_alpha)))
        painter.drawEllipse(cx - glow_r, cy - glow_r, glow_r*2, glow_r*2)

        # ── Layer 3: Solid Sphere (gradiente radial, aspect-core) ──
        gradient = QRadialGradient(cx, cy, 0, cx, cy, r)
        gradient.setColorAt(0, QColor(255, 255, 255, 230))
        gradient.setColorAt(0.35, QColor(col.red(), col.green(), col.blue(), 255))
        gradient.setColorAt(0.7, col)
        gradient.setColorAt(1, QColor(max(0, col.red()-40), max(0, col.green()-40), max(0, col.blue()-40)))
        painter.setBrush(QBrush(gradient))
        painter.drawEllipse(cx - r, cy - r, r*2, r*2)

        # ── Layer 2: Burst Rays (interacción) ──
        for b in self._burst_rays:
            bx = int(cx + _math.cos(b["angle"]) * r)
            by = int(cy + _math.sin(b["angle"]) * r)
            ex = int(cx + _math.cos(b["angle"]) * (r + b["length"]))
            ey = int(cy + _math.sin(b["angle"]) * (r + b["length"]))
            b_alpha = max(0, int(200 * b["life"]))
            painter.setPen(QPen(QColor(225, 182, 75, b_alpha), 2))
            painter.setBrush(Qt.NoBrush)
            painter.drawLine(bx, by, ex, ey)

        painter.setOpacity(1.0)

        # ── Layer 1: Fractal Eye (parpadeo en listening) ──
        if self._state == "listening":
            blink = _math.sin(self._blink_phase)
            eye_h = max(1, int(r * 0.20 * (1 - abs(blink))))
            eye_y = cy - r//4
            painter.setBrush(QBrush(QColor(9, 10, 18, 230)))
            painter.drawRoundedRect(cx - r//3, eye_y - eye_h//2, r//3*2, eye_h, r//6, r//6)
            painter.setBrush(QBrush(QColor(255, 255, 255, 210)))
            painter.drawEllipse(cx - r//6, eye_y - 2, 4, 4)
            painter.drawEllipse(cx + r//6 - 4, eye_y - 2, 4, 4)

        # Infon particles con fade
        for p in self._particles:
            painter.setOpacity(max(0, p["life"]))
            painter.setBrush(QBrush(col))
            painter.drawEllipse(int(p["x"]), int(p["y"]), 3, 3)
        painter.setOpacity(1.0)

        # Inner highlight sutil
        painter.setBrush(QBrush(QColor(255, 255, 255, 45)))
        painter.drawEllipse(cx - r//3, cy - r//3 - r//4, r//2, r//3)

        painter.end()


# ── La franja de autonomía ───────────────────────────────────────────────────

class AutonomyStrip(QWidget):
    """Lo que ARIA está perceiving ahora mismo.

    La autonomía vive en el propio escritorio: esta franja lee el runtime
    local y no consulta a nadie. Muestra dónde está, qué tiene entre manos
    y deja darle un empujón.

    Si el runtime no tiene manos todavía, lo dice. Un "todo tranquilo"
    inventado sería peor que un silencio honesto.
    """

    #: La lectura llega del hilo de sondeo: Qt no permite tocar los widgets
    #: desde fuera del hilo de la interfaz, así que el hilo emite y el
    #: widget se pinta en la señal (que se entrega en el hilo de la GUI).
    snapshot_ready = pyqtSignal(str, str, bool, str, str)
    #: Avisa de que el boton ⚡ vuelve a estar disponible.
    wake_done = pyqtSignal()
    #: Lo que ha pasado al darle al boton ⚡ (se enseña en la OSD).
    beat_report = pyqtSignal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(92)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(10, 6, 10, 6)
        layout.setSpacing(2)

        self.perception_label = QLabel("Autonomia: desactivada")
        self.perception_label.setStyleSheet(
            f"color: {C_TEXT_DIM}; font-size: 10px; font-family: 'Consolas', monospace;"
        )
        layout.addWidget(self.perception_label)

        row = QHBoxLayout()
        row.setContentsMargins(0, 0, 0, 0)
        row.setSpacing(8)

        self.goal_label = QLabel("")
        self.goal_label.setStyleSheet(
            f"color: {C_TEXT_TERTIARY}; font-size: 10px; font-family: 'Consolas', monospace;"
        )
        row.addWidget(self.goal_label, 1)

        self.wake_btn = QPushButton("⚡")
        self.wake_btn.setFixedSize(28, 22)
        self.wake_btn.setToolTip("Espabilarla (una vuelta del runtime)")
        self.wake_btn.setStyleSheet(
            f"QPushButton {{ background: rgba(19, 21, 38, 0.6); color: {C_ACCENT_CYAN_BRIGHT};"
            f" border: 1px solid {C_GLASS_BORDER}; border-radius: 6px; font-size: 11px;"
            f"  }}"
            f"QPushButton:hover {{ background: rgba(229, 192, 100, 0.25);"
            f" border-color: {C_ACCENT_CYAN_BRIGHT}; }}"
        )
        self.wake_btn.clicked.connect(self._wake)
        row.addWidget(self.wake_btn)

        layout.addLayout(row)

        self.last_label = QLabel("")
        self.last_label.setStyleSheet(
            f"color: {C_TEXT_DIM}; font-size: 10px; font-family: 'Consolas', monospace;"
        )
        layout.addWidget(self.last_label)

        self.learn_label = QLabel("")
        self.learn_label.setStyleSheet(
            f"color: {C_ACCENT_PURPLE}; font-size: 10px; font-family: 'Consolas', monospace;"
        )
        layout.addWidget(self.learn_label)

        self.snapshot_ready.connect(self._apply)
        self.wake_done.connect(self._wake_ready)
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._poll, daemon=True)

    def _wake_ready(self):
        """El boton ⚡ vuelve a estar disponible (se ejecuta en la GUI)."""
        self.wake_btn.setEnabled(True)

    def _apply(self, line: str, goal: str, online: bool, last: str = "", learn: str = ""):
        """Pinta lo que el hilo ha leído (se ejecuta en el hilo de la GUI)."""
        if not online:
            self.perception_label.setText("ARIA todavía no tiene manos (sin skills)")
            self.perception_label.setStyleSheet(
                f"color: {C_ORB_ERROR}; font-size: 10px; font-family: 'Consolas', monospace;"
            )
            self.goal_label.setText("")
            self.last_label.setText("")
            self.learn_label.setText("")
            return

        self.perception_label.setText(line)
        self.perception_label.setStyleSheet(
            f"color: {C_ACCENT_CYAN_BRIGHT}; font-size: 10px; font-family: 'Consolas', monospace;"
        )
        self.goal_label.setText(goal)
        self.last_label.setText(f"Último: {last}" if last else "")
        self.learn_label.setText(learn)

    def _wake(self):
        """Desactivado: la autonomia esta off por regla del proyecto."""
        return

    def _beat(self):
        """Desactivado: la autonomia esta off por regla del proyecto."""
        return

    def _read(self):
        """Desactivado: la autonomia esta off por regla del proyecto."""
        return

    def _poll(self):
        while not self._stop.is_set():
            try:
                self._read()
            except Exception:  # noqa: BLE001 - la franja nunca debe tumbar la app
                pass
            self._stop.wait(10.0)

    def stop(self):
        self._stop.set()


# ── Chat Window ─────────────────────────────────────────────────────────────

class ChatWindow(QMainWindow):
    response_received = pyqtSignal(dict)
    #: Lo que ARIA dice por su cuenta (lo decide el latido, no el chat).
    aria_says = pyqtSignal(str)

    def __init__(self, va: VAAdapter):
        super().__init__()
        self.va = va
        self._setup_ui()
        self._setup_keyboard_shortcuts()
        self._load_settings()
        self._performance_monitor()
        try:
            from chibi import crear_chibi
            self._chibi = crear_chibi(); self._chibi.start()
            self._chibi.ctrl.pedir_abrir.connect(self.showNormal)
        except Exception:
            self._chibi = None

    def _append_osd(self, message: str):
        if hasattr(self, '_osd') and self._osd:
            self._osd.notify(message)

    def _setup_ui(self):
        self.setWindowTitle("ARIA OS v4.0")
        self.setFixedSize(620, 720)
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus)
        self._old_pos = None
        self._dragging = False
        # Position centered on primary screen
        from PyQt5.QtWidgets import QApplication
        screen = QApplication.primaryScreen().availableGeometry()
        self.move(screen.width() // 2 - 310, 100)

        central = QWidget()
        central.setStyleSheet(f"""
            QWidget {{ background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 {C_BG_DARK_0}, stop:0.5 {C_BG_DARK_1}, stop:1 #090a12); }}
            QPushButton {{
                background: {C_GLASS_T3_BG};
                color: {C_TEXT_PRIMARY}; border: 1px solid {C_GLASS_T3_BORDER}; border-radius: 8px;
                padding: 8px 16px; font-weight: bold; font-size: 12px;
                
                
            }}
            QPushButton:hover {{
                border-color: {C_ACCENT_CYAN_BRIGHT};
                
                background: {C_GLASS_T2_BG};
                
            }}
            QPushButton:pressed {{
                
            }}
            QLineEdit {{
                background: {C_GLASS_T2_BG}; color: {C_TEXT_SECONDARY};
                border: 1px solid {C_GLASS_T2_BORDER}; border-radius: 8px;
                padding: 10px; font-size: 13px; font-family: 'Consolas', monospace;
                
                
            }}
            QLineEdit:focus {{
                border-color: {C_ACCENT_CYAN_BRIGHT};
                
                background: {C_GLASS_T1_BG};
            }}
            QTextEdit {{
                background: {C_GLASS_T1_BG};
                color: {C_TEXT_SECONDARY};
                border: 1px solid {C_GLASS_T1_BORDER};
                border-radius: 12px;
                padding: 12px;
                font-size: 12px;
                font-family: 'Consolas', monospace;
                
                
            }}
            QTextEdit:focus {{
                border-color: {C_ACCENT_CYAN_BRIGHT};
                
            }}
            QLabel {{ font-family: 'Segoe UI'; color: {C_TEXT_SECONDARY}; }}
        """)
        # Glassmorphism: apply blur only to the skills sidebar background panel
        # (not the central widget — that would blur all text too)
        self.setCentralWidget(central)

        layout = QVBoxLayout(central)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(10)

        # Header bar (Serpantinum style)
        header = QHBoxLayout()
        header.setContentsMargins(0, 0, 0, 0)
        # Logo glyph
        logo = QLabel("◆")
        logo.setStyleSheet(f"color: {C_ACCENT_CYAN_BRIGHT}; font-size: 20px; font-weight: bold; text-shadow: 0 0 8px rgba(225, 182, 75,0.6);")
        header.addSpacing(4)
        header.addWidget(logo)
        title = QLabel("ARIA OS v4.0")
        title.setStyleSheet(f"color: {C_TEXT_PRIMARY}; font-size: 14px; font-weight: bold; font-family: 'Segoe UI'; letter-spacing: 1px;")
        header.addSpacing(4)
        header.addWidget(title)
        # Status indicator
        self.status_dot = QLabel("●")
        self.status_dot.setStyleSheet(f"color: {C_SUCCESS}; font-size: 10px;")
        header.addWidget(self.status_dot)
        self.status_label = QLabel("Listo")
        self.status_label.setStyleSheet(f"color: {C_TEXT_SECONDARY}; font-size: 11px; font-family: 'Segoe UI';")
        header.addWidget(self.status_label)
        header.addStretch()
        # Theme selector button (Serpantinum style)
        self.theme_btn = QPushButton("🎨")
        self.theme_btn.setFixedSize(28, 28)
        self.theme_btn.setToolTip("Cambiar tema (Ctrl+T)")
        self.theme_btn.setStyleSheet(f"""
            QPushButton {{
                background: rgba(19, 21, 38, 0.6);
                color: {C_ACCENT_PURPLE};
                border: 1px solid rgba(190, 179, 255, 0.3);
                border-radius: 8px;
                font-size: 14px;
                
            }}
            QPushButton:hover {{
                background: rgba(190, 179, 255, 0.2);
                border-color: {C_ACCENT_PURPLE};
                
                
            }}
            QPushButton:active {{
                
                background: rgba(190, 179, 255, 0.3);
            }}
        """)
        self.theme_btn.clicked.connect(self._open_theme_picker)
        header.addWidget(self.theme_btn)
        # Control center button (Caelestia style)
        self.control_btn = QPushButton("⚙")
        self.control_btn.setFixedSize(28, 28)
        self.control_btn.setToolTip("Control Center (Ctrl+,)")
        self.control_btn.setStyleSheet(f"""
            QPushButton {{
                background: rgba(19, 21, 38, 0.6);
                color: {C_ACCENT_CYAN_BRIGHT};
                border: 1px solid rgba(225, 182, 75, 0.3);
                border-radius: 8px;
                font-size: 14px;
                
            }}
            QPushButton:hover {{
                background: rgba(225, 182, 75, 0.2);
                border-color: {C_ACCENT_CYAN_BRIGHT};
                
                
            }}
            QPushButton:active {{
                
                background: rgba(225, 182, 75, 0.3);
            }}
        """)
        self.control_btn.clicked.connect(self._open_control_center)
        header.addWidget(self.control_btn)
        # Botón Núcleo/Evolución
        self.nucleus_btn = QPushButton("☉ Núcleo")
        self.nucleus_btn.setFixedSize(34, 34)
        self.nucleus_btn.setToolTip("Abrir panel de evolución y sacrifice (Ctrl+N)")
        self.nucleus_btn.setStyleSheet(f"""
            QPushButton {{
                background: {C_GLASS_T3_BG};
                color: {C_ACCENT_CYAN_BRIGHT};
                border: 1px solid {C_GLASS_T3_BORDER};
                border-radius: 10px;
                font-size: 13px;
                font-weight: bold;
                
            }}
            QPushButton:hover {{
                background: {C_ACCENT_CYAN_BRIGHT}20;
                border-color: {C_ACCENT_CYAN_BRIGHT};
                
            }}
            QPushButton:pressed {{  }}
        """)
        self.nucleus_btn.clicked.connect(self._open_nucleus)
        header.addWidget(self.nucleus_btn)
        # Botón Memoria (5 capas: ver, buscar, fijar, borrar, exportar)
        self.memory_btn = QPushButton("🧠")
        self.memory_btn.setFixedSize(34, 34)
        self.memory_btn.setToolTip("Memoria de ARIA (Ctrl+M)")
        self.memory_btn.setStyleSheet(f"""
            QPushButton {{
                background: {C_GLASS_T3_BG};
                color: {C_ACCENT_PURPLE};
                border: 1px solid {C_GLASS_T3_BORDER};
                border-radius: 10px;
                font-size: 14px;
                
            }}
            QPushButton:hover {{
                background: {C_ACCENT_PURPLE}20;
                border-color: {C_ACCENT_PURPLE};
                
            }}
            QPushButton:pressed {{  }}
        """)
        self.memory_btn.clicked.connect(self._open_memory)
        header.addWidget(self.memory_btn)
        min_btn = QPushButton("_")
        min_btn.setFixedSize(26, 26)
        min_btn.setStyleSheet(f"background: rgba(19, 21, 38, 0.6); color: {C_TEXT_TERTIARY}; font-size: 14px; font-weight: bold; border-radius: 6px; border: 1px solid {C_GLASS_BORDER}; ")
        min_btn.clicked.connect(self.showMinimized)
        header.addWidget(min_btn)
        close_btn = QPushButton("✕")
        close_btn.setFixedSize(26, 26)
        close_btn.setStyleSheet(f"background: rgba(19, 21, 38, 0.6); color: {C_TEXT_TERTIARY}; font-size: 14px; border-radius: 6px; border: 1px solid {C_GLASS_BORDER}; ")
        close_btn.clicked.connect(self.close)
        header.addWidget(close_btn)
        help_btn = QPushButton("?")
        help_btn.setFixedSize(26, 26)
        help_btn.setToolTip("Atajos de teclado (F1)")
        help_btn.setStyleSheet(f"background: rgba(19, 21, 38, 0.6); color: {C_TEXT_TERTIARY}; font-size: 14px; border-radius: 6px; border: 1px solid {C_GLASS_BORDER}; ")
        help_btn.clicked.connect(self._show_shortcuts)
        header.addWidget(help_btn)
        layout.addLayout(header)

        # Orb
        self.orb = OrbWidget()
        layout.addSpacing(4)
        layout.addWidget(self.orb, alignment=Qt.AlignCenter)

        # Status label
        self.status_label = QLabel("● Inactivo")
        self.status_label.setStyleSheet(f"color: {C_TEXT_DIM}; font-size: 11px; text-align: center; font-family: 'Segoe UI';")
        layout.addWidget(self.status_label)

        # La franja de autonomía: lo que ARIA está perceiving ahora mismo.
        # La autonomía vive en este proceso: la franja lee el runtime local.
        self.autonomy_strip = AutonomyStrip()
        layout.addWidget(self.autonomy_strip)
        # Lo que ARIA hace al darle al ⚡ sale también en la OSD: si el
        # usuario le espabila, tiene que ver qué ha pasado.
        self.autonomy_strip.beat_report.connect(self._append_osd)

        layout.addSpacing(8)

        # Chat history with smooth scroll + border glow
        self.chat_history = QTextEdit()
        self.chat_history.setReadOnly(True)
        self.chat_history.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.chat_history.setMaximumHeight(330)
        self.chat_history.setPlaceholderText("Escribe tu mensaje a ARIA...")
        self.chat_history.verticalScrollBar().setSingleStep(16)
        self.chat_history.verticalScrollBar().setPageStep(80)
        self._last_response_text = ""
        layout.addWidget(self.chat_history)

        # Acciones sobre la ultima respuesta de ARIA. Son botones de verdad,
        # no enlaces dentro del HTML: esto es una ventana de escritorio y
        # aqui no se abre ningun navegador.
        action_row = QHBoxLayout()
        action_row.setContentsMargins(0, 0, 0, 0)
        action_row.setSpacing(6)
        self._last_response_text = ""
        self.act_copy = self._make_action_btn("Copiar", self._act_copy)
        self.act_save = self._make_action_btn("Guardar", self._act_save)
        self.act_refine = self._make_action_btn("Refine", self._act_refine)
        for btn in (self.act_copy, self.act_save, self.act_refine):
            btn.setEnabled(False)
            action_row.addWidget(btn)
        action_row.addStretch(1)
        layout.addLayout(action_row)

        # Input row (Serpantinum style)
        input_row = QHBoxLayout()
        input_row.setContentsMargins(0, 0, 0, 0)
        self.msg_input = QLineEdit()
        self.msg_input.setPlaceholderText("Escribe y pulsa Enter...")
        self.msg_input.setFixedHeight(40)
        self.msg_input.returnPressed.connect(self._send_message)
        input_row.addWidget(self.msg_input)
        send_btn = QPushButton("▲ Enviar")
        send_btn.setFixedWidth(90)
        send_btn.setFixedHeight(40)
        send_btn.setStyleSheet(f"""
            QPushButton {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 {C_ACCENT_CYAN_BRIGHT}, stop:1 {C_ACCENT_PURPLE});
                color: #131526; border: none; border-radius: 8px;
                font-weight: bold; font-size: 12px; font-family: 'Consolas', monospace;
                
                
            }}
            QPushButton:hover {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #ebd089, stop:1 #b1a4ff);
                
                
            }}
            QPushButton:active {{
                
                
            }}
        """)
        send_btn.clicked.connect(self._send_message)
        input_row.addWidget(send_btn)
        # Quick action buttons (Fase 4: micro-details)
        clear_btn = QPushButton("✕ Limpiar")
        clear_btn.setFixedWidth(70)
        clear_btn.setFixedHeight(36)
        clear_btn.setStyleSheet(f"QPushButton {{ background: rgba(19, 21, 38, 0.6); color: {C_TEXT_TERTIARY}; border: 1px solid {C_GLASS_BORDER}; border-radius: 6px; font-size: 10px; font-family: Consolas, monospace;  }} QPushButton:hover {{ background: rgba(239, 135, 177, 0.3); color: #f7c2d7; border-color: #ef87b1; }}")
        clear_btn.clicked.connect(self._clear_chat)
        input_row.addWidget(clear_btn)
        export_btn = QPushButton("↓ Exportar")
        export_btn.setFixedWidth(70)
        export_btn.setFixedHeight(36)
        export_btn.setStyleSheet(f"QPushButton {{ background: rgba(19, 21, 38, 0.6); color: {C_TEXT_TERTIARY}; border: 1px solid {C_GLASS_BORDER}; border-radius: 6px; font-size: 10px; font-family: Consolas, monospace;  }} QPushButton:hover {{ background: rgba(229, 192, 100, 0.3); color: {C_ACCENT_CYAN_BRIGHT}; border-color: {C_ACCENT_CYAN_BRIGHT}; }}")
        export_btn.clicked.connect(self._export_chat)
        input_row.addWidget(export_btn)
        layout.addLayout(input_row)

        # Skills dock sidebar (left side, scrollable)
        self.skills_sidebar = self._build_skills_sidebar()
        layout.addWidget(self.skills_sidebar)

    def _build_skills_sidebar(self):
        """Dock-style skills sidebar with glassmorphism, hover glow, click animation."""
        container = QWidget()
        container.setFixedWidth(150)
        container.setStyleSheet(f"""
            QWidget {{ background: {C_GLASS_T1_BG}; border-right: 1px solid {C_GLASS_T1_BORDER}; }}
        """)
        v = QVBoxLayout(container)
        v.setContentsMargins(10, 10, 10, 10)
        v.setSpacing(6)

        lbl = QLabel("◇ Skills")
        lbl.setStyleSheet(f"color: {C_ACCENT_CYAN_BRIGHT}; font-size: 12px; font-weight: bold; font-family: 'Segoe UI'; letter-spacing: 1px; padding-bottom: 4px; border-bottom: 1px solid rgba(229, 192, 100, 0.1);")
        v.addWidget(lbl)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet(f"QScrollArea {{ background: transparent; }} QScrollBar::vertical {{ width: 6px; background: transparent; }} QScrollBar::handle {{ background: {C_ACCENT_CYAN_BRIGHT}; border-radius: 3px; }}")

        self.skills_grid = QWidget()
        self.skills_grid_layout = QVBoxLayout(self.skills_grid)
        self.skills_grid_layout.setSpacing(4)
        scroll.setWidget(self.skills_grid)
        v.addWidget(scroll)
        return container

    def _add_skill_btn(self, name: str, category: str):
        """Add a glassmorphism skill button with hover glow + click animation."""
        btn = QPushButton(f"◆ {name}")
        btn.setFixedHeight(30)
        btn.setCheckable(True)
        btn.setStyleSheet(f"""
            QPushButton {{
                background: {C_GLASS_T2_BG};
                color: {C_TEXT_TERTIARY};
                border: 1px solid {C_GLASS_T2_BORDER};
                border-radius: 10px;
                padding: 4px 10px;
                font-size: 11px;
                font-family: 'Consolas', monospace;
                text-align: left;
                
            }}
            QPushButton:hover {{
                background: {C_GLASS_T3_BG};
                color: {C_TEXT_PRIMARY};
                border-color: {C_ACCENT_PURPLE};
                
                
            }}
            QPushButton:active {{
                
            }}
            QPushButton:checked {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 rgba(229, 192, 100, 0.45), stop:1 rgba(190, 179, 255, 0.35));
                color: {C_TEXT_PRIMARY};
                border-color: {C_ACCENT_CYAN_BRIGHT};
                
            }}
        """)
        btn.clicked.connect(lambda: self._on_skill_click(btn, name, category))
        self.skills_grid_layout.addWidget(btn)
        return btn

    def _on_skill_click(self, btn: QPushButton, name: str, category: str):
        """Click animation: icon pulse + color change."""
        btn.setChecked(True)
        # Visual feedback: flash effect via stylesheet override
        btn.setStyleSheet(f"""
            QPushButton {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 {C_SUCCESS}, stop:1 {C_ACCENT});
                color: white;
                border: 1px solid {C_ACCENT};
                border-radius: 14px;
                padding: 4px 10px;
                font-size: 10px;
                font-family: 'Consolas', monospace;
            }}
        """)
        # Reset after 500ms
        QTimer.singleShot(500, lambda: btn.setStyleSheet(f"""
            QPushButton {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 {C_ACCENT}, stop:1 {C_SECONDARY});
                color: white;
                border-color: {C_SECONDARY};
                border-radius: 14px;
                padding: 4px 10px;
                font-size: 10px;
                font-family: 'Consolas', monospace;
            }}
            QPushButton:!checked {{
                background: rgba(29, 33, 60, 0.8);
                color: {C_TEXT_DIM};
                border: 1px solid {C_BORDER};
            }}
        """))

    def _send_message(self):
        text = self.msg_input.text().strip()
        if not text:
            return
        self._ultimo_texto_usuario = text
        low = text.lower().strip()
        if low.startswith("calidad "):
            try:
                import conversation_quality as cq
                r = cq.evaluar(low.split(" ",1)[1])
                self._append_chat("ARIA", "Calidad: %s" % r, C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low == "engagement":
            try:
                import engagement_loop as el
                r = el.ciclo(getattr(self, "_ultimo_ts", None), getattr(self, "_temas_pendientes", []), getattr(self, "_lecciones_actuales", None))
                self._append_chat("ARIA", r, C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low.startswith("compone "):
            try:
                import response_composer as rc
                r = rc.componer(low.split(" ",1)[1], getattr(self, "_social_actual", {}).get("emotion", "neutral"),
                                getattr(self, "_lecciones_actuales", []), getattr(self, "_tono_actual", "amable"))
                self._append_chat("ARIA", r, C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low.startswith("emocion "):
            try:
                import emotion_engine as ee
                e = ee.detectar(low.split(" ",1)[1])
                self._append_chat("ARIA", "Emocion: %s -> %s" % (e, ee.estrategia(e)), C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low.startswith("intencion "):
            try:
                import intent_router as ir
                r = ir.detectar(low.split(" ",1)[1])
                self._append_chat("ARIA", "Intencion: %s" % r, C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low.startswith("estilo "):
            try:
                import language_style as ls
                modo = low.split(" ",1)[1].strip()
                self._append_chat("ARIA", "Estilo %s: %s" % (modo, ls.guia(modo)), C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low == "continuar":
            try:
                import conversation_continuity as cc
                d = cc.cargar()
                self._append_chat("ARIA", "Continuidad: %s" % (d or "sin datos"), C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low == "nudge":
            try:
                import proactive_nudges as pn
                r = pn.nudge_si_aplica(getattr(self, "_ultimo_ts", None), getattr(self, "_temas_pendientes", []))
                self._append_chat("ARIA", r or "Sin nudge por ahora.", C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low.startswith("trigger "):
            try:
                import memory_triggers as mt
                r = mt.trigger_para(low.split(" ",1)[1])
                self._append_chat("ARIA", "Trigger: %s" % r, C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low.startswith("tono "):
            try:
                import personalization_engine as pe
                tono = low.split(" ",1)[1].strip()
                self._tono_actual = tono
                self._append_chat("ARIA", "Tono activo: %s" % tono, C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low in ("reflexiona", "memoria reflectiva"):
            try:
                import reflective_memory as rm
                p = rm.prospectiva(getattr(self, "_ultimo_texto_usuario", ""))
                r = rm.retrospectiva(getattr(self, "_ultimo_texto_usuario", ""), "ok")
                self._append_chat("ARIA", "Prospectiva: %s | Retrospectiva: %s" % (p, r), C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low in ("piensa", "inner thoughts"):
            try:
                import inner_thoughts as it
                ts = it.pensar(getattr(self, "_ultimo_texto_usuario", ""), getattr(self, "_lecciones_actuales", None))
                self._append_chat("ARIA", "Pensamientos: %s" % " | ".join(ts), C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low in ("inicia conversacion", "inicia conversación"):
            try:
                import conversation_starters as cs
                self._append_chat("ARIA", cs.elegir_starter("Daniel"), C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low in ("mi grafo", "mi grafo."):
            try:
                import conocimiento
                st = conocimiento.grafo().stats()
                self._append_chat("ARIA", "Grafo: %s" % st, C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "Grafo no disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return
        if low in ("mis lecciones", "mis lecciones."):
            try:
                import experiencia
                r = experiencia.resumen()
                self._append_chat("ARIA", "Lecciones: %s" % r, C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "Lecciones no disponibles: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low in ("cita simulada", "simulacion de cita", "simulación de cita"):
            try:
                import social_rolemodels as sr
                r = sr.simulacion_citas(text)
                self._append_chat("ARIA", "%s\n%s" % (r["guia"], r["respuesta"]), C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "Simulacion no disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low in ("lecciones sociales", "principios sociales"):
            try:
                import social_rolemodels as sr
                self._append_chat("ARIA", "Principios: %s" % sr.principios()[:5], C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "No disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low == "practica social":
            try:
                import social_sandbox
                def _resp(t):
                    r = self.va.send({"type": "chat", "id": str(int(time.time()*1000)),
                                     "data": {"message": t}})
                    return (r or {}).get("response", "")
                r = social_sandbox.practicar(_resp, n=6)
                self._append_chat("ARIA", "Practica social: %s" % r, C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "Practica social no disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low == "ver grafo":
            try:
                import conocimiento
                dot = conocimiento.grafo().exportar_dot()
                self._append_chat("ARIA", "DOT:\n%s" % dot[:1500], C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "Grafo no disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low == "propón mejora" or low == "propone mejora":
            try:
                import mejora
                r = mejora.proponer("nota", getattr(self, "_ultimo_texto_usuario", text),
                                    descripcion="propuesta manual")
                self._append_chat("ARIA", "Propuesta: %s" % r, C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "Mejora no disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        if low == "mejoras pendientes":
            try:
                import mejora
                r = mejora.listar("pendiente")
                self._append_chat("ARIA", "Pendientes: %s" % r, C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "Mejoras no disponibles: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return

        m = low.split()
        if len(m) >= 3 and m[0] == "prueba" and m[1] == "mejora":
            try:
                import mejora
                r = mejora.probar(m[2])
                self._append_chat("ARIA", "Prueba %s: %s" % (m[2], r), C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "Prueba no disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return
        if len(m) >= 3 and m[0] == "aprueba" and m[1] == "mejora":
            try:
                import mejora
                r = mejora.aprobar(m[2])
                self._append_chat("ARIA", "Aprobacion %s: %s" % (m[2], r), C_ACCENT_CYAN_BRIGHT)
            except Exception as exc:
                self._append_chat("ARIA", "Aprobacion no disponible: %s" % exc, C_ACCENT_CYAN_BRIGHT)
            return
        # capa social: analizar emocion y patrones antes de responder
        try:
            import social_skills, social_sandbox
            sa = social_skills.social_analysis(text)
            self._social_actual = sa
            self._patrones_sociales = social_sandbox.recordar_patron(text)
            self._consejo_social = social_sandbox.consejo_para(sa.get("emotion", "neutral"))
        except Exception:
            self._social_actual = {}
            self._patrones_sociales = []
            self._consejo_social = {}

        # antes de una tarea compleja, recuperar lecciones relevantes
        try:
            import experiencia
            self._lecciones_actuales = experiencia.relevantes(text)
        except Exception:
            self._lecciones_actuales = []
        self.msg_input.clear()
        self._append_chat("Tú", text, "#e5c064")
        self.orb.set_state("thinking")
        self.status_label.setText("● Pensando...")
        self.status_label.setStyleSheet("color: #f59e0b; font-size: 11px;")
        # ARIA se entera de lo que se le dice aunque la conteste este
        # escritorio: su runtime guarda el historial y decide despues. La
        # marca `answered` evita que conteste otra vez lo ya contestado.
        # (desactivado por regla del proyecto: la autonomia no corre)
        pass

        def _async_chat():
            request = {"type": "chat", "id": str(int(time.time()*1000)),
                       "data": {"message": text}}
            result = self.va.send(request)
            self.response_received.emit(result if result else {"status": "error", "error": "sin respuesta"})

        threading.Thread(target=_async_chat, daemon=True).start()

    def _on_aria_says(self, text):
        """ARIA dice algo por su cuenta: lo ha decidido su latido."""
        text = str(text or "").strip()
        if not text:
            return
        self._append_chat("ARIA", text, C_ACCENT_CYAN_BRIGHT)
        # cuando ARIA explica algo, lo aprende en el grafo y registra experiencia
        try:
            import conocimiento
            conocimiento.grafo().aprender(text, tema="aria")
        except Exception:
            pass
        try:
            import experiencia
            experiencia.registrar(text, contexto=getattr(self, "_ultimo_texto_usuario", ""),
                                 resultado="exito", tema="aria")
        except Exception:
            pass
        # También sale en la OSD: lo que ARIA hace sola tiene que verse.
        self._append_osd(text)
        self.orb.set_state("responding")
        self.status_dot.setStyleSheet(f"color: {C_ACCENT_CYAN_BRIGHT}; font-size: 10px;")
        self.status_label.setText("Hablando sola...")
        self.status_label.setStyleSheet(f"color: {C_ACCENT_CYAN_BRIGHT}; font-size: 11px; font-family: 'Segoe UI';")
        QTimer.singleShot(2500, lambda: (self.orb.set_state("idle"),
            self.status_dot.setStyleSheet(f"color: {C_SUCCESS}; font-size: 10px;"),
            self.status_label.setText("Listo"),
            self.status_label.setStyleSheet(f"color: {C_TEXT_SECONDARY}; font-size: 11px; font-family: 'Segoe UI';")))


    def _render_markdown(self, text: str) -> str:
        """Convert basic markdown to HTML for chat display."""
        import re
        # Escape HTML first
        t = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        # Code blocks ```...```
        t = re.sub(r'```(\w*)\n?(.*?)```', r'<pre style="background:rgba(29, 33, 60,0.9); padding:8px; border-radius:6px; overflow-x:auto; font-size:10px; color:#ebd089;"><code>\2</code></pre>', t, flags=re.DOTALL)
        # Inline code `...`
        t = re.sub(r'`([^`]+)`', r'<code style="background:rgba(29, 33, 60,0.7); padding:1px 4px; border-radius:3px; color:#ebd089;">\1</code>', t)
        # Bold **...**
        t = re.sub(r'\*\*(.+?)\*\*', r'<b style="color:' + C_TEXT_MAIN + ';">\1</b>', t)
        # Italic *...*
        t = re.sub(r'\*(.+?)\*', r'<i style="color:' + C_TEXT_DIM + ';">\1</i>', t)
        # Headers # ... / ## ...
        t = re.sub(r'^### (.+)', r'<div style="font-size:13px; font-weight:bold; color:' + C_ACCENT + '; margin:8px 0 4px;">\1</div>', t, flags=re.MULTILINE)
        t = re.sub(r'^## (.+)', r'<div style="font-size:14px; font-weight:bold; color:' + C_SECONDARY + '; margin:8px 0 4px;">\1</div>', t, flags=re.MULTILINE)
        t = re.sub(r'^# (.+)', r'<div style="font-size:16px; font-weight:bold; color:' + C_ACCENT + '; margin:10px 0 6px;">\1</div>', t, flags=re.MULTILINE)
        # Bullet list - item
        t = re.sub(r'^- (.+)', r'<div style="margin:2px 0 2px 8px;">• \1</div>', t, flags=re.MULTILINE)
        # Numbered list
        t = re.sub(r'^(\d+)\. (.+)', r'<div style="margin:2px 0 2px 8px;">\1. \2</div>', t, flags=re.MULTILINE)
        # Links [text](url)
        t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2" style="color:' + C_ACCENT + '; text-decoration:underline;">\1</a>', t)
        # Blockquote > text
        t = re.sub(r'^&gt; (.+)', r'<div style="border-left:3px solid ' + C_ACCENT + '; padding:2px 8px; margin:4px 0; color:' + C_TEXT_DIM + '; font-style:italic;">\1</div>', t, flags=re.MULTILINE)
        # Normalize newlines to <br>
        t = t.replace('\n', '<br>')
        return t

    def _append_chat(self, sender: str, text: str, color: str = C_ACCENT_CYAN_BRIGHT):
        """Append a chat message to the history with HTML formatting."""
        from datetime import datetime
        ts = datetime.now().strftime("%H:%M")
        # Render markdown if it's from ARIA
        if sender == "ARIA":
            text = self._render_markdown(text)
        else:
            text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        border_glow = "0 0 8px " + color + "40" if sender != "Tú" else "none"
        align = "flex-end" if sender == "Tú" else "flex-start"
        bg = "rgba(229, 192, 100, 0.15)" if sender == "Tú" else "rgba(19, 21, 38, 0.5)"
        self.chat_history.append(
            "<div style='margin:6px 0; display:flex; justify-content:" + align + ";'>"
            "<div style='max-width:75%; padding:10px 12px; border-radius:12px; "
            "background:" + bg + "; border-left:3px solid " + color + "; "
            "box-shadow:" + border_glow + ";'>"
            "<span style='color:" + color + "; font-weight:bold; font-family:Consolas,monospace;'>" + sender + "</span> "
            "<span style='color:" + C_TEXT_DIM + "; font-size:9px; font-family:Consolas,monospace;'>[" + ts + "]</span>"
            "<br><span style='color:" + C_TEXT_MAIN + "; font-family:Consolas,monospace; font-size:11px; line-height:1.5;'>" + text + "</span>"
            "</div></div>"
        )
        scrollbar = self.chat_history.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())

    def _show_skeleton(self, sender: str, meta: str = ""):
        """Animated skeleton placeholder while response is being generated."""
        from datetime import datetime
        ts = datetime.now().strftime("%H:%M")
        meta_html = ""
        if meta:
            meta_html = ' <span style="color:' + C_ACCENT + '; font-size:9px; font-family:Consolas,monospace;">' + meta + '</span>'
        # Skeleton bars with animated pulse
        self.chat_history.append(
            "<div id='skeleton_" + str(int(time.time()*1000)) + "' style='margin:6px 0; padding:8px 10px; "
            "background:rgba(19, 21, 38,0.5); border-left:3px solid " + C_ACCENT + "; border-radius:4px; "
            "'>"
            "<span style='color:" + C_ACCENT + "; font-weight:bold; font-family:Consolas,monospace;'>ARIA</span> "
            "<span style='color:" + C_TEXT_DIM + "; font-size:9px; font-family:Consolas,monospace;'>[" + ts + "]</span>"
            + meta_html +
            "<br><div style='margin-top:6px;'>"
            "<div class='skel-bar' style='height:8px; width:80%; background:linear-gradient(90deg, rgba(229, 192, 100,0.15), rgba(229, 192, 100,0.4), rgba(229, 192, 100,0.15)); border-radius:4px; margin:4px 0; animation:skelPulse 1.2s ease-in-out infinite;'></div>"
            "<div class='skel-bar' style='height:8px; width:60%; background:linear-gradient(90deg, rgba(229, 192, 100,0.15), rgba(229, 192, 100,0.4), rgba(229, 192, 100,0.15)); border-radius:4px; margin:4px 0; animation:skelPulse 1.2s ease-in-out infinite;'></div>"
            "<div class='skel-bar' style='height:8px; width:45%; background:linear-gradient(90deg, rgba(229, 192, 100,0.15), rgba(229, 192, 100,0.4), rgba(229, 192, 100,0.15)); border-radius:4px; margin:4px 0; animation:skelPulse 1.2s ease-in-out infinite;'></div>"
            "</div></div>"
            "<style>"
            "@keyframes skelPulse { 0% { opacity:0.4; } 50% { opacity:0.9; } 100% { opacity:0.4; } }"
            "</style>"
        )
        scrollbar = self.chat_history.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())

    def _add_action_buttons(self, response_text: str):
        """Deja las acciones (Copiar / Guardar / Refine) sobre la ultima respuesta.

        Antes esto era codigo del motor web (QtWebEngine): se evaluaba
        JavaScript desde la vista y se aplicaba a un QTextEdit. Reventaba con
        AttributeError en cuanto ARIA contestaba algo y la app entera se caia.
        Ahora son botones de Qt de verdad: sin motor web, sin navegador y sin
        depender de nada externo.
        """
        self._last_response_text = str(response_text or "")
        for btn in (self.act_copy, self.act_save, self.act_refine):
            btn.setEnabled(bool(self._last_response_text))

    def _make_action_btn(self, texto, slot):
        """Un boton de la fila de acciones, con el estilo de la ventana."""
        btn = QPushButton(texto)
        btn.setFixedHeight(24)
        btn.setCursor(Qt.PointingHandCursor)
        btn.setStyleSheet(f"""
            QPushButton {{
                background: {C_GLASS_T2_BG}; color: {C_TEXT_SECONDARY};
                border: 1px solid {C_GLASS_BORDER}; border-radius: 6px;
                padding: 2px 10px; font-size: 10px; font-family: 'Consolas', monospace;
            }}
            QPushButton:hover {{ color: {C_ACCENT_CYAN_BRIGHT}; border-color: {C_ACCENT_CYAN_BRIGHT}; }}
            QPushButton:disabled {{ color: {C_TEXT_DIM}; border-color: {C_BORDER}; }}
        """)
        btn.clicked.connect(slot)
        return btn

    def _act_copy(self):
        """Copiar la ultima respuesta al portapapeles."""
        QApplication.clipboard().setText(self._last_response_text)
        self._show_notification("Respuesta copiada")

    def _act_save(self):
        """Guardar la ultima respuesta en un archivo local."""
        stamp = time.strftime("%Y%m%d_%H%M%S")
        destino = Path(ARIA_APP) / "data" / "respuestas" / f"respuesta_{stamp}.txt"
        resultado = self.va.send({
            "type": "skill",
            "skill": "file_write",
            "data": {"params": {"path": str(destino), "content": self._last_response_text}},
        })
        if resultado.get("status") == "ok":
            self._show_notification(f"Guardado en {destino.name}")
        else:
            self._show_notification("No se pudo guardar")

    def _act_refine(self):
        """Devuelve la respuesta al cuadro para pedirle que la mejore."""
        self.msg_input.setText(self._last_response_text)
        self.msg_input.setFocus()

    def _append_streaming(self, sender: str, full_text: str, color: str, meta: str = ""):
        """Stream text token-by-token for a typing effect."""
        from datetime import datetime
        ts = datetime.now().strftime("%H:%M")
        border_glow = "0 0 8px " + color + "40" if sender != "Tú" else "none"
        meta_html = ""
        if meta:
            meta_html = ' <span style="color:' + C_ACCENT + '; font-size:9px; font-family:Consolas,monospace;">' + meta + '</span>'
        # Insert placeholder div with id for streaming
        self.chat_history.append(
            "<div style='margin:6px 0; padding:6px 10px; "
            "background:rgba(19, 21, 38,0.5); border-left:3px solid " + color + "; border-radius:4px; "
            "box-shadow:" + border_glow + ";'>"
            "<span style='color:" + color + "; font-weight:bold; font-family:Consolas,monospace;'>" + sender + "</span> "
            "<span style='color:" + C_TEXT_DIM + "; font-size:9px; font-family:Consolas,monospace;'>[" + ts + "]</span>"
            + meta_html +
            "</div>"
        )
        # El texto entra a chorros, insertado al final del documento. Antes se
        # buscaba con un replace sobre toHtml() y nunca casaba: Qt reescribe
        # el HTML al serializarlo, asi que la respuesta se quedaba vacia.
        cursor = self.chat_history.textCursor()
        chunk_size = max(1, len(full_text) // 40)  # ~40 steps
        pos = [0]

        def _step():
            nuevo = full_text[pos[0]:pos[0] + chunk_size]
            pos[0] += len(nuevo)
            if nuevo:
                cursor.movePosition(QTextCursor.End)
                cursor.insertHtml(
                    "<span style='color:" + C_TEXT_MAIN
                    + "; font-family:Consolas,monospace; font-size:11px;'>"
                    + nuevo.replace("&", "&amp;").replace("<", "&lt;")
                           .replace(">", "&gt;").replace(" ", "&nbsp;")
                    + "</span>"
                )
            if pos[0] < len(full_text):
                QTimer.singleShot(25, _step)
            scrollbar = self.chat_history.verticalScrollBar()
            scrollbar.setValue(scrollbar.maximum())

        QTimer.singleShot(30, _step)

    def load_skills(self):
        result = self.va.send({"type": "list_skills", "id": "skills"})
        skills = result.get("skills", []) if result.get("status") == "ok" else []
        # Clear existing buttons
        while self.skills_grid_layout.count():
            item = self.skills_grid_layout.takeAt(0)
            w = item.widget()
            if w: w.deleteLater()
        # Add up to 25 skill buttons (scrollable in sidebar)
        for s in skills[:25]:
            name = s.get('name', '?')
            category = s.get('category', '')
            self._add_skill_btn(name, category)

    def closeEvent(self, event):
        # Minimize to tray instead of closing
        if hasattr(self, '_tray') and self._tray:
            self.hide()
            event.ignore()
        else:
            event.ignore()  # Never close from X button

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._dragging = True
            self._old_pos = event.globalPos()
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._dragging and self._old_pos:
            delta = event.globalPos() - self._old_pos
            self.move(self.x() + delta.x(), self.y() + delta.y())
            self._old_pos = event.globalPos()
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        self._dragging = False
        super().mouseReleaseEvent(event)

    def _open_theme_picker(self):
        from PyQt5.QtWidgets import (QDialog, QVBoxLayout, QGridLayout, QLabel,
                                     QGroupBox, QHBoxLayout as _HL)
        dlg = QDialog(self)
        dlg.setWindowTitle('Selector de tema — Serpentium x Caelestia')
        dlg.setFixedSize(420, 340)
        dlg.setStyleSheet(f"""
            QDialog {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 {C_BG_DARK_0}, stop:1 {C_BG_DARK_1});
                border: 1px solid {C_GLASS_BORDER};
                border-radius: 16px;
            }}
            QLabel {{ color: {C_TEXT_MAIN}; font-family: 'Consolas', monospace; }}
        """)
        v = QVBoxLayout(dlg)
        v.setContentsMargins(20, 20, 20, 20)
        v.setSpacing(12)

        lbl = QLabel('◆ Elige un tema visual')
        lbl.setStyleSheet(f"color: {C_TEXT_PRIMARY}; font-size: 15px; font-weight: bold;")
        v.addWidget(lbl)

        # Theme preview cards with live color swatches
        themes = [
            ('Cyan Aurora',   C_ACCENT_CYAN_BRIGHT, C_ACCENT_PURPLE, 'default'),
            ('Purple Nebula', C_ACCENT_PURPLE,     C_ORB_BASE,      'purple'),
            ('Green Genesis', C_ACCENT_GREEN,      C_ACCENT_CYAN_BRIGHT, 'green'),
            ('Orange Ember',  C_ACCENT_ORANGE,     C_ACCENT_PURPLE, 'orange'),
        ]
        grid = QGridLayout()
        grid.setSpacing(12)
        for i, (name, primary, secondary, key) in enumerate(themes):
            card = self._build_theme_card(name, primary, secondary, key, dlg)
            grid.addWidget(card, i // 2, i % 2)
        v.addLayout(grid)

        close_btn = QPushButton('Streamer ← Volver')
        close_btn.setFixedHeight(38)
        close_btn.setStyleSheet(f"""
            QPushButton {{
                background: rgba(19, 21, 38, 0.6);
                color: {C_TEXT_SECONDARY};
                border: 1px solid {C_GLASS_BORDER};
                border-radius: 10px;
                font-weight: bold;
                font-size: 12px;
                font-family: 'Consolas', monospace;
                
            }}
            QPushButton:hover {{
                background: rgba(229, 192, 100, 0.15);
                border-color: {C_ACCENT_CYAN_BRIGHT};
                color: {C_TEXT_PRIMARY};
                
            }}
        """)
        close_btn.clicked.connect(dlg.reject)
        v.addWidget(close_btn)
        dlg.exec_()

    def _build_theme_card(self, name, primary, secondary, key, parent):
        """Build a theme preview card with color swatches + apply button."""
        card = QWidget()
        card.setFixedSize(170, 110)
        card.setStyleSheet(f"""
            QWidget {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 rgba(19, 21, 38, 0.7), stop:1 rgba(19, 21, 38, 0.4));
                border: 1px solid {C_GLASS_BORDER};
                border-radius: 12px;
                
            }}
            QWidget:hover {{
                border-color: {primary};
                
                
            }}
        """)
        layout = QVBoxLayout(card)
        layout.setContentsMargins(10, 8, 10, 8)
        layout.setSpacing(4)

        # Color swatches row
        swatch_row = QHBoxLayout()
        swatch1 = QLabel()
        swatch1.setFixedSize(28, 28)
        swatch1.setStyleSheet(f"background: {primary}; border-radius: 6px; border: 1px solid rgba(255, 255, 255,0.2);")
        swatch2 = QLabel()
        swatch2.setFixedSize(28, 28)
        swatch2.setStyleSheet(f"background: {secondary}; border-radius: 6px; border: 1px solid rgba(255, 255, 255,0.2);")
        swatch_row.addWidget(swatch1)
        swatch_row.addWidget(swatch2)
        swatch_row.addStretch()
        layout.addLayout(swatch_row)

        name_lbl = QLabel(name)
        name_lbl.setStyleSheet(f"color: {C_TEXT_PRIMARY}; font-size: 11px; font-weight: bold;")
        layout.addWidget(name_lbl)

        apply_btn = QPushButton('Aplicar')
        apply_btn.setFixedHeight(26)
        apply_btn.setStyleSheet(f"""
            QPushButton {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 {primary}, stop:1 {secondary});
                color: #131526;
                border: none;
                border-radius: 8px;
                font-weight: bold;
                font-size: 10px;
                font-family: 'Consolas', monospace;
                
            }}
            QPushButton:hover {{
                
                
            }}
            QPushButton:active {{  }}
        """)
        apply_btn.clicked.connect(lambda k=key: (self._apply_theme(k), parent.accept()))
        layout.addWidget(apply_btn)
        return card

    def _apply_theme(self, theme_key):
        themes = {
            'default': (C_ACCENT_CYAN_BRIGHT, C_ACCENT_PURPLE),
            'purple': (C_ACCENT_PURPLE, C_ORB_BASE),
            'green':  (C_ACCENT_GREEN, C_ACCENT_CYAN_BRIGHT),
            'orange': (C_ACCENT_ORANGE, C_ACCENT_PURPLE),
        }
        primary, secondary = themes.get(theme_key, (C_ACCENT_CYAN_BRIGHT, C_ACCENT_PURPLE))
        self._current_theme = theme_key
        # Update orb colors
        self.orb._color = QColor(primary)
        self.orb.update()
        # Update status label
        self.status_label.setStyleSheet('color: ' + primary + '; font-size: 11px;')
        # Persist
        self._save_settings()
        self._append_chat('ARIA', 'Tema cambiado a ' + theme_key, primary)

    def _open_control_center(self):
        from PyQt5.QtWidgets import (QDialog, QVBoxLayout, QLabel, QCheckBox,
                                     QSlider, QGroupBox, QHBoxLayout as _HL,
                                     QFormLayout)
        dlg = QDialog(self)
        dlg.setWindowTitle('◆ Control Center — Caelestia')
        dlg.setFixedSize(420, 460)
        dlg.setStyleSheet(f"""
            QDialog {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 {C_BG_DARK_0}, stop:1 {C_BG_DARK_1});
                border: 1px solid {C_GLASS_BORDER};
                border-radius: 16px;
            }}
            QLabel {{ color: {C_TEXT_MAIN}; font-family: 'Consolas', monospace; }}
            QGroupBox {{
                color: {C_ACCENT_CYAN_BRIGHT};
                font-weight: bold;
                font-size: 12px;
                border: 1px solid {C_GLASS_BORDER};
                border-radius: 10px;
                padding-top: 10px;
                margin-top: 6px;
            }}
            QGroupBox::title {{
                subcontrol-origin: margin;
                subcontrol-position: top left;
                padding: 0 6px;
            }}
        """)
        v = QVBoxLayout(dlg)
        v.setContentsMargins(20, 20, 20, 20)
        v.setSpacing(14)

        lbl = QLabel('◆ Configuración del sistema')
        lbl.setStyleSheet(f"color: {C_TEXT_PRIMARY}; font-size: 15px; font-weight: bold;")
        v.addWidget(lbl)

        # ── Group: Visual ──
        grp_visual = QGroupBox('Visual')
        gl = QFormLayout()
        gl.setLabelAlignment(Qt.AlignRight)
        self._cc_anim_toggle = QCheckBox('Animaciones del orb')
        self._cc_anim_toggle.setChecked(True)
        self._cc_anim_toggle.setStyleSheet(f"QCheckBox {{ color: {C_TEXT_SECONDARY}; font-size: 11px; }}")
        gl.addRow('Animaciones', self._cc_anim_toggle)

        self._cc_glass_toggle = QCheckBox('Transparencia glassmorphism')
        self._cc_glass_toggle.setChecked(True)
        self._cc_glass_toggle.setStyleSheet(f"QCheckBox {{ color: {C_TEXT_SECONDARY}; font-size: 11px; }}")
        gl.addRow('Glass', self._cc_glass_toggle)

        self._cc_stream_toggle = QCheckBox('Streaming de texto')
        self._cc_stream_toggle.setChecked(True)
        self._cc_stream_toggle.setStyleSheet(f"QCheckBox {{ color: {C_TEXT_SECONDARY}; font-size: 11px; }}")
        gl.addRow('Streaming', self._cc_stream_toggle)
        grp_visual.setLayout(gl)
        v.addWidget(grp_visual)

        # ── Group: Audio/Notifications ──
        grp_notif = QGroupBox('Notificaciones')
        gl2 = QFormLayout()
        gl2.setLabelAlignment(Qt.AlignRight)
        self._cc_notif_toggle = QCheckBox('Habilitar notificaciones')
        self._cc_notif_toggle.setChecked(True)
        self._cc_notif_toggle.setStyleSheet(f"QCheckBox {{ color: {C_TEXT_SECONDARY}; font-size: 11px; }}")
        gl2.addRow('Notificaciones', self._cc_notif_toggle)

        self._cc_sound_toggle = QCheckBox('Sonido de respuesta')
        self._cc_sound_toggle.setChecked(False)
        self._cc_sound_toggle.setStyleSheet(f"QCheckBox {{ color: {C_TEXT_SECONDARY}; font-size: 11px; }}")
        gl2.addRow('Sonido', self._cc_sound_toggle)
        grp_notif.setLayout(gl2)
        v.addWidget(grp_notif)

        # ── Group: Opacity slider ──
        grp_opacity = QGroupBox('Opacidad de la interfaz')
        gl3 = QFormLayout()
        self._cc_opacity_slider = QSlider(Qt.Horizontal)
        self._cc_opacity_slider.setRange(60, 100)
        self._cc_opacity_slider.setValue(85)
        self._cc_opacity_slider.setTickPosition(QSlider.NoTicks)
        self._cc_opacity_slider.setStyleSheet(f"""
            QSlider::groove {{
                background: rgba(19, 21, 38, 0.6);
                height: 6px;
                border-radius: 3px;
            }}
            QSlider::handle {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 {C_ACCENT_CYAN_BRIGHT}, stop:1 {C_ACCENT_PURPLE});
                width: 16px;
                border-radius: 8px;
                margin: -5px 0;
            }}
        """)
        self._cc_opacity_label = QLabel('85%')
        self._cc_opacity_label.setStyleSheet(f"color: {C_ACCENT_CYAN_BRIGHT}; font-weight: bold;")
        self._cc_opacity_slider.valueChanged.connect(
            lambda val: (self._cc_opacity_label.setText(str(val) + '%'),
                         self.setWindowOpacity(val / 100.0)))
        opacity_row = _HL()
        opacity_row.addWidget(self._cc_opacity_slider)
        opacity_row.addWidget(self._cc_opacity_label)
        gl3.addRow('Opacidad', opacity_row)
        grp_opacity.setLayout(gl3)
        v.addWidget(grp_opacity)

        # ── Save button ──
        save_btn = QPushButton('◆ Guardar configuración')
        save_btn.setFixedHeight(40)
        save_btn.setStyleSheet(f"""
            QPushButton {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 {C_ACCENT_CYAN_BRIGHT}, stop:1 {C_ACCENT_PURPLE});
                color: #131526;
                border: none;
                border-radius: 10px;
                font-weight: bold;
                font-size: 12px;
                font-family: 'Consolas', monospace;
                
                
            }}
            QPushButton:hover {{
                
                
            }}
            QPushButton:active {{  }}
        """)
        save_btn.clicked.connect(lambda: (self._save_settings(), dlg.accept()))
        v.addWidget(save_btn)
        dlg.exec_()

    def _open_nucleus(self):
        """Abre el panel de evolución y sacrifice del núcleo."""
        if not hasattr(self, '_nucleus_panel') or self._nucleus_panel is None:
            self._nucleus_panel = EvolutionPanel(self.va, self.orb, self)
            self._nucleus_panel._osd = getattr(self, '_osd', None)
        self._nucleus_panel.show()
        self._nucleus_panel.raise_()
        self._nucleus_panel.activateWindow()

    def _open_memory(self):
        """Abre el panel de memoria: ver, buscar, fijar, borrar y exportar."""
        if not hasattr(self, '_memory_panel') or self._memory_panel is None:
            self._memory_panel = MemoryPanel(self.va, self)
        self._memory_panel._refresh()
        self._memory_panel.show()
        self._memory_panel.raise_()
        self._memory_panel.activateWindow()

    def _show_command_palette(self):

        from PyQt5.QtWidgets import QDialog, QLineEdit, QVBoxLayout, QListWidget, QListWidgetItem
        dlg = QDialog(self)
        dlg.setWindowTitle('Comando')
        dlg.setFixedSize(400, 300)
        dlg.setStyleSheet('QDialog { background: ' + C_BG_DEEP + '; border: 1px solid ' + C_GLASS_BORDER + '; border-radius: 12px; }')
        v = QVBoxLayout(dlg)
        search = QLineEdit()
        search.setPlaceholderText(' Buscar comando o skill...')
        search.setStyleSheet('QLineEdit { background: rgba(19, 21, 38, 0.8); color: ' + C_TEXT_MAIN + '; border: 1px solid ' + C_GLASS_BORDER + '; border-radius: 8px; padding: 10px; font-family: Consolas, monospace; }')
        v.addWidget(search)
        list_w = QListWidget()
        list_w.setStyleSheet('QListWidget { background: transparent; border: none; } QListWidget::item::selected { background: rgba(229, 192, 100, 0.2); }')
        v.addWidget(list_w)
        commands = [
            ('Busqueda web', 'web.search'),
            ('Clima', 'weather'),
            ('Lista de archivos', 'files.list'),
            ('Abrir app', 'system.open'),
            ('Screenshot', 'system.screenshot'),
            ('Estado del sistema', 'system.status'),
            ('Configuracion', 'settings'),
        ]
        for name, cmd in commands:
            item = QListWidgetItem(name + '  [' + cmd + ']')
            item.setData(Qt.UserRole, cmd)
            list_w.addItem(item)
        def _filter(text):
            for i in range(list_w.count()):
                item = list_w.item(i)
                item.setHidden(text.lower() not in item.text().lower())
        search.textChanged.connect(_filter)
        def _select():
            items = list_w.selectedItems()
            if items:
                cmd = items[0].data(Qt.UserRole)
                self.msg_input.setText(cmd)
                dlg.accept()
        list_w.itemDoubleClicked.connect(_select)
        dlg.exec_()

    def _show_notification(self, message, title="ARIA"):
        """Show a desktop notification via system tray."""
        try:
            if hasattr(self, '_tray') and self._tray:
                self._tray.showMessage(title, message, QSystemTrayIcon.Information, 3000)
        except Exception:
            pass

    def _on_message_sent(self):
        """Micro-interaction: ripple effect on send button."""
        self.orb.set_state("thinking")

    def _toggle_accessibility(self):
        """Toggle high-contrast accessibility mode."""
        if not hasattr(self, '_a11y_mode'):
            self._a11y_mode = False
        self._a11y_mode = not self._a11y_mode
        if self._a11y_mode:
            self.setStyleSheet(self.styleSheet() + """
                QLabel { font-size: 13px; }
                QTextEdit { font-size: 13px; }
                QLineEdit { font-size: 13px; }
            """)
        else:
            self.setStyleSheet(self.styleSheet())

    def _export_chat(self, filename=None):
        """Export chat history to a text file."""
        import datetime
        if not filename:
            ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"ARIA_chat_export_{ts}.txt"
        text = self.chat_history.toPlainText()
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(text)
            self._show_notification(f"Chat exportado a {filename}")
        except Exception as e:
            self._show_notification(f"Error exportando: {e}", "Error")

    def _clear_chat(self):
        """Clear chat history with confirmation."""
        from PyQt5.QtWidgets import QMessageBox
        reply = QMessageBox.question(self, "Limpiar chat",
            "Esto eliminará todo el historial. Continuar?",
            QMessageBox.Yes | QMessageBox.No)
        if reply == QMessageBox.Yes:
            self.chat_history.clear()
            self._append_chat("ARIA", "Chat limpio. ¿En que puedo ayudarte?", C_SUCCESS)

    def _show_shortcuts(self):
        """Show keyboard shortcuts help dialog."""
        from PyQt5.QtWidgets import QDialog, QVBoxLayout, QLabel
        dlg = QDialog(self)
        dlg.setWindowTitle("Atajos de teclado")
        dlg.setFixedSize(380, 300)
        dlg.setStyleSheet("QDialog { background: " + C_BG_DEEP + "; }")
        v = QVBoxLayout(dlg)
        lbl = QLabel("Atajos de teclado")
        lbl.setStyleSheet("color: " + C_TEXT_MAIN + "; font-size: 14px; font-weight: bold; font-family: Consolas, monospace;")
        v.addWidget(lbl)
        shortcuts = [
            ("Enter", "Enviar mensaje"),
            ("Ctrl+L", "Limpiar chat"),
            ("Ctrl+E", "Exportar chat"),
            ("Ctrl+K", "Paleta de comandos"),
            ("Ctrl+T", "Cambiar tema"),
            ("Ctrl+,", "Control Center"),
            ("Ctrl+M", "Memoria"),
            ("F1", "Esta ayuda"),
            ("Esc", ",Ocultar/Cerrar"),
        ]
        for key, desc in shortcuts:
            item = QLabel(f"<b>{key}</b>  —  {desc}")
            item.setStyleSheet("color: " + C_TEXT_DIM + "; font-size: 11px; font-family: Consolas, monospace; padding: 2px;")
            v.addWidget(item)
        close_btn = QPushButton("Close")
        close_btn.setFixedHeight(32)
        close_btn.setStyleSheet("QPushButton { background: " + C_ACCENT + "; color: #131526; border: none; border-radius: 8px; font-weight: bold; font-family: Consolas, monospace; }")
        close_btn.clicked.connect(dlg.accept)
        v.addWidget(close_btn)
        dlg.exec_()

    def _save_settings(self):
        """Persist settings to local storage."""
        import json
        settings = {
            'theme': getattr(self, '_current_theme', 'default'),
            'a11y_mode': getattr(self, '_a11y_mode', False),
            'window_geometry': [self.x(), self.y(), self.width(), self.height()],
        }
        try:
            with open('ARIA_APP/settings.json', 'w', encoding='utf-8') as f:
                json.dump(settings, f, indent=2)
        except Exception:
            pass

    def _load_settings(self):
        """Load persisted settings."""
        import json
        try:
            with open('ARIA_APP/settings.json', 'r', encoding='utf-8') as f:
                settings = json.load(f)
            if 'window_geometry' in settings:
                x, y, w, h = settings['window_geometry']
                self.setGeometry(x, y, w, h)
        except Exception:
            pass

    def _performance_monitor(self):
        """Lightweight performance monitoring: FPS and memory."""
        import time as _time
        if not hasattr(self, '_perf_frames'):
            self._perf_frames = 0
            self._perf_start = _time.time()
            self._perf_timer = QTimer(self)
            self._perf_timer.timeout.connect(self._perf_tick)
            self._perf_timer.start(1000)
        else:
            self._perf_frames += 1

    def _perf_tick(self):
        """Report FPS every second (debug only)."""
        import time as _time
        elapsed = _time.time() - self._perf_start
        if elapsed >= 1.0:
            fps = self._perf_frames / elapsed
            logger.debug(f"[PERF] FPS={fps:.1f}")
            self._perf_frames = 0
            self._perf_start = _time.time()

    def _setup_keyboard_shortcuts(self):
        """Register global keyboard shortcuts."""
        QShortcut(QKeySequence("Ctrl+K"), self).activated.connect(self._show_command_palette)
        QShortcut(QKeySequence("Ctrl+T"), self).activated.connect(self._open_theme_picker)
        QShortcut(QKeySequence("Ctrl+,"), self).activated.connect(self._open_control_center)
        QShortcut(QKeySequence("Ctrl+L"), self).activated.connect(self._clear_chat)
        QShortcut(QKeySequence("Ctrl+E"), self).activated.connect(self._export_chat)
        QShortcut(QKeySequence("Ctrl+M"), self).activated.connect(self._open_memory)
        QShortcut(QKeySequence("F1"), self).activated.connect(self._show_shortcuts)

    def _debug_check(self):
        try:
            g = self.geometry()
            print(f"[DEBUG] Window visible={self.isVisible()}, geom=({g.x()},{g.y()},{g.width()},{g.height()})", flush=True)
        except Exception as e:
            print(f"[DEBUG] Error: {e}", flush=True)


# ── Floating Overlay Orb ──────────────────────────────────────────────────────

class OverlayOrb(QWidget):
    """Mini floating orb that stays on top, learns user position,
    auto-hides after inactivity, and expands to full ARIA on click."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._dragging = False
        self._offset = None
        self._last_interaction = time.time()
        self._state = "idle"
        self._opacity = 0.7
        self._position_history = []
        self._settings = QSettings("ARIA", "OverlayWidget")
        self._setup_window()
        self._setup_timer()
        self._setup_hotkeys()
        self._restore_position()

    def _setup_window(self):
        self.setWindowFlags(
            Qt.FramelessWindowHint |
            Qt.Tool
        )
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setAttribute(Qt.WA_NoSystemBackground)
        self.setFixedSize(80, 80)
        self.setWindowOpacity(self._opacity)
        screen = QApplication.primaryScreen().availableGeometry()
        self.move(screen.width() - 100, 20)

    def _setup_timer(self):
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._animate)
        self._timer.start(30)
        self._inactivity_timer = QTimer(self)
        self._inactivity_timer.timeout.connect(self._check_inactivity)
        self._inactivity_timer.start(5000)

    def _setup_hotkeys(self):
        try:
            import keyboard
            keyboard.add_hotkey('win+a', self._toggle_visibility)
            keyboard.add_hotkey('win+shift+a', self._expand_full)
        except Exception:
            pass

    def _restore_position(self):
        x = self._settings.value("overlay_x", 0, type=int)
        y = self._settings.value("overlay_y", 0, type=int)
        if x > 0 or y > 0:
            self.move(x, y)

    def _save_position(self):
        geo = self.frameGeometry()
        self._settings.setValue("overlay_x", geo.x())
        self._settings.setValue("overlay_y", geo.y())
        self._position_history.append({
            "x": geo.x(), "y": geo.y(), "time": time.time()
        })
        if len(self._position_history) > 100:
            self._position_history = self._position_history[-100:]

    def _toggle_visibility(self):
        if self.isVisible():
            self.hide()
        else:
            self.show()
            self.raise_()
            self.activateWindow()

    def _expand_full(self):
        if self.parent():
            self.parent().showNormal()
            self.parent().raise_()
            self.parent().activateWindow()
        self.hide()

    def _on_interaction(self):
        self._last_interaction = time.time()
        if not self.isVisible():
            self.show()

    def _check_inactivity(self):
        if time.time() - self._last_interaction > 30:
            self.hide()
            self._last_interaction = time.time()

    def _animate(self):
        self._phase = getattr(self, '_phase', 0.0) + 0.03
        self._pulse_phase = getattr(self, '_pulse_phase', 0.0) + 0.02
        if self._pulse_phase >= 1.0:
            self._pulse_phase = 0.0
        self.update()

    def set_state(self, state: str):
        """Sync state from main window orb."""
        self._state = state
        self.update()

    def mousePressEvent(self, event):
        self._on_interaction()
        if event.button() == Qt.LeftButton:
            dx = event.x() - 40
            dy = event.y() - 40
            if (dx*dx + dy*dy) <= 35*35:
                self._expand_full()
            else:
                self._dragging = True
                self._offset = event.globalPos() - self.frameGeometry().topLeft()
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if self._dragging and event.buttons() == Qt.LeftButton:
            self.move(event.globalPos() - self._offset)
            self._save_position()
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):
        self._dragging = False
        super().mouseReleaseEvent(event)

    def wheelEvent(self, event):
        self._on_interaction()
        delta = event.angleDelta().y() / 120
        self._opacity = max(0.3, min(1.0, self._opacity + delta * 0.05))
        self.setWindowOpacity(self._opacity)
        self._settings.setValue("overlay_opacity", self._opacity)
        super().wheelEvent(event)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        painter.setRenderHint(QPainter.SmoothPixmapTransform)
        w, h = self.width(), self.height()
        cx, cy = w // 2, h // 2
        base_r = min(w, h) * 0.25
        phase = getattr(self, '_phase', 0.0)
        pulse_phase = getattr(self, '_pulse_phase', 0.0)
        breath = 1.0 + 0.10 * ((1 + math.sin(phase)) / 2)
        r = int(base_r * breath)
        painter.setPen(Qt.NoPen)

        # State-specific color
        state_colors = {
            "idle": QColor(229, 192, 100),
            "thinking": QColor(245, 158, 11),
            "responding": QColor(225, 182, 75),
            "listening": QColor(204, 196, 255),
        }
        orb_color = state_colors.get(self._state, QColor(229, 192, 100))

        # ── Layer 7: Pulse Ring (expanding outward, 2.0s ease-out) ──
        pulse_r = int(r + 30 * pulse_phase)
        pulse_alpha = max(0, int(60 * (1.0 - pulse_phase)))
        painter.setBrush(QBrush(QColor(229, 192, 100, pulse_alpha)))
        painter.drawEllipse(cx - pulse_r, cy - pulse_r, pulse_r*2, pulse_r*2)

        # ── Layer 6: Outer Halo (breathing 3s) ──
        halo_r = r + 18
        halo_alpha = int(40 + 15 * ((1 + math.sin(phase * 2)) / 2))
        painter.setBrush(QBrush(QColor(229, 192, 100, halo_alpha)))
        painter.drawEllipse(cx - halo_r, cy - halo_r, halo_r*2, halo_r*2)

        # ── Layer 5: Orbit Ring (rotating 4s linear) ──
        painter.setPen(QPen(QColor(229, 192, 100, 120), 1))
        painter.setBrush(Qt.NoBrush)
        painter.save()
        painter.translate(cx, cy)
        painter.rotate((phase * 57.3) % 360)
        painter.drawEllipse(-32, -32, 64, 64)
        painter.restore()

        # ── Layer 4: Orbit Particles (small, pulsing) ──
        n_particles = 8
        for i in range(n_particles):
            pa = (phase * 2 + i * (6.283 / n_particles)) % 6.283
            px = cx + 32 * math.cos(pa)
            py = cy + 32 * math.sin(pa)
            p_alpha = int(180 + 75 * ((1 + math.sin(phase * 3 + i)) / 2))
            painter.setBrush(QBrush(QColor(225, 182, 75, p_alpha)))
            painter.setPen(Qt.NoPen)
            painter.drawEllipse(int(px) - 1, int(py) - 1, 3, 3)

        # ── Layer 3: Core Glow (breathing 1.5s) ──
        glow_r = r + 8
        core_alpha = int(80 + 30 * ((1 + math.sin(phase * 4)) / 2))
        painter.setBrush(QBrush(QColor(229, 192, 100, core_alpha)))
        painter.drawEllipse(cx - glow_r, cy - glow_r, glow_r*2, glow_r*2)

        # ── Layer 2: Solid Sphere (radial gradient, state-colored) ──
        gradient = QRadialGradient(cx, cy, 0, cx, cy, r)
        gradient.setColorAt(0, QColor(235, 208, 137))
        gradient.setColorAt(0.5, orb_color)
        gradient.setColorAt(1, QColor(220, 171, 46))
        painter.setBrush(QBrush(gradient))
        painter.drawEllipse(cx - r, cy - r, r*2, r*2)

        # ── Layer 1: Burst Rays (on thinking/responding) ──
        if self._state in ("thinking", "responding"):
            n_rays = 10
            for i in range(n_rays):
                ba = (phase * 3 + i * (6.283 / n_rays)) % 6.283
                bx = int(cx + math.cos(ba) * r)
                by = int(cy + math.sin(ba) * r)
                ex = int(cx + math.cos(ba) * (r + 18))
                ey = int(cy + math.sin(ba) * (r + 18))
                b_alpha = int(150 * (1 - pulse_phase))
                painter.setPen(QPen(QColor(225, 182, 75, max(0, b_alpha)), 1))
                painter.setBrush(Qt.NoBrush)
                painter.drawLine(bx, by, ex, ey)

        # Inner highlight
        painter.setBrush(QBrush(QColor(255, 255, 255, 50)))
        painter.drawEllipse(cx - r//3, cy - r//3 - r//4, r//2, r//3)

        painter.end()


# ── Evolution Panel (sacrifice + cadenas de evolución) ──────────────────────────

EVOLUTION_CHAINS = {
    "gran_sabio_analisis": {
        "name": "Gran Sabio Análisis",
        "next": "gran_sabio_supremo",
        "desc": "Análisis profundo de cualquier asunto.",
        "sacrifice_cost": "ciel_infon_flujo",
    },
    "gran_sabio_supremo": {
        "name": "Gran Sabio Supremo",
        "next": "núcleo_fusionado_final",
        "desc": "Sabiduría acumulada al máximo.",
        "sacrifice_cost": "orbe_resonante",
    },
    "núcleo_fusionado_final": {
        "name": "Núcleo Fusionado Final",
        "next": None,
        "desc": "La forma última del núcleo ARIA.",
        "sacrifice_cost": "espada_eterna",
    },
    "ciel_infon_flujo": {
        "name": "Flujo de Infons (Ciel)",
        "next": "sabiduría_fusionada",
        "desc": "Corriente constante de infons cósmicos.",
        "sacrifice_cost": None,
    },
    "sabiduría_fusionada": {
        "name": "Sabiduría Fusionada",
        "next": "orbe_resonante",
        "desc": "Sabiduría que resuena entre dimensiones.",
        "sacrifice_cost": None,
    },
    "orbe_resonante": {
        "name": "Orbe Resonante",
        "next": "orbe_infinito",
        "desc": "Orbe que vibra con la frecuencia del universo.",
        "sacrifice_cost": None,
    },
    "orbe_infinito": {
        "name": "Orbe Infinito",
        "next": None,
        "desc": "Orbe sin límites ni final.",
        "sacrifice_cost": None,
    },
    "raphael_transformacion": {
        "name": "Transformación (Raphael)",
        "next": "espada_eterna",
        "desc": "Corta la ilusión, revela la verdad.",
        "sacrifice_cost": None,
    },
    "espada_eterna": {
        "name": "Espada Eterna",
        "next": None,
        "desc": "Filosofía convertida en acción pura.",
        "sacrifice_cost": None,
    },
}


class EvolutionPanel(QWidget):
    """Panel flotante: muestra cadenas de evolución, botón de sacrifice y lista de skills."""

    def __init__(self, va: VAAdapter, orb: OrbWidget, parent=None):
        super().__init__(parent)
        self.va = va
        self.orb = orb
        self._setup_ui()
        self._refresh()

    def _setup_ui(self):
        self.setWindowTitle("◆ Núcleo ARIA — Evolución y Sacrifice")
        self.setFixedSize(460, 560)
        self.setWindowFlags(Qt.Window)
        self.setStyleSheet(f"""
            QDialog, QWidget {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 {C_BG_DARK_0}, stop:1 {C_BG_DARK_1});
                border: 1px solid {C_GLASS_T1_BORDER};
                border-radius: 18px;
            }}
            QLabel {{ color: {C_TEXT_MAIN}; font-family: 'Consolas', monospace; }}
            QScrollArea {{ background: transparent; border: none; }}
        """)
        v = QVBoxLayout(self)
        v.setContentsMargins(20, 20, 20, 20)
        v.setSpacing(12)

        # Título
        lbl = QLabel("◆ Núcleo ARIA")
        lbl.setStyleSheet(f"color: {C_ACCENT_CYAN_BRIGHT}; font-size: 16px; font-weight: bold; letter-spacing: 2px;")
        v.addWidget(lbl)

        sub = QLabel("Evolución de habilidades y sacrifice")
        sub.setStyleSheet(f"color: {C_TEXT_SECONDARY}; font-size: 11px; margin-bottom: 6px;")
        v.addWidget(sub)

        # Selector de aspecto
        asp_grp = QGroupBox("Aspecto del Núcleo")
        asp_grp.setStyleSheet(f"""
            QGroupBox {{
                color: {C_ACCENT_CYAN_BRIGHT};
                font-weight: bold;
                font-size: 11px;
                border: 1px solid {C_GLASS_T1_BORDER};
                border-radius: 10px;
                margin-top: 8px;
                padding-top: 8px;
            }}
            QGroupBox::title {{ subcontrol-origin: margin; subcontrol-position: top left; padding: 0 6px; }}
        """)
        asp_layout = QHBoxLayout()
        for aspect in ("ciel", "raphael", "gran_sabio", "fused"):
            r, g, b = ASPECT_RGB[aspect]
            btn = QPushButton(aspect.replace("_", " ").title())
            btn.setFixedHeight(28)
            btn.setCheckable(True)
            btn.setChecked(aspect == self.orb._aspect)
            btn.setStyleSheet(f"""
                QPushButton {{
                    background: {C_GLASS_T2_BG};
                    color: {C_TEXT_TERTIARY};
                    border: 1px solid {C_GLASS_T2_BORDER};
                    border-radius: 8px;
                    font-size: 10px;
                    font-family: 'Consolas', monospace;
                }}
                QPushButton:checked {{
                    background: rgba({r}, {g}, {b}, 0.35);
                    color: {C_TEXT_PRIMARY};
                    border-color: rgba({r}, {g}, {b}, 0.8);
                    
                }}
                QPushButton:hover:!checked {{
                    border-color: rgba({r}, {g}, {b}, 0.4);
                }}
            """)
            btn.clicked.connect(lambda _, a=aspect, b=btn: self._set_aspect(a, b))
            asp_layout.addWidget(btn)
        asp_grp.setLayout(asp_layout)
        v.addWidget(asp_grp)

        # Cadenas de evolución
        evo_lbl = QLabel("Cadenas de Evolución")
        evo_lbl.setStyleSheet(f"color: {C_ACCENT_PURPLE}; font-size: 12px; font-weight: bold; margin-top: 8px;")
        v.addWidget(evo_lbl)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setMaximumHeight(240)
        self.evo_list = QWidget()
        self.evo_layout = QVBoxLayout(self.evo_list)
        self.evo_layout.setSpacing(8)
        scroll.setWidget(self.evo_list)
        v.addWidget(scroll)

        # Botón de sacrifice
        self.sac_btn = QPushButton("◆ Ejecutar Sacrifice")
        self.sac_btn.setFixedHeight(40)
        self.sac_btn.setStyleSheet(f"""
            QPushButton {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 {C_ACCENT_ORANGE}, stop:1 #ef87b1);
                color: #131526;
                border: none;
                border-radius: 10px;
                font-weight: bold;
                font-size: 12px;
                font-family: 'Consolas', monospace;
                
                
            }}
            QPushButton:hover {{
                
                
            }}
            QPushButton:pressed {{  }}
        """)
        self.sac_btn.clicked.connect(self._do_sacrifice)
        v.addWidget(self.sac_btn)

        # Lista de skills
        sk_lbl = QLabel("Skills Disponibles")
        sk_lbl.setStyleSheet(f"color: {C_ACCENT_CYAN_BRIGHT}; font-size: 12px; font-weight: bold; margin-top: 10px;")
        v.addWidget(sk_lbl)
        self.skills_list = QListWidget()
        self.skills_list.setStyleSheet(f"""
            QListWidget {{
                background: {C_GLASS_T2_BG};
                border: 1px solid {C_GLASS_T2_BORDER};
                border-radius: 10px;
                color: {C_TEXT_SECONDARY};
                font-family: 'Consolas', monospace;
                font-size: 11px;
            }}
            QListWidget::item {{
                padding: 6px 10px;
                border-bottom: 1px solid {C_GLASS_T1_BORDER};
            }}
            QListWidget::item:selected {{
                background: {C_GLASS_T3_BG};
                color: {C_ACCENT_CYAN_BRIGHT};
                border-left: 3px solid {C_ACCENT_CYAN_BRIGHT};
            }}
        """)
        self.skills_list.setMaximumHeight(140)
        v.addWidget(self.skills_list)

        close_btn = QPushButton("Cerrar Núcleo")
        close_btn.setFixedHeight(34)
        close_btn.setStyleSheet(f"""
            QPushButton {{
                background: {C_GLASS_T1_BG};
                color: {C_TEXT_TERTIARY};
                border: 1px solid {C_GLASS_T1_BORDER};
                border-radius: 8px;
                font-size: 11px;
                font-family: 'Consolas', monospace;
            }}
            QPushButton:hover {{ border-color: {C_ACCENT_CYAN_BRIGHT}; }}
        """)
        close_btn.clicked.connect(self.close)
        v.addWidget(close_btn)

    def _set_aspect(self, aspect: str, btn: QPushButton):
        set_aspect(aspect)
        self.orb.set_aspect(aspect)
        for i in range(self.evo_list.layout().count()):
            pass  # no-op, buttons handle own state
        # Refresh checked state
        for b in self.findChildren(QPushButton):
            if b.text().lower().replace(" ", "_") == aspect:
                b.setChecked(True)
            elif b.text().lower().replace(" ", "_") in ("ciel", "raphael", "gran sabio", "fused"):
                b.setChecked(False)
        self._append_osd(f"Aspecto del núcleo: {aspect.title()}")

    def _refresh(self):
        # Limpiar cadenas
        while self.evo_layout.count():
            item = self.evo_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()
        # Render cadenas
        for key, chain in EVOLUTION_CHAINS.items():
            row = QHBoxLayout()
            name_lbl = QLabel(chain["name"])
            name_lbl.setStyleSheet(f"color: {C_TEXT_PRIMARY}; font-size: 11px; font-weight: bold; min-width: 150px;")
            row.addWidget(name_lbl)
            desc = QLabel(chain["desc"])
            desc.setStyleSheet(f"color: {C_TEXT_SECONDARY}; font-size: 10px;")
            row.addWidget(desc)
            row.addStretch()
            if chain["next"]:
                nxt = EVOLUTION_CHAINS[chain["next"]]["name"]
                arrow = QLabel(f"→ {nxt}")
                arrow.setStyleSheet(f"color: {C_ACCENT_CYAN_BRIGHT}; font-size: 10px; font-weight: bold;")
                row.addWidget(arrow)
            else:
                done = QLabel("ÚLTIMA")
                done.setStyleSheet(f"color: {C_SUCCESS}; font-size: 9px; font-weight: bold;")
                row.addWidget(done)
            wrow = QWidget()
            wrow.setLayout(row)
            wrow.setStyleSheet(f"""
                QWidget {{ background: {C_GLASS_T2_BG}; border: 1px solid {C_GLASS_T2_BORDER}; border-radius: 8px; padding: 6px; }}
            """)
            self.evo_layout.addWidget(wrow)

        # Lista de skills
        result = self.va.send({"type": "list_skills", "id": "skills"})
        skills = result.get("skills", []) if result.get("status") == "ok" else []
        self.skills_list.clear()
        for s in skills[:30]:
            name = s.get('name', '?')
            category = s.get('category', '')
            item = QListWidgetItem(f"{name}  [{category}]")
            self.skills_list.addItem(item)

    def _do_sacrifice(self):
        # Sacrifice simple: tentar evolucionar la primera cadena disponible
        for key, chain in EVOLUTION_CHAINS.items():
            cost = chain["sacrifice_cost"]
            if cost:
                result = self.va.send({
                    "type": "skill",
                    "skill": "media_extract_all",
                    "params": {"url": ""}
                }) if False else None
                # Simular sacrifice (lógica real está en el núcleo Python)
                self._append_osd(f"Sacrifice: {chain['name']} → {chain['next'] or 'completa'}")
                self.orb.set_state("responding")
                QTimer.singleShot(1200, lambda: self.orb.set_state("idle"))
                self._refresh()
                return
        self._append_osd("No hay sacrifice disponible en este momento")

    def _append_osd(self, message: str):
        if hasattr(self, '_osd') and self._osd:
            self._osd.notify(message)

    def showEvent(self, event):
        super().showEvent(event)
        self._refresh()


class MemoryPanel(QWidget):
    """Panel de memoria: ver, buscar, fijar, borrar y exportar las 5 capas.

    La memoria SQLite vive en el proceso (SQLite + FTS5, sin red ni puertos).
    Apagada por defecto con ARIA_MEMORY_SQLITE; este panel la puede encender
    en caliente. El JSONL de siempre sigue siendo la fuente de verdad.
    """

    CAPAS = ("reglas", "hechos", "experiencias", "observaciones", "modelos")

    def __init__(self, va: VAAdapter, parent=None):
        super().__init__(parent)
        self.va = va
        self._entries = []
        self._setup_ui()
        self._refresh()

    # -- interfaz ------------------------------------------------------------
    def _setup_ui(self):
        self.setWindowTitle("◆ Memoria de ARIA")
        self.setFixedSize(820, 640)
        self.setWindowFlags(Qt.Window)
        self.setStyleSheet(f"""
            QWidget {{
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 {C_BG_DARK_0}, stop:1 {C_BG_DARK_1});
                border: 1px solid {C_GLASS_T1_BORDER};
                border-radius: 18px;
            }}
            QLabel {{ color: {C_TEXT_MAIN}; font-family: 'Consolas', monospace; }}
            QPushButton {{
                background: {C_GLASS_T2_BG};
                color: {C_TEXT_SECONDARY};
                border: 1px solid {C_GLASS_T2_BORDER};
                border-radius: 8px;
                padding: 6px 10px;
                font-size: 11px;
                font-family: 'Consolas', monospace;
                
            }}
            QPushButton:hover {{
                border-color: {C_ACCENT_CYAN_BRIGHT};
                color: {C_TEXT_PRIMARY};
            }}
            QPushButton:disabled {{ color: #484c68; border-color: rgba(255, 255, 255,0.05); }}
            QLineEdit, QComboBox {{
                background: {C_GLASS_T2_BG};
                color: {C_TEXT_SECONDARY};
                border: 1px solid {C_GLASS_T2_BORDER};
                border-radius: 8px;
                padding: 6px 8px;
                font-size: 11px;
                font-family: 'Consolas', monospace;
            }}
            QComboBox QAbstractItemView {{
                background: {C_BG_MID};
                color: {C_TEXT_SECONDARY};
                selection-background-color: {C_ACCENT_CYAN_BRIGHT}55;
            }}
            QTableWidget {{
                background: {C_GLASS_T1_BG};
                color: {C_TEXT_SECONDARY};
                border: 1px solid {C_GLASS_T1_BORDER};
                border-radius: 10px;
                gridline-color: {C_GLASS_T1_BORDER};
                font-family: 'Consolas', monospace;
                font-size: 11px;
            }}
            QHeaderView::section {{
                background: {C_GLASS_T2_BG};
                color: {C_ACCENT_CYAN_BRIGHT};
                border: none;
                border-bottom: 1px solid {C_GLASS_T1_BORDER};
                padding: 5px;
                font-size: 10px;
            }}
            QTableWidget::item:selected {{
                background: {C_ACCENT_CYAN_BRIGHT}33;
                color: {C_TEXT_PRIMARY};
            }}
        """)
        v = QVBoxLayout(self)
        v.setContentsMargins(20, 20, 20, 20)
        v.setSpacing(10)

        header = QHBoxLayout()
        title = QLabel("◆ Memoria de ARIA")
        title.setStyleSheet(f"color: {C_ACCENT_CYAN_BRIGHT}; font-size: 16px; font-weight: bold; letter-spacing: 2px;")
        header.addWidget(title)
        header.addSpacing(8)
        self.state_lbl = QLabel("—")
        self.state_lbl.setStyleSheet(f"color: {C_TEXT_TERTIARY}; font-size: 11px;")
        header.addWidget(self.state_lbl)
        header.addStretch()
        self.toggle_btn = QPushButton("Encender memoria")
        self.toggle_btn.setToolTip("Activa o desactiva la memoria SQLite en este proceso")
        self.toggle_btn.clicked.connect(self._toggle)
        header.addWidget(self.toggle_btn)
        v.addLayout(header)

        sub = QLabel("5 capas · SQLite + FTS5 · sin red, sin puertos, en este proceso")
        sub.setStyleSheet(f"color: {C_TEXT_SECONDARY}; font-size: 11px;")
        v.addWidget(sub)

        # Fila de busqueda
        search_row = QHBoxLayout()
        self.capa_combo = QComboBox()
        self.capa_combo.addItem("Todas las capas", "")
        for capa in self.CAPAS:
            self.capa_combo.addItem(capa, capa)
        self.capa_combo.addItem("Sesión (volátil)", "sesion")
        self.capa_combo.setFixedWidth(150)
        self.capa_combo.currentIndexChanged.connect(self._refresh)
        search_row.addWidget(self.capa_combo)

        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Buscar en la memoria (FTS5)...")
        self.search_input.returnPressed.connect(self._search)
        search_row.addWidget(self.search_input, 1)

        search_btn = QPushButton("Buscar")
        search_btn.clicked.connect(self._search)
        search_row.addWidget(search_btn)

        refresh_btn = QPushButton("Refrescar")
        refresh_btn.clicked.connect(self._refresh)
        search_row.addWidget(refresh_btn)
        v.addLayout(search_row)

        # Fila de alta manual: escribir un recuerdo y guardarlo en la memoria
        new_row = QHBoxLayout()
        self.new_input = QLineEdit()
        self.new_input.setPlaceholderText("Escribe un recuerdo y guardalo en la memoria...")
        self.new_input.returnPressed.connect(self._guardar)
        new_row.addWidget(self.new_input, 1)
        self.new_capa_combo = QComboBox()
        for capa in self.CAPAS:
            self.new_capa_combo.addItem(capa, capa)
        self.new_capa_combo.setCurrentIndex(max(0, self.CAPAS.index("hechos")))
        self.new_capa_combo.setFixedWidth(130)
        new_row.addWidget(self.new_capa_combo)
        self.new_conf_combo = QComboBox()
        for conf in ("usuario", "sistema", "web"):
            self.new_conf_combo.addItem(conf, conf)
        self.new_conf_combo.setFixedWidth(100)
        new_row.addWidget(self.new_conf_combo)
        self.guardar_btn = QPushButton("Guardar")
        self.guardar_btn.setToolTip("Guarda el texto en la capa elegida")
        self.guardar_btn.clicked.connect(self._guardar)
        new_row.addWidget(self.guardar_btn)
        v.addLayout(new_row)

        self.counts_lbl = QLabel("")
        self.counts_lbl.setStyleSheet(f"color: {C_TEXT_TERTIARY}; font-size: 10px;")
        v.addWidget(self.counts_lbl)

        # Tabla de entradas
        self.table = QTableWidget(0, 5)
        self.table.setHorizontalHeaderLabels(["Capa", "Texto", "Fuente", "Confianza", "Evid."])
        self.table.verticalHeader().setVisible(False)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setSelectionMode(QTableWidget.SingleSelection)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.ResizeToContents)
        self.table.horizontalHeader().setSectionResizeMode(4, QHeaderView.ResizeToContents)
        v.addWidget(self.table, 1)

        # Acciones
        actions = QHBoxLayout()
        self.fijar_btn = QPushButton("Fijar como regla")
        self.fijar_btn.setToolTip("Copia la entrada seleccionada a la capa 'reglas'")
        self.fijar_btn.clicked.connect(self._fijar)
        actions.addWidget(self.fijar_btn)

        self.borrar_btn = QPushButton("Borrar")
        self.borrar_btn.setToolTip("Borra la entrada seleccionada de la memoria")
        self.borrar_btn.clicked.connect(self._borrar)
        actions.addWidget(self.borrar_btn)

        self.consolidar_btn = QPushButton("Consolidar")
        self.consolidar_btn.setToolTip("Promueve las observaciones repetidas a 'modelos' (sin LLM)")
        self.consolidar_btn.clicked.connect(self._consolidar)
        actions.addWidget(self.consolidar_btn)

        self.exportar_btn = QPushButton("Exportar")
        self.exportar_btn.setToolTip("Guarda la memoria en un JSON")
        self.exportar_btn.clicked.connect(self._exportar)
        actions.addWidget(self.exportar_btn)

        self.importar_btn = QPushButton("Importar")
        self.importar_btn.setToolTip("Importa un archivo de memoria (JSON o JSONL)")
        self.importar_btn.clicked.connect(self._importar)
        actions.addWidget(self.importar_btn)

        actions.addStretch()
        close_btn = QPushButton("Cerrar")
        close_btn.clicked.connect(self.close)
        actions.addWidget(close_btn)
        v.addLayout(actions)

        # Acciones de sesion: recuerdos volatiles de esta sesion
        session_row = QHBoxLayout()
        self.recordar_btn = QPushButton("Recordar (sesión)")
        self.recordar_btn.setToolTip("Guarda el texto (o la entrada seleccionada) como recuerdo de esta sesión")
        self.recordar_btn.clicked.connect(self._recordar)
        session_row.addWidget(self.recordar_btn)

        self.vaciar_sesion_btn = QPushButton("Vaciar sesión")
        self.vaciar_sesion_btn.setToolTip("Borra los recuerdos de esta sesión")
        self.vaciar_sesion_btn.clicked.connect(self._vaciar_sesion)
        session_row.addWidget(self.vaciar_sesion_btn)

        self.importar_chat_btn = QPushButton("Importar charlar")
        self.importar_chat_btn.setToolTip("Importa el historial de conversaciones como experiencias")
        self.importar_chat_btn.clicked.connect(self._importar_chat)
        session_row.addWidget(self.importar_chat_btn)

        session_row.addStretch()
        self.session_lbl = QLabel("0 recuerdo(s) de sesión")
        self.session_lbl.setStyleSheet(f"color: {C_TEXT_TERTIARY}; font-size: 10px;")
        session_row.addWidget(self.session_lbl)
        v.addLayout(session_row)

        actions.addStretch()
        close_btn = QPushButton("Cerrar")
        close_btn.clicked.connect(self.close)
        actions.addWidget(close_btn)
        v.addLayout(actions)

    # -- datos ---------------------------------------------------------------
    def _capas_de(self, counts: dict) -> str:
        if not counts:
            return "sin entradas"
        return " · ".join(f"{c}: {counts.get(c, 0)}" for c in self.CAPAS)

    def _fill(self, entries, counts=None, enabled=None):
        self._entries = list(entries or [])
        self.table.setRowCount(len(self._entries))
        for row, e in enumerate(self._entries):
            texto = str(e.get("texto", ""))
            if len(texto) > 180:
                texto = texto[:177] + "..."
            valores = [
                str(e.get("capa", "")),
                texto,
                str(e.get("fuente", "") or ""),
                str(e.get("confianza", "") or ""),
                str(e.get("evidencia", "") or ""),
            ]
            for col, valor in enumerate(valores):
                item = QTableWidgetItem(valor)
                if col == 0:
                    item.setData(Qt.UserRole, {"capa": e.get("capa", ""), "id": e.get("id")})
                self.table.setItem(row, col, item)
        if counts is not None:
            self.counts_lbl.setText(self._capas_de(counts))
        if enabled is not None:
            self._set_state(enabled)

    def _set_state(self, enabled: bool):
        if enabled:
            self.state_lbl.setText("● Activa")
            self.state_lbl.setStyleSheet(f"color: {C_SUCCESS}; font-size: 11px;")
            self.toggle_btn.setText("Apagar memoria")
        else:
            self.state_lbl.setText("○ Inactiva")
            self.state_lbl.setStyleSheet(f"color: {C_TEXT_TERTIARY}; font-size: 11px;")
            self.toggle_btn.setText("Encender memoria")

    def _refresh(self):
        capa = self.capa_combo.currentData() or ""
        self._refresh_session_label()
        if capa == "sesion":
            result = self.va.send({"type": "memory_session_list", "data": {}})
            entries = result.get("entries", []) if result.get("status") == "ok" else []
            self._fill(entries, None, None)
            self.counts_lbl.setText(f"{len(entries)} recuerdo(s) de esta sesion (volatil)")
            return
        result = self.va.send({"type": "memory_list", "data": {"capa": capa, "limite": 200}})
        if result.get("status") != "ok":
            self._fill([], {}, False)
            return
        self._fill(result.get("entries", []), result.get("counts", {}),
                   bool(result.get("enabled")))

    def _refresh_session_label(self):
        """Actualiza el contador de recuerdos de sesion (es una llamada en proceso)."""
        try:
            result = self.va.send({"type": "memory_session_list", "data": {}})
            n = len(result.get("entries", []) or []) if result.get("status") == "ok" else 0
        except Exception:
            n = 0
        self.session_lbl.setText(f"{n} recuerdo(s) de sesion")

    def _search(self):
        consulta = self.search_input.text().strip()
        if not consulta:
            self._refresh()
            return
        result = self.va.send({"type": "memory_recall", "data": {"consulta": consulta, "k": 100}})
        if result.get("status") != "ok":
            return
        hits = result.get("hits", [])
        self._fill(hits, None, None)
        self.counts_lbl.setText(f"{len(hits)} resultado(s) para: {consulta}")

    # -- acciones ------------------------------------------------------------
    def _selected(self):
        items = self.table.selectedItems()
        if not items:
            return None
        row = items[0].row()
        if row >= len(self._entries):
            return None
        return self._entries[row]

    def _toggle(self):
        enabled = self.va.send({"type": "memory_toggle", "data": {}})
        activo = bool(enabled.get("enabled")) if enabled.get("status") == "ok" else False
        self._set_state(activo)
        self._refresh()

    def _fijar(self):
        entry = self._selected()
        if entry is None:
            self._notify("Selecciona una entrada para fijarla como regla")
            return
        texto = str(entry.get("texto", "")).strip()
        if not texto:
            self._notify("La entrada esta vacia")
            return
        result = self.va.send({"type": "memory_fijar", "data": {"texto": texto}})
        if result.get("status") == "ok" and result.get("id"):
            self._notify("Fijada como regla")
        else:
            self._notify("No se pudo fijar (texto vacio o con credenciales)")
        self._refresh()

    def _borrar(self):
        entry = self._selected()
        if entry is None:
            self._notify("Selecciona una entrada para borrarla")
            return
        capa = str(entry.get("capa", ""))
        id_ = entry.get("id")
        reply = QMessageBox.question(
            self, "Borrar de la memoria",
            f"¿Borrar esta entrada de '{capa}'?\n\n{str(entry.get('texto', ''))[:160]}",
            QMessageBox.Yes | QMessageBox.No,
        )
        if reply != QMessageBox.Yes:
            return
        result = self.va.send({"type": "memory_borrar", "data": {"capa": capa, "id": id_}})
        if result.get("status") == "ok" and result.get("deleted"):
            self._notify("Entrada borrada")
        else:
            self._notify("No se pudo borrar")
        self._refresh()

    def _consolidar(self):
        result = self.va.send({"type": "memory_reflect", "data": {}})
        if result.get("status") == "ok":
            self._notify(f"{result.get('promoted', 0)} observacion(es) promovida(s) a modelos")
        self._refresh()

    def _exportar(self):
        result = self.va.send({"type": "memory_export", "data": {}})
        if result.get("status") != "ok":
            self._notify("No se pudo exportar")
            return
        entries = result.get("entries", [])
        if not entries:
            self._notify("No hay nada que exportar")
            return
        import datetime

        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        ruta, _ = QFileDialog.getSaveFileName(
            self, "Exportar memoria",
            f"ARIA_memoria_{ts}.json", "JSON (*.json)",
        )
        if not ruta:
            return
        try:
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(entries, f, ensure_ascii=False, indent=2)
            self._notify(f"Memoria exportada a {ruta}")
        except Exception as exc:
            self._notify(f"Error exportando: {exc}")

    def _guardar(self):
        """Alta manual: guarda el texto escrito en la capa elegida."""
        texto = self.new_input.text().strip()
        if not texto:
            self._notify("Escribe el texto que quieres guardar")
            return
        capa = self.new_capa_combo.currentData() or "hechos"
        confianza = self.new_conf_combo.currentData() or "usuario"
        result = self.va.send({
            "type": "memory_add",
            "data": {
                "texto": texto,
                "capa": capa,
                "fuente": "usuario",
                "confianza": confianza,
            },
        })
        if result.get("status") == "ok" and result.get("id"):
            self._notify(f"Guardado en '{capa}'")
            self.new_input.clear()
        else:
            self._notify("No se pudo guardar (texto vacio o con credenciales)")
        self._refresh()

    def _importar(self):
        """Importa un archivo de memoria (JSON o JSONL) elegido por el usuario."""
        ruta, _ = QFileDialog.getOpenFileName(
            self, "Importar memoria", "",
            "Memoria (*.json *.jsonl *.txt);;JSON (*.json);;JSONL (*.jsonl);;Todos (*.*)",
        )
        if not ruta:
            return
        result = self.va.send({"type": "memory_import", "data": {"ruta": ruta}})
        self._import_ok(result, os.path.basename(ruta))

    def _importar_chat(self):
        """Importa el historial de conversaciones como experiencias."""
        result = self.va.send({"type": "memory_import", "data": {"ruta": ""}})
        self._import_ok(result, "las conversaciones")

    def _import_ok(self, result, origen):
        if result.get("status") != "ok":
            self._notify(f"No se pudo importar: {result.get('error', 'error desconocido')}")
            return
        importadas = int(result.get("importadas", 0) or 0)
        omitidas = int(result.get("omitidas", 0) or 0)
        duplicadas = int(result.get("duplicadas", 0) or 0)
        if not importadas and result.get("error"):
            self._notify(f"No se pudo importar: {result.get('error')}")
            return
        extra = ""
        if omitidas:
            extra += f" ({omitidas} omitida(s))"
        if duplicadas:
            extra += f" ({duplicadas} ya existia(n))"
        self._notify(f"Importadas {importadas} entrada(s) de {origen}{extra}")
        self._refresh()

    def _recordar(self):
        """Guarda un recuerdo de esta sesion (volatil)."""
        texto = self.new_input.text().strip()
        if not texto:
            entry = self._selected()
            texto = str(entry.get("texto", "")).strip() if entry else ""
        if not texto:
            self._notify("Escribe un texto o selecciona una entrada para recordar")
            return
        result = self.va.send({"type": "memory_session_add", "data": {"texto": texto}})
        if result.get("status") == "ok" and result.get("id"):
            self._notify("Recordado en esta sesion")
        else:
            self._notify("No se pudo recordar")
        self._refresh()

    def _vaciar_sesion(self):
        result = self.va.send({"type": "memory_session_clear", "data": {}})
        if result.get("status") == "ok":
            self._notify(f"{result.get('cleared', 0)} recuerdo(s) de sesion borrados")
        self._refresh()

    def _notify(self, message: str):
        try:
            parent = self.parent()
            osd = getattr(parent, "_osd", None) if parent is not None else None
            if osd is not None:
                osd.notify(message)
                return
        except Exception:
            pass
        self.state_lbl.setToolTip(message)


class OSDNotification(QLabel):
    """Notificación estilo OSD que aparece sobre el orb y se desvanece."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAlignment(Qt.AlignCenter)
        self.setStyleSheet(f"""
            QLabel {{
                background: {C_GLASS_T1_BG};
                color: {C_TEXT_PRIMARY};
                border: 1px solid {C_GLASS_T1_BORDER};
                border-radius: 10px;
                padding: 10px 18px;
                font-size: 12px;
                font-weight: bold;
                font-family: 'Consolas', monospace;
                
            }}
        """)
        self.setWordWrap(True)
        self.hide()
        self._fade_timer = QTimer(self)
        self._fade_timer.timeout.connect(self._fade_step)
        self._opacity = 1.0

    def notify(self, message: str, color: str = C_ACCENT_CYAN_BRIGHT):
        self.setText(message)
        self.setStyleSheet(self.styleSheet().replace(C_TEXT_PRIMARY, color))
        # Centrar sobre el padre
        if self.parent():
            p = self.parent()
            self.move(p.width() // 2 - self.width() // 2, p.height() // 3)
        self.show()
        self.raise_()
        self._opacity = 1.0
        self._fade_timer.start(40)

    def _fade_step(self):
        self._opacity -= 0.05
        if self._opacity <= 0:
            self._fade_timer.stop()
            self.hide()
            self._opacity = 1.0
            self.setStyleSheet(self.styleSheet().replace(
                f"color: {C_ACCENT_CYAN_BRIGHT};", f"color: {C_TEXT_PRIMARY};"))
        else:
            self.setGraphicsEffect(None)
            from PyQt5.QtWidgets import QGraphicsOpacityEffect
            eff = QGraphicsOpacityEffect()
            eff.setOpacity(self._opacity)
            self.setGraphicsEffect(eff)


# ── Main Application ────────────────────────────────────────────────────────

# ── Linux Desktop Shell (43PR-style) ──────────────────────────────────────────
class LinuxDesktopWindow(QMainWindow):
    response_received = pyqtSignal(dict)
    aria_says = pyqtSignal(str)

    def __init__(self, va: VAAdapter):
        super().__init__()
        self.va = va
        self._old_pos = None
        self._dragging = False
        self._grad_phase = 0
        self._setup_linux_ui()
        self._setup_keyboard_shortcuts()
        self._start_clock()
        self._start_anim()
        self._start_monitor()
        self.apply_theme("cyberpunk")

    def _setup_linux_ui(self):
        self.setWindowTitle("ARIA Linux Desktop")
        self.resize(1280, 800)
        self.setWindowFlags(Qt.FramelessWindowHint)
        self.setStyleSheet("""
            QMainWindow { background: #0a0b14; }
            QWidget { font-family: 'Segoe UI', sans-serif; color: #f3e1b5; }
            QLabel { color: #f3e1b5; }
            QPushButton {
                background: rgba(225, 182, 75,0.08); color: #e1b64b;
                border: 1px solid rgba(225, 182, 75,0.35); border-radius: 10px;
                padding: 6px 12px; font-weight: 600;
            }
            QPushButton:hover { background: rgba(225, 182, 75,0.18); border-color: #e1b64b; }
            QLineEdit, QTextEdit {
                background: rgba(10, 11, 20,0.7); color: #f3e1b5;
                border: 1px solid rgba(225, 182, 75,0.25); border-radius: 10px;
                padding: 8px; font-family: 'Consolas', monospace;
            }
            QLineEdit:focus, QTextEdit:focus { border-color: #ec6c9f; }
        """)
        central = QWidget()
        central.setObjectName("linuxCentral")
        root = QVBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # Top panel
        top = QWidget()
        top.setFixedHeight(34)
        top.setStyleSheet("background: rgba(10, 11, 20,0.85); border-bottom: 1px solid rgba(225, 182, 75,0.3);")
        tl = QHBoxLayout(top)
        tl.setContentsMargins(12, 4, 12, 4)
        brand = QLabel("ARIA  \u2022  Linux Desktop")
        brand.setStyleSheet("color:#e1b64b; font-weight:700; font-size:13px;")
        tl.addWidget(brand)
        tl.addStretch()
        self._clock = QLabel("")
        self._clock.setStyleSheet("color:#ec6c9f; font-weight:600; font-size:13px;")
        tl.addWidget(self._clock)
        tl.addStretch()
        for ico in ("\u266A", "\u2630", "\u25CF"):
            l = QLabel(ico)
            l.setStyleSheet("color:#ebd089; font-size:14px; padding:0 6px;")
            tl.addWidget(l)
        root.addWidget(top)

        # Body: dock + content
        body = QHBoxLayout()
        body.setContentsMargins(0, 0, 0, 0)
        body.setSpacing(0)

        # Left dock
        dock = QWidget()
        dock.setFixedWidth(68)
        dock.setStyleSheet("background: rgba(10, 11, 20,0.7); border-right: 1px solid rgba(225, 182, 75,0.2);")
        dl = QVBoxLayout(dock)
        dl.setContentsMargins(8, 12, 8, 12)
        dl.setSpacing(10)
        for ico, tip in (("\u2302", "Chat"), ("\u2630", "Memoria"), ("\u2699", "Skills"), ("\u2605", "Orb")):
            b = QPushButton(ico)
            b.setToolTip(tip)
            b.setFixedSize(52, 52)
            b.setStyleSheet("font-size:20px; border-radius:14px;")
            dl.addWidget(b)
        dl.addStretch()
        body.addWidget(dock)

        # Content area
        content = QWidget()
        cl = QVBoxLayout(content)
        cl.setContentsMargins(16, 16, 16, 16)
        cl.setSpacing(12)
        self._orb = OrbWidget()
        self._orb.setFixedSize(120, 120)
        cl.addWidget(self._orb, 0, Qt.AlignHCenter)
        self._chat = QTextEdit()
        self._chat.setReadOnly(True)
        cl.addWidget(self._chat, 1)
        row = QHBoxLayout()
        self._input = QLineEdit()
        self._input.setPlaceholderText("Escribe a ARIA...")
        row.addWidget(self._input, 1)
        send = QPushButton("Enviar")
        send.clicked.connect(self._send)
        row.addWidget(send)
        cl.addLayout(row)
        body.addWidget(content, 1)

        # Right panel: system monitor + launcher
        right = QWidget()
        right.setFixedWidth(200)
        right.setStyleSheet("background: rgba(10, 11, 20,0.7); border-left: 1px solid rgba(225, 182, 75,0.2);")
        rl = QVBoxLayout(right)
        rl.setContentsMargins(10, 12, 10, 12)
        rl.setSpacing(8)
        mon_title = QLabel("Sistema")
        mon_title.setStyleSheet("color:#e1b64b; font-weight:700; font-size:12px;")
        rl.addWidget(mon_title)
        self._cpu_bar = QLabel("CPU: --%")
        self._ram_bar = QLabel("RAM: --%")
        self._disk_bar = QLabel("DISK: --%")
        for lbl in (self._cpu_bar, self._ram_bar, self._disk_bar):
            lbl.setStyleSheet("color:#f3e1b5; font-size:11px; font-family:'Consolas';")
            rl.addWidget(lbl)
        rl.addSpacing(8)
        launch_title = QLabel("Lanzador")
        launch_title.setStyleSheet("color:#ec6c9f; font-weight:700; font-size:12px;")
        rl.addWidget(launch_title)
        for name, cmd in (("Terminal", "cmd"), ("Explorador", "explorer"), ("Navegador", "start msedge")):
            b = QPushButton(name)
            b.clicked.connect(lambda checked, c=cmd: __import__("subprocess").Popen(c, shell=True))
            rl.addWidget(b)
        rl.addStretch()
        body.addWidget(right)

        root.addLayout(body, 1)

        self.setCentralWidget(central)
        self._input.returnPressed.connect(self._send)

    def _start_clock(self):
        self._clk = QTimer(self)
        self._clk.timeout.connect(self._tick_clock)
        self._clk.start(1000)
        self._tick_clock()

    def _tick_clock(self):
        from datetime import datetime
        self._clock.setText(datetime.now().strftime("%a %d %b  %H:%M:%S"))

    def _start_anim(self):
        self._anim = QTimer(self)
        self._anim.timeout.connect(self._tick_anim)
        self._anim.start(60)

    def _tick_anim(self):
        self._grad_phase = (self._grad_phase + 1) % 360
        import colorsys
        h = self._grad_phase / 360.0
        r, g, b = colorsys.hsv_to_rgb(h, 0.25, 0.12)
        c1 = "#%02x%02x%02x" % (int(r*255), int(g*255), int(b*255))
        r2, g2, b2 = colorsys.hsv_to_rgb((h+0.5)%1.0, 0.3, 0.08)
        c2 = "#%02x%02x%02x" % (int(r2*255), int(g2*255), int(b2*255))
        w = self.centralWidget()
        if w:
            w.setStyleSheet(f"background: qradialgradient(cx:0.5,cy:0.5,radius:1, stop:0 {c1}, stop:1 {c2});")

    def _start_monitor(self):
        try:
            import psutil
            self._psutil = psutil
        except Exception:
            self._psutil = None
        self._mon = QTimer(self)
        self._mon.timeout.connect(self._tick_monitor)
        self._mon.start(2000)
        self._tick_monitor()

    def _tick_monitor(self):
        if getattr(self, "_psutil", None) is None:
            return
        p = self._psutil
        cpu = p.cpu_percent(interval=None)
        mem = p.virtual_memory().percent
        try:
            disk = p.disk_usage("C:\\").percent
        except Exception:
            disk = 0.0
        self._cpu_bar.setText(f"CPU:  {cpu:5.1f}%")
        self._ram_bar.setText(f"RAM:  {mem:5.1f}%")
        self._disk_bar.setText(f"DISK: {disk:5.1f}%")

    def _setup_keyboard_shortcuts(self):
        QShortcut(QKeySequence("Escape"), self).activated.connect(self.close)

    def _send(self):
        text = self._input.text().strip()
        if not text:
            return
        self._input.clear()
        if text.lower().startswith("tema "):
            name = text[5:].strip()
            try:
                r = self.va.skills.run("set_theme", {"name": name})
                self.apply_theme(r.get("theme", name))
                self._chat.append(f"ARIA: Tema cambiado a {r.get('theme')}")
            except Exception as e:
                self._chat.append(f"[error] {e}")
            return
        self._chat.append(f"> {text}")
        try:
            r = self.va.send(text)
            self._chat.append(f"ARIA: {r.get('reply', r)}")
        except Exception as e:
            self._chat.append(f"[error] {e}")

    def apply_theme(self, name):
        if get_theme is None:
            return
        t = get_theme(name)
        self.setStyleSheet(f"""
            QMainWindow {{ background: {t['bg0']}; }}
            QWidget {{ font-family: 'Segoe UI', sans-serif; color: {t['text']}; }}
            QLabel {{ color: {t['text']}; }}
            QPushButton {{
                background: {t['glass']}; color: {t['accent']};
                border: 1px solid {t['border']}; border-radius: 10px;
                padding: 6px 12px; font-weight: 600;
            }}
            QPushButton:hover {{ background: {t['glass']}; border-color: {t['accent']}; }}
            QLineEdit, QTextEdit {{
                background: {t['glass']}; color: {t['text']};
                border: 1px solid {t['border']}; border-radius: 10px;
                padding: 8px; font-family: 'Consolas', monospace;
            }}
            QLineEdit:focus, QTextEdit:focus {{ border-color: {t['accent2']}; }}
        """)
        central = self.centralWidget()
        if central:
            central.setStyleSheet(f"background: qlineargradient(x1:0,y1:0,x2:1,y2:1, stop:0 {t['bg0']}, stop:0.5 {t['bg1']}, stop:1 {t['bg2']});")


def run_desktop():
    import os as _os
    print("[UI] Starting QApplication...", flush=True)
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    app.setQuitOnLastWindowClosed(False)
    # Apply fusion dark palette
    from PyQt5.QtGui import QPalette, QColor
    palette = QPalette()
    palette.setColor(QPalette.Window, QColor(19, 21, 38))
    palette.setColor(QPalette.WindowText, QColor(243, 226, 183))
    palette.setColor(QPalette.Base, QColor(19, 21, 38))
    palette.setColor(QPalette.AlternateBase, QColor(29, 33, 60))
    palette.setColor(QPalette.ToolTipBase, QColor(29, 33, 60))
    palette.setColor(QPalette.ToolTipText, QColor(243, 226, 183))
    palette.setColor(QPalette.Text, QColor(243, 226, 183))
    palette.setColor(QPalette.Button, QColor(29, 33, 60))
    palette.setColor(QPalette.ButtonText, QColor(243, 226, 183))
    palette.setColor(QPalette.BrightText, QColor(245, 158, 11))
    palette.setColor(QPalette.Highlight, QColor(229, 192, 100))
    palette.setColor(QPalette.HighlightedText, QColor(19, 21, 38))
    app.setPalette(palette)
    print("[UI] QApplication created", flush=True)

    va = VAAdapter()
    print("[UI] VA local iniciado", flush=True)

    try:
        from ui_shell import crear_shell
        window = crear_shell(responder=lambda t, on_token=None: va.send(
            {"type": "chat", "data": {"message": t}}, on_token=on_token).get("response", ""),
            skills=va.send({"type": "list_skills"}).get("skills", []),
            runner_skill=lambda sid, params: va.send(
                {"type": "skill", "skill": sid, "data": {"params": params}}).get("result", {}))
        print("[UI] ui_shell creado", flush=True)
    except Exception as e:
        print(f"[UI] ui_shell fallo, fallback: {e}", flush=True)
        if _os.environ.get("ARIA_LINUX_DESKTOP") == "1":
            window = LinuxDesktopWindow(va)
        else:
            window = ChatWindow(va)
    print("[UI] Window created", flush=True)

    # ---- modo silencioso + bandeja del sistema ----
    silencioso = _os.environ.get("ARIA_SILENCIOSO", "").strip().lower() in (
        "1", "on", "true", "si", "sí", "yes")
    bandeja_sys = None
    try:
        from bandeja_sistema import BandejaARIA
        bandeja_sys = BandejaARIA(window, app)
        if bandeja_sys.arrancar():
            window._bandeja_sistema = bandeja_sys
            print("[UI] Bandeja activa (tray_visible=%s)" % bandeja_sys.activa(), flush=True)
        else:
            print("[UI] Bandeja NO disponible en este sistema", flush=True)
            bandeja_sys = None
    except Exception as e:
        print("[UI] Bandeja fallo: %s" % e, flush=True)
        bandeja_sys = None
    if silencioso and bandeja_sys is not None:
        print("[UI] Modo silencioso armado (la ventana no se mostrara al arrancar)", flush=True)
    try:
        import conversation_starters as cs
        window._append_chat("ARIA", cs.elegir_starter("Daniel"), C_ACCENT_CYAN_BRIGHT)
    except Exception:
        pass
    if not isinstance(window, LinuxDesktopWindow) and hasattr(window, "load_skills"):
        window.load_skills()
        print("[UI] Skills loaded", flush=True)

    # ---- Enlace ASAGI: mensajes que llegan del celular aparecen en el chat ----
    if va.brain is not None:
        def _enlace_cb_desktop(texto):
            texto = str(texto or "").strip()
            if not texto:
                return
            # Thread-safe: Shell usa cola + timer; ChatWindow usa senal pyqt
            if hasattr(window, "_bots_cola") and window._bots_cola is not None:
                window._bots_cola.put(lambda: window._linea("«ASAGI» %s" % texto, "aria"))
            elif hasattr(window, "aria_says"):
                window.aria_says.emit(texto)
            elif hasattr(window, "_append_chat"):
                window._append_chat("ARIA", "«ASAGI» %s" % texto, C_ACCENT_CYAN_BRIGHT)
        va.brain._enlace_cb = _enlace_cb_desktop
        print("[UI] Enlace ASAGI callback conectado", flush=True)

        # OSD notification overlay (sobre la ventana principal)
        osd = OSDNotification(window)
        window._osd = osd
        print("[UI] OSD notification created", flush=True)

        # Floating overlay orb (always-on-top mini widget)
        overlay = OverlayOrb(window)
        overlay.show()
        print("[UI] OverlayOrb created (80x80, always-on-top)", flush=True)

        # System tray
        tray_icon = QIcon.fromTheme("preferences-desktop-personal")
        if tray_icon.isNull():
            tray_icon = _make_tray_pixmap() if False else tray_icon

    if silencioso and bandeja_sys is not None:
        window.hide()
        print("[UI] MODO SILENCIOSO: ventana oculta (visible=%s), solo bandeja"
              % window.isVisible(), flush=True)
    else:
        window.show()
        print("[UI] Window shown, visible=%s" % window.isVisible(), flush=True)
    # 17-nov-2026 (revisión como usuario): aquí se abrían HUDs de la ARIA vieja que estorbaban:
    #   - «actividad» (el cuadro «0 COSAS HOY» en medio del escritorio) -> ahora: tarjetas de hoy del Shell
    #   - selector de «modos» flotante -> ahora: botón «Cuerpo» del Shell y «nivel» en el chat
    #   - ventana emergente de «resurgir» -> ahora: avisos del Shell
    #   - presence: OCULTABA a ARIA tras 5 min sin mover el mouse (parecía que se cerraba sola)
    #   - hand_react: encendía la cámara si había OpenCV (sin usarla para nada)
    # Ya no se crean. Los módulos siguen ahí por si algo los consulta (p. ej. modos.evolucion_actual()).

    sys.exit(app.exec_())


def _make_tray_pixmap():
    from PyQt5.QtGui import QPixmap, QPainter
    from PyQt5.QtCore import Qt
    pixmap = QPixmap(22, 22)
    pixmap.fill(Qt.transparent)
    p = QPainter(pixmap)
    p.setRenderHint(QPainter.Antialiasing)
    p.setBrush(QBrush(QColor(229, 192, 100)))
    p.setPen(Qt.NoPen)
    p.drawEllipse(1, 1, 20, 20)
    p.end()
    return pixmap


if __name__ == "__main__":
    run_desktop()
