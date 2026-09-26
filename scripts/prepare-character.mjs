// Prepara o "homem BARROS" 3D a partir do X Bot do Mixamo (assets-src/mixamo/):
//  - esqueleto (65 ossos, pose de repouso = T-pose)
//  - polo 3D construída sobre o corpo: recorta tronco + começo dos braços da
//    superfície, afrouxa, cria a barra solta e a gola; presa aos mesmos ossos
//  - corpo para profundidade (o tronco esconde as partículas de trás)
//  - pontos das partículas sobre a pele (fora da camisa)
//  - animações do Mixamo amostradas a 30 fps
// Saída: public/models/barros-man.json + barros-man.bin
//
// uso: node scripts/prepare-character.mjs
import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const DIR = 'assets-src/mixamo';
const loadFBX = (f) => {
  const b = fs.readFileSync(`${DIR}/${f}`);
  return new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
};
const origWarn = console.warn; console.warn = () => {}; // FBXLoader avisa de coisas irrelevantes

const bot = loadFBX('X Bot.fbx');
bot.updateMatrixWorld(true);
let surface = null, joints = null;
bot.traverse((o) => { if (o.isSkinnedMesh) { if (o.name === 'Beta_Surface') surface = o; else joints = o; } });
const bones = surface.skeleton.bones;
const boneIndex = new Map(bones.map((b, i) => [b.name, i]));
const W = (n) => bones[boneIndex.get(`mixamorig${n}`)].getWorldPosition(new THREE.Vector3());

// ---------- medidas do corpo (cm) ----------
const K = {
  hips: W('Hips'), neck: W('Neck'), lArm: W('LeftArm'), lFore: W('LeftForeArm'), upLeg: W('LeftUpLeg'),
  spine2: W('Spine2'),
};
const HEM_CUT = K.upLeg.y - 0.5; // corte logo acima da virilha (a barra solta desce a partir daqui)
const NECK_C = new THREE.Vector2(0, K.neck.z + 0.8);
const ARM_LEN = K.lFore.x - K.lArm.x;
const SLEEVE_T = 0.46; // manga até ~metade do braço
function fields(p) {
  const r = Math.hypot(p.x - NECK_C.x, p.z - NECK_C.y);
  const dz = (p.z - NECK_C.y) / Math.max(r, 1e-3);
  const neckLine = K.neck.y - 2.6 - 3.8 * Math.max(0, dz) + 0.6 * Math.max(0, -dz);
  const fNeck = Math.max(r - 8.6, neckLine - p.y);
  const t = (Math.abs(p.x) - K.lArm.x) / ARM_LEN;
  return [p.y - HEM_CUT, fNeck, SLEEVE_T - t];
}
const inside = (p) => fields(p).every((f) => f >= 0);

// ---------- corpo: malha indexada ----------
function indexed(mesh) {
  const g = mesh.geometry.clone();
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  return m;
}
const body = indexed(surface);
const jointsGeo = indexed(joints);
// o esqueleto das juntas tem outra ordem: remapeia para a do corpo
const jointMap = joints.skeleton.bones.map((b) => boneIndex.get(b.name));
{
  const si = jointsGeo.attributes.skinIndex;
  for (let i = 0; i < si.count; i++) for (let c = 0; c < 4; c++) si.setComponent(i, c, jointMap[si.getComponent(i, c)] ?? 0);
}

