const STORAGE_KEY = 'asagi-state-v2';

// Identificador estable aunque crypto.randomUUID no exista (contexto no seguro).
function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

const defaultState = {
  activeSection: 'launcher',
  messages: [
    {
      id: uid(),
      sender: 'bot',
      text: 'Hola. Soy ASAGI. ¿En qué puedo ayudarte hoy?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ],
  brain: {
    mode: 'local',
    remoteUrl: '',
    remoteModel: '',
    remoteKey: '',
    geminiKey: '',
    atriaKey: '',
    mistralKey: ''
  }
};

const state = loadState();

const navItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.panel');
const chat = document.getElementById('chat');
const chatForm = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const resetButton = document.getElementById('reset-chat');

const brainHeader = document.getElementById('panel-brain');
const brainModeLocal = document.getElementById('brain-mode-local');
const brainModeRemote = document.getElementById('brain-mode-remote');
const brainUrl = document.getElementById('brain-url');
const brainModel = document.getElementById('brain-model');
const brainKey = document.getElementById('brain-key');
const brainApply = document.getElementById('brain-apply');
const brainHint = document.getElementById('brain-hint');
const brainGeminiKey = document.getElementById('brain-gemini-key');
const brainAtriaKey = document.getElementById('brain-atria-key');
const brainMistralKey = document.getElementById('brain-mistral-key');

const botReplyEl = document.getElementById('bot-reply-status');
const brainAlert = document.getElementById('brain-alert');

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      activeSection: parsed.activeSection || defaultState.activeSection,
      messages: Array.isArray(parsed.messages) && parsed.messages.length ? parsed.messages : defaultState.messages,
      brain: {
        mode: (parsed.brain && parsed.brain.mode) || defaultState.brain.mode,
        remoteUrl: (parsed.brain && typeof parsed.brain.remoteUrl === 'string') ? parsed.brain.remoteUrl : defaultState.brain.remoteUrl,
        remoteModel: (parsed.brain && typeof parsed.brain.remoteModel === 'string') ? parsed.brain.remoteModel : defaultState.brain.remoteModel,
        remoteKey: (parsed.brain && typeof parsed.brain.remoteKey === 'string') ? parsed.brain.remoteKey : defaultState.brain.remoteKey,
        geminiKey: (parsed.brain && typeof parsed.brain.geminiKey === 'string') ? parsed.brain.geminiKey : defaultState.brain.geminiKey,
        atriaKey: (parsed.brain && typeof parsed.brain.atriaKey === 'string') ? parsed.brain.atriaKey : defaultState.brain.atriaKey,
        mistralKey: (parsed.brain && typeof parsed.brain.mistralKey === 'string') ? parsed.brain.mistralKey : defaultState.brain.mistralKey
      }
    };
  } catch (error) {
    return structuredClone(defaultState);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // LocalStorage puede estar lleno o inaccesible; no romper la app.
  }
}

function ensureWelcomeMessage() {
  const hasBotMessage = state.messages.some(
    (message) => message && message.sender === 'bot' && typeof message.text === 'string' && message.text.trim()
  );
  if (hasBotMessage) return;
  state.messages.unshift({
    id: uid(),
    sender: 'bot',
    text: defaultState.messages[0].text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });
  saveState();
}

// En el WebView de Android, al enfocar el input el motor de scroll desplaza el
// contenedor con overflow:hidden para "revelar" el campo y se lleva la
// cabecera (LOCAL/REMOTO) fuera de vista. Aquí se vuelve a fijar arriba.
function pinHeaderContainers() {
  document.querySelectorAll('.app-shell, .main-panel, .panel').forEach((element) => {
    if (element.scrollTop !== 0) element.scrollTop = 0;
    if (element.scrollLeft !== 0) element.scrollLeft = 0;
  });
}

function installHeaderPinning() {
  const schedule = () => {
    pinHeaderContainers();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(pinHeaderContainers);
    }
  };
  document.addEventListener('focusin', schedule, true);
  document.addEventListener('focusout', schedule, true);
  document.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', schedule);
    window.visualViewport.addEventListener('scroll', schedule);
  }
  schedule();
}

// Núcleo v5: el Launcher es la casa (siempre visible). Asistente/Status/Grok son
// overlays ambientales que suben/bajan sobre la casa. 'launcher' = volver a casa.
function setActiveSection(sectionName) {
  state.activeSection = sectionName;
  const overlays = document.querySelectorAll('.panel.overlay');
  const aCasa = !sectionName || sectionName === 'launcher' || sectionName === 'home';
  overlays.forEach((o) => o.classList.toggle('open', !aCasa && o.dataset.panel === sectionName));
  try { if (window._asagiWallUpd) setTimeout(window._asagiWallUpd, 30); } catch (e) {}
  saveState();
}

function renderMessages() {
  chat.innerHTML = '';

  state.messages.forEach((message) => {
    const bubble = document.createElement('div');
    bubble.className = `message ${message.sender}`;

    const textEl = document.createElement('div');
    textEl.textContent = message.text;
    bubble.appendChild(textEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'message meta';
    metaEl.textContent = message.time;
    bubble.appendChild(metaEl);

    chat.appendChild(bubble);
  });

  chat.scrollTop = chat.scrollHeight;
}

function showReplyStatus(text) {
  if (!botReplyEl) return;
  if (text == null) {
    botReplyEl.textContent = '';
    botReplyEl.classList.add('hidden');
    return;
  }
  botReplyEl.classList.remove('hidden');
  botReplyEl.textContent = text;
}

function setBrainMode(mode) {
  state.brain.mode = mode;
  // guardar keys si existen
  const c = readBrainControls();
  state.brain.geminiKey = c.geminiKey || '';
  state.brain.atriaKey = c.atriaKey || '';
  state.brain.mistralKey = c.mistralKey || '';
  state.brain.remoteUrl = c.remoteUrl || '';
  state.brain.remoteModel = c.remoteModel || '';
  state.brain.remoteKey = c.remoteKey || '';
  saveState();
  renderBrainControls();
  refreshBrainStatus();
}

function readBrainControls() {
  return {
    mode: state.brain.mode,
    remoteUrl: brainUrl ? brainUrl.value.trim() : state.brain.remoteUrl,
    remoteModel: brainModel ? brainModel.value.trim() : state.brain.remoteModel,
    remoteKey: brainKey ? brainKey.value.trim() : state.brain.remoteKey,
    geminiKey: brainGeminiKey ? brainGeminiKey.value.trim() : (state.brain.geminiKey || ''),
    atriaKey: brainAtriaKey ? brainAtriaKey.value.trim() : (state.brain.atriaKey || ''),
    mistralKey: brainMistralKey ? brainMistralKey.value.trim() : (state.brain.mistralKey || '')
  };
}

function applyBrainControlsFromState() {
  if (brainModeLocal) brainModeLocal.checked = state.brain.mode === 'local';
  if (brainModeRemote) brainModeRemote.checked = state.brain.mode === 'remote';
  if (brainUrl) brainUrl.value = state.brain.remoteUrl || '';
  if (brainModel) brainModel.value = state.brain.remoteModel || '';
  if (brainKey) brainKey.value = state.brain.remoteKey || '';
  if (brainGeminiKey) brainGeminiKey.value = state.brain.geminiKey || '';
  if (brainAtriaKey) brainAtriaKey.value = state.brain.atriaKey || '';
  if (brainMistralKey) brainMistralKey.value = state.brain.mistralKey || '';
  if (brainUrl) brainUrl.disabled = state.brain.mode !== 'remote';
  if (brainModel) brainModel.disabled = state.brain.mode !== 'remote';
  if (brainKey) brainKey.disabled = state.brain.mode !== 'remote';
  if (brainGeminiKey) brainGeminiKey.disabled = false;
  if (brainAtriaKey) brainAtriaKey.disabled = false;
  if (brainMistralKey) brainMistralKey.disabled = false;
}

function renderBrainControls() {
  applyBrainControlsFromState();
  setBrainFieldsVisibility();
}

function setBrainFieldsVisibility() {
  const fields = document.getElementById('brain-fields');
  if (!fields) return;
  const visible = state.brain.mode === 'remote';
  fields.classList.toggle('show', visible);
  if (visible) {
    fields.removeAttribute('hidden');
  } else {
    fields.setAttribute('hidden', '');
  }
}

// El motor nativo de esta versión es un stub: devuelve un texto de aviso en
// vez de generar. Se detecta para no tratarlo como respuesta del modelo.
const STUB_ERROR_PATTERN = /motor nativo no disponible|no disponible en esta versi[óo]n/i;

function isStubText(text) {
  return typeof text === 'string' && STUB_ERROR_PATTERN.test(text);
}

function getBrainBridge() {
  const raw = typeof window !== 'undefined' ? window.AsagiBrainBridge : null;
  if (!raw || typeof raw !== 'object') return null;
  const engine = raw.engineState && typeof raw.engineState === 'object' ? raw.engineState : {};
  const error = typeof engine.error === 'string' ? engine.error : '';
  const stub = isStubText(error);
  return {
    raw,
    loaded: engine.loaded === true && !stub,
    stub,
    error: stub ? '' : error,
    canStream: typeof raw.streamReply === 'function',
    // El puente nativo carga el modelo en el primer mensaje, no al abrir.
    canLazyLoad: raw.canLazyLoad === true
  };
}

function describeBrain() {
  const b = state.brain;
  const brain = getBrainBridge();

  // ¿hay keys de nube puestas? (el router las usa: Gemini / Atria)
  const val = (id) => { const e = document.getElementById(id); return e && e.value ? e.value.trim() : ''; };
  const gk = val('brain-gemini-key') || (b.geminiKey || '');
  const ak = val('brain-atria-key') || (b.atriaKey || '');

  const dl = window._asagiModelo;
  if (b.mode === 'local') {
    if (brain && brain.loaded) {
      return { detail: 'Local · modelo listo', alert: '' };
    }
    if (dl && dl.estado === 'descargando') {
      const pct = dl.total ? Math.min(99, Math.floor(dl.bytes * 100 / dl.total)) : 0;
      return { detail: 'Descargando modelo · ' + pct + '%', alert: '' };
    }
    if (dl && dl.estado === 'error') {
      return { detail: 'Modelo: error al descargar', alert: 'No pude descargar el modelo (' + (dl.error || 'sin conexión') + '). Reintento solo cuando haya red.' };
    }
    // sin modelo local pero con key -> el router usa la nube, sin alarma
    if (gk || ak) {
      return { detail: 'Local sin modelo · usando ' + (ak ? 'Atria' : 'Gemini'), alert: '' };
    }
    const espera = dl && dl.estado === 'espera';
    return {
      detail: 'Local · modelo no descargado',
      descargar: !!window._asagiDescargarModelo,
      alert: espera
        ? 'Estás con datos móviles, así que no descargo solo el modelo (~400 MB). Con Wi-Fi arranca solo; si prefieres ya, toca el botón.'
        : 'El modelo local aún no está descargado (~400 MB). Pon tu key de Gemini/Atria para responder sin descargarlo, o descárgalo.'
    };
  }

  // modo remoto: con key, el router responde por la nube (no hace falta URL)
  if (ak) return { detail: 'Remoto · Atria', alert: '' };
  if (gk) return { detail: 'Remoto · Gemini', alert: '' };
  if (b.remoteUrl) {
    return { detail: 'Remoto · URL: ' + (b.remoteUrl.length > 48 ? b.remoteUrl.slice(0, 48) + '…' : b.remoteUrl), alert: '' };
  }
  return {
    detail: 'Remoto · sin key ni URL',
    alert: 'Pon tu key de Gemini o Atria en Cerebro para que ASAGI responda. Mientras tanto usa respuestas de prueba.'
  };
}

function refreshBrainStatus() {
  if (!brainHeader) return;
  const info = describeBrain();
  brainHeader.setAttribute('aria-label', 'Cerebro ' + info.detail);
  if (brainHint) {
    brainHint.textContent = info.detail;
    brainHint.hidden = false;
  }
  if (brainAlert) {
    brainAlert.textContent = info.alert;
    brainAlert.hidden = !info.alert;
  }
  const dlBtn = document.getElementById('brain-dl');
  if (dlBtn) {
    dlBtn.hidden = !info.descargar;
    if (!dlBtn._ok) {
      dlBtn._ok = true;
      dlBtn.addEventListener('click', () => {
        dlBtn.hidden = true;
        window._asagiModelo = { estado: 'descargando', bytes: 0, total: 0, error: '' };
        try { window._asagiDescargarModelo(); } catch (e) {}
        refreshBrainStatus();
      });
    }
  }
}

function createBotReply(messageText) {
  const lower = messageText.toLowerCase();

  if (lower.includes('hola') || lower.includes('buenas') || lower.includes('saludo')) {
    return '¡Hola! Estoy listo para ayudarte. ¿Quieres revisar el estado, abrir el launcher o comenzar con una tarea?';
  }

  if (lower.includes('launcher') || lower.includes('abrir launcher')) {
    return 'El launcher todavía está vacío, pero está preparado para recibir accesos rápidos y comandos futuros.';
  }

  if (lower.includes('status') || lower.includes('estado')) {
    return 'El módulo de estado está en preparación. Aún no hay indicadores activos, pero la estructura ya está lista.';
  }

  if (lower.includes('grok')) {
    return 'Grok queda reservado para futuras integraciones y exploración de contexto. La sección está preparada.';
  }

  if (lower.includes('memoria') || lower.includes('guardar')) {
    return 'La memoria local ya está activa en el navegador. Los mensajes se guardan automáticamente en tu dispositivo.';
  }

  if (lower.includes('ayuda')) {
    return 'Puedo ayudarte con la navegación del proyecto, el estado de cada sección o con la lógica del asistente. También puedo responder a mensajes simples.';
  }

  return 'He recibido tu mensaje. La lógica del asistente sigue en desarrollo y esta respuesta es un placeholder funcional para la etapa actual del proyecto.';
}

function appendMessage(sender, text) {
  const message = {
    id: uid(),
    sender,
    text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  state.messages.push(message);
  saveState();
  renderMessages();
  // memoria local: guarda lo conversado (dedup) para recordar y sincronizar con ARIA.
  try {
    if (window.AsagiMemoria) {
      if (!window._asagiMem) window._asagiMem = new window.AsagiMemoria.Memoria(window.localStorage);
      if (text && text.trim()) {
        window._asagiMem.aprender(text.trim(), sender === 'user' ? 'daniel' : 'asagi', 'chat');
      }
    }
  } catch (e) { /* memoria es best-effort */ }
  // voz: habla las respuestas del bot (si esta activada y el sigilo lo permite).
  try {
    if (sender === 'bot' && text && text.trim() && window.asagiSpeak) window.asagiSpeak(text.trim());
  } catch (e) { /* voz best-effort */ }
}

// Recupera lo que ASAGI aprendió que sea relevante a la pregunta y lo entrega
// como contexto para el cerebro (RAG: informar con lo aprendido, citando fuente).
function ctxMemoria(q) {
  try {
    if (!window.AsagiMemoria || !q || !q.trim()) return '';
    if (!window._asagiMem) window._asagiMem = new window.AsagiMemoria.Memoria(window.localStorage);
    const hits = window._asagiMem.buscar(q, 5).filter((n) => n && n.tema !== 'chat');
    if (!hits.length) return '';
    const lineas = hits.map((n) => '- ' + n.texto + (n.fuente ? ' (fuente: ' + n.fuente + ')' : ''));
    return 'Esto es lo que has aprendido y puede ser relevante. Úsalo solo si aplica, y si informas de ' +
      'finanzas aclara que es información, no un consejo de inversión:\n' + lineas.join('\n');
  } catch (e) { return ''; }
}

async function startBotStreaming(userText) {
  const b = readBrainControls();
  state.brain.geminiKey = b.geminiKey || '';
  state.brain.atriaKey = b.atriaKey || '';
  state.brain.mistralKey = b.mistralKey || '';
  saveState();
  const brain = getBrainBridge();

  try {
    // Usar router si disponible
    if (typeof window !== 'undefined' && window.AsagiBrainRouter && typeof window.AsagiBrainRouter.BrainRouter === 'function') {
      const { BrainRouter, geminiResponder, mistralResponder, atriaResponder } = window.AsagiBrainRouter;
      const gk = (state.brain.geminiKey || b.geminiKey || '').trim();
      const ak = (state.brain.atriaKey || b.atriaKey || '').trim();
      const mk = (state.brain.mistralKey || b.mistralKey || '').trim();
      const router = new BrainRouter({
        // modelo nativo si de verdad está cargado; si no, '' para que el router pase al siguiente cerebro
        localFn: async (p) => {
          if (brain && brain.raw && typeof brain.raw.streamReply === 'function' && (brain.loaded || brain.canLazyLoad)) {
            return await new Promise((resolve, reject) => {
              brain.raw.streamReply(p, { onToken: () => {}, onDone: (text) => resolve(text || ''), onError: (msg) => reject(new Error(msg)) });
            });
          }
          return '';
        },
        geminiFn: gk ? ((p) => geminiResponder(p, gk)) : null,
        // remoto: Mistral si hay key (fuerte en código), si no Atria
        remotoFn: mk ? ((p) => mistralResponder(p, mk)) : (ak ? ((p) => atriaResponder(p, ak)) : null),
        testFn: (p) => createBotReply(p),
        apiKey: gk,
        store: window.localStorage
      });
      return router.responder(userText).then((res) => {
        const texto = (res && (res.texto || res.text)) ? (res.texto || res.text) : createBotReply(userText);
        const backend = (res && res.backend) ? res.backend : 'local';
        appendMessage('bot', texto);
        try {
          const last = chat.querySelector('.message.bot:last-child');
          if (last) {
            const tag = document.createElement('div');
            tag.className = 'message meta';
            tag.textContent = 'backend: ' + backend + (res && res.degradado ? ' (degradado)' : '');
            last.appendChild(tag);
          }
        } catch (e) {}
        return;
      });
    }

    // Modo local con motor nativo realmente cargado.
    if (b.mode === 'local' && brain && brain.canStream && (brain.loaded || brain.canLazyLoad)) {
      return await streamLocalReply(userText, brain);
    }

    // Modo local sin motor utilizable: aviso legible + respuestas de prueba.
    if (b.mode === 'local') {
      let notice = 'El modelo local aún no está descargado (unos 400 MB). Te respondo con las respuestas de prueba mientras tanto.';
      if (brain && brain.stub) {
        notice = 'El modelo local todavía no está activo en esta versión (motor nativo deshabilitado). Te respondo con las respuestas de prueba.';
      } else if (brain && brain.error) {
        notice = 'El modelo local no pudo cargarse: ' + brain.error + '. Te respondo con las respuestas de prueba.';
      }
      appendMessage('bot', notice);
      appendMessage('bot', createBotReply(userText));
      return;
    }

    // Modo remoto: si falta URL, aviso + respuestas de prueba.
    if (b.mode === 'remote') {
      if (!b.remoteUrl) {
        appendMessage('bot', 'El cerebro remoto no tiene URL configurada. Te respondo con las respuestas de prueba mientras lo configuras en Cerebro.');
        appendMessage('bot', createBotReply(userText));
        return;
      }
      return await streamRemoteReply(userText, b);
    }

    appendMessage('bot', createBotReply(userText));
  } catch (error) {
    // Nunca dejar sin respuesta ni cerrar la app.
    const reason = error && error.message ? error.message : String(error);
    appendMessage('bot', 'Algo falló al generar la respuesta (' + reason + '). Te respondo con las respuestas de prueba.');
    appendMessage('bot', createBotReply(userText));
  }
}

function streamLocalReply(userText, brain) {
  const bridge = brain && brain.raw;
  return new Promise((resolve) => {
    const botId = uid();
    const bubble = document.createElement('div');
    bubble.className = 'message bot';

    const textEl = document.createElement('div');
    textEl.textContent = '';
    bubble.appendChild(textEl);

    const meta = document.createElement('div');
    meta.className = 'message meta';
    meta.textContent = 'escribiendo…';
    bubble.appendChild(meta);

    chat.appendChild(bubble);
    chat.scrollTop = chat.scrollHeight;

    const buffer = [];
    let cancelled = false;
    let finished = false;

    function finishText(finalText) {
      textEl.textContent = finalText;
      meta.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const message = {
        id: botId,
        sender: 'bot',
        text: finalText,
        time: meta.textContent
      };
      state.messages.push(message);
      saveState();
      finished = true;
      renderMessages();
      resolve();
    }

    bridge.streamReply(userText, {
      onToken: (piece) => {
        if (cancelled || finished) return;
        buffer.push(piece);
        // Evitar saltos de línea acumulados del template: normalizar a bloques de una línea.
        const joined = buffer.join('');
        const normalized = joined.replace(/\n{3,}/g, '\n\n').replace(/\n{2,}/g, '\n\n');
        textEl.textContent = normalized;
        chat.scrollTop = chat.scrollHeight;
      },
      onDone: (text, tokens, ms) => {
        if (cancelled || finished) return;
        finishText(text || textEl.textContent);
      },
      onError: (message) => {
        if (finished) return;
        cancelled = true;
        if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
        const line = isStubText(message)
          ? 'El modelo local todavía no está activo en esta versión. Te respondo con las respuestas de prueba.'
          : 'El modelo local dio un error: ' + message + '. Te respondo con las respuestas de prueba.';
        appendMessage('bot', line);
        appendMessage('bot', createBotReply(userText));
        resolve();
      }
    });
  });
}

function streamRemoteReply(userText, cfg) {
  return new Promise((resolve) => {
    let cancelled = false;

    function fallback(reason) {
      if (cancelled) return;
      cancelled = true;
      appendMessage('bot', 'No pude contactar el cerebro remoto: ' + reason + '. Te respondo con mi lógica actual.');
      appendMessage('bot', createBotReply(userText));
      resolve();
    }

    const base = cfg.remoteUrl.replace(/\/+$/, '');
    const url = base + '/chat/completions';
    const messages = [
      { role: 'system', content: (window.AsagiPersona ? window.AsagiPersona.systemPrompt() : 'Eres ASAGI, asistente personal en español. Responde de forma breve, clara y útil.') }
    ];
    const _ctx = ctxMemoria(userText);
    if (_ctx) messages.push({ role: 'system', content: _ctx });
    messages.push({ role: 'user', content: userText });

    const body = JSON.stringify({
      model: (cfg.remoteModel || 'asagi-local').trim() || 'asagi-local',
      messages,
      stream: true
    });

    let tokenBuffer = [];
    let lastBubble = null;
    let lastMeta = null;
    let streamDone = false;

    function startBubble() {
      const bubble = document.createElement('div');
      bubble.className = 'message bot';
      const textEl = document.createElement('div');
      textEl.textContent = '';
      bubble.appendChild(textEl);
      const meta = document.createElement('div');
      meta.className = 'message meta';
      meta.textContent = 'escribiendo…';
      bubble.appendChild(meta);
      chat.appendChild(bubble);
      chat.scrollTop = chat.scrollHeight;
      lastBubble = { bubble, textEl, meta };
    }

    function flushChunk(raw) {
      if (!lastBubble || streamDone) return;
      tokenBuffer.push(raw);
      const joined = tokenBuffer.join('');
      const cleaned = joined.replace(/\n{3,}/g, '\n\n').replace(/\n{2,}/g, '\n\n');
      lastBubble.textEl.textContent = cleaned;
      chat.scrollTop = chat.scrollHeight;
    }

    function commitBubble(finalText) {
      if (!lastBubble) return;
      lastBubble.textEl.textContent = finalText;
      lastBubble.meta.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const message = {
        id: uid(),
        sender: 'bot',
        text: finalText,
        time: lastBubble.meta.textContent
      };
      state.messages.push(message);
      saveState();
      lastBubble = null;
      streamDone = true;
      renderMessages();
    }

    startBubble();

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': cfg.remoteKey ? 'Bearer ' + cfg.remoteKey : ''
      },
      body
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status + ' ' + response.statusText);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8', { fatal: false });

        function readLoop() {
          return reader.read().then(({ done, value }) => {
            if (cancelled) return;
            if (done) {
              const finalText = tokenBuffer.join('').trim() || '(sin respuesta)';
              commitBubble(finalText);
              resolve();
              return;
            }
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line.startsWith('data: ')) continue;
              const payload = line.slice('data: '.length).trim();
              if (payload === '[DONE]') {
                const finalText = tokenBuffer.join('').trim() || '(sin respuesta)';
                commitBubble(finalText);
                resolve();
                return;
              }
              try {
                const parsed = JSON.parse(payload);
                const choice = parsed && parsed.choices && parsed.choices[0];
                if (choice && choice.delta && typeof choice.delta.content === 'string') {
                  flushChunk(choice.delta.content);
                }
                if (choice && choice.done) {
                  const finalText = tokenBuffer.join('').trim() || '(sin respuesta)';
                  commitBubble(finalText);
                  resolve();
                  return;
                }
              } catch (err) {
                // Línea malformada: se ignora y sigue acumulando.
              }
            }
            return readLoop();
          });
        }

        readLoop().catch((err) => {
          if (cancelled || streamDone) return;
          // Lectura fallida: se puede deber a corte de red; es legible, no un crash.
          fallback('error de conexión (' + (err && err.message || String(err)) + ')');
        });
      })
      .catch((err) => {
        if (cancelled || streamDone) return;
        fallback('no se pudo conectar (' + (err && err.message || String(err)) + ')');
      });
  });
}

