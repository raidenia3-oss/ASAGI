package com.asagi.brain;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Receiver que re-encola los WorkManager workers tras reinicio del dispositivo
 * o actualización de la app.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "AsagiBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            Log.d(TAG, "Arranque/actualización detectado: re-encolando workers...");
            AsagiWorkManagerPlugin.arrancarTodosSiEstanActivos(context);
        }
    }
}