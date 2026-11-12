;(function () {
// ASAGI - Vistas: buscar en tu bandeja y tu memoria con filtros, y guardar esas búsquedas.
// Idea tomada de la pantalla "Discovery" de tryatria.com (búsqueda con IA + filtros + vistas
// guardadas + "Trending"):
//
//   busca: factura cubo:urgente ultimos 7 dias pendientes     -> resultados con filtros
//   guarda vista pagos: factura pago cubo:urgente            -> la guarda con nombre
//   vista pagos   ·   vistas   ·   borra vista pagos
//   tendencias                                               -> de qué hablas más esta semana
// Filtros: cubo:<urgente|proyectos|gente|lectura|no-encaja>  de:<yo|discord|...>
//          ultimos N dias · hoy · pendientes · hechos · memoria (incluye lo que ASAGI recuerda)
// Todo es PURO; la persistencia (localStorage 'asagi-vistas') la hace app.js.
'use strict';

var VACIAS = { de: 1, la: 1, el: 1, los: 1, las: 1, que: 1, con: 1, por: 1, para: 1, una: 1, uno: 1, del: 1, mis: 1, sus: 1, hay: 1, muy: 1, mas: 1, pero: 1, esta: 1, este: 1, eso: 1, como: 1, cuando: 1, sobre: 1, todo: 1, nada: 1 };

function _n(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
function palabras(t) { return (_n(t).match(/[a-z0-9ñ]{3,}/g) || []).filter(function (w) { return !VACIAS[w]; }); }

// "factura cubo:urgente ultimos 7 dias pendientes" -> { q, cubo, origen, dias, estado, memoria }. PURO.
function parsearFiltros(texto) {
  var t = ' ' + _n(texto) + ' ', f = { q: '', cubo: null, origen: null, dias: null, estado: null, memoria: false }, m;
  if ((m = t.match(/\scubo:([a-z-]+)\s/))) { f.cubo = m[1]; t = t.replace(m[0], ' '); }
  if ((m = t.match(/\sde:([a-z0-9:_-]+)\s/))) { f.origen = m[1]; t = t.replace(m[0], ' '); }
  if ((m = t.match(/\s(?:ultim[oa]s?|en (?:los )?ultimos)\s+(\d+)\s+dias?\s/))) { f.dias = +m[1]; t = t.replace(m[0], ' '); }
  if ((m = t.match(/\s(?:solo|de) hoy\s/))) { f.dias = 1; t = t.replace(m[0], ' '); }
  if ((m = t.match(/\s(pendientes|sin hacer)\s/))) { f.estado = 'pendiente'; t = t.replace(m[0], ' '); }
  if ((m = t.match(/\s(hechos|hechas|resueltos)\s/))) { f.estado = 'hecho'; t = t.replace(m[0], ' '); }
  if ((m = t.match(/\s(?:y |con |en )?(?:la )?memoria\s/))) { f.memoria = true; t = t.replace(m[0], ' '); }
  f.q = t.replace(/\s+/g, ' ').trim();
  return f;
}

// Puntaje de un texto contra la consulta (palabras + prefijos, sin tildes). PURO.
function puntaje(texto, q) {
  var ps = palabras(q); if (!ps.length) return 1;
  var tw = palabras(texto), s = 0;
  ps.forEach(function (p) {
    if (tw.indexOf(p) >= 0) s += 3;
    else if (tw.some(function (w) { return w.indexOf(p) === 0 || p.indexOf(w) === 0; })) s += 2;
    else if (_n(texto).indexOf(p) >= 0) s += 1;
  });
  return s;
}

// items: bandeja [{texto,cubo,origen,cuando,hecho}] ; memoria: [{texto,tema,cuando?}] -> resultados ordenados. PURO.
function filtrar(items, f, ahora, memoria) {
  var t0 = ahora || Date.now();
  var lista = (items || []).map(function (it) { return { texto: it.texto, cubo: it.cubo, origen: it.origen, cuando: it.cuando, hecho: !!it.hecho, de: 'bandeja' }; });
  if (f.memoria && memoria) lista = lista.concat(memoria.map(function (n) { return { texto: n.texto, cubo: 'memoria', origen: n.tema || 'memoria', cuando: (n.ts || n.cuando || 0) * (n.ts && n.ts < 1e12 ? 1000 : 1), hecho: false, de: 'memoria' }; }));
  return lista.filter(function (it) {
    if (f.cubo && it.cubo !== f.cubo) return false;
    if (f.origen && _n(it.origen).indexOf(f.origen) !== 0) return false;
    if (f.dias && it.cuando && t0 - it.cuando > f.dias * 86400000) return false;
    if (f.estado === 'pendiente' && it.hecho) return false;
    if (f.estado === 'hecho' && !it.hecho) return false;
    return true;
  }).map(function (it) { return { it: it, p: puntaje(it.texto, f.q) }; })
    .filter(function (x) { return x.p > 0; })
    .sort(function (a, b) { return b.p - a.p || (b.it.cuando || 0) - (a.it.cuando || 0); })
    .map(function (x) { return x.it; });
}

// "Trending": palabras que más se repiten en los últimos N días. PURO.
function tendencias(items, ahora, dias, n) {
  var t0 = ahora || Date.now(), c = {};
  (items || []).forEach(function (it) {
    if (it.cuando && t0 - it.cuando > (dias || 7) * 86400000) return;
    var vistas = {};
    palabras(it.texto).forEach(function (w) { if (w.length > 3 && !vistas[w]) { vistas[w] = 1; c[w] = (c[w] || 0) + 1; } });
  });
  return Object.keys(c).filter(function (w) { return c[w] > 1; }).sort(function (a, b) { return c[b] - c[a]; }).slice(0, n || 8)
    .map(function (w) { return { palabra: w, veces: c[w] }; });
}

// Órdenes del chat. PURO.
function parsear(texto) {
  var t = String(texto || '').trim(), n = _n(t), m;
  if ((m = t.match(/^\s*(?:buscar|busca|encuentra)\b\s*(?:en\s+(?:la\s+)?(?:bandeja|memoria)\s*)?[:,]?\s*(.+)$/i)) && !/^(?:wifi|bluetooth|redes)/i.test(m[1])) {
    var f = parsearFiltros(m[1]); if (/memoria/i.test(t.split(/[:,]/)[0])) f.memoria = true;
    var explicito = /^\s*(?:buscar|busca|encuentra)\s*(?:en\s+(?:la\s+)?(?:bandeja|memoria))?\s*:/i.test(t) || /\ben\s+(?:la\s+)?(?:bandeja|memoria)\b/i.test(t.slice(0, 40));
    if (!explicito && !f.cubo && !f.origen && !f.estado) return null;      // "busca precio de X" sigue yendo al cerebro / web
    return { tipo: 'buscar', filtros: f, consulta: m[1].trim() };
  }
  if ((m = t.match(/^\s*guarda(?:r)?\s+(?:la\s+)?vista\s+([\wñáéíóú-]{2,24})\s*[:,]\s*(.+)$/i))) return { tipo: 'guardar', nombre: _n(m[1]), consulta: m[2].trim() };
  if ((m = n.match(/^borra(?:r)?\s+(?:la\s+)?vista\s+([\w-]{2,24})$/))) return { tipo: 'borrar', nombre: m[1] };
  if (/^(?:vistas|mis vistas)$/.test(n)) return { tipo: 'listar' };
  if ((m = n.match(/^vista\s+([\w-]{2,24})$/))) return { tipo: 'ver', nombre: m[1] };
  if (/^(?:tendencias|trending|de que hablo mas|lo mas repetido)(?: esta semana)?\??$/.test(n)) return { tipo: 'tendencias' };
  return null;
}

function _fecha(ms) {
  if (!ms) return '';
  var d = new Date(ms); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
}
function describirFiltros(f) {
  var p = [];
  if (f.cubo) p.push('cubo ' + f.cubo); if (f.origen) p.push('de ' + f.origen); if (f.dias) p.push('últimos ' + f.dias + ' días');
  if (f.estado) p.push(f.estado === 'hecho' ? 'hechos' : 'pendientes'); if (f.memoria) p.push('+ memoria');
  return p.length ? ' [' + p.join(' · ') + ']' : '';
}
function formatoResultados(res, f, titulo) {
  var cab = (titulo ? '🔎 Vista «' + titulo + '»' : '🔎 «' + (f.q || 'todo') + '»') + describirFiltros(f);
  if (!res.length) return cab + ': nada.';
  return cab + ' — ' + res.length + ':\n' + res.slice(0, 12).map(function (it, i) {
    return (i + 1) + '. ' + it.texto.slice(0, 90) + '  · ' + it.cubo + (it.cuando ? ' ' + _fecha(it.cuando) : '') + (it.hecho ? ' ✓' : '');
  }).join('\n') + (res.length > 12 ? '\n… y ' + (res.length - 12) + ' más' : '');
}
function formatoTendencias(t) {
  return t.length ? '📈 De lo que más hablas esta semana: ' + t.map(function (x) { return x.palabra + ' (' + x.veces + ')'; }).join(' · ')
    : '📈 Aún no hay temas que se repitan esta semana.';
}

var API = { parsearFiltros: parsearFiltros, puntaje: puntaje, filtrar: filtrar, tendencias: tendencias, parsear: parsear,
            formatoResultados: formatoResultados, formatoTendencias: formatoTendencias, describirFiltros: describirFiltros };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiVistas = API;
})();
