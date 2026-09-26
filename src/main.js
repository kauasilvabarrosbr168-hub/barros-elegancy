import './style.css';
import Lenis from 'lenis';
import { CONFIG, HOTSPOTS } from './config.js';
import { J, keyTime, sampleSequence } from './pose.js';
import { figureMarkup } from './ui/figure-svg.js';
import { buildCards, drawStretch } from './ui/cards.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const map01 = (v, a, b) => clamp01((v - a) / (b - a));
const root = document.documentElement;
const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ?cor=branca abre a página já na versão branca (útil para links diretos)
const state = { color: params.get('cor') === 'branca' ? 'branca' : 'preta', size: null };
const polos = { peca: null, manifesto: null, reserva: null };
const fallback = { peca: null, manifesto: null, reserva: null };
let stage = null, views = {}, heroView = null;
let gl = false;
// só em desenvolvimento: estado acessível no console para depuração
if (import.meta.env.DEV) window.__barros = { polos, views, fallback, state };

$('#year').textContent = new Date().getFullYear();

// ------------------------------------------------------------
// Rolagem suave
// ------------------------------------------------------------
const lenis = reduced ? null : new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.2 });
function scrollToY(y, immediate = false) {
  // salto imediato pela rolagem nativa: no carregamento o Lenis ainda não mediu a página
  if (immediate) { window.scrollTo(0, y); lenis?.resize(); return; }
  if (lenis) lenis.scrollTo(y, { duration: 1.8, force: true });
  else window.scrollTo({ top: y, behavior: immediate || reduced ? 'auto' : 'smooth' });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const t = document.querySelector(a.getAttribute('href'));
  if (!t) return;
  e.preventDefault();
  scrollToY(t.getBoundingClientRect().top + window.scrollY);
});

// ------------------------------------------------------------
// Capítulos e "batidas" ligadas ao progresso da rolagem
// ------------------------------------------------------------
const chapters = {};
for (const el of $$('.chapter')) {
  chapters[el.dataset.chapter] = {
    el,
    p: 0,
    stage: $('.stage', el),
    ranged: $$('[data-range]', el).map((n) => {
      const [a, b] = n.dataset.range.split(' ').map(Number);
      return { n, a, b };
    }),
  };
}
function progressOf(ch) {
  const r = ch.el.getBoundingClientRect();
  return clamp01(-r.top / Math.max(1, r.height - window.innerHeight));
}
function chapterY(name, p) {
  const ch = chapters[name];
  const top = ch.el.getBoundingClientRect().top + window.scrollY;
  return top + p * (ch.el.offsetHeight - window.innerHeight);
}

// ------------------------------------------------------------
// Cor e tamanho (estado compartilhado)
// ------------------------------------------------------------
const colorName = (id) => CONFIG.cores.find((c) => c.id === id).nome;
function setColor(id, instant = false) {
  state.color = id;
  for (const p of Object.values(polos)) p && p.setColor(id, instant);
  for (const f of Object.values(fallback)) f && f.setColor(id);
  for (const el of $$('[data-color-name]')) el.textContent = colorName(id);
  for (const r of $$('input[name="cor"]')) r.checked = r.value === id;
  views.movimento?.setShirtColor(id);
}
function stepColor(dir) {
  const ids = CONFIG.cores.map((c) => c.id);
  setColor(ids[(ids.indexOf(state.color) + dir + ids.length) % ids.length]);
}
for (const btn of $$('.nav-prev')) btn.addEventListener('click', () => stepColor(-1));
for (const btn of $$('.nav-next')) btn.addEventListener('click', () => stepColor(1));

$('#swatches').innerHTML = CONFIG.cores.map((c) => `
  <label class="swatch swatch-${c.id}" title="${c.nome}">
    <input type="radio" name="cor" value="${c.id}" ${c.id === state.color ? 'checked' : ''} aria-label="${c.nome}" />
    <i></i>
  </label>`).join('');
$('#swatches').addEventListener('change', (e) => setColor(e.target.value));

$('#sizes').innerHTML = CONFIG.tamanhos.map((t) => `
  <label class="size"><input type="radio" name="tamanho" value="${t}" aria-label="Tamanho ${t}" /><span>${t}</span></label>`).join('');
$('#sizes').addEventListener('change', (e) => {
  state.size = e.target.value;
  $('#sizeName').textContent = state.size;
  $('#sizes').closest('.opt').classList.remove('need');
  note('');
});

