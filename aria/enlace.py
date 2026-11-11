# -*- coding: utf-8 -*-
"""ARIA <-> ASAGI: enlace propio, sin servidores ni puertos (regla v2).

Los dos lados SOLO salen a internet (nadie escucha): se encuentran en un gist
privado de GitHub que hace de buzon. Cada mensaje viaja CIFRADO de extremo a
extremo con una clave que solo conocen ARIA y ASAGI; GitHub solo ve bytes.

Solo biblioteca estandar (urllib, hashlib, hmac, json). Sin dependencias nuevas.
ARIA arranca y funciona igual sin red: el enlace es una skill, no un requisito.

Espejo exacto de enlace.js de ASAGI (mismo formato, misma criptografia).

Uso por consola:
    python enlace.py crear                 crea el buzon y muestra el CODIGO de enlace
    python enlace.py vincular CODIGO       une esta PC a un buzon creado desde ASAGI
    python enlace.py enviar "texto"        nota para ASAGI
    python enlace.py pendiente "texto"     pendiente que aparece en el celular
    python enlace.py recibir               trae lo nuevo
    python enlace.py estado
"""
from __future__ import annotations

import base64
import getpass
import hashlib
import hmac
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

VERSION = 1
YO = "aria"
OTRO = "asagi"
API = "https://api.github.com"
ARCHIVO = "enlace.json"
ITER = 100000
MAX_MSGS = 150
MAX_EDAD_MS = 7 * 24 * 3600 * 1000
LATIDO_MS = 15 * 60 * 1000
ALFABETO = "abcdefghijklmnopqrstuvwxyz234567"

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
CFG_FILE = os.path.join(DATA_DIR, "enlace_cfg.json")
ESTADO_FILE = os.path.join(DATA_DIR, "enlace_estado.json")
AUDIT_FILE = os.path.join(DATA_DIR, "enlace_audit.jsonl")


# ------------------------------------------------------------------ puro

def ahora_ms() -> int:
    return int(time.time() * 1000)


def nueva_clave(n: int = 24) -> str:
    return "".join(secrets.choice(ALFABETO) for _ in range(n))


def hacer_codigo(gist: str, clave: str) -> str:
    return "ENL1-%s-%s" % (gist, clave)


def parsear_codigo(codigo: str) -> Optional[Tuple[str, str]]:
    partes = (codigo or "").strip().split("-")
    if len(partes) != 3 or partes[0].upper() != "ENL1":
        return None
    gist, clave = partes[1].strip(), partes[2].strip().lower()
    if not gist or not clave:
        return None
    return gist, clave


def derivar(clave: str, sal_hex: str) -> Tuple[bytes, bytes]:
    dk = hashlib.pbkdf2_hmac("sha256", clave.encode("utf-8"), bytes.fromhex(sal_hex), ITER, 64)
    return dk[:32], dk[32:]


def _flujo(k_enc: bytes, nonce: bytes, n: int) -> bytes:
    out = b""
    i = 0
    while len(out) < n:
        out += hmac.new(k_enc, nonce + i.to_bytes(4, "big"), hashlib.sha256).digest()
        i += 1
    return out[:n]


def _aad(mid: str, de: str, ts: int) -> bytes:
    return ("%s|%s|%d" % (mid, de, ts)).encode("utf-8")


def cifrar(claves: Tuple[bytes, bytes], mid: str, de: str, ts: int, carga: Dict[str, Any],
           nonce: Optional[bytes] = None) -> str:
    k_enc, k_mac = claves
    nonce = nonce or secrets.token_bytes(12)
    pt = json.dumps(carga, ensure_ascii=False, separators=(",", ":")).encode("utf-8")  # igual que JSON.stringify
    ct = bytes(a ^ b for a, b in zip(pt, _flujo(k_enc, nonce, len(pt))))
    tag = hmac.new(k_mac, _aad(mid, de, ts) + b"\x00" + nonce + ct, hashlib.sha256).digest()[:16]
    return base64.b64encode(nonce + ct + tag).decode("ascii")


