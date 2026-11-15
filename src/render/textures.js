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

export function asphalt() {
  // 1024 px over 7 m (7 mm per texel). The surface is drawn as individual stones in bitumen,
  // each a couple of texels across, so it still reads as aggregate when the camera is close
  // instead of dissolving into magnified noise.
  const S = 1024;
  const n = makeNoise(S, 5, 7);
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < S * S; i++) {
    const v = (0.25 + (n[i] - 0.5) * 0.03 + (rnd() - 0.5) * 0.03) * 255;
    const k = i * 4;
    img.data[k] = v; img.data[k + 1] = v; img.data[k + 2] = v * 1.02; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const stones = 150000;
  for (let q = 0; q < stones; q++) {
    const x = rnd() * S, y = rnd() * S, r = 0.7 + rnd() * rnd() * 2.4, t = rnd(), hue = rnd();
    let v = 58 + t * 38;
    if (t > 0.965) v = 120 + rnd() * 60;      // pale chippings
    else if (t < 0.12) v = 38 + rnd() * 10;   // dark basalt
    const cr = v * (1 + (hue - 0.5) * 0.1), cb = v * (1 - (hue - 0.5) * 0.12);
    g.fillStyle = 'rgba(0,0,0,0.3)';
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
    hgt[i] = Math.min(1, l * 2.6);
    const v = 0.93 - Math.min(0.2, Math.max(0, l - 0.2) * 0.9) + (n[i] - 0.5) * 0.08;
    rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = Math.min(255, v * 255); rimg.data[i * 4 + 3] = 255;
  }
  rg.putImageData(rimg, 0, 0);
  const out = { map: tex(c), normal: tex(normalFromHeight(hgt, S, 1.6), true, false), rough: tex(rc, true, false) };
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

export function gravel() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  let seed = 17;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const hgt = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const r = rnd();
    const v = 0.7 + r * 0.45;
    hgt[i] = r;
    img.data[i * 4] = 196 * v; img.data[i * 4 + 1] = 176 * v; img.data[i * 4 + 2] = 140 * v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { map: tex(c), normal: tex(normalFromHeight(hgt, S, 3), true, false) };
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

export function kerb(c1 = '#b81a1f', c2 = '#dcdcd8') {
  const [c, g] = canvas(64, 256);
  g.fillStyle = c1; g.fillRect(0, 0, 64, 128);
  g.fillStyle = c2; g.fillRect(0, 128, 64, 128);
  // subtle grime + edge
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * 64, Math.random() * 256, 2, 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, 4, 256);
  return tex(c);
}

export function checker() {
  const [c, g] = canvas(128, 32);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#f2f2f2';
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  const t = tex(c);
  t.magFilter = THREE.NearestFilter;
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
