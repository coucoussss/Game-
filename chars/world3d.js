'use strict';
// Rendu 3D du champ de bataille : ombres du soleil, ciel, brume, lumières dynamiques, sol détaillé,
// décor (bâtiments, arbres, rochers, herbe), chars, obus, fumées et flammes.
// Repère monde en mètres : X vers l'est, Y vers le nord, Z vers le haut.
const World3D = (() => {
  const { M4, Builder } = G3;
  const IDENT = M4.ident();

  const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute float aMat;
uniform mat4 uVP; uniform mat4 uModel; uniform mat4 uLVP; uniform mat4 uLVPS; uniform float uTime; uniform vec2 uNOff; uniform vec4 uBlast[4]; uniform float uBase;
// souffles (coup de canon, explosion, char qui traverse) : le feuillage s'écarte puis revient en oscillant
vec3 blast(vec3 w, float g){
  float h = clamp(w.z - g, 0.0, 3.0);
  for (int i = 0; i < 4; i++) {
    vec4 b = uBlast[i];
    if (b.z <= 0.0) continue;
    vec2 dv = w.xy - b.xy; float d = length(dv), tau = max(uTime - b.w, 0.0);
    float k = b.z * exp(-d / 6.0) * exp(-tau * 3.0) * sin(tau * 9.0);
    w.xy += dv / max(d, 0.5) * k * h * 0.25; w.z -= k * h * 0.05;
  }
  return w;
}
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec3 vO; varying float vM; varying vec3 vNO; varying vec4 vL; varying vec4 vLS; varying float vG;
void main(){
  vNO = aNor;
  // hauteur du sol sous l'objet : décor posé sur le relief (fraction du matériau, voir buildScene),
  // sinon celle de l'objet dessiné (uBase)
  float g0 = fract(aMat) > 0.005 ? (fract(aMat) - 0.2) * 200.0 : uBase;
  vec4 w = uModel * vec4(aPos, 1.0);
  vec3 nW = normalize(mat3(uModel) * aNor);
  // ombres décalées le long de la normale (pas d'acné sans gros biais) ; la carte statique est
  // calculée sans le vent : on la lit à la position au repos pour que l'ombre suive la feuille
  vLS = uLVPS * vec4(w.xyz + nW * uNOff.y, 1.0);
  if (aMat > 7.5 && aMat < 8.5) {
    float h = max(0.0, w.z - g0 - 0.8);
    w.x += sin(uTime * 1.3 + w.x * 0.15 + w.y * 0.11) * 0.035 * h;
    w.y += cos(uTime * 1.1 + w.y * 0.13 + w.x * 0.07) * 0.025 * h;
    w.xyz = blast(w.xyz, g0);
  }
  if (aMat > 13.5 && aMat < 14.5) {
    // feuilles : balancement de la plante et frémissement de chaque feuille
    float h = max(0.0, w.z - g0 - 0.15);
    float g = sin(uTime * 1.6 + w.x * 0.4 + w.y * 0.3);
    float fl = sin(uTime * 7.0 + aPos.x * 23.0 + aPos.y * 17.0 + aPos.z * 11.0);
    w.x += g * 0.04 * h + fl * 0.012;
    w.y += g * 0.025 * h + fl * 0.01;
    w.z += fl * 0.008;
    w.xyz = blast(w.xyz, g0);
  }
  vW = w.xyz; vO = aPos; vN = nW; vC = aCol; vM = aMat; vG = g0; vL = uLVP * vec4(w.xyz + nW * uNOff.x, 1.0);
  gl_Position = uVP * w;
}`;
  // Brume : exponentielle au carré selon la distance, plus une nappe basse dont la densité décroît
  // avec l'altitude (intégrée le long du rayon), teintée vers le soleil quand on le regarde
  const FOG = `
float fogAt(vec3 W, vec3 rd, float dist){
  float fh = 0.0;
  if (uFogH.x > 0.0) {
    float b = uFogH.y, k = uFogH.x * exp(-b * uEye.z);
    fh = abs(rd.z) < 1e-3 ? k * dist : k * (1.0 - exp(-b * rd.z * dist)) / (b * rd.z);
  }
  return clamp(1.0 - exp(-fh - pow(dist * uFogD, 2.0)), 0.0, 1.0);
}
vec3 fogCol(vec3 rd){ float sa = pow(max(dot(rd, normalize(uSun)), 0.0), 8.0); return mix(uFogCol, uSunCol * 0.55, sa * 0.6); }
// tonalité (ACES) puis étalonnage propre à chaque bataille : gain par canal, relèvement des noirs, saturation
uniform vec3 uGain; uniform float uLift; uniform float uSat;
vec3 tm(vec3 c){
  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0) * uGain + uLift;
  c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uSat);
  return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
}
`;
  const FS = `
