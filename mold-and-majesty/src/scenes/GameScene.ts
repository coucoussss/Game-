import Phaser from 'phaser';
import { GROUND_Y, NATIVE_WIDTH, TICK_MS } from '../config';
import { gameData } from '../data';
import type { NodeKind, ThicknessId } from '../data/types';
import { FixedStep } from '../systems/FixedStep';
import { StrokeBuilder, convertNode } from '../systems/NetworkBuilder';
import { World } from '../systems/World';
import { PALETTE, TEXT_STYLE } from '../ui/text';
import { TOOLBAR_Y, Toolbar } from '../ui/Toolbar';
import { ForestView } from './ForestView';
import { type FluxOverlay, NetworkView } from './NetworkView';

type ToolId = ThicknessId | Exclude<NodeKind, 'heart' | 'junction'> | 'overlay' | 'speed';

const TOOL_HINTS: Record<Exclude<ToolId, 'overlay' | 'speed'>, string> = {
  thin: 'Fin : pousse vite, peu cher, fragile',
  medium: 'Moyen : compromis',
  thick: 'Épais : lent et cher, gros débit, résistant',
  storage: 'Réserve : touche une jonction (grand stock)',
  relay: 'Relais : touche une jonction (réémet le signal)',
  fruiting: 'Ruche : touche une jonction (spores)',
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
  private stroke!: StrokeBuilder;
  private toolbar!: Toolbar<ToolId>;
  private hint!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private debug!: Phaser.GameObjects.Text;
  private readonly clock = new FixedStep(TICK_MS, 64);
  private tool: Exclude<ToolId, 'overlay' | 'speed'> = 'thin';
  private overlay: FluxOverlay = null;
  private speed = 1;
  private hintAge = 0;
  private bannerAge = 0;
  private lastSeasonKey = '';

  constructor() {
    super('Game');
  }

  create(): void {
    // Paramètres de développement : ?seed=1&speed=60&tick=20000
    const params = new URLSearchParams(window.location.search);
    const seed = Number(params.get('seed')) || Math.floor(Math.random() * 2 ** 31);
    this.speed = Number(params.get('speed')) || 1;
    this.world = new World(gameData, 'whispering-grove', seed);
    this.world.tick = Number(params.get('tick')) || 0;

    this.forestView = new ForestView(this, this.world);
    this.networkView = new NetworkView(this, this.world.net, gameData.network);
    this.stroke = new StrokeBuilder(this.world.net, {
      grid: 4,
      step: 10,
      snapRadius: 6,
      bounds: { minX: 4, maxX: this.world.widthPx - 4, minY: GROUND_Y + 4, maxY: TOOLBAR_Y - 6 },
    });

    this.add.graphics().setDepth(9).fillStyle(PALETTE.ink).fillRect(0, TOOLBAR_Y, NATIVE_WIDTH, 216 - TOOLBAR_Y);
    this.hint = this.add.text(4, TOOLBAR_Y - 10, '', TEXT_STYLE).setResolution(1).setDepth(10);
    this.banner = this.add
      .text(NATIVE_WIDTH / 2, 14, '', { ...TEXT_STYLE, align: 'center' })
      .setOrigin(0.5, 0)
      .setResolution(1)
      .setDepth(10)
      .setAlpha(0);
    this.debug = this.add.text(4, 3, '', TEXT_STYLE).setResolution(1).setDepth(10).setVisible(false);
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
        { id: 'overlay', label: 'Vue', key: 'SEVEN', action: true },
        { id: 'speed', label: `×${this.speed}`, key: 'EIGHT', action: true },
      ],
      this.tool,
      (id) => this.selectTool(id),
    );
    this.showHint(TOOL_HINTS[this.tool]);
    this.setupPointer();
  }

  override update(time: number, delta: number): void {
    const steps = this.clock.advance(delta * this.speed);
    for (let i = 0; i < steps; i++) this.world.step();

    this.forestView.draw(delta * Math.min(this.speed, 4));
    this.networkView.draw(this.overlay, this.world.memory, time);
    this.updateMessages(delta);
  }

  private updateMessages(delta: number): void {
    const season = this.world.season;
    const key = `${season.year}-${season.index}`;
    if (key !== this.lastSeasonKey) {
      this.lastSeasonKey = key;
      this.banner.setText(`${season.def.name} · an ${season.year}\n${season.def.motto}`);
      this.bannerAge = 0;
    }
    // Les messages apparaissent puis s'effacent d'eux-mêmes : pas d'interface permanente.
    this.bannerAge += delta;
    this.banner.setAlpha(fade(this.bannerAge, BANNER_MS));
    this.hintAge += delta;
    this.hint.setAlpha(fade(this.hintAge, HINT_MS) * 0.85);

    if (this.debug.visible) {
      const t = this.world.net.totals();
      this.debug.setText(
        `S ${t.sugar.toFixed(0)} E ${t.water.toFixed(0)} M ${t.minerals.toFixed(1)} ` +
          `Mém ${this.world.memory.toFixed(1)} Sp ${this.world.net.spores}\n` +
          `${season.def.id} ${(season.progress * 100).toFixed(0)}% ${this.world.weather.id} ` +
          `hum ${this.world.moisture.toFixed(2)}`,
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
      } else {
        const node = this.world.net.findNodeNear(p.worldX, p.worldY, 6);
        if (node) convertNode(this.world.net, node.id, this.tool);
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown && this.stroke.active && isThickness(this.tool)) {
        this.stroke.move(p.worldX, p.worldY, this.tool);
      }
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
