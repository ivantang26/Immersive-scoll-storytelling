// Checks the PRD section 8 budgets: story assets under 18 MB on desktop and 8 MB on mobile,
// plus the first-scene payload (what must load before the Arrival scene is complete).
// Run after `npm run build` so JS/CSS sizes come from the production bundle.
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { SEQUENCES, VIDEOS, frameCount, framePath } from '../src/config/media.js';
import { SCENES } from '../src/config/scenes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'public');
const DIST = join(ROOT, 'dist', 'client');
const size = (p) => (existsSync(p) ? statSync(p).size : 0);
const mb = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';
const kb = (b) => (b / 1024).toFixed(0) + ' KB';

function sequenceBytes(name, tier) {
  let total = 0;
  for (let i = 0; i < frameCount(name, tier); i++) total += size(join(PUB, framePath(name, tier, i)));
  return total + size(join(PUB, 'media', name, tier, 'anchors.json'));
}

function bundleBytes() {
  if (!existsSync(DIST)) return null;
  const html = join(DIST, 'index.html');
  const page = readFileSync(html, 'utf8');
  const refs = [...page.matchAll(/(?:src|href)="(\/_astro\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  let gz = gzipSync(page).length;
  const walk = (file, seen = new Set()) => {
    if (seen.has(file)) return 0;
    seen.add(file);
    const p = join(DIST, file);
    if (!existsSync(p)) return 0;
    const src = readFileSync(p);
    let n = gzipSync(src).length;
    // Follow static imports so the whole first-load graph is counted (dynamic imports are excluded).
    for (const m of src.toString().matchAll(/(?:^|[;\n])\s*import\s*(?:[^'"()]*?from\s*)?["']\.\/([^"']+\.js)["']/g)) n += walk('/_astro/' + m[1], seen);
    return n;
  };
  const seen = new Set();
  for (const r of refs) gz += walk(r, seen);
  return gz;
}

const fonts = ['@fontsource-variable/geist/files/geist-latin-wght-normal.woff2', '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2'].reduce(
  (s, f) => s + size(join(ROOT, 'node_modules', f)),
  0,
);

const rows = [];
let failed = false;
for (const [tier, budget] of [['desktop', 18], ['tablet', 18], ['mobile', 8]]) {
  const big = tier !== 'mobile';
  const parts = {
    assembly: sequenceBytes('assembly', tier),
    turntable: sequenceBytes('turntable', tier),
    'city video': size(join(PUB, VIDEOS.city.tiers[tier].src)) + size(join(PUB, big ? VIDEOS.city.poster.desktop : VIDEOS.city.poster.mobile)),
    colourways: ['obsidian', 'bone', 'tidewater'].reduce((s, id) => s + size(join(PUB, 'media', 'colourways', `${id}-${big ? 1600 : 800}.webp`)), 0),
    'cta still': size(join(PUB, 'media', 'stills', tier === 'desktop' ? 'cta-1600.avif' : tier === 'tablet' ? 'cta-1080.webp' : 'cta-720.webp')),
    fonts,
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  const ok = total <= budget * 1024 * 1024;
  failed ||= !ok;
  rows.push({ tier, total, budget, ok, parts });
}

console.log('\nStory asset budget (PRD section 8)\n');
for (const r of rows) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.tier.padEnd(8)} ${mb(r.total).padStart(9)}  of ${r.budget} MB`);
  for (const [k, v] of Object.entries(r.parts)) console.log(`        ${k.padEnd(12)} ${kb(v).padStart(8)}`);
}

const bundle = bundleBytes();
const firstScene = (bundle ?? 0) + fonts;
console.log(`\nFirst scene (Arrival): HTML + CSS + JS (gzip) + fonts = ${bundle == null ? 'run `npm run build` first' : kb(firstScene)}`);
if (bundle != null) {
  // 4G profile used by Lighthouse: ~1.6 Mbps effective, 150 ms RTT. Budget 3 s.
  const seconds = 0.15 * 4 + (firstScene * 8) / 1.6e6;
  console.log(`  Estimated on slow 4G (1.6 Mbps, 150 ms RTT): ${seconds.toFixed(2)} s of 3 s budget ${seconds <= 3 ? 'PASS' : 'FAIL'}`);
  failed ||= seconds > 3;
}
console.log(`\nScenes: ${SCENES.map((s) => s.id).join(', ')}. Assembly frames: ${SEQUENCES.assembly.source} master, ${frameCount('assembly', 'mobile')} on mobile.\n`);
process.exit(failed ? 1 : 0);
