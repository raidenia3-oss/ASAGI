// Wikipedia en español SIN internet, guardada en la tarjeta SD (la arma ARIA en la PC y ASAGI se la trae por WiFi).
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
  if (!cli) return { ok: false, error: 'necesito a ARIA conectada por WiFi: ella baja y arma la Wikipedia en la PC' };
  var r = await cli.enviar({ t: 'wiki', accion: 'preparar' });
  return r && r.ok && r.resp ? r.resp : { ok: false, error: 'ARIA no respondió' };
}

// Trae la Wikipedia de ARIA por WiFi (reanuda si se corta) y la verifica con sha256.
var _copiando = false;
async function traer(avisar) {
  var cli = window._asagiLan, p = P();
  if (_copiando || !cli || !cli.bajarArchivo || !p || !p.wikiParte) return { ok: false, error: 'no disponible' };
  _copiando = true;
  try {
    var e = await estado(); if (e && e.wiki) return { ok: true, ya: true };
    var r = await cli.enviar({ t: 'wiki', accion: 'info' });
    var w = r && r.ok && r.resp && r.resp.wiki;
    if (!w || !w.en_pc || !w.sha256) return { ok: false, error: 'ARIA aún no la tiene lista' };
    for (var intento = 0; intento < 4; intento++) {
      var parte = (await p.wikiParte()).bytes || 0;
      if (parte > w.tam) { await p.wikiActivar({ ok: false }); parte = 0; }
      if (avisar) avisar('📚 Copiando la Wikipedia desde ARIA por WiFi (' + (w.tam / 1e9).toFixed(1) + ' GB' + (parte ? ', sigo desde ' + Math.round(parte * 100 / w.tam) + '%' : '') + ')…');
      var b = await cli.bajarArchivo({ t: 'wiki', accion: 'archivo', desde: parte });
      if (b && b.ok && b.total === w.tam) {
        if (b.sha256 !== w.sha256) { await p.wikiActivar({ ok: false }); return { ok: false, error: 'la copia llegó dañada; la borré' }; }
        await p.wikiActivar({ ok: true });
        return { ok: true };
      }
    }
    return { ok: false, error: 'se cortó varias veces; sigo la próxima vez' };
  } finally { _copiando = false; }
}

var API = { traer: traer, parsear: parsear, pregunta: pregunta, resumen: resumen, estado: estado, buscar: buscar, preparar: preparar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiWiki = API;
})();
