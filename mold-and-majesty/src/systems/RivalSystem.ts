import { GROUND_Y, PLAY_BOTTOM } from '../config';
import type { ForestDef, NetworkDef, SeasonDef, ThreatsDef } from '../data/types';
import type { Network } from '../entities/Network';
import { type RivalColony, cellKey } from '../entities/Rival';
import type { Emit } from './events';
import type { Random } from './Random';
import { type Deposit, layerBounds } from './SoilSystem';

/*
 * Moisissures rivales et guerre chimique.
 * Une colonie grandit cellule par cellule et sécrète des toxines qui abîment les segments
 * proches (les fins plus que les épais, comme le gel). En retour, chaque nœud riche en
 * signal sécrète des antifongiques qui détruisent les cellules à sa portée, au prix de sucre.
 * Le signal, et donc les relais, deviennent l'arme du réseau.
 */

export interface RivalContext {
  net: Network;
  netDefs: NetworkDef;
  threats: ThreatsDef;
  forest: ForestDef;
  deposits: Deposit[];
  season: SeasonDef;
  widthPx: number;
  rng: Random;
  /** Multiplicateur de dépérissement (mémoire). */
  decay: number;
  emit: Emit;
  nextId: () => number;
  /** Terrain infranchissable (gravats). */
  blocked?: (x: number, y: number) => boolean;
}

/** Bornes de la grille des cellules : tout le sol jouable. */
export function cellBounds(ctx: Pick<RivalContext, 'threats' | 'forest' | 'widthPx'>) {
  const cs = ctx.threats.rivals.cellSize;
  const bottom = Math.min(layerBounds(ctx.forest).deep[1], PLAY_BOTTOM);
  return {
    minGx: 1,
    maxGx: Math.floor(ctx.widthPx / cs) - 2,
    minGy: Math.ceil((GROUND_Y + 2) / cs),
    maxGy: Math.floor(bottom / cs) - 1,
  };
}

export const cellCenter = (g: number, cs: number) => g * cs + cs / 2;

