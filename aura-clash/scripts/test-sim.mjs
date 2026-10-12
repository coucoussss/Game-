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

if (failures) { console.error(`${failures} échec(s)`); process.exit(1); }
console.log('Simulation OK');
