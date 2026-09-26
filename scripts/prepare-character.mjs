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
  const fNeck = Math.max(neckLine - p.y, Math.min(r - 8.6, K.neck.y + 1.5 - p.y));
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
// ---------- polo: casca contínua a 1,5 cm do corpo (campo de distância) ----------
// O X Bot é segmentado (anéis das juntas em outra malha), então a camisa não pode
// sair direto da pele: amostra pele + juntas, calcula a distância assinada numa grade
// e extrai a superfície de nível +OFF (marching tetrahedra). Fica lisa, sem buracos,
// e se une na axila como tecido de verdade.
const OFF = 1.5;
function surfaceSamples(g, count) {
  const idx = g.index.array, P = g.attributes.position;
  const areas = []; let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromBufferAttribute(P, idx[t]); b.fromBufferAttribute(P, idx[t + 1]); c.fromBufferAttribute(P, idx[t + 2]);
    total += new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
    areas.push(total);
  }
  const out = [];
  for (let s2 = 0; s2 < count; s2++) {
    const r = Math.random() * total;
    let lo = 0, hi = areas.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (areas[mid] < r) lo = mid + 1; else hi = mid; }
    const t = lo * 3;
    let u = Math.random(), v = Math.random();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const va = readV(g, idx[t]), vb = readV(g, idx[t + 1]), vc = readV(g, idx[t + 2]);
    const p = va.p.clone().multiplyScalar(1 - u - v).addScaledVector(vb.p, u).addScaledVector(vc.p, v);
    const n = va.n.clone().multiplyScalar(1 - u - v).addScaledVector(vb.n, u).addScaledVector(vc.n, v).normalize();
    const w = new Map();
    for (const [vv, f] of [[va, 1 - u - v], [vb, u], [vc, v]]) for (const [k, x] of vv.w) w.set(k, (w.get(k) || 0) + x * f);
    out.push({ p, n, w });
  }
  return out;
}
const S = [...surfaceSamples(body, 60000), ...surfaceSamples(jointsGeo, 16000)];
const CELL = 2;
const hash = new Map();
const hkey = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
for (const q of S) { const k = hkey(q.p.x, q.p.y, q.p.z); if (!hash.has(k)) hash.set(k, []); hash.get(k).push(q); }
function nearby(p, R) {
  const out = [];
  const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL), cz = Math.floor(p.z / CELL), rr = Math.ceil(R / CELL);
  for (let i = -rr; i <= rr; i++) for (let j = -rr; j <= rr; j++) for (let k = -rr; k <= rr; k++) {
    const l = hash.get(`${cx + i},${cy + j},${cz + k}`);
    if (l) for (const q of l) out.push(q);
  }
  return out;
}
// grade só na região da camisa (tronco + começo dos braços)
const H = 1.25, X0 = -32, X1 = 32, Y0 = HEM_CUT - 3, Y1 = K.neck.y + 5, Z0 = -22, Z1 = 20;
const NX = Math.round((X1 - X0) / H) + 1, NY = Math.round((Y1 - Y0) / H) + 1, NZ = Math.round((Z1 - Z0) / H) + 1;
const gi = (i, j, k) => (k * NY + j) * NX + i;
const Fd = new Float32Array(NX * NY * NZ).fill(NaN);
{
  const p = new THREE.Vector3();
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    p.set(X0 + i * H, Y0 + j * H, Z0 + k * H);
    let best = null, bd = 1e9;
    for (const q of nearby(p, 4)) { const d = q.p.distanceToSquared(p); if (d < bd) { bd = d; best = q; } }
    if (!best || bd > 16) continue;
    const sign = best.n.dot(new THREE.Vector3().subVectors(p, best.p)) >= 0 ? 1 : -1;
    Fd[gi(i, j, k)] = sign * Math.sqrt(bd) - OFF;
  }
  // longe da pele: dentro ou fora? inunda a partir das bordas da grade
  const seen = new Uint8Array(Fd.length), queue = [];
  const tryPush = (i, j, k) => {
    if (i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ) return;
    const id = gi(i, j, k);
    if (seen[id]) return;
    const f = Fd[id];
    if (!(Number.isNaN(f) || f > 0)) return;
    seen[id] = 1; queue.push(id);
  };
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) { tryPush(0, j, k); tryPush(NX - 1, j, k); }
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { tryPush(i, 0, k); tryPush(i, NY - 1, k); }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { tryPush(i, j, 0); tryPush(i, j, NZ - 1); }
  while (queue.length) {
    const id = queue.pop();
    const i = id % NX, j = Math.floor(id / NX) % NY, k = Math.floor(id / (NX * NY));
    tryPush(i + 1, j, k); tryPush(i - 1, j, k); tryPush(i, j + 1, k); tryPush(i, j - 1, k); tryPush(i, j, k + 1); tryPush(i, j, k - 1);
  }
  for (let id = 0; id < Fd.length; id++) if (Number.isNaN(Fd[id])) Fd[id] = seen[id] ? 4 : -4;
  // caimento: da axila para baixo o tecido desce quase reto a partir do que está
  // acima (não acompanha a cintura nem o vão abaixo do peitoral)
  const ARMPIT = K.spine2.y + 1;
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    for (let j = NY - 2; j >= 0; j--) {
      if (Y0 + j * H > ARMPIT) continue;
      const up = Fd[gi(i, j + 1, k)] + H * 0.1;
      const id = gi(i, j, k);
      if (up < Fd[id]) Fd[id] = up;
    }
  }
}
// marching tetrahedra
const CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const TETS = [[0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6]];
const mcPos = [], mcIdx = [], edgeVert = new Map();
const gpos = (id) => new THREE.Vector3(X0 + (id % NX) * H, Y0 + (Math.floor(id / NX) % NY) * H, Z0 + Math.floor(id / (NX * NY)) * H);
function edgeVertex(a, b) {
  const key = a < b ? a * 1e7 + b : b * 1e7 + a;
  if (edgeVert.has(key)) return edgeVert.get(key);
  const fa = Fd[a], fb = Fd[b], t = fa / (fa - fb);
  const p = gpos(a).lerp(gpos(b), t);
  mcPos.push(p);
  edgeVert.set(key, mcPos.length - 1);
  return mcPos.length - 1;
}
function emit(a, b, c, insideIds, outsideIds) {
  // orienta para fora (do lado de dentro para o de fora)
  const A = mcPos[a], B = mcPos[b], C = mcPos[c];
  const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
  const out = new THREE.Vector3();
  for (const id of outsideIds) out.add(gpos(id));
  out.multiplyScalar(1 / outsideIds.length);
  const inn = new THREE.Vector3();
  for (const id of insideIds) inn.add(gpos(id));
  inn.multiplyScalar(1 / insideIds.length);
  if (n.dot(out.sub(inn)) < 0) mcIdx.push(a, c, b); else mcIdx.push(a, b, c);
}
for (let k = 0; k < NZ - 1; k++) for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
  const ids = CORNER.map(([a, b, c]) => gi(i + a, j + b, k + c));
  for (const tet of TETS) {
    const v = tet.map((c) => ids[c]);
    const ins = v.filter((id) => Fd[id] < 0), outs = v.filter((id) => Fd[id] >= 0);
    if (ins.length === 0 || ins.length === 4) continue;
    if (ins.length === 1 || ins.length === 3) {
      const lone = ins.length === 1 ? ins[0] : outs[0];
      const others = ins.length === 1 ? outs : ins;
      emit(edgeVertex(lone, others[0]), edgeVertex(lone, others[1]), edgeVertex(lone, others[2]), ins, outs);
    } else {
      const [i0, i1] = ins, [o0, o1] = outs;
      const a = edgeVertex(i0, o0), b = edgeVertex(i0, o1), c = edgeVertex(i1, o1), d = edgeVertex(i1, o0);
      emit(a, b, c, ins, outs); emit(a, c, d, ins, outs);
    }
  }
}
// simplifica: junta vértices numa grade de ~1 cm (tira as lascas dos tetraedros)
{
  const C = 1.0, cells = new Map(), acc = [], remap = new Int32Array(mcPos.length);
  mcPos.forEach((p, i) => {
    const k = `${Math.floor(p.x / C)},${Math.floor(p.y / C)},${Math.floor(p.z / C)}`;
    let id = cells.get(k);
    if (id === undefined) { id = acc.length; cells.set(k, id); acc.push({ s: new THREE.Vector3(), n: 0 }); }
    acc[id].s.add(p); acc[id].n++; remap[i] = id;
  });
  const seenTri = new Set(), idx = [];
  for (let t = 0; t < mcIdx.length; t += 3) {
    const a = remap[mcIdx[t]], b = remap[mcIdx[t + 1]], c = remap[mcIdx[t + 2]];
    if (a === b || b === c || a === c) continue;
    const key = [a, b, c].sort((x, y) => x - y).join('_');
    if (seenTri.has(key)) continue;
    seenTri.add(key); idx.push(a, b, c);
  }
  mcPos.length = 0;
  for (const o of acc) mcPos.push(o.s.multiplyScalar(1 / o.n));
  mcIdx.length = 0; mcIdx.push(...idx);
}
// suaviza (Laplace) para tirar o serrilhado da grade
{
  const nb = mcPos.map(() => new Set());
  for (let t = 0; t < mcIdx.length; t += 3) for (let e = 0; e < 3; e++) { const a = mcIdx[t + e], b = mcIdx[t + ((e + 1) % 3)]; nb[a].add(b); nb[b].add(a); }
  for (let it = 0; it < 4; it++) {
    const next = mcPos.map((p, i) => {
      if (!nb[i].size) return p.clone();
      const avg = new THREE.Vector3();
      for (const j of nb[i]) avg.add(mcPos[j]);
      return p.clone().lerp(avg.multiplyScalar(1 / nb[i].size), 0.5);
    });
    next.forEach((p, i) => mcPos[i].copy(p));
  }
}
// pesos: mistura dos pontos de pele mais próximos
const mcW = mcPos.map((p) => {
  const w = new Map();
  let near = nearby(p, 4).map((q) => [q, q.p.distanceTo(p)]).sort((a, b) => a[1] - b[1]).slice(0, 8);
  if (!near.length) near = [[S.reduce((b2, q) => (q.p.distanceTo(p) < b2.p.distanceTo(p) ? q : b2), S[0]), 1]];
  for (const [q, d] of near) { const f = 1 / (d + 0.4); for (const [kk, x] of q.w) w.set(kk, (w.get(kk) || 0) + x * f); }
  return w;
});
const mcGeo = new THREE.BufferGeometry();
mcGeo.setAttribute('position', new THREE.Float32BufferAttribute(mcPos.flatMap((p) => [p.x, p.y, p.z]), 3));
mcGeo.setIndex(mcIdx);
mcGeo.computeVertexNormals();
const tris = [];
{
  const N = mcGeo.attributes.normal;
  const V = (i) => ({ p: mcPos[i].clone(), n: new THREE.Vector3().fromBufferAttribute(N, i), w: mcW[i] });
  for (let t = 0; t < mcIdx.length; t += 3) {
    let poly = [V(mcIdx[t]), V(mcIdx[t + 1]), V(mcIdx[t + 2])];
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

// um pouco mais de folga na cintura e nas mangas
{
  const P = shirt.attributes.position, N = shirt.attributes.normal;
  const chestY = K.spine2.y - 4;
  for (let i = 0; i < P.count; i++) {
    const p = new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i));
    const waist = 1 - THREE.MathUtils.smoothstep(p.y, HEM_CUT, chestY);
    const t = Math.max(0, (Math.abs(p.x) - K.lArm.x) / ARM_LEN);
    const d = 0.7 * waist + 0.9 * THREE.MathUtils.smoothstep(t, 0.05, SLEEVE_T);
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
    const mid = addVert(p.clone().add(new THREE.Vector3(0, -4.5, 0)).addScaledVector(r, 0.2), wAt(shirt, i), 0);
    // embaixo: 65% quadril + 35% coxa do lado
    const side = p.x > 2 ? 'l' : p.x < -2 ? 'r' : null;
    const w = side ? [[HIPS, 0.65], [UPLEG[side], 0.35], [0, 0], [0, 0]] : [[HIPS, 0.8], [UPLEG.l, 0.1], [UPLEG.r, 0.1], [0, 0]];
    const bot = addVert(p.clone().add(new THREE.Vector3(0, -9, 0)).addScaledVector(r, 0.5), w, 0);
    return [mid, bot];
  });
  const [am, ab] = mk(a), [bm, bb] = mk(b);
  extra.idx.push(b, a, am, b, am, bm, bm, am, ab, bm, ab, bb);
}
// gola: contorno do pescoço ordenado, reamostrado e suavizado; pé sobe e a aba
// dobra para fora; abre na frente (carcela), com pontas
{
  const next = new Map();
  for (const [a, b] of neckEdges) next.set(a, b);
  // maior laço fechado
  let loop = [];
  const used = new Set();
  for (const start of next.keys()) {
    if (used.has(start)) continue;
    const l = [];
    let cur = start, guard = 0;
    while (cur !== undefined && !used.has(cur) && guard++ < 5000) { used.add(cur); l.push(cur); cur = next.get(cur); }
    if (l.length > loop.length) loop = l;
  }
  const pts = loop.map((i) => vAt(shirt, i));
  // ângulo em volta do pescoço (0 = frente) e ordenação por ângulo
  const angOf = (p) => Math.atan2(p.x, p.z - NECK_C.y);
  const order = pts.map((p, k) => [angOf(p), k]).sort((a, b) => a[0] - b[0]);
  const M = 72, OPEN = 14 * (Math.PI / 180);
  const samples = [];
  for (let m = 0; m <= M; m++) {
    // de +OPEN (lado esquerdo da frente) passando pelas costas até -OPEN
    const a = OPEN + (m / M) * (2 * Math.PI - 2 * OPEN);
    const ang = a > Math.PI ? a - 2 * Math.PI : a;
    // ponto do contorno mais próximo nesse ângulo (média dos 3 vizinhos)
    let best = 0, bd = 1e9;
    order.forEach(([oa], k) => { const d = Math.abs(Math.atan2(Math.sin(oa - ang), Math.cos(oa - ang))); if (d < bd) { bd = d; best = k; } });
    const avg = new THREE.Vector3();
    for (let o = -2; o <= 2; o++) avg.add(pts[order[(best + o + order.length) % order.length][1]]);
    avg.multiplyScalar(1 / 5);
    samples.push({ p: avg, w: wAt(shirt, loop[order[best][1]]), ang });
  }
  // suaviza a altura/raio ao longo da gola
  for (let it = 0; it < 3; it++) {
    const cp = samples.map((s) => s.p.clone());
    for (let m = 1; m < samples.length - 1; m++) samples[m].p.copy(cp[m - 1]).add(cp[m]).add(cp[m + 1]).multiplyScalar(1 / 3);
  }
  const rows = samples.map((s) => {
    const r = new THREE.Vector3(s.p.x, 0, s.p.z - NECK_C.y).normalize();
    const front = Math.abs(s.ang) * (180 / Math.PI); // 14 (ponta) .. 180 (nuca)
    const tip = 1 - THREE.MathUtils.smoothstep(front, 14, 50); // 1 nas pontas da frente
    const base = s.p.clone().add(new THREE.Vector3(0, -0.2, 0));
    const T = s.p.clone().add(new THREE.Vector3(0, 2.4 - 0.8 * tip, 0)).addScaledVector(r, 0.25);
    const F = T.clone().add(new THREE.Vector3(0, -2.9 - 1.6 * tip, 0)).addScaledVector(r, 1.5 + 0.7 * tip);
    return [addVert(base, s.w, 1), addVert(T, s.w, 1), addVert(F, s.w, 1)];
  });
  for (let m = 0; m < rows.length - 1; m++) {
    const [a0, aT, aF] = rows[m], [b0, bT, bF] = rows[m + 1];
    extra.idx.push(a0, b0, bT, a0, bT, aT, aT, bT, bF, aT, bF, aF);
  }
}