def descifrar(claves: Tuple[bytes, bytes], mid: str, de: str, ts: int, c: str) -> Optional[Dict[str, Any]]:
    """Devuelve la carga, o None si el mensaje fue alterado o la clave no es."""
    k_enc, k_mac = claves
    try:
        crudo = base64.b64decode(c)
        if len(crudo) < 28:
            return None
        nonce, ct, tag = crudo[:12], crudo[12:-16], crudo[-16:]
        bueno = hmac.new(k_mac, _aad(mid, de, ts) + b"\x00" + nonce + ct, hashlib.sha256).digest()[:16]
        if not hmac.compare_digest(tag, bueno):
            return None
        pt = bytes(a ^ b for a, b in zip(ct, _flujo(k_enc, nonce, len(ct))))
        carga = json.loads(pt.decode("utf-8"))
        return carga if isinstance(carga, dict) else None
    except Exception:
        return None


def doc_nuevo(sal_hex: Optional[str] = None) -> Dict[str, Any]:
    return {"v": VERSION, "sal": sal_hex or secrets.token_hex(16), "vistos": {}, "msgs": []}


def doc_valido(doc: Any) -> bool:
    return (isinstance(doc, dict) and doc.get("v") == VERSION
            and isinstance(doc.get("sal"), str) and len(doc["sal"]) == 32
            and isinstance(doc.get("msgs"), list))


def nuevo_id(de: str, ts: int) -> str:
    return "%s-%d-%s" % (de, ts, secrets.token_hex(4))


def fusionar(msgs_doc: List[Dict[str, Any]], extra: List[Dict[str, Any]], ahora: int) -> List[Dict[str, Any]]:
    """Union por id, ordenada por tiempo, sin lo viejo y con tope. Pura."""
    por_id: Dict[str, Dict[str, Any]] = {}
    for m in list(msgs_doc or []) + list(extra or []):
        if (isinstance(m, dict) and isinstance(m.get("id"), str) and isinstance(m.get("de"), str)
                and isinstance(m.get("ts"), int) and isinstance(m.get("c"), str)):
            por_id.setdefault(m["id"], {"id": m["id"], "de": m["de"], "ts": m["ts"], "c": m["c"]})
    vivos = [m for m in por_id.values() if ahora - m["ts"] <= MAX_EDAD_MS]
    vivos.sort(key=lambda m: (m["ts"], m["id"]))
    return vivos[-MAX_MSGS:]


def entrantes(msgs: List[Dict[str, Any]], yo: str, procesados: List[str]) -> List[Dict[str, Any]]:
    hechos = set(procesados or [])
    return [m for m in msgs if m.get("de") != yo and m.get("id") not in hechos]


# ------------------------------------------------------------------ disco

def _leer_json(ruta: str, defecto: Any) -> Any:
    try:
        with open(ruta, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return defecto


def _guardar_json(ruta: str, dato: Any) -> None:
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dato, f, ensure_ascii=False)
    os.replace(tmp, ruta)


def _audit(motivo: str, resultado: str) -> None:
    """Regla v2: cada salida a internet queda en el log (dominio, motivo, resultado)."""
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(AUDIT_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps({"ts": time.time(), "dominio": "api.github.com",
                                "motivo": motivo, "resultado": resultado}, ensure_ascii=False) + "\n")
    except Exception:
        pass


def cfg() -> Dict[str, str]:
    c = _leer_json(CFG_FILE, {})
    if not isinstance(c, dict):
        c = {}
    tok = os.environ.get("ARIA_ENLACE_TOKEN", "").strip() or str(c.get("token", "")).strip()
    return {"token": tok, "gist": str(c.get("gist", "")).strip(), "clave": str(c.get("clave", "")).strip()}


def vinculado() -> bool:
    c = cfg()
    return bool(c["token"] and c["gist"] and c["clave"])


def _estado() -> Dict[str, Any]:
    e = _leer_json(ESTADO_FILE, {})
    if not isinstance(e, dict):
        e = {}
    e.setdefault("procesados", [])
    e.setdefault("salida", [])
    e.setdefault("recibidos", [])
    return e


