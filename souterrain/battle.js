'use strict';
// ============================================================
//  battle.js : moteur de combat générique (façon Undertale)
// ============================================================
const MON = {};               // définitions des monstres et boss (monsters.js, bosses.js)
const BOX0 = { w: 575, h: 140, cx: 319.5, cy: 320 };
const HB = 4;                 // demi-taille de la zone de collision de l'âme
const ORANGE = COL.orange, YELLOW = COL.yellow;
let B = null;                 // état du combat en cours

// ---------- Boîte ----------
function mkBox(w, h, cx = 320, cy = 320) { return { l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 }; }
const boxOf = b => ({ l: b.l, r: b.r, t: b.t, b: b.b, w: b.r - b.l, h: b.b - b.t, cx: (b.l + b.r) / 2, cy: (b.t + b.b) / 2 });
function boxReady() { const a = B.box, t = B.boxT; return Math.abs(a.l - t.l) < 0.5 && Math.abs(a.r - t.r) < 0.5 && Math.abs(a.t - t.t) < 0.5 && Math.abs(a.b - t.b) < 0.5; }
function setBox(w, h, cx = 320, cy = 320) { B.boxT = mkBox(w, h, cx, cy); }
function menuBox() { B.boxT = mkBox(BOX0.w, BOX0.h, BOX0.cx, BOX0.cy); }
function updateBox(dt) { const b = B.box, t = B.boxT, sp = 1100 * dt; for (const e of ['l', 'r', 't', 'b']) b[e] += clamp(t[e] - b[e], -sp, sp); }
function drawBox() {
  const b = B.box, x = Math.round(b.l), y = Math.round(b.t), w = Math.round(b.r - b.l), h = Math.round(b.b - b.t);
  ctx.fillStyle = B.boxColor || '#fff'; ctx.fillRect(x - 5, y - 5, w + 10, h + 10);
  ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
}

// ---------- Âme ----------
const GDIR = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const JUMPKEY = { down: 'up', up: 'down', left: 'right', right: 'left' };
const SH_ANG = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
function setSoul(mode, o = {}) {
  const s = B.soul, prev = s.mode;
  s.mode = mode; s.grav = o.grav || 'down'; s.gv = 0; s.thrown = false; s.plat = null; s.grounded = false;
  if (mode === 'green') { s.shield = 0; s.ang = 0; }
  if (mode === 'purple') { s.lane = 1; }
  if (prev !== mode && !o.silent) { Snd.ding(); s.flash = 0.25; }
}
function slamSoul(d) { const s = B.soul; setSoul('blue', { grav: d, silent: true }); s.thrown = true; s.gv = 1100; Snd.whoosh(); }
function lanes() { const k = boxOf(B.box); return [k.t + k.h * 0.22, k.cy, k.b - k.h * 0.22]; }
function updateSoul(dt) {
  const s = B.soul, b = B.box, px = s.x, py = s.y;
  const L = (down('right') ? 1 : 0) - (down('left') ? 1 : 0), U = (down('down') ? 1 : 0) - (down('up') ? 1 : 0);
  const SP = (G.speed || 150) * (down('x') ? 0.5 : 1);
  s.flash = Math.max(0, s.flash - dt);
  if (s.mode === 'red' || s.mode === 'yellow') {
    s.x += L * SP * dt; s.y += U * SP * dt;
    if (s.mode === 'yellow') { s.cool -= dt; if (hit('z') && s.cool <= 0) { s.cool = 0.12; B.shots.push({ x: s.x, y: s.y - 8, vy: -520 }); Snd.shoot(); } }
  } else if (s.mode === 'green') {
    if (hit('up')) s.shield = 0; else if (hit('right')) s.shield = 1; else if (hit('down')) s.shield = 2; else if (hit('left')) s.shield = 3;
    let d = SH_ANG[s.shield] - s.ang; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    s.ang += d * Math.min(1, dt * 28);
    const k = boxOf(b); s.x = k.cx; s.y = k.cy;
  } else if (s.mode === 'purple') {
    if (hit('up') && s.lane > 0) s.lane--; if (hit('down') && s.lane < 2) s.lane++;
    s.x += L * SP * dt;
    const ty = lanes()[s.lane]; s.y += clamp(ty - s.y, -900 * dt, 900 * dt);
  } else if (s.mode === 'blue') {
    const [gx, gy] = GDIR[s.grav], vert = gy !== 0, jk = JUMPKEY[s.grav];
    if (vert) s.x += L * SP * dt; else s.y += U * SP * dt;
    if (s.thrown) s.gv = 1100;
    else {
      if (s.grounded && down(jk)) { s.gv = -330; s.grounded = false; s.plat = null; }
      if (!s.grounded) { if (s.gv < -60 && !down(jk)) s.gv = -60; s.gv = Math.min(s.gv + 820 * dt, 520); }
    }
    if (s.plat) {
      const p = s.plat;
      if (p.dead || s.x + 6 < p.x || s.x - 6 > p.x + p.w) { s.plat = null; s.grounded = false; }
      else { s.x += p.vx * dt; s.y = p.y - 8; s.gv = 0; }
    }
    if (!s.grounded) { s.x += gx * s.gv * dt; s.y += gy * s.gv * dt; }
    if (s.grav === 'down' && !s.grounded && s.gv >= 0) {
      for (const p of B.bullets) {
        if (p.kind !== 'plat') continue;
        if (py + 8 <= p.y + 1 && s.y + 8 >= p.y && s.x + 6 > p.x && s.x - 6 < p.x + p.w) { s.y = p.y - 8; s.gv = 0; s.grounded = true; s.plat = p; s.thrown = false; break; }
      }
    }
  }
  if (s.mode !== 'green') { s.x = clamp(s.x, b.l + 8, b.r - 8); s.y = clamp(s.y, b.t + 8, b.b - 8); }
  if (s.mode === 'blue') {
    const g = s.grav;
    const onWall = g === 'down' ? s.y >= b.b - 8.01 : g === 'up' ? s.y <= b.t + 8.01 : g === 'left' ? s.x <= b.l + 8.01 : s.x >= b.r - 8.01;
    const onCeil = g === 'down' ? s.y <= b.t + 8.01 : g === 'up' ? s.y >= b.b - 8.01 : g === 'left' ? s.x >= b.r - 8.01 : s.x <= b.l + 8.01;
    if (onWall && s.gv >= 0) { if (s.thrown) { s.thrown = false; Snd.slam(); shake = Math.max(shake, 4); } s.gv = 0; s.grounded = true; s.plat = null; }
    else if (!s.plat && !onWall) s.grounded = false;
    if (onCeil && s.gv < 0) s.gv = 0;
  }
  s.moved = Math.abs(s.x - px) + Math.abs(s.y - py) > 0.05;
}
function drawSoul() {
  const s = B.soul;
  if (!s.visible) return;
  if (s.inv > 0 && Math.floor(s.inv * 15) % 2 === 0) return;
  if (s.mode === 'green' && B.phase === 'attack') {
    ctx.save(); ctx.translate(Math.round(s.x), Math.round(s.y));
    ctx.strokeStyle = '#1a6b1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.stroke();
    ctx.rotate(s.ang); ctx.drawImage(SHIELD, -32, -32);
    if (s.blockFlash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(SHIELD, -32, -32); }
    ctx.restore();
  }
  if (s.mode === 'purple' && B.phase === 'attack') {
    const k = boxOf(B.box);
    ctx.fillStyle = '#d535d9';
    for (const y of lanes()) ctx.fillRect(k.l, Math.round(y) - 1, k.w, 2);
  }
  const col = s.flash > 0 ? 'white' : s.mode;
  if (s.mode === 'yellow') drawHeart(s.x, s.y, 'yellow', { img: HEART.upside });
  else drawHeart(s.x, s.y, col);
}
const SHIELD = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const dx = x + 0.5 - 32, dy = y + 0.5 - 32, r = Math.hypot(dx, dy), a = Math.atan2(dx, -dy);
    if (Math.abs(a) > 0.95) continue;
    if (r >= 21 && r < 25) { g.fillStyle = r < 22 ? '#a8c8ff' : r >= 24 ? '#1030c0' : '#3366ff'; g.fillRect(x, y, 1, 1); }
  }
  return c;
})();

