# -*- coding: utf-8 -*-
"""ARIA <-> ASAGI por WiFi (LAN) y Bluetooth, sin internet ni tokens.

Misma criptografia y misma clave que enlace.py (el CODIGO de enlace ya compartido).
Quien no tenga la clave NO puede hablar ni siquiera recibir respuesta: un dispositivo
ajeno es ignorado en silencio (esto es el "es mio / es ajeno" en la red).

  WiFi : UDP 47831 (descubrimiento: el celular pregunta, ARIA responde cifrado)
         TCP 47832 (una linea JSON cifrada por mensaje; respuesta cifrada)
  BT   : RFCOMM canal 4 (mismo protocolo de lineas), si el Python de Windows lo permite.

Solo biblioteca estandar. Corre en hilos dentro del proceso de ARIA (sin HTTP).
Uso:  srv = Servidor(clave, al_recibir); srv.iniciar()   /  srv.detener()
      al_recibir(carga: dict) -> dict   (la respuesta que vuelve al celular)
"""
from __future__ import annotations

import json
import secrets
import socket
import threading
import time
from typing import Any, Callable, Dict, List, Optional

import enlace

PUERTO_UDP = 47831
PUERTO_TCP = 47832
CANAL_BT = 4
SAL_LAN = "6c616e2d7631" + "00" * 10        # fija: los dos lados parten solo de la clave
VENTANA_MS = 120_000                        # tolerancia de reloj / anti-repeticion
MAX_LINEA = 64 * 1024

YO = "aria"
OTRO = "asagi"


def claves_de(clave: str):
    return enlace.derivar(clave, SAL_LAN)


def sellar(claves, de: str, carga: Dict[str, Any]) -> str:
    ts = int(time.time() * 1000)
    mid = "%s-%d-%s" % (de, ts, secrets.token_hex(4))
    return json.dumps({"id": mid, "de": de, "ts": ts, "c": enlace.cifrar(claves, mid, de, ts, carga)},
                      separators=(",", ":"))


def ips_locales() -> List[str]:
    """IPv4 de esta PC en redes privadas (para que el celular, vía Bluetooth, sepa dónde llamar por WiFi)."""
    ips: List[str] = []
    try:
        t = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        t.connect(("10.255.255.255", 1)); ips.append(t.getsockname()[0]); t.close()
    except OSError:
        pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if ip not in ips:
                ips.append(ip)
    except OSError:
        pass
    return [i for i in ips if not i.startswith("127.") and not i.startswith("169.254.")][:6]


class Antirrepeticion:
    def __init__(self) -> None:
        self._vistos: Dict[str, int] = {}
        self._l = threading.Lock()

    def nuevo(self, mid: str, ts: int, ahora_ms: int) -> bool:
        if abs(ahora_ms - ts) > VENTANA_MS:
            return False
        with self._l:
            for k in [k for k, v in self._vistos.items() if ahora_ms - v > 2 * VENTANA_MS]:
                del self._vistos[k]
            if mid in self._vistos:
                return False
            self._vistos[mid] = ts
            return True


def abrir(claves, linea: str, anti: Antirrepeticion, de_esperado: str = OTRO) -> Optional[Dict[str, Any]]:
    """Devuelve la carga si es de un dispositivo con la clave, reciente y no repetido; si no, None."""
    try:
        m = json.loads(linea)
        if m.get("de") != de_esperado:
            return None
        mid, ts = str(m["id"]), int(m["ts"])
        carga = enlace.descifrar(claves, mid, de_esperado, ts, str(m["c"]))
        if carga is None or not anti.nuevo(mid, ts, int(time.time() * 1000)):
            return None
        return carga
    except Exception:
        return None


