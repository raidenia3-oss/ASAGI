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

## 14. Video, ojos e ideas de los reels de Daniel — 16-nov (noche)
- `aria/editor_video.py` (ffmpeg APROBADO): recortar, vertical/cuadrado, estilos (los mismos nombres que el editor de fotos),
  velocidad, texto, sin audio, audio a mp3, gif, unir carpeta. Nunca toca el original (Videos/ARIA). Aprende la receta más
  usada («como siempre»). Probado aquí con ffmpeg 6.1 real; falta probar en Windows (rutas con espacios, fuente Arial, winget).
  Falta: que ASAGI le mande un video del celular por el enlace (lanBajarArchivo existe en sentido ARIA→ASAGI), música de fondo,
  subtítulos automáticos (whisper.cpp ya se usa en dictado_pc.py), cortes automáticos por silencios.
- `ojos.js` (ASAGI, visión Gemini): «señala X» (recuadro), «qué es esto», «registra esta boleta» + «mis boletas».
- Reels que Daniel mandó (ideas, por valor):
  1. **Dynamic Island para Windows** (twocode.nl): pastilla de vidrio arriba de la pantalla con música / temporizador / lo que hace
     el agente → HECHO: `aria/ui/isla.py` (botón «Isla» abajo en ARIA): hora, estado de ASAGI y lo que ARIA va diciendo;
     estado de ASAGI y avisos. PENDIENTE, buen candidato siguiente.
  2. **Rose «highlight the pumpkin»** (huwprosser): cámara + detección por voz → hecho en chico con `ojos.js`. En ARIA sería con
     webcam + modelo local (PyTorch/OpenCV = dependencias nuevas: pedir permiso).
  3. **TaxHacker** (boletas → gastos con IA) → hecho en chico («registra esta boleta»). Falta: categorías y exportar.
  4. **decimen.app** (pasar archivos por luz/QR, sin red) → idea para emparejar ASAGI↔ARIA mostrando un QR en ARIA (sin escribir claves).
  5. **Edge0** (modelos de 35B con ~3 GB de RAM leyendo pesos del SSD): interesante para ARIA; NO verificado (ver repo antes de creerlo).
  6. **Niagara Launcher**: lista alfabética minimal con deslizamiento lateral → idea para la casa de ASAGI.
  7. **Astryx** (sistema de diseño de Meta, React): no aplica directo (sin dependencias); sirve de referencia de tokens/temas.
  8. webcam-memes (gestos → efectos) y ComfyUI video (pide RTX 4090): no por ahora.
- Instagram sin sesión deja leer el texto del reel pero NO reproduce el video: para verlos hace falta su sesión.

## 15. Videos que mandó Daniel (17-nov) e ideas
- AMV de anime (@xavqen.zz) → HECHO: estilo «anime» en `editor_video.py` («hazle un edit», «estilo anime»): resplandor,
  contraste/color, destello blanco al entrar y golpe en blanco y negro a la mitad. Falta para parecerse más a un AMV real:
  cortes al ritmo de la música (detectar golpes con ffmpeg `silencedetect`/`ebur128` o whisper), zoom-punch, sacudida, texto animado.
- Cambio de tema con mancha de tinta (@codemure.official): transición entre secciones de ASAGI con máscara (`clip-path`/`mask`).
- Visualizador de música tipo luna con barras radiales + letra (@alexcreates.exe): para ARIA (QPainter + audio del sistema)
  o ASAGI (la música es nativa: haría falta pasar niveles desde AsagiMusicaService).
- Juego de tipeo con palabras que caen (@kridhatype): juego para ARIA (teclado físico); en ASAGI ya hay `juegos.js`.
- Esfera de partículas en AR (@umutmuezzinoglu): referencia para el núcleo/orb de ARIA y la Sala de control de ASAGI.

Segunda pasada a los videos (17-nov, 03:00) — HECHO en ASAGI: transición de tinta al cambiar de pantalla (`AsagiEfectos.tinta`,
setActiveSection(nombre, true) la salta) y juego «Defensa» (`tipeo.js`, «juego de tipeo»). Detalles visuales vistos para copiar después:
- codemure: titular serif enorme con UNA palabra en cursiva carmesí, mucho aire, botón píldora pequeño, fila de tarjetas.
- alexcreates: reproductor con disco-luna, lista en arco alrededor, pantalla completa con barras radiales y letra palabra por palabra.
- kridhatype: «combat log» lateral (multiplicador, ppm, precisión), pantalla final con nota grande.
- xavqen (AMV): siluetas con contraluz blanco, texto serif gigante con degradado enmascarado, tintes rojo/morado por escena.

