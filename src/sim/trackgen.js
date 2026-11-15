// Track generation: turtle layout -> smooth closed centreline -> elevation, walls,
// kerbs, surfaces -> minimum-curvature racing line.
// Coordinates: 2D sim plane (x, y), elevation h. Normal n = left of travel direction.

export const DS = 2; // metres between samples
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function tracePoly(def) {
  const V = def.poly, n = V.length;
  const pts = [];
  const info = [];
  for (let k = 0; k < n; k++) {
    const P = V[(k - 1 + n) % n], C = V[k], Q = V[(k + 1) % n];
    let ix = C[0] - P[0], iy = C[1] - P[1]; const li = Math.hypot(ix, iy); ix /= li; iy /= li;
    let ox = Q[0] - C[0], oy = Q[1] - C[1]; const lo = Math.hypot(ox, oy); ox /= lo; oy /= lo;
    const phi = Math.atan2(ix * oy - iy * ox, ix * ox + iy * oy);
    const t = C[2] * Math.tan(Math.abs(phi) / 2);
    info.push({ ix, iy, ox, oy, phi, t, R: C[2], lo });
  }
  for (let k = 0; k < n; k++) {
    const a = info[k], b = info[(k + 1) % n];
    if (a.t + b.t > a.lo - 5) throw new Error(`${def.name}: corners ${k} and ${(k + 1) % n} overlap (${(a.t + b.t).toFixed(0)} > ${a.lo.toFixed(0)})`);
  }
  for (let k = 0; k < n; k++) {
    const C = V[k], a = info[k];
    // arc at vertex k
    let x = C[0] - a.ix * a.t, y = C[1] - a.iy * a.t;
    let th = Math.atan2(a.iy, a.ix);
    const L = a.R * Math.abs(a.phi), kap = Math.sign(a.phi) / a.R;
    const m = Math.max(1, Math.round(L));
    const d = L / m;
    for (let q = 0; q < m; q++) {
      pts.push([x, y]);
      const thm = th + (kap * d) / 2;
      x += Math.cos(thm) * d; y += Math.sin(thm) * d; th += kap * d;
    }
    // straight to next arc
    const b = info[(k + 1) % n], Cn = V[(k + 1) % n];
    const ex = Cn[0] - a.ox * b.t, ey = Cn[1] - a.oy * b.t;
    const sl = Math.hypot(ex - x, ey - y);
    const ms = Math.max(1, Math.round(sl));
    for (let q = 0; q < ms; q++) pts.push([x + ((ex - x) * q) / ms, y + ((ey - y) * q) / ms]);
  }
  return { pts };
}

// A circuit given as a closed centreline (points a few metres apart, in driving order), e.g. one
// traced from a drawing: just filled in to 1 m spacing; the usual smoothing follows.
function tracePath(def) {
  const P = def.path, pts = [];
  for (let k = 0; k < P.length; k++) {
    const a = P[k], b = P[(k + 1) % P.length];
    const m = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let q = 0; q < m; q++) pts.push([a[0] + ((b[0] - a[0]) * q) / m, a[1] + ((b[1] - a[1]) * q) / m]);
  }
  return { pts };
}

