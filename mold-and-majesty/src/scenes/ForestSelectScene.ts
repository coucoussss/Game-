import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import { gameData } from '../data';
import type { ForestDef } from '../data/types';
import { campaignOrder } from '../systems/Profile';
import { unlockStatus } from '../systems/Skills';
import { hexToInt, lerpColor } from '../ui/color';
import { TEXT_STYLE } from '../ui/text';
import { MEMORIES } from './MemoryScene';
import type { OptionsSceneData } from './OptionsScene';
import { type GameStart, nextEndlessForest, profile, saveProfile } from './session';
import type { SkillSceneData } from './SkillScene';

/** Positions des 8 forêts sur la carte du royaume (chemin sinueux vers l'Arbre-Mère). */
const MAP: [number, number][] = [
  [34, 128],
  [76, 100],
  [120, 124],
  [162, 92],
  [206, 116],
  [250, 86],
  [294, 112],
  [344, 76],
];

interface Button {
  label: string;
  action: () => void;
  enabled: () => boolean;
}

/**
 * Le royaume : carte des 8 forêts de la campagne (verrouillées, ouvertes, conquises),
 * fiche de la forêt choisie (règle spéciale, objectif, record), mode infini, arbre de
 * compétences, souvenirs et options.
 */
export class ForestSelectScene extends Phaser.Scene {
  private selected = 0;
  private graphics!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private details!: Phaser.GameObjects.Text;
  private buttons: { button: Button; text: Phaser.GameObjects.Text }[] = [];

  constructor() {
    super('ForestSelect');
  }

  private get order(): string[] {
    return campaignOrder(gameData);
  }

  private forest(i: number): ForestDef {
    return gameData.forests.get(this.order[i]!)!;
  }

  private isUnlocked(i: number): boolean {
    return profile().unlocked.includes(this.order[i]!);
  }

  create(): void {
    this.buttons = [];
    const p = profile();
    // Par défaut : la dernière forêt ouverte.
    this.selected = Math.max(0, ...this.order.map((id, i) => (p.unlocked.includes(id) ? i : 0)));
    this.add.text(NATIVE_WIDTH / 2, 6, 'Mold & Majesty', { ...TEXT_STYLE, fontSize: '16px', color: '#e8dcc0' }).setOrigin(0.5, 0).setResolution(1);
    this.add.text(NATIVE_WIDTH / 2, 26, 'Le royaume perdu', { ...TEXT_STYLE, color: '#8a7a70' }).setOrigin(0.5, 0).setResolution(1);
    this.graphics = this.add.graphics();
    this.title = this.add.text(8, 146, '', { ...TEXT_STYLE, color: '#4fe0d0' }).setResolution(1);
    this.details = this.add.text(8, 157, '', { ...TEXT_STYLE, color: '#c8bca8', wordWrap: { width: NATIVE_WIDTH - 16 } }).setResolution(1);

    MAP.forEach(([x, y], i) => {
      this.add
        .zone(x - 10, y - 10, 20, 20)
        .setOrigin(0)
        .setInteractive()
        .on('pointerdown', () => {
          if (this.selected === i && this.isUnlocked(i)) this.play();
          else this.select(i);
        });
    });

    const buttons: Button[] = [
      { label: 'Entrer', action: () => this.play(), enabled: () => this.isUnlocked(this.selected) },
      {
        label: 'Reprendre',
        action: () => this.resume(),
        enabled: () => profile().run !== null,
      },
      { label: 'Infini', action: () => this.endless(), enabled: () => true },
      { label: 'Mémoire', action: () => this.openSkills(), enabled: () => true },
      { label: 'Souvenirs', action: () => this.openGallery(), enabled: () => profile().seenMemories.length > 0 },
      { label: 'Options', action: () => this.openOptions(), enabled: () => true },
    ];
    const w = Math.floor(NATIVE_WIDTH / buttons.length);
    buttons.forEach((button, i) => {
      const text = this.add
        .text(i * w + w / 2, NATIVE_HEIGHT - 12, button.label, TEXT_STYLE)
        .setOrigin(0.5, 0)
        .setResolution(1);
      this.add
        .zone(i * w, NATIVE_HEIGHT - 15, w, 15)
        .setOrigin(0)
        .setInteractive()
        .on('pointerdown', () => button.enabled() && button.action());
      this.buttons.push({ button, text });
    });

    const kb = this.input.keyboard;
    kb?.on('keydown-RIGHT', () => this.select(Math.min(7, this.selected + 1)));
    kb?.on('keydown-LEFT', () => this.select(Math.max(0, this.selected - 1)));
    kb?.on('keydown-ENTER', () => this.isUnlocked(this.selected) && this.play());
    kb?.on('keydown-K', () => this.openSkills());
    this.input.on('pointerdown', () => audio.unlock());
    this.select(this.selected);
  }

  private select(i: number): void {
    this.selected = i;
    const f = this.forest(i);
    const p = profile();
    const locked = !this.isUnlocked(i);
    const conquered = p.completed.includes(f.id);
    const best = p.bestReach[f.id];
    this.title.setText(locked ? `${i + 1}. ???` : `${i + 1}. ${f.name}${conquered ? '  ✦ conquise' : ''}`);
    this.details.setText(
      locked
        ? 'Conquiers la forêt précédente : tes spores doivent porter jusqu\'ici.'
        : `${f.rules.summary}\nObjectif : une sporée à ${f.goal.reach} m${best ? ` — record ${best} m` : ''}.`,
    );
  }

