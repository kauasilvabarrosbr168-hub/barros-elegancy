import * as THREE from 'three';
import { J, JOINT_COUNT, POSES, solve } from '../pose.js';

// Tipos de partícula
const BODY = 0, SHIRT = 1, ACCENT = 2, RACKET = 3, HEAD = 4;

const VERT = /* glsl */ `
uniform vec3 uJ[${JOINT_COUNT}];
uniform vec3 uJL[${JOINT_COUNT}];
uniform vec3 uFwd;
uniform vec3 uCenter;
uniform float uAssemble, uTime, uPix, uRacket, uRealShirt;
uniform vec3 uSleeve;
attribute vec2 aBone;
attribute float aTorso; // 1 = tronco (some quando a camisa real está no corpo)
attribute vec4 aShape; // t, ângulo, raio, achatamento
attribute vec4 aInfo;  // tipo, rnd, rnd2, tamanho
varying float vAlpha;
varying vec3 vColor;

void main() {
  int ia = int(aBone.x + 0.5), ib = int(aBone.y + 0.5);
  float kind = aInfo.x;
  bool fabric = kind > 0.5 && kind < 2.5;
  float lag = fabric ? 0.28 + 0.4 * aShape.x : 0.0;
  vec3 A = mix(uJ[ia], uJL[ia], lag * 0.5);
  vec3 B = mix(uJ[ib], uJL[ib], lag);
  vec3 axis = B - A;
  float len = max(length(axis), 1e-4);
  axis /= len;
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 ref = normalize(mix(uFwd, up, smoothstep(0.75, 0.97, abs(dot(axis, uFwd)))));
  vec3 U = normalize(cross(axis, ref));
  vec3 V = cross(U, axis);

  vec3 p;
  if (kind > 3.5) {
    // cabeça: esfera
    float phi = aShape.x * 3.14159, th = aShape.y;
    vec3 c = mix(A, B, 0.5);
    p = c + (U * sin(phi) * cos(th) + axis * cos(phi) * 1.12 + V * sin(phi) * sin(th) * 0.95) * aShape.z;
  } else if (kind > 2.5) {
    // raquete: cabo + aro elíptico + cordas
    if (aShape.w > 0.5) {
      float ang = aShape.y;
      float rr = aShape.z;
      p = A + axis * (0.7 * len + cos(ang) * 0.165 * rr) + U * sin(ang) * 0.125 * rr;
    } else {
      p = A + axis * aShape.x * len;
    }
  } else {
    p = A + axis * aShape.x * len + (cos(aShape.y) * U + sin(aShape.y) * V * aShape.w) * aShape.z;
  }

  // leve respiração digital
  p += (vec3(sin(uTime * 1.3 + aInfo.y * 60.0), cos(uTime * 1.1 + aInfo.z * 50.0), sin(uTime * 0.9 + aInfo.y * 30.0))) * 0.0035;

  // montagem a partir da poeira
  float d0 = aInfo.y * 0.55;
  float e = smoothstep(d0, d0 + 0.45, uAssemble);
  vec3 dust = uCenter + (vec3(aInfo.y, aInfo.z, fract(aInfo.y * 7.13)) - 0.5) * vec3(7.0, 4.0, 5.0) + vec3(0.0, 1.0, 0.0);
  dust += vec3(sin(uTime * 0.2 + aInfo.z * 20.0), cos(uTime * 0.17 + aInfo.y * 20.0), 0.0) * 0.3;
  p = mix(dust, p, e);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float speed = clamp(length(uJ[ib] - uJL[ib]) * 5.0, 0.0, 1.0);
  vec3 cBody = vec3(0.56, 0.58, 0.62);
  vec3 cShirt = vec3(0.96, 0.94, 0.89);
  vec3 cGold = vec3(0.98, 0.8, 0.48);
  float a;
  if (kind < 0.5 || kind > 3.5) { vColor = cBody; a = 0.42; }
  else if (kind < 1.5) { vColor = mix(mix(cShirt, uSleeve, uRealShirt), cGold, speed * 0.35); a = mix(0.62, 0.95, uRealShirt) + speed * 0.3; }
  else if (kind < 2.5) { vColor = cGold; a = 0.95; }
  else { vColor = cGold * 0.85; a = (aShape.w > 0.5 ? 0.75 : 0.9) * (aShape.w > 1.5 ? 0.25 : 1.0) * uRacket; }
  a *= mix(0.3, 1.0, e);
  // com a camisa real: tronco e detalhes de partícula somem (a foto assume)
  a *= 1.0 - uRealShirt * aTorso;
  vAlpha = a;
  float sleeveBoost = (kind > 0.5 && kind < 1.5) ? 1.0 + 0.35 * uRealShirt : 1.0;
  gl_PointSize = aInfo.w * uPix * (1.0 + speed * 0.35) * sleeveBoost * (3.2 / -mv.z);
}`;

