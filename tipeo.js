// Juego de tipeo «Defensa» (idea de Typing Attack, con la paleta de ASAGI): caen palabras, las escribes y la torreta las
// destruye con un rayo; si una cruza la línea roja, pierdes. Marca puntos, palabras por minuto, precisión, racha y nota.
//   «juego de tipeo» / «defensa» / «practica mecanografía» · récord guardado en el celular.
// La lógica (elegir objetivo, puntaje, nota, dificultad) es PURA; el dibujo es un canvas que solo existe mientras juegas.
(function () {
'use strict';
var KR = 'asagi-tipeo-record';
var PALABRAS = ('casa luna fuego noche cielo perro gato libro mesa silla puerta calle agua tierra viento piedra flor arbol rio mar sol nube lluvia trueno ' +
  'codigo tecla pantalla red clave robot datos nube memoria logica bucle funcion variable sistema teclado cursor ventana archivo servidor ' +
  'rapido fuerte claro oscuro nuevo viejo grande pequeno limpio seguro libre justo breve largo dulce frio calor ' +
  'correr saltar pensar crear leer mirar ganar jugar buscar vivir sonar volar romper armar medir sumar ' +
  'energia fuerza masa tiempo espacio numero angulo vector matriz limite derivada integral atomo celula ' +
  'carmesi dorado sombra relampago destello defensa escudo torreta impacto alerta objetivo').split(' ');
function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// PURO
function parsear(t) { return /^(?:juego de tipeo|juego de escribir|juego de teclado|defensa|tipeo|practica(?:r)? (?:mecanografia|tipeo|a escribir rapido)|quiero practicar tipeo)$/.test(norm(t).replace(/[¿?¡!.]+/g, '').trim()); }
// PURO: dificultad según segundos jugados -> {cada (s entre palabras), vel (pantallas/s), largo máx}
function dificultad(seg) { var n = Math.min(1, seg / 120); return { cada: 2.2 - 1.3 * n, vel: 0.055 + 0.075 * n, largo: seg < 20 ? 5 : seg < 60 ? 7 : 10 }; }
// PURO: qué palabra apunta la tecla. Si ya hay objetivo, solo vale su siguiente letra; si no, la palabra más baja que empiece así.
function apuntar(enemigos, objetivo, letra) {
  letra = norm(letra);
  if (objetivo != null) { var o = enemigos.filter(function (e) { return e.id === objetivo; })[0]; if (o) return o.txt.charAt(o.hecho) === letra ? o.id : null; }
  var c = enemigos.filter(function (e) { return e.hecho === 0 && e.txt.charAt(0) === letra; }).sort(function (a, b) { return b.y - a.y; })[0];
  return c ? c.id : null;
}
// PURO
function puntosPalabra(largo, racha) { return Math.round(largo * 10 * (1 + Math.min(racha, 40) * 0.05)); }
function ppm(letrasBien, seg) { return seg > 0 ? Math.round((letrasBien / 5) / (seg / 60)) : 0; }
function nota(ppmV, precision) { var s = ppmV * (precision / 100) * (precision / 100); return s >= 55 ? 'S' : s >= 40 ? 'A' : s >= 28 ? 'B' : s >= 16 ? 'C' : 'D'; }
function elegir(largo, rnd, usadas) { var p = PALABRAS.filter(function (w) { return w.length <= largo && usadas.indexOf(w.charAt(0)) < 0; }); if (!p.length) p = PALABRAS.filter(function (w) { return w.length <= largo; }); return p[Math.floor(rnd() * p.length)]; }

// ---------- juego ----------
function abrir(decir) {
  var v = document.getElementById('tipeo-asagi'); if (v) v.remove();
  v = document.createElement('div'); v.id = 'tipeo-asagi'; v.className = 'tipeo-asagi'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Juego de tipeo');
  v.innerHTML = '<div class="tp-top"><span id="tp-hud">Escribe las palabras antes de que crucen la línea</span><button type="button" id="tp-x">✕</button></div><canvas id="tp-cv"></canvas>' +
    '<input id="tp-in" type="text" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Toca aquí y escribe…" aria-label="Escribe las palabras">';
  document.body.appendChild(v);
  var cv = document.getElementById('tp-cv'), g = cv.getContext('2d'), inp = document.getElementById('tp-in'), hud = document.getElementById('tp-hud');
  var E = [], id = 0, obj = null, pts = 0, racha = 0, bien = 0, mal = 0, t0 = 0, ult = 0, sig = 0, vivo = true, fin = false, rayo = null, raf = 0, W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
  function medir() { var r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function cerrar() { vivo = false; cancelAnimationFrame(raf); window.removeEventListener('resize', medir); v.remove(); }
  document.getElementById('tp-x').addEventListener('click', cerrar);
  window.addEventListener('resize', medir); medir();
  function tecla(ch) {
    if (fin || !/^[a-zñ]$/.test(norm(ch))) return;
    if (!t0) { t0 = performance.now(); ult = t0; }
    var a = apuntar(E, obj, ch);
    if (a == null) { mal++; racha = 0; return; }
    var e = E.filter(function (x) { return x.id === a; })[0]; obj = a; e.hecho++; bien++;
    rayo = { x: e.x, y: e.y, t: performance.now() };
    if (e.hecho >= e.txt.length) { racha++; pts += puntosPalabra(e.txt.length, racha); E.splice(E.indexOf(e), 1); obj = null; if (window.AsagiEfectos) { var r = cv.getBoundingClientRect(); window.AsagiEfectos.destello(r.left + e.x * W, r.top + e.y * H, 0.7); } }
  }
  inp.addEventListener('input', function () { var t = inp.value; inp.value = ''; for (var i = 0; i < t.length; i++) tecla(t.charAt(i)); });
  function terminar() {
    fin = true; var seg = (performance.now() - t0) / 1000, pv = ppm(bien, seg), pr = bien + mal ? Math.round(bien / (bien + mal) * 100) : 0, n = nota(pv, pr);
    var rec = 0; try { rec = parseInt(localStorage.getItem(KR) || '0', 10) || 0; } catch (e) {}
    var nuevo = pts > rec; if (nuevo) { try { localStorage.setItem(KR, String(pts)); } catch (e) {} }
    hud.textContent = 'Fin · nota ' + n + ' · ' + pts + ' pts · ' + pv + ' ppm · ' + pr + '%' + (nuevo ? ' · ¡récord!' : ' · récord ' + rec);
    if (nuevo && window.AsagiEfectos) window.AsagiEfectos.grito('¡RÉCORD!');
    if (decir) decir('⌨ Defensa terminada: nota ' + n + ', ' + pts + ' puntos, ' + pv + ' palabras por minuto, ' + pr + '% de precisión' + (nuevo ? '. ¡Nuevo récord!' : '. Tu récord: ' + rec + '.') + ' Otra: «juego de tipeo».');
    inp.blur(); inp.placeholder = 'Toca ✕ para salir';
  }
  var sem = (Date.now() % 9973) + 1; function rnd() { sem = (sem * 16807) % 2147483647; return sem / 2147483647; }
  (function cuadro(now) {
    if (!vivo) return;
    var LIN = 0.86, dt = t0 ? Math.min(0.05, (now - ult) / 1000) : 0; ult = now;
    if (t0 && !fin) {
      var seg = (now - t0) / 1000, d = dificultad(seg);
      if (seg >= sig) { sig = seg + d.cada; var w = elegir(d.largo, rnd, E.map(function (e) { return e.txt.charAt(0); })); E.push({ id: ++id, txt: w, x: 0.14 + rnd() * 0.72, y: -0.03, hecho: 0 }); }
      E.forEach(function (e) { e.y += d.vel * dt; });
      if (E.some(function (e) { return e.y >= LIN; })) terminar();
      else hud.textContent = pts + ' pts · racha ' + racha + ' · ' + ppm(bien, seg) + ' ppm · ' + (bien + mal ? Math.round(bien / (bien + mal) * 100) : 100) + '%';
    }
    g.clearRect(0, 0, W, H);
    var fx = W / 2, fy = H * LIN + 22;
    g.strokeStyle = 'rgba(220, 20, 60, 0.9)'; g.setLineDash([10, 7]); g.lineWidth = 2; g.beginPath(); g.moveTo(0, H * LIN); g.lineTo(W, H * LIN); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(220, 20, 60, 0.8)'; g.font = '600 9px monospace'; g.textAlign = 'right'; g.fillText('PERÍMETRO · SI CRUZA, PIERDES', W - 8, H * LIN - 6);
    if (rayo && now - rayo.t < 140) { var k = 1 - (now - rayo.t) / 140; g.strokeStyle = 'rgba(255, 215, 0,' + k.toFixed(2) + ')'; g.lineWidth = 2 + 3 * k; g.beginPath(); g.moveTo(fx, fy - 10); g.lineTo(rayo.x * W, rayo.y * H); g.stroke(); }
    g.fillStyle = '#FFD700'; g.beginPath(); g.moveTo(fx, fy - 14); g.lineTo(fx + 11, fy + 8); g.lineTo(fx - 11, fy + 8); g.closePath(); g.fill();          // torreta
    g.textAlign = 'left'; g.font = '700 17px monospace';
    E.forEach(function (e) {
      var tw = g.measureText(e.txt).width, x = Math.max(6, Math.min(W - tw - 22, e.x * W - tw / 2)), y = e.y * H, sel = e.id === obj;
      g.fillStyle = 'rgba(8, 4, 8, 0.85)'; g.strokeStyle = sel ? '#FFD700' : 'rgba(240, 240, 248, 0.35)'; g.lineWidth = sel ? 2 : 1;
      g.beginPath(); if (g.roundRect) g.roundRect(x - 8, y - 18, tw + 16, 26, 6); else g.rect(x - 8, y - 18, tw + 16, 26); g.fill(); g.stroke();
      var he = e.txt.slice(0, e.hecho), hw = g.measureText(he).width;
      g.fillStyle = 'rgba(220, 20, 60, 0.95)'; g.fillText(he, x, y); g.fillStyle = '#F0F0F8'; g.fillText(e.txt.slice(e.hecho), x + hw, y);
      e._px = x + tw / 2;
    });
    if (!t0) { g.fillStyle = 'rgba(240, 240, 248, 0.7)'; g.font = '15px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('Toca la caja de abajo y empieza a escribir', W / 2, H * 0.4); }
    raf = requestAnimationFrame(cuadro);
  })(performance.now());
  // primeras palabras a la vista para que se entienda antes de empezar
  ['luna', 'codigo', 'fuego'].forEach(function (w, i) { E.push({ id: ++id, txt: w, x: 0.25 + i * 0.25, y: 0.12 + i * 0.09, hecho: 0 }); });
  setTimeout(function () { try { inp.focus(); } catch (e) {} }, 350);
  return { tecla: tecla, estado: function () { return { pts: pts, racha: racha, enemigos: E.length, fin: fin }; }, cerrar: cerrar };
}

var API = { parsear: parsear, dificultad: dificultad, apuntar: apuntar, puntosPalabra: puntosPalabra, ppm: ppm, nota: nota, elegir: elegir, abrir: abrir, PALABRAS: PALABRAS };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiTipeo = API;
})();
