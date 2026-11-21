// Procedural canvas textures: no external assets needed.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// value noise (tileable)
function makeNoise(size, octaves, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    const grid = new Float32Array(cells * cells).map(() => rnd());
    const cs = size / cells;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const gx = x / cs, gy = y / cs;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const g = (i, j) => grid[((j % cells) * cells) + (i % cells)];
      const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
      out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function normalFromHeight(h, size, strength) {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    const k = (y * size + x) * 4;
    img.data[k] = ((nx / len) * 0.5 + 0.5) * 255;
    img.data[k + 1] = ((ny / len) * 0.5 + 0.5) * 255;
    img.data[k + 2] = ((nz / len) * 0.5 + 0.5) * 255;
    img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Canvases that are expensive to paint are painted once and shared; every caller gets its own
// texture object (own repeat / filtering) over the same pixels.
const CACHE = new Map();
function cached(key, paint) {
  if (!CACHE.has(key)) CACHE.set(key, paint());
  return CACHE.get(key);
}

export function asphalt() {
  // 1024 px over 7 m (7 mm per texel). The surface is drawn as individual stones in bitumen,
  // each a couple of texels across, so it still reads as aggregate when the camera is close
  // instead of dissolving into magnified noise. Tones are those of a worn, sun-bleached race
  // surface (mid grey), not fresh black bitumen.
  const cv = cached('asphalt', () => {
    const S = 1024;
    const n = makeNoise(S, 5, 7);
    const [c, g] = canvas(S, S);
    const img = g.createImageData(S, S);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < S * S; i++) {
      const v = (0.27 + (n[i] - 0.5) * 0.04 + (rnd() - 0.5) * 0.03) * 255;
      const k = i * 4;
      img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v * 1.02; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const stones = 170000;
    for (let q = 0; q < stones; q++) {
      const x = rnd() * S, y = rnd() * S, r = 0.7 + rnd() * rnd() * 2.4, t = rnd(), hue = rnd();
      let v = 72 + t * 40;
      if (t > 0.975) v = 122 + rnd() * 30;      // pale chippings
      else if (t < 0.12) v = 50 + rnd() * 12;   // dark basalt
      const cr = v * (1 + (hue - 0.5) * 0.09), cb = v * (1 - (hue - 0.5) * 0.11);
      g.fillStyle = 'rgba(0,0,0,0.32)';
      g.beginPath(); g.arc(x + 0.6, y + 0.6, r, 0, 6.3); g.fill();
      g.fillStyle = `rgb(${cr | 0},${v | 0},${cb | 0})`;
      g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * 3.14, 0, 6.3); g.fill();
    }
    // height + roughness from the painted result: stones stand proud and are a little smoother
    const px = g.getImageData(0, 0, S, S).data;
    const hgt = new Float32Array(S * S);
    const [rc, rg] = canvas(S, S);
    const rimg = rg.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const l = px[i * 4 + 1] / 255;
      hgt[i] = Math.min(1, l * 2.2);
      const v = 0.9 - Math.min(0.2, Math.max(0, l - 0.24) * 0.9) + (n[i] - 0.5) * 0.08;
      rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = Math.min(255, v * 255); rimg.data[i * 4 + 3] = 255;
    }
    rg.putImageData(rimg, 0, 0);
    return { c, n: normalFromHeight(hgt, S, 1.6), r: rc };
  });
  const out = { map: tex(cv.c), normal: tex(cv.n, true, false), rough: tex(cv.r, true, false) };
  out.map.anisotropy = out.normal.anisotropy = 16;
  return out;
}

