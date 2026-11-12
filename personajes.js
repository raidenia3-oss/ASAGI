;(function () {
// ASAGI - Aprender de personajes (carpeta personajes/): cómo piensan, sus tácticas y cómo trabajan.
// Cada personaje es un JSON con: esencia, como_trabaja, tacticas[{nombre, que_es, como, cuando, senales,
// practica}], para_asagi, para_aria. Para sumar otro: copia un JSON y agrégalo a indice.json.
//
//   personajes                         -> quiénes son y qué aprende de cada uno
//   tácticas de patrick jane           -> la lista de sus tácticas
//   qué haría barney: <situación>      -> consejo con SUS tácticas aplicadas a tu caso, en su estilo
//   táctica del día                    -> una táctica y un ejercicio para hoy
//   léeme / cómo me ves                -> ASAGI te "lee" como Jane, por cómo estás escribiendo
// Todo lo que decide es PURO; cargar() lee la carpeta y aprender() lo mete a la memoria.
'use strict';

function _n(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿¡]/g, '').trim(); }
var VACIAS = { el: 1, la: 1, los: 1, las: 1, de: 1, del: 1, y: 1, en: 1, un: 1, una: 1, que: 1, por: 1, con: 1, para: 1, como: 1, al: 1, es: 1, mi: 1, me: 1, tu: 1, se: 1, lo: 1, le: 1, no: 1 };
function palabras(t) { return (_n(t).match(/[a-z0-9ñ]{3,}/g) || []).filter(function (w) { return !VACIAS[w]; }); }

// Encuentra al personaje por nombre o apodo ("jane", "barney", "stinson"). PURO.
function buscar(lista, nombre) {
  var q = _n(nombre);
  return (lista || []).find(function (p) { return _n(p.nombre) === q || _n(p.apodo) === q || _n(p.id) === q || _n(p.nombre).split(' ').indexOf(q) >= 0 || q.indexOf(_n(p.nombre).split(' ')[0]) >= 0; }) || null;
}

function parsear(texto) {
  var t = String(texto || '').trim(), n = _n(t), m;
  if (/^(?:personajes|mis personajes|de quien aprendes|de quienes aprendes)\??$/.test(n)) return { tipo: 'lista' };
  if ((m = n.match(/^(?:tacticas|trucos|tecnicas)\s+de\s+(.{3,40})$/))) return { tipo: 'tacticas', quien: m[1] };
  if ((m = t.match(/^\s*(?:que|qué)\s+har[ií]a\s+([^:,]{3,40}?)\s*(?:[:,]|en|si|con)\s+([\s\S]{3,})$/i))) return { tipo: 'haria', quien: m[1], situacion: m[2].trim() };
  if ((m = t.match(/^\s*(?:como|cómo)\s+lo\s+har[ií]a\s+([^:,]{3,40}?)\s*[:,]?\s*([\s\S]*)$/i))) return { tipo: 'haria', quien: m[1], situacion: m[2].trim() || 'esto' };
  if (/^(?:tactica|truco|tecnica) del dia$/.test(n)) return { tipo: 'dia' };
  if ((m = n.match(/^(?:entrename|entrenarme|ensename|enseñame) (?:como|a ser como|las tacticas de) (.{3,40})$/))) return { tipo: 'entrena', quien: m[1] };
  if (/^(?:leeme|lee me|como me ves|que notas de mi|leeme como jane)\??$/.test(n)) return { tipo: 'leeme' };
  return null;
}

// Tácticas más útiles para una situación (palabras en común con cuándo/señales/qué es). PURO.
function relevantes(p, situacion, k) {
  var q = palabras(situacion);
  return (p.tacticas || []).map(function (t, i) {
    var campo = palabras([t.nombre, t.cuando, t.senales, t.que_es].join(' '));
    var s = q.filter(function (w) { return campo.some(function (c) { return c === w || (w.length > 4 && c.indexOf(w.slice(0, 5)) === 0); }); }).length;
    return { t: t, s: s, i: i };
  }).sort(function (a, b) { return b.s - a.s || a.i - b.i; }).slice(0, k || 2).map(function (x) { return x.t; });
}

function textoLista(lista) {
  if (!lista || !lista.length) return 'Aún no tengo personajes en la carpeta personajes/.';
  return '🎭 Aprendo de:\n' + lista.map(function (p) { return '· ' + p.nombre + ' (' + p.de + ') — ' + p.tacticas.length + ' tácticas. ' + p.esencia.split('. ')[0] + '.'; }).join('\n') +
    '\n\nPrueba: «qué haría ' + (lista[0].apodo || lista[0].nombre) + ': <tu situación>», «táctica del día» o «léeme».';
}
function textoTacticas(p) {
  return '🎭 Tácticas de ' + p.nombre + ':\n' + p.tacticas.map(function (t, i) { return (i + 1) + '. ' + t.nombre + ' — ' + t.que_es; }).join('\n') +
    '';
}
function textoTactica(p, t) {
  return '🎭 ' + p.nombre + ' · ' + t.nombre + '\n' + t.que_es + '\nCómo: ' + t.como + '\nEjercicio: ' + t.practica + (t.limite ? '\nOjo: ' + t.limite : '');
}
function delDia(lista, fecha) {
  var todas = []; (lista || []).forEach(function (p) { p.tacticas.forEach(function (t) { todas.push({ p: p, t: t }); }); });
  if (!todas.length) return null;
  var d = fecha || new Date(), n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  return todas[n % todas.length];
}

