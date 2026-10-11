// Un combattant : état, physique et exécution des coups. Aucune dépendance au rendu.
import {
  BTN, GRAVITY, JUMP_VELOCITY, INPUT_BUFFER, MAX_ENERGY,
} from './constants.js';
import { isNormalMove, slotOf, cooldownOf, SLOT_IDS } from './characters.js';

const BITS = Object.values(BTN);
const DODGE_TIME = 0.32;
const DODGE_SPEED = 16;
export const PARRY_WINDOW = 0.16; // garde levée juste avant le coup : parade parfaite
const PARRY_REARM = 0.35; // délai avant qu'une nouvelle garde offre une parade (pas de spam)

export class Fighter {
  /**
   * @param mods multiplicateurs (améliorations achetées, boss du mode histoire) :
   *   { dmg, hp, speed, energy, cd }
   */
  constructor(id, def, team, slot, mods = {}) {
    this.id = id;
    this.def = def;
    this.charId = def.id;
    this.team = team;
    this.slot = slot; // position dans l'équipe (0 ou 1)
    this.mods = { dmg: 1, hp: 1, speed: 1, energy: 1, cd: 1, ...mods };
    this.maxHp = Math.round(def.hp * this.mods.hp);
    this.buf = {};
    this.bless = {}; // bénédictions du mode Vagues : { identifiant: nombre de fois }
    this.shield = 0;
    this.phase2 = false; // boss du mode Vagues entré dans sa seconde phase
    this.reset(0, 0, 0);
    this.energy = 0;
  }

  /** Remet le combattant en début de manche (l'énergie est conservée d'une manche à l'autre). */
  reset(x, z, yaw) {
    this.x = x; this.y = 0; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = yaw;
    this.hp = this.maxHp;
    this.guardHp = 100;
    this.state = 'idle';
    this.st = 0;
    this.move = null;
    this.moveId = '';
    this.mt = 0;
    this.hitSets = new Map();
    this.moveHit = false;
    this.stun = 0;
    this.kdOnLand = false;
    this.invuln = 0;
    this.transformT = 0;
    this.slowT = 0;
    this.dodgeCd = 0;
    this.dodgeDir = { x: 0, z: 0 };
    this.airDash = true;
    this.onGround = true;
    this.combo = 0;
    this.comboT = 0;
    this.targetId = -1;
    this.elem = 0;
    this.flash = 0;
    // Temps de recharge restant par emplacement d'attaque, et durée totale (pour l'affichage)
    this.cd = Object.fromEntries(SLOT_IDS.map((k) => [k, 0]));
    this.cdMax = Object.fromEntries(SLOT_IDS.map((k) => [k, 1]));
    this.lastHurt = 99;
    this.buf = {};
    this.parryUntil = -1; // instant (temps du match) jusqu'auquel une parade parfaite est possible
    this.lastGuard = -9;
    this.counterT = 0; // fenêtre de riposte après une parade
    this.pursuitT = 0; // fenêtre de poursuite aérienne après un lanceur
    this.pursuitId = -1;
    this.slammed = false;
  }

  get alive() {
    return this.state !== 'ko';
  }

  get fwdX() { return Math.sin(this.yaw); }
  get fwdZ() { return Math.cos(this.yaw); }

  get transformed() { return this.transformT > 0; }

  dmgMul() {
    const fury = this.bless.colere && this.hp < this.maxHp * 0.35 ? 1 + 0.4 * this.bless.colere : 1;
    return (this.transformed ? 1.3 : 1) * this.mods.dmg * fury;
  }
  speedMul() { return (this.transformed ? 1.2 : 1) * (this.slowT > 0 ? 0.6 : 1) * this.mods.speed; }

  setState(s) {
    if (this.state !== s) { this.state = s; this.st = 0; }
  }

  faceTo(t) {
    if (!t) return;
    const dx = t.x - this.x;
    const dz = t.z - this.z;
    if (dx * dx + dz * dz > 1e-4) this.yaw = Math.atan2(dx, dz);
  }

