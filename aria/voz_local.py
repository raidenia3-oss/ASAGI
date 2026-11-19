# -*- coding: utf-8 -*-
"""ARIA - Voz local con pyttsx3 (SAPI de Windows, offline, sin deps nuevas).

pyttsx3 ya esta instalado y usa las voces del sistema. Cero HTTP, cero servidores.
Habla en un hilo aparte para no congelar la UI. Solo se habla una frase a la vez
(lock), y cualquier fallo de TTS es silencioso: la voz nunca tumba ARIA.

Voces por personaje (mapeado a idiomas del sistema SAPI):
  ARIA:    Ciel/Gran Sabio -> espanol, ritmo normal
           Echidna -> espanol, ritmo un poco mas lento (susurrante)
           Iroha -> espanol, ritmo un poco mas rapido (juguetona)
  ASAGI:   Lieselotte -> espanol, ritmo normal, tono serio
           Asagi Aiba -> espanol, ritmo normal, tono cercano
           Levi Kazama -> espanol, ritmo rapido (alegre)
"""
import threading

_lock = threading.Lock()
_engine = None

# Voces por personaje/rol para pyttsx3 (se busca por coincidencia en el ID de voz del sistema).
# Cada entrada tiene keywords de idioma y un hint de genero ("femenino"/"masculino"/None)
# para intentar distinguir voces cuando el sistema tenga varias en espanol.
_VOZ_POR_PERSONAJE = {
    ("aria", "ciel"): {"keywords": ["ES", "SPANISH"], "genero": "femenino"},
    ("aria", "gran_sabio"): {"keywords": ["ES", "SPANISH"], "genero": "femenino"},
    ("aria", "raphael"): {"keywords": ["ES", "SPANISH"], "genero": "femenino"},
    ("aria", "echidna"): {"keywords": ["ES", "SPANISH"], "genero": "femenino"},
    ("aria", "iroha"): {"keywords": ["ES", "SPANISH"], "genero": "femenino"},
    ("aria", "default"): {"keywords": ["ES", "SPANISH"], "genero": None},
    ("asagi", "lieselotte"): {"keywords": ["ES", "SPANISH"], "genero": "femenino"},
    ("asagi", "asagi_aiba"): {"keywords": ["ES", "SPANISH"], "genero": "femenino"},
    ("asagi", "levi_kazama"): {"keywords": ["ES", "SPANISH"], "genero": "masculino"},
    ("asagi", "default"): {"keywords": ["ES", "SPANISH"], "genero": None},
}

# Ritmo por personaje (palabras por minuto)
_RITMO_POR_PERSONAJE = {
    ("aria", "ciel"): 170,
    ("aria", "gran_sabio"): 165,
    ("aria", "raphael"): 170,
    ("aria", "echidna"): 155,
    ("aria", "iroha"): 185,
    ("aria", "default"): 170,
    ("asagi", "lieselotte"): 160,
    ("asagi", "asagi_aiba"): 170,
    ("asagi", "levi_kazama"): 190,
    ("asagi", "default"): 170,
}

# Pitch relativo por personaje (0..2, 1.0 = normal). SAPI lo ignora en voces que no lo soportan.
_PITCH_POR_PERSONAJE = {
    ("aria", "ciel"): 1.0,
    ("aria", "gran_sabio"): 0.95,
    ("aria", "raphael"): 1.0,
    ("aria", "echidna"): 0.9,
    ("aria", "iroha"): 1.1,
    ("aria", "default"): 1.0,
    ("asagi", "lieselotte"): 0.95,
    ("asagi", "asagi_aiba"): 1.0,
    ("asagi", "levi_kazama"): 1.1,
    ("asagi", "default"): 1.0,
}

# Volumen por personaje (0..1)
_VOLUMEN_POR_PERSONAJE = {
    ("aria", "ciel"): 1.0,
    ("aria", "gran_sabio"): 0.95,
    ("aria", "raphael"): 1.0,
    ("aria", "echidna"): 0.85,
    ("aria", "iroha"): 1.0,
    ("aria", "default"): 1.0,
    ("asagi", "lieselotte"): 0.95,
    ("asagi", "asagi_aiba"): 1.0,
    ("asagi", "levi_kazama"): 1.0,
    ("asagi", "default"): 1.0,
}


def _piper_ok():
    try:
        import voz_natural as voz_piper
        return voz_piper.listo()
    except Exception:
        return False


def disponible():
    if _piper_ok():
        return True
    try:
        import pyttsx3  # noqa: F401
        return True
    except Exception:
        return False


def _ritmo_para(personaje, rol):
    clave = (personaje.lower(), rol.lower())
    return _RITMO_POR_PERSONAJE.get(clave, _RITMO_POR_PERSONAJE[("aria", "default")])


