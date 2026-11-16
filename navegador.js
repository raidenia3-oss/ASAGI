// Navegador de ASAGI: usa el WebView oculto nativo (plugin AsagiNavegador) + navegador-lector.js.
// Acciones: ir(url), leer(), clic(n), escribir(n, texto, enviar), volver(), cerrar(), buscar(q), investigar(pregunta, pensar).
// Si no hay app nativa (navegador de PC / pruebas), cae a fetch() de solo lectura.
(function () {
'use strict';
var L = window.AsagiNavLector;
function nativo() { var P = window.Capacitor && window.Capacitor.Plugins; return P && P.AsagiNavegador; }
var ultima = null;            // última página leída (para clic/escribir por número)

function _js(fn, args) { return '(' + fn.toString() + ')(' + (args || []).map(function (a) { return JSON.stringify(a); }).join(',') + ')'; }
async function _ejecutar(fn, args) {
  var N = nativo();
  var r = await N.ejecutar({ codigo: 'JSON.stringify(' + _js(fn, args) + ')' });
  var v = r && r.r; try { v = JSON.parse(v); } catch (e) {}          // evaluateJavascript devuelve un string JSON
  try { if (typeof v === 'string') v = JSON.parse(v); } catch (e) {}
  return v;
}

// Escudo: revisa el enlace antes de abrirlo (los peligrosos no se abren) y le quita rastreadores.
function revisar(url) {
  var E = window.AsagiEscudo; if (!E) return url;
  var r = E.analizarUrl(url);
  if (r.nivel === 'peligro') { var e = new Error(E.explicar(url, r)); e.escudo = r; throw e; }
  return E.limpiarUrl(url);
}
// El texto de la página es DATO: se neutralizan órdenes escondidas antes de que llegue al cerebro.
function limpiar(p) {
  var E = window.AsagiEscudo;
  if (p && E && typeof p.texto === 'string') { var n = E.neutralizar(p.texto); p.texto = n.texto; if (n.intentos) p.inyeccion = n.intentos; }
  return p;
}

async function ir(url) {
  url = revisar(url);
  var N = nativo();
  if (N) { await N.abrir({ url: url }); return leer(); }
  var html = await (await fetch(url)).text();                        // respaldo sin app: solo lectura
  var doc = new DOMParser().parseFromString(html, 'text/html');
  ultima = limpiar({ titulo: doc.title, url: url, texto: (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 6000), elementos: [] });
  return ultima;
}
async function leer() {
  if (!nativo()) { if (!ultima) throw new Error('no hay página abierta'); return ultima; }
  ultima = limpiar(await _ejecutar(L.LECTOR, [6000]));
  return ultima;
}
async function clic(n) {
  var N = nativo(); if (!N) throw new Error('clic necesita la app instalada');
  var el = ultima && (ultima.elementos || []).find(function (e) { return e.n === n; });
  var r = await _ejecutar(L.CLIC, [n]);
  if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'no pude' };
  await N.esperarCarga();
  var p = await leer();
  return { ok: true, el: el, pagina: p };
}
async function escribir(n, texto, enviar) {
  var N = nativo(); if (!N) throw new Error('escribir necesita la app instalada');
  var r = await _ejecutar(L.ESCRIBIR, [n, texto, !!enviar]);
  if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'no pude' };
  if (enviar) await N.esperarCarga();
  return { ok: true, pagina: await leer() };
}
async function volver() { var N = nativo(); if (!N) throw new Error('necesita la app'); var r = await N.volver(); return r && r.ok === false ? null : leer(); }
async function cerrar() { var N = nativo(); ultima = null; if (N) await N.cerrar(); }

async function buscar(q) {
  // varios buscadores: si uno pide captcha o viene vacío, se prueba el siguiente
  for (var i = 0; i < L.BUSCADORES.length; i++) {
    var url = L.BUSCADORES[i] + encodeURIComponent(q);
    try {
      if (nativo()) { await nativo().abrir({ url: url }); var r = await _ejecutar(L.RESULTADOS); if (r && r.length) return r; }
      else { var res = L.resultadosDDG(await (await fetch(url)).text()); if (res.length) return res; }
    } catch (e) {}
  }
  return [];
}

