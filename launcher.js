// ASAGI - Launcher (lanzadera): reloj + rejilla de apps buscable. La lista de apps y
// abrirlas vienen del plugin nativo AsagiControl (listApps/openApp). Aqui va la LOGICA
// pura (filtrar, ordenar, reloj, color de tile), testeable sin Android.

'use strict';

const _MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const _DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

function _n(x) { return x < 10 ? '0' + x : '' + x; }

// Reloj: {hora, fecha} desde un Date. Puro.
function reloj(d = new Date()) {
  return {
    hora: _n(d.getHours()) + ':' + _n(d.getMinutes()),
    fecha: _DIAS[d.getDay()] + ', ' + d.getDate() + ' ' + _MESES[d.getMonth()],
  };
}

// Ordena apps por etiqueta (alfabetico, estable). Puro.
function ordenar(apps) {
  return (apps || []).slice().sort((a, b) =>
    (a.label || '').toLowerCase().localeCompare((b.label || '').toLowerCase()));
}

// Filtra apps por texto (en la etiqueta) y ordena. Puro.
function filtrar(apps, q) {
  const t = (q || '').trim().toLowerCase();
  const base = ordenar(apps);
  if (!t) return base;
  return base.filter((a) => (a.label || '').toLowerCase().includes(t));
}

// Color de tile deterministico a partir de la etiqueta. Puro.
function colorTile(label) {
  const paleta = ['#38bdf8', '#2dd4bf', '#a78bfa', '#f0abfc', '#fbbf24', '#f87171', '#34d399', '#60a5fa'];
  let h = 0;
  const s = label || '?';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return paleta[h % paleta.length];
}

// Inicial para el tile. Puro.
function inicial(label) {
  const s = (label || '?').trim();
  return (s[0] || '?').toUpperCase();
}

const API = { reloj, ordenar, filtrar, colorTile, inicial };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiLauncher = API;
