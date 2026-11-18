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

// Letra del índice A–Z (números y símbolos van a «#»; tildes se quitan). Puro.
function letra(label) {
  const c = String(label || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : c === 'Ñ' ? 'N' : '#';
}
// Letras presentes, en orden. Puro.
function letras(apps) { const v = {}; (apps || []).forEach((a) => { v[letra(a.label)] = 1; }); return Object.keys(v).sort((a, b) => (a === '#') - (b === '#') || a.localeCompare(b)); }
// Quita las apps ocultas (lista de paquetes). Puro.
function visibles(apps, ocultas) { const o = new Set(ocultas || []); return (apps || []).filter((a) => !o.has(a.package)); }
// Favoritas: primero las fijadas (en su orden), luego las más usadas, sin repetir. Puro.
function favoritas(apps, counts, fijadas, n = 5) {
  const por = {}; (apps || []).forEach((a) => { por[a.package] = a; });
  const out = (fijadas || []).map((p) => por[p]).filter(Boolean);
  for (const a of masUsadas(apps, counts, n + out.length)) if (out.length < n && out.indexOf(a) < 0) out.push(a);
  return out.slice(0, n);
}

// Frase corta bajo la barra de batería, según la hora y la carga. PURO.
function frase(d, pct, cargando) {
  const h = d.getHours();
  if (cargando) return pct >= 100 ? 'Carga completa' : 'Cargando, sin apuro';
  if (pct <= 20) return 'Busca un cargador';
  if (h >= 23 || h < 5) return 'Hora de descansar';
  if (h < 12) return 'Buen día, Daniel';
  if (h < 19) return 'Sigue así, Daniel';
  return 'Buenas noches, Daniel';
}
// Órdenes para la PC (las hace ARIA por el enlace): «abre spotify en la pc» · «qué tengo abierto en la pc» · «trae chrome en la pc». PURO.
function ordenPc(t) {
  const s = String(t || '').trim().replace(/[.!?¿¡]+$/g, '').replace(/^[¿¡]+/, '');
  const n = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^(?:que tengo abierto|que ventanas (?:tengo|hay)(?: abiertas)?|ventanas)(?: en (?:la|mi) (?:pc|compu(?:tadora)?|laptop))$/.test(n)) return { accion: 'ventanas' };
  let m = n.match(/^(?:abre|abreme|lanza|inicia)\s+(.{2,40}?)\s+en (?:la|mi) (?:pc|compu(?:tadora)?|laptop)$/);
  if (m && !/https?|www\.|\.com/.test(m[1])) return { accion: 'abrir', q: m[1].trim() };
  m = n.match(/^(?:trae|ve a|pon al frente)\s+(.{2,40}?)\s+en (?:la|mi) (?:pc|compu(?:tadora)?|laptop)$/);
  if (m) return { accion: 'enfocar', q: m[1].trim() };
  return null;
}
const API = { ordenPc, frase, reloj, hora12, ordenar, filtrar, colorTile, inicial, masUsadas, letra, letras, visibles, favoritas };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiLauncher = API;

})();