function promptHaria(p, ts, situacion) {
  return 'Eres ASAGI. Daniel te pide pensar como ' + p.nombre + ' (' + p.de + '): ' + p.esencia + '\n' +
    'Tácticas que aplican:\n' + ts.map(function (t) { return '- ' + t.nombre + ': ' + t.como; }).join('\n') +
    '\n\nSituación de Daniel: ' + situacion +
    '\n\nDa un consejo concreto en 3-5 pasos como lo haría ' + (p.apodo || p.nombre.split(' ')[0]) + ' de verdad, sonando como él. Termina con una frase corta para que Daniel la use.';
}

// Memoria: cada táctica como un recuerdo con tema y fuente (una sola vez por versión). PURO salvo M.
function aprender(lista, M) {
  var n = 0;
  (lista || []).forEach(function (p) {
    p.tacticas.forEach(function (t) { if (M.aprender(p.nombre + ' · ' + t.nombre + ': ' + t.que_es + ' Cómo: ' + t.como + (t.limite ? ' Límite: ' + t.limite : ''), 'personaje ' + _n(p.nombre), 'personajes/' + p.id)) n++; });
    (p.como_trabaja || []).forEach(function (c) { if (M.aprender(p.nombre + ' trabaja así: ' + c, 'personaje ' + _n(p.nombre), 'personajes/' + p.id)) n++; });
  });
  return n;
}

// "Léeme": observación al estilo Jane sobre CÓMO escribe Daniel (no sobre lo que dice). PURO.
// msgs: [{texto, cuando}] de Daniel, del más viejo al más nuevo.
function leer(msgs, ahora) {
  var l = (msgs || []).filter(function (m) { return m && m.texto; });
  if (l.length < 4) return { ok: false, texto: '🔍 Necesito que hablemos un poco más para leerte bien. Una lectura con 3 mensajes sería adivinar.' };
  var base = l.slice(0, -3), ult = l.slice(-3);
  var largo = function (a) { return a.reduce(function (s, m) { return s + m.texto.length; }, 0) / Math.max(1, a.length); };
  var obs = [], lb = largo(base), lu = largo(ult);
  if (lu < lb * 0.55) obs.push('tus últimos mensajes son mucho más cortos que de costumbre (≈' + Math.round(lu) + ' letras contra ≈' + Math.round(lb) + '): o estás apurado, o cansado, o algo te tiene ocupado');
  else if (lu > lb * 1.6) obs.push('estás escribiendo bastante más que de costumbre: algo te tiene entusiasmado o te importa mucho');
  var h = (ahora || new Date()).getHours();
  if (h >= 0 && h < 5) obs.push('son las ' + (h % 12 || 12) + ' de la madrugada y sigues aquí: el cerebro trabaja, pero el cuerpo pide cama');
  var excl = ult.filter(function (m) { return /!/.test(m.texto); }).length, preg = ult.filter(function (m) { return /\?/.test(m.texto); }).length;
  if (excl >= 2) obs.push('usas varios signos de exclamación: hay energía o urgencia');
  if (preg >= 2) obs.push('me haces muchas preguntas seguidas: estás en modo explorar');
  var temas = {}; ult.forEach(function (m) { palabras(m.texto).forEach(function (w) { if (w.length > 4) temas[w] = (temas[w] || 0) + 1; }); });
  var rep = Object.keys(temas).filter(function (w) { return temas[w] > 1; });
  if (rep.length) obs.push('vuelves a «' + rep[0] + '» varias veces: eso es lo que hoy tienes en la cabeza');
  if (!obs.length) obs.push('escribes parejo, sin cambios bruscos: estás tranquilo y concentrado');
  return { ok: true, texto: '🔍 Te leo como Jane (por cómo escribes, no por adivinar): ' + obs.join('; ') + '. ¿Acerté? Si no, dime y ajusto mi lectura.' };
}

var API = { parsear: parsear, buscar: buscar, relevantes: relevantes, textoLista: textoLista, textoTacticas: textoTacticas, textoTactica: textoTactica,
            delDia: delDia, promptHaria: promptHaria, aprender: aprender, leer: leer, palabras: palabras };

// carga de la carpeta (en el navegador/app)
API.cargar = async function (base, fetchFn) {
  base = base || 'personajes/'; fetchFn = fetchFn || fetch;
  var idx = await (await fetchFn(base + 'indice.json')).json();
  var out = [];
  for (var i = 0; i < (idx.personajes || []).length; i++) {
    try { out.push(await (await fetchFn(base + idx.personajes[i])).json()); } catch (e) {}
  }
  return out;
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiPersonajes = API;
})();
