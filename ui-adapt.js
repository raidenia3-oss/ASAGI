;(function () {
// ASAGI - UI adaptativa v3: wallpaper photo -> UI style.
// Mejoras: quantizacion mejorada (skip transparent, downsample),
// disliked colors fix, color blindness (protanopia/deuteranopia/tritanopia),
// dos modos (user-generated / content-based), WCAG contrast, glass + micro-interactions.
'use strict';

function extraerColores(img, n) {
  n = n || 6;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const max = 120;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  canvas.width = w; canvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const buckets = {};
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i+3];
    if (a < 128) continue;
    const r = Math.round(data[i] / 20) * 20;
    const g = Math.round(data[i+1] / 20) * 20;
    const b = Math.round(data[i+2] / 20) * 20;
    const key = r + ',' + g + ',' + b;
    buckets[key] = (buckets[key] || 0) + 1;
  }
  const sorted = Object.entries(buckets).sort((a,b) => b[1]-a[1]);
  const result = [];
  for (const e of sorted) {
    const [r,g,b] = e[0].split(',').map(Number);
    const tooClose = result.some(c => Math.abs(c.r-r)+Math.abs(c.g-g)+Math.abs(c.b-b) < 60);
    if (!tooClose) result.push({ r, g, b, count: e[1] });
    if (result.length >= n) break;
  }
  return result;
}

function rgbToHex(r,g,b) {
  return '#' + [r,g,b].map(v => Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('');
}

function luminancia(r,g,b) {
  const [rs,gs,bs] = [r,g,b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v+0.055)/1.055, 2.4);
  });
  return 0.2126*rs + 0.7152*gs + 0.0722*bs;
}

function contraste(c1, c2) {
  const l1 = luminancia(c1.r,c1.g,c1.b);
  const l2 = luminancia(c2.r,c2.g,c2.b);
  return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
}

function ajustarContraste(color, bg, minRatio) {
  minRatio = minRatio || 4.5;
  let c = { ...color };
  let tries = 0;
  while (contraste(c, bg) < minRatio && tries < 20) {
    const bgL = luminancia(bg.r,bg.g,bg.b);
    if (bgL > 0.5) {
      c.r = Math.max(0, c.r - 10); c.g = Math.max(0, c.g - 10); c.b = Math.max(0, c.b - 10);
    } else {
      c.r = Math.min(255, c.r + 10); c.g = Math.min(255, c.g + 10); c.b = Math.min(255, c.b + 10);
    }
    tries++;
  }
  return c;
}

function armonia(colors) {
  const p = colors[0];
  const comp = { r: 255-p.r, g: 255-p.g, b: 255-p.b };
  return { primario: p, complementario: comp };
}

function fixDisliked(c) {
  const hue = Math.atan2(Math.sqrt(3)*(c.g-c.b), 2*c.r-c.g-c.b) * 180 / Math.PI;
  if (hue > 80 && hue < 120 && (c.r+c.g+c.b) > 300) {
    return { r: Math.min(255, c.r+15), g: Math.max(0, c.g-25), b: Math.min(255, c.b+10) };
  }
  return c;
}

function ajustarColorBlind(c, tipo) {
  tipo = tipo || 'none';
  if (tipo === 'none') return c;
  if (tipo === 'protanopia') {
    return { r: Math.round(0.567*c.r + 0.433*c.g), g: Math.round(0.558*c.r + 0.442*c.g), b: c.b };
  }
  if (tipo === 'deuteranopia') {
    return { r: Math.round(0.625*c.r + 0.375*c.g), g: Math.round(0.7*c.r + 0.3*c.g), b: c.b };
  }
  if (tipo === 'tritanopia') {
    return { r: c.r, g: Math.round(0.95*c.g + 0.05*c.b), b: Math.round(0.433*c.g + 0.567*c.b) };
  }
  return c;
}

function _mezcla(c, hacia, t) {
  return { r: Math.round(c.r * (1 - t) + hacia.r * t), g: Math.round(c.g * (1 - t) + hacia.g * t), b: Math.round(c.b * (1 - t) + hacia.b * t) };
}

// Modo marca-segura (regla 6): la foto solo tiñe lo ambiental (fondo y paneles glass, jalados casi a negro).
// El carmesí, el oro y el papel de ASAGI quedan FIJOS: la identidad manda sobre la foto.
function aplicarMarcaSegura(colors) {
  if (!colors || !colors.length) return;
  const root = document.documentElement;
  const NEGRO = { r: 8, g: 4, b: 8 };                 // #080408
  const CARMESI = { r: 220, g: 20, b: 60 };           // #DC143C
  const dark = colors[colors.length - 1] || colors[0];
  // Tinte MÍNIMO y solo en el fondo ambiental: el chat y las tarjetas quedan negro nítido.
  // El ambiente de la foto se ve en el launcher (donde está la foto), no embarra las superficies.
  const bg = _mezcla(NEGRO, dark, 0.06);              // apenas un susurro del tono de la foto
  const bg2 = _mezcla(NEGRO, dark, 0.03);
  root.style.setProperty('--bg', rgbToHex(bg.r, bg.g, bg.b));
  root.style.setProperty('--bg-2', rgbToHex(bg2.r, bg2.g, bg2.b));
  // --panel, --line, --glow, --cyan (carmesí), --gold, --text: NO se tocan. La marca manda y las
  // superficies (burbujas, paneles) quedan negro-carmesí limpio, sin sepia.
}

