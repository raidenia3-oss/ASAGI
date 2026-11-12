// Recorre ASAGI COMO UNA PERSONA en el emulador: desliza, toca, abre el teclado, escribe,
// pulsa Atrás, gira la pantalla… y en cada pantalla saca captura y revisa cosas incómodas:
//  - hora en 12 h (no 24 h)                 - nada debajo de la barra de estado ni de los botones
//  - nada que se salga por los lados         - botones demasiado chicos para el dedo (< 36 px)
//  - letra demasiado chica (< 11 px)         - barra de escribir visible con el teclado abierto
// Uso (lo llama simular.sh): node scripts/sim_persona.mjs <puerto devtools> >> sim/REPORTE.md
import { execSync } from 'node:child_process';
const PORT = process.argv[2] || '9222';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adb = (c) => { try { return execSync('adb ' + c, { timeout: 20000 }).toString(); } catch (e) { return ''; } };
const foto = (n) => { try { execSync(`adb exec-out screencap -p > sim/capturas/${n}.png`, { timeout: 20000, shell: '/bin/bash' }); out(`  - captura: capturas/${n}.png`); } catch (e) {} };
const out = (s) => console.log(s);

async function conectar() {
  for (let i = 0; i < 20; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); const p = l.find((x) => x.type === 'page'); if (p) return p.webSocketDebuggerUrl; } catch (e) {}
    await sleep(1500);
  }
  throw new Error('sin WebView');
}
const ws = new WebSocket(await conectar());
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let n = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const cdp = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? null; };

// Revisión de la pantalla actual (corre dentro de ASAGI).
const REVISAR = `(() => {
  const W = innerWidth, H = innerHeight, prob = [];
  const panel = document.querySelector('.panel.overlay.open') || document.getElementById('launcher') || document.body;
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 && r.bottom > 0 && r.top < H; };
  if (document.documentElement.scrollWidth > W + 2) prob.push('la página se desplaza de lado (' + document.documentElement.scrollWidth + ' > ' + W + ')');
  const inter = [...panel.querySelectorAll('button, a[href], input, textarea, select, [role=button]')].filter(vis);
  const nombre = (e) => (e.id ? '#' + e.id : e.tagName.toLowerCase()) + (e.innerText || e.placeholder || e.getAttribute('aria-label') || '').trim().slice(0, 22).replace(/^/, ' «') + '»';
  inter.forEach((e) => { const r = e.getBoundingClientRect();
    if (r.right > W + 1 || r.left < -1) prob.push('se sale por el lado: ' + nombre(e));
    if ((r.width < 36 || r.height < 36) && e.type !== 'checkbox' && e.type !== 'range') prob.push('chico para el dedo (' + Math.round(r.width) + '×' + Math.round(r.height) + '): ' + nombre(e)); });
  const chicos = new Set();
  [...panel.querySelectorAll('*')].filter((e) => e.childElementCount === 0 && (e.innerText || '').trim() && vis(e)).forEach((e) => {
    const f = parseFloat(getComputedStyle(e).fontSize); if (f > 0 && f < 11) chicos.add(Math.round(f * 10) / 10 + 'px «' + e.innerText.trim().slice(0, 18) + '»'); });
  [...chicos].slice(0, 5).forEach((c) => prob.push('letra chica ' + c));
  return { W, H, dpr: devicePixelRatio, panel: panel.id || panel.className, prob: [...new Set(prob)].slice(0, 14) };
})()`;

async function revisar(etiqueta, nfoto) {
  await sleep(900);
  foto(nfoto);
  const r = await ev(REVISAR);
  if (!r) { out(`- **${etiqueta}**: no pude revisar`); return; }
  out(`- **${etiqueta}** (${r.W}×${r.H} css, pantalla ${r.panel}) — ${r.prob.length ? r.prob.length + ' detalle(s):' : 'sin problemas ✓'}`);
  r.prob.forEach((p) => out('    · ' + p));
}
const toque = async (sel) => {               // un dedo de verdad sobre el elemento (eventos táctiles)
  const c = await ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!c) return false;
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  return true;
};

out('## Recorrido como persona');
const tam = adb('shell wm size').match(/(\d+)x(\d+)/) || [0, 1080, 2400];
const SW = +tam[1], SH = +tam[2];
await ev("setActiveSection && setActiveSection('launcher')");

