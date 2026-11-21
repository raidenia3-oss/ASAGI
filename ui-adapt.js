;(function () {
// ASAGI - UI adaptativa: la foto del wallpaper se integra como estilo de UI.
// Extrae colores dominantes, calcula armonia, ajusta contraste WCAG,
// aplica glass panels + micro-interacciones. Sin deps nuevas.
'use strict';

function extraerColores(img, n) {
  n = n || 6;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const w = 80, h = 80;
  canvas.width = w; canvas.height = h;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const buckets = {};
  for (let i = 0; i < data.length; i += 4) {
    const r = Math.round(data[i] / 24) * 24;
    const g = Math.round(data[i+1] / 24) * 24;
    const b = Math.round(data[i+2] / 24) * 24;
    const key = r + ',' + g + ',' + b;
    buckets[key] = (buckets[key] || 0) + 1;
  }
  const sorted = Object.entries(buckets).sort((a,b) => b[1]-a[1]);
  // Filtrar colores muy similares
  const result = [];
  for (const e of sorted) {
    const [r,g,b] = e[0].split(',').map(Number);
    const tooClose = result.some(c => Math.abs(c.r-r)+Math.abs(c.g-g)+Math.abs(c.b-b) < 80);
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
    // Lighten or darken
    const l = luminancia(c.r,c.g,c.b);
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
  // Calcular complementario y triadico del color primario
  const p = colors[0];
  const comp = { r: 255-p.r, g: 255-p.g, b: 255-p.b };
  const tri1 = { r: Math.round((p.r+120)%255), g: Math.round((p.g+120)%255), b: Math.round((p.b+120)%255) };
  return { primario: p, complementario: comp, triadico: tri1 };
}

function aplicarColores(colors) {
  if (!colors || !colors.length) return;
  const root = document.documentElement;
  const primary = colors[0];
  const secondary = colors[1] || colors[0];
  const dark = colors[colors.length-1];
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

function integrarWallpaper(imgSrc) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() {
    const colors = extraerColores(img, 6);
    aplicarColores(colors);
    activarGlass();
    // Guardar paleta en localStorage
    try {
      localStorage.setItem('asagi-ui-palette', JSON.stringify(colors));
    } catch(e) {}
  };
  img.src = imgSrc;
}

// Restaurar paleta guardada
function restaurarPaleta() {
  try {
    const raw = localStorage.getItem('asagi-ui-palette');
    if (raw) {
      const colors = JSON.parse(raw);
      aplicarColores(colors);
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
    restaurarPaleta: restaurarPaleta,
    armonia: armonia,
    contraste: contraste
  };
  // Auto-restaurar al cargar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restaurarPaleta);
  } else {
    restaurarPaleta();
  }
}

})();

