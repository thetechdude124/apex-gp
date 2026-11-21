// Geometry helpers that sweep a cross-section along the track centre line.
// Sim (x, y, h) maps to three (x, h, -y); `d` is metres to the left of the centre line.
import * as THREE from 'three';

export function camberY(T, i, d) {
  const c = T.camber ? T.camber[i] : 0;
  if (!c) return 0;
  const lim = T.width / 2 + 2.5;
  const dc = d < -lim ? -lim : d > lim ? lim : d;
  return dc * Math.sin(c);
}

// A flat-ish strip between two lateral offsets d0(i)..d1(i). Options: cols, y(i, t, d),
// color(i, t, d) -> [r,g,b] vertex colours, mask(i), uScale/uRepeat/vScale for the uvs.
export function ribbon(T, o) {
  const N = T.N;
  const cols = o.cols ?? 1;
  const pos = [], uv = [], col = [], idx = [];
  const rows = N + 1;
  for (let r = 0; r < rows; r++) {
    const i = r % N;
    const d0 = o.d0(i), d1 = o.d1(i);
    for (let k = 0; k <= cols; k++) {
      const t = k / cols;
      const d = d0 + (d1 - d0) * t;
      const yo = (o.y ? o.y(i, t, d) : 0) + camberY(T, i, d);
      pos.push(T.x[i] + T.nx[i] * d, T.h[i] + yo, -(T.y[i] + T.ny[i] * d));
      uv.push(o.uScale ? (d * o.uScale) : t * (o.uRepeat ?? 1), (r * T.ds) / (o.vScale ?? 10));
      if (o.color) { const c = o.color(i, t, d); col.push(c[0], c[1], c[2]); }
    }
  }
  for (let r = 0; r < N; r++) {
    const i = r, j = (r + 1) % N;
    if (o.mask && !(o.mask(i) || o.mask(j))) continue;
    for (let k = 0; k < cols; k++) {
      const a = r * (cols + 1) + k, b = a + 1, c = (r + 1) * (cols + 1) + k, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (o.color) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the surface faces up (or inward for walls)
  if (!o.vertical) {
    const n = g.attributes.normal;
    let sum = 0;
    for (let q = 0; q < n.count; q += 7) sum += n.getY(q);
    if (sum < 0) {
      const ix = g.index.array;
      for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
      g.computeVertexNormals();
    }
  }
  return g;
}

// A vertical face at lateral offset dFn(i), from height y0 to y1 above the road.
export function ribbonWall(T, dFn, y0, y1, uLen, vRepeat = 1, mask = null) {
  const N = T.N;
  const pos = [], uv = [], idx = [];
  let s = 0;
  for (let r = 0; r <= N; r++) {
    const i = r % N;
    const d = dFn(i);
    const x = T.x[i] + T.nx[i] * d, y = T.y[i] + T.ny[i] * d;
    if (r > 0) {
      const ip = (r - 1) % N, dp = dFn(ip);
      s += Math.hypot(x - (T.x[ip] + T.nx[ip] * dp), y - (T.y[ip] + T.ny[ip] * dp));
    }
    const cy = camberY(T, i, d);
    pos.push(x, T.h[i] + cy + y0, -y, x, T.h[i] + cy + y1, -y);
    uv.push(s / uLen, 0, s / uLen, vRepeat === 1 ? 1 : (y1 - y0) / uLen);
  }
  for (let r = 0; r < N; r++) {
    if (mask && !mask(r)) continue;
    const a = r * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Sweeps a cross-section along a barrier line: `profile` is a list of [x, y, v] points, x in
// metres behind the line (away from the track), y above the road, v the texture coordinate.
// Every facet of the section gets its own vertices, so its edges stay crisp under the sun.
// o: { d(i) signed lateral offset of the line, side (+1 left / -1 right), profile, uLen, mask(i) }
export function profileStrip(T, o) {
  const N = T.N, P = o.profile, S = P.length - 1;
  const pos = [], uv = [], idx = [];
  let s = 0, px = 0, py = 0;
  for (let r = 0; r <= N; r++) {
    const i = r % N, d = o.d(i);
    const bx = T.x[i] + T.nx[i] * d, by = T.y[i] + T.ny[i] * d;
    if (r > 0) s += Math.hypot(bx - px, by - py);
    px = bx; py = by;
    for (let k = 0; k < S; k++) for (let e = 0; e < 2; e++) {
      const [x, y, v] = P[k + e];
      const dd = d + o.side * x;
      pos.push(T.x[i] + T.nx[i] * dd, T.h[i] + camberY(T, i, dd) + y, -(T.y[i] + T.ny[i] * dd));
      uv.push(s / o.uLen, v);
    }
  }
  const W = S * 2;
  for (let r = 0; r < N; r++) {
    if (o.mask && !o.mask(r)) continue;
    for (let k = 0; k < S; k++) {
      const a = r * W + k * 2, b = a + 1, c = a + W, d = c + 1;
      if (o.side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
