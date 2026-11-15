// Vigía de páginas (como Visualping/Distill, pero dentro de ASAGI y sin servidores):
//   «vigila esta página https://…» · «avísame cuando cambie https://…»
//   «avísame si baja el precio de https://…» · tras «compara precios de …»: «vigila ese precio»
//   «qué páginas vigilas» · «deja de vigilar 2» · «deja de vigilar todas»
// Revisa cada 3 h con una descarga liviana (sin abrir navegador, poca RAM). Solo mira: nunca compra ni envía nada.
(function () {
'use strict';
var K = 'asagi-vigia', MAX = 10, CADA = 3 * 36e5;
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function leerLS(d) { try { return JSON.parse(localStorage.getItem(K) || '') || d; } catch (e) { return d; } }
function guardar(v) { try { localStorage.setItem(K, JSON.stringify(v)); } catch (e) {} }
function urlDe(t) { var m = String(t || '').match(/https?:\/\/[^\s<>"'«»]+/); return m ? m[0].replace(/[).,;:]+$/, '') : ''; }

// PURO
function parsear(t) {
  var u = urlDe(t), n = norm(String(t || '').replace(/https?:\/\/\S+/g, ' ')), m;
  if (/^(?:que paginas vigilas|paginas vigiladas|que vigilas|mis vigias|lista de vigias)$/.test(n)) return { accion: 'lista' };
  if ((m = n.match(/^(?:deja de vigilar|ya no vigiles|quita el vigia(?: de)?)\s+(todas|todo|la \d+|\d+)$/))) return { accion: 'quitar', cual: /tod/.test(m[1]) ? 'todas' : parseInt(m[1].replace(/\D/g, ''), 10) };
  if (!u && /^(?:vigila|avisame si baja) (?:ese|el) precio$/.test(n)) return { accion: 'ultimoPrecio' };
  if (!u) return null;
  if (/^(?:avisame (?:si|cuando) baj[ae] (?:el precio(?: de)?)?|vigila el precio de|sigue el precio de)\s*(?:esta pagina|este producto|esto)?$/.test(n)) return { accion: 'vigilar', url: u, tipo: 'precio' };
  if (/^(?:vigila|vigilame|avisame (?:cuando|si) cambie|avisame si hay cambios en|sigue los cambios de)\s*(?:esta|la|esa)?\s*(?:pagina|web|enlace|link)?$/.test(n)) return { accion: 'vigilar', url: u, tipo: 'cambios' };
  return null;
}

// HTML -> líneas de texto visibles (sin scripts ni estilos). PURO.
function textoDe(html) {
  return String(html || '').replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(?:br|\/title|\/p|\/div|\/li|\/h\d|\/tr|\/td|\/a)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); })
    .filter(function (l) { return l.length >= 4 && l.length <= 300; });
}
// Las líneas que cambian solas (horas, fechas, contadores) no cuentan como cambio. PURO.
function huellas(lineas) {
  var vistos = {};
  return lineas.map(function (l) { return norm(l).replace(/\d+/g, '#'); })
    .filter(function (l) { if (l.length < 6 || vistos[l]) return false; vistos[l] = 1; return true; }).slice(0, 400);
}
// Qué líneas son nuevas y si el cambio es de verdad (no ruido). PURO.
function comparar(antes, ahora, lineasAhora) {
  var a = {}; antes.forEach(function (h) { a[h] = 1; });
  var nuevas = [], idx = {};
  lineasAhora.forEach(function (l) { var h = norm(l).replace(/\d+/g, '#'); if (!a[h] && !idx[h] && h.length >= 6) { idx[h] = 1; nuevas.push(l); } });
  var b = {}; ahora.forEach(function (h) { b[h] = 1; });
  var fuera = antes.filter(function (h) { return !b[h]; }).length;
  var base = Math.max(antes.length, 1);
  return { nuevas: nuevas, quitadas: fuera, real: (nuevas.length + fuera) >= 2 && (nuevas.length + fuera) / base >= 0.03 };
}
// Precio del producto en el HTML: datos estructurados primero, luego «S/ …». PURO.
function precioHtml(html) {
  var h = String(html || ''), m;
  if ((m = h.match(/(?:product:price:amount|itemprop=["']price["'])[^>]*content=["']([\d.,]+)/i)) || (m = h.match(/content=["']([\d.,]+)["'][^>]*(?:product:price:amount|itemprop=["']price["'])/i))) {
    var v = parseFloat(m[1].replace(/,(?=\d{3}\b)/g, '').replace(',', '.')); if (v >= 1) return v;
  }
  if ((m = h.match(/"price"\s*:\s*"?(\d+(?:\.\d{1,2})?)"?[^}]{0,120}"priceCurrency"\s*:\s*"PEN"/i)) || (m = h.match(/"priceCurrency"\s*:\s*"PEN"[^}]{0,120}"price"\s*:\s*"?(\d+(?:\.\d{1,2})?)/i))) return parseFloat(m[1]);
  var PR = (typeof window !== 'undefined' && window.AsagiPrecios) || (typeof require === 'function' ? (function () { try { return require('./precios.js'); } catch (e) { return null; } })() : null);
  return PR ? PR.precioPrincipal(PR.precios(textoDe(h).join('\n'))) : null;
}
function soles(v) { return 'S/ ' + Number(v).toLocaleString('es-PE', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); }
function host(u) { return (String(u).match(/^https?:\/\/(?:www\.)?([^/]+)/) || [])[1] || u; }

async function bajar(url) {
  var P = window.Capacitor && window.Capacitor.Plugins, N = P && P.AsagiNavegador;
  if (N && N.traer) { var r = await N.traer({ url: url }); if (!r || !r.ok) throw new Error('la página respondió ' + ((r && r.estado) || 'sin datos')); return r.texto; }
  var res = await fetch(url); if (!res.ok) throw new Error('la página respondió ' + res.status); return res.text();
}

async function ejecutar(c, decir) {
  var l = leerLS([]);
  if (c.accion === 'lista') {
    decir(l.length ? '👁 Vigilo ' + l.length + ' página(s):\n' + l.map(function (v, i) {
      return (i + 1) + '. ' + (v.tipo === 'precio' ? '💲 ' + host(v.url) + ' — ahora ' + (v.precio ? soles(v.precio) : '¿?') : '📝 ' + (v.titulo || host(v.url)));
    }).join('\n') + '\n«deja de vigilar 1» para quitar una.' : '👁 No vigilo ninguna página. Di «vigila esta página https://…» o «avísame si baja el precio de https://…».');
    return;
  }
  if (c.accion === 'quitar') {
    if (c.cual === 'todas') { guardar([]); decir('👁 Listo, ya no vigilo ninguna página.'); return; }
    var q = l[c.cual - 1]; if (!q) { decir('👁 No hay vigía número ' + c.cual + '. Di «qué páginas vigilas».'); return; }
    l.splice(c.cual - 1, 1); guardar(l); decir('👁 Ya no vigilo ' + host(q.url) + '.'); return;
  }
  if (c.accion === 'ultimoPrecio') {
    var up = null; try { up = JSON.parse(localStorage.getItem('asagi-precio-ultimo') || 'null'); } catch (e) {}
    if (!up || !up.url) { decir('💲 Primero di «compara precios de …» y luego «vigila ese precio».'); return; }
    c = { accion: 'vigilar', url: up.url, tipo: 'precio' };
  }
  // vigilar
  var E = window.AsagiEscudo;
  if (E) { var r = E.analizarUrl(c.url); if (r.nivel === 'peligro') { decir(E.explicar(c.url, r) + '\nNo la vigilo.'); return; } c.url = E.limpiarUrl(c.url); }
  if (l.some(function (v) { return v.url === c.url && v.tipo === c.tipo; })) { decir('👁 Ya vigilo esa página.'); return; }
  if (l.length >= MAX) { decir('👁 Ya vigilo ' + MAX + ' páginas (el máximo, para cuidar batería). Quita una con «deja de vigilar 1».'); return; }
  decir('👁 Reviso la página…');
  var html; try { html = await bajar(c.url); } catch (e) { decir('👁 No pude abrir ' + host(c.url) + ' (' + e.message + '). Prueba otro enlace.'); return; }
  var lin = textoDe(html), tit = ((String(html).match(/<title[^>]*>([^<]{1,140})/i) || [])[1] || host(c.url)).trim();
  var v = { url: c.url, tipo: c.tipo, titulo: tit, desde: Date.now(), revisado: Date.now() };
  if (c.tipo === 'precio') {
    v.precio = precioHtml(html);
    if (!v.precio) { decir('💲 No encontré el precio en esa página (algunas tiendas lo cargan después). Si quieres, vigilo sus cambios: «vigila esta página ' + c.url + '».'); return; }
  } else {
    v.huellas = huellas(lin);
    if (v.huellas.length < 3) { decir('👁 Esa página casi no tiene texto que pueda leer sin navegador (¿pide iniciar sesión?).'); return; }
  }
  l.push(v); guardar(l);
  decir(c.tipo === 'precio' ? '💲 Listo: vigilo «' + tit.slice(0, 60) + '», ahora a ' + soles(v.precio) + '. Te aviso si baja (reviso cada 3 h mientras uses ASAGI).' :
    '👁 Listo: vigilo «' + tit.slice(0, 60) + '». Te aviso cuando cambie algo de verdad (reviso cada 3 h).');
}

// Revisión periódica (la llama app.js). Una página por vez, descarga liviana.
async function vigilar(decir) {
  var l = leerLS([]), cambio = false;
  for (var i = 0; i < l.length; i++) {
    var v = l[i]; if (Date.now() - (v.revisado || 0) < CADA) continue;
    v.revisado = Date.now(); cambio = true;
    var html; try { html = await bajar(v.url); } catch (e) { v.fallos = (v.fallos || 0) + 1; continue; }
    v.fallos = 0;
    if (v.tipo === 'precio') {
      var p = precioHtml(html);
      if (p && v.precio && p < v.precio - 0.5) decir('💲 ¡Bajó! «' + v.titulo.slice(0, 50) + '»: de ' + soles(v.precio) + ' a ' + soles(p) + ' (' + Math.round((1 - p / v.precio) * 100) + '% menos).\n' + v.url);
      else if (p && v.precio && p > v.precio + 0.5) v.subio = p;
      if (p) v.precio = p;
    } else {
      var lin = textoDe(html), hs = huellas(lin), d = comparar(v.huellas || [], hs, lin);
      if (d.real) {
        var E = window.AsagiEscudo, nuevas = d.nuevas.slice(0, 4).map(function (t) { return '• ' + (E ? E.neutralizar(t).texto : t).slice(0, 120); });
        decir('👁 Cambió «' + v.titulo.slice(0, 50) + '»' + (nuevas.length ? ':\n' + nuevas.join('\n') : '.') + '\n' + v.url);
      }
      v.huellas = hs;
    }
  }
  if (cambio) guardar(l);
}

var API = { parsear: parsear, textoDe: textoDe, huellas: huellas, comparar: comparar, precioHtml: precioHtml, ejecutar: ejecutar, vigilar: vigilar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiVigia = API;
})();
