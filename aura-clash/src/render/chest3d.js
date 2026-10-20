// Coffres en 3D, modélisés par code, un style par rareté :
//   commun     : planches de chêne, ferrures de fer forgé, rivets
//   rare       : bois laqué bleu nuit, acier poli, saphir taillé
//   épique     : laque améthyste vernie, filigrane d'argent, grappes de cristaux lumineux, rune
//   légendaire : or ciselé, couronne sertie de rubis, pieds griffus
//   mythique   : obsidienne fendue de magma incandescent, cornes, braises
// Deux usages :
//   - chestImage(rarity, open) : une image rendue une fois (puis en cache) pour les menus ;
//   - ChestViewer : un coffre vivant (chute, tremblement, ouverture, faisceau, gerbe d'étincelles)
//     pour l'écran d'ouverture.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const W = 2.0; // largeur
const D = 1.3; // profondeur
const H = 1.0; // hauteur du corps
const R = D / 2; // rayon du couvercle bombé

// --- Textures dessinées ----------------------------------------------------------------------------

function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rand(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Planches de bois : veines, nœuds, joints sombres. */
function woodTex(base, dark, light, seed = 1) {
  return canvasTex(512, (g, s) => {
    const rnd = rand(seed);
    const planks = 5;
    const ph = s / planks;
    for (let p = 0; p < planks; p++) {
      const y0 = p * ph;
      const grd = g.createLinearGradient(0, y0, 0, y0 + ph);
      grd.addColorStop(0, light); grd.addColorStop(0.5, base); grd.addColorStop(1, dark);
      g.fillStyle = grd;
      g.fillRect(0, y0, s, ph);
      // Veines
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(0,0,0,${0.08 + rnd() * 0.14})`;
        g.lineWidth = 0.6 + rnd() * 1.6;
        g.beginPath();
        const yy = y0 + rnd() * ph;
        const amp = 2 + rnd() * 5;
        const fr = 0.01 + rnd() * 0.03;
        const off = rnd() * 100;
        for (let x = 0; x <= s; x += 8) g.lineTo(x, yy + Math.sin(x * fr + off) * amp);
        g.stroke();
      }
      // Nœud
      if (rnd() < 0.6) {
        const kx = rnd() * s;
        const ky = y0 + ph * (0.3 + rnd() * 0.4);
        for (let r = 12; r > 1; r -= 2.5) {
          g.strokeStyle = `rgba(40,20,5,${0.25})`;
          g.lineWidth = 1.2;
          g.beginPath();
          g.ellipse(kx, ky, r * 1.8, r * 0.7, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
      // Joint entre planches
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, y0, s, 3);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(0, y0 + 3, s, 1);
    }
  });
}

/** Laque vernie : dégradé profond et motif discret. */
function lacquerTex(a, b, pattern) {
  return canvasTex(512, (g, s) => {
    const grd = g.createLinearGradient(0, 0, s, s);
    grd.addColorStop(0, a); grd.addColorStop(1, b);
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = pattern;
    g.lineWidth = 2;
    for (let i = -s; i < s * 2; i += 48) {
      g.beginPath();
      for (let x = 0; x <= s; x += 6) g.lineTo(x, i + Math.sin(x / 40) * 10 + x * 0.25);
      g.stroke();
    }
  });
}

/** Or ciselé : rinceaux gravés (couleur + relief). */
function goldTex(bump = false) {
  return canvasTex(512, (g, s) => {
    if (bump) { g.fillStyle = '#808080'; g.fillRect(0, 0, s, s); } else {
      const grd = g.createLinearGradient(0, 0, 0, s);
      grd.addColorStop(0, '#ffe9a0'); grd.addColorStop(0.5, '#e8b440'); grd.addColorStop(1, '#b07818');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    }
    g.strokeStyle = bump ? '#2a2a2a' : 'rgba(110,60,0,0.75)';
    g.lineWidth = bump ? 5 : 3;
    // Rinceaux : spirales répétées
    for (let y = 40; y < s; y += 110) {
      for (let x = 40; x < s; x += 130) {
        g.beginPath();
        for (let t = 0; t < 12; t += 0.15) {
          const r = 3 + t * 3.2;
          g.lineTo(x + Math.cos(t) * r, y + Math.sin(t) * r * 0.8);
        }
        g.stroke();
        g.beginPath();
        g.moveTo(x + 40, y);
        g.bezierCurveTo(x + 60, y - 30, x + 90, y + 30, x + 110, y);
        g.stroke();
      }
    }
    g.strokeRect(10, 10, s - 20, s - 20);
  }, !bump);
}

/** Obsidienne : base sombre et veinée ; `emissive` : les failles de magma seulement. */
function obsidianTex(emissive) {
  return canvasTex(512, (g, s) => {
    const rnd = rand(77);
    if (emissive) { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); } else {
      const grd = g.createLinearGradient(0, 0, s, s);
      grd.addColorStop(0, '#2a2030'); grd.addColorStop(1, '#0a070c');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(120,90,150,${rnd() * 0.12})`;
        g.beginPath();
        g.moveTo(rnd() * s, rnd() * s); g.lineTo(rnd() * s, rnd() * s); g.lineTo(rnd() * s, rnd() * s);
        g.fill();
      }
    }
    // Failles ramifiées
    const crack = (x, y, a, len, w) => {
      if (len < 8 || w < 0.6) return;
      const nx = x + Math.cos(a) * len;
      const ny = y + Math.sin(a) * len;
      if (emissive) {
        g.strokeStyle = '#ff4a0a'; g.lineWidth = w * 2.2; g.globalAlpha = 0.35;
        g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        g.strokeStyle = '#ffd07a'; g.lineWidth = w; g.globalAlpha = 1;
      } else { g.strokeStyle = '#3a0a00'; g.lineWidth = w * 1.6; }
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      crack(nx, ny, a + (rnd() - 0.5) * 1.1, len * 0.78, w * 0.8);
      if (rnd() < 0.45) crack(nx, ny, a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.6), len * 0.6, w * 0.65);
    };
    for (let i = 0; i < 7; i++) crack(rnd() * s, rnd() * s, rnd() * Math.PI * 2, 40 + rnd() * 40, 3);
    g.globalAlpha = 1;
  }, !emissive);
}

