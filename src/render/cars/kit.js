// Toolkit for car bodies drawn in code. Metres; +X forward, +Y up, tyres on y = 0.
//
// A body is one smooth skin lofted through cross-sections. Each half section is a control
// polygon running from the floor centreline, round the wheel well and flank, over the shoulder
// and cabin to the roof centreline:
//
//   floor -> wellIn -> wellTop -> lip -> side -> sh -> in -> rail -> top
//
// Every control point is a function of x, so a car is described by a handful of curves
// (plan outline, side silhouette, fender line, cabin lines). Corners are filleted per point.
//
// The skin is addressed by (x, v): x along the car, v along the half section in sample units
// (body.v('sh', 'in', 0.5) is halfway from the shoulder point to the next one). Three things
// are built on that address:
//   holes    real openings cut out of the skin (windows, intakes, lamp apertures)
//   patches  pieces of the same surface lifted off it, or sunk into it, in another material
//   regions  patches trimmed to a shape, e.g. the glass that fills a window hole and its frame
// The inside of the skin is drawn too (the `liner` batch), so openings show a dark cavity and
// cameras inside the car see a cabin instead of the road.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const { clamp, lerp, smoothstep } = THREE.MathUtils;
export { clamp, lerp, smoothstep };

// Shape-preserving cubic through [x, y] keys (ascending x). A third element 'c' marks a corner:
// the curve keeps its one-sided slopes there, for creases such as a windscreen base.
export function curve(keys) {
  if (typeof keys === 'function') return keys;
  if (typeof keys === 'number') return () => keys;
  const n = keys.length, X = keys.map((k) => k[0]), Y = keys.map((k) => k[1]);
  if (n === 1) return () => Y[0];
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((Y[i + 1] - Y[i]) / (X[i + 1] - X[i]));
  const mL = [], mR = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) mL[i] = mR[i] = d[0];
    else if (i === n - 1) mL[i] = mR[i] = d[n - 2];
    else if (keys[i][2] === 'c') { mL[i] = d[i - 1]; mR[i] = d[i]; }
    else if (d[i - 1] * d[i] <= 0) mL[i] = mR[i] = 0;
    else {
      const h0 = X[i] - X[i - 1], h1 = X[i + 1] - X[i];
      mL[i] = mR[i] = (3 * (h0 + h1)) / ((2 * h1 + h0) / d[i - 1] + (h1 + 2 * h0) / d[i]);
    }
  }
  return (x) => {
    if (x <= X[0]) return Y[0];
    if (x >= X[n - 1]) return Y[n - 1];
    let i = 0;
    while (x > X[i + 1]) i++;
    const h = X[i + 1] - X[i], t = (x - X[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * Y[i] + (t3 - 2 * t2 + t) * h * mR[i] + (-2 * t3 + 3 * t2) * Y[i + 1] + (t3 - t2) * h * mL[i + 1];
  };
}

// position + normal only, never indexed: everything merges with everything.
export function plain(g) {
  const flat = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
  if (!flat.attributes.normal) flat.computeVertexNormals();
  return flat;
}

export function mirrorZ(g) {
  const m = plain(g.clone()); // triangle soup: corners can be swapped without touching an index
  const p = m.attributes.position, nm = m.attributes.normal;
  for (let i = 0; i < p.count; i++) { p.setZ(i, -p.getZ(i)); nm.setZ(i, -nm.getZ(i)); }
  for (let i = 0; i < p.count; i += 3) { // swap two corners so the triangle still faces out
    for (const a of [p, nm]) {
      const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x, y, z);
    }
  }
  return m;
}
export const both = (g) => [g, mirrorZ(g)];

