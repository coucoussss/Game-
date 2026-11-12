import { describe, expect, it } from 'vitest';
import { loadGameData } from '../data';
import type { ItemId, Vec2 } from '../data/types';
import { SECONDS_PER_DAY } from './Clock';
import { bearing } from './geometry';
import { IDLE_INPUT, type PlayerInput, type Report, World, type WorldEvent } from './World';

const data = loadGameData();
const DT = 0.05;

/** Place le joueur et le tourne vers un point. */
function standAt(w: World, at: Vec2, lookAt: Vec2, y = 1.2): PlayerInput {
  w.player.pos = { x: at[0], z: at[1] };
  const facing = bearing(w.player.pos, { x: lookAt[0], z: lookAt[1] });
  const flat = Math.hypot(lookAt[0] - at[0], lookAt[1] - at[1]);
  const pitch = Math.atan2(y - w.eyeHeight(), flat);
  return { ...IDLE_INPUT, facing, pitch };
}

function run(w: World, input: PlayerInput, seconds: number): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    w.step(DT, input);
    events.push(...w.drainEvents());
  }
  return events;
}

/** Une pression brève sur une touche (appui puis relâchement). */
function press(w: World, input: PlayerInput, key: 'interact' | 'use'): WorldEvent[] {
  return [...run(w, { ...input, [key]: true }, DT), ...run(w, input, DT)];
}

function setHour(w: World, day: number, hour: number): void {
  w.clock.seconds = (day - 1) * SECONDS_PER_DAY + hour * 3600;
  w.step(0, IDLE_INPUT);
  w.clerk.settle(w.clock.hour);
}

function give(w: World, ...ids: ItemId[]): void {
  for (const id of ids) w.inventory.add(id);
}

function hold(w: World, id: ItemId): void {
  w.inventory.held = id;
}

function reports(events: WorldEvent[]): Report[] {
  return events.flatMap((e) => (e.type === 'report' ? [e.report] : []));
}

/** Rentre à la planque et attend que tout se calme. */
function goHome(w: World): Report[] {
  const input = standAt(w, data.level.spawn, [-15, -12]);
  return reports(run(w, input, 120));
}

describe('World : début de partie', () => {
  it('commence sans rien, dans la planque', () => {
    const w = new World(data);
    expect(w.inHideout()).toBe(true);
    expect(w.inventory.cash).toBe(0);
    expect(w.inventory.items).toEqual([]);
  });

  it('trouve 40 $ dans le manteau et un pied-de-biche dans la benne', () => {
    const w = new World(data);
    press(w, standAt(w, [-18.5, -6], [-19.5, -6]), 'interact');
    expect(w.inventory.cash).toBe(40);
    press(w, standAt(w, [17.2, -14.6], [17.2, -15.6]), 'interact');
    expect(w.inventory.has('crowbar')).toBe(true);
    // On ne fouille qu'une fois.
    press(w, standAt(w, [-18.5, -6], [-19.5, -6]), 'interact');
    expect(w.inventory.cash).toBe(40);
  });

  it('marche sans traverser les murs', () => {
    const w = new World(data);
    const input = { ...standAt(w, [-15, -9], [-15, -20]), forward: 1 };
    run(w, input, 5);
    expect(w.player.pos.z).toBeGreaterThan(-13.8);
  });

  it('note dans le carnet ce que le joueur regarde', () => {
    const w = new World(data);
    const events = run(w, standAt(w, [8, -6], [13.4, -4.6], 2.8), 1.5);
    expect(events.some((e) => e.type === 'intel' && e.def.id === 'camera')).toBe(true);
  });
});