function note(text, warn = false) {
  const n = $('#resNote');
  n.textContent = text;
  n.classList.toggle('warn', warn);
}
$('#resForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state.size) {
    $('#sizes').closest('.opt').classList.add('need');
    note('Escolha o seu tamanho para reservar.', true);
    $('#sizes input').focus();
    return;
  }
  const r = CONFIG.reserva;
  const url = r.porVariante[`${state.color}-${state.size}`] || r.url;
  if (!url) {
    note('Link de reserva ainda não configurado (src/config.js).', true);
    return;
  }
  note(`Polo BARROS ${colorName(state.color)} · ${state.size} — abrindo a reserva…`);
  window.open(url, '_blank', 'noopener');
});

// ------------------------------------------------------------
// Detalhes (hotspots)
// ------------------------------------------------------------
const markerHTML = (h, i) => `
  <button class="hotspot" type="button" data-i="${i}" aria-label="${h.rotulo}">
    <span class="hotspot-core"></span><span class="hotspot-label">${h.rotulo}</span>
  </button>`;

$('#pecaHotspots').innerHTML = HOTSPOTS.map(markerHTML).join('');
$('#pecaDetails').innerHTML = HOTSPOTS.map((h, i) => `
  <article class="detail" data-i="${i}">
    <p class="detail-num">${String(i + 1).padStart(2, '0')} / ${String(HOTSPOTS.length).padStart(2, '0')} · ${h.rotulo}</p>
    <h3>${h.titulo}</h3>
    <p>${h.texto}</p>
    ${h.lista ? `<ul class="tags">${h.lista.map((t) => `<li>${t}</li>`).join('')}</ul>` : ''}
  </article>`).join('');
const pecaMarkers = $$('#pecaHotspots .hotspot');
const pecaPanels = $$('#pecaDetails .detail');
let detailProgressFor = () => 0;
let detailIndexAt = () => -1;
$('#pecaHotspots').addEventListener('click', (e) => {
  const b = e.target.closest('.hotspot');
  if (b) scrollToY(chapterY('peca', detailProgressFor(+b.dataset.i)));
});

$('#resHotspots').innerHTML = HOTSPOTS.map(markerHTML).join('');
const resMarkers = $$('#resHotspots .hotspot');
const pop = $('#resPop');
$('#resHotspots').addEventListener('click', (e) => {
  const b = e.target.closest('.hotspot');
  if (!b) return;
  const h = HOTSPOTS[+b.dataset.i];
  pop.innerHTML = `<h4>${h.titulo}</h4><p>${h.texto}</p>`;
  pop.hidden = false;
  resMarkers.forEach((m) => m.classList.toggle('active', m === b));
});
document.addEventListener('pointerdown', (e) => {
  if (!pop.hidden && !e.target.closest('.hotspot, .hotspot-pop')) { pop.hidden = true; resMarkers.forEach((m) => m.classList.remove('active')); }
});
let showResHotspots = false;
$('#toggleDetails').addEventListener('click', (e) => {
  showResHotspots = !showResHotspots;
  e.currentTarget.setAttribute('aria-expanded', String(showResHotspots));
  $('#resHotspots').classList.toggle('on', showResHotspots);
  if (views.reserva) views.reserva.showHotspots = showResHotspots;
  const p = polos.reserva;
  if (p && showResHotspots) p.drive = p.detailAngle(HOTSPOTS[1]);
  if (fallback.reserva) { fallback.reserva.detail = showResHotspots; fallback.reserva.render(); }
  if (!showResHotspots) pop.hidden = true;
});

// ------------------------------------------------------------
// Giro por arraste (mouse, toque e teclado)
// ------------------------------------------------------------
for (const surface of $$('.drag-surface')) {
  const key = surface.dataset.drag;
  surface.tabIndex = 0;
  surface.setAttribute('role', 'slider');
  surface.setAttribute('aria-label', 'Girar a peça 360°. Use as setas do teclado.');
  let drag = null;
  const target = () => polos[key] || fallback[key];
  surface.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX };
    const t = target();
    if (!t) return;
    t.drive = null;
    t.startDrag();
    surface.classList.add('dragging');
    surface.setPointerCapture(e.pointerId);
  });
  surface.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    drag.x = e.clientX;
    target()?.dragBy(dx * 0.5);
  });
  const end = () => { if (!drag) return; drag = null; surface.classList.remove('dragging'); target()?.endDrag(); };
  surface.addEventListener('pointerup', end);
  surface.addEventListener('pointercancel', end);
  surface.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const t = target();
    if (!t) return;
    t.drive = null;
    t.vel = e.key === 'ArrowRight' ? 260 : -260;
    if (t.kick) t.kick(e.key === 'ArrowRight' ? 1 : -1);
  });
}

