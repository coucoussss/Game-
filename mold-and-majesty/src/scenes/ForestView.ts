import type Phaser from 'phaser';
import { GROUND_Y, NATIVE_HEIGHT } from '../config';
import { type Ally, moodOf } from '../entities/Ally';
import { TREE_REGROWTH } from '../systems/ClimateSystem';
import type { Layer } from '../data/types';
import { Random } from '../systems/Random';
import { type ResolvedPalette, paletteAt } from '../systems/SeasonSystem';
import { layerBounds, layerMoisture } from '../systems/SoilSystem';
import type { World } from '../systems/World';
import { hexToInt, lerpColor, shade } from '../ui/color';
import { PALETTE } from '../ui/text';

interface Leaf {
  dx: number;
  dy: number;
  /** Seuil de densité : la feuille n'apparaît que si la densité du feuillage le dépasse. */
  threshold: number;
  /** Mélange entre les deux teintes de la saison. */
  tint: number;
}

/** Apparence d'un arbre (générée une fois), associée à l'allié correspondant. */
interface TreeLook {
  trunkWidth: number;
  leaves: Leaf[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: number;
  life: number;
}

const DRY_LEAF = 0x9a8a4a;
const FROST = 0xb8c4d8;
const SNOW = 0xe8ecf2;
const MAX_LITTER = 220;

/**
 * Le décor est l'interface : ciel et feuillage disent la saison, les feuilles flétries
 * et le sol fissuré disent la sécheresse, le sol givré dit le gel, la taille des cristaux
 * dit ce qu'il reste de minéraux. Les particules sont purement cosmétiques.
 */
export class ForestView {
  private readonly back: Phaser.GameObjects.Graphics;
  private readonly front: Phaser.GameObjects.Graphics;
  private readonly looks = new Map<number, TreeLook>();
  private readonly cracks: [number, number, number, number][] = [];
  private readonly falling: Particle[] = [];
  private readonly litter: { x: number; color: number; age: number }[] = [];
  private readonly weather: Particle[] = [];
  private readonly fx = new Random(12345);
  private previousDensity = -1;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
  ) {
    this.back = scene.add.graphics().setDepth(0);
    this.front = scene.add.graphics().setDepth(8);
    this.generate();
  }

  private generate(): void {
    const rng = new Random(this.world.rng.state ^ 0x5eed);
    const bounds = layerBounds(this.world.forest);
    for (let i = 0; i < 40; i++) {
      const x = rng.int(0, this.world.widthPx);
      const y = rng.int(bounds.surface[0] + 2, bounds.surface[1] - 2);
      this.cracks.push([x, y, x + rng.int(-4, 4), y + rng.int(1, 4)]);
    }
  }

  private lookOf(tree: Ally): TreeLook {
    let look = this.looks.get(tree.id);
    if (!look) {
      const rng = new Random(tree.id * 7919);
      const leaves: Leaf[] = [];
      const rx = 13 + rng.int(0, 5);
      const ry = 11 + rng.int(0, 4);
      for (let i = 0; i < 360; i++) {
        const a = rng.next() * Math.PI * 2;
        const r = Math.sqrt(rng.next());
        leaves.push({
          dx: Math.round(Math.cos(a) * r * rx),
          dy: Math.round(Math.sin(a) * r * ry),
          threshold: rng.next(),
          tint: rng.next(),
        });
      }
      look = { trunkWidth: 5 + rng.int(0, 2), leaves };
      this.looks.set(tree.id, look);
    }
    return look;
  }

  private get trees(): Ally[] {
    return this.world.allies.filter((a) => a.species === 'tree');
  }

  private timeMs = 0;