// ---------- Dégâts reçus ----------
function hurtSoul(b) {
  const s = B.soul;
  if (b.color === 'green') { if (!b.used) { b.used = true; b.dead = true; G.hp = Math.min(maxHP(), G.hp + (b.heal || 1)); Snd.heal(); } return; }
  if (B.kr) { // KARMA (combat contre Sans)
    if (B.hurtCD > 0) return;
    B.hurtCD = G.flags.easy ? 1 / 12 : 1 / 30;
    G.hp -= 1; B.krv = Math.min(40, B.krv + (b.kr || 1)); B.krv = Math.min(B.krv, Math.max(0, G.hp - 1));
    B.hits++; Snd.hurt();
    if (G.hp <= 0) die();
    return;
  }
  if (s.inv > 0) return;
  const atk = b.dmg ?? (b.owner ? b.owner.atk : 3);
  let dmg = Math.max(1, Math.round(atk - aDF() / 5 - (defStat() - 10) / 3));
  if (G.flags.easy) dmg = Math.max(1, Math.ceil(dmg / 2));
  G.hp = Math.max(0, G.hp - dmg);
  s.inv = b.inv ?? 0.9; B.hits++;
  Snd.hurt(); shake = Math.max(shake, 3);
  if (b.onHit) b.onHit(b);
  if (G.hp <= 0) die();
}
function krTick(dt) {
  if (B.krv <= 0) { B.krv = 0; return; }
  B.krT += dt;
  const kr = B.krv, iv = kr >= 40 ? 1 / 30 : kr >= 30 ? 2 / 30 : kr >= 20 ? 5 / 30 : kr >= 10 ? 15 / 30 : 1;
  if (B.krT >= iv) { B.krT = 0; if (G.hp > 1) { G.hp--; B.krv = Math.max(0, B.krv - 1); } else B.krv = 0; }
}
function die() {
  if (B.def.onDeath) { B.def.onDeath(B); return; }
  if (B.noDeath) { G.hp = 1; return; }
  if (B.dead) return;
  B.dead = true;
  B.deathX = B.soul.x; B.deathY = B.soul.y;
  startGameOver(B.deathX, B.deathY, B.goLines);
}

// ---------- Projectiles ----------
function bul(o) {
  return { x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, r: 5, rot: 0, vr: 0, life: 20, t: 0, color: 'white', clip: true, sc: 1, alpha: 1, ...o };
}
function updBullet(b, dt) {
  b.t += dt;
  if (b.delay > 0) { b.delay -= dt; return; }
  if (b.upd) b.upd(b, dt);
  b.vx += b.ax * dt; b.vy += b.ay * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
  b.life -= dt;
  if (b.life <= 0 || b.x < -400 || b.x > W + 400 || b.y < -400 || b.y > H + 400) b.dead = true;
}
function bulletHits(b, s) {
  if (b.delay > 0 || b.harmless || b.dead) return false;
  if (b.hit) return b.hit(b, s);
  if (b.w) return overlap(b.x - b.w / 2 + 1, b.y - b.h / 2 + 1, b.w - 2, b.h - 2, s.x - HB, s.y - HB, HB * 2, HB * 2);
  return Math.hypot(b.x - s.x, b.y - s.y) < b.r + HB - 1;
}
function drawBullet(b) {
  if (b.delay > 0 || b.hide) return;
  if (b.draw) { b.draw(b); return; }
  ctx.save(); ctx.globalAlpha = b.alpha;
  ctx.translate(Math.round(b.x), Math.round(b.y));
  if (b.rot) ctx.rotate(b.rot);
  if (b.img) {
    let img = typeof b.img === 'string' ? shape(b.img) : b.img;
    if (b.color === 'blue') img = tinted(img, COL.blue); else if (b.color === 'orange') img = tinted(img, ORANGE); else if (b.color === 'green') img = tinted(img, '#00ff00'); else if (b.tint) img = tinted(img, b.tint);
    const s = b.sc * 2;
    ctx.drawImage(img, Math.round(-img.width * s / 2), Math.round(-img.height * s / 2), img.width * s, img.height * s);
  } else if (b.w) {
    ctx.fillStyle = b.color === 'blue' ? COL.blue : b.color === 'orange' ? ORANGE : b.fill || '#fff';
    ctx.fillRect(Math.round(-b.w / 2), Math.round(-b.h / 2), b.w, b.h);
  } else {
    ctx.fillStyle = b.color === 'blue' ? COL.blue : b.color === 'orange' ? ORANGE : b.color === 'green' ? '#00ff00' : b.fill || '#fff';
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
// Os (style Papyrus / Sans)
function circ(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function drawBone(x, y, w, h, color) {
  ctx.fillStyle = color === 'blue' ? COL.blue : color === 'orange' ? ORANGE : '#fff';
  if (h >= w) { const r = w * 0.31; ctx.fillRect(x + w * 0.2, y + r, w * 0.6, Math.max(0, h - 2 * r)); for (const yy of [y + r, y + h - r]) { circ(x + r, yy, r); circ(x + w - r, yy, r); } }
  else { const r = h * 0.31; ctx.fillRect(x + r, y + h * 0.2, Math.max(0, w - 2 * r), h * 0.6); for (const xx of [x + r, x + w - r]) { circ(xx, y + r, r); circ(xx, y + h - r, r); } }
}
function mkBone(o) {
  const b = bul({ kind: 'bone', w: 10, h: 40, life: 20, ...o });
  b.hit = (b, s) => overlap(b.x + 1, b.y + 1, b.w - 2, b.h - 2, s.x - HB, s.y - HB, HB * 2, HB * 2);
  b.draw = b => drawBone(b.x, b.y, b.w, b.h, b.color);
  return b;
}
function mkPlat(x, y, w, vx) {
  return bul({ kind: 'plat', harmless: true, x, y, w, h: 8, vx, life: 30, hit: () => false,
    draw(b) { ctx.fillStyle = '#000'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeStyle = '#2aff2a'; ctx.lineWidth = 2; ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2); ctx.fillStyle = '#fff'; ctx.fillRect(b.x + 1, b.y, b.w - 2, 2); } });
}
// Lance (style Undyne). (x, y) = pointe
function spearImg(main, dark, light) {
  const c = document.createElement('canvas'); c.width = 54; c.height = 13;
  const g = c.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let x = 3; x < 38; x++) { px(x, 5, dark); px(x, 6, main); px(x, 7, main); px(x, 8, dark); }
  for (let x = 6; x < 36; x++) if (x % 9 === 0) px(x, 6, light);
  for (let k = 0; k < 4; k++) { px(k, 4 - (k >> 1), main); px(k, 9 + (k >> 1), main); px(k, 6, main); px(k, 7, main); }
  const hw = [2, 3, 4, 5, 5, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0];
  for (let i = 0; i < hw.length; i++) { const x = 38 + i; for (let dy = -hw[i]; dy <= hw[i] + 1; dy++) px(x, 6 + dy, dy === -hw[i] || dy === hw[i] + 1 ? dark : main); if (i < 13) px(x, 6, light); }
  return c;
}
const SPEARS = { white: spearImg('#ffffff', '#6cc8f0', '#c8f6ff'), blue: spearImg('#5fe9ff', '#1180d0', '#ffffff'), hot: spearImg('#9ff4ff', '#ffffff', '#ffffff') };
function drawSpear(x, y, ang, alpha = 1, img = SPEARS.blue) { ctx.save(); ctx.globalAlpha = alpha; ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(ang); ctx.drawImage(img, -53, -6); ctx.restore(); }
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
function spearHit(b, s) { const tx = b.x - Math.cos(b.ang) * 48, ty = b.y - Math.sin(b.ang) * 48; return segDist(s.x, s.y, b.x - Math.cos(b.ang) * 2, b.y - Math.sin(b.ang) * 2, tx, ty) < 7; }
function mkSpear(o) {
  const b = bul({ kind: 'spear', ang: 0, clip: false, img: null, life: 8, ...o });
  b.hit = spearHit;
  b.draw = b => drawSpear(b.x, b.y, b.ang, b.alpha, b.simg || SPEARS.blue);
  return b;
}
// Flèche du mode vert : arrive d'une direction (0 haut, 1 droite, 2 bas, 3 gauche)
const DIRA = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
function arrowImg(main, dark) {
  const c = document.createElement('canvas'); c.width = 38; c.height = 15;
  const g = c.getContext('2d'); const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  for (let x = 0; x < 24; x++) { px(x, 6, dark); px(x, 7, main); px(x, 8, dark); }
  for (let i = 0; i <= 13; i++) { const h = Math.round((13 - i) * 0.5); for (let dy = -h; dy <= h; dy++) px(24 + i, 7 + dy, Math.abs(dy) === h ? dark : main); }
  px(37, 7, '#fff'); px(36, 7, '#fff'); px(35, 7, '#fff');
  for (let k = 0; k < 6; k++) { px(k, 5 - (k >> 1), main); px(k, 9 + (k >> 1), main); }
  return c;
}
const ARROWS = { b: arrowImg('#40d0ff', '#0a6ac0'), y: arrowImg('#ffff30', '#c08000'), f: arrowImg('#e6fbff', '#3aa0e0'), r: arrowImg('#ff5050', '#901010') };
function mkArrow(dir, kind, v, delay = 0) {
  const FLIP = 0.24, FLIP_AT = 96;
  const b = bul({ kind: 'arrow', clip: false, dir: kind === 'y' ? (dir + 2) % 4 : dir, arrive: dir, d: 300, v, akind: kind, flip: -1, delay, life: 30 });
  b.pos = () => {
    let a = DIRA[b.dir]; if (b.flip >= 0) a += Math.PI * (b.flip / FLIP);
    const s = B.soul; return { x: s.x + Math.cos(a) * b.d, y: s.y + Math.sin(a) * b.d, ang: a + Math.PI };
  };
  b.upd = (b, dt) => {
    if (b.flip >= 0) { b.flip += dt; if (b.flip >= FLIP) { b.flip = -2; b.dir = b.arrive; } return; }
    b.d -= b.v * dt;
    if (b.akind === 'y' && b.flip === -1 && b.d <= FLIP_AT) { b.d = FLIP_AT; b.flip = 0; return; }
    const s = B.soul;
    if (b.d <= 27 && s.shield === b.dir) {
      b.dead = true; Snd.block(); s.blockFlash = 0.15;
      const p = b.pos(); for (let i = 0; i < 5; i++) B.fx.push({ kind: 'spark', x: p.x, y: p.y, vx: rand(-90, 90), vy: rand(-90, 90), t: 0, life: 0.25 });
    } else if (b.d <= 8) { b.dead = true; hurtSoul(b); }
  };
  b.hit = () => false;
  b.draw = b => { const p = b.pos(); ctx.save(); ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(p.ang); ctx.drawImage(ARROWS[b.akind], -37, -7); ctx.restore(); };
  return b;
}
// Gaster Blaster (style Sans)
function mkBlaster(tx, ty, ang, o = {}) {
  const size = o.size || 2, delay = o.delay ?? 0.62, fire = o.fire ?? 0.32, full = 18 * size;
  const a0 = ang + (Math.random() < 0.5 ? 1 : -1) * 0.7;
  const sx = tx - Math.cos(a0) * 260, sy = ty - Math.sin(a0) * 260;
  const b = bul({ kind: 'blaster', clip: false, t: 0, x: sx, y: sy, rot: ang + Math.PI, bw: 0, kr: 2, v: 0, open: 0, life: 9, dmg: o.dmg });
  Snd.blCharge();
  b.mouth = () => ({ x: b.x + Math.cos(ang) * (17 + b.open * 3) * size, y: b.y + Math.sin(ang) * (17 + b.open * 3) * size });
  b.upd = (b, dt) => {
    b.vx = 0; b.vy = 0;
    if (b.t < 0.32) { const p = ease(b.t / 0.32); b.x = lerp(sx, tx, p); b.y = lerp(sy, ty, p); b.rot = lerp(ang + Math.PI, ang, p); } else b.rot = ang;
    b.open = b.t < delay - 0.15 ? 0 : b.t < delay ? (b.t - delay + 0.15) / 0.15 : 1;
    if (b.t >= delay) {
      if (!b.fired) { b.fired = true; Snd.blFire(); shake = Math.max(shake, 4); }
      const ft = b.t - delay;
      if (ft < 0.06) b.bw = full * ft / 0.06; else if (ft < fire) b.bw = full * (1 + 0.1 * Math.sin(ft * 70)); else if (ft < fire + 0.3) b.bw = full * (1 - (ft - fire) / 0.3); else b.dead = true;
      if (ft > 0.04) { b.v += 1100 * dt; b.x -= Math.cos(ang) * b.v * dt; b.y -= Math.sin(ang) * b.v * dt; }
    }
  };
  b.hit = (b, s) => {
    if (b.bw < full * 0.4) return false;
    const m = b.mouth(), dx = s.x - m.x, dy = s.y - m.y;
    return dx * Math.cos(ang) + dy * Math.sin(ang) > -6 && Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang)) < b.bw / 2 - 2 + HB * 0.5;
  };
  b.draw = b => {
    if (b.bw > 0.5) {
      const m = b.mouth();
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(160,220,255,0.35)'; ctx.fillRect(0, -b.bw * 0.7, 1500, b.bw * 1.4);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, -b.bw / 2, 1500, b.bw); circ(2, 0, b.bw / 2);
      ctx.restore();
    }
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot - Math.PI / 2);
    const s = size * (b.t < 0.32 ? 0.6 + 0.4 * ease(b.t / 0.32) : 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(shape('blJaw'), -20 * s, (15 + b.open * 7) * s, 40 * s, 10 * s);
    ctx.drawImage(shape(b.open > 0.5 ? 'blTopOpen' : 'blTop'), -20 * s, -17 * s, 40 * s, 34 * s);
    ctx.restore();
  };
  return b;
}
// Rayon laser vertical/horizontal avec avertissement (Mettaton, Astigmatism…)
function mkLaser(o) {
  const b = bul({ kind: 'laser', clip: true, warn: 0.6, on: 0.4, thick: 14, life: 5, ...o });
  b.upd = (b) => { if (b.t > b.warn + b.on) b.dead = true; if (!b.snd && b.t > b.warn) { b.snd = 1; Snd.laser(); } };
  b.hit = (b, s) => {
    if (b.t < b.warn) return false;
    if (b.vert) return Math.abs(s.x - b.x) < b.thick / 2 + HB - 1;
    return Math.abs(s.y - b.y) < b.thick / 2 + HB - 1;
  };
  b.draw = b => {
    const k = boxOf(B.box);
    if (b.t < b.warn) { if (Math.floor(b.t * 14) % 2) return; ctx.strokeStyle = b.color === 'blue' ? COL.blue : b.color === 'orange' ? ORANGE : '#ff3030'; ctx.lineWidth = 2; }
    else ctx.fillStyle = b.color === 'blue' ? COL.blue : b.color === 'orange' ? ORANGE : '#fff';
    if (b.vert) { if (b.t < b.warn) ctx.strokeRect(b.x - b.thick / 2, k.t, b.thick, k.h); else ctx.fillRect(b.x - b.thick / 2, k.t, b.thick, k.h); }
    else { if (b.t < b.warn) ctx.strokeRect(k.l, b.y - b.thick / 2, k.w, b.thick); else ctx.fillRect(k.l, b.y - b.thick / 2, k.w, b.thick); }
  };
  return b;
}

