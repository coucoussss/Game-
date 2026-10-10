import Phaser from 'phaser';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import type { SkillDef, SkillsDef } from '../data/types';
import { SKILL_BRANCHES } from '../data/types';
import { type UnlockStatus, unlockStatus } from '../systems/Skills';
import { TEXT_STYLE } from '../ui/text';

export interface SkillSceneData {
  defs: SkillsDef;
  owned: () => ReadonlySet<string>;
  memory: () => number;
  /** Tente l'achat ; retourne true en cas de succès. */
  unlock: (id: string) => boolean;
  onClose: () => void;
}

const BRANCH_COLORS = { roots: 0xc98f4a, chemistry: 0x4fe0d0, spores: 0xff7ad8 } as const;
const COL_W = 120;
const NODE_W = 104;
const NODE_H = 26;

/**
 * Arbre de compétences : trois branches (Racines, Chimie, Spores), quatre rangs chacune.
 * On touche une compétence pour lire son effet, on la touche à nouveau pour l'acheter
 * avec de la mémoire. Ce qui est acquis luit ; ce qui est hors d'atteinte reste dans l'ombre.
 */
export class SkillScene extends Phaser.Scene {
  private params!: SkillSceneData;
  private graphics!: Phaser.GameObjects.Graphics;
  private info!: Phaser.GameObjects.Text;
  private memoryText!: Phaser.GameObjects.Text;
  private selected: SkillDef | null = null;

  constructor() {
    super('Skills');
  }

  init(data: SkillSceneData): void {
    this.params = data;
    this.selected = null;
  }

  create(): void {
    this.add.rectangle(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT, 0x0e0b12, 0.92).setOrigin(0);
    this.add.text(8, 6, 'Mémoire du réseau', TEXT_STYLE).setResolution(1);
    this.memoryText = this.add.text(NATIVE_WIDTH - 8, 6, '', { ...TEXT_STYLE, color: '#c58fe0' }).setOrigin(1, 0).setResolution(1);
    this.graphics = this.add.graphics();
    this.info = this.add
      .text(8, NATIVE_HEIGHT - 34, '', { ...TEXT_STYLE, wordWrap: { width: NATIVE_WIDTH - 16 } })
      .setResolution(1);

    const x0 = (NATIVE_WIDTH - COL_W * 3) / 2;
    SKILL_BRANCHES.forEach((branch, col) => {
      const cx = x0 + col * COL_W + COL_W / 2;
      this.add
        .text(cx, 20, this.params.defs.branches[branch], { ...TEXT_STYLE, color: '#' + BRANCH_COLORS[branch].toString(16) })
        .setOrigin(0.5, 0)
        .setResolution(1);
      const skills = this.params.defs.skills.filter((s) => s.branch === branch).sort((a, b) => a.tier - b.tier);
      skills.forEach((skill) => {
        const { x, y } = this.nodePos(skill, col);
        this.add.text(x + NODE_W / 2, y + 4, skill.name, { ...TEXT_STYLE, align: 'center' }).setOrigin(0.5, 0).setResolution(1);
        this.add
          .text(x + NODE_W / 2, y + 14, `${skill.cost} ◉`, { ...TEXT_STYLE, color: '#c58fe0' })
          .setOrigin(0.5, 0)
          .setResolution(1);
        this.add
          .zone(x, y, NODE_W, NODE_H)
          .setOrigin(0)
          .setInteractive()
          .on('pointerdown', () => this.choose(skill));
      });
    });

    const close = this.add.text(NATIVE_WIDTH - 8, NATIVE_HEIGHT - 12, 'Fermer ×', TEXT_STYLE).setOrigin(1, 0).setResolution(1);
    close.setInteractive().on('pointerdown', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.input.keyboard?.on('keydown-K', () => this.close());
    this.redraw();
  }

  private nodePos(skill: SkillDef, col: number): { x: number; y: number } {
    const x0 = (NATIVE_WIDTH - COL_W * 3) / 2;
    return { x: x0 + col * COL_W + (COL_W - NODE_W) / 2, y: 32 + (skill.tier - 1) * 34 };
  }

  private status(skill: SkillDef): UnlockStatus {
    return unlockStatus(skill, this.params.owned(), this.params.memory());
  }

  private choose(skill: SkillDef): void {
    if (this.selected === skill && this.status(skill) === 'available') {
      this.params.unlock(skill.id);
    }
    this.selected = skill;
    this.redraw();
  }

  private redraw(): void {
    const g = this.graphics.clear();
    this.memoryText.setText(`${Math.floor(this.params.memory())} ◉`);
    for (const skill of this.params.defs.skills) {
      const col = SKILL_BRANCHES.indexOf(skill.branch);
      const { x, y } = this.nodePos(skill, col);
      const color = BRANCH_COLORS[skill.branch];
      const status = this.status(skill);
      const fill = status === 'owned' ? 0.45 : status === 'available' ? 0.2 : 0.06;
      g.fillStyle(color, fill).fillRect(x, y, NODE_W, NODE_H);
      g.lineStyle(1, color, status === 'locked' ? 0.25 : status === 'owned' ? 1 : 0.7).strokeRect(x + 0.5, y + 0.5, NODE_W - 1, NODE_H - 1);
      if (skill.tier > 1) g.lineStyle(1, color, 0.4).lineBetween(x + NODE_W / 2, y - 8, x + NODE_W / 2, y);
      if (skill === this.selected) g.lineStyle(1, 0xffffff, 0.9).strokeRect(x - 1.5, y - 1.5, NODE_W + 3, NODE_H + 3);
    }
    if (this.selected) {
      const status = this.status(this.selected);
      const hint = {
        owned: 'Acquise.',
        available: 'Touche encore pour l\'acquérir.',
        locked: 'Acquiers d\'abord le rang précédent.',
        'too-expensive': 'Pas encore assez de mémoire.',
      }[status];
      this.info.setText(`${this.selected.description}\n${hint}`);
    } else {
      this.info.setText('La mémoire naît des saisons traversées, des spores et des victoires.');
    }
  }

  private close(): void {
    this.params.onClose();
    this.scene.stop();
  }
}