  override update(time: number): void {
    const g = this.graphics.clear();
    const p = profile();
    // Chemin entre les forêts.
    for (let i = 1; i < MAP.length; i++) {
      const open = this.isUnlocked(i);
      g.lineStyle(1, open ? 0x8a7a60 : 0x3a3036, 1);
      g.lineBetween(MAP[i - 1]![0], MAP[i - 1]![1], MAP[i]![0], MAP[i]![1]);
    }
    MAP.forEach(([x, y], i) => {
      const f = this.forest(i);
      const open = this.isUnlocked(i);
      const conquered = p.completed.includes(f.id);
      const biome = gameData.biomes[f.biome];
      const color = biome && biome.strength > 0 ? lerpColor(0x4a8a4a, hexToInt(biome.tint), 0.6) : 0x4a8a4a;
      const pulse = 0.5 + 0.5 * Math.sin(time / 500 + i);
      if (i === this.selected) g.fillStyle(0x4fe0d0, 0.15 + 0.15 * pulse).fillCircle(x, y, 10);
      // Petit bosquet : trois houppiers et un tronc.
      g.fillStyle(open ? color : 0x2a2428).fillCircle(x - 3, y - 2, 4).fillCircle(x + 3, y - 2, 4).fillCircle(x, y - 5, 4);
      g.fillStyle(open ? 0x4a352c : 0x221c20).fillRect(x - 1, y + 1, 2, 4);
      if (conquered) {
        g.fillStyle(0xff7ad8, 0.6 + 0.4 * pulse).fillRect(x + 5, y - 9, 2, 2);
        g.fillStyle(0xe8dcc0).fillRect(x + 5, y - 7, 1, 3);
      }
      if (!open) g.fillStyle(0x0e0b12, 0.5).fillCircle(x, y - 2, 8);
    });
    for (const { button, text } of this.buttons) text.setAlpha(button.enabled() ? 1 : 0.3);
  }

  private start(start: GameStart): void {
    audio.unlock();
    this.scene.start('Game', start);
  }

  private play(): void {
    const forest = this.forest(this.selected);
    const p = profile();
    // Une seule partie en cours : entrer ailleurs abandonne l'ancienne.
    p.run = null;
    saveProfile();
    if (forest.memory && !p.seenMemories.includes(forest.memory)) {
      this.scene.start('Memory', { memoryId: forest.memory, then: { scene: 'Game', data: { mode: 'campaign', forest } } });
      return;
    }
    this.start({ mode: 'campaign', forest });
  }

  private resume(): void {
    const run = profile().run;
    if (!run) return;
    this.start({ mode: run.mode, forest: run.snapshot.forest, snapshot: run.snapshot });
  }

  private endless(): void {
    const p = profile();
    p.run = null;
    saveProfile();
    this.start({ mode: 'endless', forest: nextEndlessForest() });
  }

  private openOptions(): void {
    this.scene.pause();
    const data: OptionsSceneData = { onClose: () => this.scene.resume() };
    this.scene.launch('Options', data);
  }

  /** Galerie des souvenirs déjà vus, à revoir à volonté. */
  private openGallery(): void {
    const seen = profile().seenMemories;
    const layer = this.add.container(0, 0).setDepth(30);
    layer.add(this.add.rectangle(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT, 0x0e0b12, 0.94).setOrigin(0).setInteractive());
    layer.add(this.add.text(NATIVE_WIDTH / 2, 10, 'Souvenirs du royaume', { ...TEXT_STYLE, color: '#c58fe0' }).setOrigin(0.5, 0).setResolution(1));
    MEMORIES.forEach((m, i) => {
      const known = seen.includes(m.id);
      const text = this.add
        .text(NATIVE_WIDTH / 2, 30 + i * 18, known ? `${m.numeral}. ${m.title}` : `${m.numeral}. ???`, {
          ...TEXT_STYLE,
          color: known ? '#e8dcc0' : '#4a4048',
        })
        .setOrigin(0.5, 0)
        .setResolution(1);
      if (known) text.setInteractive().on('pointerdown', () => this.scene.start('Memory', { memoryId: m.id }));
      layer.add(text);
    });
    const close = this.add.text(NATIVE_WIDTH / 2, NATIVE_HEIGHT - 16, 'Fermer ×', TEXT_STYLE).setOrigin(0.5, 0).setResolution(1);
    close.setInteractive().on('pointerdown', () => layer.destroy());
    layer.add(close);
  }

  private openSkills(): void {
    const p = profile();
    this.scene.pause();
    const data: SkillSceneData = {
      defs: gameData.skills,
      owned: () => new Set(p.skills),
      memory: () => p.memory,
      unlock: (id) => {
        const skill = gameData.skills.skills.find((s) => s.id === id);
        if (!skill || unlockStatus(skill, new Set(p.skills), p.memory) !== 'available') return false;
        p.memory -= skill.cost;
        p.skills.push(id);
        saveProfile();
        audio.pluck(523.3, 0.6, 0.25);
        return true;
      },
      onClose: () => this.scene.resume(),
    };
    this.scene.launch('Skills', data);
  }
}
