import type Phaser from 'phaser';

/** Police pixel du jeu (Tiny5, licence OFL), conçue pour une hauteur de 5 pixels. */
export const PIXEL_FONT = '"Tiny5"';

/** Style de texte commun. */
export const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: `${PIXEL_FONT}, monospace`,
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
