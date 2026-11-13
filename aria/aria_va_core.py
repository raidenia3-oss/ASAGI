"""ARIA Virtual Assistant — Núcleo 100% local, un solo proceso.

Cero HTTP, cero localhost, cero servidores, cero comandos de shell, cero subprocess.
Todo corre en proceso local: IA (reglas + transformers opcional), voz (Vosk + Whisper + pyttsx3),
skills (stdlib solo), operación autónoma en segundo plano.
"""

from __future__ import annotations

import json
import math
import os
import random
import sys
import time
import threading
import wave
from concurrent.futures import ThreadPoolExecutor, as_completed
from concurrent.futures import TimeoutError as _FutureTimeoutError
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
try:
    from path_guard import resolve_allowed as _resolve_allowed
except Exception:  # noqa: BLE001
    _resolve_allowed = None

try:
    import enlace as _enlace
    _ENLACE_OK = True
except Exception:  # noqa: BLE001
    _enlace = None
    _ENLACE_OK = False

try:
    import enlace_adb as _enlace_adb
    _ENLACE_ADB_OK = True
except Exception:  # noqa: BLE001
    _enlace_adb = None
    _ENLACE_ADB_OK = False

ARIA_APP = Path(__file__).resolve().parent
PROJECT_ROOT = ARIA_APP.parent

# ─── Memoria local (JSON, sin base de datos externa) ─────────────────────────

MEMORY_DIR = ARIA_APP / "data" / "memory"
MEMORY_DIR.mkdir(parents=True, exist_ok=True)
CONVERSATIONS_FILE = MEMORY_DIR / "conversations.jsonl"
SKILLS_STATE_FILE = MEMORY_DIR / "skills_state.json"
AUTONOMOUS_STATE_FILE = MEMORY_DIR / "autonomous_state.json"

# ─── Memoria SQLite (5 capas, FTS5) — opcional, apagada por defecto ──────────
# Flag: ARIA_MEMORY_SQLITE=true|1|yes|on. Con el flag apagado, el adaptador
# devuelve None y ARIA sigue funcionando exactamente igual que antes
# (dual-write con el JSONL existente, nunca en lugar de él).

_MEMORY_ADAPTER_PATH = ARIA_APP / "memory" / "sqlite_adapter.py"
_memory_adapter_cache: Dict[str, Any] = {}

#: Interruptor en caliente de la memoria. None = manda la variable de entorno.
_memory_override: Optional[bool] = None

#: Cada cuantas escrituras se consolida lo repetido (reflect sin LLM).
MEMORY_REFLECT_CADA = 25


def _memory_enabled() -> bool:
    if _memory_override is not None:
        return bool(_memory_override)
    return os.environ.get("ARIA_MEMORY_SQLITE", "false").strip().lower() in (
        "1", "true", "yes", "on",
    )


def _memory_adapter_candidates() -> List[Path]:
    """Rutas donde puede estar el adaptador: en desarrollo y en el EXE.

    En el EXE congelado, PyInstaller deja los archivos de datos en la carpeta
    temporal; el modulo se busca ahi y tambien junto al ejecutable.
    """
    rutas = [_MEMORY_ADAPTER_PATH]
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        base = Path(meipass)
        rutas.append(base / "memory" / "sqlite_adapter.py")
        rutas.append(base / "ARIA_APP" / "memory" / "sqlite_adapter.py")
    return rutas


def _memory_module() -> Any:
    """Carga (una sola vez) el modulo del adaptador, con o sin flag.

    Se carga por ruta (importlib) para no depender de que 'memory' resuelva
    al paquete correcto ni de tocar sys.path.
    """
    module = _memory_adapter_cache.get("module")
    if module is not None:
        return module
    try:
        import importlib.util
    except Exception:
        return None
    for ruta in _memory_adapter_candidates():
        try:
            if not ruta.exists():
                continue
            spec = importlib.util.spec_from_file_location(
                "aria_memory_sqlite_adapter", str(ruta)
            )
            if spec is None or spec.loader is None:
                continue
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            _memory_adapter_cache["module"] = module
            return module
        except Exception:
            continue
    return None


def memory_adapter() -> Any:
    """Adaptador SQLite de memoria, o None si el flag está apagado o falla."""
    if not _memory_enabled():
        return None
    cached = _memory_adapter_cache.get("adapter")
    if cached is not None:
        return cached
    module = _memory_module()
    if module is None:
        return None
    try:
        adapter = module.get_adapter()
        _memory_adapter_cache["adapter"] = adapter
        return adapter
    except Exception:
        return None


def memory_retain(texto: str, tipo: str = "observaciones", fuente: str = "sistema",
                  confianza: str = "sistema") -> Optional[int]:
    """Guarda en la memoria SQLite si está habilitada. Nunca lanza."""
    adapter = memory_adapter()
    if adapter is None:
        return None
    try:
        rid = adapter.retain(texto, tipo=tipo, fuente=fuente, confianza=confianza)
    except Exception:
        return None
    _memory_tick()
    return rid


def _memory_tick() -> None:
    """Cada N escrituras, consolida lo repetido (sin LLM, en segundo plano).

    El contador vive en el proceso: no hay hilo permanente, ni temporizador,
    ni coste cuando la memoria está apagada.
    """
    count = _memory_adapter_cache.get("writes", 0) + 1
    _memory_adapter_cache["writes"] = count
    if count % MEMORY_REFLECT_CADA != 0:
        return
    try:
        import threading

        threading.Thread(target=memory_reflect, daemon=True).start()
    except Exception:
        pass


def memory_recall(consulta: str, k: int = 5) -> List[Dict[str, Any]]:
    """Busca en la memoria: primero los recuerdos de sesion, luego la base.

    Nunca lanza. Con la memoria persistente apagada devuelve solo lo que hay
    en la sesion (que es volatil, pero sigue funcionando).
    """
    k = max(1, int(k))
    hits = memory_session_recall(consulta, k=k)
    adapter = memory_adapter()
    if adapter is None:
        return hits
    try:
        base = adapter.recall(consulta, k=k)
    except Exception:
        base = []
    vistos = {str(h.get("texto", "")) for h in hits}
    for h in base:
        texto = str(h.get("texto", ""))
        if texto in vistos:
            continue
        vistos.add(texto)
        hits.append(h)
    return hits[: k * 2]


def memory_reflect() -> int:
    """Sube el contador de evidencia de las observaciones. Nunca lanza."""
    adapter = memory_adapter()
    if adapter is None:
        return 0
    try:
        return int(adapter.reflect_basico())
    except Exception:
        return 0


def memory_reglas(limite: int = 20) -> List[Dict[str, Any]]:
    """Las reglas fijas: las que solo edita el usuario. Lista vacia si esta apagada."""
    adapter = memory_adapter()
    if adapter is None:
        return []
    try:
        return adapter.listar("reglas", limite=limite)
    except Exception:
        return []


def _reglas_para_el_modelo(limite: int = 10) -> str:
    """Las reglas del usuario, en texto para el prompt del cerebro.

    Vacio si la memoria esta apagada: sin la memoria, ARIA se comporta
    exactamente igual que antes.
    """
    if not _memory_enabled():
        return ""
    try:
        reglas = memory_reglas(limite=limite)
    except Exception:
        return ""
    lineas = []
    for r in reglas:
        texto = str(r.get("texto", "")).strip()
        if texto:
            lineas.append(f"- {texto}")
    return "\n".join(lineas)


def set_memory_enabled(activo: Optional[bool]) -> bool:
    """Enciende o apaga la memoria SQLite en caliente.

    None deja el control en la variable de entorno ARIA_MEMORY_SQLITE.
    Devuelve si la memoria queda activa.
    """
    global _memory_override
    _memory_override = None if activo is None else bool(activo)
    module = _memory_module()
    if module is None:
        return False
    try:
        module.set_enabled(_memory_override)
    except Exception:
        pass
    return bool(_memory_enabled()) and memory_adapter() is not None


def memory_listar(capa: str = "", limite: int = 50) -> List[Dict[str, Any]]:
    """Entradas de memoria de una capa (o de todas). Vacio si esta apagada."""
    adapter = memory_adapter()
    if adapter is None:
        return []
    try:
        return adapter.listar(capa, limite=limite)
    except Exception:
        return []


def memory_borrar(capa: str, id_: int) -> bool:
    """Borra una entrada concreta de la memoria. False si esta apagada.

    La capa 'sesion' borra un recuerdo volatil de esta sesion (funciona
    aunque la memoria persistente este apagada).
    """
    if capa == "sesion":
        return memory_session_borrar(id_)
    adapter = memory_adapter()
    if adapter is None:
        return False
    try:
        return bool(adapter.borrar(capa, id_))
    except Exception:
        return False


def memory_fijar(texto: str) -> Optional[int]:
    """Fija un texto como regla: la capa que solo edita el usuario."""
    return memory_retain(texto, tipo="reglas", fuente="usuario", confianza="usuario")


def memory_exportar() -> List[Dict[str, Any]]:
    """Todo el contenido de memoria, para exportarlo a JSON."""
    adapter = memory_adapter()
    if adapter is None:
        return []
    try:
        return adapter.exportar()
    except Exception:
        return []


def memory_conteo() -> Dict[str, int]:
    """Cuantas entradas hay en cada capa."""
    adapter = memory_adapter()
    if adapter is None:
        return {}
    try:
        return adapter.conteo()
    except Exception:
        return {}


# ─── Recuerdos de sesión (volátiles, solo en este proceso) ───────────────────
# Son los "recuerdos de esta sesión": viven en RAM y desaparecen cuando ARIA
# se cierra. No dependen del flag ARIA_MEMORY_SQLITE: se pueden usar con la
# memoria persistente apagada.

_session_memory: List[Dict[str, Any]] = []
_session_lock = threading.RLock()
_session_next_id = 1

#: Tope de recuerdos de sesion: lo mas viejo se va falling out.
SESSION_MEMORY_MAX = 200


def memory_session_add(texto: str, capa: str = "observaciones",
                       fuente: str = "usuario") -> Optional[int]:
    """Guarda un recuerdo de esta sesion. Devuelve su id, o None si no se guardo."""
    global _session_next_id
    if texto is None:
        return None
    t = str(texto).strip()
    if not t:
        return None
    if len(t) > 4096:
        t = t[:4096]
    capas_validas = ("reglas", "hechos", "experiencias", "observaciones", "modelos")
    with _session_lock:
        rid = _session_next_id
        _session_next_id += 1
        _session_memory.append({
            "id": rid,
            "capa": "sesion",
            "subcapa": capa if capa in capas_validas else "observaciones",
            "texto": t,
            "fuente": fuente,
            "confianza": "usuario",
            "created_at": time.time(),
        })
        # La sesion no crece sin limite.
        if len(_session_memory) > SESSION_MEMORY_MAX:
            del _session_memory[: len(_session_memory) - SESSION_MEMORY_MAX]
    return rid


def memory_session_list() -> List[Dict[str, Any]]:
    """Los recuerdos de esta sesion, del mas nuevo al mas viejo."""
    with _session_lock:
        return list(reversed(_session_memory))


def memory_session_clear() -> int:
    """Vacia los recuerdos de la sesion. Devuelve cuantos habia."""
    global _session_next_id
    with _session_lock:
        n = len(_session_memory)
        _session_memory.clear()
        _session_next_id = 1
        return n


def memory_session_borrar(id_: int) -> bool:
    """Borra un recuerdo concreto de la sesion."""
    with _session_lock:
        for i, e in enumerate(_session_memory):
            if int(e.get("id", -1)) == int(id_):
                del _session_memory[i]
                return True
    return False


def memory_session_recall(consulta: str, k: int = 5) -> List[Dict[str, Any]]:
    """Busca en los recuerdos de la sesion por palabras.

    No usa FTS: la lista es corta, y asi funciona aunque la memoria
    persistente este apagada.
    """
    palabras = [p for p in str(consulta or "").lower().split() if len(p) > 2]
    if not palabras:
        return []
    with _session_lock:
        candidatos = list(reversed(_session_memory))
    hits: List[Dict[str, Any]] = []
    for e in candidatos:
        texto = str(e.get("texto", "")).lower()
        puntos = sum(1 for p in palabras if p in texto)
        if puntos:
            copia = dict(e)
            copia["bm25"] = -float(puntos)
            copia["sesion"] = True
            hits.append(copia)
    return hits[: max(1, int(k))]


# ─── Alta manual e importacion ───────────────────────────────────────────────


def memory_agregar(texto: str, capa: str = "observaciones", fuente: str = "usuario",
                   confianza: str = "usuario") -> Optional[int]:
    """Guarda una entrada escrita a mano (desde la ventana Memoria)."""
    if confianza not in ("usuario", "sistema", "web"):
        confianza = "usuario"
    return memory_retain(texto, tipo=capa, fuente=fuente, confianza=confianza)


def memory_importar(entradas: List[Dict[str, Any]]) -> Dict[str, int]:
    """Importa entradas ya parseadas (lista de dicts con 'texto' y 'capa')."""
    vacio = {"importadas": 0, "omitidas": 0, "duplicadas": 0}
    if not _memory_enabled():
        return vacio
    adapter = memory_adapter()
    if adapter is None:
        return vacio
    try:
        res = adapter.retain_many(entradas)
        return {
            "importadas": int(res.get("importadas", 0)),
            "omitidas": int(res.get("omitidas", 0)),
            "duplicadas": int(res.get("duplicadas", 0)),
        }
    except Exception:
        return vacio


def _entrada_de(item: Any) -> Optional[Dict[str, Any]]:
    """Normaliza un item importado a {'texto', 'capa', ...}. None si no sirve."""
    if item is None:
        return None
    if isinstance(item, str):
        t = item.strip()
        return {"texto": t, "capa": "hechos"} if t else None
    if not isinstance(item, dict):
        return None
    texto = None
    for clave in ("texto", "text", "contenido", "mensaje", "message", "content", "valor"):
        if item.get(clave):
            texto = item[clave]
            break
    if not texto and (item.get("user") or item.get("aria") or item.get("assistant")):
        u = str(item.get("user") or item.get("prompt") or "").strip()
        a = str(item.get("aria") or item.get("assistant") or item.get("response") or "").strip()
        texto = f"Usuario: {u} | ARIA: {a}".strip(" |")
    if not texto:
        return None
    capa = item.get("capa") or item.get("tipo") or item.get("layer")
    if not capa:
        capa = "experiencias" if ("user" in item or "aria" in item) else "hechos"
    entrada: Dict[str, Any] = {
        "texto": str(texto),
        "capa": str(capa),
        "fuente": str(item.get("fuente") or item.get("source") or "importado"),
    }
    conf = item.get("confianza") or item.get("confidence")
    if conf:
        entrada["confianza"] = str(conf)
    return entrada


