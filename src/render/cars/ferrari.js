// Mid-engined GT3 coupe in the shape of the Ferrari 296 GT3: pointed low nose with one wide
// intake, slim lamps, a short visor-like glasshouse and flying buttresses over a sunken engine cover.
import { CylinderGeometry } from 'three';
import { makeBody, batches, box, ellipsoid, rod, slab, plate, wing, both, rimGeometry, lerp, smoothstep } from './kit.js';

export function ferrari(vehicle, quality = 1) {
  const a = 1.48, b = 1.23;              // axle positions from the physics model
  const nose = a + 0.98, tail = -b - 0.86;
  const cowl = 1.0, header = 0.3, roofEnd = -0.4, glassFoot = -0.78, deck = -1.6; // cabin stations
  const body = makeBody({
    x0: tail, x1: nose, axles: [a, -b], archR: 0.405, wellIn: 0.6, floor: 0.06,
    nose: { L: 0.3, p: 2.0, sweep: 0.44, pow: 1.7, len: 0.95 },
    tail: { L: 0.12, p: 3.6, sweep: 0.07, pow: 2.6, len: 0.4 },
    // plan outline: arrowhead nose, tight waist, broad square tail
    w: [[tail, 0.985], [-b - 0.4, 1.01], [-b, 1.02], [-b + 0.55, 0.99], [0.2, 0.92], [a - 0.5, 0.95], [a, 0.995], [a + 0.45, 0.97], [nose, 0.88]],
    wLip: [[tail, 0.97], [-b, 1.012], [0.2, 0.915], [a, 0.99], [nose, 0.87]],
    sill: [[tail, 0.14], [-b - 0.5, 0.13], [-b, 0.115], [a, 0.115], [a + 0.5, 0.1], [nose, 0.08]],
    sideY: [[tail, 0.6], [-b, 0.6], [0.2, 0.46], [a, 0.53], [nose, 0.27]],
    // fender line: crisp front wings, a deep dip at the door, the tallest haunches of the three GT cars
    shZ: [[tail, 0.84], [-b - 0.4, 0.87], [-b, 0.875], [-0.2, 0.86], [0.6, 0.865], [a, 0.815], [a + 0.5, 0.75], [nose, 0.66]],
    shY: [[tail, 0.83], [-b - 0.4, 0.93], [-b, 0.955], [-b + 0.6, 0.89], [0.2, 0.785], [cowl, 0.79], [a, 0.802], [a + 0.4, 0.745], [a + 0.72, 0.56], [nose, 0.31]],
    inZ: [[tail, 0.66], [deck, 0.68], [-b, 0.7], [-0.3, 0.745], [cowl - 0.1, 0.73], [cowl + 0.2, 0.62], [a, 0.5], [nose, 0.42]],
    inY: [[tail, 0.825], [deck, 0.91], [-b, 0.93], [-0.3, 0.84], [0.5, 0.785], [cowl, 0.755, 'c'], [a, 0.705], [a + 0.4, 0.63], [a + 0.72, 0.465], [nose, 0.28]],
    // roof rail: becomes the flying buttress behind the cabin and runs out to the tail
    railZ: [[tail, 0.5], [deck, 0.55], [-b, 0.57], [roofEnd, 0.53], [header, 0.55], [cowl, 0.65, 'c'], [a, 0.3], [nose, 0.24]],
    railY: [[tail, 0.83], [deck, 0.915], [-b, 0.975], [roofEnd, 1.15, 'c'], [-0.05, 1.18], [header, 1.15, 'c'], [cowl, 0.76, 'c'], [a, 0.71], [a + 0.4, 0.635], [a + 0.72, 0.47], [nose, 0.28]],
    // centreline: drops down a near-upright rear screen to the sunken engine cover
    top: [[tail, 0.79], [deck, 0.85], [glassFoot, 0.875, 'c'], [roofEnd - 0.04, 1.175, 'c'], [0, 1.205], [header, 1.175, 'c'], [cowl, 0.77, 'c'], [a, 0.715], [a + 0.4, 0.64], [a + 0.72, 0.475], [nose, 0.285]],
    round: { side: 1, sh: [[tail, 0.6], [-b, 0.55], [0.2, 0.45], [cowl, 0.6], [nose, 0.9]], in: [[tail, 0.5], [deck, 0.4], [cowl, 0.3], [cowl + 0.3, 0.9], [nose, 1]], rail: [[tail, 0.35], [glassFoot, 0.3], [roofEnd, 0.5], [header, 0.6], [cowl, 0.8], [nose, 1]] },
    stations: [cowl, header, roofEnd, roofEnd - 0.04, glassFoot, deck],
  }, quality);

  const add = batches(['paint', 'trim', 'carbon', 'glass', 'lamps', 'rear', 'black', 'chrome']);
  add.paint(body.skin);
  add.black(body.under);
  const V = (from, to, t) => body.v(from, to, t);
  const far = (v) => body.far(v);
  const across = (v0, x, extra = {}) => body.rect({ x, v: [v0, far(v0)], mirror: false, nt: 22, ...extra });

  // ---- glass: visor screen wrapping into short side windows, upright rear screen
  add.black(across(V('rail', 'top', -0.14), [cowl + 0.015, header - 0.01], { ns: 14, lift: 0.0015 }));
  add.glass(across(V('rail', 'top', 0.08), [cowl - 0.03, header + 0.03], { ns: 14, lift: 0.004 }));
  const sideWin = (grow, lift) => body.patch({ ns: 22, nt: 8, lift, at: (s, t) => {
    const x = lerp(cowl - 0.17 + grow, roofEnd - 0.2 - grow, s);
    const lo = lerp(0.14, 0.3, smoothstep(s, 0.6, 1)) - grow * 0.6, hi = lerp(0.9, 0.82, smoothstep(s, 0.7, 1)) + grow * 0.6;
    return [x, V('in', 'rail', lerp(lo, hi, t))];
  } });
  add.black(sideWin(0.03, 0.0015));
  add.glass(sideWin(0, 0.004));
  add.glass(across(V('rail', 'top', 0.3), [roofEnd - 0.07, glassFoot + 0.03], { ns: 8, lift: 0.004 }));
  add.trim(across(V('rail', 'top', 0.08), [header + 0.11, header + 0.035], { ns: 3, lift: 0.006 }));
  // sunken engine cover: dark panel with cooling slats between the buttresses
  add.black(across(V('rail', 'top', 0.32), [glassFoot - 0.02, deck - 0.2], { ns: 12, lift: 0.003 }));
  for (let k = 0; k < 7; k++) add.carbon(across(V('rail', 'top', 0.42), [glassFoot - 0.1 - k * 0.11, glassFoot - 0.14 - k * 0.11], { ns: 1, nt: 14, lift: 0.006 }));
  // black inner face of each buttress
  add.black(body.rect({ x: [roofEnd - 0.05, glassFoot - 0.1], v: [V('rail', 'top', 0.08), V('rail', 'top', 0.3)], ns: 6, nt: 2, lift: 0.003 }));

  // ---- nose: one wide flat intake, slim lamps along the wing edges
  const face = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.noseX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 8, nt: 14, lift: 0.004, ...extra });
  add.black(face(0.06, 0.52, V('side', 'sh', 0.7), far(V('side', 'sh', 0.7)), { mirror: false, nt: 40 }));
  for (let k = 1; k <= 2; k++) add.carbon(face(0.06 + k * 0.15, 0.08 + k * 0.15, V('side', 'sh', 0.74), far(V('side', 'sh', 0.74)), { mirror: false, nt: 40, lift: 0.007, ns: 1 }));
  for (const f of [-1.6, 0, 1.6]) add.carbon(face(0.06, 0.52, V('top') + f - 0.07, V('top') + f + 0.07, { mirror: false, nt: 1, lift: 0.007 })); // intake struts
  add.trim(face(0.58, 0.62, V('side', 'sh', 0.6), far(V('side', 'sh', 0.6)), { mirror: false, nt: 40, lift: 0.005, ns: 1 }));
  // lamps: a dark blade with a light strip, lying back along the top of each wing
  const blade = (halfW, x0, x1, lift) => body.patch({ ns: 12, nt: 4, lift, at: (s, t) => {
    const x = lerp(x0, x1, s), mid = lerp(V('sh', 'in', 0.3), V('sh', 'in', -0.05), s);
    return [x, mid + (t - 0.5) * 2 * halfW * (0.35 + 0.65 * Math.sin(Math.PI * (0.15 + 0.85 * s)))];
  } });
  add.black(blade(1.25, a + 0.78, a + 0.36, 0.004));
  add.lamps(blade(0.4, a + 0.74, a + 0.42, 0.007));
  // bonnet: big centre outlet with a body-colour bridge, wing-top louvres
  add.black(body.patch({ ns: 8, nt: 16, lift: 0.004, mirror: false, at: (s, t) => {
    const x = lerp(a + 0.5, a + 0.05, s), half = lerp(2.6, 4.6, s);
    return [x, V('top') + (t - 0.5) * 2 * half];
  } }));
  for (let k = 0; k < 3; k++) add.carbon(across(V('rail', 'top', 0.1), [a + 0.4 - k * 0.11, a + 0.37 - k * 0.11], { ns: 1, nt: 10, lift: 0.008 }));
  for (let k = 0; k < 5; k++) add.black(body.rect({ x: [a + 0.18 - k * 0.08, a + 0.14 - k * 0.08], v: [V('side', 'sh', 0.85), V('sh', 'in', 0.12)], ns: 1, nt: 5, lift: 0.004 }));

  // ---- flanks: door lines, scooped intake in the haunch, accent blade along the sill
  const doorF = cowl - 0.06, doorR = -0.3;
  add.black(body.line([[doorF, V('side', 'sh', -0.8)], [doorF + 0.04, V('sh', 'in', 0.5)]], 0.007));
  add.black(body.line([[doorR, V('side', 'sh', -0.8)], [doorR - 0.03, V('sh', 'in', 0.5)]], 0.007));
  add.black(body.line([[doorF, V('side', 'sh', -0.8)], [doorR, V('side', 'sh', -0.8)]], 0.007));
  add.black(body.patch({ ns: 12, nt: 8, lift: 0.004, at: (s, t) => {
    const x = lerp(-0.34, -b + 0.46, s);
    return [x, V('side', 'sh', lerp(lerp(0.5, -0.1, s), lerp(0.6, 0.95, s), t))];
  } }));
  add.trim(body.patch({ ns: 24, nt: 2, lift: 0.0045, at: (s, t) => {
    const x = lerp(a - 0.48, -b + 0.5, s);
    return [x, V('side', 'sh', -0.72 + 0.12 * s + t * (0.16 - 0.1 * s))];
  } }));
  for (let k = 0; k < 4; k++) add.black(body.rect({ x: [-b + 0.2 - k * 0.085, -b + 0.155 - k * 0.085], v: [V('side', 'sh', 0.9), V('sh', 'in', 0.2)], ns: 1, nt: 5, lift: 0.004 }));

  // air exits behind the front wheels and behind the rear wheels
  add.black(body.patch({ ns: 6, nt: 8, lift: 0.004, at: (s, t) => [lerp(a - 0.45, a - 0.6, s) - 0.1 * t, V('side', 'sh', lerp(-0.6, 0.5 - 0.5 * s, t))] }));
  add.black(body.patch({ ns: 4, nt: 8, lift: 0.004, at: (s, t) => [lerp(-b - 0.46, -b - 0.6, s) - 0.06 * t, V('side', 'sh', lerp(-0.45, 0.45 - 0.5 * s, t))] }));

  // ---- tail: black band with slim lamps at the corners, twin exhausts high in the middle
  const rearFace = (h0, h1, v0, extra = {}) => body.patch({ at: (s, t) => [body.tailX(lerp(h0, h1, s)), lerp(v0, far(v0), t)], ns: 5, nt: 30, lift: 0.004, mirror: false, ...extra });
  add.black(rearFace(0.56, 0.93, V('side', 'sh', 0.55)));
  add.black(rearFace(0.05, 0.4, V('side', 'sh', 0.75)));
  for (let k = 1; k <= 2; k++) add.carbon(rearFace(0.05 + k * 0.11, 0.065 + k * 0.11, V('side', 'sh', 0.8), { lift: 0.006, ns: 1 }));
  for (const side of [1, -1]) {
    const v0 = side > 0 ? V('side', 'sh', 0.68) : far(V('side', 'sh', 0.68)), v1 = side > 0 ? V('in', 'rail', 0.2) : far(V('in', 'rail', 0.2));
    add.rear(body.patch({ at: (s, t) => [body.tailX(lerp(0.7, 0.86, s)), lerp(v0, v1, t)], ns: 2, nt: 8, lift: 0.007, mirror: false }));
  }
  for (const z of [-0.1, 0.1]) add.chrome(new CylinderGeometry(0.058, 0.064, 0.14, 16, 1, true).rotateZ(Math.PI / 2).translate(tail + 0.02, 0.69, z));

  // ---- aero: splitter, dive planes, skirts, diffuser, swan-neck wing
  const outline = [];
  for (let i = 0; i <= 14; i++) { const z = -0.96 + (1.92 * i) / 14; outline.push([nose + 0.1 - 0.47 * Math.abs(z / 0.96) ** 1.7, z]); }
  add.carbon(plate([...outline, [a + 0.42, 0.985], [a + 0.42, -0.985]], 0.022, 0.05));
  for (const g of both(slab([[nose - 0.74, 0.24], [nose - 0.46, 0.185], [nose - 0.46, 0.197], [nose - 0.74, 0.255]], 0.15, 0.93))) add.carbon(g);
  for (const g of both(slab([[nose - 0.78, 0.37], [nose - 0.52, 0.3], [nose - 0.52, 0.312], [nose - 0.78, 0.385]], 0.13, 0.94))) add.carbon(g);
  for (const g of both(box((a - b) / 2, 0.09, 0.95, a + b - 0.84, 0.06, 0.1))) add.carbon(g);
  add.carbon(box(tail + 0.26, 0.1, 0, 0.56, 0.012, 1.6, 0.1));
  for (let i = -2; i <= 2; i++) add.carbon(slab([[tail - 0.02, 0.13], [tail + 0.5, 0.045], [tail + 0.5, 0.12], [tail - 0.02, 0.19]], 0.012, i * 0.3));
  const wingX = tail - 0.08, wingY = 1.16;
  add.carbon(wing(wingX, wingY, 1.9, 0.4, { angle: 0.18, camber: 0.085 }));
  add.trim(wing(wingX - 0.01, wingY + 0.045, 1.9, 0.07, { angle: 0.75, camber: 0.02, thick: 0.3 }));
  for (const g of both(slab([[wingX + 0.06, wingY - 0.26], [wingX - 0.36, wingY - 0.26], [wingX - 0.46, wingY - 0.02], [wingX - 0.42, wingY + 0.08], [wingX + 0.06, wingY + 0.11]], 0.012, 0.955))) add.paint(g);
  for (const g of both(slab([[wingX - 0.03, wingY + 0.09], [wingX - 0.22, wingY + 0.105], [wingX - 0.34, wingY + 0.03], [-b - 0.42, 0.86], [-b - 0.2, 0.84], [wingX - 0.22, wingY - 0.03], [wingX - 0.04, wingY + 0.04]], 0.016, 0.28))) add.carbon(g);

  // ---- furniture: mirrors, wiper, antenna, tow loops
  const mirrorX = cowl - 0.2, mirrorY = 0.96;
  for (const g of both(ellipsoid(mirrorX + 0.03, mirrorY, 0.95, 0.085, 0.048, 0.1))) add.paint(g);
  for (const g of both(rod([mirrorX + 0.02, mirrorY - 0.025, 0.9], [mirrorX + 0.07, 0.82, 0.76], 0.013))) add.black(g);
  add.black(rod([cowl - 0.03, 0.79, 0.0], [cowl - 0.36, 1.0, 0.24], 0.007));
  add.black(rod([-0.2, 1.2, 0.22], [-0.27, 1.36, 0.22], 0.004));
  add.trim(box(nose - 0.06, 0.2, 0.34, 0.05, 0.05, 0.016), box(tail + 0.0, 0.5, -0.62, 0.05, 0.05, 0.016));

  return {
    geometry: add.done(), rim: rimGeometry(),
    eye: [0.22, 0.97, -0.34], roofHeight: 1.205, mirrorX, mirrorY, door: [0.36, 0.48, body.width(0.36) + 0.012],
  };
}
