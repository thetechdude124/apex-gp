// Synthesised audio: V6-hybrid style engine per car (player + nearest rivals), tyre squeal,
// wind, gear-shift cracks, impacts. No samples needed.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
  }
  init() {
    if (this.ctx) return;
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);
    // noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.player = this.makeEngine(1.0);
    this.rivals = [this.makeEngine(0.5), this.makeEngine(0.5), this.makeEngine(0.5)];
    // tyre squeal
    this.squeal = this.makeNoise('bandpass', 1500, 6);
    this.wind = this.makeNoise('lowpass', 700, 0.7);
    this.gravel = this.makeNoise('lowpass', 350, 0.8);
    // front tyres scrubbing (understeer): a higher, hissier note than the rear squeal
    this.scrub = this.makeNoise('bandpass', 2600, 2.2);
    // kerb rumble: low noise chopped at the rate the ridges pass under the tyre
    this.kerb = this.makeNoise('lowpass', 190, 2);
    this.kerbLfo = ctx.createOscillator(); this.kerbLfo.type = 'square'; this.kerbLfo.frequency.value = 30;
    this.kerbDepth = ctx.createGain(); this.kerbDepth.gain.value = 0;
    this.kerbLfo.connect(this.kerbDepth).connect(this.kerb.g.gain); this.kerbLfo.start();
    // turbo: an airy spool whoosh (filtered noise, nothing shrill) with a soft low whistle under it,
    // and the blow-off sigh when the throttle closes
    this.spool = 0; this.lastThr = 0; this.popT = 0; this.blipUntil = 0;
    this.turboAir = this.makeNoise('bandpass', 900, 1.1);
    this.whistle = ctx.createOscillator(); this.whistle.type = 'sine'; this.whistle.frequency.value = 900;
    this.whistleG = ctx.createGain(); this.whistleG.gain.value = 0;
    this.whistle.connect(this.whistleG).connect(this.master); this.whistle.start();
    // blown diffuser: with the throttle shut the exhaust keeps firing under the floor, a rough
    // stuttering drone that follows the revs
    {
      const g = (this.blownG = ctx.createGain()); g.gain.value = 0;
      const sh = ctx.createWaveShaper(); const cv = new Float32Array(512);
      for (let i = 0; i < 512; i++) { const x = (i / 511) * 2 - 1; cv[i] = Math.tanh(x * 5); }
      sh.curve = cv;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.7;
      this.blownF = bp;
      this.blownOsc = [[0.5, 'sawtooth', 0.6], [0.25, 'square', 0.5], [0.752, 'sawtooth', 0.3]].map(([m, type, lv]) => { const o = ctx.createOscillator(); o.type = type; const og = ctx.createGain(); og.gain.value = lv; o.connect(og).connect(sh); o.start(); return { o, m }; });
      const trem = ctx.createGain(); trem.gain.value = 0.55;
      this.blownLfo = ctx.createOscillator(); this.blownLfo.type = 'sawtooth'; this.blownLfo.frequency.value = 31;
      const depth = ctx.createGain(); depth.gain.value = 0.45;
      this.blownLfo.connect(depth).connect(trem.gain); this.blownLfo.start();
      sh.connect(bp).connect(trem).connect(g).connect(this.master);
    }
    // floor scraping the road when the car bottoms out
    this.scrape = this.makeNoise('bandpass', 1500, 1.3);
    this.rain = this.makeNoise('highpass', 2400, 0.3);
  }
  makeNoise(type, freq, Q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return { src, f, g };
  }
  makeEngine(level) {
    const ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.6); }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 60;
    const mix = ctx.createGain(); mix.gain.value = 0.3;
    const oscs = [];
    const defs = [['sawtooth', 1, 0.5], ['square', 0.5, 0.35], ['sawtooth', 2, 0.22], ['triangle', 3, 0.12], ['sawtooth', 1.005, 0.3]];
    for (const [type, mult, gain] of defs) {
      const o = ctx.createOscillator(); o.type = type;
      const g = ctx.createGain(); g.gain.value = gain;
      o.connect(g).connect(mix); o.start();
      oscs.push({ o, mult });
    }
    // turbo whistle
    const turbo = ctx.createOscillator(); turbo.type = 'sine';
    const tg = ctx.createGain(); tg.gain.value = 0;
    turbo.connect(tg).connect(out); turbo.start();
    mix.connect(shaper).connect(lp).connect(hp);
    if (pan) { hp.connect(pan).connect(out); } else hp.connect(out);
    out.connect(this.master);
    return { out, oscs, lp, pan, level, turbo, tg, mix };
  }
  setEngine(e, rpm, throttle, gain, panv = 0, doppler = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = (rpm / 60) * 3 * doppler; // 6 cylinders, 4-stroke -> 3 firings/rev
    for (const { o, mult } of e.oscs) o.frequency.setTargetAtTime(f * mult * 0.5, t, 0.015);
    if (e === this.player && t < this.blipUntil) throttle = Math.max(throttle, 0.95); // downshift blip
    e.lp.frequency.setTargetAtTime(500 + throttle * 3500 + rpm * 0.15, t, 0.03);
    e.out.gain.setTargetAtTime(gain * e.level * (0.35 + throttle * 0.65), t, 0.03);
    e.turbo.frequency.setTargetAtTime(700 + rpm * 0.08, t, 0.05);
    e.tg.gain.setTargetAtTime(gain * 0.006 * throttle, t, 0.05);
    if (e.pan) e.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, panv)), t, 0.05);
  }
  setSqueal(a) { if (this.ctx) this.squeal.g.gain.setTargetAtTime(a * 0.18, this.ctx.currentTime, 0.04); }
  setScrub(a) { if (this.ctx) this.scrub.g.gain.setTargetAtTime(a * 0.11, this.ctx.currentTime, 0.05); }
  setRain(a) { if (this.ctx) this.rain.g.gain.setTargetAtTime(a * 0.05, this.ctx.currentTime, 0.3); }
  // v: speed (m/s) while a wheel is on a kerb, 0 otherwise
  setKerb(v) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, a = v > 3 ? Math.min(1, 0.35 + v / 80) : 0;
    this.kerbLfo.frequency.setTargetAtTime(Math.max(8, Math.min(90, v / 0.9)), t, 0.03);
    this.kerb.g.gain.setTargetAtTime(a * 0.22, t, 0.02);
    this.kerbDepth.gain.setTargetAtTime(a * 0.22, t, 0.02);
  }
  setScrape(a) { if (this.ctx) this.scrape.g.gain.setTargetAtTime(a * 0.16, this.ctx.currentTime, 0.03); }
  // Turbo and exhaust character for the player's engine. Call every frame.
  setTurbo(rpm, throttle, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const revs = Math.min(1, Math.max(0, (rpm - 5000) / 6500));
    const want = throttle * revs;
    this.spool += (want - this.spool) * Math.min(1, dt * (want > this.spool ? 2.2 : 4.5));
    // spool: whoosh rises from ~800 Hz to ~2.2 kHz, whistle stays under 2 kHz
    this.turboAir.f.frequency.setTargetAtTime(800 + this.spool * 1400, t, 0.06);
    this.turboAir.g.gain.setTargetAtTime(this.spool * this.spool * 0.085, t, 0.06);
    this.whistle.frequency.setTargetAtTime(950 + this.spool * 900, t, 0.08);
    this.whistleG.gain.setTargetAtTime(this.spool * this.spool * 0.011, t, 0.08);
    // blown diffuser drone: loudest with the throttle shut at high revs
    const f = (rpm / 60) * 3;
    for (const { o, m } of this.blownOsc) o.frequency.setTargetAtTime(f * m, t, 0.02);
    this.blownF.frequency.setTargetAtTime(380 + revs * 520, t, 0.05);
    this.blownLfo.frequency.setTargetAtTime(22 + revs * 22, t, 0.05);
    const off = Math.max(0, 1 - throttle * 2.2);
    this.blownG.gain.setTargetAtTime(off * off * revs * 0.34 * (this.muted ? 0 : 1), t, 0.04);
    // blow-off: throttle snapped shut with the turbo spooled
    if (this.lastThr > 0.7 && throttle < 0.25 && this.spool > 0.45) this.blowOff(this.spool);
    // overrun burble while coasting at high revs: soft, low pops
    this.popT -= dt;
    if (throttle < 0.08 && rpm > 8800 && this.popT <= 0) { this.pop(0.05 + Math.random() * 0.05); this.popT = 0.09 + Math.random() * 0.22; }
    this.lastThr = throttle;
  }
  blowOff(level) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
    f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.22);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11 * level, t + 0.025); g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + 0.3);
  }
  // one overrun pop: a short, low, round thud from the exhaust (no ring, no metal)
  pop(level = 0.08, when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + when;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 650 + Math.random() * 350; f.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(level, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + 0.07);
  }
  // downshift, as heard on an onboard: the engine itself blips (a brief bright surge of the engine
  // note as the revs jump) with a soft low bark from the exhaust underneath
  downshift(level = 0.3) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.blipUntil = t + 0.12;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(level * 0.5, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + 0.12);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(72, t + 0.08);
    const og = ctx.createGain(); og.gain.setValueAtTime(level * 0.22, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.1);
  }
  // upshift: the ignition cut, a brief soft gap-and-tick rather than a crack
  upshift(level = 0.12) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1000; f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    src.connect(f).connect(g).connect(this.master); src.start(t, Math.random()); src.stop(t + 0.05);
  }
  setWind(v) { if (this.ctx) { this.wind.g.gain.setTargetAtTime(Math.min(0.25, (v / 90) ** 2 * 0.25), this.ctx.currentTime, 0.1); } }
  setGravel(a) { if (this.ctx) this.gravel.g.gain.setTargetAtTime(a * 0.5, this.ctx.currentTime, 0.05); }
  // short dry noise burst (impacts, wheel guns)
  crack(level = 0.4) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1;
    const g = ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(f).connect(g).connect(this.master); src.start(t); src.stop(t + 0.1);
  }
  thump(level) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(Math.min(1, level), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.35);
    this.crack(Math.min(0.8, level));
  }
  beep(freq = 880, dur = 0.12, level = 0.25) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  setMaster(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const e of [this.player, ...this.rivals]) e.out.gain.setTargetAtTime(0, t, 0.05);
    this.setSqueal(0); this.setWind(0); this.setGravel(0); this.setScrub(0); this.setKerb(0);
    this.turboAir.g.gain.setTargetAtTime(0, t, 0.05); this.whistleG.gain.setTargetAtTime(0, t, 0.05); this.blownG.gain.setTargetAtTime(0, t, 0.05);
    this.setScrape(0); this.setRain(0); this.spool = 0;
  }
}
