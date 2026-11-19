# -*- coding: utf-8 -*-
"""ARIA - Editor de video propio (usa ffmpeg; aprobado por Daniel el 16-nov-2026). Todo en la PC, nada se sube.

  «edita el último video: recorta de 0:05 a 0:20, vertical, estilo noir, texto "LIMA DE NOCHE"»
  «edita C:\\ruta\\clip.mp4: velocidad 1.5, sin audio» · «edita el último video como siempre»
  «une los videos de la carpeta C:\\ruta» · «saca el audio del último video» · «haz un gif del último video»
  «quita los silencios del último video» (como Auto-Editor: corta los tramos callados, ideal para clases o videos hablados)
  «instala ffmpeg» (si falta) · «estilos de video»

Reglas: NUNCA toca el original (escribe en Videos/ARIA con otro nombre); sin servidores; un proceso ffmpeg por orden.
APRENDE: guarda cada receta que usas (data/editor_video_gusto.json); «como siempre» repite la que más usas.
La parte que arma el comando es PURA (plan / filtros / comando) y se prueba sin ffmpeg.
"""
import json
import os
import re
import shutil
import subprocess
import time

_DIR = os.path.dirname(os.path.abspath(__file__))
GUSTO = os.path.join(_DIR, "data", "editor_video_gusto.json")
EXT = (".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v")
# mismos nombres que el editor de fotos de ASAGI
ESTILOS = {
    "limpio": "eq=contrast=1.08:saturation=1.1:brightness=0.02",
    "sakuga": "eq=contrast=1.28:saturation=1.5:brightness=0.02,vignette=PI/6",
    "carmesi": "eq=contrast=1.2:saturation=0.75,colorbalance=rs=0.35:rm=0.2:bs=-0.15:gs=-0.1,vignette=PI/4.5",
    "dorado": "eq=contrast=1.1:saturation=1.15:brightness=0.03,colorbalance=rs=0.18:gs=0.08:bs=-0.2",
    "noir": "hue=s=0,eq=contrast=1.35:brightness=-0.02,vignette=PI/4,noise=alls=10:allf=t",
    "retro": "eq=contrast=0.95:saturation=0.75,colorbalance=rs=0.15:bs=-0.15,vignette=PI/5,noise=alls=14:allf=t",
    "noche": "eq=contrast=1.2:brightness=-0.06,colorbalance=rs=-0.15:bs=0.2,vignette=PI/4.5",
    # «edit» de anime (como los reels de AMV): resplandor (bloom), contraste y color fuertes, destello blanco al entrar
    # y un golpe en blanco y negro tipo viñeta de manga a mitad del clip. {D} = duración en segundos (la pone filtros()).
    "anime": ("format=gbrp,split[a][b];[b]gblur=sigma=22,eq=brightness=0.06[g];[a][g]blend=all_mode=screen:all_opacity=0.5,"
              "eq=contrast=1.3:saturation=1.45,unsharp=5:5:0.9,vignette=PI/5,"
              "hue=s='if(between(t,{D}*0.5,{D}*0.5+0.22),0,1)',"
              "eq=contrast='if(between(t,{D}*0.5,{D}*0.5+0.22),2.2,1)':eval=frame,"
              "fade=t=in:st=0:d=0.3:color=white,format=yuv420p"),
}
ALIAS_ESTILO = {"edit": "anime", "amv": "anime", "anime": "anime"}


def _norm(t):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", (t or "").lower()) if unicodedata.category(c) != "Mn")


def segundos(t):
    """'1:05' | '65' | '1:02:03' | '5s' -> segundos (float) o None. PURO."""
    t = (t or "").strip().lower().rstrip("s").strip()
    if re.match(r"^\d+(\.\d+)?$", t):
        return float(t)
    m = re.match(r"^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$", t)
    return int(m.group(1) or 0) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else None


