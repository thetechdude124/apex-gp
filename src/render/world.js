// Builds the 3D world for a track: surfaces, barriers, terrain, scenery, sky + lighting.
// Sim (x, y, h) maps to three (x, h, -y).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { buildWeather } from './weather.js';
import { treeTexture, treeGeometry, crowdTexture, cloudTexture } from './nature.js';
import * as DT from './detail.js';

const V = (x, y, h) => new THREE.Vector3(x, h, -y);

function ribbon(T, o) {
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
      const yo = o.y ? o.y(i, t, d) : 0;
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
  med: { grass: [92, 108, 58], dry: 0.9, terrain: [104, 112, 66], hills: 38, kinds: ['umbrella', 'umbrella', 'cypress', 'oak'], count: 2600, sea: true },
  forest: { grass: [62, 90, 46], dry: 0.25, terrain: [56, 78, 40], hills: 60, kinds: ['pine', 'pine', 'pine', 'oak'], count: 8000, sea: false },
  desert: { grass: [150, 140, 90], dry: 1.0, terrain: [206, 170, 122], hills: 16, kinds: ['palm'], count: 520, sea: false, sandy: true },
  // alpine meadows below wooded mountainsides; no town on the horizon
  alpine: { grass: [78, 108, 54], dry: 0.15, terrain: [70, 98, 50], hills: 95, kinds: ['pine', 'pine', 'oak', 'pine'], count: 6000, sea: false, town: false },
  // dry inland hills with umbrella pines and a low town skyline
  catalan: { grass: [104, 110, 60], dry: 0.8, terrain: [118, 112, 70], hills: 34, kinds: ['umbrella', 'oak', 'cypress', 'umbrella'], count: 3000, sea: false },
};

// tint: brightness/colour for unlit painted things (trees); cloud: [cover, r, g, b]
export const TIMES = {
  day: { elev: 40, az: 135, turb: 2.0, ray: 2.2, skyG: 1.7, sun: 3.8, hemi: 0.16, env: 1.0, fog: 0xa9c0d6, fogD: 0.00012, exposure: 0.6, tint: [0.78, 0.8, 0.76], cloud: [0.36, 2.3, 2.3, 2.35], mount: 0x7d90a6 },
  overcast: { elev: 34, az: 200, turb: 9, ray: 2.6, sun: 1.5, hemi: 0.4, env: 1.15, fog: 0x8a939c, fogD: 0.00022, exposure: 0.58, tint: [0.6, 0.63, 0.64], cloud: [0.9, 1.25, 1.28, 1.34], mount: 0x6c7680 },
  sunset: { elev: 9, az: 250, turb: 5, ray: 2.2, skyG: 1.25, sun: 3.6, hemi: 0.42, env: 1.3, fog: 0xc28a62, fogD: 0.00022, exposure: 0.92, tint: [0.9, 0.66, 0.46], cloud: [0.42, 2.6, 1.55, 1.0], mount: 0x8a6a66 },
};

