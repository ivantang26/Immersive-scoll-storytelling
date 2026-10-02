// Renders the assembly + turntable image sequences for every device tier,
// plus static-fallback stills, colourway shots, configurator fallbacks and press images.
// Usage: node scripts/render-sequences.mjs [--only=assembly,turntable,stills,colourways,configure,press]
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBike, makeCamera, renderBike, drawStage, drawShadow, ease, range, GEO, PALETTE } from './lib/bike.mjs';
import { SEQUENCES, COLOURWAY_IDS } from '../src/config/media.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'media');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (k) => !only.length || only.includes(k);

// Note: @napi-rs/canvas 1.x treats AVIF `quality` like a quantizer (lower = better, bigger).
const QUALITY = { webp: { mobile: 62, tablet: 70, other: 78 }, avif: 25 };

async function save(canvas, file, ext, q) {
  mkdirSync(dirname(file), { recursive: true });
  let buf;
  if (ext === 'avif') buf = await canvas.encode('avif', { quality: q ?? QUALITY.avif, speed: 5, chromaSubsampling: 1 });
  else if (ext === 'webp') buf = await canvas.encode('webp', q ?? QUALITY.webp.other);
  else if (ext === 'jpg') buf = await canvas.encode('jpeg', q ?? 88);
  else buf = await canvas.encode('png');
  writeFileSync(file, buf);
  return buf.length;
}

// Small promise pool so encoding overlaps rendering.
async function pool(items, size, fn) {
  let i = 0;
  const run = async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: size }, run));
}

/* ------------------------------------------------------------------ */
/* Assembly timeline                                                    */
/* ------------------------------------------------------------------ */

const DT = [GEO.HB[0] - GEO.BB[0], GEO.HB[1] - GEO.BB[1]];
const FLIGHTS = {
  frame: { win: [0.02, 0.2], from: [0, -0.3, 0], fade: true },
  rearWheel: { win: [0.18, 0.36], from: [-2.4, 0, 0], roll: 'spinRear' },
  frontWheel: { win: [0.24, 0.42], from: [2.4, 0, 0], roll: 'spinFront' },
  motor: { win: [0.4, 0.54], from: [0, -0.15, 1.6] },
  battery: { win: [0.47, 0.61], from: [-DT[0] * 1.3, -DT[1] * 1.3, 0.7] },
  drive: { win: [0.56, 0.68], from: [0, -0.7, 0.6] },
  cockpit: { win: [0.64, 0.78], from: [0.2, 1.0, 0], rot: -0.5 },
  saddle: { win: [0.7, 0.82], from: [-0.1, 1.0, 0] },
  fenders: { win: [0.78, 0.88], from: [0, 0.35, 0], fade: true },
  lights: { win: [0.84, 0.9], from: [0, 0, 0], fade: true },
};

function assemblyState(t, { explode = null } = {}) {
  const states = {};
  const spins = { spinRear: 0, spinFront: 0 };
  const moving = [];
  for (const [id, f] of Object.entries(FLIGHTS)) {
    const local = explode != null ? explode : range(t, f.win[0], f.win[1]);
    const e = explode != null ? explode : ease.outCubic(local);
    const k = 1 - e;
    const offset = f.from.map((v) => v * k);
    states[id] = {
      offset,
      rot: (f.rot || 0) * k,
      alpha: explode != null ? 1 : f.fade ? e : local > 0 ? Math.min(1, local * 6) : 0,
    };
    if (f.roll) spins[f.roll] = -(offset[0] - f.from[0]) / GEO.wheelR;
    if (local > 0 && local < 1) moving.push({ id, local, offset });
  }
  const lights = explode != null ? 0.6 : ease.inOutCubic(range(t, 0.9, 0.98));
  return { states, spins, lights, moving };
}

function assemblyCamera(t, tier, w, h) {
  const e = ease.inOutCubic(t);
  return {
    yaw: -0.68 * (1 - e),
    pitch: 0.24 - 0.14 * e,
    ppm: tier.ppm * (0.88 + 0.12 * e),
    cx: w / 2,
    cy: h * 0.53,
    pivot: [0.01, 0.55, 0],
  };
}

