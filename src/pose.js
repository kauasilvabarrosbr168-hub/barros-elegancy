// Esqueleto procedural do "homem BARROS".
// Poses são descritas por ângulos (graus) e convertidas em posições de juntas
// por cinemática direta. Usado pelo personagem de partículas (WebGL) e pelas
// ilustrações em SVG.
//
// Convenções: y para cima, o corpo olha para +z com yaw 0.
// Lado esquerdo = +x (side = +1), lado direito = -x (side = -1).
// Direção de um membro: (elev, az) — elev 0 = para baixo, 90 = horizontal,
// 180 = para cima, negativo = para trás; az 0 = para frente, 90 = para fora.

export const J = {
  pelvis: 0, chest: 1, neck: 2, head: 3,
  lSh: 4, lEl: 5, lWr: 6, rSh: 7, rEl: 8, rWr: 9,
  lHip: 10, lKn: 11, lAn: 12, rHip: 13, rKn: 14, rAn: 15,
  lToe: 16, rToe: 17, racket: 18,
};
export const JOINT_COUNT = 19;

const D = Math.PI / 180;

const BASE = {
  x: 0, z: 0, yaw: 0, pelvisYaw: 0,
  twist: 0, lean: 0, bend: 0, lift: 0,
  headPitch: 0, headYaw: 0,
  lUe: 6, lUa: 14, lFe: 14, lFa: 0,
  rUe: 6, rUa: 14, rFe: 14, rFa: 0,
  lTe: 3, lTa: 90, lSe: 2, lSa: 90,
  rTe: 3, rTa: 90, rSe: 2, rSa: 90,
  rkE: 20, rkA: 0,
};
export const PARAM_KEYS = Object.keys(BASE);

