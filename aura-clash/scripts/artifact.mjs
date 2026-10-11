// Crée release/aura-clash-artifact.html : la version « page web » du jeu, publiable comme artefact
// (et jouable sur iPad : écran tactile, clavier ou manette). Pas de réseau local dans cette version.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const css = readFileSync(join(dist, 'style.css'), 'utf8');
const js = readFileSync(join(dist, 'game.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const page = `<title>Aura Clash</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&display=swap">
<style>
${css}
</style>
<canvas id="game"></canvas>
<div id="overlay"></div>
<div id="ui"></div>
<div id="fatal"><div><h1>Impossible de démarrer</h1><pre></pre></div></div>
<script>window.AURA_WEB_ONLY = true;</script>
<script>
${js}
</script>
`;
mkdirSync(join(root, 'release'), { recursive: true });
writeFileSync(join(root, 'release', 'aura-clash-artifact.html'), page);
console.log(`Artefact prêt : release/aura-clash-artifact.html (${(Buffer.byteLength(page) / 1024).toFixed(0)} Ko)`);
