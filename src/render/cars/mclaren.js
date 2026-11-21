// Mid-engined GT3 supercar in the shape of the McLaren 720S GT3 Evo.
// Real car: 4.66 m long, 2.04 m wide, about 1.20 m high, 2.70 m wheelbase.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plain, clamp, makeBody, batches, box, ellipsoid, rod, tube, disc, slab, plate, wing, both, mirrorHousing, cockpit, quadRegion, anyOf, lerp } from './kit.js';

// Ellipse in (x, v) turned by `tilt` radians (v measured in surface metres), positive inside.
function tiltedEllipse({ x, v, rx, rv, tilt = 0, sv = 0.045 }) {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  return (X, V) => {
    const dx = X - x, dv = (V - v) * sv, p = dx * c + dv * s, q = -dx * s + dv * c;
    return (1 - Math.hypot(p / rx, q / rv)) * Math.min(rx, rv);
  };
}

// Ten slim Y-spokes: a stem from the hub that forks to the barrel. Same frame as the kit's rim
// (axle along z, outer face at z = 0 facing +z).
function ySpokeRim(radius = 0.236) {
  const parts = [];
  const blade = (r0, r1, w0, w1, angle, lean) => {
    const shape = new THREE.Shape([[r0, -w0], [r1, -w1], [r1, w1], [r0, w0]].map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.002, bevelSegments: 1 });
    const q = g.attributes.position;
    for (let i = 0; i < q.count; i++) q.setZ(i, q.getZ(i) - 0.028 - 0.055 * Math.max(0, 1 - q.getX(i) / radius) ** 1.4);
    return g.translate(-r0, 0, 0).rotateZ(lean).translate(r0, 0, 0).rotateZ(angle);
  };
  for (let k = 0; k < 10; k++) {
    const ang = (k * Math.PI) / 5;
    parts.push(blade(0.045, 0.125, 0.011, 0.008, ang, 0));
    parts.push(blade(0.12, radius + 0.004, 0.0075, 0.006, ang, 0.2), blade(0.12, radius + 0.004, 0.0075, 0.006, ang, -0.2));
  }
  parts.push(new THREE.CylinderGeometry(0.055, 0.064, 0.05, 20).rotateX(Math.PI / 2).translate(0, 0, -0.08));
  parts.push(new THREE.CylinderGeometry(0.028, 0.032, 0.03, 6).rotateX(Math.PI / 2).translate(0, 0, -0.045));
  parts.push(new THREE.TorusGeometry(radius - 0.006, 0.011, 8, 44).translate(0, 0, -0.008));
  const seg = 40, depth = 0.24, pos = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * 2 * Math.PI, a1 = ((i + 1) / seg) * 2 * Math.PI, r = radius - 0.002;
    const q = (a, z) => [r * Math.cos(a), r * Math.sin(a), z];
    pos.push(...q(a0, 0), ...q(a0, -depth), ...q(a1, 0), ...q(a1, 0), ...q(a0, -depth), ...q(a1, -depth));
  }
  const barrel = new THREE.BufferGeometry();
  barrel.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  barrel.computeVertexNormals();
  parts.push(barrel);
  return mergeGeometries(parts.map(plain));
}

