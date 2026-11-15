// Rutinas que ASAGI descubre sola (idea de Voyager: el agente arma sus propias habilidades con lo que se repite).
// Anota (solo en el celular) qué comandos usas y a qué hora. Si dos o más los usas juntos (≤10 min), a la misma
// franja del día, en 3 días distintos, te propone juntarlos en una habilidad: «¿Lo junto en "buenos días"?».
// Solo comandos que ASAGI ya entiende sin riesgo (nada de pagar, enviar, borrar ni manos). Propone, nunca crea sola.
(function () {
'use strict';
var K = 'asagi-uso', KP = 'asagi-rutinas-propuestas', MAX = 300, DIAS = 3;
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;:"«»]+/g, '').replace(/\s+/g, ' ').trim(); }
// comandos que vale la pena encadenar (información del día); lo demás no se sugiere
var SEGUROS = /^(?:clima(?: .{2,30})?|va a llover(?: .{2,20})?|mis pendientes|que tengo hoy|resumen del dia|mi dia|que notificaciones tengo|cuanto gaste(?: hoy| esta semana)?|a cuanto esta el (?:dolar|euro)|mi lista de compras|pon musica|bateria|tactica del dia|dato curioso|noticias|cuanto falta para .{3,30})$/;
var PELIGRO = /(paga|transfi|yape|envia|manda|borra|elimina|publica|manos|compra |instala)/;

function franja(h) { return h < 5 ? 'noche' : h < 12 ? 'mañana' : h < 19 ? 'tarde' : 'noche'; }

// registro: [{c, t}] -> registro nuevo con este uso. PURO.
function anotar(reg, texto, ahoraMs) {
  var c = norm(texto);
  if (!SEGUROS.test(c) || PELIGRO.test(c)) return reg;
  var r = (reg || []).concat([{ c: c, t: ahoraMs }]);
  return r.length > MAX ? r.slice(-MAX) : r;
}

// Busca pares/tríos que se repiten juntos en la misma franja en ≥3 días. PURO.
function descubrir(reg, yaPropuestas) {
  var porDia = {};
  (reg || []).forEach(function (u) {
    var d = new Date(u.t), k = d.toISOString().slice(0, 10) + '|' + franja(d.getHours());
    (porDia[k] = porDia[k] || []).push(u);
  });
  var cuenta = {};
  Object.keys(porDia).forEach(function (k) {
    var us = porDia[k].sort(function (a, b) { return a.t - b.t; }), vistos = {};
    for (var i = 0; i < us.length; i++) {
      var grupo = [us[i].c];
      for (var j = i + 1; j < us.length && us[j].t - us[i].t <= 10 * 60e3; j++) if (grupo.indexOf(us[j].c) < 0) grupo.push(us[j].c);
      if (grupo.length < 2) continue;
      var clave = k.split('|')[1] + '|' + grupo.slice(0, 3).sort().join(' ; ');
      if (!vistos[clave]) { vistos[clave] = 1; cuenta[clave] = (cuenta[clave] || 0) + 1; }
    }
  });
  var mejor = null;
  Object.keys(cuenta).forEach(function (c) {
    if (cuenta[c] >= DIAS && !(yaPropuestas || {})[c] && (!mejor || cuenta[c] > cuenta[mejor] || (cuenta[c] === cuenta[mejor] && c.length > mejor.length))) mejor = c;
  });
  if (!mejor) return null;
  var p = mejor.split('|');
  var nombre = p[0] === 'mañana' ? 'mi mañana' : p[0] === 'noche' ? 'mi noche' : 'mi tarde';
  return { clave: mejor, franja: p[0], pasos: p[1].split(' ; '), nombre: nombre, dias: cuenta[mejor] };
}

function texto(s) {
  return '💡 Noté que en la ' + s.franja + ' sueles pedir «' + s.pasos.join('» y «') + '» juntos (' + s.dias + ' días). ' +
    '¿Lo junto en una habilidad? Toca «aprende ' + s.nombre + ': ' + s.pasos.join('; ') + '» y luego te basta decir «' + s.nombre + '».';
}

// Llamado tras cada mensaje de Daniel: anota y, como mucho una vez al día, propone.
function observar(textoUsuario, decir) {
  try {
    var reg = JSON.parse(localStorage.getItem(K) || '[]');
    var nuevo = anotar(reg, textoUsuario, Date.now());
    if (nuevo === reg) return null;
    localStorage.setItem(K, JSON.stringify(nuevo));
    var prop = JSON.parse(localStorage.getItem(KP) || '{}'), hoy = new Date().toISOString().slice(0, 10);
    if (prop._ultimo === hoy) return null;
    var H = window.AsagiHabilidades, s = descubrir(nuevo, prop);
    if (!s || (H && H.buscar && H.cargar && H.buscar(s.nombre, H.cargar()))) return null;
    prop[s.clave] = hoy; prop._ultimo = hoy; localStorage.setItem(KP, JSON.stringify(prop));
    setTimeout(function () { decir(texto(s)); }, 2500);   // después de la respuesta normal
    return s;
  } catch (e) { return null; }
}

var API = { anotar: anotar, descubrir: descubrir, texto: texto, observar: observar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiRutinas = API;
})();
