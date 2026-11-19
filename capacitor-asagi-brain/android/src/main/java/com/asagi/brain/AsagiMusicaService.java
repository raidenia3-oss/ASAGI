package com.asagi.brain;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.provider.MediaStore;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/**
 * Reproductor de música de ASAGI: suena con la app cerrada y la pantalla apagada.
 * Solo herramientas de Android (MediaPlayer + MediaSession + notificación multimedia): sin librerías nuevas y
 * con poca RAM. Controles en la notificación, la pantalla de bloqueo y los audífonos Bluetooth.
 * Si desconectas los audífonos, pausa. Si entra una llamada u otra app suena, se pausa/baja sola.
 */
public class AsagiMusicaService extends Service {
    static final String CANAL = "asagi_musica";
    static final String A_TOGGLE = "com.asagi.musica.TOGGLE", A_SIG = "com.asagi.musica.SIG", A_ANT = "com.asagi.musica.ANT", A_PARAR = "com.asagi.musica.PARAR";
    private static final int NOTIF_ID = 4711;

    // estado compartido con el plugin (un solo reproductor en toda la app)
    static AsagiMusicaService yo;
    static final List<Pista> cola = new ArrayList<>();
    static int indice = 0;
    static boolean aleatorio = false, repetir = false;
    static Escucha escucha;
    static long dormirA = 0;                                   // hora (ms) en que la música se pausa sola; 0 = no
    private final android.os.Handler reloj = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable dormir = () -> { dormirA = 0; pausar(); };

    void programarDormir(long minutos) {
        reloj.removeCallbacks(dormir);
        dormirA = minutos > 0 ? System.currentTimeMillis() + minutos * 60000L : 0;
        if (minutos > 0) reloj.postDelayed(dormir, minutos * 60000L);
        avisar();
    }

    interface Escucha { void cambio(); }

    static class Pista {
        long id; String titulo, artista, album; long dur;
        Pista(long id, String t, String a, String al, long d) { this.id = id; titulo = t; artista = a; album = al; dur = d; }
    }

    private MediaPlayer mp;
    private MediaSession sesion;
    private AudioManager am;
    private AudioFocusRequest pedidoFoco;
    private boolean pausadoPorFoco = false, preparado = false;

