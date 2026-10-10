import type Phaser from 'phaser';
import type { WorldEvent } from '../systems/events';
import type { World } from '../systems/World';
import { PALETTE } from '../ui/text';

interface Effect {
  age: number;
  duration: number;
  draw: (g: Phaser.GameObjects.Graphics, t: number) => void;
}

const ANGER = 0xd8402a;
const PARASITE = 0xa04ac8;

/**
 * Animations ponctuelles déclenchées par les événements de la simulation : une trahison
 * se voit (éclair rouge et larcin qui file), une contagion aussi (étincelle violette le
 * long du filament). Le bandeau ne nomme que les catastrophes climatiques.
 */
export class EffectsView {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly effects: Effect[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly world: World,
    private readonly announce: (text: string) => void,
    /** Appelé pour chaque événement (sons). */
    private readonly onEvent: (event: WorldEvent) => void = () => {},
  ) {
    this.graphics = scene.add.graphics().setDepth(8);
  }

  draw(deltaMs: number): void {
    for (const event of this.world.events.splice(0)) {
      this.spawn(event);
      this.onEvent(event);
    }
    const g = this.graphics.clear();
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i]!;
      fx.age += deltaMs;
      if (fx.age >= fx.duration) this.effects.splice(i, 1);
      else fx.draw(g, fx.age / fx.duration);
    }
  }

  private add(duration: number, draw: Effect['draw']): void {
    if (this.effects.length < 120) this.effects.push({ age: 0, duration, draw });
  }

  private spawn(event: WorldEvent): void {
    switch (event.type) {
      case 'betrayal': {
        const { x, y, tx, ty, kind } = event;
        // Onde de colère autour du traître…
        this.add(900, (g, t) => {
          g.lineStyle(1, ANGER, 1 - t);
          g.strokeCircle(x, y, 2 + t * 10);
        });
        // … puis le larcin qui file : sucre volé, morsure, parasites lâchés.
        const color = kind === 'infest' ? PARASITE : kind === 'gnaw' ? ANGER : PALETTE.sugar;
        this.add(1600, (g, t) => {
          for (let k = 0; k < 4; k++) {
            const p = Math.min(1, t * 1.4 - k * 0.1);
            if (p <= 0) continue;
            const from = kind === 'raid' || kind === 'hoard' ? { x: tx, y: ty } : { x, y };
            const to = kind === 'raid' || kind === 'hoard' ? { x, y } : { x: tx, y: ty };
            g.fillStyle(color, 1 - t * 0.5).fillRect(
              Math.round(from.x + (to.x - from.x) * p),
              Math.round(from.y + (to.y - from.y) * p) - k,
              1,
              1,
            );
          }
          if (kind === 'gnaw') {
            g.fillStyle(ANGER, 1 - t).fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 3, 3);
          }
        });
        break;
      }
      case 'infection': {
        const to = this.world.net.nodes.get(event.nodeId);
        const from = event.fromNodeId !== null ? this.world.net.nodes.get(event.fromNodeId) : undefined;
        if (!to) break;
        this.add(800, (g, t) => {
          const x = from ? from.x + (to.x - from.x) * t : to.x;
          const y = from ? from.y + (to.y - from.y) * t : to.y - (1 - t) * 8;
          g.fillStyle(PARASITE).fillRect(Math.round(x), Math.round(y), 2, 2);
        });
        break;
      }
      case 'rival': {
        const { x, y, phase } = event;
        if (phase === 'spawn') {
          this.add(1500, (g, t) => {
            g.fillStyle(0x5fae8e, 0.4 * (1 - t));
            g.fillCircle(x, y, 3 + t * 8);
          });
        }
        break;
      }
      case 'arrive':
      case 'leave':
        break;
      case 'climate':
        if (event.phase === 'start') this.announce(event.name);
        break;
    }
  }
}
