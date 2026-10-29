// Simulation d'équilibrage : fait jouer des stratégies automatiques sur de nombreuses graines.
// Usage : node tools/simulate.js [nombre de parties]
// La logique est extraite de index.html, pour tester exactement ce que joue le navigateur.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.split('<script>')[1].split('// INTERFACE')[0];
const L = new Function('module', code + '\nreturn Logic;')({});
const GAMES = +process.argv[2] || 300;

function act(s, key, i) { return L.doCellAction(s, key, i).ok; }
function dangerCells(s) {
  const fc = L.forecast(s);
  return fc.attacks.filter(a => a.result === 'tombé' || a.wounds.length || a.deaths.length).map(a => a.cellIdx);
}
function day(s, mode) {
  if (s.event) { const e = L.eventById(s.event); for (let k = 0; k < e.choix.length; k++) { if (L.resolveEvent(s, k) !== null) break; } }
  if (mode === 'rien') return;
  // gardes : tout le monde au camp, puis sur les cases menacées
  for (const v of s.survivors) v.post = null;
  for (let guard = 0; guard < 12; guard++) {
    const d = dangerCells(s);
    if (!d.length) break;
    const c = d[0];
    let done = false;
    if (!s.cells[c].camp) {
      const v = s.survivors.find(v => v.post === null && v.trait !== 'paranoiaque' && v.health >= 2);
      if (v && L.assign(s, v.id, c).ok) done = true;
    }
    if (!done) done = act(s, 'barricade', c) || act(s, 'piege', c);
    if (!done && !s.cells[c].camp && mode !== 'tortue') done = act(s, 'abandonner', c);
    if (!done) break;
  }
  // soins
  for (const v of s.survivors) if (v.health <= 1) L.doSurvivorAction(s, 'soigner', v.id);
  // expansion
  if (mode === 'expansion') {
    for (let k = 0; k < 3 && s.pa > 1; k++) {
      const occ = s.cells.find(c => c.revealed && !c.owned && c.type !== 'obstacle' && L.cellActions(s, c.i).some(a => a.key === 'occuper' && !a.reason) && !c.rodeurs);
      if (occ) { act(s, 'occuper', occ.i); continue; }
      const ex = s.cells.find(c => !c.revealed && L.cellActions(s, c.i).some(a => a.key === 'explorer' && !a.reason));
      if (ex) act(s, 'explorer', ex.i);
    }
  }
  // fouille
  for (let k = 0; k < 6 && s.pa > 0; k++) {
    const need = s.res.food < 15 ? 'food' : s.res.mat < 8 ? 'mat' : 'ammo';
    const lieux = s.cells.filter(c => c.type === 'lieu' && c.revealed && L.cellActions(s, c.i).some(a => a.key === 'fouiller' && !a.reason));
    lieux.sort((a, b) => L.LIEUX[b.lieu].gain[need] * Math.pow(.75, b.visits) - L.LIEUX[a.lieu].gain[need] * Math.pow(.75, a.visits));
    if (lieux.length && L.LIEUX[lieux[0].lieu].gain[need] * Math.pow(.75, lieux[0].visits) >= 2) { act(s, 'fouiller', lieux[0].i); continue; }
    const ex = s.cells.find(c => !c.revealed && L.cellActions(s, c.i).some(a => a.key === 'explorer' && !a.reason));
    if (ex) { act(s, 'explorer', ex.i); continue; }
    break;
  }
  // derniers ajustements défensifs
  for (let guard = 0; guard < 6; guard++) {
    const d = dangerCells(s); if (!d.length) break;
    if (!(act(s, 'barricade', d[0]) || act(s, 'piege', d[0]))) break;
  }
}
// Stratégies : « rien » ne fait rien, « tortue » défend sans jamais abandonner,
// « souple » abandonne les cases intenables, « expansion » occupe le terrain.
for (const mode of ['rien', 'tortue', 'souple', 'expansion']) {
  const res = { victoire: 0, defaite: 0 }, nights = [];
  for (let seed = 1; seed <= GAMES; seed++) {
    const s = L.newGame(seed);
    while (!s.outcome) { day(s, mode); L.runNight(s); }
    res[s.outcome]++;
    nights.push(s.nightsSurvived);
  }
  nights.sort((a, b) => a - b);
  const pct = Math.round(100 * res.victoire / GAMES);
  console.log(`${mode.padEnd(10)} victoires ${String(pct).padStart(3)} %   nuits tenues (médiane) ${nights[GAMES >> 1]}`);
}
