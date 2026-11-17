// ASAGI sin cerebro: lo que resuelve SOLA, sin modelo, sin key y sin ARIA.
// Antes, sin cerebro respondía «He recibido tu mensaje… placeholder». Ahora entiende lo cotidiano:
// hora/fecha, cuentas, abrir apps, alarmas y temporizadores (Reloj de Android), llamar (abre el
// marcador, no llama sola), batería, buscar en la web, qué tengo hoy, estudiar/quiz (reusa los
// comandos de estudio), concentración, chistes y charla corta. Si no entiende, lo dice claro y
// sugiere qué sí puede, más cómo darle cerebro.
// entender() es PURO (testeable en Node); responder() usa el contexto que le pasa app.js.
(function () {
'use strict';

function _n(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!.,;]+/g, ' ').replace(/\s+/g, ' ').trim();
}
var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
var NUM = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cuarentaicinco: 45, media: 30, cuarto: 15 };

function _num(x) { if (x == null) return NaN; var k = String(x).trim(); return /^\d+$/.test(k) ? parseInt(k, 10) : (NUM[k] != null ? NUM[k] : NaN); }

function hora12(d) {
  var h = d.getHours() % 12 || 12, m = d.getMinutes();
  return h + ':' + (m < 10 ? '0' : '') + m + (d.getHours() < 12 ? ' a. m.' : ' p. m.');
}

// "a las 7", "7:30", "7 y media", "a las 6 de la tarde", "a las 19" -> {hora, minuto} 24 h. PURO.
function parsearHora(n) {
  var m = n.match(/(?:a las|para las|a la)?\s*(\d{1,2}|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)(?:\s*[:h]\s*(\d{2})|\s+y\s+(media|cuarto|\d{1,2}))?\s*(am|a m|de la manana|de la madrugada|pm|p m|de la tarde|de la noche)?/);
  if (!m) return null;
  var h = _num(m[1]); if (isNaN(h) || h > 23) return null;
  var mi = m[2] ? parseInt(m[2], 10) : (m[3] ? _num(m[3]) : 0);
  if (isNaN(mi) || mi > 59) return null;
  var suf = m[4] || '';
  if (/pm|p m|tarde|noche/.test(suf) && h < 12) h += 12;
  if (/am|a m|manana|madrugada/.test(suf) && h === 12) h = 0;
  return { hora: h, minuto: mi };
}

// "25 minutos", "media hora", "1 hora y 10", "90 segundos" -> segundos. PURO.
function parsearDuracion(n) {
  if (/\bmedia hora\b/.test(n)) return 1800;
  var s = 0, ok = false, m;
  if ((m = n.match(/(\d+|una|un|dos|tres)\s*(?:h|hora|horas)\b/))) { s += _num(m[1]) * 3600; ok = true; }
  if ((m = n.match(/(\d+|un|una|dos|tres|cinco|diez|quince|veinte|treinta|cuarenta)\s*(?:min|minuto|minutos)\b/))) { s += _num(m[1]) * 60; ok = true; }
  if ((m = n.match(/(\d+)\s*(?:s|seg|segundo|segundos)\b/))) { s += parseInt(m[1], 10); ok = true; }
  return ok && s > 0 ? s : null;
}

// Expresión matemática en lenguaje natural -> texto para AsagiPalette.calcular. PURO.
function aCuenta(n) {
  var t = n.replace(/^(?:cuanto es|cuanto da|calcula|calcular|resuelve|cuanto son)\s+/, '').replace(/^(?:la|el)\s+/, '');
  var m = t.match(/^raiz(?: cuadrada)? de (\d+(?:[.,]\d+)?)$/);
  if (m) return { raiz: parseFloat(m[1].replace(',', '.')) };
  m = t.match(/^(\d+(?:[.,]\d+)?) (?:al cuadrado|elevado a la 2)$/);
  if (m) return { expr: m[1] + '*' + m[1] };
  t = t.replace(/\bmas\b/g, '+').replace(/\bmenos\b/g, '-').replace(/\bpor\b(?! ciento)/g, '*').replace(/\b(?:entre|dividido(?: entre| por)?)\b/g, '/')
    .replace(/\bpor ciento\b/g, '%');
  if (/^[0-9+\-*/().,%\sdeof]+$/.test(t) && /\d/.test(t) && /[-+*/%]/.test(t)) return { expr: t };
  return null;
}