navItems.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveSection(button.dataset.section);
  });
});

if (brainModeLocal) {
  brainModeLocal.addEventListener('change', () => {
    setBrainMode(brainModeLocal.checked ? 'local' : 'remote');
  });
}
if (brainModeRemote) {
  brainModeRemote.addEventListener('change', () => {
    setBrainMode(brainModeRemote.checked ? 'remote' : 'local');
  });
}



chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();

  if (!text) return;

  appendMessage('user', text);
  input.value = '';

  // "dile a ARIA que ..." -> va por el enlace propio, sin gastar el cerebro.
  const paraAria = window.AsagiEnlace && window.AsagiEnlace.esParaAria(text);
  if (paraAria && window._asagiLanEnviar) {
    window._asagiLanEnviar(paraAria);          // WiFi/Bluetooth directo; si no hay camino, cae al buzón cifrado
    return;
  }
  if (paraAria && window._asagiEnlaceEnviar) {
    window._asagiEnlaceEnviar(paraAria);
    return;
  }
  if (/^\s*(enlace pc|conecta(?:te)? (?:con|a) (?:la )?pc|conecta(?:te)? (?:con|a) aria)\s*$/i.test(text) && window._asagiLanEstado) {
    window._asagiLanEstado();
    return;
  }

  // Herramientas del celular: wifi, bluetooth, termux:, nix: (solo por orden escrita aqui).
  const herr = window.AsagiHerr && window.AsagiHerr.parsear(text);
  if (herr) {
    if (herr.tipo === 'wifi-conectar' && herr.clave) {          // la clave no se queda en el historial
      try {
        const ult = state.messages[state.messages.length - 1];
        if (ult && ult.sender === 'user' && typeof ult.text === 'string') {
          ult.text = ult.text.split(herr.clave).join('••••'); saveState(); renderMessages();
        }
      } catch (e) {}
    }
    appendMessage('bot', herr.tipo === 'termux' || herr.tipo === 'nix' ? '⚙ Ejecutando…' : '🔎 Mirando…');
    window.AsagiHerr.ejecutar(herr).then((t) => { if (t) appendMessage('bot', t); });
    return;
  }

  // Bandeja (segundo cerebro local): archiva, revisa dudas, muestra prioridades.
  const ban = window.AsagiBandeja && window.AsagiBandeja.parsear(text);
  if (ban) {
    const B = window.AsagiBandeja;
    let est; try { est = B.deserializar(localStorage.getItem('asagi-bandeja')); } catch (e) { est = B.vacio(); }
    let resp;
    if (ban.tipo === 'guardar') {
      const it = B.ingestar(est, ban.texto, 'yo');
      resp = it.cubo === 'no-encaja' ? '📥 Guardado, pero no supe dónde va: queda en "No encaja". Dime "bandeja revisar".' : '📥 Guardado en ' + it.cubo + '.';
    } else if (ban.tipo === 'mover') {
      const dudas = B.porCubo(est)['no-encaja'];
      const it = dudas[ban.n - 1];
      resp = it && B.resolver(est, it.id, ban.cubo) ? '✔ Movido a ' + ban.cubo + '.' : 'No encuentro ese número en "No encaja".';
    } else resp = B.formato(est, ban.tipo);
    try { localStorage.setItem('asagi-bandeja', B.serializar(est)); } catch (e) {}
    appendMessage('bot', resp);
    return;
  }

  // Intención de recordatorio: ASAGI lo anota él mismo y lo confirma hablando.
  if (window.AsagiPendientes && window.AsagiPendientes.esPendiente(text) && window._asagiAddPendiente) {
    const tarea = window._asagiAddPendiente(text);
    if (tarea) {
      appendMessage('bot', '📌 Anotado en tus pendientes: ' + tarea + '.');
      return;
    }
  }

  showReplyStatus('generando…');
  if (window._asagiAvatarEstado) window._asagiAvatarEstado('pensando');
  Promise.resolve(startBotStreaming(text))
    .catch((error) => {
      const reason = error && error.message ? error.message : String(error);
      appendMessage('bot', 'Algo falló al generar la respuesta (' + reason + '). Te respondo con las respuestas de prueba.');
      appendMessage('bot', createBotReply(text));
    })
    .finally(() => {
      showReplyStatus(null);
      if (window._asagiAvatarEstado) window._asagiAvatarEstado('reposo');
    });
});

resetButton.addEventListener('click', () => {
  state.messages = structuredClone(defaultState.messages);
  saveState();
  renderMessages();
});

ensureWelcomeMessage();
setActiveSection('launcher');            // siempre arranca en la casa
renderBrainControls();

// --- Avatar vivo del asistente: respira, piensa y mueve la boca al hablar ---
(function initAvatar() {
  if (!window.AsagiAvatar) return;
  const cv = document.getElementById('avatar-cv');
  const lbl = document.getElementById('avatar-estado');
  if (!cv) return;
  const NOM = { reposo: 'en reposo', pensando: 'pensando…', hablando: 'hablando' };
  let av = null;
  try { av = window.AsagiAvatar.crearAvatar(cv); } catch (e) { return; }
  window._asagiAvatar = av;
  window._asagiAvatarEstado = function (e) {
    try { av.setEstado(e); if (lbl) lbl.textContent = NOM[e] || e; } catch (_) {}
  };
  // Refleja el habla real (speechSynthesis) en la etiqueta, sin forzar estado.
  setInterval(function () {
    if (!lbl) return;
    let hablando = false;
    try { hablando = !!(window.speechSynthesis && window.speechSynthesis.speaking); } catch (_) {}
    if (hablando) lbl.textContent = NOM.hablando;
    else if (av.estado !== 'pensando') lbl.textContent = NOM[av.estado] || NOM.reposo;
  }, 300);
})();

