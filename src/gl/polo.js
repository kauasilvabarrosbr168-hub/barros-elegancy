import * as THREE from 'three';
import { CONFIG } from '../config.js';

export const POLO_H = 2.1; // altura da peça em unidades de cena
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const norm360 = (a) => ((a % 360) + 360) % 360;

// ------------------------------------------------------------
// Carregamento: tenta o .glb; se não existir, usa os mockups.
// ------------------------------------------------------------
async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    const type = r.headers.get('content-type') || '';
    return r.ok && !type.includes('text/html');
  } catch { return false; }
}

export async function loadPoloAssets(renderer, quality) {
  const m = CONFIG.modelos;
  const [hasPreta, hasBranca, hasUnico] = await Promise.all([exists(m.preta), exists(m.branca), exists(m.unico)]);
  if ((hasPreta && hasBranca) || hasUnico) {
    try {
      return await loadModels(renderer, quality, hasPreta && hasBranca ? { preta: m.preta, branca: m.branca } : { unico: m.unico });
    } catch (err) {
      console.warn('[BARROS] Falha ao carregar o .glb, usando os mockups.', err);
    }
  }
  return loadImages(renderer);
}

async function loadImages(renderer) {
  const loader = new THREE.TextureLoader();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const out = { kind: 'image', tex: {} };
  const jobs = [];
  for (const cor of ['preta', 'branca']) {
    out.tex[cor] = {};
    for (const v of ['frente', '34', 'costas']) {
      jobs.push(loader.loadAsync(`/img/polo-${cor}-${v}.webp`).then((t) => {
        t.anisotropy = Math.min(8, aniso);
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        out.tex[cor][v] = t;
      }));
    }
  }
  await Promise.all(jobs);
  out.spin = await loadSpins();
  return out;
}

// Giro contínuo: quadros gerados por scripts/prepare-spin.mjs a partir de um vídeo 360°.
// Carrega primeiro 1 a cada 6 quadros (o giro já funciona) e depois completa o resto.
export async function loadSpins() {
  let manifest = null;
  try {
    const r = await fetch('/img/giro/manifest.json', { cache: 'no-cache' });
    if (r.ok && !(r.headers.get('content-type') || '').includes('text/html')) manifest = await r.json();
  } catch { /* sem giro: usa as vistas */ }
  const spin = {};
  if (!manifest) return spin;
  for (const [cor, info] of Object.entries(manifest)) {
    const frames = new Array(info.frames).fill(null);
    const load = (k) => new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => { (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => { frames[k] = img; resolve(); }); };
      img.onerror = () => resolve();
      img.src = `/img/giro/${cor}/${String(k).padStart(2, '0')}.webp`;
    });
    const first = [], rest = [];
    for (let k = 0; k < info.frames; k++) (k % 6 === 0 ? first : rest).push(k);
    await Promise.all(first.map(load));
    Promise.all(rest.map(load));
    spin[cor] = { frames, width: info.width, height: info.height, axisX: info.axisX ?? 0.5 };
  }
  return spin;
}

// quadro carregado mais próximo de k
function nearestFrame(frames, k) {
  const N = frames.length;
  for (let d = 0; d <= N / 2; d++) {
    if (frames[(k + d) % N]) return (k + d) % N;
    if (frames[(k - d + N) % N]) return (k - d + N) % N;
  }
  return -1;
}

async function loadModels(renderer, quality, files) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');
  const { MeshoptDecoder } = await import('three/examples/jsm/libs/meshopt_decoder.module.js');
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('/draco/');
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  const out = { kind: 'model', scenes: {}, env: null };
  const entries = Object.entries(files);
  const results = await Promise.all(entries.map(([, url]) => loader.loadAsync(url)));
  entries.forEach(([k], i) => { out.scenes[k] = results[i].scene; });
  if (quality !== 'low') {
    const pmrem = new THREE.PMREMGenerator(renderer);
    out.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }
  return out;
}

