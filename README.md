# Vela launch microsite

Scroll-driven launch site for Vela, a fictional £3,400 e-bike. As you scroll, the bike assembles, turns on a turntable, rides through a city from day to dusk, and then shows its specs. The site also includes a specs page, a 3D configurator, test-ride booking and a press kit.

```bash
npm install
npm run dev        # http://localhost:4321
```

```bash
npm run build && npm run preview   # production: static pages + Node server for /api
```

## Pages

| Route | What it is |
|---|---|
| `/` | Story: Arrival, Assembly, Turntable, City ride, Specs reveal, Colourways, CTA |
| `/specs` | Full specification, geometry, colours, accessories |
| `/configure` | Three.js configurator (colour, rack, basket, orbit, save/share image) |
| `/test-ride` | Postcode, nearest shop, date and time, details, confirmation email |
| `/press` | Fact sheet and 2400 px images |
| `/api/shops`, `/api/slots`, `/api/bookings`, `/api/events` | Server routes (Node adapter) |

## How the story works

Scenes are data. Each entry in [src/config/scenes.js](src/config/scenes.js) sets the scene's height in vh, its assets and its text beats (`start`/`end` progress). Each scene is a tall section with a sticky stage. [src/scripts/engine/scene-engine.js](src/scripts/engine/scene-engine.js) runs a single `requestAnimationFrame` loop that:

- converts scroll position to progress (0 to 1) per scene, smoothed with lerp 0.1 per 60 Hz frame (frame-rate independent)
- updates only scenes in the viewport, so offscreen scenes stop drawing
- starts preloading the next scene's assets when the current one reaches 50%
- fades beats in and out over 8% of progress, rising 24px
- sets scene heights in px (70% on mobile, 85% on tablet), so the mobile URL bar never reflows the story
- on rotation, freezes progress, re-lays out, and restores the same scene and progress

To add a scene: add a config entry, add its section to [src/pages/index.astro](src/pages/index.astro), and register a handler in [src/scripts/scenes.js](src/scripts/scenes.js) (`preload`, `resize`, `update(progress)`).

Supporting modules:
- [image-sequence.js](src/scripts/engine/image-sequence.js): canvas sequences. Frames load in priority order (first frame, then every 8th, 4th, 2nd, then the rest), and drawing always uses the nearest loaded frame. AVIF on desktop falls back to the WebP tablet set.
- [video-scrub.js](src/scripts/engine/video-scrub.js): fetches the all-intra MP4 as a blob, then seeks without queueing.
- [progress-nav.js](src/scripts/progress-nav.js): the copper progress bar, named scene links, and long-press on touch.
- Lenis smooth scrolling runs on fine-pointer, non-touch devices only, inside the same rAF loop.

### Static fallback (FR-6)

An inline script in `<head>` decides the mode before first paint. The site goes static on any of:
- `prefers-reduced-motion`
- Save-Data
- `deviceMemory < 4`
- a saved preference (footer "Motion" toggle)
- `?mode=static`

The markup defaults to static, so the page is complete without JavaScript. In static mode no frames or video are requested, and each scene shows a still plus all of its text.

## Asset pipeline

There are no Blender renders yet, so every visual is generated from one procedural 3D bike model ([scripts/lib/bike.mjs](scripts/lib/bike.mjs)). Swapping in real renders only means replacing files at the same paths.

```bash
npm run assets:sequences   # assembly (180) + turntable (120) frames per tier, stills, colourways, press, og (~7 min)
npm run assets:city        # city ride, encoded all-intra with FFmpeg -g 1 (~5 min, needs ffmpeg on PATH)
npm run assets:model       # Draco GLB, full (43k tris, 115 KB) and lite (12k tris, 48 KB)
npm run budget             # checks PRD section 8 budgets (run after a build)
```

Tiers and frame counts live in [src/config/media.js](src/config/media.js). Both the render scripts and the runtime read this file.

| Tier | Frames | Format | Video |
|---|---|---|---|
| Mobile (<768px) | every 2nd frame (90 assembly), 720px | WebP | 720x1280 portrait |
| Tablet | full, 1080px | WebP | 1080p |
| Desktop | full, 1600px | AVIF | 1080p |

The turntable callouts track real points on the bike. The renderer exports per-frame anchor coordinates (`anchors.json`), so the callout lines follow the battery, lights and belt as the bike rotates.

## Booking, email and metrics

- **Shops:** [src/server/shops.js](src/server/shops.js) uses `PARTNER_API_URL` / `PARTNER_API_KEY` if set; otherwise it uses a local dataset of 15 UK shops. Postcodes are geocoded with postcodes.io, with an offline area-centroid fallback.
- **Slots:** 2 demo bikes per hourly slot, Monday to Saturday, from tomorrow (London time) for 21 days. Bookings are stored in `data/bookings.json` behind a write lock that prevents double-booking (409 when full).
- **Email:** set `RESEND_API_KEY` and `EMAIL_FROM` to send through Resend. Without them, each confirmation is written to `outbox/<ref>.eml` as a real MIME message with an `.ics` invite attached.
- **Metrics:** `GET /api/events` returns the PRD section 10 numbers: average story scroll depth, skip-to-specs share, configurator share and bookings. Set `METRICS_TOKEN` to protect it.

| Env var | Purpose |
|---|---|
| `PORT`, `HOST` | Node server |
| `PARTNER_API_URL`, `PARTNER_API_KEY` | Real partner-shop API |
| `RESEND_API_KEY`, `EMAIL_FROM` | Transactional email |
| `METRICS_TOKEN` | Protects the metrics summary |
| `VELA_DATA_DIR` | Where bookings/events are stored (default `./data`) |

## Acceptance criteria status

| Criterion | Status |
|---|---|
| No blank assembly frames after 10% on 4G | Met by design: nearest-loaded-frame drawing plus a 1-in-8 first pass, so a frame is always shown. Not yet measured on a throttled 4G profile. |
| Static fallback: reduced motion, Save-Data, 2 GB Android | Logic verified with `?mode=static` (no frame or video requests, full text parity). Needs a check on a real 2 GB device. |
| Scroll position survives orientation change | Verified in emulation (portrait to landscape and back, same scene, progress within 0.002). Needs a check on real iOS and Android. |
| "Skip to specs" is the first tab stop | Verified. |
| 60 fps desktop / 50 fps mid-range phone in assembly | Not measured. Profile on target hardware. |
| Booking completes end to end with confirmation email | Verified against the production build (201, email file written, slot capacity decremented, 409 when full). Real delivery needs Resend keys. |

Budgets (`npm run budget`): desktop 9.6 MB of 18 MB, mobile 5.1 MB of 8 MB. The first scene is 75 KB, about 1 s on slow 4G.

## Notes

- **Fonts:** PP Neue Montreal is a licensed font, so the site falls back to Geist (self-hosted). To use Neue Montreal, add an `@font-face` for it at the top of [src/styles/global.css](src/styles/global.css). The token stack already names it first.
- **Open questions (PRD section 12):** the procedural CG in this repo stands in for both the Blender frame sequences and the city footage. A CG city ride does avoid the all-intra encoding problem that real footage would have.
- Shop names, addresses and product figures beyond the PRD's are fictional placeholders.
