// Transforma um vídeo 360° da polo (câmera parada, peça girando, fundo claro liso)
// em quadros recortados e igualmente espaçados para o giro do site.
//
// uso: node scripts/prepare-spin.mjs <cor> [video] [quadros] [--pular 176-184] [--inverter|--nao-inverter]
//   ex: node scripts/prepare-spin.mjs preta assets-src/giro-preta.mp4 48
//   --pular   ignora quadros com defeito (ex.: mistura/fantasma de vídeo feito por IA)
//   --inverter / --nao-inverter   força o sentido do giro (o padrão é detectar)
//
// Passos: mede a largura da silhueta em cada quadro para estimar o ângulo real
// (vídeos de IA aceleram/desaceleram), escolhe quadros a cada 360/N graus,
// remove o fundo, alinha todos na mesma caixa e grava WebP em public/img/giro/<cor>/.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const flags = { skip: [], dir: null };
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--pular') { const [a, b] = argv[++i].split('-').map(Number); flags.skip.push([a, b ?? a]); }
  else if (argv[i] === '--inverter') flags.dir = true;
  else if (argv[i] === '--nao-inverter') flags.dir = false;
  else if (argv[i] === '--ia') flags.ai = true;
  else pos.push(argv[i]);
}
const cor = pos[0];
if (!['preta', 'branca'].includes(cor)) { console.error('uso: node scripts/prepare-spin.mjs <preta|branca> [video] [quadros] [--pular a-b] [--inverter]'); process.exit(1); }
const video = pos[1] || `assets-src/giro-${cor}.mp4`;
const N = +(pos[2] || 48);
const skipped = (n) => flags.skip.some(([a, b]) => n >= a && n <= b);
// cache por cor: evita reprocessar a IA quando só um ajuste muda (apague .cache para refazer)
const tmp = `.cache/spin-${cor}`;
const stamp = `${video}:${fs.statSync(video).size}`;
if (fs.existsSync(`${tmp}/stamp.txt`) && fs.readFileSync(`${tmp}/stamp.txt`, 'utf8') !== stamp) fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
fs.writeFileSync(`${tmp}/stamp.txt`, stamp);
const ff = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });

// ---------- 1. análise em baixa resolução ----------
if (!fs.existsSync(`${tmp}/low`)) {
  fs.mkdirSync(`${tmp}/low`);
  ff('-i', video, '-vf', 'scale=320:-2', `${tmp}/low/%04d.png`);
}
const lowFiles = fs.readdirSync(`${tmp}/low`).sort();
const lumAt = (p, x, y) => { const i = (y * p.width + x) * 4; return 0.3 * p.data[i] + 0.59 * p.data[i + 1] + 0.11 * p.data[i + 2]; };
const lowImgs = lowFiles.map((f) => PNG.sync.read(fs.readFileSync(`${tmp}/low/${f}`)));
const first = lowImgs[0];
const LW = first.width, LH = first.height;

