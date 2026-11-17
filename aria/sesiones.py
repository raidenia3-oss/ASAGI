# -*- coding: utf-8 -*-
"""ARIA - Sesiones: «conecta <sitio>» una vez y ARIA entra a ese sitio ya logueada cuando navega por ti.

Cómo funciona (igual que «conecta rollercoin», pero para cualquier sitio):
  1. «conecta youtube» / «inicia sesión en github» / «conecta https://…»
  2. ARIA abre Chrome NORMAL (no automatizado, por eso Google deja entrar) con el perfil del navegador de ARIA.
     TÚ inicias sesión como siempre («Continuar con Google», 2FA en tu celular…). ARIA no ve ni guarda contraseñas.
  3. Cierras esa ventana. Desde ahí, «navega a …», «busca en la web …», las recetas y los agentes usan esa sesión.
«mis sesiones» lista los sitios conectados · «desconecta <sitio>» lo olvida (borra el registro; para cerrar la sesión
de verdad, entra con «conecta <sitio>» y sal desde la página).

Seguridad: las cookies viven SOLO en data/aria_navegador_perfil (no se sube a GitHub, no se copia al celular, no se
exporta ni se muestra). Sin servidores ni puertos. Lo público (publicar, enviar, pagar, borrar) sigue pidiendo confirmación.
"""
import json
import os
import re
import subprocess
import time

_DIR = os.path.dirname(os.path.abspath(__file__))
REGISTRO = os.path.join(_DIR, "data", "sesiones.json")
SITIOS = {
    "google": "https://accounts.google.com/", "youtube": "https://www.youtube.com/",
    "github": "https://github.com/login", "instagram": "https://www.instagram.com/accounts/login/", "facebook": "https://www.facebook.com/login",
    "x": "https://x.com/login", "twitter": "https://x.com/login", "tiktok": "https://www.tiktok.com/login", "reddit": "https://www.reddit.com/login",
    "linkedin": "https://www.linkedin.com/login", "discord": "https://discord.com/login", "notion": "https://www.notion.so/login",
    "chatgpt": "https://chatgpt.com/", "mercadolibre": "https://www.mercadolibre.com.pe/", "whatsapp": "https://web.whatsapp.com/",
    "twitch": "https://www.twitch.tv/login", "spotify": "https://accounts.spotify.com/login", "canva": "https://www.canva.com/login",
}


def _norm(t):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", (t or "").lower()) if unicodedata.category(c) != "Mn").strip(" .!?¿¡")


def url_de(sitio):
    """Nombre o enlace -> (nombre, url https) o (None, None). PURO."""
    s = (sitio or "").strip()
    m = re.match(r"^(https://[^\s]+)$", s, re.I)
    if m:
        host = re.sub(r"^www\.", "", re.sub(r"^https://([^/]+).*$", r"\1", m.group(1).lower()))
        return host, m.group(1)
    n = _norm(s)
    if n in SITIOS:
        return n, SITIOS[n]
    if re.match(r"^[a-z0-9-]+(\.[a-z0-9-]+)+$", n):          # «conecta ejemplo.com»
        return re.sub(r"^www\.", "", n), "https://" + n
    return None, None


def manejar(t):
    """Comando de chat -> None | ('conectar', nombre, url) | ('lista',) | ('olvidar', nombre). PURO."""
    n = _norm(t)
    if n in ("mis sesiones", "sesiones", "sitios conectados", "donde tengo sesion", "que sitios tengo conectados"):
        return ("lista",)
    m = re.match(r"^(?:desconecta|olvida la sesion de|quita la sesion de)\s+(.{1,60})$", n)
    if m:
        nombre, _ = url_de(m.group(1))
        return ("olvidar", nombre or m.group(1).strip())
    m = re.match(r"^(?:conecta(?:te)?(?: a| con)?|inicia sesi[oó]n en|iniciar sesi[oó]n en|entra a|logueate en|login en)\s+(\S.{0,200})$", (t or "").strip().rstrip(".!?"), re.I)
    if m:
        cand = m.group(1).strip()
        if _norm(cand) in ("rollercoin", "gemini", "gmail", "mi gmail", "mi correo", "gmail con contraseña de app", "la pc", "pc", "aria", "asagi", "el celular", "mi celular", "wifi", "bluetooth"):
            return None                                        # esos tienen su propio comando
        nombre, url = url_de(cand)
        if url:
            return ("conectar", nombre, url)
    return None


def _leer():
    try:
        return json.load(open(REGISTRO, encoding="utf-8"))
    except Exception:
        return {}


def lista():
    r = _leer()
    if not r:
        return "No tengo sesiones guardadas. Di «conecta youtube» (o github, instagram, un enlace https…) e inicia sesión tú en la ventana que abro."
    return "Sitios donde ya entro con tu sesión:\n" + "\n".join("• %s (desde %s)" % (k, time.strftime("%d/%m", time.localtime(v.get("ts", 0)))) for k, v in sorted(r.items())) + \
        "\nÚsalos con «navega a …». «desconecta <sitio>» lo quita de la lista."


def olvidar(nombre):
    r = _leer()
    if nombre not in r:
        return "No tengo «%s» en mis sesiones." % nombre
    r.pop(nombre)
    os.makedirs(os.path.dirname(REGISTRO), exist_ok=True)
    json.dump(r, open(REGISTRO, "w", encoding="utf-8"), ensure_ascii=False)
    return "Quité «%s» de mi lista. Para cerrar la sesión de verdad: «conecta %s» y sal desde la página." % (nombre, nombre)


def conectar(nombre, url, timeout_s=900):
    """Abre Chrome normal con el perfil del navegador de ARIA; espera a que TÚ cierres la ventana. -> texto"""
    try:
        import rollercoin_google as _rg
        import navegador_aria as _na
    except Exception as exc:
        return "No pude preparar el navegador: %s" % exc
    ruta, _canal = _rg.navegador()
    if not ruta:
        return "No encontré Chrome ni Edge instalados."
    try:                                                       # el perfil no puede estar abierto dos veces
        if getattr(_na, "_NAV", None) is not None and _na._NAV._page is not None:
            _na._NAV.cerrar()
    except Exception:
        pass
    os.makedirs(_na.PERFIL, exist_ok=True)
    proc = subprocess.Popen([ruta, "--user-data-dir=%s" % _na.PERFIL, "--no-first-run", "--no-default-browser-check", "--new-window", url])
    t0 = time.time()
    while proc.poll() is None and time.time() - t0 < timeout_s:
        time.sleep(1)
    time.sleep(2)                                              # que Chrome termine de guardar
    if proc.poll() is None:
        return "La ventana sigue abierta. Cuando termines de iniciar sesión, ciérrala tú (yo no cierro tus ventanas) y di «mis sesiones»."
    r = _leer()
    r[nombre] = {"url": url, "ts": int(time.time())}
    os.makedirs(os.path.dirname(REGISTRO), exist_ok=True)
    json.dump(r, open(REGISTRO, "w", encoding="utf-8"), ensure_ascii=False)
    return "Listo: guardé tu sesión de %s en mi navegador. Ahora «navega a %s» entra con tu cuenta. No vi ni guardé tu contraseña." % (nombre, re.sub(r"^https://(www\.)?", "", url).split("/")[0])
