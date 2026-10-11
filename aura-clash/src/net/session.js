// Réseau local, côté jeu : connexion WebSocket au serveur embarqué, instantanés de l'état
// (snapshots) envoyés par l'hôte, et leur interpolation chez les invités.
//
// Compensation de latence :
//  - les adversaires sont affichés avec un léger retard (≈ latence/2 + 50 ms) et interpolés entre
//    deux instantanés : le mouvement reste fluide malgré la gigue du réseau ;
//  - son propre personnage est prédit localement (déplacement immédiat), puis recalé en douceur sur
//    la position autoritaire de l'hôte ;
//  - les appuis de touches sont cumulés entre deux envois : aucun appui bref n'est perdu.

export const NET_PROTOCOL = 1;
export const LAN_PORT = 41234;

export function parseAddress(text) {
  const t = String(text || '').trim().replace(/^wss?:\/\//, '').replace(/\/.*$/, '');
  if (!t) return null;
  const m = t.match(/^\[?([^\]]+?)\]?(?::(\d+))?$/);
  if (!m) return null;
  return { host: m[1], port: m[2] ? Number(m[2]) : LAN_PORT };
}

export class NetClient {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.id = 0;
    this.isHost = false;
    this.rtt = 0;
    this.pingTimer = null;
    this.closed = false;
  }

  on(type, fn) {
    this.handlers.set(type, fn);
  }

  emit(type, msg) {
    const h = this.handlers.get(type);
    if (h) h(msg);
  }

  connect(host, port, { name, token } = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (reason) => {
        if (settled) return;
        settled = true;
        try { this.ws.close(); } catch { /* ignoré */ }
        reject(new Error(reason));
      };
      let ws;
      try {
        ws = new WebSocket(`ws://${host.includes(':') ? `[${host}]` : host}:${port}`);
      } catch {
        fail('Adresse invalide.');
        return;
      }
      this.ws = ws;
      const timeout = setTimeout(() => fail('Pas de réponse : vérifie l’adresse IP, que l’hôte a bien créé la partie, et le pare-feu Windows.'), 6000);
      ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', name, token, protocol: NET_PROTOCOL }));
      ws.onerror = () => { clearTimeout(timeout); fail('Connexion impossible : vérifie l’adresse IP et le pare-feu Windows de l’hôte.'); };
      ws.onclose = () => {
        clearInterval(this.pingTimer);
        if (!settled) { clearTimeout(timeout); fail('Connexion refusée.'); return; }
        if (!this.closed) this.emit('disconnect', {});
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'welcome') {
          clearTimeout(timeout);
          settled = true;
          this.id = msg.id;
          this.isHost = msg.isHost;
          this.serverName = msg.serverName;
          this.pingTimer = setInterval(() => this.send({ type: 'ping', t: performance.now() }), 1000);
          resolve(msg);
          return;
        }
        if (msg.type === 'reject') {
          clearTimeout(timeout);
          if (!settled) { fail(msg.reason || 'Connexion refusée.'); return; }
          this.emit('reject', msg);
          return;
        }
        if (msg.type === 'pong') {
          const r = performance.now() - msg.t;
          this.rtt = this.rtt ? this.rtt * 0.7 + r * 0.3 : r;
          return;
        }
        this.emit(msg.type, msg);
      };
    });
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() {
    this.closed = true;
    clearInterval(this.pingTimer);
    if (this.ws) { try { this.ws.close(); } catch { /* ignoré */ } }
    this.ws = null;
  }
}

// --- Instantanés -------------------------------------------------------------------------------

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

const ENT_FIELDS = ['kind', 'type', 'owner', 'team', 'r', 'maxR', 'len', 'width', 'dur', 'delay', 'color', 'done', 'yaw', 'pitch', 'dy', 'dx', 'dz', 'vx', 'vy', 'vz'];

/** Instantané compact de l'état d'un match (envoyé par l'hôte ~30 fois par seconde). */
export function encodeSnapshot(m, events, tick) {
  return {
    type: 'snap',
    k: tick,
    t: r3(m.time),
    ph: m.phase,
    rd: m.round,
    w: m.wins,
    tm: r2(m.timer),
    hs: m.hitstop > 0 ? 1 : 0,
    cn: m.cine ? [m.cine.id, r3(m.cine.t), m.cine.dur] : 0,
    f: m.fighters.map((f) => ({
      x: r2(f.x), y: r2(f.y), z: r2(f.z), a: r3(f.yaw), vx: r2(f.vx), vy: r2(f.vy), vz: r2(f.vz),
      s: f.state, st: r3(f.st), m: f.moveId, mt: r3(f.mt), hp: Math.round(f.hp), en: r2(f.energy), g: Math.round(f.guardHp),
      tr: f.transformT > 0 ? 1 : 0, og: f.onGround ? 1 : 0, fl: f.flash > 0 ? 1 : 0,
    })),
    e: m.entities.map((e) => {
      const o = { id: e.id, x: r2(e.x), y: r2(e.y), z: r2(e.z), t: r3(e.t) };
      for (const k of ENT_FIELDS) {
        const v = e[k];
        if (v === undefined || v === null) continue;
        o[k] = typeof v === 'number' ? r3(v) : v;
      }
      if (e.zone) o.zone = { dur: e.zone.dur };
      return o;
    }),
    ev: events,
  };
}

const lerp = (a, b, k) => a + (b - a) * k;
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/**
 * État reconstruit chez un invité à partir des instantanés de l'hôte.
 * Expose la même forme que Match (fighters, entities, timer, wins, phase, cine) pour l'affichage.
 */
