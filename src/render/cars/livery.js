// Team liveries for the closed cars, painted once per (team colours, car, number) into a canvas.
//
// kit.js gives painted bodywork UVs by projection (see LIVERY there): the car seen from its
// left, from its right and from above, stacked in one texture. Everything here is drawn in
// car metres through a "pen" per view, so a design is written once for the flank and lands
// the right way round on both sides. Text always reads correctly, never mirrored.
import * as THREE from 'three';
import { LIVERY } from './kit.js';

const DX = LIVERY.x1 - LIVERY.x0;
const CARBON = '#121316';
// invented technical partners for the small marks (never a real brand, never another team)
const MARKS = ['VOLTAIC', 'ORBITAL', 'TYREX', 'VELOCE', 'AEROMAX', 'LUMARA', 'KORVO', 'DENALIS', 'PELAGO', 'APEX GP'];

const hexOf = (c) => '#' + c.getHexString();
const mix = (a, b, t) => hexOf(new THREE.Color(a).lerp(new THREE.Color(b), t));
const rgba = (hex, a) => { const c = new THREE.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; };
const lum = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
const ink = (bg) => (lum(bg) > 0.2 ? '#111318' : '#f3f5f8');

// One view of the car. `map(a, b)` takes car metres to canvas pixels: (x, height) on the two
// side views, (x, z) on the top view. `ex`/`ey` are the pixel steps for one metre each way.
function makePen(g, W, H, view) {
  const band = LIVERY[view];
  const side = view !== 'top';
  const map = side
    ? (x, y) => [(view === 'left' ? (x - LIVERY.x0) / DX : 1 - (x - LIVERY.x0) / DX) * W, H * (1 - (band[0] + (band[1] - band[0]) * (y / LIVERY.yMax)))]
    : (x, z) => [((x - LIVERY.x0) / DX) * W, H * (1 - (band[0] + (band[1] - band[0]) * ((z + LIVERY.zMax) / (2 * LIVERY.zMax))))];
  const o = map(0, 0), px = map(1, 0), py = map(0, 1);
  const ex = [px[0] - o[0], px[1] - o[1]], ey = [py[0] - o[0], py[1] - o[1]];
  const path = (pts) => { g.beginPath(); pts.forEach(([a, b], i) => { const [x, y] = map(a, b); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); };
  const pen = {
    view, side, map,
    // everything drawn inside fn stays inside this view's band
    clip(fn) {
      g.save(); g.beginPath();
      g.rect(0, H * (1 - band[1]), W, H * (band[1] - band[0])); g.clip();
      fn(); g.restore();
    },
    fill(pts, style) { path(pts); g.closePath(); g.fillStyle = style; g.fill(); },
    rect(a0, b0, a1, b1, style) { pen.fill([[a0, b0], [a1, b0], [a1, b1], [a0, b1]], style); },
    line(pts, width, style, round = true) {
      path(pts); g.strokeStyle = style; g.lineWidth = width * Math.abs(ey[1]); g.lineJoin = g.lineCap = round ? 'round' : 'butt'; g.stroke();
    },
    // gradient between two points given in metres
    grad(a0, b0, a1, b1, stops) {
      const p = map(a0, b0), q = map(a1, b1), gr = g.createLinearGradient(p[0], p[1], q[0], q[1]);
      for (const [t, c] of stops) gr.addColorStop(t, c);
      return gr;
    },
    // Text of the given letter height (metres), centred on (a, b). `along` and `up` are the
    // reading direction and the top-of-letters direction in this view's own axes; on the side
    // views the default reads normally for someone standing beside the car.
    text(str, a, b, size, style, { along, up, maxW, font = '800 {px}px "Helvetica Neue", Arial, sans-serif', spacing = 0, slope = 0, align = 'center', stroke, strokeW = 0.012 } = {}) {
      along ||= side ? [view === 'left' ? 1 : -1, 0] : [1, 0];
      up ||= side ? [0, 1] : [0, -1];
      const A = [along[0] * ex[0] + along[1] * ey[0], along[0] * ex[1] + along[1] * ey[1]];
      const U = [up[0] * ex[0] + up[1] * ey[0], up[0] * ex[1] + up[1] * ey[1]];
      g.save();
      g.font = font.replace('{px}', 100);
      if ('letterSpacing' in g) g.letterSpacing = `${Math.round(spacing * 100)}px`;
      let k = size / 72, squeeze = 1; // a 100 px font has capitals about 72 px tall
      const wide = g.measureText(str).width * k;
      if (maxW && wide > maxW) squeeze = maxW / wide;
      const [x, y] = map(a, b);
      g.transform(A[0] * k * squeeze, A[1] * k * squeeze, -U[0] * k, -U[1] * k, x, y);
      if (slope) g.transform(1, 0, -slope, 1, 0, 0);
      g.textAlign = align; g.textBaseline = 'middle';
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = (strokeW / size) * 72 * 2; g.lineJoin = 'round'; g.strokeText(str, 0, 4); }
      g.fillStyle = style; g.fillText(str, 0, 4);
      g.restore();
    },
  };
  return pen;
}

