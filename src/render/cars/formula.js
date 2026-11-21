// Shared builder for the open-wheel cars. Metres; +X forward, +Y up, tyres on y = 0.
// Front axle at x = 1.98, rear at x = -1.62 (the game places the wheels itself).
//
// A car is described by a spec of curves (see f1.js, f2.js). Everything on the right-hand side
// (z > 0) goes in the `...R` lists and is mirrored by carmodel.js; `...C` lists hold parts that
// straddle the centreline. Painted parts take the team livery by side projection, and three of
// them carry a `slot` so the livery painter can find them: 'T' the front-wing top flap, 'F' the
// front endplate skin, 'R' the rear endplate skin. Their lower-left corners must not move, or the
// endplate graphics drift (both cars share one livery texture per team).
import * as THREE from 'three';
import { curve, lerp, clamp } from './kit.js';

export const FRONT_X = 1.98, REAR_X = -1.62, WHEEL_R = 0.36, FRONT_Z = 0.83, REAR_Z = 0.79, FRONT_W = 0.305, REAR_W = 0.405;

// keys in any order -> shape-preserving curve
export const C = (keys) => (typeof keys === 'number' ? () => keys : curve(keys.slice().sort((a, b) => a[0] - b[0])));

function flipIfInward(g, outward) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  let vote = 0;
  for (let i = 0; i < p.count; i++) {
    const o = outward(p.getX(i), p.getY(i), p.getZ(i));
    vote += n.getX(i) * o[0] + n.getY(i) * o[1] + n.getZ(i) * o[2];
  }
  if (vote < 0) {
    const ix = g.index.array;
    for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

// Skin through rings of [x, y, z] points. `closed` joins the last point of each ring to the first.
// `half` marks a right-hand half shell whose ends sit on the centreline.
export function skinRings(rings, { closed = false, half = false, centre = null, skip = null } = {}) {
  const n = rings[0].length, pos = [], idx = [];
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2]);
  const cols = closed ? n : n - 1;
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < cols; k++) {
    if (skip && skip(i, k)) continue;
    const a = i * n + k, b = i * n + ((k + 1) % n), c = a + n, d = b + n;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // centre of each ring, to tell inside from outside
  const mid = rings.map((ring) => {
    let y = 0, z = 0;
    for (const p of ring) { y += p[1]; z += p[2]; }
    return [y / n, half ? 0 : z / n];
  });
  const xs = rings.map((r) => r[0][0]);
  const at = (x) => { let best = 0; for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i; return centre || mid[best]; };
  flipIfInward(g, (x, y, z) => { const c = at(x); return [0, y - c[0], z - c[1]]; });
  if (half) {
    const p = g.attributes.position, nm = g.attributes.normal;
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getZ(i)) < 1e-5) {
      const nx = nm.getX(i), ny = nm.getY(i), l = Math.hypot(nx, ny) || 1;
      nm.setXYZ(i, nx / l, ny / l, 0);
    }
  }
  return g;
}

// Flat cap over one ring, facing along x (dir = +1 forward, -1 backward). `shrink` insets it.
export function capRing(ring, dir, shrink = 1, dx = 0) {
  let y = 0, z = 0;
  for (const p of ring) { y += p[1]; z += p[2]; }
  y /= ring.length; z /= ring.length;
  const pos = [ring[0][0] + dx, y, z], idx = [];
  for (const p of ring) pos.push(p[0] + dx, y + (p[1] - y) * shrink, z + (p[2] - z) * shrink);
  for (let k = 0; k < ring.length; k++) idx.push(0, 1 + k, 1 + ((k + 1) % ring.length));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return flipIfInward(g, () => [dir, 0, 0]);
}

// Superellipse half section: bottom centre, round the right side, to top centre.
// s = { w, y0, y1, n (upper squareness), nb (lower), bw (bottom width factor) }
export function halfSection(x, s, K = 18) {
  const ring = [];
  for (let k = 0; k <= K; k++) {
    const th = -Math.PI / 2 + (k / K) * Math.PI, c = Math.cos(th), sn = Math.sin(th);
    const n = sn >= 0 ? s.n : s.nb ?? s.n;
    const yc = (s.y0 + s.y1) / 2, hh = (s.y1 - s.y0) / 2;
    let z = s.w * Math.abs(c) ** (2 / n);
    if (sn < 0 && s.bw != null) z *= 1 - (1 - s.bw) * (-sn) ** 1.3;
    ring.push([x, yc + hh * Math.sign(sn) * Math.abs(sn) ** (2 / n), k === 0 || k === K ? 0 : Math.max(0, z)]);
  }
  return ring;
}

