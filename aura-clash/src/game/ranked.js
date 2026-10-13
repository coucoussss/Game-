// Mode Classé : une échelle de rangs contre l'IA, entièrement hors ligne.
// 7 rangs (Bronze → Légende de l'Aura), 3 divisions par rang (III → II → I) sauf Légende,
// 100 Points d'Aura par division, combat de promotion pour passer au rang suivant.
// Logique pure (sans affichage) : testée dans scripts/test-sim.mjs.

export const RANKS = [
  { id: 'bronze', name: 'Bronze', icon: '🥉', color: '#d08a4a', reward: 0 },
  { id: 'argent', name: 'Argent', icon: '🥈', color: '#c8d4e0', reward: 300 },
  { id: 'or', name: 'Or', icon: '🥇', color: '#ffd23f', reward: 500 },
  { id: 'platine', name: 'Platine', icon: '💎', color: '#7fffe0', reward: 700 },
  { id: 'diamant', name: 'Diamant', icon: '🔷', color: '#6ab8ff', reward: 1000 },
  { id: 'maitre', name: 'Maître', icon: '🔥', color: '#ff6a3a', reward: 1500 },
  { id: 'legende', name: 'Légende de l’Aura', icon: '⚡', color: '#ff8ad8', reward: 3000 },
];
export const LEGEND = RANKS.length - 1;
export const DIVISIONS = ['III', 'II', 'I'];
export const DIV_POINTS = 100;

export const POINTS = {
  win: 20, loss: -15,
  perfect: 5, ultFinish: 3, parries: 2, combo: 2,
  streak3: 5, streak5: 10,
  promoFailBack: 75, // points retrouvés après une promotion ratée
};
export const DAILY_RYO = 100;

/** Titres gagnés en atteignant un rang (clé : rang). */
export const RANK_TITLES = { 1: 'Combattant', 3: 'Maître d’armes', 5: 'Sensei', 6: 'Légende de l’Aura' };
/**
 * Auras exclusives gagnées en atteignant un rang : couleur, style de flamme (voir render/aura.js)
 * et, pour l'arc-en-ciel, une couleur qui change sans cesse.
 */
export const RANK_AURAS = [
  { id: 'or', tier: 2, name: 'Aura dorée', color: '#ffd23f', alt: '#fff2a0', style: 'flame' },
  { id: 'cristal', tier: 4, name: 'Aura de cristal', color: '#8ae8ff', alt: '#e0fbff', style: 'frost' },
  { id: 'flammes-noires', tier: 5, name: 'Flammes noires', color: '#a0102e', alt: '#ff2a4a', style: 'abyss' },
  { id: 'arc-en-ciel', tier: 6, name: 'Aura arc-en-ciel', color: '#ff5ad8', alt: '#ffffff', style: 'storm', rainbow: true },
];
export const RANK_AURA_BY_ID = Object.fromEntries(RANK_AURAS.map((a) => [a.id, a]));

/** Rang le plus haut jamais atteint (0 = Bronze … 6 = Légende). */
export function bestTier(s) {
  return Math.min(LEGEND, Math.floor((s.best || 0) / 3));
}

export function unlockedTitles(s) {
  return Object.keys(RANK_TITLES).map(Number).filter((t) => bestTier(s) >= t);
}

export function unlockedAuras(s) {
  return RANK_AURAS.filter((a) => bestTier(s) >= a.tier);
}

/** Titre équipé (texte) ou chaîne vide. */
export function titleOf(s) {
  return s.title && unlockedTitles(s).includes(s.title) ? RANK_TITLES[s.title] : '';
}

/** Aura équipée (identifiant) si elle est bien débloquée, sinon null. */
export function auraOf(s) {
  return s.aura && unlockedAuras(s).some((a) => a.id === s.aura) ? s.aura : null;
}

/** Applique une aura de rang à la fiche d'un combattant (couleur et style de flamme). */
export function withRankAura(def, auraId) {
  const a = RANK_AURA_BY_ID[auraId];
  if (!a) return def;
  return { ...def, aura: a.color, auraAlt: a.alt, auraStyle: a.style, rankAura: a.id, rainbow: !!a.rainbow };
}
/** Gains en Ryō d'un combat classé (en plus des points). */
export const RANKED_RYO = { win: 250, loss: 100, draw: 150 };

