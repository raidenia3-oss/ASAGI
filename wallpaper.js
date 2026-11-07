;(function () {
// ASAGI - Wallpaper animado (v3): PERSONALIZABLE.
// Modos: 'constelacion' (red de particulas), 'flujo' (flow field con ruido),
// 'aurora' (bandas de gradiente que fluyen), 'ondas' (ondas que reaccionan al toque).
// Temas de color intercambiables. Ligero: ~30fps, se PAUSA cuando no se ve.
// Interactivo (toque). Inspirado en el artifact de particulas de Daniel + VengenceUI.
//
// posBlob(), nueva() y ruido() son PURAS (testeables); el resto dibuja.

'use strict';

// ---- Temas de color (cada uno: lista de [r,g,b]) ----
const TEMAS = {
  cian:    [[56, 189, 248], [45, 212, 191], [96, 165, 250], [167, 139, 250]],
  violeta: [[167, 139, 250], [217, 70, 239], [129, 140, 248], [244, 114, 182]],
  verde:   [[45, 212, 191], [52, 211, 153], [132, 204, 22], [34, 197, 94]],
  rosa:    [[244, 114, 182], [251, 113, 133], [240, 171, 252], [248, 113, 113]],
  ambar:   [[251, 191, 36], [249, 115, 22], [253, 224, 71], [248, 113, 113]],
};
const MODOS = ['constelacion', 'flujo', 'aurora', 'ondas'];

// Retrocompat: COLORES = tema cian.
const COLORES = TEMAS.cian;

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
    ci: i % 4,
    s: 1 + r() * 1.6,
  };
}

// Ruido de valor 3D barato (hash + interpolacion suave). Puro, determinista.
// Devuelve 0..1. Sirve para flow fields sin dependencias.
function _hash(x, y, z) {
  let h = x * 374761393 + y * 668265263 + z * 2147483647;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) % 1000) / 1000;
}
function _suave(t) { return t * t * (3 - 2 * t); }
function ruido(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = _suave(x - xi), yf = _suave(y - yi), zf = _suave(z - zi);
  function lerp(a, b, t) { return a + (b - a) * t; }
  const c000 = _hash(xi, yi, zi), c100 = _hash(xi + 1, yi, zi);
  const c010 = _hash(xi, yi + 1, zi), c110 = _hash(xi + 1, yi + 1, zi);
  const c001 = _hash(xi, yi, zi + 1), c101 = _hash(xi + 1, yi, zi + 1);
  const c011 = _hash(xi, yi + 1, zi + 1), c111 = _hash(xi + 1, yi + 1, zi + 1);
  const x00 = lerp(c000, c100, xf), x10 = lerp(c010, c110, xf);
  const x01 = lerp(c001, c101, xf), x11 = lerp(c011, c111, xf);
  const y0 = lerp(x00, x10, yf), y1 = lerp(x01, x11, yf);
  return lerp(y0, y1, zf);
}