function traceLayout(def) {
  if (def.path) return tracePath(def);
  if (def.poly) return tracePoly(def);
  const segs = def.segments.map((s) => s.slice());
  const run = () => {
    let x = 0, y = 0, th = 0;
    const heads = [];
    for (const s of segs) {
      heads.push(th);
      if (s[0] === 'S') {
        x += Math.cos(th) * s[1];
        y += Math.sin(th) * s[1];
      } else {
        const R = s[1], a = s[2] * DEG, sg = Math.sign(a);
        const cx = x - Math.sin(th) * R * sg, cy = y + Math.cos(th) * R * sg;
        th += a;
        x = cx + Math.sin(th) * R * sg;
        y = cy - Math.cos(th) * R * sg;
      }
    }
    return { x, y, th, heads };
  };
  const r = run();
  if (Math.abs(Math.abs(r.th) - TAU) > 1e-6) {
    throw new Error(`${def.name}: total turning ${(r.th / DEG).toFixed(2)} deg (need +-360)`);
  }
  const [i, j] = def.adjust;
  const dix = Math.cos(r.heads[i]), diy = Math.sin(r.heads[i]);
  const djx = Math.cos(r.heads[j]), djy = Math.sin(r.heads[j]);
  const det = dix * djy - diy * djx;
  const gx = -r.x, gy = -r.y;
  const a = (gx * djy - gy * djx) / det;
  const b = (dix * gy - diy * gx) / det;
  segs[i][1] += a;
  segs[j][1] += b;
  if (segs[i][1] < 20 || segs[j][1] < 20) {
    throw new Error(`${def.name}: closure needs negative straight (${segs[i][1].toFixed(0)}, ${segs[j][1].toFixed(0)})`);
  }
  const pts = [];
  let x = 0, y = 0, th = 0;
  for (const s of segs) {
    const L = s[0] === 'S' ? s[1] : s[1] * Math.abs(s[2] * DEG);
    const k = s[0] === 'S' ? 0 : Math.sign(s[2]) / s[1];
    const n = Math.max(1, Math.round(L));
    const d = L / n;
    for (let q = 0; q < n; q++) {
      pts.push([x, y]);
      const thm = th + (k * d) / 2;
      x += Math.cos(thm) * d;
      y += Math.sin(thm) * d;
      th += k * d;
    }
  }
  for (let q = 0; q < pts.length; q++) {
    const f = q / pts.length;
    pts[q][0] -= x * f;
    pts[q][1] -= y * f;
  }
  return { pts, segs };
}

function smoothClosed(arr, passes, w = 0.5) {
  const n = arr.length;
  let a = Float64Array.from(arr), b = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      const l = a[(i - 1 + n) % n], r = a[(i + 1) % n];
      b[i] = a[i] + w * ((l + r) / 2 - a[i]);
    }
    [a, b] = [b, a];
  }
  return a;
}

function resampleClosed(xs, ys, ds) {
  const n = xs.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    cum[i + 1] = cum[i] + Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
  }
  const L = cum[n];
  const N = Math.round(L / ds);
  const step = L / N;
  const ox = new Float64Array(N), oy = new Float64Array(N);
  let k = 0;
  for (let q = 0; q < N; q++) {
    const s = q * step;
    while (cum[k + 1] < s) k++;
    const f = (s - cum[k]) / (cum[k + 1] - cum[k] || 1);
    const j = (k + 1) % n;
    ox[q] = xs[k] + (xs[j] - xs[k]) * f;
    oy[q] = ys[k] + (ys[j] - ys[k]) * f;
  }
  return { x: ox, y: oy, L, step };
}

function periodicCatmull(keys, f) {
  // keys: [[frac, value]] sorted, periodic in [0,1)
  const n = keys.length;
  let i = n - 1;
  for (let k = 0; k < n; k++) if (keys[k][0] <= f) i = k;
  const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
  let span = k2[0] - k1[0];
  if (span <= 0) span += 1;
  let t = f - k1[0];
  if (t < 0) t += 1;
  t /= span;
  const p0 = k0[1], p1 = k1[1], p2 = k2[1], p3 = k3[1];
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

class SpatialHash {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(cx, cy) { return cx * 73856093 ^ cy * 19349663; }
  add(x, y, id) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    let a = this.map.get(k);
    if (!a) this.map.set(k, (a = []));
    a.push(id);
  }
  query(x, y, r, cb) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const a = this.map.get(this.key(cx, cy));
      if (a) for (const id of a) cb(id);
    }
  }
}

