# -*- coding: utf-8 -*-
"""ARIA - Tu fondo de pantalla, trabajado por ARIA para que se vea bien con su interfaz.

Pon cualquier imagen (jpg, png, webp, bmp, gif animado):
  - arrástrala sobre la ventana de ARIA, o
  - escribe «fondo» (abre el selector), o «fondo: C:/ruta/imagen.jpg».
ARIA la copia a data/wallpapers/ (sigue funcionando aunque muevas el original), la analiza
(qué tan clara, qué tan saturada, color dominante) y la trata:
  auto   : oscurece lo justo según lo clara que sea, baja un poco la saturación, viñeta y un tono
           carmesí/oro muy suave para que combine con la paleta. (por defecto)
  paleta : duotono en la paleta de ARIA (negro → carmesí → oro). Cualquier foto queda "de ARIA".
  suave  : como auto pero desenfocada: el texto se lee perfecto encima.
  nitido : la foto tal cual, solo oscurecida lo mínimo para leer.
Comandos: «fondo auto|paleta|suave|nitido», «quitar fondo».
Todo el trabajo se hace UNA vez (no por cuadro): luego dibujar el fondo cuesta casi nada.
Solo Qt (PyQt5), sin dependencias nuevas.
"""
import os
import re
import shutil
import time

_DIR = os.path.dirname(os.path.abspath(__file__))
CARPETA = os.path.join(_DIR, "data", "wallpapers")
EXTS = (".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif")
ESTILOS = ("auto", "paleta", "suave", "nitido")
NEGRO, CARMESI, ORO, BLANCO = (8, 4, 8), (220, 20, 60), (255, 215, 0), (240, 240, 248)


# ---------------- comandos (PURO) ----------------
def parsear(t):
    """-> None | {"accion": "elegir"|"poner"|"estilo"|"quitar"|"info", ...}"""
    s = (t or "").strip().strip('"').strip()
    n = s.lower()
    n2 = (n.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
          .rstrip(".!? "))
    if re.match(r"^(?:quita(?:r)?|borra(?:r)?|sin)\s+(?:el\s+|mi\s+)?(?:fondo|wallpaper)(?:\s+de pantalla)?$", n2):
        return {"accion": "quitar"}
    m = re.match(r"^(?:fondo|wallpaper)\s+(auto|paleta|suave|nitido)$", n2)
    if m:
        return {"accion": "estilo", "estilo": m.group(1)}
    m = re.match(r"^(?:fondo|wallpaper|pon(?:me)?\s+(?:de\s+)?fondo)\s*[:=]\s*(.+)$", s, re.I)
    if m:
        return {"accion": "poner", "ruta": m.group(1).strip().strip('"').strip("'")}
    if re.match(r"^(?:fondo|wallpaper|elegir fondo|cambia(?:r)? (?:el |mi )?(?:fondo|wallpaper)|"
                r"pon(?:er|me)? (?:un |mi )?(?:fondo|wallpaper)|quiero (?:poner )?(?:un |mi )?(?:fondo|wallpaper))$", n2):
        return {"accion": "elegir"}
    if n2 in ("que fondo tengo", "info fondo", "fondo info", "estado del fondo"):
        return {"accion": "info"}
    return None


def es_imagen(ruta):
    return bool(ruta) and os.path.splitext(ruta)[1].lower() in EXTS


def importar(ruta, carpeta=CARPETA):
    """Copia la imagen a data/wallpapers/ y devuelve la ruta nueva (relativa a ARIA si se puede)."""
    if not os.path.isfile(ruta):
        raise FileNotFoundError("no encuentro el archivo: %s" % ruta)
    if not es_imagen(ruta):
        raise ValueError("eso no es una imagen (uso jpg, png, webp, bmp o gif)")
    os.makedirs(carpeta, exist_ok=True)
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", os.path.basename(ruta))[-60:]
    destino = os.path.join(carpeta, "%d_%s" % (int(time.time()), base))
    if os.path.abspath(ruta) != os.path.abspath(destino):
        shutil.copy2(ruta, destino)
    # deja solo las últimas 8 para no llenar el disco
    try:
        viejas = sorted((os.path.join(carpeta, f) for f in os.listdir(carpeta)), key=os.path.getmtime)
        for f in viejas[:-8]:
            os.remove(f)
    except OSError:
        pass
    try:
        return os.path.relpath(destino, _DIR)
    except ValueError:
        return destino


def oscurecer_para(lum, estilo):
    """Cuánto velo negro poner (0..1) según la luminancia media (0..1). PURO.
    Fotos claras necesitan más velo para que el texto se lea; oscuras casi nada."""
    if estilo == "paleta":
        return max(0.10, min(0.45, 0.10 + (lum - 0.25) * 0.6))
    base = {"auto": 0.32, "suave": 0.28, "nitido": 0.18}.get(estilo, 0.32)
    return round(max(0.12, min(0.78, base + (lum - 0.30) * 0.85)), 2)


def describir(info, estilo):
    """Texto que ARIA dice al poner el fondo. PURO."""
    lum, sat = info.get("lum", 0.3), info.get("sat", 0.3)
    clara = "clara" if lum > 0.55 else ("oscura" if lum < 0.25 else "de luz media")
    viva = "muy colorida" if sat > 0.45 else ("apagada" if sat < 0.15 else "con color normal")
    extra = {"auto": "la oscurecí %d%% y le di un toque carmesí/oro para que combine" % round(info.get("velo", 0) * 100),
             "paleta": "la pasé a mi paleta (negro → carmesí → oro)",
             "suave": "la desenfoqué y oscurecí %d%% para que el texto se lea perfecto" % round(info.get("velo", 0) * 100),
             "nitido": "la dejé nítida, solo %d%% más oscura" % round(info.get("velo", 0) * 100)}[estilo]
    anim = " Es animada: la reproduzco en bucle." if info.get("animada") else ""
    return ("Fondo puesto. Tu imagen es %s y %s; %s.%s Prueba «fondo paleta», «fondo suave», "
            "«fondo nitido» o «fondo auto». «quitar fondo» vuelve a la red." % (clara, viva, extra, anim))