// ------------------------------------------------------------
// Seção 05–07: rótulos flutuantes e legendas de cena
// ------------------------------------------------------------
const LABELS = [
  { text: 'Liberdade de movimento', joint: J.rEl, from: keyTime('toss'), to: keyTime('contact'), side: 'right', dx: 28, dy: -8 },
  { text: 'Performance', joint: J.lWr, from: keyTime('contact'), to: keyTime('split'), side: 'left', dx: -30, dy: 0 },
  { text: 'Leveza', joint: J.lAn, from: keyTime('split'), to: keyTime('backswing'), side: 'right', dx: 34, dy: -10 },
  { text: 'Elasticidade', joint: J.chest, from: keyTime('backswing'), to: keyTime('finish'), side: 'left', dx: -60, dy: -6 },
  { text: 'Conforto', joint: J.lSh, from: keyTime('finish'), to: keyTime('lunge'), side: 'right', dx: 40, dy: -18 },
];
$('#floatLabels').innerHTML = LABELS.map((l) => `<span class="flabel ${l.side}"><i></i>${l.text}</span>`).join('');
const labelEls = $$('#floatLabels .flabel');
const labels = LABELS.map((l, i) => ({ ...l, el: labelEls[i], on: false }));

const CAPTIONS = [
  [keyTime('stand'), 'Escritório'],
  [keyTime('walkA'), 'Viagem · Cidade'],
  [keyTime('coffee'), 'Café'],
  [keyTime('gesture'), 'Reunião'],
  [keyTime('confident'), 'Networking'],
];
const caption = $('#sceneCaption');
let captionText = '';
function updateCaption(t, visible) {
  let text = '';
  for (const [k, c] of CAPTIONS) if (t >= k - 0.004) text = c;
  if (!visible) text = '';
  if (text !== captionText) {
    captionText = text;
    caption.classList.remove('on');
    if (text) setTimeout(() => { if (captionText === text) { caption.textContent = text; caption.classList.add('on'); } }, 250);
  }
}

buildCards($('#pqTrack'));

// ------------------------------------------------------------
// Fallback sem WebGL: imagens e figura em SVG
// ------------------------------------------------------------
const VIEW_ANGLE = { frente: 0, 34: 40, costas: 180 };
class FallbackPolo {
  constructor(box, view = '34') {
    this.box = box;
    this.img = $('img', box);
    this.view = view;
    this.color = state.color;
    this.acc = 0;
    this.drive = null;
    this.angle = VIEW_ANGLE[view];
    this.detail = false;
    this.spins = {}; // giro contínuo por cor (manifest do prepare-spin)
    this.render();
  }
  get spin() { return this.spins[this.color]; }
  get showing34() { return this.detail || (!this.spin && this.view === '34'); }
  render() {
    const s = this.spin;
    let src = `/img/polo-${this.color}-${this.detail ? '34' : this.view}.webp`;
    if (s && !this.detail) {
      const k = Math.round((((this.angle % 360) + 360) % 360) / 360 * s.frames) % s.frames;
      src = `/img/giro/${this.color}/${String(k).padStart(2, '0')}.webp`;
    }
    if (this.img.getAttribute('src') !== src) this.img.src = src;
  }
  setColor(c) { this.color = c; this.render(); }
  setView(v) { this.view = v; this.angle = VIEW_ANGLE[v]; this.render(); }
  startDrag() { this.acc = 0; }
  endDrag() {}
  dragBy(dx) {
    if (this.spin) { this.angle += dx * 0.5; this.render(); return; }
    this.acc += dx;
    if (Math.abs(this.acc) > 70) { this.kick(Math.sign(this.acc)); this.acc = 0; }
  }
  kick(dir) {
    if (this.spin) { this.angle += dir * 45; this.render(); return; }
    const order = ['frente', '34', 'costas'];
    this.setView(order[(order.indexOf(this.view) + dir + 3) % 3]);
  }
}

