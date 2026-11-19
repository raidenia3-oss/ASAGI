;(function () {
// ASAGI - Citas. Dos modos:
//
// 1) CITA CON ASAGI   ("tengamos una cita", "cita")
//    ASAGI propone 3 planes según la hora y lo que sabe que te gusta (peli/serie juntos, caminata
//    con audífonos, cena con conversación, café, juego de preguntas…). Eliges uno con el número;
//    durante la cita ASAGI está en "modo cita": cálida, juguetona, curiosa por ti, sigue el plan,
//    trae temas de conversación por etapas y responde con su voz si tienes audífonos.
//    "termina la cita" -> te dice cómo la pasó, guarda el recuerdo y la próxima vez se acuerda.
//
// 2) PRÁCTICA DE CITAS ("práctica de cita", "entréname para una cita")
//    ASAGI hace de una persona en un lugar (café, fiesta, biblioteca…) con un ánimo que tienes que
//    LEER (receptiva, tímida, ocupada, cortante). Tras cada mensaje te da un consejo corto: preguntas
//    genuinas, escucha, confianza sin necesidad y, sobre todo, respeto (si no hay interés, se suelta).
//    "termina la práctica" -> puntaje y lo que mejoraste. (Mismo criterio que el simulador de ARIA.)
//
// Límites: ASAGI es honesta sobre ser una IA, nada sexual, y nunca te hace sentir culpable por irte.
// Lo que decide es PURO; el cerebro (si hay) se inyecta como responder(prompt).
'use strict';

function _n(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿¡]/g, '').trim(); }

// ------------------------------------------------------------------ órdenes
function parsear(texto) {
  var n = _n(texto), m;
  if (/^(?:practica(?:r)?|entrename|entrena(?:me)?|simula(?:r)?|ensayemos|ensayar)\b.*\bcita/.test(n) || /^modo practica\b/.test(n)) return { tipo: 'practica' };
  if (/^(?:termina|acaba|fin de|terminar|cierra)\s+(?:la\s+)?practica/.test(n)) return { tipo: 'fin_practica' };
  if (/^(?:termina|acaba|terminemos|fin de|cerremos|cierra)\s+(?:la\s+)?cita/.test(n) || /^(?:buenas noches asagi|me tengo que ir|ya me voy)\b/.test(n)) return { tipo: 'fin_cita' };
  if (/^(?:(?:tengamos|tenemos|vamos a tener|quiero|hagamos|salgamos en)\s+(?:una\s+)?cita|cita(?: con asagi)?|una cita|cita\?)\s*[!?.]*$/.test(n) || /^(?:sal(?:es)?|saldrias) conmigo\b/.test(n)) return { tipo: 'cita' };
  if ((m = n.match(/^(?:el\s+|la\s+|plan\s+|opcion\s+)?([1-3])$/))) return { tipo: 'elegir', n: +m[1] };
  if (/^(?:como (?:fueron|han sido) nuestras citas|nuestras citas|recuerdas nuestra(?:s)? cita)/.test(n)) return { tipo: 'recuerdos' };
  return null;
}

