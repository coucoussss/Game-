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
function press(w: World, input: PlayerInput, key: 'interact' | 'fire' | 'reload'): WorldEvent[] {
  return [...run(w, { ...input, [key]: true }, DT), ...run(w, input, DT)];
}

/** Règle l'heure et replace tout le monde à son poste. */
function setHour(w: World, day: number, hour: number): void {
  w.clock.seconds = (day - 1) * SECONDS_PER_DAY + hour * 3600;
  w.sleep();
  w.clock.seconds = (day - 1) * SECONDS_PER_DAY + hour * 3600;
  (w as unknown as { settleEveryone(): void }).settleEveryone();
  w.step(0, IDLE_INPUT);
  w.drainEvents();
}

function give(w: World, ...ids: ItemId[]): void {
  for (const id of ids) w.inventory.add(id);
}

function reports(events: WorldEvent[]): Report[] {
  return events.flatMap((e) => (e.type === 'report' ? [e.report] : []));
}

/** Rentre à la planque et attend que tout se calme. */
function goHome(w: World, seconds = 130): Report[] {
  return reports(run(w, standAt(w, data.level.spawn, [-45, -12]), seconds));
}

describe('World : début de partie', () => {
  it('commence sans rien, dans la planque, avec une dette', () => {
    const w = new World(data);
    expect(w.inHideout()).toBe(true);
    expect(w.inventory.cash).toBe(0);
    expect(w.inventory.items).toEqual([]);
    expect(w.debtLeft).toBe(data.rules.debt);
  });

  it('trouve 40 $ dans le manteau et un pied-de-biche dans la benne', () => {
    const w = new World(data);
    press(w, standAt(w, [-48.7, -6], [-49.7, -6]), 'interact');
    expect(w.inventory.cash).toBe(40);
    press(w, standAt(w, [-2, -15], [-2, -15.9]), 'interact');
    expect(w.inventory.has('crowbar')).toBe(true);
    press(w, standAt(w, [-48.7, -6], [-49.7, -6]), 'interact');
    expect(w.inventory.cash).toBe(40);
  });

  it('marche sans traverser les murs', () => {
    const w = new World(data);
    run(w, { ...standAt(w, [-45, -9], [-45, -20]), forward: 1 }, 5);
    expect(w.player.pos.z).toBeGreaterThan(-13.8);
  });

  it('note dans le carnet ce que le joueur regarde', () => {
    const w = new World(data);
    const events = run(w, standAt(w, [-14, -6], [-8.6, -4.6], 2.8), 1.5);
    expect(events.some((e) => e.type === 'intel' && e.def.id === 'store-camera')).toBe(true);
  });

  it('les petits vols : un coffre de voiture rapporte quelques billets', () => {
    const w = new World(data);
    give(w, 'crowbar');
    setHour(w, 1, 2);
    w.inventory.held = 'crowbar';
    run(w, { ...standAt(w, [-60.3, 2], [-60.3, 3.3], 0.9), interact: true }, 3);
    expect(w.inventory.dirty).toBeGreaterThanOrEqual(30);
    expect(w.inventory.dirty).toBeLessThanOrEqual(90);
  });
});