/** Rune lumineuse (face avant du coffre épique). */
function runeTex(color) {
  return canvasTex(256, (g, s) => {
    g.clearRect(0, 0, s, s);
    g.strokeStyle = color;
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.lineWidth = 9;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(s / 2, s * 0.2); g.lineTo(s / 2, s * 0.8);
    g.moveTo(s * 0.3, s * 0.38); g.lineTo(s / 2, s * 0.52); g.lineTo(s * 0.7, s * 0.38);
    g.moveTo(s * 0.32, s * 0.68); g.lineTo(s * 0.68, s * 0.68);
    g.stroke();
  });
}

// --- Matériaux par rareté ---------------------------------------------------------------------------

const STYLE = {
  common: { glow: '#ffe6b0', rim: '#ffd9a0' },
  rare: { glow: '#5ab4ff', rim: '#7fc8ff' },
  epic: { glow: '#c07aff', rim: '#d49cff' },
  legendary: { glow: '#ffcc40', rim: '#fff0a0' },
  mythic: { glow: '#ff4a1a', rim: '#ff7a3a' },
};

function materials(rarity) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  switch (rarity) {
    case 'rare': return {
      body: phys({ map: woodTex('#2f64b8', '#173a7a', '#4a86d8', 3), roughness: 0.42, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
      band: std({ color: '#aebdd2', metalness: 1, roughness: 0.28 }),
      trim: std({ color: '#7a8aa6', metalness: 1, roughness: 0.35 }),
      gem: phys({ color: '#2a7cff', emissive: '#1a5aff', emissiveIntensity: 0.9, metalness: 0, roughness: 0.05, clearcoat: 1, flatShading: true }),
      inside: '#bfe2ff',
    };
    case 'epic': return {
      body: phys({ map: lacquerTex('#6a2aa8', '#2e0e5a', 'rgba(255,220,255,0.10)'), roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 }),
      band: std({ color: '#cfc4e6', metalness: 1, roughness: 0.22 }),
      trim: std({ color: '#9a84c4', metalness: 1, roughness: 0.3 }),
      gem: phys({ color: '#d68aff', emissive: '#b45cff', emissiveIntensity: 1.6, roughness: 0.05, clearcoat: 1, flatShading: true }),
      crystal: phys({ color: '#c58cff', emissive: '#8a2aff', emissiveIntensity: 1.3, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.92, clearcoat: 1, flatShading: true }),
      inside: '#f0d0ff',
    };
    case 'legendary': return {
      body: std({ map: goldTex(false), bumpMap: goldTex(true), bumpScale: 2.5, metalness: 1, roughness: 0.28, color: '#ffffff' }),
      band: std({ color: '#fff0b0', metalness: 1, roughness: 0.12 }),
      trim: std({ color: '#d89a20', metalness: 1, roughness: 0.22 }),
      gem: phys({ color: '#ff2a3a', emissive: '#c00018', emissiveIntensity: 1.1, roughness: 0.04, clearcoat: 1, flatShading: true }),
      inside: '#fff2c0',
    };
    case 'mythic': return {
      body: std({ map: obsidianTex(false), emissiveMap: obsidianTex(true), emissive: '#ffffff', emissiveIntensity: 1.5, metalness: 0.3, roughness: 0.22, color: '#ffffff' }),
      band: std({ color: '#2a2228', metalness: 1, roughness: 0.32 }),
      trim: std({ color: '#8a5a3a', metalness: 1, roughness: 0.35, emissive: '#3a0800', emissiveIntensity: 0.5 }),
      gem: phys({ color: '#ff3a1a', emissive: '#ff2a00', emissiveIntensity: 2.4, roughness: 0.05, clearcoat: 1, flatShading: true }),
      horn: std({ color: '#e8dccc', metalness: 0.05, roughness: 0.45 }),
      inside: '#ffb070',
    };
    default: return {
      body: std({ map: woodTex('#8a5a30', '#5a3618', '#a8743e', 1), roughness: 0.82, metalness: 0 }),
      band: std({ color: '#5a5e66', metalness: 0.9, roughness: 0.55 }),
      trim: std({ color: '#3e4249', metalness: 0.9, roughness: 0.6 }),
      gem: std({ color: '#c8ccd4', metalness: 1, roughness: 0.25 }),
      inside: '#ffe6b0',
    };
  }
}

// --- Géométries --------------------------------------------------------------------------------------

/** Demi-cylindre plein (profil du couvercle), axe selon x, de largeur `w`. */
function halfDrum(radius, w, bevel = 0.02) {
  const sh = new THREE.Shape();
  sh.moveTo(-radius, 0);
  sh.absarc(0, 0, radius, Math.PI, 0, true); // demi-cercle supérieur
  sh.lineTo(-radius, 0);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 40 });
  geo.rotateY(Math.PI / 2);
  geo.translate(-w / 2, 0, 0);
  return geo;
}

