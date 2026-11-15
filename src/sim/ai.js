// AI driver. Drives the same physics model as the player. Each track has three
// optimised lines (ideal, left-constrained, right-constrained, >= 2.8 m apart) with
// their own speed profiles. The driver blends between them with a lane value
// u in [-1, 1] (-1 = right line, 0 = ideal, +1 = left line), chosen by a planner that
// scores each lane against every nearby car's predicted position through the next
// corners. That gives real racecraft: dive down the inside, switchback, side-by-side
// through a corner with the inside car slower, one defensive move, slipstream pulls,
// yielding when beaten into a corner, plus DRS/ERS usage and occasional mistakes.

import { tyreGrip } from './physics.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sm01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const LANES = [-1, -0.5, 0, 0.5, 1];
// tyre-grip range the two anchor speed profiles are built for: [dry], [wet]
const G_RANGE = { dry: [0.8, 1.04], wet: [0.6, 0.78], mixed: [0.56, 1.04] }; // mixed: a race in which the weather changes

export function laneLat(T, u, j) {
  const I = T.rl.alpha[j];
  return u >= 0 ? I + (T.lineL.alpha[j] - I) * u : I + (T.lineR.alpha[j] - I) * -u;
}

// estimate which lane value best describes a car at lateral d at index i
export function laneOf(T, d, i) {
  let best = 0, bd = 1e9;
  for (let u = -1; u <= 1.001; u += 0.25) {
    const e = Math.abs(laneLat(T, u, i) - d);
    if (e < bd) { bd = e; best = u; }
  }
  return best;
}

export class AIDriver {
  constructor(entry, race, opts) {
    this.e = entry;
    this.race = race;
    this.skill = opts.skill;
    this.aggr = opts.aggression ?? 0.5;
    this.consistency = opts.consistency ?? 0.95;
    this.brakeEffort = opts.brake ?? 1;
    this.craft = opts.racecraft ?? 1;       // 0..1 racecraft / awareness
    this.startDelay = opts.startDelay ?? 0;
    this.form = 1;                          // lap-to-lap pace variation
    this.formLap = -1;
    // Speed profiles for a low and a high tyre-grip level, built once; the profile we drive to is a
    // blend of the two for the grip the tyres have right now (compound x wear), so worn tyres mean
    // earlier braking and lower corner speeds without recomputing anything mid-race.
    [this.gLo, this.gHi] = G_RANGE[race.weatherPlan === 'raining' || race.weatherPlan === 'drying' ? 'mixed' : race.wet ? 'wet' : 'dry'];
    this.profLo = race.profileFor(this.skill, this.brakeEffort, this.gLo);
    this.profHi = race.profileFor(this.skill, this.brakeEffort, this.gHi);
    const n = race.T.N;
    this.prof = { I: { v: new Float32Array(n) }, L: { v: new Float32Array(n) }, R: { v: new Float32Array(n) } };
    this.gq = -1;
    this.setGrip(entry.body.gripMul * tyreGrip(entry.body.tyreWear));
    this.u = laneOf(race.T, entry.d, entry.idx);
    this.uTarget = this.u;
    this.mode = 'line';
    this.defendUsed = -1;
    this.mistake = 0;
    this.stuckT = 0;
    this.thinkT = 0;
    this.near = [];
    this.uHold = 0;
  }

  setGrip(g) {
    this.gq = g;
    const w = (g - this.gLo) / (this.gHi - this.gLo);
    for (const k of ['I', 'L', 'R']) {
      const lo = this.profLo[k].v, hi = this.profHi[k].v, out = this.prof[k].v;
      for (let i = 0; i < out.length; i++) out[i] = lo[i] + (hi[i] - lo[i]) * w;
    }
  }

  vAt(u, j) {
    const p = this.prof;
    const I = p.I.v[j];
    return u >= 0 ? I + (p.L.v[j] - I) * u : I + (p.R.v[j] - I) * -u;
  }

