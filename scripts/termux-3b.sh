#!/data/data/com.termux/files/usr/bin/bash
# ASAGI: baja el modelo 3B (más listo) de tu GitHub en trozos y lo deja listo para
# llama.cpp y para ASAGI. A mano:
#   curl -fsSL https://raw.githubusercontent.com/raidenia3-oss/ASAGI/main/scripts/termux-3b.sh | bash
set -u
SHA="c771d34ef5ad81f3a2ffb44a747c61de35b7ea2cc1fa522d9613e872a6dfe9eb"
BYTES=1929903520
PARTES=21
BASE="https://raw.githubusercontent.com/raidenia3-oss/ASAGI/modelo-bin/3b/asagi-3b.gguf"
OUT="$HOME/asagi-3b.gguf"

tam() { stat -c%s "$1" 2>/dev/null || echo 0; }

if [ -f "$OUT" ] && [ "$(tam "$OUT")" = "$BYTES" ]; then
  echo "[ok] el 3B ya estaba en $OUT"; echo "Úsalo:  llama-cli -m ~/asagi-3b.gguf"; exit 0
fi

command -v curl >/dev/null 2>&1 || pkg install -y curl >/dev/null 2>&1 || true
command -v llama-cli >/dev/null 2>&1 || pkg install -y llama-cpp >/dev/null 2>&1 || true

TMPD="$HOME/.asagi-3b"; mkdir -p "$TMPD"
for i in $(seq -w 0 $((PARTES-1))); do
  echo "[..] trozo $((10#$i + 1))/$PARTES…"
  if ! curl -fL -C - --retry 5 -o "$TMPD/p$i" "$BASE.$i"; then
    echo "[X] falló el trozo $i (¿red?). Vuelve a correr esto para reanudar."; exit 1
  fi
done

cat "$TMPD"/p* > "$OUT" && rm -rf "$TMPD"
if [ "$(tam "$OUT")" != "$BYTES" ]; then echo "[X] tamaño incorrecto; vuelve a correr para reanudar."; exit 1; fi
if command -v sha256sum >/dev/null 2>&1; then
  [ "$(sha256sum "$OUT" | cut -d' ' -f1)" = "$SHA" ] || { echo "[X] hash distinto (dañado). Lo borro, vuelve a correr."; rm -f "$OUT"; exit 1; }
  echo "[ok] hash verificado"
fi
echo "[ok] 3B listo en $OUT ($(( $(tam "$OUT") /1048576)) MB)"
echo "Para hablarle:  llama-cli -m ~/asagi-3b.gguf"
echo "ASAGI lo usará solo (ya prefiere el 3B)."
