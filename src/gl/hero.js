import * as THREE from 'three';

const VERT = /* glsl */ `
attribute vec3 aStart;
attribute vec2 aTarget;
attribute vec4 aRnd; // x: seed, y: tamanho, z: poeira(0/1), w: atraso
uniform float uTime, uIntro, uScatter, uScale, uPix;
uniform vec2 uOffset;
varying float vAlpha;
varying float vHot;
void main() {
  float k = clamp((uIntro - aRnd.w * 0.5) / 0.5, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - k, 3.0);
  vec3 target = vec3(aTarget * uScale + uOffset, 0.0);
  vec3 p = mix(aStart, target, e);
  p.xy += vec2(sin(uTime * 0.7 + aRnd.x * 40.0), cos(uTime * 0.6 + aRnd.x * 31.0)) * 0.004 * uScale;

  vec3 dir = normalize(vec3(aTarget * 2.0, 0.4) + (aRnd.xyz - 0.5) * 0.9);
  float s = uScatter * uScatter;
  p += dir * s * (1.4 + aRnd.x * 2.6) * uScale;
  p.y += s * (0.4 + aRnd.y) * 0.6 * uScale;

  vec3 dust = aStart + vec3(sin(uTime * 0.07 + aRnd.x * 6.28) * 0.35, sin(uTime * 0.05 + aRnd.x * 9.0) * 0.25 + uScatter * 0.8, 0.0);
  p = mix(p, dust, aRnd.z);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float travel = (1.0 - aRnd.z) * (0.25 + 0.5 * smoothstep(0.0, 0.2, k));
  float settle = mix(1.0, 0.16, smoothstep(0.85, 1.0, k) * smoothstep(0.55, 1.0, uIntro));
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.2 + aRnd.x * 2.0) + aRnd.x * 50.0);
  vAlpha = mix(travel * settle, 0.22 * twinkle * smoothstep(0.0, 0.4, uIntro), aRnd.z) * (1.0 - smoothstep(0.1, 0.95, uScatter) * (1.0 - aRnd.z * 0.6));
  vHot = (1.0 - aRnd.z) * smoothstep(0.75, 0.95, k) * (1.0 - smoothstep(0.95, 1.0, uIntro));
  gl_PointSize = aRnd.y * uPix * (1.0 + vHot) * (6.0 / -mv.z);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
varying float vHot;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  vec3 col = mix(uColor, vec3(1.0, 0.95, 0.85), vHot * 0.7 + a * a * 0.3);
  gl_FragColor = vec4(col * a * vAlpha, 1.0);
}`;

function sampleLogo(img, count) {
  const w = 220, h = Math.round((img.naturalHeight / img.naturalWidth) * w);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const fill = [], edge = [];
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (A(x, y) < 140) continue;
    const isEdge = A(x - 1, y) < 140 || A(x + 1, y) < 140 || A(x, y - 1) < 140 || A(x, y + 1) < 140;
    (isEdge ? edge : fill).push([x, y]);
  }
  const pts = [];
  for (let i = 0; i < count; i++) {
    const src = Math.random() < 0.55 && edge.length ? edge : fill;
    const [x, y] = src[(Math.random() * src.length) | 0];
    pts.push([(x + Math.random()) / w - 0.5, -((y + Math.random()) / w - (h / w) * 0.5)]);
  }
  return pts;
}

export class HeroView {
  constructor(el, logoEl, logoImg, { quality }) {
    this.el = el;
    this.logoEl = logoEl;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    this.camera.position.set(0, 0, 6);
    this.progress = 0;
    this.introStart = -1;

    const N = quality === 'high' ? 5200 : quality === 'mid' ? 3400 : 2000;
    const DUST = Math.round(N * 0.18);
    const logoPts = sampleLogo(logoImg, N - DUST);
    const start = new Float32Array(N * 3), target = new Float32Array(N * 2), rnd = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const dust = i >= N - DUST;
      const a = Math.random() * Math.PI * 2, r = dust ? 0.6 + Math.random() * 3.2 : 1.6 + Math.random() * 3.5;
      start[i * 3] = Math.cos(a) * r * 1.4;
      start[i * 3 + 1] = Math.sin(a) * r * 0.8;
      start[i * 3 + 2] = dust ? (Math.random() - 0.5) * 2 : -1 - Math.random() * 3;
      if (!dust) { target[i * 2] = logoPts[i][0]; target[i * 2 + 1] = logoPts[i][1]; }
      rnd[i * 4] = Math.random();
      rnd[i * 4 + 1] = dust ? 1.2 + Math.random() * 2.2 : 1.1 + Math.random() * 2.4;
      rnd[i * 4 + 2] = dust ? 1 : 0;
      rnd[i * 4 + 3] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
    g.setAttribute('aTarget', new THREE.BufferAttribute(target, 2));
    g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
    this.uniforms = {
      uTime: { value: 0 }, uIntro: { value: 0 }, uScatter: { value: 0 }, uScale: { value: 1 },
      uOffset: { value: new THREE.Vector2() }, uPix: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uColor: { value: new THREE.Color(0xd9b574) },
    };
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  start(time, instant = false) { this.introStart = instant ? time - 10 : time; }

  update(dt, time, rect) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uIntro.value = this.introStart < 0 ? 0 : Math.min(1, (time - this.introStart) / 2.8);
    u.uScatter.value = this.progress;
    const visH = 2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.camera.position.z;
    const k = visH / rect.height;
    const lr = this.logoEl.getBoundingClientRect();
    u.uScale.value = lr.width * k;
    u.uOffset.value.set(
      (lr.left + lr.width / 2 - (rect.left + rect.width / 2)) * k,
      -(lr.top + lr.height / 2 - (rect.top + rect.height / 2)) * k,
    );
    this.skip = this.progress >= 0.999;
  }
}
