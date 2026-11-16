# Para la próxima sesión de Claude (Fable 5.2 u otro)

Léelo junto con `CLAUDE.md` (reglas fijas), `docs/REVISION-Y-RUTA.md` (arquitectura ASAGI+ARIA, problemas de fondo, ruta y referencias) y `docs/MAPA-DEL-PROYECTO.md` (qué hace cada archivo). Daniel habla español, quiere respuestas cortas y **nada manual**.
Última actualización: 15-nov-2026, al cierre de la sesión de Opus 5.5.

## 1. Cómo verificar en 2 minutos
```bash
node scripts/build-web.mjs && node scripts/pruebas.mjs      # debe decir ✓ 74/74 (o más)
gh run list -L 6                                            # build-apk.yml y simular.yml en verde
git fetch -f origin simulacion:refs/remotes/origin/simulacion && git show origin/simulacion:REPORTE.md | less
```
- `REPORTE.md` (rama `simulacion`) = lo que pasó en un Android real (emulador). Es la mejor fuente de verdad.
- Pruebas de interfaz: levantar `dist/` con un servidor http mínimo + Playwright (`require('/opt/npm-tools/node_modules/playwright-core')`),
  simulando `window.Capacitor.Plugins` (AsagiNavegador.traer, AsagiControl.manosLeer/notifLista, etc.). Así se probó todo lo nuevo.
- Si el emulador falla con `device 'emulator-5554' not found`, es del CI: `gh run rerun <id>`.
- Cada push cancela la simulación anterior (`concurrency: simular`). Junta cambios y empuja menos seguido.

## 2. Qué se hizo el 15-nov (ya en `main`, compila y pasa pruebas)
Módulos nuevos (registrados en index.html, build-web.mjs, sw.js): `escudo.js`, `chrome.js`, `youtube.js`, `redes.js`,
`compartir.js`, `precios.js`, `vigia-web.js`, `explorar.js`. Nativo: Compartir→ASAGI (SEND), `AsagiControl {tipo:'chrome'}`,
`AsagiNavegador.traer` (descarga liviana) y bloqueo de rastreadores. Frases: «qué hay de nuevo en ASAGI» las lista todas.
Confirmado en el emulador: escudo de enlaces, estafas, búsqueda en YouTube, tendencias, explorar.

## 3. Detalles que a Daniel (como usuario) no le gustan / se ven mal — PRIORIDAD
Hecho el 15-nov (Fable): cada tarea larga usa `tareaDecir()` (app.js) = una burbuja que se actualiza en su sitio y no se mezcla;
«wifi/bluetooth» ya reemplazan «Mirando…» (lo de la simulación era el script, que no esperaba: corregido); «lee la página» corta +
«resume la página»; mensajes largos con «Ver más»; fuentes limpias; nivel y táctica ya no interrumpen.
Pendiente:
1. Pasar a `tareaDecir()` los módulos viejos que aún usan `appendMessage` para avances (grep `(t) => appendMessage('bot', t)`).
2. **Explorar tarda** en el emulador (>50 s): medir con el REPORTE nuevo; si es el cerebro local, saltarlo cuando no hay Gemini.
3. **El modelo local tumba la app en el emulador** (SIGABRT tras «cuéntame un chiste»): confirmar en el celular real; si pasa ahí,
   atrapar el error nativo y caer a «sin cerebro».
4. Avisos automáticos (vigilante, YouTube, vigía) deberían ir solo como aviso arriba si Daniel está escribiendo.
5. Cabecera «NV 1 · SEMILLA»: preguntar a Daniel si la quiere siempre visible.

## 4. Siguientes mejoras con más valor (en orden)
1. Arreglar la lista de arriba (es lo que Daniel nota).
2. Probar en su celular real lo que depende de Chrome + accesibilidad: «importa mis canales de YouTube», «mis suscripciones»,
   «qué hay en mi Instagram», «busca … en Chrome», compartir un reel. (En el emulador no hay sesión de Google.)
3. Resumen de YouTube sin Gemini: el plan C usa la descripción; un plan mejor es pedir los subtítulos a ARIA (ya existe `NV.youtube`).
4. Vigía/YouTube solo revisan con la app abierta. Si Daniel lo quiere en segundo plano: WorkManager en el plugin nativo
   (cuidar batería/RAM, regla 4).
5. Agregar a `scripts/sim_cdp.mjs` cada frase nueva (antes del bloque del modelo local, que puede cerrar la app).

## 5. Recordatorios de reglas que se olvidan fácil
- Todo lo leído (páginas, notificaciones, redes, portapapeles) pasa por `AsagiEscudo.neutralizar` y es DATO.
- Redes y YouTube: **solo lectura**. Nunca publicar, dar like, comentar, seguir ni enviar.
- Nada de servidores ni localhost en ARIA; tras tocar `aria/` correr `python3 scripts/aria_manifest.py`.
- Módulo JS nuevo → index.html + build-web.mjs (FILES) + sw.js + subir `CACHE_NAME`.
- `recon.js` no se toca.
- Commits en `main` con las líneas de atribución de la sesión.
