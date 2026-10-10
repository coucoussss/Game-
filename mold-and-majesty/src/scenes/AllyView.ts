import type Phaser from 'phaser';
import { type Ally, type Mood, moodOf } from '../entities/Ally';
import type { World } from '../systems/World';
import { drawSprite } from '../art/drawSprite';
import { lerpColor } from '../ui/color';
import { PALETTE } from '../ui/text';

const HISTORY = 24;
const WORM = 0xc98a8a;
const BEETLE = 0x2f4a5a;
const ANGER = 0x9a2a20;

/**
 * Bêtes alliées. Leur confiance se lit dans leur gestuelle :
 * - fourmis : colonne ordonnée qui porte des brindilles (dévouées), file qui hésite
 *   (méfiantes), grouillement rougeâtre et désordonné (hostiles) ;
 * - ver : ondulation paisible et turricules derrière lui (dévoué), corps qui se tortille
 *   (méfiant), qui se rétracte et rougit (hostile) ;
 * - scarabée : carapace irisée et spore sur le dos (dévoué), élytres qui frémissent
 *   (méfiant, prêt à partir), carapace sombre et ailes ouvertes (hostile).
 * Les fourmis et scarabées disparaissent sous terre en hiver ; les vers s'y enroulent.
 */
export class AllyView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly trails = new Map<number, { x: number; y: number }[]>();
  private readonly castings: { x: number; y: number; age: number }[] = [];
  private time = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: World,
  ) {
    this.graphics = scene.add.graphics().setDepth(6);
  }

  draw(deltaMs: number): void {
    this.time += deltaMs;
    const g = this.graphics.clear();
    const alive = new Set<number>();
    for (const ally of this.world.allies) {
      if (ally.species === 'tree') continue;
      alive.add(ally.id);
      const trail = this.trailOf(ally);
      const left = this.scene.cameras.main.scrollX;
      if (ally.x < left - 20 || ally.x > left + 404) continue;
      const mood = moodOf(ally);
      if (ally.species === 'ant') this.drawAnts(g, ally, trail, mood);
      else if (ally.species === 'worm') this.drawWorm(g, ally, trail, mood, deltaMs);
      else this.drawBeetle(g, ally, mood);
    }
    for (const id of this.trails.keys()) if (!alive.has(id)) this.trails.delete(id);

    for (let i = this.castings.length - 1; i >= 0; i--) {
      const c = this.castings[i]!;
      c.age += deltaMs;
      if (c.age > 20000) this.castings.splice(i, 1);
      else g.fillStyle(0x1a120e, 0.7 * (1 - c.age / 20000)).fillRect(c.x, c.y, 1, 1);
    }
  }

  /** Historique des positions : les fourmis se suivent en file, le ver ondule le long. */
  private trailOf(ally: Ally): { x: number; y: number }[] {
    let trail = this.trails.get(ally.id);
    if (!trail) {
      trail = [];
      this.trails.set(ally.id, trail);
    }
    const last = trail[0];
    if (!last || Math.hypot(last.x - ally.x, last.y - ally.y) >= 1) {
      trail.unshift({ x: ally.x, y: ally.y });
      if (trail.length > HISTORY) trail.pop();
    }
    return trail;
  }

  private jitter(amount: number, seed: number): number {
    return Math.round(Math.sin(this.time / 47 + seed * 13.7) * amount);
  }

  private drawAnts(g: Phaser.GameObjects.Graphics, ally: Ally, trail: { x: number; y: number }[], mood: Mood): void {
    if (ally.state === 'dormant') {
      // En hiver, la fourmilière : un petit dôme de terre.
      g.fillStyle(0x3a2a20).fillRect(Math.round(ally.x) - 2, Math.round(ally.y), 5, 1);
      g.fillStyle(0x3a2a20).fillRect(Math.round(ally.x) - 1, Math.round(ally.y) - 1, 3, 1);
      return;
    }
    const carrying = this.world.tick - ally.lastTrade < 30 && mood !== 'hostile';
    const spacing = mood === 'devoted' ? 4 : mood === 'friendly' ? 5 : 3;
    for (let i = 0; i < 4; i++) {
      const point = trail[Math.min(trail.length - 1, i * spacing)] ?? ally;
      const chaos = mood === 'hostile' ? 2 : mood === 'wary' ? 1 : 0;
      const x = Math.round(point.x) + this.jitter(chaos, ally.id + i);
      const y = Math.round(point.y) + this.jitter(chaos * 0.5, ally.id * 3 + i);
      // Sprite en deux temps de marche, teinté de rouge quand la colonie est hostile.
      drawSprite(g, 'ant', x + 2, y + 1, {
        frame: Math.floor(this.time / 120 + i) % 2,
        flipX: (trail[0]?.x ?? 0) < (trail[1]?.x ?? 0),
        ...(mood === 'hostile' ? { tint: ANGER, tintAmount: 0.6 } : {}),
      });
      if (carrying && i % 2 === 0) {
        const bit = ally.lastGift === 'minerals' ? PALETTE.minerals : 0x7fbf5f;
        g.fillStyle(bit).fillRect(x + 1, y - 1, 1, 1);
      }
    }
  }

  private drawWorm(
    g: Phaser.GameObjects.Graphics,
    ally: Ally,
    trail: { x: number; y: number }[],
    mood: Mood,
    deltaMs: number,
  ): void {
    const color = mood === 'hostile' ? lerpColor(WORM, ANGER, 0.5) : WORM;
    const length = mood === 'hostile' ? 3 : 6;
    if (ally.state === 'dormant' || mood === 'hostile') {
      // Enroulé sur lui-même (sommeil d'hiver) ou rétracté (colère).
      const x = Math.round(ally.x);
      const y = Math.round(ally.y);
      g.fillStyle(color).fillRect(x - 1, y - 1, 3, 1).fillRect(x - 1, y + 1, 3, 1).fillRect(x - 1, y, 1, 1).fillRect(x + 1, y, 1, 1);
      if (mood === 'hostile' && Math.sin(this.time / 90) > 0) g.fillStyle(ANGER).fillRect(x, y, 1, 1);
      return;
    }
    const wiggle = mood === 'wary' ? 2 : 1;
    for (let i = 0; i < length; i++) {
      const point = trail[Math.min(trail.length - 1, i)] ?? ally;
      const off = Math.round(Math.sin(this.time / 300 + i * 0.9) * wiggle * (i / length));
      g.fillStyle(i === 0 ? lerpColor(color, 0xffffff, 0.15) : color).fillRect(Math.round(point.x), Math.round(point.y) + off, 1, 1);
    }
    // Un ver dévoué laisse derrière lui des turricules qui enrichissent la terre.
    if (mood === 'devoted' && Math.random() < deltaMs / 1500) {
      const tail = trail[trail.length - 1] ?? ally;
      this.castings.push({ x: Math.round(tail.x), y: Math.round(tail.y) + 1, age: 0 });
    }
  }

  private drawBeetle(g: Phaser.GameObjects.Graphics, ally: Ally, mood: Mood): void {
    if (ally.state === 'dormant') return; // hiverne hors de vue
    const x = Math.round(ally.x);
    const y = Math.round(ally.y);
    let shell = BEETLE;
    if (mood === 'devoted') {
      // Carapace irisée.
      shell = lerpColor(BEETLE, 0x5fae8e, 0.5 + 0.5 * Math.sin(this.time / 400));
    } else if (mood === 'hostile') {
      shell = lerpColor(BEETLE, ANGER, 0.45);
    }
    drawSprite(g, 'beetle', x + 2, y, {
      frame: Math.floor(this.time / 160) % 2,
      flipX: ally.tx < ally.x,
      tint: shell,
      tintAmount: mood === 'friendly' ? 0 : 0.6,
    });
    const flutter = mood === 'wary' && Math.floor(this.time / 80) % 2 === 0;
    if (mood === 'hostile' || flutter) {
      g.fillStyle(0xd8d0c0, 0.5).fillRect(x - 1, y - 2, 2, 1).fillRect(x + 2, y - 2, 2, 1);
    }
    if (mood === 'devoted' && this.world.tick - ally.lastTrade < 40) {
      g.fillStyle(0xd86a8f).fillRect(x + 1, y - 2, 1, 1); // une spore sur le dos
    }
  }
}