  turnTo(t, dt, rate = 12) {
    if (!t) return;
    const dx = t.x - this.x;
    const dz = t.z - this.z;
    if (dx * dx + dz * dz < 1e-4) return;
    const want = Math.atan2(dx, dz);
    let d = want - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * rate);
  }

  /** Coup effectivement joué pour un identifiant (le spécial change une fois transformé). */
  moveDef(id) {
    // Seconde phase d'un boss : certains coups sont remplacés par des versions plus puissantes
    const p2 = this.phase2 && this.def.phase2 && this.def.phase2.moves;
    let mv = (p2 && p2[id]) || this.def.moves[id];
    if (!mv) return null;
    if (mv.alt && this.transformed) { id = mv.alt; mv = this.def.moves[id]; }
    return { id, mv };
  }

  take(bit) {
    if (this.buf[bit] > 0) { this.buf[bit] = 0; return true; }
    return false;
  }

  /** Un tick de simulation. `inp` = { mx, mz (direction monde), held, pressed (masques) }. */
  update(dt, inp, m) {
    for (const b of BITS) {
      if (inp.pressed & b) this.buf[b] = INPUT_BUFFER;
      else if (this.buf[b] > 0) this.buf[b] -= dt;
    }
    this.st += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    for (const k of SLOT_IDS) if (this.cd[k] > 0) this.cd[k] = Math.max(0, this.cd[k] - dt);
    this.slowT = Math.max(0, this.slowT - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    this.pursuitT = Math.max(0, this.pursuitT - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.lastHurt += dt;
    if (this.transformT > 0) {
      this.transformT = Math.max(0, this.transformT - dt);
      this.energy = Math.min(MAX_ENERGY, this.energy + 2.5 * dt);
      if (this.transformT === 0) m.emit('fx', { fx: 'detransform', id: this.id, x: this.x, y: this.y + 1, z: this.z });
    }
    if (this.state !== 'guard' && this.state !== 'blockstun') this.guardHp = Math.min(100, this.guardHp + 22 * dt);
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }

    const target = m.targetFor(this);
    this.targetId = target ? target.id : -1;

    switch (this.state) {
      case 'idle':
      case 'walk':
      case 'air':
      case 'land':
        if (this.state === 'land' && this.st > 0.07) this.setState('idle');
        this.freeControl(dt, inp, m, target);
        break;
      case 'guard':
        this.vx = 0; this.vz = 0;
        this.turnTo(target, dt);
        if (this.take(BTN.DODGE)) this.startDodge(inp, m, target);
        else if (!(inp.held & BTN.GUARD)) this.setState('idle');
        break;
      case 'charge':
        this.vx = 0; this.vz = 0;
        this.energy = Math.min(MAX_ENERGY, this.energy + 30 * dt * this.mods.energy);
        if (this.tryActions(inp, m, target)) break;
        if (!(inp.held & BTN.CHARGE) || this.energy >= MAX_ENERGY) this.setState('idle');
        break;
      case 'move':
        this.updateMove(dt, inp, m, target);
        break;
      case 'dodge':
        this.updateDodge(dt);
        break;
      case 'hitstun':
        this.stun -= dt;
        if (this.onGround && this.stun <= 0) this.setState('idle');
        else if (!this.onGround && this.stun <= 0 && !this.kdOnLand) this.setState('air');
        break;
      case 'blockstun':
        this.stun -= dt;
        if (this.stun <= 0) this.setState(inp.held & BTN.GUARD ? 'guard' : 'idle');
        break;
      case 'dizzy':
        this.stun -= dt;
        if (this.stun <= 0) this.setState('idle');
        break;
      case 'knockdown': {
        this.invuln = Math.max(this.invuln, 0.1);
        const quick = this.st > 0.35 && (this.take(BTN.JUMP) || this.take(BTN.DODGE));
        if (this.st > 0.8 || quick) { this.setState('getup'); this.invuln = 0.4; }
        break;
      }
      case 'getup':
        if (this.st > 0.35) { this.setState('idle'); this.faceTo(target); }
        break;
      default:
        break; // ko, victory, intro : rien à décider
    }
    this.physics(dt, m);
  }

  freeControl(dt, inp, m, target) {
    if (m.canAct && this.tryActions(inp, m, target)) return;
    const spd = this.def.speed * this.speedMul();
    if (this.onGround) {
      if (m.canAct && this.pursuitT > 0 && this.buf[BTN.JUMP] > 0 && this.tryPursuit(m)) return;
      if (m.canAct && this.take(BTN.JUMP)) {
        this.vy = JUMP_VELOCITY;
        this.onGround = false;
        this.vx = inp.mx * spd;
        this.vz = inp.mz * spd;
        this.setState('air');
        m.emit('sfx', { name: 'jump' });
        m.emit('fx', { fx: 'dust', x: this.x, y: 0.05, z: this.z });
        return;
      }
      if (m.canAct && (inp.held & BTN.GUARD)) {
        // Garde fraîchement levée : courte fenêtre de parade parfaite
        if (m.time - this.lastGuard >= PARRY_REARM) this.parryUntil = m.time + PARRY_WINDOW * (1 + (this.bless.parade || 0));
        this.lastGuard = m.time;
        this.setState('guard');
        return;
      }
      if (m.canAct && (inp.held & BTN.CHARGE) && this.energy < MAX_ENERGY) { this.setState('charge'); return; }
      this.vx = inp.mx * spd;
      this.vz = inp.mz * spd;
      const moving = inp.mx * inp.mx + inp.mz * inp.mz > 0.01;
      if (this.state !== 'land') this.setState(moving ? 'walk' : 'idle');
      this.turnTo(target, dt);
    } else {
      // Contrôle aérien limité
      const k = Math.min(1, dt * 3);
      this.vx += (inp.mx * spd - this.vx) * k;
      this.vz += (inp.mz * spd - this.vz) * k;
      this.turnTo(target, dt, 6);
      if (this.state !== 'air') this.setState('air');
    }
  }

  /**
   * Poursuite aérienne : juste après avoir envoyé l'adversaire en l'air, un saut nous téléporte
   * à sa hauteur pour continuer le combo (puis Lourd en l'air = frappe plongeante).
   */
  tryPursuit(m) {
    const t = m.fighters[this.pursuitId];
    if (!t || !t.alive || t.onGround || t.state !== 'hitstun' || t.y < 0.8) return false;
    this.buf[BTN.JUMP] = 0;
    this.pursuitT = 0;
    m.emit('fx', { fx: 'vanish', x: this.x, y: this.y + 1, z: this.z, color: this.def.aura });
    let dx = this.x - t.x;
    let dz = this.z - t.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    [this.x, this.z] = m.clampToArena(t.x + dx * 1.0, t.z + dz * 1.0, 0.6);
    this.y = Math.max(0.6, t.y - 0.3);
    this.vx = 0; this.vz = 0; this.vy = 3;
    this.onGround = false;
    this.airDash = true;
    this.faceTo(t);
    this.setState('air');
    // La cible reste suspendue un instant : le temps d'enchaîner
    t.vy = Math.min(t.vy, 2.5);
    t.vx *= 0.2; t.vz *= 0.2;
    t.stun = Math.max(t.stun, 0.5);
    m.emit('fx', { fx: 'appear', x: this.x, y: this.y + 1, z: this.z, color: this.def.aura });
    m.emit('pursuit', { id: this.id, x: this.x, y: this.y + 1, z: this.z });
    return true;
  }

  /** Lance un coup si une touche est en attente. Renvoie true si une action a démarré. */
  tryActions(inp, m, target, from = null) {
    const order = [
      [BTN.ULT, 'ultimate'], [BTN.SPECIAL, 'special'], [BTN.HEAVY, 'heavy'], [BTN.RANGED, 'ranged'], [BTN.LIGHT, 'light1'],
    ];
    for (const [bit, id] of order) {
      if (!(this.buf[bit] > 0)) continue;
      if (from) {
        // Annulation depuis un coup normal : on n'enchaîne pas vers le même coup, ni sur light1.
        if (id === 'light1') continue;
        if (id === from) continue;
      }
      // En l'air, le coup lourd devient une frappe plongeante (sauf coups lourds aériens dédiés)
      const aid = id === 'heavy' && !this.onGround && !this.def.moves.heavy.air && this.def.moves.airslam ? 'airslam' : id;
      const res = this.moveDef(aid);
      if (!res) continue;
      const slot = slotOf(aid);
      if (this.cd[slot] > 0) {
        // En recharge : un appui juste avant la fin reste en attente, sinon il est refusé
        if (this.cd[slot] > INPUT_BUFFER) { this.buf[bit] = 0; m.emit('cooldown', { id: this.id, slot }); }
        continue;
      }
      if (!this.onGround && !res.mv.air) continue;
      const cost = res.mv.cost || 0;
      if (cost > this.energy) {
        this.buf[bit] = 0;
        m.emit('noEnergy', { id: this.id });
        continue;
      }
      this.buf[bit] = 0;
      this.startMove(res.id, res.mv, m, target);
      return true;
    }
    if (this.buf[BTN.DODGE] > 0 && this.dodgeCd <= 0 && (this.onGround || this.airDash)) {
      this.buf[BTN.DODGE] = 0;
      this.startDodge(inp, m, target);
      return true;
    }
    return false;
  }

  startMove(id, mv, m, target) {
    this.energy -= mv.cost || 0;
    const slot = slotOf(id);
    if (slot !== 'light' || id === 'light1') {
      this.cd[slot] = cooldownOf(mv, id) * this.mods.cd;
      this.cdMax[slot] = this.cd[slot];
    }
    this.move = mv;
    this.moveId = id;
    this.mt = 0;
    this.hitSets.clear();
    this.moveHit = false;
    this.setState('move');
    this.faceTo(target);
    if (!this.onGround) this.vy = mv.dive ? -mv.dive : Math.max(this.vy, 3);
    if (mv.cine) m.startCine(this, mv);
    else if (id.startsWith('special')) m.emit('special', { id: this.id, name: mv.name });
    m.emit('sfx', { name: mv.cine ? 'ultStart' : id === 'special' || id === 'special2' ? 'specialStart' : 'swing' });
  }

  updateMove(dt, inp, m, target) {
    const mv = this.move;
    const prev = this.mt;
    this.mt += dt;
    const t = this.mt;

    let lunging = false;
    if (mv.lunge) {
      for (const [a, b, v] of mv.lunge) {
        if (t >= a && t < b) {
          const s = v * this.speedMul();
          this.vx = this.fwdX * s;
          this.vz = this.fwdZ * s;
          lunging = true;
        }
      }
    }
    if (!lunging && this.onGround) {
      const f = Math.exp(-12 * dt);
      this.vx *= f; this.vz *= f;
    }
    if (mv.invuln && t >= mv.invuln[0] && t <= mv.invuln[1]) this.invuln = Math.max(this.invuln, dt * 1.5);

    const acts = mv.actions;
    for (let i = 0; i < acts.length; i++) {
      const act = acts[i];
      if (act.a === 'hit') {
        const end = act.t + (act.dur || 0);
        const active = act.dur ? (t >= act.t && prev <= end) : (prev < act.t && act.t <= t);
        if (active) m.meleeHit(this, act, i);
      } else if (prev < act.t && act.t <= t) {
        m.doAction(this, act, target);
      }
      if (this.state !== 'move' || this.move !== mv) return; // interrompu (KO…) ou annulé
    }

    // Enchaînements et annulations
    if (mv.cancel != null && t >= mv.cancel && isNormalMove(this.moveId)) {
      if (mv.chain && this.buf[BTN.LIGHT] > 0) {
        this.buf[BTN.LIGHT] = 0;
        const res = this.moveDef(mv.chain);
        if (res && (this.onGround || res.mv.air)) { this.startMove(res.id, res.mv, m, target); return; }
      }
      if (this.tryActions(inp, m, target, this.moveId)) return;
    }
    if (t >= mv.dur) this.endMove();
  }

  endMove() {
    // Fin d'un enchaînement léger : courte recharge avant de pouvoir en relancer un
    if (/^light/.test(this.moveId)) this.cd.light = Math.max(this.cd.light, 0.55);
    this.move = null;
    this.moveId = '';
    this.setState(this.onGround ? 'idle' : 'air');
  }

  startDodge(inp, m, target) {
    let dx = inp.mx;
    let dz = inp.mz;
    let len = Math.hypot(dx, dz);
    const hasDir = len > 0.25;
    if (!hasDir) { dx = -this.fwdX; dz = -this.fwdZ; len = 1; }
    dx /= len; dz /= len;
    this.dodgeCd = 0.42 / (1 + (this.bless.agile || 0));
    if (!this.onGround) { this.airDash = false; this.vy = Math.max(this.vy, 2); }
    if (this.def.teleportDodge) {
      // Téléportation : derrière l'adversaire sans direction, sinon un bond de 4,5 m.
      m.emit('fx', { fx: 'vanish', x: this.x, y: this.y + 1, z: this.z, color: this.def.aura });
      let nx; let nz;
      if (!hasDir && target) {
        nx = target.x - target.fwdX * 1.6;
        nz = target.z - target.fwdZ * 1.6;
      } else {
        nx = this.x + dx * 4.5;
        nz = this.z + dz * 4.5;
      }
      [nx, nz] = m.clampToArena(nx, nz, 0.6);
      this.x = nx; this.z = nz;
      this.vx = 0; this.vz = 0;
      this.faceTo(target);
      this.invuln = 0.3;
      this.dodgeDir = { x: 0, z: 0 };
      m.emit('fx', { fx: 'appear', x: this.x, y: this.y + 1, z: this.z, color: this.def.aura });
      m.emit('sfx', { name: 'teleport' });
    } else {
      this.dodgeDir = { x: dx, z: dz };
      this.invuln = 0.26;
      m.emit('sfx', { name: 'dash' });
      m.emit('fx', { fx: 'dust', x: this.x, y: 0.05, z: this.z });
    }
    this.setState('dodge');
  }

  updateDodge(dt) {
    const k = Math.max(0, 1 - this.st / DODGE_TIME);
    const s = DODGE_SPEED * k * k * this.speedMul();
    this.vx = this.dodgeDir.x * s;
    this.vz = this.dodgeDir.z * s;
    const dur = this.def.teleportDodge ? 0.2 : DODGE_TIME;
    if (this.st >= dur) this.setState(this.onGround ? 'idle' : 'air');
  }

  physics(dt, m) {
    if (!this.onGround) {
      let g = GRAVITY;
      const dive = this.state === 'move' && this.move && this.move.dive;
      if (this.state === 'move' && !dive) g *= 0.35; // les coups aériens « flottent »
      if (this.state === 'hitstun' && this.vy < 0 && !this.slammed) g *= 0.75; // jongles un peu plus lisibles
      this.vy -= g * dt;
      if (this.state === 'move' && !dive && this.vy < -6) this.vy = -6;
    }
    if (['hitstun', 'blockstun', 'knockdown', 'getup', 'ko', 'dizzy', 'victory'].includes(this.state) && this.onGround) {
      const f = Math.exp(-7 * dt);
      this.vx *= f; this.vz *= f;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;

    if (this.y <= 0) {
      this.y = 0;
      if (!this.onGround) {
        this.onGround = true;
        const impact = -this.vy;
        this.vy = 0;
        this.airDash = true;
        this.onLand(m, impact);
      }
    } else if (this.y > 0.001) {
      this.onGround = false;
    }

    // Bord de l'arène : on rebondit sur le mur invisible
    const R = m.arenaRadius - 0.5;
    const d = Math.hypot(this.x, this.z);
    if (d > R) {
      const nx = this.x / d;
      const nz = this.z / d;
      this.x = nx * R; this.z = nz * R;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) {
        const bounce = this.state === 'hitstun' || this.state === 'ko';
        if (bounce && vn > 7) {
          m.emit('fx', { fx: 'wallHit', x: this.x, y: this.y + 1, z: this.z });
          m.emit('shake', { amt: 0.3 });
        }
        const k = bounce ? 1.4 : 1;
        this.vx -= nx * vn * k;
        this.vz -= nz * vn * k;
      }
    }
  }

  onLand(m, impact) {
    if (this.slammed) {
      // Rabattu au sol : rebond spectaculaire, puis chute
      this.slammed = false;
      if (this.state === 'hitstun') {
        this.vy = 5.5;
        this.onGround = false;
        this.y = 0.01;
        this.kdOnLand = true;
        m.emit('fx', { fx: 'slamLand', x: this.x, y: 0.05, z: this.z });
        m.emit('shake', { amt: 0.7 });
        m.emit('sfx', { name: 'slam' });
        return;
      }
    }
    if (this.state === 'move' && this.move && this.move.dive) {
      m.emit('fx', { fx: 'dust', x: this.x, y: 0.05, z: this.z, big: true });
      m.emit('shake', { amt: 0.3 });
      this.endMove();
      return;
    }
    if (this.state === 'hitstun' && this.kdOnLand) {
      this.setState('knockdown');
      this.kdOnLand = false;
      this.invuln = 0.2;
      m.emit('fx', { fx: 'dust', x: this.x, y: 0.05, z: this.z, big: true });
      m.emit('sfx', { name: 'thud' });
    } else if (this.state === 'ko') {
      m.emit('fx', { fx: 'dust', x: this.x, y: 0.05, z: this.z, big: true });
      if (impact > 4) m.emit('sfx', { name: 'thud' });
    } else if (this.state === 'air') {
      this.setState('land');
      if (impact > 6) m.emit('fx', { fx: 'dust', x: this.x, y: 0.05, z: this.z });
    } else if (this.state === 'move' && this.move && !this.move.air) {
      // rien : les coups au sol continuent
    }
  }
}
