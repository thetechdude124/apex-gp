// Pit lane, pit building and garages, DRS boards and road markings, and the glowing
// markers that guide the player (grid slot, pit entry). Sim (x, y, h) maps to three (x, h, -y).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { makeFigure } from './figures.js';

const V = (x, y, h) => new THREE.Vector3(x, h, -y);

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// flat strip between relative lap distances r0..r1, lateral offsets d0(r)..d1(r) on the pit side
function strip(T, r0, r1, d0, d1, y = 0, step = 2, uvScale = 1 / 7, color = null) {
  const P = T.pit, pos = [], uv = [], idx = [], col = [], o = {};
  const n = Math.max(1, Math.ceil((r1 - r0) / step));
  for (let k = 0; k <= n; k++) {
    const r = r0 + ((r1 - r0) * k) / n;
    for (const d of [d0(r), d1(r)]) {
      P.pos(r, P.side * d, o);
      pos.push(o.x, o.h + y, -o.y); uv.push(d * uvScale, r * uvScale);
      if (color) col.push(color.r, color.g, color.b);
    }
  }
  for (let k = 0; k < n; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) {
    const ix = g.index.array;
    for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

// vertical strip (wall face) at lateral d(r) between heights y0..y1
function wallStrip(T, r0, r1, d, y0, y1, uLen = 6, step = 2) {
  const P = T.pit, pos = [], uv = [], idx = [], o = {};
  const n = Math.max(1, Math.ceil((r1 - r0) / step));
  for (let k = 0; k <= n; k++) {
    const r = r0 + ((r1 - r0) * k) / n;
    P.pos(r, P.side * d(r), o);
    pos.push(o.x, o.h + y0, -o.y, o.x, o.h + y1, -o.y);
    uv.push(r / uLen, 0, r / uLen, (y1 - y0) / uLen);
  }
  for (let k = 0; k < n; k++) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function garageTexture(teams, side) {
  // one bay per team, in the order they sit along the lane (mirrored when the building faces the
  // other way). 640 x 128 px per bay = the bay's real 5:1 shape, so nothing is stretched.
  const order = side === 1 ? teams : teams.slice().reverse();
  const n = order.length, W = 640, H = 128;
  const lum = (c) => { const v = parseInt(c.slice(1), 16); return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255; };
  return canvasTex(W * n, H, (g) => {
    order.forEach((t, k) => {
      const x = k * W;
      g.fillStyle = '#c9cdd2'; g.fillRect(x, 0, W, H);
      // fascia in team colours with the name
      g.fillStyle = t.color; g.fillRect(x + 8, 8, W - 16, 26);
      g.fillStyle = t.color2; g.fillRect(x + 8, 32, W - 16, 3);
      g.fillStyle = lum(t.color) > 0.6 ? '#101216' : '#ffffff';
      g.font = 'italic 900 19px "Helvetica Neue", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t.name.toUpperCase(), x + W / 2, 21);
      // two open garage doors: dark interior, strip lights, kit against the back wall
      for (const dx of [40, 336]) {
        const grd = g.createLinearGradient(0, 40, 0, H);
        grd.addColorStop(0, '#0a0b0e'); grd.addColorStop(0.7, '#1b1d23'); grd.addColorStop(1, '#3b3e46');
        g.fillStyle = grd; g.fillRect(x + dx, 40, 264, H - 40);
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x + dx, 42, 264, 2);
        g.fillStyle = 'rgba(255,255,255,0.06)';
        for (let q = 0; q < 6; q++) g.fillRect(x + dx + 12 + q * 42, 50, 30, 34);
        g.fillStyle = t.color; g.globalAlpha = 0.55; g.fillRect(x + dx + 70, 92, 124, 30); g.globalAlpha = 1;
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x + dx + 70, 112, 124, 10);
      }
      g.fillStyle = '#a3a8af'; g.fillRect(x, 36, 12, H - 36); g.fillRect(x + W - 12, 36, 12, H - 36); g.fillRect(x + 304, 36, 32, H - 36);
    });
  });
}

function signTexture(lines, bg, fg, arrow = 0) {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(5, 5, 246, 118);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const big = lines.length === 1;
    g.font = `900 ${big ? 78 : 60}px Arial`;
    g.fillText(lines[0], arrow ? 108 : 128, big ? 68 : 46, arrow ? 190 : 230);
    if (!big) { g.font = '700 26px Arial'; g.fillText(lines[1], 128, 98, 230); }
    if (arrow) { g.beginPath(); const x = 214, y = big ? 64 : 46; g.moveTo(x - 18, y - 26); g.lineTo(x + 20, y); g.lineTo(x - 18, y + 26); g.closePath(); g.fill(); }
  });
}

