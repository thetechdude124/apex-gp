// Mid-engined GT3 coupe in the shape of the Ferrari 296 GT3.
// Real car: about 4.63 m long, 2.05 m wide, 1.19 m high. Low arrowhead nose, visor screen,
// haunch intakes behind the doors, flying buttresses either side of a sunken engine deck.
import * as THREE from 'three';
import { makeBody, batches, box, rod, tube, disc, slab, plate, wing, both, mirrorZ, rimGeometry, mirrorHousing, cockpit, quadRegion, ellipseRegion, curve, clamp, lerp } from './kit.js';

// Smooth strip lofted through rows of [x, y, z] points; `out` is a rough outward direction.
function loft(rows, out) {
  const nr = rows.length, nc = rows[0].length, pos = [], idx = [];
  for (const r of rows) for (const p of r) pos.push(...p);
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) {
    const a = i * nc + j, b = a + 1, c = a + nc, e = c + 1;
    idx.push(a, c, b, b, c, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  let vote = 0;
  for (let k = 0; k < n.count; k++) vote += n.getX(k) * out[0] + n.getY(k) * out[1] + n.getZ(k) * out[2];
  if (vote < 0) {
    const ix = g.index.array;
    for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; }
    g.computeVertexNormals();
  }
  return g.toNonIndexed();
}

