// Efectos «sakuga» (idea de sakuga-vfx: controles que se mueven como anime), hechos a mano y sin librerías:
//   · rebote elástico al tocar botones (CSS, en tema-asagi.css)
//   · destello de impacto (líneas + chispas) al enviar un mensaje y al completar algo (✅)
// Un solo <canvas> que existe solo ~0,5 s por destello (cero RAM en reposo). Paleta fija. Respeta «reducir movimiento».
(function () {
'use strict';
var ORO = '255, 215, 0', CARMESI = '220, 20, 60', BLANCO = '240, 240, 248';
// PURO: rayos de un destello (ángulo, largo, grosor, color) — determinista con semilla para probarlo.
function rayos(n, semilla) {
  var out = [], s = semilla || 1;
  function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
  for (var i = 0; i < n; i++) out.push({ a: (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5, l: 0.55 + rnd() * 0.45, g: 1 + rnd() * 2.2, c: i % 3 === 0 ? ORO : i % 3 === 1 ? CARMESI : BLANCO });
  return out;
}
function quieto() { try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
var vivo = null;
function destello(x, y, fuerza) {
  if (quieto() || document.hidden) return;
  if (vivo) { vivo.remove(); vivo = null; }
  var R = 46 * (fuerza || 1), T = 420, c = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1), lado = R * 2 + 20;
  c.width = c.height = lado * dpr;
  c.style.cssText = 'position:fixed;left:' + (x - lado / 2) + 'px;top:' + (y - lado / 2) + 'px;width:' + lado + 'px;height:' + lado + 'px;pointer-events:none;z-index:9999;';
  document.body.appendChild(c); vivo = c;
  var g = c.getContext('2d'), rs = rayos(14, (Date.now() % 9973) + 1), t0 = performance.now();
  g.scale(dpr, dpr); g.lineCap = 'round';
  (function cuadro(now) {
    var k = Math.max(0, Math.min(1, (now - t0) / T)), e = 1 - Math.pow(1 - k, 3);          // sale rápido y frena (como un golpe dibujado)
    g.clearRect(0, 0, lado, lado);
    g.strokeStyle = 'rgba(' + ORO + ',' + (0.7 * (1 - k)).toFixed(2) + ')'; g.lineWidth = 2.5 * (1 - k) + 0.5;
    g.beginPath(); g.arc(lado / 2, lado / 2, R * 0.75 * e, 0, Math.PI * 2); g.stroke();
    rs.forEach(function (r) {
      var d0 = R * (0.25 + 0.75 * e * 0.55) * r.l, d1 = R * e * r.l;
      g.strokeStyle = 'rgba(' + r.c + ',' + (1 - k).toFixed(2) + ')'; g.lineWidth = r.g * (1 - k * 0.6);
      g.beginPath(); g.moveTo(lado / 2 + Math.cos(r.a) * d0, lado / 2 + Math.sin(r.a) * d0); g.lineTo(lado / 2 + Math.cos(r.a) * d1, lado / 2 + Math.sin(r.a) * d1); g.stroke();
    });
    if (k < 1 && vivo === c) requestAnimationFrame(cuadro); else { c.remove(); if (vivo === c) vivo = null; }
  })(t0);
}
// Onomatopeya estilo manga para momentos clave (subir de nivel…): letras grandes inclinadas que entran de golpe y se van.
// Con moderación: como mucho una cada 20 s. Es solo adorno (aria-hidden).
var ultGrito = 0;
function grito(texto) {
  if (quieto() || document.hidden || Date.now() - ultGrito < 20000) return false;
  ultGrito = Date.now();
  var d = document.createElement('div'); d.className = 'sk-grito'; d.setAttribute('aria-hidden', 'true'); d.textContent = String(texto).slice(0, 14);
  document.body.appendChild(d);
  destello(window.innerWidth / 2, window.innerHeight * 0.38, 2.2);
  setTimeout(function () { d.remove(); }, 1300);
  return true;
}
function sobre(el, fuerza) { if (!el || !el.getBoundingClientRect) return; var r = el.getBoundingClientRect(); if (r.width) destello(r.left + r.width / 2, r.top + r.height / 2, fuerza); }

if (typeof document !== 'undefined') {
  document.addEventListener('submit', function (e) { if (e.target && e.target.id === 'chat-form') sobre(e.target.querySelector('button[type="submit"]') || e.target, 0.8); }, true);
}
var API = { rayos: rayos, destello: destello, sobre: sobre, grito: grito };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiEfectos = API;
})();
