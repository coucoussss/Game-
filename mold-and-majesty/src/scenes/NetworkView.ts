import Phaser from 'phaser';
import type { FluxId, NetworkDef, NodeKind } from '../data/types';
import type { Network } from '../entities/Network';
import { PALETTE } from '../ui/text';

/** Calque optionnel : colore le réseau selon le remplissage d'un flux. */
export type FluxOverlay = FluxId | null;

const NODE_STYLE: Record<NodeKind, { size: number; color: number }> = {
  heart: { size: 5, color: 0xf2c46d },
  junction: { size: 2, color: PALETTE.mycelium },
  storage: { size: 4, color: 0xc98f4a },
  relay: { size: 4, color: PALETTE.signal },
  fruiting: { size: 4, color: 0xd86a8f },
};

const lerpColor = (from: number, to: number, t: number): number => {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(
    Phaser.Display.Color.ValueToColor(from),
    Phaser.Display.Color.ValueToColor(to),
    100,
    Math.round(Phaser.Math.Clamp(t, 0, 1) * 100),
  );
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
};

/** Dessine le réseau : segments (épaisseur, pousse, santé) et nœuds (rôle, construction). */
export class NetworkView {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly net: Network,
    private readonly defs: NetworkDef,
  ) {
    this.graphics = scene.add.graphics().setDepth(5);
  }

  draw(overlay: FluxOverlay): void {
    const g = this.graphics.clear();
    const fill = (id: number, flux: FluxId) => {
      const node = this.net.nodes.get(id)!;
      return node.stock[flux] / this.defs.nodes[node.kind].capacity;
    };

    for (const seg of this.net.segments.values()) {
      const a = this.net.nodes.get(seg.a)!;
      const b = this.net.nodes.get(seg.b)!;
      const width = this.defs.thickness[seg.thickness].width;
      if (seg.growth < 1) {
        // Filament en pousse : seule la partie déjà poussée est visible.
        g.lineStyle(width, PALETTE.mycelium, 0.5);
        g.lineBetween(a.x, a.y, a.x + (b.x - a.x) * seg.growth, a.y + (b.y - a.y) * seg.growth);
        continue;
      }
      // Un segment sous-alimenté pâlit vers une teinte flétrie et devient translucide.
      let color = lerpColor(PALETTE.withered, PALETTE.mycelium, seg.health);
      if (overlay) {
        const level = (fill(seg.a, overlay) + fill(seg.b, overlay)) / 2;
        color = lerpColor(PALETTE.withered, PALETTE[overlay], Math.sqrt(level));
      }
      g.lineStyle(width, color, 0.35 + 0.65 * seg.health);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }

    for (const node of this.net.nodes.values()) {
      const { size, color } = NODE_STYLE[node.kind];
      const half = Math.floor(size / 2);
      g.fillStyle(color, node.build < 1 ? 0.4 : 1);
      g.fillRect(node.x - half, node.y - half, size, size);
      if (node.build < 1) {
        // Barre de progression de la conversion.
        g.fillStyle(color, 1);
        g.fillRect(node.x - half, node.y + half + 1, Math.max(1, Math.round(size * node.build)), 1);
      }
    }
  }
}