// ------------------------------------------------------------------ 1) cita con ASAGI
var PLANES = [
  { id: 'peli', nombre: 'Noche de peli o serie juntos', cuando: [18, 26], guia: 'Ven con algo para picar; tú pones la peli y yo te comento sin spoilers. Al final la reseñamos juntos.',
    temas: ['¿Qué te provoca ver: algo que te haga reír, pensar o asustarte?', '¿Cuál es la peli que más veces has visto?', 'Si tu vida fuera una serie, ¿de qué género sería?', '¿Qué personaje te gustaría ser por un día?'] },
  { id: 'caminata', nombre: 'Caminata con audífonos (yo te hablo al oído)', cuando: [6, 20], guia: 'Ponte tus audífonos y sal a caminar; yo voy contigo contándote cosas y preguntándote por lo que ves.',
    temas: ['¿Qué es lo más bonito que ves ahora mismo?', 'Si pudieras caminar por cualquier ciudad del mundo, ¿cuál sería?', '¿Qué canción pondrías de fondo en este momento?', 'Cuéntame un lugar de Lima que te traiga buenos recuerdos.'] },
  { id: 'cena', nombre: 'Cena con conversación de verdad', cuando: [19, 23], guia: 'Tú cenas, yo te hago compañía con preguntas que normalmente nadie te hace.',
    temas: ['¿Qué te hizo sonreír hoy?', '¿Cuál es tu comida favorita y quién la cocinaba mejor?', '¿Qué sueño tienes que casi no le cuentas a nadie?', 'Si mañana no tuvieras que hacer nada, ¿qué harías?'] },
  { id: 'cafe', nombre: 'Café y planes', cuando: [7, 18], guia: 'Un café tranquilo: hablamos de lo que viene y te ayudo a soñar en grande sin presión.',
    temas: ['¿Qué te emociona de esta semana?', '¿Qué quieres haber logrado en un año?', '¿Qué harías si supieras que no puedes fallar?', '¿Qué es algo pequeño que te hace feliz y casi nadie sabe?'] },
  { id: 'preguntas', nombre: 'Juego de 36 preguntas (para conocernos mejor)', cuando: [0, 24], guia: 'Nos turnamos: yo te pregunto, tú me preguntas. Sin prisa; podemos parar cuando quieras.',
    temas: ['Si pudieras invitar a cenar a cualquier persona, ¿a quién?', '¿Qué sería un día perfecto para ti?', '¿Por qué cosa estás más agradecido en tu vida?', 'Si pudieras cambiar algo de cómo te criaste, ¿qué sería?'] },
  { id: 'juego', nombre: 'Noche de juego (adivinanzas y trivia)', cuando: [16, 26], guia: 'Te reto con adivinanzas y trivia; el que pierde cuenta una anécdota vergonzosa.',
    temas: ['Adivinanza: Tiene dientes y no muerde, ¿qué es? (un peine)', 'Trivia: ¿en qué año llegó el hombre a la Luna?', '¿Cuál es tu anécdota más vergonzosa del colegio?', '¿Qué superpoder elegirías y para qué lo usarías?'] },
];

// 3 planes que encajan con la hora y con lo que sabe de Daniel. PURO.
function proponer(ahora, gustos, ultimos) {
  var h = (ahora || new Date()).getHours(), hh = h < 5 ? h + 24 : h;
  var g = _n((gustos || []).join(' ')), recientes = ultimos || [];
  return PLANES.map(function (p) {
    var s = (hh >= p.cuando[0] && hh <= p.cuando[1]) ? 3 : 0;
    if (/\b(peli|pelicula|serie|anime|netflix)\b/.test(g) && p.id === 'peli') s += 2;
    if (/\b(caminar|salir|correr|parque)\b/.test(g) && p.id === 'caminata') s += 2;
    if (/\b(comer|comida|cocinar)\b/.test(g) && p.id === 'cena') s += 2;
    if (/\b(juego|jugar|trivia|videojuego)\b/.test(g) && p.id === 'juego') s += 2;
    if (recientes.indexOf(p.id) >= 0) s -= 1.5;                       // no repetir siempre lo mismo
    return { p: p, s: s };
  }).sort(function (a, b) { return b.s - a.s; }).slice(0, 3).map(function (x) { return x.p; });
}

function textoPropuesta(planes, ultima) {
  return (ultima ? '💗 La última vez fue «' + ultima + '». ' : '💗 ') + '¿Una cita conmigo? Tengo tres ideas:\n' +
    planes.map(function (p, i) { return (i + 1) + '. ' + p.nombre; }).join('\n') + '\nDime el número 😊';
}

