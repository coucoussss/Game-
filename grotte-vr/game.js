// Grotte des Échos — combat actif en VR (WebXR) contre Mousseline, golem de mousse grognon.
// On peut le battre, ou le calmer avec des actions (complimenter, blaguer, écouter) puis l'épargner.
// Jouable aussi au clavier et à la souris.
import * as THREE from "./vendor/three.module.js";

// ---------- réglages ----------
const ARENE = 7.2;            // rayon jouable (m)
const VITESSE = 2.6;          // déplacement (m/s)
const PV_JOUEUR = 20, PV_MONSTRE = 60;
const DEGATS_SORT = 4, DEGATS_ESTOC = 7;

// ---------- rendu ----------
const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x140d26);
scene.fog = new THREE.FogExp2(0x140d26, 0.06);

const rig = new THREE.Group();             // le joueur (on déplace le rig, le casque bouge dedans)
scene.add(rig);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 80);
camera.position.set(0, 1.6, 0);
rig.add(camera);
rig.position.set(0, 0, 4.5);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- outils ----------
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({color, roughness: 0.85, metalness: 0, ...opts});
const glow = (color, intensity = 2) => new THREE.MeshStandardMaterial({color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.6});

// ---------- grotte ----------
scene.add(new THREE.HemisphereLight(0x8c7dff, 0x2a1640, 1.25));
const lune = new THREE.DirectionalLight(0xb7a6ff, 0.6); lune.position.set(-3, 8, 2); scene.add(lune);

function bruit(x, z) { return Math.sin(x * 1.7) * Math.cos(z * 1.3) * 0.5 + Math.sin(x * 4.1 + z * 2.3) * 0.25; }
{
  // sol : disque légèrement bosselé, avec des taches de mousse lumineuse
  const g = new THREE.CircleGeometry(14, 96); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z); p.setY(i, d > ARENE + 0.6 ? bruit(x, z) * 0.35 + (d - ARENE) * 0.12 : bruit(x, z) * 0.03); }
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, mat(0x3a2e57, {roughness: 0.95})));
  // cercle de l'arène
  const bord = new THREE.Mesh(new THREE.RingGeometry(ARENE + 0.05, ARENE + 0.2, 96), glow(0x7a5cff, 0.9));
  bord.rotation.x = -Math.PI / 2; bord.position.y = 0.02; scene.add(bord);
  for (let i = 0; i < 26; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(1.5, ARENE - 0.4);
    const t = new THREE.Mesh(new THREE.CircleGeometry(rnd(0.15, 0.45), 18), glow(i % 3 ? 0x2bd9a0 : 0x5aa9ff, 0.55));
    t.rotation.x = -Math.PI / 2; t.position.set(Math.cos(a) * r, 0.015, Math.sin(a) * r); scene.add(t);
  }
  // parois : cylindre retourné, rocheux
  const w = new THREE.CylinderGeometry(16, 13, 18, 64, 12, true);
  const wp = w.attributes.position;
  for (let i = 0; i < wp.count; i++) {
    const x = wp.getX(i), y = wp.getY(i), z = wp.getZ(i), k = 1 + bruit(x * 0.6 + y * 0.3, z * 0.6 - y * 0.2) * 0.18;
    wp.setX(i, x * k); wp.setZ(i, z * k);
  }
  w.computeVertexNormals();
  const paroi = new THREE.Mesh(w, mat(0x43345f, {side: THREE.BackSide, flatShading: true, emissive: 0x120a22, emissiveIntensity: 1})); paroi.position.y = 7; scene.add(paroi);
  // stalagmites et stalactites
  const pierre = mat(0x4a3a6b, {flatShading: true});
  for (let i = 0; i < 46; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(ARENE + 1, 12.5), h = rnd(0.8, 3.6);
    const c = new THREE.Mesh(new THREE.ConeGeometry(rnd(0.25, 0.8), h, 7), pierre);
    c.position.set(Math.cos(a) * r, h / 2 - 0.1, Math.sin(a) * r); c.rotation.z = rnd(-0.12, 0.12); scene.add(c);
    if (i % 2) { const s = c.clone(); s.rotation.x = Math.PI; s.position.y = rnd(9, 12); s.position.x *= 0.9; s.position.z *= 0.9; scene.add(s); }
  }
  // champignons et cristaux lumineux (peu de lumières réelles, pour le casque)
  const couleurs = [0x46e0ff, 0xff6bd5, 0x8dff7a, 0xffc35a];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rnd(-0.1, 0.1), r = rnd(ARENE + 0.6, ARENE + 2.6), col = couleurs[i % 4], s = rnd(0.6, 1.5);
    const tige = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.08 * s, 0.6 * s, 8), mat(0xe8e0d0));
    tige.position.set(Math.cos(a) * r, 0.3 * s, Math.sin(a) * r); scene.add(tige);
    const chap = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glow(col, 1.6));
    chap.position.set(tige.position.x, 0.6 * s, tige.position.z); scene.add(chap);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4, l = new THREE.PointLight(couleurs[i], 6, 9, 1.6);
    l.position.set(Math.cos(a) * (ARENE + 1.5), 1.2, Math.sin(a) * (ARENE + 1.5)); scene.add(l);
  }
  for (let i = 0; i < 14; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(ARENE + 1.2, 11);
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(rnd(0.2, 0.5), 0), glow(0x9b7bff, 1.4));
    cr.scale.y = rnd(1.8, 3); cr.position.set(Math.cos(a) * r, rnd(0.3, 1.2), Math.sin(a) * r); cr.rotation.set(rnd(-0.3, 0.3), rnd(0, 3), rnd(-0.3, 0.3)); scene.add(cr);
  }
}
// poussières lumineuses
const poussieres = (() => {
  const n = 260, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), r = rnd(0, 11); pos.set([Math.cos(a) * r, rnd(0.2, 6), Math.sin(a) * r], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({color: 0xbfe8ff, size: 0.04, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending}));
  scene.add(p); return p;
})();

