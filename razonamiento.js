;(function () {
// ASAGI - Razonamiento (robado de ARIA: planificador coarse-to-fine + certeza no-inventar).
//
// Da a Asagi la forma de PENSAR de ARIA, sin peso:
//   - plan()        : decide si una pregunta es simple (respuesta directa) o compleja
//                     (boceto -> detalle), para no tirar un muro de texto.
//   - necesitaDatos(): detecta si la pregunta pide datos FRESCOS/reales (hoy, precio,
//                     ultimo, quien es...) -> conviene escalar a la nube o a web_api.
//   - certezaGuia() : recordatorio anti-invento para el prompt (si no sabes, dilo).
//
// Todo PURO y testeable.

'use strict';

const _COMPLEJO = ['explica', 'disena', 'compara', 'analiza', 'por que', 'porque',
                   'como funciona', 'paso a paso', 'arquitectura', 'codigo', 'script',
                   'algoritmo', 'estrategia', 'plan', 'resume', 'ventajas', 'diferencia'];

const _FRESCO = ['hoy', 'ahora', 'ultimo', 'ultima', 'reciente', 'actual', 'precio',
                 'cuanto cuesta', 'noticia', 'noticias', 'clima', 'tiempo', 'quien es',
                 'quien gano', 'resultado', 'cotiza', 'version mas nueva', '2026', '2027'];

function _tiene(texto, lista) {
  const t = (texto || '').toLowerCase();
  return lista.some((k) => t.includes(k));
}

// Complejidad 0..1 (largo + senales). Pura.
function complejidad(pregunta) {
  const t = (pregunta || '').toLowerCase().trim();
  if (!t) return 0;
  let s = 0;
  s += Math.min(0.5, t.split(/\s+/).length / 40);
  if (_tiene(t, _COMPLEJO)) s += 0.4;
  if ((t.match(/\?/g) || []).length >= 2) s += 0.15;
  if (/```|\bfunction\b|\bdef\b/.test(pregunta || '')) s += 0.2;
  return Math.max(0, Math.min(1, s));
}

// Plan de respuesta. Pura. Devuelve {tipo, pasos}.
//   simple  -> responde directo y breve.
//   complejo-> primero un boceto (idea general), luego el detalle.
function plan(pregunta, umbral = 0.45) {
  const c = complejidad(pregunta);
  if (c < umbral) {
    return { tipo: 'simple', complejidad: +c.toFixed(2),
             pasos: ['Responde directo y breve.'] };
  }
  return { tipo: 'complejo', complejidad: +c.toFixed(2),
           pasos: ['Da primero un boceto: la idea general en 1-2 frases.',
                   'Luego el detalle, en pasos que se sientan obviamente ciertos.',
                   'Cierra con el siguiente paso practico, si lo hay.'] };
}

// ¿La pregunta necesita datos frescos/reales? -> conviene escalar/buscar. Pura.
function necesitaDatos(pregunta) {
  return _tiene(pregunta, _FRESCO);
}

// Recordatorio anti-invento para inyectar en el prompt. Puro.
function certezaGuia(pregunta) {
  if (necesitaDatos(pregunta)) {
    return 'Esto pide datos actuales: si no los tienes con certeza, dilo y sugiere buscarlos (no inventes cifras, fechas ni nombres).';
  }
  return 'Si algo no lo sabes con certeza, dilo claramente en vez de inventar.';
}

// Sugerencia de backend para el router, segun el razonamiento. Pura.
//   -> 'local' | 'gemini' | 'remoto'
function sugerirBackend(pregunta, { online = false, cupo = 0, atria = false } = {}) {
  if (!online) return 'local';
  const c = complejidad(pregunta);
  if (c >= 0.7 && atria) return 'remoto';              // lo muy dificil -> Atria
  if ((c >= 0.45 || necesitaDatos(pregunta)) && cupo > 0) return 'gemini';
  return 'local';
}

const API = { complejidad, plan, necesitaDatos, certezaGuia, sugerirBackend };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiRazon = API;

})();
