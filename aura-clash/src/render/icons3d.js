// Miniatures 3D des récompenses, rendues une fois puis gardées en cache (images) :
//   - skins : un combattant vêtu du skin, en buste, avec son aura ;
//   - objets : pièces de Ryō (petite pile, gros tas), étoile d'XP, éclair de boost, parchemin de titre,
//     cristal de fragments, coffre mystère.
import * as THREE from 'three';
import { CharacterModel } from './model.js';
import { CHAR_BY_ID } from '../game/characters.js';
import { dressed, SKINS } from '../game/techniques.js';
import { setupRenderer, makeScene } from './chest3d.js';

const cache = new Map();
let failed = false;

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Face d'une pièce : bord en relief et kanji 両 gravé. */
function coinFace() {
  return canvasTex(256, (g, s) => {
    const grd = g.createRadialGradient(s * 0.4, s * 0.35, 10, s / 2, s / 2, s / 2);
    grd.addColorStop(0, '#fff3b0'); grd.addColorStop(0.6, '#f0b830'); grd.addColorStop(1, '#a8700c');
    g.fillStyle = grd;
    g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a5a08'; g.lineWidth = 14;
    g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 16, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#9a6408';
    g.font = `900 ${s * 0.5}px serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('両', s / 2, s / 2 + 6);
  });
}

function star(outer, inner, n = 5) {
  const sh = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i) sh.lineTo(x, y); else sh.moveTo(x, y);
  }
  sh.closePath();
  return sh;
}

function bolt() {
  const sh = new THREE.Shape();
  const pts = [[0.1, 1], [-0.45, -0.05], [-0.05, -0.05], [-0.2, -1], [0.45, 0.15], [0.05, 0.15], [0.3, 1]];
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  return sh;
}

/** Objets décoratifs (une scène chacun). */
function buildObject(kind) {
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd060', metalness: 1, roughness: 0.22 });
  const face = new THREE.MeshStandardMaterial({ map: coinFace(), metalness: 0.9, roughness: 0.3 });
  const coin = (x, y, z, rx = 0, rz = 0) => {
    const c = add(new THREE.CylinderGeometry(0.42, 0.42, 0.09, 40), [gold, face, face], x, y, z);
    c.rotation.set(rx, 0, rz);
    return c;
  };
  switch (kind) {
    case 'ryo': {
      for (let i = 0; i < 5; i++) coin(0.05 * Math.sin(i * 2), -0.5 + i * 0.1, 0.04 * Math.cos(i * 3));
      coin(0.55, -0.45, 0.25, 0.1, 0.3);
      const top = coin(-0.15, 0.25, 0.1, 1.15, 0.2);
      top.rotation.y = 0.4;
      break;
    }
    case 'ryoPile': {
      const rnd = (() => { let a = 7; return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; })();
      for (let i = 0; i < 26; i++) {
        const r = Math.sqrt(rnd()) * 0.9;
        const a = rnd() * Math.PI * 2;
        const h = 0.55 * (1 - r / 0.95);
        coin(Math.cos(a) * r, -0.55 + h + rnd() * 0.08, Math.sin(a) * r * 0.6, (rnd() - 0.5) * 1.4, (rnd() - 0.5) * 1.4);
      }
      for (let i = 0; i < 3; i++) coin(-0.6 + i * 0.6, -0.1 + (i % 2) * 0.25, 0.4, 1.3, (i - 1) * 0.5);
      break;
    }
    case 'xp': {
      const mat = new THREE.MeshStandardMaterial({ color: '#7fd0ff', metalness: 0.6, roughness: 0.2, emissive: '#1a6aff', emissiveIntensity: 0.6 });
      const s = add(new THREE.ExtrudeGeometry(star(0.95, 0.42), { depth: 0.25, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 4 }), mat, 0, 0, -0.12);
      s.rotation.y = -0.35;
      const ring = add(new THREE.TorusGeometry(1.05, 0.06, 12, 60), gold, 0, 0, -0.05);
      ring.rotation.y = -0.35;
      break;
    }
    case 'boost': {
      const mat = new THREE.MeshStandardMaterial({ color: '#ffe23a', metalness: 0.4, roughness: 0.25, emissive: '#ff9a00', emissiveIntensity: 0.9 });
      const b = add(new THREE.ExtrudeGeometry(bolt(), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 }), mat, 0, 0, -0.1);
      b.rotation.set(0, -0.4, -0.12);
      b.scale.setScalar(1.05);
      break;
    }
    case 'title': {
      const paper = new THREE.MeshStandardMaterial({ color: '#f2e2b8', roughness: 0.85, side: THREE.DoubleSide, map: canvasTex(256, (c, s) => {
        c.fillStyle = '#f2e2b8'; c.fillRect(0, 0, s, s);
        c.strokeStyle = '#a0141e'; c.lineWidth = 8; c.strokeRect(14, 14, s - 28, s - 28);
        c.fillStyle = '#2a1408'; c.font = `900 ${s * 0.42}px serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('名', s / 2, s / 2 + 6);
      }) });
      const sheet = add(new THREE.PlaneGeometry(1.1, 1.3, 1, 8), paper, 0, 0, 0);
      const pos = sheet.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getY(i) + 0.65) * 2.4) * 0.06);
      sheet.geometry.computeVertexNormals();
      const wood = new THREE.MeshStandardMaterial({ color: '#7a1414', roughness: 0.4, metalness: 0.2 });
      for (const y of [0.7, -0.7]) {
        const r = add(new THREE.CylinderGeometry(0.09, 0.09, 1.35, 20), wood, 0, y, 0.04);
        r.rotation.z = Math.PI / 2;
        for (const x of [-0.74, 0.74]) add(new THREE.SphereGeometry(0.11, 16, 12), gold, x, y, 0.04);
      }
      g.rotation.set(0.1, -0.35, 0.08);
      break;
    }
    case 'frag': {
      const mat = new THREE.MeshPhysicalMaterial({ color: '#c58cff', emissive: '#7a2aff', emissiveIntensity: 0.8, roughness: 0.05, clearcoat: 1, flatShading: true, transparent: true, opacity: 0.95 });
      const c = add(new THREE.OctahedronGeometry(0.6, 0), mat, 0, 0, 0);
      c.scale.set(0.65, 1.35, 0.65);
      c.rotation.y = 0.5;
      for (const [x, y, s] of [[-0.55, -0.55, 0.45], [0.55, -0.6, 0.38]]) {
        const k = add(new THREE.OctahedronGeometry(0.4, 0), mat, x, y, 0.1);
        k.scale.set(0.6 * s / 0.45, 1.2 * s / 0.45, 0.6 * s / 0.45);
        k.rotation.z = x * 0.6;
      }
      break;
    }
    default: break;
  }
  return g;
}

