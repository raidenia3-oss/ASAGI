;(function () {
// ASAGI - actualizaciones SIN desinstalar: mira version.json de la release "latest" en GitHub,
// baja el APK nuevo y abre el instalador de Android encima del actual (se conservan los datos).
'use strict';
var BASE = 'https://github.com/raidenia3-oss/ASAGI/releases/download/latest/';

// Decide que hacer. PURO. instalada = {build, firma}, remota = {build, firma, sha}
function decidir(instalada, remota) {
  if (!remota || !(remota.build > 0)) return { accion: 'nada', motivo: 'sin datos remotos' };
  if (!instalada || !(instalada.build >= 0)) return { accion: 'nada', motivo: 'sin datos locales' };
  if (remota.build <= instalada.build) return { accion: 'nada', motivo: 'al dia (build ' + instalada.build + ')' };
  var fi = String(instalada.firma || '').toUpperCase(), fr = String(remota.firma || '').toUpperCase();
  if (fi && fr && fi !== fr) return { accion: 'firmaDistinta', motivo: 'la version nueva esta firmada con otra llave' };
  return { accion: 'actualizar', motivo: 'build ' + instalada.build + ' → ' + remota.build };
}

function _http() { try { return window.Capacitor.Plugins.CapacitorHttp; } catch (e) { return null; } }
function _ctl() { try { return window.Capacitor.Plugins.AsagiControl; } catch (e) { return null; } }

async function remota() {
  var H = _http(); if (!H) return null;
  try {
    var r = await H.get({ url: BASE + 'version.json?t=' + Date.now(), headers: { 'Cache-Control': 'no-cache' } });
    var d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    return d && d.build ? d : null;
  } catch (e) { return null; }
}

async function revisar() {
  var C = _ctl(); if (!C || !C.versionApp) return { accion: 'nada', motivo: 'fuera de la app' };
  var yo; try { yo = await C.versionApp(); } catch (e) { yo = null; }
  var rem = await remota();
  var d = decidir(yo, rem);
  d.instalada = yo; d.remota = rem;
  return d;
}

async function instalar() {
  var C = _ctl(); if (!C || !C.instalarApk) return { ok: false, error: 'fuera de la app' };
  return C.instalarApk({ url: BASE + 'asagi.apk' });
}

var API = { decidir: decidir, revisar: revisar, instalar: instalar, BASE: BASE };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiActualizador = API;
})();