// ---------- son (synthétisé) ----------
let ac = null, master = null;
function initAudio() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
  musique();
}
function ton(freq, dur = 0.15, type = "sine", vol = 0.2, glisse = 0, delai = 0) {
  if (!ac) return;
  const t = ac.currentTime + delai, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (glisse) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + glisse), t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function souffle(dur = 0.25, vol = 0.2, filtre = 1200) {
  if (!ac) return;
  const t = ac.currentTime, n = Math.floor(ac.sampleRate * dur), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = b; f.type = "bandpass"; f.frequency.value = filtre; g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}
const SON = {
  sort: () => { ton(880, 0.18, "triangle", 0.12, 600); souffle(0.15, 0.08, 3000); },
  touche: () => { ton(220, 0.12, "square", 0.1, -120); souffle(0.12, 0.15, 900); },
  estoc: () => { souffle(0.18, 0.25, 1800); ton(160, 0.2, "sawtooth", 0.1, -80); },
  bloque: () => { ton(1320, 0.25, "triangle", 0.12, -200); ton(990, 0.3, "sine", 0.08); },
  aie: () => { ton(140, 0.35, "sawtooth", 0.18, -90); },
  alerte: () => { ton(660, 0.12, "sine", 0.12); ton(880, 0.16, "sine", 0.12, 0, 0.12); },
  bip: (grave) => ton(grave ? 210 : 520, 0.04, "square", 0.035),
  joie: () => { [523, 659, 784, 1047].forEach((f, i) => ton(f, 0.35, "triangle", 0.12, 0, i * 0.12)); },
};
function musique() {
  // nappe et arpège doux en la mineur, joués en boucle
  const notes = [57, 60, 64, 67, 64, 60, 55, 59, 62, 66, 62, 59, 53, 57, 60, 64, 60, 57, 52, 56, 59, 64, 59, 56];
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  let i = 0;
  const pas = () => {
    if (!ac) return;
    const m = notes[i % notes.length];
    ton(hz(m + 12), 0.5, "sine", calme ? 0.05 : 0.035);
    if (i % 6 === 0) { ton(hz(m - 12), 2.6, "triangle", 0.05); ton(hz(m - 5), 2.6, "sine", 0.03); }
    i++; setTimeout(pas, calme ? 300 : 230);
  };
  pas();
}

// ---------- texte sur canevas (bulle de dialogue, HUD au poignet) ----------
function panneau(w, h, larg, haut) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(larg, haut), new THREE.MeshBasicMaterial({map: t, transparent: true, depthWrite: false}));
  return {c, ctx: c.getContext("2d"), t, m};
}
function rectArrondi(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

const bulle = panneau(1024, 300, 2.4, 0.7);
bulle.m.renderOrder = 10; scene.add(bulle.m);
let texteCible = "", texteAffiche = 0, texteFin = 0;
function dire(s, duree = 3.2) { texteCible = s; texteAffiche = 0; texteFin = horloge + duree + s.length * 0.03; }
function dessinerBulle() {
  const {ctx, c, t} = bulle;
  ctx.clearRect(0, 0, c.width, c.height);
  if (!texteCible || horloge > texteFin) { bulle.m.visible = false; return; }
  bulle.m.visible = true;
  ctx.fillStyle = "rgba(12,9,22,.92)"; rectArrondi(ctx, 8, 8, c.width - 16, c.height - 16, 40); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = "#f4ecff"; ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.font = "600 46px system-ui, sans-serif"; ctx.textBaseline = "top";
  const mots = texteCible.slice(0, Math.floor(texteAffiche)).split(" "); let ligne = "", y = 40;
  for (const m of mots) { const essai = ligne ? ligne + " " + m : m; if (ctx.measureText(essai).width > c.width - 100) { ctx.fillText(ligne, 50, y); ligne = m; y += 58; } else ligne = essai; }
  ctx.fillText(ligne, 50, y); t.needsUpdate = true;
}

const hudPoignet = panneau(512, 300, 0.2, 0.117);
function dessinerHud() {
  const {ctx, c, t} = hudPoignet;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "rgba(12,9,22,.85)"; rectArrondi(ctx, 4, 4, c.width - 8, c.height - 8, 30); ctx.fill();
  const barre = (y, lab, v, col) => {
    ctx.fillStyle = "#fff"; ctx.font = "600 36px system-ui"; ctx.fillText(lab, 30, y);
    ctx.fillStyle = "rgba(255,255,255,.18)"; rectArrondi(ctx, 30, y + 12, 452, 26, 13); ctx.fill();
    ctx.fillStyle = col; rectArrondi(ctx, 30, y + 12, 452 * clamp(v, 0, 1), 26, 13); ctx.fill();
  };
  barre(60, "Toi", joueur.pv / PV_JOUEUR, "#ff5d7a");
  barre(150, "Mousseline", monstre.pv / PV_MONSTRE, "#7be08a");
  barre(240, monstre.humeur >= 100 ? "Humeur : calmé (Y = épargner)" : "Humeur", monstre.humeur / 100, "#ffe27a");
  t.needsUpdate = true;
  document.getElementById("pvJoueur").style.width = `${100 * joueur.pv / PV_JOUEUR}%`;
  document.getElementById("pvMonstre").style.width = `${100 * monstre.pv / PV_MONSTRE}%`;
  document.getElementById("humeur").style.width = `${monstre.humeur}%`;
}

// ---------- mains : baguette (droite) et bouclier (gauche) ----------
function fabriquerBaguette() {
  const g = new THREE.Group();
  const manche = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.34, 10), mat(0x6b4426, {roughness: 0.6}));
  manche.rotation.x = -Math.PI / 2; manche.position.z = -0.12; g.add(manche);
  const pointe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 1), glow(0xffe27a, 2.5)); pointe.position.z = -0.3; g.add(pointe);
  const halo = new THREE.PointLight(0xffd36a, 1.2, 1.5); halo.position.z = -0.3; g.add(halo);
  g.userData.pointe = pointe; return g;
}
function fabriquerBouclier() {
  const g = new THREE.Group();
  const disque = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 32), mat(0x5c3aa8, {roughness: 0.4, metalness: 0.3}));
  disque.rotation.x = Math.PI / 2; g.add(disque);
  const rune = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 32), glow(0xb996ff, 1.5)); rune.position.z = -0.012; g.add(rune);
  const champ = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.4),
    new THREE.MeshBasicMaterial({color: 0x9b7bff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending}));
  champ.rotation.x = -Math.PI / 2; champ.position.z = -0.05; g.add(champ);
  g.userData.champ = champ; return g;
}
const baguette = fabriquerBaguette();
const bouclier = fabriquerBouclier();

