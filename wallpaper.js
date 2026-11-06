// ASAGI - Wallpaper animado (v2): RED DE PARTICULAS (constelacion hacker) + gradientes
// que fluyen + glow. Inspirado en el artifact de partículas de Daniel y en VengenceUI
// (glass/rays/glow). Interactivo: las partículas reaccionan al toque. Ligero: ~30fps,
// se PAUSA cuando no se ve (bateria, clave si ASAGI es el home).
//
// posBlob() y nueva() son PURAS (testeables); el resto dibuja.

'use strict';

const COLORES = [
  [56, 189, 248], [167, 139, 250], [45, 212, 191], [240, 171, 252],
];

// Posicion de un blob de gradiente en el tiempo. Puro. 0..1.
function posBlob(t, i, n = 3) {
  const base = (i / n) * Math.PI * 2;
  return {
    x: 0.5 + 0.32 * Math.sin(t * 0.06 + base),
    y: 0.5 + 0.28 * Math.cos(t * 0.045 + base * 1.3),
  };
}

// Crea una particula con posicion/velocidad deterministica (seed). Puro.
function nueva(i, w, h, rnd) {
  const r = rnd || Math.random;
  return {
    x: r() * w, y: r() * h,
    vx: (r() - 0.5) * 0.35, vy: (r() - 0.5) * 0.35,
    c: COLORES[i % COLORES.length],
    s: 1 + r() * 1.6,
  };
}

function crearWallpaper(canvas, opts) {
  opts = opts || {};
  if (!canvas || !canvas.getContext) return { start: function () {}, stop: function () {}, resize: function () {} };
  const ctx = canvas.getContext('2d');
  let W = 1, H = 1, dpr = 1;
  let parts = [];
  let t = 0, raf = null, corriendo = false, ultimo = 0;
  const DIST = opts.dist || 118;          // distancia de conexion
  const touch = { x: -999, y: -999, on: false };

  function nParts() {
    const base = Math.round((W * H) / 11000);
    return Math.max(44, Math.min(opts.max || 110, base));
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = nParts();
    parts = [];
    for (let i = 0; i < n; i++) parts.push(nueva(i, W, H));
  }

  function paso() {
    for (const p of parts) {
      // atraccion suave al toque
      if (touch.on) {
        const dx = touch.x - p.x, dy = touch.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 22000 && d2 > 1) { p.vx += dx / d2 * 12; p.vy += dy / d2 * 12; }
      }
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.99; p.vy *= 0.99;
      // rebote suave en bordes
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      p.x = Math.max(0, Math.min(W, p.x)); p.y = Math.max(0, Math.min(H, p.y));
      // velocidad minima (siguen vivas)
      const v = Math.hypot(p.vx, p.vy);
      if (v < 0.12) { p.vx += (Math.random() - 0.5) * 0.1; p.vy += (Math.random() - 0.5) * 0.1; }
    }
  }

  function fondo() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const b = posBlob(t, i, 3);
      const cx = b.x * W, cy = b.y * H, rad = Math.max(W, H) * 0.5;
      const c = COLORES[i];
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.12)');
      g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function red() {
    // lineas entre particulas cercanas (constelacion)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i];
      for (let j = i + 1; j < parts.length; j++) {
        const b = parts[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < DIST) {
          const al = (1 - d / DIST) * 0.62;
          ctx.strokeStyle = 'rgba(56,189,248,' + al.toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    // puntos con glow
    for (const p of parts) {
      ctx.fillStyle = 'rgba(' + p.c[0] + ',' + p.c[1] + ',' + p.c[2] + ',0.9)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s + 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // vineta
    const v = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  function loop(ts) {
    if (!corriendo) return;
    raf = window.requestAnimationFrame(loop);
    if (ts - ultimo < 33) return;          // ~30 fps
    ultimo = ts; t += 0.033;
    paso(); fondo(); red();
  }

  function start() { if (corriendo) return; corriendo = true; resize(); raf = window.requestAnimationFrame(loop); }
  function stop() { corriendo = false; if (raf) window.cancelAnimationFrame(raf); raf = null; }

  function onTouch(e) {
    const r = canvas.getBoundingClientRect();
    const pt = (e.touches && e.touches[0]) || e;
    touch.x = (pt.clientX || 0) - r.left; touch.y = (pt.clientY || 0) - r.top; touch.on = true;
  }
  function offTouch() { touch.on = false; touch.x = -999; touch.y = -999; }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
  canvas.addEventListener('touchmove', onTouch, { passive: true });
  canvas.addEventListener('mousemove', onTouch);
  canvas.addEventListener('touchend', offTouch);
  canvas.addEventListener('mouseleave', offTouch);

  return { start: start, stop: stop, resize: resize };
}

const API = { posBlob, nueva, crearWallpaper, COLORES };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiWallpaper = API;
