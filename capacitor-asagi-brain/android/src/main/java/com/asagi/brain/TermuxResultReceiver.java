package com.asagi.brain;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import java.util.concurrent.ConcurrentHashMap;

/** Recibe la salida que Termux devuelve por el PendingIntent de RUN_COMMAND. */
public class TermuxResultReceiver extends BroadcastReceiver {

    public interface Callback { void alTerminar(String stdout, String stderr, int codigo, String error); }

    static final ConcurrentHashMap<Integer, Callback> PENDIENTES = new ConcurrentHashMap<>();
    public static final String ACCION = "asagi.brain.termux.resultado";

    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra("asagi_id", -1);
        Callback cb = PENDIENTES.remove(id);
        if (cb == null) return;
        Bundle r = intent.getBundleExtra("result");
        if (r == null) { cb.alTerminar("", "", -1, "Termux no devolvió resultado."); return; }
        String out = r.getString("stdout", "");
        String err = r.getString("stderr", "");
        int code = r.getInt("exitCode", -1);
        int errCode = r.getInt("err", -1);
        String errMsg = r.getString("errmsg", "");
        String error = (errCode > 0 && errMsg != null && !errMsg.isEmpty()) ? errMsg : null;
        cb.alTerminar(out, err, code, error);
    }
}
