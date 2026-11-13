# -*- coding: utf-8 -*-
"""ARIA - RollerCoin con «Log in With Google»: ARIA nunca ve ni guarda contraseñas.

Cómo funciona (una sola vez):
  1. «conecta rollercoin» en el chat de ARIA (o: python rollercoin_google.py).
  2. ARIA abre Chrome NORMAL (no automatizado, así Google no lo bloquea) con un perfil propio
     de ARIA: data/rollercoin_perfil. Entras a rollercoin.com/sign-in → «Log in With Google»,
     eliges tu cuenta y haces el 2FA en tu celular, como siempre.
  3. Cierras esa ventana. ARIA comprueba que quedó la sesión.
Después, el motor de RollerCoin usa ese mismo perfil (abrir_contexto) y entra ya logueado:
sin email, sin contraseña, sin contraseña de app de Gmail, sin bóveda.
Si un día la sesión vence, ARIA te avisa y repites el paso 1.

Seguridad: el perfil guarda cookies de sesión (= acceso a la cuenta). Está en data/ (que no se sube
a GitHub). No se comparte. Sin servidores ni puertos (no usa --remote-debugging-port).
"""
import os
import shutil
import subprocess
import time

_DIR = os.path.dirname(os.path.abspath(__file__))
PERFIL = os.path.join(_DIR, "data", "rollercoin_perfil")
URL_LOGIN = "https://rollercoin.com/sign-in"
URL_JUEGO = "https://rollercoin.com/game"

_CANDIDATOS = [
    r"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
    r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
    r"%LocalAppData%\Google\Chrome\Application\chrome.exe",
    r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
    r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
]


def navegador():
    """Ruta de Chrome (o Edge si no hay Chrome). -> (ruta, canal_playwright) o (None, None)"""
    for c in _CANDIDATOS:
        r = os.path.expandvars(c)
        if os.path.isfile(r):
            return r, ("msedge" if r.lower().endswith("msedge.exe") else "chrome")
    for n, canal in (("chrome", "chrome"), ("google-chrome", "chrome"), ("msedge", "msedge")):
        r = shutil.which(n)
        if r:
            return r, canal
    return None, None


def logueado_en(url_final):
    """¿La URL a la que terminó /sign-in indica sesión iniciada? PURO."""
    u = (url_final or "").lower()
    return bool(u) and "sign-in" not in u and "sign-up" not in u and "login" not in u


def conectar(esperar=True, timeout_s=900):
    """Abre Chrome normal con el perfil de ARIA en la página de login. Si esperar=True, espera a
    que cierres la ventana y comprueba la sesión. -> dict"""
    ruta, _canal = navegador()
    if not ruta:
        return {"status": "error", "error": "no encontré Chrome ni Edge instalados"}
    os.makedirs(PERFIL, exist_ok=True)
    args = [ruta, "--user-data-dir=%s" % PERFIL, "--no-first-run", "--no-default-browser-check",
            "--new-window", URL_LOGIN]
    proc = subprocess.Popen(args)
    if not esperar:
        return {"status": "abierto", "pid": proc.pid}
    t0 = time.time()
    while proc.poll() is None and time.time() - t0 < timeout_s:
        time.sleep(1)
    time.sleep(2)  # que Chrome termine de escribir las cookies
    return estado()


def abrir_contexto(playwright, headless=True, **kw):
    """Para el motor: contexto de Playwright YA logueado (usa el perfil de ARIA).
    Ejemplo:  with sync_playwright() as p: ctx = abrir_contexto(p); page = ctx.pages[0] ..."""
    _ruta, canal = navegador()
    opciones = dict(headless=headless, viewport={"width": 1366, "height": 768})
    if canal:
        opciones["channel"] = canal
    opciones.update(kw)
    return playwright.chromium.launch_persistent_context(PERFIL, **opciones)


def estado():
    """Comprueba (sin ventana) si el perfil tiene la sesión de RollerCoin. -> dict"""
    if not os.path.isdir(PERFIL):
        return {"status": "sin_conectar", "texto": "RollerCoin no está conectado. Di «conecta rollercoin»."}
    try:
        from playwright.sync_api import sync_playwright
    except Exception as exc:
        return {"status": "error", "error": "falta playwright: %s" % exc}
    try:
        with sync_playwright() as p:
            ctx = abrir_contexto(p, headless=True)
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            page.goto(URL_LOGIN, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(6000)  # la web redirige con JS si ya hay sesión
            final = page.url
            ctx.close()
    except Exception as exc:
        msg = str(exc)
        if "user data directory is already in use" in msg.lower() or "lock" in msg.lower():
            return {"status": "ocupado", "texto": "Cierra la ventana de Chrome de RollerCoin y vuelvo a revisar."}
        return {"status": "error", "error": msg[:300]}
    if logueado_en(final):
        return {"status": "ok", "texto": "RollerCoin conectado con tu cuenta de Google. Ya puedo entrar sola.", "url": final}
    return {"status": "sin_sesion", "texto": "No veo la sesión iniciada. Di «conecta rollercoin» y entra con «Log in With Google»."}


def manejar(t):
    """Comando de chat. -> None si no es para este módulo, o 'conectar' | 'estado'."""
    n = (t or "").strip().lower().rstrip(".!?")
    if n in ("conecta rollercoin", "conectar rollercoin", "rollercoin con google", "login rollercoin",
             "inicia sesion en rollercoin", "inicia sesión en rollercoin", "entra a rollercoin con google"):
        return "conectar"
    if n in ("estado rollercoin", "rollercoin conectado", "esta conectado rollercoin", "¿esta conectado rollercoin"):
        return "estado"
    return None


if __name__ == "__main__":
    print("Abriendo Chrome: entra con «Log in With Google» y luego CIERRA esa ventana…")
    r = conectar(esperar=True)
    print(r.get("texto") or r)
