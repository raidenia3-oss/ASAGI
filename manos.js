;(function () {
// ASAGI - Modo manos: ASAGI usa las otras apps del celular por ti (Accesibilidad).
//
//   manos: abre whatsapp, toca Juan, escribe hola, toca enviar     -> pasos explícitos
//   manos: pon una alarma a las 7 en el reloj                       -> objetivo libre: ASAGI
//                                                                       mira la pantalla y decide
//                                                                       cada paso (agente, máx 12)
// Seguridad (no negociable):
//  - Nunca escribe en campos de clave (lo bloquea también el lado nativo).
//  - Tocar algo irreversible (enviar, pagar, comprar, borrar, publicar…) pide confirmación.
//  - Apps de banca/pagos: se niega a operar dentro.
//  - Tope de pasos y de tiempo; "para" lo detiene.
// Lo que decide (analizar, riesgo, parsear la respuesta del cerebro) es PURO y testeable.
'use strict';

var RIESGO = /\b(enviar|send|pagar|pago|comprar|compra|confirmar|transferir|borrar|eliminar|delete|publicar|post|aceptar|suscribir|instalar|desinstalar|llamar|call|yapear|plin)\b/i;
var BANCA = /(bank|banco|bcp|interbank|bbva|scotiabank|yape|plin|paypal|binance|wallet|tunki|mercadopago|izipay|lemon)/i;
var MAX_PASOS = 12;

function _n(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }

// Una frase -> un paso. PURO.
function paso(frase) {
  var crudo = String(frase || '').trim(); var t = _n(crudo); var m;
  if (!t) return null;
  if ((m = t.match(/^(?:abre|abrir|entra a|ve a)\s+(?:la app\s+(?:de\s+)?)?(.+)$/))) return { a: 'abrir', app: crudo.slice(crudo.length - m[1].length).trim() };
  if ((m = t.match(/^(?:tocar|toca|pulsa|presiona|dale a|click en|clic en|selecciona)\s+(?:en\s+|el\s+|la\s+)?(.+)$/))) return { a: 'tocar', texto: crudo.slice(crudo.length - m[1].length).trim().replace(/^["«']|["»']$/g, '') };
  if ((m = t.match(/^(?:escribe|escribir|pon el texto|teclea)\s+(.+)$/))) return { a: 'escribir', texto: crudo.slice(crudo.length - m[1].length).trim().replace(/^["«']|["»']$/g, '') };
  if (/^(?:atras|regresa|vuelve|volver)$/.test(t)) return { a: 'global', g: 'atras' };
  if (/^(?:inicio|home|pantalla de inicio)$/.test(t)) return { a: 'global', g: 'inicio' };
  if (/^(?:recientes|apps recientes)$/.test(t)) return { a: 'global', g: 'recientes' };
  if (/^(?:notificaciones|baja las notificaciones)$/.test(t)) return { a: 'global', g: 'notificaciones' };
  if ((m = t.match(/^(?:desplaza|baja|sube|scroll)\s*(arriba|abajo)?$/))) return { a: 'desplazar', dir: m[1] || (/^sube/.test(t) ? 'arriba' : 'abajo') };
  if ((m = t.match(/^espera(?:\s+a\s+que\s+(?:aparezca|salga)\s+(.+))?(?:\s+(\d+)\s*s?)?$/))) {
    if (m[1]) return { a: 'esperarTexto', texto: crudo.slice(crudo.length - m[1].length).trim(), s: 10 };
    return { a: 'esperar', s: Math.min(15, +(m[2] || 2)) };
  }
  return null;
}

// "manos: a, b y luego c" -> pasos o null si alguna frase no se entiende. PURO.
function pasos(texto) {
  var partes = String(texto || '').split(/\s*(?:,|;|\by luego\b|\bluego\b|\bdespu[eé]s\b|\by despu[eé]s\b)\s*/i).filter(Boolean);
  if (partes.length < 2 && !paso(partes[0])) return null;
  var out = [];
  for (var i = 0; i < partes.length; i++) { var p = paso(partes[i]); if (!p) return null; out.push(p); }
  return out.slice(0, MAX_PASOS);
}

function riesgoso(p) { return p && p.a === 'tocar' && RIESGO.test(_n(p.texto)); }
function esBanca(pkgOApp) { return BANCA.test(_n(pkgOApp)); }

// Busca el paquete de una app por su nombre visible. PURO. apps = [{name, package}]
function resolverApp(nombre, apps) {
  var q = _n(nombre); if (!q || !apps) return null;
  var exacta = null, parcial = null;
  for (var i = 0; i < apps.length; i++) {
    var a = apps[i], n = _n(a.name || a.label || ''), pk = _n(a.package || a.packageName || '');
    if (n === q) { exacta = a; break; }
    if (!parcial && (n.indexOf(q) === 0 || n.indexOf(q) >= 0 || pk.indexOf(q.replace(/\s+/g, '')) >= 0)) parcial = a;
  }
  var r = exacta || parcial;
  return r ? (r.package || r.packageName) : null;
}

// Pantalla -> texto compacto para el cerebro. PURO.
function describirPantalla(lec) {
  var l = (lec && lec.nodos) || [];
  return 'App: ' + ((lec && lec.app) || '?') + '\n' + l.slice(0, 60).map(function (n, i) {
    return i + '. ' + (n.t || n.d || '(campo)') + (n.d && n.t ? ' [' + n.d + ']' : '') +
      (n.edit ? ' {campo' + (n.clave ? ' clave' : '') + '}' : '') + (n.clic ? ' {toca}' : '') + (n.scroll ? ' {lista}' : '');
  }).join('\n');
}

// Respuesta del cerebro -> paso. Acepta JSON o "tocar: X". PURO.
function leerDecision(txt) {
  var s = String(txt || '');
  var j = s.match(/\{[\s\S]*?\}/);
  if (j) {
    try {
      var o = JSON.parse(j[0]); var a = _n(o.accion || o.action || '');
      if (a === 'listo' || a === 'fin' || a === 'done') return { a: 'listo', resumen: String(o.resumen || o.texto || '') };
      if (a === 'abrir') return { a: 'abrir', app: String(o.app || o.texto || '') };
      var ref = o.ref != null ? parseInt(String(o.ref).replace(/\D/g, ''), 10) : NaN;
      if (a === 'tocar') return isNaN(ref) ? { a: 'tocar', texto: String(o.texto || o.elemento || '') } : { a: 'tocar', ref: ref, texto: String(o.texto || '') };
      if (a === 'escribir') return isNaN(ref) ? { a: 'escribir', texto: String(o.texto || '') } : { a: 'escribir', ref: ref, texto: String(o.texto || '') };
      if (a === 'atras' || a === 'inicio' || a === 'recientes') return { a: 'global', g: a };
      if (a === 'desplazar') return { a: 'desplazar', dir: _n(o.dir || 'abajo') === 'arriba' ? 'arriba' : 'abajo' };
      if (a === 'esperar') return { a: 'esperar', s: 2 };
      if (a === 'imposible' || a === 'no puedo') return { a: 'imposible', resumen: String(o.resumen || o.motivo || '') };
    } catch (e) {}
  }
  var p = paso(s.split('\n')[0].replace(/^\s*(?:accion|paso)\s*:\s*/i, '').replace(/:\s*/, ' '));
  return p || null;
}

var REGLAS_AGENTE = 'Controlas un celular Android por Daniel. Ves la lista de elementos de la pantalla. ' +
  'Cada elemento tiene un número (ref). Responde SOLO un JSON con UNA acción: {"accion":"tocar","ref":<número>} | ' +
  '{"accion":"escribir","ref":<número del campo>,"texto":"..."} | {"accion":"abrir","app":"<nombre>"} | {"accion":"atras"} | {"accion":"inicio"} | ' +
  '{"accion":"desplazar","dir":"abajo|arriba"} | {"accion":"esperar"} | {"accion":"listo","resumen":"<qué lograste>"} | ' +
  '{"accion":"imposible","resumen":"<por qué>"}. Nunca escribas claves ni datos de tarjetas. Si el objetivo ya se cumplió, responde listo. ' +
  'Usa SOLO números de la pantalla actual; tras cada acción verás la pantalla nueva: si dice (sin cambio), prueba otra cosa.';

// Ref -> nodo de la lectura con la que decidió el modelo (agent-desktop: un ref vale solo para SU vista). PURO.
function nodoPorRef(lec, ref) {
  var l = (lec && lec.nodos) || [];
  return (ref >= 0 && ref < Math.min(l.length, 60)) ? l[ref] : null;
}

// ------------------------------------------------------------------ ejecución
// driver: { leer()->{app,nodos}, tocar(t)->{ok}, escribir(t)->{ok,motivo}, global(g), desplazar(dir), abrir(nombre)->{ok,motivo}, dormir(ms) }
// opts: { confirmar(p)->Promise<bool>, alPaso(p, res), cancelado()->bool }
async function hacer(p, driver, opts) {
  opts = opts || {};
  if (p.a === 'tocar' && riesgoso(p) && !(await (opts.confirmar ? opts.confirmar(p) : Promise.resolve(false))))
    return { ok: false, motivo: 'no confirmaste «' + p.texto + '»', parar: true };
  if (p.a === 'abrir') {
    if (esBanca(p.app)) return { ok: false, motivo: 'no opero apps de banca o pagos', parar: true };
    return driver.abrir(p.app);
  }
  if (p.a !== 'abrir' && p.a !== 'esperar') {
    var lec = null; try { lec = await driver.leer(); } catch (e) {}
    if (lec && esBanca(lec.app)) return { ok: false, motivo: 'estás en una app de banca/pagos: me detengo', parar: true };
  }
  if (p.ref != null && (p.a === 'tocar' || p.a === 'escribir')) {
    var nd = nodoPorRef(opts.vista, p.ref);
    if (!nd) return { ok: false, motivo: 'el ref ' + p.ref + ' no existe en esta pantalla' };
    if (p.a === 'tocar') {
      p.texto = p.texto || nd.t || nd.d || '';
      if (riesgoso({ a: 'tocar', texto: (nd.t || '') + ' ' + (nd.d || '') }) && !(await (opts.confirmar ? opts.confirmar({ texto: nd.t || nd.d }) : Promise.resolve(false))))
        return { ok: false, motivo: 'no confirmaste «' + (nd.t || nd.d) + '»', parar: true };
      return driver.tocarXY ? driver.tocarXY(nd.x, nd.y) : driver.tocar(nd.t || nd.d);
    }
    if (nd.clave) return { ok: false, motivo: 'es un campo de clave: no escribo ahí', parar: true };
    if (driver.tocarXY) { await driver.tocarXY(nd.x, nd.y); await driver.dormir(300); }
    return driver.escribir(p.texto);
  }
  if (p.a === 'tocar') {
    var t = await driver.tocar(p.texto);
    for (var k = 0; k < 4 && !(t && t.ok); k++) {   // no está a la vista: baja la lista y reintenta
      await driver.desplazar('abajo'); await driver.dormir(600);
      t = await driver.tocar(p.texto);
    }
    return t && t.ok ? t : { ok: false, motivo: 'no encontré «' + p.texto + '» en pantalla' };
  }
  if (p.a === 'escribir') return driver.escribir(p.texto);
  if (p.a === 'global') return driver.global(p.g);
  if (p.a === 'desplazar') return driver.desplazar(p.dir);
  if (p.a === 'esperar') { await driver.dormir(p.s * 1000); return { ok: true }; }
  if (p.a === 'esperarTexto') {
    for (var i = 0; i < p.s * 2; i++) {
      var l = await driver.leer();
      if ((l.nodos || []).some(function (n) { return _n(n.t + ' ' + (n.d || '')).indexOf(_n(p.texto)) >= 0; })) return { ok: true };
      await driver.dormir(500);
    }
    return { ok: false, motivo: 'no apareció «' + p.texto + '»' };
  }
  return { ok: false, motivo: 'paso desconocido' };
}

function describir(p) {
  return { abrir: 'abrir ' + p.app, tocar: 'tocar «' + (p.texto || ('#' + p.ref)) + '»', escribir: 'escribir «' + String(p.texto).slice(0, 30) + '»',
           global: p.g, desplazar: 'desplazar ' + p.dir, esperar: 'esperar ' + p.s + ' s', esperarTexto: 'esperar «' + p.texto + '»' }[p.a] || p.a;
}

// Pasos explícitos, en orden. Si uno falla, para y dice dónde.
async function ejecutar(lista, driver, opts) {
  opts = opts || {}; var hechos = [];
  for (var i = 0; i < lista.length; i++) {
    if (opts.cancelado && opts.cancelado()) return { ok: false, hechos: hechos, motivo: 'detenido' };
    var r; try { r = await hacer(lista[i], driver, opts); } catch (e) { r = { ok: false, motivo: String(e && e.message || e) }; }
    if (opts.alPaso) opts.alPaso(lista[i], r);
    if (!r || !r.ok) return { ok: false, hechos: hechos, en: i + 1, paso: describir(lista[i]), motivo: (r && r.motivo) || 'no se pudo' };
    hechos.push(describir(lista[i]));
    await driver.dormir(lista[i].a === 'abrir' ? 1800 : 700);
  }
  return { ok: true, hechos: hechos };
}

// Objetivo libre: mira -> decide -> actúa -> verifica, hasta "listo" o el tope.
async function agente(objetivo, driver, pensar, opts) {
  opts = opts || {}; var hist = [], max = Math.min(opts.max || MAX_PASOS, 20), igual = 0, ultima = '';
  for (var i = 0; i < max; i++) {
    if (opts.cancelado && opts.cancelado()) return { ok: false, hechos: hist, motivo: 'detenido' };
    var lec = await driver.leer();
    if (esBanca(lec.app)) return { ok: false, hechos: hist, motivo: 'estás en una app de banca/pagos: me detengo' };
    var vista = describirPantalla(lec);
    igual = vista === ultima ? igual + 1 : 0; ultima = vista;
    if (igual >= 3) return { ok: false, hechos: hist, motivo: 'la pantalla no cambia; me detengo para no dar vueltas' };
    var resp = await pensar(REGLAS_AGENTE + '\n\nObjetivo: ' + objetivo + '\n\nYa hice: ' + (hist.join(' → ') || 'nada') + '\n\nPantalla:\n' + vista);
    var p = leerDecision(resp);
    if (!p) return { ok: false, hechos: hist, motivo: 'no entendí qué hacer' };
    if (p.a === 'listo') return { ok: true, hechos: hist, resumen: p.resumen };
    if (p.a === 'imposible') return { ok: false, hechos: hist, motivo: p.resumen || 'no se puede' };
    var r; try { r = await hacer(p, driver, Object.assign({}, opts, { vista: lec })); } catch (e) { r = { ok: false, motivo: String(e.message || e) }; }
    if (opts.alPaso) opts.alPaso(p, r);
    if (r && r.parar) { hist.push(describir(p) + ' (falló: ' + r.motivo + ')'); return { ok: false, hechos: hist, motivo: r.motivo }; }
    await driver.dormir(p.a === 'abrir' ? 1800 : 800);
    // verificar (observar -> actuar -> observar): ¿cambió algo?
    var nota = '';
    if (r && r.ok && p.a !== 'esperar') {
      try { var desp = describirPantalla(await driver.leer()); if (desp === vista) nota = ' (sin cambio)'; } catch (e) {}
    }
    hist.push(describir(p) + (r && r.ok ? nota : ' (falló: ' + ((r && r.motivo) || '?') + ')'));
  }
  return { ok: false, hechos: hist, motivo: 'llegué al tope de ' + max + ' pasos' };
}

function formato(r) {
  return (r.ok ? '🖐 Listo' + (r.resumen ? ': ' + r.resumen : '.') : '🖐 Paré' + (r.en ? ' en el paso ' + r.en + ' (' + r.paso + ')' : '') + ': ' + r.motivo) +
    (r.hechos && r.hechos.length ? '\nHice: ' + r.hechos.join(' → ') : '');
}

var API = { paso: paso, pasos: pasos, riesgoso: riesgoso, esBanca: esBanca, resolverApp: resolverApp, describirPantalla: describirPantalla, nodoPorRef: nodoPorRef,
            leerDecision: leerDecision, hacer: hacer, ejecutar: ejecutar, agente: agente, formato: formato, describir: describir, REGLAS_AGENTE: REGLAS_AGENTE };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiManos = API;
})();
