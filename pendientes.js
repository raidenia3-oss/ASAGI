;(function () {
// ASAGI - Pendientes: recordatorios/tareas locales (idea del artifact: OpenProject/
// AppFlowy como alternativa libre a Asana/Notion, pero aqui minimo y 100% local).
// Pensado para el bucle de voz: le dices "recuerdame comprar pan" y queda anotado.
//
// Logica PURA y testeable (crear, parsear, ordenar, alternar, serializar). La
// persistencia (localStorage) y la UI las hace app.js.

'use strict';

var PREFIJOS = [
  'recuerdame', 'recuerda que', 'recuerda', 'anota que', 'anota', 'apunta que',
  'apunta', 'pendiente:', 'pendiente', 'nota:', 'nota', 'tarea:', 'tarea',
  'tengo que', 'no olvides', 'acuerdate de', 'acuerdate'
];

function _norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Si 'n' (normalizado) empieza con el prefijo p respetando frontera de palabra,
// devuelve el índice donde termina el prefijo (para cortar el original); si no, -1.
function _finPrefijo(n, p) {
  if (n.indexOf(p) !== 0) return -1;
  if (n.length === p.length) return p.length;        // prefijo solo, sin resto
  var sig = n.charAt(p.length);
  if (p.charAt(p.length - 1) === ':' || sig === ' ' || sig === ':' || sig === ',') return p.length;
  return -1;                                          // "recuerda" dentro de "recuerdame" -> no
}

// Quita un prefijo de intencion ("recuerdame ...", "anota ...") si lo hay. PURO.
function parsearEntrada(texto) {
  var t = String(texto || '').trim();
  if (!t) return '';
  var n = _norm(t);
  for (var i = 0; i < PREFIJOS.length; i++) {
    var fin = _finPrefijo(n, PREFIJOS[i]);
    if (fin >= 0) {
      var resto = t.slice(fin).replace(/^[\s:,]+/, '');
      if (resto.trim()) return resto.trim();
    }
  }
  return t;
}

// ¿El texto empieza con una intención de recordatorio? PURO.
function esPendiente(texto) {
  var n = _norm(String(texto || '').trim());
  if (!n) return false;
  for (var i = 0; i < PREFIJOS.length; i++) {
    var fin = _finPrefijo(n, PREFIJOS[i]);
    if (fin >= 0 && n.slice(fin).replace(/^[\s:,]+/, '')) return true;
  }
  return false;
}

var _seq = 0;
function _id() {
  _seq += 1;
  return 'p' + Date.now().toString(36) + _seq.toString(36);
}

// Crea un pendiente a partir de texto (ya parseado o no). PURO (salvo id/fecha).
function nuevo(texto, ahora) {
  var limpio = parsearEntrada(texto);
  if (!limpio) return null;
  return { id: _id(), texto: limpio, hecho: false, creado: ahora || Date.now() };
}

// Devuelve una lista NUEVA con el item agregado al frente. PURO.
function agregar(lista, texto, ahora) {
  var it = nuevo(texto, ahora);
  if (!it) return (lista || []).slice();
  return [it].concat(lista || []);
}

function alternar(lista, id) {
  return (lista || []).map(function (x) {
    return x.id === id ? { id: x.id, texto: x.texto, hecho: !x.hecho, creado: x.creado } : x;
  });
}

function borrar(lista, id) {
  return (lista || []).filter(function (x) { return x.id !== id; });
}

function limpiarHechos(lista) {
  return (lista || []).filter(function (x) { return !x.hecho; });
}

// Pendientes primero (mas nuevos arriba), luego los hechos. PURO (no muta).
function ordenar(lista) {
  return (lista || []).slice().sort(function (a, b) {
    if (!!a.hecho !== !!b.hecho) return a.hecho ? 1 : -1;
    return (b.creado || 0) - (a.creado || 0);
  });
}

function contarPendientes(lista) {
  return (lista || []).filter(function (x) { return !x.hecho; }).length;
}

// Serializa/valida para guardar o cargar de storage. PURO.
function serializar(lista) {
  try { return JSON.stringify(ordenar(lista)); } catch (e) { return '[]'; }
}
function deserializar(txt) {
  var arr;
  try { arr = JSON.parse(txt || '[]'); } catch (e) { return []; }
  if (!Array.isArray(arr)) return [];
  return arr.filter(function (x) {
    return x && typeof x.id === 'string' && typeof x.texto === 'string';
  }).map(function (x) {
    return { id: x.id, texto: x.texto, hecho: !!x.hecho, creado: Number(x.creado) || Date.now() };
  });
}

var API = {
  PREFIJOS: PREFIJOS, parsearEntrada: parsearEntrada, esPendiente: esPendiente, nuevo: nuevo, agregar: agregar,
  alternar: alternar, borrar: borrar, limpiarHechos: limpiarHechos, ordenar: ordenar,
  contarPendientes: contarPendientes, serializar: serializar, deserializar: deserializar
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiPendientes = API;

})();