export function buildTrack(def) {
  const { pts } = traceLayout(def);
  let xs = smoothClosed(pts.map((p) => p[0]), def.smooth ?? 120);
  let ys = smoothClosed(pts.map((p) => p[1]), def.smooth ?? 120);
  let { x, y, L } = resampleClosed(xs, ys, DS);
  let N = x.length;

  // rotate so index 0 is the start/finish line
  const shift = Math.round((def.startOffset ?? 0) / DS);
  const rot = (a) => { const o = new Float64Array(N); for (let i = 0; i < N; i++) o[i] = a[(i + shift) % N]; return o; };
  x = rot(x); y = rot(y);
  const ds = L / N;

  const T = {
    name: def.name, id: def.id, def, N, ds, length: L,
    width: def.width ?? 14,
    x, y,
    h: new Float64Array(N), tx: new Float64Array(N), ty: new Float64Array(N),
    nx: new Float64Array(N), ny: new Float64Array(N), kappa: new Float64Array(N),
    grade: new Float64Array(N),
    wallL: new Float64Array(N), wallR: new Float64Array(N),
    runoffL: new Uint8Array(N), runoffR: new Uint8Array(N), // 0 grass, 1 asphalt+gravel
    kerbL: new Uint8Array(N), kerbR: new Uint8Array(N),
  };

  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let tx = x[b] - x[a], ty = y[b] - y[a];
    const l = Math.hypot(tx, ty);
    tx /= l; ty /= l;
    T.tx[i] = tx; T.ty[i] = ty; T.nx[i] = -ty; T.ny[i] = tx;
  }
  const kraw = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    const ta = Math.atan2(T.ty[a], T.tx[a]), tb = Math.atan2(T.ty[b], T.tx[b]);
    kraw[i] = wrapAngle(tb - ta) / (2 * ds);
  }
  T.kappa = smoothClosed(kraw, 6);
  const ksm = smoothClosed(kraw, 60); // broad curvature for walls / kerbs

  // elevation
  const elev = def.elev ?? [[0, 0], [0.5, 0]];
  const h0 = new Float64Array(N);
  for (let i = 0; i < N; i++) h0[i] = periodicCatmull(elev, i / N);
  T.h = smoothClosed(h0, 200);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    T.grade[i] = (T.h[b] - T.h[a]) / (2 * ds);
  }

  // walls + runoff
  const w2 = T.width / 2;
  const base = def.wallBase ?? w2 + 9;
  const runoff = def.runoff ?? w2 + 26;
  const before = Math.round(30 / ds), after = Math.round(120 / ds);
  for (let i = 0; i < N; i++) {
    let kmax = 0, kmin = 0;
    for (let q = -before; q <= after; q++) {
      const k = ksm[(i + q + N) % N];
      if (k > kmax) kmax = k;
      if (k < kmin) kmin = k;
    }
    // outside of a left turn (k>0) is the right side
    T.runoffR[i] = kmax > 1 / 320 ? 1 : 0;
    T.runoffL[i] = kmin < -1 / 320 ? 1 : 0;
    T.wallR[i] = T.runoffR[i] ? runoff : base;
    T.wallL[i] = T.runoffL[i] ? runoff : base;
    // inside limit
    const k = ksm[i];
    if (k > 1e-4) T.wallL[i] = Math.min(T.wallL[i], 0.8 / k);
    if (k < -1e-4) T.wallR[i] = Math.min(T.wallR[i], 0.8 / -k);
  }
  T.wallL = smoothClosed(T.wallL, 40);
  T.wallR = smoothClosed(T.wallR, 40);
  // keep the walls on our side of the Voronoi boundary of other track sections
  const hash = new SpatialHash(30);
  for (let i = 0; i < N; i += 2) hash.add(x[i], y[i], i);
  const farOK = (i, j) => { const d = Math.abs(i - j); return Math.min(d, N - d) * ds > 120; };
  const clearance = (i, side, dist) => {
    const wx = x[i] + side * dist * T.nx[i], wy = y[i] + side * dist * T.ny[i];
    let best = 1e9;
    hash.query(wx, wy, dist + 40, (j) => {
      if (!farOK(i, j)) return;
      const d = Math.hypot(wx - x[j], wy - y[j]);
      if (d < best) best = d;
    });
    return best;
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) {
      for (const side of [1, -1]) {
        const arr = side === 1 ? T.wallL : T.wallR;
        let d = arr[i];
        while (d > w2 + 2.5 && clearance(i, side, d) < d + 3) d -= 1;
        arr[i] = Math.max(w2 + 2.5, d);
      }
    }
    // smooth with min so that we never re-violate
    for (const arr of [T.wallL, T.wallR]) {
      const sm = smoothClosed(arr, 10);
      for (let i = 0; i < N; i++) arr[i] = Math.min(arr[i], sm[i]);
    }
  }
  for (let i = 0; i < N; i++) {
    if (T.wallL[i] < w2 + 12) T.runoffL[i] = 0;
    if (T.wallR[i] < w2 + 12) T.runoffR[i] = 0;
  }

  // kerbs: around corners, both sides
  const ext = Math.round(14 / ds);
  for (let i = 0; i < N; i++) {
    if (Math.abs(ksm[i]) > 1 / 300) {
      for (let q = -ext; q <= ext * 2; q++) {
        const j = (i + q + N) % N;
        T.kerbL[j] = 1; T.kerbR[j] = 1;
      }
    }
  }

  // ---------- pit lane on the infield side of the start straight.
  // Distances are metres along the lap relative to the start/finish line (negative = before it).
  //   e0..e1   entry road peels off the track edge and reaches the pit lane
  //   lim0     speed-limit line (80 km/h) .. lim1 limit ends
  //   nose0..nose1  the pit wall that separates the lane from the track
  //   x0..x1   exit road, rejoining at the track edge
  {
    let turn = 0;
    for (let i = 0; i < N; i++) turn += T.kappa[i];
    const side = def.pitSide ?? (turn >= 0 ? 1 : -1); // infield by default; a track can put its pits on the outside
    const ps = def.pitScale ?? 1;
    const sm = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
    const P = {
      side, edgeD: w2 - 2.5, wallD: w2 + 4.5, laneD: w2 + 8, boxD: w2 + 13.5, garageD: w2 + 17.5, outerD: w2 + 37,
      // a circuit with a short pit straight can shrink the whole complex (def.pitScale < 1)
      e0: -400 * ps, e1: -300 * ps, nose0: -318 * ps, lim0: -290 * ps, lim1: 80 * ps, x0: 90 * ps, nose1: 108 * ps, x1: 215 * ps,
      speed: 80 / 3.6, boxes: [],
    };
    for (let k = 0; k < 10; k++) P.boxes.push((-205 + 27 * k) * ps);
    // signed metres from the line for a lap distance s
    P.rel = (s) => { let r = s % L; if (r > L / 2) r -= L; if (r < -L / 2) r += L; return r; };
    // lateral offset (magnitude, toward the pit side) of the pit path at relative distance r
    P.lat = (r) => (r < P.e1 ? P.edgeD + (P.laneD - P.edgeD) * sm((r - P.e0) / (P.e1 - P.e0))
      : r < P.x0 ? P.laneD : P.laneD + (P.edgeD - P.laneD) * sm((r - P.x0) / (P.x1 - P.x0)));
    // world position on the centreline offset by signed lateral d at lap distance s
    P.pos = (s, d, out = {}) => {
      s = ((s % L) + L) % L;
      const fi = s / ds, i = Math.floor(fi) % N, j = (i + 1) % N, f = fi - Math.floor(fi);
      const nx = T.nx[i] + (T.nx[j] - T.nx[i]) * f, ny = T.ny[i] + (T.ny[j] - T.ny[i]) * f;
      out.x = x[i] + (x[j] - x[i]) * f + nx * d; out.y = y[i] + (y[j] - y[i]) * f + ny * d;
      out.h = T.h[i] + (T.h[j] - T.h[i]) * f; out.i = i;
      return out;
    };
    P.zone = new Uint8Array(N);   // paved apron between the track and the pit complex
    P.wall = new Uint8Array(N);   // pit wall present
    const arr = side === 1 ? T.wallL : T.wallR, ro = side === 1 ? T.runoffL : T.runoffR;
    for (let i = 0; i < N; i++) {
      const r = P.rel(i * ds);
      if (r > P.e0 - 40 && r < P.x1 + 40) { P.zone[i] = 1; ro[i] = 0; }
      if (r >= P.nose0 && r <= P.nose1) P.wall[i] = 1;
      // the outer barrier swings out around the whole pit complex
      const w = sm((r + 450 * ps) / (125 * ps)) * (1 - sm((r - 70 * ps) / (165 * ps)));
      if (w > 0) arr[i] = Math.max(arr[i], arr[i] + (P.outerD - arr[i]) * w);
    }
    T.pit = P;
  }

  // sectors & DRS
  T.sectors = [0, Math.round(N / 3), Math.round((2 * N) / 3)];
  // DRS: auto-detect the long straights
  const drsK = def.drsCurv ?? 1 / 700; // how straight a stretch must be to count (flat-out kinks can be allowed)
  const runs = [];
  {
    let i0 = 0;
    while (Math.abs(ksm[i0]) < drsK) i0++; // start inside a corner
    let run = null;
    for (let q = 1; q <= N; q++) {
      const i = (i0 + q) % N;
      const straight = Math.abs(ksm[i]) < drsK;
      if (straight && !run) run = { a: i, len: 0 };
      if (straight && run) run.len++;
      if (!straight && run) { runs.push(run); run = null; }
    }
  }
  runs.sort((p, q) => q.len - p.len);
  // drsMin: shortest straight (m) that gets a zone; a circuit can lower it for a real zone on a shorter straight
  T.drs = runs.filter((r) => r.len * ds > (def.drsMin ?? 450)).slice(0, def.drsZones ?? 2).map((r) => {
    const start = (r.a + Math.round(60 / ds)) % N;
    const end = (r.a + r.len - Math.round(100 / ds)) % N;
    return { start, end, detect: (start - Math.round(180 / ds) + N) % N };
  });
  T.distBoards = [];

  const lim = T.width / 2 - (def.lineMargin ?? 1.1);
  T.rl = computeRacingLine(T, -lim, lim);
  T.lineL = computeRacingLine(T, 1.4, lim);
  T.lineR = computeRacingLine(T, -lim, -1.4);
  T.hash = new SpatialHash(25);
  for (let i = 0; i < N; i++) T.hash.add(x[i], y[i], i);
  return T;
}