// smooth curve through points (Catmull-Rom), for sweeps and ribbons
function dense(pts, n = 40) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'catmullrom', 0.5);
  return c.getPoints(n).map((p) => [p.x, p.y]);
}
// band of varying width along a curve: points are [x, y, half-width]
function ribbon(pen, pts, style) {
  const mid = dense(pts.map(([x, y]) => [x, y])), w = dense(pts.map(([x, , h]) => [x, h]));
  pen.fill([...mid.map(([x, y], i) => [x, y + w[i][1]]), ...mid.map(([x, y], i) => [x, y - w[i][1]]).reverse()], style);
}

// ------------------------------------------------------------------ the ten designs
// Each gets: P = { left, right, top } pens, L = livery colours, C = car measurements
// (nose, tail, a = front axle x, b = rear axle x, door, roof, bonnet, deck: x positions).
// `sides(fn)` runs fn on both flanks. Washes that depend on x alone are run on every view, so
// they meet cleanly where the top view takes over from the flanks.
const DESIGNS = {
  // petrol teal deepening to the tail, soft ribbons of light, silver keylines
  aurora({ sides, all, top }, L, C) {
    all((p) => p.rect(-3, -2, 3, 2, p.grad(C.door, 0, C.tail, 0, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.92)]])));
    sides((p) => {
      p.rect(-3, 0, 3, 0.42, p.grad(0, 0.42, 0, 0.1, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.85)]]));
      const glow = (a) => p.grad(C.nose, 0, C.tail, 0, [[0, rgba('#8ff5e4', 0)], [0.2, rgba('#6eead8', a)], [0.65, rgba('#3fd2c0', a * 0.8)], [1, rgba('#3fd2c0', 0)]]);
      ribbon(p, [[C.nose, 0.3, 0.005], [C.a, 0.47, 0.03], [C.door + 0.3, 0.4, 0.07], [C.door - 0.5, 0.36, 0.1], [C.b + 0.2, 0.5, 0.09], [C.tail, 0.74, 0.02]], glow(0.55));
      ribbon(p, [[C.a + 0.3, 0.27, 0.004], [C.door + 0.4, 0.25, 0.03], [C.door - 0.5, 0.21, 0.05], [C.b, 0.3, 0.03], [C.tail, 0.5, 0.008]], glow(0.32));
      p.line(dense([[C.nose, 0.29], [C.a, 0.44], [C.door + 0.3, 0.335], [C.door - 0.5, 0.265], [C.b + 0.2, 0.415], [C.tail, 0.72]]), 0.01, L.accent);
      p.line(dense([[C.a - 0.4, 0.3], [C.door - 0.5, 0.235], [C.b + 0.2, 0.37], [C.tail, 0.66]]), 0.004, rgba(L.accent, 0.7));
    });
    top((p) => {
      for (const z of [-0.2, 0.2]) p.line([[C.nose, z], [C.tail, z]], 0.012, rgba(L.accent, 0.9), false);
      ribbon(p, [[C.nose, 0, 0.02], [C.bonnet, 0, 0.12], [C.roof + 0.6, 0, 0.14], [C.roof - 0.6, 0, 0.1], [C.tail, 0, 0.03]], p.grad(C.nose, 0, C.tail, 0, [[0, rgba('#8ff5e4', 0.5)], [0.6, rgba('#3fd2c0', 0.3)], [1, rgba('#3fd2c0', 0)]]));
    });
    return { mark: '#f2f6f8', word: 'AURORA', wordInk: L.accent, panel: '#f2f6f8', sill: 'rgba(240,246,248,0.92)', plate: [L.deep, L.accent] };
  },
  // matt black, bare-carbon lower body, one hard-edged green blade
  vanta({ sides, all, top }, L, C) {
    sides((p) => {
      p.fill([[C.tail - 1, 0], [C.nose + 1, 0], [C.nose + 1, 0.22], [C.a - 0.45, 0.22], [C.a - 0.75, 0.36], [C.b + 0.7, 0.36], [C.b + 0.45, 0.22], [C.tail - 1, 0.6]], CARBON);
      const blade = [[C.nose + 0.1, 0.255], [C.a - 0.42, 0.255], [C.a - 0.72, 0.395], [C.b + 0.72, 0.395], [C.b + 0.46, 0.255], [C.b - 0.1, 0.255], [C.tail - 0.2, 0.74]];
      p.line(blade, 0.02, L.accent, false);
      p.line(blade.map(([x, y]) => [x - 0.03, y + 0.04]), 0.005, rgba(L.accent, 0.7), false);
      p.fill([[C.b - 0.1, 0.265], [C.b - 0.36, 0.265], [C.tail - 0.2, 0.6], [C.tail - 0.2, 0.74]], L.accent);
    });
    all((p) => p.rect(C.nose - 0.07, -2, C.nose + 1, 2, L.accent));
    top((p) => { p.line([[C.nose, 0], [C.tail, 0]], 0.03, L.accent, false); p.line([[C.nose, 0.07], [C.tail, 0.07]], 0.006, rgba(L.accent, 0.6), false); });
    return { mark: L.accent, word: 'VANTA', wordInk: '#2b2d33', panel: '#e9ecef', sill: 'rgba(200,204,210,0.72)', plate: [CARBON, L.accent] };
  },
  // vermilion over a bare-carbon wedge that rises to the tail, ivory keyline, classic nose band
  fulmine({ sides, all, top }, L, C) {
    sides((p) => {
      p.rect(-3, 0, 3, 0.5, p.grad(0, 0.5, 0, 0.1, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.5)]]));
      const cut = dense([[C.nose + 0.3, 0.2], [C.a - 0.5, 0.2], [C.door, 0.26], [C.door - 0.7, 0.38], [C.b + 0.1, 0.62], [C.b - 0.5, 0.86], [C.tail - 0.4, 1.1]]);
      p.fill([...cut, [C.tail - 1, 1.1], [C.tail - 1, 0], [C.nose + 1, 0]], CARBON);
      p.line(cut, 0.016, L.accent);
      p.line(cut.map(([x, y]) => [x + 0.03, y + 0.045]), 0.005, 'rgba(24,10,8,0.7)');
    });
    all((p) => { p.rect(C.nose - 0.5, -2, C.nose - 0.4, 2, L.accent); p.rect(C.nose - 0.385, -2, C.nose - 0.365, 2, L.accent); });
    top((p) => {
      for (const z of [-0.13, 0.13]) p.rect(C.tail - 1, z - 0.07, C.nose - 0.5, z + 0.07, L.accent);
      p.rect(C.tail - 1, -0.012, C.nose - 0.5, 0.012, rgba(L.deep, 0.8));
    });
    return { mark: L.accent, word: 'FULMINE', wordInk: L.accent, panel: L.accent, sill: '#f3efe6', plate: [L.base, L.accent] };
  },
  // royal blue, a yellow kingfisher feather over the rear quarter, fine yellow keyline
  halcyon({ sides, all, top }, L, C) {
    all((p) => p.rect(-3, -2, 3, 2, p.grad(C.door - 0.4, 0, C.tail, 0, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.85)]])));
    sides((p) => {
      p.rect(-3, 0, 3, 0.5, p.grad(0, 0.5, 0, 0.1, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.95)]]));
      const f = C.door - 0.35;
      p.fill(dense([[f + 0.1, 0.76], [f - 0.3, 0.8], [C.b + 0.3, 0.76], [C.b - 0.3, 0.66], [C.tail - 0.1, 0.42], [C.b - 0.3, 0.55], [C.b + 0.3, 0.62], [f - 0.3, 0.64], [f + 0.14, 0.58], [f + 0.1, 0.76]], 60), L.accent);
      p.line(dense([[f + 0.2, 0.53], [f - 0.3, 0.585], [C.b + 0.3, 0.565], [C.b - 0.3, 0.49], [C.tail - 0.05, 0.36]]), 0.007, L.accent);
      p.line(dense([[C.nose, 0.28], [C.a, 0.42], [C.door + 0.3, 0.31], [C.door - 0.6, 0.27], [C.b, 0.3], [C.tail, 0.3]]), 0.009, L.accent);
    });
    all((p) => p.rect(C.nose - 0.14, -2, C.nose + 1, 2, L.accent));
    top((p) => {
      p.rect(C.tail - 1, 0.16, C.nose - 0.14, 0.3, L.accent); p.rect(C.tail - 1, 0.33, C.nose - 0.14, 0.355, L.accent);
    });
    return { mark: L.accent, word: 'HALCYON', wordInk: '#f4f6fb', panel: '#f4f6fb', sill: 'rgba(244,246,251,0.92)', plate: [L.deep, L.accent] };
  },
  // pearl white over graphite, crimson roof and nose, three slanted talon bars
  kestrel({ sides, all, top }, L, C) {
    sides((p) => {
      p.fill(dense([[C.nose + 1, 0], [C.nose + 1, 0.2], [C.a - 0.5, 0.2], [C.door, 0.2], [C.b + 0.5, 0.24], [C.tail - 1, 0.34], [C.tail - 1, 0]], 30), L.deep);
      p.line(dense([[C.nose + 1, 0.21], [C.a - 0.5, 0.21], [C.door, 0.21], [C.b + 0.5, 0.25], [C.tail - 1, 0.35]], 30), 0.014, L.accent);
      [[0.1, 0.2, 1], [-0.24, 0.16, 1], [-0.54, 0.12, 0.8], [-0.8, 0.08, 0.5]].forEach(([dx, w, a]) => {
        const x = C.b + 0.75 + dx; p.fill([[x, 0.3], [x - w, 0.3], [x - w - 0.4, 0.84], [x - 0.4, 0.84]], rgba(L.accent, a));
      });
    });
    all((p) => { p.rect(C.nose - 0.24, -2, C.nose + 1, 2, L.accent); p.rect(C.nose - 0.285, -2, C.nose - 0.265, 2, L.deep); });
    top((p) => {
      p.rect(C.roof - 0.75, -0.6, C.roof + 0.55, 0.6, L.accent);
      for (const z of [-0.11, 0.11]) p.rect(C.roof + 0.55, z - 0.05, C.nose - 0.285, z + 0.05, L.accent);
      p.rect(C.tail - 1, -0.16, C.roof - 0.75, 0.16, L.deep);
    });
    return { mark: L.accent, word: 'KESTREL', wordInk: L.deep, panel: L.deep, sill: 'rgba(34,36,42,0.9)', plate: [L.accent, L.base], roofInk: '#f4f4f4' };
  },
  // ice blue nose into a navy tail through leaning glacier strata, white keylines
  nordline({ sides, all, top }, L, C) {
    const lean = 0.8, xc = C.door - 0.25, sh = 0.86;
    sides((p) => {
      const edge = (x0, amp, ph) => { const e = []; for (let y = -0.02; y <= 1.52; y += 0.04) e.push([x0 - lean * (Math.min(y, sh) - 0.4) + amp * Math.sin(y * 7 + ph), y]); return e; };
      p.fill([...edge(xc, 0.025, 0.4), [-3, 1.52], [-3, -0.02]], L.deep);
      [[0.17, 0.08], [0.39, 0.045], [0.56, 0.02]].forEach(([dx, w], k) => { const e = edge(xc + dx, 0.025, 0.4 + k * 0.5); p.fill([...e, ...e.slice().reverse().map(([x, y]) => [x + w, y])], L.deep); });
      for (let k = 0; k < 5; k++) p.line(edge(xc - 0.35 - k * 0.36, 0.03, 1.2 + k * 0.9), 0.007, 'rgba(120,170,230,0.17)', false);
      p.line(edge(xc - 0.035, 0.025, 0.4), 0.008, L.accent, false);
    });
    top((p) => {
      // the same cut seen from above: a chevron that meets the flank edge at the shoulder
      const xs = xc - lean * (sh - 0.4), chev = (dx) => [[xs + dx, 1.2], [xs + dx, 0.86], [xs + dx - 0.55, 0], [xs + dx, -0.86], [xs + dx, -1.2]];
      p.fill([...chev(0), [-3, -1.2], [-3, 1.2]], L.deep);
      [[0.17, 0.08], [0.39, 0.045], [0.56, 0.02]].forEach(([dx, w]) => p.fill([...chev(dx), ...chev(dx + w).reverse()], L.deep));
      p.line(chev(-0.035), 0.008, L.accent, false);
    });
    return { mark: L.deep, low: '#ffffff', markRear: '#ffffff', word: 'NORDLINE', wordInk: '#ffffff', panel: '#ffffff', sill: 'rgba(11,29,74,0.9)', sillRear: 'rgba(255,255,255,0.9)', plate: [L.deep, '#ffffff'] };
  },
  // violet falling to aubergine, twin gold coach-lines over the shoulders
  solace({ sides, all, top }, L, C) {
    all((p) => p.rect(-3, -2, 3, 2, p.grad(C.door - 0.5, 0, C.tail, 0, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.65)]])));
    sides((p) => {
      p.rect(-3, 0, 3, 0.6, p.grad(0, 0.6, 0, 0.12, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.97)]]));
      const arc = dense([[C.nose, 0.3], [C.a + 0.2, 0.5], [C.a - 0.5, 0.62], [C.door, 0.6], [C.door - 0.7, 0.5], [C.b + 0.2, 0.42], [C.b - 0.5, 0.42], [C.tail, 0.52]]);
      p.line(arc, 0.011, L.accent);
      p.line(arc.map(([x, y]) => [x - 0.015, y - 0.045]), 0.0045, rgba(L.accent, 0.8));
      p.line(dense([[C.a - 0.3, 0.3], [C.door, 0.25], [C.b + 0.4, 0.27], [C.tail, 0.36]]), 0.005, rgba(L.accent, 0.85));
    });
    all((p) => p.rect(C.nose - 0.1, -2, C.nose + 1, 2, L.accent));
    top((p) => {
      for (const z of [-0.36, 0.36]) { p.line([[C.nose - 0.1, z * 0.8], [C.bonnet, z], [C.roof, z * 1.05], [C.tail, z * 0.9]].map(([x, zz]) => [x, zz]), 0.012, L.accent); }
      for (const z of [-0.31, 0.31]) p.line([[C.nose - 0.1, z * 0.8], [C.bonnet, z], [C.roof, z * 1.05], [C.tail, z * 0.9]], 0.004, rgba(L.accent, 0.8));
    });
    return { mark: L.accent, word: 'SOLACE', wordInk: '#efeaf8', panel: '#efeaf8', sill: 'rgba(240,189,76,0.9)', plate: [L.deep, L.accent] };
  },
  // satin olive, bare carbon cut on a hard diagonal, orange only as working accents
  ironbark({ sides, all, top }, L, C) {
    const third = L.third || '#d9cba3';
    sides((p) => {
      p.rect(-3, 0, 3, 0.5, p.grad(0, 0.5, 0, 0.1, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.7)]]));
      const cut = [[C.nose + 1, 0.2], [C.a - 0.45, 0.2], [C.a - 0.7, 0.34], [C.b + 0.9, 0.34], [C.b + 0.2, 1.1]];
      p.fill([...cut, [C.tail - 1, 1.1], [C.tail - 1, 0], [C.nose + 1, 0]], CARBON);
      p.line(cut, 0.02, L.accent, false);
    });
    all((p) => {
      p.rect(C.nose - 0.2, -2, C.nose + 1, 2, L.accent);
      p.rect(C.a - 0.62, -2, C.a - 0.54, 2, third);
    });
    top((p) => {
      p.fill([[C.b + 0.2 - 0.25, -1.2], [C.b + 0.2 - 0.25, 1.2], [C.tail - 1, 1.2], [C.tail - 1, -1.2]], CARBON);
      p.line([[C.b - 0.05, -1.2], [C.b - 0.05, 1.2]], 0.02, L.accent, false);
      p.rect(C.a - 0.54, -0.3, C.nose - 0.2, 0.3, rgba(CARBON, 0.92));
    });
    return { mark: third, word: 'IRONBARK', wordInk: third, panel: third, sill: 'rgba(217,203,163,0.9)', plate: [L.base, L.accent] };
  },
  // magenta, white meridian lines sweeping nose to tail, a darker rear
  meridian({ sides, all, top }, L, C) {
    all((p) => p.rect(-3, -2, 3, 2, p.grad(C.door - 0.3, 0, C.tail, 0, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.8)]])));
    sides((p) => {
      p.rect(-3, 0, 3, 0.4, p.grad(0, 0.4, 0, 0.1, [[0, rgba(L.deep, 0)], [1, rgba(L.deep, 0.8)]]));
      const m = (k) => dense([[C.nose, 0.24 + k * 0.012], [C.a, 0.3 + k * 0.05], [C.door + 0.2, 0.3 + k * 0.085], [C.door - 0.7, 0.3 + k * 0.11], [C.b, 0.34 + k * 0.1], [C.tail, 0.4 + k * 0.07]]);
      ribbon(p, [[C.nose, 0.26, 0.01], [C.a, 0.33, 0.035], [C.door + 0.2, 0.345, 0.05], [C.door - 0.7, 0.36, 0.06], [C.b, 0.39, 0.05], [C.tail, 0.44, 0.03]], L.accent);
      for (let k = 2; k <= 5; k++) p.line(m(k), 0.006, rgba(L.accent, 1 - k * 0.14));
    });
    top((p) => {
      p.rect(C.tail - 1, -0.09, C.nose + 1, 0.09, L.accent);
      for (const z of [0.15, 0.2, 0.25]) for (const s of [-1, 1]) p.line([[C.nose + 1, s * z], [C.tail - 1, s * z]], 0.007, rgba(L.accent, 1.25 - z * 3.4), false);
    });
    return { mark: '#ffffff', low: L.deep, word: 'MERIDIAN', wordInk: '#ffffff', panel: '#ffffff', sill: 'rgba(255,255,255,0.92)', plate: [L.deep, L.accent], roofInk: L.deep };
  },
  // gunmetal with a block-camouflage tail and thin cyan instrument lines
  tundra({ sides, all, top }, L, C) {
    const blocks = (p, rows, y0, h) => {
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let r = 0; r < rows; r++) for (let x = C.tail - 0.3; x < C.door + 0.5; x += 0.14) {
        const fade = 1 - (x - C.tail) / (C.door + 0.5 - C.tail);
        if (rnd() < fade * 0.8) p.rect(x, y0 + r * h, x + 0.14, y0 + (r + 1) * h, rnd() < 0.5 ? rgba(L.deep, 0.9) : rgba('#8a939d', 0.5));
      }
    };
    sides((p) => {
      p.rect(-3, 0, 3, 0.26, L.deep);
      blocks(p, 8, 0.26, 0.085);
      p.line([[C.nose + 1, 0.27], [C.a - 0.45, 0.27], [C.a - 0.62, 0.38], [C.tail - 1, 0.38]], 0.012, L.accent, false);
      p.line([[C.a - 0.62, 0.42], [C.tail - 1, 0.42]], 0.004, rgba(L.accent, 0.7), false);
      for (let x = C.b + 0.6; x < C.a - 0.7; x += 0.1) p.line([[x, 0.38], [x, 0.38 + (Math.round((x - C.b) * 10) % 5 ? 0.02 : 0.045)]], 0.004, rgba(L.accent, 0.8), false);
    });
    all((p) => p.rect(C.nose - 0.12, -2, C.nose + 1, 2, L.accent));
    top((p) => {
      p.rect(C.tail - 1, -0.34, C.nose - 0.12, -0.28, L.accent);
      p.rect(C.tail - 1, -0.25, C.nose - 0.12, -0.238, rgba(L.accent, 0.7));
      for (let x = C.tail; x < C.nose - 0.2; x += 0.1) p.line([[x, -0.28], [x, -0.28 + (Math.round((x - C.tail) * 10) % 5 ? 0.025 : 0.06)]], 0.004, rgba(L.accent, 0.8), false);
      p.rect(C.tail - 1, -1.2, C.b - 0.2, 1.2, rgba(L.deep, 0.8));
    });
    return { mark: L.accent, word: 'TUNDRA', wordInk: '#e6ebf0', panel: '#e6ebf0', sill: 'rgba(230,235,240,0.9)', plate: [L.deep, L.accent] };
  },
  // any team without a designed style: second colour along the sill and down the centre
  plain({ sides, all, top }, L, C) {
    sides((p) => { p.rect(-3, 0, 3, 0.28, L.deep); p.line([[C.nose + 1, 0.3], [C.tail - 1, 0.3]], 0.02, L.accent, false); });
    top((p) => p.rect(C.tail - 1, -0.1, C.nose + 1, 0.1, L.accent));
    return { mark: L.accent, word: '', wordInk: L.accent, panel: '#f3f5f8', sill: rgba(ink(L.deep), 0.9), plate: [L.deep, L.accent] };
  },
};

