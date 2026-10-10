import Phaser from 'phaser';
import { drawBackdrop } from '../art/backdrops';
import { COLORS } from '../art/palette';
import { SPRITES } from '../art/sprites';
import { audio, type SfxName } from '../audio/AudioEngine';
import { NATIVE_HEIGHT, NATIVE_WIDTH } from '../config';
import memoriesJson from '../data/memories.json';
import { type MemoryDef, type SequenceCue, cuesBetween, evaluate } from '../systems/Sequence';
import { hexToInt } from '../ui/color';
import { TEXT_STYLE } from '../ui/text';
import { profile, saveProfile } from './session';

export const MEMORIES = memoriesJson as unknown as MemoryDef[];

export interface MemorySceneData {
  memoryId: string;
  /** Scène à lancer ensuite (par défaut, le royaume). */
  then?: { scene: string; data?: object };
}

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;

/** Réglages des effets de particules utilisables dans les souvenirs. */
const PRESETS: Record<string, (x: number, y: number, w: number) => Phaser.Types.GameObjects.Particles.ParticleEmitterConfig> = {
  spores: (x, y, w) => ({ x: { min: x - w / 2, max: x + w / 2 }, y, lifespan: 4000, speedY: { min: -18, max: -6 }, speedX: { min: -6, max: 6 }, frequency: 60, tint: [COLORS.turquoise, COLORS.magenta, COLORS.orange], alpha: { start: 1, end: 0 }, blendMode: 'ADD' }),
  rain: (x, y, w) => ({ x: { min: x - w / 2, max: x + w / 2 }, y, lifespan: 1400, speedY: { min: 160, max: 200 }, speedX: -20, scaleY: 4, frequency: 8, tint: 0x9fb4d8, alpha: 0.6 }),
  embers: (x, y, w) => ({ x: { min: x - w / 2, max: x + w / 2 }, y, lifespan: 2500, speedY: { min: -40, max: -15 }, speedX: { min: -8, max: 8 }, frequency: 30, tint: [COLORS.orange, COLORS.ember, COLORS.gold], alpha: { start: 1, end: 0 }, blendMode: 'ADD' }),
  ash: (x, y, w) => ({ x: { min: x - w / 2, max: x + w / 2 }, y, lifespan: 6000, speedY: { min: 8, max: 20 }, speedX: { min: -6, max: 6 }, frequency: 50, tint: 0x8a8690, alpha: { start: 0.8, end: 0 } }),
  snow: (x, y, w) => ({ x: { min: x - w / 2, max: x + w / 2 }, y, lifespan: 9000, speedY: { min: 10, max: 22 }, speedX: { min: -5, max: 5 }, frequency: 35, tint: COLORS.ice, alpha: 0.9 }),
  'chem-war': (x, y, w) => ({ x: { min: x - w / 2, max: x + w / 2 }, y, lifespan: 900, speed: { min: 10, max: 50 }, frequency: 25, tint: [COLORS.turquoise, 0x7fbf5f], alpha: { start: 1, end: 0 }, blendMode: 'ADD' }),
  dust: (x, y, w) => ({ x: { min: x - w / 2, max: x + w / 2 }, y, lifespan: 2000, speed: { min: 5, max: 30 }, frequency: 20, tint: 0x9a96a0, alpha: { start: 0.7, end: 0 } }),
  drips: (x, y, w) => ({ x: { min: x - w / 2, max: x + w / 2 }, y, lifespan: 1800, speedY: { min: 60, max: 90 }, frequency: 400, tint: COLORS.water, alpha: 0.8 }),
  dissolve: (x, y, w) => ({ x: { min: x - w / 2, max: x + w / 2 }, y, lifespan: 3000, speedY: { min: -30, max: -10 }, speedX: { min: -10, max: 10 }, frequency: 20, tint: [COLORS.gold, COLORS.orange, 0xffffff], alpha: { start: 1, end: 0 }, blendMode: 'ADD' }),
};

/**
 * Lecteur de souvenirs : courtes scènes sans dialogue qui racontent la chute de
 * l'ancien royaume. Tout est décrit dans memories.json (acteurs, caméra, fondus,
 * particules, sons, musique) et interprété par systems/Sequence.ts.
 * Toucher l'écran (ou Espace / Échap) passe le souvenir.
 */
export class MemoryScene extends Phaser.Scene {
  private def!: MemoryDef;
  private params!: MemorySceneData;
  private t = 0;
  private actors = new Map<string, Phaser.GameObjects.Image>();
  private fade!: Phaser.GameObjects.Rectangle;
  private tint!: Phaser.GameObjects.Rectangle;
  private title!: Phaser.GameObjects.Text;
  private titleAge = Infinity;
  private emitters: Emitter[] = [];
  private finished = false;

  constructor() {
    super('Memory');
  }