describe('World : supérette', () => {
  it('de nuit, courant coupé, le coup passe inaperçu', () => {
    const w = new World(data);
    give(w, 'crowbar', 'wire-cutters');
    setHour(w, 1, 23.5);
    expect(w.npc('clerk')?.present).toBe(false);

    w.inventory.held = 'wire-cutters';
    run(w, { ...standAt(w, [-14, -15], [-14, -14.15], 1.5), interact: true }, 3);
    expect(w.site('store')?.powered).toBe(false);

    w.inventory.held = 'crowbar';
    run(w, { ...standAt(w, [-9.5, -15], [-9.5, -13.9]), interact: true }, 4);
    expect(w.doorOpen('store-back')).toBe(true);
    expect(w.police.state).toBe('idle');

    run(w, { ...standAt(w, [-19.3, -12], [-19.3, -12.8], 0.7), interact: true }, 9);
    expect(w.inventory.dirty).toBeGreaterThanOrEqual(500);
    expect(w.police.state).toBe('idle');

    const [report] = goHome(w, 5);
    expect(report?.success).toBe(true);
    expect(report?.site).toBe('store');
    expect(report?.calls).toEqual([]);
    expect(w.stats.heists).toBe(1);
  });

  it('improvisé, la porte déclenche l’alarme', () => {
    const w = new World(data);
    give(w, 'crowbar');
    setHour(w, 1, 23.5);
    w.inventory.held = 'crowbar';
    const events = run(w, { ...standAt(w, [-9.5, -15], [-9.5, -13.9]), interact: true }, 4);
    expect(events.some((e) => e.type === 'alarm')).toBe(true);
    expect(w.police.state).toBe('en-route');
    expect(w.police.loud).toBe(true);
  });

  it('les crochets ouvrent sans bruit, mais le contact d’alarme sonne quand même', () => {
    const w = new World(data);
    give(w, 'lockpicks');
    setHour(w, 1, 23.5);
    w.inventory.held = 'lockpicks';
    run(w, { ...standAt(w, [-9.5, -15], [-9.5, -13.9]), interact: true }, 5);
    expect(w.noisy).toBe(false);
    run(w, { ...standAt(w, [-9.5, -15], [-9.5, -13.9]), interact: true }, 2);
    expect(w.doorOpen('store-back')).toBe(true);
    expect(w.site('store')?.alarm).toBeGreaterThan(0);
  });

  it('de jour, l’employé menacé lève les mains ; la caméra donne l’alerte en silence', () => {
    const w = new World(data);
    give(w, 'pistol', 'ski-mask');
    setHour(w, 2, 9);
    w.inventory.worn.add('ski-mask');
    w.inventory.held = 'pistol';
    run(w, { ...standAt(w, [-16, -6.5], [-16, -9]), aim: true }, 1);
    expect(w.npc('clerk')?.compliant).toBeGreaterThan(0);
    press(w, standAt(w, [-16, -6.8], [-16, -7.8], 1.15), 'interact');
    expect(w.inventory.dirty).toBeGreaterThan(0);
    expect(w.police.state).toBe('en-route');
    expect(w.police.loud).toBe(false);
    expect(w.incident?.identified).toBe(false);
    const loot = w.inventory.dirty;
    const [report] = goHome(w);
    expect(report?.success).toBe(true);
    expect(report?.loot).toBe(loot);
    expect(report?.calls.length).toBeGreaterThan(0);
  });

  it('à visage découvert, le braqueur est identifié et recherché', () => {
    const w = new World(data);
    give(w, 'pistol');
    setHour(w, 2, 9);
    w.inventory.held = 'pistol';
    run(w, { ...standAt(w, [-16, -6.5], [-16, -9]), aim: true }, 1);
    expect(w.incident?.identified).toBe(true);
    expect(w.wanted).toBe(true);
  });

  it('le coffre reçoit la recette à la fermeture', () => {
    const w = new World(data);
    setHour(w, 2, 21.95);
    run(w, standAt(w, data.level.spawn, [-45, -12]), 100);
    expect(w.npc('clerk')?.present).toBe(false);
    expect(w.containers.get('store-safe')?.amount).toBeGreaterThan(500);
  });

  it('une arme à la main en pleine rue alerte les passants', () => {
    const w = new World(data);
    give(w, 'pistol');
    setHour(w, 2, 12);
    w.inventory.held = 'pistol';
    const ped = w.npc('ped-1');
    if (!ped) throw new Error('passant introuvable');
    run(w, IDLE_INPUT, DT);
    const f = ped.facing;
    run(w, standAt(w, [ped.pos.x + Math.cos(f) * 4, ped.pos.z + Math.sin(f) * 4], [ped.pos.x, ped.pos.z]), 0.5);
    expect(ped.suspicion).toBeGreaterThan(0);
  });
});