// --- Dictado por voz: hablarle a ASAGI y que se transcriba al chat ---
(function initDictado() {
  const mic = document.getElementById('mic-btn');
  if (!mic || !window.AsagiDictado || !window.AsagiDictado.soportado()) return;
  mic.hidden = false;                       // solo si el WebView lo soporta
  let enviarTimer = null;
  const dic = window.AsagiDictado.crearDictado({
    lang: 'es-ES',
    onParcial(texto) { input.value = texto; },
    onFinal(texto) {
      input.value = texto;
      // Max automatización: al terminar la frase, envía solo tras una pausa breve.
      clearTimeout(enviarTimer);
      enviarTimer = setTimeout(function () {
        if (input.value.trim()) {
          if (typeof chatForm.requestSubmit === 'function') chatForm.requestSubmit();
          else chatForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      }, 700);
    },
    onEstado(e) {
      mic.classList.toggle('escuchando', e === 'escuchando');
      if (e === 'error') mic.classList.remove('escuchando');
    },
  });
  if (!dic) { mic.hidden = true; return; }
  mic.addEventListener('click', function () { dic.alternar(); });
})();

// --- Enlace directo con ARIA (WiFi / Bluetooth), sin internet ni tokens ---
(function initEnlaceLan() {
  const L = window.AsagiLan; if (!L) return;
  const plugin = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiControl) || null;
  function clave() {
    // Si ya hay enlace con ARIA se usa SU clave (cero pasos nuevos); si no, ASAGI crea una propia.
    try { if (localStorage.getItem('asagi-lan-fuente') === 'pc') { const k0 = localStorage.getItem('asagi-lan-clave'); if (k0) return k0; } } catch (e) {}
    try {
      const c = JSON.parse(localStorage.getItem('asagi-enlace-cfg') || 'null');
      if (c && c.clave) return c.clave;
    } catch (e) {}
    try {
      let k = localStorage.getItem('asagi-lan-clave');
      if (!k && window.AsagiEnlace && window.AsagiEnlace.disponible()) { k = L.nuevaClaveLan(); localStorage.setItem('asagi-lan-clave', k); }
      return k || '';
    } catch (e) { return ''; }
  }
  const cli = L.crearCliente({ plugin: plugin, clave: clave });
  window._asagiLan = cli;
  // La PC deja la clave por adb (files/enlace/lan.key): ASAGI la toma sola, sin teclear nada.
  async function tomarClaveDePc() {
    try {
      const P = plugin(); if (!P || !P.leerClaveLan) return;
      const r = await P.leerClaveLan();
      if (r && r.ok && /^[a-z2-7]{16,64}$/i.test(r.clave)) {
        if (localStorage.getItem('asagi-lan-clave') !== r.clave.toLowerCase()) localStorage.setItem('asagi-lan-clave', r.clave.toLowerCase());
        localStorage.setItem('asagi-lan-fuente', 'pc');
      }
    } catch (e) {}
  }
  tomarClaveDePc(); setInterval(tomarClaveDePc, 60000);
  window._asagiLanEnviar = async function (texto) {
    const r = await cli.enviar({ t: 'nota', texto: texto });
    if (r.ok) { appendMessage('bot', '📡 ARIA lo recibió por ' + (r.via === 'wifi' ? 'WiFi' : 'Bluetooth') + ': ' + texto); return; }
    if (window._asagiEnlaceEnviar) { await window._asagiEnlaceEnviar(texto); return; }
    appendMessage('bot', '📡 No encuentro a ARIA por WiFi ni Bluetooth. ¿Está abierta en la PC y en la misma red? Di "enlace pc" para ver cómo vincular.');
  };
  window._asagiLanEstado = async function () {
    appendMessage('bot', '🔎 Buscando a ARIA en la red…');
    const d = await cli.buscar();
    const cod = L.codigoLan(clave());
    appendMessage('bot', d
      ? '✅ ARIA está en tu red (' + d.host + '). Hablamos cifrado por WiFi.'
      : '⚠ No respondió. En la PC corre una sola vez: python lan.py vincular ' + cod + '  (después se conectan solas por WiFi o Bluetooth).');
  };
})();

// --- Pendientes: recordatorios locales (con captura por voz) ---
(function initPendientes() {
  const P = window.AsagiPendientes;
  if (!P) return;
  const open = document.getElementById('pend-open');
  const countEl = document.getElementById('pend-count');
  const listEl = document.getElementById('pend-list');
  const vacio = document.getElementById('pend-vacio');
  const inp = document.getElementById('pend-input');
  const go = document.getElementById('pend-go');
  const limpiar = document.getElementById('pend-limpiar');
  const mic = document.getElementById('pend-mic');
  const CLAVE = 'asagi-pendientes';
  let lista = [];

  function cargar() { try { lista = P.deserializar(localStorage.getItem(CLAVE)); } catch (e) { lista = []; } }
  function guardar() {
    try { localStorage.setItem(CLAVE, P.serializar(lista)); } catch (e) {}
    // Notificaciones nativas: avisan aunque la app este cerrada. Sin plugin
    // (navegador) no hace nada y queda el aviso dentro de la app.
    try { if (window.AsagiNotificar) window.AsagiNotificar.sincronizar(lista); } catch (e) {}
  }

  function pintarContador() {
    if (!countEl) return;
    const n = P.contarPendientes(lista);
    countEl.textContent = n; countEl.hidden = n === 0;
  }

  function pintar() {
    if (listEl) {
      listEl.innerHTML = '';
      const ord = P.ordenar(lista);
      for (const it of ord) listEl.appendChild(fila(it));
    }
    if (vacio) vacio.hidden = lista.length > 0;
    pintarContador();
  }

  function fila(it) {
    const li = document.createElement('li');
    li.className = 'pend-item' + (it.hecho ? ' hecho' : '');
    const chk = document.createElement('button');
    chk.className = 'pend-check'; chk.type = 'button';
    chk.textContent = it.hecho ? '✓' : ''; chk.setAttribute('aria-label', 'Marcar');
    chk.addEventListener('click', () => { lista = P.alternar(lista, it.id); guardar(); pintar(); });
    const txt = document.createElement('span');
    txt.className = 'pend-txt';
    txt.textContent = it.texto;
    if (it.cuando) {
      const b = document.createElement('span');
      const vencido = !it.hecho && it.cuando < Date.now();
      b.className = 'pend-when' + (vencido ? ' vencido' : '');
      b.textContent = (vencido ? '⏰ ' : '🕐 ') + P.etiquetaCuando(it.cuando, Date.now());
      txt.appendChild(document.createElement('br'));
      txt.appendChild(b);
    }
    const del = document.createElement('button');
    del.className = 'pend-del'; del.type = 'button'; del.textContent = '✕'; del.setAttribute('aria-label', 'Borrar');
    del.addEventListener('click', () => { lista = P.borrar(lista, it.id); guardar(); pintar(); });
    li.appendChild(chk); li.appendChild(txt); li.appendChild(del);
    return li;
  }

  function agregar(texto) {
    const t = (texto || '').trim(); if (!t) return '';
    lista = P.agregar(lista, t); guardar(); pintar();
    if (inp) inp.value = '';
    return P.parsearEntrada(t);
  }
  // Hook global: el asistente añade un pendiente y recibe el texto limpio.
  window._asagiAddPendiente = function (texto) { return agregar(texto); };

  if (open) open.addEventListener('click', () => { setActiveSection('pendientes'); pintar(); });
  if (go) go.addEventListener('click', () => agregar(inp && inp.value));
  if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(inp.value); } });
  if (limpiar) limpiar.addEventListener('click', () => { lista = P.limpiarHechos(lista); guardar(); pintar(); });

  // Dictado dentro del panel de pendientes (reusa AsagiDictado)
  if (mic && window.AsagiDictado && window.AsagiDictado.soportado()) {
    mic.hidden = false;
    const dic = window.AsagiDictado.crearDictado({
      lang: 'es-ES',
      onParcial(txt) { if (inp) inp.value = txt; },
      onFinal(txt) { agregar(txt); },
      onEstado(e) { mic.classList.toggle('escuchando', e === 'escuchando'); },
    });
    if (dic) mic.addEventListener('click', () => dic.alternar());
    else mic.hidden = true;
  }

  // --- Vigilante de vencimientos: avisa cuando llega la hora de un pendiente.
  // SIEMPRE avisa en pantalla (discreto). SOLO habla si hay audifonos puestos,
  // aunque este en "voz alta": nada de que te escuche gente alrededor.
  const aviso = document.getElementById('aviso');
  const avisoTxt = document.getElementById('aviso-txt');
  const avisoModo = document.getElementById('aviso-modo');
  const avisoX = document.getElementById('aviso-x');
  let avisoTimer = null;

  function mostrarAviso(texto, sono, icono) {
    if (!aviso || !avisoTxt) return;
    avisoTxt.textContent = (icono || '⏰') + ' ' + texto;
    if (avisoModo) avisoModo.textContent = sono ? '🎧' : 'en silencio';
    aviso.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => { aviso.hidden = true; }, 12000);
  }
  if (avisoX) avisoX.addEventListener('click', () => { aviso.hidden = true; clearTimeout(avisoTimer); });
  window._asagiAviso = mostrarAviso;      // lo usa la guardia de audifonos

  async function revisarVencidos() {
    const due = P.vencidos(lista, Date.now());
    if (!due.length) return;
    for (const it of due) { lista = P.marcarAvisado(lista, it.id); }
    guardar(); pintar();
    const primero = due[0];
    const frase = due.length === 1
      ? 'Te toca: ' + primero.texto
      : 'Tienes ' + due.length + ' pendientes: ' + due.map((x) => x.texto).join(', ');
    let sono = false;
    try { sono = !!(window.asagiSpeakPrivado && await window.asagiSpeakPrivado(frase)); } catch (e) {}
    mostrarAviso(frase, sono);
  }

  cargar(); pintar();
  try { if (window.AsagiNotificar) window.AsagiNotificar.sincronizar(lista); } catch (e) {}

  // El primer chequeo espera a que la voz (asagiSpeakPrivado) este definida.
  setTimeout(revisarVencidos, 1500);
  setInterval(revisarVencidos, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarVencidos(); });
  window._asagiRevisarVencidos = revisarVencidos;    // para pruebas
})();
renderMessages();
refreshBrainStatus();
installHeaderPinning();

window.addEventListener('beforeunload', () => {
  // Estado guardado en cada acción, pero por si acaso la app se cierra inesperadamente.
  saveState();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // El registro falla silenciosamente si el entorno no lo permite.
    });
  });
}

// --- Puente con el plugin nativo AsagiBrain (Capacitor) -------------------
// El motor vive en libasagi_brain.so y lo expone el plugin registrado en
// MainActivity (window.Capacitor.Plugins.AsagiBrain). Sin plugin (navegador,
// PWA o build sin motor) no se toca nada: la app sigue con las respuestas de
// prueba y su aviso.
(function attachNativeBrain() {
  const capacitor = typeof window !== 'undefined' ? window.Capacitor : null;
  const plugin = capacitor && capacitor.Plugins ? capacitor.Plugins.AsagiBrain : null;
  if (!plugin || typeof plugin.stream !== 'function') return;

  const bridge = {
    engineState: { loaded: false, error: '' },
    canLazyLoad: true,

    async refresh() {
      try {
        const status = await plugin.status();
        bridge.engineState = {
          loaded: !!(status && status.loaded),
          error: (status && status.error) || ''
        };
      } catch (error) {
        bridge.engineState = { loaded: false, error: '' };
      }
      refreshBrainStatus();
      return bridge.engineState;
    },

    async ensureLoaded() {
      if (bridge.engineState.loaded) return true;
      try {
        const result = await plugin.load();
        bridge.engineState = {
          loaded: !!(result && result.loaded),
          error: (result && result.error) || ''
        };
      } catch (error) {
        bridge.engineState = { loaded: false, error: 'no se pudo cargar el modelo' };
      }
      refreshBrainStatus();
      return bridge.engineState.loaded;
    },

    streamReply(userText, handlers) {
      const onToken = (handlers && handlers.onToken) || function () {};
      const onDone = (handlers && handlers.onDone) || function () {};
      const onError = (handlers && handlers.onError) || function () {};

      const tokenHandle = plugin.addListener('token', (event) => {
        if (event && typeof event.token === 'string') onToken(event.token);
      });

      const cleanup = () => {
        tokenHandle.then((handle) => handle.remove()).catch(() => {});
      };

      bridge
        .ensureLoaded()
        .then((ready) => {
          if (!ready) {
            cleanup();
            onError(bridge.engineState.error || 'el modelo local no está disponible');
            return null;
          }
          const msgs = [
            { role: 'system', content: (window.AsagiPersona ? window.AsagiPersona.systemPrompt() : 'Eres ASAGI, asistente personal en español. Responde breve y claro.') }
          ];
          const _c = ctxMemoria(userText);
          if (_c) msgs.push({ role: 'system', content: _c });
          msgs.push({ role: 'user', content: userText });
          return plugin.stream({ messages: msgs });
        })
        .then((result) => {
          if (!result) return;
          cleanup();
          if (result.error) {
            onError(result.error);
            return;
          }
          onDone(result.text || '', result.tokens || 0, result.ms || 0);
        })
        .catch((error) => {
          cleanup();
          onError(error && error.message ? error.message : String(error));
        });
    }
  };

  window.AsagiBrainBridge = bridge;
  bridge.refresh();
})();

// ---------------------------------------------------------------------------
// Control del telefono (AsagiControl nativo + compuerta asagi-apps.js).
// Lo activa el usuario en Ajustes; aqui solo se cablea y se expone como
// window.asagiApps. Leer/abrir = auto ; tocar/escribir = pide aprobacion.
// ---------------------------------------------------------------------------
(function () {
  function plugin() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiControl) || null;
  }

  function construir() {
    const C = plugin();
    if (!C || !window.AsagiApps) return null;
    return new window.AsagiApps.AsagiApps({
      abrirApp: (p) => C.openApp({ package: p }),
      leerPantalla: async () => (await C.readScreen()).text,
      tocar: (a) => C.tap({ x: a.x, y: a.y }),
      escribir: (t) => C.escribir ? C.escribir({ text: t }) : C.typeText({ text: t }),
      pedirAprobacion: async (acc) => window.confirm('¿Permitir que ASAGI haga "' + acc.tipo + '" en otra app?'),
      registrar: (ev) => { try { console.log('[asagi-apps]', JSON.stringify(ev)); } catch (e) {} }
    });
  }

  window.asagiApps = construir();

  const elStatus = document.getElementById('acc-status');
  const elToggle = document.getElementById('acc-toggle');
  const elCheck = document.getElementById('acc-check');

  async function refrescar() {
    const C = plugin();
    if (!elStatus) return;
    if (!C) { elStatus.textContent = 'Accesibilidad: no disponible (abre la app nativa)'; return; }
    try {
      const r = await C.isEnabled();
      elStatus.textContent = 'Accesibilidad: ' + (r && r.enabled ? 'ACTIVADA ✓' : 'desactivada');
      if (r && r.enabled && !window.asagiApps) window.asagiApps = construir();
    } catch (e) {
      elStatus.textContent = 'Accesibilidad: no disponible';
    }
  }

  if (elToggle) elToggle.addEventListener('click', () => { const C = plugin(); if (C) C.openSettings(); });
  if (elCheck) elCheck.addEventListener('click', refrescar);
  // comprobar al cargar y al volver a primer plano
  refrescar();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar(); });
})();

