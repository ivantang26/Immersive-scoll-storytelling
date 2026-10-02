// Vela scroll-storytelling engine (FR-1, FR-4, FR-5 hooks, PRD section 7).
//
// - Each scene is a tall <section data-scene> with a sticky stage. Heights are set in px from
//   config (vh units x tier scale) so the mobile URL bar showing/hiding doesn't reflow the story.
// - One requestAnimationFrame loop drives everything: smooth scroll, progress, scene updates.
// - Progress is lerped (factor 0.1 per 60 Hz frame, made frame-rate independent).
// - Scenes outside the viewport are not updated, so they stop drawing.
// - A scene at >= 50% progress triggers preloading of the next scene's assets.
// - On orientation / width change, the current scene + progress is restored after re-layout.

import { tierFor, TIERS } from '../../config/media.js';

const LERP = 0.1;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class SceneEngine {
  /**
   * @param {object} opts
   * @param {Array} opts.config scene config (src/config/scenes.js)
   * @param {Record<string, (ctx) => SceneHandler>} opts.handlers factories keyed by scene type
   */
  constructor({ config, handlers }) {
    this.config = config;
    this.handlers = handlers;
    this.scenes = [];
    this.listeners = new Set();
    this.lenis = null;
    this.running = false;
    this.anchor = null;
    this.freezeAnchor = false;
    this.lastTime = 0;
    this.lastWidth = 0;
    this.lastOrientation = '';
    this.vh = window.innerHeight;
    this.tier = tierFor(window.innerWidth);
  }

  mount() {
    for (const cfg of this.config) {
      const el = document.querySelector(`[data-scene="${cfg.id}"]`);
      if (!el) continue;
      const factory = this.handlers[cfg.type];
      const scene = {
        cfg,
        el,
        stage: el.querySelector('.stage'),
        beats: [...el.querySelectorAll('[data-beat]')].map((b) => ({ el: b, start: +b.dataset.start, end: +b.dataset.end, shown: null })),
        top: 0,
        height: 0,
        raw: 0,
        smooth: 0,
        visible: false,
        preloaded: false,
        handler: null,
      };
      scene.handler = factory ? factory({ engine: this, scene, cfg, el }) : null;
      this.scenes.push(scene);
    }
    this.layout();
    // The first scrubbed scene's assets are needed as soon as the visitor starts scrolling.
    this.scenes.find((s) => s.handler?.preload)?.handler.preload({ eager: true });
    this.scenes.forEach((s) => s.handler?.init?.());
    this.bindResize();
    this.running = true;
    requestAnimationFrame(this.tick);
    return this;
  }

  /** Lets Lenis (or any smooth scroller) share the single rAF loop. */
  useSmoothScroll(lenis) {
    this.lenis = lenis;
  }

  onProgress(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  layout() {
    this.vh = window.innerHeight;
    this.tier = tierFor(window.innerWidth);
    const scale = TIERS[this.tier].sceneScale;
    for (const s of this.scenes) {
      const flexible = s.handler?.flexibleHeight?.(this.tier);
      if (flexible) {
        s.el.style.height = '';
      } else {
        const h = Math.max(this.vh, Math.round((s.cfg.height / 100) * this.vh * (s.cfg.height > 100 ? scale : 1)));
        s.el.style.height = `${h}px`;
      }
    }
    // Measure after all heights are applied.
    const y = window.scrollY;
    for (const s of this.scenes) {
      const r = s.el.getBoundingClientRect();
      s.top = r.top + y;
      s.height = r.height;
    }
    const last = this.scenes[this.scenes.length - 1];
    this.storyEnd = last ? last.top + last.height : document.documentElement.scrollHeight;
    this.scenes.forEach((s) => s.handler?.resize?.({ tier: this.tier, width: window.innerWidth, height: this.vh }));
    this.lastWidth = window.innerWidth;
    this.lastOrientation = this.orientation();
  }

  orientation() {
    return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
  }

  bindResize() {
    let timer = 0;
    const onResize = () => {
      // Height-only changes (mobile URL bar) are ignored: scene heights are in px, the stage is 100lvh-safe.
      const widthChanged = window.innerWidth !== this.lastWidth;
      const orientationChanged = this.orientation() !== this.lastOrientation;
      if (!widthChanged && !orientationChanged) return;
      this.freezeAnchor = true;
      clearTimeout(timer);
      timer = setTimeout(() => this.relayout(), 120);
    };
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });
  }

  relayout() {
    const anchor = this.anchor;
    this.layout();
    if (anchor) {
      const s = this.scenes[anchor.index];
      const y = s.top + anchor.progress * Math.max(0, s.height - this.vh);
      this.scrollTo(y, { immediate: true });
    }
    this.lenis?.resize?.();
    // Jump straight to the restored position rather than lerping across the story.
    const y = window.scrollY;
    for (const s of this.scenes) {
      s.raw = s.smooth = clamp01((y - s.top) / Math.max(1, s.height - this.vh));
      s.beats.forEach((b) => (b.shown = null));
    }
    this.freezeAnchor = false;
  }

  scrollTo(y, { immediate = false } = {}) {
    if (this.lenis) this.lenis.scrollTo(y, { immediate, duration: 1.4, force: true });
    else window.scrollTo({ top: y, behavior: immediate ? 'instant' : 'smooth' });
  }

  scrollToScene(id) {
    const s = this.scenes.find((x) => x.cfg.id === id);
    if (!s) return;
    this.scrollTo(s.top);
    s.el.setAttribute('tabindex', '-1');
    s.el.focus({ preventScroll: true });
  }

  tick = (time) => {
    if (!this.running) return;
    const dt = this.lastTime ? Math.min(64, time - this.lastTime) : 16.67;
    this.lastTime = time;
    this.lenis?.raf(time);
    // While a resize/orientation relayout is pending, old heights + new viewport give
    // meaningless progress; hold the current picture until layout settles.
    if (this.freezeAnchor) {
      requestAnimationFrame(this.tick);
      return;
    }

    const y = window.scrollY;
    const vh = this.vh;
    // Frame-rate independent version of "lerp 0.1 per frame at 60 fps".
    const k = 1 - Math.pow(1 - LERP, dt / 16.67);

    let anchor = null;
    for (let i = 0; i < this.scenes.length; i++) {
      const s = this.scenes[i];
      const span = Math.max(1, s.height - vh);
      s.raw = clamp01((y - s.top) / span);
      s.visible = y + vh > s.top && y < s.top + s.height;
      if (!anchor && y < s.top + s.height) anchor = { index: i, progress: s.raw };

      const diff = s.raw - s.smooth;
      s.smooth = Math.abs(diff) < 0.0002 ? s.raw : s.smooth + diff * k;

      if (s.raw >= 0.5 && !s.preloaded) {
        s.preloaded = true;
        this.scenes[i + 1]?.handler?.preload?.({ eager: false });
      }
      if (!s.visible) continue;
      s.handler?.update?.(s.smooth, s);
      this.updateBeats(s);
    }
    if (!this.freezeAnchor && anchor) this.anchor = anchor;

    const total = Math.max(1, this.storyEnd - vh);
    const overall = clamp01(y / total);
    for (const fn of this.listeners) fn({ overall, scenes: this.scenes, active: anchor?.index ?? 0 });
    requestAnimationFrame(this.tick);
  };

  /** Beats fade and rise 24px over 8% of progress, hold, then fade out (PRD section 7). */
  updateBeats(s) {
    const p = s.smooth;
    for (const b of s.beats) {
      const FADE = 0.08;
      const inT = clamp01((p - b.start) / FADE);
      const outT = clamp01((b.end - p) / FADE);
      const t = Math.min(inT, outT);
      if (t === b.shown) continue;
      b.shown = t;
      const eased = 1 - Math.pow(1 - t, 3);
      b.el.style.opacity = eased.toFixed(3);
      b.el.style.transform = `translate3d(0, ${((1 - eased) * 24).toFixed(2)}px, 0)`;
      // Opacity only: visibility/display would hide beats from screen readers, which read them in DOM order.
      b.el.dataset.active = String(t > 0.5);
    }
  }
}