// ---------------------------------------------------------------- grids and trimming
// Smooth-shaded grid from rows of points. `out` gives a rough outward direction for a point so
// the winding can be set without caring how the rows were ordered. `fields` are per-vertex
// scalars (same shape as rows): only the part of the grid where every field is positive is
// kept, with cells cut along the zero line.
function gridGeometry(rows, out, { fixCentre = false, fields = [] } = {}) {
  const nr = rows.length, nc = rows[0].length, pos = new Float32Array(nr * nc * 3), idx = [];
  for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) pos.set(rows[i][j], (i * nc + j) * 3);
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) {
    const a = i * nc + j, b = a + 1, c = a + nc, e = c + 1;
    idx.push(a, c, b, b, c, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nm = g.attributes.normal;
  let vote = 0;
  for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
    const k = i * nc + j, o = out(rows[i][j]);
    vote += nm.getX(k) * o[0] + nm.getY(k) * o[1] + nm.getZ(k) * o[2];
  }
  const flipped = vote < 0;
  if (flipped) for (let k = 0; k < nm.count; k++) nm.setXYZ(k, -nm.getX(k), -nm.getY(k), -nm.getZ(k));
  if (fixCentre) { // vertices on the centreline: no sideways lean, so the two halves meet smoothly
    for (let k = 0; k < nm.count; k++) if (Math.abs(pos[k * 3 + 2]) < 1e-6) {
      const x = nm.getX(k), y = nm.getY(k), l = Math.hypot(x, y) || 1;
      nm.setXYZ(k, x / l, y / l, 0);
    }
  }
  const N = nm.array, P = [], Q = [];
  const emit = (poly) => { // fan-triangulate a convex polygon of [px,py,pz,nx,ny,nz]
    for (let k = 1; k < poly.length - 1; k++) for (const v of flipped ? [poly[0], poly[k + 1], poly[k]] : [poly[0], poly[k], poly[k + 1]]) {
      P.push(v[0], v[1], v[2]); Q.push(v[3], v[4], v[5]);
    }
  };
  const vert = (i, j) => { const k = (i * nc + j) * 3; return [pos[k], pos[k + 1], pos[k + 2], N[k], N[k + 1], N[k + 2], ...fields.map((f) => f[i][j])]; };
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) {
    let poly = [vert(i, j), vert(i + 1, j), vert(i + 1, j + 1), vert(i, j + 1)];
    for (let f = 0; f < fields.length && poly.length; f++) {
      const s = 6 + f;
      if (poly.every((v) => v[s] > 0)) continue;
      if (poly.every((v) => v[s] <= 0)) { poly = []; break; }
      const next = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length];
        if (a[s] > 0) next.push(a);
        if ((a[s] > 0) !== (b[s] > 0)) { const t = a[s] / (a[s] - b[s]); next.push(a.map((av, q) => av + (b[q] - av) * t)); }
      }
      poly = next;
    }
    if (poly.length >= 3) emit(poly);
  }
  const soup = new THREE.BufferGeometry();
  soup.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  soup.setAttribute('normal', new THREE.Float32BufferAttribute(Q, 3));
  return soup;
}

// Shapes in (x, v), positive inside, roughly in metres so cuts land where the numbers say.
// `sv` is the length of one v unit on the surface (about 4 to 5 cm on a typical flank).
const fn = (k) => (typeof k === 'function' ? k : () => k);
// Four-sided region: x limits may be functions of t (0 at v[0], 1 at v[1]) for raked edges.
export function quadRegion({ x, v, r = 0.03, sv = 0.045 }) {
  const xa = fn(x[0]), xb = fn(x[1]);
  return (X, V) => {
    const t = clamp((V - v[0]) / (v[1] - v[0]), 0, 1), a = xa(t), b = xb(t);
    const cx = (a + b) / 2, hx = Math.abs(b - a) / 2, hv = (Math.abs(v[1] - v[0]) / 2) * sv, rr = Math.min(r, hx, hv);
    const qx = Math.abs(X - cx) - hx + rr, qv = Math.abs(V - (v[0] + v[1]) / 2) * sv - hv + rr;
    return rr - (Math.hypot(Math.max(qx, 0), Math.max(qv, 0)) + Math.min(Math.max(qx, qv), 0));
  };
}
export function ellipseRegion({ x, v, rx, rv, sv = 0.045 }) {
  return (X, V) => (1 - Math.hypot((X - x) / rx, (V - v) / rv)) * Math.min(rx, rv * sv);
}
// Combine shapes: inside any / inside all / inside the first but not the rest.
export const anyOf = (...ds) => (X, V) => Math.max(...ds.map((d) => d(X, V)));
export const allOf = (...ds) => (X, V) => Math.min(...ds.map((d) => d(X, V)));
export const minus = (d, ...cut) => (X, V) => Math.min(d(X, V), ...cut.map((c) => -c(X, V)));

