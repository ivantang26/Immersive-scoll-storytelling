import { createCanvas } from '@napi-rs/canvas';
// Procedural Vela bike: a 3D stick-and-tube model projected to Canvas 2D.
// Stands in for the Blender renders the PRD expects (see README, open question 1).
// Units are metres. +x is the front of the bike, +y is up, +z is the drive (right) side.

export const PALETTE = {
  night: '#0B0C0F',
  dusk: '#1C1B24',
  bone: '#F1EDE6',
  copper: '#D08A4E',
  mute: '#8D8A93',
};

export const COLOURWAYS = {
  obsidian: { name: 'Obsidian', frame: '#2a2b31', hi: '#8a8d98', lo: '#0d0d10' },
  bone: { name: 'Bone', frame: '#d9d3c8', hi: '#ffffff', lo: '#8f877b' },
  tidewater: { name: 'Tidewater', frame: '#3d5561', hi: '#9fb8c2', lo: '#16232a' },
};

const MAT = {
  tyre: { base: '#141418', hi: '#3a3b42', lo: '#050506' },
  metal: { base: '#7d808a', hi: '#d4d6dc', lo: '#2c2e33' },
  darkMetal: { base: '#2f3137', hi: '#7a7d86', lo: '#101114' },
  saddle: { base: '#1d1a18', hi: '#5e5248', lo: '#0a0909' },
  copper: { base: '#D08A4E', hi: '#f6c79a', lo: '#7a4a24' },
  belt: { base: '#17171b', hi: '#46474f', lo: '#060607' },
  battery: { base: '#1b1c21', hi: '#5d606a', lo: '#08080a' },
  rider: { base: '#16171c', hi: '#4c4b55', lo: '#08080a' },
  skin: { base: '#2a2426', hi: '#6a5652', lo: '#100d0e' },
};

// Key points of the frame geometry.
export const GEO = {
  wheelR: 0.35,
  rimR: 0.312,
  RA: [-0.53, 0.35, 0],
  FA: [0.55, 0.35, 0],
  BB: [-0.06, 0.3, 0],
  ST: [-0.2, 0.86, 0],
  HT: [0.385, 0.9, 0],
  HB: [0.435, 0.72, 0],
  saddle: [-0.235, 1.04, 0],
  grip: [0.42, 0.985],
};

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const withZ = (p, z) => [p[0], p[1], z];

function circle3(c, r, n = 48, a0 = 0, a1 = Math.PI * 2) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2]]);
  }
  return pts;
}

function quad(a, c, b, n = 12) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push([0, 1, 2].map((k) => u * u * a[k] + 2 * u * t * c[k] + t * t * b[k]));
  }
  return pts;
}

const tube = (pts, w, mat, extra = {}) => ({ type: 'tube', pts, w, mat, ...extra });
const line = (pts, w, color, alpha = 1, extra = {}) => ({ type: 'line', pts, w, color, alpha, ...extra });
const disc = (pts, fill, extra = {}) => ({ type: 'poly', pts, fill, ...extra });
const glow = (p, r, color, intensity = 1, extra = {}) => ({ type: 'glow', pts: [p], r, color, intensity, ...extra });

