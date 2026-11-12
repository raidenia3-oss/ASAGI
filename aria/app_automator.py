# -*- coding: utf-8 -*-
"""Automatizacion de apps de escritorio para ARIA (Windows, ctypes). Sin servidores.

Lanza apps (os.startfile), encuentra/lista ventanas, envia texto/teclas, click,
captura de pantalla y espera ventanas. Entrada unica: run(action, **kw).
"""
import os
import time
import ctypes

user32 = ctypes.windll.user32

KEYEVENTF_KEYUP = 0x0002
VK_RETURN = 0x0D
_WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)


def launch_app(path, args=""):
    """Abre una app/archivo con el asociador de Windows (sin subprocess)."""
    try:
        if args:
            os.startfile(path, "open")  # os.startfile no toma args; se ignoran
        else:
            os.startfile(path)
        return {"status": "ok", "path": path}
    except Exception as exc:
        return {"status": "error", "error": str(exc)}


def _enum(filtro):
    out = []

    def cb(hwnd, _):
        if user32.IsWindowVisible(hwnd):
            buf = ctypes.create_unicode_buffer(256)
            user32.GetWindowTextW(hwnd, buf, 256)
            if filtro(buf.value):
                out.append((hwnd, buf.value))
        return True

    user32.EnumWindows(_WNDENUMPROC(cb), 0)
    return out


def find_window(title_contains):
    t = (title_contains or "").lower()
    res = _enum(lambda v: t in v.lower())
    return res[0][0] if res else 0


def list_windows():
    return [{"hwnd": h, "title": v} for h, v in _enum(lambda v: bool(v.strip()))]


def send_text(text, hwnd=0):
    if hwnd:
        user32.SetForegroundWindow(hwnd)
        time.sleep(0.2)
    for ch in text or "":
        vk = user32.VkKeyScanW(ord(ch))
        if vk == -1:
            continue
        code = vk & 0xFF
        shift = (vk >> 8) & 1
        if shift:
            user32.keybd_event(0x10, 0, 0, 0)       # Shift down
        user32.keybd_event(code, 0, 0, 0)
        user32.keybd_event(code, 0, KEYEVENTF_KEYUP, 0)
        if shift:
            user32.keybd_event(0x10, 0, KEYEVENTF_KEYUP, 0)
        time.sleep(0.02)
    return {"status": "ok", "sent": len(text or "")}


def key_press(vk=VK_RETURN):
    user32.keybd_event(vk, 0, 0, 0)
    time.sleep(0.05)
    user32.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)
    return {"status": "ok", "vk": vk}


def click(x, y):
    user32.SetCursorPos(int(x), int(y))
    time.sleep(0.05)
    user32.mouse_event(0x0002, 0, 0, 0, 0)   # left down
    user32.mouse_event(0x0004, 0, 0, 0, 0)   # left up
    return {"status": "ok", "x": x, "y": y}


def scroll(x, y, clicks=3, direction="down"):
    """Rueda el raton en (x,y). direction: up/down."""
    user32.SetCursorPos(int(x), int(y))
    time.sleep(0.05)
    delta = 120 if direction == "up" else -120
    for _ in range(max(1, int(clicks))):
        user32.mouse_event(0x0800, 0, 0, delta, 0)  # MOUSEEVENTF_WHEEL
        time.sleep(0.05)
    return {"status": "ok", "x": x, "y": y, "clicks": clicks, "direction": direction}


def drag(x1, y1, x2, y2, duration=0.3):
    """Arrastra de (x1,y1) a (x2,y2)."""
    user32.SetCursorPos(int(x1), int(y1))
    time.sleep(0.05)
    user32.mouse_event(0x0002, 0, 0, 0, 0)  # left down
    steps = max(5, int(duration * 30))
    for i in range(1, steps + 1):
        xi = int(x1 + (x2 - x1) * i / steps)
        yi = int(y1 + (y2 - y1) * i / steps)
        user32.SetCursorPos(xi, yi)
        time.sleep(duration / steps)
    user32.mouse_event(0x0004, 0, 0, 0, 0)  # left up
    return {"status": "ok", "from": [x1, y1], "to": [x2, y2]}


def close_window(hwnd):
    """Cierra una ventana por hwnd (WM_CLOSE)."""
    WM_CLOSE = 0x0010
    if not hwnd:
        return {"status": "error", "error": "hwnd invalido"}
    user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
    return {"status": "ok", "hwnd": hwnd}


def wait_window(title_contains, timeout=10.0):
    """Espera hasta que aparezca una ventana cuyo titulo contenga el texto."""
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = find_window(title_contains)
        if h:
            return {"status": "ok", "hwnd": h}
        time.sleep(0.5)
    return {"status": "timeout"}


def screenshot(path="screenshot.png"):
    """Captura la pantalla via PIL (ImageGrab). Devuelve error limpio si falta PIL."""
    try:
        from PIL import ImageGrab
        img = ImageGrab.grab()
        img.save(path)
        return {"status": "ok", "path": path, "w": img.width, "h": img.height}
    except Exception as exc:
        return {"status": "error", "error": "necesita Pillow (pip install pillow): %s" % exc}


def run(action="list", **kw):
    if action == "launch":
        return launch_app(kw.get("path", ""), kw.get("args", ""))
    if action == "find":
        return {"hwnd": find_window(kw.get("title", ""))}
    if action == "list":
        return {"windows": list_windows()}
    if action == "type":
        return send_text(kw.get("text", ""), kw.get("hwnd", 0))
    if action == "key":
        return key_press(kw.get("vk", VK_RETURN))
    if action == "click":
        return click(kw.get("x", 0), kw.get("y", 0))
    if action == "wait":
        return wait_window(kw.get("title", ""), kw.get("timeout", 10.0))
    if action == "scroll":
        return scroll(kw.get("x", 0), kw.get("y", 0), kw.get("clicks", 3), kw.get("direction", "down"))
    if action == "drag":
        return drag(kw.get("x1", 0), kw.get("y1", 0), kw.get("x2", 0), kw.get("y2", 0), kw.get("duration", 0.3))
    if action == "close":
        return close_window(kw.get("hwnd", 0))
