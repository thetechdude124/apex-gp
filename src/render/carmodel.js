// Procedural modern open-wheel race car.
// Forward = +x, up = +y, right = +z. Origin on the ground under the centre of mass:
// front axle x = +1.98, rear axle x = -1.62. Overall ~5.9 m long, 2.0 m wide, 0.97 m tall.
//
// Everything is built for the car's right-hand side (z >= 0) and mirrored, so the livery
// texture (projected from the side) reads correctly on both flanks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// fictional technical partners for the small decals (never another team's name)
const PARTNERS = ['VOLTAIC', 'ORBITAL', 'TYREX', 'VELOCE', 'AEROMAX', 'LUMARA', 'KORVO', 'DENALIS', 'PELAGO', 'APEX GP'];

export const FRONT_X = 1.98, REAR_X = -1.62, WHEEL_R = 0.36;
const FRONT_Z = 0.83, REAR_Z = 0.79, FRONT_W = 0.305, REAR_W = 0.405;
const PX0 = -2.9, PX1 = 3.45, PYMAX = 1.08; // livery projection bounds

// ------------------------------------------------------------------ geometry helpers
function orient(g, testIdx, axis, sign) {
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const v = axis === 'y' ? n.getY(testIdx) : n.getZ(testIdx);
  if (v * sign < 0) {
    const ix = g.index.array;
    for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

function secPoint(s, th) {
  const c = Math.cos(th), sn = Math.sin(th);
  const n = sn >= 0 ? (s.n ?? 2.6) : (s.nb ?? s.n ?? 2.6);
  const yc = (s.y0 + s.y1) / 2, hh = (s.y1 - s.y0) / 2;
  let z = s.w * Math.pow(Math.abs(c), 2 / n) * Math.sign(c);
  const y = yc + hh * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n);
  if (sn < 0 && s.bw != null) z *= 1 - (1 - s.bw) * Math.pow(-sn, 1.3);
  return [y, z];
}

// Right half (z >= 0) of a body that is symmetric about the centreline.
function halfLoft(sections, K = 14) {
  const pos = [], idx = [];
  const R = K + 1;
  for (const s of sections) {
    for (let k = 0; k <= K; k++) {
      const th = -Math.PI / 2 + (k / K) * Math.PI;
      const [y, z] = secPoint(s, th);
      pos.push(s.x, y, Math.max(0, z));
    }
  }
  for (let i = 0; i < sections.length - 1; i++) for (let k = 0; k < K; k++) {
    const a = i * R + k, b = a + 1, c = a + R, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  orient(g, Math.floor(sections.length / 2) * R + Math.floor(K / 2), 'z', 1);
  // seam: normals on the centreline must not lean sideways
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getZ(i)) < 1e-5) {
    const nx = n.getX(i), ny = n.getY(i), l = Math.hypot(nx, ny) || 1;
    n.setXYZ(i, nx / l, ny / l, 0);
  }
  return g;
}

