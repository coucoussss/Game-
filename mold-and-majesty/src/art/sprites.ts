/**
 * Sprites en pixel art, décrits par des cartes de caractères (voir palette.ts).
 * Chaque sprite a une ou plusieurs images de même taille ; elles deviennent des
 * textures Phaser au démarrage (art/textures.ts).
 */
export interface SpriteDef {
  frames: string[][];
}

export const SPRITES: Readonly<Record<string, SpriteDef>> = {
  /** Le roi champignon, couronné. */
  king: {
    frames: [
      [
        '...y.y.y...',
        '...yyyyy...',
        '..ppppppp..',
        '.ppwpppwpp.',
        'pppppwppppp',
        'ppppppppppp',
        '.xxxxxxxxx.',
        '...wwwww...',
        '..wwkwkww..',
        '..wwwwwww..',
        '...wwwww...',
        '..wwwwwww..',
        '..ww...ww..',
        '..kk...kk..',
      ],
    ],
  },
  /** Habitant du royaume (deux pas de marche). */
  citizen: {
    frames: [
      ['..ttt..', '.ttwtt.', 'ttttttt', '.xxxxx.', '..www..', '.wkwkw.', '..www..', '..w.w..'],
      ['..ttt..', '.ttwtt.', 'ttttttt', '.xxxxx.', '..www..', '.wkwkw.', '..www..', '.w...w.'],
    ],
  },
  /** Habitant portant une spore. */
  carrier: {
    frames: [
      ['...o...', '..ttt..', '.ttwtt.', 'ttttttt', '.xxxxx.', '..www..', '.wkwkw.', '..www..', '..w.w..'],
      ['...o...', '..ttt..', '.ttwtt.', 'ttttttt', '.xxxxx.', '..www..', '.wkwkw.', '..www..', '.w...w.'],
    ],
  },
  /** Tour-champignon de l'ancien royaume. */
  tower: {
    frames: [
      [
        '...pppppp...',
        '.pppppppppp.',
        'ppwppppppwpp',
        'pppppwpppppp',
        '.xxxxxxxxxx.',
        '....wwww....',
        '....wwww....',
        '....wowo....',
        '....wwww....',
        '....wwww....',
        '....owow....',
        '....wwww....',
        '....wwww....',
        '....wowo....',
        '....wwww....',
        '...wwwwww...',
        '..wwwwwwww..',
      ],
    ],
  },
  /** Hutte-champignon. */
  hut: {
    frames: [
      ['..ttttt..', '.ttttttt.', 'ttwttttwt', 'ttttttttt', '.xxxxxxx.', '.wwwwwww.', '.wwokwww.', '.wwokwww.', '.wwwwwww.'],
    ],
  },
  /** Silhouette humaine, hache levée puis abattue. */
  human: {
    frames: [
      [
        '...xx...',
        '..xxxx..',
        '..xxxx..',
        '...xx..c',
        '.xxxxxxc',
        'x.xxxx.s',
        'x.xxxx..',
        'x.xxxx..',
        '..xxxx..',
        '..xxxx..',
        '..x..x..',
        '..x..x..',
        '..x..x..',
        '.xx..xx.',
      ],
      [
        '...xx...',
        '..xxxx..',
        '..xxxx..',
        '...xx...',
        '.xxxxxx.',
        'x.xxxx.x',
        'x.xxxx.s',
        'x.xxxx.s',
        '..xxxx.c',
        '..xxxx.c',
        '..x..x..',
        '..x..x..',
        '..x..x..',
        '.xx..xx.',
      ],
    ],
  },
  /** Moisissure rivale qui rampe. */
  mold: {
    frames: [
      ['..ll....', '.lmmll..', 'lmmgmmll', 'mgmmmgmm', '.mmmmmm.'],
      ['...ll...', '.llmmll.', 'lmmmgmml', 'mmgmmmgm', '.mmmmmm.'],
    ],
  },
  /** Flamme. */
  flame: {
    frames: [
      ['..y..', '.yoy.', '.ooO.', 'oOOOo', 'OOrOO', '.OrO.', '..r..'],
      ['.y...', '.oy..', '.oOo.', 'oOOOo', 'OOrOO', '.OrO.', '..r..'],
    ],
  },
  /** Cristal de glace. */
  crystal: {
    frames: [['..i..', '.iIi.', '.iIi.', 'iiIii', '.iIi.', '.iIi.', '..i..']],
  },
  /** La dernière graine, lumineuse. */
  seed: {
    frames: [
      ['.yoy.', 'yooOy', 'ooyoo', 'yOooy', '.yoy.'],
      ['..o..', '.yoy.', 'oyyyo', '.yoy.', '..o..'],
    ],
  },
  /** Bloc de béton. */
  concrete: {
    frames: [['CCCCCCCCCCCC', 'CccccccccccC', 'ccxcccccxccc', 'cccccccccccc', 'ccccccxccccc', 'xxxxxxxxxxxx']],
  },
  /** Arbre (il peut tomber : pivot à sa base). */
  tree: {
    frames: [
      [
        '.....lmml......',
        '...lmmmlmmm....',
        '..mmlmmmmmlm...',
        '.mmmmmgmmmmmm..',
        'mlmmmmmmmgmmml.',
        'mmmgmmmlmmmmmm.',
        '.mmmmmmmmmmgmm.',
        '..mmgmmmmmmmm..',
        '...mmmmbmmmm...',
        '......bb.......',
        '......bb.......',
        '......bbb......',
        '......bb.......',
        '......bb.......',
        '.....bbbb......',
        '....bb..bb.....',
      ],
    ],
  },
  // ─── Réseau ──────────────────────────────────────────────────────────────
  /** Cœur du réseau (deux temps de battement). */
  heart: {
    frames: [
      ['.y...y.', 'yoy.yoy', 'yoyyyoy', '.yoooy.', '..yoy..', '...y...'],
      ['.......', '.y...y.', '.oyyyo.', '..yoy..', '...y...', '.......'],
    ],
  },
  storage: { frames: [['.nnn.', 'nsnsn', 'nnnnn', 'nsnnn', '.nnn.']] },
  relay: { frames: [['..P..', '.PpP.', 'PpwpP', '.PpP.', '..P..']] },
  hive: { frames: [['.ppp.', 'ppwpp', 'ppppp', '.pPp.', '..P..']] },
  /** Gisement de minéraux : petit, moyen, grand. */
  mineral: {
    frames: [
      ['.....', '.....', '..t..', '.tT..', '.TT..'],
      ['.....', '..t..', '.tTt.', '.TtT.', '.TTT.'],
      ['.t.t.', '.ttt.', 'tTtTt', 'TtTtT', '.TTT.'],
    ],
  },
  // ─── Icônes de la barre d'outils (7×7) ───────────────────────────────────
  'icon-thin': { frames: [['......w', '.....w.', '....w..', '...w...', '..w....', '.w.....', 'w......']] },
  'icon-medium': { frames: [['.....ww', '....www', '...www.', '..www..', '.www...', 'www....', 'ww.....']] },
  'icon-thick': { frames: [['....www', '...wwww', '..wwwww', '.wwwww.', 'wwwww..', 'wwww...', 'www....']] },
  'icon-storage': { frames: [['.......', '..nnn..', '.nsnsn.', '.nnnnn.', '.nsnnn.', '..nnn..', '.......']] },
  'icon-relay': { frames: [['...P...', '...P...', '..PpP..', 'PPpwpPP', '..PpP..', '...P...', '...P...']] },
  'icon-hive': { frames: [['.ppppp.', 'ppwpppp', 'ppppwpp', '.xxxxx.', '...w...', '...w...', '..www..']] },
  'icon-cut': { frames: [['w.....w', '.w...w.', '..w.w..', '...w...', '.CC.CC.', 'C..C..C', '.CC.CC.']] },
  'icon-view': { frames: [['.......', '..www..', '.w.t.w.', 'w.ttt.w', '.w.t.w.', '..www..', '.......']] },
  'icon-speed': { frames: [['.......', 'w..w...', '.w..w..', '..w..w.', '.w..w..', 'w..w...', '.......']] },
  /** Spore isolée. */
  spore: {
    frames: [['t'], ['p']],
  },
  /** Fourmi (deux pas). */
  ant: {
    frames: [
      ['.kk.k', 'k.k.k'],
      ['.kk.k', '.k.k.'],
    ],
  },
  /** Scarabée. */
  beetle: {
    frames: [['.Tw.', 'TTTk', '.x.x'], ['.Tw.', 'TTTk', 'x.x.']],
  },
};

/** Taille (largeur, hauteur) d'un sprite. */
export function spriteSize(def: SpriteDef): { w: number; h: number } {
  return { w: def.frames[0]![0]!.length, h: def.frames[0]!.length };
}