// Modelo do fundo: pixels que quase não mudam ao longo do vídeo são fundo;
// ajusta uma superfície quadrática (degradê/vinheta) e usa em todo o quadro.
const bgModel = (() => {
  const n = LW * LH, sum = new Float64Array(n * 3), sq = new Float64Array(n);
  for (const p of lowImgs) for (let i = 0; i < n; i++) {
    const r = p.data[i * 4], g = p.data[i * 4 + 1], b = p.data[i * 4 + 2];
    sum[i * 3] += r; sum[i * 3 + 1] += g; sum[i * 3 + 2] += b;
    const l = 0.3 * r + 0.59 * g + 0.11 * b; sq[i] += l * l;
  }
  const F0 = lowImgs.length, rows = [], vals = [[], [], []];
  for (let i = 0; i < n; i += 3) {
    const m = [sum[i * 3] / F0, sum[i * 3 + 1] / F0, sum[i * 3 + 2] / F0];
    const ml = 0.3 * m[0] + 0.59 * m[1] + 0.11 * m[2];
    if (sq[i] / F0 - ml * ml > 6) continue; // variou: a peça passou por aqui
    const x = (i % LW) / LW, y = Math.floor(i / LW) / LH;
    rows.push([1, x, y, x * x, y * y, x * y]);
    for (let c = 0; c < 3; c++) vals[c].push(m[c]);
  }
  // mínimos quadrados 6x6 (eliminação de Gauss)
  const solve = (A, b) => {
    const M = A.map((r, i) => [...r, b[i]]), k = M.length;
    for (let c = 0; c < k; c++) {
      let piv = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map((r, i) => r[k] / r[i]);
  };
  const coef = [0, 1, 2].map((c) => {
    const AtA = Array.from({ length: 6 }, () => new Array(6).fill(0)), Atb = new Array(6).fill(0);
    rows.forEach((r, k) => { for (let a = 0; a < 6; a++) { Atb[a] += r[a] * vals[c][k]; for (let b = 0; b < 6; b++) AtA[a][b] += r[a] * r[b]; } });
    return solve(AtA, Atb);
  });
  return (x, y) => coef.map((k) => k[0] + k[1] * x + k[2] * y + k[3] * x * x + k[4] * y * y + k[5] * x * y);
})();
const lumOf = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const satOf = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
// peça clara (ex.: branca) ou escura (preta)?
const centerLum = lumAt(first, LW >> 1, LH >> 1);
const light = centerLum > 150;
console.log(`peça ${light ? 'clara' : 'escura'} (centro ${centerLum.toFixed(0)})`);
// é peça (e não fundo)? em coordenadas normalizadas
function isGarment(r, g, b, x, y) {
  const bg = bgModel(x, y), c = [r, g, b];
  if (!light) return lumOf(c) < 110;
  return Math.abs(lumOf(c) - lumOf(bg)) > 7 || Math.abs(satOf(c) - satOf(bg)) > 16;
}
// peça clara: a máscara da análise também vem da IA (a máscara por cor vaza)
const useAI = flags.ai || light;
const py = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
let lowAlpha = null;
if (useAI) {
  if (!fs.existsSync(py)) { console.error('rembg não instalado: python -m venv .venv && .venv/Scripts/python -m pip install "rembg[cpu]"'); process.exit(1); }
  console.log(`analisando ${lowFiles.length} quadros com IA (rembg)…`);
  execFileSync(py, ['scripts/rembg_frames.py', `${tmp}/low`, `${tmp}/lowa`], { stdio: 'inherit' });
  lowAlpha = new Map(lowImgs.map((p, k) => [p, PNG.sync.read(fs.readFileSync(`${tmp}/lowa/${lowFiles[k]}`)).data]));
}
const maskAt = (p, x, y) => {
  const i = (y * p.width + x) * 4;
  if (lowAlpha) return lowAlpha.get(p)[i + 3] > 128;
  return isGarment(p.data[i], p.data[i + 1], p.data[i + 2], x / p.width, y / p.height);
};

let top = LH, bottom = 0;
for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) if (maskAt(first, x, y)) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
const chestY = Math.round(top + (bottom - top) * 0.3);