// Closed tube around its own axis (sidepods etc.), centred at z = zc.
function fullLoft(sections, K = 22, zc = 0, capFront = false) {
  const pos = [], idx = [];
  for (const s of sections) for (let k = 0; k < K; k++) {
    const th = (k / K) * Math.PI * 2;
    const [y, z] = secPoint(s, th);
    pos.push(s.x, y, zc + (s.zo ?? 0) + z);
  }
  for (let i = 0; i < sections.length - 1; i++) for (let k = 0; k < K; k++) {
    const a = i * K + k, b = i * K + ((k + 1) % K), c = a + K, d = b + K;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return orient(g, Math.floor(sections.length / 2) * K + Math.round(K / 4), 'y', 1);
}

// flat cap for one section of a full loft (used for inlets / tail ends)
function sectionCap(s, K, zc, facing) {
  const pos = [], idx = [];
  const yc = (s.y0 + s.y1) / 2;
  pos.push(s.x, yc, zc + (s.zo ?? 0));
  for (let k = 0; k < K; k++) {
    const [y, z] = secPoint(s, (k / K) * Math.PI * 2);
    pos.push(s.x, yc + (y - yc) * 0.985, zc + (s.zo ?? 0) + z * 0.985);
  }
  for (let k = 0; k < K; k++) idx.push(0, 1 + k, 1 + ((k + 1) % K));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getX(0) * facing < 0) {
    const ix = g.index.array;
    for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

// Wing from span stations {z, x (leading edge), y, c (chord), a (deg, trailing edge up), t}
function wing(stations, M = 7, camber = 0.07) {
  const pos = [], idx = [];
  const R = 2 * M;
  for (const s of stations) {
    const phi = (s.a * Math.PI) / 180, cs = Math.cos(phi), sn = Math.sin(phi);
    const prof = [];
    for (let i = 0; i <= M; i++) { // upper surface LE -> TE
      const u = i / M;
      const th = 5 * (s.t ?? 0.1) * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
      prof.push([u, -camber * 4 * u * (1 - u) + th]);
    }
    for (let i = M - 1; i >= 1; i--) { // lower surface TE -> LE
      const u = i / M;
      const th = 5 * (s.t ?? 0.1) * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
      prof.push([u, -camber * 4 * u * (1 - u) - th]);
    }
    for (const [u, yl] of prof) {
      const bx = -u * s.c, by = yl * s.c; // back along the chord, up through the thickness
      pos.push(s.x + bx * cs + by * sn, s.y - bx * sn + by * cs, s.z); // +a lifts the trailing edge
    }
  }
  const S = stations.length;
  for (let i = 0; i < S - 1; i++) for (let k = 0; k < R; k++) {
    const a = i * R + k, b = i * R + ((k + 1) % R), c = a + R, d = b + R;
    idx.push(a, c, b, b, c, d);
  }
  // end caps
  for (const [i, flip] of [[0, false], [S - 1, true]]) {
    for (let k = 1; k < R - 1; k++) {
      const a = i * R, b = i * R + k, c = i * R + k + 1;
      if (flip) idx.push(a, c, b); else idx.push(a, b, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return orient(g, Math.floor(S / 2) * R + Math.floor(M / 2), 'y', 1);
}

// thin plate from a 2D outline in the x-y plane, at lateral position z
function plate(outline, z, thick = 0.014) {
  const sh = new THREE.Shape();
  outline.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, z - thick / 2);
  return g;
}

// flat plate from an outline in the x-z plane at height y
function floorPlate(outline, y, thick = 0.025) {
  const sh = new THREE.Shape();
  outline.forEach(([x, z], i) => (i ? sh.lineTo(x, z) : sh.moveTo(x, z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// one-sided painted skin facing +z (outer face of an endplate)
function skin(outline, z) {
  const sh = new THREE.Shape();
  outline.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const g = new THREE.ShapeGeometry(sh);
  g.translate(0, 0, z);
  g.computeVertexNormals();
  if (g.attributes.normal.getZ(0) < 0) {
    const ix = g.index.array;
    for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

function box(lx, ly, lz, x, y, z, rz = 0, ry = 0) {
  const g = new THREE.BoxGeometry(lx, ly, lz);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

// aero-profile suspension arm between two points
function arm(a, b, chord = 0.07, thick = 0.02) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const Y = vb.clone().sub(va);
  const len = Y.length();
  Y.normalize();
  const X = new THREE.Vector3(1, 0, 0).addScaledVector(Y, -Y.x).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  const g = new THREE.CylinderGeometry(0.5, 0.5, len, 8);
  g.scale(chord, 1, thick);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z));
  const mid = va.add(vb).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

function rod(a, b, r) { return arm(a, b, r * 2, r * 2); }

function finalize(g) {
  let out = g.index ? g.toNonIndexed() : g;
  out.userData = g.userData;
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(k)) out.deleteAttribute(k);
  return out;
}

// side-projected livery UVs: right half of the car uses the top half of the texture
// Parts that would share texels with the bodywork behind them in the side view (wing endplates,
// the front-wing top flap) are moved to spare corners of the texture, above the nose.
const SLOT = { T: [1.10, 0.76], F: [1.62, 0.76], R: [2.50, 0.44] }; // slot origins, car metres
const ATLAS = {}; // name -> { dx, dy, x0, y0, x1, y1 } (the part's own extents)
function slot(g, name) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  ATLAS[name] = { dx: SLOT[name][0] - b.min.x, dy: SLOT[name][1] - b.min.y, x0: b.min.x, y0: b.min.y, x1: b.max.x, y1: b.max.y };
  g.userData.uvShift = [ATLAS[name].dx, ATLAS[name].dy];
  return g;
}

function projectUV(g, side) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  const [sx, sy] = g.userData.uvShift || [0, 0];
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) + sx - PX0) / (PX1 - PX0);
    const v = Math.min(0.996, Math.max(0.004, (p.getY(i) + sy) / PYMAX));
    uv[i * 2 + 1] = v * 0.5 + (side > 0 ? 0.5 : 0);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function mirrored(g, shiftUV) {
  const m = g.clone();
  const p = m.attributes.position, n = m.attributes.normal, uv = m.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    p.setZ(i, -p.getZ(i)); n.setZ(i, -n.getZ(i));
    if (shiftUV) uv.setY(i, uv.getY(i) - 0.5);
  }
  // flip winding
  for (let i = 0; i < p.count; i += 3) {
    for (const a of [p, n, uv]) {
      const s = a.itemSize;
      for (let k = 0; k < s; k++) { const t = a.array[(i + 1) * s + k]; a.array[(i + 1) * s + k] = a.array[(i + 2) * s + k]; a.array[(i + 2) * s + k] = t; }
    }
  }
  return m;
}

// ------------------------------------------------------------------ shared geometry (built once)
let GEO = null, GEO_intake = null, GEO_halo = null;
function buildGeometry() {
  if (GEO) return GEO;
  const paintR = [], carbonR = [], carbonC = [], blackR = [], chromeR = [];

  // --- nose + monocoque + gearbox (central, half loft)
  const mono = [
    { x: 3.10, w: 0.045, y0: 0.222, y1: 0.268, n: 2.2 },
    { x: 3.02, w: 0.075, y0: 0.205, y1: 0.292, n: 2.4 },
    { x: 2.80, w: 0.105, y0: 0.200, y1: 0.325, n: 2.6 },
    { x: 2.50, w: 0.135, y0: 0.205, y1: 0.372, n: 2.8 },
    { x: 2.20, w: 0.165, y0: 0.215, y1: 0.425, n: 3.0 },
    { x: 1.98, w: 0.190, y0: 0.220, y1: 0.468, n: 3.2 },
    { x: 1.65, w: 0.225, y0: 0.200, y1: 0.535, n: 3.4, bw: 0.8 },
    { x: 1.30, w: 0.280, y0: 0.150, y1: 0.600, n: 3.4, bw: 0.75 },
    { x: 1.00, w: 0.325, y0: 0.110, y1: 0.645, n: 3.2, bw: 0.75 },
    { x: 0.60, w: 0.355, y0: 0.090, y1: 0.665, n: 3.0, bw: 0.8 },
    { x: 0.15, w: 0.365, y0: 0.085, y1: 0.672, n: 3.0, bw: 0.8 },
    { x: -0.30, w: 0.355, y0: 0.085, y1: 0.660, n: 2.8, bw: 0.8 },
    { x: -0.85, w: 0.300, y0: 0.090, y1: 0.610, n: 2.6, bw: 0.8 },
    { x: -1.40, w: 0.215, y0: 0.115, y1: 0.540, n: 2.5 },
    { x: -1.90, w: 0.135, y0: 0.180, y1: 0.465, n: 2.4 },
    { x: -2.25, w: 0.075, y0: 0.255, y1: 0.405, n: 2.2 },
    { x: -2.38, w: 0.045, y0: 0.290, y1: 0.375, n: 2.2 },
  ];
  paintR.push(halfLoft(mono, 14));
  // cockpit opening: a dark panel that hugs the top of the tub around the driver
  {
    const topY = (x, z) => {
      let i = 0;
      while (i < mono.length - 2 && mono[i + 1].x > x) i++;
      const a = mono[i], b = mono[i + 1], f = (a.x - x) / (a.x - b.x);
      const L = (k) => a[k] + (b[k] - a[k]) * f;
      const w = L('w'), y0 = L('y0'), y1 = L('y1'), n = L('n');
      const q = Math.min(0.999, Math.abs(z) / w);
      return (y0 + y1) / 2 + ((y1 - y0) / 2) * Math.pow(1 - Math.pow(q, n), 1 / n);
    };
    const NX = 16, NZ = 6, pos = [], idx = [];
    for (let i = 0; i <= NX; i++) {
      const u = i / NX, x = 1.0 - u * 0.93;
      const half = 0.255 * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u * 2 - 1), 3.2)), 1 / 3.2) + 0.002;
      for (let k = 0; k <= NZ; k++) { const z = (k / NZ) * half; pos.push(x, topY(x, z) + 0.004, z); }
    }
    for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) { const a = i * (NZ + 1) + k, b = a + 1, c = a + NZ + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    blackR.push(orient(g, 8 * (NZ + 1) + 2, 'y', 1));
  }
  // --- roll hoop / airbox / engine cover spine
  paintR.push(halfLoft([
    { x: 0.05, w: 0.085, y0: 0.640, y1: 0.930, n: 2.4 },
    { x: -0.05, w: 0.118, y0: 0.630, y1: 0.962, n: 2.4 },
    { x: -0.30, w: 0.150, y0: 0.600, y1: 0.968, n: 2.4 },
    { x: -0.70, w: 0.150, y0: 0.560, y1: 0.920, n: 2.3 },
    { x: -1.15, w: 0.115, y0: 0.520, y1: 0.815, n: 2.2 },
    { x: -1.60, w: 0.070, y0: 0.470, y1: 0.700, n: 2.2 },
    { x: -2.00, w: 0.035, y0: 0.430, y1: 0.585, n: 2.2 },
    { x: -2.22, w: 0.015, y0: 0.410, y1: 0.500, n: 2.2 },
  ], 12));
  // shark fin (thin, on the centreline: built whole and kept un-mirrored via carbonC? it's paint -> use half thickness)
  paintR.push(plate([[-0.75, 0.90], [-1.15, 0.80], [-1.95, 0.585], [-2.12, 0.60], [-2.12, 0.74], [-1.5, 0.93], [-0.95, 0.972]], 0.004, 0.008));
  // --- sidepod: high inlet, undercut, downwash ramp to the floor
  const pod = [
    { x: 0.98, w: 0.150, y0: 0.330, y1: 0.585, n: 3.2, zo: 0.02 },
    { x: 0.80, w: 0.215, y0: 0.250, y1: 0.615, n: 3.2, bw: 0.55, zo: 0.01 },
    { x: 0.45, w: 0.262, y0: 0.160, y1: 0.625, n: 3.0, bw: 0.6 },
    { x: 0.00, w: 0.272, y0: 0.115, y1: 0.600, n: 2.8, bw: 0.7 },
    { x: -0.50, w: 0.262, y0: 0.095, y1: 0.520, n: 2.6, bw: 0.8, zo: -0.01 },
    { x: -1.00, w: 0.215, y0: 0.085, y1: 0.400, n: 2.4, zo: -0.04 },
    { x: -1.45, w: 0.150, y0: 0.080, y1: 0.275, n: 2.3, zo: -0.09 },
    { x: -1.85, w: 0.075, y0: 0.080, y1: 0.170, n: 2.2, zo: -0.15 },
    { x: -2.05, w: 0.030, y0: 0.080, y1: 0.120, n: 2.2, zo: -0.18 },
  ];
  paintR.push(fullLoft(pod, 22, 0.50));
  blackR.push(sectionCap({ ...pod[0], x: 0.972 }, 22, 0.50, 1)); // radiator inlet
  // --- cockpit rim / headrest (U-shape around the helmet)
  {
    const pts = [[0.92, 0.655, 0.20], [0.70, 0.675, 0.255], [0.40, 0.70, 0.27], [0.15, 0.725, 0.235], [0.06, 0.74, 0.12], [0.045, 0.745, 0.0]].map((p) => new THREE.Vector3(...p));
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.052, 8);
    blackR.push(tube);
  }
  // --- front wing: 4 swept elements + endplate
  const span = [0, 0.14, 0.30, 0.50, 0.70, 0.86, 0.955];
  const fw = (dx, dy, chord, aoa, inboard = 0) => wing(span.filter((z) => z >= inboard).map((z) => {
    const q = z / 0.955;
    return { z, x: 3.34 - 0.30 * Math.pow(q, 1.7) - dx, y: 0.072 + 0.018 * q * q + dy * (1 - 0.25 * q), c: chord * (1 - 0.22 * q), a: aoa * (1 - 0.35 * q), t: 0.09 };
  }));
  carbonR.push(fw(0, 0, 0.27, 2));
  carbonR.push(fw(0.215, 0.040, 0.20, 9));
  carbonR.push(fw(0.375, 0.090, 0.17, 17, 0.14));
  paintR.push(slot(fw(0.515, 0.150, 0.15, 26, 0.14), 'T')); // top flap in team colours
  { const o = [[2.52, 0.045], [3.04, 0.045], [3.03, 0.11], [2.90, 0.29], [2.52, 0.335]]; carbonR.push(plate(o, 0.968, 0.012)); paintR.push(slot(skin(o, 0.9745), 'F')); }
  carbonR.push(box(0.5, 0.012, 0.09, 2.78, 0.046, 0.93)); // footplate
  // nose camera winglet
  carbonR.push(box(0.14, 0.012, 0.08, 2.45, 0.35, 0.17));
  // --- floor + edge + fences + diffuser
  carbonC.push(floorPlate([[1.32, 0.0], [1.32, 0.26], [1.22, 0.58], [0.95, 0.775], [-0.95, 0.80], [-1.22, 0.70], [-1.24, 0.57], [-1.98, 0.55], [-1.98, 0], [-1.98, -0.55], [-1.24, -0.57], [-1.22, -0.70], [-0.95, -0.80], [0.95, -0.775], [1.22, -0.58], [1.32, -0.26]], 0.075, 0.028));
  for (let k = 0; k < 4; k++) carbonR.push(box(0.36, 0.13 - k * 0.012, 0.008, 1.08 - k * 0.02, 0.135, 0.32 + k * 0.085, 0, -0.16 - k * 0.07));
  carbonR.push(box(1.3, 0.012, 0.06, -0.2, 0.10, 0.80)); // floor edge wing
  { // diffuser ramp + strakes
    const d = new THREE.BoxGeometry(0.62, 0.012, 0.52); d.rotateZ(-0.42); d.translate(-2.14, 0.185, 0.27); carbonR.push(d);
    for (const z of [0.1, 0.3, 0.5]) carbonR.push(plate([[-1.86, 0.06], [-2.42, 0.06], [-2.42, 0.31], [-1.86, 0.075]], z, 0.008));
  }
  // --- rear wing: spoon main plane, beam wing, endplate, swan-neck pylon
  const rspan = [0, 0.12, 0.25, 0.38, 0.47, 0.505];
  carbonR.push(wing(rspan.map((z) => ({ z, x: -2.08, y: 0.775 + 0.055 * Math.pow(z / 0.505, 2.2), c: 0.36 - 0.03 * (z / 0.505), a: 13, t: 0.11 })), 7, 0.09));
  carbonR.push(wing([0, 0.2, 0.40].map((z) => ({ z, x: -2.02, y: 0.44, c: 0.15, a: 14, t: 0.09 }))));
  carbonR.push(wing([0, 0.2, 0.40].map((z) => ({ z, x: -2.13, y: 0.50, c: 0.13, a: 24, t: 0.09 }))));
  { const o = [[-2.04, 0.52], [-2.40, 0.42], [-2.72, 0.42], [-2.75, 1.00], [-2.30, 1.03], [-2.08, 0.985], [-1.99, 0.70]]; carbonR.push(plate(o, 0.512, 0.014)); paintR.push(slot(skin(o, 0.5195), 'R')); }
  carbonC.push(plate([[-1.96, 0.52], [-2.1, 0.52], [-2.24, 0.80], [-2.36, 0.83], [-2.2, 0.86], [-2.02, 0.62]], 0, 0.03));
  // exhaust
  { const e = new THREE.CylinderGeometry(0.055, 0.06, 0.22, 12, 1, true); e.rotateZ(Math.PI / 2 - 0.12); e.translate(-2.28, 0.47, 0); carbonC.push(e); }
  // --- suspension (aero wishbones, push/pull rods, track rod, driveshaft)
  const fh = (y) => [FRONT_X, y, FRONT_Z - 0.17];
  carbonR.push(arm(fh(0.50), [2.28, 0.405, 0.15]), arm(fh(0.50), [1.55, 0.515, 0.21]));
  carbonR.push(arm(fh(0.21), [2.25, 0.245, 0.13]), arm(fh(0.21), [1.50, 0.215, 0.17]));
  carbonR.push(arm([FRONT_X, 0.24, FRONT_Z - 0.2], [1.86, 0.50, 0.19], 0.045, 0.02));
  carbonR.push(arm([2.10, 0.37, FRONT_Z - 0.17], [2.12, 0.39, 0.16], 0.04, 0.016));
  const rh = (y) => [REAR_X, y, REAR_Z - 0.22];
  carbonR.push(arm(rh(0.50), [-1.20, 0.47, 0.22]), arm(rh(0.50), [-1.95, 0.44, 0.12]));
  carbonR.push(arm(rh(0.21), [-1.15, 0.17, 0.24]), arm(rh(0.21), [-1.98, 0.21, 0.10]));
  carbonR.push(rod([REAR_X, 0.36, REAR_Z - 0.2], [REAR_X, 0.36, 0.14], 0.022));
  carbonR.push(arm([REAR_X, 0.48, REAR_Z - 0.22], [-1.5, 0.22, 0.2], 0.04, 0.02));
  // brake ducts / uprights inside the wheels
  for (const [ax, az, w] of [[FRONT_X, FRONT_Z, FRONT_W], [REAR_X, REAR_Z, REAR_W]]) {
    const d = new THREE.CylinderGeometry(0.215, 0.215, 0.1, 20); d.rotateX(Math.PI / 2); d.translate(ax, WHEEL_R, az - w / 2 - 0.035); carbonR.push(d);
  }
  // over-wheel deflector on the front wheel
  { const g = new THREE.BoxGeometry(0.42, 0.012, 0.10); g.rotateZ(-0.12); g.translate(FRONT_X + 0.02, 0.755, FRONT_Z - 0.20); carbonR.push(g); }
  // --- mirrors
  // (set forward and in-board enough to sit inside the driver's field of view; the glass itself is
  // a separate mesh per side, added in buildCar, so the player's can show the live rear view)
  carbonR.push(arm([1.0, 0.60, 0.36], [1.02, 0.715, 0.56], 0.05, 0.014));
  paintR.push(box(0.06, 0.078, 0.185, 1.02, 0.735, 0.63));
  chromeR.push(box(0.004, 0.07, 0.175, 0.9925, 0.735, 0.63)); // bright rim behind the glass
  // --- halo
  {
    const pts = [[-0.06, 0.70, 0.315], [0.02, 0.80, 0.305], [0.22, 0.868, 0.285], [0.46, 0.878, 0.225], [0.64, 0.872, 0.125], [0.715, 0.868, 0.0]].map((p) => new THREE.Vector3(...p));
    const t = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.03, 10);
    // the halo is its own mesh so it can be faded out of the cockpit view
    const hr = finalize(t);
    GEO_halo = mergeGeometries([hr, mirrored(hr, false), finalize(arm([1.02, 0.635, 0], [0.70, 0.865, 0], 0.06, 0.035))]);
  }
  // --- airbox intake + T-cam + antenna + rain light housing
  { const g = new THREE.CircleGeometry(1, 20); g.scale(0.07, 0.115, 1); g.rotateY(Math.PI / 2); g.translate(0.052, 0.80, 0); GEO_intake = g; }
  carbonC.push(box(0.11, 0.05, 0.26, -0.16, 0.995, 0));
  carbonC.push(arm([1.55, 0.54, 0], [1.52, 0.66, 0], 0.012, 0.012));
  carbonC.push(box(0.06, 0.09, 0.14, -2.40, 0.335, 0));

  const paint = paintR.map((g) => projectUV(finalize(g), 1));
  const paintAll = mergeGeometries([...paint, ...paint.map((g) => mirrored(g, true))]);
  const cR = carbonR.map(finalize);
  const carbon = mergeGeometries([...cR, ...cR.map((g) => mirrored(g, false)), ...carbonC.map(finalize)]);
  const bR = blackR.map(finalize);
  const black = mergeGeometries([...bR, ...bR.map((g) => mirrored(g, false)), finalize(GEO_intake)]);
  const chR = chromeR.map(finalize);
  const chrome = mergeGeometries([...chR, ...chR.map((g) => mirrored(g, false))]);

  // DRS flap, pivoting about its trailing edge at (-2.585, 1.005)
  const flap = wing([-0.505, -0.47, -0.3, -0.1, 0.1, 0.3, 0.47, 0.505].map((z) => ({ z, x: 0.185, y: -0.105, c: 0.215, a: 30, t: 0.1 })), 6, 0.08);

  // tyres
  const tyre = (w) => {
    const pts = [], R = WHEEL_R, rIn = 0.232, h = w / 2, rr = 0.05;
    pts.push(new THREE.Vector2(rIn, -h));
    pts.push(new THREE.Vector2(R - rr, -h));
    for (let k = 1; k <= 7; k++) { const a = -Math.PI / 2 + (k / 7) * (Math.PI / 2); pts.push(new THREE.Vector2(R - rr + Math.cos(a) * rr, -h + rr + Math.sin(a) * rr)); }
    for (let k = 0; k <= 7; k++) { const a = (k / 7) * (Math.PI / 2); pts.push(new THREE.Vector2(R - rr + Math.cos(a) * rr, h - rr + Math.sin(a) * rr)); }
    pts.push(new THREE.Vector2(rIn, h));
    const g = new THREE.LatheGeometry(pts, 44);
    g.rotateX(Math.PI / 2);
    return g;
  };
  const flapG = finalize(flap);
  {
    flapG.computeBoundingBox();
    const b = flapG.boundingBox, fp = flapG.attributes.position, fuv = flapG.attributes.uv;
    for (let i = 0; i < fp.count; i++) fuv.setXY(i, (fp.getZ(i) - b.min.z) / (b.max.z - b.min.z), (fp.getY(i) - b.min.y) / (b.max.y - b.min.y));
  }
  GEO = {
    paint: paintAll, carbon, black, chrome, flap: flapG, halo: GEO_halo,
    mirrorGlass: new THREE.PlaneGeometry(0.165, 0.062),
    tyreF: tyre(FRONT_W), tyreR: tyre(REAR_W),
    cover: new THREE.CircleGeometry(0.236, 36),
    sidewall: new THREE.RingGeometry(0.236, 0.312, 48, 1),
    lip: new THREE.TorusGeometry(0.236, 0.008, 6, 40),
    disc: new THREE.RingGeometry(0.09, 0.19, 24),
    helmet: new THREE.SphereGeometry(0.135, 28, 20),
    blob: new THREE.PlaneGeometry(6.6, 2.9),
  };
  return GEO;
}
// ------------------------------------------------------------------ textures
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function lum(hex) { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
function mkTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

// ------------------------------------------------------------------ livery
// One texture per TEAM (shared by both cars; race numbers are separate decals). The bodywork is
// painted in the car's side view, in metres: x along the car, y up. Things to know when drawing:
//  - a surface that faces up takes the colour found along its top edge in the side view, so the
//    BODY lines below are used to paint the nose top, sidepod shoulders and engine-cover spine;
//  - wing endplates and the front-wing top flap live in spare corners of the texture (ATLAS).
const BODY = {
  mono: [[3.10, 0.268], [3.02, 0.292], [2.80, 0.325], [2.50, 0.372], [2.20, 0.425], [1.98, 0.468], [1.65, 0.535], [1.30, 0.600], [1.00, 0.645], [0.60, 0.665], [0.15, 0.672]],
  pod: [[0.98, 0.585], [0.80, 0.615], [0.45, 0.625], [0.00, 0.600], [-0.50, 0.520], [-1.00, 0.400], [-1.45, 0.275], [-1.85, 0.170], [-2.05, 0.120]],
  spine: [[0.05, 0.930], [-0.05, 0.962], [-0.30, 0.968], [-0.70, 0.920], [-1.15, 0.815], [-1.60, 0.700], [-2.00, 0.585], [-2.22, 0.500]],
  fin: [[-0.75, 0.90], [-0.95, 0.972], [-1.5, 0.93], [-2.12, 0.74]],
};
const CARBON = '#15161a';
const hexOf = (c) => '#' + c.getHexString();
const mixHex = (a, b, t) => hexOf(new THREE.Color(a).lerp(new THREE.Color(b), t));
const rgba = (hex, a) => { const c = new THREE.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; };
// smooth polyline through control points; a third coordinate (e.g. a width) is interpolated too
function dense(pts, n = 56) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2] ?? 0)), false, 'centripetal');
  return c.getPoints(n).map((p) => [p.x, p.y, p.z]);
}

