package com.asagi.brain;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginManager;

public class BridgeEventReceiver extends BroadcastReceiver {

    private static final String TAG = "BridgeEventReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !"asagi.brain.event".equals(intent.getAction())) {
            return;
        }
        String evento = intent.getStringExtra("evento");
        Bundle extras = intent.getExtras();
        if (evento != null) {
            reenviarAJS(context, evento, extras);
        }
    }

    /** Dispara un evento desde Java (p.ej. WorkManager) hacia el plugin JS. */
    public static void dispararEvento(Context context, String evento, Bundle extras) {
        Intent i = new Intent("asagi.brain.event");
        i.putExtra("evento", evento);
        if (extras != null) i.putExtras(extras);
        context.sendBroadcast(i);
    }

    private void reenviarAJS(Context context, String evento, Bundle extras) {
        try {
            PluginManager pm = PluginManager.getInstance();
            if (pm == null) return;
            // Buscar el plugin AsagiControl que es quien expone addListener
            Plugin plugin = pm.getPlugin("AsagiControl");
            if (plugin != null) {
                JSObject data = new JSObject();
                data.put("evento", evento);
                if (extras != null) {
                    for (String key : extras.keySet()) {
                        Object val = extras.get(key);
                        if (val != null) data.put(key, val);
                    }
                }
                plugin.notifyListeners("workEvent", data);
            }
        } catch (Throwable e) {
            Log.e(TAG, "Error reenviando evento a JS: " + evento, e);
        }
    }
}
