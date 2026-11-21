// Mid-engined GT3 supercar in the shape of the McLaren 720S GT3: cab-forward teardrop
// glasshouse, low short nose with dark "eye socket" lamp recesses, deep intakes behind the doors.
import { CylinderGeometry } from 'three';
import { makeBody, batches, box, ellipsoid, rod, slab, plate, wing, both, rimGeometry, lerp, smoothstep } from './kit.js';

export function mclaren(vehicle, quality = 1) {
  const a = 1.52, b = 1.18;              // axle positions from the physics model
  const nose = a + 1.0, tail = -b - 0.9;
  const cowl = 1.14, header = 0.4, roofEnd = -0.42, deck = -1.5; // cabin stations
  const body = makeBody({
    x0: tail, x1: nose, axles: [a, -b], archR: 0.405, wellIn: 0.6, floor: 0.06,
    nose: { L: 0.34, p: 1.9, sweep: 0.42, pow: 2.0, len: 0.9 },
    tail: { L: 0.14, p: 3.2, sweep: 0.12, pow: 2.4, len: 0.5 },
    // plan outline: narrow nose, pinched waist, widest over the rear wheels, tapering tail
    w: [[tail, 0.93], [-b - 0.45, 0.995], [-b, 1.02], [-b + 0.55, 0.985], [0.25, 0.915], [a - 0.5, 0.945], [a, 0.995], [a + 0.45, 0.965], [nose, 0.86]],
    wLip: [[tail, 0.915], [-b, 1.012], [0.25, 0.91], [a, 0.99], [nose, 0.85]],
    sill: [[tail, 0.14], [-b - 0.5, 0.13], [-b, 0.115], [a, 0.115], [a + 0.5, 0.1], [nose, 0.08]],
    sideY: [[tail, 0.55], [-b, 0.56], [0.25, 0.44], [a, 0.52], [nose, 0.27]],
    // fender line: low front wings, a dip through the doors, then tall rear haunches
    shZ: [[tail, 0.76], [-b - 0.4, 0.85], [-b, 0.87], [-0.2, 0.86], [0.6, 0.865], [a, 0.81], [a + 0.5, 0.72], [nose, 0.6]],
    shY: [[tail, 0.87], [-b - 0.45, 0.905], [-b, 0.92], [-b + 0.6, 0.865], [0.25, 0.77], [cowl, 0.775], [a, 0.798], [a + 0.4, 0.725], [a + 0.72, 0.51], [nose, 0.27]],
    inZ: [[tail, 0.5], [deck, 0.56], [-b, 0.64], [-0.3, 0.73], [cowl - 0.1, 0.725], [cowl + 0.18, 0.63], [a, 0.5], [nose, 0.38]],
    inY: [[tail, 0.875], [deck, 0.9], [-b, 0.9], [-0.3, 0.81], [0.5, 0.765], [cowl, 0.73, 'c'], [a, 0.69], [a + 0.4, 0.6], [a + 0.72, 0.41], [nose, 0.24]],
    // roof rail: steep screen, a short roof, then the long teardrop fall to the tail
    railZ: [[tail, 0.26], [deck, 0.33], [-1.0, 0.42], [roofEnd, 0.5], [header, 0.54], [cowl, 0.65, 'c'], [a, 0.3], [nose, 0.22]],
    railY: [[tail, 0.88], [deck, 0.915, 'c'], [-1.05, 0.985], [roofEnd, 1.105], [-0.02, 1.145], [header, 1.115, 'c'], [cowl, 0.735, 'c'], [a, 0.695], [a + 0.4, 0.605], [a + 0.72, 0.415], [nose, 0.24]],
    top: [[tail, 0.885], [deck, 0.92, 'c'], [-1.05, 0.995], [roofEnd, 1.135], [0, 1.17], [header, 1.14, 'c'], [cowl, 0.745, 'c'], [a, 0.7], [a + 0.4, 0.61], [a + 0.72, 0.42], [nose, 0.245]],
    round: { side: 1, sh: [[tail, 0.7], [-b, 0.6], [0.2, 0.5], [cowl, 0.7], [nose, 0.95]], in: [[tail, 0.6], [deck, 0.4], [cowl, 0.3], [cowl + 0.3, 0.9], [nose, 1]], rail: [[tail, 1], [deck, 0.8], [header, 0.65], [cowl, 0.8], [nose, 1]] },
    stations: [cowl, header, roofEnd, deck],
  }, quality);

  const add = batches(['paint', 'trim', 'carbon', 'glass', 'lamps', 'rear', 'black', 'chrome']);
  add.paint(body.skin);
  add.black(body.under);
  const V = (from, to, t) => body.v(from, to, t);
  const far = (v) => body.far(v);
  const across = (v0, x, extra = {}) => body.rect({ x, v: [v0, far(v0)], mirror: false, nt: 22, ...extra });

  // ---- glass: wraparound screen running into the side glass, teardrop rear window
  add.black(across(V('rail', 'top', -0.14), [cowl + 0.015, header - 0.01], { ns: 14, lift: 0.0015 }));
  add.glass(across(V('rail', 'top', 0.08), [cowl - 0.03, header + 0.03], { ns: 14, lift: 0.004 }));
  const sideWin = (grow, lift) => body.patch({ ns: 24, nt: 8, lift, at: (s, t) => {
    const x = lerp(cowl - 0.16 + grow, roofEnd - 0.5 - grow, s);
    const lo = lerp(0.14, 0.5, smoothstep(s, 0.55, 1)) - grow * 0.6, hi = 0.9 + grow * 0.6;
    return [x, V('in', 'rail', lerp(lo, hi, t))];
  } });
  add.black(sideWin(0.03, 0.0015));
  add.glass(sideWin(0, 0.004));
  // glazed roof panels and the long rear screen over the engine
  add.black(across(V('rail', 'top', -0.05), [roofEnd - 0.04, deck + 0.06], { ns: 14, lift: 0.0015 }));
  add.glass(across(V('rail', 'top', 0.14), [roofEnd - 0.08, deck + 0.34], { ns: 10, lift: 0.004 }));
  for (let k = 0; k < 4; k++) add.carbon(across(V('rail', 'top', 0.2), [deck + 0.3 - k * 0.07, deck + 0.265 - k * 0.07], { ns: 1, nt: 14, lift: 0.006 }));
  add.trim(across(V('rail', 'top', 0.08), [header + 0.11, header + 0.035], { ns: 3, lift: 0.006 }));
  // roof scoop feeding the engine
  add.carbon(slab([[0.02, 1.165], [-0.38, 1.13], [-0.42, 1.175], [-0.1, 1.215], [0.0, 1.205]], 0.17, 0, 0.02));
  add.black(box(0.012, 1.186, 0, 0.012, 0.03, 0.12));

  // ---- nose: wide low intake, eye-socket recesses sweeping back up the wings
  const face = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.noseX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 8, nt: 14, lift: 0.004, ...extra });
  add.black(face(0.06, 0.6, V('sh', 'in', 0.75), far(V('sh', 'in', 0.75)), { mirror: false, nt: 30 }));
  for (let k = 1; k <= 2; k++) add.carbon(face(0.06 + k * 0.15, 0.08 + k * 0.15, V('sh', 'in', 0.78), far(V('sh', 'in', 0.78)), { mirror: false, nt: 30, lift: 0.007, ns: 1 }));
  add.trim(face(0.66, 0.7, V('sh', 'in', 0.7), far(V('sh', 'in', 0.7)), { mirror: false, nt: 30, lift: 0.005, ns: 1 }));
  // the socket: a dark teardrop from the bumper corner to a point on the wing top
  const socket = (grow, lift) => body.patch({ ns: 18, nt: 8, lift, at: (s, t) => {
    const x = lerp(nose - 0.13 + grow, a + 0.1 - grow, s);
    const half = (2.7 + grow * 6) * Math.sin(Math.PI * Math.min(1, s * 1.25) ** 0.7) * (1 - 0.75 * s);
    const mid = lerp(V('side', 'sh', 0.9), V('sh', 'in', 0.25), s);
    return [x, mid + (t - 0.5) * 2 * half];
  } });
  add.black(socket(0, 0.004));
  add.lamps(body.patch({ ns: 10, nt: 2, lift: 0.007, at: (s, t) => {
    const x = lerp(nose - 0.3, a + 0.38, s), mid = lerp(V('side', 'sh', 1.05), V('sh', 'in', 0.22), s);
    return [x, mid + 0.5 + (t - 0.5) * 0.5];
  } }));
  add.lamps(body.patch({ ns: 4, nt: 3, lift: 0.007, at: (s, t) => [lerp(nose - 0.3, nose - 0.36, s), V('side', 'sh', lerp(0.75, 1.15, t))] }));
  // bonnet: twin radiator exits
  add.black(body.patch({ ns: 8, nt: 6, lift: 0.004, at: (s, t) => [lerp(a + 0.42, a + 0.02, s), V('rail', 'top', lerp(-0.9 + 0.3 * s, 0.55, t))] }));
  for (let k = 0; k < 3; k++) add.carbon(body.rect({ x: [a + 0.33 - k * 0.1, a + 0.3 - k * 0.1], v: [V('rail', 'top', -0.65), V('rail', 'top', 0.55)], ns: 1, nt: 6, lift: 0.008 }));
  for (let k = 0; k < 5; k++) add.black(body.rect({ x: [a + 0.18 - k * 0.08, a + 0.14 - k * 0.08], v: [V('side', 'sh', 0.85), V('sh', 'in', 0.12)], ns: 1, nt: 5, lift: 0.004 }));

  // ---- flanks: door lines, the deep intake behind the door, lower accent
  const doorF = cowl - 0.1, doorR = -0.3;
  add.black(body.line([[doorF, V('side', 'sh', -0.8)], [doorF + 0.06, V('sh', 'in', 0.5)]], 0.007));
  add.black(body.line([[doorR, V('side', 'sh', -0.8)], [doorR - 0.06, V('sh', 'in', 0.5)]], 0.007));
  add.black(body.line([[doorF, V('side', 'sh', -0.8)], [doorR, V('side', 'sh', -0.8)]], 0.007));
  const intake = (grow, lift) => body.patch({ ns: 12, nt: 8, lift, at: (s, t) => {
    const x = lerp(-0.2 + grow, -b + 0.42 - grow, s);
    const lo = lerp(0.35, -0.3, s) - grow * 3, hi = lerp(0.6, 0.78, s) + grow * 3;
    return [x, V('side', 'sh', lerp(lo, hi, t))];
  } });
  add.black(intake(0, 0.004));
  add.trim(body.patch({ ns: 12, nt: 1, lift: 0.006, at: (s, t) => [lerp(-0.14, -b + 0.44, s), V('side', 'sh', lerp(0.35, -0.3, s) - 0.1 + t * 0.09)] }));
  add.trim(body.patch({ ns: 24, nt: 2, lift: 0.0045, at: (s, t) => {
    const x = lerp(a - 0.48, -0.25, s);
    return [x, V('side', 'sh', -0.7 + 0.25 * s + t * (0.04 + 0.16 * s))];
  } }));
  // top-exit duct ahead of the rear wheel
  for (let k = 0; k < 4; k++) add.black(body.rect({ x: [-b + 0.22 - k * 0.085, -b + 0.175 - k * 0.085], v: [V('sh', 'in', -0.3), V('sh', 'in', 0.55)], ns: 1, nt: 5, lift: 0.004 }));

  // air exits behind the front wheels and behind the rear wheels
  add.black(body.patch({ ns: 6, nt: 8, lift: 0.004, at: (s, t) => [lerp(a - 0.45, a - 0.6, s) - 0.1 * t, V('side', 'sh', lerp(-0.6, 0.5 - 0.5 * s, t))] }));
  add.black(body.patch({ ns: 4, nt: 8, lift: 0.004, at: (s, t) => [lerp(-b - 0.46, -b - 0.6, s) - 0.06 * t, V('side', 'sh', lerp(-0.45, 0.45 - 0.5 * s, t))] }));

  // ---- tail: open mesh panel, thin lamp blades, twin centre exhausts
  const rearFace = (h0, h1, v0, extra = {}) => body.patch({ at: (s, t) => [body.tailX(lerp(h0, h1, s)), lerp(v0, far(v0), t)], ns: 5, nt: 30, lift: 0.004, mirror: false, ...extra });
  add.black(rearFace(0.05, 0.86, V('side', 'sh', 0.5)));
  add.rear(rearFace(0.76, 0.82, V('side', 'sh', 0.62), { lift: 0.007, ns: 1 }));
  for (const side of [1, -1]) {
    const v0 = side > 0 ? V('side', 'sh', 0.62) : far(V('side', 'sh', 0.62)), v1 = side > 0 ? V('side', 'sh', 0.95) : far(V('side', 'sh', 0.95));
    add.rear(body.patch({ at: (s, t) => [body.tailX(lerp(0.45, 0.8, s)), lerp(v0, v1, t)], ns: 4, nt: 2, lift: 0.007, mirror: false }));
  }
  for (let k = 1; k <= 3; k++) add.carbon(rearFace(0.05 + k * 0.17, 0.065 + k * 0.17, V('side', 'sh', 0.7), { lift: 0.006, ns: 1 }));
  for (const z of [-0.1, 0.1]) add.chrome(new CylinderGeometry(0.06, 0.065, 0.14, 16, 1, true).rotateZ(Math.PI / 2).translate(tail + 0.03, 0.62, z));
  add.carbon(box(tail + 0.06, 0.62, 0, 0.1, 0.17, 0.42));

  // ---- aero: splitter, dive planes, skirts, diffuser, swan-neck wing
  const outline = [];
  for (let i = 0; i <= 14; i++) { const z = -0.95 + (1.9 * i) / 14; outline.push([nose + 0.11 - 0.47 * Math.abs(z / 0.95) ** 2.0, z]); }
  add.carbon(plate([...outline, [a + 0.42, 0.985], [a + 0.42, -0.985]], 0.022, 0.05));
  for (const g of both(slab([[nose - 0.72, 0.24], [nose - 0.44, 0.185], [nose - 0.44, 0.197], [nose - 0.72, 0.255]], 0.15, 0.93))) add.carbon(g);
  for (const g of both(slab([[nose - 0.76, 0.37], [nose - 0.5, 0.3], [nose - 0.5, 0.312], [nose - 0.76, 0.385]], 0.13, 0.94))) add.carbon(g);
  for (const g of both(box((a - b) / 2, 0.09, 0.95, a + b - 0.84, 0.06, 0.1))) add.carbon(g);
  add.carbon(box(tail + 0.26, 0.1, 0, 0.56, 0.012, 1.6, 0.1));
  for (let i = -2; i <= 2; i++) add.carbon(slab([[tail - 0.02, 0.13], [tail + 0.5, 0.045], [tail + 0.5, 0.12], [tail - 0.02, 0.19]], 0.012, i * 0.3));
  const wingX = tail - 0.1, wingY = 1.13;
  add.carbon(wing(wingX, wingY, 1.84, 0.4, { angle: 0.18, camber: 0.085 }));
  add.trim(wing(wingX - 0.01, wingY + 0.045, 1.84, 0.07, { angle: 0.75, camber: 0.02, thick: 0.3 }));
  for (const g of both(slab([[wingX + 0.06, wingY - 0.2], [wingX - 0.3, wingY - 0.2], [wingX - 0.46, wingY - 0.04], [wingX - 0.42, wingY + 0.08], [wingX + 0.06, wingY + 0.11]], 0.012, 0.925))) add.paint(g);
  for (const g of both(slab([[wingX - 0.03, wingY + 0.09], [wingX - 0.22, wingY + 0.105], [wingX - 0.34, wingY + 0.03], [-b - 0.5, 0.9], [-b - 0.28, 0.88], [wingX - 0.22, wingY - 0.03], [wingX - 0.04, wingY + 0.04]], 0.016, 0.3))) add.carbon(g);

  // ---- furniture: door mirrors on long stalks, wiper, antenna, tow loops
  const mirrorX = cowl - 0.3, mirrorY = 0.93;
  for (const g of both(ellipsoid(mirrorX + 0.03, mirrorY, 0.95, 0.09, 0.045, 0.1))) add.paint(g);
  for (const g of both(rod([mirrorX + 0.02, mirrorY - 0.02, 0.9], [mirrorX + 0.1, 0.8, 0.76], 0.013))) add.black(g);
  add.black(rod([cowl - 0.03, 0.765, 0.0], [cowl - 0.42, 0.985, 0.22], 0.007));
  add.black(rod([-0.7, 1.08, 0.18], [-0.77, 1.24, 0.18], 0.004));
  add.trim(box(nose - 0.06, 0.22, 0.36, 0.05, 0.05, 0.016), box(tail + 0.0, 0.3, -0.55, 0.05, 0.05, 0.016));

  return {
    geometry: add.done(), rim: rimGeometry(),
    eye: [0.32, 0.95, -0.34], roofHeight: 1.17, mirrorX, mirrorY, door: [0.42, 0.47, body.width(0.42) + 0.012],
  };
}
