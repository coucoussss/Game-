import type Phaser from 'phaser';
import { GROUND_Y, NATIVE_HEIGHT } from '../config';
import { FIRE_BAND, fireSpan, floodLevel } from '../systems/ClimateSystem';
import { cellCenter } from '../systems/RivalSystem';
import { layerBounds } from '../systems/SoilSystem';
import type { World } from '../systems/World';
import { hexToInt, lerpColor, shade } from '../ui/color';

const PARASITE = 0xa04ac8;
const WATER = 0x3a6a9a;
const ICE = 0xdfe8f5;

/**
 * Menaces visibles : colonies de moisissures (et leur halo de toxines), nœuds parasités
 * qui grouillent, eau qui monte, front de flammes, givre, tronc abattu.
 */
export class ThreatView {
  private readonly under: Phaser.GameObjects.Graphics;
  private readonly over: Phaser.GameObjects.Graphics;
  private time = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
  ) {
    this.under = scene.add.graphics().setDepth(4);
    this.over = scene.add.graphics().setDepth(7);
  }

  draw(deltaMs: number): void {
    this.time += deltaMs;
    const under = this.under.clear();
    const over = this.over.clear();
    this.drawTerrain(under);
    this.drawRivals(under);
    this.drawParasites(over);
    this.drawClimate(under, over);
  }

  /** Gravats de béton (ruines) et nappe d'eau permanente (marais). */
  private drawTerrain(g: Phaser.GameObjects.Graphics): void {
    for (const o of this.world.obstacles) {
      g.fillStyle(0x6a6670).fillRect(o.x, o.y, o.w, o.h);
      g.fillStyle(0x8a8690).fillRect(o.x, o.y, o.w, 1);
      g.fillStyle(0x4a4650).fillRect(o.x, o.y + o.h - 1, o.w, 1);
      // Ferraille rouillée qui dépasse.
      g.fillStyle(0x8a4a2a).fillRect(o.x + Math.floor(o.w / 3), o.y - 2, 1, 3);
      for (let x = o.x + 2; x < o.x + o.w - 1; x += 5) g.fillStyle(0x5a5660).fillRect(x, o.y + 2, 2, 1);
    }
    const level = this.world.waterTableY;
    if (level !== null) {
      const width = this.world.widthPx;
      g.fillStyle(WATER, 0.45).fillRect(0, level, width, NATIVE_HEIGHT - level);
      g.lineStyle(1, 0x9fc4e8, 0.5);
      for (let x = 0; x < width; x += 7) {
        const y = level + Math.round(Math.sin(this.time / 500 + x / 11));
        g.lineBetween(x, y, x + 3, y);
      }
    }
  }

  private drawRivals(g: Phaser.GameObjects.Graphics): void {
    const { rivals } = this.world.data.threats;
    const cs = rivals.cellSize;
    for (const colony of this.world.colonies) {
      const kind = rivals.kinds[colony.kind]!;
      const color = hexToInt(kind.color);
      // Halo de toxines : la zone où les filaments souffrent.
      g.fillStyle(color, 0.06);
      const r = kind.toxin.radius;
      for (const cell of colony.cells.values()) {
        g.fillRect(cell.gx * cs - r / 2, cell.gy * cs - r / 2, cs + r, cs + r);
      }
      for (const cell of colony.cells.values()) {
        const wounded = cell.hp < kind.hp;
        // Les cellules attaquées par les antifongiques pâlissent et clignotent.
        const flash = wounded && Math.floor(this.time / 100 + cell.gx) % 2 === 0;
        const c = flash ? lerpColor(color, 0xffffff, 0.5) : lerpColor(shade(color, 0.6), color, cell.hp / kind.hp);
        g.fillStyle(c).fillRect(cell.gx * cs, cell.gy * cs, cs, cs);
        // Texture duveteuse.
        if ((cell.gx * 7 + cell.gy * 3) % 4 === 0) {
          g.fillStyle(lerpColor(color, 0xffffff, 0.3)).fillRect(cell.gx * cs + 1, cell.gy * cs + 1, 1, 1);
        }
      }
      // Hyphes rivales qui sondent le terrain, en bordure.
      g.lineStyle(1, color, 0.4);
      let i = 0;
      for (const cell of colony.cells.values()) {
        if (i++ % 5 !== 0) continue;
        const x = cellCenter(cell.gx, cs);
        const y = cellCenter(cell.gy, cs);
        const a = cell.gx * 1.7 + cell.gy + this.time / 2000;
        g.lineBetween(x, y, x + Math.cos(a) * 4, y + Math.sin(a) * 4);
      }
    }
  }

  private drawParasites(g: Phaser.GameObjects.Graphics): void {
    for (const node of this.world.net.nodes.values()) {
      if (node.infection <= 0) continue;
      const count = 1 + Math.round(node.infection * 5);
      for (let i = 0; i < count; i++) {
        const a = this.time / 300 + i * 2.4 + node.id;
        const r = 2 + (i % 3);
        g.fillStyle(PARASITE, 0.5 + 0.5 * node.infection);
        g.fillRect(Math.round(node.x + Math.cos(a) * r), Math.round(node.y + Math.sin(a) * r), 1, 1);
      }
    }
  }

  private drawClimate(under: Phaser.GameObjects.Graphics, over: Phaser.GameObjects.Graphics): void {
    const c = this.world.climate;
    if (!c) return;
    const width = this.world.widthPx;
    const bounds = layerBounds(this.world.forest);
    if (c.kind === 'flood') {
      const level = Math.round(floodLevel(c, this.world.forest));
      const bottom = Math.min(bounds.deep[1], NATIVE_HEIGHT);
      if (level < bottom) {
        over.fillStyle(WATER, 0.35).fillRect(0, level, width, bottom - level);
        over.lineStyle(1, 0x9fc4e8, 0.7);
        for (let x = 0; x < width; x += 6) {
          const y = level + Math.round(Math.sin(this.time / 300 + x / 9));
          over.lineBetween(x, y, x + 3, y);
        }
      }
    } else if (c.kind === 'fire') {
      const [left, right] = fireSpan(c);
      // Cendres derrière les fronts.
      under.fillStyle(0x1a1412, 0.6).fillRect(Math.max(0, left + FIRE_BAND), GROUND_Y - 1, Math.max(0, right - left - 2 * FIRE_BAND), 4);
      for (const front of [left, right - FIRE_BAND]) {
        for (let i = 0; i < 18; i++) {
          const x = Math.round(front + ((i * 37 + Math.floor(this.time / 70)) % FIRE_BAND));
          const h = 2 + ((i * 13 + Math.floor(this.time / 50)) % 9);
          over.fillStyle(i % 3 === 0 ? 0xf2c46d : 0xd8602a, 0.9).fillRect(x, GROUND_Y - h, 1, h);
          // Fumée.
          const sy = GROUND_Y - 12 - ((this.time / 40 + i * 9) % 40);
          over.fillStyle(0x6a6470, 0.25).fillRect(x + Math.round(Math.sin(sy / 6) * 2), Math.round(sy), 2, 2);
        }
      }
    } else if (c.kind === 'frost') {
      // Givre : cristaux sur le sol et teinte glacée de la surface.
      over.fillStyle(ICE, 0.12).fillRect(0, bounds.surface[0], width, bounds.surface[1] - bounds.surface[0]);
      for (let x = 2; x < width; x += 7) over.fillStyle(ICE, 0.8).fillRect(x, GROUND_Y - 1, 1, 1);
    } else if (c.kind === 'windfall') {
      // Le tronc abattu repose au sol tant que dure l'événement.
      const x = c.x - 18;
      under.fillStyle(0x4a352c).fillRect(x, GROUND_Y - 4, 36, 4);
      under.fillStyle(0x362a26).fillRect(x, GROUND_Y - 1, 36, 1);
      under.fillStyle(0x6a5040).fillRect(x + 35, GROUND_Y - 4, 1, 4);
      for (let i = 3; i < 34; i += 6) under.fillStyle(0x2a1e1a).fillRect(x + i, GROUND_Y - 3, 2, 1);
    }
  }
}