// ---------- polo: recorte por campos escalares ----------
const readV = (g, i) => {
  const P = g.attributes.position, N = g.attributes.normal, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
  const w = new Map();
  for (let c = 0; c < 4; c++) { const wt = SW.getComponent(i, c); if (wt > 0) w.set(SI.getComponent(i, c), (w.get(SI.getComponent(i, c)) || 0) + wt); }
  return { p: new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i)), n: new THREE.Vector3(N.getX(i), N.getY(i), N.getZ(i)), w };
};
const lerpV = (a, b, t) => {
  const w = new Map();
  for (const [k, v] of a.w) w.set(k, v * (1 - t));
  for (const [k, v] of b.w) w.set(k, (w.get(k) || 0) + v * t);
  return { p: a.p.clone().lerp(b.p, t), n: a.n.clone().lerp(b.n, t).normalize(), w };
};
function clipPoly(poly, k) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = fields(a.p)[k], fb = fields(b.p)[k];
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) out.push(lerpV(a, b, fa / (fa - fb)));
  }
  return out;
}
const tris = [];
{
  const idx = body.index.array;
  for (let t = 0; t < idx.length; t += 3) {
    let poly = [readV(body, idx[t]), readV(body, idx[t + 1]), readV(body, idx[t + 2])];
    for (let k = 0; k < 3 && poly.length >= 3; k++) poly = clipPoly(poly, k);
    for (let i = 1; i + 1 < poly.length; i++) tris.push([poly[0], poly[i], poly[i + 1]]);
  }
}
const top4 = (w) => {
  const arr = [...w.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const s = arr.reduce((acc, [, v]) => acc + v, 0) || 1;
  while (arr.length < 4) arr.push([0, 0]);
  return arr.map(([k, v]) => [k, v / s]);
};
function toGeometry(list) {
  const n = list.length * 3;
  const pos = new Float32Array(n * 3), si = new Float32Array(n * 4), sw = new Float32Array(n * 4);
  list.forEach((tri, t) => tri.forEach((v, j) => {
    const i = t * 3 + j;
    pos.set([v.p.x, v.p.y, v.p.z], i * 3);
    const w = top4(v.w);
    w.forEach(([k, val], c) => { si[i * 4 + c] = k; sw[i * 4 + c] = Math.round(val * 1000) / 1000; });
  }));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  return m;
}
const shirt = toGeometry(tris);

// afrouxa: mais folga na cintura e nas mangas (tecido não é pele)
{
  const P = shirt.attributes.position, N = shirt.attributes.normal;
  const chestY = K.spine2.y - 4;
  for (let i = 0; i < P.count; i++) {
    const p = new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i));
    const waist = 1 - THREE.MathUtils.smoothstep(p.y, HEM_CUT, chestY); // 1 na barra, 0 no peito
    const t = Math.max(0, (Math.abs(p.x) - K.lArm.x) / ARM_LEN);
    const d = 0.9 + 1.5 * waist + 2.2 * THREE.MathUtils.smoothstep(t, 0.05, SLEEVE_T);
    P.setXYZ(i, p.x + N.getX(i) * d, p.y + N.getY(i) * d, p.z + N.getZ(i) * d);
  }
  shirt.computeVertexNormals();
}

// bordas abertas (arestas usadas por um só triângulo), com o sentido do triângulo
function boundary(g) {
  const idx = g.index.array, count = new Map();
  const key = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = idx[t + e], b = idx[t + ((e + 1) % 3)];
    const k = key(a, b); const c = count.get(k);
    count.set(k, c ? { n: c.n + 1, a: c.a, b: c.b } : { n: 1, a, b });
  }
  return [...count.values()].filter((c) => c.n === 1).map((c) => [c.a, c.b]);
}

// ---------- barra solta + gola: novas faixas coladas nas bordas ----------
const extra = { pos: [], si: [], sw: [], part: [], idx: [] };
const baseCount = shirt.attributes.position.count;
const vAt = (g, i) => new THREE.Vector3().fromBufferAttribute(g.attributes.position, i);
const wAt = (g, i) => [0, 1, 2, 3].map((c) => [g.attributes.skinIndex.getComponent(i, c), g.attributes.skinWeight.getComponent(i, c)]);
function addVert(p, w, part) {
  extra.pos.push(p.x, p.y, p.z);
  w.forEach(([k, v]) => { extra.si.push(k); extra.sw.push(v); });
  extra.part.push(part);
  return baseCount + extra.part.length - 1;
}
const UPLEG = { l: boneIndex.get('mixamorigLeftUpLeg'), r: boneIndex.get('mixamorigRightUpLeg') };
const HIPS = boneIndex.get('mixamorigHips');
const edges = boundary(shirt);
const hemEdges = edges.filter(([a, b]) => vAt(shirt, a).y < HEM_CUT + 1.6 && vAt(shirt, b).y < HEM_CUT + 1.6);
const neckEdges = edges.filter(([a, b]) => {
  const p = vAt(shirt, a);
  return p.y > K.neck.y - 12 && Math.hypot(p.x, p.z - NECK_C.y) < 13;
});
const vCache = new Map();
const once = (k, fn) => { if (!vCache.has(k)) vCache.set(k, fn()); return vCache.get(k); };
// barra: desce 11 cm e abre um pouco; embaixo acompanha parte da coxa
const radial = (p, cz) => new THREE.Vector3(p.x, 0, p.z - cz).normalize();
for (const [a, b] of hemEdges) {
  const mk = (i) => once(`hem${i}`, () => {
    const p = vAt(shirt, i), r = radial(p, K.hips.z);
    const mid = addVert(p.clone().add(new THREE.Vector3(0, -5.5, 0)).addScaledVector(r, 0.7), wAt(shirt, i), 0);
    // embaixo: 65% quadril + 35% coxa do lado
    const side = p.x > 2 ? 'l' : p.x < -2 ? 'r' : null;
    const w = side ? [[HIPS, 0.65], [UPLEG[side], 0.35], [0, 0], [0, 0]] : [[HIPS, 0.8], [UPLEG.l, 0.1], [UPLEG.r, 0.1], [0, 0]];
    const bot = addVert(p.clone().add(new THREE.Vector3(0, -11, 0)).addScaledVector(r, 1.5), w, 0);
    return [mid, bot];
  });
  const [am, ab] = mk(a), [bm, bb] = mk(b);
  extra.idx.push(b, a, am, b, am, bm, bm, am, ab, bm, ab, bb);
}
// gola: pé da gola sobe 3 cm e a aba dobra para fora; abre na frente (carcela)
for (const [a, b] of neckEdges) {
  const pa = vAt(shirt, a), pb = vAt(shirt, b);
  const front = (p) => {
    const r = new THREE.Vector3(p.x, 0, p.z - NECK_C.y).normalize();
    return Math.acos(Math.max(-1, Math.min(1, r.z))) * (180 / Math.PI);
  };
  if (front(pa) < 13 && front(pb) < 13) continue;
  const mk = (i) => once(`col${i}`, () => {
    const p = vAt(shirt, i), r = radial(p, NECK_C.y);
    const ang = front(p);
    const tip = THREE.MathUtils.smoothstep(40 - ang, 0, 27); // pontas da gola na frente
    const T = addVert(p.clone().add(new THREE.Vector3(0, 3.1 - 1.2 * tip, 0)).addScaledVector(r, 0.35), wAt(shirt, i), 1);
    const F = addVert(p.clone().add(new THREE.Vector3(0, -0.6 - 2.4 * tip, 0)).addScaledVector(r, 3.1 + 1.2 * tip), wAt(shirt, i), 1);
    const base = addVert(p.clone(), wAt(shirt, i), 1);
    return [base, T, F];
  });
  const [a0, aT, aF] = mk(a), [b0, bT, bF] = mk(b);
  extra.idx.push(b0, a0, aT, b0, aT, bT, bT, aT, aF, bT, aF, bF);
}