  draw(deltaMs: number): void {
    this.timeMs += deltaMs;
    const p = paletteAt(this.world.season, this.world.data.seasons);
    const weather = this.world.data.seasons.weather[this.world.weather.id]!;
    let sky = weather.skyTint ? lerpColor(p.sky, hexToInt(weather.skyTint), weather.tintStrength ?? 0) : p.sky;
    // Ciel de braise pendant une sécheresse ou un incendie.
    const climate = this.world.climate?.kind;
    if (climate === 'drought' || climate === 'fire') sky = lerpColor(sky, 0xc8743a, climate === 'fire' ? 0.5 : 0.35);
    const g = this.back.clear();
    const width = this.world.widthPx;

    g.fillStyle(sky).fillRect(0, 0, width, GROUND_Y);
    this.drawSoil(g, p);
    this.drawDeposits(g);
    this.drawTrees(g, p, this.timeMs);
    this.updateFallingLeaves(p, deltaMs);
    for (const leaf of this.falling) g.fillStyle(leaf.color).fillRect(Math.round(leaf.x), Math.round(leaf.y), 1, 1);
    for (const l of this.litter) g.fillStyle(l.color, Math.max(0, 1 - l.age / 60000)).fillRect(l.x, GROUND_Y - 1, 1, 1);
    if (p.snow > 0) {
      g.fillStyle(SNOW, p.snow).fillRect(0, GROUND_Y - Math.ceil(p.snow * 2), width, Math.ceil(p.snow * 2));
    }
    this.drawWeather(weather.precipitation, deltaMs);
  }

  private drawSoil(g: Phaser.GameObjects.Graphics, p: ResolvedPalette): void {
    const bounds = layerBounds(this.world.forest);
    const { soil } = this.world.data;
    const frozen = this.world.season.def.rules.frozenSurface;
    const colors: Record<Layer, number> = { surface: p.surface, humus: p.humus, deep: p.deep };
    for (const layer of ['surface', 'humus', 'deep'] as const) {
      const [top, bottom] = bounds[layer];
      // Un sol humide est plus sombre ; la surface gelée blanchit.
      const wet = layerMoisture(layer, this.world.moisture, soil);
      let color = shade(colors[layer], 1.08 - 0.25 * wet);
      if (layer === 'surface' && frozen) color = lerpColor(color, FROST, 0.12);
      g.fillStyle(color).fillRect(0, top, this.world.widthPx, Math.min(bottom, NATIVE_HEIGHT) - top);
    }
    // Fissures de sécheresse dans la couche de surface.
    const dryness = Math.max(0, (0.25 - this.world.moisture) / 0.25);
    if (dryness > 0) {
      g.lineStyle(1, shade(p.surface, 0.55), dryness);
      for (const [x1, y1, x2, y2] of this.cracks) g.lineBetween(x1, y1, x2, y2);
    }
  }

  private drawDeposits(g: Phaser.GameObjects.Graphics): void {
    const t = this.world.tick;
    for (const [i, d] of this.world.deposits.entries()) {
      const fill = d.amount / d.max;
      if (fill <= 0) {
        g.fillStyle(PALETTE.ink, 0.5).fillRect(d.x, d.y, 1, 1);
        continue;
      }
      const size = 1 + Math.round(fill * 2);
      g.fillStyle(shade(PALETTE.minerals, 0.55)).fillRect(d.x - 1, d.y - size + 1, size + 1, size);
      g.fillStyle(PALETTE.minerals).fillRect(d.x, d.y - size + 1, size - 1 || 1, size - 1 || 1);
      // Scintillement discret, décalé par gisement.
      if ((t + i * 37) % 97 < 3) g.fillStyle(0xffffff).fillRect(d.x, d.y - size + 1, 1, 1);
    }
  }

