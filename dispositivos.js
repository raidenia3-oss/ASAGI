;(function () {
// ASAGI - Mapa de dispositivos de confianza (nombres de audífonos/altavoces
// guardados -> voz automática). 100% local, localStorage, sin servidores.
// Logica pura + persistencia inyectable. Testable en Node.

'use strict';

const CLAVE = 'asagi-dispositivos-v1';

function _ahora() { return Date.now(); }

function _id() { return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// ---- operaciones puras sobre una lista de dispositivos ----
function normalizarNombre(n) { return String(n || '').trim(); }

function existeDispositivo(dispositivos, nombre) {
  const n = normalizarNombre(nombre).toLowerCase();
  if (!n) return -1;
  return dispositivos.findIndex((d) => normalizarNombre(d.nombre).toLowerCase() === n);
}

function agregarDispositivo(dispositivos, nombre, tipo = 'audífono', ahora = null) {
  const n = normalizarNombre(nombre);
  if (!n) return { dispositivos, nuevo: false };
  if (existeDispositivo(dispositivos, n) >= 0) return { dispositivos, nuevo: false };
  const t = ahora instanceof Date ? ahora.getTime() : (ahora || _ahora());
  return {
    dispositivos: dispositivos.concat([{ id: _id(), nombre: n, tipo, confiable: true, creado: t, ultimoUso: null }]),
    nuevo: true,
  };
}

function quitarDispositivo(dispositivos, nombre) {
  const i = existeDispositivo(dispositivos, nombre);
  if (i < 0) return dispositivos;
  return dispositivos.filter((_, idx) => idx !== i);
}

function marcarUso(dispositivos, nombre, ahora = null) {
  const i = existeDispositivo(dispositivos, nombre);
  if (i < 0) return dispositivos;
  const t = ahora instanceof Date ? ahora.getTime() : (ahora || _ahora());
  return dispositivos.map((d, idx) => idx === i ? Object.assign({}, d, { ultimoUso: t }) : d);
}

function listarDispositivos(dispositivos) {
  return (dispositivos || []).slice().sort((a, b) => (b.ultimoUso || 0) - (a.ultimoUso || 0));
}

function esDeConfianza(dispositivos, nombre) {
  const i = existeDispositivo(dispositivos, nombre);
  return i >= 0 && !!dispositivos[i].confiable;
}

// ---- clase con persistencia (store inyectado o localStorage) ----
class Dispositivos {
  constructor(store = null) {
    this._store = store; // {get:()=>arr, set:(arr)=>void} o localStorage
    this._cache = null;
  }
  _leer() {
    if (this._cache) return this._cache;
    let arr = [];
    try {
      if (this._store && this._store.get) arr = this._store.get() || [];
      else if (this._store && this._store.getItem) arr = JSON.parse(this._store.getItem(CLAVE) || '[]');
    } catch (e) { arr = []; }
    this._cache = Array.isArray(arr) ? arr : [];
    return this._cache;
  }
  _guardar(arr) {
    this._cache = arr;
    try {
      if (this._store && this._store.set) this._store.set(arr);
      else if (this._store && this._store.setItem) this._store.setItem(CLAVE, JSON.stringify(arr));
    } catch (e) { /* best-effort */ }
  }
  agregar(nombre, tipo = 'audífono') {
    const r = agregarDispositivo(this._leer(), nombre, tipo);
    if (r.nuevo) this._guardar(r.dispositivos);
    return r;
  }
  quitar(nombre) {
    const arr = quitarDispositivo(this._leer(), nombre);
    this._guardar(arr);
    return arr;
  }
  usar(nombre) {
    const arr = marcarUso(this._leer(), nombre);
    this._guardar(arr);
    return arr;
  }
  todos() { return listarDispositivos(this._leer()); }
  esConfianza(nombre) { return esDeConfianza(this._leer(), nombre); }
  stats() {
    const arr = this._leer();
    return { total: arr.length, confiables: arr.filter((d) => d.confiable).length };
  }
}

const API = {
  CLAVE, Dispositivos, normalizarNombre, existeDispositivo, agregarDispositivo,
  quitarDispositivo, marcarUso, listarDispositivos, esDeConfianza,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiDispositivos = API;

})();
