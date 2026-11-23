// Lo que se vence en casa, sin internet ni cerebro (idea de Grocy: «best before» de la comida y lo de casa).
//   «la leche vence el viernes» · «el yogur vence mañana» · «el arroz vence el 15/12» · «el jamón vence en 3 días»
//   «mis pastillas vencen el 10 de diciembre» · «qué se vence» / «qué vence pronto» / «mis vencimientos»
//   «ya usé la leche» · «ya me comí el yogur» · «boté el jamón» · «quita la leche de vencimientos»
// Se guarda en el celular (localStorage 'asagi-vencimientos'); nada sale del teléfono. El «Mi día» avisa lo que vence en ≤ 2 días.
(function () {
'use strict';
var CLAVE = 'asagi-vencimientos';
var DIA = 864e5;
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,]+/g, '').replace(/\s+/g, ' ').trim(); }
function sinArticulo(s) { return String(s || '').replace(/^(?:mis|mi|tus|el|la|los|las|un|una|unos|unas)\s+/i, '').trim(); }
// El texto original con tildes para la parte que coincide en el normalizado (mismo largo salvo signos).
function orig(t, parteNorm) {
  var o = String(t || '').replace(/[¿?¡!.,]+/g, '').replace(/\s+/g, ' ').trim(), n = norm(o), i = n.indexOf(parteNorm);
  return i >= 0 && n.length === o.length ? o.substr(i, parteNorm.length) : parteNorm;
}
function inicioDia(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
var DSEM = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

// PURO: «mañana», «el viernes», «el 15», «el 15/12», «15 de diciembre», «en 3 días», «en 2 semanas» -> Date (inicio del día) o null.
function fecha(s, ahora) {
  var n = norm(s).replace(/^(?:el|este|para el)\s+/, ''), hoy = inicioDia(ahora || new Date()), d = new Date(hoy), m;
  if (n === 'hoy') return d;
  if (n === 'manana') { d.setDate(d.getDate() + 1); return d; }
  if (n === 'pasado manana') { d.setDate(d.getDate() + 2); return d; }
  if ((m = n.match(/^en (\d{1,3}|un|una|dos|tres) (dias?|semanas?|mes(?:es)?)$/))) {
    var k = { un: 1, una: 1, dos: 2, tres: 3 }[m[1]] || parseInt(m[1], 10);
    if (/^d/.test(m[2])) d.setDate(d.getDate() + k); else if (/^s/.test(m[2])) d.setDate(d.getDate() + 7 * k); else d.setMonth(d.getMonth() + k);
    return d;
  }
  if ((m = n.match(/^(domingo|lunes|martes|miercoles|jueves|viernes|sabado)$/))) { d.setDate(d.getDate() + (DSEM.indexOf(m[1]) - d.getDay() + 7) % 7); return d; }
  var dia = null, mes = null, anio = null;
  if ((m = n.match(/^(\d{1,2})\s*[\/-]\s*(\d{1,2})(?:\s*[\/-]\s*(\d{2,4}))?$/))) { dia = +m[1]; mes = +m[2] - 1; if (m[3]) anio = m[3].length === 2 ? 2000 + +m[3] : +m[3]; }
  else if ((m = n.match(/^(\d{1,2}) (?:de )?(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*(?: (?:de |del )?(\d{4}))?$/))) { dia = +m[1]; mes = MESES.indexOf(m[2] === 'set' ? 'sep' : m[2]); if (m[3]) anio = +m[3]; }
  else if ((m = n.match(/^(\d{1,2})$/))) { dia = +m[1]; mes = d.getMonth(); if (dia < d.getDate()) mes++; }
  if (dia == null || dia < 1 || dia > 31 || mes < 0 || mes > 12) return null;
  var r = new Date(anio || d.getFullYear(), mes, dia);
  if (r.getDate() !== dia && mes < 12) return null;              // 31/02 y parecidos
  if (!anio && r < hoy - 30 * DIA) r.setFullYear(r.getFullYear() + 1);  // «el 5/1» en diciembre = el año que viene
  return r;
}

var VER = /^(?:que (?:se )?(?:me )?vence(?:n)?(?: pronto| esta semana| hoy)?|que esta por vencer(?:se)?|que se va a vencer|mis vencimientos|vencimientos|que tengo por vencer|que caduca)$/;

// PURO: entiende la frase o devuelve null. Necesita «ahora» para las fechas.
function parsear(t, ahora) {
  var n = norm(t), m;
  if (VER.test(n)) return { tipo: 'ver' };
  if ((m = n.match(/^(?:anota que )?(.{2,60}?) (?:se )?(?:vence|vencen|caduca|caducan|expira|expiran) (?:el |este |para el )?(.{1,30})$/))) {
    if (/^(?:que|cuando|si|no)\b|^(?:recuerd|avisa|dime)/.test(m[1])) return null;   // eso es de pendientes o una pregunta
    var f = fecha(m[2], ahora);
    if (!f) return null;
    return { tipo: 'agregar', cosa: sinArticulo(orig(t, m[1])), cuando: f.getTime() };
  }
  if ((m = n.match(/^ya (?:use|me comi|me tome|bote|tire|termine|se acabo|se acabaron) (?:el |la |los |las |mis |mi )?(.{2,60})$/))) return { tipo: 'usado', cosa: sinArticulo(orig(t, m[1])) };
  if ((m = n.match(/^(?:quita|saca|borra|elimina) (.{2,60}?) de (?:los |mis )?vencimientos$/))) return { tipo: 'usado', cosa: sinArticulo(orig(t, m[1])) };
  return null;
}

function cuanto(cuando, ahora) {
  var dias = Math.round((inicioDia(cuando) - inicioDia(ahora)) / DIA);
  if (dias < -1) return 'venció hace ' + (-dias) + ' días';
  if (dias === -1) return 'venció ayer';
  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  if (dias < 7) return 'vence el ' + ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][new Date(cuando).getDay()] + ' (en ' + dias + ' días)';
  var d = new Date(cuando); return 'vence el ' + d.getDate() + ' ' + MESES[d.getMonth()] + ' (en ' + dias + ' días)';
}
function icono(cuando, ahora) { var dias = Math.round((inicioDia(cuando) - inicioDia(ahora)) / DIA); return dias < 0 ? '⛔' : dias <= 2 ? '⚠' : '•'; }

// PURO: aplica la orden y devuelve { lista, texto }.
function aplicar(lista, c, ahora) {
  ahora = ahora || new Date();
  lista = (Array.isArray(lista) ? lista : []).slice();
  var busca = function (x) { var k = norm(x); return lista.findIndex(function (it) { var j = norm(it.cosa); return j === k || (k.length >= 3 && j.length >= 3 && (j.indexOf(k) >= 0 || k.indexOf(j) >= 0)); }); };
  if (c.tipo === 'agregar') {
    var i = lista.findIndex(function (it) { return norm(it.cosa) === norm(c.cosa); });
    if (i >= 0) lista.splice(i, 1);
    lista.push({ cosa: c.cosa, cuando: c.cuando });
    if (lista.length > 80) lista = lista.slice(-80);
    return { lista: lista, texto: '🥛 Anotado: ' + c.cosa + ' ' + cuanto(c.cuando, ahora) + '.' + (pronto([c], ahora, 2).length ? ' ¡Úsalo pronto!' : ' Te aviso en «mi día» cuando falten 2 días.') };
  }
  if (c.tipo === 'usado') {
    var j = busca(c.cosa);
    if (j < 0) return { lista: lista, texto: 'No tenía anotado «' + c.cosa + '» en lo que se vence. Di «qué se vence» para ver la lista.' };
    var q = lista.splice(j, 1)[0];
    return { lista: lista, texto: '✅ Listo, saqué ' + q.cosa + ' de lo que se vence.' + (lista.length ? ' Quedan ' + lista.length + '.' : '') };
  }
  if (!lista.length) return { lista: lista, texto: '🥛 No tengo nada anotado que se venza. Di por ejemplo «la leche vence el viernes».' };
  var ord = lista.slice().sort(function (a, b) { return a.cuando - b.cuando; });
  return { lista: lista, texto: '🥛 Lo que se vence (' + ord.length + '):\n' + ord.map(function (it) { return icono(it.cuando, ahora) + ' ' + it.cosa + ': ' + cuanto(it.cuando, ahora); }).join('\n') +
    '\nCuando lo uses, di «ya usé …».' };
}

// PURO: lo que vence en ≤ dias (incluye lo ya vencido), ordenado.
function pronto(lista, ahora, dias) {
  var lim = inicioDia(ahora || new Date()).getTime() + ((dias == null ? 2 : dias) + 1) * DIA;
  return (Array.isArray(lista) ? lista : []).filter(function (it) { return it && it.cuando < lim; }).sort(function (a, b) { return a.cuando - b.cuando; });
}
// Una línea para «Mi día» (o '' si no hay nada urgente).
function lineaDia(lista, ahora) {
  var p = pronto(lista, ahora, 2); if (!p.length) return '';
  return '🥛 Ojo: ' + p.slice(0, 4).map(function (it) { return it.cosa + ' ' + cuanto(it.cuando, ahora).replace(/ \(en \d+ días\)/, ''); }).join(' · ') + '.';
}

function leer() { try { var l = JSON.parse(localStorage.getItem(CLAVE) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function guardar(l) { try { localStorage.setItem(CLAVE, JSON.stringify(l)); } catch (e) {} }
// ¿Hay algo anotado con ese nombre? (para no robarle a otras funciones frases como «ya terminé la tarea»)
function tiene(cosa) { var k = norm(cosa); return leer().some(function (it) { var j = norm(it.cosa); return j === k || (k.length >= 3 && j.length >= 3 && (j.indexOf(k) >= 0 || k.indexOf(j) >= 0)); }); }
function hacer(c) { var r = aplicar(leer(), c, new Date()); if (c.tipo !== 'ver') guardar(r.lista); return r.texto; }

var API = { parsear: parsear, aplicar: aplicar, fecha: fecha, pronto: pronto, lineaDia: lineaDia, hacer: hacer, leer: leer, tiene: tiene };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiVencimientos = API;
})();