function rotY(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
function rotX(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; }
function rotZ(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; }
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

function dir(elev, az, side) {
  const e = elev * D, a = az * D;
  return [Math.sin(e) * Math.sin(a) * side, -Math.cos(e), Math.sin(e) * Math.cos(a)];
}

export function makePose(over = {}) { return { ...BASE, ...over }; }

// Converte pose -> Float32Array(JOINT_COUNT * 3)
export function solve(p, out = new Float32Array(JOINT_COUNT * 3)) {
  const yawP = (p.yaw + p.pelvisYaw) * D;
  const Rp = (v) => rotY(v, yawP);
  const Rt = (v) => rotY(rotX(rotZ(v, -p.bend * D), p.lean * D), (p.yaw + p.pelvisYaw + p.twist) * D);
  const Rh = (v) => Rt(rotY(rotX(v, p.headPitch * D), p.headYaw * D));

  const pel = [p.x, 0, p.z];
  const hipL = add(pel, Rp([0.1, -0.03, 0]));
  const hipR = add(pel, Rp([-0.1, -0.03, 0]));
  const knL = add(hipL, mul(Rp(dir(p.lTe, p.lTa, 1)), 0.45));
  const knR = add(hipR, mul(Rp(dir(p.rTe, p.rTa, -1)), 0.45));
  const anL = add(knL, mul(Rp(dir(p.lSe, p.lSa, 1)), 0.44));
  const anR = add(knR, mul(Rp(dir(p.rSe, p.rSa, -1)), 0.44));
  // pés: apontam para a frente da pelve
  const foot = Rp([0, -0.05, 0.15]);
  const toL = add(anL, foot), toR = add(anR, foot);

  // encosta o pé mais baixo no chão (tornozelo a 0.08m) + salto
  const ground = 0.08 - Math.min(anL[1], anR[1]) + p.lift;

  const chest = add(pel, Rt([0, 0.34, 0]));
  const neck = add(pel, Rt([0, 0.53, 0]));
  const head = add(neck, Rh([0, 0.27, 0.01]));
  const shL = add(pel, Rt([0.19, 0.47, 0]));
  const shR = add(pel, Rt([-0.19, 0.47, 0]));
  const elL = add(shL, mul(Rt(dir(p.lUe, p.lUa, 1)), 0.29));
  const elR = add(shR, mul(Rt(dir(p.rUe, p.rUa, -1)), 0.29));
  const wrL = add(elL, mul(Rt(dir(p.lFe, p.lFa, 1)), 0.26));
  const wrR = add(elR, mul(Rt(dir(p.rFe, p.rFa, -1)), 0.26));
  const rk = add(wrR, mul(Rt(dir(p.rkE, p.rkA, -1)), 0.66));

  const list = [pel, chest, neck, head, shL, elL, wrL, shR, elR, wrR, hipL, knL, anL, hipR, knR, anR, toL, toR, rk];
  for (let i = 0; i < list.length; i++) {
    out[i * 3] = list[i][0]; out[i * 3 + 1] = list[i][1] + ground; out[i * 3 + 2] = list[i][2];
  }
  return out;
}

// ---------- Biblioteca de poses ----------
const P = makePose;

export const POSES = {
  // Tênis
  ready: P({ lean: 24, lUe: 38, lUa: 8, lFe: 98, lFa: -40, rUe: 38, rUa: 8, rFe: 96, rFa: -20, rkE: 118, rkA: -35,
    lTe: 34, lTa: 32, lSe: -14, lSa: 30, rTe: 34, rTa: 32, rSe: -14, rSa: 30, headPitch: -12 }),
  toss: P({ yaw: -55, lean: 6, bend: 4, lUe: 120, lUa: 10, lFe: 130, lFa: 10, rUe: 40, rUa: 70, rFe: 60, rFa: 90, rkE: 70, rkA: 130,
    lTe: 22, lTa: 20, lSe: -10, lSa: 20, rTe: 20, rTa: 40, rSe: -14, rSa: 40, headPitch: -18 }),
  trophy: P({ yaw: -70, twist: -18, lean: -14, bend: 16, lUe: 168, lUa: 8, lFe: 172, lFa: 8, rUe: 96, rUa: 84, rFe: -150, rFa: 30, rkE: -162, rkA: 20,
    lTe: 32, lTa: 20, lSe: -30, lSa: 20, rTe: 30, rTa: 36, rSe: -30, rSa: 36, headPitch: -35 }),
  contact: P({ yaw: -24, twist: 18, lean: 8, bend: -10, lift: 0.1, lUe: 48, lUa: -30, lFe: 92, lFa: -64, rUe: 172, rUa: 10, rFe: 176, rFa: 6, rkE: 178, rkA: 0,
    lTe: 6, lTa: 12, lSe: -4, lSa: 12, rTe: -8, rTa: 20, rSe: -18, rSa: 20, headPitch: -30 }),
  follow: P({ yaw: 4, z: 0.45, twist: 34, lean: 36, lUe: 36, lUa: -20, lFe: 70, lFa: -40, rUe: 64, rUa: -62, rFe: 30, rFa: -84, rkE: 10, rkA: -90,
    lTe: -18, lTa: 12, lSe: -46, lSa: 12, rTe: 42, rTa: 16, rSe: -8, rSa: 16, headPitch: -10 }),
  split: P({ z: 0.6, lean: 20, lift: 0.05, lUe: 34, lUa: 10, lFe: 96, lFa: -40, rUe: 34, rUa: 10, rFe: 94, rFa: -20, rkE: 116, rkA: -35,
    lTe: 26, lTa: 44, lSe: -12, lSa: 44, rTe: 26, rTa: 44, rSe: -12, rSa: 44, headPitch: -10 }),
  runA: P({ x: 0.7, z: 0.6, lean: 22, bend: -4, lUe: 50, lUa: 50, lFe: 100, lFa: 20, rUe: 44, rUa: 26, rFe: 110, rFa: -10, rkE: 120, rkA: -20,
    lTe: 34, lTa: 76, lSe: 14, lSa: 76, rTe: 30, rTa: 50, rSe: -22, rSa: 50, headPitch: -8 }),
  runB: P({ x: 1.35, z: 0.6, lean: 22, bend: 4, lUe: 34, lUa: 30, lFe: 90, lFa: 0, rUe: 50, rUa: 40, rFe: 108, rFa: 0, rkE: 118, rkA: -10,
    lTe: 10, lTa: 30, lSe: -10, lSa: 30, rTe: 38, rTa: -24, rSe: -26, rSa: -24, headPitch: -8 }),
  runC: P({ x: 1.95, z: 0.6, lean: 20, lUe: 50, lUa: 50, lFe: 100, lFa: 20, rUe: 44, rUa: 30, rFe: 108, rFa: -10, rkE: 118, rkA: -20,
    lTe: 34, lTa: 70, lSe: 14, lSa: 70, rTe: 32, rTa: 52, rSe: -20, rSa: 52, headPitch: -8 }),
  backswing: P({ x: 2.15, z: 0.6, yaw: -30, twist: -58, lean: 18, lUe: 88, lUa: 12, lFe: 94, lFa: 0, rUe: 60, rUa: 108, rFe: 82, rFa: 130, rkE: 96, rkA: 150,
    lTe: 28, lTa: 40, lSe: -12, lSa: 40, rTe: 34, rTa: 46, rSe: -26, rSa: 46, headPitch: -10, headYaw: 40 }),
  forehand: P({ x: 2.2, z: 0.62, yaw: 6, twist: 2, lean: 16, lUe: 60, lUa: 40, lFe: 70, lFa: 20, rUe: 70, rUa: 40, rFe: 84, rFa: 8, rkE: 94, rkA: -12,
    lTe: 22, lTa: 40, lSe: -6, lSa: 40, rTe: 26, rTa: 40, rSe: -20, rSa: 40, headPitch: -8, headYaw: -5 }),
  finish: P({ x: 2.22, z: 0.64, yaw: 18, twist: 44, lean: 10, lUe: 40, lUa: -10, lFe: 70, lFa: -30, rUe: 128, rUa: -44, rFe: 150, rFa: -110, rkE: -150, rkA: -60,
    lTe: 14, lTa: 30, lSe: -4, lSa: 30, rTe: -6, rTa: 30, rSe: -30, rSa: 30, headPitch: -6, headYaw: -15 }),
  turn: P({ x: 1.6, z: 0.5, yaw: 40, twist: 10, lean: 14, lUe: 30, lUa: 30, lFe: 80, lFa: -20, rUe: 34, rUa: 20, rFe: 96, rFa: -20, rkE: 120, rkA: -30,
    lTe: 20, lTa: 40, lSe: -10, lSa: 40, rTe: 24, rTa: 40, rSe: -12, rSa: 40, headPitch: -6 }),
  // Conforto em movimento
  lunge: P({ x: 1.1, z: 0.9, yaw: 10, lean: 30, lUe: 30, lUa: 40, lFe: 40, lFa: 30, rUe: 96, rUa: 4, rFe: 98, rFa: 0, rkE: 100, rkA: 0,
    lTe: 74, lTa: 10, lSe: -4, lSa: 10, rTe: -40, rTa: 12, rSe: -84, rSa: 12, headPitch: -4 }),
  rotate: P({ x: 1.0, z: 0.8, yaw: 0, twist: 62, lean: 4, lUe: 90, lUa: 86, lFe: 90, lFa: 90, rUe: 90, rUa: 86, rFe: 90, rFa: 90, rkE: 90, rkA: 90,
    lTe: 18, lTa: 70, lSe: -6, lSa: 70, rTe: 18, rTa: 70, rSe: -6, rSa: 70, headYaw: 30 }),
  reach: P({ x: 0.9, z: 0.8, yaw: -10, twist: -8, lean: -8, bend: 14, lift: 0.04, lUe: 150, lUa: 30, lFe: 170, lFa: 20, rUe: 172, rUa: 16, rFe: 178, rFa: 10, rkE: 178, rkA: 0,
    lTe: 6, lTa: 70, lSe: 2, lSa: 70, rTe: 6, rTa: 70, rSe: 2, rSa: 70, headPitch: -18 }),
  relax: P({ x: 0.8, z: 0.8, yaw: -6, lUe: 8, lUa: 16, lFe: 22, lFa: 0, rUe: 10, rUa: 14, rFe: 40, rFa: -10, rkE: 30, rkA: -10 }),
  // Negócios
  stand: P({ x: 0.8, z: 0.8, yaw: -12, lUe: 6, lUa: 16, lFe: 14, lFa: 0, rUe: 6, rUa: 16, rFe: 14, rFa: 0, rkE: 10, headPitch: -4 }),
  walkA: P({ x: 0.6, z: 1.4, yaw: -18, lean: 4, lUe: -18, lUa: 10, lFe: -8, lFa: 10, rUe: 20, rUa: 10, rFe: 38, rFa: -4, rkE: 20,
    lTe: 26, lTa: 8, lSe: 8, lSa: 8, rTe: -16, rTa: 8, rSe: -34, rSa: 8 }),
  walkB: P({ x: 0.4, z: 2.0, yaw: -18, lean: 4, lUe: 20, lUa: 10, lFe: 38, lFa: -4, rUe: -18, rUa: 10, rFe: -8, rFa: 10, rkE: 20,
    lTe: -16, lTa: 8, lSe: -34, lSa: 8, rTe: 26, rTa: 8, rSe: 8, rSa: 8 }),
  coffee: P({ x: 0.3, z: 2.3, yaw: -24, lUe: 8, lUa: 30, lFe: -10, lFa: 70, rUe: 22, rUa: 10, rFe: 124, rFa: -18, rkE: 150, headPitch: -2, headYaw: 10,
    lTe: 4, lTa: 90, lSe: 2, lSa: 90, rTe: 6, rTa: 60, rSe: 3, rSa: 60 }),
  gesture: P({ x: 0.3, z: 2.3, yaw: 14, twist: -8, lUe: 30, lUa: 22, lFe: 88, lFa: 14, rUe: 36, rUa: 30, rFe: 96, rFa: 26, rkE: 110, headYaw: -16,
    lTe: 4, lTa: 80, lSe: 2, lSa: 80, rTe: 4, rTa: 80, rSe: 2, rSa: 80 }),
  confident: P({ x: 0.3, z: 2.3, yaw: 0, lean: -2, lUe: 10, lUa: 26, lFe: -12, lFa: 70, rUe: 10, rUa: 26, rFe: -12, rFa: 70, rkE: 10, headPitch: -6,
    lTe: 4, lTa: 90, lSe: 2, lSa: 90, rTe: 4, rTa: 90, rSe: 2, rSa: 90 }),
  // Cenas "para quem é" (SVG)
  gym: P({ lean: 6, lUe: 10, lUa: 8, lFe: 150, lFa: 0, rUe: 10, rUa: 8, rFe: 150, rFa: 0, lTe: 10, lTa: 60, lSe: -4, lSa: 60, rTe: 10, rTa: 60, rSe: -4, rSa: 60 }),
  golf: P({ yaw: 30, twist: 70, lean: 8, lUe: 150, lUa: -40, lFe: 150, lFa: -90, rUe: 120, rUa: -60, rFe: 160, rFa: -100, rkE: -150, rkA: -80,
    lTe: 4, lTa: 40, lSe: 2, lSa: 40, rTe: -10, rTa: 20, rSe: -40, rSa: 20, headYaw: -40 }),
  sit: P({ lean: -4, lUe: 20, lUa: 10, lFe: 80, lFa: -10, rUe: 16, rUa: 14, rFe: 118, rFa: -20, lTe: 88, lTa: 8, lSe: 4, lSa: 8, rTe: 88, rTa: 8, rSe: 4, rSa: 8, headPitch: -2 }),
  travel: P({ yaw: -10, lean: 3, lUe: -14, lUa: 10, lFe: -18, lFa: 8, rUe: 18, rUa: 10, rFe: 30, rFa: -4, lTe: 24, lTa: 8, lSe: 6, lSa: 8, rTe: -14, rTa: 8, rSe: -30, rSa: 8 }),
  handshake: P({ yaw: 70, lUe: 8, lUa: 14, lFe: 12, lFa: 0, rUe: 32, rUa: 10, rFe: 78, rFa: -4, headYaw: 0 }),
};

// Sequência do capítulo "movimento": [pose, duração relativa]
export const SEQUENCE = [
  ['ready', 1.0], ['toss', 1.1], ['trophy', 1.0], ['contact', 0.7], ['follow', 1.0],
  ['split', 1.0], ['runA', 0.8], ['runB', 0.8], ['runC', 0.8], ['backswing', 1.0],
  ['forehand', 0.6], ['finish', 1.1], ['turn', 1.1],
  ['lunge', 1.4], ['rotate', 1.4], ['reach', 1.4], ['relax', 1.2],
  ['stand', 1.2], ['walkA', 0.9], ['walkB', 0.9], ['coffee', 1.4], ['gesture', 1.4], ['confident', 1.2],
];

// Sequência de poses-chave com duração relativa -> estrutura para amostragem
export function makeKeys(list) {
  const starts = [];
  let t = 0;
  for (const [, d] of list) { starts.push(t); t += d; }
  return { list, starts, total: t };
}
const SEQ = makeKeys(SEQUENCE);

// Tempo (0..1) em que cada pose-chave acontece — útil para sincronizar textos.
export function keyTime(name, keys = SEQ) {
  const i = keys.list.findIndex(([n]) => n === name);
  return i < 0 ? 0 : keys.starts[i] / keys.total;
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Pose interpolada suavemente (Catmull-Rom) ao longo de uma sequência, t em 0..1
export function sampleKeys(keys, t, out = {}) {
  const { list, starts, total } = keys;
  const time = Math.min(0.99999, Math.max(0, t)) * total;
  let i = 0;
  while (i < list.length - 1 && starts[i + 1] <= time) i++;
  const local = (time - starts[i]) / list[i][1];
  const k = (j) => POSES[list[Math.max(0, Math.min(list.length - 1, j))][0]];
  const a = k(i - 1), b = k(i), c = k(i + 1), d = k(i + 2);
  // leve ease para os movimentos "assentarem" nas poses-chave
  const e = local * local * (3 - 2 * local) * 0.55 + local * 0.45;
  for (const key of PARAM_KEYS) out[key] = catmull(a[key], b[key], c[key], d[key], e);
  return out;
}

export function sampleSequence(t, out = {}) { return sampleKeys(SEQ, t, out); }
