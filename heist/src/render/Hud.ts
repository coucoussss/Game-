import type { GameData, IntelDef, ItemId } from '../data/types';
import type { Report, World } from '../systems/World';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

export type Overlay = 'title' | 'pause' | 'notebook' | 'shop' | 'report' | 'win' | null;

const MARKER_COLORS: Record<IntelDef['marker'], string> = {
  camera: '#ff5a5a',
  cash: '#f2c94c',
  safe: '#f2994a',
  power: '#56ccf2',
  door: '#bb86fc',
  person: '#6fcf97',
  info: '#e0e0e0',
};

const SITE_NAMES: Record<string, string> = {
  town: 'Le quartier',
  store: 'Supérette Lumière',
  jewelry: 'Bijouterie Aurore',
  bank: 'Banque Centrale du Crédit',
};

function money(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} $`;
}

function formatDuration(gameSeconds: number): string {
  const m = Math.round(gameSeconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

export interface HudCallbacks {
  resume(): void;
  newGame(): void;
  continueGame(): void;
  save(): void;
  quit(): void;
  setVolume(v: number): void;
  setSensitivity(v: number): void;
}

/** Interface en surimpression (DOM) : état du joueur, invites, carnet, marché noir, menus et bilans. */
export class Hud {
  overlay: Overlay = 'title';
  private world: World;
  private readonly status: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly heat: HTMLElement;
  private readonly alert: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly lookRing: HTMLElement;
  private readonly slots: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly cross: HTMLElement;
  private readonly hit: HTMLElement;
  private readonly vitals: HTMLElement;
  private readonly ammo: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly fade: HTMLElement;
  private readonly frame: HTMLElement;
  private lastSlots = '';
  private hurt = 0;
  private hitTimer = 0;
  private fadeTimer = 0;
  hasSave = false;
  volume = 0.7;
  sensitivity = 1;

  constructor(
    root: HTMLElement,
    private readonly data: GameData,
    world: World,
    private readonly cb: HudCallbacks,
  ) {
    this.world = world;
    this.frame = el('div', 'hud-frame', root);
    const f = this.frame;
    this.status = el('div', 'hud-status', f);
    this.objective = el('div', 'hud-objective', f);
    this.heat = el('div', 'hud-heat', f);
    this.alert = el('div', 'hud-alert', f);
    this.cross = el('div', 'hud-cross', f);
    for (const side of ['t', 'b', 'l', 'r']) el('i', `c-${side}`, this.cross);
    this.hit = el('div', 'hud-hit', f);
    this.lookRing = el('div', 'hud-look', f);
    this.prompt = el('div', 'hud-prompt', f);
    this.progress = el('div', 'hud-progress', f);
    this.progressFill = el('div', 'hud-progress-fill', this.progress);
    this.slots = el('div', 'hud-slots', f);
    this.vitals = el('div', 'hud-vitals', f);
    this.ammo = el('div', 'hud-ammo', f);
    this.toasts = el('div', 'hud-toasts', f);
    this.vignette = el('div', 'hud-vignette', root);
    this.fade = el('div', 'hud-fade', root);
    this.panel = el('div', 'hud-panel', root);
    this.panel.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action) this.handle(action);
    });
    this.panel.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name === 'volume') {
        this.volume = Number(t.value);
        this.cb.setVolume(this.volume);
      } else if (t.name === 'sensitivity') {
        this.sensitivity = Number(t.value);
        this.cb.setSensitivity(this.sensitivity);
      }
    });
  }

  setWorld(world: World): void {
    this.world = world;
    this.lastSlots = '';
  }

  toast(text: string, kind: 'info' | 'intel' | 'danger' | 'money' = 'info'): void {
    const t = el('div', `toast toast-${kind}`, this.toasts);
    t.textContent = text;
    while (this.toasts.childElementCount > 5) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.classList.add('fade'), kind === 'intel' ? 6500 : 4200);
    setTimeout(() => t.remove(), kind === 'intel' ? 7500 : 5200);
  }

  /** Flash rouge (blessure) ou gris (plaques qui encaissent). */
  flashHurt(armor: boolean): void {
    this.hurt = 1;
    this.vignette.classList.toggle('armor', armor);
  }

  hitMarker(): void {
    this.hitTimer = 0.25;
  }

  /** Fondu au noir (sommeil, garde à vue). */
  blackout(): void {
    this.fadeTimer = 1.6;
  }

  private objectiveText(w: World): string {
    const inv = w.inventory;
    if (w.debtLeft <= 0) return 'Ta dette est soldée. Le quartier t’appartient.';
    if (!w.used.has('coat')) return 'Fouille ta planque : il reste peut-être quelques billets dans un manteau.';
    if (!inv.has('crowbar') && w.stats.heists === 0) return 'Trouve de quoi forcer une serrure. Fouille les bennes de la ruelle.';
    if (inv.dirty > 0) return 'Fais blanchir ton butin chez le Fourgue, dans la ruelle (18 h – 5 h).';
    if (w.stats.heists === 0) return 'Premier coup : un coffre de voiture, de nuit… ou repère la supérette (Tab : carnet).';
    if (inv.laundered < 300) return 'Monte en puissance : la supérette, de nuit, courant coupé. Le coffre rapporte gros.';
    if (inv.laundered < 1500) return 'Le Fourgue a de nouveaux outils. Prochaine cible : la Bijouterie Aurore.';
    if (!inv.has('drill')) return 'La Banque Centrale du Crédit. Il te faudra une perceuse thermique, un sac, du courage.';
    return `La chambre forte t’attend. Dette restante : ${money(w.debtLeft)} — à verser au Fourgue.`;
  }

  update(dt: number): void {
    const w = this.world;
    const inv = w.inventory;
    const rules = this.data.rules;
    const cap = inv.has('duffel-bag') ? rules.carryBag : rules.carryBase;
    this.status.innerHTML =
      `<div class="clock">${w.clock.format()}</div>` +
      `<div class="money"><span class="clean">${money(inv.cash)}</span>` +
      (inv.dirty > 0 ? ` <span class="dirty">+ ${money(inv.dirty)} sale <small>(${money(cap)} max)</small></span>` : '') +
      `</div><div class="debt">Dette : ${money(w.debtLeft)}</div>`;
    this.objective.textContent = this.objectiveText(w);
    const heat = Math.min(100, Math.round(w.heat));
    this.heat.innerHTML = `Chaleur <span class="bar"><span style="width:${heat}%"></span></span>${w.wanted ? ' <b>RECHERCHÉ</b>' : ''}`;

    // Alerte : on n'affiche que ce que le joueur peut percevoir. L'alerte silencieuse reste cachée.
    let alert = '';
    let danger = false;
    const police = w.police;
    const npcs = w.npcs.filter((n) => n.active);
    if (police.state === 'searching') {
      alert = 'POLICE SUR PLACE';
      danger = true;
    } else if (police.state === 'en-route' && (police.loud || police.timer < 12)) {
      alert = police.loud ? 'ALARME — LA POLICE ARRIVE' : 'Des sirènes approchent…';
      danger = true;
    } else if (npcs.some((n) => n.hostile)) {
      alert = 'On te tire dessus !';
      danger = true;
    } else if (npcs.some((n) => n.callTimer !== null && n.robbed === false && !n.armed)) alert = 'Quelqu’un compose un numéro…';
    else if (npcs.some((n) => n.investigating)) alert = 'Un vigile vient voir…';
    else if (npcs.some((n) => n.compliant > 0)) alert = 'Mains en l’air. Ça ne durera pas.';
    else if (npcs.some((n) => n.suspicion > 0.3)) alert = 'On te regarde de travers';
    this.alert.textContent = alert;
    this.alert.className = `hud-alert${alert ? ' on' : ''}${danger ? ' danger' : ''}`;

    this.prompt.textContent = this.overlay ? '' : (w.prompt ?? '');
    const action = w.action;
    this.progress.style.display = action ? 'block' : 'none';
    if (action) this.progressFill.style.width = `${Math.min(100, (action.progress / action.total) * 100)}%`;
    const look = w.notebook.progress();
    this.lookRing.style.display = look > 0 ? 'block' : 'none';
    this.lookRing.style.background = `conic-gradient(#e8e0c8 ${look * 360}deg, transparent 0)`;

    // Réticule : il s'ouvre en courant, se resserre en visant.
    const p = w.player;
    const spread = (p.moving ? (p.sprinting ? 16 : 9) : 5) * (w.aiming ? 0.5 : 1);
    this.cross.style.setProperty('--s', `${spread}px`);
    this.cross.classList.toggle('threat', w.threatening);
    this.cross.classList.toggle('armed', inv.held === 'pistol');
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.hit.style.opacity = String(this.hitTimer > 0 ? 1 : 0);

    // Santé et blindage.
    const hp = Math.max(0, p.hp) / rules.playerHealth;
    const armor = inv.has('plate-carrier') ? inv.armor / rules.armorPoints : -1;
    this.vitals.innerHTML =
      `<div class="vital hp"><label>SANTÉ</label><span class="bar"><span style="width:${hp * 100}%"></span></span></div>` +
      (armor >= 0
        ? `<div class="vital armor${inv.worn.has('plate-carrier') ? '' : ' off'}"><label>PLAQUES</label><span class="bar"><span style="width:${armor * 100}%"></span></span></div>`
        : '');
    this.vitals.classList.toggle('low', hp < 0.35);

    if (inv.held === 'pistol') {
      this.ammo.style.display = 'block';
      this.ammo.innerHTML = w.reloadTimer > 0 ? '<b>RECHARGE…</b>' : `<b>${inv.mag}</b> / ${inv.ammo}${inv.mag === 0 ? ' <small>[R]</small>' : ''}`;
    } else this.ammo.style.display = 'none';

    this.hurt = Math.max(0, this.hurt - dt * 1.6);
    const lowHp = hp < 0.35 ? 0.35 + Math.sin(performance.now() / 300) * 0.1 : 0;
    this.vignette.style.opacity = String(Math.max(this.hurt, lowHp));
    this.fadeTimer = Math.max(0, this.fadeTimer - dt);
    this.fade.style.opacity = String(Math.min(1, this.fadeTimer > 1.1 ? (1.6 - this.fadeTimer) * 2 : this.fadeTimer / 1.1));

    const holdable = inv.holdable();
    const slotsKey = JSON.stringify([holdable, inv.held, [...inv.worn], inv.has('duffel-bag')]);
    if (slotsKey !== this.lastSlots) {
      this.lastSlots = slotsKey;
      const bag = inv.has('duffel-bag') ? '<div class="slot gear">Sac de sport</div>' : '';
      this.slots.innerHTML =
        holdable.length === 0
          ? `<div class="slot empty">Mains vides</div>${bag}`
          : holdable
              .map((id, i) => {
                const def = inv.def(id);
                const cls = [inv.held === id ? 'held' : '', inv.worn.has(id) ? 'worn' : ''].join(' ');
                return `<div class="slot ${cls}"><b>${i + 1}</b> ${def.name}${inv.worn.has(id) ? ' <i>porté</i>' : ''}</div>`;
              })
              .join('') + bag;
    }
    this.frame.style.display = this.overlay === 'title' ? 'none' : 'block';
  }

  show(overlay: Overlay, report?: Report): void {
    this.overlay = overlay;
    this.panel.style.display = overlay ? 'flex' : 'none';
    this.panel.classList.toggle('title', overlay === 'title');
    this.cross.style.visibility = overlay ? 'hidden' : 'visible';
    switch (overlay) {
      case null:
        this.panel.innerHTML = '';
        break;
      case 'title':
        this.renderTitle();
        break;
      case 'pause':
        this.renderPause('');
        break;
      case 'notebook':
        this.renderNotebook();
        break;
      case 'shop':
        this.renderShop('');
        break;
      case 'report':
        if (report) this.renderReport(report);
        break;
      case 'win':
        this.renderWin();
        break;
    }
  }

  private handle(action: string): void {
    const w = this.world;
    switch (action) {
      case 'resume':
      case 'close':
        this.show(null);
        this.cb.resume();
        return;
      case 'new':
        this.cb.newGame();
        return;
      case 'continue':
        this.cb.continueGame();
        return;
      case 'save':
        this.cb.save();
        this.renderPause('Partie sauvegardée.');
        return;
      case 'quit':
        this.cb.quit();
        return;
      case 'launder':
        this.renderShop(w.launder());
        return;
      case 'ammo':
        this.renderShop(w.buyAmmo());
        return;
      case 'plates':
        this.renderShop(w.buyPlates());
        return;
      case 'debt':
        this.renderShop(w.payDebt());
        return;
    }
    if (action.startsWith('buy:')) {
      const id = action.slice(4) as ItemId;
      if (this.data.items.has(id)) this.renderShop(w.buy(id));
    }
  }

  private controls(): string {
    return `
      <table class="keys">
        <tr><td>ZQSD / WASD</td><td>se déplacer</td><td>Maj</td><td>courir</td></tr>
        <tr><td>Souris</td><td>regarder</td><td>C / Ctrl</td><td>s’accroupir (moins visible)</td></tr>
        <tr><td>E</td><td>interagir — maintenir pour forcer</td><td>1 à 8, molette</td><td>sortir / ranger un objet</td></tr>
        <tr><td>Clic droit</td><td>braquer son arme (tenir en respect)</td><td>Clic gauche</td><td>tirer, frapper, enfiler</td></tr>
        <tr><td>R</td><td>recharger</td><td>Tab</td><td>carnet de repérage</td></tr>
        <tr><td>Échap</td><td>pause</td><td></td><td></td></tr>
      </table>`;
  }

  private renderTitle(): void {
    this.panel.innerHTML = `
      <div class="title-card">
        <h1>SANS FILET</h1>
        <p class="tag">Une ville. Trois coffres. Quinze mille dollars de dette.</p>
        <p class="sub">Tu n’as rien : pas d’arme, pas d’outil, pas un sou. Repère, prépare, frappe — et rentre avant les sirènes.</p>
        <div class="menu">
          ${this.hasSave ? '<button data-action="continue">Continuer</button>' : ''}
          <button data-action="new" class="${this.hasSave ? 'ghost' : ''}">Nouvelle partie</button>
        </div>
        ${this.controls()}
      </div>`;
  }

  private renderPause(message: string): void {
    this.panel.innerHTML = `
      <div class="card">
        <h2>Pause</h2>
        <div class="menu">
          <button data-action="resume">Reprendre</button>
          <button data-action="save" class="ghost">Sauvegarder</button>
          <button data-action="quit" class="ghost">Sauvegarder et quitter</button>
        </div>
        ${message ? `<p class="msg">${message}</p>` : ''}
        <div class="options">
          <label>Volume <input type="range" name="volume" min="0" max="1" step="0.05" value="${this.volume}"></label>
          <label>Sensibilité <input type="range" name="sensitivity" min="0.3" max="2.5" step="0.05" value="${this.sensitivity}"></label>
        </div>
        ${this.controls()}
      </div>`;
  }

  private renderShop(message: string): void {
    const w = this.world;
    const inv = w.inventory;
    const rules = this.data.rules;
    const rows = [...this.data.items.values()]
      .map((d) => {
        const owned = inv.has(d.id);
        const locked = !owned && !inv.unlocked(d.id);
        const afford = inv.cash >= d.price;
        let action = `<button data-action="buy:${d.id}" ${afford ? '' : 'disabled'}>Acheter</button>`;
        if (owned) action = '<i>possédé</i>';
        else if (locked) action = `<i class="locked">après ${money(d.unlock)} blanchis</i>`;
        return `<tr class="${owned ? 'owned' : ''}${locked ? ' lockedrow' : ''}">
          <td><b>${locked ? '???' : d.name}</b><br><small>${locked ? '« Reviens quand tu auras fait tes preuves. »' : d.description}</small></td>
          <td class="price">${locked ? '' : money(d.price)}</td>
          <td>${action}</td>
        </tr>`;
      })
      .join('');
    const fee = Math.round(rules.launderFee * 100);
    const extras = `
      <tr><td><b>Chargeur de ${rules.magazine} balles</b><br><small>Réserve : ${inv.ammo} balles.</small></td><td class="price">${money(rules.ammoPrice)}</td>
        <td><button data-action="ammo" ${inv.has('pistol') && inv.cash >= rules.ammoPrice ? '' : 'disabled'}>Acheter</button></td></tr>
      <tr><td><b>Plaques de rechange</b><br><small>Blindage : ${Math.round(inv.armor)} / ${rules.armorPoints}.</small></td><td class="price">${money(rules.platePrice)}</td>
        <td><button data-action="plates" ${inv.has('plate-carrier') && inv.armor < rules.armorPoints && inv.cash >= rules.platePrice ? '' : 'disabled'}>Acheter</button></td></tr>`;
    this.panel.innerHTML = `
      <div class="card wide shop-card">
        <h2>Le Fourgue</h2>
        <p class="sub">« Ici, c’est cash, et propre. Le sale, je te le lave — contre ma part. Et n’oublie pas ce que tu me dois. »</p>
        <div class="wallet">
          <div>Argent propre <b>${money(inv.cash)}</b></div>
          <div>Argent sale <b>${money(inv.dirty)}</b></div>
          <div>Déjà blanchi <b>${money(inv.laundered)}</b></div>
          <div>Dette <b class="ko">${money(w.debtLeft)}</b></div>
        </div>
        <div class="shop-actions">
          <button data-action="launder" ${inv.dirty > 0 ? '' : 'disabled'}>Blanchir ${money(inv.dirty)} (−${fee} %)</button>
          <button data-action="debt" class="ghost" ${inv.cash > 0 && w.debtLeft > 0 ? '' : 'disabled'}>Rembourser la dette</button>
        </div>
        ${message ? `<p class="msg">${message}</p>` : ''}
        <table class="shop">${rows}${extras}</table>
        <button data-action="close">Partir</button>
      </div>`;
  }

  private renderNotebook(): void {
    const entries = this.world.notebook.entries();
    const groups = ['town', 'store', 'jewelry', 'bank']
      .map((site) => {
        const all = this.data.level.intel.filter((i) => i.site === site);
        const known = entries.filter((e) => e.site === site);
        const items = known.length
          ? known.map((e) => `<li><span class="dot" style="background:${MARKER_COLORS[e.marker]}"></span>${e.text}</li>`).join('')
          : '<li class="empty">Rien encore. Va voir sur place, regarde attentivement, observe les habitudes.</li>';
        return `<section><h3>${SITE_NAMES[site] ?? site} <small>${known.length} / ${all.length}</small></h3><ul>${items}</ul></section>`;
      })
      .join('');
    this.panel.innerHTML = `
      <div class="card wide notebook">
        <h2>Carnet de repérage</h2>
        <canvas width="1120" height="230"></canvas>
        <div class="nb-cols">${groups}</div>
        <button data-action="close">Fermer (Tab)</button>
      </div>`;
    const canvas = this.panel.querySelector('canvas');
    if (canvas) this.drawPlan(canvas, entries);
  }

  /** Plan vu de dessus : on connaît la rue, mais seuls les éléments repérés y figurent. */
  private drawPlan(canvas: HTMLCanvasElement, entries: readonly IntelDef[]): void {
    const g = canvas.getContext('2d');
    if (!g) return;
    const b = this.data.level.bounds;
    const sx = canvas.width / (b.max[0] - b.min[0]);
    const sz = canvas.height / (b.max[1] - b.min[1]);
    const px = (x: number) => (x - b.min[0]) * sx;
    const pz = (z: number) => (z - b.min[1]) * sz;
    g.fillStyle = '#e9e2cc';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#d6cdb0';
    g.fillRect(0, pz(-4), canvas.width, pz(6) - pz(-4));
    g.fillStyle = '#c8bea0';
    g.fillRect(0, pz(-2.4), canvas.width, pz(4.2) - pz(-2.4));
    for (const w of this.data.level.walls) {
      if (w.owner.startsWith('prop:')) {
        g.fillStyle = 'rgba(90,80,60,0.25)';
      } else g.fillStyle = w.glass ? '#7aa0b0' : '#5b5446';
      g.fillRect(px(w.rect.min[0]), pz(w.rect.min[1]), Math.max(1.5, (w.rect.max[0] - w.rect.min[0]) * sx), Math.max(1.5, (w.rect.max[1] - w.rect.min[1]) * sz));
    }
    g.fillStyle = '#a0603a';
    for (const d of this.data.level.doors) g.fillRect(px(d.rect.min[0]), pz(d.rect.min[1]), Math.max(2, (d.rect.max[0] - d.rect.min[0]) * sx), Math.max(2, (d.rect.max[1] - d.rect.min[1]) * sz));
    g.font = 'bold 12px Georgia, serif';
    g.fillStyle = '#3d3628';
    g.textAlign = 'center';
    const label = (t: string, x: number, z: number) => g.fillText(t, px(x), pz(z));
    label('PLANQUE', -45, -6.5);
    label('SUPÉRETTE', -14, -6.5);
    label('BIJOUTERIE', 16, -12);
    label('BANQUE', 50, -6.6);
    label('RUE DES ORFÈVRES', 0, 1.7);
    label('RUELLE', -10, -16.3);
    if (this.world.notebook.has('fence')) label('LE FOURGUE', -30, -15.5);
    for (const e of entries) {
      g.fillStyle = MARKER_COLORS[e.marker];
      g.strokeStyle = '#2a2418';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(px(e.pos[0]), pz(e.pos[1]), 5.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    const p = this.world.player;
    g.save();
    g.translate(px(p.pos.x), pz(p.pos.z));
    g.rotate(p.facing);
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.moveTo(10, 0);
    g.lineTo(-6, -6);
    g.lineTo(-6, 6);
    g.closePath();
    g.fill();
    g.restore();
  }

  private renderReport(r: Report): void {
    const calls = r.calls.length ? r.calls.map((c) => `<li>${c}</li>`).join('') : '<li>Personne n’a appelé la police.</li>';
    const lost = r.lost.map((id) => this.data.items.get(id)?.name ?? id).join(', ');
    const title = r.success ? 'Coup réussi' : r.cause === 'shot' ? 'Abattu' : 'Arrêté';
    const site = r.site ? (SITE_NAMES[r.site] ?? r.site) : 'Dans la rue';
    const body = r.success
      ? `<p>Butin : <b>${money(r.loot)}</b> d’argent sale. Le Fourgue peut le blanchir.</p>`
      : r.cause === 'shot'
        ? `<p>Tu te réveilles à l’hôpital, menotté au lit. Les frais ont mangé une partie de tes économies.${lost ? `<br>Confisqué : ${lost}.` : ''}</p>`
        : `<p>Garde à vue. Tu ressors au petit matin, les poches vides.${lost ? `<br>Confisqué : ${lost}.` : ''}</p>`;
    this.panel.innerHTML = `
      <div class="card report">
        <p class="kicker">${site}</p>
        <h2 class="${r.success ? 'ok' : 'ko'}">${title}</h2>
        ${body}
        <div class="facts">
          <div><small>Durée</small><b>${formatDuration(r.duration)}</b></div>
          <div><small>Police</small><b>${r.policeCame ? 'sur place' : 'absente'}</b></div>
          <div><small>Visage</small><b class="${r.identified ? 'ko' : 'ok'}">${r.identified ? 'reconnu' : 'inconnu'}</b></div>
          <div><small>Victimes</small><b class="${r.victims ? 'ko' : ''}">${r.victims}</b></div>
        </div>
        <h3>Ce qui s’est passé</h3>
        <ul>${calls}</ul>
        <button data-action="close">Continuer</button>
      </div>`;
  }

  private renderWin(): void {
    const s = this.world.stats;
    this.panel.innerHTML = `
      <div class="card report">
        <p class="kicker">Jour ${this.world.clock.day}</p>
        <h2 class="ok">Libre</h2>
        <p>Le Fourgue compte les billets, deux fois. Puis il te tend la main. « On est quittes. »</p>
        <p>Tu étais parti de rien. Tu repars sans dette — et le quartier se souviendra longtemps de ton nom.</p>
        <div class="facts">
          <div><small>Coups réussis</small><b>${s.heists}</b></div>
          <div><small>Total volé</small><b>${money(s.stolen)}</b></div>
          <div><small>Arrestations</small><b>${s.arrests}</b></div>
          <div><small>Victimes</small><b class="${s.victims ? 'ko' : 'ok'}">${s.victims}</b></div>
        </div>
        <p class="sub">${s.victims === 0 ? 'Sans une goutte de sang. Du travail d’orfèvre.' : 'Le prix a été lourd. Pour d’autres que toi.'}</p>
        <div class="menu"><button data-action="close">Continuer à jouer</button><button data-action="quit" class="ghost">Menu principal</button></div>
      </div>`;
  }
}
