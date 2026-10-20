// Plateformes de diffusion. Sur CrazyGames (window.AURA_PLATFORM = 'crazygames', SDK v3 chargé
// par la page), on prévient le site du début et de la fin des parties, on affiche une publicité
// entre deux combats (au plus une toutes les 3 minutes) et on coupe le son pendant la publicité.
// Partout ailleurs, ces fonctions ne font rien.
const AD_GAP = 180; // secondes minimum entre deux publicités

class Platform {
  constructor() {
    this.sdk = null;
    this.playing = false;
    this.lastAd = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
  }

  async init() {
    if (typeof window === 'undefined' || window.AURA_PLATFORM !== 'crazygames') return;
    const sdk = window.CrazyGames?.SDK;
    if (!sdk) return;
    try {
      await sdk.init();
      this.sdk = sdk;
      sdk.game.loadingStop?.();
    } catch (e) { console.warn('SDK CrazyGames indisponible :', e); }
  }

  /** Le joueur est en train de jouer (combat en cours, hors pause). */
  gameplayStart() {
    if (!this.sdk || this.playing) return;
    this.playing = true;
    try { this.sdk.game.gameplayStart(); } catch { /* ignoré */ }
  }

  /** Le joueur ne joue plus (menu, pause, fin de combat). */
  gameplayStop() {
    if (!this.sdk || !this.playing) return;
    this.playing = false;
    try { this.sdk.game.gameplayStop(); } catch { /* ignoré */ }
  }

  /** Grand moment de joie (victoire, niveau réussi). */
  happytime() {
    try { this.sdk?.game.happytime(); } catch { /* ignoré */ }
  }

  /** Vraies publicités disponibles (sinon, les bonus « pub » sont offerts directement). */
  get hasAds() {
    return !!this.sdk;
  }

  /**
   * Publicité récompensée, toujours lancée par le joueur. Résout `true` si la récompense est due.
   * Hors CrazyGames (version .exe, HTML), il n'y a pas de publicité : le bonus est accordé.
   */
  rewardedAd(audio) {
    if (!this.sdk) return Promise.resolve(true);
    return new Promise((resolve) => {
      let finished = false;
      const end = (ok) => {
        if (finished) return;
        finished = true;
        audio?.setMuted?.(false);
        this.lastAd = performance.now() / 1000; // pas de publicité intercalée juste après
        resolve(ok);
      };
      this.gameplayStop();
      try {
        this.sdk.ad.requestAd('rewarded', {
          adStarted: () => audio?.setMuted?.(true),
          adFinished: () => end(true),
          adError: () => end(false),
        });
      } catch { end(false); }
    });
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
   * Publicité entre deux combats, si le délai minimum est écoulé. `audio` est coupé pendant la
   * publicité ; `done` est toujours appelé ensuite (même sans publicité ou en cas d'erreur).
   */
  midgameAd(audio, done = () => {}) {
    const now = performance.now() / 1000;
    if (!this.sdk || now - this.lastAd < AD_GAP) { done(); return; }
    this.lastAd = now;
    this.gameplayStop();
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      audio?.setMuted?.(false);
      done();
    };
    try {
      this.sdk.ad.requestAd('midgame', {
        adStarted: () => audio?.setMuted?.(true),
        adFinished: end,
        adError: end,
      });
    } catch { end(); }
  }
}

export const platform = new Platform();