function limpiar() {
  const root = document.documentElement;
  ['--bg', '--bg-2', '--panel', '--line', '--line-soft', '--glow', '--glass-blur', '--radius', '--cyan', '--teal', '--violet', '--success', '--text'].forEach(function (v) { root.style.removeProperty(v); });
  const g = document.getElementById('ui-adapt-glass'); if (g) g.remove();
  try { localStorage.removeItem('asagi-ui-palette'); localStorage.removeItem('asagi-ui-modo'); localStorage.removeItem('asagi-ui-colorblind'); } catch (e) {}
}

function aplicarColores(colors, modo) {
  modo = modo || 'marca';
  if (modo === 'marca') { aplicarMarcaSegura(colors); return; }
  if (!colors || !colors.length) return;
  const root = document.documentElement;
  let primary = fixDisliked(colors[0]);
  let secondary = fixDisliked(colors[1] || colors[0]);
  const dark = colors[colors.length-1];
  if (modo === 'content-based') {
    primary = { r: Math.min(255, primary.r+10), g: Math.min(255, primary.g+10), b: Math.min(255, primary.b+10) };
  }
  const bg = { r: Math.max(0, primary.r - 70), g: Math.max(0, primary.g - 70), b: Math.max(0, primary.b - 70) };
  const text = ajustarContraste({ r: 240, g: 240, b: 248 }, bg, 7);
  const harm = armonia(colors);

  root.style.setProperty('--bg', rgbToHex(bg.r, bg.g, bg.b));
  root.style.setProperty('--bg-2', rgbToHex(Math.max(0,bg.r-15), Math.max(0,bg.g-15), Math.max(0,bg.b-15)));
  root.style.setProperty('--cyan', rgbToHex(primary.r, primary.g, primary.b));
  root.style.setProperty('--teal', rgbToHex(secondary.r, secondary.g, secondary.b));
  root.style.setProperty('--violet', rgbToHex(harm.complementario.r, harm.complementario.g, harm.complementario.b));
  root.style.setProperty('--success', rgbToHex(Math.min(255, secondary.r+20), Math.min(255, secondary.g+20), Math.min(255, secondary.b+20)));
  root.style.setProperty('--text', rgbToHex(text.r, text.g, text.b));
  root.style.setProperty('--panel', 'rgba(' + dark.r + ',' + dark.g + ',' + dark.b + ', 0.50)');
  root.style.setProperty('--line', 'rgba(' + primary.r + ',' + primary.g + ',' + primary.b + ', 0.20)');
  root.style.setProperty('--line-soft', 'rgba(' + secondary.r + ',' + secondary.g + ',' + secondary.b + ', 0.12)');
  root.style.setProperty('--glow', 'rgba(' + primary.r + ',' + primary.g + ',' + primary.b + ', 0.40)');
  root.style.setProperty('--radius', '16px');
  root.style.setProperty('--glass-blur', '14px');
}

function activarGlass() {
  const existing = document.getElementById('ui-adapt-glass');
  if (existing) existing.remove();
  const style = document.createElement('style');
  style.id = 'ui-adapt-glass';
  style.textContent = `
    .panel, .app-shell, .main-panel, .placeholder-box {
      background: var(--panel) !important;
      backdrop-filter: blur(var(--glass-blur, 14px));
      -webkit-backdrop-filter: blur(var(--glass-blur, 14px));
      border: 1px solid var(--line);
      border-radius: var(--radius, 16px);
      transition: background 0.4s ease, border-color 0.4s ease;
    }
    .message.bot, .message.user {
      background: rgba(255,255,255,0.06);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius, 16px);
      transition: background 0.3s ease;
    }
    .message.bot:hover, .message.user:hover {
      background: rgba(255,255,255,0.10);
    }
    button, .chip, .nav-item {
      transition: transform 0.15s ease, box-shadow 0.2s ease, background 0.2s ease;
    }
    button:active, .chip:active, .nav-item:active {
      transform: scale(0.97);
    }
    input, textarea {
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius, 16px);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    input:focus, textarea:focus {
      border-color: var(--cyan);
      box-shadow: 0 0 0 3px var(--glow);
      outline: none;
    }
  `;
  document.head.appendChild(style);
}

function integrarWallpaper(imgSrc, opts) {
  opts = opts || {};
  const modo = opts.modo || 'marca';
  const colorBlind = opts.colorBlind || 'none';
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() {
    let colors = extraerColores(img, 6);
    colors = colors.map(c => ajustarColorBlind(c, colorBlind));
    aplicarColores(colors, modo);
    activarGlass();
    try { localStorage.setItem('asagi-ui-palette', JSON.stringify(colors)); } catch(e) {}
    try { localStorage.setItem('asagi-ui-modo', modo); } catch(e) {}
    try { localStorage.setItem('asagi-ui-colorblind', colorBlind); } catch(e) {}
  };
  img.src = imgSrc;
}

function restaurarPaleta() {
  try {
    const raw = localStorage.getItem('asagi-ui-palette');
    if (raw) {
      const colors = JSON.parse(raw);
      const modo = localStorage.getItem('asagi-ui-modo') || 'user-generated';
      const cb = localStorage.getItem('asagi-ui-colorblind') || 'none';
      const adjusted = colors.map(c => ajustarColorBlind(c, cb));
      aplicarColores(adjusted, modo);
      activarGlass();
    }
  } catch(e) {}
}

if (typeof window !== 'undefined') {
  window.UIAdapt = {
    extraerColores: extraerColores,
    aplicarColores: aplicarColores,
    activarGlass: activarGlass,
    integrarWallpaper: integrarWallpaper,
    aplicarMarcaSegura: aplicarMarcaSegura,
    limpiar: limpiar,
    restaurarPaleta: restaurarPaleta,
    armonia: armonia,
    contraste: contraste,
    fixDisliked: fixDisliked,
    ajustarColorBlind: ajustarColorBlind
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restaurarPaleta);
  } else {
    restaurarPaleta();
  }
}

})();