var CHISTES = [
  '¿Por qué el libro de matemáticas está triste? Porque tiene demasiados problemas.',
  '—¿Cuál es el colmo de un programador? —Que su esposa le diga «tenemos que hablar» y él responda «¿en qué lenguaje?».',
  'Hay 10 tipos de personas: las que entienden binario y las que no.',
  '—Mamá, en el colegio me dicen despistado. —Niño, tú vives al lado.',
  '¿Qué le dice un bit a otro? Nos vemos en el bus.',
  'Mi WiFi y yo tenemos algo en común: los dos perdemos la conexión cuando más importa.'
];

// El mismo trozo pero como lo escribió Daniel (con tildes y mayúsculas), si se puede. PURO.
function _orig(texto, frag) {
  var t = String(texto || '').trim().replace(/[¿?¡!.]+$/, '').trim();
  var cand = t.slice(Math.max(0, t.length - frag.length));
  return _n(cand) === frag ? cand : frag;
}

// Qué quiso decir. -> {tipo, ...} o null. PURO.
function entender(texto) {
  var n = _n(texto), m;
  if (!n) return null;
  if (/^(que (puedes|sabes) hacer|ayuda|help|comandos|que haces|para que sirves|que mas puedes hacer|en que me ayudas)$/.test(n)) return { tipo: 'ayuda' };
  if (/^(que hay de nuevo en asagi|novedades de asagi|que aprendiste|que cosas nuevas (puedes hacer|tienes)|que hay nuevo en asagi)$/.test(n)) return { tipo: 'ayuda', tema: 'nuevo' };
  if ((m = n.match(/^(?:ayuda (?:de |del |con |para |sobre )?|que puedes hacer (?:con|en|para) )(.{2,30})$/)) && temaAyuda(m[1])) return { tipo: 'ayuda', tema: temaAyuda(m[1]) };
  if (/^(que hora es|que horas son|dime la hora|hora)$/.test(n)) return { tipo: 'hora' };
  if (/^(que (dia|fecha) es( hoy)?|a cuanto estamos|que dia estamos|fecha de hoy|hoy que dia es)$/.test(n)) return { tipo: 'fecha' };
  if ((m = n.match(/^(?:pon(?:me)?|programa|crea|activa)\s+(?:una\s+)?alarma(?:\s+(?:para|a|de))?\s*(.*)$/)) || (m = n.match(/^despiertame\s*(.*)$/))) {
    var hh = parsearHora(m[1] || '');
    var msj = ((m[1] || '').match(/(?:para|que diga)\s+(.{3,40})$/) || [])[1] || '';
    return hh ? { tipo: 'alarma', hora: hh.hora, minuto: hh.minuto, mensaje: /^\d/.test(msj) ? '' : msj } : { tipo: 'alarma', falta: true };
  }
  if ((m = n.match(/^(?:pon(?:me)?|programa|inicia|activa)?\s*(?:un\s+)?(?:temporizador|timer|cronometro)\s*(?:de|por|para)?\s*(.*)$/))) {
    var d = parsearDuracion(m[1]); return d ? { tipo: 'temporizador', segundos: d } : { tipo: 'temporizador', falta: true };
  }
  if ((m = n.match(/^(?:modo )?(?:concentracion|enfoque|pomodoro|estudio)\s*(?:de|por)?\s*(.*)$/)) && !/^estudio de /.test(n)) {
    return { tipo: 'enfoque', segundos: parsearDuracion(m[1] || '') || 1500 };
  }
  if ((m = n.match(/^(?:llama|llamar|marca|marcale|telefonea)\s+(?:a\s+)?(.+)$/))) {
    var num = m[1].replace(/\s/g, '');
    return /^\+?\d{6,15}$/.test(num) ? { tipo: 'marcar', numero: num } : { tipo: 'marcar', quien: _orig(texto, m[1]) };
  }
  if ((m = n.match(/^(?:abre|abrir|abreme|lanza|inicia|ejecuta|entra a|ve a)\s+(?:la app\s+(?:de\s+)?|el\s+|la\s+)?(.{2,40})$/))) return { tipo: 'abrir', app: _orig(texto, m[1]) };
  if ((m = n.match(/^(?:apaga|prende|enciende|activa|desactiva|quita|pon)\s+(?:el\s+|la\s+)?(wifi|wi fi|bluetooth|bt|datos|modo avion|linterna|ubicacion)$/))) {
    var cual = m[1].replace('wi fi', 'wifi').replace(/^bt$/, 'bluetooth');
    return { tipo: 'panel', que: cual, encender: !/^(apaga|desactiva|quita)/.test(n) };
  }
  if (/^(cuanta bateria( tengo| me queda)?|bateria|nivel de bateria|como esta (la|mi) bateria)$/.test(n)) return { tipo: 'bateria' };
  if ((m = n.match(/^(?:busca(?:me)?|buscar|googlea|investiga en internet)\s+(?:en (?:internet|google|la web)\s+)?(.{2,120})$/))) return { tipo: 'buscar', texto: _orig(texto, m[1]) };
  if (/^(que tengo (para )?hoy|mis pendientes de hoy|que hay para hoy|agenda de hoy|que tengo pendiente|mis pendientes|pendientes|cuantos pendientes tengo|tengo pendientes|que tengo que hacer( hoy)?|que me toca( hoy)?|que me falta hacer|ver (mis )?pendientes)$/.test(n)) return { tipo: 'hoy' };
  if ((m = n.match(/^(?:quiz|examen|preguntas|repaso)\s+(?:de|sobre)\s+(.{2,60})$/))) return { tipo: 'reescribir', texto: 'pregúntame sobre ' + _orig(texto, m[1]) };
  if ((m = n.match(/^(?:estudiemos|vamos a estudiar|quiero estudiar|ensename|explicame lo basico de)\s+(.{2,60})$/))) return { tipo: 'reescribir', texto: 'estudia sobre ' + _orig(texto, m[1]) };
  var c = aCuenta(n); if (c) return { tipo: 'cuenta', cuenta: c, original: texto };
  // solo pedidos de práctica («mi examen de la UNI es en agosto» es un dato, no un pedido)
  if (/^(?:ayudame|preparame|practiquemos|estudiemos|repasemos|quiero (?:estudiar|practicar|prepararme)|vamos a (?:estudiar|practicar))\b.*\b(?:uni|admision)\b/.test(n)) return { tipo: 'uni' };
  if (/^(cuentame|dime|cuentate) (un )?chiste|^chiste$/.test(n)) return { tipo: 'chiste' };
  if ((m = n.match(/^traduce(?:me)?\s+(.+)$/))) return { tipo: 'traducir', texto: _orig(texto, m[1]) };
  if (/^(como estas|que tal|como te va|como andas|todo bien)$/.test(n)) return { tipo: 'charla', clave: 'estado' };
  if (/^(oe|oye|ey|hey|hola|habla|que fue|q fue|holi|buenas)?( asagi)?$/.test(n) && n) return { tipo: 'charla', clave: 'hola' };
  if (/^(gracias|grax|thanks|thank you)( (causa|pe|bro|hermano|hermana|asagi|amiga|mano|crack))+$/.test(n)) return { tipo: 'charla', clave: 'gracias' };
  if (/^(ja){2,}j?a?$|^je(je)+$|^xd+$|^lol$/.test(n)) return { tipo: 'charla', clave: 'risa' };
  if (/^(ok|okey|okay|oki|listo|ya|dale|bueno|perfecto|genial|chevere|bacan|de acuerdo|entendido|vale|si|no|ya ya|ah ok|aja)$/.test(n)) return { tipo: 'charla', clave: 'ack' };
  if ((m = n.match(/^(?:manda(?:le)?|envia(?:le)?|escribe(?:le)?)\s+(?:un\s+)?(?:whatsapp|wsp|wasap|mensaje(?: de whatsapp)?)(?:\s+(?:a|para)\s+(.{2,40}))?$/))) return { tipo: 'abrir', app: 'WhatsApp', nota: '✍ Elige' + (m[1] ? ' a ' + _orig(texto, m[1]) : ' el chat') + ' y escribe tú: yo no envío mensajes sola.' };
  if (/^(?:toma(?:me)?|saca(?:me)?)\s+(?:una\s+)?(?:foto|selfie|fotografia)$|^(?:abre|abrir)\s+(?:la\s+)?camara$/.test(n)) return { tipo: 'abrir', app: 'Cámara|Camera' };
  if ((m = n.match(/^(?:como (?:llego|voy|se llega)|llevame|ruta|direcciones?) (?:a|al|a la|hasta|para) (.{2,60})$/))) return { tipo: 'ruta', a: _orig(texto, m[1]) };
  if (/^(gracias|muchas gracias|grax|thanks|te pasaste|eres lo maximo)$/.test(n)) return { tipo: 'charla', clave: 'gracias' };
  if (/^(buenas noches|me voy a dormir|a dormir|hasta manana)$/.test(n)) return { tipo: 'charla', clave: 'noches' };
  if (/^(buenos dias|buen dia)$/.test(n)) return { tipo: 'charla', clave: 'dias' };
  if (/^(estoy aburrido|me aburro|que hago|no se que hacer|tengo tiempo libre|estoy libre|que hago ahora)$/.test(n)) return { tipo: 'charla', clave: 'aburrido' };
  if (/^(estoy (cansado|estresado|triste|mal)|me siento (mal|triste|cansado))$/.test(n)) return { tipo: 'charla', clave: 'animo' };
  return null;
}

