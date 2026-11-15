// Lo cotidiano que una persona le pide a su asistente y que NO necesita cerebro (antes caía en
// «necesito mi cerebro»). Ligero: consultas pequeñas a servicios gratis sin key.
//   «cómo va el clima» · «clima en Arequipa» · «va a llover mañana»     (Open-Meteo)
//   «convierte 50 dólares a soles» · «a cuánto está el dólar»           (open.er-api.com)
//   «cuánto falta para navidad» · «cuántos días faltan para el 28 de julio»
//   «qué es la fotosíntesis» · «quién fue Túpac Amaru»                  (Wikipedia: primero la de la SD, si no en línea)
//   «sube el volumen» · «baja el volumen» · «silencio» · «volumen al 50»
//   «quién eres» · «dime algo motivador» · «ayúdame a estudiar» · «te quiero»
(function () {
'use strict';
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,]+/g, '').replace(/\s+/g, ' ').trim(); }
var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
var FIESTAS = { 'navidad': [12, 25], 'nochebuena': [12, 24], 'ano nuevo': [1, 1], 'fiestas patrias': [7, 28], 'el 28 de julio': [7, 28],
  'halloween': [10, 31], 'san valentin': [2, 14], 'dia de la madre': null, 'dia del padre': null, 'santa rosa': [8, 30], 'todos los santos': [11, 1],
  'dia de la cancion criolla': [10, 31], 'inti raymi': [6, 24] };
var MONEDAS = { 'dolar': 'USD', 'dolares': 'USD', 'usd': 'USD', 'euro': 'EUR', 'euros': 'EUR', 'sol': 'PEN', 'soles': 'PEN', 'pen': 'PEN',
  'peso chileno': 'CLP', 'pesos chilenos': 'CLP', 'peso mexicano': 'MXN', 'pesos mexicanos': 'MXN', 'peso argentino': 'ARS', 'pesos argentinos': 'ARS',
  'real': 'BRL', 'reales': 'BRL', 'peso colombiano': 'COP', 'pesos colombianos': 'COP', 'yen': 'JPY', 'yenes': 'JPY', 'libra': 'GBP', 'libras': 'GBP', 'bitcoin': 'BTC' };

// ---- comandos. PURO ----
function parsear(t) {
  var n = norm(t), m;
  if ((m = n.match(/^(?:como (?:va|esta) el (?:clima|tiempo)|que clima hace|clima|el clima|tiempo|va a llover(?: hoy| manana)?|llovera(?: hoy| manana)?|hace frio|hace calor|que temperatura hace|pronostico)(?: (?:hoy|manana|ahora))?(?: (?:en|de) (.{2,40}))?$/)))
    return { accion: 'clima', ciudad: m[1] || '', manana: /manana/.test(n) };
  if ((m = n.match(/^(?:clima|tiempo|temperatura|pronostico) (?:en|de|para) (.{2,40})$/))) return { accion: 'clima', ciudad: m[1], manana: false };
  if ((m = n.match(/^(?:convierte|cambia|pasa|cuanto (?:es|son)) (\d+(?:[.,]\d+)?) (.{2,20}?) (?:a|en) (.{2,20})$/))) {
    var de = MONEDAS[m[2]], a = MONEDAS[m[3]];
    if (de && a) return { accion: 'cambio', monto: parseFloat(m[1].replace(',', '.')), de: de, a: a };
  }
  if ((m = n.match(/^(?:a cuanto esta|cuanto esta|precio del|como esta) (?:el |la )?(dolar|euro|bitcoin|peso chileno|peso mexicano|real)(?: hoy)?$/))) return { accion: 'cambio', monto: 1, de: MONEDAS[m[1]], a: 'PEN' };
  if ((m = n.match(/^(?:cuanto falta|cuantos dias faltan|cuanto queda|cuantos dias quedan) (?:para|pa) (?:el |la )?(.{3,40})$/))) return { accion: 'falta', que: m[1] };
  if ((m = String(t || '').trim().replace(/[¿?¡!]+/g, '').match(/^(?:qu[eé]|qui[eé]n(?:es)?)\s+(?:es|son|era|eran|fue|fueron)\s+(?:(?:el|la|los|las|un|una)\s+)?(.{2,70})$/i)) && !/^(?:tu|vos|usted|asagi|hora|dia|eso|esto)\b/i.test(m[1]))
    return { accion: 'quees', q: m[1].trim() };
  if (/^(?:sube|subele|aumenta)(?: el| al)? volumen$|^mas volumen$|^volumen arriba$/.test(n)) return { accion: 'volumen', dir: 'subir' };
  if (/^(?:baja|bajale|disminuye)(?: el| al)? volumen$|^menos volumen$|^volumen abajo$/.test(n)) return { accion: 'volumen', dir: 'bajar' };
  if (/^(?:silencio|silencia(?: el celular)?|quita el (?:sonido|volumen)|volumen (?:a )?(?:0|cero))$/.test(n)) return { accion: 'volumen', dir: 'silencio' };
  if ((m = n.match(/^(?:pon el |pon )?volumen (?:al |a |en )?(\d{1,3})(?: ?%| por ciento)?$/))) return { accion: 'volumen', dir: 'poner', valor: Math.min(100, +m[1]) };
  if (/^(?:quien eres|que eres|como te llamas|presentate)$/.test(n)) return { accion: 'quieneres' };
  if (/^(?:dime algo motivador|motivame|necesito motivacion|frase motivadora|animame|dame animos)$/.test(n)) return { accion: 'motivar' };
  if (/^(?:ayudame a estudiar|quiero estudiar|vamos a estudiar|modo estudio)(?: para .{2,40})?$/.test(n)) return { accion: 'estudiar' };
  if (/^(?:te quiero|te amo|eres la mejor|gracias por todo)$/.test(n)) return { accion: 'carino' };
  return null;
}

