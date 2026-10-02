// UK postcode lookup: postcodes.io (free, no key), with an offline postcode-area fallback
// so the flow still works if the lookup service is slow or unreachable.

const OUTWARD = /^([A-Z]{1,2}\d[A-Z\d]?)$/;

// Approximate centroids for common postcode areas (leading letters).
const AREAS = {
  E: [51.54, -0.03], EC: [51.518, -0.097], N: [51.58, -0.11], NW: [51.55, -0.18], SE: [51.46, -0.05], SW: [51.46, -0.17],
  W: [51.51, -0.22], WC: [51.517, -0.12], BR: [51.39, 0.03], CR: [51.37, -0.1], DA: [51.44, 0.2], EN: [51.65, -0.08],
  HA: [51.58, -0.33], IG: [51.57, 0.08], KT: [51.39, -0.29], RM: [51.56, 0.18], SM: [51.36, -0.18], TW: [51.45, -0.35],
  UB: [51.53, -0.43], WD: [51.66, -0.4], BN: [50.83, -0.15], BS: [51.46, -2.59], BA: [51.38, -2.36], OX: [51.75, -1.25],
  CB: [52.2, 0.13], B: [52.48, -1.9], CV: [52.41, -1.51], M: [53.48, -2.24], SK: [53.4, -2.15], L: [53.41, -2.98],
  LS: [53.8, -1.55], BD: [53.79, -1.75], S: [53.38, -1.47], NG: [52.95, -1.15], LE: [52.64, -1.13], NE: [54.97, -1.61],
  EH: [55.95, -3.19], G: [55.86, -4.25], CF: [51.48, -3.18], RG: [51.45, -0.97], GU: [51.24, -0.57], MK: [52.04, -0.76],
  YO: [53.96, -1.08], PO: [50.8, -1.09], SO: [50.91, -1.4], EX: [50.72, -3.53], PL: [50.38, -4.14], NR: [52.63, 1.3],
};

export function normalisePostcode(input) {
  const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const full = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  if (full) return { postcode: `${full[1]} ${full[2]}`, outward: full[1], full: true };
  if (OUTWARD.test(raw)) return { postcode: raw, outward: raw, full: false };
  return null;
}

export async function geocode(input) {
  const pc = normalisePostcode(input);
  if (!pc) return { error: 'invalid' };
  try {
    const path = pc.full ? `postcodes/${encodeURIComponent(pc.postcode)}` : `outcodes/${encodeURIComponent(pc.outward)}`;
    const res = await fetch(`https://api.postcodes.io/${path}`, { signal: AbortSignal.timeout(2500) });
    if (res.status === 404) return { error: 'not_found', postcode: pc.postcode };
    if (res.ok) {
      const { result } = await res.json();
      if (result?.latitude != null) return { postcode: pc.postcode, lat: result.latitude, lng: result.longitude, source: 'postcodes.io' };
    }
  } catch {
    /* network failure: use the offline table */
  }
  const area = pc.outward.match(/^[A-Z]+/)[0];
  const c = AREAS[area] || AREAS[area[0]];
  if (!c) return { error: 'not_found', postcode: pc.postcode };
  return { postcode: pc.postcode, lat: c[0], lng: c[1], source: 'area-centroid' };
}
