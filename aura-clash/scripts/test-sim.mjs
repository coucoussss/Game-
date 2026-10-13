// Test de la simulation (sans rendu) : des matchs complets entre IA, pour chaque personnage,
// en 1v1 et en 2v2. Vérifie qu'aucune erreur ne survient et que chaque match se termine.
import { Match } from '../src/game/match.js';
import { CpuBrain } from '../src/game/ai.js';
import { CHARACTERS } from '../src/game/characters.js';
import { TICK } from '../src/game/constants.js';
import { buildLevel, WAVE_LEVELS, WAVE_HEAL, endlessWave, blessingChoices } from '../src/game/waves.js';
import { MONSTERS } from '../src/game/monsters.js';

let failures = 0;
function runMatch(fighters, level = 'hard', maxTicks = 60 * 60 * 8) {
  const m = new Match({ fighters, arenaRadius: 18, roundTime: 99 });
  const brains = m.fighters.map((f) => new CpuBrain(f.id, level));
  const seen = new Set();
  let ticks = 0;
  while (m.phase !== 'matchEnd' && ticks < maxTicks) {
    const inputs = brains.map((b) => b.think(m, TICK));
    m.step(TICK, inputs);
    for (const e of m.events) {
      seen.add(e.type);
      if (e.type === 'cine') seen.add('cine:' + e.text);
    }
    m.events.length = 0;
    for (const f of m.fighters) {
      for (const k of ['x', 'y', 'z', 'hp', 'energy', 'vx', 'vy', 'vz']) {
        if (!Number.isFinite(f[k])) throw new Error(`Valeur invalide ${k} pour ${f.charId}`);
      }
    }
    ticks++;
  }
  return { m, ticks, seen };
}

const ids = CHARACTERS.map((c) => c.id);
const ultSeen = new Set();
for (let i = 0; i < ids.length; i++) {
  for (let j = 0; j < ids.length; j++) {
    if (i === j) continue;
    const { m, ticks, seen } = runMatch([{ charId: ids[i], team: 0 }, { charId: ids[j], team: 1 }]);
    for (const s of seen) if (s.startsWith('cine:')) ultSeen.add(s);
    const ok = m.phase === 'matchEnd';
    if (!ok) failures++;
    console.log(`${ok ? '✔' : '✘'} ${ids[i]} vs ${ids[j]} : ${(ticks / 60).toFixed(0)} s, manches ${m.wins.join('-')}, vainqueur ${m.winner}`);
  }
}
const duo = runMatch([
  { charId: 'kael', team: 0 }, { charId: 'sora', team: 0 },
  { charId: 'lyra', team: 1 }, { charId: 'goro', team: 1 },
]);
console.log(`${duo.m.phase === 'matchEnd' ? '✔' : '✘'} 2v2 : ${(duo.ticks / 60).toFixed(0)} s, manches ${duo.m.wins.join('-')}`);
if (duo.m.phase !== 'matchEnd') failures++;
console.log('Ultimes observés :', [...ultSeen].map((s) => s.slice(5)).join(', '));

// Entraînement : pas de KO possible
const tr = new Match({ fighters: [{ charId: 'goro', team: 0 }, { charId: 'kael', team: 1 }], training: true });
const b = new CpuBrain(0, 'hard');
for (let k = 0; k < 60 * 60; k++) { tr.step(TICK, [b.think(tr, TICK), null]); tr.events.length = 0; }
if (!tr.fighters.every((f) => f.alive)) { failures++; console.log('✘ entraînement : un KO a eu lieu'); }
else console.log('✔ entraînement sans KO');

