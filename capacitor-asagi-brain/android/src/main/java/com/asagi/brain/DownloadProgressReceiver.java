package com.asagi.brain;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationCompat;

public class DownloadProgressReceiver extends BroadcastReceiver {

    private static final String CHANNEL_ID = "asagi-brain-download";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !"asagi.brain.download.progress".equals(intent.getAction())) {
            return;
        }
        long downloaded = intent.getLongExtra("downloaded", 0L);
        long total = intent.getLongExtra("total", 0L);
        String filename = intent.getStringExtra("filename");
        if (filename == null) {
            filename = "Qwen3-0.6B-Q4_K_M.gguf";
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }

        String text = filename + " (" + (downloaded / (1024 * 1024)) + " MB)";
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle("Descargando modelo de ASAGI")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setOngoing(true)
                .setProgress(100, (int) ((downloaded * 100) / Math.max(total, 1)), total <= 0);

        manager.notify(7202, builder.build());
    }
}
