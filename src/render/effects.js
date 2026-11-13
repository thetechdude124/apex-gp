// GPU point-sprite particles: tyre smoke (soft, lit by sky colour) and floor sparks (additive).
import * as THREE from 'three';
import { smokeSprite } from './textures.js';

class Pool {
  constructor(n, material) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    this.points = new THREE.Points(g, material);
    this.points.frustumCulled = false;
  }
  emit(x, y, z, vx, vy, vz, life, size, grow = 0) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow;
  }
  update(dt, gravity, drag, fade) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= gravity * dt;
      const dr = Math.max(0, 1 - drag * dt);
      this.vel[k] *= dr; this.vel[k + 1] *= dr; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (gravity > 0 && this.pos[k + 1] < this.floor) { this.pos[k + 1] = this.floor; this.vel[k + 1] *= -0.3; }
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.max[i];
      this.alpha[i] = fade(t);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
  }
}

const vs = `
attribute float size; attribute float alpha; varying float vA;
void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * (600.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;

export class Effects {
  constructor(scene) {
    this.smokeMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: smokeSprite() }, color: { value: new THREE.Color(0xd8d8d8) } },
      vertexShader: vs,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, t.a * t.a * vA); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true, depthWrite: false,
    });
    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: smokeSprite() } },
      vertexShader: vs,
      fragmentShader: `uniform sampler2D map; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; gl_FragColor = vec4(vec3(4.0, 1.9, 0.6) * a, a); if (a < 0.01) discard; }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    // wet-weather spray: big soft grey-white puffs that hang behind a car and hide what is ahead
    this.sprayMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: smokeSprite() }, color: { value: new THREE.Color(0.62, 0.65, 0.69) } },
      vertexShader: vs,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color, t.a * vA); if (gl_FragColor.a < 0.006) discard; }`,
      transparent: true, depthWrite: false,
    });
    this.sprayPool = new Pool(3200, this.sprayMat);
    this.sprayPool.floor = -1e9;
    this.sprayPool.points.visible = false; // switched on by the first spray() call
    scene.add(this.sprayPool.points);
    this.smoke = new Pool(2500, this.smokeMat);
    this.sparks = new Pool(1500, this.sparkMat);
    this.smoke.floor = -1e9; this.sparks.floor = 0;
    scene.add(this.smoke.points, this.sparks.points);
  }
  setSmokeColor(c) { this.smokeMat.uniforms.color.value.set(c); }
  tyreSmoke(p, v, amount) {
    const n = Math.min(4, Math.ceil(amount * 3));
    for (let k = 0; k < n; k++) {
      this.smoke.emit(p.x + (Math.random() - 0.5) * 0.3, p.y + 0.45, p.z + (Math.random() - 0.5) * 0.3,
        v.x * 0.25 + (Math.random() - 0.5) * 1.5, 0.6 + Math.random(), v.z * 0.25 + (Math.random() - 0.5) * 1.5,
        1.2 + Math.random() * 1.2, 0.5 + Math.random() * 0.3, 1.3);
    }
  }
  dust(p, v, color) {
    this.smoke.emit(p.x, p.y + 0.6, p.z, v.x * 0.3 + (Math.random() - 0.5) * 2, 1 + Math.random(), v.z * 0.3 + (Math.random() - 0.5) * 2, 1.1, 0.5, 1.4);
  }
  // amount 0..1 (speed): a puff thrown up and back from a rear tyre on a wet road
  spray(p, v, amount) {
    this.sprayPool.points.visible = true;
    this.sprayPool.emit(p.x + (Math.random() - 0.5) * 0.5, p.y + Math.random() * 0.3, p.z + (Math.random() - 0.5) * 0.5,
      v.x * 0.42 + (Math.random() - 0.5) * 2.2, 1.2 + Math.random() * 2.2 * amount, v.z * 0.42 + (Math.random() - 0.5) * 2.2,
      0.9 + Math.random() * 0.9, 0.55 + Math.random() * 0.35, 2.2 + 2.4 * amount);
  }
  spark(p, v, floorY) {
    this.sparks.floor = floorY;
    for (let k = 0; k < 3; k++) {
      this.sparks.emit(p.x + (Math.random() - 0.5) * 0.6, p.y, p.z + (Math.random() - 0.5) * 0.6,
        v.x * (0.75 + Math.random() * 0.2) + (Math.random() - 0.5) * 4, Math.random() * 2.5, v.z * (0.75 + Math.random() * 0.2) + (Math.random() - 0.5) * 4,
        0.18 + Math.random() * 0.3, 0.09 + Math.random() * 0.07, 0);
    }
  }
  update(dt) {
    this.smoke.update(dt, -0.3, 0.9, (t) => Math.min(1, (1 - t) * 6) * t * 0.5);
    this.sparks.update(dt, 9.8, 0.6, (t) => t);
    if (this.sprayPool.points.visible) this.sprayPool.update(dt, 1.2, 1.5, (t) => Math.min(1, (1 - t) * 5) * t * 0.34);
  }
  clear() { this.smoke.life.fill(0); this.sparks.life.fill(0); this.sprayPool.life.fill(0); this.sprayPool.points.visible = false; }
}
