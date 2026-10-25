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
    // type d'appareil annoncé par le portail ('desktop', 'tablet', 'mobile'), ou null hors CrazyGames
    get device() { try { return (SDK && SDK.user && SDK.user.systemInfo && SDK.user.systemInfo.device && SDK.user.systemInfo.device.type) || null; } catch (e) { return null; } },
    loadingStart: () => call(s => s.game.loadingStart()),
    loadingStop: () => call(s => s.game.loadingStop()),
    gameplayStart() { if (adBusy) { wantPlay = true; return; } if (playing) return; playing = true; clearBanners(); call(s => s.game.gameplayStart()); },
    gameplayStop() { wantPlay = false; if (!playing) return; playing = false; call(s => s.game.gameplayStop()); },
    get playing() { return playing; },
    get banners() { return !!(SDK && SDK.banner); },
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

  // Bannières : seulement sur le menu et l'écran de résultats, jamais en bataille (gameplayStart les
  // retire). Un emplacement ne se recharge qu'une fois par minute : une demande trop tôt est reportée,
  // et abandonnée si l'emplacement n'est plus affiché d'ici là.
  const bannerAt = {}, bannerWait = {};
  function banner(id) {
    if (!SDK || !SDK.banner) return;
    clearTimeout(bannerWait[id]);
    const wait = 61000 - (Date.now() - (bannerAt[id] || -1e9));
    if (wait > 0) { bannerWait[id] = setTimeout(() => banner(id), wait); return; }
    const el = document.getElementById(id);
    if (!el || !el.offsetWidth || playing || adBusy) return;
    bannerAt[id] = Date.now();
    try {
      const r = SDK.banner.requestResponsiveBanner(id);
      if (r && r.catch) r.catch(e => console.warn('Banner unavailable', e));
    } catch (e) { console.warn('Banner unavailable', e); }
  }
  function clearBanners() {
    for (const id in bannerWait) clearTimeout(bannerWait[id]);
    call(s => { if (s.banner) s.banner.clearAllBanners(); });
  }

  // ===================== Contenu =====================
  const RANKS = ['Private', 'Corporal', 'Lance Sergeant', 'Sergeant', 'Staff Sergeant', 'Warrant Officer', 'Officer Cadet', 'Second Lieutenant',
    'Lieutenant', 'Captain', 'Major', 'Lieutenant Colonel', 'Colonel', 'Brigadier General', 'Major General', 'Field Marshal'];
  // XP pour passer du niveau lv à lv + 1 : grade et crédits ouvrent les chars ensemble (un nouveau char
  // vers les vagues 2, 9, 21, 40 et 74 en jouant normalement)
  const xpFor = lv => Math.round(260 * Math.pow(lv, 1.3));
  const cumXP = lv => { let s = 0; for (let i = 1; i < lv; i++) s += xpFor(i); return s; };
  // Chars : prix en crédits, grade requis et palier (tier : multiplie le prix des pièces). L'ordre est
  // celui de la progression ; un char ajouté ici apparaît partout (objectifs, maîtrise, transfert).
  // br : cote de bataille (composition des vagues et gains) ; nat : nation ; svc : service au front, de
  // la première action à la fin de la guerre (années décimales : 1943.5 = juillet 1943)
  const TANKS = {
    light: { price: 0, lvl: 1, tier: 0.5, br: 1.0, nat: 'de', svc: [1943.7, 1945.4] }, pz4: { price: 0, lvl: 1, tier: 0.6, br: 2.0, nat: 'de', svc: [1942.25, 1945.4] },
    stug: { price: 2500, lvl: 2, tier: 0.7, br: 2.0, nat: 'de', svc: [1942.25, 1945.4] }, medium: { price: 5500, lvl: 3, tier: 0.9, br: 3.0, nat: 'de', svc: [1943.5, 1945.4] },
    destroyer: { price: 9000, lvl: 5, tier: 1, br: 3.3, nat: 'de', svc: [1944.55, 1945.4] }, heavy: { price: 14000, lvl: 6, tier: 1.2, br: 3.3, nat: 'de', svc: [1942.7, 1945.4] },
    kingtiger: { price: 24000, lvl: 8, tier: 1.5, br: 4.0, nat: 'de', svc: [1944.5, 1945.4] },
    t34: { price: 1200, lvl: 1, tier: 0.6, br: 2.0, nat: 'su', svc: [1942.7, 1945.4] }, kv1s: { price: 3500, lvl: 2, tier: 0.75, br: 2.3, nat: 'su', svc: [1942.65, 1945.4] },
    t3485: { price: 6500, lvl: 4, tier: 0.9, br: 2.7, nat: 'su', svc: [1944.2, 1945.4] }, is2: { price: 16000, lvl: 7, tier: 1.25, br: 3.7, nat: 'su', svc: [1944.4, 1945.4] },
    m4a1: { price: 1200, lvl: 1, tier: 0.6, br: 2.0, nat: 'us', svc: [1942.8, 1945.4] }, m10: { price: 4000, lvl: 3, tier: 0.7, br: 2.3, nat: 'us', svc: [1943.2, 1945.4] },
    m4a3e8: { price: 7000, lvl: 4, tier: 0.9, br: 2.7, nat: 'us', svc: [1944.92, 1945.4] }, firefly: { price: 9500, lvl: 5, tier: 0.95, br: 2.8, nat: 'uk', svc: [1944.45, 1945.4] },
  };
  // Nations, camps et groupes du garage (Américains et Britanniques ensemble)
  const NATIONS = { de: { name: 'Germany', side: 0 }, su: { name: 'USSR', side: 1 }, us: { name: 'USA', side: 1 }, uk: { name: 'United Kingdom', side: 1 } };
  const GROUPS = [{ id: 'de', name: 'Germany', nats: ['de'] }, { id: 'su', name: 'USSR', nats: ['su'] }, { id: 'wa', name: 'USA & UK', nats: ['us', 'uk'] }];
  const sideOf = id => NATIONS[TANKS[id].nat].side; // 0 Axe, 1 Alliés
  const groupOf = id => GROUPS.find(g => g.nats.includes(TANKS[id].nat)).id;
  // Ordres de bataille historiques de chaque champ de bataille (même ordre que les secteurs) : date,
  // théâtre, nation alliée principale, viviers de l'Axe [0] et des Alliés [1], camouflages des chars de
  // l'IA [Axe, Alliés]. Chaque char doit être en service à la date (vérifié au chargement et par les tests).
  const FRONTS = [
    { date: 1943.53, theatre: 'east', nat: 'su', pools: [['heavy', 'medium', 'pz4', 'stug'], ['t34', 'kv1s']], camo: ['koursk', 'su_4bo'] }, // Prokhorovka, 12 juillet 1943
    { date: 1944.96, theatre: 'west', nat: 'us', pools: [['light', 'pz4', 'stug', 'medium', 'destroyer', 'kingtiger'], ['m4a1', 'm10', 'm4a3e8', 'firefly']], camo: ['std', 'us_od'] }, // 16 décembre 1944
    { date: 1943.04, theatre: 'east', nat: 'su', pools: [['pz4', 'stug'], ['t34', 'kv1s']], camo: ['hiver', 'su_winter'] }, // janvier 1943
    { date: 1942.84, theatre: 'africa', nat: 'uk', pools: [['pz4'], ['m4a1']], camo: ['dak', 'uk_desert'] }, // Tel el Aqqaqir, 2 novembre 1942
    { date: 1944.99, theatre: 'west', nat: 'us', pools: [['light', 'pz4', 'stug', 'medium', 'destroyer', 'kingtiger'], ['m4a1', 'm10', 'm4a3e8']], camo: ['foret', 'us_snow'] }, // 26 décembre 1944
  ];
  const front = lv => FRONTS[Math.max(0, Math.min(FRONTS.length - 1, lv | 0))];
  // chars d'un vivier hors de leur période de service (doit rester vide)
  const anachronisms = () => FRONTS.flatMap((f, i) => f.pools.flat().filter(id => !TANKS[id] || f.date < TANKS[id].svc[0] || f.date > TANKS[id].svc[1]).map(id => `${i}:${id}`));
  // Composition par cote : pour chaque décalage, le char du vivier dont la cote est la plus proche de
  // br + décalage (ex aequo tirés au sort)
  function lineup(pool, br, offs, rnd = Math.random) {
    return offs.map(o => {
      let best = [], bd = 1e9;
      for (const id of pool) { const d = Math.abs(TANKS[id].br - br - o); if (d < bd - 1e-9) { bd = d; best = [id]; } else if (d < bd + 1e-9) best.push(id); }
      return best[Math.floor(rnd() * best.length)];
    });
  }
  // Promotion : 500 + 100 × nouveau niveau ✪, plus ces récompenses de grade
  const RANK_REW = { 3: { kit: 1 }, 6: { skin: 'koursk' }, 9: { skin: 'tigre' }, 12: { skin: 'rouille' }, 16: { skin: 'or' } };
  const rankCr = lv => 500 + 100 * lv;
  // Camouflages : trois tons (couleur linéaire) et un motif (0 taches, 1 uni, 2 bandes,
  // 3 embuscade, 4 lavis d'hiver). Prix en crédits ou en publicités (ads : une publicité ≈ 1 000 ✪) ;
  // flav : phrase d'ambiance affichée sur la carte ; bond : exclusif du bon de guerre, jamais vendu.
  const SKINS = [
    { id: 'std', grp: 'de', name: 'Standard Issue ’44', flav: 'Three-tone factory scheme. Honest steel.', rar: 'common', price: 0, pat: 0, camo: [[0.33, 0.36, 0.22], [0.20, 0.25, 0.15], [0.36, 0.27, 0.17]] },
    { id: 'gris', grp: 'de', name: 'Panzer Grey ’40', flav: 'The colour of the Blitzkrieg.', rar: 'common', price: 800, ads: 1, pat: 1, camo: [[0.15, 0.16, 0.16], [0.13, 0.14, 0.14], [0.19, 0.2, 0.2]] },
    { id: 'jaune', grp: 'de', name: 'Factory Dunkelgelb', flav: 'Fresh off the Henschel line.', rar: 'common', price: 900, ads: 1, pat: 1, camo: [[0.55, 0.46, 0.27], [0.5, 0.42, 0.25], [0.45, 0.38, 0.22]] },
    { id: 'dak', grp: 'de', name: 'Afrika Korps', flav: 'Sun-bleached sand, Tobruk 1942.', rar: 'rare', price: 1800, ads: 2, pat: 0, camo: [[0.55, 0.45, 0.28], [0.5, 0.41, 0.25], [0.42, 0.36, 0.24]] },
    { id: 'koursk', grp: 'de', name: 'Kursk Summer', flav: 'Striped for the largest tank battle ever fought.', rar: 'rare', price: 2200, ads: 3, pat: 2, camo: [[0.52, 0.45, 0.27], [0.24, 0.27, 0.14], [0.36, 0.22, 0.13]] },
    { id: 'hinter', grp: 'de', name: 'Hinterhalt Ambush', flav: 'Light-dapple dots. Vanish under the canopy.', rar: 'rare', price: 2600, ads: 3, pat: 3, camo: [[0.52, 0.45, 0.27], [0.18, 0.24, 0.12], [0.35, 0.2, 0.13]] },
    { id: 'hiver', grp: 'de', name: 'Winter Wash', flav: 'Lime whitewash brushed on in the field.', rar: 'rare', price: 2600, ads: 3, pat: 4, camo: [[0.8, 0.82, 0.82], [0.3, 0.33, 0.22], [0.36, 0.27, 0.17]] },
    { id: 'tigre', grp: 'de', name: 'Tiger Stripe', flav: 'Black slashes over yellow. Pure menace.', rar: 'epic', price: 4200, ads: 5, pat: 2, camo: [[0.58, 0.48, 0.26], [0.1, 0.1, 0.08], [0.4, 0.22, 0.12]] },
    { id: 'disrupt', grp: 'de', name: 'Tri-Tone Disruptor', flav: 'Breaks your outline at any range.', rar: 'epic', price: 4500, ads: 5, pat: 0, camo: [[0.6, 0.52, 0.32], [0.12, 0.18, 0.1], [0.42, 0.22, 0.13]] },
    { id: 'nuit', name: 'Night Operation', flav: 'For crews who hunt after dark.', rar: 'epic', price: 0, ads: 3, adOnly: true, pat: 3, camo: [[0.08, 0.09, 0.1], [0.05, 0.06, 0.07], [0.14, 0.15, 0.13]] },
    { id: 'foret', grp: 'de', name: 'Snowbound Ardennes', flav: 'Winter 1944. The last offensive.', rar: 'epic', price: 5200, ads: 6, pat: 4, camo: [[0.86, 0.88, 0.88], [0.18, 0.24, 0.12], [0.33, 0.22, 0.14]] },
    { id: 'rouille', name: 'Rust Revenant', flav: 'Pulled from the river, back for revenge.', rar: 'legendary', price: 9000, ads: 9, pat: 0, camo: [[0.36, 0.17, 0.08], [0.2, 0.1, 0.05], [0.48, 0.3, 0.14]] },
    { id: 'or', name: 'Field Marshal Gold', flav: 'Solid gold plating. Fear is the point.', rar: 'legendary', price: 25000, pat: 1, camo: [[0.75, 0.55, 0.16], [0.6, 0.42, 0.1], [0.85, 0.68, 0.25]] },
    { id: 'parade', name: 'Victory Parade', flav: 'Olive, sand and polished brass. Made to be seen.', rar: 'legendary', price: 0, ads: 6, adOnly: true, pat: 2, camo: [[0.2, 0.24, 0.12], [0.56, 0.47, 0.3], [0.62, 0.46, 0.17]] },
    // camouflages soviétiques et alliés (grp : groupe du garage ; sans grp, pour tous les chars)
    { id: 'su_4bo', grp: 'su', name: '4BO Protective Green', flav: 'Factory green, straight off the Nizhny Tagil line.', rar: 'common', price: 0, pat: 1, camo: [[0.16, 0.19, 0.09], [0.13, 0.16, 0.08], [0.2, 0.22, 0.11]] },
    { id: 'su_winter', grp: 'su', name: 'Winter Whitewash ’42', flav: 'Chalk and lime brushed over 4BO on the Volga.', rar: 'rare', price: 2200, ads: 3, pat: 4, camo: [[0.78, 0.8, 0.8], [0.16, 0.19, 0.09], [0.12, 0.14, 0.07]] },
    { id: 'su_tri', grp: 'su', name: 'Kursk Three-Tone', flav: '4BO green with 6K brown and 7K sand bands, summer 1943.', rar: 'epic', price: 4200, ads: 5, pat: 2, camo: [[0.16, 0.19, 0.09], [0.22, 0.14, 0.07], [0.44, 0.38, 0.23]] },
    { id: 'us_od', grp: 'wa', name: 'Olive Drab No. 9', flav: 'Lusterless olive drab, by the gallon.', rar: 'common', price: 0, pat: 1, camo: [[0.13, 0.14, 0.065], [0.11, 0.12, 0.06], [0.16, 0.16, 0.08]] },
    { id: 'uk_desert', grp: 'wa', name: 'Desert Pink ZI', flav: 'Pink sand and dark olive green, Alamein 1942.', rar: 'rare', price: 2400, ads: 3, pat: 0, camo: [[0.62, 0.48, 0.34], [0.2, 0.22, 0.12], [0.5, 0.42, 0.3]] },
    { id: 'us_bocage', grp: 'wa', name: 'Normandy Bocage', flav: 'Black stripes over olive drab, hedgerow country.', rar: 'rare', price: 2400, ads: 3, pat: 2, camo: [[0.13, 0.14, 0.065], [0.04, 0.04, 0.035], [0.22, 0.2, 0.12]] },
    { id: 'us_snow', grp: 'wa', name: 'Bulge Whitewash', flav: 'Lime and bedsheets, Bastogne, Christmas 1944.', rar: 'rare', price: 2600, ads: 3, pat: 4, camo: [[0.8, 0.82, 0.83], [0.13, 0.14, 0.065], [0.1, 0.1, 0.06]] },
    { id: 'uk_caunter', grp: 'wa', name: 'Caunter Scheme', flav: 'Light stone, silver grey and slate: the Western Desert dazzle.', rar: 'epic', price: 4400, ads: 5, pat: 2, camo: [[0.6, 0.55, 0.4], [0.32, 0.36, 0.38], [0.16, 0.19, 0.22]] },
    { id: 'ochre', name: 'Citadel Ochre', flav: 'War Bond exclusive. Earned at the front, never sold.', rar: 'epic', price: 0, bond: true, pat: 2, camo: [[0.62, 0.44, 0.2], [0.3, 0.24, 0.12], [0.46, 0.3, 0.14]] },
    { id: 'ember', name: 'Bagration Ember', flav: 'War Bond exclusive. Forged in the summer storm.', rar: 'legendary', price: 0, bond: true, pat: 3, camo: [[0.22, 0.1, 0.06], [0.5, 0.2, 0.08], [0.12, 0.1, 0.09]] },
    { id: 'marsh', name: 'Market Garden Marsh', flav: 'War Bond exclusive. Polder green, bridge too far.', rar: 'epic', price: 0, bond: true, pat: 0, camo: [[0.3, 0.36, 0.2], [0.16, 0.2, 0.12], [0.44, 0.4, 0.26]] },
    { id: 'frost', name: 'Rhine Frost', flav: 'War Bond exclusive. Ice-blue steel for the last winter.', rar: 'legendary', price: 0, bond: true, pat: 4, camo: [[0.7, 0.78, 0.84], [0.2, 0.26, 0.3], [0.42, 0.48, 0.52]] },
  ];
  // camouflages exclusifs du bon de guerre, par paire (palier 15, palier 30), en alternance d'un mois à l'autre
  const BOND_SKINS = [['ochre', 'ember'], ['marsh', 'frost']];
  // Pièces : trois niveaux par char (Mk I à III). Effet par niveau ; coût de base (× palier du char),
  // ou une publicité par tranche de 1 000 ✪.
  const PARTS = [
    { id: 'engine', name: 'Maybach Tuning Kit', short: 'Engine', ic: '⚙', desc: 'Ported heads, twin carbs, governor removed: +8% horsepower per level', k: 0.08, cost: [1200, 2800, 5500] },
    { id: 'gun', name: 'Select-Lot Ammunition', short: 'Gun', ic: '◎', desc: 'Hand-picked shell lots, fresh propellant: +4% penetration per level', k: 0.04, cost: [1500, 3200, 6500] },
    { id: 'armor', name: 'Field Armor Kit', short: 'Armor', ic: '▣', desc: 'Spare track links and welded plates: +6% armor thickness per level', k: 0.06, cost: [1400, 3000, 6000] },
    { id: 'tracks', name: 'Grip Tracks', short: 'Tracks', ic: '≋', desc: 'Ice cleats and new torsion bars: +6% cornering grip per level', k: 0.06, cost: [900, 2000, 4200] },
    { id: 'optics', name: 'Zeiss Optics', short: 'Optics', ic: '◉', desc: 'Coated gunsight, new periscopes: +6% view range, −6% dispersion per level', k: 0.06, cost: [1100, 2500, 5000] },
    { id: 'loader', name: 'Veteran Loader', short: 'Loader', ic: '↻', desc: 'Loading drills, rearranged ready rack: −5% reload time, +1 ready round per level', k: 0.05, cost: [1300, 2900, 5800] },
  ];
  const partCost = (tank, part, lv) => { const d = PARTS.find(k => k.id === part), t = TANKS[tank]; return d && lv < 3 ? Math.round(d.cost[lv] * (t ? t.tier : 1) / 50) * 50 : 0; };
  const adsFor = cr => Math.max(1, Math.ceil(cr / 1000));
  // Roue quotidienne : poids relatifs
  const WHEEL = [
    { t: '250 ✪', c: 250, w: 22, col: '#3b4a2c' }, { t: '500 ✪', c: 500, w: 18, col: '#5a4a24' },
    { t: 'Repair Kit', kit: 1, w: 12, col: '#2c3e4a' }, { t: '1,000 ✪', c: 1000, w: 12, col: '#4a2c2c' },
    { t: '2× Rewards', x2: 2, w: 12, col: '#3a2c4a' }, { t: '2,500 ✪', c: 2500, w: 7, col: '#2c4a3e' },
    { t: 'Camo Skin', skin: true, w: 6, col: '#4a3a1c' }, { t: '10,000 ✪', c: 10000, w: 1.5, col: '#6a5210' },
  ];
  const AD_SPINS = 3; // tours de roue par publicité, par jour
  // Missions du jour (trois tirées au sort chaque jour, jamais deux sur le même événement) ;
  // m : mode de jeu nécessaire, max : la progression garde la meilleure valeur au lieu d'additionner
  const MISSIONS = [
    { id: 'kill5', t: 'Destroy 5 enemy tanks', ev: 'kill', goal: 5, reward: 600 },
    { id: 'kill12', t: 'Destroy 12 enemy tanks', ev: 'kill', goal: 12, reward: 1500 },
    { id: 'pen15', t: 'Score 15 penetrating hits', ev: 'pen', goal: 15, reward: 700 },
    { id: 'crew20', t: 'Knock out 20 crew members', ev: 'crew', goal: 20, reward: 800 },
    { id: 'cmd2', t: 'Snipe 2 exposed tank commanders', ev: 'cmd', goal: 2, reward: 900 },
    { id: 'win3', t: 'Win 3 battles', ev: 'win', goal: 3, reward: 1000 },
    { id: 'wave5', t: 'Reach wave 5 in Survival', ev: 'wave', goal: 5, reward: 1200, max: true, m: 'survie' },
    { id: 'ric5', t: 'Bounce 5 shots off your armor', ev: 'ricself', goal: 5, reward: 500 },
    { id: 'det2', t: 'Detonate 2 ammo racks', ev: 'det', goal: 2, reward: 1100 },
    { id: 'fire3', t: 'Set 3 enemy tanks on fire', ev: 'fire', goal: 3, reward: 900 },
    { id: 'bail3', t: 'Make 3 enemy crews bail out', ev: 'bail', goal: 3, reward: 1000 },
    { id: 'drv5', t: 'Knock out 5 enemy drivers', ev: 'drv', goal: 5, reward: 900 },
    { id: 'duelwin', t: 'Win a Duel match', ev: 'duelwin', goal: 1, reward: 900, m: 'duel' },
    { id: 'killhe', t: 'Destroy 2 tanks with HEAT or HE', ev: 'killhe', goal: 2, reward: 900 },
    { id: 'snipe3', t: 'Destroy 3 tanks at 400 m or more', ev: 'snipe', goal: 3, reward: 1000 },
    { id: 'flank5', t: 'Score 5 penetrations on side or rear plates', ev: 'flank', goal: 5, reward: 800 },
    { id: 'mg10', t: 'Knock out 10 crew with the machine gun', ev: 'mg', goal: 10, reward: 800 },
    { id: 'wintd', t: 'Win a battle in a turretless tank destroyer', ev: 'wintd', goal: 1, reward: 700 },
    { id: 'clean', t: 'Win a battle without being penetrated', ev: 'untouched', goal: 1, reward: 1000 },
    { id: 'sector', t: 'Conquer a campaign sector', ev: 'sector', goal: 1, reward: 1500, m: 'campagne' },
    { id: 'surv10', t: 'Repel 10 Survival waves in total', ev: 'survwave', goal: 10, reward: 1200, m: 'survie' },
    { id: 'medal3', t: 'Earn 3 battle medals', ev: 'medal', goal: 3, reward: 800 },
    { id: 'double', t: 'Score a Double Kill', ev: 'double', goal: 1, reward: 900 },
    { id: 'heavy3', t: 'Destroy 3 Tigers or King Tigers', ev: 'killheavy', goal: 3, reward: 1100 },
    { id: 'mod10', t: 'Destroy 10 enemy modules', ev: 'mod', goal: 10, reward: 600 },
    { id: 'fight4', t: 'Fight 4 battles', ev: 'battle', goal: 4, reward: 500 },
    { id: 'star3', t: 'Earn 3 stars on a campaign sector', ev: 'star3', goal: 1, reward: 1500, m: 'campagne' },
  ];
  // Ordres de la semaine (trois chaque lundi) ; skin : rareté du camouflage offert en plus
  const WEEKLY = [
    { id: 'w_kill60', t: 'Destroy 60 enemy tanks', ev: 'kill', goal: 60, reward: 6000 },
    { id: 'w_pen300', t: 'Score 300 penetrating hits', ev: 'pen', goal: 300, reward: 5000 },
    { id: 'w_win25', t: 'Win 25 battles', ev: 'win', goal: 25, reward: 4000, skin: 'epic' },
    { id: 'w_crew150', t: 'Knock out 150 crew members', ev: 'crew', goal: 150, reward: 4500 },
    { id: 'w_medal25', t: 'Earn 25 battle medals', ev: 'medal', goal: 25, reward: 4000 },
    { id: 'w_sector5', t: 'Conquer 5 campaign sectors', ev: 'sector', goal: 5, reward: 5000 },
  ];
  const RARITY = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
  const MK = ['Stock', 'Mk I', 'Mk II', 'Mk III'];
  // Série de connexions : cycle de 7 jours qui recommence ; le 7e jour est une caisse de ravitaillement
  const STREAK = [200, 300, 450, 600, 800, 1000, 2000];
  const CRATE_MS = 4 * 3600e3, CRATE = [150, 400]; // caisse de campagne gratuite toutes les 4 h
  // Médailles de bataille : prime immédiate (c) ; chaque médaille a trois rangs de collection
  const MEDALS = [
    { id: 'first_blood', name: 'First Blood', ic: '🩸', d: 'Score the first kill of the battle', c: 100 },
    { id: 'double', name: 'Double Kill', ic: '✌', d: 'Destroy 2 tanks within 10 s', c: 150 },
    { id: 'blitz', name: 'Blitzkrieg', ic: '⚡', d: 'Destroy 3 tanks within 15 s', c: 300 },
    { id: 'fireworks', name: 'Fireworks', ic: '✹', d: 'Destroy a tank by detonating its ammunition', c: 100 },
    { id: 'sniper', name: 'Sharpshooter', ic: '⌖', d: 'Destroy a tank at 500 m or more', c: 150 },
    { id: 'headhunter', name: 'Headhunter', ic: '☠', d: 'Take out an exposed tank commander', c: 75 },
    { id: 'steel_wall', name: 'Steel Wall', ic: '▣', d: 'Bounce 5 shots off your armor in one battle', c: 120 },
    { id: 'untouched', name: 'Untouchable', ic: '✦', d: 'Win without being penetrated', c: 200 },
    { id: 'ace', name: 'Tank Ace', ic: '★', d: 'Destroy 3 enemy tanks in one battle', c: 300 },
    { id: 'comeback', name: 'Comeback', ic: '↺', d: 'Destroy a tank after a field repair', c: 100 },
    { id: 'oneshot', name: 'One Shot', ic: '➊', d: 'Destroy a tank with your first hit on it', c: 60 },
    { id: 'last_stand', name: 'Last Stand', ic: '⚑', d: 'Destroy a tank as the last one standing in your team', c: 200 },
  ];
  // Succès : rangs de collection des médailles (1, 10, 50) et états de service ; chacun paie une fois
  const MEDAL_TIERS = [[1, 500, 'Bronze'], [10, 1500, 'Silver'], [50, 4000, 'Gold']];
  const CAREER = [
    { id: 'kills', name: 'Tank Killer', d: 'Destroy {g} enemy tanks', g: [10, 100, 500], c: [500, 2500, 8000], v: () => P.stats.kills },
    { id: 'wins', name: 'Victor', d: 'Win {g} battles', g: [10, 50, 200], c: [500, 2000, 6000], v: () => P.stats.wins },
    { id: 'battles', name: 'Old Soldier', d: 'Fight {g} battles', g: [25, 100, 400], c: [400, 1500, 5000], v: () => P.stats.battles },
    { id: 'rank', name: 'Career Officer', d: 'Reach level {g}', g: [5, 10, 16], c: [800, 2500, 8000], v: () => P.level },
    { id: 'garage', name: 'Collector', d: 'Own {g} tanks', g: [4, 7], c: [1000, 5000], v: () => P.tanks.length },
    { id: 'camos', name: 'Fashion Under Fire', d: 'Own {g} camos', g: [5, 10], c: [1000, 3000], v: () => P.skins.length },
    { id: 'stars', name: 'Strategist', d: 'Earn {g} sector stars', g: [5, 15, 40], c: [800, 2500, 7000], v: () => starTotal() },
    { id: 'mastery', name: 'Master Crew', d: 'Reach Ace mastery on {g} tank(s)', g: [1, 3, 7], c: [1500, 4000, 10000], v: () => Object.keys(TANKS).filter(t => mastery(t) >= MASTERY.length).length },
  ];
  // Difficulté : décalage d'habileté de l'IA, multiplicateur de temps de réaction, multiplicateur des
  // gains, pièces des chars ennemis (up : niveau Mk sur toutes les pièces), réparation interdite
  const DIFF = {
    recruit: { name: 'Recruit', dS: -0.15, react: 1.5, mul: 0.75, first: 0.5 },
    regular: { name: 'Regular', dS: 0, react: 1, mul: 1, first: 1 },
    veteran: { name: 'Veteran', dS: 0.08, react: 0.85, mul: 1.35, first: 1.5, up: 1 },
    ace: { name: 'Ace', dS: 0.15, react: 0.7, mul: 1.8, first: 2, up: 2, noRevive: true },
  };
  // prime de première conquête de chaque secteur (× DIFF.first), seuils des étoiles (score cumulé des vagues)
  const FIRST = [1000, 1500, 2000, 2500, 4000], STARS = [3000, 4500];
  // Maîtrise par char (XP gagnée avec ce char) et compétences d'équipage (un point par niveau d'équipage)
  const MASTERY = [1500, 5000, 12000, 25000], MASTERY_N = ['3rd Class', '2nd Class', '1st Class', 'Ace'];
  const MASTERY_REW = { c: 1000, kit: 1, x2: 2 };
  const PERKS = [
    { id: 'gunner', role: 'Gunner', name: 'Steady Hand', ic: '◎', d: '−4% gun dispersion per rank' },
    { id: 'loader', role: 'Loader', name: 'Quick Hands', ic: '↻', d: '−3% reload time per rank' },
    { id: 'driver', role: 'Driver', name: 'Smooth Ride', ic: '≋', d: '+4% grip and −6% dispersion on the move per rank' },
    { id: 'commander', role: 'Commander', name: 'Sixth Sense', ic: '👁', d: 'Rank 1: warns you when you are spotted · ranks 2-3: +4% view range' },
    { id: 'radio', role: 'Radio operator', name: 'Relay', ic: '⌁', d: '+5% view range for your allies per rank' },
  ];
  const PERK_MAX = 3, CAP = 0.35; // pièces et compétences réunies : au plus ±35 % sur une caractéristique
  // Bon de guerre : une saison par mois civil, 30 paliers de 700 XP (XP de bataille + 100 par mission)
  const OPS = ['Wacht am Rhein', 'Spring Awakening', 'Citadel', 'Bagration', 'Market Garden', 'Overlord', 'Cobra', 'Torch', 'Uranus', 'Totalize', 'Goodwood', 'Barbarossa'];
  const BOND_N = 30, BOND_XP = 700;
  // Tableau d'honneur hors ligne : as fictifs par champ de bataille (vagues de survie), × HOF_K du secteur
  const ACES = ['Hptm. Brandt', 'Oblt. Vogel', 'Lt. Kessler', 'Sgt. Novak', 'Lt. Orlov', 'Sgt. Dumas', 'Cpl. Hale', 'Lt. Petrov', 'Sgt. Weber'];
  const ACE_W = [25, 20, 16, 13, 11, 9, 7, 5, 3], HOF_K = [1, 0.8, 0.85, 0.9, 0.7];

  // ===================== Profil =====================
  // Tout ce qui est conservé tient dans ce profil, sauvegardé dans le nuage par SDK.data (compte
  // CrazyGames) et en local. Version 2 : progression de la campagne et record de survie inclus.
  // Version 3 : difficulté, étoiles, médailles, succès, missions de la semaine, maîtrise et équipage,
  // bon de guerre, caisse, records, dernière bataille.
  const KEY = 'frontdacier.profil', VERSION = 3;
  const LEGACY = { unlocked: 'frontdacier.unlocked', survBest: 'frontdacier.survie' }; // clés de la version 1
  // horloge remplaçable (tests de passage de jour)
  let clock = () => new Date();
  const today = () => { const d = clock(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 864e5); };
  const weekOf = s => String(Math.floor((dayNum(s) - 4) / 7)); // semaines du lundi au dimanche
  const seasonNow = () => { const d = clock(); return d.getFullYear() * 12 + d.getMonth(); };
  const fmtN = n => Math.round(n).toLocaleString('en-US');
  const pick = a => a[Math.floor(Math.random() * a.length)];
  // qualité par défaut : moyenne sur écran très dense ou petit processeur (portables, Chromebooks)
  const defQuality = () => { try { if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) return 'mobile'; return (window.devicePixelRatio || 1) > 1.5 || (navigator.hardwareConcurrency || 8) <= 4 ? 'moyenne' : 'haute'; } catch (e) { return 'haute'; } };
  const fresh = () => ({
    v: VERSION, credits: 600, xp: 0, level: 1, tanks: ['light', 'pz4'], skins: ['std', 'su_4bo', 'us_od'], skinSel: {}, kits: 1, x2: 0,
    wheelDay: '', streakDay: '', streak: 0, missionsDay: '', missions: [], stats: { battles: 0, kills: 0, wins: 0 },
    // réglages : caméra d'impact (off, high : moments forts, all : chaque coup), ralenti des destructions,
    // sensibilités, axe vertical, secousses, taille de l'interface, visée assistée ou réaliste, palette
    // pour daltoniens, mouvements réduits, commandes réassignées ; tut : tutoriel (étape suivante, fini)
    opts: { sfx: 0.8, music: 0.6, quality: defQuality(), hitcam: 'high', mute: false, ballistics: 'real', difficulty: 'regular', slowmo: true,
      sens: 1, sensSight: 1, invertY: false, shake: 1, hud: 1, assist: 'assist', cb: false, calm: false, binds: {} },
    tut: { step: 0, done: false }, seen: [], parts: {}, adProg: {}, featDay: '', feat: '',
    unlocked: 0, survBest: 0,
    hist: [], camp: { recruit: {}, regular: {}, veteran: {}, ace: {} }, adapt: {}, medals: {}, ach: [],
    week: '', weekly: [], rerollDay: '', rerolls: [], tankXp: {}, perks: {}, mast: {},
    op: { s: -1, xp: 0, claimed: [], bonus: [] }, crateT: 0, adSpinDay: '', adSpins: 0, streakLost: 0, streakLostDay: '',
    rec: { surv: {}, sector: {}, duelStreak: 0, duelBest: 0, maxKills: 0, longest: 0, maxPen: 0 }, last: null,
  });
  // ready : aucune sauvegarde avant la lecture du profil (sinon le profil neuf du démarrage
  // écraserait la vraie sauvegarde, en local comme dans le nuage)
  let P = fresh(), devMode = false, ready = false;
  // Remise en état d'un profil lu (ancien, corrompu ou modifié à la main) : chaque champ est vérifié,
  // les identifiants inconnus sont écartés, et les deux premiers chars sont toujours possédés.
  const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  const int = (v, d, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const unit = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d; };
  const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  const str = (v, d) => typeof v === 'string' ? v : d;
  const ids = (a, ok) => Array.isArray(a) ? [...new Set(a.filter(x => typeof x === 'string' && ok(x)))] : [];
  // table { clé: entier } filtrée (clés acceptées par ok, valeurs bornées, zéros retirés)
  const intMap = (o, ok, lo, hi) => { const r = {}; if (isObj(o)) for (const [k, v] of Object.entries(o)) { const n = int(v, 0, lo, hi); if (ok(k) && n) r[k] = n; } return r; };
  const intList = (a, lo, hi) => Array.isArray(a) ? [...new Set(a.map(v => int(v, -1, lo, hi)).filter(v => v >= lo))] : [];
  const missionList = (a, pool, n) => Array.isArray(a) ? a.filter(m => isObj(m) && pool.some(d => d.id === m.id)).slice(0, n)
    .map(m => ({ id: m.id, prog: int(m.prog, 0, 0, 1e6), claimed: m.claimed === true })) : [];
  const isTank = id => id in TANKS, isSector = k => /^\d{1,2}$/.test(k);
  function sanitize(o) {
    const f = fresh(), p = fresh();
    if (!isObj(o)) return p;
    p.v = int(o.v, 1, 1, VERSION);
    p.credits = int(o.credits, f.credits, 0, 1e9); p.xp = int(o.xp, 0, 0, 1e9); p.level = int(o.level, 1, 1, 999);
    p.kits = int(o.kits, f.kits, 0, 999); p.x2 = int(o.x2, 0, 0, 999); p.streak = int(o.streak, 0, 0, 99999);
    p.unlocked = int(o.unlocked, 0, 0, 99); p.survBest = int(o.survBest, 0, 0, 9999);
    for (const k of ['wheelDay', 'streakDay', 'missionsDay', 'featDay', 'week', 'rerollDay', 'adSpinDay', 'streakLostDay']) p[k] = str(o[k], '');
    p.feat = SKINS.some(k => k.id === o.feat) ? o.feat : '';
    p.tanks = ids(o.tanks, isTank);
    for (const id of ['pz4', 'light']) if (!p.tanks.includes(id)) p.tanks.unshift(id);
    p.skins = ids(o.skins, id => SKINS.some(k => k.id === id));
    for (const id of ['us_od', 'su_4bo', 'std']) if (!p.skins.includes(id)) p.skins.unshift(id);
    if (isObj(o.skinSel)) for (const [t, k] of Object.entries(o.skinSel)) if (t in TANKS && p.skins.includes(k)) p.skinSel[t] = k;
    if (isObj(o.parts)) for (const [t, ps] of Object.entries(o.parts)) {
      if (!(t in TANKS) || !isObj(ps)) continue;
      for (const d of PARTS) { const lv = int(ps[d.id], 0, 0, 3); if (lv) (p.parts[t] = p.parts[t] || {})[d.id] = lv; }
    }
    p.adProg = intMap(o.adProg, () => true, 0, 99);
    p.missions = missionList(o.missions, MISSIONS, 3);
    if (p.missions.length < 3) p.missionsDay = ''; // missions illisibles : nouveau tirage
    p.weekly = missionList(o.weekly, WEEKLY, 3);
    if (p.weekly.length < 3) p.week = '';
    p.rerolls = ids(o.rerolls, id => MISSIONS.some(d => d.id === id));
    if (isObj(o.stats)) for (const k of ['battles', 'kills', 'wins']) p.stats[k] = int(o.stats[k], 0, 0, 1e9);
    // tutoriel : un ancien profil sans trace du tutoriel a déjà livré bataille, il ne le revoit pas
    p.tut = isObj(o.tut) ? { step: int(o.tut.step, 0, 0, 99), done: o.tut.done === true } : { step: 0, done: p.stats.battles > 0 };
    p.seen = ids(o.seen, () => true).slice(-300);
    if (isObj(o.opts)) {
      const q = o.opts;
      p.opts.sfx = unit(q.sfx, f.opts.sfx); p.opts.music = unit(q.music, f.opts.music);
      p.opts.quality = ['haute', 'moyenne', 'basse', 'mobile'].includes(q.quality) ? q.quality : f.opts.quality;
      p.opts.hitcam = q.hitcam === false ? 'off' : ['off', 'high', 'all'].includes(q.hitcam) ? q.hitcam : 'high'; p.opts.mute = q.mute === true;
      p.opts.slowmo = q.slowmo !== false; p.opts.invertY = q.invertY === true; p.opts.cb = q.cb === true; p.opts.calm = q.calm === true;
      p.opts.sens = num(q.sens, 1, 0.2, 3); p.opts.sensSight = num(q.sensSight, 1, 0.2, 3); p.opts.shake = unit(q.shake, 1); p.opts.hud = num(q.hud, 1, 0.8, 1.3);
      p.opts.assist = q.assist === 'real' ? 'real' : 'assist';
      if (isObj(q.binds)) for (const [a, c] of Object.entries(q.binds)) if (/^[a-z][A-Za-z0-9]{1,15}$/.test(a) && typeof c === 'string' && /^[A-Za-z0-9]{2,24}$/.test(c)) p.opts.binds[a] = c;
      p.opts.ballistics = q.ballistics === 'arcade' ? 'arcade' : 'real';
      p.opts.difficulty = q.difficulty in DIFF ? q.difficulty : 'regular';
    }
    if (Array.isArray(o.hist)) p.hist = o.hist.filter(isObj).slice(-5).map(h => ({ c: int(h.c, 0, 0, 1e6), xp: int(h.xp, 0, 0, 1e6) }));
    if (isObj(o.camp)) for (const d in DIFF) p.camp[d] = intMap(o.camp[d], isSector, 0, 3);
    if (isObj(o.adapt)) for (const [k, v] of Object.entries(o.adapt)) { const n = Number(v); if (isSector(k) && Number.isFinite(n)) p.adapt[k] = Math.max(-0.2, Math.min(0, n)); }
    p.medals = intMap(o.medals, id => MEDALS.some(m => m.id === id), 0, 1e6);
    p.ach = ids(o.ach, () => true);
    p.tankXp = intMap(o.tankXp, isTank, 0, 1e9);
    p.mast = intMap(o.mast, isTank, 0, MASTERY.length);
    if (isObj(o.perks)) for (const [t, ps] of Object.entries(o.perks)) if (isTank(t)) { const m = intMap(ps, id => PERKS.some(k => k.id === id), 0, PERK_MAX); if (Object.keys(m).length) p.perks[t] = m; }
    if (isObj(o.op)) p.op = { s: int(o.op.s, -1, -1, 1e6), xp: int(o.op.xp, 0, 0, 1e7), claimed: intList(o.op.claimed, 1, BOND_N), bonus: intList(o.op.bonus, 1, BOND_N) };
    p.crateT = int(o.crateT, 0, 0, 1e15); p.adSpins = int(o.adSpins, 0, 0, 99); p.streakLost = int(o.streakLost, 0, 0, 99999);
    if (isObj(o.rec)) {
      const r = o.rec;
      p.rec.surv = intMap(r.surv, isSector, 0, 9999); p.rec.sector = intMap(r.sector, isSector, 0, 1e7);
      for (const k of ['duelStreak', 'duelBest', 'maxKills', 'longest', 'maxPen']) p.rec[k] = int(r[k], 0, 0, 1e6);
    }
    if (isObj(o.last) && isTank(o.last.tank)) p.last = { tank: o.last.tank, mode: ['campagne', 'survie', 'duel'].includes(o.last.mode) ? o.last.mode : 'campagne', level: int(o.last.level, 0, 0, 20), wave: int(o.last.wave, 0, 0, 9) };
    return p;
  }
  // Passage d'une version à la suivante ; v1 : campagne et record de survie dans des clés à part ;
  // v2 → v3 : champs nouveaux remplis par sanitize, série de connexions gardée (le cycle reprend)
  function migrate(p) {
    if (p.v < 2) {
      let ls = null;
      try { ls = localStorage; } catch (e) { /* stockage indisponible */ }
      if (ls) for (const [k, key] of Object.entries(LEGACY)) {
        try { p[k] = Math.max(p[k], int(ls.getItem(key), 0, 0, 9999)); if (!devMode) ls.removeItem(key); } catch (e) { /* */ }
      }
      p.v = 2;
    }
    if (p.v < 3) p.v = 3;
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

  // ===================== Récompenses =====================
  // Remise d'une récompense { c, kit, x2, skin (identifiant ou rareté), pip (camouflage à publicités), n } ;
  // renvoie le texte à afficher. Un camouflage déjà possédé est remplacé par 2 000 ✪.
  let gotSkin = null; // dernier camouflage obtenu (célébration côté jeu)
  function give(r) {
    const out = [];
    if (r.c) { P.credits += r.c; out.push(`✪ ${fmtN(r.c)}`); }
    if (r.kit) { P.kits += r.kit; out.push(r.kit > 1 ? `${r.kit} repair kits` : 'Repair kit'); }
    if (r.x2) { P.x2 += r.x2; out.push(`${r.x2}× double rewards`); }
    if (r.skin) {
      let id = r.skin;
      if (RARITY[id]) { const pool = SKINS.filter(s => s.rar === id && !s.bond && !P.skins.includes(s.id)); id = pool.length ? pick(pool).id : ''; }
      const s = SKINS.find(k => k.id === id);
      if (s && !P.skins.includes(id)) { P.skins.push(id); gotSkin = s; out.push(`Camo: ${s.name}`); }
      else { P.credits += 2000; out.push('✪ 2,000 (camo already owned)'); }
    }
    if (r.pip) {
      const s = SKINS.find(k => k.id === r.pip), n = r.n || 1;
      if (s && !P.skins.includes(s.id)) {
        const k = 'skin:' + s.id; P.adProg[k] = (P.adProg[k] || 0) + n;
        if (P.adProg[k] >= s.ads) { P.skins.push(s.id); delete P.adProg[k]; gotSkin = s; out.push(`Camo: ${s.name}`); }
        else out.push(`+${n} progress on “${s.name}”`);
      }
    }
    return out.join(' · ');
  }
  const takeSkin = () => { const s = gotSkin; gotSkin = null; return s; };

  // ===================== Économie =====================
  let promo = []; // récompenses de grade de la dernière promotion
  function addXP(n) {
    P.xp += n;
    let up = 0;
    while (P.xp >= xpFor(P.level)) {
      P.xp -= xpFor(P.level); P.level++; up++;
      P.credits += rankCr(P.level);
      if (RANK_REW[P.level]) promo.push(`${rankName(P.level)}: ${give(RANK_REW[P.level])}`);
    }
    if (up) sdk.happytime();
    return up;
  }
  const rankName = (lv = P.level) => RANKS[Math.min(RANKS.length - 1, lv - 1)];
  const canBuyTank = id => P.level >= TANKS[id].lvl && P.credits >= TANKS[id].price;
  // Achat d'un char ; transfert de terrain : chaque pièce arrive au niveau du meilleur char possédé − 2
  function buyTank(id) {
    if (!canBuyTank(id) || P.tanks.includes(id)) return false;
    P.credits -= TANKS[id].price;
    for (const d of PARTS) { const best = Math.max(0, ...P.tanks.map(t => partLv(t, d.id))); if (best > 2 && partLv(id, d.id) < best - 2) setPart(id, d.id, best - 2); }
    P.tanks.push(id); save(); return true;
  }
  // camouflage du jour : −50 %
  function featured() {
    const d = today();
    if (P.featDay !== d) { const pool = SKINS.filter(k => k.price > 0 && !P.skins.includes(k.id)); P.feat = pool.length ? pick(pool).id : ''; P.featDay = d; save(); }
    return P.feat;
  }
  const skinPrice = s => s.id === featured() ? Math.round(s.price / 2) : s.price;
  function buySkin(id) {
    const s = SKINS.find(k => k.id === id);
    if (!s || P.skins.includes(id) || s.adOnly || s.bond || P.credits < skinPrice(s)) return false;
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
  function selectSkin(tank, id) { if (P.skins.includes(id) && skinFits(tank, SKINS.find(k => k.id === id))) { P.skinSel[tank] = id; save(); } }
  const DEF_SKIN = { de: 'std', su: 'su_4bo', us: 'us_od', uk: 'us_od' };
  const skinFits = (tank, s) => !!s && (!s.grp || !TANKS[tank] || s.grp === groupOf(tank));
  const skinOf = tank => { const s = SKINS.find(k => k.id === P.skinSel[tank]); return skinFits(tank, s) ? s : SKINS.find(k => k.id === DEF_SKIN[TANKS[tank] ? TANKS[tank].nat : 'de']); };
  const partLv = (tank, part) => (P.parts[tank] && P.parts[tank][part]) || 0;
  function setPart(tank, part, lv) { P.parts[tank] = P.parts[tank] || {}; P.parts[tank][part] = lv; }
  const partAds = (tank, part) => adsFor(partCost(tank, part, partLv(tank, part)));
  function buyPart(tank, part) {
    const lv = partLv(tank, part), c = partCost(tank, part, lv);
    if (lv >= 3 || !c || P.credits < c) return false;
    P.credits -= c; setPart(tank, part, lv + 1); save(); return true;
  }
  function partAd(tank, part) {
    const lv = partLv(tank, part);
    if (lv >= 3) return false;
    const k = `part:${tank}:${part}`; P.adProg[k] = (P.adProg[k] || 0) + 1;
    if (P.adProg[k] >= partAds(tank, part)) { setPart(tank, part, lv + 1); delete P.adProg[k]; save(); return true; }
    save(); return false;
  }
  // ----- maîtrise et équipage -----
  const tankXp = t => P.tankXp[t] || 0;
  const mastery = t => MASTERY.filter(x => tankXp(t) >= x).length; // 0 (aucune) à 4 (As)
  const crewLevel = t => Math.min(10, Math.floor(Math.sqrt(tankXp(t) / 250)));
  const perkRank = (t, id) => (P.perks[t] && P.perks[t][id]) || 0;
  const perkPoints = t => crewLevel(t) - PERKS.reduce((s, k) => s + perkRank(t, k.id), 0);
  function buyPerk(t, id) {
    if (!P.tanks.includes(t) || perkPoints(t) <= 0 || perkRank(t, id) >= PERK_MAX || !PERKS.some(k => k.id === id)) return false;
    (P.perks[t] = P.perks[t] || {})[id] = perkRank(t, id) + 1; save(); return true;
  }
  function resetPerks(t) { if (!P.perks[t] || P.credits < 500) return false; P.credits -= 500; delete P.perks[t]; save(); return true; }
  // multiplicateurs uniformes : pièces toutes au niveau lv (chars ennemis en Vétéran et As)
  function modsAt(lv) {
    const K = id => PARTS.find(k => k.id === id).k;
    return { hp: 1 + K('engine') * lv, pen: 1 + K('gun') * lv, armor: 1 + K('armor') * lv, grip: 1 + K('tracks') * lv, optic: 1 + K('optics') * lv, view: 1 + K('optics') * lv,
      reload: 1 - K('loader') * lv, ready: lv, armorLv: lv, disp: 1, moveDisp: 1, relay: 1, sixth: false };
  }
  // multiplicateurs appliqués au char du joueur : pièces puis compétences d'équipage, bornés à ±35 %
  function mods(tank) {
    const L = id => partLv(tank, id), K = id => PARTS.find(k => k.id === id).k, R = id => perkRank(tank, id);
    const up = v => Math.min(1 + CAP, v), dn = v => Math.max(1 - CAP, v), opt = 1 + K('optics') * L('optics');
    return {
      hp: up(1 + K('engine') * L('engine')), pen: up(1 + K('gun') * L('gun')), armor: up(1 + K('armor') * L('armor')),
      grip: up((1 + K('tracks') * L('tracks')) * (1 + 0.04 * R('driver'))), optic: up(opt), view: up(opt * (1 + 0.04 * Math.max(0, R('commander') - 1))),
      reload: dn((1 - K('loader') * L('loader')) * (1 - 0.03 * R('loader'))), ready: L('loader'), armorLv: L('armor'),
      disp: dn(1 - 0.04 * R('gunner')), moveDisp: dn(1 - 0.06 * R('driver')), relay: up(1 + 0.05 * R('radio')), sixth: R('commander') > 0,
    };
  }

  // ===================== Difficulté =====================
  const diffId = () => (P.opts.difficulty in DIFF ? P.opts.difficulty : 'regular');
  const diff = () => DIFF[diffId()];
  const starsOf = (d, lv) => (P.camp[d] && P.camp[d][lv]) || 0;
  const starTotal = () => Object.keys(DIFF).reduce((s, d) => s + Object.values(P.camp[d] || {}).reduce((a, b) => a + b, 0), 0);
  const LASTSEC = FIRST.length - 1;
  // Vétéran : dernier secteur atteint ; As : campagne conquise en Vétéran
  function diffOk(id) {
    if (devMode || id === 'recruit' || id === 'regular') return true;
    if (id === 'veteran') return P.unlocked >= LASTSEC || ['regular', 'veteran', 'ace'].some(d => starsOf(d, LASTSEC));
    return id === 'ace' && (starsOf('veteran', LASTSEC) > 0 || starsOf('ace', LASTSEC) > 0);
  }
  function setDiff(id) { if (!(id in DIFF) || !diffOk(id)) return false; P.opts.difficulty = id; save(); return true; }
  // Habileté de l'IA ennemie pour une habileté de base : décalage de difficulté et aide adaptative du
  // secteur de campagne (level, ou null hors campagne)
  const aiSkill = (base, level) => Math.max(0.1, Math.min(0.98, base + diff().dS + (level == null ? 0 : P.adapt[level] || 0)));
  const enemyUp = () => (diff().up ? modsAt(diff().up) : null);
  // Fin de secteur de campagne : étoiles (1 conquis, 2 et 3 selon le score, 3 sans allié détruit),
  // prime de première conquête une seule fois par difficulté, or pour la campagne conquise en As
  function sectorClear(level, score, tk) {
    const d = diffId(), prev = starsOf(d, level);
    const stars = 1 + (score >= STARS[0]) + (score >= STARS[1] && !tk);
    const res = { stars, prev, bonus: 0, text: '' };
    if (stars > prev) P.camp[d][level] = stars;
    if (!prev) { res.bonus = Math.round((FIRST[level] || 1000) * DIFF[d].first); P.credits += res.bonus; }
    if (d === 'ace' && level === LASTSEC && !prev) res.text = give({ skin: 'or' });
    track('sector'); if (stars === 3) track('star3');
    save();
    return res;
  }

  // ===================== Missions, semaine et série =====================
  const mDef = id => MISSIONS.find(k => k.id === id) || WEEKLY.find(k => k.id === id);
  // tirage sans deux missions sur le même événement
  function roll(pool, n, keep = []) {
    const out = [], evs = new Set(keep.map(id => mDef(id).ev)), p = pool.filter(m => !keep.includes(m.id));
    while (out.length < n && p.length) { const m = p.splice(Math.floor(Math.random() * p.length), 1)[0]; if (!evs.has(m.ev)) { evs.add(m.ev); out.push(m); } }
    return out.map(m => ({ id: m.id, prog: 0, claimed: false }));
  }
  // missions terminées mais pas réclamées : payées d'office avant un nouveau tirage
  function payDone(list) { let c = 0; for (const m of list) { const d = mDef(m.id); if (d && !m.claimed && m.prog >= d.goal) c += claimM(m, d); } return c; }
  // Passage au jour suivant : missions (et semaine), prime de présence, saison du bon de guerre. Appelée
  // au démarrage, au retour au menu et à l'ouverture des missions ; sans effet le même jour.
  // Renvoie null ou { bonus, day, text, tomorrow, paid, lost, season }.
  function dailyRoll() {
    const d = today(), w = weekOf(d), res = { bonus: 0, day: 0, text: '', tomorrow: 0, paid: 0, lost: 0, season: '' };
    res.season = bondRoll();
    if (P.missionsDay === d && P.streakDay === d && P.week === w) return res.season ? res : null;
    if (P.week !== w) { res.paid += payDone(P.weekly); P.weekly = roll(WEEKLY, 3); P.week = w; }
    if (P.missionsDay !== d) { res.paid += payDone(P.missions); P.missions = roll(MISSIONS, 3); P.missionsDay = d; P.rerolls = []; }
    if (P.streakDay !== d) {
      const gap = P.streakDay ? dayNum(d) - dayNum(P.streakDay) : 99, old = P.streak;
      // pas de remise à zéro brutale : un jour manqué se rattrape par une publicité, au-delà la série
      // perd la moitié de sa valeur
      if (gap === 1) P.streak++;
      else {
        P.streak = gap === 99 || !old ? 1 : Math.max(1, Math.floor(old / 2) + 1);
        if (gap === 2 && old > 1) { P.streakLost = old; P.streakLostDay = d; res.lost = old; }
      }
      P.streakDay = d;
      const r = streakReward(P.streak);
      res.day = P.streak; res.bonus = r.c; res.text = give(r); res.tomorrow = streakReward(P.streak + 1).c;
    }
    save();
    return res;
  }
  // jour n de la série : cycle de 7 jours ; le 7e, caisse de ravitaillement (2 000 ✪, kit, 30 % de
  // chance d'un camouflage rare) ; semaine 2 : progrès vers « Night Operation », semaine 4 : « Victory Parade »
  function streakReward(n) {
    const i = (n - 1) % 7, wk = Math.floor((n - 1) / 7) % 4;
    if (i < 6) return { c: STREAK[i] };
    const r = { c: STREAK[6], kit: 1 };
    if (wk === 1) { r.pip = 'nuit'; r.n = 1; } else if (wk === 3) { r.pip = 'parade'; r.n = 2; } else if (Math.random() < 0.3) r.skin = 'rare';
    return r;
  }
  // bouclier de série : le jour même, une publicité rend la série perdue
  const canRestore = () => P.streakLost > 0 && P.streakLostDay === today();
  function restoreStreak() { if (!canRestore()) return 0; P.streak = P.streakLost + 1; P.streakLost = 0; save(); return P.streak; }
  // n : quantité, ou valeur atteinte pour une mission « max » ; renvoie la dernière mission terminée
  function track(ev, n = 1) {
    let done = null;
    for (const m of P.missions.concat(P.weekly)) {
      const def = mDef(m.id);
      if (!def || def.ev !== ev || m.prog >= def.goal) continue;
      m.prog = def.max ? Math.max(m.prog, n) : m.prog + n;
      if (m.prog >= def.goal) { m.prog = def.goal; done = def; }
    }
    if (done) save();
    return done;
  }
  function claimM(m, def) {
    m.claimed = true; P.credits += def.reward; addXP(Math.round(def.reward / 3)); P.op.xp += 100;
    if (def.skin) give({ skin: def.skin });
    return def.reward;
  }
  function claim(id) {
    const m = P.missions.concat(P.weekly).find(k => k.id === id), def = mDef(id);
    if (!m || !def || m.claimed || m.prog < def.goal) return 0;
    const c = claimM(m, def); save(); return c;
  }
  const claimable = () => P.missions.concat(P.weekly).filter(m => { const d = mDef(m.id); return d && !m.claimed && m.prog >= d.goal; });
  // nouvelle mission à la place d'une autre : une gratuite par mission et par jour, ensuite par publicité
  const canReroll = id => !P.rerolls.includes(id);
  function reroll(id, ad) {
    const i = P.missions.findIndex(m => m.id === id);
    if (i < 0 || P.missions[i].claimed || (!ad && !canReroll(id))) return false;
    const [m] = roll(MISSIONS, 1, P.missions.map(k => k.id));
    if (!m) return false;
    P.missions[i] = m; P.rerolls.push(m.id); save(); return true;
  }

  // ===================== Bon de guerre =====================
  const bondSkins = (s = P.op.s) => BOND_SKINS[((s % BOND_SKINS.length) + BOND_SKINS.length) % BOND_SKINS.length];
  // palier i (1 à 30) : crédits croissants, kit tous les 5 paliers, doubles gains aux paliers 8 et 22,
  // camouflages exclusifs aux paliers 15 et 30
  function bondReward(i) {
    if (i === 15 || i === 30) return { skin: bondSkins()[i === 30 ? 1 : 0] };
    const r = { c: Math.round((300 + (i - 1) * 1700 / 29) / 50) * 50 };
    if (i % 5 === 0) r.kit = 1;
    if (i === 8 || i === 22) r.x2 = 2;
    return r;
  }
  const bondBonusOf = i => { const r = bondReward(i); return { c: r.c ? Math.round(r.c / 100) * 50 : 1000 }; };
  const bondTier = () => Math.min(BOND_N, Math.floor(P.op.xp / BOND_XP));
  const bond = () => ({ s: P.op.s, name: OPS[((P.op.s % 12) + 12) % 12], tier: bondTier(), xp: P.op.xp % BOND_XP, need: BOND_XP, n: BOND_N, max: bondTier() >= BOND_N });
  // nouvelle saison : paliers gratuits atteints et non réclamés payés d'office, puis remise à zéro
  function bondRoll() {
    const s = seasonNow();
    if (P.op.s === s) return '';
    let paid = '';
    if (P.op.s >= 0) { const t = []; for (let i = 1; i <= bondTier(); i++) if (!P.op.claimed.includes(i)) t.push(give(bondReward(i))); paid = t.join(' · '); }
    P.op = { s, xp: 0, claimed: [], bonus: [] };
    save();
    return paid || `War Bond: Operation ${bond().name} begins`;
  }
  function bondClaim(i) { if (i < 1 || i > bondTier() || P.op.claimed.includes(i)) return ''; P.op.claimed.push(i); const t = give(bondReward(i)); save(); return t; }
  // ligne de « commission de terrain » : +50 % du palier par une publicité, palier réclamé d'abord
  function bondBonus(i) { if (!P.op.claimed.includes(i) || P.op.bonus.includes(i)) return ''; P.op.bonus.push(i); const t = give(bondBonusOf(i)); save(); return t; }
  const bondReady = () => { let n = 0; for (let i = 1; i <= bondTier(); i++) if (!P.op.claimed.includes(i)) n++; return n; };

  // ===================== Caisse de campagne =====================
  const crateLeft = () => Math.max(0, P.crateT - clock().getTime());
  function openCrate(ad) {
    if (!ad && crateLeft() > 0) return 0;
    const c = Math.round((CRATE[0] + Math.random() * (CRATE[1] - CRATE[0])) / 10) * 10;
    P.credits += c; P.crateT = clock().getTime() + CRATE_MS; save(); return c;
  }

  // ===================== Médailles et succès =====================
  const achId = (k, i) => `${k}:${i}`;
  // tous les succès : rangs de médailles puis états de service ; prog / goal, done, claimed
  function achList() {
    const out = [];
    for (const m of MEDALS) MEDAL_TIERS.forEach(([g, c, tn], i) => out.push({ id: achId(m.id, i), name: `${m.name} · ${tn}`, d: `${m.d}${g > 1 ? ` (${g} times)` : ''}`, ic: m.ic, tier: i, prog: P.medals[m.id] || 0, goal: g, reward: c }));
    for (const a of CAREER) a.g.forEach((g, i) => out.push({ id: achId(a.id, i), name: `${a.name} ${'I'.repeat(i + 1)}`, d: a.d.replace('{g}', fmtN(g)), ic: '🎖', tier: i, prog: a.v(), goal: g, reward: a.c[i] }));
    for (const a of out) { a.done = a.prog >= a.goal; a.claimed = P.ach.includes(a.id); }
    return out;
  }
  const achReady = () => achList().filter(a => a.done && !a.claimed).length;
  function claimAch(id) { const a = achList().find(k => k.id === id); if (!a || !a.done || a.claimed) return 0; P.ach.push(id); P.credits += a.reward; save(); return a.reward; }

  // ===================== Records =====================
  // record maximal (sub : sous-table, par secteur) ; beat seulement si un record précédent existait
  function record(key, v, sub) {
    const o = sub == null ? P.rec : P.rec[key], k = sub == null ? key : sub, old = o[k] || 0;
    if (!(v > old)) return { old, beat: false };
    o[k] = Math.round(v); save();
    return { old, beat: old > 0 };
  }
  function duelOver(won) { P.rec.duelStreak = won ? P.rec.duelStreak + 1 : 0; const r = record('duelBest', P.rec.duelStreak); save(); return r; }
  // tableau d'honneur de survie d'un secteur : as fictifs et meilleur score du joueur, triés
  function hallOfFame(level) {
    const k = HOF_K[level] || 1, me = P.rec.surv[level] || 0;
    return ACES.map((n, i) => ({ name: n, v: Math.max(1, Math.round(ACE_W[i] * k)) })).concat([{ name: 'You', v: me, me: true }]).sort((a, b) => b.v - a.v || (b.me ? 1 : 0) - (a.me ? 1 : 0));
  }

  // ===================== Objectifs suivants =====================
  // gains moyens des 5 dernières batailles (à défaut 250 XP et 600 ✪)
  function avg() { const h = P.hist; return h.length ? { xp: Math.max(50, h.reduce((s, b) => s + b.xp, 0) / h.length), c: Math.max(100, h.reduce((s, b) => s + b.c, 0) / h.length) } : { xp: 250, c: 600 }; }
  // jusqu'à 3 objectifs triés par nombre de batailles restant : char suivant, pièce suivante, maîtrise,
  // mission la plus avancée. kind, id, name, text, battles (0 : faisable maintenant), p (0 à 1)
  function nextGoals(tank) {
    const a = avg(), g = [], have = cumXP(P.level) + P.xp;
    const g0 = TANKS[tank] ? groupOf(tank) : 'de';
    const nextT = Object.keys(TANKS).filter(id => !P.tanks.includes(id)).sort((a, b) => (groupOf(a) !== g0) - (groupOf(b) !== g0) || TANKS[a].lvl - TANKS[b].lvl || TANKS[a].price - TANKS[b].price)[0];
    if (nextT) {
      const T = TANKS[nextT], mx = Math.max(0, cumXP(T.lvl) - have), mc = Math.max(0, T.price - P.credits);
      const parts = [mx > 0 ? `rank ${T.lvl}` : '', mc > 0 ? `✪ ${fmtN(mc)} short` : ''].filter(Boolean).join(' · ');
      g.push({ kind: 'tank', id: nextT, battles: Math.ceil(Math.max(mx / a.xp, mc / a.c)), p: Math.min(have / Math.max(1, cumXP(T.lvl)), P.credits / Math.max(1, T.price), 1), text: parts });
    }
    if (P.tanks.includes(tank)) {
      let best = null;
      for (const d of PARTS) { const lv = partLv(tank, d.id), c = partCost(tank, d.id, lv); if (lv < 3 && (!best || c < best.c)) best = { d, lv, c }; }
      if (best) { const mc = Math.max(0, best.c - P.credits); g.push({ kind: 'part', id: best.d.id, name: `${best.d.name} ${MK[best.lv + 1]}`, battles: Math.ceil(mc / a.c), p: Math.min(1, P.credits / best.c), text: mc ? `✪ ${fmtN(mc)} short` : `✪ ${fmtN(best.c)}` }); }
      const ms = mastery(tank);
      if (ms < MASTERY.length) { const mx = MASTERY[ms] - tankXp(tank); g.push({ kind: 'mastery', id: tank, name: `Mastery: ${MASTERY_N[ms]}`, battles: Math.ceil(mx / a.xp), p: tankXp(tank) / MASTERY[ms], text: `${fmtN(mx)} tank XP to go` }); }
    }
    const open = P.missions.filter(m => !m.claimed && m.prog < mDef(m.id).goal).sort((x, y) => y.prog / mDef(y.id).goal - x.prog / mDef(x.id).goal)[0];
    if (open) { const d = mDef(open.id); g.push({ kind: 'mission', id: d.id, name: d.t, battles: 1 + Math.floor((1 - open.prog / d.goal) * 3), p: open.prog / d.goal, text: `${open.prog} / ${d.goal}` }); }
    return g.sort((x, y) => x.battles - y.battles).slice(0, 3);
  }

  // ===================== Roue =====================
  const canSpinFree = () => P.wheelDay !== today();
  const adSpinsLeft = () => (P.adSpinDay === today() ? Math.max(0, AD_SPINS - P.adSpins) : AD_SPINS);
  const canSpinAd = () => !canSpinFree() && adSpinsLeft() > 0;
  // à partir du deuxième tour par publicité du jour, la part « 250 ✪ » est retirée
  function spinResult(free) {
    const noLow = !free && adSpinsLeft() < AD_SPINS, w = (s, i) => (noLow && i === 0 ? 0 : s.w);
    const tot = WHEEL.reduce((a, b, i) => a + w(b, i), 0);
    let r = Math.random() * tot, i = 0;
    for (; i < WHEEL.length; i++) { r -= w(WHEEL[i], i); if (r <= 0 && w(WHEEL[i], i) > 0) break; }
    return Math.min(i, WHEEL.length - 1);
  }
  function applyPrize(i, free) {
    const p = WHEEL[i];
    if (free) P.wheelDay = today();
    else { if (P.adSpinDay !== today()) { P.adSpinDay = today(); P.adSpins = 0; } P.adSpins++; }
    let txt = p.t;
    if (p.c) P.credits += p.c;
    if (p.kit) P.kits += p.kit;
    if (p.x2) P.x2 += p.x2;
    if (p.skin) {
      const left = SKINS.filter(s => !P.skins.includes(s.id) && s.rar !== 'legendary' && !s.bond);
      if (left.length) { const s = pick(left); P.skins.push(s.id); txt = `Camo: ${s.name}`; }
      else { P.credits += 3000; txt = '3,000 ✪ (all camos owned)'; }
    }
    save();
    return txt;
  }

  // ===================== Fin de bataille =====================
  // r : { mode, win, kills, pens, crew, waves, ffCrew, tk, medals (identifiants), streakCr (prime de série
  // de destructions), time (s), over (fin de match en duel), matchWon, revenge, level, tank, td, untouched }
  // Gains selon le mode (campagne 400 à la victoire ; manche de duel 120 + 400 pour le match ; survie
  // 120 par vague + 500 aux vagues 5, 10 et 15), participation de 60 ✪ après 30 s seulement,
  // × difficulté, × 1,5 de revanche ; tir fratricide retranché ; × 2 de prime sur une victoire ≥ 300 ✪.
  function battleEnd(r) {
    const M = r.mode || 'campagne', D = diff(), waves = r.waves || 0, medals = r.medals || [];
    const before = { xp: P.xp, level: P.level, credits: P.credits, need: xpFor(P.level), tier: bondTier(), opXp: P.op.xp };
    // cote : chaque destruction vaut 150 × (cote ennemie / cote du joueur), borné à 0,5..2 (r.killK en est
    // la somme) ; la prime de victoire suit la plus faible des cotes du joueur et de ses adversaires
    const brK = r.br ? 0.8 + 0.2 * Math.min(r.br, r.ebr || r.br) : 1;
    const bonus = Math.round((M === 'duel' ? (r.win ? 120 : 0) + (r.matchWon ? 400 : 0) : M === 'survie' ? waves * 120 + 500 * Math.min(3, Math.floor(waves / 5)) : (r.win ? 400 : 0)) * brK);
    const part = !r.win && M !== 'survie' && (r.time == null || r.time >= 30) ? 60 : 0;
    const medalCr = medals.reduce((s, id) => s + (MEDALS.find(m => m.id === id) || { c: 0 }).c, 0);
    const k = D.mul * (r.revenge && r.win ? 1.5 : 1) * (r.real ? 1.1 : 1); // visée réaliste : +10 %
    let credits = Math.round(((r.killK != null ? r.killK : r.kills) * 150 + r.pens * 20 + r.crew * 12 + (r.streakCr || 0) + bonus + part) * k) + medalCr;
    let xp = Math.round((r.kills * 60 + r.pens * 8 + r.crew * 5 + (r.win ? 150 : 40) + waves * 50) * D.mul);
    const penalty = 60 * (r.ffCrew || 0) + 300 * (r.tk || 0);
    credits = Math.max(0, credits - penalty); xp = Math.max(0, xp - 25 * (r.ffCrew || 0) - 120 * (r.tk || 0));
    let boosted = false, x2kept = false;
    if (P.x2 > 0) { if (r.win && credits >= 300) { P.x2--; credits *= 2; boosted = true; } else x2kept = true; }
    P.credits += credits;
    const round = M === 'duel' && !r.over; // manche intermédiaire de duel : ni bataille ni victoire comptée
    if (!round) { P.stats.battles++; if (r.win || r.matchWon) P.stats.wins++; }
    P.stats.kills += r.kills;
    P.hist.push({ c: credits, xp }); if (P.hist.length > 5) P.hist.shift();
    // missions : la victoire compte en fin de match (duel), les médailles une à une
    const done = [], T = (ev, n) => { const d = track(ev, n); if (d) done.push(d); };
    if (!round) T('battle');
    if (M === 'duel' ? r.matchWon : r.win) { T('win'); if (r.td) T('wintd'); if (r.untouched) T('untouched'); }
    if (r.matchWon) T('duelwin');
    if (medals.length) { T('medal', medals.length); for (const id of medals) { P.medals[id] = (P.medals[id] || 0) + 1; if (id === 'double') T('double'); } }
    if (M === 'survie' && waves) T('survwave', waves);
    if (r.kills > P.rec.maxKills) P.rec.maxKills = r.kills;
    // aide adaptative de la campagne : plus douce après une défaite, revient à 0 avec les victoires
    if (M === 'campagne' && r.level != null) P.adapt[r.level] = Math.max(-0.2, Math.min(0, (P.adapt[r.level] || 0) + (r.win ? 0.03 : -0.05)));
    // maîtrise du char et bon de guerre
    let mast = '';
    if (r.tank && TANKS[r.tank]) {
      const m0 = mastery(r.tank);
      P.tankXp[r.tank] = tankXp(r.tank) + xp;
      const m1 = mastery(r.tank);
      if (m1 > m0 && m1 > (P.mast[r.tank] || 0)) { P.mast[r.tank] = m1; mast = `${MASTERY_N[m1 - 1]}: ${give(MASTERY_REW)}`; }
    }
    P.op.xp += xp;
    promo = [];
    const up = addXP(xp);
    let upCr = 0;
    for (let l = before.level + 1; l <= P.level; l++) upCr += rankCr(l);
    save();
    return { credits, xp, up, boosted, x2kept, before, penalty, medalCr, promo: promo.slice(), upCr, mast, done, tier: bondTier() };
  }
  // dernière bataille lancée (bouton « Continuer »)
  function setLast(o) { P.last = o; save(); }

  return {
    sdk, midgame, rewarded, banner, clearBanners, hooks, adActive: () => adBusy, get platformMute() { return platformMute; }, RANKS, RARITY, MK, TANKS, NATIONS, GROUPS, FRONTS, front, sideOf, groupOf, lineup, anachronisms, skinFits, SKINS, PARTS, WHEEL, MISSIONS, WEEKLY, STREAK, MEDALS, PERKS, MASTERY, MASTERY_N, DIFF, STARS, FIRST,
    xpFor, cumXP, rankName,
    get P() { return P; }, save, reset, parse, addXP, give, takeSkin,
    devProfile, devUse(p) { if (devMode) P = p; }, setClock(f) { clock = f || (() => new Date()); },
    get dev() { return devMode; }, buyTank, canBuyTank, buySkin, grantSkin, selectSkin, skinOf,
    featured, skinPrice, skinAd, adsLeft, partLv, partCost, partAds, buyPart, partAd, mods, modsAt,
    tankXp, mastery, crewLevel, perkRank, perkPoints, buyPerk, resetPerks,
    diff, diffId, diffOk, setDiff, aiSkill, enemyUp, starsOf, starTotal, sectorClear,
    dailyRoll, streakReward, canRestore, restoreStreak, track, claim, claimable, mDef, canReroll, reroll,
    bond, bondReward, bondBonusOf, bondClaim, bondBonus, bondReady, bondSkins, crateLeft, openCrate,
    achList, achReady, claimAch, record, duelOver, hallOfFame, nextGoals, setLast,
    canSpinFree, canSpinAd, adSpinsLeft, spinResult, applyPrize, battleEnd,
    whenReady: fn => sdkReady.then(fn),
    // dev : profil jetable (le vrai profil est lu pour ses réglages, puis laissé intact)
    async init(o = {}) { await sdkReady; await load(); if (o.dev) devProfile(); return dailyRoll(); },
  };
})();
