// Test-ride availability. Each partner shop has two demo bikes per hourly slot, Monday to Saturday.
// Locally, partner-side demand is simulated deterministically so some slots show as taken.
import { OPENING } from './shops.js';

export const BOOKING_WINDOW_DAYS = 21;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/** Today's date in the UK, as a UTC-midnight Date (shops run on London time, not server time). */
function londonToday(now) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${ymd}T00:00:00Z`);
}

/** Bookable dates: tomorrow onwards, for three weeks, on days the shops open. */
export function bookableDates(now = new Date()) {
  const out = [];
  const d = londonToday(now);
  for (let i = 1; i <= BOOKING_WINDOW_DAYS; i++) {
    const day = new Date(d.getTime() + i * 86400000);
    if (OPENING.days.includes(day.getUTCDay())) out.push(isoDate(day));
  }
  return out;
}

export function slotsFor(shopId, date, bookings) {
  const slots = [];
  for (let h = OPENING.firstSlot; h <= OPENING.lastSlot; h++) {
    const time = `${String(h).padStart(2, '0')}:00`;
    const partnerTaken = hash(`${shopId}|${date}|${time}`) < 0.28 ? 1 : 0;
    const ours = bookings.filter((b) => b.shopId === shopId && b.date === date && b.time === time && b.status !== 'cancelled').length;
    const left = Math.max(0, OPENING.bikesPerSlot - partnerTaken - ours);
    slots.push({ time, available: left > 0, left });
  }
  return slots;
}
