package com.asagi.brain;

import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginResult;
import com.getcapacitor.PluginCall;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
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

public class AsagiBrainPlugin extends Plugin {

    private static final String TAG = "AsagiBrain";
    private static final String MODEL_FILENAME = "Qwen3-0.6B-Q4_K_M.gguf";
    private static final String MODEL_HTTP_URL =
            "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf";
    private static final long MODEL_EXPECTED_BYTES = 396705472L;
    private static final String MODEL_EXPECTED_SHA256 = "b117130f20e3ecb270284b9f3a09ae7d73267803757483abd3ad75d4fbd84d88";
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
    private static final String STATUS_READY = "ready";
    private static final String STATUS_DOWNLOADING = "downloading";
    private static final String STATUS_UNAVAILABLE = "unavailable";

    private static native String nativeLoadModel(String path);
    private static native void nativeUnload();
    private static native boolean nativeIsLoaded();
    private static native String nativeGenerate(String[] roles, String[] contents, int maxTokens);

    private Context appContext;
    private File modelDirectory;
    private File modelFile;
    private DownloadState downloadState;
    private AtomicBoolean loaded = new AtomicBoolean(false);
    private Handler uiHandler = new Handler(Looper.getMainLooper());
    private ExecutorService executor = Executors.newSingleThreadExecutor();
    private OnTokenListener onTokenListener;
    private OnDoneListener onDoneListener;
    private OnErrorListener onErrorListener;
    private static final String CHANNEL_ID = "asagi-brain-download";
    private static final int NOTIFICATION_ID_DOWNLOAD = 7201;

    public AsagiBrainPlugin() {
        super();
    }

    @Override
    public void load() {
        appContext = getContext().getApplicationContext();
        modelDirectory = new File(appContext.getFilesDir(), "models");
        modelFile = new File(modelDirectory, MODEL_FILENAME);
        downloadState = DownloadState.fromStorage(appContext, modelDirectory, MODEL_FILENAME);
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
                loaded.set(false);
            } else {
                loaded.set(nativeIsLoaded());
            }
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "No se pudo cargar la biblioteca nativa del motor", e);
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
            String result = nativeGenerate(roles, contents, 256);
            if (result == null || result.isEmpty()) {
                JSObject data = new JSObject();
                data.put(KEY_LOADED, true);
                call.resolve(data);
            } else {
                JSObject data = new JSObject();
                data.put(KEY_ERROR, result);
                call.resolve(data);
            }
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
            return PluginResult.success(data);
        }
        if (downloadState.exists() && !downloadState.isLikelyComplete()) {
            JSObject data = new JSObject();
            data.put(KEY_STATUS, "partial");
            data.put(KEY_MODEL_PATH, modelPath());
            data.put(KEY_MODEL_SIZE, downloadState.length());
            data.put(KEY_MODEL_HASH, downloadState.getExistingHash());
            data.put(KEY_MODEL_DESIRED_HASH, MODEL_EXPECTED_SHA256);
            return PluginResult.success(data);
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