def plan(orden):
    """Texto libre -> dict de operaciones. PURO."""
    n, o = _norm(orden), {}
    m = re.search(r"(?:recorta|corta|desde|de)\s+(?:el\s+)?(?:segundo\s+)?(\d[\d:.]*)\s*s?\s*(?:a|al|hasta)\s+(?:el\s+)?(?:segundo\s+)?(\d[\d:.]*)", n)
    if m and segundos(m.group(1)) is not None and segundos(m.group(2)) is not None and segundos(m.group(2)) > segundos(m.group(1)):
        o["inicio"], o["fin"] = segundos(m.group(1)), segundos(m.group(2))
    else:
        m = re.search(r"(?:primeros|los primeros)\s+(\d+)\s*(?:s|seg|segundos)", n)
        if m:
            o["inicio"], o["fin"] = 0.0, float(m.group(1))
    if re.search(r"\b(vertical|9:16|para reels?|para tiktok|para shorts)\b", n):
        o["forma"] = "9:16"
    elif re.search(r"\b(cuadrado|1:1)\b", n):
        o["forma"] = "1:1"
    elif re.search(r"\b(horizontal|16:9)\b", n):
        o["forma"] = "16:9"
    m = re.search(r"(?:velocidad|speed|acelera(?:do)?|x)\s*(?:a\s*)?(\d(?:[.,]\d+)?)\s*x?", n) or re.search(r"\b(\d(?:[.,]\d+)?)x\b", n)
    if m and 0.25 <= float(m.group(1).replace(",", ".")) <= 4 and float(m.group(1).replace(",", ".")) != 1:
        o["velocidad"] = float(m.group(1).replace(",", "."))
    elif re.search(r"camara lenta|slow", n):
        o["velocidad"] = 0.5
    if re.search(r"sin (audio|sonido)|mudo|silencia", n):
        o["mudo"] = True
    for k in ESTILOS:
        if re.search(r"\b(estilo|filtro|look)?\s*%s\b" % k, n) and (k != "limpio" or "estilo" in n or "filtro" in n):
            o["estilo"] = k
            break
    if "estilo" not in o and re.search(r"\b(?:estilo|tipo|modo)\s+(?:edit|amv)\b|\bhaz(?:le|me)? un edit\b|\bedit de anime\b", n):
        o["estilo"] = "anime"
    m = re.search(r"texto\s*[:=]?\s*[\"“«']([^\"”»']{1,60})[\"”»']", orden or "", re.I)
    if m:
        o["texto"] = m.group(1).strip()
    return o


def filtros(o, fuente=None, duracion=None):
    """dict de operaciones -> (vf, af) cadenas de filtro (o None). PURO."""
    vf, af = [], []
    v = o.get("velocidad")
    if v:
        vf.append("setpts=PTS/%g" % v)
        resto = v
        while resto > 2.0:                       # atempo solo acepta 0.5..2 por paso
            af.append("atempo=2.0"); resto /= 2.0
        while resto < 0.5:
            af.append("atempo=0.5"); resto /= 0.5
        af.append("atempo=%g" % resto)
    f = o.get("forma")
    if f == "9:16":
        vf.append("crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x080408")
    elif f == "1:1":
        vf.append("crop='min(iw,ih)':'min(iw,ih)',scale=1080:1080")
    elif f == "16:9":
        vf.append("crop='min(iw,ih*16/9)':'min(ih,iw*9/16)',scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x080408")
    if o.get("estilo") in ESTILOS:
        d = duracion if duracion else ((o["fin"] - (o.get("inicio") or 0)) if o.get("fin") is not None else 8.0)
        vf.append(ESTILOS[o["estilo"]].replace("{D}", "%g" % (d / (o.get("velocidad") or 1.0))))
    if o.get("texto"):
        t = re.sub(r"[\\':%]", "", o["texto"])    # sin caracteres que rompan el filtro
        dt = "drawtext=text='%s':fontcolor=0xFFD700:fontsize='min(h/14,w/%g)':borderw=4:bordercolor=0x080408:x=(w-text_w)/2:y=h-text_h-h/12" % (t, max(6.0, len(t) * 0.68))
        if fuente:
            dt += ":fontfile='%s'" % fuente.replace("\\", "/").replace(":", "\\:")
        vf.append(dt)
    return (",".join(vf) or None), (",".join(af) or None)


def comando(ffmpeg, entrada, salida, o, fuente=None, duracion=None):
    """-> lista de argumentos para subprocess (sin shell). PURO."""
    a = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y"]
    if o.get("inicio") is not None:
        a += ["-ss", "%g" % o["inicio"]]
    if o.get("fin") is not None:                  # antes de -i: cuánto LEER del original (la velocidad se aplica después)
        a += ["-t", "%g" % (o["fin"] - (o.get("inicio") or 0))]
    a += ["-i", entrada]
    vf, af = filtros(o, fuente, duracion)
    if vf:
        a += ["-vf", vf]
    if o.get("mudo"):
        a += ["-an"]
    elif af:
        a += ["-af", af]
    a += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p"]
    if not o.get("mudo"):
        a += ["-c:a", "aac", "-b:a", "160k"]
    return a + ["-movflags", "+faststart", salida]


