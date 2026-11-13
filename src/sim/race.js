// Race manager: physics substeps, track surfaces, walls, car-to-car contact,
// slipstream/dirty air, DRS detection, laps/sectors/gaps, track limits, results.
import { CarBody, CAR, SURF, SURF_WET, COMPOUNDS, PLAYER_SETUP, DIFF_DEFAULT, computeProfile, tyreGrip, warmGrip, WARM } from './physics.js';
import { project } from './trackgen.js';
import { AIDriver, laneOf } from './ai.js';

export const SUBSTEP = 1 / 240;
const CAR_R = 0.95;
const CIRCLES = [1.75, 0.2, -1.6];
const IDLE = { throttle: 0, brake: 0, steer: 0 };

const sm01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Race {
  constructor(T, opts) {
    this.T = T;
    this.opts = opts;
    this.laps = opts.laps ?? 5;
    this.mode = opts.mode ?? 'race'; // 'race' | 'trial'
    this.time = 0;
    this.raceTime = 0;
    this.state = 'grid'; // grid -> lights -> racing -> finished
    // pit stops: 'off' | 'optional' | 'required' (must stop once and use two compounds)
    const D = Race.defaults;
    // weather: 'dry' | 'wet' (everyone on wet tyres, less grip everywhere, slippery paint and kerbs)
    // The plan can also change mid-race: 'raining' starts dry and the rain arrives, 'drying' starts
    // wet and dries out. Then the tyres on the car stop suiting the track and everyone has to pit.
    const plan = opts.weather ?? D.weather;
    this.weatherPlan = ['wet', 'raining', 'drying'].includes(plan) ? plan : 'dry';
    this.wetness = this.weatherPlan === 'wet' || this.weatherPlan === 'drying' ? 1 : 0; // how wet the road is, 0..1
    this.rain = this.wetness;                                                             // how hard it is raining, 0..1
    this.wet = this.wetness > 0.5;
    this.weather = this.wet ? 'wet' : 'dry';
    this.everWet = this.wet;
    this.surf = this.wet ? SURF_WET : SURF;
    this.changing = false;
    this.changeAt = 0.26 + Math.random() * 0.3; // share of the race distance at which the weather turns
    // track limits: 'on' | 'off' (off: never warned, never penalised, laps always count)
    this.trackLimits = (opts.trackLimits ?? D.trackLimits) === 'off' ? 'off' : 'on';
    this.pitRule = this.mode === 'race' ? (opts.pits ?? 'off') : 'off';
    if (this.pitRule === 'required' && this.laps < 3) this.pitRule = 'optional';
    // tyre life is scaled to the race distance; with pit stops switched off every set lasts the race
    this.wearLaps = Math.max(this.laps, 5) * (this.pitRule === 'off' ? 1.8 : 1);
    this.lightsT = 0;
    this.lightsOn = 0;
    this.lightsOutAt = 0;
    this.racing = false;
    this.profiles = new Map();
    this.entries = [];
    this.leaderCP = new Map();
    this.cpEvery = 25; // samples
    this.finishOrder = [];
    this.events = []; // {t, type, text}
    this.drsEnabled = this.mode === 'trial'; // time trial: DRS every lap; race: from lap 2
    this.acc = 0;
    const boxOf = new Map();

    const n = opts.grid.length;
    opts.grid.forEach((g, k) => {
      // The player's car has its own balance and a differential setting (setup.diff 1..5);
      // the AI run the standard car with no differential effects.
      const body = new CarBody(g.isPlayer ? { ...CAR, ...PLAYER_SETUP } : { ...CAR });
      if (g.isPlayer) body.diff = Math.max(1, Math.min(5, Math.round(g.setup?.diff ?? D.diff ?? DIFF_DEFAULT)));
      body.compound = this.wet ? 'W' : (COMPOUNDS[g.compound] && g.compound !== 'W' ? g.compound : 'M');
      body.gripMul = COMPOUNDS[body.compound].mu;
      body.manual = !!g.manual;
      const e = {
        id: k, name: g.name, short: g.short, team: g.team, color: g.color, color2: g.color2, number: g.number,
        isPlayer: !!g.isPlayer, body, ai: null,
        idx: 0, frac: 0, s: 0, d: 0, lap: 0, dist: 0,
        lapStart: null, lastLap: null, bestLap: null, curSectors: [], lastSectors: [], bestSectors: [null, null, null],
        sectorStart: 0, sectorIdx: 0,
        gap: 0, interval: 0, pos: k + 1, startPos: k + 1, finishedAt: null,
        drsAvail: false, drsArmedFor: -1, limits: 0, penalty: 0, limitCool: 0, lapValid: true,
        slip: 0, dirty: 0, ghost: 0, impact: 0, surfF: SURF.track, surfR: SURF.track,
        assists: g.assists ?? { tc: true, abs: true },
        lapTrace: null, bestTrace: null, retired: false, overtakes: 0,
        pit: null, pitReq: false, pitCompound: null, stops: 0, used: new Set([body.compound]), stintLap: 0,
        drsNote: null,
      };
      if (!boxOf.has(g.team)) boxOf.set(g.team, boxOf.size % 10);
      e.box = boxOf.get(g.team);
      this.entries.push(e);
      // grid slot
      const back = this.mode === 'trial' ? (opts.rollBack ?? 60) : 12 + k * 8;
      const side = this.mode === 'trial' ? 0 : (k % 2 === 0 ? 1 : -1) * 2.7 * this.poleSide();
      e.gridS = T.length - back; e.gridD = side;
      this.place(e, e.gridS, side, this.mode === 'trial' ? (opts.rollV ?? 40) : 0);
      e.plan = this.planStop(e);
      if (!e.isPlayer) {
        e.ai = new AIDriver(e, this, g);
      }
    });
    this.boxTeams = [...boxOf.keys()]; // team name per pit box, in pit-lane order
    if (this.mode === 'trial') { this.state = 'racing'; this.racing = true; }
    this.player = this.entries.find((e) => e.isPlayer) || null;
  }

  static defaults = {}; // test / URL overrides: { weather, trackLimits, diff }

  poleSide() {
    // pole on the inside of T1
    const T = this.T;
    for (let i = 0; i < T.N; i++) if (Math.abs(T.kappa[i]) > 1 / 200) return Math.sign(T.kappa[i]);
    return 1;
  }

  // grip: tyre state (compound x wear), so a driver on worn tyres brakes earlier and corners slower
  profileFor(skill, brake = 1, grip = 1) {
    const ks = Math.round(skill * 400) / 400, kb = Math.round(brake * 25) / 25, kg = Math.round(grip * 50) / 50;
    const key = `${ks}:${kb}:${kg}`;
    if (!this.profiles.has(key)) {
      const T = this.T;
      this.profiles.set(key, { I: computeProfile(T, T.rl, CAR, ks, kg, kb), L: computeProfile(T, T.lineL, CAR, ks, kg, kb), R: computeProfile(T, T.lineR, CAR, ks, kg, kb) });
    }
    return this.profiles.get(key);
  }

  // What a human on a keyboard can follow: a little under the grip limit and braking at ~60% of
  // the car's maximum, so braking zones start earlier and there is margin for error.
  humanProfile(grip = 1) {
    const kg = Math.round(grip * 50) / 50;
    this._human = this._human || new Map();
    if (!this._human.has(kg)) this._human.set(kg, computeProfile(this.T, this.T.rl, CAR, 0.93, kg, 0.6).v);
    return this._human.get(kg);
  }

  // ------------------------------------------------------------------ strategy
  // Which lap a driver plans to stop on and what goes on the car. Softs come in early,
  // hards run long; the second set is picked to last the rest of the race.
  planStop(e) {
    const c = e.body.compound, n = this.laps;
    const win = { S: [0.28, 0.45], M: [0.42, 0.6], H: [0.58, 0.76], W: [0.36, 0.66] }[c];
    const f = win[0] + Math.random() * (win[1] - win[0]);
    const lap = Math.max(1, Math.min(n - 1, Math.round(f * n)));
    const to = this.nextCompound(e, lap);
    return { lap, to, window: [Math.max(1, Math.round(win[0] * n)), Math.max(1, Math.min(n - 1, Math.round(win[1] * n)))] };
  }

  // The tyres a car gets at its stop are chosen for it: the softest (fastest) compound that will
  // still last from the end of lap `lap` to the flag, and a different compound from the one it
  // has used so far when the two-compound rule applies.
  nextCompound(e, lap = e.lap) {
    if (this.wantWets()) return 'W'; // in the rain it is wets (and the two-compound rule is waived)
    const rest = Math.max(0, this.laps - lap) / this.wearLaps;
    let c = rest < 0.55 ? 'S' : rest < 0.9 ? 'M' : 'H';
    if (this.pitRule === 'required' && e.used.size < 2 && e.used.has(c)) c = { S: 'M', M: rest < 0.42 ? 'S' : 'H', H: 'M' }[c];
    return c;
  }

  // ------------------------------------------------------------------ weather
  // which kind of tyre the conditions call for right now (looking ahead once the weather has turned)
  wantWets() {
    if (this.weatherPlan === 'raining') return this.changing;
    if (this.weatherPlan === 'drying') return !(this.changing && this.wetness < 0.62);
    return this.wet;
  }
  wrongTyres(e) { return this.mode === 'race' && (e.body.compound === 'W') !== this.wantWets(); }
  // grip of a tyre type on the road as it is: slicks lose badly as the water builds, wet tyres
  // overheat and squirm on a dry road
  tyreFit(c) { const w = this.wetness; return c === 'W' ? 1 + 0.18 * (1 - w) : 1 - 0.42 * w; }

  weatherUpdate(dt) {
    const plan = this.weatherPlan;
    if ((plan === 'raining' || plan === 'drying') && this.mode === 'race' && this.racing) {
      const lead = this.order && this.order[0];
      const prog = lead ? lead.dist / (this.laps * this.T.length) : 0;
      const say = (text, type = 'radio') => this.events.push({ t: this.time, type, text });
      if (!this.changing && !this.warned && prog >= this.changeAt - 0.07) { this.warned = true; say(plan === 'raining' ? 'RAIN IS ON THE WAY' : 'THE RAIN IS EASING: TRACK WILL DRY'); }
      if (!this.changing && prog >= this.changeAt && prog < 0.9) { this.changing = true; say(plan === 'raining' ? 'RAIN: PIT FOR WET TYRES' : 'TRACK IS DRYING: PIT FOR SLICK TYRES', 'warn'); }
      if (this.changing) {
        const to = plan === 'raining' ? 1 : 0, step = (v, rate) => v + Math.max(-dt * rate, Math.min(dt * rate, to - v));
        this.rain = step(this.rain, 1 / 8);
        this.wetness = step(this.wetness, plan === 'raining' ? 1 / 38 : 1 / 55);
      }
      // drivers on the wrong tyres come in; not all on the same lap
      this.wxT = (this.wxT || 0) + dt;
      if (this.changing && this.wxT > 1) {
        this.wxT = 0;
        for (const e of this.entries) {
          if (e.isPlayer && !e.autopilot) continue;
          if (e.pitReq || e.pit || e.finishedAt != null || this.pitRule === 'off' || this.laps - e.lap < 1 || !this.wrongTyres(e)) continue;
          if (this.entries.some((o) => o !== e && o.box === e.box && (o.pitReq || (o.pit && !o.pit.serviced)))) continue; // one car per team at a time
          if (e.wxNerve === undefined) e.wxNerve = 0.12 + Math.random() * 0.4; // how long this driver gambles on the old tyres
          if (plan === 'raining' ? this.wetness > e.wxNerve : this.wetness < 1 - e.wxNerve) e.pitReq = true;
        }
      }
    }
    const wet = this.wetness > 0.5;
    if (wet !== this.wet) { this.wet = wet; this.weather = wet ? 'wet' : 'dry'; this.everWet = this.everWet || wet; }
    this.surf = this.wet ? SURF_WET : SURF;
  }

  // called as a car starts lap e.lap: decide whether it comes in at the end of this lap
  strategy(e) {
    if (this.pitRule === 'off' || !this.racing || e.finishedAt != null) return;
    const left = this.laps - e.lap + 1; // laps still to run, including this one
    const w = e.body.tyreWear;
    const perLap = e.stintLap > 0 ? w / e.stintLap : 0;
    e.stintLap++;
    if (e.isPlayer && !e.autopilot) {
      // race engineer
      const say = (text, type = 'radio') => this.events.push({ t: this.time, type, text });
      if (this.pitRule === 'required' && e.stops === 0) {
        if (left === 1) say('NO PIT STOP MADE: +20s AT THE FLAG', 'warn');
        else if (left === 2) say('LAST CHANCE: MAKE YOUR PIT STOP THIS LAP', 'warn');
        else if (e.lap === e.plan.window[0]) say(`PIT WINDOW OPEN: LAP ${e.plan.window[0]}${e.plan.window[1] > e.plan.window[0] ? '–' + e.plan.window[1] : ''}`);
      } else if (left >= 3 && w + perLap * left > 1.0 && w > 0.55 && !e.pitReq) say('TYRES ARE GOING OFF: PIT AT THE END OF THE LAP');
      return;
    }
    if (e.pitReq || left < 2) return;
    let go = false;
    if (this.pitRule === 'required' && e.stops === 0) {
      go = e.lap >= e.plan.lap || (w > 0.8 && left > 2);
      // do not stack behind the team mate unless it is the last chance
      const mate = this.entries.find((o) => o !== e && o.box === e.box && (o.pitReq || o.pit));
      if (go && mate && left > 2 && w < 0.9) go = false;
    } else if (left >= 3 && w > 0.6 && w + perLap * left > 1.08) go = true; // tyres will not make it
    if (go) e.pitReq = true;
  }

  requestPit(e, on = !e.pitReq) {
    if (this.pitRule === 'off' || this.mode !== 'race' || e.pit || e.finishedAt != null) return false;
    e.pitReq = on;
    if (on && e.isPlayer && e.stops === 0 && Math.max(1, e.lap) < e.plan.window[0]) this.events.push({ t: this.time, type: 'warn', text: `PIT WINDOW OPENS ON LAP ${e.plan.window[0]}: A STOP NOW WILL BE SLOW` });
    return true;
  }

  place(e, s, d, v = 0) {
    const T = this.T;
    s = ((s % T.length) + T.length) % T.length;
    const fi = s / T.ds;
    const i = Math.floor(fi) % T.N, j = (i + 1) % T.N, f = fi - Math.floor(fi);
    const x = T.x[i] + (T.x[j] - T.x[i]) * f + T.nx[i] * d;
    const y = T.y[i] + (T.y[j] - T.y[i]) * f + T.ny[i] * d;
    e.body.setPose(x, y, Math.atan2(T.ty[i], T.tx[i]), v);
    e.idx = i;
    this.updateTrackPos(e);
    e.snap = true; // teleported: don't interpolate across the jump
  }

  recover(e) {
    this.recoveries = (this.recoveries || 0) + 1;
    // put the car back on the racing line, ghosted for a moment
    const T = this.T;
    const s = (e.idx + 2) * T.ds;
    const i = (e.idx + 2) % T.N;
    this.place(e, s, T.rl.alpha[i], 12);
    e.ghost = 3;
  }

  inDrsZone(i) {
    if (!this.drsEnabled) return false;
    for (const z of this.T.drs) {
      if (z.start <= z.end ? i >= z.start && i < z.end : i >= z.start || i < z.end) return true;
    }
    return false;
  }

  updateTrackPos(e) {
    const T = this.T, b = e.body;
    const pr = project(T, b.X, b.Y, e.idx);
    e.prevIdx = e.idx;
    e.idx = pr.i; e.frac = pr.f; e.s = pr.s; e.d = pr.d; e.h = pr.h; e.grade = pr.grade;
    e.pr = pr;
    return pr;
  }

  axleSurface(e, key, i, d) {
    const a = this.surfaceAt(i, d + 0.8), b = this.surfaceAt(i, d - 0.8);
    if (a === b) return a;
    const o = e[key] || (e[key] = { mu: 1, drag: 0, bump: 0 });
    o.mu = (a.mu + b.mu) / 2; o.drag = (a.drag + b.drag) / 2; o.bump = Math.max(a.bump, b.bump);
    return o;
  }

  surfaceAt(i, d) {
    const T = this.T, w2 = T.width / 2, ad = Math.abs(d), left = d > 0;
    const S = this.surf;
    if (ad <= w2) return S.track;
    const kerb = left ? T.kerbL[i] : T.kerbR[i];
    if (ad <= w2 + 1.4) return kerb ? S.kerb : S.runoff;
    if (T.pit && T.pit.zone[i] && left === (T.pit.side === 1)) return S.runoff; // paved pit apron
    const ro = left ? T.runoffL[i] : T.runoffR[i];
    if (ro) return ad <= w2 + 9 ? S.runoff : S.gravel;
    return S.grass;
  }

  start() {
    if (this.state === 'grid') { this.state = 'lights'; this.lightsT = 0; this.lightsOutAt = 5 + 0.4 + Math.random() * 2.2; }
  }

  // ------------------------------------------------------------------ pit lane
  // Pit lane driving is scripted (like the pit assist in the big racing games): once a car is in
  // the entry road it follows the pit path at the limiter, stops on its marks, gets tyres and is
  // released at the end of the exit road.
  enterPit(e, r, dl) {
    const P = this.T.pit;
    const stop = this.pitRule !== 'off' && this.mode === 'race' && e.finishedAt == null;
    let dur = 2.15 + Math.random() * 0.7;
    if (Math.random() < 0.07) dur += 1.2 + Math.random() * 2;     // slow stop
    if (!e.pitReq) dur += 2.5;                                     // crew was not expecting the car
    // Before a driver's pit window opens the new set is not ready: the stop still counts, but it
    // is slow. (Stopping on lap 1 into clear air while the field queues later is not a free win.)
    if (stop && e.stops === 0 && e.lap < e.plan.window[0] && !this.wrongTyres(e)) { dur += 3.5; if (e.isPlayer) this.events.push({ t: this.time, type: 'warn', text: 'EARLY STOP: TYRES NOT READY, SLOW STOP' }); }
    e.pit = { phase: 'in', r, r0: r, off: dl - P.lat(r), blend: Math.max(12, Math.min(70, P.nose0 - 6 - r)), v: e.body.speed(),
      box: P.boxes[e.box], stop, serviced: !stop, stopT: 0, dur, t: 0, lat: dl, to: stop ? this.nextCompound(e) : null };
    e.drsAvail = false;
    if (e.isPlayer) this.events.push({ t: this.time, type: 'radio', text: 'PIT LANE: LIMITER ON' });
  }

  pitLat(p, r) {
    const P = this.T.pit;
    let lat = P.lat(r);
    if (p.stop) {
      const db = p.box - r;
      if (!p.serviced) { if (db < 24) lat += (P.boxD - P.laneD) * sm01(1 - db / 24); }
      else lat += (P.boxD - P.laneD) * (1 - sm01(-db / 24));
    }
    return lat + p.off * (1 - sm01((r - p.r0) / p.blend));
  }

  pitStep(e, dt) {
    const T = this.T, P = T.pit, p = e.pit, b = e.body;
    p.t += dt;
    let vmax = p.r < P.lim0 ? Math.sqrt(P.speed * P.speed + 2 * 45 * (P.lim0 - p.r)) : p.r < P.lim1 ? P.speed : 110;
    if (p.phase === 'stop') {
      p.stopT += dt; p.v = 0;
      if (p.stopT >= p.dur) {
        // released when the fast lane is clear
        let clear = true;
        for (const o of this.entries) {
          if (o === e || !o.pit || o.pit.phase === 'stop') continue;
          const g = o.pit.r - p.r;
          // (a queue standing still behind does not hold the release: otherwise a full pit lane locks solid)
          if (g > -13 && g < 7 && Math.abs(o.pit.lat - P.laneD) < 3 && (o.pit.v > 2.5 || g > 0)) clear = false;
        }
        if (clear) {
          const c = p.to;
          b.compound = c; b.tyreWear = 0; b.warm = 0; // new tyres are cold: see warmGrip
          b.gripMul = COMPOUNDS[c].mu * warmGrip(0);
          e.used.add(c); e.stops++; e.stintLap = 0; e.pitReq = false; e.tyreChanged = true;
          e.lastStop = p.stopT;
          p.serviced = true; p.phase = 'out';
          if (e.isPlayer) this.events.push({ t: this.time, type: 'go', text: `STOP ${p.stopT.toFixed(1)}s · ${COMPOUNDS[c].name.toUpperCase()}S ON` });
        }
      }
    } else {
      if (p.stop && !p.serviced) {
        let db = p.box - p.r;
        // team mate still on the marks: queue behind
        if (this.entries.some((o) => o !== e && o.pit && o.box === e.box && o.pit.phase === 'stop')) db -= 7.5;
        vmax = Math.min(vmax, Math.sqrt(2 * 7 * Math.max(0, db)) + 0.5);
        if (p.box - p.r < 0.12) { p.phase = 'stop'; p.r = p.box; p.v = 0; }
      }
      // keep a gap to a car ahead in the lane
      for (const o of this.entries) {
        if (o === e || !o.pit) continue;
        const g = o.pit.r - p.r;
        if (g <= 0 || g > 60 || Math.abs(o.pit.lat - p.lat) > 2.6) continue;
        vmax = Math.min(vmax, o.pit.v + Math.sqrt(2 * 7 * Math.max(0, g - 8)));
      }
      if (p.phase !== 'stop') {
        const acc = p.r < P.lim1 ? 7 : Math.max(2, Math.min(12.5, 640e3 / (800 * Math.max(p.v, 10)) - 0.0011 * p.v * p.v));
        p.v += Math.max(-70 * dt, Math.min(acc * dt, vmax - p.v));
        if (p.v < 0) p.v = 0;
        p.r += p.v * dt;
      }
    }
    const lat = this.pitLat(p, p.r);
    p.lat = lat;
    const A = P.pos(p.r, P.side * lat, this._pa || (this._pa = {}));
    const B = P.pos(p.r + 1, P.side * this.pitLat(p, p.r + 1), this._pb || (this._pb = {}));
    const psi = Math.atan2(B.y - A.y, B.x - A.x);
    if (p.r >= P.x1) {
      // back on the circuit
      b.setPose(A.x, A.y, psi, p.v);
      e.pit = null; e.pitOutT = this.time;
      e.idx = A.i;
      if (e.ai) { e.ai.u = laneOf(T, P.side * lat, A.i); e.ai.uTarget = e.ai.u; }
      if (e.isPlayer) { e.pitExit = true; this.events.push({ t: this.time, type: 'go', text: 'PIT EXIT' }); }
      return;
    }
    b.kinematic(A.x, A.y, psi, p.v, dt);
  }

  // advance simulation by frame dt with player input
  update(frameDt, playerInput) {
    frameDt = Math.min(frameDt, 0.05);
    this.acc += frameDt;
    let steps = 0;
    // gear-shift presses are one-shot events: latch them and apply to exactly one substep
    this.shiftUp = this.shiftUp || !!playerInput.shiftUp;
    this.shiftDown = this.shiftDown || !!playerInput.shiftDown;
    while (this.acc >= SUBSTEP && steps < 20) {
      for (const e of this.entries) { const b = e.body; e.pX = b.X; e.pY = b.Y; e.pPsi = b.psi; e.pH = e.h; }
      this.substep(SUBSTEP, { ...playerInput, shiftUp: this.shiftUp, shiftDown: this.shiftDown });
      this.shiftUp = this.shiftDown = false;
      this.acc -= SUBSTEP;
      steps++;
    }
    // render pose = interpolation between the last two physics states (smooth at any refresh rate)
    const al = Math.min(1, this.acc / SUBSTEP);
    for (const e of this.entries) {
      const b = e.body;
      if (e.pX === undefined || e.snap) { e.pX = b.X; e.pY = b.Y; e.pPsi = b.psi; e.pH = e.h; e.snap = false; }
      e.rX = e.pX + (b.X - e.pX) * al; e.rY = e.pY + (b.Y - e.pY) * al;
      e.rPsi = e.pPsi + (b.psi - e.pPsi) * al; e.rH = e.pH + (e.h - e.pH) * al;
    }
    this.frameUpdate(frameDt);
  }

  frameUpdate(dt) {
    const T = this.T;
    this.weatherUpdate(dt);
    // start lights
    if (this.state === 'lights') {
      this.lightsT += dt;
      this.lightsOn = Math.min(5, Math.floor(this.lightsT));
      if (this.lightsT >= this.lightsOutAt) {
        this.state = 'racing'; this.racing = true; this.lightsOn = 0;
        this.raceStart = this.time;
        this.events.push({ t: this.time, type: 'go', text: 'LIGHTS OUT' });
      }
    }
    // slipstream / dirty air
    for (const e of this.entries) {
      let slip = 0, dirty = 0;
      for (const o of this.entries) {
        if (o === e) continue;
        let ds = o.s - e.s;
        if (ds < -T.length / 2) ds += T.length;
        if (ds > T.length / 2) ds -= T.length;
        if (ds <= 2 || ds > 55) continue;
        const lat = Math.abs(o.d - e.d);
        if (lat > 3.2) continue;
        const w = (1 - lat / 3.2) * (1 - ds / 55);
        slip = Math.max(slip, w);
        if (ds < 25) dirty = Math.max(dirty, (1 - ds / 25) * (1 - lat / 3.2));
      }
      e.slip = slip; e.dirty = dirty;
    }
    // positions
    this.updatePositions();
  }

  substep(dt, playerInput) {
    this.time += dt;
    const T = this.T, P = T.pit;
    const w2 = T.width / 2;
    for (const e of this.entries) {
      if (e.ghost > 0) e.ghost -= dt;
      const b = e.body;
      // scripted phase: the pit lane
      if (e.pit) {
        const pS = e.s, pI = e.idx;
        e.input = IDLE;
        this.pitStep(e, dt);
        e.surfF = e.surfR = this.surf.track;
        this.updateTrackPos(e);
        this.timing(e, pI, pS);
        continue;
      }
      let inp;
      if (e.isPlayer) {
        inp = playerInput;
        // held on the grid until the lights go out
        if (!this.racing && this.state !== 'finished') inp = { throttle: 0, brake: 1, steer: playerInput.steer, hold: true };
        if ((e.finishedAt != null || e.autopilot) && e.ai) inp = e.ai.control(dt);
      } else {
        inp = e.ai.control(dt);
      }
      e.input = inp;
      // DRS state
      const inZone = this.inDrsZone(e.idx);
      if (e.drsAvail && inZone && inp.drs && !b.drsOpen) b.drsOpen = true;
      if (b.drsOpen && (!inZone || inp.brake > 0.05)) b.drsOpen = false;

      // surfaces per axle
      let herr = b.psi - Math.atan2(T.ty[e.idx], T.tx[e.idx]);
      const sh = Math.sin(herr);
      const dF = e.d + b.p.a * sh, dR = e.d - b.p.b * sh;
      // each axle's grip is the average of its left and right wheel: dropping two wheels on the
      // grass costs grip on both axles evenly (catchable), instead of one whole axle letting go
      e.surfF = this.axleSurface(e, 'bF', e.idx, dF);
      e.surfR = this.axleSurface(e, 'bR', e.idx, dR);
      // tyre state the car and everything that reads body.gripMul sees: compound x warm-up
      const vNow = b.speed();
      if (b.warm < 1) b.warm = Math.min(1, b.warm + (vNow * dt) / (WARM.dist * (this.wet ? 1.3 : 1)));
      b.gripMul = COMPOUNDS[b.compound].mu * warmGrip(b.warm) * this.tyreFit(b.compound);
      b.step(dt, inp, {
        front: e.surfF, rear: e.surfR,
        grade: e.grade * Math.cos(herr),
        slip: e.slip, dirty: e.dirty,
        tc: e.assists.tc, abs: e.assists.abs, esc: !!e.assists.esc,
      });
      // tyre wear: a set lasts COMPOUNDS.life x the race distance; sliding and lock-ups cost extra
      const v = b.speed();
      if (this.mode === 'race' && this.racing) b.tyreWear = Math.min(1, b.tyreWear + ((v * dt) / T.length / (COMPOUNDS[b.compound].life * this.wearLaps)) * (0.75 + 1.5 * (b.slideF + b.slideR)) * (b.compound === 'W' ? 1 + 2.5 * (1 - this.wetness) : 1));

      const prevS = e.s, prevIdx = e.idx;
      const pr = this.updateTrackPos(e);
      this.walls(e, pr, herr);
      this.timing(e, prevIdx, prevS);
      // pit entry: a car in the entry road is taken over by the pit-lane script
      if (P && this.racing && e.finishedAt == null) {
        const r = P.rel(e.s), dl = e.d * P.side;
        if (r > P.e0 && r < P.nose0 && Math.abs(wrapPi(herr)) < 0.5 && v > 4) {
          const path = P.lat(r);
          const early = r < P.e0 + 65 && dl > path - 3.5 && (dl > w2 + 1.2 || (e.pitReq && dl > w2 - 4.5));
          if (early || (r >= P.e0 + 65 && dl > P.wallD - 1)) { this.enterPit(e, r, dl); continue; }
        }
        if (e.pitReq && e.isPlayer && !e.autopilot && prevIdx !== e.idx) {
          const i0 = Math.round(((P.e0 + T.length) % T.length) / T.ds);
          if (prevIdx < i0 + 40 && e.idx >= i0 + 40 && e.idx - prevIdx < 50) this.events.push({ t: this.time, type: 'warn', text: 'PIT ENTRY MISSED' });
        }
      }
      // Track limits. Only excursions that gain something count: all four wheels clearly over the
      // line on a paved surface (a wide exit kept flat), or cutting the inside of a corner. Running
      // wide onto grass or gravel already costs time, so it is not penalised on top of that.
      if (e.limitCool > 0) e.limitCool -= dt;
      const pitSideApron = P && P.zone[e.idx] && e.d * P.side > 0; // heading for / leaving the pit lane
      if (this.trackLimits === 'on' && Math.abs(e.d) - 1.0 > w2 + 0.45 && this.racing && e.limitCool <= 0 && v > 15 && !pitSideApron) {
        const k = T.kappa[e.idx];
        const cut = Math.abs(k) > 1 / 400 && Math.sign(k) === Math.sign(e.d); // on the inside of the corner
        const paved = e.surfF.drag === 0 && e.surfR.drag === 0;
        if (cut || paved) {
          e.limitCool = 6;
          const wasValid = e.lapValid;
          e.lapValid = false;
          if (this.mode === 'race') {
            e.limits++;
            if (e.limits % 4 === 0) { e.penalty += 3; if (e.isPlayer) this.events.push({ t: this.time, type: 'pen', text: '+3s PENALTY: TRACK LIMITS' }); }
            else if (e.isPlayer) this.events.push({ t: this.time, type: 'warn', text: `TRACK LIMITS WARNING ${e.limits % 4}/3` });
          } else if (e.isPlayer && wasValid) this.events.push({ t: this.time, type: 'warn', text: 'LAP INVALIDATED' }); // said once per lap; e.lapValid stays false until the line
        }
      }
    }
    this.collisions();
  }

  walls(e, pr, herr) {
    const b = e.body;
    const hw = 1.0 + Math.abs(Math.sin(herr)) * 2.2;
    const P = this.T.pit;
    for (const side of [1, -1]) {
      let wall = side === 1 ? pr.wallL : pr.wallR;
      if (P && side === P.side && P.wall[e.idx]) wall = Math.min(wall, P.wallD); // the pit wall
      const pen = side * e.d + hw - wall;
      if (pen > 0) {
        const nx = side * pr.nx, ny = side * pr.ny; // outward
        b.X -= nx * pen; b.Y -= ny * pen;
        const c = Math.cos(b.psi), s = Math.sin(b.psi);
        let wx = b.vx * c - b.vy * s, wy = b.vx * s + b.vy * c;
        const vn = wx * nx + wy * ny;
        if (vn > 0) {
          wx -= 1.3 * vn * nx; wy -= 1.3 * vn * ny;
          const fr = Math.max(0.5, 1 - 0.06 * vn);
          wx *= fr; wy *= fr;
          b.r *= 0.5;
          b.r += -side * vn * 0.05 * Math.sign(b.vx);
          e.impact = Math.max(e.impact, vn);
        }
        b.vx = wx * c + wy * s; b.vy = -wx * s + wy * c;
        e.d -= side * pen;
      }
    }
  }

  collisions() {
    const es = this.entries;
    const L = this.T.length;
    for (let i = 0; i < es.length; i++) {
      const A = es[i];
      if (A.ghost > 0 || A.pit) continue;
      for (let j = i + 1; j < es.length; j++) {
        const B = es[j];
        if (B.ghost > 0 || B.pit) continue;
        let ds = Math.abs(A.s - B.s);
        if (ds > L / 2) ds = L - ds;
        if (ds > 7) continue;
        const a = A.body, b = B.body;
        const ca = Math.cos(a.psi), sa = Math.sin(a.psi), cb = Math.cos(b.psi), sb = Math.sin(b.psi);
        for (const oa of CIRCLES) for (const ob of CIRCLES) {
          const ax = a.X + ca * oa, ay = a.Y + sa * oa;
          const bx = b.X + cb * ob, by = b.Y + sb * ob;
          let dx = bx - ax, dy = by - ay;
          const dist = Math.hypot(dx, dy);
          if (dist >= 2 * CAR_R || dist < 1e-4) continue;
          const nx = dx / dist, ny = dy / dist, pen = 2 * CAR_R - dist;
          a.X -= nx * pen * 0.5; a.Y -= ny * pen * 0.5;
          b.X += nx * pen * 0.5; b.Y += ny * pen * 0.5;
          // world velocities at contact
          let avx = a.vx * ca - a.vy * sa, avy = a.vx * sa + a.vy * ca;
          let bvx = b.vx * cb - b.vy * sb, bvy = b.vx * sb + b.vy * cb;
          const rax = ca * oa, ray = sa * oa, rbx = cb * ob, rby = sb * ob;
          const vax = avx - a.r * ray, vay = avy + a.r * rax;
          const vbx = bvx - b.r * rby, vby = bvy + b.r * rbx;
          const vrel = (vbx - vax) * nx + (vby - vay) * ny;
          if (vrel < 0) {
            const raxn = rax * ny - ray * nx, rbxn = rbx * ny - rby * nx;
            const m = a.p.mass, I = a.p.Iz * 1.6;
            const J = (-(1 + 0.15) * vrel) / (2 / m + (raxn * raxn) / I + (rbxn * rbxn) / I);
            avx -= (J * nx) / m; avy -= (J * ny) / m;
            bvx += (J * nx) / m; bvy += (J * ny) / m;
            a.r -= (raxn * J) / I; b.r += (rbxn * J) / I;
            a.vx = avx * ca + avy * sa; a.vy = -avx * sa + avy * ca;
            b.vx = bvx * cb + bvy * sb; b.vy = -bvx * sb + bvy * cb;
            const imp = -vrel;
            A.impact = Math.max(A.impact, imp); B.impact = Math.max(B.impact, imp);
            if (imp > 4) A.contact = B.contact = this.time;
          }
        }
      }
    }
  }

  timing(e, prevIdx, prevS) {
    const T = this.T, N = T.N;
    // crossed the line?
    const crossed = prevIdx > N * 0.8 && e.idx < N * 0.2;
    const back = prevIdx < N * 0.2 && e.idx > N * 0.8;
    if (back) { e.lap--; }
    if (crossed) {
      e.lap++;
      // interpolate the exact crossing instant inside this substep (1 ms timing, not 4 ms)
      const before = T.length - prevS, after = e.s;
      const tCross = this.time - SUBSTEP * (after / Math.max(1e-6, before + after));
      this.tCross = tCross;
      if (e.lapStart != null && e.lap >= 2) {
        const lt = tCross - e.lapStart;
        e.lastLap = lt;
        e.lastLapValid = e.lapValid;
        if (e.lapValid && (e.bestLap == null || lt < e.bestLap)) {
          e.bestLap = lt;
          e.bestTrace = e.lapTrace;
          if (this.bestLap == null || lt < this.bestLap) { this.bestLap = lt; this.bestBy = e; }
        }
        this.closeSector(e, 2);
        e.lastSectors = e.curSectors.slice();
      }
      e.lapStart = tCross;
      e.sectorStart = tCross;
      e.sectorIdx = 0;
      e.curSectors = [];
      e.lapValid = true;
      e.lapTrace = new Float32Array(Math.ceil(N / 10));
      if (this.mode === 'race' && this.racing && e.finishedAt == null && (e.lap > this.laps || this.leaderFinished)) {
        if (this.pitRule === 'required' && (e.stops === 0 || (e.used.size < 2 && !this.everWet))) { e.penalty += 20; e.noStop = true; }
        e.finLaps = e.lap - 1;
        e.finishedAt = tCross + e.penalty;
        this.leaderFinished = true;
        this.finishOrder.push(e);
        if (e.isPlayer) { this.events.push({ t: this.time, type: 'finish', text: 'CHEQUERED FLAG' }); }
        if (!e.ai && e.isPlayer) {
          // let the AI bring the player car home on the cool-down lap
          e.ai = new AIDriver(e, this, { skill: 0.9, aggression: 0, consistency: 1 });
        }
      }
      if (this.mode === 'race' && this.racing && e.lap === 2 && !this.drsEnabled) {
        this.drsEnabled = true;
        this.events.push({ t: this.time, type: 'radio', text: 'DRS ENABLED' });
      }
      if (e.finishedAt == null) this.strategy(e);
    }
    // sectors
    if (e.lapStart != null) {
      if (e.sectorIdx === 0 && prevIdx < T.sectors[1] && e.idx >= T.sectors[1] && e.idx - prevIdx < 50) this.closeSector(e, 0);
      if (e.sectorIdx === 1 && prevIdx < T.sectors[2] && e.idx >= T.sectors[2] && e.idx - prevIdx < 50) this.closeSector(e, 1);
      if (e.lapTrace) {
        const k = Math.floor(e.idx / 10);
        if (k < e.lapTrace.length && !e.lapTrace[k]) e.lapTrace[k] = this.time - e.lapStart;
      }
    }
    // DRS detection
    for (const z of T.drs) {
      if (prevIdx < z.detect && e.idx >= z.detect && e.idx - prevIdx < 50) {
        e.drsAvail = false;
        if (this.mode === 'trial') e.drsAvail = true;
        else if (this.drsEnabled && this.racing && e.interval > 0 && e.interval < 1.0 && e.pos > 1) e.drsAvail = true;
        e.drsArmedFor = z.start;
        // tell the HUD why: the gap to the car ahead at the detection line
        e.drsNote = { t: this.time, ok: e.drsAvail, gap: e.pos > 1 ? e.interval : null, enabled: this.drsEnabled && this.racing };
      }
      if (prevIdx < z.end && e.idx >= z.end && e.idx - prevIdx < 50) e.drsAvail = false;
    }
    // gap checkpoints
    const cpPrev = Math.floor(prevIdx / this.cpEvery), cpNow = Math.floor(e.idx / this.cpEvery);
    if (cpNow !== cpPrev && e.idx - prevIdx < 50 && e.idx - prevIdx > -N / 2) {
      const key = e.lap * 1000 + cpNow;
      if (!this.leaderCP.has(key)) this.leaderCP.set(key, this.time);
      e.gap = this.time - this.leaderCP.get(key);
      e.cpKey = key;
      e.cpTime = this.time;
    }
    e.dist = e.lap * T.length + e.s;
  }

  closeSector(e, k) {
    const now = k === 2 && this.tCross ? this.tCross : this.time;
    const st = now - e.sectorStart;
    e.curSectors[k] = st;
    if (e.lapValid && (e.bestSectors[k] == null || st < e.bestSectors[k])) e.bestSectors[k] = st;
    if (e.lapValid && (this.bestSectors?.[k] == null || st < this.bestSectors[k])) {
      this.bestSectors = this.bestSectors || [null, null, null];
      this.bestSectors[k] = st;
    }
    e.sectorStart = this.time;
    e.sectorIdx = k + 1;
  }

  updatePositions() {
    const es = this.entries.slice();
    es.sort((a, b) => {
      // classified on laps completed, then on time including penalties
      if (a.finishedAt != null && b.finishedAt != null) return (b.finLaps ?? 0) - (a.finLaps ?? 0) || a.finishedAt - b.finishedAt;
      if (a.finishedAt != null) return -1;
      if (b.finishedAt != null) return 1;
      return b.dist - a.dist;
    });
    let prev = null;
    es.forEach((e, k) => {
      const old = e.pos;
      e.pos = k + 1;
      if (this.racing && old > e.pos && this.time - this.raceStart > 3) e.overtakes++;
      e.interval = prev ? Math.max(0, e.gap - prev.gap) : 0;
      if (prev && e.gap === 0) e.interval = (prev.dist - e.dist) / Math.max(10, e.body.speed());
      prev = e;
    });
    this.order = es;
    if (this.mode === 'race' && this.state === 'racing' && this.finishOrder.length > 0) {
      const allDone = this.entries.every((e) => e.finishedAt != null || (this.time - this.finishOrder[0].finishedAt > 90));
      if (allDone && this.state !== 'finished') {
        this.state = 'finished';
        for (const e of this.entries) if (e.finishedAt == null) { e.finishedAt = 1e9; e.dnf = true; }
      }
    }
  }
}
