// Paquets web pour les portails : CrazyGames (SDK v3 dans le <head>) et Newgrounds.
// Usage : node scripts/bundle.mjs && node scripts/platform-zips.mjs
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const html = (await readFile(join(dist, 'index.html'), 'utf8'))
  .replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '');

const targets = {
  'crazygames-v2': {
    zip: 'AuraClash-crazygames-v2.zip',
    head: '  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n  <script>window.AURA_PLATFORM = \'crazygames\'; window.AURA_WEB_ONLY = true;</script>\n',
  },
  newgrounds: {
    zip: 'AuraClash-newgrounds.zip',
    head: '  <script>window.AURA_PLATFORM = \'newgrounds\'; window.AURA_WEB_ONLY = true;</script>\n',
  },
};

for (const [name, t] of Object.entries(targets)) {
  const out = join(root, 'release', name);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  if (!html.includes('</head>')) throw new Error('index.html sans <head>');
  await writeFile(join(out, 'index.html'), html.replace('</head>', `${t.head}</head>`));
  for (const f of ['game.js', 'style.css']) await copyFile(join(dist, f), join(out, f));
  const zip = join(root, 'release', t.zip);
  await rm(zip, { force: true });
  execFileSync('zip', ['-q', '-j', zip, 'index.html', 'game.js', 'style.css'].map((f, i) => (i < 3 ? f : join(out, f))), { cwd: out });
  console.log(`Paquet prêt : release/${t.zip}`);
}
