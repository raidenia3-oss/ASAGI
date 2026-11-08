;(function () {
// ASAGI - Monitor de servicios (idea de Uptime Kuma, sin servidor). Vigila si tus
// sitios/servicios responden, con latencia, historial y % de disponibilidad.
// El chequeo real (fetch) lo hace la UI; aquí va la lógica PURA y testeable.

'use strict';

var MAX_HIST = 30;

function normalizarUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

function etiqueta(url) {
  try { return url.replace(/^https?:\/\//i, '').replace(/\/.*$/, ''); } catch (e) { return url; }
}

function nuevoTarget(nombre, url) {
  var u = normalizarUrl(url);
  return {
    id: 'm' + Date.now() + Math.floor(Math.random() * 1000),
    nombre: (nombre || '').trim() || etiqueta(u),
    url: u,
    estado: 'pendiente',       // pendiente | up | down
    latencia: null,            // ms del último chequeo ok
    historia: [],              // [{ok:bool, ms:number, t:iso}]
  };
}

// Registra el resultado de un chequeo. Puro: devuelve un target nuevo.
function registrarChequeo(target, res) {
  var ok = !!(res && res.ok);
  var ms = res && typeof res.ms === 'number' ? Math.round(res.ms) : null;
  var h = (target.historia || []).concat([{ ok: ok, ms: ms, t: (res && res.t) || new Date().toISOString() }]);
  if (h.length > MAX_HIST) h = h.slice(h.length - MAX_HIST);
  return Object.assign({}, target, {
    estado: ok ? 'up' : 'down',
    latencia: ok ? ms : target.latencia,
    historia: h,
  });
}

// % de disponibilidad según el historial (0..100). Sin historial -> null.
function uptime(target) {
  var h = target.historia || [];
  if (!h.length) return null;
  var up = h.filter(function (x) { return x.ok; }).length;
  return Math.round((up / h.length) * 100);
}

// Latencia promedio de los chequeos ok.
function latenciaMedia(target) {
  var oks = (target.historia || []).filter(function (x) { return x.ok && typeof x.ms === 'number'; });
  if (!oks.length) return null;
  return Math.round(oks.reduce(function (a, x) { return a + x.ms; }, 0) / oks.length);
}

function resumen(targets) {
  targets = targets || [];
  return {
    total: targets.length,
    up: targets.filter(function (t) { return t.estado === 'up'; }).length,
    down: targets.filter(function (t) { return t.estado === 'down'; }).length,
  };
}

var API = { normalizarUrl, etiqueta, nuevoTarget, registrarChequeo, uptime, latenciaMedia, resumen, MAX_HIST };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiMonitor = API;

})();