function addSign(root, T, i, d, tex, w = 2.4, h = 1.2, y = 2.3) {
  const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, side: THREE.DoubleSide }));
  board.position.copy(V(T.x[i] + T.nx[i] * d, T.y[i] + T.ny[i] * d, T.h[i] + y));
  board.rotation.y = Math.atan2(T.ty[i], T.tx[i]) - Math.PI / 2;
  board.castShadow = true;
  const legMat = new THREE.MeshStandardMaterial({ color: 0x70767c, metalness: 0.6, roughness: 0.45 });
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, y, 6), legMat);
    const dd = d + s * w * 0.36;
    leg.position.copy(V(T.x[i] + T.nx[i] * dd, T.y[i] + T.ny[i] * dd, T.h[i] + y / 2));
    root.add(leg);
  }
  root.add(board);
  return board;
}

// text painted on the road, read by a driver approaching it
function roadPaint(root, T, i, d, tex, len, wid) {
  const g = new THREE.PlaneGeometry(wid, len, 1, 6);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false }));
  m.position.copy(V(T.x[i] + T.nx[i] * d, T.y[i] + T.ny[i] * d, T.h[i] + 0.012));
  m.rotation.order = 'YZX';
  m.rotation.y = Math.atan2(T.ty[i], T.tx[i]) - Math.PI / 2;
  m.rotation.x = Math.atan(T.grade[i]);
  m.receiveShadow = true;
  root.add(m);
  return m;
}

// ---------- tyre-change choreography, shared by the crew (below) and the car's own wheels (main.js).
// f is the stop's progress 0..1. Offsets are relative to the hub: x along the car, z outward from
// the car, h height above where the wheel sits on the ground.
const c01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const seg = (f, a, b) => c01((f - a) / (b - a));
const ez = (t) => { t = c01(t); return t * t * (3 - 2 * t); };
const outBack = (t) => { t = c01(t); const k = 1.70158; return 1 + (k + 1) * Math.pow(t - 1, 3) + k * Math.pow(t - 1, 2); };
const outCubic = (t) => 1 - Math.pow(1 - c01(t), 3);
export const STAGGER = [0, 0.012, 0.03, 0.022]; // the four corners are never perfectly in step

// how far the car is up on its jacks: a quick lift with a little overshoot, then dropped (and it settles)
export function jackLift(f) {
  const up = outBack(seg(f, 0.02, 0.09)), down = seg(f, 0.86, 0.9);
  const settle = f > 0.9 ? -0.012 * Math.sin(Math.PI * seg(f, 0.9, 0.97)) * (1 - seg(f, 0.9, 0.97)) : 0;
  return 0.075 * up * (1 - down * down) + settle;
}

