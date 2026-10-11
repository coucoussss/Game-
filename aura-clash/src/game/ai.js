// Intelligence artificielle des combattants contrôlés par l'ordinateur.
// Elle produit exactement la même entrée qu'un joueur (direction + boutons), avec un temps de
// réaction, une probabilité de garde et une agressivité qui dépendent de la difficulté.
import { BTN, MAX_ENERGY } from './constants.js';

export const AI_LEVELS = {
  easy: { label: 'Facile', react: 0.5, aggr: 0.35, block: 0.12, combo: 0.35, special: 0.3, think: 0.45 },
  normal: { label: 'Normal', react: 0.28, aggr: 0.6, block: 0.38, combo: 0.7, special: 0.6, think: 0.3 },
  hard: { label: 'Difficile', react: 0.14, aggr: 0.8, block: 0.68, combo: 0.95, special: 0.9, think: 0.18 },
};

export const DUMMY_MODES = {
  stand: 'Immobile',
  guard: 'Garde permanente',
  jump: 'Saute',
  cpu: 'Combat (IA normale)',
};

export class CpuBrain {
  constructor(fighterId, level = 'normal', dummy = null) {
    this.id = fighterId;
    this.setLevel(level);
    this.dummy = dummy; // mode du mannequin d'entraînement, ou null
    this.thinkT = 0.5;
    this.reactT = 0;
    this.mx = 0;
    this.mz = 0;
    this.hold = 0;
    this.holdT = 0;
    this.pressQueue = [];
    this.strafe = Math.random() < 0.5 ? -1 : 1;
    this.comboT = 0;
  }

  setLevel(level) {
    this.levelId = AI_LEVELS[level] ? level : 'normal';
    this.L = AI_LEVELS[this.levelId];
  }

  press(bit, delay = 0) {
    this.pressQueue.push({ bit, t: delay });
  }

  /** Calcule l'entrée de ce tick. */
  think(m, dt) {
    const me = m.fighter(this.id);
    const out = { mx: 0, mz: 0, held: 0, pressed: 0 };
    if (!me || !me.alive || !m.canAct) { this.pressQueue.length = 0; return out; }

    if (this.dummy && this.dummy !== 'cpu') return this.dummyInput(me, m, dt, out);
    if (!me) return out;

    const t = m.targetFor(me);
    if (!t) return out;
    const dx = t.x - me.x;
    const dz = t.z - me.z;
    const d = Math.hypot(dx, dz) || 1;
    const ux = dx / d;
    const uz = dz / d;
    const L = this.L;
    const def = me.def;
    const range = def.aiRange;

    // --- Réactions défensives (avec temps de réaction) ---
    this.reactT -= dt;
    if (this.reactT <= 0 && me.state !== 'move') {
      const threat = this.detectThreat(me, m);
      if (threat) {
        this.reactT = L.react;
        // Les créatures (hors boss) se protègent moins : elles submergent plutôt qu'elles ne parent
        if (Math.random() < L.block * (!def.monster ? 1 : def.boss ? 0.7 : 0.45)) {
          const r = Math.random();
          if (r < 0.55) { this.hold = BTN.GUARD; this.holdT = 0.45; }
          else if (r < 0.85) {
            // esquive sur le côté
            this.mx = -uz * this.strafe; this.mz = ux * this.strafe;
            this.press(BTN.DODGE);
          } else this.press(BTN.JUMP);
        }
      }
    }

    // --- Décisions offensives ---
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = L.think * (0.6 + Math.random() * 0.8);
      if (this.hold === BTN.CHARGE) this.hold = 0;
      const r = Math.random();
      const tVuln = t.state !== 'knockdown' && t.state !== 'getup';
      const specialCost = me.moveDef('special')?.mv.cost ?? 40;
      if (m.waveList && def.monster && !this.isAssailant(me, t, m)) {
        // Mode Vagues : deux assaillants au plus à la fois ; les autres tournent autour
        // à distance et harcèlent de temps en temps (le joueur n'est pas pris en étau)
        if (d < 4.8) { this.mx = -ux - uz * this.strafe * 0.6; this.mz = -uz + ux * this.strafe * 0.6; }
        else if (d > 7.5) { this.mx = ux * 0.6 - uz * this.strafe; this.mz = uz * 0.6 + ux * this.strafe; }
        else { this.mx = -uz * this.strafe; this.mz = ux * this.strafe; }
        if (Math.random() < 0.1) this.strafe *= -1;
        if (Math.random() < 0.03 + def.aiZoning * 0.04) this.press(BTN.RANGED);
      } else if (me.energy >= MAX_ENERGY && tVuln && d < 11 && r < L.special * 0.45) {
        this.press(BTN.ULT);
      } else if (me.energy >= specialCost + 10 && tVuln && r < L.special * 0.25 && d < 10) {
        this.press(BTN.SPECIAL);
      } else if (d > range + 1.2) {
        // Approche, en tournant un peu autour
        const side = def.aiZoning > 0.5 ? 0.6 : 0.25;
        this.mx = ux + -uz * this.strafe * side;
        this.mz = uz + ux * this.strafe * side;
        if (Math.random() < 0.15) this.strafe *= -1;
        if (Math.random() < def.aiZoning * L.aggr) this.press(BTN.RANGED);
        else if (d > 9 && me.energy < 60 && Math.random() < 0.25) {
          this.hold = BTN.CHARGE; this.holdT = 0.9; this.mx = 0; this.mz = 0;
        }
      } else if (def.aiZoning > 0.5 && d < 3 && Math.random() < 0.45) {
        // Les personnages à distance reculent pour garder l'espace
        this.mx = -ux; this.mz = -uz;
        if (Math.random() < 0.5) this.press(BTN.DODGE);
      } else if (Math.random() < L.aggr) {
        this.mx = ux * 0.3; this.mz = uz * 0.3;
        if (d > range) { this.mx = ux; this.mz = uz; }
        const pick = Math.random();
        if (pick < 0.6) { this.press(BTN.LIGHT); this.comboT = 0.9; }
        else if (pick < 0.82) this.press(BTN.HEAVY);
        else this.press(BTN.RANGED);
      } else {
        // Tourne autour de l'adversaire
        this.mx = -uz * this.strafe; this.mz = ux * this.strafe;
      }
    }

