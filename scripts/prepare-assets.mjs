// Gera os assets usados pelo site a partir dos originais em assets-src/.
// - logo.png: dourado sobre preto -> dourado com transparência
// - polo-*.png: mockups com fundo branco -> 3 vistas recortadas com transparência
import fs from 'node:fs';
import { PNG } from 'pngjs';

const OUT = 'public/img';
fs.mkdirSync(OUT, { recursive: true });

const read = (f) => PNG.sync.read(fs.readFileSync(f));
const write = (png, f) => { fs.writeFileSync(f, PNG.sync.write(png)); console.log('✓', f, `${png.width}x${png.height}`); };

function crop(src, x0, y0, w, h) {
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((y + y0) * src.width + (x + x0)) * 4;
      const di = (y * w + x) * 4;
      out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

function trim(png, pad = 8) {
  let x0 = png.width, y0 = png.height, x1 = 0, y1 = 0;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(png.width - 1, x1 + pad); y1 = Math.min(png.height - 1, y1 + pad);
  return crop(png, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

// ---------- Logo ----------
{
  const src = read('assets-src/logo.png');
  const d = src.data;
  const FLOOR = 22, FULL = 165;
  for (let i = 0; i < d.length; i += 4) {
    const m = Math.max(d[i], d[i + 1], d[i + 2]);
    const a = Math.min(1, Math.max(0, (m - FLOOR) / (FULL - FLOOR)));
    if (a <= 0) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
    // desfaz a mistura com o preto para manter o dourado puro nas bordas
    d[i] = Math.min(255, d[i] / a); d[i + 1] = Math.min(255, d[i + 1] / a); d[i + 2] = Math.min(255, d[i + 2] / a);
    d[i + 3] = Math.round(a * 255);
  }
  write(trim(src, 4), `${OUT}/logo.png`);
}

// ---------- Polos ----------
// Layout igual nos dois mockups: 3/4 grande à esquerda, frente e costas à direita.
const VIEWS = {
  '34': [26, 4, 852, 1110],
  frente: [884, 2, 490, 594],
  costas: [884, 594, 490, 524],
};

function cutout(png, { threshold, unmixDark }) {
  const { width: w, height: h, data: d } = png;
  const n = w * h;
  const minc = (p) => Math.min(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]);
  const bg = new Uint8Array(n);
  const stack = [];
  const push = (p) => { if (!bg[p] && minc(p) >= threshold) { bg[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop(); const x = p % w, y = (p / w) | 0;
    if (x > 0) push(p - 1); if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w); if (y < h - 1) push(p + w);
  }
  // distância (em px) até o fundo, limitada a 3
  const dist = new Uint8Array(n).fill(255);
  let frontier = [];
  for (let p = 0; p < n; p++) if (bg[p]) { dist[p] = 0; frontier.push(p); }
  for (let k = 1; k <= 3; k++) {
    const next = [];
    for (const p of frontier) {
      const x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && dist[q] === 255) { dist[q] = k; next.push(q); }
      }
    }
    frontier = next;
  }
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (bg[p]) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
    if (dist[p] <= 2) {
      if (unmixDark) {
        // borda de peça escura sobre branco: pixel = a*S + (1-a)*255, com S ~ 24
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const a = Math.min(1, Math.max(0, (255 - lum) / (255 - 24)));
        d[i + 3] = Math.round(a * 255);
        if (a > 0.01) for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, (d[i + c] - (1 - a) * 255) / a));
      } else {
        d[i + 3] = dist[p] === 1 ? 150 : 225;
      }
    }
  }
  return png;
}

for (const [cor, opts] of [['preta', { threshold: 238, unmixDark: true }], ['branca', { threshold: 250, unmixDark: false }]]) {
  const src = read(`assets-src/polo-${cor}.png`);
  for (const [nome, [x, y, w, h]] of Object.entries(VIEWS)) {
    const piece = cutout(crop(src, x, y, Math.min(w, src.width - x), Math.min(h, src.height - y)), opts);
    write(trim(piece, 6), `${OUT}/polo-${cor}-${nome}.png`);
  }
}

// ---------- WebP (bem mais leve, usado pelo site) ----------
const sharp = (await import('sharp')).default;
for (const f of fs.readdirSync(OUT).filter((n) => n.startsWith('polo-') && n.endsWith('.png'))) {
  const src = `${OUT}/${f}`, dst = src.replace(/\.png$/, '.webp');
  await sharp(src).webp({ quality: 88, alphaQuality: 100, effort: 6 }).toFile(dst);
  console.log('✓', dst, `${Math.round(fs.statSync(dst).size / 1024)} KB`);
}
