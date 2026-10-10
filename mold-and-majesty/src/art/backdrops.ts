import type Phaser from 'phaser';
import { Random } from '../systems/Random';
import type { BackdropDef } from '../systems/Sequence';
import { hexToInt, lerpColor, shade } from '../ui/color';
import { COLORS, PALETTE_CHARS } from './palette';

const W = 384;
const H = 216;
const MOSS = [PALETTE_CHARS.g!, PALETTE_CHARS.m!, PALETTE_CHARS.l!];
const BARK = PALETTE_CHARS.b!;

/**
 * Décors des souvenirs, dessinés par code à partir d'une description JSON
 * (ciel, sol, éléments). Une même graine donne toujours le même dessin.
 */
export function drawBackdrop(g: Phaser.GameObjects.Graphics, def: BackdropDef, seed = 7): void {
  const rng = new Random(seed);
  const sky = hexToInt(def.sky);
  const soil = hexToInt(def.soil);
  const sy = def.surfaceY;
  const has = (f: string) => def.features.includes(f);

  if (has('cave')) {
    drawCave(g, sky, soil, sy, rng);
    return;
  }
  // Ciel en bandes, plus clair vers l'horizon, et quelques étoiles.
  for (let i = 0; i < 6; i++) {
    g.fillStyle(lerpColor(sky, 0x8a7aa0, i * 0.04)).fillRect(0, Math.round((sy * i) / 6), W, Math.ceil(sy / 6) + 1);
  }
  for (let i = 0; i < 30; i++) g.fillStyle(0xe8dcc0, 0.3 + rng.next() * 0.5).fillRect(rng.int(0, W), rng.int(0, sy - 20), 1, 1);
  // Sol en trois couches.
  g.fillStyle(shade(soil, 1.25)).fillRect(0, sy, W, 30);
  g.fillStyle(soil).fillRect(0, sy + 30, W, 70);
  g.fillStyle(shade(soil, 0.7)).fillRect(0, sy + 100, W, H - sy - 100);
  for (let i = 0; i < 120; i++) g.fillStyle(shade(soil, 0.6 + rng.next() * 0.8), 0.6).fillRect(rng.int(0, W), rng.int(sy + 2, H), 1, 1);

  if (has('galleries')) drawGalleries(g, soil, rng);
  if (has('threads')) drawThreads(g, rng);
  if (has('oak')) drawOak(g, 192, sy, rng, false);
  if (has('oak-bare')) drawOak(g, 192, sy, rng, true);
  if (has('mother-tree')) drawMotherTree(g, sy, rng);
  if (has('reeds')) {
    for (let x = 4; x < W; x += rng.int(3, 9)) {
      const h = rng.int(6, 16);
      g.fillStyle(rng.next() < 0.5 ? PALETTE_CHARS.m! : PALETTE_CHARS.n!).fillRect(x, sy - h, 1, h);
      if (rng.next() < 0.3) g.fillStyle(PALETTE_CHARS.B!).fillRect(x, sy - h - 2, 1, 3);
    }
  }
  if (has('vines')) {
    for (let x = 6; x < W; x += rng.int(10, 24)) {
      const len = rng.int(15, 60);
      for (let y = 0; y < len; y++) g.fillStyle(MOSS[(x + y) % 3]!).fillRect(x + Math.round(Math.sin(y / 5) * 2), y, 1, 1);
      g.fillStyle(PALETTE_CHARS.l!).fillRect(x - 2, len, 5, 2);
    }
    for (let i = 0; i < 12; i++) {
      const x = rng.int(0, W);
      g.fillStyle(MOSS[i % 3]!).fillEllipse(x, sy - 2, rng.int(10, 20), rng.int(5, 9));
    }
  }
  if (has('stumps')) {
    for (const x of [40, 120, 200, 260, 330]) {
      g.fillStyle(BARK).fillRect(x, sy - 6, 9, 6);
      g.fillStyle(PALETTE_CHARS.s!).fillRect(x + 1, sy - 7, 7, 1);
    }
  }
  if (has('snow')) {
    g.fillStyle(COLORS.ice).fillRect(0, sy - 2, W, 3);
    for (let x = 0; x < W; x += rng.int(4, 12)) g.fillStyle(COLORS.ice).fillRect(x, sy - 3, rng.int(2, 6), 1);
  }
}

function drawGalleries(g: Phaser.GameObjects.Graphics, soil: number, rng: Random): void {
  // Salles creusées, au sol lumineux : l'ancienne cité.
  for (const [x, y, w, h] of [
    [90, 148, 90, 34],
    [192, 162, 120, 34],
    [300, 148, 90, 34],
    [140, 110, 60, 20],
    [252, 112, 60, 20],
  ] as const) {
    g.fillStyle(shade(soil, 0.45)).fillEllipse(x, y, w, h);
    g.fillStyle(COLORS.turquoise, 0.15).fillEllipse(x, y + h / 2 - 4, w * 0.8, 6);
    for (let i = 0; i < 6; i++) g.fillStyle(COLORS.turquoise, 0.6).fillRect(x - w / 3 + rng.int(0, Math.round((w * 2) / 3)), y + h / 2 - 3, 1, 1);
  }
}