describe('World : bijouterie', () => {
  it('briser une vitrine sous tension déclenche l’alarme ; crocheter, non', () => {
    const smash = new World(data);
    give(smash, 'crowbar');
    setHour(smash, 1, 2);
    smash.inventory.held = 'crowbar';
    const events = run(smash, { ...standAt(smash, [10.5, -5.2], [10.5, -6.2], 1.0), interact: true }, 2);
    expect(events.some((e) => e.type === 'glass')).toBe(true);
    expect(smash.site('jewelry')?.alarm).toBeGreaterThan(0);
    expect(smash.inventory.dirty).toBeGreaterThan(0);

    const pick = new World(data);
    give(pick, 'lockpicks');
    setHour(pick, 1, 2);
    pick.site('jewelry')!.powered = false;
    pick.inventory.held = 'lockpicks';
    run(pick, { ...standAt(pick, [10.5, -5.2], [10.5, -6.2], 1.0), interact: true }, 6);
    expect(pick.inventory.dirty).toBeGreaterThan(0);
    expect(pick.site('jewelry')?.alarm).toBe(0);
    expect(pick.police.state).toBe('idle');
  });

  it('le boîtier cadenassé doit être ouvert avant de couper', () => {
    const w = new World(data);
    give(w, 'lockpicks', 'wire-cutters');
    setHour(w, 1, 2);
    const at = standAt(w, [12, -15], [12, -14.15], 1.5);
    w.inventory.held = 'wire-cutters';
    run(w, { ...at, interact: true }, 3);
    expect(w.site('jewelry')?.powered).toBe(true);
    w.inventory.held = 'lockpicks';
    run(w, { ...at, interact: true }, 5);
    expect(w.site('jewelry')?.fuseUnlocked).toBe(true);
    w.inventory.held = 'wire-cutters';
    run(w, { ...at, interact: true }, 3);
    expect(w.site('jewelry')?.powered).toBe(false);
  });

  it('sans sac, les poches débordent vite', () => {
    const w = new World(data);
    w.inventory.dirty = data.rules.carryBase - 100;
    expect(w.carryRoom).toBe(100);
    give(w, 'duffel-bag');
    expect(w.carryRoom).toBeGreaterThan(5000);
  });

  it('le vigile visé par surprise se rend ; sinon il dégaine', () => {
    const surprise = new World(data);
    give(surprise, 'pistol');
    setHour(surprise, 2, 12);
    surprise.inventory.held = 'pistol';
    surprise.inventory.mag = 8;
    const guard = surprise.npc('jewel-guard');
    if (!guard) throw new Error('vigile introuvable');
    // Dans son dos.
    run(surprise, { ...standAt(surprise, [19.5, -4.6], [17.8, -5.2]), aim: true }, 0.3);
    expect(guard.compliant).toBeGreaterThan(0);
    expect(guard.hostile).toBe(false);

    const clumsy = new World(data);
    give(clumsy, 'crowbar');
    setHour(clumsy, 2, 12);
    clumsy.inventory.held = 'crowbar';
    const g2 = clumsy.npc('jewel-guard');
    // Brise une vitrine sous ses yeux.
    run(clumsy, { ...standAt(clumsy, [13, -5.2], [13, -6.2], 1.0), interact: true }, 0.5);
    expect(g2?.hostile).toBe(true);
    // Désarmé face à lui, le joueur se fait arrêter.
    const events = run(clumsy, standAt(clumsy, [13, -5.2], [13, -6.2], 1.0), 4);
    expect(reports(events)[0]?.cause).toBe('arrested');
  });

  it('un coup de pied-de-biche dans le dos assomme', () => {
    const w = new World(data);
    give(w, 'crowbar');
    setHour(w, 2, 12);
    w.inventory.held = 'crowbar';
    const guard = w.npc('jewel-guard');
    if (!guard) throw new Error('vigile introuvable');
    guard.facing = Math.PI;
    const events = press(w, standAt(w, [19.4, -5.2], [17.8, -5.2]), 'fire');
    expect(guard.down).toBe('ko');
    expect(events.some((e) => e.type === 'npc-down')).toBe(true);
  });
});

describe('World : banque', () => {
  it('la perceuse ouvre la chambre forte, et le sac limite le butin', () => {
    const w = new World(data);
    give(w, 'drill', 'duffel-bag');
    setHour(w, 1, 2);
    const site = w.site('bank');
    if (!site) throw new Error('banque introuvable');
    site.powered = false;
    // Personne pour entendre : ni vigile, ni veilleur.
    w.npc('bank-night-guard')!.down = 'ko';
    w.npc('watchman')!.down = 'ko';
    w.inventory.held = 'drill';
    const at = standAt(w, [43.75, -10.4], [43.75, -11.3]);
    run(w, { ...at, interact: true }, 3.5);
    expect(site.drill).not.toBeNull();
    expect(w.inventory.has('drill')).toBe(false);
    const events = run(w, at, data.rules.drillTime + 1);
    expect(events.some((e) => e.type === 'vault-open')).toBe(true);
    expect(w.doorOpen('bank-vault')).toBe(true);
    expect(w.inventory.has('drill')).toBe(true);

    run(w, { ...standAt(w, [42.9, -12.0], [42.9, -12.6], 0.9), interact: true }, 5);
    expect(w.inventory.dirty).toBe(9000);
    run(w, { ...standAt(w, [40.5, -12.4], [40.5, -13.2]), interact: true }, 1);
    expect(w.prompt).toMatch(/pied-de-biche/);
  });

  it('sous tension, percer la chambre forte déclenche l’alarme', () => {
    const w = new World(data);
    give(w, 'drill');
    setHour(w, 1, 2);
    w.npc('bank-night-guard')!.present = false;
    w.inventory.held = 'drill';
    run(w, { ...standAt(w, [43.75, -10.4], [43.75, -11.3]), interact: true }, 3.5);
    expect(w.site('bank')?.alarm).toBeGreaterThan(0);
    expect(w.police.state).toBe('en-route');
  });

  it('un guichetier menacé remet sa caisse', () => {
    const w = new World(data);
    give(w, 'pistol');
    setHour(w, 2, 11);
    w.inventory.held = 'pistol';
    const at = standAt(w, [50, -7.8], [50, -10.2]);
    run(w, at, DT);
    expect(w.prompt).toMatch(/menace/);
    run(w, { ...at, aim: true }, 0.3);
    expect(w.npc('teller-2')?.compliant).toBeGreaterThan(0);
    press(w, standAt(w, [50, -7.8], [50, -8.8], 1.1), 'interact');
    expect(w.inventory.dirty).toBe(600);
  });

  it('le vigile de nuit vient voir d’où vient le bruit', () => {
    const w = new World(data);
    give(w, 'crowbar');
    setHour(w, 1, 2);
    const guard = w.npc('bank-night-guard');
    if (!guard) throw new Error('vigile introuvable');
    w.site('bank')!.powered = false;
    w.inventory.held = 'crowbar';
    guard.pos.x = 58;
    guard.pos.z = -11;
    run(w, { ...standAt(w, [59.5, -15], [59.5, -13.9]), interact: true }, 2.8);
    expect(guard.investigating || guard.hostile).toBe(true);
  });
});

