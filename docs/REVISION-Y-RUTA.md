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
3. **ARIA no tiene CI.** Agrega un job que haga `python -m py_compile aria/*.py aria/ui/*.py` y corra pruebas puras de Python
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
