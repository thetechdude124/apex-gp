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
export function skinRings(rings, { closed = false, half = false, centre = null } = {}) {
  const n = rings[0].length, pos = [], idx = [];
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2]);
  const cols = closed ? n : n - 1;
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < cols; k++) {
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

// ---------------------------------------------------------------- the car
export function formulaCar(P) {
  const paintR = [], carbonR = [], carbonC = [], blackR = [], blackC = [], chromeR = [];

  // ---- nose, survival cell and gearbox: one half shell
  const tub = Object.fromEntries(['w', 'y0', 'y1', 'n', 'bw'].map((k) => [k, C(P.tub[k])]));
  const tubAt = (x) => ({ w: tub.w(x), y0: tub.y0(x), y1: tub.y1(x), n: tub.n(x), nb: Math.min(tub.n(x), 2.8), bw: tub.bw(x) });
  {
    const xs = range(P.tub.x1, P.tub.x0, 0.055), rings = [];
    // rounded nose tip: a few shrinking sections ahead of the first station
    const tip = tubAt(P.tub.x1), tipLen = P.tub.tip ?? 0.05;
    for (const f of [0.0, 0.35, 0.7, 0.92]) {
      const e = Math.sqrt(1 - (1 - f) ** 2) * 0.96 + 0.04 * f, yc = (tip.y0 + tip.y1) / 2;
      rings.push(halfSection(P.tub.x1 + tipLen * (1 - f), { ...tip, w: tip.w * e, y0: yc - (yc - tip.y0) * e, y1: yc + (tip.y1 - yc) * e }, P.tub.K ?? 18));
    }
    for (const x of xs) rings.push(halfSection(x, tubAt(x), P.tub.K ?? 18));
    paintR.push(skinRings(rings, { half: true }));
  }
  const tubTop = (x, z) => { // height of the tub's upper surface at lateral offset z
    const s = tubAt(x), q = Math.min(0.999, Math.abs(z) / s.w);
    return (s.y0 + s.y1) / 2 + ((s.y1 - s.y0) / 2) * (1 - q ** s.n) ** (1 / s.n);
  };
  // cockpit opening: dark panel hugging the tub round the driver
  {
    const [xa, xb] = P.cockpit.x, rows = [], NX = 18, NZ = 6;
    for (let i = 0; i <= NX; i++) {
      const u = i / NX, x = lerp(xa, xb, u), row = [];
      const half = P.cockpit.w * Math.max(0, 1 - Math.abs(u * 2 - 1) ** 3.2) ** (1 / 3.2) + 0.002;
      for (let k = 0; k <= NZ; k++) { const z = (k / NZ) * half; row.push([x, tubTop(x, z) + 0.004, z]); }
      rows.push(row);
    }
    blackR.push(skinRings(rows, { centre: [-5, 0] }));
    // padded headrest / cockpit rim
    blackR.push(tubeAlong(P.cockpit.rim, P.cockpit.rimR ?? 0.05, 24, 8));
  }

  // ---- airbox and engine cover: pear-shaped half shell with a flared shoulder
  const ec = Object.fromEntries(['top', 'wTop', 'wMid', 'base', 'wBase'].map((k) => [k, C(P.cover[k])]));
  {
    const rings = [];
    for (const x of range(P.cover.x1, P.cover.x0, 0.06)) {
      const top = ec.top(x), base = ec.base(x), wT = ec.wTop(x), wM = ec.wMid(x), wB = ec.wBase(x), mid = lerp(base, top, P.cover.belly ?? 0.5);
      rings.push(fillet(x, [[0, base - 0.08], [wB, base - 0.08], [wB, base + 0.03], [wM, mid], [wT, top - 0.035], [0, top]], [0, 0.2, 0.9, 1, 1, 0], 5, false));
    }
    paintR.push(skinRings(rings, { half: true }));
    // intake mouth
    const first = rings[0].filter((p) => p[1] > ec.base(P.cover.x1) + 0.04);
    const loop = [...first, ...first.slice(1, -1).reverse().map((p) => [p[0], p[1], -p[2]])];
    paintR.push(capHalf(first, 1));
    blackC.push(capRing(loop, 1, P.cover.mouth ?? 0.8, 0.004));
  }
  // engine-cover fin: thin, so the race number has somewhere to sit
  if (P.fin) paintR.push(sidePlate(P.fin, 0.004, 0.008));

  // ---- sidepod
  const sp = Object.fromEntries(['zo', 'top', 'zu', 'low', 'zi', 'topIn'].map((k) => [k, C(P.pod[k])]));
  {
    const rings = [], r = P.pod.round;
    for (const x of range(P.pod.x1, P.pod.x0, 0.06)) {
      const zo = sp.zo(x), top = sp.top(x), zu = sp.zu(x), low = sp.low(x), zi = sp.zi(x), tin = sp.topIn(x);
      const mid = lerp(low, top, P.pod.waist ?? 0.6);
      rings.push(fillet(x, [[zi, low], [zu, low], [zo, mid], [zo - (P.pod.lean ?? 0.02), top], [zi, tin]], r, 5, true));
    }
    // rolled lip round the inlet
    const lip = (f) => { const c = [0, 0]; for (const q of rings[0]) { c[0] += q[1] / rings[0].length; c[1] += q[2] / rings[0].length; }
      const e = 0.9 + 0.1 * Math.sqrt(f); return rings[0].map((q) => [q[0] + 0.035 * (1 - f), c[0] + (q[1] - c[0]) * e, c[1] + (q[2] - c[1]) * e]); };
    rings.unshift(lip(0), lip(0.3), lip(0.7));
    paintR.push(skinRings(rings, { closed: true }));
    paintR.push(capRing(rings[0], 1));
    blackR.push(capRing(rings[0], 1, P.pod.mouth ?? 0.84, 0.004)); // radiator inlet
    paintR.push(capRing(rings[rings.length - 1], -1));
    // cooling louvres on the shoulder
    for (let k = 0; k < (P.pod.louvres ?? 0); k++) {
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
    for (const v of F.fences || []) carbonR.push(sidePlate(v.outline, 0, 0.008).rotateY(v.yaw).translate(v.x, 0, v.z));
    const D = F.diffuser;
    carbonC.push(new THREE.ExtrudeGeometry(new THREE.Shape(D.ramp.map(([x, y]) => new THREE.Vector2(x, y))), { depth: D.w * 2, bevelEnabled: false }).translate(0, 0, -D.w));
    for (const z of D.strakes) carbonR.push(sidePlate(D.strake, z, 0.008));
    carbonR.push(sidePlate(D.wall, D.w, 0.012));
  }

  // ---- front wing
  {
    const W = P.frontWing, span = W.span;
    const el = (e) => foil(span.filter((z) => z >= (e.inboard ?? 0)).map((z) => {
      const q = z / span[span.length - 1];
      return { z, x: W.x - W.sweep * q ** W.sweepPow - e.dx, y: W.y + (W.droop ?? 0.018) * q * q + e.dy * (1 - (e.fall ?? 0.25) * q ** (e.fallPow ?? 1)), c: e.c * (1 - (e.taper ?? 0.22) * q), a: e.a * (1 - (e.wash ?? 0.35) * q), t: 0.09 };
    }), 7, e.camber ?? 0.07);
    W.elements.forEach((e, i) => {
      const g = el(e);
      if (i === W.elements.length - 1) { g.userData.slot = 'T'; paintR.push(g); } else carbonR.push(g);
    });
    const zEnd = span[span.length - 1] + 0.013;
    carbonR.push(sidePlate(W.endplate, zEnd, 0.012));
    paintR.push(skinFace(W.endplate, zEnd + 0.0065, 'F'));
    for (const b of W.extras || []) carbonR.push(b);
    for (const b of W.centre || []) carbonC.push(b);
  }

  // ---- rear wing, beam wing, endplates, pylon
  {
    const W = P.rearWing, rs = W.span, tipZ = rs[rs.length - 1];
    carbonR.push(foil(rs.map((z) => ({ z, x: W.x, y: W.y + W.spoon * (z / tipZ) ** 2.2, c: W.c - W.taper * (z / tipZ), a: W.a, t: 0.11 })), 7, 0.09));
    for (const b of W.beam) carbonR.push(foil([0, 0.2, b.z ?? 0.4].map((z) => ({ z, x: b.x, y: b.y, c: b.c, a: b.a, t: 0.09 }))));
    carbonR.push(sidePlate(W.endplate, tipZ + 0.007, 0.014));
    paintR.push(skinFace(W.endplate, tipZ + 0.0145, 'R'));
    for (const b of W.extras || []) carbonR.push(b);
    for (const py of W.pylons) carbonC.push(sidePlate(py.outline, py.z ?? 0, py.t ?? 0.03));
  }

  // ---- suspension, uprights and brake ducts
  for (const a of P.arms) carbonR.push(a.r ? bar(a.from, a.to, a.r) : arm(a.from, a.to, a.chord ?? 0.07, a.thick ?? 0.02));
  for (const [ax, az, w] of [[FRONT_X, FRONT_Z, FRONT_W], [REAR_X, REAR_Z, REAR_W]]) {
    carbonR.push(new THREE.CylinderGeometry(0.218, 0.218, 0.1, 22).rotateX(Math.PI / 2).translate(ax, WHEEL_R, az - w / 2 - 0.035));
    if (P.ducts) carbonR.push(block(0.2, 0.11, 0.05, ax + 0.14, WHEEL_R + 0.02, az - w / 2 - 0.085, 0, 0.25)); // brake cooling scoop
  }

  for (const g of P.extra?.paintR || []) paintR.push(g);
  for (const g of P.extra?.carbonR || []) carbonR.push(g);
  for (const g of P.extra?.carbonC || []) carbonC.push(g);
  for (const g of P.extra?.blackR || []) blackR.push(g);
  for (const g of P.extra?.blackC || []) blackC.push(g);
  for (const g of P.extra?.chromeR || []) chromeR.push(g);

  // ---- mirrors (the glass is a separate mesh added by the game at (0.9885, 0.735, ±0.63))
  for (const s of P.mirror.stalks) carbonR.push(arm(s[0], s[1], 0.05, 0.014));
  paintR.push(block(0.06, 0.078, 0.185, 1.02, 0.735, 0.63));
  chromeR.push(block(0.004, 0.07, 0.175, 0.9925, 0.735, 0.63));

  // ---- halo: its own mesh so the cockpit view can fade it
  const hoop = tubeAlong(P.halo.hoop, P.halo.r, 30, 10);
  const strut = arm(P.halo.strut[0], P.halo.strut[1], P.halo.strutChord ?? 0.06, P.halo.strutThick ?? 0.035);

  // ---- DRS flap in its own frame: trailing edge on the pivot at (-2.585, 1.005)
  const flapZ = P.rearWing.flapSpan;
  const flap = foil(flapZ.map((z) => ({ z, x: 0.185, y: -0.105, c: 0.215, a: 30, t: 0.1 })), 6, 0.08);

  return { paintR, carbonR, carbonC, blackR, blackC, chromeR, haloR: [hoop], haloC: [strut], flap, tubTop };
}

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
