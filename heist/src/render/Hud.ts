import type { GameData, IntelDef } from '../data/types';
import type { Report, World } from '../systems/World';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

export type Overlay = 'start' | 'pause' | 'notebook' | 'shop' | 'report' | null;

const MARKER_COLORS: Record<IntelDef['marker'], string> = {
  camera: '#ff5a5a',
  cash: '#f2c94c',
  safe: '#f2994a',
  power: '#56ccf2',
  door: '#bb86fc',
  person: '#6fcf97',
  info: '#e0e0e0',
};

function formatDuration(gameSeconds: number): string {
  const m = Math.round(gameSeconds / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

/** Interface en surimpression (DOM) : heure, argent, invite d'action, inventaire, carnet, marché noir. */
export class Hud {
  overlay: Overlay = 'start';
  private readonly clock: HTMLElement;
  private readonly money: HTMLElement;
  private readonly heat: HTMLElement;
  private readonly alert: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly progress: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly lookRing: HTMLElement;
  private readonly slots: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly crosshair: HTMLElement;
  private lastSlots = '';

  /** Rappelé quand le joueur ferme un menu et veut reprendre. */
  onResume: () => void = () => {};

  constructor(
    root: HTMLElement,
    private readonly data: GameData,
    private readonly world: World,
  ) {
    const top = el('div', 'hud-top', root);
    this.clock = el('div', 'hud-clock', top);
    this.money = el('div', 'hud-money', top);
    this.heat = el('div', 'hud-heat', root);
    this.alert = el('div', 'hud-alert', root);
    this.crosshair = el('div', 'hud-cross', root);
    this.lookRing = el('div', 'hud-look', root);
    this.prompt = el('div', 'hud-prompt', root);
    this.progress = el('div', 'hud-progress', root);
    this.progressFill = el('div', 'hud-progress-fill', this.progress);
    this.slots = el('div', 'hud-slots', root);
    this.toasts = el('div', 'hud-toasts', root);
    this.panel = el('div', 'hud-panel', root);
    this.panel.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const action = t.closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action) this.handle(action);
    });
    this.show('start');
  }

  toast(text: string, kind: 'info' | 'intel' | 'danger' = 'info'): void {
    const t = el('div', `toast toast-${kind}`, this.toasts, '');
    t.textContent = text;
    while (this.toasts.childElementCount > 5) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.classList.add('fade'), 4500);
    setTimeout(() => t.remove(), 5500);
  }

  update(): void {
    const w = this.world;
    const inv = w.inventory;
    this.clock.textContent = w.clock.format();
    this.money.innerHTML = `<span class="clean">${inv.cash} $</span>` + (inv.dirty > 0 ? ` <span class="dirty">+ ${inv.dirty} $ sale</span>` : '');
    const heat = Math.min(100, Math.round(w.heat));
    this.heat.innerHTML = `Chaleur <span class="bar"><span style="width:${heat}%"></span></span>${w.wanted ? ' <b>RECHERCHÉ</b>' : ''}`;

    // Alerte : on n'affiche que ce que le joueur peut percevoir. L'alerte silencieuse reste cachée.
    let alert = '';
    const police = w.police;
    if (police.state === 'searching') alert = 'POLICE SUR PLACE';
    else if (police.state === 'en-route' && (police.loud || police.timer < 10)) alert = police.loud ? 'ALARME — LA POLICE ARRIVE' : 'Des sirènes approchent…';
    else if (w.clerkWitness.callTimer !== null || w.pedestrianWitness.callTimer !== null) alert = 'Quelqu’un compose un numéro…';
    else if (Math.max(w.clerkWitness.suspicion, w.pedestrianWitness.suspicion) > 0.25) alert = 'On te regarde de travers';
    this.alert.textContent = alert;
    this.alert.className = `hud-alert ${alert ? 'on' : ''} ${police.state !== 'idle' && alert ? 'danger' : ''}`;

    this.prompt.textContent = this.overlay ? '' : (w.prompt ?? '');
    const action = w.action;
    this.progress.style.display = action ? 'block' : 'none';
    if (action) this.progressFill.style.width = `${Math.min(100, (action.progress / action.total) * 100)}%`;
    const look = w.notebook.progress();
    this.lookRing.style.display = look > 0 ? 'block' : 'none';
    this.lookRing.style.background = `conic-gradient(#e8e0c8 ${look * 360}deg, transparent 0)`;
    this.crosshair.classList.toggle('threat', w.threatening);

    const slotsKey = JSON.stringify([inv.items, inv.held, [...inv.worn]]);
    if (slotsKey !== this.lastSlots) {
      this.lastSlots = slotsKey;
      this.slots.innerHTML =
        inv.items.length === 0
          ? '<div class="slot empty">Mains vides</div>'
          : inv.items
              .map((id, i) => {
                const def = inv.def(id);
                const cls = [inv.held === id ? 'held' : '', inv.worn.has(id) ? 'worn' : ''].join(' ');
                return `<div class="slot ${cls}"><b>${i + 1}</b> ${def.name}${inv.worn.has(id) ? ' <i>(porté)</i>' : ''}</div>`;
              })
              .join('');
    }
  }

  show(overlay: Overlay, report?: Report): void {
    this.overlay = overlay;
    this.panel.style.display = overlay ? 'flex' : 'none';
    this.crosshair.style.display = overlay ? 'none' : 'block';
    switch (overlay) {
      case null:
        this.panel.innerHTML = '';
        break;
      case 'start':
        this.panel.innerHTML = `
          <div class="card">
            <h1>SANS FILET</h1>
            <p class="sub">Tu n'as rien. Pas d'arme, pas d'équipe, pas un sou. Juste une dette.</p>
            <p>Fouille ta planque. Repère la supérette d'en face. Note ce que tu vois. Trouve ou achète ton matériel.
            Choisis ton heure. Puis frappe, et rentre avant que la police n'arrive.</p>
            <table class="keys">
              <tr><td>ZQSD / WASD</td><td>se déplacer</td><td>Maj</td><td>courir</td></tr>
              <tr><td>Souris</td><td>regarder</td><td>C / Ctrl</td><td>s'accroupir</td></tr>
              <tr><td>E</td><td>interagir (maintenir pour forcer)</td><td>1 à 5</td><td>sortir / ranger un objet</td></tr>
              <tr><td>Clic gauche</td><td>menacer, enfiler</td><td>Tab</td><td>carnet de repérage</td></tr>
            </table>
            <button data-action="resume">Cliquer pour jouer</button>
          </div>`;
        break;
      case 'pause':
        this.panel.innerHTML = `<div class="card"><h2>Pause</h2><button data-action="resume">Reprendre</button></div>`;
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
    }
  }

  private handle(action: string): void {
    if (action === 'resume' || action === 'close') {
      this.show(null);
      this.onResume();
    } else if (action === 'launder') {
      this.renderShop(this.world.launder());
    } else if (action.startsWith('buy:')) {
      const id = action.slice(4);
      const def = [...this.data.items.values()].find((d) => d.id === id);
      if (def) this.renderShop(this.world.buy(def.id));
    }
  }

  private renderShop(message: string): void {
    const inv = this.world.inventory;
    const rows = [...this.data.items.values()]
      .map((d) => {
        const owned = inv.has(d.id);
        const afford = inv.cash >= d.price;
        return `<tr class="${owned ? 'owned' : ''}">
          <td><b>${d.name}</b><br><small>${d.description}</small></td>
          <td class="price">${d.price} $</td>
          <td>${owned ? '<i>possédé</i>' : `<button data-action="buy:${d.id}" ${afford ? '' : 'disabled'}>Acheter</button>`}</td>
        </tr>`;
      })
      .join('');
    const fee = Math.round(this.data.rules.launderFee * 100);
    this.panel.innerHTML = `
      <div class="card wide">
        <h2>Le Fourgue</h2>
        <p class="sub">« T'as l'air fauché. Ici, c'est cash et propre. Le sale, je te le lave, contre ma part. »</p>
        <p>Argent propre : <b>${inv.cash} $</b> · argent sale : <b>${inv.dirty} $</b></p>
        <table class="shop">${rows}</table>
        <p><button data-action="launder" ${inv.dirty > 0 ? '' : 'disabled'}>Blanchir l'argent sale (commission ${fee} %)</button></p>
        ${message ? `<p class="msg">${message}</p>` : ''}
        <button data-action="close">Partir</button>
      </div>`;
  }

  private renderNotebook(): void {
    const entries = this.world.notebook.entries();
    const list = entries.length
      ? entries.map((e) => `<li><span class="dot" style="background:${MARKER_COLORS[e.marker]}"></span>${e.text}</li>`).join('')
      : '<li class="empty">Rien encore. Va voir sur place, regarde attentivement.</li>';
    const total = this.data.level.intel.length;
    this.panel.innerHTML = `
      <div class="card wide notebook">
        <h2>Carnet de repérage <small>${entries.length} / ${total}</small></h2>
        <div class="nb-body">
          <canvas width="600" height="300"></canvas>
          <ul>${list}</ul>
        </div>
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
    g.fillStyle = '#cfc6aa';
    g.fillRect(0, pz(-4), canvas.width, pz(6) - pz(-4));
    g.fillStyle = '#5b5446';
    for (const w of this.data.level.walls) {
      if (!w.blocksSight) continue;
      g.fillRect(px(w.rect.min[0]), pz(w.rect.min[1]), Math.max(2, (w.rect.max[0] - w.rect.min[0]) * sx), Math.max(2, (w.rect.max[1] - w.rect.min[1]) * sz));
    }
    g.font = '11px sans-serif';
    g.fillStyle = '#3d3628';
    g.fillText('PLANQUE', px(-17.5), pz(-9));
    g.fillText('SUPÉRETTE', px(5.5), pz(-9.5));
    g.fillText('RUE', px(-2), pz(1.5));
    g.fillText('RUELLE', px(-2), pz(-16));
    for (const e of entries) {
      g.fillStyle = MARKER_COLORS[e.marker];
      g.strokeStyle = '#2a2418';
      g.beginPath();
      g.arc(px(e.pos[0]), pz(e.pos[1]), 6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    const p = this.world.player;
    g.save();
    g.translate(px(p.pos.x), pz(p.pos.z));
    g.rotate(p.facing);
    g.fillStyle = '#c0392b';
    g.beginPath();
    g.moveTo(9, 0);
    g.lineTo(-6, -5);
    g.lineTo(-6, 5);
    g.closePath();
    g.fill();
    g.restore();
  }

  private renderReport(r: Report): void {
    const calls = r.calls.length ? r.calls.map((c) => `<li>${c}</li>`).join('') : '<li>Personne n’a appelé la police.</li>';
    const lost = r.lost.map((id) => this.data.items.get(id)?.name ?? id).join(', ');
    this.panel.innerHTML = `
      <div class="card">
        <h2 class="${r.success ? 'ok' : 'ko'}">${r.success ? 'Coup réussi' : 'Arrêté'}</h2>
        ${r.success
          ? `<p>Butin : <b>${r.loot} $</b> d'argent sale. Le Fourgue peut le blanchir.</p>`
          : `<p>Garde à vue. Tu ressors au petit matin, les poches vides.${lost ? `<br>Confisqué : ${lost}.` : ''}</p>`}
        <p>Durée : ${formatDuration(r.duration)} · Police sur place : ${r.policeCame ? 'oui' : 'non'}</p>
        <p>${r.identified ? '<b class="ko">Ton visage a été vu.</b> On te reconnaîtra.' : 'Personne n’a vu ton visage.'}</p>
        <h3>Ce qui s'est passé</h3>
        <ul>${calls}</ul>
        <button data-action="close">Continuer</button>
      </div>`;
  }
}