function drawThreads(g: Phaser.GameObjects.Graphics, rng: Random): void {
  const hubs: [number, number][] = [
    [90, 160],
    [192, 176],
    [300, 160],
    [140, 116],
    [252, 118],
    [192, 96],
  ];
  for (let i = 0; i < hubs.length; i++) {
    for (let j = i + 1; j < hubs.length; j++) {
      if (rng.next() < 0.45) continue;
      const [x1, y1] = hubs[i]!;
      const [x2, y2] = hubs[j]!;
      g.lineStyle(1, rng.next() < 0.5 ? COLORS.turquoise : COLORS.magenta, 0.35);
      g.lineBetween(x1, y1, (x1 + x2) / 2 + rng.int(-6, 6), (y1 + y2) / 2 + rng.int(-6, 6));
      g.lineBetween((x1 + x2) / 2, (y1 + y2) / 2, x2, y2);
    }
  }
}

function drawOak(g: Phaser.GameObjects.Graphics, x: number, sy: number, rng: Random, bare: boolean): void {
  g.fillStyle(BARK).fillRect(x - 5, sy - 56, 10, 56);
  g.fillStyle(shade(BARK, 0.7)).fillRect(x + 3, sy - 56, 2, 56);
  // Racines.
  g.lineStyle(1, shade(BARK, 1.2), 0.7);
  for (let i = 0; i < 5; i++) {
    let rx = x;
    let ry = sy;
    for (let s = 0; s < 4; s++) {
      const nx = rx + rng.int(-14, 14);
      const ny = ry + rng.int(4, 10);
      g.lineBetween(rx, ry, nx, ny);
      rx = nx;
      ry = ny;
    }
  }
  if (bare) {
    g.lineStyle(1, BARK);
    for (const [dx, dy] of [
      [-22, -20],
      [20, -24],
      [-14, -34],
      [16, -36],
    ] as const) {
      g.lineBetween(x, sy - 50, x + dx, sy - 50 + dy);
      g.fillStyle(COLORS.ice).fillRect(x + dx - 1, sy - 51 + dy, 3, 1);
    }
    return;
  }
  for (let i = 0; i < 900; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next());
    g.fillStyle(MOSS[rng.int(0, 2)]!).fillRect(Math.round(x + Math.cos(a) * r * 36), Math.round(sy - 62 + Math.sin(a) * r * 22), 1, 1);
  }
}

function drawMotherTree(g: Phaser.GameObjects.Graphics, sy: number, rng: Random): void {
  const x = 192;
  // Racines immenses, veinées de lumière.
  for (let i = 0; i < 9; i++) {
    let rx = x + rng.int(-14, 14);
    let ry = sy;
    for (let s = 0; s < 7; s++) {
      const nx = rx + rng.int(-24, 24);
      const ny = ry + rng.int(6, 16);
      g.lineStyle(4 - Math.min(3, s / 2), BARK).lineBetween(rx, ry, nx, ny);
      if (rng.next() < 0.5) g.lineStyle(1, COLORS.gold, 0.4).lineBetween(rx, ry, nx, ny);
      rx = nx;
      ry = ny;
    }
  }
  g.fillStyle(BARK).fillRect(x - 20, 0, 40, sy);
  g.fillStyle(shade(BARK, 0.7)).fillRect(x + 12, 0, 8, sy);
  for (let y = 4; y < sy; y += 7) g.fillStyle(shade(BARK, 1.3)).fillRect(x - 16 + ((y * 7) % 20), y, 3, 1);
  g.fillStyle(COLORS.gold, 0.15).fillEllipse(x, sy + 30, 120, 60);
  for (let i = 0; i < 700; i++) {
    g.fillStyle(MOSS[rng.int(0, 2)]!).fillRect(rng.int(0, W), rng.int(0, 22), 1, 1);
  }
}

function drawCave(g: Phaser.GameObjects.Graphics, sky: number, soil: number, sy: number, rng: Random): void {
  g.fillStyle(sky).fillRect(0, 0, W, H);
  // Voûte et stalactites.
  g.fillStyle(shade(soil, 1.3)).fillRect(0, 0, W, 18);
  for (let x = 0; x < W; x += rng.int(5, 11)) {
    const h = rng.int(6, 30);
    g.fillStyle(shade(soil, 1.1 + rng.next() * 0.3)).fillRect(x, 18, 4, h).fillRect(x + 1, 18 + h, 2, 4);
  }
  // Sol de la galerie et, au loin, la bouche de la caverne.
  g.fillStyle(shade(soil, 1.2)).fillRect(0, 178, W, H - 178);
  g.fillStyle(0x3a4a6a, 0.5).fillEllipse(W + 10, 150, 90, 70);
  g.fillStyle(0x6a7aa0, 0.3).fillEllipse(W + 10, 150, 50, 40);
  for (let i = 0; i < 40; i++) g.fillStyle(COLORS.turquoise, 0.2 + rng.next() * 0.4).fillRect(rng.int(0, W), rng.int(150, 210), 1, 1);
  void sy;
}
