import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const files = [
  'index.html',
  'brain-router.js',
  'asagi-browser.js',
  'asagi-apps.js',
  'sync-memoria.js',
  'enlace.js',
  'personalidad.js',
  'razonamiento.js',
  'noticias.js',
  'memoria.js',
  'rea.js',
  'voz.js',
  'ads.js',
  'launcher.js',
  'bots.js',
  'wallpaper.js',
  'defensa.js',
  'gestures.js',
  'palette.js',
  'conocimiento.js',
  'enjambre.js',
  'foto-ia.js',
  'monitor.js',
  'recon.js',
  'retro.js',
  'ui-fx.js',
  'avatar.js',
  'dictado.js',
  'pendientes.js',
  'notificar.js',
  'enlace-adb.js',
  'herramientas.js',
  'bandeja.js',
  'enlace-lan.js',
  'actualizador.js',
  'niveles.js',
  'manos.js',
  'vistas.js',
  'estudia.js',
  'citas.js',
  'personajes.js',
  'sin-cerebro.js',
  'navegador-lector.js',
  'navegador.js',
  'openverse.js',
  'wiki.js',
  'notificaciones.js',
  'habilidades.js',
  'musica.js',
  'resumen-dia.js',
  'compras.js',
  'sobre-mi.js',
  'calculos.js',
  'gemini-guia.js',
  'memoria-ia.js',
  'buscar-mis-cosas.js',
  'conversacion.js',
  'rutinas.js',
  'escudo.js',
  'chrome.js',
  'youtube.js',
  'redes.js',
  'compartir.js',
  'precios.js',
  'vigia-web.js',
  'explorar.js',
  'efectos.js',
  'centro.js',
  'entrevista.js',
  'instintos.js',
  'traspaso.js',
  'aprende.js',
  'iniciativa.js',
  'creador.js',
  'recetas.js',
  'editor.js',
  'ojos.js',
  'tipeo.js',
  'agente.js',
  'agente-codigo.js',
  'utiles.js',
  'piensa.js',
  'discord.js',
  'app.js',
  'styles.css',
  'tema-asagi.css',
  'sw.js',
  'manifest.webmanifest'
];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

for (const file of files) {
  cpSync(file, `dist/${file}`);
}
cpSync('assets', 'dist/assets', { recursive: true });
cpSync('personajes', 'dist/personajes', { recursive: true });   // personajes de los que aprende (JSON)

// El módulo se carga en todos los despliegues construidos (PWA y Capacitor), justo
// antes de app.js para que su interfaz quede lista cuando el resto de ASAGI arranque.
const indexPath = 'dist/index.html';
const index = readFileSync(indexPath, 'utf8');
if (!index.includes('<script src="agente-codigo.js"></script>')) {
  const anchor = '<script src="./app.js"></script>';
  if (!index.includes(anchor)) throw new Error('No encontré el punto de entrada app.js en index.html');
  writeFileSync(indexPath, index.replace(anchor, '<script src="agente-codigo.js"></script>\n    ' + anchor));
}

console.log('Web estática compilada en dist/');
