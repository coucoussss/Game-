import Phaser from 'phaser';
import { GROUND_Y, NATIVE_WIDTH, PLAY_BOTTOM, TICK_MS } from '../config';
import { gameData } from '../data';
import type { NodeKind, ThicknessId } from '../data/types';
import { FixedStep } from '../systems/FixedStep';
import { StrokeBuilder, convertNode, cutAt } from '../systems/NetworkBuilder';
import { World } from '../systems/World';
import { audio } from '../audio/AudioEngine';
import { PALETTE, TEXT_STYLE } from '../ui/text';
import { TOOLBAR_Y, Toolbar } from '../ui/Toolbar';
import { AllyView } from './AllyView';
import { EffectsView } from './EffectsView';
import { ForestView } from './ForestView';
import { FruitView } from './FruitView';
import type { RhythmSceneData } from './RhythmScene';
import type { SkillSceneData } from './SkillScene';
import { ThreatView } from './ThreatView';
import { type FluxOverlay, NetworkView } from './NetworkView';

type ToolId = ThicknessId | Exclude<NodeKind, 'heart' | 'junction'> | 'cut' | 'overlay' | 'speed';
type BuildTool = Exclude<ToolId, 'overlay' | 'speed'>;

const TOOL_HINTS: Record<BuildTool, string> = {
  thin: 'Fin : pousse vite, peu cher, fragile',
  medium: 'Moyen : compromis',
  thick: 'Épais : lent et cher, gros débit, résistant',
  storage: 'Réserve : touche une jonction (grand stock)',
  relay: 'Relais : touche une jonction (réémet le signal)',
  fruiting: 'Ruche : touche une jonction (spores)',
  cut: 'Couper : tranche un filament (stoppe une contagion)',
};

const OVERLAYS: readonly FluxOverlay[] = [null, 'sugar', 'water', 'minerals', 'signal'];
const OVERLAY_NAMES = { sugar: 'sucre', water: 'eau', minerals: 'minéraux', signal: 'signal' } as const;
const SPEEDS = [1, 4, 16] as const;

/** Durées d'affichage des messages, en ms. */
const HINT_MS = 2500;
const BANNER_MS = 5000;

/** Vue en coupe de la forêt et réseau de mycélium jouable. */
export class GameScene extends Phaser.Scene {
  private world!: World;
  private forestView!: ForestView;
  private networkView!: NetworkView;
  private allyView!: AllyView;
  private threatView!: ThreatView;
  private effectsView!: EffectsView;
  private fruitView!: FruitView;
  private sporeeButton!: Phaser.GameObjects.Container;
  private memoryButton!: Phaser.GameObjects.Graphics;
  private stroke!: StrokeBuilder;
  private toolbar!: Toolbar<ToolId>;
  private hint!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private debug!: Phaser.GameObjects.Text;
  private readonly clock = new FixedStep(TICK_MS, 64);
  private tool: BuildTool = 'thin';
  private overlay: FluxOverlay = null;
  private speed = 1;
  private hintAge = 0;
  private bannerAge = 0;
  private lastSeasonKey = '';

  constructor() {
    super('Game');
  }

  create(): void {
    // Paramètres de développement : ?seed=1&speed=60&tick=20000&event=fire&rival=black-rot&parasite&spores=10&memory=20
    const params = new URLSearchParams(window.location.search);
    const seed = Number(params.get('seed')) || Math.floor(Math.random() * 2 ** 31);
    this.speed = Number(params.get('speed')) || 1;
    this.world = new World(gameData, 'whispering-grove', seed);
    this.world.tick = Number(params.get('tick')) || 0;

    this.forestView = new ForestView(this, this.world);
    this.threatView = new ThreatView(this, this.world);
    this.networkView = new NetworkView(this, this.world.net, gameData.network);
    this.fruitView = new FruitView(this, this.world);
    this.allyView = new AllyView(this, this.world);
    this.effectsView = new EffectsView(this, this.world, (text) => this.showBanner(text));
    const event = params.get('event');
    if (event) this.world.startClimate(event);
    this.world.net.spores = Number(params.get('spores')) || 0;
    this.world.memory = Number(params.get('memory')) || this.world.memory;
    const rival = params.get('rival');
    if (rival !== null) this.world.spawnRival(rival || undefined);
    this.stroke = new StrokeBuilder(this.world.net, {
      grid: 4,
      step: 10,
      snapRadius: 6,
      bounds: { minX: 4, maxX: this.world.widthPx - 4, minY: GROUND_Y + 4, maxY: PLAY_BOTTOM },
    });

    this.add.graphics().setDepth(9).fillStyle(PALETTE.ink).fillRect(0, TOOLBAR_Y, NATIVE_WIDTH, 216 - TOOLBAR_Y);
    this.hint = this.add.text(4, TOOLBAR_Y - 10, '', TEXT_STYLE).setResolution(1).setDepth(10);
    this.banner = this.add
      .text(NATIVE_WIDTH / 2, 14, '', { ...TEXT_STYLE, align: 'center' })
      .setOrigin(0.5, 0)
      .setResolution(1)
      .setDepth(10)
      .setAlpha(0);
    this.debug = this.add.text(24, 3, '', TEXT_STYLE).setResolution(1).setDepth(10).setVisible(false);
    this.input.keyboard?.on('keydown-I', () => this.debug.setVisible(!this.debug.visible));

    this.toolbar = new Toolbar<ToolId>(
      this,
      [
        { id: 'thin', label: 'Fin', key: 'ONE' },
        { id: 'medium', label: 'Moyen', key: 'TWO' },
        { id: 'thick', label: 'Épais', key: 'THREE' },
        { id: 'storage', label: 'Stock', key: 'FOUR' },
        { id: 'relay', label: 'Relais', key: 'FIVE' },
        { id: 'fruiting', label: 'Ruche', key: 'SIX' },
        { id: 'cut', label: 'Coupe', key: 'SEVEN' },
        { id: 'overlay', label: 'Vue', key: 'EIGHT', action: true },
        { id: 'speed', label: `×${this.speed}`, key: 'NINE', action: true },
      ],
      this.tool,
      (id) => this.selectTool(id),
    );
    this.showHint(TOOL_HINTS[this.tool]);
    this.setupPointer();
    this.createCornerButtons();
  }