## 16. Launcher revisado como usuario (17-nov, mañana)
Problemas vistos en capturas con 48 apps simuladas y arreglados:
- La rejilla de apps quedaba en una ventanita de ~1,5 filas (tarjeta «Más usadas» enorme + botón Pendientes) → favoritas en una
  sola fila tipo dock (5, fijables), Pendientes pasa a la fila de atajos con su número, la rejilla gana ~2× de alto.
- Buscar «yap» mostraba YouTube, Spotify, PedidosYa… (la búsqueda miraba la palabra «App») → solo por nombre y coincidencias reales.
- «cuánto es 15% de 230» decía «Sin coincidencias» → la calculadora entiende «cuánto es», «más», «menos», «por», «entre».
- Resultados como tiles gigantes en una columna → filas (icono + nombre); siempre hay «Preguntar a ASAGI» y «Buscar en la web».
- Riel A–Z a la derecha (idea Niagara) para saltar por letra; mantener presionada una app → fijar en favoritas u ocultar.
- Botones de las esquinas (⟐ ✶) ahora dicen «Bots» y «Fondo».
Pendiente: en el celular real ver los iconos verdaderos y el riel con el dedo (en Playwright se probó con eventos simulados).

## 17. Ideas de los reels del 17-nov (wallpapers, iControl, «5 herramientas de GitHub», fondos de bloqueo)
Hecho:
- Casa: barra de batería fina con frase del momento y firma «asagi» en carmesí (como «100% · Happy Every Day» de los fondos de bloqueo). Quitado el chip de batería. `AsagiLauncher.frase()` es pura y está probada.
- Riel A–Z: ahora es una sola zona táctil de 36 px (la simulación marcaba letras de 26×15). La letra sale de la altura del dedo.
- ARIA, «quita los silencios del último video» (idea de Auto-Editor) con ffmpeg (`silencedetect` + `select`), sin dependencias nuevas. `silencios/tramos/comando_tramos` son puras. Probado con un clip real: de 0:10 a 0:07.
- `sim_persona.mjs` ya no se cae si la app se cierra al abrir el teclado.
Pendiente (pedir permiso a Daniel, son dependencias nuevas): whisper.cpp para subtítulos en la PC; yt-dlp para descargas (cuidar las reglas de cada sitio).
Descartado: Postiz (publica en redes; regla 9).
Idea siguiente: un «centro de control» estilo iControl (vidrio, píldoras para linterna, wifi, bluetooth, brillo, música, alarma), con las acciones nativas que ASAGI ya tiene.

## 18. ARIA como launcher + mini sistema operativo (17-nov, noche)
- `aria/escritorio_pc.py` (lógica pura + Windows por ctypes, sin dependencias) y `aria/ui/escritorio_ui.py` (pestañas).
- El Shell tiene pestañas reales arriba: **1 Chat · 2 Apps · 3 Archivos · 4 Ventanas** (clic o Ctrl+1..4).
  - Apps: lee el menú Inicio (.lnk) con iconos reales de Windows; buscador (spo→Spotify, vsc→Visual Studio Code), Enter abre la primera; favoritas = fijadas + más abiertas; clic derecho fija u oculta.
  - Archivos: carpetas de siempre + Recientes de Windows. Ventanas: lista lo abierto y lo trae al frente. **Nunca cierra nada** (regla 7).
  - Chat: «apps», «mis archivos», «ventanas», «abre spotify», «ve a chrome». Si no hay app con ese nombre, sigue al cerebro.
- ASAGI → ARIA: «abre spotify en la pc», «qué tengo abierto en la pc», «trae chrome en la pc» (mensaje `{t:'pc'}` por el enlace; `AsagiLauncher.ordenPc` es pura y está probada).
- Captura sin pantalla de una pestaña: `ARIA_PESTANA=1 QT_QPA_PLATFORM=offscreen python3 scripts/aria_captura.py x.png` (con `ProgramData=<carpeta falsa>` para simular apps).
- Falta en la PC real: iconos reales, abrir apps, traer ventanas al frente, «abre … en la pc» desde el celular.

