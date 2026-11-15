// Podium ceremony in the pit lane after the race: three steps in front of a backdrop, the top
// three drivers on them, their cars parked nose-in below (parc ferme) and confetti.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { placeFigure } from './figures.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// top3: [{ team: {name, color, color2, helmet}, name }] in finishing order
export function buildPodium(root, T, top3, title) {
  const P = T.pit, side = P.side;
  const r0 = (P.boxes[4] + P.boxes[5]) / 2;
  const o = P.pos(r0, side * (P.boxD + 2.3), {});
  const th = Math.atan2(T.ty[o.i], T.tx[o.i]);
  const grp = new THREE.Group();
  grp.position.set(o.x, o.h, -o.y);
  grp.rotation.y = th;
  root.add(grp);
  const zt = side === 1 ? 1 : -1;      // local z that points at the track
  const yaw = zt === 1 ? 0 : Math.PI;  // figures and plates face the track

  // steps: P2 | P1 | P3
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f1ef, emissive: 0xf1f1ef, emissiveIntensity: 0.22, roughness: 0.55 });
  const steps = [[0, 0.95], [-2.3, 0.65], [2.3, 0.45]]; // x, height for P1, P2, P3
  steps.forEach(([x, h], k) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.3, h, 1.7), white);
    b.position.set(x * (zt === 1 ? 1 : -1), h / 2, 0); b.castShadow = true; b.receiveShadow = true; grp.add(b);
    const num = canvasTex(128, 128, (g) => { g.fillStyle = '#16181d'; g.fillRect(0, 0, 128, 128); g.fillStyle = ['#e8c14a', '#c9ced6', '#c98a4b'][k]; g.font = '900 104px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(k + 1), 64, 70); });
    const s = Math.min(h - 0.08, 0.62);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshStandardMaterial({ map: num, roughness: 0.5 }));
    plate.position.set(b.position.x, h / 2, zt * 0.86); plate.rotation.y = yaw; grp.add(plate);
  });
  // backdrop
  const back = canvasTex(1024, 384, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0d1220'); gr.addColorStop(1, '#1a2238');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 0; y < 4; y++) for (let x = 0; x < 9; x++) { g.font = 'italic 900 20px Arial'; g.fillText('APEX GP', 24 + x * 116 + (y % 2) * 58, 60 + y * 92); }
    g.font = 'italic 900 64px "Helvetica Neue", Arial'; g.textAlign = 'left';
    const wa = g.measureText('APEX ').width, wb = g.measureText('GRAND PRIX').width, x0 = (w - wa - wb) / 2;
    g.fillStyle = '#ffffff'; g.fillText('APEX', x0, 92);
    g.fillStyle = '#ff2a1f'; g.fillText('GRAND PRIX', x0 + wa, 92);
    g.textAlign = 'center';
    g.fillStyle = '#c9ced6'; g.font = '700 30px "Helvetica Neue", Arial'; g.fillText(title.toUpperCase(), w / 2, 138);
    g.fillStyle = '#e10600'; g.fillRect(0, h - 14, w, 14);
  });
  const bd = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 3.6), new THREE.MeshStandardMaterial({ map: back, emissive: 0xffffff, emissiveMap: back, emissiveIntensity: 0.55, roughness: 0.7, side: THREE.DoubleSide })); // lit like a media wall
  bd.position.set(0, 2.0, -zt * 1.15); bd.rotation.y = yaw; bd.castShadow = true; grp.add(bd);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9.9, 0.2, 0.25), new THREE.MeshStandardMaterial({ color: 0x23262b, metalness: 0.6, roughness: 0.4 }));
  frame.position.set(0, 3.9, -zt * 1.15); grp.add(frame);

  // drivers
  const dark = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 });
  top3.forEach((d, k) => {
    const [x, h] = steps[k];
    const f = placeFigure(k === 0 ? 'cheer' : 'wave', x * (zt === 1 ? 1 : -1), h, zt * 0.1, yaw);
    const suit = new THREE.Mesh(f.suit, new THREE.MeshStandardMaterial({ color: new THREE.Color(d.team.color).multiplyScalar(0.85), emissive: new THREE.Color(d.team.color), emissiveIntensity: 0.2, roughness: 0.8 }));
    suit.castShadow = true;
    grp.add(suit, new THREE.Mesh(f.lid, new THREE.MeshStandardMaterial({ color: d.team.helmet || d.team.color2, emissive: d.team.helmet || d.team.color2, emissiveIntensity: 0.15, roughness: 0.3 })), new THREE.Mesh(f.dark, dark));
  });
  // winner's trophy on a plinth at the front
  {
    const gold = new THREE.MeshStandardMaterial({ color: 0xe2b23c, metalness: 1, roughness: 0.22 });
    const pts = [[0.11, 0], [0.12, 0.03], [0.03, 0.06], [0.03, 0.2], [0.07, 0.25], [0.15, 0.42], [0.16, 0.5], [0.13, 0.5]].map(([x, y]) => new THREE.Vector2(x, y));
    const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), gold);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), dark);
    plinth.position.set(0, 0.45, zt * 1.5); cup.position.set(0, 0.9, zt * 1.5); cup.castShadow = true;
    grp.add(plinth, cup);
  }

  // confetti
  const N = 260;
  const conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.05), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), N);
  const cols = ['#e8c14a', '#ffffff', top3[0] ? top3[0].team.color : '#e10600', '#e10600'].map((c) => new THREE.Color(c));
  const bits = [];
  for (let i = 0; i < N; i++) {
    bits.push({ x: (Math.random() - 0.5) * 11, y: Math.random() * 6.5, z: (Math.random() - 0.3) * 7 * zt, vy: 0.7 + Math.random() * 0.9, ph: Math.random() * 6.3, sp: 2 + Math.random() * 5 });
    conf.setColorAt(i, cols[i % cols.length]);
  }
  conf.frustumCulled = false;
  grp.add(conf);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let time = 0;

  // world-space helpers for the caller
  const toWorld = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(grp.matrixWorld);
  grp.updateMatrixWorld(true);
  // parc ferme: cars nose-in to the podium, winner in the middle
  const cars = [0, -3.5, 3.5].map((x) => ({ pos: toWorld(x * (zt === 1 ? 1 : -1), 0, zt * 5.6), rotY: th + (zt === 1 ? Math.PI / 2 : -Math.PI / 2) }));

  return {
    group: grp, cars,
    update(dt) {
      time += dt;
      for (let i = 0; i < N; i++) {
        const b = bits[i];
        b.y -= b.vy * dt;
        if (b.y < 0) { b.y = 6.5; b.x = (Math.random() - 0.5) * 11; }
        p.set(b.x + Math.sin(time * 1.3 + b.ph) * 0.25, b.y, b.z);
        m4.compose(p, q.setFromEuler(e.set(time * b.sp + b.ph, time * b.sp * 0.7, b.ph)), one);
        conf.setMatrixAt(i, m4);
      }
      conf.instanceMatrix.needsUpdate = true;
    },
    // camera: two wide shots from the pit-wall side (the figures are simple, so no close-ups)
    camera(cam, t) {
      const shot = Math.floor(t / 7) % 2, u = (t % 7) / 7;
      let from, at;
      if (shot === 0) { from = toWorld(-3.2 + u * 6.4, 2.5 + u * 0.5, zt * 10.4); at = toWorld(0, 1.5, 0); cam.fov = 46; }
      else { from = toWorld(8.2 - u * 2.5, 2.1, zt * 9.4); at = toWorld(-0.6, 1.45, 0); cam.fov = 36; } // long lens from down the lane
      cam.position.copy(from); cam.lookAt(at); cam.near = 0.3; cam.updateProjectionMatrix();
    },
  };
}
