package com.asagi.brain;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/**
 * Plugin "AsagiWorkManager": gestiona workers periódicos en background
 * usando WorkManager (reemplaza setInterval/alarms que fallan con app cerrada).
 * Workers:
 *  - VigilanteWorker: revisa páginas vigiladas cada 3h
 *  - YouTubeWorker: busca videos nuevos de canales seguidos cada 6h
 *  - MusaWorker: tareas de música en background (cache, sync)
 */
@CapacitorPlugin(name = "AsagiWorkManager")
public class AsagiWorkManagerPlugin extends Plugin {

    private static final String TAG = "AsagiWorkManager";
    private static final String PREFS = "asagi_work_prefs";
    private static final String KEY_VIGILA_ACTIVE = "vigila_active";
    private static final String KEY_YT_ACTIVE = "yt_active";
    private static final String KEY_MUSA_ACTIVE = "musa_active";

    // Instancia viva para que los workers (vía BridgeEventReceiver) puedan emitir eventos a JS.
    static volatile AsagiWorkManagerPlugin INSTANCE;

    @Override
    public void load() {
        INSTANCE = this;
    }

    /** Emite 'workEvent' hacia el JS (notifyListeners es protegido: solo se puede desde aquí dentro). */
    public void emitirWorkEvent(String evento, Bundle extras) {
        JSObject data = new JSObject();
        data.put("evento", evento);
        if (extras != null) {
            for (String key : extras.keySet()) {
                Object val = extras.get(key);
                if (val != null) data.put(key, String.valueOf(val));
            }
        }
        notifyListeners("workEvent", data);
    }

    @PluginMethod
    public void startVigilante(PluginCall call) {
        boolean enable = call.getBoolean("enable", true);
        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_VIGILA_ACTIVE, enable).apply();

