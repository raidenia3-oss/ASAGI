package com.asagi.brain;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Voz de ASAGI con el lector de Android (TextToSpeech). La WebView no trae síntesis de voz propia.
 * hablar({texto}) se resuelve cuando termina de hablar (para el modo conversación). callar() corta.
 */
@CapacitorPlugin(name = "AsagiHablar")
public class AsagiHablarPlugin extends Plugin {
    private TextToSpeech tts;
    private boolean listo = false;
    private final Map<String, PluginCall> pendientes = new HashMap<>();
    private int n = 0;

    // Se arranca recién la primera vez que ASAGI habla (RAM mínima al abrir la app).
    private PluginCall enEspera;
    private void asegurar() {
        if (tts != null) return;
        tts = new TextToSpeech(getContext(), estado -> {
            if (estado != TextToSpeech.SUCCESS) {      // sin motor de voz: soltar para reintentar la próxima vez
                try { if (tts != null) tts.shutdown(); } catch (Exception e) { }
                tts = null;
                PluginCall c = enEspera; enEspera = null; if (c != null) { JSObject r = new JSObject(); r.put("ok", false); c.resolve(r); } return;
            }
            int r = tts.setLanguage(new Locale("es", "PE"));
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(new Locale("es", "ES"));
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { cerrar(id, true); }
                @Override public void onError(String id) { cerrar(id, false); }
                @Override public void onStop(String id, boolean interrumpido) { cerrar(id, false); }
            });
            listo = true;
            PluginCall c = enEspera; enEspera = null;
            if (c != null) hablar(c);
        });
    }

    private void cerrar(String id, boolean ok) {
        PluginCall c;
        synchronized (pendientes) { c = pendientes.remove(id); }
        if (c != null) { JSObject r = new JSObject(); r.put("ok", ok); c.resolve(r); }
    }

    @PluginMethod
    public void disponible(PluginCall call) {
        JSObject r = new JSObject(); r.put("ok", true); r.put("iniciado", listo); call.resolve(r);
    }

    @PluginMethod
    public void hablar(PluginCall call) {
        String texto = call.getString("texto", "");
        if (texto == null || texto.trim().isEmpty()) { JSObject r = new JSObject(); r.put("ok", false); call.resolve(r); return; }
        if (!listo) {                      // primera vez: arrancar el lector y hablar apenas esté listo
            if (enEspera != null) { JSObject r = new JSObject(); r.put("ok", false); enEspera.resolve(r); }
            enEspera = call; asegurar(); return;
        }
        Float vel = call.getFloat("velocidad", 1.0f);
        tts.setSpeechRate(vel == null ? 1.0f : vel);
        String id = "asagi" + (++n);
        synchronized (pendientes) { pendientes.put(id, call); }
        Bundle p = new Bundle();
        // QUEUE_FLUSH: lo nuevo reemplaza lo que estaba diciendo (como speechSynthesis.cancel + speak)
        tts.speak(texto.length() > 3900 ? texto.substring(0, 3900) : texto, TextToSpeech.QUEUE_FLUSH, p, id);
    }

    @PluginMethod
    public void callar(PluginCall call) {
        if (tts != null) tts.stop();
        synchronized (pendientes) { for (PluginCall c : pendientes.values()) { JSObject r = new JSObject(); r.put("ok", false); c.resolve(r); } pendientes.clear(); }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() { if (tts != null) { tts.shutdown(); tts = null; } }
}