export function wheelSwap(f) {
  const lift = jackLift(f);
  // old wheel: nut off, pulled straight off the axle, carried back and set down on the ground
  const pull = outCubic(seg(f, 0.16, 0.23)), carry = ez(seg(f, 0.23, 0.4)), lower = ez(seg(f, 0.25, 0.36));
  const old = { x: -0.55 * carry, z: 0.42 * pull + 1.08 * carry, h: lift * (1 - lower), roll: (0.55 * carry) / 0.36 + (f > 0.09 && f < 0.17 ? Math.sin(f * 900) * 0.02 : 0), tilt: 0.07 * Math.sin(Math.PI * seg(f, 0.16, 0.3)) };
  // new wheel: waiting upright on the ground ahead of the axle, carried in, lifted, pushed home
  const bring = ez(seg(f, 0.44, 0.6)), raise = ez(seg(f, 0.47, 0.58)), push = outBack(seg(f, 0.6, 0.68));
  const neu = { x: 0.55 * (1 - bring), z: 1.5 - 1.08 * bring - 0.42 * push, h: lift * raise, roll: (-0.55 * (1 - bring)) / 0.36 + (f > 0.68 && f < 0.8 ? Math.sin(f * 900) * 0.02 : 0), tilt: -0.06 * Math.sin(Math.PI * seg(f, 0.5, 0.66)) };
  return {
    lift, old, neu,
    showOld: f < 0.43, showNew: f >= 0.52,          // which of the two the car's own wheel is playing
    gun: (f > 0.09 && f < 0.17) || (f > 0.68 && f < 0.8) ? 1 : 0,
    gunIn: Math.max(ez(seg(f, 0.05, 0.09)) * (1 - ez(seg(f, 0.17, 0.21))), ez(seg(f, 0.64, 0.68)) * (1 - ez(seg(f, 0.8, 0.84)))),
    leanOff: -0.24 * Math.sin(Math.PI * seg(f, 0.15, 0.25)) + 0.1 * Math.sin(Math.PI * seg(f, 0.25, 0.4)),
    leanOn: 0.1 * Math.sin(Math.PI * seg(f, 0.44, 0.6)) + 0.26 * Math.sin(Math.PI * seg(f, 0.59, 0.7)),
    stepOff: Math.abs(Math.sin(carry * Math.PI * 3)) * 0.03, stepOn: Math.abs(Math.sin(bring * Math.PI * 3)) * 0.03,
    clear: ez(seg(f, 0.8, 0.9)),                      // fitters step back before the release
  };
}

