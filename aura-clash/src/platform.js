// Plateformes de diffusion. Sur CrazyGames (window.AURA_PLATFORM = 'crazygames', SDK v3 chargé
// par la page), on utilise le SDK officiel :
//   - init() attendu avant toute publicité, loadingStart/loadingStop pendant le chargement ;
//   - gameplayStart/gameplayStop selon que le joueur se bat ou non ;
//   - publicité « midgame » entre deux combats ; publicités « rewarded » lancées par le joueur ;
//   - son coupé et jeu en pause pendant chaque publicité, rétablis à la fin ou en cas d'échec ;
//   - récompense donnée UNIQUEMENT si adFinished est appelé (jamais sur adError) ;
//   - réglage « couper le son » de CrazyGames respecté, sauvegarde dans le compte, invitations.
// Hors CrazyGames (exe, HTML, artefact), il n'y a pas de publicité : les bonus sont offerts.
const AD_GAP = 60; // secondes minimum entre deux publicités midgame (CrazyGames applique aussi les siennes)

export const ON_CRAZYGAMES = typeof window !== 'undefined' && window.AURA_PLATFORM === 'crazygames';

class Platform {
  constructor() {
    this.sdk = null;
    this.env = 'none';
    this.playing = false;
    this.adPlaying = false;
    this.lastAd = -Infinity;
    this.adblock = false;
    this.ready = Promise.resolve(null);
    this.listeners = new Set();
  }

  /** Démarre le SDK (à appeler une fois, le plus tôt possible). */
  init() {
    if (!ON_CRAZYGAMES) return this.ready;
    this.ready = this.start();
    return this.ready;
  }

  async start() {
    // Le script du SDK est chargé par la page ; on l'attend quelques secondes au besoin
    for (let i = 0; i < 50 && !window.CrazyGames?.SDK; i++) await new Promise((r) => setTimeout(r, 100));
    const sdk = window.CrazyGames?.SDK;
    if (!sdk) { console.warn('[CrazyGames] SDK introuvable'); return null; }
    try {
      await sdk.init();
    } catch (e) {
      console.warn('[CrazyGames] init a échoué :', e);
      return null;
    }
    this.env = sdk.environment || 'crazygames';
    console.info('[CrazyGames] SDK prêt, environnement :', this.env);
    if (this.env === 'disabled') return null; // hors du site CrazyGames : le SDK ne fait rien
    this.sdk = sdk;
    try { sdk.game.loadingStart?.(); } catch { /* ignoré */ }

    // Réglage « couper le son » du site
    try {
      const apply = () => this.emit('settings', sdk.game.settings || {});
      sdk.game.addSettingsChangeListener?.(apply);
      apply();
    } catch { /* ignoré */ }
    this.initCloud();
    this.notifyChange();
    // Détection du bloqueur de pub en tâche de fond (ne retarde rien)
    Promise.resolve().then(() => sdk.ad.hasAdblock?.()).then((v) => { this.adblock = !!v; }, () => {});
    return sdk;
  }

  /** Le jeu a fini de charger (portraits, coffres, menus prêts). */
  loaded() {
    this.ready.then((sdk) => { try { sdk?.game.loadingStop?.(); } catch { /* ignoré */ } });
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, data) { for (const fn of this.listeners) { try { fn(type, data); } catch { /* ignoré */ } } }
  notifyChange() { this.emit('ready', this.sdk); }

  /** Vraies publicités disponibles (version CrazyGames). Les boutons affichent alors ▶. */
  get hasAds() {
    return ON_CRAZYGAMES;
  }