const ORDER = ['floor', 'wellIn', 'wellTop', 'lip', 'side', 'sh', 'in', 'rail', 'top'];
// samples laid on each corner's fillet. Two samples with no radius make a hard crease.
const SAMPLES = { floor: 1, wellIn: 1, wellTop: 1, lip: 2, side: 7, sh: 7, in: 6, rail: 7, top: 1 };

export function makeBody(spec, quality = 1) {
  const f = {};
  for (const k of ['w', 'wLip', 'sill', 'sideY', 'shZ', 'shY', 'inZ', 'inY', 'railZ', 'railY', 'top']) f[k] = curve(spec[k]);
  const round = {};
  for (const k of ['side', 'sh', 'in', 'rail']) round[k] = curve(spec.round?.[k] ?? 1);
  const { x0, x1, floor = 0.07, axles, archR = 0.4, axleY = 0.36, wellIn = 0.6 } = spec;
  const nose = { L: 0.12, p: 2.6, sweep: 0.2, pow: 2.4, len: 0.6, ...spec.nose };
  const tail = { L: 0.1, p: 2.6, sweep: 0.08, pow: 2.4, len: 0.4, ...spec.tail };
  const samples = { ...SAMPLES, ...spec.samples };
  if (quality < 1) for (const k of ['side', 'sh', 'in', 'rail']) samples[k] = Math.max(3, Math.round(samples[k] * quality));

  const count = ORDER.reduce((s, k) => s + samples[k], 0);
  const anchor = {};
  { let c = 0; for (const k of ORDER) { anchor[k] = c + (samples[k] - 1) / 2; c += samples[k]; } }
  const lipSplit = anchor.lip + 0.5; // skin starts at the second lip sample

  // how far the lower edge is lifted over a wheel
  const archLift = (x) => {
    let y = 0;
    for (const ax of axles) { const dx = x - ax; if (Math.abs(dx) < archR) y = Math.max(y, axleY + Math.sqrt(archR * archR - dx * dx)); }
    return y;
  };
  const blunt = (x) => { // 0 at the very ends, 1 in the body: rounds the nose and tail faces
    const dn = (x1 - x) / nose.L, dt = (x - x0) / tail.L;
    let e = 1;
    if (dn < 1) e = Math.min(e, (1 - (1 - clamp(dn, 0, 1)) ** nose.p) ** (1 / nose.p));
    if (dt < 1) e = Math.min(e, (1 - (1 - clamp(dt, 0, 1)) ** tail.p) ** (1 / tail.p));
    return e;
  };

  function controls(x) {
    const w = f.w(x), sill = f.sill(x), lift = archLift(x), lip = Math.max(sill, lift);
    const inArch = lift > sill + 1e-4;
    const zIn = inArch ? wellIn : w - 0.03;
    const e = blunt(x), up = (y) => lip + (Math.max(y, lip + 0.004) - lip) * e;
    const sideY = Math.max(f.sideY(x), lip + 0.03), shY = Math.max(f.shY(x), sideY + 0.02);
    return {
      floor: [0, floor], wellIn: [zIn, floor], wellTop: [zIn, lip], lip: [f.wLip(x), lip],
      side: [w, up(sideY)], sh: [f.shZ(x), up(shY)], in: [f.inZ(x), up(f.inY(x))], rail: [f.railZ(x), up(f.railY(x))], top: [0, up(f.top(x))],
    };
  }

  const cache = new Map();
  function section(x) {
    const key = Math.round(x * 1e5);
    let pts = cache.get(key);
    if (pts) return pts;
    const C = controls(x), P = ORDER.map((k) => C[k]);
    pts = [];
    for (let i = 0; i < ORDER.length; i++) {
      const k = ORDER[i], m = samples[k], c = P[i];
      if (i === 0 || i === ORDER.length - 1) { pts.push(c); continue; }
      const r = round[k] ? clamp(round[k](x), 0, 1) : 0;
      const a = [lerp(c[0], P[i - 1][0], r / 2), lerp(c[1], P[i - 1][1], r / 2)], b = [lerp(c[0], P[i + 1][0], r / 2), lerp(c[1], P[i + 1][1], r / 2)];
      for (let j = 0; j < m; j++) {
        const t = (j + 0.5) / m, u = 1 - t;
        pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
      }
    }
    // plan-view rounding of the nose and tail corners
    const wN = f.w(x1 - nose.len * 0.5), wT = f.w(x0 + tail.len * 0.5);
    const bn = smoothstep(x, x1 - nose.len, x1), bt = 1 - smoothstep(x, x0, x0 + tail.len);
    const out = pts.map(([z, y]) => [x - bn * nose.sweep * (Math.abs(z) / wN) ** nose.pow + bt * tail.sweep * (Math.abs(z) / wT) ** tail.pow, y, z]);
    cache.set(key, out);
    return out;
  }

  // v runs along the half section in sample units; past the roof centreline it continues down the other side
  const top = count - 1, fold = (v) => (v > top ? 2 * top - v : v);
  function point(x, v, target = new THREE.Vector3()) {
    const s = section(clamp(x, x0, x1));
    let vv = clamp(v, 0, 2 * top), sign = 1;
    if (vv > top) { vv = 2 * top - vv; sign = -1; }
    const i = Math.min(top - 1, Math.floor(vv)), t = vv - i, a = s[i], b = s[i + 1];
    return target.set(lerp(a[0], b[0], t), lerp(a[1], b[1], t), sign * lerp(a[2], b[2], t));
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
  let flip = 1;
  function normal(x, v, target = new THREE.Vector3()) {
    const hx = 0.006, hv = 0.25;
    point(x + hx, v, _a); point(x - hx, v, _b); point(x, v + hv, _c); point(x, v - hv, _d);
    return target.crossVectors(_c.sub(_d), _a.sub(_b)).normalize().multiplyScalar(flip);
  }

  // station list: even spacing, plus fine steps round the arches and the blunt ends
  const step = 0.034 / quality, xs = new Set();
  for (let i = 0, n = Math.ceil((x1 - x0) / step); i <= n; i++) xs.add(x0 + ((x1 - x0) * i) / n);
  const na = Math.round(26 * Math.sqrt(quality));
  for (const ax of axles) {
    const half = Math.sqrt(Math.max(0, archR * archR - (f.sill(ax) - axleY) ** 2));
    for (let i = 0; i <= na; i++) xs.add(ax - half * Math.cos((i * Math.PI) / na));
    xs.add(ax - half - 0.004); xs.add(ax + half + 0.004);
  }
  const ne = Math.round(12 * Math.sqrt(quality));
  for (let i = 0; i <= ne; i++) { const c = 1 - Math.cos((i * Math.PI) / (2 * ne)); xs.add(x1 - nose.L * c); xs.add(x0 + tail.L * c); }
  for (const x of spec.stations || []) xs.add(x);
  const sorted = [...xs].filter((x) => x >= x0 - 1e-9 && x <= x1 + 1e-9).sort((a, b) => a - b);
  const stations = sorted.filter((x, i) => i === 0 || x - sorted[i - 1] > 0.0025 || i === sorted.length - 1);

  const rows = stations.map((x) => section(x));
  const split = Math.ceil(lipSplit);
  const outward = (p) => [0, p[1] > 0.3 ? 0.4 : -0.2, p[2] > 0.02 ? 1 : 0];
  // openings: each is a shape in (x, v), positive inside
  // (given as a function, it receives { v(from, to, t), top } so shapes can use named section points)
  const vAt = (from, to = from, t = 0) => lerp(anchor[from], anchor[to], t);
  const holes = (typeof spec.holes === 'function' ? spec.holes({ v: vAt, top }) : spec.holes) || [];
  const fields = holes.map((d) => stations.map((x) => rows[0].slice(split).map((_, j) => -d(x, split + j))));
  const skinHalf = gridGeometry(rows.map((r) => r.slice(split)), outward, { fixCentre: true, fields });
  const underHalf = gridGeometry(rows.map((r) => r.slice(0, split)), () => [0, -1, 0]);
  { const t = normal((x0 + x1) / 2, anchor.side); if (t.z < 0) flip = -1; }

  const skin = mergeGeometries([skinHalf, mirrorZ(skinHalf)]), under = mergeGeometries([underHalf, mirrorZ(underHalf)]);
  const body = {
    spec, x0, x1, count, top, anchor, point, normal, section, skin, under, holes,
    width: f.w,
    // everything the inside of the car is made of: drawn back-face only, in matt black
    liner: mergeGeometries([skin, under]),
    // v position a fraction of the way from one named control point to the next
    v(from, to = from, t = 0) { return lerp(anchor[from], anchor[to], t); },
    // v on the far (z < 0) side of the car
    far(v) { return 2 * top - v; },
    // x on the nose face at a height fraction (0 = bottom edge, 1 = where the face meets the bonnet)
    noseX(h) { return x1 - nose.L * (1 - (1 - clamp(h, 0, 1) ** nose.p) ** (1 / nose.p)); },
    tailX(h) { return x0 + tail.L * (1 - (1 - clamp(h, 0, 1) ** tail.p) ** (1 / tail.p)); },
    // A piece of the skin lifted off the surface (negative lift sinks it inside).
    // `at(s, t)` maps the unit square to [x, v]. `keep` trims it: shapes in (x, v), kept where positive.
    patch({ at, ns = 10, nt = 10, lift = 0.003, mirror = true, keep = [] }) {
      const grid = [], addr = [], n = new THREE.Vector3(), p = new THREE.Vector3();
      let dir = [0, 1, 0];
      for (let i = 0; i <= ns; i++) {
        const row = [], arow = [];
        for (let j = 0; j <= nt; j++) {
          const [x, v] = at(i / ns, j / nt);
          point(x, v, p); normal(x, v, n);
          if (n.lengthSq() < 0.5) n.set(0, 1, 0);
          if (i === ns >> 1 && j === nt >> 1) dir = [n.x, n.y, n.z];
          row.push([p.x + n.x * lift, p.y + n.y * lift, p.z + n.z * lift]);
          arow.push([x, fold(v)]);
        }
        grid.push(row); addr.push(arow);
      }
      const fields = keep.map((d) => addr.map((r) => r.map(([x, v]) => d(x, v))));
      const g = gridGeometry(grid, () => dir, { fields });
      if (!g.attributes.position.count) return [];
      return mirror ? [g, mirrorZ(g)] : [g];
    },
    // Rectangle in (x, v): x limits may be functions of t (0 at v0, 1 at v1) for raked edges.
    rect({ x, v, ns = 10, nt = 8, ...rest }) {
      const xa = fn(x[0]), xb = fn(x[1]);
      return body.patch({ at: (s, t) => [lerp(xa(t), xb(t), s), lerp(v[0], v[1], t)], ns, nt, ...rest });
    },
    // The part of the skin inside a shape `d` (as given to `holes`), within the box x:[a,b] v:[a,b].
    // `band: [lo, hi]` keeps lo < d < hi instead: [-0.02, 0.004] is a 2 cm frame round the shape,
    // [-0.005, Infinity] the shape grown by 5 mm (glass that tucks under its frame).
    region(d, { x, v, band = [0, Infinity], cell = 0.03, ...rest }) {
      const ns = Math.max(2, Math.round(Math.abs(x[1] - x[0]) / cell)), nt = Math.max(2, Math.round((Math.abs(v[1] - v[0]) * 0.045) / cell));
      const keep = [(X, V) => d(X, V) - band[0]];
      if (band[1] !== Infinity) keep.push((X, V) => band[1] - d(X, V));
      return body.patch({ at: (s, t) => [lerp(x[0], x[1], s), lerp(v[0], v[1], t)], ns, nt, keep, ...rest });
    },
    // Thin line along the skin through [x, v] points (shut lines, pinstripes).
    line(points, width = 0.006, { lift = 0.002, mirror = true } = {}) {
      const left = [], right = [], n = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), side = new THREE.Vector3();
      const fine = [];
      for (let i = 0; i < points.length - 1; i++) {
        const steps = Math.max(1, Math.round(point(...points[i], a).distanceTo(point(...points[i + 1], b)) / 0.04));
        for (let k = i ? 1 : 0; k <= steps; k++) fine.push([lerp(points[i][0], points[i + 1][0], k / steps), lerp(points[i][1], points[i + 1][1], k / steps)]);
      }
      for (let i = 0; i < fine.length; i++) {
        point(...fine[Math.max(0, i - 1)], a); point(...fine[Math.min(fine.length - 1, i + 1)], b);
        normal(...fine[i], n);
        side.crossVectors(b.sub(a), n).normalize().multiplyScalar(width / 2);
        point(...fine[i], a).addScaledVector(n, lift);
        left.push([a.x + side.x, a.y + side.y, a.z + side.z]); right.push([a.x - side.x, a.y - side.y, a.z - side.z]);
      }
      normal(...fine[fine.length >> 1], n);
      const dir = [n.x, n.y, n.z], g = gridGeometry([left, right], () => dir);
      return mirror ? [g, mirrorZ(g)] : [g];
    },
  };
  return body;
}

