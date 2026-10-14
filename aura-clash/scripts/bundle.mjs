// Assemble le jeu (src/) en un seul fichier dist/game.js avec esbuild, et copie la page HTML.
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
copyFileSync(join(root, 'src', 'index.html'), join(dist, 'index.html'));
copyFileSync(join(root, 'src', 'style.css'), join(dist, 'style.css'));

const options = {
  entryPoints: [join(root, 'src', 'main.js')],
  outfile: join(dist, 'game.js'),
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  loader: { '.mp3': 'dataurl' }, // la musique de combat est intégrée au jeu
  logLevel: 'info',
};

await build(options);
console.log('Bundle prêt : dist/game.js');
