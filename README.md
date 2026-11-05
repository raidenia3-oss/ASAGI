# ASAGI

**ASAGI** es la versión móvil (Android) de ARIA: un asistente personal local-first,
empaquetado con **Capacitor**, con un **cerebro nativo** (llama.cpp) en el dispositivo
y una capa web ligera. Filosofía: local-first, ligero, sin servidores.

## Arquitectura

```
Capa web (dist/)                 Plugins nativos (capacitor-asagi-brain/)
├─ index.html / styles.css       ├─ AsagiBrain      -> motor llama.cpp (GGUF) + descarga
├─ app.js        UI + chat       │                     del modelo + chat remoto OpenAI-compat
├─ brain-router.js               ├─ AsagiControl    -> Servicio de Accesibilidad:
│   enruta local / Gemini / Atria│                     leer pantalla, abrir apps, tocar, escribir
├─ asagi-browser.js              └─ (cpp) asagi_engine / asagi_jni
│   navegador propio (leer/extraer web, acciones con aprobación)
├─ asagi-apps.js
│   usar apps del teléfono (compuerta de aprobación sobre AsagiControl)
└─ sync-memoria.js
    puente de memoria selectiva ARIA <-> ASAGI (JSON + hash SHA-1)
```

### Cerebro híbrido (brain-router.js)
Elige solo el mejor cerebro por red + dificultad + cupo, con respaldo a local:
- **local** — Qwen2.5-0.5B-Instruct-abliterated (GGUF, sin censura), offline.
- **gemini** — Gemini API (free tier) para lo medio.
- **remoto** — Atria Dawn (OpenAI-compat) para lo difícil.
Las acciones con efecto siempre pasan por aprobación.

### Seguridad
- Leer / abrir / navegar = automático.
- Tocar, escribir, enviar, pagar, publicar, borrar = **requieren aprobación** del usuario.
- Las llaves (Gemini/Atria) viven en el dispositivo (localStorage), nunca en el repo.

## Construir

```bash
npm install
npm run build          # copia la capa web a dist/
npx cap sync android
# APK: el workflow .github/workflows/build-apk.yml lo genera y publica en Releases.
```

## Instalar en Termux (entorno de desarrollo)

```bash
curl -sL https://raw.githubusercontent.com/raidenia3-oss/asagi/main/native/termux/setup-asagi-env.sh | bash
```

## Configuración
- `config/keys.example.json` → copiar a `config/keys.json` (ignorado por git) o usar el
  panel **Cerebro** de la app.
- `config/model.json` → modelo GGUF local que se descarga.

## Activar el control del teléfono
Panel **Status** → *Activar accesibilidad* → Ajustes → Accesibilidad → ASAGI.
Inerte hasta que lo actives.
