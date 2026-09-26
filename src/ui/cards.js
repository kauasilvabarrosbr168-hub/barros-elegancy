// Seção 09 — cenas "para quem é" em traço técnico + diagrama de elasticidade (seção 06).
import { J, POSES } from '../pose.js';
import { figureMarkup } from './figure-svg.js';

const W = 300, H = 400, GROUND = 350;
const f = (n) => Math.round(n * 10) / 10;
const ln = (x1, y1, x2, y2, cls = 'fig-prop') => `<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
const rect = (x, y, w, h, cls = 'fig-prop') => `<rect class="${cls}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="2"/>`;
const M = 118; // px por metro

function fig(pose, opts) {
  return figureMarkup({ ...pose, x: 0, z: 0 }, { scale: M, ox: W / 2, oy: GROUND, ...opts });
}

const SCENES = [
  {
    titulo: 'Academia',
    draw() {
      let set = '';
      for (let x = 40; x <= 260; x += 44) set += ln(x, 60, x, GROUND, 'fig-set');
      set += ln(30, 60, 270, 60, 'fig-set');
      const { markup, points: P } = fig(POSES.gym, { viewYaw: 25 });
      let props = '';
      for (const w of [P[J.lWr], P[J.rWr]]) {
        props += ln(w.x - 14, w.y, w.x + 14, w.y) + rect(w.x - 20, w.y - 8, 6, 16) + rect(w.x + 14, w.y - 8, 6, 16);
      }
      return set + markup + props;
    },
  },
  {
    titulo: 'Tênis',
    draw() {
      let set = ln(10, GROUND - 1, 290, GROUND - 1, 'fig-set');
      for (let x = 190; x <= 290; x += 10) set += ln(x, 280, x, GROUND - 1, 'fig-set');
      set += ln(186, 280, 294, 280, 'fig-prop');
      const { markup } = fig(POSES.finish, { viewYaw: 30, racket: true });
      return set + markup;
    },
  },
  {
    titulo: 'Golf',
    draw() {
      let set = ln(240, GROUND - 2, 240, 250, 'fig-set') + `<path class="fig-prop" d="M240 250 L266 258 L240 266"/>`;
      set += `<ellipse class="fig-set" cx="240" cy="${GROUND}" rx="26" ry="4"/>`;
      const { markup, points: P } = fig(POSES.golf, { viewYaw: 12 });
      const a = P[J.rWr], b = P[J.racket];
      const dx = b.x - a.x, dy = b.y - a.y;
      const end = { x: a.x + dx * 1.45, y: a.y + dy * 1.45 };
      const props = ln(a.x, a.y, end.x, end.y) + ln(end.x, end.y, end.x + 9, end.y + 4);
      return set + markup + props;
    },
  },
  {
    titulo: 'Café',
    draw() {
      const { markup, points: P } = fig(POSES.sit, { viewYaw: 72 });
      const pel = P[J.pelvis];
      const seatY = pel.y + 10;
      let set = ln(pel.x - 34, seatY, pel.x + 16, seatY) + ln(pel.x - 34, seatY, pel.x - 38, seatY - 70);
      set += ln(pel.x - 30, seatY, pel.x - 30, GROUND) + ln(pel.x + 12, seatY, pel.x + 12, GROUND);
      const tx = pel.x + 110, ty = GROUND - 0.74 * M;
      set += ln(tx - 36, ty, tx + 36, ty) + ln(tx, ty, tx, GROUND) + ln(tx - 18, GROUND, tx + 18, GROUND);
      set += `<path class="fig-prop" d="M${f(tx - 8)} ${f(ty)} v-12 h14 v12 M${f(tx + 6)} ${f(ty - 9)} h4 v5 h-4"/>`;
      const w = P[J.rWr];
      set += `<path class="fig-prop" d="M${f(w.x - 5)} ${f(w.y - 4)} v-10 h11 v10 z"/>`;
      return ln(10, GROUND, 290, GROUND, 'fig-set') + markup + set;
    },
  },
  {
    titulo: 'Reunião',
    draw() {
      let set = '';
      for (let x = 20; x <= 280; x += 52) set += ln(x, 40, x, 250, 'fig-set');
      set += ln(10, 250, 290, 250, 'fig-set') + ln(10, 40, 290, 40, 'fig-set');
      const { markup } = fig(POSES.gesture, { viewYaw: 20 });
      const ty = GROUND - 0.75 * M;
      set += ln(186, ty, 296, ty) + ln(196, ty, 196, GROUND) + ln(286, ty, 286, GROUND);
      set += `<path class="fig-prop" d="M222 ${f(ty)} l6 -22 h30 l-4 22"/>`;
      return set + markup;
    },
  },
  {
    titulo: 'Aeroporto',
    draw() {
      let set = '';
      for (let x = 30; x <= 270; x += 60) set += `<path class="fig-set" d="M${x} 250 V90 a30 30 0 0 1 60 0 V250"/>`;
      set += `<path class="fig-set" d="M190 120 l40 -8 l6 -10 l4 0 l-3 12 l18 -4 l4 -6 l3 0 l-2 8 l-4 2 l-68 12 z"/>`;
      const { markup, points: P } = fig(POSES.travel, { viewYaw: 70 });
      const w = P[J.rWr];
      const bx = w.x - 30;
      const props = ln(w.x, w.y, bx + 6, w.y + 20) + rect(bx - 12, w.y + 20, 36, GROUND - w.y - 26) + `<circle class="fig-prop" cx="${f(bx - 6)}" cy="${GROUND - 3}" r="3"/><circle class="fig-prop" cx="${f(bx + 18)}" cy="${GROUND - 3}" r="3"/>`;
      return ln(10, GROUND, 290, GROUND, 'fig-set') + set + props + markup;
    },
  },
  {
    titulo: 'Networking',
    draw() {
      const a = figureMarkup({ ...POSES.handshake, x: 0, z: 0, yaw: 90 }, { scale: M * 0.92, ox: 108, oy: GROUND, viewYaw: 0, detail: 'full' });
      const b = figureMarkup({ ...POSES.handshake, x: 0, z: 0, yaw: -90 }, { scale: M * 0.92, ox: 196, oy: GROUND, viewYaw: 0, detail: 'min' });
      return ln(10, GROUND, 290, GROUND, 'fig-set') + `<g opacity="0.55">${b.markup}</g>` + a.markup;
    },
  },
];