// Polygon [z, y] with rounded corners. r[i] in 0..1 is how much of each corner is rounded,
// m samples per corner. Open polygons keep their two end points.
export function fillet(x, pts, r, m = 5, closed = true) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const c = pts[i];
    if (!closed && (i === 0 || i === n - 1)) { out.push([x, c[1], c[0]]); continue; }
    const a0 = pts[(i - 1 + n) % n], b0 = pts[(i + 1) % n], rr = clamp(Array.isArray(r) ? r[i] : r, 0, 1);
    const a = [lerp(c[0], a0[0], rr / 2), lerp(c[1], a0[1], rr / 2)], b = [lerp(c[0], b0[0], rr / 2), lerp(c[1], b0[1], rr / 2)];
    for (let j = 0; j < m; j++) {
      const t = (j + 0.5) / m, u = 1 - t;
      out.push([x, u * u * a[1] + 2 * u * t * c[1] + t * t * b[1], u * u * a[0] + 2 * u * t * c[0] + t * t * b[0]]);
    }
  }
  return out;
}

export function range(a, b, step) {
  const n = Math.max(1, Math.round(Math.abs(b - a) / step)), out = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
}

// Wing from span stations { z, x (leading edge), y, c (chord), a (degrees, trailing edge up), t }.
export function foil(stations, M = 7, camber = 0.07) {
  const pos = [], idx = [], R = 2 * M;
  const th = (u, t) => 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
  for (const s of stations) {
    const phi = (s.a * Math.PI) / 180, cs = Math.cos(phi), sn = Math.sin(phi), prof = [], t = s.t ?? 0.1, cam = s.k ?? camber;
    for (let i = 0; i <= M; i++) { const u = i / M; prof.push([u, -cam * 4 * u * (1 - u) + th(u, t)]); }
    for (let i = M - 1; i >= 1; i--) { const u = i / M; prof.push([u, -cam * 4 * u * (1 - u) - th(u, t)]); }
    for (const [u, yl] of prof) {
      const bx = -u * s.c, by = yl * s.c;
      pos.push(s.x + bx * cs + by * sn, s.y - bx * sn + by * cs, s.z);
    }
  }
  const S = stations.length;
  for (let i = 0; i < S - 1; i++) for (let k = 0; k < R; k++) {
    const a = i * R + k, b = i * R + ((k + 1) % R), c = a + R, d = b + R;
    idx.push(a, c, b, b, c, d);
  }
  for (const [i, flip] of [[0, false], [S - 1, true]]) for (let k = 1; k < R - 1; k++) {
    const a = i * R, b = i * R + k, c = i * R + k + 1;
    if (flip) idx.push(a, c, b); else idx.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // the middle of the upper surface must face up
  const probe = Math.floor(S / 2) * R + Math.floor(M / 2);
  if (g.attributes.normal.getY(probe) < 0) {
    const ix = g.index.array;
    for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

// thin plate from an outline in the x-y plane, at lateral position z
export function sidePlate(outline, z, thick = 0.014) {
  const sh = new THREE.Shape();
  outline.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  return new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false }).translate(0, 0, z - thick / 2);
}
// flat plate from an outline in plan (x, z), top face at height y
export function planPlate(outline, y, thick = 0.025) {
  const sh = new THREE.Shape();
  outline.forEach(([x, z], i) => (i ? sh.lineTo(x, z) : sh.moveTo(x, z)));
  return new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, y, 0);
}
// one-sided painted face of a plate, looking outward (+z)
export function skinFace(outline, z, slot) {
  const sh = new THREE.Shape();
  outline.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const g = new THREE.ShapeGeometry(sh).translate(0, 0, z);
  flipIfInward(g, () => [0, 0, 1]);
  if (slot) g.userData.slot = slot;
  return g;
}
export function block(lx, ly, lz, x, y, z, rz = 0, ry = 0) {
  const g = new THREE.BoxGeometry(lx, ly, lz);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  return g.translate(x, y, z);
}
// streamlined strut between two points: `chord` along the car, `thick` across the airflow
export function arm(a, b, chord = 0.07, thick = 0.02, seg = 10) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), Y = vb.clone().sub(va), len = Y.length();
  Y.normalize();
  const X = new THREE.Vector3(1, 0, 0).addScaledVector(Y, -Y.x).normalize(), Z = new THREE.Vector3().crossVectors(X, Y);
  const g = new THREE.CylinderGeometry(0.5, 0.5, len, seg).scale(chord, 1, thick);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z));
  const mid = va.add(vb).multiplyScalar(0.5);
  return g.translate(mid.x, mid.y, mid.z);
}
export const bar = (a, b, r) => arm(a, b, r * 2, r * 2, 8);
export function tubeAlong(points, radius, seg = 28, radial = 10, flat = 1) {
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), seg, radius, radial);
  return flat === 1 ? g : g;
}