  nextCorner(i, maxDist) {
    const T = this.race.T;
    const n = Math.round(maxDist / T.ds);
    for (let q = 4; q < n; q++) {
      const j = (i + q) % T.N;
      if (Math.abs(T.rl.kappa[j]) > 1 / 220) return { dist: q * T.ds, side: Math.sign(T.kappa[j] || T.rl.kappa[j]), idx: j };
    }
    return null;
  }

  // predicted lateral for another car at index j
  otherLat(o, j) {
    const T = this.race.T;
    if (o.pit) return o.d; // on the pit exit road: it is where it is
    const u = o.ai ? o.ai.u : laneOf(T, o.d, o.idx);
    return laneLat(T, u, j);
  }

  think(dt) {
    const R = this.race, T = R.T, e = this.e, N = T.N;
    const v = e.body.speed();
    const near = [];
    let behind = null, behindGap = 1e9, ahead = null, aheadGap = 1e9;
    const P = T.pit;
    for (const o of R.entries) {
      if (o === e || o.ghost > 0) continue;
      if (o.pit && o.pit.r < P.x0) continue; // in the pit lane, behind the wall
      let ds = o.s - e.s;
      if (ds > T.length / 2) ds -= T.length;
      if (ds < -T.length / 2) ds += T.length;
      if (ds < -14 || ds > 100) continue;
      const ov = o.body.speed();
      let oh = o.body.psi - Math.atan2(T.ty[o.idx], T.tx[o.idx]);
      oh = Math.atan2(Math.sin(oh), Math.cos(oh));
      const troubled = Math.abs(oh) > 0.35 || (o.ai && ov < 0.55 * o.ai.vAt(o.ai.u, o.idx));
      near.push({ o, ds, ov, troubled });
      if (ds < -2 && -ds < behindGap) { behindGap = -ds; behind = o; }
      if (ds > 2 && ds < aheadGap) { aheadGap = ds; ahead = o; }
    }
    this.near = near;
    this.ahead = ahead; this.aheadGap = aheadGap;
    // blue flag: a car a lap ahead is right behind us -> no defending, ease off line
    this.blue = !!(behind && behindGap < 30 && behind.dist - e.dist > T.length * 0.5);
    const corner = this.nextCorner(e.idx, 350);
    this.corner = corner;
    // one defensive move per corner, decided on the straight
    if (behind && behindGap < 18 && corner && corner.dist < 350 && corner.dist > v * 1.3 && this.defendUsed !== corner.idx && this.defendUsed !== -corner.idx - 2 && R.racing) {
      if (behind.body.speed() > v - 1 && Math.random() < 0.25 + this.aggr * 0.6) this.defendUsed = corner.idx;
      else this.defendUsed = -corner.idx - 2; // decided not to
    }
    const defending = !this.blue && corner && this.defendUsed === corner.idx && corner.dist > v * 0.9;

    const fut = [0, 15, 35, 60, Math.max(90, v * 2.2)].map((m) => (e.idx + Math.round(m / T.ds)) % N);
    const myLatNow = e.d;
    let best = this.u, bestCost = 1e9;
    let leastBad = this.u, leastBadSep = -1;
    const costs = [];
    const lap1 = e.lap <= 1 && R.racing;
    const sepReq = (lap1 ? 3.0 : 2.7) + (1 - this.craft) * 0.35 + (R.wet ? 0.3 : 0); // weaker drivers (and everyone in the rain) leave more room
    let ti = 0;
    for (let q = 0; q < 120; q += 8) { const j = (e.idx + q) % N; ti += (T.ds * 8 * (1 - T.kappa[j] * laneLat(T, 0, j))) / Math.max(5, this.vAt(0, j)); }
    for (const u of LANES) {
      let cost = Math.abs(u) * 1.0 + Math.abs(u - this.u) * 0.8;
      // time cost of the lane over the next stretch
      let tl = 0;
      for (let q = 0; q < 120; q += 8) { const j = (e.idx + q) % N; tl += (T.ds * 8 * (1 - T.kappa[j] * laneLat(T, u, j))) / Math.max(5, this.vAt(u, j)); }
      cost += (tl - ti) * 12;
      let blocked = false, minSep = 99;
      const latNow = laneLat(T, u, e.idx);
      for (const n of near) {
        const o = n.o, closing = v - n.ov;
        const along = n.ds > -6.5 && n.ds < 6.5;
        if (along) {
          if ((o.d - myLatNow) * (o.d - latNow) < 0 && Math.abs(o.d - myLatNow) < 5) { blocked = true; minSep = 0; }
          minSep = Math.min(minSep, Math.abs(latNow - o.d));
          for (const j of fut) minSep = Math.min(minSep, Math.abs(laneLat(T, u, j) - this.otherLat(o, j)));
          if (minSep < sepReq) blocked = true;
        } else if (n.ds >= 6.5 && n.troubled) {
          const j = (e.idx + Math.round(n.ds / T.ds)) % N;
          if (Math.abs(laneLat(T, u, j) - o.d) < 4.0) cost += 30;
        } else if (n.ds >= 6.5) {
          const tCatch = closing > 0.3 ? (n.ds - 6) / closing : 99;
          if (tCatch < 4) {
            const j = (e.idx + Math.round((n.ds + n.ov * tCatch) / T.ds)) % N;
            const sep = Math.abs(laneLat(T, u, j) - this.otherLat(o, j));
            if (sep < 2.5) cost += 10 * (1 - tCatch / 4) + 3;
          } else if (n.ds < 60) {
            const j = (e.idx + Math.round(n.ds / T.ds)) % N;
            const behindThem = Math.abs(laneLat(T, u, j) - this.otherLat(o, j)) < 2.3;
            const onStraight = !corner || corner.dist > 220;
            if (behindThem && onStraight && n.ds > 9) cost -= 1.3 * this.craft;   // take the tow
            else if (behindThem && n.ds < 35) cost += 0.6;                          // dirty air in corners
          }
        } else if (n.ds < -6.5 && n.ds > -14) {
          // don't chop across someone right behind us
          if (Math.abs(latNow - o.d) < 2.2 && Math.abs(u - this.u) > 0.1 && n.ov > v) cost += 4;
        }
      }
      if (blocked) {
        costs.push(1e9);
        if (minSep > leastBadSep) { leastBadSep = minSep; leastBad = u; }
        continue;
      }
      if (corner && ahead && aheadGap < 50 && v - ahead.body.speed() > -2) {
        cost -= Math.max(0, u * corner.side) * (1.5 + 2 * this.aggr) * (corner.dist < 250 ? 1 : 0.5);
      }
      if (defending) cost -= Math.max(0, u * corner.side) * 6;
      if (this.blue) cost -= Math.abs(u) * 3; // move off the racing line
      costs.push(cost);
      if (cost < bestCost) { bestCost = cost; best = u; }
    }
    this.boxed = bestCost >= 1e9;
    this.uHold -= dt;
    if (!this.boxed && best !== this.uTarget) {
      const curIdx = LANES.indexOf(this.uTarget);
      const curCost = curIdx >= 0 ? costs[curIdx] : 1e9;
      if (curCost >= 1e9 || (this.uHold <= 0 && bestCost < curCost - 0.4)) { this.uTarget = best; this.uHold = 0.5; }
    }
    if (this.boxed) this.uTarget = leastBad;
    else if (this.pitting) this.uTarget = P.side; // heading for the pit entry
    this.mode = this.boxed ? 'boxed' : defending ? 'defend' : Math.abs(this.uTarget) > 0.1 ? 'lane' : 'line';
    // battery: good racers save it for attack and defence, weaker ones just burn it when it's full
    this.useErs = this.craft > 0.35
      ? (ahead && aheadGap < 70) || (behind && behindGap < 25) || e.body.ers > e.body.p.ersCap * 0.8
      : e.body.ers > e.body.p.ersCap * 0.5;
  }

