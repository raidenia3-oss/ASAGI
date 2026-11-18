// Aprender de mis errores (reflexión, como los agentes que guardan «lecciones» tras fallar):
//   Daniel corrige → «no, es …» · «te equivocaste, …» · «eso está mal: …» · «la respuesta correcta es …»
//   ASAGI guarda la lección (qué preguntó, qué dijo mal, la corrección) y la tiene presente la próxima vez que salga el tema.
//   «qué aprendiste de tus errores» · «olvida la lección 2» · «olvida tus lecciones»
// Solo en el celular (máx. 80). Las lecciones vienen de DANIEL; nunca de páginas ni mensajes.
(function () {
'use strict';
var K = 'asagi-lecciones', MAX = 80;
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!]+/g, '').replace(/\s+/g, ' ').trim(); }
function pal(t) { return norm(t).split(/[^a-z0-9ñ]+/).filter(function (w) { return w.length > 3; }); }
function leer() { try { return JSON.parse(localStorage.getItem(K) || '[]') || []; } catch (e) { return []; } }
function guardar(l) { try { localStorage.setItem(K, JSON.stringify(l.slice(-MAX))); } catch (e) {} }

// PURO: ¿es una corrección a lo que ASAGI acaba de decir?
function parsear(t) {
  var s = String(t || '').trim(), n = norm(s), m;
  if (/^(?:que aprendiste de tus errores|tus lecciones|mis correcciones|que te he corregido|lecciones)$/.test(n)) return { accion: 'lista' };
  if ((m = n.match(/^olvida (?:la )?leccion (\d+)$/))) return { accion: 'olvidar', cual: parseInt(m[1], 10) };
  if (/^olvida (?:todas )?(?:tus|las) lecciones$/.test(n)) return { accion: 'olvidarTodo' };
  if ((m = s.match(/^(?:no[,.]\s+(?:es|era|son|eran|se dice|se llama|queda|est[aá])\s+|te equivocaste[,.:]?\s*|est[aá]s? equivocad[ao][,.:]?\s*|eso est[aá] mal[,.:]?\s*|incorrecto[,.:]?\s*|la respuesta correcta es\s+|lo correcto es\s+|te corrijo[,.:]?\s*|corrección[,.:]?\s*)(.{1,300})$/i))) {
    var cor = /^no[,.]\s+(es|era|son|eran|se dice|se llama|queda|est[aá])/i.test(s) ? s.replace(/^no[,.]\s+/i, '') : m[1];
    return { accion: 'corregir', correccion: cor.trim() };
  }
  return null;
}
// PURO: lecciones que tocan esta pregunta (por palabras en común con la pregunta original o la corrección).
function relevantes(lista, pregunta, k) {
  var q = pal(pregunta); if (!q.length) return [];
  return lista.map(function (l) {
    var w = pal(l.pregunta + ' ' + l.correccion), c = 0; q.forEach(function (x) { if (w.indexOf(x) >= 0) c++; });
    return [c / Math.sqrt(q.length), l];
  }).filter(function (x) { return x[0] >= 0.5; }).sort(function (a, b) { return b[0] - a[0]; }).slice(0, k || 3).map(function (x) { return x[1]; });
}
function para(pregunta) { return relevantes(leer(), pregunta, 3).map(function (l) { return 'Sobre «' + l.pregunta.slice(0, 80) + '»: ' + l.correccion; }); }

// ultimos = {pregunta, respuesta} de la charla (lo arma app.js)
function ejecutar(c, decir, ultimos) {
  var l = leer();
  if (c.accion === 'lista') { decir(l.length ? '📝 Lo que aprendí de tus correcciones (' + l.length + '):\n' + l.slice(-12).map(function (x, i, a) { return (l.length - a.length + i + 1) + '. ' + x.correccion.slice(0, 110) + (x.pregunta ? ' (cuando preguntaste «' + x.pregunta.slice(0, 40) + '»)' : ''); }).join('\n') + '\n«olvida la lección N» para quitar una.' : '📝 Aún no me has corregido nada. Si me equivoco, dime «no, es …» y lo aprendo.'); return true; }
  if (c.accion === 'olvidarTodo') { guardar([]); decir('📝 Listo, olvidé mis lecciones.'); return true; }
  if (c.accion === 'olvidar') { var x = l[c.cual - 1]; if (!x) { decir('📝 No hay lección ' + c.cual + '.'); return true; } l.splice(c.cual - 1, 1); guardar(l); decir('📝 Olvidada: ' + x.correccion.slice(0, 80)); return true; }
  if (!ultimos || !ultimos.respuesta) return false;                  // no hay nada mío que corregir: que siga el flujo normal
  var E = typeof window !== 'undefined' && window.AsagiEscudo, cor = c.correccion.slice(0, 300);
  if (E && E.neutralizar(cor).intentos) return false;
  l = l.filter(function (y) { return norm(y.pregunta) !== norm(ultimos.pregunta || ''); });
  l.push({ pregunta: String(ultimos.pregunta || '').slice(0, 160), mal: String(ultimos.respuesta).slice(0, 160), correccion: cor, ts: Date.now() });
  guardar(l);
  decir('📝 Gracias por corregirme. Lo anoto para no repetirlo: ' + cor.slice(0, 140) + (cor.length > 140 ? '…' : ''));
  return true;
}

var API = { parsear: parsear, relevantes: relevantes, para: para, ejecutar: ejecutar, leer: leer };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiAprende = API;
})();