/** Fait naître une colonie, loin du cœur. Retourne null si aucun emplacement ne convient. */
export function spawnColony(colonies: RivalColony[], ctx: RivalContext, kind?: string): RivalColony | null {
  const { rivals } = ctx.threats;
  if (colonies.length >= rivals.maxColonies) return null;
  const kinds = Object.keys(rivals.kinds);
  const kindId = kind ?? kinds[ctx.rng.int(0, kinds.length - 1)]!;
  const b = cellBounds(ctx);
  const heart = [...ctx.net.nodes.values()].find((n) => n.kind === 'heart');
  for (let attempt = 0; attempt < 20; attempt++) {
    const gx = ctx.rng.int(b.minGx, b.maxGx);
    const gy = ctx.rng.int(b.minGy, b.maxGy);
    const x = cellCenter(gx, rivals.cellSize);
    const y = cellCenter(gy, rivals.cellSize);
    if (heart && Math.hypot(heart.x - x, heart.y - y) < rivals.minDistance) continue;
    const colony: RivalColony = { id: ctx.nextId(), kind: kindId, cells: new Map() };
    const hp = rivals.kinds[kindId]!.hp;
    colony.cells.set(cellKey(gx, gy), { gx, gy, hp });
    colonies.push(colony);
    for (let i = 1; i < rivals.startCells; i++) grow(colony, colonies, ctx, 1);
    ctx.emit({ type: 'rival', colonyId: colony.id, phase: 'spawn', x, y });
    return colony;
  }
  return null;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Une tentative de croissance : une cellule au hasard s'étend vers une case voisine libre. */
function grow(colony: RivalColony, colonies: RivalColony[], ctx: RivalContext, chance: number): void {
  const kind = ctx.threats.rivals.kinds[colony.kind]!;
  if (colony.cells.size >= kind.maxCells || ctx.rng.next() >= chance) return;
  // Cellule au hasard, sans recopier toute la colonie.
  let skip = ctx.rng.int(0, colony.cells.size - 1);
  let from = colony.cells.values().next().value!;
  for (const cell of colony.cells.values()) {
    if (skip-- === 0) {
      from = cell;
      break;
    }
  }
  const [dx, dy] = DIRS[ctx.rng.int(0, 3)]!;
  const gx = from.gx + dx;
  const gy = from.gy + dy;
  const b = cellBounds(ctx);
  if (gx < b.minGx || gx > b.maxGx || gy < b.minGy || gy > b.maxGy) return;
  const key = cellKey(gx, gy);
  if (colonies.some((c) => c.cells.has(key))) return;
  if (ctx.blocked?.(cellCenter(gx, ctx.threats.rivals.cellSize), cellCenter(gy, ctx.threats.rivals.cellSize))) return;
  colony.cells.set(key, { gx, gy, hp: kind.hp });
}

export function growColonies(colonies: RivalColony[], ctx: RivalContext): void {
  const activity = ctx.threats.rivals.seasons[ctx.season.id] ?? 0;
  for (const colony of colonies) {
    grow(colony, colonies, ctx, ctx.threats.rivals.kinds[colony.kind]!.growthChance * activity);
  }
}

/** Boîte englobante (en cases) d'une colonie, pour écarter vite celles qui sont loin. */
interface Bounds {
  minGx: number;
  maxGx: number;
  minGy: number;
  maxGy: number;
}

function colonyBounds(colony: RivalColony): Bounds {
  const b = { minGx: Infinity, maxGx: -Infinity, minGy: Infinity, maxGy: -Infinity };
  for (const c of colony.cells.values()) {
    if (c.gx < b.minGx) b.minGx = c.gx;
    if (c.gx > b.maxGx) b.maxGx = c.gx;
    if (c.gy < b.minGy) b.minGy = c.gy;
    if (c.gy > b.maxGy) b.maxGy = c.gy;
  }
  return b;
}

/** Parcourt les cellules de toutes les colonies à moins de `radius` pixels de (x, y). */
function forEachCellNear(
  colonies: readonly RivalColony[],
  cs: number,
  x: number,
  y: number,
  radius: number,
  visit: (colony: RivalColony, key: number) => void,
  bounds?: readonly Bounds[],
): void {
  const r = Math.ceil(radius / cs);
  const cx = Math.floor(x / cs);
  const cy = Math.floor(y / cs);
  colonies.forEach((colony, i) => {
    const b = bounds?.[i];
    if (b && (cx + r < b.minGx || cx - r > b.maxGx || cy + r < b.minGy || cy - r > b.maxGy)) return;
    for (let gx = cx - r; gx <= cx + r; gx++) {
      const dx = cellCenter(gx, cs) - x;
      for (let gy = cy - r; gy <= cy + r; gy++) {
        const dy = cellCenter(gy, cs) - y;
        if (dx * dx + dy * dy > radius * radius) continue;
        const key = cellKey(gx, gy);
        if (colony.cells.has(key)) visit(colony, key);
      }
    }
  });
}

/** Les toxines abîment les segments actifs proches des colonies. */
export function applyToxins(colonies: RivalColony[], ctx: RivalContext): void {
  if (colonies.length === 0) return;
  const cs = ctx.threats.rivals.cellSize;
  const bounds = colonies.map(colonyBounds);
  for (const seg of ctx.net.segments.values()) {
    if (seg.growth < 1) continue;
    const m = ctx.net.midpoint(seg);
    let exposure = 0;
    colonies.forEach((colony, i) => {
      const kind = ctx.threats.rivals.kinds[colony.kind]!;
      let count = 0;
      forEachCellNear([colony], cs, m.x, m.y, kind.toxin.radius, () => count++, [bounds[i]!]);
      exposure = Math.max(exposure, kind.toxin.intensity * Math.min(1, count / 3));
    });
    if (exposure > 0) seg.health -= ctx.netDefs.thickness[seg.thickness].decay * exposure * ctx.decay;
  }
}

/** Les nœuds riches en signal détruisent les cellules à leur portée, en payant en sucre. */
export function chemicalDefense(colonies: RivalColony[], ctx: RivalContext): void {
  if (colonies.length === 0) return;
  const { defense, rivals } = ctx.threats;
  const bounds = colonies.map(colonyBounds);
  for (const node of ctx.net.nodes.values()) {
    const fill = node.stock.signal / ctx.netDefs.nodes[node.kind].capacity;
    if (fill < defense.minSignal) continue;
    forEachCellNear(colonies, rivals.cellSize, node.x, node.y, defense.radius, (colony, key) => {
      if (node.stock.sugar < defense.sugarCost) return;
      node.stock.sugar -= defense.sugarCost;
      const cell = colony.cells.get(key)!;
      cell.hp -= defense.damage * fill;
      if (cell.hp <= 0) colony.cells.delete(key);
    }, bounds);
  }
}

/** Les colonies dévorent les minéraux des gisements qu'elles recouvrent. */
export function feedColonies(colonies: RivalColony[], ctx: RivalContext): void {
  const cs = ctx.threats.rivals.cellSize;
  const bounds = colonies.map(colonyBounds);
  for (const d of ctx.deposits) {
    forEachCellNear(colonies, cs, d.x, d.y, cs * 1.5, (colony) => {
      d.amount = Math.max(0, d.amount - ctx.threats.rivals.kinds[colony.kind]!.appetite);
    }, bounds);
  }
}

/** Un tick de moisissures. Retourne le nombre de colonies anéanties. */
export function stepRivals(colonies: RivalColony[], ctx: RivalContext, allowSpawn: boolean): number {
  const { rivals } = ctx.threats;
  if (allowSpawn && ctx.rng.next() < rivals.chancePerTick * (rivals.seasons[ctx.season.id] ?? 0)) {
    spawnColony(colonies, ctx);
  }
  growColonies(colonies, ctx);
  applyToxins(colonies, ctx);
  chemicalDefense(colonies, ctx);
  feedColonies(colonies, ctx);
  let defeated = 0;
  for (let i = colonies.length - 1; i >= 0; i--) {
    const colony = colonies[i]!;
    if (colony.cells.size > 0) continue;
    colonies.splice(i, 1);
    defeated++;
    ctx.emit({ type: 'rival', colonyId: colony.id, phase: 'defeated', x: 0, y: 0 });
  }
  return defeated;
}
