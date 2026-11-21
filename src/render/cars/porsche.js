// Rear-engined GT3 coupe in the shape of the 992-generation 911 GT3 R.
import { makeBody, batches, box, ellipsoid, rod, slab, plate, wing, both, rimGeometry, lerp } from './kit.js';

export function porsche(vehicle, quality = 1) {
  const a = 1.46, b = 1.05;              // axle positions from the physics model
  const nose = a + 0.97, tail = -b - 0.93;
  const cowl = 0.98, header = 0.26, roofEnd = -0.62, deck = -1.56; // cabin stations
  const body = makeBody({
    x0: tail, x1: nose, axles: [a, -b], archR: 0.405, wellIn: 0.6, floor: 0.065,
    nose: { L: 0.26, p: 2.2, sweep: 0.3, pow: 2.3, len: 0.75 },
    tail: { L: 0.16, p: 3.4, sweep: 0.1, pow: 2.6, len: 0.45 },
    // plan outline: swollen front arches, a waist at the doors, the widest point over the rear wheels
    w: [[tail, 0.965], [-b - 0.45, 1.005], [-b, 1.02], [-b + 0.5, 0.985], [0.15, 0.93], [a - 0.55, 0.955], [a, 0.995], [a + 0.45, 0.985], [nose, 0.93]],
    wLip: [[tail, 0.95], [-b, 1.012], [0.15, 0.925], [a, 0.99], [nose, 0.915]],
    sill: [[tail, 0.2], [-b - 0.5, 0.17], [-b, 0.12], [a, 0.12], [a + 0.5, 0.11], [nose, 0.085]],
    sideY: [[tail, 0.5], [-b, 0.56], [0.2, 0.5], [a, 0.55], [nose, 0.36]],
    // fender line: front wings stand proud of the bonnet, rear haunches rise to the engine lid
    shZ: [[tail, 0.8], [-b - 0.4, 0.86], [-b, 0.86], [-0.3, 0.84], [0.5, 0.86], [a, 0.8], [a + 0.5, 0.74], [nose, 0.7]],
    shY: [[tail, 0.8], [-b - 0.5, 0.9], [-b, 0.935], [-b + 0.55, 0.9], [0.2, 0.845], [cowl, 0.815], [a, 0.805], [a + 0.45, 0.755], [a + 0.75, 0.63], [nose, 0.4]],
    // base of the glasshouse, falling away into the bonnet valley ahead of the screen
    inZ: [[tail, 0.6], [deck, 0.66], [-b, 0.72], [-0.2, 0.745], [cowl - 0.1, 0.73], [cowl + 0.2, 0.6], [a, 0.52], [nose, 0.46]],
    inY: [[tail, 0.81], [deck, 0.9], [-b, 0.93], [-0.3, 0.885], [0.5, 0.85], [cowl, 0.8, 'c'], [a, 0.74], [a + 0.5, 0.65], [a + 0.8, 0.5], [nose, 0.37]],
    // roof rail: A-pillar up from the cowl, over the doors, then the long fastback fall
    railZ: [[tail, 0.34], [deck, 0.44], [roofEnd, 0.53], [header, 0.56], [cowl, 0.655, 'c'], [a, 0.3], [nose, 0.26]],
    railY: [[tail, 0.815], [deck, 0.91, 'c'], [-1.25, 1.0], [roofEnd, 1.2], [-0.2, 1.255], [header, 1.225, 'c'], [cowl, 0.8, 'c'], [a, 0.75], [a + 0.5, 0.655], [a + 0.8, 0.505], [nose, 0.37]],
    top: [[tail, 0.82], [deck, 0.915, 'c'], [-1.25, 1.01], [roofEnd, 1.235], [-0.15, 1.285], [header, 1.255, 'c'], [cowl, 0.81, 'c'], [a, 0.75], [a + 0.5, 0.66], [a + 0.8, 0.51], [nose, 0.375]],
    round: { side: 1, sh: [[tail, 0.75], [0, 0.55], [cowl, 0.7], [nose, 0.9]], in: [[tail, 0.5], [deck, 0.35], [cowl, 0.3], [cowl + 0.3, 0.9], [nose, 1]], rail: [[tail, 1], [deck, 0.75], [header, 0.6], [cowl, 0.8], [nose, 1]] },
    stations: [cowl, header, roofEnd, deck],
  }, quality);

  const add = batches(['paint', 'trim', 'carbon', 'glass', 'lamps', 'rear', 'black', 'chrome']);
  add.paint(body.skin);
  add.black(body.under);
  const V = (from, to, t) => body.v(from, to, t);

  // ---- glass: screen, side windows, rear window, each with a black surround
  const screen = { x: [(t) => lerp(cowl - 0.035, cowl - 0.035, t), (t) => header + 0.03], v: [V('rail', 'top', 0.1), body.far(V('rail', 'top', 0.1))] };
  add.black(body.rect({ x: [cowl + 0.01, header - 0.01], v: [V('rail', 'top', -0.12), body.far(V('rail', 'top', -0.12))], ns: 14, nt: 22, lift: 0.0015, mirror: false }));
  add.glass(body.rect({ ...screen, ns: 14, nt: 22, lift: 0.004, mirror: false }));
  // side glass: from the A-pillar back to a rising rear quarter
  const sideWin = (grow, lift) => body.patch({ ns: 22, nt: 8, lift, at: (s, t) => {
    const x = lerp(cowl - 0.2 + grow, roofEnd - 0.38 - grow, s);
    const lo = lerp(0.16, 0.34, smooth(s, 0.62, 1)) - grow * 0.6, hi = 0.9 + grow * 0.6;
    return [x, V('in', 'rail', lerp(lo, hi, t))];
  } });
  add.black(sideWin(0.03, 0.0015));
  add.glass(sideWin(0, 0.004));
  add.black(body.rect({ x: [roofEnd - 0.06, deck + 0.1], v: [V('rail', 'top', -0.1), body.far(V('rail', 'top', -0.1))], ns: 12, nt: 18, lift: 0.0015, mirror: false }));
  add.glass(body.rect({ x: [roofEnd - 0.1, deck + 0.14], v: [V('rail', 'top', 0.12), body.far(V('rail', 'top', 0.12))], ns: 12, nt: 18, lift: 0.004, mirror: false }));
  // sun strip across the top of the screen in the team's second colour
  add.trim(body.rect({ x: [header + 0.12, header + 0.035], v: [V('rail', 'top', 0.1), body.far(V('rail', 'top', 0.1))], ns: 3, nt: 22, lift: 0.006, mirror: false }));

  // ---- nose: centre intake, outer brake ducts, round lamps on the wing tops
  const face = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.noseX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 8, nt: 14, lift: 0.004, ...extra });
  add.black(face(0.07, 0.64, V('in', 'rail', 0.1), body.far(V('in', 'rail', 0.1)), { mirror: false, nt: 26 }));
  add.black(face(0.1, 0.6, V('side', 'sh', 0.25), V('sh', 'in', 0.72)));
  for (let k = 1; k <= 3; k++) add.carbon(face(0.07 + k * 0.14, 0.07 + k * 0.14 + 0.02, V('in', 'rail', 0.12), body.far(V('in', 'rail', 0.12)), { mirror: false, nt: 26, lift: 0.007, ns: 1 }));
  add.trim(face(0.7, 0.74, V('side', 'sh', 0.3), body.far(V('side', 'sh', 0.3)), { mirror: false, nt: 40, lift: 0.005, ns: 1 })); // pinstripe over the intakes
  const lampX = a + 0.5, lampV = V('sh', 'in', 0.1);
  const lamp = (r, lift) => body.patch({ ns: 10, nt: 10, lift, at: (s, t) => {
    const ang = t * Math.PI * 2, rr = r * s;
    return [lampX + rr * 1.25 * Math.cos(ang), lampV + (rr / 0.05) * Math.sin(ang) * 1.05];
  } });
  add.glass(lamp(0.125, 0.004));
  for (const [dx, dv] of [[0.045, 0.85], [0.045, -0.85], [-0.05, 0.85], [-0.05, -0.85]]) {
    add.lamps(body.patch({ ns: 4, nt: 8, lift: 0.007, at: (s, t) => [lampX + dx + 0.027 * s * Math.cos(t * 6.283), lampV + dv + 0.5 * s * Math.sin(t * 6.283)] }));
  }
  // bonnet: twin outlet ducts and a centre crease line
  add.black(body.rect({ x: [a + 0.33, a + 0.06], v: [V('rail', 'top', -0.2), V('rail', 'top', 0.72)], ns: 6, nt: 6, lift: 0.004 }));
  for (let k = 0; k < 3; k++) add.carbon(body.rect({ x: [a + 0.29 - k * 0.085, a + 0.265 - k * 0.085], v: [V('rail', 'top', -0.2), V('rail', 'top', 0.72)], ns: 1, nt: 6, lift: 0.008 }));
  // louvres over the front wheels
  for (let k = 0; k < 5; k++) add.black(body.rect({ x: [a + 0.2 - k * 0.085, a + 0.155 - k * 0.085], v: [V('side', 'sh', 0.82), V('sh', 'in', 0.1)], ns: 1, nt: 5, lift: 0.004 }));

  // ---- flanks: door shut lines, rear-arch intake, sill
  const doorF = cowl - 0.02, doorR = -0.36;
  add.black(body.line([[doorF, V('side', 'sh', -0.75)], [doorF, V('sh', 'in', 0.55)]], 0.007));
  add.black(body.line([[doorR, V('side', 'sh', -0.75)], [doorR - 0.03, V('sh', 'in', 0.55)]], 0.007));
  add.black(body.line([[doorF, V('side', 'sh', -0.75)], [doorR, V('side', 'sh', -0.75)]], 0.007));
  add.black(body.patch({ ns: 8, nt: 6, lift: 0.004, at: (s, t) => [lerp(-b + 0.78, -b + 0.5, s), V('side', 'sh', lerp(-0.35 + 0.25 * s, 0.45 - 0.12 * s, t))] }));
  // sweeping accent along the lower door, rising over the rear arch
  add.trim(body.patch({ ns: 26, nt: 2, lift: 0.0045, at: (s, t) => {
    const x = lerp(a - 0.5, tail + 0.12, s), base = -0.62 + 1.05 * s * s;
    return [x, V('side', 'sh', base + t * (0.05 + 0.22 * s))];
  } }));

  // ---- tail: full-width light bar, lower grille, twin centre exhausts
  const rearFace = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.tailX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 4, nt: 20, lift: 0.004, mirror: false, ...extra });
  add.rear(rearFace(0.8, 0.9, V('sh', 'in', -0.6), body.far(V('sh', 'in', -0.6)), { nt: 34, lift: 0.006 }));
  add.black(rearFace(0.76, 0.94, V('sh', 'in', -0.75), body.far(V('sh', 'in', -0.75)), { nt: 34 }));
  add.black(rearFace(0.05, 0.44, V('sh', 'in', -0.35), body.far(V('sh', 'in', -0.35)), { nt: 30, ns: 6 }));
  // open bumper corners behind the rear wheels
  add.black(body.patch({ ns: 6, nt: 5, lift: 0.004, at: (s, t) => [lerp(-b - 0.47, tail + 0.14, s), V('side', 'sh', lerp(-0.7, -0.05 - 0.25 * s, t))] }));
  for (const z of [-0.085, 0.085]) add.chrome(new (CylinderLike())(0.055, 0.06, 0.12, 14, 1, true).rotateZ(Math.PI / 2).translate(tail + 0.02, 0.33, z));
  // engine-lid slats under the rear window
  for (let k = 0; k < 5; k++) add.black(body.rect({ x: [deck - 0.03 - k * 0.062, deck - 0.065 - k * 0.062], v: [V('rail', 'top', -0.6), body.far(V('rail', 'top', -0.6))], ns: 1, nt: 14, lift: 0.004, mirror: false }));

  // ---- aero: splitter, dive planes, skirts, diffuser, swan-neck wing
  const outline = [];
  for (let i = 0; i <= 12; i++) { const z = -0.97 + (1.94 * i) / 12; outline.push([nose + 0.1 - 0.34 * Math.abs(z / 0.97) ** 2.3, z]); }
  add.carbon(plate([...outline, [a + 0.42, 0.985], [a + 0.42, -0.985]], 0.022, 0.058));
  for (const g of both(slab([[nose - 0.56, 0.25], [nose - 0.27, 0.2], [nose - 0.27, 0.212], [nose - 0.56, 0.265]], 0.16, 0.93))) add.carbon(g);
  for (const g of both(slab([[nose - 0.6, 0.39], [nose - 0.33, 0.32], [nose - 0.33, 0.332], [nose - 0.6, 0.405]], 0.14, 0.94))) add.carbon(g);
  for (const g of both(box((a - b) / 2, 0.095, 0.955, a + b - 0.84, 0.06, 0.1))) add.carbon(g);
  add.carbon(box(tail + 0.2, 0.2, 0, 0.5, 0.012, 1.5, 0.2));
  for (let i = -3; i <= 3; i++) add.carbon(slab([[tail - 0.06, 0.33], [tail + 0.5, 0.07], [tail + 0.5, 0.2], [tail - 0.06, 0.36]], 0.012, i * 0.21));
  const wingX = tail - 0.06, wingY = 1.19;
  add.carbon(wing(wingX, wingY, 1.86, 0.38, { angle: 0.2, camber: 0.08 }));
  add.trim(wing(wingX - 0.01, wingY + 0.045, 1.86, 0.075, { angle: 0.75, camber: 0.02, thick: 0.3 })); // gurney
  for (const g of both(slab([[wingX + 0.05, wingY - 0.12], [wingX - 0.4, wingY - 0.12], [wingX - 0.44, wingY - 0.02], [wingX - 0.4, wingY + 0.07], [wingX + 0.05, wingY + 0.1]], 0.012, 0.935))) add.paint(g);
  for (const g of both(slab([[wingX - 0.02, wingY + 0.09], [wingX - 0.2, wingY + 0.1], [wingX - 0.3, wingY + 0.02], [-b - 0.42, 0.88], [-b - 0.2, 0.86], [wingX - 0.2, wingY - 0.03], [wingX - 0.03, wingY + 0.04]], 0.016, 0.33))) add.carbon(g);

  // ---- furniture: mirrors, wiper, roof hatch, antenna, tow loops
  const mirrorX = cowl - 0.18, mirrorY = 0.99;
  for (const g of both(ellipsoid(mirrorX + 0.03, mirrorY, 0.95, 0.085, 0.052, 0.1))) add.paint(g);
  for (const g of both(rod([mirrorX + 0.02, mirrorY - 0.03, 0.9], [mirrorX + 0.06, 0.875, 0.76], 0.014))) add.black(g);
  add.black(rod([cowl - 0.02, 0.83, 0.02], [cowl - 0.33, 1.02, 0.3], 0.007));
  add.black(rod([-0.5, 1.27, 0.2], [-0.56, 1.42, 0.2], 0.004));
  add.trim(box(nose - 0.01, 0.3, 0.42, 0.05, 0.05, 0.016), box(tail + 0.0, 0.42, -0.5, 0.05, 0.05, 0.016));

  return {
    geometry: add.done(), rim: rimGeometry(),
    eye: [0.2, 1.03, -0.36], roofHeight: 1.285, mirrorX, mirrorY, door: [0.32, 0.5, body.width(0.32) + 0.012],
  };
}

function smooth(x, a, b) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
import { CylinderGeometry } from 'three';
function CylinderLike() { return CylinderGeometry; }
