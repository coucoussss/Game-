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

// --- Constructeurs ---------------------------------------------------------------------------

function buildCliffs(g, rng) {
  const tex = canvasTexture(512, (c, s) => {
    c.fillStyle = '#6fae4f'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 2500; i++) {
      c.fillStyle = ['#5f9e43', '#7fbf5a', '#689f4a', '#8ccc66'][i % 4];
      c.fillRect(Math.random() * s, Math.random() * s, 3 + Math.random() * 5, 2 + Math.random() * 3);
    }
    for (let i = 0; i < 18; i++) {
      c.fillStyle = 'rgba(160,140,110,0.85)';
      c.beginPath();
      c.ellipse(Math.random() * s, Math.random() * s, 10 + Math.random() * 30, 8 + Math.random() * 18, Math.random() * 3, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 3;
    c.beginPath(); c.arc(s / 2, s / 2, s * 0.2, 0, Math.PI * 2); c.stroke();
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
    sun: { color: '#ffe0b0', intensity: 2.6, dir: [-30, 40, 20] },
    hemi: ['#9ec8ff', '#5a4a30', 1.1],
    ambient: (p, dt) => {
      if (Math.random() < dt * 6) p.emit({ x: rand(-20, 20), y: rand(0.5, 6), z: rand(-20, 20), count: 1, dir: [1, 0.2, 0.3], cone: 0.4, speed: 2, color: '#d8f080', size: 0.12, life: 4, drag: 0.1, hdr: 0.8 });
    },
  };
}

function buildTemple(g, rng) {
  const tex = canvasTexture(512, (c, s) => {
    c.fillStyle = '#8c8ca0'; c.fillRect(0, 0, s, s);
    const n = 16;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = 120 + Math.floor(Math.random() * 30);
        c.fillStyle = `rgb(${v},${v - 4},${v + 14})`;
        c.fillRect((x * s) / n + 2, (y * s) / n + 2, s / n - 4, s / n - 4);
      }
    }
    for (let i = 0; i < 300; i++) {
      c.fillStyle = 'rgba(255,170,200,0.8)';
      c.fillRect(Math.random() * s, Math.random() * s, 3, 2);
    }
    c.strokeStyle = 'rgba(200,40,60,0.5)'; c.lineWidth = 5;
    c.beginPath(); c.arc(s / 2, s / 2, s * 0.15, 0, Math.PI * 2); c.stroke();
  });
  g.add(floorDisc(ARENA_RADIUS + 10, tex));
  g.add(edgeRing('#ff7aa0'));
  const red = toonMat('#d8262f');
  const black = toonMat('#2a1e2a');
  const torii = (x, z, a) => {
    const t = new THREE.Group();
    for (const s of [-1, 1]) {
      const post = toonPart(new THREE.CylinderGeometry(0.28, 0.32, 6, 8), red, { outline: 0.04 });
      post.position.set(s * 2.6, 3, 0);
      t.add(post);
    }
    const beam = toonPart(new THREE.BoxGeometry(7.5, 0.45, 0.6), black, { outline: 0.04 });
    beam.position.y = 6.1;
    t.add(beam);
    const beam2 = toonPart(new THREE.BoxGeometry(6.2, 0.35, 0.45), red, { outline: 0.04 });
    beam2.position.y = 5.1;
    t.add(beam2);
    t.position.set(x, 0, z);
    t.rotation.y = a;
    g.add(t);
  };
  ringPlacement(4, ARENA_RADIUS + 3, ARENA_RADIUS + 3, () => 0, (x, z, a) => torii(x, z, a));
  const stone = toonMat('#9a9aa8');
  const lights = [];
  ringPlacement(8, ARENA_RADIUS + 1.5, ARENA_RADIUS + 1.5, () => 0.5, (x, z) => {
    const l = new THREE.Group();
    const base = toonPart(new THREE.CylinderGeometry(0.3, 0.45, 1.2, 6), stone, { outline: 0.03 });
    base.position.y = 0.6;
    const box = toonPart(new THREE.BoxGeometry(0.8, 0.6, 0.8), stone, { outline: 0.03 });
    box.position.y = 1.5;
    const roof = toonPart(new THREE.ConeGeometry(0.75, 0.5, 4), stone, { outline: 0.03 });
    roof.position.y = 2.05; roof.rotation.y = Math.PI / 4;
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.82), glowMat('#ffb050', 2.2));
    glow.position.y = 1.5;
    l.add(base, box, roof, glow);
    l.position.set(x, 0, z);
    g.add(l);
    lights.push(glow);
  });
  const trunk = toonMat('#4a3028');
  const pink = toonMat('#ffb0c8', { flatShading: true });
  ringPlacement(10, ARENA_RADIUS + 6, ARENA_RADIUS + 14, rng, (x, z) => {
    const h = 3 + rng() * 2;
    const tr = toonPart(new THREE.CylinderGeometry(0.25, 0.4, h, 6), trunk, { outline: 0.03 });
    tr.position.set(x, h / 2, z);
    g.add(tr);
    for (let k = 0; k < 3; k++) {
      const c = toonPart(new THREE.IcosahedronGeometry(1.6 + rng(), 0), pink, { outline: 0.04 });
      c.position.set(x + rand(-1, 1), h + rand(0, 1.5), z + rand(-1, 1));
      g.add(c);
    }
  });
  ringPlacement(7, 70, 120, rng, (x, z) => {
    const h = 25 + rng() * 30;
    const m = new THREE.Mesh(new THREE.ConeGeometry(18 + rng() * 10, h, 6), toonMat('#4a3a6a', { flatShading: true }));
    m.position.set(x, h / 2 - 3, z);
    g.add(m);
  });
  const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2d8').multiplyScalar(1.4), fog: false }));
  moon.position.set(-60, 70, -150);
  moon.lookAt(0, 0, 0);
  g.add(moon);
  return {
    sky: skyDome('#1a1240', '#a0508a', '#2a1a3a', 0.6),
    fog: ['#6a3a6a', 40, 170],
    sun: { color: '#ffc8e0', intensity: 1.9, dir: [-25, 35, -30] },
    hemi: ['#b080ff', '#3a2a3a', 1.2],
    update: (t) => { for (const l of lights) l.material.opacity = 0.8 + Math.sin(t * 7 + l.id) * 0.2; },
    ambient: (p, dt) => {
      if (Math.random() < dt * 14) {
        p.emit({ x: rand(-22, 22), y: rand(6, 10), z: rand(-22, 22), count: 1, dir: [0.6, -0.5, 0.2], cone: 0.4, speed: 1.6, color: '#ffa8c8', size: 0.16, life: 6, drag: 0.05, hdr: 0.9 });
      }
    },
  };
}

