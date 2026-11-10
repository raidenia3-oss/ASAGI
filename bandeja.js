;(function () {
// ASAGI - Bandeja: segundo cerebro local (idea vista: INGEST + "no encaja" + ATENCION).
// Todo lo que entra (nota, link, mensaje de Discord) se archiva solo en un cubo.
// Si no esta seguro NO adivina: lo deja en "no encaja" para que tu decidas.
// Texto que intenta dar ordenes (borra, ejecuta, envia...) queda marcado y JAMAS se ejecuta.
// Logica PURA y testeable; la persistencia (localStorage) la hace app.js.
'use strict';

var CUBOS = {
  urgente:   ['hoy', 'manana', 'vence', 'vencimiento', 'urgente', 'factura', 'pago', 'pagar', 'deadline', 'plazo', 'cita', 'reunion', 'llamada', 'examen', 'entrega'],
  proyectos: ['proyecto', 'asagi', 'aria', 'bug', 'error', 'codigo', 'app', 'apk', 'repo', 'github', 'commit', 'modelo', 'kilo', 'discord', 'termux', 'nix'],
  gente:     ['llamar', 'contacto', 'telefono', 'cumpleanos', 'amigo', 'amiga', 'mama', 'papa', 'hermano', 'hermana', 'primo', 'profesor', 'jefe', 'whatsapp'],
  lectura:   ['leer', 'articulo', 'video', 'tutorial', 'instagram', 'youtube', 'newsletter', 'paper', 'blog', 'ver luego', 'guardar para']
};
var ORDENES = /\b(borra|elimina|ejecuta|formatea|envia|manda|transfiere|instala|desinstala|sudo|rm -rf|contrasena|clave|token)\b/;

function _norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Clasifica. Devuelve { cubo, confianza } o cubo 'no-encaja' si hay duda. PURO.
function clasificar(texto) {
  var n = _norm(texto);
  var pts = {}, k, i;
  for (k in CUBOS) {
    pts[k] = 0;
    for (i = 0; i < CUBOS[k].length; i++) {
      if (new RegExp('\\b' + CUBOS[k][i] + '\\b').test(n)) pts[k]++;
    }
  }
  if (/https?:\/\//.test(n)) pts.lectura++;
  var orden = Object.keys(pts).sort(function (a, b) { return pts[b] - pts[a]; });
  var mejor = orden[0], segundo = orden[1];
  if (pts[mejor] < 1 || pts[mejor] === pts[segundo]) return { cubo: 'no-encaja', confianza: 0 };
  return { cubo: mejor, confianza: pts[mejor] };
}

function _id() { return 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }

function vacio() { return { items: [] }; }

// Mete algo a la bandeja. origen = 'yo' | 'discord:usuario' | ... PURO (devuelve el item).
function ingestar(estado, texto, origen, ahora) {
  var t = String(texto || '').trim().slice(0, 600);
  if (!t) return null;
  var c = clasificar(t);
  var sospechoso = ORDENES.test(_norm(t)) && origen && origen !== 'yo';
  var item = {
    id: _id(), texto: t, origen: origen || 'yo', cuando: ahora || Date.now(),
    cubo: sospechoso ? 'sospechoso' : c.cubo, confianza: c.confianza, hecho: false
  };
  estado.items.push(item);
  if (estado.items.length > 400) estado.items.splice(0, estado.items.length - 400);
  return item;
}

function resolver(estado, id, cubo) {
  if (!CUBOS[cubo] && cubo !== 'no-encaja') return false;
  for (var i = 0; i < estado.items.length; i++) {
    if (estado.items[i].id === id) { estado.items[i].cubo = cubo; return true; }
  }
  return false;
}

function porCubo(estado) {
  var r = { urgente: [], proyectos: [], gente: [], lectura: [], 'no-encaja': [], sospechoso: [] };
  estado.items.forEach(function (it) { if (!it.hecho && r[it.cubo]) r[it.cubo].push(it); });
  return r;
}

// Top 5 de lo que importa: urgente primero, luego lo mas reciente de proyectos/gente. PURO.
function atencion(estado, ahora) {
  var peso = { urgente: 100, proyectos: 40, gente: 30, lectura: 5 };
  var t0 = ahora || Date.now();
  return estado.items
    .filter(function (it) { return !it.hecho && peso[it.cubo]; })
    .map(function (it) {
      var horas = Math.max(0, (t0 - it.cuando) / 3600000);
      return { it: it, p: peso[it.cubo] + it.confianza * 3 - Math.min(horas, 72) * 0.2 };
    })
    .sort(function (a, b) { return b.p - a.p; })
    .slice(0, 5)
    .map(function (x) { return x.it; });
}

// Entiende ordenes de chat. Devuelve { tipo, ... } o null. PURO.
function parsear(texto) {
  var t = String(texto || '').trim();
  var n = _norm(t);
  var m;
  if ((m = t.match(/^(?:guarda(?:lo)?|anota(?:lo)?|archiva(?:lo)?|mete(?:lo)?)?\s*(?:en|a) la bandeja\s*[:,-]?\s*(.+)$/i)) && m[1]) {
    return { tipo: 'guardar', texto: m[1].trim() };
  }
  if ((m = n.match(/^mueve (?:el )?(?:item |numero |n[oº] )?(\d+) a (urgente|proyectos|gente|lectura)$/))) {
    return { tipo: 'mover', n: parseInt(m[1], 10), cubo: m[2] };
  }
  if (/^(?:bandeja revisar|revisar (?:la )?bandeja|que no encaja)$/.test(n)) return { tipo: 'revisar' };
  if (/^(?:atencion|que (?:es )?(?:importante|me importa|urge)(?: hoy)?|prioridades|mis prioridades)\??$/.test(n)) return { tipo: 'atencion' };
  if (/^(?:bandeja|ver (?:la )?bandeja|resumen de (?:la )?bandeja)$/.test(n)) return { tipo: 'resumen' };
  return null;
}

var ETQ = { urgente: '⏰ Urgente', proyectos: '🛠 Proyectos', gente: '👤 Gente', lectura: '📖 Lectura', 'no-encaja': '❓ No encaja', sospechoso: '⚠ Sospechoso' };

function _lineas(items, conNum) {
  return items.map(function (it, i) { return (conNum ? (i + 1) + '. ' : '• ') + it.texto.slice(0, 90); }).join('\n');
}

// Texto para mostrar al usuario. PURO. 'lista' (revisar) numera para poder "mueve 2 a gente".
function formato(estado, tipo, ahora) {
  var g = porCubo(estado), k, out = [];
  if (tipo === 'atencion') {
    var a = atencion(estado, ahora);
    return a.length ? '🔔 Lo que importa ahora:\n' + _lineas(a, true) : 'Nada urgente en la bandeja.';
  }
  if (tipo === 'revisar') {
    var dudas = g['no-encaja'];
    var s = g.sospechoso.length ? '\n\n⚠ ' + g.sospechoso.length + ' mensaje(s) ajeno(s) pedian ordenes. No ejecute nada:\n' + _lineas(g.sospechoso) : '';
    return (dudas.length ? '❓ No supe donde van (dime "mueve 2 a gente"):\n' + _lineas(dudas, true) : 'Nada en duda.') + s;
  }
  for (k in ETQ) if (g[k] && g[k].length) out.push(ETQ[k] + ': ' + g[k].length);
  return out.length ? '📥 Bandeja — ' + out.join(' · ') : 'La bandeja esta vacia. Dime "guarda en la bandeja: ..."';
}

function serializar(e) { try { return JSON.stringify(e); } catch (x) { return '{"items":[]}'; } }
function deserializar(s) {
  try { var o = JSON.parse(s); if (o && Array.isArray(o.items)) return o; } catch (x) {}
  return vacio();
}

var API = {
  CUBOS: CUBOS, clasificar: clasificar, vacio: vacio, ingestar: ingestar, resolver: resolver,
  porCubo: porCubo, atencion: atencion, parsear: parsear, formato: formato,
  serializar: serializar, deserializar: deserializar
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiBandeja = API;
})();
