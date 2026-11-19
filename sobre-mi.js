// «Lo que sé de ti»: ASAGI recuerda datos tuyos y los usa (sin internet ni cerebro).
//   «recuerda que mi cumpleaños es el 13 de mayo» · «qué sabes de mí» · «cuándo es mi cumpleaños»
//   «cómo se llama mi mamá» · «olvida mi color favorito»
// Usa la memoria local (memoria.js, temas dato/preferencia/pedido/fecha). Nada sale del celular.
(function () {
'use strict';
var PERSONAL = { dato: 1, preferencia: 1, pedido: 1, fecha: 1, daniel: 1 };
var VACIAS = { cuando: 1, cual: 1, cuales: 1, como: 1, donde: 1, que: 1, quien: 1, es: 1, son: 1, mi: 1, mis: 1, me: 1, yo: 1, el: 1, la: 1, los: 1, las: 1,
  de: 1, del: 1, se: 1, llama: 1, un: 1, una: 1, en: 1, a: 1, al: 1, lo: 1, sabes: 1, dime: 1, recuerdas: 1, tengo: 1, soy: 1, esta: 1, estoy: 1 };
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,]+/g, '').replace(/\s+/g, ' ').trim(); }
function raiz(w) { return w.replace(/(?:es|s)$/, '').replace(/[aeo]$/, ''); }
function palabras(t) { return norm(t).split(' ').filter(function (w) { return w.length > 2 && !VACIAS[w]; }).map(raiz); }

// PURO. sinCerebro=true habilita también lo que solo tiene sentido sin cerebro (afirmaciones y preguntas sueltas).
function parsear(t, sinCerebro) {
  var n = norm(t), m;
  if (!n) return null;
  if (/^(?:que sabes de mi|que recuerdas de mi|que sabes sobre mi|que sabes de mi vida|que has aprendido de mi|lo que sabes de mi)$/.test(n)) return { accion: 'listar' };
  if ((m = String(t).trim().match(/^(?:recuerda|acu[eé]rdate|no olvides|anota|apunta|guarda)(?:\s+(?:de\s+)?que)\s+((?:mi|mis|yo|soy|me|estoy|tengo|vivo|estudio|trabajo|nac[ií]|el cumplea[ñn]os|la boda|el aniversario|el santo)\b.{3,200})$/i)))
    return { accion: 'guardar', texto: m[1].replace(/[.!]+$/, '').trim() };
  if ((m = n.match(/^(?:olvida|olvidate de|borra de tu memoria|ya no recuerdes)(?: que)? (.{3,80})$/)) && !/(?:lista|compras|pendiente|recordatorio|musica)/.test(n))
    return { accion: 'olvidar', que: m[1] };
  if (!sinCerebro) return null;
  if (/^(?:cuando es|cual es|cuales son|como se llama|como se llaman|donde (?:vivo|estudio|trabajo|naci)|que me gusta|que (?:musica|comida|color|anime|deporte) me gusta|cuantos anos tengo|a que me dedico)\b/.test(n) && /\b(?:mi|mis|me|vivo|estudio|trabajo|naci|tengo)\b/.test(n))
    return { accion: 'preguntar', q: t };
  if (/^(?:el|la) (?:cumpleanos|aniversario|santo|boda) de .{2,40} (?:es|cae) (?:el )?\d{1,2} de [a-z]+/.test(n) ||
      /^(?:mi|mis) [a-z ]{2,40} (?:es|son|se llama|se llaman|esta|queda)\b.{2,}$/.test(n) || /^(?:me gusta|me encanta|no me gusta|odio|prefiero|soy|vivo en|estudio|trabajo en|trabajo de|naci)\b.{3,}$/.test(n))
    return { accion: 'guardar', texto: String(t).trim().replace(/[.!]+$/, ''), suelto: true };
  return null;
}

// «mi cumpleaños es…» -> «tu cumpleaños es…». PURO.
var CAMBIO = { mi: 'tu', mis: 'tus', yo: 'tú', soy: 'eres', estoy: 'estás', tengo: 'tienes', vivo: 'vives', estudio: 'estudias', trabajo: 'trabajas',
  me: 'te', nací: 'naciste', naci: 'naciste', prefiero: 'prefieres', odio: 'odias', conmigo: 'contigo' };
