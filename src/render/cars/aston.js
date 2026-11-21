// Front-engined wide-body GT: long bonnet, cabin set well back, low wide grille mouth,
// boxed arches and an upswept ducktail, in the shape of a Vantage touring-car racer.
import { CylinderGeometry } from 'three';
import { makeBody, batches, box, ellipsoid, rod, slab, plate, wing, both, rimGeometry, lerp, smoothstep } from './kit.js';

export function aston(vehicle, quality = 1) {
  const a = 1.39, b = 1.32;              // axle positions from the physics model
  const nose = a + 0.93, tail = -b - 0.9;
  const cowl = 0.5, header = -0.2, roofEnd = -1.0, deck = -1.72; // cabin stations
  const body = makeBody({
    x0: tail, x1: nose, axles: [a, -b], archR: 0.41, wellIn: 0.6, floor: 0.06,
    nose: { L: 0.3, p: 2.3, sweep: 0.26, pow: 2.6, len: 0.7 },
    tail: { L: 0.24, p: 2.6, sweep: 0.07, pow: 3, len: 0.4 },
    // plan outline: boxed arches front and rear with a deep waist at the doors
    w: [[tail, 0.98], [-b - 0.5, 1.015], [-b, 1.025], [-b + 0.48, 1.01], [-b + 0.7, 0.93], [0.0, 0.905], [a - 0.72, 0.925], [a - 0.5, 1.0], [a, 1.015], [a + 0.5, 1.0], [nose, 0.95]],
    wLip: [[tail, 0.97], [-b, 1.02], [-b + 0.7, 0.925], [a - 0.72, 0.92], [a, 1.01], [nose, 0.94]],
    sill: [[tail, 0.21], [-b - 0.5, 0.17], [-b, 0.11], [a, 0.11], [a + 0.5, 0.1], [nose, 0.08]],
    sideY: [[tail, 0.56], [-b, 0.6], [0, 0.5], [a, 0.58], [nose, 0.34]],
    // arch tops: flat and square over the wheels
    shZ: [[tail, 0.9], [-b, 0.93], [-b + 0.7, 0.86], [0, 0.85], [a - 0.7, 0.87], [a, 0.92], [a + 0.5, 0.88], [nose, 0.78]],
    shY: [[tail, 0.89], [-b - 0.45, 0.915], [-b, 0.915], [-b + 0.5, 0.9], [-b + 0.75, 0.86], [0, 0.835], [a - 0.72, 0.83], [a - 0.5, 0.84], [a, 0.84], [a + 0.42, 0.82], [a + 0.7, 0.7], [nose, 0.42]],
    // base of the glasshouse; ahead of the screen it becomes the bonnet edge inside the arch boxes
    inZ: [[tail, 0.62], [deck, 0.68], [roofEnd, 0.74], [header, 0.755], [cowl, 0.74], [cowl + 0.25, 0.7], [a, 0.68], [a + 0.5, 0.62], [nose, 0.52]],
    inY: [[tail, 0.92], [deck, 0.9], [roofEnd, 0.89], [header, 0.86], [cowl, 0.83, 'c'], [a, 0.775], [a + 0.45, 0.72], [a + 0.75, 0.6], [nose, 0.4]],
    // roof rail: raked screen, low roof, fastback down to the ducktail
    railZ: [[tail, 0.36], [deck, 0.46], [roofEnd, 0.55], [header, 0.57], [cowl, 0.66, 'c'], [a, 0.36], [nose, 0.3]],
    railY: [[tail, 0.935], [deck, 0.925, 'c'], [-1.42, 1.02], [roofEnd, 1.16], [-0.6, 1.2], [header, 1.175, 'c'], [cowl, 0.835, 'c'], [a, 0.79], [a + 0.45, 0.735], [a + 0.75, 0.61], [nose, 0.4]],
    top: [[tail, 0.945], [deck, 0.93, 'c'], [-1.42, 1.03], [roofEnd, 1.19], [-0.6, 1.23], [header, 1.205, 'c'], [cowl, 0.845, 'c'], [a, 0.8], [a + 0.45, 0.745], [a + 0.75, 0.62], [nose, 0.405]],
    round: {
      side: [[tail, 0.8], [-b, 0.55], [-b + 0.75, 1], [a - 0.75, 1], [a, 0.55], [nose, 1]],
      sh: [[tail, 0.4], [-b, 0.3], [-b + 0.75, 0.6], [a - 0.75, 0.6], [a, 0.3], [a + 0.5, 0.5], [nose, 0.9]],
      in: [[tail, 0.4], [deck, 0.35], [cowl, 0.3], [cowl + 0.3, 0.6], [nose, 1]],
      rail: [[tail, 1], [deck, 0.75], [header, 0.6], [cowl, 0.8], [nose, 1]],
    },
    stations: [cowl, header, roofEnd, deck],
  }, quality);

  const add = batches(['paint', 'trim', 'carbon', 'glass', 'lamps', 'rear', 'black', 'chrome']);
  add.paint(body.skin);
  add.black(body.under);
  const V = (from, to, t) => body.v(from, to, t);
  const across = (from, to, t) => [V(from, to, t), body.far(V(from, to, t))];

  // ---- glass with black surrounds
  add.black(body.rect({ x: [cowl + 0.01, header - 0.01], v: across('rail', 'top', -0.12), ns: 14, nt: 22, lift: 0.0015, mirror: false }));
  add.glass(body.rect({ x: [cowl - 0.035, header + 0.03], v: across('rail', 'top', 0.1), ns: 14, nt: 22, lift: 0.004, mirror: false }));
  const sideWin = (grow, lift) => body.patch({ ns: 22, nt: 8, lift, at: (s, t) => {
    const x = lerp(cowl - 0.22 + grow, roofEnd - 0.34 - grow, s);
    const lo = lerp(0.14, 0.42, smoothstep(s, 0.55, 1)) - grow * 0.6, hi = 0.9 + grow * 0.6;
    return [x, V('in', 'rail', lerp(lo, hi, t))];
  } });
  add.black(sideWin(0.03, 0.0015));
  add.glass(sideWin(0, 0.004));
  add.black(body.rect({ x: [roofEnd - 0.05, deck + 0.08], v: across('rail', 'top', -0.1), ns: 12, nt: 18, lift: 0.0015, mirror: false }));
  add.glass(body.rect({ x: [roofEnd - 0.09, deck + 0.12], v: across('rail', 'top', 0.12), ns: 12, nt: 18, lift: 0.004, mirror: false }));
  add.trim(body.rect({ x: [header + 0.12, header + 0.035], v: across('rail', 'top', 0.1), ns: 3, nt: 22, lift: 0.006, mirror: false }));

  // ---- nose: one wide low mouth with a mesh of bars, corner ducts, slim swept lamps
  const face = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.noseX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 8, nt: 14, lift: 0.004, ...extra });
  // mouth: taller in the middle, drooping at the corners
  const mouthV0 = V('sh', 'in', 0.35), mouthV1 = body.far(mouthV0);
  add.black(body.patch({ ns: 10, nt: 34, lift: 0.004, mirror: false, at: (s, t) => {
    const u = Math.abs(2 * t - 1), hi = 0.8 - 0.3 * u ** 3;
    return [body.noseX(lerp(0.06, hi, s)), lerp(mouthV0, mouthV1, t)];
  } }));
  for (let k = 1; k <= 4; k++) add.carbon(body.patch({ ns: 1, nt: 34, lift: 0.007, mirror: false, at: (s, t) => {
    const u = Math.abs(2 * t - 1), hi = 0.8 - 0.3 * u ** 3, h = 0.06 + (hi - 0.06) * (k / 5);
    return [body.noseX(h + s * 0.02), lerp(mouthV0 + 0.1, mouthV1 - 0.1, t)];
  } }));
  for (const f of [0.14, 0.26, 0.38, 0.62, 0.74, 0.86]) add.carbon(body.patch({ ns: 8, nt: 1, lift: 0.007, mirror: false, at: (s, t) => {
    const v = lerp(mouthV0, mouthV1, f) + (t - 0.5) * 0.12, u = Math.abs(2 * f - 1);
    return [body.noseX(lerp(0.07, 0.78 - 0.3 * u ** 3, s)), v];
  } }));
  add.trim(body.patch({ ns: 1, nt: 34, lift: 0.006, mirror: false, at: (s, t) => { // accent lip round the top of the mouth
    const u = Math.abs(2 * t - 1), hi = 0.8 - 0.3 * u ** 3;
    return [body.noseX(hi + 0.02 + s * 0.035), lerp(mouthV0 - 0.15, mouthV1 + 0.15, t)];
  } }));
  add.black(face(0.1, 0.5, V('side', 'sh', 0.2), V('sh', 'in', 0.12))); // corner brake ducts
  // slim lamps swept back along the wing tops
  const lampAt = (s, t, grow) => [lerp(a + 0.74 + grow, a + 0.44 - grow, s), V('sh', 'in', lerp(0.02 - grow * 2, lerp(0.5, 0.26, s) + grow * 2, t))];
  add.glass(body.patch({ ns: 8, nt: 4, lift: 0.004, at: (s, t) => lampAt(s, t, 0.012) }));
  add.lamps(body.patch({ ns: 8, nt: 2, lift: 0.007, at: (s, t) => { const [x, v] = lampAt(s, 0.3 + t * 0.4, 0); return [lerp(x, a + 0.6, 0.12), v]; } }));

  // ---- bonnet: twin nostril vents, big outlet behind, centre spine
  for (const side of [0.12, 0.62]) {
    add.black(body.rect({ x: [a + 0.32, a - 0.02], v: [V('rail', 'top', side), V('rail', 'top', side + 0.26)], ns: 6, nt: 3, lift: 0.004 }));
  }
  add.black(body.rect({ x: [a - 0.25, a - 0.6], v: [V('in', 'rail', 0.35), V('rail', 'top', 0.55)], ns: 6, nt: 6, lift: 0.004 }));
  for (let k = 0; k < 4; k++) add.carbon(body.rect({ x: [a - 0.3 - k * 0.075, a - 0.325 - k * 0.075], v: [V('in', 'rail', 0.35), V('rail', 'top', 0.55)], ns: 1, nt: 6, lift: 0.008 }));
  add.trim(body.rect({ x: [a + 0.72, cowl + 0.06], v: across('rail', 'top', 0.9), ns: 16, nt: 2, lift: 0.0045, mirror: false })); // centre stripe
  // louvres on top of the front arch boxes
  for (let k = 0; k < 6; k++) add.black(body.rect({ x: [a + 0.24 - k * 0.085, a + 0.195 - k * 0.085], v: [V('side', 'sh', 0.9), V('sh', 'in', 0.4)], ns: 1, nt: 5, lift: 0.004 }));

  // ---- flanks: cut-outs behind both arches, door lines, side exhaust, accent blade
  add.black(body.patch({ ns: 6, nt: 8, lift: 0.004, at: (s, t) => [lerp(a - 0.435, a - 0.6 + 0.1 * t, s), V('side', 'sh', lerp(-0.85, 0.45, t))] }));
  add.black(body.patch({ ns: 6, nt: 8, lift: 0.004, at: (s, t) => [lerp(-b - 0.44, -b - 0.58 + 0.06 * t, s), V('side', 'sh', lerp(-0.55, 0.3, t))] }));
  add.black(body.patch({ ns: 6, nt: 5, lift: 0.004, at: (s, t) => [lerp(-b + 0.76, -b + 0.5, s), V('side', 'sh', lerp(-0.1 + 0.2 * s, 0.6 - 0.1 * s, t))] })); // rear brake intake
  const doorF = cowl - 0.05, doorR = -0.62, doorLo = V('side', 'sh', -0.8), doorHi = V('sh', 'in', 0.7);
  add.black(body.line([[doorF, doorLo], [doorF, doorHi]], 0.007));
  add.black(body.line([[doorR, doorLo], [doorR - 0.03, doorHi]], 0.007));
  add.black(body.line([[doorF, doorLo], [doorR, doorLo]], 0.007));
  add.trim(body.patch({ ns: 24, nt: 2, lift: 0.0045, at: (s, t) => { // blade rising from the front cut-out to the rear arch
    const x = lerp(a - 0.62, -b + 0.5, s);
    return [x, V('side', 'sh', -0.75 + 0.75 * s + t * (0.22 - 0.14 * s))];
  } }));
  for (const g of both(new CylinderGeometry(0.045, 0.045, 0.1, 12).rotateX(Math.PI / 2).translate(0.2, 0.16, 0.9))) add.chrome(g);

  // ---- tail: slim full-width light under the ducktail, mesh panel, centre fog light
  const rearFace = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.tailX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 4, nt: 30, lift: 0.004, mirror: false, ...extra });
  add.black(rearFace(0.7, 0.86, ...across('side', 'sh', 0.75)));
  add.rear(body.patch({ ns: 2, nt: 36, lift: 0.006, mirror: false, at: (s, t) => { // light blade, dipping in the centre
    const u = Math.abs(2 * t - 1), h = 0.75 + 0.05 * u * u;
    return [body.tailX(h + s * 0.045), lerp(...across('side', 'sh', 0.85), t)];
  } }));
  add.black(rearFace(0.04, 0.4, ...across('side', 'sh', 0.3), { ns: 6 }));
  for (let k = 1; k <= 3; k++) add.carbon(rearFace(0.04 + k * 0.09, 0.04 + k * 0.09 + 0.018, ...across('side', 'sh', 0.32), { ns: 1, lift: 0.007 }));
  add.black(rearFace(0.44, 0.62, V('side', 'sh', -0.2), V('side', 'sh', 0.62), { mirror: true, nt: 6 })); // corner outlets behind the wheels
  add.rear(box(tail + 0.012, 0.3, 0, 0.02, 0.05, 0.14)); // rain lights in the diffuser
  add.trim(body.rect({ x: [tail + 0.2, tail + 0.14], v: across('side', 'sh', 0.95), ns: 1, nt: 36, lift: 0.005, mirror: false })); // ducktail edge

  // ---- aero: deep splitter, dive planes, skirts, diffuser, tall wing on swan necks
  const outline = [];
  for (let i = 0; i <= 12; i++) { const z = -1.0 + (2.0 * i) / 12; outline.push([nose + 0.14 - 0.32 * Math.abs(z) ** 2.6, z]); }
  add.carbon(plate([...outline, [a + 0.42, 1.01], [a + 0.42, -1.01]], 0.022, 0.05));
  for (const g of both(slab([[nose - 0.14, 0.05], [nose - 0.14, 0.2], [nose - 0.4, 0.26], [nose - 0.4, 0.05]], 0.012, 1.0))) add.carbon(g); // splitter end fences
  for (const g of both(slab([[nose - 0.58, 0.27], [nose - 0.3, 0.2], [nose - 0.3, 0.212], [nose - 0.58, 0.285]], 0.17, 0.95))) add.carbon(g);
  for (const g of both(slab([[nose - 0.62, 0.43], [nose - 0.36, 0.34], [nose - 0.36, 0.352], [nose - 0.62, 0.445]], 0.15, 0.96))) add.carbon(g);
  for (const g of both(box((a - b) / 2, 0.085, 0.95, a + b - 0.86, 0.06, 0.14))) add.carbon(g);
  add.carbon(box(tail + 0.22, 0.2, 0, 0.56, 0.012, 1.7, 0.22));
  for (let i = -4; i <= 4; i++) add.carbon(slab([[tail - 0.1, 0.36], [tail + 0.5, 0.06], [tail + 0.5, 0.2], [tail - 0.1, 0.4]], 0.012, i * 0.19));
  const wingX = tail - 0.12, wingY = 1.22;
  add.carbon(wing(wingX, wingY, 1.9, 0.4, { angle: 0.22, camber: 0.09 }));
  add.carbon(wing(wingX + 0.03, wingY + 0.075, 1.9, 0.17, { angle: 0.5, camber: 0.08 })); // second element
  add.trim(wing(wingX + 0.02, wingY + 0.15, 1.9, 0.06, { angle: 0.9, camber: 0.02, thick: 0.3 }));
  for (const g of both(slab([[wingX + 0.07, wingY - 0.12], [wingX - 0.4, wingY - 0.12], [wingX - 0.45, wingY - 0.02], [wingX - 0.38, wingY + 0.1], [wingX + 0.07, wingY + 0.17]], 0.012, 0.955))) add.paint(g);
  for (const g of both(slab([[wingX - 0.03, wingY + 0.1], [wingX - 0.22, wingY + 0.11], [wingX - 0.33, wingY + 0.02], [-b - 0.5, 0.92], [-b - 0.3, 0.9], [wingX - 0.2, wingY - 0.03], [wingX - 0.04, wingY + 0.04]], 0.016, 0.32))) add.carbon(g);

  // ---- furniture
  const mirrorX = cowl - 0.2, mirrorY = 0.98;
  for (const g of both(ellipsoid(mirrorX + 0.03, mirrorY, 0.95, 0.085, 0.05, 0.1))) add.paint(g);
  for (const g of both(rod([mirrorX + 0.02, mirrorY - 0.03, 0.9], [mirrorX + 0.05, 0.88, 0.77], 0.014))) add.black(g);
  add.black(rod([cowl - 0.02, 0.86, 0.02], [cowl - 0.3, 1.02, 0.3], 0.007));
  add.black(rod([-0.9, 1.21, 0.2], [-0.96, 1.36, 0.2], 0.004));
  add.trim(box(nose - 0.02, 0.2, 0.3, 0.05, 0.05, 0.016), box(tail, 0.3, -0.5, 0.05, 0.05, 0.016));

  return {
    geometry: add.done(), rim: rimGeometry(),
    eye: [-0.3, 0.98, -0.36], roofHeight: 1.23, mirrorX, mirrorY, door: [-0.08, 0.52, body.width(-0.08) + 0.012],
  };
}
