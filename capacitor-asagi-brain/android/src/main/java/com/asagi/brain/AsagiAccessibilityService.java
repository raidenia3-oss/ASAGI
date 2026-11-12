package com.asagi.brain;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.graphics.Path;
import android.os.Build;
import android.os.Bundle;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

/**
 * Servicio de Accesibilidad de ASAGI. Es el "puente" que permite a Asagi USAR las apps
 * del telefono: LEER la pantalla, TOCAR y ESCRIBIR. Lo activa el usuario a mano en
 * Ajustes > Accesibilidad; mientras no este activo, getInstance() es null y el plugin
 * responde "no activada".
 *
 * La seguridad (que acciones necesitan aprobacion) la pone la capa JS (asagi-apps.js);
 * aqui solo estan las primitivas.
 */
public class AsagiAccessibilityService extends AccessibilityService {

    private static AsagiAccessibilityService instance;

    public static AsagiAccessibilityService getInstance() {
        return instance;
    }

    public static boolean isRunning() {
        return instance != null;
    }

    @Override
    public void onServiceConnected() {
        instance = this;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // No reaccionamos a eventos: Asagi consulta bajo demanda.
    }

    @Override
    public void onInterrupt() {
    }

    @Override
    public boolean onUnbind(Intent intent) {
        instance = null;
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        instance = null;
        super.onDestroy();
    }

