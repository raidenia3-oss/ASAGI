// Capa 1 del «mapa de mi Jarvis»: que ASAGI te CONOZCA. Te entrevista como a un empleado nuevo, una pregunta a la vez,
// y arma tu documento «Mi perfil». Lo que no contestes queda como [PENDIENTE] (nunca se inventa).
//   «entrevístame» · «conóceme» · durante la entrevista: «salta» · «para» (sigue luego con «sigue la entrevista»)
//   «mi perfil» · «borra mi perfil»
// El perfil entra en cada respuesta del cerebro (personalidad.js) y se le pasa a ARIA por el enlace para que también te conozca.
(function () {
'use strict';
var K_EST = 'asagi-entrevista', K_PERFIL = 'asagi-perfil';
var PREGUNTAS = [
  ['quien', 'Para empezar: ¿quién eres y a qué te dedicas hoy?'],
  ['proyectos', '¿Qué estás estudiando o construyendo ahora mismo?'],
  ['metas', '¿Cuál es tu meta más importante de los próximos meses?'],
  ['semana', '¿Cómo es una semana normal tuya? (horarios, clases, trabajo, descansos)'],
  ['tareas', '¿Qué tareas repites cada semana que te gustaría que yo haga o te recuerde?'],
  ['herramientas', '¿Qué apps y herramientas usas más en el celular y en la PC?'],
  ['tono', '¿Cómo quieres que te hable? (directo, con humor, técnico, motivador…)'],
  ['olvidos', '¿Qué cosas se te olvidan seguido o te estresan?'],
  ['personas', '¿Con quiénes hablas más seguido (familia, amigos, clientes)? Solo nombres y qué son para ti.'],
  ['limites', 'Última: ¿qué NO quieres que haga nunca?']
];
var TITULOS = { quien: 'Quién soy', proyectos: 'En qué estoy', metas: 'Mi meta', semana: 'Mi semana', tareas: 'Tareas que se repiten',
  herramientas: 'Mis herramientas', tono: 'Cómo quiero que me hables', olvidos: 'Lo que se me olvida o me estresa', personas: 'Personas importantes', limites: 'Lo que nunca debes hacer' };

function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,]+/g, '').replace(/\s+/g, ' ').trim(); }
function leer(k, d) { try { return JSON.parse(localStorage.getItem(k) || '') || d; } catch (e) { return d; } }
function poner(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }

// PURO: qué pidió
function parsear(t) {
  var n = norm(t);
  if (/^(?:entrevistame|conoceme|hazme (?:la|una) entrevista|quiero que me conozcas|empieza la entrevista)$/.test(n)) return { accion: 'empezar' };
  if (/^(?:sigue|continua|retoma) (?:con )?la entrevista$/.test(n)) return { accion: 'seguir' };
  if (/^(?:mi perfil|que sabes de mi perfil|muestrame mi perfil|ver mi perfil)$/.test(n)) return { accion: 'ver' };
  if (/^(?:borra|olvida|elimina) mi perfil$/.test(n)) return { accion: 'borrar' };
  return null;
}
// PURO: respuesta durante la entrevista -> 'saltar' | 'parar' | 'respuesta'
function tipoRespuesta(t) {
  var n = norm(t);
  if (/^(?:salta|siguiente|paso|no se|prefiero no decir|otra|saltala)$/.test(n)) return 'saltar';
  if (/^(?:para|basta|luego|despues|sigue despues|termina|cancela|ya no)(?: la entrevista)?$/.test(n)) return 'parar';
  return 'respuesta';
}
// PURO: documento «Mi perfil» (markdown). Lo que falta = [PENDIENTE].
function documento(resp, fecha) {
  return '# Mi perfil (Daniel)\n_Actualizado: ' + (fecha || '') + '. Lo marcado [PENDIENTE] aún no me lo dijiste._\n\n' +
    PREGUNTAS.map(function (p) { var r = String((resp || {})[p[0]] || '').trim(); return '## ' + TITULOS[p[0]] + '\n' + (r || '[PENDIENTE]'); }).join('\n\n');
}
// PURO: versión corta para el cerebro (sin pendientes, máx. ~600 letras)
function paraCerebro(resp) {
  var orden = ['quien', 'proyectos', 'metas', 'tono', 'limites', 'tareas', 'olvidos'];
  var s = orden.filter(function (k) { return String((resp || {})[k] || '').trim(); })
    .map(function (k) { return TITULOS[k] + ': ' + String(resp[k]).trim().slice(0, 140); }).join('. ');
  return s ? ('Perfil que Daniel te contó (úsalo para responder como alguien que lo conoce; no lo repitas): ' + s).slice(0, 600) : '';
}
function pendientes(resp) { return PREGUNTAS.filter(function (p) { return !String((resp || {})[p[0]] || '').trim(); }).length; }