const FRAG = /* glsl */ `
uniform float uOpacity;
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor * a * vAlpha * uOpacity, 1.0);
}`;

function buildParticles(N) {
  // comprimentos a partir da pose de pé
  const rest = solve(POSES.stand);
  const jp = (i) => new THREE.Vector3(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]);
  const L = (a, b) => jp(a).distanceTo(jp(b));
  // [a, b, raioA, raioB, achatamento, tipo, fimDaManga]
  const bones = [
    [J.pelvis, J.chest, 0.155, 0.175, 0.62, SHIRT],
    [J.chest, J.neck, 0.18, 0.1, 0.62, SHIRT],
    [J.lSh, J.rSh, 0.072, 0.072, 1, SHIRT],
    [J.lHip, J.rHip, 0.115, 0.115, 0.78, BODY],
    [J.lSh, J.lEl, 0.064, 0.047, 1, SHIRT, 0.52],
    [J.rSh, J.rEl, 0.064, 0.047, 1, SHIRT, 0.52],
    [J.lEl, J.lWr, 0.043, 0.031, 1, BODY],
    [J.rEl, J.rWr, 0.043, 0.031, 1, BODY],
    [J.lHip, J.lKn, 0.088, 0.056, 1, BODY],
    [J.rHip, J.rKn, 0.088, 0.056, 1, BODY],
    [J.lKn, J.lAn, 0.054, 0.036, 1, BODY],
    [J.rKn, J.rAn, 0.054, 0.036, 1, BODY],
    [J.lAn, J.lToe, 0.036, 0.03, 1, BODY],
    [J.rAn, J.rToe, 0.036, 0.03, 1, BODY],
  ];
  const nAccent = Math.round(N * 0.06), nRacket = Math.round(N * 0.05), nHead = Math.round(N * 0.06);
  const nBody = N - nAccent - nRacket - nHead;
  const weights = bones.map(([a, b, ra, rb, f, , sleeve]) => L(a, b) * (ra + rb) * (1 + f) * (a === J.pelvis || a === J.chest ? 1.5 : sleeve ? 1.7 : 1));
  const wsum = weights.reduce((s, w) => s + w, 0);

  const bone = [], shape = [], info = [], torso = [];
  const isTorso = (a, b) => (a === J.pelvis && b === J.chest) || (a === J.chest && b === J.neck) || (a === J.lSh && b === J.rSh) || (a === J.lHip && b === J.rHip);
  const push = (a, b, t, ang, r, f, kind, size) => {
    bone.push(a, b); shape.push(t, ang, r, f); info.push(kind, Math.random(), Math.random(), size);
    // tronco + barra dourada das mangas (a camisa real já tem a manga)
    torso.push(isTorso(a, b) || (kind === ACCENT && t === 0.52) ? 1 : 0);
  };
  bones.forEach(([a, b, ra, rb, f, kind, sleeve], i) => {
    const n = Math.round((weights[i] / wsum) * nBody);
    const rings = Math.max(6, Math.round(L(a, b) / 0.022));
    for (let k = 0; k < n; k++) {
      let t = Math.random();
      if (Math.random() < 0.55) t = Math.round(t * rings) / rings; // anéis: aparência de malha
      const ang = Math.random() * Math.PI * 2;
      const r = (ra + (rb - ra) * t) * (0.93 + Math.random() * 0.1);
      let kk = kind;
      if (sleeve && t > sleeve) kk = BODY;
      push(a, b, t, ang, r, f, kk, 1.6 + Math.random() * 1.6);
    }
  });
  // cabeça
  for (let k = 0; k < nHead; k++) {
    const phi = Math.acos(1 - 2 * Math.random()) / Math.PI;
    push(J.neck, J.head, phi, Math.random() * Math.PI * 2, 0.108, 1, HEAD, 1.5 + Math.random() * 1.4);
  }
  // detalhes dourados: recorte em V, logo, gola, barra das mangas
  const nV = Math.round(nAccent * 0.46), nLogo = Math.round(nAccent * 0.12), nCol = Math.round(nAccent * 0.22);
  const nSlv = nAccent - nV - nLogo - nCol;
  for (let k = 0; k < nV; k++) {
    const s = Math.random() * 2 - 1;
    push(J.pelvis, J.chest, 0.8 + 0.2 * Math.abs(s), Math.PI / 2 - s * 1.25, 0.182, 0.62, ACCENT, 1.3 + Math.random());
  }
  for (let k = 0; k < nLogo; k++) {
    const g = Math.random() * Math.PI * 2, rr = Math.random() * 0.12;
    push(J.chest, J.neck, 0.2 + Math.sin(g) * rr * 0.5, Math.PI / 2 - 0.6 + Math.cos(g) * rr, 0.185, 0.66, ACCENT, 1.6 + Math.random());
  }
  for (let k = 0; k < nCol; k++) {
    if (k % 4 === 0) push(J.chest, J.neck, 0.55 + Math.random() * 0.35, Math.PI / 2, 0.118, 0.8, ACCENT, 1.2); // carcela
    else push(J.chest, J.neck, 0.9 + Math.random() * 0.05, Math.random() * Math.PI * 2, 0.108, 0.9, ACCENT, 1.2 + Math.random() * 0.8);
  }
  for (let k = 0; k < nSlv; k++) {
    const left = k % 2 === 0;
    push(left ? J.lSh : J.rSh, left ? J.lEl : J.rEl, 0.52, Math.random() * Math.PI * 2, 0.056, 1, ACCENT, 1.1 + Math.random() * 0.6);
  }
  // raquete
  for (let k = 0; k < nRacket; k++) {
    const q = Math.random();
    if (q < 0.18) push(J.rWr, J.racket, Math.random() * 0.46, 0, 0, 0, RACKET, 1.2);
    else if (q < 0.78) push(J.rWr, J.racket, 0, Math.random() * Math.PI * 2, 1, 1, RACKET, 1.3);
    else { const rr = Math.sqrt(Math.random()) * 0.92; push(J.rWr, J.racket, 0, Math.random() * Math.PI * 2, rr, 2, RACKET, 1); }
  }
  const g = new THREE.BufferGeometry();
  const count = bone.length / 2;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aBone', new THREE.Float32BufferAttribute(bone, 2));
  g.setAttribute('aShape', new THREE.Float32BufferAttribute(shape, 4));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4));
  g.setAttribute('aTorso', new THREE.Float32BufferAttribute(torso, 1));
  return g;
}