const widths = [], goldX = [];
for (const p of lowImgs) {
  let a = -1, b = -1;
  for (let x = 0; x < p.width; x++) if (maskAt(p, x, chestY)) { if (a < 0) a = x; b = x; }
  widths.push(a < 0 ? 0 : b - a);
  let gx = 0, gn = 0;
  for (let y = top; y < bottom; y++) for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * 4, r = p.data[i], g = p.data[i + 1], bl = p.data[i + 2];
    // só o logo do peito (ignora a gola dourada, que fica no alto)
    if (y > top + (bottom - top) * 0.18 && r > 120 && r - bl > 45 && g > 90) { gx += x; gn++; }
  }
  goldX.push(gn > 3 ? gx / gn : null);
}
const F = widths.length;
const argBy = (from, to, cmp) => { let best = from; for (let i = from; i < to; i++) if (cmp(widths[i], widths[best])) best = i; return best; };
const q = (k) => Math.round((F * k) / 4);
const side1 = argBy(q(0.4), q(1.9), (a, b) => a < b);
const back = argBy(side1 + 5, q(3.3), (a, b) => a > b);
const side2 = argBy(back + 5, F - 5, (a, b) => a < b);
const W = Math.max(widths[0], widths[back]), D = Math.min(widths[side1], widths[side2]);
console.log(`quadros: ${F} · lado ${side1} · costas ${back} · outro lado ${side2}`);

// ângulo pela largura (seção elíptica) dentro de cada quarto de volta
const ang = widths.map((w, i) => {
  const c = Math.sqrt(Math.min(1, Math.max(0, (w * w - D * D) / (W * W - D * D))));
  const t = (Math.acos(c) * 180) / Math.PI;
  if (i <= side1) return t;
  if (i <= back) return 180 - t;
  if (i <= side2) return 180 + t;
  return 360 - t;
});
for (let i = 1; i < F; i++) ang[i] = Math.max(ang[i], ang[i - 1]); // monotônico

// sentido do giro: no 1º quarto o logo do peito deve ir para a direita da imagem
const g0 = goldX.find((g) => g != null), g1 = goldX.slice(0, side1).reverse().find((g) => g != null);
const reversed = flags.dir ?? (g0 != null && g1 != null && g1 < g0);
console.log(`sentido: ${reversed ? 'invertido' : 'normal'}${flags.dir == null ? ' (detectado)' : ' (forçado)'}`);

const picks = [];
for (let k = 0; k < N; k++) {
  let target = (k * 360) / N;
  if (reversed) target = (360 - target) % 360;
  let best = 0, bd = 1e9;
  for (let i = 0; i < F; i++) { if (skipped(i)) continue; const d = Math.abs(ang[i] - target); if (d < bd) { bd = d; best = i; } }
  picks.push(best);
}

console.log(`quadros escolhidos (${new Set(picks).size} únicos): ${picks.join(' ')}`);

// ---------- 2. quadros escolhidos em resolução total ----------
// quadros nomeados pelo número no vídeo, para o cache da IA valer entre execuções
fs.rmSync(`${tmp}/full`, { recursive: true, force: true });
fs.mkdirSync(`${tmp}/full`);
const uniq = [...new Set(picks)].sort((a, b) => a - b);
const expr = uniq.map((n) => `eq(n\\,${n})`).join('+');
ff('-i', video, '-vf', `select='${expr}'`, '-vsync', '0', `${tmp}/full/%04d.png`);
const byFrame = new Map();
fs.readdirSync(`${tmp}/full`).sort().forEach((f, i) => {
  const name = `f${String(uniq[i]).padStart(4, '0')}.png`;
  fs.renameSync(`${tmp}/full/${f}`, `${tmp}/full/${name}`);
  byFrame.set(uniq[i], name);
});

// Peça clara sobre fundo claro: o recorte por cor falha (sombra do tecido = tom do fundo).
// Usa o rembg (IA local, em .venv) para a máscara. Também pode ser forçado com --ia.
if (useAI) {
  console.log('removendo fundo com IA (rembg)…');
  execFileSync(py, ['scripts/rembg_frames.py', `${tmp}/full`, `${tmp}/alpha`], { stdio: 'inherit' });
}