export function buildPitLane(root, T, opts = {}) {
  const P = T.pit, N = T.N, w2 = T.width / 2, side = P.side, L = T.length;
  const teams = opts.teams || [];
  const wallArr = side === 1 ? T.wallL : T.wallR;
  const outer = (r) => { const fi = (((r % L) + L) % L) / T.ds, i = Math.floor(fi) % N, j = (i + 1) % N, f = fi - Math.floor(fi); return wallArr[i] + (wallArr[j] - wallArr[i]) * f; };
  const idxAt = (r) => Math.round((((r % L) + L) % L) / T.ds) % N;
  const add = (g, mat, shadow = true) => { const m = new THREE.Mesh(g, mat); m.receiveShadow = shadow; root.add(m); return m; };

  // ---------- surfaces: apron + lane, working area, paddock
  const asp = TX.asphalt();
  const po = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };
  const laneMat = new THREE.MeshStandardMaterial({ map: asp.map, normalMap: asp.normal, normalScale: new THREE.Vector2(0.28, 0.28), color: 0xd6d8dc, roughness: 0.93, ...po });
  const conc = TX.concrete(); conc.repeat.set(1, 1);
  const paddockMat = new THREE.MeshStandardMaterial({ map: conc, color: 0xb9bcc0, roughness: 0.95, ...po });
  const lim = (r) => Math.max(w2 + 1.6, Math.min(outer(r) - 0.25, P.garageD + 1.5));
  add(strip(T, P.e0 - 60, P.x1 + 60, () => w2 + 1.4, lim, -0.012), laneMat);
  add(strip(T, P.e0 + 20, P.x1 - 20, lim, (r) => Math.max(lim(r), outer(r) - 0.25), -0.014, 2, 1 / 5), paddockMat);

  // ---------- paint
  const white = new THREE.Color(0.93, 0.93, 0.93), yellow = new THREE.Color(0.95, 0.78, 0.1);
  const paint = [];
  const lineY = 0.004;
  const ln = (r0, r1, d, w = 0.18, c = white) => paint.push(strip(T, r0, r1, (r) => (typeof d === 'function' ? d(r) : d) - w / 2, (r) => (typeof d === 'function' ? d(r) : d) + w / 2, lineY, 2, 1, c));
  const bar = (r, d0, d1, w = 0.4, c = white) => paint.push(strip(T, r, r + w, () => d0, () => d1, lineY, 1, 1, c));
  ln(P.e1 - 20, P.x0 + 20, P.laneD - 3.1);                         // lane edge next to the pit wall
  ln(P.lim0, P.lim1, P.laneD + 3.1, 0.18, yellow);                 // fast lane | working lane
  ln(P.e0 + 25, P.e1, (r) => P.lat(r) + 3.3);                      // outside edge of the entry road
  ln(P.x0, P.x1 - 25, (r) => P.lat(r) + 3.3);                      // outside edge of the exit road
  ln(P.e0 - 40, P.nose0, w2 + 0.35, 0.14);                          // pit entry line beside the track
  ln(P.nose1, P.x1 + 40, w2 + 0.35, 0.14);                          // pit exit line
  bar(P.lim0, P.laneD - 3.1, P.laneD + 3.1, 0.5);                   // speed limit starts
  bar(P.lim1, P.laneD - 3.1, P.laneD + 3.1, 0.5);                   // speed limit ends
  // hatching on the wedge ahead of the pit wall nose
  for (let r = P.nose0 - 34; r < P.nose0 - 3; r += 4.5) {
    const half = 0.25 + ((r - (P.nose0 - 34)) / 34) * 1.4;
    bar(r, P.wallD - half, P.wallD + half, 0.7);
  }
  // team boxes
  P.boxes.forEach((rb, k) => {
    const t = teams[k];
    const c = new THREE.Color(t ? t.color : '#ffffff');
    if (c.getHSL({}).l < 0.25) c.offsetHSL(0, 0, 0.3);
    const a = rb - 3.4, b = rb + 3.7, d0 = P.boxD - 1.7, d1 = P.boxD + 1.7;
    ln(a, b, d0, 0.14, c); ln(a, b, d1, 0.14, c);
    bar(a, d0, d1, 0.14, c);
    bar(b, d0 - 0.4, d1 + 0.4, 0.3, white);                        // stop line for the front wheels
    for (const rr of [rb + 1.98, rb - 1.62]) for (const dd of [-1, 1]) bar(rr - 0.35, P.boxD + dd * 0.8 - 0.25, P.boxD + dd * 0.8 + 0.25, 0.7, yellow); // wheel marks
  });
  add(mergeGeometries(paint), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));

  // ---------- pit wall with debris fence, timing stands and nose markers
  const wallMat = new THREE.MeshStandardMaterial({ map: TX.concrete(), color: 0xe8e8e6, roughness: 0.85, side: THREE.DoubleSide });
  const wd = () => P.wallD;
  const wg = [
    wallStrip(T, P.nose0, P.nose1, () => P.wallD - 0.28, 0, 1.05),
    wallStrip(T, P.nose0, P.nose1, () => P.wallD + 0.28, 0, 1.05),
    strip(T, P.nose0, P.nose1, () => P.wallD - 0.28, () => P.wallD + 0.28, 1.05, 2, 1),
  ];
  add(mergeGeometries(wg), wallMat).castShadow = true;
  const stripeTex = canvasTex(64, 16, (g) => { for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#f1f1f1' : '#c8102e'; g.fillRect(k * 16, 0, 16, 16); } }, true);
  stripeTex.repeat.set(1, 1);
  add(wallStrip(T, P.nose0, P.nose1, () => P.wallD - 0.3, 0.72, 1.02, 3), new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.6, side: THREE.DoubleSide }));
  const fenceTex = TX.fence();
  add(wallStrip(T, P.nose0 + 14, P.nose1 - 14, wd, 1.05, 3.3, 4), new THREE.MeshStandardMaterial({ map: fenceTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 }), false);
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.7, roughness: 0.4 });
  const o = {};
  {
    const posts = [];
    for (let r = P.nose0 + 14; r <= P.nose1 - 14; r += 6) {
      P.pos(r, side * P.wallD, o);
      const g = new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5); g.translate(o.x, o.h + 2.2, -o.y); posts.push(g);
    }
    add(mergeGeometries(posts), steel, false);
  }
  const barrelTex = canvasTex(64, 64, (g) => { for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#111' : '#f5c400'; g.fillRect(0, k * 16, 64, 16); } });
  const barrelMat = new THREE.MeshStandardMaterial({ map: barrelTex, roughness: 0.6 });
  for (const [r, dir] of [[P.nose0, -1], [P.nose1, 1]]) {
    for (let k = 0; k < 3; k++) {
      P.pos(r + dir * (0.6 + k * 0.95), side * P.wallD, o);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.4 - k * 0.05, 0.4 - k * 0.05, 1.0, 14), barrelMat);
      b.position.set(o.x, o.h + 0.52, -o.y); b.castShadow = true; root.add(b);
    }
  }
  // pit-wall timing stands (one per team)
  {
    const frame = [], roofs = [];
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.4 });
    P.boxes.forEach((rb, k) => {
      P.pos(rb + 4, side * (P.wallD + 1.15), o);
      const th = Math.atan2(T.ty[o.i], T.tx[o.i]);
      const mk = (w, h, d, y, list) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(th); g.translate(o.x, o.h + y, -o.y); list.push(g); };
      mk(3.6, 1.0, 1.1, 0.5, frame);
      mk(3.8, 0.12, 1.5, 2.45, roofs);
      for (const sx of [-1.7, 1.7]) { const g = new THREE.BoxGeometry(0.08, 1.5, 0.08); g.translate(sx, 1.7, 0); g.rotateY(th); g.translate(o.x, o.h, -o.y); frame.push(g); }
      const t = teams[k];
      if (t) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(3.82, 0.3, 1.52), new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.5 }));
        band.rotation.y = th; band.position.set(o.x, o.h + 2.25, -o.y); root.add(band);
      }
    });
    add(mergeGeometries(frame), dark).castShadow = true;
    add(mergeGeometries(roofs), new THREE.MeshStandardMaterial({ color: 0xe9eaec, roughness: 0.5 })).castShadow = true;
  }

  // ---------- pit building: a garage per team, hospitality above, race control tower
  {
    const nB = P.boxes.length, bay = P.boxes[1] - P.boxes[0];
    const r0 = P.boxes[0] - bay / 2, r1 = P.boxes[nB - 1] + bay / 2, len = r1 - r0, depth = 15;
    const ic = idxAt((r0 + r1) / 2);
    const off = side * (P.garageD + depth / 2);
    const g = new THREE.Group();
    g.position.copy(V(T.x[ic] + T.nx[ic] * off, T.y[ic] + T.ny[ic] * off, T.h[ic]));
    g.rotation.y = Math.atan2(T.ty[ic], T.tx[ic]);
    const z = side === 1 ? 1 : -1; // local +z points at the track when the pits are on the left
    const list = teams.length === nB ? teams : P.boxes.map((_, k) => teams[k] || { name: 'GARAGE', color: '#444a52', color2: '#888888' });
    const front = new THREE.MeshStandardMaterial({ map: garageTexture(list, side), roughness: 0.6 });
    const plain = new THREE.MeshStandardMaterial({ color: 0xd4d7db, roughness: 0.6 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x1c2a38, roughness: 0.06, metalness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xe8e9eb, roughness: 0.5, metalness: 0.2 });
    const mats = [plain, plain, plain, plain, plain, plain];
    mats[z === 1 ? 4 : 5] = front;
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, 5.4, depth), mats);
    body.position.y = 2.7; body.castShadow = true; body.receiveShadow = true; g.add(body);
    const ends = new THREE.Mesh(new THREE.BoxGeometry(len + 24, 5.4, depth), plain);
    ends.position.set(0, 2.7, -z * 0.02); ends.castShadow = true; g.add(ends);
    // canopy over the garage doors, balcony, glazed upper floor
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(len + 24, 0.25, 3.2), roofMat);
    canopy.position.set(0, 5.5, z * (depth / 2 + 1.2)); canopy.castShadow = true; g.add(canopy);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(len + 24, 3.6, depth - 3), glass);
    upper.position.set(0, 7.3, -z * 1.5); upper.castShadow = true; g.add(upper);
    const mull = [];
    for (let x = -len / 2 - 12; x <= len / 2 + 12; x += 6.75) { const m = new THREE.BoxGeometry(0.16, 3.6, 0.1); m.translate(x, 7.3, z * (depth / 2 - 3.0)); mull.push(m); }
    g.add(new THREE.Mesh(mergeGeometries(mull), plain));
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 28, 0.35, depth + 2), roofMat);
    roof.position.y = 9.3; roof.castShadow = true; g.add(roof);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(11, 20, 11), plain);
    tower.position.set(-len / 2 - 20, 10, 0); tower.castShadow = true; g.add(tower);
    const towerTop = new THREE.Mesh(new THREE.BoxGeometry(14, 4.5, 14), glass);
    towerTop.position.set(-len / 2 - 20, 22.2, 0); towerTop.castShadow = true; g.add(towerTop);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(15, 0.4, 15), roofMat);
    cap.position.set(-len / 2 - 20, 24.6, 0); g.add(cap);
    root.add(g);
  }

  // ---------- signs
  {
    const dOut = (i) => side * (Math.min(wallArr[i], w2 + 7) - 1.1);
    addSign(root, T, idxAt(P.e0 - 220), dOut(idxAt(P.e0 - 220)), signTexture(['PIT', '200 m'], '#0a3d91', '#ffffff', 1));
    addSign(root, T, idxAt(P.e0 - 90), dOut(idxAt(P.e0 - 90)), signTexture(['PIT', 'ENTRY'], '#0a3d91', '#ffffff', 1));
    const lim = canvasTex(128, 128, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = '#d0021b'; g.lineWidth = 14; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke(); g.fillStyle = '#111'; g.font = '900 56px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('80', 64, 68); });
    const i0 = idxAt(P.lim0), dd = side * (P.laneD + 5.2);
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.75, 28), new THREE.MeshStandardMaterial({ map: lim, roughness: 0.5, side: THREE.DoubleSide }));
    s.position.copy(V(T.x[i0] + T.nx[i0] * dd, T.y[i0] + T.ny[i0] * dd, T.h[i0] + 2.6));
    s.rotation.y = Math.atan2(T.ty[i0], T.tx[i0]) - Math.PI / 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), steel);
    pole.position.copy(s.position); pole.position.y -= 1.3;
    root.add(s, pole);
    // light at the end of the pit lane
    const iX = idxAt(P.lim1 + 6), dx = side * (P.laneD - 3.8);
    const lp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.35), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 0.4 }));
    lp.position.copy(V(T.x[iX] + T.nx[iX] * dx, T.y[iX] + T.ny[iX] * dx, T.h[iX] + 2.5));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshStandardMaterial({ color: 0x003311, emissive: 0x00ff66, emissiveIntensity: 3 }));
    lamp.position.copy(lp.position); lamp.position.y += 0.2;
    const lpole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.1, 6), steel);
    lpole.position.copy(lp.position); lpole.position.y -= 1.45;
    root.add(lp, lamp, lpole);
  }

  // ---------- guide chevrons into the pit entry (shown while a stop is requested)
  const guide = (() => {
    const sh = new THREE.Shape();
    [[0.55, 0], [-0.05, 0.62], [-0.42, 0.62], [0.18, 0], [-0.42, -0.62], [-0.05, -0.62]].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2);
    const rs = [];
    for (let r = P.e0 - 260; r < P.lim0; r += 5) rs.push(r);
    const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x35b6ff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7, side: THREE.DoubleSide }), rs.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YZX'), a = {}, b = {};
    const lat = (r) => (r < P.e0 ? P.edgeD : P.lat(r));
    rs.forEach((r, k) => {
      P.pos(r, side * lat(r), a); P.pos(r + 1, side * lat(r + 1), b);
      e.set(0, Math.atan2(b.y - a.y, b.x - a.x), Math.atan(T.grade[a.i]));
      m4.compose(new THREE.Vector3(a.x, a.h + 0.05, -a.y), q.setFromEuler(e), new THREE.Vector3(1.1, 1, 0.85));
      mesh.setMatrixAt(k, m4);
    });
    mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.visible = false;
    root.add(mesh);
    return mesh;
  })();

  // ---------- pit crews: come out to the box when their car is due, and work the stop.
  // Per wheel: a gunner kneeling at the hub, one mechanic who pulls the old wheel off and carries
  // it clear, one who brings the new wheel in and pushes it on. Plus front and rear jack men and
  // the crew chief. `crew.userData.pose(f, newColor, oldColor)` moves everyone for stop progress
  // f (0..1); f < 0 is the waiting pose.
  const crews = [];
  {
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 });
    const lidMat = new THREE.MeshStandardMaterial({ color: 0x2b2e34, roughness: 0.28, metalness: 0.3 }); // crew helmets: plain dark shells
    const rubber = new THREE.MeshStandardMaterial({ color: 0x131313, roughness: 0.9 });
    const tyreG = new THREE.CylinderGeometry(0.36, 0.36, 0.34, 18); tyreG.rotateX(Math.PI / 2);
    const bandG = new THREE.TorusGeometry(0.27, 0.022, 6, 28);
    const bandMats = new Map();
    const band = (hex) => { if (!bandMats.has(hex)) bandMats.set(hex, new THREE.MeshBasicMaterial({ color: hex })); return bandMats.get(hex); };
    const zs = side === 1 ? -1 : 1; // local z of the garage side (three -z is sim left)
    const WHEELS = [[1.98, 0.8], [1.98, -0.8], [-1.62, 0.78], [-1.62, -0.78]];
    P.boxes.forEach((rb, k) => {
      const t = teams[k];
      const grp = new THREE.Group();
      P.pos(rb, side * P.boxD, o);
      grp.position.set(o.x, o.h, -o.y);
      grp.rotation.y = Math.atan2(T.ty[o.i], T.tx[o.i]);
      const suitMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(t ? t.color : '#888888').lerp(new THREE.Color(0x1a1c20), 0.35), roughness: 0.9 });
      const fig = (pose) => {
        const f = makeFigure(pose), g = new THREE.Group();
        const body = new THREE.Mesh(f.suit, suitMat); body.castShadow = true;
        g.add(body, new THREE.Mesh(f.lid, lidMat), new THREE.Mesh(f.dark, darkMat));
        grp.add(g);
        return g;
      };
      const spare = () => { const g = new THREE.Group(); const b1 = new THREE.Mesh(bandG, band('#ffffff')), b2 = new THREE.Mesh(bandG, band('#ffffff')); b1.position.z = 0.172; b2.position.z = -0.172; g.add(new THREE.Mesh(tyreG, rubber), b1, b2); g.userData.bands = [b1, b2]; grp.add(g); return g; };
      const face = (g, dx, dz) => { g.rotation.y = Math.atan2(dx, dz); };
      const corners = WHEELS.map(([wx, wz]) => {
        const s = Math.sign(wz);
        const gun = fig('kneel'); gun.userData.home = new THREE.Vector3(wx - 0.66, 0, wz + s * 0.5); face(gun, 0.66, -s * 0.5);
        const off = fig('stand'), on = fig('stand');
        face(off, 0, -s); face(on, 0, -s);
        return { wx, wz, s, gun, off, on, oldW: spare(), newW: spare() };
      });
      const jackF = fig('stand'), jackR = fig('stand'), chief = fig('stand');
      face(jackF, -1, 0); face(jackR, 1, 0); face(chief, 0, -zs);
      chief.position.set(0.5, 0, zs * 3.3);
      for (const c of corners) for (const g of [c.gun, c.off, c.on]) g.rotation.order = 'YXZ'; // lean about the figure's own hips
      grp.userData.pose = (f, newHex = '#ffffff', oldHex = '#ffffff') => {
        const idle = f < 0, lift = idle ? 0 : jackLift(f);
        corners.forEach((c, k) => {
          const w = wheelSwap(idle ? 0 : c01(f - STAGGER[k]));
          // gunner: leans in onto the nut, rattles, eases back
          const jab = w.gun ? Math.sin(performance.now() * 0.13 + k) * 0.016 : 0;
          c.gun.position.copy(c.gun.userData.home);
          c.gun.position.x += 0.66 * 0.2 * w.gunIn + jab; c.gun.position.z -= c.s * 0.5 * 0.2 * w.gunIn;
          c.gun.rotation.x = 0.16 * w.gunIn;
          // the mechanic taking the old wheel stays just outboard of it, leaning back as it comes free
          const ox = c.wx + w.old.x, oz = c.wz + c.s * w.old.z;
          c.off.position.set(ox, idle ? 0 : w.stepOff, oz + c.s * 0.62); c.off.rotation.x = idle ? 0 : w.leanOff;
          // the mechanic with the new wheel: waits, carries it in, leans into the push, steps clear
          const nx = c.wx + w.neu.x, nz = c.wz + c.s * w.neu.z;
          c.on.position.set(nx, idle ? 0 : w.stepOn, nz + c.s * (0.62 + 0.55 * (idle ? 0 : w.clear))); c.on.rotation.x = idle ? 0 : w.leanOn;
          // the wheels in their hands whenever the car's own wheel is not the one being handled
          c.oldW.visible = !idle && !w.showOld; c.oldW.position.set(ox, 0.36 + w.old.h, oz); c.oldW.rotation.set(c.s * w.old.tilt, 0, w.old.roll);
          c.newW.visible = idle || !w.showNew; c.newW.position.set(nx, 0.36 + w.neu.h, nz); c.newW.rotation.set(c.s * w.neu.tilt, 0, w.neu.roll);
          for (const b of c.oldW.userData.bands) b.material = band(oldHex);
          for (const b of c.newW.userData.bands) b.material = band(newHex);
        });
        // jacks: the front man is already in place, the rear man steps in behind once the car has
        // stopped; both pump the car up, hold it, and clear the way before the release
        const inR = idle ? 0 : ez(f / 0.06) * (1 - ez((f - 0.9) / 0.08));
        const outF = idle ? 0 : ez((f - 0.9) / 0.08);
        jackF.position.set(3.75, 0, zs * 1.9 * outF); jackR.position.set(-3.55, 0, zs * 1.9 * (1 - inR));
        jackF.rotation.order = jackR.rotation.order = 'YXZ';
        jackF.rotation.x = jackR.rotation.x = idle ? 0 : 0.3 * (lift / 0.075) * (1 - outF);
      };
      grp.userData.pose(-1);
      grp.visible = false;
      root.add(grp);
      crews.push(grp);
    });
  }

  return { guide, crews };
}