// junta tudo numa malha só (part: 0 tecido, 1 gola)
const P0 = shirt.attributes.position.array, SI0 = shirt.attributes.skinIndex.array, SW0 = shirt.attributes.skinWeight.array;
const nV = baseCount + extra.part.length;
const shirtPos = new Float32Array(nV * 3), shirtSI = new Uint8Array(nV * 4), shirtSW = new Uint8Array(nV * 4), shirtPart = new Uint8Array(nV);
shirtPos.set(P0); shirtPos.set(extra.pos, baseCount * 3);
for (let i = 0; i < baseCount * 4; i++) { shirtSI[i] = SI0[i]; shirtSW[i] = Math.round(SW0[i] * 255); }
for (let i = 0; i < extra.si.length; i++) { shirtSI[baseCount * 4 + i] = extra.si[i]; shirtSW[baseCount * 4 + i] = Math.round(extra.sw[i] * 255); }
shirtPart.set(extra.part, baseCount);
const shirtIdx = new Uint32Array([...shirt.index.array, ...extra.idx]);

// ---------- corpo para profundidade (sem normais) ----------
const bodyPos = new Float32Array(body.attributes.position.array);
const bodySI = Uint8Array.from(body.attributes.skinIndex.array);
const bodySW = Uint8Array.from(body.attributes.skinWeight.array, (v) => Math.round(v * 255));
const bodyIdx = new Uint32Array(body.index.array);

// ---------- partículas sobre a pele (fora da camisa) ----------
function sample(g, count, kind) {
  const idx = g.index.array, P = g.attributes.position, N = g.attributes.normal;
  const areas = [], tri = [];
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromBufferAttribute(P, idx[t]); b.fromBufferAttribute(P, idx[t + 1]); c.fromBufferAttribute(P, idx[t + 2]);
    const ar = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
    total += ar; areas.push(total); tri.push(t);
  }
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 6) {
    const r = Math.random() * total;
    let lo = 0, hi = areas.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (areas[mid] < r) lo = mid + 1; else hi = mid; }
    const t = tri[lo];
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const va = readV(g, idx[t]), vb = readV(g, idx[t + 1]), vc = readV(g, idx[t + 2]);
    const p = va.p.clone().multiplyScalar(1 - u - v).addScaledVector(vb.p, u).addScaledVector(vc.p, v);
    if (fields(p).every((f) => f > 0.8)) continue; // escondido pela camisa
    const n = va.n.clone().multiplyScalar(1 - u - v).addScaledVector(vb.n, u).addScaledVector(vc.n, v).normalize();
    p.addScaledVector(n, 0.35);
    const w = new Map();
    for (const [vv, f] of [[va, 1 - u - v], [vb, u], [vc, v]]) for (const [k, x] of vv.w) w.set(k, (w.get(k) || 0) + x * f);
    out.push({ p, w: top4(w), kind });
  }
  return out;
}
const pts = [...sample(body, 15000, 0), ...sample(jointsGeo, 2400, 1)];
for (let i = pts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pts[i], pts[j]] = [pts[j], pts[i]]; }
const ptPos = new Float32Array(pts.length * 3), ptSI = new Uint8Array(pts.length * 4), ptSW = new Uint8Array(pts.length * 4), ptKind = new Uint8Array(pts.length);
pts.forEach((q, i) => {
  ptPos.set([q.p.x, q.p.y, q.p.z], i * 3);
  q.w.forEach(([k, v], c) => { ptSI[i * 4 + c] = k; ptSW[i * 4 + c] = Math.round(v * 255); });
  ptKind[i] = q.kind;
});