/** Corne effilée qui se recourbe. */
function hornGeo(side) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.25 * side, 0.25, 0), new THREE.Vector3(0.42 * side, 0.62, -0.05), new THREE.Vector3(0.38 * side, 1.0, -0.2),
  ]);
  const tub = 32;
  const rad = 12;
  const geo = new THREE.TubeGeometry(curve, tub, 0.14, rad, false);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i <= tub; i++) {
    const t = i / tub;
    const c = curve.getPointAt(t);
    const k = 1 - t * 0.92;
    for (let j = 0; j <= rad; j++) {
      const idx = i * (rad + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/** Construit le coffre : { root, lid, light, inner, extras }. */
export function buildChest(rarity) {
  const M = materials(rarity);
  const root = new THREE.Group();
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  // Corps
  add(root, new RoundedBoxGeometry(W, H, D, 5, 0.05), M.body, 0, H / 2, 0);
  // Intérieur : velours sombre, et un trésor (pièces d'or, gemmes de la couleur de la rareté)
  const inner = add(root, new THREE.PlaneGeometry(W - 0.12, D - 0.12), new THREE.MeshStandardMaterial({ color: rarity === 'mythic' ? '#2a0606' : '#3a0c1e', roughness: 0.9 }), 0, H - 0.03, 0);
  inner.rotation.x = -Math.PI / 2;
  const treasure = new THREE.Group();
  root.add(treasure);
  {
    const rnd = rand(5 + rarity.length);
    const coinMat = new THREE.MeshStandardMaterial({ color: '#ffcf4a', metalness: 1, roughness: 0.22, emissive: '#5a3a00', emissiveIntensity: 0.4 });
    const coinGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.022, 20);
    const n = { common: 26, rare: 34, epic: 40, legendary: 60, mythic: 60 }[rarity] || 30;
    for (let i = 0; i < n; i++) {
      const x = (rnd() - 0.5) * (W - 0.4);
      const z = (rnd() - 0.5) * (D - 0.4);
      const mound = 0.2 * Math.max(0, 1 - Math.hypot(x / 0.9, z / 0.5));
      const c = add(treasure, coinGeo, coinMat, x, H - 0.02 + mound + rnd() * 0.05, z);
      c.rotation.set((rnd() - 0.5) * 1.2, rnd() * 3, (rnd() - 0.5) * 1.2);
    }
    const gemCol = { common: '#e8ecf2', rare: '#2a8cff', epic: '#c060ff', legendary: '#ff2a3a', mythic: '#ff5a1a' }[rarity] || '#fff';
    const gemMat = new THREE.MeshPhysicalMaterial({ color: gemCol, emissive: gemCol, emissiveIntensity: 0.8, roughness: 0.05, clearcoat: 1, flatShading: true });
    for (let i = 0; i < (rarity === 'common' ? 2 : 6); i++) {
      const g = add(treasure, new THREE.OctahedronGeometry(0.07 + rnd() * 0.05, 0), gemMat, (rnd() - 0.5) * 1.1, H + 0.12 + rnd() * 0.08, (rnd() - 0.5) * 0.5);
      g.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    }
  }
  // Ferrures du corps
  add(root, new THREE.BoxGeometry(W + 0.06, 0.13, D + 0.06), M.trim, 0, 0.065, 0);
  add(root, new THREE.BoxGeometry(W + 0.06, 0.09, D + 0.06), M.trim, 0, H - 0.045, 0);
  for (const sx of [-1, 1]) {
    add(root, new THREE.BoxGeometry(0.2, H + 0.02, D + 0.08), M.band, sx * 0.6, H / 2, 0);
    for (const sz of [-1, 1]) add(root, new THREE.BoxGeometry(0.16, H + 0.04, 0.16), M.trim, sx * (W / 2), H / 2, sz * (D / 2));
    // Rivets sur les bandes (avant)
    for (const y of [0.22, 0.5, 0.78]) add(root, new THREE.SphereGeometry(0.035, 12, 8), M.trim, sx * 0.6, y, D / 2 + 0.045);
  }
  // Serrure : plaque, pierre, trou de serrure
  const plate = add(root, new RoundedBoxGeometry(0.42, 0.46, 0.08, 3, 0.03), M.band, 0, H - 0.25, D / 2 + 0.03);
  plate.scale.set(1, 1, 1);
  const gem = add(root, rarity === 'common' ? new THREE.CylinderGeometry(0.08, 0.08, 0.05, 20) : new THREE.OctahedronGeometry(0.1, 0), M.gem, 0, H - 0.18, D / 2 + 0.1);
  if (rarity === 'common') gem.rotation.x = Math.PI / 2; else gem.scale.set(1, 1.25, 0.6);
  const hole = add(root, new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12), new THREE.MeshBasicMaterial({ color: '#000' }), 0, H - 0.36, D / 2 + 0.075);
  hole.rotation.x = Math.PI / 2;
  // Pieds (légendaire, mythique) : boules de métal
  if (rarity === 'legendary' || rarity === 'mythic') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(root, new THREE.SphereGeometry(0.11, 16, 12), M.trim, sx * (W / 2 - 0.02), 0.02, sz * (D / 2 - 0.02));
  }
  // Rune (épique)
  if (rarity === 'epic') {
    add(root, new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: runeTex('#e8b0ff'), transparent: true, toneMapped: false, depthWrite: false }), 0, 0.3, D / 2 + 0.012);
  }

  // Couvercle (charnière à l'arrière)
  const lid = new THREE.Group();
  lid.position.set(0, H, -R);
  root.add(lid);
  const lidBody = add(lid, halfDrum(R, W - 0.04, 0.025), M.body, 0, 0, R);
  lidBody.scale.set(1, 0.82, 1);
  for (const sx of [-1, 1]) {
    const band = add(lid, halfDrum(R + 0.035, 0.2, 0.01), M.band, sx * 0.6, 0, R);
    band.scale.set(1, 0.82, 1);
    const cap = add(lid, halfDrum(R + 0.05, 0.08, 0.01), M.trim, sx * (W / 2 - 0.02), 0, R);
    cap.scale.set(1, 0.82, 1);
  }
  add(lid, new THREE.BoxGeometry(W + 0.06, 0.08, D + 0.06), M.trim, 0, 0.04, R);
  // Moraillon (attache de la serrure sur le couvercle)
  add(lid, new RoundedBoxGeometry(0.26, 0.2, 0.07, 3, 0.03), M.band, 0, 0.06, R + R + 0.02);

  const extras = [];
  if (rarity === 'epic') {
    // Grappes de cristaux qui percent le couvercle
    const rnd = rand(11);
    const cluster = (x, z, n, s) => {
      for (let i = 0; i < n; i++) {
        const h = (0.35 + rnd() * 0.45) * s;
        const c = add(lid, new THREE.ConeGeometry(0.07 * s + rnd() * 0.05, h, 6), M.crystal, x + (rnd() - 0.5) * 0.18, 0.42 + h / 2 - 0.06, z + (rnd() - 0.5) * 0.18);
        c.rotation.set((rnd() - 0.5) * 0.9, rnd() * 3, (rnd() - 0.5) * 0.9);
        extras.push(c);
      }
    };
    cluster(-0.62, R + 0.05, 5, 1.1);
    cluster(0.55, R - 0.1, 4, 0.9);
    cluster(0.05, R + 0.1, 3, 0.6);
  }
  if (rarity === 'legendary') {
    // Couronne sertie sur le couvercle
    const crown = new THREE.Group();
    crown.position.set(0, R * 0.82 + 0.02, R);
    lid.add(crown);
    add(crown, new THREE.CylinderGeometry(0.3, 0.33, 0.14, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#ffd860', metalness: 1, roughness: 0.15, side: THREE.DoubleSide }), 0, 0.07, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const sp = add(crown, new THREE.ConeGeometry(0.06, 0.26, 8), M.band, Math.cos(a) * 0.3, 0.26, Math.sin(a) * 0.3);
      sp.rotation.z = 0;
      add(crown, new THREE.SphereGeometry(0.045, 12, 10), M.gem, Math.cos(a) * 0.3, 0.42, Math.sin(a) * 0.3);
    }
    add(crown, new THREE.OctahedronGeometry(0.11, 0), M.gem, 0, 0.3, 0).scale.set(1, 1.4, 1);
    // Rubis sur les bandes
    for (const sx of [-1, 1]) for (const y of [0.25, 0.75]) add(root, new THREE.OctahedronGeometry(0.06, 0), M.gem, sx * 0.6, y, D / 2 + 0.07);
  }
  if (rarity === 'mythic') {
    for (const sx of [-1, 1]) {
      const horn = add(lid, hornGeo(sx), M.horn, sx * (W / 2 - 0.12), R * 0.5, R - 0.05);
      horn.rotation.z = sx * -0.15;
      extras.push(horn);
    }
    // Crâne stylisé : deux orbites de magma au-dessus de la serrure
    for (const sx of [-1, 1]) add(lid, new THREE.SphereGeometry(0.06, 14, 10), new THREE.MeshBasicMaterial({ color: '#ff6a1a', toneMapped: false }), sx * 0.16, R * 0.6, R + R * 0.62);
  }
  if (rarity === 'rare') {
    // Clous d'acier sur le couvercle
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
      const a = Math.PI * (0.15 + k * 0.23);
      add(lid, new THREE.SphereGeometry(0.035, 12, 8), M.trim, sx * 0.6, Math.sin(a) * (R + 0.04) * 0.82, R + Math.cos(a) * (R + 0.04));
    }
  }

  // Lumière intérieure (allumée à l'ouverture)
  const light = new THREE.PointLight(STYLE[rarity].glow, 0, 6, 1.5);
  light.position.set(0, H + 0.3, 0);
  root.add(light);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return { root, lid, light, inner, extras, style: STYLE[rarity] };
}

