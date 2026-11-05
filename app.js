const STORAGE_KEY = 'asagi-state-v2';

// Identificador estable aunque crypto.randomUUID no exista (contexto no seguro).
function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

const defaultState = {
  activeSection: 'assistant',
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
    atriaKey: ''
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
        atriaKey: (parsed.brain && typeof parsed.brain.atriaKey === 'string') ? parsed.brain.atriaKey : defaultState.brain.atriaKey
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

function setActiveSection(sectionName) {
  state.activeSection = sectionName;
  navItems.forEach((button) => {
    const isActive = button.dataset.section === sectionName;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  panels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === sectionName);
  });

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
    atriaKey: brainAtriaKey ? brainAtriaKey.value.trim() : (state.brain.atriaKey || '')
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
  if (brainUrl) brainUrl.disabled = state.brain.mode !== 'remote';
  if (brainModel) brainModel.disabled = state.brain.mode !== 'remote';
  if (brainKey) brainKey.disabled = state.brain.mode !== 'remote';
  if (brainGeminiKey) brainGeminiKey.disabled = false;
  if (brainAtriaKey) brainAtriaKey.disabled = false;
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

  if (b.mode === 'local') {
    if (brain && brain.loaded) {
      return { detail: 'Local · modelo listo', alert: '' };
    }
    // sin modelo local pero con key -> el router usa la nube, sin alarma
    if (gk || ak) {
      return { detail: 'Local sin modelo · usando ' + (ak ? 'Atria' : 'Gemini'), alert: '' };
    }
    return {
      detail: 'Local · modelo no descargado',
      alert: 'El modelo local aún no está descargado (~400 MB). Pon tu key de Gemini/Atria para responder sin descargarlo, o descarga el modelo.'
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

async function startBotStreaming(userText) {
  const b = readBrainControls();
  state.brain.geminiKey = b.geminiKey || '';
  state.brain.atriaKey = b.atriaKey || '';
  saveState();
  const brain = getBrainBridge();

  try {
    // Usar router si disponible
    if (typeof window !== 'undefined' && window.AsagiBrainRouter && typeof window.AsagiBrainRouter.BrainRouter === 'function') {
      const { BrainRouter, atriaResponder, geminiResponder } = window.AsagiBrainRouter;
      const gk = (state.brain.geminiKey || b.geminiKey || '').trim();
      const ak = (state.brain.atriaKey || b.atriaKey || '').trim();
      const router = new BrainRouter({
        // localFn SIEMPRE devuelve un string (texto).
        localFn: async (p) => {
          // motor nativo si de verdad está cargado
          if (brain && brain.raw && typeof brain.raw.streamReply === 'function' && (brain.loaded || brain.canLazyLoad)) {
            return await new Promise((resolve, reject) => {
              brain.raw.streamReply(p, {
                onToken: () => {},
                onDone: (text) => resolve(text || ''),
                onError: (msg) => reject(new Error(msg))
              });
            });
          }
          // sin modelo local: usa Gemini si hay key; si no, respuesta de prueba
          if (gk && typeof geminiResponder === 'function') return await geminiResponder(p, gk);
          return createBotReply(p);
        },
        apiKey: gk,
        remotoFn: (ak && typeof atriaResponder === 'function') ? ((p) => atriaResponder(p, ak)) : null,
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
      { role: 'system', content: (window.AsagiPersona ? window.AsagiPersona.systemPrompt() : 'Eres ASAGI, asistente personal en español. Responde de forma breve, clara y útil.') },
      { role: 'user', content: userText }
    ];

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

  showReplyStatus('generando…');
  Promise.resolve(startBotStreaming(text))
    .catch((error) => {
      const reason = error && error.message ? error.message : String(error);
      appendMessage('bot', 'Algo falló al generar la respuesta (' + reason + '). Te respondo con las respuestas de prueba.');
      appendMessage('bot', createBotReply(text));
    })
    .finally(() => {
      showReplyStatus(null);
    });
});

resetButton.addEventListener('click', () => {
  state.messages = structuredClone(defaultState.messages);
  saveState();
  renderMessages();
});

ensureWelcomeMessage();
setActiveSection(state.activeSection);
renderBrainControls();
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
          return plugin.stream({
            messages: [
              { role: 'system', content: (window.AsagiPersona ? window.AsagiPersona.systemPrompt() : 'Eres ASAGI, asistente personal en español. Responde breve y claro.') },
              { role: 'user', content: userText }
            ]
          });
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
  };

  const elEstado = document.getElementById('voz-estado');
  const elSigilo = document.getElementById('voz-sigilo');
  const elDns = document.getElementById('ads-dns');

  async function pintarEstado() {
    if (!elEstado) return;
    const c = cfg();
    if (!c.enabled) { elEstado.textContent = 'Voz: desactivada (toca "Voz: sigilo" para activar)'; return; }
    const aud = await audifonos();
    elEstado.textContent = 'Voz: ' + (c.sigilo
      ? (aud ? 'sigilo · hablo por audífono ✓' : 'sigilo · sin audífonos, solo texto')
      : 'en voz alta');
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
  function C() { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiControl) || null; }
  let apps = [];
  const grid = document.getElementById('launcher-grid');
  const search = document.getElementById('launcher-search');
  const clockEl = document.getElementById('launcher-clock');
  const dateEl = document.getElementById('launcher-date');

  function tick() {
    if (!window.AsagiLauncher) return;
    const r = window.AsagiLauncher.reloj();
    if (clockEl) clockEl.textContent = r.hora;
    if (dateEl) dateEl.textContent = r.fecha;
  }
  tick(); setInterval(tick, 20000);

  function render(list) {
    if (!grid || !window.AsagiLauncher) return;
    if (!list.length) { grid.innerHTML = '<div class="launcher-empty">Sin apps.</div>'; return; }
    grid.innerHTML = '';
    for (const a of list) {
      const d = document.createElement('div'); d.className = 'launcher-app';
      const ico = document.createElement('div'); ico.className = 'launcher-ico';
      ico.style.background = window.AsagiLauncher.colorTile(a.label);
      ico.textContent = window.AsagiLauncher.inicial(a.label);
      const lbl = document.createElement('div'); lbl.className = 'launcher-lbl'; lbl.textContent = a.label;
      d.appendChild(ico); d.appendChild(lbl);
      d.addEventListener('click', () => { const c = C(); if (c && c.openApp) c.openApp({ package: a.package }); });
      grid.appendChild(d);
    }
  }

  async function cargar() {
    const c = C();
    if (!c || !c.listApps) { if (grid) grid.innerHTML = '<div class="launcher-empty">El Launcher necesita la app nativa (APK).</div>'; return; }
    if (grid) grid.innerHTML = '<div class="launcher-empty">Cargando apps…</div>';
    try {
      const r = await c.listApps();
      apps = (r && r.apps) || [];
      render(window.AsagiLauncher.filtrar(apps, ''));
    } catch (e) {
      if (grid) grid.innerHTML = '<div class="launcher-empty">No pude listar apps.</div>';
    }
  }

  if (search) search.addEventListener('input', () => {
    if (window.AsagiLauncher) render(window.AsagiLauncher.filtrar(apps, search.value));
  });
  document.querySelectorAll('[data-section="launcher"]').forEach((b) =>
    b.addEventListener('click', () => { if (!apps.length) cargar(); }));
  setTimeout(() => { const p = document.getElementById('launcher'); if (p && p.classList.contains('active') && !apps.length) cargar(); }, 500);
})();

// ---------------------------------------------------------------------------
// Grok · bots: despliega bots especializados (bots.js) via el cerebro (router).
// ---------------------------------------------------------------------------
(function () {
  const chips = document.getElementById('grok-bots');
  const salida = document.getElementById('grok-salida');
  const input = document.getElementById('grok-input');
  const go = document.getElementById('grok-go');

  function pintarChips() {
    if (!chips || !window.AsagiBots) return;
    chips.innerHTML = '';
    for (const b of window.AsagiBots.BOTS) {
      const c = document.createElement('span');
      c.className = 'grok-chip'; c.textContent = b.nombre; c.style.borderColor = b.color;
      chips.appendChild(c);
    }
  }
  pintarChips();

  function val(id) { const e = document.getElementById(id); return e && e.value ? e.value.trim() : ''; }

  async function ejecutarBot(prompt) {
    const R = window.AsagiBrainRouter;
    if (!R) return '(cerebro no disponible)';
    const gk = val('brain-gemini-key'); const ak = val('brain-atria-key');
    const router = new R.BrainRouter({
      localFn: async (p) => {
        if (gk && R.geminiResponder) return await R.geminiResponder(p, gk);
        return '(sin cerebro: pon tu key de Gemini en Asistente)';
      },
      apiKey: gk,
      remotoFn: (ak && R.atriaResponder) ? ((p) => R.atriaResponder(p, ak)) : null,
      store: window.localStorage
    });
    const res = await router.responder(prompt);
    return (res && (res.texto || res.text)) || '';
  }

  async function desplegar() {
    if (!window.AsagiBots || !input) return;
    const tarea = input.value.trim(); if (!tarea) return;
    input.value = '';
    if (salida) salida.innerHTML = '<div class="launcher-empty">Desplegando bots…</div>';
    const res = await window.AsagiBots.desplegar(tarea, ejecutarBot, { max: 2 });
    if (!salida) return;
    salida.innerHTML = '';
    for (const r of res) {
      const card = document.createElement('div'); card.className = 'grok-card';
      const h = document.createElement('h4'); h.textContent = r.bot.nombre; h.style.color = r.bot.color;
      const p = document.createElement('p'); p.textContent = r.texto;
      card.appendChild(h); card.appendChild(p); salida.appendChild(card);
    }
  }
  if (go) go.addEventListener('click', desplegar);
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') desplegar(); });
})();
