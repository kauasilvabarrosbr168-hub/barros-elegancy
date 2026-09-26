import * as THREE from 'three';

// Cenário em linhas finas. Quadra de tênis -> arquitetura/escritório/cidade.
function subdiv(out, a, b, step = 0.6) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const n = Math.max(1, Math.round(d / step));
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    out.push([
      [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[2] + (b[2] - a[2]) * t0],
      [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, a[2] + (b[2] - a[2]) * t1],
    ]);
  }
}

function court() {
  const s = [];
  const L = (a, b, st) => subdiv(s, a, b, st);
  const X2 = 5.485, X1 = 4.115;
  L([-X2, 0, 0], [X2, 0, 0]); // linha de base
  L([0, 0, 0], [0, 0, 0.22]); // marca central
  for (const x of [-X2, -X1, X1, X2]) L([x, 0, 0], [x, 0, 11.885]);
  L([-X1, 0, 6.4], [X1, 0, 6.4]); // linha de saque
  L([0, 0, 6.4], [0, 0, 11.885]);
  // alambrado ao fundo
  for (let x = -10; x <= 10.01; x += 2.5) L([x, 0, -6.5], [x, 3.4, -6.5], 0.7);
  for (const y of [0.02, 1.1, 3.4]) L([-10, y, -6.5], [10, y, -6.5], 0.8);
  // laterais do alambrado
  for (const x of [-10, 10]) { L([x, 3.4, -6.5], [x, 3.4, 4], 0.8); L([x, 0.02, -6.5], [x, 0.02, 4], 0.8); }
  // área de fundo
  L([-X2, 0, -3.2], [X2, 0, -3.2], 0.8);
  return s;
}

function office() {
  const s = [];
  const L = (a, b, st) => subdiv(s, a, b, st);
  // piso em placas
  for (let x = -6; x <= 6.01; x += 1.5) L([x, 0, -5], [x, 0, 6]);
  for (let z = -5; z <= 6.01; z += 1.5) L([-6, 0, z], [6, 0, z]);
  // fachada de vidro
  for (let x = -9; x <= 9.01; x += 1.5) L([x, 0, -5], [x, 4.4, -5], 0.7);
  for (const y of [0.02, 2.9, 4.4]) L([-9, y, -5], [9, y, -5], 0.8);
  // forro
  for (let x = -6; x <= 6.01; x += 3) L([x, 4.4, -5], [x, 4.4, 6], 0.8);
  // mesa de reunião / café
  const tx = 1.7, tz = 1.9, ty = 0.75, w = 0.8, d = 0.5;
  L([tx - w, ty, tz - d], [tx + w, ty, tz - d], 0.3); L([tx - w, ty, tz + d], [tx + w, ty, tz + d], 0.3);
  L([tx - w, ty, tz - d], [tx - w, ty, tz + d], 0.3); L([tx + w, ty, tz - d], [tx + w, ty, tz + d], 0.3);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) L([tx + a * (w - 0.08), 0, tz + b * (d - 0.08)], [tx + a * (w - 0.08), ty, tz + b * (d - 0.08)], 0.3);
  // xícara
  for (let i = 0; i < 10; i++) {
    const a0 = (i / 10) * Math.PI * 2, a1 = ((i + 1) / 10) * Math.PI * 2;
    L([tx - 0.3 + Math.cos(a0) * 0.045, ty + 0.09, tz + Math.sin(a0) * 0.045], [tx - 0.3 + Math.cos(a1) * 0.045, ty + 0.09, tz + Math.sin(a1) * 0.045], 1);
  }
  // cadeiras
  for (const cx of [tx - 0.5, tx + 0.5]) {
    const cz = tz + 0.95;
    L([cx - 0.22, 0.46, cz - 0.2], [cx + 0.22, 0.46, cz - 0.2], 0.3); L([cx - 0.22, 0.46, cz + 0.2], [cx + 0.22, 0.46, cz + 0.2], 0.3);
    L([cx - 0.22, 0.46, cz + 0.2], [cx - 0.22, 0.95, cz + 0.24], 0.3); L([cx + 0.22, 0.46, cz + 0.2], [cx + 0.22, 0.95, cz + 0.24], 0.3);
    L([cx - 0.22, 0.95, cz + 0.24], [cx + 0.22, 0.95, cz + 0.24], 0.3);
    L([cx, 0, cz], [cx, 0.46, cz], 0.3);
  }
  // luminárias pendentes
  for (const [lx, lz] of [[1.2, 1.9], [2.2, 1.9]]) {
    L([lx, 4.4, lz], [lx, 2.3, lz], 0.7);
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
      L([lx + Math.cos(a0) * 0.16, 2.3, lz + Math.sin(a0) * 0.16], [lx + Math.cos(a1) * 0.16, 2.3, lz + Math.sin(a1) * 0.16], 1);
    }
  }
  // skyline
  let x = -16;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  while (x < 16) {
    const bw = 1.2 + rnd() * 2.2, bh = 3 + rnd() * 9;
    L([x, 0, -16], [x, bh, -16], 1.2); L([x, bh, -16], [x + bw, bh, -16], 1.2); L([x + bw, bh, -16], [x + bw, 0, -16], 1.2);
    x += bw + 0.3 + rnd() * 0.8;
  }
  return s;
}

