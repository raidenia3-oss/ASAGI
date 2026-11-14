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

async function ir(url) {
  var N = nativo();
  if (N) { await N.abrir({ url: url }); return leer(); }
  var html = await (await fetch(url)).text();                        // respaldo sin app: solo lectura
  var doc = new DOMParser().parseFromString(html, 'text/html');
  ultima = { titulo: doc.title, url: url, texto: (doc.body ? doc.body.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 6000), elementos: [] };
  return ultima;
}
async function leer() {
  if (!nativo()) { if (!ultima) throw new Error('no hay página abierta'); return ultima; }
  ultima = await _ejecutar(L.LECTOR, [6000]);
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
  var url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
  if (nativo()) {
    await nativo().abrir({ url: url });
    var html = await _ejecutar(function () { return document.documentElement.outerHTML; });
    return L.resultadosDDG(String(html || ''));
  }
  return L.resultadosDDG(await (await fetch(url)).text());
}

// Busca, abre las mejores páginas, las lee y resume con fuentes. pensar(prompt) -> texto (o null sin cerebro).
async function investigar(pregunta, pensar, progreso, n) {
  n = n || 3;
  var res = (await buscar(pregunta)).filter(function (r) { return /^https?:/.test(r.url); }).slice(0, 6);
  if (!res.length) return { texto: 'No encontré resultados para «' + pregunta + '».', fuentes: [] };
  var paginas = [];
  for (var i = 0; i < res.length && paginas.length < n; i++) {
    if (progreso) progreso('📖 Leyendo ' + (paginas.length + 1) + '/' + n + ': ' + res[i].titulo.slice(0, 60));
    try { var p = await ir(res[i].url); if (p && p.texto && p.texto.length > 120) paginas.push({ url: p.url || res[i].url, titulo: p.titulo || res[i].titulo, texto: p.texto }); } catch (e) {}
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

window.AsagiNavegador = { ir: ir, leer: leer, clic: clic, escribir: escribir, volver: volver, cerrar: cerrar, buscar: buscar,
  investigar: investigar, ultima: function () { return ultima; }, nativo: function () { return !!nativo(); } };
})();