// ---------------------------------------------------------------------------
// Voz (con sigilo) + bloqueo de anuncios por DNS. Usa AsagiControl nativo para
// detectar audifonos; si no hay, cae al detector web. Config en localStorage.
// ---------------------------------------------------------------------------
(function () {
  function C() { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiControl) || null; }

  function cfg() {
    let c = { enabled: false, sigilo: true };
    try { c = Object.assign(c, JSON.parse(localStorage.getItem('asagi-voz') || '{}')); } catch (e) {}
    return c;
  }
  function guardarCfg(c) { try { localStorage.setItem('asagi-voz', JSON.stringify(c)); } catch (e) {} }

  async function audifonos() {
    const plugin = C();
    if (plugin && plugin.headsetConnected) {
      try { return !!(await plugin.headsetConnected()).connected; } catch (e) {}
    }
    if (window.AsagiVoz) { try { return await window.AsagiVoz.audifonosConectados(); } catch (e) {} }
    return false;
  }

  // Expuesta: habla un texto respetando voz activada + sigilo + audifonos.
  window.asagiSpeak = async function (texto) {
    if (!window.AsagiVoz) return;
    const c = cfg();
    if (!c.enabled) return;
    const aud = await audifonos();
    window.AsagiVoz.hablar(texto, { habilitado: c.enabled, sigilo: c.sigilo, audifonos: aud, lang: 'es-ES' });
    if (c.sigilo && aud) vigilarAudifonos();         // sonó porque hay audifonos: vigílalos
  };

  // Si te quitas los audifonos mientras ASAGI habla, el audio saltaria al
  // altavoz y te delataria. Esta guardia corta la voz al instante.
  let _guardia = null;
  function vigilarAudifonos() {
    clearInterval(_guardia);
    _guardia = setInterval(async () => {
      let hablando = false;
      try { hablando = !!(window.speechSynthesis && window.speechSynthesis.speaking); } catch (e) {}
      if (!hablando) { clearInterval(_guardia); _guardia = null; return; }
      if (!(await audifonos())) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
        clearInterval(_guardia); _guardia = null;
        if (window._asagiAviso) window._asagiAviso('Corté la voz: te quitaste los audífonos.', false, '🔇');
      }
    }, 400);
  }
  window._asagiVigilarAudifonos = vigilarAudifonos;   // para pruebas

  // Como asagiSpeak pero SIEMPRE discreta: suena solo con audifonos, aunque
  // este puesta "voz alta". Para avisos que no deben oirse si hay gente cerca.
  // Devuelve true si llego a sonar.
  window.asagiSpeakPrivado = async function (texto) {
    if (!window.AsagiVoz) return false;
    const c = cfg();
    if (!c.enabled) return false;
    if (!(await audifonos())) return false;          // sin audifonos -> callada
    window.AsagiVoz.hablar(texto, { habilitado: true, sigilo: true, audifonos: true, lang: 'es-ES' });
    vigilarAudifonos();                               // siempre: solo suena en privado
    return true;
  };
  // Para que otros modulos consulten si pueden sonar en privado.
  window.asagiAudifonos = audifonos;

  // Que salida de audio esta activa y si es privada. Usa el nativo (que da
  // tambien el NOMBRE del aparato: earbuds, el auto, etc.); si no, deduce.
  window.asagiSalidaAudio = async function () {
    const p = C();
    if (p && p.audioOutput) {
      try { return await p.audioOutput(); } catch (e) {}
    }
    const aud = await audifonos();
    return { tipo: aud ? 'audifonos' : 'altavoz', nombre: '', privado: aud };
  };

  const elEstado = document.getElementById('voz-estado');
  const elSigilo = document.getElementById('voz-sigilo');
  const elDns = document.getElementById('ads-dns');

  async function pintarEstado() {
    if (!elEstado) return;
    const c = cfg();
    if (!c.enabled) { elEstado.textContent = 'Voz: desactivada (toca "Voz: sigilo" para activar)'; return; }
    const sal = await window.asagiSalidaAudio();
    const quien = sal.nombre ? ' (' + sal.nombre + ')' : '';
    elEstado.textContent = 'Voz: ' + (c.sigilo
      ? (sal.privado ? 'sigilo · hablo por audífono ✓' + quien : 'sigilo · sin audífonos, solo texto')
      : 'en voz alta' + (sal.privado ? ' · pero hay audífonos' + quien : ' · ⚠ por el altavoz'));
  }

  if (elSigilo) elSigilo.addEventListener('click', () => {
    const c = cfg();
    // ciclo: off -> sigilo on -> voz alta -> off
    if (!c.enabled) { c.enabled = true; c.sigilo = true; }
    else if (c.sigilo) { c.sigilo = false; }
    else { c.enabled = false; c.sigilo = true; }
    guardarCfg(c); pintarEstado();
  });

  if (elDns) elDns.addEventListener('click', () => {
    const plugin = C();
    if (plugin && plugin.openDnsSettings) plugin.openDnsSettings();
    else alert('Ajustes > Red > DNS privado > pega: dns.adguard-dns.com');
  });

  pintarEstado();
})();

// ---------------------------------------------------------------------------
// Launcher: reloj + rejilla de apps (AsagiControl.listApps / openApp).
// ---------------------------------------------------------------------------
(function () {
  const L = () => window.AsagiLauncher;
  function C() { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiControl) || null; }
  let apps = [];
  const grid = document.getElementById('launcher-grid');
  const favWrap = document.getElementById('launcher-fav-wrap');
  const fav = document.getElementById('launcher-fav');
  const search = document.getElementById('launcher-search');
  const ask = document.getElementById('launcher-ask');
  const homeBtn = document.getElementById('launcher-home');
  const clockEl = document.getElementById('launcher-clock');
  const dateEl = document.getElementById('launcher-date');

  // conteo de uso (para "mas usadas")
  function counts() { try { return JSON.parse(localStorage.getItem('asagi-launch-counts') || '{}'); } catch (e) { return {}; } }
  function guardarCounts(c) { try { localStorage.setItem('asagi-launch-counts', JSON.stringify(c)); } catch (e) {} }

  function tick() {
    if (!L()) return;
    const r = L().reloj();
    if (clockEl) clockEl.textContent = r.hora;
    if (dateEl) dateEl.textContent = r.fecha;
  }
  tick(); setInterval(tick, 20000);

  function abrir(a) {
    const c = counts(); c[a.package] = (c[a.package] || 0) + 1; guardarCounts(c);
    const plugin = C(); if (plugin && plugin.openApp) plugin.openApp({ package: a.package });
    renderFav();
  }

  function tile(a) {
    const d = document.createElement('div'); d.className = 'launcher-app';
    const ico = document.createElement('div'); ico.className = 'launcher-ico';
    ico.style.background = L().colorTile(a.label);
    ico.textContent = L().inicial(a.label);
    const lbl = document.createElement('div'); lbl.className = 'launcher-lbl'; lbl.textContent = a.label;
    d.appendChild(ico); d.appendChild(lbl);
    d.addEventListener('click', () => abrir(a));
    return d;
  }

  function renderFav() {
    if (!fav || !favWrap || !L()) return;
    const top = L().masUsadas(apps, counts(), 8);
    if (!top.length) { favWrap.hidden = true; return; }
    favWrap.hidden = false; fav.innerHTML = '';
    for (const a of top) fav.appendChild(tile(a));
  }

  // Ejecuta un comando del palette por id.
  function ejecutarAccion(id) {
    const ir = (sec) => setActiveSection(sec);
    if (id === 'preguntar') { if (ask) { ask.hidden = false; ask.click(); } return; }
    if (id === 'ir-status') return ir('status');
    if (id === 'ir-grok') return ir('grok');
    if (id === 'escanear') { ir('status'); setTimeout(() => { const b = document.getElementById('def-scan'); if (b) b.click(); }, 180); return; }
    if (id === 'voz') { ir('status'); setTimeout(() => { const b = document.getElementById('voz-sigilo'); if (b) b.click(); }, 180); return; }
    if (id === 'ads') { ir('status'); setTimeout(() => { const b = document.getElementById('ads-dns'); if (b) b.click(); }, 180); return; }
    if (id === 'fondo') { if (window._asagiAbrirFondo) window._asagiAbrirFondo(); return; }
    if (id === 'aprender') { if (window._asagiAbrirAprender) window._asagiAbrirAprender(); return; }
  }

  // Fila de comando (palette) — distinta del tile de app.
  function filaCmd(it) {
    const d = document.createElement('button'); d.className = 'cmd-row'; d.type = 'button';
    d.innerHTML = '<span class="cmd-ico">' + (it.ico || '•') + '</span><span class="cmd-txt"><b>' +
      it.label.replace(/</g, '&lt;') + '</b><small>' + (it.sub || '') + '</small></span>';
    d.addEventListener('click', () => { if (search) search.value = ''; render(apps); if (favWrap) favWrap.hidden = false; ejecutarAccion(it.id); });
    return d;
  }

  // Fila de resultado de calculadora (tap = copiar).
  function filaCalc(it) {
    const d = document.createElement('button'); d.className = 'cmd-row cmd-calc'; d.type = 'button';
    d.innerHTML = '<span class="cmd-ico">=</span><span class="cmd-txt"><b>' + it.valor +
      '</b><small>' + it.expr.replace(/</g, '&lt;') + ' · toca para copiar</small></span>';
    d.addEventListener('click', () => {
      try { navigator.clipboard && navigator.clipboard.writeText(String(it.valor)); } catch (e) {}
      const s = d.querySelector('small'); if (s) s.textContent = '¡copiado!';
    });
    return d;
  }

  // Render con entrada escalonada. list = items del palette (apps o acciones) o apps crudas.
  function render(list, palette) {
    if (!grid || !L()) return;
    if (!list.length) { grid.innerHTML = '<div class="launcher-empty">Sin coincidencias.</div>'; return; }
    grid.innerHTML = '';
    grid.classList.toggle('as-list', !!palette);
    let i = 0;
    for (const it of list) {
      const el = palette
        ? (it.tipo === 'calc' ? filaCalc(it) : it.tipo === 'accion' ? filaCmd(it) : tile(it._app || it))
        : tile(it);
      el.style.animationDelay = Math.min(i, 16) * 22 + 'ms';
      el.classList.add('as-in');
      grid.appendChild(el); i++;
    }
  }

  async function cargar() {
    const c = C();
    if (!c || !c.listApps) { if (grid) grid.innerHTML = '<div class="launcher-empty">El Launcher necesita la app nativa (APK).</div>'; return; }
    if (grid) grid.innerHTML = '<div class="launcher-empty">Cargando apps…</div>';
    try {
      const r = await c.listApps();
      apps = (r && r.apps) || [];
      render(L().filtrar(apps, '')); renderFav();
    } catch (e) {
      if (grid) grid.innerHTML = '<div class="launcher-empty">No pude listar apps.</div>';
    }
  }

  if (search) search.addEventListener('input', () => {
    if (!L()) return;
    const q = search.value;
    if (window.AsagiPalette && q.trim()) {
      const res = window.AsagiPalette.buscar(apps, q);
      const calc = window.AsagiPalette.calcular(q);
      if (calc) res.unshift({ tipo: 'calc', valor: calc.valor, expr: calc.expr });
      render(res, true);
      const hayApp = res.some((x) => x.tipo === 'app');
      if (ask) ask.hidden = !(q.trim() && !hayApp);
      if (favWrap) favWrap.hidden = true;
    } else {
      render(L().filtrar(apps, q));
      if (ask) ask.hidden = true;
      if (favWrap) favWrap.hidden = L().masUsadas(apps, counts(), 8).length === 0;
    }
  });

  // Preguntar a ASAGI (ambiental): abre el Asistente y ENVÍA la consulta.
  function preguntar(q) {
    q = (q || '').trim(); if (!q) return;
    setActiveSection('assistant');
    const form = document.getElementById('chat-form');
    const mi = document.getElementById('message-input');
    if (mi && form) { mi.value = q; try { form.requestSubmit(); } catch (e) { form.dispatchEvent(new Event('submit', { cancelable: true })); } }
    if (search) search.value = '';
    if (ask) ask.hidden = true;
    render(apps); if (favWrap) favWrap.hidden = true;
  }
  window._asagiPreguntar = preguntar;
  if (ask) ask.addEventListener('click', () => preguntar(search ? search.value : ''));
  // Enter en la barra: si hay apps, abre la primera; si no, pregunta a ASAGI.
  if (search) search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = search.value.trim(); if (!q) return;
    const res = window.AsagiPalette ? window.AsagiPalette.buscar(apps, q) : [];
    const app0 = res.find((x) => x.tipo === 'app');
    const calc = window.AsagiPalette && window.AsagiPalette.calcular(q);
    if (app0 && !calc) abrir(app0._app || app0);
    else preguntar(q);
  });

  if (homeBtn) homeBtn.addEventListener('click', () => {
    const c = C();
    if (c && c.openHomeSettings) c.openHomeSettings();
    else alert('Ajustes > Apps > Apps predeterminadas > App de inicio > ASAGI');
  });

  // El launcher es la casa: carga las apps al arrancar.
  setTimeout(() => { if (!apps.length) cargar(); }, 500);

  // Botón Enjambre (home) + botones "volver" de los overlays.
  const enjambre = document.getElementById('enjambre-btn');
  if (enjambre) enjambre.addEventListener('click', () => setActiveSection('grok'));
  document.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', () => setActiveSection('launcher')));
})();