const VERT = /* glsl */ `
attribute vec3 aB;
attribute float aRnd;
uniform float uMorph, uOpacity;
varying float vAlpha;
varying float vGold;
void main() {
  float m = smoothstep(aRnd * 0.55, aRnd * 0.55 + 0.45, uMorph);
  vec3 p = mix(position, aB, m);
  p.y += sin(m * 3.14159) * (0.4 + aRnd * 0.9);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  float fog = 1.0 - smoothstep(4.0, 20.0, dist);
  float mid = 1.0 - sin(m * 3.14159) * 0.6;
  vAlpha = fog * mid * uOpacity;
  vGold = 1.0 - m;
}`;
const FRAG = /* glsl */ `
varying float vAlpha;
varying float vGold;
void main() {
  vec3 gold = vec3(0.83, 0.68, 0.42);
  vec3 white = vec3(0.75, 0.74, 0.72);
  gl_FragColor = vec4(mix(white, gold, vGold * 0.8) * vAlpha * 0.26, 1.0);
}`;

export function makeWorld() {
  const A = court(), B = office();
  const n = Math.max(A.length, B.length);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pad = (arr, from) => {
    while (arr.length < n) {
      const src = from[Math.floor(rnd() * from.length)];
      const p = src[Math.floor(rnd() * 2)];
      arr.push([p, p]); // segmento degenerado: "nasce" de um ponto
    }
  };
  pad(A, A); pad(B, B);
  const pos = new Float32Array(n * 6), posB = new Float32Array(n * 6), rr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const r = rnd();
    for (let v = 0; v < 2; v++) {
      pos.set(A[i][v], i * 6 + v * 3);
      posB.set(B[i][v], i * 6 + v * 3);
      rr[i * 2 + v] = r;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aB', new THREE.BufferAttribute(posB, 3));
  g.setAttribute('aRnd', new THREE.BufferAttribute(rr, 1));
  const uniforms = { uMorph: { value: 0 }, uOpacity: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  return { object: lines, uniforms };
}

// Bola de tênis + rastro
const BALL_VERT = /* glsl */ `
attribute float aAge;
uniform float uPix, uOpacity;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vA = (1.0 - aAge) * uOpacity;
  gl_PointSize = uPix * (aAge < 0.01 ? 9.0 : 5.0 * (1.0 - aAge)) * (3.0 / -mv.z);
}`;
const BALL_FRAG = /* glsl */ `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.78) * a * vA, 1.0);
}`;

export function makeBall() {
  const TRAIL = 14;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(TRAIL * 3), age = new Float32Array(TRAIL);
  for (let i = 0; i < TRAIL; i++) age[i] = i / TRAIL;
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
  const uniforms = { uPix: { value: Math.min(window.devicePixelRatio || 1, 2) }, uOpacity: { value: 0 } };
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    vertexShader: BALL_VERT, fragmentShader: BALL_FRAG, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false;
  const hist = [];
  return {
    object: pts, uniforms,
    set(p) {
      hist.unshift(p.clone());
      if (hist.length > TRAIL) hist.pop();
      for (let i = 0; i < TRAIL; i++) {
        const h = hist[Math.min(i, hist.length - 1)];
        pos[i * 3] = h.x; pos[i * 3 + 1] = h.y; pos[i * 3 + 2] = h.z;
      }
      g.attributes.position.needsUpdate = true;
    },
    reset() { hist.length = 0; },
  };
}
