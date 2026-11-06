;(function () {
// ASAGI - Defensa: auditor de seguridad de TU propio celular (defensivo y honesto).
//
// NO es un antivirus magico ni detecta "hackers" por arte de magia: eso seria mentir.
// Lo que SI hace, con datos reales de Android: revisa las apps instaladas, sus PERMISOS
// y su ORIGEN, y marca las RIESGOSAS con el motivo (permisos peligrosos, combos tipo
// spyware, apps que pueden controlar tu pantalla, instaladas de fuentes desconocidas).
// Asi tu decides que revisar o desinstalar. Puramente defensivo; nada ofensivo.
//
// La LOGICA (analizarApp/analizar) es PURA y testeable. Los datos vienen del plugin
// nativo AsagiControl.appAudit().

'use strict';

// Permisos sensibles: [motivo, peso].
const PELIGROSOS = {
  'android.permission.BIND_ACCESSIBILITY_SERVICE': ['puede controlar toda tu pantalla', 4],
  'android.permission.BIND_DEVICE_ADMIN': ['es administrador del dispositivo', 4],
  'android.permission.REQUEST_INSTALL_PACKAGES': ['puede instalar otras apps', 3],
  'android.permission.READ_SMS': ['lee tus SMS', 3],
  'android.permission.RECEIVE_SMS': ['intercepta tus SMS', 3],
  'android.permission.SEND_SMS': ['envia SMS (puede costar)', 3],
  'android.permission.SYSTEM_ALERT_WINDOW': ['dibuja sobre otras apps (overlay)', 2],
  'android.permission.RECORD_AUDIO': ['puede grabar audio', 2],
  'android.permission.READ_CALL_LOG': ['lee tu registro de llamadas', 2],
  'android.permission.PROCESS_OUTGOING_CALLS': ['ve tus llamadas salientes', 2],
  'android.permission.CAMERA': ['usa la camara', 1],
  'android.permission.READ_CONTACTS': ['lee tus contactos', 1],
  'android.permission.ACCESS_FINE_LOCATION': ['tu ubicacion exacta', 1],
  'android.permission.PACKAGE_USAGE_STATS': ['ve tu uso de apps', 1],
  'android.permission.QUERY_ALL_PACKAGES': ['ve todas tus apps', 1],
};

function _tiene(perms, p) { return (perms || []).indexOf(p) !== -1; }

// Analiza una app. Puro. Devuelve {package,label,score,nivel,razones,system}.
function analizarApp(app) {
  const perms = app.permissions || [];
  const razones = [];
  let score = 0;
  for (const p of perms) {
    if (PELIGROSOS[p]) { razones.push(PELIGROSOS[p][0]); score += PELIGROSOS[p][1]; }
  }
  // combos que elevan sospecha (patron tipo spyware)
  const net = _tiene(perms, 'android.permission.INTERNET');
  if (net && (_tiene(perms, 'android.permission.READ_SMS') || _tiene(perms, 'android.permission.RECEIVE_SMS'))) {
    razones.push('combo: SMS + internet'); score += 2;
  }
  if (net && _tiene(perms, 'android.permission.RECORD_AUDIO') && _tiene(perms, 'android.permission.ACCESS_FINE_LOCATION')) {
    razones.push('combo: micro + ubicacion + internet'); score += 2;
  }
  if (_tiene(perms, 'android.permission.SYSTEM_ALERT_WINDOW') &&
      _tiene(perms, 'android.permission.BIND_ACCESSIBILITY_SERVICE')) {
    razones.push('combo: overlay + accesibilidad (riesgo alto)'); score += 3;
  }
  // origen: instalado de fuente desconocida (no store conocida) y no es del sistema
  const inst = (app.installer || '').toLowerCase();
  const stores = ['com.android.vending', 'com.google.android', 'com.sec.android', 'com.amazon', 'org.fdroid'];
  const deStore = stores.some((s) => inst.indexOf(s) === 0);
  if (!app.system && !deStore) { razones.push('instalada de fuente desconocida'); score += 2; }
  if (app.system) score = Math.max(0, score - 2);   // apps del sistema: menos sospecha

  let nivel = 'bajo';
  if (score >= 7) nivel = 'alto';
  else if (score >= 4) nivel = 'medio';
  return { package: app.package, label: app.label || app.package, score, nivel,
           razones, system: !!app.system };
}

// Analiza todas las apps. Puro. Devuelve {resumen, riesgosas}.
function analizar(apps) {
  const todas = (apps || []).map(analizarApp);
  const riesgosas = todas.filter((a) => a.nivel !== 'bajo').sort((a, b) => b.score - a.score);
  const alto = riesgosas.filter((a) => a.nivel === 'alto').length;
  const medio = riesgosas.filter((a) => a.nivel === 'medio').length;
  return {
    resumen: { total: todas.length, alto, medio, bajo: todas.length - riesgosas.length },
    riesgosas,
  };
}

// Texto honesto de lo que es (y no es) esta defensa. Puro.
function aviso() {
  return 'Esto revisa permisos y origen de tus apps (defensa real). No es un antivirus con firmas: para malware avanzado, combinalo con desinstalar lo dudoso y no instalar de fuentes raras.';
}

const API = { PELIGROSOS, analizarApp, analizar, aviso };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiDefensa = API;

})();
