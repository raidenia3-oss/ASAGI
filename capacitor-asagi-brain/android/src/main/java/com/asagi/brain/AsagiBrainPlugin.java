package com.asagi.brain;

import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginResult;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigInteger;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.nio.channels.Channels;
import java.nio.channels.ReadableByteChannel;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = AsagiBrainPlugin.PLUGIN_NAME)
public class AsagiBrainPlugin extends Plugin {

    public static final String PLUGIN_NAME = "AsagiBrain";

    // La biblioteca nativa (llama.cpp + motor) viaja en el APK, solo arm64-v8a.
    static {
        System.loadLibrary("asagi_brain");
    }

    private static final String TAG = "AsagiBrain";
    private static final String MODEL_FILENAME = "Qwen2.5-0.5B-Instruct-abliterated.Q4_K_M.gguf";
    // Revisión fijada del repo (no "main"): el archivo y su hash no cambian
    // aunque el autor actualice la rama. 50968a4 = revisión verificada.
    private static final String MODEL_REVISION = "main";
    private static final String MODEL_HTTP_URL =
            "https://huggingface.co/mradermacher/Qwen2.5-0.5B-Instruct-abliterated-GGUF/resolve/" + MODEL_REVISION
                    + "/Qwen2.5-0.5B-Instruct-abliterated.Q4_K_M.gguf";
    private static final long MODEL_EXPECTED_BYTES = 396705472L;
    private static final String MODEL_EXPECTED_SHA256 = "ac2d97712095a558e31573f62f466a3f9d93990898b0ec79d7c974c1780d524a";
    private static final int DOWNLOAD_BUFFER_BYTES = 8192;
    private static final long DOWNLOAD_FALLBACK_BYTES = 400 * 1024 * 1024;

    private static final String KEY_STATUS = "status";
    private static final String KEY_MODEL_PATH = "modelPath";
    private static final String KEY_MODEL_SIZE = "modelSize";
    private static final String KEY_MODEL_HASH = "modelHash";
    private static final String KEY_MODEL_DESIRED_HASH = "modelDesiredHash";
    private static final String KEY_LOADED = "loaded";
    private static final String KEY_ERROR = "error";
    private static final String KEY_DOWNLOADING = "downloading";
    private static final String KEY_PROGRESS = "progress";
    private static final String KEY_TOTAL = "total";
    private static final String STATUS_READY = "ready";
    private static final String STATUS_DOWNLOADING = "downloading";
    private static final String STATUS_UNAVAILABLE = "unavailable";

    private static native String nativeLoadModel(String path);
    private static native void nativeUnload();
    private static native boolean nativeIsLoaded();
    private static native String nativeGenerateResult(String[] roles, String[] contents, int maxTokens);
    private static native String nativeGenerateStream(String[] roles, String[] contents, int maxTokens);

    private Context appContext;
    private volatile File modelDirectory;
    private volatile File modelFile;
    private DownloadState downloadState;
    private AtomicBoolean loaded = new AtomicBoolean(false);
    private Handler uiHandler = new Handler(Looper.getMainLooper());
    private ExecutorService executor = Executors.newSingleThreadExecutor();
    private OnTokenListener onTokenListener;
    private OnDoneListener onDoneListener;
    private OnErrorListener onErrorListener;
    private static final String CHANNEL_ID = "asagi-brain-download";
    private static final int NOTIFICATION_ID_DOWNLOAD = 7201;
    private static final String KEY_TEXT = "text";

    // Enlaces por cable USB (adb-carpeta): buzones en almacenamiento privado de la app.
    private static final String ENLACE_DIR = "/sdcard/Android/data/com.asagi.app/files/enlace";
    private static final String ENLACE_INBOX = ENLACE_DIR + "/inbox.json";
    private static final String ENLACE_OUTBOX = ENLACE_DIR + "/outbox.json";
    private static final long ENLACE_POLL_MS = 10000;