function makePen(g, W, hh, side, L) {
  let ox = 0, oy = 0;
  const X = (x) => ((x + ox - PX0) / (PX1 - PX0)) * W, Y = (y) => hh - ((y + oy) / PYMAX) * hh;
  const PXM = hh / PYMAX, PXX = W / (PX1 - PX0), ASPECT = PXX / PXM;
  const trace = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); };
  let weave = null;
  const d = {
    g, side,
    fill(pts, style, smooth = false) { trace(smooth ? dense(pts) : pts); g.closePath(); g.fillStyle = style; g.fill(); },
    line(pts, w, style, smooth = true) { trace(smooth ? dense(pts) : pts); g.strokeStyle = style; g.lineWidth = Math.max(1, w * PXM); g.lineJoin = 'round'; g.lineCap = 'butt'; g.stroke(); },
    rect(x0, y0, x1, y1, style) { g.fillStyle = style; g.fillRect(X(Math.min(x0, x1)), Y(Math.max(y0, y1)), Math.abs(X(x1) - X(x0)), Math.abs(Y(y1) - Y(y0))); },
    base(style) { d.rect(PX0, 0, PX1, PYMAX, style); },
    // a band of varying width along a smooth centre line: pts = [x, y, width]
    ribbon(pts, style) {
      const c = dense(pts, 72), up = [], dn = [];
      for (let i = 0; i < c.length; i++) {
        const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
        let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        const w = Math.max(0, c[i][2]) / 2;
        up.push([c[i][0] - ty * w, c[i][1] + tx * w]); dn.push([c[i][0] + ty * w, c[i][1] - tx * w]);
      }
      d.fill([...up, ...dn.reverse()], style);
    },
    grad(x0, y0, x1, y1, stops) { const gr = g.createLinearGradient(X(x0), Y(y0), X(x1), Y(y1)); for (const [t, c] of stops) gr.addColorStop(t, c); return gr; },
    clip(pts, fn, smooth = false) { g.save(); trace(smooth ? dense(pts) : pts); g.closePath(); g.clip(); fn(); g.restore(); },
    // bare carbon: near-black with a faint twill weave
    carbon(pts, smooth = false) {
      if (!weave) {
        const [wc, wg] = cnv(8, 8);
        wg.fillStyle = CARBON; wg.fillRect(0, 0, 8, 8);
        wg.strokeStyle = 'rgba(255,255,255,0.055)'; wg.lineWidth = 1.6;
        for (const o of [-8, 0, 8]) { wg.beginPath(); wg.moveTo(o, 8); wg.lineTo(o + 8, 0); wg.stroke(); }
        weave = g.createPattern(wc, 'repeat');
      }
      d.fill(pts, weave, smooth);
    },
    // paint the surface that faces up along a body line (see BODY) between x0 and x1
    top(name, style, x0 = -9, x1 = 9, depth = 0.05) {
      const ln = BODY[name].filter((p) => p[0] <= x1 + 1e-6 && p[0] >= x0 - 1e-6);
      if (ln.length < 2) return;
      d.fill([...ln.map(([x, y]) => [x, y + 0.03]), ...ln.slice().reverse().map(([x, y]) => [x, y - depth])], style);
    },
    yOn(name, x) {
      const ln = BODY[name];
      if (x >= ln[0][0]) return ln[0][1];
      for (let i = 0; i < ln.length - 1; i++) if (x <= ln[i][0] && x >= ln[i + 1][0]) { const f = (ln[i][0] - x) / (ln[i][0] - ln[i + 1][0]); return ln[i][1] + (ln[i + 1][1] - ln[i][1]) * f; }
      return ln[ln.length - 1][1];
    },
    // halftone: dots whose radius (metres) comes from r(x, y)
    dots(x0, x1, y0, y1, r, style, pitch = 0.034) {
      g.fillStyle = style;
      let row = 0;
      for (let y = y0; y <= y1; y += pitch * 0.866, row++) for (let x = x0 + (row % 2) * pitch * 0.5; x <= x1; x += pitch) {
        const rr = r(x, y);
        if (rr > 0.0015) { g.beginPath(); g.ellipse(X(x), Y(y), rr * PXX, rr * PXM, 0, 0, 6.3); g.fill(); }
      }
    },
    // o: { maxW (m), font, spacing (em), stroke (m), slope (dy/dx of the baseline), align }
    text(str, x, y, hgt, style, o = {}) {
      const px = Math.round(hgt * PXM * 1.25);
      g.save(); g.translate(X(x), Y(y));
      if (o.slope) g.rotate(-Math.atan2(o.slope * PXM, PXX));
      g.scale((side < 0 ? -1 : 1) * ASPECT, 1);
      g.font = (o.font || L.font || 'italic 900 {px}px "Helvetica Neue", Arial, sans-serif').replace('{px}', px);
      if ('letterSpacing' in g) g.letterSpacing = `${Math.round((o.spacing ?? L.spacing ?? 0) * px)}px`;
      g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
      const mw = o.maxW ? (o.maxW * PXX) / ASPECT : undefined;
      if (o.stroke) { g.strokeStyle = style; g.lineWidth = Math.max(1, o.stroke * PXM); g.lineJoin = 'round'; g.strokeText(str, 0, 0, mw); }
      else { g.fillStyle = style; g.fillText(str, 0, 0, mw); }
      g.restore();
    },
    // draw a part that lives in a spare corner of the texture, in the part's own coordinates
    atlas(name, fn) {
      const a = ATLAS[name];
      if (!a) return;
      ox = a.dx; oy = a.dy;
      g.save(); g.beginPath(); g.rect(X(a.x0 - 0.02), Y(a.y1 + 0.02), (a.x1 - a.x0 + 0.04) * PXX, (a.y1 - a.y0 + 0.04) * PXM); g.clip();
      fn(a);
      g.restore(); ox = 0; oy = 0;
    },
  };
  return d;
}

