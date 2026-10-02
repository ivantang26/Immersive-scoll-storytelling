// FR-2: canvas image sequence.
// - Frames load in priority order: first frame, every 8th, then every 4th, 2nd, and the rest,
//   so the whole scene is scrubbable early and fills in detail as bandwidth allows.
// - draw() always shows the nearest loaded frame, so there are no blank frames once the
//   first pass (1 in 8) has landed.
// - Desktop uses AVIF and falls back to the tablet WebP set if the browser can't decode AVIF.

import { SEQUENCES, framePath, frameCount, AVIF_FALLBACK_TIER } from '../../config/media.js';

let avifSupport;
export function supportsAvif() {
  if (avifSupport) return avifSupport;
  avifSupport = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width > 0);
    img.onerror = () => resolve(false);
    img.src =
      'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUEAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABgAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgSAAAAAAABNjb2xybmNseAACAAIAAoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACBtZGF0EgAKBDgANgkyDhrAGGGGBAAAr2J5BZ8g';
  });
  return avifSupport;
}

export function priorityOrder(n) {
  const order = [];
  const seen = new Uint8Array(n);
  const push = (i) => {
    if (i >= 0 && i < n && !seen[i]) {
      seen[i] = 1;
      order.push(i);
    }
  };
  push(0);
  for (const step of [8, 4, 2, 1]) for (let i = 0; i < n; i += step) push(i);
  push(n - 1);
  return order;
}

export class ImageSequence {
  constructor({ canvas, name, tier, focus = [0.5, 0.5], background = '#0B0C0F', onDraw = null }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.name = name;
    this.focus = focus;
    this.background = background;
    this.onDraw = onDraw;
    this.frames = [];
    this.loadedCount = 0;
    this.current = -1;
    this.dirty = true;
    this.started = false;
    this.setTier(tier);
  }

  setTier(tier) {
    if (tier === this.tier) return;
    const restart = this.started;
    this.tier = tier;
    this.abort?.abort();
    this.frames = [];
    this.loadedCount = 0;
    this.started = false;
    this.dirty = true;
    if (restart) this.load();
  }

  async resolveSet() {
    let tier = this.tier;
    const ext = SEQUENCES[this.name].tiers[tier].ext;
    if (ext === 'avif' && !(await supportsAvif())) tier = AVIF_FALLBACK_TIER;
    const spec = SEQUENCES[this.name].tiers[tier];
    return { tier, spec, count: frameCount(this.name, tier) };
  }

  /** Starts loading frames. `concurrency` keeps the network pipe full without starving other scenes. */
  async load({ concurrency = 6 } = {}) {
    if (this.started) return;
    this.started = true;
    const abort = (this.abort = new AbortController());
    const set = await this.resolveSet();
    if (abort.signal.aborted) return;
    this.set = set;
    this.frames = new Array(set.count).fill(null);
    const queue = priorityOrder(set.count);
    const worker = async () => {
      while (queue.length && !abort.signal.aborted) {
        const i = queue.shift();
        const img = new Image();
        img.decoding = 'async';
        img.src = framePath(this.name, set.tier, i);
        try {
          await img.decode();
        } catch {
          continue; // a missing frame just falls back to its nearest neighbour
        }
        if (abort.signal.aborted) return;
        this.frames[i] = img;
        this.loadedCount++;
        // Redraw if the newly loaded frame is closer to what we want than what's on screen.
        if (this.wanted != null && Math.abs(i - this.wanted) < Math.abs(this.current - this.wanted)) this.dirty = true;
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
  }

  get progressLoaded() {
    return this.frames.length ? this.loadedCount / this.frames.length : 0;
  }

  nearestLoaded(i) {
    const f = this.frames;
    if (f[i]) return i;
    for (let d = 1; d < f.length; d++) {
      if (f[i - d]) return i - d;
      if (f[i + d]) return i + d;
    }
    return -1;
  }

  resize(cssW, cssH) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.dirty = true;
    }
  }

  /** Fits the frame so its subject (safe box) is always fully visible, centred at `focus`. */
  layoutFor(img) {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const fw = img.naturalWidth;
    const fh = img.naturalHeight;
    const safe = this.set?.spec.safe || [0.66, 0.66];
    let s = Math.max(cw / fw, ch / fh);
    s = Math.min(s, (cw * 0.98) / (fw * safe[0]), (ch * 0.86) / (fh * safe[1]));
    const dw = fw * s;
    const dh = fh * s;
    return { x: cw * this.focus[0] - dw / 2, y: ch * this.focus[1] - dh / 2, w: dw, h: dh, s };
  }

  /** When the frame is letterboxed, fade its visible edges into the page background. */
  featherEdges(box) {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const edges = [
      [box.y > 0, box.x, box.y, box.x, box.y + box.h * 0.14, [box.x, box.y, box.w, box.h * 0.14]],
      [box.y + box.h < ch, box.x, box.y + box.h, box.x, box.y + box.h * 0.86, [box.x, box.y + box.h * 0.86, box.w, box.h * 0.14]],
      [box.x > 0, box.x, box.y, box.x + box.w * 0.1, box.y, [box.x, box.y, box.w * 0.1, box.h]],
      [box.x + box.w < cw, box.x + box.w, box.y, box.x + box.w * 0.9, box.y, [box.x + box.w * 0.9, box.y, box.w * 0.1, box.h]],
    ];
    for (const [show, x0, y0, x1, y1, rect] of edges) {
      if (!show) continue;
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, this.background);
      g.addColorStop(1, 'rgba(11,12,15,0)');
      ctx.fillStyle = g;
      ctx.fillRect(rect[0], rect[1], rect[2], rect[3]);
    }
  }

  draw(progress) {
    if (!this.frames.length) return;
    const want = Math.round(progress * (this.frames.length - 1));
    this.wanted = want;
    const idx = this.nearestLoaded(want);
    if (idx < 0 || (idx === this.current && !this.dirty)) return;
    const img = this.frames[idx];
    const box = this.layoutFor(img);
    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(img, box.x, box.y, box.w, box.h);
    this.featherEdges(box);
    this.current = idx;
    this.dirty = false;
    this.box = box;
    this.onDraw?.(idx, box);
  }
}
