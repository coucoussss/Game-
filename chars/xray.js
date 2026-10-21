'use strict';
// Caméra d'impact : reconstitution au ralenti, à l'échelle de temps réelle (millisecondes),
// de la simulation balistique (ballistics.js), vue en 3D aux rayons X.
const HitCam = (() => {
  const { M4 } = G3;
  let R = null, tankMeshes = null, mm = null, ground = null, cur = null;
  const T_APP = 1.1, T_IN = 3.0, T_HOLD = 2.0, DUR = T_APP + T_IN + T_HOLD, T_HIT = T_APP;

  const BASE = {
    engine: [0.55, 0.6, 0.68], trans: [0.6, 0.52, 0.7], fuel: [0.9, 0.62, 0.16],
    ammo: [0.92, 0.78, 0.3], breech: [0.62, 0.62, 0.62],
  };
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const fmt = (v, d = 0) => v.toFixed(d).replace('.', ',');

  // Teinte d'état appliquée au modèle détaillé (r = intégrité, de 0 à 1)
  function modTint(kind, r) {
    if (kind === 'crew') {
      if (r <= 0) return [0.75, 0.05, 0.04, 0.62];
      return r > 0.99 ? [0.35, 0.95, 0.5, 0.16] : [1, 0.55, 0.12, 0.45];
    }
    if (r <= 0) return [0.3, 0.03, 0.02, 0.7];
    return r > 0.99 ? [0, 0, 0, 0] : [1, 0.45, 0.1, 0.42];
  }
  function modColor(kind, r) {
    if (kind === 'crew') {
      if (r <= 0) return [0.5, 0.06, 0.05];
      return r > 0.99 ? [0.3, 0.78, 0.42] : lerp3([0.95, 0.35, 0.1], [0.95, 0.75, 0.2], r);
    }
    if (r <= 0) return [0.22, 0.04, 0.03];
    return r > 0.99 ? BASE[kind] : lerp3([0.95, 0.3, 0.08], BASE[kind], r * 0.7);
  }

  let modMeshes = null;
  function init(renderer, meshes, mods) {
    R = renderer; tankMeshes = meshes; modMeshes = mods;
    const g = new G3.Builder(); g.ground(14, 48); ground = R.upload(g);
  }
  function play(ev) {
    if (!R) return;
    ev.tApp = 7 / Math.max(50, ev.V);
    ev.tEnd = ev.sim ? ev.sim.tEnd : (ev.outcome === 'ricochet' ? 6e-3 : 3e-3);
    cur = { ev, t: 0 };
  }
  const active = () => !!cur;
  const time = () => cur ? cur.t : 1e9;
  const stop = () => { cur = null; };
  let frozen = false;
  function update(dt) { if (cur && !frozen) { cur.t += dt; if (cur.t > DUR) cur = null; } }
  // tests : figer la caméra à un instant donné
  function seek(t) { if (cur) { cur.t = t; frozen = true; } }
  function release() { frozen = false; }
  // Temps physique (secondes, 0 à l'impact) correspondant au temps de la caméra
  function phys(ct, ev) {
    if (ct < T_APP) return -ev.tApp * (1 - ct / T_APP);
    return Math.min(ev.tEnd, (ct - T_APP) / T_IN * ev.tEnd);
  }
  function posAt(pts, t) {
    if (t < pts[0].t) return null;
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i].t) {
        const a = pts[i - 1], b = pts[i], k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
        return lerp3(a.p, b.p, k);
      }
    }
    return pts[pts.length - 1].p;
  }

  function draw(ctx, X, Y, w, h, dpr) {
    if (!cur || !R) return;
    const ev = cur.ev, ct = cur.t, I = TankModels.info(ev.typeId), Sd = I.S;
    const tp = phys(ct, ev), sim = ev.sim;
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    const fade = Math.min(1, ct / 0.15, (DUR - ct) / 0.4);
    const E = ev.entry, d = ev.dir;
    const side = norm(cross(d, [0, 0, 1]));

    // Caméra : derrière l'obus pendant l'approche, puis en orbite autour du char
    const head = tp < 0 ? add(E, mul(d, ev.V * tp)) : E;
    const followEye = add(add(add(head, mul(d, -2.4)), mul(side, 1.1)), [0, 0, 0.7]);
    const followTgt = lerp3(head, E, 0.6);
    const base = Math.atan2(-d[1], -d[0]);
    const ang = base + 0.95 - Math.max(0, ct - T_APP) * 0.07;
    const dist = 7.6 + Sd.L * 0.2;
    const orbitEye = [Math.cos(ang) * dist, Math.sin(ang) * dist, 4.4];
    const orbitTgt = lerp3([0, 0, Sd.ht * 0.8], E, 0.5);
    const k = smooth(T_APP - 0.35, T_APP + 0.7, ct);
    let eye = lerp3(followEye, orbitEye, k), tgt = lerp3(followTgt, orbitTgt, k);
    const shakeA = tp > 0 && tp < ev.tEnd * 0.25 ? 0.05 * (1 - tp / (ev.tEnd * 0.25)) : 0;
    if (shakeA) eye = add(eye, [(Math.random() - 0.5) * shakeA, (Math.random() - 0.5) * shakeA, (Math.random() - 0.5) * shakeA]);

    R.begin(pw, ph, [0.012, 0.025, 0.045, 1]);
    R.camera(M4.lookAt(eye, tgt, [0, 0, 1]), M4.persp(0.62, pw / ph, 0.05, 100), eye, [-0.4, 0.5, 0.8]);
    R.draw(ground, M4.ident(), { ground: [0.05, 0.09, 0.13], shadow: [Sd.L / 2, Sd.W / 2, 0.3, -0.2] });
    const tm = M4.trs(I.pivotX, I.pivotY, 0, ev.turretAng);
    ev.mods.forEach((m, i) => {
      const th = ev.touch[i];
      const on = th != null && tp >= th;
      const r = on ? ev.after[i] : ev.before[i];
      const frame = m.frame === 'turret' ? tm : M4.ident();
      const model = M4.mul(frame, M4.trs(m.c[0], m.c[1], m.c[2], 0));
      let tint = modTint(m.kind, r);
      if (on && tp < th + ev.tEnd * 0.06) tint = [1, 0.95, 0.8, 0.75];
      R.draw(modMeshes[ev.typeId][i], model, { tint });
    });
    const M = tankMeshes[ev.typeId];
    R.draw(M.hull, M4.ident(), { xray: true, alpha: 0.6, additive: true });
    R.draw(M.turret, tm, { xray: true, alpha: 0.6, additive: true });

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = '#000'; ctx.fillRect(X - 3, Y - 3, w + 6, h + 6);
    ctx.drawImage(R.canvas, X, Y, w, h);
    ctx.beginPath(); ctx.rect(X, Y, w, h); ctx.clip();
    const P = p => { const q = R.project(p, w, h); return { x: X + q.x, y: Y + q.y, z: q.z, behind: q.behind }; };
    const camR = [R.view[0], R.view[4], R.view[8]];
    const screenR = (p, r) => { const a = P(p), b = P(add(p, mul(camR, r))); return Math.hypot(b.x - a.x, b.y - a.y); };
    const glow = (p, r, c0, c1, a) => {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      ctx.globalAlpha = fade * a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = fade;
    };
    const line = (a, b, col, wd, al = 1) => {
      ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.globalAlpha = fade * al;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.globalAlpha = fade;
    };
    ctx.lineCap = 'round';
    // traces des impacts précédents, gardées par le blindage
    if (ev.scars) for (const sc of ev.scars) {
      const q = P(sc.p);
      if (q.behind) continue;
      const hole = sc.kind.indexOf('pen') >= 0, col = hole ? '#ff6a4a' : sc.kind === 'he' || sc.kind === 'heat' ? '#c8a070' : sc.kind === 'crack' ? '#ffb070' : '#9fd0ff';
      ctx.globalAlpha = fade * 0.9; ctx.strokeStyle = col; ctx.lineWidth = hole ? 2 : 1.4;
      ctx.beginPath(); ctx.arc(q.x, q.y, hole ? 5 : 3.5, 0, Math.PI * 2); ctx.stroke();
      if (hole) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(q.x, q.y, 1.6, 0, Math.PI * 2); ctx.fill(); }
      if (sc.kind === 'crack') { ctx.beginPath(); ctx.moveTo(q.x - 7, q.y - 4); ctx.lineTo(q.x + 6, q.y + 5); ctx.moveTo(q.x - 3, q.y + 6); ctx.lineTo(q.x + 4, q.y - 6); ctx.stroke(); }
      ctx.globalAlpha = fade;
    }
    const cal = ev.cal / 1000, r0 = cal / 2;

    // Trou dans la plaque : section de l'obus projetée sur le plan incliné (allongée de 1/cos i)
    const drawHole = (C, n, dIn, cosI, age, kind) => {
      const dt = norm(sub(dIn, mul(n, dot(dIn, n)))), wv = cross(n, dt);
      const ell = Math.min(4, 1 / Math.max(0.25, cosI));
      const ring = [];
      for (let k = 0; k < 20; k++) {
        const a = k / 20 * Math.PI * 2, rr = kind === 'dent' ? r0 * 0.8 : r0 * (1 + 0.12 * Math.sin(a * 5));
        ring.push(P(add(C, add(mul(dt, Math.cos(a) * rr * ell), mul(wv, Math.sin(a) * rr)))));
      }
      ctx.beginPath(); ring.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
      if (kind !== 'dent') { ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fill(); }
      // refroidissement du bord : blanc, orange, puis rouge sombre
      const heat = Math.max(0, 1 - age / 0.012);
      const col = heat > 0.66 ? `rgba(255,250,220,${0.4 + heat * 0.6})` : heat > 0.33 ? `rgba(255,160,50,${0.3 + heat})` : `rgba(160,40,15,${0.25 + heat})`;
      ctx.strokeStyle = col; ctx.lineWidth = kind === 'dent' ? 1.5 : 2.2; ctx.stroke();
    };

    // Obus : ogive, corps, ceinture de forcement en cuivre, traceur, rotation due aux rayures, cône de Mach
    const drawShell = (H, dir, v, tt) => {
      const L = ev.shellLen * cal, Tl = add(H, mul(dir, -L));
      const a = P(H), b = P(Tl);
      if (a.behind || b.behind) return;
      const rs = Math.max(1.5, screenR(H, r0));
      const mach = v / 340;
      if (mach > 1.05) {
        const mu = Math.asin(1 / mach), cL = 1.4;
        const up = norm(cross(dir, side));
        for (const sg of [1, -1]) for (const ax of [side, up]) {
          const e2 = add(H, add(mul(dir, -cL * Math.cos(mu)), mul(ax, sg * cL * Math.sin(mu))));
          line(a, P(e2), 'rgba(170,210,255,0.6)', 1, 0.35);
        }
      }
      const isSub = ev.shellKey === 'APCR';
      ctx.globalAlpha = fade;
      ctx.strokeStyle = isSub ? '#9aa3a8' : ev.shellKey === 'HE' ? '#5d6b4a' : '#6a6458';
      ctx.lineWidth = rs * 2; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke();
      const band = P(add(Tl, mul(dir, L * 0.12)));
      ctx.strokeStyle = '#b8733c'; ctx.lineWidth = rs * 2.05;
      ctx.beginPath(); ctx.moveTo(band.x, band.y); ctx.lineTo(P(add(Tl, mul(dir, L * 0.2))).x, P(add(Tl, mul(dir, L * 0.2))).y); ctx.stroke();
      // rayures de rotation (visibles grâce au ralenti)
      const rev = ev.spin * tt;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(1, rs * 0.35);
      for (let k = 0; k < 3; k++) {
        const f = 0.3 + 0.55 * ((rev + k / 3) % 1 + 1) % 1;
        const c = P(add(Tl, mul(dir, L * f)));
        const pp = P(add(add(Tl, mul(dir, L * f)), mul(side, r0)));
        const nx = pp.x - c.x, ny = pp.y - c.y;
        ctx.beginPath(); ctx.moveTo(c.x - nx, c.y - ny); ctx.lineTo(c.x + nx, c.y + ny); ctx.stroke();
      }
      ctx.lineCap = 'round';
      ctx.fillStyle = isSub ? '#c9d2d6' : '#8a8274';
      ctx.beginPath(); ctx.arc(a.x, a.y, rs * 1.02, 0, Math.PI * 2); ctx.fill();
      glow(b, rs * 4 + 4, 'rgba(255,90,60,0.95)', 'rgba(255,40,20,0)', 1); // traceur
    };

    // --- Approche ---
    if (tp < 0) {
      const H = add(E, mul(d, ev.V * tp));
      const tr0 = P(add(H, mul(d, -2.5))), tr1 = P(add(H, mul(d, -ev.shellLen * cal)));
      line(tr0, tr1, 'rgba(255,120,80,0.5)', 2, 0.6);
      drawShell(H, d, ev.V, tp);
    } else {
      const pE = P(E);
      ctx.strokeStyle = 'rgba(255,230,120,0.75)'; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(pE.x, pE.y, 16, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,230,120,0.9)'; ctx.textAlign = 'left';
      ctx.fillText(`Ø ${ev.cal} mm`, pE.x + 19, pE.y - 10);
      // éclair d'impact et gerbe d'étincelles vers l'extérieur
      if (tp < 0.6e-3) glow(pE, Math.max(10, screenR(E, 0.45)) * (1 - tp / 0.6e-3 * 0.5), 'rgba(255,255,235,1)', 'rgba(255,140,40,0)', 1 - tp / 0.6e-3);
      for (const sp of ev.sparks) {
        if (tp > sp.life) continue;
        const a = add(E, mul(sp.d, sp.v * Math.max(0, tp - 0.15e-3))), b = add(E, mul(sp.d, sp.v * tp));
        line(P(a), P(b), '#ffd98a', 1.4, 1 - tp / sp.life);
      }
      if (ev.outcome === 'ricochet') {
        drawHole(E, ev.n, d, ev.cosI, tp, 'dent');
        const gouge = add(E, mul(norm(sub(ev.ricDir, mul(ev.n, dot(ev.ricDir, ev.n)))), cal * 4));
        line(pE, P(gouge), 'rgba(255,190,90,0.9)', 2);
        const v2 = ev.V * 0.72, H = add(E, mul(ev.ricDir, v2 * tp));
        drawShell(H, ev.ricDir, v2, tp);
      }
      if (ev.extBlast && tp >= ev.extBlast.t) {
        const bl = ev.extBlast, tb = tp - bl.t;
        const Rr = Math.min(2.6, Ballistics.sedov(bl.E, Math.max(1e-6, tb)));
        const c = P(bl.p), rs = screenR(bl.p, Rr);
        glow(c, rs * 0.8, 'rgba(255,250,215,0.95)', 'rgba(255,120,30,0)', Math.max(0, 1 - tb / 2.5e-3));
        glow(c, rs * 1.2, 'rgba(120,100,80,0.45)', 'rgba(60,50,40,0)', Math.max(0, 1 - tb / 6e-3) * 0.8);
        ctx.strokeStyle = 'rgba(220,240,255,0.85)'; ctx.lineWidth = 1.5; ctx.globalAlpha = fade * Math.max(0, 1 - tb / 2e-3);
        ctx.beginPath(); ctx.arc(c.x, c.y, rs, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = fade;
      }
      if (ev.outcome === 'nopen' && !sim) {
        drawHole(E, ev.n, d, ev.cosI, tp, 'dent');
        // l'obus se brise (ou détone) contre le blindage : morceaux renvoyés vers l'avant
        for (const c of ev.chunks) {
          const p = add(E, mul(c.d, c.v * tp));
          const q = P(p);
          const p0 = add(E, mul(c.d, c.v * Math.max(0, tp - 0.25e-3)));
          if (ev.extBlast) line(P(p0), q, tp < 1.5e-3 ? '#ffe9a0' : '#c98a4a', 1.6, Math.max(0, 1 - tp / 3e-3));
          else {
            ctx.fillStyle = '#6a6458'; ctx.globalAlpha = fade * Math.max(0, 1 - tp / 4e-3);
            ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1.5, screenR(p, c.r)), 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = fade;
          }
        }
      } else if (sim) {
        if (ev.outcome === 'pen') drawHole(E, ev.n, d, ev.cosI, tp, 'hole'); else drawHole(E, ev.n, d, ev.cosI, tp, 'dent');
        if (sim.exit && tp >= sim.exit.t) drawHole(sim.exit.p, sim.exit.n, d, 0.8, tp - sim.exit.t, 'hole');
        // jet de charge creuse
        if (sim.jet) {
          const j = sim.jet, q = Math.min(1, Math.max(0, (tp - j.t0) / (j.t1 - j.t0)));
          const b = lerp3(j.a, j.b, q);
          const al = Math.max(0.15, 1 - tp / (ev.tEnd * 0.8));
          line(P(j.a), P(b), 'rgba(140,200,255,0.5)', 7, al);
          line(P(j.a), P(b), '#f4fbff', 2.2, al);
        }
        // noyau de l'obus
        if (sim.core.length > 1) {
          const pts = sim.core, last = pts[pts.length - 1];
          const ttl = Math.min(tp, last.t);
          const trail = [];
          for (const c of pts) if (c.t <= ttl) trail.push(c.p);
          const hp = posAt(pts, ttl);
          if (hp) trail.push(hp);
          for (let i = 1; i < trail.length; i++) line(P(trail[i - 1]), P(trail[i]), 'rgba(255,170,70,0.85)', 2.5, 0.8);
          const exploded = sim.blast && tp >= sim.blast.t && !sim.exit;
          if (hp && !exploded && !(sim.coreStop && tp > last.t + 2e-3)) {
            let k2 = 1; while (k2 < pts.length - 1 && pts[k2].t < ttl) k2++;
            const dir = norm(sub(pts[Math.min(k2, pts.length - 1)].p, pts[k2 - 1].p));
            const vv = pts[Math.min(k2, pts.length - 1)].v || 0;
            drawShell(hp, Math.hypot(dir[0], dir[1], dir[2]) ? dir : d, Math.max(1, vv), tp);
          }
        }
        // éclats : traînées dont la couleur suit la température
        const streak = ev.tEnd * 0.08;
        for (const f of sim.frags) {
          const p1 = posAt(f.pts, tp);
          if (!p1) continue;
          const lastT = f.pts[f.pts.length - 1].t;
          const p0 = posAt(f.pts, Math.max(f.pts[0].t, tp - streak)) || p1;
          const a = P(p0), b = P(p1);
          const age = tp - f.pts[0].t;
          const hot = f.hot ? Math.max(0, 1 - age / 0.012) : Math.max(0, 0.5 - age / 0.012);
          const col = hot > 0.6 ? '#fffbe6' : hot > 0.3 ? '#ffd56a' : hot > 0.05 ? '#ff9a3a' : '#9c8f78';
          const wd = Math.max(1.6, Math.min(5, screenR(p1, Math.cbrt(f.m / 7850) * 1.2)));
          if (tp <= lastT) line(a, b, col, wd, 0.95);
          else {
            ctx.fillStyle = col; ctx.globalAlpha = fade * Math.max(0.25, 1 - (tp - lastT) / (ev.tEnd * 0.5));
            ctx.beginPath(); ctx.arc(b.x, b.y, wd * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = fade;
          }
        }
        // détonation de la charge : onde de choc (Sedov-Taylor) et boule de feu
        if (sim.blast && tp >= sim.blast.t) {
          const bl = sim.blast, tb = tp - bl.t;
          const Rr = Math.min(2.2, Ballistics.sedov(bl.E, Math.max(1e-6, tb)));
          const c = P(bl.p), rs = screenR(bl.p, Rr);
          glow(c, rs * 0.75, 'rgba(255,250,215,0.95)', 'rgba(255,120,30,0)', Math.max(0, 1 - tb / 6e-3));
          glow(c, rs * 1.1, 'rgba(255,150,50,0.35)', 'rgba(120,40,10,0)', Math.max(0, 1 - tb / 12e-3));
          ctx.strokeStyle = 'rgba(220,240,255,0.8)'; ctx.lineWidth = 1.5; ctx.globalAlpha = fade * Math.max(0, 1 - tb / 3e-3);
          ctx.beginPath(); ctx.arc(c.x, c.y, rs, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = fade;
        }
        // départ de feu dans les réservoirs
        if (sim.fuel != null && tp >= sim.fuel) {
          ev.mods.forEach((m, i) => {
            if (m.kind !== 'fuel') return;
            const c = P(m.c);
            for (let k = 0; k < 4; k++) glow({ x: c.x + (Math.random() - 0.5) * 18, y: c.y - Math.random() * 14 }, 8 + Math.random() * 10, 'rgba(255,200,80,0.9)', 'rgba(255,60,10,0)', 0.7);
          });
        }
        // explosion des munitions
        if (ev.detT != null && tp >= ev.detT) {
          const kk = (tp - ev.detT) / Math.max(1e-4, ev.tEnd - ev.detT);
          const c = P([0, 0, Sd.ht * 0.7]);
          const rr = Math.min(w, 40 + kk * w * 0.9);
          glow(c, rr, 'rgba(255,250,215,0.95)', 'rgba(110,30,10,0)', Math.max(0.2, 1 - kk * 0.5));
        }
        // équipiers tués : croix rouges
        ev.mods.forEach((m, i) => {
          if (m.kind !== 'crew' || ev.after[i] > 0 || ev.touch[i] == null || tp < ev.touch[i]) return;
          const c = P(m.frame === 'turret' ? M4.apply(tm, m.c) : m.c);
          ctx.strokeStyle = '#ff4a3a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(c.x - 5, c.y - 5); ctx.lineTo(c.x + 5, c.y + 5); ctx.moveTo(c.x + 5, c.y - 5); ctx.lineTo(c.x - 5, c.y + 5); ctx.stroke();
        });
      }
    }
    ctx.restore();

    // --- Textes ---
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = ev.friendly ? '#ffaa44' : '#5fb4ff'; ctx.lineWidth = 2;
    ctx.strokeRect(X - 1, Y - 1, w + 2, h + 2);
    ctx.textAlign = 'left';
    const lines = ev.data;
    const show = ct < T_APP ? 2 : Math.min(lines.length, 2 + Math.floor((ct - T_APP) / 0.25));
    const hh = 18 + show * 12.5;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(X, Y, w, hh);
    ctx.font = '700 12.5px system-ui, sans-serif'; ctx.fillStyle = ev.friendly ? '#ffaa44' : '#8cc8ff';
    ctx.fillText((ev.friendly ? 'TIR ALLIÉ · ' : '') + "CAMÉRA D'IMPACT · " + ev.target, X + 9, Y + 15);
    ctx.font = '600 10.5px system-ui, sans-serif';
    for (let i = 0; i < show; i++) { ctx.fillStyle = lines[i].c; ctx.fillText(lines[i].t, X + 9, Y + 28 + i * 12.5); }
    // horloge physique
    const slow = ct < T_APP ? T_APP / ev.tApp : T_IN / ev.tEnd;
    const tTxt = `t = ${tp >= 0 ? '+' : '−'}${fmt(Math.abs(tp) * 1000, 2)} ms`;
    ctx.font = '700 13px ui-monospace, monospace'; ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(X + w - 190, Y + h - 40, 190, 40);
    ctx.fillStyle = '#e9f4ff'; ctx.fillText(tTxt, X + w - 10, Y + h - 22);
    ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = '#9fc4e6';
    ctx.fillText(ct < T_APP + T_IN ? `ralenti ×${Math.round(slow).toLocaleString('fr-FR')}` : 'arrêt sur image', X + w - 10, Y + h - 8);
    // bilan des modules, au fil des impacts
    if (tp >= 0 && ev.results.length) {
      const items = ev.results.filter(r => r.time == null || tp >= r.time);
      const bh = items.length * 12.5 + 8;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(X, Y + h - bh, Math.min(w * 0.42, 230), bh);
      ctx.font = '700 10.5px system-ui, sans-serif';
      items.forEach((r, i) => { ctx.fillStyle = r.c; ctx.fillText(r.t, X + 8, Y + h - bh + 14 + i * 12.5); });
    }
    ctx.restore();
  }

  return { init, play, active, time, stop, update, draw, seek, release, ev: () => cur ? cur.ev : null, DUR, T_HIT, T_IN, phys: T_APP + T_IN };
})();
