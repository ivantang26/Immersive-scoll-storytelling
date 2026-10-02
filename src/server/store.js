// Tiny JSON-file persistence for bookings and analytics events. Writes are serialised through a
// promise chain so concurrent requests can't interleave. Swap for a real database in production.
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';

const DATA_DIR = process.env.VELA_DATA_DIR || join(process.cwd(), 'data');
const BOOKINGS = join(DATA_DIR, 'bookings.json');
const EVENTS = join(DATA_DIR, 'events.ndjson');

let chain = Promise.resolve();
const serial = (fn) => (chain = chain.then(fn, fn));

async function ensureDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function readBookings() {
  try {
    return JSON.parse(await readFile(BOOKINGS, 'utf8'));
  } catch {
    return [];
  }
}

/** Runs `fn(bookings)` under the write lock; if it returns a booking, it is appended and saved. */
export function withBookings(fn) {
  return serial(async () => {
    await ensureDir();
    const all = await readBookings();
    const result = await fn(all);
    if (result?.booking) {
      all.push(result.booking);
      await writeFile(BOOKINGS, JSON.stringify(all, null, 2));
    }
    return result;
  });
}

export function appendEvent(event) {
  return serial(async () => {
    await ensureDir();
    await appendFile(EVENTS, JSON.stringify(event) + '\n');
  });
}

export async function readEvents() {
  try {
    return (await readFile(EVENTS, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