## 19. Revisión como usuario (17-nov, noche): PC real + emulador
- **ARIA vieja al prender la PC**: `auto_start.py` registraba en Run «ARIA OS» → `dist\ARIA OS.exe`, una copia congelada de septiembre (la azul v4.0). En el menú Inicio, «Aria os» también abre ese .exe. Arreglo automático: `aria/arranque_pc.py` (lo llama `aria_va_core` al iniciar) cambia el valor de Run a `aria_main.py` con el pythonw del .venv y crea el acceso «ARIA» en Inicio. No borra el .exe viejo (eso lo decide Daniel).
- **Choque de nombres**: en la PC ya existía un `escritorio.py` (boot/dock de BrowOS); el actualizador no lo pisa (conflicto). El nuevo se llama `escritorio_pc.py`. Antes de crear un archivo en `aria/`, revisar la lista de ARIA_APP en la PC.
- **Emulador**: «hola asagi» y «cuéntame un chiste» no respondían mientras el modelo local se descargaba → `localResponder` ya no lo espera (y si hay que cargarlo, máximo 40 s).
- **Barra «Copy · Share · Select all»** al deslizar por la casa → la interfaz ya no se selecciona (los mensajes sí).
- Filas de atajos con desvanecido a la derecha (se nota que se deslizan).
- Pendiente: «clic 1» del navegador no respondió en 20 s; «busca en la web» se quedó en «Leyendo 3/3» en el emulador; RAM 648 MB con el modelo local bajando (regla 4).
- 17-nov (tarde-noche), pedidos de Daniel:
  - «.exe viejo bórralo»: `arranque_pc.py` manda `dist\ARIA OS.exe` y sus accesos a la Papelera (recuperable) al abrir ARIA.
  - Keys de Gemini nuevas ya no empiezan con «AIza»: `gemini-guia.js` acepta cualquier texto largo sin espacios (Google la valida al probar) y todas las llamadas a Gemini mandan la key en la cabecera `x-goog-api-key` (no en la URL).
  - Descarga del modelo más rápida: `ModelDownloader.java` baja en 4 conexiones a la vez (rangos, reanudables) y solo usa el espejo si HuggingFace falla 2 veces. Probado con un archivo real de HF (7 MB, hash correcto). El estado muestra «falta N min».

## 20. Limpieza de la ARIA vieja + Musa (aprender de redes) — 17-nov noche
- **Qué estorbaba** (lo abría `desktop_ui.run_desktop`, archivo que solo vivía en la PC): el cuadro «0 COSAS HOY» (`actividad.py`), el selector flotante de modos, la ventana de «resurgir», `presence` (ocultaba a ARIA tras 5 min sin mouse) y `hand_react` (prendía la cámara). `desktop_ui.py` ahora está en el repo (con el sha de la PC en `previos`, así el actualizador lo reemplaza solo) y ya no los abre.
- **Reemplazos en lo nuevo**: «cosas hoy» → tarjetas de hoy del Shell; resurgir → tarjeta «RECUERDA» en el Shell; modos → botón Cuerpo + «nivel»; escritorio viejo → `escritorio_pc.py`.
- **`limpieza_pc.py`** (una vez, al iniciar): manda a la Papelera ~60 archivos que nada importa (análisis de imports desde aria_main), .bak a mano y capturas. Se queda con los .bak_auto del actualizador. Si desktop_ui aún es la versión vieja, espera.
- **Musa (`aria/musa.py`)**: con la sesión de Google de ARIA («conecta google»), estudia YouTube (búsqueda o tu inicio): transcripción + comentarios más votados → el cerebro saca ideas, ganchos, lo que la gente pide y datos → cuaderno `data/musa.json` (sin repetir, con fuentes). «dame ideas de X» cruza notas de temas distintos. «estudia siempre X» = estudia sola (cada 3 h revisa; uno por día, los nuevos enseguida). «estudia este enlace <url>» sirve para reels/posts de cualquier red con la sesión.
- ASAGI: «qué aprendió aria» / «aria estudia <tema>» (`{t:'musa'}` por el enlace). Lo pesado lo hace la PC (regla 4).
- Probado aquí con YouTube real: lista de videos y 15 comentarios útiles por video. La transcripción no salió desde la nube (YouTube la bloquea a servidores); en la PC ya funcionaba con «resume este video».
- Solo lectura siempre (nada de likes, comentarios ni seguir).
- **Ver en vivo** (`musa.ver_en_vivo`): «mira <enlace YouTube>» / «mira en vivo <tema>» (busca transmisiones con el filtro «En vivo»). Reproduce en silencio (1,5x si no es transmisión), y cada 10 s junta: foto del video descrita por Gemini visión (si hay `GEMINI_API_KEY` en ARIA_APP/.env; la key va en cabecera), el subtítulo del momento (activa CC con «c») y el chat en vivo (iframe live_chat). Cada ~30 s cuenta lo nuevo; máximo 5 min; al final aprende → cuaderno. Si el video no avanza en 20 s, cae a estudiarlo por transcripción + comentarios. En la nube YouTube no reproduce (servidor bloqueado), probar en la PC.