function aTi(texto) {
  var r = String(texto || '').trim().split(/(\s+)/).map(function (w) { var k = w.toLowerCase(); return CAMBIO[k] ? (w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase() ? CAMBIO[k][0].toUpperCase() + CAMBIO[k].slice(1) : CAMBIO[k]) : w; }).join('');
  r = r.replace(/\bte llamo\b/gi, 'te llamas');
  return r.charAt(0).toUpperCase() + r.slice(1);
}
// El dato guardado que mejor responde la pregunta. PURO.
function mejor(nodos, q) {
  var qs = palabras(q); if (!qs.length) return null;
  var best = null, bs = 0;
  (nodos || []).forEach(function (nd) {
    if (!nd || !PERSONAL[nd.tema] || /^(?:cuando|como|cual|que|donde|quien|cuanto|olvida)\b/.test(norm(nd.texto))) return;
    var ws = palabras(nd.texto), s = qs.filter(function (x) { return ws.some(function (y) { return y === x || (x.length >= 4 && (y.indexOf(x) === 0 || x.indexOf(y) === 0)); }); }).length;
    if (s > bs || (s === bs && s && nd.ts > best.ts)) { bs = s; best = nd; }
  });
  return bs ? best : null;
}

function mem() {
  var M = window.AsagiMemoria; if (!M) return null;
  if (!window._asagiMem) window._asagiMem = new M.Memoria(window.localStorage);
  return window._asagiMem;
}
function ejecutar(c, decir) {
  var me = mem(); if (!me) { decir('No tengo memoria disponible aquí.'); return; }
  if (c.accion === 'guardar') {
    // la memoria pasiva puede haberlo guardado hace un instante al llegar el mensaje: eso cuenta como nuevo
    var t0 = Date.now() / 1000, k = c.texto.trim().toLowerCase();
    var reciente = me.todos().some(function (n) { return (n.texto || '').trim().toLowerCase() === k && t0 - (n.ts || 0) < 10; });
    var nuevo = me.aprender(c.texto, 'dato', 'Daniel') || reciente;
    var fecha = /(cumplea|aniversario|santo|boda)/i.test(c.texto) && /\d{1,2} de [a-záéíóú]+/i.test(c.texto);
    decir((nuevo ? '🧠 Lo recordaré: ' : '🧠 Ya lo sabía: ') + aTi(c.texto) + '.' + (fecha ? ' Te aviso un día antes 🎂' : c.suelto && nuevo ? ' (Di «qué sabes de mí» para ver todo.)' : ''));
    return;
  }
  var todos = me.todos().filter(function (n) { return n && PERSONAL[n.tema] && !/^(?:cuando|como|cual|que|donde|quien|cuanto|olvida)\b/.test(norm(n.texto)); });
  if (c.accion === 'listar') {
    if (!todos.length) { decir('Aún no me has contado nada de ti. Prueba «recuerda que mi cumpleaños es el 13 de mayo».'); return; }
    decir('🧠 Lo que sé de ti (' + todos.length + '):\n' + todos.slice(-15).reverse().map(function (n) { return '• ' + aTi(n.texto); }).join('\n') + '\nPara borrar algo: «olvida …».');
    return;
  }
  if (c.accion === 'preguntar') {
    var b = mejor(todos, c.q);
    decir(b ? '🧠 ' + aTi(b.texto) + '.' : 'No me lo has dicho aún. Dime «recuerda que …» y lo guardo.');
    return;
  }
  if (c.accion === 'olvidar') {
    var qs = palabras(c.que);
    var fuera = qs.length ? me.olvidar(function (n) {
      if (!n || !PERSONAL[n.tema]) return false;
      if (/^(?:olvida|cuando|como|cual|que|donde|quien)\b/.test(norm(n.texto))) return true;   // basura antigua
      var ws = palabras(n.texto); return qs.every(function (x) { return ws.some(function (y) { return y === x || (x.length >= 4 && (y.indexOf(x) === 0 || x.indexOf(y) === 0)); }); });
    }) : [];
    decir(fuera.length ? '🗑 Olvidé: ' + fuera.map(function (n) { return aTi(n.texto); }).join(' · ') + '.' : 'No tenía guardado nada sobre «' + c.que + '».');
  }
}

var API = { parsear: parsear, ejecutar: ejecutar, aTi: aTi, mejor: mejor };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiSobreMi = API;
})();