// ---------------------------------------------------------------- detail helpers
function inward(g) { // turn a skin inside out (ducts are seen from inside)
  const ix = g.index.array;
  for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
  g.computeVertexNormals();
  return g;
}
function ringCentre(ring) {
  let y = 0, z = 0;
  for (const p of ring) { y += p[1]; z += p[2]; }
  return [y / ring.length, z / ring.length];
}
export function scaleRing(ring, k, dx = 0, c = ringCentre(ring)) {
  return ring.map((p) => [p[0] + dx, c[0] + (p[1] - c[0]) * k, c[1] + (p[2] - c[1]) * k]);
}
// Duct running back (dir = -1) from a closed mouth ring: dark inner wall and an end face.
export function duct(mouth, depth, taper = 0.82, dir = -1, steps = 4) {
  const rs = [];
  for (let i = 0; i <= steps; i++) { const t = i / steps; rs.push(scaleRing(mouth, lerp(1, taper, t), dir * depth * t)); }
  return { wall: inward(skinRings(rs, { closed: true })), face: capRing(rs[steps], -dir) };
}
const dense = (pts, max = 0.07) => {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / max));
    for (let k = 0; k < n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
  }
  return out;
};
// lower and upper edge of an outline at x (outline in the x-y plane)
function span(outline, x) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length];
    if ((a[0] - x) * (b[0] - x) > 0) continue;
    if (a[0] === b[0]) { lo = Math.min(lo, a[1], b[1]); hi = Math.max(hi, a[1], b[1]); continue; }
    const y = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
    lo = Math.min(lo, y); hi = Math.max(hi, y);
  }
  return [lo, hi];
}
function gridFace(rows, dir, skip = null) {
  const n = rows[0].length, pos = [], idx = [];
  for (const r of rows) for (const p of r) pos.push(p[0], p[1], p[2]);
  for (let i = 0; i < rows.length - 1; i++) for (let k = 0; k < n - 1; k++) { if (skip && skip(i, k)) continue; const a = i * n + k, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return flipIfInward(g, () => dir);
}
// Endplate that is not flat: `zAt(x, y, t)` gives the lateral position of its mid-surface
// (t runs 0 at the lower edge to 1 at the top). Returns the outward face on its own, so it can
// carry the team livery, and the inward face plus edge band in one piece.
export function shapedPlate(outline, zAt, { nx = 26, ny = 12, thick = 0.012, slots = [] } = {}) {
  const xs0 = outline.map((p) => p[0]), x0 = Math.min(...xs0), x1 = Math.max(...xs0), out = [], inn = [];
  // slots are cut-outs along the plate's own grain: { x: [a, b], t: [lo, hi] } with t from 0 (lower edge) to 1
  const uniq = (list) => list.sort((p, q) => p - q).filter((v, i, arr) => i === 0 || v - arr[i - 1] > 1e-5);
  const cols = uniq([...Array.from({ length: nx + 1 }, (_, i) => lerp(x0, x1, i / nx)), ...slots.flatMap((sl) => sl.x)]);
  const ts = uniq([...Array.from({ length: ny + 1 }, (_, j) => j / ny), ...slots.flatMap((sl) => sl.t)]);
  for (const x of cols) {
    const [lo, hi] = span(outline, clamp(x, x0 + 1e-4, x1 - 1e-4)), ro = [], ri = [];
    for (const t of ts) { const y = lerp(lo, hi, t), z = zAt(x, y, t); ro.push([x, y, z + thick / 2]); ri.push([x, y, z - thick / 2]); }
    out.push(ro); inn.push(ri);
  }
  const NX = cols.length - 1, NY = ts.length - 1;
  const cut = (i, k) => slots.some((sl) => { const cx = (cols[i] + cols[i + 1]) / 2, ct = (ts[k] + ts[k + 1]) / 2; return cx > Math.min(...sl.x) && cx < Math.max(...sl.x) && ct > sl.t[0] && ct < sl.t[1]; });
  const loop = (g) => [...g.map((r) => r[0]), ...g[NX].slice(1), ...g.slice(0, NX).reverse().map((r) => r[NY]), ...g[0].slice(1, NY).reverse()];
  const edge = skinRings([loop(out), loop(inn)], { closed: true });
  // walls round each cut-out, so the plate shows its thickness there
  const wallPos = [];
  const wall = (a, b) => { const o1 = out[a[0]][a[1]], o2 = out[b[0]][b[1]], i1 = inn[a[0]][a[1]], i2 = inn[b[0]][b[1]]; wallPos.push(...o1, ...o2, ...i1, ...o2, ...i2, ...i1, ...o1, ...i1, ...o2, ...o2, ...i1, ...i2); };
  for (let i = 0; i < NX; i++) for (let k = 0; k < NY; k++) if (cut(i, k)) {
    if (!cut(i, k - 1)) wall([i, k], [i + 1, k]);
    if (!cut(i, k + 1)) wall([i, k + 1], [i + 1, k + 1]);
    if (i === 0 || !cut(i - 1, k)) wall([i, k], [i, k + 1]);
    if (i === NX - 1 || !cut(i + 1, k)) wall([i + 1, k], [i + 1, k + 1]);
  }
  const parts = { outer: gridFace(out, [0, 0, 1], slots.length ? cut : null), inner: gridFace(inn, [0, 0, -1], slots.length ? cut : null), edge };
  if (wallPos.length) { const w = new THREE.BufferGeometry(); w.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3)); w.computeVertexNormals(); parts.walls = w; }
  return parts;
}
// bend a plate sideways behind x0: used for diffuser strakes that curl outward
function bendBack(g, x0, len, bend) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const d = clamp((x0 - p.getX(i)) / len, 0, 1); p.setZ(i, p.getZ(i) + bend * d * d); }
  g.computeVertexNormals();
  return g;
}
const blob = (lx, ly, lz, x, y, z, rz = 0, ry = 0, seg = 14) => {
  const g = new THREE.SphereGeometry(0.5, seg, Math.round(seg * 0.7)).scale(lx, ly, lz);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  return g.translate(x, y, z);
};
export { blob };

