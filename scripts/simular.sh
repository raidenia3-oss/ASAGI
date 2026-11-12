#!/usr/bin/env bash
# Corre DENTRO del emulador (lo llama simular.yml). Sin "set -e": cada paso informa y sigue.
P=com.asagi.app
mkdir -p sim/capturas
R=sim/REPORTE.md
log(){ echo "$*" | tee -a "$R"; }
foto(){ adb exec-out screencap -p > "sim/capturas/$1.png"; log "- captura: capturas/$1.png"; }
ui(){ timeout 20 adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml "sim/ui_$1.xml" >/dev/null 2>&1; }
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

adb shell pm disable-user --user 0 com.google.android.apps.nexuslauncher >/dev/null 2>&1
adb shell settings put global anr_show_background 0 >/dev/null 2>&1
log "## Arranque"
T0=$(date +%s)
adb shell monkey -p $P -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
sleep 4; foto 01_arranque_4s
sleep 8      # el arranque real se mide por DevTools (abajo); uiautomator se cuelga con WebViews
foto 02_inicio
log "- PID: $(adb shell pidof $P || echo 'NO CORRE')"

log "## Recorrido"
PID=$(adb shell pidof $P | tr -d '\r')
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID >/dev/null
# Modo manos: en el emulador la Accesibilidad se activa por adb (en el celular real la activa Daniel una vez).
# Va DESPUES de los uiautomator dump: con un servicio de accesibilidad activo, uiautomator se puede colgar.
adb shell settings put secure enabled_accessibility_services $P/com.asagi.brain.AsagiAccessibilityService >/dev/null 2>&1
adb shell settings put secure accessibility_enabled 1 >/dev/null 2>&1
sleep 3
timeout 300 node scripts/sim_persona.mjs 9222 >> "$R" 2>&1 || log "- (recorrido como persona falló, ver arriba)"
timeout 240 node scripts/sim_cdp.mjs 9222 >> "$R" 2>&1 || log "- (DevTools fallo, ver arriba)"
foto 08_tras_chat
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
