;(function () {
// ASAGI <-> ARIA directo por WiFi (red local) y Bluetooth. Sin internet, sin tokens, sin servidor externo.
// Mismos sobres cifrados que enlace.js, con la misma clave del enlace. Quien no la tenga recibe silencio.
// Los sockets los abre el plugin nativo (AsagiControl); aqui solo se sella, se descubre y se elige la via.
'use strict';

var SAL_LAN = '6c616e2d7631' + '00'.repeat(10);
var PUERTO_UDP = 47831, CANAL_BT = 4;

function _E() { return (typeof window !== 'undefined' && window.AsagiEnlace) || (typeof require !== 'undefined' ? require('./enlace.js') : null); }

function nuevaClaveLan() { return _E().nuevaClave(); }
function codigoLan(clave) { return 'LAN1-' + clave; }
function parsearCodigoLan(t) {
  var m = String(t || '').trim().match(/^LAN1-([a-z2-7]{16,64})$/i);
  return m ? m[1].toLowerCase() : null;
}

// o: { plugin() -> AsagiControl, clave() -> string, leer(k), guardar(k,v) }
function crearCliente(o) {
  var E = _E(), claves = null, claveUsada = '', destino = null, ultimaVia = null;

  async function K() {
    var c = o.clave();
    if (!c) return null;
    if (!claves || claveUsada !== c) { claves = await E.derivar(c, SAL_LAN); claveUsada = c; }
    return claves;
  }
  async function sellar(de, carga) {
    var k = await K(); if (!k) return null;
    var ts = Date.now(), id = de + '-' + ts + '-' + E._aHex(crypto.getRandomValues(new Uint8Array(4)));
    return JSON.stringify({ id: id, de: de, ts: ts, c: await E.cifrar(k, id, de, ts, carga) });
  }
  async function abrir(linea, deEsperado) {
    var k = await K(); if (!k) return null;
    try {
      var m = JSON.parse(linea);
      if (m.de !== deEsperado || Math.abs(Date.now() - m.ts) > 120000) return null;
      return await E.descifrar(k, String(m.id), deEsperado, Number(m.ts), String(m.c));
    } catch (e) { return null; }
  }

  async function buscar() {
    var P = o.plugin(); if (!P || !P.lanDescubrir) return null;
    var linea = await sellar('asagi', { t: 'hola' }); if (!linea) return null;
    var r; try { r = await P.lanDescubrir({ linea: linea, puerto: PUERTO_UDP, espera: 1500 }); } catch (e) { return null; }
    if (!r || !r.ok) return null;
    var c = await abrir(r.linea, 'aria');
    if (!c || c.t !== 'aqui') return null;                 // ajeno o respuesta falsa: se ignora
    destino = { host: r.host, puerto: c.tcp, nombre: c.nombre || 'ARIA' };
    return destino;
  }

  async function porWifi(carga) {
    var P = o.plugin(); if (!P || !P.lanEnviar) return null;
    for (var intento = 0; intento < 2; intento++) {
      if (!destino && !(await buscar())) return null;
      var linea = await sellar('asagi', carga);
      var r; try { r = await P.lanEnviar({ host: destino.host, puerto: destino.puerto, linea: linea }); } catch (e) { r = null; }
      if (r && r.ok) { var resp = await abrir(r.linea, 'aria'); if (resp) return resp; }
      destino = null;                                      // cambio de red / IP nueva: reintenta descubriendo
    }
    return null;
  }

  async function porBluetooth(carga) {
    var P = o.plugin(); if (!P || !P.btEnviar) return null;
    var linea = await sellar('asagi', carga); if (!linea) return null;
    var r; try { r = await P.btEnviar({ linea: linea, canal: CANAL_BT }); } catch (e) { return null; }
    return r && r.ok ? await abrir(r.linea, 'aria') : null;
  }

  // WiFi primero (rapido); si no hay, Bluetooth. Devuelve { ok, via, resp } o { ok:false }.
  async function enviar(carga) {
    if (!(await K())) return { ok: false, motivo: 'sinClave' };
    var r = await porWifi(carga);
    if (r) { ultimaVia = 'wifi'; return { ok: true, via: 'wifi', resp: r }; }
    r = await porBluetooth(carga);
    if (r) { ultimaVia = 'bluetooth'; return { ok: true, via: 'bluetooth', resp: r }; }
    ultimaVia = null;
    return { ok: false, motivo: 'sinCamino' };
  }

  return { enviar: enviar, buscar: buscar, estado: function () { return { destino: destino, via: ultimaVia }; } };
}

var API = { SAL_LAN: SAL_LAN, nuevaClaveLan: nuevaClaveLan, codigoLan: codigoLan, parsearCodigoLan: parsearCodigoLan, crearCliente: crearCliente };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiLan = API;
})();