// ---------------------------------------------------------------------------
// Grok · bots: despliega bots especializados (bots.js) via el cerebro (router).
// ---------------------------------------------------------------------------
(function () {
  const input = document.getElementById('grok-input');
  const go = document.getElementById('grok-go');
  const cont = document.getElementById('enj-bots');
  const feed = document.getElementById('enj-feed');
  const gcanvas = document.getElementById('enj-graph');
  const elTrab = document.getElementById('enj-trabajando');
  const elList = document.getElementById('enj-listos');
  const elTot = document.getElementById('enj-total');
  if (elTot && window.AsagiBots) elTot.textContent = window.AsagiBots.BOTS.length;

  let estado = null, timer = null, feedVistos = 0;
  const tarjetas = {};                    // id -> {card, bar, paso, estadoEl, resEl}

  function val(id) { const e = document.getElementById(id); return e && e.value ? e.value.trim() : ''; }

  async function ejecutarBot(prompt, bot) {
    const R = window.AsagiBrainRouter;
    if (!R) return '(cerebro no disponible)';
    const gk = val('brain-gemini-key'), ak = val('brain-atria-key'), mk = val('brain-mistral-key');
    const esProg = bot && bot.id === 'programador';       // el Programador prefiere Mistral (código)
    const router = new R.BrainRouter({
      geminiFn: gk ? ((p) => R.geminiResponder(p, gk)) : null,
      remotoFn: (esProg && mk) ? ((p) => R.mistralResponder(p, mk, 'codestral-latest'))
              : mk ? ((p) => R.mistralResponder(p, mk))
              : ak ? ((p) => R.atriaResponder(p, ak)) : null,
      testFn: () => 'El bot ' + (bot ? bot.nombre : '') + ' necesita una key (Gemini/Mistral/Atria) para responder de verdad.',
      store: window.localStorage,
    });
    const res = await router.responder(prompt);
    return (res && (res.texto || res.text)) || '';
  }

  function tarjeta(w) {
    const d = document.createElement('div'); d.className = 'enj-card trabajando'; d.style.setProperty('--bc', w.color);
    d.innerHTML = '<div class="enj-card-top"><span class="enj-dot"></span><span class="enj-card-name">' + w.nombre +
      '</span><span class="enj-card-estado">en cola</span></div>' +
      '<div class="enj-paso">—</div><div class="enj-bar"><i></i></div><div class="enj-card-res" hidden></div>';
    tarjetas[w.id] = { card: d, bar: d.querySelector('.enj-bar > i'), paso: d.querySelector('.enj-paso'),
      estadoEl: d.querySelector('.enj-card-estado'), resEl: d.querySelector('.enj-card-res') };
    return d;
  }

  function pintarFeed() {
    if (!feed || !estado) return;
    for (let i = feedVistos; i < estado.feed.length; i++) {
      const ev = estado.feed[i];
      const line = document.createElement('div'); line.className = 'enj-feed-line';
      line.innerHTML = '<b style="color:' + ev.color + '">' + ev.bot + '</b> <span style="opacity:.55">›</span> ' + ev.txt.replace(/</g, '&lt;');
      feed.appendChild(line);
    }
    feedVistos = estado.feed.length;
    feed.scrollTop = feed.scrollHeight;
    while (feed.children.length > 80) feed.removeChild(feed.firstChild);
  }

  function pintar() {
    if (!estado) return;
    for (const w of estado.workers) {
      const tj = tarjetas[w.id]; if (!tj) continue;
      tj.bar.style.width = w.progreso + '%';
      tj.paso.textContent = w.paso;
      tj.estadoEl.textContent = w.estado === 'trabajando' ? 'trabajando' : (w.estado === 'listo' ? 'listo' : 'en cola');
      tj.card.classList.toggle('trabajando', w.estado === 'trabajando');
      tj.card.classList.toggle('listo', w.estado === 'listo');
    }
    const r = window.AsagiEnjambre.resumen(estado);
    if (elTrab) elTrab.textContent = r.trabajando;
    if (elList) elList.textContent = r.listos;
    pintarFeed();
  }

  function desplegar() {
    if (!window.AsagiBots || !window.AsagiEnjambre || !input) return;
    const tarea = input.value.trim(); if (!tarea) return;
    input.value = '';
    const bots = window.AsagiBots.elegirBots(tarea, 4);
    estado = window.AsagiEnjambre.crearTrabajo(bots, tarea);
    feedVistos = 0; if (feed) feed.innerHTML = '';
    for (const k in tarjetas) delete tarjetas[k];
    if (cont) { cont.innerHTML = ''; for (const w of estado.workers) cont.appendChild(tarjeta(w)); }
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      estado = window.AsagiEnjambre.tick(estado, 1);
      pintar();
      if (estado.hecho) { clearInterval(timer); timer = null; }
    }, 110);
    // En paralelo: el cerebro resuelve de verdad y el resultado aparece en cada tarjeta.
    window.AsagiBots.desplegar(tarea, ejecutarBot, { max: bots.length }).then((res) => {
      for (const r of res) {
        const tj = tarjetas[r.bot.id]; if (tj && tj.resEl) { tj.resEl.hidden = false; tj.resEl.textContent = r.texto; }
      }
    }).catch(() => {});
  }
  if (go) go.addEventListener('click', desplegar);
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') desplegar(); });

  // --- Grafo del enjambre: núcleo ASAGI central + bots en círculo + pulsos ---
  (function graph() {
    if (!gcanvas || !gcanvas.getContext) return;
    const g = gcanvas.getContext('2d');
    let W = 1, H = 1, raf = null, tt = 0;
    let convT = 0;                     // 0..1: convergencia de los bots al terminar
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    function size() {
      const r = gcanvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      gcanvas.width = Math.floor(W * dpr); gcanvas.height = Math.floor(H * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function draw() {
      raf = requestAnimationFrame(draw); tt += 0.03;
      g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(5,8,16,0.5)'; g.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const ws = (estado && estado.workers) || [];
      const n = Math.max(ws.length, 1);
      // convergencia: cuando todo está hecho, los bots se acercan al núcleo (idea Swarm Rebuild)
      const hecho = !!(estado && estado.hecho) && ws.length > 0;
      convT += ((hecho ? 1 : 0) - convT) * 0.06;
      if (convT < 0.001) convT = 0;
      const pull = easeOut(Math.min(1, convT)) * 0.5;          // hasta 50% hacia el centro
      // edges + pulsos
      ws.forEach((w, i) => {
        const ang = (i / n) * Math.PI * 2 - Math.PI / 2;
        const R = Math.min(W, H) * 0.36 * (1 - pull);
        const bx = cx + Math.cos(ang) * R, by = cy + Math.sin(ang) * R;
        g.strokeStyle = 'rgba(120,150,190,' + (0.22 - pull * 0.12).toFixed(2) + ')'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(bx, by); g.stroke();
        if (w.estado === 'trabajando') {
          const fp = (tt * 0.6 + i * 0.3) % 1;                 // pulso viaja núcleo->bot
          const px = cx + (bx - cx) * fp, py = cy + (by - cy) * fp;
          g.fillStyle = w.color; g.beginPath(); g.arc(px, py, 2.4, 0, Math.PI * 2); g.fill();
        }
        // anillo de progreso por agente (medidor en vivo, idea Swarm Rebuild)
        const prog = Math.max(0, Math.min(100, w.progreso || 0)) / 100;
        if (prog > 0 && w.estado !== 'listo') {
          g.strokeStyle = w.color; g.globalAlpha = 0.9; g.lineWidth = 2;
          g.beginPath(); g.arc(bx, by, 9, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); g.stroke();
          g.globalAlpha = 1; g.lineWidth = 1;
        }
        // nodo bot
        const glow = w.estado === 'trabajando' ? (0.6 + 0.4 * Math.sin(tt * 4 + i)) : (w.estado === 'listo' ? 0.9 : 0.4);
        g.fillStyle = w.color; g.globalAlpha = glow;
        g.beginPath(); g.arc(bx, by, w.estado === 'listo' ? 6 : 5, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
        if (w.estado === 'listo') {                            // tilde al terminar
          g.strokeStyle = '#eaffea'; g.lineWidth = 1.6; g.beginPath();
          g.moveTo(bx - 2.4, by); g.lineTo(bx - 0.6, by + 2); g.lineTo(bx + 2.6, by - 2.4); g.stroke(); g.lineWidth = 1;
        }
        g.fillStyle = 'rgba(220,235,255,0.75)'; g.font = '8px monospace'; g.textAlign = 'center';
        g.fillText(w.nombre.slice(0, 7), bx, by + 15);
      });
      // destello de completado: anillo que se expande una vez al converger
      if (convT > 0.02 && convT < 0.6) {
        const rr = easeOut(convT / 0.6) * Math.min(W, H) * 0.42;
        g.strokeStyle = 'rgba(56,189,248,' + (0.5 * (1 - convT / 0.6)).toFixed(2) + ')';
        g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1;
      }
      // núcleo ASAGI
      const pulse = 0.7 + 0.3 * Math.sin(tt * 2);
      const grd = g.createRadialGradient(cx, cy, 0, cx, cy, 20);
      grd.addColorStop(0, 'rgba(56,189,248,' + (0.9 * pulse).toFixed(2) + ')');
      grd.addColorStop(1, 'rgba(56,189,248,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#eaf6ff'; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(220,235,255,0.9)'; g.font = 'bold 8px monospace'; g.textAlign = 'center';
      g.fillText('ASAGI', cx, cy + 3);
    }
    function run() { const ab = document.getElementById('grok'); if (ab && ab.classList.contains('open')) { if (!raf) { size(); draw(); } } else if (raf) { cancelAnimationFrame(raf); raf = null; } }
    window.addEventListener('resize', () => { if (raf) size(); });
    // arranca/para el grafo según el overlay esté abierto
    const enjBtn = document.getElementById('enjambre-btn');
    if (enjBtn) enjBtn.addEventListener('click', () => setTimeout(run, 360));
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => setTimeout(run, 360)));
    setInterval(run, 1000);
  })();
})();

// Wallpaper animado del Launcher (solo corre cuando el Launcher está visible).
(function () {
  const canvas = document.getElementById('launcher-wall');
  if (!canvas || !window.AsagiWallpaper) return;
  let modo = 'constelacion', tema = 'cian', imagen = null;
  try { modo = localStorage.getItem('asagi-wall-modo') || modo; tema = localStorage.getItem('asagi-wall-tema') || tema; if (modo === 'imagen') imagen = localStorage.getItem('asagi-wall-img'); } catch (e) {}
  const wp = window.AsagiWallpaper.crearWallpaper(canvas, { modo: modo, tema: tema, imagen: imagen });
  window._asagiWall = wp;                 // el panel de personalización lo controla
  // Acento dinámico: la UI (pestañas, botones) sigue el color del fondo (Material You / Niagara).
  const ACC = { cian: ['#38bdf8', 'rgba(56,189,248,.4)'], violeta: ['#a78bfa', 'rgba(167,139,250,.4)'],
    verde: ['#2dd4bf', 'rgba(45,212,191,.4)'], rosa: ['#f472b6', 'rgba(244,114,182,.4)'], ambar: ['#fbbf24', 'rgba(251,191,36,.4)'] };
  window._asagiAccento = function (t) {
    let key = t;
    if (t === 'auto') { const h = new Date().getHours(); key = h < 6 ? 'violeta' : h < 12 ? 'cian' : h < 18 ? 'verde' : h < 21 ? 'ambar' : 'rosa'; }
    const a = ACC[key] || ACC.cian;
    try { document.documentElement.style.setProperty('--cyan', a[0]); document.documentElement.style.setProperty('--glow', a[1]); } catch (e) {}
  };
  window._asagiAccento(tema);
  // El launcher es la casa (siempre visible): el fondo corre salvo que haya un
  // overlay abierto encima (ahorra batería).
  function upd() {
    const tapado = document.querySelector('.panel.overlay.open');
    if (!tapado) { wp.resize(); wp.start(); } else { wp.stop(); }
  }
  window._asagiWallUpd = upd;              // setActiveSection lo llama al abrir/cerrar overlays
  setTimeout(upd, 700);
})();

// Personalización del fondo: hoja con modos + colores, en vivo y persistida.
(function () {
  if (!window.AsagiWallpaper) return;
  const btn = document.getElementById('wall-cfg');
  const sheet = document.getElementById('wall-sheet');
  const cerrar = document.getElementById('wall-cerrar');
  const rModos = document.getElementById('wall-modos');
  const rTemas = document.getElementById('wall-temas');
  if (!btn || !sheet || !rModos || !rTemas) return;
  const NOMBRE = { constelacion: 'Constelación', flujo: 'Flujo', aurora: 'Aurora', ondas: 'Ondas', matrix: 'Matrix', anime: 'Anime', imagen: 'Imagen propia', video: 'Video / GIF' };

  // Elegir una imagen propia (p. ej. un wallpaper anime tuyo): se reduce y se guarda.
  function pedirImagen() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        const im = new Image();
        im.onload = () => {
          // reducir a máx 900px de ancho para que entre en localStorage
          const maxW = 900, esc = Math.min(1, maxW / im.width);
          const cv = document.createElement('canvas');
          cv.width = Math.round(im.width * esc); cv.height = Math.round(im.height * esc);
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          let data; try { data = cv.toDataURL('image/jpeg', 0.82); } catch (e) { data = fr.result; }
          try { localStorage.setItem('asagi-wall-img', data); } catch (e) {}
          if (window._asagiWall) { window._asagiWall.setImagen(data); window._asagiWall.setModo('imagen'); }
          try { localStorage.setItem('asagi-wall-modo', 'imagen'); } catch (e) {}
          pintar();
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(f);
    });
    document.body.appendChild(inp); inp.click();
    setTimeout(() => inp.remove(), 60000);
  }
  window._asagiPedirImagen = pedirImagen;

  // Video/GIF de la galería como fondo vivo. Se guarda en IndexedDB (no cabe en localStorage).
  const IDB = { abrir() { return new Promise((ok, no) => { const r = indexedDB.open('asagi-wall', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); },
    async poner(k, v) { const d = await this.abrir(); return new Promise((ok, no) => { const t = d.transaction('f', 'readwrite'); t.objectStore('f').put(v, k); t.oncomplete = ok; t.onerror = () => no(t.error); }); },
    async leer(k) { const d = await this.abrir(); return new Promise((ok, no) => { const q = d.transaction('f').objectStore('f').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); }); } };
  function ponerVideoBlob(b) { try { window._asagiWall.setVideo(URL.createObjectURL(b)); window._asagiWall.setModo('video'); localStorage.setItem('asagi-wall-modo', 'video'); } catch (e) {} pintar(); }
  function pedirVideo() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'video/*,image/gif'; inp.style.display = 'none';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      try { await IDB.poner('video', f); } catch (e) {}
      ponerVideoBlob(f);
    });
    document.body.appendChild(inp); inp.click();
    setTimeout(() => inp.remove(), 60000);
  }
  window._asagiPedirVideo = pedirVideo;
  (async () => { try { if (localStorage.getItem('asagi-wall-modo') === 'video') { const b = await IDB.leer('video'); if (b) ponerVideoBlob(b); } } catch (e) {} })();
  const SW = { cian: '#38bdf8', violeta: '#a78bfa', verde: '#2dd4bf', rosa: '#f472b6', ambar: '#fbbf24',
    auto: 'conic-gradient(from 0deg, #38bdf8, #a78bfa, #2dd4bf, #fbbf24, #f472b6, #38bdf8)' };
  function cur() { const w = window._asagiWall; return { m: w ? w.getModo() : 'constelacion', t: w ? w.getTema() : 'cian' }; }
  function pintar() {
    const c = cur();
    rModos.innerHTML = ''; rTemas.innerHTML = '';
    window.AsagiWallpaper.MODOS.forEach((m) => {
      const b = document.createElement('button');
      b.className = 'wall-chip' + (m === c.m ? ' on' : ''); b.type = 'button'; b.textContent = NOMBRE[m] || m;
      b.addEventListener('click', () => {
        if (m === 'imagen') {
          let guardada = null; try { guardada = localStorage.getItem('asagi-wall-img'); } catch (e) {}
          if (guardada && window._asagiWall) { window._asagiWall.setImagen(guardada); window._asagiWall.setModo('imagen'); try { localStorage.setItem('asagi-wall-modo', 'imagen'); } catch (e) {} pintar(); }
          else pedirImagen();                 // sin imagen aún -> pide una
          return;
        }
        if (m === 'video') { pedirVideo(); return; }
        if (window._asagiWall) window._asagiWall.setModo(m);
        try { localStorage.setItem('asagi-wall-modo', m); } catch (e) {}
        pintar();
      });
      rModos.appendChild(b);
    });
    Object.keys(SW).forEach((t) => {
      const b = document.createElement('button');
      b.className = 'wall-sw' + (t === c.t ? ' on' : ''); b.type = 'button'; b.style.background = SW[t];
      b.setAttribute('aria-label', t);
      b.addEventListener('click', () => {
        if (window._asagiWall) window._asagiWall.setTema(t);
        if (window._asagiAccento) window._asagiAccento(t);
        try { localStorage.setItem('asagi-wall-tema', t); } catch (e) {}
        pintar();
      });
      rTemas.appendChild(b);
    });
  }
  function abrir() { pintar(); sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('open')); }
  function cerrarSheet() { sheet.classList.remove('open'); setTimeout(() => { sheet.hidden = true; }, 240); }
  btn.addEventListener('click', abrir);
  if (cerrar) cerrar.addEventListener('click', cerrarSheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) cerrarSheet(); });
  window._asagiAbrirFondo = abrir;        // el comando "Cambiar fondo" del palette
})();

// Ingestor de conocimiento: pega una transcripción/artículo y ASAGI lo aprende
// (lo probamos: 1 exposición basta). Se guarda en memoria por tema para informarte luego.
(function () {
  const sheet = document.getElementById('learn-sheet');
  const go = document.getElementById('learn-go');
  const fuente = document.getElementById('learn-fuente');
  const texto = document.getElementById('learn-texto');
  const estado = document.getElementById('learn-estado');
  if (!sheet || !go || !texto) return;
  function abrir() { estado.textContent = ''; sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('open')); setTimeout(() => texto.focus(), 250); }
  function cerrar() { sheet.classList.remove('open'); setTimeout(() => { sheet.hidden = true; }, 240); }
  sheet.addEventListener('click', (e) => { if (e.target === sheet) cerrar(); });
  window._asagiAbrirAprender = abrir;
  go.addEventListener('click', () => {
    const t = (texto.value || '').trim();
    if (!t) { estado.textContent = 'Pega algún texto primero.'; return; }
    if (!window.AsagiConocimiento) { estado.textContent = 'Falta el módulo de conocimiento.'; return; }
    const r = window.AsagiConocimiento.ingerir(t, (fuente.value || '').trim() || 'manual');
    try {
      if (window.AsagiMemoria) {
        if (!window._asagiMem) window._asagiMem = new window.AsagiMemoria.Memoria(window.localStorage);
        r.items.forEach((it) => window._asagiMem.aprender(it.texto, it.tema, it.fuente));
      }
    } catch (e) {}
    estado.innerHTML = '<b>' + r.resumen + '</b>' + (r.items.length ? '<br><small>' +
      r.items.slice(0, 3).map((i) => '• ' + i.texto.replace(/</g, '&lt;')).join('<br>') + '</small>' : '');
    if (r.items.length) { texto.value = ''; }
  });
})();

