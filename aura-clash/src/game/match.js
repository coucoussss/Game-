// Simulation d'un match : combattants, projectiles, zones, invocations, manches et KO.
// Pure logique (aucun Three.js) : c'est elle que l'hôte fait tourner en réseau local,
// et que les invités reçoivent sous forme d'instantanés (snapshot).
import { Fighter } from './fighter.js';
import { CHAR_BY_ID } from './characters.js';
import {
  HIT_TYPES, MAX_ENERGY, NO_INPUT, ROUNDS_TO_WIN, FIGHTER_RADIUS, FIGHTER_HEIGHT,
} from './constants.js';

const DEG = Math.PI / 180;

export class Match {
  /**
   * @param {object} cfg
   *   fighters : [{ charId, team }] (1v1 : 2 entrées, 2v2 : 4)
   *   arenaRadius, roundTime (s), training (bool)
   *   waves : mode Vagues — liste des vagues [[{ charId, mods }]] ; `fighters` contient alors les
   *           joueurs et la première vague. Une seule manche, sans minuteur.
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.training = !!cfg.training;
    this.arenaRadius = cfg.arenaRadius || 18;
    this.roundTime = cfg.roundTime || 99;
    this.fighters = cfg.fighters.map((f, i) => {
      const slot = cfg.fighters.slice(0, i).filter((o) => o.team === f.team).length;
      return new Fighter(i, CHAR_BY_ID[f.charId], f.team, slot, f.mods);
    });
    this.entities = [];
    this.events = [];
    this.nextEnt = 1;
    this.time = 0;
    this.round = 0;
    this.wins = [0, 0];
    this.timer = this.roundTime;
    this.timeScale = 1;
    this.hitstop = 0;
    this.cine = null;
    this.phase = 'intro';
    this.phaseT = 0;
    this.winner = -1;
    this.infiniteEnergy = false;
    this.waveList = cfg.waves || null;
    this.wave = 0; // indice de la vague en cours
    this.waveBreak = 0; // pause entre deux vagues (s)
    this.startRound();
  }

  /** Mode Vagues : { n, total, boss } de la vague en cours (null sinon). */
  get waveInfo() {
    if (!this.waveList) return null;
    return { n: this.wave + 1, total: this.waveList.length, boss: this.waveList[this.wave].some((e) => e.boss) };
  }

