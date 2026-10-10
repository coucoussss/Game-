import type Phaser from 'phaser';
import { GROUND_Y, NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { type Ally, moodOf } from '../entities/Ally';
import { TREE_REGROWTH } from '../systems/ClimateSystem';
import { LAYERS, type Layer } from '../data/types';
import { Random } from '../systems/Random';
import { type ResolvedPalette, paletteAt } from '../systems/SeasonSystem';
import { layerBounds, layerMoisture } from '../systems/SoilSystem';
import type { World } from '../systems/World';
import { hexToInt, lerpColor, shade } from '../ui/color';
import { PALETTE } from '../ui/text';
import { drawSprite } from '../art/drawSprite';

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
  private readonly pebbles: { x: number; y: number; size: number; light: boolean; layer: Layer }[] = [];
  private readonly tufts: { x: number; h: number; phase: number }[] = [];
  private readonly waves: number[] = [];
  private readonly cracks: [number, number, number, number][] = [];
  private readonly falling: Particle[] = [];
  private readonly litter: { x: number; color: number; age: number }[] = [];
  private readonly weather: Particle[] = [];
  private readonly fx = new Random(12345);
  private previousDensity = -1;

  private readonly camera: Phaser.Cameras.Scene2D.Camera;

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
  ) {
    this.camera = scene.cameras.main;
    this.back = scene.add.graphics().setDepth(0);
    this.front = scene.add.graphics().setDepth(8);
    this.generate();
  }

  private generate(): void {
    const rng = new Random(this.world.rng.state ^ 0x5eed);
    const bounds = layerBounds(this.world.forest);
    const width = this.world.widthPx;
    // Cailloux et radicelles : la matière du sol, plus dense en profondeur.
    for (const layer of LAYERS) {
      const [top, bottom] = bounds[layer];
      const count = Math.round((width * (Math.min(bottom, NATIVE_HEIGHT) - top)) / (layer === 'deep' ? 90 : 140));
      for (let i = 0; i < count; i++) {
        this.pebbles.push({ x: rng.int(0, width), y: rng.int(top + 2, Math.min(bottom, NATIVE_HEIGHT) - 1), size: rng.next() < 0.15 ? 2 : 1, light: rng.next() < 0.5, layer });
      }
    }
    // Touffes d'herbe le long de la surface.
    for (let x = 0; x < width; x += rng.int(2, 5)) this.tufts.push({ x, h: rng.int(1, 4), phase: rng.next() * 6 });
    // Ondulation des frontières entre couches (par colonne de 4 px).
    for (let x = 0; x < width; x += 4) this.waves.push(Math.round(Math.sin(x / 23 + rng.next() * 0.6) * 1.5 + Math.sin(x / 7) * 0.8));
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
      const scale = Math.sqrt(tree.size);
      const rx = Math.round((13 + rng.int(0, 5)) * scale);
      const ry = Math.round((11 + rng.int(0, 4)) * scale);
      for (let i = 0; i < 360 * tree.size; i++) {
        const a = rng.next() * Math.PI * 2;
        const r = Math.sqrt(rng.next());
        leaves.push({
          dx: Math.round(Math.cos(a) * r * rx),
          dy: Math.round(Math.sin(a) * r * ry),
          threshold: rng.next(),
          tint: rng.next(),
        });
      }
      look = { trunkWidth: tree.size > 1 ? 12 : 5 + rng.int(0, 2), leaves };
      this.looks.set(tree.id, look);
    }
    return look;
  }

  /** L'abscisse x (± marge) est-elle à l'écran ? On ne dessine que le visible. */
  private visible(x: number, margin = 40): boolean {
    const left = this.camera.scrollX;
    return x >= left - margin && x <= left + NATIVE_WIDTH + margin;
  }

  private get trees(): Ally[] {
    return this.world.allies.filter((a) => a.species === 'tree');
  }

  private timeMs = 0;
  /** Couleur du ciel de l'image en cours (palette, météo, climat), pour la parallaxe. */
  skyColor = 0;
  /** Palette de l'image en cours. */
  current: ResolvedPalette | null = null;

  /** Palette de saison mêlée à la teinte du biome. */
  private palette(): ResolvedPalette {
    const p = paletteAt(this.world.season, this.world.data.seasons);
    const biome = this.world.data.biomes[this.world.forest.biome];
    if (!biome || biome.strength <= 0) return p;
    const tint = hexToInt(biome.tint);
    const k = biome.strength;
    return {
      ...p,
      sky: lerpColor(p.sky, tint, k),
      leaf: lerpColor(p.leaf, tint, k * 0.6),
      leafAlt: lerpColor(p.leafAlt, tint, k * 0.6),
      trunk: lerpColor(p.trunk, tint, k * 0.5),
      surface: lerpColor(p.surface, tint, k * 0.5),
      humus: lerpColor(p.humus, tint, k * 0.4),
      deep: lerpColor(p.deep, tint, k * 0.3),
    };
  }

  draw(deltaMs: number): void {
    this.timeMs += deltaMs;
    const p = this.palette();
    this.current = p;
    const cave = this.world.forest.rules.noSky === true;
    const weather = this.world.data.seasons.weather[this.world.weather.id]!;
    let sky = weather.skyTint ? lerpColor(p.sky, hexToInt(weather.skyTint), weather.tintStrength ?? 0) : p.sky;
    // Ciel de braise pendant une sécheresse ou un incendie.
    const climate = this.world.climate?.kind;
    if (climate === 'drought' || climate === 'fire') sky = lerpColor(sky, 0xc8743a, climate === 'fire' ? 0.5 : 0.35);
    const g = this.back.clear();
    const width = this.world.widthPx;

    // Le ciel est dessiné par ParallaxView ; ici, seulement la voûte d'une caverne.
    if (cave) this.drawCaveCeiling(g, p);
    this.skyColor = sky;
    this.drawSoil(g, p);
    this.drawDeposits(g);
    this.drawTrees(g, p, this.timeMs);
    this.updateFallingLeaves(p, deltaMs);
    for (const leaf of this.falling) g.fillStyle(leaf.color).fillRect(Math.round(leaf.x), Math.round(leaf.y), 1, 1);
    for (const l of this.litter) g.fillStyle(l.color, Math.max(0, 1 - l.age / 60000)).fillRect(l.x, GROUND_Y - 1, 1, 1);
    if (p.snow > 0) {
      g.fillStyle(SNOW, p.snow).fillRect(0, GROUND_Y - Math.ceil(p.snow * 2), width, Math.ceil(p.snow * 2));
    }
    this.drawWeather(cave ? 'none' : weather.precipitation, deltaMs);
  }

  /** Caverne : voûte rocheuse et stalactites à la place du ciel, gouttes qui suintent. */
  private drawCaveCeiling(g: Phaser.GameObjects.Graphics, p: ResolvedPalette): void {
    const width = this.world.widthPx;
    g.fillStyle(shade(p.deep, 0.7)).fillRect(0, 0, width, GROUND_Y);
    g.fillStyle(shade(p.deep, 1.2));
    for (let x = 0; x < width; x += 9) {
      const h = 6 + ((x * 37) % 23);
      g.fillRect(x, 0, 5, h).fillRect(x + 1, h, 3, 3).fillRect(x + 2, h + 3, 1, 3);
    }
    g.fillStyle(shade(p.deep, 0.9)).fillRect(0, GROUND_Y - 3, width, 3);
    for (let i = 0; i < 6; i++) {
      const x = (i * 71 + 13) % width;
      const y = ((this.timeMs / 12 + i * 40) % (GROUND_Y - 10)) + 10;
      g.fillStyle(0x6fb3d8, 0.6).fillRect(x + 2, Math.round(y), 1, 2);
    }
  }

  private drawSoil(g: Phaser.GameObjects.Graphics, p: ResolvedPalette): void {
    const bounds = layerBounds(this.world.forest);
    const { soil } = this.world.data;
    const frozen = this.world.season.def.rules.frozenSurface;
    const colors: Record<Layer, number> = { surface: p.surface, humus: p.humus, deep: p.deep };
    const layerColor: Partial<Record<Layer, number>> = {};
    for (const layer of LAYERS) {
      const [top, bottom] = bounds[layer];
      // Un sol humide est plus sombre ; la surface gelée blanchit.
      const wet = layerMoisture(layer, this.world.moisture, soil);
      let color = shade(colors[layer], 1.08 - 0.25 * wet);
      if (layer === 'surface' && frozen) color = lerpColor(color, FROST, 0.12);
      layerColor[layer] = color;
      g.fillStyle(color).fillRect(0, top, this.world.widthPx, Math.min(bottom, NATIVE_HEIGHT) - top);
      // Frontière irrégulière avec la couche du dessus, par colonnes de 4 px.
      if (layer !== 'surface') {
        const above = layerColor[layer === 'humus' ? 'surface' : 'humus']!;
        this.waves.forEach((dy, i) => {
          if (dy > 0) g.fillStyle(above).fillRect(i * 4, top, 4, dy);
          else if (dy < 0) g.fillStyle(color).fillRect(i * 4, top + dy, 4, -dy);
        });
      }
    }
    for (const pb of this.pebbles) {
      if (!this.visible(pb.x, 4)) continue;
      const base = layerColor[pb.layer]!;
      g.fillStyle(shade(base, pb.light ? 1.35 : 0.65)).fillRect(pb.x, pb.y, pb.size, pb.size === 2 ? 1 : 1);
    }
    // Liseré de terre claire et herbe qui ondule au vent (absente sous la neige et en caverne).
    g.fillStyle(shade(layerColor.surface!, 1.25)).fillRect(0, GROUND_Y, this.world.widthPx, 1);
    if (!this.world.forest.rules.noSky) {
      const grass = lerpColor(p.leaf, p.leafAlt, 0.3);
      for (const tuft of this.tufts) {
        if (!this.visible(tuft.x, 4)) continue;
        const sway = Math.round(Math.sin(this.timeMs / 900 + tuft.phase) * 0.7);
        g.fillStyle(shade(grass, 0.8)).fillRect(tuft.x, GROUND_Y - tuft.h, 1, tuft.h);
        g.fillStyle(grass).fillRect(tuft.x + sway, GROUND_Y - tuft.h, 1, 1);
      }
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
      if (!this.visible(d.x, 6)) continue;
      const fill = d.amount / d.max;
      if (fill <= 0) {
        g.fillStyle(PALETTE.ink, 0.5).fillRect(d.x, d.y, 1, 1);
        continue;
      }
      // Le cristal rétrécit à mesure que le gisement s'épuise.
      drawSprite(g, 'mineral', d.x, d.y - 2, { frame: fill > 0.66 ? 2 : fill > 0.33 ? 1 : 0 });
      // Scintillement discret, décalé par gisement.
      if ((t + i * 37) % 97 < 3) g.fillStyle(0xffffff).fillRect(d.x, d.y - 3, 1, 1);
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
      if (!this.visible(tree.x, 60)) continue;
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
      g.fillStyle(shade(p.trunk, 1.25)).fillRect(tree.x, top, 1, tree.height);
      // Écorce : petites stries décalées.
      for (let y = top + 3; y < GROUND_Y - 2; y += 5) {
        g.fillStyle(shade(p.trunk, 0.75)).fillRect(tree.x + 1 + ((y * 3 + tree.id) % Math.max(1, look.trunkWidth - 2)), y, 1, 2);
      }
      const droop = mood === 'wary' ? 1 : mood === 'hostile' ? 2 : 0;
      const shiver = mood === 'hostile' && Math.sin(timeMs / 60) > 0.6 ? 1 : 0;
      const wind = Math.sin(this.timeMs / 1300 + tree.id) * 0.8;
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
        // Le haut du houppier ondule davantage au vent.
        const sway = Math.round(wind * (0.5 - leaf.dy / 30));
        // Ombre sous le houppier, lumière au-dessus.
        const lit = leaf.dy < -4 ? lerpColor(color, 0xffffff, 0.08) : leaf.dy > 4 ? shade(color, 0.8) : color;
        g.fillStyle(lit).fillRect(cx + leaf.dx + sway, cy + leaf.dy + sag, 1, 1);
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
