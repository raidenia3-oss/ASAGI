# Ideas para ARIA (guardadas para la noche, 10-nov-2026)

Origen: capturas de Instagram del usuario. Nada de esto esta hecho en ARIA todavia.

1. **Segundo cerebro (bandeja)** — ya implementado en ASAGI (`bandeja.js`, logica pura JS).
   Portar a Python en ARIA: cubos urgente/proyectos/gente/lectura, "no encaja" en vez de adivinar,
   items ajenos que piden ordenes quedan "sospechoso" y NUNCA se ejecutan, top-5 "atencion".
   Encaja con la memoria de ARIA (CONMEMORIA) y con la regla "nunca enviar sin aprobacion".
2. **rules.md / voice.md / attention.md** — ficheros de reglas que ARIA lee antes de cada tarea
   (estilo de voz, limites, prioridades). Barato y sin dependencias.
3. **Roles de agente con flujo escrito** (mapa por departamentos de skilltree) — ARIA como
   enjambre: cada rol con su flujo en un .md. ASAGI ya tiene enjambre.js; compartir formato.
4. **Gander / Argus** (agentes que ven pantalla/camara y oyen el entorno) — ARIA en PC puede
   mirar la pantalla con capturas periodicas + modelo de vision. Solo con permiso explicito.
5. **WIGVO** — traduccion de voz en tiempo real; util para llamadas. Evaluar licencia y latencia.
6. **Raea** (motor React/TS renderizado en GPU, Rust+Bevy) — para generar video/motion desde ARIA
   en el escritorio. ASAGI (celular) no puede usarlo.
7. **SVG.js** (MIT, sin dependencias) — animar el avatar de ARIA en su interfaz Qt/web si se migra.
8. Descartado: Live Wallpaper (era un anuncio), FreeVideo/Universal Modder (pesados, sin uso claro).

## Añadido 10-nov (tarde)
- Esquema ASK/FILL/BUILD/MARK/HOLD/LOG: ante una orden ambigua, preguntar o suponer a la vista y registrar rechazos.
- DeskBuddy (STDP, red neuronal bio-inspirada que reacciona a la pantalla): idea de mascota reactiva para ARIA en PC.
- Reanimate (skill MIT que clona animaciones desde video/GIF/Lottie a CSS/GSAP/Three): util para animar la UI/avatar.
- Oficina virtual 3D de agentes y 67js (motor 3D controlado por agentes via MCP): visualizar el enjambre de ARIA.
- Fondos animados tipo Wallpaper Engine: ya en ASAGI (modo Video/GIF); en ARIA PC seria un QVideoWidget de fondo.
