// Cálculos de todos los días, sin internet ni cerebro (ideas de Dicio y Leon, asistentes libres):
//   «convierte 10 km a millas» · «cuántos grados fahrenheit son 30 grados» · «5 libras en kilos»
//   «lanza una moneda» · «tira un dado» · «número al azar del 1 al 50» · «elige entre pizza y pollo»
//   «divide 120 entre 4 personas» · «propina del 10% de 85» · «cuenta de 150 con 10% de propina entre 3»
//   «qué día será en 45 días» · «qué día fue hace 100 días» · «cuántos días hay del 1 de enero al 15 de marzo»
//   «cuántos años tiene alguien nacido en 2003» · «qué día de la semana fue el 28 de julio de 1821»
(function () {
'use strict';
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!]+/g, '').replace(/\s+/g, ' ').trim(); }
var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
var MES_N = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };

// unidad -> [magnitud, factor a la unidad base, nombre bonito]
var U = {
  km: ['l', 1000, 'km'], kilometro: ['l', 1000, 'km'], kilometros: ['l', 1000, 'km'], m: ['l', 1, 'm'], metro: ['l', 1, 'm'], metros: ['l', 1, 'm'],
  cm: ['l', 0.01, 'cm'], centimetro: ['l', 0.01, 'cm'], centimetros: ['l', 0.01, 'cm'], mm: ['l', 0.001, 'mm'], milimetros: ['l', 0.001, 'mm'],
  milla: ['l', 1609.344, 'millas'], millas: ['l', 1609.344, 'millas'], pie: ['l', 0.3048, 'pies'], pies: ['l', 0.3048, 'pies'],
  pulgada: ['l', 0.0254, 'pulgadas'], pulgadas: ['l', 0.0254, 'pulgadas'], yarda: ['l', 0.9144, 'yardas'], yardas: ['l', 0.9144, 'yardas'],
  kg: ['p', 1, 'kg'], kilo: ['p', 1, 'kg'], kilos: ['p', 1, 'kg'], kilogramo: ['p', 1, 'kg'], kilogramos: ['p', 1, 'kg'], g: ['p', 0.001, 'g'], gramo: ['p', 0.001, 'g'], gramos: ['p', 0.001, 'g'],
  libra: ['p', 0.45359237, 'libras'], libras: ['p', 0.45359237, 'libras'], lb: ['p', 0.45359237, 'libras'], onza: ['p', 0.028349523, 'onzas'], onzas: ['p', 0.028349523, 'onzas'],
  tonelada: ['p', 1000, 'toneladas'], toneladas: ['p', 1000, 'toneladas'],
  l: ['v', 1, 'litros'], litro: ['v', 1, 'litros'], litros: ['v', 1, 'litros'], ml: ['v', 0.001, 'ml'], mililitros: ['v', 0.001, 'ml'], galon: ['v', 3.785411784, 'galones'], galones: ['v', 3.785411784, 'galones'],
  taza: ['v', 0.24, 'tazas'], tazas: ['v', 0.24, 'tazas'],
  kmh: ['s', 1, 'km/h'], 'km/h': ['s', 1, 'km/h'], mph: ['s', 1.609344, 'mph'],
  gb: ['d', 1024, 'GB'], mb: ['d', 1, 'MB'], tb: ['d', 1048576, 'TB'], kb: ['d', 1 / 1024, 'KB'],
  hora: ['t', 3600, 'horas'], horas: ['t', 3600, 'horas'], minuto: ['t', 60, 'minutos'], minutos: ['t', 60, 'minutos'], segundo: ['t', 1, 'segundos'], segundos: ['t', 1, 'segundos'],
  dia: ['t', 86400, 'días'], dias: ['t', 86400, 'días'], semana: ['t', 604800, 'semanas'], semanas: ['t', 604800, 'semanas']
};
var TEMP = { c: 'c', celsius: 'c', centigrados: 'c', grados: 'c', 'grados celsius': 'c', f: 'f', fahrenheit: 'f', 'grados fahrenheit': 'f', k: 'k', kelvin: 'k' };
function num(x) { return parseFloat(String(x).replace(',', '.')); }
function bonito(v) { var r = Math.abs(v) >= 100 ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000; return String(r).replace('.', ','); }
function soles(v) { return 'S/ ' + (Math.round(v * 100) / 100).toFixed(2); }
function fechaDe(txt, hoy) {
  var m = norm(txt).match(/^(\d{1,2}) de ([a-z]+)(?: (?:de|del) (\d{4}))?$/);
  if (!m || MES_N[m[2]] == null) return null;
  return new Date(m[3] ? +m[3] : hoy.getFullYear(), MES_N[m[2]], +m[1]);
}
function fechaTxt(d) { return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear(); }

