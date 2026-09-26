import * as THREE from 'three';
import { J, JOINT_COUNT, POSES, solve } from '../pose.js';

// Tipos de partícula
const BODY = 0, SHIRT = 1, ACCENT = 2, RACKET = 3, HEAD = 4;

const VERT = /* glsl */ `
uniform vec3 uJ[${JOINT_COUNT}];
uniform vec3 uJL[${JOINT_COUNT}];
uniform vec3 uFwd;
uniform vec3 uCenter;
uniform float uAssemble, uTime, uPix, uRacket;
attribute vec2 aBone;
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
  else if (kind < 1.5) { vColor = mix(cShirt, cGold, speed * 0.35); a = 0.62 + speed * 0.3; }
  else if (kind < 2.5) { vColor = cGold; a = 0.95; }
  else { vColor = cGold * 0.85; a = (aShape.w > 0.5 ? 0.75 : 0.9) * (aShape.w > 1.5 ? 0.25 : 1.0) * uRacket; }
  a *= mix(0.3, 1.0, e);
  vAlpha = a;
  gl_PointSize = aInfo.w * uPix * (1.0 + speed * 0.35) * (3.2 / -mv.z);
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
  const weights = bones.map(([a, b, ra, rb, f]) => L(a, b) * (ra + rb) * (1 + f) * (a === J.pelvis || a === J.chest ? 1.5 : 1));
  const wsum = weights.reduce((s, w) => s + w, 0);

  const bone = [], shape = [], info = [];
  const push = (a, b, t, ang, r, f, kind, size) => {
    bone.push(a, b); shape.push(t, ang, r, f); info.push(kind, Math.random(), Math.random(), size);
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