class Servidor:
    def __init__(self, clave: str, al_recibir: Callable[[Dict[str, Any]], Dict[str, Any]],
                 nombre: str = "ARIA", puerto_udp: int = PUERTO_UDP, puerto_tcp: int = PUERTO_TCP,
                 usar_bluetooth: bool = True) -> None:
        self.claves = claves_de(clave)
        self.al_recibir = al_recibir
        self.nombre = nombre
        self.pu, self.pt = puerto_udp, puerto_tcp
        self.usar_bt = usar_bluetooth
        self.anti = Antirrepeticion()
        self._activo = threading.Event()
        self._socks: List[socket.socket] = []
        self.estado: Dict[str, Any] = {"wifi": False, "bluetooth": False, "ultimo": None}

    # ------------------------------------------------------------ WiFi
    def _udp(self) -> None:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("", self.pu)); s.settimeout(1.0); self._socks.append(s)
        while self._activo.is_set():
            try:
                datos, dir_ = s.recvfrom(4096)
            except socket.timeout:
                continue
            except OSError:
                break
            c = abrir(self.claves, datos.decode("utf-8", "ignore"), self.anti)
            if c and c.get("t") == "hola":
                resp = sellar(self.claves, YO, self._aqui())
                try:
                    s.sendto(resp.encode(), dir_)
                except OSError:
                    pass                    # ajenos: ni una respuesta

    def _tcp(self) -> None:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("", self.pt)); s.listen(4); s.settimeout(1.0); self._socks.append(s)
        self.estado["wifi"] = True
        while self._activo.is_set():
            try:
                con, _ = s.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            threading.Thread(target=self._atender, args=(con,), daemon=True).start()

    # ------------------------------------------------------------ comun
    def _aqui(self) -> Dict[str, Any]:
        return {"t": "aqui", "tcp": self.pt, "nombre": self.nombre, "ips": ips_locales()}

    def _atender(self, con: socket.socket) -> None:
        try:
            con.settimeout(10.0)
            buf = b""
            while self._activo.is_set() and len(buf) < MAX_LINEA:
                trozo = con.recv(4096)
                if not trozo:
                    return
                buf += trozo
                while b"\n" in buf:
                    linea, buf = buf.split(b"\n", 1)
                    c = abrir(self.claves, linea.decode("utf-8", "ignore"), self.anti)
                    if c is None:
                        return              # ajeno o alterado: se corta sin decir nada
                    self.estado["ultimo"] = int(time.time())
                    if c.get("t") == "hola":          # por TCP o Bluetooth: dice donde esta en el WiFi
                        con.sendall((sellar(self.claves, YO, self._aqui()) + "\n").encode())
                        continue
                    try:
                        r = self.al_recibir(c) or {"ok": True}
                    except Exception as e:  # el manejador nunca tumba el enlace
                        r = {"ok": False, "error": str(e)[:120]}
                    con.sendall((sellar(self.claves, YO, r) + "\n").encode())
        except OSError:
            pass
        finally:
            try:
                con.close()
            except OSError:
                pass

    def _bt(self) -> None:
        try:
            s = socket.socket(socket.AF_BLUETOOTH, socket.SOCK_STREAM, socket.BTPROTO_RFCOMM)  # type: ignore[attr-defined]
            s.bind((socket.BDADDR_ANY, CANAL_BT)); s.listen(2); s.settimeout(1.0)               # type: ignore[attr-defined]
        except Exception:
            return                          # este Python/Windows no da RFCOMM: queda solo WiFi
        self._socks.append(s); self.estado["bluetooth"] = True
        while self._activo.is_set():
            try:
                con, _ = s.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            threading.Thread(target=self._atender, args=(con,), daemon=True).start()

    def iniciar(self) -> Dict[str, Any]:
        if self._activo.is_set():
            return self.estado
        self._activo.set()
        for f in (self._udp, self._tcp) + ((self._bt,) if self.usar_bt else ()):
            threading.Thread(target=f, daemon=True).start()
        time.sleep(0.3)
        return self.estado

    def detener(self) -> None:
        self._activo.clear()
        for s in self._socks:
            try:
                s.close()
            except OSError:
                pass
        self._socks = []
        self.estado.update({"wifi": False, "bluetooth": False})


# ---------------------------------------------------------------- cliente (para pruebas y para ARIA->ASAGI)
def descubrir(clave: str, direccion: str = "255.255.255.255", puerto: int = PUERTO_UDP,
              espera: float = 1.5) -> Optional[Dict[str, Any]]:
    claves = claves_de(clave)
    anti = Antirrepeticion()
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1); s.settimeout(espera)
    try:
        s.sendto(sellar(claves, OTRO, {"t": "hola"}).encode(), (direccion, puerto))
        datos, dir_ = s.recvfrom(4096)
    except (socket.timeout, OSError):
        return None
    finally:
        s.close()
    c = abrir(claves, datos.decode("utf-8", "ignore"), anti, de_esperado=YO)
    return dict(c, host=dir_[0]) if c and c.get("t") == "aqui" else None


def enviar(clave: str, host: str, puerto: int, carga: Dict[str, Any], espera: float = 5.0) -> Optional[Dict[str, Any]]:
    """Cliente con el formato del CELULAR (de='asagi'); sirve de prueba del protocolo."""
    claves = claves_de(clave)
    try:
        with socket.create_connection((host, puerto), timeout=espera) as s:
            s.sendall((sellar(claves, OTRO, carga) + "\n").encode())
            buf = b""
            while b"\n" not in buf:
                t = s.recv(4096)
                if not t:
                    return None
                buf += t
        return abrir(claves, buf.split(b"\n", 1)[0].decode(), Antirrepeticion(), de_esperado=YO)
    except OSError:
        return None


# ---------------------------------------------------------------- consola
import os

ARCH_CLAVE = os.path.join(os.path.expanduser("~"), ".aria_lan_clave")


def clave_guardada() -> str:
    """1) .aria_lan_clave junto a este archivo, 2) la del script USB en el home, 3) la del enlace ENL1."""
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".aria_lan_clave"), "r", encoding="utf-8") as f:
            c = f.read().strip().lower()
            if c.startswith("lan1-"):
                c = c[5:]
            if c:
                return c
    except OSError:
        pass
    try:
        with open(ARCH_CLAVE, "r", encoding="utf-8") as f:
            c = f.read().strip()
            if c:
                return c
    except OSError:
        pass
    try:
        return enlace.cfg().get("clave", "")
    except Exception:
        return ""


def _main(argv: List[str]) -> int:
    cmd = argv[1] if len(argv) > 1 else "escuchar"
    if cmd == "vincular" and len(argv) > 2:
        cod = argv[2].strip()
        clave = cod[5:] if cod.upper().startswith("LAN1-") else (cod.split("-")[-1] if cod.upper().startswith("ENL1-") else "")
        if not clave:
            print("Codigo no valido. Usa el LAN1-... que muestra ASAGI con 'enlace pc'.")
            return 2
        with open(ARCH_CLAVE, "w", encoding="utf-8") as f:
            f.write(clave.lower())
        print("Vinculado. Ahora: python lan.py escuchar")
        return 0
    if cmd == "escuchar":
        clave = clave_guardada()
        if not clave:
            print("Falta vincular: python lan.py vincular LAN1-xxxx")
            return 2

        def al_recibir(c: Dict[str, Any]) -> Dict[str, Any]:
            print("[ASAGI]", c.get("t"), c.get("texto", ""))
            return {"ok": True, "recibido": True}

        srv = Servidor(clave, al_recibir)
        est = srv.iniciar()
        print("ARIA escuchando. WiFi:", est["wifi"], "| Bluetooth:", est["bluetooth"], "(Ctrl+C para salir)")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            srv.detener()
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    import sys
    raise SystemExit(_main(sys.argv))