// PURO: entiende la frase o null.
function parsear(t) {
  var n = norm(t).replace(/\bkm\/h\b/g, 'kmh'), m;
  // temperatura
  if ((m = n.match(/^(?:convierte |pasa |cuanto es |cuantos (?:grados )?(?:fahrenheit|celsius|kelvin) son )?(-?\d+(?:[.,]\d+)?) ?(?:°|grados )?(celsius|centigrados|fahrenheit|kelvin|c|f|k)? ?(?:a|en) (?:grados )?(celsius|centigrados|fahrenheit|kelvin|c|f|k)$/)) && (m[2] || /grados|°/.test(n)))
    return { accion: 'temp', v: num(m[1]), de: TEMP[m[2] || 'c'], a: TEMP[m[3]] };
  if ((m = n.match(/^cuantos (?:grados )?(fahrenheit|celsius|kelvin) son (-?\d+(?:[.,]\d+)?) ?(?:°|grados)? ?(celsius|centigrados|fahrenheit|kelvin)?$/)))
    return { accion: 'temp', v: num(m[2]), de: TEMP[m[3] || (m[1] === 'celsius' ? 'fahrenheit' : 'celsius')], a: TEMP[m[1]] };
  // unidades
  if ((m = n.match(/^(?:convierte |pasa |cuanto es |cuanto son |cuantos? [a-z/]+ (?:hay en|son) )?(\d+(?:[.,]\d+)?) ?([a-z/]+(?: [a-z]+)?) (?:a|en) ([a-z/]+)$/)) && U[m[2]] && U[m[3]] && U[m[2]][0] === U[m[3]][0])
    return { accion: 'unidad', v: num(m[1]), de: m[2], a: m[3] };
  if ((m = n.match(/^cuantos? ([a-z/]+) (?:hay en|son|tiene) (\d+(?:[.,]\d+)?) ?([a-z/]+)$/)) && U[m[1]] && U[m[3]] && U[m[1]][0] === U[m[3]][0])
    return { accion: 'unidad', v: num(m[2]), de: m[3], a: m[1] };
  // azar
  if (/^(?:lanza|tira|lanzame|tirame) (?:una )?moneda$|^cara o sello$|^cara o cruz$/.test(n)) return { accion: 'moneda' };
  if ((m = n.match(/^(?:lanza|tira|lanzame|tirame) (?:un |(\d) )?dados?$/))) return { accion: 'dado', n: Math.min(5, +(m[1] || 1)) };
  if ((m = n.match(/^(?:dame |dime |elige )?(?:un )?numero (?:al azar|aleatorio)(?: (?:del|entre(?: el)?) (\d+) (?:al|y(?: el)?) (\d+))?$/))) return { accion: 'azar', a: +(m[1] || 1), b: +(m[2] || 100) };
  if ((m = String(t).trim().replace(/[¿?¡!]+/g, '').match(/^(?:elige|escoge|decide)(?: entre| por mi entre)?:? (.{1,60}) (?:o|y) (.{1,60})$/i))) return { accion: 'elegir', ops: m[1].split(/\s*,\s*/).concat([m[2]]).map(function (x) { return x.trim(); }).filter(Boolean) };
  // plata: dividir y propina
  if ((m = n.match(/^(?:la )?cuenta de (?:s\/ ?)?(\d+(?:[.,]\d+)?)(?: soles)? con (?:el |un )?(\d+(?:[.,]\d+)?) ?(?:%|por ciento) de propina(?: (?:entre|para) (\d+)(?: personas)?)?$/))) return { accion: 'cuenta', total: num(m[1]), propina: num(m[2]), personas: +(m[3] || 1) };
  if ((m = n.match(/^(?:divide|dividir|reparte|repartir) (?:s\/ ?)?(\d+(?:[.,]\d+)?)(?: soles)? (?:entre|para) (\d+)(?: personas| amigos)?$/))) return { accion: 'cuenta', total: num(m[1]), propina: 0, personas: +m[2] };
  if ((m = n.match(/^(?:cuanto es (?:la |el )?)?propina (?:del? )?(\d+(?:[.,]\d+)?) ?(?:%|por ciento)? (?:de|sobre) (?:s\/ ?)?(\d+(?:[.,]\d+)?)$/))) return { accion: 'cuenta', total: num(m[2]), propina: num(m[1]), personas: 1 };
  // fechas
  if ((m = n.match(/^(?:que (?:dia|fecha) (?:sera|es|cae)) (?:en|dentro de) (\d{1,4}) (dias|semanas|meses)$/))) return { accion: 'mover', n: +m[1], u: m[2], signo: 1 };
  if ((m = n.match(/^(?:que (?:dia|fecha) (?:fue|era)) hace (\d{1,4}) (dias|semanas|meses)$/))) return { accion: 'mover', n: +m[1], u: m[2], signo: -1 };
  if ((m = n.match(/^cuantos dias (?:hay |pasan )?(?:del?|desde el) (\d{1,2} de [a-z]+(?: (?:de|del) \d{4})?) (?:al|hasta el) (\d{1,2} de [a-z]+(?: (?:de|del) \d{4})?)$/))) return { accion: 'entre', d1: m[1], d2: m[2] };
  if ((m = n.match(/^(?:que dia (?:de la semana )?(?:fue|era|cae|cayo|sera)) el (\d{1,2} de [a-z]+ (?:de|del) \d{4})$/))) return { accion: 'diasemana', d: m[1] };
  if ((m = n.match(/^cuantos anos tiene (?:alguien|una persona|uno) (?:que nacio|nacido|nacida) (?:en (?:el )?)?(\d{4})$/))) return { accion: 'edad', anio: +m[1] };
  return null;
}