  /**
   * Les arbres disent leur humeur sans un chiffre : ramure qui s'affaisse quand ils se
   * méfient, qui tremble quand ils sont hostiles ; sève dorée qui descend les racines
   * quand ils donnent, sève grise qui remonte quand ils boudent ; souche calcinée après
   * un feu, puis jeune pousse.
   */
  private drawTrees(g: Phaser.GameObjects.Graphics, p: ResolvedPalette, timeMs: number): void {
    // Feuilles qui flétrissent quand le sol de surface s'assèche.
    const drought = Math.max(0, Math.min(1, (0.3 - this.world.moisture) / 0.3));
    const tick = this.world.tick;
    for (const tree of this.trees) {
      const look = this.lookOf(tree);
      const mood = moodOf(tree);
      const burnt = tree.state === 'burnt';
      const rootColor = mood === 'hostile' ? lerpColor(shade(p.trunk, 0.8), 0x7a2a22, 0.5) : shade(p.trunk, 0.8);
      g.lineStyle(1, rootColor, burnt ? 0.25 : 0.6);
      const path = [{ x: tree.x + 3, y: GROUND_Y }, ...tree.roots];
      for (let i = 1; i < path.length; i++) g.lineBetween(path[i - 1]!.x, path[i - 1]!.y, path[i]!.x, path[i]!.y);

      if (burnt) {
        // Souche noircie, puis jeune pousse qui grandit à mesure que la repousse avance.
        g.fillStyle(0x1a1412).fillRect(tree.x, GROUND_Y - 8, look.trunkWidth, 8);
        const growth = 1 - tree.cooldown / TREE_REGROWTH;
        if (growth > 0.3) {
          const h = Math.round((growth - 0.3) * 14);
          g.fillStyle(p.trunk).fillRect(tree.x + 2, GROUND_Y - 8 - h, 1, h);
          g.fillStyle(p.leaf).fillRect(tree.x + 1, GROUND_Y - 9 - h, 3, 2);
        }
        continue;
      }

      // Sève : descend vers le réseau quand l'arbre donne, remonte quand il boude.
      const trading = tick - tree.lastTrade < 15;
      if (trading || tree.sulk > 0) {
        const up = tree.sulk > 0;
        const color = up ? 0x8a8a8a : PALETTE.sugar;
        for (let k = 0; k < 3; k++) {
          const phase = (timeMs / 900 + k / 3) % 1;
          const point = alongPath(path, up ? 1 - phase : phase);
          g.fillStyle(color, 0.9).fillRect(Math.round(point.x), Math.round(point.y), 1, 1);
        }
      }

      const top = GROUND_Y - tree.height;
      g.fillStyle(p.trunk).fillRect(tree.x, top, look.trunkWidth, tree.height);
      g.fillStyle(shade(p.trunk, 0.7)).fillRect(tree.x + look.trunkWidth - 1, top, 1, tree.height);
      const droop = mood === 'wary' ? 1 : mood === 'hostile' ? 2 : 0;
      const shiver = mood === 'hostile' && Math.sin(timeMs / 60) > 0.6 ? 1 : 0;
      const cx = tree.x + Math.floor(look.trunkWidth / 2) + shiver;
      const cy = top - 4 + droop;
      const density = mood === 'devoted' ? Math.min(1, p.leafDensity * 1.1) : p.leafDensity;
      for (const leaf of look.leaves) {
        if (leaf.threshold > density) continue;
        let color = lerpColor(p.leaf, p.leafAlt, leaf.tint);
        if (drought > 0) color = lerpColor(color, DRY_LEAF, drought * (0.4 + leaf.tint * 0.6));
        if (mood === 'hostile') color = lerpColor(color, 0x6a5040, 0.35);
        // Les feuilles basses pendent davantage quand l'arbre se méfie.
        const sag = droop > 0 && leaf.dy > 0 ? droop : 0;
        g.fillStyle(color).fillRect(cx + leaf.dx, cy + leaf.dy + sag, 1, 1);
      }
      if (p.snow > 0.3) g.fillStyle(SNOW, p.snow).fillRect(tree.x, top - 1, look.trunkWidth, 1);
    }
  }