    /** Lee el texto/descripciones visibles de la ventana activa. */
    public String readScreen() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        collectText(root, sb);
        return sb.toString().trim();
    }

    private void collectText(AccessibilityNodeInfo node, StringBuilder sb) {
        if (node == null) {
            return;
        }
        CharSequence t = node.getText();
        if (t != null && t.length() > 0) {
            sb.append(t).append("\n");
        }
        CharSequence d = node.getContentDescription();
        if (d != null && d.length() > 0) {
            sb.append(d).append("\n");
        }
        for (int i = 0; i < node.getChildCount(); i++) {
            collectText(node.getChild(i), sb);
        }
    }

    /** Toca el primer elemento visible cuyo texto contiene 'texto' (o su padre clicable). */
    public boolean tapTexto(String texto) {
        if (texto == null || texto.trim().isEmpty()) return false;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        java.util.List<AccessibilityNodeInfo> hallados = root.findAccessibilityNodeInfosByText(texto.trim());
        if (hallados == null) return false;
        for (AccessibilityNodeInfo n : hallados) {
            AccessibilityNodeInfo c = n;
            while (c != null && !c.isClickable()) c = c.getParent();
            if (c != null && c.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
        }
        return false;
    }

    /** Pega el portapapeles en el campo con foco (si la app lo permite). */
    public boolean pegarEnFoco() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        AccessibilityNodeInfo f = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (f == null) f = root.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY);
        return f != null && f.performAction(AccessibilityNodeInfo.ACTION_PASTE);
    }

    /** Toque en (x,y) de la pantalla. Requiere API 24+ (gestos). */
    public boolean tap(float x, float y) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            return false;
        }
        Path path = new Path();
        path.moveTo(x, y);
        GestureDescription.Builder builder = new GestureDescription.Builder();
        builder.addStroke(new GestureDescription.StrokeDescription(path, 0, 60));
        return dispatchGesture(builder.build(), null, null);
    }

    /** Escribe texto en el campo actualmente enfocado. */
    public boolean typeText(String text) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) {
            return false;
        }
        AccessibilityNodeInfo focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (focused == null) {
            return false;
        }
        Bundle args = new Bundle();
        args.putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                text == null ? "" : text);
        return focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
    }

    // ================= Modo manos: pantalla estructurada + acciones =================

    /** Paquete de la app en primer plano. */
    public String paqueteActual() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        return root != null && root.getPackageName() != null ? root.getPackageName().toString() : "";
    }

    /** Elementos visibles con lo que se puede hacer con ellos (para que el agente decida). */
    public org.json.JSONArray leerNodos(int max) {
        org.json.JSONArray out = new org.json.JSONArray();
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root != null) recorrer(root, out, Math.max(10, Math.min(max, 200)), 0);
        return out;
    }

    private void recorrer(AccessibilityNodeInfo n, org.json.JSONArray out, int max, int prof) {
        if (n == null || out.length() >= max || prof > 40) return;
        if (n.isVisibleToUser()) {
            CharSequence t = n.getText(), d = n.getContentDescription();
            String txt = t != null ? t.toString() : "", desc = d != null ? d.toString() : "";
            boolean clic = n.isClickable(), edit = n.isEditable(), scroll = n.isScrollable();
            if (txt.length() > 0 || desc.length() > 0 || edit) {
                try {
                    org.json.JSONObject o = new org.json.JSONObject();
                    android.graphics.Rect r = new android.graphics.Rect();
                    n.getBoundsInScreen(r);
                    o.put("t", n.isPassword() ? "••••" : (txt.length() > 120 ? txt.substring(0, 120) : txt));
                    if (desc.length() > 0) o.put("d", desc.length() > 80 ? desc.substring(0, 80) : desc);
                    if (clic) o.put("clic", true);
                    if (edit) o.put("edit", true);
                    if (scroll) o.put("scroll", true);
                    if (n.isPassword()) o.put("clave", true);
                    o.put("x", r.centerX()); o.put("y", r.centerY());
                    out.put(o);
                } catch (org.json.JSONException ignored) { }
            }
        }
        for (int i = 0; i < n.getChildCount(); i++) recorrer(n.getChild(i), out, max, prof + 1);
    }

    /** Toca por texto o descripcion; prefiere coincidencia exacta y elementos clicables. */
    public boolean tocarElemento(String texto) {
        if (texto == null || texto.trim().isEmpty()) return false;
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        String q = texto.trim().toLowerCase();
        java.util.List<AccessibilityNodeInfo> todos = new java.util.ArrayList<>();
        juntar(root, todos, 0);
        AccessibilityNodeInfo mejor = null; int puntos = 0;
        for (AccessibilityNodeInfo n : todos) {
            if (!n.isVisibleToUser()) continue;
            String t = n.getText() != null ? n.getText().toString().toLowerCase().trim() : "";
            String d = n.getContentDescription() != null ? n.getContentDescription().toString().toLowerCase().trim() : "";
            int p = (t.equals(q) || d.equals(q)) ? 3 : (t.contains(q) || d.contains(q)) ? 1 : 0;
            if (p == 0) continue;
            if (n.isClickable()) p += 1;
            if (p > puntos) { puntos = p; mejor = n; }
        }
        AccessibilityNodeInfo c = mejor;
        while (c != null && !c.isClickable()) c = c.getParent();
        if (c != null && c.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true;
        if (mejor != null) {                       // sin padre clicable: toque en su centro
            android.graphics.Rect r = new android.graphics.Rect();
            mejor.getBoundsInScreen(r);
            return tap(r.centerX(), r.centerY());
        }
        return false;
    }

    private void juntar(AccessibilityNodeInfo n, java.util.List<AccessibilityNodeInfo> l, int prof) {
        if (n == null || prof > 40 || l.size() > 600) return;
        l.add(n);
        for (int i = 0; i < n.getChildCount(); i++) juntar(n.getChild(i), l, prof + 1);
    }

    /** Escribe en el campo con foco o, si no hay, en el primer campo editable. Nunca en campos de clave. */
    public String escribirSeguro(String text) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return "sin ventana";
        AccessibilityNodeInfo f = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
        if (f == null || !f.isEditable()) {
            java.util.List<AccessibilityNodeInfo> todos = new java.util.ArrayList<>();
            juntar(root, todos, 0);
            f = null;
            for (AccessibilityNodeInfo n : todos) if (n.isEditable() && n.isVisibleToUser()) { f = n; break; }
        }
        if (f == null) return "no hay campo de texto";
        if (f.isPassword()) return "es un campo de clave: no escribo ahi";
        f.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
        Bundle args = new Bundle();
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text == null ? "" : text);
        return f.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args) ? "ok" : "la app no acepto el texto";
    }

    /** atras | inicio | recientes | notificaciones */
    public boolean global(String accion) {
        int a;
        switch (accion == null ? "" : accion) {
            case "atras": a = GLOBAL_ACTION_BACK; break;
            case "inicio": a = GLOBAL_ACTION_HOME; break;
            case "recientes": a = GLOBAL_ACTION_RECENTS; break;
            case "notificaciones": a = GLOBAL_ACTION_NOTIFICATIONS; break;
            default: return false;
        }
        return performGlobalAction(a);
    }

    /** Desplaza el primer elemento desplazable (abajo = adelante). */
    public boolean desplazar(boolean abajo) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        java.util.List<AccessibilityNodeInfo> todos = new java.util.ArrayList<>();
        juntar(root, todos, 0);
        for (AccessibilityNodeInfo n : todos) {
            if (n.isScrollable() && n.isVisibleToUser()
                    && n.performAction(abajo ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) return true;
        }
        return false;
    }
}