function drawAssemblyOverlays(ctx, parts, cam, moving, scale) {
  for (const m of moving) {
    const part = parts[m.id];
    const at = cam.project([part.anchor[0] + m.offset[0], part.anchor[1] + m.offset[1], part.anchor[2] + m.offset[2]]);
    const to = cam.project(part.anchor);
    // Dashed guide from the flying part to where it locks in.
    if (m.local < 0.92) {
      ctx.save();
      ctx.setLineDash([6 * scale, 8 * scale]);
      ctx.strokeStyle = PALETTE.copper;
      ctx.globalAlpha = 0.45 * Math.sin(Math.PI * Math.min(1, m.local * 1.1));
      ctx.lineWidth = 1.4 * scale;
      ctx.beginPath();
      ctx.moveTo(at[0], at[1]);
      ctx.lineTo(to[0], to[1]);
      ctx.stroke();
      ctx.restore();
    }
    // Lock flash: an expanding copper ring as the part seats.
    if (m.local > 0.8) {
      const k = (m.local - 0.8) / 0.2;
      ctx.save();
      ctx.strokeStyle = PALETTE.copper;
      ctx.globalAlpha = 0.9 * (1 - k);
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.arc(to[0], to[1], (6 + 34 * ease.outCubic(k)) * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function renderAssemblyFrame(canvas, tier, t, opts = {}) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d');
  const cam = makeCamera(assemblyCamera(opts.explode != null ? 1 : t, tier, w, h));
  const { states, spins, lights, moving } = assemblyState(t, opts);
  drawStage(ctx, w, h, { glowY: 0.5, warmth: 0.7 + 0.3 * t, floorY: cam.project([0, 0, 0])[1] });
  drawShadow(ctx, cam, Math.min(1, t * 3));
  const parts = buildBike({ ...spins, lights, crank: -0.6 });
  renderBike(ctx, parts, cam, states);
  drawAssemblyOverlays(ctx, parts, cam, moving, w / 1600);
}

/* ------------------------------------------------------------------ */
/* Turntable                                                            */
/* ------------------------------------------------------------------ */

function turntableCamera(t, tier, w, h) {
  return { yaw: t * Math.PI * 2, pitch: 0.1, ppm: tier.ppm, cx: w / 2, cy: h * 0.53, pivot: [0.01, 0.55, 0] };
}

const CALLOUT_POINTS = {
  battery: { p: [(GEO.BB[0] + GEO.HB[0]) / 2, (GEO.BB[1] + GEO.HB[1]) / 2, 0.03], vis: (yaw) => Math.abs(Math.cos(yaw)) },
  belt: { p: [(GEO.BB[0] + GEO.RA[0]) / 2, GEO.BB[1] + 0.04, 0.075], vis: (yaw) => Math.cos(yaw) },
  lights: { p: [GEO.HT[0] + 0.07, GEO.HT[1] - 0.05, 0], vis: (yaw) => -Math.sin(yaw) + 0.3 },
};

function renderTurntableFrame(canvas, tier, t) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d');
  const cam = makeCamera(turntableCamera(t, tier, w, h));
  drawStage(ctx, w, h, { glowY: 0.5, floorY: cam.project([0, 0, 0])[1] });
  drawShadow(ctx, cam);
  renderBike(ctx, buildBike({ lights: 1, crank: -0.6 }), cam);
  const anchors = {};
  for (const [id, c] of Object.entries(CALLOUT_POINTS)) {
    const p = cam.project(c.p);
    anchors[id] = [+(p[0] / w).toFixed(4), +(p[1] / h).toFixed(4), +Math.max(0, Math.min(1, c.vis(cam.yaw))).toFixed(2)];
  }
  return anchors;
}

/* ------------------------------------------------------------------ */
/* Runs                                                                 */
/* ------------------------------------------------------------------ */

async function renderSequence(name, renderFn) {
  const seq = SEQUENCES[name];
  for (const [tierName, tier] of Object.entries(seq.tiers)) {
    const n = Math.ceil(seq.source / tier.step);
    const anchors = [];
    let bytes = 0;
    const q = tier.ext === 'avif' ? QUALITY.avif : QUALITY.webp[tierName] ?? QUALITY.webp.other;
    await pool([...Array(n).keys()], 4, async (i) => {
      const src = i * tier.step;
      const t = name === 'turntable' ? src / seq.source : src / (seq.source - 1);
      const canvas = createCanvas(tier.w, tier.h);
      const a = renderFn(canvas, tier, t);
      if (a) anchors[i] = a;
      const size = await save(canvas, join(OUT, name, tierName, `${String(i).padStart(3, '0')}.${tier.ext}`), tier.ext, q);
      bytes += size;
    });
    if (anchors.length) writeFileSync(join(OUT, name, tierName, 'anchors.json'), JSON.stringify(anchors));
    console.log(`${name}/${tierName}: ${n} frames, ${(bytes / 1024).toFixed(0)} KB total, ${(bytes / n / 1024).toFixed(1)} KB avg`);
  }
}

const STILL_SIZES = [
  { w: 1600, h: 900, ppm: 470, exts: ['avif', 'webp'], suffix: '1600' },
  { w: 1080, h: 810, ppm: 430, exts: ['webp'], suffix: '1080' },
  { w: 720, h: 720, ppm: 330, exts: ['webp'], suffix: '720' },
];

async function renderStill(name, draw) {
  for (const s of STILL_SIZES) {
    const canvas = createCanvas(s.w, s.h);
    draw(canvas, s);
    for (const ext of s.exts) await save(canvas, join(OUT, 'stills', `${name}-${s.suffix}.${ext}`), ext, ext === 'avif' ? 25 : 76);
  }
  console.log(`still: ${name}`);
}

function hero(canvas, { colourway = 'obsidian', yaw = -0.45, pitch = 0.12, ppm, lights = 0.8, rack = false, basket = false, cy = 0.53, glowY = 0.5 }) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d');
  const cam = makeCamera({ yaw, pitch, ppm, cx: w / 2, cy: h * cy, pivot: [0.01, 0.55, 0] });
  drawStage(ctx, w, h, { glowY, floorY: cam.project([0, 0, 0])[1] });
  drawShadow(ctx, cam);
  renderBike(ctx, buildBike({ colourway, lights, rack, basket }), cam);
}

if (want('assembly')) await renderSequence('assembly', renderAssemblyFrame);
if (want('turntable')) await renderSequence('turntable', renderTurntableFrame);

if (want('stills')) {
  await renderStill('assembly', (c, s) => renderAssemblyFrame(c, s, 1, { explode: 0.62 }));
  await renderStill('turntable', (c, s) => hero(c, { yaw: -0.5, ppm: s.ppm }));
  await renderStill('cta', (c, s) => hero(c, { yaw: 0, pitch: 0.06, ppm: s.ppm, lights: 1 }));
}

if (want('colourways')) {
  for (const id of COLOURWAY_IDS) {
    for (const s of [{ w: 1600, h: 1000, ppm: 560, q: 78 }, { w: 800, h: 640, ppm: 330, q: 70 }]) {
      const c = createCanvas(s.w, s.h);
      hero(c, { colourway: id, yaw: -0.38, ppm: s.ppm, lights: 0.7 });
      await save(c, join(OUT, 'colourways', `${id}-${s.w}.webp`), 'webp', s.q);
    }
  }
  console.log('colourways done');
}

if (want('configure')) {
  // No-WebGL fallback for the configurator: one still per option combination.
  for (const id of COLOURWAY_IDS)
    for (const rack of [false, true])
      for (const basket of [false, true]) {
        const c = createCanvas(1200, 800);
        hero(c, { colourway: id, yaw: -0.55, ppm: 410, lights: 0.6, rack, basket, cy: 0.55 });
        await save(c, join(OUT, 'configure', `${id}-${rack ? 'rack' : 'norack'}-${basket ? 'basket' : 'nobasket'}.webp`), 'webp', 74);
      }
  console.log('configurator fallbacks done');
}

if (want('press')) {
  const shots = [
    { file: 'vela-obsidian-side', colourway: 'obsidian', yaw: 0, pitch: 0.05 },
    { file: 'vela-bone-three-quarter', colourway: 'bone', yaw: -0.6, pitch: 0.16 },
    { file: 'vela-tidewater-rear', colourway: 'tidewater', yaw: 2.4, pitch: 0.14 },
  ];
  for (const s of shots) {
    const big = createCanvas(2400, 1350);
    hero(big, { ...s, ppm: 700, lights: 1 });
    await save(big, join(OUT, 'press', `${s.file}.jpg`), 'jpg', 90);
    const thumb = createCanvas(1600, 900);
    hero(thumb, { ...s, ppm: 470, lights: 1 });
    await save(thumb, join(OUT, 'press', `${s.file}-thumb.webp`), 'webp', 76);
  }
  const og = createCanvas(1200, 630);
  hero(og, { yaw: -0.4, ppm: 330, lights: 1, cy: 0.56 });
  const ctx = og.getContext('2d');
  ctx.fillStyle = PALETTE.bone;
  ctx.font = '500 64px sans-serif';
  ctx.fillText('Vela', 64, 110);
  ctx.fillStyle = PALETTE.copper;
  ctx.fillRect(64, 132, 56, 4);
  await save(og, join(ROOT, 'public', 'og.jpg'), 'jpg', 86);
  console.log('press done');
}