// Turf painted as fibres, not noise: thousands of short blade strokes in a spread of greens
// and straw tones over a mottled base. `dry` (0..1) shifts the mix toward straw.
function turf(S, base, dry, stripes, seed0) {
  const n = makeNoise(S, 5, seed0), n2 = makeNoise(S, 3, seed0 + 4);
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  let seed = seed0 * 7 + 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const stripe = stripes ? ((Math.floor(y / (S / 2)) % 2) ? 1.045 : 0.955) : 1;
    const v = stripe * (0.74 + n[i] * 0.34 + (rnd() - 0.5) * 0.16);
    const d = Math.max(0, n2[i] - 0.35) * 1.5 * dry;
    img.data[i * 4] = Math.min(255, (base[0] + d * 62) * v);
    img.data[i * 4 + 1] = Math.min(255, (base[1] + d * 22) * v);
    img.data[i * 4 + 2] = Math.min(255, (base[2] - d * 6) * v);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const blades = Math.round(S * S * 0.11);
  g.lineCap = 'round';
  for (let k = 0; k < blades; k++) {
    const x = rnd() * S, y = rnd() * S, len = 2 + rnd() * 5, lean = (rnd() - 0.5) * 3;
    const t = rnd(), straw = rnd() < 0.1 + dry * 0.3;
    const br = 0.6 + t * 0.75;
    const r = straw ? base[0] * 1.45 + 30 : base[0] * br * 0.92, gg = straw ? base[1] * 1.12 + 14 : base[1] * br, b = straw ? base[2] * 0.95 : base[2] * br * 0.85;
    g.strokeStyle = `rgba(${Math.min(255, r) | 0},${Math.min(255, gg) | 0},${Math.min(255, b) | 0},${0.35 + rnd() * 0.4})`;
    g.lineWidth = 0.8 + rnd() * 0.7;
    // repeat strokes that cross an edge so the texture still tiles
    const offs = [[0, 0]];
    if (x < 8) offs.push([S, 0]); else if (x > S - 8) offs.push([-S, 0]);
    if (y < 8) offs.push([0, S]); else if (y > S - 8) offs.push([0, -S]);
    for (const [ox, oy] of offs) { g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + lean, y + oy - len); g.stroke(); }
  }
  return tex(c);
}

export function grass(base = [70, 110, 40], dry = 0) { return turf(512, base, dry, false, 11); }

export function mowedGrass(base = [70, 115, 40], dry = 0.2) { return turf(512, base, dry, true, 21); }

// Gravel-trap stone: rounded pebbles a centimetre or two across in a spread of limestone
// tones, packed over a darker bed. 512 px over 2.4 m.
export function gravel() {
  const S = 512;
  const [c, g] = canvas(S, S);
  let seed = 17;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#6f6656'; g.fillRect(0, 0, S, S);
  const [hc, hg] = canvas(S, S);
  hg.fillStyle = '#000'; hg.fillRect(0, 0, S, S);
  for (let q = 0; q < 26000; q++) {
    const x = rnd() * S, y = rnd() * S, r = 1.6 + rnd() * rnd() * 3.6, t = rnd(), ang = rnd() * 3.14, sq = 0.6 + rnd() * 0.4;
    let v = 150 + t * 62, warm = 0.05 + rnd() * 0.14;
    if (t < 0.1) { v = 105 + rnd() * 25; warm = 0.02; }        // grey flint
    else if (t > 0.94) { v = 222 + rnd() * 20; warm = 0.04; }  // pale quartz
    const cr = v * (1 + warm * 0.5), cg = v, cb = v * (1 - warm * 1.5);
    const hv = (120 + rnd() * 135) | 0;
    // repeat pebbles that cross an edge so the texture tiles
    const offs = [[0, 0]];
    if (x < 6) offs.push([S, 0]); else if (x > S - 6) offs.push([-S, 0]);
    if (y < 6) offs.push([0, S]); else if (y > S - 6) offs.push([0, -S]);
    for (const [ox, oy] of offs) {
      g.fillStyle = 'rgba(30,26,20,0.5)';
      g.beginPath(); g.ellipse(x + ox + 0.8, y + oy + 0.9, r, r * sq, ang, 0, 6.3); g.fill();
      g.fillStyle = `rgb(${Math.min(255, cr) | 0},${cg | 0},${cb | 0})`;
      g.beginPath(); g.ellipse(x + ox, y + oy, r, r * sq, ang, 0, 6.3); g.fill();
      hg.fillStyle = `rgb(${hv},${hv},${hv})`;
      hg.beginPath(); hg.ellipse(x + ox, y + oy, r, r * sq, ang, 0, 6.3); hg.fill();
    }
  }
  const hp = hg.getImageData(0, 0, S, S).data;
  const hgt = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) hgt[i] = hp[i * 4] / 255;
  return { map: tex(c), normal: tex(normalFromHeight(hgt, S, 2.2), true, false) };
}

