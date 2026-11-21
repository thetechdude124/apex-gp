// Rear-engined GT3 coupe in the shape of the 992-generation 911 GT3 R.
// Real car: 4.62 m long, 2.04 m wide, 1.28 m high, 2.51 m wheelbase.
import { makeBody, batches, box, ellipsoid, rod, tube, disc, slab, plate, wing, both, rimGeometry, mirrorHousing, cockpit, quadRegion, ellipseRegion, lerp } from './kit.js';

export function porsche(vehicle, quality = 1) {
  const a = 1.46, b = 1.05;              // axle positions from the physics model
  const nose = a + 0.93, tail = -b - 0.9;
  const cowl = 0.96, header = 0.24, roofEnd = -0.6, deck = -1.5; // cabin stations
  const body = makeBody({
    x0: tail, x1: nose, axles: [a, -b], archR: 0.386, wellIn: 0.6, floor: 0.06,
    nose: { L: 0.2, p: 2.0, sweep: 0.34, pow: 2.2, len: 0.8 },
    tail: { L: 0.2, p: 3.0, sweep: 0.12, pow: 2.6, len: 0.5 },
    // plan outline: swollen front arches, a waist at the doors, the widest point over the rear wheels
    w: [[tail, 0.955], [-b - 0.42, 1.01], [-b, 1.025], [-b + 0.48, 0.99], [0.1, 0.925], [a - 0.5, 0.955], [a, 1.0], [a + 0.42, 0.985], [nose, 0.92]],
    wLip: [[tail, 0.94], [-b - 0.4, 1.0], [-b, 1.02], [-b + 0.45, 0.975], [0.1, 0.915], [a - 0.45, 0.945], [a, 0.996], [a + 0.4, 0.975], [nose, 0.9]],
    sill: [[tail, 0.24], [-b - 0.5, 0.2], [-b - 0.39, 0.115], [a + 0.39, 0.115], [a + 0.6, 0.1], [nose, 0.075]],
    sideY: [[tail, 0.52], [-b, 0.6], [-0.2, 0.47], [a - 0.5, 0.5], [a, 0.58], [nose, 0.33]],
    // fender line: front wings stand proud of the bonnet, rear haunches rise to the engine lid
    shZ: [[tail, 0.8], [-b - 0.4, 0.87], [-b, 0.88], [-0.3, 0.845], [0.5, 0.86], [a, 0.82], [a + 0.5, 0.76], [nose, 0.7]],
    shY: [[tail, 0.83], [-b - 0.5, 0.905], [-b, 0.925], [-b + 0.5, 0.885], [0.15, 0.835], [cowl, 0.8], [a, 0.772], [a + 0.36, 0.735], [a + 0.66, 0.6], [nose, 0.36]],
    // base of the glasshouse, falling away into the bonnet valley ahead of the screen
    inZ: [[tail, 0.6], [deck, 0.67], [-b, 0.72], [-0.2, 0.74], [cowl - 0.1, 0.725], [cowl + 0.2, 0.6], [a, 0.54], [nose, 0.5]],
    inY: [[tail, 0.84], [deck, 0.905], [-b, 0.925], [-0.3, 0.875], [0.5, 0.84], [cowl, 0.79, 'c'], [a, 0.7], [a + 0.4, 0.62], [a + 0.7, 0.47], [nose, 0.31]],
    // roof rail: A-pillar up from the cowl, over the doors, then the long fastback fall
    railZ: [[tail, 0.34], [deck, 0.45], [roofEnd, 0.53], [header, 0.555], [cowl, 0.66, 'c'], [a, 0.3], [nose, 0.28]],
    railY: [[tail, 0.845], [deck, 0.915, 'c'], [-1.2, 1.01], [roofEnd, 1.2], [-0.2, 1.25], [header, 1.222, 'c'], [cowl, 0.795, 'c'], [a, 0.705], [a + 0.4, 0.625], [a + 0.7, 0.475], [nose, 0.31]],
    top: [[tail, 0.85], [deck, 0.92, 'c'], [-1.2, 1.02], [roofEnd, 1.232], [-0.15, 1.28], [header, 1.25, 'c'], [cowl, 0.805, 'c'], [a, 0.71], [a + 0.4, 0.63], [a + 0.7, 0.48], [nose, 0.315]],
    round: { side: 1, sh: [[tail, 0.7], [-b, 0.6], [0, 0.5], [cowl, 0.6], [a, 0.75], [nose, 0.9]], in: [[tail, 0.5], [deck, 0.3], [cowl, 0.25], [cowl + 0.3, 0.9], [nose, 1]], rail: [[tail, 1], [deck, 0.7], [header, 0.55], [cowl, 0.75], [nose, 1]] },
    stations: [cowl, header, roofEnd, deck],
    holes: (s) => Object.values(openings(s)),
  }, quality);

  // every opening in the skin, as shapes in (x, v)
  function openings({ v, top }) {
    const mid = (v0) => [v0, 2 * top - v0]; // a span that crosses the centreline
    return {
      screen: quadRegion({ x: [header + 0.035, cowl - 0.05], v: mid(v('rail', 'top', 0.16)), r: 0.05 }),
      side: quadRegion({ x: [(t) => lerp(-0.99, roofEnd - 0.02, t), (t) => lerp(cowl - 0.2, header - 0.07, t)], v: [v('in', 'rail', 0.2), v('in', 'rail', 0.86)], r: 0.045 }),
      rear: quadRegion({ x: [deck + 0.2, roofEnd - 0.1], v: mid(v('rail', 'top', 0.2)), r: 0.06 }),
      lamp: ellipseRegion({ x: a + 0.47, v: v('sh', 'in', 0.06), rx: 0.15, rv: 2.3 }),
      bonnet: quadRegion({ x: [a + 0.02, a + 0.3], v: [v('rail', 'top', -0.3), v('rail', 'top', 0.62)], r: 0.02 }),
      quarter: quadRegion({ x: [(t) => -b + 0.52 + 0.1 * t, (t) => -b + 0.8 - 0.04 * t], v: [v('side', 'sh', -0.25), v('side', 'sh', 0.4)], r: 0.03 }),
    };
  }
  const O = openings({ v: body.v, top: body.top });
  const V = (from, to, t) => body.v(from, to, t), T = body.top;

  const add = batches(['paint', 'trim', 'carbon', 'glass', 'lamps', 'rear', 'black', 'chrome', 'window', 'lens', 'liner', 'metal', 'suit']);
  add.paint(body.skin);
  add.black(body.under);
  add.liner(body.liner);

  // ---- glazing: real openings filled with tinted glass, each in a black frame
  const glaze = (d, box, mirror = true) => {
    add.window(body.region(d, { ...box, band: [-0.008, Infinity], lift: 0.0015, mirror }));
    add.black(body.region(d, { ...box, band: [-0.024, 0.004], lift: 0.003, mirror, cell: 0.02 }));
  };
  glaze(O.screen, { x: [header - 0.02, cowl + 0.02], v: [V('rail', 'top', -0.2), body.far(V('rail', 'top', -0.2))] }, false);
  glaze(O.side, { x: [-1.06, cowl - 0.1], v: [V('in', 'rail', 0.0), V('in', 'rail', 1.0)] });
  glaze(O.rear, { x: [deck + 0.12, roofEnd - 0.03], v: [V('rail', 'top', -0.2), body.far(V('rail', 'top', -0.2))] }, false);
  // B-pillar and the sun strip in the team's second colour
  add.black(body.rect({ x: [-0.4, -0.46], v: [V('in', 'rail', 0.15), V('in', 'rail', 0.92)], ns: 1, nt: 6, lift: 0.004 }));
  add.trim(body.rect({ x: [header + 0.15, header + 0.04], v: [V('rail', 'top', 0.2), body.far(V('rail', 'top', 0.2))], ns: 3, nt: 22, lift: 0.004, mirror: false }));

  // ---- cabin
  const eye = [0.16, 1.02, -0.36], steer = [eye[0] + 0.42, eye[1] - 0.235, eye[2]];
  const cab = cockpit({ seat: [eye[0] - 0.06, 0.3, eye[2]], wheel: steer, cabin: { x0: -0.72, x1: 0.72, w: 0.7, roof: 1.2, floor: 0.11, dash: 0.8 } });
  add.black(cab.black); add.carbon(cab.carbon); add.metal(cab.metal); add.suit(cab.suit);

  // ---- nose: a full-width lower intake behind a splitter, brake ducts, oval four-point lamps
  const face = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.noseX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 8, nt: 14, lift: 0.004, ...extra });
  const across = (v0) => [v0, body.far(v0)];
  add.black(face(0.05, 0.78, ...across(V('in', 'rail', 0.25)), { mirror: false, nt: 30 }));
  add.black(face(0.08, 0.72, V('side', 'sh', 0.3), V('sh', 'in', 0.7)));
  for (let k = 0; k < 4; k++) add.carbon(face(0.14 + k * 0.16, 0.16 + k * 0.16, ...across(V('in', 'rail', 0.27)), { mirror: false, nt: 30, lift: 0.008, ns: 1 }));
  for (let k = -3; k <= 3; k++) add.carbon(face(0.06, 0.77, T + k * 2.2 - 0.12, T + k * 2.2 + 0.12, { mirror: false, nt: 1, ns: 6, lift: 0.008 }));
  for (let k = 0; k < 2; k++) add.carbon(face(0.24 + k * 0.22, 0.265 + k * 0.22, V('side', 'sh', 0.32), V('sh', 'in', 0.68), { lift: 0.008, ns: 1 }));
  add.trim(face(0.84, 0.88, ...across(V('side', 'sh', 0.4)), { mirror: false, nt: 44, lift: 0.005, ns: 1 }));
  // lamp units: bowl sunk into the wing, four LED projectors with bright rings, clear cover
  const lampBox = { x: [a + 0.28, a + 0.66], v: [V('sh', 'in', -3), V('sh', 'in', 3)] }, lx = a + 0.47, lv = V('sh', 'in', 0.06);
  add.carbon(body.region(O.lamp, { ...lampBox, band: [-0.01, Infinity], lift: -0.035, cell: 0.02 }));
  add.chrome(body.region(O.lamp, { ...lampBox, band: [-0.016, 0.004], lift: 0.003, cell: 0.015 }));
  add.lens(body.region(O.lamp, { ...lampBox, band: [-0.004, Infinity], lift: 0.001, cell: 0.02 }));
  for (const [dx, dv] of [[0.055, 0.95], [0.055, -0.95], [-0.06, 0.95], [-0.06, -0.95]]) {
    const ring = (r0, r1, lift) => body.patch({ ns: 2, nt: 14, lift, at: (s, t) => [lx + dx + lerp(r0, r1, s) * Math.cos(t * 6.2832), lv + dv + (lerp(r0, r1, s) / 0.05) * Math.sin(t * 6.2832)] });
    add.lamps(ring(0, 0.026, -0.022));
    add.chrome(ring(0.026, 0.036, -0.02));
  }
  add.lamps(body.patch({ ns: 1, nt: 18, lift: -0.012, at: (s, t) => [lx + (0.118 + 0.012 * s) * Math.cos(t * 6.2832), lv + ((0.118 + 0.012 * s) / 0.066) * Math.sin(t * 6.2832)] })); // daytime ring
  // bonnet outlets with slats sunk inside, louvres over the front wheels
  for (let k = 0; k < 4; k++) add.carbon(body.rect({ x: [a + 0.27 - k * 0.07, a + 0.24 - k * 0.07], v: [V('rail', 'top', -0.3), V('rail', 'top', 0.62)], ns: 1, nt: 6, lift: -0.012 }));
  add.carbon(body.region(O.bonnet, { x: [a - 0.02, a + 0.34], v: [V('rail', 'top', -0.6), V('rail', 'top', 0.9)], band: [-0.014, 0.004], lift: 0.003, cell: 0.015 }));
  for (let k = 0; k < 6; k++) add.black(body.rect({ x: [a + 0.2 - k * 0.075, a + 0.165 - k * 0.075], v: [V('side', 'sh', 0.86), V('sh', 'in', 0.06)], ns: 1, nt: 5, lift: 0.004 }));

  // ---- flanks: door shut lines, intake ahead of the rear wheel, outlet behind it
  const doorF = cowl - 0.04, doorR = -0.4, low = V('side', 'sh', -0.72);
  add.black(body.line([[doorF, low], [doorF, V('sh', 'in', 0.5)]], 0.006));
  add.black(body.line([[doorR, low], [doorR - 0.03, V('sh', 'in', 0.5)]], 0.006));
  add.black(body.line([[doorF, low], [doorR, low]], 0.006));
  add.black(body.line([[a + 0.39, V('side', 'sh', 0.1)], [a + 0.46, V('side', 'sh', -0.7)]], 0.005));       // bumper joint
  add.black(body.line([[-b - 0.4, V('side', 'sh', 0.3)], [-b - 0.46, V('side', 'sh', -0.5)]], 0.005));
  for (const d of [O.quarter]) add.carbon(body.region(d, { x: [tail, -b + 0.9], v: [V('side', 'sh', -1), V('side', 'sh', 0.7)], band: [-0.014, 0.004], lift: 0.003, cell: 0.015 }));
  for (let k = 0; k < 3; k++) add.carbon(body.rect({ x: [-b + 0.56 + k * 0.07, -b + 0.585 + k * 0.07], v: [V('side', 'sh', -0.25), V('side', 'sh', 0.4)], ns: 1, nt: 5, lift: -0.02 }));
  add.black(box((a - b) / 2, 0.085, 0.945, a + b - 0.82, 0.06, 0.09), box((a - b) / 2, 0.085, -0.945, a + b - 0.82, 0.06, 0.09)); // sill extensions
  add.carbon(plate([[a - 0.42, 0.9], [a - 0.42, 1.03], [-b + 0.42, 1.04], [-b + 0.42, 0.9]], 0.012, 0.055), plate([[a - 0.42, -1.03], [a - 0.42, -0.9], [-b + 0.42, -0.9], [-b + 0.42, -1.04]], 0.012, 0.055));

  // ---- tail: thin full-width light bar, mesh panel below, centre exhausts, deep diffuser
  const rearFace = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.tailX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 4, nt: 30, lift: 0.004, mirror: false, ...extra });
  add.black(rearFace(0.78, 0.93, ...across(V('side', 'sh', 0.7)), { nt: 40 }));
  add.rear(rearFace(0.83, 0.89, ...across(V('side', 'sh', 0.8)), { nt: 40, lift: 0.007 }));
  add.black(rearFace(0.04, 0.5, ...across(V('sh', 'in', -0.5)), { ns: 6 }));
  for (let k = 0; k < 5; k++) add.carbon(rearFace(0.08 + k * 0.085, 0.095 + k * 0.085, ...across(V('sh', 'in', -0.45)), { ns: 1, lift: 0.008 }));
  for (const z of [-0.075, 0.075]) add.chrome(disc(tail + 0.01, 0.4, z, 0.052, 0.14, 18, true)), add.black(disc(tail + 0.03, 0.4, z, 0.048, 0.02));
  for (let k = 0; k < 6; k++) add.black(body.rect({ x: [deck - 0.04 - k * 0.055, deck - 0.07 - k * 0.055], v: across(V('rail', 'top', -0.5)), ns: 1, nt: 14, lift: 0.004, mirror: false }));
  add.carbon(box(tail + 0.22, 0.17, 0, 0.6, 0.012, 1.56, 0.17));
  for (let i = -4; i <= 4; i++) add.carbon(slab([[tail - 0.1, 0.3], [tail + 0.5, 0.06], [tail + 0.5, 0.17], [tail - 0.1, 0.33]], 0.012, i * 0.185));

  // ---- aero: splitter with end fences, dive planes, swan-neck wing
  const outline = [];
  for (let i = 0; i <= 14; i++) { const z = -0.99 + (1.98 * i) / 14; outline.push([nose + 0.11 - 0.36 * Math.abs(z / 0.99) ** 2.2, z]); }
  add.carbon(plate([...outline, [a + 0.4, 1.0], [a + 0.4, -1.0]], 0.02, 0.045));
  for (const [y0, len] of [[0.2, 0.3], [0.33, 0.27]]) for (const g of both(slab([[nose - 0.3 - len, y0 + 0.07], [nose - 0.31, y0], [nose - 0.31, y0 + 0.012], [nose - 0.3 - len, y0 + 0.085]], 0.15, 0.94))) add.carbon(g);
  const wingX = tail - 0.04, wingY = 1.2;
  add.carbon(wing(wingX, wingY, 1.9, 0.4, { angle: 0.19, camber: 0.085 }));
  add.trim(box(wingX - 0.004, wingY + 0.055, 0, 0.012, 0.03, 1.9));                                           // gurney flap
  for (const g of both(slab([[wingX + 0.06, wingY - 0.11], [wingX - 0.42, wingY - 0.13], [wingX - 0.47, wingY - 0.02], [wingX - 0.42, wingY + 0.07], [wingX + 0.06, wingY + 0.11]], 0.012, 0.955))) add.paint(g);
  for (const g of both(slab([[wingX - 0.03, wingY + 0.075], [wingX - 0.2, wingY + 0.085], [wingX - 0.3, wingY + 0.03], [-b - 0.4, 0.9], [-b - 0.2, 0.89], [wingX - 0.22, wingY - 0.04], [wingX - 0.04, wingY + 0.03]], 0.014, 0.34))) add.carbon(g);

  // ---- furniture: mirrors, wiper, antenna, tow loops, roof hatch outline
  const mirrorX = cowl - 0.2, mirrorY = 0.98;
  const housing = mirrorHousing(mirrorX, mirrorY);
  for (const g of housing.shell.flatMap(both)) add.paint(g);
  for (const g of housing.back.flatMap(both)) add.black(g);
  for (const g of both(rod([mirrorX + 0.05, mirrorY - 0.03, 0.9], [mirrorX + 0.07, 0.87, 0.76], 0.013))) add.black(g);
  add.black(tube([[cowl + 0.0, 0.815, 0.05], [cowl - 0.3, 1.0, 0.24], [cowl - 0.36, 1.035, 0.3]], 0.006, 5));
  add.black(body.line([[0.0, V('rail', 'top', 0.3)], [0.0, V('rail', 'top', 0.95)], [-0.38, V('rail', 'top', 0.95)], [-0.38, V('rail', 'top', 0.3)], [0.0, V('rail', 'top', 0.3)]], 0.005));
  add.black(rod([-0.5, 1.26, 0.2], [-0.57, 1.42, 0.2], 0.004, 5));
  add.trim(box(nose - 0.005, 0.26, 0.4, 0.04, 0.05, 0.014), box(tail + 0.0, 0.5, -0.52, 0.04, 0.05, 0.014));

  return {
    geometry: add.done(), rim: rimGeometry(),
    eye, roofHeight: 1.28, pod: [header - 0.02, 1.36, 0], mirrorX, mirrorY, door: [0.3, 0.52, body.width(0.3) + 0.012],
  };
}
