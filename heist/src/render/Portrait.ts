import * as THREE from 'three';
import { Human, lookFor, type PoseName } from './models/human';

/**
 * Studio de portraits (développement) : tous les personnages alignés sous un éclairage neutre, pour juger
 * du modelé, des visages et des animations. `?portrait` dans l'adresse ; `window.__portrait` pour piloter.
 */
export class Portrait {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.02, 100);
  readonly humans: { human: Human; role: string; x: number }[] = [];
  pose: PoseName = 'idle';
  focus = 0;
  view: 'face' | 'body' | 'lineup' | 'back' | 'hands' = 'body';
  private time = 0;
  private readonly gaze = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#2a2c30');
    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#3a3028', 1.1));
    const key = new THREE.DirectionalLight('#fff4e6', 2.4);
    key.position.set(3, 5, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -16;
    sc.right = sc.top = 16;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#9fc0ff', 1.4);
    rim.position.set(-4, 3, -5);
    this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: '#3a3c40', roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const roles: [string, number][] = [
      ['clerk', 0], ['jeweler', 0], ['teller', 0], ['teller', 1], ['guard', 0], ['watchman', 0], ['officer', 0], ['officer', 2],
      ['fence', 0], ['pedestrian', 0], ['pedestrian', 1], ['pedestrian', 2], ['pedestrian', 3], ['pedestrian', 4], ['pedestrian', 5],
    ];
    roles.forEach(([role, v], i) => {
      const human = new Human(lookFor(role, v));
      const x = (i - (roles.length - 1) / 2) * 0.9;
      this.scene.add(human.root);
      this.humans.push({ human, role: `${role} ${v}`, x });
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  frame(dt: number): void {
    this.time += dt;
    const target = this.humans[this.focus];
    const fx = target?.x ?? 0;
    const hgt = target?.human.root.scale.y ?? 1;
    switch (this.view) {
      case 'face':
        this.camera.position.set(fx + 0.12, 1.66 * hgt, 0.62);
        this.camera.lookAt(fx, 1.64 * hgt, 0);
        break;
      case 'hands':
        this.camera.position.set(fx + 0.5, 1.0, 0.7);
        this.camera.lookAt(fx + 0.15, 0.85, 0);
        break;
      case 'back':
        this.camera.position.set(fx - 0.6, 1.4, -2.2);
        this.camera.lookAt(fx, 1.0, 0);
        break;
      case 'lineup':
        this.camera.position.set(0, 1.4, 16);
        this.camera.lookAt(0, 0.95, 0);
        break;
      default:
        this.camera.position.set(fx + 0.7, 1.35, 2.6);
        this.camera.lookAt(fx, 0.95, 0);
    }
    this.gaze.copy(this.camera.position);
    for (const h of this.humans) {
      h.human.gaze = this.gaze;
      h.human.setDetail(true);
      h.human.update(dt, h.x, 0, Math.PI / 2, this.pose, this.pose === 'run' ? 4.5 : 1.4);
    }
    this.renderer.render(this.scene, this.camera);
  }

  run(): void {
    let last = performance.now();
    const loop = (now: number) => {
      this.frame(Math.min(0.1, (now - last) / 1000));
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