// ---------- état du jeu ----------
let horloge = 0, enJeu = false, modeVR = false, fin = null, calme = false;
const joueur = {pv: PV_JOUEUR, invuln: 0, bouclier: false, recharge: 0, esquive: 0, flash: 0};
const sorts = [], dangers = [];

// voile rouge quand on est touché
const voile = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8), new THREE.MeshBasicMaterial({color: 0xff2040, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false}));
voile.renderOrder = 20; camera.add(voile);

// ---------- Mousseline ----------
const monstre = {pv: PV_MONSTRE, humeur: 0, etat: "attente", t: 0, attaque: 0, actions: {compliment: 0, blague: 0, ecoute: 0}, phase: 1, cible: new THREE.Vector3(), flash: 0, tour: 0};
const corpsM = new THREE.Group(); scene.add(corpsM);
const mousse = mat(0x4f9a4a, {flatShading: true});
const corps = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 2), mousse); corps.scale.set(1.12, 0.95, 1.05); corpsM.add(corps);
for (let i = 0; i < 22; i++) {
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.1, 0.2), 0), mat(i % 3 ? 0x3f8a3f : 0x67b85a, {flatShading: true}));
  const a = rnd(0, 6.28), e = rnd(-0.5, 1.1); b.position.set(Math.cos(a) * 0.72 * Math.cos(e), Math.sin(e) * 0.66, Math.sin(a) * 0.72 * Math.cos(e) * 0.95);
  if (b.position.z < 0.45 || b.position.y > 0.5) corpsM.add(b);
}
const oeil = (x) => {
  const o = new THREE.Group();
  o.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat(0xffffff, {roughness: 0.3})));
  const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), mat(0x111111, {roughness: 0.2})); p.position.z = 0.09; o.add(p);
  o.position.set(x, 0.18, 0.62); corpsM.add(o); return o;
};
const yeux = [oeil(-0.22), oeil(0.22)];
const sourcil = (x, s) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), mat(0x1f3b1d)); m.position.set(x, 0.36, 0.66); m.userData.s = s; corpsM.add(m); return m; };
const sourcils = [sourcil(-0.22, 1), sourcil(0.22, -1)];
const bouche = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.022, 8, 20, Math.PI), mat(0x1f3b1d)); bouche.position.set(0, -0.12, 0.68); corpsM.add(bouche);
const joues = [-0.38, 0.38].map((x) => { const j = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), new THREE.MeshBasicMaterial({color: 0xff7aa8, transparent: true, opacity: 0})); j.position.set(x, -0.02, 0.66); corpsM.add(j); return j; });
// le fameux chapeau
const chapeau = new THREE.Group();
chapeau.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 28), mat(0x6a3fb5)));
const haut = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.36, 24), mat(0x6a3fb5)); haut.position.y = 0.2; chapeau.add(haut);
const ruban = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.07, 24), mat(0xffc35a)); ruban.position.y = 0.06; chapeau.add(ruban);
const fleur = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 1), glow(0xff6bd5, 1.2)); fleur.position.set(0.24, 0.12, 0.1); chapeau.add(fleur);
chapeau.position.y = 0.66; chapeau.rotation.z = 0.12; corpsM.add(chapeau);
const bras = [-1, 1].map((s) => { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8), mousse); b.position.set(s * 0.82, -0.1, 0.1); b.rotation.z = s * 0.9; corpsM.add(b); return b; });
const lueur = new THREE.PointLight(0x7bff9a, 0.5, 3); lueur.position.set(0, 0.9, 1.4); corpsM.add(lueur);
corpsM.position.set(0, 1.25, -2.5);
const ombre = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false}));
ombre.rotation.x = -Math.PI / 2; ombre.position.y = 0.02; scene.add(ombre);

