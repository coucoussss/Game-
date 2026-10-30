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
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
const SRC_DIR = join(root, 'models-src');
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

// Noms d'os des autres squelettes courants (KayKit, Blender « rigify » simplifié) → noms Mixamo
const BONE_ALIASES = {
  hips: 'Hips', spine: 'Spine', chest: 'Spine2', neck: 'Neck', head: 'Head',
  'upperarm.l': 'LeftArm', 'lowerarm.l': 'LeftForeArm', 'hand.l': 'LeftHand',
  'upperarm.r': 'RightArm', 'lowerarm.r': 'RightForeArm', 'hand.r': 'RightHand',
  'upperleg.l': 'LeftUpLeg', 'lowerleg.l': 'LeftLeg', 'foot.l': 'LeftFoot', 'toes.l': 'LeftToeBase',
  'upperleg.r': 'RightUpLeg', 'lowerleg.r': 'RightLeg', 'foot.r': 'RightFoot', 'toes.r': 'RightToeBase',
};

/** « mixamorig:Hips », « mixamorig1:Hips », « mixamorigHips » ou « hips » → « Hips ». */
function cleanBoneNames(doc) {
  for (const n of doc.getRoot().listNodes()) {
    const name = n.getName().replace(/^mixamorig\d*[:_]?/, '');
    n.setName(BONE_ALIASES[name] || name);
  }
}

/** Supprime une animation avec ses canaux et échantillonneurs (sinon leurs données restent dans le fichier). */
function disposeAnimation(a) {
  for (const ch of a.listChannels()) ch.dispose();
  for (const smp of a.listSamplers()) smp.dispose();
  a.dispose();
}

/**
 * Réglages facultatifs d'un dossier (config.json) :
 *   source  modèle source, relatif à models-src/ (voir scripts/fetch-kaykit.mjs)
 *   remove  noms des nœuds à supprimer (armes et accessoires d'origine)
 */
function configOf(folder) {
  const f = join(folder, 'config.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
}

async function buildCharacter(id) {
  const folder = join(dir, id);
  // Le .glb de sortie porte le même nom que la source : on ne convertit que s'il y a un .fbx
  const cfg = configOf(folder);
  const src = [cfg.source && join(SRC_DIR, cfg.source), join(folder, id + '.fbx'), join(folder, id + '.FBX'), join(folder, id + '.src.glb')]
    .filter(Boolean).find(existsSync);
  if (!src) return existsSync(join(folder, id + '.glb'));
  const doc = await readSource(src);
  cleanBoneNames(doc);
  for (const a of doc.getRoot().listAnimations()) disposeAnimation(a); // les animations viennent de anims.glb
  // Pièces inutiles (armes et boucliers d'origine : le jeu accroche les siennes)
  const { remove = [] } = cfg;
  for (const n of doc.getRoot().listNodes()) {
    if (!remove.includes(n.getName())) continue;
    n.traverse((c) => { const m = c.getMesh(); if (m) m.dispose(); });
    n.dispose();
  }
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
  const cfg = configOf(ANIM_DIR);
  const files = [
    ...(cfg.sources || []).map((f) => join(SRC_DIR, f)).filter(existsSync),
    ...readdirSync(ANIM_DIR).filter((f) => /\.(fbx|glb)$/i.test(f) && f !== 'anims.glb').map((f) => join(ANIM_DIR, f)),
  ];
  if (!files.length) return existsSync(join(ANIM_DIR, 'anims.glb')) ? ['(déjà prêtes)'] : [];
  const out = new (await import('@gltf-transform/core')).Document();
  out.createBuffer();
  // clips.json : { "<nom dans le jeu>": "<nom du clip dans une bibliothèque .glb>" } ; sinon un clip par fichier
  const map = existsSync(join(ANIM_DIR, 'clips.json')) ? JSON.parse(readFileSync(join(ANIM_DIR, 'clips.json'), 'utf8')) : null;
  const names = [];
  for (const f of files) {
    const doc = await readSource(f);
    cleanBoneNames(doc);
    const anims = doc.getRoot().listAnimations().filter((a) => a.listChannels().length);
    if (!anims.length) { console.warn(`  ${f} : aucune animation, ignoré`); continue; }
    const kept = [];
    for (const a of anims) {
      const ours = map ? Object.keys(map).filter((k) => map[k] === a.getName()) : [];
      if (map && ours.length) { a.setName(ours[0]); kept.push(a); } else if (!map && a === anims[0]) { a.setName(basename(f, extname(f))); kept.push(a); } else disposeAnimation(a);
      // Un même clip sous plusieurs noms : copie des canaux
      for (const extra of ours.slice(1)) {
        const c = doc.createAnimation(extra);
        for (const ch of a.listChannels()) {
          const smp = doc.createAnimationSampler().setInput(ch.getSampler().getInput()).setOutput(ch.getSampler().getOutput()).setInterpolation(ch.getSampler().getInterpolation());
          c.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(ch.getTargetNode()).setTargetPath(ch.getTargetPath()).setSampler(smp));
        }
        kept.push(c);
      }
    }
    // On ne garde que les rotations (+ la translation du bassin) : les proportions des personnages diffèrent
    for (const a of kept) {
      for (const ch of a.listChannels()) {
        const path = ch.getTargetPath();
        const node = ch.getTargetNode();
        if (path === 'rotation' || (path === 'translation' && node && node.getName() === 'Hips')) continue;
        ch.getSampler().dispose();
        ch.dispose();
      }
      names.push(a.getName());
    }
    for (const m of doc.getRoot().listMeshes()) m.dispose();
    for (const s of doc.getRoot().listSkins()) s.dispose();
    for (const t of doc.getRoot().listTextures()) t.dispose();
    for (const m of doc.getRoot().listMaterials()) m.dispose();
    const { mergeDocuments, unpartition } = await import('@gltf-transform/functions');
    mergeDocuments(out, doc);
    await out.transform(unpartition());
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
