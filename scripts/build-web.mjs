import { cpSync, mkdirSync, rmSync } from 'node:fs';

const files = [
  'index.html',
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
