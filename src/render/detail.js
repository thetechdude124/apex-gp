// Realism detail layer: wear overlays, macro variation (kills texture tiling), fine catch
// fencing, weathered barriers, trackside banners and skyline facades. All procedural.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}
function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// ---------------------------------------------------------------- macro noise
// A soft, tileable two-octave noise. Sampled at very low frequency by the ground materials so
// no two stretches of grass or tarmac look the same.
let MACRO = null;
export function macroNoise() {
  if (MACRO) return MACRO;
  const S = 256, r = rng(77);
  const out = new Float32Array(S * S);
  let amp = 1, tot = 0;
  for (let o = 0; o < 5; o++) {
    const cells = 4 << o, grid = new Float32Array(cells * cells).map(() => r()), cs = S / cells;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const gx = x / cs, gy = y / cs, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const g = (i, j) => grid[((j % cells) * cells) + (i % cells)];
      const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
      out[y * S + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    tot += amp; amp *= 0.55;
  }
  const [c, g] = canvas(S, S);
  const img = g.createImageData(S, S);
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i < S * S; i++) { out[i] /= tot; mn = Math.min(mn, out[i]); mx = Math.max(mx, out[i]); }
  for (let i = 0; i < S * S; i++) { const v = ((out[i] - mn) / (mx - mn)) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  MACRO = tex(c, true, false);
  MACRO.anisotropy = 2;
  return MACRO;
}

// Break up a tiling ground texture: brightness drifts over tens of metres, and (optionally)
// the colour drifts toward `tint` in patches (dry grass, dusty sand).
export function applyMacro(mat, { scale = 0.11, amount = 0.3, tint = null, tintAmt = 0.5 } = {}) {
  const u = { uMacro: { value: macroNoise() }, uMacTint: { value: new THREE.Color(...(tint || [1, 1, 1])) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform sampler2D uMacro; uniform vec3 uMacTint;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      #ifdef USE_MAP
        float mA = texture2D(uMacro, vMapUv * ${scale.toFixed(4)}).r;
        float mB = texture2D(uMacro, vMapUv * ${(scale * 0.27).toFixed(4)} + 0.37).r;
        float mC = texture2D(uMacro, vMapUv * ${(scale * 3.7).toFixed(4)} + 0.11).r;
        diffuseColor.rgb *= 1.0 + ${amount.toFixed(3)} * ((mA * 0.5 + mB * 0.3 + mC * 0.2) * 2.0 - 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uMacTint, ${tintAmt.toFixed(3)} * smoothstep(0.42, 0.72, mB * 0.6 + mC * 0.4));
      #endif`);
  };
  mat.customProgramCacheKey = () => `macro:${scale}:${amount}:${tintAmt}`;
  return mat;
}

// ---------------------------------------------------------------- track wear overlay
// One grey channel stretched across the full track width and tiled every `TRACK_DET_LEN`
// metres: 0.5 = untouched, darker = rubber / tar / oil (also glossier), lighter = polished.
export const TRACK_DET_LEN = 128;
export function trackDetail() {
  const W = 512, H = 2048, r = rng(4242);
  const [c, g] = canvas(W, H);
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, W, H);
  // draw something three times so it wraps along the track
  const wrapY = (fn) => { for (const o of [-H, 0, H]) { g.save(); g.translate(0, o); fn(); g.restore(); } };
  // two paving passes meet at a joint just off-centre: slightly different shades
  g.fillStyle = 'rgba(0,0,0,0.035)'; g.fillRect(0, 0, W * 0.47, H);
  // broad blotches: uneven wear and weathering
  for (let k = 0; k < 260; k++) {
    const x = r() * W, y = r() * H, rad = 20 + r() * 110, dark = r() < 0.55;
    wrapY(() => {
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const a = 0.03 + r() * 0.05;
      grd.addColorStop(0, dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.8})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.save(); g.translate(x, y); g.scale(0.55, 2.2); g.translate(-x, -y); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.restore();
    });
  }
  // resurfaced patches with a sealed outline
  for (let k = 0; k < 4; k++) {
    const x = 30 + r() * (W - 190), y = r() * H, w = 70 + r() * 110, h = 90 + r() * 240, lighter = r() < 0.4;
    wrapY(() => {
      g.fillStyle = lighter ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.09)'; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
    });
  }
  // longitudinal construction joint
  g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 1.6;
  g.beginPath(); for (let y = 0; y <= H; y += 16) { const x = W * 0.47 + Math.sin(y * 0.011) * 1.5; y ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  // transverse joints
  for (const y of [3, H * 0.31, H * 0.64]) { g.strokeStyle = 'rgba(0,0,0,0.2)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (r() - 0.5) * 6); g.stroke(); }
  // tar crack-sealing: dark wandering lines
  for (let k = 0; k < 22; k++) {
    let x = r() * W, y = r() * H, ang = Math.PI / 2 + (r() - 0.5) * 1.6;
    const len = 20 + r() * 180, a = 0.35 + r() * 0.3, lw = 1.4 + r() * 1.6;
    const pts = [[x, y]];
    for (let q = 0; q < len; q += 6) { ang += (r() - 0.5) * 0.5; x += Math.cos(ang) * 6 * 0.45; y += Math.sin(ang) * 6; pts.push([x, y]); }
    wrapY(() => { g.strokeStyle = `rgba(12,12,14,${a})`; g.lineWidth = lw; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke(); });
  }
  // skid marks: paired tyre-width streaks, soft-edged, mostly along the direction of travel
  for (let k = 0; k < 46; k++) {
    const x = 40 + r() * (W - 80), y = r() * H, len = 120 + r() * 520, a = 0.05 + r() * 0.13, drift = (r() - 0.5) * 50, gap = 52 + r() * 8;
    const single = r() < 0.3;
    wrapY(() => {
      for (const o of single ? [0] : [0, gap]) {
        const grd = g.createLinearGradient(0, y, 0, y + len);
        grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.25, `rgba(0,0,0,${a})`); grd.addColorStop(0.8, `rgba(0,0,0,${a * 0.8})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.strokeStyle = grd; g.lineWidth = 9 + r() * 4; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x + o, y); g.bezierCurveTo(x + o, y + len * 0.4, x + o + drift, y + len * 0.7, x + o + drift * 1.4, y + len); g.stroke();
      }
    });
  }
  // oil and coolant stains
  for (let k = 0; k < 30; k++) {
    const x = r() * W, y = r() * H, rad = 4 + r() * 14;
    wrapY(() => { const grd = g.createRadialGradient(x, y, 0, x, y, rad); grd.addColorStop(0, `rgba(0,0,0,${0.12 + r() * 0.2})`); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(x - rad, y - rad * 2, rad * 2, rad * 4); });
  }
  const t = tex(c, true, false);
  t.anisotropy = 16;
  return t;
}

// Adds the wear overlay + macro variation + glossy rubber to the racing surface material.
export function applyTrackDetail(mat, trackWidth, uvMetres = 7) {
  const u = { uDet: { value: trackDetail() }, uMacro: { value: macroNoise() } };
  const ux = (uvMetres / (trackWidth + 0.4)).toFixed(5), uy = (uvMetres / TRACK_DET_LEN).toFixed(5);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform sampler2D uDet; uniform sampler2D uMacro;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        float apxDet = texture2D(uDet, vec2(vMapUv.x * ${ux} + 0.5, vMapUv.y * ${uy})).r;
        float apxMac = texture2D(uMacro, vMapUv * vec2(0.09, 0.023)).r * 0.6 + texture2D(uMacro, vMapUv * 0.31 + 0.2).r * 0.4;
        diffuseColor.rgb *= (apxDet * 2.0) * (0.86 + 0.28 * apxMac);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // rubber, tar and oil are smoother than open aggregate: they catch the sun
        roughnessFactor *= mix(0.7, 1.06, smoothstep(0.2, 0.52, apxDet));
        #ifdef USE_COLOR
          roughnessFactor *= mix(0.8, 1.0, smoothstep(0.6, 0.97, vColor.r));
        #endif
        roughnessFactor = clamp(roughnessFactor * (0.92 + 0.16 * apxMac), 0.2, 1.0);`);
  };
  mat.customProgramCacheKey = () => `trackdet:${ux}`;
  return mat;
}

// ---------------------------------------------------------------- catch fence
// Real debris fencing is fine steel mesh: from a car it reads as a faint grey veil with
// cables and posts, not as a white lattice. 1 tile = 1 m.
export function fenceFine() {
  const S = 256, [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5;
  for (let k = -S; k < S * 2; k += 16) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke();
    g.beginPath(); g.moveTo(k, S); g.lineTo(k + S, 0); g.stroke();
  }
  g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,1)';
  g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
  // constant wire colour in every texel so mipmaps fade the alpha, not the colour
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < S * S; i++) { img.data[i * 4] = 118; img.data[i * 4 + 1] = 123; img.data[i * 4 + 2] = 128; }
  g.putImageData(img, 0, 0);
  const t = tex(c);
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- concrete barrier
// Precast blocks (4 m long, two per tile) with joints, lifting pockets, drips and tyre scuffs.
export function barrier() {
  const W = 1024, H = 128, r = rng(909);
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const v = 150 + r() * 26 + Math.sin((i % W) * 0.013) * 6; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v * 0.97; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  // weathering: darker toward the ground, rain streaks from the top edge
  let grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(0,0,0,0.0)'); grd.addColorStop(0.7, 'rgba(30,26,20,0.12)'); grd.addColorStop(1, 'rgba(30,24,16,0.5)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 150; k++) {
    const x = r() * W, len = 20 + r() * 90, w = 1 + r() * 4;
    grd = g.createLinearGradient(0, 0, 0, len); grd.addColorStop(0, `rgba(25,22,18,${0.1 + r() * 0.22})`); grd.addColorStop(1, 'rgba(25,22,18,0)');
    g.fillStyle = grd; g.fillRect(x, 0, w, len);
  }
  // tyre scuffs and scrapes at car height
  for (let k = 0; k < 26; k++) {
    const x = r() * W, y = 55 + r() * 50, len = 30 + r() * 150;
    g.strokeStyle = `rgba(10,10,12,${0.08 + r() * 0.25})`; g.lineWidth = 1 + r() * 5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (r() - 0.5) * 8); g.stroke();
  }
  for (const x0 of [0, W / 2]) {
    g.fillStyle = 'rgba(15,15,15,0.75)'; g.fillRect(x0, 0, 4, H);          // joint between blocks
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(x0 + 4, 0, 2, H);
    for (const px of [0.25, 0.75]) { g.fillStyle = 'rgba(20,20,20,0.6)'; g.fillRect(x0 + (W / 2) * px - 12, 10, 24, 9); } // lifting pockets
    // stencilled block number
    g.fillStyle = 'rgba(30,30,30,0.35)'; g.font = '700 22px Arial'; g.fillText(String(100 + Math.floor(r() * 800)), x0 + 30, 44);
  }
  return tex(c);
}