// PURO (salvo azar: rnd inyectable). -> texto
function resolver(c, hoy, rnd) {
  hoy = hoy || new Date(); rnd = rnd || Math.random;
  if (c.accion === 'temp') {
    var aC = c.de === 'c' ? c.v : c.de === 'f' ? (c.v - 32) * 5 / 9 : c.v - 273.15;
    var r = c.a === 'c' ? aC : c.a === 'f' ? aC * 9 / 5 + 32 : aC + 273.15;
    var nom = { c: '°C', f: '°F', k: 'K' };
    return '🌡 ' + bonito(c.v) + ' ' + nom[c.de] + ' = ' + bonito(r) + ' ' + nom[c.a];
  }
  if (c.accion === 'unidad') {
    var de = U[c.de], a = U[c.a];
    return '📏 ' + bonito(c.v) + ' ' + de[2] + ' = ' + bonito(c.v * de[1] / a[1]) + ' ' + a[2];
  }
  if (c.accion === 'moneda') return '🪙 ¡' + (rnd() < 0.5 ? 'Cara' : 'Sello') + '!';
  if (c.accion === 'dado') { var ds = []; for (var i = 0; i < c.n; i++) ds.push(1 + Math.floor(rnd() * 6)); return '🎲 ' + ds.join(' · ') + (ds.length > 1 ? ' (suma ' + ds.reduce(function (s, x) { return s + x; }, 0) + ')' : ''); }
  if (c.accion === 'azar') { var lo = Math.min(c.a, c.b), hi = Math.max(c.a, c.b); return '🎯 ' + (lo + Math.floor(rnd() * (hi - lo + 1))) + ' (entre ' + lo + ' y ' + hi + ')'; }
  if (c.accion === 'elegir') return '🤔 Elijo: ' + c.ops[Math.floor(rnd() * c.ops.length)] + '.';
  if (c.accion === 'cuenta') {
    var p = c.total * c.propina / 100, tot = c.total + p, l = [];
    if (c.propina) l.push('Propina ' + bonito(c.propina) + '%: ' + soles(p), 'Total: ' + soles(tot));
    if (c.personas > 1) l.push('Cada uno (' + c.personas + '): ' + soles(tot / c.personas));
    return '💸 ' + l.join(' · ');
  }
  if (c.accion === 'mover') {
    var d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (c.u === 'meses') d.setMonth(d.getMonth() + c.signo * c.n); else d.setDate(d.getDate() + c.signo * c.n * (c.u === 'semanas' ? 7 : 1));
    return '📅 ' + (c.signo > 0 ? 'Dentro de ' : 'Hace ') + c.n + ' ' + c.u.replace('dias', 'días') + (c.signo > 0 ? ' será ' : ' fue ') + fechaTxt(d) + '.';
  }
  if (c.accion === 'entre') {
    var a1 = fechaDe(c.d1, hoy), a2 = fechaDe(c.d2, hoy);
    if (!a1 || !a2) return 'No entendí alguna de las fechas. Ej: «cuántos días hay del 1 de enero al 15 de marzo».';
    if (!/\d{4}/.test(c.d2) && a2 < a1) a2.setFullYear(a2.getFullYear() + 1);
    var dd = Math.round((a2 - a1) / 864e5);
    return '📅 Del ' + fechaTxt(a1) + ' al ' + fechaTxt(a2) + ' hay ' + Math.abs(dd) + ' día(s)' + (Math.abs(dd) >= 14 ? ' (unas ' + Math.round(Math.abs(dd) / 7) + ' semanas)' : '') + '.';
  }
  if (c.accion === 'diasemana') { var f = fechaDe(c.d, hoy); return f ? '📅 El ' + c.d + ' ' + (f < hoy ? 'fue' : 'cae') + ' ' + DIAS[f.getDay()] + '.' : 'No entendí la fecha.'; }
  if (c.accion === 'edad') { var e = hoy.getFullYear() - c.anio; return '🎂 Tiene ' + (e - 1) + ' o ' + e + ' años (según si ya cumplió este año).'; }
  return '';
}

var API = { parsear: parsear, resolver: resolver };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiCalculos = API;
})();