// ------------------------------------------------------------
// Base comum: giro com inércia, troca de cor, revelação.
// ------------------------------------------------------------
class PoloBase {
  constructor() {
    this.group = new THREE.Group();
    this.pivot = new THREE.Group();
    this.group.add(this.pivot);
    this.angle = 0;
    this.vel = 0;
    this.dragging = false;
    this.drive = null; // ângulo imposto (ex.: capítulo de detalhes)
    this.color = 'preta';
    this.colorMix = 0; // 0 = preta, 1 = branca
    this.swap = 1; // progresso da transição de cor (0..1)
    this.reveal = 1;
    this.light = 1;
    this.snapAngles = null;
  }

  dragBy(dx) { this.angle += dx; this.vel = dx / (1 / 60); }
  startDrag() { this.dragging = true; this.vel = 0; }
  endDrag() { this.dragging = false; this.vel = Math.max(-240, Math.min(240, this.vel)); }

  setColor(id, instant = false) {
    if (id === this.color && !instant) return;
    this.prevColor = instant ? id : this.color;
    this.color = id;
    if (instant) { this.colorMix = id === 'branca' ? 1 : 0; this.swap = 1; return; }
    this.swap = 0;
  }

  step(dt) {
    if (this.drive != null) {
      // caminho mais curto até o ângulo pedido (no giro por quadros, até o quadro mais próximo)
      const goal = this.snapStep ? Math.round(this.drive / this.snapStep) * this.snapStep : this.drive;
      const diff = ((goal - this.angle + 540) % 360) - 180;
      this.angle += diff * (1 - Math.exp(-5 * dt));
      this.vel = 0;
    } else if (!this.dragging) {
      this.angle += this.vel * dt;
      this.vel *= Math.exp(-5 * dt);
      if ((this.snapAngles || this.snapStep) && Math.abs(this.vel) < 30) {
        const a = norm360(this.angle);
        let bd = 999;
        if (this.snapStep) bd = Math.round(a / this.snapStep) * this.snapStep - a;
        else for (const s of this.snapAngles) {
          const d = ((s - a + 540) % 360) - 180;
          if (Math.abs(d) < Math.abs(bd)) bd = d;
        }
        this.angle += bd * (1 - Math.exp(-(this.snapStep ? 6 : 3) * dt));
      }
    }
    const targetMix = this.color === 'branca' ? 1 : 0;
    this.colorMix = damp(this.colorMix, targetMix, 5.5, dt);
    this.swap = Math.min(1, this.swap + dt / 1.1);
  }
}

// ------------------------------------------------------------
// Modo imagem: planos com as fotos, levemente curvados.
// ------------------------------------------------------------
const IMG_VERT = /* glsl */ `
uniform float uBend;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  p.z -= uBend * p.x * p.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const IMG_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uOpacity, uReveal, uSweep, uLight;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vUv);
  vec2 c = (vUv - vec2(0.5, 0.64)) * vec2(1.0, 0.8);
  float r = length(c);
  float R = uReveal * 1.1;
  float rev = smoothstep(R, R - 0.32, r);
  float lum = dot(t.rgb, vec3(0.299, 0.587, 0.114));
  vec3 col = t.rgb * rev * uLight;
  float band = exp(-pow((vUv.x + (1.0 - vUv.y) * 0.4 - uSweep) * 6.0, 2.0));
  col += band * (0.05 + lum * 0.22) * rev * uLight;
  gl_FragColor = vec4(col, t.a * uOpacity * smoothstep(0.0, 0.25, rev + 0.001));
}`;

