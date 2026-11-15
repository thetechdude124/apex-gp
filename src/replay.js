// Session recording for the replay viewer: 30 samples a second of every car's pose and controls.
const F = 13; // values per car per sample: X Y h psi v delta idx d grade rpm throttle brake flags
const CHUNK = 30 * 60; // samples per block (one minute)
const CODES = ['S', 'M', 'H', 'W'];

export class Recorder {
  constructor(n) { this.n = n; this.blocks = []; this.count = 0; this.times = []; this.acc = 0; this.maxSamples = 30 * 60 * 25; }

  // call once per frame with the frame time; samples at 30 Hz
  sample(race, dt) {
    this.acc += dt;
    if (this.acc < 1 / 30 || this.count >= this.maxSamples) return;
    this.acc = 0;
    const bi = Math.floor(this.count / CHUNK), off = (this.count % CHUNK) * this.n * F;
    if (!this.blocks[bi]) this.blocks[bi] = new Float32Array(CHUNK * this.n * F);
    const a = this.blocks[bi];
    race.entries.forEach((e, k) => {
      const b = e.body, o = off + k * F;
      a[o] = e.rX ?? b.X; a[o + 1] = e.rY ?? b.Y; a[o + 2] = e.rH ?? e.h ?? 0; a[o + 3] = e.rPsi ?? b.psi;
      a[o + 4] = b.vx; a[o + 5] = b.delta; a[o + 6] = e.idx; a[o + 7] = e.d; a[o + 8] = e.grade || 0;
      a[o + 9] = b.rpm; a[o + 10] = e.input?.throttle || 0; a[o + 11] = e.input?.brake || 0;
      a[o + 12] = (b.drsOpen ? 1 : 0) + 2 * Math.max(0, CODES.indexOf(b.compound)) + (e.pit ? 16 : 0);
    });
    this.times[this.count++] = race.time;
  }

  // drop everything after race time t (used when the player rewinds)
  truncate(t) { while (this.count > 0 && this.times[this.count - 1] > t) this.count--; this.times.length = this.count; }

  get duration() { return this.count ? this.times[this.count - 1] - this.times[0] : 0; }
  get start() { return this.count ? this.times[0] : 0; }

  // write the state at race time t into the race's entries (pose, speed, controls), interpolated
  apply(race, t, dt) {
    if (this.count < 2) return;
    let lo = 0, hi = this.count - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.times[m] <= t) lo = m; else hi = m; }
    const f = Math.max(0, Math.min(1, (t - this.times[lo]) / Math.max(1e-6, this.times[hi] - this.times[lo])));
    const A = this.blocks[Math.floor(lo / CHUNK)], ao = (lo % CHUNK) * this.n * F;
    const B = this.blocks[Math.floor(hi / CHUNK)], bo = (hi % CHUNK) * this.n * F;
    race.entries.forEach((e, k) => {
      const b = e.body, p = ao + k * F, q = bo + k * F;
      const L = (i) => A[p + i] + (B[q + i] - A[p + i]) * f;
      let dpsi = B[q + 3] - A[p + 3]; dpsi = Math.atan2(Math.sin(dpsi), Math.cos(dpsi));
      b.X = e.rX = L(0); b.Y = e.rY = L(1); e.h = e.rH = L(2); b.psi = e.rPsi = A[p + 3] + dpsi * f;
      b.vx = L(4); b.vy = 0; b.r = 0; b.delta = L(5); e.idx = Math.round(A[p + 6]); e.d = L(7); e.grade = L(8);
      b.rpm = L(9); b.axS = 0; b.ayS = 0; b.harvest = 0; b.lockF = false; b.spinR = false; b.slideF = 0; b.slideR = 0;
      e.input = { throttle: L(10), brake: L(11), steer: 0 };
      const fl = Math.round(A[p + 12]);
      b.drsOpen = !!(fl & 1); e.replayCompound = CODES[(fl >> 1) & 3]; e.replayPit = !!(fl & 16);
      b.wheelAng += (b.vx / b.p.wheelR) * dt; b.frontWheelAng = (b.frontWheelAng || 0) + (b.vx / b.p.wheelR) * dt;
      e.ghost = 0; e.pit = null; e.s = e.idx * race.T.ds;
    });
  }
}
