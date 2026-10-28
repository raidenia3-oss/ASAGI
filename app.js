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
    remoteKey: ''
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
        remoteKey: (parsed.brain && typeof parsed.brain.remoteKey === 'string') ? parsed.brain.remoteKey : defaultState.brain.remoteKey
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
  saveState();
  renderBrainControls();
  refreshBrainStatus();
}

function readBrainControls() {
  return {
    mode: state.brain.mode,
    remoteUrl: brainUrl ? brainUrl.value.trim() : state.brain.remoteUrl,
    remoteModel: brainModel ? brainModel.value.trim() : state.brain.remoteModel,
    remoteKey: brainKey ? brainKey.value.trim() : state.brain.remoteKey
  };
}

function applyBrainControlsFromState() {
  if (brainModeLocal) brainModeLocal.checked = state.brain.mode === 'local';
  if (brainModeRemote) brainModeRemote.checked = state.brain.mode === 'remote';
  if (brainUrl) brainUrl.value = state.brain.remoteUrl;
  if (brainModel) brainModel.value = state.brain.remoteModel;
  if (brainKey) brainKey.value = state.brain.remoteKey;
  if (brainUrl) brainUrl.disabled = state.brain.mode !== 'remote';
  if (brainModel) brainModel.disabled = state.brain.mode !== 'remote';
  if (brainKey) brainKey.disabled = state.brain.mode !== 'remote';
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
    canStream: typeof raw.streamReply === 'function'
  };
}

function describeBrain() {
  const b = state.brain;
  const brain = getBrainBridge();

  if (b.mode === 'local') {
    if (brain && brain.stub) {
      return {
        detail: 'Local · motor nativo no activo en esta versión',
        alert: 'El modelo local todavía no está activo en esta versión (motor nativo deshabilitado). ASAGI responde con las respuestas de prueba.'
      };
    }
    if (brain && brain.loaded) {
      return { detail: 'Local · modelo listo', alert: '' };
    }
    if (brain && brain.error) {
      return {
        detail: 'Local · ' + brain.error,
        alert: 'El modelo local no pudo cargarse: ' + brain.error + '. ASAGI responde con las respuestas de prueba.'
      };
    }
    return {
      detail: 'Local · modelo no descargado',
      alert: 'El modelo local aún no está descargado (unos 400 MB). ASAGI responde con las respuestas de prueba mientras tanto.'
    };
  }

  if (!b.remoteUrl) {
    return {
      detail: 'Remoto · URL no configurada',
      alert: 'El cerebro remoto no tiene URL configurada. ASAGI responde con las respuestas de prueba mientras tanto.'
    };
  }

  return {
    detail: 'Remoto · URL: ' + (b.remoteUrl.length > 48 ? b.remoteUrl.slice(0, 48) + '…' : b.remoteUrl),
    alert: ''
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
}

async function startBotStreaming(userText) {
  const b = readBrainControls();
  const brain = getBrainBridge();

  try {
    // Modo local con motor nativo realmente cargado.
    if (b.mode === 'local' && brain && brain.loaded && brain.canStream) {
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
      { role: 'system', content: 'Eres ASAGI, asistente personal en español. Responde de forma breve, clara y útil.' },
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
