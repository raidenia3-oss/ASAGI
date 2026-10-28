package com.asagi.app;

import android.os.Bundle;

import com.asagi.brain.AsagiBrainPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // El plugin local no se instala por npm, así que Capacitor no lo
        // descubre solo (capacitor.plugins.json queda vacío): se registra a
        // mano antes de crear el bridge. Así la app web lo ve en
        // window.Capacitor.Plugins.AsagiBrain.
        registerPlugin(AsagiBrainPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
