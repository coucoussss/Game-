/**
 * Palette limitée du jeu : bruns de terre, verts mousse, os du mycélium, et trois
 * couleurs bioluminescentes (turquoise, magenta, orange). Chaque lettre sert dans les
 * cartes de sprites ; « . » est transparent.
 */
export const PALETTE_CHARS: Readonly<Record<string, number>> = {
  k: 0x0e0b12, // encre
  x: 0x2a2428, // ombre
  d: 0x1f1714, // terre profonde
  b: 0x3b2a26, // écorce
  B: 0x5a3f30, // brun
  n: 0x7a5a40, // brun clair
  s: 0xa88a64, // sable
  w: 0xe8dcc0, // os, mycélium
  g: 0x2c4a3a, // mousse sombre
  m: 0x4a7a4a, // mousse
  l: 0x7fbf5f, // mousse claire
  t: 0x4fe0d0, // turquoise bioluminescent
  T: 0x1f8a8a, // turquoise sombre
  p: 0xff7ad8, // magenta bioluminescent
  P: 0xa04ac8, // violet
  o: 0xffb04a, // orange bioluminescent
  O: 0xd8602a, // braise
  r: 0x9a2a20, // rouge
  y: 0xf2c46d, // or
  c: 0x6a6670, // béton
  C: 0x9a96a0, // béton clair
  i: 0xdfe8f5, // glace
  I: 0x6fb3d8, // eau
};

/** Couleurs nommées, pour le code. */
export const COLORS = {
  ink: PALETTE_CHARS.k!,
  bone: PALETTE_CHARS.w!,
  turquoise: PALETTE_CHARS.t!,
  magenta: PALETTE_CHARS.p!,
  orange: PALETTE_CHARS.o!,
  gold: PALETTE_CHARS.y!,
  moss: PALETTE_CHARS.m!,
  violet: PALETTE_CHARS.P!,
  ember: PALETTE_CHARS.O!,
  water: PALETTE_CHARS.I!,
  ice: PALETTE_CHARS.i!,
} as const;
