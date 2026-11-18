// Traspaso celular ↔ PC (robado de la «memoria unificada» de ECC: pasar el trabajo de un agente a otro con su contexto).
//   En ASAGI: «sigue en la pc» · «pásalo a la pc» · «continúa en aria»  -> ARIA recibe de qué hablaban y sigue ahí.
//   En ARIA: «pásalo al celular» -> la próxima vez que ASAGI late (cada 5 min o al abrir), lo trae: «📨 Desde la PC: …».
//   «trae lo de la pc» lo pide al momento.
// Lo traspasado es CONTEXTO (lo que se dijo), no órdenes: el que lo recibe lo trata como dato y pregunta si duda.
(function () {
'use strict';
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,]+/g, '').replace(/\s+/g, ' ').trim(); }

// PURO
function parsear(t) {
  var n = norm(t);
  if (/^(?:sigue|continua|seguimos|pasalo|pasa esto|manda esto|lleva esto)(?: esto| esta charla| la charla)? (?:en|a) (?:la|mi) (?:pc|compu(?:tadora)?|laptop)$|^(?:continua|sigue) (?:en|con) aria$|^pasale (?:esto|la charla) a aria$/.test(n)) return { accion: 'enviar' };
  if (/^(?:trae|traeme|que me pasaste|que me paso aria) (?:lo|eso)? ?(?:de|desde) (?:la|mi) (?:pc|compu(?:tadora)?)$|^que me paso aria$/.test(n)) return { accion: 'traer' };
  return null;
}
// mensajes [{rol:'user'|'bot', texto}] -> paquete de traspaso (lo último, recortado). PURO.
function armar(mensajes, ahora) {
  var m = (mensajes || []).filter(function (x) { return x && x.texto && !/^(?:📨|🖥 Le paso)/.test(x.texto); }).slice(-8);
  var ultimoTuyo = m.slice().reverse().find(function (x) { return x.rol === 'user'; });
  return {
    t: 'traspaso', de: 'ASAGI', ts: ahora || Date.now(),
    tema: ultimoTuyo ? String(ultimoTuyo.texto).slice(0, 160) : '',
    charla: m.map(function (x) { return { rol: x.rol === 'user' ? 'Daniel' : 'ASAGI', texto: String(x.texto).replace(/\s+/g, ' ').slice(0, 400) }; })
  };
}
// paquete de ARIA -> texto para el chat del celular (escudado). PURO salvo el escudo opcional.
function mostrar(p, escudo) {
  if (!p || !p.charla || !p.charla.length) return '';
  var limpio = function (t) { return escudo ? escudo(t) : t; };
  return '📨 Desde la PC (ARIA)' + (p.tema ? ' — «' + limpio(p.tema).slice(0, 100) + '»' : '') + ':\n' +
    p.charla.slice(-6).map(function (x) { return (x.rol === 'Daniel' ? 'Tú: ' : 'ARIA: ') + limpio(x.texto).slice(0, 300); }).join('\n') +
    '\nSigue escribiéndome aquí y continúo.';
}

function ejecutar(c, decir, mensajes) {
  var cli = window._asagiLan;
  if (!cli || !cli.enviar) { decir('🖥 Necesito el enlace con ARIA (WiFi o cable). En la PC di «enlace pc».'); return; }
  var E = window.AsagiEscudo, esc = function (t) { return E ? E.neutralizar(t).texto : t; };
  if (c.accion === 'enviar') {
    var p = armar((mensajes || []).slice(0, -1));          // sin el «sigue en la pc» recién escrito
    if (!p.charla.length) { decir('🖥 Aún no hay nada de qué hablar para pasarle a ARIA.'); return; }
    decir('🖥 Le paso a ARIA de qué hablábamos…');
    cli.enviar(p).then(function (r) {
      decir(r && r.ok && r.resp && r.resp.ok ? '🖥 Listo: en la PC, ARIA ya tiene la charla («' + p.tema.slice(0, 60) + '»). Sigue allá cuando quieras.' : '🖥 ARIA no respondió. ¿Está abierta en la PC?');
    }).catch(function (e) { decir('🖥 No pude hablar con ARIA (' + ((e && e.message) || e) + ').'); });
    return;
  }
  cli.enviar({ t: 'traspaso_traer' }).then(function (r) {
    var x = r && r.ok && r.resp;
    decir(x && x.paquete ? mostrar(x.paquete, esc) : '📨 ARIA no me pasó nada. En la PC dile «pásalo al celular».');
  }).catch(function (e) { decir('📨 No pude hablar con ARIA (' + ((e && e.message) || e) + ').'); });
}

var API = { parsear: parsear, armar: armar, mostrar: mostrar, ejecutar: ejecutar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiTraspaso = API;
})();