// Días hasta una fecha (fiesta o «20 de diciembre»). PURO.
function diasPara(que, hoy) {
  hoy = new Date(hoy || Date.now()); hoy.setHours(0, 0, 0, 0);
  var q = norm(que), md = null, nombre = que;
  if (FIESTAS[q]) md = FIESTAS[q];
  else if (q === 'dia de la madre' || q === 'dia del padre') {                 // 2.º domingo de mayo / 3.º de junio
    var mes = q === 'dia de la madre' ? 4 : 5, ord = q === 'dia de la madre' ? 2 : 3;
    var calc = function (an) { var d = new Date(an, mes, 1); var c = 0; while (true) { if (d.getDay() === 0 && ++c === ord) return d; d.setDate(d.getDate() + 1); } };
    var f = calc(hoy.getFullYear()); if (f < hoy) f = calc(hoy.getFullYear() + 1);
    return { dias: Math.round((f - hoy) / 864e5), fecha: f, nombre: nombre };
  } else {
    var m = q.match(/^(\d{1,2}) de (\w+)(?: de (\d{4}))?$/); if (!m) return null;
    var mi = MESES.indexOf(m[2]); if (mi < 0) return null;
    md = [mi + 1, +m[1]];
    if (m[3]) { var fx = new Date(+m[3], mi, +m[1]); return { dias: Math.round((fx - hoy) / 864e5), fecha: fx, nombre: nombre }; }
  }
  if (!md) return null;
  var fe = new Date(hoy.getFullYear(), md[0] - 1, md[1]); if (fe < hoy) fe = new Date(hoy.getFullYear() + 1, md[0] - 1, md[1]);
  return { dias: Math.round((fe - hoy) / 864e5), fecha: fe, nombre: nombre };
}
var WMO = { 0: 'despejado ☀', 1: 'mayormente despejado 🌤', 2: 'parcialmente nublado ⛅', 3: 'nublado ☁', 45: 'neblina 🌫', 48: 'neblina 🌫',
  51: 'garúa 🌦', 53: 'garúa 🌦', 55: 'garúa fuerte 🌧', 61: 'lluvia ligera 🌧', 63: 'lluvia 🌧', 65: 'lluvia fuerte 🌧', 71: 'nieve 🌨', 80: 'chubascos 🌦', 81: 'chubascos 🌧', 82: 'chubascos fuertes ⛈', 95: 'tormenta ⛈' };
function cielo(c) { return WMO[c] || (c >= 95 ? 'tormenta ⛈' : c >= 80 ? 'chubascos 🌦' : c >= 61 ? 'lluvia 🌧' : c >= 51 ? 'garúa 🌦' : 'variable'); }
function textoClima(lugar, j, manana) {
  var c = j.current || {}, d = j.daily || {}, i = manana ? 1 : 0;
  var lluvia = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;
  var l = [(manana ? '🌡 Mañana en ' : '🌡 Ahora en ') + lugar + ': ' + (manana ? cielo(d.weather_code[i]) : Math.round(c.temperature_2m) + '°C, ' + cielo(c.weather_code))];
  l.push((manana ? 'Temperatura' : 'Hoy') + ': máx ' + Math.round(d.temperature_2m_max[i]) + '°C, mín ' + Math.round(d.temperature_2m_min[i]) + '°C' +
    (lluvia != null ? ', probabilidad de lluvia ' + lluvia + '%' : '') + '.');
  if (!manana && c.relative_humidity_2m != null) l.push('Humedad ' + c.relative_humidity_2m + '%, viento ' + Math.round(c.wind_speed_10m) + ' km/h.');
  if (lluvia != null && lluvia >= 50) l.push('☂ Lleva algo para la lluvia.');
  return l.join('\n');
}

var FRASES = ['No tienes que verlo todo claro; solo da el siguiente paso.', 'Lo que haces cada día pesa más que lo que haces de vez en cuando.',
  'Disciplina es elegir entre lo que quieres ahora y lo que más quieres.', 'Empieza con 25 minutos. Después decides si sigues.',
  'Un mal día no borra todo lo que avanzaste.', 'Tu yo de agosto en la UNI te va a agradecer lo de hoy.'];

