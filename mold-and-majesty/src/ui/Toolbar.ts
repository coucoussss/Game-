import type Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { PALETTE, TEXT_STYLE } from './text';

export interface ToolbarButton<T> {
  id: T;
  label: string;
  /** Touche clavier équivalente (ex. 'ONE'). */
  key: string;
  /** Bouton d'action ponctuelle : il ne reste pas sélectionné. */
  action?: boolean;
}

export const TOOLBAR_HEIGHT = 14;
export const TOOLBAR_Y = NATIVE_HEIGHT - TOOLBAR_HEIGHT;

/** Rangée de boutons cliquables au doigt ou à la souris, avec raccourcis clavier. */
export class Toolbar<T extends string> {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly width: number;
  private selected: T;

  constructor(
    scene: Phaser.Scene,
    private readonly buttons: readonly ToolbarButton<T>[],
    initial: T,
    private readonly onSelect: (id: T) => void,
  ) {
    this.selected = initial;
    this.width = Math.floor(NATIVE_WIDTH / buttons.length);
    this.graphics = scene.add.graphics().setDepth(10);

    buttons.forEach((button, i) => {
      const x = i * this.width;
      scene.add
        .text(x + this.width / 2, TOOLBAR_Y + 3, `${i + 1}·${button.label}`, TEXT_STYLE)
        .setOrigin(0.5, 0)
        .setResolution(1)
        .setDepth(11);
      scene.add
        .zone(x, TOOLBAR_Y, this.width, TOOLBAR_HEIGHT)
        .setOrigin(0)
        .setInteractive()
        .on('pointerdown', () => this.select(button.id));
      scene.input.keyboard?.on(`keydown-${button.key}`, () => this.select(button.id));
    });
    this.redraw();
  }

  select(id: T): void {
    if (!this.buttons.find((b) => b.id === id)?.action) {
      this.selected = id;
      this.redraw();
    }
    this.onSelect(id);
  }

  private redraw(): void {
    const g = this.graphics.clear();
    this.buttons.forEach((button, i) => {
      const x = i * this.width;
      g.fillStyle(button.id === this.selected ? PALETTE.panelActive : PALETTE.panel);
      g.fillRect(x + 1, TOOLBAR_Y + 1, this.width - 2, TOOLBAR_HEIGHT - 2);
    });
  }
}