const REPLIQUES = {
  debut: "Encore un visiteur ? Fais demi-tour. Personne ne passe. Personne ne remarque jamais rien, de toute façon.",
  occupe: "Il n'écoute pas : il attaque !",
  compliment: ["…Mon chapeau ? Tu… tu l'as remarqué ?", "Oui, c'est de la mousse véritable. Arrête, tu vas me faire rougir.", "Bon. D'accord. Il est joli. On le sait."],
  blague: ["Pourquoi les champignons sont fun ? Parce que ce sont des fun-gi. …C'est nul. (Il sourit un peu.)", "Une stalactite et une stalagmite se croisent. L'une tombe, l'autre se lève. Ha. Ha.", "Tu m'as déjà fait cette blague. Je ne ris pas. (Il rit.)"],
  ecoute: ["Tu sais, ça fait trois cents ans que je garde ce couloir. Trois cents ans sans un « merci ».", "Avant, il y avait des lucioles ici. Elles me tenaient compagnie.", "…Tu écoutes vraiment ? Bizarre. Agréable, mais bizarre."],
  frappe: ["Aïe ! Voilà pourquoi je ne parle à personne.", "Tu vois ? Tout le monde frappe d'abord.", "Grr. Ma mousse !"],
  calme: "…Personne ne m'avait jamais dit que mon chapeau était joli. Tu peux passer. Si tu veux. (Appuie sur Y pour l'épargner.)",
  pasEncore: "M'épargner ? Ha ! Je ne suis même pas fatigué.",
  phase2: "Assez joué. La grotte entière est avec moi !",
};

// ---------- attaques de Mousseline (lisibles, à esquiver en bougeant ou à bloquer) ----------
const sporeGeo = new THREE.IcosahedronGeometry(0.13, 1);
const sporeMat = glow(0xff6bd5, 2.2);
function lancerSpores() {
  const n = monstre.phase === 2 ? 6 : 4;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sporeGeo, sporeMat); m.position.copy(corpsM.position);
    const vise = positionTete(tmp).clone(); vise.x += rnd(-0.6, 0.6); vise.y += rnd(-0.3, 0.2);
    const v = vise.sub(m.position).normalize().multiplyScalar(monstre.phase === 2 ? 3.8 : 3.0);
    scene.add(m); dangers.push({type: "spore", m, v, vie: 6, retard: i * 0.28});
  }
}
const epineGeo = new THREE.ConeGeometry(0.09, 0.45, 6); epineGeo.translate(0, 0.22, 0);
const epineMat = glow(0x8dff7a, 1.4);
function lancerAnneau() {
  const trou = Math.atan2(positionJoueur(tmp).z - corpsM.position.z, positionJoueur(tmp).x - corpsM.position.x) + rnd(-1.4, 1.4);
  const largeur = monstre.phase === 2 ? 0.75 : 1.05, n = 64;
  const g = new THREE.Group(); g.position.set(corpsM.position.x, 0, corpsM.position.z); scene.add(g);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2; if (Math.abs(Math.atan2(Math.sin(a - trou), Math.cos(a - trou))) < largeur / 2) continue;
    const e = new THREE.Mesh(epineGeo, epineMat); e.position.set(Math.cos(a), 0, Math.sin(a)); e.userData.a = a; g.add(e);
  }
  // repère au sol de l'ouverture
  const sortie = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 24), glow(0xffe27a, 1.5));
  sortie.rotation.x = -Math.PI / 2; g.add(sortie); sortie.userData.trou = trou;
  dangers.push({type: "anneau", g, r: 0.6, trou, largeur, vie: 4, sortie});
}
function lancerCharge() {
  const depart = corpsM.position.clone(); depart.y = 1.25;
  const fin = positionJoueur(new THREE.Vector3()); fin.y = 1.25;
  const dir = fin.clone().sub(depart); dir.y = 0; const long = Math.min(dir.length() + 2, 11); dir.normalize();
  const arrivee = depart.clone().addScaledVector(dir, long);
  arrivee.x = clamp(arrivee.x, -ARENE, ARENE); arrivee.z = clamp(arrivee.z, -ARENE, ARENE);
  const ligne = new THREE.Mesh(new THREE.PlaneGeometry(1.3, depart.distanceTo(arrivee)), new THREE.MeshBasicMaterial({color: 0xff3355, transparent: true, opacity: 0.0, depthWrite: false}));
  ligne.rotation.x = -Math.PI / 2; ligne.rotation.z = -Math.atan2(arrivee.z - depart.z, arrivee.x - depart.x) + Math.PI / 2;
  ligne.position.set((depart.x + arrivee.x) / 2, 0.03, (depart.z + arrivee.z) / 2); scene.add(ligne);
  dangers.push({type: "charge", ligne, depart, arrivee, t: 0, prep: monstre.phase === 2 ? 0.75 : 1.0, touche: false});
}
const ATTAQUES = [lancerSpores, lancerAnneau, lancerCharge];

// ---------- positions utiles ----------
function positionTete(v) { return camera.getWorldPosition(v); }
function positionJoueur(v) { camera.getWorldPosition(v); v.y = 0; return v; }

function blesserJoueur(n, source) {
  if (joueur.invuln > 0 || fin) return;
  joueur.pv = Math.max(0, joueur.pv - n); joueur.invuln = 0.9; joueur.flash = 1; SON.aie(); vibrer(0.8, 160);
  if (source) { tmp.copy(positionJoueur(tmp2)).sub(source).setY(0).normalize().multiplyScalar(0.6); rig.position.add(tmp); }
  dessinerHud();
  if (joueur.pv <= 0) terminer("defaite");
}
function blesserMonstre(n, estoc) {
  if (fin || calme) return;
  monstre.pv = Math.max(0, monstre.pv - n); monstre.flash = 1; monstre.humeur = Math.max(0, monstre.humeur - 10);
  estoc ? SON.estoc() : SON.touche();
  if (Math.random() < 0.35) dire(REPLIQUES.frappe[Math.floor(Math.random() * 3)], 2);
  if (monstre.phase === 1 && monstre.pv < PV_MONSTRE * 0.5) { monstre.phase = 2; dire(REPLIQUES.phase2, 2.5); }
  dessinerHud();
  if (monstre.pv <= 0) terminer("combat");
}

