// Openverse (api.openverse.org): imágenes y sonidos de uso libre, sin key.
// - fondos: «fondo de lluvia», «busca fondo montañas» → cuadrícula; tocas una y queda de fondo
//   (con su crédito: autor y licencia).
// - sonidos de ambiente: «sonido de lluvia», «para el sonido».
// Ligero: solo miniaturas en la cuadrícula; la imagen grande se baja únicamente al elegirla.
(function () {
'use strict';
var API = 'https://api.openverse.org/v1/';

function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.!?¿¡]/g, '').trim(); }

// Comandos. PURO.
function parsear(t) {
  var n = norm(t), l = String(t || '').toLowerCase().replace(/[.!?¿¡]/g, '').trim(), m;
  if ((m = l.match(/^(?:busca(?:r|me)?|pon(?:me)?|quiero|dame)?\s*(?:un |una )?(?:fondos?|wallpapers?)\s+(?:de |con |del |sobre )?(?:la |el |los |las )?(.{2,60})$/))) {
    var q = m[1].replace(/^(?:pantalla|openverse)\s*(?:de |con )?/, '').trim();
    if (q && !/^(?:pantalla|mi foto|foto)$/.test(q)) return { accion: 'fondos', q: q };
  }
  if ((m = l.match(/^(?:pon(?:me)?|reproduce|quiero)?\s*(?:un |el )?(?:sonido|ruido|ambiente)\s+(?:de |del |con )(?:la |el |los |las )?(.{2,40})$/))) return { accion: 'sonido', q: m[1].trim() };
  if (/^(?:para|quita|apaga|deten)\s+(?:el\s+)?(?:sonido|ruido|ambiente)$/.test(n)) return { accion: 'parar' };
  return null;
}

// Crédito corto, como pide la licencia. PURO.
function credito(r) {
  var lic = (r.license || '').toUpperCase();
  lic = lic === 'CC0' || lic === 'PDM' ? lic : 'CC ' + lic + (r.license_version ? ' ' + r.license_version : '');
  return '«' + (r.title || 'sin título').slice(0, 60) + '» de ' + (r.creator || 'autor desconocido') + ' (' + lic + ')';
}

async function _get(ruta, q, extra) {
  var url = API + ruta + '?q=' + encodeURIComponent(q) + '&page_size=' + (extra.n || 20) + '&mature=false' + (extra.params || '');
  var r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('openverse ' + r.status);
  var j = await r.json();
  return (j && j.results) || [];
}
function imagenes(q, n) { return _get('images/', q, { n: n || 18, params: '&aspect_ratio=tall' }).then(function (rs) { return rs.length ? rs : _get('images/', q, { n: n || 18, params: '' }); }); }
function sonidos(q, n) { return _get('audio/', q, { n: n || 10, params: '&duration=medium,long' }).then(function (rs) { return rs.length ? rs : _get('audio/', q, { n: n || 10, params: '' }); }); }

// Baja la imagen como Blob: primero por el propio Openverse (permite CORS), si no la original.
async function blobDe(r) {
  var urls = [API + 'images/' + r.id + '/thumb/?full_size=true&compressed=true', r.url];
  for (var i = 0; i < urls.length; i++) {
    try { var res = await fetch(urls[i]); if (res.ok) { var b = await res.blob(); if (b && b.size > 2000 && /^image\//.test(b.type || 'image/')) return b; } } catch (e) {}
  }
  throw new Error('no pude bajar la imagen');
}

// ---- interfaz: hoja con cuadrícula ----
var hoja = null;
function cerrar() { if (hoja) { hoja.remove(); hoja = null; } }
function mostrarFondos(q, resultados, alElegir) {
  cerrar();
  hoja = document.createElement('div'); hoja.className = 'ov-hoja'; hoja.setAttribute('role', 'dialog'); hoja.setAttribute('aria-label', 'Fondos de ' + q);
  var cab = document.createElement('div'); cab.className = 'ov-cab';
  var tit = document.createElement('b'); tit.textContent = 'Fondos: ' + q;
  var x = document.createElement('button'); x.type = 'button'; x.className = 'ov-x'; x.textContent = '×'; x.setAttribute('aria-label', 'Cerrar'); x.onclick = cerrar;
  cab.appendChild(tit); cab.appendChild(x); hoja.appendChild(cab);
  var grid = document.createElement('div'); grid.className = 'ov-grid';
  resultados.forEach(function (r) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'ov-item'; b.title = credito(r);
    var im = document.createElement('img'); im.loading = 'lazy'; im.alt = r.title || ''; im.src = r.thumbnail || (API + 'images/' + r.id + '/thumb/');
    im.onerror = function () { b.remove(); };
    b.appendChild(im);
    b.onclick = function () { grid.classList.add('ov-cargando'); alElegir(r).then(cerrar, function () { grid.classList.remove('ov-cargando'); }); };
    grid.appendChild(b);
  });
  hoja.appendChild(grid);
  var pie = document.createElement('div'); pie.className = 'ov-pie'; pie.textContent = 'Imágenes libres de Openverse. Toca una para ponerla de fondo.';
  hoja.appendChild(pie);
  document.body.appendChild(hoja);
}

// ---- sonidos de ambiente (un solo <audio>, en bucle) ----
var audio = null;
function sonar(r) {
  parar();
  audio = new Audio(r.url); audio.loop = true; audio.volume = 0.6; audio.preload = 'none';
  return audio.play();
}
function parar() { if (audio) { try { audio.pause(); audio.src = ''; } catch (e) {} audio = null; } }

var API_PUB = { parsear: parsear, credito: credito, imagenes: imagenes, sonidos: sonidos, blobDe: blobDe, mostrarFondos: mostrarFondos, cerrar: cerrar, sonar: sonar, parar: parar, sonando: function () { return !!audio; } };
if (typeof module !== 'undefined' && module.exports) module.exports = API_PUB;
if (typeof window !== 'undefined') window.AsagiOpenverse = API_PUB;
})();