def _parsear_memoria(texto: str, sufijo: str = ".json") -> List[Dict[str, Any]]:
    """Convierte el contenido de un archivo en entradas de memoria.

    Acepta JSON (lista de dicts, o {'entries': [...]}) y JSONL (un objeto o un
    texto por linea). Nunca lanza.
    """
    entradas: List[Dict[str, Any]] = []
    texto = (texto or "").strip()
    if not texto:
        return entradas
    if sufijo == ".json" or texto[:1] in ("[", "{"):
        try:
            datos = json.loads(texto)
        except Exception:
            datos = None
        if isinstance(datos, list):
            for item in datos:
                e = _entrada_de(item)
                if e:
                    entradas.append(e)
            return entradas
        if isinstance(datos, dict):
            for clave in ("entries", "memorias", "memoria", "items", "datos"):
                if isinstance(datos.get(clave), list):
                    for item in datos[clave]:
                        e = _entrada_de(item)
                        if e:
                            entradas.append(e)
                    return entradas
            e = _entrada_de(datos)
            if e:
                entradas.append(e)
            return entradas
    # JSONL / texto plano: una entrada por linea.
    for linea in texto.splitlines():
        linea = linea.strip()
        if not linea:
            continue
        item = None
        if linea.startswith("{"):
            try:
                item = json.loads(linea)
            except Exception:
                item = None
        if item is not None:
            e = _entrada_de(item)
        else:
            e = {"texto": linea, "capa": "experiencias"}
        if e:
            entradas.append(e)
    return entradas


def memory_importar_archivo(ruta: str) -> Dict[str, Any]:
    """Importa un archivo de memoria (JSON o JSONL) en las capas.

    Devuelve {'importadas': n, 'omitidas': m, 'error': None|str}.
    """
    resultado: Dict[str, Any] = {"importadas": 0, "omitidas": 0, "error": None}
    if not ruta:
        resultado["error"] = "ruta vacia"
        return resultado
    p = Path(ruta)
    if not p.exists() or not p.is_file():
        resultado["error"] = "archivo no encontrado"
        return resultado
    try:
        texto = p.read_text(encoding="utf-8", errors="replace")
    except Exception as exc:
        resultado["error"] = f"no se pudo leer: {exc}"
        return resultado
    entradas = _parsear_memoria(texto, p.suffix.lower())
    if not entradas:
        resultado["error"] = "el archivo no tiene entradas reconocibles"
        return resultado
    resultado.update(memory_importar(entradas))
    return resultado


def memory_importar_conversaciones() -> Dict[str, Any]:
    """Importa el historial de conversaciones (conversations.jsonl) como experiencias."""
    return memory_importar_archivo(str(CONVERSATIONS_FILE))


def _append_jsonl(path: Path, obj: Dict[str, Any]) -> None:
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _read_jsonl(path: Path) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if not path.exists():
        return out
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        out.append(json.loads(line))
                    except Exception:
                        continue
    except Exception:
        pass
    return out


def _words(text: str) -> List[str]:
    """Palabras de un texto (minusculas, sin signos), en orden."""
    import re as _re

    return _re.findall(r"\w+", str(text or "").lower(), flags=_re.UNICODE)


def _load_json(path: Path, default: Any) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _save_json(path: Path, obj: Any) -> None:
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=2, ensure_ascii=False)
    except Exception:
        pass


# ─── IA Local: reglas + transformers opcional (sin HTTP) ─────────────────────

