;(function () {
// ASAGI - UI adaptativa: la foto del wallpaper se integra como estilo de UI.
// Extrae colores dominantes de la imagen y los aplica a variables CSS.
// Glass panels con backdrop-filter sobre el wallpaper. Sin deps nuevas.
'use strict';

function extraerColores(img, n) {
  n = n || 5;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const w = 64, h = 64;
  canvas.width = w; canvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  // Quantize colors
  const buckets = {};
  for (let i = 0; i < data.length; i += 4) {
    const r = Math.round(data[i] / 32) * 32;
    const g = Math.round(data[i+1] / 32) * 32;
    const b = Math.round(data[i+2] / 32) * 32;
    const key = r + ',' + g + ',' + b;
    buckets[key] = (buckets[key] || 0) + 1;
  }
  const sorted = Object.entries(buckets).sort((a,b) => b[1]-a[1]);
  const colors = sorted.slice(0, n).map(e => {
    const [r,g,b] = e[0].split(',').map(Number);
    return { r, g, b, count: e[1] };
  });
  return colors;
}

function rgbToHex(r,g,b) {
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function aplicarColores(colors) {
  if (!colors || !colors.length) return;
  const root = document.documentElement;
  const primary = colors[0];
  const secondary = colors[1] || colors[0];
  const dark = colors[colors.length-1];
  // Darken primary for bg
  const bgR = Math.max(0, primary.r - 60);
  const bgG = Math.max(0, primary.g - 60);
  const bgB = Math.max(0, primary.b - 60);
  root.style.setProperty('--bg', rgbToHex(bgR, bgG, bgB));
  root.style.setProperty('--bg-2', rgbToHex(Math.max(0,bgR-10), Math.max(0,bgG-10), Math.max(0,bgB-10)));
  root.style.setProperty('--cyan', rgbToHex(primary.r, primary.g, primary.b));
  root.style.setProperty('--teal', rgbToHex(secondary.r, secondary.g, secondary.b));
  root.style.setProperty('--violet', rgbToHex(
    Math.min(255, secondary.r + 40),
    Math.min(255, secondary.g + 40),
    Math.min(255, secondary.b + 40)
  ));
  root.style.setProperty('--panel', 'rgba(' + dark.r + ',' + dark.g + ',' + dark.b + ', 0.55)');
  root.style.setProperty('--line', 'rgba(' + primary.r + ',' + primary.g + ',' + primary.b + ', 0.18)');
  root.style.setProperty('--glow', 'rgba(' + primary.r + ',' + primary.g + ',' + primary.b + ', 0.35)');
}

function activarGlass() {
  // Asegurar que panels usan glass
  const style = document.createElement('style');
  style.id = 'ui-adapt-glass';
  if (document.getElementById('ui-adapt-glass')) return;
  style.textContent = `
    .panel, .app-shell, .main-panel {
      background: var(--panel) !important;
      backdrop-filter: blur(var(--glass-blur, 12px));
      -webkit-backdrop-filter: blur(var(--glass-blur, 12px));
      border: 1px solid var(--line);
    }
    .message.bot, .message.user {
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius, 16px);
    }
  `;
  document.head.appendChild(style);
}

function integrarWallpaper(imgSrc) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() {
    const colors = extraerColores(img, 6);
    aplicarColores(colors);
    activarGlass();
  };
  img.src = imgSrc;
}

// Exponer API
if (typeof window !== 'undefined') {
  window.UIAdapt = {
    extraerColores: extraerColores,
    aplicarColores: aplicarColores,
    activarGlass: activarGlass,
    integrarWallpaper: integrarWallpaper
  };
}

})();
