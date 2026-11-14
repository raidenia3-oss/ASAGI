package com.asagi.brain;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.Manifest;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import android.net.wifi.WifiNetworkSuggestion;
import android.bluetooth.BluetoothProfile;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;

/**
 * Plugin "AsagiControl": expone a la app web (asagi-apps.js) las primitivas del
 * Servicio de Accesibilidad para usar las apps del telefono. La compuerta de
 * aprobacion vive en JS; aqui solo se ejecutan las acciones. Si el servicio no esta
 * activado por el usuario, los metodos que lo necesitan responden "no activada".
 */
@CapacitorPlugin(name = "AsagiControl")
public class AsagiControlPlugin extends Plugin {

    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject r = new JSObject();
        r.put("enabled", AsagiAccessibilityService.isRunning());
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** Lista las apps lanzables del telefono (para el Launcher de ASAGI). */

    private static String firmaGenerica = null;

    /** True si la app usa el icono por defecto de Android (el robot generico). */
    private static boolean esIconoGenerico(ResolveInfo ri, PackageManager pm) {
        try {
            if (ri.activityInfo != null && ri.activityInfo.getIconResource() == 0
                    && (ri.activityInfo.applicationInfo == null || ri.activityInfo.applicationInfo.icon == 0)) return true;
            if (firmaGenerica == null) {
                android.graphics.drawable.Drawable d = pm.getDefaultActivityIcon();
                firmaGenerica = dibujarBase64(d, 24);
            }
            String mio = dibujarBase64(ri.loadIcon(pm), 24);
            return mio != null && mio.equals(firmaGenerica);
        } catch (Throwable e) { return false; }
    }

