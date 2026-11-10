;(function () {
// ASAGI - Discord: ASAGI conversa en un canal (y puede hablar con ARIA, que ya
// tiene su puente en aria_discord.py). Solo SALE a internet (REST con sondeo):
// no abre puertos ni servidores. En el celular la peticion va por el HTTP nativo
// de Capacitor (sin CORS); en navegador/pruebas usa fetch.
//
// SEGURIDAD: lo que llega de Discord es TEXTO NO CONFIABLE. Solo se le pasa al
// cerebro para conversar; jamas ejecuta herramientas (nada de Termux/Nix aqui).
// Anti-bucle entre bots: a mensajes de otros bots solo contesta 1 cada 60 s y
// maximo 6 por hora. La logica de decision es PURA y testeable.

'use strict';

var API = 'https://discord.com/api/v10';
var MAX_TXT = 1900;
var BOT_COOLDOWN_MS = 60 * 1000;
var BOT_MAX_HORA = 6;
var ENTRADA_MAX = 1000;

function _norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Compara IDs (snowflakes) sin perder precision: por largo y luego lexico. PURO.
function cmpId(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// Si el mensaje va dirigido a ASAGI devuelve el texto limpio; si no, null. PURO.
//   "asagi hola" | "@asagi, hola" | "<@123> hola" (mencion al bot) | "asagi: ..."
function dirigidoA(contenido, yoId) {
  var t = String(contenido || '').trim();
  if (!t) return null;
  var m;
  if (yoId) {
    var re = new RegExp('^<@!?' + String(yoId).replace(/\D/g, '') + '>\\s*[,:]?\\s*([\\s\\S]*)$');
    m = re.exec(t);
    if (m) return m[1].trim().slice(0, ENTRADA_MAX) || null;
    var re2 = new RegExp('<@!?' + String(yoId).replace(/\D/g, '') + '>', 'g');
    if (re2.test(t)) return t.replace(re2, '').replace(/\s+/g, ' ').trim().slice(0, ENTRADA_MAX) || null;
  }
  m = /^@?asagi\b\s*[,:;\-]?\s*([\s\S]*)$/i.exec(_norm(t) === t.toLowerCase() ? t : t);
  if (m) return m[1].trim().slice(0, ENTRADA_MAX) || null;
  return null;
}

// Parte un texto largo en trozos <= max, cortando por salto de linea/espacio. PURO.
function trocear(texto, max) {
  max = max || MAX_TXT;
  var t = String(texto || '').trim();
  var out = [];
  while (t.length > max) {
    var corte = t.lastIndexOf('\n', max);
    if (corte < max * 0.5) corte = t.lastIndexOf(' ', max);
    if (corte < max * 0.5) corte = max;
    out.push(t.slice(0, corte).trim());
    t = t.slice(corte).trim();
  }
  if (t) out.push(t);
  return out;
}

// Decide a que mensajes responder. PURO.
//   msgs: array de mensajes de Discord (cualquier orden)
//   ctx: { yoId, ultimoId, permitidos:[ids], botsLog:[timestamps ms], ahora }
// Devuelve { responder:[{id,texto,autor,esBot}], ultimoId, botsLog }
function decidir(msgs, ctx) {
  ctx = ctx || {};
  var ordenados = (msgs || []).slice().sort(function (a, b) { return cmpId(a.id, b.id); });
  var ultimo = ctx.ultimoId || '';
  var permitidos = (ctx.permitidos || []).map(String);
  var ahora = ctx.ahora || Date.now();
  var log = (ctx.botsLog || []).filter(function (t) { return ahora - t < 3600 * 1000; });
  var responder = [];
  ordenados.forEach(function (m) {
    if (!m || !m.id) return;
    if (cmpId(m.id, ultimo) > 0) ultimo = String(m.id);
    if (ctx.ultimoId && cmpId(m.id, ctx.ultimoId) <= 0) return;           // ya visto
    var autor = m.author || {};
    if (ctx.yoId && String(autor.id) === String(ctx.yoId)) return;         // yo mismo
    if (permitidos.length && !permitidos.includes(String(autor.id))) return;
    var texto = dirigidoA(m.content, ctx.yoId);
    if (!texto) return;
    if (autor.bot) {
      var ultimoBot = log.length ? log[log.length - 1] : 0;
      if (ahora - ultimoBot < BOT_COOLDOWN_MS || log.length >= BOT_MAX_HORA) return;
      log.push(ahora);
    }
    responder.push({ id: String(m.id), texto: texto, autor: autor.username || '', esBot: !!autor.bot });
  });
  return { responder: responder, ultimoId: ultimo, botsLog: log };
}

function disponible() { return typeof fetch === 'function' || !!_nativo(); }

function _nativo() {
  try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp; } catch (e) { return null; }
}

async function _http(metodo, ruta, token, cuerpo) {
  var url = API + ruta;
  var headers = { 'Authorization': 'Bot ' + token, 'Content-Type': 'application/json', 'User-Agent': 'DiscordBot (https://github.com/raidenia3-oss/ASAGI, 1)' };
  var nat = _nativo();
  if (nat && typeof nat.request === 'function') {
    var r = await nat.request({ url: url, method: metodo, headers: headers, data: cuerpo || undefined });
    var d = r.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) {} }
    return { status: r.status, data: d };
  }
  var res = await fetch(url, { method: metodo, headers: headers, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  var data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data: data };
}

function _explicar(status, data) {
  if (status === 401) return 'Discord rechazó el token del bot (401). Cópialo de nuevo desde el portal de desarrolladores.';
  if (status === 403) return 'El bot no tiene permiso en ese canal (403). Invítalo con permiso de ver y escribir mensajes.';
  if (status === 404) return 'No encuentro ese canal (404). Revisa el ID del canal.';
  if (status === 429) return 'Discord pide esperar (429); reintento solo.';
  return 'Discord respondió ' + status + (data && data.message ? ': ' + data.message : '');
}

// Cliente con persistencia inyectada: { cfg(), guardarCfg(c), estado(), guardarEstado(e), http? }
function crearCliente(io) {
  var http = io.http || _http;
  function cfg() { return io.cfg() || {}; }
  function estado() { return io.estado() || {}; }
  function listo() { var c = cfg(); return !!(c.token && c.canal); }

  async function verificar() {
    var c = cfg();
    if (!c.token) return { ok: false, texto: 'Falta el token del bot.' };
    if (!c.canal) return { ok: false, texto: 'Falta el ID del canal.' };
    try {
      var yo = await http('GET', '/users/@me', c.token);
      if (yo.status !== 200) return { ok: false, texto: _explicar(yo.status, yo.data) };
      var ch = await http('GET', '/channels/' + encodeURIComponent(c.canal), c.token);
      if (ch.status !== 200) return { ok: false, texto: _explicar(ch.status, ch.data) };
      var e = estado(); e.yoId = yo.data.id; e.yoNombre = yo.data.username; io.guardarEstado(e);
      return { ok: true, texto: 'Conectado como ' + yo.data.username + ' al canal #' + (ch.data.name || c.canal) + '.', nombre: yo.data.username };
    } catch (err) { return { ok: false, texto: 'Sin conexión con Discord.' }; }
  }

  async function enviar(texto, respondeA) {
    var c = cfg();
    if (!listo()) return { ok: false, texto: 'Discord no está configurado.' };
    var trozos = trocear('**ASAGI** · ' + texto, MAX_TXT);
    try {
      for (var i = 0; i < trozos.length; i++) {
        var body = { content: trozos[i], allowed_mentions: { parse: [] } };
        if (respondeA && i === 0) body.message_reference = { message_id: respondeA, fail_if_not_exists: false };
        var r = await http('POST', '/channels/' + encodeURIComponent(c.canal) + '/messages', c.token, body);
        if (r.status === 429) return { ok: false, texto: _explicar(429), espera: ((r.data && r.data.retry_after) || 5) * 1000 };
        if (r.status >= 300) return { ok: false, texto: _explicar(r.status, r.data) };
      }
      return { ok: true };
    } catch (err) { return { ok: false, texto: 'Sin conexión con Discord.' }; }
  }

  // Un ciclo: lee lo nuevo, contesta lo dirigido a ASAGI. responder(texto, info) -> Promise<string>
  async function sincronizar(responder) {
    var c = cfg();
    if (!listo()) return { ok: false, texto: 'Discord no está configurado.' };
    var e = estado();
    if (!e.yoId) { var v = await verificar(); if (!v.ok) return v; e = estado(); }
    try {
      var ruta = '/channels/' + encodeURIComponent(c.canal) + '/messages?limit=30' + (e.ultimoId ? '&after=' + e.ultimoId : '');
      var r = await http('GET', ruta, c.token);
      if (r.status === 429) return { ok: false, texto: _explicar(429), espera: ((r.data && r.data.retry_after) || 5) * 1000 };
      if (r.status !== 200 || !Array.isArray(r.data)) return { ok: false, texto: _explicar(r.status, r.data) };
      // Primera vez: ancla al ultimo mensaje y NO contesta el historial.
      if (!e.ultimoId) {
        var mx = '';
        r.data.forEach(function (m) { if (cmpId(m.id, mx) > 0) mx = String(m.id); });
        e.ultimoId = mx || '0'; io.guardarEstado(e);
        return { ok: true, respondidos: 0, anclado: true };
      }
      var dec = decidir(r.data, { yoId: e.yoId, ultimoId: e.ultimoId, permitidos: c.permitidos, botsLog: e.botsLog, ahora: Date.now() });
      e.ultimoId = dec.ultimoId; e.botsLog = dec.botsLog; io.guardarEstado(e);
      var n = 0;
      for (var i = 0; i < dec.responder.length; i++) {
        var q = dec.responder[i], resp = '';
        try { resp = await responder(q.texto, q); } catch (err) { resp = ''; }
        if (!resp) continue;
        var s = await enviar(resp, q.id);
        if (s.ok) n++; else return { ok: false, texto: s.texto, respondidos: n, espera: s.espera };
      }
      e.ultimaVez = Date.now(); io.guardarEstado(e);
      return { ok: true, respondidos: n };
    } catch (err) { return { ok: false, texto: 'Sin conexión con Discord.' }; }
  }

  return { listo: listo, verificar: verificar, enviar: enviar, sincronizar: sincronizar, estado: estado };
}

var EXP = { cmpId: cmpId, dirigidoA: dirigidoA, trocear: trocear, decidir: decidir, crearCliente: crearCliente, disponible: disponible };
if (typeof module !== 'undefined' && module.exports) module.exports = EXP;
if (typeof window !== 'undefined') window.AsagiDiscord = EXP;

})();
