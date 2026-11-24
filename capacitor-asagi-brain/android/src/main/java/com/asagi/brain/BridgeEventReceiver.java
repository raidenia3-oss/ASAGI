package com.asagi.brain;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

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
            // El plugin AsagiWorkManager es quien expone addListener('workEvent') en JS.
            AsagiWorkManagerPlugin plugin = AsagiWorkManagerPlugin.INSTANCE;
            if (plugin != null) {
                plugin.emitirWorkEvent(evento, extras);
            }
            // Si el plugin no está vivo (app cerrada), el evento se pierde: el JS lo recupera
            // al abrir, revisando el estado de los workers. No es un error.
        } catch (Throwable e) {
            Log.e(TAG, "Error reenviando evento a JS: " + evento, e);
        }
    }
}
