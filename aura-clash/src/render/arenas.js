// Les arènes : décors low-poly générés par code (sol peint dans un canvas, ciel en dégradé,
// accessoires en cel-shading), avec leur éclairage, leur brouillard et leurs particules d'ambiance.
import * as THREE from 'three';
import { toonMat, toonPart, glowMat } from './toon.js';
import { flameMaterial } from './fx.js';

export const ARENA_RADIUS = 18;

export const ARENAS = [
  { id: 'cliffs', name: 'Plateau des Falaises', desc: 'Un plateau herbeux au soleil couchant, cerné de pitons rocheux.', music: 0 },
  { id: 'temple', name: 'Temple du Crépuscule', desc: 'Dalles anciennes, portiques rouges et cerisiers en fleurs.', music: 1 },
  { id: 'neon', name: 'Toits de Néo-Kyoto', desc: 'Un toit d’immeuble sous la pluie, au milieu des néons.', music: 2 },
  { id: 'glacier', name: 'Glacier Éternel', desc: 'Une plaine de glace sous les aurores boréales.', music: 3 },
  { id: 'volcano', name: 'Cœur du Volcan', desc: 'Un îlot de basalte au milieu d’un lac de lave.', music: 4 },
];

const rand = (a, b) => a + Math.random() * (b - a);

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function skyDome(top, mid, bottom, stars = 0) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(top) }, uMid: { value: new THREE.Color(mid) }, uBottom: { value: new THREE.Color(bottom) },
      uStars: { value: stars }, uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBottom; uniform float uStars; uniform float uTime;
      varying vec3 vDir;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        float y = vDir.y;
        vec3 col = y > 0.0 ? mix(uMid, uTop, pow(clamp(y * 1.6, 0.0, 1.0), 0.8)) : mix(uMid, uBottom, clamp(-y * 4.0, 0.0, 1.0));
        if (uStars > 0.0 && y > 0.05) {
          vec3 p = floor(vDir * 180.0);
          float s = step(0.996, h(p)) * (0.6 + 0.4 * sin(uTime * 2.0 + h(p + 1.0) * 30.0));
          col += vec3(s) * uStars * smoothstep(0.05, 0.4, y);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 16), mat);
  m.renderOrder = -10;
  return m;
}

