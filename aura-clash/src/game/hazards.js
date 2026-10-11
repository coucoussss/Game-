// Arènes interactives : chaque lieu a sa règle, simulée ici (logique pure, donc identique en réseau).
//   cliffs  : piliers de pierre destructibles en bordure (on y projette l'adversaire)
//   temple  : lanternes de pierre destructibles qui explosent en flammes spirituelles
//   neon    : sol mouillé par la pluie, et panneaux électriques qui crépitent par intermittence
//   glacier : sol glissant (moins d'adhérence), stalagmites qui explosent en éclats
//   volcano : la lave déborde par vagues : une couronne brûlante qui avance depuis le bord
import { FIGHTER_RADIUS } from './constants.js';

export const HAZARD_INFO = {
  cliffs: 'Piliers destructibles',
  temple: 'Lanternes explosives',
  neon: 'Panneaux électriques',
  glacier: 'Sol glissant et stalagmites',
  volcano: 'Marée de lave',
};

const PROPS = {
  cliffs: { n: 6, r: 14.5, hp: 60, kind: 'pillar' },
  temple: { n: 6, r: 14, hp: 60, kind: 'lantern' },
  glacier: { n: 5, r: 13.5, hp: 70, kind: 'stalagmite' },
};

/** État initial des obstacles d'une arène. */
export function createHazards(arena) {
  const p = PROPS[arena];
  const props = [];
  if (p) {
    for (let i = 0; i < p.n; i++) {
      const a = (i / p.n) * Math.PI * 2 + 0.35;
      props.push({ id: i, kind: p.kind, x: Math.cos(a) * p.r, z: Math.sin(a) * p.r, hp: p.hp, maxHp: p.hp, alive: true, respawn: 0 });
    }
  }
  return { arena, props, t: 0, lava: 0, lavaPhase: 0, zap: [], zapT: 6 };
}

/** Rayon de lave depuis le bord (mètres envahis), selon la phase du cycle. */
function lavaReach(h) {
  // Cycle de 26 s : 14 s calme, la lave monte 4 s, reste 4 s, redescend 4 s
  const c = h.lavaPhase % 26;
  if (c < 14) return 0;
  if (c < 18) return ((c - 14) / 4) * 3.2;
  if (c < 22) return 3.2;
  return ((26 - c) / 4) * 3.2;
}

/**
 * Avance d'un tick. `m` : le match (combattants, applyHit, emit, arenaRadius).
 */