function crearWallpaper(canvas, opts) {
  opts = opts || {};
  if (!canvas || !canvas.getContext) {
    return { start: function () {}, stop: function () {}, resize: function () {},
      setModo: function () {}, setTema: function () {}, getModo: function () { return 'constelacion'; }, getTema: function () { return 'cian'; } };
  }
  const ctx = canvas.getContext('2d');
  let W = 1, H = 1, dpr = 1;
  let parts = [];
  let ondas = [];                         // para modo 'ondas'
  let t = 0, raf = null, corriendo = false, ultimo = 0, limpiado = false;
  let modo = opts.modo || 'constelacion';
  let tema = (opts.tema === 'auto' || TEMAS[opts.tema]) ? opts.tema : 'cian';
  const DIST = opts.dist || 118;
  const touch = { x: -999, y: -999, on: false };
  const tilt = { x: 0, y: 0 };            // parallax por inclinación (giroscopio)

  // Paleta según la hora (tema 'auto', estilo iOS: cambia con el día).
  function autoPal() {
    const h = new Date().getHours();
    if (h < 6) return TEMAS.violeta;       // madrugada
    if (h < 12) return TEMAS.cian;         // mañana
    if (h < 18) return TEMAS.verde;        // tarde
    if (h < 21) return TEMAS.ambar;        // atardecer
    return TEMAS.rosa;                      // noche
  }
  function cols() { return tema === 'auto' ? autoPal() : (TEMAS[tema] || TEMAS.cian); }
  function col(i) { return cols()[i % cols().length]; }

  function nParts() {
    const base = Math.round((W * H) / (modo === 'flujo' ? 2500 : 11000));
    const max = modo === 'flujo' ? 240 : (opts.max || 110);
    return Math.max(modo === 'flujo' ? 110 : 44, Math.min(max, base));
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
    limpiado = false;
  }

  // ---- FONDO (gradientes que fluyen, comun a varios modos) ----
  function fondo(alpha) {
    ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const b = posBlob(t, i, 3);
      // parallax: cada capa se desplaza distinto con la inclinación (profundidad)
      const dep = 10 + i * 9;
      const cx = b.x * W + tilt.x * dep, cy = b.y * H + tilt.y * dep, rad = Math.max(W, H) * 0.5;
      const c = col(i);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (alpha || 0.12) + ')');
      g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function vineta() {
    const v = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, Math.max(W, H) * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  }

  function atraer(p) {
    if (!touch.on) return;
    const dx = touch.x - p.x, dy = touch.y - p.y, d2 = dx * dx + dy * dy;
    if (d2 < 22000 && d2 > 1) { p.vx += dx / d2 * 12; p.vy += dy / d2 * 12; }
  }
  function mover(p) {
    p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.vy *= 0.99;
    if (p.x < 0 || p.x > W) p.vx *= -1;
    if (p.y < 0 || p.y > H) p.vy *= -1;
    p.x = Math.max(0, Math.min(W, p.x)); p.y = Math.max(0, Math.min(H, p.y));
    if (Math.hypot(p.vx, p.vy) < 0.12) { p.vx += (Math.random() - 0.5) * 0.1; p.vy += (Math.random() - 0.5) * 0.1; }
  }

  // ---- MODO constelacion ----
  function dibConstelacion() {
    fondo(); ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) { atraer(p); mover(p); }
    const base = cols()[0];
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i];
      for (let j = i + 1; j < parts.length; j++) {
        const b = parts[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
        if (d < DIST) {
          const al = (1 - d / DIST) * 0.62;
          ctx.strokeStyle = 'rgba(' + base[0] + ',' + base[1] + ',' + base[2] + ',' + al.toFixed(3) + ')';
          ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    for (const p of parts) {
      const c = col(p.ci);
      ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.9)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s + 0.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over'; vineta();
  }

  // ---- MODO flujo (flow field con ruido) ----
  function dibFlujo() {
    if (!limpiado) { ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, W, H); limpiado = true; }
    // estela: velo oscuro traslucido en vez de borrar (mas bajo = estelas largas)
    ctx.fillStyle = 'rgba(5,7,15,0.05)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const esc = 0.0016, zt = t * 0.12;
    for (const p of parts) {
      const ang = ruido(p.x * esc, p.y * esc, zt) * Math.PI * 4;
      p.vx += Math.cos(ang) * 0.18; p.vy += Math.sin(ang) * 0.18;
      if (touch.on) { const dx = touch.x - p.x, dy = touch.y - p.y, d2 = dx * dx + dy * dy; if (d2 < 30000 && d2 > 1) { p.vx += dx / d2 * 7; p.vy += dy / d2 * 7; } }
      p.vx *= 0.92; p.vy *= 0.92;
      const sp = Math.hypot(p.vx, p.vy); if (sp > 3.2) { p.vx *= 3.2 / sp; p.vy *= 3.2 / sp; }  // sin nudos
      const px = p.x, py = p.y; p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) { p.x = Math.random() * W; p.y = Math.random() * H; continue; }
      const c = col(p.ci), v = Math.min(1, Math.hypot(p.vx, p.vy) / 3);
      ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.34 + v * 0.55).toFixed(3) + ')';
      ctx.lineWidth = p.s * 1.05; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(p.x, p.y); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- MODO aurora (bandas de gradiente senoidal) ----
  function dibAurora() {
    ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const bandas = 4;
    for (let b = 0; b < bandas; b++) {
      const c = col(b);
      const yBase = H * (0.25 + b * 0.16);
      const amp = H * 0.10, fase = t * (0.4 + b * 0.15) + b;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W + 14; x += 14) {
        const xx = Math.min(x, W);
        const n = ruido(xx * 0.003, b * 10, t * 0.1);
        const y = yBase + Math.sin(xx * 0.006 + fase) * amp + (n - 0.5) * amp * 1.4;
        ctx.lineTo(xx, y);
      }
      ctx.lineTo(W, H); ctx.closePath();
      const g = ctx.createLinearGradient(0, yBase - amp, 0, H);
      g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.28)');
      g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      ctx.fillStyle = g; ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over'; vineta();
  }

  // ---- MODO ondas (anillos que nacen del toque; late solo) ----
  function dibOndas() {
    fondo(0.08); ctx.globalCompositeOperation = 'lighter';
    if (touch.on && (!ondas.length || t - ondas[ondas.length - 1].t0 > 0.35)) ondas.push({ x: touch.x, y: touch.y, t0: t, ci: Math.floor(Math.random() * 4) });
    if (!touch.on && ondas.length < 2 && Math.random() < 0.04) ondas.push({ x: Math.random() * W, y: Math.random() * H, t0: t, ci: Math.floor(Math.random() * 4) });
    ondas = ondas.filter(function (o) { return t - o.t0 < 3.2; });
    for (const o of ondas) {
      const edad = t - o.t0, rad = edad * Math.max(W, H) * 0.18;
      const al = Math.max(0, 0.5 * (1 - edad / 3.2)), c = col(o.ci);
      ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + al.toFixed(3) + ')';
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(o.x, o.y, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (al * 0.3).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(o.x, o.y, rad, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over'; vineta();
  }

  function dibujar() {
    if (modo === 'flujo') return dibFlujo();
    if (modo === 'aurora') return dibAurora();
    if (modo === 'ondas') return dibOndas();
    return dibConstelacion();
  }

  function loop(ts) {
    if (!corriendo) return;
    raf = window.requestAnimationFrame(loop);
    if (ts - ultimo < 33) return;              // ~30 fps
    ultimo = ts; t += 0.033;
    dibujar();
  }

  function start() { if (corriendo) return; corriendo = true; resize(); raf = window.requestAnimationFrame(loop); }
  function stop() { corriendo = false; if (raf) window.cancelAnimationFrame(raf); raf = null; }

  function setModo(m) { if (MODOS.indexOf(m) === -1) return; modo = m; limpiado = false; ondas = []; resize(); }
  function setTema(x) { if (x === 'auto' || TEMAS[x]) tema = x; }

  function onTouch(e) {
    const r = canvas.getBoundingClientRect();
    const pt = (e.touches && e.touches[0]) || e;
    touch.x = (pt.clientX || 0) - r.left; touch.y = (pt.clientY || 0) - r.top; touch.on = true;
  }
  function offTouch() { touch.on = false; touch.x = -999; touch.y = -999; }

  // Parallax por giroscopio (Android no pide permiso). Suave y acotado.
  function onTilt(e) {
    const g = e.gamma, b = e.beta;
    if (g == null || b == null) return;
    const tx = Math.max(-1, Math.min(1, g / 28));
    const ty = Math.max(-1, Math.min(1, (b - 45) / 28));
    tilt.x += (tx - tilt.x) * 0.12; tilt.y += (ty - tilt.y) * 0.12;   // lerp
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
  canvas.addEventListener('touchmove', onTouch, { passive: true });
  canvas.addEventListener('mousemove', onTouch);
  canvas.addEventListener('touchend', offTouch);
  canvas.addEventListener('mouseleave', offTouch);
  try { window.addEventListener('deviceorientation', onTilt); } catch (e) {}

  return {
    start: start, stop: stop, resize: resize,
    setModo: setModo, setTema: setTema,
    getModo: function () { return modo; }, getTema: function () { return tema; },
  };
}

const API = { posBlob, nueva, ruido, crearWallpaper, COLORES, TEMAS, MODOS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiWallpaper = API;

})();