// ---------------------------------------------------------------- loose parts
export function box(x, y, z, length, height, width, pitch = 0, yaw = 0) {
  return new THREE.BoxGeometry(length, height, width).rotateZ(pitch).rotateY(yaw).translate(x, y, z);
}
export function ellipsoid(x, y, z, length, height, width, pitch = 0, yaw = 0, seg = 18) {
  return new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)).scale(length, height, width).rotateZ(pitch).rotateY(yaw).translate(x, y, z);
}
export function rod(a, b, radius, seg = 8) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), axis = end.clone().sub(start), mid = start.clone().lerp(end, 0.5);
  const g = new THREE.CylinderGeometry(radius, radius, axis.length(), seg);
  return g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize())).translate(mid.x, mid.y, mid.z);
}
// Tube through a list of points (roll-cage bars, hoses, wiper arms).
export function tube(points, radius, seg = 8) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) out.push(rod(points[i], points[i + 1], radius, seg));
  for (let i = 1; i < points.length - 1; i++) out.push(new THREE.SphereGeometry(radius, seg, 6).translate(...points[i]));
  return out;
}
// Disc or short cylinder with its axis along x (exhaust tips, lamp projectors, filler caps).
export function disc(x, y, z, radius, depth = 0.01, seg = 20, open = false) {
  return new THREE.CylinderGeometry(radius, radius, depth, seg, 1, open).rotateZ(Math.PI / 2).translate(x, y, z);
}
// Flat outline in the x-y plane, given thickness across the car and centred on z.
export function slab(points, thickness, z = 0, bevel = 0) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, bevel ? { depth: thickness - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 } : { depth: thickness, bevelEnabled: false });
  return g.translate(0, 0, z - (bevel ? thickness / 2 - bevel : thickness / 2));
}
// Flat outline in plan (x-z), given thickness in height.
export function plate(points, thickness, y = 0) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y, 0);
}
// Wing element spanning the car. Trailing edge at x, chord runs forward; positive angle = more wing.
export function wing(x, y, span, chord, { thick = 0.11, camber = 0.07, angle = 0.14, z = 0 } = {}) {
  const pts = [], n = 14;
  const half = (c) => thick * chord * 2.2 * (Math.sqrt(c) * (1 - c) + 0.02 * (1 - c));
  for (let i = 0; i <= n; i++) { const c = i / n; pts.push([c * chord, -camber * chord * 4 * c * (1 - c) + half(c) * 0.45]); }
  for (let i = n - 1; i >= 1; i--) { const c = i / n; pts.push([c * chord, -camber * chord * 4 * c * (1 - c) - half(c) * 0.55]); }
  return slab(pts.map(([px, py]) => [-px, py]), span, 0).rotateZ(-angle).translate(x, y, z);
}