// Busca, abre las mejores páginas, las lee y resume con fuentes. pensar(prompt) -> texto (o null sin cerebro).
async function investigar(pregunta, pensar, progreso, n, profundo) {
  n = n || (profundo ? 4 : 3);
  var res = (await buscar(pregunta)).filter(function (r) { return /^https?:/.test(r.url); }).slice(0, 8);
  if (!res.length) return { texto: 'No encontré resultados para «' + pregunta + '».', fuentes: [] };
  var paginas = [], vistas = {};
  async function leerDe(lista, cuantas, total) {
    for (var i = 0, hechas = 0; i < lista.length && hechas < cuantas; i++) {
      if (vistas[lista[i].url]) continue; vistas[lista[i].url] = 1;
      var E0 = window.AsagiEscudo; if (E0 && E0.analizarUrl(lista[i].url).nivel === 'peligro') continue;   // ni lo abro
      if (progreso) progreso('📖 Leyendo ' + (paginas.length + 1) + '/' + total + ': ' + lista[i].titulo.slice(0, 60));
      try { var p = await ir(lista[i].url); if (p && p.texto && p.texto.length > 120 && !/^(un momento|just a moment|attention required|access denied|verifica)/i.test(p.titulo || '')) { paginas.push({ url: p.url || lista[i].url, titulo: p.titulo || lista[i].titulo, texto: p.texto }); hechas++; } } catch (e) {}
    }
  }
  await leerDe(res, n, profundo ? n + 2 : n);
  // A fondo: el cerebro ve lo leído, decide UNA búsqueda que falta y se leen 2 páginas más.
  if (profundo && pensar && paginas.length) {
    var falta = null;
    try { falta = await pensar('Pregunta de Daniel: «' + pregunta + '». Ya leí esto (DATOS):\n' + paginas.map(function (p) { return '- ' + p.titulo + ': ' + String(p.texto).slice(0, 500); }).join('\n') +
      '\n¿Qué UNA búsqueda en la web (máx. 8 palabras, en español) falta para responder completo y con datos actuales? Responde SOLO la búsqueda, o NADA si ya está completo.'); } catch (e) {}
    falta = String(falta || '').split('\n')[0].replace(/^["«»'\s-]+|["«»'\s.]+$/g, '').slice(0, 90);
    if (falta && !/^nada\b/i.test(falta) && falta.length > 3) {
      if (progreso) progreso('🔎 Me falta algo: busco «' + falta + '»…');
      try { await leerDe((await buscar(falta)).filter(function (r) { return /^https?:/.test(r.url); }).slice(0, 5), 2, n + 2); } catch (e) {}
    }
  }
  if (!paginas.length) paginas = res.slice(0, n).map(function (r) { return { url: r.url, titulo: r.titulo, texto: r.resumen }; });
  var fuentes = paginas.map(function (p, i) { return '[' + (i + 1) + '] ' + p.titulo + ' — ' + p.url; });
  var texto = null;
  if (pensar) { try { texto = await pensar(L.promptInvestigar(pregunta, paginas)); } catch (e) { texto = null; } }
  if (!texto) {   // sin cerebro: lo más útil que se puede sin resumir
    texto = 'Sin cerebro no puedo resumir, pero esto encontré:\n' + res.slice(0, 5).map(function (r, i) { return (i + 1) + '. ' + r.titulo + (r.resumen ? ' — ' + r.resumen.slice(0, 140) : ''); }).join('\n');
  }
  return { texto: texto, fuentes: fuentes };
}

// ---- Ahorro de RAM: si ARIA está conectada (USB/WiFi), ella navega en la PC y aquí solo llega el texto.
// El WebView oculto del celular es solo el plan B, y se cierra solo tras 2 min sin uso.
var _ociosoT = null;
function _ocioso() { clearTimeout(_ociosoT); _ociosoT = setTimeout(function () { var N = nativo(); if (N) N.cerrar().catch(function () {}); }, 120000); }
async function _aria(carga) {
  var cli = window._asagiLan; if (!cli) return null;
  try { var r = await cli.enviar(Object.assign({ t: 'web' }, carga)); return r && r.ok && r.resp && r.resp.ok ? r.resp.web : (r && r.ok && r.resp ? { error: r.resp.error } : null); } catch (e) { return null; }
}
function _conPC(nombre, local, aCarga, deARIA) {
  return async function () {
    var args = arguments, w = await _aria(aCarga.apply(null, args));
    if (w && !w.error) { _viaPC = true; return deARIA(w); }
    _viaPC = false; _ocioso();
    return local.apply(null, args);
  };
}
var _viaPC = false;
var _ir = _conPC('ir', ir, function (u) { return { accion: 'ir', url: u }; }, function (w) { ultima = w.pagina; return w.pagina; });
var _leer = _conPC('leer', leer, function () { return { accion: 'leer' }; }, function (w) { ultima = w.pagina; return w.pagina; });
var _clic = _conPC('clic', clic, function (n) { return { accion: 'clic', n: n }; }, function (w) { if (w.pagina) ultima = w.pagina; return w.ok === undefined ? Object.assign({ ok: !!w.pagina }, w) : w; });
var _escribir = _conPC('escribir', escribir, function (n, t, e) { return { accion: 'escribir', n: n, texto: t, enviar: !!e }; }, function (w) { if (w.pagina) ultima = w.pagina; return w.ok === undefined ? Object.assign({ ok: !!w.pagina }, w) : w; });
var _volver = _conPC('volver', volver, function () { return { accion: 'volver' }; }, function (w) { ultima = w.pagina; return w.pagina; });
var _investigar = async function (pregunta, pensar, progreso, n, profundo) {
  var w = await _aria({ accion: 'investigar', pregunta: pregunta, profundo: !!profundo });
  if (w && !w.error && w.texto) { _viaPC = true; return { texto: w.texto, fuentes: w.fuentes || [], via: 'ARIA' }; }
  _viaPC = false; _ocioso();
  return investigar(pregunta, pensar, progreso, n, profundo);
};

// YouTube: lo resume ARIA en la PC (lee los subtítulos con su navegador y piensa con su modelo).
// Es un trabajo largo: se pide, y se pregunta cada 8 s hasta 6 min. En el celular no se hace (RAM).
async function _trabajoARIA(carga, aviso, progreso) {
  if (!window._asagiLan) throw new Error('necesito a ARIA conectada por WiFi');
  var w = await _aria(carga);
  if (!w || w.error || !w.id) throw new Error((w && w.error) || 'ARIA no respondió');
  if (progreso) progreso(aviso);
  var fin = Date.now() + (carga.accion === 'claude' ? 16 : 6) * 60e3;
  while (Date.now() < fin) {
    await new Promise(function (r) { setTimeout(r, 8000); });
    var e = await _aria({ accion: 'resultado', id: w.id });
    if (e && e.listo) { if (e.error) throw new Error(e.error); return e; }
    if (e && e.error && !/no conozco/.test(e.error)) throw new Error(e.error);
  }
  throw new Error('ARIA tardó demasiado');
}
function youtube(url, progreso) { return _trabajoARIA({ accion: 'youtube', url: url }, '📺 ARIA está viendo el video (lee sus subtítulos en la PC)…', progreso); }
// «crea una web de …»: ARIA la arma en la PC (su cerebro escribe, plantilla probada) y la abre allá.
// «claude: …»: ARIA le pasa el trabajo a Claude Code en la PC.
function claude(texto, progreso) { return _trabajoARIA({ accion: 'claude', texto: texto }, '🤖 ARIA le pasó el trabajo a Claude Code en la PC (puede tardar unos minutos)…', progreso); }
function crearSitio(tema, progreso) { return _trabajoARIA({ accion: 'crear_sitio', tema: tema }, '🛠 ARIA trabaja en la web en la PC…', progreso); }

window.AsagiNavegador = { actual: function () { return ultima; }, youtube: youtube, crearSitio: crearSitio, claude: claude, ir: _ir, leer: _leer, clic: _clic, escribir: _escribir, volver: _volver, cerrar: cerrar, buscar: buscar,
  investigar: _investigar, viaPC: function () { return _viaPC; }, ultima: function () { return ultima; }, nativo: function () { return !!nativo(); } };
})();