// Foto de fondo + editor: el usuario pone una foto y la encuadra (recorte/centro/
// ajuste/zoom/oscurecer/desenfoque). Toda foto queda bien sin importar su tamaño.
(function () {
  const file = document.getElementById('wall-foto-file');
  const pick = document.getElementById('wall-foto-pick');
  const quitar = document.getElementById('wall-foto-quitar');
  const edit = document.getElementById('wall-foto-edit');
  const capa = document.getElementById('launcher-photo');
  const img = document.getElementById('launcher-photo-img');
  if (!file || !pick || !capa || !img) return;
  const tint = document.getElementById('wf-tint');
  const vig = document.getElementById('wf-vig');
  const notas = document.getElementById('wf-notas');
  const autoBtn = document.getElementById('wf-auto');
  const filtrosRow = document.getElementById('wf-filtros');
  const DEF = { ajuste: 'cover', zoom: 100, x: 50, y: 50, dim: 32, blur: 0, exposicion: 100, contraste: 100, saturacion: 100, calidez: 0, vineta: 0, gris: 0 };
  const S = { zoom: 'wf-zoom', x: 'wf-x', y: 'wf-y', dim: 'wf-dim', blur: 'wf-blur', exposicion: 'wf-exposicion', contraste: 'wf-contraste', saturacion: 'wf-saturacion', calidez: 'wf-calidez', vineta: 'wf-vineta' };
  let cfg = Object.assign({}, DEF);

  function aplicar() {
    img.style.objectFit = cfg.ajuste;
    img.style.objectPosition = cfg.x + '% ' + cfg.y + '%';
    img.style.transform = 'scale(' + (cfg.zoom / 100) + ')';
    const brillo = (cfg.exposicion / 100) * (1 - cfg.dim / 100);
    img.style.filter = 'brightness(' + brillo.toFixed(2) + ') contrast(' + (cfg.contraste / 100).toFixed(2) +
      ') saturate(' + (cfg.saturacion / 100).toFixed(2) + ') grayscale(' + (cfg.gris || 0) + ') blur(' + cfg.blur + 'px)';
    // calidez: tinte cálido (naranja) o frío (azul)
    if (tint) {
      const c = cfg.calidez / 100;
      if (c > 0) { tint.style.background = '#ff9838'; tint.style.opacity = (c * 0.9).toFixed(2); }
      else if (c < 0) { tint.style.background = '#3aa0ff'; tint.style.opacity = (-c * 0.9).toFixed(2); }
      else { tint.style.opacity = 0; }
    }
    if (vig) vig.style.opacity = (cfg.vineta / 100).toFixed(2);
  }
  function mostrarFoto(on) {
    capa.classList.toggle('on', on);
    const canvas = document.getElementById('launcher-wall');
    if (canvas) canvas.style.display = on ? 'none' : 'block';
    try { if (on && window._asagiWall) window._asagiWall.stop(); else if (window._asagiWallUpd) window._asagiWallUpd(); } catch (e) {}
    if (quitar) quitar.hidden = !on;
    if (edit) edit.hidden = !on;
  }
  function guardar() { try { localStorage.setItem('asagi-foto-cfg', JSON.stringify(cfg)); } catch (e) {} }
  function syncSliders() {
    for (const k in S) { const el = document.getElementById(S[k]); if (el) el.value = cfg[k]; }
    document.querySelectorAll('.wf-fit [data-fit]').forEach((b) => b.classList.toggle('on', b.dataset.fit === cfg.ajuste));
  }

  // Histograma real de la imagen (para que ASAGI la analice con criterio).
  function histograma() {
    try {
      const n = 64, cv = document.createElement('canvas'); cv.width = n; cv.height = n;
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0, n, n);
      const d = g.getImageData(0, 0, n, n).data, N = n * n;
      let sum = 0, sr = 0, sg = 0, sb = 0, som = 0, alt = 0; const L = [];
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
        const l = 0.299 * r + 0.587 * gg + 0.114 * b; L.push(l);
        sum += l; sr += r; sg += gg; sb += b; if (l < 0.12) som++; if (l > 0.92) alt++;
      }
      const brillo = sum / N; let v = 0; for (const l of L) v += (l - brillo) * (l - brillo);
      return { brillo: brillo, desv: Math.sqrt(v / N), rMean: sr / N, gMean: sg / N, bMean: sb / N, sombra: som / N, alta: alt / N };
    } catch (e) { return null; }
  }

  // ASAGI edita la foto: analiza y aplica correcciones fundamentadas + explica.
  function auto() {
    if (!window.AsagiFotoIA) return;
    const st = histograma(); if (!st) { if (notas) { notas.hidden = false; notas.textContent = 'No pude leer la imagen.'; } return; }
    const res = window.AsagiFotoIA.analizar(st);
    const a = res.ajustes;
    cfg.exposicion = Math.round(window.AsagiFotoIA.clamp(a.exposicion * 100, 50, 160));
    cfg.contraste = Math.round(window.AsagiFotoIA.clamp(a.contraste * 100, 60, 160));
    cfg.saturacion = Math.round(window.AsagiFotoIA.clamp(a.saturacion * 100, 0, 200));
    cfg.calidez = Math.round(window.AsagiFotoIA.clamp(a.calidez * 100, -50, 50));
    cfg.vineta = Math.round(window.AsagiFotoIA.clamp(a.vineta * 100, 0, 70));
    cfg.gris = 0;
    syncSliders(); aplicar(); guardar();
    if (notas) { notas.hidden = false; notas.innerHTML = '<b>ASAGI editó la foto:</b><br>' + res.notas.map((n) => '• ' + n).join('<br>'); }
  }

  function pintarFiltros() {
    if (!filtrosRow || !window.AsagiFotoIA) return;
    const NOM = { ninguno: 'Ninguno', vivido: 'Vívido', cine: 'Cine', frio: 'Frío', calido: 'Cálido', byn: 'B/N', suave: 'Suave' };
    filtrosRow.innerHTML = '';
    Object.keys(window.AsagiFotoIA.FILTROS).forEach((key) => {
      const b = document.createElement('button'); b.className = 'wall-chip'; b.type = 'button'; b.textContent = NOM[key] || key;
      b.addEventListener('click', () => {
        const f = window.AsagiFotoIA.FILTROS[key];
        cfg.exposicion = Math.round(f.exposicion * 100); cfg.contraste = Math.round(f.contraste * 100);
        cfg.saturacion = Math.round(f.saturacion * 100); cfg.calidez = Math.round(f.calidez * 100);
        cfg.vineta = Math.round(f.vineta * 100); cfg.gris = f.gris || 0;
        syncSliders(); aplicar(); guardar();
        if (notas) notas.hidden = true;
      });
      filtrosRow.appendChild(b);
    });
  }

  // Importa: reduce a tamaño de pantalla y guarda como JPEG (cabe en localStorage).
  function importar(f) {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const maxW = 1080, maxH = 2400; let w = im.width, h = im.height;
        const r = Math.min(maxW / w, maxH / h, 1); w = Math.round(w * r); h = Math.round(h * r);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(im, 0, 0, w, h);
        let data; try { data = cv.toDataURL('image/jpeg', 0.85); } catch (e) { data = fr.result; }
        try { localStorage.setItem('asagi-foto-img', data); } catch (e) {}
        img.onload = () => { cfg = Object.assign({}, DEF); syncSliders(); aplicar(); mostrarFoto(true); guardar(); if (notas) notas.hidden = true; img.onload = null; };
        img.src = data;
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(f);
  }

  pick.addEventListener('click', () => file.click());
  file.addEventListener('change', () => { if (file.files && file.files[0]) importar(file.files[0]); file.value = ''; });
  if (quitar) quitar.addEventListener('click', () => {
    try { localStorage.removeItem('asagi-foto-img'); localStorage.removeItem('asagi-foto-cfg'); } catch (e) {}
    img.removeAttribute('src'); mostrarFoto(false); if (notas) notas.hidden = true;
  });
  if (autoBtn) autoBtn.addEventListener('click', auto);
  for (const k in S) { const el = document.getElementById(S[k]); if (el) el.addEventListener('input', () => { cfg[k] = Number(el.value); aplicar(); guardar(); }); }
  document.querySelectorAll('.wf-fit [data-fit]').forEach((b) => b.addEventListener('click', () => { cfg.ajuste = b.dataset.fit; syncSliders(); aplicar(); guardar(); }));
  pintarFiltros();

  // --- Retro: dithering y arte ASCII (idea de ascii-magic.com, motor retro.js) ---
  const retroRow = document.getElementById('wf-retro');
  const asciiBtn = document.getElementById('wf-ascii-btn');
  const asciiOff = document.getElementById('wf-ascii-off');
  const asciiBox = document.getElementById('wf-ascii');
  const RETRO_NOM = { '': 'Original', gameboy: 'Game Boy', pico8: 'PICO-8', c64: 'C64', verde: 'Verde', ambar: 'Ámbar', bn: 'B/N' };
  let retroPaleta = '';

  function conOriginal(maxW) {
    return new Promise(function (res, rej) {
      const src = localStorage.getItem('asagi-foto-img');
      if (!src) return rej(new Error('sin foto'));
      const im = new Image();
      im.onload = function () {
        const r = Math.min(1, maxW / im.width);
        const w = Math.max(1, Math.round(im.width * r)), h = Math.max(1, Math.round(im.height * r));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, w, h);
        res({ cv: cv, cx: cx, w: w, h: h });
      };
      im.onerror = function () { rej(new Error('no carga')); };
      im.src = src;
    });
  }

  function pintarRetro() {
    if (!retroRow) return;
    retroRow.innerHTML = '';
    ['', 'gameboy', 'pico8', 'c64', 'verde', 'ambar', 'bn'].forEach(function (k) {
      const b = document.createElement('button');
      b.className = 'wall-chip' + (k === retroPaleta ? ' on' : '');
      b.type = 'button'; b.textContent = RETRO_NOM[k] || k;
      b.addEventListener('click', function () { aplicarRetro(k); });
      retroRow.appendChild(b);
    });
  }

  async function aplicarRetro(paleta) {
    retroPaleta = paleta;
    pintarRetro();
    try {
      if (!paleta) {                                    // volver a la foto original
        const src = localStorage.getItem('asagi-foto-img');
        if (src) { img.onload = null; img.src = src; }
        return;
      }
      if (!window.AsagiRetro) return;
      const o = await conOriginal(420);
      const d = o.cx.getImageData(0, 0, o.w, o.h);
      window.AsagiRetro.ditherData(d.data, o.w, o.h, paleta);
      o.cx.putImageData(d, 0, 0);
      img.onload = null;
      img.src = o.cv.toDataURL('image/png');
    } catch (e) { /* sin foto cargada */ }
  }

  async function verAscii(on) {
    if (!asciiBox) return;
    if (!on) {
      asciiBox.hidden = true;
      if (asciiOff) asciiOff.hidden = true;
      if (asciiBtn) asciiBtn.hidden = false;
      return;
    }
    try {
      const o = await conOriginal(300);
      const d = o.cx.getImageData(0, 0, o.w, o.h);
      asciiBox.textContent = window.AsagiRetro.asciiDeData(d.data, o.w, o.h, 96);
    } catch (e) {
      asciiBox.textContent = '(elige una foto primero)';
    }
    asciiBox.hidden = false;
    if (asciiOff) asciiOff.hidden = false;
    if (asciiBtn) asciiBtn.hidden = true;
  }

  if (asciiBtn) asciiBtn.addEventListener('click', function () { verAscii(true); });
  if (asciiOff) asciiOff.addEventListener('click', function () { verAscii(false); });
  pintarRetro();

  // --- B) Renderiza la foto EDITADA (encuadre + tono + tinte + viñeta) a un canvas ---
  function renderEditado(TW, TH) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;
    const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH;
    const g = cv.getContext('2d');
    g.fillStyle = '#05070f'; g.fillRect(0, 0, TW, TH);
    const z = cfg.zoom / 100;
    let scale = cfg.ajuste === 'contain' ? Math.min(TW / iw, TH / ih) : Math.max(TW / iw, TH / ih);
    scale *= z;
    const dw = iw * scale, dh = ih * scale;
    const dx = (TW - dw) * (cfg.x / 100), dy = (TH - dh) * (cfg.y / 100);
    const brillo = (cfg.exposicion / 100) * (1 - cfg.dim / 100);
    g.filter = 'brightness(' + brillo.toFixed(2) + ') contrast(' + (cfg.contraste / 100).toFixed(2) +
      ') saturate(' + (cfg.saturacion / 100).toFixed(2) + ') grayscale(' + (cfg.gris || 0) + ') blur(' + cfg.blur + 'px)';
    g.drawImage(img, dx, dy, dw, dh);
    g.filter = 'none';
    // tinte de calidez
    const c = cfg.calidez / 100;
    if (c !== 0) { g.globalCompositeOperation = 'soft-light'; g.fillStyle = c > 0 ? 'rgba(255,152,56,' + (Math.abs(c) * 0.9) + ')' : 'rgba(58,160,255,' + (Math.abs(c) * 0.9) + ')'; g.fillRect(0, 0, TW, TH); g.globalCompositeOperation = 'source-over'; }
    // viñeta
    if (cfg.vineta > 0) { const gr = g.createRadialGradient(TW / 2, TH / 2, Math.min(TW, TH) * 0.3, TW / 2, TH / 2, Math.max(TW, TH) * 0.72); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,' + (cfg.vineta / 100) + ')'); g.fillStyle = gr; g.fillRect(0, 0, TW, TH); }
    return cv;
  }
  const btnExport = document.getElementById('wf-exportar');
  if (btnExport) btnExport.addEventListener('click', () => {
    const cv = renderEditado(1080, 2340); if (!cv) return;
    cv.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'asagi-foto-' + Date.now() + '.jpg'; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }, 'image/jpeg', 0.92);
  });

  // --- B) Crítica con Gemini (visión): ASAGI mira la foto y sugiere, con más matiz ---
  const btnCritica = document.getElementById('wf-critica');
  if (btnCritica) btnCritica.addEventListener('click', async () => {
    const gkEl = document.getElementById('brain-gemini-key');
    const gk = gkEl && gkEl.value ? gkEl.value.trim() : '';
    if (!notas) return;
    notas.hidden = false;
    if (!gk) { notas.innerHTML = '<b>Crítica IA:</b> pon tu key de Gemini en el Asistente para que ASAGI mire la foto.'; return; }
    if (!navigator.onLine) { notas.innerHTML = '<b>Crítica IA:</b> necesitas conexión.'; return; }
    notas.innerHTML = '<b>Crítica IA:</b> analizando la foto…';
    try {
      const data = (localStorage.getItem('asagi-foto-img') || img.src || '');
      const b64 = data.split(',')[1]; const mime = (data.match(/^data:(.*?);/) || [])[1] || 'image/jpeg';
      const prompt = 'Eres un fotógrafo honesto y directo. Mira esta foto y en 3-4 viñetas breves en español di qué está bien y qué mejorarías (exposición, encuadre/composición, color, nitidez). Sin relleno.';
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=' + encodeURIComponent(gk);
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }] }) });
      if (!r.ok) throw new Error('gemini ' + r.status);
      const j = await r.json();
      const cand = j && j.candidates && j.candidates[0];
      const txt = (cand && cand.content && cand.content.parts || []).map((p) => p.text || '').join('') || 'Sin respuesta.';
      notas.innerHTML = '<b>Crítica de ASAGI (visión):</b><br>' + txt.replace(/</g, '&lt;').replace(/\n/g, '<br>');
    } catch (e) { notas.innerHTML = '<b>Crítica IA:</b> no pude analizar (' + (e.message || e) + ').'; }
  });

  // --- B) Mis fondos: guardar varias fotos y alternar ---
  const libRow = document.getElementById('wf-lib');
  const libH = document.getElementById('wf-lib-h');
  const btnGuardarLib = document.getElementById('wf-guardar-lib');
  function leerLib() { try { return JSON.parse(localStorage.getItem('asagi-foto-lib') || '[]'); } catch (e) { return []; } }
  function escribirLib(l) { try { localStorage.setItem('asagi-foto-lib', JSON.stringify(l)); } catch (e) {} }
  function pintarLib() {
    const lib = leerLib(); if (!libRow || !libH) return;
    libH.hidden = lib.length === 0; libRow.innerHTML = '';
    const actual = localStorage.getItem('asagi-foto-img');
    lib.forEach((it) => {
      const wrap = document.createElement('div'); wrap.className = 'wf-thumb' + (it.data === actual ? ' on' : ''); wrap.style.backgroundImage = 'url(' + it.data + ')';
      wrap.addEventListener('click', () => {
        try { localStorage.setItem('asagi-foto-img', it.data); if (it.cfg) localStorage.setItem('asagi-foto-cfg', JSON.stringify(it.cfg)); } catch (e) {}
        cfg = Object.assign({}, DEF, it.cfg || {}); img.src = it.data; syncSliders(); aplicar(); mostrarFoto(true); pintarLib();
      });
      const x = document.createElement('button'); x.className = 'wf-thumb-x'; x.textContent = '×'; x.type = 'button';
      x.addEventListener('click', (e) => { e.stopPropagation(); escribirLib(leerLib().filter((z) => z.id !== it.id)); pintarLib(); });
      wrap.appendChild(x); libRow.appendChild(wrap);
    });
  }
  if (btnGuardarLib) btnGuardarLib.addEventListener('click', () => {
    const data = localStorage.getItem('asagi-foto-img'); if (!data) return;
    let lib = leerLib();
    if (lib.some((z) => z.data === data)) { lib = lib.map((z) => z.data === data ? { id: z.id, data: data, cfg: Object.assign({}, cfg) } : z); }
    else { lib.push({ id: Date.now(), data: data, cfg: Object.assign({}, cfg) }); }
    while (lib.length > 4) lib.shift();              // tope para no llenar el storage
    escribirLib(lib); pintarLib();
  });
  pintarLib();

  // Cargar foto guardada al arrancar.
  try {
    const data = localStorage.getItem('asagi-foto-img');
    if (data) {
      const c = localStorage.getItem('asagi-foto-cfg'); if (c) cfg = Object.assign({}, DEF, JSON.parse(c));
      img.src = data; syncSliders(); aplicar(); mostrarFoto(true);
    }
  } catch (e) {}
})();

