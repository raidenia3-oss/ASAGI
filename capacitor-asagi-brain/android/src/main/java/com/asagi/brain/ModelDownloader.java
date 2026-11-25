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

    private static final int MAX_INTENTOS = 12;
    private static final int MAX_REDIRECCIONES = 8;

    private ModelDownloader() {}

    static void ejecutar(String[] urls, File tmp, File destino, long bytesEsperados,
                         String sha256Esperado, AtomicBoolean cancelado, Listener l) {
        File dir = destino.getParentFile();
        if (dir != null && !dir.exists()) dir.mkdirs();
        String ultimoError = "sin conexion";
        for (int intento = 0; intento < MAX_INTENTOS; intento++) {
            if (cancelado.get()) return;
            // el principal (HuggingFace) es el más rápido: el espejo solo si el principal falló 2 veces seguidas
            String url = urls[(intento < 2 || urls.length == 1) ? 0 : (intento % urls.length)];
            try {
                long existente = tmp.exists() ? tmp.length() : 0L;
                if (existente > bytesEsperados) { tmp.delete(); existente = 0L; }
                if (existente < bytesEsperados) {
                    // 4 conexiones a la vez (cada una baja su pedazo y se reanuda sola): mucho más rápido que una.
                    // Si ya había un .part de una sola conexión, sigo con esa para no tirar lo bajado.
                    boolean enPartes = existente == 0 && descargarEnPartes(url, tmp, bytesEsperados, cancelado, l);
                    if (!enPartes) descargar(url, tmp, tmp.exists() ? tmp.length() : 0L, bytesEsperados, cancelado, l);
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
                String host = url; try { host = new java.net.URL(url).getHost(); } catch (Exception ignored) {}
                ultimoError = (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()) + " (" + host + ")";
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
                conn.setConnectTimeout(15_000);
                conn.setReadTimeout(90_000);
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
                byte[] buf = new byte[256 * 1024];
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
        try { Thread.sleep(Math.min(8_000L, 750L * (intento + 1))); } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    static String sha256(File f) {
        try (InputStream in = new java.io.FileInputStream(f)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] b = new byte[256 * 1024];
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

    static final int PARTES = 4;

    /** Inicio y fin (exclusivo) del pedazo i de n. PURO. */
    static long[] rango(long total, int i, int n) {
        long tam = total / n;
        long a = i * tam;
        long b = (i == n - 1) ? total : a + tam;
        return new long[]{a, b};
    }

    /** Baja en PARTES conexiones a archivos .pN y luego los une en tmp. false = el servidor no acepta rangos (usar una sola). */
    private static boolean descargarEnPartes(final String url, File tmp, final long total,
                                             final AtomicBoolean cancelado, final Listener l) throws IOException {
        final File[] partes = new File[PARTES];
        for (int i = 0; i < PARTES; i++) partes[i] = new File(tmp.getPath() + ".p" + i);
        final java.util.concurrent.atomic.AtomicLong hecho = new java.util.concurrent.atomic.AtomicLong(0);
        for (File f : partes) if (f.exists()) hecho.addAndGet(f.length());
        final IOException[] error = new IOException[1];
        final boolean[] sinRangos = new boolean[1];
        Thread[] hilos = new Thread[PARTES];
        for (int i = 0; i < PARTES; i++) {
            final int k = i;
            hilos[i] = new Thread(() -> {
                long[] r = rango(total, k, PARTES);
                long ya = partes[k].exists() ? partes[k].length() : 0L;
                if (ya >= r[1] - r[0]) return;
                try {
                    if (!bajarRango(url, partes[k], r[0] + ya, r[1] - 1, cancelado, n -> l.onProgress(hecho.addAndGet(n), total))) {
                        sinRangos[0] = true;
                    }
                } catch (IOException e) {
                    synchronized (error) { if (error[0] == null) error[0] = e; }
                }
            }, "asagi-descarga-" + i);
            hilos[i].start();
        }
        for (Thread h : hilos) {
            try { h.join(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return true; }
        }
        if (sinRangos[0]) { for (File f : partes) f.delete(); return false; }
        if (error[0] != null) throw error[0];          // lo bajado queda en .pN: el próximo intento sigue desde ahí
        if (cancelado.get()) return true;
        for (int i = 0; i < PARTES; i++) {
            long[] r = rango(total, i, PARTES);
            if (!partes[i].exists() || partes[i].length() != r[1] - r[0]) throw new IOException("una parte quedo incompleta");
        }
        try (FileOutputStream out = new FileOutputStream(tmp, false)) {
            byte[] buf = new byte[256 * 1024];
            for (File f : partes) {
                try (InputStream in = new java.io.FileInputStream(f)) {
                    int n;
                    while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                }
            }
        }
        for (File f : partes) f.delete();
        return true;
    }

    interface Avance { void sumar(long n); }

    /** Baja bytes [desde, hasta] (incluido) y los AGREGA a archivo. false si el servidor no respondió 206. */
    private static boolean bajarRango(String urlInicial, File archivo, long desde, long hasta,
                                      AtomicBoolean cancelado, Avance av) throws IOException {
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
                conn.setRequestProperty("Range", "bytes=" + desde + "-" + hasta);
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
            if (codigo == 200) return false;
            if (codigo != 206) throw new IOException("el servidor respondio " + codigo);
            long falta = hasta - desde + 1;
            try (InputStream in = conn.getInputStream(); FileOutputStream out = new FileOutputStream(archivo, true)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while (falta > 0 && (n = in.read(buf, 0, (int) Math.min(buf.length, falta))) != -1) {
                    if (cancelado.get()) return true;
                    out.write(buf, 0, n);
                    falta -= n;
                    av.sumar(n);
                }
            }
            if (falta > 0) throw new IOException("descarga cortada");
            return true;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
