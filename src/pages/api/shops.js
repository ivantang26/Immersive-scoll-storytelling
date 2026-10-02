// GET /api/shops?postcode=SW1A1AA -> nearest partner shops
import { geocode } from '../../server/geocode.js';
import { nearestShops } from '../../server/shops.js';
import { json, problem } from '../../server/http.js';

export const prerender = false;

export async function GET({ url }) {
  const input = url.searchParams.get('postcode') || '';
  const loc = await geocode(input);
  if (loc.error === 'invalid') return problem(400, 'invalid_postcode', 'Enter a full UK postcode, like SW1A 1AA.');
  if (loc.error) return problem(404, 'postcode_not_found', `We couldn't find ${loc.postcode}. Check it and try again.`);
  try {
    const shops = await nearestShops(loc, 3);
    return json({ postcode: loc.postcode, location: { lat: loc.lat, lng: loc.lng, source: loc.source }, shops });
  } catch {
    return problem(502, 'partner_unavailable', 'Shop finder is temporarily unavailable. Please try again in a minute.');
  }
}