// Chips de estado del Launcher: red, batería y última defensa.
(function () {
  const cont = document.getElementById('launcher-chips');
  if (!cont) return;
  function chip(txt, cls) { return '<span class="lchip ' + (cls || '') + '">' + txt + '</span>'; }
  function ultDefensa() {
    try {
      if (!window.AsagiMemoria || !window._asagiMem) return '';
      const hs = window._asagiMem.buscar ? window._asagiMem.buscar('defensa', 3) : [];
      return (hs && hs.length) ? '🛡 auditado' : '';
    } catch (e) { return ''; }
  }
  // Clima (at-a-glance, estilo Niagara/Lawnchair): open-meteo, sin API key.
  // Geolocalización opcional: si se niega o falla, el chip simplemente no aparece.
  let clima = '';
  const ICONO = (c) => c === 0 ? '☀' : c < 4 ? '⛅' : c < 50 ? '☁' : c < 70 ? '🌧' : c < 80 ? '❄' : '⛈';
  function cargarClima() {
    try {
      if (!navigator.geolocation || !navigator.onLine) return;
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + latitude.toFixed(2) +
            '&longitude=' + longitude.toFixed(2) + '&current=temperature_2m,weather_code';
          const r = await fetch(u); const j = await r.json();
          if (j && j.current) { clima = ICONO(j.current.weather_code) + ' ' + Math.round(j.current.temperature_2m) + '°'; pintar(); }
        } catch (e) {}
      }, () => {}, { timeout: 8000, maximumAge: 1800000 });
    } catch (e) {}
  }
  async function pintar() {
    let html = '';
    html += chip(navigator.onLine ? '● en línea' : '○ sin red', navigator.onLine ? 'ok' : 'warn');
    try {
      if (navigator.getBattery) {
        const b = await navigator.getBattery();
        const pct = Math.round(b.level * 100);
        html += chip((b.charging ? '⚡' : '') + pct + '%', pct <= 20 ? 'warn' : 'ok');
      }
    } catch (e) {}
    if (clima) html += chip(clima);
    const d = ultDefensa(); if (d) html += chip(d, 'ok');
    cont.innerHTML = html;
  }
  pintar(); cargarClima(); setInterval(pintar, 30000); setInterval(cargarClima, 1800000);
  window.addEventListener('online', pintar); window.addEventListener('offline', pintar);
})();

// Defensa: escanea apps (permisos + origen) y marca las riesgosas. Honesto, defensivo.
(function () {
  function C() { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiControl) || null; }
  const btn = document.getElementById('def-scan');
  const out = document.getElementById('def-resultado');
  if (!btn || !out) return;
  const COLOR = { alto: '#f87171', medio: '#fbbf24', bajo: '#34d399' };
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
  btn.addEventListener('click', async () => {
    const c = C();
    if (!c || !c.appAudit) { out.innerHTML = '<div class="launcher-empty">Necesita la app nativa (APK).</div>'; return; }
    if (!window.AsagiDefensa) return;
    out.innerHTML = '<div class="launcher-empty">Escaneando tus apps…</div>';
    try {
      const r = await c.appAudit();
      const an = window.AsagiDefensa.analizar((r && r.apps) || []);
      // C) guardar el reporte en memoria -> el puente lo sincroniza con ARIA
      try {
        if (window.AsagiMemoria) {
          if (!window._asagiMem) window._asagiMem = new window.AsagiMemoria.Memoria(window.localStorage);
          const top = an.riesgosas.slice(0, 5).map((a) => a.label + '(' + a.nivel + ')').join(', ');
          window._asagiMem.aprender('Defensa ' + new Date().toISOString().slice(0, 10) + ': ' +
            an.resumen.alto + ' alto, ' + an.resumen.medio + ' medio' + (top ? ' — ' + top : ''), 'defensa', 'defensa');
        }
      } catch (e) {}
      let html = '<div class="def-sum">' + an.resumen.total + ' apps · <b style="color:' + COLOR.alto + '">' +
        an.resumen.alto + ' alto</b> · <b style="color:' + COLOR.medio + '">' + an.resumen.medio + ' medio</b></div>';
      if (!an.riesgosas.length) html += '<div class="launcher-empty">Sin apps riesgosas. 👍</div>';
      else for (const a of an.riesgosas.slice(0, 20)) {
        html += '<div class="def-card" style="border-color:' + COLOR[a.nivel] + '44">' +
          '<div class="def-top"><span>' + esc(a.label) + '</span><span style="color:' + COLOR[a.nivel] + '">' + a.nivel.toUpperCase() + '</span></div>' +
          '<div class="def-why">' + a.razones.map(esc).join(' · ') + '</div></div>';
      }
      out.innerHTML = html;
    } catch (e) { out.innerHTML = '<div class="launcher-empty">No pude escanear.</div>'; }
  });
})();

// Monitor de servicios (idea de Uptime Kuma, sin servidor): vigila si tus sitios
// responden, con latencia, historial y % de disponibilidad. Chequeo por fetch no-cors.
(function () {
  if (!window.AsagiMonitor) return;
  const M = window.AsagiMonitor;
  const inUrl = document.getElementById('mon-url');
  const btnAdd = document.getElementById('mon-add-btn');
  const lista = document.getElementById('mon-lista');
  const stats = document.getElementById('mon-stats');
  if (!lista) return;
  let targets = [];
  try { targets = JSON.parse(localStorage.getItem('asagi-monitor') || '[]'); } catch (e) { targets = []; }

  function guardar() { try { localStorage.setItem('asagi-monitor', JSON.stringify(targets)); } catch (e) {} }

  // Chequeo real: fetch no-cors con timeout. Resuelve = alcanzable; error/timeout = caído.
  function chequear(url, ms) {
    return new Promise((resolve) => {
      const t0 = (performance && performance.now) ? performance.now() : Date.now();
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const to = setTimeout(() => { if (ctl) ctl.abort(); resolve({ ok: false, ms: null }); }, ms || 8000);
      fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
        .then(() => { clearTimeout(to); const t1 = (performance && performance.now) ? performance.now() : Date.now(); resolve({ ok: true, ms: t1 - t0 }); })
        .catch(() => { clearTimeout(to); resolve({ ok: false, ms: null }); });
    });
  }

  function spark(hist) {
    const h = (hist || []).slice(-20);
    if (!h.length) return '';
    const max = Math.max.apply(null, h.map((x) => x.ms || 0).concat([1]));
    return '<div class="mon-spark">' + h.map((x) => {
      const alt = x.ok ? Math.max(4, Math.round((x.ms || 0) / max * 22)) : 22;
      return '<i class="' + (x.ok ? '' : 'd') + '" style="height:' + alt + 'px"></i>';
    }).join('') + '</div>';
  }

  function pintar() {
    lista.innerHTML = '';
    if (!targets.length) { lista.innerHTML = '<div class="launcher-empty">Agrega un sitio para vigilarlo.</div>'; }
    targets.forEach((t) => {
      const up = M.uptime(t), lat = t.latencia;
      const card = document.createElement('div'); card.className = 'mon-card';
      card.innerHTML = '<span class="mon-dot ' + t.estado + '"></span>' +
        '<div class="mon-info"><div class="mon-nombre">' + t.nombre.replace(/</g, '&lt;') + '</div>' +
        '<div class="mon-sub">' + (t.estado === 'up' ? (lat != null ? lat + ' ms' : 'en línea') : t.estado === 'down' ? 'sin respuesta' : '—') +
        (up != null ? ' · ' + up + '% activo' : '') + '</div></div>' + spark(t.historia) +
        '<button class="mon-x" aria-label="Quitar">×</button>';
      card.querySelector('.mon-x').addEventListener('click', () => { targets = targets.filter((x) => x.id !== t.id); guardar(); pintar(); });
      lista.appendChild(card);
    });
    if (stats) {
      const r = M.resumen(targets);
      stats.innerHTML = targets.length ? '<span class="lchip ok">' + r.up + ' arriba</span>' +
        (r.down ? '<span class="lchip warn">' + r.down + ' caídos</span>' : '') +
        '<span class="lchip">' + r.total + ' total</span>' : '';
    }
  }

  async function revisar(t) {
    const res = await chequear(t.url);
    const i = targets.findIndex((x) => x.id === t.id);
    if (i === -1) return;
    targets[i] = M.registrarChequeo(targets[i], res);
    guardar(); pintar();
  }
  function revisarTodos() { targets.forEach(revisar); }

  function agregar() {
    const v = inUrl ? inUrl.value.trim() : ''; if (!v) return;
    const t = M.nuevoTarget('', v);
    targets.push(t); if (inUrl) inUrl.value = ''; guardar(); pintar(); revisar(t);
  }
  if (btnAdd) btnAdd.addEventListener('click', agregar);
  if (inUrl) inUrl.addEventListener('keydown', (e) => { if (e.key === 'Enter') agregar(); });

  pintar();
  // revisa al abrir Status y cada 60s mientras esté abierto
  const statusPanel = document.getElementById('status');
  function visible() { return statusPanel && statusPanel.classList.contains('open'); }
  setInterval(() => { if (visible()) revisarTodos(); }, 60000);
  const obs = new MutationObserver(() => { if (visible()) revisarTodos(); });
  if (statusPanel) obs.observe(statusPanel, { attributes: true, attributeFilter: ['class'] });
  window._asagiMonitorRevisar = revisarTodos;
})();

// Análisis de dominio (recon pasivo, OSINT defensivo): consulta DNS por DNS-over-HTTPS
// y muestra a qué resuelve un dominio. Solo información pública, nada ofensivo.
(function () {
  if (!window.AsagiRecon) return;
  const R = window.AsagiRecon;
  const inp = document.getElementById('recon-dom');
  const btn = document.getElementById('recon-btn');
  const out = document.getElementById('recon-out');
  if (!inp || !btn || !out) return;
  const ORDEN = ['A', 'AAAA', 'MX', 'NS', 'TXT'];

  async function consultar(dom, tipo) {
    try {
      const r = await fetch(R.urlDoH(dom, tipo), { headers: { accept: 'application/dns-json' } });
      if (!r.ok) return { ok: false, registros: [], nombre: tipo };
      return R.interpretar(await r.json(), tipo);
    } catch (e) { return { ok: false, registros: [], nombre: tipo, error: true }; }
  }

  async function analizar() {
    const dom = R.normalizarDominio(inp.value);
    if (!dom || !R.valido(dom)) { out.innerHTML = '<div class="recon-msg">Escribe un dominio válido, ej. github.com</div>'; return; }
    out.innerHTML = '<div class="recon-msg">Consultando ' + dom.replace(/</g, '&lt;') + '…</div>';
    const res = await Promise.all(ORDEN.map((t) => consultar(dom, t)));
    let html = '';
    res.forEach((r) => {
      html += '<div class="recon-grupo"><div class="recon-h">' + (R.ETIQUETA[r.nombre] || r.nombre) + '</div>';
      if (r.registros && r.registros.length) {
        html += r.registros.map((v) => '<div class="recon-val">' + v.replace(/</g, '&lt;') + '</div>').join('');
      } else {
        html += '<div class="recon-val vacio">' + (r.error ? 'sin conexión' : '—') + '</div>';
      }
      html += '</div>';
    });
    out.innerHTML = html;
  }
  btn.addEventListener('click', analizar);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') analizar(); });
})();

// Gestos del núcleo: en la casa, deslizar ARRIBA = Asistente, ABAJO = Status.
// Con un overlay abierto, deslizar en sentido de cierre = volver a la casa.
(function () {
  if (!window.AsagiGestos) return;
  const home = document.getElementById('launcher');
  function hayOverlay() { return document.querySelector('.panel.overlay.open'); }
  // gestos en la casa (no en la barra de búsqueda, para no estorbar al escribir)
  if (home) window.AsagiGestos.crear(home, function (dir) {
    if (hayOverlay()) return;
    if (dir === 'arriba') setActiveSection('assistant');
    else if (dir === 'abajo') setActiveSection('status');
  }, { umbral: 70 });
  // cerrar overlays con el gesto natural (asistente/grok: abajo; status: arriba)
  document.querySelectorAll('.panel.overlay').forEach(function (ov) {
    const cerrarDir = ov.classList.contains('from-top') ? 'arriba' : 'abajo';
    window.AsagiGestos.crear(ov, function (dir) {
      if (ov.classList.contains('open') && dir === cerrarDir) setActiveSection('launcher');
    }, { umbral: 80 });
  });
})();

// --- Modo CRT global (scanlines + glow + viñeta). Idea de ascii-magic.com ---
(function initCrt() {
  const ov = document.getElementById('crt-overlay');
  const box = document.getElementById('crt-toggle');
  if (!ov) return;
  function poner(on) {
    ov.classList.toggle('on', !!on);
    try { localStorage.setItem('asagi-crt', on ? '1' : '0'); } catch (e) {}
    if (box) box.checked = !!on;
  }
  let on = false;
  try { on = localStorage.getItem('asagi-crt') === '1'; } catch (e) {}
  poner(on);
  if (box) box.addEventListener('change', function () { poner(box.checked); });
})();

