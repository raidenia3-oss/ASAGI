// ASAGI - Voz + Sigilo. Asagi habla por TTS, pero con DISCRECION:
//   - Habla en voz alta solo si esta habilitada Y (el sigilo esta apagado O hay
//     audifonos conectados). Asi, con "sigilo" puesto, solo te habla al oido por
//     audifono y nunca suena para que otros escuchen.
//   - Sin audifonos y con sigilo -> se queda callada (responde solo por texto).
//
// La DECISION (debeHablar) es PURA y testeable. La reproduccion usa speechSynthesis
// del WebView (o un speak inyectado). La deteccion de audifonos entra como callback
// (en Android se puede leer via un plugin nativo; si no, se asume false con sigilo).

'use strict';

// Decide si Asagi debe hablar en voz alta. PURA.
//   habilitado: el usuario activo la voz.
//   sigilo:     modo discreto (no sonar si pueden oir otros).
//   audifonos:  hay audifonos conectados (audio privado).
function debeHablar({ habilitado = false, sigilo = false, audifonos = false } = {}) {
  if (!habilitado) return false;
  if (!sigilo) return true;            // sin sigilo: habla normal
  return !!audifonos;                  // con sigilo: solo si es privado (audifonos)
}

// Motivo legible de por que (no) habla. Puro.
function motivo(estado) {
  if (!estado.habilitado) return 'voz desactivada';
  if (estado.sigilo && !estado.audifonos) return 'sigilo: sin audifonos, respondo por texto';
  return estado.sigilo ? 'sigilo: hablo solo por audifono' : 'hablo en voz alta';
}

// Habla el texto si corresponde. Impura (usa el sintetizador).
//   opts: { habilitado, sigilo, audifonos, lang, rate, speak }
//   speak(texto,opts) opcional; si no, usa window.speechSynthesis.
function hablar(texto, opts = {}) {
  const estado = {
    habilitado: !!opts.habilitado,
    sigilo: !!opts.sigilo,
    audifonos: !!opts.audifonos,
  };
  if (!debeHablar(estado) || !texto) {
    return { hablado: false, motivo: motivo(estado) };
  }
  try {
    if (typeof opts.speak === 'function') {
      opts.speak(texto, opts);
    } else if (typeof window !== 'undefined' && window.speechSynthesis) {
      const u = new window.SpeechSynthesisUtterance(texto);
      u.lang = opts.lang || 'es-ES';
      if (opts.rate) u.rate = opts.rate;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } else {
      return { hablado: false, motivo: 'sin sintetizador de voz' };
    }
  } catch (e) {
    return { hablado: false, motivo: 'error de voz: ' + (e && e.message || e) };
  }
  return { hablado: true, motivo: motivo(estado) };
}

// Detecta audifonos. Usa un detector nativo si se inyecta; si no, intenta por
// enumerateDevices (limitado) y en ultimo caso devuelve false. Impura.
async function audifonosConectados(detectorNativo) {
  if (typeof detectorNativo === 'function') {
    try { return !!(await detectorNativo()); } catch (e) { return false; }
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices &&
        navigator.mediaDevices.enumerateDevices) {
      const devs = await navigator.mediaDevices.enumerateDevices();
      return devs.some((d) => d.kind === 'audiooutput' &&
        /head|ear|bluetooth|audif/i.test(d.label || ''));
    }
  } catch (e) { /* ignorar */ }
  return false;
}

const API = { debeHablar, motivo, hablar, audifonosConectados };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiVoz = API;
