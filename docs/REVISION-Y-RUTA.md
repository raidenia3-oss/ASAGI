# ASAGI + ARIA — revisión completa y ruta para evolucionar

Para la próxima sesión de Claude (Fable 5.2). Escrito el 15-nov-2026. Complementa `PARA-LA-PROXIMA-SESION.md`
(estado + detalles de usuario) y `MAPA-DEL-PROYECTO.md` (qué hace cada archivo).
**Objetivo de este doc: que no gastes tokens redescubriendo el proyecto.** Lee esto, no todo el código.

## 1. Cómo encaja todo (en 30 s)
```
CELULAR (ASAGI, Capacitor)                         PC Windows (ARIA, PyQt5, un solo proceso)
 index.html + app.js (chat, 4.2k líneas)            ARIA_APP\aria_va_core.py (núcleo, 3.4k)
 + ~70 módulos *.js puros (window.AsagiX)           ARIA_APP\ui_shell.py (interfaz)
 plugin nativo capacitor-asagi-brain (Java)          brain_engine.py (llama.cpp, Qwen2.5-1.5B)
        │   WiFi cifrado: enlace-lan.js  <──────────>  lan.py   (mensajes {t: hola|aqui|web|wiki|correo|bot|personaje|nivel|estado})
        │                                              navegador_aria.py (Playwright, perfil propio)
 Chrome de Daniel (vía Accesibilidad) = sus sesiones   correo.py (Gmail OAuth), manos_pc.py (UIA de Windows)
```
- ASAGI es la **fuente de verdad** (repo `raidenia3-oss/ASAGI`, rama `main`). La carpeta `aria/` de este repo es la parte
  de ARIA que se **actualiza sola** en la PC (`aria_actualizador.py` lee `aria/manifest.json`; no pisa cambios locales).
- El ARIA completo vive en la PC de Daniel: `C:\Users\User\Downloads\AURA\ARIA_APP` (monorepo `raidenia3-oss/ARIA`, 2.7 GB,
  muy desordenado: cientos de archivos de fases viejas, AURA, Axum, Kilo). **No intentes ordenar ese monorepo**; trabaja vía `aria/`.
- `aria_va_core.py` importa ~45 módulos que NO están en `aria/` (modos, conocimiento, certeza, path_guard, self_learning,
  memory_tfidf, bot_factory…): existen solo en la PC. Por eso en la nube solo puedes `py_compile`, no ejecutarlo.
  Para tocar esos, hace falta el enlace al PC (herramientas `mcp__remote-devices__*`) o copiarlos a `aria/` + manifest.

## 2. Estado honesto por área (15-nov)
| Área | Estado | Nota |
|---|---|---|
| Chat ASAGI sin cerebro | Bien | sin-cerebro.js + utiles.js + calculos.js resuelven lo cotidiano |
| Cerebro ASAGI | Bien con Gemini gratis | modelo local en celular funciona; en emulador x86 se cae (ARM) |
| Escudo (links, estafas, inyección) | Bien | probado en emulador |
| YouTube | Bien (feeds + búsqueda móvil) | importar suscripciones/«mi YouTube» necesitan probarse en el celular real |
| Redes | Solo lectura por notificaciones + Chrome | falta probar en el celular real |
| Navegador ASAGI / ARIA | Bien | ARIA navega en la PC si está conectada (ahorra RAM del celular) |
| Enlace ASAGI↔ARIA | WiFi + Bluetooth cifrado | `enlace-adb.js` (USB) quedó por compatibilidad: **Daniel descartó USB**, no lo extiendas |
| ARIA interfaz | Funciona, a Daniel le parece básica/fea | quiere un núcleo visual (orb) mucho mejor, PyQt5 puro |
| ARIA memoria | SQLite+FTS5 (Kilo) con flag apagado | sin verificar arranque con flag encendido |
| ARIA native_core (nmap/whois/tor) | Desconectado | **ofensivo/borde: no lo conectes sin que Daniel lo pida explícitamente** (regla 10) |
| Pruebas | 74 pruebas puras JS en CI + simulación en emulador | ARIA no tiene pruebas en CI |

