import { GROUND_Y, TILE } from '../config';
import type { ForestDef, Layer, NetworkDef, SoilDef } from '../data/types';
import { LAYERS } from '../data/types';
import type { Network } from '../entities/Network';
import type { Random } from './Random';

/** Gisement de minéraux dans le sol. */
export interface Deposit {
  readonly x: number;
  readonly y: number;
  readonly layer: Layer;
  amount: number;
  readonly max: number;
}

/** Bornes verticales [haut, bas) de chaque couche, en pixels. */
export function layerBounds(forest: ForestDef): Record<Layer, [number, number]> {
  const surface = GROUND_Y + forest.layers.surface * TILE;
  const humus = surface + forest.layers.humus * TILE;
  const deep = humus + forest.layers.deep * TILE;
  return { surface: [GROUND_Y, surface], humus: [surface, humus], deep: [humus, deep] };
}

/** Couche du sol à l'ordonnée y, ou null au-dessus du sol (et sous la dernière couche). */
export function layerAt(y: number, forest: ForestDef): Layer | null {
  const bounds = layerBounds(forest);
  return LAYERS.find((layer) => y >= bounds[layer][0] && y < bounds[layer][1]) ?? null;
}

/** Répartit les gisements de la forêt au hasard dans leurs couches. */
export function generateDeposits(forest: ForestDef, widthPx: number, rng: Random): Deposit[] {
  const bounds = layerBounds(forest);
  const deposits: Deposit[] = [];
  for (const layer of LAYERS) {
    const { count, amount } = forest.deposits[layer];
    const [top, bottom] = bounds[layer];
    for (let i = 0; i < count; i++) {
      deposits.push({
        x: rng.int(8, widthPx - 8),
        y: rng.int(top + 3, bottom - 3),
        layer,
        amount,
        max: amount,
      });
    }
  }
  return deposits;
}

/** L'humidité du sol suit la météo, lentement. */
export function stepMoisture(moisture: number, target: number, rate: number): number {
  return moisture + (target - moisture) * rate;
}

/** Humidité ressentie dans une couche : les couches profondes amortissent la météo. */
export function layerMoisture(layer: Layer, moisture: number, soil: SoilDef): number {
  const buffer = soil.layerBuffer[layer];
  return moisture + (1 - moisture) * buffer;
}

/**
 * Chaque nœud boit l'eau du sol (selon l'humidité et la couche ; rien dans la surface gelée)
 * et extrait les minéraux des gisements à sa portée, qui s'épuisent.
 */
export function absorb(
  net: Network,
  deposits: Deposit[],
  soil: SoilDef,
  forest: ForestDef,
  moisture: number,
  frozenSurface: boolean,
): void {
  for (const node of net.nodes.values()) {
    const layer = layerAt(node.y, forest);
    if (!layer) continue;
    if (!(frozenSurface && layer === 'surface')) {
      node.stock.water += soil.waterRate * layerMoisture(layer, moisture, soil) * soil.layerWater[layer];
    }
    for (const deposit of deposits) {
      if (deposit.amount <= 0) continue;
      if (Math.hypot(deposit.x - node.x, deposit.y - node.y) > soil.mineralRadius) continue;
      const taken = Math.min(deposit.amount, soil.mineralRate);
      deposit.amount -= taken;
      node.stock.minerals += taken;
    }
  }
}

/**
 * Le gel abîme les segments dont le milieu est dans la couche de surface, d'autant plus
 * qu'ils sont fins (proportionnellement à leur `decay`). Un segment épais et nourri résiste.
 */
export function applyFrost(
  net: Network,
  defs: NetworkDef,
  forest: ForestDef,
  intensity: number,
  decayModifier: number,
): void {
  if (intensity <= 0) return;
  for (const seg of net.segments.values()) {
    if (seg.growth < 1) continue;
    const a = net.nodes.get(seg.a)!;
    const b = net.nodes.get(seg.b)!;
    if (layerAt((a.y + b.y) / 2, forest) !== 'surface') continue;
    seg.health -= defs.thickness[seg.thickness].decay * intensity * decayModifier;
  }
}

/** Les feuilles mortes reconstituent les gisements de surface, sans dépasser leur maximum. */
export function applyLitter(deposits: Deposit[], amount: number): void {
  const surface = deposits.filter((d) => d.layer === 'surface');
  if (amount <= 0 || surface.length === 0) return;
  for (const d of surface) d.amount = Math.min(d.max, d.amount + amount / surface.length);
}
