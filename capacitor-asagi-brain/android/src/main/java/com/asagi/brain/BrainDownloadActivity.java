package com.asagi.brain;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
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

public class BrainDownloadActivity extends Activity {

    private static final String TAG = "AsagiBrain";
    private static final String MODEL_FILENAME = "Qwen3-0.6B-Q4_K_M.gguf";
    private static final String MODEL_HTTP_URL =
            "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf";
    private static final long MODEL_EXPECTED_BYTES = 396705472L;
    private static final String MODEL_EXPECTED_SHA256 = "b117130f20e3ecb270284b9f3a09ae7d73267803757483abd3ad75d4fbd84d88";
    private static final int DOWNLOAD_BUFFER_BYTES = 8192;
    private static final long DOWNLOAD_FALLBACK_BYTES = 400 * 1024 * 1024;

    private static final int NOTIFICATION_ID_DOWNLOAD = 7202;
    private static final String CHANNEL_ID = "asagi-brain-download";

    private TextView titleView;
    private TextView descriptionView;
    private TextView recommendView;
    private ProgressBar progressBar;
    private Button cancelButton;
    private Button retryButton;
    private Button wifiButton;
    private Button cellularButton;
    private TextView statusView;

    private File modelDirectory;
    private File modelFile;
    private File tmpFile;
    private DownloadTask downloadTask;
    private Handler uiHandler = new Handler(Looper.getMainLooper());
    private ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_brain);

        titleView = findViewById(R.id.brain_download_title);
        descriptionView = findViewById(R.id.brain_download_description);
        recommendView = findViewById(R.id.brain_download_recommend);
        progressBar = findViewById(R.id.brain_download_progress);
        cancelButton = findViewById(R.id.brain_download_cancel);
        retryButton = findViewById(R.id.brain_download_retry);
        wifiButton = findViewById(R.id.brain_download_wifi);
        cellularButton = findViewById(R.id.brain_download_cellular);
        statusView = findViewById(R.id.brain_download_status);

        modelDirectory = new File(getFilesDir(), "models");
        modelFile = new File(modelDirectory, MODEL_FILENAME);
        tmpFile = new File(modelDirectory, MODEL_FILENAME + ".part");

        DownloadState state = DownloadState.fromStorage(this, modelDirectory, MODEL_FILENAME);

        boolean wifiOnly = isWifiOrEthernet();
        boolean allowCellular = isOnMeteredConnection();

        if (state.matchesExpectedBytes()) {
            showReady();
            return;
        }
        if (state.exists() && !state.isLikelyComplete()) {
            showPartial();
        }

        cancelButton.setOnClickListener(v -> cancelDownload());
        retryButton.setOnClickListener(v -> retryDownload());
        wifiButton.setOnClickListener(v -> startDownloadOverNetwork(false));
        cellularButton.setOnClickListener(v -> startDownloadOverNetwork(true));
    }

    @Override
    protected void onStart() {
        super.onStart();
        DownloadState state = DownloadState.fromStorage(this, modelDirectory, MODEL_FILENAME);
        if (state.matchesExpectedBytes()) {
            showReady();
        } else if (state.exists() && !state.isLikelyComplete()) {
            showPartial();
        }
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (level >= TRIM_MEMORY_RUNNING_CRITICAL || level >= TRIM_MEMORY_COMPLETE) {
            cancelDownload();
        }
    }

    private static final int TRIM_MEMORY_RUNNING_CRITICAL = 21;
    private static final int TRIM_MEMORY_COMPLETE = 22;

    private boolean isWifiOrEthernet() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        if (caps == null) return false;
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET);
    }

    private boolean isOnMeteredConnection() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        if (caps == null) return false;
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR);
    }

    private void cancelDownload() {
        if (downloadTask != null) {
            downloadTask.cancel();
        }
        if (tmpFile.exists()) {
            tmpFile.delete();
        }
        DownloadState state = DownloadState.fromStorage(this, modelDirectory, MODEL_FILENAME);
        showConfirmation();
        Toast.makeText(this, R.string.download_cancel, Toast.LENGTH_SHORT).show();
        finish();
    }

    private void retryDownload() {
        if (tmpFile.exists()) {
            tmpFile.delete();
        }
        DownloadState state = DownloadState.fromStorage(this, modelDirectory, MODEL_FILENAME);
        showConfirmation();
    }

    private void startDownloadOverNetwork(boolean allowCellularNow) {
        startDownload();
    }

    private void startDownload() {
        DownloadState state = DownloadState.fromStorage(this, modelDirectory, MODEL_FILENAME);
        if (state.matchesExpectedBytes()) {
            showReady();
            return;
        }
        long existing = tmpFile.exists() ? tmpFile.length() : 0L;
        boolean resumeFrom = tmpFile.exists() && existing > 0;
        downloadTask = new DownloadTask(this, tmpFile, modelFile, existing, resumeFrom);
        executor.execute(downloadTask);
    }

    private void showReady() {
        titleView.setText(R.string.download_complete);
        descriptionView.setText(R.string.download_complete);
        recommendView.setVisibility(View.GONE);
        progressBar.setVisibility(View.GONE);
        cancelButton.setVisibility(View.GONE);
        retryButton.setVisibility(View.GONE);
        wifiButton.setVisibility(View.GONE);
        cellularButton.setVisibility(View.GONE);
        statusView.setText(R.string.status_ready);
        statusView.setVisibility(View.VISIBLE);
    }

    private void showPartial() {
        titleView.setText(R.string.download_partial);
        descriptionView.setText(R.string.download_partial);
        recommendView.setVisibility(View.GONE);
        progressBar.setVisibility(View.VISIBLE);
        progressBar.setProgress((int) ((tmpFile.length() * 100) / Math.max(MODEL_EXPECTED_BYTES, 1)));
        cancelButton.setVisibility(View.VISIBLE);
        retryButton.setVisibility(View.VISIBLE);
        wifiButton.setVisibility(View.GONE);
        cellularButton.setVisibility(View.GONE);
        statusView.setText(R.string.status_partial);
        statusView.setVisibility(View.VISIBLE);
    }

    private void showConfirmation() {
        titleView.setText(R.string.download_confirm_title);
        descriptionView.setText(R.string.download_confirm_message);
        recommendView.setVisibility(View.VISIBLE);
        recommendView.setText(R.string.download_recommend);
        progressBar.setVisibility(View.GONE);
        cancelButton.setVisibility(View.VISIBLE);
        retryButton.setVisibility(View.GONE);
        if (wifiOnly()) {
            wifiButton.setVisibility(View.VISIBLE);
            cellularButton.setVisibility(View.GONE);
        } else {
            wifiButton.setVisibility(View.VISIBLE);
            cellularButton.setVisibility(View.VISIBLE);
        }
        statusView.setText(R.string.status_downloading);
        statusView.setVisibility(View.VISIBLE);
    }

    private boolean wifiOnly() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        if (caps == null) return false;
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET);
    }

    private static class DownloadState {
        private final File storageDir;
        private final File modelFile;
        private long existingBytes;
        private String existingHash;

        DownloadState(Context context, File storageDir, String modelFilename) {
            this.storageDir = storageDir;
            this.modelFile = new File(storageDir, modelFilename);
            this.existingBytes = modelFile.exists() ? modelFile.length() : 0L;
            this.existingHash = modelFile.exists() ? sha256Of(modelFile) : null;
        }

        public static DownloadState fromStorage(Context context, File storageDir, String modelFilename) {
            return new DownloadState(context, storageDir, modelFilename);
        }

        public boolean exists() {
            return modelFile.exists();
        }

        public long length() {
            return modelFile.length();
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

    private class DownloadTask implements Runnable {
        private final Context context;
        private final File tmpFile;
        private final File finalFile;
        private final long existingBytes;
        private final boolean resumeFrom;
        private volatile boolean cancelled = false;

        DownloadTask(Context context, File tmpFile, File finalFile, long existingBytes, boolean resumeFrom) {
            this.context = context;
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
                        uiHandler.post(() -> publishProgress(progress));
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

        private void publishProgress(long[] values) {
            if (context == null || progressBar == null || statusView == null) return;
            long downloaded = values[0];
            long total = values[1];
            progressBar.setProgress((int) ((downloaded * 100) / Math.max(total, 1)));
            statusView.setText(String.format("%s (%d MB)", context.getString(R.string.download_progress), (int) (downloaded / (1024 * 1024))));
        }

        void cancel() {
            cancelled = true;
        }
    }
}
