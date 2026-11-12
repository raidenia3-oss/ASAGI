package com.asagi.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.asagi.brain.AsagiBrainPlugin;
import com.asagi.brain.AsagiControlPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Color "noche" del tema: lo que se ve detrás de la barra de estado y de los botones del celular. */
    private static final int NOCHE = 0xFF050B0D;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // El plugin local no se instala por npm, así que Capacitor no lo
        // descubre solo (capacitor.plugins.json queda vacío): se registra a
        // mano antes de crear el bridge. Así la app web lo ve en
        // window.Capacitor.Plugins.AsagiBrain.
        registerPlugin(AsagiBrainPlugin.class);
        registerPlugin(AsagiControlPlugin.class);
        super.onCreate(savedInstanceState);
        ajustarABarrasDelSistema();
    }

    /**
     * Android 15/16 dibuja las apps "de borde a borde": sin esto, el reloj quedaba debajo de la
     * barra de estado y el chat debajo de los botones del celular (y del teclado).
     * La app se encarga de los márgenes en TODAS las versiones (igual en el HONOR con Android 16
     * que en el emulador): la WebView se aparta de la barra de estado, del recorte de la cámara,
     * de los botones/gesto de navegación y del teclado cuando está abierto.
     */
    private void ajustarABarrasDelSistema() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().getDecorView().setBackgroundColor(NOCHE);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        WindowInsetsControllerCompat ctl = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        ctl.setAppearanceLightStatusBars(false);       // iconos claros sobre fondo oscuro
        ctl.setAppearanceLightNavigationBars(false);

        final WebView wv = getBridge() != null ? getBridge().getWebView() : null;
        if (wv == null) return;
        wv.setBackgroundColor(NOCHE);
        ViewCompat.setOnApplyWindowInsetsListener(wv, (v, w) -> {
            Insets barras = w.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets teclado = w.getInsets(WindowInsetsCompat.Type.ime());
            ViewGroup.MarginLayoutParams mlp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
            mlp.leftMargin = barras.left;
            mlp.topMargin = barras.top;
            mlp.rightMargin = barras.right;
            mlp.bottomMargin = Math.max(barras.bottom, teclado.bottom);
            v.setLayoutParams(mlp);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(wv);
    }
}