export function buildWorld(scene, renderer, T, opts) {
  const sc = SCENERY[T.def.scenery] || SCENERY.med;
  const time = TIMES[opts.time || T.def.time] || TIMES.day;
  const root = new THREE.Group();
  scene.add(root);
  const w2 = T.width / 2, N = T.N;
  const nearest = nearestFn(T);

  // ---------- sky, sun, environment
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const su = sky.material.uniforms;
  su.turbidity.value = time.turb; su.rayleigh.value = time.ray;
  su.mieCoefficient.value = 0.005; su.mieDirectionalG.value = 0.8;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - time.elev), THREE.MathUtils.degToRad(time.az));
  su.sunPosition.value.copy(sunDir);
  // The stock sky is pale and milky once tone-mapped. A gamma on its output deepens the blue
  // overhead while leaving the bright horizon and the sun alone.
  su.skyGamma = { value: time.skyG ?? 1.0 };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( pow( retColor * 0.5, vec3( skyGamma ) ) * 2.0, 1.0 );')
    .replace('uniform vec3 up;', 'uniform vec3 up; uniform float skyGamma;');
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky2 = sky.clone(); envScene.add(sky2);
  {
    // The sky shader alone is bright below the horizon too, which lights every underside as if
    // the car floated in mid-air. Give the environment a ground (sunlit albedo) and a dark
    // horizon band of trees / dunes: undersides go dark, paint reflects a horizon line.
    const sinE = Math.sin(THREE.MathUtils.degToRad(time.elev));
    const lit = (time.sun * sinE) / Math.PI + 0.22 * time.hemi + 0.1;
    const alb = sc.sandy ? [0.36, 0.28, 0.19] : [0.105, 0.125, 0.075];
    const gcol = new THREE.Color(alb[0] * lit, alb[1] * lit, alb[2] * lit);
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(9000, 48), new THREE.MeshBasicMaterial({ color: gcol }));
    gnd.rotation.x = -Math.PI / 2; gnd.position.y = -1.6;
    envScene.add(gnd);
    // tarmac directly underneath (what the lower bodywork actually reflects)
    const road = new THREE.Mesh(new THREE.CircleGeometry(14, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.075 * lit, 0.075 * lit, 0.08 * lit) }));
    road.rotation.x = -Math.PI / 2; road.position.y = -1.55;
    envScene.add(road);
    const band = new THREE.CylinderGeometry(420, 420, 1, 96, 1, true);
    const bp = band.attributes.position;
    for (let k = 0; k < bp.count; k++) if (bp.getY(k) > 0) { const a = Math.atan2(bp.getZ(k), bp.getX(k)); bp.setY(k, (sc.sandy ? 4 : 10) + fbm(Math.cos(a) * 3 + 2, Math.sin(a) * 3 + 5) * (sc.sandy ? 14 : 34)); } else bp.setY(k, -2);
    const bcol = sc.sandy ? gcol.clone().multiplyScalar(0.8) : new THREE.Color(0.035 * lit, 0.055 * lit, 0.03 * lit);
    envScene.add(new THREE.Mesh(band, new THREE.MeshBasicMaterial({ color: bcol, side: THREE.BackSide })));
  }
  const envRT = pmrem.fromScene(envScene, 0.02);
  scene.environment = envRT.texture;
  scene.environmentIntensity = time.env ?? 1.0;
  scene.fog = new THREE.FogExp2(time.fog, time.fogD);
  renderer.toneMappingExposure = time.exposure;

  const sun = new THREE.DirectionalLight(time === TIMES.sunset ? 0xffc28a : 0xfff4e5, time.sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc2 = sun.shadow.camera;
  sc2.left = -80; sc2.right = 80; sc2.top = 80; sc2.bottom = -80; sc2.near = 200; sc2.far = 640;
  // tight depth range keeps the bias small, so shadows start right at the tyres
  sun.shadow.bias = -0.00028; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(time === TIMES.sunset ? 0xffd2b0 : 0xcfe6ff, sc.sandy ? 0x9a7a50 : 0x4a5a30, time.hemi);
  scene.add(hemi);

  // ---------- track surface
  const asp = TX.asphalt();
  asp.map.repeat.set(1, 1);
  const trackMat = new THREE.MeshStandardMaterial({ map: asp.map, normalMap: asp.normal, roughnessMap: asp.rough, roughness: 1.0, metalness: 0.0, vertexColors: true, normalScale: new THREE.Vector2(0.22, 0.22) });
  DT.applyTrackDetail(trackMat, T.width);
  const trackGeo = ribbon(T, {
    d0: () => -w2 - 0.2, d1: () => w2 + 0.2, cols: 14, uScale: 1 / 7, vScale: 7,
    color: (i, t, d) => {
      const a = T.rl.alpha[i];
      const rub = Math.exp(-((d - a) ** 2) / (2 * 1.5 * 1.5));
      // braking zones get darker rubber
      const k = 1 - 0.38 * rub - 0.05 * Math.exp(-(d * d) / 40);
      const edge = Math.abs(d) > w2 - 0.6 ? 1.05 : 1;
      const patch = 0.93 + 0.14 * fbm(i * 0.021 + 3, d * 0.09) ; // resurfacing patches / wear
      const v = k * edge * patch;
      return [v, v, v];
    },
  });
  const track = new THREE.Mesh(trackGeo, trackMat);
  track.receiveShadow = true;
  root.add(track);

  // white edge lines
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const side of [1, -1]) {
    const g = ribbon(T, { d0: () => side * (w2 - 0.32), d1: () => side * (w2 - 0.06), y: () => 0.01 });
    const m = new THREE.Mesh(g, lineMat); m.receiveShadow = true; root.add(m);
  }

  // kerbs
  const kerbTex = TX.kerb();
  const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.55 });
  for (const side of [1, -1]) {
    const flags = side === 1 ? T.kerbL : T.kerbR;
    const g = ribbon(T, {
      d0: () => side * (w2 - 0.05), d1: () => side * (w2 + 1.4), cols: 3, vScale: 2.2, uRepeat: 1,
      y: (i, t) => 0.02 + Math.sin(t * Math.PI) * 0.05 + t * 0.02,
      mask: (i) => flags[i],
    });
    const m = new THREE.Mesh(g, kerbMat); m.receiveShadow = true; root.add(m);
  }

  // verges: asphalt strip, paved runoff, gravel traps, grass
  const runMat = DT.applyMacro(new THREE.MeshStandardMaterial({ map: asp.map, color: 0xb9bcc0, roughness: 0.95 }), { scale: 0.3, amount: 0.22 });
  const gv = TX.gravel();
  gv.map.repeat.set(1, 1);
  const gravelMat = new THREE.MeshStandardMaterial({ map: gv.map, normalMap: gv.normal, roughness: 1 });
  const mg = sc.sandy ? TX.sand() : TX.mowedGrass(sc.grass, sc.dry);
  const vergeMat = DT.applyMacro(new THREE.MeshStandardMaterial({ map: mg, roughness: 1 }), { scale: 0.21, amount: 0.3, tint: sc.sandy ? [1.06, 0.97, 0.86] : [1.18, 1.05, 0.72], tintAmt: 0.5 * (0.35 + sc.dry * 0.65) });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x2a5d9c, roughness: 0.8 });
  for (const side of [1, -1]) {
    const kerbF = side === 1 ? T.kerbL : T.kerbR;
    const ro = side === 1 ? T.runoffL : T.runoffR;
    const wall = side === 1 ? T.wallL : T.wallR;
    const add = (g, mat) => { const m = new THREE.Mesh(g, mat); m.receiveShadow = true; root.add(m); };
    add(ribbon(T, { d0: () => side * (w2 + 0.1), d1: () => side * (w2 + 1.4), mask: (i) => !kerbF[i], uScale: 1 / 7, vScale: 7, y: () => -0.005 }), runMat);
    add(ribbon(T, { d0: () => side * (w2 + 1.4), d1: (i) => side * Math.min(wall[i], w2 + 9), mask: (i) => ro[i], uScale: 1 / 7, vScale: 7, y: () => -0.01 }), runMat);
    add(ribbon(T, { d0: () => side * (w2 + 2.6), d1: () => side * (w2 + 3.2), mask: (i) => ro[i], y: () => 0.0 }), blueMat);
    add(ribbon(T, { d0: () => side * (w2 + 9), d1: (i) => side * (wall[i] - 0.1), mask: (i) => ro[i] && wall[i] > w2 + 9.5, uScale: 1 / 4, vScale: 4, y: () => -0.03 }), gravelMat);
    add(ribbon(T, { d0: () => side * (w2 + 1.4), d1: (i) => side * (wall[i] + 0.5), mask: (i) => !ro[i], uScale: 1 / 20, vScale: 14, y: (i, t) => -0.03 - t * 0.05 }), vergeMat);
  }

  // start / finish line + grid boxes
  const chk = TX.checker();
  const sf = new THREE.Mesh(new THREE.PlaneGeometry(1.2, T.width), new THREE.MeshStandardMaterial({ map: chk, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3 }));
  chk.repeat.set(1, 4);
  sf.rotation.x = -Math.PI / 2;
  sf.rotation.z = Math.atan2(T.ty[0], T.tx[0]);
  sf.position.copy(V(T.x[0], T.y[0], T.h[0] + 0.015));
  root.add(sf);
  const gridMat = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3 });
  const gridGeos = [];
  const pole = opts.poleSide ?? 1;
  for (let k = 0; k < 20; k++) {
    const s = T.length - (12 + k * 8) + 2.9;
    const i = Math.floor(s / T.ds) % N;
    const d = (k % 2 === 0 ? 1 : -1) * 2.7 * pole;
    const g = new THREE.PlaneGeometry(0.25, 2.2);
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.atan2(T.ty[i], T.tx[i]));
    const p = V(T.x[i] + T.nx[i] * d, T.y[i] + T.ny[i] * d, T.h[i] + 0.012);
    g.translate(p.x, p.y, p.z);
    gridGeos.push(g);
  }
  root.add(new THREE.Mesh(mergeGeometries(gridGeos), gridMat));

  // ---------- barriers: concrete/armco wall with sponsor boards + catch fence
  // Barriers are weathered precast concrete; sponsor banners hang on them only in stretches
  // (the pit straight, and every so often around the lap), like a real venue.
  const adTex = DT.banners();
  const adMat = new THREE.MeshStandardMaterial({ map: adTex, color: 0xd2d2d2, roughness: 0.55, side: THREE.DoubleSide });
  const barrierMat = new THREE.MeshStandardMaterial({ map: DT.barrier(), roughness: 0.92, side: THREE.DoubleSide });
  const adZone = (i) => { const s = i * T.ds; return s < 420 || s > T.length - 330 || hash2(Math.floor(s / 84), 3.7) < 0.4; };
  const contactMat = new THREE.MeshBasicMaterial({ map: DT.contactStrip(), color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const topMat = new THREE.MeshStandardMaterial({ map: TX.concrete(), roughness: 0.9 });
  const fenceTex = DT.fenceFine();
  const fenceMat = new THREE.MeshStandardMaterial({ map: fenceTex, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.3, depthWrite: false });
  const postGeos = [];
  for (const side of [1, -1]) {
    const wall = side === 1 ? T.wallL : T.wallR;
    // vertical wall face
    const wf = ribbonWall(T, (i) => side * wall[i], 0, 1.05, side === 1 ? 60 : -60, 1, adZone);
    root.add(Object.assign(new THREE.Mesh(wf, adMat), { castShadow: true, receiveShadow: true }));
    const wc = ribbonWall(T, (i) => side * wall[i], 0, 1.05, side === 1 ? 8 : -8, 1, (i) => !adZone(i));
    root.add(Object.assign(new THREE.Mesh(wc, barrierMat), { castShadow: true, receiveShadow: true }));
    // soft contact shadow where the barrier meets the ground
    const cs = ribbon(T, { d0: (i) => side * (wall[i] - 0.02), d1: (i) => side * (wall[i] - 1.5), y: () => 0.012 });
    root.add(Object.assign(new THREE.Mesh(cs, contactMat), { renderOrder: 1 }));
    const wt = ribbon(T, { d0: (i) => side * wall[i], d1: (i) => side * (wall[i] + 0.5), y: () => 1.05, uScale: 1, vScale: 4 });
    root.add(Object.assign(new THREE.Mesh(wt, topMat), { receiveShadow: true }));
    // back of the barrier, carried down below ground so there is never a gap under it
    const skirt = ribbonWall(T, (i) => side * (wall[i] + 0.5), -3.4, 1.05, 6);
    root.add(Object.assign(new THREE.Mesh(skirt, new THREE.MeshStandardMaterial({ map: topMat.map, roughness: 0.95, side: THREE.DoubleSide })), { receiveShadow: true }));
    const ff = ribbonWall(T, (i) => side * (wall[i] + 0.25), 1.05, 4.2, 1, 0.25);
    root.add(Object.assign(new THREE.Mesh(ff, fenceMat), { renderOrder: 3, userData: { noAO: true } }));
    for (let i = 0; i < N; i += 5) {
      const d = side * (wall[i] + 0.3);
      const p = V(T.x[i] + T.nx[i] * d, T.y[i] + T.ny[i] * d, T.h[i]);
      const g = new THREE.CylinderGeometry(0.06, 0.06, 4.3, 5); g.translate(p.x, p.y + 2.15, p.z); postGeos.push(g);
    }
  }
  const posts = new THREE.Mesh(mergeGeometries(postGeos), new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.7, roughness: 0.4 }));
  root.add(posts);

  // tyre barriers in front of the walls around the runoff areas: stacked tyres behind a conveyor
  // belt, as one continuous wall (not separate posts)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc3 = new THREE.Vector3(1, 1, 1);
  {
    const tyreMat = new THREE.MeshStandardMaterial({ map: DT.tyreWall(), roughness: 0.85, side: THREE.DoubleSide });
    const tyreTop = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9 });
    for (const side of [1, -1]) {
      const ro = side === 1 ? T.runoffL : T.runoffR, wall = side === 1 ? T.wallL : T.wallR;
      const has = (i) => ro[i] && wall[i] > w2 + 12;
      if (![...Array(N).keys()].some(has)) continue;
      const face = ribbonWall(T, (i) => side * (wall[i] - 0.8), 0, 1.0, side === 1 ? 4.8 : -4.8, 1, has);
      root.add(Object.assign(new THREE.Mesh(face, tyreMat), { castShadow: true, receiveShadow: true }));
      const top = ribbon(T, { d0: (i) => side * (wall[i] - 0.8), d1: (i) => side * wall[i], y: () => 1.0, mask: has });
      root.add(Object.assign(new THREE.Mesh(top, tyreTop), { receiveShadow: true }));
      const cs2 = ribbon(T, { d0: (i) => side * (wall[i] - 0.82), d1: (i) => side * (wall[i] - 2.2), y: () => 0.0, mask: has });
      root.add(Object.assign(new THREE.Mesh(cs2, contactMat), { renderOrder: 1 }));
    }
  }

  // ---------- terrain
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, havg = 0;
  for (let i = 0; i < N; i++) { minx = Math.min(minx, T.x[i]); maxx = Math.max(maxx, T.x[i]); miny = Math.min(miny, T.y[i]); maxy = Math.max(maxy, T.y[i]); havg += T.h[i]; }
  havg /= N;
  const M = 900;
  const X0 = minx - M, X1 = maxx + M, Y0 = miny - M, Y1 = maxy + M;
  const spacing = 7;
  const nxv = Math.ceil((X1 - X0) / spacing), nyv = Math.ceil((Y1 - Y0) / spacing);
  const tpos = new Float32Array((nxv + 1) * (nyv + 1) * 3), tuv = new Float32Array((nxv + 1) * (nyv + 1) * 2), tcol = new Float32Array((nxv + 1) * (nyv + 1) * 3);
  const midY = (miny + maxy) / 2;
  const seaY = miny - 120; // sea to the "south"
  // the sea surface must sit below the lowest point of the circuit (and its sunk verges),
  // otherwise low-lying sections of road end up under the water plane
  let minH = 1e9;
  for (let i = 0; i < N; i++) minH = Math.min(minH, T.h[i]);
  const seaLevel = minH - 7;
  const far = (x, y) => {
    let h = havg + (fbm(x * 0.0025, y * 0.0025) - 0.45) * sc.hills * 2;
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
    const n = fbm(x * 0.01, y * 0.01);
    const v = 0.8 + n * 0.4;
    // the grass texture already carries the colour; vertex colours only add a gentle tint + variation
    const tm = Math.max(tc.r, tc.g, tc.b) * 0.8;
    let cr = (0.45 + 0.55 * tc.r / tm) * v, cg = (0.45 + 0.55 * tc.g / tm) * v, cb = (0.45 + 0.55 * tc.b / tm) * v;
    if (sc.sea && r.h < seaLevel + 1.8 && r.dist > r.wl + 6) { cr = 0.78; cg = 0.7; cb = 0.52; } // beach
    tcol[p * 3] = cr; tcol[p * 3 + 1] = cg; tcol[p * 3 + 2] = cb;
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
  const ttex = sc.sandy ? TX.sand() : TX.grass(sc.grass, sc.dry);
  const terrain = new THREE.Mesh(tg, DT.applyMacro(new THREE.MeshStandardMaterial({ map: ttex, vertexColors: true, roughness: 1 }), { scale: 0.13, amount: 0.34, tint: sc.sandy ? [1.08, 0.96, 0.82] : [1.2, 1.04, 0.7], tintAmt: 0.55 * (0.3 + sc.dry * 0.7) }));
  terrain.receiveShadow = true;
  root.add(terrain);

  if (sc.sea) {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshPhysicalMaterial({ color: 0x0f4a6e, roughness: 0.06, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = seaLevel;
    root.add(water);
  }

  // ---------- trees: painted cross-billboards (alpha-tested, cast real shadows)
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  {
    const kinds = [...new Set(sc.kinds)];
    const spots = Object.fromEntries(kinds.map((k) => [k, []]));
    let placed = 0, tries = 0;
    const dense = sc.kinds[0] === 'pine';
    while (placed < sc.count && tries < sc.count * 30) {
      tries++;
      const x = X0 + 200 + rnd() * (X1 - X0 - 400), y = Y0 + 200 + rnd() * (Y1 - Y0 - 400);
      const r = heightAt(x, y);
      if (r.dist < r.wl + 9) continue;
      if (!dense && r.dist > 500 && rnd() < 0.85) continue;
      if (sc.sea && r.h < seaLevel + 3) continue;
      if (fbm(x * 0.006 + 7, y * 0.006) < (dense ? 0.36 : 0.47)) continue; // clumps and clearings
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

  // ---------- grandstands (start straight + slowest corners), pit building, gantry, bridge
  const standMat = new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.7, metalness: 0.2 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5, metalness: 0.3 });
  const crowdTex = crowdTexture(16);
  const crowdMat = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 1 });
  const stands = [];
  const pitSide = T.pit ? T.pit.side : T.runoffL[0] ? -1 : (T.wallL[0] <= T.wallR[0] ? 1 : -1);
  stands.push({ i: 0, side: -pitSide, len: 260 });
  // slow corners
  const prof = opts.profile;
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
  for (const st of stands) {
    const wall = st.side === 1 ? T.wallL : T.wallR;
    const g = new THREE.Group();
    const i = st.i;
    const rows = 16, rowD = 0.85, rowH = 0.48;
    const base = wall[i] + 6;
    const pos0 = V(T.x[i] + T.nx[i] * st.side * base, T.y[i] + T.ny[i] * st.side * base, T.h[i]);
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
      const front = new THREE.Mesh(new THREE.BoxGeometry(st.len, y0, 0.3), standMat); front.position.set(0, y0 / 2, out * 0.1); g.add(front);
      const back = new THREE.Mesh(new THREE.BoxGeometry(st.len, y1 + 1.2, 0.4), standMat); back.position.set(0, (y1 + 1.2) / 2, out * (depth + 0.2)); back.castShadow = true; g.add(back);
      for (const sx of [-1, 1]) {
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.Float32BufferAttribute([sx * L, 0, 0, sx * L, y0, 0, sx * L, y1, out * depth, sx * L, 0, out * depth], 3));
        sg.setIndex([0, 1, 2, 0, 2, 3]); sg.computeVertexNormals();
        const sm = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.8, side: THREE.DoubleSide })); g.add(sm);
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

  // sponsor bridge over the second DRS straight (or mid-lap)
  {
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
        board.position.copy(V(T.x[k] + T.nx[k] * d, T.y[k] + T.ny[k] * d, T.h[k] + 1.4));
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
          pp.set(T.rl.x[j], T.h[j] + 0.045, -T.rl.y[j]);
          ee.set(0, Math.atan2(T.rl.y[j2] - T.rl.y[j], T.rl.x[j2] - T.rl.x[j]), Math.atan(T.grade[j]));
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

  // ---------- sky dressing: a cloud deck and a ring of distant hills for depth
  {
    const [cover, cr, cg2, cb] = time.cloud;
    const ct = cloudTexture(cover);
    ct.repeat.set(3, 3);
    const clouds = new THREE.Mesh(new THREE.PlaneGeometry(26000, 26000), new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, color: new THREE.Color(cr, cg2, cb) }));
    clouds.rotation.x = Math.PI / 2;
    clouds.position.set((minx + maxx) / 2, havg + 1500, -(miny + maxy) / 2);
    clouds.renderOrder = -1;
    root.add(clouds);
    const SEG = 160, R0 = Math.max(maxx - minx, maxy - miny) / 2 + 3600;
    const pos = [], idx = [];
    for (let k = 0; k <= SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      const cx = (minx + maxx) / 2 + Math.cos(a) * R0, cy = (miny + maxy) / 2 + Math.sin(a) * R0;
      let hgt = 90 + fbm(Math.cos(a) * 2.2 + 5, Math.sin(a) * 2.2 + 9) * 520 + fbm(Math.cos(a) * 9, Math.sin(a) * 9) * 110;
      if (sc.sea) hgt *= THREE.MathUtils.smoothstep(Math.sin(a), -0.55, 0.1); // open sea to the south
      if (sc.sandy) hgt *= 0.55;
      pos.push(cx, havg - 60, -cy, cx, havg + hgt, -cy);
      if (k < SEG) { const o = k * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    }
    // aerial perspective: ridges fade into the haze toward their base, and a nearer, darker
    // ridge in front gives the distance some layers
    const hazeC = new THREE.Color(time.fog), topC = new THREE.Color(time.mount);
    const ridge = (posArr, scaleR, scaleH, mixTop, mixBase) => {
      const g2 = new THREE.BufferGeometry();
      const cxm = (minx + maxx) / 2, czm = -(miny + maxy) / 2;
      const pa = new Float32Array(posArr.length), ca = new Float32Array(posArr.length);
      const cT = topC.clone().lerp(hazeC, mixTop), cB = topC.clone().lerp(hazeC, mixBase);
      for (let k = 0; k < posArr.length; k += 3) {
        const top = (k / 3) % 2 === 1;
        pa[k] = cxm + (posArr[k] - cxm) * scaleR; pa[k + 2] = czm + (posArr[k + 2] - czm) * scaleR;
        pa[k + 1] = top ? havg + (posArr[k + 1] - havg) * scaleH : posArr[k + 1];
        const c3 = top ? cT : cB; ca[k] = c3.r; ca[k + 1] = c3.g; ca[k + 2] = c3.b;
      }
      g2.setAttribute('position', new THREE.BufferAttribute(pa, 3)); g2.setAttribute('color', new THREE.BufferAttribute(ca, 3)); g2.setIndex(idx);
      root.add(new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false })));
    };
    ridge(pos, 1, 1, 0.55, 0.92);
    ridge(pos.map((v, k) => (k % 3 === 1 && (k / 3 | 0) % 2 === 1 ? havg + (v - havg) * (0.45 + 0.4 * fbm(k * 0.013, 4.2)) : v)), 0.62, 1, 0.3, 0.8);
  }

  return {
    root, sun, sky, gantry, line, envRT, hemi,
    // road-type materials, for weather.js to soak when it rains
    surfaces: { track: trackMat, run: runMat, kerb: kerbMat, line: lineMat, gravel: gravelMat, verge: vergeMat },
    weather: null,
    // call once everything else has been added under root (pit lane, markers): opts { wet, effects }
    startWeather(opts) { this.weather = buildWeather(scene, this, T, opts); return this.weather; },
    setLights(n, out) {
      gantry.userData.lamps.forEach((mats, k) => mats.forEach((m) => { m.emissiveIntensity = !out && k < n ? 6 : 0; }));
    },
    followSun(target) {
      sun.position.copy(target).addScaledVector(sunDir, 400);
      sun.target.position.copy(target);
    },
    dispose() {
      scene.remove(root); scene.remove(sky); scene.remove(sun); scene.remove(sun.target); scene.remove(hemi);
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          for (const k of ['map', 'normalMap', 'roughnessMap', 'alphaMap', 'emissiveMap']) if (m[k]) m[k].dispose();
          m.dispose();
        }
      });
      sun.shadow.map?.dispose();
      envRT.dispose(); pmrem.dispose();
    },
  };
}

function ribbonWall(T, dFn, y0, y1, uLen, vRepeat = 1, mask = null) {
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
    pos.push(x, T.h[i] + y0, -y, x, T.h[i] + y1, -y);
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