def _pitch_para(personaje, rol):
    clave = (personaje.lower(), rol.lower())
    return _PITCH_POR_PERSONAJE.get(clave, _PITCH_POR_PERSONAJE[("aria", "default")])


def _volumen_para(personaje, rol):
    clave = (personaje.lower(), rol.lower())
    return _VOLUMEN_POR_PERSONAJE.get(clave, _VOLUMEN_POR_PERSONAJE[("aria", "default")])


def _engine_local():
    global _engine
    if _engine is not None:
        return _engine
    import pyttsx3
    e = pyttsx3.init()
    try:
        e.setProperty("rate", 175)
    except Exception:
        pass
    _engine = e
    return e


# ---------- interrumpir (como Open-LLM-VTuber): escribirle o hablarle la calla ----------
_gen = 0            # cada hablar()/callar() sube el numero; lo viejo se corta
_actual = [0]
_conectado = [False]
_hablando_ahora = [False]


def _al_palabra(name, location, length):
    # callback de pyttsx3 (en el hilo de runAndWait): si alguien llamo callar(), se detiene ya
    if _actual[0] != _gen and _engine is not None:
        try:
            _engine.stop()
        except Exception:
            pass


def frases(texto):
    """Parte en frases para poder cortar entre una y otra. PURO."""
    import re
    partes = re.split(r"(?<=[.!?…:;])\s+|\n+", (texto or "").strip())
    return [x.strip() for x in partes if x and x.strip()]


def callar():
    """Interrumpe lo que este diciendo."""
    global _gen
    _gen += 1
    if _hablando_ahora[0] and _engine is not None:
        try:
            _engine.stop()
        except Exception:
            pass


def hablando():
    return _hablando_ahora[0]


def hablar(texto, personaje="aria", rol="default"):
    """Habla `texto` en un hilo daemon con la voz del personaje/rol.

    Devuelve True si se encolo, False si no.
    """
    texto = (texto or "").strip()
    if not texto or not disponible():
        return False
    callar()                      # una frase nueva reemplaza a la anterior
    mi = _gen

    def _run():
        with _lock:
            if mi != _gen:
                return
            # Voz natural (Piper) si ya se instaló; si falla, sigue con la de Windows.
            if _piper_ok():
                try:
                    import voz_natural as voz_piper
                    _hablando_ahora[0] = True
                    vel = _ritmo_para(personaje, rol) / 175.0
                    for f in frases(texto):
                        if mi != _gen:
                            break
                        voz_piper.decir_frase(f, sigue=lambda: mi == _gen, velocidad=vel)
                    return
                except Exception:
                    pass
                finally:
                    _hablando_ahora[0] = False
            try:
                e = _engine_local()
                if not _conectado[0]:
                    try:
                        e.connect("started-word", _al_palabra)
                    except Exception:
                        pass
                    _conectado[0] = True
                # Seleccionar voz por idioma y genero del personaje
                voces = e.getProperty("voices") or []
                clave = (personaje.lower(), rol.lower())
                cfg = _VOZ_POR_PERSONAJE.get(clave, _VOZ_POR_PERSONAJE[("aria", "default")])
                keywords = cfg["keywords"]
                genero = cfg.get("genero")
                mejor = None
                for v in voces:
                    vid = (getattr(v, "id", "") or "").upper()
                    name = (getattr(v, "name", "") or "").upper()
                    texto_v = vid + " " + name
                    if not any(k in texto_v for k in keywords):
                        continue
                    if genero:
                        es_femenino = any(g in texto_v for g in ("FEMALE", "MUJER", "HELENA", "ZIRA"))
                        es_masculino = any(g in texto_v for g in ("MALE", "HOMBRE", "DAVID", "MARK"))
                        if genero == "femenino" and not es_femenino:
                            continue
                        if genero == "masculino" and not es_masculino:
                            continue
                    mejor = v
                    break
                if mejor is not None:
                    try:
                        e.setProperty("voice", mejor.id)
                    except Exception:
                        pass
                # Ajustar ritmo, pitch y volumen por personaje
                try:
                    e.setProperty("rate", _ritmo_para(personaje, rol))
                except Exception:
                    pass
                try:
                    e.setProperty("pitch", _pitch_para(personaje, rol))
                except Exception:
                    pass
                try:
                    e.setProperty("volume", _volumen_para(personaje, rol))
                except Exception:
                    pass
                _actual[0] = mi
                _hablando_ahora[0] = True
                for f in frases(texto):
                    if mi != _gen:
                        break
                    e.say(f)
                    e.runAndWait()
            except Exception:
                pass
            finally:
                _hablando_ahora[0] = False

    threading.Thread(target=_run, daemon=True).start()
    return True
