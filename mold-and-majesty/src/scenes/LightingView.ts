import Phaser from 'phaser';
import { COLORS } from '../art/palette';
import { GROUND_Y, NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { fireSpan } from '../systems/ClimateSystem';
import { layerBounds } from '../systems/SoilSystem';
import type { World } from '../systems/World';

/** Nombre maximal de lueurs colorées affichées. */
const MAX_GLOWS = 90;

/**
 * Éclairage dynamique : un voile d'obscurité, plus dense en profondeur, en hiver et dans
 * les caves, troué par les sources de lumière (cœur, nœuds chargés de signal, ruches,
 * cristaux, feu). Par-dessus, des halos colorés en mélange additif : la bioluminescence
 * du réseau (or, turquoise, magenta, violet).
 */
export class LightingView {
  /**
   * Le voile est peint dans un canvas 2D (rapide pour découper des trous), puis envoyé
   * à la carte graphique une fois par image. (Un RenderTexture Phaser, redessiné et
   * effacé à chaque image, se dégradait au fil du temps.)
   */
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly brush: HTMLCanvasElement;
  private readonly glows: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {
    const key = 'lighting-veil';
    if (scene.textures.exists(key)) scene.textures.remove(key);
    this.texture = scene.textures.createCanvas(key, NATIVE_WIDTH, NATIVE_HEIGHT)!;
    this.ctx = this.texture.getContext();
    scene.add.image(0, 0, key).setOrigin(0).setScrollFactor(0).setDepth(8.8);
    // Pinceau radial : opaque au centre, transparent au bord, par paliers (pixel art).
    this.brush = document.createElement('canvas');
    this.brush.width = this.brush.height = 64;
    const b = this.brush.getContext('2d')!;
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32;
        if (d >= 1) continue;
        b.fillStyle = `rgba(0,0,0,${Math.round((1 - d) ** 1.5 * 6) / 6})`;
        b.fillRect(x, y, 1, 1);
      }
    }
    for (let i = 0; i < MAX_GLOWS; i++) {
      this.glows.push(
        scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(8.9).setVisible(false),
      );
    }
  }

  /** Obscurité (0..1) à l'ordonnée y du monde. */
  private darknessAt(y: number): number {
    const rules = this.world.forest.rules;
    const bounds = layerBounds(this.world.forest);
    const winter = this.world.season.def.id === 'winter' ? 0.08 : 0;
    const base = rules.noSky ? Math.max(0.55, rules.darkness ?? 0.8) : 0;
    if (y < GROUND_Y) return rules.noSky ? base : winter * 0.5;
    const depth = (y - GROUND_Y) / (bounds.deep[1] - GROUND_Y);
    return Math.min(0.92, Math.max(base, 0.12 + depth * 0.55 + winter) + (rules.darkness ?? 0) * 0.15);
  }

  /** `strength` atténue l'obscurité (contraste élevé : 0,5). */
  draw(timeMs: number, enabled = true, strength = 1): void {
    const cam = this.scene.cameras.main;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
    for (const glow of this.glows) glow.setVisible(false);
    if (!enabled) {
      this.texture.refresh();
      return;
    }

    // Voile en bandes horizontales de 4 px (le défilement est horizontal : il ne bouge pas).
    for (let y = 0; y < NATIVE_HEIGHT; y += 4) {
      const a = this.darknessAt(y + cam.scrollY) * strength;
      if (a <= 0) continue;
      ctx.fillStyle = `rgba(7,5,10,${a.toFixed(3)})`;
      ctx.fillRect(0, y, NATIVE_WIDTH, 4);
    }

    // Les sources de lumière découpent le voile.
    ctx.globalCompositeOperation = 'destination-out';
    let used = 0;
    const light = (x: number, y: number, radius: number, color: number | null, strength = 1) => {
      const sx = x - cam.scrollX;
      const sy = y - cam.scrollY;
      if (sx < -radius || sx > NATIVE_WIDTH + radius) return;
      ctx.globalAlpha = Math.min(1, strength);
      ctx.drawImage(this.brush, Math.round(sx - radius), Math.round(sy - radius), Math.round(radius * 2), Math.round(radius * 2));
      if (color !== null && used < MAX_GLOWS) {
        this.glows[used++]!.setPosition(Math.round(x), Math.round(y)).setTint(color).setScale(radius / 40).setAlpha(0.35 * strength).setVisible(true);
      }
    };

    const net = this.world.net;
    const caps = this.world.data.network.nodes;
    for (const node of net.nodes.values()) {
      const signal = node.stock.signal / caps[node.kind].capacity;
      if (node.kind === 'heart') {
        const sugar = node.stock.sugar / caps.heart.capacity;
        light(node.x, node.y, 34 + 26 * sugar + Math.sin(timeMs / 700) * 3, COLORS.gold, 1);
      } else if (node.kind === 'relay' && node.build >= 1) {
        light(node.x, node.y, 16 + 14 * signal, COLORS.violet, 0.9);
      } else if (node.kind === 'fruiting' && node.build >= 1) {
        light(node.x, node.y, 16, COLORS.magenta, 0.8);
        light(node.x, GROUND_Y - 6, 22, COLORS.magenta, 0.8);
      } else if (node.kind === 'storage') {
        light(node.x, node.y, 14, COLORS.orange, 0.6);
      } else if (signal > 0.15) {
        // Les jonctions parcourues par le signal luisent faiblement : le réseau dessine sa propre lumière.
        light(node.x, node.y, 6 + 10 * signal, null, 0.5 + 0.5 * signal);
      }
    }
    for (const d of this.world.deposits) {
      if (d.amount > 0) light(d.x, d.y - 2, 6 + 6 * (d.amount / d.max), COLORS.turquoise, 0.45);
    }
    const c = this.world.climate;
    if (c?.kind === 'fire') {
      const [left, right] = fireSpan(c);
      const flicker = 0.85 + 0.15 * Math.sin(timeMs / 60);
      light(left + 6, GROUND_Y - 4, 50, COLORS.ember, flicker);
      light(right - 6, GROUND_Y - 4, 50, COLORS.ember, flicker);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.texture.refresh();
  }
}