function wheel(center, spin, { segments = 12 } = {}) {
  const prims = [];
  const R = GEO.wheelR;
  // Tyre split into arcs so the painter's sort can interleave it with the frame.
  for (let s = 0; s < segments; s++) {
    const a0 = (s / segments) * Math.PI * 2;
    const a1 = ((s + 1) / segments) * Math.PI * 2 + 0.03;
    prims.push(line(circle3(center, R - 0.022, 6, a0, a1), 0.044, MAT.tyre.base, 1, { bias: -0.002, cap: 'butt' }));
  }
  prims.push(line(circle3(center, R - 0.004, 72), 0.004, '#3c3d45', 0.9, { bias: -0.001 }));
  prims.push(line(circle3(center, R - 0.04, 72), 0.003, '#26272d', 1, { bias: -0.001 }));
  prims.push(line(circle3(center, GEO.rimR, 64), 0.016, '#3b3d44', 1, { bias: -0.004 }));
  prims.push(line(circle3(center, GEO.rimR - 0.006, 64), 0.004, '#9a9da6', 0.7, { bias: -0.003 }));
  // 24 spokes, laced from both hub flanges.
  for (let i = 0; i < 24; i++) {
    const a = spin + (i / 24) * Math.PI * 2;
    const z = i % 2 ? 0.03 : -0.03;
    const hub = [center[0] + Math.cos(a + 0.5) * 0.03, center[1] + Math.sin(a + 0.5) * 0.03, z];
    const rim = [center[0] + Math.cos(a) * (GEO.rimR - 0.01), center[1] + Math.sin(a) * (GEO.rimR - 0.01), 0];
    prims.push(line([hub, rim], 0.0028, '#9ea1aa', 0.55, { bias: -0.006 }));
  }
  return prims;
}

function hubMotor(center) {
  const prims = [];
  for (const z of [-0.032, 0.032]) {
    prims.push(disc(circle3(withZ(center, z), 0.075, 40), '#24252b', { stroke: '#5c5f68', strokeW: 0.006 }));
  }
  prims.push(disc(circle3(withZ(center, 0.036), 0.03, 24), '#3b3d44', { stroke: PALETTE.copper, strokeW: 0.004 }));
  return prims;
}

function frontHub(center) {
  return [disc(circle3(withZ(center, 0.03), 0.026, 20), '#3b3d44'), disc(circle3(withZ(center, -0.03), 0.026, 20), '#3b3d44')];
}

function beltPath(z) {
  const C1 = GEO.BB;
  const C2 = GEO.RA;
  const r1 = 0.085;
  const r2 = 0.05;
  const dx = C1[0] - C2[0];
  const dy = C1[1] - C2[1];
  const d = Math.hypot(dx, dy);
  const phi = Math.atan2(dy, dx);
  const g = Math.acos((r1 - r2) / d);
  const aTop = phi + g;
  const aBot = phi - g;
  const pts = [];
  // Front sprocket: from top tangent, around the front, to bottom tangent.
  for (let i = 0; i <= 16; i++) {
    const a = aTop - ((aTop - aBot) * i) / 16;
    pts.push([C1[0] + Math.cos(a) * r1, C1[1] + Math.sin(a) * r1, z]);
  }
  // Rear sprocket: from bottom tangent, around the back, to top tangent.
  const rb0 = aBot;
  const rb1 = aTop - Math.PI * 2;
  for (let i = 0; i <= 12; i++) {
    const a = rb0 - ((rb0 - rb1) * i) / 12;
    pts.push([C2[0] + Math.cos(a) * r2, C2[1] + Math.sin(a) * r2, z]);
  }
  pts.push(pts[0]);
  return pts;
}

