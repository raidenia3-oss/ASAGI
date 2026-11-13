import { cpSync, mkdirSync, rmSync } from 'node:fs';

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

console.log('Web estática compilada en dist/');