  control(dt) {
    const R = this.race, T = R.T, e = this.e, body = e.body, N = T.N;
    // on the grid: foot on the brake, wheels straight, until the lights go out
    if (!R.racing && e.finishedAt == null) return { throttle: 0, brake: 1, steer: 0, hold: true, ers: false, drs: false };
    // tyres: a worn or harder set has less grip, so use the speed profile for the grip we have
    // (in the rain everyone leaves a margin: kerbs and paint are treacherous and the profile cannot see them)
    const gNow = body.gripMul * tyreGrip(body.tyreWear) * (R.wet ? 0.965 : 1);
    if (Math.abs(gNow - this.gq) > 0.004) this.setGrip(gNow);
    // reaction time at the start
    if (R.mode === 'race' && R.raceStart != null && R.time - R.raceStart < this.startDelay) return { throttle: 0, brake: 1, steer: 0, hold: true, ers: false, drs: false };
    // nobody drives every lap identically: a little form variation per lap, more for weaker drivers
    if (e.lap !== this.formLap) { this.formLap = e.lap; this.form = 1 + (Math.random() - 0.6) * (0.004 + 0.016 * (1 - this.craft)); }
    this.thinkT += dt;
    if (this.thinkT > 0.1) { this.think(this.thinkT); this.thinkT = 0; }

    const v = body.speed();
    const du = (0.55 + 0.35 * this.aggr) * dt;
    this.u += clamp(this.uTarget - this.u, -du, du);

    // ----- steering: pure pursuit to a point on the blended line
    const Ld = clamp(5 + v * 0.3, 7, 34);
    const jf = e.idx + e.frac + Ld / T.ds;
    const j0 = Math.floor(jf) % N, j1 = (j0 + 1) % N, f = jf - Math.floor(jf);
    let lat = laneLat(T, this.u, j0) * (1 - f) + laneLat(T, this.u, j1) * f;
    // pit stop this lap: move across to the pit side and peel off into the entry road
    const P = T.pit;
    let pitR = null;
    this.pitting = false;
    if (e.pitReq && R.racing && e.finishedAt == null) {
      const r = P.rel(e.s);
      if (r > P.e0 - 340 && r < P.e0 + 70) {
        this.pitting = true; pitR = r;
        if (!this.boxed) lat += (P.side * (T.width / 2 - 1.8) - lat) * sm01((r - (P.e0 - 340)) / 230);
      }
    }
    const cx = T.x[j0] * (1 - f) + T.x[j1] * f, cy = T.y[j0] * (1 - f) + T.y[j1] * f;
    const px = cx + T.nx[j0] * lat, py = cy + T.ny[j0] * lat;
    const c = Math.cos(body.psi), s = Math.sin(body.psi);
    const dx = px - body.X, dy = py - body.Y;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const kpp = (2 * ly) / Math.max(1, lx * lx + ly * ly);
    let delta = Math.atan(body.p.L * kpp);
    delta += kpp * v * v * 0.00045;
    delta -= 0.12 * (body.r - v * kpp);
    // countersteer: point the front wheels along the velocity when the rear steps out
    const beta = Math.atan2(body.vy, Math.max(3, Math.abs(body.vx)));
    if (Math.abs(beta) > 0.04) delta += (beta - Math.sign(beta) * 0.04) * 1.1;
    let steer = clamp(delta / body.p.steerMax, -1, 1);
    if (lx < 0) steer = Math.sign(ly) || 1;

    // ----- speed target from the blended profile, with braking look-ahead
    const look = Math.round((v * 0.16 + 3) / T.ds);
    let vt = this.vAt(this.u, (e.idx + look) % N);
    for (let q = look; q < look + 70; q += 5) {
      const j = (e.idx + q) % N;
      const allow = Math.sqrt(this.vAt(this.uTarget, j) ** 2 + 2 * 30 * Math.min(1, this.gq) * Math.max(0, q * T.ds - v * 0.25));
      if (allow < vt) vt = allow;
    }
    const kap = Math.abs(T.rl.kappa[(e.idx + look) % N]);
    // dirty air: less downforce when following closely -> carry less speed in corners
    if (e.dirty > 0.05 && kap > 1 / 500) vt *= 1 - 0.075 * e.dirty;
    vt *= this.form;
    // first lap in the rain, in the pack: nobody can see and nobody can stop, so everyone is careful
    if (R.wet && e.lap <= 1 && this.ahead && this.aheadGap < 40 && kap > 1 / 400) vt *= 0.95;
    // attacking down the inside: brake that little bit later
    if (this.mode === 'lane' && this.ahead && this.aheadGap < 16 && this.corner && this.corner.dist < v * 2.2 && Math.sign(this.u) === this.corner.side) vt *= 1 + 0.02 * this.aggr * this.craft;
    if (this.blue && kap < 1 / 150) vt *= 0.94;
    if (this.mistake > 0) { vt *= 1.05; this.mistake -= dt; }
    else if (R.racing && kap > 1 / 100 && Math.random() < (1 - this.consistency) * dt * 0.3) this.mistake = 0.7;

    // ----- traffic: never drive into a car in our path; yield when beaten
    const corner = this.corner;
    for (const n of this.near) {
      const o = n.o, ov = o.body.speed();
      if (n.ds > 0.5) {
        const jo = o.idx;
        const myPathAtThem = laneLat(T, this.u, jo);
        const wide = n.troubled ? 3.6 : 2.25;
        const latOverlap = Math.abs(o.d - e.d) < wide || Math.abs(o.d - myPathAtThem) < wide || (n.ds < 25 && Math.abs(o.d - lat) < wide);
        if (latOverlap) {
          // (in the rain: a longer gap and gentler closing, because everyone's braking is longer)
          const gap = n.ds - (R.wet ? 8.0 : 6.0);
          const safe = ov + Math.sign(gap) * Math.sqrt(2 * (R.wet ? 5 : 8) * Math.abs(gap)) * 0.85;
          if (safe < vt) vt = Math.max(0, safe);
        }
      }
      if (n.ds > -6.5 && n.ds < 9 && corner && corner.dist < v * 2.0) {
        const outside = Math.sign(e.d - o.d) !== corner.side;
        const behindThem = n.ds > 1.5 || (n.ds > -1.0 && outside);
        if (behindThem && (this.boxed || Math.abs(this.otherLat(o, corner.idx) - laneLat(T, this.u, corner.idx)) < 2.8)) {
          vt = Math.min(vt, Math.max(ov - 3.5, vt * 0.6, 10));
        }
      }
    }
    if (pitR !== null) vt = Math.min(vt, Math.sqrt(60 * 60 + 2 * 24 * Math.max(0, P.e0 - pitR)));
    if (!R.racing) vt = 0;

    let throttle = 0, brake = 0;
    const err = vt - v;
    if (err > 0) throttle = clamp(0.25 + err * 0.4, 0, 1);
    else if (err > -1.2) throttle = clamp(0.25 + err * 0.2, 0, 1);
    else brake = clamp(-err * 0.22, 0, 1);
    const rearSlip = Math.abs(Math.atan2(body.vy - body.p.b * body.r, Math.max(3, Math.abs(body.vx))));
    if (rearSlip > 0.07) throttle *= Math.max(0, 1 - (rearSlip - 0.07) * 9);
    // progressive throttle on low-speed exits (no stamping on it in 2nd gear with lock on)
    if (v < 40 && Math.abs(steer) > 0.3) throttle = Math.min(throttle, 0.35 + (40 - v) * 0 + (1 - Math.abs(steer)) * 0.8);
    if (body.spinR) throttle *= 0.6;

    // stuck / spun recovery
    const hd = Math.atan2(T.ty[e.idx], T.tx[e.idx]);
    let herr = body.psi - hd;
    herr = Math.atan2(Math.sin(herr), Math.cos(herr));
    if (R.racing && (v < 3 || Math.abs(herr) > 1.6)) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 3.5) { R.recover(e); this.stuckT = 0; this.u = laneOf(T, e.d, e.idx); this.uTarget = this.u; }

    const drs = e.drsAvail && R.inDrsZone(e.idx);
    return { throttle, brake, steer, ers: this.useErs, drs };
  }
}
