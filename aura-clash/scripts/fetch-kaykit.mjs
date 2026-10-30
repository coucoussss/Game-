// Télécharge les personnages libres KayKit « Adventurers » (CC0, Kay Lousberg) dans models-src/kaykit/,
// à une version figée. Ce sont les sources de scripts/models.mjs ; seuls les .glb optimisés sont versionnés.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'models-src', 'kaykit');
const REPO = 'https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0';
const COMMIT = '672074b73ba276876a19e8816ecdc5241817ab47';
const FILES = ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded'];

mkdirSync(out, { recursive: true });
for (const name of FILES) {
  const file = join(out, `${name}.glb`);
  if (existsSync(file)) continue;
  const res = await fetch(`${REPO}/${COMMIT}/addons/kaykit_character_pack_adventures/Characters/gltf/${name}.glb`);
  if (!res.ok) throw new Error(`Téléchargement de ${name} impossible (${res.status})`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`  ${name}.glb`);
}
console.log('KayKit prêt dans models-src/kaykit/');
