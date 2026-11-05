#!/data/data/com.termux/files/usr/bin/bash
# ASAGI - Bootstrap del entorno en el movil (Termux).
#
# Idea legitima robada del video "Linux de los hackers en el movil": correr un Linux
# real en el celu como HOGAR de Asagi. Aqui SIN nada ofensivo (ni pentesting ni WiFi):
# solo deja tu Termux listo para desarrollar/usar Asagi de un pegado.
#
# Hace, de forma idempotente (puedes correrlo las veces que quieras):
#   1. Instala lo basico: nodejs, git, python, curl.
#   2. Instala Gemini CLI (agente de codigo, gratis con tu cuenta Google).
#   3. Clona Asagi en ~/asagi (o hace git pull si ya existe).
#   4. Deja un hueco para tu GEMINI_API_KEY en ~/.bashrc (no la pone por ti).
#
# Uso:  bash setup-asagi-env.sh
set -e

info() { printf "\n\033[1;36m==>\033[0m %s\n" "$1"; }
ok()   { printf "\033[1;32m  ok\033[0m %s\n" "$1"; }

REPO="https://github.com/raidenia3-oss/asagi"
DIR="$HOME/asagi"

info "1/4 Instalando paquetes base (nodejs, git, python, curl)"
pkg update -y >/dev/null 2>&1 || true
pkg install -y nodejs git python curl >/dev/null 2>&1
ok "paquetes listos: node $(node -v 2>/dev/null), git $(git --version 2>/dev/null | awk '{print $3}')"

info "2/4 Instalando Gemini CLI"
if command -v gemini >/dev/null 2>&1; then
  ok "gemini ya instalado ($(gemini --version 2>/dev/null | head -1))"
else
  npm install -g @google/gemini-cli >/dev/null 2>&1 && ok "gemini instalado" || \
    echo "  (no se pudo instalar gemini-cli; revisa npm)"
fi

info "3/4 Asagi en ~/asagi"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only >/dev/null 2>&1 && ok "actualizado (git pull)" || ok "ya presente"
else
  git clone --depth 1 "$REPO" "$DIR" >/dev/null 2>&1 && ok "clonado en $DIR" || \
    echo "  (no se pudo clonar; revisa tu conexion)"
fi

info "4/4 Llave de Gemini (no la pongo por ti; va privada en ~/.bashrc)"
if grep -q "GEMINI_API_KEY" "$HOME/.bashrc" 2>/dev/null; then
  ok "GEMINI_API_KEY ya esta en ~/.bashrc"
else
  {
    echo ""
    echo "# Asagi: pega tu llave real de Gemini (https://aistudio.google.com) tras el ="
    echo "export GEMINI_API_KEY="
  } >> "$HOME/.bashrc"
  ok "anadida linea 'export GEMINI_API_KEY=' en ~/.bashrc (editala con tu llave)"
fi

cat <<FIN

\033[1;32mEntorno de Asagi listo.\033[0m
Siguiente:
  1) Edita ~/.bashrc y pon tu llave:   export GEMINI_API_KEY=TU_LLAVE
  2) Recarga:                          source ~/.bashrc
  3) Entra al proyecto y al agente:    cd ~/asagi && gemini

Nada de esto toca Android ni instala herramientas ofensivas: es solo el hogar
de desarrollo de Asagi en tu Termux.
FIN
