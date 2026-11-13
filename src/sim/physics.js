// Open-wheel car dynamics: dynamic bicycle model with Pacejka-style lateral tyre
// forces, friction-circle combined slip, aero downforce/drag with load transfer,
// 8-speed gearbox, ERS deploy/harvest, DRS, slipstream and dirty air.
// Body frame: x forward, y left. World: 2D sim plane (X, Y), heading psi.

export const G = 9.81;
export const RHO = 1.225;

export const CAR = {
  mass: 798,
  Iz: 1100,
  L: 3.6,
  a: 1.98, // CG -> front axle
  b: 1.62, // CG -> rear axle
  h: 0.30,
  ClA: 4.3,
  CdA: 1.42,
  aeroBal: 0.43,
  drsCd: 0.24,
  drsCl: 0.75,
  mu: 1.78,
  B: 19,
  C: 1.22, // broad grip plateau after the peak, like a real slick
  rearGrip: 1.07,
  P: 745e3,
  ersP: 120e3,
  ersCap: 4.0e6,
  gears: [22, 34, 44.5, 54, 63.5, 73, 83, 94.5],
  rpmMax: 12500,
  rpmIdle: 4000,
  brakeForce: 56000,
  brakeBias: 0.60,
  steerMax: 0.34,
  roll: 0.014,
  wheelR: 0.36,
};

// The player's car is set up a little more "on the nose" than the field's: more front aero and
// less rear grip margin, so it turns in harder and the rear can be made to move. (The AI keep the
// calmer CAR balance, which is what keeps a 20-car pack stable.) absTurn: how much braking the
// ABS keeps free for steering: the share of front grip reserved for cornering at full key while braking.
export const PLAYER_SETUP = { aeroBal: 0.44, rearGrip: 1.04, absTurn: 0.88 };
// Differential / rotation setting, 1 (locked: stable, least rotation) .. 5 (open: most rotation).
// 0 = no differential effects at all (the AI cars).
export const DIFF_DEFAULT = 3;

// life: how much of a race distance a set lasts before it is completely worn (race.js scales the
// wear rate to the race length, like the shortened-race tyre scaling in the big racing games)
// A step of compound is worth about 0.4 s a lap, like the real thing. W is the wet-weather tyre:
// its mu is its grip on a soaked track (every car is on it automatically when it rains).
export const COMPOUNDS = {
  S: { name: 'Soft', mu: 1.022, life: 0.6, color: '#ff2b2b' },
  M: { name: 'Medium', mu: 1.0, life: 0.95, color: '#ffd400' },
  H: { name: 'Hard', mu: 0.982, life: 1.4, color: '#f2f2f2' },
  W: { name: 'Wet', mu: 0.76, life: 1.3, color: '#2f7cff' },
};

// Grip left in a tyre at wear w (0 new .. 1 finished): a gentle linear fade, then "the cliff"
// over the last 30% of its life.
export function tyreGrip(w) {
  const c = w > 0.7 ? (w - 0.7) / 0.3 : 0;
  return 1 - 0.035 * w - 0.15 * c * Math.sqrt(c);
}

// New tyres leave the pit lane cold (warm 0) and come up to temperature over WARM.dist metres;
// the out-lap costs about a second. race.js folds this into body.gripMul, so the AI's speed
// profiles and the player's racing line see it like any other change of grip.
export const WARM = { loss: 0.11, dist: 4200 };
export function warmGrip(x) { const c = 1 - (x < 0 ? 0 : x > 1 ? 1 : x); return 1 - WARM.loss * c * c; }

// mu: grip multiplier; drag: extra deceleration (in g) at speed; bump: roughness
// Running wide is meant to cost time, not the race: grass and gravel keep enough grip to steer
// and brake, gravel slows the car firmly but never beaches it, kerbs and painted run-off are
// close to full grip.
export const SURF = {
  track: { mu: 1.0, drag: 0, bump: 0 },
  kerb: { mu: 0.95, drag: 0, bump: 1 },
  runoff: { mu: 0.92, drag: 0, bump: 0 },
  grass: { mu: 0.62, drag: 0.15, bump: 0.35 },
  gravel: { mu: 0.56, drag: 0.6, bump: 0.8 },
};
// In the rain the road itself is covered by the wet tyre's mu; what gets relatively worse is
// everything painted or off the road.
export const SURF_WET = {
  track: { mu: 1.0, drag: 0, bump: 0 },
  kerb: { mu: 0.85, drag: 0, bump: 1 },
  runoff: { mu: 0.86, drag: 0, bump: 0 },
  grass: { mu: 0.5, drag: 0.16, bump: 0.35 },
  gravel: { mu: 0.5, drag: 0.62, bump: 0.8 },
};