// ---------- actions (à la manière d'un RPG : on peut gagner sans frapper) ----------
function agir(type) {
  if (fin) return;
  if (calme) { if (type === "epargner") terminer("paix"); return; }
  if (type === "epargner") { dire(monstre.humeur >= 100 ? REPLIQUES.calme : REPLIQUES.pasEncore, 2.6); return; }
  if (monstre.etat === "preparation" || monstre.etat === "attaque") { dire(REPLIQUES.occupe, 1.4); SON.bip(true); return; }
  const k = monstre.actions[type]++;
  const gain = {compliment: [34, 14, 4], blague: [22, 12, 6], ecoute: [26, 16, 8]}[type][Math.min(k, 2)];
  monstre.humeur = clamp(monstre.humeur + gain, 0, 100);
  dire(REPLIQUES[type][Math.min(k, 2)], 3.4);
  if (monstre.humeur >= 100) {
    calme = true; monstre.etat = "calme"; SON.joie();
    for (const d of dangers) retirerDanger(d); dangers.length = 0;
    setTimeout(() => dire(REPLIQUES.calme, 6), 2600);
  }
  monstre.t = Math.max(monstre.t, 1.2); // laisse le temps de lire
  dessinerHud();
}

function retirerDanger(d) {
  if (d.m) scene.remove(d.m); if (d.g) scene.remove(d.g); if (d.ligne) scene.remove(d.ligne);
}

function terminer(type) {
  fin = type;
  for (const d of dangers) retirerDanger(d); dangers.length = 0;
  const textes = {
    paix: "Mousseline s'écarte et te laisse passer. Il ajuste son chapeau, fier. Tu as gagné sans un seul coup… presque.",
    combat: "Mousseline s'effondre en un tas de mousse. Le chapeau roule à tes pieds. Tu as gagné. Il fait soudain très calme.",
    defaite: "Tu tombes. Au loin, Mousseline marmonne : « Je t'avais prévenu. » Le combat recommence…",
  };
  dire(textes[type], 8);
  if (type === "paix") SON.joie();
  setTimeout(() => {
    if (type === "defaite") reinitialiser();
    else afficherEcran(type === "paix" ? "Fin pacifique 🌱" : "Fin du combat", "Rejouer");
  }, type === "defaite" ? 4500 : 7000);
}

function reinitialiser() {
  joueur.pv = PV_JOUEUR; joueur.invuln = 1.5; monstre.pv = PV_MONSTRE; monstre.humeur = 0; monstre.phase = 1;
  monstre.actions = {compliment: 0, blague: 0, ecoute: 0}; monstre.etat = "attente"; monstre.t = 3; calme = false; fin = null;
  for (const d of dangers) retirerDanger(d); dangers.length = 0;
  for (const s of sorts) scene.remove(s.m); sorts.length = 0;
  rig.position.set(0, 0, 4.5); rig.rotation.y = 0; corpsM.position.set(0, 1.25, -2.5);
  dessinerHud(); dire(REPLIQUES.debut, 4);
}

// ---------- sorts du joueur ----------
const sortGeo = new THREE.IcosahedronGeometry(0.07, 1), sortMat = glow(0xffe27a, 3);
function lancerSort() {
  if (joueur.recharge > 0 || fin) return;
  joueur.recharge = 0.42;
  const m = new THREE.Mesh(sortGeo, sortMat);
  const p = baguette.userData.pointe.getWorldPosition(new THREE.Vector3());
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(baguette.getWorldQuaternion(tmpQ));
  m.position.copy(p); scene.add(m); sorts.push({m, v: dir.multiplyScalar(10), vie: 2});
  SON.sort(); vibrer(0.3, 40, "droite");
}

// ---------- entrées ----------
const manettes = {gauche: null, droite: null};       // XRInputSource
const prises = [renderer.xr.getControllerGrip(0), renderer.xr.getControllerGrip(1)];
prises.forEach((p, i) => {
  rig.add(p);
  p.addEventListener("connected", (e) => {
    const main = e.data.handedness === "left" ? "gauche" : "droite";
    manettes[main] = e.data; p.userData.main = main;
    if (main === "droite") p.add(baguette); else { p.add(bouclier); hudPoignet.m.position.set(0.06, 0.05, 0.06); hudPoignet.m.rotation.set(-1.1, 0.5, 0.2); p.add(hudPoignet.m); }
  });
  p.addEventListener("disconnected", () => { manettes[p.userData.main] = null; });
});
function vibrer(force, ms, main) {
  for (const k of main ? [main] : ["gauche", "droite"]) {
    const h = manettes[k]?.gamepad?.hapticActuators?.[0];
    if (h?.pulse) h.pulse(force, ms);
  }
}
const precedents = {gauche: [], droite: []};
function bouton(main, i) { return !!manettes[main]?.gamepad?.buttons?.[i]?.pressed; }
function vientDAppuyer(main, i) { const b = bouton(main, i), p = precedents[main][i]; return b && !p; }

