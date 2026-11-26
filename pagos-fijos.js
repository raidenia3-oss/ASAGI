// Pagos fijos del mes (idea de Wallos, ellite/Wallos: seguir suscripciones y cobros que se repiten).
//   «pago fijo Netflix 35 soles el 5» · «pago fijo internet 89 el día 10» · «pago fijo Spotify 5.99 dólares el 20»
//   «mis pagos fijos» / «cuánto pago al mes» · «próximos cobros» · «borra el pago fijo Netflix»
// Solo anota y avisa: no paga nada. Se guarda en el celular (localStorage 'asagi-pagos-fijos'); nada sale del teléfono.
(function () {
'use strict';
var CLAVE = 'asagi-pagos-fijos';
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!]+/g, '').replace(/\s+/g, ' ').trim(); }
var PAGO = '(?:pagos?|cobros?|suscripcion(?:es)?) (?:fijos?|mensual(?:es)?|de cada mes)';

// PURO: entiende la frase o devuelve null.
function parsear(t) {
  var n = norm(t).replace(/\.$/, ''), m;
  if (new RegExp('^(?:mis |ver (?:mis )?|que |cuales son mis )?' + PAGO + '(?: tengo)?$').test(n) || /^cuanto (?:pago|gasto) (?:al|cada|por) mes(?: en (?:pagos fijos|suscripciones))?$/.test(n)) return { tipo: 'ver' };
  if (/^(?:proximos cobros|que (?:me )?(?:cobran|se cobra|se paga|toca pagar) (?:esta semana|pronto|estos dias)|que pagos vienen)$/.test(n)) return { tipo: 'pronto' };
  if ((m = n.match(new RegExp('^(?:borra|quita|elimina|cancela|cancele|ya no pago)(?: el| mi)? ' + PAGO + '(?: de)? (.{2,40})$')))) return { tipo: 'borrar', nombre: m[1] };
  // «[agrega|anota] pago fijo <nombre> [de] [S/ | $] <monto> [soles|dólares] [el [día] <d> [de cada mes]]»
  m = n.match(new RegExp('^(?:agrega|anota|apunta|pon|nuevo|registra)?(?: un| mi)? ?' + PAGO + '(?: de| del| para)? (.{2,40}?) (?:de |por )?(s/ ?|\\$ ?|usd ?)?(\\d{1,6}(?:[.,]\\d{1,2})?) ?(soles|sol|dolares|dolar|usd)?(?: (?:el|cada)(?: dia)? (\\d{1,2})(?: de cada mes| del mes)?)?$'));
  if (m) {
    var dia = m[5] ? parseInt(m[5], 10) : null;
    if (dia !== null && (dia < 1 || dia > 31)) return null;
    var usd = /\$|usd/.test(m[2] || '') || /dolar|usd/.test(m[4] || '');
    return { tipo: 'agregar', nombre: bonito(t, m[1]), monto: parseFloat(m[3].replace(',', '.')), moneda: usd ? 'USD' : 'PEN', dia: dia };
  }
  return null;
}
// El nombre como lo escribió (con mayúsculas y tildes) si se puede.
function bonito(t, nombreNorm) {
  var o = String(t || '').replace(/[¿?¡!]+/g, '').replace(/\s+/g, ' ').trim(), i = norm(o).indexOf(nombreNorm);
  var s = i >= 0 && norm(o).length === o.length ? o.substr(i, nombreNorm.length) : nombreNorm;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function plata(monto, moneda) { return (moneda === 'USD' ? '$ ' : 'S/ ') + Number(monto || 0).toFixed(2); }

// PURO: próxima fecha de cobro (si el mes no tiene ese día, el último día del mes).
function proxima(dia, hoy) {
  var h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  var en = function (y, mes) { var ult = new Date(y, mes + 1, 0).getDate(); return new Date(y, mes, Math.min(dia, ult)); };
  var f = en(h.getFullYear(), h.getMonth());
  if (f < h) f = en(h.getFullYear(), h.getMonth() + 1);
  return { fecha: f, dias: Math.round((f - h) / 86400000) };
}
function cuando(d) { return d === 0 ? 'hoy' : d === 1 ? 'mañana' : 'en ' + d + ' días'; }

// PURO: aplica la orden a la lista y devuelve { lista, texto }.
function aplicar(lista, c, hoy) {
  lista = (lista || []).slice(); hoy = hoy || new Date();
  var busca = function (x) { var k = norm(x); return lista.findIndex(function (p) { var j = norm(p.nombre); return j === k || (k.length >= 3 && (j.indexOf(k) >= 0 || k.indexOf(j) >= 0)); }); };
  if (c.tipo === 'agregar') {
    var dia = c.dia || hoy.getDate(), i = busca(c.nombre), nuevo = { nombre: c.nombre, monto: c.monto, moneda: c.moneda, dia: dia };
    if (i >= 0) lista[i] = nuevo; else lista.push(nuevo);
    var p = proxima(dia, hoy);
    return { lista: lista, texto: '💳 ' + (i >= 0 ? 'Actualicé' : 'Anoté') + ' «' + c.nombre + '»: ' + plata(c.monto, c.moneda) + ' cada mes, el día ' + dia +
      (c.dia ? '' : ' (hoy; dime «el 5» si es otro día)') + '. Próximo cobro: ' + cuando(p.dias) + '.\nSolo lo anoto para avisarte; no pago nada.' };
  }
  if (c.tipo === 'borrar') {
    var j = busca(c.nombre);
    if (j < 0) return { lista: lista, texto: 'No tengo «' + c.nombre + '» en tus pagos fijos. Di «mis pagos fijos» para verlos.' };
    var q = lista.splice(j, 1)[0];
    return { lista: lista, texto: '🗑 Quité «' + q.nombre + '» de tus pagos fijos.' };
  }
  if (!lista.length) return { lista: lista, texto: '💳 No tienes pagos fijos anotados. Ejemplo: «pago fijo Netflix 35 soles el 5».' };
  var orden = lista.map(function (p) { return { p: p, x: proxima(p.dia, hoy) }; }).sort(function (a, b) { return a.x.dias - b.x.dias; });
  if (c.tipo === 'pronto') {
    var pr = orden.filter(function (o) { return o.x.dias <= 7; });
    return { lista: lista, texto: pr.length ? '💳 Se cobra esta semana:\n' + pr.map(function (o) { return '• ' + o.p.nombre + ' — ' + plata(o.p.monto, o.p.moneda) + ' (' + cuando(o.x.dias) + ')'; }).join('\n')
      : '💳 Nada se cobra en los próximos 7 días. El siguiente: ' + orden[0].p.nombre + ' ' + cuando(orden[0].x.dias) + '.' };
  }
  var tot = {}; lista.forEach(function (p) { tot[p.moneda] = (tot[p.moneda] || 0) + p.monto; });
  var totTxt = Object.keys(tot).map(function (k) { return plata(tot[k], k); }).join(' + ');
  return { lista: lista, texto: '💳 Tus pagos fijos (' + lista.length + '):\n' + orden.map(function (o) {
    return (o.x.dias <= 3 ? '⚠ ' : '• ') + o.p.nombre + ' — ' + plata(o.p.monto, o.p.moneda) + ' · día ' + o.p.dia + ' (' + cuando(o.x.dias) + ')'; }).join('\n') +
    '\nAl mes: ' + totTxt + ' · al año: ' + Object.keys(tot).map(function (k) { return plata(tot[k] * 12, k); }).join(' + ') + '.' };
}

function leer() { try { var l = JSON.parse(localStorage.getItem(CLAVE) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function guardar(l) { try { localStorage.setItem(CLAVE, JSON.stringify(l)); } catch (e) {} }
function hacer(c) { var r = aplicar(leer(), c, new Date()); if (c.tipo === 'agregar' || c.tipo === 'borrar') guardar(r.lista); return r.texto; }
// Para el resumen del día: lo que se cobra en los próximos «dias» días.
function pronto(dias, hoy) {
  hoy = hoy || new Date();
  return leer().map(function (p) { return { nombre: p.nombre, monto: p.monto, moneda: p.moneda, dias: proxima(p.dia, hoy).dias }; })
    .filter(function (o) { return o.dias <= (dias == null ? 3 : dias); }).sort(function (a, b) { return a.dias - b.dias; });
}
function lineaResumen(lst) {
  return lst && lst.length ? '💳 Se cobra pronto: ' + lst.slice(0, 3).map(function (o) { return o.nombre + ' ' + plata(o.monto, o.moneda) + ' (' + cuando(o.dias) + ')'; }).join(' · ') + '.' : '';
}

var API = { parsear: parsear, aplicar: aplicar, proxima: proxima, hacer: hacer, pronto: pronto, lineaResumen: lineaResumen };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiPagosFijos = API;
})();
