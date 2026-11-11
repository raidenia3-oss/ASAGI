;(function () {
// ASAGI - Avatar vivo del asistente (idea robada de livliv-dev/player: personaje
// con lip-sync y expresiones, pero SIN su libreria WebGL: aqui es ligero, en
// canvas 2D, pensado para movil). Una cara-visor estilo anime/cyberpunk que:
//   - respira y parpadea en reposo,
//   - entrecierra los ojos y orbita puntos cuando "piensa",
//   - mueve la boca cuando ASAGI habla (lee speechSynthesis.speaking).
//
// La LOGICA de animacion (apertura de boca, parpadeo, orbita) es PURA y testeable.
// El dibujo usa canvas; el estado de habla entra por callback (o speechSynthesis).

'use strict';

var ESTADOS = ['reposo', 'escuchando', 'pensando', 'hablando', 'feliz'];

// Apertura de boca 0..1. Si habla, oscila como una voz (mezcla de senos para que
// no sea un parpadeo mecanico); si no, cerrada. PURA.
function bocaApertura(tms, hablando) {
  if (!hablando) return 0;
  var t = tms / 1000;
  var v = 0.5 + 0.5 * Math.sin(t * 22) * 0.6 + 0.4 * Math.sin(t * 13.3 + 1.1) * 0.5;
  if (v < 0) v = 0; else if (v > 1) v = 1;
  return 0.12 + v * 0.88;                 // nunca del todo cerrada mientras habla
}

// Apertura de ojo 0..1 (1 abierto, 0 cerrado). Parpadeo ocasional. PURA y
// determinista en el tiempo: un parpadeo rapido cada ~3.4 s.
function parpadeo(tms) {
  var ciclo = 3400;
  var f = tms % ciclo;
  var durac = 130;                        // ms que dura el parpadeo
  if (f > ciclo - durac) {
    var p = (f - (ciclo - durac)) / durac; // 0..1
    return Math.abs(Math.cos(p * Math.PI)); // 1->0->1
  }
  return 1;
}

// Posicion de un punto en orbita (para "pensando"). PURA.
function orbita(tms, i, n, radio) {
  var ang = (tms / 1000) * 2.2 + (i * 2 * Math.PI / n);
  return { x: Math.cos(ang) * radio, y: Math.sin(ang) * radio * 0.55 };
}

function _leerColor() {
  try {
    var c = getComputedStyle(document.documentElement).getPropertyValue('--cyan');
    return (c && c.trim()) || '#37c2c7';
  } catch (e) { return '#37c2c7'; }
}

function _hex(c) {
  // normaliza a {r,g,b}
  var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((c || '').trim());
  if (!m) return { r: 56, g: 189, b: 248 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

// Crea el avatar sobre un <canvas>. Devuelve { setEstado, estado, destruir, mirar }.
// Cara de ASAGI (original): rostro anime en tinta con ojos asagi-iro, aro dorado,
// flequillo, horquilla dorada con borla carmesi. Estados: reposo, escuchando,
// pensando, hablando, feliz. La mirada sigue el dedo/puntero.
function crearAvatar(canvas, opts) {
  opts = opts || {};
  var ctx = canvas.getContext('2d');
  var estado = 'reposo';
  var raf = null, t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  var apagado = false;
  var mira = { x: 0, y: 0 }, miraObj = { x: 0, y: 0 }, ultimoToque = 0;
  var P = { asagi: '#3cc4c9', oro: '#e2b04a', carmin: '#e8507a', tinta: '#0c2427', tinta2: '#123a3e', piel: '#f3ece6', piel2: '#e6d6cf' };

  var hablandoFn = opts.speaking || function () {
    try { return !!(window.speechSynthesis && window.speechSynthesis.speaking); } catch (e) { return false; }
  };

  function medir() {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round((r.width || 160) * dpr));
    var h = Math.max(1, Math.round((r.height || 160) * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    return { w: w, h: h };
  }
  function al(hex, a) { var c = _hex(hex); return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')'; }

  function mirar(nx, ny) { miraObj.x = Math.max(-1, Math.min(1, nx)); miraObj.y = Math.max(-1, Math.min(1, ny)); ultimoToque = Date.now(); }
  function alPuntero(e) {
    var r = canvas.getBoundingClientRect(); if (!r.width) return;
    var x = (e.touches ? e.touches[0].clientX : e.clientX), y = (e.touches ? e.touches[0].clientY : e.clientY);
    mirar((x - (r.left + r.width / 2)) / (window.innerWidth / 2), (y - (r.top + r.height / 2)) / (window.innerHeight / 2));
  }
  try { window.addEventListener('pointermove', alPuntero, { passive: true }); window.addEventListener('touchstart', alPuntero, { passive: true }); } catch (e) {}

  function frame(now) {
    if (apagado) return;
    var t = now - t0, m = medir(), W = m.w, H = m.h;
    var R = Math.min(W, H) * 0.36;
    var habla = estado === 'hablando' || hablandoFn();
    var piensa = estado === 'pensando', escucha = estado === 'escuchando', feliz = estado === 'feliz';
    // mirada: sigue el dedo; si no hay toque, deriva sola; al pensar mira arriba-derecha
    if (piensa) { miraObj.x = 0.55; miraObj.y = -0.6; }
    else if (Date.now() - ultimoToque > 4000) { miraObj.x = Math.sin(t / 2300) * 0.35; miraObj.y = Math.sin(t / 3100) * 0.18; }
    mira.x += (miraObj.x - mira.x) * 0.08; mira.y += (miraObj.y - mira.y) * 0.08;
    var respira = Math.sin(t / 1500) * R * 0.018;
    var ladeo = (escucha ? 0.07 : 0) + Math.sin(t / 2700) * 0.015;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2 + R * 0.08 + respira);

    // sello: halo + anillo de marcas que gira lento (dorado), pulsa al escuchar/hablar
    var pulso = (escucha || habla) ? 0.5 + 0.5 * Math.sin(t / 180) : 0;
    var g = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 1.75);
    g.addColorStop(0, al(P.asagi, 0.22 + pulso * 0.12)); g.addColorStop(1, al(P.asagi, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 1.75, 0, 7); ctx.fill();
    ctx.save(); ctx.rotate(t / 26000);
    for (var k = 0; k < 60; k++) {
      var an = k * Math.PI / 30, larga = k % 5 === 0;
      ctx.strokeStyle = al(P.oro, larga ? 0.55 : 0.22); ctx.lineWidth = Math.max(1, R * (larga ? 0.018 : 0.01));
      ctx.beginPath(); ctx.moveTo(Math.cos(an) * R * 1.42, Math.sin(an) * R * 1.42);
      ctx.lineTo(Math.cos(an) * R * (larga ? 1.52 : 1.48), Math.sin(an) * R * (larga ? 1.52 : 1.48)); ctx.stroke();
    }
    ctx.restore();

    ctx.rotate(ladeo);
    var hx = mira.x * R * 0.05, hy = mira.y * R * 0.03;   // la cabeza acompaña un poco la mirada

    // pelo de atras (tinta)
    var gp = ctx.createLinearGradient(0, -R * 1.2, 0, R * 1.2);
    gp.addColorStop(0, P.tinta2); gp.addColorStop(1, P.tinta);
    ctx.fillStyle = gp;
    ctx.beginPath();
    ctx.moveTo(-R * 0.95, R * 1.05);
    ctx.bezierCurveTo(-R * 1.25, R * 0.1, -R * 1.05, -R * 1.25, hx, -R * 1.18);
    ctx.bezierCurveTo(R * 1.05, -R * 1.25, R * 1.25, R * 0.1, R * 0.95, R * 1.05);
    ctx.lineTo(R * 0.55, R * 0.55); ctx.lineTo(-R * 0.55, R * 0.55); ctx.closePath(); ctx.fill();

    // cara
    ctx.save(); ctx.translate(hx, hy);
    var gf = ctx.createLinearGradient(0, -R * 0.9, 0, R * 0.95);
    gf.addColorStop(0, P.piel); gf.addColorStop(1, P.piel2);
    ctx.fillStyle = gf;
    ctx.beginPath();
    ctx.moveTo(0, R * 0.92);
    ctx.bezierCurveTo(R * 0.42, R * 0.86, R * 0.74, R * 0.42, R * 0.76, -R * 0.1);
    ctx.bezierCurveTo(R * 0.8, -R * 0.75, R * 0.4, -R * 0.95, 0, -R * 0.95);
    ctx.bezierCurveTo(-R * 0.4, -R * 0.95, -R * 0.8, -R * 0.75, -R * 0.76, -R * 0.1);
    ctx.bezierCurveTo(-R * 0.74, R * 0.42, -R * 0.42, R * 0.86, 0, R * 0.92);
    ctx.fill();
    // mejillas
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      var gb = ctx.createRadialGradient(sgn * R * 0.42, R * 0.32, 0, sgn * R * 0.42, R * 0.32, R * 0.2);
      gb.addColorStop(0, al(P.carmin, feliz ? 0.38 : 0.22)); gb.addColorStop(1, al(P.carmin, 0));
      ctx.fillStyle = gb; ctx.beginPath(); ctx.arc(sgn * R * 0.42, R * 0.32, R * 0.2, 0, 7); ctx.fill();
    }

    // ojos
    var ab = feliz ? 0 : (piensa ? 0.7 : parpadeo(t)) * (escucha ? 1.08 : 1);
    var ix = mira.x * R * 0.06, iy = mira.y * R * 0.05;
    for (var lado = -1; lado <= 1; lado += 2) ojo(lado * R * 0.33, R * 0.06, lado, ab, ix, iy);

    // boca
    var apb = habla ? bocaApertura(t, true) : 0;
    ctx.save(); ctx.translate(0, R * 0.55);
    if (apb > 0.05) {
      ctx.fillStyle = '#7a2238';
      ctx.beginPath(); ctx.ellipse(0, R * 0.02, R * 0.07 + apb * R * 0.03, R * 0.02 + apb * R * 0.07, 0, 0, 7); ctx.fill();
      ctx.fillStyle = al(P.carmin, 0.8); ctx.beginPath(); ctx.ellipse(0, R * 0.05 + apb * R * 0.03, R * 0.04, R * 0.02 * apb + 0.5, 0, 0, 7); ctx.fill();
    } else {
      ctx.strokeStyle = '#8a3a4c'; ctx.lineWidth = R * 0.025;
      var curva = feliz ? R * 0.07 : (piensa ? -R * 0.01 : R * 0.025);
      ctx.beginPath(); ctx.moveTo(-R * 0.08, 0); ctx.quadraticCurveTo(0, curva, R * 0.08, 0); ctx.stroke();
    }
    ctx.restore();

    // flequillo (mechones en punta) por delante
    ctx.fillStyle = gp;
    ctx.beginPath();
    ctx.moveTo(-R * 0.86, R * 0.05);
    ctx.bezierCurveTo(-R * 0.9, -R * 0.9, -R * 0.4, -R * 1.12, 0, -R * 1.08);
    ctx.bezierCurveTo(R * 0.45, -R * 1.12, R * 0.92, -R * 0.9, R * 0.86, R * 0.05);
    var puntas = [[0.8, -0.02], [0.66, -0.46], [0.5, -0.06], [0.34, -0.52], [0.16, -0.12], [0.04, -0.56], [-0.1, -0.04], [-0.28, -0.5], [-0.44, -0.08], [-0.62, -0.48], [-0.8, -0.04]];
    for (var q = 0; q < puntas.length; q++) {
      var pp = puntas[q], vaiven = Math.sin(t / 1300 + q) * R * 0.006;
      ctx.lineTo(pp[0] * R + vaiven, pp[1] * R);
    }
    ctx.closePath(); ctx.fill();
    // brillo del pelo
    ctx.strokeStyle = al(P.asagi, 0.35); ctx.lineWidth = R * 0.03;
    ctx.beginPath(); ctx.arc(0, -R * 0.2, R * 0.78, Math.PI * 1.22, Math.PI * 1.42); ctx.stroke();
    // mechones laterales
    for (lado = -1; lado <= 1; lado += 2) {
      ctx.fillStyle = gp; ctx.beginPath();
      ctx.moveTo(lado * R * 0.8, -R * 0.2);
      ctx.quadraticCurveTo(lado * R * 0.9, R * 0.5, lado * R * (0.62 + Math.sin(t / 1600 + lado) * 0.02), R * 1.0);
      ctx.quadraticCurveTo(lado * R * 0.7, R * 0.4, lado * R * 0.66, -R * 0.1); ctx.closePath(); ctx.fill();
    }
    // cejas
    ctx.strokeStyle = al('#061416', 0.85); ctx.lineCap = 'round'; ctx.lineWidth = R * 0.035;
    var cejaY = -R * 0.2 - (escucha ? R * 0.04 : 0) + (piensa ? -R * 0.02 : 0);
    for (lado = -1; lado <= 1; lado += 2) {
      ctx.beginPath(); ctx.moveTo(lado * R * 0.18, cejaY + R * 0.02);
      ctx.quadraticCurveTo(lado * R * 0.33, cejaY - R * 0.05 - (piensa && lado > 0 ? R * 0.04 : 0), lado * R * 0.48, cejaY + R * 0.01); ctx.stroke();
    }

    // horquilla dorada + borla carmesi (firma)
    ctx.save(); ctx.translate(R * 0.56, -R * 0.62); ctx.rotate(0.5);
    ctx.fillStyle = P.oro; ctx.shadowColor = al(P.oro, 0.7); ctx.shadowBlur = R * 0.12;
    ctx.beginPath(); ctx.moveTo(0, -R * 0.1); ctx.lineTo(R * 0.07, 0); ctx.lineTo(0, R * 0.1); ctx.lineTo(-R * 0.07, 0); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillRect(-R * 0.012, R * 0.08, R * 0.024, R * 0.12);
    var bor = Math.sin(t / 900) * 0.15;
    ctx.save(); ctx.translate(0, R * 0.2); ctx.rotate(-0.5 + bor);
    ctx.fillStyle = P.carmin; ctx.beginPath(); ctx.moveTo(-R * 0.035, 0); ctx.lineTo(R * 0.035, 0); ctx.lineTo(R * 0.05, R * 0.26); ctx.lineTo(-R * 0.05, R * 0.26); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.restore();

    ctx.restore(); // cara

    // chispas en orbita al pensar
    if (piensa) {
      for (var i = 0; i < 3; i++) {
        var o = orbita(t, i, 3, R * 1.1);
        ctx.fillStyle = al(i === 1 ? P.oro : P.asagi, 0.9 - i * 0.2);
        ctx.beginPath(); ctx.arc(o.x, o.y - R * 1.05, R * 0.045, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
    raf = requestAnimationFrame(frame);
  }

  // ojo anime: blanco en almendra, iris asagi con aro dorado, pupila, 2 brillos, pestaña
  function ojo(x, y, lado, ab, ix, iy) {
    var R = Math.min(canvas.width, canvas.height) * 0.36;
    var w = R * 0.25, h = R * 0.3;
    ctx.save(); ctx.translate(x, y);
    if (ab < 0.08) {               // cerrado / feliz: arco ^
      ctx.strokeStyle = P.tinta; ctx.lineWidth = R * 0.045; ctx.lineCap = 'round';
      ctx.beginPath();
      if (estado === 'feliz') { ctx.moveTo(-w * 0.9, h * 0.15); ctx.quadraticCurveTo(0, -h * 0.55, w * 0.9, h * 0.15); }
      else { ctx.moveTo(-w * 0.9, 0); ctx.quadraticCurveTo(0, h * 0.25, w * 0.9, 0); }
      ctx.stroke(); ctx.restore(); return;
    }
    ctx.save(); ctx.scale(1, Math.max(0.08, ab));
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.95, h * 0.55, 0, 0, 7); ctx.fillStyle = '#fbfaf7'; ctx.fill();
    ctx.clip();
    var gi = ctx.createLinearGradient(0, -h * 0.5, 0, h * 0.5);
    gi.addColorStop(0, '#0d3c40'); gi.addColorStop(0.55, P.asagi); gi.addColorStop(1, '#bff3f2');
    ctx.fillStyle = gi; ctx.beginPath(); ctx.ellipse(ix, iy + h * 0.04, w * 0.55, h * 0.62, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = al(P.oro, 0.9); ctx.lineWidth = R * 0.016; ctx.stroke();
    ctx.fillStyle = '#071b1d'; ctx.beginPath(); ctx.ellipse(ix, iy + h * 0.06, w * 0.24, h * 0.32, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.ellipse(ix - w * 0.2, iy - h * 0.18, w * 0.14, h * 0.13, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(ix + w * 0.2, iy + h * 0.2, w * 0.06, 0, 7); ctx.fill();
    ctx.restore();
    // pestaña superior
    ctx.strokeStyle = P.tinta; ctx.lineCap = 'round'; ctx.lineWidth = R * 0.05;
    var hy = -h * 0.55 * Math.max(0.08, ab);
    ctx.beginPath(); ctx.moveTo(-w * 1.0, hy * 0.5); ctx.quadraticCurveTo(0, hy * 1.35, w * 1.02, hy * 0.6); ctx.stroke();
    ctx.lineWidth = R * 0.028;
    ctx.beginPath(); ctx.moveTo(lado * w * 1.0, hy * 0.6); ctx.lineTo(lado * w * 1.22, hy * 1.05); ctx.stroke();
    ctx.restore();
  }

  function setEstado(e) { if (ESTADOS.indexOf(e) >= 0) estado = e; return estado; }
  function destruir() { apagado = true; if (raf) cancelAnimationFrame(raf); try { window.removeEventListener('pointermove', alPuntero); window.removeEventListener('touchstart', alPuntero); } catch (e) {} }

  raf = requestAnimationFrame(frame);
  return { setEstado: setEstado, get estado() { return estado; }, destruir: destruir, mirar: mirar,
           recolorear: function () {} };
}

var API = { ESTADOS: ESTADOS, bocaApertura: bocaApertura, parpadeo: parpadeo, orbita: orbita, crearAvatar: crearAvatar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiAvatar = API;

})();