// clavier / souris (mode ordinateur)
const touches = new Set(); let lacet = 0, tangage = 0, sourisBouclier = false;
addEventListener("keydown", (e) => {
  touches.add(e.code);
  if (!enJeu) return;
  if (e.code === "Digit1") agir("compliment");
  if (e.code === "Digit2") agir("blague");
  if (e.code === "Digit3") agir("ecoute");
  if (e.code === "Digit4") agir("epargner");
  if (e.code === "Space" && joueur.esquive <= 0) { joueur.esquive = 0.7; joueur.dash = 0.18; souffle(0.2, 0.12, 700); }
});
addEventListener("keyup", (e) => touches.delete(e.code));
renderer.domElement.addEventListener("mousedown", (e) => {
  if (!enJeu || modeVR) return;
  if (document.pointerLockElement !== renderer.domElement) { renderer.domElement.requestPointerLock(); return; }
  if (e.button === 0) lancerSort(); if (e.button === 2) sourisBouclier = true;
});
addEventListener("mouseup", (e) => { if (e.button === 2) sourisBouclier = false; });
addEventListener("contextmenu", (e) => e.preventDefault());
addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  lacet -= e.movementX * 0.0022; tangage = clamp(tangage - e.movementY * 0.0022, -1.3, 1.3);
});

// ---------- écran d'accueil ----------
const ecran = document.getElementById("ecran"), btnVR = document.getElementById("btnVR"), btnPC = document.getElementById("btnPC");
function afficherEcran(titre, bouton) {
  ecran.style.display = "flex"; ecran.querySelector("h1").textContent = titre; btnPC.textContent = bouton === "Rejouer" ? "Rejouer sur ordinateur" : "Jouer sur ordinateur";
  document.getElementById("hud").style.display = "none"; document.getElementById("viseur").style.display = "none";
  enJeu = false; if (document.pointerLockElement) document.exitPointerLock();
  renderer.xr.getSession()?.end();
}
function demarrer() {
  initAudio(); ecran.style.display = "none"; enJeu = true; reinitialiser();
  if (!modeVR) {
    camera.add(baguette); baguette.position.set(0.22, -0.2, -0.35);
    camera.add(bouclier); bouclier.scale.setScalar(0.45); bouclier.position.set(-0.3, -0.2, -0.5); bouclier.rotation.set(0, 0.35, 0);
    document.getElementById("hud").style.display = "block"; document.getElementById("viseur").style.display = "block";
    renderer.domElement.requestPointerLock?.();
  }
}
btnPC.addEventListener("click", () => { modeVR = false; demarrer(); });
if (navigator.xr) {
  navigator.xr.isSessionSupported("immersive-vr").then((ok) => {
    btnVR.disabled = !ok; btnVR.textContent = ok ? "Entrer en VR" : "VR non disponible ici";
  });
} else { btnVR.textContent = "VR non disponible ici"; }
btnVR.addEventListener("click", async () => {
  const session = await navigator.xr.requestSession("immersive-vr", {optionalFeatures: ["local-floor", "bounded-floor"]});
  modeVR = true; camera.position.set(0, 0, 0);
  renderer.xr.setFoveation?.(0.6);
  await renderer.xr.setSession(session);
  session.addEventListener("end", () => { modeVR = false; camera.position.set(0, 1.6, 0); if (enJeu) afficherEcran("Grotte des Échos", "Jouer"); });
  demarrer();
});

// ---------- boucle ----------
const avant = new THREE.Vector3(), droite = new THREE.Vector3(), ancienPointe = new THREE.Vector3(), pointe = new THREE.Vector3();
let tourneBloque = false, estocRecharge = 0;
const chrono = new THREE.Clock();

function majJoueur(dt) {
  joueur.invuln = Math.max(0, joueur.invuln - dt); joueur.recharge = Math.max(0, joueur.recharge - dt);
  joueur.esquive = Math.max(0, joueur.esquive - dt); joueur.flash = Math.max(0, joueur.flash - dt * 2.5);
  voile.material.opacity = joueur.flash * 0.45;
  let mx = 0, mz = 0;
  if (modeVR) {
    const g = manettes.gauche?.gamepad, d = manettes.droite?.gamepad;
    if (g?.axes) { mx = g.axes[2] ?? 0; mz = g.axes[3] ?? 0; }
    if (d?.axes) {
      const tx = d.axes[2] ?? 0;
      if (Math.abs(tx) > 0.7 && !tourneBloque) {
        // rotation par crans autour de la tête
        const tete = positionTete(new THREE.Vector3()), a = -Math.sign(tx) * Math.PI / 6;
        rig.position.sub(tete).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(tete); rig.rotation.y += a; tourneBloque = true;
      } else if (Math.abs(tx) < 0.3) tourneBloque = false;
    }
    joueur.bouclier = bouton("gauche", 1);
    if (bouton("droite", 0) && joueur.recharge <= 0) lancerSort();
    if (vientDAppuyer("droite", 4)) agir("compliment");
    if (vientDAppuyer("droite", 5)) agir("blague");
    if (vientDAppuyer("gauche", 4)) agir("ecoute");
    if (vientDAppuyer("gauche", 5)) agir("epargner");
    for (const k of ["gauche", "droite"]) precedents[k] = (manettes[k]?.gamepad?.buttons ?? []).map((b) => b.pressed);
  } else {
    camera.rotation.set(tangage, 0, 0, "YXZ"); rig.rotation.y = lacet;
    if (touches.has("KeyW") || touches.has("KeyZ") || touches.has("ArrowUp")) mz -= 1;
    if (touches.has("KeyS") || touches.has("ArrowDown")) mz += 1;
    if (touches.has("KeyA") || touches.has("KeyQ") || touches.has("ArrowLeft")) mx -= 1;
    if (touches.has("KeyD") || touches.has("ArrowRight")) mx += 1;
    joueur.bouclier = sourisBouclier;
  }
  if (Math.hypot(mx, mz) < 0.15) { mx = 0; mz = 0; }
  camera.getWorldDirection(avant); avant.y = 0; avant.normalize(); droite.crossVectors(avant, new THREE.Vector3(0, 1, 0));
  let v = VITESSE;
  if (joueur.dash > 0) { joueur.dash -= dt; v = 11; if (!mx && !mz) mz = -1; }
  rig.position.addScaledVector(avant, -mz * v * dt).addScaledVector(droite, mx * v * dt);
  // reste dans l'arène (on contraint la position de la tête)
  const t = positionJoueur(tmp), d = Math.hypot(t.x, t.z);
  if (d > ARENE) { rig.position.x -= t.x * (1 - ARENE / d); rig.position.z -= t.z * (1 - ARENE / d); }
  // ne traverse pas Mousseline
  const dm = Math.hypot(t.x - corpsM.position.x, t.z - corpsM.position.z);
  if (dm < 1.0 && !calme) { const k = (1.0 - dm) / Math.max(dm, 0.01); rig.position.x += (t.x - corpsM.position.x) * k; rig.position.z += (t.z - corpsM.position.z) * k; }

  // bouclier : champ lumineux quand il est levé
  bouclier.userData.champ.material.opacity += ((joueur.bouclier ? 0.35 : 0) - bouclier.userData.champ.material.opacity) * Math.min(1, dt * 14);
  if (!modeVR) bouclier.position.lerp(tmp.set(joueur.bouclier ? -0.14 : -0.3, joueur.bouclier ? -0.12 : -0.2, -0.5), Math.min(1, dt * 14));

  // estoc : mouvement rapide de la baguette près de Mousseline
  estocRecharge = Math.max(0, estocRecharge - dt);
  baguette.userData.pointe.getWorldPosition(pointe);
  const vitessePointe = pointe.distanceTo(ancienPointe) / Math.max(dt, 1e-3);
  ancienPointe.copy(pointe);
  if (modeVR && vitessePointe > 3.2 && estocRecharge <= 0 && pointe.distanceTo(corpsM.position) < 1.05) {
    estocRecharge = 0.5; blesserMonstre(DEGATS_ESTOC, true); vibrer(1, 90, "droite");
  }
}