// ---------- Lanceur d'attaques ----------
class Runner {
  constructor(E) { this.E = E; this.t = 0; this.ev = []; this.dur = 5; this.bw = 160; this.bh = 140; this.mode = 'red'; this.opts = {}; }
  get k() { return boxOf(B.box); }
  get s() { return B.soul; }
  at(t, fn) { let i = this.ev.length; while (i > 0 && this.ev[i - 1].t > t) i--; this.ev.splice(i, 0, { t, fn }); return this; }
  every(t0, t1, dt, fn) { let i = 0; for (let t = t0; t < t1 - 1e-9; t += dt) { const j = i++; this.at(t, () => fn(j)); } return this; }
  update(dt) { this.t += dt; while (this.ev.length && this.ev[0].t <= this.t) this.ev.shift().fn(this.k); }
  box(w, h, cx = 320, cy = 320) { this.bw = w; this.bh = h; this.bcx = cx; this.bcy = cy; if (this.started) setBox(w, h, cx, cy); return this; }
  soul(m, o = {}) { this.mode = m; this.opts = o; if (this.started) setSoul(m, o); return this; }
  add(b) { if (!b.owner) b.owner = this.E; B.bullets.push(b); return b; }
  aim(x, y, from = B.soul) { return Math.atan2(from.y - y, from.x - x); }
  // Raccourcis courants
  shot(x, y, ang, v, o = {}) { return this.add(bul({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, ...o })); }
  aimed(x, y, v, o = {}) { return this.shot(x, y, this.aim(x, y), v, o); }
  fromTop(x, v, o = {}) { return this.add(bul({ x, y: this.k.t - 12, vy: v, ...o })); }
  fromSide(y, v, left, o = {}) { const k = this.k; return this.add(bul({ x: left ? k.l - 12 : k.r + 12, y, vx: left ? v : -v, ...o })); }
  ringIn(n, R, v, o = {}) { const k = this.k, a0 = rand(0, TAU); for (let i = 0; i < n; i++) { const a = a0 + i * TAU / n, x = B.soul.x + Math.cos(a) * R, y = B.soul.y + Math.sin(a) * R; this.shot(x, y, a + Math.PI, v, o); } void k; }
  bone(o) { return this.add(mkBone(o)); }
  floorBone(x, h, vx, color = 'white') { const k = this.k; return this.add(mkBone({ x, y: k.b - h, w: 10, h: h + 16, vx, color })); }
  ceilBone(x, h, vx, color = 'white') { const k = this.k; return this.add(mkBone({ x, y: k.t - 16, w: 10, h: h + 16, vx, color })); }
  wall(x, vx, color = 'blue') { const k = this.k; return this.add(mkBone({ x, y: k.t - 8, w: 10, h: k.h + 16, vx, color })); }
  gapPair(x, gy, gap, vx) { const k = this.k; this.ceilBone(x, gy - gap / 2 - k.t, vx); this.floorBone(x, k.b - gy - gap / 2, vx); }
  blaster(x, y, ang, o) { return this.add(mkBlaster(x, y, ang, o)); }
  aimedBlaster(R = 175, o) { const k = this.k, a = Math.random() * TAU, x = k.cx + Math.cos(a) * R, y = k.cy + Math.sin(a) * R; return this.blaster(x, y, this.aim(x, y), o); }
  arrow(dir, kind, v) { return this.add(mkArrow(dir, kind, v)); }
  laser(o) { return this.add(mkLaser(o)); }
  platform(x, y, w, vx) { return this.add(mkPlat(x, y, w, vx)); }
}
// Programme des flèches (mode vert) : arrivées espacées équitablement
function greenSeq(A, o) {
  let t = o.start ?? 0.9, last = rint(0, 3);
  for (let i = 0; i < o.n; i++) {
    const r = Math.random(), kind = r < (o.yellow || 0) ? 'y' : r < (o.yellow || 0) + (o.fast || 0) ? 'f' : 'b';
    const dir = Math.random() < 0.3 ? last : rint(0, 3);
    if (i > 0) t += (dir === last && kind === 'b' ? o.gap * 0.62 : o.gap) * rand(0.95, 1.15);
    const v = kind === 'f' ? o.v * 1.5 : o.v, spawn = t - 300 / v - (kind === 'y' ? 0.24 : 0);
    const d = dir;
    A.at(Math.max(0, spawn), () => A.arrow(d, kind, v));
    last = dir;
  }
  A.dur = t + 0.7;
}

