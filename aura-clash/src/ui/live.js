// Écrans de la progression « en continu » : passe de combat, missions, coffres de temps de jeu,
// connexion quotidienne, roue, succès, et révélation animée des récompenses (ouverture de coffre).
// Ces méthodes sont ajoutées à la classe UI (voir la fin du fichier).
import { CHAR_BY_ID } from '../game/characters.js';
import {
  refresh, seasonInfo, passTier, tierReward, PASS_TIERS, TIER_XP, bonusChests, GOLD_ADS,
  missionText, missionProgress, missionReward, rerollMission, MISSION_REROLLS,
  PLAY_CHESTS, LOGIN_DAYS, loginReward, loginState, claimLogin,
  WHEEL, WHEEL_AD_SPINS, spinWheel, dayIndex, msToMidnight, msToWeekEnd, fmtLeft, isWeekend,
  ACHIEVEMENTS, statValue, RARITY_BY_ID, CHESTS, chestOdds, pendingCounts,
  SKIN_BY_ID, TITLE_BY_ID, FRAME_BY_ID, FRAGS_TO_UNLOCK,
} from '../core/liveops.js';
import { grant, flatten, rewardLabel, rewardRarity, rewardIcon } from '../core/rewards.js';
import { platform } from '../platform.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const pct = (a, b) => `${Math.round(Math.max(0, Math.min(1, b ? a / b : 0)) * 100)}%`;

