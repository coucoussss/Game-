import Phaser from 'phaser';
import { GROUND_Y, NATIVE_HEIGHT, NATIVE_WIDTH, TICK_MS, TILE } from '../config';
import { gameData } from '../data';
import type { ForestDef, NodeKind, ThicknessId } from '../data/types';
import { Network } from '../entities/Network';
import { FixedStep } from '../systems/FixedStep';
import { stepNetwork } from '../systems/FlowSystem';
import { StrokeBuilder, convertNode } from '../systems/NetworkBuilder';
import { PALETTE, TEXT_STYLE } from '../ui/text';
import { TOOLBAR_Y, Toolbar } from '../ui/Toolbar';
import { type FluxOverlay, NetworkView } from './NetworkView';

const COLORS = {
  sky: 0x1d1a2f,
  trunk: 0x3b2a26,
  canopy: 0x2c4a3a,
  surface: 0x4a3b2a,
  humus: 0x33261d,
  deep: 0x1f1714,
};

type ToolId = ThicknessId | Exclude<NodeKind, 'heart' | 'junction'> | 'overlay';

const TOOL_HINTS: Record<ToolId, string> = {
  thin: 'Fin : pousse vite, peu cher, fragile',
  medium: 'Moyen : compromis',
  thick: 'Épais : lent et cher, gros débit, résistant',
  storage: 'Réserve : touche une jonction (grand stock)',
  relay: 'Relais : touche une jonction (réémet le signal)',
  fruiting: 'Ruche : touche une jonction (spores)',
  overlay: 'Vue des flux',
};

const OVERLAYS: readonly FluxOverlay[] = [null, 'sugar', 'water', 'signal'];
const OVERLAY_NAMES = { sugar: 'sucre', water: 'eau', signal: 'signal' } as const;

/** Vue en coupe de la forêt et réseau de mycélium jouable. */
export class GameScene extends Phaser.Scene {
  private net!: Network;
  private view!: NetworkView;
  private stroke!: StrokeBuilder;
  private hud!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private readonly clock = new FixedStep(TICK_MS);
  private tool: ToolId = 'thin';
  private overlay: FluxOverlay = null;

  constructor() {
    super('Game');
  }

  create(): void {
    const forest = gameData.forests.get('whispering-grove');
    if (!forest) throw new Error('Forêt de départ introuvable');
    const defs = gameData.network;
    this.drawCrossSection(forest);

    this.net = new Network();
    const heartY = GROUND_Y + forest.layers.surface * TILE + 16;
    this.net.addNode('heart', NATIVE_WIDTH / 2, heartY, {
      sugar: forest.startingResources.sugar,
      water: forest.startingResources.water,
    });
    this.view = new NetworkView(this, this.net, defs);
    this.stroke = new StrokeBuilder(this.net, {
      grid: 4,
      step: 10,
      snapRadius: 6,
      bounds: { minX: 4, maxX: NATIVE_WIDTH - 4, minY: GROUND_Y + 4, maxY: TOOLBAR_Y - 6 },
    });

    this.hud = this.add.text(4, 3, '', TEXT_STYLE).setResolution(1).setDepth(10);
    this.hint = this.add.text(4, TOOLBAR_Y - 10, '', TEXT_STYLE).setResolution(1).setDepth(10).setAlpha(0.8);

    new Toolbar<ToolId>(
      this,
      [
        { id: 'thin', label: 'Fin', key: 'ONE' },
        { id: 'medium', label: 'Moyen', key: 'TWO' },
        { id: 'thick', label: 'Épais', key: 'THREE' },
        { id: 'storage', label: 'Stock', key: 'FOUR' },
        { id: 'relay', label: 'Relais', key: 'FIVE' },
        { id: 'fruiting', label: 'Ruche', key: 'SIX' },
        { id: 'overlay', label: 'Vue', key: 'SEVEN', action: true },
      ],
      this.tool,
      (id) => this.selectTool(id),
    );
    this.updateHint();
    this.setupPointer();
  }

  override update(_time: number, delta: number): void {
    const steps = this.clock.advance(delta);
    for (let i = 0; i < steps; i++) stepNetwork(this.net, gameData.network);
    this.view.draw(this.overlay);
    const t = this.net.totals();
    this.hud.setText(
      `Sucre ${Math.floor(t.sugar)}  Eau ${Math.floor(t.water)}  Spores ${this.net.spores}`,
    );
  }

  private selectTool(id: ToolId): void {
    if (id === 'overlay') {
      // Le bouton « Vue » fait défiler les calques sans changer d'outil.
      this.overlay = OVERLAYS[(OVERLAYS.indexOf(this.overlay) + 1) % OVERLAYS.length] ?? null;
    } else {
      this.tool = id;
    }
    this.updateHint();
  }

  private updateHint(): void {
    const overlay = this.overlay ? `  [vue : ${OVERLAY_NAMES[this.overlay]}]` : '';
    this.hint.setText(TOOL_HINTS[this.tool] + overlay);
  }

  private setupPointer(): void {
    const isThickness = (t: ToolId): t is ThicknessId => t === 'thin' || t === 'medium' || t === 'thick';

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return; // clic sur la barre d'outils
      if (isThickness(this.tool)) {
        this.stroke.begin(p.worldX, p.worldY);
      } else if (this.tool !== 'overlay') {
        const node = this.net.findNodeNear(p.worldX, p.worldY, 6);
        if (node) convertNode(this.net, node.id, this.tool);
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

  private drawCrossSection(forest: ForestDef): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.sky).fillRect(0, 0, NATIVE_WIDTH, GROUND_Y);

    for (let x = 24; x < NATIVE_WIDTH; x += 72) {
      g.fillStyle(COLORS.trunk).fillRect(x, GROUND_Y - 40, 6, 40);
      g.fillStyle(COLORS.canopy).fillRect(x - 12, GROUND_Y - 60, 30, 24);
    }

    let y = GROUND_Y;
    const bands: [number, number][] = [
      [forest.layers.surface, COLORS.surface],
      [forest.layers.humus, COLORS.humus],
      [forest.layers.deep, COLORS.deep],
    ];
    for (const [tiles, color] of bands) {
      const h = Math.min(tiles * TILE, NATIVE_HEIGHT - y);
      g.fillStyle(color).fillRect(0, y, NATIVE_WIDTH, h);
      y += h;
    }
    g.fillStyle(PALETTE.ink).fillRect(0, TOOLBAR_Y, NATIVE_WIDTH, NATIVE_HEIGHT - TOOLBAR_Y);
  }
}
