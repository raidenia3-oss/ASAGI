package com.asagi.brain;

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;

/**
 * Navegador propio de ASAGI: un WebView OCULTO (invisible, detrás de la app) que ella usa para leer
 * páginas y actuar en ellas (clic, escribir). La lógica (qué leer, qué tocar) vive en JS
 * (navegador-lector.js); aquí solo: abrir URL, esperar a que cargue, ejecutar JS, volver, cerrar.
 * Seguridad: sin addJavascriptInterface (la página no puede llamar a la app), sin acceso a archivos,
 * y solo navega http/https (bloquea intent://, file://, etc.).
 */
@CapacitorPlugin(name = "AsagiNavegador")
public class AsagiNavegadorPlugin extends Plugin {
    private WebView web;
    private PluginCall esperandoCarga;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Runnable timeoutCarga;
    private volatile boolean navegando = false;

    // Escudo: rastreadores y publicidad conocidos que el navegador de ASAGI no carga (privacidad y menos datos).
    private static final Set<String> BLOQUEO = new HashSet<>(java.util.Arrays.asList(
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "google-analytics.com", "googletagmanager.com",
        "googletagservices.com", "adservice.google.com", "connect.facebook.net", "pixel.facebook.com", "analytics.tiktok.com",
        "ads-twitter.com", "static.ads-twitter.com", "analytics.twitter.com", "scorecardresearch.com", "quantserve.com",
        "taboola.com", "outbrain.com", "criteo.com", "criteo.net", "adnxs.com", "rubiconproject.com", "pubmatic.com",
        "amazon-adsystem.com", "hotjar.com", "mouseflow.com", "clarity.ms", "mixpanel.com", "segment.io", "segment.com",
        "branch.io", "appsflyer.com", "adjust.com", "moatads.com", "yieldmo.com", "zedo.com", "popads.net", "propellerads.com",
        "openx.net", "smartadserver.com", "teads.tv", "adform.net", "media.net", "casalemedia.com", "sharethrough.com", "bidswitch.net",
        "exoclick.com", "adsterra.com", "popcash.net", "onclickads.net", "trafficjunky.net", "juicyads.com", "hilltopads.net", "admaven.com"));
    private volatile int bloqueados = 0;
    private static boolean bloqueado(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        while (h.contains(".")) { if (BLOQUEO.contains(h)) return true; h = h.substring(h.indexOf('.') + 1); }
        return false;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void asegurarWeb() {
        if (web != null) return;
        web = new WebView(getContext());
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setLoadsImagesAutomatically(false);           // más rápido y menos datos: ella lee texto
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);   // sin pop-ups
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setGeolocationEnabled(false);
        s.setSaveFormData(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                String esq = r.getUrl().getScheme();
                return !("http".equals(esq) || "https".equals(esq));   // true = bloquear
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                if (bloqueado(r.getUrl().getHost())) {
                    bloqueados++;
                    return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
                }
                return null;
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap f) { navegando = true; }

            @Override
            public void onPageFinished(WebView v, String url) {
                navegando = false;
                // dar un respiro a las páginas que pintan con JS
                main.postDelayed(() -> terminarCarga(true, url), 1200);
            }
        });
        web.setVisibility(View.INVISIBLE);              // se mide y ejecuta JS, pero no se dibuja ni recibe toques
        web.setFocusable(false);
        View app = getBridge().getWebView();
        ViewGroup padre = (ViewGroup) app.getParent();
        padre.addView(web, 0, new ViewGroup.LayoutParams(app.getWidth() > 0 ? app.getWidth() : 1080,
                app.getHeight() > 0 ? app.getHeight() : 2000));
    }

    private void terminarCarga(boolean ok, String url) {
        if (esperandoCarga == null) return;
        if (timeoutCarga != null) main.removeCallbacks(timeoutCarga);
        JSObject r = new JSObject();
        r.put("ok", ok);
        r.put("url", url == null ? "" : url);
        r.put("titulo", web != null && web.getTitle() != null ? web.getTitle() : "");
        PluginCall c = esperandoCarga;
        esperandoCarga = null;
        c.resolve(r);
    }

    private void esperar(PluginCall call) {
        if (esperandoCarga != null) terminarCarga(false, web.getUrl());
        esperandoCarga = call;
        timeoutCarga = () -> terminarCarga(true, web != null ? web.getUrl() : "");   // carga lenta: igual leemos lo que haya
        main.postDelayed(timeoutCarga, 25000);
    }

    @PluginMethod
    public void abrir(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) { call.reject("url invalida"); return; }
        call.setKeepAlive(false);
        main.post(() -> {
            try {
                asegurarWeb();
                esperar(call);
                web.loadUrl(url);
            } catch (Throwable e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }

    /**
     * Trae una página/feed por HTTPS (solo GET, sin cookies, máx. 3 MB, 15 s) y devuelve el texto.
     * Para feeds de YouTube y datos públicos que el navegador de la app no puede leer por CORS.
     */
    @PluginMethod
    public void traer(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !url.startsWith("https://")) { call.reject("solo https"); return; }
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                URL u = new URL(url);
                if (bloqueado(u.getHost())) { call.reject("bloqueado por el escudo"); return; }
                c = (HttpURLConnection) u.openConnection();
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(15000); c.setReadTimeout(15000);
                c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36");
                c.setRequestProperty("Accept-Language", "es-PE,es;q=0.9");
                int code = c.getResponseCode();
                InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                if (in != null) {
                    byte[] b = new byte[16384]; int n, total = 0;
                    while ((n = in.read(b)) > 0 && total < 3_000_000) { out.write(b, 0, n); total += n; }
                    in.close();
                }
                JSObject r = new JSObject();
                r.put("ok", code < 400); r.put("estado", code);
                r.put("url", c.getURL().toString());
                r.put("texto", out.toString("UTF-8"));
                call.resolve(r);
            } catch (Throwable e) {
                call.reject(String.valueOf(e.getMessage()));
            } finally { if (c != null) c.disconnect(); }
        }).start();
    }

    /** Cuántos rastreadores/anuncios bloqueó el escudo desde que se abrió el navegador. */
    @PluginMethod
    public void escudo(PluginCall call) {
        JSObject r = new JSObject(); r.put("bloqueados", bloqueados); call.resolve(r);
    }

    /** Ejecuta JS en la página y devuelve el resultado (JSON) como texto en «r». */
    @PluginMethod
    public void ejecutar(PluginCall call) {
        String codigo = call.getString("codigo", "");
        main.post(() -> {
            if (web == null) { call.reject("no hay página abierta"); return; }
            web.evaluateJavascript(codigo, (res) -> {
                JSObject r = new JSObject();
                r.put("r", res);
                call.resolve(r);
            });
        });
    }

    /** Tras un clic que navega: esperar a que cargue la página nueva (o 6 s si no navegó). */
    @PluginMethod
    public void esperarCarga(PluginCall call) {
        main.post(() -> {
            if (web == null) { call.reject("no hay página abierta"); return; }
            esperar(call);
            main.postDelayed(() -> { if (esperandoCarga == call && !navegando && web != null) terminarCarga(true, web.getUrl()); }, 6000);
        });
    }

    @PluginMethod
    public void volver(PluginCall call) {
        main.post(() -> {
            if (web == null || !web.canGoBack()) { JSObject r = new JSObject(); r.put("ok", false); call.resolve(r); return; }
            esperar(call);
            web.goBack();
        });
    }

    @PluginMethod
    public void cerrar(PluginCall call) {
        main.post(() -> {
            if (web != null) {
                ViewGroup p = (ViewGroup) web.getParent();
                if (p != null) p.removeView(web);
                web.destroy();
                web = null;
            }
            JSObject r = new JSObject(); r.put("ok", true); call.resolve(r);
        });
    }
}
