// Builds the 3D world for a track: surfaces, barriers, terrain, scenery, sky + lighting.
// Sim (x, y, h) maps to three (x, h, -y).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { buildWeather } from './weather.js';
import { buildAtmosphere, TIMES } from './sky.js';
import { camberY, ribbon } from './ribbons.js';
import { trackSurface, runoffSurface, grassSurface, gravelSurface, GRAVEL_TILE } from './surface.js';
import { buildBarriers } from './barriers.js';
import { tintTerrain } from './terraintint.js';
import { treeTexture, treeGeometry, crowdTexture } from './nature.js';
import { buildSpaLandmarks } from './spa_landmarks.js';
import * as DT from './detail.js';

const V = (x, y, h) => new THREE.Vector3(x, h, -y);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function nearestFn(T) {
  const step = 3;
  const cell = 40;
  const map = new Map();
  const key = (a, b) => a * 100003 + b;
  for (let i = 0; i < T.N; i += step) {
    const k = key(Math.floor(T.x[i] / cell), Math.floor(T.y[i] / cell));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  }
  const coarse = [];
  for (let i = 0; i < T.N; i += 10) coarse.push(i);
  return (x, y) => {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let best = 1e18, bi = -1;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const arr = map.get(key(cx + a, cy + b));
      if (arr) for (const i of arr) { const d = (x - T.x[i]) ** 2 + (y - T.y[i]) ** 2; if (d < best) { best = d; bi = i; } }
    }
    if (bi < 0) for (const i of coarse) { const d = (x - T.x[i]) ** 2 + (y - T.y[i]) ** 2; if (d < best) { best = d; bi = i; } }
    return { i: bi, dist: Math.sqrt(best) };
  };
}

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { let s = 0, a = 0.5, f = 1; for (let o = 0; o < 5; o++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2.03; } return s; }

const SCENERY = {
  med: { grass: [92, 108, 58], dry: 0.9, terrain: [104, 112, 66], hills: 38, kinds: ['umbrella', 'umbrella', 'cypress', 'oak'], count: 2600, sea: true, fields: 0.75 },
  forest: { grass: [62, 90, 46], dry: 0.25, terrain: [56, 78, 40], hills: 60, kinds: ['pine', 'pine', 'pine', 'oak'], count: 8000, sea: false, fields: 0.3 },
  desert: { grass: [150, 140, 90], dry: 1.0, terrain: [206, 170, 122], hills: 16, kinds: ['palm'], count: 520, sea: false, sandy: true, fields: 0 },
  // alpine meadows below wooded mountainsides; no town on the horizon
  alpine: { grass: [78, 108, 54], dry: 0.15, terrain: [70, 98, 50], hills: 95, kinds: ['pine', 'pine', 'oak', 'pine'], count: 6000, sea: false, town: false, fields: 0.5 },
  // dry inland hills with umbrella pines and a low town skyline
  catalan: { grass: [104, 110, 60], dry: 0.8, terrain: [118, 112, 70], hills: 34, kinds: ['umbrella', 'oak', 'cypress', 'umbrella'], count: 3000, sea: false, fields: 0.8 },
  // lush Belgian Ardennes: towering dark spruces, pines, European beeches and deep wooded valleys
  ardennes: { grass: [56, 86, 42], dry: 0.14, terrain: [46, 74, 35], hills: 110, kinds: ['spruce', 'spruce', 'pine', 'beech', 'oak'], count: 10500, sea: false, town: false, tightForest: true, fields: 0.2 },
};

// (the time-of-day presets live with the sky: see sky.js)
export { TIMES };