/** État de départ. */
export function newRankedState() {
  return {
    tier: 0, div: 0, pts: 0, promo: false, streak: 0, bestStreak: 0, best: 0, wins: 0, losses: 0, lastDaily: '', legendPts: 0, title: 0, aura: '',
    history: [], chars: {}, tot: { matches: 0, dmg: 0, parries: 0 }, rec: { combo: 0, dmg: 0 }, curve: [], bestTop: 100,
  };
}

/** Remet un état sauvegardé dans les bornes (sauvegarde ancienne ou modifiée à la main). */
export function sanitizeRanked(s) {
  const d = newRankedState();
  if (!s || typeof s !== 'object') return d;
  const int = (v, lo, hi, def) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : def);
  d.tier = int(s.tier, 0, LEGEND, 0);
  d.div = d.tier === LEGEND ? 0 : int(s.div, 0, 2, 0);
  d.pts = int(s.pts, 0, DIV_POINTS, 0);
  d.promo = d.tier < LEGEND && d.div === 2 && !!s.promo;
  if (d.promo) d.pts = DIV_POINTS;
  d.streak = int(s.streak, 0, 1e6, 0);
  d.bestStreak = Math.max(d.streak, int(s.bestStreak, 0, 1e6, 0));
  d.wins = int(s.wins, 0, 1e9, 0);
  d.losses = int(s.losses, 0, 1e9, 0);
  d.legendPts = int(s.legendPts, 0, 1e9, 0);
  d.lastDaily = typeof s.lastDaily === 'string' ? s.lastDaily.slice(0, 10) : '';
  d.best = Math.max(stepOf(d), int(s.best, 0, LEGEND * 3, 0));
  d.title = Number.isInteger(s.title) && RANK_TITLES[s.title] ? s.title : 0;
  d.aura = typeof s.aura === 'string' && RANK_AURA_BY_ID[s.aura] ? s.aura : '';
  // Statistiques (étape 3)
  const str = (v, n = 24) => (typeof v === 'string' ? v.slice(0, n) : '');
  if (Array.isArray(s.history)) {
    d.history = s.history.filter((h) => h && typeof h === 'object').slice(-HISTORY_MAX).map((h) => ({
      d: str(h.d, 10), r: ['win', 'loss', 'draw'].includes(h.r) ? h.r : 'loss', c: str(h.c), o: str(h.o), delta: int(h.delta, -1000, 1000, 0), step: int(h.step, 0, LEGEND * 3, 0),
    }));
  }
  if (s.chars && typeof s.chars === 'object') {
    for (const [id, v] of Object.entries(s.chars)) if (v && typeof v === 'object') d.chars[str(id)] = { w: int(v.w, 0, 1e9, 0), l: int(v.l, 0, 1e9, 0) };
  }
  if (s.tot && typeof s.tot === 'object') d.tot = { matches: int(s.tot.matches, 0, 1e9, 0), dmg: int(s.tot.dmg, 0, 1e12, 0), parries: int(s.tot.parries, 0, 1e9, 0) };
  if (s.rec && typeof s.rec === 'object') d.rec = { combo: int(s.rec.combo, 0, 1e6, 0), dmg: int(s.rec.dmg, 0, 1e9, 0) };
  if (Array.isArray(s.curve)) d.curve = s.curve.filter((c) => c && Number.isFinite(c.top)).slice(-CURVE_MAX).map((c) => ({ d: str(c.d, 10), top: Math.max(0.001, Math.min(100, c.top)) }));
  d.bestTop = Number.isFinite(s.bestTop) ? Math.max(0.001, Math.min(100, s.bestTop)) : 100;
  d.bestTop = Math.min(d.bestTop, estimate(d).top);
  return d;
}

/** Palier global (0 = Bronze III … 18 = Légende), pour comparer deux rangs. */
export function stepOf(s) {
  return s.tier === LEGEND ? LEGEND * 3 : s.tier * 3 + s.div;
}

/** Nom lisible d'un palier (« Or II », « Légende de l’Aura »). */
export function stepName(step) {
  const tier = Math.min(LEGEND, Math.floor(step / 3));
  return tier === LEGEND ? RANKS[LEGEND].name : `${RANKS[tier].name} ${DIVISIONS[step % 3]}`;
}

export function rankName(s) {
  return stepName(stepOf(s));
}

/** Date du jour (AAAA-MM-JJ, heure locale) pour le bonus quotidien. */
export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dailyAvailable(s, day = today()) {
  return s.lastDaily !== day;
}

