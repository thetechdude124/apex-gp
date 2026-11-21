// Trackside barriers: precast concrete walls with a real cross-section, sponsor boards hung on
// them in stretches, galvanised Armco on posts, debris fencing with an overhang, and scalloped
// tyre walls in front of the run-off areas. Everything is swept along T.wallL / T.wallR, which
// the sim owns: the barrier face is exactly where the cars hit it.
//
//   buildBarriers(root, T)   // adds ~8 meshes per side that has every barrier type
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import * as DT from './detail.js';
import { camberY, ribbon, ribbonWall, profileStrip } from './ribbons.js';

const WALL_H = 1.05;
// New-Jersey section: kerb toe, sloped foot, near-vertical face, flat top, then the back,
// carried below ground so there is never a gap under it.  [metres behind the face, height, v]
const CONCRETE = [[0, -0.05, 0], [0.1, 0.3, 0.3], [0.16, WALL_H, 0.96], [0.5, WALL_H, 1.0], [0.5, -3.4, 0.2]];
// what sits behind a guardrail: a low kerb and the back of the bank
const KERBING = [[0.3, -0.05, 0], [0.3, 0.16, 0.2], [0.5, 0.16, 0.26], [0.5, -3.4, 0.9]];
// W-beam guardrail section (one rail, 0.31 m tall): two rounded corrugations
const WBEAM = [[0.07, 0], [0.005, 0.06], [0.05, 0.155], [0.005, 0.25], [0.07, 0.31]];
const RAILS = [0.3, 0.68];
// debris fence: upright to 3.4 m, then cranked in over the track
const FENCE = [[0.3, WALL_H - 0.05, 0], [0.3, 3.4, 2.4], [-0.4, 4.25, 3.45]];

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// a square tube between two points (posts)
const _y = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _d = new THREE.Vector3();
function post(p0, p1, r) {
  _d.copy(p1).sub(p0);
  const len = _d.length();
  const g = new THREE.CylinderGeometry(r, r, len, 3, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(_q.setFromUnitVectors(_y, _d.normalize()));
  g.translate(p0.x, p0.y, p0.z);
  return g;
}

export function buildBarriers(root, T) {
  const N = T.N, w2 = T.width / 2;
  // (shadows come from one cheap proxy strip per side, not from the detailed sections)
  const add = (g, mat, o = {}) => { if (!g.index || g.index.count) root.add(Object.assign(new THREE.Mesh(g, mat), { castShadow: false, receiveShadow: true }, o)); };
  const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  const at = (i, d, y) => new THREE.Vector3(T.x[i] + T.nx[i] * d, T.h[i] + camberY(T, i, d) + y, -(T.y[i] + T.ny[i] * d));

  const hasArmco = (T.armcoL && T.armcoL.some(Boolean)) || (T.armcoR && T.armcoR.some(Boolean));
  // sponsor banners hang on the walls only in stretches (the pit straight, and every so often
  // around the lap), like a real venue
  const adZone = (i) => { const s = i * T.ds; return s < 420 || s > T.length - 330 || hash2(Math.floor(s / 84), 3.7) < 0.4; };

  const concreteMat = new THREE.MeshStandardMaterial({ map: DT.barrier(), roughness: 0.9, side: THREE.DoubleSide });
  const adMat = new THREE.MeshStandardMaterial({ map: DT.banners(), color: 0xd2d2d2, roughness: 0.5, side: THREE.DoubleSide });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x25272a, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide });
  const steelMat = hasArmco ? new THREE.MeshStandardMaterial({ color: 0xaab0b6, roughness: 0.42, metalness: 0.85, side: THREE.DoubleSide }) : null;
  const postMat = new THREE.MeshStandardMaterial({ color: 0x7d848b, metalness: 0.75, roughness: 0.45 });
  const contactMat = new THREE.MeshBasicMaterial({ map: DT.contactStrip(), color: 0x000000, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const fenceMat = new THREE.MeshStandardMaterial({ map: DT.fenceFine(), transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.3, depthWrite: false });
  const tyreMat = new THREE.MeshStandardMaterial({ map: DT.tyreWall(), roughness: 0.85, side: THREE.DoubleSide });
  const tyreTop = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9 });

  const postGeos = [], armcoPosts = [];
  for (const side of [1, -1]) {
    const wall = side === 1 ? T.wallL : T.wallR;
    const arm = side === 1 ? T.armcoL : T.armcoR;
    const isArmco = (i) => hasArmco && !!arm[i] && !(T.pit && T.pit.zone[i] && side === T.pit.side);
    const line = (i) => side * wall[i];

    // ---- concrete wall (everywhere there is no guardrail)
    add(profileStrip(T, { d: line, side, profile: CONCRETE, uLen: 8, mask: (i) => !isArmco(i) }), concreteMat);

    // ---- sponsor boards: a flat panel standing just proud of the concrete, with a capping rail
    const board = ribbonWall(T, (i) => side * (wall[i] - 0.03), 0.09, WALL_H + 0.03, side === 1 ? 60 : -60, 1, (i) => !isArmco(i) && adZone(i));
    add(board, adMat);
    add(profileStrip(T, { d: (i) => side * (wall[i] - 0.05), side, profile: [[0, WALL_H, 0], [0, WALL_H + 0.05, 0], [0.22, WALL_H + 0.05, 1], [0.22, WALL_H, 1]], uLen: 4, mask: (i) => !isArmco(i) && adZone(i) }), frameMat);

    // ---- Armco: two W-beams on steel posts, over a low kerb
    if (hasArmco && [...Array(N).keys()].some(isArmco)) {
      add(profileStrip(T, { d: line, side, profile: KERBING, uLen: 8, mask: isArmco }), concreteMat);
      const rails = RAILS.map((y0) => profileStrip(T, { d: line, side, profile: WBEAM.map(([x, y], k) => [x, y0 + y, k / 4]), uLen: 4, mask: isArmco }));
      add(mergeGeometries(rails), steelMat);
      for (let i = 0; i < N; i += 2) {
        if (!isArmco(i)) continue;
        const d = side * (wall[i] + 0.13);
        const g = new THREE.BoxGeometry(0.09, 1.02, 0.12);
        g.rotateY(Math.atan2(T.ty[i], T.tx[i]));
        const p = at(i, d, 0.5);
        g.translate(p.x, p.y, p.z);
        armcoPosts.push(g);
      }
    }

    // ---- shadow caster for everything on this side: a plain strip down the middle of the barrier
    root.add(Object.assign(new THREE.Mesh(ribbonWall(T, (i) => side * (wall[i] + 0.33), -0.1, WALL_H, 8), shadowMat), { castShadow: true, renderOrder: -1 }));

    // ---- soft contact shadow where the barrier meets the ground
    root.add(Object.assign(new THREE.Mesh(ribbon(T, { d0: (i) => side * (wall[i] - 0.02), d1: (i) => side * (wall[i] - 1.5), y: () => 0.012 }), contactMat), { renderOrder: 1 }));

    // ---- debris fence and its posts (every 8 m, following the crank at the top)
    root.add(Object.assign(new THREE.Mesh(profileStrip(T, { d: line, side, profile: FENCE, uLen: 1 }), fenceMat), { renderOrder: 3, userData: { noAO: true } }));
    for (let i = 0; i < N; i += 4) {
      const pts = FENCE.map(([x, y]) => at(i, side * (wall[i] + x + 0.04), y));
      postGeos.push(post(at(i, side * (wall[i] + 0.34), 0.9), pts[1], 0.075), post(pts[1], pts[2], 0.06));
    }

    // ---- tyre wall in front of the barrier around the run-off areas
    const ro = side === 1 ? T.runoffL : T.runoffR;
    const tyres = tyreWall(T, side, wall, (i) => !!ro[i] && wall[i] > w2 + 12);
    if (tyres) {
      add(tyres.face, tyreMat);
      add(tyres.top, tyreTop);
      root.add(Object.assign(new THREE.Mesh(ribbon(T, { d0: (i) => side * (wall[i] - 1.02), d1: (i) => side * (wall[i] - 2.4), y: () => 0.0, mask: (i) => !!ro[i] && wall[i] > w2 + 12 }), contactMat), { renderOrder: 1 }));
    }
  }
  if (postGeos.length) root.add(Object.assign(new THREE.Mesh(mergeGeometries(postGeos), postMat), { castShadow: false }));
  if (armcoPosts.length) root.add(Object.assign(new THREE.Mesh(mergeGeometries(armcoPosts), postMat), { receiveShadow: true }));
}