// DRS: boards at the detection and activation points, a line across the road at detection
// and big letters painted on the asphalt where the zone starts.
export function buildDrsMarkers(root, T) {
  const N = T.N, w2 = T.width / 2, P = T.pit;
  const det = signTexture(['DRS', 'DETECTION'], '#f4f4f4', '#111111');
  const act = signTexture(['DRS'], '#0a8a3c', '#ffffff', 1);
  const end = signTexture(['DRS', 'END'], '#1b1d21', '#ffffff');
  const road = canvasTex(256, 512, (g) => {
    g.clearRect(0, 0, 256, 512);
    g.fillStyle = '#19c15a'; g.fillRect(0, 440, 256, 40);
    g.fillStyle = '#f4f4f4'; g.font = '900 150px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(128, 230); g.scale(0.62, 2.6); g.fillText('DRS', 0, 0); g.restore();
  });
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const sides = (i) => [1, -1].filter((s) => !(P && P.zone[i] && s === P.side));
  T.drs.forEach((z) => {
    for (const [i, tex] of [[z.detect, det], [z.start, act], [z.end, end]]) {
      for (const s of sides(i)) {
        const wall = s === 1 ? T.wallL[i] : T.wallR[i];
        addSign(root, T, i, s * (Math.min(wall, w2 + 7) - 1.1), tex, 2.6, 1.3, 2.4);
      }
    }
    // detection line
    const g = new THREE.PlaneGeometry(0.35, T.width - 0.5);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, paintMat);
    m.position.copy(V(T.x[z.detect], T.y[z.detect], T.h[z.detect] + 0.012));
    m.rotation.y = Math.atan2(T.ty[z.detect], T.tx[z.detect]);
    m.receiveShadow = true;
    root.add(m);
    roadPaint(root, T, (z.start + 4) % N, 0, road, 15, 6.4);
  });
}
