#!/data/data/com.termux/files/usr/bin/bash
# ASAGI <-> Termux: se corre UNA sola vez, dentro de Termux.
#   curl -fsSL https://raw.githubusercontent.com/raidenia3-oss/ASAGI/main/scripts/termux-setup.sh | bash
# Hace: (1) deja que ASAGI le mande comandos a Termux, (2) instala nix-portable
# (Nix sin root) para que ASAGI pueda usar "nix: <paquete>".
set -e
mkdir -p "$HOME/.termux" "$HOME/bin"
P="$HOME/.termux/termux.properties"
touch "$P"
if grep -Eq '^[#[:space:]]*allow-external-apps' "$P"; then
  sed -i -E 's/^[#[:space:]]*allow-external-apps.*/allow-external-apps = true/' "$P"
else
  echo 'allow-external-apps = true' >> "$P"
fi
termux-reload-settings 2>/dev/null || true
echo "[ok] ASAGI ya puede ejecutar comandos en Termux"

pkg install -y curl >/dev/null 2>&1 || true
ARQ=$(uname -m)
case "$ARQ" in aarch64|arm64) NP=aarch64 ;; x86_64) NP=x86_64 ;; *) NP="" ;; esac
if [ -n "$NP" ]; then
  curl -fL --retry 3 -o "$HOME/bin/nix-portable" "https://github.com/DavHau/nix-portable/releases/latest/download/nix-portable-$NP"
  chmod +x "$HOME/bin/nix-portable"
  grep -q 'NP_RUNTIME' "$HOME/.bashrc" 2>/dev/null || echo 'export PATH="$HOME/bin:$PATH" NP_RUNTIME=proot' >> "$HOME/.bashrc"
  echo "[ok] nix-portable instalado (la primera orden 'nix:' descarga lo necesario)"
else
  echo "[!] arquitectura $ARQ sin nix-portable; Termux sigue funcionando"
fi
echo "Listo. Vuelve a ASAGI y escribe:  termux: echo hola"