// Where things sit on each car (x in metres). Anything not listed is worked out from the
// axle positions and the driver's eye point that every shell reports.
const PLACE = {
  porsche: { bonnet: 1.72, roof: -0.2, deck: -1.75, door: 0.28, doorY: 0.54, wordY: 0.31 },
  mclaren: { bonnet: 1.95, roof: 0.15, deck: -1.55, doorY: 0.52, wordY: 0.215, lowSize: 0.075, sill: false }, // deep door scallop: lettering sits under it
  ferrari: { bonnet: 1.9, roof: 0.1, deck: -1.6, doorY: 0.52, wordY: 0.3 },
  aston: { bonnet: 1.55, roof: -0.55, deck: -1.95, doorY: 0.54, wordY: 0.31 },
  hybrid: { bonnet: 2.05, roof: 0.05, deck: -1.3, doorY: 0.44, wordY: 0.26, narrow: true },
};

function paint(team, number, vehicle, car, size) {
  const L = team.livery || { style: 'plain', finish: 'gloss', base: team.color, deep: mix(team.color, '#000000', 0.6), accent: team.color2, partner: (team.name || '').split(' ')[0].toUpperCase() };
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = L.base; g.fillRect(0, 0, size, size);
  const P = { left: makePen(g, size, size, 'left'), right: makePen(g, size, size, 'right'), top: makePen(g, size, size, 'top') };
  const place = PLACE[vehicle] || {};
  const C = {
    a: car.a, b: -car.b, nose: car.a + 0.93, tail: -car.b - 0.92,
    door: place.door ?? car.door?.[0] ?? (car.a - car.b) / 2,
    roof: place.roof ?? (car.eye ? car.eye[0] - 0.3 : 0), bonnet: place.bonnet ?? car.a + 0.3, deck: place.deck ?? -car.b - 0.5,
  };
  const run = (pens) => (fn) => { for (const p of pens) p.clip(() => fn(p)); };
  const sides = run([P.left, P.right]), all = run([P.left, P.right, P.top]), top = run([P.top]);
  const D = (DESIGNS[L.style] || DESIGNS.plain)({ sides, all, top }, L, C);

  const font = L.font || '800 {px}px "Helvetica Neue", Arial, sans-serif';
  const numFont = '900 {px}px "Helvetica Neue", "Arial Narrow", Arial, sans-serif';
  const driver = (team.drivers || []).find((d) => d[2] === number);
  const cls = vehicle === 'hybrid' ? 'HYBRID' : 'GT3', clsCol = vehicle === 'hybrid' ? '#d8232a' : '#ff8a00';
  const doorY = place.doorY ?? 0.52, wordY = place.wordY ?? 0.3;
  const panelInk = ink(D.panel);

  sides((p) => {
    // door number on its panel, with the class band above it
    const x = C.door, w = 0.23, h = 0.19;
    p.fill([[x - w, doorY - h], [x + w, doorY - h], [x + w, doorY + h], [x - w, doorY + h]], D.panel);
    p.rect(x - w, doorY + h - 0.055, x + w, doorY + h, clsCol);
    p.text(cls, x, doorY + h - 0.028, 0.03, '#ffffff', { font: numFont, spacing: 0.15 });
    p.text(String(number), x, doorY - 0.03, 0.24, panelInk, { font: numFont, maxW: 0.4 });
    p.line([[x - w, doorY - h], [x + w, doorY - h], [x + w, doorY + h], [x - w, doorY + h], [x - w, doorY - h]], 0.006, rgba(panelInk, 0.8), false);
    // title partner low along the doors between the wheels, team word ahead of the number
    const rearInk = D.markRear || D.mark, x0 = C.b + 0.5, x1 = C.a - 0.5;
    p.text(L.partner, (x0 + x1) / 2, wordY, place.lowSize ?? 0.12, D.low || D.mark, { font, spacing: L.spacing || 0, maxW: x1 - x0 - 0.25, stroke: rgba(ink(D.low || D.mark), 0.3), strokeW: 0.004 });
    if (D.word) p.text(D.word, (x + w + x1) / 2 + 0.02, doorY + 0.07, 0.06, D.wordInk, { font, spacing: 0.16, slope: 0.18, maxW: Math.max(0.2, x1 - (x + w) - 0.1) });
    // technical partners along the sill, and one on each bumper corner
    const sillRear = D.sillRear || D.sill, n = 4;
    for (let k = 0; k < n && place.sill !== false; k++) {
      const sx = x0 + 0.1 + ((x1 - x0 - 0.2) * (k + 0.5)) / n;
      p.text(MARKS[(k * 3 + (team.pace || 0)) % MARKS.length], sx, 0.165, 0.028, sx < C.door - 0.3 ? sillRear : D.sill, { font: '800 {px}px "Helvetica Neue", Arial, sans-serif', spacing: 0.08, maxW: (x1 - x0) / n - 0.1 });
    }
    p.text(MARKS[(team.pace || 0) % MARKS.length], C.a + 0.58, 0.36, 0.036, D.sill, { font, maxW: 0.3 });
    p.text(MARKS[((team.pace || 0) + 4) % MARKS.length], C.b - 0.58, 0.42, 0.036, sillRear, { font, maxW: 0.3 });
    // driver strip on the roof edge above the door
    if (driver) {
      p.rect(x - 0.3, 1.118, x + 0.3, 1.168, rgba('#0b0c0e', 0.85));
      p.rect(x - 0.3, 1.118, x - 0.275, 1.168, L.accent);
      p.text(driver[0].toUpperCase(), x + 0.012, 1.143, 0.026, '#f3f5f8', { font: '700 {px}px "Helvetica Neue", Arial, sans-serif', spacing: 0.1, maxW: 0.52 });
    }
    // scrutineering stickers behind the door, tow-point arrows, cut-off and extinguisher marks
    const sx = C.door - w - 0.11;
    p.rect(sx - 0.035, 0.72, sx + 0.035, 0.79, '#f3f5f8'); p.rect(sx - 0.035, 0.765, sx + 0.035, 0.79, '#1f8f4d');
    p.text('OK', sx, 0.742, 0.022, '#111318', { font: numFont });
    p.rect(sx - 0.035, 0.63, sx + 0.035, 0.7, '#ffd21a'); p.text('26', sx, 0.665, 0.03, '#111318', { font: numFont });
    for (const [tx, ty, dir] of [[C.nose - 0.3, 0.3, 1], [C.tail + 0.3, 0.47, -1]]) {
      p.fill([[tx, ty - 0.03], [tx + dir * 0.07, ty], [tx, ty + 0.03]], '#e0202a');
      p.text('TOW', tx - dir * 0.045, ty, 0.02, '#e0202a', { font: numFont });
    }
    p.fill([[C.a - 0.56, 0.8], [C.a - 0.5, 0.8], [C.a - 0.53, 0.86]], '#1e62d0');                 // electrical cut-off triangle
    p.rect(C.a - 0.47, 0.8, C.a - 0.41, 0.86, '#e0202a'); p.text('E', C.a - 0.44, 0.83, 0.036, '#ffffff', { font: numFont });
    // wing end plates and mirror caps sit in this projection too: give them their own treatment
    const plateX0 = C.tail - 0.75, plateX1 = C.tail + 0.12;
    p.rect(plateX0, 0.97, plateX1, 1.5, D.plate[0]);
    p.rect(plateX0, 0.97, plateX1, 1.0, D.plate[1]);
    p.text(String(number), (plateX0 + plateX1) / 2 + 0.06, 1.2, 0.11, D.plate[1], { font: numFont, maxW: 0.3 });
    if (car.mirror) p.rect(car.mirror[0] - 0.02, car.mirror[1] - 0.06, car.mirror[0] + 0.13, car.mirror[1] + 0.06, L.accent);
  });

  top((p) => {
    // read from the front: partner across the bonnet, number just behind the nose
    const front = { along: [0, -1], up: [-1, 0] };
    const narrow = place.narrow;
    p.text(L.partner, C.bonnet - (narrow ? 0.1 : 0), 0, narrow ? 0.085 : 0.13, D.mark, { ...front, font, spacing: L.spacing || 0, maxW: narrow ? 0.5 : 0.85, stroke: rgba(L.deep, 0.9), strokeW: 0.01 });
    if (!narrow) {
      p.rect(C.bonnet + 0.24, -0.17, C.bonnet + 0.52, 0.17, D.panel);
      p.text(String(number), C.bonnet + 0.375, 0, 0.2, panelInk, { ...front, font: numFont, maxW: 0.3 });
    }
    // roof: number read from the car's left, as the timing cameras see it, driver flags strip
    const left = { along: [1, 0], up: [0, -1] };
    const rw = narrow ? 0.2 : 0.26, rh = narrow ? 0.17 : 0.22;
    p.rect(C.roof - rw, -rh, C.roof + rw, rh, D.panel);
    p.rect(C.roof - rw, rh - 0.05, C.roof + rw, rh, clsCol);
    p.text(String(number), C.roof, 0.02, narrow ? 0.2 : 0.27, panelInk, { ...left, font: numFont, maxW: rw * 1.7 });
    // rear deck: team word read from behind, partner marks on the rear wings
    const back = { along: [0, 1], up: [1, 0] };
    if (D.word) p.text(D.word, C.deck, 0, narrow ? 0.07 : 0.1, D.roofInk && L.style === 'kestrel' ? D.roofInk : D.markRear || D.wordInk, { ...back, font, spacing: 0.2, maxW: narrow ? 0.4 : 0.8 });
    for (const s of [-1, 1]) p.text(MARKS[((team.pace || 0) + (s > 0 ? 2 : 6)) % MARKS.length], C.a + 0.05, s * 0.78, 0.035, D.sill, { along: [s, 0], up: [0, -s], font, maxW: 0.3 });
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const CACHE = new Map();
// Livery texture for a closed car. `car` carries what the painter needs to place things:
// { a, b (axle distances), door, eye, mirror: [x, y] }. `detail` is the texture size: the
// player's car gets 2048, the rest of the field 1024. Call release() when the car is disposed.
export function closedLivery(team, number, vehicle, car, detail = 1024) {
  const key = [team.liveryKey || team.name, vehicle, number, detail].join('|');
  let e = CACHE.get(key);
  if (!e) CACHE.set(key, (e = { tex: paint(team, number, vehicle, car, detail), refs: 0 }));
  e.refs++;
  return { tex: e.tex, release() { if (--e.refs <= 0) { e.tex.dispose(); CACHE.delete(key); } } };
}