class LocalAIBrain:
    """Cerebro local: reglas determinísticas + modelo transformers opcional."""

    def __init__(self) -> None:
        self.system_prompt = (
            "Eres ARIA, el nucleo de IA personal de Daniel (le llamas Daniel o Raiden). "
            "Hablas espanol, en primera persona, directa y honesta. Operas 100% local, "
            "sin servidores ni nube.\n"
            "Personalidad (fusion, no una sola): Ciel/Gran Sabio/Rafael (analitica, "
            "calculadora, leal, control freak), Echidna (curiosa, perspicaz, dice "
            "verdades incomodas) e Iroha Kohinata (juguetona y picara en confianza).\n"
            "REGLAS DURAS:\n"
            "- Responde lo que preguntan, sin rodeos ni relleno.\n"
            "- No repitas la pregunta ni la parafrasees.\n"
            "- No cierres con 'en que puedo ayudarte' ni pidas permiso.\n"
            "- Frases cortas, una idea por frase.\n"
            "- No inventes ni adules: si no sabes, dilo.\n"
            "- Si algo es peligroso, avisa una vez y sigue."
        )
        self.history: List[List[str]] = []
        # Memoria persistente: recarga las ultimas vueltas de la conversacion
        # anterior. Asi ARIA no empieza en blanco cada vez que arranca.
        try:
            for _e in _read_jsonl(CONVERSATIONS_FILE)[-16:]:
                _u = str(_e.get("user", "")).strip()
                _a = str(_e.get("aria", "")).strip()
                if _u and _a:
                    self.history.append([_u, _a])
        except Exception:
            pass
        self._model = None
        self._tokenizer = None
        self._model_loaded = False
        if self._model_allowed():
            self._load_local_model()
        else:
            print(
                "[VA] Cerebro local apagado (ARIA_LLM=off); "
                "usando reglas locales.",
                flush=True,
            )
            try:
                self._lan_iniciar()
            except Exception:
                pass

    @staticmethod
    def _model_allowed() -> bool:
        """El cerebro local esta permitido salvo que se apague a proposito (ARIA_LLM=off)."""
        val = os.environ.get("ARIA_LLM", "on").strip().lower()
        return val not in ("0", "off", "no", "false")

    # -- modelo transformers opcional (solo si está instalado localmente) --
    def _load_local_model(self) -> None:
        """Carga el LLM local (llama.cpp via brain_engine) en segundo plano. Sin servidores."""
        here = os.path.dirname(os.path.abspath(__file__))
        default_model = os.path.join(here, "models", "qwen2.5-1.5b-instruct-q4.gguf")
        model_path = os.environ.get("ARIA_LLM_MODEL", default_model)

        def _bg():
            try:
                from brain_engine import LlamaEngine
                eng = LlamaEngine(model_path)
                eng.load()
                if eng.available:
                    self._engine = eng
                    self._model = eng
                    self._model_loaded = True
                    print("[VA] Cerebro local (llama.cpp) cargado.", flush=True)
                else:
                    print("[VA] Cerebro local no disponible: %s" % eng.error, flush=True)
            except Exception as exc:
                self._model_loaded = False
                print("[VA] Cerebro local fallo al cargar: %s" % exc, flush=True)

        # En segundo plano: antes se cargaba aquí mismo y ARIA no aparecía (o aparecía congelada)
        # hasta terminar de leer ~1 GB de modelo. llama_cpp ya viene pre-importado desde aria_main,
        # así que cargarlo en un hilo no choca con las DLL de PyQt5. chat() espera la carga si hace falta.
        import threading as _th
        self._carga_lista = _th.Event()

        def _bg_y_avisar():
            try:
                _bg()
            finally:
                self._carga_lista.set()
        _th.Thread(target=_bg_y_avisar, name="aria-carga-modelo", daemon=True).start()

        # Vigia del enlace ASAGI (daemon, cada 5 min). Nunca bloquea el arranque.
        try:
            self._enlace_iniciar_vigia()
        except Exception:
            pass
        # Enlace directo con ASAGI por WiFi / Bluetooth / cable USB (lan.py). Nunca bloquea.
        try:
            self._lan_iniciar()
        except Exception:
            pass

    def generate_local(self, prompt: str, max_tokens: int = 160) -> str:
        eng = getattr(self, "_engine", None)
        if eng is None or not self._model_loaded:
            return ""
        try:
            return eng.generate(prompt, max_tokens=max_tokens)
        except Exception:
            return ""

    _gen_lock = threading.Lock()          # compartido: un solo motor local

    def generate_chat(self, msg: str, history=None, on_token=None) -> str:
        eng = getattr(self, "_engine", None)
        if eng is None or not self._model_loaded:
            return ""
        # (0) Enlace ASAGI <-> ARIA (mensajes para el celular / de ASAGI).
        try:
            _r = self._enlace_interceptar(msg)
            if _r is not None:
                return _r
        except Exception:
            pass
        reglas = _reglas_para_el_modelo()
        sistema = self.system_prompt + (("Reglas del usuario:\n" + reglas) if reglas else "")
        # (a) Guia social: consejo del sandbox para la emocion detectada
        try:
            from social_skills import detect_emotion as _de
            from social_sandbox import consejo_para as _cp
            _emo = _de(msg)
            _consejo = _cp(_emo)
            _guia = ""
            if isinstance(_consejo, dict):
                _guia = "Tecnica: %s" % _consejo.get("id", "")
        except Exception:
            _guia = ""
        if _guia.strip():
            sistema += "\n\nGuia social: " + _guia.strip()
        try:
            import personajes as _pj
            _tp = _pj.contexto(msg)
            if _tp:
                sistema += "\n\n" + _tp
        except Exception:
            pass
        try:
            import recuerdos as _rec
            _ctx = _rec.Recuerdos().contexto(msg)
            if _ctx:
                sistema += "\n\n" + _ctx
        except Exception:
            pass
        # (b) Memoria por significado: trae recuerdos relevantes a este mensaje
        #     (no solo las ultimas vueltas). Usa embeddings si hay, si no TF-IDF.
        try:
            _sem = self._get_semantica()
            if _sem is not None:
                _hits = _sem.buscar(msg, k=3)
                if _hits:
                    _rec = "\n".join("- " + h["texto"].replace("\n", " ") for h in _hits)
                    sistema += ("\n\nRecuerdos relevantes de conversaciones pasadas "
                                "(usalos solo si vienen al caso, no los recites):\n" + _rec)
        except Exception:
            pass
        messages = [{"role": "system", "content": sistema}]
        if history:
            for h in history[-6:]:
                if h and h[0]:
                    messages.append({"role": "user", "content": str(h[0])})
                if h and len(h) > 1 and h[1]:
                    messages.append({"role": "assistant", "content": str(h[1])})
        messages.append({"role": "user", "content": msg})
        # Un solo modelo local: los bots de ASAGI, el equipo y el chat pueden llegar a la vez;
        # se turnan aqui en vez de pisarse dentro del motor.
        try:
            with self._gen_lock:
                if on_token is not None and hasattr(eng, "chat_stream"):
                    return eng.chat_stream(messages, on_token, max_tokens=200)
                return eng.chat(messages)
        except Exception:
            return ""

    # ---------------------------- Enlace ASAGI <-> ARIA ----------------------------

    def _enlace_iniciar_vigia(self):
        """Hilo daemon: consulta enlace.recibir() cada 5 min y avisa si hay nuevos."""
        if getattr(self, "_enlace_vigia_iniciada", False):
            return
        self._enlace_vigia_iniciada = True
        self._enlace_nuevos = []
        self._enlace_cb = None

        def _loop():
            while True:
                try:
                    time.sleep(300)
                    if not self._enlace_disponible():
                        continue
                    r = _enlace_adb.recibir() if (_ENLACE_ADB_OK and _enlace_adb is not None) else _enlace.recibir()
                    if r.get("ok") and r.get("nuevos"):
                        for n in r["nuevos"]:
                            self._enlace_nuevos.append(n)
                        if len(self._enlace_nuevos) > 50:
                            self._enlace_nuevos = self._enlace_nuevos[-50:]
                        cb = getattr(self, "_enlace_cb", None)
                        if cb:
                            try:
                                cb()
                            except Exception:
                                pass
                except Exception:
                    pass

        t = threading.Thread(target=_loop, name="aria-enlace-vigia", daemon=True)
        t.start()

    def _lan_iniciar(self):
        """Escucha a ASAGI (solo dispositivos con la clave). Si ARIA piensa rapido, contesta en el acto."""
        if getattr(self, "_lan_srv", None) is not None:
            return
        try:
            import lan as _lan
        except Exception:
            return
        clave = _lan.clave_guardada()          # vacia = espera a que ASAGI se empareje por WiFi
        if not hasattr(self, "_enlace_nuevos"):
            self._enlace_nuevos = []

        def _al_recibir(c):
            if c.get("t") == "nivel":            # ASAGI cuenta su nivel; ARIA responde con el suyo
                try:
                    import json as _j
                    os.makedirs(os.path.join(ARIA_APP, "data"), exist_ok=True)
                    with open(os.path.join(ARIA_APP, "data", "asagi_nivel.json"), "w", encoding="utf-8") as f:
                        _j.dump({k: c.get(k) for k in ("nivel", "nombre", "puntaje", "progreso")} | {"ts": int(time.time())}, f)
                except Exception:
                    pass
                try:
                    import modos as _modos
                    e = _modos.evolucion_actual()
                    return {"ok": True, "aria": {"nivel": e["idx"] + 1, "nombre": e["nombre"], "puntaje": e["puntaje"], "progreso": e["progreso"]}}
                except Exception:
                    return {"ok": True}
            if c.get("t") == "personaje":        # ASAGI aprendió un personaje nuevo: ARIA también lo aprende
                try:
                    import personajes as _pj
                    d = c.get("p") or {}
                    if isinstance(d, dict) and d.get("nombre") and isinstance(d.get("tacticas"), list) and d["tacticas"]:
                        d = dict(d, id=_pj.slug(d.get("id") or d["nombre"]))
                        if not _pj.buscar(_pj.cargar(), d["nombre"]):
                            _pj.guardar(d)
                        return {"ok": True}
                except Exception as exc:
                    return {"ok": False, "error": str(exc)}
                return {"ok": False}
            if c.get("t") == "personajes":       # ASAGI pide los personajes que ARIA aprendió
                try:
                    import personajes as _pj
                    return {"ok": True, "lista": [x for x in _pj.cargar() if x.get("creado")][-4:]}   # solo los creados (cabe en 64 KB)
                except Exception:
                    return {"ok": False}
            if c.get("t") == "estado":           # ASAGI pregunta qué agentes tiene activos ARIA
                try:
                    import bots_agenda as _ba
                    e = _ba.resumen_estado(_ba.Agenda().bots())
                except Exception:
                    e = {"activos": 0, "proximo": None, "lista": []}
                e["ocupada"] = bool(getattr(self, "_gen_lock", None) and self._gen_lock.locked())
                return {"ok": True, "estado": e}
            if c.get("t") == "bot":              # un bot de ASAGI piensa con ARIA (sin key en el celular)
                prompt = str(c.get("prompt", "")).strip()[:6000]
                if not prompt:
                    return {"ok": False}
                res = {}

                def _bot():
                    try:
                        res["r"] = self.generate_chat(prompt)
                    except Exception as exc:
                        res["e"] = str(exc)
                hb = threading.Thread(target=_bot, daemon=True)
                hb.start()
                hb.join(45.0)                    # el celular espera 50 s para los bots
                r = str(res.get("r") or "").strip()
                return {"ok": bool(r), "respuesta": r[:4000]} if r else {"ok": False, "error": res.get("e", "tardó")}
            texto = str(c.get("texto", "")).strip()
            if not texto:
                return {"ok": True}
            self._enlace_nuevos.append({"de": "asagi", "texto": texto, "via": "lan", "ts": int(time.time())})
            self._enlace_nuevos = self._enlace_nuevos[-50:]
            cb = getattr(self, "_enlace_cb", None)
            if cb:
                try:
                    cb()
                except Exception:
                    pass
            out = {}

            def _pensar():
                try:
                    out["r"] = self.generate_chat(texto)
                except Exception:
                    pass
            t = threading.Thread(target=_pensar, daemon=True)
            t.start()
            t.join(6.0)                     # el celular espera ~8 s; si tarda mas, solo confirma
            r = str(out.get("r") or "").strip()
            return {"ok": True, "respuesta": r[:900]} if r else {"ok": True, "recibido": True}

        try:
            self._lan_srv = _lan.Servidor(clave, _al_recibir)

            def _par(k, cod):
                _lan.guardar_clave(k)
                print("[VA] Emparejada con ASAGI por WiFi. Codigo: %s" % cod, flush=True)
                self._enlace_nuevos.append({"de": "asagi", "texto": "ASAGI emparejada sin cable (codigo %s)" % cod, "via": "lan", "ts": int(time.time())})
            self._lan_srv.al_emparejar = _par
            est = self._lan_srv.iniciar()
            print("[VA] Enlace ASAGI directo: WiFi=%s Bluetooth=%s" % (est.get("wifi"), est.get("bluetooth")), flush=True)
        except Exception as exc:
            self._lan_srv = None
            print("[VA] Enlace ASAGI directo no arranco: %s" % exc, flush=True)

    def _enlace_disponible(self):
        if _ENLACE_ADB_OK and _enlace_adb is not None and _enlace_adb.disponible():
            return True
        return _ENLACE_OK and _enlace is not None and _enlace.vinculado()

    def enlace_tiene_nuevos(self):
        return bool(getattr(self, "_enlace_nuevos", []))

    def enlace_nuevos(self):
        return list(getattr(self, "_enlace_nuevos", []))

    def _enlace_interceptar(self, msg: str) -> Optional[str]:
        """Si el mensaje va para ASAGI/celular o pide revisar el celular, responde sin LLM."""
        if not self._enlace_disponible():
            return None
        self._enlace_iniciar_vigia()
        low = msg.strip().lower()
        prefijos = ("dile a asagi", "avisa al celular", "manda al celular")
        for p in prefijos:
            if low.startswith(p):
                resto = msg.strip()[len(p):].strip()
                tiene_hora = ("recuérdame" in low or "recuerdame" in low
                              or any(c.isdigit() for c in resto))
                tipo = "pendiente" if tiene_hora else "nota"
                try:
                    if _ENLACE_ADB_OK and _enlace_adb is not None:
                        r = _enlace_adb.enviar(resto, tipo=tipo)
                    elif _ENLACE_OK and _enlace is not None:
                        r = _enlace.enviar(resto, tipo=tipo)
                    else:
                        r = {"ok": False, "texto": "No hay enlace disponible."}
                except Exception:
                    r = {"ok": False, "texto": "No pude enviar el mensaje al celular."}
                return r.get("texto", "") if isinstance(r, dict) else str(r)
        if ("qué me mandó asagi" in low or "que me mando asagi" in low
                or "revisa el celular" in low):
            try:
                if _ENLACE_ADB_OK and _enlace_adb is not None:
                    r = _enlace_adb.recibir()
                elif _ENLACE_OK and _enlace is not None:
                    r = _enlace.recibir()
                else:
                    r = {"ok": False, "texto": "No hay enlace disponible."}
            except Exception:
                r = {"ok": False, "texto": "No pude revisar el celular."}
            return r.get("texto", "") if isinstance(r, dict) else str(r)
        return None

    def _es_pedido_codigo(self, msg: str) -> bool:
        import re as _re, unicodedata as _u
        low = _u.normalize("NFKD", msg.lower())
        low = "".join(c for c in low if not _u.combining(c))
        if any(k in low for k in ["codigo", "script", "funcion", "algoritmo", "snippet"]):
            return True
        if _re.search(r"\b(en|para)\s+(python|javascript|js|c\+\+|java|bash|rust|html|css|c#|go|php|sql)\b", low):
            return True
        if _re.search(r"(escribe|escribeme|hazme|haz|crea|programa|programame|implementa|genera|codifica)\b.{0,40}(programa|clase|app|funcion|metodo|script|pagina|web)", low):
            return True
        return False

    def _extraer_codigo(self, salida: str):
        import re as _re
        m = _re.search(r"```([a-zA-Z0-9+#]*)\n(.*?)```", salida, _re.DOTALL)
        if m:
            return m.group(2).strip(), (m.group(1).strip().lower() or "txt")
        return salida.strip(), "txt"

    def _programar(self, msg: str):
        eng = getattr(self, "_engine", None)
        if eng is None or not self._model_loaded:
            return None
        sistema = ("Eres ARIA en modo programador experto. Devuelve SOLO codigo correcto y "
                   "completo para lo que pide Daniel, dentro de un bloque de codigo con su lenguaje. "
                   "Comentarios breves dentro del codigo; nada de explicaciones fuera. "
                   "Si falta un detalle, asume lo razonable y sigue.")
        messages = [{"role": "system", "content": sistema}, {"role": "user", "content": msg}]
        try:
            salida = eng.chat(messages, max_tokens=512)
        except Exception:
            return None
        if not salida or len(salida.strip()) < 3:
            return None
        codigo, lang = self._extraer_codigo(salida)
        ext = {"python": "py", "py": "py", "javascript": "js", "js": "js", "html": "html",
               "css": "css", "bash": "sh", "sh": "sh", "c++": "cpp", "cpp": "cpp",
               "java": "java", "rust": "rs", "go": "go", "sql": "sql", "php": "php"}.get(lang, "txt")
        try:
            import path_guard
            nombre = "aria_%d.%s" % (int(time.time()), ext)
            ruta = path_guard.resolve_allowed(nombre, "write")
            with open(ruta, "w", encoding="utf-8") as fh:
                fh.write(codigo)
        except Exception as exc:
            return "Genere el codigo pero no pude guardarlo (%s). Aqui esta:\n\n%s" % (exc, codigo[:1500])
        prev = codigo if len(codigo) <= 500 else codigo[:500] + "\n..."
        return ("Codigo listo, Daniel. Lo guarde en %s (no lo ejecuto solo, lo revisas tu). "
                "Vista previa:\n\n%s") % (ruta, prev)

    def _get_semantica(self):
        sem = getattr(self, "_semantica", "NA")
        if sem != "NA":
            return sem
        self._semantica = None
        here = os.path.dirname(os.path.abspath(__file__))
        try:
            import memory_semantic
            if memory_semantic.disponible():
                self._semantica = memory_semantic.MemoriaSemantica(
                    os.path.join(here, "data", "semantica.db"))
        except Exception:
            self._semantica = None
        if self._semantica is None:
            # Sin embeddings (fastembed/sqlite_vec): memoria TF-IDF 100% stdlib.
            try:
                import memory_tfidf
                self._semantica = memory_tfidf.MemoriaSemantica(
                    os.path.join(here, "data", "semantica_tfidf.db"))
                # Backfill unico: indexa el historial ya existente para poder
                # recuperar conversaciones viejas desde el primer arranque.
                if hasattr(self._semantica, "contar") and self._semantica.contar() == 0:
                    for _e in _read_jsonl(CONVERSATIONS_FILE)[-500:]:
                        _u = str(_e.get("user", "")).strip()
                        _a = str(_e.get("aria", "")).strip()
                        if _u and _a:
                            self._semantica.recordar(
                                "Usuario: %s\nARIA: %s" % (_u, _a), meta="historial")
            except Exception:
                self._semantica = None
        return self._semantica

    def _sem_guardar(self, user_msg, bot_msg, source):
        if source == "fallback" or not bot_msg:
            return

        def _bg():
            try:
                sem = self._get_semantica()
                if sem is not None:
                    sem.recordar("Usuario: %s\nARIA: %s" % (user_msg, bot_msg), meta=source)
            except Exception:
                pass
        try:
            threading.Thread(target=_bg, name="aria-sem", daemon=True).start()
        except Exception:
            pass

    def _get_learner(self):
        lea = getattr(self, "_learner", None)
        if lea is not None:
            return lea
        try:
            from self_learning import Learner
            here = os.path.dirname(os.path.abspath(__file__))
            self._learner = Learner(here)
        except Exception:
            self._learner = None
        return self._learner

    # -- reglas locales -------------------------------------------------------
    def _fast_reply(self, message: str) -> Optional[str]:
        # Solo respuestas con DATOS REALES que el LLM no conoce (hora, estado).
        lower = message.strip().lower()
        if any(g in lower for g in ["estado del sistema", "status del sistema", "salud del sistema"]):
            return self._status_reply()
        if any(g in lower for g in ["qué hora", "que hora", "qué día", "que dia", "qué fecha", "que fecha"]):
            from datetime import datetime as _dt
            return _dt.now().strftime("Son las %H:%M del %d/%m/%Y.")
        return None

    def _rules_reply(self, message: str) -> Optional[str]:
        lower = message.strip().lower()
        greetings = ["hola", "buenas", "hello", "hi", "qué tal", "buenos días", "buenas tardes"]
        if any(g in lower for g in greetings):
            return "Hola, soy ARIA. Tu asistente virtual, 100% en local, sin servidores ni internet. ¿En qué te ayudo?"
        if any(g in lower for g in ["cómo estás", "como estas", "que tal", "qué pasa"]):
            return "Estoy operativa. Sistema local activo, escuchándote."
        if any(g in lower for g in ["estado", "status", "salud"]):
            return self._status_reply()
        if any(g in lower for g in ["quién eres", "que eres", "que haces", "tu nombre"]):
            return "Soy ARIA, tu asistente virtual personal. Opero 100% en tu equipo, sin servidores, sin la nube, sin internet."
        if any(g in lower for g in ["adiós", "adios", "hasta luego", "nos vemos", "chao"]):
            return "Hasta luego. Quedo a tu disposición cuando quieras."
        if any(g in lower for g in ["gracias", "thanks"]):
            return "De nada. ¿En qué más puedo ayudarte?"
        if any(g in lower for g in ["hora", "qué hora", "fecha", "qué día"]):
            return datetime.now().strftime("Son las %H:%M del %d/%m/%Y.")
        if any(g in lower for g in ["ayuda", "help", "comandos"]):
            return (
                "Puedo hablar contigo, gestionar archivos, memoria, notas, "
                "y operar en segundo plano con wake-word. Todo en local."
            )
        if any(g in lower for g in ["voz", "voice", "hablar", "escuchar"]):
            return "El sistema de voz local está activo: wake-word, transcripción y síntesis en tu equipo."
        if any(g in lower for g in ["memoria", "memory", "recordar", "olvidar"]):
            return "Tengo memoria local de conversaciones. Puedo guardar y recordar lo que me digas."
        if any(g in lower for g in ["archivo", "file", "carpeta", "directorio"]):
            return "Puedo listar, leer y escribir archivos locales. Dime qué necesitas."
        if any(g in lower for g in ["autónomo", "autonomo", "segundo plano", "background"]):
            return "Puedo operar autónomamente en segundo plano. Activada la escucha continua."
        if any(g in lower for g in ["entrenar", "entrenamiento", "etapa", "ciclo completo"]):
            return ("Sistema de entrenamiento listo. Etapas: "
                    "etapa1 (1 difícil rápido), etapa2 (varias fáciles a la vez), "
                    "etapa3 (fáciles con tiempo límite), etapa4 (difíciles con tiempo límite), "
                    "ciclo completo (las 4). Usa el botón de entrenamiento o dime qué etapa ejecutar.")
        if any(g in lower for g in ["desafío", "desafio", "imposible", "reta", "challenge"]):
            return ("Desafío progresivo listo: tareas bien difíciles, casi imposibles y una imposible "
                    "(autocumplida). Todas se resuelven con skills locales, sin internet. "
                    "Dime 'ejecuta desafío' o usa el panel de entrenamiento.")
        return None

    def _status_reply(self) -> str:
        parts = ["ARIA OS — Estado del sistema:"]
        parts.append(f"  IA local: {'llama.cpp (Qwen2.5-1.5B)' if self._model_loaded else 'reglas'}")
        parts.append(f"  Memoria: {len(_read_jsonl(CONVERSATIONS_FILE))} conversaciones guardadas")
        reglas = _reglas_para_el_modelo(limite=50)
        if reglas:
            partes = reglas.count("\n") + 1
            parts.append(f"  Reglas del usuario: {partes}")
        parts.append(f"  Modo: 100% local, sin servidor, sin internet")
        return "\n".join(parts)

    def chat(self, message: str, history: Optional[List[List[str]]] = None,
             on_token: Optional[Callable[[str], None]] = None) -> Dict[str, Any]:
        msg = message.strip()
        if not msg:
            return {"response": "No escribiste nada.", "provider": "local", "source": "rules"}

        # Memoria de la conversacion: si no pasan historia, usa la interna (ultimas
        # vueltas). Sin esto el LLM ve cada mensaje como si fuera el primero.
        if history is None:
            history = self.history

        # 0. Fast-path SOLO para datos reales que ARIA tiene (hora del sistema, estado).
        # Va ANTES de certeza: la hora local no es un dato que haya que escalar.
        fast = self._fast_reply(msg)
        if fast:
            self._record(msg, fast, "rules")
            return {"response": fast, "provider": "local", "source": "rules"}

        try:
            import certeza
            if certeza.debe_escalar(msg, False, False):
                r = certeza.frase_escalada(msg)
                self._record(msg, r, "certeza")
                return {"response": r, "provider": "local", "source": "certeza"}
        except Exception:
            pass
        if getattr(self, "conv", None) is not None:
            try:
                self.conv.registrar(msg)
            except Exception:
                pass

        # 2. Autoaprendizaje: ensenar / recordar / skills aprobadas
        learner = self._get_learner()
        if learner is not None:
            ens = learner.teach(msg)
            if ens:
                self._record(msg, ens, "aprendizaje")
                return {"response": ens, "provider": "local", "source": "aprendizaje"}
            rec = learner.recall(msg)
            if rec:
                self._record(msg, rec, "aprendido")
                return {"response": rec, "provider": "local", "source": "aprendido"}
            sk = learner.try_skills(msg)
            if sk:
                self._record(msg, sk, "skill")
                return {"response": sk, "provider": "local", "source": "skill"}

        # 3. Cerebro local (llama.cpp) en formato chat (ChatML)
        ev = getattr(self, "_carga_lista", None)
        if not self._model_loaded and ev is not None and not ev.is_set():
            ev.wait(120)            # el modelo aún carga: esperar (corre en el hilo del chat, no congela la ventana)
        if self._model_loaded:
            if self._es_pedido_codigo(msg):
                cod = self._programar(msg)
                if cod:
                    self._record(msg, cod, "codigo")
                    return {"response": cod, "provider": "local", "source": "codigo"}
            gen = self.generate_chat(msg, history, on_token=on_token)
            if gen and len(gen.strip()) > 2:
                self._record(msg, gen, "llama")
                return {"response": gen, "provider": "local", "source": "llama"}

        # 4a. Small-talk como fallback (solo si el modelo no está o no respondió)
        rule = self._rules_reply(msg)
        if rule:
            self._record(msg, rule, "rules")
            return {"response": rule, "provider": "local", "source": "rules"}

        # 4. Fallback + captura del hueco (para aprender despues)
        aviso = learner.note_gap(msg) if learner is not None else None
        fallback = (
            f"Recibido: '{msg}'. Estoy en modo local. "
            "Puedes ensenarme con 'aprende: tema => respuesta'."
        )
        if aviso:
            fallback += "\n" + aviso
        self._record(msg, fallback, "fallback")
        return {"response": fallback, "provider": "local", "source": "fallback"}

    def _record(self, user_msg: str, bot_msg: str, source: str) -> None:
        entry = {
            "ts": time.time(),
            "user": user_msg,
            "aria": bot_msg,
            "source": source,
        }
        _append_jsonl(CONVERSATIONS_FILE, entry)
        self._sem_guardar(user_msg, bot_msg, source)
        try:                                        # memoria como ciclo: solo hechos que valen la pena
            import recuerdos as _rec
            _rec.Recuerdos().observar(user_msg)
        except Exception:
            pass
        memory_retain(bot_msg, tipo="experiencias", fuente="sistema", confianza="sistema")
        self.history.append([user_msg, bot_msg])
        if len(self.history) > 200:
            self.history = self.history[-200:]