// shared pieces ---------------------------------------------------------------------------------
// carbon lower body (the floor-level lip by default; designs pass a higher edge to expose more)
const FLOOR_EDGE = [[3.5, 0.165], [1.4, 0.165], [0.6, 0.13], [-1.8, 0.11], [-3, 0.11]];
function lowerCarbon(d, edge = FLOOR_EDGE, key = null, keyW = 0.012, smooth = false) {
  const e = smooth ? dense(edge) : edge;
  d.carbon([[e[0][0], 0], ...e, [e[e.length - 1][0], 0]]);
  if (key) d.line(e, keyW, key, false);
}
// rear wing endplate: carbon with one accent graphic and a small partner mark
const RWEP = [[-2.04, 0.52], [-2.40, 0.42], [-2.72, 0.42], [-2.75, 1.00], [-2.30, 1.03], [-2.08, 0.985], [-1.99, 0.70]];
function rearEndplate(d, L, mode, c1, c2, mark, markCol) {
  d.atlas('R', () => {
    d.carbon([[-2.9, 0.3], [-1.9, 0.3], [-1.9, 1.1], [-2.9, 1.1]]);
    if (mode === 'slash') { d.fill([[-2.80, 0.40], [-2.52, 0.40], [-1.95, 0.90], [-1.95, 1.10], [-2.12, 1.10]], c1); d.line([[-2.83, 0.40], [-2.15, 1.10]], 0.012, c2, false); }
    else if (mode === 'top') { d.fill([[-2.80, 0.82], [-1.95, 0.70], [-1.95, 1.10], [-2.80, 1.10]], c1); d.line([[-2.80, 0.80], [-1.95, 0.68]], 0.01, c2, false); }
    else if (mode === 'tip') { d.fill([[-2.80, 0.40], [-2.60, 0.40], [-2.50, 1.10], [-2.80, 1.10]], c1); d.line([[-2.585, 0.40], [-2.485, 1.10]], 0.01, c2, false); }
    else if (mode === 'full') { d.fill([[-2.80, 0.56], [-1.95, 0.56], [-1.95, 1.10], [-2.80, 1.10]], c1); d.line([[-2.80, 0.555], [-1.95, 0.555]], 0.012, c2, false); }
    else if (mode === 'fade') { d.rect(-2.8, 0.4, -1.95, 1.1, d.grad(0, 0.45, 0, 1.0, [[0, rgba(c1, 0)], [1, rgba(c1, 0.95)]])); d.line([[-2.78, 0.975], [-2.0, 0.975]], 0.008, c2, false); }
    if (mark) d.text(mark, -2.37, mode === 'top' || mode === 'fade' ? 0.9 : 0.6, 0.07, markCol, { maxW: 0.58 });
  });
}
function frontEndplate(d, L, stripe, flap, mark, markCol) {
  d.atlas('F', () => {
    d.carbon([[2.4, 0], [3.2, 0], [3.2, 0.4], [2.4, 0.4]]);
    if (stripe) { d.fill([[2.40, 0.40], [2.40, 0.268], [3.10, 0.185], [3.10, 0.40]], stripe); }
    if (mark) d.text(mark, 2.74, 0.15, 0.045, markCol, { maxW: 0.36 });
  });
  d.atlas('T', (a) => d.rect(a.x0 - 0.05, a.y0 - 0.05, a.x1 + 0.05, a.y1 + 0.05, flap));
}
function mirrorCap(d, style) { d.rect(0.72, 0.685, 0.88, 0.78, style); }

