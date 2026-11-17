# Mapa del proyecto (generado el 15-nov-2026)

Una línea por archivo, tomada de su comentario inicial. Regenerar si cambia mucho.

**ASAGI (raíz)**

| Archivo | Líneas | Qué hace |
|---|---|---|
| `actualizador.js` | 46 | ASAGI - actualizaciones SIN desinstalar: mira version.json de la release "latest" en GitHub, |
| `ads.js` | 71 | ASAGI - Bloqueo de anuncios (a nivel de dominio). Motor de lista; la aplicacion |
| `agente.js` | 186 | Modo autónomo de ASAGI: le das un OBJETIVO y ella sola piensa, usa sus herramientas, mira el |
| `app.js` | 4245 | Hora en 12 h ("10:49 p. m."), igual que el reloj del celular, sin depender del idioma del sistema. |
| `asagi-apps.js` | 101 | ASAGI - Control de apps del celular (capa segura). Version "computer use" para Asagi. |
| `asagi-browser.js` | 190 | ASAGI - Navegador propio del asistente (version "BrowOS" para Asagi). |
| `avatar.js` | 280 | ASAGI - Avatar vivo del asistente (idea robada de livliv-dev/player: personaje |
| `bandeja.js` | 138 | ASAGI - Bandeja: segundo cerebro local (idea vista: INGEST + "no encaja" + ATENCION). |
| `bots.js` | 281 | ASAGI - Grok bots: despliega varios bots especializados para ayudarte en cualquier |
| `brain-router.js` | 198 | Clasifica la dificultad del prompt para elegir backend. |
| `buscar-mis-cosas.js` | 75 | «Busca en mis cosas» (idea de Khoj: un asistente que busca en TUS datos, no en internet). |
| `calculos.js` | 115 | Cálculos de todos los días, sin internet ni cerebro (ideas de Dicio y Leon, asistentes libres): |
| `chrome.js` | 104 | Chrome como herramienta de ASAGI: abre una página en el Chrome de Daniel (con SUS sesiones: YouTube, Instagram…), |
| `citas.js` | 158 | ASAGI - Citas. Dos modos: |
| `compartir.js` | 106 | «Compartir con ASAGI» (como el panel de IA de los navegadores Comet/Atlas, pero desde cualquier app): |
| `compras.js` | 119 | Lista de compras sin internet ni cerebro (idea de philip211/home-assistant-AI-APK: compras por voz). |
| `deudas.js` | 97 | Cuentas con amigos sin internet: quién te debe y a quién le debes («le presté 20 soles a Juan», «quién me debe», «Juan me pagó»). Solo anota. |
| `conocimiento.js` | 103 | ASAGI - Ingestor de conocimiento: convierte lo que ASAGI "ve" (transcripciones de |
| `conversacion.js` | 122 | Modo conversación a manos libres (como el modo voz de ChatGPT / Open WebUI): |
| `defensa.js` | 91 | ASAGI - Defensa: auditor de seguridad de TU propio celular (defensivo y honesto). |
| `dictado.js` | 134 | ASAGI - Dictado por voz (idea del artifact: Coucou/Wispr Flow como alternativa |
| `discord.js` | 202 | ASAGI - Discord: ASAGI conversa en un canal (y puede hablar con ARIA, que ya |
| `enjambre.js` | 91 | ASAGI - Enjambre: motor de coreografía de la sala de control. Hace que los bots |
| `enlace-adb.js` | 190 | ASAGI - Enlace con ARIA por cable USB (adb-carpeta). |
| `enlace-lan.js` | 158 | ASAGI <-> ARIA directo por WiFi (red local) y Bluetooth. Sin internet, sin tokens, sin servidor externo. |
| `enlace.js` | 401 | ASAGI <-> ARIA: enlace propio, sin servidores. |
| `escudo.js` | 157 | Escudo de navegación de ASAGI: revisa un enlace ANTES de abrirlo y limpia lo que una página intenta ordenarle. |
| `estudia.js` | 88 | ASAGI - Aprender sobre cualquier tema, desde el celular (sin la PC): |
| `explorar.js` | 94 | Modo explorador: «explora agujeros negros» · «todo sobre la selección peruana» · «explórame inteligencia artificial» |
| `foto-ia.js` | 84 | ASAGI - Criterio de foto: la "conciencia" de ASAGI sobre cómo se ve una buena foto. |
| `gemini-guia.js` | 77 | Guía «Usar Gemini gratis»: en 3 toques ASAGI queda con cerebro en la nube. |
| `gestures.js` | 59 | ASAGI - Gestos: deslizar para cambiar de pestana (y arriba en el Launcher = buscar). |
| `habilidades.js` | 68 | Habilidades que Daniel le enseña a ASAGI (macros de comandos que ya existen). |
| `herramientas.js` | 307 | ASAGI - Herramientas del telefono: WiFi, Bluetooth, Termux y Nix. |
| `launcher.js` | 70 | ASAGI - Launcher (lanzadera): reloj + rejilla de apps buscable. La lista de apps y |
| `manos.js` | 238 | ASAGI - Modo manos: ASAGI usa las otras apps del celular por ti (Accesibilidad). |
| `memoria-ia.js` | 71 | Memoria inteligente (idea de Mem0, "Building Production-Ready AI Agents with Scalable Long-Term Memory"): |
| `memoria.js` | 131 | ASAGI - Memoria local (grafo de conocimiento ligero). Port de conocimiento.py de ARIA. |
| `monitor.js` | 74 | ASAGI - Monitor de servicios (idea de Uptime Kuma, sin servidor). Vigila si tus |
| `musica.js` | 219 | Reproductor de música de ASAGI (las canciones guardadas en el celular). |
| `navegador-lector.js` | 156 | Lector de páginas para el navegador de ASAGI y ARIA (el MISMO script corre en el WebView oculto |
| `navegador.js` | 167 | Navegador de ASAGI: usa el WebView oculto nativo (plugin AsagiNavegador) + navegador-lector.js. |
| `niveles.js` | 114 | ASAGI - Niveles de aprendizaje. Mismo principio que la evolución de ARIA (modos.py): |
| `noticias.js` | 77 | ASAGI - Noticias (la "Vigia"). Port de noticias.py de ARIA: junta titulares del dia |
| `notificaciones.js` | 111 | Notificaciones y gastos (ideas de Dicio y PennyWise, hechas a la medida de Perú). |
| `notificar.js` | 93 | ASAGI - Notificaciones nativas de los pendientes con hora. Para que el aviso |
| `openverse.js` | 87 | Openverse (api.openverse.org): imágenes y sonidos de uso libre, sin key. |
| `palette.js` | 131 | ASAGI - Command palette (estilo VengenceUI): busca apps Y comandos con fuzzy match. |
| `pendientes.js` | 269 | ASAGI - Pendientes: recordatorios/tareas locales (idea del artifact: OpenProject |
| `personajes.js` | 155 | ASAGI - Aprender de personajes (carpeta personajes/): cómo piensan, sus tácticas y cómo trabajan. |
| `personalidad.js` | 55 | ASAGI - Personalidad (quien es Asagi). ORIGINAL e inspirada en rasgos, no copia de |
| `piensa.js` | 173 | ASAGI - Razonamiento mejorado. Antes de que cualquier cerebro (Gemini, Atria, Mistral, |
| `precios.js` | 79 | Comparar precios en tiendas del Perú (idea de los navegadores con IA que comparan productos entre pestañas): |
| `razonamiento.js` | 82 | ASAGI - Razonamiento (robado de ARIA: planificador coarse-to-fine + certeza no-inventar). |
| `rea.js` | 96 | ASAGI - REA (Reverse Engineer Anything). Port de investigacion.py de ARIA. |
| `recon.js` | 57 | ASAGI - Recon pasivo de dominios (idea OSINT, defensivo). Consulta DNS por |
| `redes.js` | 100 | Redes sociales en ASAGI (Instagram, TikTok, Facebook, X, WhatsApp, Reddit), SOLO LECTURA y sin contraseñas: |
| `resumen-dia.js` | 100 | «Resumen del día» sin internet ni cerebro: lo que importa hoy en un solo mensaje. |
| `retro.js` | 99 | ASAGI - taller retro (ideas de ascii-magic.com). Motor PURO y testeable. |
| `rutinas.js` | 76 | Rutinas que ASAGI descubre sola (idea de Voyager: el agente arma sus propias habilidades con lo que se repite). |
| `sin-cerebro.js` | 299 | ASAGI sin cerebro: lo que resuelve SOLA, sin modelo, sin key y sin ARIA. |
| `sobre-mi.js` | 93 | «Lo que sé de ti»: ASAGI recuerda datos tuyos y los usa (sin internet ni cerebro). |
| `sw.js` | 115 | Service worker: cachea los archivos (subir CACHE_NAME al agregar módulos). |
| `sync-memoria.js` | 143 | ASAGI - Sync de memoria selectiva (lado Asagi). Espejo JS de sync_memoria.py de ARIA. |
| `ui-fx.js` | 75 | ASAGI - micro-interacciones "caras" (ideas de Uiverse / Animate UI / Vengeance |
| `utiles.js` | 232 | Lo cotidiano que una persona le pide a su asistente y que NO necesita cerebro (antes caía en |
| `vigia-web.js` | 136 | Vigía de páginas (como Visualping/Distill, pero dentro de ASAGI y sin servidores): |
| `vistas.js` | 119 | ASAGI - Vistas: buscar en tu bandeja y tu memoria con filtros, y guardar esas búsquedas. |
| `voz.js` | 86 | ASAGI - Voz + Sigilo. Asagi habla por TTS, pero con DISCRECION: |
| `wallpaper.js` | 616 | ASAGI - Wallpaper animado (v3): PERSONALIZABLE. |
| `wiki.js` | 71 | Wikipedia en español SIN internet, guardada en la tarjeta SD (la arma ARIA en la PC y ASAGI se la trae por WiFi). |
| `youtube.js` | 290 | YouTube en ASAGI (sin claves de YouTube ni contraseñas): |

**ARIA (`aria/`)**

| Archivo | Líneas | Qué hace |
|---|---|---|
| `aria/app_automator.py` | 193 | Automatizacion de apps de escritorio para ARIA (Windows, ctypes). Sin servidores. |
| `aria/aria_actualizador.py` | 140 | ARIA - Se actualiza sola desde GitHub (sin que nadie copie archivos). |
| `aria/aria_browser.py` | 144 | ARIA - Navegador propio (perfil dedicado de Chromium). |
| `aria/aria_mcp.py` | 147 | ARIA como servidor MCP por stdio (para Kilo, Claude Desktop o cualquier agente con MCP). |
| `aria/aria_va_core.py` | 3400 | ARIA Virtual Assistant — Núcleo 100% local, un solo proceso. |
| `aria/bots_agenda.py` | 514 | ARIA - Bots que HACEN cosas (agenda + equipo). Convive con bot_factory.py (bots-proceso de Kilo). |
| `aria/brain_engine.py` | 112 | ARIA brain engine: LLM local dentro del proceso (llama.cpp). |
| `aria/claude_pc.py` | 141 | ARIA - Pedirle trabajos a Claude Code (el agente de programación) cuando algo le queda grande. |
| `aria/componentes.py` | 122 | ARIA - «componentes»: todo lo que ARIA tiene cargado, a la vista (idea Linux From Scratch: |
| `aria/correo.py` | 461 | ARIA - Tu Gmail: lo revisa, resume, saca pendientes y aprende (contactos, temas, tu estilo). |
| `aria/dictado_pc.py` | 228 | ARIA - Dictado en cualquier programa (idea de OpenWhispr), sin internet. |
| `aria/enlace.py` | 473 | ARIA <-> ASAGI: enlace propio, sin servidores ni puertos (regla v2). |
| `aria/ensenar.py` | 170 | ARIA - Modo enseñar: le muestras una tarea UNA vez y queda guardada como rutina. |
| `aria/extras_pc.py` | 133 | ARIA - Instala sola los extras de voz (sin que Daniel haga nada a mano). |
| `aria/fondo_foto.py` | 174 | ARIA - Tu fondo de pantalla, trabajado por ARIA para que se vea bien con su interfaz. |
| `aria/habilidades_pc.py` | 104 | ARIA - Habilidades que Daniel le enseña (cadenas de comandos), igual que en ASAGI. |
| `aria/informe.py` | 192 | ARIA - Informes con fuentes citadas (tarea larga en segundo plano). |
| `aria/lan.py` | 474 | ARIA <-> ASAGI por WiFi (LAN) y Bluetooth, sin internet ni tokens. |
| `aria/manos_pc.py` | 491 | ARIA - Manos en la PC: usa las apps de Windows leyendo su ÁRBOL DE ACCESIBILIDAD |
| `aria/mapa.py` | 140 | ARIA - Mapa de un tema: línea de tiempo + red de relaciones, en una página que se abre sola. |
| `aria/navegador_aria.py` | 420 | ARIA - Su propio navegador (solo para ella). Chromium vía Playwright con un perfil propio |
| `aria/openverse_pc.py` | 90 | ARIA - Openverse (api.openverse.org): imágenes y sonidos de uso libre, sin key. |
| `aria/personajes.py` | 266 | ARIA - Aprender de personajes (carpeta personajes/): sus tácticas y cómo trabajan. |
| `aria/publicar_web.py` | 112 | ARIA - Publicar una web del taller en internet (GitHub Pages de tu cuenta), solo si lo confirmas. |
| `aria/recuerdos.py` | 143 | ARIA - Memoria como ciclo: después de cada mensaje decide QUÉ vale la pena recordar. |
| `aria/rollercoin_google.py` | 125 | ARIA - RollerCoin con «Log in With Google»: ARIA nunca ve ni guarda contraseñas. |
| `aria/taller_web.py` | 347 | ARIA - Taller web: «crea una web de pollería en Breña» -> sitio de una página, listo para abrir. |
| `aria/ui/mascota.py` | 194 | ARIA - Mascota de escritorio: su rostro flotando sobre el escritorio, sin ventana. |
| `aria/ui/rostro_aria.py` | 241 | ARIA - Rostro (cuerpo 'rostro'): cara original de ARIA en QPainter, sin dependencias. |
| `aria/ui_shell.py` | 1987 | ARIA - Shell cyberpunk-Linux estilo 'rice' (Hyprland-like). |
| `aria/voz_local.py` | 256 | ARIA - Voz local con pyttsx3 (SAPI de Windows, offline, sin deps nuevas). |
| `aria/voz_natural.py` | 73 | ARIA - Voz natural con Piper (sin internet, corre en el procesador, sin tarjeta gráfica). |
| `aria/wiki_pc.py` | 313 | ARIA - Wikipedia en español SIN internet, en la tarjeta SD del celular. |

**Nativo (`capacitor-asagi-brain/.../brain/`)**

| Archivo | Líneas | Qué hace |
|---|---|---|
| `Almacen.java` | 131 | Guarda datos nativos persistentes (preferencias/archivos del plugin). |
| `AsagiAccessibilityService.java` | 272 | Servicio de Accesibilidad: lee la pantalla de otras apps (manosLeer) y toca/escribe (modo manos). |
| `AsagiBrainPlugin.java` | 811 | Cerebro local (modelo en el celular): carga, genera texto en streaming. |
| `AsagiControlPlugin.java` | 1505 | Control del teléfono: abrir apps, Chrome, alarmas, linterna, notificaciones, LAN/Bluetooth con ARIA, Termux. |
| `AsagiHablarPlugin.java` | 89 | Voz (TTS nativo). |
| `AsagiMusicaPlugin.java` | 190 | Música local: lista y control. |
| `AsagiMusicaService.java` | 272 | Servicio en primer plano para reproducir música. |
| `AsagiNavegadorPlugin.java` | 232 | Navegador oculto (WebView) + traer() descarga liviana + bloqueo de rastreadores. |
| `AsagiNotificaciones.java` | 97 | Lee notificaciones de otras apps (permiso de notificaciones) para redes/gastos/escudo. |
| `AsagiOirPlugin.java` | 120 | Micrófono / reconocimiento de voz nativo. |
| `BrainDownloadActivity.java` | 393 | Pantalla de descarga del modelo local. |
| `BridgeEventReceiver.java` | 15 | Recibe eventos del sistema para el puente JS. |
| `DownloadProgressReceiver.java` | 41 | Progreso de descarga del modelo. |
| `ModelDownloader.java` | 151 | Descarga el modelo local (GGUF). |
| `TermuxResultReceiver.java` | 33 | Recibe la salida que Termux devuelve por el PendingIntent de RUN_COMMAND. |