// ---------- animações ----------
const FPS = 30;
const clipFiles = fs.readdirSync(DIR).filter((f) => f !== 'X Bot.fbx');
const clipMeta = [];
const clipChunks = [];
for (const f of clipFiles) {
  const clip = loadFBX(f).animations[0];
  const frames = Math.max(2, Math.round(clip.duration * FPS) + 1);
  const q = new Int16Array(frames * bones.length * 4), hp = new Float32Array(frames * 3);
  const interps = bones.map((b) => {
    const tr = clip.tracks.find((t) => t.name === `${b.name}.quaternion`);
    return tr ? tr.createInterpolant() : null;
  });
  const hipTr = clip.tracks.find((t) => t.name === 'mixamorigHips.position');
  const hipI = hipTr ? hipTr.createInterpolant() : null;
  for (let fr = 0; fr < frames; fr++) {
    const time = Math.min(clip.duration, fr / FPS);
    bones.forEach((b, bi) => {
      const v = interps[bi] ? interps[bi].evaluate(time) : [b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w];
      const qq = new THREE.Quaternion(v[0], v[1], v[2], v[3]).normalize();
      const o = (fr * bones.length + bi) * 4;
      q[o] = Math.round(qq.x * 32767); q[o + 1] = Math.round(qq.y * 32767); q[o + 2] = Math.round(qq.z * 32767); q[o + 3] = Math.round(qq.w * 32767);
    });
    const hv = hipI ? hipI.evaluate(time) : bones[0].position.toArray();
    hp.set([hv[0], hv[1], hv[2]], fr * 3);
  }
  clipMeta.push({ name: f.replace(/\.fbx$/i, ''), fps: FPS, frames, duration: clip.duration });
  clipChunks.push([q, hp]);
}

// ---------- empacota ----------
const chunks = [];
let offset = 0;
const put = (arr) => {
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(new Uint8Array(pad)); offset += pad; }
  const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  chunks.push(u8);
  const o = offset; offset += u8.byteLength;
  return { offset: o, length: arr.length, type: arr.constructor.name };
};
const meta = {
  units: 'cm',
  bones: bones.map((b) => ({
    name: b.name.replace('mixamorig', ''),
    parent: bones.indexOf(b.parent),
    p: b.position.toArray().map((v) => +v.toFixed(4)),
    q: b.quaternion.toArray().map((v) => +v.toFixed(6)),
  })),
  body: { position: put(bodyPos), skinIndex: put(bodySI), skinWeight: put(bodySW), index: put(bodyIdx) },
  shirt: {
    position: put(shirtPos), skinIndex: put(shirtSI), skinWeight: put(shirtSW), part: put(shirtPart), index: put(shirtIdx),
    // referências para os detalhes (em cm, na pose de repouso)
    ref: {
      hemCut: HEM_CUT, hemBottom: HEM_CUT - 11, neckY: K.neck.y, neckZ: NECK_C.y, chestY: K.spine2.y,
      shoulderX: K.lArm.x, frontZ: K.spine2.z,
    },
  },
  particles: { position: put(ptPos), skinIndex: put(ptSI), skinWeight: put(ptSW), kind: put(ptKind) },
  clips: clipMeta.map((m, i) => ({ ...m, quats: put(clipChunks[i][0]), hips: put(clipChunks[i][1]) })),
};
fs.mkdirSync('public/models', { recursive: true });
fs.writeFileSync('public/models/barros-man.bin', Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))));
fs.writeFileSync('public/models/barros-man.json', JSON.stringify(meta));
console.warn = origWarn;
console.log(`✓ camisa: ${nV} vértices, ${shirtIdx.length / 3} triângulos (barra ${hemEdges.length} arestas, gola ${neckEdges.length})`);
console.log(`✓ corpo: ${bodyPos.length / 3} vértices · partículas: ${pts.length}`);
console.log(`✓ animações: ${clipMeta.map((c) => `${c.name} ${c.duration.toFixed(1)}s`).join(', ')}`);
console.log(`✓ public/models/barros-man.bin ${(offset / 1024).toFixed(0)} KB`);
