// POST /api/events  (analytics beacon)  |  GET /api/events  (success-metric summary, PRD section 10)
// Set METRICS_TOKEN to require ?token=... for the summary.
import { appendEvent, readEvents, readBookings } from '../../server/store.js';
import { json, problem, rateLimited } from '../../server/http.js';

export const prerender = false;

const ALLOWED = new Set(['story_depth', 'skip_to_specs', 'cta_test_ride', 'cta_configure', 'specs_test_ride', 'configurator_session', 'configurator_change', 'configurator_screenshot', 'booking_step', 'booking_complete']);

export async function POST({ request, clientAddress }) {
  if (rateLimited(`ev:${clientAddress}`, 300, 60 * 1000)) return new Response(null, { status: 429 });
  try {
    const e = JSON.parse(await request.text());
    if (!ALLOWED.has(e.name)) return new Response(null, { status: 204 });
    await appendEvent({
      name: e.name,
      data: typeof e.data === 'object' && e.data ? e.data : {},
      path: String(e.path || '').slice(0, 80),
      session: String(e.session || '').slice(0, 16),
      mode: e.mode === 'static' ? 'static' : 'motion',
      t: Date.now(),
    });
  } catch {
    /* ignore malformed beacons */
  }
  return new Response(null, { status: 204 });
}

export async function GET({ url }) {
  const token = process.env.METRICS_TOKEN;
  if (token && url.searchParams.get('token') !== token) return problem(401, 'unauthorised', 'Token required.');
  const events = await readEvents();
  const sessions = (name) => new Set(events.filter((e) => e.name === name).map((e) => e.session));
  const storySessions = new Set(events.filter((e) => e.path === '/').map((e) => e.session));
  const depthBySession = new Map();
  for (const e of events) if (e.name === 'story_depth') depthBySession.set(e.session, Math.max(depthBySession.get(e.session) || 0, +e.data.depth || 0));
  const depths = [...depthBySession.values()];
  const skip = sessions('skip_to_specs');
  const cfg = sessions('configurator_session');
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  const bookings = await readBookings();
  return json({
    storyVisitors: storySessions.size,
    averageScrollDepth: depths.length ? Math.round(depths.reduce((s, d) => s + d, 0) / depths.length) : null,
    skipToSpecsShare: pct(skip.size, storySessions.size),
    configuratorShareOfStoryVisitors: pct([...cfg].filter((s) => storySessions.has(s)).length, storySessions.size),
    testRideBookings: bookings.filter((b) => b.status === 'confirmed').length,
    targets: { testRideBookings: 1200, averageScrollDepth: 75, skipToSpecsShareMax: 30, configuratorShareOfStoryVisitors: 20 },
  });
}