var AYUDA = {
  dia: ['📅 Tu día', ['qué tengo hoy', 'recuérdame … mañana a las 8', 'ya pagué internet', 'resumen del día', 'pon una alarma a las 7', 'temporizador de 10 minutos', 'modo concentración 25 minutos', 'agrega pan y leche a la lista', 'mi lista de compras']],
  celular: ['📱 Tu celular', ['hablemos', 'abre YouTube', 'llama a 987654321', 'cuánta batería tengo', 'enciende la linterna', 'sube el volumen', 'pon música', 'pon canciones de Soda Stereo', 'apaga la música en 30 minutos', 'qué notificaciones tengo', 'cuánto gasté esta semana']],
  cuentas: ['🧮 Cuentas', ['cuánto es 15% de 230', 'raíz de 144', 'convierte 50 dólares a soles', 'convierte 10 km a millas', '30 grados a fahrenheit', 'cuenta de 150 con 10% de propina entre 3', 'qué día será en 45 días', 'cuánto falta para navidad']],
  info: ['🌎 Información', ['cómo va el clima', 'clima en Arequipa', 'qué hora es en Japón', 'traduce buenos días al inglés', 'qué significa awesome', 'wiki fotosíntesis', 'busca recetas de lomo saltado', 'dato curioso']],
  ti: ['🧠 Sobre ti', ['recuerda que mi cumpleaños es el 13 de mayo', 'qué sabes de mí', 'dónde anoté lo del examen', 'busca en mis cosas internet', 'cuándo es mi cumpleaños', 'olvida …', 'me llamo …']],
  estudio: ['📚 Estudio', ['estudiemos física', 'quiz de química', 'ayúdame a estudiar para la UNI', 'táctica del día', 'práctica de cita']],
  redes: ['📺 YouTube y redes', ['qué hay nuevo en YouTube', 'qué veo hoy', 'mis videos para después', 'sigue el canal …', 'importa mis canales de YouTube', 'mis suscripciones', 'resume este video …', 'busca en youtube …', 'resumen de mis redes', 'qué me llegó de Instagram', 'qué hay en mi Instagram', 'abre YouTube en Chrome']],
  escudo: ['🛡 Protección', ['estado del escudo', 'revisa lo que copié', 'esto es estafa: …texto…', 'es seguro este link …', 'revisa este enlace …']],
  web: ['🌐 Navegar', ['crea una receta dolar: de https://… saca compra y venta', 'mis recetas', 'explora …', 'qué es tendencia en Perú', 'busca … en Chrome', 'compara precios de …', 'vigila esta página https://…', 'qué páginas vigilas', 'resume este enlace …', 'qué leí', 'abre … en Chrome', 'ábrela en Chrome', 'investiga …', 'busca en la web …']],
  juegos: ['🎲 Para pasar el rato', ['cuéntame un chiste', 'lanza una moneda', 'tira un dado', 'elige entre pizza y pollo', 'personajes', 'fondo de lluvia']],
  avanzado: ['⚙ Avanzado', ['investiga qué piden para postular a la UNI', 'hazlo tú: organiza mi día', 'detén el modo autónomo', 'aprende buenos días: clima; mis gastos hoy', 'mis habilidades', 'revisa mi correo', 'crea una web de …', 'claude: …']]
};
// Lo último que aprendió (no sale en el índice; «qué hay de nuevo en ASAGI»)
var NUEVO = ['✨ Lo nuevo', ['editor', 'mis recetas', 'enlace usb', 'crea una guía sobre …', 'hazme una checklist para …', 'crea un quiz de …', 'mis creaciones', 'dame ideas para …', 'sorpréndeme', 'qué hiciste sola', 'qué aprendiste de tus errores', 'explora agujeros negros', 'qué es tendencia en Perú', 'investiga a fondo …', 'busca dólar hoy en Chrome', 'qué veo hoy', 'compara precios de audífonos JBL', 'vigila esta página https://…', 'estado del escudo', 'revisa lo que copié', 'esto es estafa: …texto…', 'resumen de mis redes', 'importa mis canales de YouTube']];
var AYUDA_NOMBRE = { dia: 'de mi día', celular: 'del celular', cuentas: 'de cuentas', info: 'de información', ti: 'de memoria', estudio: 'de estudio', redes: 'de YouTube y redes', escudo: 'de protección', web: 'de navegar', juegos: 'de juegos', avanzado: 'avanzada' };
var AYUDA_ALIAS = { web: /naveg|web|internet|precio|compra|pagina/, redes: /redes|youtube|instagram|tiktok|social|chrome|video/, escudo: /protec|seguridad|escudo|estafa|link|enlace/, dia: /dia|agenda|pendiente|organiz|alarma|compra/, celular: /celular|telefono|movil|app|musica|notific|gasto/, cuentas: /cuenta|calcul|matemat|convers|plata|dinero|cambio/,
  info: /info|clima|tiempo|wiki|busca|noticia/, ti: /\bmi\b|memoria|recuerd|sobre mi|ti\b/, estudio: /estudi|uni\b|examen|aprend/, juegos: /jueg|divert|aburr|rato/, avanzado: /avanzad|autonom|aria|web|claude|habilidad/ };
