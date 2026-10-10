import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import type { Settings } from '../systems/Profile';
import { TEXT_STYLE } from '../ui/text';
import { profile, resetProfile, saveProfile } from './session';

export interface OptionsSceneData {
  onClose: () => void;
}

/** Applique les réglages qui ont un effet global (volumes). */
export function applySettings(settings: Settings): void {
  audio.setVolumes(settings.musicVolume, settings.sfxVolume);
}

type Row =
  | { label: string; kind: 'volume'; key: 'musicVolume' | 'sfxVolume' }
  | { label: string; kind: 'toggle'; key: 'reducedMotion' | 'highContrast' | 'rhythmAssist' | 'tutorial' }
  | { label: string; kind: 'fullscreen' }
  | { label: string; kind: 'reset' };

const ROWS: Row[] = [
  { label: 'Musique', kind: 'volume', key: 'musicVolume' },
  { label: 'Effets sonores', kind: 'volume', key: 'sfxVolume' },
  { label: 'Plein écran', kind: 'fullscreen' },
  { label: 'Mouvements réduits', kind: 'toggle', key: 'reducedMotion' },
  { label: 'Contraste élevé', kind: 'toggle', key: 'highContrast' },
  { label: 'Aide au rythme', kind: 'toggle', key: 'rhythmAssist' },
  { label: 'Tutoriel', kind: 'toggle', key: 'tutorial' },
  { label: 'Effacer la progression', kind: 'reset' },
];

/**
 * Options : volumes, plein écran et accessibilité (mouvements réduits, contraste élevé,
 * aide au rythme). Utilisable à la souris, au doigt ou au clavier (flèches, Entrée).
 */
export class OptionsScene extends Phaser.Scene {
  private params!: OptionsSceneData;
  private values: Phaser.GameObjects.Text[] = [];
  private cursor = 0;
  private marker!: Phaser.GameObjects.Text;
  private confirmReset = false;

  constructor() {
    super('Options');
  }

  init(data: OptionsSceneData): void {
    this.params = data;
    this.values = [];
    this.cursor = 0;
    this.confirmReset = false;
  }

  create(): void {
    this.add.rectangle(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT, 0x0e0b12, 0.94).setOrigin(0).setInteractive();
    this.add.text(NATIVE_WIDTH / 2, 8, 'Options', { ...TEXT_STYLE, color: '#c58fe0' }).setOrigin(0.5, 0).setResolution(1);
    this.marker = this.add.text(56, 0, '›', { ...TEXT_STYLE, color: '#4fe0d0' }).setResolution(1);
    ROWS.forEach((row, i) => {
      const y = 28 + i * 18;
      this.add.text(64, y, row.label, TEXT_STYLE).setResolution(1);
      const value = this.add.text(NATIVE_WIDTH - 64, y, '', { ...TEXT_STYLE, color: '#4fe0d0' }).setOrigin(1, 0).setResolution(1);
      this.values.push(value);
      // Zone tactile de la ligne : à gauche on baisse, à droite on monte (volumes).
      this.add
        .zone(48, y - 4, NATIVE_WIDTH - 96, 16)
        .setOrigin(0)
        .setInteractive()
        .on('pointerdown', (p: Phaser.Input.Pointer) => {
          this.cursor = i;
          this.activate(row, p.x < NATIVE_WIDTH / 2 ? -1 : 1);
        });
    });
    const close = this.add.text(NATIVE_WIDTH / 2, NATIVE_HEIGHT - 16, 'Fermer ×', TEXT_STYLE).setOrigin(0.5, 0).setResolution(1);
    close.setInteractive().on('pointerdown', () => this.close());

    const kb = this.input.keyboard;
    kb?.on('keydown-UP', () => this.move(-1));
    kb?.on('keydown-DOWN', () => this.move(1));
    kb?.on('keydown-LEFT', () => this.activate(ROWS[this.cursor]!, -1));
    kb?.on('keydown-RIGHT', () => this.activate(ROWS[this.cursor]!, 1));
    kb?.on('keydown-ENTER', () => this.activate(ROWS[this.cursor]!, 1));
    kb?.on('keydown-ESC', () => this.close());
    this.refresh();
  }

  private move(d: number): void {
    this.cursor = (this.cursor + d + ROWS.length) % ROWS.length;
    this.refresh();
  }

  private activate(row: Row, direction: number): void {
    const s = profile().settings;
    audio.unlock();
    if (row.kind === 'volume') {
      s[row.key] = Math.round(Math.min(1, Math.max(0, s[row.key] + direction * 0.1)) * 10) / 10;
      applySettings(s);
      audio.pluck(440, 0.2, 0.2 * s.sfxVolume);
    } else if (row.kind === 'toggle') {
      s[row.key] = !s[row.key];
    } else if (row.kind === 'fullscreen') {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    } else if (row.kind === 'reset') {
      if (this.confirmReset) {
        resetProfile();
        this.confirmReset = false;
        this.close();
        this.scene.stop('Game');
        this.scene.start('ForestSelect');
        return;
      }
      this.confirmReset = true;
    }
    saveProfile();
    this.refresh();
  }

  private refresh(): void {
    const s = profile().settings;
    ROWS.forEach((row, i) => {
      let text = '';
      if (row.kind === 'volume') text = `‹ ${'■'.repeat(Math.round(s[row.key] * 10))}${'·'.repeat(10 - Math.round(s[row.key] * 10))} ›`;
      else if (row.kind === 'toggle') text = s[row.key] ? 'oui' : 'non';
      else if (row.kind === 'fullscreen') text = this.scale.isFullscreen ? 'oui' : 'non';
      else text = this.confirmReset ? 'Toucher encore pour confirmer' : '';
      this.values[i]!.setText(text);
    });
    this.marker.setY(28 + this.cursor * 18);
  }

  private close(): void {
    this.params.onClose();
    this.scene.stop();
  }
}
