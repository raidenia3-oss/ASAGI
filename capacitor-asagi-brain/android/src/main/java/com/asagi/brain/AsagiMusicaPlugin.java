package com.asagi.brain;

import android.Manifest;
import android.content.Intent;
import android.database.Cursor;
import android.os.Build;
import android.provider.MediaStore;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Música del celular para ASAGI: lista (MediaStore), cola y controles. La reproducción vive en AsagiMusicaService. */
@CapacitorPlugin(name = "AsagiMusica", permissions = {
        @Permission(alias = "audio", strings = {Manifest.permission.READ_MEDIA_AUDIO}),
        @Permission(alias = "audioViejo", strings = {Manifest.permission.READ_EXTERNAL_STORAGE}),
        @Permission(alias = "notif", strings = {Manifest.permission.POST_NOTIFICATIONS})
})
public class AsagiMusicaPlugin extends Plugin {
    private List<AsagiMusicaService.Pista> biblioteca;          // en caché: se lee una vez (poca RAM: solo texto)

    @Override
    public void load() {
        AsagiMusicaService.escucha = () -> notifyListeners("musica", estadoObj(), true);
    }

    private String alias() { return Build.VERSION.SDK_INT >= 33 ? "audio" : "audioViejo"; }

    @PluginMethod
    public void permiso(PluginCall call) {
        JSObject r = new JSObject(); r.put("ok", getPermissionState(alias()) == PermissionState.GRANTED); call.resolve(r);
    }

    @PluginMethod
    public void pedirPermiso(PluginCall call) {
        if (getPermissionState(alias()) == PermissionState.GRANTED) { permiso(call); return; }
        requestPermissionForAlias(alias(), call, "trasPermiso");
    }

