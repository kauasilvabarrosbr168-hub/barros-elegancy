// O "homem BARROS" em 3D: esqueleto do X Bot (Mixamo), polo 3D presa aos ossos,
// corpo em partículas e animações. Dados gerados por scripts/prepare-character.mjs.
import * as THREE from 'three';
import { J } from '../pose.js';

const TYPES = { Float32Array, Uint8Array, Uint16Array, Uint32Array, Int16Array };
const D = Math.PI / 180;

export async function loadCharacterData(base = '/models/barros-man') {
  const [meta, buf] = await Promise.all([
    fetch(`${base}.json`).then((r) => { if (!r.ok) throw new Error('sem personagem'); return r.json(); }),
    fetch(`${base}.bin`).then((r) => { if (!r.ok) throw new Error('sem personagem'); return r.arrayBuffer(); }),
  ]);
  return { meta, arr: (d) => new TYPES[d.type](buf, d.offset, d.length) };
}

// ------------------------------------------------------------
// Material da polo: tecido (sheen) + detalhes desenhados na pose de repouso
// ------------------------------------------------------------
const SHIRT_COLORS = {
  preta: { body: 0x131315, collar: 0x131315, sheen: 0x5a5a5e, white: 0 },
  branca: { body: 0xefede7, collar: 0xc9a468, sheen: 0xffffff, white: 1 },
};