// Door-mirror housing for the game's own mirror glass, which is a 16.5 x 6.2 cm plane facing
// backwards at (x, y, ±z). Returns { shell, back } for one side (mirror with `both`): the shell
// is a rounded cap ahead of the glass, the back a dark plate just behind it.
export function mirrorHousing(x, y, z = 0.95) {
  const shell = new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).scale(0.075, 0.046, 0.098).translate(x + 0.006, y, z);
  const rim = box(x + 0.012, y, z, 0.012, 0.088, 0.192);
  return { shell: [shell, rim], back: [box(x + 0.004, y, z, 0.004, 0.07, 0.175)] };
}

// Racing cockpit: floor, bucket seat, belted driver torso and arms, dash, and a roll cage.
// `seat` is the driver's hip point [x, y, z]; `wheel` the steering wheel centre (the game draws
// the wheel and the helmet itself); `cabin` the space available: { x0 (rear bulkhead), x1 (dash),
// w (inside half width), roof (inside roof height), floor, dash (height of the dash top) }.
export function cockpit({ seat, wheel, cabin }) {
  const [sx, sy, sz] = seat, { x0, x1, w, roof, floor } = cabin;
  const black = [], carbon = [], metal = [], suit = [];
  black.push(box((x0 + x1) / 2, floor - 0.01, 0, x1 - x0, 0.02, w * 2));                       // floor pan
  black.push(box(x0, (floor + roof * 0.8) / 2, 0, 0.03, roof * 0.8 - floor, w * 2));              // rear bulkhead
  black.push(box(x1 + 0.12, cabin.dash ?? sy + 0.34, 0, 0.34, 0.06, w * 2, -0.06));                               // dash top
  carbon.push(box(x1 - 0.03, sy + 0.24, sz, 0.05, 0.16, 0.34), box(x1 - 0.1, sy + 0.05, w * 0.2, 0.5, 0.3, 0.2)); // binnacle, centre console
  // bucket seat with shoulder and head wings
  carbon.push(slab([[sx - 0.3, sy - 0.14], [sx + 0.36, sy - 0.16], [sx + 0.38, sy - 0.08], [sx - 0.1, sy - 0.05], [sx - 0.27, sy + 0.55], [sx - 0.2, sy + 0.82], [sx - 0.3, sy + 0.84], [sx - 0.38, sy + 0.5]], 0.44, sz));
  for (const s of [-1, 1]) {
    carbon.push(slab([[sx - 0.28, sy - 0.1], [sx + 0.3, sy - 0.1], [sx + 0.3, sy + 0.04], [sx - 0.1, sy + 0.1], [sx - 0.2, sy + 0.5], [sx - 0.3, sy + 0.5]], 0.03, sz + s * 0.235));
    carbon.push(slab([[sx - 0.3, sy + 0.6], [sx - 0.06, sy + 0.62], [sx - 0.06, sy + 0.8], [sx - 0.28, sy + 0.82]], 0.03, sz + s * 0.19));
  }
  // driver: torso, shoulders, upper legs, arms to the wheel
  suit.push(ellipsoid(sx - 0.1, sy + 0.3, sz, 0.13, 0.27, 0.19, 0.22), ellipsoid(sx - 0.14, sy + 0.5, sz, 0.1, 0.09, 0.22));
  for (const s of [-1, 1]) {
    suit.push(tube([[sx - 0.02, sy + 0.02, sz + s * 0.1], [sx + 0.36, sy + 0.08, sz + s * 0.11], [x1 + 0.1, sy - 0.02, sz + s * 0.1]], 0.07));
    suit.push(tube([[sx - 0.13, sy + 0.5, sz + s * 0.2], [sx + 0.1, sy + 0.3, sz + s * 0.25], [wheel[0] - 0.03, wheel[1], wheel[2] + s * 0.14]], 0.045));
    metal.push(rod([sx - 0.2, sy + 0.56, sz + s * 0.07], [sx + 0.0, sy + 0.1, sz + s * 0.09], 0.012, 5));  // harness
  }
  metal.push(rod([wheel[0], wheel[1], wheel[2]], [x1 + 0.12, wheel[1] - 0.06, wheel[2]], 0.02));            // steering column
  // roll cage: main hoop, front legs, roof and door bars, rear stays
  const r = 0.021, ht = roof - 0.03, cw = w - 0.035, hx = sx - 0.34, fx = x1 + 0.05;
  for (const s of [-1, 1]) {
    metal.push(...tube([[hx, floor, s * cw], [hx, ht - 0.06, s * cw * 0.96], [hx, ht, s * cw * 0.84]], r));
    metal.push(...tube([[fx, floor, s * cw], [fx - 0.02, sy + 0.42, s * cw], [(hx + fx) / 2 + 0.2, ht - 0.01, s * cw * 0.86], [hx, ht, s * cw * 0.84]], r));
    metal.push(rod([hx, floor + 0.14, s * cw], [fx, sy + 0.2, s * cw], r), rod([hx, sy + 0.3, s * cw], [fx, floor + 0.12, s * cw], r));
    metal.push(rod([hx, ht - 0.05, s * cw * 0.9], [x0 + 0.03, floor + 0.3, s * cw * 0.8], r));
  }
  metal.push(rod([hx, ht, -cw * 0.84], [hx, ht, cw * 0.84], r), rod([hx, floor + 0.5, -cw], [hx, ht - 0.03, cw * 0.84], r), rod([(hx + fx) / 2 + 0.2, ht - 0.01, -cw * 0.86], [(hx + fx) / 2 + 0.2, ht - 0.01, cw * 0.86], r));
  return { black, carbon, metal, suit };
}

