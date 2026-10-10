import type Phaser from 'phaser';
import { drawSprite } from '../art/drawSprite';
import type { FluxId, NetworkDef, NodeKind } from '../data/types';
import type { NetNode, NetSegment, Network } from '../entities/Network';
import { lerpColor, shade } from '../ui/color';
import { PALETTE } from '../ui/text';

/** Calque optionnel : colore le réseau selon le remplissage d'un flux. */
export type FluxOverlay = FluxId | null;

const NODE_SPRITE: Record<Exclude<NodeKind, 'junction'>, string> = {
  heart: 'heart',
  storage: 'storage',
  relay: 'relay',
  fruiting: 'hive',
};

/**
 * Dessine le réseau en pixel art :
 * - filaments ombrés selon l'épaisseur, qui pâlissent quand ils sont affamés, parcourus
 *   de pulsations de lumière qui partent du cœur (le signal) ;
 * - nœuds en sprites (cœur qui bat, réserve, relais, ruche), translucides en construction ;
 * - halo du cœur (réserves de sucre) et cernes de mémoire.
 */
export class NetworkView {
  private readonly graphics: Phaser.GameObjects.Graphics;

  private readonly camera: Phaser.Cameras.Scene2D.Camera;

  constructor(
    scene: Phaser.Scene,
    private readonly getNet: () => Network,
    private readonly defs: () => NetworkDef,
  ) {
    this.graphics = scene.add.graphics().setDepth(5);
    this.camera = scene.cameras.main;
  }

  /** Ne dessine que ce qui est (presque) à l'écran. */
  private visible(x1: number, x2 = x1): boolean {
    const left = this.camera.scrollX - 8;
    return Math.max(x1, x2) >= left && Math.min(x1, x2) <= left + 400;
  }

  draw(overlay: FluxOverlay, memory: number, timeMs: number, highContrast = false): void {
    const net = this.getNet();
    const defs = this.defs();
    const g = this.graphics.clear();
    this.drawHeartAura(g, net, defs, memory, timeMs);
    const fill = (id: number, flux: FluxId) => {
      const node = net.nodes.get(id)!;
      return node.stock[flux] / defs.nodes[node.kind].capacity;
    };

    for (const seg of net.segments.values()) {
      const a = net.nodes.get(seg.a)!;
      const b = net.nodes.get(seg.b)!;
      if (!this.visible(a.x, b.x)) continue;
      const width = defs.thickness[seg.thickness].width;
      if (seg.growth < 1) {
        // Filament en pousse : seule la partie déjà poussée est visible, pointe lumineuse.
        const tx = a.x + (b.x - a.x) * seg.growth;
        const ty = a.y + (b.y - a.y) * seg.growth;
        g.lineStyle(width, PALETTE.mycelium, 0.55).lineBetween(a.x, a.y, tx, ty);
        g.fillStyle(0xffffff, 0.8).fillRect(Math.round(tx), Math.round(ty), 1, 1);
        continue;
      }
      // Un segment sous-alimenté pâlit vers une teinte flétrie et devient translucide.
      let color = lerpColor(PALETTE.withered, PALETTE.mycelium, seg.health);
      if (overlay) {
        const level = (fill(seg.a, overlay) + fill(seg.b, overlay)) / 2;
        color = lerpColor(PALETTE.withered, PALETTE[overlay], Math.sqrt(level));
      }
      const alpha = highContrast ? 1 : 0.35 + 0.65 * seg.health;
      if (width >= 2) {
        // Ombre portée et liseré clair : du volume pour les filaments épais.
        g.lineStyle(width, shade(color, 0.45), alpha).lineBetween(a.x, a.y + 1, b.x, b.y + 1);
      }
      g.lineStyle(width, color, alpha).lineBetween(a.x, a.y, b.x, b.y);
      if (width >= 3) g.lineStyle(1, lerpColor(color, 0xffffff, 0.5), alpha).lineBetween(a.x, a.y - 1, b.x, b.y - 1);
      this.drawPulse(g, seg, a, b, fill, timeMs);
    }

    for (const node of net.nodes.values()) if (this.visible(node.x)) this.drawNode(g, node, timeMs);
  }

  /** Une pulsation de lumière glisse le long du segment, du nœud le plus « signalé » vers l'autre. */
  private drawPulse(
    g: Phaser.GameObjects.Graphics,
    seg: NetSegment,
    a: NetNode,
    b: NetNode,
    fill: (id: number, flux: FluxId) => number,
    timeMs: number,
  ): void {
    const signal = Math.max(fill(a.id, 'signal'), fill(b.id, 'signal'));
    if (signal < 0.05 || seg.health < 0.5) return;
    const forward = fill(a.id, 'signal') >= fill(b.id, 'signal');
    const length = Math.max(4, seg.length);
    const k = ((timeMs / (length * 40) + seg.id * 0.37) % 1 + 1) % 1;
    const t = forward ? k : 1 - k;
    const x = Math.round(a.x + (b.x - a.x) * t);
    const y = Math.round(a.y + (b.y - a.y) * t);
    g.fillStyle(PALETTE.signal, Math.min(1, signal * 1.5)).fillRect(x, y, 1, 1);
  }

  private drawNode(g: Phaser.GameObjects.Graphics, node: NetNode, timeMs: number): void {
    const building = node.build < 1;
    if (node.kind === 'junction') {
      g.fillStyle(PALETTE.mycelium).fillRect(node.x - 1, node.y - 1, 2, 2);
      return;
    }
    // Le cœur bat lentement : deux images en alternance.
    const frame = node.kind === 'heart' && Math.sin(timeMs / 350) > 0.85 ? 1 : 0;
    drawSprite(g, NODE_SPRITE[node.kind], node.x, node.y, { frame, alpha: building ? 0.45 : 1 });
    if (building) {
      // Barre de progression de la conversion.
      g.fillStyle(PALETTE.mycelium, 0.4).fillRect(node.x - 3, node.y + 4, 6, 1);
      g.fillStyle(PALETTE.mycelium).fillRect(node.x - 3, node.y + 4, Math.max(1, Math.round(6 * node.build)), 1);
    }
  }

  private drawHeartAura(g: Phaser.GameObjects.Graphics, net: Network, defs: NetworkDef, memory: number, timeMs: number): void {
    for (const node of net.nodes.values()) {
      if (node.kind !== 'heart') continue;
      // Cernes de mémoire : un anneau de plus à chaque doublement.
      const rings = Math.min(6, Math.floor(Math.log2(1 + memory)));
      for (let i = 1; i <= rings; i++) {
        g.lineStyle(1, PALETTE.signal, 0.08 + 0.02 * (rings - i));
        g.strokeCircle(node.x, node.y, 6 + i * 4);
      }
      // Halo de sucre : il pulse lentement et s'éteint quand les réserves fondent.
      const fill = node.stock.sugar / defs.nodes.heart.capacity;
      const pulse = 0.5 + 0.5 * Math.sin(timeMs / 700);
      g.fillStyle(PALETTE.sugar, 0.1 + 0.15 * fill * pulse);
      g.fillCircle(node.x, node.y, 2 + Math.round(5 * fill));
    }
  }
}
