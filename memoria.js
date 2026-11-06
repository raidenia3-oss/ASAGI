;(function () {
// ASAGI - Memoria local (grafo de conocimiento ligero). Port de conocimiento.py de ARIA.
//
// Guarda proposiciones (lo que Asagi aprende/hablan) con tema y fuente, dedup por texto.
// Se persiste con un 'store' inyectado (localStorage en el celu; un objeto en pruebas).
// Se integra con sync-memoria.js: expone leer()/importarItems() con el formato del puente.
//
// La LOGICA (dedup, buscar, stats) es PURA sobre la lista; el store es la unica parte
// con efecto. Sin servidores (Regla v2).

'use strict';

const CLAVE = 'asagi-memoria-v1';

function _ahora() { return Date.now() / 1000; }

// --- operaciones puras sobre una lista de nodos ---
function dedupInsertar(nodos, texto, tema = '', fuente = '') {
  const t = (texto || '').trim();
  if (!t) return { nodos, nuevo: false };
  const existe = nodos.some((n) => (n.texto || '').trim().toLowerCase() === t.toLowerCase());
  if (existe) return { nodos, nuevo: false };
  return { nodos: nodos.concat([{ texto: t, tema, fuente, ts: _ahora() }]), nuevo: true };
}

function buscarEn(nodos, consulta, k = 8) {
  const q = (consulta || '').toLowerCase().trim();
  if (!q) return nodos.slice(-k).reverse();
  const palabras = q.split(/\s+/).filter((w) => w.length > 2);
  const punt = [];
  for (const n of nodos) {
    const txt = (n.texto || '').toLowerCase();
    let s = txt.includes(q) ? 5 : 0;
    for (const w of palabras) if (txt.includes(w)) s += 1;
    if (s > 0) punt.push([s, n]);
  }
  punt.sort((a, b) => b[0] - a[0]);
  return punt.slice(0, k).map((x) => x[1]);
}

function statsDe(nodos) {
  const temas = {};
  for (const n of nodos) if (n.tema) temas[n.tema] = (temas[n.tema] || 0) + 1;
  return { nodos: nodos.length, temas };
}

// --- clase con persistencia (store inyectado: {get(),set(arr)} o localStorage) ---
class Memoria {
  constructor(store = null) {
    this._store = store;                 // {get:()=>arr, set:(arr)=>void} o localStorage
    this._cache = null;
  }
  _leerStore() {
    if (this._cache) return this._cache;
    let arr = [];
    try {
      if (this._store && this._store.get) arr = this._store.get() || [];
      else if (this._store && this._store.getItem) arr = JSON.parse(this._store.getItem(CLAVE) || '[]');
    } catch (e) { arr = []; }
    this._cache = Array.isArray(arr) ? arr : [];
    return this._cache;
  }
  _guardarStore(arr) {
    this._cache = arr;
    try {
      if (this._store && this._store.set) this._store.set(arr);
      else if (this._store && this._store.setItem) this._store.setItem(CLAVE, JSON.stringify(arr));
    } catch (e) { /* best-effort */ }
  }

  aprender(texto, tema = '', fuente = '') {
    const r = dedupInsertar(this._leerStore(), texto, tema, fuente);
    if (r.nuevo) this._guardarStore(r.nodos);
    return r.nuevo;
  }
  buscar(consulta, k = 8) { return buscarEn(this._leerStore(), consulta, k); }
  todos() { return this._leerStore().slice(); }
  stats() { return statsDe(this._leerStore()); }

  // --- integracion con el puente sync-memoria.js ---
  leer() { return { nodos: this._leerStore(), lecciones: [] }; }   // lo que exporta el sync
  importarItems({ nodos = [] } = {}) {                              // lo que mete el sync
    let arr = this._leerStore();
    let n = 0;
    for (const it of nodos) {
      const r = dedupInsertar(arr, it.texto, it.tema || '', it.fuente || ('sync:' + (it.origen || '?')));
      if (r.nuevo) { arr = r.nodos; n++; }
    }
    if (n) this._guardarStore(arr);
    return n;
  }
}

const API = { Memoria, dedupInsertar, buscarEn, statsDe, CLAVE };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiMemoria = API;

})();