function enginePower(rpm, p) {
  // fraction of peak power vs rpm
  const x = (rpm - p.rpmIdle) / (p.rpmMax - p.rpmIdle);
  const f = 0.52 + 0.62 * x - 0.18 * x * x * x * x;
  return p.P * Math.max(0.3, Math.min(1, f));
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Differential model constants. coast: rear grip given up off-throttle (diff 1 .. diff 5);
// power: extra drive the traction control lets through; slip: rear slip angle (rad) the
// stability assist allows before it steps in; yaw: slack in its yaw damping.
// lock: yaw resistance of the diff off-throttle, N*m per rad/s, for diff 1..5. coast: rear grip an
// open diff (4, 5) gives up off-throttle.
export const DIFF = { coast: 0.03, power: 0.09, slip0: 0.125, slip1: 0.035, catchGain: 110000, yaw: 0.07, lock: [5000, 3000, 1450, 600, 0], lockMax: 5000, settle: 12000 };

export class CarBody {
  constructor(params = CAR) {
    this.p = params;
    this.X = 0; this.Y = 0; this.psi = 0;
    this.vx = 0; this.vy = 0; this.r = 0;
    this.delta = 0;
    this.gear = 1; // 1..8, -1 reverse, 0 neutral
    this.rpm = params.rpmIdle;
    this.axS = 0; this.ayS = 0;
    this.ers = params.ersCap;
    this.drsOpen = false;
    this.gripMul = 1;
    this.tyreWear = 0; // 0..1
    this.compound = 'M';
    this.FyPrevF = 0; this.FyPrevR = 0;
    this.slideF = 0; this.slideR = 0; // 0..1 visual/audio
    this.lockF = false; this.spinR = false;
    this.wheelSpin = 0; this.wheelAng = 0;
    this.shiftT = 0;
    this.harvest = 0; this.deploying = false;
    this.lastHit = 0;
    this.manual = false;
    this.diff = 0;          // 0 off (AI), 1 locked .. 5 open
    this.rLP = 0; this.settleS = 0; // slow average of the yaw rate, and how settled the steering is (stability assist)
    this.thrS = 0;          // smoothed throttle, for the differential model
    this.brkS = 0;          // smoothed brake, for the steering's load estimate
    this.warm = 1;          // tyre warm-up 0 cold .. 1 up to temperature (race.js folds it into gripMul)
    // feedback signals for audio / effects / HUD (all 0..1 unless noted)
    this.alphaF = 0; this.alphaR = 0; // axle slip angles, rad, signed
    this.understeer = 0;    // front tyres pushed past their grip peak (scrubbing wide)
    this.oversteer = 0;     // rear stepping out
    this.escActive = 0;
    this.rideLoad = 1;      // vertical load on the tyres, in g
    this.bottoming = 0;     // floor close to / touching the road
  }

  speed() { return Math.hypot(this.vx, this.vy); }

  // inp: {throttle, brake, steer (-1..1, +left), ers, drs, shiftUp, shiftDown}
  // env: {front, rear (surface objects), grade, slip (0..1), dirty (0..1), tc, abs}
  step(dt, inp, env) {
    const p = this.p;
    const m = p.mass, L = p.L, a = p.a, b = p.b;
    let { vx, vy, r } = this;

    // steering actuator
    const target = clamp(inp.steer, -1, 1) * p.steerMax;
    const rate = 3.0;
    const delta0 = this.delta;
    this.delta += clamp(target - this.delta, -rate * dt, rate * dt);
    const delta = this.delta;
    const steerRate = Math.abs(delta - delta0) / dt; // rad/s the front wheels are being turned

    // gearbox
    const vabs = Math.abs(vx);
    this.shiftT = Math.max(0, this.shiftT - dt);
    if (!inp.hold && inp.brake > 0.5 && vx < 0.6 && inp.throttle < 0.1 && this.gear >= 1 && vx > -0.2) {
      this.stopT = (this.stopT || 0) + dt;
      if (this.stopT > 0.6) { this.gear = -1; this.stopT = 0; }
    } else this.stopT = 0;
    if (this.gear === -1 && inp.throttle > 0.1 && vx > -1) this.gear = 1;
    if (this.gear >= 1) {
      if (this.manual) {
        if (inp.shiftUp && this.gear < 8) { this.gear++; this.shiftT = 0.05; }
        if (inp.shiftDown && this.gear > 1) {
          const rpmLow = (vabs / p.gears[this.gear - 2]) * p.rpmMax;
          if (rpmLow < p.rpmMax * 1.02) { this.gear--; this.shiftT = 0.05; }
        }
      } else {
        const rpmNow = (vabs / p.gears[this.gear - 1]) * p.rpmMax;
        if (rpmNow > p.rpmMax * 0.965 && this.gear < 8 && this.shiftT <= 0) { this.gear++; this.shiftT = 0.08; }
        else if (this.gear > 1 && this.shiftT <= 0) {
          const rpmLow = (vabs / p.gears[this.gear - 2]) * p.rpmMax;
          if (rpmLow < p.rpmMax * 0.86) { this.gear--; this.shiftT = 0.08; }
        }
      }
    }
    const gTop = this.gear >= 1 ? p.gears[this.gear - 1] : p.gears[0] * 0.6;
    const rpmTarget = clamp((vabs / gTop) * p.rpmMax, p.rpmIdle, p.rpmMax);
    // wheelspin revs
    const spinRev = this.spinR ? 1800 * inp.throttle : 0;
    this.rpm += (Math.min(p.rpmMax, rpmTarget + spinRev) - this.rpm) * Math.min(1, dt * 25);

    // aero
    const q = 0.5 * RHO * vx * Math.abs(vx);
    const drs = this.drsOpen;
    const ClA = p.ClA * (1 - 0.18 * (env.dirty || 0)) - (drs ? p.drsCl : 0);
    const CdA = (p.CdA - (drs ? p.drsCd : 0)) * (1 - 0.32 * (env.slip || 0));
    const DF = Math.max(0, Math.abs(q) * ClA);
    const drag = q * CdA;
    const bal = p.aeroBal + (drs ? 0.04 : 0);

    // vertical loads
    const W = m * G;
    let Fzf = (W * b) / L - (m * this.axS * p.h) / L + DF * bal;
    let Fzr = (W * a) / L + (m * this.axS * p.h) / L + DF * (1 - bal);
    Fzf = Math.max(300, Fzf); Fzr = Math.max(300, Fzr);

    // differential: open settings let the rear go light when you come off the power (lift-off
    // rotation), a locked one keeps it planted. The pedal is smoothed so nothing happens in a step.
    // None of it applies off the road: on grass and gravel the car behaves as calmly as it can.
    const dk = this.diff ? (this.diff - 1) / 4 : 0;
    const dOn = this.diff ? clamp((Math.min(env.front.mu, env.rear.mu) - 0.6) / 0.3, 0, 1) : 0;
    this.thrS += (clamp(inp.throttle, 0, 1) - this.thrS) * Math.min(1, dt * 7);
    this.brkS += (clamp(inp.brake, 0, 1) - this.brkS) * Math.min(1, dt * 5);
    const coast = DIFF.coast * Math.max(0, dk - 0.5) * 2 * dOn * (1 - this.thrS) * (1 - 0.5 * clamp(inp.brake, 0, 1));
    const slipThr = 0.115 + (DIFF.slip0 - 0.115 + DIFF.slip1 * dk) * dOn; // rear slip the stability assist allows
    const tyre = this.gripMul * tyreGrip(this.tyreWear);
    // (off the road the rear also gets the field's calmer grip margin back)
    const rearGrip = this.diff ? CAR.rearGrip + (p.rearGrip - CAR.rearGrip) * dOn : p.rearGrip;
    const muF = p.mu * tyre * env.front.mu, muR = p.mu * rearGrip * (1 - coast) * tyre * env.rear.mu;
    const DmaxF = muF * Fzf, DmaxR = muR * Fzr;
    this.surfMuF = env.front.mu; this.surfMuR = env.rear.mu; // for steerCommand

    // slip angles (velocity at each axle in wheel frame)
    const cs = Math.cos(delta), sn = Math.sin(delta);
    const vfx = vx, vfy = vy + a * r;
    const wlong = vfx * cs + vfy * sn, wlat = -vfx * sn + vfy * cs;
    const alphaF = Math.atan2(wlat, Math.max(Math.abs(wlong), 2.5));
    const vry = vy - b * r;
    const alphaR = Math.atan2(vry, Math.max(Math.abs(vx), 2.5));

    // power / drive
    let throttle = clamp(inp.throttle, 0, 1);
    if (this.shiftT > 0.04) throttle *= 0.4;
    let Pw = 0;
    this.deploying = false;
    if (this.gear !== 0) {
      Pw = enginePower(this.rpm, p) * throttle;
      if (inp.ers && this.ers > 0 && throttle > 0.8 && this.gear >= 1) {
        Pw += p.ersP; this.ers -= p.ersP * dt; this.deploying = true;
      }
      if (this.gear >= 1 && vabs >= gTop * 0.998) Pw *= this.gear === 8 ? 0.2 : 0; // rev limiter
    }
    let Fdrive = 0;
    if (this.gear >= 1) Fdrive = Pw / Math.max(vabs, gTop * 0.24);
    else if (this.gear === -1) Fdrive = -Math.min(4000 * throttle, Pw / 4);
    // engine braking off-throttle
    if (throttle < 0.05 && vx > 2 && this.gear >= 1) Fdrive -= 1400;

    // brakes
    const brake = clamp(inp.brake, 0, 1);
    const sgn = vx >= 0 ? 1 : -1;
    let Fbf = brake * p.brakeForce * p.brakeBias;
    let Fbr = brake * p.brakeForce * (1 - p.brakeBias);
    if (this.gear === -1 && brake > 0) { Fbf = Fbr = 0; }
    // harvest under braking
    this.harvest = 0;
    if (brake > 0.1 && vx > 10) {
      const h = Math.min(p.ersP, brake * 140e3) * dt;
      this.ers = Math.min(p.ersCap, this.ers + h); this.harvest = brake;
    } else if (throttle < 0.05 && vx > 20) {
      this.ers = Math.min(p.ersCap, this.ers + 25e3 * dt); this.harvest = 0.3;
    }

    // longitudinal requests per axle
    let FxF = -Fbf * sgn;
    let FxR = Fdrive - Fbr * sgn;
    if (vabs < 0.3 && brake > 0) { FxF = -vx * m * 5 * 0.5; FxR = -vx * m * 5 * 0.5 + (this.gear === -1 ? Fdrive : 0); }

    // ABS / TC assists limit requests to the remaining friction circle
    const capF = Math.sqrt(Math.max(0, DmaxF * DmaxF - this.FyPrevF * this.FyPrevF));
    const capR = Math.sqrt(Math.max(0, DmaxR * DmaxR - this.FyPrevR * this.FyPrevR));
    if (env.abs) {
      // fronts may trade some cornering for braking; the rears keep cornering grip first (EBD)
      // (when the fronts are also being asked to steer, absTurn hands part of that braking share
      // back to cornering: brake-and-turn then turns the car instead of ploughing straight on)
      // The player's ABS also keeps part of the front tyres' grip free for steering, from the moment
      // a steering input is made: `turn` is how hard the fronts are (or, at the commanded wheel
      // angle, would be) cornering, and absTurn is the share of front grip reserved at full key.
      // Without this, full braking used ~97% of the front circle and a steering input did nothing
      // for a few tenths, then the car snapped round as the speed fell. The rears give up a little
      // braking too while you turn in, so the back stays planted.
      const satF = Math.abs(Math.sin(p.C * Math.atan(p.B * alphaF)));
      const satCmd = p.absTurn ? Math.abs(Math.sin(p.C * Math.atan(p.B * (alphaF + (this.delta - clamp(inp.steer, -1, 1) * p.steerMax))))) : 0;
      const turn = Math.max(satF, satCmd);
      let lf = Math.max(capF * 0.97, DmaxF * 0.82), lr = Math.max(capR * 0.8, DmaxR * 0.08);
      if (p.absTurn) {
        const keep = Math.min(1, turn) * p.absTurn;
        lf = Math.min(lf, DmaxF * Math.sqrt(1 - keep * keep));
        lr = Math.max(capR * (0.8 - 0.14 * turn), DmaxR * 0.08);
      }
      if (Math.abs(FxF) > lf) FxF = Math.sign(FxF) * lf;
      if (FxR < 0 && -FxR > lr && brake > 0) FxR = -lr + Math.max(0, Fdrive);
    }
    if (env.tc && FxR > 0) {
      // an open diff setting lets a little more drive through: the rear can be steered on the power
      // (and it backs the power off again as the slip angle builds, so a power slide holds an
      // angle instead of running away)
      const hold = 1 - 0.75 * clamp((Math.abs(alphaR) - (slipThr - 0.03)) / 0.04, 0, 1) * dOn;
      const lim = Math.max(capR * (0.92 + DIFF.power * dk * dOn) * hold, DmaxR * (0.3 - 0.18 * (1 - hold)));
      if (FxR > lim) FxR = lim;
    }

    // combined slip per axle
    const axle = (Fx, Dmax, alpha, kind) => {
      let sliding = false;
      if (Math.abs(Fx) > Dmax) { Fx = Math.sign(Fx) * Dmax * 0.8; sliding = true; }
      let Dy = Math.sqrt(Math.max(0, Dmax * Dmax - Fx * Fx));
      if (sliding) Dy = Math.max(Dy, Dmax * 0.25) * 0.55;
      const Fy = -Dy * Math.sin(p.C * Math.atan(p.B * alpha));
      return { Fx, Fy, sliding };
    };
    const f = axle(FxF, DmaxF, alphaF, 'f');
    const rr = axle(FxR, DmaxR, alphaR, 'r');
    this.FyPrevF = f.Fy; this.FyPrevR = rr.Fy;
    this.lockF = f.sliding && brake > 0;
    this.spinR = rr.sliding && FxR > 0;
    this.slideF = Math.max(f.sliding ? 1 : 0, clamp((Math.abs(alphaF) - 0.1) * 8, 0, 1));
    this.slideR = Math.max(rr.sliding ? 1 : 0, clamp((Math.abs(alphaR) - 0.1) * 8, 0, 1));

    // body forces
    const FxBf = f.Fx * cs - f.Fy * sn;
    const FyBf = f.Fx * sn + f.Fy * cs;
    // soft surfaces drag hard at speed but ease off at a crawl, so you can always drive out
    const soft = (env.front.drag + env.rear.drag) * 0.5 * W * (0.22 + 0.78 * Math.min(1, vabs / 15));
    const rollRes = (p.roll * W + soft) * Math.tanh(vx * 2);
    const gradeF = -m * G * (env.grade || 0);
    let Fx = FxBf + rr.Fx - drag - rollRes + gradeF;
    let Fy = FyBf + rr.Fy;
    // bumpiness off-track
    const bump = (env.front.bump + env.rear.bump) * 0.5;
    if (bump > 0 && vabs > 3) Fy += (Math.random() - 0.5) * bump * 2500;

    // stability control (assist): when the rear slides past its grip peak, brake-steer the car
    // straight again, like ESC on a road car. Smooth and proportional, costs a little speed.
    let Mz = 0;
    this.escActive = 0;
    // Differential on the overrun: off the throttle a locking diff resists the car's rotation
    // (the rear wheels are tied together), which is what keeps the rear from coming round more
    // and more while you coast through a corner with the key held. Open settings give it up.
    if (this.diff && vx > 5) {
      const off = clamp(1 - this.thrS * 5, 0, 1); // gone by a fifth throttle
      const lock = DIFF.lock[this.diff - 1] * off * dOn * (Fzr / ((W * a) / L)); // grows with the load on the rear tyres, like their grip
      Mz -= clamp(r * lock, -DIFF.lockMax, DIFF.lockMax);
    }
    if (env.esc && vx > 8) {
      const Mz0 = Mz;
      // (1) rear sliding past its grip peak -> restoring moment
      // (with a diff setting the rear is allowed a few more degrees before it is caught, and it is
      // caught more gently: a slide you can see and hold, not a snap)
      // The catch is progressive: light just past the allowed angle, full authority 3 degrees on.
      const ex = Math.abs(alphaR) - slipThr;
      if (ex > 0) Mz += Math.sign(alphaR) * Math.min(dOn > 0 ? ex * (140000 + (DIFF.catchGain - 140000) * dOn) * (1 + (ex / 0.035) * dOn) : ex * 140000, 16000 + 6000 * dOn);
      // (2) yaw damping: nose rotating faster than the steering asks for (or than grip allows)
      const aMax = p.mu * (G + DF / m);
      const rWant = clamp((vx * delta) / (L * (1 + (vx * vx) / 41000)), -aMax / vx, aMax / vx);
      const slack = DIFF.yaw * Math.max(0, dk - 0.5) * 2 * dOn; // only the open settings loosen the yaw damping
      const over = Math.sign(r) === Math.sign(rWant) || Math.abs(rWant) < 0.02 ? Math.abs(r) - Math.abs(rWant) * (1.05 + slack) - 0.02 - slack * 0.4 : Math.abs(r);
      if (over > 0) Mz -= Math.sign(r) * Math.min(over * 30000, 12000);
      // (3) settle: once the wheel has stopped moving, damp any weave of the yaw rate about its
      // own average (at speed the car is lightly damped near the limit). Off during turn-in, so
      // it costs none of the initial bite.
      this.rLP += (r - this.rLP) * Math.min(1, dt / 0.45);
      const still = 1 - clamp(steerRate / (0.5 * Math.abs(delta) + 0.004), 0, 1); // 1 when the wheel angle is changing by less than ~50% of itself per second
      this.settleS += (still - this.settleS) * Math.min(1, dt * (still > this.settleS ? 5 : 30));
      Fx -= Math.abs(Mz - Mz0) * 0.5; // the brake pressure that makes the moment also slows the car a touch
      this.escActive = Math.min(1, Math.abs(Mz - Mz0) / 5000);
      if (dOn > 0) Mz -= clamp((r - this.rLP) * DIFF.settle * this.settleS * dOn, -5000, 5000); // (too small to cost speed or count as an intervention)
    }
    const ax = Fx / m, ay = Fy / m;
    const ar = (a * FyBf - b * rr.Fy + Mz) / p.Iz;
    // what the tyres are doing, for sound / effects / HUD
    this.alphaF = alphaF; this.alphaR = alphaR;
    const moving = clamp((vabs - 6) / 6, 0, 1);
    // ride: total vertical load in g (1 at rest, ~4.5 flat out) and how hard the floor is being
    // pushed into the road (aero load, plus the nose diving under braking, plus kerbs)
    this.rideLoad = (Fzf + Fzr) / W;
    this.bottoming = moving * clamp((this.rideLoad - 3.0) / 1.3 + 0.35 * clamp(-this.axS / 45, 0, 1) * clamp((this.rideLoad - 2) / 1.5, 0, 1) + (bump >= 1 ? 0.25 : 0), 0, 1);
    this.understeer = moving * clamp((Math.abs(alphaF) - 0.125) / 0.06, 0, 1);
    this.oversteer = moving * clamp((Math.abs(alphaR) - 0.095) / 0.06, 0, 1);

    vx += (ax + vy * r) * dt;
    vy += (ay - vx * r) * dt;
    r += ar * dt;
    // low-speed settling
    if (Math.abs(vx) < 1.5 && throttle < 0.05) { vy *= 1 - Math.min(1, dt * 4); r *= 1 - Math.min(1, dt * 4); }
    if (brake > 0 && Math.abs(vx) < 0.4 && this.gear !== -1) vx *= 1 - Math.min(1, dt * 10);

    this.vx = vx; this.vy = vy; this.r = r;
    this.axS += (ax - this.axS) * Math.min(1, dt * 12);
    this.ayS += (vx * r - this.ayS) * Math.min(1, dt * 12);

    const c = Math.cos(this.psi), s = Math.sin(this.psi);
    this.X += (vx * c - vy * s) * dt;
    this.Y += (vx * s + vy * c) * dt;
    this.psi += r * dt;

    // wheel visuals
    const wv = vx / p.wheelR + (this.spinR ? 30 * throttle : 0) * (this.lockF ? 0 : 1);
    this.wheelAng += wv * dt;
    this.frontWheelAng = (this.frontWheelAng || 0) + (this.lockF ? 0 : vx / p.wheelR) * dt;
  }

  // Scripted motion (pit lane, parking on the grid): the car is moved along a path, no forces.
  kinematic(X, Y, psi, v, dt) {
    const p = this.p;
    this.r = 0; this.vy = 0;
    this.axS += ((v - this.vx) / Math.max(dt, 1e-4) - this.axS) * Math.min(1, dt * 8);
    this.ayS *= 1 - Math.min(1, dt * 8);
    this.X = X; this.Y = Y; this.psi = psi; this.vx = v;
    this.delta *= 1 - Math.min(1, dt * 6);
    this.drsOpen = false; this.lockF = false; this.spinR = false; this.slideF = 0; this.slideR = 0;
    this.deploying = false; this.harvest = 0;
    this.gear = 1;
    while (this.gear < 8 && v > p.gears[this.gear - 1] * 0.9) this.gear++;
    const rpmTarget = clamp((v / p.gears[this.gear - 1]) * p.rpmMax, p.rpmIdle, p.rpmMax);
    this.rpm += (rpmTarget - this.rpm) * Math.min(1, dt * 12);
    this.wheelAng += (v / p.wheelR) * dt;
    this.frontWheelAng = (this.frontWheelAng || 0) + (v / p.wheelR) * dt;
  }

  setPose(X, Y, psi, v = 0) {
    this.X = X; this.Y = Y; this.psi = psi;
    this.vx = v; this.vy = 0; this.r = 0; this.delta = 0;
    this.axS = 0; this.ayS = 0; this.thrS = 0; this.brkS = 0; this.rLP = 0; this.settleS = 0;
    this.gear = 1;
    while (this.gear < 8 && v > this.p.gears[this.gear - 1] * 0.9) this.gear++; // rolling start: pick a sane gear
  }
}

// Steering for digital / pad input.
// The input s (-1..1) is a request for a FRACTION OF THE CAR'S CORNERING GRIP at the current
// speed, and we solve for the wheel angle that delivers it:
//    angle = wheelbase * lateral_acc / v^2  +  (front slip - rear slip the tyres need for that force)
// So half input is half the g, at 60 km/h or at 300, and full input holds the car at its limit
// without scrubbing past it. Pure feed-forward: nothing hunts. (With the assist on, a soft cap also
// stops the fronts being turned far past the direction they are travelling.)
function slipFor(f, p) { // slip angle that produces normalised lateral force f on the tyre curve
  return Math.tan(Math.asin(Math.min(0.9995, Math.abs(f))) / p.C) / p.B;
}
export function steerLock(p, v) {
  const cdf = (0.5 * RHO * p.ClA) / p.mass;
  const aLat = p.mu * (G + cdf * v * v);
  return Math.min(p.steerMax, (p.L * aLat) / Math.max(v * v, 25) + slipFor(0.985, p) - slipFor(0.985 / p.rearGrip, p));
}
// Full key asks the front tyres for this share of their limit: all of it in slow corners, a
// little short of the peak at speed, where the tyre still answers a change of slip (that is
// what damps the car's yaw when it matters).
export const STEER_USE = { slow: 0.985, fast: 0.975, v0: 28, v1: 58 };
// What each axle can hold right now, as a lateral acceleration (m/s^2): tyre state, surface,
// aero, and the load the pedals are moving between the axles.
export function axleLimits(b) {
  const p = b.p, v = Math.abs(b.vx), m = p.mass;
  const DF = 0.5 * RHO * v * v * p.ClA, W = m * G;
  // Load moved between the axles, estimated from the PEDALS (smoothed), not measured from the
  // car: nothing the car's own motion does feeds back into the steering.
  const aEst = -(b.brkS || 0) * Math.min(p.brakeForce, p.mu * (W + DF)) / m - (0.5 * RHO * v * v * p.CdA) / m + (b.thrS || 0) * Math.min(6, p.P / (m * Math.max(v, 20)));
  const shift = (m * aEst * p.h) / p.L;
  const Fzf = Math.max(300, (W * p.b) / p.L - shift + DF * p.aeroBal);
  const Fzr = Math.max(300, (W * p.a) / p.L + shift + DF * (1 - p.aeroBal));
  const tyre = b.gripMul * tyreGrip(b.tyreWear);
  const dOn = b.diff ? clamp((Math.min(b.surfMuF ?? 1, b.surfMuR ?? 1) - 0.6) / 0.3, 0, 1) : 0;
  const rg = b.diff ? CAR.rearGrip + (p.rearGrip - CAR.rearGrip) * dOn : p.rearGrip;
  return {
    front: (p.mu * tyre * (b.surfMuF ?? 1) * Fzf) / ((m * p.b) / p.L),
    rear: (p.mu * rg * tyre * (b.surfMuR ?? 1) * Fzr) / ((m * p.a) / p.L),
  };
}
export function steerCommand(b, s, assist = true) {
  const p = b.p;
  const v = Math.abs(b.vx);
  s = clamp(s, -1, 1);
  let d;
  if (b.diff) {
    // Player car: the request is a fraction of what the FRONT tyres can actually hold right now
    // (compound, wear, temperature, wet track, grass, and the load on them), so full key is the
    // limit and half key is half of it whatever the conditions; the rear's share sets how much
    // of the lock is needed.
    const lim = axleLimits(b);
    const use = STEER_USE.slow + (STEER_USE.fast - STEER_USE.slow) * clamp((v - STEER_USE.v0) / (STEER_USE.v1 - STEER_USE.v0), 0, 1);
    // Under braking the load moves forward: the fronts could hold far more than the rears. Asking
    // for all of it made the formula below answer with OPPOSITE lock for a few tenths (the rear's
    // slip term swamped the front's): a dead, wrong-way moment on turn-in under brakes and then a
    // snap. So the request is also held to what the rear axle can carry, and the rear's slip term
    // may cancel the front's but never exceed it: the feed-forward never countersteers.
    const ay = Math.min(use * Math.abs(s) * lim.front, (0.96 * lim.rear) / 0.93);
    const sf = slipFor(ay / lim.front, p), sr = Math.min(slipFor(Math.min(0.97, (0.93 * ay) / lim.rear), p), sf);
    d = Math.sign(s) * ((p.L * ay) / Math.max(v * v, 25) + sf - sr);
  } else {
    const cdf = (0.5 * RHO * p.ClA) / p.mass;
    const aLat = p.mu * (G + cdf * v * v);
    const f = 0.985 * s;
    d = Math.sign(f) * ((p.L * Math.abs(f) * aLat) / Math.max(v * v, 25) + slipFor(f, p) - slipFor(f / p.rearGrip, p));
  }
  d = clamp(d, -p.steerMax, p.steerMax);
  if (assist && b.vx > 8) {
    const betaF = Math.atan2(b.vy + p.a * b.r, v); // direction the front axle is actually travelling
    const cap = slipFor(0.985, p) + 0.03;
    const lo = betaF - cap, hi = betaF + cap;
    if (d > hi) d = hi + (d - hi) * 0.15; else if (d < lo) d = lo + (d - lo) * 0.15;
  }
  return clamp(d / p.steerMax, -1, 1);
}

// --- speed profile used by the AI ------------------------------------------------
export function computeProfile(T, rl, p = CAR, usage = 0.97, gripMul = 1, brakeScale = 1) {
  const { N } = T;
  const cdf = (0.5 * RHO * p.ClA) / p.mass;
  const cdd = (0.5 * RHO * p.CdA) / p.mass;
  const vTop = 96;
  // A less committed driver is not slower everywhere: corners the car takes easily flat-out stay
  // flat for anyone. `ease` is 1 where the ideal car has lots of grip in hand, 0 where it is on
  // the limit, and the driver's commitment (usage) only bites where the corner is actually hard.
  let ease = null;
  if (usage < 0.999) {
    const key = `_ideal${gripMul}`;
    const ideal = rl[key] || (rl[key] = computeProfile(T, rl, p, 1, gripMul, 1));
    ease = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const k = Math.abs(rl.kappa[i]);
      const den = k - p.mu * gripMul * cdf;
      const vlatIdeal = den <= 0 ? 1e3 : Math.sqrt((p.mu * gripMul * G) / den);
      const e = (vlatIdeal / ideal.v[i] - 1.15) / 0.35;
      ease[i] = e < 0 ? 0 : e > 1 ? 1 : e;
    }
    // smooth so commitment changes gradually along the lap
    for (let pass = 0; pass < 12; pass++) { let prev = ease[N - 1]; for (let i = 0; i < N; i++) { const c = ease[i]; ease[i] = (prev + c + ease[(i + 1) % N]) / 3; prev = c; } }
  }
  const muAt = (i) => p.mu * gripMul * (ease ? usage + (1 - usage) * ease[i] : usage);
  const vlat = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const k = Math.abs(rl.kappa[i]);
    const mu = muAt(i);
    const den = k - mu * cdf;
    vlat[i] = den <= 0 ? vTop : Math.min(vTop, Math.sqrt((mu * G) / den));
  }
  const v = Float64Array.from(vlat);
  let i0 = 0;
  for (let i = 1; i < N; i++) if (vlat[i] < vlat[i0]) i0 = i;
  // forward pass (acceleration), twice around
  for (let q = 0; q < 2 * N; q++) {
    const i = (i0 + q) % N, j = (i + 1) % N;
    const vi = v[i], mu = muAt(i);
    const lat = vi * vi * Math.abs(rl.kappa[i]);
    const ratio = Math.min(1, lat / (mu * (G + cdf * vi * vi)));
    const grip = Math.sqrt(1 - ratio * ratio);
    const gTop = p.gears.find((g) => g > vi) ?? p.gears[7];
    const Fe = (p.P * 0.97) / Math.max(vi, gTop * 0.24);
    const Fz_r = p.mass * G * (p.a / p.L) + 0.5 * RHO * p.ClA * vi * vi * (1 - p.aeroBal);
    const aDrive = Math.min(Fe / p.mass, (mu * Fz_r * grip) / p.mass);
    const acc = aDrive - cdd * vi * vi - G * T.grade[i] - p.roll * G;
    const vn = Math.sqrt(Math.max(1, vi * vi + 2 * acc * rl.ds[i]));
    if (vn < v[j]) v[j] = vn;
  }
  // backward pass (braking)
  for (let q = 0; q < 2 * N; q++) {
    const j = (i0 - q + 4 * N) % N, i = (j - 1 + N) % N;
    const vj = v[j], mu = muAt(j);
    const lat = vj * vj * Math.abs(rl.kappa[j]);
    const ratio = Math.min(1, lat / (mu * (G + cdf * vj * vj)));
    const grip = Math.sqrt(1 - ratio * ratio);
    const aB = Math.min(mu * (G + cdf * vj * vj) * grip, p.brakeForce / p.mass) * brakeScale + cdd * vj * vj + G * T.grade[j];
    const vp = Math.sqrt(vj * vj + 2 * Math.max(2, aB) * rl.ds[i]);
    if (vp < v[i]) v[i] = vp;
  }
  let lap = 0;
  for (let i = 0; i < N; i++) lap += rl.ds[i] / v[i];
  return { v, lap };
}
