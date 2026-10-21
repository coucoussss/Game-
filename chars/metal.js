'use strict';
// Simulation de la déformation du métal à l'impact : péridynamique à liaisons (bond-based),
// coupe 2D dans le plan de l'impact (contraintes planes, épaisseur unitaire).
// - chaque particule est liée à ses voisines dans un horizon δ ≈ 2h
// - liaison élastique (micromodule c = 9E / (π δ³)) puis parfaitement plastique au-delà de σy / E
// - rupture de la liaison au-delà de l'allongement critique : fissures, bouchon, pétales, écaillage
// - le travail plastique chauffe la matière (cisaillement adiabatique)
// - contact par pénalité entre particules non liées, couche absorbante sur les bords de la plaque
const MetalSim = (() => {
  const MAT = {
    rha: { name: 'acier de blindage', rho: 7850, E: 207e9, sy: 1.0e9, sc: 0.1, cp: 460 },
    steel: { name: 'acier trempé', rho: 7850, E: 210e9, sy: 1.6e9, sc: 0.07, cp: 460 },
    cap: { name: 'coiffe', rho: 7850, E: 205e9, sy: 0.9e9, sc: 0.12, cp: 460 },
    wc: { name: 'carbure de tungstène', rho: 14500, E: 600e9, sy: 3.5e9, sc: 0.014, cp: 200 },
    cu: { name: 'cuivre', rho: 8900, E: 120e9, sy: 0.3e9, sc: 1.2, cp: 385 },
  };
  const MATS = Object.keys(MAT);

  // o : { d, T (m), theta (rad), V (m/s), kind, jetLen (m), P0 (Pa), maxN }
  function create(o) {
    const d = o.d, T = o.T, th = o.theta || 0, kind = o.kind;
    const maxPlate = o.maxN || 2300;
    // ----- plaque -----
    let ny = Math.max(4, Math.min(22, Math.round(T / (d / 10))));
    let h = T / ny;
    const W0 = 4 * d + 2 * T, extra = 3 * d * Math.min(2, Math.tan(Math.min(th, 1.2)));
    let x0 = -2 * d - T, x1 = 2 * d + T + extra;
    while (Math.ceil((x1 - x0) / h) * ny > maxPlate) { ny = Math.max(3, ny - 1); h = T / ny; }
    const nx = Math.ceil((x1 - x0) / h);
    const hp = Math.max(h, d / 13);
    // ----- obus (repère : s le long de l'axe, w transverse) -----
    const pts = [];
    const ux = Math.sin(th), uy = -Math.cos(th), nxv = Math.cos(th), nyv = Math.sin(th);
    let Lp = 0;
    const addProj = (mat, sMin, sMax, rOf, vOf) => {
      for (let s = sMax - hp / 2; s > sMin; s -= hp) {
        const r = rOf(s);
        for (let w = -r + hp / 2; w <= r - hp / 2 + 1e-9; w += hp) pts.push([s, w, mat, vOf ? vOf(s) : o.V]);
      }
    };
    if (kind === 'HEAT') {
      // jet de cuivre étiré : 6 500 m/s en tête, 2 500 m/s en queue
      Lp = o.jetLen || 3 * d;
      const rj = Math.max(hp, 0.12 * d);
      addProj(MATS.indexOf('cu'), -Lp, 0, () => rj, s => 2500 + (6500 - 2500) * (1 + s / Lp));
    } else if (kind === 'APCR') {
      Lp = 2.4 * d;
      const rc = 0.21 * d, ln = 0.5 * d;
      addProj(MATS.indexOf('wc'), -Lp, 0, s => s > -ln ? Math.max(hp * 0.5, rc * Math.min(1, (-s + hp) / ln)) : rc);
    } else if (kind !== 'HE') {
      Lp = 3.2 * d;
      const ln = 1.1 * d, R = d / 2;
      const nose = s => s > -ln ? Math.max(hp * 0.5, R * Math.sqrt(Math.max(0, 1 - Math.pow((s + ln) / ln, 2)))) : R;
      const capT = kind === 'AP' ? 0 : 0.35 * d;
      for (let s = -hp / 2; s > -Lp; s -= hp) {
        const r = nose(s);
        const mat = s > -capT ? MATS.indexOf('cap') : MATS.indexOf('steel');
        for (let w = -r + hp / 2; w <= r - hp / 2 + 1e-9; w += hp) pts.push([s, w, mat, o.V]);
      }
    }
    const Np = nx * ny, Nq = pts.length, N = Np + Nq;
    const X = new Float64Array(N), Y = new Float64Array(N), VX = new Float64Array(N), VY = new Float64Array(N);
    const AX = new Float64Array(N), AY = new Float64Array(N), HEAT = new Float32Array(N), SIG = new Float32Array(N);
    const VOL = new Float32Array(N), RHO = new Float32Array(N), MATI = new Uint8Array(N), BODY = new Uint8Array(N);
    const X0 = new Float64Array(N), Y0 = new Float64Array(N), FREE = new Uint8Array(N);
    const FIX = new Uint8Array(N), DAMP = new Float32Array(N), NB = new Uint16Array(N), NBR = new Uint16Array(N), HR = new Float32Array(N);
    let k = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      X[k] = X0[k] = x0 + (i + 0.5) * h; Y[k] = Y0[k] = -(j + 0.5) * h;
      VOL[k] = h * h; RHO[k] = MAT.rha.rho; MATI[k] = 0; BODY[k] = 0; HR[k] = h;
      const edge = Math.min(i, nx - 1 - i);
      if (edge < 2) FIX[k] = 1;
      else if (edge < 8) DAMP[k] = 0.02 * (8 - edge) / 6;
      k++;
    }
    const gap = 0.55 * (h + hp);
    for (const p of pts) {
      const s = p[0], w = p[1];
      X[k] = s * ux + w * nxv; Y[k] = gap + s * uy + w * nyv;
      VX[k] = p[3] * ux; VY[k] = p[3] * uy;
      const m = MAT[MATS[p[2]]] || MAT.cu;
      VOL[k] = hp * hp; RHO[k] = m.rho; MATI[k] = p[2]; BODY[k] = 1; HR[k] = hp;
      k++;
    }
    // ----- liaisons (horizon δ = 2,01 h, à l'intérieur d'un même corps) -----
    const bi = [], bj = [], bl = [];
    const buildBonds = (from, to, hh) => {
      const del = 2.015 * hh, cs = del, map = new Map();
      const key = (cx, cy) => cx * 100003 + cy;
      for (let i = from; i < to; i++) {
        const cx = Math.floor(X[i] / cs), cy = Math.floor(Y[i] / cs), kk = key(cx, cy);
        let a = map.get(kk); if (!a) map.set(kk, a = []); a.push(i);
      }
      for (let i = from; i < to; i++) {
        const cx = Math.floor(X[i] / cs), cy = Math.floor(Y[i] / cs);
        for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
          const a = map.get(key(cx + gx, cy + gy)); if (!a) continue;
          for (const j of a) {
            if (j <= i) continue;
            const dx = X[j] - X[i], dy = Y[j] - Y[i], r = Math.hypot(dx, dy);
            if (r < del) { bi.push(i); bj.push(j); bl.push(r); NB[i]++; NB[j]++; }
          }
        }
      }
    };
    buildBonds(0, Np, h);
    buildBonds(Np, N, hp);
    const M = bi.length;
    const BI = Int32Array.from(bi), BJ = Int32Array.from(bj), BL = Float32Array.from(bl);
    const SP = new Float32Array(M), ALIVE = new Uint8Array(M).fill(1);
    // micromodule par liaison (même matériau aux deux bouts)
    const BC = new Float32Array(M), BSY = new Float32Array(M), BSC = new Float32Array(M), BMAT = new Uint8Array(M);
    for (let b = 0; b < M; b++) {
      const i = BI[b], m = MAT[MATS[MATI[i]]] || MAT.cu, hh = HR[i], del = 2.015 * hh;
      BC[b] = 9 * m.E / (Math.PI * del * del * del);
      BSY[b] = m.sy / m.E; BSC[b] = m.sc; BMAT[b] = MATI[i];
    }
    // coefficients de force précalculés : a_i = c · V_j / ρ_i, a_j = c · V_i / ρ_j
    const KI = new Float64Array(M), KJ = new Float64Array(M), KH = new Float64Array(M);
    for (let b = 0; b < M; b++) {
      const i = BI[b], j = BJ[b];
      KI[b] = BC[b] * VOL[j] / RHO[i]; KJ[b] = BC[b] * VOL[i] / RHO[j];
      KH[b] = 0.45 * BC[b] * BSY[b] * BL[b] * VOL[i] * VOL[j];
    }
    // pas de temps : condition de Courant sur la vitesse des ondes et celle de la matière
    let cw = Math.sqrt(MAT.rha.E / MAT.rha.rho);
    for (let i = Np; i < N; i++) { const m = MAT[MATS[MATI[i]]]; cw = Math.max(cw, Math.sqrt(m.E / m.rho)); }
    const vmax = kind === 'HEAT' ? 6500 : o.V || 0;
    const dt = 0.3 * Math.min(h, hp) / Math.max(cw * 1.3, vmax * 2);
    const tMax = kind === 'HE' ? 9 * T / 5900 + 60e-6 : kind === 'HEAT' ? 2.2 * (T / Math.cos(Math.min(th, 1.3)) + Lp) / 4500 : Math.min(1e-3, 1.7 * (T / Math.cos(Math.min(th, 1.3)) + Lp + d) / Math.max(250, o.V));
    // grille de contact uniforme (tableaux typés)
    const cell = Math.max(h, hp);
    const gx0 = x0 - 2 * d, gy0 = -T - 4 * d, gx1 = x1 + 2 * d, gy1 = Math.max(2 * d, Lp + 2 * d);
    const GW = Math.ceil((gx1 - gx0) / cell) + 1, GH = Math.ceil((gy1 - gy0) / cell) + 1;
    const gHead = new Int32Array(GW * GH), gNext = new Int32Array(N), gCell = new Int32Array(N);
    const frames = [];
    const WF = 2 * Math.PI / 300e-6, KF = WF * WF, CF = WF, REL2 = Math.pow(Math.max(2.5 * h, 0.35 * T), 2);
    const CC = 9 * MAT.rha.E / (Math.PI * Math.pow(2.015 * h, 3)) * 3;
    const st = { t: 0, step: 0, done: false, maxTemp: 293, broken: 0, perforated: false, vRes: 0 };
    const recEvery = Math.max(1, Math.round(tMax / dt / 90));
    const cp = i => (MAT[MATS[MATI[i]]] || MAT.cu).cp;
    const P0 = o.P0 || 0, tau = 6e-6;

    function step() {
      AX.fill(0); AY.fill(0); SIG.fill(0); NBR.fill(0);
      const cc = CC;
      // liaisons
      const damp = 0.48 * dt;
      for (let b = 0; b < M; b++) {
        if (!ALIVE[b]) continue;
        const i = BI[b], j = BJ[b];
        const dx = X[j] - X[i], dy = Y[j] - Y[i];
        const r = Math.sqrt(dx * dx + dy * dy) || 1e-12, L0 = BL[b];
        const s = r / L0 - 1;
        if (s > BSC[b]) { ALIVE[b] = 0; st.broken++; continue; }
        let se = s - SP[b];
        const sy = BSY[b];
        if (se > sy) { const dp = se - sy; SP[b] += dp; se = sy; HEAT[i] += KH[b] * dp; HEAT[j] += KH[b] * dp; }
        else if (se < -sy) { const dp = -sy - se; SP[b] -= dp; se = -sy; HEAT[i] += KH[b] * dp; HEAT[j] += KH[b] * dp; }
        // amortissement visqueux léger le long de la liaison
        const dvr = ((VX[j] - VX[i]) * dx + (VY[j] - VY[i]) * dy) / r;
        const g = (se + damp * dvr / L0) / r;
        const ex = g * dx, ey = g * dy;
        AX[i] += ex * KI[b]; AY[i] += ey * KI[b];
        AX[j] -= ex * KJ[b]; AY[j] -= ey * KJ[b];
        const a = (se < 0 ? -se : se) / sy;
        SIG[i] += a; SIG[j] += a; NBR[i]++; NBR[j]++;
      }
      // contacts (toutes particules proches, liées ou non)
      gHead.fill(-1);
      for (let i = 0; i < N; i++) {
        const cx = Math.floor((X[i] - gx0) / cell), cy = Math.floor((Y[i] - gy0) / cell);
        if (cx < 1 || cy < 1 || cx >= GW - 1 || cy >= GH - 1) { gCell[i] = -1; continue; }
        const c = cy * GW + cx;
        gCell[i] = c; gNext[i] = gHead[c]; gHead[c] = i;
      }
      for (let i = 0; i < N; i++) {
        const c0 = gCell[i];
        if (c0 < 0) continue;
        const xi = X[i], yi = Y[i], hi = HR[i];
        for (let gy = -1; gy <= 1; gy++) for (let gx = -1; gx <= 1; gx++) {
          let j = gHead[c0 + gy * GW + gx];
          while (j >= 0) {
            if (j > i) {
              const r0 = 0.82 * (hi + HR[j]) / 2;
              const dx = X[j] - xi, dy = Y[j] - yi;
              const r2 = dx * dx + dy * dy;
              if (r2 < r0 * r0) {
                const r = Math.sqrt(r2) || 1e-9, f = cc * (r0 - r) / r0;
                const fx = f * dx / r, fy = f * dy / r;
                AX[i] -= fx * VOL[j] / RHO[i]; AY[i] -= fy * VOL[j] / RHO[i];
                AX[j] += fx * VOL[i] / RHO[j]; AY[j] += fy * VOL[i] / RHO[j];
              }
            }
            j = gNext[j];
          }
        }
      }
      // explosif : impulsion de pression sur la face avant
      if (P0 && st.t < 8 * tau) {
        const P = P0 * Math.exp(-st.t / tau);
        for (let i = 0; i < Np; i++) {
          if (Y[i] < -h) continue;
          const g = Math.exp(-Math.pow(X[i] / (0.9 * d), 2));
          AY[i] -= P * g / h / RHO[i];
        }
      }
      // appui élastique : le reste de la caisse retient la plaque (période ≈ 300 µs, bien plus lente
      // que les ondes locales) ; il lâche dès que la matière est arrachée
      for (let i = 0; i < Np; i++) {
        if (FREE[i]) continue;
        const ex = X[i] - X0[i], ey = Y[i] - Y0[i];
        if (ex * ex + ey * ey > REL2) { FREE[i] = 1; continue; }
        AX[i] -= KF * ex + CF * VX[i]; AY[i] -= KF * ey + CF * VY[i];
      }
      // intégration (Euler semi-implicite)
      for (let i = 0; i < N; i++) {
        if (FIX[i]) { VX[i] = 0; VY[i] = 0; continue; }
        VX[i] += AX[i] * dt; VY[i] += AY[i] * dt;
        if (DAMP[i]) { VX[i] *= 1 - DAMP[i]; VY[i] *= 1 - DAMP[i]; }
        X[i] += VX[i] * dt; Y[i] += VY[i] * dt;
      }
      st.t += dt; st.step++;
      if (st.step % recEvery === 0) record();
    }

    const temp = i => 293 + HEAT[i] / (RHO[i] * VOL[i] * cp(i));
    function record() {
      const n = N;
      const xy = new Float32Array(n * 2), sg = new Uint8Array(n), tp = new Uint8Array(n), dm = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        xy[2 * i] = X[i]; xy[2 * i + 1] = Y[i];
        sg[i] = Math.min(255, NBR[i] ? SIG[i] / NBR[i] * 200 : 0);
        const T = temp(i);
        if (T > st.maxTemp && BODY[i] === 0) st.maxTemp = T;
        tp[i] = Math.min(255, Math.max(0, (T - 293) / 1400 * 255));
        dm[i] = Math.min(255, (1 - NBR[i] / Math.max(1, NB[i])) * 255);
      }
      frames.push({ t: st.t, xy, sg, tp, dm });
    }

    function finish() {
      st.done = true;
      record();
      // bilan : centre de masse de l'obus, matière arrachée derrière la plaque
      let mx = 0, my = 0, mv = 0, mm = 0;
      for (let i = Np; i < N; i++) { const m = RHO[i] * VOL[i]; mx += X[i] * m; my += Y[i] * m; mv += (VX[i] * ux + VY[i] * uy) * m; mm += m; }
      if (mm) { st.cy = my / mm; st.vRes = Math.max(0, mv / mm); }
      // matière détachée : composantes connexes (liaisons intactes) non reliées aux bords fixés
      const par = new Int32Array(Np);
      for (let i = 0; i < Np; i++) par[i] = i;
      const f = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
      for (let b = 0; b < M; b++) {
        if (!ALIVE[b]) continue;
        const i = BI[b], j = BJ[b];
        if (i < Np && j < Np) { const a = f(i), c = f(j); if (a !== c) par[a] = c; }
      }
      const anchored = new Set();
      for (let i = 0; i < Np; i++) if (FIX[i]) anchored.add(f(i));
      const roots = new Map();
      let behind = 0;
      for (let i = 0; i < Np; i++) {
        if (anchored.has(f(i)) || Y[i] > -0.5 * T) continue;
        behind++;
        const r = f(i); roots.set(r, (roots.get(r) || 0) + 1);
      }
      st.ejected = behind;
      // masses rapportées à une épaisseur égale au calibre (passage de la coupe 2D au volume)
      st.ejectedKg = behind * MAT.rha.rho * h * h * d;
      st.fragments = roots.size;
      st.biggestKg = roots.size ? Math.max(...roots.values()) * MAT.rha.rho * h * h * d : 0;
      // part de l'obus passée derrière la plaque
      let pb = 0, pm = 0;
      for (let i = Np; i < N; i++) { const m = RHO[i] * VOL[i]; pm += m; if (Y[i] < -T - h) pb += m; }
      st.projBehind = pm ? pb / pm : 0;
      const plug = 0.3 * Math.min(d, 2 * T) * T / (h * h);
      st.perforated = kind === 'HE' ? behind >= 3 : st.projBehind > 0.2 || behind >= plug;
      // profondeur du cratère et déformation de la face arrière
      let bulge = 0;
      for (let i = 0; i < Np; i++) if (!FIX[i] && anchored.has(f(i))) bulge = Math.max(bulge, -(Y[i] + T));
      st.bulge = Math.max(0, bulge);
      let projBroken = 0, projBonds = 0;
      for (let b = 0; b < M; b++) if (BI[b] >= Np) { projBonds++; if (!ALIVE[b]) projBroken++; }
      st.projDamage = projBonds ? projBroken / projBonds : 0;
    }

    // Avance la simulation pendant au plus « ms » millisecondes ; renvoie vrai quand c'est fini
    function run(ms) {
      if (st.done) return true;
      const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
      while ((typeof performance !== 'undefined' ? performance : Date).now() - t0 < ms) {
        for (let k2 = 0; k2 < 10; k2++) step();
        if (st.t >= tMax) { finish(); return true; }
        // arrêt anticipé : obus immobilisé
        if (kind !== 'HE' && kind !== 'HEAT' && st.step > 400 && st.step % 50 === 0) {
          let mv = 0, mm = 0;
          for (let i = Np; i < N; i++) { const m = RHO[i] * VOL[i]; mv += (VX[i] * ux + VY[i] * uy) * m; mm += m; }
          if (mm && Math.abs(mv / mm) < 0.01 * o.V) { finish(); return true; }
        }
      }
      return false;
    }
    record();
    return {
      run, frames, st, N, Np, expected: Math.ceil(tMax / dt / recEvery) + 1, body: BODY, mat: MATI, h, hp, T, d, theta: th, dt, tMax, bonds: M,
      bounds: { x0, x1, y0: -T - 2.5 * d, y1: Math.max(1.5 * d, Lp * Math.cos(th) + gap) },
      matName: i => (MAT[MATS[i]] || MAT.cu).name,
    };
  }

  // ===================== Rendu de la coupe =====================
  // couleur selon la contrainte (rapportée à la limite élastique), la température et l'endommagement
  const lerp = (a, b, k) => a + (b - a) * k;
  function stressColor(v) { // v ∈ [0, 1] : 1 = plastification
    const stops = [[0, 46, 52, 62], [0.25, 40, 80, 150], [0.5, 40, 170, 210], [0.75, 230, 220, 80], [1, 240, 80, 40]];
    for (let i = 1; i < stops.length; i++) if (v <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i], k = (v - a[0]) / (b[0] - a[0]);
      return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
    }
    return [240, 80, 40];
  }
  function draw(ctx, sim, fi, X, Y, w, h, opts = {}) {
    const fr = sim.frames[Math.max(0, Math.min(sim.frames.length - 1, fi))];
    if (!fr) return;
    const d = sim.d, T = sim.T;
    const vx0 = -1.7 * d - 0.4 * T, vx1 = 1.9 * d + 0.9 * T + 1.2 * d * Math.min(1.5, Math.tan(Math.min(sim.theta, 1.2)));
    const vy0 = -T - 1.5 * d, vy1 = 1.0 * d;
    const sc = Math.min(w / (vx1 - vx0), h / (vy1 - vy0));
    const ox = X + (w - (vx1 - vx0) * sc) / 2 - vx0 * sc, oy = Y + (h - (vy1 - vy0) * sc) / 2 + vy1 * sc;
    ctx.save();
    ctx.beginPath(); ctx.rect(X, Y, w, h); ctx.clip();
    ctx.fillStyle = '#07090c'; ctx.fillRect(X, Y, w, h);
    // contour initial de la plaque
    ctx.strokeStyle = 'rgba(160,190,220,0.35)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.strokeRect(ox + vx0 * sc - 50, oy, (vx1 - vx0) * sc + 100, T * sc);
    ctx.setLineDash([]);
    const xy = fr.xy, n = sim.N;
    for (let i = 0; i < n; i++) {
      const px = ox + xy[2 * i] * sc, py = oy - xy[2 * i + 1] * sc;
      if (px < X - 4 || py < Y - 4 || px > X + w + 4 || py > Y + h + 4) continue;
      const hs = (sim.body[i] ? sim.hp : sim.h) * sc * 1.06;
      let c;
      const sv = fr.sg[i] / 200, tv = fr.tp[i] / 255, dv = fr.dm[i] / 255;
      if (sim.body[i]) {
        const m = sim.mat[i];
        c = m === 4 ? [255, 150, 70] : m === 3 ? [150, 160, 170] : m === 2 ? [150, 120, 90] : [120, 116, 108];
        if (m !== 4) { const s2 = stressColor(Math.min(1, sv)); c = [lerp(c[0], s2[0], 0.45), lerp(c[1], s2[1], 0.45), lerp(c[2], s2[2], 0.45)]; }
      } else c = stressColor(Math.min(1, sv));
      if (tv > 0.08) { const k = Math.min(1, (tv - 0.08) * 1.6); c = [lerp(c[0], 255, k), lerp(c[1], 170 + 70 * k, k * 0.8), lerp(c[2], 60 + 150 * Math.max(0, k - 0.6), k)]; }
      if (dv > 0.45) { const k = Math.min(1, (dv - 0.45) * 2); c = [lerp(c[0], 90, k * 0.7), lerp(c[1], 30, k * 0.7), lerp(c[2], 25, k * 0.7)]; }
      ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      ctx.fillRect(px - hs / 2, py - hs / 2, hs, hs);
    }
    // échelle, temps, légende
    const bar = d <= 0.06 ? 0.02 : 0.05;
    ctx.fillStyle = '#dfe8f0'; ctx.fillRect(X + 10, Y + h - 14, bar * sc, 3);
    ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(bar * 100)} cm`, X + 14 + bar * sc, Y + h - 10);
    ctx.textAlign = 'right'; ctx.font = '700 12px ui-monospace, monospace';
    ctx.fillText(`t = ${Math.round(fr.t * 1e6)} µs`, X + w - 8, Y + h - 10);
    const gx = X + w - 128, gy = Y + 8;
    const grd = ctx.createLinearGradient(gx, 0, gx + 80, 0);
    grd.addColorStop(0, 'rgb(46,52,62)'); grd.addColorStop(0.25, 'rgb(40,80,150)'); grd.addColorStop(0.5, 'rgb(40,170,210)'); grd.addColorStop(0.75, 'rgb(230,220,80)'); grd.addColorStop(1, 'rgb(240,80,40)');
    ctx.fillStyle = grd; ctx.fillRect(gx, gy, 80, 6);
    ctx.font = '600 9px system-ui, sans-serif'; ctx.fillStyle = '#c8d2dc'; ctx.textAlign = 'left';
    ctx.fillText('contrainte → limite élastique', gx - 4, gy + 17);
    const grd2 = ctx.createLinearGradient(gx, 0, gx + 80, 0);
    grd2.addColorStop(0, 'rgb(240,120,40)'); grd2.addColorStop(1, 'rgb(255,250,220)');
    ctx.fillStyle = grd2; ctx.fillRect(gx, gy + 22, 80, 6);
    ctx.fillStyle = '#c8d2dc'; ctx.fillText('échauffement 400 → 1 700 K', gx - 4, gy + 39);
    ctx.fillStyle = 'rgb(90,30,25)'; ctx.fillRect(gx, gy + 44, 10, 6);
    ctx.fillStyle = '#c8d2dc'; ctx.fillText('matière rompue', gx + 14, gy + 50);
    ctx.restore();
  }
  return { create, draw, MAT };
})();
if (typeof module !== 'undefined') module.exports = MetalSim;