# ── lo que toca el sistema ───────────────────────────────────────────────────────────────────────
def ffmpeg():
    r = shutil.which("ffmpeg")
    if r:
        return r
    for c in (os.path.join(_DIR, "tools", "ffmpeg.exe"), os.path.expandvars(r"%LocalAppData%\Microsoft\WinGet\Links\ffmpeg.exe")):
        if os.path.isfile(c):
            return c
    return None


def instalar():
    """«instala ffmpeg»: un solo paso con winget (viene con Windows 10/11). -> texto"""
    if ffmpeg():
        return "ffmpeg ya está instalado."
    if not shutil.which("winget"):
        return "No encontré winget para instalarlo sola. Descarga ffmpeg de gyan.dev y deja ffmpeg.exe en ARIA_APP\\tools."
    try:
        subprocess.run(["winget", "install", "-e", "--id", "Gyan.FFmpeg", "--accept-source-agreements", "--accept-package-agreements", "--silent"], timeout=900, capture_output=True)
    except Exception as exc:
        return "No pude instalar ffmpeg: %s" % exc
    return "ffmpeg instalado. Ya puedo editar videos." if ffmpeg() else "Lo instalé, pero Windows lo verá al reabrir ARIA. Ciérrame y ábreme de nuevo."


def _carpetas():
    casa = os.path.expanduser("~")
    return [os.path.join(casa, x) for x in ("Videos", "Downloads", "Descargas", os.path.join("Pictures", "Camera Roll"), "Desktop")]


def ultimo_video():
    mejor, mt = None, 0
    for c in _carpetas():
        try:
            for n in os.listdir(c):
                p = os.path.join(c, n)
                if n.lower().endswith(EXT) and os.path.isfile(p) and "_edit" not in n and os.path.getmtime(p) > mt:
                    mejor, mt = p, os.path.getmtime(p)
        except OSError:
            pass
    return mejor


def _salida(entrada, sufijo="_edit", ext=".mp4"):
    d = os.path.join(os.path.expanduser("~"), "Videos", "ARIA")
    os.makedirs(d, exist_ok=True)
    base = os.path.splitext(os.path.basename(entrada))[0]
    return os.path.join(d, "%s%s_%s%s" % (base, sufijo, time.strftime("%H%M%S"), ext))


def _fuente():
    for c in (r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if os.path.isfile(c):
            return c
    return None


def _duracion(ff, ruta):
    """Segundos del video (con ffprobe si está junto a ffmpeg); None si no se puede."""
    pr = os.path.join(os.path.dirname(ff), "ffprobe" + (".exe" if ff.lower().endswith(".exe") else "")) if os.path.dirname(ff) else None
    pr = pr if pr and os.path.isfile(pr) else shutil.which("ffprobe")
    if not pr:
        return None
    try:
        r = subprocess.run([pr, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ruta], capture_output=True, timeout=30)
        return float(r.stdout.decode().strip())
    except Exception:
        return None


def _gusto():
    try:
        return json.load(open(GUSTO, encoding="utf-8"))
    except Exception:
        return {}


def _aprender(o):
    """Recuerda la receta (sin tiempos ni texto: eso cambia en cada video)."""
    clave = json.dumps({k: o[k] for k in sorted(o) if k in ("forma", "estilo", "velocidad", "mudo")}, sort_keys=True)
    if clave == "{}":
        return
    g = _gusto(); g[clave] = g.get(clave, 0) + 1
    try:
        os.makedirs(os.path.dirname(GUSTO), exist_ok=True)
        json.dump(g, open(GUSTO, "w", encoding="utf-8"))
    except Exception:
        pass


def como_siempre():
    g = _gusto()
    return json.loads(max(g, key=g.get)) if g else {}


def _correr(args, timeout=1800):
    r = subprocess.run(args, capture_output=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or b"").decode("utf-8", "ignore").strip()[-300:] or "ffmpeg falló")