## 21. Centro de control en ASAGI (17-nov noche, idea de iControl)
- `centro.js` (nuevo, registrado): arriba de Ajustes (deslizar hacia abajo desde la casa: «⌄ Control y ajustes»). Tarjeta de música (AsagiMusica: anterior / play-pausa / siguiente; si no suena, «pon mi música»), fichas redondas (linterna real; WiFi, Bluetooth, datos, avión y ubicación abren el panel rápido de Android porque no se pueden cambiar directo; alarma, tiempo y cuentas dejan la frase lista en el chat; ARIA = «enlace pc») y volumen en píldora vertical (AsagiControl volumen «poner»). Puro y probado: `textoMusica`, `volumenDe`.

## 22. ARIA como sistema operativo chico (modo escritorio)
- «modo escritorio» / F11: ARIA a pantalla completa con **barra de tareas propia** (`BarraTareas` en `ui/escritorio_ui.py`): ◆ Inicio (abre la pestaña Apps), apps favoritas (subrayadas si están abiertas) + ventanas abiertas (clic = abrir o traer al frente, nunca cerrar), volumen de Windows (teclas multimedia por ctypes), batería (GetSystemPowerStatus) y hora 12 h. Se recuerda entre arranques. «modo ventana» o F11 para salir.
- Puras y probadas: `escritorio_pc.barra`, `nombre_corto`.
- Ya tenía: pestañas Chat/Apps/Archivos/Ventanas, launcher del menú Inicio, isla, mascota, fondo propio.
- Siguiente para el «SO»: notificaciones de ASAGI en la barra, un buscador global (apps + archivos + chat) con Alt+Espacio, y escritorios virtuales (pestañas que guardan qué ventanas van juntas).

## 23. «El mapa de mi Jarvis» (4 capas) aplicado a ASAGI + ARIA (18-nov)
Daniel pasó el texto de la página de Notion (antes privada). Cómo queda cada capa:
- **Capa 1 · Contexto** → NUEVO `entrevista.js`: «entrevístame» = 10 preguntas, una a la vez («salta», «para», «sigue la entrevista»); arma «Mi perfil» con [PENDIENTE] en lo no contestado (nunca inventa). Entra en cada respuesta del cerebro (`personalidad.js`) y se manda a ARIA (`{t:'perfil'}` → `data/perfil_daniel.md` + `perfil_corto.txt`, que ARIA suma a su prompt). «mi perfil», «borra mi perfil».
- **Capa 2 · Conexiones** → ya: correo (ARIA), sesiones de Google (`sesiones.py`), voz y enlace celular↔PC. Falta: agenda (Google Calendar).
- **Capa 3 · Habilidades** → ya: «aprende …» (habilidades), rutinas, `enseñar` de ARIA, Musa. Falta: tablero único.
- **Capa 4 · Autonomía** → NUEVO: resumen de la mañana sin pedirlo (primera apertura del día, 5–12 h; «no me des el resumen de la mañana» / «dame el resumen cada mañana»). Ya: Musa estudia sola, vigía, YouTube. Falta: que llegue aunque ASAGI esté cerrada (WorkManager nativo).
- Repos que mandó: ECC (arnés de agentes: plan → probar → hacer → revisar → verificar → recordar; «instintos» que se aprenden) y Capri (compañera de escritorio estilo Edgerunners; el repo ya no existe). Lo útil de ECC ya está en `aprende.js`/`rutinas.js`; idea pendiente: un paso «verificar» antes de decir «listo» en el modo autónomo.

