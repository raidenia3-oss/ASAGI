;(function () {
// ASAGI <-> ARIA: enlace propio, sin servidores.
//
// Ninguno de los dos escucha: ambos SOLO salen a internet y se encuentran en un
// gist privado de GitHub que hace de buzon. Cada mensaje viaja CIFRADO de extremo
// a extremo con una clave que solo conocen ASAGI y ARIA; GitHub solo ve bytes.
// Funciona con el celular en datos moviles y la PC en casa: no hace falta estar
// en el mismo Wi-Fi, ni cable, ni adb.
//
// Espejo exacto de enlace.py de ARIA (mismo formato, misma criptografia):
//   clave  -> PBKDF2-HMAC-SHA256 (100000) -> kEnc | kMac
//   cifra  -> flujo HMAC-SHA256(kEnc, nonce||i) XOR texto ; etiqueta HMAC(kMac, aad||0||nonce||ct)[:16]
//
// Las partes de formato/fusion son PURAS y testeables. La red entra por fetchFn.

'use strict';

var VERSION = 1;
var YO = 'asagi';
var OTRO = 'aria';
var API_BASE = 'https://api.github.com';
var ARCHIVO = 'enlace.json';
var ITER = 100000;
var MAX_MSGS = 150;
var MAX_EDAD_MS = 7 * 24 * 3600 * 1000;
var LATIDO_MS = 15 * 60 * 1000;
var ALFABETO = 'abcdefghijklmnopqrstuvwxyz234567';

// ------------------------------------------------------------------ bytes

function _cripto() {
  var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
  return (c && c.subtle) ? c : null;
}
function disponible() { return !!_cripto(); }

function _utf8(s) { return new TextEncoder().encode(String(s)); }
function _deUtf8(b) { return new TextDecoder('utf-8', { fatal: true }).decode(b); }
function _deHex(h) {
  var out = new Uint8Array(h.length / 2);
  for (var i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function _aHex(b) {
  var s = '';
  for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
  return s;
}
function _aB64(b) {
  var s = '';
  for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function _deB64(t) {
  var s = atob(t);
  var out = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function _unir() {
  var n = 0, i;
  for (i = 0; i < arguments.length; i++) n += arguments[i].length;
  var out = new Uint8Array(n), p = 0;
  for (i = 0; i < arguments.length; i++) { out.set(arguments[i], p); p += arguments[i].length; }
  return out;
}
function _azar(n) {
  var b = new Uint8Array(n);
  _cripto().getRandomValues(b);
  return b;
}

// ------------------------------------------------------------------ puro

function nuevaClave(n) {
  n = n || 24;
  var b = _azar(n), s = '';
  for (var i = 0; i < n; i++) s += ALFABETO.charAt(b[i] % 32);
  return s;
}

function hacerCodigo(gist, clave) { return 'ENL1-' + gist + '-' + clave; }

function parsearCodigo(codigo) {
  var p = String(codigo || '').trim().split('-');
  if (p.length !== 3 || p[0].toUpperCase() !== 'ENL1') return null;
  var gist = p[1].trim(), clave = p[2].trim().toLowerCase();
  if (!gist || !clave) return null;
  return { gist: gist, clave: clave };
}

function docNuevo(salHex) {
  return { v: VERSION, sal: salHex || _aHex(_azar(16)), vistos: {}, msgs: [] };
}

function docValido(doc) {
  return !!(doc && typeof doc === 'object' && doc.v === VERSION &&
            typeof doc.sal === 'string' && doc.sal.length === 32 && Array.isArray(doc.msgs));
}

function nuevoId(de, ts) { return de + '-' + ts + '-' + _aHex(_azar(4)); }

// Union por id, ordenada por tiempo, sin lo viejo y con tope. PURA.
function fusionar(msgsDoc, extra, ahora) {
  var porId = {}, orden = [];
  var todos = (msgsDoc || []).concat(extra || []);
  for (var i = 0; i < todos.length; i++) {
    var m = todos[i];
    if (m && typeof m.id === 'string' && typeof m.de === 'string' &&
        Number.isInteger(m.ts) && typeof m.c === 'string' && !porId[m.id]) {
      porId[m.id] = { id: m.id, de: m.de, ts: m.ts, c: m.c };
      orden.push(porId[m.id]);
    }
  }
  var vivos = orden.filter(function (x) { return ahora - x.ts <= MAX_EDAD_MS; });
  vivos.sort(function (a, b) { return (a.ts - b.ts) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
  return vivos.slice(-MAX_MSGS);
}

function entrantes(msgs, yo, procesados) {
  var hechos = {};
  (procesados || []).forEach(function (x) { hechos[x] = true; });
  return (msgs || []).filter(function (m) { return m && m.de !== yo && !hechos[m.id]; });
}

function hace(ms, ahora) {
  if (!ms) return 'aún no aparece';
  var seg = Math.max(0, Math.floor((ahora - ms) / 1000));
  if (seg < 90) return 'hace un momento';
  if (seg < 3600) return 'hace ' + Math.floor(seg / 60) + ' min';
  if (seg < 86400) return 'hace ' + Math.floor(seg / 3600) + ' h';
  return 'hace ' + Math.floor(seg / 86400) + ' días';
}

// "dile a ARIA que ..." -> devuelve el mensaje, o null si no es para ARIA. PURA.
function esParaAria(texto) {
  var t = String(texto || '').normalize('NFC').trim();
  var n = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  var m = n.match(/^(?:(?:dile|avisa(?:le)?|manda(?:le)?|envia(?:le)?|cuenta(?:le)?|escribe(?:le)?)\s+a\s+aria|para\s+aria)\b\s*[:,]?\s*(?:que\s+)?/);
  if (!m) return null;
  var resto = t.slice(m[0].length).trim();
  return resto || null;
}

function explicar(status) {
  if (status === 0) return 'Sin conexión a internet.';
  if (status === 401) return 'GitHub rechazó el token. Revisa que esté bien copiado y no vencido.';
  if (status === 403) return 'GitHub negó el acceso. Al token le falta el permiso "gist" o alcanzó el límite.';
  if (status === 404) return 'No encuentro el buzón. Revisa el código y que el token sea de la misma cuenta.';
  return 'GitHub respondió ' + status + '.';
}

// ------------------------------------------------------------------ cifrado

async function derivar(clave, salHex) {
  var s = _cripto().subtle;
  var base = await s.importKey('raw', _utf8(clave), 'PBKDF2', false, ['deriveBits']);
  var bits = new Uint8Array(await s.deriveBits(
    { name: 'PBKDF2', salt: _deHex(salHex), iterations: ITER, hash: 'SHA-256' }, base, 512));
  var alg = { name: 'HMAC', hash: 'SHA-256' };
  return {
    enc: await s.importKey('raw', bits.slice(0, 32), alg, false, ['sign']),
    mac: await s.importKey('raw', bits.slice(32, 64), alg, false, ['sign'])
  };
}

async function _hmac(k, datos) {
  return new Uint8Array(await _cripto().subtle.sign('HMAC', k, datos));
}

async function _flujo(kEnc, nonce, n) {
  var out = new Uint8Array(n), p = 0, i = 0;
  while (p < n) {
    var cont = new Uint8Array([(i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255]);
    var bloque = await _hmac(kEnc, _unir(nonce, cont));
    out.set(bloque.subarray(0, Math.min(32, n - p)), p);
    p += 32; i += 1;
  }
  return out;
}

function _aad(id, de, ts) { return _utf8(id + '|' + de + '|' + ts); }

async function cifrar(claves, id, de, ts, carga, nonce) {
  nonce = nonce || _azar(12);
  var pt = _utf8(JSON.stringify(carga));
  var flujo = await _flujo(claves.enc, nonce, pt.length);
  var ct = new Uint8Array(pt.length);
  for (var i = 0; i < pt.length; i++) ct[i] = pt[i] ^ flujo[i];
  var tag = (await _hmac(claves.mac, _unir(_aad(id, de, ts), new Uint8Array([0]), nonce, ct))).subarray(0, 16);
  return _aB64(_unir(nonce, ct, tag));
}

// Devuelve la carga, o null si el mensaje fue alterado o la clave no es.
async function descifrar(claves, id, de, ts, c) {
  try {
    var crudo = _deB64(c);
    if (crudo.length < 28) return null;
    var nonce = crudo.subarray(0, 12), ct = crudo.subarray(12, crudo.length - 16), tag = crudo.subarray(crudo.length - 16);
    var bueno = (await _hmac(claves.mac, _unir(_aad(id, de, ts), new Uint8Array([0]), nonce, ct))).subarray(0, 16);
    var dif = 0;
    for (var i = 0; i < 16; i++) dif |= tag[i] ^ bueno[i];      // comparacion en tiempo constante
    if (dif !== 0) return null;
    var flujo = await _flujo(claves.enc, nonce, ct.length);
    var pt = new Uint8Array(ct.length);
    for (var j = 0; j < ct.length; j++) pt[j] = ct[j] ^ flujo[j];
    var carga = JSON.parse(_deUtf8(pt));
    return (carga && typeof carga === 'object' && !Array.isArray(carga)) ? carga : null;
  } catch (e) { return null; }
}

// ------------------------------------------------------------------ cliente (red: solo salida)

// o: { cfg() -> {token,gist,clave}, guardarCfg(c), leerEstado(), guardarEstado(e),
//      fetchFn (por defecto fetch), api (por defecto GitHub) }
function crearCliente(o) {
  o = o || {};
  var fetchFn = o.fetchFn || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  var api = o.api || API_BASE;
  var cacheClaves = { k: '', v: null };
  var enCurso = null;

  function estadoLocal() {
    var e = (o.leerEstado && o.leerEstado()) || {};
    if (!Array.isArray(e.procesados)) e.procesados = [];
    if (!Array.isArray(e.salida)) e.salida = [];
    if (!Array.isArray(e.recibidos)) e.recibidos = [];
    return e;
  }
  function guardar(e) { if (o.guardarEstado) o.guardarEstado(e); }

  async function http(metodo, ruta, token, cuerpo) {
    if (!fetchFn) return { status: 0, json: null };
    var h = { 'Accept': 'application/vnd.github+json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    var init = { method: metodo, headers: h, cache: 'no-store' };
    if (cuerpo !== undefined) { h['Content-Type'] = 'application/json'; init.body = JSON.stringify(cuerpo); }
    try {
      var r = await fetchFn(api + ruta, init);
      var j = null;
      try { j = await r.json(); } catch (e) {}
      return { status: r.status, json: j };
    } catch (e) { return { status: 0, json: null }; }
  }

  async function leerDoc(token, gist) {
    var r = await http('GET', '/gists/' + gist, token);
    if (r.status !== 200 || !r.json) return { status: r.status, doc: null };
    var arch = (r.json.files || {})[ARCHIVO] || {};
    var doc = null;
    try { doc = JSON.parse(arch.content || ''); } catch (e) {}
    return { status: 200, doc: docValido(doc) ? doc : null };
  }

  async function escribirDoc(token, gist, doc) {
    var files = {}; files[ARCHIVO] = { content: JSON.stringify(doc) };
    return (await http('PATCH', '/gists/' + gist, token, { files: files })).status;
  }

  async function clavesDe(clave, sal) {
    var k = clave + '|' + sal;
    if (cacheClaves.k !== k) cacheClaves = { k: k, v: await derivar(clave, sal) };
    return cacheClaves.v;
  }

  function vinculado() {
    var c = (o.cfg && o.cfg()) || {};
    return !!(c.token && c.gist && c.clave);
  }

  // ---------- ping: chequeo ligero sin I/O al celular ----------
  function ping() {
    return Promise.resolve({ ok: true, vinculado: vinculado(),
      texto: vinculado() ? "Buzon de enlace configurado." : "Buzon de enlace no configurado." });
  }

  // Crea el buzon (gist privado) y devuelve el codigo para pegar en ARIA.
  async function crear(token) {
    token = String(token || '').trim();
    if (!token) return { ok: false, texto: 'Falta el token de GitHub.' };
    var files = {}; files[ARCHIVO] = { content: JSON.stringify(docNuevo()) };
    var r = await http('POST', '/gists', token,
      { description: 'ASAGI <-> ARIA enlace (cifrado)', 'public': false, files: files });
    if ((r.status !== 200 && r.status !== 201) || !r.json || !r.json.id) return { ok: false, texto: explicar(r.status) };
    var clave = nuevaClave();
    if (o.guardarCfg) o.guardarCfg({ token: token, gist: r.json.id, clave: clave });
    return { ok: true, codigo: hacerCodigo(r.json.id, clave), texto: 'Enlace creado.' };
  }

  // Une este celular a un buzon ya creado (por ejemplo desde ARIA).
  async function vincular(token, codigo) {
    token = String(token || '').trim();
    var par = parsearCodigo(codigo);
    if (!token) return { ok: false, texto: 'Falta el token de GitHub.' };
    if (!par) return { ok: false, texto: 'Ese código no tiene la forma ENL1-xxxx-xxxx.' };
    var r = await leerDoc(token, par.gist);
    if (r.status !== 200) return { ok: false, texto: explicar(r.status) };
    if (!r.doc) return { ok: false, texto: 'El buzón existe pero su contenido no es un enlace válido.' };
    if (o.guardarCfg) o.guardarCfg({ token: token, gist: par.gist, clave: par.clave });
    return { ok: true, texto: 'ASAGI quedó enlazada con ARIA.' };
  }

  function encolar(tipo, cuerpo) {
    cuerpo = String(cuerpo || '').trim();
    if (!cuerpo) return null;
    var e = estadoLocal(), ts = Date.now();
    var item = { id: nuevoId(YO, ts), de: YO, ts: ts, tipo: tipo, cuerpo: cuerpo };
    e.salida.push(item);
    guardar(e);
    return item;
  }

  // Un ciclo: baja el buzon, lee lo nuevo, sube lo pendiente. Idempotente.
  async function _ciclo(forzar) {
    var c = (o.cfg && o.cfg()) || {};
    if (!(c.token && c.gist && c.clave)) return { ok: false, texto: 'ASAGI no está enlazada con ARIA.' };
    var r = await leerDoc(c.token, c.gist);
    if (r.status !== 200) return { ok: false, status: r.status, texto: explicar(r.status) };
    var doc = r.doc;
    if (!doc) return { ok: false, texto: 'El buzón está dañado o no es un enlace.' };
    var claves = await clavesDe(c.clave, doc.sal);
    var e = estadoLocal(), t = Date.now();

    var nuevos = [], ilegibles = 0;
    var ent = entrantes(doc.msgs, YO, e.procesados);
    for (var i = 0; i < ent.length; i++) {
      var m = ent[i];
      var carga = await descifrar(claves, m.id, m.de, m.ts, m.c);
      e.procesados.push(m.id);
      if (!carga) { ilegibles += 1; continue; }
      var item = { id: m.id, de: m.de, ts: m.ts, tipo: String(carga.tipo || 'nota'), cuerpo: String(carga.cuerpo || '') };
      nuevos.push(item);
      e.recibidos.push(item);
    }
    e.procesados = e.procesados.slice(-600);
    e.recibidos = e.recibidos.slice(-50);

    var enDoc = {};
    doc.msgs.forEach(function (x) { if (x && x.id) enDoc[x.id] = true; });
    var faltan = e.salida.filter(function (s) { return !enDoc[s.id] && t - s.ts <= MAX_EDAD_MS; });
    e.salida = faltan;

    var vistos = (doc.vistos && typeof doc.vistos === 'object') ? doc.vistos : {};
    var latidoViejo = t - (Number(vistos[YO]) || 0) > LATIDO_MS;
    var subidos = 0;
    if (faltan.length || latidoViejo || forzar) {
      var cifrados = [];
      for (var k = 0; k < faltan.length; k++) {
        var s = faltan[k];
        cifrados.push({ id: s.id, de: YO, ts: s.ts,
          c: await cifrar(claves, s.id, YO, s.ts, { tipo: s.tipo, cuerpo: s.cuerpo }) });
      }
      doc.msgs = fusionar(doc.msgs, cifrados, t);
      vistos[YO] = t;
      doc.vistos = vistos;
      var st = await escribirDoc(c.token, c.gist, doc);
      if (st !== 200) {
        guardar(e);
        return { ok: false, status: st, texto: 'Leí el buzón pero no pude escribir. ' + explicar(st), nuevos: nuevos };
      }
      subidos = faltan.length;
    }
    guardar(e);
    return { ok: true, nuevos: nuevos, ilegibles: ilegibles, subidos: subidos,
             enCola: subidos ? 0 : faltan.length, vistoOtro: Number(vistos[OTRO]) || 0, ahora: t };
  }

  // No se pisan dos ciclos a la vez (evita escribir dos veces el mismo buzon).
  function sincronizar(forzar) {
    if (enCurso) return enCurso;
    enCurso = _ciclo(forzar).then(
      function (r) { enCurso = null; return r; },
      function (err) { enCurso = null; return { ok: false, texto: 'Error del enlace: ' + (err && err.message || err) }; });
    return enCurso;
  }

  async function enviar(tipo, cuerpo) {
    if (!vinculado()) return { ok: false, texto: 'ASAGI no está enlazada con ARIA.' };
    if (!encolar(tipo, cuerpo)) return { ok: false, texto: 'Falta el texto a enviar.' };
    if (enCurso) { try { await enCurso; } catch (e) {} }
    var r = await sincronizar();
    if (!r.ok) return { ok: false, enCola: true, texto: 'Guardado en cola; saldrá cuando haya conexión. ' + (r.texto || ''), nuevos: r.nuevos || [] };
    return { ok: true, texto: 'Enviado a ARIA.', nuevos: r.nuevos, vistoOtro: r.vistoOtro, ahora: r.ahora };
  }

  return { vinculado: vinculado, ping: ping, crear: crear, vincular: vincular, encolar: encolar,
           sincronizar: sincronizar, enviar: enviar, recibidos: function () { return estadoLocal().recibidos; } };
}

var API = {
  VERSION: VERSION, YO: YO, OTRO: OTRO, ARCHIVO: ARCHIVO, MAX_MSGS: MAX_MSGS, MAX_EDAD_MS: MAX_EDAD_MS,
  disponible: disponible, nuevaClave: nuevaClave, hacerCodigo: hacerCodigo, parsearCodigo: parsearCodigo,
  docNuevo: docNuevo, docValido: docValido, nuevoId: nuevoId, fusionar: fusionar, entrantes: entrantes,
  hace: hace, esParaAria: esParaAria, explicar: explicar,
  derivar: derivar, cifrar: cifrar, descifrar: descifrar, crearCliente: crearCliente,
  _deHex: _deHex, _aHex: _aHex
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiEnlace = API;

})();
