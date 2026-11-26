// Diario personal sin internet ni cerebro (idea de memex-lab/memex: diario local-first, tus datos se quedan en el celular).
//   «diario: hoy terminé el informe» · «querido diario, …» · «anota en mi diario …»
//   «mi diario» · «diario de hoy|ayer|esta semana» · «busca en mi diario examen»
//   «un día como hoy» (lo que escribiste en esta fecha otros meses/años) · «borra lo último del diario»
// Se guarda en el celular (localStorage 'asagi-diario'); nada sale del teléfono. Poca RAM: máx. 2000 entradas.
(function () {
'use strict';
var CLAVE = 'asagi-diario', MAX = 2000;
var DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.]+/g, '').replace(/\s+/g, ' ').trim(); }
function hora12(d) { var h = d.getHours() % 12 || 12, m = d.getMinutes(); return h + ':' + (m < 10 ? '0' : '') + m + (d.getHours() < 12 ? ' a. m.' : ' p. m.'); }
function fecha(d) { return DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()]; }
function inicioDia(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

// PURO: entiende la frase o devuelve null. Guarda el texto original (con tildes).
function parsear(t) {
  var o = String(t || '').trim(), n = norm(o), m;
  if ((m = o.match(/^\s*(?:querido diario|diario|apunta en (?:mi |el )?diario|anota en (?:mi |el )?diario|escribe en (?:mi |el )?diario)\s*[:,]\s*([\s\S]{2,600})$/i)) ||
      (m = o.match(/^\s*(?:anota|apunta|escribe) en (?:mi |el )?diario (?:que )?([\s\S]{2,600})$/i))) return { tipo: 'escribir', texto: m[1].trim() };
  if (/^(?:mi diario|ver (?:mi )?diario|abre (?:mi )?diario|que escribi(?: en mi diario)?|lee mi diario)$/.test(n)) return { tipo: 'ver', rango: 'ultimas' };
  if ((m = n.match(/^(?:mi )?diario (?:de )?(hoy|ayer|esta semana|la semana|este mes)$/)) || (m = n.match(/^que escribi (hoy|ayer|esta semana|este mes)(?: en (?:mi )?diario)?$/))) return { tipo: 'ver', rango: m[1] === 'la semana' ? 'esta semana' : m[1] };
  if ((m = n.match(/^busca en (?:mi |el )?diario (.{2,60})$/))) return { tipo: 'buscar', q: m[1] };
  if (/^(?:un dia como hoy|que escribi un dia como hoy|hace un ano(?: hoy)?|recuerdos de hoy)$/.test(n)) return { tipo: 'aniversario' };
  if (/^(?:borra|quita|elimina) (?:lo ultimo|la ultima entrada) (?:del|de mi|de el) diario$/.test(n)) return { tipo: 'borrarUltima' };
  return null;
}

function linea(e) { var d = new Date(e.t); return '• ' + hora12(d) + ' — ' + e.texto; }
// Agrupa por día, lo más nuevo primero.
function porDia(lista) {
  var out = [], dia = null;
  lista.slice().sort(function (a, b) { return b.t - a.t; }).forEach(function (e) {
    var k = inicioDia(e.t);
    if (k !== dia) { dia = k; out.push('📅 ' + fecha(new Date(e.t))); }
    out.push(linea(e));
  });
  return out.join('\n');
}

// PURO: aplica la orden. Devuelve { lista, texto }.
function aplicar(lista, c, ahora) {
  lista = Array.isArray(lista) ? lista.slice() : [];
  ahora = ahora || Date.now();
  var hoy = inicioDia(ahora), DIA = 86400000;
  if (c.tipo === 'escribir') {
    lista.push({ t: ahora, texto: String(c.texto).slice(0, 600) });
    if (lista.length > MAX) lista = lista.slice(-MAX);
    var deHoy = lista.filter(function (e) { return e.t >= hoy; }).length;
    return { lista: lista, texto: '📔 Anotado en tu diario (' + hora12(new Date(ahora)) + '). Hoy llevas ' + deHoy + (deHoy === 1 ? ' entrada' : ' entradas') + '. Di «mi diario» para leerlo.' };
  }
  if (!lista.length) return { lista: lista, texto: '📔 Tu diario está vacío. Escribe por ejemplo: «diario: hoy terminé el informe y salí a correr».' };
  if (c.tipo === 'ver') {
    var desde = 0, nombre = 'Tus últimas entradas';
    if (c.rango === 'hoy') { desde = hoy; nombre = 'Hoy'; }
    else if (c.rango === 'ayer') { desde = hoy - DIA; nombre = 'Ayer'; }
    else if (c.rango === 'esta semana') { desde = hoy - 6 * DIA; nombre = 'Últimos 7 días'; }
    else if (c.rango === 'este mes') { var d = new Date(ahora); desde = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); nombre = 'Este mes'; }
    var hasta = c.rango === 'ayer' ? hoy : Infinity;
    var sel = lista.filter(function (e) { return e.t >= desde && e.t < hasta; });
    if (c.rango === 'ultimas') sel = sel.slice(-10);
    if (!sel.length) return { lista: lista, texto: '📔 No escribiste nada ' + (c.rango === 'hoy' ? 'hoy' : c.rango === 'ayer' ? 'ayer' : 'en ese tiempo') + '. Di «mi diario» para ver lo último.' };
    var extra = sel.length > 30 ? '\n…y ' + (sel.length - 30) + ' más.' : '';
    return { lista: lista, texto: '📔 ' + nombre + ':\n' + porDia(sel.slice(-30)) + extra };
  }
  if (c.tipo === 'buscar') {
    var q = norm(c.q), hall = lista.filter(function (e) { return norm(e.texto).indexOf(q) >= 0; });
    if (!hall.length) return { lista: lista, texto: '📔 No encontré «' + c.q + '» en tu diario.' };
    return { lista: lista, texto: '📔 «' + c.q + '» aparece ' + hall.length + (hall.length === 1 ? ' vez' : ' veces') + ':\n' + porDia(hall.slice(-15)) };
  }
  if (c.tipo === 'aniversario') {
    var a = new Date(ahora), viejas = lista.filter(function (e) { var d = new Date(e.t); return d.getDate() === a.getDate() && e.t < hoy; });
    if (!viejas.length) return { lista: lista, texto: '📔 Aún no hay nada escrito un ' + a.getDate() + ' de otro mes. Sigue escribiendo y aquí aparecerán tus recuerdos.' };
    return { lista: lista, texto: '📔 Un día como hoy escribiste:\n' + porDia(viejas.slice(-10)) };
  }
  if (c.tipo === 'borrarUltima') {
    var ult = lista.pop();
    return { lista: lista, texto: '🗑 Borré tu última entrada: «' + String(ult.texto).slice(0, 80) + '».' };
  }
  return { lista: lista, texto: '' };
}

function leer() { try { var x = JSON.parse(localStorage.getItem(CLAVE) || '[]'); return Array.isArray(x) ? x : []; } catch (e) { return []; } }
function guardar(l) { try { localStorage.setItem(CLAVE, JSON.stringify(l)); } catch (e) {} }
function hacer(c) { var r = aplicar(leer(), c); if (c.tipo === 'escribir' || c.tipo === 'borrarUltima') guardar(r.lista); return r.texto; }
// Para «buscar en mis cosas» / resumen: lo de hoy.
function deHoy() { var h = inicioDia(Date.now()); return leer().filter(function (e) { return e.t >= h; }); }

var API = { parsear: parsear, aplicar: aplicar, hacer: hacer, deHoy: deHoy };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiDiario = API;
})();
