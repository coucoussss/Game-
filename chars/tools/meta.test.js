'use strict';
// Tests unitaires du méta-jeu (meta.js) sous Node, sans navigateur : profil, migration, économie, jour.
// Usage : node --test tools/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'meta.js'), 'utf8') + '\n;globalThis.Meta = Meta;';
// meta.js chargé dans un bac à sable : stockage local en mémoire, SDK CrazyGames simulé ou absent
function load(o = {}) {
  const store = new Map(Object.entries(o.local || {}));
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k),
    key: i => [...store.keys()][i] ?? null, get length() { return store.size; },
  };
  // Object.keys(localStorage) liste les clés, comme dans un navigateur
  const ls = new Proxy(localStorage, { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: (t, k) => (store.has(k) ? { enumerable: true, configurable: true, value: store.get(k) } : undefined) });
  const cloud = new Map(Object.entries(o.cloud || {}));
  const log = [];
  const SDK = o.sdk === false ? null : {
    environment: 'crazygames', init: async () => {},
    game: { loadingStart: () => log.push('loadingStart'), loadingStop: () => log.push('loadingStop'), gameplayStart: () => log.push('gameplayStart'), gameplayStop: () => log.push('gameplayStop'), happytime: () => log.push('happytime'), settings: { muteAudio: !!o.mute }, addSettingsChangeListener: () => {} },
    data: { getItem: k => (cloud.has(k) ? cloud.get(k) : null), setItem: (k, v) => cloud.set(k, String(v)), removeItem: k => cloud.delete(k) },
    ad: { requestAd: (t, cb) => { log.push('ad:' + t); setTimeout(() => { log.push('adFinished'); cb.adFinished(); }, 1); } },
  };
  const ctx = { console, setTimeout, clearTimeout, Date, Math, JSON, Promise, localStorage: ls, document: { getElementById: () => null }, window: { CrazyGames: SDK ? { SDK } : undefined } };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { Meta: ctx.Meta, store, cloud, log };
}

test('profil neuf : valeurs de départ et version 2', async () => {
  const { Meta } = load();
  await Meta.init();
  assert.strictEqual(Meta.P.v, 2);
  assert.deepStrictEqual([...Meta.P.tanks].sort(), ['light', 'pz4']);
  assert.strictEqual(Meta.P.credits, 600 + Meta.STREAK[0]); // prime du premier jour
});

test('migration v1 : campagne et record de survie repris des anciennes clés, puis supprimées', async () => {
  const v1 = JSON.stringify({ v: 1, credits: 5000, tanks: ['pz4', 'kingtiger', 'ghost'], skins: ['std', 'tigre'] });
  const { Meta, store, cloud } = load({ local: { 'frontdacier.profil': v1, 'frontdacier.unlocked': '3', 'frontdacier.survie': '7' } });
  await Meta.init();
  assert.strictEqual(Meta.P.unlocked, 3);
  assert.strictEqual(Meta.P.survBest, 7);
  assert.ok(Meta.P.tanks.includes('light') && Meta.P.tanks.includes('kingtiger') && !Meta.P.tanks.includes('ghost'));
  assert.ok(!store.has('frontdacier.unlocked') && !store.has('frontdacier.survie'));
  assert.strictEqual(JSON.parse(cloud.get('frontdacier.profil')).unlocked, 3); // sauvegardé dans le nuage
});

test('profils abîmés : toujours un profil utilisable', () => {
  const { Meta } = load();
  for (const raw of ['{"credits":', 'null', '[1,2]', JSON.stringify({ tanks: null, credits: -9, level: 'x', opts: 4, missions: 'm' })]) {
    const p = Meta.parse(raw);
    assert.ok(p.tanks.includes('pz4') && p.tanks.includes('light'), raw);
    assert.ok(Number.isFinite(p.credits) && p.credits >= 0 && p.level >= 1, raw);
    assert.ok(Array.isArray(p.missions) && Array.isArray(p.skins), raw);
  }
});

test('effacement : nuage et clés locales vidés, réglages gardés', async () => {
  const { Meta, store, cloud } = load({ local: { 'frontdacier.unlocked': '2' } });
  await Meta.init();
  Meta.P.credits = 77777; Meta.P.opts.sfx = 0.3; Meta.save();
  Meta.reset();
  assert.strictEqual(Meta.P.credits, 600);
  assert.strictEqual(Meta.P.opts.sfx, 0.3);
  assert.strictEqual(JSON.parse(cloud.get('frontdacier.profil')).credits, 600);
  assert.ok(![...store.keys()].some(k => k !== 'frontdacier.profil' && k.startsWith('frontdacier.')));
});

test('jour : dailyRoll sans effet le même jour, prime donnée une fois', async () => {
  const { Meta } = load();
  await Meta.init();
  const c = Meta.P.credits;
  assert.strictEqual(Meta.dailyRoll(), 0);
  assert.strictEqual(Meta.P.credits, c);
  Meta.P.streakDay = '2000-1-1'; Meta.P.missionsDay = '';
  const b = Meta.dailyRoll();
  assert.strictEqual(b, Meta.STREAK[0]); // série rompue : retour au jour 1
  assert.strictEqual(Meta.P.missions.length, 3);
});

test('roue : le tirage gratuit est noté dès son application', async () => {
  const { Meta } = load();
  await Meta.init();
  assert.ok(Meta.canSpinFree());
  Meta.applyPrize(0, true);
  assert.ok(!Meta.canSpinFree());
});

test('économie : gains de fin de bataille et courbe d’expérience', async () => {
  const { Meta } = load();
  await Meta.init();
  const g = Meta.battleEnd({ win: true, kills: 3, pens: 5, crew: 4 });
  assert.strictEqual(g.credits, 3 * 150 + 5 * 20 + 4 * 12 + 400);
  assert.strictEqual(g.xp, 3 * 60 + 5 * 8 + 4 * 5 + 150);
  for (let lv = 1; lv < 20; lv++) assert.ok(Meta.xpFor(lv + 1) > Meta.xpFor(lv));
});

test('SDK : gameplayStart et gameplayStop jamais répétés, et le portail muet est lu', async () => {
  const { Meta, log } = load({ mute: true });
  await Meta.init();
  Meta.sdk.gameplayStop(); Meta.sdk.gameplayStart(); Meta.sdk.gameplayStart(); Meta.sdk.gameplayStop(); Meta.sdk.gameplayStop();
  assert.deepStrictEqual(log.filter(x => x.startsWith('gameplay')), ['gameplayStart', 'gameplayStop']);
  assert.strictEqual(Meta.platformMute, true);
  assert.ok(log.indexOf('loadingStart') === 0);
});

test('publicité : aucun gameplayStart pendant une publicité, reporté à sa fin', async () => {
  const { Meta, log } = load();
  await Meta.init();
  await new Promise(r => Meta.rewarded(r, r));
  Meta.sdk.gameplayStart(); // hors publicité : part tout de suite
  assert.strictEqual(log[log.length - 1], 'gameplayStart');
  Meta.sdk.gameplayStop();
  Meta.hooks.adStart = () => Meta.sdk.gameplayStart(); // demande de reprise en pleine publicité
  const n = log.length;
  await new Promise(r => Meta.rewarded(r, r));
  assert.deepStrictEqual(log.slice(n), ['ad:rewarded', 'adFinished', 'gameplayStart']); // reportée à la fin
});
