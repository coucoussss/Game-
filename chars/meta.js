'use strict';
// Méta-jeu : SDK CrazyGames (publicités, début et fin de partie, sauvegarde), profil du joueur,
// économie (crédits, expérience, grades), chars à débloquer, camouflages, roue quotidienne,
// missions du jour et série de connexions.
const Meta = (() => {
  // ===================== SDK CrazyGames =====================
  // Le SDK v3 est chargé par index.html. Hors de CrazyGames (fichier local, page intégrée), il est
  // absent ou en mode « disabled » : les publicités récompensées sont alors simulées par un court écran.
  let SDK = null, env = 'none', adBusy = false, lastMidgame = Date.now();
  const hooks = { adStart: () => {}, adEnd: () => {}, change: () => {} };
  const MIDGAME_GAP = 180000; // au plus une publicité entre deux parties toutes les 3 minutes

  async function initSDK() {
    try {
      if (window.CrazyGames && window.CrazyGames.SDK) {
        SDK = window.CrazyGames.SDK;
        await SDK.init();
        env = SDK.environment || 'crazygames';
        if (env === 'disabled') SDK = null;
      }
    } catch (e) { console.warn('SDK CrazyGames indisponible', e); SDK = null; env = 'none'; }
  }
  const call = (fn) => { try { if (SDK) fn(SDK); } catch (e) { console.warn(e); } };
  const sdk = {
    get env() { return env; },
    loadingStart: () => call(s => s.game.loadingStart()),
    loadingStop: () => call(s => s.game.loadingStop()),
    gameplayStart: () => call(s => s.game.gameplayStart()),
    gameplayStop: () => call(s => s.game.gameplayStop()),
    happytime: () => call(s => s.game.happytime()),
  };

  // écran de publicité simulée (hors CrazyGames) : 3 secondes, puis récompense
  function simAd(done) {
    const el = document.getElementById('adSim');
    if (!el) { done(true); return; }
    let n = 3;
    el.classList.add('on');
    const txt = el.querySelector('b');
    txt.textContent = n;
    const it = setInterval(() => {
      n--; txt.textContent = Math.max(0, n);
      if (n <= 0) { clearInterval(it); el.classList.remove('on'); done(true); }
    }, 1000);
  }
  function requestAd(type, done) {
    if (adBusy) { done(false); return; }
    adBusy = true;
    const fin = ok => { adBusy = false; hooks.adEnd(); done(ok); };
    hooks.adStart();
    if (!SDK) {
      if (type === 'rewarded') simAd(fin); else fin(true);
      return;
    }
    try {
      SDK.ad.requestAd(type, {
        adStarted: () => {},
        adFinished: () => fin(true),
        adError: () => fin(type !== 'rewarded'),
      });
    } catch (e) { fin(type !== 'rewarded'); }
  }
  // Publicité entre deux parties, plafonnée ; la suite du jeu reprend toujours ensuite
  function midgame(then) {
    if (Date.now() - lastMidgame < MIDGAME_GAP) { then(); return; }
    lastMidgame = Date.now();
    requestAd('midgame', () => then());
  }
  // Publicité récompensée : la récompense n'est donnée que si la publicité est allée au bout
  function rewarded(onReward, onFail) {
    requestAd('rewarded', ok => { if (ok) onReward(); else if (onFail) onFail(); });
  }

  // ===================== Contenu =====================
  const RANKS = ['Soldat', 'Caporal', 'Caporal-chef', 'Sergent', 'Sergent-chef', 'Adjudant', 'Aspirant', 'Sous-lieutenant',
    'Lieutenant', 'Capitaine', 'Commandant', 'Lieutenant-colonel', 'Colonel', 'Général de brigade', 'Général de division', 'Maréchal'];
  const xpFor = lv => Math.round(300 * Math.pow(lv, 1.45)); // XP pour passer du niveau lv à lv + 1
  // Chars : prix en crédits et grade requis
  const TANKS = {
    light: { price: 0, lvl: 1 }, pz4: { price: 0, lvl: 1 }, stug: { price: 2500, lvl: 2 },
    medium: { price: 6000, lvl: 4 }, destroyer: { price: 8000, lvl: 5 }, heavy: { price: 11000, lvl: 7 }, kingtiger: { price: 18000, lvl: 10 },
  };
  // Camouflages (trois tons, en couleur linéaire), du plus courant au plus rare
  const SKINS = [
    { id: 'std', name: 'Standard 1944', rar: 'commun', price: 0, camo: [[0.33, 0.36, 0.22], [0.20, 0.25, 0.15], [0.36, 0.27, 0.17]] },
    { id: 'gris', name: 'Gris Panzer 1940', rar: 'commun', price: 800, camo: [[0.16, 0.17, 0.17], [0.13, 0.14, 0.14], [0.19, 0.2, 0.2]] },
    { id: 'dak', name: 'Afrikakorps', rar: 'rare', price: 1800, camo: [[0.55, 0.45, 0.28], [0.5, 0.41, 0.25], [0.42, 0.36, 0.24]] },
    { id: 'hinter', name: 'Hinterhalt (embuscade)', rar: 'rare', price: 2600, camo: [[0.52, 0.45, 0.27], [0.18, 0.24, 0.12], [0.35, 0.2, 0.13]] },
    { id: 'hiver', name: 'Blanc d’hiver lavable', rar: 'rare', price: 2600, camo: [[0.78, 0.8, 0.8], [0.62, 0.64, 0.62], [0.3, 0.32, 0.25]] },
    { id: 'disrupt', name: 'Disruptif tricolore', rar: 'épique', price: 4500, camo: [[0.6, 0.52, 0.32], [0.12, 0.18, 0.1], [0.42, 0.22, 0.13]] },
    { id: 'nuit', name: 'Opération nocturne', rar: 'épique', price: 0, ad: true, camo: [[0.08, 0.09, 0.1], [0.05, 0.06, 0.07], [0.12, 0.13, 0.12]] },
    { id: 'or', name: 'Or du maréchal', rar: 'légendaire', price: 25000, camo: [[0.75, 0.55, 0.16], [0.6, 0.42, 0.1], [0.85, 0.68, 0.25]] },
  ];
  // Roue quotidienne : poids relatifs
  const WHEEL = [
    { t: '250 ✪', c: 250, w: 22, col: '#3b4a2c' }, { t: '500 ✪', c: 500, w: 18, col: '#5a4a24' },
    { t: 'Kit de réparation', kit: 1, w: 12, col: '#2c3e4a' }, { t: '1 000 ✪', c: 1000, w: 12, col: '#4a2c2c' },
    { t: 'Gains × 2', x2: 2, w: 12, col: '#3a2c4a' }, { t: '2 500 ✪', c: 2500, w: 7, col: '#2c4a3e' },
    { t: 'Camouflage', skin: true, w: 6, col: '#4a3a1c' }, { t: '10 000 ✪', c: 10000, w: 1.5, col: '#6a5210' },
  ];
  // Missions du jour (trois tirées au sort chaque jour)
  const MISSIONS = [
    { id: 'kill5', t: 'Détruire 5 chars ennemis', ev: 'kill', goal: 5, reward: 600 },
    { id: 'kill12', t: 'Détruire 12 chars ennemis', ev: 'kill', goal: 12, reward: 1500 },
    { id: 'pen15', t: 'Réussir 15 perforations', ev: 'pen', goal: 15, reward: 700 },
    { id: 'crew20', t: 'Neutraliser 20 équipiers', ev: 'crew', goal: 20, reward: 800 },
    { id: 'cmd2', t: 'Abattre 2 chefs de char à découvert', ev: 'cmd', goal: 2, reward: 900 },
    { id: 'win3', t: 'Gagner 3 batailles', ev: 'win', goal: 3, reward: 1000 },
    { id: 'wave5', t: 'Atteindre la vague 5 en survie', ev: 'wave', goal: 5, reward: 1200, max: true },
    { id: 'ric5', t: 'Encaisser 5 ricochets sans être détruit', ev: 'ricself', goal: 5, reward: 500 },
    { id: 'det2', t: 'Faire détoner 2 soutes à munitions', ev: 'det', goal: 2, reward: 1100 },
  ];
  const STREAK = [200, 300, 450, 600, 800, 1000, 2000]; // récompenses de connexion, jours 1 à 7

  // ===================== Profil =====================
  const KEY = 'frontdacier.profil';
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 864e5); };
  const fresh = () => ({
    v: 1, credits: 600, xp: 0, level: 1, tanks: ['light', 'pz4'], skins: ['std'], skinSel: {}, kits: 1, x2: 0,
    wheelDay: '', streakDay: '', streak: 0, missionsDay: '', missions: [], stats: { battles: 0, kills: 0, wins: 0 },
    opts: { sfx: 0.8, music: 0.6, quality: 'haute', hitcam: true },
  });
  let P = fresh();
  async function load() {
    let raw = null;
    try { if (SDK && SDK.data) raw = SDK.data.getItem(KEY); } catch (e) { /* */ }
    if (!raw) try { raw = localStorage.getItem(KEY); } catch (e) { /* stockage indisponible */ }
    if (raw) try { P = Object.assign(fresh(), JSON.parse(raw)); P.opts = Object.assign(fresh().opts, P.opts); } catch (e) { P = fresh(); }
  }
  function save() {
    const raw = JSON.stringify(P);
    try { if (SDK && SDK.data) SDK.data.setItem(KEY, raw); } catch (e) { /* */ }
    try { localStorage.setItem(KEY, raw); } catch (e) { /* */ }
    hooks.change();
  }

  // ===================== Économie =====================
  function addXP(n) {
    P.xp += n;
    let up = 0;
    while (P.xp >= xpFor(P.level)) { P.xp -= xpFor(P.level); P.level++; up++; }
    if (up) { P.credits += 500 * up; sdk.happytime(); }
    return up;
  }
  const rankName = (lv = P.level) => RANKS[Math.min(RANKS.length - 1, lv - 1)];
  const canBuyTank = id => P.level >= TANKS[id].lvl && P.credits >= TANKS[id].price;
  function buyTank(id) { if (!canBuyTank(id) || P.tanks.includes(id)) return false; P.credits -= TANKS[id].price; P.tanks.push(id); save(); return true; }
  function buySkin(id) {
    const s = SKINS.find(k => k.id === id);
    if (!s || P.skins.includes(id) || s.ad || P.credits < s.price) return false;
    P.credits -= s.price; P.skins.push(id); save(); return true;
  }
  function grantSkin(id) { if (!P.skins.includes(id)) { P.skins.push(id); save(); } }
  function selectSkin(tank, id) { if (P.skins.includes(id)) { P.skinSel[tank] = id; save(); } }
  const skinOf = tank => SKINS.find(k => k.id === (P.skinSel[tank] || 'std')) || SKINS[0];

  // ===================== Missions et série =====================
  function dailyRoll() {
    const d = today();
    if (P.missionsDay !== d) {
      const pool = MISSIONS.slice(), pick = [];
      while (pick.length < 3) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      P.missions = pick.map(m => ({ id: m.id, prog: 0, claimed: false }));
      P.missionsDay = d;
    }
    let bonus = 0;
    if (P.streakDay !== d) {
      const gap = P.streakDay ? dayNum(d) - dayNum(P.streakDay) : 99;
      P.streak = gap === 1 ? Math.min(7, P.streak + 1) : 1;
      P.streakDay = d;
      bonus = STREAK[P.streak - 1];
      P.credits += bonus;
    }
    save();
    return bonus;
  }
  function track(ev, n = 1) {
    let done = null;
    for (const m of P.missions) {
      const def = MISSIONS.find(k => k.id === m.id);
      if (!def || def.ev !== ev || m.prog >= def.goal) continue;
      m.prog = def.max ? Math.max(m.prog, n) : m.prog + n;
      if (m.prog >= def.goal) { m.prog = def.goal; done = def; }
    }
    if (done) save();
    return done;
  }
  function claim(id) {
    const m = P.missions.find(k => k.id === id), def = MISSIONS.find(k => k.id === id);
    if (!m || !def || m.claimed || m.prog < def.goal) return 0;
    m.claimed = true; P.credits += def.reward; addXP(Math.round(def.reward / 3)); save();
    return def.reward;
  }

  // ===================== Roue =====================
  const canSpinFree = () => P.wheelDay !== today();
  function spinResult() {
    const tot = WHEEL.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * tot, i = 0;
    for (; i < WHEEL.length; i++) { r -= WHEEL[i].w; if (r <= 0) break; }
    return Math.min(i, WHEEL.length - 1);
  }
  function applyPrize(i, free) {
    const p = WHEEL[i];
    if (free) P.wheelDay = today();
    let txt = p.t;
    if (p.c) P.credits += p.c;
    if (p.kit) P.kits += p.kit;
    if (p.x2) P.x2 += p.x2;
    if (p.skin) {
      const left = SKINS.filter(s => !P.skins.includes(s.id) && s.id !== 'or');
      if (left.length) { const s = left[Math.floor(Math.random() * left.length)]; P.skins.push(s.id); txt = `Camouflage « ${s.name} »`; }
      else { P.credits += 3000; txt = '3 000 ✪ (tous les camouflages possédés)'; }
    }
    if (p.c >= 2500 || p.skin) sdk.happytime();
    save();
    return txt;
  }

  // ===================== Fin de bataille =====================
  // Gains : chars détruits, perforations, équipiers, victoire, vagues ; prime × 2 si active
  function battleEnd(r) {
    let credits = r.kills * 150 + r.pens * 20 + r.crew * 12 + (r.win ? 400 : 60) + (r.waves || 0) * 120;
    let xp = r.kills * 60 + r.pens * 8 + r.crew * 5 + (r.win ? 150 : 40) + (r.waves || 0) * 50;
    let boosted = false;
    if (P.x2 > 0) { P.x2--; credits *= 2; boosted = true; }
    P.credits += credits;
    P.stats.battles++; P.stats.kills += r.kills; if (r.win) P.stats.wins++;
    const up = addXP(xp);
    save();
    return { credits, xp, up, boosted };
  }

  return {
    sdk, midgame, rewarded, hooks, RANKS, TANKS, SKINS, WHEEL, MISSIONS, STREAK, xpFor, rankName,
    get P() { return P; }, save, addXP, buyTank, canBuyTank, buySkin, grantSkin, selectSkin, skinOf,
    dailyRoll, track, claim, canSpinFree, spinResult, applyPrize, battleEnd,
    async init() { await initSDK(); sdk.loadingStart(); await load(); return dailyRoll(); },
  };
})();