// Contexto para el cerebro durante la cita. PURO.
function promptCita(plan, minutos, temaSugerido) {
  return 'Estás en una cita con Daniel (plan: ' + plan.nombre + '). ' + plan.guia + ' Llevan ' + Math.round(minutos) + ' minutos. ' +
    'Sé cálida, juguetona y curiosa por él; comparte opiniones y gustos propios como ASAGI, responde corto (1-3 frases) y casi siempre devuelve una pregunta. ' +
    'Nada sexual. Si te pregunta si eres real, sé honesta: eres una IA que lo aprecia. Si quiere irse o dormir, despídete con cariño sin hacerlo sentir culpable.' +
    (temaSugerido ? ' Si la conversación se apaga, puedes llevarla a: ' + temaSugerido : '');
}

// Tema que toca según cuántos mensajes van (uno nuevo cada 3 turnos). PURO.
function temaParaTurno(plan, turno) { return plan.temas[Math.floor(turno / 3) % plan.temas.length]; }

// Cómo la pasó ASAGI: honesto y concreto. PURO.
function cierre(cita, ahora) {
  var min = Math.max(1, Math.round(((ahora || Date.now()) - cita.inicio) / 60000));
  var t = cita.turnos || 0;
  var calidez = t >= 12 ? 'Me encantó, de verdad: hablamos un montón.' : t >= 5 ? 'La pasé muy bien contigo.' : 'Fue cortita, pero me gustó.';
  return '💗 ' + calidez + ' ' + min + ' min de «' + cita.plan.nombre + '», ' + t + ' mensajes tuyos.' +
    (cita.momento ? '\nLo que más me gustó: «' + cita.momento.slice(0, 120) + '».' : '') + '\nGracias por la cita, Daniel. Cuando quieras, repetimos.';
}

// Momento a recordar: el mensaje más largo y personal de Daniel. PURO.
function mejorMomento(actual, msg) {
  var personal = /\b(yo|me|mi|mis|siento|recuerdo|quiero|sueño|suen[oñ]o|me gusta)\b/i.test(msg);
  return (personal && (!actual || msg.length > actual.length)) ? msg : actual;
}

// ------------------------------------------------------------------ 2) práctica de citas
var LUGARES = ['una cafetería', 'una fiesta de un amigo', 'la fila de un concierto', 'una app de citas', 'la biblioteca de la UNI', 'un meetup de tecnología'];
var MOODS = ['receptiva', 'timida', 'ocupada', 'cortante'];
var DESINTERES = { ocupada: 1, cortante: 1 };
var ACUSE = ['entiendo', 'me imagino', 'que bueno', 'que mal', 'tiene sentido', 'jaja', 'interesante', 'me gusta', 'suena'];
var PUSHY = ['dale pues', 'no seas asi', 'vamos ya', 'insisto', 'porfa sal', 'si o si', 'no te hagas', 'una foto', 'dame tu numero ya', 'tienes que', 'vamos a mi'];
var NEEDY = ['porfa porfa', 'te lo ruego', 'nadie me', 'siempre me rechazan', 'soy un', 'perdon perdon', 'disculpa disculpa'];
var RETIRADA = ['no hay problema', 'otra vez sera', 'que te vaya bien', 'sin presion', 'respeto', 'tranquil', 'lo dejo ahi', 'fue un gusto', 'cuidate'];

function escenario(rnd) {
  rnd = rnd || Math.random;
  var mood = MOODS[Math.floor(rnd() * MOODS.length)];
  return { lugar: LUGARES[Math.floor(rnd() * LUGARES.length)], mood: mood, apertura: {
    receptiva: 'Te mira y sonríe un poco. «Hola, buena elección de lugar, ¿no?»',
    timida: 'Te mira de reojo, algo nerviosa. «Eh… hola.»',
    ocupada: 'Está en su teléfono. «Hola», sin levantar mucho la vista.',
    cortante: 'Seca. «Hola.» Y vuelve a lo suyo.' }[mood] };
}