export const liveScreens = {
  /** État à jour (nouveau jour, nouvelle saison…). */
  live() {
    const prof = this.app.profile;
    refresh(prof.data.live, Date.now(), prof.data.stats || {}, prof.playableIds());
    return prof.data.live;
  },

  pending() {
    const prof = this.app.profile;
    return pendingCounts(this.live(), Date.now(), prof.data.stats || {});
  },

  /** Libellé d'un bouton « publicité » (une vraie pub sur CrazyGames, un bonus offert ailleurs). */
  adLabel(text) {
    return `<span class="ad-l">${platform.hasAds ? '<span class="ad-ico">▶</span>' : '<span class="ad-ico gift">🎁</span>'} ${text}</span>`;
  },

  /** Lance une pub récompensée ; `onReward` est appelé si elle a été regardée. */
  async watchAd(onReward) {
    if (this.adBusy) return;
    this.adBusy = true;
    const ok = await platform.rewardedAd(this.app.audio);
    this.adBusy = false;
    if (ok) onReward();
    else this.toast('Publicité indisponible pour le moment, réessaie plus tard.', 3.5);
  },

  /** Carte d'une récompense (pas encore concrète : aperçu). */
  rewardCard(r, cls = '') {
    const rar = rewardRarity(r);
    const img = r.t === 'char' || (r.t === 'frag' && r.id) ? this.portrait(r.id, 'rw-portrait') : '';
    const sw = r.t === 'skin' && r.id ? `<i class="rw-swatch" style="--a:${SKIN_BY_ID[r.id].aura};--b:${SKIN_BY_ID[r.id].tint}"></i>` : '';
    return `<div class="rw-card r-${rar} ${cls}" style="--rc:${RARITY_BY_ID[rar].color}">
      ${img || sw || `<span class="rw-ico">${rewardIcon(r)}</span>`}
      <span class="rw-lbl">${esc(rewardLabel(r))}</span></div>`;
  },

  /** En-tête commun des écrans de progression (onglets, porte-monnaie). */
  liveTabs(active) {
    const p = this.pending();
    const tabs = [
      ['pass', 'Passe', p.pass], ['missions', 'Missions', p.missions], ['chests', 'Coffres', p.chests],
      ['login', 'Connexion', p.login], ['wheel', 'Roue', p.wheel], ['ach', 'Succès', p.ach],
    ];
    return `<nav class="lv-tabs">${tabs.map(([id, label, n]) => `<button class="lv-tab ${id === active ? 'on' : ''}" data-nav data-tab="${id}">${label}${n ? `<i class="dot">${n}</i>` : ''}</button>`).join('')}
      <span class="wallet inline lv-wallet">${this.app.profile.ryo} <small>Ryō</small></span></nav>`;
  },

  bindTabs(el) {
    const go = { pass: () => this.passScreen(), missions: () => this.missionsScreen(), chests: () => this.chestsScreen(), login: () => this.loginScreen(), wheel: () => this.wheelScreen(), ach: () => this.achScreen() };
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => go[b.dataset.tab]()));
  },

  /** Focus sur l'élément `sel` après réaffichage (navigation à la manette). */
  refocus(sel) {
    const el = sel && this.screen && this.screen.el.querySelector(sel);
    if (el) this.focus(el, false);
  },

  // --- Révélation des récompenses ---------------------------------------------------------------

  /**
   * Affiche les récompenses obtenues : ouverture de coffre animée, puis cartes retournées une à une.
   * `results` : sortie de grant(). `onDone` : appelé à la fermeture.
   */
  reveal(results, title = 'RÉCOMPENSES', onDone = null) {
    const chest = results.length === 1 && results[0].t === 'chest' ? results[0] : null;
    const cards = chest ? chest.cards : flatten(results).filter((r) => r.t !== 'chest' || !r.cards);
    const extraChests = chest ? [] : results.filter((r) => r.t === 'chest');
    const all = [...cards, ...extraChests.flatMap((c) => c.cards)];
    const best = all.reduce((m, r) => Math.max(m, RARITY_BY_ID[rewardRarity(r)] ? ['common', 'rare', 'epic', 'legendary', 'mythic'].indexOf(rewardRarity(r)) : 0), 0);
    const rar = chest ? chest.r : ['common', 'rare', 'epic', 'legendary', 'mythic'][best];
    const color = RARITY_BY_ID[rar].color;
    const ov = h(`<div class="reveal r-${rar}" style="--rc:${color}">
      <div class="rv-rays"></div>
      <div class="rv-title">${chest ? `COFFRE ${esc(RARITY_BY_ID[chest.r].name.toUpperCase())}` : esc(title)}</div>
      ${chest || extraChests.length ? `<div class="rv-chest"><div class="rv-lid"></div><div class="rv-box"><span>箱</span></div></div>` : ''}
      <div class="rv-cards">${all.map((r, i) => `<div class="rv-slot" style="--i:${i}"><div class="rv-flip"><div class="rv-back">?</div><div class="rv-front">${this.rewardCard(r)}</div></div></div>`).join('')}</div>
      <button class="btn rv-ok">Continuer</button>
    </div>`);
    document.body.appendChild(ov);
    const audio = this.app.audio;
    const hasChest = !!ov.querySelector('.rv-chest');
    const slots = [...ov.querySelectorAll('.rv-slot')];
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    let t0 = 0;
    if (hasChest) {
      audio.play('charge');
      later(900, () => { ov.classList.add('open'); audio.play(rar === 'legendary' || rar === 'mythic' ? 'bigExplosion' : 'explosion'); });
      t0 = 1300;
    }
    slots.forEach((s, i) => {
      const rr = rewardRarity(all[i]);
      const slow = rr === 'legendary' || rr === 'mythic';
      const at = t0 + i * 380 + (slow ? 400 : 0);
      later(at, () => {
        s.classList.add('flip', `r-${rr}`);
        audio.play(slow ? 'ultRelease' : rr === 'epic' ? 'transform' : 'ui_ok');
      });
    });
    later(t0 + slots.length * 380 + 600, () => ov.classList.add('done'));
    let closed = false;
    const close = () => {
      if (closed) return;
      if (!ov.classList.contains('done')) {
        // Premier appui : tout révéler d'un coup
        timers.forEach(clearTimeout);
        ov.classList.add('open', 'done');
        slots.forEach((s, i) => s.classList.add('flip', `r-${rewardRarity(all[i])}`));
        return;
      }
      closed = true;
      ov.classList.add('out');
      setTimeout(() => ov.remove(), 250);
      this.revealOpen = null;
      if (all.some((r) => r.t === 'ryo')) this.flyCoins();
      if (all.some((r) => r.unlocked || r.t === 'char')) {
        const c = all.find((r) => r.unlocked || r.t === 'char');
        this.toast(`★ ${CHAR_BY_ID[c.id].name} est débloqué !`, 4);
      }
      if (onDone) onDone();
    };
    ov.addEventListener('click', close);
    this.revealOpen = close; // clavier et manette : voir UI.handle
    platform.happytime();
  },

  /** Pièces qui volent vers le porte-monnaie. */
  flyCoins(n = 14) {
    const target = document.querySelector('.lv-wallet, .h2-ryo, .wallet');
    const tr = target ? target.getBoundingClientRect() : { left: innerWidth - 80, top: 20, width: 40, height: 20 };
    const tx = tr.left + tr.width / 2;
    const ty = tr.top + tr.height / 2;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.className = 'fly-coin';
      const sx = innerWidth / 2 + (Math.random() - 0.5) * 240;
      const sy = innerHeight / 2 + (Math.random() - 0.5) * 140;
      c.style.left = `${sx}px`;
      c.style.top = `${sy}px`;
      document.body.appendChild(c);
      const delay = i * 45;
      c.animate([
        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
        { transform: `translate(calc(-50% + ${(Math.random() - 0.5) * 80}px), calc(-50% - 60px)) scale(1.1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(calc(-50% + ${tx - sx}px), calc(-50% + ${ty - sy}px)) scale(0.6)`, opacity: 0.9 },
      ], { duration: 900, delay, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' }).onfinish = () => c.remove();
    }
    if (target) setTimeout(() => { target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump'); }, 900);
    setTimeout(() => this.app.audio.play('ui_ok'), 900);
  },

  /** Montée de palier ou de niveau en plein écran. */
  bigBanner(big, small, color = '#ffd23f') {
    const el = h(`<div class="big-banner" style="--c:${color}"><b>${esc(big)}</b><small>${esc(small)}</small></div>`);
    document.body.appendChild(el);
    this.app.audio.play('roundWin');
    setTimeout(() => el.remove(), 2600);
  },

  // --- Passe de combat ----------------------------------------------------------------------------

  passScreen(focusTier = null) {
    const prof = this.app.profile;
    const live = this.live();
    const now = Date.now();
    const S = seasonInfo(now);
    const tier = passTier(live.passXp);
    const into = live.passXp - tier * TIER_XP;
    const bonus = bonusChests(live.passXp) - live.bonusClaimed;
    const boost = live.boostUntil > now;
    const cols = [];
    for (let n = 1; n <= PASS_TIERS; n++) {
      const reached = n <= tier;
      const fr = tierReward(S, n, 'free');
      const pr = tierReward(S, n, 'premium');
      const fC = live.freeClaimed.includes(n);
      const pC = live.premClaimed.includes(n);
      cols.push(`<div class="ps-col ${reached ? 'reached' : ''} ${n === tier ? 'cur' : ''} ${n % 10 === 0 || n === 30 ? 'big' : ''}">
        <div class="ps-n">${n}</div>
        <button class="ps-cell free ${fC ? 'claimed' : reached ? 'ready' : ''}" data-nav data-claim="free" data-n="${n}">${this.rewardCard(fr)}${fC ? '<i class="ps-ok">✔</i>' : ''}</button>
        <button class="ps-cell prem ${pC ? 'claimed' : reached ? 'ready' : ''} ${live.gold ? '' : 'locked'}" data-nav data-claim="prem" data-n="${n}">${this.rewardCard(pr)}${pC ? '<i class="ps-ok">✔</i>' : live.gold ? '' : `<i class="ps-lock">${reached ? '▶' : '🔒'}</i>`}</button>
      </div>`);
    }
    const el = h(`<div class="screen live pass" style="--sc:${S.color}">
      ${this.liveTabs('pass')}
      <header class="ps-head">
        <div class="ps-season"><small>SAISON ${S.num}</small><b>${esc(S.name)}</b><span class="ps-ends ${S.finalWeek ? 'hot' : ''}">⏳ ${S.finalWeek ? 'Dernière semaine ! XP ×1,5 — ' : ''}fin dans ${fmtLeft(S.endsIn)}</span></div>
        <div class="ps-tier"><span class="ps-badge">${tier}</span><div class="ps-bar"><i style="width:${tier >= PASS_TIERS ? '100%' : pct(into, TIER_XP)}"></i><span>${tier >= PASS_TIERS ? `Bonus : ${live.passXp - PASS_TIERS * TIER_XP} XP` : `${into} / ${TIER_XP} XP`}</span></div><small>palier ${tier} / ${PASS_TIERS}</small></div>
        <div class="ps-gold ${live.gold ? 'on' : ''}">${live.gold ? '<b>PASS OR ACTIF</b><small>toute la voie premium est débloquée</small>'
    : `<b>PASS OR</b><div class="ps-bar thin"><i style="width:${pct(live.passAds, GOLD_ADS)}"></i></div><small>${live.passAds} / ${GOLD_ADS} — chaque bonus débloque un palier premium</small>`}</div>
      </header>
      <div class="ps-legend"><span class="free">GRATUIT</span><span class="prem">PREMIUM</span></div>
      <div class="ps-track">${cols.join('')}</div>
      <footer class="ps-foot">
        <button class="btn small ${boost ? 'on' : ''}" data-nav data-act="boost">${boost ? `⚡ Boost ×2 actif (${fmtLeft(live.boostUntil - now)})` : this.adLabel('Boost ×2 XP — 15 min')}</button>
        <button class="btn small" data-nav data-act="buytier" ${tier >= PASS_TIERS ? 'disabled' : ''}>+1 palier — 600 Ryō</button>
        ${bonus > 0 ? `<button class="btn small gold pulse" data-nav data-act="bonus">Coffre bonus ×${bonus}</button>` : ''}
        <span class="ps-tip">${isWeekend(now) ? '🔥 Week-end de l’Aura : XP de passe ×2 !' : 'Gagne de l’XP de passe en combattant et avec les missions.'}</span>
        <button class="btn small ghost" data-nav data-act="back">Retour</button>
      </footer>
    </div>`);
    this.bindTabs(el);
    const track = el.querySelector('.ps-track');
    el.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', () => {
      const n = Number(b.dataset.n);
      const prem = b.dataset.claim === 'prem';
      const claimed = prem ? live.premClaimed : live.freeClaimed;
      if (claimed.includes(n)) return;
      if (n > passTier(live.passXp)) { this.app.audio.play('denied'); this.toast(`Atteins le palier ${n} pour réclamer cette récompense.`); return; }
      const give = () => {
        claimed.push(n);
        const res = grant(prof, tierReward(S, n, prem ? 'premium' : 'free'));
        this.reveal(res, `PALIER ${n}`, () => { this.passScreen(n); this.refocus(`[data-claim="${prem ? 'prem' : 'free'}"][data-n="${n}"]`); });
      };
      if (prem && !live.gold) {
        // Un bonus (pub) débloque ce palier premium ; 20 bonus = Pass Or
        this.watchAd(() => {
          live.passAds += 1;
          if (live.passAds >= GOLD_ADS) { live.gold = true; this.bigBanner('PASS OR', 'toute la voie premium est débloquée !', '#ffd23f'); }
          give();
        });
        return;
      }
      give();
    }));
    el.querySelector('[data-act=boost]').addEventListener('click', () => {
      if (live.boostUntil > Date.now()) { this.toast('Le boost est déjà actif.'); return; }
      this.watchAd(() => { grant(prof, { t: 'boost', min: 15 }); this.bigBanner('BOOST ×2', 'XP de passe doublée pendant 15 minutes', '#7fd8ff'); this.passScreen(); this.refocus('[data-act=boost]'); });
    });
    el.querySelector('[data-act=buytier]').addEventListener('click', () => {
      if (prof.data.ryo < 600) { this.app.audio.play('denied'); this.toast(`Il te manque ${600 - prof.data.ryo} Ryō.`); return; }
      prof.data.ryo -= 600;
      const before = passTier(live.passXp);
      grant(prof, { t: 'xp', n: TIER_XP - (live.passXp % TIER_XP) });
      this.bigBanner(`PALIER ${passTier(live.passXp)}`, 'récompense prête à réclamer', '#ffd23f');
      this.passScreen(before + 1);
      this.refocus('[data-act=buytier]');
    });
    el.querySelector('[data-act=bonus]')?.addEventListener('click', () => {
      live.bonusClaimed += 1;
      this.reveal(grant(prof, { t: 'chest', r: 'epic' }), 'COFFRE BONUS', () => this.passScreen());
    });
    el.querySelector('[data-act=back]').addEventListener('click', () => this.mainMenu());
    this.show({ el, back: () => this.mainMenu() });
    // Défilement jusqu'au palier en cours (ou demandé)
    const n = focusTier || Math.max(1, Math.min(PASS_TIERS, tier + 1));
    const col = track.children[n - 1];
    if (col) {
      track.scrollLeft = col.offsetLeft - track.clientWidth / 2 + col.clientWidth / 2;
      const ready = el.querySelector('.ps-cell.ready:not(.claimed)');
      this.focus(ready || col.querySelector('.ps-cell'), false);
    }
  },

  // --- Missions ------------------------------------------------------------------------------------

  missionsScreen() {
    const prof = this.app.profile;
    const live = this.live();
    const stats = prof.data.stats || {};
    const now = Date.now();
    const row = (m, i) => {
      const p = missionProgress(m, stats);
      const rw = missionReward(m);
      return `<div class="ms-row ${m.claimed ? 'claimed' : p.done ? 'done' : ''}">
        <div class="ms-txt"><b>${esc(missionText(m))}</b><div class="ch-bar"><i style="width:${pct(p.value, p.goal)}"></i></div></div>
        <div class="ms-val">${p.value} / ${p.goal}</div>
        <div class="ms-rw">${rw.map((r) => `<span class="chip r-${rewardRarity(r)}">${esc(rewardLabel(r))}</span>`).join('')}</div>
        ${m.claimed ? '<div class="ch-ok">✔</div>' : p.done
    ? `<button class="btn small gold pulse" data-nav data-mclaim="${m.kind}:${i}">Réclamer</button>`
    : `<button class="btn small ghost" data-nav data-reroll="${m.kind}:${i}" ${live.rerolls >= MISSION_REROLLS ? 'disabled' : ''}>${this.adLabel('Changer')}</button>`}
      </div>`;
    };
    const el = h(`<div class="screen live missions">
      ${this.liveTabs('missions')}
      <section><h3>Missions du jour <small>⏳ nouvelles dans ${fmtLeft(msToMidnight(now))}</small></h3>${live.daily.map(row).join('')}</section>
      <section><h3>Missions de la semaine <small>⏳ nouvelles dans ${fmtLeft(msToWeekEnd(now))}</small></h3>${live.weekly.map(row).join('')}</section>
      <p class="menu-sub">Changements restants aujourd’hui : ${MISSION_REROLLS - live.rerolls}. Les missions rapportent beaucoup d’XP de passe !</p>
      <button class="btn ghost" data-nav data-act="back">Retour</button>
    </div>`);
    this.bindTabs(el);
    const at = (v) => { const [kind, i] = v.split(':'); return { kind, i: Number(i), list: kind === 'weekly' ? live.weekly : live.daily }; };
    el.querySelectorAll('[data-mclaim]').forEach((b) => b.addEventListener('click', () => {
      const { list, i } = at(b.dataset.mclaim);
      const m = list[i];
      if (!m || m.claimed || !missionProgress(m, stats).done) return;
      m.claimed = true;
      const res = grant(prof, missionReward(m));
      this.reveal(res, 'MISSION ACCOMPLIE', () => { this.missionsScreen(); this.refocus('[data-mclaim]'); });
    }));
    el.querySelectorAll('[data-reroll]').forEach((b) => b.addEventListener('click', () => {
      const { kind, i } = at(b.dataset.reroll);
      if (live.rerolls >= MISSION_REROLLS) return;
      this.watchAd(() => {
        rerollMission(live, kind, i, stats, prof.playableIds());
        prof.save();
        this.missionsScreen();
        this.refocus(`[data-reroll="${kind}:${i}"]`);
      });
    }));
    el.querySelector('[data-act=back]').addEventListener('click', () => this.mainMenu());
    this.show({ el, back: () => this.mainMenu() });
    this.refocus('[data-mclaim]');
  },

  // --- Coffres de temps de jeu -------------------------------------------------------------------------

  chestsScreen() {
    const prof = this.app.profile;
    const live = this.live();
    const played = live.dayPlay;
    const el = h(`<div class="screen live chests">
      ${this.liveTabs('chests')}
      <h3 class="lv-h">Coffres du jour <small>Joue pour les ouvrir — temps de jeu aujourd’hui : <b class="ct-played">${Math.floor(played / 60)} min</b></small></h3>
      <div class="ct-row">${PLAY_CHESTS.map(([min, r], i) => {
        const ready = played >= min * 60;
        const got = live.playChests.includes(i);
        const odds = chestOdds(r);
        return `<div class="ct-chest r-${r} ${got ? 'claimed' : ready ? 'ready' : ''}" style="--rc:${RARITY_BY_ID[r].color}">
          <div class="ct-box">箱</div>
          <b>${esc(RARITY_BY_ID[r].name)}</b>
          <small class="ct-time" data-min="${min}">${got ? 'ouvert ✔' : ready ? 'prêt !' : `dans ${fmtLeft((min * 60 - played) * 1000)}`}</small>
          <small class="ct-odds">${CHESTS[r].cards} cartes · skin ${Math.round(odds.skin * 100)} %</small>
          ${got ? '' : `<button class="btn small ${ready ? 'gold pulse' : ''}" data-nav data-open="${i}" ${ready ? '' : 'disabled'}>Ouvrir</button>
          <button class="btn small ghost" data-nav data-open2="${i}" ${ready ? '' : 'disabled'}>${this.adLabel('×2')}</button>`}
        </div>`;
      }).join('')}</div>
      <p class="menu-sub">Les coffres se remplissent pendant que tu joues (menus compris). Ils se renouvellent chaque jour à minuit.</p>
      <button class="btn ghost" data-nav data-act="back">Retour</button>
    </div>`);
    this.bindTabs(el);
    const open = (i, twice) => {
      if (live.playChests.includes(i) || live.dayPlay < PLAY_CHESTS[i][0] * 60) return;
      live.playChests.push(i);
      const r = PLAY_CHESTS[i][1];
      const res = twice ? [...grant(prof, { t: 'chest', r }), ...grant(prof, { t: 'chest', r })] : grant(prof, { t: 'chest', r });
      this.reveal(res, twice ? 'COFFRES ×2' : 'COFFRE', () => { this.chestsScreen(); this.refocus('[data-open]:not([disabled])'); });
    };
    el.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => open(Number(b.dataset.open), false)));
    el.querySelectorAll('[data-open2]').forEach((b) => b.addEventListener('click', () => this.watchAd(() => open(Number(b.dataset.open2), true))));
    el.querySelector('[data-act=back]').addEventListener('click', () => this.mainMenu());
    // Compte à rebours vivant
    const timer = setInterval(() => {
      el.querySelector('.ct-played').textContent = `${Math.floor(live.dayPlay / 60)} min`;
      el.querySelectorAll('.ct-time').forEach((t) => {
        const min = Number(t.dataset.min);
        const left = min * 60 - live.dayPlay;
        if (left > 0) t.textContent = `dans ${fmtLeft(left * 1000)}`;
        else if (t.textContent.startsWith('dans')) this.chestsScreen();
      });
    }, 1000);
    this.show({ el, back: () => this.mainMenu(), destroy: () => clearInterval(timer) });
    this.refocus('[data-open]:not([disabled])');
  },

  // --- Connexion quotidienne ---------------------------------------------------------------------------

  loginScreen(popup = false) {
    const prof = this.app.profile;
    const live = this.live();
    const now = Date.now();
    const st = loginState(live, now);
    const cur = st.claimable ? st.day : live.login.streak;
    const el = h(`<div class="screen live login ${popup ? 'popup' : ''}">
      ${popup ? '<h2 class="menu-title">CONNEXION DU JOUR</h2>' : this.liveTabs('login')}
      <p class="menu-sub">Reviens chaque jour : la récompense grandit. Jour ${LOGIN_DAYS} : un combattant complet !</p>
      ${st.broken ? `<div class="lg-broken">💔 Tu as manqué un jour : ta série de <b>${st.broken} jours</b> est perdue… <button class="btn small gold" data-nav data-act="rescue">${this.adLabel('Sauver ma série')}</button></div>` : ''}
      <div class="lg-grid">${Array.from({ length: LOGIN_DAYS }, (_, k) => {
        const d = k + 1;
        const done = st.claimable ? d < cur : d <= cur;
        const today = st.claimable && d === cur;
        return `<div class="lg-day ${done ? 'done' : ''} ${today ? 'today' : ''} ${d % 7 === 0 ? 'big' : ''}"><small>Jour ${d}</small>${this.rewardCard(loginReward(d))}${done ? '<i class="ps-ok">✔</i>' : ''}</div>`;
      }).join('')}</div>
      <div class="lg-actions">
        ${st.claimable ? `<button class="btn gold pulse" data-nav data-act="claim">Réclamer le jour ${cur}</button>` : `<span class="muted">Reviens demain ! (dans ${fmtLeft(msToMidnight(now))})</span>`}
        <button class="btn ghost" data-nav data-act="back">${popup ? 'Plus tard' : 'Retour'}</button>
      </div>
    </div>`);
    if (!popup) this.bindTabs(el);
    const after = () => (popup ? this.mainMenu() : this.loginScreen());
    const claim = (rescue) => {
      const r = claimLogin(live, Date.now(), rescue);
      if (!r) return;
      prof.data.stats = prof.data.stats || {};
      prof.data.stats.loginDays = (prof.data.stats.loginDays || 0) + 1;
      this.reveal(grant(prof, r.reward), `JOUR ${r.day}`, after);
    };
    el.querySelector('[data-act=claim]')?.addEventListener('click', () => claim(false));
    el.querySelector('[data-act=rescue]')?.addEventListener('click', () => this.watchAd(() => claim(true)));
    el.querySelector('[data-act=back]').addEventListener('click', () => this.mainMenu());
    this.show({ el, back: () => this.mainMenu() });
    this.refocus('[data-act=claim]');
    const today = el.querySelector('.lg-day.today');
    if (today) today.scrollIntoView({ block: 'nearest' });
  },

  // --- Roue de la fortune ----------------------------------------------------------------------------

  wheelScreen() {
    const prof = this.app.profile;
    const live = this.live();
    const d = dayIndex(Date.now());
    if (live.wheel.day !== d) live.wheel = { day: d, free: false, ads: 0 };
    const W = live.wheel;
    const total = WHEEL.reduce((n, s) => n + s.w, 0);
    // Segments de taille égale à l'écran (les chances réelles sont affichées à côté)
    const seg = 360 / WHEEL.length;
    const grad = WHEEL.map((s, i) => `${s.color} ${i * seg}deg ${(i + 1) * seg}deg`).join(',');
    const el = h(`<div class="screen live wheel">
      ${this.liveTabs('wheel')}
      <div class="wh-body">
        <div class="wh-wrap"><div class="wh-pointer">▼</div>
          <div class="wh-wheel" style="background:conic-gradient(${grad})">${WHEEL.map((s, i) => `<div class="wh-lbl" style="--a:${i * seg + seg / 2}deg"><span>${rewardIcon(s.reward)}</span><small>${esc(s.reward.jackpot ? 'JACKPOT' : s.reward.t === 'ryo' ? `${s.reward.n}` : s.reward.t === 'xp' ? `${s.reward.n} XP` : s.reward.t === 'frag' ? `${s.reward.n} ◆` : s.reward.t === 'chest' ? RARITY_BY_ID[s.reward.r].name : 'Skin')}</small></div>`).join('')}</div>
          <div class="wh-hub">運</div>
        </div>
        <div class="wh-side">
          <h3>Roue de la fortune</h3>
          <button class="btn gold ${W.free ? '' : 'pulse'}" data-nav data-act="free" ${W.free ? 'disabled' : ''}>${W.free ? 'Tour gratuit utilisé' : 'Tour gratuit !'}</button>
          <button class="btn" data-nav data-act="ad" ${W.ads >= WHEEL_AD_SPINS ? 'disabled' : ''}>${this.adLabel(`Tour bonus (${WHEEL_AD_SPINS - W.ads} restants)`)}</button>
          <table class="wh-odds">${WHEEL.map((s) => `<tr><td>${esc(s.reward.jackpot ? 'JACKPOT 3000 Ryō' : rewardLabel(s.reward))}</td><td>${(s.w / total * 100).toFixed(1)} %</td></tr>`).join('')}</table>
          <button class="btn ghost small" data-nav data-act="back">Retour</button>
        </div>
      </div>
    </div>`);
    this.bindTabs(el);
    const wheel = el.querySelector('.wh-wheel');
    let spinning = false;
    const spin = (paid) => {
      if (spinning) return;
      spinning = true;
      const i = spinWheel(Math.random);
      if (paid) W.ads += 1; else W.free = true;
      prof.save();
      // Le segment i s'arrête sous le pointeur (en haut), après plusieurs tours
      const target = 360 * 6 + (360 - (i * seg + seg / 2)) + (Math.random() - 0.5) * seg * 0.6;
      wheel.style.transition = 'transform 4.2s cubic-bezier(.12,.7,.08,1)';
      wheel.style.transform = `rotate(${target}deg)`;
      let ticks = 0;
      const tick = setInterval(() => { this.app.audio.play('ui_move'); if (++ticks > 26) clearInterval(tick); }, 140);
      setTimeout(() => {
        clearInterval(tick);
        const s = WHEEL[i];
        if (s.reward.jackpot) {
          this.bigBanner('JACKPOT !', '3000 Ryō', '#ff3a5a');
          prof.data.stats.wheelJackpots = (prof.data.stats.wheelJackpots || 0) + 1;
          if (!prof.data.live.titles.includes('chanceux')) grant(prof, { t: 'title', id: 'chanceux' });
        }
        this.reveal(grant(prof, s.reward), s.reward.jackpot ? 'JACKPOT' : 'ROUE', () => { this.wheelScreen(); this.refocus('[data-act=ad]'); });
      }, 4400);
    };
    el.querySelector('[data-act=free]').addEventListener('click', () => { if (!W.free) spin(false); });
    el.querySelector('[data-act=ad]').addEventListener('click', () => { if (W.ads < WHEEL_AD_SPINS) this.watchAd(() => spin(true)); });
    el.querySelector('[data-act=back]').addEventListener('click', () => this.mainMenu());
    this.show({ el, back: () => { if (!spinning) this.mainMenu(); } });
    this.refocus(W.free ? '[data-act=ad]' : '[data-act=free]');
  },

  // --- Succès --------------------------------------------------------------------------------------

  achScreen() {
    const prof = this.app.profile;
    const live = this.live();
    const stats = prof.data.stats || {};
    const list = ACHIEVEMENTS.map((a) => {
      const v = Math.min(a.goal, statValue(stats, a.stat));
      return { a, v, done: v >= a.goal, claimed: live.ach.includes(a.id) };
    }).sort((x, y) => (y.done && !y.claimed) - (x.done && !x.claimed) || x.claimed - y.claimed || (y.v / y.a.goal) - (x.v / x.a.goal));
    const got = live.ach.length;
    const el = h(`<div class="screen live ach">
      ${this.liveTabs('ach')}
      <h3 class="lv-h">Succès <small>${got} / ${ACHIEVEMENTS.length} — ${Math.round(got / ACHIEVEMENTS.length * 100)} % de complétion</small></h3>
      <div class="ach-bar"><i style="width:${pct(got, ACHIEVEMENTS.length)}"></i></div>
      <div class="ch-list">${list.map(({ a, v, done, claimed }) => `<div class="ch-row ${claimed ? 'claimed' : done ? 'done' : ''}">
        <div class="ch-txt"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small><div class="ch-bar"><i style="width:${pct(v, a.goal)}"></i></div></div>
        <div class="ch-val">${v} / ${a.goal}</div>
        ${claimed ? '<div class="ch-ok">✔</div>' : `<button class="btn small ${done ? 'gold pulse' : ''}" data-nav data-ach="${a.id}" ${done ? '' : 'disabled'}>${esc(rewardLabel(a.reward))}</button>`}
      </div>`).join('')}</div>
      <button class="btn ghost" data-nav data-act="back">Retour</button>
    </div>`);
    this.bindTabs(el);
    el.querySelectorAll('[data-ach]').forEach((b) => b.addEventListener('click', () => {
      const a = ACHIEVEMENTS.find((x) => x.id === b.dataset.ach);
      if (!a || live.ach.includes(a.id) || statValue(stats, a.stat) < a.goal) return;
      live.ach.push(a.id);
      this.reveal(grant(prof, a.reward), a.name.toUpperCase(), () => { this.achScreen(); this.refocus('[data-ach]:not([disabled])'); });
    }));
    el.querySelector('[data-act=back]').addEventListener('click', () => this.mainMenu());
    this.show({ el, back: () => this.mainMenu() });
    this.refocus('[data-ach]:not([disabled])');
  },

  // --- Fin de combat : XP de passe et bonus ×2 ---------------------------------------------------------

  /** Bloc « passe de combat » de l'écran de résultats, avec le bouton ×2 (pub). */
  passResultHtml(battle) {
    const g = battle && battle.passGain;
    if (!g) return '';
    const live = this.app.profile.data.live;
    const tier = passTier(live.passXp);
    const into = tier >= PASS_TIERS ? TIER_XP : live.passXp - tier * TIER_XP;
    const ryo = Math.max(0, this.app.profile.data.ryo - g.ryoBefore);
    battle.passRyo = battle.passRyo ?? ryo;
    return `<div class="pr-box">
      <div class="pr-line"><span class="ps-badge sm">${tier}</span><div class="ps-bar"><i class="pr-fill" style="width:${pct(into, TIER_XP)}"></i><span>+${g.xp} XP de passe</span></div></div>
      ${g.bonuses.length ? `<div class="pr-bonus">${g.bonuses.map((b) => `<span class="chip gold">${esc(b)}</span>`).join('')}</div>` : ''}
      ${g.tierAfter > g.tierBefore ? `<div class="pr-up">★ Palier ${g.tierAfter} atteint ! Récompense à réclamer dans le Passe.</div>` : ''}
      ${battle.doubled ? '<div class="pr-up">Récompenses doublées ✔</div>' : `<button class="btn gold pulse pr-x2" data-nav>${this.adLabel(`×2 récompenses (+${g.xp} XP${battle.passRyo ? `, +${battle.passRyo} Ryō` : ''})`)}</button>`}
    </div>`;
  },

  bindPassResult(el, battle) {
    const b = el.querySelector('.pr-x2');
    if (!b) return;
    b.addEventListener('click', () => this.watchAd(() => {
      if (battle.doubled) return;
      battle.doubled = true;
      const prof = this.app.profile;
      const res = grant(prof, [{ t: 'xp', n: battle.passGain.xp }, ...(battle.passRyo ? [{ t: 'ryo', n: battle.passRyo }] : [])]);
      b.outerHTML = '<div class="pr-up">Récompenses doublées ✔</div>';
      this.flyCoins();
      const up = res.find((r) => r.tierUp);
      if (up) this.bigBanner(`PALIER ${up.tierUp}`, 'récompense à réclamer dans le Passe');
      const fill = el.querySelector('.pr-fill');
      const live = prof.data.live;
      const tier = passTier(live.passXp);
      if (fill) fill.style.width = pct(tier >= PASS_TIERS ? TIER_XP : live.passXp - tier * TIER_XP, TIER_XP);
      const badge = el.querySelector('.pr-box .ps-badge');
      if (badge) badge.textContent = tier;
    }));
  },
};

export function installLive(UI) {
  Object.assign(UI.prototype, liveScreens);
}

export { FRAGS_TO_UNLOCK, TITLE_BY_ID, FRAME_BY_ID };