function seamsAndFilm(d) {
  const g = d.g;
  const seam = (pts, bolts = 0) => {
    d.line(pts, 0.0046, 'rgba(0,0,0,0.4)', false);
    d.line(pts.map(([x, y]) => [x, y - 0.0034]), 0.0021, 'rgba(255,255,255,0.14)', false);
    for (let k = 0; k < bolts; k++) {
      const f = ((k + 0.5) / bolts) * (pts.length - 1), i0 = Math.floor(f), t = f - i0, a = pts[i0], b = pts[Math.min(pts.length - 1, i0 + 1)];
      const bx = a[0] + (b[0] - a[0]) * t, by = a[1] + (b[1] - a[1]) * t + 0.015;
      d.dots(bx, bx, by, by, () => 0.0052, 'rgba(0,0,0,0.38)');
      d.dots(bx, bx, by + 0.001, by + 0.001, () => 0.0034, 'rgba(205,210,216,0.7)');
    }
  };
  seam([[2.36, 0.17], [2.34, 0.56]], 3);                                       // nose cone joint
  seam([[1.22, 0.17], [1.2, 0.72]], 3);                                        // chassis / nose box
  seam([[0.48, 0.17], [0.46, 0.66]], 3);                                       // sidepod inlet panel
  seam([[-0.55, 0.14], [-0.6, 0.6], [-0.66, 1.0]], 5);                         // engine cover front edge
  seam([[0.46, 0.6], [-0.6, 0.6], [-1.6, 0.52], [-2.25, 0.44]], 9);            // cover / sidepod split
  seam([[-1.55, 0.13], [-1.6, 0.52]], 2);                                      // rear bodywork
  // cooling louvres on the engine cover shoulder
  for (let k = 0; k < 7; k++) d.fill([[-0.86 - k * 0.075, 0.585], [-0.905 - k * 0.075, 0.585], [-0.935 - k * 0.075, 0.545], [-0.89 - k * 0.075, 0.545]], 'rgba(0,0,0,0.5)');
  // gentle top-light in the paint itself, and road film low on the flanks
  d.rect(PX0, 0, PX1, PYMAX, d.grad(0, 1.0, 0, 0.0, [[0, 'rgba(255,255,255,0.05)'], [0.45, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.2)']]));
  d.rect(-2.6, 0.1, 1.9, 0.42, d.grad(0, 0.42, 0, 0.1, [[0, 'rgba(30,26,22,0)'], [1, 'rgba(30,26,22,0.2)']]));
}
// small partner decals: a row on the chassis side by the cockpit, one on the nose
function smallMarks(d, team, col, noseCol = col) {
  const f = { font: '800 {px}px "Helvetica Neue", Arial, sans-serif', spacing: 0.04 };
  [[0.86, 0.555], [0.56, 0.565], [0.26, 0.565]].forEach(([x, y], k) => d.text(PARTNERS[(team.pace * 2 + k * 3 + 1) % PARTNERS.length], x, y, 0.03, col, { ...f, maxW: 0.25 }));
  d.text(PARTNERS[(team.pace * 7 + 3) % PARTNERS.length], 1.72, 0.40, 0.036, noseCol, { ...f, maxW: 0.36, slope: -0.19 });
}

// the ten designs -------------------------------------------------------------------------------
const PAINTERS = {
  // Aurora: petrol teal that deepens to the rear, with soft "northern lights" ribbons and silver keylines
  aurora(d, L, team) {
    d.base(L.base);
    d.rect(PX0, 0, PX1, PYMAX, d.grad(-0.5, 0, -2.6, 0, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.9)]]));
    d.rect(PX0, 0, PX1, 0.5, d.grad(0, 0.5, 0, 0.12, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.8)]]));
    const glow = (a) => d.grad(3.1, 0, -2.4, 0, [[0, rgba('#8ff5e4', 0)], [0.22, rgba('#6eead8', a)], [0.62, rgba('#3fd2c0', a * 0.8)], [1, rgba('#3fd2c0', 0)]]);
    d.ribbon([[3.1, 0.255, 0.005], [2.2, 0.33, 0.03], [1.2, 0.41, 0.08], [0.3, 0.37, 0.13], [-0.6, 0.37, 0.17], [-1.4, 0.53, 0.14], [-2.3, 0.88, 0.03]], glow(0.55));
    d.ribbon([[2.4, 0.27, 0.004], [1.2, 0.31, 0.03], [0.2, 0.25, 0.06], [-0.8, 0.24, 0.07], [-1.6, 0.36, 0.05], [-2.4, 0.62, 0.01]], glow(0.32));
    d.line([[3.1, 0.245], [2.2, 0.305], [1.2, 0.355], [0.3, 0.295], [-0.6, 0.275], [-1.4, 0.445], [-2.3, 0.86]], 0.009, L.accent);
    d.line([[1.3, 0.335], [0.3, 0.27], [-0.6, 0.245], [-1.4, 0.405], [-2.3, 0.80]], 0.004, rgba(L.accent, 0.7));
    d.top('spine', L.base, -2.3, 0.1, 0.075);
    d.line(BODY.spine.map(([x, y]) => [x, y - 0.045]), 0.006, rgba(L.accent, 0.8));
    lowerCarbon(d, [[3.5, 0.17], [1.4, 0.17], [0.6, 0.14], [-0.6, 0.13], [-1.5, 0.2], [-3, 0.34]], rgba(L.accent, 0.85), 0.006);
    d.text(L.partner, -0.02, 0.44, 0.125, '#f2f6f8', { maxW: 1.2 });
    d.text('AURORA', -1.22, 0.69, 0.085, L.accent, { maxW: 0.9, slope: 0.24, spacing: 0.3 });
    smallMarks(d, team, 'rgba(240,246,248,0.92)');
    rearEndplate(d, L, 'fade', L.base, L.accent, L.partner, '#f2f6f8');
    frontEndplate(d, L, null, L.base, 'AURORA', L.accent);
    mirrorCap(d, L.accent);
  },
  // Vanta: matte black, tone-on-tone lettering, one hard-edged green blade
  vanta(d, L, team) {
    d.base(L.base);
    d.carbon([[-3, 0], [3.5, 0], [3.5, 0.2], [1.3, 0.2], [0.9, 0.34], [-0.3, 0.34], [-1.2, 0.2], [-1.7, 0.2], [-2.4, 0.62], [-3, 0.62]]);
    d.text('VANTA', -1.02, 0.72, 0.15, '#26282d', { maxW: 1.25, slope: 0.24 });
    const blade = [[3.1, 0.238], [1.45, 0.238], [1.02, 0.375], [-0.38, 0.375], [-1.26, 0.238], [-1.72, 0.238], [-2.5, 0.70]];
    d.line(blade, 0.016, L.accent, false);
    d.line(blade.map(([x, y]) => [x - 0.03, y + 0.034]), 0.004, rgba(L.accent, 0.75), false);
    d.fill([[-1.72, 0.246], [-1.95, 0.246], [-2.5, 0.575], [-2.5, 0.70]], L.accent);
    d.top('spine', L.accent, -2.3, -0.45, 0.012);
    d.fill([[3.12, 0.2], [2.9, 0.2], [2.96, 0.33], [3.12, 0.33]], L.accent);
    d.text(L.partner, 0.3, 0.47, 0.085, L.accent, { maxW: 1.0 });
    smallMarks(d, team, 'rgba(200,204,210,0.7)', 'rgba(200,204,210,0.7)');
    rearEndplate(d, L, 'tip', L.accent, '#0b0c0e', L.partner, L.accent);
    frontEndplate(d, L, null, CARBON, 'VANTA', L.accent);
    mirrorCap(d, L.accent);
  },
  // Fulmine: vermilion over a bare-carbon wedge that rises to the rear, ivory keyline, classic nose band
  fulmine(d, L, team) {
    d.base(L.base);
    d.rect(PX0, 0, PX1, 0.6, d.grad(0, 0.6, 0, 0.1, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.55)]]));
    const cut = [[3.5, 0.17], [1.5, 0.17], [0.7, 0.2], [-0.1, 0.27], [-0.9, 0.42], [-1.6, 0.66], [-2.1, 0.92], [-2.4, 1.1]];
    lowerCarbon(d, cut, L.accent, 0.012, true);
    d.line(dense(cut).map(([x, y]) => [x + 0.02, y + 0.034]), 0.004, 'rgba(20,10,8,0.75)', false);
    d.fill([[2.62, 0.17], [2.70, 0.17], [2.64, 0.62], [2.56, 0.62]], L.accent);
    d.top('mono', L.base, 0.1, 2.55, 0.05);
    d.text(L.partner, 0.18, 0.455, 0.14, L.accent, { maxW: 1.15 });
    d.text('FULMINE', -0.78, 0.765, 0.08, L.accent, { maxW: 0.85, slope: 0.2 });
    d.text('CORSE', -1.45, 0.4, 0.05, rgba(L.accent, 0.85), { maxW: 0.5, slope: 0.38, spacing: 0.25 });
    smallMarks(d, team, '#1a0c08', L.accent);
    rearEndplate(d, L, 'slash', L.base, L.accent, L.partner, L.accent);
    frontEndplate(d, L, L.base, L.base, 'VAMPA', L.accent);
    mirrorCap(d, L.base);
  },
  // Halcyon: deep royal blue, a yellow kingfisher feather laid along the engine cover, fine yellow keyline
  halcyon(d, L, team) {
    d.base(L.base);
    d.rect(PX0, 0, PX1, 0.62, d.grad(0, 0.62, 0, 0.12, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.95)]]));
    d.rect(PX0, 0, -1.0, PYMAX, d.grad(-1.0, 0, -2.5, 0, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.85)]]));
    // feather: broad at the airbox, tapering to the tail, with a barb line under it
    d.fill([[0.02, 0.99], [-0.3, 0.99], [-0.7, 0.95], [-1.15, 0.845], [-1.6, 0.73], [-2.25, 0.53], [-1.6, 0.655], [-1.15, 0.745], [-0.7, 0.815], [-0.3, 0.835], [0.06, 0.79]], L.accent, false);
    d.line([[0.1, 0.745], [-0.3, 0.79], [-0.7, 0.775], [-1.15, 0.705], [-1.6, 0.62], [-2.2, 0.47]], 0.005, L.accent);
    d.line([[3.1, 0.24], [2.2, 0.285], [1.3, 0.33], [0.5, 0.30], [-0.4, 0.265], [-1.3, 0.30], [-2.3, 0.40]], 0.007, L.accent);
    d.fill([[3.12, 0.2], [2.86, 0.2], [2.93, 0.34], [3.12, 0.34]], L.accent);
    lowerCarbon(d, [[3.5, 0.165], [1.4, 0.165], [0.6, 0.135], [-1.0, 0.12], [-1.8, 0.16], [-3, 0.3]]);
    d.text(L.partner, 0.02, 0.43, 0.135, L.accent, { maxW: 1.0 });
    d.text('HALCYON', -0.92, 0.635, 0.062, '#f4f6fb', { maxW: 0.8, slope: 0.17, spacing: 0.22 });
    smallMarks(d, team, 'rgba(244,246,251,0.92)');
    rearEndplate(d, L, 'top', L.base, L.accent, L.partner, L.accent);
    frontEndplate(d, L, L.accent, L.base, 'HALCYON', '#f4f6fb');
    mirrorCap(d, L.accent);
  },
  // Kestrel: pearl white, crimson airbox and nose tip, three slanted "talon" bars, graphite lower body
  kestrel(d, L, team) {
    d.base(L.base);
    d.rect(PX0, 0, PX1, 0.5, d.grad(0, 0.5, 0, 0.15, [[0, 'rgba(120,128,138,0)'], [1, 'rgba(120,128,138,0.35)']]));
    d.fill([[0.12, 1.08], [-0.02, 0.86], [-0.34, 0.80], [-0.86, 0.80], [-1.2, 1.08]], L.accent);       // airbox
    d.line([[0.0, 0.845], [-0.34, 0.785], [-0.875, 0.785]], 0.006, L.deep, false);
    [[-1.02, 0.34, 0.19, 1], [-1.36, 0.30, 0.15, 1], [-1.66, 0.27, 0.11, 0.8], [-1.9, 0.25, 0.07, 0.5]].forEach(([x, y, w, a]) => d.fill([[x, y], [x - w, y], [x - w - 0.36, y + 0.50], [x - 0.36, y + 0.50]], rgba(L.accent, a)));
    d.fill([[3.12, 0.18], [2.72, 0.18], [2.86, 0.4], [3.12, 0.4]], L.accent);
    d.line([[2.70, 0.18], [2.84, 0.4]], 0.006, L.deep, false);
    lowerCarbon(d, [[3.5, 0.175], [1.4, 0.175], [0.6, 0.165], [-1.0, 0.19], [-3, 0.26]], L.accent, 0.012);
    d.text(L.partner, 0.1, 0.42, 0.13, L.accent, { maxW: 1.1 });
    d.text('KESTREL', -0.36, 0.69, 0.06, L.deep, { maxW: 0.7, slope: 0.1, spacing: 0.28 });
    smallMarks(d, team, 'rgba(34,36,42,0.9)');
    rearEndplate(d, L, 'slash', L.accent, L.base, L.partner, '#f4f4f4');
    frontEndplate(d, L, L.accent, L.base, 'KESTREL', '#f4f4f4');
    mirrorCap(d, L.accent);
  },
  // Nordline: ice blue nose into a navy tail through leaning glacier strata, white keylines
  nordline(d, L, team) {
    d.base(L.base);
    d.rect(PX0, 0, PX1, 0.5, d.grad(0, 0.5, 0, 0.12, [[0, 'rgba(40,90,150,0)'], [1, 'rgba(40,90,150,0.35)']]));
    const lean = 0.8;                                  // the cut and its strata lean back as they rise
    const edge = (x0, amp, ph) => { const p = []; for (let y = -0.02; y <= 1.1; y += 0.04) p.push([x0 - lean * (y - 0.4) + amp * Math.sin(y * 7 + ph), y]); return p; };
    d.fill([...edge(-0.42, 0.025, 0.4), [-3, 1.1], [-3, -0.02]], L.deep);
    // three strata peeling off ahead of the cut, each thinner than the last
    [[-0.25, 0.07], [-0.05, 0.04], [0.11, 0.018]].forEach(([x0, w], k) => { const a = edge(x0, 0.025, 0.4 + k * 0.5); d.fill([...a, ...a.slice().reverse().map(([x, y]) => [x + w, y])], L.deep); });
    // tone-on-tone contours inside the navy
    for (let k = 0; k < 5; k++) d.line(edge(-0.75 - k * 0.34, 0.03, 1.2 + k * 0.9), 0.006, 'rgba(120,170,230,0.16)', false);
    d.line(edge(-0.455, 0.025, 0.4), 0.006, L.accent, false);
    d.top('spine', L.deep, -2.3, -0.5, 0.05);
    d.top('spine', L.base, -2.3, -0.62, 0.02);
    lowerCarbon(d, FLOOR_EDGE, L.accent, 0.007);
    d.text(L.partner, 0.4, 0.4, 0.115, L.deep, { maxW: 0.85 });
    d.text('NORDLINE', -1.3, 0.66, 0.085, '#ffffff', { maxW: 0.95, slope: 0.26 });
    d.text('RACING', -1.55, 0.33, 0.05, rgba('#ffffff', 0.85), { maxW: 0.5, slope: 0.3, spacing: 0.3 });
    smallMarks(d, team, 'rgba(11,29,74,0.9)');
    rearEndplate(d, L, 'full', L.deep, L.base, 'NORDLINE', '#ffffff');
    frontEndplate(d, L, L.base, L.base, L.partner, L.base);
    mirrorCap(d, L.deep);
  },
  // Solace: violet falling to aubergine, twin gold coach-lines over the shoulders, serif script
  solace(d, L, team) {
    d.base(L.base);
    d.rect(PX0, 0, PX1, 0.7, d.grad(0, 0.7, 0, 0.14, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.97)]]));
    d.rect(PX0, 0, -0.9, PYMAX, d.grad(-0.9, 0, -2.6, 0, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.6)]]));
    d.top('spine', L.base, -2.3, 0.1, 0.07);
    const arc = [[3.1, 0.262], [2.2, 0.39], [1.3, 0.545], [0.75, 0.585], [0.2, 0.585], [-0.5, 0.50], [-1.1, 0.375], [-1.7, 0.33], [-2.4, 0.42]];
    d.line(arc, 0.008, L.accent);
    d.line(arc.map(([x, y]) => [x - 0.015, y - 0.034]), 0.0035, rgba(L.accent, 0.8));
    d.line([[0.08, 0.80], [-0.3, 0.9], [-0.9, 0.85], [-1.6, 0.67], [-2.2, 0.5]], 0.005, rgba(L.accent, 0.9));
    d.fill([[3.12, 0.2], [2.94, 0.2], [2.98, 0.33], [3.12, 0.33]], L.accent);
    lowerCarbon(d, FLOOR_EDGE);
    d.text(L.partner, -0.02, 0.355, 0.15, L.accent, { maxW: 1.15 });
    d.text('SOLACE', -0.9, 0.705, 0.06, '#efeaf8', { maxW: 0.7, slope: 0.2, spacing: 0.4, font: '600 {px}px "Avenir Next", "Segoe UI", Arial, sans-serif' });
    smallMarks(d, team, 'rgba(240,189,76,0.9)');
    rearEndplate(d, L, 'fade', L.base, L.accent, L.partner, L.accent);
    frontEndplate(d, L, null, L.deep, 'SOLACE', L.accent);
    mirrorCap(d, L.accent);
  },
  // Ironbark: satin olive, lots of bare carbon cut on a hard diagonal, orange only as working accents
  ironbark(d, L, team) {
    d.base(L.base);
    d.rect(PX0, 0, PX1, 0.6, d.grad(0, 0.6, 0, 0.1, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.7)]]));
    const cut = [[3.5, 0.18], [1.35, 0.18], [1.05, 0.31], [-0.72, 0.31], [-1.5, 1.1]];
    lowerCarbon(d, cut, L.accent, 0.016);
    d.top('spine', L.base, -2.3, 0.0, 0.06);
    d.fill([[3.12, 0.2], [2.84, 0.2], [2.84, 0.4], [3.12, 0.4]], L.accent);
    d.fill([[0.1, 1.08], [0.02, 1.08], [-0.03, 0.6], [0.05, 0.6]], L.accent);                               // airbox ring
    d.fill([[1.42, 0.2], [1.5, 0.2], [1.5, 0.62], [1.42, 0.62]], L.third);                                  // chassis band
    d.text(L.partner, 0.2, 0.46, 0.12, L.third, { maxW: 1.1 });
    d.text('IRONBARK', -0.5, 0.78, 0.07, L.third, { maxW: 0.75, slope: 0.12, spacing: 0.2 });
    d.text('RACING', -1.9, 0.5, 0.05, rgba(L.third, 0.85), { maxW: 0.5, spacing: 0.3 });
    smallMarks(d, team, 'rgba(217,203,163,0.9)');
    rearEndplate(d, L, 'full', L.base, L.accent, L.partner, L.third);
    frontEndplate(d, L, null, L.accent, 'IRONBARK', L.third);
    mirrorCap(d, L.accent);
  },
  // Meridian: magenta dissolving into deep plum through a halftone, white meridian arcs like a globe
  meridian(d, L, team) {
    d.base(L.base);
    d.rect(PX0, 0, -1.55, PYMAX, L.deep);
    d.dots(-1.6, 0.1, 0.1, 1.08, (x) => Math.max(0, Math.min(0.02, ((-x + 0.1) / 1.7) * 0.021)), L.deep);
    d.rect(PX0, 0, PX1, 0.5, d.grad(0, 0.5, 0, 0.12, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.7)]]));
    // meridians: arcs of ellipses sharing one vertical axis
    d.clip([[1.25, 0.14], [-1.5, 0.14], [-1.5, 0.66], [1.25, 0.66]], () => {
      for (const [rx, al] of [[0.3, 0.9], [0.62, 0.8], [0.95, 0.65], [1.26, 0.5]]) for (const sgn of [-1, 1]) {
        const p = []; for (let t = -1; t <= 1.001; t += 0.08) p.push([-0.1 + sgn * rx * Math.sqrt(Math.max(0, 1 - t * t * 0.86)), 0.4 + t * 0.3]);
        d.line(p, 0.006, rgba(L.accent, al));
      }
      d.line([[-1.5, 0.4], [1.25, 0.4]], 0.004, rgba(L.accent, 0.5), false);
    });
    d.top('mono', L.accent, 2.2, 3.2, 0.2);
    d.line([[2.19, 0.17], [2.19, 0.6]], 0.006, L.deep, false);
    lowerCarbon(d, FLOOR_EDGE, L.accent, 0.006);
    d.top('spine', L.base, -2.3, 0.1, 0.07);
    d.text(L.partner, -0.1, 0.4, 0.13, L.accent, { maxW: 1.05 });
    d.text('MERIDIAN', -0.95, 0.74, 0.075, L.accent, { maxW: 0.85, slope: 0.2 });
    smallMarks(d, team, 'rgba(255,255,255,0.92)', L.deep);
    rearEndplate(d, L, 'top', L.base, L.accent, L.partner, L.accent);
    frontEndplate(d, L, L.base, L.accent, 'OKTAVE', L.accent);
    mirrorCap(d, L.accent);
  },
  // Tundra: satin gunmetal, angular 45-degree cyan traces with nodes, stepped carbon cut, monospace type
  tundra(d, L, team) {
    d.base(L.base);
    d.rect(PX0, 0, PX1, 0.6, d.grad(0, 0.6, 0, 0.1, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.8)]]));
    lowerCarbon(d, [[3.5, 0.175], [1.3, 0.175], [1.18, 0.26], [0.2, 0.26], [0.08, 0.175], [-0.9, 0.175], [-1.12, 0.33], [-1.7, 0.33], [-2.2, 0.68], [-3, 0.68]]);
    const t1 = [[3.1, 0.255], [1.75, 0.255], [1.47, 0.5], [0.95, 0.5], [0.84, 0.575], [-0.35, 0.575], [-0.62, 0.38], [-1.45, 0.38], [-2.3, 0.975]];
    const t2 = [[1.2, 0.335], [0.3, 0.335], [0.18, 0.25], [-0.82, 0.25], [-1.02, 0.39]];
    d.line(t1, 0.0075, L.accent, false);
    d.line(t2, 0.004, rgba(L.accent, 0.8), false);
    for (const [x, y] of [t1[1], t1[2], t1[5], t1[6], t1[7], t2[0], t2[4]]) { d.dots(x, x, y, y, () => 0.017, L.accent); d.dots(x, x, y, y, () => 0.009, L.deep); }
    d.top('spine', L.accent, -2.3, -0.4, 0.012);
    d.fill([[3.12, 0.2], [2.9, 0.2], [2.9, 0.34], [3.12, 0.34]], L.accent);
    d.text(L.partner, 0.2, 0.45, 0.1, '#eef2f5', { maxW: 0.95 });
    d.text('TUNDRA', -1.0, 0.73, 0.085, L.accent, { maxW: 0.85, slope: 0.22 });
    d.text('GP', -1.72, 0.52, 0.06, rgba('#eef2f5', 0.85), { maxW: 0.3, slope: 0.3 });
    smallMarks(d, team, 'rgba(238,242,245,0.85)');
    rearEndplate(d, L, 'tip', L.accent, L.deep, L.partner, '#eef2f5');
    frontEndplate(d, L, null, L.base, 'TUNDRA', L.accent);
    mirrorCap(d, L.deep);
  },
  // fallback for a team without a livery spec: base colour, accent keyline, carbon floor
  plain(d, L, team) {
    d.base(L.base);
    lowerCarbon(d, FLOOR_EDGE, L.accent, 0.012);
    d.text(L.partner, 0, 0.42, 0.14, L.accent, { maxW: 1.2 });
    smallMarks(d, team, L.accent);
    rearEndplate(d, L, 'top', L.base, L.accent, L.partner, L.accent);
    frontEndplate(d, L, L.accent, L.base, null, L.accent);
    mirrorCap(d, L.accent);
  },
};

