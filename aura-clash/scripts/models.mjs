// Prépare les modèles 3D animés (Mixamo) pour le jeu.
//
// Sources (non versionnées, voir .gitignore) :
//   src/assets/models/<id>/<id>.fbx|.glb   le personnage, en T-pose, avec sa peau
//   src/assets/models/anims/<clip>.fbx|.glb   une animation (« Without Skin »), partagée par tous
// Sorties (versionnées, embarquées dans le build) :
//   src/assets/models/<id>/<id>.glb           personnage optimisé (textures réduites, meshopt)
//   src/assets/models/anims/anims.glb         toutes les animations, compressées
//   src/assets/models/index.js                liste des modèles disponibles (importée par le jeu)
//
// Usage : node scripts/models.mjs [--tex 1024]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, weld, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src', 'assets', 'models');
const ANIM_DIR = join(dir, 'anims');
const texArg = process.argv.indexOf('--tex');
const TEX = texArg > 0 ? Number(process.argv[texArg + 1]) : 1024;

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// Exécutable FBX2glTF fourni par le paquet npm « fbx2gltf » (Windows, Linux, macOS)
const fbx2gltf = join(dirname(createRequire(import.meta.url).resolve('fbx2gltf/package.json')), 'bin',
  process.platform === 'win32' ? 'Windows_NT' : process.platform === 'darwin' ? 'Darwin' : 'Linux',
  process.platform === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF');
const tmp = mkdtempSync(join(tmpdir(), 'aura-models-'));
const kb = (n) => `${(n / 1024).toFixed(0)} Ko`;

/** Lit une source .fbx (convertie en .glb par FBX2glTF) ou .glb. */
async function readSource(file) {
  if (extname(file).toLowerCase() === '.glb') return io.read(file);
  const out = join(tmp, basename(file, extname(file)) + '.glb');
  execFileSync(fbx2gltf, ['--binary', '--input', file, '--output', out.slice(0, -4)], { stdio: 'pipe' });
  return io.read(out);
}

/** « mixamorig:Hips », « mixamorig1:Hips » ou « mixamorigHips » → « Hips ». */
function cleanBoneNames(doc) {
  for (const n of doc.getRoot().listNodes()) n.setName(n.getName().replace(/^mixamorig\d*[:_]?/, ''));
}

async function buildCharacter(id) {
  const folder = join(dir, id);
  // Le .glb de sortie porte le même nom que la source : on ne convertit que s'il y a un .fbx
  const src = [join(folder, id + '.fbx'), join(folder, id + '.FBX'), join(folder, id + '.src.glb')].find(existsSync);
  if (!src) return existsSync(join(folder, id + '.glb'));
  const doc = await readSource(src);
  cleanBoneNames(doc);
  for (const a of doc.getRoot().listAnimations()) a.dispose(); // les animations viennent de anims.glb
  await doc.transform(
    weld(),
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEX, TEX], quality: 82 }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const out = join(folder, id + '.glb');
  await io.write(out, doc);
  console.log(`  ${id} : ${kb(statSync(out).size)}`);
  return true;
}

async function buildAnims() {
  if (!existsSync(ANIM_DIR)) return [];
  const files = readdirSync(ANIM_DIR).filter((f) => /\.(fbx|glb)$/i.test(f) && f !== 'anims.glb');
  if (!files.length) return existsSync(join(ANIM_DIR, 'anims.glb')) ? ['(déjà prêtes)'] : [];
  const out = new (await import('@gltf-transform/core')).Document();
  out.createBuffer();
  const names = [];
  for (const f of files.sort()) {
    const name = basename(f, extname(f));
    const doc = await readSource(join(ANIM_DIR, f));
    cleanBoneNames(doc);
    const anims = doc.getRoot().listAnimations().filter((a) => a.listChannels().length);
    if (!anims.length) { console.warn(`  ${f} : aucune animation, ignoré`); continue; }
    // On ne garde que les rotations (+ la translation du bassin) : les proportions des personnages diffèrent
    const a = anims[0];
    for (const ch of a.listChannels()) {
      const path = ch.getTargetPath();
      const node = ch.getTargetNode();
      if (path === 'rotation' || (path === 'translation' && node && node.getName() === 'Hips')) continue;
      ch.getSampler().dispose();
      ch.dispose();
    }
    a.setName(name);
    for (const m of doc.getRoot().listMeshes()) m.dispose();
    for (const s of doc.getRoot().listSkins()) s.dispose();
    for (const t of doc.getRoot().listTextures()) t.dispose();
    for (const m of doc.getRoot().listMaterials()) m.dispose();
    const { mergeDocuments, unpartition } = await import('@gltf-transform/functions');
    mergeDocuments(out, doc);
    await out.transform(unpartition());
    names.push(name);
  }
  await out.transform(
    resample({ tolerance: 1e-4 }),
    dedup(),
    prune({ keepLeaves: true }),
    quantize({ quantizeAnimation: 12 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const file = join(ANIM_DIR, 'anims.glb');
  await io.write(file, out);
  console.log(`  animations (${names.length}) : ${kb(statSync(file).size)}`);
  return names;
}

console.log('Préparation des modèles…');
const anims = await buildAnims();
const ids = existsSync(dir)
  ? readdirSync(dir).filter((d) => d !== 'anims' && statSync(join(dir, d)).isDirectory())
  : [];
const ready = [];
for (const id of ids.sort()) if (await buildCharacter(id)) ready.push(id);
rmSync(tmp, { recursive: true, force: true });

// Index importé par le jeu : esbuild intègre chaque .glb au bundle (chargeur « binary »)
const hasAnims = existsSync(join(ANIM_DIR, 'anims.glb'));
const lines = [
  '// Généré par scripts/models.mjs : ne pas modifier à la main.',
  ...(hasAnims ? ["import anims from './anims/anims.glb';"] : []),
  ...ready.map((id) => `import ${id} from './${id}/${id}.glb';`),
  '',
  `export const ANIMS_GLB = ${hasAnims ? 'anims' : 'null'};`,
  `export const MODEL_GLB = {${ready.length ? ` ${ready.join(', ')} ` : ''}};`,
  '',
];
writeFileSync(join(dir, 'index.js'), lines.join('\n'));
console.log(`Modèles prêts : ${ready.join(', ') || 'aucun'} · animations : ${anims.length ? 'oui' : 'non'}`);
