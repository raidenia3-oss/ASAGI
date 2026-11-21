;(function () {
// ASAGI - Mapa mundo procedimental. Espejo JS de mapa_mundo.py de ARIA.
// Mismo algoritmo SHA-256 -> mismo seed = mismo mundo en PC y celu.
// PURO: sin red, sin servidores, stdlib-equivalente.
'use strict';

const VERSION = 2;
const _SEED_DEFAULT = "aura2026";

const _BIOMES = [
    "Chamber of Resonance",
    "Chimera Shadow Garden: Void",
    "Feeding Grounds",
    "Swamp",
    "Ethereal Unbound Sky",
    "Unforgiving Tempest",
    "Coffin of the Iron Mountain",
    "Idle Death Gamble",
    "Deadly Sentencing",
    "Malevolent Shrine",
    "Malevolent Shrine/Kitchen",
    "Self-Embodiment of Perfection",
    "Self-Embodiment of Perfection: Open Barrier",
    "Self-Embodiment of Perfection: Closed Barrier",
    "Inverse Crossing",
    "Unlimited Void 0.2s",
    "Unlimited Void",
    "Ocean",
    "Desert",
    "Tundra",
    "Forest",
    "Volcano",
    "Ruins",
    "Sanctuary",
    "Void Rift"
];

const _LAYERS = ["terreno", "naturaleza", "estructuras", "entidades", "elevacion", "clima"];

// Memoization cache
const _cache = new Map();
function _cacheKey(fn, args) { return fn + ":" + args.join("|"); }
function _memo(fn, keyFn) {
    return function() {
        const args = Array.prototype.slice.call(arguments);
        const key = keyFn ? keyFn.apply(null, args) : _cacheKey(fn.name, args);
        if (_cache.has(key)) return _cache.get(key);
        const r = fn.apply(null, args);
        _cache.set(key, r);
        return r;
    };
}

// ------------------------------------------------------------- SHA-256 puro
function _sha256(str) {
  const utf8 = unescape(encodeURIComponent(str));
  const bytes = [];
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i));
  const ml = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((ml / Math.pow(2, i * 8)) & 0xff);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];

  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function toHex(n) {
    let s = '';
    for (let i = 7; i >= 0; i--) s += ((n >>> (i * 4)) & 0xf).toString(16);
    return s;
  }

  for (let i = 0; i < bytes.length; i += 64) {
    const w = new Array(64);
    for (let j = 0; j < 16; j++) {
      w[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) |
             (bytes[i + j * 4 + 2] << 8) | (bytes[i + j * 4 + 3]);
    }
    for (let j = 16; j < 64; j++) {
      const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let j = 0; j < 64; j++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + K[j] + w[j]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7);
}

function _modHex(hex, mod) {
  let r = 0;
  for (let i = 0; i < hex.length; i++) {
    r = (r * 16 + parseInt(hex[i], 16)) % mod;
  }
  return r;
}

function _h(text, semilla, mod) {
  return _modHex(_sha256(semilla + "|" + text), mod);
}

// Perlin-like smooth noise
function _noise(x, y, semilla) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = _h("n:" + ix + ":" + iy, semilla, 1000) / 1000;
  const b = _h("n:" + (ix+1) + ":" + iy, semilla, 1000) / 1000;
  const c = _h("n:" + ix + ":" + (iy+1), semilla, 1000) / 1000;
  const d = _h("n:" + (ix+1) + ":" + (iy+1), semilla, 1000) / 1000;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// ------------------------------------------------------------- generacion determinista
function _biomaRaw(x, y, semilla) {
  const e = _noise(x * 0.05, y * 0.05, semilla);
  const m = _noise(x * 0.1, y * 0.1, semilla + "|m");
  if (e < 0.25) return "Ocean";
  if (e < 0.32) return "Swamp";
  if (e > 0.85) return "Tundra";
  if (m > 0.75) return "Volcano";
  if (m < 0.2) return "Desert";
  const idx = _h("bioma:" + Math.floor(x/4) + ":" + Math.floor(y/4), semilla, _BIOMES.length);
  return _BIOMES[idx];
}

function biomaEn(x, y, semilla) {
  semilla = semilla || _SEED_DEFAULT;
  return _memo(_biomaRaw, (a,b,c) => "bioma:" + a + ":" + b + ":" + c)(x, y, semilla);
}

function elevacionEn(x, y, semilla) {
  semilla = semilla || _SEED_DEFAULT;
  const key = "elev:" + x + ":" + y + ":" + semilla;
  if (_cache.has(key)) return _cache.get(key);
  const v = Math.round(_noise(x * 0.08, y * 0.08, semilla + "|elev") * 100);
  _cache.set(key, v);
  return v;
}

