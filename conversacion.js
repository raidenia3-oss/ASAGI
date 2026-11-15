// Modo conversación a manos libres (como el modo voz de ChatGPT / Open WebUI):
//   «hablemos» · «modo conversación» · «modo llamada»  -> ASAGI escucha, responde en voz alta y vuelve a escuchar.
//   Para terminar: di «basta», «chau» o «termina», toca la barra, o quédate callado dos veces.
// Usa el dictado y la voz que ya trae el celular (sin dependencias). Lo que responde es lo mismo que en el chat.
(function () {
'use strict';
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,]+/g, '').replace(/\s+/g, ' ').trim(); }

// PURO
function parsear(t) {
  var n = norm(t);
  if (/^(?:hablemos|conversemos|modo (?:conversacion|llamada|voz|manos libres)|hablame|charlemos por voz|llamada con asagi)$/.test(n)) return { accion: 'iniciar' };
  return null;
}
function esFin(t) { return /^(?:basta|chau|chao|adios|termina(?: la (?:conversacion|llamada))?|fin|para|detente|ya esta|cuelga|colgar)$/.test(norm(t)); }
// Texto para leer en voz alta (sin emojis, enlaces ni símbolos). PURO.
function paraVoz(t) {
  if (typeof window !== 'undefined' && window._asagiParaVoz) return window._asagiParaVoz(t);
  return String(t || '').replace(/https?:\/\/\S+/g, 'el enlace').replace(/[*#_`|•«»]+/g, '').replace(/\s+/g, ' ').trim();
}

var activo = null;
function barra(texto) {
  var b = document.getElementById('conv-barra');
  if (!b) {
    b = document.createElement('button'); b.id = 'conv-barra'; b.type = 'button'; b.className = 'conv-barra';
    b.setAttribute('aria-live', 'polite');
    b.addEventListener('click', function () { terminar('Conversación terminada.'); });
    document.body.appendChild(b);
  }
  b.textContent = texto + '  ·  toca para terminar';
}
function quitarBarra() { var b = document.getElementById('conv-barra'); if (b) b.remove(); }

function decirEnVoz(texto) {
  var N = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiHablar;
  if (N && texto) {   // espera a que termine (con tope, por si el teléfono no avisa)
    var tope = new Promise(function (ok) { setTimeout(ok, 4000 + paraVoz(texto).length * 110); });
    return Promise.race([N.hablar({ texto: paraVoz(texto).slice(0, 600) }).then(function () {}, function () {}), tope]);
  }
  return new Promise(function (ok) {
    try {
      var s = window.speechSynthesis; if (!s || !texto) { ok(); return; }
      var u = new window.SpeechSynthesisUtterance(paraVoz(texto).slice(0, 600));
      u.lang = 'es-ES';
      var listo = false, fin = function () { if (!listo) { listo = true; ok(); } };
      u.onend = fin; u.onerror = fin;
      s.cancel(); s.speak(u);
      setTimeout(fin, 2500 + paraVoz(texto).length * 90);   // por si el teléfono no avisa el final
    } catch (e) { ok(); }
  });
}

function escucharUnaVez() {
  return new Promise(function (ok) {
    var D = window.AsagiDictado, final = '', listo = false;
    var d = D && D.crearDictado({ lang: 'es-ES', continuo: false,
      onParcial: function (t) { barra('🎙 ' + t); },
      onFinal: function (t) { final = t; },
      onEstado: function (e, cod) {
        if (listo) return;
        // sin permiso o sin servicio de voz: no es silencio, es que el micrófono no funciona
        if (e === 'error' && /not-allowed|service-not-allowed|audio-capture|network/.test(String(cod || ''))) { listo = true; ok(null); return; }
        if (e === 'detenido' || e === 'error') { listo = true; ok(final.trim()); }
      } });
    if (!d) { ok(null); return; }
    d.iniciar();
    setTimeout(function () { if (!listo) { try { d.detener(); } catch (e) {} } }, 12000);
  });
}

// Espera la respuesta de ASAGI a lo último enviado (mensajes nuevos del bot, luego 1,5 s de calma).
function esperarRespuesta(estado, desde) {
  return new Promise(function (ok) {
    var t0 = Date.now(), ultimoN = desde, quieto = 0;
    var iv = setInterval(function () {
      var nuevos = estado.messages.slice(desde).filter(function (m) { return m.sender === 'bot'; });
      if (estado.messages.length !== ultimoN) { ultimoN = estado.messages.length; quieto = Date.now(); }
      if ((nuevos.length && Date.now() - quieto > 1500) || Date.now() - t0 > 60000) {
        clearInterval(iv); ok(nuevos.map(function (m) { return m.text; }).join('. '));
      }
    }, 250);
  });
}

function terminar(msg) {
  if (!activo) return;
  activo.vivo = false; activo = null;
  try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
  try { var N = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiHablar; if (N) N.callar(); } catch (e) {}
  quitarBarra();
  if (msg && window._asagiDecir) window._asagiDecir('📞 ' + msg);
}

// enviar(texto): manda la frase al chat como si la escribiera Daniel. estado: el state de app.js
async function iniciar(enviar, estado) {
  if (activo) return;
  if (!(window.AsagiDictado && window.AsagiDictado.soportado())) { if (window._asagiDecir) window._asagiDecir('🎙 Este celular no me deja escuchar aquí. Usa el botón del micrófono para dictar.'); return; }
  var yo = activo = { vivo: true }, silencios = 0;
  await decirEnVoz('Te escucho.');
  while (yo.vivo) {
    barra('🎙 Te escucho…');
    var t = await escucharUnaVez();
    if (!yo.vivo) break;
    if (t === null) { terminar('No pude usar el micrófono (¿le diste permiso a ASAGI? Ajustes de Android › Apps › ASAGI › Permisos › Micrófono).'); break; }
    if (!t) { if (++silencios >= 2) { terminar('Como no dijiste nada, terminé la conversación.'); break; } continue; }
    silencios = 0;
    if (esFin(t)) { await decirEnVoz('Listo, hasta luego.'); terminar('Conversación terminada.'); break; }
    barra('🧠 Pensando…');
    var desde = estado.messages.length;
    enviar(t);
    var resp = await esperarRespuesta(estado, desde);
    if (!yo.vivo) break;
    barra('🔊 Hablando…');
    await decirEnVoz(resp);
  }
}

var API = { parsear: parsear, esFin: esFin, iniciar: iniciar, terminar: terminar, activo: function () { return !!activo; } };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiConversacion = API;
})();
