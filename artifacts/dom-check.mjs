// Prueba DOM mínima de la app web de ASAGI a 320, 360 y 412 px.
// Comprueba lo que se rompió antes: que el script arranque, que haya mensaje
// de bienvenida, que el selector de Cerebro esté visible y que al enviar un
// mensaje siempre llegue una respuesta (con aviso si el motor no está).
//
// Uso: node artifacts/dom-check.mjs
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const html = readFileSync('index.html', 'utf8');
const appJs = readFileSync('app.js', 'utf8');

const widths = [320, 360, 412];
let failures = 0;

function check(ok, label, width) {
  if (!ok) {
    failures++;
    console.log(`  FALLA [${width}px] ${label}`);
  }
}

for (const width of widths) {
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://asagi.test/'
  });
  const { window } = dom;
  const errors = [];
  window.addEventListener('error', (event) => errors.push(String(event.message)));

  if (!window.crypto) window.crypto = {};
  if (typeof window.crypto.randomUUID !== 'function') {
    window.crypto.randomUUID = () => 'id-' + Math.random().toString(16).slice(2);
  }
  if (typeof window.structuredClone !== 'function') {
    window.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  }
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });

  try {
    window.localStorage.clear();
  } catch (error) {
    /* sin localStorage no hay persistencia; la app debe seguir viva */
  }

  window.eval(appJs);

  const doc = window.document;
  const chat = doc.getElementById('chat');
  const bubbles = chat ? chat.querySelectorAll('.message') : [];

  check(errors.length === 0, 'el script arranca sin errores: ' + errors.join(' | '), width);
  check(bubbles.length >= 1, 'hay mensaje de bienvenida al abrir', width);
  check(
    bubbles.length >= 1 && /ASAGI/i.test(bubbles[0].textContent || ''),
    'el mensaje de bienvenida es de ASAGI',
    width
  );

  const local = doc.getElementById('brain-mode-local');
  const remote = doc.getElementById('brain-mode-remote');
  check(!!local && !!remote, 'existen los botones LOCAL/REMOTO', width);
  check(!!local && local.checked === true, 'Local viene marcado por defecto', width);
  check(
    !!local && local.closest('#panel-brain') && !local.closest('#panel-brain').hasAttribute('hidden'),
    'el selector de Cerebro está visible',
    width
  );

  const form = doc.getElementById('chat-form');
  const input = doc.getElementById('message-input');
  input.value = 'hola';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  const after = chat.querySelectorAll('.message');
  check(after.length > bubbles.length, 'enviar un mensaje produce respuesta', width);
  check(input.value === '', 'el campo se vacía tras enviar', width);

  const texts = Array.from(after).map((node) => node.textContent || '');
  check(
    texts.some((text) => /respuestas de prueba|modelo local/i.test(text)),
    'se avisa de que el modelo local no está activo',
    width
  );

  const navItems = doc.querySelectorAll('.nav-item');
  check(navItems.length === 4, 'las cuatro pestañas siguen ahí', width);

  console.log(`${width}px: ${after.length} mensajes, ${errors.length} errores de script`);
  window.close();
}

if (failures > 0) {
  console.log(`\n${failures} comprobación(es) fallida(s)`);
  process.exit(1);
}
console.log('\nDOM OK en 320 / 360 / 412 px');