function estado() { return leer(K_EST, null); }
function activa() { var e = estado(); return !!(e && e.activa); }
function perfil() { return leer(K_PERFIL, null); }
function sinCerebroTexto() { var p = perfil(); return p ? paraCerebro(p.resp) : ''; }

function preguntar(e, decir) {
  var p = PREGUNTAS[e.i];
  decir('🎙 ' + (e.i + 1) + '/' + PREGUNTAS.length + ' · ' + p[1] + (e.i === 0 ? '\n(Contesta con tus palabras. «salta» si no quieres responder, «para» y seguimos otro día.)' : ''));
}
function cerrar(e, decir) {
  var hoy = new Date().toLocaleDateString('es-PE');
  var doc = documento(e.resp, hoy);
  poner(K_PERFIL, { resp: e.resp, doc: doc, fecha: hoy });
  poner(K_EST, null);
  var pend = pendientes(e.resp);
  decir('📄 Listo, ya te conozco mejor. Armé «Mi perfil»' + (pend ? ' (' + pend + ' cosas quedaron [PENDIENTE]; «sigue la entrevista» cuando quieras completarlas)' : '') +
    '. Lo uso en cada respuesta y se lo paso a ARIA.\n\n' + doc);
  var cli = window._asagiLan;
  if (cli && cli.enviar) cli.enviar({ t: 'perfil', doc: doc, corto: paraCerebro(e.resp) }).catch(function () {});
}

function ejecutar(c, decir) {
  if (c.accion === 'ver') { var p = perfil(); decir(p ? '📄 ' + p.doc + '\n\n«entrevístame» para rehacerlo · «borra mi perfil»' : '📄 Aún no tengo tu perfil. Di «entrevístame» (10 preguntas, una a la vez).'); return; }
  if (c.accion === 'borrar') { poner(K_PERFIL, null); poner(K_EST, null); decir('📄 Borré tu perfil. Ya no lo uso.'); return; }
  var e = c.accion === 'seguir' ? estado() : null;
  if (!e) {
    var prev = perfil();
    e = { activa: true, i: 0, resp: (c.accion === 'seguir' && prev && prev.resp) || {} };
    if (c.accion === 'seguir') { e.i = PREGUNTAS.findIndex(function (q) { return !String(e.resp[q[0]] || '').trim(); }); if (e.i < 0) { decir('📄 Tu perfil ya está completo. «mi perfil» para verlo.'); return; } }
  }
  e.activa = true; poner(K_EST, e);
  if (c.accion === 'empezar') decir('🎙 Te voy a entrevistar como a alguien que recién conozco: ' + PREGUNTAS.length + ' preguntas cortas, una a la vez. Lo que digas se queda en tu celular.');
  preguntar(e, decir);
}
// La llama app.js con CADA mensaje mientras la entrevista está activa. true = lo usé como respuesta.
function responder(t, decir) {
  var e = estado(); if (!e || !e.activa) return false;
  var tipo = tipoRespuesta(t);
  if (tipo === 'parar') { e.activa = false; poner(K_EST, e); poner(K_PERFIL, { resp: e.resp, doc: documento(e.resp, new Date().toLocaleDateString('es-PE')), fecha: '' }); decir('🎙 Paramos aquí. Guardé lo que me contaste. «sigue la entrevista» cuando quieras.'); return true; }
  if (tipo === 'respuesta') e.resp[PREGUNTAS[e.i][0]] = String(t).trim().slice(0, 600);
  e.i++;
  while (e.i < PREGUNTAS.length && String(e.resp[PREGUNTAS[e.i][0]] || '').trim()) e.i++;   // al seguir, salta lo ya contestado
  if (e.i >= PREGUNTAS.length) { cerrar(e, decir); return true; }
  poner(K_EST, e); preguntar(e, decir); return true;
}

var API = { parsear: parsear, tipoRespuesta: tipoRespuesta, documento: documento, paraCerebro: paraCerebro, pendientes: pendientes,
  ejecutar: ejecutar, responder: responder, activa: activa, perfil: perfil, sinCerebroTexto: sinCerebroTexto, PREGUNTAS: PREGUNTAS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiEntrevista = API;
})();
