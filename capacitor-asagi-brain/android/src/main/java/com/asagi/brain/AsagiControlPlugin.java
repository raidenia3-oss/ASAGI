package com.asagi.brain;

import android.content.Context;
import android.content.Intent;
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
}
