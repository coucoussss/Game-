import type Phaser from 'phaser';

/** Style de texte commun, en attendant une police bitmap (étape HUD). */
export const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'monospace',
  fontSize: '8px',
  color: '#e8dcc0',
};

export const PALETTE = {
  ink: 0x0e0b12,
  mycelium: 0xe8dcc0,
  withered: 0x5a4e44,
  panel: 0x241c22,
  panelActive: 0x5b4636,
  sugar: 0xf2c46d,
  water: 0x6fb3d8,
  minerals: 0x9fd6c2,
  signal: 0xc58fe0,
} as const;
