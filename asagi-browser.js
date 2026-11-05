// ASAGI - Navegador propio del asistente (version "BrowOS" para Asagi).
//
// Da a Asagi un navegador DENTRO de la app que el asistente maneja: navegar, LEER la
// pagina y EXTRAER datos estructurados (titulo, meta/OpenGraph, JSON-LD, precios,
// tablas, enlaces) — lo mismo que hago yo al leer una web. Es la version JS de
// web_api.py de ARIA.
//
// SEGURIDAD (clave): leer/navegar es automatico. Pero toda accion con EFECTO
// (enviar un formulario, iniciar sesion, pagar, publicar, borrar) NO se hace sola:
// pasa por una compuerta de APROBACION (como autonomia_guardia de ARIA). El asistente
// propone, tu confirmas. Nada irreversible ocurre sin tu "si".
//
// Funciona con el DOM vivo del WebView, y tambien sobre un string HTML (testeable).

'use strict';

// ------------------------------------------------------------- extraccion (pura)

function _texto(s) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extraerTitulo(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || '');
  if (m) return _texto(m[1]);
  const meta = extraerMeta(html);
  return meta['og:title'] || '';
}

function extraerMeta(html) {
  const out = {};
  const tags = (html || '').match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const k = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag);
    const v = /content\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (k && v) out[k[1].trim().toLowerCase()] = _texto(v[1]);
  }
  return out;
}

function extraerJsonLd(html) {
  const out = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html || '')) !== null) {
    try {
      const data = JSON.parse(m[1].trim());
      out.push(...(Array.isArray(data) ? data : [data]));
    } catch (e) { /* ignorar */ }
  }
  return out;
}

const _PRECIO = /(?:S\/\.?|US?\$|\$|€|£|PEN|USD|EUR)\s*([0-9][0-9.,]*)|([0-9][0-9.,]*)\s*(?:soles|dolares|usd|eur|€|\$)/i;

function extraerPrecio(texto) {
  const t = (texto || '').replace(/<[^>]+>/g, ' ');
  const m = _PRECIO.exec(t);
  return m ? _texto(m[0]) : null;
}

function extraerEnlaces(html, base) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html || '')) !== null) {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(m[1]);
    if (href) {
      let url = href[1];
      if (base) { try { url = new URL(url, base).href; } catch (e) {} }
      out.push({ texto: _texto(m[2]), url });
    }
  }
  return out;
}

function _deJsonLd(objs, campo) {
  for (const o of objs) {
    if (o && typeof o === 'object') {
      if (campo in o) return o[campo];
      for (const v of Object.values(o)) {
        if (v && typeof v === 'object' && campo in v) return v[campo];
      }
    }
  }
  return null;
}

// PROCESS: arma datos estructurados desde el HTML. Pura.
function extraer(html, campos, base) {
  const meta = extraerMeta(html);
  const jsonld = extraerJsonLd(html);
  const datos = {
    titulo: extraerTitulo(html),
    descripcion: meta['og:description'] || meta['description'] || '',
    precio: _deJsonLd(jsonld, 'price') || meta['product:price:amount'] ||
            meta['og:price:amount'] || extraerPrecio(html),
  };
  if (campos && campos.length) {
    const pedido = {};
    for (const c of campos) {
      const cl = c.toLowerCase();
      let val = _deJsonLd(jsonld, c) || meta[c] || meta['og:' + cl];
      if (val == null && (cl === 'precio' || cl === 'price')) val = datos.precio;
      if (val == null && (cl === 'titulo' || cl === 'title' || cl === 'name')) val = datos.titulo;
      pedido[c] = typeof val === 'string' ? _texto(val) : val;
    }
    return { campos: pedido, titulo: datos.titulo };
  }
  datos.jsonld = jsonld;
  datos.meta = meta;
  datos.enlaces = extraerEnlaces(html, base);
  return datos;
}

// ------------------------------------------------------------- compuerta de acciones

// Clasifica una accion: 'auto' (leer/navegar) | 'aprobar' (efecto) . Pura.
const _EFECTO = ['enviar', 'submit', 'login', 'iniciar_sesion', 'pagar', 'comprar',
                 'publicar', 'postear', 'borrar', 'eliminar', 'confirmar', 'transferir'];
function clasificarAccion(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (t === 'leer' || t === 'navegar' || t === 'extraer' || t === 'buscar') return 'auto';
  if (_EFECTO.some((e) => t.includes(e))) return 'aprobar';
  return 'aprobar'; // por defecto, prudente: lo desconocido se aprueba a mano
}

// Decide si una accion procede. Pura. aprobado=true solo lo pone el usuario.
function guardia(tipo, aprobado) {
  const clase = clasificarAccion(tipo);
  if (clase === 'auto') return { permitido: true, clase };
  return { permitido: !!aprobado, clase,
           motivo: aprobado ? null : 'Requiere tu aprobacion (accion con efecto).' };
}

// ------------------------------------------------------------- navegador

// Maneja el WebView/iframe propio de Asagi. Se le inyectan:
//   navegar(url)  -> pone la url en el WebView
//   leerHtml()    -> devuelve el HTML actual (string) o Promise<string>
//   pedirAprobacion(accion) -> Promise<bool> (tu confirmacion en la UI)
class AsagiBrowser {
  constructor({ navegar, leerHtml, pedirAprobacion } = {}) {
    this._navegar = navegar;
    this._leerHtml = leerHtml;
    this._pedir = pedirAprobacion;
    this.url = '';
  }

  async ir(url) {                                   // NAVEGAR (auto)
    this.url = url;
    if (this._navegar) await this._navegar(url);
    return { ok: true, url };
  }

  async _html() {
    const h = this._leerHtml ? await this._leerHtml() : '';
    return h || '';
  }

  async leer() {                                    // LEER texto (auto)
    return _texto(await this._html());
  }

  async datos(campos) {                             // EXTRAER estructurado (auto)
    return extraer(await this._html(), campos, this.url);
  }

  // ACCION con efecto: pasa por la compuerta. 'fn' es lo que realmente la ejecuta
  // (click/submit en el WebView). Sin aprobacion -> no corre.
  async accion(tipo, fn) {
    let aprobado = false;
    const clase = clasificarAccion(tipo);
    if (clase === 'aprobar') {
      aprobado = this._pedir ? !!(await this._pedir(tipo)) : false;
    }
    const g = guardia(tipo, aprobado || clase === 'auto');
    if (!g.permitido) return { ok: false, bloqueado: true, motivo: g.motivo, tipo };
    const res = typeof fn === 'function' ? await fn() : null;
    return { ok: true, tipo, resultado: res };
  }
}

const API = { extraer, extraerTitulo, extraerMeta, extraerJsonLd, extraerPrecio,
              extraerEnlaces, clasificarAccion, guardia, AsagiBrowser };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiBrowser = API;