    private final BroadcastReceiver ruido = new BroadcastReceiver() {      // audífonos desconectados
        @Override public void onReceive(Context c, Intent i) { if (sonando()) pausar(); }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        yo = this;
        am = (AudioManager) getSystemService(AUDIO_SERVICE);
        sesion = new MediaSession(this, "ASAGI");
        sesion.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { seguir(); }
            @Override public void onPause() { pausar(); }
            @Override public void onSkipToNext() { siguiente(); }
            @Override public void onSkipToPrevious() { anterior(); }
            @Override public void onStop() { parar(); }
            @Override public void onSeekTo(long pos) { if (mp != null && preparado) { mp.seekTo((int) pos); publicar(); } }
        });
        sesion.setActive(true);
        registerReceiver(ruido, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            NotificationChannel ch = new NotificationChannel(CANAL, "Música", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
    }

    @Override
    public int onStartCommand(Intent i, int flags, int startId) {
        empezarPrimerPlano();
        String a = i == null ? null : i.getAction();
        if (A_TOGGLE.equals(a)) { if (sonando()) pausar(); else seguir(); }
        else if (A_SIG.equals(a)) siguiente();
        else if (A_ANT.equals(a)) anterior();
        else if (A_PARAR.equals(a)) parar();
        else tocarActual();
        return START_NOT_STICKY;
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public void onDestroy() {
        reloj.removeCallbacks(dormir); dormirA = 0;
        try { unregisterReceiver(ruido); } catch (Throwable ignored) {}
        soltarFoco();
        if (mp != null) { mp.release(); mp = null; }
        sesion.release();
        yo = null;
        avisar();
        super.onDestroy();
    }

    // ---------------- reproducción ----------------
    boolean sonando() { return mp != null && preparado && mp.isPlaying(); }
    Pista actual() { return (indice >= 0 && indice < cola.size()) ? cola.get(indice) : null; }
    int posicion() { return (mp != null && preparado) ? mp.getCurrentPosition() : 0; }

    void tocarActual() {
        Pista p = actual();
        if (p == null) { parar(); return; }
        if (!pedirFoco()) return;
        try {
            if (mp == null) {
                mp = new MediaPlayer();
                mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
                mp.setWakeMode(this, android.os.PowerManager.PARTIAL_WAKE_LOCK);
                mp.setOnCompletionListener(m -> { if (repetir) tocarActual(); else siguiente(); });
                mp.setOnErrorListener((m, w, e) -> { siguiente(); return true; });
            } else {
                mp.reset();
            }
            preparado = false;
            mp.setDataSource(this, ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, p.id));
            mp.setOnPreparedListener(m -> { preparado = true; m.start(); publicar(); });
            mp.prepareAsync();
        } catch (Throwable e) {
            if (cola.size() > 1) siguiente(); else parar();
        }
        publicar();
    }

    void pausar() { if (sonando()) { mp.pause(); } publicar(); }

    void seguir() {
        if (mp == null || !preparado) { tocarActual(); return; }
        if (pedirFoco()) mp.start();
        publicar();
    }

    void siguiente() {
        if (cola.isEmpty()) return;
        if (aleatorio && cola.size() > 1) { int n; do { n = new Random().nextInt(cola.size()); } while (n == indice); indice = n; }
        else indice = (indice + 1) % cola.size();
        tocarActual();
    }

    void anterior() {
        if (cola.isEmpty()) return;
        if (posicion() > 4000) { mp.seekTo(0); publicar(); return; }   // como los reproductores: primero vuelve al inicio
        indice = (indice - 1 + cola.size()) % cola.size();
        tocarActual();
    }

    void parar() {
        if (mp != null) { mp.release(); mp = null; preparado = false; }
        soltarFoco();
        stopForeground(true);
        stopSelf();
        avisar();
    }

    // ---------------- foco de audio (llamadas, otras apps) ----------------
    private final AudioManager.OnAudioFocusChangeListener cambioFoco = f -> {
        if (f == AudioManager.AUDIOFOCUS_LOSS) { pausadoPorFoco = false; pausar(); }
        else if (f == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) { if (sonando()) { pausadoPorFoco = true; pausar(); } }
        else if (f == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) { if (mp != null) mp.setVolume(0.25f, 0.25f); }
        else if (f == AudioManager.AUDIOFOCUS_GAIN) {
            if (mp != null) mp.setVolume(1f, 1f);
            if (pausadoPorFoco) { pausadoPorFoco = false; seguir(); }
        }
    };

    private boolean pedirFoco() {
        int r;
        if (Build.VERSION.SDK_INT >= 26) {
            if (pedidoFoco == null) pedidoFoco = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                    .setOnAudioFocusChangeListener(cambioFoco).build();
            r = am.requestAudioFocus(pedidoFoco);
        } else {
            r = am.requestAudioFocus(cambioFoco, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        return r == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void soltarFoco() {
        if (Build.VERSION.SDK_INT >= 26) { if (pedidoFoco != null) am.abandonAudioFocusRequest(pedidoFoco); }
        else am.abandonAudioFocus(cambioFoco);
    }

    // ---------------- notificación + pantalla de bloqueo ----------------
    private void empezarPrimerPlano() {
        try {
            Notification n = notificacion();
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NOTIF_ID, n);
        } catch (Throwable ignored) {}    // Android puede negarlo desde segundo plano: la música sigue igual
    }

    private PendingIntent accion(String a, int rc) {
        Intent i = new Intent(this, AsagiMusicaService.class).setAction(a);
        return PendingIntent.getService(this, rc, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification notificacion() {
        Pista p = actual();
        boolean s = sonando();
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CANAL) : new Notification.Builder(this);
        Intent abrir = getPackageManager().getLaunchIntentForPackage(getPackageName());
        b.setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(p == null ? "ASAGI" : p.titulo)
                .setContentText(p == null ? "Música" : p.artista)
                .setOngoing(s)
                .setShowWhen(false)
                .setColor(0xFFDC143C)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, "Anterior", accion(A_ANT, 1)).build())
                .addAction(new Notification.Action.Builder(s ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, s ? "Pausa" : "Reproducir", accion(A_TOGGLE, 2)).build())
                .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Siguiente", accion(A_SIG, 3)).build())
                .setDeleteIntent(accion(A_PARAR, 4))
                .setStyle(new Notification.MediaStyle().setMediaSession(sesion.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        if (abrir != null) b.setContentIntent(PendingIntent.getActivity(this, 5, abrir, PendingIntent.FLAG_IMMUTABLE));
        return b.build();
    }

    void publicar() {
        Pista p = actual();
        boolean s = sonando();
        if (p != null) sesion.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, p.titulo)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, p.artista)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, p.album)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, p.dur).build());
        sesion.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                        | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP | PlaybackState.ACTION_SEEK_TO)
                .setState(s ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, posicion(), s ? 1f : 0f).build());
        try { getSystemService(NotificationManager.class).notify(NOTIF_ID, notificacion()); } catch (Throwable ignored) {}
        if (!s) stopForeground(false);                    // en pausa: se puede deslizar para quitar
        else empezarPrimerPlano();
        avisar();
    }

    private static void avisar() { Escucha e = escucha; if (e != null) e.cambio(); }

    static void barajar(List<Pista> l) { Collections.shuffle(l); }
}
