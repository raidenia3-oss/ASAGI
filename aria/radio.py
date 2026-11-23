# -*- coding: utf-8 -*-
"""Radio de ARIA: estaciones sin anuncios de SomaFM (streams públicos, sin claves).
Idea tomada del video de "15 sitios web". Sin dependencias nuevas: usa ffplay (viene con el ffmpeg
ya aprobado) si está; si no, QMediaPlayer de PyQt5; y como último recurso el reproductor del sistema.
La parte que elige el canal es PURA y se prueba sin sonar.
  «pon radio» · «pon radio hacker» · «qué radio suena» · «otra radio» · «apaga la radio»"""
from __future__ import annotations

import os
import re
import shutil
import subprocess

_DIR = os.path.dirname(os.path.abspath(__file__))


def _u(cid):
    return "https://ice1.somafm.com/%s-128-mp3" % cid


def _pls(cid):
    return "https://api.somafm.com/%s.pls" % cid


CANALES = [
    {"id": "groovesalad", "titulo": "Groove Salad", "nota": "ambiental para concentrarte",
     "alias": ["ambiental", "ambiente", "concentrarme", "concentrar", "foco", "trabajar", "chill", "relajada", "relajante", "de fondo", "tranquila"]},
    {"id": "dronezone", "titulo": "Drone Zone", "nota": "ambiental profunda, para dormir",
     "alias": ["dormir", "profunda", "sueno", "descansar", "meditar"]},
    {"id": "spacestation", "titulo": "Space Station Soma", "nota": "electronica espacial",
     "alias": ["espacial", "espacio", "nave", "futurista"]},
    {"id": "secretagent", "titulo": "Secret Agent", "nota": "lounge de espias",
     "alias": ["lounge", "espia", "noir", "misterio"]},
    {"id": "lush", "titulo": "Lush", "nota": "voces suaves", "alias": ["voces", "suave", "mellow", "vocal"]},
    {"id": "defcon", "titulo": "DEF CON Radio", "nota": "electronica hacker",
     "alias": ["hacker", "defcon", "def con", "cyber", "codear", "programar"]},
    {"id": "fluid", "titulo": "Fluid", "nota": "future soul / hip hop instrumental",
     "alias": ["hip hop", "hiphop", "beats", "soul", "instrumental"]},
    {"id": "vaporwaves", "titulo": "Vaporwaves", "nota": "vaporwave retro",
     "alias": ["vaporwave", "retro", "synth", "ochentas", "80s"]},
    {"id": "sonicuniverse", "titulo": "Sonic Universe", "nota": "jazz moderno", "alias": ["jazz", "jazzy"]},
    {"id": "indiepop", "titulo": "Indie Pop Rocks!", "nota": "indie / alternativo", "alias": ["indie", "pop indie", "alternativo"]},
    {"id": "beatblender", "titulo": "Beat Blender", "nota": "downtempo electronico", "alias": ["downtempo", "groovy"]},
    {"id": "deepspaceone", "titulo": "Deep Space One", "nota": "ambient de espacio profundo", "alias": ["espacio profundo", "ambient", "drone"]},
]
for _c in CANALES:
    _c["url"] = _u(_c["id"])
    _c["pls"] = _pls(_c["id"])


def _norm(t):
    import unicodedata
    t = unicodedata.normalize("NFD", str(t or "").lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[¿?¡!.,;:\"«»]+", " ", t)).strip()


def buscar_canal(q):
    """Elige un canal por título, id o alias. PURA. -> dict o None."""
    k = _norm(q)
    if not k:
        return None
    for c in CANALES:
        if _norm(c["titulo"]) == k or c["id"] == k:
            return c
    for c in CANALES:
        if any(k == a or a in k for a in c["alias"]):
            return c
        if k in _norm(c["titulo"]):
            return c
    return None


def parsear(texto):
    """Interpreta el mensaje. PURA. -> ('apagar'|'estado'|'siguiente'|'poner', canal|None) o None."""
    n = _norm(texto)
    if re.match(r"^(?:apaga|quita|para|deten|corta|cierra|silencia)(?: la)? radio$", n):
        return ("apagar", None)
    if re.match(r"^(?:que radio(?: suena| es(?: esta)?| estoy escuchando)?|que estacion(?: es)?|en que radio estoy)$", n):
        return ("estado", None)
    if re.match(r"^(?:otra radio|siguiente radio|cambia(?: de)? radio|otra estacion)$", n):
        return ("siguiente", None)
    m = re.match(r"^(?:pon(?:me|le)?|dale|abre|quiero(?: escuchar)?|escuchemos|pon la) (?:la )?radio(?: de| para| en)? (.+)$", n)
    if m:
        return ("poner", buscar_canal(m.group(1)))
    if re.match(r"^(?:pon(?:me)?|dale|abre|quiero) (?:la )?radio$|^radio$", n):
        return ("poner", buscar_canal("ambiental"))
    m = re.match(r"^(?:pon(?:me)?|dale|quiero(?: escuchar)?|escuchemos) (?:algo|musica|sonido|un poco) (?:de |para |)?(ambiental|ambiente|para concentrarme|para dormir|para trabajar|de fondo|para estudiar|relajante|para codear|para programar)$", n)
    if m:
        return ("poner", buscar_canal(m.group(1)) or buscar_canal("ambiental"))
    return None


def _ffplay():
    r = shutil.which("ffplay")
    if r:
        return r
    try:
        import editor_video
        ff = editor_video.ffmpeg()
        if ff:
            cand = os.path.join(os.path.dirname(ff), "ffplay.exe" if os.name == "nt" else "ffplay")
            if os.path.isfile(cand):
                return cand
    except Exception:
        pass
    return None


class Reproductor:
    """Un solo stream a la vez. Prefiere ffplay (fiable para streams); si no, QMediaPlayer; si no, el sistema."""

    def __init__(self):
        self._proc = None
        self._qp = None
        self._actual = None

    def suena(self):
        return self._actual

    def apagar(self):
        if self._proc is not None:
            try:
                self._proc.terminate()
            except Exception:
                pass
            self._proc = None
        if self._qp is not None:
            try:
                self._qp.stop()
            except Exception:
                pass
            self._qp = None
        self._actual = None

    def poner(self, canal):
        """Pone un canal. -> modo usado ('ffplay'|'qt'|'sistema') o None si no pudo."""
        if not canal:
            return None
        self.apagar()
        self._actual = canal
        url = canal["url"]
        ff = _ffplay()
        if ff:
            try:
                flags = 0
                if os.name == "nt":
                    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
                self._proc = subprocess.Popen([ff, "-nodisp", "-autoexit", "-loglevel", "quiet", url],
                                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                              stdin=subprocess.DEVNULL, creationflags=flags)
                return "ffplay"
            except Exception:
                self._proc = None
        try:
            from PyQt5.QtMultimedia import QMediaPlayer, QMediaContent
            from PyQt5.QtCore import QUrl
            self._qp = QMediaPlayer()
            self._qp.setMedia(QMediaContent(QUrl(url)))
            self._qp.setVolume(70)
            self._qp.play()
            return "qt"
        except Exception:
            self._qp = None
        try:
            if os.name == "nt":
                os.startfile(canal["pls"])          # último recurso: reproductor del sistema
                return "sistema"
        except Exception:
            pass
        return None

    def siguiente(self):
        i = CANALES.index(self._actual) if self._actual in CANALES else -1
        return CANALES[(i + 1) % len(CANALES)]
