// Builds the configurator model (full + low-poly) from the same geometry as the 2D renders,
// then writes Draco-compressed GLBs: public/models/vela.glb and vela-lite.glb.
// Node names the configurator relies on: "Rack", "Basket"; material names: "FramePaint", "LightFront", "LightRear".
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { draco, weld, dedup, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GEO } from './lib/bike.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'models');

const MATERIALS = {
  FramePaint: { color: '#2a2b31', metallic: 0.35, roughness: 0.38 },
  Copper: { color: '#D08A4E', metallic: 1, roughness: 0.3 },
  Rubber: { color: '#131316', metallic: 0, roughness: 0.85 },
  Alloy: { color: '#9a9da6', metallic: 1, roughness: 0.32 },
  DarkAlloy: { color: '#2f3137', metallic: 0.8, roughness: 0.45 },
  Leather: { color: '#2a201b', metallic: 0, roughness: 0.6 },
  Battery: { color: '#1b1c21', metallic: 0.2, roughness: 0.5 },
  LightFront: { color: '#f5efe6', metallic: 0, roughness: 0.2, emissive: '#fff1dc' },
  LightRear: { color: '#7a1d16', metallic: 0, roughness: 0.3, emissive: '#d63f30' },
};

const v3 = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const withZ = (p, z) => [p[0], p[1], z];
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function build(detail) {
  const R = detail === 'full' ? 14 : 7; // radial segments
  const T = detail === 'full' ? 1 : 0.5; // tubular density
  const groups = { Bike: {}, Rack: {}, Basket: {} };
  const put = (group, mat, geo) => (groups[group][mat] ||= []).push(geo.toNonIndexed ? geo : geo);

  function tube(group, mat, pts, radius, { caps = true, closed = false } = {}) {
    const curve = pts.length === 2 ? new THREE.LineCurve3(v3(pts[0]), v3(pts[1])) : new THREE.CatmullRomCurve3(pts.map(v3), closed, 'centripetal');
    const len = curve.getLength();
    const segs = pts.length === 2 ? 1 : Math.max(4, Math.round(len * 40 * T));
    put(group, mat, new THREE.TubeGeometry(curve, segs, radius, R, closed));
    if (caps && !closed)
      for (const p of [pts[0], pts[pts.length - 1]]) {
        const s = new THREE.SphereGeometry(radius, R, Math.max(4, R / 2));
        s.translate(p[0], p[1], p[2]);
        put(group, mat, s);
      }
  }
  function cyl(group, mat, center, radius, depth, segs = R * 2) {
    const g = new THREE.CylinderGeometry(radius, radius, depth, segs);
    g.rotateX(Math.PI / 2);
    g.translate(center[0], center[1], center[2]);
    put(group, mat, g);
  }
  function torus(group, mat, center, radius, tubeR, { arc = Math.PI * 2, start = 0, scaleZ = 1, tubular = 64 } = {}) {
    const g = new THREE.TorusGeometry(radius, tubeR, Math.max(6, R), Math.round(tubular * T), arc);
    g.rotateZ(start);
    g.scale(1, 1, scaleZ);
    g.translate(center[0], center[1], center[2]);
    put(group, mat, g);
  }
  function box(group, mat, center, size, rotZ = 0) {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    g.rotateZ(rotZ);
    g.translate(center[0], center[1], center[2]);
    put(group, mat, g);
  }

  const { RA, FA, BB, ST, HT, HB } = GEO;

  // Frame
  const seatJoin = lerp(ST, BB, 0.1);
  tube('Bike', 'FramePaint', [BB, ST], 0.02);
  tube('Bike', 'FramePaint', [ST, HT], 0.021);
  tube('Bike', 'FramePaint', [BB, HB], 0.032);
  tube('Bike', 'FramePaint', [HB, HT], 0.028);
  for (const s of [1, -1]) {
    tube('Bike', 'FramePaint', [withZ(seatJoin, s * 0.02), withZ(RA, s * 0.068)], 0.011);
    tube('Bike', 'FramePaint', [withZ(BB, s * 0.03), withZ(RA, s * 0.068)], 0.013);
    tube('Bike', 'FramePaint', [withZ(HB, s * 0.02), [HB[0] + 0.05, 0.56, s * 0.055], withZ(FA, s * 0.058)], 0.014);
    // Copper head-tube inlay and down-tube pinstripe.
    tube('Bike', 'Copper', [[HT[0] + 0.004, HT[1] - 0.03, s * 0.026], [HB[0] - 0.002, HB[1] + 0.05, s * 0.026]], 0.006);
    tube('Bike', 'Copper', [lerp(withZ(BB, s * 0.031), withZ(HB, s * 0.031), 0.1), lerp(withZ(BB, s * 0.031), withZ(HB, s * 0.031), 0.86)], 0.0035);
  }
  // Battery inset + copper cap
  const b0 = lerp(BB, HB, 0.16);
  const b1 = lerp(BB, HB, 0.78);
  tube('Bike', 'Battery', [withZ(b0, 0), withZ(b1, 0)], 0.0335, { caps: false });
  tube('Bike', 'Copper', [lerp(b0, b1, 0.97), b1], 0.0345, { caps: false });

  // Wheels
  const spokes = detail === 'full' ? 24 : 12;
  for (const c of [RA, FA]) {
    torus('Bike', 'Rubber', c, GEO.wheelR - 0.022, 0.022, { tubular: 96 });
    torus('Bike', 'Alloy', c, GEO.rimR, 0.009, { scaleZ: 1.6, tubular: 96 });
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const z = i % 2 ? 0.028 : -0.028;
      tube('Bike', 'Alloy', [[c[0] + Math.cos(a + 0.5) * 0.03, c[1] + Math.sin(a + 0.5) * 0.03, z], [c[0] + Math.cos(a) * (GEO.rimR - 0.008), c[1] + Math.sin(a) * (GEO.rimR - 0.008), 0]], 0.0015, { caps: false });
    }
    // Fenders: flattened torus arcs.
    const front = c === FA;
    torus('Bike', 'DarkAlloy', c, GEO.wheelR + 0.028, 0.008, { arc: front ? 2.3 : 2.45, start: front ? 0.45 : 0.15, scaleZ: 4.5 });
  }
  cyl('Bike', 'DarkAlloy', RA, 0.075, 0.064); // hub motor
  cyl('Bike', 'Copper', withZ(RA, 0.034), 0.03, 0.004);
  cyl('Bike', 'DarkAlloy', FA, 0.026, 0.07);

  // Drive: carbon belt, copper front ring, cranks, pedals.
  const r1 = 0.085;
  const r2 = 0.05;
  const d = Math.hypot(BB[0] - RA[0], BB[1] - RA[1]);
  const phi = Math.atan2(BB[1] - RA[1], BB[0] - RA[0]);
  const g = Math.acos((r1 - r2) / d);
  const belt = [];
  for (let i = 0; i <= 16; i++) {
    const a = phi + g - (2 * g * i) / 16;
    belt.push([BB[0] + Math.cos(a) * r1, BB[1] + Math.sin(a) * r1, 0.075]);
  }
  for (let i = 0; i <= 12; i++) {
    const a = phi - g - ((2 * Math.PI - 2 * g) * i) / 12;
    belt.push([RA[0] + Math.cos(a) * r2, RA[1] + Math.sin(a) * r2, 0.075]);
  }
  tube('Bike', 'Rubber', belt, 0.006, { closed: true });
  cyl('Bike', 'DarkAlloy', withZ(BB, 0.078), r1 - 0.004, 0.006);
  torus('Bike', 'Copper', withZ(BB, 0.078), r1, 0.005);
  cyl('Bike', 'DarkAlloy', withZ(RA, 0.078), r2, 0.006);
  const crank = -0.6;
  for (const s of [1, -1]) {
    const a = s === 1 ? crank : crank + Math.PI;
    const end = [BB[0] + Math.cos(a) * 0.17, BB[1] + Math.sin(a) * 0.17, s * 0.09];
    tube('Bike', 'DarkAlloy', [withZ(BB, s * 0.09), end], 0.012);
    box('Bike', 'Rubber', [end[0], end[1], s * 0.14], [0.08, 0.018, 0.1]);
  }
  cyl('Bike', 'DarkAlloy', BB, 0.03, 0.17);

  // Cockpit
  const stemTop = [HT[0] + 0.035, HT[1] + 0.07, 0];
  tube('Bike', 'FramePaint', [HT, stemTop, [stemTop[0] + 0.04, stemTop[1], 0]], 0.016);
  const bar = (z) => [GEO.grip[0] - Math.abs(z) * 0.18, GEO.grip[1], z];
  tube('Bike', 'DarkAlloy', [bar(-0.3), [stemTop[0] + 0.035, GEO.grip[1], 0], bar(0.3)], 0.011);
  for (const s of [1, -1]) tube('Bike', 'Leather', [bar(s * 0.2), bar(s * 0.31)], 0.017);

  // Seatpost + saddle
  tube('Bike', 'Alloy', [lerp(ST, BB, -0.02), [GEO.saddle[0] + 0.01, GEO.saddle[1] - 0.02, 0]], 0.014);
  const saddle = new THREE.SphereGeometry(1, R * 2, R);
  saddle.scale(0.13, 0.026, 0.07);
  saddle.translate(GEO.saddle[0] + 0.01, GEO.saddle[1] + 0.008, 0);
  put('Bike', 'Leather', saddle);

  // Integrated lights (emissive materials so the configurator can glow them).
  const fl = [HT[0] + 0.05, HT[1] - 0.045, 0];
  const lamp = new THREE.CylinderGeometry(0.018, 0.022, 0.05, R * 2);
  lamp.rotateZ(Math.PI / 2);
  lamp.translate(fl[0], fl[1], 0);
  put('Bike', 'DarkAlloy', lamp);
  cyl('Bike', 'LightFront', [fl[0] + 0.026, fl[1], 0], 0.016, 0.004);
  put('Bike', 'LightFront', (() => {
    const lens = new THREE.CircleGeometry(0.016, R * 2);
    lens.rotateY(Math.PI / 2);
    lens.translate(fl[0] + 0.0262, fl[1], 0);
    return lens;
  })());
  box('Bike', 'LightRear', [ST[0] - 0.035, ST[1] - 0.09, 0], [0.012, 0.06, 0.03], -0.15);

  // Accessories
  const rt = [RA[0] - 0.03, 0.82];
  for (const s of [1, -1]) {
    tube('Rack', 'DarkAlloy', [[rt[0] - 0.2, rt[1], s * 0.07], [rt[0] + 0.3, rt[1], s * 0.07]], 0.007);
    tube('Rack', 'DarkAlloy', [[rt[0] - 0.15, rt[1], s * 0.07], withZ(RA, s * 0.075)], 0.006);
    tube('Rack', 'DarkAlloy', [[rt[0] + 0.28, rt[1], s * 0.07], withZ(seatJoin, s * 0.04)], 0.006);
  }
  for (let i = 0; i <= 5; i++) tube('Rack', 'DarkAlloy', [[rt[0] - 0.2 + i * 0.1, rt[1], 0.07], [rt[0] - 0.2 + i * 0.1, rt[1], -0.07]], 0.005);

  const bc = [FA[0] + 0.07, 0.86];
  for (const s of [1, -1])
    tube('Basket', 'Leather', [[bc[0] - 0.14, bc[1] - 0.12, s * 0.16], [bc[0] + 0.14, bc[1] - 0.12, s * 0.16], [bc[0] + 0.16, bc[1] + 0.08, s * 0.17], [bc[0] - 0.16, bc[1] + 0.08, s * 0.17]], 0.006, { closed: true });
  for (let i = 0; i <= 4; i++) {
    const x = bc[0] - 0.15 + i * 0.075;
    tube('Basket', 'Leather', [[x, bc[1] + 0.08, 0.17], [x, bc[1] + 0.08, -0.17]], 0.005);
    tube('Basket', 'Leather', [[x * 0.95 + bc[0] * 0.05, bc[1] - 0.12, 0.16], [x * 0.95 + bc[0] * 0.05, bc[1] - 0.12, -0.16]], 0.005);
  }
  for (const s of [1, -1]) for (let i = 0; i <= 3; i++) tube('Basket', 'Leather', [[bc[0] - 0.14 + i * 0.093, bc[1] - 0.12, s * 0.16], [bc[0] - 0.16 + i * 0.107, bc[1] + 0.08, s * 0.17]], 0.004);
  tube('Basket', 'DarkAlloy', [[bc[0] - 0.1, bc[1] - 0.12, 0], withZ(HB, 0)], 0.007);

  return groups;
}