function canvasTexture(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  paint(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function floorDisc(radius, texture, extra = {}) {
  const geo = new THREE.CircleGeometry(radius, 64);
  geo.rotateX(-Math.PI / 2);
  const mat = toonMat('#ffffff', { map: texture, ...extra });
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

/** Bordure de l'arène : un liseré sur le sol qui marque le mur invisible. */
function edgeRing(color, radius = ARENA_RADIUS) {
  const m = new THREE.Mesh(new THREE.RingGeometry(radius - 0.12, radius + 0.12, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.55, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

function rock(rng, color, s = 1) {
  const geo = new THREE.DodecahedronGeometry(s, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * (0.8 + rng() * 0.4), pos.getY(i) * (0.8 + rng() * 0.4), pos.getZ(i) * (0.8 + rng() * 0.4));
  }
  geo.computeVertexNormals();
  return toonPart(geo, toonMat(color, { flatShading: true }), { outline: 0.04 });
}

function ringPlacement(n, r0, r1, rng, fn) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.4;
    const r = r0 + rng() * (r1 - r0);
    fn(Math.sin(a) * r, Math.cos(a) * r, a, i);
  }
}

/** Taches douces (dégradé radial) : base des sols peints. */
function blobs(c, s, n, colors, r0, r1, alpha = 0.5) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * s; const y = Math.random() * s; const r = r0 + Math.random() * (r1 - r0);
    const col = colors[Math.floor(Math.random() * colors.length)];
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col.replace('A', String(alpha))); gr.addColorStop(1, col.replace('A', '0'));
    c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/** Grain fin (bruit de pixels clairs et sombres). */
function grain(c, s, n, light = 0.06, dark = 0.08, size = 3) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${light})` : `rgba(0,0,0,${dark})`;
    c.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * size, 1 + Math.random() * size);
  }
}

/** Fissure qui se ramifie. */
function crack(c, x, y, a, len, depth, draw) {
  for (let k = 0; k < len; k++) {
    const nx = x + Math.cos(a) * (8 + Math.random() * 10);
    const ny = y + Math.sin(a) * (8 + Math.random() * 10);
    draw(x, y, nx, ny, 1 - k / len);
    x = nx; y = ny; a += (Math.random() - 0.5) * 0.9;
    if (depth > 0 && Math.random() < 0.18) crack(c, x, y, a + (Math.random() < 0.5 ? 0.9 : -0.9), Math.floor(len * 0.5), depth - 1, draw);
  }
}

// --- Constructeurs ---------------------------------------------------------------------------

function buildCliffs(g, rng) {
  // Plateau herbeux : verts naturels en taches, terre battue au centre, pierres plates et fleurs
  const tex = canvasTexture(2048, (c, s) => {
    c.fillStyle = '#5a8a3e'; c.fillRect(0, 0, s, s);
    blobs(c, s, 260, ['rgba(70,110,48,A)', 'rgba(110,150,70,A)', 'rgba(90,130,60,A)', 'rgba(130,150,80,A)'], 40, 160, 0.55);
    // Brins d'herbe peints
    for (let i = 0; i < 40000; i++) {
      const x = Math.random() * s; const y = Math.random() * s;
      c.strokeStyle = ['rgba(60,100,40,0.5)', 'rgba(140,180,90,0.45)', 'rgba(100,140,60,0.5)'][i % 3];
      c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 4, y - 4 - Math.random() * 5); c.stroke();
    }
    // Terre battue au centre, là où l'on se bat
    const cx = s / 2; const ppu = s / (2 * (ARENA_RADIUS + 14));
    const dirt = c.createRadialGradient(cx, cx, 0, cx, cx, 9 * ppu);
    dirt.addColorStop(0, 'rgba(170,140,100,0.85)'); dirt.addColorStop(0.55, 'rgba(160,130,90,0.6)'); dirt.addColorStop(1, 'rgba(160,130,90,0)');
    c.fillStyle = dirt; c.fillRect(0, 0, s, s);
    blobs(c, s, 60, ['rgba(150,120,80,A)', 'rgba(185,155,110,A)'], 15, 50, 0.35);
    // Pierres plates
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2; const d = (3 + Math.random() * 12) * ppu;
      const x = cx + Math.cos(a) * d; const y = cx + Math.sin(a) * d; const r = (0.4 + Math.random() * 0.6) * ppu;
      c.fillStyle = 'rgba(40,40,30,0.35)'; c.beginPath(); c.ellipse(x + 3, y + 4, r, r * 0.75, a, 0, Math.PI * 2); c.fill();
      c.fillStyle = `rgb(${150 + Math.random() * 30 | 0},${145 + Math.random() * 25 | 0},${130 + Math.random() * 20 | 0})`;
      c.beginPath(); c.ellipse(x, y, r, r * 0.75, a, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,240,0.18)'; c.beginPath(); c.ellipse(x - r * 0.2, y - r * 0.2, r * 0.6, r * 0.4, a, 0, Math.PI * 2); c.fill();
    }
    grain(c, s, 30000, 0.05, 0.06, 2);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = ['#fff4a0', '#ffffff', '#ffb0d0', '#c0a0ff'][i % 4];
      c.beginPath(); c.arc(Math.random() * s, Math.random() * s, 2.5, 0, Math.PI * 2); c.fill();
    }
  });
  g.add(floorDisc(ARENA_RADIUS + 14, tex));
  g.add(edgeRing('#fff4c0'));
  ringPlacement(14, ARENA_RADIUS + 2, ARENA_RADIUS + 6, rng, (x, z) => {
    const h = 3 + rng() * 9;
    const p = rock(rng, '#a8875e', 1);
    p.scale.set(1.4 + rng(), h, 1.4 + rng());
    p.position.set(x, h * 0.5, z);
    g.add(p);
    const cap = rock(rng, '#6fae4f', 1);
    cap.scale.set(1.8 + rng(), 0.5, 1.8 + rng());
    cap.position.set(x, h * 1.0 + 0.2, z);
    g.add(cap);
  });
  ringPlacement(9, 60, 110, rng, (x, z) => {
    const h = 15 + rng() * 25;
    const m = toonPart(new THREE.CylinderGeometry(8 + rng() * 6, 12 + rng() * 6, h, 7), toonMat('#b4835a', { flatShading: true }), { outline: 0, shadow: false });
    m.position.set(x, h / 2 - 2, z);
    g.add(m);
  });
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#fff0e0', transparent: true, opacity: 0.85, fog: false }));
    c.scale.set(10 + rng() * 10, 2 + rng() * 2, 5 + rng() * 4);
    const a = rng() * Math.PI * 2;
    c.position.set(Math.sin(a) * (120 + rng() * 40), 35 + rng() * 25, Math.cos(a) * (120 + rng() * 40));
    g.add(c);
  }
  return {
    sky: skyDome('#2f4f9a', '#ff9e6a', '#5a3a50'),
    fog: ['#e6a07a', 45, 190],
    sun: { color: '#ffe0b0', intensity: 2.2, dir: [-30, 40, 20] },
    hemi: ['#9ec8ff', '#5a4a30', 1.1],
    ambient: (p, dt) => {
      if (Math.random() < dt * 6) p.emit({ x: rand(-20, 20), y: rand(0.5, 6), z: rand(-20, 20), count: 1, dir: [1, 0.2, 0.3], cone: 0.4, speed: 2, color: '#d8f080', size: 0.12, life: 4, drag: 0.1, hdr: 0.8 });
    },
  };
}

/** Halo lumineux (sprite additif à dégradé radial), repris par le bloom. */
let haloTex = null;
function halo(color, size, opacity = 0.8) {
  if (!haloTex) {
    haloTex = canvasTexture(128, (c, s) => {
      const gr = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr; c.fillRect(0, 0, s, s);
    });
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  sp.scale.setScalar(size);
  return sp;
}

/** Pagode à étages (silhouette de fond). */
function pagoda(tiers, w, wood, roof, glow) {
  const p = new THREE.Group();
  const base = toonPart(new THREE.BoxGeometry(w * 1.3, 1.2, w * 1.3), toonMat('#5a5468'), { outline: 0.06 });
  base.position.y = 0.6;
  p.add(base);
  let y = 1.2;
  for (let i = 0; i < tiers; i++) {
    const k = 1 - i * 0.16;
    const bh = 2.4 * k;
    const body = toonPart(new THREE.BoxGeometry(w * k, bh, w * k), wood, { outline: 0.05 });
    body.position.y = y + bh / 2;
    p.add(body);
    // Fenêtres éclairées
    for (const sd of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(w * k * 0.5, bh * 0.35, 0.05), glow);
      win.position.set(0, y + bh * 0.5, sd * (w * k / 2 + 0.03));
      p.add(win);
    }
    y += bh;
    const r = toonPart(new THREE.ConeGeometry(w * k * 0.95, 1.5 * k, 4), roof, { outline: 0.06 });
    r.rotation.y = Math.PI / 4;
    r.scale.y = 0.8;
    r.position.y = y + 0.45 * k;
    p.add(r);
    y += 0.9 * k;
  }
  const spire = toonPart(new THREE.CylinderGeometry(0.08, 0.2, 3.2, 6), toonMat('#c8a040'), { outline: 0.03 });
  spire.position.y = y + 1.4;
  p.add(spire);
  return p;
}

function buildTemple(g, rng) {
  // Parvis pavé en anneaux concentriques : pierres claires et chaudes, joints fins, centre usé et lumineux
  const FLOOR_R = ARENA_RADIUS + 1.4;
  const tex = canvasTexture(2048, (c, s) => {
    const cx = s / 2;
    const ppu = s / (2 * FLOOR_R); // pixels par unité
    c.fillStyle = '#5c5560'; c.fillRect(0, 0, s, s);
    const stone = (r0, r1, a0, a1) => {
      const v = Math.random();
      const warm = Math.random() < 0.25;
      const L = 150 + v * 26;
      c.fillStyle = warm ? `rgb(${L + 10 | 0},${L - 4 | 0},${L - 16 | 0})` : `rgb(${L | 0},${L - 6 | 0},${L - 2 | 0})`;
      const j = 1.6 / r1; // joint (radians)
      c.beginPath();
      c.arc(cx, cx, r1 - 1.6, a0 + j, a1 - j);
      c.arc(cx, cx, r0 + 1.6, a1 - j, a0 + j, true);
      c.closePath();
      c.fill();
      // Arête claire côté intérieur et léger dégradé (pierre bombée)
      c.strokeStyle = 'rgba(255,250,240,0.18)'; c.lineWidth = 2;
      c.beginPath(); c.arc(cx, cx, r0 + 3, a0 + j * 2, a1 - j * 2); c.stroke();
      c.strokeStyle = 'rgba(40,30,40,0.18)';
      c.beginPath(); c.arc(cx, cx, r1 - 3, a0 + j * 2, a1 - j * 2); c.stroke();
    };
    // Disque central d'une seule pierre
    c.fillStyle = '#b4aaa8';
    c.beginPath(); c.arc(cx, cx, 1.5 * ppu, 0, Math.PI * 2); c.fill();
    let r = 1.5 * ppu;
    let ring = 0;
    while (r < FLOOR_R * ppu) {
      const w = (ring % 4 === 3 ? 0.55 : 1.15) * ppu; // un anneau étroit toutes les quatre rangées
      const n = Math.max(6, Math.round((2 * Math.PI * (r + w / 2)) / (1.5 * ppu)));
      const off = Math.random() * Math.PI;
      for (let i = 0; i < n; i++) {
        const a0 = off + (i / n) * Math.PI * 2;
        const a1 = off + ((i + 1) / n) * Math.PI * 2;
        stone(r, r + w, a0, a1);
      }
      r += w;
      ring++;
    }
    // Grain de la pierre
    for (let i = 0; i < 26000; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(30,20,30,0.07)';
      c.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 2);
    }
    // Usure : centre plus clair, bords plus sombres et moussus
    const gr = c.createRadialGradient(cx, cx, 0, cx, cx, cx);
    gr.addColorStop(0, 'rgba(255,240,225,0.16)'); gr.addColorStop(0.45, 'rgba(255,240,225,0)');
    gr.addColorStop(0.82, 'rgba(30,20,40,0.12)'); gr.addColorStop(1, 'rgba(30,20,40,0.4)');
    c.fillStyle = gr; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 180; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = cx * (0.72 + Math.random() * 0.28);
      c.fillStyle = `rgba(${80 + Math.random() * 30},${105 + Math.random() * 30},72,${0.18 + Math.random() * 0.22})`;
      c.beginPath(); c.ellipse(cx + Math.cos(a) * d, cx + Math.sin(a) * d, 6 + Math.random() * 18, 3 + Math.random() * 8, a, 0, Math.PI * 2); c.fill();
    }
    // Emblème discret gravé sur la pierre centrale
    c.strokeStyle = 'rgba(70,50,50,0.45)'; c.lineWidth = 5;
    c.beginPath(); c.arc(cx, cx, 1.15 * ppu, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(214,170,90,0.55)'; c.lineWidth = 3;
    c.beginPath(); c.arc(cx, cx, 1.15 * ppu, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(cx, cx, 0.35 * ppu, 0, Math.PI * 2); c.stroke();
    // Ligne de démarcation des combattants : un anneau de pierre dorée plus loin
    c.strokeStyle = 'rgba(214,170,90,0.35)'; c.lineWidth = 4;
    c.beginPath(); c.arc(cx, cx, 6.2 * ppu, 0, Math.PI * 2); c.stroke();
    // Quelques pétales tombés
    for (let i = 0; i < 700; i++) {
      c.fillStyle = ['rgba(255,170,205,0.8)', 'rgba(255,215,230,0.75)', 'rgba(240,140,190,0.75)'][i % 3];
      c.beginPath(); c.ellipse(Math.random() * s, Math.random() * s, 3.5, 2, Math.random() * 3, 0, Math.PI * 2); c.fill();
    }
  });
  tex.anisotropy = 8;
  g.add(floorDisc(FLOOR_R, tex));
  // Terre et herbe autour du parvis, jusqu'à l'horizon
  const ground = new THREE.Mesh(new THREE.CircleGeometry(230, 48).rotateX(-Math.PI / 2), toonMat('#2e2a3e'));
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  g.add(ground);
  g.add(edgeRing('#ffc070'));
  // Margelle de pierre qui borde le parvis
  const curbMat = toonMat('#7a7288');
  const curb = toonPart(new THREE.CylinderGeometry(ARENA_RADIUS + 1.6, ARENA_RADIUS + 1.8, 0.4, 72, 1, true), curbMat, { outline: 0 });
  curb.material = toonMat('#5a5268', { side: THREE.DoubleSide });
  curb.position.y = 0.0;
  g.add(curb);
  const curbTop = new THREE.Mesh(new THREE.RingGeometry(ARENA_RADIUS + 1.35, ARENA_RADIUS + 1.8, 72).rotateX(-Math.PI / 2), curbMat);
  curbTop.position.y = 0.2;
  curbTop.receiveShadow = true;
  g.add(curbTop);

  const red = toonMat('#d8262f');
  const black = toonMat('#221826');
  const gold = toonMat('#e0b050');
  const torii = (x, z, a, k = 1) => {
    const t = new THREE.Group();
    for (const sd of [-1, 1]) {
      const post = toonPart(new THREE.CylinderGeometry(0.28, 0.32, 6, 8), red, { outline: 0.04 });
      post.position.set(sd * 2.6, 3, 0);
      const foot = toonPart(new THREE.CylinderGeometry(0.42, 0.46, 0.5, 8), black, { outline: 0.03 });
      foot.position.set(sd * 2.6, 0.25, 0);
      t.add(post, foot);
    }
    // Linteau supérieur aux extrémités relevées
    const beam = toonPart(new THREE.BoxGeometry(7.6, 0.45, 0.65), black, { outline: 0.04 });
    beam.position.y = 6.15;
    t.add(beam);
    for (const sd of [-1, 1]) {
      const tip = toonPart(new THREE.BoxGeometry(0.9, 0.42, 0.65), black, { outline: 0.04 });
      tip.position.set(sd * 4.05, 6.3, 0); tip.rotation.z = sd * 0.28;
      t.add(tip);
    }
    const beam2 = toonPart(new THREE.BoxGeometry(6.3, 0.35, 0.45), red, { outline: 0.04 });
    beam2.position.y = 5.1;
    t.add(beam2);
    const plaque = toonPart(new THREE.BoxGeometry(0.7, 0.9, 0.12), black, { outline: 0.03 });
    plaque.position.set(0, 5.62, 0.3);
    const plaqueIn = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), gold.clone());
    plaqueIn.position.set(0, 5.62, 0.37);
    t.add(plaque, plaqueIn);
    // Corde sacrée et ses bandes de papier
    const rope = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.09, 6, 24, Math.PI), toonMat('#e8d8a8'));
    rope.rotation.z = Math.PI; rope.scale.y = 0.18; rope.position.y = 4.85;
    t.add(rope);
    for (let i = -2; i <= 2; i++) {
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.5), toonMat('#ffffff', { side: THREE.DoubleSide }));
      paper.position.set(i * 0.9, 4.5 - (1 - Math.abs(i) / 2.6) * 0.42, 0);
      t.add(paper);
    }
    t.position.set(x, 0, z);
    t.rotation.y = a;
    t.scale.setScalar(k);
    g.add(t);
    return t;
  };
  ringPlacement(4, ARENA_RADIUS + 3, ARENA_RADIUS + 3, () => 0, (x, z, a) => torii(x, z, a));
  // Allée de portiques qui mène à la pagode, derrière le parvis
  for (let i = 0; i < 3; i++) torii(0, -(ARENA_RADIUS + 9 + i * 6), 0, 0.92 - i * 0.06);

  // Lanternes de pierre, avec leur halo
  const stone = toonMat('#9a94a8');
  const lights = [];
  const halos = [];
  const lantern = (x, z, k = 1) => {
    const l = new THREE.Group();
    const base = toonPart(new THREE.CylinderGeometry(0.3, 0.45, 1.2, 6), stone, { outline: 0.03 });
    base.position.y = 0.6;
    const box = toonPart(new THREE.BoxGeometry(0.8, 0.6, 0.8), stone, { outline: 0.03 });
    box.position.y = 1.5;
    const roof = toonPart(new THREE.ConeGeometry(0.75, 0.5, 4), stone, { outline: 0.03 });
    roof.position.y = 2.05; roof.rotation.y = Math.PI / 4;
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.82), glowMat('#ffb050', 2.2));
    glow.position.y = 1.5;
    const hl = halo('#ffa040', 3.2, 0.55);
    hl.position.y = 1.5;
    l.add(base, box, roof, glow, hl);
    l.position.set(x, 0, z);
    l.scale.setScalar(k);
    g.add(l);
    lights.push(glow);
    halos.push(hl);
  };
  ringPlacement(8, ARENA_RADIUS + 2.6, ARENA_RADIUS + 2.6, () => 0.39, (x, z) => lantern(x, z));
  for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) lantern(sd * 4.2, -(ARENA_RADIUS + 9 + i * 6), 0.9);

  // Pagode et sanctuaires, dans la brume du fond
  const wood = toonMat('#8a2a2e');
  const slate = toonMat('#2a2440');
  const winGlow = glowMat('#ffb860', 1.6);
  const main = pagoda(5, 6.5, wood, slate, winGlow);
  main.position.set(0, 0, -(ARENA_RADIUS + 34));
  main.scale.setScalar(1.2);
  g.add(main);
  for (const [x, z, n, w] of [[-34, -44, 3, 5], [38, -40, 3, 4.6], [-52, 10, 2, 5], [48, 26, 2, 5]]) {
    const p = pagoda(n, w, wood, slate, winGlow);
    p.position.set(x, 0, z);
    p.rotation.y = Math.atan2(x, z);
    g.add(p);
  }

  // Cerisiers aux houppiers ronds, en trois roses
  const trunk = toonMat('#4a3028');
  const pinks = ['#ffb0c8', '#ff8ab4', '#ffd2e2'].map((c) => toonMat(c, { flatShading: true }));
  ringPlacement(16, ARENA_RADIUS + 6, ARENA_RADIUS + 18, rng, (x, z) => {
    if (Math.abs(x) < 7 && z < 0) return; // l'allée reste dégagée
    const h = 3 + rng() * 2.5;
    const tr = toonPart(new THREE.CylinderGeometry(0.22, 0.42, h, 6), trunk, { outline: 0.03 });
    tr.position.set(x, h / 2, z);
    tr.rotation.z = (rng() - 0.5) * 0.25;
    g.add(tr);
    for (let k = 0; k < 4; k++) {
      const c = toonPart(new THREE.IcosahedronGeometry(1.3 + rng() * 0.9, 1), pinks[k % 3], { outline: 0.04 });
      c.position.set(x + rand(-1.3, 1.3), h + rand(-0.2, 1.4), z + rand(-1.3, 1.3));
      c.scale.y = 0.8;
      g.add(c);
    }
  });

  // Montagnes en deux plans : proches et sombres, lointaines et brumeuses
  ringPlacement(9, 75, 100, rng, (x, z) => {
    const h = 22 + rng() * 22;
    const m = new THREE.Mesh(new THREE.ConeGeometry(16 + rng() * 10, h, 6), toonMat('#3a2c58', { flatShading: true }));
    m.position.set(x, h / 2 - 3, z);
    g.add(m);
  });
  ringPlacement(11, 140, 175, rng, (x, z) => {
    const h = 45 + rng() * 40;
    const m = new THREE.Mesh(new THREE.ConeGeometry(26 + rng() * 14, h, 5), toonMat('#7a4a8a', { flatShading: true }));
    m.position.set(x, h / 2 - 4, z);
    // Neige au sommet
    const cap = new THREE.Mesh(new THREE.ConeGeometry((26 + 14 * 0.5) * 0.28, h * 0.22, 5), toonMat('#f0d8f0', { flatShading: true }));
    cap.position.y = h * 0.39;
    m.add(cap);
    g.add(m);
  });

  // Lune et son halo
  const moon = new THREE.Mesh(new THREE.CircleGeometry(11, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2d8').multiplyScalar(1.5), fog: false }));
  moon.position.set(-55, 72, -150);
  moon.lookAt(0, 0, 0);
  g.add(moon);
  const moonHalo = halo('#ffd8f0', 90, 0.5);
  moonHalo.material.fog = false;
  moonHalo.position.copy(moon.position).multiplyScalar(0.98);
  g.add(moonHalo);
  return {
    sky: skyDome('#0e0a2e', '#d86a8a', '#3a2040', 0.9),
    fog: ['#6a3a70', 45, 200],
    sun: { color: '#ffd0e4', intensity: 1.9, dir: [-25, 35, -30] },
    hemi: ['#b48aff', '#3a2a3a', 1.15],
    update: (t) => {
      lights.forEach((l, i) => { l.material.opacity = 0.8 + Math.sin(t * 7 + i * 1.7) * 0.2; });
      halos.forEach((hl, i) => { hl.material.opacity = 0.45 + Math.sin(t * 5 + i * 2.3) * 0.1; });
    },
    ambient: (p, dt) => {
      if (Math.random() < dt * 14) {
        p.emit({ x: rand(-22, 22), y: rand(6, 10), z: rand(-22, 22), count: 1, dir: [0.6, -0.5, 0.2], cone: 0.4, speed: 1.6, color: '#ffa8c8', size: 0.16, life: 6, drag: 0.05, hdr: 0.9 });
      }
      // Lucioles dorées autour du parvis
      if (Math.random() < dt * 3) {
        const a = Math.random() * Math.PI * 2;
        const r = ARENA_RADIUS + rand(-2, 6);
        p.emit({ x: Math.sin(a) * r, y: rand(0.4, 3), z: Math.cos(a) * r, count: 1, dir: [0, 1, 0], cone: 1.2, speed: 0.4, color: '#ffd070', size: 0.1, life: 4, drag: 0.2, hdr: 1.6 });
      }
    },
  };
}

function buildNeon(g, rng) {
  // Toit d'immeuble : dalles de béton, joints, marquage d'hélipad, bandes de sécurité au bord
  const tex = canvasTexture(2048, (c, s) => {
    c.fillStyle = '#1c1c26'; c.fillRect(0, 0, s, s);
    const n = 18; const cell = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 56 + Math.random() * 14;
      c.fillStyle = `rgb(${v | 0},${v + 2 | 0},${v + 12 | 0})`;
      c.fillRect(x * cell + 5, y * cell + 5, cell - 10, cell - 10);
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x * cell + 5, y * cell + 5, cell - 10, 3);
    }
    grain(c, s, 60000, 0.05, 0.1, 2);
    blobs(c, s, 40, ['rgba(20,22,34,A)'], 15, 50, 0.3); // taches d'humidité
    const cx = s / 2;
    // Hélipad : cercle et H peints, un peu usés
    c.strokeStyle = 'rgba(232,208,64,0.85)'; c.lineWidth = 14;
    c.beginPath(); c.arc(cx, cx, s * 0.2, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 4; c.beginPath(); c.arc(cx, cx, s * 0.18, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(232,208,64,0.85)';
    const u = s * 0.02;
    c.fillRect(cx - 4 * u, cx - 5 * u, 2 * u, 10 * u); c.fillRect(cx + 2 * u, cx - 5 * u, 2 * u, 10 * u); c.fillRect(cx - 2 * u, cx - u, 4 * u, 2 * u);
    grain(c, s, 8000, 0, 0.25, 4); // usure de la peinture
    // Bandes de sécurité jaunes et noires près du bord
    const R = s * 0.465;
    for (let i = 0; i < 120; i++) {
      c.strokeStyle = i % 2 ? '#1a1a1a' : '#d8b830'; c.lineWidth = 18;
      c.beginPath(); c.arc(cx, cx, R, (i / 120) * Math.PI * 2, ((i + 1) / 120) * Math.PI * 2); c.stroke();
    }
  });
  g.add(floorDisc(ARENA_RADIUS + 3, tex, { color: new THREE.Color('#e8eaff'), emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.18 }));
  g.add(edgeRing('#40f0ff'));
  const wallMat = toonMat('#2a2c38');
  const ledge = toonPart(new THREE.CylinderGeometry(ARENA_RADIUS + 3.2, ARENA_RADIUS + 3.2, 1.2, 48, 1, true), wallMat, { outline: 0 });
  ledge.material = toonMat('#2a2c38', { side: THREE.DoubleSide });
  ledge.position.y = 0.6;
  g.add(ledge);
  const winTex = canvasTexture(128, (c, s) => {
    c.fillStyle = '#10121c'; c.fillRect(0, 0, s, s);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 8; x++) {
        if (Math.random() < 0.45) {
          c.fillStyle = ['#ffd890', '#90e0ff', '#ff90d0', '#fff4d0'][Math.floor(Math.random() * 4)];
          c.fillRect(x * 16 + 3, y * 8 + 2, 10, 4);
        }
      }
    }
  });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const neonColors = ['#ff2a8a', '#2af0ff', '#ffe02a', '#9a5aff', '#2aff8a'];
  const signs = [];
  ringPlacement(26, 32, 95, rng, (x, z) => {
    const h = 20 + rng() * 60;
    const w = 6 + rng() * 8;
    const t = winTex.clone();
    t.repeat.set(w / 8, h / 10);
    t.needsUpdate = true;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color('#ffffff').multiplyScalar(1.15) }));
    b.position.set(x, h / 2 - 25, z);
    b.lookAt(0, b.position.y, 0);
    g.add(b);
    if (rng() < 0.7) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 1.4 + rng() * 2, 0.3), glowMat(neonColors[Math.floor(rng() * neonColors.length)], 2.4));
      sign.position.set(x * 0.92, h - 25 - 4 - rng() * 10, z * 0.92);
      sign.lookAt(0, sign.position.y, 0);
      g.add(sign);
      signs.push(sign);
    }
  });
  // Antennes et climatiseurs sur le toit
  const metal = toonMat('#6a6e80');
  ringPlacement(6, ARENA_RADIUS + 1.2, ARENA_RADIUS + 2.4, rng, (x, z) => {
    const box = toonPart(new THREE.BoxGeometry(1.6, 1.2, 1.2), metal, { outline: 0.03 });
    box.position.set(x, 0.6, z);
    box.lookAt(0, 0.6, 0);
    g.add(box);
  });
  return {
    sky: skyDome('#05040f', '#2a1048', '#120818', 0.4),
    fog: ['#1a0c2c', 35, 140],
    sun: { color: '#a0b8ff', intensity: 1.3, dir: [20, 40, 25] },
    hemi: ['#6a4aff', '#ff2a8a', 1.2],
    update: (t) => { signs.forEach((s, i) => { s.material.opacity = Math.sin(t * 13 + i * 7) > -0.95 ? 1 : 0.2; }); },
    ambient: (p, dt) => {
      const n = Math.floor(dt * 160);
      for (let i = 0; i < n; i++) p.emit({ x: rand(-26, 26), y: 14, z: rand(-26, 26), count: 1, dir: [0.05, -1, 0], cone: 0.02, speed: 26, color: '#a8c8ff', size: 0.06, life: 0.6, drag: 0, hdr: 0.7 });
    },
  };
}

function buildGlacier(g, rng) {
  // Glace bleue profonde : zones plus sombres, givre, fissures blanches ramifiées
  const tex = canvasTexture(2048, (c, s) => {
    const grd = c.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s / 2);
    grd.addColorStop(0, '#a8cce4'); grd.addColorStop(1, '#6a9cc4');
    c.fillStyle = grd; c.fillRect(0, 0, s, s);
    blobs(c, s, 120, ['rgba(70,120,170,A)', 'rgba(150,200,230,A)', 'rgba(40,90,150,A)'], 60, 220, 0.4);
    blobs(c, s, 160, ['rgba(240,250,255,A)'], 20, 70, 0.45); // plaques de givre
    for (let i = 0; i < 45; i++) {
      crack(c, Math.random() * s, Math.random() * s, Math.random() * 6.3, 12, 2, (x0, y0, x1, y1, k) => {
        c.strokeStyle = `rgba(255,255,255,${0.35 + k * 0.4})`; c.lineWidth = 1 + k * 2;
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      });
    }
    grain(c, s, 20000, 0.12, 0.04, 2);
  });
  g.add(floorDisc(ARENA_RADIUS + 16, tex));
  g.add(edgeRing('#ffffff'));
  const ice = toonMat('#a8e4ff', { flatShading: true, emissive: new THREE.Color('#2a6aa0'), emissiveIntensity: 0.35 });
  ringPlacement(22, ARENA_RADIUS + 1.5, ARENA_RADIUS + 9, rng, (x, z) => {
    const h = 2 + rng() * 7;
    const c = toonPart(new THREE.ConeGeometry(0.6 + rng() * 1.2, h, 5), ice, { outline: 0.04 });
    c.position.set(x, h / 2 - 0.2, z);
    c.rotation.set(rand(-0.25, 0.25), rng() * 3, rand(-0.25, 0.25));
    g.add(c);
  });
  const snow = toonMat('#f4faff', { flatShading: true });
  ringPlacement(10, 70, 130, rng, (x, z) => {
    const h = 30 + rng() * 40;
    const m = new THREE.Mesh(new THREE.ConeGeometry(20 + rng() * 15, h, 6), snow);
    m.position.set(x, h / 2 - 5, z);
    g.add(m);
  });
  // Aurores boréales : rubans ondulants additifs
  const auroraMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vUv; uniform float uTime;
      void main() { vUv = uv; vec3 p = position; p.y += sin(p.x * 0.05 + uTime * 0.5) * 6.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */`varying vec2 vUv; uniform float uTime;
      void main() {
        float band = sin(vUv.x * 40.0 + uTime * 1.5) * 0.5 + 0.5;
        float a = smoothstep(0.0, 0.3, vUv.y) * (1.0 - vUv.y) * (0.4 + band * 0.6);
        vec3 col = mix(vec3(0.2, 1.0, 0.6), vec3(0.6, 0.3, 1.0), vUv.y);
        gl_FragColor = vec4(col * a * 1.3, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  const aurora = new THREE.Mesh(new THREE.PlaneGeometry(320, 40, 64, 1), auroraMat);
  aurora.position.set(0, 70, -140);
  aurora.rotation.x = 0.3;
  g.add(aurora);
  return {
    sky: skyDome('#020818', '#1a3a6a', '#0a1428', 0.9),
    fog: ['#3a5a8a', 50, 200],
    sun: { color: '#d0e8ff', intensity: 1.7, dir: [25, 40, -20] },
    hemi: ['#a0d0ff', '#4a6a8a', 1.05],
    update: (t) => { auroraMat.uniforms.uTime.value = t; },
    ambient: (p, dt) => {
      const n = Math.floor(dt * 50) + (Math.random() < (dt * 50) % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) p.emit({ x: rand(-25, 25), y: 12, z: rand(-25, 25), count: 1, dir: [0.3, -1, 0.1], cone: 0.3, speed: 1.6, color: '#ffffff', size: 0.12, life: 7, drag: 0, hdr: 0.9 });
    },
  };
}

function buildVolcano(g, rng) {
  // Basalte en colonnes hexagonales, joints où la lave affleure
  const tex = canvasTexture(2048, (c, s) => {
    c.fillStyle = '#140c0e'; c.fillRect(0, 0, s, s);
    const r = 46; const w = Math.sqrt(3) * r;
    for (let row = -1; row * r * 1.5 < s + r; row++) {
      for (let col = -1; col * w < s + w; col++) {
        const x = col * w + (row % 2 ? w / 2 : 0); const y = row * r * 1.5;
        const v = 34 + Math.random() * 22;
        c.fillStyle = `rgb(${v + 8 | 0},${v | 0},${v + 2 | 0})`;
        c.beginPath();
        for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; c[k ? 'lineTo' : 'moveTo'](x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4)); }
        c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,220,200,0.06)'; c.beginPath(); c.arc(x - r * 0.2, y - r * 0.2, r * 0.45, 0, Math.PI * 2); c.fill();
      }
    }
    grain(c, s, 30000, 0.04, 0.12, 3);
    // Lave dans les fissures (lueur large puis cœur vif)
    for (let i = 0; i < 28; i++) {
      const x = Math.random() * s; const y = Math.random() * s; const a = Math.random() * 6.3;
      for (const [wd, col] of [[10, 'rgba(255,90,20,0.25)'], [4, 'rgba(255,120,30,0.9)'], [1.6, 'rgba(255,220,120,1)']]) {
        let seed = i * 7919;
        const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
        let px = x; let py = y; let pa = a;
        c.strokeStyle = col; c.lineWidth = wd; c.lineCap = 'round';
        c.beginPath(); c.moveTo(px, py);
        for (let k = 0; k < 14; k++) { px += Math.cos(pa) * 14; py += Math.sin(pa) * 14; pa += (rnd() - 0.5) * 1.0; c.lineTo(px, py); }
        c.stroke();
      }
    }
  });
  const floor = floorDisc(ARENA_RADIUS + 1.5, tex, { emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.25 });
  g.add(floor);
  g.add(edgeRing('#ffb03a'));
  const cliff = toonPart(new THREE.CylinderGeometry(ARENA_RADIUS + 1.5, ARENA_RADIUS - 1, 6, 32, 1, true), toonMat('#2a2026', { side: THREE.DoubleSide }), { outline: 0 });
  cliff.position.y = -3;
  g.add(cliff);
  // Lac de lave animé
  const lavaMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`varying vec2 vUv; uniform float uTime;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vUv * 40.0;
        float v = n(p + vec2(uTime * 0.3, uTime * 0.2)) * 0.6 + n(p * 2.3 - vec2(uTime * 0.4, 0.0)) * 0.4;
        vec3 col = mix(vec3(0.6, 0.05, 0.0), vec3(1.6, 0.7, 0.1), smoothstep(0.35, 0.8, v));
        col += vec3(1.5, 1.2, 0.5) * smoothstep(0.82, 0.95, v);
        gl_FragColor = vec4(col, 1.0);
      }`,
    fog: false,
  });
  const lava = new THREE.Mesh(new THREE.CircleGeometry(160, 48), lavaMat);
  lava.rotation.x = -Math.PI / 2;
  lava.position.y = -1.5;
  g.add(lava);
  ringPlacement(12, ARENA_RADIUS + 6, ARENA_RADIUS + 22, rng, (x, z) => {
    const r = rock(rng, '#3a2a2e', 1.5 + rng() * 2.5);
    r.position.set(x, -0.5, z);
    g.add(r);
  });
  ringPlacement(6, 80, 130, rng, (x, z) => {
    const h = 40 + rng() * 30;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(6, 25, h, 7), toonMat('#1a1216', { flatShading: true }));
    m.position.set(x, h / 2 - 5, z);
    g.add(m);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 1, 7), glowMat('#ff6a1a', 2));
    top.position.set(x, h - 5, z);
    g.add(top);
  });
  const fires = [];
  ringPlacement(6, ARENA_RADIUS + 3, ARENA_RADIUS + 5, rng, (x, z) => {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.3, 4, 12, 1, true), flameMaterial('#ff5a1a', 0.9));
    f.position.set(x, 1, z);
    g.add(f);
    fires.push(f);
  });
  return {
    sky: skyDome('#1a0505', '#8a2a10', '#300808', 0.15),
    fog: ['#5a1a0a', 35, 160],
    sun: { color: '#ffb080', intensity: 1.8, dir: [-20, 35, 25] },
    hemi: ['#ff7a4a', '#401010', 1.1],
    update: (t) => {
      lavaMat.uniforms.uTime.value = t;
      for (const f of fires) f.material.uniforms.uTime.value = t;
    },
    ambient: (p, dt) => {
      if (Math.random() < dt * 20) p.emit({ x: rand(-26, 26), y: 0, z: rand(-26, 26), count: 1, dir: [0, 1, 0], cone: 0.3, speed: 3, color: '#ff8a2a', size: 0.12, life: 3, drag: 0.2, hdr: 2 });
    },
  };
}