// Techniques alternatives (spécial et ultime « B ») : chaque combattant les utilise sans erreur
{
  const seenB = new Set();
  for (let i = 0; i < ids.length; i++) {
    const m = new Match({ fighters: [{ charId: ids[i], team: 0, loadout: { special: 'B', ultimate: 'B' } }, { charId: ids[(i + 1) % ids.length], team: 1, loadout: { special: 'B', ultimate: 'B' } }], arenaRadius: 18 });
    const br = [new CpuBrain(0, 'hard'), new CpuBrain(1, 'hard')];
    let t = 0;
    while (m.phase !== 'matchEnd' && t < 60 * 60 * 6) {
      if (t % 600 === 0) m.fighters.forEach((f) => { f.energy = 100; });
      m.step(TICK, br.map((b) => b.think(m, TICK)));
      for (const e of m.events) {
        if (e.type === 'cine') seenB.add(e.text);
        if (e.type === 'special') seenB.add(e.name);
      }
      m.events.length = 0;
      t++;
    }
    if (m.phase !== 'matchEnd') { failures++; console.log(`✘ techniques B : ${ids[i]} ne termine pas`); }
  }
  // Déclenchement direct de chaque spécial et ultime B (l'IA peut ne pas les avoir tous utilisés)
  for (const c of CHARACTERS) {
    for (const [btn, slot] of [[16, 'special'], [32, 'ultimate']]) {
      const m = new Match({ fighters: [{ charId: c.id, team: 0, loadout: { special: 'B', ultimate: 'B' } }, { charId: 'kage', team: 1 }], arenaRadius: 18 });
      m.phase = 'fight';
      m.fighters[0].energy = 100;
      m.fighters[0].x = -2; m.fighters[1].x = 2;
      for (let k = 0; k < 200; k++) {
        m.step(TICK, [k === 2 ? { mx: 0, mz: 0, held: btn, pressed: btn } : null, null]);
        for (const e of m.events) { if (e.type === 'cine') seenB.add(e.text); if (e.type === 'special') seenB.add(e.name); }
        m.events.length = 0;
      }
    }
  }
  const expected = CHARACTERS.flatMap((c) => [c.moves.specialB, c.moves.ultimateB]).filter(Boolean).map((mv) => (mv.cine ? mv.cine.text : mv.name));
  const missing = expected.filter((x) => !seenB.has(x));
  console.log(`${missing.length === 0 ? '✔' : '✘'} techniques B vues : ${expected.length - missing.length} / ${expected.length}${missing.length ? ` (pas vues : ${missing.join(', ')})` : ''}`);
  if (missing.length) failures++;
}

// Arènes interactives : chaque règle se déclenche et les matchs se terminent
for (const arena of ['cliffs', 'temple', 'neon', 'glacier', 'volcano']) {
  const m = new Match({ fighters: [{ charId: 'goro', team: 0 }, { charId: 'garo', team: 1 }], arenaRadius: 18, arena });
  const br = [new CpuBrain(0, 'hard'), new CpuBrain(1, 'hard')];
  const seen = new Set();
  let t = 0;
  while (m.phase !== 'matchEnd' && t < 60 * 60 * 8) {
    // On pousse régulièrement un combattant vers le bord (là où sont les obstacles et la lave)
    if (t % 900 === 450 && m.phase === 'fight') {
      // Projection droit sur un obstacle (ou vers le bord s'il n'y en a pas)
      const f = m.fighters[1];
      const p = m.hazards.props.find((q) => q.alive);
      const tx = p ? p.x : f.x * 3;
      const tz = p ? p.z : f.z * 3;
      if (p) { const r = Math.hypot(p.x, p.z); const k = (r - 1.9) / r; f.x = p.x * k; f.z = p.z * k; f.y = 0; }
      const a = Math.atan2(tz - f.z, tx - f.x);
      f.vx = Math.cos(a) * 16; f.vz = Math.sin(a) * 16; f.setState('hitstun'); f.stun = 0.5;
    }
    m.step(TICK, br.map((b) => b.think(m, TICK)));
    for (const e of m.events) seen.add(e.type === 'prop' && !e.alive ? 'propBroken' : e.type);
    m.events.length = 0;
    t++;
  }
  const want = { cliffs: 'propBroken', temple: 'propBroken', glacier: 'propBroken', neon: 'zap', volcano: 'lava' }[arena];
  const ok = m.phase === 'matchEnd' && seen.has(want);
  if (!ok) failures++;
  console.log(`${ok ? '✔' : '✘'} arène ${arena} : ${seen.has(want) ? want : `pas de ${want}`}, match terminé en ${(t / 60).toFixed(0)} s`);
}

