// ASAGI - tests del motor retro (puro, sin navegador): node retro-test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('./retro.js');

let fallos = 0, total = 0;
function check(label, ok, detalle = '') {
  total += 1;
  if (ok) { console.log('  ok   ' + label); }
  else { fallos += 1; console.log('  FAIL ' + label + ' ' + detalle); }
}

// --- paletas ---
check('6 paletas disponibles', Object.keys(R.PALETAS).length === 6, JSON.stringify(Object.keys(R.PALETAS)));
check('paleta desconocida cae a gameboy', R.paletaNombre('inventada') === 'gameboy');

// --- dither: 4x4 mitad negro mitad blanco ---
const w = 4, h = 4;
const data = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const v = x < 2 ? 0 : 255;
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
  }
}
const antes = Array.from(data);
R.ditherData(data, w, h, 'bn');
const colores = new Set();
for (let i = 0; i < data.length; i += 4) colores.add(data[i] + ',' + data[i + 1] + ',' + data[i + 2]);
check('bn solo usa blanco y negro', [...colores].every((c) => c === '0,0,0' || c === '255,255,255'), JSON.stringify([...colores]));
check('bn no toca lo que ya esta en paleta', Array.from(data).join() === antes.join(),
  'blanco/negro puros no necesitan difusion: salida identica es lo correcto');

// --- dither real: gris 128 con paleta bn -> patron de difusion ---
const gris = new Uint8ClampedArray(4 * 4 * 4);
for (let i = 0; i < gris.length; i += 4) {
  gris[i] = 128; gris[i + 1] = 128; gris[i + 2] = 128; gris[i + 3] = 255;
}
R.ditherData(gris, 4, 4, 'bn');
let negros = 0, blancos = 0;
for (let i = 0; i < gris.length; i += 4) { if (gris[i] === 0) negros++; else blancos++; }
check('gris 128 se reparte entre negro y blanco', negros > 0 && blancos > 0, 'negros=' + negros + ' blancos=' + blancos);
check('gris 128 queda mitad y mitad', negros === 8 && blancos === 8, 'negros=' + negros);

// --- dither gameboy: solo colores de la paleta ---
const d2 = new Uint8ClampedArray([200, 120, 40, 255, 10, 200, 90, 255, 90, 30, 240, 255, 250, 250, 250, 255]);
R.ditherData(d2, 2, 2, 'gameboy');
const palGB = new Set(R.PALETAS.gameboy.map((p) => p.join(',')));
let dentro = true;
for (let i = 0; i < d2.length; i += 4) {
  if (!palGB.has(d2[i] + ',' + d2[i + 1] + ',' + d2[i + 2])) dentro = false;
}
check('gameboy solo usa sus 4 verdes', dentro, [...palGB].join(' | '));
check('alfa intacto tras dither', d2[3] === 255 && d2[7] === 255);

// --- dither no explota con datos vacios ---
let sinError = true;
try { R.ditherData(new Uint8ClampedArray(4), 1, 1, 'pico8'); } catch (e) { sinError = false; }
check('dither tolera imagen 1x1', sinError);

// --- ascii ---
const w2 = 40, h2 = 20;
const d3 = new Uint8ClampedArray(w2 * h2 * 4);
for (let y = 0; y < h2; y++) {
  for (let x = 0; x < w2; x++) {
    const i = (y * w2 + x) * 4;
    const v = Math.round((x / (w2 - 1)) * 255);   // degradado horizontal
    d3[i] = v; d3[i + 1] = v; d3[i + 2] = v; d3[i + 3] = 255;
  }
}
const arte = R.asciiDeData(d3, w2, h2, 40);
check('ascii devuelve texto', typeof arte === 'string' && arte.length > 20);
check('ascii respeta el ancho pedido', arte.split('\n')[0].length <= 40, 'largo=' + arte.split('\n')[0].length);
check('ascii empieza oscuro (izquierda densa)', arte.split('\n')[0][0] === R.RAMPA[0],
  'primera=' + arte.split('\n')[0][0]);
check('ascii aclara hacia la derecha',
  R.RAMPA.indexOf(arte.split('\n')[0][30]) > R.RAMPA.indexOf(arte.split('\n')[0][0]),
  'x0=' + arte.split('\n')[0][0] + ' x30=' + arte.split('\n')[0][30]);
check('ascii recorta espacios finales', !/ +$/.test(arte.split('\n')[0]),
  'la derecha clara se recorta a proposito');
check('ascii limita ancho a 200', R.asciiDeData(d3, w2, h2, 999).split('\n')[0].length <= 200);
check('ascii sin datos -> cadena vacia', R.asciiDeData(null, 0, 0, 40) === '');

console.log(`\n${total - fallos}/${total} comprobaciones OK`);
process.exit(fallos ? 1 : 0);
