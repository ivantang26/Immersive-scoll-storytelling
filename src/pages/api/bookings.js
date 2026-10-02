// POST /api/bookings -> creates a test-ride booking and sends the confirmation email.
import { randomBytes } from 'node:crypto';
import { getShop } from '../../server/shops.js';
import { bookableDates, slotsFor } from '../../server/slots.js';
import { withBookings } from '../../server/store.js';
import { sendConfirmation } from '../../server/email.js';
import { json, problem, rateLimited } from '../../server/http.js';
import { COLOURWAYS, ACCESSORIES } from '../../config/product.js';

export const prerender = false;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function reference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'VELA-' + [...randomBytes(6)].map((b) => alphabet[b % alphabet.length]).join('');
}

function validate(body) {
  const errors = {};
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').replace(/[\s()-]/g, '');
  if (name.length < 2 || name.length > 80) errors.name = 'Enter your full name.';
  if (!EMAIL.test(email) || email.length > 200) errors.email = 'Enter an email address, like name@example.com.';
  if (!/^(\+44|0)\d{9,10}$/.test(phone)) errors.phone = 'Enter a UK phone number, like 07700 900123.';
  if (!getShop(body.shopId)) errors.shopId = 'Choose a shop.';
  if (!bookableDates().includes(body.date)) errors.date = 'Choose a date.';
  if (!/^\d{2}:00$/.test(String(body.time || ''))) errors.time = 'Choose a time.';
  if (body.consent !== true) errors.consent = 'Please agree so the shop can contact you about this ride.';
  return { errors, clean: { name, email, phone } };
}

export async function POST({ request, clientAddress }) {
  if (rateLimited(`book:${clientAddress}`, 8, 60 * 60 * 1000)) return problem(429, 'rate_limited', 'Too many booking attempts. Please try again later.');
  let body;
  try {
    body = await request.json();
  } catch {
    return problem(400, 'bad_json', 'Invalid request.');
  }
  // Honeypot: real people never fill the hidden "company" field.
  if (body.company) return json({ reference: 'VELA-OK' }, 201);

  const { errors, clean } = validate(body);
  if (Object.keys(errors).length) return problem(422, 'validation', 'Check the highlighted fields.', { fields: errors });

  const shop = getShop(body.shopId);
  const colour = COLOURWAYS.find((c) => c.id === body.config?.colour) || COLOURWAYS[0];
  const extras = ACCESSORIES.filter((a) => body.config?.[a.id]).map((a) => a.name.toLowerCase());

  const result = await withBookings((all) => {
    const slot = slotsFor(shop.id, body.date, all).find((s) => s.time === body.time);
    if (!slot?.available) return { conflict: true };
    return {
      booking: {
        reference: reference(),
        status: 'confirmed',
        createdAt: new Date().toISOString(),
        shopId: shop.id,
        date: body.date,
        time: body.time,
        ...clean,
        postcode: String(body.postcode || '').slice(0, 10),
        config: { colour: colour.id, colourName: colour.name, extras },
      },
    };
  });
  if (result.conflict) return problem(409, 'slot_taken', 'Sorry, that slot was just taken. Please pick another time.');

  const booking = result.booking;
  let email = { transport: 'failed' };
  try {
    email = await sendConfirmation({ ...booking, shop });
  } catch (err) {
    // The booking stands; the shop still receives it. Surface the email problem to the visitor.
    console.error('[email] confirmation failed', err);
  }
  return json(
    {
      reference: booking.reference,
      date: booking.date,
      time: booking.time,
      shop: { name: shop.name, address: shop.address },
      bike: { colour: colour.name, extras },
      email: { to: booking.email, status: email.transport === 'failed' ? 'failed' : 'sent', transport: email.transport },
    },
    201,
  );
}
