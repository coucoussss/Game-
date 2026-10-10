import Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { TEXT_STYLE } from '../ui/text';
import type { OptionsSceneData } from './OptionsScene';

export interface PauseSceneData {
  onResume: () => void;
  onQuit: () => void;
}

/** Pause : reprendre, options, ou retour au royaume (la partie est sauvegardée). */
export class PauseScene extends Phaser.Scene {
  private params!: PauseSceneData;

  constructor() {
    super('Pause');
  }

  init(data: PauseSceneData): void {
    this.params = data;
  }

  create(): void {
    this.add.rectangle(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT, 0x0e0b12, 0.8).setOrigin(0).setInteractive();
    this.add.text(NATIVE_WIDTH / 2, 50, 'Pause', { ...TEXT_STYLE, color: '#c58fe0' }).setOrigin(0.5, 0).setResolution(1);
    const items: [string, () => void][] = [
      ['Reprendre', () => this.resume()],
      ['Options', () => this.options()],
      ['Retour au royaume', () => this.quit()],
    ];
    items.forEach(([label, action], i) => {
      this.add
        .text(NATIVE_WIDTH / 2, 80 + i * 22, label, { ...TEXT_STYLE, color: '#e8dcc0' })
        .setOrigin(0.5, 0)
        .setResolution(1)
        .setInteractive()
        .on('pointerdown', action);
    });
    this.input.keyboard?.on('keydown-ESC', () => this.resume());
  }

  private resume(): void {
    this.params.onResume();
    this.scene.stop();
  }

  private options(): void {
    this.scene.pause();
    const data: OptionsSceneData = { onClose: () => this.scene.resume() };
    this.scene.launch('Options', data);
  }

  private quit(): void {
    this.scene.stop();
    this.params.onQuit();
  }
}
