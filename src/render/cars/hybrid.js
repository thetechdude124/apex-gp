// Closed-cockpit Le Mans hybrid prototype: narrow bubble cockpit between tall pontoon fenders,
// deep channels either side of the nose, shark fin and a full-width wing with vertical light blades.
import { makeBody, batches, box, ellipsoid, rod, slab, plate, wing, both, rimGeometry, lerp, smoothstep } from './kit.js';

export function hybrid(vehicle, quality = 1) {
  const a = 1.68, b = 1.46;              // axle positions from the physics model
  const nose = a + 0.96, tail = -b - 0.9;
  const cowl = 1.0, header = 0.42, roofEnd = -0.5; // cockpit stations
  const body = makeBody({
    x0: tail, x1: nose, axles: [a, -b], archR: 0.405, wellIn: 0.6, floor: 0.05,
    nose: { L: 0.2, p: 2.4, sweep: 0.3, pow: 3.2, len: 0.7 },
    tail: { L: 0.1, p: 3, sweep: 0.03, pow: 3, len: 0.3 },
    w: [[tail, 0.985], [-b, 1.0], [-b + 0.6, 0.985], [0.1, 0.965], [a - 0.6, 0.98], [a, 1.0], [a + 0.5, 0.99], [nose, 0.95]],
    wLip: [[tail, 0.98], [-b, 0.995], [0.1, 0.96], [a, 0.995], [nose, 0.94]],
    sill: [[tail, 0.2], [-b - 0.5, 0.16], [-b, 0.1], [a, 0.1], [a + 0.5, 0.09], [nose, 0.075]],
    sideY: [[tail, 0.45], [-b, 0.5], [-0.3, 0.34], [0.8, 0.34], [a, 0.5], [nose, 0.24]],
    // fender crowns: tall over each wheel, dropping to a low sidepod between them
    shZ: [[tail, 0.86], [-b, 0.85], [0, 0.84], [a, 0.84], [a + 0.5, 0.82], [nose, 0.78]],
    shY: [[tail, 0.72], [-b - 0.45, 0.79], [-b, 0.82], [-b + 0.4, 0.79], [-b + 0.85, 0.6], [-0.1, 0.55], [a - 0.75, 0.55], [a - 0.48, 0.7], [a - 0.2, 0.8], [a, 0.815], [a + 0.3, 0.78], [a + 0.62, 0.6], [nose, 0.3]],
    // channel floor between fender and cockpit; it rises to become the sidepod top amidships
    inZ: [[tail, 0.5], [-b, 0.5], [-0.6, 0.56], [0.3, 0.6], [cowl, 0.58], [a, 0.55], [nose, 0.52]],
    inY: [[tail, 0.44], [-b, 0.47], [-b + 0.85, 0.52], [-0.1, 0.54], [a - 0.75, 0.52], [a - 0.3, 0.42], [a, 0.38], [a + 0.45, 0.33], [nose, 0.27]],
    // cockpit pod: nose spine rising to a bubble canopy, then the engine cover falling to the tail
    railZ: [[tail, 0.2], [-b, 0.24], [-1.0, 0.28], [roofEnd, 0.36], [header, 0.38], [cowl, 0.44, 'c'], [a, 0.36], [nose, 0.32]],
    railY: [[tail, 0.5], [-b, 0.6], [-1.0, 0.72], [roofEnd, 0.9], [0.05, 0.94], [header, 0.9, 'c'], [cowl, 0.57, 'c'], [a, 0.45], [a + 0.45, 0.37], [nose, 0.28]],
    top: [[tail, 0.56], [-b, 0.68], [-1.0, 0.82], [roofEnd, 1.0], [0.05, 1.04], [header, 0.99, 'c'], [cowl, 0.6, 'c'], [a, 0.47], [a + 0.45, 0.385], [nose, 0.285]],
    round: {
      side: [[tail, 0.6], [-0.3, 0.5], [0.8, 0.5], [nose, 0.9]],
      sh: [[tail, 0.7], [-b, 0.85], [-0.1, 0.45], [a - 0.75, 0.45], [a, 0.85], [nose, 0.9]],
      in: [[tail, 0.6], [-0.1, 0.35], [a - 0.75, 0.4], [a, 0.75], [nose, 0.9]],
      rail: [[tail, 0.9], [roofEnd, 0.9], [header, 0.8], [cowl, 0.7], [nose, 0.9]],
    },
    stations: [cowl, header, roofEnd],
  }, quality);

  const add = batches(['paint', 'trim', 'carbon', 'glass', 'lamps', 'rear', 'black', 'chrome']);
  add.paint(body.skin);
  add.black(body.under);
  const V = (from, to, t) => body.v(from, to, t);
  const across = (from, to, t) => [V(from, to, t), body.far(V(from, to, t))];

  // ---- canopy: wrap-round screen and side glass
  add.black(body.rect({ x: [cowl + 0.02, header - 0.03], v: across('in', 'rail', 0.36), ns: 12, nt: 26, lift: 0.0015, mirror: false }));
  add.glass(body.rect({ x: [cowl - 0.03, header + 0.02], v: across('in', 'rail', 0.46), ns: 12, nt: 26, lift: 0.004, mirror: false }));
  const sideWin = (grow, lift) => body.patch({ ns: 14, nt: 6, lift, at: (s, t) => {
    const x = lerp(header + 0.12 + grow, roofEnd + 0.02 - grow, s);
    return [x, V('in', 'rail', lerp(0.36 + 0.25 * s * s - grow, 1.08 + grow, t))];
  } });
  add.black(sideWin(0.03, 0.0015));
  add.glass(sideWin(0, 0.004));
  add.trim(body.rect({ x: [header + 0.1, header + 0.03], v: across('rail', 'top', 0.0), ns: 2, nt: 16, lift: 0.006, mirror: false }));

  // ---- nose: low centre intake between the fenders, vertical light blades on the fender fronts
  const face = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.noseX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 6, nt: 14, lift: 0.004, ...extra });
  add.black(face(0.08, 0.74, ...across('sh', 'in', 0.78), { mirror: false, nt: 30 }));
  for (let k = 1; k <= 2; k++) add.carbon(face(0.1 + k * 0.2, 0.1 + k * 0.2 + 0.03, ...across('sh', 'in', 0.8), { mirror: false, nt: 30, ns: 1, lift: 0.007 }));
  add.black(face(0.12, 0.6, V('side', 'sh', 0.45), V('sh', 'in', 0.3))); // fender-front brake ducts
  const blade = (x0, x1, w, mat, lift) => mat(body.line([[x0, V('side', 'sh', 0.05)], [lerp(x0, x1, 0.5), V('side', 'sh', 0.5)], [x1, V('side', 'sh', 0.92)]], w, { lift }));
  blade(a + 0.74, a + 0.5, 0.075, add.black, 0.003);
  blade(a + 0.74, a + 0.5, 0.035, add.lamps, 0.006);
  // nose spine stripe and a duct ahead of the screen
  add.trim(body.rect({ x: [nose - 0.22, cowl + 0.25], v: across('rail', 'top', 0.72), ns: 16, nt: 2, lift: 0.0045, mirror: false }));
  add.black(body.rect({ x: [cowl + 0.2, cowl + 0.06], v: across('rail', 'top', 0.35), ns: 2, nt: 10, lift: 0.005, mirror: false }));

  // ---- fenders: louvres over the wheels, outlets behind them
  for (const ax of [a, -b]) for (let k = 0; k < 5; k++) add.black(body.rect({ x: [ax + 0.2 - k * 0.085, ax + 0.155 - k * 0.085], v: [V('side', 'sh', 0.92), V('sh', 'in', 0.32)], ns: 1, nt: 5, lift: 0.004 }));
  add.black(body.patch({ ns: 6, nt: 8, lift: 0.004, at: (s, t) => [lerp(a - 0.43, a - 0.72 + 0.14 * t, s), V('side', 'sh', lerp(-0.85, 0.5, t))] }));
  // ---- sidepods: radiator intake facing forward in the channel, shut line, accent sweep
  add.black(body.patch({ ns: 8, nt: 6, lift: 0.004, at: (s, t) => [lerp(a - 0.78, a - 1.1, s), V('sh', 'in', lerp(0.2, 0.95, t))] }));
  add.black(body.line([[0.9, V('side', 'sh', -0.7)], [0.9, V('side', 'sh', 0.8)]], 0.007));
  add.black(body.line([[-0.2, V('side', 'sh', -0.7)], [-0.2, V('side', 'sh', 0.8)]], 0.007));
  add.trim(body.patch({ ns: 26, nt: 2, lift: 0.0045, at: (s, t) => {
    const x = lerp(a - 0.75, -b + 0.5, s);
    return [x, V('side', 'sh', -0.55 + 0.9 * s * s + t * (0.3 - 0.12 * s))];
  } }));
  add.black(body.patch({ ns: 6, nt: 5, lift: 0.004, at: (s, t) => [lerp(-b + 0.8, -b + 0.52, s), V('side', 'sh', lerp(-0.2 + 0.3 * s, 0.6, t))] })); // rear brake intake

  // ---- engine cover: roof scoop, shark fin, side gills
  add.paint(ellipsoid(-0.3, 1.045, 0, 0.42, 0.065, 0.12));
  add.black(ellipsoid(-0.02, 1.085, 0, 0.09, 0.05, 0.1));
  const wingX = tail - 0.1, wingY = 0.97;
  add.paint(slab([[roofEnd + 0.3, 1.0], [-0.8, 0.99], [wingX - 0.34, wingY - 0.05], [wingX - 0.1, wingY - 0.07], [wingX - 0.12, 0.55], [-b, 0.66], [-1.0, 0.8], [roofEnd, 0.96]], 0.02, 0, 0.004));
  for (let k = 0; k < 4; k++) add.black(body.rect({ x: [-0.75 - k * 0.11, -0.81 - k * 0.11], v: [V('in', 'rail', 0.3), V('in', 'rail', 0.85)], ns: 1, nt: 4, lift: 0.004 }));

  // ---- tail: open mesh between the fenders, vertical light blades, big diffuser
  const rearFace = (h0, h1, v0, v1, extra = {}) => body.patch({ at: (s, t) => [body.tailX(lerp(h0, h1, s)), lerp(v0, v1, t)], ns: 4, nt: 30, lift: 0.004, mirror: false, ...extra });
  add.black(rearFace(0.04, 0.92, ...across('side', 'sh', 0.7)));
  for (let k = 1; k <= 4; k++) add.carbon(rearFace(0.04 + k * 0.17, 0.04 + k * 0.17 + 0.02, ...across('sh', 'in', 0.1), { ns: 1, lift: 0.007 }));
  for (const g of both(box(tail - 0.005, 0.48, 0.905, 0.03, 0.46, 0.035))) add.rear(g);
  add.rear(box(tail - 0.01, 0.27, 0, 0.03, 0.06, 0.12));
  for (const z of [-0.12, 0.12]) add.chrome(rod([tail + 0.12, 0.42, z], [tail - 0.03, 0.42, z], 0.04, 12));

  // ---- aero: splitter with fences, floor edge, diffuser, wing
  const outline = [];
  for (let i = 0; i <= 12; i++) { const z = -0.99 + (1.98 * i) / 12; outline.push([nose + 0.1 - 0.36 * Math.abs(z) ** 3.2, z]); }
  add.carbon(plate([...outline, [a + 0.42, 1.0], [a + 0.42, -1.0]], 0.02, 0.04));
  for (const g of both(slab([[nose - 0.3, 0.04], [nose - 0.3, 0.19], [nose - 0.5, 0.25], [nose - 0.5, 0.04]], 0.012, 0.995))) add.carbon(g);
  for (const g of both(slab([[nose - 0.62, 0.28], [nose - 0.36, 0.2], [nose - 0.36, 0.212], [nose - 0.62, 0.295]], 0.14, 0.95))) add.carbon(g);
  for (const g of both(box((a - b) / 2, 0.07, 0.96, a + b - 0.86, 0.045, 0.12))) add.carbon(g);
  add.carbon(box(tail + 0.3, 0.2, 0, 0.75, 0.012, 1.84, 0.26));
  for (let i = -4; i <= 4; i++) add.carbon(slab([[tail - 0.14, 0.42], [tail + 0.6, 0.05], [tail + 0.6, 0.2], [tail - 0.14, 0.46]], 0.012, i * 0.2));
  add.carbon(wing(wingX, wingY, 1.92, 0.36, { angle: 0.16, camber: 0.09 }));
  add.trim(wing(wingX - 0.005, wingY + 0.04, 1.92, 0.06, { angle: 0.8, camber: 0.02, thick: 0.3 }));
  // tall endplates standing on the rear fenders
  for (const g of both(slab([[wingX + 0.07, wingY + 0.1], [wingX - 0.4, wingY + 0.07], [wingX - 0.48, 0.84], [wingX - 0.36, 0.66], [wingX + 0.07, 0.6]], 0.014, 0.965))) add.paint(g);
  for (const g of both(slab([[wingX - 0.05, wingY + 0.03], [wingX - 0.28, wingY + 0.03], [wingX - 0.3, wingY - 0.02], [-b - 0.55, 0.62], [-b - 0.35, 0.6], [wingX - 0.08, wingY - 0.04]], 0.014, 0.3))) add.carbon(g);

  // ---- furniture: mirrors on the fenders, wiper, antenna, tow loops
  const mirrorX = a - 0.42, mirrorY = 0.89;
  for (const g of both(ellipsoid(mirrorX + 0.03, mirrorY, 0.95, 0.08, 0.045, 0.09))) add.paint(g);
  for (const g of both(rod([mirrorX + 0.03, mirrorY - 0.03, 0.93], [mirrorX + 0.05, 0.78, 0.88], 0.012))) add.black(g);
  add.black(rod([cowl - 0.02, 0.62, 0.0], [cowl - 0.36, 0.86, 0.12], 0.007));
  add.black(rod([-0.3, 1.1, 0.0], [-0.36, 1.26, 0.0], 0.004));
  add.trim(box(nose - 0.01, 0.16, 0.25, 0.04, 0.045, 0.014));

  return {
    geometry: add.done(), rim: rimGeometry(),
    eye: [0.3, 0.86, -0.12], roofHeight: 1.04, mirrorX, mirrorY, door: [0.35, 0.33, body.width(0.35) + 0.012],
  };
}
