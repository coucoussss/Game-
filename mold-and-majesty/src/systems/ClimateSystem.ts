import type { ClimateKind, EventDef, ForestDef, NetworkDef, SeasonDef } from '../data/types';
import type { Ally } from '../entities/Ally';
import type { Network } from '../entities/Network';
import type { Emit } from './events';
import type { Random } from './Random';
import { type Deposit, applyLitter, layerAt, layerBounds } from './SoilSystem';

/** Événement climatique en cours. */
export interface ActiveClimate {
  readonly id: string;
  readonly kind: ClimateKind;
  readonly name: string;
  readonly duration: number;
  ticksLeft: number;
  readonly intensity: number;
  /** Abscisse d'origine (départ du feu, chute de l'arbre). */
  readonly x: number;
}

/** Vitesse de propagation du feu, en pixels par tick (vers la gauche et vers la droite). */
export const FIRE_SPEED = 0.12;
/** Largeur de la ligne de flammes, en pixels. */
export const FIRE_BAND = 14;
/** Durée de repousse d'un arbre brûlé, en ticks (deux saisons de 15 min). */
export const TREE_REGROWTH = 18000;
/** Cendres rendues aux gisements de surface à l'extinction du feu. */
export const ASH_MINERALS = 120;

/** Tire un événement parmi ceux que la forêt et la saison permettent. */
export function rollClimate(events: readonly EventDef[], season: SeasonDef, rng: Random): EventDef | null {
  const weights: Record<string, number> = {};
  for (const e of events) {
    const w = e.seasons[season.id] ?? 0;
    if (w > 0) weights[e.id] = w;
  }
  if (Object.keys(weights).length === 0) return null;
  const id = rng.weighted(weights);
  return events.find((e) => e.id === id)!;
}

export function startClimate(def: EventDef, rng: Random, widthPx: number): ActiveClimate {
  const duration = rng.int(def.duration[0], def.duration[1]);
  return {
    id: def.id,
    kind: def.kind,
    name: def.name,
    duration,
    ticksLeft: duration,
    intensity: def.intensity,
    x: rng.int(20, widthPx - 20),
  };
}

export const climateProgress = (c: ActiveClimate) => 1 - c.ticksLeft / c.duration;

/** Enveloppe d'une crue : montée sur le premier quart, plateau, décrue sur le dernier tiers. */
export function floodEnvelope(progress: number): number {
  if (progress < 0.25) return progress / 0.25;
  if (progress > 0.67) return Math.max(0, (1 - progress) / 0.33);
  return 1;
}

/** Niveau de l'eau (ordonnée de sa surface) : l'eau monte des profondeurs jusqu'à l'humus. */
export function floodLevel(c: ActiveClimate, forest: ForestDef): number {
  const bounds = layerBounds(forest);
  const bottom = bounds.deep[1];
  const top = bounds.humus[0] + 6;
  return bottom - (bottom - top) * floodEnvelope(climateProgress(c));
}

/** Front de flammes : [gauche, droite] de la zone atteinte par le feu. */
export function fireSpan(c: ActiveClimate): [number, number] {
  const reach = FIRE_SPEED * (c.duration - c.ticksLeft);
  return [c.x - reach, c.x + reach];
}

/** Le point x est-il sur une ligne de flammes ? */
export function isBurning(c: ActiveClimate, x: number): boolean {
  const [left, right] = fireSpan(c);
  return (x >= left && x <= left + FIRE_BAND) || (x <= right && x >= right - FIRE_BAND);
}

export interface ClimateContext {
  net: Network;
  netDefs: NetworkDef;
  forest: ForestDef;
  deposits: Deposit[];
  allies: Ally[];
  decay: number;
  emit: Emit;
}

/** Effets d'un tick d'événement climatique sur le réseau, les alliés et le sol. */
export function applyClimate(c: ActiveClimate, ctx: ClimateContext): void {
  if (c.kind === 'flood') {
    // Les filaments sous l'eau se noient ; les épais tiennent plus longtemps.
    const level = floodLevel(c, ctx.forest);
    for (const seg of ctx.net.segments.values()) {
      if (seg.growth < 1 || ctx.net.midpoint(seg).y < level) continue;
      seg.health -= ctx.netDefs.thickness[seg.thickness].decay * c.intensity * ctx.decay;
    }
  } else if (c.kind === 'fire') {
    // Le feu brûle tout ce qui affleure, quelle que soit l'épaisseur, et les arbres.
    for (const seg of ctx.net.segments.values()) {
      const m = ctx.net.midpoint(seg);
      if (layerAt(m.y, ctx.forest) === 'surface' && isBurning(c, m.x)) seg.health -= c.intensity;
    }
    for (const ally of ctx.allies) {
      if (!isBurning(c, ally.x)) continue;
      if (ally.species === 'tree' && ally.state !== 'burnt') {
        ally.state = 'burnt';
        ally.cooldown = TREE_REGROWTH;
        ally.contact = null;
      } else if (ally.species !== 'tree' && ally.state === 'active') {
        // Les bêtes fuient les flammes.
        ally.tx = ally.x < c.x ? Math.max(0, ally.x - 60) : ally.x + 60;
      }
    }
  }
}

/** Effets ponctuels au début et à la fin d'un événement. */
export function onClimateStart(c: ActiveClimate, ctx: ClimateContext): void {
  if (c.kind === 'windfall') {
    // Un arbre tombe : un gisement riche apparaît sous lui, en surface.
    const bounds = layerBounds(ctx.forest);
    ctx.deposits.push({ x: c.x, y: bounds.surface[0] + 6, layer: 'surface', amount: c.intensity, max: c.intensity });
  }
  ctx.emit({ type: 'climate', eventId: c.id, name: c.name, phase: 'start' });
}

export function onClimateEnd(c: ActiveClimate, ctx: ClimateContext): void {
  if (c.kind === 'fire') applyLitter(ctx.deposits, ASH_MINERALS);
  ctx.emit({ type: 'climate', eventId: c.id, name: c.name, phase: 'end' });
}