function renderObjects(renderer, canvas) {
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 0.35, 3.7);
  cam.lookAt(0, -0.05, 0);
  const styleOf = { ryo: 'legendary', ryoPile: 'legendary', xp: 'rare', boost: 'legendary', title: 'common', frag: 'epic' };
  for (const kind of Object.keys(styleOf)) {
    const scene = makeScene(renderer, styleOf[kind]);
    scene.add(buildObject(kind));
    renderer.render(scene, cam);
    cache.set(`obj:${kind}`, canvas.toDataURL('image/png'));
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
    scene.environment.dispose();
  }
}

/** Buste d'un combattant vêtu de chaque skin (Kael sert de mannequin). */
function renderSkins(renderer, canvas, charId) {
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  for (const sk of SKINS) {
    const def = dressed(CHAR_BY_ID[charId], sk.id);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a3050', 1.5));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(2, 3, 4);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(sk.aura, 4);
    rim.position.set(-3, 2, -3);
    scene.add(rim);
    const rim2 = new THREE.DirectionalLight(sk.aura, 2);
    rim2.position.set(3, 1, -3);
    scene.add(rim2);
    const model = new CharacterModel(def);
    scene.add(model.root);
    // Pose de victoire (bras levés : la tenue se voit en entier)
    const f = { x: 0, y: 0, z: 0, yaw: -0.35, vx: 0, vy: 0, vz: 0, state: 'victory', st: 0, onGround: true, flash: 0 };
    for (let i = 0; i < 40; i++) { f.st += 0.03; model.update(0.03, f, { portrait: true }); }
    model.aura.visible = false;
    const head = new THREE.Vector3();
    model.head.getWorldPosition(head);
    cam.position.set(head.x + 0.4, head.y + 0.05, head.z + 2.7);
    cam.lookAt(head.x, head.y - 0.36, head.z);
    renderer.render(scene, cam);
    cache.set(`skin:${sk.id}:${charId}`, canvas.toDataURL('image/png'));
    model.dispose();
  }
}

function renderAll(charId) {
  const canvas = document.createElement('canvas');
  const renderer = setupRenderer(canvas, 256, 256, true);
  renderer.toneMapping = THREE.NeutralToneMapping;
  if (!cache.has('obj:ryo')) renderObjects(renderer, canvas);
  renderSkins(renderer, canvas, charId);
  renderer.dispose();
  renderer.forceContextLoss();
}

function get(key, charId = 'kael') {
  if (cache.has(key)) return cache.get(key);
  if (failed || typeof document === 'undefined') return null;
  try { renderAll(charId); } catch (e) { console.warn('Miniatures 3D indisponibles :', e); failed = true; return null; }
  return cache.get(key) || null;
}

/** Image d'un objet : 'ryo', 'ryoPile', 'xp', 'boost', 'title', 'frag'. */
export function objectIcon(kind) {
  return get(`obj:${kind}`);
}

/** Image d'un skin porté par un combattant (Kael par défaut). */
export function skinIcon(skinId, charId = 'kael') {
  const id = CHAR_BY_ID[charId] && !CHAR_BY_ID[charId].monster ? charId : 'kael';
  return get(`skin:${skinId}:${id}`, id);
}
