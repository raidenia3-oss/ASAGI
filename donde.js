// ¿Dónde lo dejé? (idea de Homebox: inventario de la casa, hecho mínimo y por chat). Sin internet ni cerebro.
//   «dejé las llaves en el cajón» · «guardé el pasaporte en la mochila azul» · «puse el cargador debajo de la cama»
//   «dónde dejé las llaves» · «dónde están mis llaves» · «mis cosas guardadas» · «ya encontré las llaves»
// Se guarda en el celular (localStorage 'asagi-donde'); nada sale del teléfono.
(function () {
'use strict';
var CLAVE = 'asagi-donde', MAX = 80;
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function limpio(t) { return String(t || '').replace(/[¿?¡!.;]+/g, ' ').replace(/\s+/g, ' ').trim(); }
var ART = /^(?:mis|mi|tus|tu|el|la|los|las|un|una|unos|unas)\s+/;
// «las llaves» -> «llave» (para comparar: sin artículos y sin plural simple)
function claveDe(cosa) {
  return norm(cosa).replace(ART, '').split(' ').map(function (w) {
    if (w.length <= 3 || !/s$/.test(w)) return w;
    return /[rlndz]es$/.test(w) ? w.slice(0, -2) : w.slice(0, -1);   // cargadores->cargador, llaves->llave
  }).join(' ');
}
var VERBO = '(?:deje|guarde|puse|meti|escondi|coloque|olvide)';
var PREP = '(?:en|dentro de|adentro de|debajo de|abajo de|bajo|encima de|sobre|detras de|atras de|al lado de|junto a|cerca de|donde)';
// cosas que no son «objetos guardados» (alarmas, música, etc.)
var NO_COSA = /^(?:a |al |de |que |la alarma|una alarma|alarma|el temporizador|musica|la musica|un video|el video|mi estado|el wifi|el bluetooth|la linterna|atencion|cuidado)/;

// Texto original (con tildes) que corresponde a un trozo del normalizado; si no se puede alinear, el normalizado.
function orig(t, parte) {
  var o = limpio(t), n = norm(o), i = n.indexOf(parte);
  return i >= 0 && n.length === o.length ? o.substr(i, parte.length) : parte;
}

// PURO: entiende la frase o devuelve null.
function parsear(t) {
  var n = norm(t).replace(/^(?:oye |asagi |recuerda que |anota que |ojo |ya )+/, ''), m;
  if (/^(?:mis cosas guardadas|que cosas guarde|donde deje mis cosas|donde estan mis cosas|lista de (?:mis )?cosas guardadas|mis cosas)$/.test(n)) return { accion: 'lista' };
  if ((m = n.match(/^(?:ya )?(?:encontre|halle|aparecio|aparecieron) (.{2,60})$/))) return { accion: 'encontre', cosa: orig(t, m[1]) };
  if ((m = n.match(/^olvida donde (?:deje|guarde|puse) (.{2,60})$/))) return { accion: 'encontre', cosa: orig(t, m[1]) };
  if ((m = n.match(new RegExp('^(?:en )?donde (?:' + VERBO.slice(3, -1) + ') (.{2,60})$')))) return { accion: 'buscar', cosa: orig(t, m[1]), seguro: /^(?:en )?donde (?:deje|meti|escondi|coloque|olvide)\b/.test(n) };
  if ((m = n.match(/^(?:en )?donde (?:esta|estan|quedo|quedaron) ((?:mi|mis|el|la|los|las) .{2,60})$/))) return { accion: 'buscar', cosa: orig(t, m[1]), seguro: /^(?:en )?donde \S+ mis? /.test(n) };
  if ((m = n.match(new RegExp('^' + VERBO + ' (.{2,60}?) (' + PREP + ' .{2,80})$')))) {
    if (NO_COSA.test(m[1]) || /^(?:donde)/.test(m[1])) return null;
    return { accion: 'guardar', cosa: orig(t, m[1]), lugar: orig(t, m[2]) };
  }
  return null;
}

function buscarEn(lista, cosa) {
  var k = claveDe(cosa); if (!k) return null;
  var exacto = lista.filter(function (x) { return x.clave === k; })[0];
  if (exacto) return exacto;
  var ws = k.split(' ').filter(function (w) { return w.length > 2; });
  var mejor = null, pts = 0;
  lista.forEach(function (x) { var p = ws.filter(function (w) { return (' ' + x.clave + ' ').indexOf(' ' + w + ' ') >= 0; }).length; if (p > pts) { pts = p; mejor = x; } });
  return pts > 0 && pts >= Math.ceil(ws.length / 2) ? mejor : null;
}
function cuando(ts, ahora) {
  var d = new Date(ts), h = d.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit', hour12: true });
  var dias = Math.round((new Date(ahora).setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 864e5);
  return dias === 0 ? 'hoy ' + h : dias === 1 ? 'ayer ' + h : 'el ' + d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' });
}
function mayus(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// PURO: aplica la orden a la lista. Devuelve { texto, lista } o null (no lo sé: que lo intente otro, p. ej. «dónde anoté…»).
function responder(c, lista, ahora) {
  lista = (lista || []).slice(); ahora = ahora || Date.now();
  if (c.accion === 'guardar') {
    var k = claveDe(c.cosa);
    lista = lista.filter(function (x) { return x.clave !== k; });
    lista.unshift({ cosa: c.cosa, clave: k, lugar: c.lugar, ts: ahora });
    lista = lista.slice(0, MAX);
    return { lista: lista, texto: '📍 Anotado: ' + c.cosa + ' → ' + c.lugar + '.\nSi luego no lo encuentras, pregúntame «dónde dejé ' + c.cosa + '».' };
  }
  if (c.accion === 'buscar') {
    var x = buscarEn(lista, c.cosa);
    if (x) return { lista: lista, texto: '📍 ' + mayus(x.cosa) + ': ' + x.lugar + ' (me lo dijiste ' + cuando(x.ts, ahora) + ').' };
    if (!c.seguro) return null;
    return { lista: lista, texto: '📍 No me dijiste dónde quedó «' + c.cosa + '». La próxima vez dime, por ejemplo, «dejé ' + c.cosa + ' en el cajón» y te lo recuerdo.' };
  }
  if (c.accion === 'encontre') {
    var y = buscarEn(lista, c.cosa);
    if (!y) return null;   // «ya encontré trabajo»: no era algo guardado aquí
    lista = lista.filter(function (z) { return z !== y; });
    return { lista: lista, texto: '🙌 ¡Bien! Borré «' + y.cosa + '» de tus cosas guardadas.' };
  }
  if (c.accion === 'lista') {
    if (!lista.length) return { lista: lista, texto: '📍 Aún no me dijiste dónde guardas nada. Prueba: «dejé las llaves en el cajón».' };
    return { lista: lista, texto: '📍 Tus cosas guardadas (' + lista.length + '):\n' + lista.slice(0, 20).map(function (z) { return '• ' + mayus(z.cosa) + ': ' + z.lugar; }).join('\n') +
      (lista.length > 20 ? '\n… y ' + (lista.length - 20) + ' más.' : '') + '\nSi algo aparece: «ya encontré …».' };
  }
  return null;
}

// Con el celular: lee/guarda en localStorage.
function leer() { try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch (e) { return []; } }
function hacer(c) {
  var r = responder(c, leer(), Date.now()); if (!r) return null;
  try { localStorage.setItem(CLAVE, JSON.stringify(r.lista)); } catch (e) {}
  return r.texto;
}

var API = { parsear: parsear, responder: responder, hacer: hacer, claveDe: claveDe };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiDonde = API;
})();
