package com.asagi.brain;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * Oír a Daniel con el reconocimiento de voz que ya trae Android (SpeechRecognizer).
 * La WebView no trae reconocimiento de voz propio, por eso el micrófono de ASAGI lo usa por aquí.
 * Una frase por llamada: escuchar() -> {ok, texto}; mientras habla manda eventos "parcial".
 */
@CapacitorPlugin(name = "AsagiOir", permissions = {
        @Permission(alias = "mic", strings = {Manifest.permission.RECORD_AUDIO})
})
public class AsagiOirPlugin extends Plugin {
    private SpeechRecognizer reco;
    private PluginCall actual;
    private final Handler main = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void disponible(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ok", SpeechRecognizer.isRecognitionAvailable(getContext()));
        r.put("permiso", getPermissionState("mic") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void escuchar(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) { requestPermissionForAlias("mic", call, "trasPermiso"); return; }
        empezar(call);
    }

    @PermissionCallback
    private void trasPermiso(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) { call.reject("sinPermiso"); return; }
        empezar(call);
    }

    @PluginMethod
    public void detener(PluginCall call) {
        main.post(() -> { try { if (reco != null) reco.stopListening(); } catch (Exception e) { } });
        call.resolve();
    }

    private void empezar(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) { call.reject("sinServicio"); return; }
        final String lang = call.getString("lang", "es-PE");
        main.post(() -> {
            try {
                if (actual != null) { try { actual.reject("cancelado"); } catch (Exception e) { } }
                actual = call;
                if (reco != null) { try { reco.destroy(); } catch (Exception e) { } }
                reco = SpeechRecognizer.createSpeechRecognizer(getContext());
                reco.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle b) { notificar("estado", "escuchando"); }
                    @Override public void onBeginningOfSpeech() { }
                    @Override public void onRmsChanged(float v) { }
                    @Override public void onBufferReceived(byte[] b) { }
                    @Override public void onEndOfSpeech() { notificar("estado", "procesando"); }
                    @Override public void onEvent(int t, Bundle b) { }
                    @Override public void onPartialResults(Bundle b) {
                        ArrayList<String> l = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        if (l != null && !l.isEmpty()) notificar("parcial", l.get(0));
                    }
                    @Override public void onResults(Bundle b) {
                        ArrayList<String> l = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                        terminar(l != null && !l.isEmpty() ? l.get(0) : "", null);
                    }
                    @Override public void onError(int err) {
                        // sin voz o nada entendido = silencio (texto vacío); lo demás es error de verdad
                        if (err == SpeechRecognizer.ERROR_NO_MATCH || err == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) terminar("", null);
                        else terminar(null, err == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ? "sinPermiso" : err == SpeechRecognizer.ERROR_NETWORK || err == SpeechRecognizer.ERROR_NETWORK_TIMEOUT ? "sinRed" : "error" + err);
                    }
                });
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                reco.startListening(i);
            } catch (Exception e) { terminar(null, "error: " + e.getMessage()); }
        });
    }

    private void notificar(String tipo, String valor) {
        JSObject o = new JSObject(); o.put("tipo", tipo); o.put("valor", valor);
        notifyListeners("oir", o);
    }

    private void terminar(String texto, String error) {
        PluginCall c = actual; actual = null;
        main.post(() -> { try { if (reco != null) { reco.destroy(); reco = null; } } catch (Exception e) { } });
        if (c == null) return;
        if (error != null) { c.reject(error); return; }
        JSObject r = new JSObject(); r.put("ok", true); r.put("texto", texto == null ? "" : texto);
        c.resolve(r);
    }

    @Override
    protected void handleOnDestroy() {
        main.post(() -> { try { if (reco != null) reco.destroy(); } catch (Exception e) { } });
    }
}
