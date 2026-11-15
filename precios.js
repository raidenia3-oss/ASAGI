// Comparar precios en tiendas del Perú (idea de los navegadores con IA que comparan productos entre pestañas):
//   «compara precios de RTX 4060» · «dónde está más barato el iPhone 16» · «precio de una laptop Lenovo IdeaPad»
// Busca en la web, abre las páginas de tiendas peruanas (con el escudo), saca los precios en soles y los ordena.
// Solo mira: nunca compra ni pone datos. Los precios cambian: siempre confirma en la tienda.
(function () {
'use strict';
var TIENDAS = { 'falabella.com.pe': 'Falabella', 'mercadolibre.com.pe': 'Mercado Libre', 'ripley.com.pe': 'Ripley', 'plazavea.com.pe': 'Plaza Vea', 'oechsle.pe': 'Oechsle',
  'hiraoka.com.pe': 'Hiraoka', 'coolbox.pe': 'Coolbox', 'promart.pe': 'Promart', 'sodimac.com.pe': 'Sodimac', 'tottus.com.pe': 'Tottus', 'linio.com.pe': 'Linio',
  'impacto.com.pe': 'Impacto', 'sercoplus.com': 'Sercoplus', 'cyccomputer.pe': 'CyC Computer', 'memorykings.pe': 'Memory Kings', 'infotec.com.pe': 'Infotec',
  'pcfactory.com.pe': 'PC Factory', 'computershopperu.com': 'Computer Shop', 'efe.com.pe': 'Efe', 'lacuracao.pe': 'La Curacao', 'samsung.com': 'Samsung', 'apple.com': 'Apple',
  'shopstar.pe': 'Shopstar', 'juntoz.com': 'Juntoz', 'amazon.com': 'Amazon (EE. UU.)' };
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,]+/g, '').replace(/\s+/g, ' ').trim(); }

// PURO
function parsear(t) {
  var n = norm(t), m;
  if ((m = n.match(/^(?:compara(?:me)? (?:los )?precios? (?:de|del|de la|de un|de una)|donde (?:esta|sale|lo encuentro) mas barato (?:el |la |un |una )?|precio de (?:un |una |el |la )?|cuanto cuesta (?:un |una |el |la )?(?=.* en (?:peru|lima|tiendas)))(.{3,80}?)(?: en (?:peru|lima|tiendas))?$/))) return { q: m[1].trim() };
  return null;
}
function tiendaDe(url) {
  var h = (String(url).match(/^https?:\/\/([^/]+)/) || [])[1] || ''; h = h.toLowerCase().replace(/^www\./, '');
  for (var d in TIENDAS) if (h === d || h.slice(-d.length - 1) === '.' + d) return TIENDAS[d];
  return null;
}
// Precios en soles de un texto -> números plausibles (sin cuotas, envío ni «ahorra»). PURO.
function precios(texto) {
  var out = [], re = /(?:S\/\.?|PEN|s\/\.?)\s?(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/g, m;
  var t = String(texto || '');
  while ((m = re.exec(t))) {
    var ctx = t.slice(Math.max(0, m.index - 16), m.index).toLowerCase();
    if (/(cuota|mensual|al mes|x mes|envio|envío|ahorra|ahorro|desde\s*$|dscto|descuento de|antes|normal|precio regular|tachado)/.test(ctx)) continue;
    var s = m[1].replace(/\s/g, '');
    if (/^\d{1,3}([.,]\d{3})+([.,]\d{1,2})?$/.test(s)) { var dec = s.match(/([.,])(\d{1,2})$/); s = dec && s.length - s.lastIndexOf(dec[1]) <= 3 ? s.slice(0, -dec[0].length).replace(/[.,]/g, '') + '.' + dec[2] : s.replace(/[.,]/g, ''); }
    else s = s.replace(',', '.');
    var v = parseFloat(s);
    if (v >= 5 && v < 200000) out.push(v);
  }
  return out;
}
// El precio "del producto" en una página: el que más se repite entre los altos (evita accesorios y cuotas). PURO.
function precioPrincipal(vals) {
  if (!vals.length) return null;
  var c = {}; vals.forEach(function (v) { c[v] = (c[v] || 0) + 1; });
  var ord = vals.slice().sort(function (a, b) { return b - a; }), max = ord[0];
  var cand = Object.keys(c).map(Number).filter(function (v) { return v >= max * 0.35; });
  cand.sort(function (a, b) { return c[b] - c[a] || a - b; });
  return cand[0];
}
function soles(v) { return 'S/ ' + v.toLocaleString('es-PE', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); }

async function comparar(q, decir) {
  var NV = window.AsagiNavegador;
  if (!NV || !NV.buscar) { decir('🛒 Comparar precios necesita la app instalada.'); return; }
  decir('🛒 Busco «' + q + '» en tiendas del Perú (puede tardar ~1 min)…');
  var res = [];
  try { res = await NV.buscar(q + ' precio Perú'); } catch (e) {}
  var tiendas = res.filter(function (r) { return tiendaDe(r.url); });
  if (tiendas.length < 3) { try { tiendas = tiendas.concat((await NV.buscar(q + ' site:falabella.com.pe OR site:mercadolibre.com.pe OR site:ripley.com.pe OR site:plazavea.com.pe OR site:impacto.com.pe')).filter(function (r) { return tiendaDe(r.url); })); } catch (e) {} }
  var vistos = {}, filas = [];
  tiendas = tiendas.filter(function (r) { if (vistos[r.url]) return false; vistos[r.url] = 1; return true; }).slice(0, 6);
  if (!tiendas.length) { decir('🛒 No encontré «' + q + '» en tiendas peruanas conocidas. Prueba con el modelo exacto.'); return; }
  for (var i = 0; i < tiendas.length; i++) {
    var r = tiendas[i], p = null;
    try { p = await NV.ir(r.url); } catch (e) { continue; }                 // el escudo frena enlaces peligrosos
    var v = precioPrincipal(precios((p && p.texto) || '').concat(precios(r.resumen || '')));
    if (v) filas.push({ tienda: tiendaDe(r.url), precio: v, titulo: (p && p.titulo) || r.titulo, url: r.url });
  }
  try { if (NV.cerrar) await NV.cerrar(); } catch (e) {}
  if (!filas.length) { decir('🛒 Encontré tiendas pero no pude leer los precios (algunas los cargan con imágenes). Revisa: ' + tiendas.slice(0, 3).map(function (r) { return r.url; }).join(' ')); return; }
  filas.sort(function (a, b) { return a.precio - b.precio; });
  decir('🛒 «' + q + '» — del más barato al más caro:\n' + filas.map(function (f, i) { return (i === 0 ? '🏆 ' : '• ') + f.tienda + ': ' + soles(f.precio) + ' — ' + String(f.titulo).slice(0, 60) + '\n  ' + f.url; }).join('\n') +
    '\nOjo: revisa que sea el mismo modelo y el precio final en la tienda (cambian rápido).');
}

var API = { parsear: parsear, tiendaDe: tiendaDe, precios: precios, precioPrincipal: precioPrincipal, comparar: comparar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiPrecios = API;
})();
