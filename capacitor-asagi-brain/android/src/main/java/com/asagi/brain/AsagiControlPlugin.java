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
        if (!falta.isEmpty() && getActivity() != null) {
            final String[] arr = falta.toArray(new String[0]);
            getActivity().runOnUiThread(() -> getActivity().requestPermissions(arr, 7301));
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
}
