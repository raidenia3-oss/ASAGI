// Notificaciones y gastos (ideas de Dicio y PennyWise, hechas a la medida de Perú).
// «¿qué notificaciones tengo?» -> resumen por app (sin cerebro, sin internet).
// «mis gastos», «cuánto gasté esta semana», «movimientos de yape» -> lo que llegó de Yape/Plin/bancos.
// El permiso lo da Daniel una vez en Ajustes (Android no deja otra forma). Nada sale del celular;
// los códigos de verificación se descartan en el lado nativo.
(function () {
'use strict';
function P() { var C = window.Capacitor && window.Capacitor.Plugins; return C && C.AsagiControl; }
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.]+/g, '').trim(); }

// ---- comandos. PURO ----
function parsear(t) {
  var n = norm(t);
  if (/^(?:que |cuales )?notificaciones(?: tengo| hay| nuevas)?$|^(?:resume|lee|leeme|revisa)(?: mis| las)? notificaciones$|^mis notificaciones$/.test(n)) return { accion: 'notificaciones' };
  var m = n.match(/^(?:mis gastos|gastos|cuanto (?:he )?gaste|cuanto gaste|en que gaste|mis movimientos|movimientos(?: de (?:yape|plin|banco|mis cuentas))?|cuanto (?:me )?(?:yapearon|recibi|entro))(?: (hoy|ayer|esta semana|la semana|este mes|el mes|este ano))?$/);
  if (m) return { accion: 'gastos', periodo: m[1] || 'este mes', soloIngresos: /recibi|yapearon|entro/.test(n) };
  return null;
}