def editar(entrada, orden):
    ff = ffmpeg()
    if not ff:
        return "Me falta ffmpeg. Di «instala ffmpeg» y lo pongo sola."
    if not entrada or not os.path.isfile(entrada):
        return "No encontré el video. Dime la ruta o di «edita el último video: …»."
    o = plan(orden)
    if re.search(r"como siempre|mi estilo|lo de siempre", _norm(orden)):
        base = como_siempre(); base.update(o); o = base
    if not o:
        return "Dime qué hacerle: recorta de 0:05 a 0:20, vertical, estilo noir (o anime, sakuga, carmesi, dorado, retro, noche), velocidad 1.5, sin audio, texto \"…\"."
    sal = _salida(entrada)
    try:
        _correr(comando(ff, entrada, sal, o, _fuente(), _duracion(ff, entrada)))
    except Exception as exc:
        return "No pude editarlo: %s" % exc
    _aprender(o)
    hechos = [x for x in ("recorte %g–%g s" % (o["inicio"], o["fin"]) if "fin" in o else "", o.get("forma", ""), "estilo " + o["estilo"] if o.get("estilo") else "",
                          "velocidad %gx" % o["velocidad"] if o.get("velocidad") else "", "sin audio" if o.get("mudo") else "", "texto" if o.get("texto") else "") if x]
    return "Listo (%s). El original quedó intacto.\nGuardado en: %s" % (", ".join(hechos), sal)


def extra(entrada, que):
    """'audio' -> mp3 · 'gif' -> gif corto."""
    ff = ffmpeg()
    if not ff:
        return "Me falta ffmpeg. Di «instala ffmpeg»."
    if not entrada or not os.path.isfile(entrada):
        return "No encontré el video."
    try:
        if que == "audio":
            sal = _salida(entrada, "_audio", ".mp3")
            _correr([ff, "-hide_banner", "-loglevel", "error", "-y", "-i", entrada, "-vn", "-c:a", "libmp3lame", "-q:a", "2", sal])
        else:
            sal = _salida(entrada, "", ".gif")
            _correr([ff, "-hide_banner", "-loglevel", "error", "-y", "-t", "8", "-i", entrada, "-vf", "fps=12,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", sal])
    except Exception as exc:
        return "No pude: %s" % exc
    return "Listo. Guardado en: %s" % sal


def unir(carpeta):
    ff = ffmpeg()
    if not ff:
        return "Me falta ffmpeg. Di «instala ffmpeg»."
    if not os.path.isdir(carpeta):
        return "No encontré esa carpeta."
    vs = sorted(os.path.join(carpeta, n) for n in os.listdir(carpeta) if n.lower().endswith(EXT))
    if len(vs) < 2:
        return "Necesito al menos 2 videos en esa carpeta."
    vs = vs[:20]
    sal = _salida(vs[0], "_unido")
    ent = []
    for v in vs:
        ent += ["-i", v]
    fc = "".join("[%d:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v%d];" % (i, i) for i in range(len(vs)))
    fc += "".join("[v%d]" % i for i in range(len(vs))) + "concat=n=%d:v=1:a=0[v]" % len(vs)
    try:
        _correr([ff, "-hide_banner", "-loglevel", "error", "-y"] + ent + ["-filter_complex", fc, "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", sal])
    except Exception as exc:
        return "No pude unirlos: %s" % exc
    return "Uní %d videos (sin audio, a 720p). Guardado en: %s" % (len(vs), sal)


# ── Quitar silencios (idea de Auto-Editor, hecho con ffmpeg: silencedetect + select) ────────────
def silencios(log):
    """Salida de silencedetect -> [(inicio, fin)] de los tramos callados. PURO."""
    out, ini = [], None
    for m in re.finditer(r"silence_(start|end):\s*(-?[\d.]+)", log or ""):
        v = max(0.0, float(m.group(2)))
        if m.group(1) == "start":
            ini = v
        elif ini is not None:
            out.append((ini, v)); ini = None
    if ini is not None:
        out.append((ini, None))                  # silencio hasta el final
    return out


def tramos(sil, dur, margen=0.15, minimo=0.3):
    """Silencios + duración -> tramos CON sonido [(a, b)], dejando un respiro (margen) a cada lado. PURO."""
    out, t = [], 0.0
    for a, b in sil:
        fin = a + margen
        if fin - t >= minimo:
            out.append((round(t, 3), round(min(fin, dur), 3)))
        t = max(t, (b if b is not None else dur) - margen)
    if dur - t >= minimo:
        out.append((round(t, 3), round(dur, 3)))
    return out


def comando_tramos(ff, entrada, salida, tr):
    """Une solo los tramos con voz (video y audio juntos, sin desfase). PURO."""
    sel = "+".join("between(t,%g,%g)" % ab for ab in tr)
    return [ff, "-hide_banner", "-loglevel", "error", "-y", "-i", entrada,
            "-vf", "select='%s',setpts=N/FRAME_RATE/TB" % sel, "-af", "aselect='%s',asetpts=N/SR/TB" % sel,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
            "-movflags", "+faststart", salida]


