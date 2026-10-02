// Renders the city-ride film (day to dusk) and encodes it all-intra for smooth scroll scrubbing.
// Stands in for the footage / CG render the PRD leaves open (open question 2).
// Output: public/media/city/city-{720,1080}.mp4, posters, and static-fallback stills.
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBike, makeCamera, renderBike, GEO } from './lib/bike.mjs';
import { VIDEOS } from '../src/config/media.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'media', 'city');
const STILLS = join(ROOT, 'public', 'media', 'stills');
const { duration, fps } = VIDEOS.city;
const FRAMES = duration * fps;
const SPEED = 6.9; // m/s, 25 km/h

const FORMATS = [
  { name: '1080', w: 1920, h: 1080, ppm: 300, bikeX: 0.38, roadY: 0.79, crf: 24 },
  { name: '720', w: 720, h: 1280, ppm: 300, bikeX: 0.5, roadY: 0.6, crf: 25 },
];

/* ---------------- colour helpers ---------------- */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgb = (c, a = 1) => `rgba(${c.map((v) => Math.round(v)).join(',')},${a})`;
function keyed(keys, t) {
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, c0] = keys[i];
    const [t1, c1] = keys[i + 1];
    if (t <= t1) return mix(hex(c0), hex(c1), (t - t0) / (t1 - t0));
  }
  return hex(keys[keys.length - 1][1]);
}
const SKY_TOP = [[0, '#6f8db0'], [0.45, '#40507a'], [0.75, '#222641'], [1, '#111321']];
const SKY_HORIZON = [[0, '#e9dcc6'], [0.45, '#e8a36a'], [0.75, '#9b5a4e'], [1, '#3a2836']];
const FACADE = [[0, '#59606e'], [0.5, '#2c2f3a'], [1, '#121319']];

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- layers ---------------- */
function drawSky(ctx, w, h, t, horizonY) {
  const g = ctx.createLinearGradient(0, 0, 0, horizonY);
  g.addColorStop(0, rgb(keyed(SKY_TOP, t)));
  g.addColorStop(1, rgb(keyed(SKY_HORIZON, t)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, horizonY + 2);
  // Low sun sinking behind the skyline.
  const sx = w * 0.78;
  const sy = horizonY - h * 0.28 + t * h * 0.36;
  const sr = Math.min(w, h) * 0.05;
  const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 9);
  glow.addColorStop(0, `rgba(255,214,160,${0.75 * (1 - t * 0.8)})`);
  glow.addColorStop(0.15, `rgba(240,160,96,${0.35 * (1 - t * 0.7)})`);
  glow.addColorStop(1, 'rgba(240,160,96,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, horizonY);
  ctx.fillStyle = `rgba(255,232,200,${0.95 * (1 - t)})`;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();
}

function drawBuildings(ctx, w, h, t, { scroll, depth, baseY, scale, seed, haze, windows }) {
  const horizon = keyed(SKY_HORIZON, t);
  const facade = mix(keyed(FACADE, t), horizon, haze);
  const spacing = 230 * scale;
  const start = Math.floor(scroll / spacing) - 2;
  const end = Math.ceil((scroll + w) / spacing) + 2;
  for (let i = start; i < end; i++) {
    const r = rand(seed * 7919 + i * 104729);
    const bw = spacing * (0.7 + r() * 0.9);
    const bh = (180 + r() * 420) * scale * (h > w ? 1.6 : 1);
    const x = i * spacing - scroll + r() * spacing * 0.3;
    const top = baseY - bh;
    ctx.fillStyle = rgb(facade);
    ctx.fillRect(x, top, bw, bh + 2);
    // Rooftop detail.
    if (r() > 0.5) ctx.fillRect(x + bw * 0.2, top - 14 * scale, bw * 0.18, 14 * scale);
    // Edge light from the low sun.
    ctx.fillStyle = rgb(mix(horizon, [255, 220, 180], 0.3), 0.18 * (1 - t) * (1 - haze));
    ctx.fillRect(x + bw - 3 * scale, top, 3 * scale, bh);
    if (!windows) continue;
    const cols = Math.max(2, Math.floor(bw / (26 * scale)));
    const rows = Math.max(2, Math.floor(bh / (34 * scale)));
    const ww = 11 * scale;
    const wh = 16 * scale;
    const gx = (bw - cols * ww) / (cols + 1);
    for (let cx = 0; cx < cols; cx++)
      for (let cy = 0; cy < rows - 1; cy++) {
        const k = r();
        const onAt = 0.3 + k * 1.05;
        const wx = x + gx + cx * (ww + gx);
        const wy = top + 18 * scale + cy * (wh + 18 * scale);
        if (t > onAt) {
          const a = Math.min(1, (t - onAt) * 8) * (0.55 + 0.45 * ((k * 13) % 1));
          ctx.fillStyle = `rgba(243,${190 + Math.floor(k * 30)},${120 + Math.floor(k * 40)},${a})`;
        } else {
          ctx.fillStyle = rgb(mix(facade, keyed(SKY_TOP, t), 0.35), 0.8);
        }
        ctx.fillRect(wx, wy, ww, wh);
      }
  }
  // Atmospheric haze at the base of each layer.
  const hg = ctx.createLinearGradient(0, baseY - 160 * scale, 0, baseY);
  hg.addColorStop(0, rgb(horizon, 0));
  hg.addColorStop(1, rgb(horizon, 0.25 * haze + 0.08));
  ctx.fillStyle = hg;
  ctx.fillRect(0, baseY - 160 * scale, w, 160 * scale);
}

function drawStreet(ctx, w, h, t, { scroll, roadY, ppm }) {
  const asphalt = mix(hex('#3b3c42'), hex('#121318'), t);
  ctx.fillStyle = rgb(mix(asphalt, [80, 80, 86], 0.25));
  ctx.fillRect(0, roadY - 10, w, 12); // kerb / pavement edge
  const g = ctx.createLinearGradient(0, roadY, 0, h);
  g.addColorStop(0, rgb(asphalt));
  g.addColorStop(1, rgb(mix(asphalt, [6, 6, 8], 0.6)));
  ctx.fillStyle = g;
  ctx.fillRect(0, roadY, w, h - roadY);
  // Lane dashes in the near lane.
  const dashY = roadY + (h - roadY) * 0.45;
  const dash = 1.5 * ppm;
  ctx.fillStyle = rgb(mix(hex('#c9c4ba'), hex('#5c5a58'), t), 0.7);
  for (let x = -(scroll % (dash * 3)); x < w; x += dash * 3) ctx.fillRect(x, dashY, dash, 5);
  // Street lamps on the far kerb every 12 m (so drawn smaller, with slower parallax), switching on as the light drops.
  const lampOn = Math.min(1, Math.max(0, (t - 0.5) * 5));
  const ls = 0.42;
  const spacing = 12 * ppm * ls;
  const lscroll = scroll * 0.7;
  for (let x = -(lscroll % spacing) - spacing; x < w + spacing; x += spacing) {
    const lx = x + spacing * 0.5;
    const top = roadY - 5 * ppm * ls;
    ctx.fillStyle = '#16171c';
    ctx.fillRect(lx - 4, top, 8, roadY - top);
    ctx.fillRect(lx - 4, top, 0.9 * ppm * ls, 6);
    const hx = lx + 0.9 * ppm * ls;
    ctx.fillStyle = lampOn > 0 ? `rgba(255,214,160,${0.4 + 0.6 * lampOn})` : '#2a2b31';
    ctx.fillRect(hx - 14, top + 4, 28, 6);
    if (lampOn > 0) {
      const cone = ctx.createRadialGradient(hx, top + 8, 0, hx, top + 8, 1.6 * ppm);
      cone.addColorStop(0, `rgba(255,205,150,${0.35 * lampOn})`);
      cone.addColorStop(1, 'rgba(255,205,150,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = cone;
      ctx.fillRect(hx - 1.6 * ppm, top - 1.6 * ppm, 3.2 * ppm, roadY - top + 1.6 * ppm + 40);
      // Pool of light on the road.
      ctx.save();
      ctx.translate(hx, roadY + 8);
      ctx.scale(1, 0.18);
      const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.2 * ppm);
      pool.addColorStop(0, `rgba(255,190,130,${0.3 * lampOn})`);
      pool.addColorStop(1, 'rgba(255,190,130,0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.arc(0, 0, 1.2 * ppm, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

function drawForeground(ctx, w, h, t, { scroll, roadY, ppm }) {
  // Bollards close to camera: fast parallax sells the speed.
  const spacing = 9 * ppm * 1.6;
  const r = rand(99);
  for (let x = -(scroll % spacing) - spacing; x < w + spacing; x += spacing) {
    const bx = x + spacing * 0.3 + r() * 40;
    const top = h - 0.75 * ppm;
    const bw = 0.26 * ppm;
    ctx.fillStyle = rgb(mix(hex('#1c1d22'), hex('#08080a'), t));
    ctx.beginPath();
    ctx.roundRect(bx, top, bw, h - top + 20, [bw / 2, bw / 2, 0, 0]);
    ctx.fill();
    ctx.fillStyle = `rgba(208,138,78,${0.2 + 0.6 * t})`;
    ctx.fillRect(bx, top + 0.14 * ppm, bw, 0.04 * ppm);
  }
}

function drawBikeLayer(ctx, w, h, t, fmt, dist) {
  const lights = Math.min(1, 0.35 + Math.max(0, t - 0.35) * 1.6);
  const bx = w * fmt.bikeX;
  const bob = Math.sin(dist * 2.1) * 1.2;
  const cam = makeCamera({ yaw: 0, pitch: 0.03, ppm: fmt.ppm, cx: bx, cy: fmt.roadY - 0.55 * fmt.ppm + bob, pivot: [0, 0.55, 0], dist: 9 });
  // Contact shadow on the road.
  const a = cam.project([GEO.RA[0], 0, 0]);
  const b = cam.project([GEO.FA[0], 0, 0]);
  ctx.save();
  ctx.translate((a[0] + b[0]) / 2, a[1] + 4);
  ctx.scale(1, 0.08);
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, (b[0] - a[0]) * 0.75);
  sg.addColorStop(0, 'rgba(0,0,0,0.6)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(0, 0, (b[0] - a[0]) * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Headlight beam on the road ahead.
  if (t > 0.3) {
    const hl = cam.project([GEO.HT[0] + 0.07, GEO.HT[1] - 0.05, 0]);
    const k = Math.min(1, (t - 0.3) * 2.5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient(hl[0], 0, hl[0] + 3.5 * fmt.ppm, 0);
    beam.addColorStop(0, `rgba(255,236,210,${0.16 * k})`);
    beam.addColorStop(1, 'rgba(255,236,210,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(hl[0], hl[1] - 4);
    ctx.lineTo(hl[0] + 3.5 * fmt.ppm, fmt.roadY + 0.05 * fmt.ppm);
    ctx.lineTo(hl[0] + 3.5 * fmt.ppm, fmt.roadY + 0.7 * fmt.ppm);
    ctx.lineTo(hl[0], hl[1] + 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  const spin = -dist / GEO.wheelR;
  renderBike(ctx, buildBike({ spinRear: spin, spinFront: spin, crank: -dist / 1.45, lights, rider: true }), cam);
}

function renderFrame(canvas, fmt, t) {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d');
  const dist = t * duration * SPEED;
  const px = dist * fmt.ppm;
  const horizon = fmt.roadY - 10;
  drawSky(ctx, w, h, t, horizon);
  const s = h > w ? 1.15 : 1;
  drawBuildings(ctx, w, h, t, { scroll: px * 0.08 + 4000, depth: 0, baseY: horizon, scale: 0.55 * s, seed: 1, haze: 0.7, windows: false });
  drawBuildings(ctx, w, h, t, { scroll: px * 0.22 + 3000, depth: 1, baseY: horizon, scale: 0.8 * s, seed: 2, haze: 0.4, windows: true });
  drawBuildings(ctx, w, h, t, { scroll: px * 0.45 + 2000, depth: 2, baseY: horizon, scale: 1.05 * s, seed: 3, haze: 0.12, windows: true });
  drawStreet(ctx, w, h, t, { scroll: px, roadY: fmt.roadY, ppm: fmt.ppm });
  drawBikeLayer(ctx, w, h, t, fmt, dist);
  drawForeground(ctx, w, h, t, { scroll: px * 1.6, roadY: fmt.roadY, ppm: fmt.ppm });
  // Gentle vignette, matching the story's dark scenes at the edges.
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(11,12,15,0)');
  v.addColorStop(1, 'rgba(11,12,15,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

const previewOnly = process.argv.includes('--preview');
mkdirSync(OUT, { recursive: true });
mkdirSync(STILLS, { recursive: true });

for (const fmt of FORMATS) {
  fmt.roadY = Math.round(fmt.h * fmt.roadY);
  if (previewOnly) {
    const c = createCanvas(fmt.w, fmt.h);
    for (const t of [0.05, 0.5, 0.95]) {
      renderFrame(c, fmt, t);
      writeFileSync(join(ROOT, '.scratch', `city-${fmt.name}-${t}.png`), await c.encode('png'));
    }
    continue;
  }
  const tmp = join(tmpdir(), `vela-city-${fmt.name}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const canvas = createCanvas(fmt.w, fmt.h);
  for (let i = 0; i < FRAMES; i++) {
    renderFrame(canvas, fmt, i / (FRAMES - 1));
    writeFileSync(join(tmp, `${String(i).padStart(4, '0')}.png`), await canvas.encode('png'));
  }
  const out = join(OUT, `city-${fmt.name}.mp4`);
  // -g 1: every frame is a keyframe (all-intra) so currentTime seeks are instant in both directions.
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(tmp, '%04d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(fmt.crf), '-g', '1', '-keyint_min', '1', '-sc_threshold', '0',
    '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', '-an', out,
  ]);
  console.log(`city-${fmt.name}.mp4: ${(statSync(out).size / 1024 / 1024).toFixed(2)} MB, ${FRAMES} frames all-intra`);

  // Poster (first frame) and dusk still for the static fallback.
  renderFrame(canvas, fmt, 0);
  writeFileSync(join(OUT, `poster-${fmt.name}.webp`), await canvas.encode('webp', 70));
  renderFrame(canvas, fmt, 0.82);
  if (fmt.name === '1080') {
    writeFileSync(join(STILLS, 'city-1600.webp'), await canvas.encode('webp', 76));
    writeFileSync(join(STILLS, 'city-1600.avif'), await canvas.encode('avif', { quality: 25, speed: 5 }));
  } else {
    writeFileSync(join(STILLS, 'city-720.webp'), await canvas.encode('webp', 72));
  }
  rmSync(tmp, { recursive: true, force: true });
}