export function sand() {
  const S = 512;
  const n = makeNoise(S, 6, 31);
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  let seed = 41;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < S * S; i++) {
    const v = 0.8 + n[i] * 0.3 + (rnd() - 0.5) * 0.08;
    img.data[i * 4] = 222 * v; img.data[i * 4 + 1] = 184 * v; img.data[i * 4 + 2] = 130 * v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}

// Painted concrete kerb, one colour pair per tile (v runs along the kerb, u across it from the
// track edge outward). Paint is chipped back to concrete where tyres ride it, rubber is laid
// along the direction of travel, and each block carries the moulded ribs of a real kerb.
// Returns the colour map; kerbNormal() gives the matching relief.
export function kerb(c1 = '#b81a1f', c2 = '#dcdcd8', stepped = false) {
  const W = 256, H = 512;
  const [c, g] = canvas(W, H);
  let seed = stepped ? 73 : 29;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = makeNoise(256, 5, stepped ? 5 : 9);
  g.fillStyle = c1; g.fillRect(0, 0, W, H / 2);
  g.fillStyle = c2; g.fillRect(0, H / 2, W, H / 2);
  // moulded ribs across the kerb: lit leading edge, shadowed trailing edge
  const ribs = stepped ? 16 : 20;
  for (let k = 0; k < ribs; k++) {
    const y = (k * H) / ribs;
    g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(W * 0.1, y, W * 0.8, 3);
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(W * 0.1, y + 3, W * 0.8, 2);
  }
  // joints between the cast blocks
  for (const y of [0, H / 2]) {
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y - 2, W, 5);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(0, y + 3, W, 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, H - 2, W, 2);
  if (stepped) {
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.3)'); grd.addColorStop(0.14, 'rgba(255,255,255,0.1)');
    grd.addColorStop(0.5, 'rgba(0,0,0,0.2)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    grd.addColorStop(0.92, 'rgba(0,0,0,0.24)'); grd.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
  } else {
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0.22)'); grd.addColorStop(0.07, 'rgba(0,0,0,0)');
    grd.addColorStop(0.86, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
  }
  // weathering pass on the pixels: paint flakes back to pale concrete, mostly on the track side
  // and along block edges; sun-faded blotches; fine grit
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const nv = n[(y % 256) * 256 + (x % 256)], nf = n[((y * 3 + 40) % 256) * 256 + ((x * 3 + 90) % 256)];
    const u = x / W, by = (y % (H / 2)) / (H / 2);
    const edge = Math.max(0, 1 - Math.min(by, 1 - by) * 14) * 0.25;
    const ride = Math.exp(-((u - 0.3) ** 2) / 0.06) * 0.2;       // where the inside wheels cross
    const flake = nv * 0.55 + nf * 0.45 + edge + ride + (rnd() - 0.5) * 0.12;
    const fade = 0.9 + nv * 0.2;
    let r = d[i] * fade, gg = d[i + 1] * fade, b = d[i + 2] * fade;
    if (flake > 0.8) { const k = Math.min(1, (flake - 0.8) * 9); const cv = 150 + nf * 40; r += (cv - r) * k; gg += (cv - gg) * k; b += (cv * 0.96 - b) * k; }
    const grit = 1 + (rnd() - 0.5) * 0.1;
    d[i] = Math.min(255, r * grit); d[i + 1] = Math.min(255, gg * grit); d[i + 2] = Math.min(255, b * grit);
  }
  g.putImageData(img, 0, 0);
  // rubber laid down along the direction of travel, densest over the inner third
  for (let k = 0; k < 70; k++) {
    const x = W * (0.06 + rnd() * rnd() * 0.8), y = rnd() * H, len = 60 + rnd() * 260, a = 0.05 + rnd() * 0.16;
    for (const oy of [0, -H]) {
      const grd = g.createLinearGradient(0, y + oy, 0, y + oy + len);
      grd.addColorStop(0, 'rgba(14,14,16,0)'); grd.addColorStop(0.3, `rgba(14,14,16,${a})`); grd.addColorStop(1, 'rgba(14,14,16,0)');
      g.fillStyle = grd; g.fillRect(x, y + oy, 5 + rnd() * 16, len);
    }
  }
  const t = tex(c);
  t.anisotropy = 16;
  return t;
}

