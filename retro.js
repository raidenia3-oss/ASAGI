;(function () {
// ASAGI - taller retro (ideas de ascii-magic.com). Motor PURO y testeable.
// Aqui solo hay aritmetica sobre pixeles: dithering Floyd-Steinberg contra una
// paleta y conversion a arte ASCII. El canvas lo pone la UI (app.js).
// Sin servidores, sin dependencias: corre igual en el navegador y en Node.

'use strict';

// Rampa de densidad: indice 0 = oscuro (denso), ultimo = claro (espacio)
var RAMPA = '@%#*+=-:. ';

var PALETAS = {
  gameboy: [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]],
  pico8: [[0, 0, 0], [29, 43, 83], [126, 37, 83], [0, 135, 81],
          [171, 82, 54], [95, 87, 79], [194, 195, 199], [255, 241, 232],
          [255, 0, 77], [255, 163, 0], [255, 236, 39], [0, 228, 54],
          [41, 173, 255], [131, 118, 156], [255, 119, 168], [255, 204, 170]],
  c64: [[0, 0, 0], [255, 255, 255], [136, 57, 50], [103, 182, 189],
        [139, 63, 150], [85, 160, 73], [64, 49, 141], [191, 206, 114],
        [139, 84, 41], [87, 66, 0], [184, 105, 98], [80, 80, 80],
        [120, 120, 120], [148, 224, 137], [120, 105, 196], [159, 159, 159]],
  verde: [[0, 0, 0], [0, 70, 25], [0, 150, 60], [60, 255, 140], [200, 255, 220]],
  ambar: [[10, 6, 0], [60, 35, 0], [140, 85, 0], [235, 165, 20], [255, 230, 150]],
  bn: [[0, 0, 0], [255, 255, 255]]
};

function paletaNombre(nombre) {
  var k = String(nombre || '').toLowerCase();
  return PALETAS[k] ? k : 'gameboy';
}

function cercano(r, g, b, pal) {
  var mejor = pal[0], bd = Infinity;
  for (var i = 0; i < pal.length; i++) {
    var p = pal[i];
    var d = (r - p[0]) * (r - p[0]) + (g - p[1]) * (g - p[1]) + (b - p[2]) * (b - p[2]);
    if (d < bd) { bd = d; mejor = p; }
  }
  return mejor;
}

// Dither Floyd-Steinberg IN PLACE sobre un Uint8ClampedArray RGBA.
// Devuelve el mismo array (comodo para putImageData).
function ditherData(data, w, h, paleta) {
  if (!data || !w || !h) return data;
  var pal = PALETAS[paletaNombre(paleta)];
  var err = new Float32Array(w * h * 3);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var i = (y * w + x) * 4, e = (y * w + x) * 3;
      var r = data[i] + err[e];
      var g = data[i + 1] + err[e + 1];
      var b = data[i + 2] + err[e + 2];
      var p = cercano(r, g, b, pal);
      data[i] = p[0]; data[i + 1] = p[1]; data[i + 2] = p[2];
      var er = r - p[0], eg = g - p[1], eb = b - p[2];
      acumular(err, w, h, x + 1, y, er, eg, eb, 7 / 16);
      acumular(err, w, h, x - 1, y + 1, er, eg, eb, 3 / 16);
      acumular(err, w, h, x, y + 1, er, eg, eb, 5 / 16);
      acumular(err, w, h, x + 1, y + 1, er, eg, eb, 1 / 16);
    }
  }
  return data;
}

function acumular(err, w, h, x, y, er, eg, eb, f) {
  if (x < 0 || x >= w || y < 0 || y >= h) return;
  var e = (y * w + x) * 3;
  err[e] += er * f; err[e + 1] += eg * f; err[e + 2] += eb * f;
}

// Pixels -> arte ASCII. `ancho` en caracteres (20..200).
function asciiDeData(data, w, h, ancho, rampa) {
  if (!data || !w || !h) return '';
  var rp = rampa || RAMPA;
  ancho = Math.max(20, Math.min(200, parseInt(ancho, 10) || 90));
  var n = rp.length - 1;
  var alto = Math.max(1, Math.round(ancho * h / w * 0.5));   // 0.5 = aspecto del caracter
  var lineas = [];
  for (var ay = 0; ay < alto; ay++) {
    var sy = Math.min(h - 1, Math.floor((ay + 0.5) * h / alto));
    var linea = '';
    for (var ax = 0; ax < ancho; ax++) {
      var sx = Math.min(w - 1, Math.floor((ax + 0.5) * w / ancho));
      var i = (sy * w + sx) * 4;
      var lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      linea += rp[Math.min(n, Math.round(lum * n))];
    }
    lineas.push(linea.replace(/\s+$/, ''));
  }
  return lineas.join('\n');
}

var API = { RAMPA: RAMPA, PALETAS: PALETAS, paletaNombre: paletaNombre,
            ditherData: ditherData, asciiDeData: asciiDeData };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiRetro = API;

})();