const BUILDERS = { cliffs: buildCliffs, temple: buildTemple, neon: buildNeon, glacier: buildGlacier, volcano: buildVolcano };

// --- Détails du sol (instanciés : des milliers d'éléments pour un seul appel de rendu) -------------

/** Touffe d'herbe : trois brins croisés, sombres à la base et clairs à la pointe. */
function tuftGeo(base, tip) {
  const pos = [];
  const col = [];
  const cb = new THREE.Color(base);
  const ct = new THREE.Color(tip);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    const dx = Math.cos(a) * 0.06;
    const dz = Math.sin(a) * 0.06;
    const lean = (i - 1) * 0.05;
    pos.push(-dx, 0, -dz, dx, 0, dz, lean, 0.32 + i * 0.04, lean * 0.5);
    col.push(cb.r, cb.g, cb.b, cb.r, cb.g, cb.b, ct.r, ct.g, ct.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Sème `n` copies d'une forme entre les rayons r0 et r1 (en évitant de trop charger le centre).
 * opts : scale [min, max], y, tilt (inclinaison aléatoire), colors (teintes par copie), center (part au centre).
 */
function scatter(g, geo, mat, n, r0, r1, rng, opts = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const d = new THREE.Object3D();
  const [s0, s1] = opts.scale || [0.8, 1.3];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    // Distribution plus dense vers les bords (le centre reste lisible pour le combat)
    const r = r0 + Math.sqrt(rng()) * (r1 - r0);
    d.position.set(Math.sin(a) * r, opts.y || 0, Math.cos(a) * r);
    const t = opts.tilt || 0;
    d.rotation.set((rng() - 0.5) * t, rng() * Math.PI * 2, (rng() - 0.5) * t);
    d.scale.setScalar(s0 + rng() * (s1 - s0));
    if (opts.flatY) d.scale.y *= opts.flatY;
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
    if (opts.colors) mesh.setColorAt(i, c.set(opts.colors[Math.floor(rng() * opts.colors.length)]));
  }
  mesh.receiveShadow = !!opts.receive;
  mesh.castShadow = false;
  g.add(mesh);
  return mesh;
}

const DETAILS = {
  cliffs(g, rng) {
    const grass = toonMat('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
    scatter(g, tuftGeo('#3f7a32', '#9ad86a'), grass, 2600, 2, ARENA_RADIUS + 12, rng, { scale: [0.7, 1.6] });
    scatter(g, tuftGeo('#4a8a3a', '#c8f080'), grass, 900, ARENA_RADIUS - 2, ARENA_RADIUS + 12, rng, { scale: [1.4, 2.4] });
    // Fleurs des champs
    scatter(g, new THREE.SphereGeometry(0.06, 6, 4), toonMat('#ffffff'), 420, 4, ARENA_RADIUS + 10, rng, { y: 0.22, scale: [0.8, 1.4], colors: ['#ffe14a', '#ffffff', '#ff8ac8', '#b48aff', '#ff7a4a'] });
    scatter(g, new THREE.DodecahedronGeometry(0.18, 0), toonMat('#9a8a78', { flatShading: true }), 90, 3, ARENA_RADIUS + 8, rng, { scale: [0.5, 1.6], tilt: 1, flatY: 0.6, colors: ['#9a8a78', '#7a6e62', '#b0a08c'] });
  },
  temple(g, rng) {
    // Pétales de cerisier tombés au sol
    const petal = new THREE.CircleGeometry(0.07, 5);
    petal.rotateX(-Math.PI / 2);
    scatter(g, petal, toonMat('#ffffff', { side: THREE.DoubleSide }), 1400, 0, ARENA_RADIUS + 10, rng, { y: 0.025, scale: [0.6, 1.4], colors: ['#ffc0d8', '#ff9ac0', '#ffe0ec', '#f0a0c8'] });
    const grass = toonMat('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
    scatter(g, tuftGeo('#3a5a3a', '#8ab070'), grass, 700, ARENA_RADIUS - 1, ARENA_RADIUS + 12, rng, { scale: [0.8, 1.8] });
    scatter(g, new THREE.DodecahedronGeometry(0.15, 0), toonMat('#8a8090', { flatShading: true }), 70, 2, ARENA_RADIUS + 6, rng, { scale: [0.5, 1.4], tilt: 1, flatY: 0.5 });
  },
  neon(g, rng) {
    // Flaques de pluie qui reflètent les néons
    const pud = new THREE.CircleGeometry(1, 20);
    pud.rotateX(-Math.PI / 2);
    const pudTex = canvasTexture(128, (c, sz) => {
      // Flaque aux bords irréguliers et fondus
      for (let i = 0; i < 6; i++) {
        const x = sz / 2 + (Math.random() - 0.5) * sz * 0.35; const y = sz / 2 + (Math.random() - 0.5) * sz * 0.35; const r = sz * (0.18 + Math.random() * 0.15);
        const gr = c.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = gr; c.fillRect(0, 0, sz, sz);
      }
    });
    scatter(g, pud, new THREE.MeshBasicMaterial({ color: '#ffffff', map: pudTex, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), 28, 1, ARENA_RADIUS - 1, rng, { y: 0.03, scale: [0.4, 1.4], flatY: 1, colors: ['#3a1a6a', '#103a6a', '#5a1050', '#105a6a'] });
    scatter(g, new THREE.BoxGeometry(0.4, 0.05, 0.25), toonMat('#4a4a5a'), 60, 2, ARENA_RADIUS, rng, { y: 0.03, scale: [0.6, 1.4] });
  },
  glacier(g, rng) {
    const ice = toonMat('#cfefff', { flatShading: true, transparent: true, opacity: 0.92 });
    scatter(g, new THREE.ConeGeometry(0.12, 0.6, 5), ice, 220, ARENA_RADIUS - 4, ARENA_RADIUS + 12, rng, { y: 0.2, scale: [0.6, 2.2], tilt: 0.6 });
    const mound = new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    scatter(g, mound, toonMat('#f4fbff'), 90, 3, ARENA_RADIUS + 10, rng, { scale: [0.5, 1.8], flatY: 0.35 });
    scatter(g, new THREE.OctahedronGeometry(0.08, 0), glowMat('#bff4ff', 1.2), 160, 2, ARENA_RADIUS + 6, rng, { y: 0.06, scale: [0.6, 1.5] });
  },
  volcano(g, rng) {
    scatter(g, new THREE.DodecahedronGeometry(0.22, 0), toonMat('#2a1e22', { flatShading: true }), 200, 2, ARENA_RADIUS + 2, rng, { scale: [0.4, 1.8], tilt: 1, flatY: 0.55, colors: ['#2a1e22', '#3a2a2a', '#1e1418'] });
    scatter(g, new THREE.OctahedronGeometry(0.06, 0), glowMat('#ff7a1a', 2), 260, 1, ARENA_RADIUS + 2, rng, { y: 0.04, scale: [0.5, 1.6] });
  },
};

/** Construit une arène complète (décor + ciel + lumières). */
export function buildArena(id) {
  const group = new THREE.Group();
  const rng = seeded(id.length * 7919 + id.charCodeAt(0));
  const info = (BUILDERS[id] || buildCliffs)(group, rng);
  if (DETAILS[id]) DETAILS[id](group, rng);
  group.add(info.sky);
  return { id, group, radius: ARENA_RADIUS, ...info };
}