// Relief for the kerb texture above: sawtooth ribs across each block and the joints between blocks.
export function kerbNormal(stepped = false) {
  const W = 128, H = 512;
  const hgt = new Float32Array(W * H);
  const ribs = stepped ? 16 : 20, rl = H / ribs;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W;
    let h = (y % rl) / rl;                               // ramp up, then drop: a sawtooth
    if (u < 0.1 || u > 0.9) h = 0.5;
    const by = y % (H / 2);
    if (by < 3 || by > H / 2 - 3) h = -0.6;              // joint
    hgt[y * W + x] = h;
  }
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const l = hgt[y * W + ((x - 1 + W) % W)], r = hgt[y * W + ((x + 1) % W)];
    const u = hgt[((y - 1 + H) % H) * W + x], dn = hgt[((y + 1) % H) * W + x];
    const nx = (l - r) * 1.2, ny = (u - dn) * 1.2, len = Math.hypot(nx, ny, 1);
    const k = (y * W + x) * 4;
    img.data[k] = ((nx / len) * 0.5 + 0.5) * 255; img.data[k + 1] = ((ny / len) * 0.5 + 0.5) * 255; img.data[k + 2] = ((1 / len) * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c, true, false);
}

// Thermoplastic road paint: off-white, with fine cracking, grit, chipped edges and tyre scuffs.
// u runs across the line, v along it. Alpha carries the chipped edges and worn-through patches.
export function paintLine() {
  const W = 64, H = 1024;
  const [c, g] = canvas(W, H);
  let seed = 211;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = makeNoise(256, 5, 43);
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const nv = n[((y >> 1) % 256) * 256 + ((x * 3) % 256)], nb = n[((y >> 3) % 256) * 256 + ((x + 77) % 256)];
    const v = 226 + nv * 20 + (rnd() - 0.5) * 10 - nb * 16;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v * 0.97;
    const edge = Math.min(x, W - 1 - x) / 6;                 // 0 at the edge .. 1 six texels in
    let a = Math.min(1, edge + 0.55 - nv * 0.5);
    img.data[i + 3] = Math.max(0, Math.min(1, a)) * 255;
  }
  g.putImageData(img, 0, 0);
  // rubber dragged across and along the line
  g.globalCompositeOperation = 'source-atop';
  for (let k = 0; k < 46; k++) {
    const y = rnd() * H, len = 40 + rnd() * 220, x = rnd() * W, w = 3 + rnd() * 9;
    const grd = g.createLinearGradient(0, y, 0, y + len);
    const a = 0.04 + rnd() * 0.1;
    grd.addColorStop(0, 'rgba(20,20,22,0)'); grd.addColorStop(0.3, `rgba(20,20,22,${a})`); grd.addColorStop(1, 'rgba(20,20,22,0)');
    g.fillStyle = grd;
    g.fillRect(x, y, w, len);
  }
  g.globalCompositeOperation = 'source-over';
  const t = tex(c);
  t.anisotropy = 16;
  return t;
}

// Raised anti-cut chicane "sausage" (baguette) kerb: bold amber-yellow with dark hazard ridges & scuffs
export function sausageKerb() {
  const [c, g] = canvas(128, 256);
  let seed = 83;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, '#8a5d04'); grd.addColorStop(0.25, '#e8a80c');
  grd.addColorStop(0.5, '#f6c921'); grd.addColorStop(0.75, '#e29e0a'); grd.addColorStop(1, '#7a5204');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 256);
  // dark alternating bolt/rib sections along the sausage length
  for (let y = 0; y < 256; y += 64) {
    g.fillStyle = 'rgba(18,16,14,0.68)'; g.fillRect(0, y, 128, 12);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, y + 12, 128, 3);
  }
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = `rgba(15,15,15,${rnd() * 0.18})`;
    g.fillRect(rnd() * 128, rnd() * 256, 2 + rnd() * 4, 2 + rnd() * 8);
  }
  return tex(c);
}

