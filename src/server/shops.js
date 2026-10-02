// Partner-shop directory. In production this is the partner-shop API (set PARTNER_API_URL);
// locally it falls back to this dataset so the booking flow works end to end.
// Shop names are fictional; coordinates are real city locations.

export const SHOPS = [
  { id: 'ldn-clerkenwell', name: 'Spoke & Bearing', area: 'Clerkenwell, London', address: '41 Exmouth Market, London EC1R 4QL', lat: 51.5262, lng: -0.1093 },
  { id: 'ldn-peckham', name: 'Southside Cycle Works', area: 'Peckham, London', address: '12 Bellenden Road, London SE15 5BB', lat: 51.4685, lng: -0.0684 },
  { id: 'ldn-kentish', name: 'Northern Line Bikes', area: 'Kentish Town, London', address: '220 Kentish Town Road, London NW5 2AB', lat: 51.5502, lng: -0.1404 },
  { id: 'ldn-hammersmith', name: 'Riverside Velo', area: 'Hammersmith, London', address: '8 King Street, London W6 0QA', lat: 51.4927, lng: -0.2248 },
  { id: 'brighton', name: 'Lanes Cycle Co.', area: 'Brighton', address: '17 Gardner Street, Brighton BN1 1UP', lat: 50.8237, lng: -0.1384 },
  { id: 'bristol', name: 'Harbourside Wheels', area: 'Bristol', address: '5 Gloucester Road, Bristol BS7 8AA', lat: 51.4687, lng: -2.5907 },
  { id: 'oxford', name: 'Cowley Road Cycles', area: 'Oxford', address: '98 Cowley Road, Oxford OX4 1JE', lat: 51.7489, lng: -1.2392 },
  { id: 'cambridge', name: 'Mill Road Bike Room', area: 'Cambridge', address: '64 Mill Road, Cambridge CB1 2AS', lat: 52.2003, lng: 0.1384 },
  { id: 'birmingham', name: 'Jewellery Quarter Cycles', area: 'Birmingham', address: '30 Frederick Street, Birmingham B1 3HH', lat: 52.4862, lng: -1.9118 },
  { id: 'manchester', name: 'Northern Quarter Velo', area: 'Manchester', address: '14 Oldham Street, Manchester M1 1JQ', lat: 53.4831, lng: -2.2346 },
  { id: 'leeds', name: 'Headrow Cycles', area: 'Leeds', address: '3 Vicar Lane, Leeds LS1 7JH', lat: 53.7987, lng: -1.5413 },
  { id: 'newcastle', name: 'Quayside Bike Co.', area: 'Newcastle', address: '22 Grey Street, Newcastle NE1 6AE', lat: 54.9718, lng: -1.6123 },
  { id: 'edinburgh', name: 'Leith Walk Cycles', area: 'Edinburgh', address: '150 Leith Walk, Edinburgh EH6 5DT', lat: 55.9649, lng: -3.1769 },
  { id: 'glasgow', name: 'West End Wheelworks', area: 'Glasgow', address: '410 Great Western Road, Glasgow G4 9HZ', lat: 55.8743, lng: -4.2805 },
  { id: 'cardiff', name: 'Canton Cycle House', area: 'Cardiff', address: '77 Cowbridge Road East, Cardiff CF11 9AG', lat: 51.4817, lng: -3.2006 },
];

export const OPENING = { days: [1, 2, 3, 4, 5, 6], firstSlot: 9, lastSlot: 16, bikesPerSlot: 2 };

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function nearestShops(point, limit = 3) {
  const base = process.env.PARTNER_API_URL;
  if (base) {
    const res = await fetch(`${base.replace(/\/$/, '')}/shops?lat=${point.lat}&lng=${point.lng}&limit=${limit}`, {
      headers: process.env.PARTNER_API_KEY ? { authorization: `Bearer ${process.env.PARTNER_API_KEY}` } : {},
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`Partner API ${res.status}`);
    return (await res.json()).shops;
  }
  return SHOPS.map((s) => ({ ...s, distanceKm: Math.round(haversineKm(point, s) * 10) / 10 }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export function getShop(id) {
  return SHOPS.find((s) => s.id === id) || null;
}