  private updateFallingLeaves(p: ResolvedPalette, deltaMs: number): void {
    // Quand le feuillage s'éclaircit, les feuilles concernées tombent vraiment.
    if (this.previousDensity >= 0 && p.leafDensity < this.previousDensity) {
      for (const tree of this.trees) {
        if (tree.state === 'burnt') continue;
        for (const leaf of this.lookOf(tree).leaves) {
          if (leaf.threshold <= this.previousDensity && leaf.threshold > p.leafDensity) {
            this.falling.push({
              x: tree.x + 3 + leaf.dx,
              y: GROUND_Y - tree.height - 4 + leaf.dy,
              vx: 0,
              vy: 0.004 + this.fx.next() * 0.006,
              color: lerpColor(p.leaf, p.leafAlt, leaf.tint),
              life: 0,
            });
          }
        }
      }
    }
    this.previousDensity = p.leafDensity;

    for (let i = this.falling.length - 1; i >= 0; i--) {
      const leaf = this.falling[i]!;
      leaf.life += deltaMs;
      leaf.x += Math.sin(leaf.life / 300 + leaf.vy * 1000) * 0.02 * deltaMs * 0.5;
      leaf.y += leaf.vy * deltaMs;
      if (leaf.y >= GROUND_Y - 1) {
        this.litter.push({ x: Math.round(leaf.x), color: shade(leaf.color, 0.8), age: 0 });
        this.falling.splice(i, 1);
      }
    }
    for (const l of this.litter) l.age += deltaMs;
    while (this.litter.length > MAX_LITTER || (this.litter[0] && this.litter[0].age > 60000)) this.litter.shift();
  }

  private drawWeather(kind: string, deltaMs: number): void {
    const g = this.front.clear();
    const width = this.world.widthPx;
    const target = kind === 'rain' ? 90 : kind === 'snow' ? 70 : 0;
    // Les précipitations s'installent et cessent progressivement.
    if (this.weather.length < target && this.fx.next() < 0.5) {
      this.weather.push({ x: this.fx.next() * width, y: -2, vx: 0, vy: 0, color: 0, life: this.fx.next() * 1000 });
    }
    for (let i = this.weather.length - 1; i >= 0; i--) {
      const drop = this.weather[i]!;
      drop.life += deltaMs;
      if (kind === 'snow') {
        drop.y += 0.012 * deltaMs;
        drop.x += Math.sin(drop.life / 400) * 0.01 * deltaMs;
        g.fillStyle(SNOW, 0.9).fillRect(Math.round(drop.x), Math.round(drop.y), 1, 1);
      } else {
        drop.y += 0.15 * deltaMs;
        drop.x -= 0.03 * deltaMs;
        g.lineStyle(1, 0x9fb4d8, 0.6).lineBetween(Math.round(drop.x), Math.round(drop.y), Math.round(drop.x + 1), Math.round(drop.y - 4));
      }
      if (drop.y >= GROUND_Y - 1) {
        if (this.weather.length > target) this.weather.splice(i, 1);
        else {
          drop.y = -2;
          drop.x = this.fx.next() * (width + 40);
        }
      }
    }
    if (kind === 'fog') {
      for (let b = 0; b < 3; b++) {
        const y = GROUND_Y - 22 + b * 9 + Math.round(Math.sin(this.world.tick / 80 + b) * 2);
        g.fillStyle(0xc8c8d0, 0.12).fillRect(0, y, width, 7);
      }
    }
  }
}

/** Point situé à la fraction t (0..1) de la longueur d'une ligne brisée. */
export function alongPath(path: readonly { x: number; y: number }[], t: number): { x: number; y: number } {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i]!.x, p.y - path[i]!.y));
  let remaining = t * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]! || i === lengths.length - 1) {
      const k = lengths[i]! === 0 ? 0 : Math.min(1, remaining / lengths[i]!);
      return { x: path[i]!.x + (path[i + 1]!.x - path[i]!.x) * k, y: path[i]!.y + (path[i + 1]!.y - path[i]!.y) * k };
    }
    remaining -= lengths[i]!;
  }
  return path[0]!;
}
