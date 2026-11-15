// Lista de compras sin internet ni cerebro (idea de philip211/home-assistant-AI-APK: compras por voz).
//   «agrega pan y leche a la lista» · «anota huevos en la compra» · «mi lista de compras» / «qué compro»
//   «ya compré pan» · «quita leche de la lista» · «limpia la lista de compras» (borra solo lo ya comprado)
// Se guarda en el celular (localStorage 'asagi-compras'); nada sale del teléfono.
(function () {
'use strict';
var CLAVE = 'asagi-compras';
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.]+/g, '').replace(/\s+/g, ' ').trim(); }
var LISTA = '(?:la |mi )?(?:lista(?: de (?:compras?|mercado|super))?|compras?|mercado)';

// «pan, leche y 2 kilos de arroz» -> ['pan', 'leche', '2 kilos de arroz']
function separar(s) {
  return String(s || '').split(/\s*,\s*|\s+y\s+|\s+e\s+(?=[iy])/i).map(function (x) { return x.replace(/^(?:un|una|unos|unas|el|la|los|las)\s+/i, '').trim(); })
    .filter(function (x) { return x.length > 0 && x.length <= 40; });
}
// El texto original con tildes, recortado a la parte que coincide en el normalizado (mismo largo: norm no cambia letras de lugar salvo signos).
function orig(t, parteNorm) {
  var o = String(t || '').replace(/[¿?¡!.]+/g, '').replace(/\s+/g, ' ').trim(), n = norm(o), i = n.indexOf(parteNorm);
  return i >= 0 && n.length === o.length ? o.substr(i, parteNorm.length) : parteNorm;
}

// PURO: entiende la frase o devuelve null.
function parsear(t) {
  var n = norm(t), m;
  if (new RegExp('^(?:mi |ver (?:la |mi )?|muestrame (?:la |mi )?|que hay en (?:la |mi )?)?' + LISTA + '$').test(n) && /compra|mercado/.test(n) && !/^(?:compra|compras)$/.test(n)) return { tipo: 'ver' };
  if (/^(?:que (?:tengo que |me falta |hay que )?compr(?:o|ar)|que falta comprar)$/.test(n)) return { tipo: 'ver' };
  if (new RegExp('^(?:limpia|vacia|borra lo comprado de) ' + LISTA + '$').test(n) && /compra|mercado/.test(n)) return { tipo: 'limpiar' };
  if ((m = n.match(new RegExp('^(?:agrega|agregar|anade|anadir|anota|apunta|pon|mete|suma)(?:le)? (.{1,120}?) (?:a|en|para) ' + LISTA + '$')))) return { tipo: 'agregar', cosas: separar(orig(t, m[1])) };
  if ((m = n.match(/^(?:hay que comprar|tengo que comprar|falta comprar|me falta comprar) (.{1,120})$/))) return { tipo: 'agregar', cosas: separar(orig(t, m[1])) };
  if ((m = n.match(/^ya compre (.{1,120})$/))) return { tipo: 'comprado', cosas: separar(orig(t, m[1])) };
  if ((m = n.match(new RegExp('^(?:quita|saca|borra|elimina) (.{1,120}?) de ' + LISTA + '$')))) return { tipo: 'quitar', cosas: separar(orig(t, m[1])) };
  return null;
}