  /**
   * Deux boutons discrets dans le ciel : les cernes de mémoire (arbre de compétences, K)
   * et, en automne quand c'est possible, le champignon de la sporée (F).
   */
  private createCornerButtons(): void {
    this.memoryButton = this.add.graphics().setDepth(10);
    this.add
      .zone(2, 2, 18, 18)
      .setOrigin(0)
      .setDepth(10)
      .setInteractive()
      .on('pointerdown', () => this.openSkills());
    this.input.keyboard?.on('keydown-K', () => this.openSkills());

    const g = this.add.graphics();
    g.fillStyle(0xe8dcc0).fillRect(-1, 0, 3, 7);
    g.fillStyle(0xd86a8f).fillRect(-6, -3, 13, 4).fillRect(-4, -5, 9, 2);
    g.fillStyle(0xffffff, 0.7).fillRect(-2, -5, 2, 1);
    const glow = this.add.image(0, -2, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xff7ad8).setAlpha(0.5);
    const label = this.add.text(0, 9, 'Sporée', TEXT_STYLE).setOrigin(0.5, 0).setResolution(1);
    this.sporeeButton = this.add.container(NATIVE_WIDTH - 22, 12, [glow, g, label]).setDepth(10).setVisible(false);
    this.add
      .zone(NATIVE_WIDTH - 40, 2, 38, 28)
      .setOrigin(0)
      .setDepth(10)
      .setInteractive()
      .on('pointerdown', () => this.startSporee());
    this.input.keyboard?.on('keydown-F', () => this.startSporee());
  }

  private drawMemoryButton(time: number): void {
    // Cernes concentriques : un de plus à chaque doublement de la mémoire.
    const g = this.memoryButton.clear();
    const rings = Math.max(1, Math.min(4, Math.floor(Math.log2(1 + this.world.memory))));
    for (let i = 1; i <= rings; i++) {
      g.lineStyle(1, PALETTE.signal, 0.35 + 0.15 * Math.sin(time / 800 + i));
      g.strokeCircle(11, 11, i * 2 + 1);
    }
    g.fillStyle(PALETTE.signal).fillRect(10, 10, 2, 2);
  }

  private openSkills(): void {
    if (!this.scene.isActive()) return;
    this.scene.pause();
    const data: SkillSceneData = {
      defs: this.world.baseData.skills,
      owned: () => this.world.skills,
      memory: () => this.world.memory,
      unlock: (id) => {
        const ok = this.world.unlockSkill(id);
        if (ok) audio.pluck(523.3, 0.6, 0.25);
        return ok;
      },
      onClose: () => this.scene.resume(),
    };
    this.scene.launch('Skills', data);
  }

  private startSporee(): void {
    if (!this.scene.isActive() || !this.world.canSporulate()) return;
    audio.unlock();
    this.scene.pause();
    const data: RhythmSceneData = {
      def: this.world.data.sporulation,
      seed: this.world.tick,
      spores: this.world.net.spores,
      onDone: (score) => {
        const result = this.world.sporulate(score);
        this.fruitView.sporee(result.reach);
        this.scene.resume();
      },
    };
    this.scene.launch('Rhythm', data);
  }