// Dark-emerald green painted verge / synthetic astroturf strip behind Spa exit kerbs
export function astroturf() {
  const S = 256;
  const n = makeNoise(S, 4, 61);
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  let seed = 67;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < S * S; i++) {
    const v = 0.8 + n[i] * 0.28 + (rnd() - 0.5) * 0.14;
    img.data[i * 4] = Math.min(255, 34 * v);
    img.data[i * 4 + 1] = Math.min(255, 92 * v);
    img.data[i * 4 + 2] = Math.min(255, 50 * v);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // fine synthetic turf drainage weave + tyre rubber dust
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < S; y += 8) g.fillRect(0, y, S, 1);
  for (let k = 0; k < 24; k++) {
    g.fillStyle = `rgba(16,18,16,${0.08 + rnd() * 0.12})`;
    g.fillRect(rnd() * S, 0, 4 + rnd() * 14, S);
  }
  return tex(c);
}

// Iconic Spa-Francorchamps red & yellow painted high-friction tarmac runoff stripes
export function spaRunoff() {
  const S = 512;
  const n = makeNoise(S, 5, 97);
  const [c, g] = canvas(S, S);
  let seed = 101;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // weathered dark tarmac base
  g.fillStyle = '#383b40'; g.fillRect(0, 0, S, S);
  // bold diagonal red & Belgian-yellow high-friction paint bands (tileable at 45 deg!)
  const band = S / 4;
  for (let k = -4; k <= 8; k++) {
    g.fillStyle = k % 2 === 0 ? '#a81e24' : '#c9a21b';
    g.beginPath();
    g.moveTo(k * band, 0);
    g.lineTo(k * band + band * 0.62, 0);
    g.lineTo(k * band + band * 0.62 + S, S);
    g.lineTo(k * band + S, S);
    g.closePath();
    g.fill();
  }
  // rough bitumen grit & dark tyre marks over the paint so it reads as painted asphalt, not plastic
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) {
    const gr = 0.72 + n[i] * 0.34 + (rnd() - 0.5) * 0.16;
    img.data[i * 4] = Math.min(255, img.data[i * 4] * gr);
    img.data[i * 4 + 1] = Math.min(255, img.data[i * 4 + 1] * gr);
    img.data[i * 4 + 2] = Math.min(255, img.data[i * 4 + 2] * gr);
  }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 40; k++) {
    g.strokeStyle = `rgba(14,14,16,${0.08 + rnd() * 0.16})`;
    g.lineWidth = 4 + rnd() * 8;
    const x = rnd() * S;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * 40, S); g.stroke();
  }
  return tex(c);
}

// Galvanized steel double-beam Armco guardrail for classic Ardennes forest corridors
export function armco() {
  const W = 512, H = 128;
  const [c, g] = canvas(W, H);
  let seed = 131;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // dark shadow behind the rails + steel I-beam support posts
  g.fillStyle = '#2d3136'; g.fillRect(0, 0, W, H);
  for (let x = 24; x < W; x += 64) {
    g.fillStyle = '#4e545c'; g.fillRect(x - 4, 0, 9, H);
    g.fillStyle = '#26292e'; g.fillRect(x + 5, 0, 3, H);
  }
  // triple/double corrugated W-beam galvanized rails
  const drawRail = (y0, h) => {
    const grd = g.createLinearGradient(0, y0, 0, y0 + h);
    grd.addColorStop(0.0, '#c8ced6');
    grd.addColorStop(0.22, '#f0f3f7');
    grd.addColorStop(0.45, '#7c848e');
    grd.addColorStop(0.56, '#5a616b');
    grd.addColorStop(0.76, '#dce1e8');
    grd.addColorStop(1.0, '#6a717a');
    g.fillStyle = grd; g.fillRect(0, y0, W, h);
    // splice joints + bolts
    for (let x = 0; x < W; x += 128) {
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, y0, 3, h);
      for (const by of [0.22, 0.78]) {
        g.fillStyle = '#383d44'; g.beginPath(); g.arc(x + 9, y0 + h * by, 2.2, 0, 6.3); g.fill();
      }
    }
  };
  drawRail(6, 36);
  drawRail(48, 36);
  drawRail(90, 30);
  // road grime & subtle scuffs
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(25,22,18,${0.06 + rnd() * 0.14})`;
    g.fillRect(rnd() * W, rnd() * H, 10 + rnd() * 50, 1 + rnd() * 3);
  }
  const grdB = g.createLinearGradient(0, H - 28, 0, H);
  grdB.addColorStop(0, 'rgba(20,18,14,0)'); grdB.addColorStop(1, 'rgba(20,18,14,0.48)');
  g.fillStyle = grdB; g.fillRect(0, H - 28, W, 28);
  return tex(c);
}

export function checker() {
  // one tile = 2 x 2 squares; mipmapped, so the line stays clean at a distance instead of shimmering
  const [c, g] = canvas(64, 64);
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    g.fillStyle = (x + y) % 2 ? '#1a1a1b' : '#dededa';
    g.fillRect(x * 32, y * 32, 32, 32);
  }
  for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(40,40,42,${rnd() * 0.12})`; g.fillRect(rnd() * 64, rnd() * 64, 1 + rnd() * 2, 1 + rnd() * 5); }
  const t = tex(c);
  t.anisotropy = 16;
  return t;
}

