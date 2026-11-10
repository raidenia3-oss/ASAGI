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
}
