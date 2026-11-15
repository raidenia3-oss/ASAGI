// Pruebas rápidas (sin dependencias) de lo que razona ASAGI. Corre en CI antes de compilar:
//   node scripts/pruebas.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const R = (f) => require('../' + f);
let fallos = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { fallos++; console.log('FALLA', m); } };

const P = R('piensa.js'), AG = R('agente.js'), U = R('utiles.js'), C = R('calculos.js'), SM = R('sobre-mi.js'), SC = R('sin-cerebro.js'), CO = R('compras.js'), RZ = R('razonamiento.js');

// memoria de la charla
const h = P.historial([{ sender: 'user', text: 'cuánto cuesta un iphone' }, { sender: 'bot', text: 'Unos 1000 dólares.' }, { sender: 'user', text: 'y en soles' }], 'y en soles', 8, 280);
ok(h.includes('Daniel: cuánto cuesta') && !h.includes('y en soles'), 'historial');
ok(P.pideHerramienta('USAR: clima mañana en Cusco') === 'clima mañana en Cusco', 'pide herramienta');
ok(P.separarPlan('PLAN: a\nRESPUESTA: b').respuesta === 'b', 'separa plan');
// herramientas: lista blanca
for (const f of ['clima mañana en Cusco', 'a cuánto está el dólar', 'qué sabes de mí', 'mi lista de compras', 'busca en la web precio del dólar']) ok(AG.permitido(f), 'permitido ' + f);
for (const f of ['paga 50 a juan', 'borra mis pendientes', 'envía un correo', 'publica la web']) ok(!AG.permitido(f), 'bloqueado ' + f);
// razonamiento con herramienta (cerebro simulado)
const r = await (async () => { let n = 0; return P.pensar('¿llevo casaca mañana a Cusco?', async () => (++n === 1 ? 'USAR: clima mañana en Cusco' : 'Sí, lleva casaca.'), { fuerte: true, herramientas: AG.HERRAMIENTAS, permitido: AG.permitido, ejecutar: async () => 'lluvia 80%' }); })();
ok(/casaca/.test(r.texto) && r.pasos.some((x) => /usé/.test(x)), 'usa herramienta');
const r2 = await P.pensar('dime', async () => 'USAR: paga 100 a juan', { fuerte: true, herramientas: AG.HERRAMIENTAS, permitido: AG.permitido, ejecutar: async () => { throw new Error('no debe'); } });
ok(!/USAR/.test(r2.texto), 'nunca ejecuta lo prohibido');
// frases cotidianas
for (const f of ['qué hora es en japón', 'ya pagué internet', 'qué día cae navidad', 'clima en arequipa', 'convierte 50 dólares a soles']) ok(U.parsear(f), 'utiles ' + f);
ok(U.buscarPendiente([{ id: 'a', texto: 'Pagar internet' }, { id: 'b', texto: 'Llamar a mamá' }], 'pague internet').id === 'a', 'busca pendiente');
const hoy = new Date(2026, 10, 15);
ok(C.resolver(C.parsear('convierte 10 km a millas'), hoy) === '📏 10 km = 6,214 millas', 'km a millas');
ok(/Cada uno \(3\): S\/ 55\.00/.test(C.resolver(C.parsear('cuenta de 150 con 10% de propina entre 3'), hoy)), 'propina');
ok(/sábado/.test(C.resolver(C.parsear('qué día fue el 28 de julio de 1821'), hoy)), 'día de la semana');
ok(SM.parsear('recuerda que mi cumpleaños es el 13 de mayo').accion === 'guardar', 'sobre mí: guardar');
ok(SM.parsear('recuerda que mañana tengo examen') === null, 'recordatorio no es dato');
ok(SM.aTi('mi mamá se llama Rosa') === 'Tu mamá se llama Rosa', 'a ti');
ok(SC.entender('qué puedes hacer').tipo === 'ayuda' && SC.entender('ayuda de cuentas').tema === 'cuentas', 'ayuda');
ok(SC.entender('cómo llego a Miraflores').tipo === 'ruta', 'ruta');
ok(CO.parsear('agrega pan y leche a la lista').tipo === 'agregar', 'compras');
ok(RZ.necesitaDatos('quién es el presidente del perú') && !RZ.necesitaDatos('explícame las derivadas'), 'actualidad');

const av = AG.vigilar({ ahora: new Date(2026, 10, 19, 10).getTime(), vistos: {}, datos: ['el cumpleaños de mi mamá es el 20 de noviembre'] });
ok(av.length === 1 && /Mañana es el cumpleaños de tu mamá/.test(av[0].texto), 'aviso de cumpleaños');

ok(U.parsear('traduce buenos días al inglés').a === 'en' && U.parsear('qué significa la vida') === null, 'traducir');

