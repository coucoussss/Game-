// Interface de combat : barres de vie (avec traînée de dégâts), d'énergie et de garde, minuteur,
// manches gagnées, compteur de combo et annonces (« MANCHE 1 », « K.O. »…).
import { MAX_ENERGY } from '../game/constants.js';
import { SLOTS } from '../game/characters.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Hud {
  constructor(root) {
    this.root = document.createElement('div');
    this.root.className = 'hud hidden';
    root.appendChild(this.root);
    this.panels = [];
    this.announceEl = null;
    this.teamNames = ['ÉQUIPE BLEUE', 'ÉQUIPE ROUGE'];
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }

  teamName(team) {
    return this.teamNames[team] || '';
  }

  /** fighters : [{ id, name, team, color, label }] */
  setup(fighters, opts = {}) {
    this.training = !!opts.training;
    this.waves = !!opts.waves;
    this.panels = [];
    const sides = [fighters.filter((f) => f.team === 0), fighters.filter((f) => f.team === 1)];
    this.teamNames = sides.map((list) => (list.length === 1 ? list[0].name.split(' ')[0].toUpperCase() : list === sides[0] ? 'ÉQUIPE BLEUE' : 'ÉQUIPE ROUGE'));
    const side = (list, cls) => `<div class="side ${cls}">${list.map((f, i) => `
      <div class="panel ${i > 0 ? 'small' : ''} ${f.boss ? 'boss' : ''}" data-id="${f.id}" style="--c:${f.color}">
        <div class="pname"><span class="tag">${esc(f.label || '')}</span>${esc(f.name)}</div>
        <div class="hp"><div class="hp-lag"></div><div class="hp-fill"></div></div>
        <div class="row2"><div class="energy"><div class="en-fill"></div><div class="en-mark" style="left:40%"></div></div><div class="en-num">0</div></div>
        <div class="guard"><div class="guard-fill"></div></div>
        <div class="combo"></div>
        <div class="movename"></div>
      </div>`).join('')}</div>`;
    this.root.innerHTML = `
      <div class="topbar">
        ${side(sides[0], 'left')}
        <div class="center ${this.waves ? 'waves' : ''}">
          <div class="pips left"></div>
          ${this.waves ? '<div class="wave-label">VAGUE</div>' : ''}
          <div class="timer">${this.training ? '∞' : '99'}</div>
          <div class="pips right"></div>
          <div class="ping"></div>
        </div>
        ${side(sides[1], 'right')}
      </div>
      <div class="attack-bars"></div>
      <div class="announce"></div>
      ${this.training ? '<div class="training-info"></div>' : ''}`;
    for (const f of fighters) {
      const el = this.root.querySelector(`.panel[data-id="${f.id}"]`);
      this.panels[f.id] = {
        el,
        fill: el.querySelector('.hp-fill'),
        lag: el.querySelector('.hp-lag'),
        en: el.querySelector('.en-fill'),
        enNum: el.querySelector('.en-num'),
        guard: el.querySelector('.guard-fill'),
        combo: el.querySelector('.combo'),
        move: el.querySelector('.movename'),
        lagV: 1,
        comboT: 0,
        moveT: 0,
        mark: el.querySelector('.en-mark'),
      };
    }
    this.timerEl = this.root.querySelector('.timer');
    this.pipsL = this.root.querySelector('.pips.left');
    this.pipsR = this.root.querySelector('.pips.right');
    this.pingEl = this.root.querySelector('.ping');
    this.announceEl = this.root.querySelector('.announce');
    this.trainingEl = this.root.querySelector('.training-info');
    this.lastWins = '';
  }

  update(dt, state, extra = {}) {
    for (const f of state.fighters) {
      const p = this.panels[f.id];
      if (!p) continue;
      const hp = Math.max(0, f.hp / f.maxHp);
      p.fill.style.width = `${hp * 100}%`;
      p.fill.classList.toggle('low', hp < 0.25);
      if (hp < p.lagV) p.lagV = Math.max(hp, p.lagV - dt * (p.lagHold > 0 ? 0 : 0.45));
      else p.lagV = hp;
      if (p.lastHp !== undefined && hp < p.lastHp) p.lagHold = 0.6;
      p.lagHold = (p.lagHold || 0) - dt;
      p.lastHp = hp;
      p.lag.style.width = `${p.lagV * 100}%`;
      const en = f.energy / MAX_ENERGY;
      p.en.style.width = `${en * 100}%`;
      p.en.classList.toggle('full', en >= 1);
      p.enNum.textContent = en >= 1 ? 'ULTIME !' : Math.floor(f.energy);
      if (extra.specialCost) p.mark.style.left = `${extra.specialCost[f.id] || 40}%`;
      p.guard.style.width = `${f.guardHp}%`;
      p.el.classList.toggle('ko', f.state === 'ko');
      p.el.classList.toggle('trans', !!f.transformed);
      if (p.comboT > 0) { p.comboT -= dt; if (p.comboT <= 0) p.combo.classList.remove('on'); }
      if (p.moveT > 0) { p.moveT -= dt; if (p.moveT <= 0) p.move.classList.remove('on'); }
    }
    const wv = state.waveInfo;
    if (wv) this.timerEl.textContent = `${wv.n}/${wv.total}`;
    else if (!this.training) this.timerEl.textContent = Math.ceil(state.timer ?? 99);
    this.timerEl.classList.toggle('urgent', !this.training && !wv && (state.timer ?? 99) <= 10);
    const wins = (state.wins || [0, 0]).join('-');
    if (wins !== this.lastWins && !this.waves) {
      this.lastWins = wins;
      const pip = (n) => [0, 1].map((i) => `<span class="pip ${i < n ? 'won' : ''}"></span>`).join('');
      this.pipsL.innerHTML = pip(state.wins ? state.wins[0] : 0);
      this.pipsR.innerHTML = pip(state.wins ? state.wins[1] : 0);
    }
    this.updateBars(state);
    this.pingEl.textContent = extra.ping != null ? `${extra.ping} ms` : '';
    if (this.trainingEl && extra.trainingText != null) this.trainingEl.innerHTML = extra.trainingText;
  }

  /**
   * Barre des attaques en bas de l'écran, une par joueur local :
   * bars = [{ id, def, side: 'mid' | 'left' | 'right' }]. Les touches arrivent par setBarLabels.
   */
  setupBars(bars) {
    const wrap = this.root.querySelector('.attack-bars');
    this.bars = bars.map((b) => {
      const el = document.createElement('div');
      el.className = `abar ${b.side}`;
      el.style.setProperty('--c', b.def.aura);
      el.innerHTML = SLOTS.map(([slot, label]) => `<div class="aslot" data-slot="${slot}">
          <div class="acd"></div><span class="akey"></span><span class="aname">${label}</span><span class="amove"></span><span class="atime"></span>
        </div>`).join('');
      wrap.appendChild(el);
      const slots = {};
      for (const [slot] of SLOTS) {
        const s = el.querySelector(`[data-slot="${slot}"]`);
        slots[slot] = { el: s, cd: s.querySelector('.acd'), key: s.querySelector('.akey'), move: s.querySelector('.amove'), time: s.querySelector('.atime') };
      }
      return { ...b, el, slots, trans: null };
    });
  }

  setBarLabels(index, labels) {
    const bar = this.bars && this.bars[index];
    if (!bar) return;
    for (const [slot] of SLOTS) if (bar.slots[slot].key.textContent !== labels[slot]) bar.slots[slot].key.textContent = labels[slot];
  }

  updateBars(state) {
    for (const bar of this.bars || []) {
      const f = state.fighters[bar.id];
      if (!f || !f.cd) continue;
      const tr = !!f.transformed;
      if (bar.trans !== tr) {
        // Noms des coups (le spécial du guerrier change une fois transformé)
        bar.trans = tr;
        for (const [slot, , ref] of SLOTS) {
          let mv = bar.def.moves[ref];
          if (mv.alt && tr) mv = bar.def.moves[mv.alt];
          bar.slots[slot].move.textContent = slot === 'light' ? 'Enchaînement' : mv.name;
          bar.slots[slot].cost = mv.cost || 0;
        }
      }
      for (const [slot] of SLOTS) {
        const s = bar.slots[slot];
        const cd = f.cd[slot] || 0;
        const frac = cd > 0 ? Math.min(1, cd / (f.cdMax[slot] || 1)) : 0;
        s.cd.style.transform = `scaleY(${frac})`;
        s.time.textContent = cd > 0 ? cd.toFixed(1) : '';
        s.el.classList.toggle('cooling', cd > 0);
        s.el.classList.toggle('noen', (s.cost || 0) > f.energy);
      }
    }
  }

  combo(id, n) {
    const p = this.panels[id];
    if (!p) return;
    p.combo.innerHTML = `<b>${n}</b> COUPS`;
    p.combo.classList.remove('on');
    void p.combo.offsetWidth;
    p.combo.classList.add('on');
    p.comboT = 1.4;
  }

  moveName(id, text) {
    const p = this.panels[id];
    if (!p) return;
    p.move.textContent = text;
    p.move.classList.remove('on');
    void p.move.offsetWidth;
    p.move.classList.add('on');
    p.moveT = 1.6;
  }

  announce(text, opts = {}) {
    const el = document.createElement('div');
    el.className = `ann ${opts.big ? 'big' : ''}`;
    el.textContent = text;
    if (opts.color) el.style.color = opts.color;
    el.style.animationDuration = `${opts.dur || 1.5}s`;
    this.announceEl.innerHTML = '';
    this.announceEl.appendChild(el);
    setTimeout(() => el.remove(), (opts.dur || 1.5) * 1000);
  }
}
