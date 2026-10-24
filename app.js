const STORAGE_KEY = 'asagi-state-v1';

const defaultState = {
  activeSection: 'assistant',
  messages: [
    {
      id: crypto.randomUUID(),
      sender: 'bot',
      text: 'Hola. Soy ASAGI. ¿En qué puedo ayudarte hoy?',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]
};

const state = loadState();

const navItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.panel');
const chat = document.getElementById('chat');
const chatForm = document.getElementById('chat-form');
const input = document.getElementById('message-input');
const resetButton = document.getElementById('reset-chat');

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      activeSection: parsed.activeSection || defaultState.activeSection,
      messages: Array.isArray(parsed.messages) && parsed.messages.length ? parsed.messages : defaultState.messages
    };
  } catch (error) {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

    const text = document.createElement('div');
    text.textContent = message.text;
    bubble.appendChild(text);

    const meta = document.createElement('div');
    meta.className = 'message meta';
    meta.textContent = message.time;
    bubble.appendChild(meta);

    chat.appendChild(bubble);
  });

  chat.scrollTop = chat.scrollHeight;
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
    id: crypto.randomUUID(),
    sender,
    text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };

  state.messages.push(message);
  saveState();
  renderMessages();
}

navItems.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveSection(button.dataset.section);
  });
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value.trim();

  if (!text) return;

  appendMessage('user', text);
  input.value = '';

  window.setTimeout(() => {
    appendMessage('bot', createBotReply(text));
  }, 190);
});

resetButton.addEventListener('click', () => {
  state.messages = structuredClone(defaultState.messages);
  saveState();
  renderMessages();
});

setActiveSection(state.activeSection);
renderMessages();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // El registro falla silenciosamente si el entorno no lo permite.
    });
  });
}