function setupFallback() {
  root.classList.add('no-gl');
  fallback.peca = new FallbackPolo($('#peca .fb-polo'));
  fallback.manifesto = new FallbackPolo($('#manifesto .fb-polo'), 'frente');
  fallback.reserva = new FallbackPolo($('#resViewer .fb-polo'));
  fetch('/img/giro/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => {
    if (!m) return;
    for (const f of Object.values(fallback)) { f.spins = m; f.render(); }
  }).catch(() => {});
  detailProgressFor = (i) => 0.46 + ((i + 0.45) / HOTSPOTS.length) * 0.54;
  detailIndexAt = (p) => (p < 0.46 ? -1 : Math.min(HOTSPOTS.length - 1, Math.floor(map01(p, 0.46, 1) * HOTSPOTS.length)));
}

const fbPose = {};
function fallbackFrame() {
  // peça: zoom 2D na foto 3/4 durante os detalhes
  const f = fallback.peca;
  const p = chapters.peca.p;
  const idx = detailIndexAt(p);
  const img = f.img;
  if (f.detail !== idx >= 0) { f.detail = idx >= 0; f.render(); }
  if (idx >= 0) {
    const h = HOTSPOTS[idx];
    img.style.transformOrigin = `${h.img[0] * 100}% ${h.img[1] * 100}%`;
    img.style.transform = `scale(${Math.min(1.35, h.zoom)})`;
  } else img.style.transform = '';
  const r = img.getBoundingClientRect();
  const scale = idx >= 0 ? Math.min(1.35, HOTSPOTS[idx].zoom) : 1;
  const sr = chapters.peca.stage.getBoundingClientRect();
  pecaMarkers.forEach((m, i) => {
    const h = HOTSPOTS[i];
    const x = r.left + h.img[0] * r.width, y = r.top + h.img[1] * r.height;
    m.style.transform = `translate3d(${(x - sr.left).toFixed(1)}px, ${(y - sr.top).toFixed(1)}px, 0)`;
    m.style.visibility = scale > 1.01 && i !== idx ? 'hidden' : '';
  });
  // movimento: figura em traço
  const mp = chapters.movimento.p;
  if (mp > 0 && mp < 1) {
    const t = map01(mp, 0.03, 0.97);
    sampleSequence(t, fbPose);
    const { markup } = figureMarkup({ ...fbPose, x: 0, z: 0 }, { viewYaw: 24, scale: 100, racket: t < keyTime('stand') });
    $('#fbFigure').innerHTML = `<line class="fig-floor" x1="-150" y1="0" x2="150" y2="0"/>${markup}`;
  }
  // reserva: hotspots sobre a foto 3/4
  const rr = fallback.reserva.img.getBoundingClientRect();
  const vr = $('#resViewer').getBoundingClientRect();
  resMarkers.forEach((m, i) => {
    const h = HOTSPOTS[i];
    m.style.transform = `translate3d(${(rr.left + h.img[0] * rr.width - vr.left).toFixed(1)}px, ${(rr.top + h.img[1] * rr.height - vr.top).toFixed(1)}px, 0)`;
    m.classList.toggle('hidden', !fallback.reserva.showing34);
  });
}

// ------------------------------------------------------------
// WebGL
// ------------------------------------------------------------
async function setupGL() {
  const { Stage, detectQuality, webglAvailable } = await import('./gl/stage.js');
  if (!webglAvailable()) return false;
  const { quality } = detectQuality();
  try {
    stage = new Stage($('#gl'), quality);
  } catch (err) {
    console.warn('[BARROS] WebGL indisponível, usando fallback.', err);
    return false;
  }
  root.dataset.quality = quality;
  const { HeroView } = await import('./gl/hero.js');
  const logoImg = $('.hero-logo-base');
  if (!logoImg.complete) await new Promise((r) => { logoImg.onload = r; logoImg.onerror = r; });
  heroView = stage.add(new HeroView(chapters.hero.stage, $('.hero-logo'), logoImg, { quality }));

  // o resto carrega em paralelo à abertura
  (async () => {
    const [{ loadPoloAssets, createPolo }, V] = await Promise.all([import('./gl/polo.js'), import('./gl/views.js')]);
    detailProgressFor = V.detailProgressFor;
    detailIndexAt = V.detailIndexAt;
    const assets = await loadPoloAssets(stage.renderer, quality);
    root.dataset.polo = assets.kind;
    polos.peca = createPolo(assets);
    polos.manifesto = createPolo(assets);
    polos.reserva = createPolo(assets);
    for (const p of Object.values(polos)) p.setColor(state.color, true);
    polos.peca.angle = 40;
    polos.reserva.angle = 40;
    views.peca = stage.add(new V.PecaView(chapters.peca.stage, polos.peca, stage));
    views.peca.markers = pecaMarkers;
    // a camisa real do personagem usa as fotos do giro 360°
    const spin = assets.spin || (await import('./gl/polo.js')).loadSpins();
    views.movimento = stage.add(new V.MovimentoView(chapters.movimento.stage, stage, await spin));
    views.movimento.setShirtColor(state.color);
    views.movimento.labels = labels;
    views.manifesto = stage.add(new V.ManifestoView(chapters.manifesto.stage, polos.manifesto, stage));
    views.reserva = stage.add(new V.ReservaView($('#resViewer'), polos.reserva, stage));
    views.reserva.markers = resMarkers;
    views.reserva.showHotspots = showResHotspots;
  })().catch((err) => console.error('[BARROS] Erro ao montar as cenas 3D', err));

  window.addEventListener('resize', () => stage.resize());
  return true;
}

