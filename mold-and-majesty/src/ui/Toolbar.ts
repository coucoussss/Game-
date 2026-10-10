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
  /** Icône pixel (nom de sprite). */
  icon?: string;
}

export const TOOLBAR_HEIGHT = 14;
export const TOOLBAR_Y = NATIVE_HEIGHT - TOOLBAR_HEIGHT;

/** Rangée de boutons cliquables au doigt ou à la souris, avec raccourcis clavier. */
export class Toolbar<T extends string> {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly width: number;
  private readonly labels = new Map<T, Phaser.GameObjects.Text>();
  private selected: T;

  constructor(
    scene: Phaser.Scene,
    private readonly buttons: readonly ToolbarButton<T>[],
    initial: T,
    private readonly onSelect: (id: T) => void,
  ) {
    this.selected = initial;
    this.width = Math.floor(NATIVE_WIDTH / buttons.length);
    this.graphics = scene.add.graphics().setDepth(10).setScrollFactor(0);

    buttons.forEach((button, i) => {
      const x = i * this.width;
      if (button.icon) {
        scene.add
          .image(x + 6, TOOLBAR_Y + TOOLBAR_HEIGHT / 2, `spr-${button.icon}`)
          .setDepth(11)
          .setScrollFactor(0);
      }
      const text = scene.add
        .text(x + (button.icon ? 11 : this.width / 2), TOOLBAR_Y + 3, button.icon ? button.label : `${i + 1}·${button.label}`, TEXT_STYLE)
        .setOrigin(button.icon ? 0 : 0.5, 0)
        .setResolution(1)
        .setDepth(11)
        .setScrollFactor(0);
      this.labels.set(button.id, text);
      scene.add
        .zone(x, TOOLBAR_Y, this.width, TOOLBAR_HEIGHT)
        .setOrigin(0)
        .setScrollFactor(0)
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

  setLabel(id: T, label: string): void {
    const index = this.buttons.findIndex((b) => b.id === id);
    const button = this.buttons[index];
    this.labels.get(id)?.setText(button?.icon ? label : `${index + 1}·${label}`);
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