export class Athlete {
  constructor({ quality }) {
    const N = quality === 'high' ? 17000 : quality === 'mid' ? 11000 : 6500;
    this.uJ = Array.from({ length: JOINT_COUNT }, () => new THREE.Vector3());
    this.uJL = Array.from({ length: JOINT_COUNT }, () => new THREE.Vector3());
    this.uniforms = {
      uJ: { value: this.uJ }, uJL: { value: this.uJL },
      uFwd: { value: new THREE.Vector3(0, 0, 1) }, uCenter: { value: new THREE.Vector3(0, 0, 0) },
      uAssemble: { value: 0 }, uTime: { value: 0 }, uPix: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uRacket: { value: 1 }, uOpacity: { value: 1 },
      uRealShirt: { value: 0 }, uSleeve: { value: new THREE.Color(0.96, 0.94, 0.89) },
    };
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(buildParticles(N), m);
    this.points.frustumCulled = false;
    this.joints = new Float32Array(JOINT_COUNT * 3);
    this.first = true;
  }

  setJoints(arr, dt) {
    this.joints.set(arr);
    const k = 1 - Math.exp(-9 * dt);
    for (let i = 0; i < JOINT_COUNT; i++) {
      this.uJ[i].set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
      if (this.first) this.uJL[i].copy(this.uJ[i]);
      else this.uJL[i].lerp(this.uJ[i], k);
    }
    this.first = false;
    const lSh = this.uJ[J.lSh], rSh = this.uJ[J.rSh];
    const side = new THREE.Vector3().subVectors(lSh, rSh);
    side.y = 0;
    this.uniforms.uFwd.value.crossVectors(side.normalize(), new THREE.Vector3(0, 1, 0)).normalize();
    this.uniforms.uCenter.value.copy(this.uJ[J.pelvis]);
  }