const liveryOf = (team) => team.livery || { style: 'plain', finish: 'gloss', base: team.color, deep: mixHex(team.color, '#000000', 0.6), accent: team.color2, partner: team.name.split(' ')[0].toUpperCase() };

function paintLivery(team) {
  const L = liveryOf(team);
  const W = 2048, H = 1024, hh = H / 2;
  const [c, g] = cnv(W, H);
  for (const side of [1, -1]) {
    g.save();
    g.beginPath(); g.rect(0, side > 0 ? 0 : hh, W, hh); g.clip();
    g.translate(0, side > 0 ? 0 : hh);
    const d = makePen(g, W, hh, side, L);
    (PAINTERS[L.style] || PAINTERS.plain)(d, L, team);
    seamsAndFilm(d);
    g.restore();
  }
  return mkTex(c);
}

// both cars of a team share one livery texture
const LIVERIES = new Map();
function liveryTexture(team) {
  const key = team.liveryKey || team.name; // a custom-coloured car has its own texture
  let e = LIVERIES.get(key);
  if (!e) LIVERIES.set(key, (e = { tex: paintLivery(team), refs: 0 }));
  e.refs++;
  return { tex: e.tex, release() { if (--e.refs <= 0) { e.tex.dispose(); LIVERIES.delete(key); } } };
}