/**
 * Adversaire du prochain combat : niveau de l'IA et multiplicateurs, selon le rang.
 * Les combats de promotion opposent l'IA du rang visé (et un boss pour les deux derniers rangs).
 */
const OPPONENTS = [
  { level: 'easy', mods: { hp: 0.9, dmg: 0.85 } },
  { level: 'normal', mods: { hp: 0.9, dmg: 0.88 } },
  { level: 'normal', mods: { hp: 1.05, dmg: 1.02 } },
  { level: 'hard', mods: { hp: 0.9, dmg: 0.9 } },
  { level: 'hard', mods: { hp: 1, dmg: 1 } },
  { level: 'hard', mods: { hp: 1.1, dmg: 1.08, energy: 1.1 } },
  { level: 'hard', mods: { hp: 1.2, dmg: 1.15, energy: 1.2 } },
];
/** Boss des promotions vers Maître et vers Légende (vie réduite : combat en deux manches). */
export const PROMO_BOSSES = { 5: 'shogun-oni', 6: 'roi-fleau' };
export const PROMO_BOSS_MODS = { hp: 0.55, dmg: 0.8 };

export function opponentFor(s) {
  const target = s.promo ? Math.min(LEGEND, s.tier + 1) : s.tier;
  const o = OPPONENTS[target];
  const mods = { dmg: 1, hp: 1, speed: 1, energy: 1, cd: 1, ...o.mods };
  const boss = s.promo ? PROMO_BOSSES[target] || null : null;
  if (boss) Object.assign(mods, PROMO_BOSS_MODS);
  return { level: o.level, mods, boss, target };
}

/**
 * Applique le résultat d'un combat classé.
 * res : { result: 'win' | 'loss' | 'draw', perfect, ultFinish, parries, maxCombo }
 * Renvoie { state, delta, lines: [[libellé, points]], event, daily, ryo }
 *   event : 'promoted' | 'promoStart' | 'promoFailed' | 'divUp' | null
 */
export function applyResult(prev, res, day = today()) {
  const s = { ...prev };
  const lines = [];
  let delta = 0;
  let event = null;
  let daily = false;
  let ryo = RANKED_RYO[res.result] || 0;

  if (res.result === 'draw') {
    return { state: s, delta: 0, lines: [['Match nul', 0]], event: null, daily: false, ryo };
  }

  if (res.result === 'win') {
    s.wins += 1;
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    lines.push(['Victoire', POINTS.win]);
    if (res.perfect) lines.push(['Manche parfaite', POINTS.perfect]);
    if (res.ultFinish) lines.push(['Finish à l’ultime', POINTS.ultFinish]);
    if (res.parries >= 3) lines.push(['Parades parfaites', POINTS.parries]);
    if (res.maxCombo >= 10) lines.push(['Combo de 10 coups', POINTS.combo]);
    if (s.streak >= 5) lines.push([`Série de ${s.streak} victoires`, POINTS.streak5]);
    else if (s.streak >= 3) lines.push([`Série de ${s.streak} victoires`, POINTS.streak3]);
    delta = lines.reduce((n, l) => n + l[1], 0);
    if (dailyAvailable(s, day)) {
      daily = true;
      s.lastDaily = day;
      lines.push(['Bonus du jour ×2', delta]);
      delta *= 2;
      ryo += DAILY_RYO;
    }
  } else {
    s.losses += 1;
    s.streak = 0;
  }

  // Légende : un score en points sans limite
  if (s.tier === LEGEND) {
    if (res.result === 'loss') { delta = -Math.min(s.legendPts, -POINTS.loss); lines.push(['Défaite', delta]); }
    s.legendPts += delta;
    return { state: s, delta, lines, event, daily, ryo };
  }

  // Combat de promotion
  if (s.promo) {
    if (res.result === 'win') {
      s.tier += 1;
      s.div = 0;
      s.pts = 0;
      s.promo = false;
      event = 'promoted';
      ryo += RANKS[s.tier].reward;
      // Les récompenses du nouveau rang sont équipées d'office
      if (RANK_TITLES[s.tier]) s.title = s.tier;
      const newAura = RANK_AURAS.find((a) => a.tier === s.tier);
      if (newAura) s.aura = newAura.id;
      if (s.tier === LEGEND) s.legendPts = 0;
    } else {
      s.promo = false;
      s.pts = POINTS.promoFailBack;
      delta = POINTS.promoFailBack - DIV_POINTS;
      lines.push(['Promotion ratée', delta]);
      event = 'promoFailed';
    }
    s.best = Math.max(s.best, stepOf(s));
    return { state: s, delta, lines, event, daily, ryo };
  }

  if (res.result === 'loss') {
    // On ne descend jamais de division : les points s'arrêtent à 0
    delta = -Math.min(s.pts, -POINTS.loss);
    lines.push(['Défaite', delta]);
    s.pts += delta;
    return { state: s, delta, lines, event, daily, ryo };
  }

  s.pts += delta;
  while (s.pts >= DIV_POINTS && !s.promo) {
    if (s.div < 2) {
      s.div += 1;
      s.pts -= DIV_POINTS;
      event = 'divUp';
    } else {
      // Division I pleine : le prochain combat est un combat de promotion
      s.pts = DIV_POINTS;
      s.promo = true;
      event = 'promoStart';
    }
  }
  s.best = Math.max(s.best, stepOf(s));
  return { state: s, delta, lines, event, daily, ryo };
}


