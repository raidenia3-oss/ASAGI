import { cpSync, mkdirSync, rmSync } from 'node:fs';

const files = [
  'index.html',
  'brain-router.js',
  'asagi-browser.js',
  'asagi-apps.js',
  'sync-memoria.js',
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
  'app.js',
  'styles.css',
  'sw.js',
  'manifest.webmanifest'
];

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

for (const file of files) {
  cpSync(file, `dist/${file}`);
}
cpSync('assets', 'dist/assets', { recursive: true });

console.log('Web estática compilada en dist/');
