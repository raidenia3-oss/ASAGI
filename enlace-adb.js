;(function () {
  'use strict';

  // ASAGI - Enlace con ARIA por cable USB (adb-carpeta).
  // Lee/escribe /sdcard/Android/data/com.asagi.brain/files/enlace/
  //   inbox.json  = mensajes de ARIA -> ASAGI (el plugin los lee y notifica)
  //   outbox.json = mensajes de ASAGI -> ARIA (el plugin los escribe)
  // Mismo formato de mensajes que enlace.py de ARIA:
  //   {id, de, ts, tipo, cuerpo}
  // Cifrado opcional: el canal es cable local USB.
  //
  // API expuesta: window.AsiEnlace = { enviar, recibir, estado, vinculado }

  const PLUGIN = window.Capacitor && window.Capacitor.Plugins
    ? window.Capacitor.Plugins.AsagiBrain : null;
  const YO = "asagi";
  const OTRO = "aria";
  const MAX_MSGS = 150;
  const MAX_EDAD_MS = 7 * 24 * 3600 * 1000;
  const POLL_MS = 8000;

  const LS_PROCESADOS = "asi_enlace_procesados";
  const LS_COLA = "asi_encola_cola";

  function ahoraMs() { return Date.now(); }

  function nuevoId(de, ts) {
    return de + "-" + ts + "-" + Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  }

  function leerLS(clave, defecto) {
    try { return JSON.parse(localStorage.getItem(clave) || JSON.stringify(defecto)); }
    catch (e) { return defecto; }
  }
  function guardarLS(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) {}
  }

  function vinculado() {
    return !!PLUGIN;
  }

  function cola() {
    return leerLS(LS_COLA, { msgs: [] });
  }
  function guardarCola(c) { guardarLS(LS_COLA, c); }

  function procesados() {
    return leerLS(LS_PROCESADOS, []);
  }
  function marcarProcesado(id) {
    const p = procesados();
    if (!p.includes(id)) p.push(id);
    guardarLS(LS_PROCESADOS, p.slice(-600));
  }

  // ---------- enviar: encola y escribe al outbox del celular ----------
  function enviar(texto, tipo) {
    texto = (texto || "").trim();
    if (!texto) return { ok: false, texto: "Falta el texto a enviar." };
    if (!vinculado()) {
      return { ok: false, texto: "Plugin AsagiBrain no disponible (app nativa no instalada)." };
    }
    const c = cola();
    const ts = ahoraMs();
    const msg = { id: nuevoId(YO, ts), de: YO, ts: ts, tipo: tipo, cuerpo: texto };
    c.msgs = (c.msgs || []).concat([msg]).slice(-MAX_MSGS);
    guardarCola(c);
    return flush().then(function () {
      const que = tipo === "pendiente" ? "Pendiente enviado a la PC" : "Nota enviada a la PC";
      return { ok: true, texto: que + "." };
    }).catch(function (e) {
      return { ok: false, texto: "Guardado en cola; saldra al sincronizar. " + String(e) };
    });
  }

  function flush() {
    if (!vinculado()) return Promise.resolve();
    const c = cola();
    const pendientes = c.msgs || [];
    if (pendientes.length === 0) return Promise.resolve();
    return PLUGIN.enlaceEscribir({ msgs: pendientes }).then(function () {
      c.msgs = [];
      guardarCola(c);
    });
  }

  // ---------- recibir: lee inbox del telefono ----------
  function recibir() {
    if (!vinculado()) {
      return Promise.resolve({ ok: false, texto: "Plugin AsagiBrain no disponible." });
    }
    return PLUGIN.enlaceLeer({}).then(function (res) {
      const msgs = (res && res.msgs) || [];
      const proc = procesados();
      const nuevos = [];
      for (const m of msgs) {
        if (m.de !== YO && m.id && !proc.includes(m.id)) {
          nuevos.push({
            id: m.id,
            de: m.de || OTRO,
            ts: parseInt(m.ts, 10) || 0,
            tipo: m.tipo || "nota",
            cuerpo: m.cuerpo || "",
          });
          marcarProcesado(m.id);
        }
      }
      nuevos.sort(function (a, b) { return a.ts - b.ts; });
      const texto = nuevos.length
        ? "De ARIA:\n" + nuevos.map(function (n) {
            const marca = n.tipo === "pendiente" ? "pendiente" : "nota";
            return "- [" + marca + "] " + n.cuerpo;
          }).join("\n")
        : "Nada nuevo de ARIA.";
      return { ok: true, nuevos: nuevos, texto: texto };
    }).catch(function (e) {
      return { ok: false, texto: "No pude leer el enlace: " + String(e) };
    });
  }

  // ---------- estado ----------
  function estado() {
    if (!vinculado()) {
      return Promise.resolve({ ok: true, vinculada: false,
        texto: "App nativa ASAGI no instalada o plugin no disponible." });
    }
    return recibir().then(function (r) {
      return { ok: true, vinculada: true, texto: r.texto };
    });
  }

  // ---------- poll periodico ----------
  let pollTimer = null;
  function iniciarPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      recibir().catch(function () {});
    }, POLL_MS);
  }
  function detenerPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // Escuchar eventos "enlace-nuevos" del plugin nativo (cuando llega inbox por push del PC)
  if (PLUGIN && typeof PLUGIN.addListener === "function") {
    PLUGIN.addListener("enlace-nuevos", function (data) {
      const msgs = (data && data.msgs) || [];
      const proc = procesados();
      const nuevos = [];
      for (const m of msgs) {
        if (m.de !== YO && m.id && !proc.includes(m.id)) {
          nuevos.push({
            id: m.id, de: m.de || OTRO,
            ts: parseInt(m.ts, 10) || 0,
            tipo: m.tipo || "nota", cuerpo: m.cuerpo || "",
          });
          marcarProcesado(m.id);
        }
      }
      if (nuevos.length) {
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
          window.dispatchEvent(new CustomEvent("asi-enlace-nuevos", { detail: { nuevos: nuevos } }));
        }
      }
    });
  }

  // Auto-iniciar poll si hay plugin
  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      if (vinculado()) iniciarPoll();
    });
  }

  window.AsiEnlace = {
    enviar: enviar,
    recibir: recibir,
    estado: estado,
    vinculado: vinculado,
    iniciarPoll: iniciarPoll,
    detenerPoll: detenerPoll,
    VERSION: 1,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = window.AsiEnlace;
  }

})();