// junta tudo numa malha só (part: 0 tecido, 1 gola)
const P0 = shirt.attributes.position.array, SI0 = shirt.attributes.skinIndex.array, SW0 = shirt.attributes.skinWeight.array;
const nV = baseCount + extra.part.length;
const shirtPos = new Float32Array(nV * 3), shirtSI = new Uint8Array(nV * 4), shirtSW = new Uint8Array(nV * 4), shirtPart = new Uint8Array(nV);
shirtPos.set(P0); shirtPos.set(extra.pos, baseCount * 3);
for (let i = 0; i < baseCount * 4; i++) { shirtSI[i] = SI0[i]; shirtSW[i] = Math.round(SW0[i] * 255); }
for (let i = 0; i < extra.si.length; i++) { shirtSI[baseCount * 4 + i] = extra.si[i]; shirtSW[baseCount * 4 + i] = Math.round(extra.sw[i] * 255); }
shirtPart.set(extra.part, baseCount);
const shirtIdx = (nV < 65536 ? Uint16Array : Uint32Array).from([...shirt.index.array, ...extra.idx]);

// ---------- corpo para profundidade (sem normais) ----------
const bodyPos = new Float32Array(body.attributes.position.array);
const bodySI = Uint8Array.from(body.attributes.skinIndex.array);
const bodySW = Uint8Array.from(body.attributes.skinWeight.array, (v) => Math.round(v * 255));
const bodyIdx = (body.attributes.position.count < 65536 ? Uint16Array : Uint32Array).from(body.index.array);

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
      hemCut: HEM_CUT, hemBottom: HEM_CUT - 9, neckY: K.neck.y, neckZ: NECK_C.y, chestY: K.spine2.y,
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
