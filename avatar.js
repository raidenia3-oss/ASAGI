;(function () {
'use strict';

// ASAGI - Avatar vivo del asistente (idea de livliv-dev/player: personaje con
// lip-sync y expresiones, pero SIN su libreria WebGL: aqui es ligero, en
// canvas 2D, pensado para movil).
//
// API compatible con livliv-dev/player (reducida, pura, sin servidor):
//   crearAvatar(canvas, opts) -> { setEstado, estado, destruir, expresion,
//                                   act, params, setMouthOpen, recolorear }
//   params: { mouthOpen: 0..1, expresion: string }
//   act('nod' | 'parpadeo' | 'respira') -> ejecuta una accion puntual
//
// Colores de fusion ASAGI: Lieselotte Sherlock (violeta oscuro, deductiva,
// detective) + Asagi Aiba (azul lealtad, compañera cercana) + Levi Kazama
// (ambar, energia alegre y juguetona). SIEMPRE honesta.

var ESTADOS = ['reposo', 'pensando', 'hablando'];
var EXPRESIONES = ['neutra', 'sonrisa', 'seria', 'sorpresa', 'pensativa'];

// Apertura de boca 0..1. Si habla, oscila como una voz (mezcla de senos para que
// no sea un parpadeo mecanico); si no, cerrada. PURA.
function bocaApertura(tms, hablando, mouthOpenForzado) {
  if (mouthOpenForzado != null) {
    var v = mouthOpenForzado;
    if (v < 0) v = 0; else if (v > 1) v = 1;
    return 0.12 + v * 0.88;
  }
  if (!hablando) return 0;
  var t = tms / 1000;
  var v = 0.5 + 0.5 * Math.sin(t * 22) * 0.6 + 0.4 * Math.sin(t * 13.3 + 1.1) * 0.5;
  if (v < 0) v = 0; else if (v > 1) v = 1;
  return 0.12 + v * 0.88;
}

// Apertura de ojo 0..1 (1 abierto, 0 cerrado). Parpadeo ocasional. PURA y
// determinista en el tiempo: un parpadeo rapido cada ~3.4 s.
function parpadeo(tms) {
  var ciclo = 3400;
  var f = tms % ciclo;
  var durac = 130;
  if (f > ciclo - durac) {
    var p = (f - (ciclo - durac)) / durac;
    return Math.abs(Math.cos(p * Math.PI));
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
    return (c && c.trim()) || '#38bdf8';
  } catch (e) { return '#38bdf8'; }
}

function _hex(c) {
  var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((c || '').trim());
  if (!m) return { r: 56, g: 189, b: 248 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function _dibujarOjo(c, x, y, w, h) {
  c.beginPath();
  c.ellipse(x, y, w / 2, h / 2, 0, 0, 7);
  c.fill();
}

function _dibujarCapsula(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// Crea el avatar sobre un <canvas>. Devuelve objeto con API tipo livliv player.
function crearAvatar(canvas, opts) {
  opts = opts || {};
  var ctx = canvas.getContext('2d');
  var estado = 'reposo';
  var expresion = 'neutra';
  var raf = null, t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  var apagado = false;
  var col = _hex(opts.color || _leerColor());
  var params = { mouthOpen: 0, expresion: expresion };

  var accionActiva = null;   // { tipo, tInicio, dur }
  var accionProgreso = 0;    // 0..1

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
    return { w: w, h: h, dpr: dpr };
  }

  function rgba(a) { return 'rgba(' + col.r + ',' + col.g + ',' + col.b + ',' + a + ')'; }

  // Ejecuta una accion puntual (tipo livliv act()).
  function _iniciarAccion(tipo, dur) {
    accionActiva = { tipo: tipo, tInicio: Date.now(), dur: dur };
    accionProgreso = 0;
  }

  function frame(now) {
    if (apagado) return;
    var t = now - t0;
    var m = medir();
    var W = m.w, H = m.h;
    var cx = W / 2, cy = H / 2;
    var R = Math.min(W, H) * 0.40;
    var habla = estado === 'hablando' || hablandoFn();
    var piensa = estado === 'pensando';
    var respira = Math.sin(t / 1400) * (R * 0.03);

    // Progreso de accion activa
    if (accionActiva) {
      var ahora = Date.now();
      accionProgreso = Math.min(1, (ahora - accionActiva.tInicio) / accionActiva.dur);
      if (accionProgreso >= 1) accionActiva = null;
    }

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(cx, cy + respira);

    // halo / bloom detras
    var g = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 1.9);
    g.addColorStop(0, rgba(habla ? 0.28 : 0.16));
    g.addColorStop(1, rgba(0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.9, 0, 7); ctx.fill();

    // visor / cabeza (capsula redondeada con gradiente)
    var gg = ctx.createLinearGradient(0, -R, 0, R);
    gg.addColorStop(0, 'rgba(10,22,34,0.96)');
    gg.addColorStop(1, 'rgba(4,10,18,0.96)');
    ctx.fillStyle = gg;
    ctx.strokeStyle = rgba(0.85);
    ctx.lineWidth = Math.max(1.5, R * 0.03);
    _dibujarCapsula(ctx, -R * 0.82, -R * 0.95, R * 1.64, R * 1.9, R * 0.5);
    ctx.fill();
    ctx.shadowColor = rgba(0.7); ctx.shadowBlur = R * 0.35;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // linea de escaneo que recorre el visor
    var sy = ((t / 14) % (R * 1.9)) - R * 0.95;
    ctx.fillStyle = rgba(0.10);
    ctx.fillRect(-R * 0.82, sy, R * 1.64, Math.max(1, R * 0.05));

    // ojos (afectados por expresion y accion)
    var ab = piensa ? 0.45 : parpadeo(t);
    if (expresion === 'seria') ab = ab * 0.7 + 0.3;
    if (expresion === 'sorpresa') ab = Math.min(1, ab * 1.4 + 0.15);
    if (expresion === 'pensativa') ab = ab * 0.6 + 0.4;
    var ex = R * 0.34, ey = -R * 0.12;
    var ew = R * 0.26, eh = R * 0.30 * ab + R * 0.02;
    // accion 'nod': mueve ojos un poco hacia abajo al bajar la cabeza
    var oy = 0;
    if (accionActiva && accionActiva.tipo === 'nod') oy = Math.sin(accionProgreso * Math.PI) * R * 0.06;
    ctx.fillStyle = rgba(0.95);
    ctx.shadowColor = rgba(0.9); ctx.shadowBlur = R * 0.3;
    _dibujarOjo(ctx, -ex, ey + oy, ew, eh);
    _dibujarOjo(ctx, ex, ey + oy, ew, eh);
    ctx.shadowBlur = 0;

    // boca (PNGTuber: mouthOpen forzado o oscilacion al hablar)
    var ap = bocaApertura(t, habla, params.mouthOpen || 0);
    var mw = R * 0.5, mh = R * 0.06 + R * 0.42 * ap;
    var my = R * 0.42;
    if (accionActiva && accionActiva.tipo === 'nod') my += Math.sin(accionProgreso * Math.PI) * R * 0.05;
    ctx.fillStyle = rgba(0.92);
    ctx.shadowColor = rgba(0.85); ctx.shadowBlur = R * 0.25;
    _dibujarCapsula(ctx, -mw / 2, my - mh / 2, mw, mh, Math.min(mw, mh) / 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // puntos en orbita cuando piensa
    if (piensa) {
      for (var i = 0; i < 3; i++) {
        var p = orbita(t, i, 3, R * 1.15);
        ctx.fillStyle = rgba(0.85 - i * 0.18);
        ctx.beginPath(); ctx.arc(p.x, p.y - R * 0.9, R * 0.07, 0, 7); ctx.fill();
      }
    }

    ctx.restore();
    raf = requestAnimationFrame(frame);
  }

  function setEstado(e) { if (ESTADOS.indexOf(e) >= 0) estado = e; return estado; }
  function setExpresion(e) { if (EXPRESIONES.indexOf(e) >= 0) { expresion = e; params.expresion = e; } return expresion; }
  function setMouthOpen(v) {
    var nv = v == null ? 0 : (v < 0 ? 0 : v > 1 ? 1 : v);
    params.mouthOpen = nv;
    return nv;
  }
  function act(tipo) {
    if (tipo === 'nod') { _iniciarAccion('nod', 400); return true; }
    if (tipo === 'parpadeo') { ab = 0; return true; }
    if (tipo === 'respira') { return true; }
    return false;
  }
  function destruir() { apagado = true; if (raf) cancelAnimationFrame(raf); }

  raf = requestAnimationFrame(frame);
  return {
    setEstado: setEstado,
    get estado() { return estado; },
    setExpresion: setExpresion,
    get expresion() { return expresion; },
    act: act,
    get params() { return params; },
    setMouthOpen: setMouthOpen,
    destruir: destruir,
    recolorear: function (c) { col = _hex(c || _leerColor()); }
  };
}

var API = { ESTADOS: ESTADOS, EXPRESIONES: EXPRESIONES, bocaApertura: bocaApertura, parpadeo: parpadeo, orbita: orbita, crearAvatar: crearAvatar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiAvatar = API;

})();