function makeShirtMaterial(ref, logoTex) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.8, metalness: 0,
    sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color(0x5a5a5e),
    side: THREE.DoubleSide,
  });
  const u = {
    uLogo: { value: logoTex },
    uBody: { value: new THREE.Color(0x131315) },
    uCollar: { value: new THREE.Color(0x131315) },
    uWhite: { value: 0 },
    uReveal: { value: 1 },
    uGold: { value: new THREE.Color(0xe0bd7c) },
    uNeckY: { value: ref.neckY }, uNeckZ: { value: ref.neckZ },
    uHemB: { value: ref.hemBottom }, uShoulderX: { value: ref.shoulderX },
    uVApex: { value: 122.5 }, uVSlope: { value: 0.5 },
    uPlkBottom: { value: ref.neckY - 18.5 },
    uLogo1: { value: new THREE.Vector3(9.2, 132.5, 6.2) },
    uLogo2: { value: new THREE.Vector3(0, 139.5, 5.6) },
    uTag: { value: new THREE.Vector2(11.5, ref.hemBottom + 3.2) },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = 'attribute float aPart;\nvarying vec3 vRest;\nvarying float vPart;\n' +
      s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRest = position; vPart = aPart;');
    s.fragmentShader = `
uniform sampler2D uLogo;
uniform vec3 uBody, uCollar, uGold, uLogo1, uLogo2;
uniform vec2 uTag;
uniform float uWhite, uReveal, uNeckY, uNeckZ, uHemB, uShoulderX, uVApex, uVSlope, uPlkBottom;
varying vec3 vRest;
varying float vPart;
float inRect(vec2 q) { return step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0); }
` + s.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  float revealY = mix(uHemB - 1.5, uNeckY + 9.0, uReveal);
  if (vRest.y > revealY) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 R = vRest;
  float isBody = 1.0 - step(0.5, vPart);
  vec3 col = mix(uBody, uCollar, 1.0 - isBody);
  float front = smoothstep(uNeckZ - 1.0, uNeckZ + 5.0, R.z);
  float back = 1.0 - smoothstep(uNeckZ - 6.0, uNeckZ - 1.0, R.z);
  float torso = 1.0 - smoothstep(uShoulderX - 1.0, uShoulderX + 3.0, abs(R.x));
  // recorte em V (costura + painel de cima em outro tom)
  float dS = R.y - (uVApex + uVSlope * abs(R.x));
  float onV = front * torso * isBody;
  float seam = (1.0 - smoothstep(0.05, 0.22, abs(dS))) * onV;
  float stitch = (1.0 - smoothstep(0.02, 0.08, abs(dS - 0.5))) * onV;
  col *= 1.0 + mix(0.07, -0.02, uWhite) * step(0.0, dS) * onV;
  col = mix(col, col * mix(0.42, 0.8, uWhite), seam);
  col = mix(col, col * mix(1.7, 0.9, uWhite), stitch * 0.55);
  // carcela e botões
  float plk = step(uPlkBottom, R.y) * front * isBody;
  float plkLine = max((1.0 - smoothstep(0.04, 0.14, abs(abs(R.x) - 1.6))) * plk,
                      (1.0 - smoothstep(0.04, 0.14, abs(R.y - uPlkBottom))) * step(abs(R.x), 1.6) * front * isBody);
  col = mix(col, col * mix(0.45, 0.8, uWhite), plkLine);
  float btn = max(1.0 - smoothstep(0.3, 0.45, length(vec2(R.x, R.y - (uPlkBottom + 8.0)))),
                  1.0 - smoothstep(0.3, 0.45, length(vec2(R.x, R.y - (uPlkBottom + 3.8)))));
  col = mix(col, mix(vec3(0.004), vec3(0.72, 0.7, 0.66), uWhite), btn * front * isBody);
  // logo no peito (lado esquerdo de quem veste = +x)
  vec2 lu = vec2((R.x - uLogo1.x) / uLogo1.z + 0.5, (R.y - uLogo1.y) / (uLogo1.z * 0.915) + 0.5);
  vec4 L = texture2D(uLogo, clamp(lu, 0.0, 1.0));
  col = mix(col, L.rgb, L.a * inRect(lu) * front * isBody);
  // logo nas costas, logo abaixo da gola
  vec2 bu = vec2(-R.x / uLogo2.z + 0.5, (R.y - uLogo2.y) / (uLogo2.z * 0.915) + 0.5);
  vec4 B = texture2D(uLogo, clamp(bu, 0.0, 1.0));
  col = mix(col, B.rgb, B.a * inRect(bu) * back * isBody);
  // etiqueta preta com o B dourado na barra
  vec2 tu = vec2((R.x - uTag.x) / 2.2 + 0.5, (R.y - uTag.y) / 2.8 + 0.5);
  float inT = inRect(tu) * front * isBody;
  col = mix(col, vec3(0.012), inT);
  vec4 T = texture2D(uLogo, clamp((tu - 0.5) * vec2(1.45, 1.2) + 0.5, 0.0, 1.0));
  col = mix(col, T.rgb, T.a * inT);
  diffuseColor.rgb = col;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  // linha dourada que "costura" a peça enquanto ela aparece
  float edge = (1.0 - smoothstep(0.0, 1.6, revealY - vRest.y)) * (1.0 - step(0.999, uReveal));
  totalEmissiveRadiance += uGold * edge * 2.5;`);
  };
  m.userData.u = u;
  return m;
}

// ------------------------------------------------------------
// Partículas: pontos da pele, deformados pelo esqueleto na CPU
// ------------------------------------------------------------
const P_VERT = /* glsl */ `
attribute vec4 aInfo; // tipo, rnd, rnd2, tamanho
attribute vec3 aDust;
uniform float uAssemble, uTime, uPix;
uniform vec3 uCenter;
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d0 = aInfo.y * 0.55;
  float e = smoothstep(d0, d0 + 0.45, uAssemble);
  vec3 p = mix(uCenter + aDust + vec3(sin(uTime * 0.2 + aInfo.z * 20.0), cos(uTime * 0.17 + aInfo.y * 20.0), 0.0) * 0.3, position, e);
  p += vec3(sin(uTime * 1.3 + aInfo.y * 60.0), cos(uTime * 1.1 + aInfo.z * 50.0), sin(uTime * 0.9 + aInfo.y * 30.0)) * 0.0025;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  bool ring = aInfo.x > 0.5;
  vColor = ring ? vec3(0.86, 0.7, 0.44) : vec3(0.6, 0.62, 0.67);
  vAlpha = (ring ? 0.8 : 0.5) * mix(0.3, 1.0, e);
  gl_PointSize = aInfo.w * uPix * (3.2 / -mv.z);
}`;
const P_FRAG = /* glsl */ `
uniform float uOpacity;
varying float vAlpha;
varying vec3 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vColor * a * vAlpha * uOpacity, 1.0);
}`;

// ------------------------------------------------------------
// Raquete 3D (em cm, filha do osso da mão direita)
// ------------------------------------------------------------
function makeRacket() {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.32, metalness: 0.55, transparent: true });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a468, roughness: 0.35, metalness: 0.85, transparent: true });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.35, 20, 12), frame);
  grip.position.y = 2;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 1.2, 12), gold);
  cap.position.y = -8.4;
  const throatL = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 17, 8), frame);
  const throatR = throatL.clone();
  throatL.position.set(-3.4, 19.5, 0); throatL.rotation.z = 0.36;
  throatR.position.set(3.4, 19.5, 0); throatR.rotation.z = -0.36;
  const head = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 8, 64), frame);
  head.scale.set(12.6, 16.5, 12.6);
  head.position.y = 43;
  const accent = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 6, 64, Math.PI * 0.5), gold);
  accent.scale.copy(head.scale).multiplyScalar(1.004);
  accent.position.copy(head.position);
  accent.rotation.z = Math.PI * 0.25;
  // cordas
  const pts = [];
  for (let k = -11; k <= 11; k += 1.6) { const h = 16.5 * Math.sqrt(Math.max(0, 1 - (k / 12.6) ** 2)); pts.push(k, 43 - h, 0, k, 43 + h, 0); }
  for (let k = -15.5; k <= 15.5; k += 1.6) { const w = 12.6 * Math.sqrt(Math.max(0, 1 - (k / 16.5) ** 2)); pts.push(-w, 43 + k, 0, w, 43 + k, 0); }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const strings = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xd9d4c8, transparent: true, opacity: 0.35 }));
  g.add(grip, cap, throatL, throatR, head, accent, strings);
  g.userData.mats = [frame, gold, strings.material];
  g.userData.headLocal = new THREE.Vector3(0, 43, 0);
  return g;
}

// ------------------------------------------------------------
// Personagem
// ------------------------------------------------------------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const I = new THREE.Quaternion();

// junta do meu esqueleto -> osso do X Bot (para rótulos, câmera etc.)
const JOINT_BONE = {
  [J.pelvis]: 'Hips', [J.chest]: 'Spine2', [J.neck]: 'Neck', [J.head]: 'HeadTop_End',
  [J.lSh]: 'LeftArm', [J.lEl]: 'LeftForeArm', [J.lWr]: 'LeftHand',
  [J.rSh]: 'RightArm', [J.rEl]: 'RightForeArm', [J.rWr]: 'RightHand',
  [J.lHip]: 'LeftUpLeg', [J.lKn]: 'LeftLeg', [J.lAn]: 'LeftFoot',
  [J.rHip]: 'RightUpLeg', [J.rKn]: 'RightLeg', [J.rAn]: 'RightFoot',
  [J.lToe]: 'LeftToeBase', [J.rToe]: 'RightToeBase',
};
// ossos guiados por direção: [osso, filho, junta início, junta fim]
const DIR_BONES = [
  ['LeftArm', 'LeftForeArm', J.lSh, J.lEl], ['LeftForeArm', 'LeftHand', J.lEl, J.lWr],
  ['RightArm', 'RightForeArm', J.rSh, J.rEl], ['RightForeArm', 'RightHand', J.rEl, J.rWr],
  ['LeftUpLeg', 'LeftLeg', J.lHip, J.lKn], ['LeftLeg', 'LeftFoot', J.lKn, J.lAn], ['LeftFoot', 'LeftToeBase', J.lAn, J.lToe],
  ['RightUpLeg', 'RightLeg', J.rHip, J.rKn], ['RightLeg', 'RightFoot', J.rKn, J.rAn], ['RightFoot', 'RightToeBase', J.rAn, J.rToe],
];

export class Character {
  constructor(data, { quality, logoTex }) {
    const { meta, arr } = data;
    this.meta = meta;
    this.root = new THREE.Group();
    this.root.scale.setScalar(0.01); // cm -> m
    const nb = meta.bones.length;
    this.nb = nb;
    this.bones = meta.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; o.position.fromArray(b.p); o.quaternion.fromArray(b.q); return o; });
    meta.bones.forEach((b, i) => (b.parent >= 0 ? this.bones[b.parent] : this.root).add(this.bones[i]));
    this.parent = meta.bones.map((b) => b.parent);
    this.id = Object.fromEntries(meta.bones.map((b, i) => [b.name, i]));
    this.restQ = meta.bones.map((b) => new THREE.Quaternion().fromArray(b.q));
    this.restP = meta.bones.map((b) => new THREE.Vector3().fromArray(b.p));
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(this.bones);
    this.restWQ = this.bones.map((b) => b.getWorldQuaternion(new THREE.Quaternion()));
    this.restWP = this.bones.map((b) => b.getWorldPosition(new THREE.Vector3())); // m

    // polo (tecido + gola) e corpo só para profundidade
    const skinned = (d, mat, part) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr(d.position), 3));
      g.setAttribute('skinIndex', new THREE.BufferAttribute(arr(d.skinIndex), 4));
      g.setAttribute('skinWeight', new THREE.BufferAttribute(arr(d.skinWeight), 4, true));
      if (part) g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(arr(d.part)), 1));
      g.setIndex(new THREE.BufferAttribute(arr(d.index), 1));
      if (part) g.computeVertexNormals();
      const mesh = new THREE.SkinnedMesh(g, mat);
      mesh.frustumCulled = false;
      this.root.add(mesh);
      mesh.bind(this.skeleton);
      return mesh;
    };
    this.shirtMat = makeShirtMaterial(meta.shirt.ref, logoTex);
    this.shirt = skinned(meta.shirt, this.shirtMat, true);
    this.body = skinned(meta.body, new THREE.MeshBasicMaterial({ colorWrite: false }), false);
    this.body.renderOrder = -2;
    this.shirt.renderOrder = -1;

    // partículas
    const pm = meta.particles;
    const total = pm.kind.length;
    const N = quality === 'high' ? total : quality === 'mid' ? Math.round(total * 0.62) : Math.round(total * 0.38);
    this.pN = N;
    this.pBind = arr(pm.position);
    this.pSI = arr(pm.skinIndex);
    this.pSW = arr(pm.skinWeight);
    const kind = arr(pm.kind);
    const pos = new Float32Array(N * 3), info = new Float32Array(N * 4), dust = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      info.set([kind[i], Math.random(), Math.random(), kind[i] ? 1.5 + Math.random() : 1.7 + Math.random() * 1.5], i * 4);
      dust.set([(Math.random() - 0.5) * 7, (Math.random() - 0.3) * 4, (Math.random() - 0.5) * 5], i * 3);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
    pg.setAttribute('aDust', new THREE.BufferAttribute(dust, 3));
    this.pUniforms = {
      uAssemble: { value: 0 }, uTime: { value: 0 }, uPix: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uCenter: { value: new THREE.Vector3() }, uOpacity: { value: 1 },
    };
    this.points = new THREE.Points(pg, new THREE.ShaderMaterial({
      vertexShader: P_VERT, fragmentShader: P_FRAG, uniforms: this.pUniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 1;

    // raquete na mão direita: cabo atravessando a palma, cabeça para o lado do polegar
    this.racket = makeRacket();
    const hand = this.bones[this.id.RightHand];
    hand.add(this.racket);
    const f = this.restP[this.id.RightHandMiddle1].clone().normalize();
    const th = this.restP[this.id.RightHandThumb1].clone();
    const t = th.clone().addScaledVector(f, -th.dot(f)).normalize();
    const palm = new THREE.Vector3().crossVectors(t, f).normalize();
    const shaft = t.clone().multiplyScalar(Math.cos(28 * D)).addScaledVector(f, Math.sin(28 * D)).normalize();
    const side = new THREE.Vector3().crossVectors(shaft, palm).normalize();
    this.racket.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, shaft, palm));
    this.racket.position.copy(f.clone().multiplyScalar(7.5)).addScaledVector(palm, -1.8).addScaledVector(shaft, -2);
    this.racketOpacity = 1;

    // animações
    this.clips = new Map(meta.clips.map((c) => [c.name, { ...c, q: arr(c.quats), h: arr(c.hips) }]));
    this.group = new THREE.Group();
    this.group.add(this.root, this.points);
  }

  // ---------- poses ----------
  newPose() { return { q: new Float32Array(this.nb * 4), h: new THREE.Vector3(), x: 0, z: 0, yaw: 0 }; }

  sampleClip(name, time, out, { loop = true } = {}) {
    const c = this.clips.get(name);
    const nb = this.nb, n = c.frames;
    let f = time * c.fps;
    if (loop) { const span = n - 1; f = ((f % span) + span) % span; } else f = Math.min(n - 1.0001, Math.max(0, f));
    const f0 = Math.floor(f), a = f - f0, f1 = Math.min(n - 1, f0 + 1);
    const S = 1 / 32767;
    for (let b = 0; b < nb; b++) {
      const o0 = (f0 * nb + b) * 4, o1 = (f1 * nb + b) * 4;
      _q.set(c.q[o0] * S, c.q[o0 + 1] * S, c.q[o0 + 2] * S, c.q[o0 + 3] * S);
      _q2.set(c.q[o1] * S, c.q[o1 + 1] * S, c.q[o1 + 2] * S, c.q[o1 + 3] * S);
      _q.slerp(_q2, a).normalize();
      out.q[b * 4] = _q.x; out.q[b * 4 + 1] = _q.y; out.q[b * 4 + 2] = _q.z; out.q[b * 4 + 3] = _q.w;
    }
    out.h.set(
      c.h[f0 * 3] + (c.h[f1 * 3] - c.h[f0 * 3]) * a,
      c.h[f0 * 3 + 1] + (c.h[f1 * 3 + 1] - c.h[f0 * 3 + 1]) * a,
      c.h[f0 * 3 + 2] + (c.h[f1 * 3 + 2] - c.h[f0 * 3 + 2]) * a,
    );
    return out;
  }

  // Converte uma pose do meu esqueleto (juntas em metros) para os ossos do X Bot.
  retarget(j, pose, out) {
    const yaw = (pose.yaw + pose.pelvisYaw) * D;
    const px = j[0], pz = j[2];
    out.x = px; out.z = pz; out.yaw = yaw;
    const c = Math.cos(-yaw), s = Math.sin(-yaw);
    const L = (i, v) => { const x = j[i * 3] - px, z = j[i * 3 + 2] - pz; return v.set(x * c + z * s, j[i * 3 + 1], -x * s + z * c); };
    const qY = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    const qX = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
    const qZ = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
    const Rt = qY(pose.twist * D).multiply(qX(pose.lean * D)).multiply(qZ(-pose.bend * D));
    const Rhl = qY(pose.headYaw * D).multiply(qX(pose.headPitch * D));
    const id = this.id, nb = this.nb;
    const wq = this._wq || (this._wq = Array.from({ length: nb }, () => new THREE.Quaternion()));
    const local = this._lq || (this._lq = Array.from({ length: nb }, () => new THREE.Quaternion()));
    const frameOf = {
      [id.Hips]: I, [id.Spine]: I.clone().slerp(Rt, 0.35), [id.Spine1]: I.clone().slerp(Rt, 0.7), [id.Spine2]: Rt,
      [id.Neck]: Rt.clone().multiply(I.clone().slerp(Rhl, 0.4)), [id.Head]: Rt.clone().multiply(Rhl),
      [id.LeftShoulder]: Rt, [id.RightShoulder]: Rt,
    };
    const dirOf = this._dirOf || (this._dirOf = Object.fromEntries(DIR_BONES.map(([b, ch, a, e]) => [id[b], { child: id[ch], a, e }])));
    const A = new THREE.Vector3(), B = new THREE.Vector3(), dCur = new THREE.Vector3();
    for (let i = 0; i < nb; i++) {
      const p = this.parent[i];
      const pw = p >= 0 ? wq[p] : I;
      if (frameOf[i]) {
        wq[i].copy(frameOf[i]).multiply(this.restWQ[i]);
      } else if (dirOf[i]) {
        const d = dirOf[i];
        _q.copy(pw).multiply(this.restQ[i]); // orientação atual com o osso em repouso
        dCur.copy(this.restP[d.child]).normalize().applyQuaternion(_q);
        L(d.e, B).sub(L(d.a, A)).normalize();
        _q2.setFromUnitVectors(dCur, B);
        wq[i].copy(_q2).multiply(_q);
      } else {
        wq[i].copy(pw).multiply(this.restQ[i]);
      }
      local[i].copy(pw).invert().multiply(wq[i]);
      out.q[i * 4] = local[i].x; out.q[i * 4 + 1] = local[i].y; out.q[i * 4 + 2] = local[i].z; out.q[i * 4 + 3] = local[i].w;
    }
    // altura do quadril: pés no chão (+ salto)
    const wp = this._wp || (this._wp = Array.from({ length: nb }, () => new THREE.Vector3()));
    const hipsY = this.restWP[id.Hips].y;
    for (let i = 0; i < nb; i++) {
      const p = this.parent[i];
      if (p < 0) { wp[i].set(0, hipsY, 0); continue; }
      wp[i].copy(this.restP[i]).multiplyScalar(0.01).applyQuaternion(wq[p]).add(wp[p]);
    }
    const ground = Math.min(
      wp[id.LeftFoot].y - this.restWP[id.LeftFoot].y, wp[id.RightFoot].y - this.restWP[id.RightFoot].y,
      wp[id.LeftToeBase].y - this.restWP[id.LeftToeBase].y, wp[id.RightToeBase].y - this.restWP[id.RightToeBase].y,
    );
    out.h.set(0, (hipsY - ground + (pose.lift || 0)) * 100, this.restP[id.Hips].z);
    return out;
  }

  static blend(a, b, w, out) {
    for (let i = 0; i < a.q.length; i += 4) {
      _q.set(a.q[i], a.q[i + 1], a.q[i + 2], a.q[i + 3]);
      _q2.set(b.q[i], b.q[i + 1], b.q[i + 2], b.q[i + 3]);
      _q.slerp(_q2, w);
      out.q[i] = _q.x; out.q[i + 1] = _q.y; out.q[i + 2] = _q.z; out.q[i + 3] = _q.w;
    }
    out.h.copy(a.h).lerp(b.h, w);
    out.x = a.x + (b.x - a.x) * w;
    out.z = a.z + (b.z - a.z) * w;
    let dy = b.yaw - a.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    out.yaw = a.yaw + dy * w;
    return out;
  }

  apply(pose) {
    for (let i = 0; i < this.nb; i++) this.bones[i].quaternion.fromArray(pose.q, i * 4);
    this.bones[this.id.Hips].position.copy(pose.h);
    this.root.position.set(pose.x, 0, pose.z);
    this.root.rotation.set(0, pose.yaw, 0);
    this.root.updateMatrixWorld(true);
    this.skeleton.update();
    this.skinParticles();
  }

  skinParticles() {
    const M = this.skeleton.boneMatrices, N = this.pN;
    const pos = this.points.geometry.attributes.position.array;
    const bp = this.pBind, si = this.pSI, sw = this.pSW;
    for (let i = 0; i < N; i++) {
      const x = bp[i * 3] * 0.01, y = bp[i * 3 + 1] * 0.01, z = bp[i * 3 + 2] * 0.01;
      let ox = 0, oy = 0, oz = 0;
      for (let c = 0; c < 4; c++) {
        const w = sw[i * 4 + c];
        if (!w) continue;
        const k = si[i * 4 + c] * 16, f = w / 255;
        ox += f * (M[k] * x + M[k + 4] * y + M[k + 8] * z + M[k + 12]);
        oy += f * (M[k + 1] * x + M[k + 5] * y + M[k + 9] * z + M[k + 13]);
        oz += f * (M[k + 2] * x + M[k + 6] * y + M[k + 10] * z + M[k + 14]);
      }
      pos[i * 3] = ox; pos[i * 3 + 1] = oy; pos[i * 3 + 2] = oz;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }

  // ---------- aparência ----------
  setColor(id) {
    const c = SHIRT_COLORS[id] || SHIRT_COLORS.preta;
    const u = this.shirtMat.userData.u;
    u.uBody.value.set(c.body); u.uCollar.value.set(c.collar); u.uWhite.value = c.white;
    this.shirtMat.sheenColor.set(c.sheen);
    this.shirtMat.roughness = c.white ? 0.86 : 0.78;
  }

  setReveal(v) { this.shirtMat.userData.u.uReveal.value = v; this.shirt.visible = v > 0.001; }

  setRacket(v) {
    this.racketOpacity = v;
    this.racket.visible = v > 0.01;
    const [frame, gold, strings] = this.racket.userData.mats;
    frame.opacity = v; gold.opacity = v; strings.opacity = 0.35 * v;
  }

  jointWorld(jointEnum, out) {
    const name = JOINT_BONE[jointEnum] || 'Hips';
    return this.bones[this.id[name]].getWorldPosition(out);
  }

  racketHead(out) { return this.racket.localToWorld(out.copy(this.racket.userData.headLocal)); }
}
