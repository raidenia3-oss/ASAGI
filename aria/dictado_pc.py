"""ARIA - Dictado en cualquier programa (idea de OpenWhispr), sin internet.

Ctrl+Alt+Espacio: empieza a grabar. Otra vez: para, transcribe con faster-whisper y escribe el texto
en la ventana donde estabas (Word, WhatsApp Web, VS Code…). Máximo 90 s por dictado.
Todo con lo que trae Windows (RegisterHotKey, MCI para grabar, SendInput para escribir) + faster-whisper.
No abre puertos ni manda el audio a ningún lado.
"""
import ctypes
import os
import tempfile
import threading
import time

MODELO = os.environ.get("ARIA_WHISPER_MODELO", "small")
MAX_SEG = 90
_modelo = None
_mlock = threading.Lock()


def disponible():
    try:
        import faster_whisper  # noqa: F401
        return os.name == "nt"
    except Exception:
        return False


def _whisper():
    global _modelo
    with _mlock:
        if _modelo is None:
            from faster_whisper import WhisperModel
            hilos = max(2, min(6, (os.cpu_count() or 4) - 2))
            _modelo = WhisperModel(MODELO, device="cpu", compute_type="int8", cpu_threads=hilos)
        return _modelo


def precargar():
    threading.Thread(target=lambda: _whisper() if disponible() else None, daemon=True, name="aria-whisper").start()


def transcribir(ruta_wav, idioma="es"):
    segs, _info = _whisper().transcribe(ruta_wav, language=idioma, vad_filter=True, beam_size=1)
    return limpiar("".join(s.text for s in segs))


def limpiar(t):
    """Quita espacios dobles y las 'alucinaciones' típicas de Whisper en silencio. PURO."""
    import re
    t = re.sub(r"\s+", " ", (t or "")).strip()
    if re.fullmatch(r"(?i)[\W_]*(gracias por ver(?: el video)?|subt[ií]tulos (?:por|realizados por).*|suscr[ií]bete.*)?[\W_]*", t):
        return ""
    return t


# ---------------- escribir en la ventana activa (SendInput Unicode) ----------------
if os.name == "nt":
    from ctypes import wintypes

    class _KEYBDINPUT(ctypes.Structure):
        _fields_ = [("wVk", wintypes.WORD), ("wScan", wintypes.WORD), ("dwFlags", wintypes.DWORD),
                    ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_size_t)]

    class _MOUSEINPUT(ctypes.Structure):
        _fields_ = [("dx", wintypes.LONG), ("dy", wintypes.LONG), ("mouseData", wintypes.DWORD),
                    ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_size_t)]

    class _UNION(ctypes.Union):
        _fields_ = [("ki", _KEYBDINPUT), ("mi", _MOUSEINPUT)]

    class _INPUT(ctypes.Structure):
        _fields_ = [("type", wintypes.DWORD), ("u", _UNION)]


def escribir(texto):
    """Teclea el texto como si fuera el teclado (respeta acentos y ñ)."""
    if os.name != "nt" or not texto:
        return False
    user32 = ctypes.windll.user32
    KEYEVENTF_UNICODE, KEYEVENTF_KEYUP = 0x0004, 0x0002
    eventos = []
    for ch in texto:
        cu = ch.encode("utf-16-le")
        for i in range(0, len(cu), 2):
            code = int.from_bytes(cu[i:i + 2], "little")
            for fl in (KEYEVENTF_UNICODE, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP):
                ev = _INPUT(type=1)
                ev.u.ki = _KEYBDINPUT(0, code, fl, 0, 0)
                eventos.append(ev)
    for i in range(0, len(eventos), 200):              # en tandas: algunas apps se pierden con miles de golpes
        lote = eventos[i:i + 200]
        arr = (_INPUT * len(lote))(*lote)
        user32.SendInput(len(lote), arr, ctypes.sizeof(_INPUT))
        time.sleep(0.02)
    return True


