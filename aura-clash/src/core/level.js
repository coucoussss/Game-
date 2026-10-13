// Niveau de joueur : de l'expérience (XP) gagnée dans tous les modes à la fin de chaque combat.
// Logique pure, testée dans scripts/test-sim.mjs.

export const MAX_LEVEL = 100;
/** XP gagnée à la fin d'un combat, selon le résultat (et quelques bonus de mode). */
export const XP = { win: 100, draw: 60, loss: 40, story: 50, ranked: 20, perWave: 10 };

/** XP nécessaire pour passer du niveau n au niveau n + 1. */
export function xpToNext(n) {
  return 200 + 60 * (n - 1);
}

/** Niveau atteint avec une quantité d'XP : { level, cur (XP dans le niveau), need, max }. */
export function levelFromXp(xp) {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp || 0));
  while (level < MAX_LEVEL && rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level += 1;
  }
  const max = level >= MAX_LEVEL;
  return { level, cur: max ? 0 : rest, need: max ? 0 : xpToNext(level), max };
}

/** Mode de jeu d'un combat (pour les statistiques du profil). */
export function modeOf(cfg) {
  if (cfg.ranked) return 'ranked';
  if (cfg.story) return 'story';
  if (cfg.waveLevel) return 'waves';
  if (cfg.endless) return 'endless';
  return 'free';
}

/** XP d'un combat terminé. result : 'win' | 'loss' | 'draw' ; waves : vagues repoussées. */
export function xpFor(mode, result, waves = 0) {
  let xp = XP[result] || 0;
  if (mode === 'story' && result === 'win') xp += XP.story;
  if (mode === 'ranked') xp += XP.ranked;
  if (mode === 'waves' || mode === 'endless') xp += XP.perWave * Math.max(0, waves);
  return xp;
}
