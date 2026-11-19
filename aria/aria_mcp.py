# -*- coding: utf-8 -*-
"""ARIA como servidor MCP por stdio (para Kilo, Claude Desktop o cualquier agente con MCP).

"Las APIs conectan sistemas; los MCP conectan a tus agentes con esos sistemas." Así Kilo puede
crear bots de ARIA, guardar/leer sus recuerdos, ver sus rutinas o sacar fuentes para un informe.

Sin red y sin puertos: habla por stdin/stdout (JSON-RPC 2.0, un mensaje por línea) y solo
existe mientras el cliente lo tiene abierto. Lee y escribe los MISMOS archivos que la app
(data/bots_agenda.json, data/recuerdos.json, data/rutinas.json): la ARIA abierta toma los bots
nuevos en su siguiente vuelta (cada 20 s).

Registro en Kilo (.kilo/kilo.json):
  "aria": {"type": "local", "command": ["python", "C:/Users/User/Downloads/AURA/ARIA_APP/aria_mcp.py"]}
"""
import io
import json
import os
import sys

_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _DIR)
VERSION_PROTOCOLO = "2025-06-18"

HERRAMIENTAS = [
    {"name": "aria_crear_bot", "description": "Programa un bot de ARIA con una frase en español. Ej: 'cada día a las 9 haz abrir trabajo', "
     "'cada 45 minutos recuérdame estirarme', 'cada lunes a las 9 investiga precios de GPU', 'a las 18 recuérdame salir'.",
     "inputSchema": {"type": "object", "properties": {"frase": {"type": "string"}}, "required": ["frase"]}},
    {"name": "aria_bots", "description": "Lista los bots programados de ARIA (activos, pausados, próxima vez).",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "aria_bot_control", "description": "Pausa, activa o borra un bot por número.",
     "inputSchema": {"type": "object", "properties": {"accion": {"type": "string", "enum": ["pausa", "activa", "borra"]},
                                                      "id": {"type": "integer"}}, "required": ["accion", "id"]}},
    {"name": "aria_recordar", "description": "Guarda un hecho sobre Daniel en la memoria curada de ARIA.",
     "inputSchema": {"type": "object", "properties": {"texto": {"type": "string"}}, "required": ["texto"]}},
    {"name": "aria_recuerdos", "description": "Lo que ARIA recuerda de Daniel; con 'consulta' devuelve solo lo relevante.",
     "inputSchema": {"type": "object", "properties": {"consulta": {"type": "string"}}}},
    {"name": "aria_rutinas", "description": "Rutinas de escritorio que Daniel le enseñó a ARIA (modo enseñar).",
     "inputSchema": {"type": "object", "properties": {}}},
    {"name": "aria_fuentes", "description": "Busca en la web y devuelve fuentes con fragmentos relevantes sobre un tema (para escribir un informe citado).",
     "inputSchema": {"type": "object", "properties": {"tema": {"type": "string"}, "n": {"type": "integer"}}, "required": ["tema"]}},
    {"name": "aria_nivel", "description": "Nivel de evolución de ARIA y el de ASAGI (el celular).",
     "inputSchema": {"type": "object", "properties": {}}},
]


def _texto(t, error=False):
    return {"content": [{"type": "text", "text": str(t)}], "isError": bool(error)}


def llamar(nombre, args):
    """Ejecuta una herramienta. PURO salvo por los archivos de ARIA."""
    args = args or {}
    if nombre == "aria_crear_bot":
        import bots_agenda as ba
        r = ba.Agenda().manejar(args.get("frase", ""))
        return _texto(r or "No entendí cuándo/qué. Ej: 'cada día a las 9 haz abrir trabajo'.", r is None)
    if nombre == "aria_bots":
        import bots_agenda as ba
        return _texto(ba.Agenda().manejar("bots"))
    if nombre == "aria_bot_control":
        import bots_agenda as ba
        return _texto(ba.Agenda().manejar("%s bot %d" % (args.get("accion", ""), int(args.get("id", 0)))))
    if nombre == "aria_recordar":
        import recuerdos as rc
        t = str(args.get("texto", "")).strip()
        if not t:
            return _texto("Falta el texto.", True)
        return _texto(rc.Recuerdos().manejar("recuerda que " + t) or "No lo guardé.")
    if nombre == "aria_recuerdos":
        import recuerdos as rc
        m = rc.Recuerdos()
        q = str(args.get("consulta", "")).strip()
        return _texto((m.contexto(q) or "Nada relevante.") if q else m.manejar("que recuerdas de mi"))
    if nombre == "aria_rutinas":
        import ensenar
        return _texto(ensenar.Ensenador().manejar("rutinas"))
    if nombre == "aria_fuentes":
        import informe as inf
        r = inf.informe(str(args.get("tema", "")), None, n=max(1, min(8, int(args.get("n") or 5))), guardar=False)
        if not r["fuentes"]:
            return _texto(r["md"], True)
        return _texto("\n\n".join("[%d] %s — %s\n%s" % (i, f.get("titulo", ""), f.get("url", ""), "\n".join(f.get("fragmentos", [])))
                                  for i, f in enumerate(r["fuentes"], 1)))
    if nombre == "aria_nivel":
        out = []
        try:
            import modos
            e = modos.evolucion_actual()
            out.append("ARIA: nivel %d · %s (%d pts)" % (e["idx"] + 1, e["nombre"], e["puntaje"]))
        except Exception as exc:
            out.append("ARIA: no pude leer su evolución (%s)" % exc)
        try:
            with open(os.path.join(_DIR, "data", "asagi_nivel.json"), encoding="utf-8") as f:
                a = json.load(f)
            out.append("ASAGI: nivel %s · %s" % (a.get("nivel"), a.get("nombre")))
        except Exception:
            out.append("ASAGI: aún no compartió su nivel")
        return _texto("\n".join(out))
    return _texto("Herramienta desconocida: %s" % nombre, True)


def atender(msg):
    """Un mensaje JSON-RPC -> respuesta (dict) o None si es notificación. PURO."""
    mid, met = msg.get("id"), msg.get("method", "")
    if mid is None:                                    # notificaciones (initialized, cancelled…)
        return None
    try:
        if met == "initialize":
            pv = (msg.get("params") or {}).get("protocolVersion") or VERSION_PROTOCOLO
            res = {"protocolVersion": pv, "capabilities": {"tools": {"listChanged": False}},
                   "serverInfo": {"name": "aria", "version": "1.0"},
                   "instructions": "Herramientas de ARIA (la asistente de escritorio de Daniel): bots programados, memoria, rutinas y fuentes web."}
        elif met == "ping":
            res = {}
        elif met == "tools/list":
            res = {"tools": HERRAMIENTAS}
        elif met == "tools/call":
            p = msg.get("params") or {}
            res = llamar(p.get("name", ""), p.get("arguments") or {})
        else:
            return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": "método no soportado: %s" % met}}
        return {"jsonrpc": "2.0", "id": mid, "result": res}
    except Exception as exc:
        return {"jsonrpc": "2.0", "id": mid, "result": _texto("Error: %s" % exc, True)}


def main():
    entrada = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")
    salida = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", newline="\n")
    sys.stdout = sys.stderr                            # cualquier print de los módulos va a stderr, no rompe el protocolo
    for linea in entrada:
        linea = linea.strip()
        if not linea:
            continue
        try:
            msg = json.loads(linea)
        except ValueError:
            r = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "JSON inválido"}}
        else:
            r = atender(msg)
        if r is not None:
            salida.write(json.dumps(r, ensure_ascii=False) + "\n")
            salida.flush()


if __name__ == "__main__":
    main()
