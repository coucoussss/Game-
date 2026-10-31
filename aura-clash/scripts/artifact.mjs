// Crée la version « page web » du jeu, publiable comme artefact (jouable sur iPad : tactile,
// clavier ou manette) : release/artifact/index.html + game.js (le code du jeu, en fichier à part).
// Pas de réseau local dans cette version.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = join(root, 'release', 'artifact');
const css = readFileSync(join(dist, 'style.css'), 'utf8');
const page = `<title>Aura Clash</title>
<style>
${css}
</style>
<canvas id="game"></canvas>
<div id="overlay"></div>
<div id="ui"></div>
<div id="fatal"><div><h1>Impossible de démarrer</h1><pre></pre></div></div>
<script>window.AURA_WEB_ONLY = true;</script>
<script src="game.js"></script>
`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), page);
copyFileSync(join(dist, 'game.js'), join(out, 'game.js'));
console.log('Artefact prêt : release/artifact/index.html + game.js');
