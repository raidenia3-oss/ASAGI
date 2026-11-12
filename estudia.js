;(function () {
// ASAGI - Aprender sobre cualquier tema, desde el celular (sin la PC):
//   aprende sobre la revolución francesa     -> lee Wikipedia en español y guarda apuntes con fuente
//   aprende de física: <pegas un texto>       -> saca los apuntes de tu texto
//   qué sabes de <tema> · qué aprendiste       -> te muestra sus apuntes
//   pregúntame de <tema>                       -> te toma un repaso (y se acuerda de lo que fallaste)
// Lo aprendido entra a la memoria con su tema y fuente; después ASAGI lo usa al responder
// (y cuenta para su nivel: temas x4, recuerdos x2). Todo lo que decide es PURO.
'use strict';

function _n(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
var VACIAS = { el: 1, la: 1, los: 1, las: 1, de: 1, del: 1, y: 1, en: 1, un: 1, una: 1, que: 1, por: 1, con: 1, para: 1, sobre: 1, como: 1, al: 1, es: 1 };
function claves(t) { return (_n(t).match(/[a-z0-9ñ]{3,}/g) || []).filter(function (w) { return !VACIAS[w]; }); }

// Órdenes del chat. PURO.
function parsear(texto) {
  var t = String(texto || '').trim(), n = _n(t), m;
  if ((m = t.match(/^\s*(?:aprende|estudia|investiga y aprende|lee)\s+(?:sobre|acerca de|de)\s+(.{2,80}?)\s*:\s*([\s\S]{40,})$/i))) return { tipo: 'texto', tema: m[1].trim(), texto: m[2].trim() };
  if ((m = t.match(/^\s*(?:aprende|estudia)\s*:\s*([\s\S]{40,})$/i))) return { tipo: 'texto', tema: '', texto: m[1].trim() };
  if ((m = t.match(/^\s*(?:aprende|estudia|investiga y aprende)\s+(?:sobre|acerca de|de)\s+(.{2,80})$/i))) return { tipo: 'web', tema: m[1].trim().replace(/[?.!]+$/, '') };
  if ((m = n.match(/^(?:que|qué) (?:sabes|aprendiste) (?:de|sobre)\s+(.{2,80})\??$/))) return { tipo: 'saber', tema: t.match(/(?:de|sobre)\s+(.{2,80})$/i)[1].replace(/\?$/, '').trim() };
  if (/^(?:que|qué)\s+(?:aprendiste|has aprendido|temas sabes|sabes)\??$/.test(n) || /^mis temas$/.test(n)) return { tipo: 'temas' };
  if ((m = t.match(/^\s*(?:preguntame|pregúntame|tomame|tómame|hazme)\s+(?:un\s+)?(?:repaso|examen|preguntas?|quiz)?\s*(?:de|sobre)\s+(.{2,80})$/i))) return { tipo: 'quiz', tema: m[1].replace(/[?.!]+$/, '').trim() };
  return null;
}

// Frases que valen como apunte: definiciones, fechas, cifras, causas. PURO.
function puntuar(frase, tema, pos) {
  var f = frase.trim(), n = _n(f);
  if (f.length < 45 || f.length > 280) return 0;
  if (/^(vease|ver tambien|referencias|enlaces externos|bibliografia|notas)/.test(n)) return 0;
  var s = 0;
  if (/\b(es|son|fue|fueron|era|se define|consiste|significa|se denomina|se conoce como|se considera|marca|representa)\b/.test(n)) s += 2;
  if (/\b(1[0-9]{3}|20[0-9]{2}|siglo)\b/.test(n)) s += 2;
  if (/\d/.test(n)) s += 1;
  if (/\b(porque|debido a|causa|consecuencia|provoco|permitio|gracias a)\b/.test(n)) s += 1.5;
  var kt = claves(tema); kt.forEach(function (k) { if (n.indexOf(k) >= 0) s += 1.5; });
  s += Math.max(0, 2 - pos * 0.08);                  // lo primero de un artículo suele ser lo central
  return s;
}

function apuntes(texto, tema, max) {
  var limpio = String(texto || '').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ');
  var frases = limpio.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡0-9])/);
  var vistos = {};
  return frases.map(function (f, i) { return { f: f.trim(), s: puntuar(f, tema, i), i: i }; })
    .filter(function (x) { if (x.s < 2.5) return false; var k = _n(x.f).slice(0, 50); if (vistos[k]) return false; vistos[k] = 1; return true; })
    .sort(function (a, b) { return b.s - a.s; }).slice(0, max || 10)
    .sort(function (a, b) { return a.i - b.i; }).map(function (x) { return x.f; });
}

// Pregunta de repaso a partir de un apunte: tapa una fecha, cifra o nombre propio. PURO.
function preguntaDe(apunte) {
  var a = String(apunte || ''), resp = null, idx = -1;
  var m = a.match(/\b(1[0-9]{3}|20[0-9]{2})\b/) || a.match(/\b\d+(?:[.,]\d+)?\b/);
  if (m) { resp = m[0]; idx = m.index; }
  else {
    var r = /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{3,}(?:\s+(?:de\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*)/g, mm;
    while ((mm = r.exec(a))) { if (mm.index > 0) { resp = mm[1]; idx = mm.index; break; } }
  }
  if (!resp) return null;
  return { pregunta: a.slice(0, idx) + '_____' + a.slice(idx + resp.length), respuesta: resp };
}

function corregir(resp, esperada) {
  var a = _n(resp), b = _n(esperada);
  if (!a) return false;
  if (a === b || a.indexOf(b) >= 0) return true;
  var kb = claves(b); return kb.length > 0 && kb.every(function (k) { return a.indexOf(k) >= 0; });
}

// --- Wikipedia en español (permite pedidos desde la app: origin=*) ---
var API_WIKI = 'https://es.wikipedia.org/w/api.php?format=json&origin=*&';
async function deWikipedia(tema, fetchFn) {
  fetchFn = fetchFn || fetch;
  var s = await (await fetchFn(API_WIKI + 'action=query&list=search&srlimit=1&srsearch=' + encodeURIComponent(tema))).json();
  var hit = s && s.query && s.query.search && s.query.search[0];
  if (!hit) return null;
  var p = await (await fetchFn(API_WIKI + 'action=query&prop=extracts&explaintext=1&redirects=1&titles=' + encodeURIComponent(hit.title))).json();
  var pages = (p && p.query && p.query.pages) || {}, k = Object.keys(pages)[0];
  var texto = k ? (pages[k].extract || '') : '';
  return texto ? { titulo: hit.title, texto: texto.slice(0, 30000), url: 'https://es.wikipedia.org/wiki/' + encodeURIComponent(hit.title.replace(/ /g, '_')) } : null;
}

var API = { parsear: parsear, puntuar: puntuar, apuntes: apuntes, preguntaDe: preguntaDe, corregir: corregir, deWikipedia: deWikipedia, claves: claves, _n: _n };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiEstudia = API;
})();
