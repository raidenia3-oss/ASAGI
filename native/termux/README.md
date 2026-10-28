# Motor nativo de ASAGI en Termux (arm64, sin cross-compile)

Compila llama.cpp **en el propio celular** y, contra él, el motor de ASAGI
(`asagi_engine.cpp`), el puente JNI (`asagi_jni_real.cpp`) y el test
(`artifacts/host_test.cpp`). No usa el NDK ni Docker: usa el clang de Termux,
así que el binario corre directamente en el dispositivo.

## Un solo comando

```sh
pkg update -y && pkg upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" && pkg install -y clang cmake ninja git python pkg-config curl && ( [ -d "$HOME/asagi/.git" ] || git clone -b fase2-modelo-local https://github.com/raidenia3-oss/ASAGI.git "$HOME/asagi" ) && bash "$HOME/asagi/native/termux/build-asagi.sh"
```

Para que el commit final también se suba, Termux necesita credenciales de
GitHub. Si no las tiene, relanza así (el token no se guarda en el remoto):

```sh
GITHUB_TOKEN=ghp_xxx bash "$HOME/asagi/native/termux/build-asagi.sh"
```

## Qué genera

| Ruta | Contenido |
| --- | --- |
| `~/asagi-build/build/host_test` | test ejecutable en el celular |
| `~/asagi-build/build/libasagi_brain.so` | puente JNI + motor |
| `~/asagi/test_result.txt` | salida del test |
| `~/asagi/native/termux/prebuilt/arm64-v8a/libasagi_brain.so` | copia versionada |
| `~/asagi/error.txt` | fallos y avisos de la ejecución |

Cachés (no se versionan): `~/asagi-build/llama.cpp-v0.7.0.tar.gz`,
`~/asagi-build/llama.cpp-v0.7.0/` y `~/asagi-models/Qwen3-0.6B-Q4_K_M.gguf`.

## Notas

- llama.cpp está fijado a `v0.7.0` con SHA256 verificado antes de compilar.
- 3 trabajos en paralelo como máximo (4 GB de RAM).
- Si `-mcpu=native` no funciona con el clang del dispositivo, el script
  reintenta con `GGML_NATIVE=OFF`.
- El `.so` compilado en Termux depende de las librerías de Termux: sirve para
  validar el motor en el dispositivo, **no** para empaquetarlo en el APK (el
  APK lo reconstruye el workflow con el NDK).
- Variables útiles: `ASAGI_REPO`, `ASAGI_WORK`, `ASAGI_MODELS`,
  `ASAGI_BRANCH`, `GITHUB_TOKEN`.