function riderPrims(crank) {
  const prims = [];
  const L1 = 0.48;
  const L2 = 0.5;
  const hip = [-0.22, 1.1];
  const shoulder = [0.07, 1.44];
  const ik = (foot) => {
    const dx = foot[0] - hip[0];
    const dy = foot[1] - hip[1];
    let d = Math.hypot(dx, dy);
    d = Math.min(d, L1 + L2 - 0.005);
    const base = Math.atan2(dy, dx);
    const a = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
    const k1 = [hip[0] + Math.cos(base + a) * L1, hip[1] + Math.sin(base + a) * L1];
    const k2 = [hip[0] + Math.cos(base - a) * L1, hip[1] + Math.sin(base - a) * L1];
    return k1[0] > k2[0] ? k1 : k2;
  };
  for (const side of [1, -1]) {
    const a = crank + (side === 1 ? 0 : Math.PI);
    const z = side * 0.11;
    const foot = [GEO.BB[0] + Math.cos(a) * 0.17 - 0.02, GEO.BB[1] + Math.sin(a) * 0.17 + 0.05];
    const knee = ik(foot);
    const mat = side === 1 ? MAT.rider : { ...MAT.rider, base: '#0f1014' };
    prims.push(tube([withZ(hip, z), withZ(knee, z)], 0.13, mat));
    prims.push(tube([withZ(knee, z), withZ(foot, z)], 0.095, mat));
    prims.push(tube([withZ(foot, z), [foot[0] + 0.12, foot[1] - 0.01, z]], 0.06, MAT.belt));
    const elbow = [0.33, 1.25];
    prims.push(tube([withZ(shoulder, z * 1.6), withZ(elbow, z * 2.2)], 0.085, mat));
    prims.push(tube([withZ(elbow, z * 2.2), [GEO.grip[0], GEO.grip[1] + 0.02, side * 0.27]], 0.07, mat));
  }
  // Torso tapers from hips to shoulders, with a backpack for a commuter silhouette.
  prims.push(tube([withZ(hip, 0), lerp3(withZ(hip, 0), withZ(shoulder, 0), 0.55), withZ(shoulder, 0)], 0.22, MAT.rider, { bias: 0.02 }));
  prims.push(tube([[hip[0] + 0.05, hip[1] + 0.2, 0], [shoulder[0] - 0.12, shoulder[1] + 0.0, 0]], 0.16, { base: '#1f1d22', hi: '#5a5560', lo: '#08080a' }, { bias: 0.01 }));
  prims.push(tube([[shoulder[0] + 0.03, shoulder[1] + 0.05, 0], [shoulder[0] + 0.07, shoulder[1] + 0.11, 0]], 0.08, MAT.skin));
  const head = [shoulder[0] + 0.12, shoulder[1] + 0.2, 0];
  prims.push(disc(circle3(head, 0.095, 28), '#2a2426', { bias: 0.02 }));
  prims.push(disc(circle3([head[0] - 0.015, head[1] + 0.03, 0], 0.11, 28, 0.1, Math.PI + 0.25), '#121216', { stroke: '#55535e', strokeW: 0.006, bias: 0.025 }));
  return prims;
}

/**
 * Builds the bike as named parts. Each part is a list of primitives in bike space,
 * plus an anchor (where it locks onto the frame) used for assembly effects and callouts.
 */
