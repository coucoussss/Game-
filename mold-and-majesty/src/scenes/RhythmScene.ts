import Phaser from 'phaser';
import { audio } from '../audio/AudioEngine';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import type { SporulationDef } from '../data/types';
import { type Judgement, RhythmGame, generatePattern, sporeReach } from '../systems/RhythmGame';
import { TEXT_STYLE } from '../ui/text';

export interface RhythmSceneData {
  def: SporulationDef;
  seed: number;
  spores: number;
  /** Appelé à la fin avec le score (0..1). */
  onDone: (score: number) => void;
}

const LANE_Y = 92;
const HIT_X = 64;
/** Pixels parcourus par une note pendant une seconde. */
const SPEED = 90;
const NOTE_COLORS = [0x4fe0d0, 0xff7ad8, 0xffb04a];
/** Gamme pentatonique (la mineur) pour les notes frappées. */
const SCALE = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];

/**
 * Mini-jeu de la sporée : des spores lumineuses glissent vers le chapeau du champignon ;
 * il faut frapper (clic, toucher, Espace ou F) quand elles l'atteignent. La justesse
 * du rythme décide de la portée des spores.
 */
export class RhythmScene extends Phaser.Scene {
  private rhythm!: RhythmGame;
  private params!: RhythmSceneData;
  private start = 0;
  private notes: Phaser.GameObjects.Image[] = [];
  private cap!: Phaser.GameObjects.Graphics;
  private glow!: Phaser.GameObjects.Image;
  private feedback!: Phaser.GameObjects.Text;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private done = false;
  private beatIndex = 0;

  constructor() {
    super('Rhythm');
  }

  init(data: RhythmSceneData): void {
    this.params = data;
    this.done = false;
    this.beatIndex = 0;
    this.notes = [];
  }

  create(): void {
    const { def, seed } = this.params;
    this.rhythm = new RhythmGame(generatePattern(def, seed), def.windows);
    this.add.rectangle(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT, 0x0e0b12, 0.78).setOrigin(0);
    this.add
      .text(NATIVE_WIDTH / 2, 18, 'Sporée d\'automne', { ...TEXT_STYLE, align: 'center' })
      .setOrigin(0.5, 0)
      .setResolution(1);
    this.add
      .text(NATIVE_WIDTH / 2, 30, 'frappe quand les spores touchent le chapeau', { ...TEXT_STYLE, color: '#a89c88' })
      .setOrigin(0.5, 0)
      .setResolution(1);

    // Couloir et champignon-cible.
    const lane = this.add.graphics();
    lane.lineStyle(1, 0x3a3040).lineBetween(HIT_X, LANE_Y, NATIVE_WIDTH, LANE_Y);
    this.glow = this.add.image(HIT_X, LANE_Y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xff7ad8).setAlpha(0.3);
    this.cap = this.add.graphics();
    this.drawCap(0);

    this.feedback = this.add.text(HIT_X, LANE_Y + 24, '', { ...TEXT_STYLE, align: 'center' }).setOrigin(0.5, 0).setResolution(1);
    this.sparks = this.add.particles(0, 0, 'px', {
      lifespan: 700,
      speed: { min: 15, max: 60 },
      alpha: { start: 1, end: 0 },
      tint: NOTE_COLORS,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    for (const [i] of this.rhythm.notes.entries()) {
      this.notes.push(
        this.add.image(-10, LANE_Y, 'px2').setTint(NOTE_COLORS[i % NOTE_COLORS.length]!).setBlendMode(Phaser.BlendModes.ADD),
      );
    }

    // L'horloge de la scène n'est à jour qu'à la première image : on démarre le chrono là.
    this.start = -1;
    const strike = () => this.strike();
    this.input.on('pointerdown', strike);
    this.input.keyboard?.on('keydown-SPACE', strike);
    this.input.keyboard?.on('keydown-F', strike);
  }

  private get now(): number {
    return this.start < 0 ? 0 : this.time.now - this.start;
  }

  private drawCap(pressed: number): void {
    const g = this.cap.clear();
    const y = LANE_Y + pressed;
    g.fillStyle(0xe8dcc0).fillRect(HIT_X - 1, y + 3, 3, 14 - pressed);
    g.fillStyle(0xd86a8f).fillRect(HIT_X - 6, y - 1, 13, 4).fillRect(HIT_X - 4, y - 3, 9, 2);
    g.fillStyle(0xffffff, 0.6).fillRect(HIT_X - 2, y - 3, 2, 1);
  }

  private strike(): void {
    if (this.done) return;
    audio.unlock();
    const judgement = this.rhythm.hit(this.now);
    this.drawCap(2);
    this.time.delayedCall(80, () => this.drawCap(0));
    this.show(judgement);
  }

  private show(judgement: Judgement | null): void {
    const labels = { perfect: 'Parfait', good: 'Bien', miss: 'Raté' } as const;
    this.feedback.setText(judgement ? labels[judgement] : '·');
    this.feedback.setColor(judgement === 'perfect' ? '#4fe0d0' : judgement === 'good' ? '#ffb04a' : '#8a7a70');
    if (judgement === 'perfect' || judgement === 'good') {
      this.sparks.emitParticleAt(HIT_X, LANE_Y - 2, judgement === 'perfect' ? 14 : 6);
      audio.pluck(SCALE[this.rhythm.combo % SCALE.length]!, 0.4, judgement === 'perfect' ? 0.3 : 0.18);
      this.glow.setAlpha(0.9);
    }
  }

  override update(): void {
    if (this.start < 0) this.start = this.time.now;
    const now = this.now;
    // Pouls de fond sur chaque noire.
    const beat = 60000 / this.params.def.bpm;
    if (now > this.beatIndex * beat) {
      this.beatIndex++;
      audio.pluck(110, 0.25, 0.08);
    }
    this.glow.setAlpha(Math.max(0.3, this.glow.alpha - 0.03));

    this.rhythm.notes.forEach((t, i) => {
      const note = this.notes[i]!;
      const judged = this.rhythm.judgements[i];
      if (judged === 'perfect' || judged === 'good') {
        note.setVisible(false);
        return;
      }
      note.setPosition(Math.round(HIT_X + ((t - now) / 1000) * SPEED), LANE_Y - 1);
      note.setAlpha(judged === 'miss' ? 0.25 : 1);
    });
    if (this.rhythm.update(now).length > 0) this.show('miss');
    if (this.rhythm.finished && !this.done) this.finish();
  }

  private finish(): void {
    this.done = true;
    const score = this.rhythm.score();
    const reach = sporeReach(this.params.def, this.params.spores, score);
    this.add
      .text(NATIVE_WIDTH / 2, 140, `Les spores portent à ${reach} m`, { ...TEXT_STYLE, align: 'center', color: '#4fe0d0' })
      .setOrigin(0.5, 0)
      .setResolution(1);
    this.time.delayedCall(2200, () => {
      this.params.onDone(score);
      this.scene.stop();
    });
  }
}