const PE = R('pendientes.js'), base = new Date(2026, 10, 15, 7, 30);
const t1 = PE.parsearTiempo('pagar luz mañana 8 am', base); ok(t1.limpio === 'pagar luz' && t1.etiqueta === 'mañana 8:00 a. m.', 'hora «8 am»');
const t2 = PE.parsearTiempo('pagar agua el viernes 6 pm', base); ok(t2.limpio === 'pagar agua' && new Date(t2.cuando).getDay() === 5 && new Date(t2.cuando).getHours() === 18, 'día de la semana');
ok(PE.parsearTiempo('comprar 2 panes', base).cuando === null, 'sin hora no inventa');

ok(AG.parsear('investiga qué piden para postular a la UNI').investigar && AG.parsear('investiga en internet gatos') === null, 'investigar');

// manos (Mobile-Agent-v2): notas que pasan de una app a otra + progreso + aviso de cambio de app
{
  const M = R('manos.js');
  let app = 'Tienda', prompts = [];
  const pantallas = { Tienda: [{ t: 'Zapatillas S/ 199', clic: false }, { t: 'Volver', clic: true }], WhatsApp: [{ t: 'Juan', clic: true }, { t: 'Mensaje', edit: true }] };
  const driver = { leer: async () => ({ app, nodos: pantallas[app] }), tocar: async () => ({ ok: true }), escribir: async () => ({ ok: true }), abrir: async (n) => { app = n; return { ok: true }; },
    global: async () => ({ ok: true }), desplazar: async () => ({ ok: true }), dormir: async () => {} };
  const resp = ['{"accion":"abrir","app":"WhatsApp","nota":"precio zapatillas: S/ 199","progreso":"ya vi el precio; falta mandarlo"}', '{"accion":"listo","resumen":"listo"}'];
  const r = await M.agente('mira el precio y pásaselo a Juan', driver, async (p) => { prompts.push(p); return resp[prompts.length - 1]; }, { max: 5 });
  ok(r.ok && /S\/ 199/.test(prompts[1]) && /falta mandarlo/.test(prompts[1]), 'manos: nota y progreso pasan al siguiente paso');
  ok(M.leerDecision('{"accion":"tocar","ref":2,"nota":"x"}').nota === 'x' && M.leerDecision('tocar Enviar'), 'manos: leer decisión');
}

// memoria inteligente (Mem0)
{
  const MI = R('memoria-ia.js');
  ok(MI.debeExtraer('me mudé a Surco el mes pasado', 0, 1e12) && !MI.debeExtraer('qué hora es?', 0, 1e12) && !MI.debeExtraer('me mudé a Surco', 1e12 - 1000, 1e12), 'mem0: cuándo revisar');
  const con = [{ texto: 'vivo en Breña', tema: 'dato' }, { texto: 'me gusta el anime', tema: 'preferencia' }];
  const p = MI.plan(MI.leer('{"agregar":["tengo un perro llamado Toby","mi clave es 1234"],"cambiar":[{"n":0,"ahora":"vivo en Surco"}],"borrar":[]}'), con);
  ok(p.agregar.length === 1 && p.cambiar[0].viejo.texto === 'vivo en Breña' && p.cambiar[0].ahora === 'vivo en Surco', 'mem0: agrega, cambia y nunca guarda claves');
}

{ const M = R('memoria.js'), ls = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } };
  const a = new M.Memoria(ls), b = new M.Memoria(ls); a.aprender('vivo en Breña', 'dato'); b.todos(); a.aprender('tengo un gato', 'dato'); b.aprender('me gusta el anime', 'preferencia');
  ok(new M.Memoria(ls).todos().length === 3, 'memoria: dos copias no se pisan'); }

{ const BM = R('buscar-mis-cosas.js');
  ok(BM.parsear('dónde anoté lo del examen').q === 'examen' && BM.parsear('busca en mis cosas internet').q === 'internet' && BM.parsear('busca en la web gatos') === null, 'mis cosas: entiende');
  const r = BM.buscar([{ tipo: 'pendiente', texto: 'Pagar internet' }, { tipo: 'chat', texto: 'mi examen de la UNI es en agosto' }, { tipo: 'compras', texto: 'pan' }], 'examen');
  ok(r.length === 1 && r[0].tipo === 'chat', 'mis cosas: encuentra'); }

ok(SC.entender('mi examen de la UNI es en agosto') === null && SC.entender('ayúdame a estudiar para la UNI').tipo === 'uni', 'UNI: dato vs pedido');

console.log((fallos ? '✗ ' : '✓ ') + (total - fallos) + '/' + total + ' pruebas');
process.exit(fallos ? 1 : 0);
