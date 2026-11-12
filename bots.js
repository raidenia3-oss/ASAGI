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

// ===================== v2: despliegue real (patrón supervisor) =====================
// 1) PLAN: el supervisor reparte la tarea en una sub-tarea concreta por bot.
// 2) DESPLIEGUE: los bots trabajan EN PARALELO, cada uno con tiempo límite y su traza
//    (inicio, fin, ms, ok/falló/tiempo) — nada de barras inventadas.
// 3) SÍNTESIS: el Sintetizador une lo bueno de cada uno en UNA respuesta.
// 4) CRÍTICA: el Crítico la revisa y marca lo dudoso (no inventa datos).
// 5) ACCIONES: si un bot propone "ACCION: pendiente: …" o "ACCION: bandeja: …",
//    se ofrece como botón; nada se ejecuta solo.

const SUB = {
  investigador: 'Reúne hechos verificables y fuentes sobre: ',
  vigia: 'Di qué hay de actual o reciente que importe para: ',
  programador: 'Propón el código o los pasos técnicos concretos para: ',
  escritor: 'Redacta el texto final, claro y en el tono adecuado, para: ',
  analista: 'Compara opciones con pros, contras y una recomendación para: ',
  asistente: 'Resuelve de forma práctica: ',
};

// Plan del supervisor. PURO: [{bot, subtarea}]
function planificar(tarea, max) {
  const bots = elegirBots(tarea, max || 3);
  // si la tarea pide decidir o escribir y no salió el analista/escritor, el plan los suma
  const t = (tarea || '').toLowerCase();
  if (/(decid|conviene|mejor opci|elegir)/.test(t) && !bots.some((b) => b.id === 'analista')) bots.push(botPorId('analista'));
  return bots.slice(0, Math.max(1, max || 3)).map((b) => ({ bot: b, subtarea: (SUB[b.id] || SUB.asistente) + tarea }));
}

function _conTiempo(p, ms) {
  return new Promise((ok, no) => {
    const to = setTimeout(() => no(new Error('tiempo agotado (' + Math.round(ms / 1000) + ' s)')), ms);
    Promise.resolve(p).then((v) => { clearTimeout(to); ok(v); }, (e) => { clearTimeout(to); no(e); });
  });
}

// Extrae acciones propuestas por los bots. PURO.
function extraerAcciones(texto) {
  const out = [];
  String(texto || '').split('\n').forEach((l) => {
    const m = l.match(/^\s*ACCI[OÓ]N\s*:\s*(pendiente|bandeja|recordar)\s*:\s*(.{3,160})$/i);
    if (m) out.push({ tipo: m[1].toLowerCase() === 'recordar' ? 'pendiente' : m[1].toLowerCase(), texto: m[2].trim() });
  });
  return out.slice(0, 5);
}
function limpiarAcciones(texto) { return String(texto || '').split('\n').filter((l) => !/^\s*ACCI[OÓ]N\s*:/i.test(l)).join('\n').trim(); }

const REGLA_ACCION = '\n\nSi conviene que Daniel guarde algo, añade al final líneas "ACCION: pendiente: <texto>" o "ACCION: bandeja: <texto>" (máximo 2). No inventes datos; si no sabes algo, dilo.';

