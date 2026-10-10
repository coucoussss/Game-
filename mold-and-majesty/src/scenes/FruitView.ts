import Phaser from 'phaser';
import { GROUND_Y } from '../config';
import type { NetNode } from '../entities/Network';
import type { World } from '../systems/World';
import { lerpColor } from '../ui/color';

const STEM = 0xe8dcc0;
const CAP = 0xd86a8f;
const CAP_GLOW = 0xff7ad8;
const SPORES = [0x4fe0d0, 0xff7ad8, 0xffb04a];

/**
 * Sorties de champignons : chaque ruche opérationnelle fait pousser un carpophore en
 * surface, juste au-dessus d'elle, relié par un fil lumineux. Il grandit avec la
 * fructification, luit en automne et laisse échapper des spores ; la sporée le fait
 * exploser en un nuage qui part aussi loin que la portée obtenue.
 */
export class FruitView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly glows = new Map<number, Phaser.GameObjects.Image>();
  private readonly drift: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly burst: Phaser.GameObjects.Particles.ParticleEmitter;
  private time = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {
    this.graphics = scene.add.graphics().setDepth(5.5);
    this.drift = scene.add
      .particles(0, 0, 'px', {
        lifespan: { min: 2500, max: 5000 },
        speedY: { min: -8, max: -3 },
        speedX: { min: -3, max: 3 },
        alpha: { start: 1, end: 0 },
        tint: SPORES,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(7.5);
    this.burst = scene.add
      .particles(0, 0, 'px', {
        lifespan: { min: 2000, max: 4000 },
        speed: { min: 20, max: 70 },
        angle: { min: 200, max: 340 },
        gravityY: 4,
        alpha: { start: 1, end: 0 },
        tint: SPORES,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(7.5);
  }

  /** Hauteur du champignon (px) : il grandit avec la fructification et surtout en automne. */
  private height(node: NetNode): number {
    const autumn = this.world.season.def.id === 'autumn';
    return Math.round((autumn ? 5 : 3) + node.fruiting * 4 + Math.min(3, this.world.net.spores / 4));
  }

  draw(deltaMs: number): void {
    this.time += deltaMs;
    const g = this.graphics.clear();
    const autumn = this.world.season.def.id === 'autumn';
    const live = new Set<number>();
    for (const node of this.world.net.nodes.values()) {
      if (node.kind !== 'fruiting' || node.build < 1) continue;
      live.add(node.id);
      const x = node.x;
      const h = this.height(node);
      const sway = Math.round(Math.sin(this.time / 900 + node.id) * (h > 6 ? 1 : 0));
      // Fil lumineux entre la ruche et sa sortie.
      g.lineStyle(1, CAP_GLOW, 0.25).lineBetween(x, node.y, x, GROUND_Y);
      // Pied.
      g.fillStyle(STEM).fillRect(x, GROUND_Y - h, 1, h);
      g.fillStyle(lerpColor(STEM, 0x000000, 0.25)).fillRect(x + 1, GROUND_Y - h + 2, 1, h - 2);
      // Chapeau.
      const w = 3 + Math.round(h / 2);
      const capColor = autumn ? lerpColor(CAP, CAP_GLOW, 0.5 + 0.5 * Math.sin(this.time / 500 + node.id)) : CAP;
      g.fillStyle(capColor).fillRect(x - Math.floor(w / 2) + sway, GROUND_Y - h - 2, w, 2);
      g.fillRect(x - Math.floor(w / 2) + 1 + sway, GROUND_Y - h - 3, w - 2, 1);
      g.fillStyle(0xffffff, 0.6).fillRect(x - 1 + sway, GROUND_Y - h - 3, 1, 1);

      let glow = this.glows.get(node.id);
      if (!glow) {
        glow = this.scene.add.image(x, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(5.4).setTint(CAP_GLOW);
        this.glows.set(node.id, glow);
      }
      const pulse = 0.5 + 0.5 * Math.sin(this.time / 600 + node.id);
      glow.setPosition(x + sway, GROUND_Y - h - 2).setAlpha((autumn ? 0.35 : 0.12) * (0.6 + 0.4 * pulse)).setScale(autumn ? 0.9 : 0.6);

      // Spores qui s'échappent en continu en automne.
      if (autumn && Math.random() < deltaMs / 400) this.drift.emitParticleAt(x + sway, GROUND_Y - h - 3);
    }
    for (const [id, glow] of this.glows) {
      if (!live.has(id)) {
        glow.destroy();
        this.glows.delete(id);
      }
    }
  }

  /** Explosion de la sporée : plus la portée est grande, plus le nuage est dense. */
  sporee(reach: number): void {
    const count = Math.min(220, 30 + reach);
    for (const node of this.world.net.nodes.values()) {
      if (node.kind !== 'fruiting' || node.build < 1) continue;
      this.burst.emitParticleAt(node.x, GROUND_Y - this.height(node) - 3, Math.round(count / Math.max(1, this.world.hives)));
    }
  }
}