// Multi-spoke race rim in the wheel's own frame: axle along z, outer face at z = 0 facing +z.
export function rimGeometry(radius = 0.236, pairs = 5) {
  const parts = [];
  const spoke = (angle, lean) => {
    // tapered blade from the hub out to the barrel, dished inward towards the hub
    const shape = new THREE.Shape([[0.045, -0.013], [radius - 0.004, -0.008], [radius - 0.004, 0.008], [0.045, 0.013]].map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) - 0.03 - 0.05 * (1 - p.getX(i) / radius) ** 1.5);
    g.rotateZ(lean);
    return g.rotateZ(angle);
  };
  for (let k = 0; k < pairs; k++) {
    const a = (k * 2 * Math.PI) / pairs;
    parts.push(spoke(a, 0.13), spoke(a, -0.13));
  }
  parts.push(new THREE.CylinderGeometry(0.058, 0.066, 0.05, 20).rotateX(Math.PI / 2).translate(0, 0, -0.075)); // hub
  parts.push(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 6).rotateX(Math.PI / 2).translate(0, 0, -0.04)); // centre-lock nut
  parts.push(new THREE.TorusGeometry(radius - 0.006, 0.011, 8, 44).translate(0, 0, -0.008)); // outer lip
  // barrel, seen from inside
  const seg = 40, depth = 0.24, pos = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * 2 * Math.PI, a1 = ((i + 1) / seg) * 2 * Math.PI, r = radius - 0.002;
    const p = (a, z) => [r * Math.cos(a), r * Math.sin(a), z];
    pos.push(...p(a0, 0), ...p(a0, -depth), ...p(a1, 0), ...p(a1, 0), ...p(a0, -depth), ...p(a1, -depth));
  }
  const barrel = new THREE.BufferGeometry();
  barrel.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  barrel.computeVertexNormals();
  parts.push(barrel);
  return mergeGeometries(parts.map(plain));
}

