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
        // Trait d'encre : plus fin sur les faces tournées vers le haut, plus épais dessous et sur les côtés
        `vec3 nrm = normalize(normal);
        vec3 transformed = vec3(position) + nrm * ${width.toFixed(4)} * (1.2 - 0.45 * max(0.0, nrm.y));`,
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

// --- Matériau « anime » des personnages -------------------------------------------------------
// Deux aplats francs (lumière / ombre), comme dans un dessin animé, et un liseré de lumière sur les
// bords (rim light) qui détache la silhouette du décor. Le visage reçoit des ombres très claires,
// comme les visages d'anime, presque jamais assombris.
const gradients = {};
function stepGradient(key, values) {
  if (gradients[key]) return gradients[key];
  const t = new THREE.DataTexture(new Uint8Array(values), values.length, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  gradients[key] = t;
  return t;
}

export function animeMat(color, { face = false, rim = 0.32, tone = true, rimLight = 0, ...extra } = {}) {
  const { flatShading, ...rest } = extra;
  const m = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: face ? stepGradient('face', [205, 255]) : stepGradient('anime', [150, 255]),
    ...rest,
  });
  const k = rim.toFixed(3);
  m.onBeforeCompile = (shader) => {
    const marker = '#include ' + String.fromCharCode(60) + 'opaque_fragment' + String.fromCharCode(62);
    shader.fragmentShader = shader.fragmentShader.replace(marker, `
      float rimF = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      outgoingLight += diffuseColor.rgb * ${k} * smoothstep(0.6, 0.7, rimF);
      ${rimLight ? `outgoingLight += vec3(1.0, 0.95, 0.9) * ${rimLight.toFixed(3)} * smoothstep(0.72, 0.85, rimF); // liseré de contre-jour` : ''}
      ${face || !tone ? '' : `
      #if NUM_DIR_LIGHTS > 0
        // Trame manga : points réguliers (grille à 45°) dans les zones à l'ombre
        float ndl = dot(normalize(normal), directionalLights[0].direction);
        float shadowZone = 1.0 - smoothstep(-0.08, 0.06, ndl);
        vec2 sp = gl_FragCoord.xy * 0.70710678;
        vec2 cell = fract(vec2(sp.x - sp.y, sp.x + sp.y) / 3.2) - 0.5;
        float dotMask = 1.0 - smoothstep(0.24, 0.34, length(cell));
        outgoingLight *= 1.0 - shadowZone * dotMask * 0.22;
      #endif`}
      ${marker}`);
  };
  m.customProgramCacheKey = () => `anime-${k}-${face ? 1 : 0}-${tone ? 1 : 0}-${rimLight}`;
  return m;
}
