#!/data/data/com.termux/files/usr/bin/bash
# ASAGI: baja el modelo de IA con la RED DE TERMUX y lo deja en Descargas para que
# ASAGI lo importe. Útil cuando la red bloquea la descarga directa de la app.
# Fuente principal: GitHub (tu repo, en trozos) — suele pasar donde HuggingFace no.
# Lo dispara ASAGI ("descarga el modelo con termux") o a mano:
#   curl -fsSL https://raw.githubusercontent.com/raidenia3-oss/ASAGI/main/scripts/termux-modelo.sh | bash
set -u
SHA="eddb18fbeee320a9eca35cefc88efdb938d9ebe106922f3d91e261f3cbc1c9f6"
BYTES=397808512
REV="2fc6c39fcfca22bf662cf44f5e563a6b2d3b8984"
NAME="Qwen2.5-0.5B-Instruct-abliterated.Q4_K_M.gguf"
GH_BASE="https://raw.githubusercontent.com/raidenia3-oss/ASAGI/modelo-bin/modelo/asagi-model.gguf"
PARTES=5

DEST_DIR="/sdcard/Download"
mkdir -p "$DEST_DIR" 2>/dev/null || DEST_DIR="$HOME/storage/downloads"
mkdir -p "$DEST_DIR" 2>/dev/null || { echo "[X] no hay acceso a Descargas. Corre:  termux-setup-storage"; exit 1; }
OUT="$DEST_DIR/asagi-model.gguf"

tam() { stat -c%s "$1" 2>/dev/null || echo 0; }
verif_sha() {
  command -v sha256sum >/dev/null 2>&1 || return 0
  [ "$(sha256sum "$1" | cut -d' ' -f1)" = "$SHA" ]
}

if [ -f "$OUT" ] && [ "$(tam "$OUT")" = "$BYTES" ]; then
  echo "[ok] el modelo ya estaba en $OUT"
  echo "Vuelve a ASAGI y escribe:  importa el modelo"
  exit 0
fi

command -v aria2c >/dev/null 2>&1 || pkg install -y aria2 >/dev/null 2>&1 || true
command -v curl   >/dev/null 2>&1 || pkg install -y curl  >/dev/null 2>&1 || true

bajar() {  # bajar <url> <archivo_destino>
  if command -v aria2c >/dev/null 2>&1; then
    aria2c -x8 -s8 -k1M -c --console-log-level=warn --allow-overwrite=true \
      -o "$(basename "$2")" -d "$(dirname "$2")" "$1"
  elif command -v curl >/dev/null 2>&1; then
    curl -fL -C - --retry 5 -o "$2" "$1"
  else
    echo "[X] no hay aria2 ni curl y no pude instalarlos (¿red?)."; return 1
  fi
}

# ---- 1) GitHub en trozos (fuente principal) ----
echo "[..] bajando de GitHub (tu repo, en trozos)…"
TMPD="$DEST_DIR/.asagi-partes"; mkdir -p "$TMPD"
ghok=1
for i in $(seq 0 $((PARTES-1))); do
  n=$(printf "%02d" "$i")
  echo "    trozo $((i+1))/$PARTES…"
  if ! bajar "$GH_BASE.$n" "$TMPD/p$n"; then ghok=0; break; fi
done
if [ "$ghok" = 1 ]; then
  cat "$TMPD"/p?? > "$OUT" 2>/dev/null
  rm -rf "$TMPD"
  if [ "$(tam "$OUT")" = "$BYTES" ] && verif_sha "$OUT"; then
    echo "[ok] modelo listo en $OUT ($(( $(tam "$OUT") /1048576)) MB) — vía GitHub"
    echo "Vuelve a ASAGI y escribe:  importa el modelo"
    exit 0
  fi
  echo "[!] GitHub quedó incompleto o con hash distinto; pruebo HuggingFace…"
  rm -f "$OUT"
fi
rm -rf "$TMPD"

# ---- 2) Respaldo: archivo entero desde HuggingFace / espejo ----
for u in \
  "https://huggingface.co/mradermacher/Qwen2.5-0.5B-Instruct-abliterated-GGUF/resolve/$REV/$NAME" \
  "https://hf-mirror.com/mradermacher/Qwen2.5-0.5B-Instruct-abliterated-GGUF/resolve/$REV/$NAME" ; do
  host="$(echo "$u" | sed -E 's#https?://([^/]+)/.*#\1#')"
  echo "[..] bajando de $host …"
  if bajar "$u" "$OUT"; then
    if [ "$(tam "$OUT")" = "$BYTES" ] && verif_sha "$OUT"; then
      echo "[ok] modelo listo en $OUT — vía $host"
      echo "Vuelve a ASAGI y escribe:  importa el modelo"
      exit 0
    fi
    echo "[!] incompleto o dañado desde $host; sigo…"
  fi
done

echo "[X] no pude bajar el modelo de ninguna fuente. Tu red las bloquea todas."
exit 1
