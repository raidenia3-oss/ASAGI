// Guía «Usar Gemini gratis»: en 3 toques ASAGI queda con cerebro en la nube.
//   1) abre la página de keys de Google  2) pegas la key  3) ASAGI la prueba y la guarda.
// Se abre tocando el aviso amarillo del chat o diciendo «conecta gemini» / «usar gemini gratis».
// La key se queda solo en el celular (igual que el campo de Ajustes); nunca va al chat.
(function () {
'use strict';
var URL_KEYS = 'https://aistudio.google.com/apikey';
function pareceKey(k) { return /^AIza[0-9A-Za-z_\-]{30,45}$/.test(String(k || '').trim()); }

function abrirPagina() {
  var C = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiControl;
  if (C && C.accion) return C.accion({ tipo: 'url', url: URL_KEYS }).catch(function () { window.open(URL_KEYS, '_blank'); });
  window.open(URL_KEYS, '_blank');
}

async function probar(k) {
  var R = window.AsagiBrainRouter;
  if (!R || !R.geminiResponder) return { ok: false, error: 'falta el módulo del cerebro' };
  try { var r = await R.geminiResponder('Responde solo con la palabra: listo', k); return { ok: !!(r && r.text) }; }
  catch (e) {
    var m = String((e && e.message) || e);
    return { ok: false, error: /400|403/.test(m) ? 'Google dice que esa key no es válida. Cópiala de nuevo.' : /429/.test(m) ? 'Esa key está sin cuota ahora; prueba en un rato o crea otra.' : 'No pude probarla (' + m + '). ¿Tienes internet?' };
  }
}

function abrir() {
  if (document.querySelector('.gg-fondo')) return;
  var fondo = document.createElement('div'); fondo.className = 'gg-fondo';
  fondo.innerHTML =
    '<div class="gg-hoja" role="dialog" aria-modal="true" aria-labelledby="gg-tit">' +
      '<h3 id="gg-tit">🔑 Cerebro gratis con Gemini</h3>' +
      '<ol class="gg-pasos">' +
        '<li><b>Abre la página de Google</b> e inicia sesión con tu Gmail.<br><button type="button" class="gg-abrir">Abrir página de keys</button></li>' +
        '<li>Toca <b>«Create API key»</b> y luego <b>copiar</b>.</li>' +
        '<li><b>Pégala aquí</b> y listo:<div class="gg-fila"><input class="gg-key" type="password" placeholder="AIza…" autocomplete="off" spellcheck="false" aria-label="Key de Gemini"><button type="button" class="gg-pegar">Pegar</button></div></li>' +
      '</ol>' +
      '<p class="gg-msg" role="status" aria-live="polite"></p>' +
      '<div class="gg-acciones"><button type="button" class="gg-cerrar secondary">Ahora no</button><button type="button" class="gg-guardar">Probar y guardar</button></div>' +
      '<p class="gg-nota">Es gratis. La key se guarda solo en tu celular.</p>' +
    '</div>';
  document.body.appendChild(fondo);
  var inp = fondo.querySelector('.gg-key'), msg = fondo.querySelector('.gg-msg'), btn = fondo.querySelector('.gg-guardar');
  var cerrar = function () { fondo.remove(); };
  fondo.addEventListener('click', function (e) { if (e.target === fondo) cerrar(); });
  fondo.querySelector('.gg-cerrar').addEventListener('click', cerrar);
  fondo.querySelector('.gg-abrir').addEventListener('click', abrirPagina);
  fondo.querySelector('.gg-pegar').addEventListener('click', async function () {
    try { var t = await navigator.clipboard.readText(); if (t) { inp.value = t.trim(); msg.textContent = pareceKey(t) ? 'Key pegada ✓' : 'Eso no parece una key (empieza con AIza).'; } }
    catch (e) { inp.focus(); msg.textContent = 'Mantén presionado el campo y elige «Pegar».'; }
  });
  btn.addEventListener('click', async function () {
    var k = inp.value.trim();
    if (!pareceKey(k)) { msg.textContent = 'Eso no parece una key de Gemini (empieza con «AIza» y es larga).'; return; }
    btn.disabled = true; msg.textContent = 'Probando con Google…';
    var r = await probar(k);
    btn.disabled = false;
    if (!r.ok) { msg.textContent = '⚠ ' + r.error; return; }
    if (window._asagiGuardarKeyGemini) window._asagiGuardarKeyGemini(k);
    msg.textContent = '✅ ¡Listo! Ya pienso con Gemini.';
    setTimeout(function () {
      cerrar();
      try { if (window._asagiDecir) window._asagiDecir('🧠 Ya tengo cerebro (Gemini). Pregúntame lo que quieras: pienso, uso mis herramientas y te respondo.'); } catch (e) {}
    }, 900);
  });
  setTimeout(function () { try { fondo.querySelector('.gg-abrir').focus(); } catch (e) {} }, 50);
}

// el aviso amarillo del chat abre la guía cuando habla de Gemini
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('#brain-alert.abre-guia');
  if (a && !e.target.closest('.brain-alert-x')) { e.preventDefault(); abrir(); }
}, true);

var API = { abrir: abrir, pareceKey: pareceKey };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiGeminiGuia = API;
})();