# ------------------------------------------------------------------ red (solo salida)

def _http(metodo: str, ruta: str, token: str, cuerpo: Optional[Dict[str, Any]] = None,
          motivo: str = "") -> Tuple[int, Any]:
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request(API + ruta, data=datos, method=metodo)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "ARIA-enlace")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    if datos is not None:
        req.add_header("Content-Type", "application/json; charset=utf-8")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            crudo = r.read().decode("utf-8", "replace")
            _audit(motivo or metodo, "ok %d" % r.status)
            try:
                return r.status, json.loads(crudo)
            except Exception:
                return r.status, crudo
    except urllib.error.HTTPError as e:
        _audit(motivo or metodo, "http %d" % e.code)
        return e.code, None
    except Exception as e:
        _audit(motivo or metodo, "sin red: %s" % type(e).__name__)
        return 0, None


def _explicar(status: int) -> str:
    if status == 0:
        return "Sin conexion a internet."
    if status == 401:
        return "GitHub rechazo el token (401). Revisa que este bien copiado y no vencido."
    if status == 403:
        return "GitHub nego el acceso (403). Al token le falta el permiso 'gist' o alcanzo el limite."
    if status == 404:
        return "No encuentro el buzon (404). Revisa el codigo de enlace y que el token sea de la misma cuenta."
    return "GitHub respondio %d." % status


def _leer_doc(token: str, gist: str) -> Tuple[int, Optional[Dict[str, Any]]]:
    st, cuerpo = _http("GET", "/gists/" + gist, token, motivo="leer buzon")
    if st != 200 or not isinstance(cuerpo, dict):
        return st, None
    arch = (cuerpo.get("files") or {}).get(ARCHIVO) or {}
    try:
        doc = json.loads(arch.get("content") or "")
    except Exception:
        return 200, None
    return 200, doc if doc_valido(doc) else None


def _escribir_doc(token: str, gist: str, doc: Dict[str, Any]) -> int:
    st, _ = _http("PATCH", "/gists/" + gist, token,
                  {"files": {ARCHIVO: {"content": json.dumps(doc, ensure_ascii=False)}}},
                  motivo="escribir buzon")
    return st


# ------------------------------------------------------------------ operaciones

def crear(token: str) -> Dict[str, Any]:
    """Crea el buzon (gist privado) y devuelve el codigo para pegar en ASAGI."""
    token = (token or "").strip()
    if not token:
        return {"ok": False, "texto": "Falta el token de GitHub."}
    doc = doc_nuevo()
    st, cuerpo = _http("POST", "/gists", token, {
        "description": "ASAGI <-> ARIA enlace (cifrado)", "public": False,
        "files": {ARCHIVO: {"content": json.dumps(doc)}}}, motivo="crear buzon")
    if st not in (200, 201) or not isinstance(cuerpo, dict) or not cuerpo.get("id"):
        return {"ok": False, "texto": _explicar(st)}
    clave = nueva_clave()
    _guardar_json(CFG_FILE, {"token": token, "gist": cuerpo["id"], "clave": clave})
    codigo = hacer_codigo(cuerpo["id"], clave)
    return {"ok": True, "codigo": codigo,
            "texto": "Enlace creado. Pega este codigo en ASAGI (Status > Enlace con ARIA):\n" + codigo}


def vincular(token: str, codigo: str) -> Dict[str, Any]:
    """Une esta PC a un buzon ya creado (por ejemplo desde ASAGI)."""
    token = (token or "").strip()
    par = parsear_codigo(codigo)
    if not token:
        return {"ok": False, "texto": "Falta el token de GitHub."}
    if not par:
        return {"ok": False, "texto": "Ese codigo no tiene la forma ENL1-xxxx-xxxx."}
    gist, clave = par
    st, doc = _leer_doc(token, gist)
    if st != 200:
        return {"ok": False, "texto": _explicar(st)}
    if doc is None:
        return {"ok": False, "texto": "El buzon existe pero su contenido no es un enlace valido."}
    _guardar_json(CFG_FILE, {"token": token, "gist": gist, "clave": clave})
    return {"ok": True, "texto": "ARIA quedo enlazada con ASAGI."}


