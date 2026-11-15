// «Resumen del día» sin internet ni cerebro: lo que importa hoy en un solo mensaje.
//   «resumen del día» · «cómo va mi día» · «qué tengo hoy» · «mi día» · «buenos días» / «buenas noches»
// Junta: hora y fecha, pendientes de hoy, batería, música, gastos de hoy y notificaciones (si diste esos permisos).
(function () {
'use strict';
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,]+/g, '').replace(/\s+/g, ' ').trim(); }

// PURO
function parsear(t) {
  var n = norm(t);
  if (/^(?:resumen del dia|resumen de hoy|como va mi dia|que tengo hoy|que tengo para hoy|mi dia|como va el dia)$/.test(n)) return { momento: 'dia' };
  if (/^(?:buenos dias|buen dia)(?: asagi)?$/.test(n)) return { momento: 'manana' };
  if (/^(?:buenas noches|cierre del dia|como me fue hoy)(?: asagi)?$/.test(n)) return { momento: 'noche' };
  return null;
}
function saludo(momento, h) {
  if (momento === 'noche') return '🌙 Cierre del día';
  if (h < 5) return '🌙 Buenas noches, Daniel';
  if (h < 12) return '☀ Buenos días, Daniel';
  if (h < 19) return '🌤 Buenas tardes, Daniel';
  return '🌙 Buenas noches, Daniel';
}
function hora12(d) {
  var h = d.getHours(), m = ('0' + d.getMinutes()).slice(-2);
  return ((h % 12) || 12) + ':' + m + (h < 12 ? ' a. m.' : ' p. m.');
}
// Arma el texto con lo que haya. PURO (recibe los datos ya leídos).
function armar(d, momento, x) {
  var l = [saludo(momento, d.getHours()) + ' · ' + d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }) + ', ' + hora12(d)];
  var pen = x.pendientes || [];
  if (momento === 'noche') l.push(pen.length ? '📌 Quedan ' + pen.length + ' pendiente(s): ' + pen.slice(0, 3).map(function (p) { return p.texto; }).join(' · ') + '.' : '📌 Sin pendientes: día cerrado.');
  else l.push(pen.length ? '📌 Para hoy (' + pen.length + '): ' + pen.slice(0, 4).map(function (p) { return p.texto; }).join(' · ') + '.' : '📌 Nada pendiente hoy. Dime «recuérdame…» si algo surge.');
  if (x.clima) l.push(x.clima);
  if (x.compras && x.compras.length) l.push('🛒 Por comprar (' + x.compras.length + '): ' + x.compras.slice(0, 4).join(', ') + (x.compras.length > 4 ? '…' : '') + '.');
  if (x.gastoHoy != null) l.push('💸 Hoy: gastaste S/ ' + x.gastoHoy.toFixed(2) + (x.ingresoHoy ? ' y recibiste S/ ' + x.ingresoHoy.toFixed(2) : '') + '.');
  if (x.notif && x.notif.total) l.push('🔔 ' + x.notif.total + ' notificación(es)' + (x.notif.top ? ', sobre todo de ' + x.notif.top : '') + '.');
  if (x.bateria != null) l.push((x.bateria <= 20 ? '🪫 Batería baja: ' : '🔋 Batería: ') + x.bateria + '%' + (x.cargando ? ' (cargando)' : '') + '.');
  if (x.musica) l.push('🎵 ' + (x.musica.sonando ? 'Suena' : 'En pausa') + ': «' + x.musica.titulo + '».');
  if (momento === 'manana' && !x.musica) l.push('¿Algo de música para empezar? Di «pon música».');
  return l.join('\n');
}

// ---- con lo real del celular (cada parte es opcional; si algo falla, se omite) ----
async function datos() {
  var x = {};
  try {
    var l = JSON.parse(localStorage.getItem('asagi-pendientes') || '[]'), fin = new Date(); fin.setHours(23, 59, 59, 999);
    x.pendientes = (Array.isArray(l) ? l : []).filter(function (p) { return p && !p.hecho && (!p.cuando || p.cuando <= fin.getTime()); });
  } catch (e) { x.pendientes = []; }
  try { var CO = window.AsagiCompras; if (CO) x.compras = CO.faltantes().map(function (it) { return it.texto; }); } catch (e) {}
  var C = window.Capacitor && window.Capacitor.Plugins, AC = C && C.AsagiControl;
  try {
    var b = AC && AC.accion ? await AC.accion({ tipo: 'bateria' }) : null;
    if (!(b && b.ok) && typeof navigator !== 'undefined' && navigator.getBattery) { var nb = await navigator.getBattery(); b = { ok: true, porcentaje: Math.round(nb.level * 100), cargando: nb.charging }; }
    if (b && b.ok && b.porcentaje >= 0) { x.bateria = b.porcentaje; x.cargando = !!b.cargando; }
  } catch (e) {}
  try {
    var NT = window.AsagiNotif;
    if (AC && AC.notifEstado && NT && (await AC.notifEstado()).activo) {
      var ini = new Date(); ini.setHours(0, 0, 0, 0);
      var f = await AC.notifFinanzas({ desde: ini.getTime() });
      var movs = NT.unicos(((f && f.lista) || []).map(NT.movimiento).filter(Boolean)).filter(function (m) { return m.moneda === 'PEN'; });
      x.gastoHoy = movs.filter(function (m) { return m.tipo === 'gasto'; }).reduce(function (s, m) { return s + m.valor; }, 0);
      x.ingresoHoy = movs.filter(function (m) { return m.tipo === 'ingreso'; }).reduce(function (s, m) { return s + m.valor; }, 0);
      var nl = ((await AC.notifLista()) || {}).lista || [], por = {};
      nl.forEach(function (o) { var k = o.nombre || o.app; por[k] = (por[k] || 0) + 1; });
      var top = Object.keys(por).sort(function (a, b) { return por[b] - por[a]; })[0];
      x.notif = { total: nl.length, top: top };
    }
  } catch (e) {}
  // clima de hoy (ciudad elegida o Lima), con tope de 4 s para no hacer esperar
  try {
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      var ciudad = 'Lima'; try { ciudad = localStorage.getItem('asagi-ciudad') || 'Lima'; } catch (e) {}
      var tope = function (p) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('lento')); }, 4000); })]); };
      var g = await tope(fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&name=' + encodeURIComponent(ciudad)).then(function (r) { return r.json(); }));
      var pl = g && g.results && g.results[0];
      if (pl) {
        var w = await tope(fetch('https://api.open-meteo.com/v1/forecast?latitude=' + pl.latitude + '&longitude=' + pl.longitude + '&current=temperature_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1').then(function (r) { return r.json(); }));
        if (w && w.daily) {
          var ll = (w.daily.precipitation_probability_max || [0])[0] || 0;
          x.clima = (ll >= 50 ? '🌧 ' : '🌤 ') + pl.name + ': ' + Math.round(w.daily.temperature_2m_min[0]) + '° a ' + Math.round(w.daily.temperature_2m_max[0]) + '°' + (ll >= 30 ? ', ' + ll + '% de lluvia' + (ll >= 50 ? ' (lleva paraguas)' : '') : '') + '.';
        }
      }
    }
  } catch (e) {}
  try { var M = window.AsagiMusica, e2 = M && M.estado && M.estado(); if (e2 && e2.activo && e2.pista) x.musica = { titulo: e2.pista.titulo, sonando: e2.sonando }; } catch (e) {}
  return x;
}
async function decir(c, fn) { fn(armar(new Date(), c.momento, await datos())); }

var API = { parsear: parsear, armar: armar, decir: decir };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiResumenDia = API;
})();
