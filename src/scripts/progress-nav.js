// FR-5: thin copper progress bar with scene jump links.
// Names show on hover, keyboard focus, or long-press on touch. In static mode the links
// are plain in-page anchors, so the nav still works with no engine.

export function initProgressNav({ engine = null } = {}) {
  const nav = document.querySelector('.progress');
  if (!nav) return;
  const fill = nav.querySelector('.progress__fill');
  const links = [...nav.querySelectorAll('[data-jump]')];

  // Long-press (touch) reveals the scene names until the finger lifts plus a short grace period.
  let pressTimer = 0;
  let hideTimer = 0;
  nav.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    clearTimeout(hideTimer);
    pressTimer = setTimeout(() => nav.classList.add('is-open'), 380);
  });
  const release = () => {
    clearTimeout(pressTimer);
    hideTimer = setTimeout(() => nav.classList.remove('is-open'), 1800);
  };
  nav.addEventListener('pointerup', release);
  nav.addEventListener('pointercancel', release);
  nav.addEventListener('contextmenu', (e) => e.preventDefault());

  if (!engine) return;

  links.forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      nav.classList.remove('is-open');
      engine.scrollToScene(a.dataset.jump);
      history.replaceState(null, '', `#${a.dataset.jump}`);
    }),
  );

  let placedFor = -1;
  let lastActive = -1;
  engine.onProgress(({ overall, scenes, active }) => {
    fill.style.transform = `scaleX(${overall.toFixed(4)})`;
    // Re-place markers whenever layout changed (orientation, resize).
    const key = engine.storyEnd + engine.vh;
    if (key !== placedFor) {
      placedFor = key;
      const total = Math.max(1, engine.storyEnd - engine.vh);
      links.forEach((a) => {
        const s = scenes.find((x) => x.cfg.id === a.dataset.jump);
        if (s) a.style.setProperty('--at', `${Math.min(100, (s.top / total) * 100).toFixed(3)}%`);
      });
    }
    if (active !== lastActive) {
      lastActive = active;
      links.forEach((a) => a.removeAttribute('aria-current'));
      const id = scenes[active]?.cfg.id;
      links.find((a) => a.dataset.jump === id)?.setAttribute('aria-current', 'step');
    }
  });
}
