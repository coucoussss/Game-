// Crée la version CrazyGames : release/crazygames/index.html (jeu en un seul fichier, SDK CrazyGames,
// code obfusqué, pas de réseau local) et release/AuraClash-crazygames.zip à envoyer sur le portail.
// À lancer après « npm run html » (c'est ce que fait « npm run crazygames »).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JO from 'javascript-obfuscator';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let html = readFileSync(join(root, 'release', 'AuraClash.html'), 'utf8');
const m = html.match(/<script>\n([\s\S]*)\n<\/script>/);
if (!m) throw new Error('Script du jeu introuvable dans release/AuraClash.html');
const js = m[1].replace(/<\\\/script/gi, '</script');
// Obfuscation légère : noms et textes brouillés, sans ralentir le jeu
const obf = JO.obfuscate(js, {
  compact: true, simplify: true, target: 'browser', identifierNamesGenerator: 'hexadecimal', renameGlobals: false,
  stringArray: true, stringArrayEncoding: [], stringArrayThreshold: 0.5, stringArrayRotate: true, stringArrayShuffle: true,
  splitStrings: false, controlFlowFlattening: false, deadCodeInjection: false, selfDefending: false,
  numbersToExpressions: false, transformObjectKeys: false, unicodeEscapeSequence: false,
}).getObfuscatedCode().replace(/<\/script/gi, '<\\/script');
const head = `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
<script>window.AURA_PLATFORM = 'crazygames'; window.AURA_WEB_ONLY = true;</script>`;
html = html.slice(0, m.index) + `${head}\n<script>\n${obf}\n</script>` + html.slice(m.index + m[0].length);
mkdirSync(join(root, 'release', 'crazygames'), { recursive: true });
writeFileSync(join(root, 'release', 'crazygames', 'index.html'), html);
console.log(`Version CrazyGames prête : release/crazygames/index.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} Ko)`);