export function ferrari(vehicle, quality = 1) {
  const a = 1.48, b = 1.23;                 // axle positions from the physics model
  const nose = a + 0.97, tail = -b - 0.85;
  const cowl = 1.02, header = 0.3, roofEnd = -0.5, wall = -0.62; // screen base, screen top, roof end, foot of the rear screen
  const NL = 0.21, NP = 2.2;
  const deckY = 0.915;
  // height fraction on the nose face (0 at the bottom edge, 1 where it meets the bonnet)
  const noseH = (X) => { const d = clamp((nose - X) / NL, 0, 1); return (1 - (1 - d) ** NP) ** (1 / NP); };
  const faceRegion = (h, v) => (X, V) => { const hh = noseH(X); return Math.min((hh - h[0]) * 0.22, (h[1] - hh) * 0.22, (V - v[0]) * 0.045, (v[1] - V) * 0.045); };
  const body = makeBody({
    x0: tail, x1: nose, axles: [a, -b], archR: 0.386, wellIn: 0.6, floor: 0.06,
    nose: { L: NL, p: NP, sweep: 0.46, pow: 2.3, len: 0.62 },
    tail: { L: 0.26, p: 2.5, sweep: 0.12, pow: 2.4, len: 0.5 },
    // plan: arrowhead nose, waist at the doors, widest over the rear wheels
    w: [[tail, 0.97], [-b - 0.4, 1.015], [-b, 1.028], [-b + 0.5, 0.995], [0.1, 0.925], [a - 0.5, 0.955], [a, 1.0], [a + 0.42, 0.98], [nose, 0.85]],
    wLip: [[tail, 0.955], [-b - 0.4, 1.005], [-b, 1.022], [-b + 0.45, 0.98], [0.1, 0.915], [a - 0.45, 0.945], [a, 0.996], [a + 0.4, 0.97], [nose, 0.83]],
    sill: [[tail, 0.26], [-b - 0.5, 0.21], [-b - 0.39, 0.115], [a + 0.39, 0.115], [a + 0.6, 0.1], [nose, 0.075]],
    sideY: [[tail, 0.5], [-b, 0.62], [-0.2, 0.46], [a - 0.5, 0.49], [a, 0.57], [nose, 0.28]],
    // wing line: low front wings, door shoulder dipping, tall haunches over the rear wheels
    shZ: [[tail, 0.83], [-b - 0.4, 0.88], [-b, 0.89], [-0.3, 0.85], [0.5, 0.86], [a, 0.83], [a + 0.5, 0.76], [nose, 0.68]],
    shY: [[tail, 0.84], [-b - 0.45, 0.93], [-b, 0.955], [-b + 0.5, 0.9], [0.1, 0.8], [cowl, 0.775], [a, 0.768], [a + 0.36, 0.715], [a + 0.66, 0.57], [nose, 0.36]],
    // base of the glasshouse; ahead of the screen it is the valley between wing and bonnet
    inZ: [[tail, 0.64], [-b, 0.75], [wall, 0.745], [0, 0.75], [cowl - 0.1, 0.735], [cowl + 0.2, 0.63], [a, 0.57], [nose, 0.5]],
    inY: [[tail, 0.855], [-b - 0.4, 0.922], [-b, 0.945], [wall, 0.925], [-0.2, 0.86], [0.5, 0.825], [cowl, 0.782, 'c'], [a, 0.655], [a + 0.4, 0.565], [a + 0.7, 0.45], [nose, 0.31]],
    // roof rail; behind the cabin it drops to the edge of the flat engine deck
    railZ: [[tail, 0.5], [wall, 0.5], [roofEnd, 0.525], [header, 0.545], [cowl, 0.685, 'c'], [a, 0.34], [nose, 0.3]],
    railY: [[tail, 0.86], [-1.7, deckY - 0.005], [wall, deckY, 'c'], [roofEnd, 1.14, 'c'], [-0.05, 1.165], [header, 1.122, 'c'], [cowl, 0.792, 'c'], [a, 0.66], [a + 0.4, 0.57], [a + 0.7, 0.455], [nose, 0.315]],
    top: [[tail, 0.865], [-1.7, deckY], [wall, deckY + 0.005, 'c'], [roofEnd, 1.165, 'c'], [-0.05, 1.19], [header, 1.148, 'c'], [cowl, 0.802, 'c'], [a, 0.668], [a + 0.4, 0.578], [a + 0.7, 0.462], [nose, 0.32]],
    round: { side: 1, sh: [[tail, 0.65], [-b, 0.55], [0, 0.5], [cowl, 0.6], [a, 0.75], [nose, 0.9]], in: [[tail, 0.5], [wall, 0.3], [cowl, 0.25], [cowl + 0.3, 0.9], [nose, 1]], rail: [[tail, 0.5], [wall, 0.4], [roofEnd, 0.65], [header, 0.55], [cowl, 0.75], [nose, 1]] },
    stations: [cowl, header, roofEnd, wall, roofEnd - 0.03, wall + 0.03],
    holes: (s) => Object.values(openings(s)),
  }, quality);


  function openings({ v, top }) {
    const mid = (v0) => [v0, 2 * top - v0];
    return {
      screen: quadRegion({ x: [header + 0.035, cowl - 0.05], v: mid(v('rail', 'top', 0.12)), r: 0.06 }),
      side: quadRegion({ x: [(t) => lerp(-0.47, roofEnd + 0.07, t), (t) => lerp(cowl - 0.2, header - 0.06, t)], v: [v('in', 'rail', 0.2), v('in', 'rail', 0.86)], r: 0.05 }),
      lamp: (X, V) => { // teardrop: fat at the front, drawn out to a point up the wing
        const cx = a + 0.5, t = (X - cx) / 0.29, half = 2.5 * Math.sqrt(Math.max(0, 1 - t * t)) * (0.55 + 0.45 * clamp((t + 1) / 2, 0, 1));
        return Math.abs(t) >= 1 ? -0.05 : (half - Math.abs(V - v('sh', 'in', 0.12))) * 0.045;
      },
      bonnet: quadRegion({ x: [(t) => a - 0.08 + 0.1 * t, (t) => a + 0.44 - 0.06 * t], v: [v('rail', 'top', -0.95), v('rail', 'top', 0.74)], r: 0.035 }),
      haunch: quadRegion({ x: [(t) => -b + 0.44 + 0.12 * t, (t) => -b + 1.02 - 0.3 * t], v: [v('side', 'sh', 0.0), v('side', 'sh', 0.8)], r: 0.04 }),
      exit: quadRegion({ x: [(t) => a - 0.78 + 0.12 * t, (t) => a - 0.47 - 0.02 * t], v: [v('side', 'sh', -0.55), v('side', 'sh', 0.3)], r: 0.03 }),
      deck: quadRegion({ x: [-1.68, wall - 0.12], v: mid(v('rail', 'top', 0.3)), r: 0.04 }),
      mouth: faceRegion([0.08, 0.6], [v('in', 'rail', 0.1), top - 0.28]),
      duct: faceRegion([0.1, 0.66], [v('side', 'sh', 0.42), v('sh', 'in', 0.62)]),
    };
  }
  const O = openings({ v: body.v, top: body.top });
  const V = (from, to, t) => body.v(from, to, t), T = body.top;
  const across = (v0) => [v0, body.far(v0)];

  const add = batches(['paint', 'trim', 'carbon', 'glass', 'lamps', 'rear', 'black', 'chrome', 'window', 'lens', 'liner', 'metal', 'suit']);
  add.paint(body.skin);
  add.black(body.under);
  add.liner(body.liner);

  // ---- glazing: visor screen running into the side glass behind blacked-out pillars
  const glaze = (d, bx, mirror = true) => {
    add.window(body.region(d, { ...bx, band: [-0.008, Infinity], lift: 0.0015, mirror }));
    add.black(body.region(d, { ...bx, band: [-0.024, 0.004], lift: 0.003, mirror, cell: 0.02 }));
  };
  glaze(O.screen, { x: [header - 0.02, cowl + 0.02], v: across(V('rail', 'top', -0.2)) }, false);
  glaze(O.side, { x: [-0.56, cowl - 0.1], v: [V('in', 'rail', 0.0), V('in', 'rail', 1.0)] });
  add.black(body.patch({ ns: 14, nt: 4, lift: 0.0035, at: (s, t) => [lerp(cowl - 0.03, header + 0.0, s), V('rail', 'top', lerp(-0.62, 0.2, t))] })); // A-pillars
  add.black(body.rect({ x: [header + 0.04, header - 0.03], v: across(V('rail', 'top', 0.1)), ns: 2, nt: 20, lift: 0.0035, mirror: false }));    // header band
  add.trim(body.rect({ x: [header + 0.15, header + 0.05], v: across(V('rail', 'top', 0.22)), ns: 3, nt: 22, lift: 0.004, mirror: false }));     // sun strip
  // upright rear screen between the buttresses
  add.black(body.rect({ x: [roofEnd + 0.01, wall - 0.01], v: across(V('rail', 'top', -0.1)), ns: 4, nt: 16, lift: 0.003, mirror: false }));
  add.glass(body.rect({ x: [roofEnd - 0.012, wall + 0.02], v: across(V('rail', 'top', 0.12)), ns: 4, nt: 16, lift: 0.006, mirror: false }));

  // ---- cabin
  const eye = [0.22, 0.965, -0.33], steer = [eye[0] + 0.42, eye[1] - 0.235, eye[2]];
  const cab = cockpit({ seat: [eye[0] - 0.06, 0.27, eye[2]], wheel: steer, cabin: { x0: -0.5, x1: 0.78, w: 0.69, roof: 1.165, floor: 0.11, dash: 0.775 } });
  add.black(cab.black); add.carbon(cab.carbon); add.carbon(cab.metal); add.suit(cab.suit);

  // ---- nose: wide shallow mouth split by a keel, tall brake ducts, teardrop lamps
  const face = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.noseX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 8, nt: 14, lift: 0.004, ...extra });
  const mouthV = [V('in', 'rail', 0.1), T - 0.28], ductV = [V('side', 'sh', 0.42), V('sh', 'in', 0.62)];
  add.carbon(face(0.04, 0.64, mouthV[0] - 0.5, mouthV[1] + 0.3, { keep: [(X, Vv) => 0.012 + O.mouth(X, Vv), (X, Vv) => 0.002 - O.mouth(X, Vv)], ns: 14, nt: 30 }));   // mouth rim
  add.carbon(face(0.05, 0.7, ductV[0] - 0.5, ductV[1] + 0.5, { keep: [(X, Vv) => 0.012 + O.duct(X, Vv), (X, Vv) => 0.002 - O.duct(X, Vv)], ns: 14, nt: 16 }));         // duct rim
  for (let k = 0; k < 3; k++) add.carbon(face(0.17 + k * 0.14, 0.195 + k * 0.14, mouthV[0], mouthV[1], { lift: -0.035, ns: 1, nt: 20 }));                             // mouth slats
  for (let k = 1; k <= 6; k++) { const vv = lerp(mouthV[0], mouthV[1], k / 7); add.carbon(face(0.08, 0.6, vv - 0.08, vv + 0.08, { lift: -0.04, ns: 5, nt: 1 })); }      // mesh uprights
  for (let k = 0; k < 2; k++) add.carbon(face(0.27 + k * 0.2, 0.3 + k * 0.2, ductV[0], ductV[1], { lift: -0.03, ns: 1, nt: 8 }));
  add.trim(face(0.72, 0.76, ...across(V('side', 'sh', 0.5)), { mirror: false, nt: 44, lift: 0.005, ns: 1 }));                                                          // pinstripe over the intakes
  // lamp units: dark bowl sunk in the wing, two projectors, a slim light blade along the inner edge
  const lampBox = { x: [a + 0.18, a + 0.82], v: [V('sh', 'in', -3.2), V('sh', 'in', 3.4)] }, lx = a + 0.5, lv = V('sh', 'in', 0.12);
  add.carbon(body.region(O.lamp, { ...lampBox, band: [-0.012, Infinity], lift: -0.04, cell: 0.02 }));
  add.chrome(body.region(O.lamp, { ...lampBox, band: [-0.014, 0.004], lift: 0.003, cell: 0.012 }));
  add.lens(body.region(O.lamp, { ...lampBox, band: [-0.004, Infinity], lift: 0.001, cell: 0.02 }));
  for (const dx of [0.12, 0.0, -0.11]) {
    const ring = (r0, r1, lift) => body.patch({ ns: 2, nt: 14, lift, at: (s, t) => [lx + dx + lerp(r0, r1, s) * Math.cos(t * 6.2832), lv + (lerp(r0, r1, s) / 0.05) * Math.sin(t * 6.2832)] });
    add.lamps(ring(0, 0.03, -0.024)); add.chrome(ring(0.03, 0.041, -0.022));
  }
  add.lamps(body.patch({ ns: 14, nt: 1, lift: -0.012, at: (s, t) => [lx + lerp(0.22, -0.22, s), lv + 1.8 * Math.sqrt(Math.max(0, 1 - (lerp(0.22, -0.22, s) / 0.29) ** 2)) * (0.55 + 0.45 * (lerp(0.22, -0.22, s) / 0.29 + 1) / 2) + (t - 0.5) * 0.5] })); // LED blade
  // bonnet extractor: two outlets either side of a painted bridge, with turning vanes inside
  for (let k = 0; k < 5; k++) add.carbon(body.rect({ x: [a + 0.36 - k * 0.085, a + 0.325 - k * 0.085], v: [V('rail', 'top', -0.95), V('rail', 'top', 0.74)], ns: 1, nt: 8, lift: -0.018 }));
  add.carbon(body.region(O.bonnet, { x: [a - 0.14, a + 0.5], v: [V('rail', 'top', -1.3), V('rail', 'top', 1.0)], band: [-0.014, 0.004], lift: 0.003, cell: 0.015 }));
  // louvres on the wing tops
  for (let k = 0; k < 6; k++) add.black(body.rect({ x: [a + 0.2 - k * 0.075, a + 0.165 - k * 0.075], v: [V('side', 'sh', 0.86), V('sh', 'in', 0.06)], ns: 1, nt: 5, lift: 0.004 }));

  // ---- flanks: wheel-arch exit, door, haunch intake scooped into the rear wing
  const doorF = cowl - 0.08, doorR = -0.44, low = V('side', 'sh', -0.72);
  add.black(body.line([[doorF, low], [doorF - 0.02, V('sh', 'in', 0.5)]], 0.006));
  add.black(body.line([[doorR, low], [doorR - 0.04, V('sh', 'in', 0.5)]], 0.006));
  add.black(body.line([[doorF, low], [doorR, low]], 0.006));
  add.black(body.line([[a + 0.39, V('side', 'sh', 0.1)], [a + 0.46, V('side', 'sh', -0.7)]], 0.005));
  add.black(body.line([[-b - 0.4, V('side', 'sh', 0.3)], [-b - 0.46, V('side', 'sh', -0.5)]], 0.005));
  for (const d of [O.haunch, O.exit]) add.carbon(body.region(d, { x: [-b + 0.3, a - 0.3], v: [V('side', 'sh', -0.9), V('side', 'sh', 1.0)], band: [-0.016, 0.004], lift: 0.003, cell: 0.015 }));
  for (let k = 0; k < 2; k++) add.carbon(body.patch({ ns: 6, nt: 1, lift: -0.03, at: (s, t) => [lerp(-b + 0.48, -b + 0.92 - 0.1 * k, s), V('side', 'sh', 0.25 + 0.27 * k + t * 0.05)] }));   // intake vanes
  for (let k = 0; k < 3; k++) add.carbon(body.rect({ x: [a - 0.72 + k * 0.075, a - 0.695 + k * 0.075], v: [V('side', 'sh', -0.5), V('side', 'sh', 0.25)], ns: 1, nt: 5, lift: -0.02 }));
  // ducting behind the side openings, so they read as dark tunnels and not as windows into the cabin
  for (const sgn of [1, -1]) {
    add.black(box(-b + 0.72, 0.6, sgn * 0.76, 0.75, 0.56, 0.012), box(-b + 0.4, 0.6, sgn * 0.84, 0.012, 0.56, 0.18));
    add.black(box(a - 0.62, 0.42, sgn * 0.78, 0.5, 0.56, 0.012));
  }
  add.black(box(-1.2, deckY - 0.16, 0, 1.0, 0.02, 0.9)); add.carbon(box(-1.15, deckY - 0.1, 0, 0.5, 0.09, 0.42), box(-1.15, deckY - 0.07, 0.3, 0.6, 0.05, 0.1), box(-1.15, deckY - 0.07, -0.3, 0.6, 0.05, 0.1)); // engine under the louvres
  add.trim(body.patch({ ns: 20, nt: 1, lift: 0.004, at: (s, t) => [lerp(a - 0.42, -b + 0.44, s), V('side', 'sh', -0.6 + t * 0.07)] }));                                                 // sill pinstripe
  add.black(box((a - b) / 2, 0.085, 0.945, a + b - 0.82, 0.06, 0.09), box((a - b) / 2, 0.085, -0.945, a + b - 0.82, 0.06, 0.09));
  add.carbon(plate([[a - 0.42, 0.9], [a - 0.42, 1.035], [-b + 0.42, 1.045], [-b + 0.42, 0.9]], 0.012, 0.055), plate([[a - 0.42, -1.035], [a - 0.42, -0.9], [-b + 0.42, -0.9], [-b + 0.42, -1.045]], 0.012, 0.055));

  add.black(body.patch({ ns: 6, nt: 6, lift: 0.004, at: (s, t) => [lerp(-b - 0.44, tail + 0.16, s), V('side', 'sh', lerp(-0.72, -0.05 - 0.3 * s, t))] }));
  for (let k = 0; k < 3; k++) add.carbon(body.patch({ ns: 6, nt: 1, lift: 0.008, at: (s, t) => [lerp(-b - 0.44, tail + 0.18, s), V('side', 'sh', -0.58 + k * 0.17 - 0.1 * s * k + t * 0.035)] }));
  // ---- flying buttresses: fairings running from the roof to the tail, upright on the inside
  {
    const ridgeY = curve([[-1.92, 0.895], [-1.5, 0.935], [-1.1, 0.975], [-0.82, 1.035], [wall, 1.1], [roofEnd, 1.13], [roofEnd + 0.1, 1.135]]);
    const ridgeZ = curve([[-1.92, 0.7], [-1.2, 0.61], [wall, 0.545], [roofEnd + 0.1, 0.535]]);
    const rows = [], p = new THREE.Vector3(), n = Math.round(44 * Math.max(0.4, quality));
    for (let i = 0; i <= n; i++) {
      const x = lerp(roofEnd + 0.1, -1.92, i / n), yr = ridgeY(x), zr = ridgeZ(x), zi = zr - 0.075;
      body.point(x, V('in'), p);
      const base = [p.z + 0.01, Math.min(p.y - 0.012, yr - 0.004)], deck = Math.min(deckY - 0.02, yr - 0.004);
      const sec = [base, [lerp(zr, base[0], 0.5), lerp(yr, base[1], 0.38)], [zr + 0.03, yr - 0.012], [zr + 0.005, yr], [zi + 0.02, yr], [zi, yr - 0.02], [zi, lerp(yr, deck, 0.5)], [zi, deck]];
      rows.push(sec.map(([z, y]) => [x, y, z]));
    }
    const outer = loft(rows.map((r) => r.slice(0, 5)), [0, 0.5, 1]), inner = loft(rows.map((r) => r.slice(4)), [0, 0, -1]);
    add.paint(outer, mirrorZ(outer), inner, mirrorZ(inner));
  }
  // louvred engine cover sunk between them
  add.carbon(body.region(O.deck, { x: [-1.76, wall - 0.04], v: across(V('rail', 'top', -0.1)), band: [-0.016, 0.004], lift: 0.003, cell: 0.02, mirror: false }));
  for (let k = 0; k < 9; k++) add.carbon(box(-0.8 - k * 0.1, deckY - 0.012, 0, 0.075, 0.008, 0.82, 0.3));
  add.paint(box(-1.21, deckY - 0.004, 0, 0.94, 0.012, 0.07));                                                                         // spine over the louvres

  // ---- tail: full-width mesh panel, slim corner lamps, one big centre exhaust, deep diffuser
  const rearFace = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.tailX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 4, nt: 30, lift: 0.004, mirror: false, ...extra });
  add.black(rearFace(0.5, 0.94, ...across(V('side', 'sh', 0.55)), { nt: 40, ns: 6 }));
  for (let k = 0; k < 5; k++) add.carbon(rearFace(0.54 + k * 0.075, 0.553 + k * 0.075, ...across(V('side', 'sh', 0.6)), { nt: 40, ns: 1, lift: 0.007 }));
  for (let k = -9; k <= 9; k++) add.carbon(rearFace(0.52, 0.92, T + k * 1.25 - 0.06, T + k * 1.25 + 0.06, { nt: 1, ns: 5, lift: 0.007 }));
  add.rear(rearFace(0.8, 0.88, V('side', 'sh', 0.7), V('sh', 'in', 0.75), { nt: 12, lift: 0.009, mirror: true }));
  add.chrome(rearFace(0.775, 0.905, V('side', 'sh', 0.62), V('sh', 'in', 0.85), { nt: 12, lift: 0.0075, mirror: true }));
  add.chrome(disc(tail + 0.0, 0.64, 0, 0.09, 0.12, 24, true), new THREE.TorusGeometry(0.09, 0.012, 8, 28).rotateY(Math.PI / 2).translate(tail - 0.06, 0.64, 0)); add.black(disc(tail + 0.0, 0.64, 0, 0.082, 0.02)); add.carbon(disc(tail - 0.045, 0.64, 0, 0.125, 0.012, 24));
  add.black(rearFace(0.03, 0.4, ...across(V('sh', 'in', -0.6)), { ns: 6 }));
  add.black(box(tail + 0.24, 0.19, 0, 0.66, 0.012, 1.6, 0.2));
  for (let i = -5; i <= 5; i++) add.carbon(slab([[tail - 0.12, 0.34], [tail + 0.52, 0.06], [tail + 0.52, 0.18], [tail - 0.12, 0.37]], 0.012, i * 0.155));
  add.rear(box(tail - 0.015, 0.3, 0, 0.02, 0.07, 0.1));                                                                                // rain light

  // ---- aero: splitter, big dive planes, tall swan-neck wing
  const outline = [];
  for (let i = 0; i <= 16; i++) { const z = -0.99 + (1.98 * i) / 16; outline.push([nose + 0.1 - 0.48 * Math.abs(z / 0.99) ** 2.3, z]); }
  add.carbon(plate([...outline, [a + 0.4, 1.0], [a + 0.4, -1.0]], 0.02, 0.045));
  for (const [y0, len, drop] of [[0.19, 0.34, 0.09], [0.34, 0.3, 0.1]]) for (const g of both(slab([[nose - 0.36 - len, y0 + drop], [nose - 0.38, y0], [nose - 0.38, y0 + 0.012], [nose - 0.36 - len, y0 + drop + 0.015]], 0.16, 0.93))) add.carbon(g);
  const wingX = tail - 0.06, wingY = 1.23;
  add.carbon(wing(wingX, wingY, 1.9, 0.4, { angle: 0.2, camber: 0.09 }));
  add.trim(box(wingX - 0.004, wingY + 0.057, 0, 0.012, 0.03, 1.9));
  for (const g of both(slab([[wingX + 0.07, wingY - 0.14], [wingX - 0.4, wingY - 0.16], [wingX - 0.47, wingY - 0.04], [wingX - 0.43, wingY + 0.08], [wingX + 0.07, wingY + 0.12]], 0.012, 0.955))) add.paint(g);
  for (const g of both(slab([[wingX - 0.03, wingY + 0.078], [wingX - 0.2, wingY + 0.09], [wingX - 0.31, wingY + 0.035], [-b - 0.42, 0.9], [-b - 0.22, 0.89], [wingX - 0.23, wingY - 0.04], [wingX - 0.04, wingY + 0.03]], 0.014, 0.32))) add.carbon(g);

  // ---- furniture: mirrors on door stalks, wiper, antenna, tow loops, roof hatch outline
  const mirrorX = cowl - 0.3, mirrorY = 0.945;
  const housing = mirrorHousing(mirrorX, mirrorY);
  for (const g of housing.shell.flatMap(both)) add.trim(g);
  for (const g of housing.back.flatMap(both)) add.black(g);
  for (const g of both(rod([mirrorX + 0.05, mirrorY - 0.03, 0.9], [mirrorX + 0.09, 0.84, 0.775], 0.013))) add.black(g);
  add.black(tube([[cowl + 0.0, 0.81, 0.0], [cowl - 0.3, 0.97, 0.2], [cowl - 0.36, 1.0, 0.26]], 0.006, 5));
  add.black(body.line([[0.1, V('rail', 'top', 0.25)], [0.1, V('rail', 'top', 0.95)], [-0.3, V('rail', 'top', 0.95)], [-0.3, V('rail', 'top', 0.25)], [0.1, V('rail', 'top', 0.25)]], 0.005, { mirror: false }));
  add.black(rod([-0.38, 1.17, 0.18], [-0.45, 1.32, 0.18], 0.004, 5));
  add.trim(box(nose - 0.075, 0.17, 0.6, 0.04, 0.05, 0.014), box(tail + 0.0, 0.47, -0.55, 0.04, 0.05, 0.014));

  return {
    geometry: add.done(), rim: rimGeometry(),
    eye, roofHeight: 1.19, pod: [header - 0.02, 1.27, 0], mirrorX, mirrorY, door: [0.3, 0.5, body.width(0.3) + 0.012],
  };
}
