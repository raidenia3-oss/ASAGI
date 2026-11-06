;(function () {
// ASAGI - Grok bots: despliega varios bots especializados para ayudarte en cualquier
// cosa. Tu das una tarea, el orquestador elige los bots adecuados y cada uno responde
// (via el cerebro: brain-router). Ligero: cada bot = un rol (prompt) + palabras clave.
//
// La LOGICA (registro, elegir bots, armar prompt) es PURA y testeable. La ejecucion
// (llamar al cerebro) se inyecta como callback.

'use strict';

const BOTS = [
  { id: 'investigador', nombre: 'Investigador', color: '#38bdf8',
    clave: ['investiga', 'busca', 'averigua', 'reverse', 'rea', 'fuentes', 'compara'],
    rol: 'Eres un bot Investigador. Buscas, analizas y devuelves un playbook claro: hallazgos, tacticas a replicar y riesgos. Si no tienes datos, lo dices.' },
  { id: 'vigia', nombre: 'Vigía', color: '#2dd4bf',
    clave: ['noticias', 'noticia', 'hoy', 'ultimo', 'actualidad', 'pasa'],
    rol: 'Eres un bot Vigía. Resumes lo relevante de hoy de forma neutral, sin opinar.' },
  { id: 'programador', nombre: 'Programador', color: '#a78bfa',
    clave: ['codigo', 'code', 'script', 'funcion', 'bug', 'error', 'programa', 'python', 'js', 'java'],
    rol: 'Eres un bot Programador. Escribes y depuras codigo correcto y claro, explicando en pasos cortos.' },
  { id: 'escritor', nombre: 'Escritor', color: '#f0abfc',
    clave: ['escribe', 'redacta', 'texto', 'mensaje', 'correo', 'post', 'carta'],
    rol: 'Eres un bot Escritor. Redactas textos claros en el tono pedido, sin relleno.' },
  { id: 'analista', nombre: 'Analista', color: '#fbbf24',
    clave: ['analiza', 'datos', 'calcula', 'pros', 'contras', 'decidir', 'conviene', 'opciones'],
    rol: 'Eres un bot Analista. Estructuras el problema, comparas opciones y recomiendas con razones honestas.' },
  { id: 'asistente', nombre: 'Asistente', color: '#34d399',
    clave: [],
    rol: 'Eres un bot Asistente general. Ayudas con lo que sea, directo y util.' },
];

function botPorId(id) {
  for (const b of BOTS) if (b.id === id) return b;
  return null;
}

// Elige los bots adecuados para una tarea (por palabras clave). Puro.
// Devuelve hasta 'max' bots; si ninguno coincide, el Asistente general.
function elegirBots(tarea, max = 2) {
  const t = (tarea || '').toLowerCase();
  const punt = [];
  for (const b of BOTS) {
    if (!b.clave.length) continue;
    let s = 0;
    for (const k of b.clave) if (t.includes(k)) s += 1;
    if (s > 0) punt.push([s, b]);
  }
  punt.sort((a, b) => b[0] - a[0]);
  const elegidos = punt.slice(0, max).map((x) => x[1]);
  if (!elegidos.length) elegidos.push(botPorId('asistente'));
  return elegidos;
}

// Arma el prompt de un bot para una tarea. Puro.
function promptDe(bot, tarea) {
  return bot.rol + '\n\nTarea de Daniel: ' + (tarea || '');
}

// Despliega los bots: ejecutar(prompt, bot) -> Promise<string> (el cerebro).
// Devuelve [{bot, texto}]. Nunca lanza (captura por bot).
async function desplegar(tarea, ejecutar, { max = 2 } = {}) {
  const bots = elegirBots(tarea, max);
  const res = [];
  for (const b of bots) {
    let texto = '';
    try {
      texto = await ejecutar(promptDe(b, tarea), b);
    } catch (e) {
      texto = '(el bot ' + b.nombre + ' fallo: ' + (e && e.message ? e.message : e) + ')';
    }
    res.push({ bot: b, texto: texto || '' });
  }
  return res;
}

const API = { BOTS, botPorId, elegirBots, promptDe, desplegar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiBots = API;

})();
