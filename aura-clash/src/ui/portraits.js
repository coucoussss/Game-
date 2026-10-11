// Portraits des personnages : chaque modèle 3D est rendu une fois au démarrage, en gros plan,
// dans une petite image (utilisée par l'écran de sélection et l'interface de combat).
import * as THREE from 'three';
import { CharacterModel } from '../render/model.js';
import { CHARACTERS } from '../game/characters.js';
import { MONSTERS } from '../game/monsters.js';

export function renderPortraits() {
  const out = {};
  const size = 256;
  let renderer;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out; // pas de WebGL : les cartes utiliseront leurs initiales
  }
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  for (const def of [...CHARACTERS, ...MONSTERS]) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a3050', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 2.4);
    sun.position.set(2, 3, 4);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(def.aura, 3);
    rim.position.set(-3, 2, -3);
    scene.add(rim);
    const model = new CharacterModel(def);
    scene.add(model.root);
    model.update(0.016, { x: 0, y: 0, z: 0, yaw: -0.35, vx: 0, vy: 0, vz: 0, state: 'idle', st: 0, onGround: true, flash: 0 });
    for (let i = 0; i < 30; i++) model.update(0.03, { x: 0, y: 0, z: 0, yaw: -0.35, vx: 0, vy: 0, vz: 0, state: 'idle', st: 0, onGround: true, flash: 0 });
    model.aura.visible = false;
    const head = new THREE.Vector3();
    model.head.getWorldPosition(head);
    const k = def.look.size || 1; // les géants sont cadrés de plus loin
    camera.position.set(head.x + 0.25 * k, head.y + 0.05 * k, head.z + 1.9 * k);
    camera.lookAt(head.x, head.y - 0.12 * k, head.z);
    renderer.setClearColor(0x000000, 0);
    renderer.render(scene, camera);
    out[def.id] = renderer.domElement.toDataURL('image/png');
    model.dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss?.();
  return out;
}