  init(data: MemorySceneData): void {
    this.params = data;
    this.def = MEMORIES.find((m) => m.id === data.memoryId) ?? MEMORIES[0]!;
    this.t = 0;
    this.actors = new Map();
    this.emitters = [];
    this.finished = false;
    this.titleAge = Infinity;
  }

  create(): void {
    const world: Phaser.GameObjects.GameObject[] = [];
    const backdrop = this.add.graphics();
    drawBackdrop(backdrop, this.def.backdrop, this.def.id.length * 31);
    world.push(backdrop);
    for (const a of this.def.actors) {
      const img = this.add.image(a.x ?? 0, a.y ?? 0, `spr-${a.sprite}`, 0).setOrigin(0.5, 1).setDepth(a.depth ?? 1);
      if (a.flipX) img.setFlipX(true);
      if (a.tint) img.setTint(hexToInt(a.tint));
      this.actors.set(a.id, img);
      world.push(img);
    }

    // Les voiles et le titre vivent sur une caméra d'interface, insensible au zoom.
    this.tint = this.add.rectangle(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT, 0x000000, 0).setOrigin(0).setDepth(20);
    this.fade = this.add.rectangle(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT, 0x000000, 1).setOrigin(0).setDepth(21);
    this.title = this.add
      .text(NATIVE_WIDTH / 2, NATIVE_HEIGHT - 26, '', { ...TEXT_STYLE, align: 'center', color: '#e8dcc0' })
      .setOrigin(0.5, 0)
      .setResolution(1)
      .setDepth(22)
      .setAlpha(0);
    const skip = this.add
      .text(NATIVE_WIDTH - 4, 4, 'toucher pour passer', { ...TEXT_STYLE, color: '#6a6060' })
      .setOrigin(1, 0)
      .setResolution(1)
      .setDepth(22);
    this.tweens.add({ targets: skip, alpha: 0, delay: 2500, duration: 1500 });
    const ui = [this.tint, this.fade, this.title, skip];
    const uiCam = this.cameras.add(0, 0, NATIVE_WIDTH, NATIVE_HEIGHT);
    uiCam.ignore(world);
    this.cameras.main.ignore(ui);
    this.registry.set('memoryUi', uiCam);

    const { music } = this.def;
    audio.startMusic(music.root, music.tempo, music.mood);
    audio.setDensity(0.5);
    const skipNow = () => this.t > 800 && this.finish();
    this.input.on('pointerdown', skipNow);
    this.input.keyboard?.on('keydown-SPACE', skipNow);
    this.input.keyboard?.on('keydown-ESC', skipNow);
  }

  override update(_time: number, delta: number): void {
    if (this.finished) return;
    const t0 = this.t;
    this.t += delta;
    for (const cue of cuesBetween(this.def, t0, this.t)) this.trigger(cue);

    const state = evaluate(this.def, this.t);
    for (const a of this.def.actors) {
      const img = this.actors.get(a.id)!;
      const s = state.actors[a.id]!;
      img.setPosition(Math.round(s.x), Math.round(s.y)).setAlpha(s.alpha).setScale(s.scale).setAngle(s.angle);
      const frames = SPRITES[a.sprite]?.frames.length ?? 1;
      if (a.fps && frames > 1) img.setFrame(Math.floor((this.t / 1000) * a.fps) % frames);
    }
    const cam = this.cameras.main;
    cam.setZoom(state.camera.zoom);
    cam.centerOn(state.camera.x, state.camera.y);
    this.fade.setAlpha(state.fade);
    this.tint.setFillStyle(hexToInt(state.tint.color), state.tint.alpha);

    this.titleAge += delta;
    this.title.setAlpha(this.titleAge < 600 ? this.titleAge / 600 : Math.max(0, 1 - (this.titleAge - 4000) / 1000));
    if (this.t >= this.def.duration) this.finish();
  }

  private trigger(cue: SequenceCue): void {
    if (cue.particles) {
      const { preset, x, y, width, duration } = cue.particles;
      const config = PRESETS[preset]?.(x, y, width ?? 4);
      if (config) {
        const emitter = this.add.particles(0, 0, 'px', config).setDepth(3);
        (this.registry.get('memoryUi') as Phaser.Cameras.Scene2D.Camera | undefined)?.ignore(emitter);
        this.emitters.push(emitter);
        this.time.delayedCall(duration, () => emitter.stop());
      }
    }
    if (cue.shake !== undefined && !profile().settings.reducedMotion) this.cameras.main.shake(400, cue.shake * 0.004);
    if (cue.sfx) audio.sfx(cue.sfx as SfxName);
    if (cue.music) audio.setChord(cue.music.chord);
    if (cue.title) {
      this.title.setText(cue.title);
      this.titleAge = 0;
    }
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    audio.stopMusic();
    const p = profile();
    if (!p.seenMemories.includes(this.def.id)) {
      p.seenMemories.push(this.def.id);
      saveProfile();
    }
    const next = this.params.then ?? { scene: 'ForestSelect' };
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.time.delayedCall(450, () => this.scene.start(next.scene, next.data));
  }
}