// Minimum-curvature racing line via multigrid Gauss-Seidel on lateral offsets.
function computeRacingLine(T, lo, hi) {
  const { N } = T;
  let alpha = null; // at previous stride
  const strides = [32, 16, 8, 4, 2];
  let prevStride = 0;
  for (const st of strides) {
    const M = Math.floor(N / st);
    const idx = new Int32Array(M);
    for (let k = 0; k < M; k++) idx[k] = Math.round((k * N) / M) % N;
    const a = new Float64Array(M).fill((lo + hi) / 2);
    if (alpha) {
      // interpolate previous level
      const Mp = alpha.length;
      for (let k = 0; k < M; k++) {
        const f = (k / M) * Mp;
        const k0 = Math.floor(f), t = f - k0;
        a[k] = alpha[k0 % Mp] * (1 - t) + alpha[(k0 + 1) % Mp] * t;
      }
    }
    const cx = new Float64Array(M), cy = new Float64Array(M), nx = new Float64Array(M), ny = new Float64Array(M);
    for (let k = 0; k < M; k++) { const i = idx[k]; cx[k] = T.x[i]; cy[k] = T.y[i]; nx[k] = T.nx[i]; ny[k] = T.ny[i]; }
    const px = (k) => { k = (k + M) % M; return cx[k] + a[k] * nx[k]; };
    const py = (k) => { k = (k + M) % M; return cy[k] + a[k] * ny[k]; };
    const iters = st >= 16 ? 1500 : 900;
    for (let it = 0; it < iters; it++) {
      for (let k = 0; k < M; k++) {
        const ak = a[k];
        const Dx = (j) => px(j - 1) - 2 * px(j) + px(j + 1);
        const Dy = (j) => py(j - 1) - 2 * py(j) + py(j + 1);
        const A1x = Dx(k - 1) - ak * nx[k], A1y = Dy(k - 1) - ak * ny[k];
        const A2x = Dx(k) + 2 * ak * nx[k], A2y = Dy(k) + 2 * ak * ny[k];
        const A3x = Dx(k + 1) - ak * nx[k], A3y = Dy(k + 1) - ak * ny[k];
        const dot = (A1x - 2 * A2x + A3x) * nx[k] + (A1y - 2 * A2y + A3y) * ny[k];
        let na = -dot / 6;
        na = ak + (na - ak) * 1.0;
        a[k] = Math.max(lo, Math.min(hi, na));
      }
    }
    alpha = a;
    prevStride = st;
  }
  // upsample to full resolution
  const M = alpha.length;
  const full = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const f = (i / N) * M;
    const k0 = Math.floor(f), t = f - k0;
    full[i] = alpha[k0 % M] * (1 - t) + alpha[(k0 + 1) % M] * t;
  }
  const al = smoothClosed(full, 4);
  for (let i = 0; i < N; i++) al[i] = Math.max(lo, Math.min(hi, al[i]));
  const rx = new Float64Array(N), ry = new Float64Array(N);
  for (let i = 0; i < N; i++) { rx[i] = T.x[i] + al[i] * T.nx[i]; ry[i] = T.y[i] + al[i] * T.ny[i]; }
  const rds = new Float64Array(N), rk = new Float64Array(N);
  for (let i = 0; i < N; i++) { const j = (i + 1) % N; rds[i] = Math.hypot(rx[j] - rx[i], ry[j] - ry[i]); }
  const K = 3;
  for (let i = 0; i < N; i++) {
    const a = (i - K + N) % N, b = (i + K) % N;
    const ax = rx[i] - rx[a], ay = ry[i] - ry[a], bx = rx[b] - rx[i], by = ry[b] - ry[i];
    const ang = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    rk[i] = ang / ((Math.hypot(ax, ay) + Math.hypot(bx, by)) / 2);
  }
  return { alpha: al, x: rx, y: ry, ds: rds, kappa: smoothClosed(rk, 3), v: null };
}

