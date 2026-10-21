'use strict';
// Rendu 3D du champ de bataille : ombres du soleil, ciel, brume, lumières dynamiques, sol détaillé,
// décor (bâtiments, arbres, rochers, herbe), chars, obus, fumées et flammes.
// Repère monde en mètres : X vers l'est, Y vers le nord, Z vers le haut.
const World3D = (() => {
  const { M4, Builder } = G3;

  const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute float aMat;
uniform mat4 uVP; uniform mat4 uModel; uniform mat4 uLVP; uniform float uTime;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec3 vO; varying float vM; varying vec4 vL;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  if (aMat > 7.5 && aMat < 8.5) {
    float h = max(0.0, w.z - 0.8);
    w.x += sin(uTime * 1.3 + w.x * 0.15 + w.y * 0.11) * 0.035 * h;
    w.y += cos(uTime * 1.1 + w.y * 0.13 + w.x * 0.07) * 0.025 * h;
  }
  vW = w.xyz; vO = aPos; vN = mat3(uModel) * aNor; vC = aCol; vM = aMat; vL = uLVP * w;
  gl_Position = uVP * w;
}`;
  const FS = `
precision highp float;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec3 vO; varying float vM; varying vec4 vL;
uniform vec3 uEye; uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uSkyCol; uniform vec3 uBounce;
uniform vec3 uFogCol; uniform float uFogD; uniform vec3 uZenith; uniform vec3 uHorizon;
uniform vec3 uCamo0; uniform vec3 uCamo1; uniform vec3 uCamo2;
uniform float uBurnt; uniform vec4 uTint; uniform float uTread; uniform float uSeed; uniform float uSnow;
uniform sampler2D uShadow; uniform float uShadowTexel; uniform sampler2D uGround; uniform vec2 uMap;
uniform vec4 uLP[8]; uniform vec3 uLC[8]; uniform float uTime;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ return 0.5 * n3(p) + 0.25 * n3(p * 2.03) + 0.125 * n3(p * 4.01) + 0.0625 * n3(p * 8.07); }
float unpack(vec4 c){ return dot(c, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0)); }
float shadowAt(vec4 l, float bias){
  vec3 p = l.xyz / l.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    float d = unpack(texture2D(uShadow, p.xy + vec2(float(i), float(j)) * uShadowTexel));
    s += p.z - bias > d ? 0.0 : 1.0;
  }
  return s / 9.0;
}
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 tm(vec3 c){ c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14); return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
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
    gl_FragColor = vec4(tm(sky), 1.0);
    return;
  }
  vec3 base = vC;
  vec3 P = vO + vec3(uSeed);
  float paint = 0.0, ks = 0.08, shin = 16.0, trans = 0.0;
  if (vM < 0.5) { paint = 1.0; }
  else if (vM < 1.5) {
    float a = fbm(P * 1.25 + 3.1), b = fbm(P * 1.3 + 17.3);
    base = uCamo0;
    base = mix(base, uCamo1, smoothstep(0.50, 0.535, a));
    base = mix(base, uCamo2, smoothstep(0.53, 0.565, b));
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
    float g1 = fbm(vec3(vW.xy * 0.35, 1.0)), g2 = fbm(vec3(vW.xy * 2.2, 7.0)), g3 = n3(vec3(vW.xy * 9.0, 3.0));
    base *= 0.62 + 0.42 * g1 + 0.22 * (g2 - 0.5) + 0.12 * (g3 - 0.5);
    float e = 0.08;
    vec3 bump = vec3(fbm(vec3(vW.xy * 2.2 + vec2(e, 0.0), 7.0)) - g2, fbm(vec3(vW.xy * 2.2 + vec2(0.0, e), 7.0)) - g2, 0.0);
    N = normalize(N - bump * 1.8);
    ks = 0.04;
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
    base *= 1.0 - 0.25 * smoothstep(0.5, 0.0, vW.z);
  } else if (vM < 13.5) { ks = 0.8; shin = 120.0; }
  if (uTint.w > 0.0) { base = mix(base, uTint.rgb, uTint.w); paint = 0.0; }
  float grime = fbm(P * 5.0);
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
  float sh = shadowAt(vL, 0.0012 + 0.002 * (1.0 - abs(nd)));
  float hemi = 0.5 + 0.5 * N.z;
  float ao = 0.55 + 0.45 * smoothstep(-0.1, 1.4, vW.z);
  if (vM > 8.5 && vM < 9.5) ao = 1.0;
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), shin) * ks * sh * (1.0 - uBurnt * 0.8);
  vec3 col = base * (uSunCol * diff * sh + mix(uBounce, uSkyCol, hemi) * ao) + uSunCol * spec;
  for (int i = 0; i < 8; i++) {
    vec3 lv = uLP[i].xyz - vW;
    float ld = length(lv);
    float att = clamp(1.0 - ld / max(uLP[i].w, 0.001), 0.0, 1.0);
    att *= att;
    col += base * uLC[i] * att * (max(dot(N, lv / max(ld, 0.001)), 0.0) * 0.85 + 0.15);
  }
  float fog = 1.0 - exp(-pow(dist * uFogD, 2.0));
  col = mix(col, uFogCol, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(tm(col), 1.0);
}`;
  const SVS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute float aMat;
uniform mat4 uLVP; uniform mat4 uModel; uniform float uTime;
varying float vD;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  if (aMat > 7.5 && aMat < 8.5) { float h = max(0.0, w.z - 0.8); w.x += sin(uTime * 1.3 + w.x * 0.15 + w.y * 0.11) * 0.035 * h; }
  vec4 p = uLVP * w;
  vD = p.z / p.w * 0.5 + 0.5;
  gl_Position = p;
}`;
  const SFS = `
precision highp float;
varying float vD;
void main(){
  vec4 e = vec4(1.0, 255.0, 65025.0, 16581375.0) * vD;
  e = fract(e);
  e -= e.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);
  gl_FragColor = e;
}`;
  // particules : billboards doux (fumée éclairée) ou lumineux (flammes, éclairs, traceurs)
  const PVS = `
attribute vec3 aP; attribute vec2 aUV; attribute vec4 aC;
uniform mat4 uVP;
varying vec2 vUV; varying vec4 vC; varying vec3 vW;
void main(){ vUV = aUV; vC = aC; vW = aP; gl_Position = uVP * vec4(aP, 1.0); }`;
  const PFS = `
precision highp float;
varying vec2 vUV; varying vec4 vC; varying vec3 vW;
uniform float uGlow; uniform vec3 uSunCol; uniform vec3 uSkyCol; uniform vec3 uFogCol; uniform float uFogD; uniform vec3 uEye;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main(){
  vec2 q = vUV * 2.0 - 1.0;
  float r = length(q);
  if (uGlow > 0.5) {
    float s = pow(max(0.0, 1.0 - r), 2.2);
    gl_FragColor = vec4(vC.rgb * s * vC.a, 1.0);
    return;
  }
  float nz = 0.55 + 0.45 * n2(vUV * 5.0 + vec2(vC.a * 31.0, vW.z));
  float a = smoothstep(1.0, 0.25, r) * nz * vC.a;
  vec3 c = vC.rgb * vC.rgb * (uSkyCol * 1.3 + uSunCol * (0.32 + 0.18 * q.y));
  float fog = 1.0 - exp(-pow(length(uEye - vW) * uFogD, 2.0));
  c = mix(c, uFogCol, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)), a);
}`;

  function create(canvas) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: false });
    if (!gl) return null;
    const compile = (vs, fs) => {
      const mk = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
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
    const main = compile(VS, FS), shadow = compile(SVS, SFS), part = compile(PVS, PFS);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // carte d'ombre (profondeur encodée en RGBA)
    const SM = 2048;
    const shTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, shTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SM, SM, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const shFB = gl.createFramebuffer(), shRB = gl.createRenderbuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, shFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shTex, 0);
    gl.bindRenderbuffer(gl.RENDERBUFFER, shRB);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SM, SM);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, shRB);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const upload = b => {
      const data = b instanceof Float32Array ? b : new Float32Array(b.v);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return { buf, count: data.length / 10 };
    };
    const free = m => { if (m) gl.deleteBuffer(m.buf); };
    const bindMesh = (prog, m) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, m.buf);
      const A = prog.A, st = 40;
      const at = (n, size, off) => { if (A[n] == null || A[n] < 0) return; gl.enableVertexAttribArray(A[n]); gl.vertexAttribPointer(A[n], size, gl.FLOAT, false, st, off); };
      at('aPos', 3, 0); at('aNor', 3, 12); at('aCol', 3, 24); at('aMat', 1, 36);
    };
    // texture du sol (mise à jour par tuiles quand des traces s'y impriment)
    const gTex = gl.createTexture();
    let mapW = 1, mapH = 1;
    function setGround(cv, wm, hm) {
      gl.bindTexture(gl.TEXTURE_2D, gTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      mapW = wm; mapH = hm;
    }
    function updateGround(img, x, y) {
      gl.bindTexture(gl.TEXTURE_2D, gTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, img);
    }
    // ciel
    const skyB = new Builder(); skyB.sphere([0, 0, 0], 900, 900, 900, 18, [1, 1, 1], 11);
    const sky = upload(skyB);
    // particules
    const PCAP = 4000;
    const pData = new Float32Array(PCAP * 6 * 9), pBuf = gl.createBuffer();
    let env = null;

    function setEnv(e) { env = e; }

    // ---- dessin ----
    let frameU = null;
    function uniformsMain(cam, lvp) {
      const U = main.U;
      gl.useProgram(main.p);
      gl.uniformMatrix4fv(U.uVP, false, cam.vp);
      gl.uniformMatrix4fv(U.uLVP, false, lvp);
      gl.uniform3fv(U.uEye, cam.eye);
      gl.uniform3fv(U.uSun, env.sun); gl.uniform3fv(U.uSunCol, env.sunCol); gl.uniform3fv(U.uSkyCol, env.skyCol); gl.uniform3fv(U.uBounce, env.bounce);
      gl.uniform3fv(U.uFogCol, env.fogCol); gl.uniform1f(U.uFogD, env.fogD); gl.uniform3fv(U.uZenith, env.zenith); gl.uniform3fv(U.uHorizon, env.horizon);
      gl.uniform1f(U.uSnow, env.snow || 0); gl.uniform1f(U.uTime, cam.time);
      gl.uniform2f(U.uMap, mapW, mapH);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shTex); gl.uniform1i(U.uShadow, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, gTex); gl.uniform1i(U.uGround, 1);
      gl.uniform1f(U.uShadowTexel, 1 / SM);
      const lp = new Float32Array(32), lc = new Float32Array(24);
      (cam.lights || []).slice(0, 8).forEach((l, i) => { lp.set([l.p[0], l.p[1], l.p[2], l.r], i * 4); lc.set(l.c, i * 3); });
      gl.uniform4fv(U.uLP, lp); gl.uniform3fv(U.uLC, lc);
    }
    function drawMain(m, model, o = {}) {
      const U = main.U;
      bindMesh(main, m);
      gl.uniformMatrix4fv(U.uModel, false, model);
      const camo = o.camo || [[0.6, 0.55, 0.35], [0.4, 0.3, 0.2], [0.3, 0.35, 0.2]];
      gl.uniform3fv(U.uCamo0, camo[0]); gl.uniform3fv(U.uCamo1, camo[1]); gl.uniform3fv(U.uCamo2, camo[2]);
      gl.uniform1f(U.uBurnt, o.burnt || 0);
      gl.uniform4fv(U.uTint, o.tint || [0, 0, 0, 0]);
      gl.uniform1f(U.uTread, o.tread || 0);
      gl.uniform1f(U.uSeed, o.seed || 0);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
    }
    function drawShadow(m, model) {
      bindMesh(shadow, m);
      gl.uniformMatrix4fv(shadow.U.uModel, false, model);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
    }

    // scène : { cam: {eye, target, vp, time, lights}, items: [{mesh, model, o, noShadow}], parts: {soft:[], glow:[]} }
    function render(scene, w, h) {
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const cam = scene.cam;
      // passe d'ombre, centrée sur la zone regardée
      const c = cam.target, sd = norm(env.sun);
      const eyeL = [c[0] + sd[0] * 220, c[1] + sd[1] * 220, c[2] + sd[2] * 220];
      const ext = scene.shadowExt || 80;
      const lvp = M4.mul(M4.ortho(-ext, ext, -ext, ext, 20, 480), M4.lookAt(eyeL, c, Math.abs(sd[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1]));
      gl.bindFramebuffer(gl.FRAMEBUFFER, shFB);
      gl.viewport(0, 0, SM, SM);
      gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.BLEND); gl.depthMask(true);
      gl.useProgram(shadow.p);
      gl.uniformMatrix4fv(shadow.U.uLVP, false, lvp);
      gl.uniform1f(shadow.U.uTime, cam.time);
      for (const it of scene.items) if (!it.noShadow) drawShadow(it.mesh, it.model);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // passe principale
      gl.viewport(0, 0, w, h);
      gl.clearColor(env.fogCol[0], env.fogCol[1], env.fogCol[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      uniformsMain(cam, lvp);
      gl.depthMask(false);
      drawMain(sky, M4.trs(cam.eye[0], cam.eye[1], cam.eye[2], 0), {});
      gl.depthMask(true);
      for (const it of scene.items) drawMain(it.mesh, it.model, it.o || {});
      drawParticles(scene.parts, cam);
    }

    function drawParticles(parts, cam) {
      if (!parts) return;
      const P = part;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(P.U.uVP, false, cam.vp);
      gl.uniform3fv(P.U.uSunCol, env.sunCol); gl.uniform3fv(P.U.uSkyCol, env.skyCol);
      gl.uniform3fv(P.U.uFogCol, env.fogCol); gl.uniform1f(P.U.uFogD, env.fogD); gl.uniform3fv(P.U.uEye, cam.eye);
      const right = [cam.view[0], cam.view[4], cam.view[8]], up = [cam.view[1], cam.view[5], cam.view[9]];
      const fill = list => {
        let n = 0;
        for (const q of list) {
          if (n >= PCAP) break;
          let c0, c1, c2, c3;
          if (q.a2) { // traînée orientée (traceur, étincelle)
            const d = [q.a2[0] - q.p[0], q.a2[1] - q.p[1], q.a2[2] - q.p[2]];
            const mid = [(q.p[0] + q.a2[0]) / 2 - cam.eye[0], (q.p[1] + q.a2[1]) / 2 - cam.eye[1], (q.p[2] + q.a2[2]) / 2 - cam.eye[2]];
            let s = norm(cross(d, mid)); s = [s[0] * q.s, s[1] * q.s, s[2] * q.s];
            c0 = [q.p[0] - s[0], q.p[1] - s[1], q.p[2] - s[2]]; c1 = [q.a2[0] - s[0], q.a2[1] - s[1], q.a2[2] - s[2]];
            c2 = [q.a2[0] + s[0], q.a2[1] + s[1], q.a2[2] + s[2]]; c3 = [q.p[0] + s[0], q.p[1] + s[1], q.p[2] + s[2]];
          } else {
            const s = q.s, cr = Math.cos(q.rot || 0), sr = Math.sin(q.rot || 0);
            const rx = [(right[0] * cr + up[0] * sr) * s, (right[1] * cr + up[1] * sr) * s, (right[2] * cr + up[2] * sr) * s];
            const ux = [(-right[0] * sr + up[0] * cr) * s, (-right[1] * sr + up[1] * cr) * s, (-right[2] * sr + up[2] * cr) * s];
            c0 = [q.p[0] - rx[0] - ux[0], q.p[1] - rx[1] - ux[1], q.p[2] - rx[2] - ux[2]];
            c1 = [q.p[0] + rx[0] - ux[0], q.p[1] + rx[1] - ux[1], q.p[2] + rx[2] - ux[2]];
            c2 = [q.p[0] + rx[0] + ux[0], q.p[1] + rx[1] + ux[1], q.p[2] + rx[2] + ux[2]];
            c3 = [q.p[0] - rx[0] + ux[0], q.p[1] - rx[1] + ux[1], q.p[2] - rx[2] + ux[2]];
          }
          const vs = [[c0, 0, 0], [c1, 1, 0], [c2, 1, 1], [c0, 0, 0], [c2, 1, 1], [c3, 0, 1]];
          for (let vi = 0; vi < 6; vi++) {
            const v = vs[vi], o = (n * 6 + vi) * 9;
            pData[o] = v[0][0]; pData[o + 1] = v[0][1]; pData[o + 2] = v[0][2];
            pData[o + 3] = v[1]; pData[o + 4] = v[2];
            pData[o + 5] = q.c[0]; pData[o + 6] = q.c[1]; pData[o + 7] = q.c[2]; pData[o + 8] = q.c[3];
          }
          n++;
        }
        return n;
      };
      const draw = (list, glow) => {
        if (!list.length) return;
        const n = fill(list);
        gl.bindBuffer(gl.ARRAY_BUFFER, pBuf);
        gl.bufferData(gl.ARRAY_BUFFER, pData.subarray(0, n * 54), gl.DYNAMIC_DRAW);
        const A = P.A;
        gl.enableVertexAttribArray(A.aP); gl.vertexAttribPointer(A.aP, 3, gl.FLOAT, false, 36, 0);
        gl.enableVertexAttribArray(A.aUV); gl.vertexAttribPointer(A.aUV, 2, gl.FLOAT, false, 36, 12);
        gl.enableVertexAttribArray(A.aC); gl.vertexAttribPointer(A.aC, 4, gl.FLOAT, false, 36, 20);
        gl.uniform1f(P.U.uGlow, glow ? 1 : 0);
        gl.enable(gl.BLEND);
        if (glow) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.drawArrays(gl.TRIANGLES, 0, n * 6);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      };
      // fumées triées de la plus lointaine à la plus proche
      const e = cam.eye;
      parts.soft.sort((a, b) => ((b.p[0] - e[0]) ** 2 + (b.p[1] - e[1]) ** 2 + (b.p[2] - e[2]) ** 2) - ((a.p[0] - e[0]) ** 2 + (a.p[1] - e[1]) ** 2 + (a.p[2] - e[2]) ** 2));
      draw(parts.soft, false);
      draw(parts.glow, true);
    }

    return { gl, canvas, upload, free, render, setEnv, setGround, updateGround };
  }
  const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  // ===================== Décor =====================
  // obstacles du jeu (pixels) → maillage statique (mètres). px : pixels par mètre.
  function buildScene(lv, obstacles, bushes, px, WWm, WHm, seed) {
    const b = new Builder();
    let s = seed >>> 0 || 1;
    const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const rr = (a, c) => a + R() * (c - a);
    const hex = h => G3.hex(h);
    const M = v => v / px, Yv = v => -v / px;
    const snow = !!lv.snow, city = !!lv.city, desert = lv.name.startsWith('Désert'), forest = lv.name.startsWith('Forêt');
    const conifer = forest || snow;
    const wallCol = hex(lv.wall), roofCol = hex(lv.roof[0]);
    // sol (débordant de la carte, la texture s'étire sur les bords)
    const g0 = -WWm * 0.6, g1 = WWm * 1.6, h0 = -WHm * 1.6, h1 = WHm * 0.6;
    const GN = 8;
    for (let i = 0; i < GN; i++) for (let j = 0; j < GN; j++) {
      const x0 = g0 + (g1 - g0) * i / GN, x1 = g0 + (g1 - g0) * (i + 1) / GN, y0 = h0 + (h1 - h0) * j / GN, y1 = h0 + (h1 - h0) * (j + 1) / GN;
      const n = [0, 0, 1];
      b.triN([x0, y0, 0], [x1, y0, 0], [x1, y1, 0], n, n, n, [1, 1, 1], 9);
      b.triN([x0, y0, 0], [x1, y1, 0], [x0, y1, 0], n, n, n, [1, 1, 1], 9);
    }
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
        b.cyl([x, y, 2.6 * sc], [x + 1.2 * sc, y + 0.6 * sc, 4.6 * sc], 0.12 * sc, 0.08 * sc, 5, trunkC, 6);
        // houppier : nombreuses touffes de tailles variées, plus sombres au cœur
        for (let k = 0; k < 11; k++) {
          const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 2.4 * sc, z = rr(4.2, 7.6) * sc;
          const r = rr(1.0, 1.7) * sc, kc = rr(0.7, 1.1) * (0.8 + 0.2 * (d / (2.4 * sc)));
          const cb = k % 2 ? col1 : col0;
          b.sphere([x + Math.cos(a) * d, y + Math.sin(a) * d, z], r, r, r * 0.85, 6, [cb[0] * kc, cb[1] * kc, cb[2] * kc], 8);
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
          if (ax) { b.box(cx + t, fixed + sign * 0.04, z, 1.25, 0.06, 1.55, frame, 7); b.box(cx + t, fixed + sign * 0.07, z, 1.05, 0.04, 1.35, broken ? [0.02, 0.02, 0.02] : glass, broken ? 7 : 13); }
          else { b.box(fixed + sign * 0.04, cy + t, z, 0.06, 1.25, 1.55, frame, 7); b.box(fixed + sign * 0.07, cy + t, z, 0.04, 1.05, 1.35, broken ? [0.02, 0.02, 0.02] : glass, broken ? 7 : 13); }
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
    for (const o of obstacles) {
      s = ((Math.round(o.x) * 73856093) ^ (Math.round(o.y) * 19349663)) >>> 0 || 1;
      if (o.type === 'tree') tree(M(o.x + 8), Yv(o.y + 8), o.size, o.dead, -(o.fall || 0));
      else if (o.type === 'rock') rock(M(o.x + o.w / 2), Yv(o.y + o.h / 2), M(o.w) * 0.55, M(o.h) * 0.55, M(Math.min(o.w, o.h)) * 0.45, snow ? [0.55, 0.57, 0.6] : desert ? [0.6, 0.5, 0.38] : [0.47, 0.45, 0.42]);
      else if (o.type === 'wall') {
        const x0 = M(o.x), x1 = M(o.x + o.w), y1 = Yv(o.y), y0 = Yv(o.y + o.h);
        if (o.dead) { for (let k = 0; k < 8; k++) b.box(rr(x0, x1), rr(y0, y1), 0.15, rr(0.3, 0.8), rr(0.3, 0.8), 0.3, wallCol, 12); continue; }
        b.box((x0 + x1) / 2, (y0 + y1) / 2, 0.6, x1 - x0, y1 - y0, 1.2, [wallCol[0] * 0.9, wallCol[1] * 0.9, wallCol[2] * 0.88], 12);
        b.box((x0 + x1) / 2, (y0 + y1) / 2, 1.25, x1 - x0 + 0.1, y1 - y0 + 0.1, 0.12, [wallCol[0] * 0.75, wallCol[1] * 0.75, wallCol[2] * 0.72], 12);
        if (snow) b.box((x0 + x1) / 2, (y0 + y1) / 2, 1.33, x1 - x0, y1 - y0, 0.05, [0.92, 0.94, 0.97], 7);
      } else building(o);
    }
    s = (seed >>> 0) + 977 || 1;
    // buissons
    const bushC = hex(lv.bush);
    for (const bu of bushes) {
      const x = M(bu.x), y = Yv(bu.y), r = M(bu.r);
      for (let k = 0; k < 7; k++) { const kc = rr(0.7, 1.1), rs = r * rr(0.28, 0.45); b.sphere([x + rr(-0.55, 0.55) * r, y + rr(-0.55, 0.55) * r, rs * 0.7], rs, rs, rs * 0.8, 6, [bushC[0] * kc, bushC[1] * kc, bushC[2] * kc], 8); }
    }
    // touffes d'herbe : trois brins fins, un peu plus sombres que le sol
    if (!city && !snow) {
      const gc = desert ? [0.5, 0.44, 0.27] : forest ? [0.2, 0.28, 0.1] : [0.32, 0.38, 0.15];
      for (let k = 0; k < (desert ? 900 : 3200); k++) {
        const x = rr(0, WWm), y = -rr(0, WHm);
        const cc = [gc[0] * rr(0.75, 1.15), gc[1] * rr(0.75, 1.15), gc[2] * rr(0.75, 1.15)];
        for (let q = 0; q < 3; q++) {
          const a = R() * Math.PI * 2, hgt = rr(0.25, 0.65), w = 0.05, lean = rr(0.05, 0.2);
          const c = Math.cos(a), sn = Math.sin(a), bx = x + rr(-0.12, 0.12), by = y + rr(-0.12, 0.12);
          const n = [0, 0, 1];
          b.triN([bx - sn * w, by + c * w, 0], [bx + sn * w, by - c * w, 0], [bx + c * lean, by + sn * lean, hgt], n, n, n, cc, 8);
        }
      }
    }
    // lisière de forêt au-delà de la carte (évite le bord du monde)
    if (!desert && !city) {
      for (let k = 0; k < 140; k++) {
        const side = k % 4, t = R();
        let x, y;
        if (side === 0) { x = t * WWm; y = rr(8, 40); } else if (side === 1) { x = t * WWm; y = -WHm - rr(8, 40); }
        else if (side === 2) { x = -rr(8, 40); y = -t * WHm; } else { x = WWm + rr(8, 40); y = -t * WHm; }
        tree(x, y, rr(1.0, 1.5), false, 0);
      }
    }
    return b;
  }

  return { create, buildScene };
})();
