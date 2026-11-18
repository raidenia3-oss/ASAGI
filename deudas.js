// Cuentas con amigos: quién te debe y a quién le debes (idea del «ledger» de ced2711/life-assistant, offline-first).
//   «le presté 20 soles a Juan» · «Ana me prestó 50» · «le debo 15 a Carlos» · «Juan me debe 10»
//   «Juan me pagó» / «Juan me pagó 5» · «le pagué a Ana» / «le devolví 20 a Ana» · «quién me debe» / «mis deudas» · «cuánto me debe Juan»
// Solo anota: no cobra, no envía mensajes ni toca ninguna app de pagos. Se guarda en el celular (localStorage 'asagi-deudas').
(function () {
'use strict';
var CLAVE = 'asagi-deudas';
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!]+/g, '').replace(/\s+/g, ' ').trim().replace(/\.$/, ''); }
function limpio(t) { return String(t || '').normalize('NFC').replace(/[¿?¡!]+/g, '').replace(/\s+/g, ' ').trim().replace(/\.$/, ''); }
// Nombre con sus tildes y mayúscula, tomado del texto original (norm no cambia el largo de un texto en NFC sin signos).
function nombreDe(t, parteNorm) {
  var o = limpio(t), n = norm(o), i = n.indexOf(parteNorm);
  var s = i >= 0 && n.length === o.length ? o.substr(i, parteNorm.length) : parteNorm;
  return s.replace(/^(?:el|la|mi) /i, '').replace(/(^|\s)(\S)/g, function (_, a, b) { return a + b.toUpperCase(); });
}
// «20», «20 soles», «S/ 20», «20.50», «20 lucas», «10 dólares», «$10»
var MONTO = '((?:s\\/ ?|\\$ ?)?\\d{1,7}(?:[.,]\\d{1,2})?(?: (?:soles?|sol|lucas?|dolares?|usd|cocos?))?)';
var NOM = "([a-zñ][a-zñ' ]{1,28}?)";
function monto(s) {
  var m = String(s || '').match(/(\d{1,7}(?:[.,]\d{1,2})?)/); if (!m) return null;
  return { v: Math.round(parseFloat(m[1].replace(',', '.')) * 100) / 100, mon: /dolar|usd|\$|coco/.test(s) ? 'US$' : 'S/' };
}
var NO_NOMBRE = /^(?:internet|la luz|el agua|el alquiler|la renta|el cable|la tarjeta|el banco|yape|plin)$/;

// PURO: entiende la frase o devuelve null. delta > 0 = te deben; < 0 = tú debes.
function parsear(t) {
  var n = norm(t), m, r = null;
  if (/^(?:quien(?:es)? me debe(?:n)?|a quien(?:es)? le debo|mis deudas|mis prestamos|cuentas con (?:mis )?amigos|quien me debe plata|quien me debe dinero)$/.test(n)) return { tipo: 'ver' };
  if ((m = n.match(new RegExp('^cuanto me debe ' + NOM + '$'))) || (m = n.match(new RegExp('^cuanto le debo a ' + NOM + '$')))) return { tipo: 'ver', quien: nombreDe(t, m[1]) };
  // Yo presté / alguien me debe
  if ((m = n.match(new RegExp('^(?:ya )?(?:le )?preste ' + MONTO + ' a ' + NOM + '$')))) r = { tipo: 'mover', a: m[2], m: m[1], signo: 1 };
  else if ((m = n.match(new RegExp('^(?:ya )?(?:le )?preste a ' + NOM + ' ' + MONTO + '$')))) r = { tipo: 'mover', a: m[1], m: m[2], signo: 1 };
  else if ((m = n.match(new RegExp('^' + NOM + ' me debe ' + MONTO + '$')))) r = { tipo: 'mover', a: m[1], m: m[2], signo: 1 };
  // Me prestaron / yo debo
  else if ((m = n.match(new RegExp('^' + NOM + ' me presto ' + MONTO + '$')))) r = { tipo: 'mover', a: m[1], m: m[2], signo: -1 };
  else if ((m = n.match(new RegExp('^me presto ' + NOM + ' ' + MONTO + '$')))) r = { tipo: 'mover', a: m[1], m: m[2], signo: -1 };
  else if ((m = n.match(new RegExp('^(?:le )?debo ' + MONTO + ' a ' + NOM + '$')))) r = { tipo: 'mover', a: m[2], m: m[1], signo: -1 };
  else if ((m = n.match(new RegExp('^le debo a ' + NOM + ' ' + MONTO + '$')))) r = { tipo: 'mover', a: m[1], m: m[2], signo: -1 };
  // Pagos (sin monto = todo)
  else if ((m = n.match(new RegExp('^(?:ya )?' + NOM + ' me (?:pago|devolvio)(?: ' + MONTO + ')?$')))) r = { tipo: 'pago', a: m[1], m: m[2], quien: 'otro' };
  else if ((m = n.match(new RegExp('^(?:ya )?le (?:pague|devolvi)(?: ' + MONTO + ')? a ' + NOM + '$')))) r = { tipo: 'pago', a: m[2], m: m[1], quien: 'yo' };
  else if ((m = n.match(new RegExp('^(?:ya )?le (?:pague|devolvi) a ' + NOM + ' ' + MONTO + '$')))) r = { tipo: 'pago', a: m[1], m: m[2], quien: 'yo' };
  if (!r) return null;
  var a = r.a.replace(/^(?:el|la|mi) /, '').trim();
  if (!a || NO_NOMBRE.test(r.a) || /^(?:yo|tu|el|ella|me|te|le|se|lo)$/.test(a)) return null;
  var mo = r.m ? monto(r.m) : null;
  if (r.m && (!mo || mo.v <= 0)) return null;
  return { tipo: r.tipo, quien: nombreDe(t, r.a), monto: mo, signo: r.signo, pagador: r.quien };
}

