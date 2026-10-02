// Single source of truth for generated media. Imported by the render scripts
// (to know what to produce) and by the scene engine (to know what to load).

/** Device tiers from PRD section 6. Width breakpoints are CSS pixels. */
export const TIERS = {
  mobile: { maxWidth: 767, sceneScale: 0.7 },
  tablet: { maxWidth: 1199, sceneScale: 0.85 },
  desktop: { maxWidth: Infinity, sceneScale: 1 },
};

export function tierFor(width) {
  if (width <= TIERS.mobile.maxWidth) return 'mobile';
  if (width <= TIERS.tablet.maxWidth) return 'tablet';
  return 'desktop';
}

/**
 * Image sequences. `source` is the master frame count; each tier renders every `step`th frame.
 * `safe` is the box (fraction of frame width/height) holding the bike, which the fit logic keeps on screen.
 */
export const SEQUENCES = {
  assembly: {
    source: 180,
    tiers: {
      mobile: { w: 720, h: 720, step: 2, ext: 'webp', ppm: 330, safe: [0.92, 0.56] },
      tablet: { w: 1080, h: 810, step: 1, ext: 'webp', ppm: 430, safe: [0.82, 0.64] },
      desktop: { w: 1600, h: 900, step: 1, ext: 'avif', ppm: 470, safe: [0.62, 0.64] },
    },
  },
  turntable: {
    source: 120,
    tiers: {
      mobile: { w: 720, h: 720, step: 2, ext: 'webp', ppm: 330, safe: [0.92, 0.56] },
      tablet: { w: 1080, h: 810, step: 1, ext: 'webp', ppm: 430, safe: [0.82, 0.64] },
      desktop: { w: 1600, h: 900, step: 1, ext: 'avif', ppm: 470, safe: [0.62, 0.64] },
    },
  },
};

export function frameCount(seq, tier) {
  const s = SEQUENCES[seq];
  return Math.ceil(s.source / s.tiers[tier].step);
}

export function framePath(seq, tier, i, ext = SEQUENCES[seq].tiers[tier].ext) {
  return `/media/${seq}/${tier}/${String(i).padStart(3, '0')}.${ext}`;
}

/** Desktop AVIF falls back to the tablet WebP set when the browser can't decode AVIF. */
export const AVIF_FALLBACK_TIER = 'tablet';

export const VIDEOS = {
  city: {
    duration: 8,
    fps: 24,
    tiers: {
      mobile: { w: 720, h: 1280, src: '/media/city/city-720.mp4' },
      tablet: { w: 1920, h: 1080, src: '/media/city/city-1080.mp4' },
      desktop: { w: 1920, h: 1080, src: '/media/city/city-1080.mp4' },
    },
    poster: { mobile: '/media/city/poster-720.webp', desktop: '/media/city/poster-1080.webp' },
  },
};

export const STILLS = {
  assembly: '/media/stills/assembly',
  turntable: '/media/stills/turntable',
  city: '/media/stills/city',
  cta: '/media/stills/cta',
};

export const COLOURWAY_IDS = ['obsidian', 'bone', 'tidewater'];