export function buildCards(track) {
  track.innerHTML = SCENES.map((s, i) => `
    <article class="pq-card">
      <svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${s.draw()}</svg>
      <div class="pq-card-meta"><h3>${s.titulo}</h3><span>${String(i + 1).padStart(2, '0')}</span></div>
    </article>`).join('');
}

// Malha de tecido que estica com o movimento (seção 06)
export function drawStretch(svg, s, time) {
  const cols = 14, rows = 6, w = 240, h = 90;
  const k = 0.5 + 0.5 * Math.sin(time * 1.4);
  const amt = s * (0.55 + 0.45 * k);
  const pt = (i, j) => {
    const u = i / cols, v = j / rows;
    const cx = u - 0.5, cy = v - 0.5;
    const bulge = Math.exp(-(cx * cx * 6 + cy * cy * 5));
    const x = w / 2 + cx * w * (0.86 + 0.16 * amt * bulge);
    const y = h / 2 + cy * h * (0.8 - 0.14 * amt * bulge) + Math.sin(u * 7 + time) * 1.4 * amt;
    return `${f(x)} ${f(y)}`;
  };
  let d = '';
  for (let j = 0; j <= rows; j++) {
    let p = `M${pt(0, j)}`;
    for (let i = 1; i <= cols; i++) p += ` L${pt(i, j)}`;
    d += `<path class="h" d="${p}"/>`;
  }
  for (let i = 0; i <= cols; i++) {
    let p = `M${pt(i, 0)}`;
    for (let j = 1; j <= rows; j++) p += ` L${pt(i, j)}`;
    d += `<path d="${p}"/>`;
  }
  svg.innerHTML = d;
}