    @PermissionCallback
    private void trasPermiso(PluginCall call) {
        biblioteca = null;
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notif") != PermissionState.GRANTED) {
            requestPermissionForAlias("notif", call, "trasNotif");     // para ver los controles en la notificación
            return;
        }
        permiso(call);
    }

    @PermissionCallback
    private void trasNotif(PluginCall call) { permiso(call); }

    private List<AsagiMusicaService.Pista> leer() {
        if (biblioteca != null) return biblioteca;
        List<AsagiMusicaService.Pista> l = new ArrayList<>();
        String[] col = {MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.DURATION};
        try (Cursor c = getContext().getContentResolver().query(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, col,
                MediaStore.Audio.Media.IS_MUSIC + " != 0 AND " + MediaStore.Audio.Media.DURATION + " >= 30000", null,
                MediaStore.Audio.Media.TITLE + " COLLATE NOCASE")) {
            while (c != null && c.moveToNext()) {
                String art = c.getString(2);
                l.add(new AsagiMusicaService.Pista(c.getLong(0), c.getString(1), art == null || art.equals("<unknown>") ? "Desconocido" : art,
                        c.getString(3), c.getLong(4)));
            }
        } catch (Throwable ignored) {}
        biblioteca = l;
        return l;
    }

    private static JSObject pista(AsagiMusicaService.Pista p) {
        JSObject o = new JSObject();
        o.put("id", p.id); o.put("titulo", p.titulo); o.put("artista", p.artista); o.put("album", p.album); o.put("dur", p.dur);
        return o;
    }

    @PluginMethod
    public void lista(PluginCall call) {
        if (getPermissionState(alias()) != PermissionState.GRANTED) { call.reject("sinPermiso"); return; }
        if (call.getBoolean("recargar", false)) biblioteca = null;
        final PluginCall c = call;
        new Thread(() -> {
            JSArray arr = new JSArray();
            for (AsagiMusicaService.Pista p : leer()) arr.put(pista(p));
            JSObject r = new JSObject(); r.put("pistas", arr); c.resolve(r);
        }, "asagi-musica-lista").start();
    }

    /** ids: orden de la cola; indice: dónde empezar; aleatorio: mezcla. */
    @PluginMethod
    public void reproducir(PluginCall call) {
        if (getPermissionState(alias()) != PermissionState.GRANTED) { call.reject("sinPermiso"); return; }
        Map<Long, AsagiMusicaService.Pista> por = new HashMap<>();
        for (AsagiMusicaService.Pista p : leer()) por.put(p.id, p);
        List<AsagiMusicaService.Pista> cola = new ArrayList<>();
        try {
            JSONArray ids = call.getArray("ids");
            for (int i = 0; ids != null && i < ids.length(); i++) { AsagiMusicaService.Pista p = por.get(ids.getLong(i)); if (p != null) cola.add(p); }
        } catch (Throwable ignored) {}
        if (cola.isEmpty()) { call.reject("vacia"); return; }
        AsagiMusicaService.aleatorio = call.getBoolean("aleatorio", false);
        int ini = Math.max(0, Math.min(cola.size() - 1, call.getInt("indice", 0)));
        if (AsagiMusicaService.aleatorio) {
            AsagiMusicaService.Pista primera = cola.remove(ini);
            AsagiMusicaService.barajar(cola);
            cola.add(0, primera);
            ini = 0;
        }
        synchronized (AsagiMusicaService.cola) {
            AsagiMusicaService.cola.clear();
            AsagiMusicaService.cola.addAll(cola);
            AsagiMusicaService.indice = ini;
        }
        Intent i = new Intent(getContext(), AsagiMusicaService.class);
        if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i); else getContext().startService(i);
        call.resolve(estadoObj());
    }

    private void accion(PluginCall call, String a) {
        if (AsagiMusicaService.yo == null) { call.resolve(estadoObj()); return; }
        Intent i = new Intent(getContext(), AsagiMusicaService.class).setAction(a);
        getContext().startService(i);
        call.resolve(estadoObj());
    }

    @PluginMethod public void alternar(PluginCall call) { accion(call, AsagiMusicaService.A_TOGGLE); }
    @PluginMethod public void siguiente(PluginCall call) { accion(call, AsagiMusicaService.A_SIG); }
    @PluginMethod public void anterior(PluginCall call) { accion(call, AsagiMusicaService.A_ANT); }
    @PluginMethod public void parar(PluginCall call) { accion(call, AsagiMusicaService.A_PARAR); }

    @PluginMethod
    public void pausar(PluginCall call) {
        AsagiMusicaService s = AsagiMusicaService.yo;
        if (s != null && s.sonando()) { accion(call, AsagiMusicaService.A_TOGGLE); return; }
        call.resolve(estadoObj());
    }

    @PluginMethod
    public void seguir(PluginCall call) {
        AsagiMusicaService s = AsagiMusicaService.yo;
        if (s != null && !s.sonando()) { accion(call, AsagiMusicaService.A_TOGGLE); return; }
        call.resolve(estadoObj());
    }

    @PluginMethod
    public void modo(PluginCall call) {
        if (call.hasOption("aleatorio")) AsagiMusicaService.aleatorio = call.getBoolean("aleatorio", false);
        if (call.hasOption("repetir")) AsagiMusicaService.repetir = call.getBoolean("repetir", false);
        call.resolve(estadoObj());
    }

    @PluginMethod public void estado(PluginCall call) { call.resolve(estadoObj()); }

    /** Temporizador para dormir: pausa la música en «min» minutos (0 = cancelar). */
    @PluginMethod
    public void dormir(PluginCall call) {
        AsagiMusicaService s = AsagiMusicaService.yo;
        if (s == null) { call.reject("noSuena"); return; }
        final int min = Math.max(0, Math.min(600, call.getInt("min", 0)));
        new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> { s.programarDormir(min); call.resolve(estadoObj()); });
    }

    private JSObject estadoObj() {
        JSObject r = new JSObject();
        AsagiMusicaService s = AsagiMusicaService.yo;
        AsagiMusicaService.Pista p = s == null ? null : s.actual();
        r.put("activo", s != null);
        r.put("sonando", s != null && s.sonando());
        r.put("pos", s == null ? 0 : s.posicion());
        r.put("aleatorio", AsagiMusicaService.aleatorio);
        r.put("repetir", AsagiMusicaService.repetir);
        r.put("enCola", AsagiMusicaService.cola.size());
        r.put("dormirA", AsagiMusicaService.dormirA);
        if (p != null) r.put("pista", pista(p));
        return r;
    }
}
