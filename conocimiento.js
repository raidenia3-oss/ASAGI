;(function () {
// ASAGI - Ingestor de conocimiento: convierte lo que ASAGI "ve" (transcripciones de
// videos, artículos) en aprendizajes breves que se guardan en la memoria por tema.
// Como probamos: con 1 exposición basta (RAG), no hace falta "entrenar" el modelo.
// Pensado para finanzas/empresas, pero sirve para cualquier tema.
//
// TODO PURO y testeable. La UI (app.js) llama ingerir() y guarda cada item en Memoria.

'use strict';

// Señales de que una frase trae información útil de finanzas/empresas.
const CLAVES = [
  'accion', 'acciones', 'bolsa', 'mercado', 'dividendo', 'dividendos', 'ingresos', 'ganancia',
  'ganancias', 'perdida', 'perdidas', 'utilidad', 'utilidades', 'inversion', 'invertir', 'interes',
  'tasa', 'inflacion', 'pib', 'cripto', 'bitcoin', 'ethereum', 'dolar', 'euro', 'nasdaq', 'dow',
  'empresa', 'empresas', 'trimestre', 'balance', 'deuda', 'capital', 'valoracion', 'margen', 'flujo',
  'ipo', 'etf', 'bono', 'bonos', 'rendimiento', 'cartera', 'portafolio', 'riesgo', 'volatilidad',
  'alcista', 'bajista', 'reporte', 'earnings', 'revenue', 'guidance', 'per', 'ratio', 'capitalizacion',
  'crecimiento', 'recesion', 'fed', 'banco central', 'acuerdo', 'adquisicion', 'fusion', 'demanda',
];

function _norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Quita ruido típico de transcripciones: marcas de tiempo, "[Música]", espacios dobles.
function limpiar(texto) {
  return String(texto || '')
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')          // 0:12 / 1:02:33
    .replace(/\[[^\]]*\]/g, ' ')                        // [Música], [Aplausos]
    .replace(/\((música|aplausos|risas)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parte en frases por puntuación final o saltos.
function fragmentar(texto) {
  return limpiar(texto)
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f.length >= 25 && f.length <= 320);   // ni fragmentos ni párrafos enteros
}

// Puntúa qué tan informativa es una frase (finanzas). 0 = descartar.
function puntuarFrase(frase) {
  const t = _norm(frase);
  let p = 0;
  for (const k of CLAVES) { if (t.indexOf(k) !== -1) p += 3; }
  if (/\d+([.,]\d+)?\s?%/.test(frase)) p += 4;            // porcentajes
  if (/[$€]|s\/\.?|us\$|usd|pen\b/i.test(frase)) p += 3;  // monedas
  if (/\b\d{4}\b/.test(frase)) p += 1;                    // años
  if (/\b[A-Z]{2,5}\b/.test(frase)) p += 1;               // tickers tipo AAPL
  if (/\d/.test(frase)) p += 1;                           // cualquier número
  // penaliza frases vacías de contenido (muletillas)
  if (/\b(eh|este|o sea|bueno|entonces|ya saben|suscr[ií]b)/i.test(frase) && p <= 3) p -= 2;
  return p;
}

// Quita casi-duplicados (misma frase con pequeñas variaciones).
function _dedup(frases) {
  const vistos = [], out = [];
  for (const f of frases) {
    const clave = _norm(f).replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 8).join(' ');
    if (vistos.indexOf(clave) === -1) { vistos.push(clave); out.push(f); }
  }
  return out;
}

// Extrae las N frases más informativas (ordenadas por relevancia).
function extraer(texto, max = 8) {
  const frases = fragmentar(texto);
  const punt = frases.map((f) => ({ f: f, p: puntuarFrase(f) })).filter((x) => x.p > 0);
  punt.sort((a, b) => b.p - a.p);
  return _dedup(punt.map((x) => x.f)).slice(0, max);
}

// Ingiere un texto y devuelve items listos para guardar en Memoria.
// fuente: de dónde salió (canal/URL). fecha: YYYY-MM-DD (opcional).
// Cada item.texto se guarda con aprender(item.texto, item.tema, item.fuente).
function ingerir(texto, fuente, fecha, tema) {
  tema = tema || 'finanzas';
  const f = (fuente || 'desconocida').toString().slice(0, 80);
  const dia = fecha || new Date().toISOString().slice(0, 10);
  const claves = extraer(texto, 8);
  const items = claves.map((c) => ({
    texto: c.length > 300 ? c.slice(0, 297) + '…' : c,
    tema: tema,
    fuente: f + ' · ' + dia,
  }));
  return {
    items: items,
    cuenta: items.length,
    resumen: items.length
      ? 'Aprendí ' + items.length + ' punto(s) de ' + f + '.'
      : 'No encontré información relevante de ' + tema + ' en ese texto.',
  };
}

const API = { limpiar, fragmentar, puntuarFrase, extraer, ingerir, CLAVES };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiConocimiento = API;

})();
