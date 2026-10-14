// Crée release/AuraClash.html : tout le jeu dans un seul fichier HTML (≈ 750 Ko), qui s'ouvre
// dans Chrome, Edge ou Firefox par un double-clic. Aucune installation, aucun droit administrateur.
// Limite : un navigateur ne peut pas ouvrir de serveur, donc pas de « Créer une partie » LAN
// (mais « Rejoindre » une partie hébergée par le .exe fonctionne).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const css = readFileSync(join(dist, 'style.css'), 'utf8');
const js = readFileSync(join(dist, 'game.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
html = html
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/, '') // la CSP interdirait le script en ligne
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script src="game.js"></script>', () => `<script>\n${js}\n</script>`);
mkdirSync(join(root, 'release'), { recursive: true });
writeFileSync(join(root, 'release', 'AuraClash.html'), html);
console.log(`Fichier unique prêt : release/AuraClash.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} Ko)`);