    // --- Poursuite aérienne et frappe plongeante ---
    if (me.pursuitT > 0 && me.onGround && Math.random() < L.combo * dt * 10) {
      this.press(BTN.JUMP);
      this.airCombo = 3;
    }
    if (this.airCombo > 0 && !me.onGround && me.state === 'air' && t.state === 'hitstun' && d < 2.4 && Math.random() < L.combo * dt * 14) {
      this.press(this.airCombo === 1 ? BTN.HEAVY : BTN.LIGHT);
      this.airCombo -= 1;
    }
    if (me.onGround) this.airCombo = 0;

    // --- Enchaînements : continue le combo si le coup a touché ---
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (me.state === 'move' && me.moveHit && me.move && me.move.chain && Math.random() < L.combo * dt * 12) {
        this.press(BTN.LIGHT);
      } else if (me.state === 'move' && me.moveHit && !me.move?.chain && /^light/.test(me.moveId) && Math.random() < L.combo * dt * 6) {
        this.press(Math.random() < 0.6 ? BTN.HEAVY : BTN.SPECIAL);
        this.comboT = 0;
      }
    }

    // --- Sortie ---
    if (this.holdT > 0) {
      this.holdT -= dt;
      out.held |= this.hold;
      if (this.holdT <= 0) this.hold = 0;
    }
    for (const p of this.pressQueue) p.t -= dt;
    const ready = this.pressQueue.filter((p) => p.t <= 0);
    this.pressQueue = this.pressQueue.filter((p) => p.t > 0);
    for (const p of ready) out.pressed |= p.bit;
    out.held |= out.pressed;
    if (!(out.held & (BTN.GUARD | BTN.CHARGE))) {
      const l = Math.hypot(this.mx, this.mz);
      out.mx = l > 1 ? this.mx / l : this.mx;
      out.mz = l > 1 ? this.mz / l : this.mz;
    }
    return out;
  }

  /**
   * Mode Vagues : a-t-on le droit d'attaquer maintenant ? Un boss attaque toujours ; un démon ou un
   * monstre seulement s'il est le plus proche de la cible ; les fléaux mineurs, à deux.
   */
  isAssailant(me, t, m) {
    if (me.def.boss) return true;
    const d = (f) => (f.x - t.x) ** 2 + (f.z - t.z) ** 2;
    const mine = d(me);
    let closer = 0;
    for (const f of m.fighters) {
      if (f === me || f.team !== me.team || !f.alive || f.gone) continue;
      if (f.def.boss || d(f) < mine) closer++;
    }
    return closer < (me.def.tier === 1 ? 2 : 1);
  }

  /** Un coup ou un projectile adverse arrive-t-il sur nous ? */
  detectThreat(me, m) {
    for (const f of m.fighters) {
      if (f.team === me.team || !f.alive) continue;
      const d = Math.hypot(f.x - me.x, f.z - me.z);
      if (f.state === 'move' && d < 3.2 && f.mt < 0.12) return true;
    }
    for (const e of m.entities) {
      if (e.team === me.team) continue;
      if (e.kind === 'proj') {
        const rx = me.x - e.x;
        const rz = me.z - e.z;
        const d = Math.hypot(rx, rz);
        if (d < 7 && rx * e.vx + rz * e.vz > 0) return true;
      } else if (e.kind === 'aoe' && !e.done && Math.hypot(me.x - e.x, me.z - e.z) < e.r + 0.5) {
        return true;
      }
    }
    return false;
  }

  dummyInput(me, m, dt, out) {
    if (this.dummy === 'attack') {
      // Mannequin d'entraînement offensif (tutoriel) : s'approche et frappe à intervalles réguliers
      const t = m.targetFor(me);
      if (!t) return out;
      const dx = t.x - me.x;
      const dz = t.z - me.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > 1.8) { out.mx = dx / d * 0.7; out.mz = dz / d * 0.7; }
      this.thinkT -= dt;
      if (this.thinkT <= 0 && d < 2.4 && me.state !== 'move') {
        this.thinkT = 1.6;
        out.pressed = BTN.LIGHT;
        out.held = BTN.LIGHT;
      }
      return out;
    }
    if (this.dummy === 'guard') {
      if (me.state === 'guard' || me.state === 'idle' || me.state === 'walk' || me.state === 'blockstun') out.held = BTN.GUARD;
    } else if (this.dummy === 'jump') {
      this.thinkT -= dt;
      if (this.thinkT <= 0) { this.thinkT = 1.1; out.pressed = BTN.JUMP; out.held = BTN.JUMP; }
    }
    return out;
  }
}
