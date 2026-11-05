// ASAGI - Wallpaper animado estilo Hyprland (rice): gradientes que fluyen + malla
// sutil + glow. Para el Launcher (y reusable). Ligero: canvas 2D, ~24fps, y se PAUSA
// cuando no se ve (ahorra bateria, clave si ASAGI es tu home).
//
// La parte de posiciones (posBlob) es PURA y testeable; el resto dibuja.

'use strict';

// Paleta Hyprland-ish (cyan/violeta/teal sobre oscuro).
const COLORES = [
  [56, 189, 248],   // cyan
  [167, 139, 250],  // violeta
  [45, 212, 191],   // teal
  [240, 171, 252],  // rosa
];

// Posicion de un blob en el tiempo (t seg). Puro. Devuelve {x,y} en 0..1.
function posBlob(t, i, n = 4) {
  const base = (i / n) * Math.PI * 2;
  const vx = 0.5 + 0.34 * Math.sin(t * 0.07 + base);
  const vy = 0.5 + 0.30 * Math.cos(t * 0.05 + base * 1.3);
  return { x: vx, y: vy };
}

function crearWallpaper(canvas, opts) {
  opts = opts || {};
  if (!canvas || !canvas.getContext) return { stop: function () {} };
  const ctx = canvas.getContext('2d');
  const nBlobs = opts.blobs || 4;
  let t = 0;
  let raf = null;
  let corriendo = false;
  let ultimo = 0;

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(r.width * dpr));
    canvas.height = Math.max(1, Math.floor(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function dibujar(w, h) {
    // fondo oscuro
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, w, h);
    // blobs de gradiente (fluyen)
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < nBlobs; i++) {
      const p = posBlob(t, i, nBlobs);
      const cx = p.x * w, cy = p.y * h;
      const rad = Math.max(w, h) * 0.42;
      const c = COLORES[i % COLORES.length];
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0.22)');
      g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    // malla sutil tipo terminal
    ctx.strokeStyle = 'rgba(56,189,248,0.05)';
    ctx.lineWidth = 1;
    const paso = 36;
    ctx.beginPath();
    for (let x = 0; x < w; x += paso) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += paso) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    // vineta
    const v = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, Math.max(w, h) * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  }

  function loop(ts) {
    if (!corriendo) return;
    raf = window.requestAnimationFrame(loop);
    if (ts - ultimo < 42) return;      // ~24 fps
    ultimo = ts;
    t += 0.042;
    const r = canvas.getBoundingClientRect();
    dibujar(r.width, r.height);
  }

  function start() {
    if (corriendo) return;
    corriendo = true; resize();
    raf = window.requestAnimationFrame(loop);
  }
  function stop() {
    corriendo = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = null;
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });

  return { start: start, stop: stop, resize: resize };
}

const API = { posBlob, crearWallpaper, COLORES };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiWallpaper = API;