def desvincular() -> Dict[str, Any]:
    for ruta in (CFG_FILE, ESTADO_FILE):
        try:
            os.remove(ruta)
        except Exception:
            pass
    return {"ok": True, "texto": "Enlace quitado de esta PC."}


def _encolar(tipo: str, cuerpo: str) -> Optional[Dict[str, Any]]:
    c = cfg()
    cuerpo = (cuerpo or "").strip()
    if not cuerpo:
        return None
    est = _estado()
    ts = ahora_ms()
    # la sal vive en el buzon; se resuelve al sincronizar. Aqui se guarda en claro
    # SOLO en el disco local hasta que sale cifrado.
    est["salida"].append({"id": nuevo_id(YO, ts), "de": YO, "ts": ts, "tipo": tipo, "cuerpo": cuerpo})
    _guardar_json(ESTADO_FILE, est)
    return est["salida"][-1]


def sincronizar(forzar: bool = False) -> Dict[str, Any]:
    """Un ciclo: baja el buzon, lee lo nuevo, sube lo pendiente. Idempotente."""
    c = cfg()
    if not (c["token"] and c["gist"] and c["clave"]):
        return {"ok": False, "texto": "ARIA no esta enlazada. Usa: python enlace.py crear  (o vincular CODIGO)."}
    st, doc = _leer_doc(c["token"], c["gist"])
    if st != 200:
        return {"ok": False, "texto": _explicar(st)}
    if doc is None:
        return {"ok": False, "texto": "El buzon esta dañado o no es un enlace."}
    claves = derivar(c["clave"], doc["sal"])
    est = _estado()
    t = ahora_ms()

    # 1) entrantes
    nuevos: List[Dict[str, Any]] = []
    ilegibles = 0
    for m in entrantes(doc["msgs"], YO, est["procesados"]):
        carga = descifrar(claves, m["id"], m["de"], m["ts"], m["c"])
        est["procesados"].append(m["id"])
        if carga is None:
            ilegibles += 1
            continue
        item = {"id": m["id"], "de": m["de"], "ts": m["ts"],
                "tipo": str(carga.get("tipo", "nota")), "cuerpo": str(carga.get("cuerpo", ""))}
        nuevos.append(item)
        est["recibidos"].append(item)
    est["procesados"] = est["procesados"][-600:]
    est["recibidos"] = est["recibidos"][-50:]

    # 2) salientes: lo que ya esta en el buzon queda confirmado
    en_doc = {m.get("id") for m in doc["msgs"]}
    confirmados = [s for s in est["salida"] if s["id"] in en_doc]
    faltan = [s for s in est["salida"] if s["id"] not in en_doc and t - s["ts"] <= MAX_EDAD_MS]
    est["salida"] = faltan

    # 3) escribir solo si hace falta (cada escritura crea una revision del gist)
    latido_viejo = t - int((doc.get("vistos") or {}).get(YO, 0) or 0) > LATIDO_MS
    escrito = False
    if faltan or latido_viejo or forzar:
        cifrados = [{"id": s["id"], "de": YO, "ts": s["ts"],
                     "c": cifrar(claves, s["id"], YO, s["ts"], {"tipo": s["tipo"], "cuerpo": s["cuerpo"]})}
                    for s in faltan]
        doc["msgs"] = fusionar(doc["msgs"], cifrados, t)
        vistos = doc.get("vistos") if isinstance(doc.get("vistos"), dict) else {}
        vistos[YO] = t
        doc["vistos"] = vistos
        stw = _escribir_doc(c["token"], c["gist"], doc)
        if stw != 200:
            _guardar_json(ESTADO_FILE, est)
            return {"ok": False, "texto": "Lei el buzon pero no pude escribir. " + _explicar(stw),
                    "nuevos": nuevos}
        escrito = True
    _guardar_json(ESTADO_FILE, est)
    visto_otro = int((doc.get("vistos") or {}).get(OTRO, 0) or 0)
    return {"ok": True, "nuevos": nuevos, "ilegibles": ilegibles, "en_cola": len(faltan) if not escrito else 0,
            "subidos": len(faltan) if escrito else 0, "confirmados": len(confirmados),
            "visto_otro": visto_otro, "ahora": t}