describe('World : police et combat', () => {
  function alarmAt(w: World): void {
    give(w, 'crowbar');
    setHour(w, 1, 23.5);
    w.inventory.held = 'crowbar';
    run(w, { ...standAt(w, [-9.5, -15], [-9.5, -13.9]), interact: true }, 4);
  }

  it('la police arrive plus vite sur une grosse cible', () => {
    const w = new World(data);
    expect(w.police.etaFor(0, 3)).toBeLessThan(w.police.etaFor(0, 1));
  });

  it('des policiers descendent de voiture et arrêtent un joueur désarmé', () => {
    const w = new World(data);
    alarmAt(w);
    w.inventory.held = null;
    w.inventory.cash = 30;
    const events = run(w, standAt(w, [-14, -1.5], [-14, 3]), data.rules.policeEta + 12);
    const [report] = reports(events);
    expect(report?.success).toBe(false);
    expect(report?.cause).toBe('arrested');
    expect(report?.lost).toContain('crowbar');
    expect(w.inventory.items).toEqual([]);
    expect(w.inventory.cash).toBe(30);
    expect(w.inHideout()).toBe(true);
    expect(w.stats.arrests).toBe(1);
  });

  it('caché dans la planque, le joueur laisse passer l’orage', () => {
    const w = new World(data);
    alarmAt(w);
    const [report] = goHome(w, 150);
    expect(report?.success).toBe(true);
    expect(report?.policeCame).toBe(true);
    expect(w.officers).toEqual([]);
  });

  it('les policiers tirent sur un joueur armé, et le gilet encaisse', () => {
    const bare = new World(data);
    bare.hurt(20);
    expect(bare.player.hp).toBe(80);

    const armored = new World(data);
    give(armored, 'plate-carrier');
    armored.inventory.armor = 100;
    armored.inventory.worn.add('plate-carrier');
    armored.hurt(20);
    expect(armored.player.hp).toBe(95);
    expect(armored.inventory.armor).toBe(85);

    const w = new World(data);
    alarmAt(w);
    give(w, 'pistol');
    w.inventory.held = 'pistol';
    const events = run(w, standAt(w, [-14, -1.5], [-14, 3]), data.rules.policeEta + 25);
    expect(events.some((e) => e.type === 'shot' && e.by === 'npc')).toBe(true);
    expect(events.some((e) => e.type === 'hurt')).toBe(true);
  });

  it('abattu, le joueur perd tout et paie l’hôpital', () => {
    const w = new World(data);
    w.inventory.cash = 100;
    give(w, 'pistol');
    w.hurt(500);
    const [report] = reports(w.drainEvents());
    expect(report?.cause).toBe('shot');
    expect(w.inventory.cash).toBe(70);
    expect(w.player.hp).toBe(data.rules.playerHealth);
  });

  it('tirer vide le chargeur, alerte tout le quartier et fait des victimes', () => {
    const w = new World(data);
    give(w, 'pistol');
    setHour(w, 2, 12);
    w.inventory.held = 'pistol';
    w.inventory.mag = 2;
    w.inventory.ammo = 8;
    const guard = w.npc('jewel-guard');
    if (!guard) throw new Error('vigile introuvable');
    const at = standAt(w, [19.5, -4.6], [guard.pos.x, guard.pos.z], 1.2);
    press(w, at, 'fire');
    expect(w.inventory.mag).toBe(1);
    expect(guard.hp).toBeLessThan(100);
    run(w, at, 0.4);
    const events = press(w, standAt(w, [19.5, -4.6], [guard.pos.x, guard.pos.z], 1.2), 'fire');
    expect(guard.down).toBe('dead');
    expect(events.some((e) => e.type === 'npc-down' && e.dead)).toBe(true);
    expect(w.incident?.victims).toBe(1);
    expect(w.heat).toBeGreaterThanOrEqual(data.rules.heatPerVictim);
    // Chargeur vide : le clic suivant recharge.
    run(w, at, 0.4);
    const reload = press(w, at, 'fire');
    expect(reload.some((e) => e.type === 'reload')).toBe(true);
    run(w, at, 1.6);
    expect(w.inventory.mag).toBe(8);
  });
});

