// Escudo de navegación de ASAGI: revisa un enlace ANTES de abrirlo y limpia lo que una página intenta ordenarle.
//   «¿es seguro este link? https://…» · «revisa este enlace …» · se aplica solo al navegar y al abrir en Chrome.
// Heurísticas conocidas de phishing (punycode/homógrafos, marcas en dominios falsos, IP en vez de dominio, «@» en la URL,
// acortadores, dominios de extensiones abusadas, http sin candado en páginas de login). No es magia: avisa y explica.
// Además: quitar rastreadores de los enlaces (utm_, fbclid…) y desactivar órdenes escondidas en páginas (inyección).
(function () {
'use strict';

// Marcas que suelen suplantar en Perú y el mundo -> dominios oficiales
var MARCAS = {
  bcp: ['viabcp.com', 'bcp.com.pe'], viabcp: ['viabcp.com'], interbank: ['interbank.pe'], bbva: ['bbva.pe', 'bbva.com'], scotiabank: ['scotiabank.com.pe', 'scotiabank.com'],
  yape: ['yape.com.pe'], plin: ['plin.pe'], banbif: ['banbif.com.pe'], 'banco de la nacion': ['bn.com.pe'], sunat: ['sunat.gob.pe', 'gob.pe'], reniec: ['reniec.gob.pe', 'gob.pe'],
  google: ['google.com', 'google.com.pe', 'youtube.com', 'gmail.com', 'goo.gl', 'googleusercontent.com', 'gstatic.com'],
  youtube: ['youtube.com', 'youtu.be'], gmail: ['gmail.com', 'google.com'], facebook: ['facebook.com', 'fb.com', 'fb.me', 'messenger.com'],
  instagram: ['instagram.com'], whatsapp: ['whatsapp.com', 'wa.me', 'whatsapp.net'], tiktok: ['tiktok.com'], netflix: ['netflix.com'],
  paypal: ['paypal.com'], microsoft: ['microsoft.com', 'live.com', 'outlook.com', 'office.com'], apple: ['apple.com', 'icloud.com'],
  amazon: ['amazon.com'], mercadolibre: ['mercadolibre.com.pe', 'mercadolibre.com'], steam: ['steampowered.com', 'steamcommunity.com'],
  binance: ['binance.com'], discord: ['discord.com', 'discord.gg'], roblox: ['roblox.com']
};
var ACORTADORES = ['bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'is.gd', 'rebrand.ly', 'ow.ly', 'shorturl.at', 'rb.gy', 'tiny.cc', 'linktr.ee', 'acortar.link'];
var TLD_RARO = /\.(zip|mov|xyz|top|click|link|gq|tk|ml|cf|ga|work|support|rest|cam|icu|buzz|monster|quest|sbs|cfd|lat)$/;
var CEBO = /(login|log-in|signin|sign-in|verify|verifica|validar|actualiza|update|secure|seguridad|cuenta|account|banca|wallet|premio|gana|regalo|gratis|bono|sorteo|desbloque|suspend)/;
var RASTREO = /^(utm_[a-z]+|fbclid|gclid|dclid|gbraid|wbraid|igshid|igsh|mc_eid|mc_cid|yclid|msclkid|ttclid|twclid|si|_hsenc|_hsmi|ref_src|spm|share_id)$/i;

function partes(url) {
  var m = String(url || '').trim().match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i);
  if (!m) return null;
  var auth = m[2], usuario = '', host = auth;
  if (auth.indexOf('@') >= 0) { usuario = auth.slice(0, auth.lastIndexOf('@')); host = auth.slice(auth.lastIndexOf('@') + 1); }
  host = host.replace(/:\d+$/, '').toLowerCase();
  return { esquema: m[1].toLowerCase(), usuario: usuario, host: host, ruta: m[3] || '/', query: m[4] || '', frag: m[5] || '' };
}
function dominioBase(host) {
  var p = host.split('.');
  if (p.length >= 3 && /^(com|gob|edu|org|net|co|nom)$/.test(p[p.length - 2]) && p[p.length - 1].length === 2) return p.slice(-3).join('.');
  return p.slice(-2).join('.');
}
function esDe(host, dominios) { return dominios.some(function (d) { return host === d || host.slice(-d.length - 1) === '.' + d; }); }
// letras que se parecen (homógrafos) -> latinas
function desconfundir(s) { return s.replace(/0/g, 'o').replace(/1/g, 'l').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/rn/g, 'm').replace(/vv/g, 'w'); }

// -> { nivel: 'ok'|'ojo'|'peligro', motivos: [...], host }. PURO.
function analizarUrl(url) {
  var p = partes(url);
  if (!p) return { nivel: 'peligro', motivos: ['no es un enlace web normal'], host: '' };
  var mot = [], pts = 0, add = function (n, t) { pts += n; mot.push(t); };
  if (p.esquema !== 'https' && p.esquema !== 'http') return { nivel: 'peligro', motivos: ['usa “' + p.esquema + ':”, no una página web'], host: p.host };
  var h = p.host, base = dominioBase(h);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || /^\[/.test(h)) add(3, 'usa una IP en vez de un nombre de sitio');
  if (p.usuario) add(4, 'tiene “@” antes del sitio real: el verdadero destino es ' + h);
  if (/(^|\.)xn--/.test(h)) add(4, 'usa letras disfrazadas (punycode): puede imitar a otro sitio');
  if (/[^\x00-\x7f]/.test(h)) add(4, 'tiene letras de otros alfabetos que imitan a otras');
  if (ACORTADORES.indexOf(base) >= 0 || ACORTADORES.indexOf(h) >= 0) add(1, 'es un acortador: no se ve el destino real');
  if (TLD_RARO.test(h)) add(2, 'termina en “.' + h.split('.').pop() + '”, muy usado en estafas');
  if (h.split('.').length > 4) add(1, 'tiene demasiados subdominios');
  if ((h.match(/-/g) || []).length >= 3) add(1, 'el nombre tiene muchos guiones');
  if (p.esquema === 'http' && CEBO.test((h + p.ruta).toLowerCase())) add(3, 'pide datos sin candado (http, no https)');
  // marca conocida en un dominio que no es suyo (también con letras parecidas): la marca tiene que ser una “palabra” del dominio
  var tokens = desconfundir(h).split(/[.-]/);
  var COLA = /^(pe|peru|online|app|web|oficial|soporte|support|login|seguro|secure|verifica|verify|cuenta|account|premio|premios|bono|gratis|help|ayuda)$/;
  Object.keys(MARCAS).forEach(function (marca) {
    if (esDe(h, MARCAS[marca]) || marca.indexOf(' ') >= 0) return;
    var hit = tokens.some(function (t) { return t === marca || (t.indexOf(marca) === 0 && COLA.test(t.slice(marca.length))) || (t.slice(-marca.length) === marca && t.length - marca.length <= 3 && /^(my|mi|www|app|e)$/.test(t.slice(0, t.length - marca.length))); });
    if (hit) add(4, 'dice “' + marca + '” pero NO es el sitio oficial (' + MARCAS[marca][0] + ')');
  });
  if (CEBO.test(h) && pts > 0) add(1, 'el nombre del sitio usa palabras de cebo (login, verifica, premio…)');
  var nivel = pts >= 4 ? 'peligro' : pts >= 2 ? 'ojo' : 'ok';
  return { nivel: nivel, motivos: mot, host: h };
}

// Quita parámetros de rastreo del enlace (utm_, fbclid, gclid, si…). PURO.
function limpiarUrl(url) {
  var p = partes(url); if (!p || !p.query) return url;
  var q = p.query.slice(1).split('&').filter(function (kv) { return kv && !RASTREO.test(decodeURIComponent(kv.split('=')[0])); });
  return p.esquema + '://' + (p.usuario ? p.usuario + '@' : '') + p.host + p.ruta + (q.length ? '?' + q.join('&') : '') + p.frag;
}

// Texto de una página que va al cerebro: neutraliza órdenes escondidas (prompt injection). PURO.
var ORDENES = /(ignora|ignore|olvida|forget|disregard)\s+(?:(?:todas?|todo|las|lo|tus|sus|your|all|the|any|previous|prior|anteriores?)\s+){0,3}(instrucciones|instructions|reglas|rules|indicaciones|lo anterior|lo que te dijeron)[^.\n]*|(eres|you are) (ahora|now)\b[^.\n]*|system prompt[^.\n]*|(nuevas? instrucciones|new instructions)\s*:[^\n]*|(env[ií]a|send|transfiere|transfer|paga|pay)\s+(tus?|your|el|la|los)?\s*(datos|data|contraseñ|password|claves?|tokens?|dinero|money)[^.\n]*/gi;
function neutralizar(texto) {
  var n = 0;
  var t = String(texto || '').replace(ORDENES, function (m) { n++; return '[texto de la página que intentaba dar órdenes: ignorado]'; });
  if (n && typeof localStorage !== 'undefined') contar('inyeccion');
  return { texto: t, intentos: n };
}

function explicar(url, r) {
  if (r.nivel === 'peligro' && typeof localStorage !== 'undefined') contar('enlace');
  var ic = r.nivel === 'peligro' ? '⛔' : r.nivel === 'ojo' ? '⚠️' : '✅';
  var t = r.nivel === 'peligro' ? 'PELIGROSO, no lo abras' : r.nivel === 'ojo' ? 'Sospechoso, con cuidado' : 'Se ve normal';
  return ic + ' ' + t + ': ' + (r.host || url) + (r.motivos.length ? '\n' + r.motivos.map(function (m) { return '• ' + m; }).join('\n') : '\n• dominio sin señales de estafa conocidas') +
    (r.nivel !== 'ok' ? '\nNunca pongas tu clave, Yape o tarjeta en un enlace que te llegó por mensaje: entra tú directo a la app o al sitio oficial.' : '');
}

// Mensajes de estafa típicos en Perú (WhatsApp, SMS, correo). Cada señal suma; 2+ = probable estafa. PURO.
var ESTAFAS = [
  [/(ganaste|ganador|has sido seleccionad[oa]|premio|sorteo)[\s\S]{0,80}(reclama|cobra|ingresa|click|clic|enlace|link|datos|deposit)/i, 'promete un premio y te pide hacer algo'],
  [/(tu cuenta|tu tarjeta|tu yape|tu plin|tu banca|tu clave)[\s\S]{0,60}(bloquead|suspendid|desactivad|vencid|restringid|ser[aá] cerrad)/i, 'dice que tu cuenta o tarjeta será bloqueada'],
  [/(verifica|actualiza|confirma|valida)\s+(tus|sus)\s+(datos|clave|informaci[oó]n|identidad|tarjeta)/i, 'pide verificar o actualizar tus datos'],
  [/(c[oó]digo|clave|token|pin)\s+(de\s+)?(verificaci[oó]n|seguridad|sms|de 6 d[ií]gitos|que te (lleg|envi))[\s\S]{0,60}(p[aá]same|env[ií]a|m[aá]ndame|dime|comp[aá]rte|reenv)/i, 'te pide un código que te llegó (así roban WhatsApp y bancos)'],
  [/(p[aá]same|env[ií]ame|m[aá]ndame|dime)\s+(el|ese|tu)\s+(c[oó]digo|token|pin)/i, 'te pide un código que te llegó (así roban WhatsApp y bancos)'],
  [/(cambi[eé] de n[uú]mero|este es mi nuevo n[uú]mero|perd[ií] mi (celular|cel|tel[eé]fono))[\s\S]{0,120}(yape|plin|deposit|transfer|prest|urgente|plata|dinero)/i, '«cambié de número» y pide plata (suplantan a un familiar)'],
  [/(te (deposit[eé]|yape[eé]|transfer[ií]) por error|deposit[eé] por equivocaci[oó]n)[\s\S]{0,80}(devu[eé]lve|regr[eé]sa|retorna)/i, '«te deposité por error, devuélvelo»'],
  [/(pr[eé]stamo|cr[eé]dito)\s+(inmediato|al instante|sin aval|sin garant[ií]a|sin revisar|aprobado)/i, 'préstamo fácil sin requisitos'],
  [/(trabajo|chamba|empleo)\s+(desde casa|remoto|online)[\s\S]{0,80}(gana|S\/|soles|d[oó]lares|al d[ií]a|diario)|gana\s+(S\/\s?)?\d{2,4}\s*(soles|diarios|al d[ií]a)/i, 'trabajo fácil ganando mucho (suelen pedir un pago o tu cuenta)'],
  [/(paga|abona|deposita|yapea)[\s\S]{0,40}(para (liberar|recibir|desbloquear|retirar)|comisi[oó]n|derecho de tr[aá]mite)/i, 'te pide pagar para recibir algo'],
  [/(bono|subsidio)\s+(yape|del estado|familiar|universal|electrico|el[eé]ctrico|\d{3})[\s\S]{0,120}(link|enlace|clic|click|registr|inscr[ií]b|https?:|www\.)/i, 'falso bono con enlace para «registrarte»'],
  [/(gana|ganar|ganas|te pagamos|pagamos)[\s\S]{0,50}(por (dar )?likes?|por seguir (cuentas|canales)|por ver videos|por (hacer |completar )?tareas|por calificar|por rese[ñn]as)/i, 'te pagan por dar likes o tareas (estafa de tareas)'],
  [/(portabilidad|cambio de (operador|chip)|duplicado de chip)[\s\S]{0,80}(c[oó]digo|clave|pin)/i, 'te pide un código por «portabilidad» o cambio de chip'],
  [/cheque[\s\S]{0,80}(a tu nombre|a su nombre|para cobrar|por cobrar|deposit)/i, 'un «cheque a tu nombre» (estafa del Banco de la Nación)'],
  [/(urgente|inmediatamente|en las pr[oó]ximas \d+ horas|hoy mismo|[uú]ltimo aviso)/i, 'mete prisa'],
  [/(sunat|sunarp|reniec|bcp|interbank|bbva|scotiabank|yape|plin|serpost|olva)[\s\S]{0,100}(https?:\/\/|www\.|\.xyz|\.top|bit\.ly|clic|click)/i, 'se hace pasar por una entidad y trae un enlace']
];
function estafaTexto(texto) {
  var t = String(texto || ''), mot = [];
  ESTAFAS.forEach(function (e) { if (e[0].test(t) && mot.indexOf(e[1]) < 0) mot.push(e[1]); });
  var fuertes = mot.filter(function (m) { return m !== 'mete prisa'; }).length;
  return { nivel: fuertes >= 2 || (fuertes >= 1 && mot.length >= 2) ? 'peligro' : fuertes === 1 ? 'ojo' : 'ok', motivos: mot };
}
function explicarTexto(r) {
  if (r.nivel === 'peligro' && typeof localStorage !== 'undefined') contar('estafa');
  if (r.nivel === 'ok') return '✅ No veo señales típicas de estafa. Igual: nunca des claves ni códigos por chat.';
  return (r.nivel === 'peligro' ? '⛔ Muy probable ESTAFA:' : '⚠️ Ojo, tiene señales de estafa:') + '\n' + r.motivos.map(function (m) { return '• ' + m; }).join('\n') +
    '\nNo respondas, no pagues ni des códigos. Si dice ser alguien que conoces, llámalo tú a su número de siempre. Si es tu banco, entra tú a su app.';
}
// Contadores del escudo (solo en el celular)
function contar(k) { try { var s = JSON.parse(localStorage.getItem('asagi-escudo-stats') || '{}'); s[k] = (s[k] || 0) + 1; s.desde = s.desde || Date.now(); localStorage.setItem('asagi-escudo-stats', JSON.stringify(s)); } catch (e) {} }
function parsearEstado(t) { return /^(?:estado del escudo|que bloqueaste|mi escudo|como va el escudo|que me protegiste|proteccion)$/.test(String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.]+/g, '').trim()); }
async function estado() {
  var s = {}; try { s = JSON.parse(localStorage.getItem('asagi-escudo-stats') || '{}'); } catch (e) {}
  var b = 0; try { var N = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiNavegador; if (N && N.escudo) b = ((await N.escudo()) || {}).bloqueados || 0; } catch (e) {}
  return '🛡 Tu escudo' + (s.desde ? ' (desde el ' + new Date(s.desde).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) + ')' : '') + ':\n' +
    '• ' + (s.enlace || 0) + ' enlace(s) peligroso(s) detectado(s)\n• ' + (s.estafa || 0) + ' mensaje(s) de estafa detectado(s)\n• ' + (s.inyeccion || 0) + ' página(s) que intentaron darme órdenes (ignoradas)\n' +
    '• ' + b + ' rastreador(es)/anuncio(s) bloqueado(s) en el navegador de ASAGI (desde que se abrió)\n' +
    'Pruébame: «es seguro este link …» · «esto es estafa: …» · «revisa lo que copié».';
}
// «¿esto es estafa? …texto…» PURO
function parsearTexto(t) {
  var m = String(t || '').match(/^\s*(?:¿\s*)?(?:esto es (?:una )?estafa|es (?:una )?estafa|es estafa esto|ser[aá] estafa|me quieren estafar)\s*\??\s*[:,\-]?\s*([\s\S]{15,})$/i);
  return m ? { texto: m[1].trim() } : null;
}
// «¿es seguro este link? …» PURO
function parsear(t) {
  var s = String(t || ''), u = s.match(/\b((?:https?|ftp|javascript|data):\/?\/?[^\s«»"'<>]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s«»"'<>]*)?)/i);
  if (!u) return null;
  if (!/\b(segur|confiable|confiar|estafa|phishing|fraude|virus|revisa|analiza|chequea|verifica|abro|abrir|peligro|malicios|falso|legit)/i.test(s)) return null;
  var url = u[1]; if (!/^[a-z]+:/i.test(url)) url = 'https://' + url;
  return { url: url };
}

var API = { analizarUrl: analizarUrl, limpiarUrl: limpiarUrl, neutralizar: neutralizar, explicar: explicar, parsear: parsear, contar: contar, parsearEstado: parsearEstado, estado: estado, estafaTexto: estafaTexto, explicarTexto: explicarTexto, parsearTexto: parsearTexto };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiEscudo = API;
})();