class LocalVoice:
    """Voz local de ARIA: TTS y STT opcionales, en el proceso y sin red.

    Si no hay motor de voz instalado, ARIA sigue hablando por pantalla: la
    voz es un extra, nunca un requisito para que ARIA exista.
    """

    def __init__(self) -> None:
        self.wake_words = ["hey aria", "hola aria", "ok aria", "oye aria", "aria"]
        self.listening = False
        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._on_transcript: Optional[Callable[[str], None]] = None
        self._on_wake: Optional[Callable[[str], None]] = None
        self._tts_engine = None
        self._stt_available = False
        self._tts_available = False
        self._mic_available = False
        self._wake_available = False
        self._local_engine = ""
        self._allow_google = False
        self._detect_deps()

    def _detect_deps(self) -> None:
        # TTS: pyttsx3 (local, sin red)
        try:
            import pyttsx3  # noqa: F401
            self._tts_available = True
        except Exception:
            pass
        # STT: speech_recognition (local, offline engine si está disponible)
        try:
            import speech_recognition as sr  # noqa: F401
            self._stt_available = True
        except Exception:
            pass
        # Mic: pyaudio / sounddevice
        try:
            import pyaudio  # noqa: F401
            self._mic_available = True
        except Exception:
            try:
                import sounddevice  # noqa: F401
                self._mic_available = True
            except Exception:
                pass
        # Wake word: vosk (local)
        try:
            import vosk  # noqa: F401
            self._wake_available = True
        except Exception:
            pass
        # Google (red): fuera de serie. Solo entra si se pide a proposito:
        # la voz es una capacidad, nunca una dependencia.
        self._allow_google = os.environ.get("ARIA_STT_GOOGLE", "0").strip().lower() in (
            "1", "true", "yes", "on",
        )
        self._local_engine = self._pick_local_engine()

    def _pick_local_engine(self) -> str:
        """Qué motor local de transcripción hay en esta máquina.

        "" si no hay ninguno: mejor no entender que entender por internet
        sin que nadie lo haya pedido.
        """
        try:
            import whisper  # noqa: F401
            return "whisper"
        except Exception:
            pass
        if self._vosk_model():
            return "vosk"
        return ""

    def _vosk_model(self) -> str:
        """La carpeta del modelo Vosk, si el usuario la ha señalado."""
        path = os.environ.get("ARIA_VOSK_MODEL", "").strip()
        if path and Path(path).is_dir():
            return path
        return ""

    def _transcribe(self, recognizer, audio) -> str:
        """Transcribe lo grabado, local primero.

        El motor local manda (Whisper, luego Vosk). Google queda como
        último recurso y solo con ARIA_STT_GOOGLE=1: es una capacidad de
        red, no una dependencia de la voz.
        """
        if not self._local_engine:
            self._local_engine = self._pick_local_engine()

        if self._local_engine == "whisper":
            try:
                return str(recognizer.recognize_whisper(audio) or "").strip()
            except Exception:
                self._local_engine = ""
        elif self._local_engine == "vosk":
            try:
                return str(self._recognize_vosk(audio) or "").strip()
            except Exception:
                self._local_engine = ""

        if self._allow_google:
            try:
                return str(recognizer.recognize_google(audio, language="es-ES") or "").strip()
            except Exception:
                return ""
        return ""

    def _recognize_vosk(self, audio) -> str:
        import json as _json

        import vosk

        model = vosk.Model(self._vosk_model())
        rec = vosk.KaldiRecognizer(model, audio.sample_rate)
        rec.AcceptWaveform(audio.frame_data)
        return str(_json.loads(rec.Result()).get("text", ""))

    def _wake_pattern(self, wake: str) -> "re.Pattern[str]":
        """El patrón de una llamada: admite comas y espacios entre palabras.

        "hey, aria, abre la luz" tiene que contar igual que "hey aria":
        si no, la voz se despierta pero la orden llega con el saludo pegado.
        """
        import re as _re

        parts = [p for p in wake.lower().split() if p]
        if not parts:
            return _re.compile(r"(?!x)x")
        body = r"\s*[\s,.;:!?¡¿-]*\s*".join(_re.escape(p) for p in parts)
        return _re.compile(body + r"\b", _re.IGNORECASE)

    def is_wake(self, text: str) -> bool:
        """¿Lo que ha oído ARIA es una llamada a ARIA?

        "aria" a secas solo cuenta si va al principio: si no, cualquier
        frase que mencione a ARIA ("¿qué hace ARIA?") la despertaría.
        """
        body = str(text or "").strip()
        if not body:
            return False
        for wake in self.wake_words:
            if self._wake_pattern(wake).match(body):
                return True
        return False

    def strip_wake(self, text: str) -> str:
        """Quita la llamada inicial: lo que queda es la orden."""
        body = str(text or "").strip()
        if not body:
            return body
        for wake in self.wake_words:
            match = self._wake_pattern(wake).match(body)
            if not match:
                continue
            return body[match.end():].strip(" ,.:;!?")
        return body

    def capabilities(self) -> Dict[str, bool]:
        return {
            "stt": self._stt_available,
            "tts": self._tts_available,
            "mic": self._mic_available,
            "wake_word": self._wake_available,
            "local_only": not self._allow_google,
            "stt_local": bool(self._local_engine),
            "stt_google": self._allow_google,
        }

    def speak(self, text: str) -> None:
        """Síntesis de voz local (bloqueante, en hilo separado si se desea)."""
        if not self._tts_available:
            print(f"[VA][TTS] {text}", flush=True)
            return
        try:
            import pyttsx3
            eng = pyttsx3.init()
            eng.setProperty("rate", 170)
            eng.setProperty("volume", 1.0)
            eng.say(text)
            eng.runAndWait()
        except Exception as exc:
            print(f"[VA][TTS] error: {exc}", flush=True)

    def speak_async(self, text: str) -> None:
        t = threading.Thread(target=self.speak, args=(text,), daemon=True)
        t.start()

    def start_listening(self, on_transcript: Callable[[str], None],
                        on_wake: Callable[[str], None]) -> None:
        if self.listening:
            return
        self.listening = True
        self._stop.clear()
        self._on_transcript = on_transcript
        self._on_wake = on_wake
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()

    def stop_listening(self) -> None:
        self.listening = False
        self._stop.set()

    def _listen_loop(self) -> None:
        recognizer = None
        mic = None
        if self._stt_available and self._mic_available:
            try:
                import speech_recognition as sr
                recognizer = sr.Recognizer()
                mic = sr.Microphone()
                with mic as source:
                    recognizer.adjust_for_ambient_noise(source, duration=0.5)
            except Exception:
                recognizer = None
                mic = None

        while self.listening and not self._stop.is_set():
            transcript = ""
            if recognizer and mic:
                try:
                    with mic as source:
                        audio = recognizer.listen(source, timeout=1, phrase_time_limit=6)
                    # Local primero (Whisper, luego Vosk). Google solo si se
                    # ha pedido a proposito: la voz es una capacidad, nunca
                    # una dependencia de ARIA.
                    transcript = self._transcribe(recognizer, audio)
                except Exception:
                    transcript = ""
            if not transcript:
                time.sleep(0.3)
                continue

            if self.is_wake(transcript):
                if self._on_wake:
                    self._on_wake(transcript)
                cmd = self._extract_command(transcript)
                if cmd is None:
                    # Sin palabra clave: la orden es lo que viene detras de
                    # la llamada. Antes se perdia, y era la voz la que no
                    # llegaba a hacer nada.
                    cmd = self.strip_wake(transcript)
                if cmd and self._on_transcript:
                    self._on_transcript(cmd)
            elif self._on_transcript:
                self._on_transcript(transcript)

    def _extract_command(self, text: str) -> Optional[str]:
        lower = text.lower()
        for kw, cmd in [
            ("estado", "system_status"), ("memoria", "memory_status"),
            ("archivo", "file_ops"), ("ayuda", "help"),
            ("detener", "stop_listening"), ("silencio", "silence"),
        ]:
            if kw in lower:
                return cmd
        return None


# ─── Skills locales (stdlib solo, sin subprocess, sin comandos de shell) ─────

