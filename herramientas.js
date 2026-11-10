;(function () {
// ASAGI - Herramientas del telefono: WiFi, Bluetooth, Termux y Nix.
// Se piden por el chat ("wifi", "bluetooth", "termux: ls", "nix: cowsay hola").
//
// LOGICA PURA (parseo, formato, lista de bloqueo) + un ejecutor que habla con el
// plugin nativo AsagiControl. El plugin ya sabe los permisos; aqui solo se pide
// y se muestra. Termux/Nix SOLO se ejecutan por orden escrita por ti en el chat:
// nunca por mensajes que lleguen de fuera (Discord, enlace, notificaciones).

'use strict';

var BLOQUEADOS = [
  /\brm\s+(-[a-z]*r[a-z]*f?|-[a-z]*f[a-z]*r)\b[^|;&]*\s(\/|~|\$HOME|\/\*|\/data|\/sdcard)\s*($|[;&|])/i,
  /\bmkfs(\.|\b)/i, /\bdd\b[^|;&]*\bof=\/dev\//i, />\s*\/dev\/(sd|mmcb|block)/i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/, /\bchmod\s+-R\s+0*7?7?7\s+\/(\s|$)/i
];

function bloqueado(cmd) {
  var c = String(cmd || '');
  for (var i = 0; i < BLOQUEADOS.length; i++) if (BLOQUEADOS[i].test(c)) return true;
  return false;
}

function _norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// ¿Que quiere el usuario? -> { tipo, arg } o null. PURO.
function parsear(texto) {
  var t = String(texto || '').trim();
  if (!t) return null;
  var n = _norm(t);
  var m = /^(termux|shell|ejecuta en termux)\s*[:\s]\s*([\s\S]+)$/i.exec(t);
  if (m && m[2].trim()) return { tipo: 'termux', arg: m[2].trim() };
  m = /^nix\s*[:\s]\s*([\s\S]+)$/i.exec(t);
  if (m && m[1].trim()) return { tipo: 'nix', arg: m[1].trim() };
  if (/^(wifi|wi-fi)(\s+(cerca|redes|disponibles|escanea|escanear))?\??$/.test(n) ||
      /^(que|cuales)\s+(redes\s+)?wifi/.test(n) || /^escanea\s+(el\s+)?wifi$/.test(n)) {
    return { tipo: 'wifi', arg: /redes|cerca|escane|disponibles/.test(n) ? 'escanear' : '' };
  }
  if (/^(bluetooth|blueetooth|bt)(\s+(cerca|dispositivos|escanea|escanear|vinculados))?\??$/.test(n) ||
      /^(que|cuales)\s+(dispositivos\s+)?bluetooth/.test(n) || /^escanea\s+(el\s+)?bluetooth$/.test(n)) {
    return { tipo: 'bt', arg: /cerca|escane/.test(n) ? 'escanear' : '' };
  }
  return null;
}

// Arma el comando de Termux para Nix (nix-portable: sin root). PURO.
function comandoNix(arg) {
  var a = String(arg || '').trim();
  if (!a) return '';
  var pre = 'export PATH="$HOME/bin:$HOME/.local/bin:$PATH" NP_RUNTIME=proot; ';
  // "nix: cowsay hola" -> paquete + argumentos
  var partes = a.split(/\s+/);
  var pkg = partes.shift();
  if (pkg.indexOf('#') < 0) pkg = 'nixpkgs#' + pkg;
  var resto = partes.join(' ');
  return pre + 'nix-portable nix run ' + pkg + (resto ? ' -- ' + resto : '');
}

function _senal(rssi) {
  if (typeof rssi !== 'number') return '';
  var n = rssi >= -55 ? 4 : rssi >= -67 ? 3 : rssi >= -78 ? 2 : 1;
  return ['▂', '▂▄', '▂▄▆', '▂▄▆█'][n - 1];
}

function formatoWifi(i) {
  if (!i) return 'No pude leer el WiFi.';
  if (i.sinPermiso) return 'Necesito permiso de ubicación/dispositivos cercanos para ver el WiFi. Te lo pido ahora; acéptalo y repite "wifi".';
  var out = [];
  if (!i.habilitado) out.push('📶 El WiFi está apagado.');
  else if (i.conectado && i.conectado.ssid) {
    out.push('📶 Conectado a "' + i.conectado.ssid + '" ' + _senal(i.conectado.rssi) +
      (i.conectado.rssi != null ? ' (' + i.conectado.rssi + ' dBm)' : '') +
      (i.conectado.velocidad ? ' · ' + i.conectado.velocidad + ' Mbps' : '') +
      (i.conectado.ip ? ' · ' + i.conectado.ip : ''));
  } else out.push('📶 WiFi encendido, sin red conectada.');
  var redes = (i.redes || []).filter(function (r) { return r && r.ssid; });
  if (redes.length) {
    redes.sort(function (a, b) { return (b.rssi || -100) - (a.rssi || -100); });
    out.push('Cerca (' + redes.length + '):');
    redes.slice(0, 8).forEach(function (r) {
      out.push('· ' + r.ssid + ' ' + _senal(r.rssi) + (r.seguridad ? ' · ' + r.seguridad : ''));
    });
  }
  return out.join('\n');
}

function formatoBt(i) {
  if (!i) return 'No pude leer el Bluetooth.';
  if (i.sinPermiso) return 'Necesito permiso de Bluetooth/dispositivos cercanos. Te lo pido ahora; acéptalo y repite "bluetooth".';
  if (i.disponible === false) return 'Este aparato no tiene Bluetooth.';
  var out = [i.habilitado ? '🔵 Bluetooth encendido.' : '🔵 Bluetooth apagado.'];
  var vin = i.vinculados || [];
  if (vin.length) {
    out.push('Vinculados:');
    vin.forEach(function (d) { out.push('· ' + (d.nombre || 'sin nombre') + (d.tipo ? ' (' + d.tipo + ')' : '') + (d.conectado ? ' · conectado' : '')); });
  } else if (i.habilitado) out.push('No hay dispositivos vinculados.');
  var cerca = i.cercanos || [];
  if (cerca.length) {
    out.push('Cerca ahora (' + cerca.length + '):');
    cerca.slice(0, 8).forEach(function (d) { out.push('· ' + (d.nombre || 'sin nombre') + (d.rssi != null ? ' ' + _senal(d.rssi) : '')); });
  } else if (i.escaneado) out.push('No vi dispositivos nuevos cerca.');
  return out.join('\n');
}

function formatoTermux(r) {
  if (!r) return 'Termux no respondió.';
  if (r.error) return '⚠ ' + r.error;
  var out = [];
  if (r.stdout) out.push(String(r.stdout).replace(/\s+$/, ''));
  if (r.stderr) out.push('⚠ ' + String(r.stderr).replace(/\s+$/, ''));
  if (!out.length) out.push(r.exitCode === 0 ? '(listo, sin salida)' : '(sin salida)');
  if (typeof r.exitCode === 'number' && r.exitCode !== 0) out.push('código de salida: ' + r.exitCode);
  var txt = out.join('\n');
  return txt.length > 1800 ? txt.slice(0, 1800) + '\n… (recortado)' : txt;
}

function _plugin() {
  try { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiControl; } catch (e) { return null; }
}

// Ejecuta una orden ya parseada. Devuelve el texto a mostrar. IMPURO.
async function ejecutar(orden) {
  var p = _plugin();
  if (!orden) return null;
  if (!p) return 'Esto solo funciona dentro de la app instalada en el celular.';
  try {
    if (orden.tipo === 'wifi') {
      var w = await p.wifiInfo({ escanear: orden.arg === 'escanear' });
      if (w && w.sinPermiso && p.pedirPermisosRadios) { try { p.pedirPermisosRadios(); } catch (e) {} }
      return formatoWifi(w);
    }
    if (orden.tipo === 'bt') {
      var b = await p.bluetoothInfo({ escanear: orden.arg === 'escanear' });
      if (b && b.sinPermiso && p.pedirPermisosRadios) { try { p.pedirPermisosRadios(); } catch (e) {} }
      return formatoBt(b);
    }
    if (orden.tipo === 'termux' || orden.tipo === 'nix') {
      var cmd = orden.tipo === 'nix' ? comandoNix(orden.arg) : orden.arg;
      if (bloqueado(cmd)) return '⛔ Ese comando es demasiado destructivo; no lo ejecuto.';
      var r = await p.termuxRun({ cmd: cmd, timeoutMs: orden.tipo === 'nix' ? 180000 : 30000 });
      if (r && r.sinPermiso && p.pedirPermisosRadios) { try { p.pedirPermisosRadios(); } catch (e) {} }
      return formatoTermux(r);
    }
  } catch (e) {
    return '⚠ ' + (e && e.message ? e.message : 'falló la herramienta');
  }
  return null;
}

var API = { parsear: parsear, bloqueado: bloqueado, comandoNix: comandoNix, formatoWifi: formatoWifi,
            formatoBt: formatoBt, formatoTermux: formatoTermux, ejecutar: ejecutar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiHerr = API;

})();