function temaAyuda(t) { var n = _n(t); for (var k in AYUDA_ALIAS) if (AYUDA_ALIAS[k].test(n)) return k; return null; }
// Sin tema: un índice corto. Con tema: sus frases (se pueden tocar en el chat).
function ayudaTexto(tema, conCerebro) {
  if (tema === 'nuevo') return NUEVO[0] + ' — toca una para probarla:\n' + NUEVO[1].map(function (f) { return '• «' + f + '»'; }).join('\n') +
    '\nY desde cualquier app: Compartir → ASAGI (videos, links, publicaciones de Instagram/TikTok, textos) y te digo de qué trata o si es estafa.';
  if (tema && AYUDA[tema]) return AYUDA[tema][0] + ' — toca una para usarla:\n' + AYUDA[tema][1].map(function (f) { return '• «' + f + '»'; }).join('\n');
  return 'Puedo ayudarte con esto (toca un tema):\n' +
    Object.keys(AYUDA).map(function (k) { return AYUDA[k][0].split(' ')[0] + ' «ayuda ' + (AYUDA_NOMBRE[k] || 'de ' + k) + '»'; }).join('\n') +
    (conCerebro ? '\nY de cualquier otra cosa, pregúntame normal: pienso, uso mis herramientas y te respondo.' : '\nPara charlar de todo: descarga mi modelo o pon una key gratis de Gemini en Ajustes.');
}