// Despliegue completo. ejecutar(prompt, bot) -> Promise<string>.
// opts: { max, timeoutMs, contexto (memoria), onEvento(ev), sintetizar: true, criticar: true }
async function desplegarV2(tarea, ejecutar, opts) {
  opts = opts || {};
  const on = typeof opts.onEvento === 'function' ? opts.onEvento : function () {};
  const ahora = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const plan = planificar(tarea, opts.max || 3);
  const ctx = opts.contexto ? '\n\nContexto de Daniel (memoria):\n' + opts.contexto : '';
  const t0 = ahora();
  on({ tipo: 'plan', plan: plan.map((p) => ({ id: p.bot.id, nombre: p.bot.nombre, subtarea: p.subtarea })) });
  const trazas = await Promise.all(plan.map(async (p) => {
    const ini = ahora();
    on({ tipo: 'inicio', id: p.bot.id });
    try {
      const txt = await _conTiempo(ejecutar(p.bot.rol + ctx + '\n\nTu parte: ' + p.subtarea + REGLA_ACCION, p.bot), opts.timeoutMs || 45000);
      const tr = { id: p.bot.id, nombre: p.bot.nombre, ok: true, ms: Math.round(ahora() - ini), texto: limpiarAcciones(txt), acciones: extraerAcciones(txt) };
      on({ tipo: 'fin', traza: tr });
      return tr;
    } catch (e) {
      const tr = { id: p.bot.id, nombre: p.bot.nombre, ok: false, ms: Math.round(ahora() - ini), error: String(e && e.message || e), texto: '', acciones: [] };
      on({ tipo: 'fin', traza: tr });
      return tr;
    }
  }));
  const buenos = trazas.filter((x) => x.ok && x.texto);
  let final = buenos.length === 1 ? buenos[0].texto : '';
  if (buenos.length > 1 && opts.sintetizar !== false) {
    on({ tipo: 'inicio', id: 'sintetizador' });
    const ini = ahora();
    try {
      final = await _conTiempo(ejecutar('Eres el Sintetizador. Une los aportes en UNA respuesta para Daniel: lo esencial primero, sin repetir, sin inventar. Si se contradicen, dilo.\n\nTarea: ' + tarea + '\n\n' +
        buenos.map((b) => '[' + b.nombre + ']\n' + b.texto).join('\n\n'), { id: 'sintetizador', nombre: 'Sintetizador' }), opts.timeoutMs || 45000);
      on({ tipo: 'fin', traza: { id: 'sintetizador', nombre: 'Sintetizador', ok: true, ms: Math.round(ahora() - ini) } });
    } catch (e) {
      final = buenos.map((b) => '• ' + b.nombre + ': ' + b.texto).join('\n\n');
      on({ tipo: 'fin', traza: { id: 'sintetizador', nombre: 'Sintetizador', ok: false, ms: Math.round(ahora() - ini), error: String(e.message || e) } });
    }
  }
  let critica = '';
  if (final && opts.criticar !== false && buenos.length > 1) {
    on({ tipo: 'inicio', id: 'critico' });
    const ini = ahora();
    try {
      critica = await _conTiempo(ejecutar('Eres el Crítico. Revisa esta respuesta: señala en máximo 3 viñetas cortas lo dudoso, lo que falta verificar o un error. Si está bien, responde solo "OK".\n\n' + final, { id: 'critico', nombre: 'Crítico' }), 30000);
      on({ tipo: 'fin', traza: { id: 'critico', nombre: 'Crítico', ok: true, ms: Math.round(ahora() - ini) } });
    } catch (e) { on({ tipo: 'fin', traza: { id: 'critico', nombre: 'Crítico', ok: false, ms: Math.round(ahora() - ini) } }); }
  }
  const acciones = [].concat.apply([], trazas.map((x) => x.acciones));
  const res = { tarea: tarea, final: limpiarAcciones(final), critica: /^\s*ok\.?\s*$/i.test(critica) ? '' : String(critica || '').trim(),
                acciones: acciones, trazas: trazas, ms: Math.round(ahora() - t0), cuando: Date.now() };
  on({ tipo: 'listo', resultado: res });
  return res;
}

// Historial de despliegues (trazas) para revisar qué falló. PURO sobre el store.
function guardarTraza(store, res) {
  try {
    const l = JSON.parse(store.getItem('asagi-bots-trazas') || '[]');
    l.unshift({ tarea: res.tarea, ms: res.ms, cuando: res.cuando, bots: res.trazas.map((t) => ({ n: t.nombre, ok: t.ok, ms: t.ms, e: t.error || '' })) });
    store.setItem('asagi-bots-trazas', JSON.stringify(l.slice(0, 20)));
  } catch (e) {}
}

const API = { BOTS, botPorId, elegirBots, promptDe, desplegar, planificar, desplegarV2, extraerAcciones, limpiarAcciones, guardarTraza };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiBots = API;

})();
