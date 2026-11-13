;(function () {
// ASAGI - Grok bots: despliega varios bots especializados para ayudarte en cualquier
// cosa. Tu das una tarea, el orquestador elige los bots adecuados y cada uno responde
// (via el cerebro: brain-router). Ligero: cada bot = un rol (prompt) + palabras clave.
//
// La LOGICA (registro, elegir bots, armar prompt) es PURA y testeable. La ejecucion
// (llamar al cerebro) se inyecta como callback.

'use strict';

const BOTS = [
  { id: 'investigador', nombre: 'Investigador', color: '#ed3758',
    clave: ['investiga', 'busca', 'averigua', 'reverse', 'rea', 'fuentes', 'compara'],
    rol: 'Eres un bot Investigador. Buscas, analizas y devuelves un playbook claro: hallazgos, tacticas a replicar y riesgos. Si no tienes datos, lo dices.' },
  { id: 'vigia', nombre: 'Vigía', color: '#dd153d',
    clave: ['noticias', 'noticia', 'hoy', 'ultimo', 'actualidad', 'pasa'],
    rol: 'Eres un bot Vigía. Resumes lo relevante de hoy de forma neutral, sin opinar.' },
  { id: 'programador', nombre: 'Programador', color: '#f4dfe7',
    clave: ['codigo', 'code', 'script', 'funcion', 'bug', 'error', 'programa', 'python', 'js', 'java'],
    rol: 'Eres un bot Programador. Escribes y depuras codigo correcto y claro, explicando en pasos cortos.' },
  { id: 'escritor', nombre: 'Escritor', color: '#f2e9f1',
    clave: ['escribe', 'redacta', 'texto', 'mensaje', 'correo', 'post', 'carta'],
    rol: 'Eres un bot Escritor. Redactas textos claros en el tono pedido, sin relleno.' },
  { id: 'analista', nombre: 'Analista', color: '#ffd700',
    clave: ['analiza', 'datos', 'calcula', 'pros', 'contras', 'decidir', 'conviene', 'opciones'],
    rol: 'Eres un bot Analista. Estructuras el problema, comparas opciones y recomiendas con razones honestas.' },
  { id: 'asistente', nombre: 'Asistente', color: '#ffd700',
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
      const prompt = p.bot.rol + ctx + '\n\nTu parte: ' + p.subtarea + REGLA_ACCION;
      let txt, intentos = 0;
      for (;;) {                                  // un reintento si falla rápido (red, 429); el tiempo agotado no se reintenta
        intentos++;
        try { txt = await _conTiempo(ejecutar(prompt, p.bot), opts.timeoutMs || 45000); break; }
        catch (e) {
          if (intentos > (opts.reintentos == null ? 1 : opts.reintentos) || /tiempo agotado|sin cerebro/.test(String(e && e.message))) throw e;
          on({ tipo: 'reintento', id: p.bot.id, error: String(e && e.message || e) });
          await new Promise((r) => setTimeout(r, opts.esperaReintento == null ? 1200 : opts.esperaReintento));
        }
      }
      if (!String(txt || '').trim()) throw new Error('respuesta vacía');
      const tr = { id: p.bot.id, nombre: p.bot.nombre, ok: true, ms: Math.round(ahora() - ini), texto: limpiarAcciones(txt), acciones: extraerAcciones(txt), intentos: intentos };
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
  // REVISIÓN: si el Crítico encontró algo, el Sintetizador corrige UNA vez (bucle cerrado, no infinito).
  let revisada = false;
  const critOk = /^\s*ok\.?\s*$/i.test(critica);
  if (final && critica && !critOk && opts.revisar !== false) {
    on({ tipo: 'inicio', id: 'revision' });
    const ini = ahora();
    try {
      const corr = await _conTiempo(ejecutar('Eres el Sintetizador. Corrige tu respuesta aplicando SOLO las observaciones del Crítico que sean válidas. ' +
        'Si algo no se puede verificar, dilo en la respuesta. Devuelve la respuesta final completa.\n\nTarea: ' + tarea +
        '\n\nRespuesta:\n' + final + '\n\nCrítico:\n' + critica, { id: 'revision', nombre: 'Revisión' }), opts.timeoutMs || 45000);
      if (String(corr || '').trim()) { final = String(corr).trim(); revisada = true; }
      on({ tipo: 'fin', traza: { id: 'revision', nombre: 'Revisión', ok: revisada, ms: Math.round(ahora() - ini) } });
    } catch (e) { on({ tipo: 'fin', traza: { id: 'revision', nombre: 'Revisión', ok: false, ms: Math.round(ahora() - ini) } }); }
  }
  const acciones = [].concat.apply([], trazas.map((x) => x.acciones));
  const res = { tarea: tarea, final: limpiarAcciones(final), critica: /^\s*ok\.?\s*$/i.test(critica) ? '' : String(critica || '').trim(),
                acciones: acciones, trazas: trazas, ms: Math.round(ahora() - t0), cuando: Date.now(), revisada: revisada };
  on({ tipo: 'listo', resultado: res });
  return res;
}

// ===================== Variantes en paralelo + juez (como los "muchos candidatos de diseño" de Astra) =====================
const ENFOQUES = [
  ['Directo', 'Da la solución más simple y práctica que funcione hoy.'],
  ['Riguroso', 'Da la solución más segura y verificable; señala supuestos.'],
  ['Creativo', 'Da una solución distinta y ambiciosa que otros no propondrían.'],
  ['Económico', 'Da la solución más barata en dinero y tiempo.'],
];

// Elige la mejor variante a partir de la respuesta del juez. PURO.
function leerJuicio(txt, n) {
  const m = String(txt || '').match(/\{[\s\S]*?\}/);
  if (m) {
    try {
      const o = JSON.parse(m[0]); const k = parseInt(o.mejor, 10);
      if (k >= 1 && k <= n) return { mejor: k, porque: String(o.porque || o.por_que || o.razon || '') };
    } catch (e) {}
  }
  const d = String(txt || '').match(/\b(?:variante|opci[oó]n|candidat[oa])?\s*#?([1-9])\b/i);
  if (d && +d[1] >= 1 && +d[1] <= n) return { mejor: +d[1], porque: String(txt).slice(0, 200) };
  return { mejor: 1, porque: 'el juez no decidió; muestro la primera' };
}

async function desplegarVariantes(tarea, ejecutar, opts) {
  opts = opts || {};
  const n = Math.max(2, Math.min(4, opts.n || 3));
  const on = typeof opts.onEvento === 'function' ? opts.onEvento : function () {};
  const t0 = Date.now();
  const cands = await Promise.all(ENFOQUES.slice(0, n).map(async ([nombre, guia], i) => {
    on({ tipo: 'inicio', id: 'v' + (i + 1), nombre: nombre });
    try {
      const txt = await _conTiempo(ejecutar('Eres el candidato ' + nombre + '. ' + guia + '\n\nTarea: ' + tarea, { id: 'v' + (i + 1), nombre: nombre }), opts.timeoutMs || 45000);
      const c = { i: i + 1, nombre: nombre, ok: !!String(txt || '').trim(), texto: String(txt || '').trim() };
      on({ tipo: 'fin', traza: { id: 'v' + (i + 1), nombre: nombre, ok: c.ok, ms: Date.now() - t0 } });
      return c;
    } catch (e) {
      on({ tipo: 'fin', traza: { id: 'v' + (i + 1), nombre: nombre, ok: false, ms: Date.now() - t0, error: String(e.message || e) } });
      return { i: i + 1, nombre: nombre, ok: false, texto: '', error: String(e.message || e) };
    }
  }));
  const buenos = cands.filter((c) => c.ok);
  if (!buenos.length) return { tarea, mejor: null, candidatos: cands, porque: 'ningún candidato respondió', ms: Date.now() - t0 };
  if (buenos.length === 1) return { tarea, mejor: buenos[0], candidatos: cands, porque: 'solo uno respondió', ms: Date.now() - t0 };
  let juicio;
  try {
    const j = await _conTiempo(ejecutar('Eres el Juez. Elige la MEJOR variante para Daniel según: que resuelva la tarea, que sea correcta y que se pueda hacer. ' +
      'Responde SOLO {"mejor":<número>,"porque":"<una línea>"}.\n\nTarea: ' + tarea + '\n\n' +
      buenos.map((c, k) => 'Variante ' + (k + 1) + ' (' + c.nombre + '):\n' + c.texto).join('\n\n'), { id: 'juez', nombre: 'Juez' }), 30000);
    juicio = leerJuicio(j, buenos.length);
  } catch (e) { juicio = { mejor: 1, porque: 'el juez no respondió' }; }
  return { tarea, mejor: buenos[juicio.mejor - 1], candidatos: cands, porque: juicio.porque, ms: Date.now() - t0 };
}

// Historial de despliegues (trazas) para revisar qué falló. PURO sobre el store.
function leerTrazas(store) { try { return JSON.parse(store.getItem('asagi-bots-trazas') || '[]'); } catch (e) { return []; } }

// Resumen de salud de los bots (observabilidad): tasa de éxito y tiempo medio por bot. PURO.
function salud(trazas) {
  const m = {};
  (trazas || []).forEach((d) => (d.bots || []).forEach((b) => {
    const k = b.n; m[k] = m[k] || { n: k, total: 0, ok: 0, ms: 0 };
    m[k].total++; if (b.ok) { m[k].ok++; m[k].ms += b.ms || 0; }
  }));
  return Object.keys(m).map((k) => ({ n: k, total: m[k].total, exito: m[k].ok / m[k].total, msMedio: m[k].ok ? Math.round(m[k].ms / m[k].ok) : 0 }))
    .sort((a, b) => a.exito - b.exito);
}

function guardarTraza(store, res) {
  try {
    const l = JSON.parse(store.getItem('asagi-bots-trazas') || '[]');
    l.unshift({ tarea: res.tarea, ms: res.ms, cuando: res.cuando, revisada: !!res.revisada, final: String(res.final || '').slice(0, 1200),
                bots: res.trazas.map((t) => ({ id: t.id, n: t.nombre, ok: t.ok, ms: t.ms, e: t.error || '', i: t.intentos || 1 })) });
    store.setItem('asagi-bots-trazas', JSON.stringify(l.slice(0, 20)));
  } catch (e) {}
}

const API = { BOTS, botPorId, elegirBots, promptDe, desplegar, planificar, desplegarV2, extraerAcciones, limpiarAcciones, guardarTraza, leerTrazas, salud, desplegarVariantes, leerJuicio, ENFOQUES };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiBots = API;

})();
