// Iconic trackside architecture for Circuit de Spa-Francorchamps:
//   - Raidillon / Eau Rouge Gold 3 hillside grandstand perched above the climb
//   - Historic stepped Endurance pit lane & opposite downhill grandstand (La Source -> Eau Rouge)
//   - Eau Rouge stream culvert & bridge parapets at the compression trough
//   - Pouhon amphitheatre viewing terraces & Les Combes spectator bank
//   - Kemmel Straight & Blanchimont overhead steel-truss circuit bridges
// Sim (x, y, h) maps to Three.js (x, h, -y).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

const V = (x, y, h) => new THREE.Vector3(x, h, -y);

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function bridgeBannerTexture(title, sub) {
  return canvasTex(1024, 160, (g, W, H) => {
    g.fillStyle = '#14171d'; g.fillRect(0, 0, W, H);
    // Belgian tricolor accent bar along top & bottom
    g.fillStyle = '#111111'; g.fillRect(0, 0, W / 3, 12);
    g.fillStyle = '#f0c419'; g.fillRect(W / 3, 0, W / 3, 12);
    g.fillStyle = '#c8102e'; g.fillRect((2 * W) / 3, 0, W / 3, 12);
    g.fillStyle = '#c8102e'; g.fillRect(0, H - 10, W, 10);
    g.fillStyle = '#f4f4f2';
    g.font = 'italic 900 58px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(title, W / 2, H * 0.48, W - 80);
    g.fillStyle = '#f0c419';
    g.font = '700 22px "Helvetica Neue", Arial, sans-serif';
    g.fillText(sub, W / 2, H * 0.78, W - 80);
  });
}

function enduranceGarageTex() {
  return canvasTex(1024, 256, (g, W, H) => {
    g.fillStyle = '#d4d6d8'; g.fillRect(0, 0, W, H);
    // classic red & white fascia stripe across the old endurance garages
    g.fillStyle = '#b91824'; g.fillRect(0, 14, W, 34);
    g.fillStyle = '#f0c419'; g.fillRect(0, 48, W, 6);
    g.fillStyle = '#ffffff';
    g.font = 'italic 900 24px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SPA-FRANCORCHAMPS · ENDURANCE PITS', W / 2, 31);
    const bays = 6, bw = W / bays;
    for (let k = 0; k < bays; k++) {
      const x = k * bw;
      const grd = g.createLinearGradient(0, 68, 0, H);
      grd.addColorStop(0, '#0d0f13'); grd.addColorStop(0.75, '#1f232b'); grd.addColorStop(1, '#343840');
      g.fillStyle = grd; g.fillRect(x + 12, 68, bw - 24, H - 68);
      g.fillStyle = 'rgba(255,250,235,0.45)'; g.fillRect(x + 16, 72, bw - 32, 3);
      g.fillStyle = '#a2a7ae'; g.fillRect(x, 54, 12, H - 54); g.fillRect(x + bw - 12, 54, 12, H - 54);
    }
  });
}

