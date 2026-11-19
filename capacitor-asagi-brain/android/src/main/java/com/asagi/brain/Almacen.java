package com.asagi.brain;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Environment;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Dónde guarda ASAGI lo pesado: la tarjeta SD si hay (modelos de IA, Wikipedia sin internet),
 * para no llenar la memoria interna. Solo carpetas propias de la app (no pide permisos).
 */
public final class Almacen {
    private static final String TAG = "AsagiAlmacen";
    private static final long MIN_LIBRE_SD = 1_500_000_000L;

    private Almacen() {}

    /** La carpeta de la app en la SD extraíble (…/Android/data/com.asagi.app/files), o null. */
    public static File sd(Context c) {
        File[] ds = c.getExternalFilesDirs(null);
        if (ds == null) return null;
        for (File d : ds) {
            if (d == null) continue;
            try {
                if (Environment.isExternalStorageRemovable(d)
                        && Environment.MEDIA_MOUNTED.equals(Environment.getExternalStorageState(d))) return d;
            } catch (Throwable ignored) {}
        }
        return null;
    }

    /** Carpeta de modelos: la SD si ya está ahí o si hay espacio y aún no se bajó; si no, la interna. */
    public static File carpetaModelos(Context c, String archivo) {
        File interna = new File(c.getFilesDir(), "models");
        File s = sd(c);
        if (s == null) return interna;
        File enSd = new File(s, "models");
        if (new File(enSd, archivo).exists()) return enSd;
        if (!new File(interna, archivo).exists() && s.getUsableSpace() > MIN_LIBRE_SD) return enSd;
        return interna;
    }

    /** Pasa el modelo de la interna a la SD (copia, verifica tamaño, borra el original). Devuelve el nuevo archivo o null. */
    public static File moverModeloASd(Context c, String archivo) {
        File s = sd(c);
        File origen = new File(new File(c.getFilesDir(), "models"), archivo);
        if (s == null || !origen.exists() || s.getUsableSpace() < origen.length() + 200_000_000L) return null;
        File dir = new File(s, "models");
        if (!dir.exists() && !dir.mkdirs()) return null;
        File destino = new File(dir, archivo), tmp = new File(dir, archivo + ".mover");
        try (InputStream in = new FileInputStream(origen); OutputStream out = new FileOutputStream(tmp)) {
            byte[] b = new byte[1 << 20];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
        } catch (Throwable e) {
            Log.w(TAG, "no pude copiar el modelo a la SD", e);
            tmp.delete();
            return null;
        }
        if (tmp.length() != origen.length() || !tmp.renameTo(destino)) { tmp.delete(); return null; }
        if (!origen.delete()) Log.w(TAG, "no pude borrar el modelo interno");
        return destino;
    }

    // ---------------- Wikipedia sin internet (la arma ARIA en la PC y la copia por USB) ----------------
    public static File wikiDb(Context c) {
        List<File> cand = new ArrayList<>();
        File s = sd(c);
        if (s != null) cand.add(new File(s, "wiki/wiki_es.db"));
        File p = c.getExternalFilesDir(null);
        if (p != null) cand.add(new File(p, "wiki/wiki_es.db"));
        for (File f : cand) if (f.exists() && f.length() > 4096) return f;
        return null;
    }

    /** Igual que norm() de wiki_pc.py: minúsculas, sin tildes, sin signos. */
    public static String norm(String t) {
        String x = Normalizer.normalize(t == null ? "" : t.toLowerCase(Locale.ROOT), Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "");
        return x.replaceAll("[^\\p{L}\\p{N}_\\s]", " ").replaceAll("\\s+", " ").trim();
    }

    /** Busca en la Wikipedia local: título exacto, luego por título, luego en el texto. Solo lectura. */
    public static List<String[]> buscarWiki(Context c, String q, int n) {
        List<String[]> out = new ArrayList<>();
        File f = wikiDb(c);
        if (f == null) return out;
        SQLiteDatabase db = null;
        try {
            db = SQLiteDatabase.openDatabase(f.getAbsolutePath(), null,
                    SQLiteDatabase.OPEN_READONLY | SQLiteDatabase.NO_LOCALIZED_COLLATORS);
            String clave = norm(q);
            leer(db, "SELECT w.titulo, w.texto FROM idx JOIN w ON w.docid = idx.id WHERE idx.clave = ?", new String[]{clave}, n, out);
            if (out.isEmpty()) {
                StringBuilder cons = new StringBuilder();
                String[] ps = clave.split(" ");
                for (int i = 0; i < ps.length && i < 8; i++) {
                    if (ps[i].isEmpty()) continue;
                    if (cons.length() > 0) cons.append(' ');
                    cons.append(ps[i]).append(ps[i].length() > 3 ? "*" : "");
                }
                if (cons.length() > 0) {
                    leer(db, "SELECT titulo, texto FROM w WHERE titulo MATCH ? LIMIT " + n, new String[]{cons.toString()}, n, out);
                    if (out.isEmpty()) leer(db, "SELECT titulo, texto FROM w WHERE w MATCH ? LIMIT " + n, new String[]{cons.toString()}, n, out);
                }
            }
        } catch (Throwable e) {
            Log.w(TAG, "wiki", e);
        } finally {
            if (db != null) db.close();
        }
        return out;
    }

    private static void leer(SQLiteDatabase db, String sql, String[] args, int n, List<String[]> out) {
        try (Cursor cur = db.rawQuery(sql, args)) {
            while (cur.moveToNext() && out.size() < n) out.add(new String[]{cur.getString(0), cur.getString(1)});
        }
    }
}
