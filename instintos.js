// Instintos (robado de ECC «continuous-learning-v2» y adaptado a una asistente personal):
// en vez de lecciones sueltas, ASAGI aprende HÁBITOS pequeños con CONFIANZA (0,3 a 0,9) y EVIDENCIA.
//   - Estilo: «sé más corto», «sin emojis», «más detallado», «háblame directo», «prefiero que …», «nunca …»
//   - Rutina: si pides lo mismo a la misma hora en 3 días distintos («clima» por la mañana), lo nota.
// Cada vez que se repite, sube la confianza; si dices lo contrario, baja; si no se usa en semanas, se apaga solo.
// Solo los de confianza ≥ 0,5 se usan (en el cerebro y en el resumen de la mañana).
// «evoluciona tus instintos»: junta las rutinas de una misma hora en una habilidad (como ECC: instintos -> skill).
// Se comparten con ARIA: los que aparecen en los dos lados pasan a «global».
//   «mis instintos» · «olvida el instinto 2» · «evoluciona tus instintos»
// Solo aprende de lo que DANIEL escribe (nunca de páginas, correos ni notificaciones).
(function () {
'use strict';
var K = 'asagi-instintos', K_OBS = 'asagi-instintos-obs', MAX = 60, DIA = 864e5;
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,]+/g, '').replace(/\s+/g, ' ').trim(); }
function leer(k, d) { try { return JSON.parse(localStorage.getItem(k) || '') || d; } catch (e) { return d; } }
function poner(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function hoyDe(ts) { return new Date(ts).toISOString().slice(0, 10); }

// PURO: franja del día
function franja(h) { return h >= 5 && h < 12 ? 'mañana' : h >= 12 && h < 19 ? 'tarde' : h >= 19 ? 'noche' : 'madrugada'; }

// Preferencias de estilo que Daniel dice. -> {id, accion, contrario?} | null. PURO.
var ESTILOS = [
  [/^(?:se|responde|contesta|habla(?:me)?)?\s*(?:mas )?(?:corto|breve|resumido)(?: porfa| por favor)?$|^muy largo$|^(?:menos texto|resume mas|mas al grano)$/, 'corto', 'Responder corto y al grano', 'largo'],
  [/^(?:se |responde |explica(?:me)? )?mas (?:largo|detallado|completo)$|^(?:dame )?mas detalles$/, 'largo', 'Dar respuestas más detalladas', 'corto'],
  [/^sin emojis$|^no (?:uses|pongas) emojis$/, 'sinemoji', 'No usar emojis', 'conemoji'],
  [/^(?:usa|pon) (?:mas )?emojis$/, 'conemoji', 'Usar algunos emojis', 'sinemoji'],
  [/^(?:se|habla(?:me)?) (?:mas )?directo$|^sin rodeos$/, 'directo', 'Hablar directo, sin rodeos'],
  [/^(?:se|habla(?:me)?) (?:mas )?(?:formal|serio)$/, 'formal', 'Hablar más formal', 'informal'],
  [/^(?:se|habla(?:me)?) (?:mas )?(?:informal|relajado|chill)$/, 'informal', 'Hablar relajado e informal', 'formal'],
  [/^(?:se|habla(?:me)?) (?:mas )?tecnico$/, 'tecnico', 'Usar términos técnicos sin miedo'],
  [/^(?:sin tecnicismos|no seas tan tecnico|explicalo facil|mas simple)$/, 'simple', 'Explicar simple, sin tecnicismos', 'tecnico']
];
function estiloDe(t) {
  var n = norm(t), m;
  for (var i = 0; i < ESTILOS.length; i++) if (ESTILOS[i][0].test(n)) return { id: 'estilo:' + ESTILOS[i][1], accion: ESTILOS[i][2], contrario: ESTILOS[i][3] ? 'estilo:' + ESTILOS[i][3] : null, dominio: 'estilo' };
  if ((m = n.match(/^((?:prefiero que|me gusta que) .{6,120}|siempre (?:me )?(?:respondeme|responde|dime|avisame|hazlo|usa|pon|muestrame|explicame|dame|incluye|pregunta|preguntame) .{3,110})$/))) return { id: 'pref:' + m[1].slice(0, 40), accion: 'Daniel dijo: «' + String(t).trim().replace(/[.!]+$/, '').slice(0, 120) + '»', dominio: 'preferencia' };
  if ((m = n.match(/^(?:nunca (?:me )?(?:digas|hagas|uses|pongas|respondas|menciones|avises|abras|mandes|muestres)|no vuelvas a|no me gusta que) (.{3,120})$/))) return { id: 'nunca:' + m[1].slice(0, 40), accion: 'Daniel dijo: «' + String(t).trim().replace(/[.!]+$/, '').slice(0, 120) + '»', dominio: 'preferencia' };
  return null;
}

// Agrega evidencia a un instinto (crea si no existe). Una evidencia por día cuenta. PURO.
function reforzar(lista, base, evidencia, ahora) {
  var l = (lista || []).slice(), dia = hoyDe(ahora), x = l.find(function (i) { return i.id === base.id; });
  if (!x) { x = { id: base.id, accion: base.accion, dominio: base.dominio, disparador: base.disparador || 'al responder', confianza: 0.3, evidencia: [], ambito: 'asagi', creado: ahora }; l.push(x); }
  else if (!x.evidencia.some(function (e) { return e.dia === dia; })) x.confianza = Math.min(0.9, +(x.confianza + 0.15).toFixed(2));
  x.evidencia = x.evidencia.concat([{ dia: dia, texto: String(evidencia).slice(0, 80) }]).slice(-6);
  x.ultima = ahora;
  if (base.contrario) l.forEach(function (o) { if (o.id === base.contrario) o.confianza = +(o.confianza - 0.3).toFixed(2); });
  return l.filter(function (i) { return i.confianza >= 0.2; }).slice(-MAX);
}
// Confianza efectiva: baja 0,05 por cada 2 semanas sin evidencia. PURO.
function efectiva(i, ahora) { return +Math.max(0, i.confianza - 0.05 * Math.floor(((ahora || Date.now()) - (i.ultima || i.creado || 0)) / (14 * DIA))).toFixed(2); }
function activos(lista, ahora, min) { return (lista || []).filter(function (i) { return efectiva(i, ahora) >= (min || 0.5); }); }

// Observa un comando: si se repite en la misma franja en 3+ días distintos, nace un instinto de rutina. PURO.
function observarRutina(obs, lista, cmd, ahora) {
  var n = norm(cmd);
  if (!n || n.length > 40 || n.split(' ').length > 6 || /^(?:si|no|ok|gracias|hola|jaja)/.test(n)) return { obs: obs, lista: lista, nuevo: null };
  var f = franja(new Date(ahora).getHours()), k = f + '|' + n, o = Object.assign({}, obs || {});
  var dias = (o[k] || []).filter(function (d) { return d !== hoyDe(ahora); }).concat([hoyDe(ahora)]).slice(-10);
  o[k] = dias;
  var nuevo = null;
  if (dias.length >= 3) {
    var l2 = reforzar(lista, { id: 'rutina:' + k, accion: 'Por la ' + f + ' suele pedir «' + cmd.trim().slice(0, 40) + '»', dominio: 'rutina', disparador: 'por la ' + f }, cmd, ahora);
    var x = l2.find(function (i) { return i.id === 'rutina:' + k; });
    if (x) x.confianza = Math.max(x.confianza, Math.min(0.9, +(0.3 + 0.1 * (dias.length - 3)).toFixed(2)));
    if (!(lista || []).some(function (i) { return i.id === 'rutina:' + k; })) nuevo = x;
    lista = l2;
  }
  // limpiar observaciones viejas (más de 30 días)
  Object.keys(o).forEach(function (kk) { o[kk] = o[kk].filter(function (d) { return ahora - Date.parse(d) < 30 * DIA; }); if (!o[kk].length) delete o[kk]; });
  return { obs: o, lista: lista, nuevo: nuevo };
}

// Para el cerebro: los hábitos activos (estilo y preferencias). PURO.
function paraCerebro(lista, ahora) {
  var a = activos(lista, ahora).filter(function (i) { return i.dominio !== 'rutina'; });
  return a.length ? 'Hábitos que aprendiste de Daniel (síguelos): ' + a.map(function (i) { return i.accion; }).join('; ') + '.' : '';
}
// Rutinas activas de una franja (para el resumen de la mañana). PURO.
function rutinasDe(lista, f, ahora) { return activos(lista, ahora).filter(function (i) { return i.dominio === 'rutina' && i.disparador === 'por la ' + f; }); }
// «evoluciona»: rutinas de una misma franja -> frase para crear la habilidad. PURO.
function evolucionar(lista, ahora) {
  var por = {};
  activos(lista, ahora, 0.4).filter(function (i) { return i.dominio === 'rutina'; }).forEach(function (i) {
    var m = i.accion.match(/«(.+)»/); if (!m) return; (por[i.disparador] = por[i.disparador] || []).push(m[1]);
  });
  return Object.keys(por).filter(function (k) { return por[k].length >= 2; }).map(function (k) {
    var nombre = { 'por la mañana': 'mi mañana', 'por la tarde': 'mi tarde', 'por la noche': 'mi noche', 'por la madrugada': 'mi madrugada' }[k] || k;
    return { nombre: nombre, pasos: por[k], frase: 'aprende ' + nombre + ': ' + por[k].join('; ') };
  });
}
// Mezcla los de ARIA: los que están en los dos lados -> global (+0,1). PURO.
function fusionarAria(lista, deAria) {
  var ids = {}; (deAria || []).forEach(function (i) { ids[i.id] = 1; });
  return (lista || []).map(function (i) { return ids[i.id] && i.ambito !== 'global' ? Object.assign({}, i, { ambito: 'global', confianza: Math.min(0.9, +(i.confianza + 0.1).toFixed(2)) }) : i; });
}

// PURO: comandos
function parsear(t) {
  var n = norm(t), m;
  if (/^(?:mis instintos|tus instintos|que habitos aprendiste|que aprendiste de mi forma de ser|que costumbres mias conoces)$/.test(n)) return { accion: 'lista' };
  if ((m = n.match(/^olvida (?:el )?instinto (\d+)$/))) return { accion: 'olvidar', cual: +m[1] };
  if (/^evoluciona (?:tus )?instintos$/.test(n)) return { accion: 'evolucionar' };
  return null;
}

// ---- con estado ----
function lista() { return leer(K, []); }
function sincronizar(l) {
  var cli = typeof window !== 'undefined' && window._asagiLan;
  if (!cli || !cli.enviar) return;
  cli.enviar({ t: 'instintos', lista: l.filter(function (i) { return i.dominio !== 'rutina'; }).map(function (i) { return { id: i.id, accion: i.accion, dominio: i.dominio, confianza: i.confianza }; }) })
    .then(function (r) { var x = r && r.ok && r.resp; if (x && x.lista) poner(K, fusionarAria(lista(), x.lista)); }).catch(function () {});
}
// app.js lo llama con cada mensaje de Daniel. Devuelve un texto corto si conviene decir algo (ej. aprendió un hábito nuevo).
function observar(texto, ahora) {
  ahora = ahora || Date.now();
  var E = typeof window !== 'undefined' && window.AsagiEscudo;
  if (E && E.neutralizar(texto).intentos) return '';
  var l = lista(), dicho = '';
  var est = estiloDe(texto);
  if (est) {
    var antes = l.find(function (i) { return i.id === est.id; });
    l = reforzar(l, est, texto, ahora);
    var x = l.find(function (i) { return i.id === est.id; });
    dicho = antes ? '🧬 Refuerzo un hábito: «' + x.accion + '» (confianza ' + Math.round(x.confianza * 100) + '%).' : '🧬 Anoto un hábito nuevo: «' + x.accion + '». Lo uso desde ya; si lo repites otros días, lo tomo más en serio («mis instintos»).';
    if (est.dominio === 'estilo' && x.confianza < 0.5) x.confianza = 0.5;     // lo dijiste tú directo: ya cuenta
    poner(K, l); sincronizar(l); return dicho;
  }
  var r = observarRutina(leer(K_OBS, {}), l, texto, ahora);
  poner(K_OBS, r.obs); poner(K, r.lista);
  if (r.nuevo) dicho = '🧬 Noté algo: ' + r.nuevo.accion.toLowerCase() + '. Si sigues así, te lo tendré listo («mis instintos»).';
  return dicho;
}
function ejecutar(c, decir) {
  var l = lista(), ahora = Date.now();
  if (c.accion === 'lista') {
    if (!l.length) { decir('🧬 Aún no tengo instintos. Los aprendo de cómo me hablas («sé más corto», «sin emojis») y de lo que pides cada día a la misma hora.'); return; }
    decir('🧬 Mis instintos sobre ti (los de ≥50% los uso):\n' + l.map(function (i, k) {
      var c2 = efectiva(i, ahora);
      return (k + 1) + '. ' + i.accion + ' — ' + Math.round(c2 * 100) + '%' + (i.ambito === 'global' ? ' · también ARIA' : '') + ' · ' + i.evidencia.length + (i.evidencia.length === 1 ? ' vez' : ' veces');
    }).join('\n') + '\n«olvida el instinto N» · «evoluciona tus instintos»');
    return;
  }
  if (c.accion === 'olvidar') { var x = l[c.cual - 1]; if (!x) { decir('🧬 No hay instinto ' + c.cual + '.'); return; } l.splice(c.cual - 1, 1); poner(K, l); sincronizar(l); decir('🧬 Olvidado: ' + x.accion); return; }
  if (c.accion === 'evolucionar') {
    var ev = evolucionar(l, ahora);
    decir(ev.length ? '🧬 Puedo juntar tus rutinas en habilidades de un toque:\n' + ev.map(function (e) { return '• «' + e.frase + '»'; }).join('\n') + '\nEscribe la frase y la creo.'
      : '🧬 Aún no tengo 2+ rutinas a la misma hora con suficiente confianza. Sigue usándome y vuelve a pedírmelo.');
  }
}

var API = { franja: franja, estiloDe: estiloDe, reforzar: reforzar, efectiva: efectiva, activos: activos, observarRutina: observarRutina,
  paraCerebro: paraCerebro, rutinasDe: rutinasDe, evolucionar: evolucionar, fusionarAria: fusionarAria, parsear: parsear,
  lista: lista, observar: observar, ejecutar: ejecutar };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiInstintos = API;
})();