function charla(clave, ahora) {
  var h = ahora.getHours();
  var R = {
    estado: ['Bien, atenta a lo tuyo. ¿Qué hacemos?', 'Con energía. ¿Algo pendiente que quieras sacar ya?'],
    gracias: ['De nada, Daniel.', 'Para eso estoy.', 'Cuando quieras.'],
    noches: [h < 18 ? '¿Ya? Son las ' + hora12(ahora) + ' Igual, descansa bien.' : 'Buenas noches, Daniel. Mañana te ordeno el día.'],
    dias: ['Buenos días, Daniel. Di «qué tengo hoy» y te digo lo pendiente.'],
    aburrido: ['Ideas rápidas: «quiz de matemáticas», «práctica de cita», «táctica del día» o «cuéntame un chiste».',
      '¿Exploramos algo? Di «explora …» (lo que quieras) o «qué veo hoy» y te recomiendo un video.',
      '¿Reto aceptado? Di «modo concentración 25 minutos» y avanzamos algo que tengas pendiente.'],
    hola: ['¡Hola, Daniel! ¿Qué hacemos?', '¡Aquí estoy! Dime.', '¿Qué fue, Daniel? ¿En qué te ayudo?'],
    risa: ['😄', '¡Jaja! 😄'],
    ack: ['👍', 'Listo. ¿Algo más?', 'Ok 👌'],
    animo: ['Lo siento. Respira lento un minuto; si quieres, cuéntame qué pasó. Y si es cansancio: 20 minutos de descanso valen oro.']
  };
  var l = R[clave] || ['…'];
  return l[Math.floor((ahora.getTime() / 1000) % l.length)];
}

