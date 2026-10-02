// Story page entry. Motion mode boots the engine (+ Lenis on desktop); static mode (FR-6)
// leaves the server-rendered stills and text as they are and only wires up navigation + metrics.
import { SCENES } from '../config/scenes.js';
import { SceneEngine } from './engine/scene-engine.js';
import { sequenceScene, turntableScene, videoScene, specsScene, colourwaysScene } from './scenes.js';
import { initProgressNav } from './progress-nav.js';
import { track } from './analytics.js';

const mode = document.documentElement.dataset.mode;
let maxDepth = 0;

if (mode === 'motion') {
  const engine = new SceneEngine({
    config: SCENES,
    handlers: {
      sequence: sequenceScene,
      turntable: turntableScene,
      video: videoScene,
      specs: specsScene,
      colourways: colourwaysScene,
    },
  });

  // FR-4: Lenis smooth scroll on desktop only; touch devices keep native scrolling.
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (finePointer && navigator.maxTouchPoints === 0) {
    import('lenis').then(({ default: Lenis }) => {
      const lenis = new Lenis({ autoRaf: false, lerp: 0.1, smoothWheel: true });
      engine.useSmoothScroll(lenis);
    });
  }

  engine.mount();
  initProgressNav({ engine });
  engine.onProgress(({ overall }) => {
    if (overall > maxDepth) maxDepth = overall;
  });
  // Honour a deep link like /#city once the layout has real heights.
  if (location.hash) {
    const id = location.hash.slice(1);
    requestAnimationFrame(() => engine.scrollToScene(id));
  }
  window.__vela = engine; // handy for QA in devtools
} else {
  initProgressNav();
  // Depth in static mode: the deepest scene that has entered the viewport.
  const sections = [...document.querySelectorAll('[data-scene]')];
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const i = sections.indexOf(e.target);
        maxDepth = Math.max(maxDepth, (i + 1) / sections.length);
      }
    },
    { threshold: 0.35 },
  );
  sections.forEach((s) => io.observe(s));
}

// Success metric: average story scroll depth (PRD section 10).
let sent = false;
const report = () => {
  if (sent) return;
  sent = true;
  track('story_depth', { depth: Math.round(maxDepth * 100) });
};
addEventListener('pagehide', report);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') report();
  else sent = false;
});
