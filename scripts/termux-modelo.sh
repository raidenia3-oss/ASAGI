#!/data/data/com.termux/files/usr/bin/bash
# ASAGI: baja el modelo de IA con la RED DE TERMUX (aria2/curl + varios mirrors) y lo
# deja en Descargas para que ASAGI lo importe. Útil cuando la red bloquea la descarga
# directa de la app. Lo dispara ASAGI ("descarga el modelo con termux") o a mano:
#   curl -fsSL https://raw.githubusercontent.com/raidenia3-oss/ASAGI/main/scripts/termux-modelo.sh | bash
set -u
SHA="eddb18fbeee320a9eca35cefc88efdb938d9ebe106922f3d91e261f3cbc1c9f6"
BYTES=397808512
REV="2fc6c39fcfca22bf662cf44f5e563a6b2d3b8984"
NAME="Qwen2.5-0.5B-Instruct-abliterated.Q4_K_M.gguf"

DEST_DIR="/sdcard/Download"
mkdir -p "$DEST_DIR" 2>/dev/null || DEST_DIR="$HOME/storage/downloads"
mkdir -p "$DEST_DIR" 2>/dev/null || { echo "[X] no hay acceso a Descargas. Corre:  termux-setup-storage"; exit 1; }
OUT="$DEST_DIR/asagi-model.gguf"

# Mirrors en orden: GitHub (suele pasar donde HuggingFace está bloqueado), luego HF y su espejo.
URLS=(
  "https://github.com/raidenia3-oss/ASAGI/releases/download/modelo-v1/asagi-model.gguf"
  "https://huggingface.co/mradermacher/Qwen2.5-0.5B-Instruct-abliterated-GGUF/resolve/$REV/$NAME"
  "https://hf-mirror.com/mradermacher/Qwen2.5-0.5B-Instruct-abliterated-GGUF/resolve/$REV/$NAME"
)

tam() { stat -c%s "$1" 2>/dev/null || echo 0; }

if [ -f "$OUT" ] && [ "$(tam "$OUT")" = "$BYTES" ]; then
  echo "[ok] el modelo ya estaba en $OUT"
  echo "Vuelve a ASAGI y escribe:  importa el modelo"
  exit 0
fi

command -v aria2c >/dev/null 2>&1 || pkg install -y aria2 >/dev/null 2>&1 || true
command -v curl   >/dev/null 2>&1 || pkg install -y curl  >/dev/null 2>&1 || true

ok=0
for u in "${URLS[@]}"; do
  host="$(echo "$u" | sed -E 's#https?://([^/]+)/.*#\1#')"
  echo "[..] bajando de $host …"
  if command -v aria2c >/dev/null 2>&1; then
    aria2c -x8 -s8 -k1M -c --console-log-level=warn -o "$(basename "$OUT")" -d "$(dirname "$OUT")" "$u" && ok=1 && break
  elif command -v curl >/dev/null 2>&1; then
    curl -fL -C - --retry 5 -o "$OUT" "$u" && ok=1 && break
  else
    echo "[X] no hay ni aria2 ni curl y no pude instalarlos (¿red?)."; exit 1
  fi
  echo "[!] esa fuente falló, pruebo la siguiente…"
done

[ "$ok" = 1 ] || { echo "[X] no pude bajar de ninguna fuente. Tu red las bloquea todas."; exit 1; }

SZ="$(tam "$OUT")"
if [ "$SZ" != "$BYTES" ]; then
  echo "[X] tamaño incorrecto ($SZ, esperaba $BYTES). Quedó a medias; vuelve a correr esto para reanudar."
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  H="$(sha256sum "$OUT" | cut -d' ' -f1)"
  if [ "$H" != "$SHA" ]; then
    echo "[X] el archivo llegó dañado (hash distinto). Lo borro; vuelve a correr esto."
    rm -f "$OUT"; exit 1
  fi
  echo "[ok] hash verificado"
fi

echo "[ok] modelo listo en $OUT ($((SZ/1048576)) MB)"
echo "Vuelve a ASAGI y escribe:  importa el modelo"