// --- Classement mondial estimé et statistiques (étape 3) -----------------------------------

/**
 * Le jeu n'a pas de serveur : la position mondiale est ESTIMÉE à partir d'une répartition
 * habituelle des joueurs par rang (beaucoup en bas, très peu en haut), sur une population fictive.
 * L'interface l'indique toujours clairement (« estimé »).
 */
export const DISTRIBUTION = [35, 25, 18, 11, 7, 3.5, 0.5]; // % des joueurs par rang
export const POPULATION = 50000;
export const HISTORY_MAX = 20;
export const CURVE_MAX = 30;

/** Position estimée : { top: pourcentage (Top x %), pos: rang approximatif sur POPULATION }. */
export function estimate(s) {
  let top;
  if (s.tier === LEGEND) {
    // Légende : chaque point de score fait grimper vers le sommet
    top = DISTRIBUTION[LEGEND] * Math.exp(-(s.legendPts || 0) / 400);
  } else {
    const above = DISTRIBUTION.slice(s.tier + 1).reduce((a, b) => a + b, 0);
    const prog = s.promo ? 1 : Math.min(1, (s.div * DIV_POINTS + s.pts) / (DIV_POINTS * 3));
    top = above + DISTRIBUTION[s.tier] * (1 - prog * 0.98);
  }
  top = Math.max(1 / POPULATION * 100, Math.min(100, top));
  return { top, pos: Math.max(1, Math.round((top / 100) * POPULATION)) };
}

/** Pourcentage lisible : « 12 », « 3,4 », « 0,08 ». */
export function formatTop(top) {
  const v = top >= 10 ? Math.round(top) : top >= 1 ? Math.round(top * 10) / 10 : top >= 0.1 ? Math.round(top * 100) / 100 : Math.round(top * 1000) / 1000;
  return String(v).replace('.', ',');
}

/**
 * Enregistre un combat classé dans les statistiques (historique, personnages, moyennes,
 * records, courbe du classement). info : { result, charId, oppId, delta, dmg, parries, maxCombo }
 */
export function recordStats(prev, info, day = today()) {
  const s = { ...prev };
  s.history = [...(prev.history || []), { d: day, r: info.result, c: info.charId, o: info.oppId, delta: info.delta, step: stepOf(s) }].slice(-HISTORY_MAX);
  const c = { ...((prev.chars || {})[info.charId] || { w: 0, l: 0 }) };
  if (info.result === 'win') c.w += 1;
  else if (info.result === 'loss') c.l += 1;
  s.chars = { ...(prev.chars || {}), [info.charId]: c };
  const t = prev.tot || { matches: 0, dmg: 0, parries: 0 };
  s.tot = { matches: t.matches + 1, dmg: t.dmg + Math.max(0, Math.round(info.dmg || 0)), parries: t.parries + Math.max(0, info.parries || 0) };
  const r = prev.rec || { combo: 0, dmg: 0 };
  s.rec = { combo: Math.max(r.combo, info.maxCombo || 0), dmg: Math.max(r.dmg, Math.round(info.dmg || 0)) };
  const est = estimate(s);
  const curve = (prev.curve || []).filter((p) => p.d !== day);
  s.curve = [...curve, { d: day, top: est.top }].slice(-CURVE_MAX);
  s.bestTop = Math.min(prev.bestTop ?? 100, est.top);
  return s;
}