## 24. Robado de ECC (affaan-m/ECC) y bien implementado (18-nov)
Leí sus skills de verdad (continuous-learning-v2, verification-loop, agent-self-evaluation, unified-memory, agentic-os, strategic-compact):
- **Instintos** (`instintos.js`, de continuous-learning-v2): hábitos atómicos con confianza 0,3–0,9 y evidencia. Fuentes: estilo que Daniel dice («sé más corto», «sin emojis», «prefiero que…», «nunca me digas…») y rutinas (mismo pedido en la misma franja del día en 3+ días). Sube +0,15 por día distinto, baja −0,3 si dice lo contrario, se apaga −0,05 cada 2 semanas sin uso, se borra < 0,2. Solo ≥ 0,5 entra al cerebro (`personalidad.js`, también versión corta) y al resumen de la mañana («sueles pedir…»). «evoluciona tus instintos» = rutinas de una franja → frase «aprende mi mañana: a; b» (instintos → habilidad). Se sincronizan con ARIA (`{t:'instintos'}` → `data/instintos.json`, ARIA los suma a su prompt); los que están en los dos = «global».
- **Planear → hacer → VERIFICAR → recordar** en el modo autónomo (`agente.js`, de verification-loop + agent-self-evaluation): plan con «listo cuando» antes de actuar; antes de entregar, un revisor puntúa 5 ejes (exactitud, completo, claridad, accionable, conciso) y `cifrasSinFuente` detecta números que no salen de ningún resultado; si falla, una ronda de corrección; el final dice «Revisión: cumple / ⚠ …· nota 4,6/5». Memoria de tareas (`asagi-agente-memoria`, 20): en objetivos parecidos le recuerda qué usó y qué faltó.
- **Traspaso celular ↔ PC** (`traspaso.js`, de unified-memory/handoffs): «sigue en la pc» manda la charla a ARIA (`{t:'traspaso'}` → `data/traspaso_entrante.json`; ARIA la muestra y la usa UNA vez como contexto de la siguiente respuesta). En ARIA «pásalo al celular» deja `traspaso_saliente.json`, que va con el próximo latido de ASAGI o con «trae lo de la pc». Todo es CONTEXTO/DATOS, no órdenes.
- No se copió: el paquete npm/MCP de ECC ni sus hooks de Claude Code (son para programar, no para un asistente personal, y serían dependencias nuevas).
- Capri-AI-Desktop: el repo ya no existe; su idea (compañera de escritorio con voz, estilo Edgerunners) ya la cubre la mascota + voz de ARIA.

## 25. La ARIA vieja seguía abriéndose (18-nov)
- Causa: el arranque de Windows apuntaba a `dist\ARIA OS.exe` (la copia de septiembre). `arranque_pc.py` lo arregla, pero solo corre cuando se abre la ARIA NUEVA, y al prender la PC se abría la vieja: nunca llegaba a correr.
- Arreglo directo: reemplacé `dist\ARIA OS.exe` (136 MB, la vieja) por un lanzador de 60 KB (`scripts/windows/lanzador_aria.c`, compilado con zig para Windows, sin consola) que abre la ARIA nueva. Al prender la PC se abre la nueva → `arranque_pc` cambia el arranque a `aria_main.py`, crea «ARIA» en Inicio y manda el lanzador a la Papelera.
- `arranque_pc` ahora también apaga lo viejo de AURA que arranca con Windows: valores de Run que apuntan a la carpeta AURA (no a aria_main; se guardan en `data/arranques_viejos.json`), accesos de la carpeta Inicio (Papelera) y tareas programadas (se DESACTIVAN, reversible).
- Tras cada actualización, ARIA corre `arranque_pc` y `limpieza_pc` sin esperar a reiniciar.
- `aria/data/` ya no va al repo ni al manifiesto (un `shell_state.json` de pruebas chocaba con el de la PC).