  joint(i, out) { return out.set(this.joints[i * 3], this.joints[i * 3 + 1], this.joints[i * 3 + 2]); }
}

// ------------------------------------------------------------
// Camisa real no tronco: fotos do giro 360° escolhidas pelo ângulo do tronco
// em relação à câmera, alinhadas ao eixo pescoço→quadril. As mangas da foto
// são recortadas (as de partícula acompanham os braços). Um passe só de
// profundidade faz o tronco esconder o braço que passa por trás.
// ------------------------------------------------------------
const CARD_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CARD_FRAG = /* glsl */ `
uniform sampler2D mapA, mapB;
uniform float uMix, uOpacity, uKeep, uAxis, uDepthPass;
varying vec2 vUv;
void main() {
  vec4 t = mix(texture2D(mapA, vUv), texture2D(mapB, vUv), uMix);
  float dx = abs(vUv.x - uAxis);
  // perto da gola a largura é menor; no corpo, corta o que passa dos ombros
  float keep = 1.0 - smoothstep(uKeep - 0.045, uKeep + 0.015, dx);
  float a = t.a * keep * uOpacity;
  if (uDepthPass > 0.5) { if (a < 0.6) discard; gl_FragColor = vec4(0.0); return; }
  // leve realce para a peça escura não sumir no fundo preto
  vec3 col = t.rgb * 1.12 + vec3(0.012);
  gl_FragColor = vec4(col, a);
}`;

export class ShirtCard {
  constructor(spin) {
    this.spin = spin || {};
    this.color = 'preta';
    this.group = new THREE.Group();
    this.tex = [new THREE.Texture(), new THREE.Texture()];
    for (const t of this.tex) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    const uniforms = {
      mapA: { value: this.tex[0] }, mapB: { value: this.tex[1] }, uMix: { value: 0 },
      uOpacity: { value: 0 }, uKeep: { value: 0.3 }, uAxis: { value: 0.5 }, uDepthPass: { value: 0 },
    };
    const geo = new THREE.PlaneGeometry(1, 1);
    this.colorMat = new THREE.ShaderMaterial({ vertexShader: CARD_VERT, fragmentShader: CARD_FRAG, uniforms, transparent: true, depthWrite: false });
    this.depthMat = new THREE.ShaderMaterial({
      vertexShader: CARD_VERT, fragmentShader: CARD_FRAG,
      uniforms: { ...uniforms, uDepthPass: { value: 1 } }, colorWrite: false, depthWrite: true,
    });
    this.depthMesh = new THREE.Mesh(geo, this.depthMat);
    this.colorMesh = new THREE.Mesh(geo, this.colorMat);
    this.depthMesh.renderOrder = -2;
    this.colorMesh.renderOrder = -1;
    for (const m of [this.depthMesh, this.colorMesh]) { m.matrixAutoUpdate = false; m.frustumCulled = false; }
    this.group.add(this.depthMesh, this.colorMesh);
    this._v = { up: new THREE.Vector3(), c: new THREE.Vector3(), r: new THREE.Vector3(), n: new THREE.Vector3(), p: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() };
    this.m = new THREE.Matrix4();
  }

