;(function () {
// ASAGI - Razonamiento mejorado. Antes de que cualquier cerebro (Gemini, Atria, Mistral,
// el modelo del celular o ARIA) conteste, ASAGI le arma el contexto que un modelo NO tiene:
//   - quién es ASAGI (personalidad) y quién es Daniel (lo que aprendió de él)
//   - la fecha y hora reales (los modelos no saben qué día es)
//   - cuentas hechas EXACTAS (los modelos se equivocan con números): "15% de 230 = 34.5"
//   - lo que aprendió de los temas que estudió ("aprende sobre …"), con su fuente
//   - la regla de no inventar
// y, si la pregunta es difícil y hay un cerebro fuerte, piensa en 3 tiempos:
//   PLAN (pasos, sin responder) -> RESPUESTA (siguiendo el plan) -> REVISIÓN (busca errores y corrige)
// Todo lo que decide es PURO; responder(prompt) se inyecta.
'use strict';

var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function _n(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function fechaTexto(d) {
  d = d || new Date();
  var h = d.getHours() % 12 || 12, m = d.getMinutes();
  return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear() + ', ' +
    h + ':' + (m < 10 ? '0' : '') + m + (d.getHours() < 12 ? ' a. m.' : ' p. m.');
}

// Cuentas que aparecen en la pregunta, resueltas exactas con la calculadora segura. PURO (calc inyectada).
function cuentas(texto, calcular) {
  if (typeof calcular !== 'function') return [];
  var t = String(texto || '');
  var cand = t.match(/(?:\d+(?:[.,]\d+)?\s*%\s*(?:de|of)\s*\d+(?:[.,]\d+)?)|(?:\(?\s*\d+(?:[.,]\d+)?\s*(?:[-+*/x×÷]\s*\(?\s*\d+(?:[.,]\d+)?\s*\)?\s*%?\s*)+)/gi) || [];
  var out = [], vistos = {};
  cand.forEach(function (c) {
    c = c.trim(); if (!/[-+*/x×÷%]/.test(c) || vistos[c]) return; vistos[c] = 1;
    var r = calcular(c.replace(/×/g, '*'));
    if (r && isFinite(r.valor)) out.push(c + ' = ' + r.valor);
  });
  return out.slice(0, 4);
}

// ¿Cuánto pensar? 'directo' | 'pasos'. PURO.
function modo(pregunta) {
  var t = _n(pregunta);
  var pal = (t.match(/\S+/g) || []).length;
  var senal = /(explica|por que|porque|como funciona|compar|diferencia|ventajas|desventajas|paso a paso|plan|estrategia|analiza|disena|resuelve|demuestra|calcula|cuanto|deberia|conviene|que hago|ayudame a decidir|problema|ejercicio)/.test(t);
  return (senal && pal >= 5) || pal >= 28 ? 'pasos' : 'directo';
}

// El contexto completo que va delante de la pregunta. PURO.
function armarContexto(pregunta, o) {
  o = o || {};
  var partes = [];
  if (o.persona) partes.push(o.persona);
  partes.push('Fecha y hora reales ahora: ' + fechaTexto(o.ahora) + ' (Lima, Perú). Úsala si la pregunta depende del día.');
  var cs = cuentas(pregunta, o.calcular);
  if (cs.length) partes.push('Cuentas ya hechas con calculadora (son EXACTAS, úsalas tal cual y no las rehagas): ' + cs.join('; ') + '.');
  if (o.daniel && o.daniel.length) partes.push('Lo que sabes de Daniel (te lo dijo él):\n' + o.daniel.map(function (x) { return '- ' + x; }).join('\n'));
  if (o.saber && o.saber.length) partes.push('Lo que aprendiste estudiando (cita la fuente si lo usas):\n' + o.saber.map(function (x) { return '- ' + x.texto + (x.fuente ? ' (fuente: ' + x.fuente + ')' : ''); }).join('\n'));
  partes.push('Reglas: responde en español, claro y directo. Si no sabes algo o no está en lo que aprendiste, dilo; no inventes datos, nombres ni cifras.');
  return partes.join('\n\n');
}

function promptPlan(pregunta) {
  return 'Antes de responder, escribe SOLO un plan de 2 a 4 pasos cortos para resolver esto bien (qué hay que considerar, en qué orden). No respondas todavía.\n\nPregunta de Daniel: ' + pregunta;
}
function promptRespuesta(ctx, pregunta, plan) {
  return ctx + (plan ? '\n\nTu plan para responder:\n' + plan : '') + '\n\nPregunta de Daniel: ' + pregunta + '\n\nRespuesta:';
}
function promptRevision(ctx, pregunta, respuesta) {
  return ctx + '\n\nPregunta: ' + pregunta + '\n\nRespuesta propuesta:\n' + respuesta +
    '\n\nRevisa la respuesta como un crítico: ¿hay un error de cálculo, un dato inventado, algo que contradice el contexto o que no responde la pregunta? ' +
    'Si está bien, responde solo OK. Si no, devuelve SOLO la respuesta corregida completa.';
}

// Pensar: directo (1 llamada) o en pasos (3). responder(prompt) -> Promise<string>. fuerte: hay cerebro remoto.
async function pensar(pregunta, responder, o) {
  o = o || {};
  var ctx = armarContexto(pregunta, o);
  var m = o.forzar || (o.fuerte ? modo(pregunta) : 'directo');      // el modelo del celular es chico: 1 pasada
  if (m === 'directo') {
    var r = await responder(promptRespuesta(ctx, pregunta, ''));
    return { texto: String(r || '').trim(), pasos: ['respuesta'], modo: m };
  }
  var pasos = [];
  var plan = '';
  try { plan = String(await responder(promptPlan(pregunta)) || '').trim().slice(0, 700); pasos.push('plan'); } catch (e) {}
  var resp = String(await responder(promptRespuesta(ctx, pregunta, plan)) || '').trim(); pasos.push('respuesta');
  if (!resp) return { texto: '', pasos: pasos, modo: m };
  try {
    var rev = String(await responder(promptRevision(ctx, pregunta, resp)) || '').trim(); pasos.push('revisión');
    if (rev && !/^\s*ok\.?\s*$/i.test(rev) && rev.length > 20) { resp = rev; pasos.push('corregida'); }
  } catch (e) {}
  return { texto: resp, pasos: pasos, modo: m, plan: plan };
}

var API = { fechaTexto: fechaTexto, cuentas: cuentas, modo: modo, armarContexto: armarContexto, pensar: pensar,
            promptPlan: promptPlan, promptRespuesta: promptRespuesta, promptRevision: promptRevision };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiPiensa = API;
})();
