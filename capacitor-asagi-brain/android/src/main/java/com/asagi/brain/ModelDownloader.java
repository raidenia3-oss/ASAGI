package com.asagi.brain;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Descarga del modelo, robusta y sin tocar UI: reanuda con Range, sigue
 * redirecciones a mano (HuggingFace redirige a un CDN), reintenta con espera,
 * prueba espejos si el principal falla, verifica tamano + SHA-256 y SOLO
 * entonces mueve el .part al nombre final. Cada fallo llega como texto claro.
 */
final class ModelDownloader {

    interface Listener {
        void onProgress(long hecho, long total);
        void onDone(File archivo);
        void onError(String mensaje);
    }

    private static final int MAX_INTENTOS = 10;
    private static final int MAX_REDIRECCIONES = 6;

    private ModelDownloader() {}

    static void ejecutar(String[] urls, File tmp, File destino, long bytesEsperados,
                         String sha256Esperado, AtomicBoolean cancelado, Listener l) {
        File dir = destino.getParentFile();
        if (dir != null && !dir.exists()) dir.mkdirs();
        String ultimoError = "sin conexion";
        for (int intento = 0; intento < MAX_INTENTOS; intento++) {
            if (cancelado.get()) return;
            String url = urls[intento % urls.length];
            try {
                long existente = tmp.exists() ? tmp.length() : 0L;
                if (existente > bytesEsperados) { tmp.delete(); existente = 0L; }
                if (existente < bytesEsperados) {
                    descargar(url, tmp, existente, bytesEsperados, cancelado, l);
                }
                if (cancelado.get()) return;
                long tam = tmp.exists() ? tmp.length() : 0L;
                if (tam < bytesEsperados) {
                    ultimoError = "descarga cortada en " + (tam / (1024 * 1024)) + " MB";
                    esperar(intento);
                    continue;
                }
                if (tam > bytesEsperados) { tmp.delete(); ultimoError = "archivo mas grande de lo esperado"; continue; }
                String hash = sha256(tmp);
                if (hash == null || !hash.equalsIgnoreCase(sha256Esperado)) {
                    tmp.delete();
                    ultimoError = "el archivo llego danado (hash distinto), reintentando";
                    continue;
                }
                if (destino.exists()) destino.delete();
                if (!tmp.renameTo(destino)) {
                    ultimoError = "no pude guardar el modelo en el almacenamiento";
                    break;
                }
                l.onDone(destino);
                return;
            } catch (IOException e) {
                ultimoError = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                esperar(intento);
            }
        }
        l.onError(ultimoError);
    }

    private static void descargar(String urlInicial, File tmp, long desde, long total,
                                  AtomicBoolean cancelado, Listener l) throws IOException {
        HttpURLConnection conn = null;
        try {
            String url = urlInicial;
            int codigo = -1;
            for (int salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(30_000);
                conn.setReadTimeout(60_000);
                conn.setRequestProperty("User-Agent", "ASAGI/1.0 (Android)");
                if (desde > 0) conn.setRequestProperty("Range", "bytes=" + desde + "-");
                codigo = conn.getResponseCode();
                if (codigo == 301 || codigo == 302 || codigo == 303 || codigo == 307 || codigo == 308) {
                    String loc = conn.getHeaderField("Location");
                    conn.disconnect();
                    if (loc == null) throw new IOException("redireccion sin destino");
                    url = new URL(new URL(url), loc).toString();
                    continue;
                }
                break;
            }
            if (codigo == 416) { // ya estaba completo o el .part no sirve
                if (desde >= total) return;
                tmp.delete();
                throw new IOException("el servidor rechazo reanudar, empiezo de nuevo");
            }
            if (codigo != 200 && codigo != 206) {
                throw new IOException("el servidor respondio " + codigo);
            }
            boolean anexar = (codigo == 206 && desde > 0);
            if (!anexar && desde > 0) { tmp.delete(); desde = 0; } // el servidor ignoro Range
            long hecho = desde;
            long ultimoAviso = 0;
            try (InputStream in = conn.getInputStream();
                 FileOutputStream out = new FileOutputStream(tmp, anexar)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) {
                    if (cancelado.get()) return;
                    out.write(buf, 0, n);
                    hecho += n;
                    long ahora = System.currentTimeMillis();
                    if (ahora - ultimoAviso > 400) {
                        ultimoAviso = ahora;
                        l.onProgress(hecho, total);
                    }
                }
                out.flush();
            }
            l.onProgress(hecho, total);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static void esperar(int intento) {
        try { Thread.sleep(Math.min(15_000L, 1500L * (intento + 1))); } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    static String sha256(File f) {
        try (InputStream in = new java.io.FileInputStream(f)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] b = new byte[64 * 1024];
            int n;
            while ((n = in.read(b)) != -1) md.update(b, 0, n);
            byte[] d = md.digest();
            StringBuilder sb = new StringBuilder();
            for (byte x : d) sb.append(String.format("%02x", x));
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }
}