def _hace(ms: int, ahora: int) -> str:
    if not ms:
        return "aun no aparece"
    seg = max(0, (ahora - ms) // 1000)
    if seg < 90:
        return "hace un momento"
    if seg < 3600:
        return "hace %d min" % (seg // 60)
    if seg < 86400:
        return "hace %d h" % (seg // 3600)
    return "hace %d dias" % (seg // 86400)


def _texto_nuevos(nuevos: List[Dict[str, Any]]) -> str:
    if not nuevos:
        return "Nada nuevo de ASAGI."
    lineas = []
    for n in nuevos:
        marca = "pendiente" if n["tipo"] == "pendiente" else "nota"
        lineas.append("- [%s] %s" % (marca, n["cuerpo"]))
    return "De ASAGI:\n" + "\n".join(lineas)


def enviar(texto: str, tipo: str = "nota") -> Dict[str, Any]:
    if not vinculado():
        return {"ok": False, "texto": "ARIA no esta enlazada. Usa: python enlace.py crear  (o vincular CODIGO)."}
    if not _encolar(tipo, texto):
        return {"ok": False, "texto": "Falta el texto a enviar."}
    r = sincronizar()
    if not r.get("ok"):
        return {"ok": False, "texto": "Guardado en cola; saldra cuando haya conexion. " + r.get("texto", "")}
    extra = ("\n" + _texto_nuevos(r["nuevos"])) if r.get("nuevos") else ""
    que = "Pendiente enviado al celular" if tipo == "pendiente" else "Nota enviada a ASAGI"
    return {"ok": True, "texto": que + "." + extra, "nuevos": r.get("nuevos", [])}


def recibir() -> Dict[str, Any]:
    r = sincronizar()
    if not r.get("ok"):
        return r
    return {"ok": True, "texto": _texto_nuevos(r["nuevos"]), "nuevos": r["nuevos"]}


def estado() -> Dict[str, Any]:
    if not vinculado():
        return {"ok": True, "enlazada": False,
                "texto": "ARIA no esta enlazada con ASAGI. Usa: python enlace.py crear  (o vincular CODIGO)."}
    r = sincronizar()
    if not r.get("ok"):
        return {"ok": False, "enlazada": True, "texto": "Enlazada, pero ahora no llego al buzon. " + r.get("texto", "")}
    return {"ok": True, "enlazada": True, "visto_otro": r["visto_otro"],
            "texto": "Enlace activo. ASAGI: %s. %s" % (_hace(r["visto_otro"], r["ahora"]),
                                                      _texto_nuevos(r["nuevos"]))}


# ------------------------------------------------------------------ consola

def _main(argv: List[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 0
    orden = argv[1].lower()
    resto = " ".join(argv[2:]).strip()
    if orden == "crear":
        tok = os.environ.get("ARIA_ENLACE_TOKEN", "").strip() or getpass.getpass("Token de GitHub (permiso gist): ")
        r = crear(tok)
    elif orden == "vincular":
        tok = os.environ.get("ARIA_ENLACE_TOKEN", "").strip() or getpass.getpass("Token de GitHub (permiso gist): ")
        r = vincular(tok, resto)
    elif orden == "enviar":
        r = enviar(resto, "nota")
    elif orden == "pendiente":
        r = enviar(resto, "pendiente")
    elif orden == "recibir":
        r = recibir()
    elif orden == "estado":
        r = estado()
    elif orden == "desvincular":
        r = desvincular()
    else:
        print(__doc__)
        return 1
    print(r.get("texto", r))
    return 0 if r.get("ok") else 2


if __name__ == "__main__":
    sys.exit(_main(sys.argv))
