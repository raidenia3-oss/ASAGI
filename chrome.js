// Chrome como herramienta de ASAGI: abre una página en el Chrome de Daniel (con SUS sesiones: YouTube, Instagram…),
// lee la pantalla con el permiso de accesibilidad (modo manos), baja un poco para leer más y vuelve a ASAGI.
// ASAGI nunca ve ni escribe contraseñas: si la página pide iniciar sesión, se lo dice a Daniel y él lo hace en Chrome.
// Lo que lee son DATOS (pasan por el escudo anti-órdenes). Solo lee: no publica, no comenta, no envía.
//   «abre <sitio> en Chrome» · «lee en Chrome <url>» · (lo usan YouTube y redes para leer tus feeds)
(function () {
'use strict';
function C() { var P = window.Capacitor && window.Capacitor.Plugins; return P && P.AsagiControl; }
function dormir(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }

var CASI = /^(?:inicio|home|buscar|search|menu|más|mas|compartir|share|me gusta|like|guardar|save|suscribirse|subscribe|explorar|explore|biblioteca|library|tú|tu|you|shorts|notificaciones|cerrar|close|atrás|back|\d+|·|•)$/i;
// Junta los textos de varias lecturas de pantalla sin repetir y sin botones de la interfaz. PURO.
function juntar(lecturas) {
  var vistos = {}, out = [];
  (lecturas || []).forEach(function (l) {
    (l && l.nodos || []).forEach(function (n) {
      var t = String(n.t || n.texto || n.text || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length < 2 || CASI.test(t)) return;
      var k = norm(t); if (vistos[k]) return; vistos[k] = 1; out.push(t);
    });
  });
  return out;
}
// ¿La página pide iniciar sesión? PURO
function pideLogin(textos) {
  var j = norm((textos || []).slice(0, 40).join(' | '));
  return /(iniciar sesion|inicia sesion|acceder|sign in|log in|login|ingresa a tu cuenta|crear cuenta nueva|contrasena|password)/.test(j) && !/(cerrar sesion|sign out|log out)/.test(j);
}

// Abre url en Chrome, lee (y baja `bajadas` veces) y vuelve a ASAGI. -> { ok, textos, app, login, error }
async function leer(url, opts) {
  opts = opts || {};
  var c = C();
  if (!c || !c.manosLeer) return { ok: false, error: 'Leer en Chrome funciona en la app instalada (APK).' };
  var E = window.AsagiEscudo;
  if (E) { var r0 = E.analizarUrl(url); if (r0.nivel === 'peligro') return { ok: false, error: E.explicar(url, r0) }; url = E.limpiarUrl(url); }
  var a = await c.accion({ tipo: 'chrome', url: url }).catch(function (e) { return { ok: false, error: e.message }; });
  if (!a || a.ok === false) return { ok: false, error: (a && a.error) || 'no pude abrir Chrome' };
  await dormir(opts.espera || 5500);
  var lecturas = [];
  try {
    for (var i = 0; i <= (opts.bajadas == null ? 2 : opts.bajadas); i++) {
      var l = await c.manosLeer({ max: 120 });
      if (l && /no hay|sin permiso|desactiv/i.test(String(l.error || ''))) return { ok: false, error: '🖐 Para leer Chrome necesito el permiso de accesibilidad (Ajustes › Activar accesibilidad).' };
      lecturas.push(l || {});
      if (i < (opts.bajadas == null ? 2 : opts.bajadas)) { await c.manosDesplazar({ dir: 'abajo' }); await dormir(1500); }
    }
  } catch (e) {
    return { ok: false, error: /accesib|manos|servicio/i.test(String(e && e.message)) ? '🖐 Para leer Chrome necesito el permiso de accesibilidad (Ajustes › Activar accesibilidad).' : 'No pude leer la pantalla: ' + (e && e.message) };
  } finally {
    try { await c.openApp({ package: 'com.asagi.app' }); } catch (e) {}   // de vuelta a ASAGI
  }
  var textos = juntar(lecturas);
  var app = (lecturas[0] && lecturas[0].app) || '';
  // lo leído es DATO: neutralizar órdenes escondidas
  if (E) textos = textos.map(function (t) { return E.neutralizar(t).texto; });
  return { ok: true, textos: textos, app: app, login: pideLogin(textos), chrome: !!(a && a.chrome) };
}

// Solo abrir (para mirar uno mismo), pasando por el escudo. -> texto para el chat
async function abrir(url) {
  var E = window.AsagiEscudo, c = C(), r = E ? E.analizarUrl(url) : { nivel: 'ok', motivos: [] };
  if (r.nivel === 'peligro') return E.explicar(url, r);
  if (E) url = E.limpiarUrl(url);
  if (!c) { window.open(url, '_blank'); return '🌐 Abrí ' + url; }
  var a = await c.accion({ tipo: 'chrome', url: url }).catch(function () { return null; });
  return a && a.ok ? (a.chrome ? '🌐 Abierto en Chrome' : '🌐 Abierto en tu navegador') + (r.nivel === 'ojo' ? '. ⚠️ Ojo: ' + r.motivos.join('; ') : '.') : 'No pude abrirlo.';
}

var SITIOS = { youtube: 'https://m.youtube.com/', instagram: 'https://www.instagram.com/', facebook: 'https://m.facebook.com/', tiktok: 'https://www.tiktok.com/',
  x: 'https://x.com/', twitter: 'https://x.com/', reddit: 'https://www.reddit.com/', gmail: 'https://mail.google.com/', github: 'https://github.com/',
  linkedin: 'https://www.linkedin.com/', twitch: 'https://www.twitch.tv/', wikipedia: 'https://es.wikipedia.org/', google: 'https://www.google.com/', maps: 'https://maps.google.com/' };
// PURO
function parsear(t) {
  var s = String(t || '').trim(), n = norm(s).replace(/[¿?¡!]/g, ''), m;
  if ((m = n.match(/^(?:abre|abrir|ve a|entra a|llevame a)\s+(.+?)\s+en (?:chrome|el navegador|google chrome)$/))) {
    var q = m[1].trim(), url = SITIOS[q] || (/^https?:\/\//.test(q) ? s.match(/https?:\/\/\S+/)[0] : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(q) ? 'https://' + q : 'https://www.google.com/search?q=' + encodeURIComponent(q));
    return { accion: 'abrir', url: url };
  }
  if ((m = s.match(/^(?:lee|leer|leeme|léeme|mira|revisa)\s+(?:en chrome\s+)?(https:\/\/\S+)(?:\s+en chrome)?$/i))) return { accion: 'leer', url: m[1] };
  return null;
}

var API = { juntar: juntar, pideLogin: pideLogin, leer: leer, abrir: abrir, parsear: parsear, SITIOS: SITIOS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiChrome = API;
})();