export function buildWorld(scene, renderer, T, opts) {
  const sc = SCENERY[T.def.scenery] || SCENERY.med;
  const time = TIMES[opts.time || T.def.time] || TIMES.day;
  const root = new THREE.Group();
  scene.add(root);
  const w2 = T.width / 2, N = T.N;
  const nearest = nearestFn(T);

  // ---------- sky, sun, environment (sky.js)
  const atmo = buildAtmosphere(scene, renderer, { time, sandy: !!sc.sandy });
  const { sun, hemi, sky, envRT } = atmo;

  // ---------- track surface (materials in surface.js)
  const asp = TX.asphalt();
  asp.map.repeat.set(1, 1);
  const trackMat = trackSurface(asp, T.width);
  // Per-vertex wear, read by the track shader: rubber on the racing line (heavier through
  // corners and braking zones), marbles off line around the corners, and the tone of each
  // stretch of tarmac (sections laid at different times are never quite the same grey).
  const cornerK = new Float32Array(N), brakeK = new Float32Array(N);
  {
    const spd = opts.profile;
    for (let i = 0; i < N; i++) {
      let k = 0;
      for (let q2 = -14; q2 <= 22; q2 += 2) k = Math.max(k, Math.abs(T.rl.kappa[(i + q2 + N) % N]));
      cornerK[i] = clamp01(k * 70);
      brakeK[i] = spd ? clamp01((spd[i] - spd[(i + 10) % N]) / 5) : 0;
    }
  }
  const trackGeo = ribbon(T, {
    d0: () => -w2 - 0.2, d1: () => w2 + 0.2, cols: 14, uScale: 1 / 7, vScale: 7,
    color: (i, t, d) => {
      const off = Math.abs(d - T.rl.alpha[i]);
      const sig = 1.2 + 0.45 * cornerK[i];
      const rub = Math.exp(-(off * off) / (2 * sig * sig)) * (0.5 + 0.3 * cornerK[i] + 0.4 * brakeK[i]);
      const marb = clamp01((off - 2.7) / 1.8) * (0.12 + 0.88 * cornerK[i]) * (Math.abs(d) < w2 - 0.3 ? 1 : 0.5);
      const tone = clamp01(0.5 + (fbm(i * 0.006 + 3, 0.7) - 0.5) * 1.5 + (fbm(i * 0.021 + 3, d * 0.09) - 0.5) * 0.5);
      return [Math.min(1, rub), marb, tone];
    },
  });
  trackGeo.setAttribute('aWear', trackGeo.getAttribute('color'));
  trackGeo.deleteAttribute('color');
  const track = new THREE.Mesh(trackGeo, trackMat);
  track.receiveShadow = true;
  root.add(track);

  // white edge lines: worn thermoplastic paint, chipped at the edges
  const lineMat = new THREE.MeshStandardMaterial({ map: TX.paintLine(), alphaTest: 0.4, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const side of [1, -1]) {
    const g = ribbon(T, { d0: () => side * (w2 - 0.3), d1: () => side * (w2 - 0.08), y: () => 0.01, vScale: 12 });
    const m = new THREE.Mesh(g, lineMat); m.receiveShadow = true; root.add(m);
  }

  // kerbs: supports standard kerbs plus multi-type 3D sculpted kerbs, tall stepped kerbs,
  // chicane anti-cut sausage kerbs (baguettes), wide fluted exit kerbs and green astroturf strips.
  const [kc1, kc2] = T.def.kerbColors || ['#b81a1f', '#dcdcd8'];
  const kerbTex = TX.kerb(kc1, kc2, false);
  const kerbRelief = new THREE.Vector2(0.7, 0.7);
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, normalMap: TX.kerbNormal(false), normalScale: kerbRelief, roughness: 0.6 });
  const hasMultiKerb = T.kerbL.some((v) => v > 1) || T.kerbR.some((v) => v > 1);
  const kerbStepMat = hasMultiKerb ? new THREE.MeshStandardMaterial({ map: TX.kerb(kc1, kc2, true), normalMap: TX.kerbNormal(true), normalScale: kerbRelief, roughness: 0.58 }) : null;
  const sausageMat = hasMultiKerb ? new THREE.MeshStandardMaterial({ map: TX.sausageKerb(), roughness: 0.48 }) : null;
  const astroMat = hasMultiKerb ? new THREE.MeshStandardMaterial({ map: TX.astroturf(), roughness: 0.92 }) : null;
  for (const side of [1, -1]) {
    const flags = side === 1 ? T.kerbL : T.kerbR;
    const addKerb = (g, mat, cast = false) => {
      if (!g.index.count) return;
      const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = cast; root.add(m);
    };
    if (!hasMultiKerb) {
      // ramp kerb: rises away from the track to a rounded crest, then drops to the verge
      addKerb(ribbon(T, {
        d0: () => side * (w2 - 0.05), d1: () => side * (w2 + 1.4), cols: 6, vScale: 2.2, uRepeat: 1,
        y: (i, t) => (t < 0.84 ? 0.012 + 0.07 * Math.sin((t / 0.84) * Math.PI * 0.5) : 0.082 - 0.1 * ((t - 0.84) / 0.16) ** 2),
        mask: (i) => flags[i],
      }), kerbMat, true);
    } else {
      // Type 1: standard sawtooth FIA apex kerb
      addKerb(ribbon(T, {
        d0: () => side * (w2 - 0.05), d1: () => side * (w2 + 1.4), cols: 4, vScale: 2.2, uRepeat: 1,
        y: (i, t) => 0.015 + Math.sin(t * Math.PI) * 0.045 + t * 0.018 + (t > 0.15 && t < 0.85 ? 0.008 * Math.sin(i * 1.57) : 0),
        mask: (i) => flags[i] === 1,
      }), kerbMat, true);
      // Type 2: tall double-stepped high-load kerb (Eau Rouge / Raidillon / Pouhon T11 / Blanchimont) + green verge
      addKerb(ribbon(T, {
        d0: () => side * (w2 - 0.05), d1: () => side * (w2 + 1.55), cols: 5, vScale: 2.0, uRepeat: 1,
        y: (i, t) => {
          const base = t <= 0.45 ? 0.018 + t * 0.12 : t <= 0.85 ? 0.072 + (t - 0.45) * 0.085 : 0.106 * (1 - (t - 0.85) / 0.15);
          return base + (t > 0.15 && t < 0.85 ? 0.009 * Math.sin(i * 1.57) : 0);
        },
        mask: (i) => flags[i] === 2,
      }), kerbStepMat, true);
      addKerb(ribbon(T, {
        d0: () => side * (w2 + 1.52), d1: () => side * (w2 + 2.68), uScale: 1 / 2.2, vScale: 3.5,
        y: () => -0.004,
        mask: (i) => flags[i] === 2,
      }), astroMat);
      // Type 3: chicane apex kerb + 3D raised yellow/amber anti-cut sausage mound (baguette)
      addKerb(ribbon(T, {
        d0: () => side * (w2 - 0.05), d1: () => side * (w2 + 1.25), cols: 4, vScale: 1.9, uRepeat: 1,
        y: (i, t) => 0.016 + Math.sin(t * Math.PI) * 0.048 + t * 0.015,
        mask: (i) => flags[i] === 3,
      }), kerbStepMat, true);
      const sTaper = (i) => {
        const p = flags[(i - 1 + N) % N] === 3, n = flags[(i + 1) % N] === 3;
        if (!p || !n) return 0;
        const p2 = flags[(i - 2 + N) % N] === 3, n2 = flags[(i + 2) % N] === 3;
        return p2 && n2 ? 1 : 0.55;
      };
      addKerb(ribbon(T, {
        d0: () => side * (w2 + 1.32), d1: () => side * (w2 + 2.28), cols: 6, vScale: 2.6, uRepeat: 1,
        y: (i, t) => 0.008 + Math.sin(t * Math.PI) * 0.165 * sTaper(i),
        mask: (i) => flags[i] === 3,
      }), sausageMat, true);
      // Type 4: wide fluted exit kerb + dark-green astroturf strip
      addKerb(ribbon(T, {
        d0: () => side * (w2 - 0.05), d1: () => side * (w2 + 2.1), cols: 4, vScale: 2.4, uRepeat: 1,
        y: (i, t) => 0.014 + Math.sin(t * Math.PI) * 0.032 + (t > 0.12 && t < 0.88 ? 0.006 * Math.sin(i * 1.57) : 0),
        mask: (i) => flags[i] === 4,
      }), kerbMat);
      addKerb(ribbon(T, {
        d0: () => side * (w2 + 2.06), d1: () => side * (w2 + 3.65), uScale: 1 / 2.2, vScale: 3.5,
        y: () => -0.004,
        mask: (i) => flags[i] === 4,
      }), astroMat);
      // Type 5: low-profile flush entry turn-in kerb
      addKerb(ribbon(T, {
        d0: () => side * (w2 - 0.05), d1: () => side * (w2 + 1.12), cols: 3, vScale: 2.2, uRepeat: 1,
        y: (i, t) => 0.01 + Math.sin(t * Math.PI) * 0.016,
        mask: (i) => flags[i] === 5,
      }), kerbMat);
    }
  }

  // verges: asphalt strip, paved runoff (plain or Spa red/yellow striped), gravel traps, grass
  const runMat = runoffSurface(asp);
  const hasStriped = T.runoffL.some((v) => v >= 2) || T.runoffR.some((v) => v >= 2);
  const stripedMat = hasStriped ? new THREE.MeshStandardMaterial({ map: TX.spaRunoff(), roughness: 0.88 }) : null;
  const gv = TX.gravel();
  const gravelMat = gravelSurface(gv);
  const mg = sc.sandy ? TX.sand() : TX.mowedGrass(sc.grass, sc.dry);
  const vergeMat = grassSurface(mg, { base: sc.sandy ? [222, 184, 130] : sc.grass, dry: sc.dry, stripe: sc.sandy ? 0 : 0.085, verge: { edge: w2 + 1.4 }, sandy: !!sc.sandy });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x2a5d9c, roughness: 0.8 });
  for (const side of [1, -1]) {
    const kerbF = side === 1 ? T.kerbL : T.kerbR;
    const ro = side === 1 ? T.runoffL : T.runoffR;
    const wall = side === 1 ? T.wallL : T.wallR;
    const add = (g, mat) => { if (!g.index.count) return; const m = new THREE.Mesh(g, mat); m.receiveShadow = true; root.add(m); };
    add(ribbon(T, { d0: () => side * (w2 + 0.1), d1: () => side * (w2 + 1.4), mask: (i) => !kerbF[i], uScale: 1 / 7, vScale: 7, y: () => -0.005 }), runMat);
    add(ribbon(T, { d0: () => side * (w2 + 1.4), d1: (i) => side * Math.min(wall[i], w2 + 9), mask: (i) => ro[i] === 1, uScale: 1 / 7, vScale: 7, y: () => -0.01 }), runMat);
    add(ribbon(T, { d0: () => side * (w2 + 2.6), d1: () => side * (w2 + 3.2), mask: (i) => ro[i] === 1 && !hasMultiKerb, y: () => 0.0 }), blueMat);
    if (hasStriped) {
      // style 2: iconic Spa red/yellow striped high-friction tarmac + gravel behind
      add(ribbon(T, { d0: () => side * (w2 + 1.4), d1: (i) => side * Math.min(wall[i], w2 + 9), mask: (i) => ro[i] === 2, uScale: 1 / 8, vScale: 8, y: () => -0.01 }), stripedMat);
      // style 3: wide red/yellow striped paved escape runoff all the way to the barrier
      add(ribbon(T, { d0: () => side * (w2 + 1.4), d1: (i) => side * (wall[i] - 0.1), mask: (i) => ro[i] === 3, uScale: 1 / 8, vScale: 8, y: () => -0.01 }), stripedMat);
    }
    add(ribbon(T, { d0: () => side * (w2 + 9), d1: (i) => side * (wall[i] - 0.1), mask: (i) => (ro[i] === 1 || ro[i] === 2) && wall[i] > w2 + 9.5, uScale: 1 / GRAVEL_TILE, vScale: GRAVEL_TILE, y: () => -0.03 }), gravelMat);
    add(ribbon(T, { d0: () => side * (w2 + 1.4), d1: (i) => side * (wall[i] + 0.5), mask: (i) => !ro[i], uScale: 1 / 20, vScale: 14, y: (i, t) => -0.03 - t * 0.05 }), vergeMat);
  }

  // start / finish line + grid boxes
  const chk = TX.checker();
  const sf = new THREE.Mesh(new THREE.PlaneGeometry(1.2, T.width), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }));
  chk.repeat.set(1, Math.round(T.width / 1.2)); // 0.6 m squares, two rows deep
  sf.rotation.x = -Math.PI / 2;
  sf.rotation.z = Math.atan2(T.ty[0], T.tx[0]);
  sf.position.copy(V(T.x[0], T.y[0], T.h[0] + 0.015));
  root.add(sf);
  const gridMat = new THREE.MeshStandardMaterial({ color: 0xe4e4e0, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3 });
  const gridGeos = [];
  const pole = opts.poleSide ?? 1;
  for (let k = 0; k < 20; k++) {
    const s = T.length - (12 + k * 8) + 2.9;
    const i = Math.floor(s / T.ds) % N;
    const d = (k % 2 === 0 ? 1 : -1) * 2.7 * pole;
    const p = V(T.x[i] + T.nx[i] * d, T.y[i] + T.ny[i] * d, T.h[i] + camberY(T, i, d) + 0.012);
    const yaw = Math.atan2(T.ty[i], T.tx[i]);
    // a bracket: the front line the nose stops at, and a short leg down each side of the slot
    for (const [along, across, lenA, lenB] of [[0, 0, 0.16, 2.5], [-0.75, 1.17, 1.5, 0.12], [-0.75, -1.17, 1.5, 0.12]]) {
      const g = new THREE.PlaneGeometry(lenA, lenB);
      g.rotateX(-Math.PI / 2);
      g.translate(along, 0, across);
      g.rotateY(yaw);
      g.translate(p.x, p.y, p.z);
      gridGeos.push(g);
    }
  }
  root.add(Object.assign(new THREE.Mesh(mergeGeometries(gridGeos), gridMat), { receiveShadow: true }));

  // ---------- barriers, catch fences and tyre walls (barriers.js)
  buildBarriers(root, T);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();

  // ---------- terrain
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, havg = 0;
  for (let i = 0; i < N; i++) { minx = Math.min(minx, T.x[i]); maxx = Math.max(maxx, T.x[i]); miny = Math.min(miny, T.y[i]); maxy = Math.max(maxy, T.y[i]); havg += T.h[i]; }
  havg /= N;
  const M = 900;
  const X0 = minx - M, X1 = maxx + M, Y0 = miny - M, Y1 = maxy + M;
  const spacing = 7;
  const nxv = Math.ceil((X1 - X0) / spacing), nyv = Math.ceil((Y1 - Y0) / spacing);
  const tpos = new Float32Array((nxv + 1) * (nyv + 1) * 3), tuv = new Float32Array((nxv + 1) * (nyv + 1) * 2), tcol = new Float32Array((nxv + 1) * (nyv + 1) * 3);
  const tout = new Float32Array((nxv + 1) * (nyv + 1)); // metres outside the barrier, per vertex
  const midY = (miny + maxy) / 2;
  const seaY = miny - 120; // sea to the "south"
  // the sea surface must sit below the lowest point of the circuit (and its sunk verges),
  // otherwise low-lying sections of road end up under the water plane
  let minH = 1e9;
  for (let i = 0; i < N; i++) minH = Math.min(minH, T.h[i]);
  const seaLevel = minH - 7;
  const far = (x, y) => {
    let h = havg + (fbm(x * 0.0025, y * 0.0025) - 0.45) * sc.hills * 2;
    // the last stretch before the edge of the mesh settles to one level, so the rim never shows as a cliff
    const rim = THREE.MathUtils.smoothstep(Math.min(x - X0, X1 - x, y - Y0, Y1 - y), 0, 320);
    h = (havg - 14) * (1 - rim) + h * rim;
    if (sc.sea) { const t = THREE.MathUtils.smoothstep(seaY - y, -100, 260); h = h * (1 - t) + (seaLevel - 10) * t; }
    if (sc.sandy) h += Math.sin(x * 0.01 + Math.sin(y * 0.007) * 2) * 4;
    return h;
  };
  const tc = new THREE.Color(...sc.terrain.map((v) => v / 255));
  let p = 0;
  const heightAt = (x, y) => {
    const nr = nearest(x, y);
    const i = nr.i;
    const wl = Math.max(T.wallL[i], T.wallR[i]);
    // Inside the barriers the verges are their own surfaces, so the terrain is sunk well below
    // the road there: it can never poke through or z-fight with the track at a distance.
    const lat = (x - T.x[i]) * T.nx[i] + (y - T.y[i]) * T.ny[i];
    const wallHere = lat > 0 ? T.wallL[i] : T.wallR[i];
    const drop = 3.0 - 2.55 * THREE.MathUtils.smoothstep(nr.dist, wallHere - 1.0, wallHere + 2.5);
    const near = T.h[i] - drop;
    const t = THREE.MathUtils.smoothstep(nr.dist, wl + 4, wl + 180);
    return { h: near * (1 - t) + far(x, y) * t, dist: nr.dist, wl };
  };
  for (let yv = 0; yv <= nyv; yv++) for (let xv = 0; xv <= nxv; xv++) {
    const x = X0 + xv * spacing, y = Y0 + yv * spacing;
    const r = heightAt(x, y);
    tpos[p * 3] = x; tpos[p * 3 + 1] = r.h; tpos[p * 3 + 2] = -y;
    tuv[p * 2] = x / 30; tuv[p * 2 + 1] = y / 30;
    tout[p] = r.dist - r.wl;
    p++;
  }
  const tidx = [];
  for (let yv = 0; yv < nyv; yv++) for (let xv = 0; xv < nxv; xv++) {
    const a = yv * (nxv + 1) + xv, b = a + 1, c = a + nxv + 1, d = c + 1;
    tidx.push(a, b, c, b, d, c); // counter-clockwise seen from above: the ground faces UP
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
  tg.setAttribute('uv', new THREE.BufferAttribute(tuv, 2));
  tg.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  tg.setIndex(tidx);
  tg.computeVertexNormals();
  // vertex tints: fields, woodland floor, steep ground, beach (terraintint.js)
  tintTerrain(tg, { outside: tout, base: tc, fields: sc.fields ?? 0.5, woodMin: sc.tightForest ? 0.25 : sc.kinds[0] === 'pine' ? 0.36 : 0.47, woodAmt: sc.tightForest ? 0.42 : sc.kinds[0] === 'pine' ? 0.6 : 0.5, beachBelow: sc.sea ? seaLevel + 1.8 : null });
  const ttex = sc.sandy ? TX.sand() : TX.grass(sc.grass, sc.dry);
  const terrain = new THREE.Mesh(tg, grassSurface(ttex, { base: sc.sandy ? [222, 184, 130] : sc.grass, dry: sc.dry, stripe: 0, vertexColors: true, sandy: !!sc.sandy }));
  terrain.receiveShadow = true;
  root.add(terrain);
  {
    // The land carries on past the edge of the detailed terrain, out to the distant ridges: a
    // frame of flat ground around the mesh at the level its rim settles to (open on the seaward side).
    const R = 9000, cxm = (minx + maxx) / 2, cym = (miny + maxy) / 2, lvl = havg - 14.3;
    const ylo = sc.sea ? seaY + 100 : cym - R;
    const tm2 = Math.max(tc.r, tc.g, tc.b) * 0.8;
    const fp = [], fu = [], fc = [], fn = [], fi = [];
    const rect = (xa, xb, ya, yb) => {
      if (xb <= xa || yb <= ya) return;
      const o = fp.length / 3;
      for (const [x, y] of [[xa, ya], [xb, ya], [xb, yb], [xa, yb]]) {
        fp.push(x, lvl, -y); fu.push(x / 30, y / 30); fn.push(0, 1, 0);
        fc.push(0.45 + 0.55 * tc.r / tm2, 0.45 + 0.55 * tc.g / tm2, 0.45 + 0.55 * tc.b / tm2);
      }
      fi.push(o, o + 1, o + 2, o, o + 2, o + 3);
    };
    rect(cxm - R, X0 + 2, ylo, cym + R); rect(X1 - 2, cxm + R, ylo, cym + R);
    rect(X0 + 2, X1 - 2, ylo, Y0 + 2); rect(X0 + 2, X1 - 2, Y1 - 2, cym + R);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
    fg.setAttribute('normal', new THREE.Float32BufferAttribute(fn, 3));
    fg.setIndex(fi);
    root.add(new THREE.Mesh(fg, terrain.material));
  }

  if (sc.sea) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshPhysicalMaterial({ color: 0x0f4a6e, roughness: 0.06, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = seaLevel;
    root.add(water);
  }

  // ---------- grandstands (start straight + slowest corners or circuit-defined stands),
  // circuit landmarks, then trees (skipping all grandstands, pit buildings and landmarks)
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const standMat = new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.7, metalness: 0.2 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5, metalness: 0.3 });
  const crowdTex = crowdTexture(16);
  const crowdMat = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 1 });
  const stands = [];
  const prof = opts.profile;
  if (T.def.stands) {
    for (const s of T.def.stands) {
      stands.push({ i: Math.round((((s.m % T.length) + T.length) % T.length) / T.ds) % N, side: s.side, len: s.len });
    }
  } else {
    const pitSide = T.pit ? T.pit.side : T.runoffL[0] ? -1 : (T.wallL[0] <= T.wallR[0] ? 1 : -1);
    stands.push({ i: 0, side: -pitSide, len: 260 });
    // slow corners
    if (prof) {
      const mins = [];
      for (let i = 0; i < N; i++) {
        const v = prof[i];
        let isMin = true;
        for (let q2 = -40; q2 <= 40; q2 += 4) if (prof[(i + q2 + N) % N] < v) { isMin = false; break; }
        if (isMin && v < 45) mins.push({ i, v });
      }
      mins.sort((a, b) => a.v - b.v);
      for (const m of mins.slice(0, 3)) {
        const side = -Math.sign(T.kappa[m.i]) || 1;
        if (stands.some((s) => Math.min(Math.abs(s.i - m.i), N - Math.abs(s.i - m.i)) < 80)) continue;
        stands.push({ i: m.i, side, len: 140 });
      }
    }
  }
  const treeClear = []; // { x, y, r } in sim coords so trees never clip into buildings or stands
  for (const st of stands) {
    const wall = st.side === 1 ? T.wallL : T.wallR;
    const g = new THREE.Group();
    const i = st.i;
    const rows = 16, rowD = 0.85, rowH = 0.48;
    const base = wall[i] + 6;
    const wx = T.x[i] + T.nx[i] * st.side * base, wy = T.y[i] + T.ny[i] * st.side * base;
    const pos0 = V(wx, wy, T.h[i]);
    g.position.copy(pos0);
    g.rotation.y = Math.atan2(T.ty[i], T.tx[i]);
    // local: x along track, z positive away from track if side=-1... compute outward direction sign in local z
    const out = st.side === 1 ? -1 : 1; // sim left maps to three -z
    const depth = rows * rowD, y0 = 1.4, y1 = y0 + rows * rowH;
    {
      // raked seating deck
      const dg = new THREE.BufferGeometry();
      const L = st.len / 2;
      dg.setAttribute('position', new THREE.Float32BufferAttribute([-L, y0, 0, L, y0, 0, L, y1, out * depth, -L, y1, out * depth], 3));
      const ur = st.len / 16.5;
      dg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, ur, 0, ur, 1, 0, 1], 2));
      dg.setIndex(out > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
      dg.computeVertexNormals();
      const deck = new THREE.Mesh(dg, crowdMat); deck.receiveShadow = true; g.add(deck);
      if (T.def.stands) {
        const plinth = new THREE.Mesh(new THREE.BoxGeometry(st.len, 8, depth + 0.6), standMat);
        plinth.position.set(0, -4, out * (depth / 2)); g.add(plinth);
      }
      const front = new THREE.Mesh(new THREE.BoxGeometry(st.len, y0, 0.3), standMat); front.position.set(0, y0 / 2, out * 0.1); g.add(front);
      const back = new THREE.Mesh(new THREE.BoxGeometry(st.len, y1 + 1.2, 0.4), standMat); back.position.set(0, (y1 + 1.2) / 2, out * (depth + 0.2)); back.castShadow = true; g.add(back);
      for (const sx of [-1, 1]) {
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.Float32BufferAttribute([sx * L, 0, 0, sx * L, y0, 0, sx * L, y1, out * depth, sx * L, 0, out * depth], 3));
        sg.setIndex([0, 1, 2, 0, 2, 3]); sg.computeVertexNormals();
        const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.8, side: THREE.DoubleSide })); g.add(sm);
      }
      for (let s = -L - 8; s <= L + 8; s += 20) {
        treeClear.push({ x: wx + T.tx[i] * s + T.nx[i] * st.side * (depth * 0.5), y: wy + T.ty[i] * s + T.ny[i] * st.side * (depth * 0.5), r: 16 });
      }
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(st.len + 4, 0.3, rows * rowD + 3), roofMat);
    roof.position.set(0, rows * rowH + 6.2, out * (rows * rowD) / 2);
    roof.rotation.x = out * 0.06;
    roof.castShadow = true;
    g.add(roof);
    for (let k = -st.len / 2 + 5; k <= st.len / 2 - 5; k += 20) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, rows * rowH + 5, 0.4), standMat);
      col.position.set(k, (rows * rowH + 5) / 2, out * rows * rowD);
      g.add(col);
    }
    root.add(g);
  }
  if (T.id === 'spa') {
    const lm = buildSpaLandmarks(root, T, { crowdMat, standMat, roofMat });
    treeClear.push(...lm.clearZones);
  }

  // ---------- trees: painted cross-billboards (alpha-tested, cast real shadows)
  {
    const kinds = [...new Set(sc.kinds)];
    const spots = Object.fromEntries(kinds.map((k) => [k, []]));
    let placed = 0, tries = 0;
    const dense = sc.kinds[0] === 'pine' || sc.tightForest;
    const edgePad = sc.tightForest ? 5.5 : 9;
    const clumpMin = sc.tightForest ? 0.25 : dense ? 0.36 : 0.47;
    const clearBlocked = (x, y) => {
      for (let k = 0; k < treeClear.length; k++) {
        const z = treeClear[k];
        if ((x - z.x) ** 2 + (y - z.y) ** 2 < z.r * z.r) return true;
      }
      return false;
    };
    while (placed < sc.count && tries < sc.count * 30) {
      tries++;
      const x = X0 + 200 + rnd() * (X1 - X0 - 400), y = Y0 + 200 + rnd() * (Y1 - Y0 - 400);
      const r = heightAt(x, y);
      if (r.dist < r.wl + edgePad) continue;
      if (!dense && r.dist > 500 && rnd() < 0.85) continue;
      if (sc.sea && r.h < seaLevel + 3) continue;
      if (fbm(x * 0.006 + 7, y * 0.006) < clumpMin) continue; // clumps and clearings
      if (treeClear.length && clearBlocked(x, y)) continue;
      const kind = sc.kinds[Math.floor(rnd() * sc.kinds.length)];
      spots[kind].push([x, r.h - 0.25, -y, 0.7 + rnd() * 0.75, rnd() * Math.PI]);
      placed++;
    }
    const e = new THREE.Euler();
    for (const kind of kinds) {
      const list = spots[kind];
      if (!list.length) continue;
      const tt = treeTexture(kind, 3);
      const mat = new THREE.MeshBasicMaterial({ map: tt.map, alphaTest: 0.42, alphaToCoverage: true, side: THREE.DoubleSide, color: new THREE.Color(...time.tint) });
      const mesh = new THREE.InstancedMesh(treeGeometry(tt.w, tt.h), mat, list.length);
      const col = new THREE.Color();
      list.forEach(([x, y, z, sc4, rot], k) => {
        m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, rot, 0)), new THREE.Vector3(sc4, sc4 * (0.9 + (k % 7) * 0.035), sc4));
        mesh.setMatrixAt(k, m4);
        const v = 0.78 + ((k * 37) % 23) / 23 * 0.4; // per-tree brightness variation
        mesh.setColorAt(k, col.setRGB(v, v * (0.96 + (k % 5) * 0.02), v * 0.94));
      });
      mesh.castShadow = true;
      mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tt.map, alphaTest: 0.42 });
      root.add(mesh);
    }
  }

  // (the pit lane, garages and pit building are built in pitlane.js)

  // start gantry with lights
  const gantry = new THREE.Group();
  {
    const i = 0;
    gantry.position.copy(V(T.x[i], T.y[i], T.h[i]));
    gantry.rotation.y = Math.atan2(T.ty[i], T.tx[i]);
    const metal = new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.7, roughness: 0.35 });
    for (const s of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), metal);
      pil.position.set(0, 4.5, s * (w2 + 2.5)); pil.castShadow = true; gantry.add(pil);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, T.width + 6), metal);
    beam.position.set(0, 8.4, 0); beam.castShadow = true; gantry.add(beam);
    const lamps = [];
    for (let k = 0; k < 5; k++) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.7), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4 }));
      pod.position.set(-0.6, 8.0, (k - 2) * 1.1); gantry.add(pod);
      const mats = [];
      for (const yy of [-0.25, 0.25]) {
        const lm = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff0000, emissiveIntensity: 0 });
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), lm);
        l.position.set(-0.86, 8.0 + yy, (k - 2) * 1.1);
        l.rotation.y = -Math.PI / 2;
        gantry.add(l); mats.push(lm);
      }
      lamps.push(mats);
    }
    gantry.userData.lamps = lamps;
    root.add(gantry);
  }

  // sponsor bridge over the second DRS straight (or mid-lap); Spa places its own landmarks
  if (T.id !== 'spa') {
    const z = T.drs[1] || T.drs[0];
    const i = z ? Math.floor((z.start + (z.end > z.start ? z.end : z.end + N)) / 2) % N : Math.floor(N / 2);
    const g = new THREE.Group();
    g.position.copy(V(T.x[i], T.y[i], T.h[i]));
    g.rotation.y = Math.atan2(T.ty[i], T.tx[i]);
    const span = Math.min(T.wallL[i], T.wallR[i]) * 2 + 2;
    const bt = TX.adBoards(); bt.repeat.set(span / 40, 1);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, span), [standMat, standMat, standMat, standMat, new THREE.MeshStandardMaterial({ map: bt }), new THREE.MeshStandardMaterial({ map: bt })]);
    // put the ad faces toward the cars (local x)
    board.rotation.y = Math.PI / 2;
    board.geometry = new THREE.BoxGeometry(span, 2.6, 2.2);
    board.material = [standMat, standMat, standMat, standMat, new THREE.MeshStandardMaterial({ map: bt }), new THREE.MeshStandardMaterial({ map: bt })];
    board.position.y = 8.5; board.castShadow = true;
    g.add(board);
    for (const s of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(1, 9.8, 1), standMat);
      pil.position.set(0, 4.9, s * (span / 2 - 0.5)); g.add(pil);
    }
    root.add(g);
  }

  // braking marker boards (150 / 100 / 50) before the big stops
  if (prof) {
    const bmats = { 150: TX.boardNumber('150'), 100: TX.boardNumber('100'), 50: TX.boardNumber('50') };
    for (let i = 0; i < N; i++) {
      const a = prof[i], b = prof[(i + 1) % N], c = prof[(i - 1 + N) % N];
      if (!(c <= a + 1e-6 && b < a - 0.02)) continue;
      // find the drop
      let j = i, guard = 0;
      while (prof[(j + 1) % N] < prof[j % N] + 1e-6 && guard++ < 400) j++;
      const drop = a - prof[j % N];
      // the big stops get 150/100/50; slower corners that need only a dab still get 100/50
      const slow = prof[j % N] < 46 && drop >= 5;
      if (drop < 18 && !slow) continue;
      const side = -Math.sign(T.kappa[j % N]) || 1;
      for (const m of drop >= 18 ? [150, 100, 50] : [100, 50]) {
        const k = (j - Math.round(m / T.ds) + N) % N;
        const wall = side === 1 ? T.wallL : T.wallR;
        const d = side * (Math.min(wall[k], w2 + 8) - 1.2);
        const board = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ map: bmats[m], roughness: 0.6, side: THREE.DoubleSide }));
        board.position.copy(V(T.x[k] + T.nx[k] * d, T.y[k] + T.ny[k] * d, T.h[k] + camberY(T, k, d) + 1.4));
        board.rotation.y = Math.atan2(T.ty[k], T.tx[k]) - Math.PI / 2;
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 5), standMat);
        leg.position.copy(board.position); leg.position.y -= 0.9;
        root.add(board, leg);
      }
    }
  }

  // ---------- dynamic racing line: 3D chevrons on the ideal line for the next ~350 m.
  // Colour is live, like the big racing games: green = stay on it, yellow = lift,
  // red = you are carrying too much speed for that point, brake.
  const line = (() => {
    const sh = new THREE.Shape();
    [[0.55, 0], [-0.05, 0.62], [-0.42, 0.62], [0.18, 0], [-0.42, -0.62], [-0.05, -0.62]].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2);
    const COUNT = 88, STEP = Math.max(2, Math.round(4 / T.ds));
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.82, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -6, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(g, mat, COUNT);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.visible = false;
    root.add(mesh);
    let lp = opts.lineProfile || prof;
    // where does the line actually constrain you? (braking zones and corners)
    const zone = new Uint8Array(N);
    if (lp) for (let i = 0; i < N; i++) {
      const braking = lp[(i + 5) % N] < lp[i] - 0.25;
      zone[i] = braking || Math.abs(T.rl.kappa[i]) > 1 / 420 ? 1 : 0;
    }
    const GREEN = new THREE.Color(0.05, 0.95, 0.25), YEL = new THREE.Color(1.0, 0.82, 0.05), RED = new THREE.Color(1.0, 0.1, 0.06);
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ee = new THREE.Euler(0, 0, 0, 'YZX'), pp = new THREE.Vector3(), ss = new THREE.Vector3(), cc = new THREE.Color();
    return {
      mesh,
      setProfile(p) { lp = p; }, // e.g. when the tyres wear and the braking points move
      update(idx, v) {
        if (!mesh.visible || !lp) return;
        const base = (Math.floor(idx / STEP) + 2) * STEP;
        const react = Math.round((v * 0.3) / T.ds);
        for (let k = 0; k < COUNT; k++) {
          const j = (base + k * STEP) % N, j2 = (j + 1) % N;
          pp.set(T.rl.x[j], T.h[j] + camberY(T, j, T.rl.alpha[j]) + 0.045, -T.rl.y[j]);
          ee.set(T.camber ? T.camber[j] : 0, Math.atan2(T.rl.y[j2] - T.rl.y[j], T.rl.x[j2] - T.rl.x[j]), Math.atan(T.grade[j]));
          const fade = k > COUNT - 16 ? (COUNT - k) / 16 : 1;
          ss.set(0.95 * fade + 0.001, 1, 0.72 * fade + 0.001);
          mm.compose(pp, qq.setFromEuler(ee), ss);
          mesh.setMatrixAt(k, mm);
          // judged a reaction-time ahead, against a human-paced braking profile: red means
          // "be on the brakes by here", early enough to actually act on
          const jr = (j + react) % N;
          const over = v - lp[jr];
          if (!(zone[j] || zone[jr]) || over < -7) cc.copy(GREEN);
          else if (over < 0) cc.copy(GREEN).lerp(YEL, Math.min(1, (over + 7) / 4));
          else cc.copy(YEL).lerp(RED, Math.min(1, over / 2.5));
          mesh.setColorAt(k, cc);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      },
    };
  })();

  // distant skyline for the desert / coastal tracks
  if (T.def.scenery !== 'forest' && sc.town !== false) {
    const desertSky = T.def.scenery === 'desert';
    const ftex = DT.facade(time === TIMES.sunset ? 0.07 : 0.0);
    const bmat = new THREE.MeshStandardMaterial({ map: ftex, color: desertSky ? 0xb9c4d0 : 0xf1eee6, roughness: desertSky ? 0.22 : 0.6, metalness: desertSky ? 0.55 : 0, emissiveMap: ftex, emissive: 0xffffff, emissiveIntensity: time === TIMES.sunset ? 0.25 : 0 });
    const geos = [];
    for (let k = 0; k < 90; k++) {
      const ang = rnd() * Math.PI * 2;
      const rad = Math.max(maxx - minx, maxy - miny) * 0.5 + 500 + rnd() * 500;
      const cx = (minx + maxx) / 2 + Math.cos(ang) * rad, cy = (miny + maxy) / 2 + Math.sin(ang) * rad;
      if (sc.sea && cy < seaY + 100) continue;
      const hgt = T.def.scenery === 'desert' ? 30 + rnd() * 180 : 8 + rnd() * 14;
      const wd = T.def.scenery === 'desert' ? 20 + rnd() * 30 : 12 + rnd() * 20;
      const g = new THREE.BoxGeometry(wd, hgt, wd * (0.6 + rnd()));
      { const uvA = g.attributes.uv; for (let q2 = 0; q2 < uvA.count; q2++) uvA.setXY(q2, uvA.getX(q2) * Math.max(1, Math.round(wd / 26)), uvA.getY(q2) * Math.max(1, Math.round(hgt / 55))); }
      g.rotateY(rnd() * Math.PI);
      g.translate(cx, far(cx, cy) + hgt / 2 - 2, -cy);
      geos.push(g);
    }
    if (geos.length) root.add(new THREE.Mesh(mergeGeometries(geos), bmat));
  }

  // ---------- distant ridges for depth (clouds are part of the sky dome)
  atmo.addHorizon(root, { cx: (minx + maxx) / 2, cz: -(miny + maxy) / 2, radius: Math.max(maxx - minx, maxy - miny) / 2 + 3600, baseY: havg, sea: !!sc.sea });

  return {
    root, sun, sky, gantry, line, envRT, hemi,
    // road-type materials, for weather.js to soak when it rains
    surfaces: { track: trackMat, run: runMat, kerb: kerbMat, kerbStep: kerbStepMat, sausage: sausageMat, astroturf: astroMat, striped: stripedMat, line: lineMat, gravel: gravelMat, verge: vergeMat },
    weather: null,
    // call once everything else has been added under root (pit lane, markers): opts { wet, effects }
    startWeather(opts) { this.weather = buildWeather(scene, this, T, opts); return this.weather; },
    setLights(n, out) {
      gantry.userData.lamps.forEach((mats, k) => mats.forEach((m) => { m.emissiveIntensity = !out && k < n ? 6 : 0; }));
    },
    followSun(target) { atmo.followSun(target); },
    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          for (const k of ['map', 'normalMap', 'roughnessMap', 'alphaMap', 'emissiveMap']) if (m[k]) m[k].dispose();
          m.dispose();
        }
      });
      atmo.dispose();
    },
  };
}

