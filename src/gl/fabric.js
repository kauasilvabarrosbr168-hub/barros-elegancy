import * as THREE from 'three';

const VERT = /* glsl */ `
uniform float uTime, uHead, uLen, uWidth, uX, uR, uDepth, uDir, uSeed;
varying vec3 vN;
varying vec3 vT;
varying vec3 vPos;
varying float vB;
varying float vA;

vec3 pathP(float u) {
  float w = smoothstep(0.3, 0.7, u);
  float ang = 6.2831853 * w;
  float s = 2.0 * u - 1.0;
  float xl = uX * sign(s) * pow(abs(s), 1.7);
  float straight = 1.0 - sin(3.14159 * w);
  vec3 p = vec3(xl + uR * sin(ang) * 1.12, uR * cos(ang), uDepth * sin(ang));
  p.y += sin(u * 8.0 + uTime * 0.55 + uSeed) * 0.16 * straight;
  p.z += cos(u * 6.0 + uTime * 0.45 + uSeed) * 0.22;
  return vec3(p.x * uDir, p.y * uDir, p.z);
}

vec3 surface(float a, float b, out vec3 T) {
  float u = uHead - (1.0 - a) * uLen;
  vec3 P = pathP(u);
  T = normalize(pathP(u + 0.003) - pathP(u - 0.003));
  vec3 N0 = normalize(cross(vec3(0.0, 0.0, 1.0), T));
  vec3 B0 = cross(T, N0);
  float tw = 1.15 + 0.85 * sin(u * 5.0 + uTime * 0.4 + uSeed) + 0.6 * sin(u * 13.0 - uTime * 0.3);
  vec3 W = cos(tw) * N0 + sin(tw) * B0;
  vec3 Nrm = cross(T, W);
  float width = uWidth * (0.3 + 0.7 * smoothstep(0.0, 0.3, a)) * (0.6 + 0.4 * smoothstep(1.0, 0.85, a));
  float fold = sin(b * 6.2831 + u * 26.0 + uTime * 0.9 + uSeed) * 0.035
             + sin(u * 57.0 - uTime * 1.4) * 0.014 * (1.0 - a * 0.5)
             + sin(b * 15.0 + u * 11.0) * 0.008;
  return P + W * (b - 0.5) * width + Nrm * fold;
}

void main() {
  float a = uv.x, b = uv.y;
  vec3 T, Tx, Ty;
  vec3 p = surface(a, b, T);
  vec3 px = surface(a + 0.004, b, Tx);
  vec3 py = surface(a, b + 0.02, Ty);
  vN = normalize(cross(px - p, py - p));
  vT = T;
  vB = b; vA = a;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */ `
uniform vec3 uBase, uSpec;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vT;
varying vec3 vPos;
varying float vB;
varying float vA;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(cameraPosition - vPos);
  vec3 L1 = normalize(vec3(0.25, 0.85, 0.55));
  vec3 L2 = normalize(vec3(-0.8, -0.25, 0.35));
  float dif = max(dot(n, L1), 0.0) * 0.85 + max(dot(n, L2), 0.0) * 0.22;
  vec3 T = normalize(vT);
  vec3 H = normalize(L1 + V);
  float th = dot(T, H);
  float sinTH = sqrt(max(0.0, 1.0 - th * th));
  float spec = pow(sinTH, 140.0) * 1.1 + pow(sinTH, 18.0) * 0.06;
  float fres = pow(1.0 - abs(dot(n, V)), 3.0);
  vec3 col = uBase * (0.16 + dif) + uSpec * spec * (0.25 + dif) + uSpec * fres * 0.07;
  float spot = 1.0 - smoothstep(1.8, 6.5, length(vPos.xy)) * 0.7;
  float edge = smoothstep(0.0, 0.035, vB) * smoothstep(1.0, 0.965, vB) * smoothstep(0.0, 0.05, vA);
  gl_FragColor = vec4(col * spot, uOpacity * edge);
}`;

export class Fabric {
  constructor({ quality, color, dir, seed }) {
    const segA = quality === 'low' ? 150 : 260, segB = quality === 'low' ? 14 : 26;
    const g = new THREE.PlaneGeometry(1, 1, segA, segB);
    // uv.x = ao longo do tecido, uv.y = largura
    this.uniforms = {
      uTime: { value: 0 }, uHead: { value: -1 }, uLen: { value: 0.62 }, uWidth: { value: 1.15 },
      uX: { value: 6 }, uR: { value: 1.55 }, uDepth: { value: 1.1 }, uDir: { value: dir }, uSeed: { value: seed },
      uBase: { value: new THREE.Color(color === 'black' ? 0x050506 : 0xd9d5cd) },
      uSpec: { value: new THREE.Color(color === 'black' ? 0x57534d : 0x5d5a55) },
      uOpacity: { value: 1 },
    };
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      side: THREE.DoubleSide, transparent: true,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
  }

  set(head, time, visW) {
    const u = this.uniforms;
    u.uHead.value = head;
    u.uTime.value = time;
    u.uX.value = Math.max(4.2, visW * 0.75);
    // em telas estreitas o laço encolhe junto com a peça
    const r = Math.min(1.55, Math.max(0.8, visW * 0.44));
    u.uR.value = r;
    u.uWidth.value = 1.15 * (0.55 + 0.45 * (r / 1.55));
    u.uDepth.value = 1.1 * (r / 1.55);
    this.mesh.visible = head > 0.001 && head - u.uLen.value < 1.2;
  }
}

// Limbo: círculo de luz suave atrás da peça + reflexo no "chão".
const LIMBO_FRAG = /* glsl */ `
uniform float uIntensity;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  float d = length(c) * 2.0;
  float disc = smoothstep(1.0, 0.0, d);
  float core = smoothstep(0.62, 0.0, d);
  float ring = smoothstep(0.03, 0.0, abs(d - 0.8)) * 0.18;
  float a = (disc * disc * 0.55 + core * 0.2 + ring) * uIntensity;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
const FLOOR_FRAG = /* glsl */ `
uniform float uIntensity;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 c = (vUv - 0.5) * vec2(1.0, 3.2);
  float d = length(c) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  gl_FragColor = vec4(uColor * a * a * uIntensity, 1.0);
}`;
const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export function makeLimbo() {
  const group = new THREE.Group();
  const mk = (frag, color) => new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT, fragmentShader: frag,
    uniforms: { uIntensity: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mk(LIMBO_FRAG, 0x3a3834));
  disc.scale.set(4.4, 4.4, 1);
  disc.position.z = -1.6;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mk(FLOOR_FRAG, 0x6d5a3c));
  floor.scale.set(3.4, 1.1, 1);
  floor.position.set(0, -1.3, -0.4);
  group.add(disc, floor);
  group.setIntensity = (v) => { disc.material.uniforms.uIntensity.value = v; floor.material.uniforms.uIntensity.value = v * 0.8; };
  return group;
}