// PURO: aplica la orden a la lista y devuelve { lista, texto }.
function aplicar(lista, c) {
  lista = (Array.isArray(lista) ? lista : []).slice();
  var igual = function (a, b) { return norm(a) === norm(b); };
  var busca = function (x) { var k = norm(x); return lista.findIndex(function (it) { var j = norm(it.texto); return j === k || (k.length >= 3 && j.length >= 3 && (j.indexOf(k) >= 0 || k.indexOf(j) >= 0)); }); };
  var faltan = function () { return lista.filter(function (it) { return !it.hecho; }); };
  if (c.tipo === 'agregar') {
    var nuevos = [], ya = [];
    c.cosas.forEach(function (x) {
      var i = lista.findIndex(function (it) { return igual(it.texto, x); });
      if (i >= 0 && !lista[i].hecho) ya.push(x);
      else if (i >= 0) { lista[i] = { texto: lista[i].texto, hecho: false }; nuevos.push(x); }
      else { lista.push({ texto: x, hecho: false }); nuevos.push(x); }
    });
    if (lista.length > 100) lista = lista.slice(-100);
    var t = nuevos.length ? '🛒 Anotado: ' + nuevos.join(', ') + '.' : '';
    if (ya.length) t += (t ? ' ' : '🛒 ') + 'Ya estaba: ' + ya.join(', ') + '.';
    return { lista: lista, texto: t + ' En la lista: ' + faltan().length + '.' };
  }
  if (c.tipo === 'comprado' || c.tipo === 'quitar') {
    var ok = [], no = [];
    c.cosas.forEach(function (x) {
      var i = busca(x);
      if (i < 0) { no.push(x); return; }
      ok.push(lista[i].texto);
      if (c.tipo === 'quitar') lista.splice(i, 1); else lista[i] = { texto: lista[i].texto, hecho: true };
    });
    var r = ok.length ? (c.tipo === 'quitar' ? '🗑 Quité: ' : '✅ Marcado como comprado: ') + ok.join(', ') + '.' : '';
    if (no.length) r += (r ? ' ' : '') + 'No estaba en la lista: ' + no.join(', ') + '.';
    var f = faltan();
    r += f.length ? ' Falta: ' + f.map(function (it) { return it.texto; }).join(', ') + '.' : ' ¡Lista completa!';
    return { lista: lista, texto: r };
  }
  if (c.tipo === 'limpiar') {
    var antes = lista.length; lista = faltan();
    return { lista: lista, texto: '🧹 Borré ' + (antes - lista.length) + ' cosa(s) ya comprada(s).' + (lista.length ? ' Quedan ' + lista.length + '.' : ' La lista quedó vacía.') };
  }
  var fl = faltan(), hechos = lista.length - fl.length;
  if (!lista.length) return { lista: lista, texto: '🛒 Tu lista de compras está vacía. Di «agrega pan y leche a la lista».' };
  return { lista: lista, texto: '🛒 Lista de compras' + (fl.length ? ' (' + fl.length + '):\n' + fl.map(function (it) { return '• ' + it.texto; }).join('\n') : ': ya compraste todo.') +
    (hechos ? '\n(' + hechos + ' ya comprada(s); di «limpia la lista de compras» para borrarlas)' : '') };
}

function leer() { try { var l = JSON.parse(localStorage.getItem(CLAVE) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
function guardar(l) { try { localStorage.setItem(CLAVE, JSON.stringify(l)); } catch (e) {} }
function hacer(c) { var r = aplicar(leer(), c); if (c.tipo !== 'ver') { guardar(r.lista); if (API.repintar) try { API.repintar(); } catch (e) {} } return r.texto; }
function faltantes() { return leer().filter(function (it) { return !it.hecho; }); }

// Panel visible en «Pendientes»: tocar = comprado/no comprado; campo para añadir («pan, leche y huevos»).
function panel() {
  if (typeof document === 'undefined') return;
  var caja = document.getElementById('compras-panel'); if (!caja) return;
  var ul = caja.querySelector('.co-lista'), inp = caja.querySelector('.co-input'), cnt = caja.querySelector('.co-cnt'), limp = caja.querySelector('.co-limpiar');
  function pintar() {
    var l = leer(); ul.innerHTML = '';
    l.slice().sort(function (a, b) { return (a.hecho ? 1 : 0) - (b.hecho ? 1 : 0); }).forEach(function (it) {
      var li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'co-item' + (it.hecho ? ' hecho' : '');
      b.setAttribute('aria-pressed', it.hecho ? 'true' : 'false');
      b.textContent = (it.hecho ? '✓ ' : '○ ') + it.texto;
      b.addEventListener('click', function () {
        var x = leer(), i = x.findIndex(function (o) { return o.texto === it.texto; });
        if (i >= 0) { x[i] = { texto: x[i].texto, hecho: !x[i].hecho }; guardar(x); pintar(); }
      });
      li.appendChild(b); ul.appendChild(li);
    });
    var f = l.filter(function (it) { return !it.hecho; }).length;
    cnt.textContent = l.length ? f + ' por comprar' : 'vacía';
    limp.hidden = !l.some(function (it) { return it.hecho; });
  }
  function anadir() { var t = inp.value.trim(); if (!t) return; var c = separar(t); if (c.length) { guardar(aplicar(leer(), { tipo: 'agregar', cosas: c }).lista); } inp.value = ''; pintar(); }
  caja.querySelector('.co-add').addEventListener('click', anadir);
  inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); anadir(); } });
  limp.addEventListener('click', function () { guardar(aplicar(leer(), { tipo: 'limpiar' }).lista); pintar(); });
  window.addEventListener('storage', pintar);
  document.addEventListener('asagi-compras', pintar);
  pintar();
  API.repintar = pintar;
}

var API = { parsear: parsear, aplicar: aplicar, hacer: hacer, faltantes: faltantes, separar: separar };
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', panel); else setTimeout(panel, 0); }
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiCompras = API;
})();
