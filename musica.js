// Reproductor de música de ASAGI (las canciones guardadas en el celular).
// Suena con la app cerrada y la pantalla apagada (servicio nativo), con controles en la notificación,
// la pantalla de bloqueo y los audífonos. Comandos:
//   «pon música» · «pon música aleatoria» · «pon canciones de Soda Stereo» · «reproduce De música ligera»
//   «pausa» · «sigue» · «siguiente» · «anterior» · «qué suena» · «mi música» (abre la lista)
(function () {
'use strict';
function P() { var C = typeof window !== "undefined" && window.Capacitor && window.Capacitor.Plugins; return C && C.AsagiMusica; }
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,;:"«»]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function mmss(ms) { var s = Math.round((ms || 0) / 1000); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

// ---- comandos. PURO ----
function parsear(t, activo) {
  var n = norm(t), m;
  if (/^(?:mi musica|mis canciones|abre (?:la |mi )?musica|reproductor|musica|biblioteca de musica)$/.test(n)) return { accion: 'abrir' };
  if (/^(?:pon(?:me)?|reproduce|toca|quiero escuchar|escuchemos) (?:(?:mi |la |algo de )?musica|mis canciones)(?: (aleatoria|al azar|en aleatorio|mezclada))?$/.test(n))
    return { accion: 'todo', aleatorio: /aleat|azar|mezcl/.test(n) };
  if ((m = n.match(/^(?:pon(?:me)?|reproduce|toca|quiero escuchar) (?:la cancion|canciones de|musica de|el album|algo de|a) (.{2,60})$/)) ||
      (m = n.match(/^reproduce (.{2,60})$/))) return { accion: 'buscar', q: m[1] };
  if ((m = n.match(/^(?:pon(?:me)?|toca|reproduce|quiero escuchar) (?:un poco de |algo de |musica )?(reggaeton|salsa|rock|cumbia|pop|bachata|baladas?|trap|rap|electronica|k-?pop|lofi|lo-fi|jazz|clasica|merengue|huayno|criolla|chicha|rock en espanol|anime|indie|metal|romanticas?)$/))) return { accion: 'buscar', q: m[1], genero: true };
  if (/^(?:modo )?aleatorio$|^mezcla(?: las canciones)?$/.test(n)) return { accion: 'aleatorio' };
  if (/^(?:pausa|pausa la musica|para la musica|deten la musica|detén la musica|silencio|calla la musica)$/.test(n) && (activo || /musica/.test(n))) return { accion: 'pausa' };
  if (/^(?:sigue|continua|reanuda|play|dale play)(?: la musica)?$/.test(n) && (activo || /musica/.test(n))) return { accion: 'seguir' };
  if (/^(?:siguiente|siguiente cancion|pasa la cancion|otra cancion|cambia la cancion|salta(?: la cancion)?)$/.test(n) && (activo || /cancion/.test(n))) return { accion: 'siguiente' };
  if (/^(?:anterior|cancion anterior|la de antes|vuelve a la anterior)$/.test(n) && (activo || /cancion/.test(n))) return { accion: 'anterior' };
  if ((m = n.match(/^(?:apaga|para|pausa|deten) la musica (?:en|dentro de) (\d{1,3}) ?(?:min|minutos?)$/)) ||
      (m = n.match(/^(?:temporizador|timer) (?:de |para )?(?:dormir|sueno|la musica)(?: de| en)? (\d{1,3}) ?(?:min|minutos?)$/)))
    return { accion: 'dormir', min: parseInt(m[1], 10) };
  if (/^(?:cancela|quita) (?:el )?(?:temporizador de (?:dormir|sueno|la musica)|apagado de la musica)$/.test(n)) return { accion: 'dormir', min: 0 };
  if (/^(?:que suena|que cancion es(?: esta)?|que esta sonando|que estoy escuchando)$/.test(n)) return { accion: 'quesuena' };
  if (/^(?:apaga la musica|quita la musica|cierra la musica)$/.test(n)) return { accion: 'parar' };
  return null;
}

// Busca canciones: artista exacto > artista contiene > título/álbum contiene. PURO.
function buscar(pistas, q) {
  var k = norm(q); if (!k) return [];
  var pal = k.split(' ').filter(function (w) { return w.length > 1; });
  var puntos = pistas.map(function (p) {
    var a = norm(p.artista), ti = norm(p.titulo), al = norm(p.album), s = 0;
    if (a === k) s = 100; else if (a.indexOf(k) >= 0) s = 80;
    if (ti === k) s = Math.max(s, 95); else if (ti.indexOf(k) >= 0) s = Math.max(s, 70);
    if (al.indexOf(k) >= 0) s = Math.max(s, 60);
    if (!s && pal.length > 1 && pal.every(function (w) { return (a + ' ' + ti + ' ' + al).indexOf(w) >= 0; })) s = 40;
    return { p: p, s: s };
  }).filter(function (x) { return x.s > 0; });
  puntos.sort(function (x, y) { return y.s - x.s; });
  return puntos.map(function (x) { return x.p; });
}

// ---- estado y biblioteca ----
var pistas = null, est = { activo: false, sonando: false };
async function asegurarPermiso(decir) {
  var p = P(); if (!p) { decir && decir('🎵 La música necesita la app instalada en el celular.'); return false; }
  var r = await p.permiso(); if (r && r.ok) return true;
  decir && decir('🎵 Para leer tus canciones Android te pedirá permiso de «Música y audio» (y de notificaciones, para los controles). Es una sola vez.');
  r = await p.pedirPermiso();
  if (!(r && r.ok)) { decir && decir('Sin ese permiso no puedo ver tus canciones. Puedes darlo luego en Ajustes > Apps > ASAGI > Permisos.'); return false; }
  return true;
}
async function biblioteca(recargar) {
  if (pistas && !recargar) return pistas;
  var r = await P().lista({ recargar: !!recargar });
  pistas = (r && r.pistas) || [];
  return pistas;
}
async function tocar(lista, indice, aleatorio) {
  if (!lista.length) return null;
  est = await P().reproducir({ ids: lista.map(function (x) { return x.id; }), indice: indice || 0, aleatorio: !!aleatorio });
  pintar();
  return lista[indice || 0];
}

// ---- interfaz: mini reproductor + hoja con la lista ----
var mini = null, hoja = null;
function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function boton(txt, etiqueta, fn, cls) { var b = el('button', cls || 'mu-b', txt); b.type = 'button'; b.setAttribute('aria-label', etiqueta); b.title = etiqueta; b.onclick = fn; return b; }
function armarBarra(cls) {
  var m = el('div', 'mu-mini ' + (cls || '')); m.setAttribute('role', 'region'); m.setAttribute('aria-label', 'Música');
  var info = el('button', 'mu-info'); info.type = 'button'; info.setAttribute('aria-label', 'Abrir la lista de música'); info.onclick = function () { abrirHoja(); };
  info.appendChild(el('span', 'mu-nota', '♪')); var tx = el('span', 'mu-tx'); tx.appendChild(el('b', 'mu-ti')); tx.appendChild(el('small', 'mu-ar')); info.appendChild(tx);
  m.appendChild(info);
  m.appendChild(boton('⏮', 'Anterior', function () { ctl('anterior'); }));
  m.appendChild(boton('▶', 'Reproducir o pausar', function () { ctl('alternar'); }, 'mu-b mu-pp'));
  m.appendChild(boton('⏭', 'Siguiente', function () { ctl('siguiente'); }));
  return m;
}
// también en la pantalla de inicio, debajo del buscador (controlas la música sin abrir el chat)
var casa = null;
function crearCasa() {
  if (casa) return casa;
  var ancla = document.getElementById('pend-open');
  if (!ancla || !ancla.parentNode) return null;
  casa = armarBarra('mu-casa');
  ancla.parentNode.insertBefore(casa, ancla.nextSibling);
  return casa;
}
function llenar(m, p) {
  m.hidden = false;
  m.querySelector('.mu-ti').textContent = p.titulo || 'Sin título';
  m.querySelector('.mu-ar').textContent = p.artista || '';
  var pp = m.querySelector('.mu-pp'); pp.textContent = est.sonando ? '⏸' : '▶'; pp.setAttribute('aria-label', est.sonando ? 'Pausar' : 'Reproducir');
  m.classList.toggle('mu-sonando', !!est.sonando);
}
function crearMini() {
  if (mini) return mini;
  mini = el('div', 'mu-mini'); mini.setAttribute('role', 'region'); mini.setAttribute('aria-label', 'Música');
  var info = el('button', 'mu-info'); info.type = 'button'; info.setAttribute('aria-label', 'Abrir la lista de música'); info.onclick = function () { abrirHoja(); };
  info.appendChild(el('span', 'mu-nota', '♪')); var tx = el('span', 'mu-tx'); tx.appendChild(el('b', 'mu-ti')); tx.appendChild(el('small', 'mu-ar')); info.appendChild(tx);
  mini.appendChild(info);
  mini.appendChild(boton('⏮', 'Anterior', function () { ctl('anterior'); }));
  mini.appendChild(boton('▶', 'Reproducir o pausar', function () { ctl('alternar'); }, 'mu-b mu-pp'));
  mini.appendChild(boton('⏭', 'Siguiente', function () { ctl('siguiente'); }));
  var form = document.getElementById('chat-form');
  (form && form.parentNode ? form.parentNode : document.body).insertBefore(mini, form || null);
  return mini;
}
function pintar() {
  var p = est && est.pista;
  if (!est || !est.activo || !p) { if (mini) mini.hidden = true; if (casa) casa.hidden = true; return; }
  llenar(crearMini(), p);
  var c = crearCasa(); if (c) llenar(c, p);
  if (hoja) marcarActual();
}
async function ctl(a) { try { est = await P()[a](); pintar(); } catch (e) {} }

function cerrarHoja() { if (hoja) { hoja.remove(); hoja = null; } }
function marcarActual() {
  var id = est && est.pista && est.pista.id;
  hoja.querySelectorAll('.mu-fila').forEach(function (f) { f.classList.toggle('mu-actual', String(f.dataset.id) === String(id)); });
}
async function abrirHoja(decir) {
  if (!(await asegurarPermiso(decir))) return;
  var todas = await biblioteca();
  cerrarHoja();
  hoja = el('div', 'mu-hoja'); hoja.setAttribute('role', 'dialog'); hoja.setAttribute('aria-label', 'Mi música');
  var cab = el('div', 'mu-cab'); cab.appendChild(el('b', '', '🎵 Mi música · ' + todas.length));
  cab.appendChild(boton('×', 'Cerrar', cerrarHoja, 'mu-x')); hoja.appendChild(cab);
  var busca = el('input', 'mu-busca'); busca.type = 'search'; busca.placeholder = 'Busca canción, artista o álbum'; busca.setAttribute('aria-label', 'Buscar música');
  hoja.appendChild(busca);
  var acc = el('div', 'mu-acc');
  var actuales = todas;
  acc.appendChild(boton('▶ Reproducir', 'Reproducir la lista', function () { tocar(actuales, 0, false); }, 'mu-acc-b'));
  acc.appendChild(boton('🔀 Aleatorio', 'Reproducir en aleatorio', function () { tocar(actuales, Math.floor(Math.random() * actuales.length), true); }, 'mu-acc-b'));
  hoja.appendChild(acc);
  var lista = el('div', 'mu-lista'); hoja.appendChild(lista);
  function render() {
    actuales = busca.value.trim() ? buscar(todas, busca.value) : todas;
    lista.textContent = '';
    if (!todas.length) { lista.appendChild(el('p', 'mu-vacio', 'No encontré canciones en tu celular. Copia música (mp3, m4a…) a la carpeta Música o Descargas y di «mi música» otra vez.')); return; }
    if (!actuales.length) { lista.appendChild(el('p', 'mu-vacio', 'Nada con «' + busca.value + '».')); return; }
    actuales.slice(0, 200).forEach(function (p, i) {
      var f = el('button', 'mu-fila'); f.type = 'button'; f.dataset.id = p.id;
      var t = el('span', 'mu-ft'); t.appendChild(el('b', '', p.titulo)); t.appendChild(el('small', '', p.artista + (p.album ? ' · ' + p.album : '')));
      f.appendChild(t); f.appendChild(el('span', 'mu-dur', mmss(p.dur)));
      f.onclick = function () { tocar(actuales, i, false); };
      lista.appendChild(f);
    });
    if (actuales.length > 200) lista.appendChild(el('p', 'mu-vacio', '…y ' + (actuales.length - 200) + ' más. Busca para encontrarlas.'));
    marcarActual();
  }
  var tmr; busca.oninput = function () { clearTimeout(tmr); tmr = setTimeout(render, 150); };
  render();
  document.body.appendChild(hoja);
}

// ---- ejecutar un comando del chat ----
async function ejecutar(c, decir) {
  var p = P();
  if (!p) { decir('🎵 La música necesita la app instalada en el celular.'); return; }
  if (c.accion === 'abrir') { await abrirHoja(decir); return; }
  if (c.accion === 'quesuena') {
    est = await p.estado(); pintar();
    decir(est.pista ? '🎵 ' + (est.sonando ? 'Suena' : 'En pausa') + ': «' + est.pista.titulo + '» de ' + est.pista.artista : 'No está sonando nada. Di «pon música».');
    return;
  }
  if (c.accion === 'pausa') { await ctl('pausar'); decir('⏸ Pausé la música.'); return; }
  if (c.accion === 'seguir') { await ctl('seguir'); decir('▶ Sigo.'); return; }
  if (c.accion === 'siguiente' || c.accion === 'anterior') { await ctl(c.accion); setTimeout(function () { ctl('estado'); }, 600); return; }
  if (c.accion === 'parar') { await ctl('parar'); if (mini) mini.hidden = true; decir('🔇 Música apagada.'); return; }
  if (c.accion === 'dormir') {
    try { est = await p.dormir({ min: c.min }); }
    catch (e) { decir('No está sonando música. Primero di «pon música».'); return; }
    decir(c.min ? '😴 Pauso la música en ' + c.min + ' minutos.' : 'Cancelé el apagado de la música.');
    return;
  }
  if (c.accion === 'aleatorio') { est = await p.modo({ aleatorio: !est.aleatorio }); decir(est.aleatorio ? '🔀 Aleatorio activado.' : 'Aleatorio desactivado.'); return; }
  if (!(await asegurarPermiso(decir))) return;
  var todas = await biblioteca();
  if (!todas.length) { decir('No encontré canciones en tu celular. Copia música (mp3, m4a…) a la carpeta Música o Descargas.'); return; }
  if (c.accion === 'todo') {
    var pr = await tocar(todas, c.aleatorio ? Math.floor(Math.random() * todas.length) : 0, c.aleatorio);
    decir('🎵 ' + (c.aleatorio ? 'Aleatorio: ' : '') + todas.length + ' canciones. Empieza «' + pr.titulo + '».');
    return;
  }
  var enc = buscar(todas, c.q);
  if (!enc.length) {
    if (c.genero) {   // los géneros casi nunca están en el nombre del archivo: búscalo en YouTube Music
      var C2 = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AsagiControl, u = 'https://music.youtube.com/search?q=' + encodeURIComponent(c.q);
      try { if (C2 && C2.accion) { await C2.accion({ tipo: 'url', url: u }); decir('🎵 No tengo ' + c.q + ' guardado en el celular: te lo abrí en YouTube Music.'); return; } } catch (e) {}
      decir('🎵 No tengo ' + c.q + ' en tu música. Escúchalo aquí: ' + u); return;
    }
    decir('No encontré «' + c.q + '» en tu música. Di «mi música» para ver la lista.'); return;
  }
  var pr2 = await tocar(enc, 0, false);
  decir('🎵 «' + pr2.titulo + '» de ' + pr2.artista + (enc.length > 1 ? ' (+' + (enc.length - 1) + ' más en cola)' : '') + '.');
}

// eventos del servicio (notificación, audífonos, fin de canción)
(function escuchar() {
  var p = P(); if (!p || !p.addListener) return;
  p.addListener('musica', function (e) { est = e || est; pintar(); });
  p.estado().then(function (e) { est = e; pintar(); }).catch(function () {});
})();

var API = { estado: function () { return est; }, parsear: parsear, buscar: buscar, ejecutar: ejecutar, abrir: abrirHoja, activo: function () { return !!(est && est.activo); }, mmss: mmss };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiMusica = API;
})();