// ---------------------------------------------------------------- advertising banners
const BANNERS = [
  ['VOLTAIC', '#0c0e12', '#e9ecef', '#2fbf6b'], ['NORDLINE', '#10244f', '#ffffff', '#9fb4dc'], ['AEROMAX', '#e6e6e2', '#9c1027', '#1a1a1a'],
  ['KESTREL', '#8f1220', '#f2f2f0', '#f2f2f0'], ['MERIDIAN', '#141414', '#e07b12', '#e6e6e2'], ['HALCYON', '#1b3aa8', '#f0d040', '#ffffff'],
  ['SOLACE', '#ececE8', '#3b2a86', '#3b2a86'], ['TYREX', '#161616', '#e3c21c', '#e3c21c'], ['IRONBARK', '#33401f', '#ecd9b0', '#ecd9b0'],
  ['APEX GP', '#a5101f', '#ffffff', '#ffffff'], ['VELOCE', '#0c5f5c', '#f0f0ee', '#bfe6e2'], ['ORBITAL', '#d9b21a', '#151515', '#151515'],
  ['QUANTA', '#3a2a80', '#f0f0f4', '#b9a8ff'], ['TUNDRA', '#0d1a2a', '#57c3e0', '#e8eef2'], ['FULMINE', '#c2461c', '#141414', '#141414'],
  ['NORDLINE', '#e9e9e6', '#10244f', '#10244f'],
];
const TAGS = ['ENERGY', 'LOGISTICS', 'AVIATION', 'TIMING', 'CAPITAL', 'CLOUD', 'INSURANCE', 'TYRES', 'OUTDOOR', 'OFFICIAL PARTNER', 'COFFEE', 'SATELLITE', 'COMPUTE', 'WATER', 'LUBRICANTS', 'FREIGHT'];
export function banners() {
  const W = 4096, H = 128, n = 16, pw = W / n, r = rng(31);
  const [c, g] = canvas(W, H);
  for (let k = 0; k < n; k++) {
    const [name, bg, fg, ac] = BANNERS[k % BANNERS.length];
    const x0 = k * pw;
    g.fillStyle = bg; g.fillRect(x0, 0, pw, H);
    g.fillStyle = ac; g.fillRect(x0 + 14, H - 22, pw - 28, 3);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${k % 3 === 0 ? 'italic ' : ''}${k % 2 ? 800 : 900} 62px "Helvetica Neue", Arial, sans-serif`;
    g.fillText(name, x0 + pw / 2, H / 2 - 8, pw - 40);
    g.font = '600 13px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = ac;
    g.fillText(TAGS[k % TAGS.length], x0 + pw / 2, H - 34, pw - 40);
    // frame edges, fixings and a little road grime along the bottom
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x0, 0, 2, H); g.fillRect(x0 + pw - 2, 0, 2, H);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x0 + 2, 0, 1, H);
    const grd = g.createLinearGradient(0, H - 26, 0, H); grd.addColorStop(0, 'rgba(40,34,26,0)'); grd.addColorStop(1, 'rgba(40,34,26,0.45)');
    g.fillStyle = grd; g.fillRect(x0, H - 26, pw, 26);
    for (let q = 0; q < 14; q++) { g.fillStyle = `rgba(20,18,14,${r() * 0.12})`; g.fillRect(x0 + r() * pw, r() * H, 2 + r() * 30, 1 + r() * 2); }
  }
  return tex(c);
}

// ---------------------------------------------------------------- skyline facades
export function facade(warmLit = 0) {
  const S = 256, r = rng(515);
  const [c, g] = canvas(S, S);
  g.fillStyle = '#5d6670'; g.fillRect(0, 0, S, S);
  const cw = S / 8, ch = S / 16;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
    const lit = r() < warmLit;
    const v = 26 + r() * 46;
    g.fillStyle = lit ? `rgb(${230 + r() * 25},${180 + r() * 40},${110 + r() * 40})` : `rgb(${v * 0.75},${v * 0.9},${v * 1.1})`;
    g.fillRect(x * cw + 3, y * ch + 3, cw - 6, ch - 5);
  }
  return tex(c);
}

// ---------------------------------------------------------------- tyre barrier
// Stacked tyres behind a rubber conveyor belt, in painted blocks. 1 tile = 4.8 m x 1 m.
export function tyreWall() {
  const W = 512, H = 128, r = rng(1212);
  const [c, g] = canvas(W, H);
  const cols = 8, cw = W / cols;
  for (let k = 0; k < cols; k++) {
    const paint = k % 4 === 1 ? [150, 24, 30] : k % 4 === 3 ? [196, 196, 190] : [24, 24, 26];
    const x0 = k * cw;
    // each stack is a cylinder: bright toward the middle, dark in the gaps between stacks
    const grd = g.createLinearGradient(x0, 0, x0 + cw, 0);
    const sh = (f) => `rgb(${paint.map((v) => Math.round(v * f)).join(',')})`;
    grd.addColorStop(0, sh(0.25)); grd.addColorStop(0.3, sh(0.95)); grd.addColorStop(0.5, sh(1.1)); grd.addColorStop(0.75, sh(0.8)); grd.addColorStop(1, sh(0.22));
    g.fillStyle = grd; g.fillRect(x0, 0, cw, H);
    for (let t = 1; t < 5; t++) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x0, (t * H) / 5 - 2, cw, 3); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x0, (t * H) / 5 + 1, cw, 1); }
    for (let q = 0; q < 26; q++) { g.fillStyle = `rgba(0,0,0,${r() * 0.2})`; g.fillRect(x0 + r() * cw, r() * H, 2 + r() * 8, 1 + r() * 3); }
  }
  // conveyor belt strapped across the front, bolted to every stack
  g.fillStyle = 'rgba(14,14,15,0.94)'; g.fillRect(0, H * 0.3, W, H * 0.42);
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, H * 0.3, W, 2);
  for (let k = 0; k < cols; k++) for (const y of [0.37, 0.65]) { g.fillStyle = '#6d7278'; g.beginPath(); g.arc(k * cw + cw / 2, H * y, 2.6, 0, 6.3); g.fill(); }
  for (let q = 0; q < 40; q++) { g.strokeStyle = `rgba(120,120,120,${r() * 0.12})`; g.lineWidth = 1; g.beginPath(); const x = r() * W, y = H * (0.32 + r() * 0.38); g.moveTo(x, y); g.lineTo(x + 10 + r() * 60, y + (r() - 0.5) * 4); g.stroke(); }
  return tex(c);
}

// soft dark gradient used as a contact-shadow strip at the foot of barriers and buildings
export function contactStrip() {
  const [c, g] = canvas(64, 4);
  const grd = g.createLinearGradient(0, 0, 64, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0.62)'); grd.addColorStop(0.35, 'rgba(0,0,0,0.25)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 4);
  const t = tex(c, false);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}
