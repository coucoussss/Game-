// Test de la progression en continu (passe, missions, coffres, connexion, roue, fragments…).
import { Profile } from '../src/core/profile.js';
import {
  refresh, seasonInfo, tierReward, passTier, PASS_TIERS, TIER_XP, dayIndex, loginState, claimLogin, LOGIN_DAYS,
  missionProgress, rollChest, CHESTS, spinWheel, WHEEL, dailyOffers, weeklyRotation, dailyBoss, towerFloor,
  ACHIEVEMENTS, matchPassXp, seeded, sanitizeLive, PAID, FRAGS_TO_UNLOCK, masteryOf, badgeOf,
} from '../src/core/liveops.js';
import { grant } from '../src/core/rewards.js';
import { CHAR_BY_ID } from '../src/game/characters.js';
import { dressed } from '../src/game/techniques.js';

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? '✔' : '✘'} ${label}`); if (!ok) failures++; };
const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 14, 12);

const prof = new Profile();
const live = prof.data.live;
const stats = prof.data.stats || (prof.data.stats = {});
refresh(live, T0, stats, prof.playableIds(T0), seeded(1));
check(live.daily.length === 3 && live.weekly.length === 5, 'missions tirées : 3 du jour, 5 de la semaine');
check(new Set(live.daily.map((m) => m.id)).size === 3, 'missions du jour toutes différentes');

// Passe : toutes les récompenses existent et sont valides
const S = seasonInfo(T0);
let valid = true;
for (let n = 1; n <= PASS_TIERS; n++) for (const tr of ['free', 'premium']) {
  const r = tierReward(S, n, tr);
  if (!r || !r.t) valid = false;
  if (r.t === 'char' && !CHAR_BY_ID[r.id]) valid = false;
}
check(valid, 'les 120 récompenses du passe sont valides');
check(tierReward(S, 30, 'premium').t === 'char', 'palier 30 premium : un combattant');
check(passTier(TIER_XP * 3 + 10) === 3 && passTier(1e9) === PASS_TIERS, 'calcul des paliers');

// Gains de passe : première victoire du jour
const a = matchPassXp(live, T0, 'win');
const b = matchPassXp(live, T0, 'win');
check(a.firstWin && !b.firstWin && a.xp > b.xp, 'bonus de première victoire une seule fois par jour');

// Missions : progression par différence de statistiques
const m = live.daily[0];
stats[m.stat.split('.')[0]] = m.stat.includes('.') ? { [m.stat.split('.')[1]]: m.goal } : m.goal;
check(missionProgress(m, stats).done, `mission « ${m.id} » accomplie quand la statistique avance`);

// Coffres : contenu et distribution
const r = seeded(7);
let ok = true;
for (const rar of Object.keys(CHESTS)) for (let i = 0; i < 50; i++) if (rollChest(rar, r).length !== CHESTS[rar].cards) ok = false;
check(ok, 'nombre de cartes de chaque coffre');
const ryo0 = prof.data.ryo;
const res = grant(prof, { t: 'chest', r: 'mythic' }, seeded(3));
check(res[0].t === 'chest' && res[0].cards.length >= 6 && prof.data.ryo >= ryo0, 'ouverture d’un coffre mythique');

// Fragments : 100 débloquent le personnage
const target = PAID.find((id) => !prof.owns(id));
grant(prof, { t: 'frag', id: target, n: 60 });
check(!prof.owns(target) && live.frags[target] === 60, 'fragments cumulés');
grant(prof, { t: 'frag', id: target, n: 50 });
check(prof.owns(target) && !live.frags[target], `${FRAGS_TO_UNLOCK} fragments débloquent ${target}`);
const before = prof.data.ryo;
grant(prof, { t: 'frag', id: target, n: 10 });
check(prof.data.ryo > before, 'fragments d’un personnage possédé convertis en Ryō');

// Skins universels : utilisables par tous, et rendus par dressed()
grant(prof, { t: 'skin', id: 'galaxie' });
check(prof.hasCostume('kael', 'galaxie') && prof.hasCostume('lyra', 'galaxie'), 'skin universel porté par tous');
check(dressed(CHAR_BY_ID.kael, 'galaxie').aura === '#8a6bff', 'skin appliqué au modèle (aura)');

// Connexion : série, jour manqué, sauvetage
const L = sanitizeLive(null);
let d1 = claimLogin(L, T0);
let d2 = claimLogin(L, T0 + DAY);
check(d1.day === 1 && d2.day === 2 && !loginState(L, T0 + DAY).claimable, 'série de connexion');
check(loginState(L, T0 + 3 * DAY).broken === 2, 'jour manqué : série récupérable');
const d4 = claimLogin(L, T0 + 3 * DAY, true);
check(d4.day === 3, 'série sauvée par une pub');
const L2 = sanitizeLive(null); L2.login = { last: dayIndex(T0) - 1, streak: LOGIN_DAYS, claimedDay: -1, total: 28 };
check(claimLogin(L2, T0).day === 1, 'après le jour 28, la série recommence');

// Roue : distribution proche des poids
const counts = WHEEL.map(() => 0);
const rw = seeded(11);
for (let i = 0; i < 20000; i++) counts[spinWheel(rw)]++;
const total = WHEEL.reduce((n, s) => n + s.w, 0);
check(WHEEL.every((s, i) => Math.abs(counts[i] / 20000 - s.w / total) < 0.015), 'roue : chances conformes aux poids affichés');

// Offres, rotation, boss, tour
check(dailyOffers(T0).length === 5 && JSON.stringify(dailyOffers(T0)) === JSON.stringify(dailyOffers(T0 + 3600000)), 'offres du jour stables dans la journée');
const rot = weeklyRotation(T0);
check(rot.length === 3 && rot.every((id) => CHAR_BY_ID[id]), 'rotation : 3 personnages');
const p2 = new Profile();
check(rot.every((id) => p2.playable(id, T0)), 'les personnages de la rotation sont jouables');
check(CHAR_BY_ID[dailyBoss(T0).id] && CHAR_BY_ID[dailyBoss(T0).id].boss, 'boss du jour valide');
check([1, 5, 10, 25, 60].every((n) => CHAR_BY_ID[towerFloor(n).foe]), 'étages de la tour valides');
check(towerFloor(10).boss && towerFloor(10).reward.some((x) => x.t === 'chest'), 'étage 10 : boss et coffre');

// Succès, maîtrise, badges
check(new Set(ACHIEVEMENTS.map((x) => x.id)).size === ACHIEVEMENTS.length && ACHIEVEMENTS.length >= 60, `${ACHIEVEMENTS.length} succès, identifiants uniques`);
check(masteryOf({ charWins: { kael: 30 } }, 'kael').stars === 3, 'maîtrise : étoiles');
check(badgeOf(1).id === 'bronze' && badgeOf(80).id === 'diamant', 'badges de niveau');

// Nouvelle saison : remise à zéro du passe
live.passXp = 50000; live.freeClaimed = [1, 2];
refresh(live, T0 + 40 * DAY, stats, ['kael'], seeded(2));
check(live.passXp === 0 && live.freeClaimed.length === 0, 'nouvelle saison : passe remis à zéro');

// État corrompu : réparé
const bad = sanitizeLive({ passXp: -5, daily: 'x', skins: ['nope', 'jade'], tower: { floor: 0 } });
check(bad.passXp === 0 && Array.isArray(bad.daily) && bad.skins.length === 1 && bad.tower.floor === 1, 'sauvegarde corrompue réparée');

if (failures) { console.log(`\n${failures} échec(s)`); process.exit(1); }
console.log('\nProgression OK');