export function buildBike({
  colourway = 'obsidian',
  spinRear = 0,
  spinFront = 0,
  crank = -0.6,
  lights = 0,
  rider = false,
  rack = false,
  basket = false,
} = {}) {
  const cw = COLOURWAYS[colourway];
  const FRAME = { base: cw.frame, hi: cw.hi, lo: cw.lo };
  const { RA, FA, BB, ST, HT, HB } = GEO;
  const parts = {};

  const seatJoin = lerp3(ST, BB, 0.1);
  parts.frame = {
    anchor: lerp3(BB, HT, 0.5),
    prims: [
      tube([BB, ST], 0.04, FRAME),
      tube([ST, HT], 0.042, FRAME, { bias: 0.004 }),
      tube([BB, HB], 0.064, FRAME, { bias: 0.006 }),
      tube([HB, HT], 0.056, FRAME, { bias: 0.008 }),
      tube([[HT[0] + 0.004, HT[1] - 0.03, 0.03], [HB[0] - 0.002, HB[1] + 0.05, 0.03]], 0.014, MAT.copper, { bias: 0.03 }),
      tube([[HT[0] + 0.004, HT[1] - 0.03, -0.03], [HB[0] - 0.002, HB[1] + 0.05, -0.03]], 0.014, MAT.copper, { bias: -0.03 }),
      ...[1, -1].flatMap((s) => [
        tube([withZ(seatJoin, s * 0.02), withZ(RA, s * 0.068)], 0.022, FRAME),
        tube([withZ(BB, s * 0.03), withZ(RA, s * 0.068)], 0.026, FRAME),
        tube(quad(withZ(HB, s * 0.02), [HB[0] + 0.07, 0.52, s * 0.06], withZ(FA, s * 0.058), 10), 0.028, FRAME),
      ]),
      // Copper pinstripe along the down tube, both sides.
      line([lerp3(withZ(BB, 0.033), withZ(HB, 0.033), 0.1), lerp3(withZ(BB, 0.033), withZ(HB, 0.033), 0.86)], 0.006, PALETTE.copper, 0.95, { bias: 0.04 }),
      line([lerp3(withZ(BB, -0.033), withZ(HB, -0.033), 0.1), lerp3(withZ(BB, -0.033), withZ(HB, -0.033), 0.86)], 0.006, PALETTE.copper, 0.95, { bias: -0.04 }),
    ],
  };

  parts.rearWheel = { anchor: RA, prims: wheel(RA, spinRear) };
  parts.frontWheel = { anchor: FA, prims: [...wheel(FA, spinFront), ...frontHub(FA)] };
  parts.motor = { anchor: RA, prims: hubMotor(RA) };

  // Battery lives inside the down tube; visible as a darker inset with a copper end cap.
  const b0 = lerp3(BB, HB, 0.16);
  const b1 = lerp3(BB, HB, 0.78);
  parts.battery = {
    anchor: lerp3(b0, b1, 0.5),
    prims: [
      tube([withZ(b0, 0.012), withZ(b1, 0.012)], 0.04, MAT.battery, { bias: 0.05 }),
      tube([withZ(b0, -0.012), withZ(b1, -0.012)], 0.04, MAT.battery, { bias: -0.05 }),
      tube([withZ(lerp3(b0, b1, 0.97), 0.0), withZ(b1, 0.0)], 0.046, MAT.copper, { bias: 0.06 }),
    ],
  };

  const cr = (a, z) => [BB[0] + Math.cos(a) * 0.17, BB[1] + Math.sin(a) * 0.17, z];
  parts.drive = {
    anchor: BB,
    prims: [
      line(beltPath(0.075), 0.012, '#1d1d22', 1, { bias: 0.05 }),
      disc(circle3(withZ(BB, 0.078), 0.085, 36), '#1f2025', { stroke: PALETTE.copper, strokeW: 0.008, bias: 0.05 }),
      disc(circle3(withZ(RA, 0.078), 0.05, 24), '#1f2025', { stroke: '#5c5f68', strokeW: 0.005, bias: 0.05 }),
      tube([withZ(BB, 0.09), cr(crank, 0.09)], 0.026, MAT.darkMetal, { bias: 0.07 }),
      tube([withZ(BB, -0.09), cr(crank + Math.PI, -0.09)], 0.026, MAT.darkMetal, { bias: -0.07 }),
      tube([cr(crank, 0.09), cr(crank, 0.19)], 0.03, MAT.belt, { bias: 0.08 }),
      tube([cr(crank + Math.PI, -0.09), cr(crank + Math.PI, -0.19)], 0.03, MAT.belt, { bias: -0.08 }),
    ],
  };

  const stemTop = [HT[0] + 0.035, HT[1] + 0.07, 0];
  const bar = (z) => [GEO.grip[0] - Math.abs(z) * 0.18, GEO.grip[1], z];
  parts.cockpit = {
    anchor: HT,
    prims: [
      tube([HT, stemTop], 0.034, FRAME, { bias: 0.01 }),
      tube([stemTop, [stemTop[0] + 0.04, stemTop[1], 0]], 0.03, FRAME, { bias: 0.01 }),
      tube([bar(-0.3), [stemTop[0] + 0.035, GEO.grip[1], 0], bar(0.3)], 0.024, MAT.darkMetal),
      tube([bar(0.2), bar(0.31)], 0.036, MAT.saddle, { bias: 0.01 }),
      tube([bar(-0.31), bar(-0.2)], 0.036, MAT.saddle, { bias: -0.01 }),
    ],
  };

  const sp = [GEO.saddle[0] + 0.01, GEO.saddle[1] - 0.02, 0];
  parts.saddle = {
    anchor: ST,
    prims: [
      tube([lerp3(ST, BB, -0.02), sp], 0.03, MAT.metal),
      tube([[GEO.saddle[0] - 0.1, GEO.saddle[1] + 0.012, 0], [GEO.saddle[0] + 0.02, GEO.saddle[1] + 0.008, 0], [GEO.saddle[0] + 0.12, GEO.saddle[1] - 0.002, 0]], 0.05, MAT.saddle, { bias: 0.02 }),
    ],
  };

  const fender = (c, a0, a1) =>
    [1, -1].map((s) => line(circle3(withZ(c, s * 0.018), GEO.wheelR + 0.028, 18, a0, a1), 0.016, '#1a1b20', 1, { bias: s * 0.02 }));
  parts.fenders = {
    anchor: RA,
    prims: [...fender(RA, 0.15, 2.6), ...fender(FA, 0.45, 2.75)],
  };

  const front = [HT[0] + 0.05, HT[1] - 0.045, 0];
  const rear = [ST[0] - 0.035, ST[1] - 0.09, 0];
  parts.lights = {
    anchor: front,
    prims: [
      tube([[front[0] - 0.015, front[1], 0], [front[0] + 0.02, front[1] - 0.005, 0]], 0.03, MAT.darkMetal, { bias: 0.1 }),
      tube([[rear[0], rear[1] + 0.03, 0], [rear[0] - 0.005, rear[1] - 0.03, 0]], 0.018, { base: '#3a1512', hi: '#7a2a20', lo: '#1a0807' }, { bias: 0.1 }),
      ...(lights > 0
        ? [
            glow([front[0] + 0.022, front[1] - 0.005, 0], 0.09, '255,236,210', lights, { bias: 0.2 }),
            glow([rear[0] - 0.008, rear[1], 0], 0.06, '214,64,48', lights * 0.9, { bias: 0.2 }),
          ]
        : []),
    ],
  };

  if (rack) {
    const top = [RA[0] - 0.03, 0.82];
    parts.rack = {
      anchor: [top[0], top[1], 0],
      prims: [1, -1].flatMap((s) => [
        tube([[top[0] - 0.2, top[1], s * 0.07], [top[0] + 0.3, top[1], s * 0.07]], 0.014, MAT.darkMetal),
        tube([[top[0] - 0.15, top[1], s * 0.07], withZ(RA, s * 0.075)], 0.012, MAT.darkMetal),
        tube([[top[0] + 0.28, top[1], s * 0.07], withZ(seatJoin, s * 0.04)], 0.012, MAT.darkMetal),
      ]),
    };
  }
  if (basket) {
    const c = [FA[0] + 0.07, 0.86];
    const prims = [];
    for (const s of [1, -1]) prims.push(tube([[c[0] - 0.14, c[1] - 0.12, s * 0.16], [c[0] + 0.14, c[1] - 0.12, s * 0.16], [c[0] + 0.16, c[1] + 0.08, s * 0.17], [c[0] - 0.16, c[1] + 0.08, s * 0.17], [c[0] - 0.14, c[1] - 0.12, s * 0.16]], 0.012, MAT.saddle));
    for (let i = 0; i <= 4; i++) {
      const x = c[0] - 0.15 + i * 0.075;
      prims.push(tube([[x, c[1] + 0.08, 0.17], [x, c[1] + 0.08, -0.17]], 0.01, MAT.saddle));
    }
    parts.basket = { anchor: [c[0], c[1], 0], prims };
  }

  if (rider) parts.rider = { anchor: GEO.saddle, prims: riderPrims(crank) };
  return parts;
}

