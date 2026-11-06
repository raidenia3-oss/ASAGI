;(function () {
// ASAGI - Command palette (estilo VengenceUI): busca apps Y comandos con fuzzy match.
// Todo PURO y testeable. La UI (app.js) le pasa las apps y ejecuta los comandos por id.

'use strict';

// Comandos fijos de ASAGI (acciones, no apps). El id lo maneja app.js.
function acciones() {
  return [
    { id: 'preguntar', label: 'Preguntar a ASAGI', sub: 'Asistente', ico: '✦', tipo: 'accion' },
    { id: 'escanear', label: 'Escanear mis apps', sub: 'Defensa', ico: '🛡', tipo: 'accion' },
    { id: 'ir-status', label: 'Control del teléfono', sub: 'Status', ico: '⚙', tipo: 'accion' },
    { id: 'ir-grok', label: 'Desplegar bots', sub: 'Grok · enjambre', ico: '⟐', tipo: 'accion' },
    { id: 'voz', label: 'Voz en sigilo', sub: 'Audífonos', ico: '🎧', tipo: 'accion' },
    { id: 'ads', label: 'Bloquear anuncios', sub: 'DNS privado', ico: '⛔', tipo: 'accion' },
    { id: 'fondo', label: 'Cambiar fondo', sub: 'Wallpaper', ico: '✶', tipo: 'accion' },
  ];
}

// normaliza: minúsculas sin acentos
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Puntaje fuzzy por subsecuencia. 0 = no coincide. Mayor = mejor.
// Bonus por coincidencia al inicio y por letras consecutivas.
function puntaje(texto, q) {
  const t = norm(texto), s = norm(q);
  if (!s) return 1;
  if (t.indexOf(s) === 0) return 1000 - t.length;        // prefijo exacto: lo mejor
  const idx = t.indexOf(s);
  if (idx > 0) return 600 - idx;                          // substring
  // subsecuencia
  let ti = 0, score = 0, racha = 0, hits = 0;
  for (let si = 0; si < s.length; si++) {
    const c = s[si]; let found = -1;
    for (let k = ti; k < t.length; k++) { if (t[k] === c) { found = k; break; } }
    if (found === -1) return 0;
    if (found === ti) { racha++; score += 8 + racha * 2; } else { racha = 0; score += 3; }
    ti = found + 1; hits++;
  }
  return hits === s.length ? score : 0;
}

// Convierte apps nativas a items de palette.
function appsAItems(apps) {
  return (apps || []).map(function (a) {
    return { id: a.package, label: a.label, sub: 'App', tipo: 'app', package: a.package, _app: a };
  });
}

// Busca en apps + acciones y devuelve items ordenados por relevancia.
// q vacío -> solo apps (sin comandos), para no ensuciar la cuadrícula.
function buscar(apps, q, acc) {
  const items = appsAItems(apps);
  const consulta = (q || '').trim();
  if (!consulta) return items;
  const todo = items.concat(acc || acciones());
  const con = todo.map(function (it) { return { it: it, p: puntaje(it.label + ' ' + (it.sub || ''), consulta) }; })
    .filter(function (x) { return x.p > 0; })
    .sort(function (a, b) {
      if (b.p !== a.p) return b.p - a.p;
      // empate: acciones primero si el texto es corto, luego alfabético
      return a.it.label.localeCompare(b.it.label);
    });
  return con.map(function (x) { return x.it; });
}

const API = { acciones, norm, puntaje, appsAItems, buscar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiPalette = API;

})();
