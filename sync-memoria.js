;(function () {
// ASAGI - Sync de memoria selectiva (lado Asagi). Espejo JS de sync_memoria.py de ARIA.
//
// ARIA (PC) y Asagi (celu) comparten memoria SIN servidor: via un archivo JSON neutral
// en una carpeta/repo compartido. Cada lado EXPORTA lo que decide compartir e IMPORTA
// lo del otro. Mismo formato y mismo HASH que el lado Python -> dedup cruzado correcto.
//
// SELECTIVO: una politica decide que sale (lista blanca de temas, lista negra, fuentes
// privadas). Lo privado nunca cruza. Dedup por hash, no borra nada.
//
// La logica es PURA y testeable. El hash es SHA-1(texto.trim().toLowerCase())[:16],
// identico a hashlib.sha1(...).hexdigest()[:16] de Python.

'use strict';

const VERSION = 1;

// ------------------------------------------------------------- SHA-1 (compacto, puro)
// Implementacion estandar de SHA-1 sobre UTF-8; coincide con hashlib.sha1 de Python.
function _sha1(str) {
  function rotl(n, s) { return (n << s) | (n >>> (32 - s)); }
  function toHex(n) { let s = ''; for (let i = 7; i >= 0; i--) s += ((n >>> (i * 4)) & 0xf).toString(16); return s; }
  // UTF-8 encode
  const utf8 = unescape(encodeURIComponent(str));
  const bytes = [];
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
  const ml = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((ml / Math.pow(2, i * 8)) & 0xff);
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
  for (let i = 0; i < bytes.length; i += 64) {
    const w = new Array(80);
    for (let j = 0; j < 16; j++) {
      w[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) |
             (bytes[i + j * 4 + 2] << 8) | (bytes[i + j * 4 + 3]);
    }
    for (let j = 16; j < 80; j++) w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f, k;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6; }
      const t = (rotl(a, 5) + f + e + k + w[j]) | 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4);
}

function hash(texto) {
  return _sha1(String(texto || '').trim().toLowerCase()).slice(0, 16);
}

// ------------------------------------------------------------- politica + filtro (puro)

function politica({ temas_compartir = null, temas_privados = null, fuentes_privadas = null } = {}) {
  return {
    temas_compartir: temas_compartir ? new Set(temas_compartir) : null,
    temas_privados: new Set(temas_privados || []),
    fuentes_privadas: new Set((fuentes_privadas || []).map((f) => String(f).toLowerCase())),
  };
}

function esCompartible(item, pol) {
  const tema = (item.tema || '').trim();
  const fuente = (item.fuente || '').trim().toLowerCase();
  if (pol.fuentes_privadas.size && pol.fuentes_privadas.has(fuente)) return false;
  if (pol.temas_privados.has(tema)) return false;
  if (pol.temas_compartir) return pol.temas_compartir.has(tema);
  return true;
}

// ------------------------------------------------------------- bundle (puro)

function construirBundle(nodos, lecciones, pol, origen = 'asagi-celu') {
  const n_out = [];
  const l_out = [];
  for (const n of nodos || []) {
    if (!(n.texto || '').trim()) continue;
    if (esCompartible(n, pol)) {
      n_out.push({ texto: n.texto, tema: n.tema || '', fuente: n.fuente || '',
                   ts: n.ts, hash: hash(n.texto) });
    }
  }
  for (const l of lecciones || []) {
    if (!(l.leccion || '').trim()) continue;
    if (esCompartible(l, pol)) {
      l_out.push({ leccion: l.leccion, tema: l.tema || '', resultado: l.resultado || '',
                   ts: l.ts, hash: hash(l.leccion) });
    }
  }
  return { version: VERSION, origen, ts: Date.now() / 1000, nodos: n_out, lecciones: l_out };
}

// Dado un bundle entrante y los hashes que YA tienes, devuelve SOLO lo nuevo. Puro.
function fusionar(bundle, hashesNodos, hashesLecciones) {
  if (!bundle || bundle.version !== VERSION) {
    return { nodos: [], lecciones: [], error: 'version incompatible' };
  }
  const hn = hashesNodos instanceof Set ? hashesNodos : new Set(hashesNodos || []);
  const hl = hashesLecciones instanceof Set ? hashesLecciones : new Set(hashesLecciones || []);
  return {
    nodos: (bundle.nodos || []).filter((n) => !hn.has(n.hash)),
    lecciones: (bundle.lecciones || []).filter((l) => !hl.has(l.hash)),
    origen: bundle.origen, error: null,
  };
}

// ------------------------------------------------------------- export / import (impuro)

// 'leer()' devuelve {nodos:[], lecciones:[]} de la memoria local de Asagi.
// 'guardar(bundleStr)' escribe el bundle a la carpeta/repo compartido.
// 'importarItems({nodos,lecciones})' mete lo nuevo en la memoria local.
function exportar({ leer, guardar, pol, origen = 'asagi-celu' }) {
  const { nodos = [], lecciones = [] } = (leer ? leer() : {}) || {};
  const bundle = construirBundle(nodos, lecciones, pol || politica(), origen);
  if (guardar) guardar(JSON.stringify(bundle, null, 2));
  return { ok: true, nodos: bundle.nodos.length, lecciones: bundle.lecciones.length, bundle };
}

function importar({ bundleStr, leer, importarItems }) {
  let bundle;
  try { bundle = typeof bundleStr === 'string' ? JSON.parse(bundleStr) : bundleStr; }
  catch (e) { return { ok: false, error: 'bundle ilegible' }; }
  const { nodos = [], lecciones = [] } = (leer ? leer() : {}) || {};
  const hn = new Set(nodos.map((n) => hash(n.texto)));
  const hl = new Set(lecciones.map((l) => hash(l.leccion)));
  const nuevo = fusionar(bundle, hn, hl);
  if (nuevo.error) return { ok: false, error: nuevo.error };
  if (importarItems) importarItems({ nodos: nuevo.nodos, lecciones: nuevo.lecciones, origen: nuevo.origen });
  return { ok: true, nodos_nuevos: nuevo.nodos.length, lecciones_nuevas: nuevo.lecciones.length,
           origen: nuevo.origen };
}

const API = { hash, politica, esCompartible, construirBundle, fusionar, exportar, importar, VERSION };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiSync = API;

})();