/* ------------------------------------------------------------------ */
/* Camera + painter's-algorithm renderer                                */
/* ------------------------------------------------------------------ */

export function makeCamera({ yaw = 0, pitch = 0.1, dist = 4.6, ppm = 400, cx = 0, cy = 0, pivot = [0.01, 0.62, 0] } = {}) {
  const cyw = Math.cos(yaw);
  const syw = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const spi = Math.sin(pitch);
  const f = ppm * dist;
  return {
    yaw,
    pitch,
    toView(p) {
      const x = p[0] - pivot[0];
      const y = p[1] - pivot[1];
      const z = p[2] - pivot[2];
      const x1 = x * cyw + z * syw;
      const z1 = -x * syw + z * cyw;
      const y2 = y * cp - z1 * spi;
      const z2 = y * spi + z1 * cp;
      return [x1, y2, z2];
    },
    project(p) {
      const v = this.toView(p);
      const k = f / (dist - v[2]);
      return [cx + v[0] * k, cy - v[1] * k, v[2], k];
    },
  };
}

function drawPolyline(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
}

function offsetPolyline(pts, d) {
  // Offsets a projected polyline toward screen-up (the key light) by d pixels.
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    if (ny > 0 || (ny === 0 && nx > 0)) {
      nx = -nx;
      ny = -ny;
    }
    return [p[0] + nx * d, p[1] + ny * d];
  });
}