describe('World : économie, temps et sauvegarde', () => {
  it('blanchit, achète du matériel débloqué, des balles et des plaques', () => {
    const w = new World(data);
    expect(w.buy('pistol')).toMatch(/preuves/);
    w.inventory.dirty = 4000;
    w.launder();
    expect(w.inventory.cash).toBe(3000);
    expect(w.buy('pistol')).toMatch(/vendu/);
    expect(w.inventory.mag).toBe(data.rules.magazine);
    w.buyAmmo();
    expect(w.inventory.ammo).toBe(data.rules.magazine);
    expect(w.buy('plate-carrier')).toMatch(/vendu/);
    expect(w.inventory.armor).toBe(data.rules.armorPoints);
    expect(w.buyPlates()).toMatch(/intactes/);
  });

  it('solder la dette termine la partie', () => {
    const w = new World(data);
    w.inventory.cash = 5000;
    expect(w.payDebt()).toMatch(/reste/);
    expect(w.debtLeft).toBe(data.rules.debt - 5000);
    w.inventory.cash = data.rules.debt;
    w.payDebt();
    expect(w.debtLeft).toBe(0);
    expect(w.drainEvents().some((e) => e.type === 'win')).toBe(true);
    expect(w.inventory.cash).toBe(5000);
  });

  it('dormir fait avancer jusqu’au matin ou à la nuit, et soigne', () => {
    const w = new World(data);
    w.player.hp = 40;
    w.sleep();
    expect(w.clock.hour).toBeCloseTo(23);
    expect(w.player.hp).toBe(data.rules.playerHealth);
    w.sleep();
    expect(w.clock.hour).toBeCloseTo(8);
    expect(w.npc('clerk')?.present).toBe(true);
  });

  it('les contenants vidés se remplissent après quelques jours', () => {
    const w = new World(data);
    const safe = w.containers.get('jewel-safe');
    if (!safe) throw new Error('coffre introuvable');
    safe.amount = 0;
    safe.emptiedDay = w.clock.day;
    w.sleep();
    w.sleep();
    expect(safe.amount).toBe(0);
    for (let i = 0; i < 6; i++) w.sleep();
    expect(safe.amount).toBe(2500);
  });

  it('une sauvegarde restitue la progression', () => {
    const w = new World(data);
    give(w, 'crowbar', 'ski-mask', 'plate-carrier');
    w.inventory.cash = 321;
    w.inventory.dirty = 50;
    w.inventory.laundered = 900;
    w.inventory.worn.add('ski-mask');
    w.inventory.armor = 60;
    w.heat = 33;
    w.debtPaid = 1200;
    w.used.add('coat');
    w.notebook.learn('store-camera', 5);
    w.stats.heists = 3;
    w.sleep();
    const save = JSON.parse(JSON.stringify(w.snapshot())) as ReturnType<World['snapshot']>;
    const r = World.restore(data, save);
    if (!r) throw new Error('restauration refusée');
    expect(r.clock.seconds).toBe(w.clock.seconds);
    expect(r.inventory.items).toEqual(['crowbar', 'ski-mask', 'plate-carrier']);
    expect(r.inventory.cash).toBe(321);
    expect(r.inventory.laundered).toBe(900);
    expect(r.inventory.masked()).toBe(true);
    expect(r.inventory.armor).toBe(60);
    expect(r.debtLeft).toBe(data.rules.debt - 1200);
    expect(r.used.has('coat')).toBe(true);
    expect(r.notebook.has('store-camera')).toBe(true);
    expect(r.stats.heists).toBe(3);
    expect(World.restore(data, { ...save, v: 1 })).toBeNull();
  });
});
