'use strict';
// Méta-jeu : SDK CrazyGames (publicités, début et fin de partie, sauvegarde), profil du joueur,
// économie (crédits, expérience, grades), chars à débloquer, camouflages, roue quotidienne,
// missions du jour et série de connexions.
const Meta = (() => {
  // ===================== SDK CrazyGames =====================
  // Le SDK v3 est chargé par index.html. Hors de CrazyGames (fichier local, page intégrée), il est
  // absent ou en mode « disabled » : les publicités récompensées sont alors simulées par un court écran.
  let SDK = null, env = 'none', adBusy = false, lastMidgame = Date.now();
  // partie en cours côté SDK : gameplayStart et gameplayStop ne partent que sur un vrai changement,
  // et jamais pendant une publicité (le départ est alors reporté à la fin de celle-ci)
  let playing = false, wantPlay = false, lastHappy = -1e9;
  const hooks = { adStart: () => {}, adEnd: () => {}, change: () => {}, mute: () => {} };
  let platformMute = false; // réglage « son coupé » du portail (SDK.game.settings.muteAudio)
  const MIDGAME_GAP = 180000; // au plus une publicité entre deux parties toutes les 3 minutes

  // Initialisation bornée à 8 s : un SDK qui ne répond pas est traité comme absent
  async function initSDK() {
    const S = window.CrazyGames && window.CrazyGames.SDK;
    if (!S) return;
    let late = false;
    try {
      await Promise.race([S.init(), new Promise(r => setTimeout(() => { late = true; r(); }, 8000))]);
      if (late) { console.warn('CrazyGames SDK init timed out'); return; }
      env = S.environment || 'crazygames';
      if (env === 'disabled') return;
      SDK = S;
      // le portail a son propre bouton « muet » : on le suit, et on écoute ses changements
      const g = SDK.game;
      if (g) {
        platformMute = !!(g.settings && g.settings.muteAudio);
        if (g.addSettingsChangeListener) g.addSettingsChangeListener(st => { platformMute = !!(st && st.muteAudio); hooks.mute(platformMute); });
      }
      if (playing) call(s => s.game.gameplayStart());
    } catch (e) { console.warn('CrazyGames SDK unavailable', e); SDK = null; env = 'none'; }
  }
  const call = (fn) => { try { if (SDK) fn(SDK); } catch (e) { console.warn(e); } };
  const sdk = {
    get env() { return env; },
    loadingStart: () => call(s => s.game.loadingStart()),
    loadingStop: () => call(s => s.game.loadingStop()),
    gameplayStart() { if (adBusy) { wantPlay = true; return; } if (playing) return; playing = true; call(s => s.game.gameplayStart()); },
    gameplayStop() { wantPlay = false; if (!playing) return; playing = false; call(s => s.game.gameplayStop()); },
    get playing() { return playing; },
    // moments de joie : au plus un toutes les 45 s, pour ne pas en abuser
    happytime() { const n = Date.now(); if (n - lastHappy < 45000) return; lastHappy = n; call(s => s.game.happytime()); },
  };
  // Le SDK est lancé dès le chargement de meta.js ; loadingStart part dès qu'il est prêt, avant la
  // construction (lourde) des modèles 3D : game.js ne démarre qu'ensuite (Meta.whenReady)
  const sdkReady = initSDK().catch(e => console.warn(e)).then(() => sdk.loadingStart());

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
    let ended = false;
    const fin = ok => {
      if (ended) return; // le SDK peut signaler deux fois la fin (erreur puis fin)
      ended = true; adBusy = false; hooks.adEnd();
      if (wantPlay) { wantPlay = false; sdk.gameplayStart(); }
      done(ok);
    };
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
  // Une publicité récompensée vue jusqu'au bout repousse aussi la prochaine publicité de mi-partie
  function rewarded(onReward, onFail) {
    requestAd('rewarded', ok => { if (ok) { lastMidgame = Date.now(); onReward(); } else if (onFail) onFail(); });
  }

  // ===================== Contenu =====================
  const RANKS = ['Private', 'Corporal', 'Lance Sergeant', 'Sergeant', 'Staff Sergeant', 'Warrant Officer', 'Officer Cadet', 'Second Lieutenant',
    'Lieutenant', 'Captain', 'Major', 'Lieutenant Colonel', 'Colonel', 'Brigadier General', 'Major General', 'Field Marshal'];
  const xpFor = lv => Math.round(300 * Math.pow(lv, 1.45)); // XP pour passer du niveau lv à lv + 1
  // Chars : prix en crédits et grade requis
  const TANKS = {
    light: { price: 0, lvl: 1 }, pz4: { price: 0, lvl: 1 }, stug: { price: 2500, lvl: 2 },
    medium: { price: 6000, lvl: 4 }, destroyer: { price: 8000, lvl: 5 }, heavy: { price: 11000, lvl: 7 }, kingtiger: { price: 18000, lvl: 10 },
  };
  // Camouflages : trois tons (couleur linéaire) et un motif (0 taches, 1 uni, 2 bandes,
  // 3 embuscade, 4 lavis d'hiver). Prix en crédits ou en publicités (ads : nombre à regarder) ;
  // flav : phrase d'ambiance affichée sur la carte.
  const SKINS = [
    { id: 'std', name: 'Standard Issue ’44', flav: 'Three-tone factory scheme. Honest steel.', rar: 'common', price: 0, pat: 0, camo: [[0.33, 0.36, 0.22], [0.20, 0.25, 0.15], [0.36, 0.27, 0.17]] },
    { id: 'gris', name: 'Panzer Grey ’40', flav: 'The colour of the Blitzkrieg.', rar: 'common', price: 800, ads: 1, pat: 1, camo: [[0.15, 0.16, 0.16], [0.13, 0.14, 0.14], [0.19, 0.2, 0.2]] },
    { id: 'jaune', name: 'Factory Dunkelgelb', flav: 'Fresh off the Henschel line.', rar: 'common', price: 900, ads: 1, pat: 1, camo: [[0.55, 0.46, 0.27], [0.5, 0.42, 0.25], [0.45, 0.38, 0.22]] },
    { id: 'dak', name: 'Afrika Korps', flav: 'Sun-bleached sand, Tobruk 1942.', rar: 'rare', price: 1800, ads: 2, pat: 0, camo: [[0.55, 0.45, 0.28], [0.5, 0.41, 0.25], [0.42, 0.36, 0.24]] },
    { id: 'koursk', name: 'Kursk Summer', flav: 'Striped for the largest tank battle ever fought.', rar: 'rare', price: 2200, ads: 2, pat: 2, camo: [[0.52, 0.45, 0.27], [0.24, 0.27, 0.14], [0.36, 0.22, 0.13]] },
    { id: 'hinter', name: 'Hinterhalt Ambush', flav: 'Light-dapple dots. Vanish under the canopy.', rar: 'rare', price: 2600, ads: 2, pat: 3, camo: [[0.52, 0.45, 0.27], [0.18, 0.24, 0.12], [0.35, 0.2, 0.13]] },
    { id: 'hiver', name: 'Winter Wash', flav: 'Lime whitewash brushed on in the field.', rar: 'rare', price: 2600, ads: 2, pat: 4, camo: [[0.8, 0.82, 0.82], [0.3, 0.33, 0.22], [0.36, 0.27, 0.17]] },
    { id: 'tigre', name: 'Tiger Stripe', flav: 'Black slashes over yellow. Pure menace.', rar: 'epic', price: 4200, ads: 3, pat: 2, camo: [[0.58, 0.48, 0.26], [0.1, 0.1, 0.08], [0.4, 0.22, 0.12]] },
    { id: 'disrupt', name: 'Tri-Tone Disruptor', flav: 'Breaks your outline at any range.', rar: 'epic', price: 4500, ads: 3, pat: 0, camo: [[0.6, 0.52, 0.32], [0.12, 0.18, 0.1], [0.42, 0.22, 0.13]] },
    { id: 'nuit', name: 'Night Operation', flav: 'For crews who hunt after dark.', rar: 'epic', price: 0, ads: 3, adOnly: true, pat: 3, camo: [[0.08, 0.09, 0.1], [0.05, 0.06, 0.07], [0.14, 0.15, 0.13]] },
    { id: 'foret', name: 'Snowbound Ardennes', flav: 'Winter 1944. The last offensive.', rar: 'epic', price: 5200, ads: 4, pat: 4, camo: [[0.86, 0.88, 0.88], [0.18, 0.24, 0.12], [0.33, 0.22, 0.14]] },
    { id: 'rouille', name: 'Rust Revenant', flav: 'Pulled from the river, back for revenge.', rar: 'legendary', price: 9000, ads: 5, pat: 0, camo: [[0.36, 0.17, 0.08], [0.2, 0.1, 0.05], [0.48, 0.3, 0.14]] },
    { id: 'or', name: 'Field Marshal Gold', flav: 'Solid gold plating. Fear is the point.', rar: 'legendary', price: 25000, pat: 1, camo: [[0.75, 0.55, 0.16], [0.6, 0.42, 0.1], [0.85, 0.68, 0.25]] },
    { id: 'parade', name: 'Victory Parade', flav: 'Olive, sand and polished brass. Made to be seen.', rar: 'legendary', price: 0, ads: 6, adOnly: true, pat: 2, camo: [[0.2, 0.24, 0.12], [0.56, 0.47, 0.3], [0.62, 0.46, 0.17]] },
  ];
  // Pièces : trois niveaux par char (Mk I à III). Effet par niveau ; coût en crédits, ou niveau + 1 publicités.
  const PARTS = [
    { id: 'engine', name: 'Maybach Tuning Kit', short: 'Engine', ic: '⚙', desc: 'Ported heads, twin carbs, governor removed: +8% horsepower per level', k: 0.08, cost: [1200, 2800, 5500] },
    { id: 'gun', name: 'Select-Lot Ammunition', short: 'Gun', ic: '◎', desc: 'Hand-picked shell lots, fresh propellant: +4% penetration per level', k: 0.04, cost: [1500, 3200, 6500] },
    { id: 'armor', name: 'Field Armor Kit', short: 'Armor', ic: '▣', desc: 'Spare track links and welded plates: +6% armor thickness per level', k: 0.06, cost: [1400, 3000, 6000] },
    { id: 'tracks', name: 'Grip Tracks', short: 'Tracks', ic: '≋', desc: 'Ice cleats and new torsion bars: +6% cornering grip per level', k: 0.06, cost: [900, 2000, 4200] },
    { id: 'optics', name: 'Zeiss Optics', short: 'Optics', ic: '◉', desc: 'Coated gunsight, new periscopes: +6% view range, −6% dispersion per level', k: 0.06, cost: [1100, 2500, 5000] },
    { id: 'loader', name: 'Veteran Loader', short: 'Loader', ic: '↻', desc: 'Loading drills, rearranged ready rack: −5% reload time, +1 ready round per level', k: 0.05, cost: [1300, 2900, 5800] },
  ];
  // Roue quotidienne : poids relatifs
  const WHEEL = [
    { t: '250 ✪', c: 250, w: 22, col: '#3b4a2c' }, { t: '500 ✪', c: 500, w: 18, col: '#5a4a24' },
    { t: 'Repair Kit', kit: 1, w: 12, col: '#2c3e4a' }, { t: '1,000 ✪', c: 1000, w: 12, col: '#4a2c2c' },
    { t: '2× Rewards', x2: 2, w: 12, col: '#3a2c4a' }, { t: '2,500 ✪', c: 2500, w: 7, col: '#2c4a3e' },
    { t: 'Camo Skin', skin: true, w: 6, col: '#4a3a1c' }, { t: '10,000 ✪', c: 10000, w: 1.5, col: '#6a5210' },
  ];
  // Missions du jour (trois tirées au sort chaque jour)
  const MISSIONS = [
    { id: 'kill5', t: 'Destroy 5 enemy tanks', ev: 'kill', goal: 5, reward: 600 },
    { id: 'kill12', t: 'Destroy 12 enemy tanks', ev: 'kill', goal: 12, reward: 1500 },
    { id: 'pen15', t: 'Score 15 penetrating hits', ev: 'pen', goal: 15, reward: 700 },
    { id: 'crew20', t: 'Knock out 20 crew members', ev: 'crew', goal: 20, reward: 800 },
    { id: 'cmd2', t: 'Snipe 2 exposed tank commanders', ev: 'cmd', goal: 2, reward: 900 },
    { id: 'win3', t: 'Win 3 battles', ev: 'win', goal: 3, reward: 1000 },
    { id: 'wave5', t: 'Reach wave 5 in Survival', ev: 'wave', goal: 5, reward: 1200, max: true },
    { id: 'ric5', t: 'Bounce 5 shots off your armor', ev: 'ricself', goal: 5, reward: 500 },
    { id: 'det2', t: 'Detonate 2 ammo racks', ev: 'det', goal: 2, reward: 1100 },
  ];
  const RARITY = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
  const MK = ['Stock', 'Mk I', 'Mk II', 'Mk III'];
  const STREAK = [200, 300, 450, 600, 800, 1000, 2000]; // récompenses de connexion, jours 1 à 7

  // ===================== Profil =====================
  // Tout ce qui est conservé tient dans ce profil, sauvegardé dans le nuage par SDK.data (compte
  // CrazyGames) et en local. Version 2 : progression de la campagne et record de survie inclus.
  const KEY = 'frontdacier.profil', VERSION = 2;
  const LEGACY = { unlocked: 'frontdacier.unlocked', survBest: 'frontdacier.survie' }; // clés de la version 1
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 864e5); };
  // qualité par défaut : moyenne sur écran très dense ou petit processeur (portables, Chromebooks)
  const defQuality = () => { try { return (window.devicePixelRatio || 1) > 1.5 || (navigator.hardwareConcurrency || 8) <= 4 ? 'moyenne' : 'haute'; } catch (e) { return 'haute'; } };
  const fresh = () => ({
    v: VERSION, credits: 600, xp: 0, level: 1, tanks: ['light', 'pz4'], skins: ['std'], skinSel: {}, kits: 1, x2: 0,
    wheelDay: '', streakDay: '', streak: 0, missionsDay: '', missions: [], stats: { battles: 0, kills: 0, wins: 0 },
    opts: { sfx: 0.8, music: 0.6, quality: defQuality(), hitcam: true, mute: false }, parts: {}, adProg: {}, featDay: '', feat: '',
    unlocked: 0, survBest: 0,
  });
  // ready : aucune sauvegarde avant la lecture du profil (sinon le profil neuf du démarrage
  // écraserait la vraie sauvegarde, en local comme dans le nuage)
  let P = fresh(), devMode = false, ready = false;
  // Remise en état d'un profil lu (ancien, corrompu ou modifié à la main) : chaque champ est vérifié,
  // les identifiants inconnus sont écartés, et les deux premiers chars sont toujours possédés.
  const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  const int = (v, d, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const unit = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };
  const str = (v, d) => typeof v === 'string' ? v : d;
  const ids = (a, ok) => Array.isArray(a) ? [...new Set(a.filter(x => typeof x === 'string' && ok(x)))] : [];
  function sanitize(o) {
    const f = fresh(), p = fresh();
    if (!isObj(o)) return p;
    p.v = int(o.v, 1, 1, VERSION);
    p.credits = int(o.credits, f.credits, 0, 1e9); p.xp = int(o.xp, 0, 0, 1e9); p.level = int(o.level, 1, 1, 999);
    p.kits = int(o.kits, f.kits, 0, 999); p.x2 = int(o.x2, 0, 0, 999); p.streak = int(o.streak, 0, 0, STREAK.length);
    p.unlocked = int(o.unlocked, 0, 0, 99); p.survBest = int(o.survBest, 0, 0, 9999);
    for (const k of ['wheelDay', 'streakDay', 'missionsDay', 'featDay']) p[k] = str(o[k], '');
    p.feat = SKINS.some(k => k.id === o.feat) ? o.feat : '';
    p.tanks = ids(o.tanks, id => id in TANKS);
    for (const id of ['pz4', 'light']) if (!p.tanks.includes(id)) p.tanks.unshift(id);
    p.skins = ids(o.skins, id => SKINS.some(k => k.id === id));
    if (!p.skins.includes('std')) p.skins.unshift('std');
    if (isObj(o.skinSel)) for (const [t, k] of Object.entries(o.skinSel)) if (t in TANKS && p.skins.includes(k)) p.skinSel[t] = k;
    if (isObj(o.parts)) for (const [t, ps] of Object.entries(o.parts)) {
      if (!(t in TANKS) || !isObj(ps)) continue;
      for (const d of PARTS) { const lv = int(ps[d.id], 0, 0, 3); if (lv) (p.parts[t] = p.parts[t] || {})[d.id] = lv; }
    }
    if (isObj(o.adProg)) for (const [k, n] of Object.entries(o.adProg)) { const v = int(n, 0, 0, 99); if (v) p.adProg[k] = v; }
    if (Array.isArray(o.missions)) p.missions = o.missions.filter(m => isObj(m) && MISSIONS.some(d => d.id === m.id)).slice(0, 3)
      .map(m => ({ id: m.id, prog: int(m.prog, 0, 0, 1e6), claimed: m.claimed === true }));
    if (p.missions.length < 3) p.missionsDay = ''; // missions illisibles : nouveau tirage
    if (isObj(o.stats)) for (const k of ['battles', 'kills', 'wins']) p.stats[k] = int(o.stats[k], 0, 0, 1e9);
    if (isObj(o.opts)) {
      const q = o.opts;
      p.opts.sfx = unit(q.sfx, f.opts.sfx); p.opts.music = unit(q.music, f.opts.music);
      p.opts.quality = ['haute', 'moyenne', 'basse'].includes(q.quality) ? q.quality : f.opts.quality;
      p.opts.hitcam = q.hitcam !== false; p.opts.mute = q.mute === true;
    }
    return p;
  }
  // Passage d'une version à la suivante ; v1 : campagne et record de survie dans des clés à part
  function migrate(p) {
    if (p.v < 2) {
      let ls = null;
      try { ls = localStorage; } catch (e) { /* stockage indisponible */ }
      if (ls) for (const [k, key] of Object.entries(LEGACY)) {
        try { p[k] = Math.max(p[k], int(ls.getItem(key), 0, 0, 9999)); if (!devMode) ls.removeItem(key); } catch (e) { /* */ }
      }
      p.v = 2;
    }
    return p;
  }
  function parse(raw) {
    let o = {}; // pas de profil : on part d'une « version 1 » vide, pour reprendre d'éventuelles anciennes clés
    if (raw) try { o = JSON.parse(raw); } catch (e) { console.warn('Unreadable profile, starting fresh', e); o = { v: VERSION }; }
    if (!isObj(o)) o = { v: VERSION };
    return migrate(sanitize(o));
  }
  async function load() {
    let raw = null;
    try { if (SDK && SDK.data) raw = SDK.data.getItem(KEY); } catch (e) { /* */ }
    if (!raw) try { raw = localStorage.getItem(KEY); } catch (e) { /* stockage indisponible */ }
    P = parse(raw);
    ready = true;
  }
  function save() {
    if (devMode || !ready) { hooks.change(); return; } // profil jetable des réglages de développement
    const raw = JSON.stringify(P);
    try { if (SDK && SDK.data) SDK.data.setItem(KEY, raw); } catch (e) { /* */ }
    try { localStorage.setItem(KEY, raw); } catch (e) { /* */ }
    hooks.change();
  }
  // Réglages de développement : profil neuf (tous les chars, tous les secteurs) jamais sauvegardé,
  // le vrai profil reste intact
  function devProfile() { devMode = true; const o = P.opts; P = fresh(); P.opts = o; P.tanks = Object.keys(TANKS); P.unlocked = 99; }
  // Effacement complet de la progression (nuage et local) ; seuls les réglages sont gardés
  function reset() {
    const opts = P.opts;
    P = fresh(); P.opts = opts;
    if (!devMode) {
      try { if (SDK && SDK.data) SDK.data.removeItem(KEY); } catch (e) { /* */ }
      try { for (const k of Object.keys(localStorage)) if (k.startsWith('frontdacier.')) localStorage.removeItem(k); } catch (e) { /* */ }
    }
    save();
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
  // camouflage du jour : −50 %
  function featured() {
    const d = today();
    if (P.featDay !== d) { const pool = SKINS.filter(k => k.price > 0 && !P.skins.includes(k.id)); P.feat = pool.length ? pool[Math.floor(Math.random() * pool.length)].id : ''; P.featDay = d; save(); }
    return P.feat;
  }
  const skinPrice = s => s.id === featured() ? Math.round(s.price / 2) : s.price;
  function buySkin(id) {
    const s = SKINS.find(k => k.id === id);
    if (!s || P.skins.includes(id) || s.adOnly || P.credits < skinPrice(s)) return false;
    P.credits -= skinPrice(s); P.skins.push(id); save(); return true;
  }
  // une publicité de plus vers le déblocage ; renvoie vrai quand le camouflage est obtenu
  function skinAd(id) {
    const s = SKINS.find(k => k.id === id);
    if (!s || !s.ads || P.skins.includes(id)) return false;
    const k = 'skin:' + id; P.adProg[k] = (P.adProg[k] || 0) + 1;
    if (P.adProg[k] >= s.ads) { P.skins.push(id); delete P.adProg[k]; save(); return true; }
    save(); return false;
  }
  const adsLeft = (key, need) => need - (P.adProg[key] || 0);
  function grantSkin(id) { if (!P.skins.includes(id)) { P.skins.push(id); save(); } }
  function selectSkin(tank, id) { if (P.skins.includes(id)) { P.skinSel[tank] = id; save(); } }
  const skinOf = tank => SKINS.find(k => k.id === (P.skinSel[tank] || 'std')) || SKINS[0];
  const partLv = (tank, part) => (P.parts[tank] && P.parts[tank][part]) || 0;
  function setPart(tank, part, lv) { P.parts[tank] = P.parts[tank] || {}; P.parts[tank][part] = lv; }
  function buyPart(tank, part) {
    const d = PARTS.find(k => k.id === part), lv = partLv(tank, part);
    if (!d || lv >= 3 || P.credits < d.cost[lv]) return false;
    P.credits -= d.cost[lv]; setPart(tank, part, lv + 1); save(); return true;
  }
  function partAd(tank, part) {
    const lv = partLv(tank, part);
    if (lv >= 3) return false;
    const k = `part:${tank}:${part}`; P.adProg[k] = (P.adProg[k] || 0) + 1;
    if (P.adProg[k] >= lv + 1) { setPart(tank, part, lv + 1); delete P.adProg[k]; save(); return true; }
    save(); return false;
  }
  // multiplicateurs appliqués au char du joueur
  function mods(tank) {
    const L = id => partLv(tank, id), K = id => PARTS.find(k => k.id === id).k;
    return {
      hp: 1 + K('engine') * L('engine'), pen: 1 + K('gun') * L('gun'), armor: 1 + K('armor') * L('armor'),
      grip: 1 + K('tracks') * L('tracks'), optic: 1 + K('optics') * L('optics'),
      reload: 1 - K('loader') * L('loader'), ready: L('loader'), armorLv: L('armor'),
    };
  }

  // ===================== Missions et série =====================
  // Passage au jour suivant : nouvelles missions et prime de présence. Appelée au démarrage, au retour
  // au menu et à chaque changement d'onglet (une session peut passer minuit) ; sans effet le même jour.
  function dailyRoll() {
    const d = today();
    if (P.missionsDay === d && P.streakDay === d) return 0;
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
      const left = SKINS.filter(s => !P.skins.includes(s.id) && s.rar !== 'legendary');
      if (left.length) { const s = left[Math.floor(Math.random() * left.length)]; P.skins.push(s.id); txt = `Camo: ${s.name}`; }
      else { P.credits += 3000; txt = '3,000 ✪ (all camos owned)'; }
    }
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
    sdk, midgame, rewarded, hooks, adActive: () => adBusy, get platformMute() { return platformMute; }, RANKS, RARITY, MK, TANKS, SKINS, PARTS, WHEEL, MISSIONS, STREAK, xpFor, rankName,
    get P() { return P; }, save, reset, parse, addXP,
    devProfile, devUse(p) { if (devMode) P = p; },
    get dev() { return devMode; }, buyTank, canBuyTank, buySkin, grantSkin, selectSkin, skinOf,
    featured, skinPrice, skinAd, adsLeft, partLv, buyPart, partAd, mods,
    dailyRoll, track, claim, canSpinFree, spinResult, applyPrize, battleEnd,
    whenReady: fn => sdkReady.then(fn),
    // dev : profil jetable (le vrai profil est lu pour ses réglages, puis laissé intact)
    async init(o = {}) { await sdkReady; await load(); if (o.dev) devProfile(); return dailyRoll(); },
  };
})();
