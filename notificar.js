;(function () {
// ASAGI - Notificaciones nativas de los pendientes con hora. Para que el aviso
// llegue aunque la app este cerrada, sin depender de que la tengas abierta.
//
// Privacidad: una notificacion de Android NO habla, solo aparece en la bandeja
// (sonido/vibracion del sistema). La VOZ sigue siendo solo por audifonos; esto
// no la toca.
//
// La construccion de los avisos es PURA y testeable. El envio usa el plugin
// @capacitor/local-notifications SOLO si existe; en navegador no hace nada.

'use strict';

// Un id numerico estable a partir del id de texto del pendiente (el plugin
// exige numero). Hash simple, positivo y dentro de rango seguro. PURO.
function idNumerico(idTexto) {
  var h = 0, s = String(idTexto || '');
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % 2000000000 || 1;
}

// Convierte los pendientes en avisos programables: solo los que tienen hora,
// no estan hechos y caen en el FUTURO. PURO.
function programables(lista, ahora) {
  var t = (ahora instanceof Date) ? ahora.getTime() : (ahora || Date.now());
  return (lista || [])
    .filter(function (x) { return !x.hecho && x.cuando && x.cuando > t; })
    .map(function (x) {
      return {
        id: idNumerico(x.id),
        title: 'ASAGI · pendiente',
        body: x.texto,
        schedule: { at: new Date(x.cuando) },
        extra: { pid: x.id }
      };
    });
}

// Los que ya NO deben sonar (hechos, sin hora o pasados): hay que cancelarlos. PURO.
function cancelables(lista, ahora) {
  var t = (ahora instanceof Date) ? ahora.getTime() : (ahora || Date.now());
  return (lista || [])
    .filter(function (x) { return x.hecho || !x.cuando || x.cuando <= t; })
    .map(function (x) { return { id: idNumerico(x.id) }; });
}

function _plugin() {
  try {
    return (window.Capacitor && window.Capacitor.Plugins &&
            window.Capacitor.Plugins.LocalNotifications) || null;
  } catch (e) { return null; }
}

function disponible() { return !!_plugin(); }

// Pide permiso una sola vez (Android 13+ lo exige). Devuelve true si concedido.
async function permiso() {
  var p = _plugin(); if (!p) return false;
  try {
    var est = await p.checkPermissions();
    if (est && est.display === 'granted') return true;
    var pedido = await p.requestPermissions();
    return !!(pedido && pedido.display === 'granted');
  } catch (e) { return false; }
}

// Sincroniza las notificaciones con la lista actual de pendientes.
// Cancela lo que ya no aplica y programa lo futuro. No hace nada sin plugin.
async function sincronizar(lista, ahora) {
  var p = _plugin(); if (!p) return { ok: false, motivo: 'sin plugin' };
  var prog = programables(lista, ahora);
  var canc = cancelables(lista, ahora);
  try {
    if (canc.length) { try { await p.cancel({ notifications: canc }); } catch (e) {} }
    if (prog.length) {
      if (!(await permiso())) return { ok: false, motivo: 'sin permiso' };
      await p.schedule({ notifications: prog });
    }
    return { ok: true, programadas: prog.length, canceladas: canc.length };
  } catch (e) {
    return { ok: false, motivo: (e && e.message) || String(e) };
  }
}

var API = { idNumerico: idNumerico, programables: programables, cancelables: cancelables,
            disponible: disponible, permiso: permiso, sincronizar: sincronizar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiNotificar = API;

})();
