// Maneja ASAGI DENTRO del emulador por DevTools (como chrome://inspect): mide el arranque,
// escribe en el chat de verdad y lee las respuestas del DOM. Node 20+ (fetch/WebSocket globales).
// Uso: node scripts/sim_cdp.mjs <puerto> >> sim/REPORTE.md
const PORT = process.argv[2] || '9222';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
import { execSync } from 'node:child_process';
const adb = (c) => { try { return execSync('adb ' + c, { encoding: 'utf8', timeout: 15000 }); } catch (e) { return ''; } };
async function conectar() {
  for (let i = 0; i < 30; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const p = l.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(2000);
  }
  throw new Error('no hay WebView depurable');
}
const ws = new WebSocket(await conectar());
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let n = 0; const pend = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const cdp = (method, params = {}) => new Promise((r) => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? (r.result?.exceptionDetails?.exception?.description || null); };
await cdp('Runtime.enable');
const errores = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data);
  if (d.method === 'Runtime.exceptionThrown') errores.push(d.params.exceptionDetails.exception?.description?.split('\n')[0] || d.params.exceptionDetails.text);
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errores.push('console.error: ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200)); });

const out = (s) => console.log(s);
out('## Dentro de ASAGI (DevTools)');
const t0 = Date.now();
let listo = false;
for (let i = 0; i < 60; i++) { if (await ev("(()=>{const b=document.getElementById('boot');return !b||b.hidden||getComputedStyle(b).display==='none'||getComputedStyle(b).opacity==='0'})()")) { listo = true; break; } await sleep(1000); }
out(`- Arranque (pantalla de carga oculta): ${listo ? ((Date.now() - t0) / 1000).toFixed(1) + ' s desde que conecté' : 'NO en 60 s'}`);
out(`- Módulos: ${await ev("['AsagiEnlace','AsagiLan','AsagiBandeja','AsagiHerr','AsagiDiscord'].map(k=>k+(window[k]?'✓':'✗')).join(' ')")}`);
out(`- Estado cerebro: ${await ev("(document.querySelector('#brain-status,.brain-status,[data-brain]')||{}).innerText||'?'")}`);

async function di(texto, espera = 5000) {
  const antes = await ev("document.querySelectorAll('.message.bot').length");
  await ev(`(()=>{const i=document.getElementById('message-input');i.value=${JSON.stringify(texto)};i.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('chat-form').requestSubmit();return 1})()`);
  let r = '';
  for (let k = 0; k < espera / 250; k++) {
    await sleep(250);
    const now = await ev("document.querySelectorAll('.message.bot').length");
    if (now > antes) { await sleep(600); r = await ev(`[...document.querySelectorAll('.message.bot')].slice(${antes}).map(m=>m.innerText.trim()).join(' ⏎ ')`); if (!/Buscando|pensando|…$/.test(r) || k * 250 > espera - 500) break; }
  }
  out(`- **Tú:** ${texto}\n  **ASAGI:** ${(r || '(sin respuesta en ' + espera / 1000 + ' s)').replace(/\n+/g, ' ').slice(0, 400)}`);
}
out(`- Actualizador: ${await ev("window.AsagiActualizador?AsagiActualizador.revisar().then(d=>d.accion+' — '+d.motivo+' | instalada: '+JSON.stringify(d.instalada&&{build:d.instalada.build,firma:(d.instalada.firma||'').slice(0,11)})+' | remota: '+JSON.stringify(d.remota&&{build:d.remota.build,firma:(d.remota.firma||'').slice(0,11)})):'no cargado'")}`);
await di('hola asagi', 15000);
await di('bandeja');
await di('guarda en la bandeja: pagar luz hoy');
await di('prioridades');
// Navegador propio (WebView oculto nativo)
await di('navega a example.com', 25000);
await di('lee la página', 15000);
await di('clic 1', 20000);
await di('busca en la web: capital del Perú', 60000);
await di('wifi', 25000);
await di('bluetooth', 25000);
// Sin cerebro: lo cotidiano que ASAGI resuelve sola (intents reales de Android).
for (const t of ['qué hora es', 'cuánto es 15% de 230', 'cuánta batería tengo', 'pon una alarma a las 7', 'temporizador de 1 minuto',
                 'abre Settings', 'enciende la linterna', 'apaga la linterna', 'qué puedes hacer', 'cuéntame un chiste']) {
  await di(t, 8000);
  if (/alarma|temporizador|abre/.test(t)) { adb('shell input keyevent KEYCODE_BACK'); await sleep(1500);
    adb('shell am start -n com.asagi.app/.MainActivity'); await sleep(2000); }
}
await di('enlace pc', 12000);
await di('dile a ARIA hola', 15000);
// Modo manos: ASAGI usa otra app (Ajustes) por Accesibilidad y vuelve.
out(`- Accesibilidad activa: ${await ev("Capacitor.Plugins.AsagiControl.isEnabled().then(r=>r.enabled)")}`);
{
  const antes = await ev("document.querySelectorAll('.message.bot').length");
  await ev(`(()=>{const i=document.getElementById('message-input');i.value='manos: abre Settings, espera 2, toca System, espera a que aparezca Languages, atrás, atrás';i.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('chat-form').requestSubmit();return 1})()`);
  let fin = '';
  for (let k = 0; k < 120 && !fin; k++) {
    await sleep(500);
    fin = await ev(`[...document.querySelectorAll('.message.bot')].slice(${antes}).map(m=>m.innerText.trim()).filter(t=>/^🖐 (Listo|Paré|Falló|Para usar|El modo)/.test(t)).join(' ')`);
  }
  out(`- **Tú:** manos: abre Settings, espera 2, toca System, espera a que aparezca Languages, atrás, atrás\n  **ASAGI:** ${(fin || '(sin resultado en 60 s)').replace(/\n+/g, ' ').slice(0, 400)}`);
}
out(`- Lectura de pantalla (manosLeer): ${await ev("Capacitor.Plugins.AsagiControl.manosLeer({max:15}).then(r=>r.app+' · '+r.nodos.length+' elementos: '+r.nodos.slice(0,6).map(n=>n.t||n.d).join(' | ')).catch(e=>'error '+e.message)")}`);
out(`- Errores JS durante la prueba: ${errores.length}${errores.length ? '\n' + [...new Set(errores)].slice(0, 15).map((e) => '    ' + e).join('\n') : ''}`);
ws.close(); process.exit(0);
