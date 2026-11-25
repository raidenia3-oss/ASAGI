# Modelo de IA de ASAGI (partido para GitHub)

Qwen2.5-0.5B-Instruct abliterated, Q4_K_M. Total 379 MB, partido en trozos de ≤90 MB
porque GitHub no acepta archivos sueltos >100 MB.

- Archivo final: `asagi-model.gguf` (397808512 bytes)
- SHA256: `eddb18fbeee320a9eca35cefc88efdb938d9ebe106922f3d91e261f3cbc1c9f6`
- Trozos: `asagi-model.gguf.00` … `asagi-model.gguf.04` (en orden)

Para juntarlos: `cat asagi-model.gguf.0* > asagi-model.gguf`
(ASAGI lo hace solo con `scripts/termux-modelo.sh`.)
