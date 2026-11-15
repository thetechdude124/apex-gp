// Painted (procedural) textures for the things that read as "cartoon" when they are low-poly:
// trees, the crowd, clouds. Everything is drawn to canvases at load time.
import * as THREE from 'three';

function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function finish(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  return t;
}

// soft leafy blob
function blob(g, x, y, r, h, s, l, a = 1) {
  const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  grd.addColorStop(0, `hsla(${h},${s}%,${l + 9}%,${a})`);
  grd.addColorStop(0.7, `hsla(${h},${s}%,${l}%,${a})`);
  grd.addColorStop(1, `hsla(${h},${s}%,${Math.max(2, l - 7)}%,${a})`);
  g.fillStyle = grd;
  g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}

// kinds: pine, oak, umbrella, cypress, palm.  Returns {map, w, h} (metres)
export function treeTexture(kind, seed = 1) {
  const W = 256, H = 512;
  const [c, g] = cnv(W, H);
  const R = rng(seed * 977 + 13);
  const trunk = (x0, x1, y0, y1, w0, w1, col = '#3d2f25') => {
    g.fillStyle = col;
    g.beginPath(); g.moveTo(x0 - w0, y0); g.lineTo(x0 + w0, y0); g.lineTo(x1 + w1, y1); g.lineTo(x1 - w1, y1); g.fill();
    g.fillStyle = 'rgba(255,220,180,0.10)'; g.fillRect(Math.min(x0, x1) - w0, y1, w0 * 0.7, y0 - y1);
  };
  let size = [8, 14];
  if (kind === 'pine') {
    size = [7.5, 15];
    trunk(128, 128, 512, 300, 9, 5);
    // layered boughs, drawn back-to-front: dark interior first, lit needles on top
    for (let pass = 0; pass < 2; pass++) for (let t = 0; t < 9; t++) {
      const yTop = 6 + t * 46, hw = 16 + t * 12.5, hh = 105;
      const n = 150 + t * 22;
      for (let k = 0; k < n; k++) {
        const v = Math.pow(R(), 0.7), u = (R() * 2 - 1) * v;
        const x = 128 + u * hw, y = yTop + v * hh + (R() - 0.5) * 8;
        const edge = Math.abs(u) / (v + 0.05);
        const light = pass === 0 ? 7 + R() * 6 : 12 + R() * 13 - edge * 3 + (u < 0 ? 5 : 0) - (v > 0.75 ? 4 : 0);
        if (pass === 1 && R() < 0.45) continue;
        g.strokeStyle = `hsl(${128 + R() * 22},${28 + R() * 14}%,${light}%)`;
        g.lineWidth = 2 + R() * 2.4;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sign(u || 1) * (5 + R() * 9), y + 4 + R() * 7); g.stroke();
      }
    }
  } else if (kind === 'oak') {
    size = [11, 12];
    trunk(128, 128, 512, 250, 12, 8);
    g.strokeStyle = '#3d2f25'; g.lineWidth = 7;
    for (const a of [-0.9, -0.3, 0.4, 1.0]) { g.beginPath(); g.moveTo(128, 330); g.lineTo(128 + Math.sin(a) * 80, 330 - Math.cos(a) * 110); g.stroke(); }
    for (let pass = 0; pass < 3; pass++) for (let k = 0; k < 420; k++) {
      const a = R() * 6.283, rr = Math.sqrt(R());
      const x = 128 + Math.cos(a) * rr * 112, y = 180 + Math.sin(a) * rr * 150;
      if (y > 345 && Math.abs(x - 128) < 60) continue;
      const lit = (1 - (y - 30) / 320) * 12 + (x < 128 ? 3 : 0);
      blob(g, x, y, 8 + R() * 11, 92 + R() * 26, 22 + R() * 12, 9 + pass * 4 + lit * (0.4 + pass * 0.3) + R() * 5);
    }
  } else if (kind === 'umbrella') {
    size = [13, 13];
    trunk(128, 136, 512, 180, 8, 5, '#4a3a2e');
    g.strokeStyle = '#4a3a2e'; g.lineWidth = 6;
    for (const dx of [-75, -35, 30, 80]) { g.beginPath(); g.moveTo(134, 235); g.quadraticCurveTo(134 + dx * 0.4, 190, 134 + dx, 140); g.stroke(); }
    for (let pass = 0; pass < 3; pass++) for (let k = 0; k < 480; k++) {
      const a = R() * 6.283, rr = Math.sqrt(R());
      const x = 128 + Math.cos(a) * rr * 120, y = 112 + Math.sin(a) * rr * 62 - (1 - (Math.cos(a) * rr) ** 2) * 14;
      const lit = (1 - (y - 40) / 140) * 12;
      blob(g, x, y, 7 + R() * 9, 86 + R() * 24, 20 + R() * 12, 10 + pass * 4 + lit * (0.5 + pass * 0.25) + R() * 4);
    }
  } else if (kind === 'cypress') {
    size = [3.6, 14];
    trunk(128, 128, 512, 440, 6, 5);
    for (let pass = 0; pass < 3; pass++) for (let k = 0; k < 520; k++) {
      const v = R(), y = 14 + v * 470;
      const hw = 44 * Math.sin(Math.min(1, v * 1.25 + 0.06) * Math.PI * 0.86) + 3;
      const x = 128 + (R() * 2 - 1) * hw;
      blob(g, x, y, 5 + R() * 7, 120 + R() * 22, 26 + R() * 12, 7 + pass * 3 + (x < 128 ? 4 : 0) + R() * 5);
    }
  } else if (kind === 'palm') {
    size = [8, 12];
    // slightly curved trunk with ring texture
    for (let k = 0; k < 60; k++) {
      const v = k / 59, x = 128 + Math.sin(v * 1.3) * 22, y = 512 - v * 330, w = 9 - v * 3.5;
      g.fillStyle = k % 2 ? '#6e5a45' : '#5d4b39'; g.fillRect(x - w, y - 6, w * 2, 7);
    }
    const tx = 128 + Math.sin(1.3) * 22, ty = 182;
    for (let f = 0; f < 15; f++) {
      const a = -Math.PI * (0.02 + (f / 14) * 0.96) + (R() - 0.5) * 0.15;
      const len = 105 + R() * 25, droop = 55 + R() * 45;
      const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.7 + droop * (Math.abs(Math.cos(a)) * 0.9 + 0.2);
      const cx = tx + Math.cos(a) * len * 0.6, cy = ty + Math.sin(a) * len * 0.95;
      for (let s = 0; s <= 22; s++) {
        const t = s / 22, u = 1 - t;
        const px = u * u * tx + 2 * u * t * cx + t * t * ex, py = u * u * ty + 2 * u * t * cy + t * t * ey;
        const ll = 22 * Math.sin(Math.PI * Math.min(1, t + 0.12)) + 4;
        g.strokeStyle = `hsl(${84 + R() * 22},${36 + R() * 12}%,${16 + R() * 14 + (py < ty ? 5 : 0)}%)`;
        g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px - 5, py + ll); g.stroke();
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + 6, py + ll * 0.8); g.stroke();
      }
    }
    blob(g, tx, ty + 4, 13, 60, 30, 14);
  }
  return { map: finish(c), w: size[0], h: size[1] };
}