// ---------------------------------------------------------------- the car
// `q` is the level of detail: 1 for cars near the camera, about 0.35 for the distant body.
export function formulaCar(P, q = 1) {
  const paintR = [], carbonR = [], carbonC = [], blackR = [], blackC = [], chromeR = [];
  const fine = q >= 0.55, st = (s) => s / Math.max(q, 0.3), seg = (n) => Math.max(3, Math.round(n * Math.max(q, 0.45)));

  // ---- nose, survival cell and gearbox: one half shell
  const tub = Object.fromEntries(['w', 'y0', 'y1', 'n', 'bw'].map((k) => [k, C(P.tub[k])]));
  const tubAt = (x) => ({ w: tub.w(x), y0: tub.y0(x), y1: tub.y1(x), n: tub.n(x), nb: Math.min(tub.n(x), 2.8), bw: tub.bw(x) });
  const K = seg(P.tub.K ?? 26);
  const tubTop = (x, z) => { // height of the tub's upper surface at lateral offset z
    const s = tubAt(x), qq = Math.min(0.999, Math.abs(z) / s.w);
    return (s.y0 + s.y1) / 2 + ((s.y1 - s.y0) / 2) * (1 - qq ** s.n) ** (1 / s.n);
  };
  // cockpit opening in plan: half width at x (0 outside)
  const [cxa, cxb] = P.cockpit.x;
  const openHalf = (x) => { const u = (x - cxa) / (cxb - cxa); return u <= 0 || u >= 1 ? 0 : P.cockpit.w * Math.max(0, 1 - Math.abs(u * 2 - 1) ** 3.2) ** (1 / 3.2); };
  {
    const xs = range(P.tub.x1, P.tub.x0, st(0.04)), rings = [], edgeK = [];
    // rounded nose tip: a few shrinking sections ahead of the first station
    const tip = tubAt(P.tub.x1), tipLen = P.tub.tip ?? 0.05;
    for (const f of [0.0, 0.2, 0.45, 0.7, 0.9]) {
      const e = Math.sqrt(1 - (1 - f) ** 2) * 0.96 + 0.04 * f, yc = (tip.y0 + tip.y1) / 2;
      rings.push(halfSection(P.tub.x1 + tipLen * (1 - f), { ...tip, w: tip.w * e, y0: yc - (yc - tip.y0) * e, y1: yc + (tip.y1 - yc) * e }, K));
      edgeK.push(Infinity);
    }
    for (const x of xs) {
      const ring = halfSection(x, tubAt(x), K), half = openHalf(x);
      let kb = Infinity;
      if (half > 0.02) { // the first upper sample inside the opening is moved onto its edge; the rest are left out
        for (let k = K >> 1; k <= K; k++) if (ring[k][2] < half) { kb = k; break; }
        if (kb <= K) ring[kb] = [x, tubTop(x, half), half];
      }
      rings.push(ring); edgeK.push(kb);
    }
    paintR.push(skinRings(rings, { half: true, skip: (i, k) => k >= edgeK[i] && k >= edgeK[i + 1] }));
  }
  // cockpit: a dark well, seat back, padded rim and headrest, and the driver's body in overalls
  const suitR = [], suitC = [];
  {
    const rows = [], NX = seg(24), wellY = P.cockpit.floor ?? 0.44;
    for (let i = 0; i <= NX; i++) {
      const x = lerp(cxa, cxb, i / NX), half = Math.max(openHalf(x), 0.002), yt = tubTop(x, half);
      rows.push([[x, yt + 0.002, half], [x, yt - 0.06, half * 0.985], [x, lerp(yt, wellY, 0.6), half * 0.93], [x, wellY, half * 0.8], [x, wellY, 0]]);
    }
    blackR.push(gridFace(rows, [0, 0.5, -1]));
    // padded rim laid exactly on the edge of the opening
    const rim = [];
    for (let i = 0; i <= 26; i++) { const x = lerp(cxa - 0.004, cxb + 0.004, i / 26), half = openHalf(x); rim.push([x, tubTop(x, Math.max(half, 0.001)) + 0.006, half]); }
    blackR.push(tubeAlong(rim, P.cockpit.rimR ?? 0.03, seg(44), seg(10)));
    const w = P.cockpit.w, hx = cxb + 0.01;
    // headrest horseshoe round the back of the helmet
    blackR.push(tubeAlong([[hx + 0.42, 0.742, w * 0.84], [hx + 0.2, 0.765, w * 0.86], [hx + 0.06, 0.785, w * 0.6], [hx + 0.015, 0.795, 0]], 0.047, seg(18), seg(9)));
    if (fine) {
      // seat back and shoulder wings
      carbonC.push(block(0.05, 0.3, w * 1.5, hx + 0.09, 0.6, 0, 0.18));
      // driver: chest, shoulders, arms reaching the wheel; belts across the shoulders
      suitC.push(blob(0.26, 0.3, w * 1.25, 0.3, 0.57, 0, 0.15));
      suitR.push(blob(0.17, 0.11, 0.17, 0.3, 0.675, w * 0.5, -0.2));
      suitR.push(arm([0.31, 0.665, w * 0.68], [0.52, 0.565, w * 0.72], 0.075, 0.07, 10), blob(0.078, 0.078, 0.078, 0.52, 0.565, w * 0.72), arm([0.52, 0.565, w * 0.72], [0.715, 0.65, 0.145], 0.058, 0.054, 10));
      carbonR.push(block(0.2, 0.007, 0.045, 0.31, 0.737, 0.07, -0.42), block(0.012, 0.03, 0.05, 0.4, 0.69, 0.07));
      // dash hoop ahead of the wheel
      blackC.push(block(0.05, 0.03, w * 1.5, cxa - 0.1, tubTop(cxa - 0.1, 0) + 0.006, 0));
    }
  }

  // ---- airbox and engine cover: pear-shaped half shell with a flared shoulder
  const ec = Object.fromEntries(['top', 'wTop', 'wMid', 'base', 'wBase'].map((k) => [k, C(P.cover[k])]));
  {
    const rings = [], m = seg(7);
    const ringAt = (x, k = 1) => {
      const top = ec.top(x), base = ec.base(x), wT = ec.wTop(x) * k, wM = ec.wMid(x) * k, wB = ec.wBase(x) * k, mid = lerp(base, top, P.cover.belly ?? 0.5);
      return fillet(x, [[0, base - 0.08], [wB, base - 0.08], [wB, base + 0.03], [wM, mid], [wT, top - 0.035], [0, top]], [0, 0.2, 0.9, 1, 1, 0], m, false);
    };
    for (const x of range(P.cover.x1, P.cover.x0, st(0.045))) rings.push(ringAt(x));
    // rolled intake lip
    const first = rings[0], base0 = ec.base(P.cover.x1) + 0.04;
    paintR.push(skinRings(rings, { half: true }));
    const open = first.filter((p) => p[1] > base0);
    const loop = [...open, ...open.slice(1, -1).reverse().map((p) => [p[0], p[1], -p[2]])];
    const mouth = scaleRing(loop, P.cover.mouth ?? 0.8, -0.012);
    carbonC.push(skinRings([scaleRing(loop, 1.0, 0.0), scaleRing(loop, 0.97, 0.016), scaleRing(loop, 0.9, 0.018), mouth], { closed: true }));
    paintR.push(capHalf(first.filter((p) => p[1] <= base0 + 0.02), 1));
    const d = duct(mouth, 0.3, 0.7);
    blackC.push(d.wall, d.face);
    // cooling gills along the flank of the cover
    if (fine) for (let k = 0; k < (P.cover.gills ?? 0); k++) {
      const x = (P.cover.gillX ?? -0.75) - k * 0.075, mid = lerp(ec.base(x), ec.top(x), 0.3), wM = lerp(ec.wBase(x), ec.wMid(x), 0.55);
      blackR.push(block(0.042, 0.1, 0.006, x, mid, wM + 0.004, 0.5, -0.1));
    }
  }
  // engine-cover fin: thin, so the race number has somewhere to sit
  if (P.fin) paintR.push(sidePlate(P.fin, 0.004, 0.008));

  // ---- sidepod
  const sp = Object.fromEntries(['zo', 'top', 'zu', 'low', 'zi', 'topIn'].map((k) => [k, C(P.pod[k])]));
  {
    const rings = [], r = P.pod.round, m = seg(7);
    for (const x of range(P.pod.x1, P.pod.x0, st(0.045))) {
      const zo = sp.zo(x), top = sp.top(x), zu = sp.zu(x), low = sp.low(x), zi = sp.zi(x), tin = sp.topIn(x);
      const mid = lerp(low, top, P.pod.waist ?? 0.6);
      rings.push(fillet(x, [[zi, low], [zu, low], [zo, mid], [zo - (P.pod.lean ?? 0.02), top], [zi, tin]], r, m, true));
    }
    // inlet: the skin rolls forward into a lip, turns inside, and a dark duct runs back to the radiator
    const body0 = rings[0], c = ringCentre(body0), lip = (k, dx) => scaleRing(body0, k, dx, c), mk = P.pod.mouth ?? 0.84;
    const mouth = lip(mk, 0.012);
    rings.unshift(mouth, lip(mk + 0.035, 0.03), lip(0.93, 0.036), lip(0.975, 0.022));
    paintR.push(skinRings(rings, { closed: true, centre: null }));
    const d = duct(mouth, P.pod.duct ?? 0.34, 0.86);
    blackR.push(d.wall); carbonR.push(d.face);
    if (fine) for (let k = 1; k <= 5; k++) { // radiator core: slats across the end of the duct
      const ring = scaleRing(mouth, 0.86, -(P.pod.duct ?? 0.34) + 0.006, c), ys = ring.map((p) => p[1]), zs = ring.map((p) => p[2]);
      const y = lerp(Math.min(...ys), Math.max(...ys), k / 6);
      chromeR.push(block(0.004, 0.006, (Math.max(...zs) - Math.min(...zs)) * 0.86, ring[0][0], y, (Math.max(...zs) + Math.min(...zs)) / 2));
    }
    // hot-air exit at the back of the pod
    const last = rings[rings.length - 1], exit = duct(scaleRing(last, 0.9), 0.14, 0.7, 1, 2);
    paintR.push(skinRings([last, scaleRing(last, 0.9)], { closed: true }));
    blackR.push(exit.wall, exit.face);
    // cooling louvres on the shoulder
    if (fine) for (let k = 0; k < (P.pod.louvres ?? 0); k++) {
      const x = P.pod.louvreX - k * 0.085, top = sp.top(x), slope = (sp.top(x + 0.05) - sp.top(x - 0.05)) / 0.1;
      blackR.push(block(0.045, 0.006, 0.2, x, top - 0.0015, sp.zo(x) - 0.23, Math.atan(slope), 0.12));
    }
  }

  // ---- floor, edge, fences, diffuser
  {
    const F = P.floor, half = F.outline, full = [...half, ...half.slice().reverse().map(([x, z]) => [x, -z])];
    carbonC.push(planPlate(full, F.y, 0.03));
    if (F.plank) carbonC.push(block(F.plank[1] - F.plank[0], 0.012, 0.3, (F.plank[0] + F.plank[1]) / 2, F.y - 0.034, 0));
    for (const e of F.edges || []) carbonR.push(arm(e[0], e[1], e[2] ?? 0.05, 0.008, 6));
    if (fine) for (const v of F.fences || []) carbonR.push(bendBack(sidePlate(dense(v.outline), 0, 0.008), 0.3, 0.3, -(v.curl ?? 0.05)).rotateY(v.yaw).translate(v.x, 0, v.z));
    const D = F.diffuser;
    carbonC.push(new THREE.ExtrudeGeometry(new THREE.Shape(D.ramp.map(([x, y]) => new THREE.Vector2(x, y))), { depth: D.w * 2, bevelEnabled: false }).translate(0, 0, -D.w));
    const xs = D.strake.map((p) => p[0]), sx = Math.max(...xs), sl = sx - Math.min(...xs);
    for (const z of D.strakes) carbonR.push(bendBack(sidePlate(dense(D.strake), z, 0.008), sx, sl, (D.curl ?? 0.1) * (z / D.w)));
    carbonR.push(bendBack(sidePlate(dense(D.wall), D.w, 0.012), sx, sl, D.curl ?? 0.1));
  }

  // ---- front wing: elements sweep back and curl up into a shaped endplate
  {
    const W = P.frontWing, tipZ = W.span[W.span.length - 1], N = seg(16);
    const zEnd = tipZ + 0.013, xs = W.endplate.map((p) => p[0]), xr = Math.min(...xs), xf = Math.max(...xs);
    // endplate mid-surface: turned outward at the back, leaning in at the top
    const plateZ = (x, t = 0) => zEnd + (W.flare ?? 0.05) * smooth(x, xf - 0.1, xr) ** 1.6 - (W.lean ?? 0.02) * t * t;
    const el = (e, i) => {
      const zs = [];
      for (let k = 0; k <= N; k++) { const z = tipZ * (1 - (1 - k / N) ** 1.35); if (z >= (e.inboard ?? 0) - 1e-6) zs.push(z); }
      if (e.inboard && zs[0] > e.inboard + 0.01) zs.unshift(e.inboard);
      const st2 = zs.map((z) => {
        const qq = z / tipZ, curl = smooth(qq, W.curlFrom ?? 0.8, 1) ** 2;
        return {
          z, x: W.x - W.sweep * qq ** W.sweepPow - e.dx - (W.curlBack ?? 0) * curl * i,
          y: W.y + (W.droop ?? 0.018) * qq * qq + e.dy * (1 - (e.fall ?? 0.25) * qq ** (e.fallPow ?? 1)) + (W.curl ?? 0) * (0.5 + 0.5 * i) * curl,
          c: e.c * (1 - (e.taper ?? 0.22) * qq), a: e.a * (1 - (e.wash ?? 0.35) * qq) + (W.curlAngle ?? 0) * curl, t: 0.09,
        };
      });
      // one more station carries the tip out to the plate, wherever the plate has flared to
      const tipS = st2[st2.length - 1];
      const pl = span(W.endplate, clamp(tipS.x - tipS.c * 0.5, xr + 0.01, xf - 0.01));
      st2.push({ ...tipS, z: plateZ(tipS.x - tipS.c * 0.5, clamp((tipS.y - pl[0]) / (pl[1] - pl[0]), 0, 1)) - 0.008 });
      return foil(st2, seg(9), e.camber ?? 0.07);
    };
    W.elements.forEach((e, i) => {
      const g = el(e, i);
      if (i === W.elements.length - 1) { g.userData.slot = 'T'; paintR.push(g); } else carbonR.push(g);
    });
    const plate = shapedPlate(W.endplate, (x, y, t) => plateZ(x, t), { nx: seg(24), ny: seg(10) });
    plate.outer.userData.slot = 'F';
    paintR.push(plate.outer); carbonR.push(plate.inner, plate.edge);
    for (const b of W.extras || []) carbonR.push(b);
    for (const b of W.centre || []) carbonC.push(b);
  }

  // ---- rear wing, beam wing, endplates, pylon
  {
    const W = P.rearWing, tipZ = W.span[W.span.length - 1], N = seg(12), st2 = [], rad = W.tipRadius ?? 0.07;
    const main = (z, lift = 0) => ({ z, x: W.x, y: W.y + W.spoon * (Math.min(z, tipZ - rad) / tipZ) ** 2.2 + lift, c: W.c - W.taper * (z / tipZ), a: W.a, t: 0.11 });
    for (let k = 0; k <= N; k++) st2.push(main(((tipZ - rad) * k) / N));
    // the mainplane turns up into the endplate through a radius instead of butting into it
    for (const deg of [18, 36, 54, 70, 82]) { const th = (deg * Math.PI) / 180; st2.push(main(tipZ - rad + rad * Math.sin(th), rad * (1 - Math.cos(th)))); }
    carbonR.push(foil(st2, seg(9), 0.09));
    for (const b of W.beam) carbonR.push(foil([0, 0.1, 0.2, 0.3, b.z ?? 0.4].map((z) => ({ z, x: b.x, y: b.y + (b.rise ?? 0) * (z / (b.z ?? 0.4)) ** 2, c: b.c, a: b.a, t: 0.09 })), seg(8)));
    // endplate: full height at the wing, swept inboard below it, with louvre cut-outs
    const ys = W.endplate.map((p) => p[1]), yLo = Math.min(...ys), tuck = W.tuck ?? 0;
    const plate = shapedPlate(W.endplate, (x, y) => tipZ + 0.007 - tuck * (1 - smooth(y, yLo, yLo + (W.tuckH ?? 0.3))) ** 1.5, { nx: seg(24), ny: seg(14), thick: 0.014, slots: fine ? W.slots || [] : [] });
    plate.outer.userData.slot = 'R';
    paintR.push(plate.outer); carbonR.push(plate.inner, plate.edge);
    if (plate.walls) carbonR.push(plate.walls);
    for (const b of W.extras || []) carbonR.push(b);
    for (const py of W.pylons) carbonC.push(sidePlate(py.outline, py.z ?? 0, py.t ?? 0.03));
  }

  // ---- suspension, uprights, brake drums and ducts
  for (const a of P.arms) {
    carbonR.push(a.r ? bar(a.from, a.to, a.r) : arm(a.from, a.to, a.chord ?? 0.07, a.thick ?? 0.02, seg(12)));
    if (!fine) continue;
    const r = a.r ? a.r * 1.7 : 0.024;
    chromeR.push(blob(r * 2, r * 2, r * 2, ...a.to, 0, 0, 8));                                  // inboard rod end on the chassis
    if (!a.r) carbonR.push(blob((a.chord ?? 0.07) * 1.9, 0.05, 0.1, a.from[0], a.from[1], a.from[2] - 0.03)); // fairing where the arm meets the upright
    else chromeR.push(blob(r * 2, r * 2, r * 2, ...a.from, 0, 0, 8));
  }
  for (const [ax, az, w, front] of [[FRONT_X, FRONT_Z, FRONT_W, true], [REAR_X, REAR_Z, REAR_W, false]]) {
    const zi = az - w / 2; // inner face of the tyre
    carbonR.push(new THREE.CylinderGeometry(0.222, 0.222, 0.11, seg(28)).rotateX(Math.PI / 2).translate(ax, WHEEL_R, zi - 0.04));       // brake drum
    if (!fine) continue;
    carbonR.push(new THREE.TorusGeometry(0.222, 0.012, 6, 28).translate(ax, WHEEL_R, zi - 0.095));                                        // drum lip
    blackR.push(new THREE.CylinderGeometry(0.2, 0.2, 0.004, 24).rotateX(Math.PI / 2).translate(ax, WHEEL_R, zi - 0.097));                 // drum face
    carbonR.push(blob(0.13, 0.4, 0.07, ax, WHEEL_R, zi - 0.12));                                                                         // upright
    if (P.ducts) { // brake-cooling scoop: a tall mouth ahead of the upright, narrowing back into the drum
      const zc = zi - 0.135, [yl, yh] = front ? [0.235, 0.5] : [0.27, 0.46];
      const ring = (x, hw, grow = 0) => fillet(x, [[zc - hw, yl - grow], [zc + hw, yl - grow], [zc + hw + grow, yh + grow], [zc - hw, yh + grow]], 0.85, 4, true);
      const mouth = ring(ax + 0.29, 0.03), lipIn = scaleRing(mouth, 0.84, -0.01);
      carbonR.push(skinRings([lipIn, mouth, ring(ax + 0.2, 0.034), ring(ax + 0.08, 0.04, 0.012), ring(ax - 0.02, 0.038)], { closed: true }));
      const d = duct(lipIn, 0.16, 0.8, -1, 2);
      blackR.push(d.wall, d.face);
      if (front) carbonR.push(bendBack(sidePlate(dense([[ax - 0.18, 0.12], [ax + 0.2, 0.12], [ax + 0.27, 0.2], [ax + 0.2, 0.36], [ax - 0.02, 0.44], [ax - 0.2, 0.34]], 0.04), zi - 0.19, 0.006), ax + 0.27, 0.47, -0.05)); // deflector inboard of the tyre
    }
  }

  for (const g of P.extra?.paintR || []) paintR.push(g);
  for (const g of P.extra?.carbonR || []) carbonR.push(g);
  for (const g of P.extra?.carbonC || []) carbonC.push(g);
  for (const g of P.extra?.blackR || []) blackR.push(g);
  for (const g of P.extra?.blackC || []) blackC.push(g);
  for (const g of P.extra?.chromeR || []) chromeR.push(g);

  // ---- mirrors (the glass is a separate mesh added by the game at (0.9885, 0.735, ±0.63))
  for (const s of P.mirror.stalks) carbonR.push(arm(s[0], s[1], s[2] ?? 0.07, s[3] ?? 0.014, 10));
  paintR.push(new THREE.SphereGeometry(1, seg(18), seg(10), 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).scale(0.085, 0.047, 0.1).translate(0.996, 0.735, 0.63));
  blackR.push(block(0.012, 0.09, 0.196, 0.999, 0.735, 0.63), block(0.004, 0.072, 0.178, 0.9915, 0.735, 0.63));

  // ---- halo: its own mesh so the cockpit view can fade it
  const hoop = tubeAlong(P.halo.hoop, P.halo.r, seg(34), seg(12));
  const strut = arm(P.halo.strut[0], P.halo.strut[1], P.halo.strutChord ?? 0.06, P.halo.strutThick ?? 0.035, 12);

  // ---- DRS flap in its own frame: trailing edge on the pivot at (-2.585, 1.005)
  const flapZ = P.rearWing.flapSpan;
  const flap = foil(flapZ.map((z) => ({ z, x: 0.185, y: -0.105, c: 0.215, a: 30, t: 0.1 })), 8, 0.08);

  return { paintR, carbonR, carbonC, blackR, blackC, chromeR, suitR, suitC, haloR: [hoop], haloC: [strut], flap, tubTop };
}
const smooth = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// painted cap over an open half ring (closed across the centreline)
function capHalf(ring, dir) {
  const loop = [...ring, [ring[0][0], ring[ring.length - 1][1], 0]];
  let y = 0, z = 0;
  for (const p of ring) { y += p[1]; z += p[2]; }
  y /= ring.length; z /= ring.length;
  const pos = [ring[0][0], y, z * 0.3], idx = [];
  for (const p of ring) pos.push(p[0], p[1], p[2]);
  for (let k = 0; k < ring.length - 1; k++) idx.push(0, 1 + k, 2 + k);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  void loop;
  return flipIfInward(g, () => [dir, 0, 0]);
}
