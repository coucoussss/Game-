'use strict';
// Caméra d'impact : au ralenti, vue 3D en rayons X de ce que fait l'obus dans le char touché.
const HitCam = (() => {
  const { M4 } = G3;
  let R = null, tankMeshes = null, mm = null, ground = null, cur = null;
  const T_HIT = 0.85, DUR = 4.4;

  const BASE = {
    engine: [0.55, 0.6, 0.68], trans: [0.6, 0.52, 0.7], fuel: [0.9, 0.62, 0.16],
    ammo: [0.92, 0.78, 0.3], breech: [0.62, 0.62, 0.62],
  };
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  function modColor(kind, r) {
    if (kind === 'crew') {
      if (r <= 0) return [0.5, 0.06, 0.05];
      return r > 0.99 ? [0.3, 0.78, 0.42] : lerp3([0.95, 0.35, 0.1], [0.95, 0.75, 0.2], r);
    }
    if (r <= 0) return [0.22, 0.04, 0.03];
    return r > 0.99 ? BASE[kind] : lerp3([0.95, 0.3, 0.08], BASE[kind], r * 0.7);
  }

  function init(renderer, meshes) {
    R = renderer; tankMeshes = meshes;
    const u = TankModels.moduleMeshes();
    mm = { box: R.upload(u.box), crew: R.upload(u.crew) };
    const g = new G3.Builder(); g.ground(14, 48); ground = R.upload(g);
  }
  function play(ev) { if (R) cur = { ev, t: 0 }; }
  function active() { return !!cur; }
  function time() { return cur ? cur.t : 1e9; }
  function stop() { cur = null; }
  function update(dt) { if (cur) { cur.t += dt; if (cur.t > DUR) cur = null; } }

  function draw(ctx, X, Y, w, h, dpr) {
    if (!cur || !R) return;
    const ev = cur.ev, t = cur.t, I = TankModels.info(ev.typeId);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    const fade = Math.min(1, t / 0.15, (DUR - t) / 0.35);
    R.begin(pw, ph, [0.015, 0.03, 0.05, 1]);
    const base = Math.atan2(-ev.dir[1], -ev.dir[0]);
    const ang = base + 0.85 - t * 0.09;
    const dist = 10.5 + I.S.L * 0.2;
    const eye = [Math.cos(ang) * dist, Math.sin(ang) * dist, 4.6];
    const center = [0, 0, I.S.ht * 0.65];
    R.camera(M4.lookAt(eye, center, [0, 0, 1]), M4.persp(0.58, pw / ph, 0.1, 100), eye, [-0.4, 0.5, 0.8]);
    R.draw(ground, M4.ident(), { ground: [0.05, 0.09, 0.13], shadow: [I.S.L / 2, I.S.W / 2, 0.3, -0.2] });
    const tm = M4.trs(I.pivotX, I.pivotY, 0, ev.turretAng);
    // modules internes (opaques)
    ev.mods.forEach((m, i) => {
      const k = Math.min(1, Math.max(0, (t - (ev.touch[i] != null ? ev.touch[i] : 99)) / 0.25));
      const r = ev.before[i] + (ev.after[i] - ev.before[i]) * k;
      const frame = m.frame === 'turret' ? tm : M4.ident();
      const model = M4.mul(frame, M4.trs(m.c[0], m.c[1], m.c[2], 0, m.s[0], m.s[1], m.s[2]));
      let col = modColor(m.kind, r);
      if (ev.touch[i] != null && t > ev.touch[i] && t < ev.touch[i] + 0.25) col = [1, 0.95, 0.7];
      R.draw(m.kind === 'crew' ? mm.crew : mm.box, model, { color: col });
    });
    // coque et tourelle en rayons X (transparentes)
    const M = tankMeshes[ev.typeId];
    R.draw(M.hull, M4.ident(), { xray: true, alpha: 0.95, additive: true });
    R.draw(M.turret, tm, { xray: true, alpha: 0.95, additive: true });

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#000'; ctx.fillRect(X - 3, Y - 3, w + 6, h + 6);
    ctx.drawImage(R.canvas, X, Y, w, h);
    ctx.beginPath(); ctx.rect(X, Y, w, h); ctx.clip();
    const P = p => { const q = R.project(p, w, h); return { x: X + q.x, y: Y + q.y }; };
    const add = (a, d, k) => [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];
    const glowLine = (a, b, col, wd) => {
      ctx.strokeStyle = col; ctx.lineWidth = wd * 3; ctx.globalAlpha = fade * 0.25;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.lineWidth = wd; ctx.globalAlpha = fade;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    };
    ctx.lineCap = 'round';
    const E = ev.entry, d = ev.dir;
    const shellCol = ev.shellKey === 'HE' || ev.shellKey === 'HEAT' ? '#ff8a40' : '#ffe9a8';
    if (t < T_HIT) {
      const s = 8 * (1 - t / T_HIT);
      const head = add(E, d, -s), tail = add(E, d, -s - 1.6);
      glowLine(P(tail), P(head), shellCol, 3);
      const hp = P(head);
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hp.x, hp.y, 3.5, 0, Math.PI * 2); ctx.fill();
    } else {
      const k = t - T_HIT;
      if (k < 0.35) {
        const p = P(E), r = 6 + k * 120;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, 'rgba(255,250,220,0.95)'); g.addColorStop(1, 'rgba(255,150,40,0)');
        ctx.globalAlpha = fade * (1 - k / 0.35); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = fade;
      }
      if (ev.outcome === 'ricochet' && ev.ricDir) {
        const head = add(E, ev.ricDir, Math.min(9, k * 9)), tail = add(E, ev.ricDir, Math.max(0, k * 9 - 1.6));
        glowLine(P(tail), P(head), shellCol, 3);
      }
      if (ev.outcome === 'nopen' || ev.outcome === 'ricochet') {
        ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.5;
        for (const sp of ev.sparks) {
          const q = Math.min(1, k / 0.3), a = P(E), b = P(add(E, sp, 0.25 + q * 0.6));
          ctx.globalAlpha = fade * Math.max(0, 1 - k / 0.8);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        ctx.globalAlpha = fade;
      }
      if (ev.outcome === 'pen' && ev.path) {
        const pq = Math.min(1, k / 0.4);
        const a = ev.path[0], b = ev.path[1];
        const head = [a[0] + (b[0] - a[0]) * pq, a[1] + (b[1] - a[1]) * pq, a[2] + (b[2] - a[2]) * pq];
        glowLine(P(a), P(head), '#ffb04a', 3.5);
        if (pq < 1) { const hp = P(head); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hp.x, hp.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
        if (ev.fuse && pq >= 1) {
          const kk = k - 0.4, p = P(ev.fuse);
          if (kk < 0.6) {
            const r = 10 + kk * 160;
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            g.addColorStop(0, 'rgba(255,255,220,0.95)'); g.addColorStop(0.4, 'rgba(255,170,50,0.7)'); g.addColorStop(1, 'rgba(255,80,20,0)');
            ctx.globalAlpha = fade * (1 - kk / 0.6); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = fade;
          }
        }
        const f0 = ev.fragT;
        if (k > f0) {
          const q = Math.min(1, (k - f0) / 0.35);
          ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = 1.4;
          for (const f of ev.frags) {
            const fb = [f.a[0] + (f.b[0] - f.a[0]) * q, f.a[1] + (f.b[1] - f.a[1]) * q, f.a[2] + (f.b[2] - f.a[2]) * q];
            const pa = P(f.a), pb = P(fb);
            ctx.globalAlpha = fade * (0.9 - Math.max(0, k - f0 - 0.6) * 0.6);
            ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
            if (f.hit && q >= 1) { ctx.fillStyle = '#ff6a3a'; ctx.beginPath(); ctx.arc(pb.x, pb.y, 2.2, 0, Math.PI * 2); ctx.fill(); }
          }
          ctx.globalAlpha = fade;
        }
        if (ev.detonation && k > 0.95) {
          const kk = k - 0.95, c = P([0, 0, I.S.ht * 0.7]);
          const r = Math.min(w, 60 + kk * 700);
          const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
          g.addColorStop(0, 'rgba(255,250,210,0.95)'); g.addColorStop(0.35, 'rgba(255,150,40,0.85)'); g.addColorStop(0.75, 'rgba(120,30,10,0.5)'); g.addColorStop(1, 'rgba(40,10,5,0)');
          ctx.globalAlpha = fade * Math.max(0, 1 - kk / 2.2); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = fade;
        }
      }
    }
    ctx.restore();

    // Textes
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = ev.friendly ? '#ffaa44' : '#5fb4ff'; ctx.lineWidth = 2;
    ctx.strokeRect(X - 1, Y - 1, w + 2, h + 2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(X, Y, w, 50);
    ctx.textAlign = 'left';
    ctx.font = '700 13px system-ui, sans-serif'; ctx.fillStyle = ev.friendly ? '#ffaa44' : '#8cc8ff';
    ctx.fillText((ev.friendly ? 'TIR ALLIÉ · ' : '') + "CAMÉRA D'IMPACT · " + ev.shellName + ' · ' + ev.dist + ' m', X + 10, Y + 17);
    ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = '#d8d4c6';
    ctx.fillText(`${ev.target} · ${ev.plate} : ${ev.mm} mm à ${ev.slope}° · impact à ${ev.angle}°`, X + 10, Y + 33);
    if (t > T_HIT) {
      let line, col;
      if (ev.outcome === 'ricochet') { line = 'RICOCHET : impact trop rasant'; col = '#9fd0ff'; }
      else if (ev.outcome === 'nopen') { line = `Pénétration ${ev.pen} mm < blindage effectif ${ev.eff} mm : NON PERFORÉ`; col = '#ff8a6a'; }
      else { line = `Pénétration ${ev.pen} mm ≥ blindage effectif ${ev.eff} mm : PERFORÉ`; col = '#a6f08a'; }
      ctx.fillStyle = col; ctx.font = '700 12px system-ui, sans-serif';
      ctx.fillText(line, X + 10, Y + 47);
    }
    if (t > T_HIT + 0.5) {
      const lines = ev.results;
      const n = Math.min(lines.length, Math.floor((t - T_HIT - 0.5) / 0.18) + 1);
      const bh = n * 17 + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(X, Y + h - bh, Math.min(w * 0.46, 250), bh);
      ctx.font = '700 11px system-ui, sans-serif';
      for (let i = 0; i < n; i++) { ctx.fillStyle = lines[i].c; ctx.fillText(lines[i].t, X + 10, Y + h - bh + 18 + i * 17); }
    }
    ctx.restore();
  }

  return { init, play, active, time, stop, update, draw, DUR, T_HIT };
})();
