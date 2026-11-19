"""ARIA - Voz natural con Piper (sin internet, corre en el procesador, sin tarjeta gráfica).

Si Piper o la voz no están, listo() da False y voz_local sigue con pyttsx3 (SAPI).
Reproduce con winsound (viene con Python): cero dependencias extra para sonar.
"""
import os
import tempfile
import threading
import time
import wave

import extras_pc

_voz = None
_lock = threading.Lock()


def listo():
    if not os.path.exists(extras_pc.ruta_voz()):
        return False
    try:
        import piper  # noqa: F401
        return True
    except Exception:
        return False


def _cargar():
    global _voz
    if _voz is None:
        from piper import PiperVoice
        _voz = PiperVoice.load(extras_pc.ruta_voz())
    return _voz


def sintetizar(texto, ruta, velocidad=1.0):
    """Escribe un .wav con la frase. Soporta la API nueva (synthesize_wav) y la vieja (synthesize)."""
    v = _cargar()
    with wave.open(ruta, "wb") as w:
        if hasattr(v, "synthesize_wav"):
            try:
                from piper import SynthesisConfig
                v.synthesize_wav(texto, w, syn_config=SynthesisConfig(length_scale=1.0 / max(0.5, velocidad)))
            except Exception:
                v.synthesize_wav(texto, w)
        else:
            v.synthesize(texto, w, length_scale=1.0 / max(0.5, velocidad))
    with wave.open(ruta, "rb") as r:
        return r.getnframes() / float(r.getframerate() or 22050)


def decir_frase(texto, sigue=lambda: True, velocidad=1.0):
    """Sintetiza y reproduce una frase. sigue() -> False la corta (callar)."""
    import winsound
    with _lock:
        fd, ruta = tempfile.mkstemp(suffix=".wav", prefix="aria_voz_")
        os.close(fd)
        try:
            dur = sintetizar(texto, ruta, velocidad)
            if not sigue():
                return
            winsound.PlaySound(ruta, winsound.SND_FILENAME | winsound.SND_ASYNC)
            fin = time.time() + dur + 0.15
            while time.time() < fin:
                if not sigue():
                    winsound.PlaySound(None, 0)          # corta lo que suena
                    return
                time.sleep(0.05)
        finally:
            try:
                os.remove(ruta)
            except Exception:
                pass