async function getJSON(url) { var r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }

async function ejecutar(c, decir, ctx) {
  ctx = ctx || {};
  if (c.accion === 'clima') {
    var ciudad = c.ciudad || (function () { try { return localStorage.getItem('asagi-ciudad') || 'Lima'; } catch (e) { return 'Lima'; } })();
    var g = await getJSON('https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&name=' + encodeURIComponent(ciudad));
    var p = g && g.results && g.results[0];
    if (!p) { decir('No encontré «' + ciudad + '». Prueba «clima en Arequipa».'); return; }
    var j = await getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + p.latitude + '&longitude=' + p.longitude +
      '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2');
    decir(textoClima(p.name + (p.admin1 && p.admin1 !== p.name ? ', ' + p.admin1 : ''), j, c.manana));
    return;
  }
  if (c.accion === 'cambio') {
    var j2 = await getJSON('https://open.er-api.com/v6/latest/' + c.de);
    var tasa = j2 && j2.rates && j2.rates[c.a];
    if (!tasa) { decir('No tengo el cambio de ' + c.de + ' a ' + c.a + ' ahora.'); return; }
    var res = c.monto * tasa;
    decir('💱 ' + c.monto + ' ' + c.de + ' = ' + res.toLocaleString('es-PE', { maximumFractionDigits: c.monto === 1 ? 3 : 2 }) + ' ' + c.a +
      (c.monto === 1 ? '' : ' (1 ' + c.de + ' = ' + tasa.toFixed(3) + ' ' + c.a + ')') + '. Referencial; en casas de cambio varía un poco.');
    return;
  }
  if (c.accion === 'falta') {
    var f = diasPara(c.que);
    if (!f) { decir('Dime una fecha como «cuánto falta para el 20 de diciembre» o una fiesta (navidad, año nuevo, fiestas patrias…).'); return; }
    var fs = f.fecha.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
    decir(f.dias === 0 ? '🎉 ¡Es hoy! (' + fs + ')' : f.dias < 0 ? 'Eso ya pasó (' + fs + ').' : '⏳ Faltan ' + f.dias + ' día' + (f.dias === 1 ? '' : 's') + ' para ' + f.nombre + ' (' + fs + ').');
    return;
  }
  if (c.accion === 'quees') {
    var W = window.AsagiWiki;
    try { if (W) { var loc = await W.buscar(c.q, 1); if (loc.length) { decir(W.resumen(loc[0]) + '\n(de tu Wikipedia sin internet)'); return; } } } catch (e) {}
    var s = await getJSON('https://es.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=' + encodeURIComponent(c.q));
    var tit = s && s.query && s.query.search && s.query.search[0] && s.query.search[0].title;
    if (!tit) { decir('No encontré «' + c.q + '» en Wikipedia.'); return; }
    var r = await getJSON('https://es.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(tit.replace(/ /g, '_')));
    var ex = String((r && r.extract) || '').trim();
    decir(ex ? '📚 ' + tit + '\n' + (ex.length > 700 ? ex.slice(0, 700).replace(/\s+\S*$/, '') + '…' : ex) + '\n(Wikipedia)' : 'No encontré un resumen de «' + tit + '».');
    return;
  }
  if (c.accion === 'volumen') {
    var C = window.Capacitor && window.Capacitor.Plugins, AC = C && C.AsagiControl;
    if (!AC || !AC.accion) { decir('El volumen lo controlo en la app instalada.'); return; }
    var v = await AC.accion({ tipo: 'volumen', dir: c.dir, valor: c.valor || 50 });
    decir(v && v.ok ? (c.dir === 'silencio' ? '🔇 Silencio.' : '🔊 Volumen al ' + v.porcentaje + '%.') : 'No pude cambiar el volumen.');
    return;
  }
  if (c.accion === 'quieneres') { decir('Soy ASAGI, tu asistente personal en el celular, Daniel. Organizo tu día, tus pendientes, tu música, tus gastos y busco lo que necesites. Di «qué puedes hacer» para ver todo.'); return; }
  if (c.accion === 'motivar') { decir('💪 ' + FRASES[Math.floor(Math.random() * FRASES.length)]); return; }
  if (c.accion === 'estudiar') {
    decir('📖 Vamos. Te propongo:\n1. «temporizador de 25 minutos» (concentración) y luego 5 de descanso.\n2. «quiz de matemáticas» para practicar.\n3. «qué es …» o «wiki …» para repasar conceptos.\n4. «recuérdame estudiar mañana a las 7» para no perder el ritmo.');
    return;
  }
  if (c.accion === 'carino') { decir('Gracias, Daniel 😊 Aquí sigo para ayudarte en lo que necesites.'); return; }
}

var API = { parsear: parsear, ejecutar: ejecutar, diasPara: diasPara, textoClima: textoClima, cielo: cielo };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiUtiles = API;
})();
