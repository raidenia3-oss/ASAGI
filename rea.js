// ASAGI - REA (Reverse Engineer Anything). Port de investigacion.py de ARIA.
//
// Le das un TEMA y FUENTES (texto que Asagi junto de la web via asagi-browser/web_api)
// y lo convierte en un PLAYBOOK accionable: resumen, hallazgos, que REPLICAR (tacticas),
// RIESGOS y fuentes. Asi Asagi no tira un muro de texto, sino un analisis util.
//
// Todo PURO y testeable con fuentes inyectadas. fuentes = [{titulo,url,texto}, ...]

'use strict';

const _ACCION = ['usa', 'crea', 'publica', 'ofrece', 'lanza', 'automatiza', 'optimiza',
                 'construye', 'aplica', 'implementa', 'prueba', 'mide', 'segmenta',
                 'reutiliza', 'integra', 'replica', 'enfoca', 'prioriza'];
const _RIESGO = ['riesgo', 'cuidado', 'problema', 'falla', 'error', 'evita', 'peligro',
                 'ban', 'penaliz', 'limit', 'costoso', 'dificil', 'advertencia', 'no '];

function _atomos(fuentes) {
  const out = [];
  for (const f of fuentes || []) {
    const texto = f.texto || '';
    for (const frase of texto.split(/(?<=[.!?])\s+/)) {
      const t = frase.trim();
      if (t.split(/\s+/).length >= 4) {
        out.push({ texto: t, fuente: f.titulo || f.url || '?' });
      }
    }
  }
  return out;
}

function _conceptos(fuentes, n = 8) {
  const texto = (fuentes || []).map((f) => f.texto || '').join(' ').toLowerCase();
  const pal = texto.match(/[a-záéíóúñ]{5,}/g) || [];
  const cuenta = {};
  for (const w of pal) cuenta[w] = (cuenta[w] || 0) + 1;
  return Object.entries(cuenta).sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
}

function _clasifica(atomos, palabras) {
  return atomos.filter((a) => palabras.some((p) => a.texto.toLowerCase().includes(p)));
}

// Convierte fuentes en un playbook estructurado. Puro.
function analizar(tema, fuentes) {
  const atomos = _atomos(fuentes);
  const replicar = _clasifica(atomos, _ACCION).slice(0, 8);
  const riesgos = _clasifica(atomos, _RIESGO).slice(0, 6);
  const usados = new Set(replicar.concat(riesgos));
  const hallazgos = atomos.filter((a) => !usados.has(a)).slice(0, 8);
  return {
    tema,
    resumen: atomos.length ? atomos[0].texto : '',
    conceptos: _conceptos(fuentes),
    hallazgos,
    que_replicar: replicar,
    riesgos,
    fuentes: (fuentes || []).map((f) => ({ titulo: f.titulo || '?', url: f.url || '' })),
    n_fuentes: (fuentes || []).length,
    n_atomos: atomos.length,
  };
}

// Renderiza el analisis como playbook Markdown. Puro.
function playbookMd(a) {
  const L = ['# Playbook: ' + (a.tema || ''), ''];
  if (a.resumen) L.push('> ' + a.resumen, '');
  if (a.conceptos && a.conceptos.length) L.push('**Temas clave:** ' + a.conceptos.join(', '), '');
  const bloque = (titulo, items) => {
    if (!items || !items.length) return;
    L.push('## ' + titulo);
    for (const it of items) L.push('- ' + it.texto + (it.fuente ? ' _(' + it.fuente + ')_' : ''));
    L.push('');
  };
  bloque('Hallazgos', a.hallazgos);
  bloque('Que replicar (tacticas)', a.que_replicar);
  bloque('Riesgos / cuidado', a.riesgos);
  if (a.fuentes && a.fuentes.length) {
    L.push('## Fuentes');
    for (const f of a.fuentes) L.push('- ' + (f.titulo || '') + ' ' + (f.url || ''));
  }
  return L.join('\n');
}

// Atajo: analiza + arma el playbook.
function investigar(tema, fuentes) {
  const an = analizar(tema, fuentes);
  an.playbook = playbookMd(an);
  return an;
}

const API = { analizar, playbookMd, investigar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiREA = API;