// ---------- Ennemis ----------
function mkEnemy(id, i, n) {
  const d = MON[id];
  if (!d) throw new Error('Monstre inconnu : ' + id);
  const xs = n === 1 ? [320] : n === 2 ? [205, 435] : [150, 320, 490];
  const E = { id, d, name: d.name, hp: d.hp, max: d.hp, atk: d.atk, df: d.df || 0, x: xs[i], y: d.baseY || 238,
    spare: !!d.spareStart, mercy: 0, dead: false, spared: false, gone: false, shake: 0, white: 0, alpha: 1, t: Math.random() * 10,
    st: {}, flags: {}, talkNext: null, turn: 0, acted: {}, hpShow: d.hp, idx: i };
  if (d.init) d.init(E);
  return E;
}
const alive = () => B.foes.filter(E => !E.gone);
function enemyFrame(E) { if (E.d.frame) return E.d.frame(E); const spr = SPRM[E.d.spr || E.id]; return spr ? spr(E.t, E) : null; }
function drawEnemy(E) {
  if (E.gone && !E.fadeT) return;
  if (E.d.draw) { E.d.draw(E); return; }
  const img = enemyFrame(E); if (!img) return;
  const sc = E.d.scale || 2;
  let x = E.x - img.width * sc / 2 + (E.shake ? Math.sin(E.shake * 2.2) * E.shake * 0.6 : 0) + (E.dx || 0), y = E.y - img.height * sc + (E.dy || 0);
  let im = img;
  if (E.white > 0) { const c = whiteBuf(img, E.white); im = c; }
  let a = E.alpha;
  if (E.spared) a = 0.5 * (E.fadeT ? Math.max(0, 1 - E.fadeT / 0.8) : 1);
  ctx.save(); ctx.globalAlpha = a;
  if (E.spared) im = tintedTemp(img, '#808080');
  ctx.drawImage(im, Math.round(x), Math.round(y), img.width * sc, img.height * sc);
  ctx.restore();
}
const _wb = document.createElement('canvas'), _wbc = _wb.getContext('2d');
function whiteBuf(img, a) {
  _wb.width = img.width; _wb.height = img.height; _wbc.clearRect(0, 0, img.width, img.height); _wbc.drawImage(img, 0, 0);
  _wbc.globalCompositeOperation = 'source-atop'; _wbc.globalAlpha = Math.min(1, a); _wbc.fillStyle = '#fff'; _wbc.fillRect(0, 0, img.width, img.height);
  _wbc.globalCompositeOperation = 'source-over'; _wbc.globalAlpha = 1; return _wb;
}
function tintedTemp(img, col) {
  _wb.width = img.width; _wb.height = img.height; _wbc.clearRect(0, 0, img.width, img.height); _wbc.drawImage(img, 0, 0);
  _wbc.globalCompositeOperation = 'source-atop'; _wbc.fillStyle = col; _wbc.fillRect(0, 0, img.width, img.height); _wbc.globalCompositeOperation = 'source-over'; return _wb;
}
// Poussière : l'ennemi se désagrège de haut en bas
function dustEnemy(E) {
  const img = enemyFrame(E); if (!img) return;
  const sc = E.d.scale || 2, at = E.d.dustAt ? E.d.dustAt(E) : null, x0 = at ? at.x : E.x - img.width * sc / 2, y0 = at ? at.y : E.y - img.height * sc;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const rows = [];
  for (let y = 0; y < c.height; y++) { const r = []; for (let x = 0; x < c.width; x++) if (data[(y * c.width + x) * 4 + 3] > 0) r.push(x); rows.push(r); }
  B.dusts.push({ c, rows, x0, y0, sc, cut: 0, t: 0, parts: [] });
  Snd.dust();
}
function updDusts(dt) {
  for (const d of B.dusts) {
    d.t += dt;
    const nc = Math.min(d.c.height, d.t / 1.2 * d.c.height);
    for (let y = Math.floor(d.cut); y < Math.floor(nc); y++) for (const x of d.rows[y]) if (Math.random() < 0.6) d.parts.push({ x: d.x0 + x * d.sc, y: d.y0 + y * d.sc, vx: rand(10, 50), vy: rand(-60, -15), life: rand(0.6, 1.3), t: 0 });
    d.cut = nc;
    for (const p of d.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    d.parts = d.parts.filter(p => p.t < p.life);
  }
  B.dusts = B.dusts.filter(d => d.cut < d.c.height || d.parts.length);
}
function drawDusts() {
  for (const d of B.dusts) {
    if (d.cut < d.c.height) ctx.drawImage(d.c, 0, d.cut, d.c.width, d.c.height - d.cut, d.x0, d.y0 + d.cut * d.sc, d.c.width * d.sc, (d.c.height - d.cut) * d.sc);
    for (const p of d.parts) { const a = 1 - p.t / p.life; ctx.globalAlpha = Math.min(1, a * 1.5); ctx.fillStyle = a > 0.5 ? '#fff' : '#9a9a9a'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
    ctx.globalAlpha = 1;
  }
}

// ---------- Bulles ----------
function mkBubble(E, str, o = {}) {
  const voice = o.voice || E.d.voice || 'monster', font = o.font || E.d.font;
  const n = B.foes.length, w = o.w || E.d.bubbleW || (n === 1 ? 190 : n === 2 ? 140 : 112);
  const max = o.max || Math.floor((w - 22) / (font ? 7.5 : 8));
  const ty = new Typer(wrap(str, max), { voice, speed: o.speed || 28 });
  const h = 22 + ty.lines.length * 18;
  const dx = E.d.bubbleDX ?? (n === 1 ? 80 : 34);
  let x = E.x + dx, y = E.d.bubbleY ?? (n === 1 ? 40 : Math.max(8, E.y - (E.d.h || 60) * 2 - 6)), left = false;
  if (x + w > 632) { x = E.x - dx - w; left = true; }
  return { E, ty, x, y, w, h, left, font, shake: o.shake, color: o.color };
}
function drawBubbleBox(bb) {
  const { x, y, w, h } = bb;
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 4, y, w - 8, h); ctx.fillRect(x, y + 4, w, h - 8); ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  if (bb.left) for (let i = 0; i < 12; i++) ctx.fillRect(x + w + 11 - i, y + 22 - Math.floor(i / 2), 1, 2 + i);
  else for (let i = 0; i < 12; i++) ctx.fillRect(x - 12 + i, y + 22 - Math.floor(i / 2), 1, 2 + i);
  if (bb.font) {
    let left = bb.ty.n;
    bb.ty.lines.forEach((l, i) => { if (left <= 0) return; text(l.slice(0, left), x + 10, y + 10 + i * 18, { font: bb.font, color: bb.color || '#000' }); left -= l.length; });
  } else bb.ty.draw(x + 12, y + 12, 18, { sx: 1, sy: 2, color: bb.color || '#000000', shake: bb.shake ? 1 : 0 });
}
// Fait parler un ou plusieurs ennemis (bulles simultanées). pages = [[E, texte], ...] ou chaîne
function* talk(E, pages, o = {}) {
  if (typeof pages === 'string') pages = [pages];
  for (const p of pages) {
    const list = Array.isArray(p) ? p : [[E, p]];
    B.bubbles = list.map(([e, s]) => mkBubble(e, s, o));
    if (o.onPage) o.onPage(p);
    for (;;) {
      yield;
      for (const bb of B.bubbles) bb.ty.update(1 / 60);
      const done = B.bubbles.every(bb => bb.ty.done);
      if (hit('x') || (!done && hit('z'))) for (const bb of B.bubbles) bb.ty.skip();
      else if (done && (hit('z') || (o.auto && B.bubbles.every(bb => bb.ty.done) && (B.autoT = (B.autoT || 0) + 1 / 60) > o.auto))) { B.autoT = 0; break; }
    }
  }
  B.bubbles = [];
}
// Texte dans la boîte (narration)
function* boxText(pages, o = {}) {
  if (typeof pages === 'string') pages = [pages];
  const pb = B.phase; B.phase = 'text';
  menuBox();
  for (const p of pages) {
    B.typer = new Typer(wrap(p, 32), { voice: o.voice || 'text', speed: o.speed || 32 });
    for (;;) { yield; B.typer.update(1 / 60); if (!B.typer.done && (hit('x') || hit('z'))) B.typer.skip(); else if (B.typer.done && (hit('z') || o.auto)) break; }
  }
  B.typer = null; B.phase = pb;
}

// ---------- Menus ----------
const BTNS = [{ x: 32, label: 'COMBAT', icon: 'fight' }, { x: 185, label: 'AGIR', icon: 'act' }, { x: 345, label: 'OBJET', icon: 'item' }, { x: 500, label: 'PITIÉ', icon: 'mercy' }];
function* listMenu(items, o = {}) { // items : [{t, col}] ; 2 colonnes
  const cols = o.cols || 2, per = o.per || (cols === 2 ? 4 : 3);
  let i = clamp(o.start || 0, 0, items.length - 1);
  B.list = { items, i, cols, per, title: o.title, hp: o.hp };
  for (;;) {
    yield;
    const n = items.length;
    if (cols === 2) {
      if (hit('right') && i % 2 === 0 && i + 1 < n) { i++; Snd.move(); } else if (hit('right') && i % 2 === 1 && i + 3 < n + 1 && Math.floor(i / per) < Math.floor((n - 1) / per)) { i = Math.min(n - 1, (Math.floor(i / per) + 1) * per); Snd.move(); }
      if (hit('left') && i % 2 === 1) { i--; Snd.move(); } else if (hit('left') && i % 2 === 0 && i >= per) { i = Math.floor(i / per) * per - per + 1; Snd.move(); }
      if (hit('down') && i + 2 < n && Math.floor((i + 2) / per) === Math.floor(i / per)) { i += 2; Snd.move(); }
      if (hit('up') && i - 2 >= 0 && Math.floor((i - 2) / per) === Math.floor(i / per)) { i -= 2; Snd.move(); }
    } else {
      if (hit('down') && i + 1 < n) { i++; Snd.move(); }
      if (hit('up') && i > 0) { i--; Snd.move(); }
    }
    B.list.i = i;
    if (hit('x')) { B.list = null; Snd.move(); return -1; }
    if (hit('z')) { B.list = null; Snd.select(); return i; }
  }
}
function* chooseTarget(withHP) {
  const foes = alive();
  const items = foes.map(E => ({ t: '* ' + E.name, col: E.spare && !E.d.noSpareColor ? YELLOW : '#fff', E }));
  const r = yield* listMenu(items, { cols: 1, hp: withHP });
  return r < 0 ? null : foes[r];
}
function actsOf(E) {
  const base = [{ n: 'Vérifier', check: true }];
  const acts = typeof E.d.acts === 'function' ? E.d.acts(E) : (E.d.acts || []);
  return base.concat(acts.filter(a => !a.cond || a.cond(E)));
}
function* doCheck(E) {
  const d = E.d;
  const head = '* ' + (d.checkName || E.name.toUpperCase()) + ' - ATQ ' + (d.showAtk ?? E.atk) + ' DÉF ' + (d.showDef ?? E.df);
  const body = typeof d.check === 'function' ? d.check(E) : d.check || '';
  yield* boxText(head + '\n' + body);
}
function* doAct(E, a) {
  B.lastAct = a.n;
  if (a.check) { yield* doCheck(E); return; }
  E.acted[a.n] = (E.acted[a.n] || 0) + 1;
  let txt = typeof a.t === 'function' ? a.t(E) : a.t;
  if (a.run) { const r = a.run(E); if (r && typeof r.next === 'function') yield* r; else if (typeof r === 'string') txt = r; }
  if (a.spare) E.spare = true;
  if (a.mercy) { E.mercy += a.mercy; if (E.mercy >= (E.d.mercyNeed || 100)) E.spare = true; }
  if (a.talk) E.talkNext = typeof a.talk === 'function' ? a.talk(E) : a.talk;
  if (txt) yield* boxText(txt);
  if (a.after) { const r = a.after(E); if (r && typeof r.next === 'function') yield* r; }
}
// Barre d'attaque
function* fightBar(E) {
  B.phase = 'fightBar';
  const k = mkBox(BOX0.w, BOX0.h, BOX0.cx, BOX0.cy);
  B.fb = { x: k.l + 2, hit: false, ht: 0, k };
  B.soul.visible = false;
  let dist = -1;
  for (;;) {
    yield;
    const fb = B.fb;
    if (!fb.hit) {
      fb.x += 560 / 60;
      if (hit('z')) { fb.hit = true; dist = Math.abs(fb.x + 7 - 320); break; }
      if (fb.x > k.r - 16) { fb.hit = true; break; }
    }
  }
  B.fb.hit = true;
  return dist;
}
function* doFight(E) {
  const dist = yield* fightBar(E);
  let res = 'miss', dmg = 0;
  if (dist >= 0) {
    const mult = dist < 12 ? 2.2 : Math.max(0.15, 2 * (1 - dist / 282));
    dmg = Math.max(1, Math.round((atkStat() + wAT() + (G.battleAtk || 0) - E.df + rand(0, 2)) * mult));
    res = 'hit';
  }
  yield 0.12;
  if (E.d.onFight) { const r = E.d.onFight(E, dmg, res); if (r && typeof r.next === 'function') { const v = yield* r; if (v === 'handled') { B.fb = null; return; } } }
  if (res === 'hit') {
    B.fx.push({ kind: 'slash', x: E.x, y: E.y - (E.d.h || 60), t: 0, life: 0.55 }); Snd.slash();
    yield 0.5;
    if (E.d.dodge && E.d.dodge(E)) {
      E.dodgeT = 0; Snd.dodge();
      B.fx.push({ kind: 'miss', x: E.x, y: E.y - (E.d.h || 60) * 2 - 10, t: 0, life: 1 }); yield 1;
    } else {
      if (E.d.hurt) dmg = E.d.hurt(E, dmg) ?? dmg;
      const from = E.hp; E.hp = Math.max(0, E.hp - dmg);
      E.shake = 14; E.white = 1; Snd.damage();
      B.fx.push({ kind: 'dmg', x: E.x, y: E.y - (E.d.h || 60) * 2 - 20, y0: E.y - (E.d.h || 60) * 2 - 20, vy: -260, val: dmg, from, to: E.hp, max: E.max, t: 0, life: 1.2, E });
      yield 1.2;
      if (E.hp <= 0 && !E.d.noDie) yield* killEnemy(E);
      else if (E.d.afterHit) { const r = E.d.afterHit(E, dmg); if (r && typeof r.next === 'function') yield* r; }
    }
  } else {
    B.fx.push({ kind: 'miss', x: E.x, y: E.y - (E.d.h || 60) * 2 - 10, t: 0, life: 1 }); yield 1;
  }
  B.fb = null;
}
function* killEnemy(E) {
  if (E.d.onDeath) { const r = E.d.onDeath(E); if (r && typeof r.next === 'function') yield* r; }
  E.dead = true; E.gone = true;
  dustEnemy(E);
  B.exp += E.d.exp || 0; B.gold += E.d.gold || 0;
  G.kills++; const ar = B.def.area || G.area; if (ar) G.areaKills[ar] = (G.areaKills[ar] || 0) + 1;
  G.flags['killed_' + E.id] = true;
  yield 0.6;
}
function* spareAll() {
  let any = false;
  for (const E of alive()) {
    if (!E.spare) continue;
    if (E.d.onSpare) { const r = E.d.onSpare(E); if (r && typeof r.next === 'function') { const v = yield* r; if (v === 'cancel') continue; } }
    E.spared = true; E.gone = true; E.fadeT = 0.001; any = true;
    B.gold += E.d.spareGold ?? Math.floor((E.d.gold || 0) / 2);
    G.spares++; G.flags['spared_' + E.id] = true;
  }
  if (any) { Snd.spare(); yield 0.6; }
  return any;
}
function* useItemBattle(i) {
  const id = G.items[i], it = ITEMS[id];
  if (it.kind) { // équipement
    G.items.splice(i, 1);
    const prev = it.kind === 'weapon' ? G.weapon : G.armor;
    if (it.kind === 'weapon') G.weapon = id; else G.armor = id;
    G.items.splice(i, 0, prev);
    yield* boxText('* Vous équipez : ' + it.n + '.'); return;
  }
  const before = G.hp, h = it.battleHeal ?? it.heal;
  G.hp = Math.min(maxHP(), G.hp + h);
  if (B.kr) B.krv = Math.min(B.krv, Math.max(0, G.hp - 1));
  if (it.next) G.items[i] = it.next; else G.items.splice(i, 1);
  Snd.heal();
  let t = it.use + '\n' + (G.hp >= maxHP() ? '* Vos PV sont au maximum.' : '* Vous récupérez ' + (G.hp - before) + ' PV !');
  if (it.atk) G.battleAtk = (G.battleAtk || 0) + it.atk;
  if (it.spd) G.speed = 190;
  if (B.def.onItem) B.def.onItem(id);
  yield* boxText(t);
}

// ---------- Tour du joueur ----------
function flavorText() {
  const f = alive();
  if (B.flavorNext) { const t = B.flavorNext; B.flavorNext = null; return t; }
  if (B.def.flavor) { const t = B.def.flavor(B); if (t) return t; }
  if (B.turn === 0 && B.def.intro) return B.def.intro;
  if (B.turn === 0) return f.length === 1 ? (f[0].d.intro || '* ' + f[0].name + ' approche !') : '* ' + f.map(E => E.name).join(' et ') + ' approchent !';
  const E = pick(f);
  if (E.spare && E.d.flavorSpare) return pick([].concat(E.d.flavorSpare));
  if (E.hp < E.max * 0.3 && E.d.flavorLow) return pick([].concat(E.d.flavorLow));
  return pick([].concat(E.d.flavor || ['* ' + E.name + ' vous regarde.']));
}
function* playerTurn() {
  B.sub = -1;
  B.phase = 'menu'; menuBox(); setSoul('red', { silent: true });
  B.flavor = new Typer(wrap(flavorText(), 32), { voice: 'text' });
  for (;;) {
    yield;
    B.flavor.update(1 / 60);
    if (hit('left')) { B.btn = (B.btn + 3) % 4; Snd.move(); }
    if (hit('right')) { B.btn = (B.btn + 1) % 4; Snd.move(); }
    if (!hit('z')) continue;
    Snd.select();
    const btn = B.btn;
    B.sub = btn;
    if (btn === 0) {
      if (B.def.noFight) { yield* boxText(B.def.noFight); return; }
      const E = yield* chooseTarget(true); if (!E) { B.sub = -1; continue; }
      yield* doFight(E); return;
    }
    if (btn === 1) {
      const E = yield* chooseTarget(false); if (!E) { B.sub = -1; continue; }
      const acts = actsOf(E);
      const r = yield* listMenu(acts.map(a => ({ t: '* ' + a.n, col: a.col || '#fff' })), { cols: 2 }); if (r < 0) { B.sub = -1; continue; }
      yield* doAct(E, acts[r]); return;
    }
    if (btn === 2) {
      if (!G.items.length) { B.sub = -1; continue; }
      const r = yield* listMenu(G.items.map(id => ({ t: '* ' + ITEMS[id].n })), { cols: 2, per: 4 }); if (r < 0) { B.sub = -1; continue; }
      yield* useItemBattle(r); return;
    }
    if (btn === 3) {
      const items = [{ t: '* Épargner', col: alive().some(E => E.spare) ? YELLOW : '#fff' }];
      if (B.def.flee === true || (B.def.flee !== false && !B.def.boss)) items.push({ t: '* Fuir' });
      if (B.mercyBroken) { yield* boxText('* Le bouton PITIÉ est brisé.'); B.sub = -1; continue; }
      if (B.def.mercyItems) for (const m of B.def.mercyItems(B)) items.push(m);
      const r = yield* listMenu(items, { cols: 1 }); if (r < 0) { B.sub = -1; continue; }
      if (r === 0) {
        if (B.def.onMercy) { const v = yield* B.def.onMercy(B); if (v === 'handled') return; }
        const any = yield* spareAll();
        if (!any && B.def.spareFail) yield* boxText(B.def.spareFail);
        return;
      }
      if (items[r].t === '* Fuir') {
        if (Math.random() < (B.def.fleeChance ?? 0.5 + B.turn * 0.15)) { B.fled = true; return; }
        yield* boxText('* Vous tentez de fuir...\n* Mais vous n\'y arrivez pas !'); return;
      }
      if (items[r].run) { yield* items[r].run(B); return; }
    }
  }
}

// ---------- Tour des ennemis ----------
function chooseAttack(E) {
  const atks = E.d.attacks || [];
  if (!atks.length) return null;
  if (E.d.pickAttack) return E.d.pickAttack(E, atks);
  return E.d.attackOrder === 'seq' ? atks[E.turn % atks.length] : pick(atks);
}
function* enemyTurn() {
  const foes = alive();
  if (!foes.length) return;
  for (const E of foes) if (E.d.beforeTalk) { const r = E.d.beforeTalk(E); if (r && typeof r.next === 'function') yield* r; }
  // préparation des attaques (taille de la boîte et mode de l'âme)
  const runners = [];
  for (const E of alive()) {
    if (E.skipAttack) { E.skipAttack = false; continue; }
    const fn = E.nextAttack || chooseAttack(E); E.nextAttack = null;
    if (!fn) continue;
    const A = new Runner(E); fn(A, E); runners.push(A);
  }
  const main = runners[0];
  if (main) { setBox(Math.max(...runners.map(r => r.bw)), Math.max(...runners.map(r => r.bh)), main.bcx || 320, main.bcy || 320); }
  B.soul.visible = true;
  const k0 = boxOf(B.boxT); B.soul.x = k0.cx; B.soul.y = k0.cy;
  // bulles
  const lines = [];
  for (const E of alive()) {
    let l = E.talkNext; E.talkNext = null;
    if (l === undefined || l === null) l = E.d.talk ? (typeof E.d.talk === 'function' ? E.d.talk(E) : pick(E.d.talk)) : null;
    if (l) lines.push([E, l]);
  }
  B.phase = 'enemyTalk';
  if (lines.length) {
    const pages = []; const maxP = Math.max(...lines.map(([, l]) => [].concat(l).length));
    for (let p = 0; p < maxP; p++) pages.push(lines.filter(([, l]) => [].concat(l)[p]).map(([E, l]) => [E, [].concat(l)[p]]));
    yield* talk(null, pages);
  }
  if (!runners.length) { for (const E of alive()) E.turn++; return; }
  yield* attackPhase(runners);
  for (const E of alive()) E.turn++;
}
function* runAttack(E, fn, o = {}) {
  const A = new Runner(E); fn(A, E);
  setBox(A.bw, A.bh, A.bcx || 320, A.bcy || 320);
  if (o.lines) yield* talk(E, o.lines, o.talkOpts || {});
  yield* attackPhase([A]);
}
function* attackPhase(runners) {
  const main = runners[0];
  setSoul(main.mode, { ...main.opts, silent: main.mode === 'red' || main.opts.silent });
  const k = boxOf(B.boxT);
  if (main.opts.at) { B.soul.x = main.opts.at[0]; B.soul.y = main.opts.at[1]; }
  else if (main.mode === 'blue') { B.soul.x = k.cx; B.soul.y = k.b - 8; }
  else { B.soul.x = k.cx; B.soul.y = k.cy; }
  B.soul.visible = true;
  yield () => boxReady();
  B.phase = 'attack'; B.runners = runners; B.atkT = 0;
  for (const r of runners) { r.started = true; if (r.onStart) r.onStart(); }
  const dur = Math.max(...runners.map(r => r.dur));
  yield () => B.dead || B.atkT >= dur || B.endAttack;
  B.endAttack = false;
  B.phase = 'post'; B.runners = []; B.bullets = []; B.shots = [];
  if (B.soul.mode === 'green' || B.soul.mode === 'purple' || B.soul.mode === 'yellow' || B.soul.mode === 'blue') setSoul('red', { silent: true });
}

// ---------- Déroulé du combat ----------
// def : { foes: [id...], music, area, boss, flee, intro, start*(B), end*(B), ... }
function* battle(def) {
  const prevScene = scene;
  B = {
    def, foes: def.foes.map((id, i) => mkEnemy(id, i, def.foes.length)), box: mkBox(BOX0.w, BOX0.h, BOX0.cx, BOX0.cy), boxT: mkBox(BOX0.w, BOX0.h, BOX0.cx, BOX0.cy),
    soul: { x: 48, y: 453, mode: 'red', grav: 'down', gv: 0, inv: 0, visible: true, flash: 0, shield: 0, ang: 0, lane: 1, cool: 0, moved: false, blockFlash: 0 },
    bullets: [], shots: [], fx: [], dusts: [], bubbles: [], btn: 0, sub: -1, phase: 'intro', turn: 0, exp: 0, gold: 0, hits: 0,
    kr: !!def.kr, krv: 0, krT: 0, hurtCD: 0, runners: [], atkT: 0, typer: null, flavor: null, list: null, fb: null, time: 0, bg: def.bg ?? 'grid',
  };
  G.battleAtk = 0; G.speed = 150;
  setScene(BattleScene);
  // Transition d'entrée : l'âme clignote puis rejoint le bouton COMBAT
  if (!def.noIntro) {
    B.phase = 'enc'; B.encT = 0;
    Snd.stopMusic(0);
    for (let i = 0; i < 3; i++) { B.encVis = true; Snd.beep(); yield 0.08; B.encVis = false; yield 0.08; }
    B.encVis = true; Snd.whoosh();
    yield 0.4;
    B.phase = 'intro';
  }
  if (def.music !== null) Snd.music(def.music || 'battle');
  if (def.start) yield* def.start(B);
  for (const E of B.foes) if (E.d.start) { const r = E.d.start(E); if (r && typeof r.next === 'function') yield* r; }
  while (!B.dead) {
    if (B.forceEnd) break;
    if (def.playerTurn) yield* def.playerTurn(B); else yield* playerTurn();
    if (B.dead || B.forceEnd) break;
    if (B.fled) {
      B.phase = 'flee'; Snd.flee();
      yield* boxText(pick(['* Vous prenez vos jambes à votre cou...', '* Vous filez sans demander votre reste.', '* Vous vous éclipsez discrètement.']), { auto: 1 });
      break;
    }
    if (!alive().length) break;
    if (def.enemyTurn) yield* def.enemyTurn(B); else yield* enemyTurn();
    if (B.dead || B.forceEnd) break;
    if (!alive().length) break;
    B.turn++;
  }
  if (B.dead) { yield () => false; return 'dead'; }
  // Fin du combat
  let result = B.fled ? 'fled' : B.forceEnd ? (B.result || 'special') : B.foes.some(E => E.dead) ? 'killed' : 'spared';
  if (def.end) { const r = yield* def.end(B, result); if (r) result = r; }
  if (!B.fled && !def.noReward && !['captured', 'special'].includes(result)) {
    G.gold += B.gold;
    const up = addExp(B.exp);
    Snd.stopMusic(0.3);
    let msg = '* VOUS AVEZ GAGNÉ !\n* Vous gagnez ' + B.exp + ' EXP et ' + B.gold + ' OR.';
    if (up) { msg += '\n* Votre LV augmente.'; Snd.levelup(); }
    B.soul.visible = false;
    yield* boxText(msg);
  }
  G.battleAtk = 0; G.speed = 150;
  B.result = result;
  scene = prevScene;
  return result;
}

// ---------- Scène de combat ----------
const BattleScene = {
  update(dt) {
    B.time += dt;
    updateBox(dt);
    for (const E of B.foes) {
      E.t += dt; E.shake = Math.max(0, E.shake - dt * 30); E.white = Math.max(0, E.white - dt * 5);
      if (E.fadeT) E.fadeT += dt;
      if (E.dodgeT !== undefined && E.dodgeT >= 0) {
        E.dodgeT += dt; const t = E.dodgeT;
        E.dx = t < 0.15 ? -70 * ease(t / 0.15) : t < 0.85 ? -70 : t < 1.05 ? -70 * (1 - ease((t - 0.85) / 0.2)) : 0;
        if (t > 1.05) E.dodgeT = -1;
      }
      if (E.d.tick) E.d.tick(E, dt);
    }
    B.soul.inv = Math.max(0, B.soul.inv - dt);
    B.soul.blockFlash = Math.max(0, (B.soul.blockFlash || 0) - dt);
    B.hurtCD = Math.max(0, B.hurtCD - dt);
    if (B.kr) krTick(dt);
    if (B.def.tick) B.def.tick(B, dt);
    if (B.phase === 'attack') {
      B.atkT += dt;
      updateSoul(dt);
      for (const r of B.runners) r.update(dt);
      for (const b of B.bullets) updBullet(b, dt);
      for (const sh of B.shots) { sh.y += sh.vy * dt; if (sh.y < B.box.t) sh.dead = true; for (const b of B.bullets) if (b.shootable && !b.dead && Math.abs(b.x - sh.x) < (b.r || 8) + 4 && Math.abs(b.y - sh.y) < (b.r || 8) + 6) { sh.dead = true; if (b.onShot) b.onShot(b); else b.dead = true; } }
      B.shots = B.shots.filter(s => !s.dead);
      const s = B.soul;
      for (const b of B.bullets) {
        if (!bulletHits(b, s)) continue;
        if (b.color === 'blue' && !s.moved) continue;
        if (b.color === 'orange' && s.moved) continue;
        hurtSoul(b);
        if (B.dead) return;
      }
      B.bullets = B.bullets.filter(b => !b.dead);
    }
    for (const f of B.fx) { f.t += dt; if (f.vx) f.x += f.vx * dt; if (f.vy !== undefined) { f.y += f.vy * dt; if (f.kind === 'dmg') { f.vy += 700 * dt; if (f.y > f.y0) { f.y = f.y0; f.vy = 0; } } } }
    B.fx = B.fx.filter(f => f.t < f.life);
    updDusts(dt);
  },
  draw() {
    if (B.phase === 'enc') {
      if (B.encVis) { const k = Math.min(1, B.encT / 0.4); drawHeart(lerp(G.owX ?? 320, 48, ease(k)), lerp(G.owY ?? 240, 453, ease(k)), 'red'); B.encT += 1 / 60; }
      return;
    }
    if (B.def.drawBg) B.def.drawBg(B); else if (B.bg === 'grid') drawGridBg();
    for (const E of B.foes) drawEnemy(E);
    drawDusts();
    if (B.def.drawOver) B.def.drawOver(B);
    for (const bb of B.bubbles) drawBubbleBox(bb);
    drawBox();
    drawBoxContent();
    if (B.def.drawTop) B.def.drawTop(B);
    if (B.phase === 'attack' || B.phase === 'enemyTalk') {
      const k = boxOf(B.box);
      ctx.save(); ctx.beginPath(); ctx.rect(k.l, k.t, k.w, k.h); ctx.clip();
      for (const b of B.bullets) if (b.clip !== false) drawBullet(b);
      ctx.restore();
      for (const b of B.bullets) if (b.clip === false) drawBullet(b);
      ctx.fillStyle = '#ffff00'; for (const sh of B.shots) ctx.fillRect(Math.round(sh.x) - 2, Math.round(sh.y) - 6, 4, 10);
    }
    drawHUD();
    if (['attack', 'enemyTalk', 'menu', 'intro', 'post', 'quiz'].includes(B.phase) || (B.list && !B.fb)) drawSoul();
    drawFx();
  },
};
function drawGridBg() {
  ctx.strokeStyle = '#105010'; ctx.lineWidth = 2;
  for (const [x0, y0] of [[14, 10], [14, 128]]) {
    for (let i = 0; i < 7; i++) ctx.strokeRect(x0 + i * 87, y0, 87, 118);
  }
  ctx.strokeStyle = '#0a300a'; ctx.lineWidth = 1;
  for (let x = 14; x < 626; x += 29) { ctx.beginPath(); ctx.moveTo(x + 0.5, 10); ctx.lineTo(x + 0.5, 246); ctx.stroke(); }
  for (let y = 10; y < 246; y += 39) { ctx.beginPath(); ctx.moveTo(14, y + 0.5); ctx.lineTo(626, y + 0.5); ctx.stroke(); }
}
const ICONS = {
  fight: ['..............XX', '.............XXX', '............XXX.', '...........XXX..', '..........XXX...', '.........XXX....', '..XX....XXX.....', '..XXX..XXX......', '...XXXXXX.......', '....XXXX........', '....XXXXX.......', '...XXX.XXX......', '..XXX...XX......', '.XXX............', '.XX.............', '................'],
  act: ['................', '..XXXXXXXXXXXX..', '.XXXXXXXXXXXXXX.', '.XX..........XX.', '.XX.XX.XX.XX.XX.', '.XX..........XX.', '.XXXXXXXXXXXXXX.', '..XXXXXXXXXXXX..', '....XXX.........', '....XX..........', '....X...........', '................', '................', '................', '................', '................'],
  item: ['................', '.....XXXXXX.....', '....XX....XX....', '....XX....XX....', '..XXXXXXXXXXXX..', '.XXXXXXXXXXXXXX.', '.XX..........XX.', '.XX..XXXXXX..XX.', '.XX..........XX.', '.XX..........XX.', '.XXXXXXXXXXXXXX.', '..XXXXXXXXXXXX..', '................', '................', '................', '................'],
  mercy: ['.XX..........XX.', '.XXX........XXX.', '..XXX......XXX..', '...XXX....XXX...', '....XXX..XXX....', '.....XXXXXX.....', '......XXXX......', '......XXXX......', '.....XXXXXX.....', '....XXX..XXX....', '...XXX....XXX...', '..XXX......XXX..', '.XXX........XXX.', '.XX..........XX.', '................', '................'],
};
const ICON = {};
for (const k in ICONS) ICON[k] = { o: pmap(ICONS[k], ORANGE), y: pmap(ICONS[k], YELLOW) };
function drawHUD() {
  const y = 400;
  text(G.name, 30, y, { sx: 2, sy: 2 });
  text('LV ' + G.lv, 30 + G.name.length * 16 + 26, y, { sx: 2, sy: 2 });
  text('PV', 248, y + 3, { sx: 1.5, sy: 2 });
  const mx = maxHP(), bw = Math.round(mx * 1.2);
  ctx.fillStyle = '#ff0000'; ctx.fillRect(276, y, bw, 21);
  ctx.fillStyle = YELLOW; ctx.fillRect(276, y, Math.round(bw * G.hp / mx), 21);
  let tx = 276 + bw + 12;
  if (B.kr) {
    ctx.fillStyle = COL.kr; ctx.fillRect(276 + Math.round(bw * (G.hp - B.krv) / mx), y, Math.round(bw * B.krv / mx), 21);
    text('KR', tx, y + 3, { sx: 1.5, sy: 2 }); tx += 34;
  }
  text(G.hp + ' / ' + mx, tx, y, { sx: 2, sy: 2, color: B.kr && B.krv > 0 ? COL.kr : '#fff' });
  const active = ['menu'].includes(B.phase) ? B.btn : B.list || B.phase === 'fightBar' || B.phase === 'text' ? B.sub : -1;
  BTNS.forEach((b, i) => {
    const sel = i === active || (B.phase === 'menu' && i === B.btn);
    const col = sel ? YELLOW : ORANGE;
    ctx.fillStyle = col; ctx.fillRect(b.x, 432, 110, 42); ctx.fillStyle = '#000'; ctx.fillRect(b.x + 3, 435, 104, 36);
    if (!(B.phase === 'menu' && sel && B.soul.visible)) ctx.drawImage(ICON[b.icon][sel ? 'y' : 'o'], b.x + 8, 445);
    text(b.label, b.x + 30 + (b.label.length < 6 ? (6 - b.label.length) * 6 : 0), 445, { sx: 1.5, sy: 2, color: col });
  });
  if (B.phase === 'menu') { B.soul.x = BTNS[B.btn].x + 16; B.soul.y = 453; B.soul.visible = true; }
}
const TARGET = (() => {
  const w = 565, h = 130, P = new Pix(w, h);
  const lens = (hw, hh, col) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40 * Math.PI; pts.push([w / 2 - Math.cos(t) * hw, h / 2 - Math.sin(t) * hh]); }
    for (let i = 0; i <= 40; i++) { const t = i / 40 * Math.PI; pts.push([w / 2 + Math.cos(t) * hw, h / 2 + Math.sin(t) * hh]); }
    P.poly(pts, col);
  };
  for (const [hw, hh, c] of [[278, 62, '#ffffff'], [274, 59, '#000000'], [240, 56, '#2b8a3e'], [236, 53, '#000000'], [190, 50, '#ffffff'], [186, 47, '#000000'], [140, 44, '#2b8a3e'], [136, 41, '#000000'], [90, 38, '#ffffff'], [86, 35, '#000000'], [42, 30, '#2b8a3e'], [38, 27, '#000000']]) lens(hw, hh, c);
  P.rect(w / 2 - 2, 8, 4, h - 16, '#ffffff'); P.rect(w / 2 - 1, 10, 2, h - 20, '#000000');
  return P.canvas();
})();
function drawBoxContent() {
  const tx = 52, ty = 272, lh = 32, O = { sx: 2, sy: 3 };
  const k = boxOf(B.box);
  if (B.fb) {
    const fb = B.fb; let a = 1;
    if (fb.hit) { fb.ht += 1 / 60; if (fb.ht > 0.6) a = Math.max(0, 1 - (fb.ht - 0.6) / 0.4); }
    ctx.globalAlpha = a;
    ctx.drawImage(TARGET, k.l + 5, k.t + 5, k.w - 10, k.h - 10);
    const white = !fb.hit || Math.floor(fb.ht * 12) % 2 === 0;
    ctx.fillStyle = white ? '#fff' : '#000'; ctx.fillRect(Math.round(fb.x), k.t + 5, 14, k.h - 10);
    ctx.fillStyle = white ? '#000' : '#fff'; ctx.fillRect(Math.round(fb.x) + 4, k.t + 9, 6, k.h - 18);
    ctx.globalAlpha = 1;
    return;
  }
  if (B.list) {
    const L = B.list, pg = Math.floor(L.i / L.per), start = pg * L.per;
    for (let j = 0; j < L.per; j++) {
      const it = L.items[start + j]; if (!it) continue;
      const col2 = L.cols === 2 && j % 2 === 1, row = L.cols === 2 ? Math.floor(j / 2) : j;
      const x = col2 ? 340 : 100, y = ty + row * lh;
      text(it.t, x - (L.cols === 2 && !col2 ? 32 : 0), y, { ...O, color: it.col || '#fff' });
      if (L.hp && it.E) {
        const E = it.E; ctx.fillStyle = '#ff0000'; ctx.fillRect(300, y + 2, 100, 18); ctx.fillStyle = '#00ff00'; ctx.fillRect(300, y + 2, Math.ceil(100 * E.hp / E.max), 18);
      }
      if (start + j === L.i) { B.soul.visible = true; B.soul.x = (col2 ? 324 : L.cols === 2 ? 52 : 84); B.soul.y = y + 14; }
    }
    if (L.cols === 2 && L.items.length > L.per) text('PAGE ' + (pg + 1), 388, ty + 2 * lh, O);
    return;
  }
  if (B.phase === 'menu' && B.flavor) { B.flavor.draw(tx, ty, lh, O); return; }
  if (B.typer) B.typer.draw(tx, ty, lh, O);
}
function drawFx() {
  for (const f of B.fx) {
    if (f.kind === 'slash') {
      const kk = Math.min(1, f.t / 0.3), a = f.t > 0.4 ? 1 - (f.t - 0.4) / 0.15 : 1;
      ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = '#ff1010';
      for (let i = 0; i < 22 * kk; i++) { const x = f.x + 40 - i * 4, y = f.y - 60 + i * 6, w = 6 - Math.abs(i - 11) / 3; ctx.fillRect(Math.round(x - w), Math.round(y), Math.round(w * 2), 6); }
      ctx.globalAlpha = 1;
    } else if (f.kind === 'dmg') {
      const s = String(f.val), y = Math.round(Math.max(16, f.y));
      for (const [ox, oy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) text(s, f.x + ox, y + oy, { sx: 3, sy: 4, color: '#000000', center: true });
      text(s, f.x, y, { sx: 3, sy: 4, color: '#ff2020', center: true });
      const bw = Math.min(220, Math.max(100, f.max / 4)), bx = f.x - bw / 2, by = Math.max(54, y + 44);
      f.show = f.show === undefined ? f.from : f.show + (f.to - f.show) * 0.12;
      ctx.fillStyle = '#404040'; ctx.fillRect(bx, by, bw, 14); ctx.fillStyle = '#00ff00'; ctx.fillRect(bx, by, Math.round(bw * Math.max(0, f.show) / f.max), 14);
    } else if (f.kind === 'miss') {
      text('MISS', f.x, f.y - Math.min(20, f.t * 60), { sx: 3, sy: 4, color: '#c0c0c0', center: true });
    } else if (f.kind === 'spark') {
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 1 - f.t / f.life; ctx.fillRect(Math.round(f.x), Math.round(f.y), 2, 2); ctx.globalAlpha = 1;
    } else if (f.draw) f.draw(f);
  }
}