// Project a world point onto the centreline, starting from a hint index.
export function project(T, px, py, hint) {
  const { N, x, y } = T;
  let i = hint, best = (px - x[i]) ** 2 + (py - y[i]) ** 2;
  for (let dir of [1, -1]) {
    for (let step = 1; step < 400; step++) {
      const j = (hint + dir * step + N * 4) % N;
      const d = (px - x[j]) ** 2 + (py - y[j]) ** 2;
      if (d < best) { best = d; i = j; } else if (step > 4) break;
    }
  }
  // refine along segment i -> i+1 or i-1 -> i
  const j = (i + 1) % N;
  const sx = x[j] - x[i], sy = y[j] - y[i];
  let f = ((px - x[i]) * sx + (py - y[i]) * sy) / (sx * sx + sy * sy);
  let i0 = i;
  if (f < 0) {
    i0 = (i - 1 + N) % N;
    const ex = x[i] - x[i0], ey = y[i] - y[i0];
    f = ((px - x[i0]) * ex + (py - y[i0]) * ey) / (ex * ex + ey * ey);
  }
  f = Math.max(0, Math.min(1, f));
  const i1 = (i0 + 1) % N;
  const lerp = (arr) => arr[i0] + (arr[i1] - arr[i0]) * f;
  const cxp = lerp(x), cyp = lerp(y);
  const nx = lerp(T.nx), ny = lerp(T.ny);
  const d = (px - cxp) * nx + (py - cyp) * ny;
  return { i: i0, f, s: (i0 + f) * T.ds, d, h: lerp(T.h), grade: lerp(T.grade), wallL: lerp(T.wallL), wallR: lerp(T.wallR), nx, ny, tx: lerp(T.tx), ty: lerp(T.ty) };
}

// Global search for nearest centreline index (used for resets / init)
export function nearestIndex(T, px, py) {
  let best = 1e18, bi = 0;
  T.hash.query(px, py, 60, (i) => {
    const d = (px - T.x[i]) ** 2 + (py - T.y[i]) ** 2;
    if (d < best) { best = d; bi = i; }
  });
  if (best === 1e18) for (let i = 0; i < T.N; i++) {
    const d = (px - T.x[i]) ** 2 + (py - T.y[i]) ** 2;
    if (d < best) { best = d; bi = i; }
  }
  return bi;
}

export { SpatialHash, smoothClosed };