function srgbToLinear(hex) {
  return [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
}

async function writeGLB(detail, file) {
  const groups = build(detail);
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mats = {};
  for (const [name, m] of Object.entries(MATERIALS)) {
    const mat = doc.createMaterial(name).setBaseColorFactor([...srgbToLinear(m.color), 1]).setMetallicFactor(m.metallic).setRoughnessFactor(m.roughness);
    if (m.emissive) mat.setEmissiveFactor(srgbToLinear(m.emissive));
    mats[name] = mat;
  }
  const scene = doc.createScene('Vela');
  const root = doc.createNode('Vela');
  scene.addChild(root);
  let tris = 0;
  for (const [groupName, byMat] of Object.entries(groups)) {
    const node = doc.createNode(groupName);
    root.addChild(node);
    const mesh = doc.createMesh(groupName);
    for (const [matName, geos] of Object.entries(byMat)) {
      const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
        g.deleteAttribute('uv');
        return g;
      }));
      const pos = merged.getAttribute('position');
      const nor = merged.getAttribute('normal');
      tris += pos.count / 3;
      const prim = doc
        .createPrimitive()
        .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos.array)).setBuffer(buffer))
        .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(nor.array)).setBuffer(buffer))
        .setMaterial(mats[matName]);
      mesh.addPrimitive(prim);
    }
    node.setMesh(mesh);
  }
  await doc.transform(weld(), dedup(), prune(), draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10 }));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
  mkdirSync(OUT, { recursive: true });
  await io.write(file, doc);
  console.log(`${file.split(/[\\/]/).pop()}: ${Math.round(tris).toLocaleString()} triangles, ${(statSync(file).size / 1024).toFixed(0)} KB (Draco)`);
}

await writeGLB('full', join(OUT, 'vela.glb'));
await writeGLB('lite', join(OUT, 'vela-lite.glb'));