# ---------------- tratamiento (Qt) ----------------
def analizar(img):
    """Luminancia y saturación medias (0..1) de una QImage, sobre una muestra de 48x48."""
    from PyQt5.QtCore import Qt
    from PyQt5.QtGui import QColor
    m = img.scaled(48, 48, Qt.IgnoreAspectRatio, Qt.SmoothTransformation)
    tl = ts = 0.0; n = 0
    for y in range(m.height()):
        for x in range(m.width()):
            c = QColor(m.pixel(x, y))
            tl += (0.2126 * c.redF() + 0.7152 * c.greenF() + 0.0722 * c.blueF())
            ts += c.hsvSaturationF() if c.hsvSaturationF() >= 0 else 0
            n += 1
    return {"lum": round(tl / max(1, n), 3), "sat": round(ts / max(1, n), 3)}


def preparar(img, W, H, estilo="auto", margen=1.05):
    """QImage original -> QImage tratada de tamaño (W*margen, H*margen) lista para pintar.
    -> (QImage, info)"""
    from PyQt5.QtCore import Qt, QRectF
    from PyQt5.QtGui import QImage, QPainter, QColor, QRadialGradient, QLinearGradient
    estilo = estilo if estilo in ESTILOS else "auto"
    info = analizar(img)
    tw, th = max(2, int(W * margen)), max(2, int(H * margen))
    esc = img.scaled(tw, th, Qt.KeepAspectRatioByExpanding, Qt.SmoothTransformation)
    esc = esc.copy((esc.width() - tw) // 2, (esc.height() - th) // 2, tw, th).convertToFormat(QImage.Format_ARGB32_Premultiplied)
    if estilo == "suave":   # desenfoque barato y bonito: reducir mucho y volver a agrandar suave
        chica = esc.scaled(max(2, tw // 14), max(2, th // 14), Qt.IgnoreAspectRatio, Qt.SmoothTransformation)
        esc = chica.scaled(tw, th, Qt.IgnoreAspectRatio, Qt.SmoothTransformation).convertToFormat(QImage.Format_ARGB32_Premultiplied)
    out = QImage(tw, th, QImage.Format_ARGB32_Premultiplied)
    out.fill(QColor(*NEGRO))
    p = QPainter(out)
    p.setRenderHint(QPainter.SmoothPixmapTransform)
    if estilo == "paleta":
        gris = esc.convertToFormat(QImage.Format_Grayscale8).convertToFormat(QImage.Format_ARGB32_Premultiplied)
        p.drawImage(0, 0, gris)
        p.setCompositionMode(QPainter.CompositionMode_Multiply)
        p.fillRect(0, 0, tw, th, QColor(*CARMESI))                 # sombras/medios -> carmesí
        p.setCompositionMode(QPainter.CompositionMode_Screen)
        p.setOpacity(0.55)
        luces = gris.copy()
        lp = QPainter(luces)
        lp.setCompositionMode(QPainter.CompositionMode_Multiply)
        lp.fillRect(0, 0, tw, th, QColor(*ORO)); lp.end()
        p.drawImage(0, 0, luces)                                    # luces -> oro
        p.setOpacity(1.0)
        p.setCompositionMode(QPainter.CompositionMode_SourceOver)
    else:
        p.drawImage(0, 0, esc)
        if estilo in ("auto", "suave"):
            gris = esc.convertToFormat(QImage.Format_Grayscale8)
            p.setOpacity(0.28 if info["sat"] > 0.45 else 0.15)     # baja la saturación si grita
            p.drawImage(0, 0, gris)
            p.setOpacity(1.0)
            p.setCompositionMode(QPainter.CompositionMode_SoftLight)
            g = QLinearGradient(0, th, tw, 0)                       # tono de la paleta: carmesí abajo, oro arriba
            g.setColorAt(0, QColor(*CARMESI, 120)); g.setColorAt(1, QColor(*ORO, 60))
            p.fillRect(0, 0, tw, th, g)
            p.setCompositionMode(QPainter.CompositionMode_SourceOver)
    velo = oscurecer_para(info["lum"], estilo)
    info["velo"] = velo
    p.fillRect(0, 0, tw, th, QColor(*NEGRO, int(255 * velo)))
    # viñeta y un degradado abajo (donde va la barra de comandos)
    rg = QRadialGradient(tw / 2, th / 2, max(tw, th) * 0.72)
    rg.setColorAt(0.55, QColor(0, 0, 0, 0)); rg.setColorAt(1, QColor(0, 0, 0, 150))
    p.setPen(Qt.NoPen); p.setBrush(rg); p.drawRect(QRectF(0, 0, tw, th))
    g2 = QLinearGradient(0, th * 0.78, 0, th)
    g2.setColorAt(0, QColor(*NEGRO, 0)); g2.setColorAt(1, QColor(*NEGRO, 170))
    p.fillRect(QRectF(0, th * 0.78, tw, th * 0.22), g2)
    p.end()
    return out, info
