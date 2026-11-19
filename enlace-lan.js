;(function () {
// ASAGI <-> ARIA directo por WiFi (red local) y Bluetooth. Sin internet, sin tokens, sin servidor externo.
// Mismos sobres cifrados que enlace.js, con la misma clave del enlace. Quien no la tenga recibe silencio.
// Los sockets los abre el plugin nativo (AsagiControl); aqui solo se sella, se descubre y se elige la via.
'use strict';

var SAL_LAN = '6c616e2d7631' + '00'.repeat(10);
var PUERTO_UDP = 47831, CANAL_BT = 4;

function _E() { return (typeof window !== 'undefined' && window.AsagiEnlace) || (typeof require !== 'undefined' ? require('./enlace.js') : null); }

// ---- Emparejar sin cable (Diffie-Hellman RFC 3526 grupo 14; igual que aria/lan.py) ----
var DH_P = BigInt('0x' +
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DD' +
  'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
  'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F' +
  '83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B' +
  'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA0510' +
  '15728E5A8AACAA68FFFFFFFFFFFFFFFF');
function _modpow(b, e, m) { var r = 1n; b %= m; while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
function _aBytes(n, len) { var h = n.toString(16); h = '0'.repeat(len * 2 - h.length) + h; var u = new Uint8Array(len); for (var i = 0; i < len; i++) u[i] = parseInt(h.substr(i * 2, 2), 16); return u; }
function _b32(u) { var A = 'abcdefghijklmnopqrstuvwxyz234567', bits = 0, v = 0, o = ''; for (var i = 0; i < u.length; i++) { v = (v << 8) | u[i]; bits += 8; while (bits >= 5) { o += A[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) o += A[(v << (5 - bits)) & 31]; return o; }
async function _sha(pref, u) { var t = new TextEncoder().encode(pref), x = new Uint8Array(t.length + u.length); x.set(t); x.set(u, t.length); return new Uint8Array(await crypto.subtle.digest('SHA-256', x)); }
function dhPar() { var r = crypto.getRandomValues(new Uint8Array(32)), a = 0n; for (var i = 0; i < 32; i++) a = (a << 8n) | BigInt(r[i]); a |= 1n; return { a: a, A: _modpow(2n, a, DH_P) }; }
async function dhClave(a, B) {
  if (!(B > 1n && B < DH_P - 1n)) throw new Error('publico invalido');
  var sec = _aBytes(_modpow(B, a, DH_P), 256);
  var h = await _sha('asagi-aria-par1', sec), s2 = await _sha('sas', sec);
  var n = ((s2[0] << 24) >>> 0) + (s2[1] << 16) + (s2[2] << 8) + s2[3];
  return { clave: _b32(h.slice(0, 15)), codigo: String(n % 1000000).padStart(6, '0') };
}
// Pregunta en la red si hay una ARIA lista para emparejar. Devuelve { clave, codigo, host, tcp, nombre } o null.
async function emparejar(plugin) {
  var P = plugin && plugin(); if (!P || !P.lanDescubrir) return null;
  var k = dhPar(), disp = {};
  try { if (P.infoDispositivo) { var d = await P.infoDispositivo(); if (d && d.ok) disp = { fabricante: d.fabricante, marca: d.marca, modelo: d.modelo, nombre: d.nombre, android: d.android, androidId: d.androidId }; } } catch (e) {}
  var r; try { r = await P.lanDescubrir({ linea: JSON.stringify({ t: 'emparejar', A: k.A.toString(16), nombre: 'ASAGI', disp: disp }), puerto: PUERTO_UDP, espera: 2500 }); } catch (e) { return null; }
  if (!r || !r.ok) return null;
  try {
    var m = JSON.parse(r.linea);
    if (m.t === 'rechazado') return { rechazado: true, motivo: m.motivo || 'no es tu celular' };
    if (m.t !== 'emparejado' || !/^[0-9a-f]+$/i.test(m.B)) return null;
    var c = await dhClave(k.a, BigInt('0x' + m.B));
    return { clave: c.clave, codigo: c.codigo, host: r.host, tcp: m.tcp, nombre: m.nombre || 'ARIA' };
  } catch (e) { return null; }
}

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

  // Fase 1 (WiFi puro): broadcast UDP. Fase 2 (COMBINADO): si el router bloquea el broadcast,
  // se le pregunta por Bluetooth y ARIA contesta en que IP del WiFi esta; se verifica por TCP.
  async function verificar(host, puerto) {
    var P = o.plugin(); if (!P || !P.lanEnviar) return null;
    var linea = await sellar('asagi', { t: 'hola' }); if (!linea) return null;
    var r; try { r = await P.lanEnviar({ host: host, puerto: puerto, linea: linea }); } catch (e) { return null; }
    var c = r && r.ok ? await abrir(r.linea, 'aria') : null;
    return c && c.t === 'aqui' ? c : null;
  }
  async function buscar() {
    var P = o.plugin(); if (!P) return null;
    var linea = await sellar('asagi', { t: 'hola' }); if (!linea) return null;
    if (P.lanDescubrir) {
      var r; try { r = await P.lanDescubrir({ linea: linea, puerto: PUERTO_UDP, espera: 1500 }); } catch (e) { r = null; }
      var c = r && r.ok ? await abrir(r.linea, 'aria') : null;
      if (c && c.t === 'aqui') { destino = { host: r.host, puerto: c.tcp, nombre: c.nombre || 'ARIA', por: 'broadcast' }; return destino; }
    }
    // Cable USB: la PC hace "adb reverse", asi 127.0.0.1 del celular llega a ARIA aunque el WiFi falle.
    var usb = await verificar('127.0.0.1', 47832);
    if (usb) { destino = { host: '127.0.0.1', puerto: 47832, nombre: usb.nombre || 'ARIA', por: 'usb' }; return destino; }
    if (P.btEnviar) {                                      // combinado: Bluetooth te dice la IP, WiFi lleva los datos
      var b; try { b = await P.btEnviar({ linea: linea, canal: CANAL_BT }); } catch (e) { b = null; }
      var cb = b && b.ok ? await abrir(b.linea, 'aria') : null;
      if (cb && cb.t === 'aqui' && Array.isArray(cb.ips)) {
        for (var i = 0; i < cb.ips.length; i++) {
          if (await verificar(cb.ips[i], cb.tcp)) { destino = { host: cb.ips[i], puerto: cb.tcp, nombre: cb.nombre || 'ARIA', por: 'bluetooth' }; return destino; }
        }
      }
    }
    return null;
  }

  async function porWifi(carga) {
    var P = o.plugin(); if (!P || !P.lanEnviar) return null;
    for (var intento = 0; intento < 2; intento++) {
      if (!destino && !(await buscar())) return null;
      var linea = await sellar('asagi', carga);
      var esperaMs = carga && (carga.t === 'bot' || carga.t === 'web') ? 50000 : 8000;   // un bot que piensa con ARIA tarda mas
      var r; try { r = await P.lanEnviar({ host: destino.host, puerto: destino.puerto, linea: linea, esperaMs: esperaMs }); } catch (e) { r = null; }
      if (!r && carga && (carga.t === 'bot' || carga.t === 'web')) return null;        // no reenviar: ARIA ya puede estar pensando
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

  // Archivo grande (Wikipedia) solo por WiFi: el plugin lo escribe directo en la SD; aquí solo se sella el pedido.
  async function bajarArchivo(carga) {
    var P = o.plugin(); if (!P || !P.lanBajarArchivo) return { ok: false, error: 'app vieja' };
    if (!(await K())) return { ok: false, error: 'sinClave' };
    if (!destino && !(await buscar())) return { ok: false, error: 'no veo a ARIA en el WiFi' };
    var linea = await sellar('asagi', carga);
    try { return await P.lanBajarArchivo({ host: destino.host, puerto: destino.puerto, linea: linea }); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  }

  return { enviar: enviar, buscar: buscar, bajarArchivo: bajarArchivo, verificar: verificar, estado: function () { return { destino: destino, via: ultimaVia }; } };
}

var API = { SAL_LAN: SAL_LAN, emparejar: emparejar, dhPar: dhPar, dhClave: dhClave, nuevaClaveLan: nuevaClaveLan, codigoLan: codigoLan, parsearCodigoLan: parsearCodigoLan, crearCliente: crearCliente };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiLan = API;
})();