// ---------------------------------------------------------------- livery mapping
// Painted parts get UVs by projection so one texture per team can carry stripes, numbers and
// partner names: the car seen from its left, from its right and from above, stacked in one
// square. Each triangle picks the view it faces, so nothing is smeared across two views.
export const LIVERY = { x0: -2.75, x1: 2.85, yMax: 1.5, zMax: 1.12, left: [0, 0.3], right: [0.3, 0.6], top: [0.6, 1] };
export function projectUV(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2), L = LIVERY;
  for (let i = 0; i < p.count; i += 3) {
    const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3, nz = (n.getZ(i) + n.getZ(i + 1) + n.getZ(i + 2)) / 3;
    const view = ny > 0.62 ? 'top' : nz >= 0 ? 'left' : 'right';
    for (let k = i; k < i + 3; k++) {
      const u = clamp((p.getX(k) - L.x0) / (L.x1 - L.x0), 0, 1);
      if (view === 'top') { uv[k * 2] = u; uv[k * 2 + 1] = lerp(L.top[0], L.top[1], clamp((p.getZ(k) + L.zMax) / (2 * L.zMax), 0, 1)); }
      else {
        const band = L[view];
        uv[k * 2] = view === 'left' ? u : 1 - u; // each side reads left to right for someone looking at it
        uv[k * 2 + 1] = lerp(band[0], band[1], clamp(p.getY(k) / L.yMax, 0, 1));
      }
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Collects geometry per material and merges once at the end. The `paint` batch gets livery UVs.
export function batches(names) {
  const lists = Object.fromEntries(names.map((n) => [n, []]));
  const add = Object.fromEntries(names.map((n) => [n, (...parts) => { lists[n].push(...parts.flat(Infinity)); }]));
  add.done = () => Object.fromEntries(names.filter((n) => lists[n].length).map((n) => {
    const g = mergeGeometries(lists[n].map(plain));
    return [n, n === 'paint' ? projectUV(g) : g];
  }));
  return add;
}