function climaEn(x, y, semilla) {
  semilla = semilla || _SEED_DEFAULT;
  const key = "clima:" + x + ":" + y + ":" + semilla;
  if (_cache.has(key)) return _cache.get(key);
  const e = elevacionEn(x, y, semilla);
  const temp = Math.round(30 - e * 0.3 + _noise(x*0.1, y*0.1, semilla+"|t")*10);
  const hum = Math.round(_noise(x*0.12, y*0.12, semilla+"|h")*100);
  const r = { temp: temp, humedad: hum, viento: Math.round(_noise(x*0.15,y*0.15,semilla+"|v")*100) };
  _cache.set(key, r);
  return r;
}

function valorCapa(capa, x, y, semilla) {
  semilla = semilla || _SEED_DEFAULT;
  if (capa === "elevacion") return elevacionEn(x, y, semilla);
  if (capa === "clima") return climaEn(x, y, semilla);
  return _h(capa + ":" + x + ":" + y, semilla, 1000);
}

function chunk(cx, cy, semilla, tam) {
  semilla = semilla || _SEED_DEFAULT;
  tam = tam || 16;
  const celdas = [];
  for (let dy = 0; dy < tam; dy++) {
    for (let dx = 0; dx < tam; dx++) {
      const x = cx * tam + dx;
      const y = cy * tam + dy;
      const b = biomaEn(x, y, semilla);
      const celda = { x: x, y: y, bioma: b };
      for (let i = 0; i < _LAYERS.length; i++) celda[_LAYERS[i]] = valorCapa(_LAYERS[i], x, y, semilla);
      celdas.push(celda);
    }
  }
  return {
    cx: cx, cy: cy, tam: tam, semilla: semilla, version: VERSION,
    biomaPrincipal: biomaEn(cx * tam, cy * tam, semilla),
    elevacionMedia: Math.round(celdas.reduce((s,c)=>s+c.elevacion,0)/celdas.length),
    celdas: celdas
  };
}

function region(x, y, radio, semilla) {
  semilla = semilla || _SEED_DEFAULT;
  const vistos = {};
  for (let dy = -radio; dy <= radio; dy++) {
    for (let dx = -radio; dx <= radio; dx++) {
      if (dx * dx + dy * dy > radio * radio) continue;
      const b = biomaEn(x + dx, y + dy, semilla);
      vistos[b] = (vistos[b] || 0) + 1;
    }
  }
  return Object.entries(vistos).sort((a, b) => b[1] - a[1]);
}

// Puntos de interes
function puntosInteres(semilla, cantidad) {
  semilla = semilla || _SEED_DEFAULT;
  cantidad = cantidad || 5;
  const pts = [];
  for (let i = 0; i < cantidad; i++) {
    const x = _h("poi:x:" + i, semilla, 200) - 100;
    const y = _h("poi:y:" + i, semilla, 200) - 100;
    pts.push({ id: i, x: x, y: y, nombre: "Punto " + (i+1), bioma: biomaEn(x, y, semilla) });
  }
  return pts;
}

// Export .auraworld
function exportarAuraworld(semilla, radio) {
  semilla = semilla || _SEED_DEFAULT;
  radio = radio || 32;
  const data = { version: VERSION, semilla: semilla, radio: radio, celdas: [] };
  for (let y = -radio; y <= radio; y++) {
    for (let x = -radio; x <= radio; x++) {
      data.celdas.push({ x: x, y: y, b: biomaEn(x,y,semilla), e: elevacionEn(x,y,semilla) });
    }
  }
  return JSON.stringify(data);
}

// Render texto
function renderTexto(cx, cy, radio, semilla) {
  semilla = semilla || _SEED_DEFAULT;
  radio = radio || 8;
  const lines = [];
  for (let y = cy - radio; y <= cy + radio; y++) {
    let row = "";
    for (let x = cx - radio; x <= cx + radio; x++) {
      const b = biomaEn(x, y, semilla);
      row += (b[0] || "?") + " ";
    }
    lines.push(row);
  }
  return lines.join("\n");
}

// Pathfinding simple (BFS)
function camino(ax, ay, bx, by, semilla) {
  semilla = semilla || _SEED_DEFAULT;
  const visited = new Set();
  const queue = [[ax, ay, [[ax, ay]]]];
  while (queue.length) {
    const [x, y, path] = queue.shift();
    const key = x + "," + y;
    if (visited.has(key)) continue;
    visited.add(key);
    if (x === bx && y === by) return path;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      const b = biomaEn(nx, ny, semilla);
      if (b === "Ocean" || b === "Void Rift") continue;
      queue.push([nx, ny, path.concat([[nx, ny]])]);
    }
  }
  return null;
}

const API = {
  VERSION: VERSION,
  biomaEn: biomaEn,
  valorCapa: valorCapa,
  chunk: chunk,
  region: region,
  biomas: _BIOMES,
  capas: _LAYERS,
  sha256: _sha256,
  elevacionEn: elevacionEn,
  climaEn: climaEn,
  puntosInteres: puntosInteres,
  exportarAuraworld: exportarAuraworld,
  renderTexto: renderTexto,
  camino: camino,
  noise: _noise,
  limpiarCache: function() { _cache.clear(); }
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.MapaMundo = API;

})();