// Mode Vagues : composition des 30 niveaux, puis quelques niveaux joués par une IA difficile
for (let n = 1; n <= WAVE_LEVELS; n++) {
  const lv = buildLevel(n);
  const bad = lv.waves.some((w) => !w.length || w.length > 4);
  if (bad || (n % 5 === 0) !== !!lv.boss) { failures++; console.log(`✘ niveau ${n} mal composé`); }
}
function runLevel(n, charId, mods, maxTicks = 60 * 60 * 15) {
  const lv = buildLevel(n);
  const m = new Match({
    fighters: [{ charId, team: 0, mods }, ...lv.waves[0].map((e) => ({ charId: e.charId, team: 1, mods: e.mods }))],
    arenaRadius: 18, waves: lv.waves, waveHeal: WAVE_HEAL,
  });
  const brains = [new CpuBrain(0, 'hard'), ...lv.waves[0].map((e, k) => new CpuBrain(k + 1, e.level))];
  const seen = new Set();
  let ticks = 0;
  while (m.phase !== 'matchEnd' && ticks < maxTicks) {
    m.step(TICK, brains.map((b) => (b ? b.think(m, TICK) : null)));
    for (const e of m.events) {
      if (e.type === 'waveSpawn') {
        e.ids.forEach((id, k) => { brains[id] = new CpuBrain(id, lv.waves[e.n - 1][k].level); });
      }
      if (e.type === 'cine') seen.add(e.text);
    }
    m.events.length = 0;
    for (const f of m.fighters) {
      for (const k of ['x', 'y', 'z', 'hp', 'energy']) if (!Number.isFinite(f[k])) throw new Error(`Valeur invalide ${k} pour ${f.charId} (niveau ${n})`);
    }
    ticks++;
  }
  return { m, lv, ticks, seen };
}
const maxed = { dmg: 1.3, hp: 1.35, speed: 1.2, energy: 1.6, cd: 0.65 };
const monsterUlts = new Set();
for (const [n, mods] of [[1, {}], [3, {}], [5, {}], [8, {}], [10, maxed], [12, maxed], [15, maxed], [18, maxed], [20, maxed], [25, maxed], [30, maxed]]) {
  const { m, lv, ticks, seen } = runLevel(n, 'kael', mods);
  for (const s of seen) monsterUlts.add(s);
  const ok = m.phase === 'matchEnd';
  if (!ok) failures++;
  const p = m.fighters[0];
  console.log(`${ok ? '✔' : '✘'} vagues niveau ${n}${Object.keys(mods).length ? ' (Kael amélioré au max)' : ''} : ${m.winner === 0 ? 'réussi' : `échec à la vague ${m.wave + 1}`} / ${lv.waves.length}, ${(ticks / 60).toFixed(0)} s, ${m.fighters.length - 1} ennemis, vie restante ${Math.max(0, Math.round(p.hp))}`);
}
console.log('Ultimes observés en mode Vagues :', [...monsterUlts].join(', ') || 'aucun');
console.log(`Bestiaire : ${MONSTERS.length} créatures`);

// Mode Infini avec bénédictions choisies au hasard, et éveil des boss en seconde phase
{
  const m = new Match({
    fighters: [{ charId: 'kael', team: 0, mods: maxed }, ...endlessWave(0).map((e) => ({ charId: e.charId, team: 1, mods: e.mods }))],
    arenaRadius: 18, waveGen: (k) => endlessWave(k), waveHeal: WAVE_HEAL, blessings: true, blessEvery: 3,
  });
  const brains = [new CpuBrain(0, 'hard'), ...endlessWave(0).map((e, k) => new CpuBrain(k + 1, e.level))];
  const seen = new Set();
  let ticks = 0;
  while (m.phase !== 'matchEnd' && ticks < 60 * 60 * 20) {
    if (m.awaitChoice) m.applyBlessing(m.fighters[0], blessingChoices()[0][0]);
    m.step(TICK, brains.map((b) => (b ? b.think(m, TICK) : null)));
    for (const e of m.events) {
      seen.add(e.type);
      if (e.type === 'waveSpawn') e.ids.forEach((id, k) => { brains[id] = new CpuBrain(id, e.entries[k].level); });
    }
    m.events.length = 0;
    ticks++;
  }
  const f = m.fighters[0];
  const ok = seen.has('blessing') && m.wave >= 3; // la partie peut durer : on vérifie qu'elle avance
  if (!ok) failures++;
  console.log(`${ok ? '✔' : '✘'} mode Infini : ${m.wave} vagues repoussées, bénédictions ${JSON.stringify(f.bless)}${seen.has('bossPhase') ? ', un boss est passé en seconde phase' : ''}`);
}
// Seconde phase forcée : un boss à mi-vie s'éveille
{
  const m = new Match({ fighters: [{ charId: 'kael', team: 0 }, { charId: 'roi-fleau', team: 1 }], arenaRadius: 18, waves: [[{ charId: 'roi-fleau', boss: true }]] });
  m.phase = 'fight';
  m.fighters[1].hp = m.fighters[1].maxHp * 0.4;
  let phase = false;
  for (let k = 0; k < 10; k++) { m.step(TICK, [null, null]); if (m.events.some((e) => e.type === 'bossPhase')) phase = true; m.events.length = 0; }
  const ok = phase && m.fighters[1].phase2 && m.fighters[1].moveDef('special2') && m.fighters[1].transformed;
  if (!ok) failures++;
  console.log(`${ok ? '✔' : '✘'} seconde phase du boss`);
}