  get available() { return !!this.spin[this.color]; }

  // joints: Float32Array das juntas; fwd: frente do tronco; camPos: posição da câmera
  update(joints, fwd, camPos, opacity) {
    const s = this.spin[this.color];
    const vis = !!s && opacity > 0.003;
    this.group.visible = vis;
    if (!vis) return;
    const v = this._v;
    const P = (i, out) => out.set(joints[i * 3], joints[i * 3 + 1], joints[i * 3 + 2]);
    const pel = P(J.pelvis, v.a), neck = P(J.neck, v.b);
    v.up.subVectors(neck, pel).normalize();
    const top = neck.clone().addScaledVector(v.up, 0.05);
    const hem = pel.clone().addScaledVector(v.up, -0.13);
    const L = top.distanceTo(hem);
    const H = L * (s.height / (s.height - 16));
    const W = H * (s.width / s.height);
    const center = v.p.addVectors(top, hem).multiplyScalar(0.5);

    // ângulo do tronco visto da câmera (mesma convenção do giro)
    v.c.subVectors(camPos, center); v.c.y = 0; v.c.normalize();
    const viewRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), v.c);
    const f = fwd;
    let theta = Math.atan2(f.dot(viewRight), f.dot(v.c)) * (180 / Math.PI);
    theta = ((theta % 360) + 360) % 360;

    // cartão virado para a câmera, girando em torno do eixo do tronco
    const toCam = new THREE.Vector3().subVectors(camPos, center).normalize();
    v.r.crossVectors(v.up, toCam).normalize();
    v.n.crossVectors(v.r, v.up).normalize();
    // desloca para o eixo (centro da gola) cair sobre o eixo do tronco
    center.addScaledVector(v.r, (0.5 - s.axisX) * W);
    this.m.makeBasis(v.r.clone().multiplyScalar(W), v.up.clone().multiplyScalar(H), v.n).setPosition(center);
    this.depthMesh.matrix.copy(this.m);
    this.colorMesh.matrix.copy(this.m);

    // quadro do giro (troca curta entre vizinhos)
    const N = s.frames.length;
    const pos = (theta / 360) * N;
    let i0 = Math.floor(pos) % N, i1 = (i0 + 1) % N;
    let mix = THREE.MathUtils.smoothstep(pos - Math.floor(pos), 0.42, 0.58);
    if (!s.frames[i0] || !s.frames[i1]) { i0 = i1 = s.frames.findIndex(Boolean); mix = 0; }
    if (i0 < 0) { this.group.visible = false; return; }
    const want = [s.frames[i0], s.frames[i1]];
    let [ta, tb] = this.tex;
    if (tb.image === want[0] || ta.image === want[1]) [ta, tb] = [tb, ta];
    if (ta.image !== want[0]) { ta.image = want[0]; ta.needsUpdate = true; }
    if (tb.image !== want[1]) { tb.image = want[1]; tb.needsUpdate = true; }
    // largura mantida: de frente/costas o corpo ocupa menos da foto (mangas para fora)
    const side = Math.abs(Math.sin((theta * Math.PI) / 180));
    for (const u of [this.colorMat.uniforms, this.depthMat.uniforms]) {
      u.mapA.value = ta; u.mapB.value = tb; u.uMix.value = mix;
      u.uOpacity.value = opacity;
      u.uAxis.value = s.axisX;
      u.uKeep.value = 0.31 + 0.08 * side;
    }
  }
}
