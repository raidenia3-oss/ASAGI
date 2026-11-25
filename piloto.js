;(function () {
// ASAGI - Piloto automático (idea del reel "Override Autopilot", pero local y tuyo).
// Un RETO al día: una pregunta para pensar + una acción concreta. Cada día que lo cumples
// alimenta el "cerebro" (una barra que crece) y suma al nivel. Todo PURO y testeable;
// los datos quedan SOLO en tu celular (localStorage 'asagi-piloto'). Nada se publica.
'use strict';

// Pool de retos: {p: pregunta para reflexionar, a: acción concreta de hoy}.
var RETOS = [
  { p: '¿Qué está en piloto automático en tu día que no elegiste?', a: 'Corta UNA costumbre hoy: 20 min sin redes al despertar.' },
  { p: '¿Cuál es la tarea que vienes evitando?', a: 'Hazla 10 minutos ahora. Solo empezar.' },
  { p: '¿Qué aprendiste ayer que puedas usar hoy?', a: 'Aplícalo en algo real en la próxima hora.' },
  { p: '¿Qué te robó más tiempo esta semana?', a: 'Pon un límite hoy: una alarma que te saque de ahí.' },
  { p: '¿Qué parte de ASAGI/ARIA quieres que avance?', a: 'Define el siguiente paso más pequeño y hazlo.' },
  { p: '¿A quién le debes un mensaje?', a: 'Escríbelo ahora, corto y honesto.' },
  { p: '¿Qué harías si no te diera miedo fallar?', a: 'Da el primer paso visible de eso hoy.' },
  { p: '¿Tu cuerpo está al día? (agua, sueño, moverte)', a: 'Elige uno y arréglalo hoy mismo.' },
  { p: '¿Qué estás consumiendo que no te suma?', a: 'Deja de seguir/silencia una cuenta que te drena.' },
  { p: '¿Qué idea anotaste y nunca empezaste?', a: 'Convierte una idea en una tarea con fecha.' },
  { p: '¿Qué dirías que fue un buen día hoy?', a: 'Define tu “gana” del día antes del mediodía.' },
  { p: '¿Dónde dijiste “sí” cuando querías decir “no”?', a: 'Practica un “no” honesto hoy.' },
  { p: '¿Qué te haría sentir orgulloso esta noche?', a: 'Hazlo primero, antes que lo fácil.' },
  { p: '¿Qué cosa pequeña mejoraría tu mañana?', a: 'Déjala lista hoy (ropa, plan, primer paso).' }
];

// Día ordinal estable (independiente de zona horaria para el índice del reto).
function _ord(fecha) { return Math.floor(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) / 86400000); }
function _ymd(fecha) { var m = fecha.getMonth() + 1, d = fecha.getDate(); return fecha.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (d < 10 ? '0' + d : d); }

// Reto determinístico del día. PURO.
function reto(fecha) { return RETOS[((_ord(fecha) % RETOS.length) + RETOS.length) % RETOS.length]; }

// Racha: días seguidos cumplidos que terminan hoy o ayer. obj.dias = {'YYYY-MM-DD': {...}}. PURO.
function racha(obj, fecha) {
  var dias = (obj && obj.dias) || {}, n = 0, cur = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  if (!dias[_ymd(cur)]) { cur.setDate(cur.getDate() - 1); if (!dias[_ymd(cur)]) return 0; }   // aún no hoy: cuenta desde ayer
  while (dias[_ymd(cur)]) { n++; cur.setDate(cur.getDate() - 1); }
  return n;
}
function hechos(obj) { return obj && obj.dias ? Object.keys(obj.dias).length : 0; }
function hoyHecho(obj, fecha) { return !!(obj && obj.dias && obj.dias[_ymd(fecha)]); }

// Cerebro que crece: nivel y barra a partir de los días cumplidos. PURO.
function cerebro(h) {
  var n = 12, llenos = Math.min(n, Math.round(Math.sqrt(h) * 2));   // crece rápido al inicio, luego cuesta
  var barra = ''; for (var i = 0; i < n; i++) barra += i < llenos ? '◆' : '◇';
  var nivel = h <= 0 ? 0 : h < 3 ? 1 : h < 7 ? 2 : h < 15 ? 3 : h < 30 ? 4 : 5;
  var nombre = ['dormido', 'despertando', 'activo', 'afilado', 'imparable', 'en piloto propio'][nivel];
  return { nivel: nivel, nombre: nombre, barra: barra, dias: h };
}

// Marca el reto de hoy como hecho (idempotente). Devuelve el obj nuevo. PURO (recibe/retorna objeto).
function marcar(obj, fecha, nota) {
  var o = obj && typeof obj === 'object' ? obj : {};
  var dias = o.dias && typeof o.dias === 'object' ? o.dias : {};
  var nuevo = {}; for (var k in dias) if (Object.prototype.hasOwnProperty.call(dias, k)) nuevo[k] = dias[k];
  var ya = !!nuevo[_ymd(fecha)];
  if (!ya) nuevo[_ymd(fecha)] = { nota: String(nota || '').slice(0, 280), ord: _ord(fecha) };
  else if (nota) nuevo[_ymd(fecha)] = Object.assign({}, nuevo[_ymd(fecha)], { nota: String(nota).slice(0, 280) });
  return { obj: Object.assign({}, o, { dias: nuevo }), yaEstaba: ya };
}

// Texto para mostrar el reto de hoy + estado. PURO.
function texto(obj, fecha) {
  var r = reto(fecha), c = cerebro(hechos(obj)), rc = racha(obj, fecha), hecho = hoyHecho(obj, fecha);
  var L = [];
  L.push('🧠 Piloto automático · cerebro ' + c.barra + ' (' + c.nombre + ')');
  L.push('🔥 Racha: ' + rc + (rc === 1 ? ' día' : ' días') + ' · ' + c.dias + ' cumplidos en total');
  L.push('');
  L.push('Hoy:');
  L.push('❓ ' + r.p);
  L.push('🎯 ' + r.a);
  L.push('');
  L.push(hecho ? '✅ Ya lo marcaste hoy. Mañana hay otro.' : 'Cuando lo hagas: «reto hecho» (o «reto: tu nota»).');
  return L.join('\n');
}
function textoHecho(res, obj, fecha) {
  var c = cerebro(hechos(obj)), rc = racha(obj, fecha);
  if (res.yaEstaba) return '✅ Ya estaba marcado hoy. Racha: ' + rc + '. Cerebro ' + c.barra + '.';
  return '✅ Reto cumplido. 🔥 Racha: ' + rc + (rc === 1 ? ' día' : ' días') + '.\n🧠 Cerebro ' + c.barra + ' (' + c.nombre + ') · ' + c.dias + ' en total.' +
    (c.nivel >= 2 ? '\nVa creciendo. Sigue así, Daniel.' : '');
}

var API = { reto: reto, racha: racha, hechos: hechos, hoyHecho: hoyHecho, cerebro: cerebro, marcar: marcar, texto: texto, textoHecho: textoHecho, RETOS: RETOS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiPiloto = API;

})();
