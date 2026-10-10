import { GROUND_Y, PLAY_BOTTOM } from '../config';
import type { ThicknessId } from '../data/types';
import type { NetNode } from '../entities/Network';
import { StrokeBuilder, convertNode } from './NetworkBuilder';
import { layerBounds } from './SoilSystem';
import type { World } from './World';

/**
 * Joueur automatique pour l'équilibrage : il applique une stratégie simple et
 * raisonnable (axes épais vers les gisements, réserve, relais, ruches près de la surface,
 * sporée en fin d'automne) pour mesurer ce qu'un joueur ordinaire peut obtenir dans
 * chaque forêt. Ce n'est pas une IA de jeu : il sert aux tests d'équilibrage.
 */
export class AutoPlayer {
  private readonly stroke: StrokeBuilder;
  private built = 0;

  constructor(
    private readonly world: World,
    private readonly rhythmScore = 0.7,
  ) {
    this.stroke = new StrokeBuilder(world.net, {
      grid: 4,
      step: 10,
      snapRadius: 6,
      bounds: { minX: 4, maxX: world.widthPx - 4, minY: GROUND_Y + 4, maxY: PLAY_BOTTOM },
      blocked: (x, y) => world.isBlocked(x, y),
    });
  }

  private get heart(): NetNode {
    return [...this.world.net.nodes.values()].find((n) => n.kind === 'heart')!;
  }

  /** Trace un filament d'un nœud vers un point. Retourne le dernier nœud atteint. */
  private grow(from: NetNode, x: number, y: number, thickness: ThicknessId): NetNode | null {
    if (!this.stroke.begin(from.x, from.y)) return null;
    this.stroke.move(x, y, thickness);
    this.stroke.end();
    return this.world.net.findNodeNear(x, y, 12) ?? null;
  }

  /** Nœud n du chemin le plus long partant du cœur vers (x, y). */
  private nodeToward(x: number, y: number, fraction: number): NetNode | undefined {
    const h = this.heart;
    return this.world.net.findNodeNear(h.x + (x - h.x) * fraction, h.y + (y - h.y) * fraction, 8);
  }

  /** Construit une vague du réseau (au printemps de chaque année). */
  build(): void {
    const h = this.heart;
    const wave = this.built++;
    const deposits = this.world.deposits
      .filter((d) => d.amount > 0 && d.layer !== 'surface')
      .sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))
      .slice(wave * 2, wave * 2 + 3);
    deposits.forEach((d, i) => this.grow(h, d.x, d.y, i === 0 ? 'thick' : 'medium'));
    if (wave === 0) {
      // Réserve et relais sur le premier axe, deux ruches sous la surface.
      const first = deposits[0];
      if (first) {
        const storage = this.nodeToward(first.x, first.y, 0.3);
        if (storage && storage.kind === 'junction') convertNode(this.world.net, storage.id, 'storage');
        const relay = this.nodeToward(first.x, first.y, 0.7);
        if (relay && relay.kind === 'junction') convertNode(this.world.net, relay.id, 'relay');
      }
      const surface = layerBounds(this.world.forest).surface;
      for (const dx of [-40, 40]) {
        const tip = this.grow(h, h.x + dx, surface[1] - 6, 'medium');
        if (tip && tip.kind === 'junction') convertNode(this.world.net, tip.id, 'fruiting');
      }
    }
  }

  /** Joue `years` années ; renvoie la meilleure portée obtenue chaque année. */
  play(years: number): { reaches: number[]; segments: number[] } {
    const reaches: number[] = [];
    const segments: number[] = [];
    let lastYear = 0;
    let reach = 0;
    while (this.world.season.year <= years) {
      const s = this.world.season;
      if (s.year !== lastYear) {
        if (lastYear > 0) {
          reaches.push(reach);
          segments.push(this.world.net.segments.size);
        }
        lastYear = s.year;
        reach = 0;
        this.build();
      }
      if (s.def.id === 'autumn' && s.progress > 0.85 && this.world.canSporulate()) {
        reach = this.world.sporulate(this.rhythmScore).reach;
      }
      this.world.step();
    }
    reaches.push(reach);
    segments.push(this.world.net.segments.size);
    return { reaches, segments };
  }
}
