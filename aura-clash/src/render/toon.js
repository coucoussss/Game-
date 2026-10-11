// Matériaux « cel-shading » : éclairage en 3 aplats (gradient map) et contour noir
// par coque inversée (une copie agrandie du maillage, rendue en faces arrière).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

let gradient = null;

/** Texture de dégradé à 3 paliers : ombre franche, demi-teinte, lumière. */
export function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([120, 190, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export function toonMat(color, opts = {}) {
  const { flatShading, ...rest } = opts; // le toon de Three.js n'a pas d'ombrage plat : les facettes viennent des géométries
  return new THREE.MeshToonMaterial({ color: new THREE.Color(color), gradientMap: toonGradient(), ...rest });
}

const outlineCache = new Map();
export function outlineMat(color = '#0a0a12') {
  if (!outlineCache.has(color)) {
    outlineCache.set(color, new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.BackSide }));
  }
  return outlineCache.get(color);
}

/**
 * Maillage cel-shadé avec contour. La géométrie doit être centrée sur son origine
 * (on place le maillage avec `position`) : l'épaisseur du contour reste ainsi uniforme.
 */
export function toonPart(geo, mat, { outline = 0.022, shadow = true, outlineColor } = {}) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  if (outline > 0) {
    geo.computeBoundingBox();
    const s = new THREE.Vector3();
    geo.boundingBox.getSize(s);
    const hull = new THREE.Mesh(geo, outlineMat(outlineColor));
    hull.scale.set(
      1 + (2 * outline) / Math.max(s.x, 0.02),
      1 + (2 * outline) / Math.max(s.y, 0.02),
      1 + (2 * outline) / Math.max(s.z, 0.02),
    );
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.userData.outline = true;
    mesh.add(hull);
  }
  return mesh;
}

/** Matériau lumineux (additif), destiné à « baver » dans le bloom. */
export function glowMat(color, intensity = 2, opacity = 1) {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  return new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

/** Texture radiale douce, générée par code (étincelles, halos). */
let radialTex = null;
export function radialTexture() {
  if (radialTex) return radialTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  radialTex = new THREE.CanvasTexture(c);
  return radialTex;
}

/** Bruit de valeur GLSL, partagé par les shaders d'aura, de rayon et de flammes. */
export const GLSL_NOISE = /* glsl */`
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

// --- Contour par extrusion le long des normales (personnages) ------------------------------------
// Plus fidèle que la coque agrandie pour les formes courbes (membres, visage) : l'épaisseur du trait
// est la même partout. Les normales sont lissées (sommets fusionnés) pour que le contour reste fermé
// même autour des arêtes vives.
const smoothCache = new WeakMap();
function smoothOutlineGeo(geo) {
  if (smoothCache.has(geo)) return smoothCache.get(geo);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.getAttribute('position'));
  if (geo.index) g.setIndex(geo.index);
  const merged = mergeVertices(g, 1e-4);
  merged.computeVertexNormals();
  smoothCache.set(geo, merged);
  return merged;
}

const extrudeMats = new Map();
export function extrudeOutlineMat(width, color = '#0a0a12') {
  const key = `${width}|${color}`;
  if (!extrudeMats.has(key)) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.BackSide });
    m.onBeforeCompile = (shader) => {
      // (chevrons construits à part : certains outils prennent « <begin_vertex> » pour une balise HTML)
      const chunk = `#include ${String.fromCharCode(60)}begin_vertex${String.fromCharCode(62)}`;
      shader.vertexShader = shader.vertexShader.replace(
        chunk,
        `vec3 transformed = vec3(position) + normalize(normal) * ${width.toFixed(4)};`,
      );
    };
    m.customProgramCacheKey = () => `outline-${width}`;
    extrudeMats.set(key, m);
  }
  return extrudeMats.get(key);
}

/** Maillage cel-shadé avec contour extrudé (n'exige pas de géométrie centrée). */
export function toonPartSmooth(geo, mat, { outline = 0.018, shadow = true } = {}) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  if (outline > 0) {
    const hull = new THREE.Mesh(smoothOutlineGeo(geo), extrudeOutlineMat(outline));
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.userData.outline = true;
    mesh.add(hull);
  }
  return mesh;
}
