// WorkManager nativo (Java plugin) para ASAGI: vigía/YouTube/Musa en background
// Se usa via window.AsagiWorkManager (expone startVigilante, startYouTube, startMusa, estado, ejecutarAhora)
// Los workers disparan eventos 'workEvent' que se escuchan con addListener
(function () {
    'use strict';
    var P = function () {
        var cap = window.Capacitor && window.Capacitor.Plugins;
        return cap && cap.AsagiWorkManager;
    };

    if (!P()) return;

    var plugin = P();

    // API pública
    window.AsagiWorkManager = {
        // Vigilante: revisa páginas cada 3h (requiere red)
        startVigilante: function (enable) {
            return plugin.startVigilante({ enable: enable !== false });
        },
        // YouTube: busca videos nuevos cada 6h (requiere red)
        startYouTube: function (enable) {
            return plugin.startYouTube({ enable: enable !== false });
        },
        // Musa: tareas música background (cache, sync) cada 12h
        startMusa: function (enable) {
            return plugin.startMusa({ enable: enable !== false });
        },
        // Estado actual
        estado: function () {
            return plugin.estado({});
        },
        // Ejecutar worker ahora (one-shot)
        ejecutarAhora: function (worker) {
            return plugin.ejecutarAhora({ worker: worker });
        },
        // Listener para eventos de los workers
        addListener: function (callback) {
            return plugin.addListener('workEvent', callback);
        }
    };

    // Auto-arranque si estaban activos (persistido en SharedPreferences)
    plugin.estado({}).then(function (r) {
        if (r.vigilante) window.AsagiWorkManager.startVigilante(true);
        if (r.youtube) window.AsagiWorkManager.startYouTube(true);
        if (r.musa) window.AsagiWorkManager.startMusa(true);
    }).catch(function () {});
})();