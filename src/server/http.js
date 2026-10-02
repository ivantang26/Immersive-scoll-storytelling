export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export const problem = (status, code, message, extra = {}) => json({ error: { code, message, ...extra } }, status);

// Fixed-window in-memory rate limit, per key. Good enough for a single Node instance.
const buckets = new Map();
export function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return false;
  }
  b.count++;
  return b.count > limit;
}
