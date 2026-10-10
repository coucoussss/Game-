'use strict';
// ============================================================
//  main.js : boucle de jeu, écrans titre / nom / game over / fins
// ============================================================
// ---------- Game over ----------
const GO_LINES = [
  ['Tu ne peux pas abandonner', 'maintenant...', '{N} !', 'Reste déterminé(e)...'],
  ['Notre destin repose', 'sur toi...', '{N} !', 'Garde ta détermination...'],
  ['Ce n\'est pas encore fini...', '{N} !', 'Ne perds pas espoir...'],
];
let GO = null;
function startGameOver(x, y, lines) {
  for (const c of coroutines) c.done = true;
  Snd.stopMusic(0);
  G.deaths = (G.deaths || 0) + 1; store.set('deaths', (store.get('deaths', 0) || 0) + 1);
  GO = { t: 0, x, y, shards: [], stage: 0, lines: (lines || pick(GO_LINES)).map(l => l.replace('{N}', G.name)), li: 0, typer: null };
  setScene(GameOverScene);
}
const GameOverScene = {
  update(dt) {
    const o = GO; o.t += dt;
    if (o.stage === 0 && o.t > 0.8) { o.stage = 1; Snd.crack(); }
    if (o.stage === 1 && o.t > 2.0) { o.stage = 2; Snd.shatter(); for (let i = 0; i < 6; i++) o.shards.push({ x: o.x + rand(-6, 6), y: o.y + rand(-4, 4), vx: rand(-160, 160), vy: rand(-260, -60) }); }
    if (o.stage === 2) for (const s of o.shards) { s.vy += 600 * dt; s.x += s.vx * dt; s.y += s.vy * dt; }
    if (o.stage === 2 && o.t > 3.4) { o.stage = 3; Snd.music('gameover'); }
    if (o.stage === 3 && o.t > 5.0) { o.stage = 4; o.typer = new Typer(o.lines.slice(0, 2), { voice: 'asgore', speed: 16 }); o.li = 2; }
    if (o.stage === 4) {
      o.typer.update(dt);
      if (!o.typer.done && (hit('x') || hit('z'))) o.typer.skip();
      else if (o.typer.done && hit('z')) {
        if (o.li < o.lines.length) { o.typer = new Typer(o.lines.slice(o.li, o.li + 2), { voice: 'asgore', speed: 16 }); o.li += 2; }
        else { o.stage = 5; o.fade = 0; }
      }
    }
    if (o.stage === 5) { o.fade += dt; if (o.fade > 1.2) { Snd.stopMusic(0.5); respawn(); } }
  },
  draw() {
    const o = GO;
    if (o.stage === 0) drawHeart(o.x, o.y, 'red');
    else if (o.stage === 1) { dImg(HEART_L, o.x - 10, o.y - 6, 1); dImg(HEART_R, o.x - 6, o.y - 6, 1); }
    else if (o.stage === 2) for (const s of o.shards) dImg(SHARD, s.x, s.y, 2);
    if (o.stage >= 3) {
      ctx.globalAlpha = Math.min(1, (o.t - 3.4) / 1.5) * (o.stage === 5 ? Math.max(0, 1 - o.fade) : 1);
      text('GAME', 320, 70, { sx: 8, sy: 8, center: true }); text('OVER', 320, 150, { sx: 8, sy: 8, center: true });
      ctx.globalAlpha = 1;
    }
    if (o.stage === 4) o.typer.draw(130, 330, 36, { sx: 2, sy: 3 });
  },
};
// Après un game over : on recharge la dernière sauvegarde
function respawn() {
  const deaths = G.deaths;
  if (!loadGame()) { newG(G.name); }
  G.deaths = deaths;
  fadeA = 1;
  startWorld();
}

// ---------- Boucle ----------
const DT = 1 / 60;
let acc = 0, lastT = performance.now(), frameN = 0;
function update(dt) {
  if (hit('mute')) Snd.toggleMute();
  if (hit('full')) { try { if (document.fullscreenElement) document.exitFullscreen(); else (document.getElementById('app') || cv).requestFullscreen(); } catch (e) { /* refusé */ } }
  if (hit('esc') && scene && scene.pausable !== false && scene !== TitleScene) { paused = !paused; Snd.select(); }
  if (paused) return;
  time += dt; if (G) G.time += dt;
  shake = Math.max(0, shake - dt * 30);
  flashA = Math.max(0, flashA - dt * 2);
  stepCoroutines(dt);
  if (scene && scene.update) scene.update(dt);
}
function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  if (shake > 0) ctx.translate(Math.round(rand(-shake, shake)), Math.round(rand(-shake, shake)));
  if (scene && scene.draw) scene.draw();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fadeA > 0) { ctx.globalAlpha = fadeA; ctx.fillStyle = fadeCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  if (flashA > 0) { ctx.globalAlpha = Math.min(1, flashA); ctx.fillStyle = flashCol; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  if (paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
    text('PAUSE', 320, 200, { sx: 4, sy: 5, center: true });
    text('P ou Échap : reprendre', 320, 260, { sx: 1, sy: 2, center: true, color: '#c0c0c0' });
  }
  if (Snd.muted) text('MUET', 600, 8, { sx: 1, sy: 1, color: '#606060' });
}
function frame(now) {
  acc += Math.min(0.25, (now - lastT) / 1000); lastT = now;
  let n = 0;
  while (acc >= DT && n < 4) { update(DT); acc -= DT; n++; keysHit.clear(); frameN++; }
  if (n === 0) { /* pas de mise à jour : on garde les touches pour l'image suivante */ }
  render();
  requestAnimationFrame(frame);
}

// ---------- Démarrage ----------
function boot() {
  setupTouch(); fit();
  const face = new FontFace('PixelFont', 'url(' + PIXEL_FONT_DATA + ')');
  face.load().then(f => document.fonts.add(f)).catch(() => {}).finally(() => {
    glyphs.clear();
    newG(store.get('name', 'CHARA'));
    const h = location.hash;
    if (h.startsWith('#battle=')) { // test : #battle=froggit,whimsun
      const ids = h.slice(8).split(',');
      setScene({ draw() {} });
      spawn((function* () { const r = yield* battle({ foes: ids, ...(MON[ids[0]] && MON[ids[0]].battle || {}) }); console.log('résultat', r); })());
    } else if (typeof startTitle === 'function') startTitle();
  });
  requestAnimationFrame(frame);
}
window.__dbg = { get G() { return G; }, get B() { return B; }, get scene() { return scene; }, MON, spawn, battle, press, release, keysHit };
boot();
