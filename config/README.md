# config/ — llaves y modelo de ASAGI

## Llaves de API (nube)
Las llaves de Gemini y Atria NO se commitean (quedarian expuestas en GitHub).

1. Copia la plantilla:  `cp config/keys.example.json config/keys.json`
2. Pon tus llaves reales en `config/keys.json` (esta ignorado por git).
3. En el telefono, lo normal es ponerlas en el panel **Cerebro** de la app:
   se guardan en el dispositivo (localStorage) y persisten. El archivo
   `keys.json` es para desarrollo / Termux.

`config/keys.json` NUNCA se sube al repo (ver .gitignore).

## Modelo local (descarga offline)
`config/model.json` define que GGUF descarga Asagi. La descarga es publica
(HuggingFace) y NO usa las llaves de arriba.