// --- Enlace con ARIA: conexion propia, cifrada, sin cable ni mismo Wi-Fi ---
(function initEnlace() {
  const E = window.AsagiEnlace;
  const $ = (id) => document.getElementById(id);
  const off = $('enl-off'), on = $('enl-on'), info = $('enl-info'), estado = $('enl-estado');
  const lista = $('enl-lista'), verCod = $('enl-codigo-ver');
  if (!E || !off || !on) return;
  const K_CFG = 'asagi-enlace-cfg', K_EST = 'asagi-enlace-estado';
  const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  if (!E.disponible()) { if (info) info.textContent = 'Este WebView no trae cifrado (WebCrypto): el enlace no puede usarse aquí.'; return; }

  const cli = E.crearCliente({
    cfg: () => leer(K_CFG, {}), guardarCfg: (c) => escribir(K_CFG, c),
    leerEstado: () => leer(K_EST, {}), guardarEstado: (e) => escribir(K_EST, e),
  });
  let ultimo = null;                       // ultimo resultado de sincronizar

  function decir(t) { if (info) info.textContent = t || ''; }

  function pintar() {
    const v = cli.vinculado();
    off.hidden = v; on.hidden = !v;
    if (!v) return;
    if (estado) {
      let clase = '', txt = 'conectando…';
      if (ultimo && ultimo.ok) {
        const reciente = ultimo.vistoOtro && (ultimo.ahora - ultimo.vistoOtro) < 20 * 60 * 1000;
        clase = reciente ? 'vivo' : '';
        txt = 'Enlace activo · ARIA ' + E.hace(ultimo.vistoOtro, ultimo.ahora) +
              (ultimo.enCola ? ' · ' + ultimo.enCola + ' en cola' : '');
      } else if (ultimo) { clase = 'mal'; txt = ultimo.texto || 'sin conexión'; }
      estado.innerHTML = '';
      const p = document.createElement('span'); p.className = 'punto ' + clase;
      estado.appendChild(p); estado.appendChild(document.createTextNode(txt));
    }
    if (lista) {
      lista.innerHTML = '';
      const rec = cli.recibidos().slice(-5).reverse();
      for (const r of rec) {
        const d = document.createElement('div'); d.className = 'enl-item';
        const m = document.createElement('span'); m.className = 'enl-meta';
        m.textContent = 'ARIA · ' + (r.tipo === 'pendiente' ? 'pendiente' : 'nota') + ' · ' + E.hace(r.ts, Date.now());
        d.appendChild(m); d.appendChild(document.createTextNode(r.cuerpo));
        lista.appendChild(d);
      }
    }
  }

  // Lo que llega de ARIA: los pendientes entran a tu lista (con su hora y su
  // notificacion); las notas se avisan en pantalla y, solo con audifonos, en voz.
  function procesar(nuevos) {
    for (const n of nuevos || []) {
      if (n.tipo === 'pendiente') {
        const limpio = window._asagiAddPendiente ? window._asagiAddPendiente(n.cuerpo) : n.cuerpo;
        if (window._asagiAviso) window._asagiAviso('ARIA te dejó un pendiente: ' + (limpio || n.cuerpo), false, '📡');
      } else {
        if (window._asagiAviso) window._asagiAviso('ARIA: ' + n.cuerpo, false, '📡');
        try { if (window.asagiSpeakPrivado) window.asagiSpeakPrivado('ARIA dice: ' + n.cuerpo); } catch (e) {}
      }
    }
  }

  async function sincronizar() {
    if (!cli.vinculado()) return null;
    ultimo = await cli.sincronizar();
    if (ultimo && ultimo.nuevos) procesar(ultimo.nuevos);
    pintar();
    return ultimo;
  }

  async function enviar(tipo, texto) {
    const r = await cli.enviar(tipo, texto);
    if (r.nuevos) procesar(r.nuevos);
    if (r.ok) ultimo = { ok: true, vistoOtro: r.vistoOtro, ahora: r.ahora, enCola: 0 };
    pintar();
    return r;
  }

  // Desde el chat: "dile a ARIA que ..."
  window._asagiEnlaceEnviar = async function (texto) {
    if (!cli.vinculado()) {
      appendMessage('bot', 'Aún no estoy enlazada con ARIA. Ábrelo en Estado → Enlace con ARIA.');
      return;
    }
    const r = await enviar('nota', texto);
    appendMessage('bot', r.ok ? '📡 Enviado a ARIA: ' + texto : '📡 ' + r.texto);
  };

  const token = $('enl-token'), codigo = $('enl-codigo'), msg = $('enl-msg');
  const bCrear = $('enl-crear'), bUnir = $('enl-unir'), bEnviar = $('enl-enviar');
  const bCopiar = $('enl-copiar'), bQuitar = $('enl-quitar');

  if (bCrear) bCrear.addEventListener('click', async () => {
    decir('Creando el buzón…');
    const r = await cli.crear(token && token.value);
    if (!r.ok) { decir(r.texto); return; }
    if (token) token.value = '';
    decir('Enlace creado. Toca "Ver código para ARIA" y pégalo en la PC.');
    pintar(); sincronizar();
  });
  if (bUnir) bUnir.addEventListener('click', async () => {
    decir('Buscando el buzón…');
    const r = await cli.vincular(token && token.value, codigo && codigo.value);
    decir(r.texto);
    if (!r.ok) return;
    if (token) token.value = ''; if (codigo) codigo.value = '';
    pintar(); sincronizar();
  });
  async function mandarNota() {
    const t = (msg && msg.value || '').trim(); if (!t) return;
    msg.value = '';
    const r = await enviar('nota', t);
    decir(r.ok ? 'Nota enviada a ARIA.' : r.texto);
  }
  if (bEnviar) bEnviar.addEventListener('click', mandarNota);
  if (msg) msg.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); mandarNota(); } });
  if (bCopiar) bCopiar.addEventListener('click', async () => {
    const c = leer(K_CFG, {});
    if (!c.gist || !verCod) return;
    if (!verCod.hidden) { verCod.hidden = true; verCod.textContent = ''; return; }
    const cod = E.hacerCodigo(c.gist, c.clave);
    verCod.textContent = cod; verCod.hidden = false;
    try { await navigator.clipboard.writeText(cod); decir('Código copiado. En la PC: python enlace.py vincular CÓDIGO'); }
    catch (e) { decir('Mantén pulsado el código para copiarlo. En la PC: python enlace.py vincular CÓDIGO'); }
  });
  let armado = 0;
  if (bQuitar) bQuitar.addEventListener('click', () => {
    if (Date.now() - armado > 4000) {
      armado = Date.now(); bQuitar.textContent = '¿Seguro? Toca otra vez';
      setTimeout(() => { if (armado && Date.now() - armado >= 4000) { armado = 0; bQuitar.textContent = 'Desvincular'; } }, 4100);
      return;
    }
    try { localStorage.removeItem(K_CFG); localStorage.removeItem(K_EST); } catch (e) {}
    armado = 0; bQuitar.textContent = 'Desvincular'; ultimo = null;
    if (verCod) { verCod.hidden = true; verCod.textContent = ''; }
    decir('Enlace quitado de este celular.'); pintar();
  });

  pintar();
  // Sondeo: solo con la app a la vista (no gasta bateria ni datos en segundo plano).
  setTimeout(sincronizar, 2500);
  setInterval(() => { if (!document.hidden) sincronizar(); }, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
  window._asagiEnlace = { cli, sincronizar, enviar };      // para pruebas
})();

// --- Keys y ajustes del cerebro: se guardan SOLOS al escribir (sin "Aplicar") ---
(function autoGuardarCerebro() {
  const IDS = ['brain-url', 'brain-model', 'brain-key', 'brain-gemini-key', 'brain-atria-key', 'brain-mistral-key'];
  const CAMPOS = ['remoteUrl', 'remoteModel', 'remoteKey', 'geminiKey', 'atriaKey', 'mistralKey'];
  const K2 = 'asagi-keys-v1';            // copia aparte: si el estado principal se pierde, esta rescata
  let sucio = false, t = null;
  function guardar() {
    try {
      const c = readBrainControls();
      CAMPOS.forEach((k) => { state.brain[k] = c[k] || ''; });
      saveState();
      const copia = {}; CAMPOS.forEach((k) => { copia[k] = state.brain[k]; });
      localStorage.setItem(K2, JSON.stringify(copia));
      sucio = false;
    } catch (e) {}
    try { refreshBrainStatus(); } catch (e) {}
  }
  // Rescate: estado vacio pero la copia tiene keys.
  try {
    const b = JSON.parse(localStorage.getItem(K2) || '{}');
    let cambio = false;
    CAMPOS.forEach((k) => { if (!state.brain[k] && typeof b[k] === 'string' && b[k]) { state.brain[k] = b[k]; cambio = true; } });
    if (cambio) { saveState(); applyBrainControlsFromState(); try { refreshBrainStatus(); } catch (e) {} }
  } catch (e) {}
  IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => { sucio = true; clearTimeout(t); t = setTimeout(guardar, 400); });
    el.addEventListener('change', guardar);
    el.addEventListener('blur', () => { if (sucio) guardar(); });
    el.addEventListener('paste', () => { sucio = true; setTimeout(guardar, 50); });
  });
  window.addEventListener('pagehide', () => { if (sucio) guardar(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && sucio) guardar(); });
})();

// --- Modelo local: se descarga SOLO (Wi-Fi), con progreso y reintentos ---
(function descargaAutomatica() {
  const cap = window.Capacitor;
  const plugin = cap && cap.Plugins ? cap.Plugins.AsagiBrain : null;
  if (!plugin || typeof plugin.descargarModelo !== 'function') return;
  const refrescar = () => { try { refreshBrainStatus(); } catch (e) {} };
  let avisado = false;
  plugin.addListener('descarga', (ev) => {
    if (!ev) return;
    window._asagiModelo = { estado: ev.estado, bytes: ev.bytes || 0, total: ev.total || 0, error: ev.error || '' };
    refrescar();
    if (ev.estado === 'listo') cargarMotor();
    if (ev.estado === 'listo' && !avisado) {
      avisado = true;
      if (window._asagiAviso) window._asagiAviso('Modelo local descargado: ASAGI ya funciona sin internet', false, '🧠');
    }
  });
  let cargado = false;
  function cargarMotor() {            // precarga el motor para que el primer mensaje no espere
    if (cargado || typeof plugin.load !== 'function') return;
    cargado = true;
    Promise.resolve(plugin.load()).then(refrescar).catch(() => { cargado = false; });
  }
  function celular() {
    try { const c = navigator.connection; return !!(c && (c.type === 'cellular' || c.saveData)); } catch (e) { return false; }
  }
  async function revisar() {
    try {
      const e = await plugin.estadoModelo();
      if (e.listo) {
        window._asagiModelo = { estado: 'listo', bytes: e.total, total: e.total, error: '' };
        cargarMotor(); refrescar(); return;
      }
      if (e.descargando) return;
      if (celular()) {            // no gasta tus datos moviles sin que lo pidas
        window._asagiModelo = { estado: 'espera', bytes: e.parcial, total: e.total, error: '' };
        refrescar();
        return;
      }
      await plugin.descargarModelo();
    } catch (err) {}
  }
  window._asagiDescargarModelo = () => plugin.descargarModelo().catch(() => {});
  setTimeout(revisar, 3000);
  window.addEventListener('online', () => setTimeout(revisar, 1500));
  setInterval(() => { if (!document.hidden) revisar(); }, 120000);   // si fallo, reintenta solo
})();

// --- Herramientas (permisos) y Discord ---
(function initHerramientasYDiscord() {
  const $ = (id) => document.getElementById(id);
  const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // permisos + copiar linea de Termux
  const bPerm = $('herr-permisos'), bCop = $('herr-copiar'), inSetup = $('herr-setup');
  if (bPerm) bPerm.addEventListener('click', () => {
    const p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiControl;
    if (p && p.pedirPermisosRadios) p.pedirPermisosRadios().catch(() => {});
    else appendMessage('bot', 'Los permisos solo se piden dentro de la app instalada.');
  });
  if (bCop && inSetup) bCop.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(inSetup.value); bCop.textContent = 'Copiado ✓'; }
    catch (e) { inSetup.select(); try { document.execCommand('copy'); bCop.textContent = 'Copiado ✓'; } catch (e2) {} }
    setTimeout(() => { bCop.textContent = 'Copiar'; }, 1800);
  });

  // Primer arranque: pide TODOS los permisos de golpe, sin que haya que tocar nada en ASAGI.
  try {
    if (!localStorage.getItem('asagi-permisos-v1')) {
      setTimeout(() => {
        const p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiControl;
        if (p && p.pedirPermisosRadios) {
          p.pedirPermisosRadios().then(() => { try { localStorage.setItem('asagi-permisos-v1', '1'); } catch (e) {} }).catch(() => {});
        }
      }, 9000);
    }
  } catch (e) {}

  // Respuesta de texto SIN tocar el chat (para Discord): mismo router que el asistente.
  window._asagiResponderTexto = async function (prompt) {
    const R = window.AsagiBrainRouter;
    if (!R) return '';
    const b = state.brain;
    const brain = getBrainBridge();
    const gk = (b.geminiKey || '').trim(), ak = (b.atriaKey || '').trim(), mk = (b.mistralKey || '').trim();
    const router = new R.BrainRouter({
      localFn: async (p) => {
        if (brain && brain.raw && typeof brain.raw.streamReply === 'function' && (brain.loaded || brain.canLazyLoad)) {
          return await new Promise((resolve, reject) => {
            brain.raw.streamReply(p, { onToken: () => {}, onDone: (t) => resolve(t || ''), onError: (m) => reject(new Error(m)) });
          });
        }
        return '';
      },
      geminiFn: gk ? ((p) => R.geminiResponder(p, gk)) : null,
      remotoFn: mk ? ((p) => R.mistralResponder(p, mk)) : (ak ? ((p) => R.atriaResponder(p, ak)) : null),
      testFn: null, apiKey: gk, store: window.localStorage
    });
    const res = await router.responder(prompt);
    return res && res.backend !== 'ninguno' ? (res.texto || '') : '';
  };

  // Discord
  const D = window.AsagiDiscord;
  const inTok = $('dc-token'), inCan = $('dc-canal'), inPer = $('dc-permitidos'), bProbar = $('dc-probar'), estado = $('dc-estado');
  if (!D || !inTok || !inCan) return;
  const K_CFG = 'asagi-discord-cfg', K_EST = 'asagi-discord-estado';
  const cfg = () => leer(K_CFG, {});
  function decir(t) { if (estado) estado.textContent = t || ''; }
  { const c = cfg(); inTok.value = c.token || ''; inCan.value = c.canal || ''; if (inPer) inPer.value = (c.permitidos || []).join(','); }
  let tG = null;
  function guardar() {
    const c = {
      token: inTok.value.trim(), canal: inCan.value.replace(/\D/g, ''),
      permitidos: inPer ? inPer.value.split(',').map((x) => x.replace(/\D/g, '')).filter(Boolean) : []
    };
    const antes = cfg();
    escribir(K_CFG, c);
    if (antes.token !== c.token || antes.canal !== c.canal) escribir(K_EST, {});   // otro canal/bot: empieza limpio
  }
  [inTok, inCan, inPer].forEach((el) => {
    if (!el) return;
    el.addEventListener('input', () => { clearTimeout(tG); tG = setTimeout(guardar, 400); });
    el.addEventListener('change', guardar);
    el.addEventListener('blur', guardar);
  });
  window.addEventListener('pagehide', guardar);

  const cli = D.crearCliente({
    cfg, guardarCfg: (c) => escribir(K_CFG, c), estado: () => leer(K_EST, {}), guardarEstado: (e) => escribir(K_EST, e)
  });
  if (bProbar) bProbar.addEventListener('click', async () => {
    guardar(); decir('Probando…');
    const r = await cli.verificar();
    decir(r.texto);
    if (r.ok) setTimeout(ciclo, 500);
  });

  let ocupado = false, esperaHasta = 0;
  async function ciclo() {
    if (ocupado || document.hidden || !cli.listo() || Date.now() < esperaHasta) return;
    ocupado = true;
    try {
      const r = await cli.sincronizar((txt) => window._asagiResponderTexto(txt));
      if (r.ok) { if (r.respondidos) decir('Discord: respondí ' + r.respondidos + ' mensaje(s).'); else if (estado && !estado.textContent) decir('Discord conectado.'); }
      else { decir(r.texto || 'Discord sin conexión.'); if (r.espera) esperaHasta = Date.now() + r.espera; }
    } catch (e) {} finally { ocupado = false; }
  }
  setTimeout(ciclo, 4000);
  setInterval(ciclo, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ciclo(); });
  window._asagiDiscord = { cli, ciclo };
})();
