'use strict';
// Vérifications de vehicle.js (sans navigateur) : vitesses de pointe selon le sol, accélérations,
// roue libre et freinage, marche arrière, pivots, adhérence latérale, boîtes orientées.
// Usage : node tools/check-vehicle.js [--table] ; code de sortie 1 en cas d'échec.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Math, console };
vm.createContext(ctx);
for (const f of ['models.js', 'vehicle.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx);
vm.runInContext('this.V = Vehicle; this.TM = TankModels;', ctx);
const V = ctx.V, TM = ctx.TM;
// masse (t) et puissance (ch) : les mêmes que TYPES dans game.js
const TANKS = { light: [12, 180], medium: [45, 700], heavy: [57, 700], pz4: [25, 300], stug: [24, 300], kingtiger: [68, 700], destroyer: [46, 700] };
let failed = 0;
function check(name, ok, info) {
  console.log((ok ? 'OK   ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : ''));
  if (!ok) failed++;
}
const r1 = v => Math.round(v * 10) / 10;
const D = {};
for (const id in TANKS) D[id] = V.prep(Object.assign({}, V.DATA[id]), TM.info(id).S, TANKS[id][0], TANKS[id][1]);
function sim(id, soil, ctl, secs, t0) {
  const d = D[id], s = V.SOIL[soil], dt = 1 / 60;
  const t = t0 || { speed: 0, vl: 0, turnRate: 0, gear: 0, shiftT: 0, rpmA: V.IDLE, x: 0, y: 0, a: 0 };
  const c = { thr: 0, turn: 0, brake: false, P: d.P, gov: d.gov, crr: V.crrOf(s, d.press), crrD: 0, mu: s.mu, lat: s.lat, slope: 0, grip: 1, drive: true, driver: true, engine: true, broken: 0, vCap: 99, vBroken: 0.6, maxGear: 9, stuck: false, rev: 0 };
  const out = { maxV: 0, maxW: 0, maxLat: 0, tAt: null };
  for (let i = 0; i < secs * 60; i++) {
    Object.assign(c, ctl(t, i * dt));
    V.step(t, d, c, dt, 1);
    t.a += t.turnRate * dt;
    t.x += (Math.cos(t.a) * t.speed - Math.sin(t.a) * t.vl) * dt; t.y += (Math.sin(t.a) * t.speed + Math.cos(t.a) * t.vl) * dt;
    out.maxV = Math.max(out.maxV, Math.abs(t.speed)); out.maxW = Math.max(out.maxW, Math.abs(t.turnRate));
    out.maxLat = Math.max(out.maxLat, Math.abs(t.speed * t.turnRate));
    if (out.tAt == null && out.at != null && Math.abs(t.speed) >= out.at) out.tAt = i * dt;
    if (ctl.stop && ctl.stop(t)) break;
  }
  out.t = t;
  return out;
}
const kmh = v => r1(v * 3.6);
const full = () => ({ thr: 1 });
const topOn = (id, soil) => kmh(sim(id, soil, full, 90).maxV);
const tab = {};
for (const id in TANKS) {
  const z = sim(id, 'track', full, 40, null);
  const t30 = (() => { let tt = null; sim(id, 'track', (t, time) => { if (tt == null && t.speed >= 30 / 3.6) tt = time; return { thr: 1 }; }, 40); return tt; })();
  tab[id] = { road: topOn(id, 'road'), steppe: topOn(id, 'steppe'), mud: topOn(id, 'mud'), snow: topOn(id, 'snow'), rev: kmh(sim(id, 'road', () => ({ thr: -1 }), 30).maxV), t30: t30 && r1(t30), spec: kmh(D[id].top), gearsTop: z.t.gear };
}
if (process.argv.includes('--table')) console.table(tab);
check('Panther ≈ 46 km/h on road', Math.abs(tab.medium.road - 46) < 2.5, tab.medium.road);
check('Panther 22-32 km/h on grass', tab.medium.steppe > 22 && tab.medium.steppe < 32, tab.medium.steppe);
check('Panther 11-19 km/h in mud', tab.medium.mud > 11 && tab.medium.mud < 19, tab.medium.mud);
check('Lynx reaches ≈ 60 km/h on road', tab.light.road > 54, tab.light.road);
check('reverse speeds are WWII-slow (Panther < 5, Tiger < 10 km/h)', tab.medium.rev < 5 && tab.heavy.rev < 10 && tab.pz4.rev < 6, [tab.medium.rev, tab.heavy.rev, tab.pz4.rev]);
check('0-30 km/h on a dirt track: Panther and Lynx 10-25 s, Tigers slower', tab.medium.t30 > 10 && tab.medium.t30 < 25 && tab.light.t30 < 25 && tab.heavy.t30 > tab.medium.t30 && (tab.kingtiger.t30 == null || tab.kingtiger.t30 > tab.medium.t30), [tab.light.t30, tab.medium.t30, tab.heavy.t30, tab.kingtiger.t30]);
// roue libre et freinage depuis 40 km/h (piste)
for (const id of ['light', 'medium']) {
  const go = () => { const t = sim(id, 'road', full, 40).t; t.speed = 40 / 3.6; t.x = 0; t.y = 0; t.a = 0; return t; };
  const stop = t => Math.abs(t.speed) < 0.05; const coast = () => ({ thr: 0 }); coast.stop = stop; const brk = () => ({ thr: 0, brake: true }); brk.stop = stop;
  const dc = sim(id, 'track', coast, 60, go()).t.x, db = sim(id, 'track', brk, 60, go()).t.x;
  check(`${id}: coasting from 40 km/h takes 40-90 m, braking 9-16 m`, dc > 40 && dc < 90 && db > 9 && db < 16, [r1(dc), r1(db)]);
}
// pivots : le Panther pivote au point mort à ≈ 20-25 °/s ; le Pz IV ne pivote pas sur place
{
  const p = sim('medium', 'steppe', () => ({ turn: 1 }), 6);
  check('Panther neutral pivot 15-26 °/s', p.maxW * 57.3 > 15 && p.maxW * 57.3 < 26 && Math.hypot(p.t.x, p.t.y) < 0.5, [r1(p.maxW * 57.3), r1(Math.hypot(p.t.x, p.t.y))]);
  const q = sim('pz4', 'steppe', () => ({ turn: 1 }), 6);
  check('Pz IV walks around a braked track instead of spinning', Math.hypot(q.t.x, q.t.y) > 0.5 && q.maxW > 0.2, [r1(q.maxW * 57.3), r1(Math.hypot(q.t.x, q.t.y))]);
}
// adhérence latérale en virage serré à pleine vitesse
for (const id of ['light', 'medium', 'pz4']) {
  const z = sim(id, 'steppe', (t, time) => ({ thr: 1, turn: time > 20 ? 1 : 0 }), 30);
  check(`${id}: lateral acceleration ≤ 0.8 g in a full turn`, z.maxLat < 0.8 * 9.81, r1(z.maxLat / 9.81));
}
// boîtes orientées
{
  const A = V.box(0, 0, 0, 3, 1.5), B = V.box(5.5, 0, 0, 3, 1.5), C = V.box(5.5, 0, Math.PI / 2, 3, 1.5);
  const h = V.sat(A, B);
  check('OBB overlap along x (0.5 m)', h && Math.abs(h.d - 0.5) < 1e-9 && h.nx === -1, h);
  check('OBB rotated separation', V.sat(A, C) === null && !!V.sat(V.box(0, 0, 0.3, 3, 1.5), V.box(4, 1, 1.2, 3, 1.5)));
}
console.log(failed ? `${failed} FAILED` : 'ALL OK');
process.exit(failed ? 1 : 0);
