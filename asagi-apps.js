// ASAGI - Control de apps del celular (capa segura). Version "computer use" para Asagi.
//
// Permite a Asagi USAR las apps del telefono: abrirlas, leer la pantalla y (con tu
// permiso) tocar/escribir. En Android esto SOLO es posible con un Servicio de
// Accesibilidad nativo (un plugin Capacitor que hay que activar a mano en Ajustes).
// Este modulo es la CAPA DE CONTROL con seguridad; el puente nativo se inyecta.
//
// SEGURIDAD (igual que asagi-browser): leer pantalla y abrir apps = automatico.
// TODO lo que inyecta input en otra app (tocar, escribir, enviar, pagar, borrar) pasa
// por una compuerta de APROBACION. El asistente propone; tu confirmas. Y cada accion
// con efecto queda registrada. Nada irreversible sin tu "si".
//
// La logica (clasificar/guardia/registro) es PURA y testeable. El puente nativo
// (abrirApp, leerPantalla, tocar, escribir) entra como callbacks.

'use strict';

// Acciones que SOLO leen o abren: sin efecto irreversible -> automaticas.
const _AUTO = ['leer', 'ver', 'abrir', 'listar', 'captura', 'pantalla', 'buscar'];
// Acciones que inyectan input / tienen efecto -> aprobacion.
const _EFECTO = ['tocar', 'tap', 'click', 'escribir', 'teclear', 'enviar', 'pagar',
                 'comprar', 'publicar', 'postear', 'borrar', 'eliminar', 'confirmar',
                 'deslizar', 'swipe', 'transferir', 'instalar', 'desinstalar'];

// Clasifica: 'auto' | 'aprobar'. Pura. Lo desconocido se aprueba a mano (prudente).
function clasificar(tipo) {
  const t = String(tipo || '').toLowerCase();
  if (_AUTO.some((a) => t.includes(a))) return 'auto';
  if (_EFECTO.some((e) => t.includes(e))) return 'aprobar';
  return 'aprobar';
}

// Decide si procede. Pura. aprobado=true solo lo pone el usuario en la UI.
function guardia(tipo, aprobado) {
  const clase = clasificar(tipo);
  if (clase === 'auto') return { permitido: true, clase };
  return { permitido: !!aprobado, clase,
           motivo: aprobado ? null : 'Requiere tu aprobacion (accion sobre otra app).' };
}

// Controlador. Puente nativo (Servicio de Accesibilidad) inyectado:
//   abrirApp(idOApp)       -> abre una app (intent / url scheme)
//   leerPantalla()         -> texto/arbol visible de la pantalla actual
//   tocar(x,y | selector)  -> inyecta un toque
//   escribir(texto)        -> inyecta texto
//   pedirAprobacion(accion)-> Promise<bool> (tu confirmacion)
//   registrar(evento)      -> log/auditoria (opcional)
class AsagiApps {
  constructor(puente = {}) {
    this._p = puente;
    this.log = [];
  }

  _reg(ev) {
    this.log.push(Object.assign({ ts: Date.now() }, ev));
    if (this._p.registrar) { try { this._p.registrar(ev); } catch (e) {} }
  }

  async abrir(app) {                                  // AUTO
    const r = this._p.abrirApp ? await this._p.abrirApp(app) : null;
    this._reg({ accion: 'abrir', app, clase: 'auto' });
    return { ok: true, app, resultado: r };
  }

  async leerPantalla() {                              // AUTO
    const txt = this._p.leerPantalla ? await this._p.leerPantalla() : '';
    this._reg({ accion: 'leer', clase: 'auto' });
    return { ok: true, texto: txt || '' };
  }

  // Accion con efecto sobre otra app: SIEMPRE por la compuerta.
  // tipo: 'tocar' | 'escribir' | 'enviar' | ...   args: lo que necesite el puente.
  async accion(tipo, args) {
    const clase = clasificar(tipo);
    let aprobado = clase === 'auto';
    if (clase === 'aprobar') {
      aprobado = this._p.pedirAprobacion ? !!(await this._p.pedirAprobacion({ tipo, args })) : false;
    }
    const g = guardia(tipo, aprobado);
    if (!g.permitido) {
      this._reg({ accion: tipo, args, clase, permitido: false });
      return { ok: false, bloqueado: true, motivo: g.motivo, tipo };
    }
    let res = null;
    const t = String(tipo).toLowerCase();
    if ((t.includes('escrib') || t.includes('tecle')) && this._p.escribir) {
      res = await this._p.escribir(args);
    } else if (this._p.tocar) {
      res = await this._p.tocar(args);
    }
    this._reg({ accion: tipo, args, clase, permitido: true });
    return { ok: true, tipo, resultado: res };
  }
}

const API = { clasificar, guardia, AsagiApps };
if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.AsagiApps = API;
