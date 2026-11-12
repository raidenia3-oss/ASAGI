;(function () {
// ASAGI - Gestos: deslizar para cambiar de pestana (y arriba en el Launcher = buscar).
// Idea de launcher (Lynx/GNOME): navegacion por swipe. Logica pura (direccion) +
// un enganche de toque.

'use strict';

// Direccion de un swipe. Puro. Devuelve 'izq'|'der'|'arriba'|'abajo'|null.
function direccion(dx, dy, umbral) {
  const u = umbral || 55;
  if (Math.abs(dx) < u && Math.abs(dy) < u) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'izq' : 'der';
  return dy < 0 ? 'arriba' : 'abajo';
}

// Siguiente/anterior item de una lista circular. Puro.
function mover(lista, actual, dir) {
  const i = lista.indexOf(actual);
  if (i === -1) return lista[0];
  if (dir === 'izq') return lista[(i + 1) % lista.length];     // swipe izq -> siguiente
  if (dir === 'der') return lista[(i - 1 + lista.length) % lista.length];
  return actual;
}

// Engancha los gestos a un elemento. onSwipe(dir) se llama al soltar. Impuro.
function crear(el, onSwipe, opts) {
  opts = opts || {};
  if (!el) return { destruir: function () {} };
  let sx = 0, sy = 0, st = 0, lx = 0, ly = 0, dentro = null, activo = false;
  function start(e) {
    const p = (e.touches && e.touches[0]) || e;
    sx = lx = p.clientX; sy = ly = p.clientY; st = Date.now(); dentro = e.target; activo = true;
  }
  function move(e) { const p = (e.touches && e.touches[0]) || e; lx = p.clientX; ly = p.clientY; }
  // Cuando el dedo además desplaza una lista, Android/Chrome cancela el toque (touchcancel) en vez de
  // terminarlo: antes el gesto se perdía. Ahora se usa la última posición del dedo.
  function end(e) {
    if (!activo) return; activo = false;
    const p = (e.changedTouches && e.changedTouches[0]) || null;
    const x = p ? p.clientX : lx, y = p ? p.clientY : ly;
    const dx = x - sx, dy = y - sy;
    const dt = Date.now() - st;
    if (dt > (opts.maxMs || 800)) return;            // muy lento, no es swipe
    const dir = direccion(dx, dy, opts.umbral);
    if (dir) { try { onSwipe(dir, { dx: dx, dy: dy, sy: sy, target: dentro }); } catch (e2) {} }
  }
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: true });
  el.addEventListener('touchend', end, { passive: true });
  el.addEventListener('touchcancel', end, { passive: true });
  return { destruir: function () { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end); } };
}

const API = { direccion, mover, crear };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiGestos = API;

})();
