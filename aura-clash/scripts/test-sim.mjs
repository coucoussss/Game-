// Test de la simulation (sans rendu) : des matchs complets entre IA, pour chaque personnage,
// en 1v1 et en 2v2. Vérifie qu'aucune erreur ne survient et que chaque match se termine.
import { Match } from '../src/game/match.js';
import { CpuBrain } from '../src/game/ai.js';
import { CHARACTERS } from '../src/game/characters.js';
import { TICK } from '../src/game/constants.js';
import { buildLevel, WAVE_LEVELS, WAVE_HEAL } from '../src/game/waves.js';
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

if (failures) { console.error(`${failures} échec(s)`); process.exit(1); }
console.log('Simulation OK');
