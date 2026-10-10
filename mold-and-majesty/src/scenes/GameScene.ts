import Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { gameData } from '../data';
import type { ForestDef } from '../data/types';

const TILE = 8;
const SKY_HEIGHT = 80;

const COLORS = {
  sky: 0x1d1a2f,
  trunk: 0x3b2a26,
  canopy: 0x2c4a3a,
  surface: 0x4a3b2a,
  humus: 0x33261d,
  deep: 0x1f1714,
  mycelium: 0xe8dcc0,
};

/** Vue en coupe de la forêt (placeholder de l'étape 0). */
export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create(): void {
    const forest = gameData.forests.get('whispering-grove');
    if (!forest) throw new Error('Forêt de départ introuvable');
    this.drawCrossSection(forest);
    this.add
      .text(4, 4, `Mold & Majesty — ${forest.name}`, { fontFamily: 'monospace', fontSize: '8px', color: '#e8dcc0' })
      .setResolution(1);
  }

  private drawCrossSection(forest: ForestDef): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.sky).fillRect(0, 0, NATIVE_WIDTH, SKY_HEIGHT);

    for (let x = 24; x < NATIVE_WIDTH; x += 72) {
      g.fillStyle(COLORS.trunk).fillRect(x, SKY_HEIGHT - 40, 6, 40);
      g.fillStyle(COLORS.canopy).fillRect(x - 12, SKY_HEIGHT - 60, 30, 24);
    }

    let y = SKY_HEIGHT;
    const bands: [number, number][] = [
      [forest.layers.surface, COLORS.surface],
      [forest.layers.humus, COLORS.humus],
      [forest.layers.deep, COLORS.deep],
    ];
    for (const [tiles, color] of bands) {
      const h = Math.min(tiles * TILE, NATIVE_HEIGHT - y);
      g.fillStyle(color).fillRect(0, y, NATIVE_WIDTH, h);
      y += h;
    }

    // Cœur du réseau : un nœud de mycélium sous la surface.
    const cx = NATIVE_WIDTH / 2;
    const cy = SKY_HEIGHT + forest.layers.surface * TILE + 16;
    g.fillStyle(COLORS.mycelium).fillRect(cx - 2, cy - 2, 4, 4);
    g.lineStyle(1, COLORS.mycelium, 0.6);
    g.lineBetween(cx, cy, cx - 30, cy + 12);
    g.lineBetween(cx, cy, cx + 26, cy + 18);
    g.lineBetween(cx, cy, cx + 4, SKY_HEIGHT);
  }
}