    // Último error legible del motor ("" si todo fue bien). Lo consume la app web.
    private volatile String lastError = "";
    private static volatile AsagiBrainPlugin instance;
    private volatile boolean enlacePollRunning = false;

    public AsagiBrainPlugin() {
        super();
    }

    @Override
    public void load() {
        instance = this;
        appContext = getContext().getApplicationContext();
        // El modelo vive en la tarjeta SD si hay (no llena la memoria interna).
        modelDirectory = Almacen.carpetaModelos(appContext, MODEL_FILENAME);
        modelFile = new File(modelDirectory, MODEL_FILENAME);
        downloadState = DownloadState.fromStorage(appContext, modelDirectory, MODEL_FILENAME);
        iniciarEnlacePoller();
        // Si ya estaba en la interna y hay SD con espacio: lo pasa en segundo plano.
        if (modelFile.exists() && modelDirectory.equals(new File(appContext.getFilesDir(), "models")) && Almacen.sd(appContext) != null) {
            new Thread(() -> {
                File nuevo = Almacen.moverModeloASd(appContext, MODEL_FILENAME);
                if (nuevo != null) {
                    modelDirectory = nuevo.getParentFile();
                    modelFile = nuevo;
                    try { downloadState = DownloadState.fromStorage(appContext, modelDirectory, MODEL_FILENAME); } catch (Throwable ignored) {}
                    Log.i(TAG, "modelo movido a la SD: " + nuevo);
                }
            }, "asagi-modelo-sd").start();
        }
    }

    private File resolveModelDirectory() {
        File dir = modelDirectory;
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return dir;
    }

    private File resolveModelFile() {
        File file = modelFile;
        if (!file.getParentFile().exists()) {
            resolveModelDirectory();
        }
        return file;
    }

    private String modelPath() {
        return resolveModelFile().getAbsolutePath();
    }

    public String getModelPath() {
        return modelPath();
    }

    public File getModelFile() {
        return resolveModelFile();
    }

    public DownloadState getDownloadState() {
        return downloadState;
    }

    public void setDownloadState(DownloadState state) {
        downloadState = state;
    }

    public static class DownloadState {
        private final File modelFile;
        private long existingBytes;
        private String existingHash;

        DownloadState(File modelFile) {
            this.modelFile = modelFile;
            this.existingBytes = modelFile.exists() ? modelFile.length() : 0L;
            this.existingHash = modelFile.exists() ? sha256Of(modelFile) : null;
        }

        public static DownloadState fromStorage(Context context, File storageDir, String modelFilename) {
            return new DownloadState(new File(storageDir, modelFilename));
        }

        public File getModelFile() {
            return modelFile;
        }

        public long length() {
            return modelFile.length();
        }

        public String getExistingHash() {
            return existingHash;
        }

        public boolean exists() {
            return modelFile.exists();
        }

        public boolean matchesExpectedBytes() {
            return modelFile.exists() && modelFile.length() == MODEL_EXPECTED_BYTES;
        }

        public boolean matchesExpectedHash() {
            return modelFile.exists() && MODEL_EXPECTED_SHA256.equals(sha256Of(modelFile));
        }

        public boolean isLikelyComplete() {
            return matchesExpectedBytes() || (existingBytes >= DOWNLOAD_FALLBACK_BYTES * 0.95);
        }
    }