function drawPrim(ctx, prim, proj, alpha) {
  const k = proj.reduce((s, p) => s + p[3], 0) / proj.length;
  ctx.globalAlpha = alpha * (prim.alpha ?? 1);
  if (prim.type === 'tube') {
    const w = Math.max(0.6, prim.w * k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawPolyline(ctx, proj);
    ctx.strokeStyle = prim.mat.base;
    ctx.lineWidth = w;
    ctx.stroke();
    if (w > 2.5) {
      drawPolyline(ctx, offsetPolyline(proj, -w * 0.26));
      ctx.strokeStyle = prim.mat.lo;
      ctx.globalAlpha = alpha * 0.55;
      ctx.lineWidth = w * 0.42;
      ctx.stroke();
      drawPolyline(ctx, offsetPolyline(proj, w * 0.22));
      ctx.strokeStyle = prim.mat.hi;
      ctx.globalAlpha = alpha * 0.5;
      ctx.lineWidth = w * 0.28;
      ctx.stroke();
      drawPolyline(ctx, offsetPolyline(proj, w * 0.3));
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = alpha * 0.22;
      ctx.lineWidth = Math.max(0.5, w * 0.08);
      ctx.stroke();
    }
  } else if (prim.type === 'line') {
    ctx.lineCap = prim.cap || 'round';
    ctx.lineJoin = 'round';
    drawPolyline(ctx, proj);
    ctx.strokeStyle = prim.color;
    ctx.lineWidth = Math.max(0.5, prim.w * k);
    ctx.stroke();
  } else if (prim.type === 'poly') {
    drawPolyline(ctx, proj);
    ctx.closePath();
    ctx.fillStyle = prim.fill;
    ctx.fill();
    if (prim.stroke) {
      ctx.strokeStyle = prim.stroke;
      ctx.lineWidth = Math.max(0.6, prim.strokeW * k);
      ctx.stroke();
    }
  } else if (prim.type === 'glow') {
    const [x, y] = proj[0];
    const r = prim.r * k * 2.2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const i = prim.intensity;
    g.addColorStop(0, `rgba(${prim.color},${0.95 * i})`);
    g.addColorStop(0.12, `rgba(${prim.color},${0.55 * i})`);
    g.addColorStop(1, `rgba(${prim.color},0)`);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
}

/**
 * Renders parts with per-part state: { offset:[x,y,z], rot (radians about z), alpha }.
 * Returns screen positions of each part anchor for overlays.
 */
export function renderBike(ctx, parts, cam, states = {}) {
  const items = [];
  for (const [id, part] of Object.entries(parts)) {
    const st = states[id] || {};
    const alpha = st.alpha ?? 1;
    if (alpha <= 0.001) continue;
    const off = st.offset || [0, 0, 0];
    const rot = st.rot || 0;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const a = part.anchor;
    const xf = (p) => {
      const dx = p[0] - a[0];
      const dy = p[1] - a[1];
      return [a[0] + dx * c - dy * s + off[0], a[1] + dx * s + dy * c + off[1], p[2] + off[2]];
    };
    for (const prim of part.prims) {
      const proj = prim.pts.map((p) => cam.project(xf(p)));
      const depth = proj.reduce((sum, p) => sum + p[2], 0) / proj.length;
      // Bias is expressed along the bike's z axis, so rotate it into view depth.
      const bias = (prim.bias || 0) * Math.cos(cam.yaw);
      items.push({ prim, proj, depth: depth + bias, alpha });
    }
  }
  items.sort((p, q) => p.depth - q.depth);
  for (const it of items) drawPrim(ctx, it.prim, it.proj, it.alpha);
}

/* ------------------------------------------------------------------ */
/* Stage backgrounds                                                    */
/* ------------------------------------------------------------------ */

// Fixed (seeded) dither tile: breaks up banding in the dark gradients without flickering between frames.
let noiseTile = null;
function getNoise() {
  if (noiseTile) return noiseTile;
  const size = 128;
  const c = createCanvas(size, size);
  const nctx = c.getContext('2d');
  const img = nctx.createImageData(size, size);
  let s = 1234567;
  for (let i = 0; i < size * size; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = (s >> 16) & 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 9;
  }
  nctx.putImageData(img, 0, 0);
  noiseTile = c;
  return c;
}

export function drawStage(ctx, w, h, { glowX = 0.5, glowY = 0.48, warmth = 1, floorY = null } = {}) {
  ctx.fillStyle = PALETTE.night;
  ctx.fillRect(0, 0, w, h);
  const r = Math.max(w, h) * 0.62;
  const g = ctx.createRadialGradient(w * glowX, h * glowY, 0, w * glowX, h * glowY, r);
  g.addColorStop(0, `rgba(52,44,52,${0.95 * warmth})`);
  g.addColorStop(0.35, `rgba(34,30,38,${0.8 * warmth})`);
  g.addColorStop(0.75, 'rgba(11,12,15,0.4)');
  g.addColorStop(1, 'rgba(11,12,15,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (floorY != null) {
    const fg = ctx.createLinearGradient(0, floorY, 0, h);
    fg.addColorStop(0, 'rgba(208,138,78,0.05)');
    fg.addColorStop(0.4, 'rgba(11,12,15,0.0)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, floorY, w, h - floorY);
  }
  ctx.fillStyle = ctx.createPattern(getNoise(), 'repeat');
  ctx.fillRect(0, 0, w, h);
}

export function drawShadow(ctx, cam, alpha = 1) {
  const a = cam.project([GEO.RA[0], 0, 0]);
  const b = cam.project([GEO.FA[0], 0, 0]);
  const l = cam.project([0, 0, 0.35]);
  const r = cam.project([0, 0, -0.35]);
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2;
  const rx = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2, Math.abs(l[0] - r[0]) / 2) * 1.15 + 20 * (a[3] / 400);
  const ry = Math.max(8, Math.abs(l[1] - r[1]) / 2 + 14 * (a[3] / 400));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${0.75 * alpha})`);
  g.addColorStop(0.6, `rgba(0,0,0,${0.35 * alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c1 = 1.4;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};
export const clamp01 = (t) => Math.max(0, Math.min(1, t));
export const range = (t, a, b) => clamp01((t - a) / (b - a));
export { add, lerp3 };
