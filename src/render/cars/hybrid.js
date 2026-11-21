// Closed-cockpit Le Mans hybrid prototype in the shape of the Cadillac V-Series.R.
// Real car: about 5.1 m long, 2.0 m wide, 1.06 m high.
//
// Two lofts and loose parts:
//   deck   the full-width lower body: slab-sided fenders and sidepods with flat tops, and
//          between them a low floor, so there is an open channel either side of the tub.
//          It has no kit wheel arches (those would lift the channel floor over each axle);
//          the arches are round openings cut in the fender sides instead.
//   tub    the narrow centre section: nose, bubble canopy and engine cover.
// plus roof scoop, shark fin, wing, splitter and diffuser.
import * as THREE from 'three';
import { makeBody, batches, box, rod, tube, disc, slab, plate, wing, both, plain, rimGeometry, mirrorHousing, cockpit, quadRegion, lerp, clamp } from './kit.js';

// Smooth tube through closed rings of [x, y, z] points (same count each), open at both ends.
function ringLoft(rings) {
  const nr = rings.length, nc = rings[0].length, pos = [], idx = [];
  for (const ring of rings) for (const p of ring) pos.push(...p);
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc; j++) {
    const a = i * nc + j, b = i * nc + ((j + 1) % nc), c = a + nc, e = b + nc;
    idx.push(a, c, b, b, c, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // face outward from the tube's own axis
  const mid = rings[nr >> 1], cy = mid.reduce((s, p) => s + p[1], 0) / nc, k = (nr >> 1) * nc, n = g.attributes.normal;
  if ((mid[0][1] - cy) * n.getY(k) + mid[0][2] * n.getZ(k) < 0) {
    const ix = g.index.array;
    for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
    g.computeVertexNormals();
  }
  return plain(g);
}

export function hybrid(vehicle, quality = 1) {
  const a = 1.68, b = 1.46;                       // axle positions from the physics model
  const nose = a + 0.98, tail = -b - 0.94;
  const R = 0.386;                                // wheel-arch radius (tyre is 0.36)
  const fT = 0.79, rT = 0.815, podT = 0.6;        // front fender, rear fender and sidepod tops
  const podF = a - 0.62, podR = -b + 0.72;        // where the sidepod runs between the fenders

  // ------------------------------------------------------------------ deck
  const deckSpec = {
    x0: tail, x1: nose, axles: [], floor: 0.055,
    nose: { L: 0.34, p: 3.2, sweep: 0.16, pow: 3, len: 0.7 },
    tail: { L: 0.07, p: 2.2, sweep: 0.05, pow: 3, len: 0.3 },
    samples: { side: 8, sh: 4, in: 4, rail: 4 },
    // Between the wheels the flank is waisted in plan and undercut: a near-upright panel from the
    // shoulder down to a knee (`side`), then tucked hard inboard to the floor, whose edge is left
    // standing proud as a shelf. Over the wheels `side` just sits mid-wall to give the slab some rows.
    w: [[tail, 0.985], [-b, 1.012], [-b + 0.45, 1.0], [podR + 0.25, 0.955], [0.2, 0.94], [podF - 0.25, 0.955], [a - 0.45, 0.99], [a, 1.006], [a + 0.5, 0.995], [nose, 0.96]],
    wLip: [[tail, 0.98], [-b, 1.006], [-b + 0.42, 1.0], [podR + 0.18, 0.74], [podF - 0.18, 0.74], [a - 0.42, 1.0], [a, 1.0], [nose, 0.95]],
    sill: [[tail, 0.3], [-b - 0.5, 0.2], [-b - 0.38, 0.11], [a + 0.5, 0.11], [nose, 0.075]],
    sideY: [[tail, 0.52], [-b - 0.4, 0.4], [-b, 0.34], [-b + 0.45, 0.3], [podR + 0.18, 0.29], [podF - 0.18, 0.29], [a - 0.45, 0.3], [a, 0.32], [nose, 0.26]],
    // outer top corner of the fender / sidepod
    shZ: [[tail, 0.975], [-b, 1.002], [-b + 0.45, 0.99], [podR + 0.25, 0.95], [0.2, 0.935], [podF - 0.25, 0.95], [a - 0.45, 0.98], [a, 0.996], [a + 0.5, 0.985], [nose, 0.95]],
    shY: [[tail, rT - 0.07], [-b - 0.3, rT - 0.03], [-b, rT - 0.02], [-b + 0.45, rT - 0.07], [podR, podT + 0.0], [podF, podT - 0.02], [a - 0.5, 0.62, 'c'], [a - 0.42, fT - 0.04], [a, fT - 0.02], [a + 0.4, fT - 0.05], [nose, 0.5]],
    // inner top corner
    inZ: [[tail, 0.66], [-b, 0.62], [-b + 0.5, 0.6], [podR, 0.52], [podF, 0.5], [a - 0.48, 0.62, 'c'], [a, 0.63], [a + 0.5, 0.66], [nose, 0.7]],
    inY: [[tail, rT - 0.04], [-b - 0.3, rT], [-b, rT], [-b + 0.45, rT - 0.06], [podR, podT + 0.02], [podF, podT], [a - 0.5, 0.64, 'c'], [a - 0.42, fT], [a, fT], [a + 0.4, fT - 0.03], [nose, 0.52]],
    // foot of the inner wall; from there the channel floor falls gently to the centreline under the tub
    railZ: [[tail, 0.6], [-b, 0.56], [-b + 0.5, 0.53], [podR, 0.47], [podF, 0.46], [a - 0.46, 0.56, 'c'], [a, 0.57], [a + 0.5, 0.6], [nose, 0.64]],
    railY: [[tail, 0.4], [-b, 0.42], [-b + 0.6, 0.4], [podR, 0.36], [podF, 0.33], [a - 0.45, 0.26], [a, 0.235], [a + 0.5, 0.2], [nose, 0.16]],
    top: [[tail, 0.39], [-b, 0.4], [-b + 0.7, 0.2], [-0.6, 0.13], [a - 0.3, 0.13], [a, 0.2], [nose, 0.15]],
    round: { side: [[tail, 1], [-b + 0.45, 1], [podR + 0.18, 0.4], [podF - 0.18, 0.4], [a - 0.45, 1], [nose, 1]], sh: 0.3, in: 0.34, rail: 0.3 },
    stations: [podF, podR, a - 0.5, a - 0.42],
  };
  const flat = makeBody(deckSpec, quality); // same surface without openings: used to measure heights
  const yAt = (x, v) => flat.point(x, v).y;
  function deckOpenings({ v, top }) {
    const mid = (v0) => [v0, 2 * top - v0];
    const arch = (ax) => (X, V) => (V > v('side', 'sh', 0.92) ? -1 : R - Math.hypot(X - ax, yAt(X, V) - 0.36));
    return {
      archF: arch(a), archR: arch(-b),
      // whole rear end between the fenders: tail face and the back of the deck
      rear: quadRegion({ x: [tail - 0.05, tail + 0.4], v: mid(v('in', 'rail', 0.75)), r: 0.02 }),
      // radiator inlet in the step where the front fender drops to the sidepod
      inlet: quadRegion({ x: [a - 0.6, a - 0.44], v: [v('sh', 'in', 0.12), v('in', 'rail', 0.25)], r: 0.02 }),
      // front fender top louvres and the outlet behind the front wheel
      louvre: quadRegion({ x: [a - 0.2, a + 0.24], v: [v('sh', 'in', 0.3), v('sh', 'in', 0.8)], r: 0.02 }),
      exit: quadRegion({ x: [(t) => a - 0.52 - 0.02 * t, (t) => a - 0.43], v: [v('lip', 'side', 0.7), v('side', 'sh', 0.55)], r: 0.02 }),
      // light blades: tall slots in the leading face of each fender, and in the tail corners
      blade: quadRegion({ x: [(t) => deckX(0.9), (t) => deckX(0.22)], v: [v('sh', 'in', 0.3), v('sh', 'in', 0.62)], r: 0.008 }),
      tailBlade: quadRegion({ x: [tail - 0.05, tail + 0.05], v: [v('sh', 'in', -0.1), v('sh', 'in', 0.28)], r: 0.008 }),
      // cooling outlet on top of the rear fender
      rearVent: quadRegion({ x: [-b - 0.15, -b + 0.22], v: [v('sh', 'in', 0.3), v('sh', 'in', 0.78)], r: 0.02 }),
    };
  }
  const deckX = (h) => flat.noseX(h);
  const deck = makeBody({ ...deckSpec, holes: (s) => Object.values(deckOpenings(s)) }, quality);
  const D = deckOpenings({ v: deck.v, top: deck.top });
  const DV = (from, to, t) => deck.v(from, to, t);

  // ------------------------------------------------------------------ tub
  const cowl = 1.06, header = 0.26, roofEnd = -0.5, tubTail = tail + 0.2, tubNose = nose + 0.02;
  const tub = makeBody({
    x0: tubTail, x1: tubNose, axles: [], floor: 0.06,
    nose: { L: 0.1, p: 1.5, sweep: 0.07, pow: 3, len: 0.5 },
    tail: { L: 0.12, p: 2.4, sweep: 0.0, pow: 2, len: 0.3 },
    samples: { side: 5, sh: 4, in: 5, rail: 7 },
    w: [[tubTail, 0.2], [-b, 0.3], [-0.95, 0.42], [roofEnd, 0.48], [cowl, 0.48], [a, 0.46], [a + 0.5, 0.52], [tubNose, 0.57]],
    wLip: [[tubTail, 0.18], [-b, 0.28], [-0.95, 0.4], [cowl, 0.44], [a + 0.5, 0.5], [tubNose, 0.56]],
    sill: 0.1,
    sideY: [[tubTail, 0.45], [-b, 0.45], [-0.9, 0.42], [cowl, 0.4], [a, 0.3], [a + 0.5, 0.2], [tubNose, 0.135]],
    shZ: [[tubTail, 0.19], [-b, 0.29], [-0.95, 0.41], [roofEnd, 0.47], [cowl, 0.47], [a, 0.44], [a + 0.5, 0.5], [tubNose, 0.55]],
    shY: [[tubTail, 0.56], [-b, 0.6], [-0.9, 0.6], [roofEnd, 0.6], [cowl, 0.56], [a, 0.42], [a + 0.5, 0.27], [tubNose, 0.165]],
    inZ: [[tubTail, 0.15], [-b, 0.24], [-0.95, 0.35], [roofEnd, 0.43], [cowl - 0.1, 0.44], [cowl + 0.25, 0.37], [a, 0.36], [tubNose, 0.46]],
    inY: [[tubTail, 0.6], [-b, 0.67], [-0.9, 0.66], [roofEnd, 0.65], [cowl, 0.6, 'c'], [a, 0.455], [a + 0.5, 0.29], [tubNose, 0.175]],
    railZ: [[tubTail, 0.08], [-b, 0.13], [-0.95, 0.22], [roofEnd, 0.29], [header, 0.33], [cowl, 0.38, 'c'], [a, 0.2], [tubNose, 0.24]],
    railY: [[tubTail, 0.64], [-b, 0.74], [-0.95, 0.85], [roofEnd, 0.965], [-0.1, 0.99], [header, 0.955, 'c'], [cowl, 0.605, 'c'], [a, 0.465], [a + 0.5, 0.3], [tubNose, 0.18]],
    top: [[tubTail, 0.65], [-b, 0.76], [-0.95, 0.89], [roofEnd, 1.0], [-0.08, 1.025], [header, 0.99, 'c'], [cowl, 0.615, 'c'], [a, 0.475], [a + 0.5, 0.305], [tubNose, 0.185]],
    round: { side: 0.9, sh: 0.6, in: [[tubTail, 0.8], [roofEnd, 0.4], [cowl, 0.35], [cowl + 0.3, 0.9], [tubNose, 1]], rail: [[tubTail, 1], [roofEnd, 0.85], [header, 0.8], [cowl, 0.9], [tubNose, 1]] },
    stations: [cowl, header, roofEnd],
    holes: (s) => Object.values(tubOpenings(s)),
  }, quality);
  function tubOpenings({ v, top }) {
    const mid = (v0) => [v0, 2 * top - v0];
    return {
      // screen wraps well round the corners; a thin pillar, then a small side window
      screen: quadRegion({ x: [header + 0.03, cowl - 0.04], v: mid(v('rail', 'top', -0.78)), r: 0.05 }),
      side: quadRegion({ x: [(t) => lerp(roofEnd + 0.08, roofEnd + 0.2, t), (t) => lerp(cowl - 0.24, header + 0.02, t)], v: [v('in', 'rail', 0.14), v('in', 'rail', 0.46)], r: 0.035 }),
    };
  }
  const T = tubOpenings({ v: tub.v, top: tub.top });
  const TV = (from, to, t) => tub.v(from, to, t);
  const across = (b0, v0) => [v0, b0.far(v0)];

  const add = batches(['paint', 'trim', 'carbon', 'lamps', 'rear', 'black', 'chrome', 'window', 'lens', 'liner', 'metal', 'suit']);
  add.paint(deck.skin, tub.skin);
  add.black(deck.under, tub.under);
  add.liner(deck.liner, tub.liner);

  // ---- canopy glazing
  const glaze = (d, area, mirror = true) => {
    add.window(tub.region(d, { ...area, band: [-0.008, Infinity], lift: 0.0015, mirror }));
    add.black(tub.region(d, { ...area, band: [-0.014, 0.004], lift: 0.003, mirror, cell: 0.02 }));
  };
  glaze(T.screen, { x: [header - 0.03, cowl + 0.03], v: across(tub, TV('in', 'rail', 0.1)) }, false);
  glaze(T.side, { x: [roofEnd - 0.02, cowl - 0.12], v: [TV('in', 'rail', 0), TV('in', 'rail', 0.7)] });
  add.trim(tub.rect({ x: [header + 0.12, header + 0.035], v: across(tub, TV('rail', 'top', -0.5)), ns: 2, nt: 26, lift: 0.004, mirror: false })); // sun strip

  // ---- cabin
  const eye = [0.2, 0.83, -0.12], steer = [eye[0] + 0.42, eye[1] - 0.235, eye[2]];
  const cab = cockpit({ seat: [eye[0] - 0.06, 0.16, eye[2]], wheel: steer, cabin: { x0: roofEnd - 0.02, x1: 0.74, w: 0.4, roof: 0.985, floor: 0.085, dash: 0.59 } });
  // the kit's cage is laid out for a long saloon roof: drop the bars that would poke through this
  // short canopy's screen and run a pair along the pillars instead
  const inCanopy = (g) => { g.computeBoundingBox(); return !(g.boundingBox.max.x > 0.3 && g.boundingBox.max.y > 0.75); };
  add.black(cab.black); add.carbon(cab.carbon); add.metal(cab.metal.filter(inCanopy)); add.suit(cab.suit);
  for (const s of [-1, 1]) add.metal(tube([[0.77, 0.58, s * 0.365], [header + 0.06, 0.915, s * 0.285], [-0.2, 0.955, s * 0.3]], 0.016, 6));

  // ---- channels and floor are bare carbon
  add.carbon(deck.rect({ x: [-b + 0.6, nose - 0.02], v: [DV('in', 'rail', 0.85), DV('rail', 'top', 0.55)], ns: 50, nt: 6, lift: 0.005 }));
  // behind the cockpit everything between the rear fenders is bare carbon: inner walls and deck
  add.carbon(deck.rect({ x: [tail + 0.005, -b + 0.6], v: [DV('in', 'rail', 0.1), DV('rail', 'top', 0.7)], ns: 24, nt: 12, lift: 0.004 }));

  // ---- nose: sharp leading edge, slim intake across the tub nose, keel splitter
  const tubFace = (h0, h1, v0, v1, extra = {}) => tub.patch({ at: (s, t) => [tub.noseX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 4, nt: 24, lift: 0.004, mirror: false, ...extra });
  add.black(tubFace(0.22, 0.7, ...across(tub, TV('side', 'sh', 0.1)), { nt: 34 }));
  add.carbon(tubFace(0.44, 0.48, ...across(tub, TV('side', 'sh', 0.12)), { ns: 1, nt: 34, lift: 0.008 }));
  for (let k = -5; k <= 5; k++) add.carbon(tubFace(0.23, 0.69, tub.top + k * 2.6 - 0.1, tub.top + k * 2.6 + 0.1, { nt: 1, ns: 4, lift: 0.008 }));
  add.trim(tubFace(0.8, 0.88, ...across(tub, TV('side', 'sh', 0.0)), { ns: 1, nt: 34, lift: 0.005 }));
  add.black(tub.line([[a + 0.62, tub.top], [cowl + 0.08, tub.top]], 0.006, { mirror: false }));                // nose centre seam
  add.black(tub.line([[a + 0.3, TV('sh', 'in', 0.5)], [a + 0.3, tub.far(TV('sh', 'in', 0.5))]], 0.006, { mirror: false })); // nose-box joint
  const lead = [];
  for (let i = 0; i <= 14; i++) { const z = -0.99 + (1.98 * i) / 14; lead.push([nose + 0.09 - 0.2 * Math.abs(z / 0.99) ** 3, z]); }
  add.carbon(plate([...lead, [a + 0.45, 1.0], [a + 0.45, -1.0]], 0.018, 0.04));
  for (const g of both(slab([[nose + 0.02, 0.058], [a + 0.5, 0.058], [a + 0.5, 0.16], [nose - 0.2, 0.13]], 0.012, 0.995))) add.carbon(g);       // splitter end fences
  for (const z of [0.2, 0.42]) for (const g of both(slab([[nose + 0.05, 0.058], [a + 0.45, 0.058], [a + 0.45, 0.2], [nose - 0.1, 0.11]], 0.01, z))) add.carbon(g); // strakes under the nose

  // ---- front fenders: light blades, louvres, wheel-wake exit, inlet to the sidepod
  const bladeArea = { x: [deckX(0.96), deckX(0.16)], v: [DV('sh', 'in', 0.1), DV('sh', 'in', 0.82)] };
  add.carbon(deck.region(D.blade, { ...bladeArea, band: [-0.006, Infinity], lift: -0.03, cell: 0.012 }));
  add.lens(deck.region(D.blade, { ...bladeArea, band: [-0.003, Infinity], lift: 0.001, cell: 0.012 }));
  add.chrome(deck.region(D.blade, { ...bladeArea, band: [-0.01, 0.003], lift: 0.003, cell: 0.008 }));
  add.lamps(deck.patch({ ns: 14, nt: 1, lift: -0.018, at: (s, t) => [deckX(lerp(0.86, 0.27, s)), DV('sh', 'in', lerp(0.4, 0.52, t))] }));
  for (let k = 0; k < 6; k++) add.carbon(deck.rect({ x: [a + 0.2 - k * 0.07, a + 0.165 - k * 0.07], v: [DV('sh', 'in', 0.3), DV('sh', 'in', 0.8)], ns: 1, nt: 4, lift: -0.012 }));
  for (const d of [D.louvre, D.rearVent, D.inlet, D.exit]) add.carbon(deck.region(d, { x: [tail, nose], v: [DV('lip', 'side', 0.3), DV('in', 'rail', 0.4)], band: [-0.012, 0.004], lift: 0.003, cell: 0.014 }));
  for (let k = 0; k < 5; k++) add.carbon(deck.rect({ x: [-b + 0.18 - k * 0.07, -b + 0.145 - k * 0.07], v: [DV('sh', 'in', 0.3), DV('sh', 'in', 0.78)], ns: 1, nt: 4, lift: -0.012 }));
  for (const s of [-1, 1]) {
    // radiator core and vanes seen through the sidepod inlet
    add.carbon(box(a - 0.64, 0.48, s * 0.74, 0.02, 0.26, 0.44, 0.5));
    for (let k = 0; k < 4; k++) add.black(box(a - 0.56, 0.42 + k * 0.07, s * 0.74, 0.14, 0.008, 0.44, 0.35));
  }
  // dive planes on the outer corners of the nose
  for (const [y0, len] of [[0.2, 0.26], [0.34, 0.22]]) for (const g of both(slab([[nose - 0.34 - len, y0 + 0.08], [nose - 0.36, y0], [nose - 0.36, y0 + 0.012], [nose - 0.34 - len, y0 + 0.094]], 0.12, 0.985))) add.carbon(g);

  // ---- flanks: shut lines, sidepod undercut shadow line, number panel edge
  // the floor edge stands proud of the undercut as a carbon shelf with a turned-up lip
  for (const s of [-1, 1]) {
    add.carbon(plate([[podF - 0.12, s * 0.74], [podF - 0.02, s * 1.0], [podR + 0.02, s * 1.0], [podR + 0.12, s * 0.74]], 0.014, 0.108));
    add.carbon(box((podF + podR) / 2, 0.13, s * 0.995, podF - podR - 0.1, 0.035, 0.01));
  }
  const low = DV('lip', 'side', 0.3), hi = DV('side', 'sh', 0.85);
  add.black(deck.line([[podF - 0.05, low], [podF - 0.05, hi]], 0.006));
  add.black(deck.line([[podR + 0.1, low], [podR + 0.1, hi]], 0.006));
  add.black(deck.line([[a + 0.42, low], [a + 0.47, hi]], 0.005));
  add.black(deck.line([[-b - 0.42, low], [-b - 0.46, hi]], 0.005));

  // ---- engine cover: roof scoop, shark fin, cover vents
  const scoop = [], roofY = (x) => tub.point(x, tub.top).y;
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, x = lerp(0.1, -1.25, t), rz = lerp(0.16, 0.1, t ** 0.7), ry = lerp(0.105, 0.012, t ** 0.75), cy = roofY(x) + ry * 0.5 - 0.004;
    const ring = [];
    for (let j = 0; j < 16; j++) { // flattened underneath so it sits into the roof and melts into the cover
      const th = (j / 16) * Math.PI * 2, sn = Math.sin(th), cs = Math.cos(th);
      ring.push([x + (i === 0 ? 0.05 * sn : 0), cy + ry * (sn > 0 ? sn : sn * 0.5), rz * Math.sign(cs) * Math.abs(cs) ** 0.8]);
    }
    scoop.push(ring);
  }
  const scoopG = ringLoft(scoop);
  add.paint(scoopG); add.liner(scoopG.clone());
  add.paint(tube([...scoop[0], scoop[0][0]], 0.013, 6));                                           // rounded intake lip
  add.black(box(-0.12, roofY(-0.12) + 0.05, 0, 0.01, 0.12, 0.22));                                 // filter face deep inside
  add.carbon(box(0.0, roofY(0) + 0.05, 0, 0.16, 0.1, 0.008));                                      // splitter vane in the mouth
  // shark fin: curved spine from the scoop to the wing, cut away underneath ahead of the wing
  const finTop = (x) => 1.0 + 0.085 * Math.sin(Math.PI * clamp((-0.75 - x) / (-0.75 - (tail + 0.15)), 0, 1) ** 0.75) ** 0.8 * 0.9 + 0.02;
  const fin = [];
  for (let i = 0; i <= 14; i++) { const x = lerp(-0.75, tail + 0.15, i / 14); fin.push([x, finTop(x)]); }
  fin.push([tail + 0.15, 0.93], [tail + 0.5, 0.95], [-b - 0.1, 0.86], [-b + 0.12, 0.7], [-b + 0.3, 0.6], [-0.95, 0.8]);
  add.paint(slab(fin, 0.02, 0, 0.004));
  for (let k = 0; k < 4; k++) add.black(tub.rect({ x: [-0.75 - k * 0.09, -0.79 - k * 0.09], v: [TV('in', 'rail', 0.5), TV('rail', 'top', 0.4)], ns: 1, nt: 5, lift: 0.004 }));
  add.black(tub.line([[roofEnd - 0.05, TV('side', 'sh', 0.5)], [roofEnd - 0.08, TV('rail', 'top', 0.9)]], 0.006));

  // ---- rear fenders, wing and endplates
  const wingX = tail + 0.02, wingY = 1.0;
  add.carbon(wing(wingX, wingY, 1.9, 0.36, { angle: 0.16, camber: 0.09 }));
  add.carbon(wing(wingX + 0.03, wingY + 0.075, 1.9, 0.14, { angle: 0.5, camber: 0.08 }));
  add.trim(box(wingX + 0.004, wingY + 0.145, 0, 0.012, 0.035, 1.9));                                // gurney
  for (const s of [-1, 1]) {
    // endplate: swept leading edge, notched trailing edge, foot running forward into the fender top
    add.paint(slab([[tail - 0.08, rT - 0.2], [-b - 0.3, rT - 0.06], [-b - 0.42, rT + 0.02], [-b - 0.62, wingY + 0.02], [-b - 0.56, wingY + 0.13], [tail + 0.0, wingY + 0.19], [tail - 0.07, wingY + 0.08], [tail - 0.03, wingY - 0.02], [tail - 0.11, wingY - 0.12]], 0.014, s * 0.968, 0.003));
    for (let k = 0; k < 4; k++) for (const o of [-0.009, 0.009]) add.black(box(-b - 0.5 + k * 0.035 + 0.1, wingY + 0.07 - k * 0.012, s * 0.968 + o, 0.2 - k * 0.02, 0.012, 0.003, 0.12));
    add.trim(box(tail - 0.03, wingY + 0.14, s * 0.968, 0.012, 0.1, 0.02));                         // endplate marker strip
    // swan-neck mount: up from the crash structure, over the wing, down onto its top face
    add.carbon(slab([[tail + 0.52, 0.5], [tail + 0.42, 0.9], [tail + 0.34, wingY + 0.17], [tail + 0.14, wingY + 0.2], [tail + 0.08, wingY + 0.09], [tail + 0.16, wingY + 0.1], [tail + 0.3, wingY + 0.1], [tail + 0.36, 0.88], [tail + 0.42, 0.5]], 0.014, s * 0.2, 0.003));
  }
  // ---- open tail: diffuser tunnels, crash structure, gearbox, exhausts, light blades
  const tailArea = { x: [tail - 0.02, tail + 0.03], v: [DV('sh', 'in', -0.3), DV('sh', 'in', 0.5)] };
  add.rear(deck.region(D.tailBlade, { ...tailArea, band: [-0.004, Infinity], lift: -0.012, cell: 0.008 }));
  add.lens(deck.region(D.tailBlade, { ...tailArea, band: [-0.002, Infinity], lift: 0.001, cell: 0.008 }));
  for (const s of [-1, 1]) add.rear(box(tail - 0.004, 0.54, s * 0.9, 0.012, 0.4, 0.03));
  add.black(box(tail + 0.3, 0.19, 0, 0.75, 0.012, 1.3, 0.2));                                                   // diffuser roof
  for (let i = -4; i <= 4; i++) add.carbon(slab([[tail - 0.05, 0.3], [tail + 0.6, 0.055], [tail + 0.6, 0.14], [tail - 0.05, 0.34]], 0.012, i * 0.15));
  add.carbon(box(tail + 0.2, 0.36, 0, 0.5, 0.14, 0.2), box(tail + 0.42, 0.42, 0, 0.3, 0.22, 0.34));
  // the tip of the engine cover inside the open tail is bare carbon too
  add.carbon(tub.rect({ x: [tubTail + 0.002, -b - 0.32], v: [TV('lip', 'side', 0.1), tub.far(TV('lip', 'side', 0.1))], ns: 10, nt: 40, lift: 0.004, mirror: false }));               // crash box, gearbox
  add.rear(box(tail - 0.04, 0.36, 0, 0.02, 0.07, 0.1));                                                           // rain light
  for (const s of [-1, 1]) {
    add.metal(...tube([[tail + 0.5, 0.42, s * 0.16], [tail + 0.3, 0.5, s * 0.36], [tail + 0.2, 0.52, s * 0.52]], 0.014, 6)); // wishbones seen through the tail
    add.chrome(disc(tail + 0.12, 0.6, s * 0.2, 0.05, 0.22, 16, true));
    add.black(disc(tail + 0.16, 0.6, s * 0.2, 0.046, 0.02));
    add.carbon(box(tail + 0.01, 0.37, s * 0.63, 0.02, 0.2, 0.012));                                                // tail edge fences
  }
  add.carbon(box(tail + 0.0, 0.425, 0, 0.03, 0.02, 1.22));                                                         // rear crossbeam

  // ---- furniture: mirrors on the fender shoulders, wiper, antenna, tow loops
  const mirrorX = a - 0.5, mirrorY = 0.865, mirrorZ = 0.82;
  const housing = mirrorHousing(mirrorX, mirrorY, mirrorZ);
  for (const g of housing.shell.flatMap(both)) add.paint(g);
  for (const g of housing.back.flatMap(both)) add.black(g);
  for (const g of both(slab([[mirrorX + 0.02, mirrorY - 0.04], [mirrorX + 0.07, mirrorY - 0.04], [mirrorX + 0.13, fT - 0.02], [mirrorX + 0.05, fT - 0.02]], 0.014, mirrorZ))) add.carbon(g);
  add.black(tube([[cowl + 0.01, 0.62, 0.0], [cowl - 0.36, 0.8, 0.0], [cowl - 0.42, 0.83, 0.0]], 0.006, 5));
  add.black(rod([-0.3, 0.98, 0.22], [-0.37, 1.15, 0.22], 0.004, 5));
  add.trim(box(nose - 0.0, 0.13, 0.5, 0.04, 0.045, 0.014), box(tail + 0.0, 0.47, -0.4, 0.04, 0.05, 0.014));

  return {
    geometry: add.done(), rim: rimGeometry(),
    eye, roofHeight: 1.03, pod: [header - 0.04, 1.085, 0], mirrorX, mirrorY, mirrorZ, door: [0.15, 0.43, deck.width(0.15) + 0.012],
  };
}