// ---- un movimiento de dinero desde el texto de una notificación. PURO ----
function monto(txt) {
  var m = String(txt || '').match(/(S\/\.?|PEN|US\$|\$)\s?(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
  if (!m) return null;
  var s = m[2].replace(/\s/g, '');
  if (/,\d{1,2}$/.test(s) && s.indexOf('.') < 0) s = s.replace(',', '.'); else s = s.replace(/,/g, '');
  var v = parseFloat(s);
  return isFinite(v) ? { valor: v, moneda: /US|\$/.test(m[1]) && !/S\//.test(m[1]) ? 'USD' : 'PEN' } : null;
}
function movimiento(o) {
  var t = (o.titulo || '') + ' · ' + (o.texto || ''), n = norm(t);
  var mo = monto(t); if (!mo) return null;
  var tipo = /(recibiste|te (?:envio|yapeo|pago|transfirio|deposito)|te llego|abono|deposito recibido|ingreso|has recibido|te plinearon|recibio un yape)/.test(n) ? 'ingreso'
    : /(yapeaste|pagaste|enviaste|transferiste|plineaste|consumo|compra|cargo|retiro|debito|pago realizado|pago exitoso|realizaste)/.test(n) ? 'gasto' : 'otro';
  var NOM = '([A-ZÁÉÍÓÚÑ][\\wÁÉÍÓÚÑáéíóúñ.&*]+(?:\\s+[A-ZÁÉÍÓÚÑ][\\wÁÉÍÓÚÑáéíóúñ.&*]+){0,3})';
  var cuerpo = String(o.texto || '');
  var q = cuerpo.match(new RegExp(NOM + '\\s+te\\s+(?:envi|yape|pag|transfir|deposit|plin)', 'u')) ||
          cuerpo.match(new RegExp('\\b(?:de|a|en)\\s+' + NOM, 'u'));
  var BANCOS = [[/yape/i, 'Yape'], [/plin/i, 'Plin'], [/interbank/i, 'Interbank'], [/bbva/i, 'BBVA'], [/scotia/i, 'Scotiabank'],
    [/bcp|credito/i, 'BCP'], [/banbif/i, 'BanBif'], [/pichincha/i, 'Pichincha'], [/nacion/i, 'Banco de la Nación'], [/mercadopago/i, 'Mercado Pago']];
  var app = (o.nombre || o.app || '').replace(/^com\./, '');
  for (var b = 0; b < BANCOS.length; b++) if (BANCOS[b][0].test(o.app + ' ' + t)) { app = BANCOS[b][1]; break; }
  return { ts: o.ts, valor: mo.valor, moneda: mo.moneda, tipo: tipo, quien: q ? q[1].trim() : '', app: app };
}
// quita repetidos (la misma notificación actualizada). PURO
function unicos(movs) {
  var vistos = {};
  return movs.filter(function (m) { var k = m.tipo + m.valor + m.quien + Math.floor(m.ts / 120000); if (vistos[k]) return false; vistos[k] = 1; return true; });
}
function inicioPeriodo(periodo, ahora) {
  var d = new Date(ahora || Date.now()); d.setHours(0, 0, 0, 0);
  if (periodo === 'ayer') return { desde: d.getTime() - 864e5, hasta: d.getTime() };
  if (/semana/.test(periodo)) { var dia = (d.getDay() + 6) % 7; return { desde: d.getTime() - dia * 864e5, hasta: Infinity }; }
  if (/mes/.test(periodo)) { d.setDate(1); return { desde: d.getTime(), hasta: Infinity }; }
  if (/ano/.test(periodo)) { d.setMonth(0, 1); return { desde: d.getTime(), hasta: Infinity }; }
  return { desde: d.getTime(), hasta: Infinity };   // hoy
}
function S(v) { return 'S/ ' + v.toFixed(2); }
function resumenGastos(movs, periodo, soloIngresos) {
  if (!movs.length) return '💸 No vi movimientos de Yape, Plin o bancos ' + periodo + '. (Solo cuento los que llegan como notificación desde que activaste el permiso.)';
  var pen = movs.filter(function (m) { return m.moneda === 'PEN'; });
  var g = pen.filter(function (m) { return m.tipo === 'gasto'; }), i = pen.filter(function (m) { return m.tipo === 'ingreso'; });
  var sum = function (a) { return a.reduce(function (s, m) { return s + m.valor; }, 0); };
  var porQuien = {};
  g.forEach(function (m) { var k = m.quien || m.app; porQuien[k] = (porQuien[k] || 0) + m.valor; });
  var top = Object.keys(porQuien).sort(function (a, b) { return porQuien[b] - porQuien[a]; }).slice(0, 4);
  var l = ['💸 ' + periodo.charAt(0).toUpperCase() + periodo.slice(1) + ':'];
  if (!soloIngresos) l.push('Gastaste ' + S(sum(g)) + ' en ' + g.length + ' movimiento(s).');
  l.push('Recibiste ' + S(sum(i)) + ' en ' + i.length + '.');
  if (!soloIngresos && top.length) l.push('Donde más: ' + top.map(function (k) { return k + ' ' + S(porQuien[k]); }).join(', ') + '.');
  var ult = movs.filter(function (m) { return !soloIngresos || m.tipo === 'ingreso'; }).slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, 5).map(function (m) {
    var h = new Date(m.ts); return '• ' + h.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) + ' ' + (m.tipo === 'ingreso' ? '+' : m.tipo === 'gasto' ? '−' : '') + (m.moneda === 'USD' ? 'US$ ' + m.valor.toFixed(2) : S(m.valor)) + ' ' + m.app + (m.quien ? ' · ' + m.quien : '');
  });
  return l.join(' ') + '\nÚltimos:\n' + ult.join('\n');
}
function resumenNotif(lista) {
  if (!lista.length) return '🔔 No tienes notificaciones nuevas desde que abrí el permiso.';
  var por = {};
  lista.forEach(function (o) { var k = o.nombre || o.app; (por[k] = por[k] || []).push(o); });
  var apps = Object.keys(por).sort(function (a, b) { return por[b].length - por[a].length; });
  return '🔔 ' + lista.length + ' notificación(es):\n' + apps.slice(0, 8).map(function (k) {
    var quienes = por[k].map(function (o) { return o.titulo; }).filter(function (t, i, a) { return t && a.indexOf(t) === i; }).slice(0, 3);
    return '• ' + k + ' (' + por[k].length + ')' + (quienes.length ? ': ' + quienes.join(', ') : '') + ' — «' + String(por[k][0].texto || '').slice(0, 70) + '»';
  }).join('\n');
}

// ---- con el plugin ----
async function asegurar(decir) {
  var p = P(); if (!p || !p.notifEstado) { decir('Esto necesita la app instalada en el celular.'); return false; }
  var e = await p.notifEstado();
  if (e && e.activo) return true;
  decir('🔔 Para leer tus notificaciones, Android pide un permiso que solo tú puedes dar: te abro Ajustes, activa «ASAGI» y vuelve. Es una sola vez; nada sale del celular y los códigos de verificación los ignoro.');
  try { await p.notifAbrirAjustes(); } catch (e2) {}
  return false;
}
async function notificaciones(decir) {
  if (!(await asegurar(decir))) return;
  var r = await P().notifLista();
  decir(resumenNotif((r && r.lista) || []));
}
async function gastos(c, decir) {
  if (!(await asegurar(decir))) return;
  var per = inicioPeriodo(c.periodo);
  var r = await P().notifFinanzas({ desde: per.desde });
  var movs = unicos(((r && r.lista) || []).map(movimiento).filter(Boolean)).filter(function (m) { return m.ts < per.hasta; });
  decir(resumenGastos(movs, c.periodo, c.soloIngresos));
}

var API = { parsear: parsear, monto: monto, movimiento: movimiento, unicos: unicos, inicioPeriodo: inicioPeriodo, resumenGastos: resumenGastos, resumenNotif: resumenNotif, notificaciones: notificaciones, gastos: gastos };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiNotif = API;
})();
