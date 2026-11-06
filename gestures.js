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
  let sx = 0, sy = 0, st = 0;
  function start(e) {
    const p = (e.touches && e.touches[0]) || e;
    sx = p.clientX; sy = p.clientY; st = Date.now();
  }
  function end(e) {
    const p = (e.changedTouches && e.changedTouches[0]) || e;
    const dx = p.clientX - sx, dy = p.clientY - sy;
    const dt = Date.now() - st;
    if (dt > (opts.maxMs || 800)) return;            // muy lento, no es swipe
    const dir = direccion(dx, dy, opts.umbral);
    if (dir) { try { onSwipe(dir, { dx: dx, dy: dy }); } catch (e2) {} }
  }
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', end, { passive: true });
  return { destruir: function () { el.removeEventListener('touchstart', start); el.removeEventListener('touchend', end); } };
}

const API = { direccion, mover, crear };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiGestos = API;

})();
