// Taller de ASAGI en el celular: ella CREA cosas nuevas para ti y quedan guardadas para abrirlas cuando quieras.
//   «crea una guía sobre baterías de sodio» · «hazme una checklist para mudarme» · «crea un quiz de trigonometría»
//   «mis creaciones» · «abre la creación 2» · «borra la creación 2»
// El cerebro solo escribe el CONTENIDO (en JSON); la página la arma ASAGI con su propia plantilla y se muestra en un marco
// aislado sin scripts (así nada de lo generado puede ejecutar código). No publica nada: todo vive en tu celular (máx. 20).
(function () {
'use strict';
var K = 'asagi-obras', MAX = 20;
var TIPOS = { guia: 'Guía', checklist: 'Checklist', quiz: 'Quiz' };
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.]+/g, '').replace(/\s+/g, ' ').trim(); }
function leer() { try { return JSON.parse(localStorage.getItem(K) || '[]') || []; } catch (e) { return []; } }
function guardar(l) { try { localStorage.setItem(K, JSON.stringify(l.slice(-MAX))); } catch (e) {} }
function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// PURO
function parsear(t) {
  var s = String(t || '').trim().replace(/[¿?¡!.]+$/, ''), n = norm(s), m;
  if (/^(?:mis creaciones|mis obras|que has creado|lo que creaste|mi taller)$/.test(n)) return { accion: 'lista' };
  if ((m = n.match(/^(?:abre|muestra|ver|mira) (?:la |mi )?(?:creacion|obra) (\d+)$/))) return { accion: 'abrir', cual: parseInt(m[1], 10) };
  if ((m = n.match(/^(?:borra|elimina|quita) (?:la |mi )?(?:creacion|obra) (\d+)$/))) return { accion: 'borrar', cual: parseInt(m[1], 10) };
  if ((m = s.match(/^(?:crea(?:me)?|haz(?:me)?|arma(?:me)?|prepara(?:me)?|genera(?:me)?)\s+(?:una?\s+)?(?:mini\s+)?(gu[ií]a|p[aá]gina|web|resumen visual|checklist|lista de pasos|lista de verificaci[oó]n|quiz|cuestionario|examen de pr[aá]ctica)\s+(?:r[aá]pid[ao]\s+)?(?:sobre|de|para|acerca de)\s+(.{3,100})$/i))) {
    var k = norm(m[1]), tipo = /check|lista/.test(k) ? 'checklist' : /quiz|cuestion|examen/.test(k) ? 'quiz' : 'guia';
    return { accion: 'crear', tipo: tipo, tema: m[2].trim() };
  }
  return null;
}
function promptCrear(tipo, tema) {
  var forma = tipo === 'checklist' ? '{"titulo":"…","intro":"1 frase","grupos":[{"nombre":"…","items":["paso concreto","…"]}]} (2 a 4 grupos, 3 a 6 items cada uno)'
    : tipo === 'quiz' ? '{"titulo":"…","intro":"1 frase","preguntas":[{"p":"pregunta","opciones":["a","b","c","d"],"correcta":0,"por":"por qué, 1 frase"}]} (5 a 7 preguntas, «correcta» es el índice 0-3)'
    : '{"titulo":"…","intro":"2 frases","secciones":[{"nombre":"…","texto":"2 a 4 frases claras","puntos":["dato o consejo","…"]}],"cierre":"1 frase con el siguiente paso"} (3 a 5 secciones)';
  return 'Crea para Daniel (Lima, Perú; estudiante que programa) una ' + TIPOS[tipo].toLowerCase() + ' sobre: «' + tema + '». En español, útil y concreta, sin relleno; no inventes cifras ni nombres propios dudosos.\n' +
    'Responde SOLO con JSON válido con esta forma exacta, sin texto antes ni después y sin markdown:\n' + forma;
}
// PURO: saca el JSON de la respuesta del cerebro y lo deja limpio y acotado (o null si no sirve).
function leerJSON(tipo, texto) {
  var s = String(texto || ''), a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) return null;
  var j; try { j = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  var T = function (x, n) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, n); }, L = function (x) { return Array.isArray(x) ? x : []; };
  var o = { tipo: tipo, titulo: T(j.titulo, 90), intro: T(j.intro, 300) };
  if (!o.titulo) return null;
  if (tipo === 'checklist') { o.grupos = L(j.grupos).slice(0, 5).map(function (g) { return { nombre: T(g && g.nombre, 60), items: L(g && g.items).slice(0, 8).map(function (i) { return T(i, 160); }).filter(Boolean) }; }).filter(function (g) { return g.items.length; }); if (!o.grupos.length) return null; }
  else if (tipo === 'quiz') { o.preguntas = L(j.preguntas).slice(0, 8).map(function (q) { var ops = L(q && q.opciones).slice(0, 4).map(function (x) { return T(x, 120); }).filter(Boolean), c = parseInt(q && q.correcta, 10); return { p: T(q && q.p, 220), opciones: ops, correcta: c >= 0 && c < ops.length ? c : 0, por: T(q && q.por, 220) }; }).filter(function (q) { return q.p && q.opciones.length >= 2; }); if (o.preguntas.length < 2) return null; }
  else { o.secciones = L(j.secciones).slice(0, 6).map(function (x) { return { nombre: T(x && x.nombre, 70), texto: T(x && x.texto, 700), puntos: L(x && x.puntos).slice(0, 6).map(function (p) { return T(p, 180); }).filter(Boolean) }; }).filter(function (x) { return x.nombre && (x.texto || x.puntos.length); }); o.cierre = T(j.cierre, 240); if (!o.secciones.length) return null; }
  return o;
}
// PURO: la página (plantilla propia, paleta fija, sin scripts; todo escapado).
function html(o) {
  var cuerpo = '';
  if (o.tipo === 'checklist') cuerpo = o.grupos.map(function (g) { return '<section><h2>' + esc(g.nombre) + '</h2>' + g.items.map(function (i) { return '<label class="it"><input type="checkbox"><span>' + esc(i) + '</span></label>'; }).join('') + '</section>'; }).join('');
  else if (o.tipo === 'quiz') cuerpo = o.preguntas.map(function (q, k) { return '<section><h2>' + (k + 1) + '. ' + esc(q.p) + '</h2>' + q.opciones.map(function (x, i) { return '<label class="it"><input type="radio" name="q' + k + '"><span>' + esc(x) + '</span></label>'; }).join('') + '<details><summary>Ver respuesta</summary><p><b>' + esc(q.opciones[q.correcta]) + '</b>' + (q.por ? ' — ' + esc(q.por) : '') + '</p></details></section>'; }).join('');
  else cuerpo = o.secciones.map(function (x) { return '<section><h2>' + esc(x.nombre) + '</h2>' + (x.texto ? '<p>' + esc(x.texto) + '</p>' : '') + (x.puntos.length ? '<ul>' + x.puntos.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '') + '</section>'; }).join('') + (o.cierre ? '<p class="cierre">' + esc(o.cierre) + '</p>' : '');
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(o.titulo) + '</title><style>' +
    'body{margin:0;background:#080408;color:#F0F0F8;font:16px/1.6 system-ui,sans-serif;padding:22px 18px 40px}' +
    '.k{color:#FFD700;font:600 11px/1 monospace;letter-spacing:3px;text-transform:uppercase}h1{font:800 30px/1.1 Georgia,serif;margin:10px 0 8px;text-wrap:balance}' +
    'h1:after{content:"";display:block;width:64px;height:4px;background:#DC143C;margin-top:14px}.in{color:rgba(240,240,248,.75);margin:14px 0 6px}' +
    'section{margin-top:22px;padding:16px;border:1px solid rgba(255,215,0,.22);border-radius:14px;background:rgba(220,20,60,.05)}h2{font:700 18px/1.3 Georgia,serif;color:#FFD700;margin:0 0 8px}' +
    'p{margin:0 0 8px}ul{margin:6px 0 0;padding-left:20px}li{margin:4px 0}li::marker{color:#DC143C}' +
    '.it{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid rgba(240,240,248,.08);min-height:44px}.it:first-of-type{border-top:0}' +
    '.it input{width:22px;height:22px;accent-color:#DC143C;flex:none;margin-top:2px}.it input:checked+span{opacity:.5;text-decoration:line-through}input[type=radio]:checked+span{opacity:1;text-decoration:none;color:#FFD700}' +
    'details{margin-top:10px}summary{color:#DC143C;font-weight:600;padding:8px 0;cursor:pointer}.cierre{margin-top:22px;padding-left:14px;border-left:4px solid #FFD700}' +
    '.pie{margin-top:30px;color:rgba(240,240,248,.45);font:12px monospace}</style></head><body><div class="k">' + esc(TIPOS[o.tipo]) + ' · hecha por ASAGI</div><h1>' + esc(o.titulo) + '</h1>' +
    (o.intro ? '<p class="in">' + esc(o.intro) + '</p>' : '') + cuerpo + '<p class="pie">La escribió una IA: confirma los datos importantes.</p></body></html>';
}
function abrir(o) {
  var v = document.getElementById('obra-visor'); if (v) v.remove();
  v = document.createElement('div'); v.id = 'obra-visor'; v.className = 'obra-visor'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', o.titulo);
  var x = document.createElement('button'); x.type = 'button'; x.className = 'obra-cerrar'; x.textContent = '✕ Cerrar'; x.addEventListener('click', function () { v.remove(); });
  var f = document.createElement('iframe'); f.setAttribute('sandbox', ''); f.setAttribute('title', o.titulo); f.srcdoc = html(o);
  v.appendChild(x); v.appendChild(f); document.body.appendChild(v); x.focus();
}
// Crea y guarda. Devuelve {ok, n, obra} o {ok:false, error}.
async function crear(tipo, tema) {
  var P = window._asagiPensar; if (!P) return { ok: false, error: 'Para crear necesito un cerebro conectado: «conecta gemini» (gratis).' };
  var o = null;
  for (var i = 0; i < 2 && !o; i++) { try { o = leerJSON(tipo, await P(promptCrear(tipo, tema) + (i ? '\nIMPORTANTE: solo el JSON, nada más.' : ''))); } catch (e) {} }
  if (!o) return { ok: false, error: 'No me salió bien esta vez (el cerebro no devolvió algo usable). Intenta de nuevo o con un tema más concreto.' };
  o.tema = String(tema).slice(0, 100); o.ts = Date.now();
  var l = leer(); l.push(o); guardar(l); l = leer();
  return { ok: true, n: l.length, obra: o };
}
async function ejecutar(c, decir) {
  var l = leer();
  if (c.accion === 'lista') { decir(l.length ? '🛠 Mis creaciones para ti:\n' + l.map(function (o, i) { return (i + 1) + '. ' + TIPOS[o.tipo] + ': ' + o.titulo; }).join('\n') + '\nToca: «abre la creación ' + l.length + '»' : '🛠 Aún no he creado nada. Prueba «crea una guía sobre …», «hazme una checklist para …» o «crea un quiz de …».'); return; }
  if (c.accion === 'abrir') { var o = l[c.cual - 1]; if (!o) { decir('🛠 No hay creación ' + c.cual + '. Di «mis creaciones».'); return; } abrir(o); decir('🛠 Abierta: ' + o.titulo); return; }
  if (c.accion === 'borrar') { var b = l[c.cual - 1]; if (!b) { decir('🛠 No hay creación ' + c.cual + '.'); return; } l.splice(c.cual - 1, 1); guardar(l); decir('🛠 Borrada: ' + b.titulo); return; }
  decir('🛠 Creo tu ' + TIPOS[c.tipo].toLowerCase() + ' sobre «' + c.tema + '»…');
  var r = await crear(c.tipo, c.tema);
  if (!r.ok) { decir('🛠 ' + r.error); return; }
  decir('🛠 Lista: «' + r.obra.titulo + '» (' + TIPOS[c.tipo].toLowerCase() + '). Toca para verla: «abre la creación ' + r.n + '»');
  if (window.AsagiEfectos) window.AsagiEfectos.grito('¡LISTO!');
}

var API = { parsear: parsear, promptCrear: promptCrear, leerJSON: leerJSON, html: html, abrir: abrir, crear: crear, ejecutar: ejecutar, leer: leer, TIPOS: TIPOS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiCreador = API;
})();