// Stacked tyres bolted together in front of the wall: each stack is a rounded bulge, so the
// wall has a scalloped silhouette and shades like a row of cylinders rather than a flat card.
const STACKS = 3, ARC = 4;          // stacks per 2 m sample, facets per stack
function tyreWall(T, side, wall, has) {
  const N = T.N;
  if (![...Array(N).keys()].some(has)) return null;
  const H = 1.0, R = 0.33, BACK = 0.75;
  const fpos = [], fuv = [], fidx = [], tpos = [], tidx = [];
  const P = (i, d) => [T.x[i] + T.nx[i] * d, T.y[i] + T.ny[i] * d, T.h[i] + camberY(T, i, d)];
  for (let r = 0; r < N; r++) {
    if (!has(r)) continue;
    const j = (r + 1) % N;
    const base = fpos.length / 3, tbase = tpos.length / 3;
    const cols = STACKS * ARC;
    for (let k = 0; k <= cols; k++) {
      const t = k / cols, st = (k % ARC) / ARC, edge = k % ARC === 0;
      // front of the stacks bulges toward the track by up to R
      const bulge = edge ? 0 : Math.sin(st * Math.PI) * R * 0.75 + R * 0.25;
      const dF0 = side * (wall[r] - BACK - 0.02 - bulge), dF1 = side * (wall[j] - BACK - 0.02 - bulge);
      const a = P(r, dF0), b = P(j, dF1);
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, h = a[2] + (b[2] - a[2]) * t;
      const u = (r * STACKS + k / ARC) / 8;
      fpos.push(x, h - 0.03, -y, x, h + H, -y);
      fuv.push(u, 0, u, 1);
      const a2 = P(r, side * wall[r]), b2 = P(j, side * wall[j]);
      tpos.push(x, h + H, -y, a2[0] + (b2[0] - a2[0]) * t, a2[2] + (b2[2] - a2[2]) * t + H, -(a2[1] + (b2[1] - a2[1]) * t));
      if (k < cols) {
        const o = base + k * 2;
        fidx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
        const q = tbase + k * 2;
        if (side > 0) tidx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); else tidx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
    }
  }
  const face = new THREE.BufferGeometry();
  face.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
  face.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
  face.setIndex(fidx);
  face.computeVertexNormals();
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(tpos, 3));
  top.setIndex(tidx);
  top.computeVertexNormals();
  // tops must face up whichever way the strip was wound
  const n = top.attributes.normal;
  if (n.count && n.getY(0) < 0) { const ix = top.index.array; for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; } top.computeVertexNormals(); }
  return { face, top };
}