// ---------- 3. recorte do fundo ----------
function cutoutAI(p, file) {
  const { width: w, height: h, data: d } = p;
  const m = PNG.sync.read(fs.readFileSync(`${tmp}/alpha/${file}`)).data;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4, a = m[o + 3] / 255;
    d[o + 3] = m[o + 3];
    if (a <= 0.01) { d[o] = d[o + 1] = d[o + 2] = 0; continue; }
    if (a < 0.98) {
      // tira o halo claro do fundo nas bordas semitransparentes
      const B = bgModel((i % w) / w, Math.floor(i / w) / h);
      for (let c = 0; c < 3; c++) d[o + c] = Math.max(0, Math.min(255, (d[o + c] - (1 - a) * B[c]) / a));
    }
  }
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 200) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

function cutout(p) {
  const { width: w, height: h, data: d } = p;
  const n = w * h;
  const lum = (i) => 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
  const sat = (i) => Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) - Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  // cor do fundo por linha (bordas esquerda e direita)
  const bgRow = [];
  for (let y = 0; y < h; y++) {
    const s = [0, 0, 0]; let c = 0;
    for (const x of [2, 6, 10, w - 3, w - 7, w - 11]) { const i = (y * w + x) * 4; s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; c++; }
    bgRow.push(s.map((v) => v / c));
  }
  const bg = new Uint8Array(n), stack = [];
  const isBgPix = light
    ? (i) => !isGarment(d[i * 4], d[i * 4 + 1], d[i * 4 + 2], (i % w) / w, Math.floor(i / w) / h)
    : (i) => lum(i) > 150 && sat(i) < 30;
  const push = (i) => { if (!bg[i] && isBgPix(i)) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
  }
  const dist = new Uint8Array(n).fill(255);
  let fr = [];
  for (let i = 0; i < n; i++) if (bg[i]) { dist[i] = 0; fr.push(i); }
  for (let k = 1; k <= 2; k++) {
    const nx = [];
    for (const i of fr) { const x = i % w, y = (i / w) | 0; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && dist[j] === 255) { dist[j] = k; nx.push(j); } }
    fr = nx;
  }
  const S = 22;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (bg[i]) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0; continue; }
    if (dist[i] <= 2) {
      const B = light ? bgModel((i % w) / w, Math.floor(i / w) / h) : bgRow[(i / w) | 0];
      const Bl = 0.3 * B[0] + 0.59 * B[1] + 0.11 * B[2];
      // peça clara: opacidade pela distância até a cor do fundo
      const a = light
        ? Math.min(1, Math.max(0, Math.max(Math.abs(lum(i) - Bl) / 22, Math.abs(sat(i) - satOf(B)) / 34)))
        : Math.min(1, Math.max(0, (Bl - lum(i)) / (Bl - S)));
      d[o + 3] = Math.round(a * 255);
      if (a > 0.02) for (let c = 0; c < 3; c++) d[o + c] = Math.max(0, Math.min(255, (d[o + c] - (1 - a) * B[c]) / a));
    }
  }
  // pedestal (só na peça escura: na clara, o tecido também é neutro e claro)
  if (!light) {
  const darkCount = new Array(h).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (d[i * 4 + 3] > 0 && lum(i) < 60) darkCount[y]++; }
  const maxRow = Math.max(...darkCount);
  let bandTop = 0, lastDark = 0;
  for (let y = 0; y < h; y++) { if (darkCount[y] >= maxRow * 0.6) bandTop = y; if (darkCount[y] >= 8) lastDark = y; }
  let firstDark = 0;
  while (firstDark < h && darkCount[firstDark] < 8) firstDark++;
  const lowZone = firstDark + (lastDark - firstDark) * 0.8;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const neutral = sat(i) < 22;
    // haste/disco do pedestal aparecendo pela fenda da barra (tecido preto nunca é tão claro)
    if (y > lowZone && neutral && lum(i) > 105) d[i * 4 + 3] = 0;
    if (y >= bandTop && (y > lastDark + 2 || (neutral && lum(i) > 70))) d[i * 4 + 3] = 0;
  }
  }
  // mantém só a maior região conectada (a camisa); restos do pedestal ficam soltos
  const comp = new Int32Array(n).fill(-1);
  let best = -1, bestSize = 0, id = 0;
  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1 || d[s * 4 + 3] < 40) continue;
    const st = [s]; comp[s] = id; let size = 0;
    while (st.length) {
      const i = st.pop(); size++;
      const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && comp[j] === -1 && d[j * 4 + 3] >= 40) { comp[j] = id; st.push(j); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
    id++;
  }
  for (let i = 0; i < n; i++) if (comp[i] >= 0 && comp[i] !== best) d[i * 4 + 3] = 0;
  // caixa da peça (pixels escuros)
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (d[i * 4 + 3] > 200 && (light || lum(i) < 110)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } }
  // o que estiver abaixo da barra da peça (pedestal) sai
  for (let y = y1 + 4; y < h; y++) for (let x = 0; x < w; x++) d[(y * w + x) * 4 + 3] = 0;
  return { x0, y0, x1, y1 };
}