export function buildSpaLandmarks(root, T, { crowdMat, standMat, roofMat }) {
  const clearZones = []; // { x, y, r } in sim coords so trees stay clear of landmarks
  const idxAt = (m) => Math.round((((m % T.length) + T.length) % T.length) / T.ds) % T.N;
  const concMat = new THREE.MeshStandardMaterial({ map: TX.concrete(), color: 0xbec2c6, roughness: 0.9 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x262a31, metalness: 0.65, roughness: 0.4 });
  const redAccent = new THREE.MeshStandardMaterial({ color: 0xc2151f, roughness: 0.55 });
  const yelAccent = new THREE.MeshStandardMaterial({ color: 0xe8be17, roughness: 0.55 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x1a2836, roughness: 0.08, metalness: 0.85 });

  // Helper: place a raked covered grandstand anchored deep into sloped terrain
  const addHillStand = ({ m, side, len, rows = 18, extraD = 8, yLift = 0, covered = true, tiltWithGrade = true }) => {
    const i = idxAt(m);
    const wall = side === 1 ? T.wallL[i] : T.wallR[i];
    const base = wall + extraD;
    const wx = T.x[i] + T.nx[i] * side * base, wy = T.y[i] + T.ny[i] * side * base;
    const g = new THREE.Group();
    g.position.copy(V(wx, wy, T.h[i] + yLift));
    g.rotation.order = 'YZX';
    g.rotation.y = Math.atan2(T.ty[i], T.tx[i]);
    if (tiltWithGrade) g.rotation.z = Math.atan(T.grade[i]) * 0.85;

    const out = side === 1 ? -1 : 1;
    const rowD = 0.88, rowH = 0.54;
    const depth = rows * rowD, y0 = 2.0, y1 = y0 + rows * rowH;
    const L = len / 2;

    // deep retaining plinth so sloped hillsides never expose an undercut gap
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(len, 14, depth + 1.5), concMat);
    plinth.position.set(0, -6.0, out * (depth / 2));
    plinth.receiveShadow = true;
    g.add(plinth);

    // raked seating deck with crowd
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute([-L, y0, 0, L, y0, 0, L, y1, out * depth, -L, y1, out * depth], 3));
    const ur = len / 16.5;
    dg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, ur, 0, ur, 1, 0, 1], 2));
    dg.setIndex(out > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    dg.computeVertexNormals();
    const deck = new THREE.Mesh(dg, crowdMat);
    deck.receiveShadow = true;
    g.add(deck);

    // Belgian fascia ribbon along front parapet
    const front = new THREE.Mesh(new THREE.BoxGeometry(len, y0, 0.35), standMat);
    front.position.set(0, y0 / 2, out * 0.15);
    g.add(front);
    const bandR = new THREE.Mesh(new THREE.BoxGeometry(len, 0.42, 0.42), redAccent);
    bandR.position.set(0, y0 - 0.25, out * 0.14);
    g.add(bandR);
    const bandY = new THREE.Mesh(new THREE.BoxGeometry(len, 0.22, 0.42), yelAccent);
    bandY.position.set(0, y0 - 0.57, out * 0.14);
    g.add(bandY);

    // side walls & back wall
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, y1 + 1.5, 0.45), standMat);
    back.position.set(0, (y1 + 1.5) / 2, out * (depth + 0.22));
    back.castShadow = true;
    g.add(back);
    for (const sx of [-1, 1]) {
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute([sx * L, 0, 0, sx * L, y0, 0, sx * L, y1, out * depth, sx * L, 0, out * depth], 3));
      sg.setIndex([0, 1, 2, 0, 2, 3]); sg.computeVertexNormals();
      g.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0x9aa1aa, roughness: 0.8, side: THREE.DoubleSide })));
    }

    if (covered) {
      const roofH = y1 + 3.6;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 4, 0.35, depth + 4.5), roofMat);
      roof.position.set(0, roofH, out * (depth / 2 - 0.6));
      roof.rotation.x = out * 0.08;
      roof.castShadow = true;
      g.add(roof);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(len + 4.2, 0.45, 0.3), redAccent);
      trim.position.set(0, roofH - 0.18, -out * 1.6);
      g.add(trim);
      for (let x = -L + 6; x <= L - 6; x += 18) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.45, roofH + 0.5, 0.45), darkSteel);
        col.position.set(x, roofH / 2, out * depth);
        g.add(col);
        const truss = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.55, depth + 3.5), darkSteel);
        truss.position.set(x, roofH - 0.35, out * (depth / 2 - 0.4));
        truss.rotation.x = out * 0.08;
        g.add(truss);
      }
    }
    root.add(g);
    // clear trees across the full length of the stand
    for (let s = -L - 10; s <= L + 10; s += 20) {
      clearZones.push({
        x: wx + T.tx[i] * s + T.nx[i] * side * (depth * 0.55),
        y: wy + T.ty[i] * s + T.ny[i] * side * (depth * 0.55),
        r: Math.max(depth * 0.8, 18),
      });
    }
  };

  // 1. Iconic Raidillon / Eau Rouge Hillside Grandstand (Gold 3) overlooking the blind crest
  addHillStand({ m: 1090, side: 1, len: 138, rows: 20, extraD: 7, yLift: 3.5, covered: true, tiltWithGrade: true });

  // 2. Historic Endurance Pit Complex (stepped downhill from La Source toward Eau Rouge)
  {
    const endMat = new THREE.MeshStandardMaterial({ map: enduranceGarageTex(), roughness: 0.62 });
    const plain = new THREE.MeshStandardMaterial({ color: 0xd0d3d8, roughness: 0.68 });
    const steps = 7, segLen = 36, depth = 13;
    const startM = 372, stepM = 37;
    for (let k = 0; k < steps; k++) {
      const m = startM + k * stepM;
      const i = idxAt(m);
      const off = -(T.wallR[i] + 5.5 + depth / 2);
      const wx = T.x[i] + T.nx[i] * off, wy = T.y[i] + T.ny[i] * off;
      const g = new THREE.Group();
      g.position.copy(V(wx, wy, T.h[i]));
      g.rotation.y = Math.atan2(T.ty[i], T.tx[i]);
      // deep concrete foundation into the hill
      const base = new THREE.Mesh(new THREE.BoxGeometry(segLen, 8, depth), concMat);
      base.position.y = -4.0; g.add(base);
      // garage block facing the track (local -z is sim +left = toward track from right side!)
      const mats = [plain, plain, plain, plain, plain, endMat];
      const body = new THREE.Mesh(new THREE.BoxGeometry(segLen - 0.6, 5.2, depth), mats);
      body.position.y = 2.6; body.castShadow = true; body.receiveShadow = true; g.add(body);
      // upper VIP hospitality glass & terraced roof
      const upper = new THREE.Mesh(new THREE.BoxGeometry(segLen - 0.6, 3.3, depth - 2.4), glassMat);
      upper.position.set(0, 6.85, 1.1); upper.castShadow = true; g.add(upper);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.3, depth + 2.2), roofMat);
      canopy.position.set(0, 8.65, -0.4); canopy.castShadow = true; g.add(canopy);
      const fascia = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.42, 0.25), redAccent);
      fascia.position.set(0, 5.3, -depth / 2 - 0.1); g.add(fascia);
      root.add(g);
      clearZones.push({ x: wx, y: wy, r: 24 });
    }
    // Opposite hillside grandstand (Gold 2) looking down over the Endurance straight toward Eau Rouge
    addHillStand({ m: 515, side: 1, len: 148, rows: 14, extraD: 6.5, yLift: 1.8, covered: true, tiltWithGrade: true });
  }

  // 3. Eau Rouge Stream Culvert & Bridge Parapets (at the compression trough ~898 m)
  {
    const i = idxAt(898);
    const g = new THREE.Group();
    g.position.copy(V(T.x[i], T.y[i], T.h[i]));
    g.rotation.y = Math.atan2(T.ty[i], T.tx[i]);
    const stoneMat = new THREE.MeshStandardMaterial({ map: TX.concrete(), color: 0x7b7e82, roughness: 0.95 });
    const streamMat = new THREE.MeshStandardMaterial({ color: 0x3b1f18, roughness: 0.2, metalness: 0.1 }); // iron-rich reddish Eau Rouge stream!
    for (const side of [1, -1]) {
      const wall = side === 1 ? T.wallL[i] : T.wallR[i];
      const zSign = side === 1 ? -1 : 1; // sim +left = three -z
      const zOff = zSign * (wall + 1.4);
      const head = new THREE.Mesh(new THREE.BoxGeometry(16, 4.8, 1.4), stoneMat);
      head.position.set(0, -1.2, zOff); head.castShadow = true; head.receiveShadow = true; g.add(head);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(16.6, 0.35, 1.7), redAccent);
      cap.position.set(0, 1.28, zOff); g.add(cap);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(16, 0.18, 0.18), darkSteel);
      rail.position.set(0, 1.9, zOff); g.add(rail);
    }
    // iron-tinted water strip visible down in the culvert ditch on either side
    const water = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 95), streamMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -3.1, 0);
    g.add(water);
    root.add(g);
  }

  // 4. Pouhon Hillside Amphitheatre & Les Combes Viewing Stand
  addHillStand({ m: 3745, side: -1, len: 115, rows: 12, extraD: 7.5, yLift: 2.2, covered: false, tiltWithGrade: false });
  addHillStand({ m: 3925, side: -1, len: 105, rows: 12, extraD: 7.5, yLift: 2.2, covered: false, tiltWithGrade: false });
  addHillStand({ m: 2290, side: 1, len: 96, rows: 12, extraD: 7.5, yLift: 1.5, covered: true, tiltWithGrade: false });

  // 5. Iconic Overhead Steel-Truss Track Bridges (Kemmel Straight & Blanchimont approach)
  const addBridge = (m, title, sub) => {
    const i = idxAt(m);
    const span = T.wallL[i] + T.wallR[i] + 5;
    const centerD = (T.wallL[i] - T.wallR[i]) / 2;
    const g = new THREE.Group();
    const wx = T.x[i] + T.nx[i] * centerD, wy = T.y[i] + T.ny[i] * centerD;
    g.position.copy(V(wx, wy, T.h[i]));
    g.rotation.y = Math.atan2(T.ty[i], T.tx[i]);

    const bTex = bridgeBannerTexture(title, sub);
    const faceMat = new THREE.MeshStandardMaterial({ map: bTex, roughness: 0.48 });
    // main bridge deck spanning local Z (across track width)
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.7, span), [faceMat, faceMat, darkSteel, darkSteel, darkSteel, darkSteel]);
    deck.position.y = 8.4; deck.castShadow = true; deck.receiveShadow = true;
    g.add(deck);

    // open steel roof truss chords & diagonals above deck
    const trussParts = [];
    for (const sx of [-1.45, 1.45]) {
      const topBar = new THREE.BoxGeometry(0.22, 0.22, span);
      topBar.translate(sx, 10.2, 0); trussParts.push(topBar);
      for (let z = -span / 2 + 2; z <= span / 2 - 2; z += 4) {
        const post = new THREE.BoxGeometry(0.16, 1.8, 0.16);
        post.translate(sx, 9.3, z); trussParts.push(post);
      }
    }
    g.add(new THREE.Mesh(mergeGeometries(trussParts), darkSteel));

    // twin concrete/steel stairwell support towers anchored deep into terrain
    for (const sz of [-1, 1]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(3.6, 16, 3.2), concMat);
      tower.position.set(0, 2.8, sz * (span / 2 + 1.2));
      tower.castShadow = true; tower.receiveShadow = true;
      g.add(tower);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.5, 3.3), redAccent);
      stripe.position.set(0, 9.8, sz * (span / 2 + 1.2));
      g.add(stripe);
      clearZones.push({
        x: wx - T.nx[i] * sz * (span / 2 + 1.2),
        y: wy - T.ny[i] * sz * (span / 2 + 1.2),
        r: 12,
      });
    }
    root.add(g);
  };

  addBridge(1345, 'SPA-FRANCORCHAMPS', 'KEMMEL STRAIGHT · ARDENNES');
  addBridge(5610, 'APEX GRAND PRIX', 'BLANCHIMONT · BELGIUM');

  return { clearZones };
}
