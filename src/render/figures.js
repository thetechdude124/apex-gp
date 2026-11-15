// Simple articulated people (legs, torso, arms, helmet) for the pit crews and the podium.
// Each pose is three merged geometries, built facing local +z: { suit, lid, dark }.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const M = new THREE.Matrix4(), E = new THREE.Euler(), Q = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
const part = (geo, x, y, z, rx = 0, rz = 0) => { const g = geo.clone(); g.applyMatrix4(M.compose(new THREE.Vector3(x, y, z), Q.setFromEuler(E.set(rx, 0, rz)), ONE)); return g; };
const limb = (r, len) => new THREE.CapsuleGeometry(r, len, 2, 6);
const cache = {};

// pose: 'stand' | 'kneel' (working on a wheel) | 'cheer' (both arms up) | 'wave' (one arm up)
export function makeFigure(pose = 'stand') {
  if (cache[pose]) return cache[pose];
  const torsoG = new THREE.CapsuleGeometry(0.17, 0.3, 3, 8); torsoG.scale(1.15, 1, 0.78);
  const helmG = new THREE.SphereGeometry(0.135, 12, 9);
  const visorG = new THREE.BoxGeometry(0.2, 0.07, 0.1);
  const hand = new THREE.SphereGeometry(0.06, 6, 5);
  const suit = [], lid = [], dark = [];
  if (pose === 'kneel') {
    // down on one knee, leaning in with both arms out to the wheel
    suit.push(part(limb(0.08, 0.34), -0.11, 0.3, 0.12, -1.35), part(limb(0.07, 0.3), -0.11, 0.22, 0.34));
    suit.push(part(limb(0.08, 0.34), 0.11, 0.22, -0.05, 0.25), part(limb(0.07, 0.3), 0.11, 0.08, -0.3, 1.45));
    suit.push(part(torsoG, 0, 0.72, 0.1, 0.45));
    for (const sx of [-1, 1]) { suit.push(part(limb(0.055, 0.44), sx * 0.2, 0.74, 0.42, -1.25, 0)); dark.push(part(hand, sx * 0.2, 0.66, 0.68)); }
    lid.push(part(helmG, 0, 1.08, 0.3)); dark.push(part(visorG, 0, 1.07, 0.39));
  } else {
    for (const sx of [-0.1, 0.1]) { suit.push(part(limb(0.075, 0.62), sx, 0.47, 0)); dark.push(part(new THREE.BoxGeometry(0.11, 0.09, 0.26), sx, 0.045, 0.05)); }
    suit.push(part(torsoG, 0, 1.15, 0));
    for (const sx of [-1, 1]) {
      const up = pose === 'cheer' || (pose === 'wave' && sx === 1);
      if (up) { suit.push(part(limb(0.055, 0.46), sx * 0.31, 1.58, 0.02, 0, -sx * 0.32)); dark.push(part(hand, sx * 0.4, 1.9, 0.02)); }
      else { suit.push(part(limb(0.055, 0.42), sx * 0.25, 1.12, 0.12, -0.55, sx * 0.12)); dark.push(part(hand, sx * 0.27, 0.86, 0.27)); }
    }
    lid.push(part(helmG, 0, 1.6, 0.02)); dark.push(part(visorG, 0, 1.61, 0.1));
  }
  return (cache[pose] = { suit: mergeGeometries(suit), lid: mergeGeometries(lid), dark: mergeGeometries(dark) });
}

// place a posed figure: returns the three geometries moved to (x, y, z) and turned by yaw
export function placeFigure(pose, x, y, z, yaw) {
  const f = makeFigure(pose);
  M.compose(new THREE.Vector3(x, y, z), Q.setFromEuler(E.set(0, yaw, 0)), ONE);
  return { suit: f.suit.clone().applyMatrix4(M), lid: f.lid.clone().applyMatrix4(M), dark: f.dark.clone().applyMatrix4(M) };
}
