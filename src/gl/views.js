import * as THREE from 'three';
import { Fabric, makeLimbo } from './fabric.js';
import { POLO_H } from './polo.js';
import { Athlete, ShirtCard } from './athlete.js';
import { makeWorld, makeBall } from './world.js';
import { J, POSES, keyTime, sampleSequence, solve } from '../pose.js';
import { HOTSPOTS } from '../config.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const map01 = (v, a, b) => clamp01((v - a) / (b - a));
const smooth = (v) => v * v * (3 - 2 * v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const isNarrow = () => window.innerWidth <= 860;

// ------------------------------------------------------------
// 02–04: tecido, revelação, 360° e detalhes
// ------------------------------------------------------------
export const PECA = {
  fabricEnd: 0.32,
  revealA: 0.17, revealB: 0.31,
  spinA: 0.33, spinB: 0.46,
  detailA: 0.46,
};
export function detailIndexAt(p) {
  if (p < PECA.detailA) return -1;
  return Math.min(HOTSPOTS.length - 1, Math.floor(map01(p, PECA.detailA, 1) * HOTSPOTS.length));
}
export function detailProgressFor(i) {
  return PECA.detailA + ((i + 0.45) / HOTSPOTS.length) * (1 - PECA.detailA);
}

export class PecaView {
  constructor(el, polo, stage) {
    this.el = el;
    this.stage = stage;
    this.polo = polo;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    this.baseZ = 6.4;
    this.camera.position.set(0, 0, this.baseZ);
    this.black = new Fabric({ quality: stage.quality, color: 'black', dir: 1, seed: 0.4 });
    this.white = new Fabric({ quality: stage.quality, color: 'white', dir: -1, seed: 2.3 });
    this.limbo = makeLimbo();
    this.scene.add(this.limbo, this.black.mesh, polo.group, this.white.mesh);
    this.progress = 0;
    this.focus = new THREE.Vector3();
    this.focusDist = this.baseZ;
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.markers = [];
    this.shift = { x: 0, y: 0 };
    this.interactive = false;
  }

  update(dt, time, rect) {
    const p = this.progress;
    const cam = this.camera;
    const visH = 2 * Math.tan((cam.fov * Math.PI) / 360) * this.baseZ;
    const visW = visH * cam.aspect;

    // tecido: preto atravessa, depois o branco no sentido oposto
    const f = map01(p, 0, PECA.fabricEnd);
    const len = this.black.uniforms.uLen.value;
    this.black.set(smooth(map01(f, 0.0, 0.78)) * (1.25 + len), time, visW);
    this.white.set(smooth(map01(f, 0.16, 1.0)) * (1.25 + len), time, visW);

    // revelação da peça
    const reveal = smooth(map01(p, PECA.revealA, PECA.revealB));
    const polo = this.polo;
    polo.reveal = reveal;
    const detailing = p >= PECA.detailA - 0.02;
    this.interactive = p >= PECA.spinA && p < PECA.spinB;
    if (p < PECA.spinA) polo.drive = 40;
    else if (this.interactive) polo.drive = null;
    polo.light = 1;

    // detalhes
    let zoom = 1;
    const idx = detailIndexAt(p);
    polo.detail = idx >= 0;
    const fit = Math.min(1, (visW * 0.66) / (POLO_H * 0.8));
    polo.group.scale.setScalar(fit * (0.9 + 0.1 * reveal));
    polo.group.position.y = lerp(-0.18, 0, reveal) + Math.sin(time * 0.7) * 0.015 * (detailing ? 0 : 1);
    polo.group.updateMatrixWorld(true);

    const target = this.tmp.set(0, 0, 0);
    if (idx >= 0) {
      const dp = map01(p, PECA.detailA, 1) * HOTSPOTS.length;
      const local = dp - idx;
      const h = HOTSPOTS[idx];
      polo.drive = polo.detailAngle(h);
      polo.hotspotWorld(h, target);
      zoom = 1 + (h.zoom - 1) * smooth(map01(local, 0, 0.35)) * (idx === 0 ? 1 : 1);
      // passagem para o próximo detalhe
      if (idx < HOTSPOTS.length - 1 && local > 0.82) {
        const n = HOTSPOTS[idx + 1];
        const t = smooth(map01(local, 0.82, 1));
        polo.hotspotWorld(n, this.tmp2);
        target.lerp(this.tmp2, t);
        zoom = lerp(h.zoom, n.zoom, t) - Math.sin(Math.PI * t) * 0.25;
      }
      if (idx === 0) {
        const t0 = smooth(map01(local, 0, 0.35));
        target.multiplyScalar(t0);
      }
    }
    this.focus.x = damp(this.focus.x, target.x, 6, dt);
    this.focus.y = damp(this.focus.y, target.y, 6, dt);
    this.focus.z = damp(this.focus.z, target.z, 6, dt);
    this.focusDist = damp(this.focusDist, this.baseZ / zoom, 6, dt);
    cam.position.set(this.focus.x, this.focus.y, this.focus.z + this.focusDist);
    cam.lookAt(this.focus);

    // abre espaço para o painel de texto nos detalhes
    const want = idx >= 0 ? 1 : 0;
    this.shift.x = damp(this.shift.x, isNarrow() ? 0 : -rect.width * 0.14 * want, 5, dt);
    this.shift.y = damp(this.shift.y, isNarrow() ? -rect.height * 0.16 * want : 0, 5, dt);
    cam.setViewOffset(rect.width, rect.height, -rect.left - this.shift.x, -rect.top - this.shift.y, this.stage.W, this.stage.H);

    this.limbo.setIntensity(smooth(map01(p, 0.1, 0.28)) * (1 - 0.45 * (idx >= 0 ? 1 : 0)));
    polo.update(dt);
  }

  post(rect) {
    // posiciona os marcadores de detalhe (relativos ao palco)
    for (let i = 0; i < this.markers.length; i++) {
      const el = this.markers[i];
      this.polo.hotspotWorld(HOTSPOTS[i], this.tmp);
      const s = this.stage.project(this, this.tmp);
      el.style.transform = `translate3d(${(s.x - rect.left).toFixed(1)}px, ${(s.y - rect.top).toFixed(1)}px, 0)`;
    }
  }
}

// ------------------------------------------------------------
// 05–07: performance, conforto, do esporte aos negócios
// ------------------------------------------------------------
const CAM_KEYS = [
  ['ready', 16, 4.7, 1.3, 1.0],
  ['trophy', 32, 5.1, 1.45, 1.3],
  ['contact', 24, 5.2, 1.5, 1.35],
  ['follow', 10, 4.7, 1.3, 1.0],
  ['runA', -12, 5.3, 1.25, 1.0],
  ['runC', -24, 5.2, 1.2, 1.0],
  ['forehand', 36, 4.5, 1.25, 1.0],
  ['turn', 52, 4.7, 1.3, 1.0],
  ['lunge', 74, 4.2, 1.1, 0.85],
  ['rotate', 22, 3.9, 1.35, 1.1],
  ['reach', -8, 4.4, 1.4, 1.25],
  ['relax', -20, 4.8, 1.45, 1.05],
  ['stand', -32, 5.6, 1.6, 1.05],
  ['walkB', -40, 5.3, 1.55, 1.05],
  ['coffee', -48, 4.6, 1.5, 1.12],
  ['gesture', -18, 4.5, 1.55, 1.15],
  ['confident', 2, 5.0, 1.45, 1.05],
].map(([n, az, d, h, look]) => ({ t: keyTime(n), az, d, h, look }));

function camAt(t) {
  let i = 0;
  while (i < CAM_KEYS.length - 1 && CAM_KEYS[i + 1].t <= t) i++;
  const a = CAM_KEYS[i], b = CAM_KEYS[Math.min(i + 1, CAM_KEYS.length - 1)];
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

// pontos de referência para a bola
function ringAt(pose) {
  const j = solve(POSES[pose]);
  const w = new THREE.Vector3(j[J.rWr * 3], j[J.rWr * 3 + 1], j[J.rWr * 3 + 2]);
  const r = new THREE.Vector3(j[J.racket * 3], j[J.racket * 3 + 1], j[J.racket * 3 + 2]);
  return w.lerp(r, 0.7);
}

export const MOV = {
  seqA: 0.03, seqB: 0.97,
  // intervalos da sequência (0..1) para textos
  tennisEnd: keyTime('lunge'),
  comfortEnd: keyTime('stand'),
};
export function seqAt(p) { return map01(p, MOV.seqA, MOV.seqB); }

const SLEEVE = { preta: new THREE.Color(0.3, 0.3, 0.32), branca: new THREE.Color(0.96, 0.94, 0.89) };

export class MovimentoView {
  constructor(el, stage, spin) {
    this.el = el;
    this.stage = stage;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
    this.athlete = new Athlete({ quality: stage.quality });
    this.world = makeWorld();
    this.ball = makeBall();
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: GLOW_FRAG, uniforms: { uOpacity: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.glow.rotation.x = -Math.PI / 2;
    this.shirt = new ShirtCard(spin);
    this.scene.add(this.world.object, this.glow, this.shirt.group, this.athlete.points, this.ball.object);
    this.progress = 0;
    this.t = 0;
    this.pose = {};
    this.target = new THREE.Vector3(0, 1, 0.6);
    this.shift = { x: 0, y: 0 };
    this.v = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.labels = [];
    this.ballWasVisible = false;
    this.keys = {
      toss: keyTime('toss'), trophy: keyTime('trophy'), contact: keyTime('contact'), follow: keyTime('follow'),
      runC: keyTime('runC'), backswing: keyTime('backswing'), forehand: keyTime('forehand'), finish: keyTime('finish'),
      relax: keyTime('relax'), stand: keyTime('stand'), walkA: keyTime('walkA'),
    };
    const jt = solve(POSES.trophy);
    this.apex = new THREE.Vector3(jt[J.lSh * 3] - 0.05, 2.95, jt[J.lSh * 3 + 2] + 0.12);
    this.hitServe = ringAt('contact');
    this.hitFore = ringAt('forehand');
  }

  setShirtColor(id) {
    this.shirt.color = id;
    this.athlete.uniforms.uSleeve.value.copy(SLEEVE[id] || SLEEVE.branca);
  }

  ballAt(t, out) {
    const k = this.keys;
    const ease = (x) => 1 - (1 - x) * (1 - x);
    if (t >= k.toss && t < k.trophy) {
      const s = map01(t, k.toss, k.trophy);
      this.athlete.joint(J.lWr, this.v2);
      return out.copy(this.v2).lerp(this.apex, ease(s));
    }
    if (t >= k.trophy && t < k.contact) {
      const s = map01(t, k.trophy, k.contact);
      return out.copy(this.apex).lerp(this.hitServe, s * s);
    }
    if (t >= k.contact && t < k.follow) {
      const s = map01(t, k.contact, k.follow);
      return out.copy(this.hitServe).add(this.v2.set(0.4 * s, -1.2 * s, 13 * s));
    }
    if (t >= k.runC && t < k.forehand) {
      const s = map01(t, k.runC, k.forehand);
      const from = this.v2.set(this.hitFore.x + 1.2, 1.1, this.hitFore.z + 14);
      out.copy(from).lerp(this.hitFore, s);
      out.y += Math.sin(Math.PI * s) * 0.9;
      return out;
    }
    if (t >= k.forehand && t < k.finish) {
      const s = map01(t, k.forehand, k.finish);
      out.copy(this.hitFore).add(this.v2.set(-2.4 * s, 0.9 * Math.sin(Math.PI * s * 0.8), 15 * s));
      return out;
    }
    return null;
  }

  update(dt, time, rect) {
    const p = this.progress;
    const seq = seqAt(p);
    this.t = damp(this.t, seq, 7, dt);
    const t = this.t;
    sampleSequence(t, this.pose);
    const joints = solve(this.pose);
    this.athlete.setJoints(joints, dt);

    const u = this.athlete.uniforms;
    u.uTime.value = time;
    u.uAssemble.value = smooth(map01(p, 0, 0.055)) * 1.02;
    u.uRacket.value = 1 - smooth(map01(t, this.keys.relax, this.keys.stand));
    u.uOpacity.value = 1;

    this.world.uniforms.uMorph.value = smooth(map01(t, this.keys.relax, this.keys.walkA + 0.02));
    this.world.uniforms.uOpacity.value = smooth(map01(p, 0.01, 0.08));

    // bola
    const b = this.ballAt(t, this.v);
    if (b) {
      if (!this.ballWasVisible) this.ball.reset();
      this.ball.set(b);
      this.ball.uniforms.uOpacity.value = 1;
    } else this.ball.uniforms.uOpacity.value = 0;
    this.ballWasVisible = !!b;

    // câmera acompanha o corpo
    const px = joints[0], pz = joints[2];
    this.target.x = damp(this.target.x, px, 3.5, dt);
    this.target.z = damp(this.target.z, pz, 3.5, dt);
    const c = camAt(t);
    const narrow = isNarrow();
    const panelOn = t > MOV.tennisEnd - 0.02 ? 1 : 0;
    this.panelMix = damp(this.panelMix || 0, panelOn, 3, dt);
    const dist = c.d * (narrow ? 1.18 + 0.32 * this.panelMix : 1);
    this.target.y = damp(this.target.y, c.look, 3, dt);
    const az = (c.az * Math.PI) / 180;
    const cam = this.camera;
    cam.position.set(this.target.x + Math.sin(az) * dist, c.h + (narrow ? 0.1 : 0), this.target.z + Math.cos(az) * dist);
    cam.lookAt(this.target);

    // camisa real no tronco (aparece quando o corpo termina de se formar)
    const shirtOn = this.shirt.available ? smooth(map01(u.uAssemble.value, 0.72, 1)) : 0;
    u.uRealShirt.value = shirtOn;
    this.shirt.update(joints, u.uFwd.value, cam.position, shirtOn);

    this.glow.position.set(px, 0.005, pz);
    this.glow.material.uniforms.uOpacity.value = 0.55 * u.uAssemble.value;

    // espaço para os painéis de texto (conforto e negócios)
    this.shift.x = damp(this.shift.x, narrow ? 0 : rect.width * 0.16 * panelOn, 4, dt);
    this.shift.y = damp(this.shift.y, narrow ? -rect.height * 0.13 * panelOn : 0, 4, dt);
    cam.setViewOffset(rect.width, rect.height, -rect.left - this.shift.x, -rect.top - this.shift.y, this.stage.W, this.stage.H);
  }

  post(rect) {
    for (const l of this.labels) {
      if (!l.on) continue;
      this.athlete.joint(l.joint, this.v);
      const s = this.stage.project(this, this.v);
      const w = l.w || (l.w = l.el.offsetWidth);
      let x = s.x - rect.left + l.dx - (l.side === 'left' ? w : 0);
      x = Math.max(12, Math.min(rect.width - w - 12, x));
      l.el.style.transform = `translate3d(${x.toFixed(1)}px, ${(s.y - rect.top + l.dy).toFixed(1)}px, 0)`;
    }
  }
}

// ------------------------------------------------------------
// 08: manifesto
// ------------------------------------------------------------
export class ManifestoView {
  constructor(el, polo, stage) {
    this.el = el;
    this.stage = stage;
    this.polo = polo;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    this.camera.position.set(0, 0, 6.8);
    this.limbo = makeLimbo();
    this.scene.add(this.limbo, polo.group);
    polo.drive = 0;
    this.progress = 0;
  }
  update(dt, time) {
    const p = this.progress;
    const polo = this.polo;
    polo.reveal = smooth(map01(p, 0.0, 0.1));
    polo.light = 1 - 0.78 * smooth(map01(p, 0.08, 0.16)) + 0.5 * smooth(map01(p, 0.9, 1));
    polo.drive = -14 + p * 28;
    const visH = 2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z;
    const fit = Math.min(1, (visH * this.camera.aspect * 0.7) / (POLO_H * 0.8));
    polo.group.scale.setScalar(fit * (0.92 + 0.08 * polo.reveal));
    polo.group.position.y = Math.sin(time * 0.6) * 0.02;
    this.limbo.setIntensity(polo.reveal * polo.light * 0.9);
    polo.update(dt);
  }
}

// ------------------------------------------------------------
// 10: reserva
// ------------------------------------------------------------
export class ReservaView {
  constructor(el, polo, stage) {
    this.el = el;
    this.stage = stage;
    this.polo = polo;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    this.limbo = makeLimbo();
    this.scene.add(this.limbo, polo.group);
    this.shown = 0;
    this.markers = [];
    this.showHotspots = false;
    this.tmp = new THREE.Vector3();
  }
  update(dt, time, rect) {
    const vis = clamp01((this.stage.H - rect.top) / (rect.height * 0.6));
    this.shown = damp(this.shown, vis > 0.2 ? 1 : 0, 2.2, dt);
    const polo = this.polo;
    polo.detail = this.showHotspots;
    polo.reveal = smooth(this.shown);
    polo.light = 1;
    const tanH = Math.tan((this.camera.fov * Math.PI) / 360);
    const needH = POLO_H * 1.12;
    const needW = POLO_H * 0.86;
    const z = Math.max(needH / (2 * tanH), needW / (2 * tanH * this.camera.aspect));
    this.camera.position.set(0, 0.02, z);
    this.camera.lookAt(0, 0.02, 0);
    polo.group.position.y = Math.sin(time * 0.7) * 0.012;
    this.limbo.setIntensity(polo.reveal * 0.8);
    polo.update(dt);
  }
  post(rect) {
    const polo = this.polo;
    const facing = polo.kind === 'image' ? Math.abs((((polo.angle - 40) % 360) + 540) % 360 - 180) < 10 : true;
    for (let i = 0; i < this.markers.length; i++) {
      const el = this.markers[i];
      const h = HOTSPOTS[i];
      polo.hotspotWorld(h, this.tmp);
      let front = facing;
      if (polo.kind === 'model') {
        // esconde pontos que ficaram de costas para a câmera
        const a = (polo.angle * Math.PI) / 180;
        front = h.modelo[2] * Math.cos(a) - h.modelo[0] * Math.sin(a) > -0.05;
      }
      const s = this.stage.project(this, this.tmp);
      el.style.transform = `translate3d(${(s.x - rect.left).toFixed(1)}px, ${(s.y - rect.top).toFixed(1)}px, 0)`;
      el.classList.toggle('hidden', !(this.showHotspots && front));
    }
  }
}