function _durTxt(s) {
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sg = s % 60;
  return [h ? h + ' h' : '', m ? m + ' min' : '', sg ? sg + ' s' : ''].filter(Boolean).join(' ');
}

// -> Promise<{texto} | {reescribir} | null>. ctx: {ahora, calcular, apps, abrirApp, accion, pendientes, notificar}
async function responder(texto, ctx) {
  ctx = ctx || {};
  var ahora = ctx.ahora || new Date();
  var o = entender(texto);
  if (!o) return null;
  var acc = ctx.accion;
  switch (o.tipo) {
    case 'ayuda': return { texto: ayudaTexto(o.tema, ctx.conCerebro) };
    case 'hora': return { texto: 'Son las ' + hora12(ahora) };
    case 'fecha': return { texto: 'Hoy es ' + DIAS[ahora.getDay()] + ' ' + ahora.getDate() + ' de ' + MESES[ahora.getMonth()] + ' de ' + ahora.getFullYear() + '.' };
    case 'cuenta': {
      if (o.cuenta.raiz != null) { var r = Math.sqrt(o.cuenta.raiz); return { texto: '√' + o.cuenta.raiz + ' = ' + (Math.round(r * 1e6) / 1e6) }; }
      var c = ctx.calcular ? ctx.calcular(o.cuenta.expr) : null;
      return c ? { texto: o.cuenta.expr.replace(/\s+/g, ' ').trim() + ' ' + c.texto } : null;
    }
    case 'alarma':
      if (o.falta) return { texto: '¿A qué hora? Por ejemplo: «pon una alarma a las 6:30».' };
      if (!acc) return { texto: 'Las alarmas necesitan la app instalada (APK).' };
      var ra = await acc({ tipo: 'alarma', hora: o.hora, minuto: o.minuto, mensaje: o.mensaje || 'ASAGI' });
      var hd = new Date(ahora); hd.setHours(o.hora, o.minuto, 0, 0);
      return { texto: ra && ra.ok ? '⏰ Alarma puesta a las ' + hora12(hd) + ' en tu Reloj.' : '⚠ No pude poner la alarma: ' + ((ra && ra.error) || 'sin respuesta') };
    case 'temporizador':
      if (o.falta) return { texto: '¿De cuánto? Por ejemplo: «temporizador de 10 minutos».' };
      if (!acc) return { texto: 'El temporizador necesita la app instalada (APK).' };
      var rt = await acc({ tipo: 'temporizador', segundos: o.segundos, mensaje: 'ASAGI' });
      return { texto: rt && rt.ok ? '⏱ Temporizador de ' + _durTxt(o.segundos) + ' en marcha.' : '⚠ No pude: ' + ((rt && rt.error) || 'sin respuesta') };
    case 'enfoque': {
      var fin = new Date(ahora.getTime() + o.segundos * 1000);
      if (acc) { try { await acc({ tipo: 'temporizador', segundos: o.segundos, mensaje: 'Fin de concentración' }); } catch (e) {} }
      return { texto: '🎯 Modo concentración: ' + _durTxt(o.segundos) + ' (hasta las ' + hora12(fin) + '). Silencia el celular, una sola tarea. ' +
        (acc ? 'Te suena el temporizador al final.' : '') };
    }
    case 'marcar':
      if (!acc) return { texto: 'Para llamar necesito la app instalada (APK).' };
      if (o.numero) { var rm = await acc({ tipo: 'marcar', numero: o.numero }); return { texto: rm && rm.ok ? '📞 Te dejé el número ' + o.numero + ' listo en el marcador; toca llamar.' : '⚠ No pude abrir el marcador.' }; }
      await acc({ tipo: 'contactos' });
      return { texto: '📞 Aún no leo tus contactos sin cerebro; te abrí Contactos para que elijas a ' + o.quien + '. (También: «llama a 987654321».)' };
    case 'abrir': {
      var apps = ctx.apps || [], hit = null;
      o.app.split('|').some(function (nom) {
        var q = _n(nom);
        hit = apps.find(function (a) { return _n(a.label) === q; }) || apps.find(function (a) { return _n(a.label).indexOf(q) === 0; }) ||
          apps.find(function (a) { return _n(a.label).indexOf(q) >= 0; });
        return !!hit;
      });
      if (!hit) return { texto: apps.length ? 'No encuentro «' + o.app.split('|')[0] + '» entre tus apps.' : 'Abrir apps funciona en la app instalada (APK).' };
      if (ctx.abrirApp) await ctx.abrirApp(hit);
      return { texto: '↗ Abriendo ' + hit.label + '.' + (o.nota ? ' ' + o.nota : '') };
    }
    case 'bateria': {
      var rb = acc ? await acc({ tipo: 'bateria' }) : null;
      if (!rb || !rb.ok) {
        try { if (typeof navigator !== 'undefined' && navigator.getBattery) { var b = await navigator.getBattery(); rb = { ok: true, porcentaje: Math.round(b.level * 100), cargando: b.charging }; } } catch (e) {}
      }
      if (!rb || !rb.ok) return { texto: 'No puedo leer la batería aquí.' };
      return { texto: '🔋 ' + rb.porcentaje + '%' + (rb.cargando ? ', cargando' : '') + (rb.temperatura > 0 ? ' · ' + rb.temperatura + ' °C' : '') +
        (rb.porcentaje <= 15 && !rb.cargando ? '. Conéctalo pronto.' : '.') };
    }
    case 'buscar':
      if (acc) { var rs = await acc({ tipo: 'url', url: 'https://www.google.com/search?q=' + encodeURIComponent(o.texto) }); if (rs && rs.ok) return { texto: '🔎 Te abrí la búsqueda: ' + o.texto }; }
      return { texto: '🔎 Búscalo aquí: https://www.google.com/search?q=' + encodeURIComponent(o.texto) };
    case 'hoy': {
      var l = (ctx.pendientes || []).filter(function (p) { return !p.hecho; });
      var finDia = new Date(ahora); finDia.setHours(23, 59, 59, 999);
      var hoy = l.filter(function (p) { return p.cuando && p.cuando <= finDia.getTime(); }).sort(function (a, b) { return a.cuando - b.cuando; });
      var sin = l.filter(function (p) { return !p.cuando; });
      var luego = l.filter(function (p) { return p.cuando && p.cuando > finDia.getTime(); }).sort(function (a, b) { return a.cuando - b.cuando; });
      if (!hoy.length && !sin.length && !luego.length) return { texto: 'No tienes pendientes. Di «recuérdame … » para anotar algo.' };
      var out = [];
      if (!hoy.length) out.push('Para hoy no tienes nada con hora.');
      if (hoy.length) out.push('Hoy:\n' + hoy.map(function (p) { return '• ' + p.texto + ' — ' + (p.cuando < ahora.getTime() ? 'vencido' : hora12(new Date(p.cuando))); }).join('\n'));
      if (sin.length) out.push('Sin fecha:\n' + sin.slice(0, 6).map(function (p) { return '• ' + p.texto; }).join('\n'));
      if (luego.length) out.push('Próximos:\n' + luego.slice(0, 4).map(function (p) { var d = new Date(p.cuando);
        return '• ' + p.texto + ' — ' + DIAS[d.getDay()] + ' ' + d.getDate() + ', ' + hora12(d); }).join('\n'));
      return { texto: out.join('\n') };
    }
    case 'panel': {
      if (!acc) return { texto: 'Eso funciona en la app instalada (APK).' };
      if (o.que === 'linterna') {
        var rl = await acc({ tipo: 'linterna', encender: o.encender });
        return { texto: rl && rl.ok ? (o.encender ? '🔦 Linterna encendida. «apaga la linterna» para apagarla.' : '🔦 Linterna apagada.') : '⚠ ' + ((rl && rl.error) || 'No pude con la linterna.') };
      }
      var rp = await acc({ tipo: 'panel', que: o.que });
      var verbo = o.encender ? 'actívalo' : 'apágalo';
      return { texto: rp && rp.ok ? '⚙ Android no deja que una app ' + (o.encender ? 'lo encienda' : 'lo apague') + ' sola: te abrí el ajuste de ' + o.que + ', ' + verbo + ' con un toque.'
        : '⚠ No pude abrir el ajuste de ' + o.que + '.' };
    }
    case 'ruta': {
      var url = 'https://www.google.com/maps/dir/?api=1&travelmode=transit&destination=' + encodeURIComponent(o.a + ', Lima, Perú');
      if (acc) { var rr = await acc({ tipo: 'url', url: url }); if (rr && rr.ok) return { texto: '🗺 Te abrí la ruta a ' + o.a + ' en Maps (en transporte público; puedes cambiarlo a auto o a pie).' }; }
      return { texto: '🗺 Ruta a ' + o.a + ': ' + url };
    }
    case 'reescribir': return { reescribir: o.texto };
    case 'uni': return { reescribir: 'pregúntame sobre ' + (/fisica/.test(_n(texto)) ? 'física' : /quimica/.test(_n(texto)) ? 'química' : 'razonamiento matemático') };
    case 'chiste': return { texto: CHISTES[Math.floor(Math.random() * CHISTES.length)] };
    case 'traducir': return /\b(?:al?|en) (?:ingl[eé]s|espa[nñ]ol|franc[eé]s|portugu[eé]s|italiano|alem[aá]n|japon[eé]s|chino|coreano|ruso|quechua)$/i.test(o.texto)
      ? { texto: '🌐 Prueba: https://translate.google.com/?sl=auto&tl=es&text=' + encodeURIComponent(o.texto) }
      : { reescribir: 'traduce ' + o.texto + ' al inglés' };
    case 'charla': return { texto: charla(o.clave, ahora) };
  }
  return null;
}

function noEntendi(texto) {
  return 'Para eso necesito cerebro. Toca «conecta gemini» (gratis, 2 min) o descarga mi modelo en Ajustes. ' +
    'Mientras, mira «qué puedes hacer» sin cerebro.';
}

var API = { entender: entender, responder: responder, parsearHora: parsearHora, parsearDuracion: parsearDuracion, aCuenta: aCuenta,
  hora12: hora12, noEntendi: noEntendi, ayudaTexto: ayudaTexto, AYUDA: AYUDA };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiSinCerebro = API;
})();
