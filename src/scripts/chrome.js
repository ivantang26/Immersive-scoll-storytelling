// Site-wide behaviour: mobile menu, motion preference toggle, tracked links.
import { track } from './analytics.js';

export function initChrome() {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    const set = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      nav.dataset.open = String(open);
    };
    toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        set(false);
        toggle.focus();
      }
    });
  }

  // Lets anyone switch the story to the static fallback (FR-6) and back; remembered per browser.
  const motionBtn = document.querySelector('[data-motion-toggle]');
  if (motionBtn) {
    const mode = document.documentElement.dataset.mode;
    motionBtn.textContent = mode === 'motion' ? 'Motion: on' : 'Motion: off';
    motionBtn.setAttribute('aria-pressed', String(mode === 'motion'));
    motionBtn.addEventListener('click', () => {
      const next = document.documentElement.dataset.mode === 'motion' ? 'static' : 'motion';
      try {
        localStorage.setItem('vela-mode', next);
      } catch {
        /* storage unavailable: fall back to the query string */
      }
      const url = new URL(location.href);
      url.searchParams.set('mode', next);
      location.href = url.toString();
    });
  }

  document.querySelectorAll('[data-track]').forEach((el) => {
    el.addEventListener('click', () => track(el.getAttribute('data-track')));
  });
}
