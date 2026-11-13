import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Construction d'un personnage à peau déformable (« skinning ») à partir de pièces modelées par code.
 *
 * On déclare des os, on accroche des maillages à ces os comme des pièces rigides, puis `build` fusionne
 * toutes les pièces d'un même matériau en un seul `SkinnedMesh`. Chaque sommet suit son os, et peut se
 * partager entre plusieurs os (genoux, coudes, cou, mâchoire) grâce à une fonction de poids : la peau se
 * plie au lieu de se casser, et un personnage complet ne coûte qu'une dizaine d'appels de dessin.
 */

/** Influences d'un sommet : liste de [nom d'os, poids]. Les poids sont normalisés ensuite. */
export type Weights = readonly (readonly [string, number])[];

export interface PartOptions {
  /** Poids par sommet, à partir de sa position dans l'espace de l'os porteur. */
  readonly weights?: (p: THREE.Vector3) => Weights;
  /** Détail fin (doigts, coutures, cils…) : masqué de loin, sans ombre portée. */
  readonly detail?: boolean;
  /** Ne projette pas d'ombre. */
  readonly noShadow?: boolean;
}

interface Part {
  readonly bone: THREE.Bone;
  readonly mesh: THREE.Mesh;
  readonly opts: PartOptions;
}

/** Lissage d'Hermite entre a et b. */
export function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Poids d'un segment de membre qui pend sous son articulation (y négatif dans l'espace de l'os) :
 * près de l'articulation, il se partage avec l'os parent pour une pliure douce.
 */
export function blendTop(self: string, parent: string, zone: number): (p: THREE.Vector3) => Weights {
  return (p) => {
    const t = smooth(0, zone, -p.y);
    const w = 0.5 + 0.5 * t;
    return [
      [self, w],
      [parent, 1 - w],
    ];
  };
}

export class RigBuilder {
  readonly bones: THREE.Bone[] = [];
  readonly byName = new Map<string, THREE.Bone>();
  private readonly parts: Part[] = [];

  /** Déclare un os, placé relativement à son parent. Le premier os déclaré est la racine. */
  bone(name: string, parent: string | null, x: number, y: number, z: number): THREE.Bone {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    if (parent) this.get(parent).add(b);
    this.bones.push(b);
    this.byName.set(name, b);
    return b;
  }

  get(name: string): THREE.Bone {
    const b = this.byName.get(name);
    if (!b) throw new Error(`Os inconnu : ${name}`);
    return b;
  }

  /** Accroche une pièce à un os. Le maillage est placé dans l'espace de l'os. */
  add(bone: string, mesh: THREE.Mesh, opts: PartOptions = {}): THREE.Mesh {
    const b = this.get(bone);
    b.add(mesh);
    this.parts.push({ bone: b, mesh, opts });
    return mesh;
  }

  /**
   * Fusionne les pièces par matériau en maillages à peau, liés au squelette. Le squelette doit être en
   * pose de repos et la racine à l'origine.
   */
  build(root: THREE.Object3D): { meshes: THREE.SkinnedMesh[]; detail: THREE.SkinnedMesh[]; skeleton: THREE.Skeleton } {
    const top = this.bones[0];
    if (!top) throw new Error('Squelette vide');
    root.add(top);
    root.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const index = new Map<THREE.Bone, number>();
    this.bones.forEach((b, i) => index.set(b, i));

    const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; detail: boolean; shadow: boolean }>();
    const local = new THREE.Vector3();
    const partMatrix = new THREE.Matrix4();
    for (const part of this.parts) {
      const mat = part.mesh.material as THREE.Material;
      let geo = (part.mesh.geometry as THREE.BufferGeometry).clone();
      for (const name of Object.keys(geo.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
      }
      if (!geo.getAttribute('normal')) geo.computeVertexNormals();
      const count = geo.getAttribute('position').count;
      if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      if (!geo.index) {
        const idx = new Uint32Array(count);
        for (let i = 0; i < count; i++) idx[i] = i;
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
      }

      // Poids : calculés dans l'espace de l'os porteur, avant de passer dans l'espace du modèle.
      const skinIndex = new Uint16Array(count * 4);
      const skinWeight = new Float32Array(count * 4);
      const pos = geo.getAttribute('position');
      part.mesh.updateMatrix();
      const selfIndex = index.get(part.bone) ?? 0;
      for (let i = 0; i < count; i++) {
        let ws: Weights = [];
        if (part.opts.weights) {
          local.fromBufferAttribute(pos, i).applyMatrix4(part.mesh.matrix);
          ws = part.opts.weights(local);
        }
        if (ws.length === 0) {
          skinIndex[i * 4] = selfIndex;
          skinWeight[i * 4] = 1;
          continue;
        }
        const sorted = [...ws].filter((w) => w[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const total = sorted.reduce((s, w) => s + w[1], 0) || 1;
        sorted.forEach(([name, w], k) => {
          skinIndex[i * 4 + k] = index.get(this.get(name)) ?? selfIndex;
          skinWeight[i * 4 + k] = w / total;
        });
      }
      partMatrix.multiplyMatrices(rootInv, part.mesh.matrixWorld);
      geo.applyMatrix4(partMatrix);
      if (partMatrix.determinant() < 0) {
        // Échelle négative : on remet les triangles à l'endroit.
        const idx = geo.index;
        if (idx) for (let t = 0; t < idx.count; t += 3) {
          const a = idx.getX(t + 1);
          idx.setX(t + 1, idx.getX(t + 2));
          idx.setX(t + 2, a);
        }
      }
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
      // Index en 32 bits partout, pour que la fusion soit homogène.
      if (!(geo.index?.array instanceof Uint32Array) && geo.index) geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(geo.index.array as ArrayLike<number>), 1));

      const detail = part.opts.detail === true;
      const shadow = !detail && !part.opts.noShadow && mat.userData.noShadow !== true;
      const key = `${mat.uuid}|${detail ? 1 : 0}|${shadow ? 1 : 0}`;
      let b = buckets.get(key);
      if (!b) {
        b = { mat, geos: [], detail, shadow };
        buckets.set(key, b);
      }
      b.geos.push(geo);
      part.bone.remove(part.mesh);
      geo = geo as THREE.BufferGeometry;
    }

    const skeleton = new THREE.Skeleton(this.bones);
    const meshes: THREE.SkinnedMesh[] = [];
    const detail: THREE.SkinnedMesh[] = [];
    for (const b of buckets.values()) {
      const merged = mergeGeometries(b.geos, false);
      for (const g of b.geos) g.dispose();
      if (!merged) continue;
      const m = new THREE.SkinnedMesh(merged, b.mat);
      m.bind(skeleton, new THREE.Matrix4());
      m.castShadow = b.shadow;
      m.receiveShadow = true;
      // Sphère englobante large et fixe : couvre toutes les poses, y compris couché au sol.
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, -0.3), 1.9);
      m.frustumCulled = true;
      root.add(m);
      (b.detail ? detail : meshes).push(m);
    }
    return { meshes, detail, skeleton };
  }
}