function makeTreeGeo(kind) {
  const parts = [];
  const col = (g, c) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    const cc = new THREE.Color(c);
    for (let i = 0; i < n; i++) { const v = 0.85 + Math.random() * 0.3; a[i * 3] = cc.r * v; a[i * 3 + 1] = cc.g * v; a[i * 3 + 2] = cc.b * v; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const strip = (g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; };
  if (kind === 'pine') {
    const trunk = new THREE.CylinderGeometry(0.25, 0.35, 4, 6); trunk.translate(0, 2, 0); parts.push(col(trunk, 0x4a3426));
    for (let k = 0; k < 4; k++) {
      const c = new THREE.ConeGeometry(3.4 - k * 0.7, 5 - k * 0.5, 8); c.translate(0, 4.5 + k * 2.6, 0); parts.push(col(c, 0x1f4a2a));
    }
  } else if (kind === 'palm') {
    const trunk = new THREE.CylinderGeometry(0.22, 0.35, 9, 6); trunk.translate(0, 4.5, 0); parts.push(col(trunk, 0x7a6248));
    for (let k = 0; k < 7; k++) {
      const f = new THREE.ConeGeometry(0.6, 4.5, 4); f.scale(1, 1, 0.2); f.rotateZ(Math.PI / 2 + 0.5); f.translate(2.0, 8.6, 0); f.rotateY((k / 7) * Math.PI * 2);
      parts.push(col(f, 0x4f7a2e));
    }
  } else {
    // mediterranean: umbrella pine + cypress mix in one geometry (two trees close together)
    const trunk = new THREE.CylinderGeometry(0.3, 0.45, 6, 6); trunk.translate(0, 3, 0); parts.push(col(trunk, 0x5a4030));
    const crown = new THREE.SphereGeometry(4, 8, 6); crown.scale(1, 0.45, 1); crown.translate(0, 7, 0); parts.push(col(crown, 0x3d5a2a));
    const cyp = new THREE.ConeGeometry(1.2, 10, 7); cyp.translate(5, 5, 2); parts.push(col(cyp, 0x23402a));
  }
  return mergeGeometries(parts.map((g) => { g.computeVertexNormals(); return strip(g); }));
}
