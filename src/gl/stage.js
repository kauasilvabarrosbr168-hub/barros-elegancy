import * as THREE from 'three';

// Um único canvas fixo. Cada "view" é uma cena presa a um elemento do DOM:
// a câmera usa setViewOffset para que o conteúdo 3D fique exatamente no
// retângulo do elemento, rolando junto com ele — sem descolar do layout.
export class Stage {
  constructor(canvas, quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality !== 'low',
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.maxDpr = quality === 'high' ? 1.75 : quality === 'mid' ? 1.4 : 1;
    this.views = [];
    this.W = 0; this.H = 0;
    this._v = new THREE.Vector3();
    this.resize(true);
  }

  add(view) { this.views.push(view); return view; }

  resize(force = false) {
    const w = window.innerWidth;
    // Altura = maior altura já vista nessa largura (barra do navegador no celular
    // aparece/some sem redimensionar o canvas a cada rolagem).
    const h = Math.max(window.innerHeight, w === this.W ? this.H : 0);
    if (!force && w === this.W && h === this.H) return;
    this.W = w; this.H = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxDpr));
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.height = `${h}px`;
  }

  frame(dt, time) {
    const { renderer, W, H } = this;
    renderer.setScissorTest(false);
    renderer.clear();
    for (const view of this.views) {
      const rect = view.el.getBoundingClientRect();
      view.rect = rect;
      const visible = view.enabled !== false && rect.bottom > -2 && rect.top < H + 2 && rect.width > 0;
      view.visible = visible;
      if (!visible) continue;
      const cam = view.camera;
      cam.aspect = rect.width / rect.height;
      cam.setViewOffset(rect.width, rect.height, -rect.left, -rect.top, W, H);
      view.update(dt, time, rect);
      cam.updateProjectionMatrix();
      if (view.skip) continue;
      renderer.render(view.scene, cam);
      if (view.post) view.post(rect);
    }
  }

  // Posição na tela (px, relativo à viewport) de um ponto 3D de uma view.
  project(view, point, out = { x: 0, y: 0, z: 0 }) {
    const v = this._v.copy(point).project(view.camera);
    out.x = (v.x + 1) * 0.5 * this.W;
    out.y = (1 - v.y) * 0.5 * this.H;
    out.z = v.z;
    return out;
  }
}

export function detectQuality() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  let q = 'high';
  if (coarse || mem <= 4 || cores <= 4) q = 'mid';
  if ((coarse && (mem <= 3 || cores <= 4)) || mem <= 2) q = 'low';
  const url = new URLSearchParams(location.search).get('q');
  if (url === 'low' || url === 'mid' || url === 'high') q = url;
  return { quality: q, reduced, coarse };
}

export function webglAvailable() {
  if (new URLSearchParams(location.search).has('nogl')) return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
