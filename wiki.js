// Wikipedia en español SIN internet, guardada en la tarjeta SD (la arma ARIA en la PC y la copia por USB).
// «wiki fotosíntesis», «qué es la fotosíntesis» (cuando no hay cerebro ni internet),
// «prepara wikipedia» (se lo pide a ARIA), «espacio» (memoria interna / SD).
// La búsqueda la hace el SQLite de Android: casi nada de RAM.
(function () {
'use strict';
function P() { var C = window.Capacitor && window.Capacitor.Plugins; return C && C.AsagiControl; }
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.]+/g, '').trim(); }

// PURO
function parsear(t) {
  var s = String(t || '').trim(), n = norm(s), m;
  if (/^(?:prepara|descarga|baja|instala|pasa)(?:me)? (?:la )?wikipedia(?: sin internet| al celular| a la sd)?$/.test(n)) return { accion: 'preparar' };
  if (/^(?:espacio|almacenamiento|cuanto espacio (?:tengo|queda|hay)|memoria (?:del celular|libre))$/.test(n)) return { accion: 'espacio' };
  if ((m = s.match(/^(?:wiki|wikipedia)\s*:?\s+(.{2,80})$/i))) return { accion: 'buscar', q: m[1].replace(/[¿?¡!.]+$/g, '').trim() };
  return null;
}
// «qué es X», «quién fue X», «qué son los X» -> X (para responder sin cerebro). PURO.
function pregunta(t) {
  var m = String(t || '').trim().replace(/[¿?¡!]+/g, '').match(/^(?:qu[eé]|qui[eé]n(?:es)?)\s+(?:es|son|era|eran|fue|fueron)\s+(?:(?:el|la|los|las|un|una)\s+)?(.{2,70})$/i);
  return m ? m[1].trim() : null;
}
// Recorta al primer párrafo útil. PURO.
function resumen(r, max) {
  max = max || 700;
  var t = String(r.texto || '').split('\n').filter(function (x) { return x.trim().length > 30; }).join('\n') || String(r.texto || '');
  return '📚 ' + r.titulo + '\n' + (t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t);
}

async function estado() { var p = P(); if (!p || !p.almacen) return null; try { return await p.almacen(); } catch (e) { return null; } }
async function buscar(q, n) {
  var p = P(); if (!p || !p.wikiBuscar) return [];
  try { var r = await p.wikiBuscar({ q: q, n: n || 3 }); return (r && r.resultados) || []; } catch (e) { return []; }
}
async function preparar() {
  var cli = window._asagiLan;
  if (!cli) return { ok: false, error: 'necesito a ARIA conectada (USB o WiFi): ella baja y arma la Wikipedia en la PC' };
  var r = await cli.enviar({ t: 'wiki', accion: 'preparar' });
  return r && r.ok && r.resp ? r.resp : { ok: false, error: 'ARIA no respondió' };
}

var API = { parsear: parsear, pregunta: pregunta, resumen: resumen, estado: estado, buscar: buscar, preparar: preparar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiWiki = API;
})();