export function updateHazards(h, m, dt) {
  h.t += dt;
  const fighters = m.fighters;
  // Obstacles détruits : ils réapparaissent au bout de 20 s
  for (const p of h.props) {
    if (!p.alive) {
      p.respawn -= dt;
      if (p.respawn <= 0) { p.alive = true; p.hp = p.maxHp; m.emit('prop', { id: p.id, alive: true }); }
      continue;
    }
    // Un combattant projeté dans un obstacle le percute (et le brise s'il arrive assez vite)
    for (const f of fighters) {
      if (!f.alive && f.state !== 'ko') continue;
      const dx = f.x - p.x;
      const dz = f.z - p.z;
      const d = Math.hypot(dx, dz);
      const min = 0.9 + FIGHTER_RADIUS;
      if (d >= min) continue;
      const sp = Math.hypot(f.vx, f.vz);
      const nx = d > 1e-3 ? dx / d : 1;
      const nz = d > 1e-3 ? dz / d : 0;
      f.x = p.x + nx * min;
      f.z = p.z + nz * min;
      const flying = f.state === 'hitstun' || f.state === 'ko';
      if (flying && sp > 6) {
        damageProp(h, m, p, sp * 8, f);
        f.vx *= -0.3; f.vz *= -0.3;
        if (f.alive) { f.hp = Math.max(1, f.hp - 25); f.lastHurt = 0; }
        m.emit('fx', { fx: 'wallHit', x: f.x, y: f.y + 1, z: f.z });
        m.emit('shake', { amt: 0.4 });
      }
    }
  }
  // Volcan : marée de lave depuis le bord
  if (h.arena === 'volcano') {
    h.lavaPhase += dt;
    const reach = lavaReach(h);
    if ((reach > 0) !== (h.lava > 0)) m.emit('lava', { rising: reach > 0 });
    h.lava = reach;
    if (reach > 0) {
      const R = m.arenaRadius - reach;
      for (const f of fighters) {
        if (!f.alive || f.y > 0.6) continue;
        if (Math.hypot(f.x, f.z) < R) continue;
        f.burnT = (f.burnT || 0) - dt;
        if (f.burnT <= 0) {
          f.burnT = 0.5;
          const d = Math.hypot(f.x, f.z) || 1;
          m.applyHit(m.envAttacker(), f, { dmg: 22, type: 'heavy', unblockable: true, kb: 9, up: 6 }, -f.x / d, -f.z / d, { x: f.x * 1.1, z: f.z * 1.1 });
          m.emit('fx', { fx: 'flameburst', x: f.x, y: 1, z: f.z });
        }
      }
    }
  }
  // Toits : panneaux électriques qui s'allument au hasard ; zone électrifiée pendant 1,5 s
  if (h.arena === 'neon') {
    h.zapT -= dt;
    if (h.zapT <= 0) {
      h.zapT = 7 + ((h.t * 7.3) % 5);
      const a = (h.t * 2.17) % (Math.PI * 2);
      const r = 5 + ((h.t * 3.1) % 8);
      h.zap.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, warn: 1.2, t: 1.5, r: 2.2 });
      m.emit('zapWarn', { x: Math.cos(a) * r, z: Math.sin(a) * r, r: 2.2 });
    }
    for (const z of h.zap) {
      if (z.warn > 0) { z.warn -= dt; if (z.warn <= 0) m.emit('zap', { x: z.x, z: z.z, r: z.r }); continue; }
      z.t -= dt;
      for (const f of fighters) {
        if (!f.alive || f.y > 1 || f.zapLock > 0) continue;
        if (Math.hypot(f.x - z.x, f.z - z.z) > z.r) continue;
        f.zapLock = 0.6;
        m.applyHit(m.envAttacker(), f, { dmg: 30, type: 'heavy', unblockable: true, stun: 0.6, kb: 2 }, 0, 0, { x: z.x, z: z.z });
      }
    }
    for (const f of fighters) if (f.zapLock > 0) f.zapLock -= dt;
    h.zap = h.zap.filter((z) => z.t > 0);
  }
}

/** Le glacier est glissant : facteur d'adhérence au sol (1 = normal). */
export function groundGrip(h) {
  return h && h.arena === 'glacier' ? 0.35 : 1;
}

/** Un coup ou une explosion touche les obstacles proches. */
export function hitProps(h, m, x, z, r, dmg) {
  if (!h) return;
  for (const p of h.props) {
    if (p.alive && Math.hypot(p.x - x, p.z - z) < r + 0.9) damageProp(h, m, p, dmg, null);
  }
}

function damageProp(h, m, p, dmg, cause) {
  p.hp -= dmg;
  m.emit('prop', { id: p.id, alive: true, hit: true, x: p.x, z: p.z });
  if (p.hp > 0) return;
  p.alive = false;
  p.respawn = 20;
  m.emit('prop', { id: p.id, alive: false, x: p.x, z: p.z, kind: p.kind });
  m.emit('shake', { amt: 0.5 });
  // Explosion de l'obstacle : les lanternes libèrent des flammes, les stalagmites des éclats
  const blast = { lantern: { dmg: 45, r: 3.2, type: 'kd' }, stalagmite: { dmg: 35, r: 2.8, type: 'launch' }, pillar: { dmg: 25, r: 2.4, type: 'heavy' } }[p.kind];
  if (blast) {
    for (const f of m.fighters) {
      if (!f.alive || f === cause) continue;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d > blast.r) continue;
      m.applyHit(m.envAttacker(), f, { dmg: blast.dmg, type: blast.type, unblockable: false }, (f.x - p.x) / (d || 1), (f.z - p.z) / (d || 1), { x: p.x, z: p.z });
    }
  }
}