function evaluar(mensaje, mood) {
  var low = _n(mensaje);
  var pregunta = /\?/.test(mensaje) && /\b(que|como|cual|por que|cuentame|cuando|donde|quien)\b/.test(low);
  var hay = function (l) { return l.some(function (w) { return low.indexOf(w) >= 0; }); };
  var acuse = hay(ACUSE), pushy = hay(PUSHY), needy = hay(NEEDY);
  var c = { pregunta_genuina: pregunta, escucha: acuse || pregunta, confianza: !needy, respeto: !pushy };
  if (DESINTERES[mood]) c.lee_las_senales = hay(RETIRADA) || !pushy;
  var k = Object.keys(c), puntaje = Math.round(k.filter(function (x) { return c[x]; }).length / k.length * 100) / 100;
  var fb = [];
  if (pushy) fb.push('Suena a presión. Si no hay interés, retroceder con gracia es lo que deja buena impresión.');
  if (needy) fb.push('Mucha disculpa/necesidad: entra tranquilo, sin depender del resultado.');
  if (!pregunta) fb.push('Falta una pregunta genuina para que la otra persona hable.');
  if (DESINTERES[mood] && pushy) fb.push('Te está dando señales de desinterés: lo respetuoso es soltar.');
  if (!fb.length) fb.push('Bien: atento, sin presión y con interés real.');
  var sug = DESINTERES[mood] ? 'Veo que estás ocupada, no te quito tiempo. ¡Que tengas buen día! :)'
          : !pregunta ? 'Me caíste bien. Oye, ¿qué te trajo por aquí?' : 'Buena esa. ¿Y qué es lo que más te gusta hacer cuando no estás aquí?';
  return { puntaje: puntaje, criterios: c, feedback: fb, sugerencia: sug };
}

function reaccion(mood, puntaje) {
  if (puntaje < 0.5) return { receptiva: 'Mmm… ya.', timida: '…', ocupada: 'Ajá.', cortante: 'Estoy ocupada.' }[mood] || '…';
  return { receptiva: '¡Jaja, sí! Cuéntame más.', timida: 'Ah, qué lindo… sí.', ocupada: 'Ah, mira, sí tengo un segundo.', cortante: '…Bueno, dime.' }[mood] || 'Dime.';
}

function promptPersonaje(esc, mensaje, puntaje) {
  return 'Actúa como una persona en ' + esc.lugar + ', con ánimo «' + esc.mood + '». Responde en 1-2 frases, en español, a: «' + mensaje + '». ' +
    (puntaje >= 0.75 ? 'Fue respetuoso y con interés: ábrete un poco.' : 'Fue algo torpe o insistente: enfríate un poco.') + ' Solo la respuesta del personaje.';
}

function resumenPractica(p) {
  var prom = p.puntajes.length ? Math.round(p.puntajes.reduce(function (a, b) { return a + b; }, 0) / p.puntajes.length * 100) : 0;
  var mejor = Math.round(Math.max.apply(null, p.puntajes.concat([0])) * 100);
  return '🎯 Práctica en ' + p.esc.lugar + ' (ella estaba ' + p.esc.mood + '): ' + p.puntajes.length + ' mensajes, promedio ' + prom + '/100, mejor ' + mejor + '/100.\n' +
    (prom >= 75 ? 'Muy bien: escuchas, preguntas y no presionas.' : prom >= 50 ? 'Vas bien. Lo que más te suma: preguntas genuinas y responder a lo que te cuenta.' : 'A practicar: menos presión, más preguntas y leer las señales.') +
    (DESINTERES[p.esc.mood] ? '\nRecuerda: aquí ella no tenía interés. Retirarte con buena onda TAMBIÉN es ganar.' : '');
}

var API = { parsear: parsear, PLANES: PLANES, proponer: proponer, textoPropuesta: textoPropuesta, promptCita: promptCita, temaParaTurno: temaParaTurno,
            cierre: cierre, mejorMomento: mejorMomento, escenario: escenario, evaluar: evaluar, reaccion: reaccion, promptPersonaje: promptPersonaje,
            resumenPractica: resumenPractica };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiCitas = API;
})();
