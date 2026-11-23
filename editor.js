// Editor de imágenes propio de ASAGI (sin librerías; todo en el celular, nada se sube):
//   «editor» / «edita una foto» → eliges la foto, tocas un estilo o mueves los ajustes, le pones texto y la guardas.
//   «Describe el edit» → con cerebro, ASAGI traduce tus palabras («más dramática, tonos fríos…») a ajustes.
// APRENDE: cada vez que guardas, recuerda los ajustes; con 3 guardadas aparece el estilo «A tu gusto» (tu promedio),
// y los estilos que más usas salen primero. También puedes guardar tus propios estilos con nombre.
// El motor (ajustes sobre píxeles) es PURO y se prueba sin navegador.
(function () {
'use strict';
var KG = 'asagi-editor-gusto', KE = 'asagi-editor-estilos', KU = 'asagi-editor-usos', LADO = 1600;
var BASE = { brillo: 0, contraste: 0, saturacion: 0, calidez: 0, vineta: 0, grano: 0, tinte: 0 };   // todos de -100..100 (viñeta/grano/tinte 0..100)
var ESTILOS = {
  'Limpio':   { brillo: 6, contraste: 12, saturacion: 10, calidez: 0, vineta: 0, grano: 0, tinte: 0 },
  'Sakuga':   { brillo: 4, contraste: 38, saturacion: 45, calidez: 6, vineta: 22, grano: 0, tinte: 0 },
  'Carmesí':  { brillo: -4, contraste: 30, saturacion: -20, calidez: 10, vineta: 40, grano: 12, tinte: 55 },
  'Dorado':   { brillo: 8, contraste: 16, saturacion: 12, calidez: 45, vineta: 18, grano: 0, tinte: 0 },
  'Noir':     { brillo: -2, contraste: 45, saturacion: -100, calidez: 0, vineta: 50, grano: 22, tinte: 0 },
  'Retro':    { brillo: 5, contraste: -12, saturacion: -25, calidez: 28, vineta: 30, grano: 35, tinte: 0 },
  'Noche':    { brillo: -14, contraste: 26, saturacion: 8, calidez: -35, vineta: 45, grano: 8, tinte: 0 }
};
function lim(v, a, b) { v = Number(v); return isNaN(v) ? 0 : Math.max(a, Math.min(b, v)); }
// PURO: deja unos ajustes válidos y dentro de rango (sirve para lo que devuelve el cerebro).
function limpiar(p) {
  p = p || {}; var o = {};
  Object.keys(BASE).forEach(function (k) { o[k] = Math.round(lim(p[k], k === 'vineta' || k === 'grano' || k === 'tinte' ? 0 : -100, 100)); });
  return o;
}
// PURO: aplica los ajustes a un arreglo RGBA (Uint8ClampedArray o Array) de w×h. Devuelve el mismo arreglo.
function aplicar(d, w, h, p, semilla) {
  p = limpiar(p);
  var br = p.brillo * 1.6, co = (259 * (p.contraste * 1.4 + 255)) / (255 * (259 - p.contraste * 1.4)), sa = 1 + p.saturacion / 100, ca = p.calidez * 0.55, ti = p.tinte / 100;
  var cx = w / 2, cy = h / 2, rmax = Math.sqrt(cx * cx + cy * cy) || 1, vi = p.vineta / 100, gr = p.grano * 0.5, s = semilla || 7;
  for (var y = 0, i = 0; y < h; y++) {
    for (var x = 0; x < w; x++, i += 4) {
      var r = d[i] + br + ca, g = d[i + 1] + br, b = d[i + 2] + br - ca;
      r = co * (r - 128) + 128; g = co * (g - 128) + 128; b = co * (b - 128) + 128;
      var l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sa; g = l + (g - l) * sa; b = l + (b - l) * sa;
      if (ti) { r = r * (1 - ti) + (l * 1.25 + 26) * ti; g = g * (1 - ti) + (l * 0.32) * ti; b = b * (1 - ti) + (l * 0.42 + 6) * ti; }   // duotono carmesí
      if (vi) { var dx = x - cx, dy = y - cy, k = Math.sqrt(dx * dx + dy * dy) / rmax, f = 1 - vi * k * k * 1.15; r *= f; g *= f; b *= f; }
      if (gr) { s = (s * 16807) % 2147483647; var n = (s / 2147483647 - 0.5) * gr; r += n; g += n; b += n; }
      d[i] = r < 0 ? 0 : r > 255 ? 255 : r; d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }
  return d;
}
// PURO: recorte centrado a una proporción («1:1», «9:16», «16:9», «4:5» o «original»).
function recorte(w, h, prop) {
  var m = String(prop || '').match(/^(\d+):(\d+)$/); if (!m) return { x: 0, y: 0, w: w, h: h };
  var r = m[1] / m[2], nw = w, nh = Math.round(w / r);
  if (nh > h) { nh = h; nw = Math.round(h * r); }
  return { x: Math.round((w - nw) / 2), y: Math.round((h - nh) / 2), w: nw, h: nh };
}
// PURO: tu gusto = promedio de lo que guardaste (mínimo 3).
function gusto(lista) {
  if (!lista || lista.length < 3) return null;
  var o = {}; Object.keys(BASE).forEach(function (k) { o[k] = Math.round(lista.reduce(function (a, p) { return a + (Number(p[k]) || 0); }, 0) / lista.length); });
  return o;
}
function promptEdit(texto) {
  return 'Daniel describe cómo quiere editar una foto: «' + String(texto).slice(0, 200) + '». Tradúcelo a ajustes y responde SOLO este JSON (números enteros):\n' +
    '{"brillo":-100..100,"contraste":-100..100,"saturacion":-100..100,"calidez":-100..100 (negativo = frío/azulado),"vineta":0..100,"grano":0..100,"tinte":0..100 (duotono carmesí)}\n' +
    'Sé moderado (la mayoría entre -40 y 40) salvo que pida algo extremo. Sin texto extra.';
}
function leerAjustes(resp) { var s = String(resp || ''), a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) return null; try { return limpiar(JSON.parse(s.slice(a, b + 1))); } catch (e) { return null; } }
function parsear(t) { return /^(?:editor|editor de (?:fotos|imagenes|imágenes)|edita(?:r)? (?:una |mi |esta )?(?:foto|imagen)|abre el editor|quiero editar una foto|haz(?:me)? un edit|haz(?:me)? un meme|un meme|meme|censura(?:r)?(?: (?:una|esta|mi) foto| una imagen)?|tapa(?:r)? (?:datos|una foto|esta foto))$/i.test(String(t || '').trim().replace(/[.!¡]+$/, '')); }

function ls(k, d) { try { return JSON.parse(localStorage.getItem(k) || '') || d; } catch (e) { return d; } }
function gs(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

// ---------- Interfaz ----------
function abrir(decir) {
  var v = document.getElementById('editor-asagi'); if (v) v.remove();
  v = document.createElement('div'); v.id = 'editor-asagi'; v.className = 'editor-asagi'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Editor de imágenes');
  v.innerHTML = '<div class="ed-top"><b>Editor</b><span id="ed-nota"></span><button type="button" id="ed-cerrar">✕</button></div>' +
    '<div class="ed-lienzo"><canvas id="ed-canvas"></canvas><button type="button" id="ed-elegir" class="ed-grande">Elegir una foto</button></div>' +
    '<input type="file" id="ed-file" accept="image/*" hidden>' +
    '<div class="ed-panel" id="ed-panel" hidden>' +
    '<div class="ed-fila" id="ed-estilos"></div>' +
    '<div class="ed-fila" id="ed-props"></div>' +
    '<div id="ed-sliders"></div>' +
    '<div class="ed-linea"><input type="text" id="ed-texto" maxlength="60" placeholder="Texto (o «Arriba / Abajo» para meme)"></div>' +
    '<div class="ed-linea"><input type="text" id="ed-desc" maxlength="200" placeholder="Describe el edit: más dramática, tonos fríos…"><button type="button" id="ed-ia">Aplicar</button></div>' +
    '<div class="ed-linea"><button type="button" id="ed-censura">🔒 Censura: toca para tapar</button><button type="button" id="ed-censura-reset" hidden>Quitar censura</button></div>' +
    '<div class="ed-linea ed-acciones"><button type="button" id="ed-otra">Otra foto</button><button type="button" id="ed-estilo">Guardar estilo</button><button type="button" id="ed-guardar" class="ed-pri">Guardar foto</button></div></div>';
  document.body.appendChild(v);
  var $ = function (id) { return document.getElementById(id); }, cv = $('ed-canvas'), g = cv.getContext('2d', { willReadFrequently: true });
  var img = null, orig = null, p = Object.assign({}, BASE), prop = 'original', nombreEstilo = '', pend = 0;
  var censuras = [], modoCensura = false;
  function pixelar(cx, cy, r) {
    var x = Math.max(0, cx - r), y = Math.max(0, cy - r), w = Math.min(cv.width - x, r * 2), h = Math.min(cv.height - y, r * 2);
    if (w <= 1 || h <= 1) return;
    var bl = 6, tmp = document.createElement('canvas'); tmp.width = bl; tmp.height = bl;
    tmp.getContext('2d').drawImage(cv, x, y, w, h, 0, 0, bl, bl);
    g.imageSmoothingEnabled = false; g.drawImage(tmp, 0, 0, bl, bl, x, y, w, h); g.imageSmoothingEnabled = true;
  }
  var NOM = { brillo: 'Brillo', contraste: 'Contraste', saturacion: 'Color', calidez: 'Calidez', vineta: 'Viñeta', grano: 'Grano', tinte: 'Carmesí' };
  function nota(t) { $('ed-nota').textContent = t || ''; }
  function pintar() {
    if (!orig) return;
    cancelAnimationFrame(pend);
    pend = requestAnimationFrame(function () {
      var d = new ImageData(new Uint8ClampedArray(orig.data), orig.width, orig.height);
      aplicar(d.data, d.width, d.height, p); g.putImageData(d, 0, 0);
      censuras.forEach(function (c) { pixelar(c.x, c.y, Math.round(cv.width * 0.11)); });   // tapa lo que no quieres mostrar
      var t = $('ed-texto').value.trim();
      if (t) {
        var px = Math.max(18, Math.round(cv.width * 0.075)); g.textAlign = 'center'; g.lineJoin = 'round';
        var pt = t.split('/');
        if (pt.length >= 2) {                                                              // meme clásico: ARRIBA / ABAJO
          g.font = '900 ' + px + 'px Impact, "Arial Black", sans-serif'; g.lineWidth = px * 0.18; g.strokeStyle = '#000'; g.fillStyle = '#fff';
          var arr = pt[0].trim().toUpperCase(), aba = pt.slice(1).join('/').trim().toUpperCase();
          if (arr) { g.strokeText(arr, cv.width / 2, px * 1.15, cv.width * 0.94); g.fillText(arr, cv.width / 2, px * 1.15, cv.width * 0.94); }
          if (aba) { g.strokeText(aba, cv.width / 2, cv.height - px * 0.55, cv.width * 0.94); g.fillText(aba, cv.width / 2, cv.height - px * 0.55, cv.width * 0.94); }
        } else {
          g.font = 'italic 900 ' + px + 'px "Arial Black", Impact, sans-serif'; g.lineWidth = px * 0.16; g.strokeStyle = '#080408';
          g.strokeText(t, cv.width / 2, cv.height - px * 0.9, cv.width * 0.94);
          g.fillStyle = '#FFD700'; g.fillText(t, cv.width / 2, cv.height - px * 0.9, cv.width * 0.94);
        }
      }
    });
  }
  function cargar() {
    var r = recorte(img.naturalWidth, img.naturalHeight, prop), esc = Math.min(1, LADO / Math.max(r.w, r.h));
    cv.width = Math.max(1, Math.round(r.w * esc)); cv.height = Math.max(1, Math.round(r.h * esc));
    g.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, cv.width, cv.height);
    orig = g.getImageData(0, 0, cv.width, cv.height); censuras = []; actualizarCensura(); pintar();
  }
  function sliders() {
    $('ed-sliders').innerHTML = Object.keys(BASE).map(function (k) { var min = k === 'vineta' || k === 'grano' || k === 'tinte' ? 0 : -100; return '<label class="ed-sl"><span>' + NOM[k] + '</span><input type="range" min="' + min + '" max="100" value="' + p[k] + '" data-k="' + k + '"></label>'; }).join('');
  }
  function estilos() {
    var usos = ls(KU, {}), mios = ls(KE, {}), todos = Object.assign({}, ESTILOS, mios), gu = gusto(ls(KG, []));
    var nombres = Object.keys(todos).sort(function (a, b) { return (usos[b] || 0) - (usos[a] || 0); });
    if (gu) { todos['A tu gusto'] = gu; nombres.unshift('A tu gusto'); }
    nombres.unshift('Original'); todos.Original = BASE;
    $('ed-estilos').innerHTML = nombres.map(function (n) { return '<button type="button" data-estilo="' + n.replace(/"/g, '') + '"' + (n === nombreEstilo ? ' class="on"' : '') + '>' + n.replace(/</g, '') + '</button>'; }).join('');
    $('ed-estilos')._todos = todos;
  }
  function props() { $('ed-props').innerHTML = ['original', '1:1', '4:5', '9:16', '16:9'].map(function (x) { return '<button type="button" data-prop="' + x + '"' + (x === prop ? ' class="on"' : '') + '>' + (x === 'original' ? 'Sin recorte' : x) + '</button>'; }).join(''); }
  function elegir() { $('ed-file').click(); }
  $('ed-elegir').addEventListener('click', elegir); $('ed-otra').addEventListener('click', elegir);
  $('ed-cerrar').addEventListener('click', function () { v.remove(); });
  $('ed-file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var u = URL.createObjectURL(f), im = new Image();
    im.onload = function () { img = im; $('ed-elegir').hidden = true; $('ed-panel').hidden = false; p = Object.assign({}, BASE); nombreEstilo = 'Original'; prop = 'original'; sliders(); estilos(); props(); cargar(); nota(''); };
    im.onerror = function () { nota('No pude abrir esa imagen.'); };
    im.src = u; e.target.value = '';
  });
  $('ed-estilos').addEventListener('click', function (e) { var b = e.target.closest('[data-estilo]'); if (!b) return; nombreEstilo = b.getAttribute('data-estilo'); p = Object.assign({}, BASE, $('ed-estilos')._todos[nombreEstilo]); sliders(); estilos(); pintar(); });
  $('ed-props').addEventListener('click', function (e) { var b = e.target.closest('[data-prop]'); if (!b || !img) return; prop = b.getAttribute('data-prop'); props(); cargar(); });
  $('ed-sliders').addEventListener('input', function (e) { var k = e.target.getAttribute('data-k'); if (!k) return; p[k] = parseInt(e.target.value, 10); nombreEstilo = ''; pintar(); });
  $('ed-texto').addEventListener('input', pintar);
  function actualizarCensura() { var b = $('ed-censura-reset'); if (b) b.hidden = censuras.length === 0; }
  cv.addEventListener('click', function (e) {
    if (!modoCensura || !orig) return;
    var rect = cv.getBoundingClientRect();
    censuras.push({ x: Math.round((e.clientX - rect.left) / rect.width * cv.width), y: Math.round((e.clientY - rect.top) / rect.height * cv.height) });
    actualizarCensura(); pintar();
  });
  $('ed-censura').addEventListener('click', function () {
    modoCensura = !modoCensura; this.classList.toggle('on', modoCensura);
    nota(modoCensura ? 'Toca la foto para tapar lo que no quieres mostrar. Pulsa de nuevo el botón al terminar.' : '');
  });
  $('ed-censura-reset').addEventListener('click', function () { censuras = []; actualizarCensura(); pintar(); nota('Censura quitada.'); });
  $('ed-ia').addEventListener('click', async function () {
    var t = $('ed-desc').value.trim(); if (!t) return;
    if (!window._asagiPensar) { nota('Para entender descripciones necesito un cerebro («conecta gemini»).'); return; }
    nota('Pensando el edit…');
    var a = null; try { a = leerAjustes(await window._asagiPensar(promptEdit(t))); } catch (e) {}
    if (!a) { nota('No lo entendí; prueba con otras palabras.'); return; }
    p = a; nombreEstilo = ''; sliders(); estilos(); pintar(); nota('Listo: ajústalo si quieres.');
  });
  $('ed-estilo').addEventListener('click', function () {
    var n = ($('ed-desc').value.trim() || $('ed-texto').value.trim() || 'Mi estilo ' + (Object.keys(ls(KE, {})).length + 1)).slice(0, 18);
    var m = ls(KE, {}); m[n] = limpiar(p); var ks = Object.keys(m); if (ks.length > 12) delete m[ks[0]]; gs(KE, m); nombreEstilo = n; estilos(); nota('Estilo «' + n + '» guardado.');
  });
  $('ed-guardar').addEventListener('click', async function () {
    if (!orig) return; nota('Guardando…');
    var gl = ls(KG, []); gl.push(limpiar(p)); gs(KG, gl.slice(-30));                          // aprende tu gusto
    if (nombreEstilo && nombreEstilo !== 'Original') { var u = ls(KU, {}); u[nombreEstilo] = (u[nombreEstilo] || 0) + 1; gs(KU, u); }
    var url = cv.toDataURL('image/jpeg', 0.92), nombre = 'ASAGI_' + new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '') + '.jpg';
    var C = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiControl, ok = false;
    if (C && C.guardarImagen) { try { var r = await C.guardarImagen({ base64: url.split(',')[1], nombre: nombre }); ok = !!(r && r.ok); } catch (e) {} }
    if (!ok) { try { var a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); ok = !C; } catch (e) {} }
    nota(ok ? 'Guardada en tu galería (carpeta ASAGI).' : 'No pude guardarla aquí (actualiza la app).');
    if (ok && window.AsagiEfectos) window.AsagiEfectos.grito('¡EDIT!');
    estilos();
  });
  if (decir) decir('🎨 Abrí el editor. Elige una foto: estilos y ajustes, «Arriba / Abajo» para meme, y 🔒 Censura para tapar lo privado. Mientras más guardes, mejor aprendo tu gusto.');
}

var API = { BASE: BASE, ESTILOS: ESTILOS, limpiar: limpiar, aplicar: aplicar, recorte: recorte, gusto: gusto, promptEdit: promptEdit, leerAjustes: leerAjustes, parsear: parsear, abrir: abrir };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiEditor = API;
})();