describe('World : cambriolage de nuit', () => {
  it('préparé (courant coupé), il passe inaperçu', () => {
    const w = new World(data);
    give(w, 'crowbar', 'wire-cutters');
    setHour(w, 1, 23.5);
    expect(w.clerk.present).toBe(false);

    hold(w, 'wire-cutters');
    run(w, { ...standAt(w, [8, -15], [8, -14.15], 1.5), interact: true }, 3);
    expect(w.powered).toBe(false);

    hold(w, 'crowbar');
    run(w, { ...standAt(w, [12.5, -15], [12.5, -13.9]), interact: true }, 4);
    expect(w.doorOpen('store-back')).toBe(true);
    expect(w.police.state).toBe('idle');

    run(w, { ...standAt(w, [2.9, -12], [2.9, -12.8], 1.0), interact: true }, 9);
    expect(w.inventory.dirty).toBeGreaterThanOrEqual(data.rules.safeBase);
    expect(w.police.state).toBe('idle');

    const [report] = goHome(w);
    expect(report?.success).toBe(true);
    expect(report?.calls).toEqual([]);
    expect(report?.identified).toBe(false);
  });

  it('improvisé, la porte déclenche l’alarme', () => {
    const w = new World(data);
    give(w, 'crowbar');
    setHour(w, 1, 23.5);
    hold(w, 'crowbar');
    const events = run(w, { ...standAt(w, [12.5, -15], [12.5, -13.9]), interact: true }, 4);
    expect(events.some((e) => e.type === 'alarm')).toBe(true);
    expect(w.police.state).toBe('en-route');
    expect(w.police.loud).toBe(true);
  });

  it('pris sur place quand la police arrive : tout est confisqué', () => {
    const w = new World(data);
    give(w, 'crowbar', 'ski-mask');
    w.inventory.cash = 30;
    setHour(w, 1, 23.5);
    hold(w, 'crowbar');
    run(w, { ...standAt(w, [12.5, -15], [12.5, -13.9]), interact: true }, 4);
    const events = run(w, standAt(w, [8, -9], [8, -12]), data.rules.policeEta + 2);
    const [report] = reports(events);
    expect(report?.success).toBe(false);
    expect(report?.lost).toContain('crowbar');
    expect(w.inventory.items).toEqual([]);
    expect(w.inventory.cash).toBe(30);
    expect(w.inHideout()).toBe(true);
    expect(w.clock.hour).toBeCloseTo(8, 0);
  });
});

describe('World : braquage de jour', () => {
  function robRegister(masked: boolean): { w: World; events: WorldEvent[] } {
    const w = new World(data);
    give(w, 'pistol', 'ski-mask');
    setHour(w, 2, 9);
    if (masked) w.inventory.worn.add('ski-mask');
    hold(w, 'pistol');
    const aim = standAt(w, [6, -6.5], [6, -9]);
    const events = run(w, { ...aim, use: true }, 1);
    expect(w.clerkWitness.compliant).toBeGreaterThan(0);
    events.push(...press(w, standAt(w, [6, -6.8], [6, -7.8], 1.15), 'interact'));
    return { w, events };
  }

  it('l’employé lève les mains, la caisse est vidée, mais la caméra a tout vu', () => {
    const { w } = robRegister(true);
    expect(w.inventory.dirty).toBeGreaterThan(0);
    // L'alerte est silencieuse : la police vient sans que le joueur l'entende.
    expect(w.police.state).toBe('en-route');
    expect(w.police.loud).toBe(false);
    expect(w.incident?.identified).toBe(false);
  });

  it('à visage découvert, le braqueur est identifié et recherché', () => {
    const { w } = robRegister(false);
    expect(w.incident?.identified).toBe(true);
    expect(w.wanted).toBe(true);
    expect(w.heat).toBeGreaterThan(0);
  });

  it('en fuyant à temps, le coup réussit', () => {
    const { w } = robRegister(true);
    const loot = w.inventory.dirty;
    const [report] = goHome(w);
    expect(report?.success).toBe(true);
    expect(report?.loot).toBe(loot);
    expect(report?.calls.length).toBeGreaterThan(0);
  });

  it('une arme à la main en pleine rue alerte les passants', () => {
    const w = new World(data);
    give(w, 'pistol');
    setHour(w, 2, 12);
    hold(w, 'pistol');
    run(w, IDLE_INPUT, DT);
    const p = w.pedestrian.pos;
    const f = w.pedestrian.facing;
    // Sur le chemin du passant, à quelques mètres devant lui.
    const input = standAt(w, [p.x + Math.cos(f) * 4, p.z + Math.sin(f) * 4], [p.x, p.z]);
    run(w, input, 0.5);
    expect(w.pedestrianWitness.suspicion).toBeGreaterThan(0);
  });
});

describe('World : économie et temps', () => {
  it('blanchit l’argent sale auprès du Fourgue', () => {
    const w = new World(data);
    w.inventory.dirty = 400;
    w.launder();
    expect(w.inventory.cash).toBe(300);
    expect(w.buy('pistol')).toMatch(/acheté/);
    expect(w.inventory.cash).toBe(120);
  });

  it('dormir fait avancer jusqu’à l’ouverture ou la nuit', () => {
    const w = new World(data);
    w.sleep();
    expect(w.clock.hour).toBeCloseTo(23);
    w.sleep();
    expect(w.clock.hour).toBeCloseTo(8);
    expect(w.storeOpen).toBe(true);
    expect(w.clerk.present).toBe(true);
  });

  it('le coffre se remplit de la caisse à la fermeture', () => {
    const w = new World(data);
    setHour(w, 2, 21.95);
    run(w, standAt(w, data.level.spawn, [-15, -12]), 60);
    expect(w.clerk.present).toBe(false);
    expect(w.safe).toBeGreaterThan(data.rules.safeBase);
    expect(w.register).toBe(0);
  });
});
