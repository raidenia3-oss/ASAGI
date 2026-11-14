// Habilidades que Daniel le enseña a ASAGI (macros de comandos que ya existen).
//   «aprende buenos días: clima; mis gastos hoy; qué notificaciones tengo»
//   «cuando diga modo estudio haz: pon sonido de lluvia, luego temporizador de 25 minutos»
//   «mis habilidades» · «olvida la habilidad buenos días»
// Al decir el nombre, ASAGI ejecuta los pasos en orden como si los escribieras. Lo peligroso
// (tocar «pagar», «enviar»…) sigue pidiendo tu confirmación paso a paso.
(function () {
'use strict';
var K = 'asagi-habilidades', MAX_PASOS = 8;
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;:"«»]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function cargar(store) { try { return JSON.parse((store || localStorage).getItem(K) || '{}') || {}; } catch (e) { return {}; } }
function guardar(h, store) { try { (store || localStorage).setItem(K, JSON.stringify(h)); return true; } catch (e) { return false; } }

// PURO
function partirPasos(t) {
  return String(t || '').split(/\s*(?:;|\n|,?\s+(?:luego|despues|después|y despues|y después|y luego)\s+)\s*/i)
    .map(function (x) { return x.trim().replace(/^[-•]\s*/, ''); }).filter(Boolean).slice(0, MAX_PASOS);
}
function parsear(t) {
  var s = String(t || '').trim(), m;
  if ((m = s.match(/^(?:aprende|ens[eé][nñ]ate|crea (?:la )?habilidad)\s+[«"']?([^:«»"']{2,40}?)[»"']?\s*:\s*([\s\S]{2,600})$/i)) ||
      (m = s.match(/^cuando (?:te )?diga\s+[«"']?([^«»"']{2,40}?)[»"']?\s+(?:haz|has|ejecuta)\s*:?\s+([\s\S]{2,600})$/i))) {
    var pasos = partirPasos(m[2]);
    return pasos.length ? { accion: 'aprender', nombre: m[1].trim(), pasos: pasos } : null;
  }
  var n = norm(s);
  if (/^(mis habilidades|que habilidades (tienes|sabes)|habilidades)$/.test(n)) return { accion: 'listar' };
  if ((m = n.match(/^(?:olvida|borra|elimina) (?:la )?habilidad (.{2,40})$/))) return { accion: 'olvidar', nombre: m[1] };
  return null;
}
function buscar(t, h) { var k = norm(t); return h[k] ? Object.assign({ clave: k }, h[k]) : null; }

function aprender(nombre, pasos, store) {
  var h = cargar(store), k = norm(nombre);
  if (!k) return { ok: false, error: 'nombre vacío' };
  // no permite que un paso sea otra habilidad que la llame de vuelta (bucles)
  if (pasos.some(function (p) { return norm(p) === k; })) return { ok: false, error: 'un paso no puede ser la misma habilidad' };
  h[k] = { nombre: nombre, pasos: pasos, creada: Date.now(), usos: (h[k] && h[k].usos) || 0 };
  return { ok: guardar(h, store) };
}
function olvidar(nombre, store) { var h = cargar(store), k = norm(nombre); if (!h[k]) return false; delete h[k]; guardar(h, store); return true; }
function listar(store) {
  var h = cargar(store), ks = Object.keys(h);
  if (!ks.length) return '🧠 Aún no me enseñaste habilidades. Ejemplo: «aprende buenos días: clima; mis gastos hoy; qué notificaciones tengo».';
  return '🧠 Mis habilidades:\n' + ks.map(function (k) { return '• «' + h[k].nombre + '» → ' + h[k].pasos.join(' → ') + (h[k].usos ? '  (' + h[k].usos + ' usos)' : ''); }).join('\n');
}

// Ejecuta los pasos: cada uno pasa por el chat normal (ejecutar(texto)), con pausa entre pasos.
var corriendo = false;
async function correr(hab, ejecutar, decir, opts) {
  opts = opts || {};
  if (corriendo) { decir('⏳ Ya estoy haciendo otra habilidad.'); return; }
  corriendo = true;
  try {
    var h = cargar(opts.store); if (h[hab.clave]) { h[hab.clave].usos = (h[hab.clave].usos || 0) + 1; guardar(h, opts.store); }
    decir('🧠 «' + hab.nombre + '»: ' + hab.pasos.length + ' paso(s).');
    for (var i = 0; i < hab.pasos.length; i++) {
      if (buscar(hab.pasos[i], cargar(opts.store))) { decir('↷ salto «' + hab.pasos[i] + '» (es otra habilidad)'); continue; }
      ejecutar(hab.pasos[i]);
      await new Promise(function (r) { setTimeout(r, opts.pausa || 2500); });
    }
  } finally { corriendo = false; }
}

var API = { parsear: parsear, partirPasos: partirPasos, buscar: buscar, aprender: aprender, olvidar: olvidar, listar: listar, correr: correr, cargar: cargar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiHabilidades = API;
})();
