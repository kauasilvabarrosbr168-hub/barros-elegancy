// Desenha o homem BARROS em SVG a partir de uma pose (traço técnico).
import { J, solve } from '../pose.js';

const r2 = (n) => Math.round(n * 10) / 10;

export function projectPose(joints, viewYaw = 18, scale = 100) {
  const a = (viewYaw * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = [];
  for (let i = 0; i < joints.length / 3; i++) {
    const x = joints[i * 3], y = joints[i * 3 + 1], z = joints[i * 3 + 2];
    const xr = x * c + z * s, zr = -x * s + z * c;
    pts.push({ x: xr * scale, y: -y * scale, z: zr });
  }
  return pts;
}

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

// Retorna o conteúdo <g> (sem <svg>) para compor com cenário.
export function figureMarkup(pose, { viewYaw = 18, scale = 100, ox = 0, oy = 0, racket = false, detail = 'full' } = {}) {
  const P = projectPose(solve(pose), viewYaw, scale).map((p) => ({ x: p.x + ox, y: p.y + oy, z: p.z }));
  const line = (a, b, w, cls) => `<line class="${cls}" x1="${r2(a.x)}" y1="${r2(a.y)}" x2="${r2(b.x)}" y2="${r2(b.y)}" stroke-width="${w}"/>`;
  const parts = [];
  const limb = (ids, w1, w2, cls = 'fig-limb') => {
    const [a, b, c] = ids.map((i) => P[i]);
    const z = (a.z + b.z + (c ? c.z : b.z)) / 3;
    let m = line(a, b, w1, cls);
    if (c) m += line(b, c, w2, cls);
    parts.push({ z, m });
  };
  const k = scale / 100;
  limb([J.lHip, J.lKn, J.lAn], 9 * k, 6.5 * k);
  limb([J.rHip, J.rKn, J.rAn], 9 * k, 6.5 * k);
  limb([J.lAn, J.lToe], 4.5 * k, 0);
  limb([J.rAn, J.rToe], 4.5 * k, 0);
  limb([J.lSh, J.lEl, J.lWr], 6 * k, 4.8 * k);
  limb([J.rSh, J.rEl, J.rWr], 6 * k, 4.8 * k);

  // tronco com a polo (gold outline) + mangas
  const sL = P[J.lSh], sR = P[J.rSh], hL = P[J.lHip], hR = P[J.rHip];
  const hemL = lerp(sL, hL, 1.08), hemR = lerp(sR, hR, 1.08);
  const torsoZ = (sL.z + sR.z + hL.z + hR.z) / 4;
  const slvL = lerp(sL, P[J.lEl], 0.5), slvR = lerp(sR, P[J.rEl], 0.5);
  const poly = [sL, sR, hemR, hemL].map((p) => `${r2(p.x)},${r2(p.y)}`).join(' ');
  const neck = P[J.neck], chest = P[J.chest];
  const vApex = lerp(lerp(hemL, hemR, 0.5), chest, 0.55);
  const vL = lerp(sL, hemL, 0.42), vR = lerp(sR, hemR, 0.42);
  const logo = lerp(lerp(sL, hemL, 0.3), chest, 0.35);
  let torso = `<polygon class="fig-shirt" points="${poly}"/>`;
  torso += line(sL, slvL, 11 * k, 'fig-sleeve') + line(sR, slvR, 11 * k, 'fig-sleeve');
  if (detail === 'full') {
    torso += `<polyline class="fig-cut" points="${r2(vL.x)},${r2(vL.y)} ${r2(vApex.x)},${r2(vApex.y)} ${r2(vR.x)},${r2(vR.y)}"/>`;
    torso += `<circle class="fig-logo" cx="${r2(logo.x)}" cy="${r2(logo.y)}" r="${r2(2.2 * k)}"/>`;
  }
  torso += line(lerp(sL, sR, 0.5), neck, 6 * k, 'fig-limb');
  parts.push({ z: torsoZ + 0.001, m: torso });

  const head = P[J.head];
  const hc = lerp(neck, head, 0.55);
  parts.push({ z: head.z + 0.01, m: `<circle class="fig-head" cx="${r2(hc.x)}" cy="${r2(hc.y)}" r="${r2(11.5 * k)}"/>` });

  if (racket) {
    const w = P[J.rWr], t = P[J.racket];
    const ring = lerp(w, t, 0.72);
    const ang = (Math.atan2(t.y - w.y, t.x - w.x) * 180) / Math.PI;
    parts.push({
      z: w.z + 0.02,
      m: line(w, lerp(w, t, 0.45), 2.6 * k, 'fig-prop') +
        `<ellipse class="fig-prop" cx="${r2(ring.x)}" cy="${r2(ring.y)}" rx="${r2(17 * k)}" ry="${r2(12 * k)}" transform="rotate(${r2(ang)} ${r2(ring.x)} ${r2(ring.y)})"/>`,
    });
  }

  parts.sort((a, b) => a.z - b.z);
  return { markup: parts.map((p) => p.m).join(''), points: P };
}
