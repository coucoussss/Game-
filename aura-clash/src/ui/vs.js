// Écran « VS » avant chaque combat : les camps glissent depuis les bords, le « VS » s'écrase au
// centre, et le nom de l'arène (ou du chapitre, du niveau) s'affiche. Une touche le passe.
import { CHAR_BY_ID } from '../game/characters.js';
import { ARENAS } from '../render/arenas.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * @param app
 * @param cfg     configuration du combat (fighters, arena, story, waveLevel, endless…)
 * @param onDone  appelé quand l'écran disparaît
 */
export function showVs(app, cfg, onDone) {
  const side = (team) => cfg.fighters.filter((f) => f.team === team).slice(0, 4).map((f) => CHAR_BY_ID[f.charId]);
  const left = side(0);
  const right = side(1);
  const arena = ARENAS.find((a) => a.id === cfg.arena);
  let caption = arena ? arena.name : '';
  let title = '';
  if (cfg.waveLevel) title = `NIVEAU ${cfg.waveLevel}`;
  else if (cfg.endless) title = 'MODE INFINI';
  else if (cfg.storyTitle) title = cfg.storyTitle;
  if (cfg.waveLevel && cfg.regionName) caption = cfg.regionName;
  const card = (d, i, n, cls) => `<div class="vs-card ${cls}" style="--c:${d.aura};--i:${i};--n:${n}">
    ${app.ui.portrait(d.id, 'vs-portrait')}
    <div class="vs-name">${esc(d.name)}</div><div class="vs-title">${esc(d.title)}</div></div>`;
  const el = document.createElement('div');
  el.className = 'vs-screen';
  el.innerHTML = `
    <div class="vs-lines"></div>
    <div class="vs-side left">${left.map((d, i) => card(d, i, left.length, 'l')).join('')}</div>
    <div class="vs-side right">${right.map((d, i) => card(d, i, right.length, 'r')).join('')}</div>
    <div class="vs-mark">VS</div>
    ${title ? `<div class="vs-top">${esc(title)}</div>` : ''}
    <div class="vs-bottom">${esc(caption)}</div>`;
  document.getElementById('ui').appendChild(el);
  app.audio.play('ui_start');
  setTimeout(() => { app.audio.play('impact'); app.stage.rig.addShake(0.4); }, 650);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', skip);
    window.removeEventListener('pointerdown', skip);
    el.classList.add('out');
    setTimeout(() => el.remove(), 350);
    onDone();
  };
  const skip = () => { if (performance.now() - t0 > 400) finish(); };
  const t0 = performance.now();
  window.addEventListener('keydown', skip);
  window.addEventListener('pointerdown', skip);
  setTimeout(finish, 2600);
  return finish;
}