## 3. Problemas de fondo (más allá de los detalles de usuario)
1. **`app.js` es un monolito de 4.2k líneas** con ~40 bloques «always-on» en el submit del chat, en orden manual.
   Cada módulo nuevo agrega un bloque `{ const X = window.AsagiX, c = X.parsear(text); if (c) {...; return;} }`.
   **Mejora de más valor:** un registro de intenciones: `window.AsagiIntenciones.registrar({nombre, prioridad, parsear, ejecutar})`
   y un solo bucle en app.js. Hazlo por partes (mueve 5 bloques por commit y corre `pruebas.mjs` + persona2/agente_ui).
2. **Tareas asíncronas sin dueño**: responden con `appendMessage` cuando terminan y se mezclan con otras respuestas.
   Solución: cada tarea crea su burbuja (`const b = burbuja('🔎 Buscando…')`) y la actualiza (`b.texto(...)`, `b.fin(...)`).
   Ya existe `progresoBot()` (reemplaza el último si es de avance): generalízalo con id.
3. **ARIA en CI: ya se compila `aria/` (build-apk.yml).** Falta correr pruebas puras de Python
   (las funciones marcadas PURO en lan.py, enlace.py, navegador_aria.py, taller_web.py). Sin dependencias nuevas: `unittest`.
4. **Protocolo LAN sin versión.** Agrega `v` a los mensajes de `lan.py`/`enlace-lan.js` y que ambos respondan «actualízame»
   si la otra punta es vieja (ARIA se actualiza sola; ASAGI con `actualizador.js`).
5. **Duplicados ASAGI/ARIA** (navegador-lector, personajes, habilidades, openverse, wiki): mantenlos con el mismo formato de datos;
   `navegador-lector.js` ya es compartido (ARIA lo carga). Repite ese patrón: JS puro compartido > reescribir en Python.

## 4. Ruta para expandir (en orden de valor para Daniel)
**A. Pulido de usuario (1 sesión)** — lista en `PARA-LA-PROXIMA-SESION.md §3`. Es lo que Daniel nota primero.

**B. ASAGI ↔ ARIA como un solo asistente (1-2 sesiones)**
- Lo que ASAGI no puede (resumir video con subtítulos, informes largos, crear webs, Gmail) ya existe en ARIA: exponerlo en ASAGI
  con frases claras y estado «ARIA conectada / no» visible (no ofrecer lo que no se puede ahora).
- Memoria compartida selectiva (`sync-memoria.js` ↔ `sync_memoria.py`): verificar que funciona por WiFi y mostrar «lo que ARIA
  sabe de ti» en ASAGI.
- «Continúa en la PC»: cualquier página/video/tarea abierta en ASAGI se abre en ARIA con una frase.