## 26. AURA ordenada en un solo lugar (18-nov)
- `aria/ordenar_pc.py` (corre una vez al abrir ARIA, y tras actualizar): MUEVE (no borra) todo lo suelto de `AURA\` a `AURA\_archivo_viejo\basura\` (logs, salidas de pruebas, parches, .bak, nombres rotos «CUsers…», capturas) o `AURA\_archivo_viejo\proyectos\` (v4/v5/v6, AURA_OS, backends, Godot, docker/k8s, etc.), con índice `QUE_HAY_AQUI.md`. En ARIA_APP los informes .md sueltos van a `docs\` y las pruebas viejas a la basura del archivo.
- Se quedan en AURA: ARIA_APP, .venv, dist, asagi, git, .vscode/.kilo, y las claves (.env*, credentials, api_keys, secure_vault).
- Verificado antes: lo que ARIA usa hoy no importa nada de la raíz de AURA (solo módulos viejos que ya se van).
- ARIA: «qué hay en el archivo viejo», «restaura <nombre>», «borra la basura vieja» (pide «sí, bórrala»; va a la Papelera). Los proyectos viejos no se borran.
- Esta vez escribí directo en la PC (por el enlace del escritorio) `aria_va_core.py`, `ui_shell.py`, `arranque_pc.py` y `ordenar_pc.py` (eran idénticos a lo instalado, sin cambios de Daniel), para que todo pase en el PRIMER arranque.

## 27. ARIA usa las sesiones de tu Chrome (18-nov)
- `aria/cookies_pc.py`: lee las cookies del perfil de Chrome de Daniel en la PC (base «Cookies» + llave de «Local State»), las descifra (DPAPI por ctypes, sin dependencias nuevas; AES-GCM con `cryptography`, que ARIA ya trae o instala en su .venv) y las inyecta en el navegador de ARIA (`navegador_aria._asegurar` → `aplicar(ctx)`). Así Musa/navegador entran ya conectados a YouTube/redes y aprenden del feed real. Solo dominios de redes+Google (DOMINIOS), nunca bancos/pagos.
- TODO local: las cookies no se guardan en disco ni se mandan por el enlace al celular (reglas 2 y 4). Se leen del perfil solo al navegar.
- Frases en ARIA: «usa mis sesiones de chrome», «olvida mis cookies importadas». Musa sugiere esto o «conecta google».
- `cookies_copy` (la copia que dejó Daniel) se queda donde está (ordenar_pc la respeta) y sirve de respaldo de la llave; las cookies de verdad salen del Chrome vivo.

## 28. Sin pasos manuales: ARIA autónoma de verdad (18-nov, pedido de Daniel «como Jarvis»)
- Usar tus sesiones de Chrome ya es AUTOMÁTICO: `cookies_pc.activado()` es True por defecto; solo se apaga con «olvida mis cookies». Al arrancar, ARIA deja listo `cryptography` en su .venv en segundo plano (sin pedir nada).
- Musa estudia sola aunque no fijes temas: `estudio_diario` aprende de TU feed de YouTube una vez al día si no hay tema fijo pendiente (`_musa_diaria` ya no corta cuando no hay temas).
- Queda manual solo lo que la ley/el sitio exige que hagas tú (iniciar una sesión que no esté en Chrome: «conecta google»).

## 29. Nunca te pide conectar: Musa aprende igual (18-nov)
- Raíz del enojo de Daniel: pedir «conecta» cada vez. Ahora NO se pide en los flujos autónomos.
- `musa.estudiar(auto=…)`: si no hay sesión de Chrome usable para tu feed, ARIA no te molesta: elige uno de tus intereses (`intereses()`: temas fijos + perfil + lo ya estudiado, con defaults) y aprende por búsqueda pública de YouTube (sin login). Siempre produce algo.
- El intento de feed se marca una vez al día (haya sesión o no), para no repetir cada 3 h.
- `estudio_diario` ahora es a prueba de fallos (si el navegador falla, reintenta luego, sin traceback ni aviso).
- Reusar tu Chrome ya usa el canal real de Chrome (mismo navegador = menos verificaciones de Google). El único «conecta google» que queda es opcional y manual, nunca en lo autónomo.

## 30. Una sola app: ARIA (18-nov)
- Punto de entrada único y gestionado: `aria/aria_main.py` (antes vivía suelto en la PC con restos de «ARIA OS v4.0» y el auto-arranque viejo). Limpio: abre una sola ventana (`desktop_ui.run_desktop` → `ui_shell.Shell`) con TODO (Chat, Apps, Archivos, Ventanas, modo escritorio, mascota, isla, Musa). Sin HTTP, sin servidores. El arranque de Windows, la limpieza y el orden los hace ARIA sola desde dentro. Ahora está en el manifiesto: el actualizador lo mantiene.
- Los otros lanzadores (AURA_OS.bat, aura_app.bat, start_all.bat, el .exe viejo…) quedan archivados/reemplazados/desactivados por arranque_pc + ordenar_pc. En la PC queda una sola ARIA.
- ASAGI (celular) es la mitad móvil del mismo asistente, enlazada a ARIA (perfil, instintos, traspaso, Musa).
- Repo más limpio: quitado un .pyc rastreado por error y restos de depuración en artifacts/.

## 31. Investigación de diseño web 2026 + primera muestra (18-nov)
ASAGI y ARIA son apps DISTINTAS (no se unifican en nombre). Investigado (fuentes: designrush, uxpilot, line25, guías de home screen 2026):
- Profundidad con vidrio solo en capas que flotan; elevación en oscuro con brillo/borde, no sombra.
- Grano/textura sutil para dar cuerpo al negro (encaja con el estilo manga).
- Tipografía display grande con más letter-spacing/interlínea; acentos neón solo en lo interactivo; evitar degradado morado-magenta.
- Micro-animaciones 300–600ms, escalonadas 50–100ms, respetar reduce-motion; bento grid de tarjetas con distinto peso.
- Wallpaper: 4K OLED, lock/home que combinan (2 variantes), sujeto delante del reloj, widgets transparentes, íconos monocromo.
Aplicado (muestra): grano de cine sutil global en ASAGI (`body::after`, opacidad 0.035, mix-blend overlay, off con reduce-motion). Pendiente de ir aplicando: brillo de elevación en tarjetas clave, afinar títulos de ARIA, variantes de wallpaper.

## 32. Fusión con el trabajo de Kilo en ARIA (18-nov)
- Kilo editó ARIA en la PC (repo AURA): tarjetas con brillo base carmesí/oro + glow al hover (clase glow con QColor(255,217,13), blur 18) y titular a 44px con letter-spacing 1.5 e interlínea 1.15; además un callback de enlace ASAGI→chat en desktop_ui.
- Yo tenía en el repo ASAGI cambios de funciones (cookies_pc, _calentar, orden, traspaso, autonomía de Musa). Divergían.
- Fusión de 3 vías (git merge-file) con la versión instalada como base: `ui_shell.py` quedó con el diseño de Kilo Y mis funciones (un solo conflicto trivial en el dispatch de `_cmd_cookies`, resuelto a favor mío). `desktop_ui.py`: yo no lo había tocado, adopté el de Kilo tal cual (quedó con el mismo sha que la PC).
- Manifiesto: añadí el sha de la versión de Kilo en la PC a `previos` de ui_shell.py, para que el actualizador instale la fusión sin marcarlo como conflicto (no se pierde su diseño ni mis funciones).

## 33. Fondo con cualquier foto de tu galería (18-nov)
- Nativo `AsagiControl.elegirFoto` (AsagiControlPlugin.java): usa el Selector de fotos de Android (ACTION_PICK_IMAGES en API 33+, ACTION_GET_CONTENT abajo). NO pide permiso de galería: eliges UNA foto y ASAGI solo recibe esa (seguro por diseño). Devuelve la foto como data URI (máx 1600px, JPEG 86).
- Web: `_asagiPedirImagen` (modo «Mi galería» del fondo) y `_asagiElegirFoto` (editor de foto con auto-ajuste, lo usa «pon mi fondo») prefieren el selector nativo; en web caen al input de archivo. La foto se guarda nítida en IndexedDB (`img`), ya no reducida a 900px en localStorage; se restaura al abrir.
- Probado en simulación (mock de elegirFoto): ambos caminos ponen el fondo. La parte nativa la valida el build del APK en CI.
- Seguridad: el Photo Picker es la forma segura (sin permiso amplio). La revisión de seguridad a fondo de ASAGI+ARIA queda para después (pedido de Daniel).
