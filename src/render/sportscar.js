// Closed-wheel bodywork, in metres. +X points down the track. Each cross-section
// runs from the right sill, over the shoulders and roof, to the left sill.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEHICLES } from '../sim/vehicles.js';
import { SHELLS } from './cars/index.js';

// Roof stations are [windscreen foot, front header, rear header, tail glass foot].
const SHAPES = {
  porsche: { nose: 2.35, tail: -2.14, hood: 0.60, height: 1.28, roof: [1.06, 0.31, -0.37, -1.59], cab: 0.74, waist: 0.94, wing: 1.14 },
  mclaren: { nose: 2.40, tail: -2.27, hood: 0.49, height: 1.17, roof: [1.19, 0.43, -0.14, -1.29], cab: 0.68, waist: 0.85, wing: 1.02 },
  ferrari: { nose: 2.31, tail: -2.29, hood: 0.51, height: 1.20, roof: [1.10, 0.51, -0.28, -1.16], cab: 0.71, waist: 0.89, wing: 1.01 },
  aston: { nose: 2.46, tail: -2.10, hood: 0.61, height: 1.27, roof: [0.71, 0.12, -0.58, -1.56], cab: 0.76, waist: 0.96, wing: 1.14 },
  hybrid: { nose: 2.60, tail: -2.46, hood: 0.31, height: 1.02, roof: [1.13, 0.38, -0.20, -1.18], cab: 0.47, waist: 0.85, wing: 0.95 },
};

function shell(rings) {
  const pos = [], indices = [], n = rings[0].length;
  for (const ring of rings) for (const point of ring) pos.push(...point);
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n;
    indices.push(a, b, a + n, b, b + n, a + n);
  }
  const tail = (rings.length - 1) * n;
  for (let j = 1; j < n - 1; j++) indices.push(0, j + 1, j, tail, tail + j, tail + j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function box(x, y, z, length, height, width, pitch = 0) {
  return new THREE.BoxGeometry(length, height, width).rotateZ(pitch).translate(x, y, z);
}

function lens(x, y, z, length, height, width, pitch = 0, sweep = 0) {
  return new THREE.SphereGeometry(1, 16, 10).scale(length, height, width)
    .rotateZ(pitch).rotateY(sweep).translate(x, y, z);
}

function link(a, b, radius) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const axis = end.clone().sub(start), mid = start.lerp(end, 0.5);
  const g = new THREE.CylinderGeometry(radius, radius, axis.length(), 6);
  return g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize())).translate(mid.x, mid.y, mid.z);
}

function interp(stations, x) {
  for (let i = 1; i < stations.length; i++) {
    const [x1, b] = stations[i], [x0, a] = stations[i - 1];
    if (x >= x1) return a + (b - a) * THREE.MathUtils.smoothstep(x0 - x, 0, x0 - x1);
  }
  return stations.at(-1)[1];
}

