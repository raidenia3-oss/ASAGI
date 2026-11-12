;(function () {
// ASAGI - Pendientes: recordatorios/tareas locales (idea del artifact: OpenProject/
// AppFlowy como alternativa libre a Asana/Notion, pero aqui minimo y 100% local).
// Pensado para el bucle de voz: le dices "recuerdame comprar pan" y queda anotado.
//
// Logica PURA y testeable (crear, parsear, ordenar, alternar, serializar). La
// persistencia (localStorage) y la UI las hace app.js.

'use strict';

var PREFIJOS = [
  'recuerdame', 'recuerda que', 'recuerda', 'anota que', 'anota', 'apunta que',
  'apunta', 'pendiente:', 'pendiente', 'nota:', 'nota', 'tarea:', 'tarea',
  'tengo que', 'no olvides', 'acuerdate de', 'acuerdate'
];

function _norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Si 'n' (normalizado) empieza con el prefijo p respetando frontera de palabra,
// devuelve el índice donde termina el prefijo (para cortar el original); si no, -1.
function _finPrefijo(n, p) {
  if (n.indexOf(p) !== 0) return -1;
  if (n.length === p.length) return p.length;        // prefijo solo, sin resto
  var sig = n.charAt(p.length);
  if (p.charAt(p.length - 1) === ':' || sig === ' ' || sig === ':' || sig === ',') return p.length;
  return -1;                                          // "recuerda" dentro de "recuerdame" -> no
}

// Quita un prefijo de intencion ("recuerdame ...", "anota ...") si lo hay. PURO.
function parsearEntrada(texto) {
  var t = String(texto || '').trim();
  if (!t) return '';
  var n = _norm(t);
  for (var i = 0; i < PREFIJOS.length; i++) {
    var fin = _finPrefijo(n, PREFIJOS[i]);
    if (fin >= 0) {
      var resto = t.slice(fin).replace(/^[\s:,]+/, '');
      if (resto.trim()) return resto.trim();
    }
  }
  return t;
}

// ¿El texto empieza con una intención de recordatorio? PURO.
function esPendiente(texto) {
  var n = _norm(String(texto || '').trim());
  if (!n) return false;
  for (var i = 0; i < PREFIJOS.length; i++) {
    var fin = _finPrefijo(n, PREFIJOS[i]);
    if (fin >= 0 && n.slice(fin).replace(/^[\s:,]+/, '')) return true;
  }
  return false;
}

// --- Parseo de tiempo (conservador, español). Devuelve { limpio, cuando, etiqueta }.
// 'cuando' es timestamp ms o null. Solo frases claras; si duda, cuando=null. PURO.
function _dosDig(n) { return (n < 10 ? '0' : '') + n; }

function parsearTiempo(texto, ahora) {
  var base = (ahora instanceof Date) ? new Date(ahora.getTime()) : new Date(ahora || Date.now());
  var t = String(texto || '');
  var n = _norm(t);
  var d = new Date(base.getTime());
  var tieneDia = false, tieneHora = false;
  var quitar = [];                                   // fragmentos (regex) a borrar del texto

  // "en N minutos / horas"
  var mRel = n.match(/\ben\s+(\d{1,3})\s*(min(?:uto)?s?|h(?:ora)?s?)\b/);
  if (mRel) {
    var cant = parseInt(mRel[1], 10);
    if (/^h/.test(mRel[2])) d.setHours(d.getHours() + cant);
    else d.setMinutes(d.getMinutes() + cant);
    quitar.push(new RegExp('\\ben\\s+' + mRel[1] + '\\s*' + mRel[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'));
    return _res(t, quitar, d.getTime(), base);        // relativo ya es fecha+hora
  }

  // día: hoy / mañana / pasado mañana
  if (/\bpasado\s+manana\b/.test(n)) { d.setDate(d.getDate() + 2); tieneDia = true; quitar.push(/\bpasado\s+ma(?:ñ|n)ana\b/i); }
  else if (/\bmanana\b/.test(n)) { d.setDate(d.getDate() + 1); tieneDia = true; quitar.push(/\bma(?:ñ|n)ana\b/i); }
  else if (/\bhoy\b/.test(n)) { tieneDia = true; quitar.push(/\bhoy\b/i); }

  // hora: "a las 8", "a las 8:30", "a las 8 pm", "a las 20:30"
  var mH = n.match(/\ba\s+las?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|de\s+la\s+ma(?:ñ|n)ana|de\s+la\s+tarde|de\s+la\s+noche)?/);
  if (mH) {
    var h = parseInt(mH[1], 10);
    var min = mH[2] ? parseInt(mH[2], 10) : 0;
    var suf = mH[3] || '';
    if (/pm|tarde|noche/.test(suf) && h < 12) h += 12;
    if (/am|ma(ñ|n)ana/.test(suf) && h === 12) h = 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      d.setHours(h, min, 0, 0); tieneHora = true;
      quitar.push(/\ba\s+las?\s+\d{1,2}(?::\d{2})?\s*(am|pm|de\s+la\s+(ma(?:ñ|n)ana|tarde|noche))?/i);
    }
  }

  if (!tieneDia && !tieneHora) return { limpio: t.trim(), cuando: null, etiqueta: '' };
  if (tieneDia && !tieneHora) d.setHours(9, 0, 0, 0);               // día sin hora -> 9:00
  if (!tieneDia && tieneHora && d.getTime() <= base.getTime()) d.setDate(d.getDate() + 1); // hora ya pasada -> mañana
  return _res(t, quitar, d.getTime(), base);
}

function _res(t, quitar, cuando, base) {
  var limpio = t;
  for (var i = 0; i < quitar.length; i++) limpio = limpio.replace(quitar[i], ' ');
  limpio = limpio.replace(/\s+/g, ' ').replace(/\s+([,.])/g, '$1').trim();
  return { limpio: limpio, cuando: cuando, etiqueta: etiquetaCuando(cuando, base) };
}

// Etiqueta legible de un timestamp respecto a 'base'. PURO.
function etiquetaCuando(cuando, base) {
  if (!cuando) return '';
  var d = new Date(cuando);
  var b = (base instanceof Date) ? new Date(base.getTime()) : new Date(base || Date.now());
  var hhmm = (d.getHours() % 12 || 12) + ':' + _dosDig(d.getMinutes()) + (d.getHours() < 12 ? ' a. m.' : ' p. m.');
  var d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  var dias = Math.round((d0 - b0) / 86400000);
  if (dias === 0) return 'hoy ' + hhmm;
  if (dias === 1) return 'mañana ' + hhmm;
  if (dias === -1) return 'ayer ' + hhmm;
  var DMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return d.getDate() + ' ' + DMES[d.getMonth()] + ' ' + hhmm;
}

var _seq = 0;
function _id() {
  _seq += 1;
  return 'p' + Date.now().toString(36) + _seq.toString(36);
}

// Crea un pendiente a partir de texto (ya parseado o no). PURO (salvo id/fecha).
function nuevo(texto, ahora) {
  var limpio = parsearEntrada(texto);
  if (!limpio) return null;
  var msAhora = (ahora instanceof Date) ? ahora.getTime() : (ahora || Date.now());
  var tp = parsearTiempo(limpio, msAhora);
  return {
    id: _id(), texto: (tp.limpio || limpio), hecho: false, creado: msAhora,
    cuando: tp.cuando || null, etiqueta: tp.etiqueta || ''
  };
}

// Devuelve una lista NUEVA con el item agregado al frente. PURO.
function agregar(lista, texto, ahora) {
  var it = nuevo(texto, ahora);
  if (!it) return (lista || []).slice();
  return [it].concat(lista || []);
}

function alternar(lista, id) {
  return (lista || []).map(function (x) {
    return x.id === id
      ? { id: x.id, texto: x.texto, hecho: !x.hecho, creado: x.creado, cuando: x.cuando || null, etiqueta: x.etiqueta || '', avisado: !!x.avisado }
      : x;
  });
}

function borrar(lista, id) {
  return (lista || []).filter(function (x) { return x.id !== id; });
}

function limpiarHechos(lista) {
  return (lista || []).filter(function (x) { return !x.hecho; });
}

// Pendientes primero; con hora -> por lo más próximo; sin hora -> más nuevos
// arriba; los hechos al final. PURO (no muta).
function ordenar(lista) {
  return (lista || []).slice().sort(function (a, b) {
    if (!!a.hecho !== !!b.hecho) return a.hecho ? 1 : -1;
    var ca = a.cuando || 0, cb = b.cuando || 0;
    if (ca && cb) return ca - cb;                     // ambos con hora: antes el más próximo
    if (ca || cb) return ca ? -1 : 1;                 // con hora antes que sin hora
    return (b.creado || 0) - (a.creado || 0);
  });
}

function contarPendientes(lista) {
  return (lista || []).filter(function (x) { return !x.hecho; }).length;
}

// Serializa/valida para guardar o cargar de storage. PURO.
function serializar(lista) {
  try { return JSON.stringify(ordenar(lista)); } catch (e) { return '[]'; }
}
function deserializar(txt) {
  var arr;
  try { arr = JSON.parse(txt || '[]'); } catch (e) { return []; }
  if (!Array.isArray(arr)) return [];
  return arr.filter(function (x) {
    return x && typeof x.id === 'string' && typeof x.texto === 'string';
  }).map(function (x) {
    return {
      id: x.id, texto: x.texto, hecho: !!x.hecho, creado: Number(x.creado) || Date.now(),
      cuando: x.cuando ? Number(x.cuando) : null, etiqueta: x.etiqueta || '', avisado: !!x.avisado
    };
  });
}

// Pendientes cuya hora ya llego, sin hacer y sin avisar todavia. PURO.
function vencidos(lista, ahora) {
  var t = (ahora instanceof Date) ? ahora.getTime() : (ahora || Date.now());
  return (lista || []).filter(function (x) {
    return !x.hecho && x.cuando && x.cuando <= t && !x.avisado;
  });
}

// Marca uno como ya avisado (para no repetir el aviso). PURO.
function marcarAvisado(lista, id) {
  return (lista || []).map(function (x) {
    if (x.id !== id) return x;
    return { id: x.id, texto: x.texto, hecho: !!x.hecho, creado: x.creado,
             cuando: x.cuando || null, etiqueta: x.etiqueta || '', avisado: true };
  });
}

var API = {
  PREFIJOS: PREFIJOS, parsearEntrada: parsearEntrada, esPendiente: esPendiente,
  parsearTiempo: parsearTiempo, etiquetaCuando: etiquetaCuando, nuevo: nuevo, agregar: agregar,
  alternar: alternar, borrar: borrar, limpiarHechos: limpiarHechos, ordenar: ordenar,
  contarPendientes: contarPendientes, vencidos: vencidos, marcarAvisado: marcarAvisado,
  serializar: serializar, deserializar: deserializar
};
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiPendientes = API;

})();
