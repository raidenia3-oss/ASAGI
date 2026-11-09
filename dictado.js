;(function () {
// ASAGI - Dictado por voz (idea del artifact: Coucou/Wispr Flow como alternativa
// libre a ElevenLabs/Wispr). Usa la Web Speech API (SpeechRecognition), que en el
// WebView de Android es GRATIS y local: no sube audio a ningun servidor de pago.
// Le hablas a ASAGI y tu voz se vuelve texto en el chat; con el avatar y la voz,
// cierra el bucle: hablas -> piensa -> te responde hablando.
//
// La LOGICA de armado de transcripcion es PURA y testeable. El reconocimiento en
// vivo es impuro (usa el microfono via SpeechRecognition).

'use strict';

function _Reco() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function soportado() { return !!_Reco(); }

// Arma el texto a partir de la lista de resultados del evento. PURA.
// 'resultados' imita SpeechRecognitionResultList: array de items con
// isFinal y [0].transcript. Devuelve { final, parcial }.
function unirTranscripcion(resultados, desde) {
  desde = desde || 0;
  var final = '', parcial = '';
  if (!resultados) return { final: final, parcial: parcial };
  var n = (typeof resultados.length === 'number') ? resultados.length : 0;
  for (var i = desde; i < n; i++) {
    var r = resultados[i];
    if (!r || !r[0]) continue;
    var txt = String(r[0].transcript || '');
    if (r.isFinal) final += txt;
    else parcial += txt;
  }
  return { final: _limpiar(final), parcial: _limpiar(parcial) };
}

function _limpiar(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

// Junta lo ya confirmado con lo nuevo, sin duplicar espacios. PURA.
function componer(base, extra) {
  base = String(base || '').trim();
  extra = _limpiar(extra).trim();
  if (!extra) return base;
  return base ? base + ' ' + extra : extra;
}

// Crea un controlador de dictado. opts:
//   lang, onParcial(texto), onFinal(texto), onEstado('escuchando'|'detenido'|'error'),
//   continuo (default false: una frase y para).
function crearDictado(opts) {
  opts = opts || {};
  var Reco = _Reco();
  if (!Reco) return null;
  var rec = new Reco();
  rec.lang = opts.lang || 'es-ES';
  rec.continuous = !!opts.continuo;
  rec.interimResults = true;
  var escuchando = false;
  var acumulado = '';           // texto final acumulado en esta sesion

  rec.onresult = function (ev) {
    var t = unirTranscripcion(ev.results, 0);
    if (t.parcial && typeof opts.onParcial === 'function') {
      opts.onParcial(componer(t.final, t.parcial));
    }
    if (t.final) {
      acumulado = t.final;
      if (typeof opts.onFinal === 'function') opts.onFinal(t.final);
    }
  };
  rec.onerror = function (e) {
    if (typeof opts.onEstado === 'function') opts.onEstado('error', e && e.error);
  };
  rec.onend = function () {
    escuchando = false;
    if (typeof opts.onEstado === 'function') opts.onEstado('detenido');
  };

  function iniciar() {
    if (escuchando) return;
    acumulado = '';
    try { rec.start(); escuchando = true;
      if (typeof opts.onEstado === 'function') opts.onEstado('escuchando');
    } catch (e) {
      if (typeof opts.onEstado === 'function') opts.onEstado('error', e && e.message);
    }
  }
  function detener() { try { rec.stop(); } catch (e) {} }
  function alternar() { escuchando ? detener() : iniciar(); return escuchando; }

  return {
    iniciar: iniciar, detener: detener, alternar: alternar,
    get escuchando() { return escuchando; }
  };
}

var API = { soportado: soportado, unirTranscripcion: unirTranscripcion, componer: componer, crearDictado: crearDictado };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiDictado = API;

})();
