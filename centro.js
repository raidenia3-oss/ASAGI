// Centro de control (idea robada del reel de iControl): arriba de Ajustes, todo a un toque.
// Música (la de ASAGI), linterna, WiFi, Bluetooth, datos, avión, ubicación, volumen deslizable, alarma, temporizador,
// calculadora y el enlace con ARIA. Usa las acciones nativas que ASAGI ya tiene (AsagiControl.accion / AsagiMusica).
// Lo que Android no deja cambiar directo (WiFi, Bluetooth, avión…) abre su panel rápido del sistema.
(function () {
'use strict';
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

// PURO: qué mostrar en la tarjeta de música
function textoMusica(e) {
  if (!e || !e.activo || !e.pista) return { titulo: 'Sin música', sub: 'Toca ▶ y suena', sonando: false };
  var p = e.pista;
  return { titulo: p.titulo || p.nombre || 'Canción', sub: p.artista || p.album || 'Tu música', sonando: !!e.sonando };
}
// PURO: posición del dedo en la barra vertical -> % de volumen (arriba = 100)
function volumenDe(y, alto) { if (!(alto > 0)) return 50; return Math.max(0, Math.min(100, Math.round((1 - y / alto) * 100))); }

function P() { return (window.Capacitor && window.Capacitor.Plugins) || {}; }
function accion(o) { var C = P().AsagiControl; return C && C.accion ? C.accion(o) : Promise.reject(new Error('necesita la app nativa')); }
function aviso(t) { if (window._asagiAviso) window._asagiAviso(t, false, '⚙'); }
function alChat(frase, enviar) {
  if (window.setActiveSection) window.setActiveSection('assistant');
  var i = document.getElementById('message-input'); if (!i) return;
  i.value = frase; i.dispatchEvent(new Event('input', { bubbles: true }));
  if (enviar) { var f = document.getElementById('chat-form'); if (f) f.requestSubmit(); } else { i.focus(); try { i.setSelectionRange(frase.length, frase.length); } catch (e) {} }
}

var FICHAS = [
  { id: 'linterna', ico: '🔦', txt: 'Linterna' },
  { id: 'wifi', ico: '📶', txt: 'WiFi' },
  { id: 'bluetooth', ico: 'ᛒ', txt: 'Bluetooth' },
  { id: 'datos', ico: '⇅', txt: 'Datos' },
  { id: 'avion', ico: '✈', txt: 'Avión' },
  { id: 'ubicacion', ico: '◉', txt: 'Ubicación' },
  { id: 'alarma', ico: '⏰', txt: 'Alarma' },
  { id: 'temporizador', ico: '⏱', txt: 'Tiempo' },
  { id: 'calculadora', ico: '🧮', txt: 'Cuentas' },
  { id: 'aria', ico: '🖥', txt: 'ARIA' }
];

function montar() {
  var st = document.getElementById('status'); if (!st || document.getElementById('centro')) return;
  var c = document.createElement('div'); c.id = 'centro'; c.className = 'centro';
  c.innerHTML =
    '<div class="cc-musica" aria-live="polite"><div class="cc-disco" aria-hidden="true">♪</div>' +
      '<div class="cc-m-txt"><b class="cc-m-tit">Sin música</b><small class="cc-m-sub">Toca ▶ y suena</small></div>' +
      '<div class="cc-m-btns"><button type="button" data-m="anterior" aria-label="Anterior">⏮</button><button type="button" data-m="alternar" class="cc-play" aria-label="Reproducir o pausar">▶</button><button type="button" data-m="siguiente" aria-label="Siguiente">⏭</button></div></div>' +
    '<div class="cc-fila"><div class="cc-fichas">' + FICHAS.map(function (f) {
      return '<button type="button" class="cc-ficha" data-f="' + f.id + '"><span class="cc-ico">' + f.ico + '</span><span class="cc-lbl">' + f.txt + '</span></button>';
    }).join('') + '</div>' +
    '<div class="cc-vol" role="slider" aria-label="Volumen" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" tabindex="0"><i class="cc-vol-lleno"></i><span class="cc-vol-ico">🔊</span></div></div>';
  var hdr = st.querySelector('.panel-header'); if (hdr && hdr.nextSibling) st.insertBefore(c, hdr.nextSibling); else st.appendChild(c);

  var linterna = false;
  c.addEventListener('click', function (e) {
    var b = e.target.closest('[data-f]'); var m = e.target.closest('[data-m]');
    if (m) { musica(m.getAttribute('data-m')); return; }
    if (!b) return;
    var f = b.getAttribute('data-f');
    if (f === 'linterna') { accion({ tipo: 'linterna', encender: !linterna }).then(function (r) { if (r && r.ok !== false) { linterna = !linterna; b.classList.toggle('on', linterna); } else aviso((r && r.error) || 'No pude'); }).catch(function (x) { aviso(x.message); }); return; }
    if (/^(wifi|bluetooth|datos|ubicacion)$/.test(f)) { accion({ tipo: 'panel', que: f }).catch(function (x) { aviso(x.message); }); return; }
    if (f === 'avion') { accion({ tipo: 'panel', que: 'modo avion' }).catch(function (x) { aviso(x.message); }); return; }
    if (f === 'alarma') { alChat('pon una alarma a las ', false); return; }
    if (f === 'temporizador') { alChat('temporizador de ', false); return; }
    if (f === 'calculadora') { alChat('cuánto es ', false); return; }
    if (f === 'aria') { alChat('enlace pc', true); return; }
  });

  // volumen: desliza el dedo arriba/abajo por la píldora
  var vol = c.querySelector('.cc-vol'), lleno = c.querySelector('.cc-vol-lleno'), t = null;
  function pintarVol(p) { lleno.style.height = p + '%'; vol.setAttribute('aria-valuenow', p); vol.querySelector('.cc-vol-ico').textContent = p === 0 ? '🔇' : p < 50 ? '🔉' : '🔊'; }
  function ponerVol(ev) {
    var r = vol.getBoundingClientRect(), p = volumenDe(ev.clientY - r.top, r.height); pintarVol(p);
    clearTimeout(t); t = setTimeout(function () { accion({ tipo: 'volumen', dir: 'poner', valor: p }).catch(function () {}); }, 120);
  }
  vol.addEventListener('pointerdown', function (ev) { ev.preventDefault(); try { vol.setPointerCapture(ev.pointerId); } catch (x) {} ponerVol(ev); });
  vol.addEventListener('pointermove', function (ev) { if (ev.buttons) ponerVol(ev); });
  vol.addEventListener('keydown', function (ev) { var p = +vol.getAttribute('aria-valuenow'); if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') { p = Math.max(0, Math.min(100, p + (ev.key === 'ArrowUp' ? 10 : -10))); pintarVol(p); accion({ tipo: 'volumen', dir: 'poner', valor: p }).catch(function () {}); ev.preventDefault(); } });
  pintarVol(50);

  function pintarMusica(e) {
    var x = textoMusica(e);
    c.querySelector('.cc-m-tit').textContent = x.titulo; c.querySelector('.cc-m-sub').textContent = x.sub;
    c.querySelector('.cc-play').textContent = x.sonando ? '⏸' : '▶';
    c.querySelector('.cc-musica').classList.toggle('sonando', x.sonando);
  }
  function musica(cmd) {
    var M = P().AsagiMusica;
    if (!M) { aviso('La música necesita la app nativa'); return; }
    M.estado().then(function (e) {
      if (!e || !e.activo) { alChat('pon mi música', true); return null; }
      return M[cmd] ? M[cmd]() : null;
    }).then(function () { return setTimeout(refrescar, 350); }).catch(function () {});
  }
  function refrescar() {
    var M = P().AsagiMusica; if (M && M.estado) M.estado().then(pintarMusica).catch(function () {});
  }
  // se actualiza al bajar a Ajustes
  var obs = new MutationObserver(function () { if (st.classList.contains('active')) refrescar(); });
  obs.observe(st, { attributes: true, attributeFilter: ['class'] });
  refrescar();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else setTimeout(montar, 0);
}
var API = { textoMusica: textoMusica, volumenDe: volumenDe };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiCentro = API;
})();
