// GET /api/slots?shop=ldn-clerkenwell[&date=YYYY-MM-DD]
// Without a date: the bookable dates. With a date: hourly slots and availability.
import { getShop } from '../../server/shops.js';
import { bookableDates, slotsFor } from '../../server/slots.js';
import { readBookings } from '../../server/store.js';
import { json, problem } from '../../server/http.js';

export const prerender = false;

export async function GET({ url }) {
  const shop = getShop(url.searchParams.get('shop'));
  if (!shop) return problem(404, 'unknown_shop', 'That shop is not taking bookings.');
  const dates = bookableDates();
  const date = url.searchParams.get('date');
  if (!date) return json({ shop: shop.id, dates });
  if (!dates.includes(date)) return problem(400, 'invalid_date', 'Pick a date in the next three weeks, Monday to Saturday.');
  return json({ shop: shop.id, date, slots: slotsFor(shop.id, date, await readBookings()) });
}