function majSorts(dt) {
  for (let i = sorts.length - 1; i >= 0; i--) {
    const s = sorts[i]; s.vie -= dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += dt * 8;
    let fini = s.vie <= 0;
    if (!fini && s.m.position.distanceTo(corpsM.position) < 0.85) { blesserMonstre(DEGATS_SORT); fini = true; }
    // un sort peut aussi détruire une spore
    for (const d of dangers) if (d.type === "spore" && d.m.visible && d.m.position.distanceTo(s.m.position) < 0.25) { d.vie = 0; fini = true; SON.bloque(); }
    if (fini) { scene.remove(s.m); sorts.splice(i, 1); }
  }
}

function bouclierProtege(pos, portee = 0.42) {
  if (!joueur.bouclier) return false;
  if (!modeVR) {
    const tete = camera.getWorldPosition(tmp2), dir = camera.getWorldDirection(new THREE.Vector3());
    const v = pos.clone().sub(tete), d = v.length();
    return d < 0.9 && v.normalize().dot(dir) > 0.55;
  }
  return bouclier.getWorldPosition(tmp2).distanceTo(pos) < portee;
}

function majDangers(dt) {
  const tete = positionTete(new THREE.Vector3()), pieds = positionJoueur(new THREE.Vector3());
  for (let i = dangers.length - 1; i >= 0; i--) {
    const d = dangers[i];
    if (d.type === "spore") {
      if (d.retard > 0) { d.retard -= dt; d.m.visible = false; d.m.position.copy(corpsM.position); continue; }
      d.m.visible = true; d.vie -= dt;
      // très léger guidage : on peut l'esquiver en se décalant
      tmp.copy(tete).sub(d.m.position).normalize().multiplyScalar(d.v.length());
      d.v.lerp(tmp, Math.min(1, dt * 0.35)); d.m.position.addScaledVector(d.v, dt); d.m.rotation.y += dt * 4;
      d.m.scale.setScalar(1 + Math.sin(horloge * 18) * 0.12);
      if (bouclierProtege(d.m.position)) { d.vie = 0; SON.bloque(); vibrer(0.5, 60, "gauche"); }
      else if (d.m.position.distanceTo(tete) < 0.38 || d.m.position.distanceTo(tmp2.copy(tete).setY(tete.y - 0.5)) < 0.38) { d.vie = 0; blesserJoueur(3, d.m.position); }
      if (d.vie <= 0) { retirerDanger(d); dangers.splice(i, 1); }
    } else if (d.type === "anneau") {
      d.vie -= dt; d.r += dt * (monstre.phase === 2 ? 3.6 : 2.9);
      d.g.children.forEach((e) => { if (e.userData.a !== undefined) { e.position.set(Math.cos(e.userData.a) * d.r, 0, Math.sin(e.userData.a) * d.r); e.scale.y = Math.min(1, (4 - d.vie) * 3); } });
      d.sortie.position.set(Math.cos(d.trou) * (d.r + 0.6), 0.04, Math.sin(d.trou) * (d.r + 0.6));
      const dx = pieds.x - d.g.position.x, dz = pieds.z - d.g.position.z, dist = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
      const dansTrou = Math.abs(Math.atan2(Math.sin(ang - d.trou), Math.cos(ang - d.trou))) < d.largeur / 2;
      if (Math.abs(dist - d.r) < 0.25 && !dansTrou) blesserJoueur(4, d.g.position);
      if (d.vie <= 0 || d.r > 13) { retirerDanger(d); dangers.splice(i, 1); }
    } else if (d.type === "charge") {
      d.t += dt;
      if (d.t < d.prep) { d.ligne.material.opacity = 0.15 + 0.25 * Math.abs(Math.sin(d.t * 12)); corpsM.position.x += Math.sin(horloge * 60) * 0.01; }
      else {
        const k = clamp((d.t - d.prep) / 0.55, 0, 1);
        corpsM.position.lerpVectors(d.depart, d.arrivee, Easing(k)); d.ligne.material.opacity = 0.3 * (1 - k);
        if (!d.touche && Math.hypot(pieds.x - corpsM.position.x, pieds.z - corpsM.position.z) < 1.0) { d.touche = true; blesserJoueur(5, corpsM.position); }
        if (k >= 1) { retirerDanger(d); dangers.splice(i, 1); }
      }
    }
  }
}
const Easing = (k) => 1 - (1 - k) ** 3;

