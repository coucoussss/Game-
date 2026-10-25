'use strict';
// Steel Front : objectifs de bataille (prise et tenue d'une zone), canons antichars remorqués et
// tir d'artillerie demandé par le joueur. Chargé avant game.js, qui crée l'instance
// (Objectives.create) en lui donnant accès à son état et l'appelle par de petits crochets : début de
// vague, pas de simulation, IA, impacts d'obus et de balles, rendu, interface.
const Objectives = (() => {
  const TAU = Math.PI * 2, D2R = Math.PI / 180, hyp = Math.hypot;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
  const angNorm = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function mulberry32(a) {
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  // ===================== Données =====================
  // Canons antichars remorqués (valeurs historiques arrondies) : servants modélisés, bouclier (mm),
  // hauteur de l'axe du tube (m), champ de tir de part et d'autre de l'axe (°), cadence pointée (s) ;
  // obus aux mêmes champs que ballistics.js
  const AT_GUNS = {
    pak40: {
      name: 'Pak 40', gun: '7.5 cm Pak 40 L/46', cal: 75, twist: 25, crew: 4, shield: 10, bore: 0.92, arc: 32, rof: 5,
      shells: {
        APHE: { name: '7.5 cm PzGr. 39 (APCBC-HE)', m: 6.8, v0: 792, cd: 0.30, k: 0.95, norm: 5, ric: [68, 78], filler: 0.018, re: 1.5, sens: 15, len: 4.4 },
        APCR: { name: '7.5 cm PzGr. 40 (APCR)', m: 4.1, v0: 933, cd: 0.49, k: 1.26, norm: -3, ric: [58, 68], core: 0.35, len: 3.4 },
        HE: { name: '7.5 cm Sprgr. 34 (HE)', m: 5.74, v0: 550, cd: 0.33, filler: 0.68, re: 1, ric: [85, 89], len: 4.6 },
      },
    },
    zis3: {
      name: 'ZiS-3', gun: '76 mm ZiS-3 divisional gun', cal: 76.2, twist: 25, crew: 4, shield: 6, bore: 0.9, arc: 27, rof: 5,
      shells: {
        APHE: { name: '76 mm BR-350A (APHE)', m: 6.3, v0: 662, cd: 0.36, k: 1.0, norm: 4, ric: [66, 76], filler: 0.155, re: 1.3, sens: 15, len: 4.0 },
        APCR: { name: '76 mm BR-350P (APCR)', m: 3.02, v0: 965, cd: 0.62, k: 1.3, norm: -3, ric: [58, 68], core: 0.3, len: 3.0 },
        HE: { name: '76 mm OF-350 (HE-frag)', m: 6.2, v0: 680, cd: 0.33, filler: 0.71, re: 1, ric: [85, 89], len: 4.6 },
      },
    },
    qf6: {
      name: 'QF 6-pdr', gun: '57 mm QF 6-pounder Mk IV', cal: 57, twist: 30, crew: 4, shield: 6, bore: 0.85, arc: 45, rof: 4,
      shells: {
        AP: { name: '57 mm APCBC Mk 9T (shot)', m: 3.23, v0: 831, cd: 0.30, k: 1.0, norm: 4, ric: [66, 76], len: 4.2 },
        APCR: { name: '57 mm APDS Mk 1', m: 1.42, v0: 1235, cd: 0.24, k: 1.55, norm: -2, ric: [60, 70], core: 0.55, len: 3.6 },
        HE: { name: '57 mm HE Mk 10T', m: 2.72, v0: 820, cd: 0.33, filler: 0.2, re: 1, ric: [85, 89], len: 4.6 },
      },
    },
  };
  // Artillerie de soutien (obus explosif de la batterie)
  const ARTY = {
    lefh18: { name: '10.5 cm leFH 18', cal: 105, shells: { HE: { name: '10.5 cm FH Gr. 38 (HE)', m: 14.8, v0: 470, cd: 0.33, filler: 1.38, re: 1, ric: [85, 89], len: 4.6 } } },
    m30: { name: '122 mm M-30', cal: 122, shells: { HE: { name: '122 mm OF-462 (HE-frag)', m: 21.8, v0: 515, cd: 0.33, filler: 3.67, re: 1, ric: [85, 89], len: 4.6 } } },
    qf25: { name: 'QF 25-pounder', cal: 87.6, shells: { HE: { name: '87.6 mm HE Mk 1D', m: 11.3, v0: 532, cd: 0.33, filler: 0.8, re: 1, ric: [85, 89], len: 4.6 } } },
    m2a1: { name: '105 mm M2A1', cal: 105, shells: { HE: { name: '105 mm HE M1', m: 15.0, v0: 472, cd: 0.33, filler: 2.18, re: 1, ric: [85, 89], len: 4.6 } } },
  };
  // Faction de chaque camp : allemande pour l'instant ; à relier aux factions des chars alliés en
  // remplaçant Objectives.factionOf (team → 'de' | 'su' | 'uk' | 'us')
  const FAC = { de: { at: 'pak40', art: 'lefh18' }, su: { at: 'zis3', art: 'm30' }, uk: { at: 'qf6', art: 'qf25' }, us: { at: 'qf6', art: 'm2a1' } };
  const api = { factionOf: () => 'de' };
  const fac = team => FAC[api.factionOf(team)] || FAC.de;
  const atGunFor = team => fac(team).at, artyFor = team => fac(team).art;
  // les canons et les batteries entrent dans la table balistique sous un préfixe (at_, art_)
  for (const [pre, tab] of [['at_', AT_GUNS], ['art_', ARTY]]) for (const [id, g] of Object.entries(tab)) {
    for (const [k, s] of Object.entries(g.shells)) Object.assign(s, { key: k, cal: g.cal, twist: g.twist || 25, heat: k === 'HEAT', he: k === 'HE', smoke: false, can: false });
    Ballistics.GUNS[pre + id] = { gun: g.gun || g.name, cal: g.cal, twist: g.twist || 25, shells: g.shells };
  }

  // Objectif de chaque vague de campagne (secteur × vague) : prise (capture) ou tenue (hold) d'une zone
  // choisie sur la carte (at : point haut, route, place dégagée, quartier bâti ; x : position en
  // fraction de la largeur), canons antichars ennemis (guns) ou alliés (own), renforts ennemis réguliers
  // et relève en fin de tenue
  const OPS = [
    [{ kind: 'capture', name: 'Capture Hill 252.2', at: 'hill', x: 0.56, r: 130, rate: 1 / 45 },
      { kind: 'capture', name: 'Break the Pak front at the road', at: 'road', x: 0.6, r: 120, rate: 1 / 45, guns: 4 },
      { kind: 'hold', name: 'Hold Hill 252.2', at: 'hill', x: 0.42, r: 140, time: 240, every: 60, n: 2, own: 2 }],
    [{ kind: 'capture', name: 'Take the forest crossroads', at: 'road', x: 0.55, r: 120, rate: 1 / 45, guns: 1 },
      { kind: 'capture', name: 'Seize the hamlet', at: 'town', x: 0.62, r: 130, rate: 1 / 45, guns: 2 },
      { kind: 'hold', name: 'Hold the crossroads', at: 'road', x: 0.4, r: 130, time: 240, every: 60, n: 2, own: 1 }],
    [{ kind: 'capture', name: 'Seize the square', at: 'open', x: 0.55, r: 120, rate: 1 / 50, guns: 2 },
      { kind: 'hold', name: 'Hold the tractor factory', at: 'town', x: 0.38, r: 150, time: 240, every: 50, n: 2 },
      { kind: 'capture', name: 'Clear the ruins', at: 'town', x: 0.62, r: 130, rate: 1 / 50, guns: 4 }],
    [{ kind: 'capture', name: 'Take the supply track', at: 'road', x: 0.55, r: 130, rate: 1 / 45, guns: 2 },
      { kind: 'capture', name: 'Storm Tel el Aqqaqir', at: 'hill', x: 0.66, r: 140, rate: 1 / 50, guns: 3 },
      { kind: 'hold', name: 'Hold the ridge', at: 'hill', x: 0.45, r: 140, time: 240, every: 60, n: 2, own: 2 }],
    [{ kind: 'capture', name: 'Take the road junction', at: 'road', x: 0.55, r: 130, rate: 1 / 45, guns: 1 },
      { kind: 'hold', name: 'Defend Bastogne until relief', at: 'town', x: 0.32, r: 170, time: 300, every: 75, n: 2, own: 2, relief: true },
      { kind: 'capture', name: 'Clear the road east', at: 'road', x: 0.64, r: 130, rate: 1 / 50, guns: 3 }],
  ];
  const BARRAGE = { delay: 20, n: 6, cep: 80, gap: 1.1, cd: 75 }; // tir demandé : 6 coups 20 s plus tard, écart circulaire probable 40 m

  function create(G) {
    const { PX, RK, WW, WH } = G;
    let O = null, guns = [], arty = [], calls = 0, callCd = 0, spotT = 0, M = null, lastSurv = 1, cr = 0;
    // batteries : tireur fictif des obus d'artillerie (nom au fil des destructions)
    const battery = [0, 1].map(team => ({ team, name: 'Artillery', isPlayer: false, ai: null, dead: false, x: team ? WW + 900 : -900, y: WH / 2, up: { pen: 1 }, T: null }));
    const live = team => G.tanks.filter(t => !t.dead && t.team === team);
    const seen0 = g => g.team === 0 || g.dead || g.seen[0] >= 1;

    // ---------- début de vague ----------
    function onWave() {
      O = null; guns = []; arty = []; cr = 0; callCd = 0; lastSurv = 1;
      for (const b of battery) { const id = artyFor(b.team), a = ARTY[id]; b.T = { id: 'art_' + id, name: a.name, caliber: a.cal, obs: 170 }; }
      calls = G.mode === 'duel' || G.boot() ? 0 : 1;
      if (calls) G.addLog(`Artillery: ${G.keyName('arty')} calls a fire mission on the aimed point`, '#bcd8ff');
      if (G.mode !== 'campagne' || G.boot()) return;
      const def = (OPS[G.level] || [])[G.wave];
      if (!def) return;
      const R = mulberry32(77 + G.level * 31 + G.wave * 7);
      O = { def, p: 0, q: 0, a: 0, e: 0, done: null, said: 0, z: zoneFor(def, R) };
      if (def.kind === 'hold') schedule(def);
      placeGuns(def.guns || 0, 1, R);
      placeGuns(def.own || 0, 0, R);
      G.addLog(`Orders: ${def.name}`, '#ffe27a');
    }
    // zone : meilleur point d'une bande de la carte, au sec et praticable
    function zoneFor(def, R) {
      let best = null, bs = -1e9;
      for (let i = 0; i < 160; i++) {
        const x = WW * (def.x + (R() - 0.5) * 0.14), y = WH * (0.28 + R() * 0.44);
        if (!G.free(x, y)) continue;
        let s = -Math.abs(y - WH / 2) * 0.004;
        if (def.at === 'hill') s += G.terra.ground(x, y);
        else if (def.at === 'road') s -= roadDist(x, y) / 15;
        else for (const o of G.obstacles) {
          if (o.dead) continue;
          const d = hyp(o.x + o.w / 2 - x, o.y + o.h / 2 - y);
          if (d < def.r * 0.6) s -= 2;
          else if (def.at === 'town' && o.type === 'building' && d < 280) s += 1;
        }
        if (s > bs) { bs = s; best = { x, y }; }
      }
      best = best || { x: def.x * WW, y: WH / 2 };
      return { x: best.x, y: best.y, r: def.r };
    }
    function roadDist(x, y) {
      let m = 400;
      for (const rd of G.roads) for (let i = 1; i < rd.length; i++) {
        const [ax, ay] = rd[i - 1], [bx, by] = rd[i], dx = bx - ax, dy = by - ay, k = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        m = Math.min(m, hyp(ax + dx * k - x, ay + dy * k - y));
      }
      return m;
    }
    // tenue : renforts ennemis réguliers, du type des chars déjà engagés
    function schedule(def) {
      const types = live(1).map(t => t.T.id);
      if (!types.length) return;
      let k = 0;
      for (let at = def.every; at < def.time - 15; at += def.every) for (let i = 0; i < def.n; i++, k++)
        G.reinf.push({ type: types[k % types.length], x: WW - 160 - i * 60, y: WH * (0.25 + Math.random() * 0.5), at, name: 'Enemy ' + (6 + k), skill: G.eSkill() });
    }

    // ---------- canons antichars ----------
    // postes : buissons, hauteurs et abords des ruines, espacés ; en face de l'adversaire
    function placeGuns(n, team, R) {
      if (!n) return;
      const z = O.z, gid = atGunFor(team), g = AT_GUNS[gid], cand = [];
      const x0 = team ? Math.max(z.x - 120, WW * 0.45) : z.x - z.r * 0.6, x1 = team ? Math.min(WW * 0.8, z.x + 420) : z.x + z.r;
      for (let i = 0; i < 140; i++) {
        const b = i < 70 && G.bushes.length ? G.bushes[Math.floor(R() * G.bushes.length)] : null;
        const x = b ? b.x : x0 + R() * (x1 - x0), y = b ? b.y : WH * (0.15 + R() * 0.7);
        if (x < x0 || x > x1 || !G.free(x, y)) continue;
        let s = G.terra.ground(x, y) * 0.6 + (b ? 2.5 : 0) + R() * 1.5 - Math.abs(y - z.y) / 400;
        for (const o of G.obstacles) if (!o.dead && o.type !== 'tree' && hyp(o.x + o.w / 2 - x, o.y + o.h / 2 - y) < Math.max(o.w, o.h) / 2 + 40) { s += 1.5; break; }
        cand.push({ x, y, s, bush: !!b });
      }
      cand.sort((a, b) => b.s - a.s);
      for (const c of cand) {
        if (guns.filter(q => q.team === team).length >= n) break;
        if (guns.some(q => hyp(q.x - c.x, q.y - c.y) < 200)) continue;
        const a0 = team ? Math.atan2(z.y - c.y, WW * 0.2 - c.x) : Math.atan2(0, 1);
        const k = guns.length + 1;
        guns.push({
          kind: 'gun', g, team, name: `${team ? 'AT gun' : 'Our AT gun'} ${k}`, x: c.x, y: c.y, a0, a: a0, hp: 100, dead: false, deadT: 0, bush: c.bush,
          crew: [[-1.0, 0.55], [-1.0, -0.6], [-2.1, 0.95], [-2.5, -0.55]].slice(0, g.crew).map(([ox, oy]) => ({ ox, oy, hp: 100 })),
          reloadT: rnd(1, 3), thinkT: 0, tgt: null, aimT: 0, shift: 0, revealT: 0, fireAge: 9, apcr: 6, skill: G.eSkill(), seen: [team ? 0 : 9, team ? 9 : 0],
          z: G.hAt(c.x, c.y) + 0.6, hl: 1.6 * PX, hw: 1.0 * PX, ht: 1.25, T: { id: 'at_' + gid, name: g.name, caliber: g.cal, obs: 90 }, up: { pen: 1 }, ai: null,
        });
      }
    }
    const crewUp = k => k.crew.filter(m => m.hp > 0).length;
    function crewPos(k, m) {
      const c = Math.cos(k.a), s = Math.sin(k.a);
      return { x: k.x + (c * m.ox - s * m.oy) * PX, y: k.y + (s * m.ox + c * m.oy) * PX };
    }
    function gunAI(k, dt) {
      const n = crewUp(k);
      k.revealT -= dt; k.fireAge += dt; k.shift -= dt; k.thinkT -= dt;
      k.reloadT -= dt * n / k.crew.length;
      // char ennemi qui roule sur la pièce : écrasée avec ses servants
      for (const t of G.tanks) if (!t.dead && t.team !== k.team && Math.abs(t.speed) > 0.8 * PX && hyp(t.x - k.x, t.y - k.y) < t.r + 8) { for (const m of k.crew) m.hp = 0; kill(k, t, 'crushed'); return; }
      if (k.thinkT <= 0) {
        k.thinkT = 0.5;
        // cible : char ennemi en vue à portée, de flanc de préférence ; feu retenu au-delà de 380 m tant
        // que la pièce n'est pas découverte
        let best = null, bs = 0;
        const gz = G.hAt(k.x, k.y) + 1.0, hold = k.revealT <= 0 && k.seen[1 - k.team] < 1 ? 760 : 1100;
        for (const t of G.tanks) {
          if (t.dead || t.team === k.team) continue;
          const d = hyp(t.x - k.x, t.y - k.y);
          if (d > hold || Math.abs(angNorm(Math.atan2(t.y - k.y, t.x - k.x) - k.a0)) > (k.g.arc + 50) * D2R) continue;
          const side = Math.abs(Math.sin(angNorm(t.angle - Math.atan2(t.y - k.y, t.x - k.x))));
          const sc = (1 + side) / (d + 120);
          if (sc > bs && G.losClear(k.x, k.y, t.x, t.y, true, false, null, gz, t.gz + t.T.S.ht * 0.7)) { bs = sc; best = t; }
        }
        if (best !== k.tgt) k.aimT = 0;
        k.tgt = best;
      }
      const e = k.tgt;
      if (!e || e.dead || !n) { k.a += angNorm(k.a0 - k.a) * Math.min(1, dt); return; }
      k.aimT += dt;
      const key = e.T.mass > 50 && k.apcr > 0 && hyp(e.x - k.x, e.y - k.y) < 560 ? 'APCR' : k.g.shells.APHE ? 'APHE' : 'AP';
      const sb = Ballistics.shell(k.T.id, key), d = hyp(e.x - k.x, e.y - k.y), tt = Ballistics.tof(sb, d * RK) / G.TOF;
      const want = Math.atan2(e.y + (e.vy || 0) * tt - k.y, e.x + (e.vx || 0) * tt - k.x);
      // hors du champ de tir : les servants déplacent la flèche, sans tirer
      const off = angNorm(want - k.a0);
      if (Math.abs(off) > k.g.arc * D2R) { k.a0 += Math.sign(off) * Math.min(Math.abs(off) - k.g.arc * D2R, 4 * D2R * dt); k.shift = 0.6; }
      k.a += clamp(angNorm(want - k.a), -12 * D2R * dt, 12 * D2R * dt);
      if (k.reloadT <= 0 && k.shift <= 0 && Math.abs(angNorm(want - k.a)) < 0.01 && k.aimT > 1.5 / (0.4 + k.skill)) fire(k, e, key, sb, d);
    }
    function fire(k, e, key, sb, d) {
      const v0 = Ballistics.muzzle(sb), pxk = G.shellPxK(), sp = v0 * pxk, disp = 0.005 * (1.5 - k.skill);
      const ang = k.a + gauss() * disp, mx = k.x + Math.cos(k.a) * 3.5 * PX, my = k.y + Math.sin(k.a) * 3.5 * PX, z0 = G.hAt(k.x, k.y) + k.g.bore;
      const slope = G.aimSlope(sb, d, z0, e.gz + e.T.S.ht * 0.6) + gauss() * disp / (PX * RK);
      G.shells.push({ id: G.nextId(), x: mx, y: my, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, sp, pxk, V: v0, team: k.team, owner: k, by: k, key, sb, v0, dist: 0, z: z0, slope, trail: [], ric: 0, yaw: false, whiz: false, warned: false, tgt: null, fx: mx, fy: my });
      if (key === 'APCR') k.apcr--;
      k.reloadT = k.g.rof * rnd(0.9, 1.2); k.revealT = 4; k.fireAge = 0; k.aimT = 0.5;
      G.parts.push({ k: 'flash', x: mx, y: my, life: 0.08, max: 0.08, size: 20 + k.g.cal / 4, z: k.g.bore });
      G.veils.push({ x: mx, y: my, r: 4 * PX, life: 1.6, max: 1.6, dens: 0.4, by: k });
      for (let i = 0; i < 10; i++) G.P3({ x: mx, y: my, z: k.g.bore, vx: Math.cos(k.a) * rnd(2, 12) + rnd(-2, 2), vy: Math.sin(k.a) * rnd(2, 12) + rnd(-2, 2), vz: rnd(0, 0.8), drag: 2, wind: 1, size: rnd(0.3, 0.6), grow: 1.2, life: rnd(1, 2), c: [0.7, 0.68, 0.62, 0.35] });
      G.Sfx.fire(G.listenerDist(mx, my), false, false);
    }
    // pièce hors de combat (détruite, écrasée ou sans servants) ; récompense du joueur
    function kill(k, by, how) {
      if (k.dead) return;
      k.dead = true; k.deadT = 0;
      for (const m of k.crew) if (m.hp > 0) G.runners.push({ x: k.x + rnd(-8, 8), y: k.y + rnd(-8, 8), team: k.team, hp: m.hp, tx: k.team ? WW : 0, a: rnd(-0.5, 0.5), v: rnd(2.2, 3.2), life: 45, ph: Math.random() * 9 });
      G.feed({ a: by ? by.name : '—', at: by ? by.team : -1, v: k.name, vt: k.team, ff: !!by && by.team === k.team, life: 7 });
      if (how !== 'crew') G.boom(k.x, k.y, 0.5, 0.4);
      if (k.team === 0) G.chatter(`Radio: ${k.name} is out of action!`, 2);
      if (by && by === G.player && k.team !== by.team) {
        cr += 120; G.floatText(k.x, k.y - 26, '+✪ 120', '#e9c46a', 1.3); G.ribbon(how === 'crew' ? 'AT gun crew eliminated' : 'AT gun destroyed');
        if (G.Meta.track('atgun')) G.missionToast();
      }
    }
    function crewHit(k, m, dmg, by) {
      if (m.hp <= 0) return;
      m.hp = Math.max(0, m.hp - dmg);
      if (m.hp <= 0 && by === G.player && k.team !== by.team && G.stats) G.stats.crew++;
      if (!crewUp(k)) kill(k, by, 'crew');
    }

    // ---------- impacts ----------
    // segment (x, y) + k·(dx, dy), hauteurs z0 → z1, contre la boîte de la pièce (repère du tube)
    function boxHit(k, x, y, dx, dy, z0, z1, x0 = -k.hl, x1 = k.hl, y0 = -k.hw, y1 = k.hw, zb = 0, zt = k.ht) {
      const c = Math.cos(k.a), s = Math.sin(k.a);
      const h = G.segAABB((x - k.x) * c + (y - k.y) * s, -(x - k.x) * s + (y - k.y) * c, dx * c + dy * s, -dx * s + dy * c, x0, y0, x1, y1);
      if (!h || h.t >= 1) return null;
      const g = G.hAt(k.x, k.y), ze = z0 + (z1 - z0) * h.t - g;
      return ze <= zt && ze >= zb - 0.3 ? { t: h.t, soft: k, z: ze } : null;
    }
    const near = (k, x, y, dx, dy) => Math.abs(k.x - x - dx / 2) < Math.abs(dx) / 2 + 30 && Math.abs(k.y - y - dy / 2) < Math.abs(dy) / 2 + 30;
    function shellCand(s, dx, dy, z1) {
      let best = null;
      for (const k of guns) {
        if (k.dead || k === s.skipSoft || k === s.owner || !near(k, s.x, s.y, dx, dy)) continue;
        const h = boxHit(k, s.x, s.y, dx, dy, s.z, z1);
        if (h && (!best || h.t < best.t)) best = h;
      }
      return best;
    }
    // obus au but : l'explosif éclate sur la pièce ; un perforant traverse bouclier et affût en les brisant
    function shellHit(s, k, hx, hy) {
      if (s.sb.he || s.sb.heat) { k.hp -= s.sb.heat ? 120 : 200; if (k.hp <= 0) kill(k, s.by); G.explode(hx, hy, s, null); return 'stop'; }
      if (s.key === 'SMOKE') return 'continue';
      k.hp -= rnd(60, 140);
      for (const m of k.crew) if (m.hp > 0 && Math.random() < 0.3) crewHit(k, m, rnd(40, 120), s.by);
      G.Fx.armorHit(hx, hy, 0.8, 'pen', s.vx / s.sp, s.vy / s.sp); G.Sfx.clang(G.listenerDist(hx, hy));
      if (k.hp <= 0) kill(k, s.by);
      s.skipSoft = k;
      return 'continue';
    }
    // éclats d'un obus explosif : les servants à découvert ; le bouclier abrite de ce qui vient de face
    function blast(x, y, s) {
      const W = G.heW(s.sb), k3 = Math.cbrt(Math.max(0.01, W));
      for (const k of guns) {
        if (k.dead) continue;
        const d = hyp(k.x - x, k.y - y) / PX;
        if (d > 30) continue;
        if (d < 0.9 * k3 && Math.random() < 0.6) { k.hp = 0; kill(k, s.by); continue; }
        const front = Math.cos(angNorm(Math.atan2(y - k.y, x - k.x) - k.a)) > 0.5;
        for (const m of k.crew) {
          const p = crewPos(k, m), r = hyp(p.x - x, p.y - y) / PX;
          if (m.hp > 0 && Math.random() < G.fragP(s.sb.cal, r, front ? 0.12 : 0.5)) crewHit(k, m, rnd(50, 130), s.by);
        }
      }
    }
    function bulletCand(b, dx, dy, z1) {
      let best = null;
      const l2 = dx * dx + dy * dy || 1;
      for (const k of guns) {
        if (k.dead || k.team === b.team || !near(k, b.x, b.y, dx, dy)) continue;
        for (const m of k.crew) {
          if (m.hp <= 0) continue;
          const p = crewPos(k, m), kk = clamp(((p.x - b.x) * dx + (p.y - b.y) * dy) / l2, 0, 1), z = b.z + (z1 - b.z) * kk - G.hAt(p.x, p.y);
          if (z < 1.2 && z > -0.2 && hyp(b.x + dx * kk - p.x, b.y + dy * kk - p.y) < 0.35 * PX && (!best || kk < best.t)) best = { t: kk, soft: k, man: m };
        }
        // bouclier de la pièce : plaque de 2 m sur 1 m devant les servants
        const sh = boxHit(k, b.x, b.y, dx, dy, b.z, z1, 0.4 * PX, 0.55 * PX, -1.0 * PX, 1.0 * PX, 0.15, 1.15);
        if (sh && (!best || sh.t < best.t)) best = Object.assign(sh, { shield: true });
      }
      return best;
    }
    function bulletHit(b, h, hx, hy) {
      const k = h.soft, ux = b.vx / b.sp, uy = b.vy / b.sp;
      if (h.shield) {
        if (G.mgPen(b.type, b.dist * RK) <= k.g.shield) { G.Fx.armorHit(hx, hy, h.z, 'mg', ux, uy); return; }
        const m = k.crew.find(q => q.hp > 0);
        if (m && Math.random() < 0.4) crewHit(k, m, rnd(40, 110), b.by);
        return;
      }
      crewHit(k, h.man, rnd(60, 130), b.by);
      G.Fx.bulletGround(hx, hy, ux, uy);
    }

    // ---------- artillerie ----------
    const artyShow = () => calls > 0 && G.mode !== 'duel' && G.state === 'play';
    function callArty() {
      const P = G.player;
      if (G.state !== 'play' || !P || P.dead || G.mode === 'duel') return;
      if (calls <= 0) { G.showMsg('No artillery support available', '#ff9a7a', 1.4); return; }
      if (callCd > 0) { G.showMsg(`Battery reloading: ready in ${Math.ceil(callCd)} s`, '#ff9a7a', 1.4); return; }
      if (!G.radioOk(P)) { G.showMsg('Radio out: you cannot call the battery', '#ff9a7a', 1.4); return; }
      const p = G.aimedAt();
      calls--; callCd = BARRAGE.cd;
      arty.push({ team: 0, x: clamp(p.x, 40, WW - 40), y: clamp(p.y, 40, WH - 40), t: BARRAGE.delay, n: BARRAGE.n, mine: true, warn: false });
      G.showMsg(`Fire mission: ${battery[0].T.name}, ${BARRAGE.n} rounds in ${BARRAGE.delay} s`, '#bcd8ff', 2);
      G.addLog(`Battery: fire mission received, rounds on the way`, '#bcd8ff'); G.Sfx.ping(0);
      if (G.Meta.track('arty')) G.missionToast();
    }
    // obus réel qui tombe de 45 m sous 50 à 65° : la balistique du jeu l'amène au sol ou sur un toit
    function round(a) {
      const b = battery[a.team], sb = Ballistics.shell(b.T.id, 'HE'), sg = BARRAGE.cep / 1.1774, r = sg * Math.sqrt(-2 * Math.log(Math.random() || 1e-9)), th = Math.random() * TAU;
      const tx = a.x + Math.cos(th) * r, ty = a.y + Math.sin(th) * r, dir = (a.team ? Math.PI : 0) + rnd(-0.2, 0.2), e = rnd(50, 65) * D2R, h = 45, back = h / Math.tan(e) / RK;
      const x = tx - Math.cos(dir) * back, y = ty - Math.sin(dir) * back, V = 320, slope = -Math.tan(e), pxk = G.shellPxK(), sp = V / hyp(1, slope) * pxk;
      G.shells.push({ id: G.nextId(), x, y, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp, sp, pxk, V, team: b.team, owner: b, by: b, key: 'HE', sb, v0: V, dist: 0, z: G.hAt(tx, ty) + h, slope, trail: [], ric: 0, yaw: false, whiz: false, warned: false, arty: true, fx: x, fy: y });
    }
    function artyStep(dt) {
      callCd -= dt;
      for (let i = arty.length - 1; i >= 0; i--) {
        const a = arty[i];
        if (a.mine && !a.warn && a.t <= 5) { a.warn = true; G.chatter('Battery: splash, over', 2); }
        if ((a.t -= dt) > 0) continue;
        round(a); a.t = BARRAGE.gap * rnd(0.7, 1.3);
        if (--a.n <= 0) arty.splice(i, 1);
      }
      // survie : une nouvelle demande toutes les trois vagues
      if (G.mode === 'survie' && G.survWave !== lastSurv) { lastSurv = G.survWave; if (lastSurv % 3 === 0) { calls++; G.addLog('Battery available: one fire mission', '#bcd8ff'); } }
    }

    // ---------- pas de simulation ----------
    function update(dt) {
      if (G.state !== 'play') return;
      if ((spotT -= dt) <= 0) { spotT = 0.25; spot(0.25); }
      for (const k of guns) if (!k.dead) gunAI(k, dt); else k.deadT += dt;
      artyStep(dt);
      if (O && !O.done) objective(dt);
    }
    // repérage des pièces : silhouette basse, plus encore dans un buisson ; le coup de feu les trahit
    function spot(dt) {
      const night = !!G.L().night;
      for (const k of guns) {
        if (k.dead) continue;
        const team = 1 - k.team, vis = k.bush ? 0.2 : 0.35;
        let rate = -0.5;
        for (const a of G.tanks) {
          if (a.dead || a.team !== team) continue;
          const d = hyp(a.x - k.x, a.y - k.y), range = a.T.view * (night ? 0.6 : 1) * (k.revealT > 0 ? 1.3 : 1);
          if (d > range || !G.losClear(a.x, a.y, k.x, k.y, true, false, a, a.gz + a.T.I.totalH + 0.3, k.z + 0.5)) continue;
          rate = Math.max(rate, k.revealT > 0 || d < 90 ? 9 : 1.6 * (1 - d / range) * vis);
        }
        k.seen[team] = clamp(k.seen[team] + rate * dt, 0, 1.5);
      }
    }
    function objective(dt) {
      const d = O.def, z = O.z, inside = team => live(team).filter(t => hyp(t.x - z.x, t.y - z.y) < z.r).length;
      const a = O.a = inside(0), e = O.e = inside(1);
      if (d.kind === 'capture') {
        const p0 = O.p;
        if (a && !e) O.p += d.rate * dt * (1 + 0.25 * Math.min(3, a - 1));
        else if (e && !a) O.p -= d.rate * dt * 0.5;
        O.p = clamp(O.p, 0, 1);
        if (p0 < 0.5 && O.p >= 0.5) G.chatter('Radio: zone half taken, keep pushing!', 2);
        if (O.p >= 1) finish('win', `${d.name}: done`);
      } else {
        if (e && !a) O.q += dt / 40 * (1 + 0.25 * Math.min(3, e - 1));
        else if (a) O.q -= dt / 40;
        O.q = clamp(O.q, 0, 1);
        if (O.q > 0.5 && O.said < 1) { O.said = 1; G.chatter('Radio: they are taking the position, counter-attack!', 2); }
        const left = d.time - G.waveTime;
        if (left < 60 && O.said < 2) { O.said = 2; G.chatter(d.relief ? 'Radio: relief force in one minute, hold on!' : 'Radio: one more minute, hold on!', 2); }
        if (O.q >= 1) finish('lose', 'The position has fallen');
        else if (left <= 0) {
          if (d.relief) {
            // relève : trois chars alliés débouchent de l'ouest
            const types = G.tanks.filter(t => t.team === 0).map(t => t.T.id);
            for (let i = 0; i < 3; i++) { const t = G.makeTank(types[i % types.length], 0, 120, WH / 2 + (i - 1) * 140, 0, false, 'Relief ' + (i + 1), 0.6); if (t.ai) t.ai.laneY = t.y; G.tanks.push(t); }
            G.showMsg('Relief force has arrived!', '#b8e07a', 2.5);
          }
          finish('win', `${d.name}: done`);
        }
      }
    }
    function finish(v, text) {
      O.done = v; O.text = text;
      if (v === 'win') { cr += 300; if (G.Meta.track('objective')) G.missionToast(); }
    }

    // ---------- IA ----------
    // destination sans cible en vue : les assaillants entrent dans la zone, les défenseurs se postent
    // en arc devant elle, du côté de l'assaillant (près d'un buisson s'il y en a un) ; false : rien à dire
    function aiDest(t) {
      if (!O || O.done) return false;
      const ai = t.ai, z = O.z, att = O.def.kind === 'hold' ? 1 : 0;
      if (ai.soft) return null;
      let p;
      if (t.team === att) {
        if (ai.lastKnown) return false;
        const a = t.id * 2.4;
        p = { x: z.x + Math.cos(a) * z.r * 0.5, y: z.y + Math.sin(a) * z.r * 0.5 };
      } else {
        const dir = att ? 1 : -1, a = (t.id % 5 - 2) * 0.45;
        p = { x: z.x + dir * Math.cos(a) * z.r * 0.75, y: z.y + Math.sin(a) * z.r * 1.1 };
        const b = G.bushNear(p, 60);
        if (b) p = { x: b.x, y: b.y };
      }
      return hyp(p.x - t.x, p.y - t.y) > 30 ? p : null;
    }
    // cible molle (pièce antichar repérée, en vue, à portée) : sans char en vue, ou deux fois plus proche
    function aiSoft(t, best, bd) {
      let pick = null, ps = 0;
      for (const k of guns) {
        if (k.dead || k.team === t.team || k.seen[t.team] < 1) continue;
        const d = hyp(k.x - t.x, k.y - t.y), sc = 1 / (d + 150);
        if (d > t.T.range * 1.4 || sc <= ps || !G.losClear(t.x, t.y, k.x, k.y, true, false, t, t.gz + t.T.S.gun.z, k.z)) continue;
        ps = sc; pick = k;
      }
      return pick && (!best || hyp(pick.x - t.x, pick.y - t.y) < bd * 0.5) ? pick : null;
    }

    // ---------- rendu ----------
    function meshes() {
      if (M || !G.W3D) return M;
      const W3 = G.W3D, B = () => new G3.Builder();
      const g = B(); // pièce antichar : bouclier double, berceau, tube et frein de bouche, roues, flèches
      g.box(0.5, 0.5, 0.65, 0.06, 0.95, 1.0, '#5c5c4a', 3); g.box(0.5, -0.5, 0.65, 0.06, 0.95, 1.0, '#5c5c4a', 3);
      g.box(-0.1, 0, 0.8, 1.2, 0.34, 0.3, '#4a4a3c', 3);
      g.cyl([0.3, 0, 0.92], [3.3, 0, 0.92], 0.055, 0.048, 8, '#3a3a32', 3); g.cyl([3.25, 0, 0.92], [3.55, 0, 0.92], 0.09, 0.09, 8, '#33332c', 3);
      for (const sd of [1, -1]) { g.cyl([0, sd * 0.82, 0.42], [0, sd * 1.0, 0.42], 0.42, 0.42, 12, '#1d1d1b', 4); g.box(-1.5, sd * 0.4, 0.22, 2.7, 0.12, 0.12, '#4a4a3c', 3); }
      const sb = B(); // sacs de sable en fer à cheval devant la pièce
      for (let i = -3; i <= 3; i++) { const a = i * 0.36; sb.box(Math.cos(a) * 2.0, Math.sin(a) * 2.0, 0.28, 0.5, 0.85, 0.55, '#8a7c5c', 7); }
      const cu = B(); cu.box(0, 0, 0.5, 1, 1, 1, '#ffffff', 7);
      M = { gun: W3.upload(g), bags: W3.upload(sb), cube: W3.upload(cu) };
      return M;
    }
    function draw3D(items, glow) {
      if (!meshes()) return;
      const M4 = G3.M4, P = (x, y) => [x / PX, -y / PX];
      for (const k of guns) {
        if (!seen0(k)) continue;
        const [X, Y] = P(k.x, k.y), gz = G.hAt(k.x, k.y), rc = k.fireAge < 0.05 ? k.fireAge / 0.05 : Math.exp(-(k.fireAge - 0.05) * 4);
        items.push({ mesh: M.bags, model: M4.trs(X, Y, gz - 0.05, -k.a0), o: { gz }, cull: [X, Y, gz, 3] });
        items.push({ mesh: M.gun, model: M4.trs(X - Math.cos(k.a) * 0.25 * rc, Y + Math.sin(k.a) * 0.25 * rc, gz, -k.a), o: { gz, burnt: k.dead ? 1 : 0 }, cull: [X, Y, gz, 4] });
        if (G.cmdr3) for (const m of k.crew) if (m.hp > 0) { const p = crewPos(k, m), q = P(p.x, p.y), g2 = G.hAt(p.x, p.y); items.push({ mesh: G.cmdr3, model: M4.trs(q[0], q[1], g2 + 0.5, -k.a), o: { gz: g2 } }); }
      }
      if (!O) return;
      // zone : seize piquets qui passent au bleu à mesure de la prise (rouge : prise par l'ennemi)
      const z = O.z, f = O.def.kind === 'capture' ? O.p : 1 - O.q;
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * TAU, x = z.x + Math.cos(a) * z.r, y = z.y + Math.sin(a) * z.r, [X, Y] = P(x, y), gz = G.hAt(x, y), on = i < Math.round(f * 16);
        items.push({ mesh: M.cube, model: M4.trs(X, Y, gz, 0, 0.18, 0.18, 1.1), o: { gz, tint: on ? [0.3, 0.6, 1, 1] : [0.9, 0.3, 0.25, 1] } });
        glow.push({ p: [X, Y, gz + 1.25], s: 0.25, c: on ? [0.4, 0.7, 1, 1.2] : [1, 0.4, 0.3, 1], g: gz });
      }
    }
    function draw2D(ctx) {
      for (const k of guns) {
        if (!seen0(k)) continue;
        ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.a);
        ctx.fillStyle = k.dead ? '#333' : k.team ? '#7a6a50' : '#566640'; ctx.fillRect(2, -7, 3, 14);
        ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(24, 0); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = k.team ? '#ff8c80' : '#8cc4ff';
        for (const m of k.crew) if (m.hp > 0) { const p = crewPos(k, m); ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, TAU); ctx.fill(); }
      }
      if (!O) return;
      const z = O.z, f = O.def.kind === 'capture' ? O.p : 1 - O.q;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,90,70,0.7)'; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(90,160,255,0.9)'; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
    }
    const zoneTxt = () => {
      const d = O.def;
      if (O.done) return O.done === 'win' ? 'completed' : 'failed';
      if (d.kind === 'capture') return `${Math.round(O.p * 100)}%${O.a && O.e ? ' · contested' : ''}`;
      return `${mmss(Math.max(0, d.time - G.waveTime))} left${O.q > 0.02 ? ` · enemy ${Math.round(O.q * 100)}%` : ''}`;
    };
    // repères à l'écran : zone, pièces repérées, points visés par l'artillerie
    function labels(ctx) {
      ctx.textAlign = 'center';
      const mark = (x, y, z, txt, col) => {
        const p = G.worldToScreen(x, y, z);
        if (p.behind || p.x < -60 || p.y < -30 || p.x > G.W + 60 || p.y > G.H + 30) return;
        ctx.font = G.F(800, 11); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(txt, p.x + 1, p.y + 1); ctx.fillStyle = col; ctx.fillText(txt, p.x, p.y);
      };
      if (O) mark(O.z.x, O.z.y, 5, `◎ ${O.def.kind === 'capture' ? 'CAPTURE' : 'HOLD'} · ${zoneTxt()}`, '#ffe27a');
      for (const k of guns) if (!k.dead && k.team && seen0(k)) mark(k.x, k.y, 2.6, `▼ ${k.g.name}`, G.teamCol(1));
      for (const a of arty) if (a.mine) {
        ctx.strokeStyle = 'rgba(255,226,122,0.8)'; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let i = 0; i <= 20; i++) { const q = G.worldToScreen(a.x + Math.cos(i / 20 * TAU) * BARRAGE.cep, a.y + Math.sin(i / 20 * TAU) * BARRAGE.cep, 0.3); if (q.behind) { ctx.beginPath(); break; } i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
        ctx.stroke();
        mark(a.x, a.y, 1.5, `ARTILLERY · ${Math.max(0, Math.ceil(a.t))} s`, '#ffe27a');
      }
    }
    function minimap(ctx, x0, y0, k) {
      for (const g of guns) if (!g.dead && seen0(g)) { ctx.fillStyle = g.team ? G.teamCol(1) : G.teamCol(0); ctx.fillRect(x0 + g.x * k - 2, y0 + g.y * k - 1, 4, 2); }
      ctx.lineWidth = 1.5;
      for (const a of arty) if (a.mine) { ctx.strokeStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(x0 + a.x * k, y0 + a.y * k, Math.max(3, BARRAGE.cep * k), 0, TAU); ctx.stroke(); }
      if (!O) return;
      ctx.strokeStyle = '#ffe27a'; ctx.beginPath(); ctx.arc(x0 + O.z.x * k, y0 + O.z.y * k, Math.max(4, O.z.r * k), 0, TAU); ctx.stroke();
    }
    // ligne de l'objectif sous le bandeau du score (repère virtuel de l'interface)
    function hud(ctx, b) {
      if (!O) return;
      const w = b.x1 - b.x0, f = O.def.kind === 'capture' ? O.p : clamp(G.waveTime / O.def.time, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(b.x0, 56, w, 18);
      ctx.fillStyle = O.def.kind === 'capture' ? 'rgba(90,160,255,0.45)' : 'rgba(184,224,122,0.35)'; ctx.fillRect(b.x0, 56, w * f, 18);
      if (O.q > 0) { ctx.fillStyle = 'rgba(255,90,70,0.55)'; ctx.fillRect(b.x0, 70, w * O.q, 4); }
      const tx = `◎ ${O.def.name} · ${zoneTxt()}`;
      ctx.textAlign = 'center'; ctx.font = '700 12px system-ui, sans-serif';
      const fw = ctx.measureText(tx).width; if (fw > w - 10) ctx.font = `700 ${Math.max(8, 12 * (w - 10) / fw).toFixed(1)}px system-ui, sans-serif`;
      ctx.fillStyle = '#ffe27a'; ctx.fillText(tx, b.cx, 69);
    }

    return {
      onWave, update, aiDest, aiSoft, shellCand, shellHit, blast, bulletCand, bulletHit, callArty, draw3D, draw2D, labels, minimap, hud,
      verdict: () => O && O.done, active: () => !!O, hudH: () => O ? 20 : 0, credits: () => cr, guns: () => guns,
      introTxt: () => O ? `Objective: ${O.def.name.toLowerCase()}` : '',
      endMsg: w => O && O.done ? (w ? 'OBJECTIVE COMPLETE' : 'OBJECTIVE FAILED') : '',
      resultRow: () => O ? `<tr><td>Objective: ${O.def.name}</td><td class="${O.done === 'win' ? '' : 'bad'}">${O.done === 'win' ? 'completed' : O.done ? 'failed' : 'not completed'}</td></tr>` : '',
      artyShow, artyLabel: () => callCd > 0 ? `ARTY ${Math.ceil(callCd)}` : 'ARTY',
      nav(stamp) { for (const k of guns) if (!k.dead) stamp(k.x, k.y, 16, 1); },
    };
  }
  return Object.assign(api, { create, AT_GUNS, ARTY, OPS, atGunFor, artyFor });
})();