// ------------------------------------------------------------
// Loop principal
// ------------------------------------------------------------
const topbar = $('#topbar');
const pqTrack = $('#pqTrack');
const stretch = $('#stretch');
const rotIndicators = $$('.rot-indicator');
let last = performance.now();
let introAt = -1;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = now / 1000;
  lenis?.raf(now);

  for (const ch of Object.values(chapters)) {
    ch.p = progressOf(ch);
    for (const r of ch.ranged) r.n.classList.toggle('on', ch.p >= r.a && ch.p <= r.b);
  }

  // 01
  chapters.hero.stage.style.setProperty('--p', chapters.hero.p.toFixed(4));
  if (heroView) heroView.progress = chapters.hero.p;
  topbar.classList.toggle('show', window.scrollY > window.innerHeight * 0.55);

  // 02–04
  const pp = chapters.peca.p;
  chapters.peca.stage.style.setProperty('--p', pp.toFixed(4));
  if (views.peca) views.peca.progress = pp;
  const idx = detailIndexAt(pp);
  pecaPanels.forEach((el, i) => el.classList.toggle('on', i === idx));
  pecaMarkers.forEach((el, i) => el.classList.toggle('active', i === idx));
  const rp = polos.peca || fallback.peca;
  if (rp) rotIndicators[0].style.setProperty('--rot', (rp.angle || 0).toFixed(1));
  const rr = polos.reserva || fallback.reserva;
  if (rr) rotIndicators[1].style.setProperty('--rot', (rr.angle || 0).toFixed(1));

  // 05–07
  const mp = chapters.movimento.p;
  const mv = views.movimento;
  const t = mv ? mv.t : map01(mp, 0.03, 0.97);
  if (mv) mv.progress = mp;
  const inMov = mp > 0.001 && mp < 0.999;
  for (const l of labels) {
    const on = inMov && t >= l.from && t < l.to;
    if (on !== l.on) { l.on = on; l.el.classList.toggle('on', on); }
  }
  updateCaption(t, inMov);
  if (inMov && mp > 0.45 && mp < 0.7) drawStretch(stretch, Math.sin(Math.PI * map01(t, keyTime('lunge'), keyTime('stand'))), time);

  // 08
  if (views.manifesto) views.manifesto.progress = chapters.manifesto.p;

  // 09 — trilho horizontal
  const qp = chapters.paraquem.p;
  const travel = Math.max(0, pqTrack.scrollWidth - window.innerWidth);
  pqTrack.style.transform = `translate3d(${(-travel * map01(qp, 0.04, 0.8)).toFixed(1)}px, 0, 0)`;

  if (stage) {
    if (introAt >= 0 && heroView && heroView.introStart < 0) heroView.start(introAt, reduced);
    stage.frame(dt, time);
  } else if (gl === false && fallback.peca) fallbackFrame();

  requestAnimationFrame(frame);
}

// ------------------------------------------------------------
// Início
// ------------------------------------------------------------
(async () => {
  gl = await setupGL().catch((err) => { console.error(err); return false; });
  if (!gl) setupFallback();
  setColor(state.color, true);

  // atalho de depuração: ?at=capitulo:0.5
  const at = params.get('at');
  if (at) {
    const [name, p] = at.split(':');
    const y = chapters[name] ? chapterY(name, +p) : $(`#${name}`)?.getBoundingClientRect().top + window.scrollY;
    if (y != null) scrollToY(y, true);
  }

  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))]);
  document.body.classList.add('intro');
  introAt = performance.now() / 1000;
  requestAnimationFrame(frame);
})();
