;(function () {
// ASAGI - Recon pasivo de dominios (idea OSINT, defensivo). Consulta DNS por
// DNS-over-HTTPS (dns.google, con CORS, sin API key) y muestra a qué resuelve un
// dominio: IPs, servidores de correo, nameservers y TXT (SPF/verificaciones).
// 100% pasivo: solo mira información pública, no escanea ni ataca nada.
//
// Lógica PURA y testeable (normalizar, armar URL, interpretar). El fetch lo hace la UI.

'use strict';

var TIPOS = { A: 1, AAAA: 28, MX: 15, NS: 2, TXT: 16, CNAME: 5 };

function normalizarDominio(entrada) {
  var s = String(entrada || '').trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, '');     // quita http:// https:// etc.
  s = s.replace(/[/?#].*$/, '');          // quita ruta/query
  s = s.replace(/:\d+$/, '');             // quita puerto
  s = s.replace(/\.+$/, '');              // quita punto final
  return s;
}

function valido(dom) {
  return /^([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/i.test(dom);
}

function urlDoH(dom, tipoNombre) {
  var t = TIPOS[tipoNombre] || 1;
  return 'https://dns.google/resolve?name=' + encodeURIComponent(dom) + '&type=' + t;
}

// Interpreta la respuesta JSON de dns.google para un tipo. Puro.
// Devuelve { ok, estado, registros:[string], nombre }
function interpretar(json, tipoNombre) {
  if (!json || typeof json.Status !== 'number') return { ok: false, estado: -1, registros: [], nombre: tipoNombre };
  var tnum = TIPOS[tipoNombre] || 1;
  var ans = json.Answer || [];
  var regs = ans
    .filter(function (a) { return a && a.type === tnum; })
    .map(function (a) { return limpiarDato(String(a.data || ''), tipoNombre); })
    .filter(function (x) { return x; });
  return { ok: json.Status === 0, estado: json.Status, registros: regs, nombre: tipoNombre };
}

function limpiarDato(data, tipoNombre) {
  var d = data.replace(/\.$/, '');        // quita punto final de nombres
  if (tipoNombre === 'TXT') d = d.replace(/^"|"$/g, '');
  return d;
}

// Nombre legible del tipo de registro.
var ETIQUETA = { A: 'IPv4', AAAA: 'IPv6', MX: 'Correo (MX)', NS: 'Nameservers', TXT: 'TXT / SPF', CNAME: 'CNAME' };

var API = { TIPOS, ETIQUETA, normalizarDominio, valido, urlDoH, interpretar, limpiarDato };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiRecon = API;

})();