export function sportsGeometry(vehicle, design = {}) {
  const s = { ...SHAPES[vehicle], ...design };
  const proto = vehicle === 'hybrid';
  const { a, b } = VEHICLES[vehicle].params;
  const { nose, tail, roof, height } = s;
  const batches = { paint: [], trim: [], carbon: [], glass: [], lamps: [], rear: [] };
  const { paint, trim, carbon, glass, lamps, rear } = batches;
  const deck = [[nose, s.hood * 0.76], [nose - 0.28, s.hood], [a, s.hood + 0.055],
    [roof[0], proto ? 0.51 : 0.72], [-0.4, proto ? 0.52 : 0.75], [-b, proto ? 0.55 : 0.75], [tail, proto ? 0.51 : 0.62]];
  const crown = (x) => interp(deck, x);
  const skin = [];
  // Extra stations at each tyre give a continuous, circular cut-out above the tread.
  const xs = new Set([nose, nose - 0.09, nose - 0.26, ...deck.map(([x]) => x), 0, tail + 0.13, tail]);
  for (let x = tail + 0.09; x < nose; x += 0.09) xs.add(x);
  for (const axle of [a, -b]) for (let i = 0; i <= 18; i++) xs.add(axle + 0.405 * Math.cos(i * Math.PI / 18));
  const width = (x) => interp([[nose, 0.83], [nose - 0.24, 0.95], [a, 1.005], [0, s.waist], [-b, 1.02], [tail, 0.93]], x);
  // The bumper wraps around the nose in plan view. Use the same sweep for the intake faces.
  const noseSweep = (z) => 0.23 * (Math.abs(z) / 0.92) ** 2;
  const skinX = (x, z) => x - noseSweep(z) * THREE.MathUtils.smoothstep(x, nose - 0.5, nose);
  for (const x of [...xs].sort((a, b) => b - a)) {
    const dx = Math.min(Math.abs(x - a), Math.abs(x + b)), w = width(x), h = crown(x);
    const lip = dx <= 0.4050001 ? 0.35 + Math.sqrt(Math.max(0, 0.405 ** 2 - dx * dx)) : 0.13;
    const shoulder = Math.max(h - 0.06, 0.48 + 0.32 * Math.exp(-((dx / 0.58) ** 2)), lip + 0.045);
    const side = [[0.57 * w, 0.12], [0.65 * w, lip], [w, lip], [w * 1.006, (lip + shoulder) / 2],
      [0.97 * w, shoulder - 0.014], [0.83 * w, shoulder + 0.014], [0.70 * w, shoulder - 0.005],
      [0.54 * w, h + (proto ? -0.035 : 0.023)], [0.30 * w, h + 0.012]];
    skin.push([...side, [0, h + 0.009], ...side.slice().reverse().map(([z, y]) => [-z, y])].map(([z, y]) => [skinX(x, z), y, z]));
  }
  paint.push(shell(skin));

  // One continuous surround for the windscreen, side lights and rear glass. The painted
  // roof and slim pillars sit just outside. Single-sided glass keeps the onboard view clear.
  const scuttle = proto ? 0.51 : 0.70;
  const sections = [[roof[0], scuttle + 0.028, s.cab * 0.90], [roof[0] - 0.16, scuttle + 0.13, s.cab],
    [roof[1], height - 0.04, s.cab * 0.94], [roof[1] - 0.18, height, s.cab * 0.94],
    [roof[2], height - 0.016, s.cab * 0.93], [roof[2] - 0.18, height - 0.075, s.cab * 0.92], [roof[3], scuttle + 0.06, s.cab * 0.83]];
  function cabinRing([x, h, w]) {
    return [[w, scuttle - 0.05], [w, scuttle + 0.016], [0.79 * w, h - 0.055], [0.67 * w, h - 0.018], [0, h],
      [-0.67 * w, h - 0.018], [-0.79 * w, h - 0.055], [-w, scuttle + 0.016], [-w, scuttle - 0.05]].map(([z, y]) => [x, y, z]);
  }
  // Smooth the roofline between the header rails. Each longitudinal rail follows the same
  // parameterisation, keeping the window highlights continuous across the sloping glass.
  const rails = sections.map(cabinRing);
  const curves = rails[0].map((_, k) => new THREE.CatmullRomCurve3(rails.map(r => new THREE.Vector3(...r[k]))));
  const canopy = Array.from({length: 31}, (_, i) => curves.map(c => c.getPoint(i / 30).toArray()));
  glass.push(shell(canopy));
  paint.push(shell(canopy.slice(10, 21).map(ring => {
    const [x, h] = ring[4], w = ring[0][2];
    const cap = [[0.78 * w, h - 0.043], [0.77 * w, h - 0.031], [0.65 * w, h - 0.008], [0, h + 0.01],
      [-0.65 * w, h - 0.008], [-0.77 * w, h - 0.031], [-0.78 * w, h - 0.043]];
    return cap.map(([z, y]) => [x, y, z]);
  })));

  // A narrow painted spine follows the crown. The splitter, sills and exposed rear diffuser
  // use separate carbon, so the silhouette remains legible against the tarmac.
  for (const [from, to] of [[nose, roof[0]], [roof[3], tail]]) {
    const rings = [];
    for (let i = 0; i <= 16; i++) {
      const x = from + (to - from) * i / 16, y = crown(x) + 0.016, z = proto ? 0.095 : 0.071;
      rings.push([[x, y - 0.006, z], [x, y, z], [x, y, -z], [x, y - 0.006, -z]]);
    }
    trim.push(shell(rings));
  }
  const splitter = (x, w, y) => [[x, y - 0.04, w], [x, y, w], [x, y, -w], [x, y - 0.04, -w]];
  carbon.push(shell([splitter(nose + 0.085, 0.76, 0.105), splitter(nose - 0.13, 0.99, 0.11), splitter(a + 0.3, 1.01, 0.12)]));
  const wingX = tail + 0.04;
  carbon.push(box(wingX, s.wing, 0, 0.34, 0.036, 1.97, -0.12));
  trim.push(box(wingX - 0.20, s.wing + 0.045, 0, 0.095, 0.026, 1.97, -0.23));
  for (const side of [-1, 1]) {
    const z = side * s.cab;
    paint.push(link([roof[0], scuttle + 0.019, z * 0.90], [roof[1], height - 0.078, z * 0.77], 0.027),
      link([roof[2], height - 0.079, z * 0.76], [roof[3], scuttle + 0.035, z * 0.84], proto ? 0.043 : 0.059));
    carbon.push(link([roof[2] + 0.06, height - 0.07, z * 0.76], [roof[2] + 0.11, scuttle, z * 0.95], 0.020));
    const mid = (a - b) / 2, sillLength = a + b - 0.85;
    carbon.push(box(mid, 0.12, side * 0.93, sillLength, 0.085, 0.135),
      link([tail + 0.39, crown(tail) - 0.03, side * 0.48], [wingX - 0.02, s.wing, side * 0.53], 0.038),
      box(wingX - 0.025, s.wing, side * 0.99, 0.45, 0.16, 0.021, -0.11));
    // Carbon duct in the rear quarter and horizontal louvres over the wheel wells.
    // Side intake and a tapering accent along the lower door, both flush with the flank.
    const duct = -b + 0.59;
    carbon.push(lens(duct, 0.43, side * width(duct), 0.16, 0.066, 0.010, 0.19));
    const flash = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, x = a - 0.49 - t * (sillLength - 0.15), z = side * (width(x) * 1.006 + 0.004);
      const y = 0.19 + 0.12 * t * t;
      flash.push([[x, y - 0.01, z - side * 0.005], [x, y + 0.024 * t, z - side * 0.005],
        [x, y + 0.024 * t, z], [x, y - 0.01, z]]);
    }
    trim.push(shell(flash));
    for (let j = 0; j < 4; j++) carbon.push(box(a - 0.07 - j * 0.055, 0.809 - j * 0.013, side * 0.84, 0.025, 0.012, 0.15, 0.11));
    paint.push(lens(roof[0] - 0.06, scuttle + 0.16, side * 0.95, 0.105, 0.057, 0.105));
    carbon.push(link([roof[0] - 0.04, scuttle, z * 0.96], [roof[0] - 0.06, scuttle + 0.14, side * 0.94], 0.023));
    const headX = nose - (vehicle === 'porsche' ? 0.35 : 0.31);
    const pos = [skinX(headX, 0.746), Math.max(crown(headX), 0.50) + 0.028, side * 0.746];
    const round = vehicle === 'porsche';
    const pitch = round ? -0.72 : -0.26, sweep = side * (vehicle === 'mclaren' ? 0.55 : 0.24);
    // Lamps sit on the leading faces of the raised fenders, with a dark reflector recess.
    pos[1] = Math.max(pos[1], 0.49);
    glass.push(lens(...pos, round ? 0.171 : 0.205, round ? 0.073 : 0.048, 0.14, pitch, sweep));
    if (round) {
      for (const h of [-1, 1]) for (const w of [-1, 1]) lamps.push(lens(pos[0] + 0.080 - h * 0.042, pos[1] + 0.059 + h * 0.037, pos[2] + w * 0.057, 0.041, 0.018, 0.03, pitch));
    } else {
      const strips = vehicle === 'hybrid' ? 3 : vehicle === 'ferrari' ? 2 : 1;
      for (let j = 0; j < strips; j++) lamps.push(lens(pos[0] + 0.072 - j * 0.050, pos[1] + 0.029 + j * 0.014, pos[2], 0.033, 0.018, 0.122, pitch, sweep));
      if (vehicle === 'mclaren') lamps.push(lens(pos[0] + 0.02, pos[1] + 0.058, pos[2] + side * 0.105, 0.132, 0.013, 0.021, pitch, sweep));
    }
    rear.push(lens(tail - 0.012, crown(tail) - 0.068, side * 0.64, 0.03, 0.027, 0.24));
  }
  // Front cooling opening and internal vanes, with a wider scalloped mouth on the Vantage.
  const grilleW = vehicle === 'aston' ? 0.65 : proto ? 0.37 : 0.47;
  // Follow the curved bumper with a recessed black opening and thin horizontal slats.
  function intake(z0, halfW, low, high) {
    const rings = [];
    for (let i = 0; i <= 12; i++) {
      const u = 1 - i / 6, z = z0 + u * halfW;
      const h = high - (high - low) * 0.38 * Math.abs(u) ** 4;
      const l = low + 0.023 * u * u, x = nose - noseSweep(z) + 0.012;
      rings.push([[x - 0.025, l, z], [x, l, z], [x, h, z], [x - 0.025, h, z]]);
    }
    carbon.push(shell(rings));
    for (let j = 1; j <= 3; j++) for (let i = 1; i < rings.length; i++) {
      const edge = k => {
        const [x, y, z] = rings[k][1];
        return [x + 0.002, y + (rings[k][2][1] - y) * j / 4, z];
      };
      glass.push(link(edge(i - 1), edge(i), 0.004));
    }
  }
  intake(0, grilleW, 0.156, Math.min(0.38, crown(nose) - 0.055));
  for (const side of [-1, 1]) intake(side * 0.70, 0.093, 0.18, 0.31);
  for (let i = -2; i <= 2; i++) carbon.push(box(tail + 0.12, 0.17, i * 0.30, 0.51, 0.23, 0.015, -0.18));
  if (proto) {
    const fin = new THREE.Shape();
    fin.moveTo(roof[2], height - 0.07); fin.lineTo(tail + 0.15, s.wing - 0.04); fin.lineTo(tail + 0.19, 0.53); fin.lineTo(roof[2], 0.63);
    paint.push(new THREE.ExtrudeGeometry(fin, { depth: 0.026, bevelEnabled: false }).translate(0, 0, -0.013));
    glass.push(lens(roof[1] - 0.24, height + 0.025, 0, 0.28, 0.079, 0.13));
  }

  const geometry = {};
  for (const [key, parts] of Object.entries(batches)) {
    const solids = parts.map((g) => {
      const flat = g.index ? g.toNonIndexed() : g;
      flat.deleteAttribute('uv');
      return flat;
    });
    geometry[key] = mergeGeometries(solids);
  }
  return { geometry, eye: [roof[1] - 0.14, height - 0.23, proto ? -0.12 : -0.29], roofHeight: height, mirrorX: roof[0] - 0.15, mirrorY: scuttle + 0.16,
    door: [(roof[0] + roof[2]) / 2, 0.42, width((roof[0] + roof[2]) / 2) + 0.011] };
}

const cache = new Map();
// `rival` cars (everyone but the player) get a lighter build: a coarser skin and the cheapest
// possible inner shell, since they are never seen from inside.
export function sportsShell(vehicle, rival = false) {
  const key = vehicle + (rival ? '/rival' : '');
  if (!cache.has(key)) {
    const build = SHELLS[vehicle];
    const shell = build ? build(vehicle, rival ? 0.55 : 1) : sportsGeometry(vehicle);
    if (build) {
      if (!cache.has(vehicle + '/far')) cache.set(vehicle + '/far', build(vehicle, 0.3).geometry);
      const far = cache.get(vehicle + '/far');
      shell.geometry.farPaint = far.paint; // distant cars reuse the painted body at a fraction of the detail
      if (rival && far.liner) shell.geometry.liner = far.liner;
    }
    cache.set(key, shell);
  }
  return cache.get(key);
}