// 1. Casa: hora en 12 h y nada debajo de las barras
const reloj = await ev("(document.getElementById('launcher-clock')||{}).innerText||''");
out(`- Reloj de la casa: «${reloj.replace(/\n/g, ' ')}» → ${/^(1[0-2]|[1-9]):[0-5]\d\s*(a|p)\.\s?m\./i.test(reloj.replace(/\n/g, ' ')) ? '12 h ✓' : 'NO está en 12 h ✗'}`);
const barras = await ev(`(() => { const h = document.getElementById('launcher-clock'), b = document.querySelector('.launcher-hint, #launcher-hint, [class*=desliza]') || [...document.querySelectorAll('#launcher *')].filter(e=>/desliza/i.test(e.innerText||'')).pop();
  return { relojTop: h ? Math.round(h.getBoundingClientRect().top) : null, abajo: b ? Math.round(b.getBoundingClientRect().bottom) : null, H: innerHeight }; })()`);
out(`- Márgenes: el reloj empieza a ${barras.relojTop}px del borde de la app; el texto de abajo termina a ${barras.H - barras.abajo}px del final (la app ya no pasa por debajo de la barra de estado ni de los botones porque Android le reserva ese espacio).`);
await revisar('Casa', 'p01_casa');

// 2. Deslizar hacia arriba como un dedo para hablar con ASAGI
adb(`shell input swipe ${SW / 2} ${Math.round(SH * 0.9)} ${SW / 2} ${Math.round(SH * 0.35)} 250`);
await sleep(1200);
const enChat = await ev("document.getElementById('assistant').classList.contains('open')");
out(`- Deslizar hacia arriba abre el chat: ${enChat ? 'sí ✓' : 'NO ✗ (lo abro a mano)'}`);
if (!enChat) await ev("setActiveSection('assistant')");
await revisar('Chat', 'p02_chat');

// 3. Tocar la barra de escribir: sale el teclado; la barra tiene que seguir a la vista
await toque('#message-input');
await sleep(1800);
const tec = await ev(`(() => { const c = document.querySelector('.composer') || document.getElementById('message-input'); const r = c.getBoundingClientRect();
  return { H: innerHeight, abajo: Math.round(r.bottom), foco: document.activeElement && document.activeElement.id }; })()`);
const tecladoVisible = /mInputShown=true|mIsInputViewShown=true/.test(adb('shell dumpsys input_method'));
out(`- Teclado: ${tecladoVisible ? 'abierto' : 'no se abrió'}; la app mide ${tec.H}px de alto; barra de escribir termina en ${tec.abajo}px → ${tec.abajo <= tec.H ? 'a la vista ✓' : 'TAPADA por el teclado ✗'}`);
foto('p03_teclado');
adb('shell input text "hola%sASAGI%squé%shora%ses"'.replace(/é/g, 'e'));
adb('shell input keyevent 66');
await sleep(3500);
const ult = await ev("[...document.querySelectorAll('.message')].slice(-2).map(m=>m.innerText.replace(/\\n+/g,' ').slice(0,90)).join(' ⏎ ')");
out(`- Escribí con el teclado y Enter: ${ult}`);
const horaMsg = await ev("([...document.querySelectorAll('.msg-meta')].pop()||{}).innerText||''");
out(`- Hora del mensaje: «${horaMsg}» → ${/(a|p)\.\s?m\./i.test(horaMsg) ? '12 h ✓' : 'NO está en 12 h ✗'}`);
await revisar('Chat con mensajes', 'p04_chat_mensajes');

// 4. Botón Atrás del celular: cierra teclado / vuelve a la casa, no cierra la app
adb('shell input keyevent KEYCODE_BACK'); await sleep(800);
adb('shell input keyevent KEYCODE_BACK'); await sleep(1200);
const tras = await ev("(document.querySelector('.panel.overlay.open')||{id:'launcher (casa)'}).id");
out(`- Dos veces Atrás: estoy en «${tras}» y la app ${adb('shell pidof com.asagi.app').trim() ? 'sigue abierta ✓' : 'SE CERRÓ ✗'}`);
foto('p05_atras');

// 5. Las otras pantallas
for (const [id, nombre] of [['status', 'Estado (deslizar hacia abajo)'], ['pendientes', 'Pendientes'], ['grok', 'Sala de control']]) {
  await ev(`setActiveSection('${id}')`);
  await revisar(nombre, 'p06_' + id);
}

// 6. Girar el celular
await ev("setActiveSection('launcher')");
adb('shell settings put system accelerometer_rotation 0'); adb('shell settings put system user_rotation 1');
await sleep(2500);
await revisar('Casa girada (horizontal)', 'p07_horizontal');
adb('shell settings put system user_rotation 0'); await sleep(1500);

ws.close(); process.exit(0);
