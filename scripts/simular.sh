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
sleep 8;  foto 01_arranque_8s
sleep 12; foto 02_arranque_20s; ui 20s
log "- PID: $(adb shell pidof $P || echo 'NO CORRE')"

log "## Recorrido"
W=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -1); ANCHO=${W%x*}; ALTO=${W#*x}
toca $((ANCHO/2)) $((ALTO/2)) 3; foto 03_toque_centro
adb shell input swipe $((ANCHO/2)) $((ALTO*8/10)) $((ANCHO/2)) $((ALTO*2/10)) 300; sleep 3; foto 04_desliza_arriba; ui desliza
adb shell input keyevent KEYCODE_BACK; sleep 2; foto 05_atras
sleep 25; foto 06_45s
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