    private static String sha256Of(File file) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = new java.io.FileInputStream(file)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) != -1) {
                    md.update(buf, 0, n);
                }
            }
            return bytesToHex(md.digest());
        } catch (IOException e) {
            Log.e(TAG, "Error al calcular hash del modelo", e);
            return null;
        } catch (NoSuchAlgorithmException e) {
            Log.e(TAG, "SHA-256 no disponible", e);
            return null;
        }
    }

    private static String bytesToHex(byte[] bytes) {
        return String.format("%064x", new BigInteger(1, bytes));
    }

    public boolean isModelReady() {
        return loaded.get() && modelFile.exists() && downloadState.matchesExpectedBytes();
    }

    public String getStatus() {
        if (!modelFile.exists()) {
            return STATUS_UNAVAILABLE;
        }
        if (downloadState.matchesExpectedBytes()) {
            return STATUS_READY;
        }
        if (downloadState.exists()) {
            return "partial";
        }
        return STATUS_UNAVAILABLE;
    }

    public void loadModel() {
        if (loaded.get()) {
            return;
        }
        String path = modelPath();
        if (!new File(path).exists()) {
            Log.e(TAG, "El modelo no existe en " + path);
            return;
        }
        try {
            String err = nativeLoadModel(path);
            if (err != null && !err.isEmpty()) {
                Log.e(TAG, "nativeLoadModel falló: " + err);
                lastError = err;
                loaded.set(false);
            } else {
                lastError = "";
                loaded.set(nativeIsLoaded());
                if (!loaded.get()) {
                    lastError = "El modelo se abrió pero el contexto no quedó listo.";
                }
            }
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "No se pudo cargar la biblioteca nativa del motor", e);
            lastError = "El motor nativo no está disponible en esta instalación.";
            loaded.set(false);
        }
    }

    public void unloadModel() {
        if (!loaded.get()) {
            return;
        }
        nativeUnload();
        loaded.set(false);
    }

    public void generate(PluginCall call, JSONArray messages) {
        if (!loaded.get()) {
            JSObject data = new JSObject();
            data.put(KEY_LOADED, false);
            data.put(KEY_ERROR, "El modelo local no está cargado. Descárgalo antes de usar el modo Local.");
            call.resolve(data);
            return;
        }
        runGenerate(call, messages);
    }

    public void streamReply(PluginCall call, JSONArray messages) {
        if (!loaded.get()) {
            JSObject data = new JSObject();
            data.put(KEY_ERROR, "El modelo local no está cargado.");
            call.resolve(data);
            return;
        }
        runGenerate(call, messages);
    }

    private void runGenerate(PluginCall call, JSONArray messages) {
        int n = messages.length();
        String[] roles = new String[n];
        String[] contents = new String[n];
        try {
            for (int i = 0; i < n; i++) {
                JSONObject msg = messages.getJSONObject(i);
                roles[i] = msg.getString("role");
                contents[i] = msg.getString("content");
            }
        } catch (JSONException e) {
            JSObject data = new JSObject();
            data.put(KEY_ERROR, "Los mensajes no tienen la forma esperada (role + content).");
            call.resolve(data);
            return;
        }
        try {
            // El JNI responde JSON: {"ok":true,"text":…} o {"ok":false,"error":…}
            String json = nativeGenerateResult(roles, contents, 256);
            JSObject data = new JSObject();
            data.put(KEY_LOADED, true);
            try {
                JSONObject obj = new JSONObject(json == null ? "{}" : json);
                if (obj.optBoolean("ok", false)) {
                    data.put(KEY_TEXT, obj.optString(KEY_TEXT, ""));
                } else {
                    data.put(KEY_ERROR, obj.optString(KEY_ERROR, "El motor local falló."));
                }
            } catch (JSONException e) {
                data.put(KEY_ERROR, "Respuesta inválida del motor local.");
            }
            call.resolve(data);
        } catch (UnsatisfiedLinkError e) {
            JSObject data = new JSObject();
            data.put(KEY_ERROR, "No se pudo ejecutar el motor local.");
            call.resolve(data);
        }
    }

    public PluginResult downloadModel(PluginCall call) {
        if (downloadState.matchesExpectedBytes()) {
            JSObject data = new JSObject();
            data.put(KEY_STATUS, STATUS_READY);
            data.put(KEY_MODEL_PATH, modelPath());
            data.put(KEY_MODEL_SIZE, downloadState.length());
            data.put(KEY_MODEL_HASH, downloadState.getExistingHash());
            data.put(KEY_MODEL_DESIRED_HASH, MODEL_EXPECTED_SHA256);
            return new PluginResult(data);
        }
        if (downloadState.exists() && !downloadState.isLikelyComplete()) {
            JSObject data = new JSObject();
            data.put(KEY_STATUS, "partial");
            data.put(KEY_MODEL_PATH, modelPath());
            data.put(KEY_MODEL_SIZE, downloadState.length());
            data.put(KEY_MODEL_HASH, downloadState.getExistingHash());
            data.put(KEY_MODEL_DESIRED_HASH, MODEL_EXPECTED_SHA256);
            return new PluginResult(data);
        }
        startDownload(call);
        return null;
    }

    public void startDownload(PluginCall call) {
        File dest = resolveModelFile();
        File tmp = new File(dest.getParentFile(), MODEL_FILENAME + ".part");
        long existing = tmp.exists() ? tmp.length() : 0L;
        boolean resumeFrom = tmp.exists() && existing > 0;
        DownloadTask task = new DownloadTask(call, tmp, dest, existing, resumeFrom);
        executor.execute(task);
    }

    private class DownloadTask implements Runnable {
        private final PluginCall call;
        private final File tmpFile;
        private final File finalFile;
        private final long existingBytes;
        private final boolean resumeFrom;
        private volatile boolean cancelled = false;

        DownloadTask(PluginCall call, File tmpFile, File finalFile, long existingBytes, boolean resumeFrom) {
            this.call = call;
            this.tmpFile = tmpFile;
            this.finalFile = finalFile;
            this.existingBytes = existingBytes;
            this.resumeFrom = resumeFrom;
        }

        @Override
        public void run() {
            if (cancelled) return;
            try {
                doDownload();
            } catch (MalformedURLException e) {
                Log.e(TAG, "URL inválida", e);
            } catch (IOException e) {
                Log.e(TAG, "Error de E/S", e);
            }
        }

        private void doDownload() throws IOException {
            URL url = new URL(MODEL_HTTP_URL);
            HttpURLConnection conn = null;
            ReadableByteChannel channel = null;
            FileOutputStream out = null;
            try {
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(30_000);
                conn.setReadTimeout(60_000);
                conn.setRequestMethod("GET");
                if (resumeFrom) {
                    conn.setRequestProperty("Range", "bytes=" + existingBytes + "-");
                }
                int code = conn.getResponseCode();
                if (code == HttpURLConnection.HTTP_OK || code == HttpURLConnection.HTTP_PARTIAL) {
                    long total = conn.getContentLength();
                    if (total <= 0) {
                        total = DOWNLOAD_FALLBACK_BYTES;
                    }
                    if (code == HttpURLConnection.HTTP_OK && resumeFrom) {
                        total = existingBytes + total;
                    }
                    channel = Channels.newChannel(conn.getInputStream());
                    out = new FileOutputStream(tmpFile, true);
                    byte[] buffer = new byte[DOWNLOAD_BUFFER_BYTES];
                    long downloaded = existingBytes;
                    int read;
                    while ((read = channel.read(java.nio.ByteBuffer.wrap(buffer))) != -1) {
                        if (cancelled) {
                            return;
                        }
                        out.write(buffer, 0, read);
                        downloaded += read;
                        long[] progress = new long[]{downloaded, total};
                        updateProgress(progress);
                    }
                    out.flush();
                } else {
                    Log.e(TAG, "Respuesta inesperada: " + code);
                }
            } finally {
                if (channel != null) {
                    try { channel.close(); } catch (IOException ignored) {}
                }
                if (out != null) {
                    try { out.close(); } catch (IOException ignored) {}
                }
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }

        private void updateProgress(long[] values) {
            if (call == null) return;
            long downloaded = values[0];
            long total = values[1];
            JSObject data = new JSObject();
            data.put(KEY_STATUS, STATUS_DOWNLOADING);
            data.put(KEY_PROGRESS, downloaded);
            data.put(KEY_TOTAL, total);
            data.put(KEY_DOWNLOADING, true);
            call.resolve(data);
        }

        private void finish() {
            if (cancelled) return;
            if (!tmpFile.exists()) {
                if (call != null) {
                    call.reject("No se recibió el archivo del modelo.");
                }
                return;
            }
            long size = tmpFile.length();
            String hash = sha256Of(tmpFile);
            boolean ok = (size == MODEL_EXPECTED_BYTES) && MODEL_EXPECTED_SHA256.equals(hash);
            if (!ok && size > 0) {
                if (tmpFile.renameTo(finalFile)) {
                    Log.w(TAG, "Descarga parcial renombrada a " + finalFile.getAbsolutePath());
                } else {
                    Log.w(TAG, "No se pudo renombrar la descarga parcial");
                }
                if (call != null) {
                    call.reject("El modelo descargado no coincide con el hash esperado.");
                }
                return;
            }
            if (tmpFile.renameTo(finalFile)) {
                if (call != null) {
                    JSObject data = new JSObject();
                    data.put(KEY_STATUS, STATUS_READY);
                    data.put(KEY_MODEL_PATH, finalFile.getAbsolutePath());
                    data.put(KEY_MODEL_SIZE, finalFile.length());
                    data.put(KEY_MODEL_HASH, hash);
                    data.put(KEY_MODEL_DESIRED_HASH, MODEL_EXPECTED_SHA256);
                    data.put(KEY_DOWNLOADING, false);
                    call.resolve(data);
                }
            } else {
                Log.w(TAG, "No se pudo renombrar la descarga a " + finalFile.getAbsolutePath());
            }
        }

        void cancel() {
            cancelled = true;
        }
    }

    // --- Descarga del modelo (la usa la app web; ver ModelDownloader) ---

    private final AtomicBoolean descargando = new AtomicBoolean(false);
    private final AtomicBoolean descargaCancelada = new AtomicBoolean(false);

    private static final String[] MODEL_URLS = new String[]{
            MODEL_HTTP_URL,
            "https://hf-mirror.com/mradermacher/Qwen2.5-0.5B-Instruct-abliterated-GGUF/resolve/main"
                    + "/Qwen2.5-0.5B-Instruct-abliterated.Q4_K_M.gguf"
    };

    private void avisarDescarga(String estado, long hecho, long total, String error) {
        JSObject d = new JSObject();
        d.put("estado", estado);
        d.put("bytes", hecho);
        d.put("total", total);
        if (error != null) d.put("error", error);
        notifyListeners("descarga", d, true);
    }

    @PluginMethod
    public void estadoModelo(PluginCall call) {
        File f = resolveModelFile();
        File tmp = new File(f.getParentFile(), MODEL_FILENAME + ".part");
        JSObject d = new JSObject();
        d.put("listo", f.exists() && f.length() == MODEL_EXPECTED_BYTES);
        d.put("parcial", tmp.exists() ? tmp.length() : 0L);
        d.put("total", MODEL_EXPECTED_BYTES);
        d.put("descargando", descargando.get());
        call.resolve(d);
    }

    @PluginMethod
    public void descargarModelo(PluginCall call) {
        final File dest = resolveModelFile();
        if (dest.exists() && dest.length() == MODEL_EXPECTED_BYTES) {
            JSObject d = new JSObject();
            d.put("estado", "listo");
            call.resolve(d);
            return;
        }
        if (!descargando.compareAndSet(false, true)) {
            JSObject d = new JSObject();
            d.put("estado", "descargando");
            call.resolve(d);
            return;
        }
        descargaCancelada.set(false);
        final File tmp = new File(dest.getParentFile(), MODEL_FILENAME + ".part");
        Thread hilo = new Thread(() -> {
            try {
                avisarDescarga("descargando", tmp.exists() ? tmp.length() : 0L, MODEL_EXPECTED_BYTES, null);
                ModelDownloader.ejecutar(MODEL_URLS, tmp, dest, MODEL_EXPECTED_BYTES, MODEL_EXPECTED_SHA256,
                        descargaCancelada, new ModelDownloader.Listener() {
                            @Override public void onProgress(long hecho, long total) {
                                avisarDescarga("descargando", hecho, total, null);
                            }
                            @Override public void onDone(File archivo) {
                                try { downloadState = DownloadState.fromStorage(appContext, modelDirectory, MODEL_FILENAME); }
                                catch (Exception ignored) {}
                                avisarDescarga("listo", archivo.length(), MODEL_EXPECTED_BYTES, null);
                            }
                            @Override public void onError(String mensaje) {
                                avisarDescarga("error", tmp.exists() ? tmp.length() : 0L, MODEL_EXPECTED_BYTES, mensaje);
                            }
                        });
            } finally {
                descargando.set(false);
            }
        }, "asagi-descarga");
        hilo.setDaemon(true);
        hilo.start();
        JSObject d = new JSObject();
        d.put("estado", "descargando");
        call.resolve(d);
    }

    // --- API que consume la app web (window.Capacitor.Plugins.AsagiBrain) ---

    // Llamado desde el JNI (hilo de inferencia) por cada token ya válido en UTF-8.
    static void onNativeToken(String piece) {
        final AsagiBrainPlugin plugin = instance;
        if (plugin == null || piece == null || piece.isEmpty()) {
            return;
        }
        plugin.uiHandler.post(() -> {
            if (!plugin.hasListeners("token")) {
                return;
            }
            JSObject data = new JSObject();
            data.put("token", piece);
            plugin.notifyListeners("token", data, true);
        });
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject data = new JSObject();
        data.put(KEY_LOADED, loaded.get());
        data.put(KEY_ERROR, lastError);
        data.put("modelExists", resolveModelFile().exists());
        data.put("modelSize", resolveModelFile().length());
        call.resolve(data);
    }

    @PluginMethod
    public void load(PluginCall call) {
        final PluginCall reply = call;
        executor.execute(() -> {
            loadModel();
            final JSObject data = new JSObject();
            data.put(KEY_LOADED, loaded.get());
            data.put(KEY_ERROR, lastError);
            uiHandler.post(() -> reply.resolve(data));
        });
    }

    @PluginMethod
    public void unload(PluginCall call) {
        final PluginCall reply = call;
        executor.execute(() -> {
            unloadModel();
            final JSObject data = new JSObject();
            data.put(KEY_LOADED, false);
            uiHandler.post(() -> reply.resolve(data));
        });
    }

    // ---------------------------- Enlace por adb (carpeta USB) ----------------------------

    private void iniciarEnlacePoller() {
        if (enlacePollRunning) return;
        enlacePollRunning = true;
        new Thread(new Runnable() {
            @Override
            public void run() {
                while (enlacePollRunning) {
                    try {
                        Thread.sleep(ENLACE_POLL_MS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                    try {
                        leerEnlaceYNotificar();
                    } catch (Exception ignored) {
                    }
                }
            }
        }, "asagi-enlace-poller").start();
    }

    private void leerEnlaceYNotificar() {
        File f = new File(ENLACE_INBOX);
        if (!f.exists()) return;
        try (BufferedReader r = new BufferedReader(new FileReader(f))) {
            StringBuilder sb = new StringBuilder();
            String linea;
            while ((linea = r.readLine()) != null) sb.append(linea);
            JSONObject doc = new JSONObject(sb.toString());
            JSONArray msgs = doc.optJSONArray("msgs");
            if (msgs == null || msgs.length() == 0) return;
            JSObject data = new JSObject();
            data.put("msgs", msgs);
            final AsagiBrainPlugin plugin = instance;
            if (plugin != null && plugin.hasListeners("enlace-nuevos")) {
                plugin.uiHandler.post(() -> plugin.notifyListeners("enlace-nuevos", data, true));
            }
            // Marcar como leido: borrar inbox despues de notificar
            new File(ENLACE_INBOX).delete();
        } catch (Exception ignored) {
        }
    }

    @PluginMethod
    public void enlaceLeer(PluginCall call) {
        File f = new File(ENLACE_INBOX);
        JSObject data = new JSObject();
        if (!f.exists()) {
            data.put("msgs", new JSONArray());
            call.resolve(data);
            return;
        }
        try (BufferedReader r = new BufferedReader(new FileReader(f))) {
            StringBuilder sb = new StringBuilder();
            String linea;
            while ((linea = r.readLine()) != null) sb.append(linea);
            JSONObject doc = new JSONObject(sb.toString());
            data.put("msgs", doc.optJSONArray("msgs"));
        } catch (Exception e) {
            data.put("msgs", new JSONArray());
            data.put("error", "no pude leer inbox");
        }
        call.resolve(data);
    }

    @PluginMethod
    public void enlaceEscribir(PluginCall call) {
        JSONArray msgs = call.getArray("msgs");
        if (msgs == null) msgs = new JSONArray();
        File dir = new File(ENLACE_DIR);
        if (!dir.exists()) dir.mkdirs();
        try (FileWriter w = new FileWriter(ENLACE_OUTBOX)) {
            JSONObject doc = new JSONObject();
            doc.put("msgs", msgs);
            doc.put("ts", System.currentTimeMillis());
            w.write(doc.toString());
        } catch (IOException | JSONException e) {
            JSObject err = new JSObject();
            err.put("error", "no pude escribir outbox");
            call.resolve(err);
            return;
        }
        JSObject data = new JSObject();
        data.put("ok", true);
        call.resolve(data);
    }

    @PluginMethod
    public void stream(PluginCall call) {
        JSONArray messages = call.getArray("messages");
        if (messages == null || messages.length() == 0) {
            JSObject data = new JSObject();
            data.put(KEY_ERROR, "No hay mensajes que enviar al modelo.");
            call.resolve(data);
            return;
        }

        final int n = messages.length();
        final String[] roles = new String[n];
        final String[] contents = new String[n];
        try {
            for (int i = 0; i < n; i++) {
                JSONObject msg = messages.getJSONObject(i);
                roles[i] = msg.getString("role");
                contents[i] = msg.getString("content");
            }
        } catch (JSONException e) {
            JSObject data = new JSObject();
            data.put(KEY_ERROR, "Los mensajes no tienen la forma esperada (role + content).");
            call.resolve(data);
            return;
        }

        final PluginCall reply = call;
        executor.execute(() -> {
            String json = null;
            try {
                json = nativeGenerateStream(roles, contents, 256);
            } catch (UnsatisfiedLinkError e) {
                Log.e(TAG, "no se pudo ejecutar el motor local", e);
            }

            final JSObject data = new JSObject();
            if (json == null) {
                data.put(KEY_ERROR, "No se pudo ejecutar el motor local.");
            } else {
                try {
                    JSONObject obj = new JSONObject(json);
                    if (obj.optBoolean("ok", false)) {
                        data.put(KEY_TEXT, obj.optString(KEY_TEXT, ""));
                        data.put("tokens", obj.optInt("tokens", 0));
                        data.put("ms", obj.optLong("ms", 0));
                        data.put("truncated", obj.optBoolean("truncated", false));
                    } else {
                        data.put(KEY_ERROR, obj.optString(KEY_ERROR, "El motor local falló."));
                    }
                } catch (JSONException e) {
                    data.put(KEY_ERROR, "Respuesta inválida del motor local.");
                }
            }
            uiHandler.post(() -> reply.resolve(data));
        });
    }

    @FunctionalInterface
    public interface OnTokenListener {
        void onToken(String piece);
    }

    @FunctionalInterface
    public interface OnDoneListener {
        void onDone(String text, int tokens, long ms);
    }

    @FunctionalInterface
    public interface OnErrorListener {
        void onError(String message);
    }
}
