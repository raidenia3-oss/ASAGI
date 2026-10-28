#!/data/data/com.termux/files/usr/bin/bash
# ASAGI · motor nativo en el propio dispositivo (Termux / arm64 / Android).
#
# Qué hace, en orden:
#   1. Actualiza el repo (rama fase2-modelo-local).
#   2. Descarga llama.cpp v0.7.0 (tag fijo) y verifica su SHA256.
#   3. Compila llama.cpp, el motor (asagi_engine.cpp), el puente JNI y host_test.
#   4. Ejecuta host_test (descarga el modelo GGUF si hace falta).
#   5. Guarda el test, el .so y los errores, hace commit y push.
#
# No usa sudo, no pregunta nada. Cualquier fallo queda en $REPO/error.txt y el
# script sigue con el resto de pasos. Al final imprime LISTO o ERROR: <razón>.
set -u

REPO="${ASAGI_REPO:-$HOME/asagi}"
WORK="${ASAGI_WORK:-$HOME/asagi-build}"
MODELS="${ASAGI_MODELS:-$HOME/asagi-models}"
MODEL="$MODELS/Qwen3-0.6B-Q4_K_M.gguf"
MODEL_URL="https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf"
MODEL_BYTES=396705472
LLAMA_TAG="v0.7.0"
LLAMA_SHA256="55d67acf3ad2ad747a9bbeb75f9f0e173dbcc0d1753a471038a90c819421c5e1"
LLAMA_URL="https://github.com/ggml-org/llama.cpp/archive/refs/tags/${LLAMA_TAG}.tar.gz"
BRANCH="${ASAGI_BRANCH:-fase2-modelo-local}"
CPP_DIR="$REPO/capacitor-asagi-brain/android/src/main/cpp"
BUILD="$WORK/build"
ERRORS="$REPO/error.txt"
RESULT="$REPO/test_result.txt"
PREBUILT="$REPO/native/termux/prebuilt/arm64-v8a"
FATAL=""

say()  { printf '\n=== %s ===\n' "$*"; }
warn() { printf '[!] %s\n' "$*"; printf 'AVISO   | %s\n' "$*" >> "$ERRORS"; }
fail() {
  printf '[X] %s\n' "$*"
  printf 'FALLO   | %s\n' "$*" >> "$ERRORS"
  [ -z "$FATAL" ] && FATAL="$*"
  return 0
}

mkdir -p "$WORK" "$MODELS" "$PREBUILT" 2>/dev/null
: > "$ERRORS" 2>/dev/null

if [ ! -d "$REPO/.git" ]; then
  printf 'ERROR: no existe el repo en %s\n' "$REPO"
  exit 1
fi

JOBS=$(nproc 2>/dev/null || echo 2)
[ "$JOBS" -gt 3 ] && JOBS=3   # 4 GB de RAM: 3 compilaciones en paralelo como máximo

say "Entorno"
printf 'arch=%s  jobs=%s  cmake=%s\n' "$(uname -m)" "$JOBS" "$(cmake --version 2>/dev/null | head -1)"
[ "$(uname -m)" = "aarch64" ] || warn "arquitectura $(uname -m): se esperaba aarch64"
for t in clang clang++ cmake ninja git curl pkg-config; do
  command -v "$t" >/dev/null 2>&1 || fail "falta '$t' (pkg install $t)"
done
FREE_MB=$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2{print int($4/1024)}')
[ "${FREE_MB:-9999}" -lt 3072 ] && warn "quedan ${FREE_MB} MB libres; se recomiendan 3 GB"

say "Repositorio ($BRANCH)"
git -C "$REPO" fetch origin "$BRANCH" >>"$WORK/git.log" 2>&1 \
  || warn "git fetch falló (se compila el árbol actual)"
git -C "$REPO" merge --ff-only FETCH_HEAD >>"$WORK/git.log" 2>&1 \
  || warn "origin/$BRANCH no se puede avanzar en limpio (commits locales); se sigue con el árbol actual"
