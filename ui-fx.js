;(function () {
// ASAGI - micro-interacciones "caras" (ideas de Uiverse / Animate UI / Vengeance /
// Forge UI). Sin dependencias, sin frameworks: solo CSS vars + transform (GPU).
//   - spotlight: un glow que sigue al cursor sobre las tarjetas/paneles
//   - magnetico: los botones se acercan al cursor y vuelven al soltar

'use strict';

var SPOT = '.wall-sheet, .panel.overlay, .launcher-grid';
var MAG = '.wall-chip, .nav-item';

function iniciar(scope) {
  scope.querySelectorAll(SPOT).forEach(function (el) {
    if (el._fxSpot) return;
    el._fxSpot = true;
    el.setAttribute('data-spot', '');
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  scope.querySelectorAll(MAG).forEach(function (el) {
    if (el._fxMag) return;
    el._fxMag = true;
    el.setAttribute('data-mag', '');
    el.addEventListener('pointermove', function (e) {
      var r = el.getBoundingClientRect();
      el.style.transform = 'translate(' +
        ((e.clientX - (r.left + r.width / 2)) * 0.22) + 'px,' +
        ((e.clientY - (r.top + r.height / 2)) * 0.22) + 'px)';
    });
    el.addEventListener('pointerleave', function () {
      el.style.transform = 'translate(0,0)';
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { iniciar(document); });
} else {
  iniciar(document);
}

// Contenido que se crea despues (paneles, chips, nav): se aplica solo.
if (window.MutationObserver) {
  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var n = muts[i].addedNodes;
      for (var j = 0; j < n.length; j++) {
        if (n[j].nodeType === 1) iniciar(n[j]);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
})();
