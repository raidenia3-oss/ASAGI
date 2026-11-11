;(function () {
// ASAGI - Niveles de aprendizaje. Mismo principio que la evolución de ARIA (modos.py):
// el nivel sale de DATOS REALES de lo que ASAGI aprendió y resolvió, no de clics.
// Lo que cuesta más (que te sirva de verdad) pesa más que solo charlar.
//   recuerdos     (memoria: cosas que aprendió)          x2
//   temas         (temas distintos que domina)           x4
//   resueltos     (pendientes que se completaron)        x3
//   ordenados     (cosas de la bandeja ya clasificadas)  x1
//   charlas       (mensajes tuyos, con tope)             x0.25 (max 60 pts)
//   herramientas  (WiFi, Bluetooth, Termux… distintas)   x5
//   enlace        (habló con ARIA)                       +15 una vez
'use strict';

var ETAPAS = [
  { min: 0,   nombre: 'SEMILLA',    lema: 'Recién despierta.',              abre: 'Chat, bandeja y recordatorios.' },
  { min: 25,  nombre: 'BROTE',      lema: 'Te va conociendo.',              abre: 'Recuerda tus temas y te los trae.' },
  { min: 70,  nombre: 'APRENDIZ',   lema: 'Ordena tu día sin que se lo pidas.', abre: 'Prioridades proactivas.' },
  { min: 150, nombre: 'COMPAÑERA',  lema: 'Sabe cómo trabajas.',            abre: 'Gestos y respuestas con más carácter.' },
  { min: 300, nombre: 'CONFIDENTE', lema: 'Anticipa lo que vas a necesitar.', abre: 'Sugerencias según tu hora y lugar.' },
  { min: 600, nombre: 'ASAGI PLENA', lema: 'Mente propia, a tu lado.',      abre: 'Todo desbloqueado.' }
];

// Puntaje desde estadisticas reales. PURO.
function puntaje(s) {
  s = s || {};
  return Math.round(
    2 * (s.recuerdos || 0) +
    4 * (s.temas || 0) +
    3 * (s.resueltos || 0) +
    1 * (s.ordenados || 0) +
    Math.min(60, 0.25 * (s.charlas || 0)) +
    5 * (s.herramientas || 0) +
    (s.enlace ? 15 : 0)
  );
}

// Etapa actual, progreso a la siguiente. PURO.
function etapa(p) {
  var idx = 0;
  for (var i = 0; i < ETAPAS.length; i++) if (p >= ETAPAS[i].min) idx = i;
  var e = ETAPAS[idx], sig = ETAPAS[idx + 1] || null;
  var progreso = sig ? Math.max(0, Math.min(1, (p - e.min) / Math.max(1, sig.min - e.min))) : 1;
  return { idx: idx, nivel: idx + 1, nombre: e.nombre, lema: e.lema, abre: e.abre, puntaje: p,
           progreso: Math.round(progreso * 1000) / 1000, falta: sig ? Math.max(0, sig.min - p) : 0,
           siguiente: sig ? sig.nombre : null, max: !sig };
}

function _json(store, k, def) { try { var v = store.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }

// Lee los datos reales del almacenamiento de ASAGI. Nunca lanza.
function recoger(store) {
  store = store || (typeof localStorage !== 'undefined' ? localStorage : null);
  var s = { recuerdos: 0, temas: 0, resueltos: 0, ordenados: 0, charlas: 0, herramientas: 0, enlace: false };
  if (!store) return s;
  var mem = _json(store, 'asagi-memoria-v1', []);
  var nodos = Array.isArray(mem) ? mem : (mem && mem.nodos) || [];
  s.recuerdos = nodos.length;
  var t = {}; nodos.forEach(function (n) { if (n && n.tema) t[n.tema] = 1; }); s.temas = Object.keys(t).length;
  var pend = _json(store, 'asagi-pendientes', []);
  if (Array.isArray(pend)) s.resueltos = pend.filter(function (x) { return x && x.hecho; }).length;
  var ban = _json(store, 'asagi-bandeja', { items: [] });
  if (ban && Array.isArray(ban.items)) s.ordenados = ban.items.filter(function (x) { return x && x.cubo && x.cubo !== 'no-encaja' && x.cubo !== 'sospechoso'; }).length;
  var st = _json(store, 'asagi-state-v2', {});
  if (st && Array.isArray(st.messages)) s.charlas = st.messages.filter(function (m) { return m && m.sender === 'user'; }).length;
  var extra = _json(store, 'asagi-nivel-extra', {});
  s.charlas = Math.max(s.charlas, extra.charlas || 0);            // el chat se puede borrar; el contador no
  s.herramientas = Object.keys(extra.herramientas || {}).length;
  s.enlace = !!extra.enlace || !!store.getItem('asagi-lan-fuente');
  return s;
}

// Registra un uso (herramienta, enlace, charla) para que cuente aunque se borre el chat.
function registrar(tipo, nombre, store) {
  store = store || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return;
  var e = _json(store, 'asagi-nivel-extra', {});
  if (tipo === 'herramienta') { e.herramientas = e.herramientas || {}; e.herramientas[nombre] = 1; }
  if (tipo === 'enlace') e.enlace = true;
  if (tipo === 'charla') e.charlas = (e.charlas || 0) + 1;
  try { store.setItem('asagi-nivel-extra', JSON.stringify(e)); } catch (x) {}
}

function actual(store) { var s = recoger(store); var e = etapa(puntaje(s)); e.stats = s; return e; }

// Texto para el chat. PURO.
function formato(e) {
  var barra = '', n = 12, llenos = Math.round(e.progreso * n);
  for (var i = 0; i < n; i++) barra += i < llenos ? '▰' : '▱';
  var s = e.stats || {};
  return '🌱 Nivel ' + e.nivel + ' · ' + e.nombre + ' — ' + e.lema + '\n' + barra + ' ' + e.puntaje + ' pts' +
    (e.max ? ' (máximo)' : ' · faltan ' + e.falta + ' para ' + e.siguiente) +
    '\nLo que cuenta: ' + s.recuerdos + ' recuerdos, ' + s.temas + ' temas, ' + s.resueltos + ' pendientes hechos, ' +
    s.ordenados + ' cosas ordenadas, ' + s.herramientas + ' herramientas' + (s.enlace ? ', enlace con ARIA' : '') +
    '.\nEn este nivel: ' + e.abre;
}

var API = { ETAPAS: ETAPAS, puntaje: puntaje, etapa: etapa, recoger: recoger, registrar: registrar, actual: actual, formato: formato };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiNiveles = API;
})();