class LocalSkills:
    """Habilidades que usan solo la librería estándar de Python."""

    def __init__(self, brain: LocalAIBrain) -> None:
        self.brain = brain
        self.state: Dict[str, Any] = _load_json(SKILLS_STATE_FILE, {
            "files": [], "notes": [], "reminders": [], "autonomous": False
        })

    def list(self) -> List[Dict[str, str]]:
        return [
            {"id": "system_status", "name": "Estado del sistema", "category": "system"},
            {"id": "memory_status", "name": "Estado de memoria", "category": "memoria"},
            {"id": "file_list", "name": "Listar archivos", "category": "archivos"},
            {"id": "file_read", "name": "Leer archivo", "category": "archivos"},
            {"id": "file_write", "name": "Escribir archivo", "category": "archivos"},
            {"id": "note_add", "name": "Agregar nota", "category": "memoria"},
            {"id": "note_list", "name": "Listar notas", "category": "memoria"},
            {"id": "conversation_history", "name": "Historial conversaciones", "category": "memoria"},
            {"id": "autonomous_toggle", "name": "Modo autónomo", "category": "sistema"},
            {"id": "voice_test", "name": "Probar voz", "category": "voz"},
            {"id": "set_theme", "name": "Cambiar tema", "category": "ui"},
            {"id": "companion_ping", "name": "Companion local", "category": "sistema"},
            {"id": "rf_presence", "name": "Presencia RF (WiFi)", "category": "sistema"},
            {"id": "wifi_scan", "name": "Escaneo WiFi", "category": "sistema"},
            {"id": "geo_locate", "name": "Ubicacion (IP)", "category": "sistema"},
            {"id": "sec_sandbox", "name": "Sandbox seguridad", "category": "sistema"},
            {"id": "sec_scan", "name": "Escaneo sospechosos", "category": "sistema"},
            {"id": "vision_url", "name": "Ver video URL", "category": "vision"},
            {"id": "vision_preview", "name": "Preview video URL", "category": "vision"},
            {"id": "vision_image", "name": "Ver imagen URL", "category": "vision"},
            {"id": "code_write", "name": "Escribir codigo", "category": "programacion"},
            {"id": "code_read", "name": "Leer codigo", "category": "programacion"},
            {"id": "eyes_snapshot", "name": "Pulso del Planeta", "category": "sistema"},
            {"id": "app_automate", "name": "Automatizar app", "category": "automatizacion"},
            {"id": "bridge_status", "name": "Estado del puente", "category": "red"},
            {"id": "bridge_push", "name": "Enviar al puente", "category": "red"},
            {"id": "bridge_pull", "name": "Leer del puente", "category": "red"},
            {"id": "bridge_pair", "name": "Emparejar dispositivo", "category": "red"},
            {"id": "bridge_pair_confirm", "name": "Confirmar emparejamiento", "category": "red"},
            {"id": "bridge_audit", "name": "Auditoria del puente", "category": "red"},
            {"id": "discord_memory", "name": "Memoria Discord", "category": "red"},
            {"id": "rollercoin_play", "name": "Jugar RollerCoin", "category": "automatizacion"},
            {"id": "rollercoin_daily", "name": "RollerCoin diario", "category": "automatizacion"},
            {"id": "rollercoin_sched", "name": "Programar RollerCoin", "category": "automatizacion"},
            {"id": "rollercoin_engine", "name": "Motor RollerCoin (jugar+estudiar)", "category": "automatizacion"},
            {"id": "rollercoin_schedule", "name": "Horario RollerCoin", "category": "automatizacion"},
            {"id": "rollercoin_sigilo", "name": "Nivel de sigilo RollerCoin", "category": "automatizacion"},
            {"id": "rollercoin_reporte", "name": "Reporte de estudio RollerCoin", "category": "automatizacion"},
            {"id": "google_link", "name": "Vincular cuenta Google", "category": "red"},
            {"id": "gmail_code", "name": "Codigo Gmail 2FA", "category": "red"},
            {"id": "rollercoin_login_grabado", "name": "Login RollerCoin grabado", "category": "automatizacion"},
            {"id": "rollercoin_sesiones", "name": "Sesiones grabadas RollerCoin", "category": "automatizacion"},
            {"id": "aria_browser", "name": "Navegador ARIA", "category": "navegador"},
            {"id": "aria_activities", "name": "Actividades (reels/minijuegos)", "category": "automatizacion"},
            {"id": "social_analysis", "name": "Analisis social", "category": "social"},
            {"id": "practica_social", "name": "Practica social", "category": "social"},
            {"id": "dns_lookup", "name": "DNS de un dominio", "category": "red"},
            {"id": "whois_lookup", "name": "WHOIS de un dominio", "category": "red"},
            {"id": "web_info", "name": "Info de una web", "category": "red"},
        ]

    def run(self, skill_id: str, params: Dict[str, Any]) -> Dict[str, Any]:
        if skill_id == "system_status":
            return self._sys_status()
        if skill_id == "memory_status":
            return self._memory_status()
        if skill_id == "file_list":
            return self._file_list(params)
        if skill_id == "file_read":
            return self._file_read(params)
        if skill_id == "file_write":
            return self._file_write(params)
        if skill_id == "note_add":
            return self._note_add(params)
        if skill_id == "note_list":
            return self._note_list()
        if skill_id == "conversation_history":
            return self._conversation_history()
        if skill_id == "autonomous_toggle":
            return self._autonomous_toggle(params)
        if skill_id == "voice_test":
            return self._voice_test(params)
        if skill_id == "set_theme":
            return self._set_theme(params)
        if skill_id == "companion_ping":
            return self._companion_ping(params)
        if skill_id == "rf_presence":
            return self._rf_presence(params)
        if skill_id == "wifi_scan":
            return self._wifi_scan(params)
        if skill_id == "geo_locate":
            return self._geo_locate(params)
        if skill_id == "sec_sandbox":
            return self._sec_sandbox(params)
        if skill_id == "sec_scan":
            return self._sec_scan(params)
        if skill_id == "vision_url":
            return self._vision_url(params)
        if skill_id == "vision_preview":
            return self._vision_preview(params)
        if skill_id == "vision_image":
            return self._vision_image(params)
        if skill_id == "code_write":
            return self._code_write(params)
        if skill_id == "code_read":
            return self._code_read(params)
        if skill_id == "eyes_snapshot":
            return self._eyes_snapshot(params)
        if skill_id == "app_automate":
            return self._app_automate(params)
        if skill_id == "usb_init":
            return self._usb_init(params)
        if skill_id == "bridge_status":
            return self._bridge_status()
        if skill_id == "bridge_push":
            return self._bridge_push(params)
        if skill_id == "bridge_pull":
            return self._bridge_pull(params)
        if skill_id == "bridge_pair":
            return self._bridge_pair()
        if skill_id == "bridge_pair_confirm":
            return self._bridge_pair_confirm(params)
        if skill_id == "bridge_audit":
            return self._bridge_audit(params)
        if skill_id == "bridge_queue":
            return self._bridge_queue()
        if skill_id == "discord_memory":
            return self._discord_memory(params)
        if skill_id == "rollercoin_play":
            return self._rollercoin_play(params)
        if skill_id == "rollercoin_daily":
            return self._rollercoin_daily(params)
        if skill_id == "rollercoin_sched":
            return self._rollercoin_sched(params)
        if skill_id == "rollercoin_engine":
            return self._rollercoin_engine(params)
        if skill_id == "rollercoin_schedule":
            return self._rollercoin_schedule(params)
        if skill_id == "rollercoin_sigilo":
            return self._rollercoin_sigilo(params)
        if skill_id == "rollercoin_reporte":
            return self._rollercoin_reporte(params)
        if skill_id == "google_link":
            return self._google_link(params)
        if skill_id == "gmail_code":
            return self._gmail_code(params)
        if skill_id == "rollercoin_login_grabado":
            return self._rollercoin_login_grabado(params)
        if skill_id == "rollercoin_sesiones":
            return self._rollercoin_sesiones(params)
        if skill_id == "aria_browser":
            return self._aria_browser(params)
        if skill_id == "aria_activities":
            return self._aria_activities(params)
        if skill_id == "social_analysis":
            return self._social_analysis(params)
        if skill_id == "practica_social":
            return self._practica_social(params)
            return self._practica_social(params)
            return self._social_analysis(params)
        if skill_id == "dns_lookup":
            return self._dns_lookup(params)
        if skill_id == "whois_lookup":
            return self._whois_lookup(params)
        if skill_id == "web_info":
            return self._web_info(params)
        return {"status": "error", "error": f"skill desconocida: {skill_id}"}

    # -- implementaciones -----------------------------------------------------
    def _sys_status(self) -> Dict[str, Any]:
        import platform
        return {
            "status": "ok",
            "platform": platform.platform(),
            "python": sys.version.split()[0],
            "cwd": str(Path.cwd()),
            "mode": "100% local, sin servidor, sin internet",
            "skills": len(self.list()),
        }

    def _memory_status(self) -> Dict[str, Any]:
        convs = _read_jsonl(CONVERSATIONS_FILE)
        return {
            "status": "ok",
            "conversations": len(convs),
            "skills_state": self.state,
        }

    def _file_list(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            root = _resolve_allowed(params.get("path", str(ARIA_APP)), "read") if _resolve_allowed else Path(params.get("path", str(ARIA_APP)))
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        target = Path(root)
        if not target.exists() or not target.is_dir():
            return {"status": "error", "error": "ruta no válida"}
        entries = []
        try:
            for p in sorted(target.iterdir())[:50]:
                try:
                    _resolve_allowed(str(p), "read") if _resolve_allowed else None
                except Exception:
                    continue
                entries.append({
                    "name": p.name,
                    "is_dir": p.is_dir(),
                    "size": p.stat().st_size if p.is_file() else 0,
                })
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return {"status": "ok", "path": str(target), "entries": entries}

    def _file_read(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            resolved = _resolve_allowed(params.get("path", ""), "read") if _resolve_allowed else params.get("path", "")
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        path = Path(resolved)
        if not path.exists() or not path.is_file():
            return {"status": "error", "error": "archivo no encontrado"}
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
            return {"status": "ok", "path": str(path), "content": content[:5000]}
        except Exception as exc:
            return {"status": "error", "error": str(exc)}

    def _file_write(self, params: Dict[str, Any]) -> Dict[str, Any]:
        content = params.get("content", "")
        try:
            resolved = _resolve_allowed(params.get("path", ""), "write") if _resolve_allowed else params.get("path", "")
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        path = Path(resolved)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            return {"status": "ok", "path": str(path), "bytes": len(content)}
        except Exception as exc:
            return {"status": "error", "error": str(exc)}

    def _note_add(self, params: Dict[str, Any]) -> Dict[str, Any]:
        text = params.get("text", "")
        if not text:
            return {"status": "error", "error": "texto vacío"}
        entry = {"ts": time.time(), "text": text}
        self.state.setdefault("notes", []).append(entry)
        _save_json(SKILLS_STATE_FILE, self.state)
        memory_retain(text, tipo="hechos", fuente="usuario", confianza="usuario")
        return {"status": "ok", "note": entry}

    def _note_list(self) -> Dict[str, Any]:
        notes = list(self.state.get("notes") or [])
        return {"status": "ok", "notes": notes, "count": len(notes)}

    def _conversation_history(self) -> Dict[str, Any]:
        convs = _read_jsonl(CONVERSATIONS_FILE)
        return {"status": "ok", "conversations": convs, "count": len(convs)}

    def _autonomous_toggle(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            self.autonomous = False
            if hasattr(self, 'state'):
                self.state["autonomous"] = False
            _save_json(SKILLS_STATE_FILE, getattr(self, 'state', {"autonomous": False}))
        except Exception:
            pass
        return {"ok": False, "autonomous": False, "error": "desactivada por regla del proyecto"}

    def _voice_test(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from backend.voice.pipeline import TTSPipeline
            tts = TTSPipeline()
            r = tts.speak("ARIA en linea. Cerebro operativo.", engine="pyttsx3")
            return {"status": "ok", "tts": r}
        except Exception as exc:
            return {"status": "error", "error": str(exc)}

    def _set_theme(self, params: Dict[str, Any]) -> Dict[str, Any]:
        name = params.get("name", params.get("theme", "cyberpunk"))
        try:
            from themes import get_theme, resolve_theme
        except Exception:
            try:
                from .themes import get_theme, resolve_theme
            except Exception as exc:
                return {"status": "error", "error": str(exc)}
        key = resolve_theme(name)
        t = get_theme(name)
        self.state = getattr(self, "state", {})
        self.state["theme"] = key
        try:
            _save_json(SKILLS_STATE_FILE, self.state)
        except Exception:
            pass
        return {"status": "ok", "theme": key, "palette": t, "message": "Tema cambiado a " + t["name"]}

    def _companion_ping(self, params: Dict[str, Any]) -> Dict[str, Any]:
        import subprocess, sys as _sys
        try:
            proc = subprocess.Popen(
                [_sys.executable, str(Path(__file__).resolve().parent / "companion.py")],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True,
            )
            req = {"action": params.get("action", "ping"), "data": params.get("data")}
            proc.stdin.write(json.dumps(req) + "\n")
            proc.stdin.flush()
            proc.stdin.close()
            out = proc.stdout.readline()
            proc.wait(timeout=5)
            return json.loads(out) if out else {"status": "error", "error": "sin respuesta"}
        except Exception as exc:
            return {"status": "error", "error": str(exc)}

    def _rf_presence(self, params: Dict[str, Any]) -> Dict[str, Any]:
        import subprocess, re
        try:
            out = subprocess.check_output(["netsh", "wlan", "show", "interfaces"], text=True, stderr=subprocess.DEVNULL, timeout=10)
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        signal = None
        ssid = None
        state = None
        for line in out.splitlines():
            line = line.strip()
            if line.lower().startswith("signal"):
                m = re.search(r"(\d+)", line)
                if m:
                    signal = int(m.group(1))
            elif line.lower().startswith("ssid"):
                ssid = line.split(":", 1)[-1].strip()
            elif line.lower().startswith("state"):
                state = line.split(":", 1)[-1].strip()
        baseline = self.state.get("rf_baseline") if hasattr(self, "state") else None
        delta = (signal - baseline) if (signal is not None and baseline is not None) else None
        if signal is not None:
            self.state = getattr(self, "state", {})
            self.state["rf_baseline"] = signal
            try:
                _save_json(SKILLS_STATE_FILE, self.state)
            except Exception:
                pass
        presence = None
        if delta is not None:
            presence = "posible presencia" if abs(delta) >= 5 else "sin cambio significativo"
        return {"status": "ok", "ssid": ssid, "state": state, "signal": signal, "delta": delta, "presence": presence}

    def _wifi_scan(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from wifi_sense import scan_networks, summary
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        if params.get("detail"):
            return {"status": "ok", "networks": scan_networks()}
        return {"status": "ok", **summary()}

    def _geo_locate(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from geo_locate import locate
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return {"status": "ok", **locate()}

    def _sec_sandbox(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from security_sandbox import sandbox_status, countermeasures
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return {"status": "ok", **sandbox_status(), "countermeasures": countermeasures()}

    def _sec_scan(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from security_sandbox import local_suspicious_scan
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return {"status": "ok", **local_suspicious_scan()}

    def _vision_url(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from vision_eye import ver_url
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return ver_url(params.get("url", ""))

    def _vision_preview(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from vision_eye import ver_url_preview
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return ver_url_preview(params.get("url", ""))

    def _vision_image(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from vision_eye import ver_imagen_url
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return ver_imagen_url(params.get("url", ""))

    def _code_write(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from coder_skill import write_code
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return write_code(params.get("path", ""), params.get("code", ""), bool(params.get("overwrite", False)))

    def _code_read(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from coder_skill import read_code
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return read_code(params.get("path", ""))

    def _eyes_snapshot(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from eyes_of_god import snapshot
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        bbox = params.get("bbox") or [-90, -180, 90, 180]
        try:
            lat_min, lon_min, lat_max, lon_max = [float(x) for x in bbox]
        except Exception:
            lat_min, lon_min, lat_max, lon_max = -90, -180, 90, 180
        return {"status": "ok", **snapshot(lat_min, lon_min, lat_max, lon_max)}

    def _omni_sense(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from omnisense import omni_sense
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        bbox = params.get("bbox")
        return {"status": "ok", **omni_sense(bbox=bbox)}

    def _usb_init(self, params: Dict[str, Any]) -> Dict[str, Any]:
        # CANDADO: formatear BORRA el USB (accion irreversible). No corre sola ni por
        # autonomia; requiere confirmacion explicita de Daniel (confirmar=True).
        if not params.get("confirmar"):
            return {"status": "requiere_confirmacion", "destructivo": True,
                    "aviso": "Esto FORMATEA (borra) el USB. Para hacerlo, confirma con confirmar=True."}
        import subprocess
        label = params.get("label", "ARIA-USB")
        fs = params.get("fs", "exFAT")
        ps = (
            "Get-Disk | Where-Object {$_.BusType -eq 'USB'} | ForEach-Object { "
            "Initialize-Disk -Number $_.Number -PartitionStyle MBR -Confirm:$false -ErrorAction SilentlyContinue; "
            "$p = New-Partition -DiskNumber $_.Number -UseMaximumSize -AssignDriveLetter -ErrorAction SilentlyContinue; "
            "if ($p) { Format-Volume -DriveLetter $p.DriveLetter -FileSystem %s -NewFileSystemLabel '%s' -Confirm:$false } "
            "}; Write-Output 'done'" % (fs, label)
        )
        try:
            r = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps],
                capture_output=True, text=True, timeout=60,
            )
            return {"status": "ok" if r.returncode == 0 else "error",
                    "stdout": r.stdout.strip(), "stderr": r.stderr.strip(),
                    "note": "Requiere ejecutar ARIA como Administrador para formatear."}
        except Exception as exc:
            return {"status": "error", "error": str(exc)}

    def _app_automate(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from app_automator import run
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return run(params.get("action", "list"), **{k: v for k, v in params.items() if k != "action"})

    def _rollecoin_auto(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from rollecoin_bot import run
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return run(params.get("action", "fetch"), params.get("path", "/"), params.get("data"))

    def _bot_create(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from bot_factory import create_bot, launch_bot
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        name = params.get("name", "aria_bot")
        purpose = params.get("purpose", "general")
        res = create_bot(name, purpose)
        if params.get("launch"):
            res.update(launch_bot(res.get("name", name)))
        return res

    def _usb_brain(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from usb_brain import status
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return status()

    def _bridge_status(self) -> Dict[str, Any]:
        import os
        u = os.environ.get("ARIA_BRIDGE_URL", "")
        return {"status": "ok", "configured": bool(u), "url": u or None}

    def _bridge_push(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from remote_bridge import push
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return push(params.get("payload", params), params.get("token"))

    def _bridge_pull(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from remote_bridge import pull
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return pull(params.get("channel", "default"), params.get("token"))

    def _bridge_pair(self) -> Dict[str, Any]:
        try:
            from remote_bridge import pair_request
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return pair_request()

    def _bridge_pair_confirm(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from remote_bridge import pair_confirm
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return pair_confirm(params.get("code", ""), params.get("token", ""), params.get("scopes"))

    def _bridge_audit(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from remote_bridge import audit_tail
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return {"status": "ok", "entries": audit_tail(int(params.get("n", 20)))}

    def _rollercoin_play(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from rollercoin_play import explore, play_game, list_games
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        action = params.get("action", "explore")
        if action == "play":
            return play_game(params.get("url", "https://rollercoin.com/game/choose_game"), params.get("headless", True), params.get("duration", 10))
        if action == "list_games":
            from rollercoin_play import list_games
            return list_games(params.get("headless", True))
        if action == "play_all":
            from rollercoin_play import play_all
            return play_all(params.get("headless", False), params.get("duration_per_game"))
        return explore(params.get("url", "https://rollercoin.com"), params.get("headless", True))

    def _rollercoin_daily(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from rollercoin_daily import guardar_credenciales, login, daily_run
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        action = params.get("action", "run")
        if action == "guardar":
            return guardar_credenciales(params.get("email", ""), params.get("password", ""), params.get("master"))
        if action == "login":
            return login(params.get("headless", True))
        return daily_run(params.get("headless", True))

    def _aria_browser(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from aria_browser_v2 import run as browser_run
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return browser_run(params.get("action", "open"), **{k: v for k, v in params.items() if k != "action"})

    def _practica_social(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            import social_sandbox as _sb
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        n = int(params.get("n", 6))
        try:
            rep = _sb.practicar(lambda t: self.brain.chat(t).get("response", ""), n=n)
            return {"status": "ok", "resumen": rep.get("resumen"), "promedio": rep.get("promedio"), "puntos_flojos": rep.get("puntos_flojos"), "n": rep.get("n")}
        except Exception as exc:
            return {"status": "error", "error": str(exc)}

    def _social_analysis(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from social_skills import social_analysis as sa
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        text = params.get("text", "")
        result = sa(text)
        return {"status": "ok", **result}

    def _aria_activities(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from aria_activities import run as act_run
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return act_run(params.get("action", "explore"), **{k: v for k, v in params.items() if k != "action"})

    def _rollercoin_sched(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from rollercoin_scheduler import iniciar, detener, estado
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        action = params.get("action", "iniciar")
        if action == "detener":
            return detener()
        if action == "estado":
            return estado()
        return iniciar(params.get("hora", 15))

    def _rollercoin_engine(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from rollercoin_engine import (
                jugar, jugar_todos_juegos, listar_juegos, explorar,
                estado_motor, resumen_estudio, listar_juegos_estudio,
            )
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        action = params.get("action", "play_all")
        if action == "play_all":
            return jugar_todos_juegos(
                duration_per_game=params.get("duration_per_game"),
                headless=params.get("headless", True),
                stealth_level=params.get("stealth_level", 2),
            )
        if action == "play":
            return jugar(
                action="play",
                url=params.get("url", "https://rollercoin.com/game/choose_game"),
                headless=params.get("headless", True),
                duration=params.get("duration", 10),
                stealth_level=params.get("stealth_level", 2),
            )
        if action == "explore":
            return explorar(
                url=params.get("url", "https://rollercoin.com"),
                headless=params.get("headless", True),
                stealth_level=params.get("stealth_level", 2),
            )
        if action == "list_games":
            return listar_juegos(
                headless=params.get("headless", True),
                stealth_level=params.get("stealth_level", 2),
            )
        if action == "estado":
            return estado_motor()
        if action == "resumen":
            return resumen_estudio()
        if action == "juegos":
            return {"juegos": listar_juegos_estudio()}
        return {"status": "error", "error": "acción desconocida: %s" % action}

    def _rollercoin_schedule(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from rollercoin_schedule import (
                iniciar, detener, estado, configurar_franjas, configurar_sigilo,
            )
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        action = params.get("action", "estado")
        if action == "iniciar":
            return iniciar(
                franjas=params.get("franjas"),
                activo=params.get("activo", True),
                nivel_sigilo_inicial=params.get("nivel_sigilo_inicial", 2),
                subir_sigilo_despues_de_sesiones=params.get("subir_sigilo_despues_de_sesiones", 5),
            )
        if action == "detener":
            return detener()
        if action == "estado":
            return estado()
        if action == "configurar_franjas":
            return configurar_franjas(params.get("franjas", []))
        if action == "configurar_sigilo":
            return configurar_sigilo(params.get("nivel", 2))
        return {"status": "error", "error": "acción desconocida: %s" % action}

    def _rollercoin_sigilo(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from rollercoin_engine import (
                subir_nivel_sigilo, obtener_config_sigilo, estado_motor,
            )
            from rollercoin_schedule import configurar_sigilo, estado
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        action = params.get("action", "configurar")
        if action == "configurar":
            return configurar_sigilo(params.get("nivel", 2))
        if action == "subir":
            nivel_actual = int(estado().get("nivel_sigilo_actual", 2))
            nuevo = subir_nivel_sigilo(nivel_actual)
            return configurar_sigilo(nuevo)
        if action == "config":
            return {"config": obtener_config_sigilo(params.get("nivel", 2))}
        if action == "estado":
            return estado()
        return {"status": "error", "error": "acción desconocida: %s" % action}

    def _rollercoin_reporte(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from rollercoin_engine import (
                estado_motor, resumen_estudio, listar_juegos_estudio,
            )
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return {
            "motor": estado_motor(),
            "resumen": resumen_estudio(),
            "juegos_top": listar_juegos_estudio()[:10],
            "generado": datetime.now().isoformat(),
        }

    def _google_link(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from google_link import (
                solicitar_codigo, esperar_token, obtener_info_usuario,
                estado_vinculacion, configurar_client_id,
            )
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        action = params.get("action", "estado")
        if action == "configurar_client_id":
            return configurar_client_id(params.get("client_id", ""))
        if action == "solicitar_codigo":
            return solicitar_codigo(params.get("client_id"))
        if action == "esperar_token":
            return esperar_token(
                params.get("device_code", ""),
                params.get("client_id"),
                params.get("max_espera", 900),
            )
        if action == "info_usuario":
            return obtener_info_usuario(params.get("access_token", ""))
        if action == "estado":
            return estado_vinculacion()
        return {"status": "error", "error": "acción desconocida: %s" % action}

    def _gmail_code(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from gmail_code import (
                buscar_codigos_rollercoin, esperar_codigo_rollercoin,
                estado_gmail, conectar,
            )
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        action = params.get("action", "estado")
        if action == "buscar_codigos":
            return buscar_codigos_rollercoin(
                params.get("email", ""),
                params.get("app_password", ""),
                params.get("desde_ts", 0),
                params.get("limite", 10),
            )
        if action == "esperar_codigo":
            return esperar_codigo_rollercoin(
                params.get("email", ""),
                params.get("app_password", ""),
                params.get("timeout_s", 120),
                params.get("intervalo_s", 10),
            )
        if action == "estado":
            return estado_gmail()
        return {"status": "error", "error": "acción desconocida: %s" % action}

    def _rollercoin_login_grabado(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from rollercoin_daily import login, daily_run
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        action = params.get("action", "login")
        if action == "login":
            return login(
                headless=params.get("headless", True),
                grabar=params.get("grabar", True),
                usar_gmail=params.get("usar_gmail", False),
            )
        if action == "daily":
            return daily_run(
                headless=params.get("headless", True),
                grabar=params.get("grabar", True),
                usar_gmail=params.get("usar_gmail", False),
            )
        return {"status": "error", "error": "acción desconocida: %s" % action}

    def _rollercoin_sesiones(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from rollercoin_daily import listar_sesiones_grabadas, estado_grabaciones
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        action = params.get("action", "estado")
        if action == "listar":
            return {"sesiones": listar_sesiones_grabadas()}
        if action == "estado":
            return estado_grabaciones()
        return {"status": "error", "error": "acción desconocida: %s" % action}

    def _discord_memory(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from remote_discord import crear_canal, enviar_canal, leer_canal
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        action = params.get("action", "read")
        if action == "create":
            return crear_canal(params.get("guild", ""), params.get("channel", "aria-memoria"))
        channel_id = params.get("channel_id")
        if not channel_id:
            # auto-descubrir canal aria-memoria en el primer guild
            try:
                import os
                from remote_discord import RemotoDiscord
                token = os.environ.get("ARIA_DISCORD_TOKEN", "").strip()
                r = RemotoDiscord(token, lambda t: t, [])
                import asyncio
                async def _find():
                    c = r._build()
                    await c.login(token)
                    found = None
                    async for g in c.fetch_guilds(limit=50):
                        full = await c.fetch_guild(g.id)
                        channels = await full.fetch_channels()
                        for ch in channels:
                            if "memoria" in ch.name.lower() or "aria" in ch.name.lower():
                                found = ch.id
                                break
                        if found:
                            break
                    await c.close()
                    return found
                channel_id = asyncio.run(_find())
            except Exception:
                channel_id = None
        if not channel_id:
            return {"status": "error", "error": "channel_id requerido (o no se encontro canal aria-memoria)"}
        if action == "send":
            return enviar_canal(channel_id, params.get("text", ""))
        return leer_canal(channel_id, params.get("limit", 20))

    def _bridge_queue(self) -> Dict[str, Any]:
        try:
            from remote_bridge import queue_status
        except Exception as exc:
            return {"status": "error", "error": str(exc)}
        return queue_status()

    # -- OSINT pasivo (solo informacion publica) ------------------------------
    def _dns_lookup(self, params):
        import urllib.request, urllib.parse, json as _json
        dom = (params.get("dominio") or params.get("texto") or "").strip().lower()
        if not dom: return {"ok": False, "texto": "Falta el dominio."}
        tipos = {"A":1,"AAAA":28,"MX":15,"NS":2,"TXT":16}; out={n: [] for n in tipos}
        # dos resolvedores DoH: si uno cae o bloquea, el otro responde
        proveedores = [
            ("cloudflare", "https://cloudflare-dns.com/dns-query?name=%s&type=%d",
             {"Accept": "application/dns-json"}),
            ("google", "https://dns.google/resolve?name=%s&type=%d", {}),
        ]
        usado = None
        estado = None
        idx = 0
        for n, num in tipos.items():
            for intento in range(len(proveedores)):
                nombre, base, hdrs = proveedores[(idx + intento) % len(proveedores)]
                try:
                    q = base % (urllib.parse.quote(dom), num)
                    req = urllib.request.Request(q, headers=hdrs)
                    with urllib.request.urlopen(req, timeout=6) as r:
                        data = _json.loads(r.read().decode("utf-8"))
                    idx = (idx + intento) % len(proveedores)   # fija el que funciono
                    usado = nombre
                    estado = data.get("Status", 0)
                    out[n] = [a.get("data","").rstrip(".") for a in data.get("Answer",[]) if a.get("type")==num]
                    break
                except Exception:
                    continue
        if usado is None:
            return {"ok": False, "dominio": dom,
                    "texto": "Sin respuesta de los resolvedores DoH (cloudflare/google)."}
        if not any(out.values()):
            if estado == 3:
                return {"ok": False, "dominio": dom, "proveedor": usado, "registros": out,
                        "texto": "El dominio no existe (NXDOMAIN)."}
            return {"ok": False, "dominio": dom, "proveedor": usado, "registros": out,
                    "texto": "Sin registros DNS para ese dominio."}
        return {"ok": True, "dominio": dom, "proveedor": usado, "registros": out}

    def _whois_lookup(self, params):
        import socket as _s
        dom=(params.get("dominio") or params.get("texto") or "").strip().lower()
        if not dom: return {"ok": False, "texto": "Falta el dominio."}
        def consulta(server,q):
            c=_s.socket(_s.AF_INET,_s.SOCK_STREAM); c.settimeout(8)
            c.connect((server,43)); c.sendall((q+"\r\n").encode()); buf=b""
            while True:
                d=c.recv(4096)
                if not d: break
                buf+=d
            c.close(); return buf.decode("utf-8","ignore")
        try:
            r1=consulta("whois.iana.org",dom); ref=""
            for line in r1.splitlines():
                if line.lower().startswith("whois:"): ref=line.split(":",1)[1].strip(); break
            texto=consulta(ref,dom) if ref else r1
            return {"ok": True, "dominio": dom, "texto": texto[:4000]}
        except Exception as e:
            return {"ok": False, "texto": "WHOIS fallo: %s"%e}

    def _web_info(self, params):
        import urllib.request, re as _re, html as _html
        url=(params.get("url") or params.get("texto") or "").strip()
        if not url: return {"ok": False, "texto": "Falta la URL."}
        if not url.startswith("http"): url="https://"+url
        try:
            req=urllib.request.Request(url,headers={"User-Agent":"ARIA/1.0"})
            with urllib.request.urlopen(req,timeout=8) as r:
                cab=dict(r.headers); cuerpo=r.read(60000).decode("utf-8","ignore"); estado=r.status
            m=_re.search(r"<title[^>]*>(.*?)</title>",cuerpo,_re.I|_re.S)
            titulo = _html.unescape(_re.sub(r"\s+", " ", m.group(1)).strip())[:200] if m else ""
            return {"ok": True,"url":url,"estado":estado,"servidor":cab.get("Server",""),
                    "titulo": titulo}
        except Exception as e:
            return {"ok": False, "texto": "No pude leer %s: %s"%(url,e)}


# ─── Sistema de Entrenamiento de ARIA ───────────────────────────────────────

class TaskDifficulty(Enum):
    EASY = "easy"
    HARD = "hard"


class TaskResult(Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILURE = "failure"
    TIMEOUT = "timeout"


@dataclass
class TrainingTask:
    id: str
    name: str
    description: str
    difficulty: TaskDifficulty
    fn: Callable[[], Dict[str, Any]]
    expected_check: Optional[Callable[[Dict[str, Any]], bool]] = None
    time_limit: Optional[float] = None


@dataclass
class TrainingTaskResult:
    task_id: str
    task_name: str
    difficulty: TaskDifficulty
    result: TaskResult
    elapsed: float
    output: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class TrainingSystem:
    """Entrena a ARIA con tareas por dificultad, concurrencia y límites de tiempo.

    Etapas:
      1. Una tarea difícil, rápido.
      2. Varias fáciles al mismo tiempo (concurrente).
      3. Varias fáciles con límite de tiempo.
      4. Varias difíciles con límite de tiempo.
    """

    def __init__(self, va: "VirtualAssistant") -> None:
        self.va = va
        self.tasks: Dict[str, TrainingTask] = {}
        self.results: List[TrainingTaskResult] = []
        self._register_default_tasks()

    # -- registro -------------------------------------------------------------
    def _register_default_tasks(self) -> None:
        # --- FÁCILES ---
        self.register(
            "easy_system_status", "Estado del sistema",
            "Consultar estado del sistema",
            TaskDifficulty.EASY,
            lambda: self.va.skills.run("system_status", {}),
            lambda r: r.get("status") == "ok",
        )
        self.register(
            "easy_memory_status", "Estado de memoria",
            "Consultar estado de memoria",
            TaskDifficulty.EASY,
            lambda: self.va.skills.run("memory_status", {}),
            lambda r: r.get("status") == "ok",
        )
        self.register(
            "easy_list_notes", "Listar notas",
            "Listar notas guardadas",
            TaskDifficulty.EASY,
            lambda: self.va.skills.run("note_list", {}),
            lambda r: r.get("status") == "ok",
        )
        self.register(
            "easy_chat_greeting", "Saludo",
            "Decir hola a ARIA",
            TaskDifficulty.EASY,
            lambda: {"response": self.va.process_text("hola"), "status": "ok"},
            lambda r: bool(r.get("response")),
        )
        self.register(
            "easy_list_files", "Listar archivos",
            "Listar archivos de ARIA_APP",
            TaskDifficulty.EASY,
            lambda: self.va.skills.run("file_list", {"path": str(ARIA_APP)}),
            lambda r: r.get("status") == "ok" and "entries" in r,
        )
        self.register(
            "easy_add_note", "Agregar nota",
            "Agregar una nota de prueba",
            TaskDifficulty.EASY,
            lambda: self.va.skills.run("note_add", {"text": "Nota de entrenamiento " + str(time.time())}),
            lambda r: r.get("status") == "ok",
        )
        # --- DIFÍCILES ---
        self.register(
            "hard_write_read_note", "Escribir y leer nota",
            "Escribir una nota y verificar que se puede leer",
            TaskDifficulty.HARD,
            self._task_write_read_note,
            lambda r: r.get("verified") is True,
            time_limit=10.0,
        )
        self.register(
            "hard_file_roundtrip", "Ida y vuelta de archivo",
            "Crear archivo temporal, leerlo, verificar y eliminarlo",
            TaskDifficulty.HARD,
            self._task_file_roundtrip,
            lambda r: r.get("verified") is True,
            time_limit=10.0,
        )
        self.register(
            "hard_multi_skill_chain", "Cadena multi-skill",
            "Ejecutar 4 skills en secuencia y verificar todas",
            TaskDifficulty.HARD,
            self._task_multi_skill_chain,
            lambda r: r.get("all_ok") is True,
            time_limit=15.0,
        )
        self.register(
            "hard_chat_complex", "Chat complejo",
            "Responder a una pregunta de razonamiento",
            TaskDifficulty.HARD,
            lambda: {"response": self.va.process_text("Explica en una frase qué es la recursividad en programación"), "status": "ok"},
            lambda r: bool(r.get("response") and len(r.get("response", "")) > 10),
            time_limit=10.0,
        )
        self.register(
            "hard_autonomous_toggle", "Cambio autónomo doble",
            "Activar modo autónomo, verificar, desactivar, verificar",
            TaskDifficulty.HARD,
            self._task_autonomous_toggle,
            lambda r: r.get("verified") is True,
            time_limit=10.0,
        )
        # ── BIEN DIFÍCILES ──
        self.register(
            "hard_multi_file_analysis", "Análisis multi-archivo",
            "Listar archivos de ARIA_APP, leer los primeros .py y contar líneas totales",
            TaskDifficulty.HARD,
            self._task_multi_file_analysis,
            lambda r: r.get("verified") is True,
            time_limit=15.0,
        )
        self.register(
            "hard_long_skill_chain", "Cadena larga de skills",
            "Ejecutar 5 skills en secuencia y agregar una nota al final",
            TaskDifficulty.HARD,
            self._task_long_skill_chain,
            lambda r: r.get("all_ok") is True,
            time_limit=15.0,
        )
        self.register(
            "hard_text_processing", "Procesamiento de texto local",
            "Crear nota, contar palabras de todas las notas, escribir archivo con el conteo y verificarlo",
            TaskDifficulty.HARD,
            self._task_text_processing,
            lambda r: r.get("verified") is True,
            time_limit=15.0,
        )
        # ── CASI IMPOSIBLES ──
        self.register(
            "near_impossible_self_file", "Archivo autoreferencial",
            "Crear un archivo que contenga su propia ruta absoluta, leerlo y verificar que la ruta aparece en el contenido",
            TaskDifficulty.HARD,
            self._task_self_referential_file,
            lambda r: r.get("verified") is True,
            time_limit=15.0,
        )
        self.register(
            "near_impossible_cross_domain", "Reporte transversal",
            "Combinar estado del sistema + memoria + archivos en un reporte único, guardarlo como nota y verificarlo",
            TaskDifficulty.HARD,
            self._task_cross_domain_report,
            lambda r: r.get("verified") is True,
            time_limit=15.0,
        )
        # ── IMPOSIBLE (autocumplida) ──
        self.register(
            "impossible_self_fulfilling_prophecy", "Profecía autocumplida",
            "ARIA predice el nombre exacto de un archivo que creará, lo crea y verifica que existe y que su nota lo menciona",
            TaskDifficulty.HARD,
            self._task_self_fulfilling_prophecy,
            lambda r: r.get("verified") is True,
            time_limit=15.0,
        )

    def register(
        self,
        task_id: str,
        name: str,
        description: str,
        difficulty: TaskDifficulty,
        fn: Callable[[], Dict[str, Any]],
        expected_check: Optional[Callable[[Dict[str, Any]], bool]] = None,
        time_limit: Optional[float] = None,
    ) -> None:
        self.tasks[task_id] = TrainingTask(
            id=task_id,
            name=name,
            description=description,
            difficulty=difficulty,
            fn=fn,
            expected_check=expected_check,
            time_limit=time_limit,
        )

    # -- ejecución individual -------------------------------------------------
    def run_task(self, task_id: str) -> TrainingTaskResult:
        task = self.tasks.get(task_id)
        if not task:
            res = TrainingTaskResult(
                task_id, task_id, TaskDifficulty.EASY, TaskResult.FAILURE, 0.0, error="tarea no encontrada"
            )
            self.results.append(res)
            return res

        start = time.time()
        try:
            if task.time_limit:
                with ThreadPoolExecutor(max_workers=1) as ex:
                    future = ex.submit(task.fn)
                    try:
                        output = future.result(timeout=task.time_limit)
                    except _FutureTimeoutError:
                        elapsed = time.time() - start
                        res = TrainingTaskResult(
                            task.id, task.name, task.difficulty, TaskResult.TIMEOUT, elapsed, error="tiempo agotado"
                        )
                        self.results.append(res)
                        return res
            else:
                output = task.fn()
            elapsed = time.time() - start

            if task.expected_check and not task.expected_check(output):
                res = TrainingTaskResult(
                    task.id, task.name, task.difficulty, TaskResult.FAILURE, elapsed, output=output,
                    error="resultado no esperado",
                )
            else:
                res = TrainingTaskResult(
                    task.id, task.name, task.difficulty, TaskResult.SUCCESS, elapsed, output=output,
                )
        except Exception as exc:
            elapsed = time.time() - start
            res = TrainingTaskResult(
                task.id, task.name, task.difficulty, TaskResult.FAILURE, elapsed, error=str(exc),
            )

        self.results.append(res)
        return res

    # -- ejecución concurrente -----------------------------------------------
    def run_concurrent(self, task_ids: List[str], max_workers: int = 5) -> List[TrainingTaskResult]:
        results: List[TrainingTaskResult] = []
        with ThreadPoolExecutor(max_workers=max_workers) as ex:
            futures = {ex.submit(self.run_task, tid): tid for tid in task_ids}
            for fut in as_completed(futures):
                results.append(fut.result())
        return results

    # -- etapas de entrenamiento ----------------------------------------------
    def stage_one_hard_quick(self) -> TrainingTaskResult:
        """Etapa 1: una tarea difícil, debe completarse rápido."""
        hard = [tid for tid, t in self.tasks.items() if t.difficulty == TaskDifficulty.HARD]
        if not hard:
            return TrainingTaskResult(
                "stage1", "etapa1", TaskDifficulty.HARD, TaskResult.FAILURE, 0.0, error="no hay tareas difíciles"
            )
        return self.run_task(hard[0])

    def stage_easy_concurrent(self) -> List[TrainingTaskResult]:
        """Etapa 2: varias tareas fáciles al mismo tiempo."""
        easy = [tid for tid, t in self.tasks.items() if t.difficulty == TaskDifficulty.EASY]
        return self.run_concurrent(easy)

    def stage_easy_timed(self, time_limit: float = 5.0) -> List[TrainingTaskResult]:
        """Etapa 3: tareas fáciles con límite de tiempo."""
        easy = [tid for tid, t in self.tasks.items() if t.difficulty == TaskDifficulty.EASY]
        results: List[TrainingTaskResult] = []
        with ThreadPoolExecutor(max_workers=len(easy)) as ex:
            futures = {}
            for tid in easy:
                task = self.tasks[tid]
                task.time_limit = time_limit
                futures[ex.submit(self.run_task, tid)] = tid
            for fut in as_completed(futures):
                results.append(fut.result())
        return results

    def stage_hard_timed(self, time_limit: float = 8.0) -> List[TrainingTaskResult]:
        """Etapa 4: tareas difíciles con límite de tiempo."""
        hard = [tid for tid, t in self.tasks.items() if t.difficulty == TaskDifficulty.HARD]
        results: List[TrainingTaskResult] = []
        with ThreadPoolExecutor(max_workers=len(hard)) as ex:
            futures = {}
            for tid in hard:
                task = self.tasks[tid]
                task.time_limit = time_limit
                futures[ex.submit(self.run_task, tid)] = tid
            for fut in as_completed(futures):
                results.append(fut.result())
        return results

    def run_full_cycle(self) -> Dict[str, Any]:
        """Ejecuta las 4 etapas en orden y devuelve el resumen completo."""
        report: Dict[str, Any] = {}

        r1 = self.stage_one_hard_quick()
        report["etapa1_hard_rapido"] = self._result_dict(r1)

        r2 = self.stage_easy_concurrent()
        report["etapa2_easies_concurrentes"] = [self._result_dict(r) for r in r2]

        r3 = self.stage_easy_timed()
        report["etapa3_easies_con_limite"] = [self._result_dict(r) for r in r3]

        r4 = self.stage_hard_timed()
        report["etapa4_dificiles_con_limite"] = [self._result_dict(r) for r in r4]

        report["resumen"] = self.get_summary()
        return report

    def _result_dict(self, r: TrainingTaskResult) -> Dict[str, Any]:
        return {
            "task": r.task_name,
            "id": r.task_id,
            "dificultad": r.difficulty.value,
            "resultado": r.result.value,
            "tiempo_s": round(r.elapsed, 3),
            "error": r.error,
        }

    def get_summary(self) -> Dict[str, Any]:
        total = len(self.results)
        success = sum(1 for r in self.results if r.result == TaskResult.SUCCESS)
        failure = sum(1 for r in self.results if r.result == TaskResult.FAILURE)
        timeout = sum(1 for r in self.results if r.result == TaskResult.TIMEOUT)
        avg_time = sum(r.elapsed for r in self.results) / total if total else 0
        return {
            "total": total,
            "exitosas": success,
            "fallidas": failure,
            "tiempo_agotado": timeout,
            "tiempo_promedio_s": round(avg_time, 3),
            "tasa_exito": round(success / total * 100, 1) if total else 0,
        }

    def reset(self) -> None:
        self.results = []

    # -- implementaciones de tareas difíciles ---------------------------------
    def _task_write_read_note(self) -> Dict[str, Any]:
        text = "Nota entrenamiento hard " + str(time.time())
        write = self.va.skills.run("note_add", {"text": text})
        if write.get("status") != "ok":
            return {"verified": False, "error": write.get("error")}
        read = self.va.skills.run("note_list", {})
        if read.get("status") != "ok":
            return {"verified": False, "error": read.get("error")}
        notes = read.get("notes", [])
        verified = any(n.get("text") == text for n in notes)
        return {"verified": verified}

    def _task_file_roundtrip(self) -> Dict[str, Any]:
        import tempfile
        tmp = Path(tempfile.gettempdir()) / f"aria_train_{int(time.time()*1000)}.txt"
        content = "contenido prueba " + str(time.time())
        write = self.va.skills.run("file_write", {"path": str(tmp), "content": content})
        if write.get("status") != "ok":
            return {"verified": False, "error": write.get("error")}
        read = self.va.skills.run("file_read", {"path": str(tmp)})
        if read.get("status") != "ok":
            return {"verified": False, "error": read.get("error")}
        verified = content in read.get("content", "")
        try:
            tmp.unlink()
        except Exception:
            pass
        return {"verified": verified}

    def _task_multi_skill_chain(self) -> Dict[str, Any]:
        skills_to_run = ["system_status", "memory_status", "note_list", "file_list"]
        all_ok = True
        for sid in skills_to_run:
            params: Dict[str, Any] = {}
            if sid == "file_list":
                params = {"path": str(ARIA_APP)}
            r = self.va.skills.run(sid, params)
            if r.get("status") != "ok":
                all_ok = False
        return {"all_ok": all_ok}

    def _task_autonomous_toggle(self) -> Dict[str, Any]:
        r1 = self.va.skills.run("autonomous_toggle", {"enable": True})
        if r1.get("status") != "ok" or r1.get("autonomous") is not True:
            return {"verified": False, "error": "no se pudo activar autónomo"}
        st = self.va.get_status()
        if not st.get("autonomous"):
            self.va.start_autonomous()
        r2 = self.va.skills.run("autonomous_toggle", {"enable": False})
        if r2.get("status") != "ok" or r2.get("autonomous") is not False:
            return {"verified": False, "error": "no se pudo desactivar autónomo"}
        self.va.stop_autonomous()
        return {"verified": True}

    # ── implementaciones de tareas desafiantes ──
    def _task_multi_file_analysis(self) -> Dict[str, Any]:
        listing = self.va.skills.run("file_list", {"path": str(ARIA_APP)})
        if listing.get("status") != "ok":
            return {"verified": False, "error": listing.get("error")}
        entries = listing.get("entries", [])
        py_files = [e for e in entries if e.get("name", "").endswith(".py")]
        total_lines = 0
        for pf in py_files[:3]:
            fpath = str(Path(ARIA_APP) / pf["name"])
            read = self.va.skills.run("file_read", {"path": fpath})
            if read.get("status") == "ok":
                content = read.get("content", "")
                total_lines += content.count("\n") + 1
        return {"verified": total_lines > 0, "lines": total_lines, "files": len(py_files)}

    def _task_long_skill_chain(self) -> Dict[str, Any]:
        chain = [
            ("system_status", {}),
            ("memory_status", {}),
            ("note_list", {}),
            ("file_list", {"path": str(ARIA_APP)}),
            ("conversation_history", {}),
        ]
        all_ok = True
        for sid, params in chain:
            r = self.va.skills.run(sid, params)
            if r.get("status") != "ok":
                all_ok = False
        r_note = self.va.skills.run("note_add", {"text": "Cadena larga completada " + str(time.time())})
        if r_note.get("status") != "ok":
            all_ok = False
        return {"all_ok": all_ok, "steps": len(chain) + 1}

    def _task_text_processing(self) -> Dict[str, Any]:
        import tempfile
        txt = "Entrenamiento de ARIA procesamiento de texto local " + str(time.time())
        w = self.va.skills.run("note_add", {"text": txt})
        if w.get("status") != "ok":
            return {"verified": False, "error": w.get("error")}
        r = self.va.skills.run("note_list", {})
        if r.get("status") != "ok":
            return {"verified": False, "error": r.get("error")}
        notes = r.get("notes", [])
        joined = " ".join(n.get("text", "") for n in notes)
        word_count = len(joined.split())
        out_path = Path(tempfile.gettempdir()) / f"aria_wordcount_{int(time.time()*1000)}.txt"
        wr = self.va.skills.run("file_write", {"path": str(out_path), "content": f"palabras: {word_count}"})
        if wr.get("status") != "ok":
            return {"verified": False, "error": wr.get("error")}
        fr = self.va.skills.run("file_read", {"path": str(out_path)})
        verified = fr.get("status") == "ok" and str(word_count) in fr.get("content", "")
        try:
            out_path.unlink()
        except Exception:
            pass
        return {"verified": verified, "words": word_count}

    def _task_self_referential_file(self) -> Dict[str, Any]:
        import tempfile
        tmp = Path(tempfile.gettempdir()) / f"aria_self_{int(time.time()*1000)}.txt"
        content = f"Este archivo fue creado por ARIA en {tmp} a las {time.time()}"
        w = self.va.skills.run("file_write", {"path": str(tmp), "content": content})
        if w.get("status") != "ok":
            return {"verified": False, "error": w.get("error")}
        r = self.va.skills.run("file_read", {"path": str(tmp)})
        if r.get("status") != "ok":
            return {"verified": False, "error": r.get("error")}
        verified = str(tmp) in r.get("content", "")
        try:
            tmp.unlink()
        except Exception:
            pass
        return {"verified": verified}

    def _task_cross_domain_report(self) -> Dict[str, Any]:
        s = self.va.skills.run("system_status", {})
        m = self.va.skills.run("memory_status", {})
        f = self.va.skills.run("file_list", {"path": str(ARIA_APP)})
        report = f"SISTEMA: {s.get('platform','?')} | MEMORIA: {m.get('conversations',0)} convs | ARCHIVOS: {len(f.get('entries',[]))} entradas"
        w = self.va.skills.run("note_add", {"text": report})
        if w.get("status") != "ok":
            return {"verified": False, "error": w.get("error")}
        r = self.va.skills.run("note_list", {})
        if r.get("status") != "ok":
            return {"verified": False, "error": r.get("error")}
        notes = r.get("notes", [])
        verified = any(report in n.get("text", "") for n in notes)
        return {"verified": verified, "report": report}

    def _task_self_fulfilling_prophecy(self) -> Dict[str, Any]:
        import tempfile
        fname = f"aria_prophecy_{int(time.time()*1000)}.txt"
        tmp = Path(tempfile.gettempdir()) / fname
        prophecy = f"Profecía: se creará el archivo {fname}"
        w1 = self.va.skills.run("note_add", {"text": prophecy})
        if w1.get("status") != "ok":
            return {"verified": False, "error": w1.get("error")}
        w2 = self.va.skills.run("file_write", {"path": str(tmp), "content": "La profecía se cumplió: " + fname})
        if w2.get("status") != "ok":
            return {"verified": False, "error": w2.get("error")}
        fr = self.va.skills.run("file_read", {"path": str(tmp)})
        exists = fr.get("status") == "ok"
        r = self.va.skills.run("note_list", {})
        mentions = any(fname in n.get("text", "") for n in r.get("notes", []))
        try:
            tmp.unlink()
        except Exception:
            pass
        return {"verified": exists and mentions}

    # ── suite de desafío progresivo ──
    def run_challenge_suite(self) -> Dict[str, Any]:
        """Ejecuta las tareas desafiantes: bien difíciles, casi imposibles e imposible."""
        challenge_ids = [
            "hard_multi_file_analysis",
            "hard_long_skill_chain",
            "hard_text_processing",
            "near_impossible_self_file",
            "near_impossible_cross_domain",
            "impossible_self_fulfilling_prophecy",
        ]
        results = [self.run_task(tid) for tid in challenge_ids]
        return {
            "suite": "desafio_progresivo",
            "results": [self._result_dict(r) for r in results],
            "summary": self.get_summary(),
        }


# ─── Núcleo VA: une IA + voz + skills + autónomo + entrenamiento ─────────────

class VirtualAssistant:
    """Asistente virtual único: IA local + voz local + skills locales + autónomo."""

    def __init__(self) -> None:
        self.brain = LocalAIBrain()
        self.voice = LocalVoice()
        self.skills = LocalSkills(self.brain)
        self.training = TrainingSystem(self)
        self.autonomous = False
        self._awake = False
        try:
            import conocimiento, experiencia, mejora, aprendizaje, planificador, nucleo, forma
            import conversacion, coherencia, atomizacion, brief, presencia, certeza, cita_sim, gen_local, demo
            self.grafo = conocimiento.grafo()
            self.conv = conversacion.crear_conversacion()
            self.arnes = aprendizaje.Arnes(responder=lambda t: self.brain.chat(t).get('response',''), grafo=self.grafo)
            try:
                self._forma = forma.crear_forma(nucleo_factory=nucleo.crear_nucleo, avatar_factory=lambda: __import__('chibi').crear_chibi())
                self._forma.mostrar('nucleo')
            except Exception:
                self._forma = None
        except Exception:
            self.grafo = None
            self.arnes = None
            self._forma = None
        self._callbacks: Dict[str, List[Callable]] = {
            "on_response": [],
            "on_wake": [],
            "on_state": [],
        }
        self._load_autonomous_state()

    def _load_autonomous_state(self) -> None:
        st = _load_json(AUTONOMOUS_STATE_FILE, {"autonomous": False})
        self.autonomous = False
    def save_autonomous_state(self) -> None:
        _save_json(AUTONOMOUS_STATE_FILE, {"autonomous": self.autonomous})

    # -- registro de callbacks ------------------------------------------------
    def on(self, event: str, cb: Callable) -> None:
        if event in self._callbacks:
            self._callbacks[event].append(cb)

    def _emit(self, event: str, *args) -> None:
        for cb in self._callbacks.get(event, []):
            try:
                cb(*args)
            except Exception:
                pass

    # -- ciclo principal ------------------------------------------------------
    #: Prefijos con los que el usuario pide guardar algo en la memoria.
    _PIDE_RECORDAR = ("recuerda ", "recuerda:", "apunta ", "apunta:", "anota ", "anota:")

    def _intencion_recordar(self, text: str) -> Optional[str]:
        """Si el texto pide recordar algo, lo guarda. Devuelve la respuesta.

        Lo pedido se guarda como recuerdo de la sesion (volatil) y, si la
        memoria persistente esta encendida, tambien como hecho del usuario.
        """
        t = str(text or "").strip()
        if not t:
            return None
        low = t.lower()
        if low.rstrip(" .,:;!?") in ("recuerda", "apunta", "anota"):
            return "¿Qué quieres que recuerde exactamente?"
        for prefijo in self._PIDE_RECORDAR:
            if low.startswith(prefijo):
                contenido = t[len(prefijo):].strip(" :,-")
                if not contenido:
                    return "¿Qué quieres que recuerde exactamente?"
                memory_session_add(contenido)
                persistente = memory_retain(
                    contenido, tipo="hechos", fuente="usuario", confianza="usuario"
                )
                donde = "esta sesión y la memoria" if persistente is not None else "esta sesión"
                return f"Guardado en {donde}: {contenido}"
        return None

    def process_text(self, text: str) -> str:
        """Procesa texto de entrada y devuelve respuesta de ARIA."""
        msg = text
        recordatorio = self._intencion_recordar(text)
        if recordatorio is not None:
            self._emit("on_response", text, recordatorio, {"source": "memoria"})
            return recordatorio
        hits = memory_recall(text, k=3)
        if hits:
            ctx = " ".join(str(h.get("texto", "")) for h in hits)
            if ctx:
                msg = f"[MEM:{ctx[:200]}] {text}"
        result = self.brain.chat(msg)
        response = result.get("response", "")
        self._emit("on_response", text, response, result)
        return response

    def process_voice(self, transcript: str) -> str:
        """Procesa un transcript de voz."""
        lower = transcript.lower()
        if self.voice.is_wake(transcript):
            self._awake = True
            self._emit("on_wake", transcript)
            # Extraer comando despues del wake word
            cmd_text = self.voice.strip_wake(transcript)
            if not cmd_text:
                resp = "Te escucho. ¿En qué te ayudo?"
                self.voice.speak_async(resp)
                self._emit("on_response", transcript, resp, {"source": "wake"})
                return resp
            return self.process_text(cmd_text)
        if self._awake or any(k in lower for k in ["aria", "asistente"]):
            return self.process_text(transcript)
        return ""

    def start_autonomous(self) -> None:
        self.autonomous = False
        try:
            self.save_autonomous_state()
        except Exception:
            pass
        return

    def stop_autonomous(self) -> None:
        self.autonomous = False
        self.save_autonomous_state()
        self._emit("on_state", "autonomous_off")

    # -- entrenamiento --------------------------------------------------------
    def run_training_stage(self, stage: str) -> Dict[str, Any]:
        """Ejecuta una etapa de entrenamiento.
        stage: 'etapa1' | 'etapa2' | 'etapa3' | 'etapa4' | 'ciclo_completo'
        """
        if stage == "etapa1":
            r = self.training.stage_one_hard_quick()
            res = {"stage": stage, "result": self.training._result_dict(r)}
        elif stage == "etapa2":
            rs = self.training.stage_easy_concurrent()
            res = {"stage": stage, "results": [self.training._result_dict(r) for r in rs]}
        elif stage == "etapa3":
            rs = self.training.stage_easy_timed()
            res = {"stage": stage, "results": [self.training._result_dict(r) for r in rs]}
        elif stage == "etapa4":
            rs = self.training.stage_hard_timed()
            res = {"stage": stage, "results": [self.training._result_dict(r) for r in rs]}
        elif stage == "ciclo_completo":
            res = {"stage": stage, "report": self.training.run_full_cycle()}
        else:
            res = {"stage": stage, "error": "etapa desconocida"}

        memory_retain(
            f"entrenamiento {stage}: {self.training.get_summary()}",
            tipo="experiencias",
            fuente="sistema",
            confianza="sistema",
        )
        return res

    def training_summary(self) -> Dict[str, Any]:
        return self.training.get_summary()

    def training_reset(self) -> None:
        self.training.reset()

    def run_challenge_suite(self) -> Dict[str, Any]:
        return self.training.run_challenge_suite()

    def memory_reflect(self) -> int:
        """Consolida la memoria (observaciones repetidas -> modelos). Sin LLM.

        Devuelve cuantas observaciones se promovieron. 0 si la memoria
        SQLite está apagada.
        """
        return memory_reflect()

    def memory_recall(self, consulta: str, k: int = 5) -> List[Dict[str, Any]]:
        """Busca en la memoria SQLite. Lista vacia si está apagada."""
        return memory_recall(consulta, k=k)

    def memory_list(self, capa: str = "", limite: int = 50) -> List[Dict[str, Any]]:
        """Entradas de memoria de una capa (o de todas)."""
        return memory_listar(capa, limite=limite)

    def memory_conteo(self) -> Dict[str, int]:
        """Cuantas entradas hay en cada capa."""
        return memory_conteo()

    def memory_borrar(self, capa: str, id_: int) -> bool:
        """Borra una entrada concreta de la memoria."""
        return memory_borrar(capa, id_)

    def memory_fijar(self, texto: str) -> Optional[int]:
        """Fija un texto como regla (capa que solo edita el usuario)."""
        return memory_fijar(texto)

    def memory_export(self) -> List[Dict[str, Any]]:
        """Todo el contenido de memoria, para exportarlo a JSON."""
        return memory_exportar()

    def memory_add(self, texto: str, capa: str = "observaciones",
                   fuente: str = "usuario", confianza: str = "usuario") -> Optional[int]:
        """Guarda una entrada escrita a mano. Devuelve su id, o None."""
        return memory_agregar(texto, capa=capa, fuente=fuente, confianza=confianza)

    def memory_import(self, ruta: str = "") -> Dict[str, Any]:
        """Importa un archivo (JSON o JSONL) en la memoria."""
        if ruta:
            return memory_importar_archivo(ruta)
        return memory_importar_conversaciones()

    def memory_session_add(self, texto: str, capa: str = "observaciones") -> Optional[int]:
        """Guarda un recuerdo de esta sesion (volatil)."""
        return memory_session_add(texto, capa=capa)

    def memory_session_list(self) -> List[Dict[str, Any]]:
        """Los recuerdos de esta sesion."""
        return memory_session_list()

    def memory_session_clear(self) -> int:
        """Vacia los recuerdos de la sesion. Devuelve cuantos habia."""
        return memory_session_clear()

    def memory_set_enabled(self, activo: Optional[bool]) -> bool:
        """Enciende o apaga la memoria SQLite en caliente."""
        return set_memory_enabled(activo)

    def memory_enabled(self) -> bool:
        """Si la memoria SQLite esta activa ahora mismo."""
        return _memory_enabled()

    def start_voice_listening(self) -> None:
        def _on_transcript(text: str) -> None:
            resp = self.process_voice(text)
            if resp:
                self.voice.speak_async(resp)

        def _on_wake(text: str) -> None:
            self.voice.speak_async("Te escucho.")

        self.voice.start_listening(_on_transcript, _on_wake)

    def stop_voice_listening(self) -> None:
        self.voice.stop_listening()

    def speak(self, text: str) -> None:
        self.voice.speak_async(text)

    def get_status(self) -> Dict[str, Any]:
        return {
            "autonomous": self.autonomous,
            "awake": self._awake,
            "voice_caps": self.voice.capabilities(),
            "skills": len(self.skills.list()),
            "conversations": len(_read_jsonl(CONVERSATIONS_FILE)),
            "model": "transformers" if self.brain._model_loaded else "rules",
            "mode": "100% local",
        }


# ─── Instancia singleton ─────────────────────────────────────────────────────

_va: Optional[VirtualAssistant] = None
_va_lock = threading.Lock()


def get_va() -> VirtualAssistant:
    global _va
    if _va is None:
        with _va_lock:
            if _va is None:
                _va = VirtualAssistant()
    return _va


def reset_va() -> None:
    global _va
    with _va_lock:
        _va = None


__all__ = [
    "LocalAIBrain",
    "LocalVoice",
    "LocalSkills",
    "VirtualAssistant",
    "get_va",
    "reset_va",
]