function buildNeon(g, rng) {
  const tex = canvasTexture(512, (c, s) => {
    c.fillStyle = '#3a3c48'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 1500; i++) {
      const v = 50 + Math.random() * 20;
      c.fillStyle = `rgb(${v},${v},${v + 10})`;
      c.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    c.strokeStyle = '#e8d040'; c.lineWidth = 6;
    c.beginPath(); c.arc(s / 2, s / 2, s * 0.22, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#e8d040'; c.font = 'bold 120px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('H', s / 2, s / 2);
    c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 2;
    for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(0, (i * s) / 8); c.lineTo(s, (i * s) / 8); c.stroke(); }
  });
  g.add(floorDisc(ARENA_RADIUS + 3, tex, { color: new THREE.Color('#c0c4d8') }));
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
    hemi: ['#6a4aff', '#ff2a8a', 1.0],
    update: (t) => { signs.forEach((s, i) => { s.material.opacity = Math.sin(t * 13 + i * 7) > -0.95 ? 1 : 0.2; }); },
    ambient: (p, dt) => {
      const n = Math.floor(dt * 160);
      for (let i = 0; i < n; i++) p.emit({ x: rand(-26, 26), y: 14, z: rand(-26, 26), count: 1, dir: [0.05, -1, 0], cone: 0.02, speed: 26, color: '#a8c8ff', size: 0.06, life: 0.6, drag: 0, hdr: 0.7 });
    },
  };
}

function buildGlacier(g, rng) {
  const tex = canvasTexture(512, (c, s) => {
    const grd = c.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s / 2);
    grd.addColorStop(0, '#d8f4ff'); grd.addColorStop(1, '#9ad0f0');
    c.fillStyle = grd; c.fillRect(0, 0, s, s);
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      c.beginPath();
      let x = Math.random() * s; let y = Math.random() * s;
      c.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += rand(-40, 40); y += rand(-40, 40); c.lineTo(x, y); }
      c.stroke();
    }
    for (let i = 0; i < 600; i++) { c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
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
    sun: { color: '#d0e8ff', intensity: 2.0, dir: [25, 40, -20] },
    hemi: ['#a0d0ff', '#4a6a8a', 1.3],
    update: (t) => { auroraMat.uniforms.uTime.value = t; },
    ambient: (p, dt) => {
      const n = Math.floor(dt * 50) + (Math.random() < (dt * 50) % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) p.emit({ x: rand(-25, 25), y: 12, z: rand(-25, 25), count: 1, dir: [0.3, -1, 0.1], cone: 0.3, speed: 1.6, color: '#ffffff', size: 0.12, life: 7, drag: 0, hdr: 0.9 });
    },
  };
}

function buildVolcano(g, rng) {
  const tex = canvasTexture(512, (c, s) => {
    c.fillStyle = '#2a2026'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 2000; i++) {
      const v = 30 + Math.random() * 25;
      c.fillStyle = `rgb(${v + 6},${v},${v + 2})`;
      c.fillRect(Math.random() * s, Math.random() * s, 4, 3);
    }
    c.lineWidth = 3;
    for (let i = 0; i < 30; i++) {
      c.strokeStyle = i % 2 ? '#ff6a1a' : '#ffb03a';
      c.beginPath();
      let x = Math.random() * s; let y = Math.random() * s;
      c.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += rand(-35, 35); y += rand(-35, 35); c.lineTo(x, y); }
      c.stroke();
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

/** Construit une arène complète (décor + ciel + lumières). */
export function buildArena(id) {
  const group = new THREE.Group();
  const rng = seeded(id.length * 7919 + id.charCodeAt(0));
  const info = (BUILDERS[id] || buildCliffs)(group, rng);
  group.add(info.sky);
  return { id, group, radius: ARENA_RADIUS, ...info };
}
