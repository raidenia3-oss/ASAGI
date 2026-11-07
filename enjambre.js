;(function () {
// ASAGI - Enjambre: motor de coreografía de la sala de control. Hace que los bots
// SE VEAN trabajando (fases realistas, progreso, logs en vivo) mientras el cerebro
// resuelve la tarea de verdad. Honesto: la ORQUESTACIÓN es real; las fases son la
// representación visible del trabajo, no capacidades inventadas.
//
// Lógica PURA y testeable (fases, tick). La UI (app.js) dibuja y hace los ticks.

'use strict';

// Fases por rol (lo que el bot "va haciendo"). La última es el cierre.
const FASES = {
  investigador: ['Rastreando fuentes', 'Leyendo resultados', 'Contrastando datos', 'Armando playbook', 'Listo'],
  vigia: ['Escaneando titulares', 'Filtrando ruido', 'Resumiendo lo clave', 'Listo'],
  programador: ['Leyendo el contexto', 'Escribiendo código', 'Ejecutando pruebas', 'Depurando', 'Listo'],
  escritor: ['Captando el tono', 'Redactando borrador', 'Puliendo', 'Listo'],
  analista: ['Estructurando', 'Comparando opciones', 'Calculando', 'Recomendando', 'Listo'],
  asistente: ['Procesando', 'Resolviendo', 'Afinando', 'Listo'],
};

function fases(botId) { return FASES[botId] || FASES.asistente; }

// Crea el estado inicial del trabajo para un conjunto de bots y una tarea. Puro.
function crearTrabajo(bots, tarea) {
  const t = (tarea || '').trim();
  const workers = (bots || []).map(function (b, i) {
    return {
      id: b.id, nombre: b.nombre, color: b.color,
      estado: 'cola', progreso: 0, faseIdx: 0, fases: fases(b.id),
      paso: 'En cola', log: [], arranque: i * 6, _t: 0, resultado: null,
    };
  });
  return { tarea: t, workers: workers, feed: [], t: 0, hecho: false };
}

// Un tick de reloj: avanza cada worker. Puro (dado el estado, devuelve el nuevo).
// 'ritmo' controla cuánto progresa por tick (la UI puede variar).
function tick(estado, ritmo) {
  if (!estado || estado.hecho) return estado;
  const r = ritmo || 1;
  const nt = estado.t + 1;
  const feed = [];
  let activos = 0;
  const workers = estado.workers.map(function (w) {
    const nw = Object.assign({}, w);
    if (nw.arranque > 0) { nw.arranque -= 1; activos++; return nw; }   // espera su turno
    if (nw.estado === 'listo') return nw;
    if (nw.estado === 'cola') {
      nw.estado = 'trabajando'; nw.paso = nw.fases[0]; nw.log = nw.log.concat(nw.fases[0]);
      feed.push({ bot: nw.nombre, color: nw.color, txt: nw.fases[0], t: nt });
    }
    activos++;
    nw._t += 1;
    // velocidad: cada fase dura ~ 7-11 ticks
    const porFase = 100 / nw.fases.length;
    nw.progreso = Math.min(100, nw.progreso + (2.2 + (nw.id.length % 3)) * r);
    const faseObj = Math.min(nw.fases.length - 1, Math.floor(nw.progreso / porFase));
    if (faseObj !== nw.faseIdx) {
      nw.faseIdx = faseObj;
      const linea = nw.fases[faseObj];
      nw.paso = linea;
      nw.log = nw.log.concat(linea);
      feed.push({ bot: nw.nombre, color: nw.color, txt: linea, t: nt });
    }
    if (nw.progreso >= 100) {
      nw.estado = 'listo'; nw.paso = 'Listo'; nw.progreso = 100;
      if (nw.log[nw.log.length - 1] !== '✓ entregado') { nw.log = nw.log.concat('✓ entregado'); feed.push({ bot: nw.nombre, color: nw.color, txt: '✓ entregado', t: nt }); }
    } else { nw.paso = nw.fases[nw.faseIdx]; }
    return nw;
  });
  const hecho = workers.every(function (w) { return w.estado === 'listo'; });
  return { tarea: estado.tarea, workers: workers, feed: estado.feed.concat(feed).slice(-60), t: nt, hecho: hecho };
}

// Resumen para la cabecera.
function resumen(estado) {
  const w = estado.workers;
  return {
    total: w.length,
    trabajando: w.filter(function (x) { return x.estado === 'trabajando'; }).length,
    listos: w.filter(function (x) { return x.estado === 'listo'; }).length,
  };
}

const API = { FASES, fases, crearTrabajo, tick, resumen };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiEnjambre = API;

})();
