# -*- coding: utf-8 -*-
"""Pasa los colores de ASAGI a la paleta fija de Daniel: negro #080408, carmesí #DC143C, oro #FFD700, blanco #F0F0F8.
Reasigna por tono y luz (conserva la transparencia y la jerarquía claro/oscuro):
  muy oscuro            -> negro cálido (fondos, paneles)
  gris (poca saturación)-> grises cálidos hacia el blanco #F0F0F8
  dorados/naranjas/verdes -> oro
  cian/azul/violeta/rosa/rojo -> carmesí (y si es muy claro -> blanco: textos)
Uso: python scripts/paleta.py archivo1 archivo2 ...   (reescribe en el sitio; idempotente)"""
import colorsys, re, sys

NEGRO, CARM, ORO, BLANCO = (8, 4, 8), (220, 20, 60), (255, 215, 0), (240, 240, 248)
PALETA = {NEGRO, CARM, ORO, BLANCO}


def mezcla(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def mapear(rgb, piel_ok=False):
    if tuple(rgb) in PALETA:
        return tuple(rgb)
    r, g, b = [x / 255 for x in rgb]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    h *= 360
    if piel_ok and (h < 45 or h > 340) and l > 0.72:          # piel / mejillas del avatar: no tocar
        return tuple(rgb)
    if l < 0.17:                                              # fondos
        return mezcla(NEGRO, (40, 12, 22), l / 0.17)
    if s < 0.3 or l > 0.88:                                   # grises, apagados y casi-blancos
        return mezcla((46, 36, 42), BLANCO, (l - 0.17) / 0.76)
    if 20 <= h < 160:                                         # oros, naranjas, verdes -> oro
        if l < 0.35:
            return mezcla((40, 30, 0), (150, 120, 0), (l - 0.17) / 0.18)
        return mezcla(ORO, (255, 236, 150), max(0.0, (l - 0.62) / 0.3))
    # fríos y rosas -> carmesí; muy claros -> blanco (texto)
    if l > 0.7 and 160 <= h < 330:                           # celeste/lila claro = texto -> blanco
        return mezcla((246, 214, 222), BLANCO, (l - 0.7) / 0.18)
    if l > 0.7:
        return (255, 92, 118)
    if l < 0.3:
        return mezcla((52, 8, 20), (140, 12, 40), (l - 0.17) / 0.13)
    if l < 0.5:
        return mezcla((140, 12, 40), CARM, (l - 0.3) / 0.2)
    return mezcla(CARM, (255, 92, 118), (l - 0.5) / 0.2)


def hexa(c):
    return "#%02x%02x%02x" % c


def transformar(txt, piel_ok=False):
    def rhex(m):
        s = m.group(0)
        v = s[1:]
        if len(v) == 3:
            v = "".join(ch * 2 for ch in v)
        rgb = tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))
        return hexa(mapear(rgb, piel_ok))

    def rrgb(m):
        nums = [x.strip() for x in m.group(2).split(",")]
        rgb = mapear(tuple(int(float(x)) for x in nums[:3]), piel_ok)
        resto = (", " + ",".join(nums[3:]).strip()) if len(nums) > 3 else ""
        return "%s(%d, %d, %d%s)" % (m.group(1), rgb[0], rgb[1], rgb[2], resto)

    txt = re.sub(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F-])", rhex, txt)
    txt = re.sub(r"\b(rgba?)\(\s*([0-9.]+\s*,\s*[0-9.]+\s*,\s*[0-9.]+(?:\s*,\s*[0-9.]+)?)\s*\)", rrgb, txt)
    def rqc(m):
        rgb = mapear(tuple(int(m.group(i)) for i in (1, 2, 3)), piel_ok)
        return "QColor(%d, %d, %d%s)" % (rgb[0], rgb[1], rgb[2], m.group(4) or "")

    txt = re.sub(r"QColor\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(,\s*[^()]*(?:\([^()]*\)[^()]*)*)?\)", rqc, txt)
    return txt


if __name__ == "__main__":
    piel = "--piel" in sys.argv
    for f in [a for a in sys.argv[1:] if not a.startswith("--")]:
        t = open(f, encoding="utf-8").read()
        n = transformar(t, piel)
        if n != t:
            open(f, "w", encoding="utf-8").write(n)
            print("recoloreado", f)