    private static String dibujarBase64(android.graphics.drawable.Drawable d, int s) {
        try {
            android.graphics.Bitmap bm = android.graphics.Bitmap.createBitmap(s, s, android.graphics.Bitmap.Config.ARGB_8888);
            android.graphics.Canvas c = new android.graphics.Canvas(bm);
            d.setBounds(0, 0, s, s); d.draw(c);
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            bm.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, bo); bm.recycle();
            return android.util.Base64.encodeToString(bo.toByteArray(), android.util.Base64.NO_WRAP);
        } catch (Throwable e) { return null; }
    }

    /** Foto de perfil del dueño (contacto "Yo"). Pide el permiso de contactos una vez. */
    @PluginMethod
    public void fotoPerfil(PluginCall call) {
        JSObject r = new JSObject();
        try {
            if (!tiene("android.permission.READ_CONTACTS")) {
                android.app.Activity act = (android.app.Activity) getContext();
                androidx.core.app.ActivityCompat.requestPermissions(act, new String[] { "android.permission.READ_CONTACTS" }, 4471);
                r.put("ok", false); r.put("error", "sinPermiso"); call.resolve(r); return;
            }
            android.database.Cursor cur = getContext().getContentResolver().query(
                    android.provider.ContactsContract.Profile.CONTENT_URI,
                    new String[] { android.provider.ContactsContract.Profile.PHOTO_URI, android.provider.ContactsContract.Profile.DISPLAY_NAME },
                    null, null, null);
            String uri = null, nombre = null;
            if (cur != null) { if (cur.moveToFirst()) { uri = cur.getString(0); nombre = cur.getString(1); } cur.close(); }
            if (uri == null) { r.put("ok", false); r.put("error", "sinFoto"); if (nombre != null) r.put("nombre", nombre); call.resolve(r); return; }
            java.io.InputStream in = getContext().getContentResolver().openInputStream(android.net.Uri.parse(uri));
            android.graphics.Bitmap bm = android.graphics.BitmapFactory.decodeStream(in); in.close();
            int lado = Math.min(bm.getWidth(), bm.getHeight());
            android.graphics.Bitmap sq = android.graphics.Bitmap.createBitmap(bm, (bm.getWidth() - lado) / 2, (bm.getHeight() - lado) / 2, lado, lado);
            android.graphics.Bitmap sc = android.graphics.Bitmap.createScaledBitmap(sq, 256, 256, true);
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            sc.compress(android.graphics.Bitmap.CompressFormat.JPEG, 88, bo);
            r.put("ok", true); r.put("foto", android.util.Base64.encodeToString(bo.toByteArray(), android.util.Base64.NO_WRAP));
            if (nombre != null) r.put("nombre", nombre);
        } catch (Throwable e) { r.put("ok", false); r.put("error", String.valueOf(e.getMessage())); }
        call.resolve(r);
    }

    /** Icono real de la app como PNG 96x96 en base64 (lo pinta el launcher de ASAGI). */
    private static String iconoBase64(ResolveInfo ri, PackageManager pm) {
        try {
            android.graphics.drawable.Drawable d = ri.loadIcon(pm);
            int s = 96;
            android.graphics.Bitmap bm = android.graphics.Bitmap.createBitmap(s, s, android.graphics.Bitmap.Config.ARGB_8888);
            android.graphics.Canvas c = new android.graphics.Canvas(bm);
            d.setBounds(0, 0, s, s); d.draw(c);
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            bm.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, bo);
            bm.recycle();
            return android.util.Base64.encodeToString(bo.toByteArray(), android.util.Base64.NO_WRAP);
        } catch (Throwable e) { return null; }
    }

    @PluginMethod
    public void listApps(PluginCall call) {
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN, null);
        main.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> apps = pm.queryIntentActivities(main, 0);
        String self = ctx.getPackageName();
        JSArray arr = new JSArray();
        for (ResolveInfo ri : apps) {
            if (ri.activityInfo == null) {
                continue;
            }
            String pkg = ri.activityInfo.packageName;
            if (pkg == null || pkg.equals(self)) {
                continue;
            }
            JSObject o = new JSObject();
            try {
                o.put("label", ri.loadLabel(pm).toString());
            } catch (Exception e) {
                o.put("label", pkg);
            }
            o.put("package", pkg);
            String ic = iconoBase64(ri, pm);
            if (ic != null) o.put("icon", ic);
            if (ic == null || esIconoGenerico(ri, pm)) o.put("generico", true);
            arr.put(o);
        }
        JSObject r = new JSObject();
        r.put("apps", arr);
        call.resolve(r);
    }

    /** Auditoria de seguridad: cada app con sus permisos y origen (para defensa.js). */
    @PluginMethod
    public void appAudit(PluginCall call) {
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN, null);
        main.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> apps = pm.queryIntentActivities(main, 0);
        String self = ctx.getPackageName();
        JSArray arr = new JSArray();
        java.util.HashSet<String> seen = new java.util.HashSet<>();
        for (ResolveInfo ri : apps) {
            if (ri.activityInfo == null) {
                continue;
            }
            String pkg = ri.activityInfo.packageName;
            if (pkg == null || pkg.equals(self) || seen.contains(pkg)) {
                continue;
            }
            seen.add(pkg);
            JSObject o = new JSObject();
            o.put("package", pkg);
            try {
                o.put("label", ri.loadLabel(pm).toString());
            } catch (Exception e) {
                o.put("label", pkg);
            }
            JSArray perms = new JSArray();
            boolean system = false;
            try {
                PackageInfo pi = pm.getPackageInfo(pkg, PackageManager.GET_PERMISSIONS);
                if (pi.requestedPermissions != null) {
                    for (String p : pi.requestedPermissions) {
                        perms.put(p);
                    }
                }
                if (pi.applicationInfo != null) {
                    system = (pi.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
                }
            } catch (Exception e) {
                // sin permisos legibles
            }
            o.put("permissions", perms);
            o.put("system", system);
            String installer = "";
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    installer = pm.getInstallSourceInfo(pkg).getInstallingPackageName();
                } else {
                    installer = pm.getInstallerPackageName(pkg);
                }
            } catch (Exception e) {
                installer = "";
            }
            o.put("installer", installer == null ? "" : installer);
            arr.put(o);
        }
        JSObject r = new JSObject();
        r.put("apps", arr);
        call.resolve(r);
    }

    @PluginMethod
    public void openApp(PluginCall call) {
        String pkg = call.getString("package", "");
        if (pkg == null || pkg.isEmpty()) {
            call.reject("falta 'package'");
            return;
        }
        Context ctx = getContext();
        Intent i = ctx.getPackageManager().getLaunchIntentForPackage(pkg);
        if (i == null) {
            call.reject("app no encontrada: " + pkg);
            return;
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        call.resolve();
    }

    /** Acciones del sistema por intent (lista cerrada): alarma, temporizador, marcar, buscar, url, bateria.
     *  Sin permisos peligrosos: SET_ALARM es normal y ACTION_DIAL solo abre el marcador (no llama). */
    @PluginMethod
    public void accion(PluginCall call) {
        String tipo = call.getString("tipo", "");
        Context ctx = getContext();
        JSObject r = new JSObject();
        try {
            Intent i = null;
            switch (tipo == null ? "" : tipo) {
                case "alarma": {
                    i = new Intent(android.provider.AlarmClock.ACTION_SET_ALARM);
                    i.putExtra(android.provider.AlarmClock.EXTRA_HOUR, call.getInt("hora", 7));
                    i.putExtra(android.provider.AlarmClock.EXTRA_MINUTES, call.getInt("minuto", 0));
                    String msg = call.getString("mensaje", "");
                    if (msg != null && !msg.isEmpty()) i.putExtra(android.provider.AlarmClock.EXTRA_MESSAGE, msg);
                    i.putExtra(android.provider.AlarmClock.EXTRA_SKIP_UI, call.getBoolean("silenciosa", true));
                    break;
                }
                case "temporizador": {
                    i = new Intent(android.provider.AlarmClock.ACTION_SET_TIMER);
                    i.putExtra(android.provider.AlarmClock.EXTRA_LENGTH, Math.max(1, call.getInt("segundos", 60)));
                    String msg = call.getString("mensaje", "");
                    if (msg != null && !msg.isEmpty()) i.putExtra(android.provider.AlarmClock.EXTRA_MESSAGE, msg);
                    i.putExtra(android.provider.AlarmClock.EXTRA_SKIP_UI, call.getBoolean("silenciosa", true));
                    break;
                }
                case "marcar": {
                    String num = call.getString("numero", "");
                    i = new Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:" + (num == null ? "" : num.replaceAll("[^0-9+*#]", ""))));
                    break;
                }
                case "contactos": {
                    i = new Intent(Intent.ACTION_VIEW, android.provider.ContactsContract.Contacts.CONTENT_URI);
                    break;
                }
                case "buscar": {
                    i = new Intent(Intent.ACTION_WEB_SEARCH);
                    i.putExtra(android.app.SearchManager.QUERY, call.getString("texto", ""));
                    break;
                }
                case "url": {
                    String u = call.getString("url", "");
                    if (u == null || !(u.startsWith("https://") || u.startsWith("http://"))) { call.reject("url invalida"); return; }
                    i = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(u));
                    break;
                }
                case "linterna": {
                    android.hardware.camera2.CameraManager cm = (android.hardware.camera2.CameraManager) ctx.getSystemService(Context.CAMERA_SERVICE);
                    boolean on = call.getBoolean("encender", true);
                    boolean hecho = false;
                    for (String id : cm.getCameraIdList()) {
                        Boolean flash = cm.getCameraCharacteristics(id).get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE);
                        if (flash != null && flash) { cm.setTorchMode(id, on); hecho = true; break; }
                    }
                    r.put("ok", hecho);
                    if (!hecho) r.put("error", "este celular no tiene linterna");
                    call.resolve(r);
                    return;
                }
                case "panel": {
                    String que = call.getString("que", "");
                    String a;
                    switch (que == null ? "" : que) {
                        case "wifi": a = Build.VERSION.SDK_INT >= 29 ? Settings.Panel.ACTION_WIFI : Settings.ACTION_WIFI_SETTINGS; break;
                        case "bluetooth": a = Settings.ACTION_BLUETOOTH_SETTINGS; break;
                        case "datos": a = Build.VERSION.SDK_INT >= 29 ? Settings.Panel.ACTION_INTERNET_CONNECTIVITY : Settings.ACTION_DATA_ROAMING_SETTINGS; break;
                        case "modo avion": a = Settings.ACTION_AIRPLANE_MODE_SETTINGS; break;
                        case "ubicacion": a = Settings.ACTION_LOCATION_SOURCE_SETTINGS; break;
                        default: a = Settings.ACTION_SETTINGS;
                    }
                    i = new Intent(a);
                    break;
                }
                case "bateria": {
                    Intent b = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                    int nivel = b == null ? -1 : b.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1);
                    int escala = b == null ? -1 : b.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, -1);
                    int est = b == null ? -1 : b.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1);
                    int temp = b == null ? -1 : b.getIntExtra(android.os.BatteryManager.EXTRA_TEMPERATURE, -1);
                    r.put("ok", nivel >= 0 && escala > 0);
                    r.put("porcentaje", (nivel >= 0 && escala > 0) ? Math.round(nivel * 100f / escala) : -1);
                    r.put("cargando", est == android.os.BatteryManager.BATTERY_STATUS_CHARGING || est == android.os.BatteryManager.BATTERY_STATUS_FULL);
                    r.put("temperatura", temp > 0 ? temp / 10.0 : -1);
                    call.resolve(r);
                    return;
                }
                default:
                    call.reject("accion desconocida: " + tipo);
                    return;
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (i.resolveActivity(ctx.getPackageManager()) == null && !"marcar".equals(tipo)) {
                r.put("ok", false); r.put("error", "ninguna app del celular acepta esto");
                call.resolve(r); return;
            }
            ctx.startActivity(i);
            r.put("ok", true);
        } catch (Throwable e) {
            r.put("ok", false); r.put("error", String.valueOf(e.getMessage()));
        }
        call.resolve(r);
    }

    @PluginMethod
    public void readScreen(PluginCall call) {
        AsagiAccessibilityService s = AsagiAccessibilityService.getInstance();
        if (s == null) {
            call.reject("accesibilidad no activada");
            return;
        }
        JSObject r = new JSObject();
        r.put("text", s.readScreen());
        call.resolve(r);
    }

    @PluginMethod
    public void tap(PluginCall call) {
        AsagiAccessibilityService s = AsagiAccessibilityService.getInstance();
        if (s == null) {
            call.reject("accesibilidad no activada");
            return;
        }
        Double x = call.getDouble("x");
        Double y = call.getDouble("y");
        if (x == null || y == null) {
            call.reject("faltan x,y");
            return;
        }
        boolean ok = s.tap(x.floatValue(), y.floatValue());
        JSObject r = new JSObject();
        r.put("ok", ok);
        call.resolve(r);
    }

    // ---------------- Modo manos (agente de pantalla) ----------------
    private AsagiAccessibilityService manos(PluginCall call) {
        AsagiAccessibilityService s = AsagiAccessibilityService.getInstance();
        if (s == null) call.reject("accesibilidad no activada");
        return s;
    }

    @PluginMethod
    public void manosLeer(PluginCall call) {
        AsagiAccessibilityService s = manos(call); if (s == null) return;
        JSObject r = new JSObject();
        r.put("app", s.paqueteActual());
        try { r.put("nodos", new com.getcapacitor.JSArray(s.leerNodos(call.getInt("max", 80)).toString())); }
        catch (org.json.JSONException e) { r.put("nodos", new com.getcapacitor.JSArray()); }
        call.resolve(r);
    }

    @PluginMethod
    public void manosTocar(PluginCall call) {
        AsagiAccessibilityService s = manos(call); if (s == null) return;
        JSObject r = new JSObject();
        r.put("ok", s.tocarElemento(call.getString("texto", "")));
        call.resolve(r);
    }

    @PluginMethod
    public void manosEscribir(PluginCall call) {
        AsagiAccessibilityService s = manos(call); if (s == null) return;
        String res = s.escribirSeguro(call.getString("texto", ""));
        JSObject r = new JSObject();
        r.put("ok", "ok".equals(res)); r.put("motivo", res);
        call.resolve(r);
    }

    @PluginMethod
    public void manosGlobal(PluginCall call) {
        AsagiAccessibilityService s = manos(call); if (s == null) return;
        JSObject r = new JSObject();
        r.put("ok", s.global(call.getString("accion", "")));
        call.resolve(r);
    }

    @PluginMethod
    public void manosDesplazar(PluginCall call) {
        AsagiAccessibilityService s = manos(call); if (s == null) return;
        JSObject r = new JSObject();
        r.put("ok", s.desplazar(!"arriba".equals(call.getString("dir", "abajo"))));
        call.resolve(r);
    }

    /** ¿Hay audifonos (cable/BT/USB) conectados? Para el modo sigilo de la voz. */
    @PluginMethod
    public void headsetConnected(PluginCall call) {
        boolean connected = false;
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                AudioDeviceInfo[] devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
                for (AudioDeviceInfo d : devices) {
                    int t = d.getType();
                    if (t == AudioDeviceInfo.TYPE_WIRED_HEADSET
                            || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                            || t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
                            || t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                            || t == AudioDeviceInfo.TYPE_USB_HEADSET) {
                        connected = true;
                        break;
                    }
                }
            } else {
                connected = am.isWiredHeadsetOn() || am.isBluetoothA2dpOn();
            }
        }
        JSObject r = new JSObject();
        r.put("connected", connected);
        call.resolve(r);
    }

    /**
     * Dice QUE salida de audio esta activa (earbuds, auto, altavoz...) y su
     * nombre. Sirve para que ASAGI sepa si puede hablar y con que tono.
     * Usa solo AudioManager: NO necesita permisos de Bluetooth ni ubicacion.
     */
    @PluginMethod
    public void audioOutput(PluginCall call) {
        String tipo = "altavoz";
        String nombre = "";
        boolean privado = false;
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (am != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            AudioDeviceInfo[] devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
            for (AudioDeviceInfo d : devices) {
                int t = d.getType();
                String cand = null;
                if (t == AudioDeviceInfo.TYPE_WIRED_HEADSET
                        || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                        || t == AudioDeviceInfo.TYPE_USB_HEADSET) {
                    cand = "audifonos";
                } else if (t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
                        || t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
                    cand = "bluetooth";
                }
                if (cand != null) {
                    tipo = cand;
                    privado = true;
                    try {
                        CharSequence pn = d.getProductName();
                        if (pn != null) nombre = pn.toString();
                    } catch (Throwable ignored) { }
                    break;   // el primero privado manda
                }
            }
        }
        JSObject r = new JSObject();
        r.put("tipo", tipo);        // audifonos | bluetooth | altavoz
        r.put("nombre", nombre);    // p.ej. "WH-1000XM4" o el nombre del auto
        r.put("privado", privado);  // true = solo lo oyes tu
        call.resolve(r);
    }

    /** Abre los ajustes para elegir la app de inicio (home/launcher). */
    @PluginMethod
    public void openHomeSettings(PluginCall call) {
        Context ctx = getContext();
        try {
            Intent i = new Intent(Settings.ACTION_HOME_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception e) {
            Intent w = new Intent(Settings.ACTION_SETTINGS);
            w.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(w);
        }
        call.resolve();
    }

    /** Abre los ajustes de DNS privado (bloqueo de anuncios system-wide, sin root). */
    @PluginMethod
    public void openDnsSettings(PluginCall call) {
        Context ctx = getContext();
        try {
            Intent i = new Intent("android.settings.PRIVATE_DNS_SETTINGS");
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception e) {
            Intent w = new Intent(Settings.ACTION_WIRELESS_SETTINGS);
            w.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(w);
        }
        call.resolve();
    }

    @PluginMethod
    public void typeText(PluginCall call) {
        AsagiAccessibilityService s = AsagiAccessibilityService.getInstance();
        if (s == null) {
            call.reject("accesibilidad no activada");
            return;
        }
        String text = call.getString("text", "");
        boolean ok = s.typeText(text);
        JSObject r = new JSObject();
        r.put("ok", ok);
        call.resolve(r);
    }

    // ------------------------------------------------------------------
    // Herramientas: WiFi, Bluetooth y Termux (las usa herramientas.js)
    // ------------------------------------------------------------------

    private boolean tiene(String permiso) {
        return ContextCompat.checkSelfPermission(getContext(), permiso) == PackageManager.PERMISSION_GRANTED;
    }

    /** Pide de una vez los permisos de WiFi, Bluetooth y Termux que falten. */
    @PluginMethod
    public void pedirPermisosRadios(PluginCall call) {
        ArrayList<String> falta = new ArrayList<>();
        String[] todos;
        if (Build.VERSION.SDK_INT >= 33) {
            todos = new String[]{Manifest.permission.ACCESS_FINE_LOCATION, "android.permission.NEARBY_WIFI_DEVICES",
                    "android.permission.BLUETOOTH_CONNECT", "android.permission.BLUETOOTH_SCAN",
                    "com.termux.permission.RUN_COMMAND"};
        } else if (Build.VERSION.SDK_INT >= 31) {
            todos = new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                    "android.permission.BLUETOOTH_CONNECT", "android.permission.BLUETOOTH_SCAN",
                    "com.termux.permission.RUN_COMMAND"};
        } else {
            todos = new String[]{Manifest.permission.ACCESS_FINE_LOCATION, "com.termux.permission.RUN_COMMAND"};
        }
        for (String p : todos) if (!tiene(p)) falta.add(p);
        JSObject r = new JSObject();
        r.put("pedidos", falta.size());
        Context cx = getContext();
        if (!falta.isEmpty() && cx instanceof android.app.Activity) {
            final android.app.Activity act = (android.app.Activity) cx;
            final String[] arr = falta.toArray(new String[0]);
            act.runOnUiThread(() -> act.requestPermissions(arr, 7301));
        }
        call.resolve(r);
    }

    private static String seguridadWifi(String caps) {
        if (caps == null) return "";
        if (caps.contains("SAE") || caps.contains("WPA3")) return "WPA3";
        if (caps.contains("WPA2")) return "WPA2";
        if (caps.contains("WPA")) return "WPA";
        if (caps.contains("WEP")) return "WEP";
        return "abierta";
    }

    private JSObject armarWifi(WifiManager wm) {
        JSObject r = new JSObject();
        r.put("habilitado", wm.isWifiEnabled());
        try {
            WifiInfo wi = wm.getConnectionInfo();
            if (wi != null && wi.getNetworkId() != -1) {
                String ssid = wi.getSSID();
                if (ssid != null) ssid = ssid.replace("\"", "");
                if (ssid != null && ssid.contains("unknown ssid")) ssid = "";
                JSObject c = new JSObject();
                c.put("ssid", ssid == null ? "" : ssid);
                c.put("rssi", wi.getRssi());
                c.put("velocidad", wi.getLinkSpeed());
                int ip = wi.getIpAddress();
                c.put("ip", (ip & 0xff) + "." + ((ip >> 8) & 0xff) + "." + ((ip >> 16) & 0xff) + "." + ((ip >> 24) & 0xff));
                r.put("conectado", c);
            }
        } catch (Throwable ignored) { }
        JSArray redes = new JSArray();
        try {
            List<ScanResult> sr = wm.getScanResults();
            if (sr != null) {
                for (ScanResult x : sr) {
                    if (x.SSID == null || x.SSID.isEmpty()) continue;
                    JSObject o = new JSObject();
                    o.put("ssid", x.SSID);
                    o.put("rssi", x.level);
                    o.put("seguridad", seguridadWifi(x.capabilities));
                    redes.put(o);
                }
            }
        } catch (Throwable ignored) { }
        r.put("redes", redes);
        return r;
    }

    @PluginMethod
    public void wifiInfo(PluginCall call) {
        Context ctx = getContext();
        WifiManager wm = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm == null) {
            JSObject r = new JSObject();
            r.put("habilitado", false);
            call.resolve(r);
            return;
        }
        boolean perm = tiene(Manifest.permission.ACCESS_FINE_LOCATION)
                && (Build.VERSION.SDK_INT < 33 || tiene("android.permission.NEARBY_WIFI_DEVICES"));
        if (!perm) {
            JSObject r = new JSObject();
            r.put("habilitado", wm.isWifiEnabled());
            r.put("sinPermiso", true);
            call.resolve(r);
            return;
        }
        boolean escanear = Boolean.TRUE.equals(call.getBoolean("escanear", false));
        if (escanear && wm.isWifiEnabled()) {
            try { wm.startScan(); } catch (Throwable ignored) { }
            new Handler(Looper.getMainLooper()).postDelayed(() -> call.resolve(armarWifi(wm)), 3000);
        } else {
            call.resolve(armarWifi(wm));
        }
    }

    private static String tipoBt(BluetoothDevice d) {
        try {
            BluetoothClass bc = d.getBluetoothClass();
            if (bc == null) return "";
            switch (bc.getMajorDeviceClass()) {
                case BluetoothClass.Device.Major.AUDIO_VIDEO: return "audio";
                case BluetoothClass.Device.Major.PHONE: return "teléfono";
                case BluetoothClass.Device.Major.COMPUTER: return "computadora";
                case BluetoothClass.Device.Major.WEARABLE: return "reloj/pulsera";
                case BluetoothClass.Device.Major.PERIPHERAL: return "periférico";
                default: return "";
            }
        } catch (Throwable t) { return ""; }
    }

    private String audioBtActivo() {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
                    if (d.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || d.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
                        CharSequence n = d.getProductName();
                        if (n != null) return n.toString();
                    }
                }
            }
        } catch (Throwable ignored) { }
        return "";
    }

    private JSObject armarBt(BluetoothAdapter ad, JSArray cercanos, boolean escaneado) {
        JSObject r = new JSObject();
        r.put("disponible", true);
        r.put("habilitado", ad.isEnabled());
        JSArray vin = new JSArray();
        String activo = audioBtActivo();
        try {
            for (BluetoothDevice d : ad.getBondedDevices()) {
                JSObject o = new JSObject();
                String n = d.getName();
                o.put("nombre", n == null ? "" : n);
                o.put("mac", d.getAddress());
                o.put("mio", true);      // vinculado = lo emparejaste tu en este celular
                o.put("tipo", tipoBt(d));
                o.put("conectado", n != null && !activo.isEmpty() && n.equals(activo));
                vin.put(o);
            }
        } catch (Throwable ignored) { }
        r.put("vinculados", vin);
        r.put("cercanos", cercanos == null ? new JSArray() : cercanos);
        r.put("escaneado", escaneado);
        return r;
    }

    @PluginMethod
    public void bluetoothInfo(PluginCall call) {
        Context ctx = getContext();
        BluetoothManager bm = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
        final BluetoothAdapter ad = bm == null ? null : bm.getAdapter();
        if (ad == null) {
            JSObject r = new JSObject();
            r.put("disponible", false);
            call.resolve(r);
            return;
        }
        if (Build.VERSION.SDK_INT >= 31 && !tiene("android.permission.BLUETOOTH_CONNECT")) {
            JSObject r = new JSObject();
            r.put("disponible", true);
            r.put("habilitado", false);
            r.put("sinPermiso", true);
            call.resolve(r);
            return;
        }
        boolean escanear = Boolean.TRUE.equals(call.getBoolean("escanear", false));
        boolean puedeEscanear = Build.VERSION.SDK_INT < 31 || tiene("android.permission.BLUETOOTH_SCAN");
        if (!escanear || !ad.isEnabled() || !puedeEscanear) {
            call.resolve(armarBt(ad, null, false));
            return;
        }
        final JSArray vistos = new JSArray();
        final ArrayList<String> ya = new ArrayList<>();
        final java.util.HashSet<String> propios = new java.util.HashSet<>();
        try { for (BluetoothDevice b : ad.getBondedDevices()) propios.add(b.getAddress()); } catch (Throwable ignored) { }
        final BroadcastReceiver rec = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent i) {
                if (!BluetoothDevice.ACTION_FOUND.equals(i.getAction())) return;
                try {
                    BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    if (d == null) return;
                    String n = d.getName();
                    String clave = d.getAddress();
                    if (clave == null || ya.contains(clave)) return;
                    ya.add(clave);
                    JSObject o = new JSObject();
                    o.put("nombre", n == null ? "" : n);
                    o.put("mac", clave);
                    o.put("mio", propios.contains(clave));     // si no esta vinculado, es ajeno
                    o.put("rssi", (int) i.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE));
                    vistos.put(o);
                } catch (Throwable ignored) { }
            }
        };
        try {
            IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_FOUND);
            if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(rec, f, Context.RECEIVER_EXPORTED);
            else ctx.registerReceiver(rec, f);
            ad.startDiscovery();
        } catch (Throwable t) {
            call.resolve(armarBt(ad, null, false));
            return;
        }
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try { ad.cancelDiscovery(); } catch (Throwable ignored) { }
            try { ctx.unregisterReceiver(rec); } catch (Throwable ignored) { }
            call.resolve(armarBt(ad, vistos, true));
        }, 8000);
    }

    /**
     * Ejecuta un comando en Termux y devuelve su salida. Requiere: Termux instalado,
     * "allow-external-apps=true" en ~/.termux/termux.properties y el permiso de ASAGI.
     * Solo lo llama la UI por orden escrita del usuario (herramientas.js).
     */
    @PluginMethod
    public void termuxRun(PluginCall call) {
        final String cmd = call.getString("cmd", "");
        if (cmd == null || cmd.trim().isEmpty()) {
            call.reject("comando vacío");
            return;
        }
        final Context ctx = getContext();
        try {
            ctx.getPackageManager().getPackageInfo("com.termux", 0);
        } catch (PackageManager.NameNotFoundException e) {
            JSObject r = new JSObject();
            r.put("error", "Termux no está instalado.");
            call.resolve(r);
            return;
        }
        if (!tiene("com.termux.permission.RUN_COMMAND")) {
            JSObject r = new JSObject();
            r.put("sinPermiso", true);
            r.put("error", "Falta el permiso para ejecutar comandos en Termux. Acéptalo y repite la orden.");
            call.resolve(r);
            return;
        }
        final int id = (int) (System.nanoTime() & 0x7fffffff);
        final int timeout = call.getInt("timeoutMs", 30000);
        final AtomicBoolean listo = new AtomicBoolean(false);

        TermuxResultReceiver.PENDIENTES.put(id, (out, err, code, error) -> {
            if (!listo.compareAndSet(false, true)) return;
            JSObject r = new JSObject();
            r.put("stdout", out == null ? "" : out);
            r.put("stderr", err == null ? "" : err);
            r.put("exitCode", code);
            if (error != null) r.put("error", error);
            call.resolve(r);
        });
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (TermuxResultReceiver.PENDIENTES.remove(id) != null && listo.compareAndSet(false, true)) {
                JSObject r = new JSObject();
                r.put("error", "Termux no respondió a tiempo. ¿Está activado allow-external-apps=true?");
                call.resolve(r);
            }
        }, timeout);

        try {
            Intent res = new Intent(TermuxResultReceiver.ACCION);
            res.setPackage(ctx.getPackageName());
            res.putExtra("asagi_id", id);
            int flags = PendingIntent.FLAG_ONE_SHOT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pi = PendingIntent.getBroadcast(ctx, id, res, flags);
            Intent i = new Intent();
            i.setClassName("com.termux", "com.termux.app.RunCommandService");
            i.setAction("com.termux.RUN_COMMAND");
            i.putExtra("com.termux.RUN_COMMAND_PATH", "/data/data/com.termux/files/usr/bin/bash");
            i.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", new String[]{"-lc", cmd});
            i.putExtra("com.termux.RUN_COMMAND_WORKDIR", "/data/data/com.termux/files/home");
            i.putExtra("com.termux.RUN_COMMAND_BACKGROUND", true);
            i.putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", pi);
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Throwable t) {
            TermuxResultReceiver.PENDIENTES.remove(id);
            if (listo.compareAndSet(false, true)) {
                JSObject r = new JSObject();
                r.put("error", "No pude hablar con Termux (" + t.getClass().getSimpleName()
                        + "). Corre el setup de Termux una vez (ver Ajustes) y reintenta.");
                call.resolve(r);
            }
        }
    }

    // ------------------------------------------------------------------
    // Conectar como lo hacen los audifonos: recordar el aparato y reconectarlo
    // ------------------------------------------------------------------

    private BluetoothDevice buscarVinculado(BluetoothAdapter ad, String nombre, String mac) {
        try {
            String q = nombre == null ? "" : nombre.trim().toLowerCase();
            for (BluetoothDevice d : ad.getBondedDevices()) {
                String n = d.getName() == null ? "" : d.getName().toLowerCase();
                if ((mac != null && !mac.isEmpty() && mac.equalsIgnoreCase(d.getAddress()))
                        || (!q.isEmpty() && (n.equals(q) || n.contains(q) || q.contains(n) && !n.isEmpty()))) {
                    return d;
                }
            }
        } catch (Throwable ignored) { }
        return null;
    }

    /** Intenta conectar los perfiles de audio por la via interna del sistema (no siempre permitida). */
    private void conectarPerfiles(final BluetoothAdapter ad, final BluetoothDevice dev) {
        final int[] perfiles = new int[]{BluetoothProfile.A2DP, BluetoothProfile.HEADSET};
        for (final int perfil : perfiles) {
            try {
                ad.getProfileProxy(getContext(), new BluetoothProfile.ServiceListener() {
                    @Override public void onServiceConnected(int profile, BluetoothProfile proxy) {
                        try {
                            Method m = proxy.getClass().getDeclaredMethod("connect", BluetoothDevice.class);
                            m.setAccessible(true);
                            m.invoke(proxy, dev);
                        } catch (Throwable ignored) { }
                        try { ad.closeProfileProxy(profile, proxy); } catch (Throwable ignored) { }
                    }
                    @Override public void onServiceDisconnected(int profile) { }
                }, perfil);
            } catch (Throwable ignored) { }
        }
    }

    /**
     * Conecta un aparato Bluetooth. SOLO conecta lo que es tuyo:
     *  - vinculado en este celular (lo emparejaste tu) = tuyo -> reconecta;
     *  - no vinculado = ajeno -> nunca se empareja solo (silencioso=true) y, si lo pides
     *    por nombre, solo si hay UN candidato y esta cerca (senal fuerte); si hay varios
     *    parecidos o esta lejos (probablemente de otra persona) se niega y avisa.
     * silencioso=true (reconexion automatica): sin abrir Ajustes ni mostrar nada.
     */
    @PluginMethod
    public void bluetoothConectar(PluginCall call) {
        final String nombre = call.getString("nombre", "");
        final String mac = call.getString("mac", "");
        final boolean silencioso = Boolean.TRUE.equals(call.getBoolean("silencioso", false));
        final Context ctx = getContext();
        BluetoothManager bm = (BluetoothManager) ctx.getSystemService(Context.BLUETOOTH_SERVICE);
        final BluetoothAdapter ad = bm == null ? null : bm.getAdapter();
        final JSObject r = new JSObject();
        if (ad == null) { r.put("estado", "sinBluetooth"); call.resolve(r); return; }
        if (Build.VERSION.SDK_INT >= 31 && !tiene("android.permission.BLUETOOTH_CONNECT")) {
            r.put("estado", "sinPermiso"); r.put("sinPermiso", true); call.resolve(r); return;
        }
        if (!ad.isEnabled()) {
            if (!silencioso) {
                try {
                    Intent i = new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE);
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(i);
                } catch (Throwable ignored) { }
            }
            r.put("estado", "encendiendo"); call.resolve(r); return;
        }
        final BluetoothDevice dev = buscarVinculado(ad, nombre, mac);
        if (dev == null) {
            r.put("estado", "noVinculado");
            // Ajeno: jamas se empareja en modo automatico.
            if (silencioso || (Build.VERSION.SDK_INT >= 31 && !tiene("android.permission.BLUETOOTH_SCAN"))) {
                call.resolve(r);
                return;
            }
            final String q = nombre.trim().toLowerCase();
            final ArrayList<BluetoothDevice> coinc = new ArrayList<>();
            final ArrayList<Integer> senal = new ArrayList<>();
            final BroadcastReceiver rec = new BroadcastReceiver() {
                @Override public void onReceive(Context c, Intent i) {
                    try {
                        BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                        String n = d == null || d.getName() == null ? "" : d.getName().toLowerCase();
                        if (d == null || q.isEmpty() || n.isEmpty() || !(n.contains(q) || q.contains(n))) return;
                        for (BluetoothDevice x : coinc) if (x.getAddress().equals(d.getAddress())) return;
                        coinc.add(d);
                        senal.add((int) i.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE));
                    } catch (Throwable ignored) { }
                }
            };
            try {
                IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_FOUND);
                if (Build.VERSION.SDK_INT >= 33) ctx.registerReceiver(rec, f, Context.RECEIVER_EXPORTED);
                else ctx.registerReceiver(rec, f);
                ad.startDiscovery();
            } catch (Throwable t) { call.resolve(r); return; }
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try { ad.cancelDiscovery(); } catch (Throwable ignored) { }
                try { ctx.unregisterReceiver(rec); } catch (Throwable ignored) { }
                if (coinc.isEmpty()) {
                    r.put("estado", "noEncontrado");
                } else if (coinc.size() > 1) {
                    r.put("estado", "ambiguo");
                    JSArray nombres = new JSArray();
                    for (BluetoothDevice x : coinc) nombres.put(x.getName());
                    r.put("candidatos", nombres);
                } else if (senal.get(0) < -72) {
                    r.put("estado", "muyLejos");      // senal debil: probablemente de otra persona
                    r.put("rssi", senal.get(0));
                    r.put("nombre", coinc.get(0).getName());
                } else {
                    try { coinc.get(0).createBond(); r.put("estado", "emparejando"); }
                    catch (Throwable t) { r.put("estado", "error"); }
                }
                call.resolve(r);
            }, 9000);
            return;
        }
        // Vinculado = tuyo: reconectar.
        conectarPerfiles(ad, dev);
        final String nombreReal = dev.getName() == null ? nombre : dev.getName();
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            boolean conectado = nombreReal != null && !nombreReal.isEmpty() && nombreReal.equals(audioBtActivo());
            if (!conectado && !silencioso) {
                AsagiAccessibilityService svc = AsagiAccessibilityService.getInstance();
                if (svc != null) {
                    try {
                        Intent i = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        ctx.startActivity(i);
                        new Handler(Looper.getMainLooper()).postDelayed(() -> {
                            boolean ok = svc.tapTexto(nombreReal);
                            JSObject o = new JSObject();
                            o.put("estado", ok ? "tocadoEnAjustes" : "noPudeTocar");
                            o.put("nombre", nombreReal);
                            call.resolve(o);
                        }, 1800);
                        return;
                    } catch (Throwable ignored) { }
                }
            }
            JSObject o = new JSObject();
            o.put("estado", conectado ? "conectado" : "intentado");
            o.put("nombre", nombreReal);
            o.put("sinAccesibilidad", AsagiAccessibilityService.getInstance() == null);
            call.resolve(o);
        }, 3500);
    }

    /**
     * Guarda una red WiFi como sugerencia del sistema: Android la recuerda y se
     * conecta sola cada vez que esta en rango, igual que un aparato vinculado.
     * La primera vez el sistema pide aprobar las sugerencias de ASAGI (un toque).
     */
    @PluginMethod
    public void wifiConectar(PluginCall call) {
        final String ssid = call.getString("ssid", "");
        final String clave = call.getString("clave", "");
        JSObject r = new JSObject();
        if (ssid == null || ssid.trim().isEmpty()) { call.reject("falta el nombre de la red"); return; }
        WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm == null) { r.put("estado", "sinWifi"); call.resolve(r); return; }
        if (Build.VERSION.SDK_INT < 29) { r.put("estado", "androidViejo"); call.resolve(r); return; }
        try {
            WifiNetworkSuggestion.Builder b = new WifiNetworkSuggestion.Builder()
                    .setSsid(ssid.trim()).setIsAppInteractionRequired(false);
            if (clave != null && !clave.isEmpty()) b.setWpa2Passphrase(clave);
            WifiNetworkSuggestion sug = b.build();
            wm.removeNetworkSuggestions(Collections.singletonList(sug));
            int st = wm.addNetworkSuggestions(Collections.singletonList(sug));
            String estado;
            switch (st) {
                case WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS: estado = "guardada"; break;
                case WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_APP_DISALLOWED: estado = "faltaAprobar"; break;
                case WifiManager.STATUS_NETWORK_SUGGESTIONS_ERROR_ADD_DUPLICATE: estado = "yaGuardada"; break;
                default: estado = "error" + st;
            }
            r.put("estado", estado);
            r.put("ssid", ssid.trim());
        } catch (Throwable t) {
            r.put("estado", "error");
            r.put("detalle", t.getClass().getSimpleName());
        }
        call.resolve(r);
    }

    /** Toca un texto en la pantalla actual (Accesibilidad). */
    @PluginMethod
    public void tapTexto(PluginCall call) {
        AsagiAccessibilityService s = AsagiAccessibilityService.getInstance();
        JSObject r = new JSObject();
        r.put("ok", s != null && s.tapTexto(call.getString("texto", "")));
        call.resolve(r);
    }

    // ------------------------------------------------------------------ enlace directo con ARIA (WiFi / Bluetooth)
    // La criptografia vive en JS (misma clave del enlace); aqui solo se mueven lineas de texto.

    /** UDP: pregunta por broadcast quien responde. Devuelve la primera linea recibida y su origen. */
    @PluginMethod
    public void lanDescubrir(final PluginCall call) {
        final String linea = call.getString("linea", "");
        final int puerto = call.getInt("puerto", 47831);
        final int espera = call.getInt("espera", 1500);
        new Thread(new Runnable() { public void run() {
            JSObject r = new JSObject();
            java.net.DatagramSocket s = null;
            try {
                s = new java.net.DatagramSocket();
                s.setBroadcast(true); s.setSoTimeout(espera);
                byte[] b = linea.getBytes("UTF-8");
                java.util.LinkedHashSet<String> destinos = new java.util.LinkedHashSet<String>();
                destinos.add("255.255.255.255");
                try {
                    WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    int ip = wm.getDhcpInfo().ipAddress, mask = wm.getDhcpInfo().netmask;
                    int bc = (ip & mask) | ~mask;
                    destinos.add((bc & 0xff) + "." + ((bc >> 8) & 0xff) + "." + ((bc >> 16) & 0xff) + "." + ((bc >> 24) & 0xff));
                } catch (Throwable ignored) { }
                String extra = call.getString("host", "");
                if (extra != null && !extra.isEmpty()) destinos.add(extra);
                for (String d : destinos) {
                    try { s.send(new java.net.DatagramPacket(b, b.length, java.net.InetAddress.getByName(d), puerto)); } catch (Throwable ignored) { }
                }
                byte[] buf = new byte[4096];
                java.net.DatagramPacket pk = new java.net.DatagramPacket(buf, buf.length);
                s.receive(pk);
                r.put("ok", true);
                r.put("linea", new String(pk.getData(), 0, pk.getLength(), "UTF-8"));
                r.put("host", pk.getAddress().getHostAddress());
            } catch (java.net.SocketTimeoutException e) {
                r.put("ok", false); r.put("error", "sinRespuesta");
            } catch (Throwable e) {
                r.put("ok", false); r.put("error", String.valueOf(e.getMessage()));
            } finally { if (s != null) s.close(); }
            call.resolve(r);
        } }).start();
    }

    /** TCP: manda una linea y devuelve la linea de respuesta. */
    @PluginMethod
    public void lanEnviar(final PluginCall call) {
        final String host = call.getString("host", "");
        final int puerto = call.getInt("puerto", 47832);
        final String linea = call.getString("linea", "");
        final int espera = Math.max(2000, Math.min(60000, call.getInt("esperaMs", 8000)));   // los bots que piensan con ARIA esperan mas
        new Thread(new Runnable() { public void run() {
            JSObject r = new JSObject();
            try {
                java.net.Socket so = new java.net.Socket();
                so.connect(new java.net.InetSocketAddress(host, puerto), 4000);
                so.setSoTimeout(espera);
                try { r = lineaPorSocket(so.getInputStream(), so.getOutputStream(), linea); } finally { so.close(); }
            } catch (Throwable e) { r.put("ok", false); r.put("error", String.valueOf(e.getMessage())); }
            call.resolve(r);
        } }).start();
    }

    private JSObject lineaPorSocket(java.io.InputStream in, java.io.OutputStream out, String linea) throws java.io.IOException {
        JSObject r = new JSObject();
        out.write((linea + "\n").getBytes("UTF-8")); out.flush();
        java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
        int c;
        while (bo.size() < 65536 && (c = in.read()) != -1) { if (c == '\n') break; bo.write(c); }
        if (bo.size() == 0) { r.put("ok", false); r.put("error", "sinRespuesta"); return r; }
        r.put("ok", true); r.put("linea", bo.toString("UTF-8"));
        return r;
    }

    /**
     * Bluetooth RFCOMM: SOLO a dispositivos ya vinculados (los tuyos). Prueba cada uno por el canal
     * indicado y se queda con el que contesta una linea valida. Nunca empareja ni toca ajenos.
     */
    @PluginMethod
    public void btEnviar(final PluginCall call) {
        final String linea = call.getString("linea", "");
        final int canal = call.getInt("canal", 4);
        final String mac = call.getString("mac", "");
        new Thread(new Runnable() { public void run() {
            JSObject r = new JSObject();
            r.put("ok", false); r.put("error", "sinBluetooth");
            try {
                BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
                BluetoothAdapter ad = bm == null ? null : bm.getAdapter();
                if (ad == null || !ad.isEnabled()) { call.resolve(r); return; }
                if (Build.VERSION.SDK_INT >= 31 && !tiene("android.permission.BLUETOOTH_CONNECT")) { r.put("error", "sinPermiso"); call.resolve(r); return; }
                try { ad.cancelDiscovery(); } catch (Throwable ignored) { }
                for (BluetoothDevice d : ad.getBondedDevices()) {
                    if (mac != null && !mac.isEmpty() && !mac.equalsIgnoreCase(d.getAddress())) continue;
                    android.bluetooth.BluetoothSocket so = null;
                    try {
                        Method m = d.getClass().getMethod("createRfcommSocket", new Class[] { int.class });
                        so = (android.bluetooth.BluetoothSocket) m.invoke(d, Integer.valueOf(canal));
                        so.connect();
                        JSObject x = lineaPorSocket(so.getInputStream(), so.getOutputStream(), linea);
                        if (x.optBoolean("ok", false)) { x.put("mac", d.getAddress()); call.resolve(x); return; }
                    } catch (Throwable ignored) {
                    } finally { try { if (so != null) so.close(); } catch (Throwable ignored) { } }
                }
            } catch (Throwable e) { r.put("error", String.valueOf(e.getMessage())); }
            call.resolve(r);
        } }).start();
    }

    // ------------------------------------------------------------------ actualizaciones sin desinstalar

    private static String sha256Firma(android.content.pm.PackageInfo pi) {
        try {
            android.content.pm.Signature[] sigs;
            if (Build.VERSION.SDK_INT >= 28 && pi.signingInfo != null) sigs = pi.signingInfo.getApkContentsSigners();
            else sigs = pi.signatures;
            if (sigs == null || sigs.length == 0) return "";
            byte[] d = java.security.MessageDigest.getInstance("SHA-256").digest(sigs[0].toByteArray());
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < d.length; i++) { if (i > 0) sb.append(':'); sb.append(String.format("%02X", d[i])); }
            return sb.toString();
        } catch (Throwable e) { return ""; }
    }

    /** Version instalada + huella de la firma (para saber si un APK nuevo se puede instalar encima). */
    @PluginMethod
    public void versionApp(PluginCall call) {
        JSObject r = new JSObject();
        try {
            android.content.pm.PackageManager pm = getContext().getPackageManager();
            int fl = Build.VERSION.SDK_INT >= 28 ? android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES : android.content.pm.PackageManager.GET_SIGNATURES;
            android.content.pm.PackageInfo pi = pm.getPackageInfo(getContext().getPackageName(), fl);
            long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
            r.put("ok", true); r.put("build", code); r.put("nombre", pi.versionName); r.put("firma", sha256Firma(pi));
            r.put("puedeInstalar", Build.VERSION.SDK_INT < 26 || pm.canRequestPackageInstalls());
        } catch (Throwable e) { r.put("ok", false); r.put("error", String.valueOf(e.getMessage())); }
        call.resolve(r);
    }

    /** Baja el APK (sigue redirecciones de GitHub) y abre el instalador de Android: se instala ENCIMA. */
    @PluginMethod
    public void instalarApk(final PluginCall call) {
        final String url = call.getString("url", "");
        new Thread(new Runnable() { public void run() {
            JSObject r = new JSObject();
            try {
                android.content.pm.PackageManager pm = getContext().getPackageManager();
                if (Build.VERSION.SDK_INT >= 26 && !pm.canRequestPackageInstalls()) {
                    Intent ps = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            android.net.Uri.parse("package:" + getContext().getPackageName()));
                    ps.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(ps);
                    r.put("ok", false); r.put("error", "permisoInstalar"); call.resolve(r); return;
                }
                java.io.File dir = new java.io.File(getContext().getCacheDir(), "upd"); dir.mkdirs();
                java.io.File apk = new java.io.File(dir, "asagi.apk");
                String u = url; java.net.HttpURLConnection c = null;
                for (int i = 0; i < 6; i++) {
                    c = (java.net.HttpURLConnection) new java.net.URL(u).openConnection();
                    c.setInstanceFollowRedirects(false); c.setConnectTimeout(20000); c.setReadTimeout(60000);
                    c.setRequestProperty("User-Agent", "ASAGI-actualizador");
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) { u = new java.net.URL(new java.net.URL(u), c.getHeaderField("Location")).toString(); c.disconnect(); continue; }
                    if (code != 200) throw new java.io.IOException("servidor respondio " + code);
                    break;
                }
                long total = c.getContentLengthLong(), hecho = 0, aviso = 0;
                java.io.InputStream in = c.getInputStream(); java.io.FileOutputStream out = new java.io.FileOutputStream(apk);
                byte[] b = new byte[65536]; int n;
                while ((n = in.read(b)) != -1) {
                    out.write(b, 0, n); hecho += n;
                    if (System.currentTimeMillis() - aviso > 500) { aviso = System.currentTimeMillis(); JSObject ev = new JSObject(); ev.put("hecho", hecho); ev.put("total", total); notifyListeners("actualizacion", ev); }
                }
                out.close(); in.close(); c.disconnect();
                // misma firma? si no, Android rechazaria la instalacion encima
                int fl = Build.VERSION.SDK_INT >= 28 ? android.content.pm.PackageManager.GET_SIGNING_CERTIFICATES : android.content.pm.PackageManager.GET_SIGNATURES;
                android.content.pm.PackageInfo nuevo = pm.getPackageArchiveInfo(apk.getAbsolutePath(), fl);
                android.content.pm.PackageInfo actual = pm.getPackageInfo(getContext().getPackageName(), fl);
                if (nuevo == null) throw new java.io.IOException("el APK llego danado");
                String fN = sha256Firma(nuevo), fA = sha256Firma(actual);
                if (!fN.isEmpty() && !fA.isEmpty() && !fN.equals(fA)) { r.put("ok", false); r.put("error", "firmaDistinta"); call.resolve(r); return; }
                android.net.Uri uri = androidx.core.content.FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent it = new Intent(Intent.ACTION_VIEW);
                it.setDataAndType(uri, "application/vnd.android.package-archive");
                it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(it);
                r.put("ok", true);
            } catch (Throwable e) { r.put("ok", false); r.put("error", String.valueOf(e.getMessage())); }
            call.resolve(r);
        } }).start();
    }

    /** Identidad de este celular (para que ARIA sepa que es EL tuyo). */
    @PluginMethod
    public void infoDispositivo(PluginCall call) {
        JSObject r = new JSObject();
        try {
            android.content.ContentResolver cr = getContext().getContentResolver();
            String nombre = null;
            try { nombre = android.provider.Settings.Global.getString(cr, "device_name"); } catch (Throwable ignored) { }
            if (nombre == null) try { nombre = android.provider.Settings.Secure.getString(cr, "bluetooth_name"); } catch (Throwable ignored) { }
            r.put("ok", true);
            r.put("fabricante", Build.MANUFACTURER);
            r.put("marca", Build.BRAND);
            r.put("modelo", Build.MODEL);
            r.put("producto", Build.PRODUCT);
            r.put("nombre", nombre == null ? "" : nombre);
            r.put("android", Build.VERSION.RELEASE);
            r.put("androidId", android.provider.Settings.Secure.getString(cr, android.provider.Settings.Secure.ANDROID_ID));
        } catch (Throwable e) { r.put("ok", false); r.put("error", String.valueOf(e.getMessage())); }
        call.resolve(r);
    }

    /** Lee la clave de enlace que la PC deja por adb en files/enlace/lan.key (nada que teclear). */
    @PluginMethod
    public void leerClaveLan(final PluginCall call) {
        JSObject r = new JSObject();
        try {
            java.io.File dir = getContext().getExternalFilesDir(null);
            java.io.File f = new java.io.File(dir, "enlace/lan.key");
            if (f.exists() && f.length() > 0 && f.length() < 200) {
                java.io.BufferedReader br = new java.io.BufferedReader(new java.io.InputStreamReader(new java.io.FileInputStream(f), "UTF-8"));
                String l = br.readLine(); br.close();
                r.put("ok", l != null && l.trim().length() > 0);
                r.put("clave", l == null ? "" : l.trim());
            } else r.put("ok", false);
        } catch (Throwable e) { r.put("ok", false); r.put("error", String.valueOf(e.getMessage())); }
        call.resolve(r);
    }

    /** ¿Termux instalado, con permiso y respondiendo? (prueba real con un eco). */
    @PluginMethod
    public void termuxEstado(final PluginCall call) {
        JSObject r = new JSObject();
        try {
            getContext().getPackageManager().getPackageInfo("com.termux", 0);
            r.put("instalado", true);
        } catch (PackageManager.NameNotFoundException e) {
            r.put("instalado", false);
        }
        r.put("permiso", tiene("com.termux.permission.RUN_COMMAND"));
        call.resolve(r);
    }

    /**
     * Prepara Termux sin que escribas nada: copia al portapapeles la linea de
     * instalacion, abre Termux y, si la Accesibilidad esta activa, intenta pegarla.
     * (Termux solo acepta ordenes externas despues de que su ajuste se activa desde dentro.)
     */
    @PluginMethod
    public void termuxPreparar(final PluginCall call) {
        final Context ctx = getContext();
        final String linea = call.getString("linea", "");
        JSObject r = new JSObject();
        try {
            android.content.ClipboardManager cm = (android.content.ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) cm.setPrimaryClip(android.content.ClipData.newPlainText("asagi-termux", linea));
            r.put("copiado", true);
        } catch (Throwable t) { r.put("copiado", false); }
        Intent i = ctx.getPackageManager().getLaunchIntentForPackage("com.termux");
        if (i == null) { r.put("estado", "noInstalado"); call.resolve(r); return; }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { ctx.startActivity(i); } catch (Throwable t) { r.put("estado", "noAbrio"); call.resolve(r); return; }
        final AsagiAccessibilityService svc = AsagiAccessibilityService.getInstance();
        if (svc == null) { r.put("estado", "copiado"); call.resolve(r); return; }
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            boolean pego = svc.pegarEnFoco();
            r.put("estado", pego ? "pegado" : "copiado");
            call.resolve(r);
        }, 2500);
    }

    // ---- Almacenamiento y Wikipedia sin internet (en la SD; la prepara ARIA en la PC) ----
    @PluginMethod
    public void almacen(PluginCall call) {
        Context c = getContext();
        java.io.File sd = Almacen.sd(c), w = Almacen.wikiDb(c);
        JSObject r = new JSObject();
        r.put("sd", sd != null);
        r.put("sdLibreGB", sd != null ? Math.round(sd.getUsableSpace() / 1e8) / 10.0 : 0);
        r.put("internaLibreGB", Math.round(c.getFilesDir().getUsableSpace() / 1e8) / 10.0);
        r.put("wiki", w != null);
        r.put("wikiGB", w != null ? Math.round(w.length() / 1e8) / 10.0 : 0);
        r.put("wikiEnSd", w != null && sd != null && w.getAbsolutePath().startsWith(sd.getAbsolutePath()));
        call.resolve(r);
    }

    @PluginMethod
    public void wikiBuscar(PluginCall call) {
        final String q = call.getString("q", "");
        final int n = Math.max(1, Math.min(5, call.getInt("n", 3)));
        new Thread(() -> {
            JSArray arr = new JSArray();
            for (String[] f : Almacen.buscarWiki(getContext(), q, n)) {
                JSObject o = new JSObject();
                o.put("titulo", f[0]);
                o.put("texto", f[1]);
                arr.put(o);
            }
            JSObject r = new JSObject();
            r.put("resultados", arr);
            call.resolve(r);
        }, "asagi-wiki").start();
    }
}
