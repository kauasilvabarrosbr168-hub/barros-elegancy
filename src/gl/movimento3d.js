// Capítulo "Movimento" com o personagem 3D: animações do Mixamo + tênis
// procedural (saque e forehand), polo 3D presa aos ossos, cenário em linhas.
import * as THREE from 'three';
import { Character } from './character.js';
import { makeWorld, makeBall } from './world.js';
import { J, makeKeys, sampleKeys, solve } from '../pose.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const map01 = (v, a, b) => clamp01((v - a) / (b - a));
const smooth = (v) => v * v * (3 - 2 * v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const isNarrow = () => window.innerWidth <= 860;
const D = Math.PI / 180;

const SERVE = makeKeys([['ready', 1], ['toss', 1.1], ['trophy', 1], ['contact', 0.7], ['follow', 1]]);
const FORE = makeKeys([['runC', 0.6], ['backswing', 1], ['forehand', 0.6], ['finish', 1.1], ['turn', 1]]);

// Linha do tempo: clip (Mixamo, trecho `span` em s) ou keys (poses próprias).
// root: [x, z, yaw°] — um ponto (parado) ou dois (desloca ao longo do trecho).
const TL = [
  { id: 'ready', clip: 'Ready Idle', dur: 1.3, span: [0, 2.5], root: [[0, 0, 0]] },
  { id: 'serve', keys: SERVE, dur: 3.8 },
  { id: 'ready2', clip: 'Ready Idle', dur: 0.6, span: [0.6, 1.8], root: [[0, 0.6, 0]] },
  { id: 'run', clip: 'Left Strafe', dur: 2.1, span: [0, 1.6], root: [[0.15, 0.6, 0], [1.95, 0.6, 0]] },
  { id: 'forehand', keys: FORE, dur: 3.3 },
  { id: 'recover', clip: 'Ready Idle', dur: 0.9, span: [0.4, 1.8], root: [[1.6, 0.5, 40]] },
  { id: 'stretch', clip: 'Arm Stretching', dur: 5.4, span: [0.3, 7.6], root: [[1.0, 0.8, 10]] },
  { id: 'walk', clip: 'Walking', dur: 1.9, span: [0, 1.34], root: [[0.8, 0.8, -18], [0.3, 2.3, -18]] },
  { id: 'stand', clip: 'Standing Idle', dur: 0.7, span: [0, 1.87], root: [[0.3, 2.3, -24]] },
  { id: 'drink', clip: 'Drinking', dur: 1.6, span: [1.0, 6.5], root: [[0.3, 2.3, -24]] },
  { id: 'talk', clip: 'Talking', dur: 1.6, span: [0, 5.9], root: [[0.3, 2.3, 14]] },
  { id: 'shake', clip: 'Shaking Hands 1', dur: 1.2, span: [0.2, 4.2], root: [[0.3, 2.3, 0]] },
];
let acc = 0;
for (const s of TL) { s.start = acc; acc += s.dur; }
const TOTAL = acc;
const SEG = Object.fromEntries(TL.map((s) => [s.id, s]));
const at = (id, frac = 0) => (SEG[id].start + SEG[id].dur * frac) / TOTAL;
const sub = (id, keys, name) => {
  const i = keys.list.findIndex(([n]) => n === name);
  return at(id, keys.starts[i] / keys.total);
};

// nomes usados pelos textos da página -> momento na nova linha do tempo
const KEY = {
  ready: at('ready'), toss: sub('serve', SERVE, 'toss'), trophy: sub('serve', SERVE, 'trophy'),
  contact: sub('serve', SERVE, 'contact'), follow: sub('serve', SERVE, 'follow'), split: at('ready2'),
  runA: at('run'), runC: at('run', 1), backswing: sub('forehand', FORE, 'backswing'),
  forehand: sub('forehand', FORE, 'forehand'), finish: sub('forehand', FORE, 'finish'), turn: at('recover'),
  lunge: at('stretch'), relax: at('walk'), walkA: at('walk'), stand: at('stand'), coffee: at('drink'),
  gesture: at('talk'), confident: at('shake'),
};

const CAM = [
  ['ready', 0, 16, 4.7, 1.3, 1.0], ['serve', 0.45, 32, 5.1, 1.45, 1.3], ['serve', 0.8, 24, 5.2, 1.5, 1.3],
  ['ready2', 0, 10, 4.7, 1.3, 1.0], ['run', 0.2, -12, 5.3, 1.25, 1.0], ['run', 1, -24, 5.2, 1.2, 1.0],
  ['forehand', 0.35, 36, 4.5, 1.25, 1.0], ['recover', 0, 52, 4.7, 1.3, 1.0],
  ['stretch', 0.1, 58, 4.3, 1.25, 1.0], ['stretch', 0.6, 22, 4.0, 1.35, 1.1], ['stretch', 1, -8, 4.5, 1.4, 1.15],
  ['walk', 0, -32, 5.6, 1.6, 1.05], ['walk', 1, -40, 5.3, 1.55, 1.05], ['drink', 0.3, -48, 4.6, 1.5, 1.12],
  ['talk', 0.3, -18, 4.5, 1.55, 1.15], ['shake', 0.3, 2, 5.0, 1.45, 1.05],
].map(([id, f, az, d, h, look]) => ({ t: at(id, f), az, d, h, look }));
function camAt(t) {
  let i = 0;
  while (i < CAM.length - 1 && CAM[i + 1].t <= t) i++;
  const a = CAM[i], b = CAM[Math.min(i + 1, CAM.length - 1)];
  const k = a === b ? 0 : smooth(map01(t, a.t, b.t));
  return { az: lerp(a.az, b.az, k), d: lerp(a.d, b.d, k), h: lerp(a.h, b.h, k), look: lerp(a.look, b.look, k) };
}

const GLOW_FRAG = /* glsl */ `
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(vec3(0.55, 0.45, 0.3) * a * a * uOpacity, 1.0);
}`;
const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class Movimento3DView {
  constructor(el, stage, data) {
    this.el = el;
    this.stage = stage;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.05, 80);
    const logoTex = new THREE.TextureLoader().load('/img/logo.png');
    logoTex.colorSpace = THREE.SRGBColorSpace;
    logoTex.anisotropy = 4;
    this.char = new Character(data, { quality: stage.quality, logoTex });
    this.char.setColor('preta');
    this.world = makeWorld();
    this.ball = makeBall();
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: GLOW_FRAG, uniforms: { uOpacity: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.glow.rotation.x = -Math.PI / 2;

    // luz de estúdio que acompanha a câmera + contraluz dourado
    this.hemi = new THREE.HemisphereLight(0xc4bdb2, 0x0a0a0a, 0.8);
    this.key = new THREE.DirectionalLight(0xfff0dc, 2.8);
    this.rim = new THREE.DirectionalLight(0xdcb878, 3.6);
    this.fill = new THREE.DirectionalLight(0x9aa4b8, 0.9);
    for (const l of [this.key, this.rim, this.fill]) this.scene.add(l, l.target);
    this.scene.add(this.hemi, this.world.object, this.glow, this.char.group, this.ball.object);
    if (stage.quality !== 'low') {
      import('three/examples/jsm/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
        const pm = new THREE.PMREMGenerator(stage.renderer);
        this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
        this.scene.environmentIntensity = 0.4;
        pm.dispose();
      });
    }

    this.progress = 0;
    this.t = 0;
    this.poseA = this.char.newPose();
    this.poseB = this.char.newPose();
    this.poseOut = this.char.newPose();
    this.tmpPose = {};
    this.target = new THREE.Vector3(0, 1, 0.3);
    this.shift = { x: 0, y: 0 };
    this.panelMix = 0;
    this.v = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.labels = [];
    this.ballWasVisible = false;
    this.tennisEnd = KEY.lunge;
  }

  keyTime(name) { return KEY[name] ?? 0; }
  setShirtColor(id) { this.char.setColor(id); }

  sampleSeg(seg, u, out) {
    if (seg.clip) {
      this.char.sampleClip(seg.clip, lerp(seg.span[0], seg.span[1], u), out);
      const r = seg.root, a = r[0], b = r[r.length - 1];
      out.x = lerp(a[0], b[0], u); out.z = lerp(a[1], b[1], u); out.yaw = lerp(a[2], b[2], u) * D;
      return out;
    }
    sampleKeys(seg.keys, u, this.tmpPose);
    return this.char.retarget(solve(this.tmpPose), this.tmpPose, out);
  }

  // pose na linha do tempo, com transição suave entre trechos
  poseAt(t) {
    const T = t * TOTAL;
    let i = 0;
    while (i < TL.length - 1 && TL[i + 1].start <= T) i++;
    const seg = TL[i];
    const u = clamp01((T - seg.start) / seg.dur);
    this.sampleSeg(seg, u, this.poseA);
    const BW = 0.32;
    const end = seg.start + seg.dur;
    if (i < TL.length - 1 && T > end - BW) {
      const w = smooth(map01(T, end - BW, end));
      this.sampleSeg(TL[i + 1], 0, this.poseB);
      return Character.blend(this.poseA, this.poseB, w, this.poseOut);
    }
    return this.poseA;
  }

  ballAt(t, out) {
    const K = KEY, c = this.char;
    const ease = (x) => 1 - (1 - x) * (1 - x);
    if (t < K.contact) this.hitServe = null;
    if (t < K.forehand) this.hitFore = null;
    if (t >= K.toss && t < K.trophy) {
      const s = map01(t, K.toss, K.trophy);
      c.jointWorld(J.lWr, this.v2);
      const apex = c.jointWorld(J.lSh, new THREE.Vector3()).add(new THREE.Vector3(0, 1.35, 0));
      return out.copy(this.v2).lerp(apex, ease(s));
    }
    if (t >= K.trophy && t < K.contact) {
      const s = map01(t, K.trophy, K.contact);
      const apex = c.jointWorld(J.lSh, new THREE.Vector3()).add(new THREE.Vector3(0, 1.35, 0));
      return out.copy(apex).lerp(c.racketHead(this.v2), s * s);
    }
    if (t >= K.contact && t < K.follow) {
      const s = map01(t, K.contact, K.follow);
      if (!this.hitServe) this.hitServe = c.racketHead(new THREE.Vector3());
      return out.copy(this.hitServe).add(this.v2.set(0.4 * s, -1.2 * s, 13 * s));
    }
    if (t >= K.runC && t < K.forehand) {
      const s = map01(t, K.runC, K.forehand);
      const hit = c.racketHead(this.v2);
      const from = new THREE.Vector3(hit.x + 1.2, 1.1, hit.z + 14);
      out.copy(from).lerp(hit, s);
      out.y += Math.sin(Math.PI * s) * 0.9;
      return out;
    }
    if (t >= K.forehand && t < K.finish) {
      const s = map01(t, K.forehand, K.finish);
      if (!this.hitFore) this.hitFore = c.racketHead(new THREE.Vector3());
      return out.copy(this.hitFore).add(this.v2.set(-2.4 * s, 0.9 * Math.sin(Math.PI * s * 0.8), 15 * s));
    }
    return null;
  }

  update(dt, time, rect) {
    const p = this.progress;
    const seq = map01(p, 0.03, 0.97);
    this.t = damp(this.t, seq, 7, dt);
    const t = this.t;
    const c = this.char;

    c.apply(this.poseAt(t));
    const assemble = smooth(map01(p, 0, 0.055)) * 1.02;
    c.pUniforms.uAssemble.value = assemble;
    c.pUniforms.uTime.value = time;
    c.jointWorld(J.pelvis, c.pUniforms.uCenter.value);
    c.setReveal(smooth(map01(p, 0.035, 0.095)));
    c.setRacket(1 - smooth(map01(t, KEY.lunge - 0.012, KEY.lunge + 0.02)));

    this.world.uniforms.uMorph.value = smooth(map01(t, KEY.walkA - 0.05, KEY.walkA + 0.008));
    this.world.uniforms.uOpacity.value = smooth(map01(p, 0.01, 0.08));

    const b = this.ballAt(t, this.v);
    if (b) {
      if (!this.ballWasVisible) this.ball.reset();
      this.ball.set(b);
      this.ball.uniforms.uOpacity.value = 1;
    } else this.ball.uniforms.uOpacity.value = 0;
    this.ballWasVisible = !!b;

    // câmera
    const hips = c.jointWorld(J.pelvis, this.v2);
    this.target.x = damp(this.target.x, hips.x, 3.5, dt);
    this.target.z = damp(this.target.z, hips.z, 3.5, dt);
    const k = camAt(t);
    const narrow = isNarrow();
    const panelOn = t > this.tennisEnd - 0.02 ? 1 : 0;
    this.panelMix = damp(this.panelMix, panelOn, 3, dt);
    const dist = k.d * (narrow ? 1.18 + 0.32 * this.panelMix : 1);
    this.target.y = damp(this.target.y, k.look, 3, dt);
    const az = k.az * D;
    const cam = this.camera;
    cam.position.set(this.target.x + Math.sin(az) * dist, k.h + (narrow ? 0.1 : 0), this.target.z + Math.cos(az) * dist);
    cam.lookAt(this.target);

    // luzes relativas à câmera
    const fwd = this.v.subVectors(this.target, cam.position).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    this.key.position.copy(cam.position).addScaledVector(right, 2.2).add(new THREE.Vector3(0, 2.6, 0));
    this.rim.position.copy(this.target).addScaledVector(fwd, 3.2).addScaledVector(right, -1.4).add(new THREE.Vector3(0, 2.2, 0));
    this.fill.position.copy(cam.position).addScaledVector(right, -3).add(new THREE.Vector3(0, 0.5, 0));
    for (const l of [this.key, this.rim, this.fill]) l.target.position.copy(this.target);

    this.glow.position.set(hips.x, 0.005, hips.z);
    this.glow.material.uniforms.uOpacity.value = 0.55 * Math.min(1, assemble);

    this.shift.x = damp(this.shift.x, narrow ? 0 : rect.width * 0.16 * panelOn, 4, dt);
    this.shift.y = damp(this.shift.y, narrow ? -rect.height * 0.13 * panelOn : 0, 4, dt);
    cam.setViewOffset(rect.width, rect.height, -rect.left - this.shift.x, -rect.top - this.shift.y, this.stage.W, this.stage.H);
  }

  post(rect) {
    for (const l of this.labels) {
      if (!l.on) continue;
      this.char.jointWorld(l.joint, this.v);
      const s = this.stage.project(this, this.v);
      const w = l.w || (l.w = l.el.offsetWidth);
      let x = s.x - rect.left + l.dx - (l.side === 'left' ? w : 0);
      x = Math.max(12, Math.min(rect.width - w - 12, x));
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${(s.y - rect.top + l.dy).toFixed(1)}px, 0)`;
    }
  }
}
