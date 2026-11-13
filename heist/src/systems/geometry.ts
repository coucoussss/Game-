import type { Rect, Vec2 } from '../data/types';

/** Outils géométriques dans le plan horizontal (x, z). Aucune dépendance à Three.js. */

export interface Point {
  x: number;
  z: number;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function toPoint(v: Vec2): Point {
  return { x: v[0], z: v[1] };
}

/** Écart signé entre deux angles, ramené dans ]−π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Angle de la direction a → b (0 = +x, π/2 = +z). */
export function bearing(a: Point, b: Point): number {
  return Math.atan2(b.z - a.z, b.x - a.x);
}

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.min[0] && p.x <= r.max[0] && p.z >= r.min[1] && p.z <= r.max[1];
}

/** Vrai si le segment [a, b] traverse le rectangle (méthode des dalles). */
export function segmentHitsRect(a: Point, b: Point, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const d = [b.x - a.x, b.z - a.z] as const;
  const o = [a.x, a.z] as const;
  for (let axis = 0; axis < 2; axis++) {
    const dir = d[axis] ?? 0;
    const origin = o[axis] ?? 0;
    const lo = r.min[axis] ?? 0;
    const hi = r.max[axis] ?? 0;
    if (Math.abs(dir) < 1e-9) {
      if (origin < lo || origin > hi) return false;
      continue;
    }
    let ta = (lo - origin) / dir;
    let tb = (hi - origin) / dir;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/** Vrai si aucun obstacle ne coupe la ligne de vue entre a et b. */
export function lineOfSight(a: Point, b: Point, obstacles: readonly Rect[]): boolean {
  for (const r of obstacles) if (segmentHitsRect(a, b, r)) return false;
  return true;
}

/**
 * Déplace un cercle de `from` de `delta`, en glissant le long des obstacles.
 * Les axes sont résolus l'un après l'autre, ce qui suffit pour des murs alignés.
 */
export function moveCircle(from: Point, delta: Point, radius: number, obstacles: readonly Rect[]): Point {
  const pos = { x: from.x, z: from.z };
  // On découpe les grands déplacements pour ne jamais traverser un mur fin.
  const steps = Math.max(1, Math.ceil(Math.hypot(delta.x, delta.z) / (radius * 0.5)));
  for (let s = 0; s < steps; s++) {
    pos.x += delta.x / steps;
    for (const r of obstacles) pushOut(pos, radius, r, 'x');
    pos.z += delta.z / steps;
    for (const r of obstacles) pushOut(pos, radius, r, 'z');
  }
  return pos;
}

function pushOut(pos: Point, radius: number, r: Rect, axis: 'x' | 'z'): void {
  const cx = Math.max(r.min[0], Math.min(pos.x, r.max[0]));
  const cz = Math.max(r.min[1], Math.min(pos.z, r.max[1]));
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  if (dx * dx + dz * dz >= radius * radius) return;
  if (axis === 'x') {
    const center = (r.min[0] + r.max[0]) / 2;
    pos.x = pos.x < center ? r.min[0] - radius : r.max[0] + radius;
  } else {
    const center = (r.min[1] + r.max[1]) / 2;
    pos.z = pos.z < center ? r.min[1] - radius : r.max[1] + radius;
  }
}