  /**
   * Sauvegarde dans le compte CrazyGames (module « data » du SDK, synchronisé quand le joueur est
   * connecté) : la progression suit le joueur d'un appareil à l'autre. La version la plus avancée
   * (temps de jeu le plus long) l'emporte au démarrage.
   */
  initCloud() {
    // Module « data » du SDK (pris au moment de l'appel ; ses méthodes peuvent être synchrones ou non)
    const data = () => (window.CrazyGames && window.CrazyGames.SDK && window.CrazyGames.SDK.data) || (this.sdk && this.sdk.data) || null;
    const KEY = 'auraclash.profile.v1';
    if (!data()) { console.warn('[CrazyGames] module data introuvable : sauvegarde locale seulement'); return; }
    let timer = null;
    globalThis.__auraCloudSave = (key, json) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try { await data().setItem(key, json); } catch (e) { console.warn('[CrazyGames] data.setItem :', e); }
      }, 1500);
    };
    (async () => {
      try {
        const cloud = await data().getItem(KEY);
        const local = localStorage.getItem(KEY);
        const time = (j) => { try { return JSON.parse(j).playTime || 0; } catch { return -1; } };
        console.info('[CrazyGames] sauvegarde du compte :', cloud ? 'trouvée' : 'vide');
        if (cloud && time(cloud) > time(local)) {
          localStorage.setItem(KEY, cloud);
          // Profil rechargé depuis le compte
          if (window.app && window.app.profile) {
            const P = window.app.profile.constructor;
            window.app.profile = new P();
            if (window.app.ui?.screen?.el?.classList.contains('main-menu')) window.app.ui.mainMenu();
          }
        } else if (local) await data().setItem(KEY, local);
      } catch (e) { console.warn('[CrazyGames] data.getItem :', e); }
    })();
  }


  /** Le joueur est en train de jouer (combat en cours, hors pause). */
  gameplayStart() {
    if (!this.sdk || this.playing || this.adPlaying) return;
    this.playing = true;
    try { this.sdk.game.gameplayStart(); } catch { /* ignoré */ }
  }

  /** Le joueur ne joue plus (menu, pause, fin de combat). */
  gameplayStop() {
    if (!this.sdk || !this.playing) return;
    this.playing = false;
    try { this.sdk.game.gameplayStop(); } catch { /* ignoré */ }
  }

  /** Grand moment de joie (victoire, coffre, déblocage). */
  happytime() {
    try { this.sdk?.game.happytime(); } catch { /* ignoré */ }
  }

  /**
   * Lance une publicité. Résout { ok, error } : ok = la publicité est allée jusqu'au bout.
   * Son coupé et jeu en pause (événements 'adStart' / 'adEnd') pendant toute sa durée.
   */
  async showAd(type, audio) {
    const sdk = await this.ready;
    if (!sdk) return { ok: false, error: this.env === 'disabled' ? 'disabled' : 'nosdk' };
    if (this.adPlaying) return { ok: false, error: 'busy' };
    this.adPlaying = true;
    this.gameplayStop();
    return new Promise((resolve) => {
      let done = false;
      let started = false;
      const end = (ok, error) => {
        if (done) return;
        done = true;
        clearTimeout(guard);
        this.adPlaying = false;
        audio?.setMuted?.(!!this.siteMute);
        this.emit('adEnd', { type, ok });
        if (started) this.lastAd = performance.now() / 1000;
        if (!ok) console.info(`[CrazyGames] pub ${type} non affichée :`, error);
        resolve({ ok, error });
      };
      // Sécurité : si le SDK ne répond jamais, le jeu reprend (sans récompense)
      const guard = setTimeout(() => end(false, 'timeout'), 90000);
      try {
        sdk.ad.requestAd(type, {
          adStarted: () => { started = true; audio?.setMuted?.(true); this.emit('adStart', { type }); },
          adFinished: () => end(true),
          adError: (err) => end(false, (err && (err.code || err.message)) || String(err || 'error')),
        });
      } catch (e) { end(false, e && e.message); }
    });
  }

  /**
   * Publicité récompensée, toujours lancée par le joueur. Résout `true` seulement si elle a été vue
   * en entier (adFinished). Hors CrazyGames, il n'y a pas de publicité : le bonus est accordé.
   */
  async rewardedAd(audio) {
    if (!ON_CRAZYGAMES) return true;
    const r = await this.showAd('rewarded', audio);
    this.lastError = r.error || null;
    return r.ok;
  }

  /** Message à afficher quand une publicité récompensée n'a pas pu être vue. */
  adErrorText() {
    const e = String(this.lastError || '');
    if (this.adblock) return 'Un bloqueur de publicités empêche le bonus : désactive-le pour ce jeu.';
    if (e === 'disabled' || e === 'nosdk') return 'Publicités indisponibles ici (elles marchent sur CrazyGames).';
    if (/cooldown/i.test(e)) return 'Une publicité vient d’être diffusée : réessaie dans un instant.';
    if (/unfilled|fill/i.test(e)) return 'Aucune publicité disponible pour le moment, réessaie plus tard.';
    return 'Publicité indisponible pour le moment, réessaie plus tard.';
  }

  /** Lien d'invitation CrazyGames vers un salon en ligne (null ailleurs). */
  inviteLink(room) {
    try { return this.sdk?.game?.inviteLink ? this.sdk.game.inviteLink({ room }) : null; } catch { return null; }
  }

  /** Salon passé dans un lien d'invitation CrazyGames (ou null). */
  inviteRoom() {
    try { return this.sdk?.game?.getInviteParam ? this.sdk.game.getInviteParam('room') : null; } catch { return null; }
  }

  /**
   * Publicité entre deux combats (midgame), si le délai minimum est écoulé. `done` est toujours
   * appelé ensuite (même sans publicité ou en cas d'erreur).
   */
  midgameAd(audio, done = () => {}) {
    const now = performance.now() / 1000;
    if (!ON_CRAZYGAMES || now - this.lastAd < AD_GAP) { done(); return; }
    this.showAd('midgame', audio).then(() => done(), () => done());
  }
}

export const platform = new Platform();
if (typeof window !== 'undefined') window.auraPlatform = platform; // diagnostic (console du navigateur)