// rear wing flap, seen from behind: team colour or carbon with the partner's name
function flapTexture(team) {
  const L = liveryOf(team);
  const [c, g] = cnv(512, 64);
  // the flap is what the driver behind sees: keep it in the colour the team is known by
  const stealth = L.style === 'vanta';
  g.fillStyle = stealth ? CARBON : L.base; g.fillRect(0, 0, 512, 64);
  const ink = { kestrel: L.accent, nordline: L.deep, ironbark: L.third }[L.style] || L.accent;
  g.fillStyle = ink; g.fillRect(0, 0, 512, stealth ? 16 : 5);
  g.fillStyle = ink;
  g.font = (L.font || '900 {px}px Arial').replace('{px}', 34);
  if ('letterSpacing' in g) g.letterSpacing = `${Math.round((L.spacing || 0) * 34)}px`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(L.partner, 256, 37, 420);
  return mkTex(c);
}

function numberTexture(num, color) {
  const [c, g] = cnv(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = color; g.font = '900 96px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(num), 64, 70, 120);
  return mkTex(c);
}

// paint finish -> clearcoated material settings
const FINISH = {
  gloss: { roughness: 0.4, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.25 },
  pearl: { roughness: 0.36, metalness: 0.22, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 },
  metallic: { roughness: 0.4, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.4 },
  satin: { roughness: 0.52, metalness: 0.22, clearcoat: 0.4, clearcoatRoughness: 0.32, envMapIntensity: 1.1 },
  satinmetal: { roughness: 0.46, metalness: 0.55, clearcoat: 0.45, clearcoatRoughness: 0.28, envMapIntensity: 1.25 },
  matte: { roughness: 0.74, metalness: 0.18, clearcoat: 0.0, clearcoatRoughness: 0.5, envMapIntensity: 0.9 },
};

function sidewallTexture(color) {
  const S = 512, [c, g] = cnv(S, S);
  g.translate(S / 2, S / 2);
  const R = S / 2; // outer radius of ring = 0.312 m
  const r = (m) => (m / 0.312) * R;
  g.strokeStyle = color; g.lineWidth = r(0.022); g.lineCap = 'butt';
  for (const a0 of [0.35, Math.PI + 0.35]) { g.beginPath(); g.arc(0, 0, r(0.281), a0, a0 + 1.5); g.stroke(); }
  g.lineWidth = r(0.004);
  g.beginPath(); g.arc(0, 0, r(0.302), 0, 7); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.stroke();
  // lettering around the sidewall
  g.fillStyle = '#e9e9e9'; g.font = `900 ${Math.round(r(0.04))}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const [str, start] of [['APEX', -1.05], ['RACING', 2.05]]) {
    [...str].forEach((ch, i) => { const a = start + i * 0.16; g.save(); g.rotate(a); g.translate(0, -r(0.281)); g.fillText(ch, 0, 0); g.restore(); });
  }
  return mkTex(c);
}

function coverTexture(accent) {
  const S = 256, [c, g] = cnv(S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  grd.addColorStop(0, '#3a3d44'); grd.addColorStop(0.55, '#22242a'); grd.addColorStop(0.93, '#15161a'); grd.addColorStop(1, '#55585f');
  g.fillStyle = grd; g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, 7); g.fill();
  g.translate(S / 2, S / 2);
  // brushed spokes so the rotation reads
  for (let k = 0; k < 9; k++) {
    g.rotate((Math.PI * 2) / 9);
    g.fillStyle = 'rgba(255,255,255,0.07)'; g.beginPath(); g.moveTo(8, -3); g.lineTo(S / 2 - 14, -9); g.lineTo(S / 2 - 14, 9); g.lineTo(8, 3); g.fill();
  }
  g.strokeStyle = accent; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, S / 2 - 22, 0.2, 1.5); g.stroke();
  g.beginPath(); g.arc(0, 0, S / 2 - 22, 0.2 + Math.PI, 1.5 + Math.PI); g.stroke();
  g.fillStyle = '#9aa0a8'; g.beginPath(); g.arc(0, 0, 15, 0, 7); g.fill();
  g.fillStyle = accent; g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fill();
  return mkTex(c);
}

function helmetTexture(team) {
  const W = 512, H = 256, [c, g] = cnv(W, H);
  const base = team.helmet || team.color2;
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  g.fillStyle = team.color; g.fillRect(0, 0, W, 38);                     // crown
  g.fillStyle = lum(base) > 0.5 ? '#111' : '#fff'; g.fillRect(0, 38, W, 7);
  g.fillStyle = team.color;                                             // side flashes
  for (const u of [0.12, 0.88]) { g.beginPath(); g.moveTo(u * W - 60, 150); g.lineTo(u * W + 60, 96); g.lineTo(u * W + 60, 122); g.lineTo(u * W - 60, 176); g.fill(); }
  g.fillStyle = '#08090b'; g.beginPath(); g.roundRect(W * 0.31, 92, W * 0.38, 52, 22); g.fill(); // visor (front = u 0.5)
  const vg = g.createLinearGradient(0, 92, 0, 144);
  vg.addColorStop(0, 'rgba(120,170,255,0.45)'); vg.addColorStop(0.6, 'rgba(255,120,60,0.18)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = vg; g.beginPath(); g.roundRect(W * 0.31, 92, W * 0.38, 52, 22); g.fill();
  g.fillStyle = '#16171a'; g.fillRect(0, 200, W, 56);                   // chin / base
  // crown design: rays converging on the top (vertical bars become spokes at the pole), a pinstripe ring
  const on = lum(team.color) > 0.5 ? '#111' : '#fff';
  for (let k = 0; k < 12; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.2)'; g.beginPath(); g.moveTo((k + 0.18) * (W / 12), 0); g.lineTo((k + 0.82) * (W / 12), 0); g.lineTo((k + 0.5) * (W / 12), 36); g.fill(); }
  g.fillStyle = on; g.fillRect(0, 52, W, 2);
  // rear spoiler lip + air vents, name strip on the visor, small partner logos on the sides
  g.fillStyle = '#0c0d0f'; for (const u of [0.02, 0.98]) g.fillRect(u * W - 34, 60, 68, 9);
  g.fillStyle = 'rgba(0,0,0,0.55)'; for (const u of [0.4, 0.46, 0.54, 0.6]) { g.beginPath(); g.roundRect(u * W - 7, 62, 14, 5, 2); g.fill(); }
  g.fillStyle = team.color; g.fillRect(W * 0.33, 92, W * 0.34, 9);
  g.fillStyle = on; g.font = '900 9px "Helvetica Neue", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(team.name.split(' ')[0].toUpperCase(), W * 0.5, 97);
  g.fillStyle = lum(base) > 0.5 ? '#111' : '#fff'; g.font = 'italic 900 15px "Helvetica Neue", Arial';
  for (const u of [0.22, 0.78]) g.fillText(liveryOf(team).partner, u * W, 160, 90);
  return mkTex(c);
}

function screenTexture() {
  const [c, g] = cnv(128, 64);
  g.fillStyle = '#05070a'; g.fillRect(0, 0, 128, 64);
  const cols = ['#00e676', '#00e676', '#00e676', '#ff1744', '#ff1744', '#7c4dff', '#7c4dff'];
  cols.forEach((cl, i) => { g.fillStyle = cl; g.fillRect(8 + i * 16, 4, 12, 5); });
  g.fillStyle = '#ffe600'; g.font = '900 34px Arial'; g.textAlign = 'center'; g.fillText('6', 64, 46);
  g.fillStyle = '#7fd4ff'; g.font = '700 11px Arial'; g.fillText('+0.21', 26, 40); g.fillText('ERS 82', 102, 40);
  g.fillStyle = '#ffffff'; g.fillText('L12', 26, 56); g.fillText('P4', 102, 56);
  return mkTex(c);
}

function blobTexture() {
  const [c, g] = cnv(256, 128);
  const img = g.createImageData(256, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
    // rounded-box falloff: dark under the floor, soft toward the edges
    const dx = Math.max(0, Math.abs(x - 128) / 128 - 0.62) / 0.38, dy = Math.max(0, Math.abs(y - 64) / 64 - 0.42) / 0.58;
    const d = Math.min(1, Math.hypot(dx, dy));
    const a = Math.pow(1 - d, 1.8) * 0.72;
    const k = (y * 256 + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 0; img.data[k + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// ------------------------------------------------------------------ materials
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const [cc, cg] = cnv(64, 64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = (x + y) % 2 ? 22 : 34; cg.fillStyle = `rgb(${v},${v},${v + 3})`; cg.fillRect(x * 8, y * 8, 8, 8); }
  const weave = mkTex(cc); weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(10, 10);
  SHARED = {
    carbon: new THREE.MeshPhysicalMaterial({ color: 0x1b1c20, roughness: 0.4, metalness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 1.2 }),
    black: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.85 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc4ccd6, roughness: 0.05, metalness: 1, envMapIntensity: 1.4 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.78 }),
    lip: new THREE.MeshStandardMaterial({ color: 0x70757d, roughness: 0.3, metalness: 0.9 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.8 }),
    wheelBody: new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.5, metalness: 0.4 }),
    screen: new THREE.MeshBasicMaterial({ map: screenTexture() }),
    // constant depth bias only: a slope-scaled offset pulls the shadow up over the bottom of the tyres at low camera angles
    blob: new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, color: 0x000000, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -3 }),
    sidewall: {},
    weave,
  };
  return SHARED;
}
function sidewallMat(color) {
  const S = shared();
  if (!S.sidewall[color]) S.sidewall[color] = new THREE.MeshStandardMaterial({ map: sidewallTexture(color), transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 });
  return S.sidewall[color];
}

// ------------------------------------------------------------------ assemble a car
export function buildCar(team, number, compoundColor = '#ffd400') {
  const G = buildGeometry(), S = shared();
  const L = liveryOf(team);
  const group = new THREE.Group();
  const own = []; // per-car resources to dispose

  const livery = liveryTexture(team); // shared with the team mate
  const paint = new THREE.MeshPhysicalMaterial({ map: livery.tex, ...(FINISH[L.finish] || FINISH.gloss) });
  own.push({ dispose: () => livery.release() }, paint);
  const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; group.add(m); return m; };
  add(G.paint, paint);
  add(G.carbon, S.carbon);
  add(G.black, S.black, false);
  add(G.chrome, S.chrome, false);
  const halo = add(G.halo, S.carbon);
  const mirrors = [1, -1].map((side) => {
    const m = new THREE.Mesh(G.mirrorGlass, S.chrome);
    m.rotation.y = -Math.PI / 2; m.position.set(0.9885, 0.735, side * 0.63);
    group.add(m);
    return { mesh: m, side };
  });

  // soft contact shadow under the car (grounds it even where the sun shadow is weak)
  const blob = new THREE.Mesh(G.blob, S.blob);
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(0.18, 0.016, 0);
  blob.renderOrder = 1;
  group.add(blob);

  // DRS flap
  const flapPivot = new THREE.Group();
  flapPivot.position.set(-2.585, 1.005, 0);
  const flapTex = flapTexture(team);
  const flapMat = new THREE.MeshPhysicalMaterial({ map: flapTex, ...(FINISH[L.finish] || FINISH.gloss) });
  own.push(flapTex, flapMat);
  const flap = new THREE.Mesh(G.flap, flapMat); flap.castShadow = true;
  flapPivot.add(flap);
  group.add(flapPivot);

  // race number: on the engine-cover fin (both sides) and on top of the nose
  {
    const finCol = { aurora: L.accent, vanta: L.accent, fulmine: L.accent, halcyon: '#f4f6fb', kestrel: L.deep, nordline: '#ffffff', solace: L.accent, ironbark: L.third, meridian: L.accent, tundra: L.accent }[L.style] || L.accent;
    const noseCol = { kestrel: L.deep, nordline: L.deep, meridian: L.deep }[L.style] || finCol;
    const mk = (col) => { const t = numberTexture(number, col); const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); own.push(t, m); return m; };
    const finMat = mk(finCol), noseMat = noseCol === finCol ? finMat : mk(noseCol);
    const pg = new THREE.PlaneGeometry(0.2, 0.2);
    own.push(pg);
    for (const s of [1, -1]) {
      const n = new THREE.Mesh(pg, finMat);
      n.position.set(-1.66, 0.81, s * 0.0135);
      n.rotation.set(0, s > 0 ? 0 : Math.PI, 0);
      n.scale.set(0.95, 0.72, 1);
      group.add(n);
    }
    const nn = new THREE.Mesh(pg, noseMat);
    // lying on the nose, digits upright for someone looking at the car from the front
    const up = new THREE.Vector3(-1, 0.177, 0).normalize(), right = new THREE.Vector3(0, 0, -1);
    nn.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, new THREE.Vector3().crossVectors(right, up)));
    nn.position.set(2.32, 0.4065, 0);
    nn.scale.set(0.8, 0.8, 1);
    group.add(nn);
    // on-board camera pod: the team's second car carries a yellow one so the two can be told apart
    if (team.drivers && team.drivers[1] && team.drivers[1][2] === number) {
      const camMat = new THREE.MeshStandardMaterial({ color: 0xf2e21c, roughness: 0.45 });
      const cg = new THREE.BoxGeometry(0.114, 0.054, 0.264);
      own.push(camMat, cg);
      const cam = new THREE.Mesh(cg, camMat);
      cam.position.set(-0.16, 0.995, 0);
      group.add(cam);
    }
  }

  // driver
  const driver = new THREE.Group();
  const hTex = helmetTexture(team);
  const hMat = new THREE.MeshPhysicalMaterial({ map: hTex, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 });
  own.push(hTex, hMat);
  const helmet = new THREE.Mesh(G.helmet, hMat);
  helmet.scale.set(1.12, 1.0, 0.94);
  helmet.position.set(0.30, 0.805, 0);
  helmet.castShadow = true;
  driver.add(helmet);
  group.add(driver);

  // steering wheel (rotates with the front wheels)
  const sw = new THREE.Group();
  sw.position.set(0.74, 0.665, 0);
  const swTilt = new THREE.Group(); swTilt.rotation.z = -0.2; sw.add(swTilt); // top of the wheel leans away: the display faces the driver's eyes
  const swSpin = new THREE.Group(); swTilt.add(swSpin);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.115, 0.25), S.wheelBody); swSpin.add(body);
  for (const s of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.09, 4, 8), S.wheelBody); grip.position.set(0, -0.005, s * 0.135); swSpin.add(grip);
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), S.glove); glove.scale.set(1.5, 1, 0.9); glove.position.set(-0.03, 0.0, s * 0.14); swSpin.add(glove);
  }
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.105, 0.055), S.screen);
  scr.rotation.y = -Math.PI / 2; scr.position.set(-0.019, 0.012, 0); swSpin.add(scr);
  group.add(sw);

  // rain light
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1010, emissiveIntensity: 0.4 });
  own.push(lightMat);
  const rl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, 0.1), lightMat);
  rl.position.set(-2.435, 0.335, 0);
  group.add(rl);

  // wheels
  const coverT = coverTexture(team.color2);
  const coverMat = new THREE.MeshStandardMaterial({ map: coverT, roughness: 0.45, metalness: 0.6 });
  own.push(coverT, coverMat);
  const wheels = [];
  const swMat = sidewallMat(compoundColor);
  for (const [ax, az, width, front] of [[FRONT_X, FRONT_Z, FRONT_W, true], [REAR_X, REAR_Z, REAR_W, false]]) {
    for (const side of [1, -1]) {
      const steer = new THREE.Group();
      steer.position.set(ax, WHEEL_R, side * az);
      const spin = new THREE.Group();
      steer.add(spin);
      const tyre = new THREE.Mesh(front ? G.tyreF : G.tyreR, S.tyre);
      tyre.castShadow = true; tyre.receiveShadow = true;
      spin.add(tyre);
      const walls = [];
      for (const face of [1, -1]) {
        const ring = new THREE.Mesh(G.sidewall, swMat);
        ring.position.z = face * (width / 2 + 0.0015);
        if (face < 0) ring.rotation.y = Math.PI;
        spin.add(ring); walls.push(ring);
      }
      const cover = new THREE.Mesh(G.cover, coverMat);
      cover.position.z = side * (width / 2 - 0.012);
      if (side < 0) cover.rotation.y = Math.PI;
      spin.add(cover);
      const lip = new THREE.Mesh(G.lip, S.lip);
      lip.position.z = side * (width / 2 - 0.006);
      spin.add(lip);
      const inner = new THREE.Mesh(G.cover, S.black);
      inner.position.z = -side * (width / 2 - 0.03);
      if (side > 0) inner.rotation.y = Math.PI;
      spin.add(inner);
      const discMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, emissive: 0xff5a10, emissiveIntensity: 0, roughness: 0.6, side: THREE.DoubleSide });
      own.push(discMat);
      const disc = new THREE.Mesh(G.disc, discMat);
      disc.position.z = -side * (width / 2 - 0.028);
      spin.add(disc);
      group.add(steer);
      wheels.push({ steer, spin, front, disc, walls });
    }
  }

  group.userData = {
    wheels, flapPivot, rearLight: rl, driver, helmet, steeringWheel: swSpin, blob, paint, halo, mirrors, screen: scr,
    dispose() { for (const o of own) o.dispose(); },
  };
  return group;
}

export function setCompound(car, color) {
  const m = sidewallMat(color);
  for (const w of car.userData.wheels) for (const r of w.walls) r.material = m;
}
