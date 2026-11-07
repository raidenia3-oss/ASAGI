;(function () {
// ASAGI - Criterio de foto: la "conciencia" de ASAGI sobre cómo se ve una buena foto.
// No es magia: ANALIZA la imagen (histograma real) y aplica correcciones fundamentadas
// en principios de fotografía, y EXPLICA qué hizo y por qué. Honesto.
//
// Lógica PURA y testeable. La UI (app.js) saca las stats del canvas y llama a analizar().

'use strict';

// Lo que ASAGI "sabe" de una buena foto/edición (principios, no opiniones al azar).
const PRINCIPIOS = [
  'Exposición equilibrada: ni quemada ni apagada; el tono medio cerca del centro.',
  'Blancos neutros: corrige dominantes de color (azulado o anaranjado) salvo que sea intención.',
  'Contraste para dar profundidad, sin aplastar sombras ni quemar luces.',
  'Color natural: realza sin sobresaturar (la piel y el cielo delatan el exceso).',
  'Encuadre: sujeto fuera del centro muerto (regla de tercios) y horizonte recto.',
  'Viñeta sutil para guiar la vista al sujeto, nunca un túnel oscuro.',
  'Menos es más: una edición buena no se nota, se siente.',
];

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function r2(v) { return Math.round(v * 100) / 100; }

// Analiza stats del histograma y devuelve ajustes (listos para CSS) + explicación.
// stats: { brillo, desv, rMean, gMean, bMean, sombra, alta }  (todo 0..1)
function analizar(stats) {
  const s = stats || {};
  const brillo = clamp(s.brillo != null ? s.brillo : 0.5, 0, 1);
  const desv = clamp(s.desv != null ? s.desv : 0.2, 0, 1);
  const rM = s.rMean != null ? s.rMean : 0.5, gM = s.gMean != null ? s.gMean : 0.5, bM = s.bMean != null ? s.bMean : 0.5;
  const sombra = clamp(s.sombra || 0, 0, 1), alta = clamp(s.alta || 0, 0, 1);
  const notas = [];
  const aj = { exposicion: 1, contraste: 1, saturacion: 1, calidez: 0, vineta: 0 };

  // 1) Exposición — objetivo tono medio ~0.48
  if (brillo < 0.42) { aj.exposicion = clamp(1 + (0.48 - brillo) * 1.1, 1, 1.5); notas.push('Estaba oscura: subí la exposición.'); }
  else if (brillo > 0.6) { aj.exposicion = clamp(1 - (brillo - 0.52) * 0.9, 0.6, 1); notas.push('Estaba clara: bajé la exposición.'); }

  // 2) Recortes — rescatar sombras tapadas / luces quemadas
  if (alta > 0.12 && aj.exposicion >= 1) { aj.exposicion = clamp(aj.exposicion - alta * 0.4, 0.75, 1.5); notas.push('Había luces quemadas: recuperé altas luces.'); }
  if (sombra > 0.28) { aj.exposicion = clamp(aj.exposicion + sombra * 0.2, 0.6, 1.5); notas.push('Las sombras estaban tapadas: las levanté un poco.'); }

  // 3) Contraste — objetivo desviación ~0.2
  if (desv < 0.15) { aj.contraste = clamp(1 + (0.19 - desv) * 1.6, 1, 1.45); notas.push('Se veía plana: le di contraste.'); }
  else if (desv > 0.3) { aj.contraste = clamp(1 - (desv - 0.3) * 0.8, 0.8, 1); notas.push('Tenía contraste de más: lo suavicé.'); }

  // 4) Balance de blancos — corrige dominante
  const calido = rM - bM;                 // >0 anaranjado, <0 azulado
  if (calido > 0.08) { aj.calidez = clamp(-(calido - 0.04) * 1.4, -0.5, 0); notas.push('Tenía dominante anaranjado: enfrié los blancos.'); }
  else if (calido < -0.08) { aj.calidez = clamp((-calido - 0.04) * 1.4, 0, 0.5); notas.push('Tenía dominante azulado: calenté los blancos.'); }

  // 5) Saturación — realzar si apagada, bajar si sobrecargada
  const croma = Math.max(rM, gM, bM) - Math.min(rM, gM, bM);   // proxy de saturación
  if (croma < 0.08 && desv > 0.05) { aj.saturacion = 1.15; notas.push('Color apagado: lo realcé un poco.'); }
  else if (croma > 0.28) { aj.saturacion = 0.9; notas.push('Color sobrecargado: lo bajé para que se vea natural.'); }
  else { aj.saturacion = 1.06; }

  // 6) Viñeta sutil si la foto es clara (enfoca la vista, sin túnel)
  if (brillo > 0.5) { aj.vineta = 0.18; }

  if (!notas.length) notas.push('Ya estaba bien equilibrada: solo un retoque fino.');

  return {
    ajustes: { exposicion: r2(aj.exposicion), contraste: r2(aj.contraste), saturacion: r2(aj.saturacion), calidez: r2(aj.calidez), vineta: r2(aj.vineta) },
    notas: notas,
  };
}

// Filtros con nombre (presets). Devuelven un set de ajustes.
const FILTROS = {
  ninguno: { exposicion: 1, contraste: 1, saturacion: 1, calidez: 0, vineta: 0, gris: 0 },
  vivido: { exposicion: 1.02, contraste: 1.15, saturacion: 1.3, calidez: 0.05, vineta: 0.1, gris: 0 },
  cine: { exposicion: 0.98, contraste: 1.2, saturacion: 0.92, calidez: 0.12, vineta: 0.3, gris: 0 },
  frio: { exposicion: 1, contraste: 1.08, saturacion: 1.05, calidez: -0.25, vineta: 0.12, gris: 0 },
  calido: { exposicion: 1.02, contraste: 1.05, saturacion: 1.1, calidez: 0.3, vineta: 0.12, gris: 0 },
  byn: { exposicion: 1, contraste: 1.18, saturacion: 0, calidez: 0, vineta: 0.22, gris: 1 },
  suave: { exposicion: 1.05, contraste: 0.92, saturacion: 1.02, calidez: 0.08, vineta: 0.08, gris: 0 },
};

const API = { PRINCIPIOS, analizar, FILTROS, clamp };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiFotoIA = API;

})();