def sin_silencios(entrada):
    ff = ffmpeg()
    if not ff:
        return "Me falta ffmpeg. Di «instala ffmpeg»."
    if not entrada or not os.path.isfile(entrada):
        return "No encontré el video."
    dur = _duracion(ff, entrada)
    if not dur:
        return "No pude medir el video (falta ffprobe junto a ffmpeg)."
    try:
        r = subprocess.run([ff, "-hide_banner", "-i", entrada, "-vn", "-af", "silencedetect=noise=-32dB:d=0.6", "-f", "null", "-"], capture_output=True, timeout=900)
    except Exception as exc:
        return "No pude escuchar el audio: %s" % exc
    sil = silencios((r.stderr or b"").decode("utf-8", "ignore"))
    tr = tramos(sil, dur)
    quitado = dur - sum(b - a for a, b in tr)
    if not sil or quitado < 1:
        return "Ese video casi no tiene silencios (o no tiene audio); no hay nada que cortar."
    if not tr:
        return "Todo el video está en silencio; no lo corto."
    if len(tr) > 300:
        return "Tiene demasiados cortes (%d). Recórtalo primero en partes más cortas." % len(tr)
    sal = _salida(entrada, "_sin_silencios")
    try:
        _correr(comando_tramos(ff, entrada, sal, tr))
    except Exception as exc:
        return "No pude cortarlo: %s" % exc
    return "Listo: quité %d silencio%s (%s menos; de %s a %s). El original quedó intacto.\nGuardado en: %s" % (
        len(sil), "" if len(sil) == 1 else "s", _mmss(quitado), _mmss(dur), _mmss(dur - quitado), sal)


def _mmss(x):
    x = int(round(x))
    return "%d:%02d" % (x // 60, x % 60)


def manejar(t):
    """Comando de chat -> None | tupla. PURO.
    ('instalar',) ('estilos',) ('editar', ruta|None, orden) ('extra', ruta|None, 'audio'|'gif') ('unir', carpeta)"""
    s = (t or "").strip()
    n = _norm(s).rstrip(".!?")
    if n in ("instala ffmpeg", "instalar ffmpeg"):
        return ("instalar",)
    if n in ("estilos de video", "que estilos de video hay", "ayuda de video", "editor de video"):
        return ("estilos",)
    m = re.match(r"^une (?:los )?videos? de (?:la carpeta )?(.+)$", s, re.I)
    if m:
        return ("unir", m.group(1).strip().strip('"'))
    ruta = None
    mr = re.search(r'"([^"]+\.(?:mp4|mov|mkv|webm|avi|m4v))"|([A-Za-z]:\\[^:*?"<>|]+?\.(?:mp4|mov|mkv|webm|avi|m4v))|(/[^\s:]+\.(?:mp4|mov|mkv|webm|avi|m4v))', s, re.I)
    if mr:
        ruta = next(g for g in mr.groups() if g)
    tiene = ruta or re.search(r"(?:el |mi )?ultimo video|este video|el video", n)
    if not tiene:
        return None
    if re.match(r"^(?:saca|extrae|dame) el audio", n):
        return ("extra", ruta, "audio")
    if re.match(r"^(?:quita|quitale|corta|cortale|saca|elimina|borra)(?: (?:los|todos los))? silencios", n):
        return ("silencios", ruta)
    if re.match(r"^(?:haz|crea|saca) un gif", n):
        return ("extra", ruta, "gif")
    if re.match(r"^(?:edita|editame|recorta|corta|convierte|pasa|pon)\b", n):
        return ("editar", ruta, s)
    return None


def responder(acc):
    if acc[0] == "instalar":
        return instalar()
    if acc[0] == "estilos":
        return ("Edito videos en tu PC (el original nunca se toca). Ejemplo:\n«edita el último video: recorta de 0:05 a 0:20, vertical, estilo noir, texto \"HOLA\"»\n"
                "Estilos: " + ", ".join(sorted(ESTILOS)) + ".\nTambién: velocidad 1.5 · sin audio · cuadrado · «como siempre» · «saca el audio del último video» · «haz un gif del último video» · «quita los silencios del último video» · «une los videos de la carpeta …».")
    if acc[0] == "unir":
        return unir(acc[1])
    ruta = acc[1] or ultimo_video()
    if acc[0] == "extra":
        return extra(ruta, acc[2])
    if acc[0] == "silencios":
        return sin_silencios(ruta)
    return editar(ruta, acc[2])
