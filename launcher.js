;(function () {
// ASAGI - Launcher (lanzadera): reloj + rejilla de apps buscable. La lista de apps y
// abrirlas vienen del plugin nativo AsagiControl (listApps/openApp). Aqui va la LOGICA
// pura (filtrar, ordenar, reloj, color de tile), testeable sin Android.

'use strict';

const _MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const _DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

function _n(x) { return x < 10 ? '0' + x : '' + x; }

// Reloj: {hora, fecha} desde un Date. Puro.
// Hora en formato de 12 horas (como el reloj del celular en Perú): "10:49" + "p. m.". Puro.
function hora12(d = new Date()) {
  const h = d.getHours() % 12 || 12;
  return { hora: h + ':' + _n(d.getMinutes()), ampm: d.getHours() < 12 ? 'a. m.' : 'p. m.' };
}
function reloj(d = new Date()) {
  const h = hora12(d);
  return {
    hora: h.hora, ampm: h.ampm,
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
  const paleta = ['#ed3758', '#dd153d', '#f4dfe7', '#f2e9f1', '#ffd700', '#ff5c76', '#ffd700', '#fb5470'];
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

// Apps mas usadas segun un conteo {package: veces}. Puro.
// Devuelve hasta n apps con conteo > 0, de mayor a menor uso.
function masUsadas(apps, counts, n = 8) {
  const c = counts || {};
  return (apps || [])
    .filter((a) => (c[a.package] || 0) > 0)
    .sort((x, y) => (c[y.package] || 0) - (c[x.package] || 0))
    .slice(0, n);
}

const API = { reloj, hora12, ordenar, filtrar, colorTile, inicial, masUsadas };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiLauncher = API;

})();