export class RemoteState {
  constructor(fighterDefs) {
    this.fighters = fighterDefs.map((d, i) => ({
      id: i, charId: d.charId, team: d.team, maxHp: d.maxHp, hp: d.maxHp, energy: 0, guardHp: 100,
      x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, state: 'idle', st: 0, moveId: '', mt: 0,
      onGround: true, transformed: false, flash: 0,
      get alive() { return this.state !== 'ko'; },
    }));
    this.entities = [];
    this.buffer = [];
    this.timer = 99;
    this.wins = [0, 0];
    this.phase = 'intro';
    this.round = 1;
    this.cine = null;
    this.hitstop = 0;
    this.offset = null; // temps serveur − temps local (s)
    this.pendingEvents = [];
    this.predicted = null;
    this.localId = -1;
  }

  push(snap) {
    const now = performance.now() / 1000;
    const off = snap.t - now;
    // Décalage d'horloge : on suit le plus récent sans se laisser secouer par la gigue
    this.offset = this.offset === null ? off : Math.max(off, this.offset + (off - this.offset) * 0.05);
    this.buffer.push(snap);
    if (this.buffer.length > 40) this.buffer.shift();
    for (const ev of snap.ev || []) this.pendingEvents.push({ t: snap.t, ev });
  }

  /** Événements dont l'heure est passée (le décor et les sons restent synchrones avec l'affichage). */
  takeEvents(renderT) {
    const out = [];
    while (this.pendingEvents.length && this.pendingEvents[0].t <= renderT + 0.02) out.push(this.pendingEvents.shift().ev);
    // Garde-fou : on ne laisse pas s'accumuler des événements trop anciens
    if (this.pendingEvents.length > 300) out.push(...this.pendingEvents.splice(0).map((p) => p.ev));
    return out;
  }

  /**
   * Met à jour l'état affiché. `delay` : retard d'interpolation (s).
   * `localInput` : { mx, mz } du joueur local, pour la prédiction de son personnage.
   */
  sample(dt, delay, localInput, speedOf) {
    if (!this.buffer.length || this.offset === null) return [];
    const now = performance.now() / 1000;
    const renderT = now + this.offset - delay;
    let a = this.buffer[0];
    let b = this.buffer[this.buffer.length - 1];
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].t <= renderT && this.buffer[i + 1].t >= renderT) { a = this.buffer[i]; b = this.buffer[i + 1]; break; }
    }
    if (renderT > b.t) a = b;
    const span = b.t - a.t;
    const k = span > 1e-4 ? Math.max(0, Math.min(1, (renderT - a.t) / span)) : 1;
    const latest = this.buffer[this.buffer.length - 1];

    this.fighters.forEach((f, i) => {
      const fa = a.f[i];
      const fb = b.f[i];
      if (!fa || !fb) return;
      f.x = lerp(fa.x, fb.x, k); f.y = lerp(fa.y, fb.y, k); f.z = lerp(fa.z, fb.z, k);
      f.yaw = lerpAngle(fa.a, fb.a, k);
      f.vx = fb.vx; f.vy = fb.vy; f.vz = fb.vz;
      f.state = fb.s; f.st = fb.st; f.moveId = fb.m; f.mt = fa.m === fb.m ? lerp(fa.mt, fb.mt, k) : fb.mt;
      f.hp = fb.hp; f.energy = fb.en; f.guardHp = fb.g;
      f.transformed = !!fb.tr; f.onGround = !!fb.og; f.flash = fb.fl ? 0.1 : 0;
      if (i === this.localId) this.predict(f, latest.f[i], dt, localInput, speedOf, now + this.offset - latest.t);
    });

    // Entités : interpolées si présentes dans les deux instantanés
    const mapA = new Map(a.e.map((e) => [e.id, e]));
    this.entities = b.e.map((eb) => {
      const ea = mapA.get(eb.id);
      if (!ea) return { ...eb };
      return { ...eb, x: lerp(ea.x, eb.x, k), y: lerp(ea.y, eb.y, k), z: lerp(ea.z, eb.z, k), t: lerp(ea.t, eb.t, k), r: eb.r != null && ea.r != null ? lerp(ea.r, eb.r, k) : eb.r, len: eb.len != null && ea.len != null ? lerp(ea.len, eb.len, k) : eb.len };
    });
    this.timer = b.tm;
    this.wins = b.w;
    this.phase = b.ph;
    this.round = b.rd;
    this.hitstop = b.hs;
    this.cine = b.cn ? { id: b.cn[0], t: b.cn[1], dur: b.cn[2] } : null;
    return this.takeEvents(renderT);
  }

  /** Prédiction du personnage local : déplacement immédiat, recalage progressif sur l'hôte. */
  predict(f, auth, dt, inp, speedOf, ahead) {
    const ax = auth.x + auth.vx * Math.min(0.2, ahead);
    const az = auth.z + auth.vz * Math.min(0.2, ahead);
    if (!this.predicted) this.predicted = { x: ax, z: az };
    const p = this.predicted;
    const free = (auth.s === 'idle' || auth.s === 'walk') && auth.og;
    if (free && inp) {
      const sp = speedOf(f);
      p.x += inp.mx * sp * dt;
      p.z += inp.mz * sp * dt;
    } else {
      p.x = ax; p.z = az;
    }
    const err = Math.hypot(ax - p.x, az - p.z);
    if (err > 2.5) { p.x = ax; p.z = az; }
    const kk = 1 - Math.exp(-dt * (free ? 6 : 20));
    p.x += (ax - p.x) * kk;
    p.z += (az - p.z) * kk;
    f.x = p.x; f.z = p.z;
    f.y = auth.y; f.yaw = auth.a;
    f.state = auth.s; f.st = auth.st; f.moveId = auth.m; f.mt = auth.mt;
  }
}
