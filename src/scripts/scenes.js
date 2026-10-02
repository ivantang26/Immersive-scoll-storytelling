// Scene handlers. Each factory returns { preload, init, resize, update, flexibleHeight }.
// The engine calls update(progress) only while the scene is in the viewport.

import { ImageSequence } from './engine/image-sequence.js';
import { VideoScrub } from './engine/video-scrub.js';
import { VIDEOS } from '../config/media.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function stageSize(el) {
  const stage = el.querySelector('.stage');
  return { w: stage.clientWidth, h: stage.clientHeight };
}

/* ------------------------------------------------------------------ */
/* Image sequence scene (assembly)                                      */
/* ------------------------------------------------------------------ */
export function sequenceScene({ engine, cfg, el }) {
  const canvas = el.querySelector('canvas');
  const loading = el.querySelector('[data-loading]');
  const focusFor = (tier) => cfg.focus?.[tier] || [0.5, 0.5];
  const seq = new ImageSequence({ canvas, name: cfg.sequence, tier: engine.tier, focus: focusFor(engine.tier) });
  let lastP = 0;

  const watchLoading = () => {
    if (!loading) return;
    const tick = () => {
      const pct = Math.round(seq.progressLoaded * 100);
      loading.textContent = `Loading frames ${pct}%`;
      // Hide once the 1-in-8 pass has landed: from then on there are no blank frames.
      if (seq.progressLoaded >= 0.13) {
        loading.hidden = true;
        seq.dirty = true;
        seq.draw(lastP);
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  };

  return {
    seq,
    preload() {
      seq.load();
      watchLoading();
    },
    resize({ tier }) {
      seq.focus = focusFor(tier);
      seq.setTier(tier);
      const { w, h } = stageSize(el);
      seq.resize(w, h);
      seq.dirty = true;
      seq.draw(lastP);
    },
    update(p) {
      lastP = p;
      seq.draw(p);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Turntable: sequence + callouts that track points on the bike         */
/* ------------------------------------------------------------------ */
export function turntableScene(ctx) {
  const { el, cfg, engine } = ctx;
  const base = sequenceScene(ctx);
  const svg = el.querySelector('.callout-lines');
  const callouts = [...el.querySelectorAll('[data-callout]')].map((node) => ({
    node,
    id: node.dataset.callout,
    start: +node.dataset.start,
    end: +node.dataset.end,
    line: svg?.querySelector(`[data-line="${node.dataset.callout}"]`),
    dot: svg?.querySelector(`[data-dot="${node.dataset.callout}"]`),
  }));
  let anchors = null;
  let anchorsTier = null;
  let lastP = 0;

  async function loadAnchors() {
    const set = base.seq.set || (await base.seq.resolveSet());
    if (anchorsTier === set.tier) return;
    anchorsTier = set.tier;
    try {
      anchors = await (await fetch(`/media/${cfg.sequence}/${set.tier}/anchors.json`)).json();
    } catch {
      anchors = null;
    }
  }

  function placeCallouts(p) {
    const seq = base.seq;
    if (!anchors || !seq.box || seq.current < 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const a = anchors[seq.current];
    const { w: sw, h: sh } = stageSize(el);
    const mobile = engine.tier === 'mobile';
    for (const c of callouts) {
      const fadeIn = clamp01((p - c.start) / 0.06);
      const fadeOut = clamp01((c.end - p) / 0.06);
      const t = easeOut(Math.min(fadeIn, fadeOut));
      const pt = a?.[c.id];
      const vis = pt ? pt[2] : 0;
      const alpha = t * Math.min(1, vis * 2.5);
      if (!pt || alpha <= 0.001) {
        c.line?.setAttribute('opacity', '0');
        c.dot?.setAttribute('opacity', '0');
        continue;
      }
      const x = (seq.box.x + pt[0] * seq.box.w) / dpr;
      const y = (seq.box.y + pt[1] * seq.box.h) / dpr;
      const node = c.node;
      // Label geometry relative to the stage.
      const r = node.getBoundingClientRect();
      const stageRect = el.querySelector('.stage').getBoundingClientRect();
      const lx = r.left - stageRect.left;
      const ly = r.top - stageRect.top;
      let ex;
      let ey;
      if (mobile) {
        ex = Math.min(Math.max(x, lx + 12), lx + r.width - 12);
        ey = ly - 8;
      } else {
        const fromLeft = lx > x;
        ex = fromLeft ? lx - 12 : lx + r.width + 12;
        ey = ly + 22;
      }
      const draw = easeOut(t);
      c.line.setAttribute('x1', x.toFixed(1));
      c.line.setAttribute('y1', y.toFixed(1));
      c.line.setAttribute('x2', (x + (ex - x) * draw).toFixed(1));
      c.line.setAttribute('y2', (y + (ey - y) * draw).toFixed(1));
      c.line.setAttribute('opacity', alpha.toFixed(3));
      c.dot.setAttribute('cx', x.toFixed(1));
      c.dot.setAttribute('cy', y.toFixed(1));
      c.dot.setAttribute('opacity', alpha.toFixed(3));
    }
    svg?.setAttribute('viewBox', `0 0 ${sw} ${sh}`);
  }

  base.seq.onDraw = () => placeCallouts(lastP);

  return {
    ...base,
    preload(opts) {
      base.preload(opts);
      loadAnchors();
    },
    resize(info) {
      base.resize(info);
      anchorsTier = null;
      loadAnchors();
    },
    update(p) {
      lastP = p;
      base.update(p);
      placeCallouts(p);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Scroll-scrubbed video (city ride)                                    */
/* ------------------------------------------------------------------ */
export function videoScene({ engine, cfg, el }) {
  const video = el.querySelector('video');
  const spec = VIDEOS[cfg.video];
  let scrub = null;
  const make = (tier) => {
    const src = spec.tiers[tier].src;
    if (scrub?.src === src) return;
    scrub = new VideoScrub({ video, src, fps: spec.fps });
    video.poster = tier === 'mobile' ? spec.poster.mobile : spec.poster.desktop;
  };
  make(engine.tier);
  return {
    preload() {
      scrub.load();
    },
    resize({ tier }) {
      const wasStarted = scrub.started;
      make(tier);
      if (wasStarted) scrub.load();
    },
    update(p) {
      scrub.update(p);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Specs reveal: numbers count up in sequence while the stage is pinned  */
/* ------------------------------------------------------------------ */
export function specsScene({ el }) {
  const stats = [...el.querySelectorAll('[data-stat]')].map((node, i, all) => ({
    node,
    num: node.querySelector('[data-num]'),
    value: +node.dataset.value,
    decimals: +node.dataset.decimals,
    start: 0.04 + (i * 0.7) / all.length,
    shown: null,
  }));
  const fmt = (v, d) => v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
  return {
    init() {
      stats.forEach((s) => (s.num.textContent = fmt(0, s.decimals)));
    },
    update(p) {
      for (const s of stats) {
        const t = clamp01((p - s.start) / 0.16);
        if (t === s.shown) continue;
        s.shown = t;
        const e = easeOut(t);
        s.node.style.opacity = String(0.18 + 0.82 * clamp01(t * 3));
        s.node.style.transform = `translate3d(0, ${((1 - clamp01(t * 3)) * 24).toFixed(1)}px, 0)`;
        s.node.dataset.active = String(t > 0);
        s.num.textContent = fmt(s.value * e, s.decimals);
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* Colourways: vertical scroll moves the row sideways (pinned);          */
/* on mobile it's a native swipe carousel with no pinning.               */
/* ------------------------------------------------------------------ */
export function colourwaysScene({ el }) {
  const track = el.querySelector('.cw-track');
  let distance = 0;
  let mobile = false;
  return {
    flexibleHeight: (tier) => tier === 'mobile',
    resize({ tier }) {
      mobile = tier === 'mobile';
      track.style.transform = '';
      distance = mobile ? 0 : Math.max(0, track.scrollWidth - track.parentElement.clientWidth);
    },
    update(p) {
      if (mobile) return;
      track.style.transform = `translate3d(${(-p * distance).toFixed(1)}px, 0, 0)`;
    },
  };
}