  override update(time: number, delta: number): void {
    const steps = this.clock.advance(delta * this.speed);
    for (let i = 0; i < steps; i++) this.world.step();

    const visualDelta = delta * Math.min(this.speed, 4);
    this.forestView.draw(visualDelta);
    this.threatView.draw(visualDelta);
    this.networkView.draw(this.overlay, this.world.memory, time);
    this.fruitView.draw(visualDelta);
    this.allyView.draw(visualDelta);
    this.effectsView.draw(visualDelta);
    this.updateMessages(delta);
    this.drawMemoryButton(time);
    const canSporulate = this.world.canSporulate();
    this.sporeeButton.setVisible(canSporulate);
    if (canSporulate) this.sporeeButton.setScale(1 + 0.08 * Math.sin(time / 300));
    if (this.pendingParasite && this.world.net.nodes.size > 3) {
      this.pendingParasite = !this.world.seedParasites();
    }
  }

  /** Débogage : infecter un nœud dès que le réseau en compte quelques-uns. */
  private pendingParasite = new URLSearchParams(window.location.search).has('parasite');

  private updateMessages(delta: number): void {
    const season = this.world.season;
    const key = `${season.year}-${season.index}`;
    if (key !== this.lastSeasonKey) {
      this.lastSeasonKey = key;
      this.showBanner(`${season.def.name} · an ${season.year}\n${season.def.motto}`);
    }
    // Les messages apparaissent puis s'effacent d'eux-mêmes : pas d'interface permanente.
    this.bannerAge += delta;
    this.banner.setAlpha(fade(this.bannerAge, BANNER_MS));
    this.hintAge += delta;
    this.hint.setAlpha(fade(this.hintAge, HINT_MS) * 0.85);

    if (this.debug.visible) {
      const t = this.world.net.totals();
      const trust = this.world.allies.map((a) => a.species.charAt(0) + Math.round(a.trust * 9)).join(' ');
      this.debug.setText(
        `S ${t.sugar.toFixed(0)} E ${t.water.toFixed(0)} M ${t.minerals.toFixed(1)} ` +
          `Mém ${this.world.memory.toFixed(1)} Sp ${this.world.net.spores}\n` +
          `${season.def.id} ${(season.progress * 100).toFixed(0)}% ${this.world.weather.id} ` +
          `hum ${this.world.moisture.toFixed(2)} ${this.world.climate?.id ?? ''}\n${trust}`,
      );
    }
  }

  private selectTool(id: ToolId): void {
    if (id === 'overlay') {
      // Le bouton « Vue » fait défiler les calques sans changer d'outil.
      this.overlay = OVERLAYS[(OVERLAYS.indexOf(this.overlay) + 1) % OVERLAYS.length] ?? null;
      this.showHint(this.overlay ? `Vue : ${OVERLAY_NAMES[this.overlay]}` : 'Vue : forêt');
    } else if (id === 'speed') {
      const index = SPEEDS.indexOf(this.speed as (typeof SPEEDS)[number]);
      this.speed = SPEEDS[(index + 1) % SPEEDS.length]!;
      this.toolbar.setLabel('speed', `×${this.speed}`);
      this.showHint(`Vitesse ×${this.speed}`);
    } else {
      this.tool = id;
      this.showHint(TOOL_HINTS[id]);
    }
  }

  private showBanner(text: string): void {
    this.banner.setText(text);
    this.bannerAge = 0;
  }

  private showHint(text: string): void {
    this.hint.setText(text);
    this.hintAge = 0;
  }

  private setupPointer(): void {
    const isThickness = (t: ToolId): t is ThicknessId => t === 'thin' || t === 'medium' || t === 'thick';

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return; // clic sur la barre d'outils
      if (isThickness(this.tool)) {
        this.stroke.begin(p.worldX, p.worldY);
      } else if (this.tool === 'cut') {
        cutAt(this.world.net, p.worldX, p.worldY, 3);
      } else {
        const node = this.world.net.findNodeNear(p.worldX, p.worldY, 6);
        if (node) convertNode(this.world.net, node.id, this.tool as Exclude<BuildTool, ThicknessId | 'cut'>);
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      if (this.stroke.active && isThickness(this.tool)) this.stroke.move(p.worldX, p.worldY, this.tool);
      // Couper au glissé : on tranche tout ce que le geste traverse.
      else if (this.tool === 'cut') cutAt(this.world.net, p.worldX, p.worldY, 3);
    });
    const end = () => this.stroke.end();
    this.input.on('pointerup', end);
    this.input.on('pointerupoutside', end);
  }
}

/** Opacité d'un message : apparition rapide, maintien, puis effacement sur le dernier tiers. */
function fade(age: number, duration: number): number {
  if (age >= duration) return 0;
  if (age < 200) return age / 200;
  const fadeStart = duration * 0.66;
  return age < fadeStart ? 1 : 1 - (age - fadeStart) / (duration - fadeStart);
}