function majMonstre(dt) {
  monstre.t -= dt; monstre.flash = Math.max(0, monstre.flash - dt * 4);
  const tete = positionTete(new THREE.Vector3());
  // regarde le joueur
  const cible = Math.atan2(tete.x - corpsM.position.x, tete.z - corpsM.position.z);
  corpsM.rotation.y += Math.atan2(Math.sin(cible - corpsM.rotation.y), Math.cos(cible - corpsM.rotation.y)) * Math.min(1, dt * 5);
  const enCharge = dangers.some((d) => d.type === "charge");
  if (!enCharge) corpsM.position.y = 1.25 + Math.sin(horloge * 2) * 0.08;

  if (!fin && !calme && enJeu) {
    if (monstre.etat === "attente") {
      // flotte autour du centre en gardant ses distances
      if (!enCharge) {
        monstre.tour += dt * 0.35;
        const r = 2.4, cx = Math.cos(monstre.tour) * r, cz = Math.sin(monstre.tour) * r - 0.5;
        corpsM.position.x += (cx - corpsM.position.x) * Math.min(1, dt * 0.8); corpsM.position.z += (cz - corpsM.position.z) * Math.min(1, dt * 0.8);
      }
      if (monstre.t <= 0) { monstre.etat = "preparation"; monstre.t = monstre.phase === 2 ? 0.75 : 1.05; monstre.attaque = (monstre.attaque + 1 + Math.floor(Math.random() * 2)) % 3; SON.alerte(); }
    } else if (monstre.etat === "preparation") {
      corps.scale.setScalar(1 + Math.sin(horloge * 30) * 0.04).multiply(tmp.set(1.12, 0.95, 1.05));
      if (monstre.t <= 0) { ATTAQUES[monstre.attaque](); monstre.etat = "attaque"; monstre.t = monstre.attaque === 1 ? 2.4 : 1.8; }
    } else if (monstre.etat === "attaque") {
      if (monstre.t <= 0) { monstre.etat = "attente"; monstre.t = rnd(2.4, 3.6) * (monstre.phase === 2 ? 0.7 : 1); corps.scale.set(1.12, 0.95, 1.05); }
    }
  }
  if (calme) { corpsM.position.x += (0 - corpsM.position.x) * dt * 0.5; corpsM.position.z += (-3 - corpsM.position.z) * dt * 0.5; }
  // expression : sourcils, bouche, joues selon l'humeur
  const h = monstre.humeur / 100;
  sourcils.forEach((s) => { s.rotation.z = s.userData.s * (0.5 - h * 0.75); s.position.y = 0.36 + h * 0.05; });
  bouche.rotation.z = h > 0.5 ? Math.PI : 0; bouche.position.y = h > 0.5 ? -0.06 : -0.12;
  joues.forEach((j) => { j.material.opacity = h * 0.8; });
  yeux.forEach((o) => { o.scale.y = (Math.sin(horloge * 0.9) > 0.985) ? 0.15 : 1; });
  bras.forEach((b, i) => { b.rotation.z = (i ? 1 : -1) * (0.9 + Math.sin(horloge * 3 + i) * 0.15) * (monstre.etat === "preparation" ? -0.6 : 1); });
  mousse.emissive.setRGB(monstre.flash, monstre.flash * 0.3, monstre.flash * 0.3);
  mousse.color.setHex(calme ? 0x68c36a : monstre.phase === 2 ? 0x3d7f3a : 0x4f9a4a);
  chapeau.rotation.z = 0.12 + Math.sin(horloge * 1.5) * 0.04 + (calme ? -0.1 : 0);
  ombre.position.x = corpsM.position.x; ombre.position.z = corpsM.position.z;
  // bulle au-dessus de lui, tournée vers le joueur
  bulle.m.position.copy(corpsM.position).add(tmp.set(0, 1.35, 0)); bulle.m.lookAt(tete);
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(chrono.getDelta(), 0.05); horloge += dt;
  if (enJeu && !fin) { majJoueur(dt); majSorts(dt); majDangers(dt); }
  else if (enJeu) { majJoueur(dt); majSorts(dt); }
  majMonstre(dt);
  if (texteCible && texteAffiche < texteCible.length) {
    const avantN = Math.floor(texteAffiche); texteAffiche += dt * 38;
    if (Math.floor(texteAffiche) !== avantN && avantN % 2 === 0) SON.bip(true);
  }
  dessinerBulle();
  poussieres.rotation.y += dt * 0.02;
  renderer.render(scene, camera);
});

// expose pour les tests
window.__grotte = {joueur, monstre, agir, lancerSort, ATTAQUES, etat: () => ({fin, calme, enJeu, dangers: dangers.length})};
dessinerHud();
