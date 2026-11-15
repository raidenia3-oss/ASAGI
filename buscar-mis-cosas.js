// «Busca en mis cosas» (idea de Khoj: un asistente que busca en TUS datos, no en internet).
//   «busca en mis cosas internet» · «dónde anoté lo del examen» · «qué dije de la UNI» · «tengo algo sobre Juan?»
// Busca a la vez en: lo que ASAGI sabe de ti, pendientes (también los ya hechos), compras, bandeja y tus mensajes.
// Todo local, sin internet. El cerebro también puede usarla como herramienta.
(function () {
'use strict';
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;:«»"]+/g, ' ').replace(/\s+/g, ' ').trim(); }
var VACIAS = { de: 1, del: 1, la: 1, el: 1, los: 1, las: 1, lo: 1, un: 1, una: 1, que: 1, en: 1, mi: 1, mis: 1, y: 1, a: 1, al: 1, con: 1, por: 1, para: 1, sobre: 1, algo: 1 };
function palabras(t) { return norm(t).split(' ').filter(function (w) { return w.length > 2 && !VACIAS[w]; }).map(function (w) { return w.replace(/(?:es|s)$/, ''); }); }

// PURO
function parsear(t) {
  var n = norm(t), m;
  if ((m = n.match(/^(?:busca|buscar|encuentra) (?:en )?(?:mis cosas|mis notas|lo mio|mis datos|todo lo mio)(?: (?:sobre|de|por))? (.{2,60})$/))) return { q: m[1] };
  if ((m = n.match(/^donde (?:anote|apunte|guarde|puse) (?:lo (?:de|del|que) |algo (?:de|sobre) |la |el )?(.{2,60})$/))) return { q: m[1] };
  if ((m = n.match(/^que (?:dije|te dije|anote|guarde|tengo anotado) (?:de|del|sobre|acerca de) (.{2,60})$/))) return { q: m[1] };
  if ((m = n.match(/^tengo (?:algo|anotado algo|notas?) (?:sobre|de|del) (.{2,60})$/))) return { q: m[1] };
  return null;
}

// fuentes: [{tipo, texto, cuando?}] -> los que más se parecen. PURO.
function buscar(fuentes, q, k) {
  var qs = palabras(q); if (!qs.length) return [];
  var res = [];
  (fuentes || []).forEach(function (f) {
    if (!f || !f.texto) return;
    var ws = palabras(f.texto), s = 0;
    qs.forEach(function (x) { if (ws.some(function (y) { return y === x || (x.length >= 4 && (y.indexOf(x) === 0 || x.indexOf(y) === 0)); })) s += 1; });
    if (norm(f.texto).indexOf(norm(q)) >= 0) s += 1;
    if (s) res.push({ f: f, s: s / qs.length + (f.cuando || 0) / 1e15 });
  });
  // sin repetidos (el mismo texto en memoria y en el chat): gana la fuente que no es el chat
  var vistos = {}, PRIO = { pendiente: 0, hecho: 0, compras: 0, bandeja: 1, memoria: 2, chat: 3 };
  res.sort(function (a, b) { return b.s - a.s || (PRIO[a.f.tipo] - PRIO[b.f.tipo]); });
  return res.filter(function (r) {
    var k2 = norm(r.f.texto).replace(/^(?:recuerdame|anota|apunta)\s+/, '').replace(/\s+—.*$/, '');
    if (vistos[k2]) return false; vistos[k2] = 1; return true;
  }).slice(0, k || 6).map(function (r) { return r.f; });
}

var ICONO = { memoria: '🧠', pendiente: '📌', hecho: '✅', compras: '🛒', bandeja: '📥', chat: '💬' };
function formato(q, encontrados) {
  if (!encontrados.length) return '🔎 No encontré nada tuyo sobre «' + q + '». (Busco en lo que me contaste, pendientes, compras, bandeja y el chat.)';
  return '🔎 En tus cosas, sobre «' + q + '»:\n' + encontrados.map(function (f) {
    var t = String(f.texto).replace(/\s+/g, ' '); if (t.length > 140) t = t.slice(0, 139) + '…';
    return (ICONO[f.tipo] || '•') + ' ' + t + (f.fecha ? ' (' + f.fecha + ')' : '');
  }).join('\n');
}

// Junta las fuentes reales del celular.
function fuentes(mensajes) {
  var out = [], ls = typeof localStorage !== 'undefined' ? localStorage : null;
  var fecha = function (ms) { try { return new Date(ms).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }); } catch (e) { return ''; } };
  try {
    var me = window._asagiMem || (window.AsagiMemoria && (window._asagiMem = new window.AsagiMemoria.Memoria(ls)));
    if (me) me.todos().forEach(function (n) { if (n && !/^personaje|^chat$|^asagi$/.test(n.tema || '')) out.push({ tipo: 'memoria', texto: n.texto, cuando: (n.ts || 0) * 1000 }); });
  } catch (e) {}
  try { (JSON.parse(ls.getItem('asagi-pendientes') || '[]') || []).forEach(function (p) { if (p && p.texto) out.push({ tipo: p.hecho ? 'hecho' : 'pendiente', texto: p.texto + (p.etiqueta ? ' — ' + p.etiqueta : ''), cuando: p.creado || p.cuando || 0 }); }); } catch (e) {}
  try { (JSON.parse(ls.getItem('asagi-compras') || '[]') || []).forEach(function (c) { if (c && c.texto) out.push({ tipo: 'compras', texto: c.texto + (c.hecho ? ' (comprado)' : '') }); }); } catch (e) {}
  try { var b = JSON.parse(ls.getItem('asagi-bandeja') || '{}'); (b.items || []).forEach(function (i) { if (i && (i.texto || i.t)) out.push({ tipo: 'bandeja', texto: i.texto || i.t, cuando: i.ts || 0, fecha: i.ts ? fecha(i.ts) : '' }); }); } catch (e) {}
  // del chat solo lo que Daniel CONTÓ (no las órdenes, que ya están en pendientes/compras)
  var ORDEN = /^(?:recuerdame|agrega|anota|apunta|pon|ponme|busca|abre|traduce|convierte|calcula|cuanto|que|como|cuando|donde|quien|hazlo|investiga|manos|tira|lanza|elige|olvida)\b/;
  (mensajes || []).forEach(function (m) { if (m && m.sender === 'user' && m.text && m.text.length > 8 && !parsear(m.text) && !ORDEN.test(norm(m.text))) out.push({ tipo: 'chat', texto: m.text, fecha: m.time || '' }); });
  return out;
}

var API = { parsear: parsear, buscar: buscar, formato: formato, fuentes: fuentes };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiBuscarMio = API;
})();