# ---------------- grabar con MCI (viene con Windows) ----------------
def _mci(cmd):
    buf = ctypes.create_unicode_buffer(256)
    err = ctypes.windll.winmm.mciSendStringW(cmd, buf, 256, 0)
    if err:
        eb = ctypes.create_unicode_buffer(256)
        ctypes.windll.winmm.mciGetErrorStringW(err, eb, 256)
        raise RuntimeError("micrófono: " + eb.value)
    return buf.value


class Dictado:
    """Hilo con el atajo global. avisar(texto) muestra mensajes en ARIA."""
    MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, VK_SPACE, WM_HOTKEY = 0x1, 0x2, 0x4000, 0x20, 0x0312

    def __init__(self, avisar=None):
        self.avisar = avisar or (lambda t: None)
        self.grabando = False
        self._t0 = 0
        self._hilo = None
        self._tid = None

    def iniciar(self):
        if os.name != "nt" or (self._hilo and self._hilo.is_alive()):
            return False
        self._hilo = threading.Thread(target=self._bucle, daemon=True, name="aria-dictado")
        self._hilo.start()
        return True

    def _beep(self, f):
        try:
            import winsound
            winsound.Beep(f, 70)
        except Exception:
            pass

    def _empezar(self):
        if not disponible():
            self.avisar("🎙 Aún estoy instalando el dictado. En unos minutos funciona.")
            return
        try:
            _mci("close aria_dict")
        except Exception:
            pass
        _mci("open new type waveaudio alias aria_dict")
        try:
            _mci("set aria_dict bitspersample 16 samplespersec 16000 channels 1")
        except Exception:
            pass
        _mci("record aria_dict")
        self.grabando, self._t0 = True, time.time()
        self._beep(880)
        self.avisar("🎙 Dictando… vuelve a pulsar Ctrl+Alt+Espacio para terminar.")

    def _terminar(self):
        self.grabando = False
        self._beep(620)
        fd, ruta = tempfile.mkstemp(suffix=".wav", prefix="aria_dict_")
        os.close(fd)
        try:
            _mci("stop aria_dict")
            _mci('save aria_dict "%s"' % ruta)
        finally:
            try:
                _mci("close aria_dict")
            except Exception:
                pass

        def _tr():
            try:
                t = transcribir(ruta)
                if t:
                    escribir(t + " ")
                    self.avisar("🎙 Escribí: " + (t[:160] + ("…" if len(t) > 160 else "")))
                else:
                    self.avisar("🎙 No entendí nada en la grabación.")
            except Exception as exc:
                self.avisar("⚠ Dictado: %s" % exc)
            finally:
                try:
                    os.remove(ruta)
                except Exception:
                    pass
        threading.Thread(target=_tr, daemon=True).start()

    def _bucle(self):
        from ctypes import wintypes
        user32 = ctypes.windll.user32
        self._tid = ctypes.windll.kernel32.GetCurrentThreadId()
        if not user32.RegisterHotKey(None, 1, self.MOD_CONTROL | self.MOD_ALT | self.MOD_NOREPEAT, self.VK_SPACE):
            self.avisar("⚠ Dictado: otro programa ya usa Ctrl+Alt+Espacio.")
            return
        msg = wintypes.MSG()
        try:
            while True:
                # PeekMessage en bucle corto para poder cortar al llegar a MAX_SEG
                if user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, 1):
                    if msg.message == self.WM_HOTKEY:
                        try:
                            self._terminar() if self.grabando else self._empezar()
                        except Exception as exc:
                            self.grabando = False
                            self.avisar("⚠ Dictado: %s" % exc)
                    elif msg.message == 0x0012:          # WM_QUIT
                        break
                elif self.grabando and time.time() - self._t0 > MAX_SEG:
                    try:
                        self._terminar()
                    except Exception:
                        self.grabando = False
                else:
                    time.sleep(0.03)
        finally:
            user32.UnregisterHotKey(None, 1)
