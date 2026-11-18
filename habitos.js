// Hábitos con racha y «fuerza», sin internet ni cerebro (idea de Loop Habit Tracker, iSoron/uhabits).
//   «nuevo hábito leer» · «marca leer» / «ya hice ejercicio» / «hoy hice leer» · «mis hábitos»
//   «no hice leer» (quita la marca de hoy) · «borra el hábito leer» · «recupera el hábito leer»
// La «fuerza» es la de Loop: media que sube con cada día cumplido y baja despacio si fallas un día
// (fallar una vez no te deja en cero como una racha). Se guarda en el celular (localStorage 'asagi-habitos').
(function () {
'use strict';
var CLAVE = 'asagi-habitos', PAPELERA = 'asagi-habitos-borrados', MAX = 20, DIAS_GUARDA = 400;
var MULT = Math.pow(0.5, 1 / 13); // Loop: multiplicador diario para frecuencia 1 vez al día

function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;:]+/g, '').replace(/\s+/g, ' ').trim(); }
function dia(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function sumar(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function deDia(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
function limpio(t) { return String(t || '').replace(/[¿?¡!.]+/g, '').replace(/^\s*(?:de|el|la)\s+/i, '').replace(/\s+/g, ' ').trim(); }
function mayus(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
// El texto original con tildes para la parte que coincide en el normalizado.
function orig(t, parteNorm) {
  var o = String(t || '').replace(/[¿?¡!.,;:]+/g, '').replace(/\s+/g, ' ').trim(), n = norm(o), i = n.indexOf(parteNorm);
  return i >= 0 && n.length === o.length ? o.substr(i, parteNorm.length) : parteNorm;
}
function busca(lista, nombre) {
  var k = norm(limpio(nombre)); if (!k) return -1;
  var i = lista.findIndex(function (h) { return norm(h.nombre) === k; });
  if (i >= 0) return i;
  return lista.findIndex(function (h) { var j = norm(h.nombre); return k.length >= 3 && j.length >= 3 && (j.indexOf(k) >= 0 || k.indexOf(j) >= 0); });
}

// PURO: entiende la frase o devuelve null. `nombres` = hábitos que ya existen (para «ya hice …» sin decir «hábito»).
function parsear(t, nombres) {
  var n = norm(t), m;
  nombres = Array.isArray(nombres) ? nombres : [];
  var existe = function (x) { return busca(nombres.map(function (s) { return { nombre: s }; }), x) >= 0; };
  if (/^(?:mis habitos|habitos|ver (?:mis )?habitos|como van mis habitos|como voy con mis habitos|mis rachas)$/.test(n)) return { tipo: 'ver' };
  if ((m = n.match(/^(?:nuevo habito|crea(?:r)? (?:un |el )?habito|agrega(?:r)? (?:un |el )?habito|empieza (?:un |el )?habito|quiero (?:crear )?(?:el |un )?habito)(?: de| para)? (.{2,40})$/))) return { tipo: 'crear', nombre: limpio(orig(t, m[1])) };
  if ((m = n.match(/^(?:borra|elimina|quita) (?:el |mi )?habito(?: de)? (.{2,40})$/))) return { tipo: 'borrar', nombre: limpio(orig(t, m[1])) };
  if ((m = n.match(/^(?:recupera|restaura) (?:el |mi )?habito(?: de)? (.{2,40})$/))) return { tipo: 'recuperar', nombre: limpio(orig(t, m[1])) };
  if ((m = n.match(/^(?:desmarca|no hice|hoy no hice) (?:el |mi )?habito(?: de)? (.{2,40})$/))) return { tipo: 'desmarcar', nombre: limpio(orig(t, m[1])) };
  if ((m = n.match(/^(?:marca|cumpli|hice|ya hice|hoy hice) (?:el |mi )?habito(?: de)? (.{2,40})$|^habito (.{2,40}) (?:hecho|cumplido|listo)$/))) return { tipo: 'marcar', nombre: limpio(orig(t, m[1] || m[2])) };
  // sin la palabra «hábito»: solo si coincide con uno que ya existe (así no choca con «ya hice la tarea» de pendientes)
  if ((m = n.match(/^(?:desmarca|no hice|hoy no hice) (.{2,40})$/)) && existe(m[1])) return { tipo: 'desmarcar', nombre: limpio(orig(t, m[1])) };
  if ((m = n.match(/^(?:marca|cumpli|ya hice|hoy hice|hice) (.{2,40})$/)) && existe(m[1])) return { tipo: 'marcar', nombre: limpio(orig(t, m[1])) };
  return null;
}

// PURO: racha (días seguidos hasta hoy, o hasta ayer si hoy aún no marcas), fuerza 0-100 (Loop) y últimos 7 días.
function estado(h, ahora) {
  var hoy = dia(ahora), set = {};
  (h.dias || []).forEach(function (d) { set[d] = true; });
  var racha = 0, d = set[hoy] ? new Date(ahora) : sumar(ahora, -1);
  while (set[dia(d)] && racha < 1000) { racha++; d = sumar(d, -1); }
  var s = 0, ini = deDia(h.creado || hoy), x = ini, vueltas = 0;
  while (dia(x) <= hoy && vueltas < 2000) { s = s * MULT + (set[dia(x)] ? 1 - MULT : 0); x = sumar(x, 1); vueltas++; }
  var semana = '';
  for (var i = 6; i >= 0; i--) semana += set[dia(sumar(ahora, -i))] ? '●' : '○';
  return { hoy: !!set[hoy], racha: racha, fuerza: Math.round(s * 100), semana: semana };
}

function verTexto(lista, ahora) {
  if (!lista.length) return '📈 Aún no tienes hábitos. Crea uno: «nuevo hábito leer» o «nuevo hábito tomar agua».';
  var hechos = 0;
  var l = lista.map(function (h) {
    var e = estado(h, ahora); if (e.hoy) hechos++;
    return '• ' + h.nombre + (e.hoy ? ' ✓ hoy' : '') + '\n   ' + (e.racha ? '🔥 ' + e.racha + (e.racha === 1 ? ' día' : ' días') + ' · ' : '') + 'fuerza ' + e.fuerza + '% · ' + e.semana;
  });
  var pend = lista.filter(function (h) { return !estado(h, ahora).hoy; });
  return '📈 Tus hábitos (' + hechos + ' de ' + lista.length + ' hoy):\n' + l.join('\n') +
    '\n(los círculos son los últimos 7 días; el de la derecha es hoy)' +
    (pend.length ? '\nPara marcar: «marca ' + pend[0].nombre.toLowerCase() + '».' : '\n¡Todo cumplido hoy! 💪');
}

// PURO: aplica la orden. -> { lista, papelera, texto }
function aplicar(lista, papelera, c, ahora) {
  lista = (Array.isArray(lista) ? lista : []).map(function (h) { return { nombre: h.nombre, creado: h.creado, dias: (h.dias || []).slice() }; });
  papelera = (Array.isArray(papelera) ? papelera : []).slice();
  ahora = ahora || new Date();
  var hoy = dia(ahora), corte = dia(sumar(ahora, -DIAS_GUARDA));
  var r = function (texto) { return { lista: lista, papelera: papelera, texto: texto }; };
  if (c.tipo === 'ver') return r(verTexto(lista, ahora));
  var nombre = mayus(c.nombre || ''), i = busca(lista, nombre);
  if (c.tipo === 'crear') {
    if (!nombre || nombre.length > 40) return r('Dime el hábito en pocas palabras: «nuevo hábito leer 10 minutos».');
    if (i >= 0) return r('📈 Ya tienes el hábito «' + lista[i].nombre + '». Di «marca ' + lista[i].nombre.toLowerCase() + '» cuando lo cumplas.');
    if (lista.length >= MAX) return r('Ya tienes ' + MAX + ' hábitos: borra uno antes («borra el hábito …»).');
    lista.push({ nombre: nombre, creado: hoy, dias: [] });
    return r('📈 Nuevo hábito: «' + nombre + '». Cada día que lo cumplas di «marca ' + nombre.toLowerCase() + '» y te llevo la racha. «mis hábitos» para verlos.');
  }
  if (c.tipo === 'recuperar') {
    var j = busca(papelera, nombre);
    if (j < 0) return r('No encuentro «' + nombre + '» entre los hábitos borrados.');
    if (i >= 0) return r('«' + lista[i].nombre + '» ya está en tus hábitos.');
    lista.push(papelera.splice(j, 1)[0]);
    return r('♻ Recuperé «' + lista[lista.length - 1].nombre + '» con su racha.');
  }
  if (i < 0) return r('No tengo el hábito «' + nombre + '».' + (lista.length ? ' Tus hábitos: ' + lista.map(function (h) { return h.nombre; }).join(', ') + '.' : '') + ' Para crearlo: «nuevo hábito ' + nombre.toLowerCase() + '».');
  var h = lista[i];
  if (c.tipo === 'borrar') {
    papelera = papelera.filter(function (p) { return norm(p.nombre) !== norm(h.nombre); });
    papelera.push(lista.splice(i, 1)[0]); if (papelera.length > 10) papelera = papelera.slice(-10);
    return r('🗑 Borré el hábito «' + h.nombre + '». Si fue sin querer: «recupera el hábito ' + h.nombre.toLowerCase() + '».');
  }
  if (c.tipo === 'desmarcar') {
    if (h.dias.indexOf(hoy) < 0) return r('«' + h.nombre + '» no estaba marcado hoy.');
    h.dias = h.dias.filter(function (d) { return d !== hoy; });
    return r('↩ Quité la marca de hoy en «' + h.nombre + '».');
  }
  if (c.tipo === 'marcar') {
    var ya = h.dias.indexOf(hoy) >= 0;
    if (!ya) { h.dias.push(hoy); h.dias = h.dias.filter(function (d) { return d >= corte; }).sort(); }
    var e = estado(h, ahora);
    var anim = e.racha >= 30 ? ' ¡Legendario!' : e.racha >= 7 ? ' ¡Una semana o más, sigue así!' : e.racha >= 3 ? ' ¡Vas bien!' : '';
    return r((ya ? '✓ «' + h.nombre + '» ya estaba marcado hoy.' : '✅ «' + h.nombre + '» cumplido hoy.') +
      ' 🔥 Racha: ' + e.racha + (e.racha === 1 ? ' día' : ' días') + ' · fuerza ' + e.fuerza + '%.' + anim);
  }
  return r('');
}

function leerDe(k) { try { var l = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function guardarEn(k, l) { try { localStorage.setItem(k, JSON.stringify(l)); } catch (e) {} }
function nombres() { return leerDe(CLAVE).map(function (h) { return h.nombre; }); }
function entender(t) { return parsear(t, nombres()); }
function hacer(c, ahora) {
  var res = aplicar(leerDe(CLAVE), leerDe(PAPELERA), c, ahora);
  if (c.tipo !== 'ver') { guardarEn(CLAVE, res.lista); guardarEn(PAPELERA, res.papelera); }
  return res.texto;
}
// Para el resumen del día y el cerebro: hábitos que faltan hoy.
function faltanHoy(ahora) { ahora = ahora || new Date(); return leerDe(CLAVE).filter(function (h) { return !estado(h, ahora).hoy; }).map(function (h) { return h.nombre; }); }

var API = { parsear: parsear, entender: entender, aplicar: aplicar, estado: estado, hacer: hacer, faltanHoy: faltanHoy };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiHabitos = API;
})();
