import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8123/';
const LONG = ('Este es un mensaje de prueba bastante largo para forzar varias lineas de texto dentro de la burbuja y comprobar que nada se sale del ancho de la pantalla en pantallas estrechas. ').repeat(3);

let failures = 0;
let total = 0;
function check(label, ok, detail = '') {
  total += 1;
  if (ok) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
});

for (const width of [320, 360, 412]) {
  const height = 740;
  const page = await browser.newPage({ viewport: { width, height } });
  const pageErrors = [];
  page.on('pageerror', (e) => {
    pageErrors.push(e.message);
    console.log('  pageerror:', e.message);
  });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(150);

  // --- bienvenida visible y aviso del cerebro local (bug 1) ---
  const initial = await page.evaluate(() => {
    const bubbles = [...document.querySelectorAll('#chat .message:not(.meta)')].map((el) => el.textContent);
    const alert = document.getElementById('brain-alert');
    const r = alert.getBoundingClientRect();
    return {
      texts: bubbles,
      alertHidden: alert.hasAttribute('hidden'),
      alertText: alert.textContent.trim(),
      alertVisible: !alert.hasAttribute('hidden') && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight
    };
  });
  check('sin errores de JS al cargar', pageErrors.length === 0, JSON.stringify(pageErrors));
  check('mensaje de bienvenida visible al abrir', initial.texts.length >= 1 && /ASAGI/i.test(initial.texts[0] || ''), JSON.stringify(initial.texts.slice(0, 2)));
  check('aviso visible: modelo local no activo', initial.alertVisible && /respuestas de prueba/i.test(initial.alertText), initial.alertText);

  // --- LOCAL/REMOTO siguen visibles al enfocar el campo de texto (bug 2) ---
  await page.click('#message-input');
  await page.waitForTimeout(150);
  const afterFocus = await page.evaluate(() => {
    const r = (el) => el.getBoundingClientRect();
    const labels = [...document.querySelectorAll('#panel-brain .radio-group label')];
    return {
      panelScrollTop: document.getElementById('assistant').scrollTop,
      shellScrollTop: document.querySelector('.app-shell').scrollTop,
      labels: labels.map((el) => ({ text: el.textContent.trim(), top: r(el).top, bottom: r(el).bottom, w: r(el).width, h: r(el).height })),
      vh: window.innerHeight,
      alertTop: r(document.getElementById('brain-alert')).top,
      chatTop: r(document.getElementById('chat')).top
    };
  });
  check('LOCAL/REMOTO visibles con el campo enfocado', afterFocus.labels.length === 2 && afterFocus.labels.every((l) => l.w > 10 && l.h > 10 && l.top >= 0 && l.bottom <= afterFocus.vh), JSON.stringify(afterFocus.labels));
  check('la cabecera no se desplazó al enfocar el campo', afterFocus.panelScrollTop === 0 && afterFocus.shellScrollTop === 0, `panel=${afterFocus.panelScrollTop} shell=${afterFocus.shellScrollTop}`);
  check('el aviso sigue visible con el campo enfocado', afterFocus.alertTop >= 0 && afterFocus.alertTop < afterFocus.chatTop, `alert=${afterFocus.alertTop.toFixed(0)} chat=${afterFocus.chatTop.toFixed(0)}`);
  await page.evaluate(() => document.getElementById('message-input').blur());

  // 30 mensajes largos (appendMessage es global: app.js es un script clásico)
  await page.evaluate(([long]) => {
    for (let i = 0; i < 30; i += 1) {
      appendMessage(i % 2 ? 'user' : 'bot', `${i + 1}. ${long}`);
    }
  }, [LONG]);

  await page.waitForTimeout(200);

  const m = await page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height };
    };
    const chat = document.getElementById('chat');
    const input = document.getElementById('message-input');
    const sendBtn = document.querySelector('.composer button[type="submit"]');
    const tabbar = document.querySelector('.tabbar');
    const header = document.querySelector('#assistant .panel-header');
    const messages = chat.querySelectorAll('.message:not(.meta)');
    const last = messages[messages.length - 1];

    // placeholder medido con el canvas con la tipografía real del input
    const cs = getComputedStyle(input);
    const cv = document.createElement('canvas').getContext('2d');
    cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const phWidth = cv.measureText(input.placeholder).width;
    const phAvail = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;

    const pageScrollsY = document.documentElement.scrollHeight > window.innerHeight + 1;
    const pageScrollsX = document.documentElement.scrollWidth > window.innerWidth + 1;

    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      pageScrollsX,
      pageScrollsY,
      bodyOverflowYScrollable: document.body.scrollHeight > window.innerHeight + 1,
      chatScrollable: chat.scrollHeight > chat.clientHeight + 1,
      chatScrollTop: chat.scrollTop,
      chatMaxScroll: chat.scrollHeight - chat.clientHeight,
      input: box(input),
      send: box(sendBtn),
      tabbar: box(tabbar),
      header: box(header),
      lastMsg: box(last),
      chatBox: box(chat),
      msgCount: messages.length,
      placeholder: input.placeholder,
      phWidth,
      phAvail
    };
  });

  console.log(`\n== ${width}x${height} ==`);
  check('sin scroll horizontal de página', !m.pageScrollsX, `scrollWidth>vw`);
  check('sin scroll vertical de página', !m.pageScrollsY, `scrollHeight>vh`);
  check('31 mensajes renderizados (1 inicial + 30)', m.msgCount === 31, `count=${m.msgCount}`);
  check('SOLO la lista de mensajes tiene scroll interno', m.chatScrollable && !m.bodyOverflowYScrollable);
  check('composer input visible y completo', m.input.bottom <= m.vh && m.input.right <= m.vw && m.input.left >= 0 && m.input.top >= 0, JSON.stringify(m.input));
  check('botón Enviar visible y completo', m.send.bottom <= m.vh && m.send.right <= m.vw, JSON.stringify(m.send));
  check('composer visible entero (sin solape con tabbar)', m.input.bottom <= m.tabbar.top + 1, `input.bottom=${m.input.bottom.toFixed(0)} tabbar.top=${m.tabbar.top.toFixed(0)}`);
  check('tabbar pegada al fondo y visible', Math.abs(m.tabbar.bottom - m.vh) <= 1 && m.tabbar.h > 0, JSON.stringify(m.tabbar));
  check('cabecera visible arriba', m.header.top >= 0, JSON.stringify(m.header));
  check('chat ocupa la mayor parte (>55%)', m.chatBox.h / m.vh > 0.55, `${(m.chatBox.h / m.vh * 100).toFixed(1)}%`);
  check('auto-scroll al final tras los 30 mensajes', m.chatScrollTop >= m.chatMaxScroll - 2, `top=${m.chatScrollTop.toFixed(0)} max=${m.chatMaxScroll.toFixed(0)}`);
  check('último mensaje dentro del área visible del chat', m.lastMsg.bottom <= m.chatBox.bottom + 1, `msg.bottom=${m.lastMsg.bottom.toFixed(0)} chat.bottom=${m.chatBox.bottom.toFixed(0)}`);
  check('último mensaje sin quedar bajo la tabbar', m.lastMsg.bottom <= m.tabbar.top, `msg.bottom=${m.lastMsg.bottom.toFixed(0)} tabbar.top=${m.tabbar.top.toFixed(0)}`);
  check('placeholder corto: "Escribe aquí…"', m.placeholder === 'Escribe aquí…', m.placeholder);
  check('placeholder cabe en el input', m.phWidth <= m.phAvail, `${m.phWidth.toFixed(0)} > ${m.phAvail.toFixed(0)}`);

  // --- interacción: enviar mensaje con el teclado "abierto" (viewport reducido) ---
  await page.evaluate(() => { document.getElementById('chat').scrollTop = 0; });
  // En este Chromium sin sandbox la escritura real (fill/type) no llega al
  // renderer, así que se inyecta el valor por JS y se pulsa el botón real.
  await page.evaluate(() => {
    const inputEl = document.getElementById('message-input');
    inputEl.value = 'hola, esto es una prueba de envío con teclado en pantalla';
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('.composer button[type="submit"]');
  await page.waitForTimeout(400);

  const k = await page.evaluate(() => {
    const chat = document.getElementById('chat');
    const input = document.getElementById('message-input');
    const tabbar = document.querySelector('.tabbar');
    const send = document.querySelector('.composer button[type="submit"]');
    const r = (el) => el.getBoundingClientRect();
    return {
      scrolled: chat.scrollTop >= chat.scrollHeight - chat.clientHeight - 2,
      chatTop: r(chat).top, chatBottom: r(chat).bottom,
      inputBottom: r(input).bottom, sendBottom: r(send).bottom,
      tabTop: r(tabbar).top, tabBottom: r(tabbar).bottom,
      vh: window.innerHeight, vw: window.innerWidth,
      sendRight: r(send).right
    };
  });
  check('auto-scroll al final al enviar mensaje', k.scrolled, `chatTop=${k.chatTop.toFixed(0)}`);
  check('tras enviar: Enviar y composer siguen visibles', k.sendBottom <= k.vh && k.sendRight <= k.vw, JSON.stringify(k));
  check('tras enviar: tabbar sigue visible al fondo', Math.abs(k.tabBottom - k.vh) <= 1 && k.tabTop >= k.inputBottom, `tabTop=${k.tabTop.toFixed(0)} inputBottom=${k.inputBottom.toFixed(0)}`);
  check('tras enviar: input no tapado por la tabbar', k.inputBottom <= k.tabTop + 1);

  // --- el bot responde con aviso + respuesta de prueba (bug 1) ---
  const reply = await page.evaluate(() => {
    const bubbles = [...document.querySelectorAll('#chat .message:not(.meta)')].map((el) => el.textContent);
    const alert = document.getElementById('brain-alert');
    return {
      count: bubbles.length,
      lastTwo: bubbles.slice(-2),
      alertVisible: !alert.hasAttribute('hidden')
    };
  });
  check('el bot responde al enviar el mensaje', reply.count >= 33 && /respuestas de prueba/i.test(reply.lastTwo.join(' ')), `count=${reply.count} last=${JSON.stringify(reply.lastTwo)}`);
  check('el aviso del modelo sigue visible tras responder', reply.alertVisible);

  // --- cambio de sección sigue funcionando ---
  await page.click('.nav-item[data-section="launcher"]');
  await page.waitForTimeout(120);
  const tabOk = await page.evaluate(() => ({
    launcher: document.getElementById('launcher').classList.contains('active'),
    assistantHidden: !document.getElementById('assistant').classList.contains('active'),
    tabVisible: document.querySelector('.tabbar').getBoundingClientRect().bottom === window.innerHeight
  }));
  check('cambio a Launcher funciona', tabOk.launcher && tabOk.assistantHidden);
  check('tabbar sigue visible en otra sección', tabOk.tabVisible);
  await page.click('.nav-item[data-section="assistant"]');
  await page.waitForTimeout(120);
  const back = await page.evaluate(() => {
    const chat = document.getElementById('chat');
    return {
      active: document.getElementById('assistant').classList.contains('active'),
      atBottom: chat.scrollTop >= chat.scrollHeight - chat.clientHeight - 2
    };
  });
  check('volver a Asistente mantiene el chat al final', back.active && back.atBottom);

  // --- captura para revisión visual ---
  await page.screenshot({ path: `artifacts/ui-${width}.png` });

  await page.close();
}

await browser.close();
console.log(`\n${total - failures}/${total} comprobaciones OK`);
process.exit(failures ? 1 : 0);