// two crossed quads, pivot at the base
export function treeGeometry(w, h) {
  const g = new THREE.BufferGeometry();
  const hw = w / 2;
  const pos = [], uv = [], idx = [], nor = [];
  for (const [ax, az] of [[1, 0], [0, 1]]) {
    const o = pos.length / 3;
    pos.push(-hw * ax, 0, -hw * az, hw * ax, 0, hw * az, hw * ax, h, hw * az, -hw * ax, h, -hw * az);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let k = 0; k < 4; k++) nor.push(0, 1, 0);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// a packed grandstand seen from the track: rows of heads and shoulders
export function crowdTexture(rows = 16) {
  const W = 1024, H = 512;
  const [c, g] = cnv(W, H);
  const R = rng(4242);
  const shirts = ['#c9ccd2', '#e6e3dc', '#8d1f24', '#b3262c', '#1d2f55', '#27477f', '#20242b', '#3a3f48', '#d9b32c', '#5d7a4a', '#b9642a', '#6c5a8a', '#7f8791', '#f1efe9', '#a33'];
  const skins = ['#e6b99a', '#d9a887', '#c48f6c', '#a8744f', '#7c5236', '#f0cbb0'];
  const rh = H / rows;
  g.fillStyle = '#3b3f46'; g.fillRect(0, 0, W, H);
  for (let r = 0; r < rows; r++) {
    const y0 = r * rh;
    g.fillStyle = '#2b2e34'; g.fillRect(0, y0, W, rh);               // shadowed step
    g.fillStyle = '#4a4f58'; g.fillRect(0, y0 + rh - 5, W, 5);       // step edge
    for (let x = 4 + R() * 6; x < W - 8; x += 13 + R() * 4) {
      if (R() < 0.07) { g.fillStyle = '#565c66'; g.fillRect(x - 5, y0 + rh * 0.45, 11, rh * 0.4); continue; } // empty seat
      const sh = shirts[Math.floor(R() * shirts.length)], sk = skins[Math.floor(R() * skins.length)];
      const up = R() < 0.06 ? -6 : 0; // someone standing
      g.fillStyle = sh;
      g.beginPath(); g.roundRect(x - 6, y0 + rh * 0.42 + up, 12.5, rh * 0.52 - up, 4); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 1.5, y0 + rh * 0.42 + up, 5, rh * 0.52 - up);
      g.fillStyle = sk;
      g.beginPath(); g.arc(x, y0 + rh * 0.30 + up, 4.4, 0, 7); g.fill();
      if (R() < 0.45) { g.fillStyle = ['#111', '#c22', '#fff', '#224', '#3a2a1e'][Math.floor(R() * 5)]; g.beginPath(); g.arc(x, y0 + rh * 0.26 + up, 4.5, Math.PI, 0); g.fill(); } // cap / hair
      if (R() < 0.03) { g.fillStyle = ['#c22', '#fff', '#fd0', '#27f'][Math.floor(R() * 4)]; g.fillRect(x + 4, y0 + 1, 13, 9); } // flag
    }
  }
  const t = finish(c);
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function fbmGrid(size, seed, oct = 6) {
  const R = rng(seed);
  const out = new Float32Array(size * size);
  let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const cells = 4 << o, grid = new Float32Array(cells * cells).map(() => R()), cs = size / cells;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const gx = x / cs, gy = y / cs, x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const G = (i, j) => grid[(j % cells) * cells + (i % cells)];
      const a = G(x0, y0), b = G(x0 + 1, y0), c2 = G(x0, y0 + 1), d = G(x0 + 1, y0 + 1);
      out[y * size + x] += amp * (a + (b - a) * sx + (c2 - a) * sy + (a - b - c2 + d) * sx * sy);
    }
    tot += amp; amp *= 0.52;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

// tileable cloud deck: cover 0..1 (0.35 = fair weather cumulus, 0.8 = overcast)
export function cloudTexture(cover = 0.4) {
  const S = 1024;
  const n = fbmGrid(S, 91, 7), n2 = fbmGrid(S, 17, 5);
  const [c, g] = cnv(S, S);
  const img = g.createImageData(S, S);
  // broken cumulus on clear days (crisper edges, bright tops), a soft continuous deck when overcast
  const lo = 0.64 - cover * 0.3, hi = lo + 0.1 + cover * 0.12;
  for (let i = 0; i < S * S; i++) {
    let a = (n[i] - lo) / (hi - lo);
    a = Math.max(0, Math.min(1, a)); a = a * a * (3 - 2 * a);
    const shade = 0.8 + 0.2 * Math.min(1, Math.max(0, (n2[i] - 0.3) * 2.2)) - a * 0.2 * cover;
    img.data[i * 4] = img.data[i * 4 + 1] = 255 * shade; img.data[i * 4 + 2] = 255 * Math.min(1, shade * 1.03);
    img.data[i * 4 + 3] = a * 235;
  }
  g.putImageData(img, 0, 0);
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