// --- Scène commune (éclairage studio) ----------------------------------------------------------------

export function makeScene(renderer, rarity) {
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  scene.environmentIntensity = rarity === 'common' ? 0.6 : 0.9;
  const key = new THREE.DirectionalLight('#fff4e0', 2.4);
  key.position.set(3, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(STYLE[rarity].rim, 3.2);
  rim.position.set(-3, 2.5, -3.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(STYLE[rarity].glow, 0.8);
  fill.position.set(-4, 0.5, 3);
  scene.add(fill);
  scene.add(new THREE.AmbientLight('#ffffff', 0.25));
  return scene;
}

export function setupRenderer(canvas, w, h, keep = false) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: keep });
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  return r;
}

// --- Images en cache ------------------------------------------------------------------------------------

const cache = new Map();
let failed = false;

/** Image (URL de données) d'un coffre, fermé ou ouvert ; null si WebGL est indisponible. */
export function chestImage(rarity, open = false) {
  const key = `${rarity}:${open ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  if (failed || typeof document === 'undefined') return null;
  try {
    renderAll();
  } catch (e) {
    console.warn('Coffres 3D indisponibles :', e);
    failed = true;
    return null;
  }
  return cache.get(key) || null;
}

/** Rend toutes les raretés d'un coup (un seul contexte WebGL, libéré ensuite). */
function renderAll() {
  const canvas = document.createElement('canvas');
  const w = 420;
  const h = 380;
  const renderer = setupRenderer(canvas, w, h, true);
  const cam = new THREE.PerspectiveCamera(27, w / h, 0.1, 50);
  cam.position.set(2.3, 2.0, 4.7);
  cam.lookAt(0, 0.82, 0);
  for (const rarity of ['common', 'rare', 'epic', 'legendary', 'mythic']) {
    const scene = makeScene(renderer, rarity);
    const c = buildChest(rarity);
    c.root.rotation.y = -0.22;
    scene.add(c.root);
    for (const open of [false, true]) {
      // Couvercle ouvert : cadrage plus large (il se dresse derrière le coffre)
      if (open) { cam.position.set(2.6, 2.6, 6.1); cam.lookAt(0, 1.15, 0); } else { cam.position.set(2.5, 2.15, 5.3); cam.lookAt(0, 0.88, 0); }
      c.lid.rotation.x = open ? -1.95 : 0;
      c.light.intensity = open ? 6 : 0;
      renderer.render(scene, cam);
      cache.set(`${rarity}:${open ? 1 : 0}`, canvas.toDataURL('image/png'));
    }
    scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { for (const k of ['map', 'bumpMap', 'emissiveMap']) o.material[k]?.dispose(); o.material.dispose(); } });
    scene.environment.dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss();
}

// --- Coffre vivant (écran d'ouverture) -------------------------------------------------------------------

export class ChestViewer {
  /** `host` : élément qui reçoit le canvas. */
  constructor(host, rarity) {
    this.rarity = rarity;
    const rect = host.getBoundingClientRect();
    const w = Math.max(200, Math.round(rect.width || 400));
    const h = Math.max(180, Math.round(rect.height || 360));
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'chest-canvas';
    host.appendChild(this.canvas);
    this.renderer = setupRenderer(this.canvas, w * Math.min(2, devicePixelRatio || 1), h * Math.min(2, devicePixelRatio || 1));
    this.scene = makeScene(this.renderer, rarity);
    this.cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 60);
    this.cam.position.set(2.2, 2.3, 5.4);
    this.cam.lookAt(0, 0.8, 0);
    this.chest = buildChest(rarity);
    this.scene.add(this.chest.root);
    // Faisceau qui jaillit de l'intérieur
    // Rayons : bandes lumineuses qui s'estompent vers le haut
    const beamTex = canvasTex(256, (g2, sz) => {
      g2.clearRect(0, 0, sz, sz);
      for (let x = 0; x < sz; x += 4) {
        const a = 0.25 + 0.75 * Math.abs(Math.sin(x * 0.11) * Math.sin(x * 0.037 + 1));
        const grd = g2.createLinearGradient(0, 0, 0, sz);
        grd.addColorStop(0, 'rgba(255,255,255,0)');
        grd.addColorStop(1, `rgba(255,255,255,${a})`);
        g2.fillStyle = grd;
        g2.fillRect(x, 0, 4, sz);
      }
    });
    const beamMat = new THREE.MeshBasicMaterial({ map: beamTex, color: this.chest.style.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.8, 4, 32, 1, true), beamMat);
    this.beam.position.set(0, H + 2, 0);
    this.chest.root.add(this.beam);
    // Étincelles
    const N = rarity === 'mythic' || rarity === 'legendary' ? 260 : 160;
    this.sparks = { pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), n: N };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.sparks.pos, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: this.chest.style.glow, size: 0.07, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.scene.add(this.points);
    for (let i = 0; i < N; i++) this.sparks.life[i] = 0;
    // Ombre de contact
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.45, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(1, 0.7, 1);
    this.scene.add(shadow);
    this.t = 0;
    this.openAt = Infinity;
    this.last = null;
    this.alive = true;
    const loop = (now) => {
      if (!this.alive) return;
      // Pas de temps borné (le premier horodatage peut précéder la création)
      this.update(this.last === null ? 0 : Math.max(0, Math.min(0.1, (now - this.last) / 1000)));
      this.last = now;
      this.renderer.render(this.scene, this.cam);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Ouvre le couvercle (gerbe d'étincelles, faisceau). */
  open() {
    if (this.openAt !== Infinity) return;
    this.openAt = this.t;
    const s = this.sparks;
    for (let i = 0; i < s.n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 4.5;
      s.pos[i * 3] = (Math.random() - 0.5) * 1.4; s.pos[i * 3 + 1] = H; s.pos[i * 3 + 2] = (Math.random() - 0.5) * 0.9;
      s.vel[i * 3] = Math.cos(a) * sp * 0.5; s.vel[i * 3 + 1] = 3 + Math.random() * 6; s.vel[i * 3 + 2] = Math.sin(a) * sp * 0.5;
      s.life[i] = 0.8 + Math.random() * 1.4;
    }
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const c = this.chest;
    const root = c.root;
    // Chute avec rebond, puis tremblement qui s'intensifie jusqu'à l'ouverture
    const drop = Math.min(1, t / 0.45);
    const bounce = drop < 1 ? (1 - drop) ** 2 * 3.5 : Math.max(0, Math.sin((t - 0.45) * 18) * 0.12 * Math.exp(-(t - 0.45) * 7));
    root.position.y = bounce;
    root.rotation.y = -0.35 + Math.sin(t * 0.6) * 0.15 + (this.openAt !== Infinity ? (t - this.openAt) * 0.25 : 0);
    if (this.openAt === Infinity && t > 0.45) {
      const k = Math.min(1, (t - 0.45) / 0.5);
      root.rotation.z = Math.sin(t * 46) * 0.05 * k;
      root.position.x = Math.sin(t * 61) * 0.03 * k;
      c.light.intensity = 2 * k;
    } else {
      root.rotation.z *= 0.8;
      root.position.x *= 0.8;
    }
    if (this.openAt !== Infinity) {
      const o = t - this.openAt;
      // Ressort amorti du couvercle
      const target = -1.95;
      const spring = 1 - Math.exp(-o * 7) * Math.cos(o * 16);
      c.lid.rotation.x = target * spring;
      c.light.intensity = 10 * Math.exp(-o * 1.2) + 4;
      this.beam.material.opacity = Math.max(0, 0.55 * Math.exp(-o * 0.8)) * (0.85 + Math.sin(t * 20) * 0.15);
      this.beam.scale.set(1 + o * 0.2, 1, 1 + o * 0.2);
      this.beam.rotation.y += dt * 1.5;
    }
    // Étincelles
    const s = this.sparks;
    for (let i = 0; i < s.n; i++) {
      if (s.life[i] <= 0) { s.pos[i * 3 + 1] = -99; continue; }
      s.life[i] -= dt;
      s.vel[i * 3 + 1] -= 6 * dt;
      s.pos[i * 3] += s.vel[i * 3] * dt;
      s.pos[i * 3 + 1] += s.vel[i * 3 + 1] * dt;
      s.pos[i * 3 + 2] += s.vel[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    for (const e of c.extras) if (e.material.emissiveIntensity !== undefined) e.material.emissiveIntensity = 1.1 + Math.sin(t * 3) * 0.4;
  }

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { for (const k of ['map', 'bumpMap', 'emissiveMap']) o.material[k]?.dispose(); o.material.dispose(); } });
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}
