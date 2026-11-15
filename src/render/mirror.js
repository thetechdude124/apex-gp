// Rear-view mirror: the scene is drawn a second time from a camera looking backwards behind the
// player's rear wing into a small off-screen target, and that image is put on screen (flipped
// left-to-right, like a real mirror) in a strip at the top of the view.
import * as THREE from 'three';

export class Mirror {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(768, 192, { type: THREE.HalfFloatType, samples: 2 });
    this.cam = new THREE.PerspectiveCamera(21, 4, 0.6, 700);
    this.hud = new THREE.Scene();
    this.hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const g = new THREE.PlaneGeometry(2, 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); // mirror image
    this.quad = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.rt.texture, depthTest: false, depthWrite: false }));
    this.quad.frustumCulled = false;
    this.hud.add(this.quad);
    this.tick = 0;
    this.every = 2; // redraw the mirror every n-th frame
    this.ready = false;
    this._v = new THREE.Vector3();
  }

  // pos: car position (three coords), psi: heading, grade: road gradient
  update(scene, pos, psi, grade = 0) {
    if (this.tick++ % this.every && this.ready) return;
    const r = this.renderer, c = this.cam;
    const fx = Math.cos(psi), fz = -Math.sin(psi);
    c.position.set(pos.x - fx * 2.95, pos.y + 0.98 - grade * 2.95, pos.z - fz * 2.95);
    c.lookAt(this._v.set(pos.x - fx * 40, pos.y + 0.55 - grade * 40, pos.z - fz * 40));
    const auto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false; // reuse this frame's shadow map
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, c);
    r.setRenderTarget(null);
    r.shadowMap.autoUpdate = auto;
    this.ready = true;
  }

  // rect in CSS pixels from the top-left of the canvas
  draw(x, y, w, h, viewW, viewH) {
    if (!this.ready) return;
    const r = this.renderer, ac = r.autoClear;
    r.setRenderTarget(null);
    r.autoClear = false;
    r.setViewport(x, viewH - y - h, w, h);
    r.setScissor(x, viewH - y - h, w, h);
    r.setScissorTest(true);
    r.render(this.hud, this.hudCam);
    r.setScissorTest(false);
    r.setViewport(0, 0, viewW, viewH);
    r.autoClear = ac;
  }
}
