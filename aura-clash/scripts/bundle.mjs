// Assemble le jeu (src/) en un seul fichier dist/game.js avec esbuild, et copie la page HTML.
import { build } from 'esbuild';
import { mkdirSync, copyFileSync, rmSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');

/**
 * Règles @font-face en data: URL. Pour la police de titre, on ne garde que les tranches Unicode
 * réellement utilisées par le jeu (latin + les kanji et kana des textes), pour rester léger.
 */
function fontFaces() {
  const fs = join(root, 'node_modules', '@fontsource');
  const used = new Set();
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(f)) for (const ch of readFileSync(p, 'utf8')) used.add(ch.codePointAt(0));
    }
  };
  walk(join(root, 'src'));
  const inRange = (range) => range.split(',').some((r) => {
    const [a, b] = r.trim().replace(/^U\+/i, '').split('-').map((x) => parseInt(x.replace(/\?/g, '0'), 16));
    const hi = b ?? (r.includes('?') ? parseInt(r.trim().slice(2).replace(/\?/g, 'f'), 16) : a);
    for (const c of used) if (c >= a && c <= hi) return true;
    return false;
  });
  let css = '';
  const add = (pkg, weights) => {
    for (const w of weights) {
      const src = readFileSync(join(fs, pkg, `${w}.css`), 'utf8');
      for (const block of src.split('@font-face').slice(1)) {
        const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1];
        const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
        if (!file || (range && !inRange(range))) continue;
        const family = /font-family:\s*([^;]+);/.exec(block)[1];
        const data = readFileSync(join(fs, pkg, 'files', file)).toString('base64');
        css += `@font-face{font-family:${family};font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${data}) format('woff2');unicode-range:${range}}\n`;
      }
    }
  };
  add('dela-gothic-one', [400]);
  add('nunito', [600, 800]);
  return css;
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
copyFileSync(join(root, 'src', 'index.html'), join(dist, 'index.html'));
// Feuille de style, précédée des polices intégrées (Dela Gothic One pour les titres, Nunito pour le texte)
writeFileSync(join(dist, 'style.css'), fontFaces() + readFileSync(join(root, 'src', 'style.css'), 'utf8'));

const options = {
  entryPoints: [join(root, 'src', 'main.js')],
  outfile: join(dist, 'game.js'),
  bundle: true,
  format: 'iife',
  target: 'es2022',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  loader: { '.mp3': 'dataurl', '.glb': 'binary' }, // musique de combat et modèles 3D intégrés au jeu
  logLevel: 'info',
};

await build(options);
console.log('Bundle prêt : dist/game.js');
