// Minimal first-party analytics for the PRD success metrics (scroll depth, skip-to-specs share,
// configurator sessions, bookings). Events go to /api/events via sendBeacon; nothing personal is sent.

const SESSION_KEY = 'vela-session';

function sessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

export function track(name, data = {}) {
  const body = JSON.stringify({ name, data, path: location.pathname, session: sessionId(), mode: document.documentElement.dataset.mode, t: Date.now() });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }));
    else fetch('/api/events', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true });
  } catch {
    /* analytics must never break the page */
  }
}