echo "HEAD: $(git -C "$REPO" rev-parse --short HEAD)"

say "llama.cpp $LLAMA_TAG"
TAR="$WORK/llama.cpp-$LLAMA_TAG.tar.gz"
sha_ok() { [ -f "$TAR" ] && echo "$LLAMA_SHA256  $TAR" | sha256sum -c - >/dev/null 2>&1; }
if ! sha_ok; then
  rm -f "$TAR"
  curl -L --fail --retry 3 --retry-delay 3 -C - -o "$TAR" "$LLAMA_URL" >>"$WORK/curl.log" 2>&1 \
    || fail "no se pudo descargar llama.cpp $LLAMA_TAG"
fi
if sha_ok; then
  SRC=$(find "$WORK" -maxdepth 1 -type d -name 'llama.cpp-*' 2>/dev/null | head -1)
  if [ -z "$SRC" ] || [ ! -f "$SRC/CMakeLists.txt" ]; then
    tar -xzf "$TAR" -C "$WORK" >>"$WORK/tar.log" 2>&1 || fail "no se pudo extraer llama.cpp"
    SRC=$(find "$WORK" -maxdepth 1 -type d -name 'llama.cpp-*' 2>/dev/null | head -1)
  fi
  [ -n "$SRC" ] && [ -f "$SRC/CMakeLists.txt" ] || fail "no se encuentra la fuente de llama.cpp"
  echo "fuente: $SRC"
  echo "sha256: OK"
else
  warn "sha256 de llama.cpp no coincide o falta el tarball"
fi

say "jni.h"
WITH_JNI=OFF
JNI_INC=""
for p in "$PREFIX/include/jni.h" "$PREFIX/opt/ndk-sysroot/sysroot/usr/include/jni.h" \
         "$HOME/jni.h" "$HOME/ndk/sysroot/usr/include/jni.h"; do
  [ -f "$p" ] && JNI_INC=$(dirname "$p") && break
done
if [ -z "$JNI_INC" ]; then
  pkg install -y ndk-sysroot >>"$WORK/pkg.log" 2>&1
  for p in "$PREFIX/opt/ndk-sysroot/sysroot/usr/include/jni.h" "$PREFIX/include/jni.h"; do
    [ -f "$p" ] && JNI_INC=$(dirname "$p") && break
  done
fi
if [ -n "$JNI_INC" ]; then
  WITH_JNI=ON
  echo "jni.h: $JNI_INC/jni.h"
else
  warn "jni.h no encontrado: se compila el motor sin el .so JNI (pkg install ndk-sysroot)"
fi

say "Configuración CMake"
CMAKE_ARGS=(-S "$REPO/native/termux" -B "$BUILD" -G Ninja
  -DCMAKE_BUILD_TYPE=Release
  -DASAGI_ROOT="$REPO" -DASAGI_CPP_DIR="$CPP_DIR" -DASAGI_LLAMA_DIR="$SRC"
  -DASAGI_WITH_JNI="$WITH_JNI" -DASAGI_JNI_INCLUDE_DIR="$JNI_INC")
if ! cmake "${CMAKE_ARGS[@]}" -DASAGI_GGML_NATIVE=ON >>"$WORK/cmake.log" 2>&1; then
  warn "GGML_NATIVE=ON no funcionó en este clang; se reintenta con GGML_NATIVE=OFF"
  rm -rf "$BUILD"
  cmake "${CMAKE_ARGS[@]}" -DASAGI_GGML_NATIVE=OFF >>"$WORK/cmake.log" 2>&1 \
    || fail "cmake no pudo configurar (ver $WORK/cmake.log)"
fi

