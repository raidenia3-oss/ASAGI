// Generador de contraseñas sin internet (idea del generador de KeePassDX: https://github.com/Kunzisoft/KeePassDX).
// «genera una contraseña», «contraseña de 24», «frase clave» (fácil de decir), «pin de 6».
// Usa el azar del sistema (crypto.getRandomValues). NO guarda nada: la contraseña vive solo en la RAM
// hasta cerrar ASAGI (no va al historial, ni a la memoria, ni a la voz).
(function (root) {
  'use strict';
  var LETRAS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';   // sin l, o, I, O (se confunden)
  var NUMS = '23456789';                                              // sin 0 ni 1
  var SIMB = '!#$%&*+-=?@_';
  var CONS = 'bcdfgjklmnprstvz', VOC = 'aeiou';

  function azar(n) {                       // entero uniforme en [0, n) sin sesgo
    var c = root.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);
    var lim = Math.floor(4294967296 / n) * n, b = new Uint32Array(1);
    do { c.getRandomValues(b); } while (b[0] >= lim);
    return b[0] % n;
  }
  function de(s) { return s.charAt(azar(s.length)); }
  function bits(nOpc, veces) { return Math.round(Math.log2(nOpc) * veces); }
  function nivel(b) { return b < 50 ? 'débil' : b < 70 ? 'buena' : b < 100 ? 'fuerte' : 'muy fuerte'; }

  function _n(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim(); }

  var PRE = '(?:(?:genera(?:me)?|dame|crea(?:me)?|hazme|necesito|quiero) )?(?:una? )?(?:nueva? )?';
  var RX_PIN = new RegExp('^' + PRE + 'pin(?: nuevo)?(?: de (\\d{1,2})(?: digitos| numeros)?)?$');
  var RX_FRASE = new RegExp('^' + PRE + '(?:frase clave|frase contrasena|contrasena facil de (?:recordar|decir))$');
  var RX_CLAVE = new RegExp('^' + PRE + '(?:contrasena|password)(?: nueva)?(?: (?:segura|fuerte|aleatoria))?(?: de (\\d{1,2})(?: caracteres| letras)?)?( sin simbolos)?$');
  function parsear(texto) {
    var n = _n(texto), m;
    if (n === 'pin' || n === 'contrasena') return null;           // una palabra suelta puede ser otra cosa
    if ((m = n.match(RX_PIN))) return { tipo: 'pin', largo: Math.min(12, Math.max(4, +(m[1] || 6))) };
    if (RX_FRASE.test(n)) return { tipo: 'frase', palabras: 5 };
    if ((m = n.match(RX_CLAVE))) return { tipo: 'clave', largo: Math.min(64, Math.max(8, +(m[1] || 20))), simbolos: !m[2] };
    return null;
  }

  function generar(c) {
    var v = '', b = 0, i;
    if (c.tipo === 'pin') { for (i = 0; i < c.largo; i++) v += String(azar(10)); b = bits(10, c.largo); }
    else if (c.tipo === 'frase') {
      var pal = [];
      for (i = 0; i < c.palabras; i++) { var w = ''; for (var s = 0; s < 3; s++) w += de(CONS) + de(VOC); pal.push(w.charAt(0).toUpperCase() + w.slice(1)); }
      var num = String(10 + azar(90));
      v = pal.join('-') + '-' + num; b = bits(CONS.length * VOC.length, 3 * c.palabras) + bits(90, 1);
    } else {
      var todo = LETRAS + NUMS + (c.simbolos ? SIMB : '');
      // al menos un número (y un símbolo si se piden), en posición al azar
      var arr = []; for (i = 0; i < c.largo; i++) arr.push(de(todo));
      arr[azar(arr.length)] = de(NUMS);
      if (c.simbolos) { var p; do { p = azar(arr.length); } while (NUMS.indexOf(arr[p]) >= 0 && arr.length > 2); arr[p] = de(SIMB); }
      v = arr.join(''); b = bits(todo.length, c.largo - (c.simbolos ? 2 : 1)) + bits(NUMS.length, 1) + (c.simbolos ? bits(SIMB.length, 1) : 0);
    }
    return { valor: v, bits: b, nivel: nivel(b) };
  }

  function texto(c, g) {
    var que = c.tipo === 'pin' ? 'PIN de ' + c.largo + ' números' : c.tipo === 'frase' ? 'Frase clave (fácil de decir y escribir)' : 'Contraseña de ' + c.largo + ' caracteres';
    return '🔐 ' + que + (c.tipo === 'pin' ? ' (úsalo donde se bloquea tras varios intentos).' : ': ' + g.nivel + ' (~' + g.bits + ' bits).') + '\nToca el botón Copiar. No la guardo: al cerrar ASAGI desaparece de aquí.' +
      (c.tipo === 'pin' ? '' : '\nOtra: «contraseña de 24», «contraseña sin símbolos», «frase clave» o «pin de 6».');
  }

  var API = { parsear: parsear, generar: generar, texto: texto, nivel: nivel };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.AsagiContrasena = API;
})(typeof window !== 'undefined' ? window : globalThis);