function dinero(v, mon) { var x = Math.abs(v); return (mon || 'S/') + ' ' + (x % 1 ? x.toFixed(2) : String(x)); }
function k(nombre) { return norm(nombre); }

// PURO: aplica la orden a { personas: { clave: { nombre, saldos: { 'S/': n } } } } y devuelve { datos, texto }.
function aplicar(datos, c) {
  datos = JSON.parse(JSON.stringify(datos && datos.personas ? datos : { personas: {} }));
  var P = datos.personas;
  function linea(p) {
    return Object.keys(p.saldos).filter(function (mo) { return Math.abs(p.saldos[mo]) >= 0.01; }).map(function (mo) {
      var s = p.saldos[mo]; return s > 0 ? p.nombre + ' te debe ' + dinero(s, mo) : 'Le debes ' + dinero(s, mo) + ' a ' + p.nombre;
    }).join(' · ');
  }
  if (c.tipo === 'mover') {
    var key = k(c.quien), p = P[key] || (P[key] = { nombre: c.quien, saldos: {} });
    var mo = c.monto.mon; p.saldos[mo] = Math.round(((p.saldos[mo] || 0) + c.signo * c.monto.v) * 100) / 100;
    var l = linea(p);
    return { datos: datos, texto: '🤝 Anotado. ' + (l || 'Con ' + p.nombre + ' quedan a mano.') + '.' };
  }
  if (c.tipo === 'pago') {
    var key2 = k(c.quien), q = P[key2];
    var esperado = c.pagador === 'otro' ? 1 : -1; // otro me paga: tenía saldo +; yo le pago: tenía saldo −
    var mon = c.monto ? c.monto.mon : (q && Object.keys(q.saldos).find(function (x) { return q.saldos[x] * esperado > 0; })) || 'S/';
    var antes = q ? (q.saldos[mon] || 0) : 0;
    if (!q || antes * esperado <= 0) return { datos: datos, texto: c.pagador === 'otro' ? '🤝 No tenía anotado que ' + c.quien + ' te debiera. Di «' + c.quien + ' me debe 20» para anotarlo.' : '🤝 No tenía anotado que le debieras a ' + c.quien + '.' };
    var pagado = c.monto ? c.monto.v : Math.abs(antes);
    q.saldos[mon] = Math.round((antes - esperado * pagado) * 100) / 100;
    var l2 = linea(q);
    if (!l2) delete P[key2];
    return { datos: datos, texto: '✅ ' + (c.pagador === 'otro' ? c.quien + ' te pagó ' : 'Le pagaste ') + dinero(pagado, mon) + (c.pagador === 'otro' ? '' : ' a ' + q.nombre) + '. ' + (l2 ? 'Queda: ' + l2 + '.' : '¡Quedan a mano!') };
  }
  // ver
  if (c.quien) { var p3 = P[k(c.quien)]; return { datos: datos, texto: p3 && linea(p3) ? '🤝 ' + linea(p3) + '.' : '🤝 Con ' + c.quien + ' están a mano.' }; }
  var me = [], yo = [], primero = '';
  Object.keys(P).forEach(function (x) {
    var p4 = P[x]; Object.keys(p4.saldos).forEach(function (mo2) { var s = p4.saldos[mo2]; if (s >= 0.01) { primero = primero || p4.nombre; me.push('• ' + p4.nombre + ': ' + dinero(s, mo2)); } else if (s <= -0.01) yo.push('• ' + p4.nombre + ': ' + dinero(s, mo2)); });
  });
  if (!me.length && !yo.length) return { datos: datos, texto: '🤝 Nadie te debe y no le debes a nadie. Para anotar: «le presté 20 soles a Juan» o «le debo 15 a Ana».' };
  return { datos: datos, texto: (me.length ? '🤝 Te deben:\n' + me.join('\n') : '🤝 Nadie te debe.') + '\n' + (yo.length ? 'Tú debes:\n' + yo.join('\n') : 'Tú no le debes a nadie.') + (primero ? '\nCuando te paguen: «' + primero + ' me pagó».' : '') };
}

function leer() { try { var d = JSON.parse(localStorage.getItem(CLAVE) || '{}'); return d && d.personas ? d : { personas: {} }; } catch (e) { return { personas: {} }; } }
function guardar(d) { try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch (e) {} }
function hacer(c) { var r = aplicar(leer(), c); if (c.tipo !== 'ver') guardar(r.datos); return r.texto; }
var API = { parsear: parsear, aplicar: aplicar, hacer: hacer };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiDeudas = API;
})();