        if (enable) {
            encolarVigilante(ctx);
            call.resolve(new JSObject().put("ok", true).put("estado", "iniciado"));
        } else {
            WorkManager.getInstance(ctx).cancelUniqueWork("VigilanteWorker");
            call.resolve(new JSObject().put("ok", true).put("estado", "detenido"));
        }
    }

    @PluginMethod
    public void startYouTube(PluginCall call) {
        boolean enable = call.getBoolean("enable", true);
        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_YT_ACTIVE, enable).apply();

        if (enable) {
            encolarYouTube(ctx);
            call.resolve(new JSObject().put("ok", true).put("estado", "iniciado"));
        } else {
            WorkManager.getInstance(ctx).cancelUniqueWork("YouTubeWorker");
            call.resolve(new JSObject().put("ok", true).put("estado", "detenido"));
        }
    }

    @PluginMethod
    public void startMusa(PluginCall call) {
        boolean enable = call.getBoolean("enable", true);
        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_MUSA_ACTIVE, enable).apply();

        if (enable) {
            encolarMusa(ctx);
            call.resolve(new JSObject().put("ok", true).put("estado", "iniciado"));
        } else {
            WorkManager.getInstance(ctx).cancelUniqueWork("MusaWorker");
            call.resolve(new JSObject().put("ok", true).put("estado", "detenido"));
        }
    }

    @PluginMethod
    public void estado(PluginCall call) {
        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject r = new JSObject();
        r.put("vigilante", prefs.getBoolean(KEY_VIGILA_ACTIVE, false));
        r.put("youtube", prefs.getBoolean(KEY_YT_ACTIVE, false));
        r.put("musa", prefs.getBoolean(KEY_MUSA_ACTIVE, false));
        call.resolve(r);
    }

    @PluginMethod
    public void ejecutarAhora(PluginCall call) {
        String cual = call.getString("worker", "");
        Context ctx = getContext();
        switch (cual) {
            case "vigilante":
                encolarVigilanteAhora(ctx);
                call.resolve(new JSObject().put("ok", true).put("ejecutado", "vigilante"));
                break;
            case "youtube":
                encolarYouTubeAhora(ctx);
                call.resolve(new JSObject().put("ok", true).put("ejecutado", "youtube"));
                break;
            case "musa":
                encolarMusaAhora(ctx);
                call.resolve(new JSObject().put("ok", true).put("ejecutado", "musa"));
                break;
            default:
                call.reject("worker desconocido: " + cual + " (vigilante|youtube|musa)");
        }
    }

    // ---------- Workers ----------

    /** Worker: Vigilante - revisa páginas cada 3h (requiere red) */
    public static class VigilanteWorker extends Worker {
        public VigilanteWorker(Context ctx, WorkerParameters params) { super(ctx, params); }

        @Override
        public Result doWork() {
            try {
                SharedPreferences prefs = getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                if (!prefs.getBoolean(KEY_VIGILA_ACTIVE, false)) {
                    return Result.success(); // desactivado
                }
                // La lógica real se hace en JS via callback; aquí solo despertamos
                // y notificamos al plugin JS si hay trabajo pendiente
                Log.d(TAG, "VigilanteWorker: despertado, revisando páginas...");

                // Disparar evento al plugin JS (si la app está viva) o guardar flag para próxima apertura
                BridgeEventReceiver.dispararEvento(getApplicationContext(), "vigilante_tick", null);

                return Result.success();
            } catch (Throwable e) {
                Log.e(TAG, "VigilanteWorker error", e);
                return Result.retry();
            }
        }
    }

    /** Worker: YouTube - busca videos nuevos cada 6h (requiere red) */
    public static class YouTubeWorker extends Worker {
        public YouTubeWorker(Context ctx, WorkerParameters params) { super(ctx, params); }

        @Override
        public Result doWork() {
            try {
                SharedPreferences prefs = getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                if (!prefs.getBoolean(KEY_YT_ACTIVE, false)) {
                    return Result.success();
                }
                Log.d(TAG, "YouTubeWorker: despertado, buscando videos nuevos...");
                BridgeEventReceiver.dispararEvento(getApplicationContext(), "youtube_tick", null);
                return Result.success();
            } catch (Throwable e) {
                Log.e(TAG, "YouTubeWorker error", e);
                return Result.retry();
            }
        }
    }

    /** Worker: Musa - tareas música background (cache, sync) cada 12h */
    public static class MusaWorker extends Worker {
        public MusaWorker(Context ctx, WorkerParameters params) { super(ctx, params); }

        @Override
        public Result doWork() {
            try {
                SharedPreferences prefs = getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                if (!prefs.getBoolean(KEY_MUSA_ACTIVE, false)) {
                    return Result.success();
                }
                Log.d(TAG, "MusaWorker: despertado, tareas de música...");
                BridgeEventReceiver.dispararEvento(getApplicationContext(), "musa_tick", null);
                return Result.success();
            } catch (Throwable e) {
                Log.e(TAG, "MusaWorker error", e);
                return Result.retry();
            }
        }
    }

    // ---------- Helpers de encolado ----------

    private void encolarVigilante(Context ctx) {
        Constraints c = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true)
                .build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(VigilanteWorker.class, 3, TimeUnit.HOURS)
                .setConstraints(c)
                .build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("VigilanteWorker", ExistingPeriodicWorkPolicy.KEEP, req);
    }

    private void encolarYouTube(Context ctx) {
        Constraints c = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true)
                .build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(YouTubeWorker.class, 6, TimeUnit.HOURS)
                .setConstraints(c)
                .build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("YouTubeWorker", ExistingPeriodicWorkPolicy.KEEP, req);
    }

    private void encolarMusa(Context ctx) {
        Constraints c = new Constraints.Builder()
                .setRequiresBatteryNotLow(true)
                .build();
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(MusaWorker.class, 12, TimeUnit.HOURS)
                .setConstraints(c)
                .build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("MusaWorker", ExistingPeriodicWorkPolicy.KEEP, req);
    }

    private void encolarVigilanteAhora(Context ctx) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(VigilanteWorker.class).build();
        WorkManager.getInstance(ctx).enqueue(req);
    }

    private void encolarYouTubeAhora(Context ctx) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(YouTubeWorker.class).build();
        WorkManager.getInstance(ctx).enqueue(req);
    }

    private void encolarMusaAhora(Context ctx) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(MusaWorker.class).build();
        WorkManager.getInstance(ctx).enqueue(req);
    }

    // ---------- Auto-arranque al instalar/actualizar ----------
    public static void arrancarTodosSiEstanActivos(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getBoolean(KEY_VIGILA_ACTIVE, false)) {
            new AsagiWorkManagerPlugin().encolarVigilante(ctx);
        }
        if (prefs.getBoolean(KEY_YT_ACTIVE, false)) {
            new AsagiWorkManagerPlugin().encolarYouTube(ctx);
        }
        if (prefs.getBoolean(KEY_MUSA_ACTIVE, false)) {
            new AsagiWorkManagerPlugin().encolarMusa(ctx);
        }
    }
}