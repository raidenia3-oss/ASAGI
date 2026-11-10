;(function () {
// ASAGI - Herramientas del telefono: WiFi, Bluetooth, Termux y Nix.
// Se piden por el chat ("wifi", "bluetooth", "termux: ls", "nix: cowsay hola").
//
// LOGICA PURA (parseo, formato, lista de bloqueo) + un ejecutor que habla con el
// plugin nativo AsagiControl. El plugin ya sabe los permisos; aqui solo se pide
// y se muestra. Termux/Nix SOLO se ejecutan por orden escrita por ti en el chat:
// nunca por mensajes que lleguen de fuera (Discord, enlace, notificaciones).

'use strict';

var SETUP_TERMUX = 'curl -fsSL https://raw.githubusercontent.com/raidenia3-oss/ASAGI/main/scripts/termux-setup.sh | bash';

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
  var mi = /^instala(?:r)?\s+en\s+termux\s+([\w.+\-]+(?:\s+[\w.+\-]+)*)$/i.exec(t);
  if (mi) return { tipo: 'termux', arg: 'pkg install -y ' + mi[1].trim() };
  var mc = /^(?:con[eé]cta(?:te)?|con[eé]ctar|empareja(?:r)?|vincula(?:r)?)\s+(?:a(?:l)?\s+|el\s+)?(?:(?:el\s+)?(bluetooth|bt)|(wifi|wi-fi))\s+(?:a(?:l)?\s+|de(?:l)?\s+)?([\s\S]+)$/i.exec(t);
  if (mc) {
    var resto = mc[3].trim();
    if (mc[1]) return { tipo: 'bt-conectar', arg: resto.replace(/^["“']|["”']$/g, '') };
    var mw = /^(.+?)(?:\s+(?:clave|contrase(?:ñ|n)a|password|pass)\s*[:=]?\s*(\S[\s\S]*))?$/i.exec(resto);
    return { tipo: 'wifi-conectar', arg: mw[1].trim().replace(/^["“']|["”']$/g, ''), clave: mw[2] ? mw[2].trim() : '' };
  }
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
  var pre = 'export PATH="$HOME/bin:$HOME/.local/bin:$PATH" NP_RUNTIME=proot; ' +
    'command -v nix-portable >/dev/null 2>&1 || { command -v curl >/dev/null 2>&1 || pkg install -y curl; ' +
    'mkdir -p "$HOME/bin"; curl -fL --retry 3 -o "$HOME/bin/nix-portable" ' +
    '"https://github.com/DavHau/nix-portable/releases/latest/download/nix-portable-$(uname -m | sed s/arm64/aarch64/)" ' +
    '&& chmod +x "$HOME/bin/nix-portable"; }; ';
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
    var mias = wifiMias();
    redes.slice(0, 8).forEach(function (r) {
      var mia = mias.indexOf(String(r.ssid).toLowerCase()) >= 0 || (i.conectado && i.conectado.ssid === r.ssid);
      out.push('· ' + r.ssid + ' ' + _senal(r.rssi) + (r.seguridad ? ' · ' + r.seguridad : '') +
        (mia ? ' · tuya' : (r.seguridad === 'abierta' ? ' · ⚠ abierta y ajena' : ' · ajena')));
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
    var an = analizarCercanos(i);
    out.push(an.mios.length + ' tuyo(s) y ' + an.ajenos.length + ' ajeno(s) — solo me conecto a los tuyos (los que tú vinculaste).');
    cerca.slice(0, 8).forEach(function (d) { out.push('· ' + (d.nombre || 'sin nombre') + (d.rssi != null ? ' ' + _senal(d.rssi) : '') + (d.mio ? ' · tuyo' : ' · ajeno')); });
  } else if (i.escaneado) out.push('No vi dispositivos nuevos cerca.');
  return out.join('\n');
}

// Pura: separa lo cercano en tuyo (vinculado por ti) y ajeno. info = resultado de bluetoothInfo.
function analizarCercanos(info) {
  var out = { mios: [], ajenos: [] };
  ((info && info.cercanos) || []).forEach(function (d) { (d.mio ? out.mios : out.ajenos).push(d); });
  return out;
}

var K_WMIAS = 'asagi-wifi-mias';
function wifiMias() {
  try { var a = JSON.parse(localStorage.getItem(K_WMIAS) || '[]'); return Array.isArray(a) ? a.map(function (x) { return String(x).toLowerCase(); }) : []; } catch (e) { return []; }
}
function wifiMia(ssid) {
  var n = String(ssid || '').trim().toLowerCase();
  if (!n) return;
  var l = wifiMias();
  if (l.indexOf(n) < 0) { l.push(n); try { localStorage.setItem(K_WMIAS, JSON.stringify(l.slice(-20))); } catch (e) {} }
}

function formatoBtConectar(r, nombre) {
  if (!r) return 'No pude hablar con el Bluetooth.';
  if (r.sinPermiso) return 'Necesito el permiso de Bluetooth. Te lo pido ahora; acéptalo y repite la orden.';
  var n = r.nombre || nombre;
  switch (r.estado) {
    case 'conectado': return '🔵 Conectado a ' + n + '.';
    case 'tocadoEnAjustes': return '🔵 Le pedí a ' + n + ' que se conecte desde Ajustes. Dame unos segundos.';
    case 'intentado': return '🔵 Intenté conectar ' + n + '. ' + (r.sinAccesibilidad ? 'Si no se conecta solo, activa la Accesibilidad de ASAGI y repite.' : 'Si no lo hace, ponlo en modo de vinculación.');
    case 'noPudeTocar': return '🔵 Abrí Bluetooth pero no vi "' + n + '" en pantalla. ¿Está encendido y cerca?';
    case 'emparejando': return '🔵 Lo encontré y pedí el emparejamiento: toca "Vincular" en el aviso del sistema.';
    case 'noEncontrado': return '🔵 No encontré "' + n + '" cerca. Enciéndelo y ponlo en modo de vinculación.';
    case 'ambiguo': return '🔵 Hay varios aparatos que se llaman parecido a "' + nombre + '" (' + (r.candidatos || []).join(', ') + '). No me conecto a ninguno por si alguno es ajeno: dime el nombre exacto del tuyo.';
    case 'muyLejos': return '🔵 Vi "' + (r.nombre || nombre) + '" pero la señal es muy débil (' + r.rssi + ' dBm): parece de otra persona. Acércalo a tu celular y repite si es tuyo.';
    case 'noVinculado': return '🔵 "' + n + '" no está vinculado y no pude buscarlo (falta permiso de escaneo).';
    case 'encendiendo': return '🔵 El Bluetooth estaba apagado: acepta el aviso para encenderlo y repite la orden.';
    case 'sinBluetooth': return 'Este aparato no tiene Bluetooth.';
    default: return '🔵 ' + (r.detalle || 'No pude conectar.');
  }
}

function formatoWifiConectar(r, ssid) {
  if (!r) return 'No pude hablar con el WiFi.';
  switch (r.estado) {
    case 'guardada': return '📶 Guardé "' + ssid + '": el celular se conectará solo cuando esté en rango, como un aparato vinculado.';
    case 'yaGuardada': return '📶 "' + ssid + '" ya estaba guardada; se conecta sola cuando está cerca.';
    case 'faltaAprobar': return '📶 Android pide aprobar las redes que sugiere ASAGI: toca "Permitir" en el aviso y repite la orden.';
    case 'androidViejo': return '📶 Este Android es muy antiguo para guardar redes desde la app.';
    case 'sinWifi': return 'Este aparato no tiene WiFi.';
    default: return '📶 No pude guardar la red (' + (r.estado || 'error') + ').';
  }
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
    if (orden.tipo === 'bt-conectar') {
      var rc = await p.bluetoothConectar({ nombre: orden.arg });
      if (rc && rc.sinPermiso && p.pedirPermisosRadios) { try { p.pedirPermisosRadios(); } catch (e) {} }
      if (rc && (rc.estado === 'conectado' || rc.estado === 'tocadoEnAjustes' || rc.estado === 'intentado' || rc.estado === 'emparejando')) confiar(orden.arg);
      return formatoBtConectar(rc, orden.arg);
    }
    if (orden.tipo === 'wifi-conectar') {
      var rw = await p.wifiConectar({ ssid: orden.arg, clave: orden.clave || '' });
      if (rw && (rw.estado === 'guardada' || rw.estado === 'yaGuardada')) wifiMia(orden.arg);
      return formatoWifiConectar(rw, orden.arg);
    }
    if (orden.tipo === 'termux' || orden.tipo === 'nix') {
      var cmd = orden.tipo === 'nix' ? comandoNix(orden.arg) : orden.arg;
      if (bloqueado(cmd)) return '⛔ Ese comando es demasiado destructivo; no lo ejecuto.';
      var est = p.termuxEstado ? await p.termuxEstado() : { instalado: true, permiso: true };
      if (est && est.instalado === false) {
        return 'Termux no está instalado. Instálalo desde F-Droid (la versión de Play Store está vieja) y repite la orden.';
      }
      var r = await p.termuxRun({ cmd: cmd, timeoutMs: orden.tipo === 'nix' ? 240000 : 30000 });
      if (r && r.sinPermiso && p.pedirPermisosRadios) { try { p.pedirPermisosRadios(); } catch (e) {} }
      if (r && r.error && /allow-external-apps|a tiempo|No pude hablar/i.test(r.error) && p.termuxPreparar) {
        var pr = await p.termuxPreparar({ linea: SETUP_TERMUX });
        return 'Termux todavía no deja que ASAGI le mande órdenes. Lo abrí y ' +
          (pr && pr.estado === 'pegado' ? 'pegué la línea de instalación: pulsa Enter en Termux y repite la orden.'
            : 'copié la línea de instalación: pégala en Termux (mantén pulsado → Pegar), pulsa Enter y repite la orden.') +
          ' Es solo esta vez.';
      }
      return formatoTermux(r);
    }
  } catch (e) {
    return '⚠ ' + (e && e.message ? e.message : 'falló la herramienta');
  }
  return null;
}

// --- Reconexion automatica: SOLO aparatos tuyos --------------------------------
// "Tuyo" = vinculado en este celular (tu lo emparejaste) Y que ASAGI vio conectado
// antes o que tu conectaste con una orden. Un aparato ajeno (no vinculado) jamas se
// empareja ni se conecta en automatico. Si falla, espera cada vez mas (hasta 30 min).
var K_HAB = 'asagi-bt-habituales';
function habituales() {
  try { var a = JSON.parse(localStorage.getItem(K_HAB) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function recordarHabitual(nombre) {
  var n = String(nombre || '').trim();
  if (!n) return;
  var l = habituales();
  if (l.map(function (x) { return x.toLowerCase(); }).indexOf(n.toLowerCase()) < 0) {
    l.push(n);
    try { localStorage.setItem(K_HAB, JSON.stringify(l.slice(-10))); } catch (e) {}
  }
}
function confiar(nombre) { recordarHabitual(nombre); }
function confiados() { return habituales(); }
// Pura: habituales que estan vinculados (tuyos) y desconectados ahora.
function porReconectar(lista, info) {
  var vin = (info && info.vinculados) || [];
  return (lista || []).filter(function (nombre) {
    var q = String(nombre).toLowerCase();
    var d = vin.filter(function (x) { var n = String(x.nombre || '').toLowerCase(); return n === q || (n && (n.indexOf(q) >= 0 || q.indexOf(n) >= 0)); })[0];
    return d ? !d.conectado : false;
  });
}
// Pura: espera (ms) tras N fallos seguidos: 90 s, 3 min, 6 min ... tope 30 min.
function esperaTras(fallos) {
  return Math.min(30 * 60 * 1000, 90000 * Math.pow(2, Math.max(0, fallos)));
}
var _vigilando = false;
function vigilar() {
  if (_vigilando || typeof setInterval !== 'function') return;
  _vigilando = true;
  var ocupado = false, fallos = {};
  setInterval(async function () {
    if (ocupado || (typeof document !== 'undefined' && document.hidden)) return;
    var p = _plugin(); if (!p || !p.bluetoothInfo) return;
    ocupado = true;
    try {
      var info = await p.bluetoothInfo({});
      if (!info || info.sinPermiso || !info.habilitado) return;
      (info.vinculados || []).forEach(function (d) { if (d.conectado && d.nombre) recordarHabitual(d.nombre); });
      var ahora = Date.now();
      var falta = porReconectar(habituales(), info).filter(function (n) { return !(fallos[n] && fallos[n].hasta > ahora); });
      if (falta.length) {
        var n0 = falta[0];
        var r = await p.bluetoothConectar({ nombre: n0, silencioso: true });
        if (r && r.estado === 'conectado') delete fallos[n0];
        else { var f = (fallos[n0] ? fallos[n0].n : 0) + 1; fallos[n0] = { n: f, hasta: ahora + esperaTras(f) }; }
      }
    } catch (e) {} finally { ocupado = false; }
  }, 90000);
}
if (typeof window !== 'undefined') setTimeout(vigilar, 5000);

var API = { analizarCercanos: analizarCercanos, esperaTras: esperaTras, porReconectar: porReconectar, confiados: confiados, formatoBtConectar: formatoBtConectar, formatoWifiConectar: formatoWifiConectar, parsear: parsear, bloqueado: bloqueado, comandoNix: comandoNix, formatoWifi: formatoWifi,
            formatoBt: formatoBt, formatoTermux: formatoTermux, ejecutar: ejecutar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiHerr = API;

})();