**C. ARIA visual (lo que Daniel pidió varias veces)**
- Núcleo/orb mucho más vivo en PyQt5 puro (QPainter, QPropertyAnimation): `ARIA_APP/ui/nucleo_v2.py` ya existe (Kilo) y
  `aria/ui/rostro_aria.py` + `mascota.py` aquí. Paleta fija (#080408, #DC143C, #FFD700, #F0F0F8), sin cian.
- Revisar siempre con capturas (Daniel juzga «se ve bien / se ve mal»).

**D. Navegación y redes (seguir lo de hoy)**
- Lectura de redes por Accesibilidad es frágil: guardar «recetas» por app (qué textos ignorar) en `chrome.js` CASI.
- Vigía y YouTube en segundo plano con WorkManager (Java), 1 vez cada pocas horas, solo con WiFi y batería > 30 %.
- Agente de navegador en la PC (ARIA ya tiene Playwright): tareas de varios pasos con confirmación antes de cualquier acción pública.

**E. Voz y manos libres**
- `conversacion.js` (ASAGI) + `dictado_pc.py`/`voz_natural.py` (ARIA, Piper offline). Falta: palabra de activación barata
  y que ARIA hable con voz natural lo que ASAGI le pasa.

**F. Ideas guardadas de Daniel** — `docs/IDEAS_ARIA_NOCHE.md` (bandeja en ARIA, rules.md/voice.md, roles de agente, etc.).

## 5. Referencias (proyectos reales de los que ya se tomaron ideas; úsalos como guía, sin agregar dependencias)
| Idea | Proyecto | Dónde se usó |
|---|---|---|
| Asistente libre de voz en Android | [Dicio](https://github.com/Stypox/dicio-android) | calculos.js, utiles.js, notificaciones.js |
| Buscar en tus propios datos | [Khoj](https://github.com/khoj-ai/khoj) | buscar-mis-cosas.js |
| Memoria que decide qué guardar | [Mem0](https://github.com/mem0ai/mem0) | memoria-ia.js, recuerdos.py |
| Habilidades que se arma solo | [Voyager](https://github.com/MineDojo/Voyager) | rutinas.js |
| Agente de navegador | [browser-use](https://github.com/browser-use/browser-use) | navegador_aria.py (sin la dependencia) |
| Voz offline | [Piper](https://github.com/rhasspy/piper), [whisper.cpp](https://github.com/ggerganov/whisper.cpp) | voz_natural.py, dictado_pc.py |
| LLM local | [llama.cpp](https://github.com/ggerganov/llama.cpp) | brain_engine.py, plugin del celular |
| Monitor sin servidor | [Uptime Kuma](https://github.com/louislam/uptime-kuma) | monitor.js |
| Vigía de páginas | Visualping / [Distill](https://distill.io) | vigia-web.js |
| Navegadores con IA (Comet, Atlas, Dia) | [comparativa 2026](https://freeacademy.ai/blog/ai-browsers-chatgpt-atlas-vs-comet-vs-gemini-2026) | compartir.js, precios.js, explorar.js |
| Agente Android por Accesibilidad | [PokeClaw](https://www.scriptbyai.com/ai-agent-android-pokeclaw/) | manos.js, chrome.js (ASAGI ya hace casi todo) |
| Resumen de video | [Gemini video](https://ai.google.dev/gemini-api/docs/generate-content/video-understanding) | youtube.js |
| Estafas en Perú | [Expreso](https://www.expreso.com.pe/actualidad/falso-bono-yape-madre-de-familia-reporta-modalidad-de-estafa-y-cyberdelincuentes-le-roban-460-soles-billetera-digital-economia-crimen-pnp-noticia/986990/), [Infobae](https://www.infobae.com/peru/2025/07/09/te-agregan-a-grupos-de-whatsapp-con-la-promesa-de-ganar-dinero-por-dar-likes-pero-solo-terminas-perdiendo-asi-funciona-la-nueva-modalidad-de-fraude-en-redes-sociales/) | escudo.js ESTAFAS |

## 6. Cómo trabajar barato (tokens)
- No leas `app.js` entero: `grep -n` el bloque que necesitas y lee ±30 líneas.
- Módulos nuevos: lógica PURA exportada (`module.exports` + `window.AsagiX`) → prueba en `scripts/pruebas.mjs` sin navegador.
- Pruebas de interfaz: un script Playwright con `Capacitor.Plugins` simulado (ver §1 de PARA-LA-PROXIMA-SESION).
- Junta commits y empuja 1 vez cada ~20 min (cada push cancela la simulación en curso).
- Para la verdad en Android: `REPORTE.md` en la rama `simulacion`.

## 7. Revisión «con ojos de usuario» (cómo hacerla barata) y propuestas visuales — 15-nov noche
- ASAGI: capturas con Playwright sobre `dist/` (384×832), pegadas en una hoja y miradas de una vez.
- ARIA: `QT_QPA_PLATFORM=offscreen python3 scripts/aria_captura.py salida.png` dibuja la interfaz real sin pantalla.
Hecho: sugerencias tocables en ARIA y retrato centrado; ayuda de ASAGI con nombres naturales; Sala de control con ejemplos.
Propuestas pendientes (preguntar a Daniel antes de las grandes):
1. ARIA: botones de abajo con nombres crípticos (AUTO:OFF, MASC:OFF, CRT:ON) → texto claro o tooltip; «SKILLS (0)» vacío.
2. ARIA: el chat vacío ocupa casi toda la ventana → tarjetas de «hoy» (pendientes, correo, clima, ASAGI enlazada o no).
3. ARIA: CPU/RAM aparece dos veces (barra superior y tarjeta).
4. ASAGI Sala de control: el núcleo «ASAGI» del gráfico es diminuto e ilegible; agrandarlo y darle vida.
5. ASAGI casa: mucho espacio vacío bajo las apps → tarjeta «hoy» (pendiente siguiente, clima, video nuevo).
6. ASAGI Ajustes: «Comprobar» no dice qué comprueba; textos de ayuda en gris muy tenue (contraste).

## 8. Conexión y autonomía por dispositivo — hecho el 16-nov
- **Latido** ASAGI→ARIA cada 5 min (`{t:'latido'}` en app.js / aria_va_core.py): batería y pendientes del celular van a
  `ARIA_APP/data/asagi_estado.json`; ARIA responde con sus agentes. ASAGI muestra el chip «🖥 ARIA en línea» y lo dice en «mi día».
- **ARIA cuida el celular desde la PC** (`_avisos_asagi` en ui_shell.py): recuerda pendientes que vencen en 15 min y avisa batería baja.
- ARIA: pantalla inicial con tarjetas de hoy, botones con nombres claros, estado de ASAGI arriba (antes CPU/RAM repetido).
- Reparto: celular = sensores, notificaciones, cámara, lo inmediato; PC = navegar pesado, investigar, correo, crear webs, modelos grandes.
Siguiente paso natural: que ARIA pueda **mandar** cosas al celular (hoy solo ASAGI inicia; ARIA responde). Opciones sin servidor:
cola de mensajes que ASAGI recoge en cada latido (`aria` → `{para_asagi:[...]}`), p. ej. «terminé tu informe», «llegó un correo importante».

## 9. Ideas tomadas de otros proyectos (16-nov) y las que faltan
Hecho en ASAGI:
- **sakuga-vfx** → `efectos.js` propio: rebote de botones y destello al enviar/completar (sin librerías, respeta «reducir movimiento»).
- **Agentic-Bug-Hunter** (es herramienta OFENSIVA: solo se tomaron patrones de diseño, nada de su código ni de sus técnicas):
  «regla de los 5 minutos» → tareas atascadas avisan a los 4 min; «pickup» → tareas interrumpidas se retoman con un toque.
- **OpenClaw** (heartbeat + horas activas + NO_REPLY) → `proactivo()` en app.js: avisos propios se guardan de 11 p. m. a 7 a. m.
  y se entregan juntos al despertar.
- **Asistente de M. Kraus** (memoria con activación ACT-R) → `activacion()` en memoria.js: lo reciente y lo usado pesa más.
Pendiente (buen valor, en orden):
1. «Sueño nocturno» (OpenClaw DREAMS.md): una vez al día, con el cerebro, condensar recuerdos repetidos y promover hechos durables.
2. Compuerta de validación (Bug Hunter «7 preguntas»): antes de mostrar una investigación, una pasada corta que marque
   afirmaciones sin fuente («no confirmado»). Solo con Gemini/ARIA (no con el modelo local).
3. Archivos de identidad editables (SOUL.md/USER.md): que Daniel pueda ver y editar en Ajustes «cómo soy» y «lo que sé de ti».
4. Capas con dependencias en un solo sentido (transporte → router → habilidades → núcleo): es el registro de intenciones del §3.1.
5. Más sakuga: onomatopeyas manga en momentos clave (subir de nivel, racha), con moderación.
6. La página de Notion «El mapa de mi Jarvis» no se pudo leer (privada/requiere sesión): pedirle a Daniel que pegue el texto.

## 10. Aprendizaje, autonomía y creatividad — hecho el 16-nov (tarde)
- `aprende.js`: lecciones de las correcciones de Daniel («no, es …», «te equivocaste…»); `piensa.armarContexto` las inyecta solas.
  Una cuenta exacta no se deja «corregir» (honestidad). `memoria.sonar()` ordena la memoria 1 vez al día.
- `iniciativa.js`: nota intereses (lo que explora/investiga), 1 vez al día prepara algo propio (noticias reales + una idea original)
  y lo entrega con `proactivo()`; «dame ideas para …», «sorpréndeme», «qué hiciste sola», «pausa tu iniciativa».
- Compuerta de investigación (`notaValidacion`), Ajustes «Cómo soy» (`asagi-alma` → systemPrompt) y «Lo que sé de ti», `grito()` manga.
Siguiente (no hecho): que la iniciativa también CREE cosas (una mini web con `web-publica.js`/taller de ARIA, una rutina nueva
propuesta en `rutinas.js`) siempre como borrador y con confirmación; revisión con cerebro de las lecciones que se contradicen;
mostrar en la casa un chip «📦 nuevo» cuando haya una creación sin leer.

## 11. Taller y casa — hecho el 16-nov (noche)
- `creador.js`: «crea una guía sobre…», «hazme una checklist para…», «crea un quiz de…». El cerebro solo da JSON; ASAGI arma la
  página con plantilla propia y la muestra en un `<iframe sandbox>` sin scripts. La iniciativa diaria también crea una guía.
- Casa: fila de atajos (`#home-atajos`) con «📦 Nuevo» cuando ASAGI preparó algo sola.
Siguiente: compartir/exportar una creación (archivo .html o enviarla a ARIA para publicarla con confirmación); más plantillas
(plan semanal, tarjeta de estudio, comparativa); que el quiz guarde el puntaje.

## 12. Recetas (página → dato), USB y RollerCoin — 16-nov (noche)
- `recetas.js`: «crea una receta dolar: de <url> saca compra y venta» → luego «dolar». Idea de site2cli / browser-to-api /
  Skyvern («cualquier web como API»), pero local: descarga liviana + cerebro + compuerta `aparece()` (marca lo que no está en la página).
  Siguiente: recetas con sesión (leer en el Chrome de Daniel o en ARIA con Playwright) y recetas programadas con el vigía.
- **USB**: Daniel pidió usarlo (16-nov). Se hace con «Anclaje USB» (red por cable): `lanDescubrir` ahora pregunta por TODAS las
  interfaces de red; frase «enlace usb». Sin adb. Sin probar en hardware real: si ARIA no responde, revisar el firewall de Windows
  para la red nueva (UDP 47831 / TCP 47832) y si `lan.py` responde por esa interfaz.
- **RollerCoin**: `rollercoin_google.tablero()` SOLO LEE la cuenta (poder, saldos) y lleva historial («cómo va rollercoin» en ARIA).
  NO se automatizan los juegos: RollerCoin prohíbe bots y es ganar dinero saltándose sus reglas → no hacerlo aunque exista
  código viejo en el monorepo (rollercoin_bot_*.py). El lector de números es por texto y no se pudo probar con la cuenta real.

## 13. Editor de imágenes y sesiones — 16-nov (noche)
- `editor.js` (ASAGI): editor propio en canvas (estilos, ajustes, recorte, texto, «describe el edit» con cerebro). Aprende: guarda
  los ajustes de cada foto guardada → estilo «A tu gusto» (promedio) y ordena estilos por uso. Nativo: `AsagiControl.guardarImagen`.
  Falta: VIDEO. En el celular gastaría mucha RAM (regla 4); lo natural es ARIA con ffmpeg, que es dependencia nueva →
  **esperar el sí de Daniel** (regla 5). También falta el editor de imágenes en ARIA (PyQt5 puro: QImage) y «aprender edits» viendo
  referencias (analizar una imagen que le guste y sacar sus ajustes).
- `aria/sesiones.py`: «conecta <sitio>» → Daniel inicia sesión en Chrome normal con el perfil del navegador de ARIA; luego
  «navega a…» entra logueada. Las cookies NO se exportan ni se copian al celular. «mis sesiones», «desconecta <sitio>».
- RollerCoin: Daniel aceptó el riesgo y pidió automatizar los juegos; se mantiene SOLO lectura (bots de juego = saltarse las
  reglas del sitio para ganar dinero; no se hace ni se evade su detección).