  /** Points d'apparition des ennemis : en arc de cercle face au joueur, vers le centre de l'arène. */
  spawnPoints(count) {
    const p = this.fighters.find((f) => f.team === 0 && f.alive) || this.fighters[0];
    const base = Math.hypot(p.x, p.z) > 1 ? Math.atan2(-p.x, -p.z) : Math.PI / 2;
    const pts = [];
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * 0.75;
      const [x, z] = this.clampToArena(p.x + Math.sin(a) * 6.5, p.z + Math.cos(a) * 6.5, 1.5);
      pts.push({ x, z, yaw: Math.atan2(p.x - x, p.z - z) });
    }
    return pts;
  }

  /** Fait entrer la vague suivante (les vaincus de la précédente disparaissent). */
  spawnWave() {
    this.wave += 1;
    const list = this.waveList[this.wave];
    for (const f of this.fighters) if (f.team === 1) f.gone = true;
    const pts = this.spawnPoints(list.length);
    const ids = [];
    list.forEach((e, k) => {
      const slot = this.fighters.filter((o) => o.team === 1 && !o.gone).length;
      const f = new Fighter(this.fighters.length, CHAR_BY_ID[e.charId], 1, slot, e.mods);
      f.reset(pts[k].x, pts[k].z, pts[k].yaw);
      f.invuln = 1.0; // le temps d'apparaître
      this.fighters.push(f);
      ids.push(f.id);
      this.emit('fx', { fx: 'summonBurst', x: f.x, y: 1, z: f.z, color: f.def.aura });
    });
    // Répit : les joueurs récupèrent un peu de vie, d'énergie et leurs temps de recharge
    for (const f of this.fighters) {
      if (f.team !== 0 || !f.alive) continue;
      f.hp = Math.min(f.maxHp, f.hp + f.maxHp * (this.cfg.waveHeal || 0));
      f.energy = Math.min(MAX_ENERGY, f.energy + 25);
      for (const k in f.cd) f.cd[k] = 0;
    }
    this.emit('waveSpawn', { ...this.waveInfo, ids });
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  get canAct() {
    return this.phase === 'fight';
  }

  fighter(id) {
    return this.fighters[id];
  }

  /** Cible : l'adversaire vivant le plus proche. */
  targetFor(f) {
    let best = null;
    let bd = Infinity;
    for (const o of this.fighters) {
      if (o.team === f.team || !o.alive) continue;
      const d = (o.x - f.x) ** 2 + (o.z - f.z) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) {
      // Plus d'adversaire vivant : on garde le regard sur le plus proche (pose de victoire)
      for (const o of this.fighters) {
        if (o.team === f.team) continue;
        const d = (o.x - f.x) ** 2 + (o.z - f.z) ** 2;
        if (d < bd) { bd = d; best = o; }
      }
    }
    return best;
  }

  enemiesOf(team) {
    return this.fighters.filter((f) => f.team !== team && f.alive);
  }

  clampToArena(x, z, margin = 0.5) {
    const R = this.arenaRadius - margin;
    const d = Math.hypot(x, z);
    if (d > R) return [(x / d) * R, (z / d) * R];
    return [x, z];
  }

  // --- Manches ------------------------------------------------------------------------

  startRound() {
    this.round += 1;
    this.timer = this.roundTime;
    this.entities = [];
    this.timeScale = 1;
    this.cine = null;
    this.hitstop = 0;
    const perTeam = [0, 0];
    for (const f of this.fighters) {
      const n = this.fighters.filter((o) => o.team === f.team).length;
      const side = f.team === 0 ? -1 : 1;
      const z = n > 1 ? (f.slot === 0 ? -2.6 : 2.6) : 0;
      const energy = f.energy;
      f.reset(side * 5.5, z, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      f.energy = this.round === 1 ? 0 : energy;
      perTeam[f.team] += 1;
    }
    if (this.waveList) {
      // Mode Vagues : la première vague se déploie en arc face aux joueurs
      const foes = this.fighters.filter((f) => f.team === 1);
      this.spawnPoints(foes.length).forEach((p, k) => foes[k].reset(p.x, p.z, p.yaw));
    }
    if (this.training) {
      this.phase = 'fight';
      this.phaseT = 0;
      return;
    }
    this.phase = 'intro';
    this.phaseT = 0;
    this.emit('round', { n: this.round, wave: this.waveInfo });
  }

  teamAlive(team) {
    return this.fighters.some((f) => f.team === team && f.alive);
  }

  teamHpRatio(team) {
    const fs = this.fighters.filter((f) => f.team === team);
    return fs.reduce((s, f) => s + f.hp / f.maxHp, 0) / fs.length;
  }

  updatePhase(dt) {
    this.phaseT += dt;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT >= 1.4 && !this.introFight) {
          this.introFight = true;
          this.emit('fight');
        }
        if (this.phaseT >= 2.0) { this.phase = 'fight'; this.phaseT = 0; this.introFight = false; }
        break;
      case 'fight': {
        if (this.training) break;
        const a0 = this.teamAlive(0);
        const a1 = this.teamAlive(1);
        if (this.waveList && a0 && !a1 && this.wave + 1 < this.waveList.length) {
          // Vague repoussée : courte pause, puis la suivante surgit
          if (this.waveBreak <= 0) { this.waveBreak = 2.4; this.emit('waveClear', this.waveInfo); }
          this.waveBreak -= dt;
          if (this.waveBreak <= 0) { this.waveBreak = 0; this.spawnWave(); }
          break;
        }
        if (!a0 || !a1) {
          this.phase = 'ko';
          this.phaseT = 0;
          this.timeScale = 0.25;
          this.roundWinner = a0 ? 0 : a1 ? 1 : -1;
          break;
        }
        if (!this.waveList) this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = 0;
          this.phase = 'timeup';
          this.phaseT = 0;
          const h0 = this.teamHpRatio(0);
          const h1 = this.teamHpRatio(1);
          this.roundWinner = Math.abs(h0 - h1) < 1e-3 ? -1 : h0 > h1 ? 0 : 1;
          this.emit('timeup');
        }
        break;
      }
      case 'ko':
        if (this.phaseT > 1.8) this.timeScale = 1;
        if (this.phaseT > 3.0) this.endRound();
        break;
      case 'timeup':
        if (this.phaseT > 1.6) this.endRound();
        break;
      case 'roundEnd':
        if (this.waveList && this.phaseT > 2.6) {
          // Mode Vagues : une seule manche décide du niveau
          this.winner = this.roundWinner === 0 ? 0 : 1;
          this.phase = 'matchEnd';
          this.phaseT = 0;
          this.emit('matchEnd', { team: this.winner, wave: this.wave + 1 });
          break;
        }
        if (this.phaseT > 2.6) {
          const champ = this.wins.findIndex((w) => w >= ROUNDS_TO_WIN);
          if (champ >= 0 || (this.wins[0] >= ROUNDS_TO_WIN && this.wins[1] >= ROUNDS_TO_WIN)) {
            const both = this.wins[0] >= ROUNDS_TO_WIN && this.wins[1] >= ROUNDS_TO_WIN;
            this.winner = both ? -1 : champ;
            this.phase = 'matchEnd';
            this.phaseT = 0;
            this.emit('matchEnd', { team: this.winner });
          } else {
            this.startRound();
          }
        }
        break;
      default:
        break;
    }
  }

  endRound() {
    const w = this.roundWinner;
    if (this.waveList) {
      // Mode Vagues : pas de manches à compter
    } else if (w >= 0) this.wins[w] += 1;
    else { this.wins[0] += 1; this.wins[1] += 1; } // match nul : un point chacun
    this.timeScale = 1;
    this.phase = 'roundEnd';
    this.phaseT = 0;
    for (const f of this.fighters) {
      if (f.team === w && f.alive) { f.setState('victory'); f.move = null; f.vx = 0; f.vz = 0; }
    }
    this.emit('roundWin', { team: w });
  }

  // --- Boucle -------------------------------------------------------------------------

  /**
   * Avance d'un tick. `inputs` : tableau indexé par identifiant de combattant.
   */
  step(dt, inputs) {
    this.time += dt;
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    if (this.cine) {
      this.cine.t += dt;
      if (this.cine.t < this.cine.dur) return;
      this.cine = null;
      this.emit('cineEnd');
    }
    this.updatePhase(dt);
    const sdt = dt * this.timeScale;
    const act = this.canAct;
    for (const f of this.fighters) {
      const inp = act ? (inputs[f.id] || NO_INPUT) : NO_INPUT;
      f.update(sdt, inp, this);
      if (this.training) this.trainingRefill(f);
      else if (this.infiniteEnergy) f.energy = MAX_ENERGY;
    }
    this.separate();
    this.updateEntities(sdt);
    this.entities = this.entities.filter((e) => !e.dead);
  }

  trainingRefill(f) {
    if (this.infiniteEnergy) f.energy = MAX_ENERGY;
    if (f.lastHurt > 1.6 && f.hp < f.maxHp && f.state !== 'hitstun' && f.state !== 'knockdown') {
      f.hp = f.maxHp;
    }
  }

  /** Les combattants ne se traversent pas. */
  separate() {
    const fs = this.fighters;
    const min = FIGHTER_RADIUS * 2;
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        const a = fs[i];
        const b = fs[j];
        if (!a.alive || !b.alive || a.state === 'knockdown' || b.state === 'knockdown') continue;
        if (Math.abs(a.y - b.y) > 1.5) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= min) continue;
        const nx = d > 1e-4 ? dx / d : 1;
        const nz = d > 1e-4 ? dz / d : 0;
        const push = (min - d) / 2;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
      }
    }
  }

  startCine(f, mv) {
    this.cine = { id: f.id, t: 0, dur: mv.cine.dur, text: mv.cine.text };
    this.emit('cine', { id: f.id, charId: f.charId, text: mv.cine.text, dur: mv.cine.dur });
  }

  // --- Coups --------------------------------------------------------------------------

  /** Coup au corps à corps : une sphère devant le combattant (ou autour de lui). */
  meleeHit(f, act, idx) {
    const cx = act.around ? f.x : f.x + f.fwdX * act.reach;
    const cz = act.around ? f.z : f.z + f.fwdZ * act.reach;
    const cy = f.y + (act.hy ?? 1.0);
    const key = act.every ? `${idx}:${Math.floor((f.mt - act.t) / act.every)}` : `${idx}`;
    let set = f.hitSets.get(key);
    if (!set) { set = new Set(); f.hitSets.set(key, set); }
    for (const e of this.fighters) {
      if (e.team === f.team || !e.alive || set.has(e.id)) continue;
      const dx = e.x - cx;
      const dz = e.z - cz;
      if (Math.hypot(dx, dz) > act.radius + FIGHTER_RADIUS) continue;
      const h = e.state === 'knockdown' ? 0.6 : FIGHTER_HEIGHT;
      if (cy + act.radius < e.y || cy - act.radius > e.y + h) continue;
      let ddx = e.x - f.x;
      let ddz = e.z - f.z;
      const dl = Math.hypot(ddx, ddz);
      if (dl < 1e-3) { ddx = f.fwdX; ddz = f.fwdZ; } else { ddx /= dl; ddz /= dl; }
      const res = this.applyHit(f, e, act, ddx, ddz);
      if (res) {
        set.add(e.id);
        f.moveHit = true;
      }
    }
  }

  /**
   * Applique un coup. `h` : { dmg, type, stun, kb, up, kd, chip, unblockable, hold, impact }.
   * (dx, dz) : direction de la poussée. Renvoie 'hit', 'block' ou null.
   */
  applyHit(att, tgt, h, dx, dz, src = null) {
    if (!tgt.alive || tgt.invuln > 0) return null;
    if (tgt.state === 'knockdown' || tgt.state === 'getup') return null;
    if (h.groundOnly && tgt.y > 0.8) return null;
    const base = HIT_TYPES[h.type || h.hit || 'light'];
    const stun = h.stun ?? base.stun;
    const kb = (h.kb ?? base.kb) / tgt.def.weight;
    const up = h.up ?? base.up;
    const kd = h.kd ?? base.kd;
    let dmg = h.dmg * att.dmgMul();
    const hx = src ? src.x : att.x;
    const hz = src ? src.z : att.z;

    // Garde : il faut faire face à l'origine du coup.
    const tox = hx - tgt.x;
    const toz = hz - tgt.z;
    const tol = Math.hypot(tox, toz) || 1;
    const facing = (tox / tol) * tgt.fwdX + (toz / tol) * tgt.fwdZ > -0.1;
    const guarding = tgt.state === 'guard' || tgt.state === 'blockstun';
    const px = (tgt.x + (src ? src.x : att.x)) / 2;
    const pz = (tgt.z + (src ? src.z : att.z)) / 2;
    const py = tgt.y + 1.1;

    if (guarding && facing && !h.unblockable) {
      const chip = dmg * (h.chip ?? 0.12);
      tgt.hp = Math.max(this.training ? 1 : 0, tgt.hp - chip);
      tgt.guardHp -= h.dmg * 0.55;
      tgt.energy = Math.min(MAX_ENERGY, tgt.energy + 3);
      att.energy = Math.min(MAX_ENERGY, att.energy + 1.5);
      tgt.lastHurt = 0;
      if (tgt.guardHp <= 0) {
        tgt.guardHp = 0;
        tgt.setState('dizzy');
        tgt.stun = 1.3;
        tgt.vx = dx * 4; tgt.vz = dz * 4;
        this.emit('guardBreak', { id: tgt.id, x: tgt.x, y: tgt.y + 1.8, z: tgt.z });
        this.hitstop = 0.12;
      } else {
        tgt.setState('blockstun');
        tgt.stun = Math.max(0.12, stun * 0.6);
        tgt.vx = dx * kb * 0.55; tgt.vz = dz * kb * 0.55;
        this.hitstop = Math.max(this.hitstop, 0.04);
      }
      if (tgt.hp <= 0) return this.knockOut(att, tgt, dx, dz, px, py, pz);
      this.emit('hit', { x: px, y: py, z: pz, kind: h.type || h.hit, blocked: true, att: att.id, tgt: tgt.id });
      return 'block';
    }

    // Combo : un coup sur une cible encore sonnée prolonge l'enchaînement.
    const stunned = tgt.state === 'hitstun' || tgt.state === 'dizzy';
    att.combo = stunned && att.comboT > 0 ? att.combo + 1 : 1;
    att.comboT = 1.2;
    const scale = Math.max(0.35, 1 - (att.combo - 1) * 0.07);
    dmg *= scale;
    // Anti-boucle infinie : l'étourdissement diminue au fil du combo, et au 7e coup la victime
    // est projetée au sol (elle se relève invulnérable et peut répliquer).
    let comboStun = stun * Math.max(0.45, 1 - (att.combo - 1) * 0.09);
    let comboKd = kd;
    let comboKb = kb;
    let comboUp = up;
    if (att.combo >= 7 && !h.hold) {
      comboKd = true;
      comboKb = Math.max(kb, 9);
      comboUp = Math.max(up, 5);
    }
    tgt.hp -= dmg;
    tgt.lastHurt = 0;
    tgt.flash = 0.12;
    att.energy = Math.min(MAX_ENERGY, att.energy + h.dmg * 0.09 * att.mods.energy);
    tgt.energy = Math.min(MAX_ENERGY, tgt.energy + h.dmg * 0.05 * tgt.mods.energy);
    if (h.slow) tgt.slowT = h.slow;

    const armor = tgt.state === 'move' && tgt.move && (tgt.move.armor === 'full' || (tgt.move.armor === 'light' && !kd && up === 0));
    if (this.training && tgt.hp < 1) tgt.hp = 1;
    if (tgt.hp <= 0) return this.knockOut(att, tgt, dx, dz, px, py, pz, h);

    if (!armor) {
      if (tgt.move) { tgt.move = null; tgt.moveId = ''; }
      tgt.setState('hitstun');
      tgt.stun = h.hold ? stun : comboStun;
      if (h.hold) {
        tgt.vx = dx * kb; tgt.vz = dz * kb;
        if (!tgt.onGround) tgt.vy = Math.max(tgt.vy, 1.5);
      } else {
        tgt.vx = dx * comboKb; tgt.vz = dz * comboKb;
        if (comboUp > 0) { tgt.vy = comboUp; tgt.onGround = false; tgt.y = Math.max(tgt.y, 0.01); }
        else if (!tgt.onGround) tgt.vy = Math.max(tgt.vy, 3.5); // jongle
      }
      tgt.kdOnLand = !!comboKd || comboUp > 0 || (!tgt.onGround && tgt.kdOnLand);
    }

    const ht = HIT_TYPES[h.type || h.hit || 'light'];
    this.hitstop = Math.max(this.hitstop, h.ult ? 0.25 : ht.hitstop);
    this.emit('hit', {
      x: px, y: py, z: pz, kind: h.type || h.hit, blocked: false, att: att.id, tgt: tgt.id,
      dmg: Math.round(dmg), combo: att.combo, color: att.def.aura,
    });
    this.emit('shake', { amt: ht.shake });
    if (h.impact) this.emit('impact', { text: h.impact, x: px, y: py, z: pz });
    return 'hit';
  }

  knockOut(att, tgt, dx, dz, px, py, pz, h = null) {
    tgt.hp = 0;
    tgt.move = null;
    tgt.moveId = '';
    tgt.setState('ko');
    tgt.vx = dx * 11; tgt.vz = dz * 11; tgt.vy = 9;
    tgt.onGround = false;
    tgt.y = Math.max(tgt.y, 0.01);
    this.hitstop = 0.3;
    this.emit('hit', { x: px, y: py, z: pz, kind: 'kd', blocked: false, att: att.id, tgt: tgt.id, color: att.def.aura });
    if (h && h.impact) this.emit('impact', { text: h.impact, x: px, y: py, z: pz });
    this.emit('ko', { id: tgt.id, x: tgt.x, y: tgt.y + 1, z: tgt.z });
    this.emit('shake', { amt: 0.8 });
    if (this.waveList && tgt.team === 1) {
      // Mode Vagues : chaque ennemi abattu ravive les joueurs (vie et énergie)
      for (const f of this.fighters) {
        if (f.team !== 0 || !f.alive) continue;
        f.hp = Math.min(f.maxHp, f.hp + f.maxHp * (tgt.def.boss ? 0.15 : 0.05));
        f.energy = Math.min(MAX_ENERGY, f.energy + 10);
      }
    }
    return 'hit';
  }

  /** Coups de zone : tous les ennemis dans un cercle (hauteur limitée). */
  areaHit(owner, x, z, r, h, maxY = 3) {
    for (const e of this.fighters) {
      if (e.team === owner.team || !e.alive) continue;
      const dx = e.x - x;
      const dz = e.z - z;
      const d = Math.hypot(dx, dz);
      if (d > r + FIGHTER_RADIUS || e.y > maxY) continue;
      const nx = d > 1e-3 ? dx / d : owner.fwdX;
      const nz = d > 1e-3 ? dz / d : owner.fwdZ;
      this.applyHit(owner, e, h, nx, nz, { x, z });
    }
  }

  // --- Actions ------------------------------------------------------------------------

  doAction(f, act, target) {
    switch (act.a) {
      case 'proj': this.spawnProjectiles(f, act, target); break;
      case 'beam': this.spawnBeam(f, act, target); break;
      case 'aoe': this.spawnAoe(f, act, target); break;
      case 'ring':
        this.add({
          kind: 'ring', owner: f.id, team: f.team, x: f.x, y: 0.1, z: f.z, r: 0.3, maxR: act.maxR,
          speed: act.speed, hit: { dmg: act.dmg, type: act.type, groundOnly: act.groundOnly }, hitIds: [], color: act.fxColor || f.def.aura,
        });
        this.emit('sfx', { name: 'shockwave' });
        break;
      case 'summon': this.summon(f, act, target); break;
      case 'buff':
        if (act.buff === 'transform') {
          f.transformT = act.dur;
          this.emit('transform', { id: f.id, x: f.x, y: f.y + 1, z: f.z });
          this.emit('shake', { amt: 0.5 });
        }
        break;
      case 'warp': this.warp(f, act, target); break;
      case 'fx': this.emit('fx', { fx: act.fx, id: f.id, x: f.x, y: f.y + 1, z: f.z, color: f.def.aura }); break;
      case 'sfx': this.emit('sfx', { name: act.name }); break;
      case 'shake': this.emit('shake', { amt: act.amt }); break;
      default: break;
    }
  }

  warp(f, act, target) {
    if (!target) return;
    this.emit('fx', { fx: 'vanish', id: f.id, x: f.x, y: f.y + 1, z: f.z, color: f.def.aura });
    let dx = f.x - target.x;
    let dz = f.z - target.z;
    let d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = -target.fwdX; dz = -target.fwdZ; d = 1; }
    dx /= d; dz /= d;
    let nx; let nz;
    if (act.mode === 'around') {
      const a = act.angle * DEG;
      const rx = dx * Math.cos(a) - dz * Math.sin(a);
      const rz = dx * Math.sin(a) + dz * Math.cos(a);
      nx = target.x + rx * act.dist; nz = target.z + rz * act.dist;
    } else if (act.mode === 'through') {
      if (d > act.maxDist) { // trop loin : on fonce aussi loin que possible
        nx = f.x - dx * act.maxDist; nz = f.z - dz * act.maxDist;
      } else {
        nx = target.x - dx * act.dist; nz = target.z - dz * act.dist;
      }
    } else { // 'front'
      if (d > act.maxDist) { nx = f.x - dx * (act.maxDist - act.dist); nz = f.z - dz * (act.maxDist - act.dist); }
      else { nx = target.x + dx * act.dist; nz = target.z + dz * act.dist; }
    }
    const ox = f.x; const oz = f.z;
    [f.x, f.z] = this.clampToArena(nx, nz, 0.6);
    f.y = Math.min(f.y, target.y);
    if (act.mode === 'through') {
      // Le sabreur regarde dans la direction de sa course, dos à la victime
      f.yaw = Math.atan2(f.x - ox, f.z - oz);
      this.emit('fx', { fx: 'slashTrail', x: ox, z: oz, x2: f.x, z2: f.z, y: f.y + 1.1, color: f.def.aura });
    } else {
      f.faceTo(target);
    }
    f.vx = 0; f.vz = 0;
    this.emit('fx', { fx: 'appear', x: f.x, y: f.y + 1, z: f.z, color: f.def.aura });
    this.emit('sfx', { name: 'teleport' });
  }

  add(e) {
    e.id = this.nextEnt++;
    e.t = 0;
    this.entities.push(e);
    return e;
  }

  spawnProjectiles(f, act, target) {
    let p = act.p;
    if (act.cycle) { p = act.cycle[f.elem % act.cycle.length]; f.elem += 1; }
    const spread = act.spread || [0];
    const y = f.y + 1.2;
    for (const ang of spread) {
      const yaw = f.yaw + ang * DEG;
      const dx = Math.sin(yaw);
      const dz = Math.cos(yaw);
      let vy = 0;
      if (target) {
        const dist = Math.hypot(target.x - f.x, target.z - f.z) || 1;
        vy = Math.max(-0.5, Math.min(0.5, (target.y + 1.0 - y) / dist)) * p.speed;
      }
      const side = act.offset || 0;
      this.add({
        kind: 'proj', type: p.kind, owner: f.id, team: f.team,
        x: f.x + dx * 0.7 + dz * side, y: y + Math.abs(side) * 0.3, z: f.z + dz * 0.7 - dx * side,
        vx: dx * p.speed, vy, vz: dz * p.speed, yaw,
        r: p.r, life: p.life, p, hitIds: [], power: p.dmg,
      });
    }
    this.emit('sfx', { name: `shot_${p.kind}` });
  }

  spawnBeam(f, act, target) {
    let dy = 0;
    if (target) {
      const dist = Math.hypot(target.x - f.x, target.z - f.z) || 1;
      dy = Math.max(-0.4, Math.min(0.4, (target.y + 0.9 - (f.y + 1.15)) / dist));
    }
    this.add({
      kind: 'beam', owner: f.id, team: f.team, x: f.x, y: f.y + 1.15, z: f.z,
      dx: f.fwdX, dz: f.fwdZ, dy, len: 0, maxLen: 34, width: act.width, dur: act.dur,
      tick: act.tick, tickT: 0, dmg: act.dmg, finalDmg: act.finalDmg, impact: act.impact,
      color: f.transformed ? f.def.auraAlt : f.def.aura,
    });
    this.emit('sfx', { name: 'beam' });
  }

  spawnAoe(f, act, target) {
    const base = target || { x: f.x + f.fwdX * 4, z: f.z + f.fwdZ * 4 };
    let x = base.x;
    let z = base.z;
    if (act.offset) {
      // Décalage dans le repère du lanceur (avant / côté)
      const [side, fwd] = act.offset;
      x += f.fwdZ * side + f.fwdX * fwd;
      z += -f.fwdX * side + f.fwdZ * fwd;
    }
    [x, z] = this.clampToArena(x, z, 0.5);
    this.add({
      kind: 'aoe', type: act.type, owner: f.id, team: f.team, x, y: 0, z,
      delay: act.delay, r: act.r, done: false, linger: act.zone ? act.zone.dur : 0.7,
      hit: { dmg: act.dmg, type: act.hit, chip: act.chip, ult: !!act.impact }, impact: act.impact || null, zone: act.zone || null, zoneT: 0,
    });
    this.emit('sfx', { name: act.type === 'meteor' ? 'meteorFall' : 'cast' });
  }

  summon(f, act, target) {
    if (act.kind === 'fox') {
      for (const e of this.entities) if (e.kind === 'minion' && e.type === 'fox' && e.owner === f.id) this.poof(e);
    }
    for (let i = 0; i < act.count; i++) {
      const side = act.count > 1 ? (i === 0 ? -1 : 1) : 0;
      const sx = f.fwdZ * side * 1.4;
      const sz = -f.fwdX * side * 1.4;
      if (act.kind === 'dragon') {
        const tx = target ? target.x : f.x + f.fwdX * 8;
        const tz = target ? target.z : f.z + f.fwdZ * 8;
        this.add({
          kind: 'minion', type: 'dragon', owner: f.id, team: f.team,
          x: f.x - f.fwdX * 3, y: 6, z: f.z - f.fwdZ * 3,
          p0: [f.x - f.fwdX * 3, 7, f.z - f.fwdZ * 3], tx, tz, T: 1.35, life: 1.35, dmg: act.dmg, impact: act.impact, yaw: f.yaw,
        });
        this.emit('sfx', { name: 'dragon' });
      } else {
        this.add({
          kind: 'minion', type: act.kind, owner: f.id, team: f.team,
          x: f.x + sx, y: act.kind === 'fox' ? 0.5 : 0, z: f.z + sz, vx: 0, vz: 0, yaw: f.yaw,
          life: act.kind === 'fox' ? 9 : 1.7, cd: 0.6 + i * 0.4, side: side || 1,
        });
      }
    }
    if (act.kind !== 'dragon') this.emit('sfx', { name: 'summon' });
    this.emit('fx', { fx: 'summonBurst', x: f.x, y: f.y + 1, z: f.z, color: f.def.aura });
  }

  poof(e) {
    e.dead = true;
    this.emit('fx', { fx: 'poof', x: e.x, y: e.y + 0.8, z: e.z, kind: e.type });
  }

  // --- Entités ------------------------------------------------------------------------

  updateEntities(dt) {
    for (const e of this.entities) {
      if (e.dead) continue;
      e.t += dt;
      const owner = this.fighters[e.owner];
      switch (e.kind) {
        case 'proj': this.updateProjectile(e, owner, dt); break;
        case 'beam': this.updateBeam(e, owner, dt); break;
        case 'aoe': this.updateAoe(e, owner, dt); break;
        case 'ring': this.updateRing(e, owner, dt); break;
        case 'minion': this.updateMinion(e, owner, dt); break;
        default: e.dead = true;
      }
    }
    // Choc de projectiles adverses : ils s'annulent (le plus puissant survit, affaibli).
    const ps = this.entities.filter((e) => e.kind === 'proj' && !e.dead);
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i];
        const b = ps[j];
        if (a.dead || b.dead || a.team === b.team) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (d > a.r + b.r) continue;
        this.emit('fx', { fx: 'clash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
        this.emit('sfx', { name: 'clash' });
        if (a.power > b.power * 1.5) { b.dead = true; a.power -= b.power; }
        else if (b.power > a.power * 1.5) { a.dead = true; b.power -= a.power; }
        else { a.dead = true; b.dead = true; }
      }
    }
  }

  updateProjectile(e, owner, dt) {
    const p = e.p;
    if (p.homing) {
      const t = this.targetFor(owner);
      if (t && t.alive) {
        const tx = t.x - e.x;
        const ty = t.y + 1 - e.y;
        const tz = t.z - e.z;
        const tl = Math.hypot(tx, ty, tz) || 1;
        const sp = Math.hypot(e.vx, e.vy, e.vz) || 1;
        const k = Math.min(1, p.homing * dt);
        e.vx += ((tx / tl) * sp - e.vx) * k;
        e.vy += ((ty / tl) * sp - e.vy) * k;
        e.vz += ((tz / tl) * sp - e.vz) * k;
      }
    }
    e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
    e.life -= dt;
    if (e.y < 0.15) { e.y = 0.15; if (e.vy < 0) e.vy = 0; }
    for (const f of this.fighters) {
      if (f.team === e.team || !f.alive || e.hitIds.includes(f.id)) continue;
      const d = Math.hypot(f.x - e.x, f.z - e.z);
      if (d > e.r + FIGHTER_RADIUS) continue;
      const h = f.state === 'knockdown' ? 0.6 : FIGHTER_HEIGHT;
      if (e.y + e.r < f.y || e.y - e.r > f.y + h) continue;
      const sp = Math.hypot(e.vx, e.vz) || 1;
      const res = this.applyHit(owner, f, { dmg: p.dmg, type: p.hit, slow: p.slow }, e.vx / sp, e.vz / sp, { x: e.x - e.vx * 0.05, z: e.z - e.vz * 0.05 });
      if (!res) continue;
      e.hitIds.push(f.id);
      if (!p.pierce) { this.explodeProjectile(e, owner); return; }
    }
    if (e.life <= 0 || Math.hypot(e.x, e.z) > this.arenaRadius + 1) this.explodeProjectile(e, owner, e.life <= 0 && !p.explode);
  }

  explodeProjectile(e, owner, quiet = false) {
    e.dead = true;
    if (e.p.explode) {
      this.areaHit(owner, e.x, e.z, e.p.explode.r, { dmg: e.p.explode.dmg, type: 'heavy' }, e.y + 2);
      this.emit('fx', { fx: 'explosion', x: e.x, y: e.y, z: e.z, r: e.p.explode.r, kind: e.type });
      this.emit('sfx', { name: 'explosion' });
      this.emit('shake', { amt: 0.25 });
    } else if (!quiet) {
      this.emit('fx', { fx: 'projHit', x: e.x, y: e.y, z: e.z, kind: e.type });
    }
  }

  updateBeam(e, owner, dt) {
    // Le rayon s'arrête si le lanceur est interrompu
    if (!owner.alive || owner.state !== 'move') { e.dead = true; return; }
    e.x = owner.x + owner.fwdX * 0.7;
    e.z = owner.z + owner.fwdZ * 0.7;
    e.y = owner.y + 1.15;
    e.len = Math.min(e.maxLen, e.len + 48 * dt);
    // Le rayon détruit les projectiles adverses sur son passage
    for (const o of this.entities) {
      if (o.kind !== 'proj' || o.team === e.team || o.dead) continue;
      if (this.segDist(e, o.x, o.y, o.z) < e.width + o.r) {
        o.dead = true;
        this.emit('fx', { fx: 'clash', x: o.x, y: o.y, z: o.z });
      }
    }
    e.tickT -= dt;
    const final = e.t >= e.dur;
    if (e.tickT <= 0 || final) {
      e.tickT = e.tick;
      for (const f of this.fighters) {
        if (f.team === e.team || !f.alive) continue;
        if (this.segDist(e, f.x, f.y + 0.9, f.z) > e.width + FIGHTER_RADIUS + 0.4) continue;
        const h = final
          ? { dmg: e.finalDmg, type: 'kd', chip: 0.3, impact: e.impact, ult: true }
          : { dmg: e.dmg, type: 'light', stun: 0.3, kb: 2.5, chip: 0.25, hold: true };
        this.applyHit(owner, f, h, e.dx, e.dz, { x: e.x, z: e.z });
      }
    }
    if (final) {
      e.dead = true;
      const ex = e.x + e.dx * e.len;
      const ez = e.z + e.dz * e.len;
      this.emit('fx', { fx: 'explosion', x: ex, y: e.y, z: ez, r: 3, kind: 'beam' });
    }
  }

  /** Distance d'un point au segment du rayon. */
  segDist(e, x, y, z) {
    const dy = e.dy;
    const len = e.len;
    const n = Math.hypot(e.dx, dy, e.dz);
    const ux = e.dx / n; const uy = dy / n; const uz = e.dz / n;
    const px = x - e.x; const py = y - e.y; const pz = z - e.z;
    const t = Math.max(0, Math.min(len, px * ux + py * uy + pz * uz));
    return Math.hypot(px - ux * t, py - uy * t, pz - uz * t);
  }

  updateAoe(e, owner, dt) {
    if (!e.done && e.t >= e.delay) {
      e.done = true;
      const h = e.type === 'meteor' || e.type === 'tornado' || e.r >= 4 ? 5 : 2.6;
      this.areaHit(owner, e.x, e.z, e.r, e.hit, h);
      this.emit('fx', { fx: 'aoeBoom', type: e.type, x: e.x, y: 0, z: e.z, r: e.r });
      const snd = { meteor: 'bigExplosion', icepillar: 'ice', thunder: 'thunder', tornado: 'dash', windburst: 'bigExplosion', darkblast: 'bigExplosion', rockpillar: 'shockwave', rockblast: 'bigExplosion' };
      this.emit('sfx', { name: snd[e.type] || 'fire' });
      this.emit('shake', { amt: e.r >= 4 ? 1.0 : 0.25 });
      if (e.impact) this.emit('impact', { text: e.impact, x: e.x, y: 2, z: e.z });
    }
    if (e.done && e.zone) {
      e.zoneT -= dt;
      if (e.zoneT <= 0) {
        e.zoneT = e.zone.tick;
        this.areaHit(owner, e.x, e.z, e.r * 0.85, { dmg: e.zone.dmg, type: 'light', stun: 0.2, kb: 0.5 }, 1.5);
      }
    }
    if (e.t > e.delay + e.linger) e.dead = true;
  }

  updateRing(e, owner, dt) {
    e.r += e.speed * dt;
    for (const f of this.fighters) {
      if (f.team === e.team || !f.alive || e.hitIds.includes(f.id)) continue;
      const d = Math.hypot(f.x - e.x, f.z - e.z);
      if (Math.abs(d - e.r) > 0.8) continue;
      if (e.hit.groundOnly && f.y > 0.8) continue;
      const nx = d > 1e-3 ? (f.x - e.x) / d : 1;
      const nz = d > 1e-3 ? (f.z - e.z) / d : 0;
      if (this.applyHit(owner, f, e.hit, nx, nz, { x: e.x, z: e.z })) e.hitIds.push(f.id);
    }
    if (e.r >= e.maxR) e.dead = true;
  }

  updateMinion(e, owner, dt) {
    if (!owner.alive && e.type !== 'dragon') { this.poof(e); return; }
    if (e.type === 'dragon') { this.updateDragon(e, owner); return; }
    const t = this.targetFor(owner);
    e.life -= dt;
    if (e.life <= 0 || !t || !t.alive) { this.poof(e); return; }
    if (e.type === 'clone') {
      if (e.t < 0.18) return; // apparition
      const dx = t.x - e.x;
      const dz = t.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      // Les clones arrivent en arc, chacun par un côté
      const sx = (-dz / d) * e.side * 0.5;
      const sz = (dx / d) * e.side * 0.5;
      const vx = (dx / d + sx) * 15;
      const vz = (dz / d + sz) * 15;
      e.x += vx * dt; e.z += vz * dt;
      e.yaw = Math.atan2(vx, vz);
      if (d < 1.1) {
        this.applyHit(owner, t, { dmg: 40, type: 'heavy' }, dx / d, dz / d, e);
        this.poof(e);
      }
      return;
    }
    // Renard-esprit : tourne autour de la cible et mord régulièrement
    e.cd -= dt;
    const ang = Math.atan2(e.x - t.x, e.z - t.z) + e.side * 0.9 * dt;
    const want = e.cd < 0.25 ? 0.9 : 2.4;
    const gx = t.x + Math.sin(ang) * want;
    const gz = t.z + Math.cos(ang) * want;
    const k = Math.min(1, dt * 4);
    e.vx += ((gx - e.x) * 4 - e.vx) * k;
    e.vz += ((gz - e.z) * 4 - e.vz) * k;
    const sp = Math.hypot(e.vx, e.vz);
    if (sp > 9) { e.vx *= 9 / sp; e.vz *= 9 / sp; }
    e.x += e.vx * dt; e.z += e.vz * dt;
    [e.x, e.z] = this.clampToArena(e.x, e.z, 0.4);
    e.y = 0.45 + Math.sin(e.t * 6) * 0.12;
    e.yaw = Math.atan2(t.x - e.x, t.z - e.z);
    const d = Math.hypot(t.x - e.x, t.z - e.z);
    if (e.cd <= 0 && d < 1.7) {
      e.cd = 1.45;
      const nx = (t.x - e.x) / (d || 1);
      const nz = (t.z - e.z) / (d || 1);
      this.applyHit(owner, t, { dmg: 17, type: 'light', stun: 0.4 }, nx, nz, e);
      this.emit('fx', { fx: 'bite', x: t.x, y: t.y + 1, z: t.z, color: owner.def.aura });
    }
  }

  updateDragon(e, owner) {
    const t = this.targetFor(owner);
    if (t && e.t < 0.9) { e.tx = t.x; e.tz = t.z; } // suit la cible, puis plonge
    const k = Math.min(1, e.t / e.T);
    const [x0, y0, z0] = e.p0;
    const x1 = (x0 + e.tx) / 2; const y1 = 10; const z1 = (z0 + e.tz) / 2;
    const u = 1 - k;
    const nx = u * u * x0 + 2 * u * k * x1 + k * k * e.tx;
    const ny = u * u * y0 + 2 * u * k * y1 + k * k * 0.3;
    const nz = u * u * z0 + 2 * u * k * z1 + k * k * e.tz;
    e.yaw = Math.atan2(nx - e.x, nz - e.z);
    e.pitch = Math.atan2(ny - e.y, Math.hypot(nx - e.x, nz - e.z));
    e.x = nx; e.y = ny; e.z = nz;
    if (k >= 1) {
      e.dead = true;
      this.areaHit(owner, e.tx, e.tz, 5, { dmg: e.dmg, type: 'kd', chip: 0.3, ult: true }, 5);
      this.emit('fx', { fx: 'aoeBoom', type: 'dragon', x: e.tx, y: 0, z: e.tz, r: 5 });
      this.emit('impact', { text: e.impact, x: e.tx, y: 2, z: e.tz });
      this.emit('sfx', { name: 'bigExplosion' });
      this.emit('shake', { amt: 1.0 });
    }
  }
}
