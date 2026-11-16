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

// Activación (idea de ACT-R, usada en asistentes como el de M. Kraus): un recuerdo pesa más si es reciente y si se usa seguido.
// Devuelve 0..~0.95: solo desempata entre recuerdos que coinciden igual (lo que se usa sube; lo que no, se apaga). PURO.
function activacion(n, ahora) {
  const dias = Math.max(0, ((ahora || _ahora()) - (n.ult || n.ts || 0)) / 86400);
  const recencia = Math.pow(1 + dias, -0.5);                 // decae como potencia: rápido al inicio, lento después
  const uso = Math.min(1, Math.log(1 + (n.usos || 0)) / Math.log(21));
  return 0.55 * recencia + 0.4 * uso;
}

function buscarEn(nodos, consulta, k = 8, ahora) {
  const q = (consulta || '').toLowerCase().trim();
  if (!q) return nodos.slice(-k).reverse();
  const palabras = q.split(/\s+/).filter((w) => w.length > 2);
  const punt = [];
  for (const n of nodos) {
    const txt = (n.texto || '').toLowerCase();
    let s = txt.includes(q) ? 5 : 0;
    for (const w of palabras) if (txt.includes(w)) s += 1;
    if (s > 0) punt.push([s + activacion(n, ahora), n]);
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
    // con localStorage: si otra copia de Memoria guardó algo, releer (si no, una pisaría a la otra)
    if (this._cache && this._store && this._store.getItem) {
      let raw = null; try { raw = this._store.getItem(CLAVE); } catch (e) {}
      if (raw === this._raw) return this._cache;
    } else if (this._cache) return this._cache;
    let arr = [];
    try {
      if (this._store && this._store.get) arr = this._store.get() || [];
      else if (this._store && this._store.getItem) { this._raw = this._store.getItem(CLAVE); arr = JSON.parse(this._raw || '[]'); }
    } catch (e) { arr = []; }
    this._cache = Array.isArray(arr) ? arr : [];
    return this._cache;
  }
  _guardarStore(arr) {
    this._cache = arr;
    try {
      if (this._store && this._store.set) this._store.set(arr);
      else if (this._store && this._store.setItem) { this._raw = JSON.stringify(arr); this._store.setItem(CLAVE, this._raw); }
    } catch (e) { /* best-effort */ }
  }

  aprender(texto, tema = '', fuente = '') {
    const r = dedupInsertar(this._leerStore(), texto, tema, fuente);
    if (r.nuevo) this._guardarStore(r.nodos);
    return r.nuevo;
  }
  buscar(consulta, k = 8) {
    const todos = this._leerStore(), r = buscarEn(todos, consulta, k);
    // usar un recuerdo lo refuerza (máx. 1 vez por hora para no gastar almacenamiento)
    if (r.length && (consulta || '').trim()) {
      const t = _ahora(); let toco = false;
      for (const n of r.slice(0, 3)) if (t - (n.ult || 0) > 3600) { n.usos = (n.usos || 0) + 1; n.ult = t; toco = true; }
      if (toco) this._guardarStore(todos);
    }
    return r;
  }
  // quita los nodos que cumplan pred(nodo); devuelve los quitados
  olvidar(pred) {
    const arr = this._leerStore(), fuera = arr.filter(pred);
    if (fuera.length) this._guardarStore(arr.filter((n) => !pred(n)));
    return fuera;
  }
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

// --- memoria como ciclo: decidir QUÉ vale la pena recordar (no todo el chat). PURO. ---
// Devuelve { texto, tema } o null. Guarda datos de Daniel (quién es, qué prefiere, qué tiene, fechas)
// y lo que pide recordar; descarta saludos, órdenes, preguntas sueltas y lo que dice ASAGI.
const _SALUDO = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|gracias|ok|okey|vale|si|no|jaja+|xd|perfecto|listo|dale|chao|adios)\b[\s!.?]*$/;
const _ORDEN = /^(abre|cierra|pon|activa|desactiva|busca|wifi|bluetooth|termux|nix|actualiza|nivel|equipo|bots|enlace|dile a aria|traduce|calcula)\b/;
function _n(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
function valeRecordar(texto, quien) {
  const crudo = String(texto || '').trim();
  const t = _n(crudo);
  if (quien !== 'user' || t.length < 10 || t.length > 600) return null;
  if (_SALUDO.test(t) || _ORDEN.test(t)) return null;
  // preguntas sin «?» («cuándo es mi cumpleaños») y órdenes de olvidar no son datos
  if (/^(?:cuando|como|cual|cuales|que|donde|quien|quienes|cuanto|cuantos|cuantas|por que|sabes|dime|olvida|olvidate|borra|ya no|recuerdame|recordarme|avisame|busca|buscar|donde anote|tengo algo|agrega|anota en)\b/.test(t)) return null;
  const pide = t.match(/^(?:recuerda|recuerdalo|acuerdate|no olvides|anota|apunta)(?:\s+que)?\s*[:,]?\s+(.{4,})$/);
  if (pide) return { texto: crudo.slice(crudo.length - pide[1].length).trim(), tema: 'pedido' };
  if (/\b(me gusta|me encanta|no me gusta|odio|prefiero|favorit[oa]s?|siempre uso|nunca uso)\b/.test(t)) return { texto: crudo, tema: 'preferencia' };
  if (/\b(soy|me llamo|vivo en|trabajo en|trabajo de|estudio|tengo|mi (?:novia|novio|esposa|mama|papa|hermano|hermana|hijo|hija|jefe|perro|gato|pc|celular|carro|casa|cumpleanos|correo|horario|examen)|mis \w+ son)\b/.test(t)
      && !/\?\s*$/.test(t)) return { texto: crudo, tema: 'dato' };
  if (/\b(\d{1,2} de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)|el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/.test(t)
      && !/\?\s*$/.test(t)) return { texto: crudo, tema: 'fecha' };
  return null;
}

const API = { Memoria, dedupInsertar, buscarEn, statsDe, CLAVE, valeRecordar, activacion };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiMemoria = API;

})();