export const SPONSORS = [
  ['VOLTAIC', '#0d0d12', '#39ff6a'], ['NORDLINE', '#0b1d4a', '#ffffff'], ['AEROMAX', '#e8e8e8', '#d0103a'],
  ['KESTREL', '#d0103a', '#ffffff'], ['HALCYON', '#1f4fff', '#ffd400'], ['MERIDIAN', '#111111', '#ff8a00'],
  ['QUANTA', '#6a2cff', '#ffffff'], ['ORBITAL', '#ffd400', '#111111'], ['TYREX', '#111111', '#ffd400'],
  ['SOLACE', '#ffffff', '#6a2cff'], ['FULMINE', '#ff4d1a', '#111111'], ['TUNDRA', '#00d4ff', '#0b1220'],
  ['APEX GP', '#c8102e', '#ffffff'], ['VELOCE', '#0a8f8a', '#ffffff'], ['IRONBARK', '#5a6b2a', '#ffd9a0'],
];

export function adBoards() {
  const W = 2048, H = 128;
  const [c, g] = canvas(W, H);
  const pw = W / 8;
  for (let k = 0; k < 8; k++) {
    const [name, bg, fg] = SPONSORS[(k * 3) % SPONSORS.length];
    g.fillStyle = bg; g.fillRect(k * pw, 0, pw, H);
    g.fillStyle = fg;
    g.font = 'italic 900 70px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(name, k * pw + pw / 2, H / 2 + 4, pw - 24);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(k * pw, 0, 3, H);
  }
  return tex(c);
}

export function concrete() {
  const S = 256;
  const n = makeNoise(S, 5, 51);
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 0.72 + n[i] * 0.25 + (Math.random() - 0.5) * 0.06;
    img.data[i * 4] = 200 * v; img.data[i * 4 + 1] = 200 * v; img.data[i * 4 + 2] = 196 * v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return tex(c);
}

export function fence() {
  const S = 128;
  const [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(190,195,200,0.9)';
  g.lineWidth = 2;
  for (let k = -S; k < S * 2; k += 16) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke();
    g.beginPath(); g.moveTo(k, S); g.lineTo(k + S, 0); g.stroke();
  }
  const t = tex(c);
  return t;
}

export function boardNumber(text, bg = '#ffffff', fg = '#111111') {
  const [c, g] = canvas(128, 128);
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120);
  g.fillStyle = fg; g.font = '900 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 68);
  return tex(c, false);
}

export function numberDecal(num, color = '#ffffff') {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = color; g.font = 'italic 900 92px "Helvetica Neue", Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(num), 64, 70);
  return tex(c, false);
}

export function garage() {
  const [c, g] = canvas(1024, 128);
  g.fillStyle = '#d9dde2'; g.fillRect(0, 0, 1024, 128);
  for (let k = 0; k < 8; k++) {
    const [, bg, fg] = SPONSORS[(k * 5) % SPONSORS.length];
    g.fillStyle = '#15171a'; g.fillRect(k * 128 + 10, 30, 108, 98);
    g.fillStyle = bg; g.fillRect(k * 128 + 10, 10, 108, 18);
    g.fillStyle = fg; g.fillRect(k * 128 + 14, 16, 30, 6);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = 36; y < 128; y += 8) g.fillRect(k * 128 + 10, y, 108, 1);
  }
  return tex(c);
}

export function smokeSprite() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}

export function carbon() {
  const [c, g] = canvas(64, 64);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = (x + y) % 2 ? 26 : 38;
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  return tex(c);
}
