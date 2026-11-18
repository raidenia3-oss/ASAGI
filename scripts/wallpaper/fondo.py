# -*- coding: utf-8 -*-
"""Genera el fondo de ASAGI/ARIA: original, oscuro, estilo núcleo carmesí + constelación + montañas low-poly.
Paleta fija: #080408 negro, #DC143C carmesí, #FFD700 oro, #F0F0F8 papel. Dos variantes que combinan (bloqueo / inicio).
Uso: python3 fondo.py <ancho> <alto> <salida.png> [bloqueo|inicio]
"""
import sys
import math
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

NEGRO = (8, 4, 8)
CARMESI = (220, 20, 60)
ORO = (255, 215, 0)
PAPEL = (240, 240, 248)


def _mezcla(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _glow(w, h, cx, cy, rad, color, fuerza):
    """Capa de brillo radial (numpy) -> array HxWx3 float a sumar."""
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx - cx) / rad) ** 2 + ((yy - cy) / rad) ** 2)
    g = np.clip(1.0 - d, 0, 1) ** 2.2
    cap = np.zeros((h, w, 3), np.float32)
    for i in range(3):
        cap[:, :, i] = g * color[i] * fuerza
    return cap


def generar(w, h, salida, modo="bloqueo"):
    rnd = random.Random(7 if modo == "bloqueo" else 13)
    # 1) base: degradado vertical casi negro, un poco más vivo abajo
    base = np.zeros((h, w, 3), np.float32)
    for y in range(h):
        t = y / h
        c = _mezcla((5, 2, 6), (16, 6, 12), t ** 1.4)
        base[y, :, :] = c
    # 2) núcleo (sol/caos) — más abajo en bloqueo, más chico y lateral en inicio
    if modo == "bloqueo":
        cx, cy, rad = w * 0.5, h * 0.70, h * 0.42
    else:
        cx, cy, rad = w * 0.72, h * 0.82, h * 0.36
    base += _glow(w, h, cx, cy, rad, CARMESI, 0.85)
    base += _glow(w, h, cx, cy - rad * 0.15, rad * 0.45, ORO, 0.33)
    base += _glow(w, h, w * 0.2, h * 0.12, h * 0.3, (90, 20, 50), 0.25)   # contraluz superior tenue
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")

    # 3) constelación (líneas y puntos oro/carmesí, muy sutiles)
    cap = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dr = ImageDraw.Draw(cap)
    pts = [(rnd.uniform(0, w), rnd.uniform(0, h * 0.75)) for _ in range(46)]
    for i, (x, y) in enumerate(pts):
        for x2, y2 in pts[i + 1:]:
            d = math.hypot(x - x2, y - y2)
            if d < w * 0.16:
                a = int(42 * (1 - d / (w * 0.16)))
                dr.line([(x, y), (x2, y2)], fill=(CARMESI if (i % 3) else ORO) + (a,), width=1)
    for x, y in pts:
        r = rnd.uniform(1.2, 2.6)
        dr.ellipse([x - r, y - r, x + r, y + r], fill=ORO + (150,))
    img = Image.alpha_composite(img.convert("RGBA"), cap).convert("RGB")

    # 4) montañas low-poly abajo (silueta oscura, recorta el núcleo como un horizonte)
    cap2 = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dr2 = ImageDraw.Draw(cap2)
    capas = [(0.82, (10, 5, 9), 150), (0.88, (6, 3, 7), 200), (0.94, (3, 1, 4), 255)]
    for base_y, col, al in capas:
        ys = base_y * h
        pasos = 9
        pol = [(0, h), (0, ys)]
        for k in range(pasos + 1):
            x = w * k / pasos
            pol.append((x, ys - rnd.uniform(0, h * 0.06) + math.sin(k) * h * 0.012))
        pol += [(w, ys), (w, h)]
        dr2.polygon(pol, fill=col + (al,))
    img = Image.alpha_composite(img.convert("RGBA"), cap2).convert("RGB")

    # 5) firma sutil + viñeta + grano
    vig = Image.new("L", (w, h), 0)
    dv = ImageDraw.Draw(vig)
    dv.ellipse([-w * 0.25, -h * 0.15, w * 1.25, h * 1.15], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(w * 0.12))
    oscuro = Image.new("RGB", (w, h), (0, 0, 0))
    img = Image.composite(img, oscuro, vig)
    arr = np.asarray(img).astype(np.int16)
    ruido = np.random.default_rng(3).integers(-9, 9, (h, w, 1))
    img = Image.fromarray(np.clip(arr + ruido, 0, 255).astype(np.uint8), "RGB")

    # firma «asagi» en carmesí abajo-derecha solo en bloqueo (como los reels)
    if modo == "bloqueo":
        d3 = ImageDraw.Draw(img)
        try:
            from PIL import ImageFont
            f = ImageFont.load_default()
        except Exception:
            f = None
        d3.text((w * 0.80, h * 0.055), "asagi", fill=CARMESI, font=f)
    img.save(salida, quality=92)
    print("guardado", salida, img.size)


if __name__ == "__main__":
    w = int(sys.argv[1]); h = int(sys.argv[2]); out = sys.argv[3]
    generar(w, h, out, sys.argv[4] if len(sys.argv) > 4 else "bloqueo")