export function mclaren(vehicle, quality = 1) {
  const a = 1.52, b = 1.18;              // axle positions from the physics model
  const nose = a + 0.98, tail = -b - 0.88;
  const cowl = 1.1, header = 0.4, roofEnd = -0.38, deck = -1.46; // cabin stations
  const TL = 0.16, TP = 3.0;             // depth and bluntness of the tail face (same numbers as `tail` below)
  const body = makeBody({
    x0: tail, x1: nose, axles: [a, -b], archR: 0.386, wellIn: 0.6, floor: 0.055,
    nose: { L: 0.27, p: 1.65, sweep: 0.5, pow: 1.9, len: 0.95 },
    tail: { L: 0.16, p: 3.0, sweep: 0.14, pow: 2.4, len: 0.5 },
    // plan outline: arrow nose, pinched waist at the doors, widest over the rear wheels
    w: [[tail, 0.925], [-b - 0.42, 1.0], [-b, 1.02], [-b + 0.5, 0.99], [0.3, 0.905], [a - 0.5, 0.94], [a, 0.995], [a + 0.42, 0.965], [nose, 0.84]],
    wLip: [[tail, 0.91], [-b - 0.4, 0.99], [-b, 1.015], [-b + 0.45, 0.975], [0.3, 0.895], [a - 0.45, 0.93], [a, 0.99], [a + 0.4, 0.955], [nose, 0.82]],
    sill: [[tail, 0.085], [-b - 0.5, 0.085], [-b - 0.39, 0.11], [a + 0.39, 0.11], [a + 0.6, 0.095], [nose, 0.07]],
    sideY: [[tail, 0.55], [-b, 0.58], [0.3, 0.42], [a - 0.5, 0.46], [a, 0.56], [nose, 0.24]],
    // fender line: front wings just clear the tyres, a deep dip through the doors, tall rear haunches
    shZ: [[tail, 0.77], [-b - 0.4, 0.86], [-b, 0.875], [-0.2, 0.855], [0.6, 0.86], [a, 0.82], [a + 0.5, 0.73], [nose, 0.58]],
    shY: [[tail, 0.86], [-b - 0.45, 0.9], [-b, 0.915], [-b + 0.55, 0.86], [0.3, 0.745], [cowl, 0.755], [a, 0.774], [a + 0.36, 0.715], [a + 0.68, 0.46], [nose, 0.2]],
    // base of the canopy, dropping into a bonnet set well below the wings
    inZ: [[tail, 0.5], [deck, 0.57], [-b, 0.65], [-0.3, 0.72], [cowl - 0.1, 0.71], [cowl + 0.18, 0.62], [a, 0.52], [nose, 0.36]],
    inY: [[tail, 0.865], [deck, 0.895], [-b, 0.895], [-0.3, 0.8], [0.5, 0.745], [cowl, 0.715, 'c'], [a, 0.64], [a + 0.36, 0.53], [a + 0.68, 0.33], [nose, 0.165]],
    // roof rail: fast screen, short roof, long teardrop fall to the tail
    railZ: [[tail, 0.26], [deck, 0.33], [-1.0, 0.41], [roofEnd, 0.49], [header, 0.53], [cowl, 0.64, 'c'], [a, 0.26], [nose, 0.13]],
    railY: [[tail, 0.87], [deck, 0.91, 'c'], [-1.05, 0.985], [roofEnd, 1.12], [0.0, 1.162], [header, 1.13, 'c'], [cowl, 0.72, 'c'], [a, 0.648], [a + 0.36, 0.54], [a + 0.68, 0.34], [nose, 0.17]],
    top: [[tail, 0.875], [deck, 0.915, 'c'], [-1.05, 0.995], [roofEnd, 1.15], [0.02, 1.19], [header, 1.158, 'c'], [cowl, 0.73, 'c'], [a, 0.662], [a + 0.36, 0.565], [a + 0.68, 0.375], [nose, 0.2]],
    round: { side: 1, sh: [[tail, 0.7], [-b, 0.6], [0.2, 0.45], [cowl, 0.6], [a, 0.7], [nose, 0.95]], in: [[tail, 0.6], [deck, 0.4], [cowl, 0.25], [cowl + 0.3, 0.9], [nose, 1]], rail: [[tail, 1], [deck, 0.8], [header, 0.6], [cowl, 0.75], [a, 0.6], [nose, 0.35]] },
    stations: [cowl, header, roofEnd, deck],
    holes: (s) => Object.values(openings(s)),
  }, quality);

  // Tail opening, drawn on the rear face: a rounded panel between height fractions 0.34 and 0.9,
  // from section point `va` across to the same point on the other side.
  function tailShape(top, va) {
    return (X, Vv) => {
      const u = clamp((X - tail) / TL, 0, 1), h = (1 - (1 - u) ** TP) ** (1 / TP);
      const qh = Math.abs(h - 0.62) * 0.6 - 0.168 + 0.06, qv = (top - Vv - (top - va)) * 0.05 + 0.06; // metres from the top/bottom and outer edges
      return 0.06 - (Math.hypot(Math.max(qh, 0), Math.max(qv, 0)) + Math.min(Math.max(qh, qv), 0));
    };
  }
  // every opening in the skin, as shapes in (x, v)
  function openings({ v, top }) {
    const mid = (v0) => [v0, 2 * top - v0]; // a span that crosses the centreline
    return {
      screen: quadRegion({ x: [header + 0.03, cowl - 0.045], v: mid(v('rail', 'top', 0.12)), r: 0.06 }),
      // side glass: follows the A-pillar at the front and tapers to a point over the rear wheel
      side: quadRegion({ x: [(t) => lerp(-0.92, roofEnd - 0.12, t), (t) => lerp(cowl - 0.17, header - 0.05, t)], v: [v('in', 'rail', 0.18), v('in', 'rail', 0.88)], r: 0.05 }),
      rear: quadRegion({ x: [deck + 0.42, roofEnd - 0.08], v: mid(v('rail', 'top', 0.18)), r: 0.06 }),
      // "eye socket": one teardrop from the nose corner up the front of the wing
      socket: anyOf(
        tiltedEllipse({ x: a + 0.6, v: v('sh', 'in', 0.42), rx: 0.2, rv: 0.085, tilt: -0.5 }),
        tiltedEllipse({ x: a + 0.47, v: v('sh', 'in', 0.12), rx: 0.15, rv: 0.06, tilt: -0.3 })),
      bonnet: quadRegion({ x: [a - 0.06, a + 0.26], v: mid(v('rail', 'top', 0.05)), r: 0.04 }),
      door: quadRegion({ x: [(t) => -0.1 + 0.28 * t, (t) => a - 0.54 - 0.1 * t], v: [v('side', 'sh', -0.5), v('side', 'sh', -0.2)], r: 0.035 }),
      tail: tailShape(top, v('side', 'sh', 1.0)),
      intake: quadRegion({ x: [(t) => -b + 0.5 + 0.16 * t, (t) => -b + 1.02 - 0.2 * t], v: [v('side', 'sh', -0.1), v('side', 'sh', 0.78)], r: 0.04 }),
    };
  }
  const O = openings({ v: body.v, top: body.top });
  const V = (from, to, t) => body.v(from, to, t), T = body.top;
  const across = (v0) => [v0, body.far(v0)];

  const add = batches(['paint', 'trim', 'carbon', 'lamps', 'rear', 'black', 'chrome', 'window', 'lens', 'liner', 'metal', 'suit']);
  add.paint(body.skin);
  add.black(body.under);
  add.liner(body.liner);

  // ---- glazing: real openings filled with tinted glass, each in a slim black frame
  const glaze = (d, box, mirror = true) => {
    add.window(body.region(d, { ...box, band: [-0.008, Infinity], lift: 0.0015, mirror }));
    add.black(body.region(d, { ...box, band: [-0.02, 0.004], lift: 0.003, mirror, cell: 0.02 }));
  };
  glaze(O.screen, { x: [header - 0.02, cowl + 0.02], v: across(V('rail', 'top', -0.25)) }, false);
  glaze(O.side, { x: [-1.0, cowl - 0.08], v: [V('in', 'rail', 0.0), V('in', 'rail', 1.0)] });
  glaze(O.rear, { x: [deck + 0.34, roofEnd - 0.02], v: across(V('rail', 'top', -0.2)) }, false);
  add.trim(body.rect({ x: [header + 0.13, header + 0.035], v: across(V('rail', 'top', 0.16)), ns: 3, nt: 22, lift: 0.004, mirror: false })); // sun strip
  // engine cover behind the rear screen: carbon panel with cooling slats
  add.carbon(body.rect({ x: [deck + 0.34, deck - 0.02], v: across(V('rail', 'top', 0.1)), ns: 6, nt: 16, lift: 0.003, mirror: false }));
  for (let k = 0; k < 5; k++) add.black(body.rect({ x: [deck + 0.3 - k * 0.065, deck + 0.27 - k * 0.065], v: across(V('rail', 'top', 0.3)), ns: 1, nt: 14, lift: 0.006, mirror: false }));
  // roof snorkel: open mouth above the screen header, faired back into the engine cover
  add.paint(slab([[0.16, 1.168], [0.17, 1.238], [0.06, 1.262], [-0.3, 1.235], [-0.75, 1.1], [-1.0, 1.0], [-0.6, 1.05], [0.0, 1.15]], 0.17, 0, 0.03));
  add.black(box(0.2, 1.207, 0, 0.016, 0.046, 0.12));
  add.carbon(box(0.203, 1.234, 0, 0.014, 0.008, 0.135), box(0.203, 1.18, 0, 0.014, 0.008, 0.135), box(0.203, 1.207, 0.064, 0.014, 0.06, 0.008), box(0.203, 1.207, -0.064, 0.014, 0.06, 0.008));

  // ---- cabin
  const eye = [0.3, 0.955, -0.33], steer = [eye[0] + 0.42, eye[1] - 0.235, eye[2]];
  const cab = cockpit({ seat: [eye[0] - 0.06, 0.27, eye[2]], wheel: steer, cabin: { x0: -0.52, x1: 0.55, w: 0.62, roof: 1.125, floor: 0.105, dash: 0.725 } });
  add.black(cab.black); add.carbon(cab.carbon); add.metal(cab.metal); add.suit(cab.suit);

  // ---- nose: full-width low intake over a splitter with a centre keel
  const face = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.noseX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 8, nt: 14, lift: 0.004, ...extra });
  add.black(face(0.04, 0.5, ...across(V('side', 'sh', 0.95)), { mirror: false, nt: 40 }));
  for (let k = 0; k < 2; k++) add.carbon(face(0.17 + k * 0.16, 0.19 + k * 0.16, ...across(V('side', 'sh', 1.0)), { mirror: false, nt: 40, lift: 0.008, ns: 1 }));
  for (const k of [-3, -1.6, 1.6, 3]) add.carbon(face(0.05, 0.49, T + k * 2.4 - 0.12, T + k * 2.4 + 0.12, { mirror: false, nt: 1, ns: 6, lift: 0.008 }));
  add.paint(face(0.04, 0.5, T - 1.3, T + 1.3, { mirror: false, nt: 4, ns: 6, lift: 0.012 }));                 // body-colour beak dividing the intake
  add.trim(face(0.56, 0.6, ...across(V('side', 'sh', 0.7)), { mirror: false, nt: 44, lift: 0.005, ns: 1 }));
  // centre keel crease up the bonnet, bonnet shut lines, and a sunk channel from each socket down to the intake
  add.black(body.line([[body.noseX(0.62), T], [a + 0.3, T]], 0.005, { mirror: false }));
  add.black(body.line([[a + 0.74, V('in', 'rail', 0.9)], [a + 0.3, V('sh', 'in', 0.85)], [cowl + 0.06, V('sh', 'in', 0.9)]], 0.005));
  add.black(body.patch({ ns: 8, nt: 3, lift: 0.004, at: (s, t) => [lerp(a + 0.74, body.noseX(0.5), s), lerp(V('sh', 'in', 0.5), V('side', 'sh', 1.15), s) + (t - 0.5) * (1.7 - 0.9 * s)] }));
  add.carbon(body.line([[a + 0.76, V('sh', 'in', 0.5) - 0.9], [body.noseX(0.52), V('side', 'sh', 1.15) - 0.45]], 0.008, { lift: 0.006 }));
  for (const z of [-0.2, 0.2]) add.carbon(box(nose + 0.01, 0.1, z, 0.03, 0.09, 0.02, 0.25));                    // splitter stays
  // eye sockets: a deep dark bowl, a slim LED blade along the top edge, three projectors, clear cover
  const sock = { x: [a + 0.24, a + 0.86], v: [V('sh', 'in', -2.5), V('in', 'rail', 2.5)] };
  add.black(body.region(O.socket, { ...sock, band: [-0.012, Infinity], lift: -0.05, cell: 0.02 }));
  add.carbon(body.region(O.socket, { ...sock, band: [-0.014, 0.004], lift: 0.003, cell: 0.015 }));
  add.lens(body.region(tiltedEllipse({ x: a + 0.47, v: V('sh', 'in', 0.12), rx: 0.15, rv: 0.06, tilt: -0.3 }), { ...sock, band: [-0.002, Infinity], lift: 0.001, cell: 0.02 }));
  add.lamps(body.patch({ ns: 12, nt: 1, lift: -0.012, at: (s, t) => [a + 0.34 + 0.3 * s, V('sh', 'in', -0.42 + 0.95 * s * s) + t * 0.32] })); // daytime blade
  for (let k = 0; k < 3; k++) {
    const px = a + 0.42 + k * 0.06, pv = V('sh', 'in', 0.1 + k * 0.12);
    const ring = (r0, r1, lift) => body.patch({ ns: 2, nt: 12, lift, at: (s, t) => [px + lerp(r0, r1, s) * Math.cos(t * 6.2832), pv + (lerp(r0, r1, s) / 0.05) * Math.sin(t * 6.2832)] });
    add.lamps(ring(0, 0.017, -0.03));
    add.chrome(ring(0.017, 0.025, -0.028));
  }
  // bonnet outlet with slats sunk inside, louvres over the front wheels
  add.carbon(body.region(O.bonnet, { x: [a - 0.12, a + 0.32], v: across(V('rail', 'top', -0.4)), band: [-0.016, 0.004], lift: 0.003, cell: 0.015, mirror: false }));
  for (let k = 0; k < 4; k++) add.carbon(body.rect({ x: [a + 0.21 - k * 0.075, a + 0.175 - k * 0.075], v: across(V('rail', 'top', 0.05)), ns: 1, nt: 14, lift: -0.014, mirror: false }));
  for (let k = 0; k < 6; k++) add.carbon(body.rect({ x: [a + 0.2 - k * 0.075, a + 0.165 - k * 0.075], v: [V('side', 'sh', 0.88), V('sh', 'in', 0.08)], ns: 1, nt: 5, lift: 0.004 }));

  // ---- flanks: dihedral-door cuts running into the roof, door channel, intake ahead of the rear wheel
  const doorF = cowl - 0.03, doorR = -0.34, low = V('side', 'sh', -0.74);
  add.black(body.line([[doorF + 0.1, low], [doorF, V('sh', 'in', 0.3)], [doorF - 0.5, V('in', 'rail', 1.0)], [doorF - 0.55, V('rail', 'top', 0.55)]], 0.006));
  add.black(body.line([[doorR, low], [doorR - 0.04, V('sh', 'in', 0.4)], [doorR + 0.02, V('in', 'rail', 1.0)], [doorR + 0.04, V('rail', 'top', 0.55)]], 0.006));
  add.black(body.line([[doorF + 0.1, low], [doorR, low]], 0.006));
  add.black(body.line([[doorF - 0.55, V('rail', 'top', 0.55)], [doorR + 0.04, V('rail', 'top', 0.55)]], 0.005));
  add.black(body.line([[a + 0.39, V('side', 'sh', 0.1)], [a + 0.47, V('side', 'sh', -0.7)]], 0.005)); // bumper joints
  add.black(body.line([[-b - 0.4, V('side', 'sh', 0.3)], [-b - 0.46, V('side', 'sh', -0.5)]], 0.005));
  // door channel: a real scallop sunk into the lower door, closed at the back, with a carbon rim
  const side = { x: [-b + 0.3, a - 0.3], v: [V('side', 'sh', -0.8), V('side', 'sh', 1.0)] };
  add.black(body.region(O.door, { ...side, band: [-0.03, Infinity], lift: -0.04, cell: 0.03 }));
  add.carbon(body.region(O.door, { ...side, band: [-0.012, 0.004], lift: 0.003, cell: 0.012 }));
  // side intake: a deep closed duct with two turning vanes
  add.black(body.region(O.intake, { ...side, band: [-0.04, Infinity], lift: -0.11, cell: 0.03 }));
  add.carbon(body.region(O.intake, { ...side, band: [-0.016, 0.004], lift: 0.003, cell: 0.012 }));
  for (let k = 0; k < 2; k++) add.carbon(body.rect({ x: [(t) => -b + 0.66 + k * 0.13 + 0.06 * t, (t) => -b + 0.69 + k * 0.13 + 0.06 * t], v: [V('side', 'sh', -0.06), V('side', 'sh', 0.74)], ns: 1, nt: 6, lift: -0.035 }));
  add.trim(body.patch({ ns: 22, nt: 1, lift: 0.004, at: (s, t) => [lerp(a - 0.45, -b + 0.55, s), V('side', 'sh', -0.62 + 0.25 * s * s + t * 0.05)] })); // accent blade under the door channel
  // air exits behind both arches
  add.black(body.patch({ ns: 8, nt: 6, lift: 0.004, at: (s, t) => [lerp(a - 0.405, a - 0.5, s), V('side', 'sh', lerp(-0.68 + 0.25 * s, 0.1 - 0.45 * s, t))] }));
  for (let k = 0; k < 3; k++) add.black(body.rect({ x: [-b - 0.47 - k * 0.07, -b - 0.5 - k * 0.07], v: [V('side', 'sh', -0.55), V('side', 'sh', 0.05 - k * 0.12)], ns: 1, nt: 5, lift: 0.004 })); // bumper-corner outlet slots
  add.black(box((a - b) / 2, 0.08, 0.93, a + b - 0.82, 0.055, 0.09), box((a - b) / 2, 0.08, -0.93, a + b - 0.82, 0.055, 0.09)); // sill extensions
  add.carbon(plate([[a - 0.42, 0.88], [a - 0.42, 1.02], [-b + 0.42, 1.035], [-b + 0.42, 0.88]], 0.012, 0.05), plate([[a - 0.42, -1.02], [a - 0.42, -0.88], [-b + 0.42, -0.88], [-b + 0.42, -1.035]], 0.012, 0.05));

  // ---- tail: a real opening with mesh sunk inside, gearbox and exhausts behind it, LED blades down both edges
  const rearFace = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.tailX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 4, nt: 30, lift: 0.004, mirror: false, ...extra });
  const tv = V('side', 'sh', 1.0), tBox = { x: [tail, tail + TL], v: across(tv - 1.5), mirror: false };
  add.carbon(body.region(O.tail, { ...tBox, band: [-0.018, 0.004], lift: 0.004, cell: 0.012 }));              // rim
  for (let k = 0; k < 6; k++) add.carbon(rearFace(0.4 + k * 0.085, 0.409 + k * 0.085, ...across(tv + 0.1), { ns: 1, nt: 40, lift: -0.07 }));
  for (let k = -6; k <= 6; k++) add.carbon(rearFace(0.36, 0.88, T + k * 1.75 - 0.04, T + k * 1.75 + 0.04, { ns: 8, nt: 1, lift: -0.07 }));
  // what shows through the mesh: gearbox casing, crash structure, two exhaust pipes running to high tips
  add.carbon(box(tail + 0.55, 0.47, 0, 0.5, 0.3, 0.5), ellipsoid(tail + 0.36, 0.47, 0, 0.16, 0.16, 0.2));
  add.carbon(box(tail + 0.17, 0.4, 0, 0.26, 0.13, 0.16));
  for (const z of [-0.3, 0.3]) add.metal(rod([tail + 0.6, 0.6, z], [tail + 0.12, 0.36, z * 0.9], 0.016));   // wing-mount struts
  for (const z of [-1, 1]) {
    add.chrome(tube([[tail + 0.75, 0.5, z * 0.32], [tail + 0.45, 0.6, z * 0.24], [tail + 0.2, 0.655, z * 0.1], [tail + 0.02, 0.66, z * 0.085]], 0.04));
    add.chrome(disc(tail + 0.0, 0.66, z * 0.085, 0.052, 0.12, 18, true));
    add.black(disc(tail + 0.04, 0.66, z * 0.085, 0.046, 0.02));
  }
  // LED blades: a slim arc down each outer edge of the opening, joined by a hairline across the top
  add.rear(rearFace(0.3, 0.93, tv - 0.9, tv - 0.3, { ns: 10, nt: 1, lift: 0.006 }), rearFace(0.3, 0.93, body.far(tv - 0.3), body.far(tv - 0.9), { ns: 10, nt: 1, lift: 0.006 }));
  add.rear(rearFace(0.925, 0.955, ...across(tv - 0.9), { nt: 44, lift: 0.006, ns: 1 }));
  // lower bumper: slotted outlet, then the diffuser with side fences
  add.black(rearFace(0.05, 0.22, ...across(V('sh', 'in', -0.2)), { ns: 4, nt: 30 }));
  for (let k = -3; k <= 3; k++) add.carbon(rearFace(0.05, 0.22, T + k * 2.8 - 0.1, T + k * 2.8 + 0.1, { ns: 3, nt: 1, lift: 0.008 }));
  add.carbon(box(tail + 0.2, 0.15, 0, 0.62, 0.012, 1.62, 0.17));
  for (let i = -4; i <= 4; i++) add.carbon(slab([[tail - 0.1, 0.27], [tail + 0.52, 0.05], [tail + 0.52, 0.15], [tail - 0.1, 0.3]], 0.012, i * 0.19));
  for (const g of both(slab([[tail - 0.1, 0.05], [tail + 0.45, 0.05], [tail + 0.45, 0.14], [tail - 0.1, 0.34]], 0.014, 0.84))) add.carbon(g);

  // ---- aero: splitter with centre keel, dive planes, tall swan-neck wing
  const outline = [];
  for (let i = 0; i <= 14; i++) { const z = -0.97 + (1.94 * i) / 14; outline.push([nose + 0.1 - 0.48 * Math.abs(z / 0.97) ** 2.0, z]); }
  add.carbon(plate([...outline, [a + 0.4, 0.985], [a + 0.4, -0.985]], 0.02, 0.04));
  add.carbon(slab([[nose + 0.06, 0.06], [nose - 0.5, 0.06], [nose - 0.5, 0.1], [nose - 0.04, 0.1]], 0.3, 0)); // keel
  for (const [y0, len] of [[0.17, 0.3], [0.3, 0.26]]) for (const g of both(slab([[nose - 0.44 - len, y0 + 0.075], [nose - 0.45, y0], [nose - 0.45, y0 + 0.012], [nose - 0.44 - len, y0 + 0.09]], 0.16, 0.9))) add.carbon(g);
  const wingX = tail - 0.02, wingY = 1.19;
  add.carbon(wing(wingX, wingY, 1.88, 0.4, { angle: 0.2, camber: 0.09 }));
  add.trim(box(wingX - 0.004, wingY + 0.058, 0, 0.012, 0.03, 1.88));                                          // gurney flap
  for (const g of both(slab([[wingX + 0.07, wingY - 0.16], [wingX - 0.3, wingY - 0.2], [wingX - 0.46, wingY - 0.08], [wingX - 0.48, wingY + 0.04], [wingX - 0.36, wingY + 0.1], [wingX + 0.07, wingY + 0.12]], 0.012, 0.945))) add.paint(g);
  for (const g of both(box(wingX - 0.17, wingY + 0.105, 0.945, 0.46, 0.014, 0.016, -0.03))) add.trim(g);
  for (const g of both(slab([[wingX - 0.03, wingY + 0.08], [wingX - 0.2, wingY + 0.09], [wingX - 0.31, wingY + 0.03], [-b - 0.36, 0.89], [-b - 0.14, 0.885], [wingX - 0.23, wingY - 0.04], [wingX - 0.04, wingY + 0.035]], 0.014, 0.3))) add.carbon(g);

  // ---- furniture: mirrors on door-top stalks, wiper, antenna, tow loops
  const mirrorX = cowl - 0.26, mirrorY = 0.94;
  const housing = mirrorHousing(mirrorX, mirrorY);
  for (const g of housing.shell.flatMap(both)) add.paint(g);
  for (const g of housing.back.flatMap(both)) add.black(g);
  for (const g of both(rod([mirrorX + 0.05, mirrorY - 0.03, 0.91], [mirrorX + 0.09, 0.79, 0.78], 0.013))) add.black(g);
  add.black(tube([[cowl + 0.0, 0.74, 0.0], [cowl - 0.32, 0.93, 0.2], [cowl - 0.38, 0.965, 0.26]], 0.006, 5));
  add.black(rod([-0.5, 1.13, 0.22], [-0.58, 1.3, 0.22], 0.004, 5));
  add.trim(box(nose - 0.0, 0.2, 0.36, 0.04, 0.045, 0.014), box(tail + 0.0, 0.42, -0.5, 0.04, 0.05, 0.014));
  add.black(ellipsoid(0.0, 0, 0, 0.001, 0.001, 0.001)); // keeps the batch non-empty at every quality

  return {
    geometry: add.done(), rim: ySpokeRim(),
    eye, roofHeight: 1.19, pod: [header - 0.02, 1.27, 0], mirrorX, mirrorY, door: [0.42, 0.56, body.width(0.42) + 0.012],
  };
}
