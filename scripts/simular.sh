#!/usr/bin/env bash
# Corre DENTRO del emulador (lo llama simular.yml). Sin "set -e": cada paso informa y sigue.
P=com.asagi.app
mkdir -p sim/capturas
R=sim/REPORTE.md
log(){ echo "$*" | tee -a "$R"; }
foto(){ adb exec-out screencap -p > "sim/capturas/$1.png"; log "- captura: capturas/$1.png"; }
ui(){ adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml "sim/ui_$1.xml" >/dev/null 2>&1; }
toca(){ adb shell input tap "$1" "$2"; sleep "${3:-2}"; }

echo "# Simulacion ASAGI ($(date -u +%F' '%T) UTC)" > "$R"
log "Dispositivo: $(adb shell getprop ro.product.model) / Android $(adb shell getprop ro.build.version.release)"
adb logcat -c
log "## Instalacion"
adb install -r -g asagi.apk 2>&1 | tail -1 | tee -a "$R"
for perm in POST_NOTIFICATIONS ACCESS_FINE_LOCATION BLUETOOTH_CONNECT BLUETOOTH_SCAN NEARBY_WIFI_DEVICES RECORD_AUDIO; do
  adb shell pm grant $P android.permission.$perm >/dev/null 2>&1
done
adb shell dumpsys package $P | grep -m1 versionName | sed 's/^ */- /' >> "$R"

log "## Arranque"
T0=$(date +%s)
adb shell monkey -p $P -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 4; foto 01_arranque_4s
LISTO=""
for i in $(seq 1 45); do
  ui t; if grep -q "Busca una app" sim/ui_t.xml 2>/dev/null; then LISTO=$(( $(date +%s)-T0 )); break; fi; sleep 2
done
log "- Pantalla principal lista en: ${LISTO:-NO (mas de 90s)} s"
foto 02_inicio; cp sim/ui_t.xml sim/ui_inicio.xml 2>/dev/null
log "- PID: $(adb shell pidof $P || echo 'NO CORRE')"

# centro de un nodo cuyo text/content-desc/hint coincide (regex) en el ultimo volcado
centro(){ python3 - "$1" sim/ui_t.xml <<'PY'
import re,sys
x=open(sys.argv[2],encoding='utf-8',errors='ignore').read()
for n in re.finditer(r'<node [^>]*>',x):
    t=n.group(0)
    if re.search(sys.argv[1],' '.join(re.findall(r'(?:text|content-desc|hint)="([^"]*)"',t)),re.I):
        b=list(map(int,re.findall(r'\d+',re.search(r'bounds="([^"]+)"',t).group(1))))
        print((b[0]+b[2])//2,(b[1]+b[3])//2);break
PY
}
textos(){ ui t; python3 - sim/ui_t.xml <<'PY' | tail -n "${1:-14}" | sed 's/^/    /' >> "$R"
import re,sys,html
x=open(sys.argv[1],encoding='utf-8',errors='ignore').read()
vis=[html.unescape(t) for t in re.findall(r' text="([^"]+)"',x)]
print('\n'.join(v[:160] for v in vis))
PY
}
di(){  # escribe en el chat de ASAGI y envia
  ui t; c=$(centro "Busca una app|Escribe|mensaje|pregunta"); [ -z "$c" ] && { log "- (no encontre la caja de texto)"; return; }
  adb shell input tap $c; sleep 1
  adb shell input text "$(echo "$1" | sed 's/ /%s/g')"; adb shell input keyevent KEYCODE_ENTER; sleep "${2:-4}"
  log "### Le digo: \"$1\""; foto "chat_$(echo "$1" | tr -cd 'a-z0-9' | cut -c1-16)"; textos
}

log "## Recorrido"
di "hola asagi" 6
di "bandeja" 3
di "guarda en la bandeja: pagar luz hoy" 3
di "prioridades" 3
di "wifi" 4
di "enlace pc" 8
adb shell input keyevent KEYCODE_BACK; sleep 2; foto 09_atras
log "- Sigue viva tras $(( $(date +%s)-T0 ))s: $(adb shell pidof $P >/dev/null && echo SI || echo NO)"

log "## Registros"
adb logcat -d > sim/logcat_completo.txt
grep -E "Capacitor/Console|chromium.*Console|Capacitor" sim/logcat_completo.txt > sim/consola_js.txt
grep -iE "AndroidRuntime|FATAL|Exception|Uncaught|TypeError|ReferenceError|SyntaxError" sim/logcat_completo.txt \
  | grep -iE "$P|Capacitor|Console|chromium|asagi" > sim/errores.txt
log "- Errores relevantes: $(wc -l < sim/errores.txt) (ver errores.txt)"
head -40 sim/errores.txt | sed 's/^/    /' >> "$R"
log "- Lineas de consola JS: $(wc -l < sim/consola_js.txt)"
adb shell dumpsys meminfo $P | grep -E "TOTAL PSS|TOTAL:" | head -1 | sed 's/^/- Memoria: /' >> "$R"
exit 0