// mistura de dois quadros vizinhos do giro
const SPIN_FRAG = /* glsl */ `
uniform sampler2D mapA, mapB;
uniform float uMix, uOpacity, uReveal, uSweep, uLight;
varying vec2 vUv;
void main() {
  vec4 t = mix(texture2D(mapA, vUv), texture2D(mapB, vUv), uMix);
  vec2 c = (vUv - vec2(0.5, 0.64)) * vec2(1.0, 0.8);
  float r = length(c);
  float R = uReveal * 1.1;
  float rev = smoothstep(R, R - 0.32, r);
  float lum = dot(t.rgb, vec3(0.299, 0.587, 0.114));
  vec3 col = t.rgb * rev * uLight;
  float band = exp(-pow((vUv.x + (1.0 - vUv.y) * 0.4 - uSweep) * 6.0, 2.0));
  col += band * (0.05 + lum * 0.22) * rev * uLight;
  gl_FragColor = vec4(col, t.a * uOpacity * smoothstep(0.0, 0.25, rev + 0.001));
}`;

const VIEWS = [
  { id: 'frente', angle: 0 },
  { id: '34', angle: 40 },
  { id: 'costas', angle: 180 },
];
const VIEW_ANGLES = VIEWS.map((v) => v.angle);

function frameTexture() {
  const t = new THREE.Texture();
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

export class ImagePolo extends PoloBase {
  constructor(assets) {
    super();
    this.kind = 'image';
    this.snapAngles = VIEW_ANGLES;
    this.sweep = -1;
    this.planes = {};
    this.detail = false; // nos detalhes mostra o mockup 3/4 (mais nítido que o vídeo)
    this.detailMix = 0;
    for (const cor of ['preta', 'branca']) {
      for (const v of VIEWS) {
        const tex = assets.tex[cor][v.id];
        const w = POLO_H * (tex.image.width / tex.image.height);
        const mat = new THREE.ShaderMaterial({
          vertexShader: IMG_VERT, fragmentShader: IMG_FRAG,
          uniforms: {
            map: { value: tex }, uOpacity: { value: 0 }, uReveal: { value: 1 },
            uSweep: { value: -1 }, uLight: { value: 1 }, uBend: { value: 0.12 },
          },
          transparent: true, depthWrite: false,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, POLO_H, 28, 28), mat);
        mesh.userData = { w, cor, view: v };
        this.pivot.add(mesh);
        this.planes[`${cor}-${v.id}`] = mesh;
      }
    }
    // giro contínuo (quando houver vídeo processado para a cor)
    this.spin = {};
    for (const [cor, info] of Object.entries(assets.spin || {})) {
      const w = POLO_H * (info.width / info.height);
      const texA = frameTexture(), texB = frameTexture();
      const mat = new THREE.ShaderMaterial({
        vertexShader: IMG_VERT, fragmentShader: SPIN_FRAG,
        uniforms: {
          mapA: { value: texA }, mapB: { value: texB }, uMix: { value: 0 },
          uOpacity: { value: 0 }, uReveal: { value: 1 }, uSweep: { value: -1 }, uLight: { value: 1 }, uBend: { value: 0 },
        },
        transparent: true, depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, POLO_H), mat);
      this.pivot.add(mesh);
      this.spin[cor] = { frames: info.frames, mesh, tex: [texA, texB] };
    }
  }

  // coloca os quadros i0 e i1 nas duas texturas, reaproveitando o que já foi enviado à GPU
  setFrames(s, i0, i1, f) {
    const want = [s.frames[i0], s.frames[i1]];
    let [ta, tb] = s.tex;
    if (tb.image === want[0] || ta.image === want[1]) [ta, tb] = [tb, ta];
    if (ta.image !== want[0]) { ta.image = want[0]; ta.needsUpdate = true; }
    if (tb.image !== want[1]) { tb.image = want[1]; tb.needsUpdate = true; }
    const u = s.mesh.material.uniforms;
    u.mapA.value = ta; u.mapB.value = tb;
    // mistura só perto da troca de quadro: a peça fica nítida quase o tempo todo
    u.uMix.value = THREE.MathUtils.smoothstep(f, 0.42, 0.58);
  }

  update(dt) {
    const spinCur = this.spin[this.color];
    this.snapAngles = spinCur ? null : VIEW_ANGLES;
    this.snapStep = spinCur ? 360 / spinCur.frames.length : null; // para sempre num quadro exato
    this.step(dt);
    this.detailMix = damp(this.detailMix, this.detail ? 1 : 0, 5, dt);
    const a = norm360(this.angle);
    // segmento entre duas vistas
    let i = VIEWS.length - 1;
    for (let k = 0; k < VIEWS.length; k++) if (VIEWS[k].angle <= a) i = k;
    const A = VIEWS[i], B = VIEWS[(i + 1) % VIEWS.length];
    const span = norm360(B.angle - A.angle) || 360;
    const t = norm360(a - A.angle) / span;
    const fw = Math.min(0.5, 11 / span);
    const wB = THREE.MathUtils.smoothstep(t, 0.5 - fw, 0.5 + fw);
    const tilt = (deg) => THREE.MathUtils.degToRad(Math.max(-24, Math.min(24, deg * 0.42)));
    const light = this.light * (1 - 0.38 * Math.sin(Math.PI * this.swap));
    if (this.swap < 1) this.sweep = -0.6 + this.swap * 2.6;
    const common = (u, opacity) => {
      u.uOpacity.value = opacity;
      u.uReveal.value = this.reveal;
      u.uLight.value = light;
      u.uSweep.value = this.sweep;
    };
    for (const mesh of Object.values(this.planes)) {
      const { cor, view } = mesh.userData;
      const colorW = cor === 'branca' ? this.colorMix : 1 - this.colorMix;
      let viewW = 0, off = 0;
      if (this.spin[cor]) {
        // cor com giro: só o 3/4 aparece, e só nos detalhes
        if (view.id === '34') { viewW = this.detailMix; off = ((a - 40 + 540) % 360) - 180; }
      } else {
        if (view === A) { viewW = 1 - wB; off = norm360(a - A.angle); if (off > 180) off -= 360; }
        if (view === B) { viewW = Math.max(viewW, wB); off = a - B.angle; off = ((off + 540) % 360) - 180; }
      }
      common(mesh.material.uniforms, colorW * viewW);
      mesh.visible = mesh.material.uniforms.uOpacity.value > 0.002;
      mesh.rotation.y = tilt(off);
      mesh.renderOrder = cor === this.color ? 2 : 1;
    }
    for (const [cor, s] of Object.entries(this.spin)) {
      const colorW = cor === 'branca' ? this.colorMix : 1 - this.colorMix;
      const op = colorW * (1 - this.detailMix);
      common(s.mesh.material.uniforms, op);
      s.mesh.visible = op > 0.002;
      s.mesh.renderOrder = cor === this.color ? 3 : 1;
      if (!s.mesh.visible) continue;
      const N = s.frames.length;
      const pos = (a / 360) * N;
      let i0 = Math.floor(pos) % N, i1 = (i0 + 1) % N, f = pos - Math.floor(pos);
      if (!s.frames[i0] || !s.frames[i1]) { i0 = i1 = nearestFrame(s.frames, Math.round(pos) % N); f = 0; }
      if (i0 >= 0) this.setFrames(s, i0, i1, f);
    }
  }

  hotspotWorld(h, out) {
    const mesh = this.planes[`${this.color}-34`];
    const { w } = mesh.userData;
    const x = (h.img[0] - 0.5) * w, y = (0.5 - h.img[1]) * POLO_H;
    out.set(x, y, -0.12 * x * x + 0.02);
    return mesh.localToWorld(out);
  }

  // ângulo em que os detalhes são mostrados (foto 3/4)
  detailAngle() { return 40; }
}

// ------------------------------------------------------------
// Modo 3D: .glb real, com a mesma modelagem nas duas cores.
// ------------------------------------------------------------
const COLORS = {
  preta: { body: new THREE.Color(0x131315), trim: new THREE.Color(0x131315) },
  branca: { body: new THREE.Color(0xf1efea), trim: new THREE.Color(0xc9a468) },
};

export class ModelPolo extends PoloBase {
  constructor(assets) {
    super();
    this.kind = 'model';
    this.env = assets.env;
    this.variants = {};
    const single = !!assets.scenes.unico;
    const src = single ? { preta: assets.scenes.unico, branca: assets.scenes.unico } : assets.scenes;
    this.recolor = single;
    let bounds = null;
    for (const cor of ['preta', 'branca']) {
      if (single && cor === 'branca') break;
      const obj = src[cor].clone(true);
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const s = POLO_H / size.y;
      obj.scale.setScalar(s);
      obj.position.copy(center).multiplyScalar(-s);
      const holder = new THREE.Group();
      holder.add(obj);
      const mats = [];
      obj.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        for (const m of [].concat(o.material)) {
          const n = `${m.name} ${o.name}`.toLowerCase();
          const role = /logo|label|etiqueta|tag|marca/.test(n) ? 'keep' : /gola|collar|gold|dourad|trim|punho|cuff/.test(n) ? 'trim' : 'body';
          if (this.env) { m.envMap = this.env; }
          mats.push({ m, role, env: m.envMapIntensity ?? 1 });
        }
      });
      holder.userData.mats = mats;
      this.pivot.add(holder);
      this.variants[cor] = holder;
      bounds = bounds || { size: size.clone().multiplyScalar(s) };
    }
    this.bounds = bounds;

    this.lights = new THREE.Group();
    const key = new THREE.SpotLight(0xfff3e0, 60, 20, Math.PI / 7, 0.6, 1.4);
    key.position.set(1.6, 4.2, 4.5);
    key.target.position.set(0, 0, 0);
    const rimL = new THREE.DirectionalLight(0xd9c3a0, 1.4); rimL.position.set(-4, 2, -3);
    const rimR = new THREE.DirectionalLight(0xffffff, 0.9); rimR.position.set(4, 1, -2);
    const fill = new THREE.HemisphereLight(0x9a9aa0, 0x0a0a0a, 0.35);
    this.lights.add(key, key.target, rimL, rimR, fill);
    this.lightBase = [60, 1.4, 0.9, 0.35];
    this.lightList = [key, rimL, rimR, fill];
    this.group.add(this.lights);
  }

  update(dt) {
    this.step(dt);
    this.pivot.rotation.y = THREE.MathUtils.degToRad(this.angle);
    const dip = 1 - 0.55 * Math.sin(Math.PI * this.swap);
    const k = this.reveal * this.light * dip;
    this.lightList.forEach((l, i) => { l.intensity = this.lightBase[i] * k; });
    if (this.recolor) {
      const holder = this.variants.preta;
      for (const { m, role, env } of holder.userData.mats) {
        if (role === 'keep') { m.envMapIntensity = env * k; continue; }
        const c = COLORS.preta[role].clone().lerp(COLORS.branca[role], this.colorMix);
        m.color.copy(c);
        m.envMapIntensity = env * k;
      }
    } else {
      // a troca acontece no ponto mais escuro do "respiro" de luz
      const shown = this.swap < 0.5 ? (this.prevColor || this.color) : this.color;
      this.variants.preta.visible = shown === 'preta';
      this.variants.branca.visible = shown === 'branca';
      for (const holder of Object.values(this.variants)) {
        for (const { m, env } of holder.userData.mats) m.envMapIntensity = env * k;
      }
    }
  }

  hotspotWorld(h, out) {
    const s = this.bounds.size;
    out.set(h.modelo[0] * s.x, h.modelo[1] * s.y, h.modelo[2] * s.z);
    return this.pivot.localToWorld(out);
  }

  detailAngle(h) { return h ? h.giro : 0; }
}

export function createPolo(assets) {
  return assets.kind === 'model' ? new ModelPolo(assets) : new ImagePolo(assets);
}
