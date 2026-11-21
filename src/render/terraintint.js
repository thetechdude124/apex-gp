// Paints the terrain mesh's vertex colours so the land beyond the barriers reads as countryside
// rather than one green sheet: a patchwork of fields and hedge lines, shaded woodland floor
// where the trees stand, thin soil on steep ground, sand along the shore.
// The grass texture carries the base colour; these are tints multiplied over it.
import * as THREE from 'three';

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 4) { let s = 0, a = 0.5, f = 1; for (let o = 0; o < oct; o++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2.03; } return s; }
const sstep = THREE.MathUtils.smoothstep;

// plot types: [share, r, g, b] tints over the grass
const PLOTS = [
  [0.2, 1.7, 1.34, 0.56],   // ripening cereal
  [0.17, 0.6, 0.82, 0.6],   // dark leafy crop
  [0.1, 1.55, 1.0, 0.72],   // ploughed earth
  [0.16, 1.26, 1.18, 0.8],  // hay meadow
  [0.37, 1, 1, 1],          // pasture
];

// o: { outside: Float32Array (metres outside the barrier per vertex, negative inside),
//      base: THREE.Color terrain tone, fields 0..1, woodMin (tree-clump threshold of the tree
//      scatter), woodAmt 0..1, beachBelow: height below which it is sand (or null) }
export function tintTerrain(geo, o) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, col = geo.attributes.color;
  const tc = o.base, tm = Math.max(tc.r, tc.g, tc.b) * 0.8;
  const b0 = [0.45 + 0.55 * tc.r / tm, 0.45 + 0.55 * tc.g / tm, 0.45 + 0.55 * tc.b / tm];
  for (let p = 0; p < pos.count; p++) {
    const x = pos.getX(p), y = -pos.getZ(p), h = pos.getY(p), out = o.outside[p];
    const v = 0.76 + fbm(x * 0.01, y * 0.01, 5) * 0.48;
    let r = b0[0] * v, g = b0[1] * v, b = b0[2] * v;
    // woodland: the same clump field the tree scatter uses, so the shade sits under the trees
    const wood = out > 3 ? sstep(fbm(x * 0.006 + 7, y * 0.006, 5), o.woodMin - 0.015, o.woodMin + 0.07) * sstep(out, 4, 16) : 0;
    // farmland: a warped, rotated grid of plots with hedge lines between them
    const fk = o.fields * sstep(out, 45, 150) * (1 - wood);
    if (fk > 0.01) {
      const wx = x + (fbm(x * 0.0021 + 11, y * 0.0021, 3) - 0.5) * 300, wy = y + (fbm(x * 0.0021, y * 0.0021 + 5, 3) - 0.5) * 300;
      const cu = (wx * 0.82 + wy * 0.57) / 210, cw = (-wx * 0.57 + wy * 0.82) / 130;
      const iu = Math.floor(cu), iw = Math.floor(cw);
      let id = hash2(iu + 0.5, iw + 0.5), f = PLOTS[PLOTS.length - 1];
      for (const pl of PLOTS) { if (id < pl[0]) { f = pl; break; } id -= pl[0]; }
      // tractor lines: faint banding along the plot
      const rows = 1 + 0.05 * Math.sin(cw * 130 * 0.9 + iu);
      const hedge = Math.max(Math.abs(cu - iu - 0.5) * 210, Math.abs(cw - iw - 0.5) * 130 * (210 / 130)) > 100 ? 1 : 0;
      const fr = hedge ? 0.4 : f[1] * rows, fg = hedge ? 0.52 : f[2] * rows, fb = hedge ? 0.4 : f[3] * rows;
      r *= 1 + (fr - 1) * fk; g *= 1 + (fg - 1) * fk; b *= 1 + (fb - 1) * fk;
    }
    if (wood > 0) { const w = wood * o.woodAmt; r *= 1 - 0.56 * w; g *= 1 - 0.46 * w; b *= 1 - 0.54 * w; }
    // steep ground: thin soil, scree
    const steep = sstep(1 - nor.getY(p), 0.05, 0.2) * (1 - 0.6 * wood) * (out > 6 ? 1 : 0);
    if (steep > 0) { const k = steep * 0.55; r += (1.1 * v - r) * k; g += (0.86 * v - g) * k; b += (0.7 * v - b) * k; }
    if (o.beachBelow != null && h < o.beachBelow && out > 6) { r = 0.78; g = 0.7; b = 0.52; }
    col.setXYZ(p, r, g, b);
  }
  col.needsUpdate = true;
}
