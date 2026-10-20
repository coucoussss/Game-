// Défis : objectifs à long terme, suivis par des statistiques du profil, avec une récompense en Ryō
// à réclamer. Les compteurs avancent pendant les combats joués sur cette machine.
import { CHARACTERS } from '../game/characters.js';
import { CHAPTERS } from '../story/chapters.js';
import { bestTier } from '../game/ranked.js';

/**
 * [identifiant, nom, description, objectif, mesure(profil) → valeur, récompense]
 */
export const CHALLENGES = [
  ['first-win', 'Premier sang', 'Gagne un match.', 1, (p) => st(p, 'wins'), 150],
  ['wins-25', 'Vétéran', 'Gagne 25 matchs.', 25, (p) => st(p, 'wins'), 600],
  ['perfect', 'Sans une égratignure', 'Gagne une manche sans perdre de vie.', 1, (p) => st(p, 'perfects'), 400],
  ['combo-10', 'Virtuose', 'Réussis un combo de 10 coups.', 10, (p) => st(p, 'maxCombo'), 300],
  ['parry-10', 'Œil du maître', 'Réussis 10 parades parfaites.', 10, (p) => st(p, 'parries'), 350],
  ['counter-10', 'Riposte foudroyante', 'Réussis 10 ripostes après une parade.', 10, (p) => st(p, 'counters'), 350],
  ['pursuit-10', 'Chasseur des cieux', 'Réussis 10 poursuites aériennes.', 10, (p) => st(p, 'pursuits'), 300],
  ['slam-10', 'Marteau céleste', 'Rabats 10 adversaires avec la frappe plongeante.', 10, (p) => st(p, 'slams'), 300],
  ['ult-finish', 'Coup de grâce', 'Termine un combat avec un ultime.', 1, (p) => st(p, 'ultFinish'), 300],
  ['bosses-3', 'Tueur de boss', 'Vaincs 3 boss du mode Vagues.', 3, (p) => st(p, 'bosses'), 700],
  ['waves-10', 'Rempart', 'Réussis le niveau 10 du mode Vagues.', 10, (p) => p.levelUnlocked() - 1, 500],
  ['waves-30', 'Fléau du Fléau', 'Réussis le niveau 30 du mode Vagues.', 30, (p) => p.levelUnlocked() - 1, 2000],
  ['endless-20', 'Infatigable', 'Repousse 20 vagues en mode Infini.', 20, (p) => (p.data.endless[0] ? p.data.endless[0].score : 0), 800],
  ['story', 'La Légende', 'Termine le mode histoire.', CHAPTERS.length, (p) => p.data.story.filter((id) => CHAPTERS.some((c) => c.id === id)).length, 600],
  ['roster', 'Collectionneur', 'Possède tous les combattants.', CHARACTERS.length, (p) => p.ownedIds().length, 1000],
  ['rk-silver', 'Première promotion', 'Atteins le rang Argent en Classé.', 1, (p) => (rankTier(p) >= 1 ? 1 : 0), 300],
  ['rk-gold', 'Ruée vers l’or', 'Atteins le rang Or en Classé.', 1, (p) => (rankTier(p) >= 2 ? 1 : 0), 600],
  ['rk-master', 'Maître reconnu', 'Atteins le rang Maître en Classé.', 1, (p) => (rankTier(p) >= 5 ? 1 : 0), 1500],
  ['rk-legend', 'Légende vivante', 'Atteins le rang Légende de l’Aura.', 1, (p) => (rankTier(p) >= 6 ? 1 : 0), 3000],
  ['rk-streak', 'Inarrêtable', 'Gagne 10 combats classés d’affilée.', 10, (p) => (p.data.ranked ? p.data.ranked.bestStreak : 0), 800],
  ['rk-clean', 'Promotion éclatante', 'Réussis une promotion sans perdre de manche.', 1, (p) => st(p, 'cleanPromos'), 600],
  ['blessed', 'Béni des dieux', 'Cumule 5 bénédictions dans une même partie.', 5, (p) => st(p, 'maxBless'), 400],
];

function rankTier(p) {
  return p.data.ranked ? bestTier(p.data.ranked) : 0;
}

function st(p, k) {
  return (p.data.stats && p.data.stats[k]) || 0;
}

/** Progression d'un défi : { value, goal, done, claimed }. */
export function challengeState(p, ch) {
  const [id, , , goal, measure] = ch;
  const value = Math.min(goal, measure(p));
  return { value, goal, done: value >= goal, claimed: (p.data.claimed || []).includes(id) };
}

/** Défis accomplis mais pas encore réclamés. */
export function pendingChallenges(p) {
  return CHALLENGES.filter((c) => { const s = challengeState(p, c); return s.done && !s.claimed; });
}

/**
 * Suit les statistiques pendant un combat : appelé à chaque image avec les événements du match.
 * `mine` : identifiants des combattants contrôlés sur cette machine.
 */
export function trackEvents(p, events, match, mine) {
  const s = p.data.stats || (p.data.stats = {});
  const inc = (k, n = 1) => { s[k] = (s[k] || 0) + n; };
  for (const e of events) {
    switch (e.type) {
      case 'parry': if (mine.has(e.id)) inc('parries'); break;
      case 'pursuit': if (mine.has(e.id)) inc('pursuits'); break;
      case 'hit':
        if (!mine.has(e.att) || e.blocked) break;
        inc('hits');
        if (Number.isFinite(e.dmg)) inc('dmg', Math.round(e.dmg));
        if (e.counter) inc('counters');
        if (e.combo > (s.maxCombo || 0)) s.maxCombo = e.combo;
        if (match.fighters[e.att] && match.fighters[e.att].moveId === 'airslam') inc('slams');
        break;
      case 'ko': {
        const victim = match.fighters[e.id];
        if (!victim || mine.has(e.id)) break;
        inc('kos');
        const killer = [...mine].map((i) => match.fighters[i]).find((f) => f && f.state === 'move' && /^ultimate/.test(f.moveId));
        if (killer) inc('ultFinish');
        if (victim.def.boss) inc('bosses');
        break;
      }
      case 'roundWin': {
        const mineF = [...mine].map((i) => match.fighters[i]).filter(Boolean);
        if (mineF.length && mineF.every((f) => f.team === e.team && f.hp >= f.maxHp - 0.5)) inc('perfects');
        break;
      }
      case 'blessing': {
        const f = match.fighters[e.id];
        const n = f ? Object.values(f.bless).reduce((a, b) => a + b, 0) : 0;
        if (n > (s.maxBless || 0)) s.maxBless = n;
        break;
      }
      default: break;
    }
  }
}
