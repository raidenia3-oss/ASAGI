;(function () {
// ASAGI - Bloqueo de anuncios (a nivel de dominio). Motor de lista; la aplicacion
// a TODO el celular la hace un VpnService nativo (DNS blackhole) que consulta este
// motor por cada peticion. Bloquear anuncios en TU propio dispositivo es legitimo.
//
// Aqui esta el "que bloquear": esAnuncio(host) contra una blocklist de dominios de
// anuncios/rastreadores (dominio exacto o subdominio). PURO y testeable. La lista se
// puede ampliar cargando blocklists publicas (hosts) con cargarLista().

'use strict';

// Semilla de dominios de anuncios/rastreo mas comunes (ampliable).
const BLOCKLIST = new Set([
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'google-analytics.com', 'googletagmanager.com', 'googletagservices.com',
  'adservice.google.com', 'admob.com', 'app-measurement.com',
  'ads.yahoo.com', 'adcolony.com', 'applovin.com', 'unityads.unity3d.com',
  'unity3dads.com', 'facebook.net', 'graph.facebook.com', 'ads-twitter.com',
  'analytics.twitter.com', 'scorecardresearch.com', 'moatads.com',
  'adnxs.com', 'rubiconproject.com', 'pubmatic.com', 'criteo.com',
  'taboola.com', 'outbrain.com', 'inmobi.com', 'mopub.com', 'chartboost.com',
  'vungle.com', 'startappservice.com', 'flurry.com', 'appsflyer.com',
  'adjust.com', 'branch.io', 'crashlytics.com', 'mixpanel.com', 'amplitude.com',
]);

function normalizar(host) {
  return String(host || '').trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

// ¿host es (o es subdominio de) un dominio bloqueado? Puro.
function esAnuncio(host, blocklist = BLOCKLIST) {
  const h = normalizar(host);
  if (!h) return false;
  if (blocklist.has(h)) return true;
  // subdominio: a.b.ads.com -> prueba ads.com, b.ads.com...
  const partes = h.split('.');
  for (let i = 1; i < partes.length - 1; i++) {
    if (blocklist.has(partes.slice(i).join('.'))) return true;
  }
  return false;
}

// Carga una blocklist estilo /etc/hosts o lista de dominios. Devuelve un Set nuevo
// combinando la semilla con lo cargado. Puro (recibe el texto).
function cargarLista(texto, base = BLOCKLIST) {
  const set = new Set(base);
  for (const linea of String(texto || '').split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    // formatos: "0.0.0.0 dominio", "127.0.0.1 dominio", o "dominio"
    const m = l.match(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+(\S+)/) || l.match(/^(\S+)$/);
    if (m) {
      const d = normalizar(m[1]);
      if (d && d.includes('.')) set.add(d);
    }
  }
  return set;
}

// Decision para el VpnService nativo: ¿dejo pasar este dominio o lo bloqueo? Puro.
function decidir(host, blocklist = BLOCKLIST) {
  return esAnuncio(host, blocklist)
    ? { bloquear: true, host: normalizar(host) }
    : { bloquear: false, host: normalizar(host) };
}

const API = { BLOCKLIST, normalizar, esAnuncio, cargarLista, decidir };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiAds = API;

})();
