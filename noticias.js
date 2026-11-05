// ASAGI - Noticias (la "Vigia"). Port de noticias.py de ARIA: junta titulares del dia
// por RSS (fetch, saliente = Regla v2). Mezcla noticias + comunidad, dedup, cachea.
// Neutral: solo lista titulares con su fuente y link; no opina.
//
// parseFeed() es PURO (testeable con XML de ejemplo).

'use strict';

const FUENTES = [
  ['Google News', 'https://news.google.com/rss?hl=es-419&gl=PE&ceid=PE:es'],
  ['Reddit r/worldnews', 'https://www.reddit.com/r/worldnews/.rss'],
];

function _limpiar(t) {
  return (t || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
}

// Parsea RSS 2.0 (<item>) o Atom (<entry>). Puro -> lista de {titulo,url,fuente,fecha}.
function parseFeed(xml, fuente = '') {
  const out = [];
  const bloques = (xml || '').match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const b of bloques) {
    const tit = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(b);
    const titulo = _limpiar(tit ? tit[1] : '');
    if (!titulo) continue;
    let url = '';
    const linkHref = /<link[^>]*href=["']([^"']+)["']/i.exec(b);      // Atom
    const linkTag = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(b);          // RSS
    if (linkHref) url = linkHref[1];
    else if (linkTag) url = _limpiar(linkTag[1]);
    const fe = /<(pubDate|updated|published)[^>]*>([\s\S]*?)<\/\1>/i.exec(b);
    out.push({ titulo: titulo.slice(0, 200), url, fuente, fecha: fe ? _limpiar(fe[2]) : '' });
  }
  return out;
}

async function _descargar(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (ASAGI news)' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

// Recolecta de todas las fuentes, dedup. Impura. Nunca lanza.
async function obtener(fuentes = FUENTES, maximo = 20) {
  const todas = [];
  const vistos = new Set();
  const errores = [];
  for (const [nombre, url] of fuentes) {
    try {
      const xml = await _descargar(url);
      for (const it of parseFeed(xml, nombre)) {
        const clave = it.titulo.toLowerCase().slice(0, 80);
        if (!vistos.has(clave)) { vistos.add(clave); todas.push(it); }
      }
    } catch (e) {
      errores.push(nombre + ': ' + (e && e.message ? e.message : e));
    }
  }
  return {
    fecha: new Date().toISOString().slice(0, 16).replace('T', ' '),
    noticias: todas.slice(0, maximo), errores,
  };
}

function resumen(p) {
  const n = (p && p.noticias) || [];
  return n.length + ' titulares (' + ((p && p.fecha) || 'sin fecha') + ')';
}

const API = { FUENTES, parseFeed, obtener, resumen };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiNoticias = API;
