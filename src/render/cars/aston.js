// Front-mid-engined GT3 coupe in the shape of the Aston Martin Vantage GT3, with the extra-wide
// stance of the Vantage touring car. Real car: about 4.72 m long, 2.05 m wide, 1.25 m high.
import { CylinderGeometry } from 'three';
import { makeBody, batches, box, rod, tube, disc, slab, plate, wing, both, rimGeometry, mirrorHousing, cockpit, quadRegion, lerp, clamp } from './kit.js';

export function aston(vehicle, quality = 1) {
  const a = 1.39, b = 1.32;               // axle positions from the physics model
  const nose = a + 0.94, tail = -b - 0.98;
  const cowl = 0.56, header = -0.12, roofEnd = -0.95, deck = -1.75; // cabin stations: long bonnet, cabin far back
  const NL = 0.22, NP = 2.9, TL = 0.3, TP = 2.5;
  // height fraction on the nose / tail face for a given x (inverse of body.noseX / tailX)
  const faceH = (u, p) => (u >= 1 ? 1 + (u - 1) : (1 - (1 - clamp(u, 0, 1)) ** p) ** (1 / p));
  const noseH = (X) => faceH((nose - X) / NL, NP), tailH = (X) => faceH((X - tail) / TL, TP);

  const body = makeBody({
    x0: tail, x1: nose, axles: [a, -b], archR: 0.386, wellIn: 0.6, floor: 0.06,
    nose: { L: NL, p: NP, sweep: 0.3, pow: 2.3, len: 0.8 },
    tail: { L: TL, p: TP, sweep: 0.14, pow: 2.4, len: 0.55 },
    // plan: boxed front wings, a deep waist at the doors, widest over the rear wheels
    w: [[tail, 0.95], [-b - 0.45, 1.015], [-b, 1.03], [-b + 0.5, 0.99], [-0.25, 0.925], [a - 0.55, 0.955], [a, 1.008], [a + 0.42, 0.992], [nose, 0.9]],
    wLip: [[tail, 0.935], [-b - 0.42, 1.005], [-b, 1.024], [-b + 0.46, 0.975], [-0.25, 0.915], [a - 0.5, 0.945], [a, 1.003], [a + 0.4, 0.98], [nose, 0.88]],
    sill: [[tail, 0.2], [-b - 0.5, 0.16], [-b - 0.39, 0.115], [a + 0.39, 0.115], [a + 0.6, 0.1], [nose, 0.075]],
    sideY: [[tail, 0.6], [-b, 0.62], [-0.3, 0.47], [a - 0.5, 0.5], [a, 0.59], [nose, 0.32]],
    // wing line: flat boxed crowns over the front wheels, muscular rear haunches into the ducktail
    shZ: [[tail, 0.8], [-b, 0.89], [-0.3, 0.85], [cowl, 0.865], [a, 0.85], [a + 0.5, 0.78], [nose, 0.68]],
    shY: [[tail, 0.945], [-b - 0.5, 0.94], [-b, 0.93], [-b + 0.5, 0.885], [-0.3, 0.835], [cowl, 0.81], [a, 0.776], [a + 0.36, 0.745], [a + 0.66, 0.6], [nose, 0.36]],
    // glasshouse base, falling into the bonnet valley ahead of the screen
    inZ: [[tail, 0.6], [deck, 0.64], [-b, 0.7], [-0.5, 0.725], [cowl - 0.1, 0.72], [cowl + 0.25, 0.62], [a, 0.56], [nose, 0.48]],
    inY: [[tail, 0.965], [deck, 0.95], [-b, 0.93], [-0.5, 0.87], [cowl - 0.1, 0.84], [cowl, 0.83, 'c'], [a, 0.745], [a + 0.4, 0.675], [a + 0.7, 0.51], [nose, 0.33]],
    // roof rail: a low, compact glasshouse and a fast rear screen running out to the ducktail
    railZ: [[tail, 0.36], [deck, 0.46], [roofEnd, 0.53], [header, 0.55], [cowl, 0.65, 'c'], [cowl + 0.25, 0.4], [a, 0.27], [a + 0.6, 0.2], [nose, 0.2]],
    railY: [[tail, 0.985], [deck, 0.965, 'c'], [-1.4, 1.065], [roofEnd, 1.185], [-0.5, 1.22], [header, 1.195, 'c'], [cowl, 0.835, 'c'], [a, 0.768], [a + 0.4, 0.7], [a + 0.7, 0.53], [nose, 0.34]],
    top: [[tail, 0.995], [deck, 0.97, 'c'], [-1.4, 1.075], [roofEnd, 1.215], [-0.5, 1.25], [header, 1.222, 'c'], [cowl, 0.85, 'c'], [a, 0.812], [a + 0.4, 0.74], [a + 0.7, 0.555], [nose, 0.345]],
    round: { side: 1, sh: [[tail, 0.6], [-b, 0.55], [-0.3, 0.5], [cowl, 0.55], [a, 0.5], [nose, 0.9]], in: [[tail, 0.5], [deck, 0.3], [cowl, 0.25], [cowl + 0.3, 0.6], [a + 0.5, 0.6], [nose, 1]], rail: [[tail, 1], [deck, 0.7], [header, 0.55], [cowl, 0.75], [cowl + 0.25, 0.3], [a + 0.55, 0.3], [nose, 1]] },
    stations: [cowl, header, roofEnd, deck],
    holes: (s) => Object.values(openings(s)),
  }, quality);

  // every opening in the skin, as shapes in (x, v)
  function openings({ v, top }) {
    const mid = (v0) => [v0, 2 * top - v0];
    const gHalf = top - v('sh', 'in', 0.1), rHalf = top - v('sh', 'in', 0.75);
    return {
      screen: quadRegion({ x: [header + 0.035, cowl - 0.05], v: mid(v('rail', 'top', 0.16)), r: 0.05 }),
      side: quadRegion({ x: [(t) => lerp(-1.5, roofEnd - 0.06, t), (t) => lerp(cowl - 0.2, header - 0.07, t)], v: [v('in', 'rail', 0.2), v('in', 'rail', 0.86)], r: 0.045 }),
      rear: quadRegion({ x: [deck + 0.2, roofEnd - 0.1], v: mid(v('rail', 'top', 0.2)), r: 0.06 }),
      // the grille mouth: one piece across the nose, tallest in the middle, corners drooping
      grille: (X, V) => {
        const h = noseH(X), dz = Math.abs(V - top) / gHalf;
        return Math.min(h - (0.06 + 0.05 * dz ** 3), lerp(0.8, 0.5, dz * dz) - h, (1 - dz) * 0.5) * 0.25;
      },
      lamp: quadRegion({ x: [(t) => a + 0.34 + 0.16 * t, (t) => a + 0.74 - 0.04 * t], v: [v('sh', 'in', -0.28), v('sh', 'in', 0.3)], r: 0.016 }),
      extractor: quadRegion({ x: [(t) => a - 0.3 + 0.12 * t, (t) => a + 0.3 - 0.08 * t], v: [v('in', 'rail', 0.25), v('in', 'rail', 0.86)], r: 0.035 }),
      cutout: quadRegion({ x: [(t) => a - 0.82 + 0.1 * t, (t) => a - 0.43 - 0.03 * t], v: [v('side', 'sh', -0.72), v('side', 'sh', 0.45)], r: 0.035 }),
      haunch: quadRegion({ x: [(t) => -b + 0.5 + 0.08 * t, (t) => -b + 0.74 - 0.03 * t], v: [v('side', 'sh', -0.1), v('side', 'sh', 0.5)], r: 0.03 }),
      // open mesh panel across the tail
      panel: (X, V) => { // rounded opening between the lamps and the diffuser
        const h = tailH(X), dz = Math.abs(V - top) / rHalf;
        return (1 - (dz ** 4 + (Math.abs(h - 0.56) / 0.17) ** 4) ** 0.25) * 0.08;
      },
    };
  }
  const O = openings({ v: body.v, top: body.top });
  const V = (from, to, t) => body.v(from, to, t), T = body.top;
  const across = (v0) => [v0, body.far(v0)];

  const add = batches(['paint', 'trim', 'carbon', 'lamps', 'rear', 'black', 'chrome', 'window', 'lens', 'liner', 'metal', 'suit']);
  add.paint(body.skin);
  add.black(body.under);
  add.liner(body.liner);

  // ---- glazing
  const glaze = (d, area, mirror = true) => {
    add.window(body.region(d, { ...area, band: [-0.008, Infinity], lift: 0.0015, mirror }));
    add.black(body.region(d, { ...area, band: [-0.024, 0.004], lift: 0.003, mirror, cell: 0.02 }));
  };
  glaze(O.screen, { x: [header - 0.02, cowl + 0.02], v: across(V('rail', 'top', -0.2)) }, false);
  glaze(O.side, { x: [-1.58, cowl - 0.1], v: [V('in', 'rail', 0.0), V('in', 'rail', 1.0)] });
  glaze(O.rear, { x: [deck + 0.12, roofEnd - 0.03], v: across(V('rail', 'top', -0.2)) }, false);
  add.black(body.rect({ x: [-0.86, -0.92], v: [V('in', 'rail', 0.15), V('in', 'rail', 0.92)], ns: 1, nt: 6, lift: 0.004 })); // B-pillar
  add.trim(body.rect({ x: [header + 0.15, header + 0.04], v: across(V('rail', 'top', 0.2)), ns: 3, nt: 22, lift: 0.004, mirror: false }));

  // ---- cabin: left-hand drive, seat set well back
  const eye = [-0.4, 1.0, -0.34], steer = [eye[0] + 0.42, eye[1] - 0.235, eye[2]];
  const cab = cockpit({ seat: [eye[0] - 0.06, 0.3, eye[2]], wheel: steer, cabin: { x0: -1.15, x1: 0.26, w: 0.69, roof: 1.17, floor: 0.11, dash: 0.82 } });
  add.black(cab.black); add.carbon(cab.carbon); add.metal(cab.metal); add.suit(cab.suit);

  // ---- nose: the grille mouth with its bars sunk inside, corner brake ducts, slim swept lamps
  const face = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.noseX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 8, nt: 14, lift: 0.004, ...extra });
  const gV = across(V('sh', 'in', -0.3));
  const inGrille = (lo, hi) => [(X, Vv) => O.grille(X, Vv) - lo, ...(hi === Infinity ? [] : [(X, Vv) => hi - O.grille(X, Vv)])];
  add.black(face(0.02, 0.86, ...gV, { mirror: false, ns: 16, nt: 48, lift: -0.09, keep: inGrille(-0.02, Infinity) }));          // back wall
  for (let k = 0; k < 7; k++) add.carbon(face(0.1 + k * 0.1, 0.122 + k * 0.1, ...gV, { mirror: false, ns: 1, nt: 48, lift: -0.035, keep: inGrille(-0.004, Infinity) }));
  for (let k = -6; k <= 6; k++) add.carbon(face(0.04, 0.84, T + k * 1.25 - 0.09, T + k * 1.25 + 0.09, { mirror: false, ns: 14, nt: 1, lift: -0.04, keep: inGrille(-0.004, Infinity) }));
  add.chrome(face(0.4, 0.46, ...gV, { mirror: false, ns: 1, nt: 48, lift: -0.02, keep: inGrille(-0.004, Infinity) }));          // centre crossbar
  add.carbon(face(0.02, 0.88, ...gV, { mirror: false, ns: 18, nt: 56, lift: 0.004, keep: inGrille(-0.013, 0.003) }));           // rim
  add.trim(face(0.02, 0.9, ...gV, { mirror: false, ns: 18, nt: 56, lift: 0.005, keep: [(X, Vv) => O.grille(X, Vv) + 0.021, (X, Vv) => -0.013 - O.grille(X, Vv), (X) => noseH(X) - 0.42] })); // accent lip over the mouth
  add.black(face(0.1, 0.5, V('side', 'sh', 0.25), V('sh', 'in', -0.42)));                                                         // corner brake ducts
  for (let k = 0; k < 2; k++) add.carbon(face(0.2 + k * 0.14, 0.222 + k * 0.14, V('side', 'sh', 0.27), V('sh', 'in', -0.44), { lift: 0.008, ns: 1 }));
  // lamp units: narrow sunk bowls with a row of LED projectors and a light blade, clear cover
  const lampArea = { x: [a + 0.28, a + 0.8], v: [V('sh', 'in', -0.9), V('sh', 'in', 0.9)] };
  add.carbon(body.region(O.lamp, { ...lampArea, band: [-0.006, Infinity], lift: -0.022, cell: 0.015 }));
  add.black(body.region(O.lamp, { ...lampArea, band: [-0.009, 0.003], lift: 0.002, cell: 0.01 }));
  add.lens(body.region(O.lamp, { ...lampArea, band: [-0.003, Infinity], lift: 0.0006, cell: 0.015 }));
  for (let k = 0; k < 3; k++) {
    const lx = a + 0.5 + k * 0.075, lv = V('sh', 'in', 0.1 - k * 0.03);
    const ring = (r0, r1, lift) => body.patch({ ns: 2, nt: 12, lift, at: (s, t) => [lx + lerp(r0, r1, s) * Math.cos(t * 6.2832), lv + (lerp(r0, r1, s) / 0.06) * Math.sin(t * 6.2832)] });
    add.lamps(ring(0, 0.014, -0.016)); add.chrome(ring(0.014, 0.021, -0.014));
  }
  // signature: a swept daytime blade hugging the outer and rear edge of the unit
  add.lamps(body.patch({ ns: 26, nt: 12, lift: -0.006, at: (s, t) => [lerp(lampArea.x[0], lampArea.x[1], s), lerp(V('sh', 'in', -0.4), V('sh', 'in', 0.4), t)],
    keep: [(X, Vv) => O.lamp(X, Vv) - 0.002, (X, Vv) => 0.011 - O.lamp(X, Vv), (X, Vv) => (V('sh', 'in', 0.06) - Vv) * 0.045 + (a + 0.47 - X) * 0.6 + 0.03] }));
  // bonnet: two big extractors with slats sunk inside, a raised spine between them
  const exV = [V('in', 'rail', 0.25), V('in', 'rail', 0.86)], inEx = [(X, Vv) => O.extractor(X, Vv) + 0.004];
  add.black(body.region(O.extractor, { x: [a - 0.36, a + 0.36], v: [V('in', 'rail', 0), V('in', 'rail', 1.1)], band: [-0.02, Infinity], lift: -0.09, cell: 0.04 }));
  for (let k = 0; k < 8; k++) { // louvres: each blade starts flush and dips into the opening towards the rear
    const x1 = a + 0.25 - k * 0.07;
    for (let j = 0; j < 3; j++) add.carbon(body.rect({ x: [x1 - j * 0.017, x1 - (j + 1) * 0.017], v: exV, ns: 1, nt: 6, lift: -0.004 - j * 0.014, keep: inEx }));
  }
  add.carbon(body.region(O.extractor, { x: [a - 0.36, a + 0.36], v: [V('in', 'rail', 0), V('in', 'rail', 1.1)], band: [-0.014, 0.004], lift: 0.003, cell: 0.015 }));
  add.black(body.line([[cowl + 0.03, V('sh', 'in', 0.75)], [a + 0.3, V('sh', 'in', 0.75)], [a + 0.66, V('sh', 'in', 0.95)]], 0.005)); // bonnet shut line
  for (let k = 0; k < 6; k++) add.black(body.rect({ x: [a + 0.2 - k * 0.075, a + 0.165 - k * 0.075], v: [V('side', 'sh', 0.88), V('sh', 'in', 0.05)], ns: 1, nt: 5, lift: 0.004 })); // wing-top louvres

  // ---- flanks: open cut-out behind the front wheel, side exhaust, haunch intake, shut lines
  const sideArea = { x: [-b + 0.3, a - 0.3], v: [V('side', 'sh', -1), V('side', 'sh', 0.8)] };
  for (const d of [O.cutout, O.haunch]) add.carbon(body.region(d, { ...sideArea, band: [-0.014, 0.004], lift: 0.003, cell: 0.015 }));
  // front cut-out: an open, deep void with a smooth inner wall and two thin vanes; the haunch intake is a clean scoop
  add.black(body.region(O.cutout, { ...sideArea, band: [-0.04, Infinity], lift: -0.16, cell: 0.04 }));
  for (const t of [0.05, -0.32]) add.carbon(body.rect({ x: [a - 0.8, a - 0.44], v: [V('side', 'sh', t), V('side', 'sh', t + 0.045)], ns: 8, nt: 1, lift: -0.05, keep: [(X, Vv) => O.cutout(X, Vv) + 0.004] }));
  add.black(body.region(O.haunch, { ...sideArea, band: [-0.03, Infinity], lift: -0.06, cell: 0.03 }));
  // blanking walls: nothing of the cabin or cage can be seen through a body opening
  for (const g of both(box(a - 0.62, 0.42, 0.74, 0.62, 0.7, 0.012))) add.black(g);
  for (const g of both(box(-b + 0.62, 0.62, 0.78, 0.4, 0.4, 0.012))) add.black(g);
  const doorF = cowl - 0.1, doorR = -0.86, low = V('side', 'sh', -0.72);
  add.black(body.line([[doorF, low], [doorF + 0.02, V('sh', 'in', 0.5)]], 0.006));
  add.black(body.line([[doorR, low], [doorR - 0.03, V('sh', 'in', 0.5)]], 0.006));
  add.black(body.line([[doorF, low], [doorR, low]], 0.006));
  add.black(body.line([[a + 0.39, V('side', 'sh', 0.1)], [a + 0.46, V('side', 'sh', -0.7)]], 0.005));
  add.black(body.line([[-b - 0.4, V('side', 'sh', 0.3)], [-b - 0.46, V('side', 'sh', -0.5)]], 0.005));
  add.trim(body.patch({ ns: 24, nt: 2, lift: 0.0045, at: (s, t) => [lerp(a - 0.95, -b + 0.42, s), V('side', 'sh', -0.5 + 0.12 * s + t * (0.16 - 0.1 * s))] })); // sill flash
  for (const g of both(box((a - b) / 2, 0.085, 0.95, a + b - 0.82, 0.06, 0.09))) add.black(g);
  for (const g of both(plate([[a - 0.42, 0.9], [a - 0.42, 1.04], [-b + 0.42, 1.05], [-b + 0.42, 0.9]], 0.012, 0.055))) add.carbon(g);
  for (const s of [1, -1]) { // side-exit exhaust: the pipe runs out through the bottom of the cut-out
    add.chrome(rod([a - 0.66, 0.2, s * 0.78], [a - 0.66, 0.2, s * 0.985], 0.043, 16));
    add.black(rod([a - 0.66, 0.2, s * 0.98], [a - 0.66, 0.2, s * 0.99], 0.036, 14));
    add.metal(rod([a - 0.66, 0.2, s * 0.6], [a - 0.5, 0.26, s * 0.8], 0.036, 10));
  }

  // ---- tail: upswept ducktail, thin C-shaped light blade, open mesh panel, deep diffuser
  const rearFace = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.tailX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 4, nt: 30, lift: 0.004, mirror: false, ...extra });
  const pV = across(V('sh', 'in', 0.3));
  const inPanel = (lo, hi) => [(X, Vv) => O.panel(X, Vv) - lo, ...(hi === Infinity ? [] : [(X, Vv) => hi - O.panel(X, Vv)])];
  // mesh opening: fine bars just inside, then the transaxle and its cooler deep in the cavity
  for (let k = 0; k < 5; k++) add.carbon(rearFace(0.41 + k * 0.065, 0.42 + k * 0.065, ...pV, { ns: 1, nt: 40, lift: -0.02, keep: inPanel(-0.002, Infinity) }));
  for (let k = -9; k <= 9; k++) add.carbon(rearFace(0.36, 0.76, T + k * 0.62 - 0.035, T + k * 0.62 + 0.035, { ns: 8, nt: 1, lift: -0.022, keep: inPanel(-0.002, Infinity) }));
  add.carbon(rearFace(0.3, 0.82, ...pV, { ns: 14, nt: 48, lift: 0.004, keep: inPanel(-0.012, 0.003) }));
  add.black(box(tail + 0.42, 0.55, 0, 0.02, 0.5, 1.3));
  add.metal(box(tail + 0.36, 0.52, 0, 0.1, 0.2, 0.34), rod([tail + 0.3, 0.6, -0.5], [tail + 0.3, 0.6, 0.5], 0.022), rod([tail + 0.3, 0.44, -0.5], [tail + 0.3, 0.44, 0.5], 0.016));
  for (const z of [-0.3, 0.3]) add.carbon(box(tail + 0.33, 0.52, z, 0.03, 0.22, 0.2, 0.25));
  // light blade: one thin line across the ducktail that wraps the corners and turns down, like a C
  const blade = (lift, grow) => {
    const out = [...rearFace(0.875 - grow, 0.905 + grow, ...across(V('side', 'sh', 0.5 - grow * 3)), { nt: 48, lift })];
    out.push(...rearFace(0.6 - grow * 2, 0.9, V('side', 'sh', 0.42 - grow * 3), V('side', 'sh', 0.58 + grow * 3), { mirror: true, nt: 2, ns: 8, lift }));
    out.push(...body.patch({ ns: 8, nt: 1, lift, at: (s2, t) => [lerp(tail + 0.05, tail + 0.34, s2), V('side', 'sh', 0.42 - grow * 3 + t * (0.16 + grow * 6) + 0.25 * s2)] }));
    return out;
  };
  add.black(blade(0.004, 0.02));
  add.rear(blade(0.007, 0));
  // bumper: body colour, with a vent sculpted into each corner and a centre rain light over the plate area
  add.black(rearFace(0.3, 0.52, V('side', 'sh', 0.3), V('sh', 'in', -0.15), { mirror: true, nt: 6, ns: 6, keep: [(X, Vv) => 0.03 - Math.abs(tailH(X) - 0.41) * 0.3 + 0] }));
  add.black(rearFace(0.235, 0.32, T - 2.2, T + 2.2, { nt: 8, ns: 3 }));
  add.rear(rearFace(0.25, 0.305, T - 0.45, T + 0.45, { nt: 3, ns: 2, lift: 0.007 }));
  add.black(rearFace(0.02, 0.2, ...across(V('side', 'sh', 0.15)), { ns: 4 }));
  // diffuser: a curved tunnel roof rising to the tail, with strakes that follow its curve
  const kick = (t) => 0.07 + 0.24 * t * t, dx0 = tail + 0.7, dx1 = tail - 0.03;
  const roofPts = [], n2 = 8;
  for (let i = 0; i <= n2; i++) roofPts.push([lerp(dx0, dx1, i / n2), kick(i / n2)]);
  for (let i = n2; i >= 0; i--) roofPts.push([lerp(dx0, dx1, i / n2), kick(i / n2) + 0.014]);
  add.carbon(slab(roofPts, 1.62, 0));
  const strake = [];
  for (let i = 0; i <= n2; i++) strake.push([lerp(dx0, dx1, i / n2), kick(i / n2) + 0.005]);
  strake.push([dx1, 0.05 + 0.1], [lerp(dx0, dx1, 0.75), 0.055], [dx0, 0.055]);
  for (let i = -4; i <= 4; i++) add.carbon(slab(strake, 0.012, i * 0.195 + Math.sign(i) * 0.012 * i * i * 0));
  for (const s2 of [1, -1]) add.carbon(slab([[dx0, 0.055], [dx0, 0.1], [dx1, 0.33], [dx1 - 0.02, 0.33], [dx1 - 0.02, 0.12], [dx1, 0.06]], 0.014, s2 * 0.82));
  for (let k = 0; k < 5; k++) add.black(body.rect({ x: [-b + 0.2 - k * 0.075, -b + 0.165 - k * 0.075], v: [V('side', 'sh', 0.9), V('sh', 'in', 0.04)], ns: 1, nt: 5, lift: 0.004 })); // rear arch louvres

  // ---- aero: splitter, dive planes, tall swan-neck wing
  const outline = [];
  for (let i = 0; i <= 14; i++) { const z = -1.0 + (2.0 * i) / 14; outline.push([nose + 0.13 - 0.34 * Math.abs(z) ** 2.3, z]); }
  add.carbon(plate([...outline, [a + 0.4, 1.0], [a + 0.4, -1.0]], 0.02, 0.045));
  for (const [y0, len] of [[0.19, 0.34], [0.33, 0.3]]) { // dive planes: curved up towards the wheel, with a small fence at the tip
    const x1 = nose - 0.27, top = [], n = 6;
    for (let i = 0; i <= n; i++) top.push([x1 - len * (i / n), y0 + 0.11 * (i / n) ** 1.8]);
    const prof = [...top.map(([x, y]) => [x, y + 0.012]).reverse(), ...top];
    for (const g of both(slab(prof, 0.16, 0.95))) add.carbon(g);
    for (const g of both(slab([[x1 - len * 0.35, y0 + 0.01], [x1 - len, y0 + 0.1], [x1 - len, y0 + 0.17], [x1 - len * 0.5, y0 + 0.07]], 0.008, 1.03))) add.carbon(g);
  }
  const wingX = tail + 0.0, wingY = 1.24;
  add.carbon(wing(wingX, wingY, 1.92, 0.4, { angle: 0.2, camber: 0.085 }));
  add.trim(box(wingX - 0.004, wingY + 0.055, 0, 0.012, 0.03, 1.92));
  // endplates: swept trailing edge with a notch, a cut-back lower front corner
  for (const g of both(slab([[wingX + 0.11, wingY + 0.13], [wingX + 0.03, wingY + 0.0], [wingX + 0.09, wingY - 0.05], [wingX + 0.0, wingY - 0.16], [wingX - 0.3, wingY - 0.16], [wingX - 0.47, wingY - 0.05], [wingX - 0.45, wingY + 0.05], [wingX - 0.3, wingY + 0.09]], 0.012, 0.965))) add.paint(g);
  for (const g of both(box(wingX - 0.18, wingY - 0.165, 0.965, 0.34, 0.012, 0.05))) add.carbon(g);
  for (const g of both(slab([[wingX - 0.03, wingY + 0.075], [wingX - 0.2, wingY + 0.085], [wingX - 0.3, wingY + 0.03], [tail + 0.5, 0.97], [tail + 0.7, 0.96], [wingX - 0.22, wingY - 0.04], [wingX - 0.04, wingY + 0.03]], 0.014, 0.36))) add.carbon(g);

  // ---- furniture: mirrors, wiper, antenna, tow loops, roof hatch outline
  const mirrorX = cowl - 0.2, mirrorY = 0.99;
  const housing = mirrorHousing(mirrorX, mirrorY);
  for (const g of housing.shell.flatMap(both)) add.paint(g);
  for (const g of housing.back.flatMap(both)) add.black(g);
  for (const g of both(rod([mirrorX + 0.05, mirrorY - 0.03, 0.9], [mirrorX + 0.07, 0.88, 0.76], 0.013))) add.black(g);
  add.black(tube([[cowl, 0.855, 0.05], [cowl - 0.3, 1.01, 0.24], [cowl - 0.36, 1.04, 0.3]], 0.006, 5));
  add.black(body.line([[-0.3, V('rail', 'top', 0.3)], [-0.3, V('rail', 'top', 0.95)], [-0.7, V('rail', 'top', 0.95)], [-0.7, V('rail', 'top', 0.3)], [-0.3, V('rail', 'top', 0.3)]], 0.005));
  add.black(rod([-0.85, 1.23, 0.2], [-0.92, 1.39, 0.2], 0.004, 5));
  // roof cooling duct, bonnet pins, fuel filler and air-jack socket on the rear quarter
  add.black(body.patch({ ns: 8, nt: 6, lift: 0.004, mirror: false, at: (s, t) => [lerp(header - 0.08, header - 0.26, s), T + (t - 0.5) * 2 * lerp(0.8, 0.3, s)] }));
  for (const [px, pt] of [[a + 0.55, 0.35], [cowl + 0.12, 0.5]]) { const q = body.point(px, V('in', 'rail', pt)); for (const s of [1, -1]) add.chrome(new CylinderGeometry(0.014, 0.014, 0.008, 10).translate(q.x, q.y + 0.004, s * q.z)); }
  { const q = body.point(-b + 0.1, V('sh', 'in', 0.6)); add.chrome(new CylinderGeometry(0.035, 0.035, 0.008, 16).translate(q.x, q.y + 0.004, q.z)); add.rear(new CylinderGeometry(0.02, 0.02, 0.012, 12).translate(q.x, q.y + 0.004, q.z)); }
  { const q = body.point(-b - 0.25, V('side', 'sh', 0.55)); add.chrome(new CylinderGeometry(0.03, 0.03, 0.01, 14).rotateX(Math.PI / 2).translate(q.x, q.y, -q.z - 0.004)); }
  add.trim(box(nose - 0.02, 0.2, 0.62, 0.04, 0.05, 0.014), box(tail + 0.0, 0.5, -0.56, 0.04, 0.05, 0.014));

  return {
    geometry: add.done(), rim: rimGeometry(),
    eye, roofHeight: 1.25, pod: [header - 0.02, 1.33, 0], mirrorX, mirrorY, door: [-0.2, 0.52, body.width(-0.2) + 0.012],
  };
}