const frames = [];
const box = { x0: 1e9, y0: 1e9, x1: 0, y1: 0 };
const boxes = [];
for (const n of picks) {
  const file = byFrame.get(n);
  const p = PNG.sync.read(fs.readFileSync(`${tmp}/full/${file}`));
  const b = useAI ? cutoutAI(p, file) : cutout(p);
  boxes.push(b);
  frames.push(p);
}
// Vídeos de IA deixam a peça "escorregar" de lado durante o giro. A gola fica no
// eixo de rotação: alinha todos os quadros pelo centro dela.
const anchorX = (p, b) => {
  let sx = 0, c = 0;
  const yEnd = b.y0 + Math.round((b.y1 - b.y0) * 0.1);
  for (let y = b.y0; y <= yEnd; y++) for (let x = 0; x < p.width; x++) { const a = p.data[(y * p.width + x) * 4 + 3]; if (a > 128) { sx += x; c++; } }
  return c ? sx / c : (b.x0 + b.x1) / 2;
};
const anchors = frames.map((p, k) => anchorX(p, boxes[k]));
const ref = [...anchors].sort((a, b) => a - b)[anchors.length >> 1];
frames.forEach((p, k) => {
  const dx = Math.round(ref - anchors[k]);
  if (dx) {
    const out = Buffer.alloc(p.data.length);
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
      const sxp = x - dx;
      if (sxp < 0 || sxp >= p.width) continue;
      p.data.copy(out, (y * p.width + x) * 4, (y * p.width + sxp) * 4, (y * p.width + sxp) * 4 + 4);
    }
    p.data = out;
  }
  const b = boxes[k];
  box.x0 = Math.min(box.x0, b.x0 + dx); box.y0 = Math.min(box.y0, b.y0); box.x1 = Math.max(box.x1, b.x1 + dx); box.y1 = Math.max(box.y1, b.y1);
});
const pad = 8;
const cx0 = Math.max(0, box.x0 - pad), cy0 = Math.max(0, box.y0 - pad);
const cw = Math.min(frames[0].width, box.x1 + pad) - cx0, ch = Math.min(frames[0].height, box.y1 + pad) - cy0;

// ---------- 4. WebP ----------
const out = `public/img/giro/${cor}`;
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let bytes = 0;
for (let k = 0; k < frames.length; k++) {
  const p = frames[k];
  const file = `${out}/${String(k).padStart(2, '0')}.webp`;
  await sharp(p.data, { raw: { width: p.width, height: p.height, channels: 4 } })
    .extract({ left: cx0, top: cy0, width: cw, height: ch })
    .webp({ quality: 86, alphaQuality: 90, effort: 6 })
    .toFile(file);
  bytes += fs.statSync(file).size;
}
const manifestPath = 'public/img/giro/manifest.json';
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
manifest[cor] = { frames: N, width: cw, height: ch };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✓ ${N} quadros ${cw}x${ch} em ${out} (${Math.round(bytes / 1024)} KB no total)`);