say "Compilación (llama.cpp + motor, $JOBS hilos)"
TARGETS="llama asagi_engine host_test"
[ "$WITH_JNI" = "ON" ] && TARGETS="$TARGETS asagi_brain"
if cmake --build "$BUILD" --target $TARGETS -- -j"$JOBS" >>"$WORK/build.log" 2>&1; then
  echo "compilado OK"
else
  fail "la compilación falló (últimas líneas en $WORK/build.log)"
  tail -25 "$WORK/build.log"
fi

say "Test del motor"
if [ -x "$BUILD/host_test" ]; then
  if [ ! -f "$MODEL" ]; then
    echo "descargando modelo (~400 MB) en $MODEL"
    curl -L --fail --retry 3 --retry-delay 3 -C - -o "$MODEL.part" "$MODEL_URL" >>"$WORK/curl.log" 2>&1 \
      || warn "no se pudo descargar el modelo"
    SIZE=$(stat -c %s "$MODEL.part" 2>/dev/null || echo 0)
    if [ "$SIZE" = "$MODEL_BYTES" ]; then
      mv "$MODEL.part" "$MODEL"
    else
      warn "modelo incompleto ($SIZE/$MODEL_BYTES bytes); queda en $MODEL.part"
    fi
  fi
  if [ -f "$MODEL" ]; then
    "$BUILD/host_test" "$MODEL" > "$RESULT" 2>&1
    RC=$?
  else
    "$BUILD/host_test" --units-only > "$RESULT" 2>&1
    RC=$?
    warn "sin modelo GGUF: el test solo cubre stripThink, no la generación"
  fi
  tail -3 "$RESULT" 2>/dev/null
  [ "$RC" -eq 0 ] || fail "host_test terminó con errores (rc=$RC); detalle en test_result.txt"
else
  fail "no se generó host_test"
fi

say "Artefactos"
if [ -f "$BUILD/libasagi_brain.so" ]; then
  cp "$BUILD/libasagi_brain.so" "$PREBUILT/libasagi_brain.so" \
    && echo "libasagi_brain.so: $(stat -c %s "$PREBUILT/libasagi_brain.so") bytes"
else
  warn "no hay libasagi_brain.so (JNI desactivado o fallo de enlace)"
fi
[ -f "$RESULT" ] && echo "test_result.txt: $(head -1 "$RESULT" 2>/dev/null)"

say "Commit y push"
git -C "$REPO" add "$RESULT" "$ERRORS" native/termux 2>/dev/null
git -C "$REPO" -c user.name="${GIT_AUTHOR_NAME:-ASAGI Termux}" \
              -c user.email="${GIT_AUTHOR_EMAIL:-asagi@localhost}" \
  commit -q -m "build(termux): motor nativo arm64 compilado en el dispositivo (llama.cpp $LLAMA_TAG)" \
  || warn "nada nuevo que commitear"
SHA=$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null)
if [ -n "${GITHUB_TOKEN:-}" ]; then
  HDR=$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 | tr -d '\n')
  git -C "$REPO" -c http.extraHeader="AUTHORIZATION: basic $HDR" \
    push origin "HEAD:$BRANCH" >>"$WORK/git.log" 2>&1 \
    || fail "push falló (token sin permiso o red); ver $WORK/git.log"
else
  git -C "$REPO" push origin "HEAD:$BRANCH" >>"$WORK/git.log" 2>&1 \
    || fail "push falló: Termux no tiene credenciales de GitHub (relanza con GITHUB_TOKEN=... ) ; el commit $SHA quedó local"
fi

say "Resultado"
if [ -n "$FATAL" ]; then
  printf '\nERROR: %s\n' "$FATAL"
  printf 'Detalle completo: %s\n' "$ERRORS"
  exit 1
fi
printf '\nLISTO\n'
printf 'commit: %s  rama: %s\n' "${SHA:-?}" "$BRANCH"
printf 'test: %s\n' "$RESULT"
printf 'so: %s\n' "$PREBUILT/libasagi_brain.so"
exit 0