precision highp float;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec3 vO; varying float vM; varying vec3 vNO; varying vec4 vL; varying vec4 vLS; varying float vG;
uniform vec3 uEye; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSkyCol; uniform vec3 uBounce;
uniform vec3 uFogCol; uniform float uFogD; uniform vec3 uZenith; uniform vec3 uHorizon;
uniform vec3 uCamo0; uniform vec3 uCamo1; uniform vec3 uCamo2; uniform float uPat;
uniform float uBurnt; uniform vec4 uTint; uniform float uTread; uniform float uSeed; uniform float uSnow;
uniform sampler2D uShadow; uniform sampler2D uShadowS; uniform vec2 uShT; uniform vec2 uSR; uniform sampler2D uGround; uniform vec2 uMap;
uniform vec4 uLP[NL]; uniform vec3 uLC[NL]; uniform vec4 uLD[NL]; uniform float uNL; uniform float uTime;
uniform float uWet; uniform vec2 uFogH; uniform vec3 uOuter; uniform float uPix; uniform float uCloud; uniform vec2 uWind; uniform float uNight;
uniform vec4 uTk[10]; uniform vec2 uTkH[10]; uniform float uNT;
` + FOG + `
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ return 0.5 * n3(p) + 0.25 * n3(p * 2.03) + 0.125 * n3(p * 4.01) + 0.0625 * n3(p * 8.07); }
#if DEPTH_TEX
float dAt(sampler2D t, vec2 uv){ return texture2D(t, uv).r; }
#else
float dAt(sampler2D t, vec2 uv){ return dot(texture2D(t, uv), vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0)); }
#endif
// filtrage bilinéaire des comparaisons sur KR x KR texels (pénombre lisse, sans marches)
float shadowAt(sampler2D t, vec4 l, float ts, float bias){
  vec3 p = l.xyz / l.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float z = p.z - bias;
  vec2 st = p.xy / ts - 0.5, f = fract(st), b0 = (floor(st) - float((KR - 1) / 2) + 0.5) * ts;
  float s = 0.0;
  for (int j = 0; j < KR; j++) for (int i = 0; i < KR; i++) {
    float wx = i == 0 ? 1.0 - f.x : (i == KR - 1 ? f.x : 1.0), wy = j == 0 ? 1.0 - f.y : (j == KR - 1 ? f.y : 1.0);
    s += wx * wy * step(z, dAt(t, b0 + vec2(float(i), float(j)) * ts));
  }
  return s / float((KR - 1) * (KR - 1));
}
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uEye - vW);
  float dist = length(uEye - vW);
  if (vM > 10.5 && vM < 11.5) {
    // ciel : dégradé, halo et disque du soleil
    vec3 d = normalize(vW - uEye);
    float h = clamp(d.z, -0.2, 1.0);
    vec3 sky = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.55));
    float sd = max(dot(d, normalize(uSun)), 0.0);
    sky += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.18);
    sky += vec3(0.02) * fbm(d * 6.0 + vec3(uTime * 0.01, 0.0, 0.0)) * smoothstep(0.0, 0.3, h);
    // nuages projetés sur un plafond, qui dérivent avec le vent ; éclairés du côté du soleil
    if (uCloud > 0.0) {
      vec2 cuv = d.xy / max(d.z, 0.05) * 0.9 + uWind * uTime * 0.004;
      float cd = smoothstep(0.48, 0.78, fbm(vec3(cuv * 1.7, uTime * 0.003))) * smoothstep(0.02, 0.2, h);
      vec3 cc = mix(uHorizon * 1.1 + 0.05, uSunCol * 0.55 + uSkyCol * 0.5, 0.5 + 0.5 * dot(d, normalize(uSun)));
      sky = mix(sky, cc, cd * uCloud);
    }
    // étoiles qui scintillent, la nuit, au-dessus de l'horizon
    if (uNight > 0.0) {
      vec3 sp = floor(d * 480.0);
      sky += vec3(step(0.9986, h3(sp)) * smoothstep(0.05, 0.4, h) * uNight * (0.6 + 0.4 * sin(uTime * 3.0 + h3(sp + 7.0) * 40.0))) * (1.0 - uCloud * 0.8);
    }
    gl_FragColor = vec4(tm(sky), 1.0);
    return;
  }
  vec3 base = vC;
  vec3 P = vO + vec3(uSeed);
  float paint = 0.0, ks = 0.08, shin = 16.0, trans = 0.0;
  vec3 emi = vec3(0.0);
  if (vM < 0.5) { paint = 1.0; }
  else if (vM < 1.5) {
    float a = fbm(P * 1.25 + 3.1), b = fbm(P * 1.3 + 17.3);
    // motifs : 0 taches (trois tons), 1 uni, 2 bandes ondulées, 3 embuscade (taches et pois clairs),
    // 4 lavis d'hiver (blanc passé à la brosse, usé, la teinte d'origine reparaît)
    if (uPat < 0.5 || (uPat > 2.5 && uPat < 3.5)) {
      base = uCamo0;
      base = mix(base, uCamo1, smoothstep(0.50, 0.535, a));
      base = mix(base, uCamo2, smoothstep(0.53, 0.565, b));
      if (uPat > 2.5) {
        vec3 q = vO * 7.0; float dd = length(fract(q) - 0.5);
        float dots = (1.0 - smoothstep(0.16, 0.2, dd)) * step(0.55, h3(floor(q)));
        base = mix(base, uCamo0 * 1.18, dots * step(0.5, max(smoothstep(0.50, 0.535, a), smoothstep(0.53, 0.565, b))));
      }
    } else if (uPat < 1.5) {
      base = uCamo0;
    } else if (uPat < 2.5) {
      float sw = sin((vO.x * 1.7 + vO.z * 0.6 + fbm(P * 0.9) * 2.2) * 3.4);
      base = mix(uCamo0, uCamo1, smoothstep(0.35, 0.42, sw));
      base = mix(base, uCamo2, smoothstep(0.35, 0.42, -sw) * step(0.48, b));
    } else {
      float w = smoothstep(0.38, 0.58, fbm(P * vec3(2.6, 2.6, 0.8) + 5.0) + 0.12 * fbm(P * 9.0));
      base = mix(uCamo1, uCamo0, w);
      base = mix(base, uCamo2, smoothstep(0.62, 0.66, b) * (1.0 - w));
    }
    // Zimmerit : pâte striée de cannelures verticales (pas d'environ 3 cm) posée en bandes de 11 cm,
    // seulement sur les faces verticales ou inclinées
    if (vM > 1.1) {
      vec3 no = normalize(vNO);
      if (abs(no.z) < 0.75) {
        float u = abs(no.x) > abs(no.y) ? vO.y : vO.x;
        float row = floor(vO.z * 9.0), fz = fract(vO.z * 9.0);
        float r = sin((u + row * 0.013 + h3(vec3(row, 1.0, 2.0)) * 0.02) * 140.0);
        // atténué avec la distance pour éviter le moiré quand les cannelures deviennent plus fines qu'un pixel
        float band = smoothstep(0.0, 0.1, fz) * smoothstep(1.0, 0.9, fz) * clamp(1.25 - length(uEye - vW) / 14.0, 0.0, 1.0);
        vec3 tg = normalize(cross(N, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
        N = normalize(N + tg * r * 0.3 * band + vec3(0.0, 0.0, 1.0) * band * 0.06);
        base *= 0.96 + 0.07 * r * band;
      }
    }
    paint = 1.0;
  } else if (vM < 2.5) {
    float s = fract((vO.x + uTread + vO.z * 0.6) * 6.5);
    base = vC * (0.6 + 0.55 * smoothstep(0.15, 0.25, s) * (1.0 - smoothstep(0.75, 0.85, s)));
    ks = 0.35; shin = 30.0;
  } else if (vM < 3.5) { ks = 0.5; shin = 50.0; }
  else if (vM < 4.5) { ks = 0.03; }
  else if (vM < 5.5) { ks = 0.9; shin = 90.0; }
  else if (vM < 6.5) { base *= 0.8 + 0.3 * fbm(vec3(vO.x * 20.0, vO.y * 2.0, vO.z * 2.0)); }
  else if (vM < 7.5) { }
  else if (vM < 8.5) {
    // feuillage : variations de teinte, lumière qui traverse les feuilles
    base *= 0.7 + 0.55 * fbm(vW * 1.7);
    base = mix(base, vec3(0.92, 0.95, 0.98), uSnow * smoothstep(0.35, 0.8, N.z) * 0.85);
    trans = 0.35; ks = 0.03;
  } else if (vM < 9.5) {
    // sol : texture de la carte (traces, cratères) et détail procédural
    vec2 uv = vec2(vW.x / uMap.x, -vW.y / uMap.y);
    base = texture2D(uGround, clamp(uv, 0.001, 0.999)).rgb;
    // hors de la carte, la couleur du terrain remplace les bords étirés de la texture
    float o = max(max(-uv.x, uv.x - 1.0), max(-uv.y, uv.y - 1.0));
    base = mix(base, uOuter, smoothstep(0.0, 0.03, o));
    // les détails plus fins qu'un pixel s'effacent (pas de scintillement au loin)
    float fw = dist * uPix / max(abs(V.z), 0.15);
    float k2 = 1.0 - smoothstep(0.15, 0.5, fw), k3 = 1.0 - smoothstep(0.03, 0.09, fw), kb = 1.0 - smoothstep(0.1, 0.35, fw);
    float g1 = fbm(vec3(vW.xy * 0.35, 1.0)), g2 = k2 > 0.0 ? fbm(vec3(vW.xy * 2.2, 7.0)) : 0.5, g3 = k3 > 0.0 ? n3(vec3(vW.xy * 9.0, 3.0)) : 0.5;
    base *= 0.62 + 0.42 * g1 + 0.22 * (g2 - 0.5) * k2 + 0.12 * (g3 - 0.5) * k3;
    if (kb > 0.0) {
      float e = 0.08;
      vec3 bump = vec3(fbm(vec3(vW.xy * 2.2 + vec2(e, 0.0), 7.0)) - g2, fbm(vec3(vW.xy * 2.2 + vec2(0.0, e), 7.0)) - g2, 0.0);
      N = normalize(N - bump * 1.8 * kb);
    }
    // sol détrempé par la pluie : plus sombre et luisant
    ks = mix(0.04, 0.35, uWet); shin = mix(16.0, 60.0, uWet); base *= 1.0 - 0.25 * uWet;
  } else if (vM < 10.5) {
    // tuiles : rangées et irrégularités
    float r = fract(vO.z * 3.2 + vO.x * 0.0), c = fract(vO.x * 2.6 + vO.y * 2.6 + floor(vO.z * 3.2) * 0.5);
    base *= 0.78 + 0.25 * smoothstep(0.0, 0.15, r) + 0.12 * h3(floor(vec3(vO.x * 2.6, vO.y * 2.6, vO.z * 3.2)));
    base *= 0.9 + 0.1 * smoothstep(0.0, 0.08, c);
    base = mix(base, vec3(0.93, 0.95, 0.97), uSnow * smoothstep(0.2, 0.6, N.z));
  } else if (vM < 12.5) {
    // maçonnerie : briques ou crépi selon l'échelle, coulures
    vec3 q = vW * vec3(4.0, 4.0, 7.0);
    float row = floor(q.z);
    float bx = fract((abs(N.x) > 0.5 ? q.y : q.x) + row * 0.5), bz = fract(q.z);
    float mortar = smoothstep(0.0, 0.06, bx) * smoothstep(0.0, 0.08, bz);
    base *= (0.86 + 0.14 * mortar) * (0.88 + 0.24 * h3(floor(vec3(q.x, q.y, row))));
    base *= 0.85 + 0.25 * fbm(vW * 0.8);
    base *= 1.0 - 0.25 * smoothstep(0.5, 0.0, vW.z - vG);
  } else if (vM < 13.5) {
    ks = 0.8; shin = 120.0;
    // la nuit, quelques fenêtres restent éclairées
    if (uNight > 0.5 && h3(floor(vW * 0.4)) > 0.85) emi = vec3(1.0, 0.62, 0.3) * 0.5;
  }
  else if (vM < 14.5) {
    // feuille : éclairée des deux faces, translucide, cireuse, parfois enneigée sur le dessus
    if (dot(N, V) < 0.0) N = -N;
    base *= 0.82 + 0.36 * n3(vW * 9.0);
    base = mix(base, vec3(0.93, 0.95, 0.98), uSnow * smoothstep(0.3, 0.85, N.z) * 0.9);
    trans = 0.55; ks = 0.18; shin = 28.0;
  } else if (vM < 15.5) {
    // eau : teinte selon la profondeur (couleur des sommets), rides qui courent, reflet du ciel d'autant
    // plus fort que le regard est rasant (Fresnel) ; peu de calcul, la plupart des pixels n'en sont pas
    float r1 = sin(dot(vW.xy, vec2(1.7, 0.9)) + uTime * 1.9), r2 = sin(dot(vW.xy, vec2(-0.8, 2.3)) + uTime * 2.6);
    N = normalize(vec3(r1 * 0.05 + r2 * 0.03, r2 * 0.05 - r1 * 0.02, 1.0));
    float fr = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    emi = mix(uHorizon, uZenith, 0.3) * fr * 0.8;
    ks = 1.4; shin = 160.0;
  } else {
    // glace : bleutée, veinée de fissures
    base *= 1.0 - 0.35 * smoothstep(0.03, 0.0, abs(n3(vec3(vW.xy * 1.3, 1.0)) - 0.5));
    ks = 0.7; shin = 90.0;
  }
  if (uTint.w > 0.0) { base = mix(base, uTint.rgb, uTint.w); paint = 0.0; }
  float grime = (vM < 3.5 || uBurnt > 0.0) ? fbm(P * 5.0) : 0.5;
  if (vM < 1.5 || (vM > 2.5 && vM < 3.5)) base *= 0.82 + 0.32 * grime;
  if (paint > 0.5) {
    float mud = smoothstep(1.25, 0.15, vO.z) * (0.55 + 0.45 * fbm(P * 2.0 + 9.0));
    base = mix(base, vec3(0.30, 0.25, 0.18), mud * 0.55);
    base = mix(base, vec3(0.22, 0.21, 0.2), smoothstep(0.78, 0.82, fbm(P * 14.0)) * 0.6);
  }
  base = mix(base, vec3(0.075, 0.068, 0.062) + grime * vec3(0.07, 0.05, 0.04), uBurnt);
  base = lin(base);
  // éclairage : soleil avec ombres, ciel, rebond du sol, lumières ponctuelles
  vec3 L = normalize(uSun);
  float nd = dot(N, L);
  float diff = max(nd, 0.0) + trans * max(-nd, 0.0) * 0.6;
  float bm = 0.03 + 0.09 * (1.0 - abs(nd));
  float sh = shadowAt(uShadowS, vLS, uShT.y, bm * uSR.y);
  if (sh > 0.0) sh = min(sh, shadowAt(uShadow, vL, uShT.x, bm * uSR.x));
  float hemi = 0.5 + 0.5 * N.z;
  float ao = 0.55 + 0.45 * smoothstep(-0.1, 1.4, vW.z - vG);
  if (vM > 8.5 && vM < 9.5) {
    // sol : assombri au contact des chars (occlusion sous la caisse)
    ao = 1.0;
    for (int i = 0; i < 10; i++) {
      if (float(i) >= uNT) break;
      vec2 q = vW.xy - uTk[i].xy; q = vec2(q.x * uTk[i].z + q.y * uTk[i].w, -q.x * uTk[i].w + q.y * uTk[i].z);
      ao *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 1.3, length(max(abs(q) - uTkH[i], 0.0))));
    }
  }
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), shin) * ks * sh * (1.0 - uBurnt * 0.8);
  // ombre des nuages qui passent
  if (uCloud > 0.0) sh *= 1.0 - uCloud * 0.4 * smoothstep(0.5, 0.75, 0.65 * n3(vec3(vW.xy * 0.006 + uWind * uTime * 0.01, 0.0)) + 0.35 * n3(vec3(vW.xy * 0.013, 2.0)));
  vec3 col = base * (uSunCol * diff * sh + mix(uBounce, uSkyCol, hemi) * ao) + uSunCol * spec;
  for (int i = 0; i < NL; i++) {
    if (float(i) >= uNL) break;
    vec3 lv = uLP[i].xyz - vW;
    float ld = length(lv);
    float att = clamp(1.0 - ld / max(uLP[i].w, 0.001), 0.0, 1.0);
    att *= att;
    // projecteur (phare) : cône d'axe uLD.xyz, cosinus du demi-angle extérieur en uLD.w (-2 : omnidirectionnel)
    if (uLD[i].w > -1.5) att *= smoothstep(uLD[i].w, mix(uLD[i].w, 1.0, 0.6), dot(-lv / max(ld, 0.001), uLD[i].xyz));
    col += base * uLC[i] * att * (max(dot(N, lv / max(ld, 0.001)), 0.0) * 0.85 + 0.15);
  }
  col += emi;
  vec3 rd = -V;
  col = mix(col, fogCol(rd), fogAt(vW, rd, dist));
  gl_FragColor = vec4(tm(col), 1.0);
}`;
  const SVS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute float aMat;
uniform mat4 uLVP; uniform mat4 uModel;
varying float vD;
void main(){
  vec4 p = uLVP * (uModel * vec4(aPos, 1.0));
  vD = p.z / p.w * 0.5 + 0.5;
  gl_Position = p;
}`;
  const SFS = `
precision highp float;
varying float vD;
void main(){
#if DEPTH_TEX
  gl_FragColor = vec4(1.0);
#else
  vec4 e = vec4(1.0, 255.0, 65025.0, 16581375.0) * vD;
  e = fract(e);
  e -= e.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  gl_FragColor = e;
#endif
}`;
  // particules : billboards doux (fumée éclairée) ou lumineux (flammes, éclairs, traceurs)
  const PVS = `
attribute vec3 aP; attribute vec2 aUV; attribute vec4 aC; attribute float aS; attribute float aG;
uniform mat4 uVP;
varying vec2 vUV; varying vec4 vC; varying vec3 vW; varying float vS; varying float vG;
void main(){ vUV = aUV; vC = aC; vW = aP; vS = aS; vG = aG; gl_Position = uVP * vec4(aP, 1.0); }`;
  const PFS = `
precision highp float;
varying vec2 vUV; varying vec4 vC; varying vec3 vW; varying float vS; varying float vG;
uniform float uGlow; uniform vec3 uSunCol; uniform vec3 uSkyCol; uniform vec3 uFogCol; uniform float uFogD; uniform vec3 uEye; uniform vec3 uSun; uniform vec2 uFogH;
uniform vec4 uLP[4]; uniform vec3 uLC[4]; uniform float uNL;
` + FOG + `
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 q = vUV * 2.0 - 1.0;
  float r = length(q);
  float dist = length(vW - uEye);
  vec3 rd = (vW - uEye) / max(dist, 0.001);
  float fog = fogAt(vW, rd, dist);
  if (uGlow > 0.5) {
    // les lueurs s'éteignent dans la brume comme le reste
    float s = pow(max(0.0, 1.0 - r), 2.2);
    gl_FragColor = vec4(vC.rgb * s * vC.a * (1.0 - fog), 1.0);
    return;
  }
  float nz = 0.55 + 0.45 * n2(vUV * 5.0 + vec2(vC.a * 31.0, vW.z));
  // fondu au contact du sol : pas de coupure nette là où le sprite le traverse
  float a = smoothstep(1.0, 0.25, r) * nz * vC.a * smoothstep(0.0, 0.5 * vS, vW.z - vG);
  vec3 c = vC.rgb * vC.rgb * (uSkyCol * 1.3 + uSunCol * (0.32 + 0.18 * q.y));
  // fumée éclairée par les flammes, les éclairs et les fusées proches
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uNL) break;
    float att = clamp(1.0 - length(uLP[i].xyz - vW) / max(uLP[i].w, 0.001), 0.0, 1.0);
    c += vC.rgb * uLC[i] * att * att * 0.6;
  }
  c = mix(c, fogCol(rd), fog);
  gl_FragColor = vec4(tm(c), a);
}`;

  // Réglages du rendu selon la qualité : noyau de filtrage des ombres (KR texels par axe), lumières
  // dynamiques, cartes d'ombre statique (toute la carte, calculée une fois) et dynamique (chars, à
  // chaque image), échelle des distances de détail. Les niveaux eux-mêmes sont choisis par le jeu.
  const QDEF = { kr: 3, nl: 8, sms: 4096, smd: 2048, lod: 1, gt: [4096, 2048], aniso: 8, wx: 2500, bloom: 1 };
  // Météo : un volume de particules qui suit la caméra (enroulé autour d'un point entre l'œil et la
  // zone regardée), entièrement animé sur le GPU, un seul appel de dessin. Pluie et sable en traits
  // orientés selon leur vitesse, neige et cendres en flocons qui se balancent.
  const WVS = `
attribute vec3 aP; attribute vec3 aQ;
uniform mat4 uVP; uniform vec3 uEye; uniform vec3 uC; uniform vec3 uVel; uniform float uTime; uniform vec3 uBox;
uniform vec3 uRight; uniform vec3 uUp; uniform float uStreak; uniform float uSize; uniform float uLen; uniform float uPix; uniform float uMinPx;
varying vec2 vQ; varying float vA;
void main(){
  vec3 p = mod(aP + uVel * uTime - uC + uBox * 0.5, uBox) - uBox * 0.5 + uC;
  if (uStreak < 0.5) p.xy += 0.3 * vec2(sin(uTime * 1.3 + aQ.z * 6.283), cos(uTime * 1.1 + aQ.z * 4.1));
  float d = length(p - uEye);
  vA = smoothstep(uBox.x * 0.5, uBox.x * 0.36, length(p - uC)) * smoothstep(0.8, 2.5, d);
  float w = max(uSize, d * uPix * uMinPx);
  vec3 off;
  if (uStreak > 0.5) { vec3 v = uVel * uLen; off = v * aQ.y * 0.5 + normalize(cross(v, p - uEye)) * w * aQ.x; }
  else off = (uRight * aQ.x + uUp * aQ.y) * w;
  vQ = aQ.xy;
  gl_Position = uVP * vec4(p + off, 1.0);
}`;
  const WFS = `
precision highp float;
varying vec2 vQ; varying float vA;
uniform vec4 uCol; uniform float uStreak;
void main(){
  float a = uStreak > 0.5 ? (1.0 - abs(vQ.x)) * smoothstep(1.0, 0.5, abs(vQ.y)) : smoothstep(1.0, 0.35, length(vQ));
  gl_FragColor = vec4(uCol.rgb, uCol.a * a * vA);
}`;
  // Halo des lueurs : les particules lumineuses sont redessinées dans une petite cible (quart de la
  // résolution), floutées sur deux échelles puis ajoutées à l'image. La même passe assombrit les
  // bords (vignettage) et rougit le pourtour quand le joueur est touché.
  const QVS = `attribute vec2 aQ; varying vec2 vUV; void main(){ vUV = aQ * 0.5 + 0.5; gl_Position = vec4(aQ, 0.0, 1.0); }`;
  const BLUR = `
precision mediump float;
varying vec2 vUV; uniform sampler2D uT; uniform vec2 uD;
void main(){
  vec4 c = texture2D(uT, vUV) * 0.227;
  c += (texture2D(uT, vUV + uD * 1.385) + texture2D(uT, vUV - uD * 1.385)) * 0.316;
  c += (texture2D(uT, vUV + uD * 3.231) + texture2D(uT, vUV - uD * 3.231)) * 0.07;
  gl_FragColor = c;
}`;
  const COMP = `
precision mediump float;
varying vec2 vUV; uniform sampler2D uA; uniform sampler2D uB; uniform float uK; uniform float uVig; uniform float uHit;
void main(){
  float r = length(vUV - 0.5) * 1.4, e = smoothstep(0.45, 0.8, r);
  vec3 b = (texture2D(uA, vUV).rgb * 0.35 + texture2D(uB, vUV).rgb * 0.5) * uK + vec3(0.55, 0.03, 0.0) * uHit * e;
  gl_FragColor = vec4(b, (1.0 - uVig * smoothstep(0.35, 0.9, r)) * (1.0 - 0.5 * uHit * e));
}`;
  function create(canvas, opt = {}) {
    const gl = canvas.getContext('webgl', { antialias: opt.msaa !== false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) return null;
    let Q = Object.assign({}, QDEF, opt.q), depthOK = false;
    const compile = (vs, fs) => {
      const pre = `#define KR ${Q.kr}\n#define NL ${Q.nl}\n#define DEPTH_TEX ${depthOK ? 1 : 0}\n`;
      const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, pre + src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const p = gl.createProgram();
      gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const A = {}, U = {};
      const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
      for (let i = 0; i < na; i++) { const a = gl.getActiveAttrib(p, i); A[a.name] = gl.getAttribLocation(p, a.name); }
      const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < nu; i++) { const u = gl.getActiveUniform(p, i); const nm = u.name.replace(/\[0\]$/, ''); U[nm] = gl.getUniformLocation(p, u.name); }
      return { p, A, U };
    };
    // Ressources du GPU, toutes recréées après une perte du contexte WebGL (pilote réinitialisé,
    // mémoire saturée, changement d'application sur mobile)
    let main, shadow, part, wprog, blur, comp, qBuf, bt = [], shS = null, shD = null, gTex, sky, pBuf, wBuf, lost = false;
    const mkBuf = data => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return buf;
    };
    // Sommets compacts sur le GPU (20 octets au lieu de 40) : position en flottants, normale et
    // matériau en octets signés et non signés, couleur en octets normalisés
    const pack = f => {
      const n = f.length / 10, buf = new ArrayBuffer(n * 20), F = new Float32Array(buf), B = new Int8Array(buf), C = new Uint8ClampedArray(buf);
      for (let i = 0; i < n; i++) {
        const s = i * 10, o = i * 20;
        F[i * 5] = f[s]; F[i * 5 + 1] = f[s + 1]; F[i * 5 + 2] = f[s + 2];
        B[o + 12] = Math.round(f[s + 3] * 127); B[o + 13] = Math.round(f[s + 4] * 127); B[o + 14] = Math.round(f[s + 5] * 127);
        C[o + 15] = f[s + 9]; C[o + 16] = f[s + 6] * 255; C[o + 17] = f[s + 7] * 255; C[o + 18] = f[s + 8] * 255;
      }
      return C;
    };
    const skyB = new Builder(); skyB.sphere([0, 0, 0], 900, 900, 900, 18, [1, 1, 1], 11);
    const skyData = pack(skyB.v);
    const texP = (min, mag = min, wrap = gl.CLAMP_TO_EDGE) => { for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, min], [gl.TEXTURE_MAG_FILTER, mag], [gl.TEXTURE_WRAP_S, wrap], [gl.TEXTURE_WRAP_T, wrap]]) gl.texParameteri(gl.TEXTURE_2D, k, v); };
    // carte d'ombre : texture de profondeur (16 bits) si possible, sinon profondeur encodée en RGBA
    function mkTarget(size) {
      const T = { size, tex: gl.createTexture(), fb: gl.createFramebuffer(), rb: [] };
      gl.bindTexture(gl.TEXTURE_2D, T.tex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
      const rb = (fmt, att) => { const r = gl.createRenderbuffer(); T.rb.push(r); gl.bindRenderbuffer(gl.RENDERBUFFER, r); gl.renderbufferStorage(gl.RENDERBUFFER, fmt, size, size); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, att, gl.RENDERBUFFER, r); };
      const ok = () => gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      if (depthOK) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
        texP(gl.NEAREST);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, T.tex, 0);
        if (!ok()) rb(gl.RGBA4, gl.COLOR_ATTACHMENT0); // certains pilotes exigent une couleur
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        texP(gl.NEAREST);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.tex, 0);
        rb(gl.DEPTH_COMPONENT16, gl.DEPTH_ATTACHMENT);
      }
      const good = ok();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!good) { freeTarget(T); return null; }
      return T;
    }
    function freeTarget(T) { if (!T || lost) return; gl.deleteTexture(T.tex); gl.deleteFramebuffer(T.fb); for (const r of T.rb) gl.deleteRenderbuffer(r); }
    // programmes et cartes d'ombre : dépendent de la qualité
    function initTargets() {
      freeTarget(shS); freeTarget(shD);
      depthOK = !!gl.getExtension('WEBGL_depth_texture');
      shS = depthOK && mkTarget(Q.sms);
      if (!shS) { depthOK = false; Q.sms = Math.min(Q.sms, 2048); shS = mkTarget(Q.sms); }
      shD = mkTarget(Q.smd);
      main = compile(VS, FS); shadow = compile(SVS, SFS); part = compile(PVS, PFS); wprog = compile(WVS, WFS); blur = compile(QVS, BLUR); comp = compile(QVS, COMP);
      bakeAll = true;
    }
    function initGL() {
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      shS = shD = null;
      initTargets();
      gTex = gl.createTexture(); // texture du sol, renvoyée par le jeu (setGround)
      sky = { buf: mkBuf(skyData), count: skyData.length / 20 };
      pBuf = gl.createBuffer();
      wBuf = mkBuf(wData);
      qBuf = mkBuf(new Float32Array([-1, -1, 3, -1, -1, 3]));
      bt = [];
    }
    // cibles du halo : deux au quart de la résolution, deux au huitième (aller-retour du flou)
    function bloomTargets(w, h) {
      const W = [w >> 2, w >> 2, w >> 3, w >> 3].map(v => Math.max(1, v)), H = [h >> 2, h >> 2, h >> 3, h >> 3].map(v => Math.max(1, v));
      if (bt.length && bt[0].w === W[0] && bt[0].h === H[0]) return;
      for (const t of bt) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
      bt = W.map((ww, i) => {
        const t = { w: ww, h: H[i], tex: gl.createTexture(), fb: gl.createFramebuffer() };
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, t.w, t.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        texP(gl.LINEAR);
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        return t;
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    const quad = (P, dst) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
      gl.bindBuffer(gl.ARRAY_BUFFER, qBuf);
      gl.enableVertexAttribArray(P.A.aQ); gl.vertexAttribPointer(P.A.aQ, 2, gl.FLOAT, false, 8, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    function blurPass(src, dst, dx, dy) {
      gl.viewport(0, 0, dst.w, dst.h);
      gl.useProgram(blur.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex); gl.uniform1i(blur.U.uT, 0);
      gl.uniform2f(blur.U.uD, dx / src.w, dy / src.h);
      quad(blur, dst);
    }
    // nGlow : quads lumineux encore dans le tampon des particules (dernier dessin de drawParticles)
    function bloom(scene, w, h, nGlow) {
      bloomTargets(w, h);
      const on = Q.bloom && nGlow > 0;
      gl.disable(gl.DEPTH_TEST);
      if (on) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, bt[0].fb);
        gl.viewport(0, 0, bt[0].w, bt[0].h);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(part.p);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        gl.drawArrays(gl.TRIANGLES, 0, nGlow * 6);
        gl.disable(gl.BLEND);
        blurPass(bt[0], bt[1], 1, 0); blurPass(bt[1], bt[0], 0, 1);
        blurPass(bt[0], bt[2], 1, 0); blurPass(bt[2], bt[3], 0, 1); blurPass(bt[3], bt[2], 1, 0); blurPass(bt[2], bt[3], 0, 1);
      }
      gl.viewport(0, 0, w, h);
      gl.useProgram(comp.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, bt[0].tex); gl.uniform1i(comp.U.uA, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bt[3].tex); gl.uniform1i(comp.U.uB, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1f(comp.U.uK, on ? 1 : 0); gl.uniform1f(comp.U.uVig, scene.vig || 0); gl.uniform1f(comp.U.uHit, scene.hit || 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.SRC_ALPHA);
      quad(comp, null);
      gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);
    }
    // volume de météo : positions aléatoires dans la boîte, coins des quads et graine par flocon
    const WMAX = 2500, WBOX = [50, 50, 30], wData = new Float32Array(WMAX * 36);
    { let s = 7; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < WMAX; i++) { const x = R() * WBOX[0], y = R() * WBOX[1], z = R() * WBOX[2], sd = R();
        QI.forEach((k, v) => wData.set([x, y, z, QU[v * 2] * 2 - 1, QU[v * 2 + 1] * 2 - 1, sd], (i * 6 + v) * 6)); } }

    // Maillages vivants. Par défaut leurs sommets sont gardés pour être renvoyés tels quels après
    // une perte du contexte ; keep = false pour les gros décors, que le jeu reconstruit (onRestored).
    const meshes = new Set();
    const upload = (b, keep = true) => {
      const data = pack(b instanceof Float32Array ? b : b.v);
      const m = { buf: mkBuf(data), count: data.length / 20, data: keep ? data : null };
      meshes.add(m);
      return m;
    };
    const free = m => { if (!m) return; meshes.delete(m); if (m.buf && !lost) gl.deleteBuffer(m.buf); m.buf = null; };
    const bindMesh = (prog, m) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
      const A = prog.A;
      const at = (n, size, type, nrm, off) => { if (A[n] == null || A[n] < 0) return; gl.enableVertexAttribArray(A[n]); gl.vertexAttribPointer(A[n], size, type, nrm, 20, off); };
      at('aPos', 3, gl.FLOAT, false, 0); at('aNor', 3, gl.BYTE, true, 12); at('aMat', 1, gl.UNSIGNED_BYTE, false, 15); at('aCol', 3, gl.UNSIGNED_BYTE, true, 16);
    };
    // Texture du sol : recopiée à une taille puissance de deux pour avoir des mipmaps (pas de
    // scintillement au loin) et un filtrage anisotrope ; mise à jour par tuiles quand des traces s'y
    // impriment, mipmaps refaites au plus deux fois par seconde
    let mapW = 1, mapH = 1, gSrc = null, gW = 1, gH = 1, mipDirty = false, mipT = 0;
    const tmpCv = document.createElement('canvas'), tmpCtx = tmpCv.getContext('2d');
    function setGround(cv, wm, hm) {
      gSrc = cv; gW = Q.gt[0]; gH = Q.gt[1];
      tmpCv.width = gW; tmpCv.height = gH;
      tmpCtx.drawImage(cv, 0, 0, gW, gH);
      gl.bindTexture(gl.TEXTURE_2D, gTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tmpCv);
      tmpCv.width = tmpCv.height = 1;
      gl.generateMipmap(gl.TEXTURE_2D);
      texP(gl.LINEAR_MIPMAP_LINEAR, gl.LINEAR);
      const an = gl.getExtension('EXT_texture_filter_anisotropic');
      if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(Q.aniso, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      if (wm !== mapW || hm !== mapH) slvp = null;
      mapW = wm; mapH = hm;
    }
    // zone (x, y, w, h) du canevas source modifiée
    function updateGround(cv, x, y, w, h) {
      const sx = gW / cv.width, sy = gH / cv.height;
      const X0 = Math.floor(x * sx), Y0 = Math.floor(y * sy), X1 = Math.min(gW, Math.ceil((x + w) * sx)), Y1 = Math.min(gH, Math.ceil((y + h) * sy));
      if (X1 <= X0 || Y1 <= Y0) return;
      tmpCv.width = X1 - X0; tmpCv.height = Y1 - Y0;
      tmpCtx.drawImage(cv, X0 / sx, Y0 / sy, (X1 - X0) / sx, (Y1 - Y0) / sy, 0, 0, X1 - X0, Y1 - Y0);
      gl.bindTexture(gl.TEXTURE_2D, gTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, X0, Y0, gl.RGBA, gl.UNSIGNED_BYTE, tmpCv);
      mipDirty = true;
    }
    // particules
    const PCAP = 4000;
    const pData = new Float32Array(PCAP * 6 * 11);
    let env = null;

    function setEnv(e) { env = e; slvp = null; }
    // étalonnage : env.grade = { gain: [r, g, b], lift, sat }
    function grade(U) { const g = env.grade || {}; gl.uniform3fv(U.uGain, g.gain || [1, 1, 1]); gl.uniform1f(U.uLift, g.lift || 0); gl.uniform1f(U.uSat, g.sat == null ? 1 : g.sat); }

    // ---- décor statique par cellules ----
    // Chaque cellule : boîte englobante, maillages par niveau de détail (0 proche, 1 moyen, 2 lointain,
    // 3 commun à toutes les distances) et emprise dans la carte d'ombre statique. Seules les cellules
    // dans le champ sont dessinées ; une cellule remplacée ne recalcule que sa zone de la carte d'ombre.
    const cells = new Map(), bakeBoxes = [];
    let bakeAll = true, slvp = null, sRange = 1, sTexel = 0.1;
    const corners = (b, f) => { for (let i = 0; i < 8; i++) f([b[i & 1 ? 3 : 0], b[i & 2 ? 4 : 1], b[i & 4 ? 5 : 2]]); };
    const lightRect = b => { const r = [1e9, 1e9, -1e9, -1e9]; corners(b, p => { const q = M4.apply(slvp, p); r[0] = Math.min(r[0], q[0]); r[1] = Math.min(r[1], q[1]); r[2] = Math.max(r[2], q[0]); r[3] = Math.max(r[3], q[1]); }); return r; };
    function boxOf(B) {
      const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
      for (const bu of B) if (bu) for (let i = 0; i < bu.n; i += 10) for (let k = 0; k < 3; k++) { const v = bu.a[i + k]; if (v < b[k]) b[k] = v; if (v > b[k + 3]) b[k + 3] = v; }
      if (b[0] > b[3]) return null;
      for (let k = 0; k < 3; k++) { b[k] -= 0.6; b[k + 3] += 0.6; } // balancement du vent
      return b;
    }
    function putCell(id, c) {
      const old = cells.get(id);
      if (old) { old.m.forEach(free); cells.delete(id); bakeBoxes.push(old.box); }
      const box = c && boxOf(c.b);
      if (!box) return;
      const rec = { box, m: c.b.map(b => b && b.n ? upload(b, false) : null), lr: slvp ? lightRect(box) : null };
      cells.set(id, rec); bakeBoxes.push(box);
    }
    function clearCells() { for (const c of cells.values()) c.m.forEach(free); cells.clear(); bakeBoxes.length = 0; bakeAll = true; }
    // carte statique : ajustée à la carte entière (et sa lisière) vue du soleil
    function fitStatic() {
      const sd = norm(env.sun), c = [mapW / 2, -mapH / 2, 0];
      const view = M4.lookAt([c[0] + sd[0] * 500, c[1] + sd[1] * 500, c[2] + sd[2] * 500], c, Math.abs(sd[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1]);
      const r = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
      corners([-50, -mapH - 50, -8, mapW + 50, 50, 32], p => { const q = M4.apply(view, p); for (let k = 0; k < 3; k++) { r[k] = Math.min(r[k], q[k]); r[k + 3] = Math.max(r[k + 3], q[k]); } });
      slvp = M4.mul(M4.ortho(r[0], r[3], r[1], r[4], -r[5] - 1, -r[2] + 1), view);
      sRange = r[5] - r[2] + 2; sTexel = Math.max(r[3] - r[0], r[4] - r[1]) / shS.size;
      for (const cl of cells.values()) cl.lr = lightRect(cl.box);
      bakeAll = true;
    }
    function bakeStatic() {
      const T = shS, S = T.size;
      let r = null;
      if (!bakeAll) {
        r = [1e9, 1e9, -1e9, -1e9];
        for (const b of bakeBoxes) { const q = lightRect(b); r[0] = Math.min(r[0], q[0]); r[1] = Math.min(r[1], q[1]); r[2] = Math.max(r[2], q[2]); r[3] = Math.max(r[3], q[3]); }
      }
      bakeAll = false; bakeBoxes.length = 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
      gl.viewport(0, 0, S, S);
      if (r) {
        const px = v => Math.floor((v * 0.5 + 0.5) * S);
        const x0 = Math.max(0, px(r[0]) - 2), y0 = Math.max(0, px(r[1]) - 2), x1 = Math.min(S, px(r[2]) + 3), y1 = Math.min(S, px(r[3]) + 3);
        if (x1 <= x0 || y1 <= y0) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); return; }
        gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, y0, x1 - x0, y1 - y0);
      }
      gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(shadow.p);
      gl.uniformMatrix4fv(shadow.U.uLVP, false, slvp);
      gl.uniformMatrix4fv(shadow.U.uModel, false, IDENT);
      for (const c of cells.values()) {
        if (r && (c.lr[2] < r[0] || c.lr[0] > r[2] || c.lr[3] < r[1] || c.lr[1] > r[3])) continue;
        for (const k of [0, 3]) { const m = c.m[k]; if (m && m.buf) { bindMesh(shadow, m); gl.drawArrays(gl.TRIANGLES, 0, m.count); } }
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // plans du champ de vision (Gribb-Hartmann), normalisés pour les tests de sphères
    const planes = new Float32Array(24);
    function setFrustum(m) {
      for (let i = 0; i < 6; i++) {
        const r = i >> 1, s = i & 1 ? -1 : 1, o = i * 4;
        planes[o] = m[3] + s * m[r]; planes[o + 1] = m[7] + s * m[4 + r]; planes[o + 2] = m[11] + s * m[8 + r]; planes[o + 3] = m[15] + s * m[12 + r];
        const l = Math.hypot(planes[o], planes[o + 1], planes[o + 2]) || 1;
        for (let k = 0; k < 4; k++) planes[o + k] /= l;
      }
    }
    const boxIn = b => { for (let o = 0; o < 24; o += 4) { const a = planes[o], c = planes[o + 1], d = planes[o + 2]; if (a * (a > 0 ? b[3] : b[0]) + c * (c > 0 ? b[4] : b[1]) + d * (d > 0 ? b[5] : b[2]) + planes[o + 3] < 0) return false; } return true; };
    const sphereIn = s => { for (let o = 0; o < 24; o += 4) if (planes[o] * s[0] + planes[o + 1] * s[1] + planes[o + 2] * s[2] + planes[o + 3] < -s[3]) return false; return true; };
    const stats = { cells: 0, verts: 0 };
    const vis = [];
    function drawCells(cam) {
      const U = main.U, e = cam.eye;
      gl.uniformMatrix4fv(U.uModel, false, IDENT);
      const dc = [[0.6, 0.55, 0.35], [0.4, 0.3, 0.2], [0.3, 0.35, 0.2]];
      gl.uniform3fv(U.uCamo0, dc[0]); gl.uniform3fv(U.uCamo1, dc[1]); gl.uniform3fv(U.uCamo2, dc[2]);
      if (U.uPat) gl.uniform1f(U.uPat, 0);
      gl.uniform1f(U.uBurnt, 0); gl.uniform4fv(U.uTint, [0, 0, 0, 0]); gl.uniform1f(U.uTread, 0); gl.uniform1f(U.uSeed, 0); gl.uniform1f(U.uBase, 0);
      // la lunette grossit : le détail se garde plus loin
      const lodK = Math.tan(0.45) / Math.tan((cam.fov || 0.9) / 2) * Q.lod;
      vis.length = 0;
      for (const c of cells.values()) {
        if (!boxIn(c.box)) continue;
        const b = c.box, dx = Math.max(b[0] - e[0], 0, e[0] - b[3]), dy = Math.max(b[1] - e[1], 0, e[1] - b[4]), dz = Math.max(b[2] - e[2], 0, e[2] - b[5]);
        c.d = Math.hypot(dx, dy, dz) / lodK;
        vis.push(c);
      }
      // du plus proche au plus lointain : le test de profondeur évite d'ombrer ce qui sera caché
      vis.sort((a, b) => a.d - b.d);
      stats.cells = vis.length; stats.verts = 0;
      for (const c of vis) {
        const L = c.d < 55 ? 0 : c.d < 130 ? 1 : 2;
        for (const m of [c.m[3], c.m[L]]) if (m && m.buf) { bindMesh(main, m); gl.drawArrays(gl.TRIANGLES, 0, m.count); stats.verts += m.count; }
      }
    }

    // ---- dessin ----
    const bl = new Float32Array(16), lp = new Float32Array(32), lc = new Float32Array(24), ld = new Float32Array(32), tk = new Float32Array(40), tkh = new Float32Array(20);
    function uniformsMain(cam, lvp, dRange, dTexel) {
      const U = main.U;
      gl.useProgram(main.p);
      gl.uniformMatrix4fv(U.uVP, false, cam.vp);
      gl.uniformMatrix4fv(U.uLVP, false, lvp);
      gl.uniformMatrix4fv(U.uLVPS, false, slvp);
      gl.uniform2f(U.uNOff, dTexel * 1.5, sTexel * 1.5);
      gl.uniform2f(U.uSR, 1 / dRange, 1 / sRange);
      gl.uniform2f(U.uShT, 1 / shD.size, 1 / shS.size);
      gl.uniform3fv(U.uEye, cam.eye);
      gl.uniform3fv(U.uSun, env.sun); gl.uniform3fv(U.uSunCol, env.sunCol); gl.uniform3fv(U.uSkyCol, env.skyCol); gl.uniform3fv(U.uBounce, env.bounce);
      gl.uniform3fv(U.uFogCol, env.fogCol); gl.uniform1f(U.uFogD, env.fogD); gl.uniform3fv(U.uZenith, env.zenith); gl.uniform3fv(U.uHorizon, env.horizon);
      gl.uniform1f(U.uSnow, env.snow || 0); gl.uniform1f(U.uTime, cam.time);
      grade(U);
      bl.fill(0); (cam.blasts || []).slice(0, 4).forEach((b, i) => bl.set(b, i * 4));
      gl.uniform4fv(U.uBlast, bl);
      gl.uniform2f(U.uMap, mapW, mapH);
      gl.uniform2fv(U.uFogH, env.fogH || [0, 0.1]); gl.uniform3fv(U.uOuter, env.outer || [0.3, 0.3, 0.25]);
      gl.uniform1f(U.uWet, env.wet || 0); gl.uniform1f(U.uCloud, env.cloud || 0); gl.uniform2fv(U.uWind, env.wind || [1, 0]); gl.uniform1f(U.uNight, env.night || 0);
      gl.uniform1f(U.uPix, 2 * Math.tan((cam.fov || 0.9) / 2) / Math.max(1, canvas.height));
      // contacts des chars avec le sol : [x, y, cap, demi-longueur, demi-largeur]
      const C = cam.contacts || [], nt = Math.min(10, C.length);
      for (let i = 0; i < nt; i++) { const c = C[i]; tk[i * 4] = c[0]; tk[i * 4 + 1] = c[1]; tk[i * 4 + 2] = Math.cos(c[2]); tk[i * 4 + 3] = Math.sin(c[2]); tkh[i * 2] = c[3]; tkh[i * 2 + 1] = c[4]; }
      gl.uniform4fv(U.uTk, tk); gl.uniform2fv(U.uTkH, tkh); gl.uniform1f(U.uNT, nt);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shD.tex); gl.uniform1i(U.uShadow, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, gTex); gl.uniform1i(U.uGround, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, shS.tex); gl.uniform1i(U.uShadowS, 2);
      gl.activeTexture(gl.TEXTURE0);
      const L = cam.lights || [], n = Math.min(L.length, Q.nl);
      for (let i = 0; i < n; i++) {
        const l = L[i], d = l.d;
        lp[i * 4] = l.p[0]; lp[i * 4 + 1] = l.p[1]; lp[i * 4 + 2] = l.p[2]; lp[i * 4 + 3] = l.r; lc[i * 3] = l.c[0]; lc[i * 3 + 1] = l.c[1]; lc[i * 3 + 2] = l.c[2];
        ld[i * 4] = d ? d[0] : 0; ld[i * 4 + 1] = d ? d[1] : 0; ld[i * 4 + 2] = d ? d[2] : 0; ld[i * 4 + 3] = d ? l.cone : -2;
      }
      gl.uniform4fv(U.uLP, lp.subarray(0, Q.nl * 4)); gl.uniform3fv(U.uLC, lc.subarray(0, Q.nl * 3)); gl.uniform4fv(U.uLD, ld.subarray(0, Q.nl * 4)); gl.uniform1f(U.uNL, n);
    }
    function drawMain(m, model, o = {}) {
      if (!m.buf) return; // décor pas encore renvoyé après une perte du contexte
      const U = main.U;
      bindMesh(main, m);
      gl.uniformMatrix4fv(U.uModel, false, model);
      const camo = o.camo || [[0.6, 0.55, 0.35], [0.4, 0.3, 0.2], [0.3, 0.35, 0.2]];
      gl.uniform3fv(U.uCamo0, camo[0]); gl.uniform3fv(U.uCamo1, camo[1]); gl.uniform3fv(U.uCamo2, camo[2]);
      if (U.uPat) gl.uniform1f(U.uPat, o.pat || 0);
      gl.uniform1f(U.uBurnt, o.burnt || 0);
      gl.uniform4fv(U.uTint, o.tint || [0, 0, 0, 0]);
      gl.uniform1f(U.uTread, o.tread || 0);
      gl.uniform1f(U.uSeed, o.seed || 0);
      gl.uniform1f(U.uBase, o.gz || 0);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
    }
    function drawShadow(m, model) {
      if (!m.buf) return;
      bindMesh(shadow, m);
      gl.uniformMatrix4fv(shadow.U.uModel, false, model);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
    }
    // carte dynamique centrée sur la zone regardée, recalée au texel près et d'étendue arrondie à 10 m :
    // les bords des ombres ne rampent pas quand la caméra glisse ou zoome
    let dView = null, dSun = null;
    function dynLight(c, ext0) {
      const sd = norm(env.sun);
      if (dSun !== env.sun) { dSun = env.sun; dView = M4.lookAt([sd[0] * 1000, sd[1] * 1000, sd[2] * 1000], [0, 0, 0], Math.abs(sd[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1]); }
      const ext = Math.ceil(ext0 / 10) * 10, tx = 2 * ext / shD.size, q = M4.apply(dView, c);
      const x = Math.round(q[0] / tx) * tx, y = Math.round(q[1] / tx) * tx, d = -q[2], dr = ext + 30;
      return { lvp: M4.mul(M4.ortho(x - ext, x + ext, y - ext, y + ext, d - dr, d + dr), dView), range: 2 * dr, texel: tx };
    }

    // scène : { cam: {eye, target, vp, view, fov, time, lights}, items: [{mesh, model, o, noShadow, cull}], parts: {soft:[], glow:[]} }
    // cull : sphère englobante [x, y, z, r] facultative, pour ne pas dessiner un objet hors du champ
    function render(scene, w, h) {
      if (lost || !env) return;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const cam = scene.cam;
      gl.disable(gl.BLEND); gl.depthMask(true);
      if (!slvp) fitStatic();
      if (mipDirty && performance.now() - mipT > 500) { mipDirty = false; mipT = performance.now(); gl.bindTexture(gl.TEXTURE_2D, gTex); gl.generateMipmap(gl.TEXTURE_2D); }
      if (bakeAll || bakeBoxes.length) bakeStatic();
      // passe d'ombre dynamique : chars, épaves, débris
      const dl = dynLight(cam.target, scene.shadowExt || 80);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shD.fb);
      gl.viewport(0, 0, shD.size, shD.size);
      gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(shadow.p);
      gl.uniformMatrix4fv(shadow.U.uLVP, false, dl.lvp);
      for (const it of scene.items) if (!it.noShadow) drawShadow(it.mesh, it.model);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // passe principale
      gl.viewport(0, 0, w, h);
      gl.clearColor(env.fogCol[0], env.fogCol[1], env.fogCol[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      setFrustum(cam.vp);
      uniformsMain(cam, dl.lvp, dl.range, dl.texel);
      gl.depthMask(false);
      drawMain(sky, M4.trs(cam.eye[0], cam.eye[1], cam.eye[2], 0), {});
      gl.depthMask(true);
      drawCells(cam);
      for (const it of scene.items) if (!it.cull || sphereIn(it.cull)) drawMain(it.mesh, it.model, it.o || {});
      const nGlow = drawParticles(scene.parts, cam);
      if (Q.bloom && nGlow) bloomGlow = nGlow; else bloomGlow = 0;
      if (bloomGlow) bloom(scene, w, h, bloomGlow);
      drawWeather(cam, h);
      if (!bloomGlow) bloom(scene, w, h, 0);
    }
    let bloomGlow = 0;
    // env.weather : { vel, col (couleur et opacité), size (m), px (taille minimale à l'écran), len (s, traits), streak, rate (0..1) }
    function drawWeather(cam, h) {
      const W = env.weather, n = W ? Math.round(Math.min(WMAX, Q.wx) * W.rate) : 0;
      if (!n) return;
      const P = wprog, U = P.U, e = cam.eye, t = cam.target, v = cam.view;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(U.uVP, false, cam.vp);
      gl.uniform3fv(U.uEye, e); gl.uniform3f(U.uC, (e[0] + t[0]) / 2, (e[1] + t[1]) / 2, (e[2] + t[2]) / 2);
      gl.uniform3fv(U.uVel, W.vel); gl.uniform1f(U.uTime, cam.time); gl.uniform3fv(U.uBox, WBOX);
      gl.uniform3f(U.uRight, v[0], v[4], v[8]); gl.uniform3f(U.uUp, v[1], v[5], v[9]);
      gl.uniform1f(U.uStreak, W.streak ? 1 : 0); gl.uniform1f(U.uSize, W.size); gl.uniform1f(U.uLen, W.len || 0); gl.uniform1f(U.uMinPx, W.px || 0.7);
      gl.uniform1f(U.uPix, 2 * Math.tan((cam.fov || 0.9) / 2) / Math.max(1, h)); gl.uniform4fv(U.uCol, W.col);
      gl.bindBuffer(gl.ARRAY_BUFFER, wBuf);
      gl.enableVertexAttribArray(P.A.aP); gl.vertexAttribPointer(P.A.aP, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(P.A.aQ); gl.vertexAttribPointer(P.A.aQ, 3, gl.FLOAT, false, 24, 12);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, 0, n * 6);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }

    function drawParticles(parts, cam) {
      if (!parts) return 0;
      const P = part;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.U.uVP, false, cam.vp);
      gl.uniform3fv(P.U.uSunCol, env.sunCol); gl.uniform3fv(P.U.uSkyCol, env.skyCol);
      gl.uniform3fv(P.U.uFogCol, env.fogCol); gl.uniform1f(P.U.uFogD, env.fogD); gl.uniform3fv(P.U.uEye, cam.eye);
      gl.uniform3fv(P.U.uSun, env.sun); gl.uniform2fv(P.U.uFogH, env.fogH || [0, 0.1]);
      grade(P.U);
      // les quatre lumières omnidirectionnelles les plus importantes éclairent aussi la fumée
      let n4 = 0;
      for (const l of cam.lights || []) { if (n4 >= 4) break; if (l.d) continue; plp.set([l.p[0], l.p[1], l.p[2], l.r], n4 * 4); plc.set(l.c, n4 * 3); n4++; }
      gl.uniform4fv(P.U.uLP, plp); gl.uniform3fv(P.U.uLC, plc); gl.uniform1f(P.U.uNL, n4);
      // quads écrits directement dans le tampon, sans tableaux temporaires
      const v = cam.view, R0 = v[0], R1 = v[4], R2 = v[8], U0 = v[1], U1 = v[5], U2 = v[9], e = cam.eye;
      const fill = list => {
        let n = 0;
        for (const q of list) {
          if (n >= PCAP) break;
          const p = q.p, s = q.s;
          if (q.a2) { // traînée orientée (traceur, étincelle) : largeur perpendiculaire au regard
            const a = q.a2, dx = a[0] - p[0], dy = a[1] - p[1], dz = a[2] - p[2];
            const mx = (p[0] + a[0]) / 2 - e[0], my = (p[1] + a[1]) / 2 - e[1], mz = (p[2] + a[2]) / 2 - e[2];
            let sx = dy * mz - dz * my, sy = dz * mx - dx * mz, sz = dx * my - dy * mx;
            const l = s / (Math.hypot(sx, sy, sz) || 1); sx *= l; sy *= l; sz *= l;
            QC[0] = p[0] - sx; QC[1] = p[1] - sy; QC[2] = p[2] - sz; QC[3] = a[0] - sx; QC[4] = a[1] - sy; QC[5] = a[2] - sz;
            QC[6] = a[0] + sx; QC[7] = a[1] + sy; QC[8] = a[2] + sz; QC[9] = p[0] + sx; QC[10] = p[1] + sy; QC[11] = p[2] + sz;
          } else {
            const cr = Math.cos(q.rot || 0) * s, sr = Math.sin(q.rot || 0) * s;
            const ax = R0 * cr + U0 * sr, ay = R1 * cr + U1 * sr, az = R2 * cr + U2 * sr, bx = U0 * cr - R0 * sr, by = U1 * cr - R1 * sr, bz = U2 * cr - R2 * sr;
            QC[0] = p[0] - ax - bx; QC[1] = p[1] - ay - by; QC[2] = p[2] - az - bz; QC[3] = p[0] + ax - bx; QC[4] = p[1] + ay - by; QC[5] = p[2] + az - bz;
            QC[6] = p[0] + ax + bx; QC[7] = p[1] + ay + by; QC[8] = p[2] + az + bz; QC[9] = p[0] - ax + bx; QC[10] = p[1] - ay + by; QC[11] = p[2] - az + bz;
          }
          const c = q.c;
          for (let vi = 0; vi < 6; vi++) {
            const k = QI[vi] * 3, o = (n * 6 + vi) * 11;
            pData[o] = QC[k]; pData[o + 1] = QC[k + 1]; pData[o + 2] = QC[k + 2];
            pData[o + 3] = QU[vi * 2]; pData[o + 4] = QU[vi * 2 + 1];
            pData[o + 5] = c[0]; pData[o + 6] = c[1]; pData[o + 7] = c[2]; pData[o + 8] = c[3]; pData[o + 9] = s; pData[o + 10] = q.g || 0;
          }
          n++;
        }
        return n;
      };
      const draw = (list, glow) => {
        if (!list.length) return 0;
        const n = fill(list);
        gl.bindBuffer(gl.ARRAY_BUFFER, pBuf);
        gl.bufferData(gl.ARRAY_BUFFER, pData.subarray(0, n * 66), gl.DYNAMIC_DRAW);
        const A = P.A;
        gl.enableVertexAttribArray(A.aP); gl.vertexAttribPointer(A.aP, 3, gl.FLOAT, false, 44, 0);
        gl.enableVertexAttribArray(A.aUV); gl.vertexAttribPointer(A.aUV, 2, gl.FLOAT, false, 44, 12);
        gl.enableVertexAttribArray(A.aC); gl.vertexAttribPointer(A.aC, 4, gl.FLOAT, false, 44, 20);
        if (A.aS >= 0) { gl.enableVertexAttribArray(A.aS); gl.vertexAttribPointer(A.aS, 1, gl.FLOAT, false, 44, 36); }
        if (A.aG >= 0) { gl.enableVertexAttribArray(A.aG); gl.vertexAttribPointer(A.aG, 1, gl.FLOAT, false, 44, 40); }
        gl.uniform1f(P.U.uGlow, glow ? 1 : 0);
        gl.enable(gl.BLEND);
        if (glow) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES, 0, n * 6);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        if (A.aG >= 0) gl.disableVertexAttribArray(A.aG);
        return n;
      };
      // fumées triées de la plus lointaine à la plus proche
      parts.soft.sort((a, b) => ((b.p[0] - e[0]) ** 2 + (b.p[1] - e[1]) ** 2 + (b.p[2] - e[2]) ** 2) - ((a.p[0] - e[0]) ** 2 + (a.p[1] - e[1]) ** 2 + (a.p[2] - e[2]) ** 2));
      draw(parts.soft, false);
      return draw(parts.glow, true);
    }

    initGL();
    // nouvelle qualité : programmes et cartes d'ombre refaits (l'anticrénelage, lui, est fixé à la création)
    function setQuality(q) { Q = Object.assign({}, QDEF, q); if (!lost) { initTargets(); slvp = null; if (gSrc) setGround(gSrc, mapW, mapH); } }
    const api = { gl, canvas, upload, free, render, setEnv, setGround, updateGround, putCell, clearCells, setQuality, stats, get lost() { return lost; }, onLost: null, onRestored: null };
    // sans preventDefault, le navigateur refuse de rendre le contexte
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; if (api.onLost) api.onLost(); });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        initGL(); slvp = null;
        for (const m of meshes) m.buf = m.data ? mkBuf(m.data) : null;
        lost = false;
      } catch (e) { console.warn('WebGL restore failed', e); return; }
      if (api.onRestored) api.onRestored();
    });
    return api;
  }
  // coins des quads de particules, ordre des sommets et coordonnées de texture
  const plp = new Float32Array(16), plc = new Float32Array(12), QC = new Float32Array(12), QI = [0, 1, 2, 0, 2, 3], QU = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  // ===================== Décor =====================
  // Le décor est découpé en cellules de 32 m (clé numérique), chacune avec 4 constructeurs : détail
  // proche, moyen, lointain, et commun à toutes les distances. Un objet appartient à la cellule de
  // son point d'ancrage, si bien qu'une destruction ne reconstruit que sa cellule.
  const CELL = 32;
  const cellKey = (x, y) => (Math.floor(x / CELL) + 64) + (Math.floor(-y / CELL) + 64) * 256;
  const obstacleCell = (o, px) => o.type === 'tree' ? cellKey((o.x + 8) / px, -(o.y + 8) / px) : cellKey((o.x + o.w / 2) / px, -(o.y + o.h / 2) / px);
  function cellSet() {
    const m = new Map();
    return { m, at(x, y) { const k = cellKey(x, y); let c = m.get(k); if (!c) m.set(k, c = { k, b: [new Builder(), new Builder(), new Builder(), new Builder()] }); return c.b; } };
  }
  // Relief (terrain.js) : hauteur du sol en mètres du repère 3D, pour poser le décor ; wet : eau
  let HF = null, WET = null;
  function setTerrain(T, px) {
    HF = T ? (x, y) => T.surf(x * px, -y * px) : null;
    WET = T ? (x, y) => T.wetAt(x * px, -y * px) : null;
  }
  // sol : grille du relief en blocs de 16 × 16 mailles (seuls ceux du champ sont dessinés), normales
  // lissées aux sommets, une maille sur deux puis sur quatre au loin, avec une jupe de 1,5 m au bord de
  // chaque bloc contre les fentes entre niveaux de détail ; au-delà de la marge, grandes dalles plates
  // (la texture s'étire hors de la carte)
  function buildGround(T, px, WWm, WHm) {
    const out = new Map(), { C, M, nx, ny, h } = T, s = C / px, X0 = -M / px, Y0 = M / px, BK = 16;
    const nor = (i, j) => {
      const a = h[j * nx + Math.max(0, i - 1)], b = h[j * nx + Math.min(nx - 1, i + 1)], c = h[Math.max(0, j - 1) * nx + i], d = h[Math.min(ny - 1, j + 1) * nx + i];
      const nx_ = -(b - a) / (2 * s), ny_ = (d - c) / (2 * s), l = Math.hypot(nx_, ny_, 1);
      return [nx_ / l, ny_ / l, 1 / l];
    };
    const P = (i, j) => [X0 + i * s, Y0 - j * s, h[j * nx + i]], W1 = [1, 1, 1];
    for (let bj = 0; bj < ny - 1; bj += BK) for (let bi = 0; bi < nx - 1; bi += BK) {
      const ie = Math.min(nx - 1, bi + BK), je = Math.min(ny - 1, bj + BK), LB = [0, 1, 2].map(L => {
        const b = new Builder(), st = 1 << L;
        for (let j = bj; j < je; j += st) for (let i = bi; i < ie; i += st) {
          const i2 = Math.min(ie, i + st), j2 = Math.min(je, j + st), A = P(i, j2), B = P(i2, j2), Cc = P(i2, j), D = P(i, j);
          b.triN(A, B, Cc, nor(i, j2), nor(i2, j2), nor(i2, j), W1, 9);
          b.triN(A, Cc, D, nor(i, j2), nor(i2, j), nor(i, j), W1, 9);
        }
        const edge = (i0, j0, di, dj, n) => {
          for (let k = 0; k < n; k += st) {
            const a = [i0 + di * k, j0 + dj * k], c = [i0 + di * Math.min(n, k + st), j0 + dj * Math.min(n, k + st)];
            const pa = P(a[0], a[1]), pc = P(c[0], c[1]), na = nor(a[0], a[1]), nc = nor(c[0], c[1]);
            b.triN(pa, pc, [pc[0], pc[1], pc[2] - 1.5], na, nc, nc, W1, 9);
            b.triN(pa, [pc[0], pc[1], pc[2] - 1.5], [pa[0], pa[1], pa[2] - 1.5], na, nc, na, W1, 9);
          }
        };
        { edge(bi, bj, 1, 0, ie - bi); edge(bi, je, 1, 0, ie - bi); edge(bi, bj, 0, 1, je - bj); edge(ie, bj, 0, 1, je - bj); }
        return b;
      });
      out.set('g' + bi + '_' + bj, { b: [LB[0], LB[1], LB[2], null] });
    }
    const b = new Builder(), n = [0, 0, 1], gx0 = X0, gx1 = X0 + (nx - 1) * s, gy1 = Y0, gy0 = Y0 - (ny - 1) * s;
    const g0 = -WWm * 0.6, g1 = WWm * 1.6, h0 = -WHm * 1.6, h1 = WHm * 0.6;
    const slab = (x0, y0, x1, y1) => {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const a = x0 + (x1 - x0) * i / 4, c = x0 + (x1 - x0) * (i + 1) / 4, e = y0 + (y1 - y0) * j / 4, f = y0 + (y1 - y0) * (j + 1) / 4;
        b.triN([a, e, 0], [c, e, 0], [c, f, 0], n, n, n, W1, 9);
        b.triN([a, e, 0], [c, f, 0], [a, f, 0], n, n, n, W1, 9);
      }
    };
    slab(g0, h0, gx0, h1); slab(gx1, h0, g1, h1); slab(gx0, h0, gx1, gy0); slab(gx0, gy1, gx1, h1);
    out.set('go', { b: [null, null, null, b] });
    return out;
  }
  // Eau et glace : une dalle au niveau de l'eau sur chaque maille mouillée, teintée selon la profondeur
  // aux sommets (la berge cache le reste) ; mailles de glace intactes en glace, brisées en eau
  function buildWater(T, px, lv) {
    const b = new Builder(), { C, M, nx, ny, h, wl } = T, s = C / px, X0 = -M / px, Y0 = M / px, n = [0, 0, 1];
    if (!(wl > -1e9)) return { b: [null, null, null, null] };
    const sh = lv.forest ? [0.2, 0.22, 0.14] : [0.22, 0.27, 0.22], dp = lv.forest ? [0.04, 0.06, 0.05] : [0.05, 0.09, 0.1];
    const col = q => { const k = Math.min(1, Math.max(0, (wl - h[q]) / 1.6)); return [sh[0] + (dp[0] - sh[0]) * k, sh[1] + (dp[1] - sh[1]) * k, sh[2] + (dp[2] - sh[2]) * k]; };
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const q = j * nx + i, qs = [q + nx, q + nx + 1, q + 1, q];
      if (Math.min(h[q], h[q + 1], h[q + nx], h[q + nx + 1]) >= wl) continue;
      const iced = T.ice && T.ice[j * (nx - 1) + i] === 1, z = wl + (iced ? 0.04 : 0), m = iced ? 16 : 15;
      const p = [[i, j + 1], [i + 1, j + 1], [i + 1, j], [i, j]].map(([a, c]) => [X0 + a * s, Y0 - c * s, z]);
      const cs = qs.map(k => iced ? [0.74, 0.82, 0.88] : col(k));
      b.put(...p[0], ...n, ...cs[0], m); b.put(...p[1], ...n, ...cs[1], m); b.put(...p[2], ...n, ...cs[2], m);
      b.put(...p[0], ...n, ...cs[0], m); b.put(...p[2], ...n, ...cs[2], m); b.put(...p[3], ...n, ...cs[3], m);
    }
    return { b: [null, null, null, b] };
  }
  // Ponts de bois : tablier de madriers sur longerons, garde-corps et pieux ; effondré, deux moignons
  // aux berges et des madriers qui flottent
  function buildBridges(T, px) {
    const b = new Builder(), wood = [0.36, 0.27, 0.18], dark = [0.22, 0.16, 0.1];
    for (const g of T.bridges) {
      const ux = g.ux / px, uy = -g.uy / px, cx = g.x / px, cy = -g.y / px, L = g.hl / px, Wd = g.hw / px, a = Math.atan2(uy, ux);
      const at = (u, v) => [cx + Math.cos(a) * u - Math.sin(a) * v, cy + Math.sin(a) * u + Math.cos(a) * v];
      const plank = (u0, u1, v, w, z, hz, c) => {
        const p = at((u0 + u1) / 2, v), l = u1 - u0;
        // boîte orientée : quatre coins en bas, quatre en haut
        const cs = [[-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2]].map(([du, dv]) => [p[0] + Math.cos(a) * du - Math.sin(a) * dv, p[1] + Math.sin(a) * du + Math.cos(a) * dv]);
        const lo = cs.map(q => [q[0], q[1], z]), hi = cs.map(q => [q[0], q[1], z + hz]), ctr = [p[0], p[1], z + hz / 2];
        b.quad(hi[0], hi[1], hi[2], hi[3], c, 6, ctr);
        for (let k = 0; k < 4; k++) b.quad(lo[k], lo[(k + 1) % 4], hi[(k + 1) % 4], hi[k], c, 6, ctr);
      };
      const span = (T.spec.water.river.hw + 6) / px;
      for (let u = -L; u < L; u += 0.5) {
        if (g.dead && Math.abs(u + 0.25) < span) continue;
        plank(u, u + 0.46, 0, Wd * 2, g.z - 0.12, 0.12, (Math.round(u * 2) & 1) ? wood : [wood[0] * 0.9, wood[1] * 0.9, wood[2] * 0.85]);
      }
      for (const v of [-Wd + 0.15, Wd - 0.15]) {
        if (!g.dead) plank(-L, L, v, 0.12, g.z + 0.75, 0.12, dark);
        for (let u = -L + 0.3; u <= L; u += 2.2) {
          if (!g.dead || Math.abs(u) > span) plank(u - 0.08, u + 0.08, v, 0.16, g.z, 0.9, dark);
          plank(u - 0.12, u + 0.12, v, 0.24, T.wl - 2.5, g.z - T.wl + 2.4, dark);
        }
      }
      if (g.dead) for (let k = 0; k < 9; k++) { const u = (k / 8 - 0.5) * span * 1.6; plank(u, u + 0.45, ((k * 7) % 5 - 2) * 0.5, 1.6 + (k % 3) * 0.6, T.wl - 0.06, 0.1, wood); }
    }
    return { b: [null, null, null, b] };
  }
  // Pose sur le relief : les sommets ajoutés par f (dans les constructeurs B) montent de la hauteur du sol
  // au point d'ancrage (x, y) ; elle est aussi gardée dans la fraction du matériau, que le shader lit pour
  // l'occlusion au pied des objets et le balancement du feuillage
  function lift(B, x, y, f) {
    if (!HF) { f(); return; }
    const z = HF(x, y), st = B.map(q => q.n);
    f();
    if (Math.abs(z) < 0.002) return;
    const fr = 0.2 + Math.max(-38, Math.min(38, z)) / 200;
    B.forEach((q, k) => { for (let o = st[k]; o < q.n; o += 10) { q.a[o + 2] += z; q.a[o + 9] += fr; } });
  }
  // obstacles du jeu (pixels) → cellules statiques (mètres). px : pixels par mètre. only : clé d'une
  // seule cellule à reconstruire. extras : herbe et lisière hors carte (construites une fois).
  function buildScene(lv, obstacles, px, WWm, WHm, seed, only = null, extras = false) {
    const cs = cellSet();
    let B = null, b = null;
    const cellAt = (x, y) => { B = cs.at(x, y); b = B[3]; };
    let s = seed >>> 0 || 1;
    const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const rr = (a, c) => a + R() * (c - a);
    const hex = h => G3.hex(h);
    const M = v => v / px, Yv = v => -v / px;
    const snow = !!lv.snow, city = !!lv.city, desert = !!lv.desert, forest = !!lv.forest;
    const conifer = forest || snow;
    const wallCol = hex(lv.wall), roofCol = hex(lv.roof[0]);
    const tree = (x, y, sc, dead, ang) => {
      const trunkC = [0.28, 0.21, 0.15];
      if (dead) {
        // arbre abattu : tronc couché et souche
        const L = 7 * sc, c = Math.cos(ang), sn = Math.sin(ang);
        b.cyl([x, y, 0.3], [x + c * L, y + sn * L, 0.35], 0.28 * sc, 0.16 * sc, 8, trunkC, 6);
        b.sphere([x + c * L * 0.85, y + sn * L * 0.85, 1.0], 2.2 * sc, 2.2 * sc, 1.1 * sc, 7, hex(lv.tree[0]), 8);
        b.cyl([x, y, 0], [x, y, 0.5], 0.3 * sc, 0.28 * sc, 8, trunkC, 6);
        return;
      }
      const col0 = hex(lv.tree[0]), col1 = hex(lv.tree[1]);
      if (conifer) {
        b.cyl([x, y, 0], [x, y, 2.2 * sc], 0.3 * sc, 0.22 * sc, 7, trunkC, 6);
        const lev = 4;
        for (let k = 0; k < lev; k++) {
          const z0 = (1.6 + k * 2.4) * sc, r0 = (3.0 - k * 0.6) * sc;
          b.cyl([x, y, z0], [x, y, z0 + 3.4 * sc], r0, 0.15 * sc, 9, k % 2 ? col1 : col0, 8);
        }
      } else {
        b.cyl([x, y, 0], [x, y, 4.2 * sc], 0.32 * sc, 0.2 * sc, 7, trunkC, 6);
        B[0].cyl([x, y, 2.6 * sc], [x + 1.2 * sc, y + 0.6 * sc, 4.6 * sc], 0.12 * sc, 0.08 * sc, 5, trunkC, 6);
        // houppier : nombreuses touffes de tailles variées, plus sombres au cœur ; de loin, les cinq
        // premières seulement, grossies et moins facettées
        for (let k = 0; k < 11; k++) {
          const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 2.4 * sc, z = rr(4.2, 7.6) * sc;
          const r = rr(1.0, 1.7) * sc, kc = rr(0.7, 1.1) * (0.8 + 0.2 * (d / (2.4 * sc)));
          const cb = k % 2 ? col1 : col0, cc = [cb[0] * kc, cb[1] * kc, cb[2] * kc], p = [x + Math.cos(a) * d, y + Math.sin(a) * d, z];
          B[0].sphere(p, r, r, r * 0.85, 6, cc, 8);
          if (k < 5) { B[1].sphere(p, r * 1.3, r * 1.3, r * 1.1, 5, cc, 8); B[2].sphere(p, r * 1.3, r * 1.3, r * 1.1, 4, cc, 8); }
        }
      }
    };
    const rock = (cx, cy, rx, ry, rz, col) => {
      const seg = 8, pts = [];
      for (let i = 0; i <= seg; i++) {
        const row = [];
        for (let j = 0; j < seg; j++) {
          const th = i / seg * Math.PI, ph = j / seg * Math.PI * 2;
          const k = 0.75 + 0.35 * R();
          row.push([cx + Math.sin(th) * Math.cos(ph) * rx * k, cy + Math.sin(th) * Math.sin(ph) * ry * k, Math.max(-0.2, Math.cos(th) * rz * k + rz * 0.35)]);
        }
        pts.push(row);
      }
      const ctr = [cx, cy, rz * 0.3];
      for (let i = 0; i < seg; i++) for (let j = 0; j < seg; j++) {
        const a = pts[i][j], c = pts[i + 1][j], d = pts[i + 1][(j + 1) % seg], e = pts[i][(j + 1) % seg];
        const kf = rr(0.82, 1.1), cc = [col[0] * kf, col[1] * kf, col[2] * kf];
        b.tri(a, c, d, cc, 6, ctr); b.tri(a, d, e, cc, 6, ctr);
      }
      if (snow) b.sphere([cx, cy, rz * 1.15], rx * 0.7, ry * 0.7, rz * 0.25, 7, [0.92, 0.94, 0.97], 7);
    };
    const building = (o) => {
      const x0 = M(o.x), x1 = M(o.x + o.w), y1 = Yv(o.y), y0 = Yv(o.y + o.h);
      const dx = x1 - x0, dy = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const floors = city ? 2 + Math.floor(R() * 3) : 1 + (R() < 0.4 ? 1 : 0);
      const H = floors * 3.1 + 0.4;
      if (o.dead) {
        // gravats : tas irrégulier, blocs épars et pans de murs encore debout
        rock(cx, cy, dx * 0.45, dy * 0.45, Math.min(2.2, H * 0.25), [wallCol[0] * 0.8, wallCol[1] * 0.78, wallCol[2] * 0.75]);
        for (let k = 0; k < 14; k++) b.box(rr(x0 - 1, x1 + 1), rr(y0 - 1, y1 + 1), 0.3, rr(0.4, 1.4), rr(0.3, 1.0), rr(0.3, 0.7), [wallCol[0] * rr(0.6, 1), wallCol[1] * rr(0.6, 1), wallCol[2] * rr(0.6, 1)], 12);
        b.box(x0 + 0.2, cy, H * 0.3, 0.4, dy * 0.6, H * 0.6, wallCol, 12);
        b.box(cx, y1 - 0.2, H * 0.22, dx * 0.4, 0.4, H * 0.45, wallCol, 12);
        return;
      }
      const wc = [wallCol[0] * rr(0.85, 1.08), wallCol[1] * rr(0.85, 1.05), wallCol[2] * rr(0.85, 1.05)];
      b.box(cx, cy, H / 2, dx, dy, H, wc, 12);
      b.box(cx, cy, 0.25, dx + 0.3, dy + 0.3, 0.5, [wc[0] * 0.7, wc[1] * 0.7, wc[2] * 0.7], 12); // soubassement
      // fenêtres et volets
      const glass = [0.08, 0.1, 0.12], frame = [0.3, 0.27, 0.24];
      const facade = (ax, len, fixed, sign) => {
        const n = Math.max(1, Math.floor(len / 2.6));
        for (let f = 0; f < floors; f++) for (let k = 0; k < n; k++) {
          const t = -len / 2 + (k + 0.5) * len / n, z = 1.0 + f * 3.1 + 0.85;
          if (f === 0 && k === Math.floor(n / 2) && sign > 0) { // porte
            if (ax) b.box(cx + t, fixed + sign * 0.03, 1.1, 1.1, 0.08, 2.2, [0.25, 0.17, 0.11], 6);
            else b.box(fixed + sign * 0.03, cy + t, 1.1, 0.08, 1.1, 2.2, [0.25, 0.17, 0.11], 6);
            continue;
          }
          const broken = city && R() < 0.35;
          // encadrements : de près seulement
          if (ax) { for (let q = 0; q < 2; q++) B[q].box(cx + t, fixed + sign * 0.04, z, 1.25, 0.06, 1.55, frame, 7); b.box(cx + t, fixed + sign * 0.07, z, 1.05, 0.04, 1.35, broken ? [0.02, 0.02, 0.02] : glass, broken ? 7 : 13); }
          else { for (let q = 0; q < 2; q++) B[q].box(fixed + sign * 0.04, cy + t, z, 0.06, 1.25, 1.55, frame, 7); b.box(fixed + sign * 0.07, cy + t, z, 0.04, 1.05, 1.35, broken ? [0.02, 0.02, 0.02] : glass, broken ? 7 : 13); }
        }
      };
      facade(true, dx, y0, -1); facade(true, dx, y1, 1); facade(false, dy, x0, -1); facade(false, dy, x1, 1);
      if (city) {
        // toit plat avec acrotère, parfois éventré
        const pc = [wc[0] * 0.8, wc[1] * 0.8, wc[2] * 0.8];
        b.box(cx, y0 + 0.2, H + 0.4, dx, 0.4, 0.8, pc, 12); b.box(cx, y1 - 0.2, H + 0.4, dx, 0.4, 0.8, pc, 12);
        b.box(x0 + 0.2, cy, H + 0.4, 0.4, dy, 0.8, pc, 12); b.box(x1 - 0.2, cy, H + 0.4, 0.4, dy, 0.8, pc, 12);
        b.box(cx, cy, H + 0.02, dx - 0.6, dy - 0.6, 0.05, [0.22, 0.21, 0.2], 6);
        if (R() < 0.5) rock(rr(x0 + 2, x1 - 2), rr(y0 + 2, y1 - 2), 1.5, 1.2, 0.6, [0.4, 0.38, 0.35]);
      } else {
        // toit à deux pans en tuiles, débordant, avec cheminée
        const along = dx >= dy, ov = 0.45, rh = Math.min(dx, dy) * 0.42;
        const rc = snow ? [0.9, 0.92, 0.95] : roofCol;
        if (along) {
          const a = [x0 - ov, y0 - ov, H], c = [x1 + ov, y0 - ov, H], d = [x1 + ov, cy, H + rh], e = [x0 - ov, cy, H + rh];
          const f2 = [x1 + ov, y1 + ov, H], g2 = [x0 - ov, y1 + ov, H];
          const ctr = [cx, cy, H];
          b.quad(a, c, d, e, rc, 10, ctr); b.quad(g2, f2, d, e, rc, 10, ctr);
          b.tri([x0, y0, H], [x0, y1, H], [x0, cy, H + rh - 0.2], wc, 12, ctr); b.tri([x1, y0, H], [x1, y1, H], [x1, cy, H + rh - 0.2], wc, 12, ctr);
        } else {
          const a = [x0 - ov, y0 - ov, H], c = [x0 - ov, y1 + ov, H], d = [cx, y1 + ov, H + rh], e = [cx, y0 - ov, H + rh];
          const f2 = [x1 + ov, y1 + ov, H], g2 = [x1 + ov, y0 - ov, H];
          const ctr = [cx, cy, H];
          b.quad(a, c, d, e, rc, 10, ctr); b.quad(g2, f2, d, e, rc, 10, ctr);
          b.tri([x0, y0, H], [x1, y0, H], [cx, y0, H + rh - 0.2], wc, 12, ctr); b.tri([x0, y1, H], [x1, y1, H], [cx, y1, H + rh - 0.2], wc, 12, ctr);
        }
        b.box(cx + dx * 0.2, cy + dy * 0.15, H + rh * 0.8, 0.6, 0.6, rh * 1.2, [0.45, 0.25, 0.2], 12);
      }
      // dégâts : brèches noircies dans les façades
      const dmg = 1 - o.hp / o.maxHp;
      for (let k = 0; k < Math.floor(dmg * 6); k++) {
        const t = rr(-0.4, 0.4), z = rr(1, H - 1);
        if (R() < 0.5) b.box(cx + t * dx, (R() < 0.5 ? y0 : y1), z, rr(1, 2.2), 0.5, rr(1, 2), [0.05, 0.045, 0.04], 6);
        else b.box((R() < 0.5 ? x0 : x1), cy + t * dy, z, 0.5, rr(1, 2.2), rr(1, 2), [0.05, 0.045, 0.04], 6);
      }
    };
    if (!extras) for (const o of obstacles) {
      if (o.type === 'wreck') continue; // tourelle arrachée : dessinée par le jeu avec son modèle
      if (only != null && obstacleCell(o, px) !== only) continue;
      if (o.falling) continue; // arbre en train de tomber : dessiné à part par le jeu
      s = ((Math.round(o.x) * 73856093) ^ (Math.round(o.y) * 19349663)) >>> 0 || 1;
      const ax = o.type === 'tree' ? M(o.x + 8) : M(o.x + o.w / 2), ay = o.type === 'tree' ? Yv(o.y + 8) : Yv(o.y + o.h / 2);
      cellAt(ax, ay);
      lift(B, ax, ay, () => {
        if (o.type === 'tree') tree(ax, ay, o.size, o.dead, -(o.fall || 0));
        else if (o.type === 'rock') rock(ax, ay, M(o.w) * 0.55, M(o.h) * 0.55, M(Math.min(o.w, o.h)) * 0.45, snow ? [0.55, 0.57, 0.6] : desert ? [0.6, 0.5, 0.38] : [0.47, 0.45, 0.42]);
        else if (o.type === 'wall') {
          const x0 = M(o.x), x1 = M(o.x + o.w), y1 = Yv(o.y), y0 = Yv(o.y + o.h);
          if (o.dead) { for (let k = 0; k < 8; k++) b.box(rr(x0, x1), rr(y0, y1), 0.15, rr(0.3, 0.8), rr(0.3, 0.8), 0.3, wallCol, 12); return; }
          b.box((x0 + x1) / 2, (y0 + y1) / 2, 0.6, x1 - x0, y1 - y0, 1.2, [wallCol[0] * 0.9, wallCol[1] * 0.9, wallCol[2] * 0.88], 12);
          b.box((x0 + x1) / 2, (y0 + y1) / 2, 1.25, x1 - x0 + 0.1, y1 - y0 + 0.1, 0.12, [wallCol[0] * 0.75, wallCol[1] * 0.75, wallCol[2] * 0.72], 12);
          if (snow) b.box((x0 + x1) / 2, (y0 + y1) / 2, 1.33, x1 - x0, y1 - y0, 0.05, [0.92, 0.94, 0.97], 7);
        } else building(o);
      });
    }
    if (only != null) return cs.m.get(only) || { k: only, b: [null, null, null, null] };
    if (!extras) return cs.m;
    s = (seed >>> 0) + 977 || 1;
    // touffes d'herbe : trois brins fins, un peu plus sombres que le sol (invisibles de loin)
    if (!city && !snow) {
      const gc = desert ? [0.5, 0.44, 0.27] : forest ? [0.2, 0.28, 0.1] : [0.32, 0.38, 0.15];
      for (let k = 0; k < (desert ? 900 : 3200); k++) {
        const x = rr(0, WWm), y = -rr(0, WHm), wet = WET && WET(x, y);
        cellAt(x, y);
        const cc = [gc[0] * rr(0.75, 1.15), gc[1] * rr(0.75, 1.15), gc[2] * rr(0.75, 1.15)];
        if (!wet) lift(B, x, y, () => { for (let q = 0; q < 3; q++) {
          const a = R() * Math.PI * 2, hgt = rr(0.25, 0.65), w = 0.05, lean = rr(0.05, 0.2);
          const c = Math.cos(a), sn = Math.sin(a), bx = x + rr(-0.12, 0.12), by = y + rr(-0.12, 0.12);
          const n = [0, 0, 1];
          for (let q = 0; q < 2; q++) B[q].triN([bx - sn * w, by + c * w, 0], [bx + sn * w, by - c * w, 0], [bx + c * lean, by + sn * lean, hgt], n, n, n, cc, 8);
        } });
      }
    }
    // lisière de forêt au-delà de la carte (évite le bord du monde)
    if (!desert && !city) {
      for (let k = 0; k < 140; k++) {
        const side = k % 4, t = R();
        let x, y;
        if (side === 0) { x = t * WWm; y = rr(8, 40); } else if (side === 1) { x = t * WWm; y = -WHm - rr(8, 40); }
        else if (side === 2) { x = -rr(8, 40); y = -t * WHm; } else { x = WWm + rr(8, 40); y = -t * WHm; }
        const sc = rr(1.0, 1.5);
        if (WET && WET(x, y)) continue;
        cellAt(x, y);
        lift(B, x, y, () => tree(x, y, sc, false, 0));
      }
    }
    return cs.m;
  }

  // ===================== Buissons =====================
  // Chaque zone de buisson est remplie de plants de taille réelle ; chaque plant a des branches,
  // un cœur dense et quelques centaines de feuilles orientées vers l'extérieur.
  // Niveaux de détail : de près tout, à mi-distance le cœur et les bouquets larges grossis, de loin
  // une seule masse de feuillage. leafK : densité de feuilles selon la qualité.
  function buildBushes(lv, bushes, px, seed, leafK = 1) {
    const cs = cellSet();
    let B = null;
    let s = (seed >>> 0) || 1;
    const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const rr = (a, c) => a + R() * (c - a);
    const snow = !!lv.snow, desert = !!lv.desert, forest = !!lv.forest, city = !!lv.city;
    const leafBase = desert ? [0.42, 0.42, 0.27] : forest ? [0.18, 0.31, 0.1] : snow ? [0.13, 0.25, 0.15] : city ? [0.27, 0.33, 0.16] : [0.25, 0.4, 0.13];
    const leafTop = desert ? [0.56, 0.53, 0.34] : forest ? [0.3, 0.44, 0.13] : snow ? [0.2, 0.33, 0.19] : [0.46, 0.56, 0.2];
    const dead = desert ? [0.5, 0.42, 0.26] : [0.42, 0.36, 0.17];
    const wood = [0.2, 0.15, 0.1];
    const berries = !desert && !snow && !city;
    const plant = (x, y, pr, ph) => {
      // branches principales
      const nb = 5 + Math.floor(R() * 3);
      for (let k = 0; k < nb; k++) {
        const a = R() * Math.PI * 2, d = pr * rr(0.45, 0.8);
        B[0].cyl([x, y, 0], [x + Math.cos(a) * d, y + Math.sin(a) * d, ph * rr(0.55, 0.85)], rr(0.025, 0.04), 0.01, 5, wood, 6);
      }
      // cœur sombre : pas de vide au milieu du feuillage
      const core = [leafBase[0] * 0.55, leafBase[1] * 0.55, leafBase[2] * 0.55];
      for (let q = 0; q < 2; q++) B[q].sphere([x, y, ph * 0.45], pr * 0.5, pr * 0.5, ph * 0.36, 6, core, 8);
      const far = [0, 1, 2].map(i => (leafBase[i] + leafTop[i]) * 0.36);
      B[2].sphere([x, y, ph * 0.5], pr * 0.85, pr * 0.85, ph * 0.52, 5, far, 8);
      // feuilles, plus denses en surface
      // deux couches : bouquets larges à mi-profondeur, puis feuilles fines en surface
      const nl = Math.round(120 * Math.min(1.8, (pr * pr) / 1.2) * leafK), nc = Math.round(nl * 0.45), lk = Math.min(1.5, 1 / Math.sqrt(leafK));
      for (let k = 0; k < nl + nc; k++) {
        const cluster = k >= nl, leafS = (desert ? 0.1 : 0.17) * (cluster ? 2.1 : 1) * lk;
        const z0 = rr(-1, 1), ph0 = R() * Math.PI * 2, rr0 = Math.sqrt(1 - z0 * z0);
        const dir = [rr0 * Math.cos(ph0), rr0 * Math.sin(ph0), Math.abs(z0) * (z0 < -0.3 ? 0.4 : 1)];
        const f = cluster ? 0.55 + 0.3 * R() : 0.72 + 0.28 * Math.cbrt(R());
        const c = [x + dir[0] * pr * f, y + dir[1] * pr * f, Math.max(0.05, ph * 0.45 + dir[2] * ph * 0.55 * f)];
        let n = [dir[0] + rr(-0.5, 0.5), dir[1] + rr(-0.5, 0.5), dir[2] + rr(-0.2, 0.8)];
        const nl2 = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / nl2, n[1] / nl2, n[2] / nl2];
        const ref = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        let u = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]];
        const ul = Math.hypot(u[0], u[1], u[2]) || 1; u = [u[0] / ul, u[1] / ul, u[2] / ul];
        const sp = R() * Math.PI, cs = Math.cos(sp), sn = Math.sin(sp);
        const v0 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
        u = [u[0] * cs + v0[0] * sn, u[1] * cs + v0[1] * sn, u[2] * cs + v0[2] * sn];
        const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
        const sz = leafS * rr(0.75, 1.35);
        const P = (a, bb) => [c[0] + u[0] * a + v[0] * bb, c[1] + u[1] * a + v[1] * bb, c[2] + u[2] * a + v[2] * bb];
        const tip = P(sz, 0), side1 = P(0, sz * 0.42), back = P(-sz * 0.55, 0), side2 = P(0, -sz * 0.42);
        // teinte : cœur plus sombre, sommet plus clair, quelques feuilles mortes
        const depth = Math.min(1, Math.max(0, (f - 0.55) / 0.45)), top = Math.max(0, dir[2]);
        let col = [0, 1, 2].map(i => leafBase[i] + (leafTop[i] - leafBase[i]) * (0.3 * top + 0.4 * depth + 0.3 * R()));
        if (R() < 0.02) col = dead.map(q => q * rr(0.8, 1.1));
        const ao = 0.62 + 0.38 * depth;
        col = col.map(q => q * ao);
        B[0].triN(tip, side1, back, n, n, n, col, 14);
        B[0].triN(tip, back, side2, n, n, n, col, 14);
        // mi-distance : les bouquets larges et une feuille fine sur quatre, grossis
        if (cluster || k % 4 === 0) {
          const g = cluster ? 1.5 : 1.8, P2 = (a, bb) => [c[0] + (u[0] * a + v[0] * bb) * g, c[1] + (u[1] * a + v[1] * bb) * g, c[2] + (u[2] * a + v[2] * bb) * g];
          const t2 = P2(sz, 0), b2 = P2(-sz * 0.55, 0);
          B[1].triN(t2, P2(0, sz * 0.42), b2, n, n, n, col, 14);
          B[1].triN(t2, b2, P2(0, -sz * 0.42), n, n, n, col, 14);
        }
        if (berries && R() < 0.012) B[0].sphere(P(0, 0), 0.03, 0.03, 0.03, 4, R() < 0.6 ? [0.5, 0.05, 0.05] : [0.85, 0.85, 0.8], 7);
      }
      if (snow) B[3].sphere([x, y, ph * 0.92], pr * 0.75, pr * 0.75, ph * 0.14, 7, [0.9, 0.92, 0.96], 7);
    };
    for (const bu of bushes) {
      const x = bu.x / px, y = -bu.y / px, r = bu.r / px;
      B = cs.at(x, y);
      const n = Math.max(2, Math.min(4, Math.round((r / 1.4) * (r / 1.4) * 0.6)));
      for (let k = 0; k < n; k++) {
        const a = R() * Math.PI * 2, d = Math.sqrt(R()) * r * 0.65;
        const pr = rr(0.85, 1.5) * (desert ? 0.75 : 1), ph = pr * rr(0.9, 1.25), qx = x + Math.cos(a) * d, qy = y + Math.sin(a) * d;
        lift(B, qx, qy, () => plant(qx, qy, pr, ph));
      }
    }
    return cs.m;
  }

  return { create, buildScene, buildBushes, buildGround, buildWater, buildBridges, setTerrain, cellKey, obstacleCell };
})();