// --- Mode Classé : points, divisions, promotions, protections ---
{
  const R = await import('../src/game/ranked.js');
  const check = (ok, label) => { if (!ok) failures++; console.log(`${ok ? '✔' : '✘'} classé : ${label}`); };
  const win = { result: 'win' };
  let st = R.newRankedState();
  // Bonus du jour : la première victoire du jour compte double
  let r = R.applyResult(st, win, '2026-01-01');
  check(r.delta === 40 && r.daily && r.ryo === R.RANKED_RYO.win + R.DAILY_RYO, 'bonus du jour (×2)');
  r = R.applyResult(r.state, win, '2026-01-01');
  check(r.delta === 20 && !r.daily, 'pas de second bonus le même jour');
  // Une défaite ne fait jamais descendre de division
  st = { ...R.newRankedState(), tier: 2, div: 1, pts: 5, lastDaily: '2026-01-01' };
  r = R.applyResult(st, { result: 'loss' }, '2026-01-01');
  check(r.state.pts === 0 && r.state.div === 1 && r.state.tier === 2 && r.delta === -5, 'défaite plafonnée à 0 point');
  // Passage de division avec report des points
  st = { ...R.newRankedState(), pts: 90, lastDaily: '2026-01-01' };
  r = R.applyResult(st, { result: 'win', perfect: true }, '2026-01-01');
  check(r.state.div === 1 && r.state.pts === 15 && r.event === 'divUp', 'division suivante (points reportés)');
  // Division I pleine : combat de promotion
  st = { ...R.newRankedState(), tier: 1, div: 2, pts: 95, lastDaily: '2026-01-01' };
  r = R.applyResult(st, win, '2026-01-01');
  check(r.state.promo && r.state.pts === 100 && r.event === 'promoStart', 'combat de promotion débloqué');
  const promoFail = R.applyResult(r.state, { result: 'loss' }, '2026-01-01');
  check(!promoFail.state.promo && promoFail.state.pts === 75 && promoFail.state.tier === 1 && promoFail.event === 'promoFailed', 'promotion ratée : retour à 75 points');
  const promoOk = R.applyResult(r.state, win, '2026-01-01');
  check(promoOk.state.tier === 2 && promoOk.state.div === 0 && promoOk.state.pts === 0 && promoOk.event === 'promoted' && promoOk.ryo === R.RANKED_RYO.win + R.RANKS[2].reward, 'promotion réussie (récompense du rang)');
  // Séries de victoires
  st = { ...R.newRankedState(), streak: 4, lastDaily: '2026-01-01' };
  r = R.applyResult(st, win, '2026-01-01');
  check(r.delta === 30 && r.state.bestStreak === 5, 'série de 5 victoires (+10)');
  // Légende : score sans limite, jamais négatif
  st = { ...R.newRankedState(), tier: R.LEGEND, legendPts: 10, lastDaily: '2026-01-01' };
  r = R.applyResult(st, { result: 'loss' }, '2026-01-01');
  check(r.state.legendPts === 0 && r.state.tier === R.LEGEND, 'Légende : points jamais négatifs');
  // Sauvegarde corrompue remise dans les bornes
  const bad = R.sanitizeRanked({ tier: 99, div: -3, pts: 1e9, promo: true, streak: 'x' });
  check(bad.tier === R.LEGEND && bad.div === 0 && bad.pts <= 100 && !bad.promo && bad.streak === 0, 'sauvegarde invalide corrigée');
  check(R.rankName({ tier: 2, div: 1 }) === 'Or II' && R.stepName(18) === R.RANKS[6].name, 'noms des rangs');
  // Adversaires : de plus en plus forts, boss pour les deux dernières promotions
  const opp = R.RANKS.map((_, t) => R.opponentFor({ tier: t, div: 0, promo: false }));
  const LV = { easy: 0, normal: 1, hard: 2 };
  check(opp.every((o, i) => i === 0 || LV[o.level] > LV[opp[i - 1].level] || (o.level === opp[i - 1].level && o.mods.hp >= opp[i - 1].mods.hp)), 'adversaires de plus en plus forts');
  check(R.opponentFor({ tier: 4, div: 2, promo: true }).boss === 'shogun-oni' && R.opponentFor({ tier: 5, div: 2, promo: true }).boss === 'roi-fleau', 'boss des promotions');
  // Étape 2 : titres et auras exclusives, équipés d'office à la promotion
  const toMaster = R.applyResult({ ...R.newRankedState(), tier: 4, div: 2, pts: 100, promo: true, best: 14, lastDaily: '2026-01-01' }, win, '2026-01-01');
  check(toMaster.state.title === 5 && toMaster.state.aura === 'flammes-noires' && R.titleOf(toMaster.state) === 'Sensei', 'promotion Maître : titre et aura équipés');
  const st2 = { ...R.newRankedState(), best: 7, title: 5, aura: 'arc-en-ciel' };
  check(R.titleOf(st2) === '' && R.auraOf(st2) === null && R.unlockedAuras(st2).map((x) => x.id).join() === 'or' && R.unlockedTitles(st2).join() === '1', 'récompenses non débloquées refusées');
  const kept = R.sanitizeRanked({ ...toMaster.state });
  check(kept.title === 5 && kept.aura === 'flammes-noires' && R.sanitizeRanked({ title: 42, aura: 'xx' }).aura === '', 'titre et aura sauvegardés (et validés)');
  const gold = R.withRankAura(CHARACTERS[0], 'or');
  check(gold.aura === '#ffd23f' && gold.auraStyle === 'flame' && R.withRankAura(CHARACTERS[0], null) === CHARACTERS[0], 'aura de rang appliquée au combattant');
  // Équilibre : un joueur solide (IA difficile, sans amélioration) contre chaque rang
  const roster = CHARACTERS.filter((c) => !c.monster).map((c) => c.id);
  const rates = [];
  for (let t = 0; t < R.RANKS.length; t++) {
    let wins = 0, n = 0;
    for (let k = 0; k < 8; k++) {
      const o = R.opponentFor({ tier: t, div: 0, promo: false });
      const me = roster[(k * 5 + t) % roster.length];
      const foe = roster[(k * 7 + t + 3) % roster.length];
      const m = new Match({ fighters: [{ charId: me, team: 0 }, { charId: foe, team: 1, mods: o.mods }], arenaRadius: 18, roundTime: 99 });
      const brains = [new CpuBrain(0, 'hard'), new CpuBrain(1, o.level)];
      for (let i = 0; i < 60 * 60 * 6 && m.phase !== 'matchEnd'; i++) { m.step(TICK, brains.map((b) => b.think(m, TICK))); m.events.length = 0; }
      n++;
      if (m.winner === 0) wins++;
    }
    rates.push(Math.round((wins / n) * 100));
  }
  console.log(`  victoires d'un joueur solide par rang : ${rates.map((x, i) => `${R.RANKS[i].name} ${x} %`).join(' · ')}`);
  for (const [t, boss] of Object.entries(R.PROMO_BOSSES)) {
    let wins = 0;
    for (let k = 0; k < 6; k++) {
      const o = R.opponentFor({ tier: Number(t) - 1, div: 2, promo: true });
      const m = new Match({ fighters: [{ charId: roster[k % roster.length], team: 0 }, { charId: boss, team: 1, mods: o.mods }], arenaRadius: 18, roundTime: 99 });
      const brains = [new CpuBrain(0, 'hard'), new CpuBrain(1, o.level)];
      for (let i = 0; i < 60 * 60 * 6 && m.phase !== 'matchEnd'; i++) { m.step(TICK, brains.map((b) => b.think(m, TICK))); m.events.length = 0; }
      if (m.winner === 0) wins++;
    }
    console.log(`  promotion contre ${boss} : ${wins} / 6 victoires`);
  }
}

if (failures) { console.error(`${failures} échec(s)`); process.exit(1); }
console.log('Simulation OK');
