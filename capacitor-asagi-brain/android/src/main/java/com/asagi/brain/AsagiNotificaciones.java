package com.asagi.brain;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Lee las notificaciones que llegan (el usuario lo activa en Ajustes > Acceso a notificaciones).
 * - Las últimas 60 quedan SOLO en memoria (para «¿qué notificaciones tengo?»).
 * - Las de Yape/Plin/bancos que hablan de dinero se guardan en un archivo propio de la app
 *   (finanzas_notif.jsonl, máx. 3000) para llevar tus gastos. Nunca salen del celular.
 * - Los códigos de verificación (OTP) se descartan.
 */
public class AsagiNotificaciones extends NotificationListenerService {
    private static final int MAX = 60;
    private static final Deque<JSONObject> recientes = new ArrayDeque<>();
    private static File archivoFinanzas;
    static final Pattern DINERO = Pattern.compile("(S/|S/\\.|PEN|US\\$|\\$)\\s?\\d", Pattern.CASE_INSENSITIVE);
    static final Pattern FINANZAS_APP = Pattern.compile("(yape|plin|bcp|interbank|bbva|scotiabank|banbif|pichincha|tunki|mercadopago|izipay|banco|bank|nacion|caja|lemon)", Pattern.CASE_INSENSITIVE);
    static final Pattern OTP = Pattern.compile("(c[oó]digo|code|clave|token|otp|contrase[nñ]a)\\D{0,25}\\d{4,8}", Pattern.CASE_INSENSITIVE);

    @Override
    public void onCreate() {
        super.onCreate();
        archivoFinanzas = new File(getFilesDir(), "finanzas_notif.jsonl");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            if (pkg == null || pkg.equals(getPackageName())) return;
            Notification n = sbn.getNotification();
            if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle ex = n.extras;
            String titulo = ex == null ? "" : String.valueOf(ex.getCharSequence(Notification.EXTRA_TITLE, ""));
            CharSequence big = ex == null ? null : ex.getCharSequence(Notification.EXTRA_BIG_TEXT);
            String texto = big != null ? big.toString() : (ex == null ? "" : String.valueOf(ex.getCharSequence(Notification.EXTRA_TEXT, "")));
            if (titulo.isEmpty() && texto.isEmpty()) return;
            boolean otp = OTP.matcher(titulo + " " + texto).find();
            JSONObject o = new JSONObject();
            o.put("app", pkg);
            o.put("titulo", titulo.length() > 120 ? titulo.substring(0, 120) : titulo);
            o.put("texto", otp ? "(código de verificación oculto)" : (texto.length() > 400 ? texto.substring(0, 400) : texto));
            o.put("ts", sbn.getPostTime());
            o.put("clave", sbn.getKey());
            synchronized (recientes) {
                for (java.util.Iterator<JSONObject> it = recientes.iterator(); it.hasNext(); )
                    if (it.next().optString("clave").equals(sbn.getKey())) it.remove();
                recientes.addFirst(o);
                while (recientes.size() > MAX) recientes.removeLast();
            }
            if (!otp && FINANZAS_APP.matcher(pkg + " " + titulo).find() && DINERO.matcher(titulo + " " + texto).find()) guardarFinanza(o);
        } catch (Throwable ignored) {}
    }

    private static synchronized void guardarFinanza(JSONObject o) {
        if (archivoFinanzas == null) return;
        try {
            List<String> lineas = leerLineas(archivoFinanzas);
            String linea = o.toString();
            for (String l : lineas) if (l.contains("\"clave\":" + JSONObject.quote(o.optString("clave"))) && l.contains("\"texto\":" + JSONObject.quote(o.optString("texto")))) return;
            if (lineas.size() >= 3000) {
                lineas = lineas.subList(lineas.size() - 2500, lineas.size());
                try (FileWriter w = new FileWriter(archivoFinanzas, false)) { for (String l : lineas) w.write(l + "\n"); }
            }
            try (FileWriter w = new FileWriter(archivoFinanzas, true)) { w.write(linea + "\n"); }
        } catch (Throwable ignored) {}
    }

    static List<String> leerLineas(File f) {
        List<String> out = new ArrayList<>();
        if (f == null || !f.exists()) return out;
        try (BufferedReader r = new BufferedReader(new FileReader(f))) {
            String l;
            while ((l = r.readLine()) != null) if (!l.trim().isEmpty()) out.add(l);
        } catch (Throwable ignored) {}
        return out;
    }

    static List<JSONObject> recientes() {
        synchronized (recientes) { return new ArrayList<>(recientes); }
    }
}
