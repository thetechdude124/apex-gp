// Online rooms: who is in the room, the shared clock, starting a race together and keeping the
// cars in step during it.
//
// How a race is shared: every car is simulated on exactly one machine. Each player's machine
// drives that player's own car (so the controls answer instantly, whatever the connection), the
// host's machine also drives the AI cars. Thirty times a second every machine sends where its cars
// are; everyone else shows them from that (Race.netState / Race.remoteStep). Lap times, pit stops
// and the finish are reported by the car's owner twice a second (Race.netTiming).
import { vehicleId, SETUPS } from '../sim/vehicles.js';
import { hostRoom, joinRoom, newCode, cleanCode, supported } from './link.js';

export { cleanCode, supported };
export const PROTO = 2;   // players on different versions of the game cannot share a room
export const MAX_PLAYERS = 12;
const REC = 36;           // bytes per car in a position packet
const CODES = ['S', 'M', 'H', 'W'];
const PHASES = ['in', 'stop', 'out'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d = null) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const hex = (v, d) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);

// Everything that arrives from another machine is treated as untrusted text: names end up in the
// page, so they are cut down to plain characters here.
export function cleanProfile(p) {
  p = p || {};
  const name = String(p.name || '').replace(/[^\p{L}\p{N} .'_-]/gu, '').trim().slice(0, 24) || 'Driver';
  const short = String(p.short || '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3).toUpperCase() || name.slice(0, 3).toUpperCase();
  const car = p.car || {};
  return { name, short, vehicle: vehicleId(p.vehicle), downforce: Object.hasOwn(SETUPS, p.downforce) ? p.downforce : 'balanced', team: clamp(Math.round(num(p.team, 0)), 0, 9),
    car: { custom: !!car.custom, color: hex(car.color, '#d01818'), color2: hex(car.color2, '#ffffff'), number: clamp(Math.round(num(car.number, 0)), 0, 99) } };
}

// a player who has not typed a name gets a numbered one, so the timing screens can tell people apart
const named = (p, id) => (p.name === 'Driver' || p.name === 'You' ? { ...p, name: `Driver ${id + 1}`, short: `D${id + 1}`.slice(0, 3) } : p);

export class Net {
  constructor() {
    this.on = {}; // lobby(), go(msg), end(), closed(why), say(text)
    this.reset();
  }

  reset() {
    this.role = null;      // null | 'host' | 'client'
    this.code = '';
    this.id = 0;           // my player id (the host is 0)
    this.players = [];     // { id, name, short, team, car, host, waiting, ping }
    this.cfg = null;       // room settings, chosen by the host
    this.links = new Map();
    this.link = null; this.room = null;
    this.offset = 0; this.samples = []; this.ping = 0; this.synced = false;
    this.seq = 0; this.inRace = false; this.race = null; this.go = null;
    this.pendingGo = null; this.pendingLights = null;
    clearInterval(this.pingTimer); clearInterval(this.lobbyTimer); clearTimeout(this.lightsTimer);
  }

  get active() { return !!this.role; }
  get isHost() { return this.role === 'host'; }
  get me() { return this.players.find((p) => p.id === this.id) || null; }
  // the room's clock: seconds, the same on every machine
  now() { return performance.now() / 1000 + this.offset; }

  // ------------------------------------------------------------------ rooms
  async host(profile, cfg, code) {
    this.leave();
    const room = await hostRoom(cleanCode(code) || newCode(), (link) => this._accept(link));
    this.room = room; this.code = room.code; this.role = 'host'; this.id = 0; this.nextId = 1; this.synced = true;
    this.players = [{ id: 0, ...named(cleanProfile(profile), 0), host: true, waiting: false, ping: 0 }];
    this.cfg = cfg;
    this.lobbyTimer = setInterval(() => { if (!this.inRace) this._broadcastLobby(); }, 3000); // keeps the ping column fresh
    this.on.lobby?.();
  }

  async join(code, profile) {
    this.leave();
    code = cleanCode(code);
    const link = await joinRoom(code);
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => { link.close(); fail(new Error('timeout')); }, 10000);
      link.onclose = () => { clearTimeout(timer); fail(new Error('blocked')); };
      link.onmsg = (m) => {
        if (m.t === 'deny') { clearTimeout(timer); link.onclose = null; link.close(); fail(new Error(m.why === 'version' ? 'version' : m.why === 'full' ? 'full' : 'blocked')); return; }
        if (m.t !== 'welcome') return;
        clearTimeout(timer);
        this.role = 'client'; this.code = code; this.id = m.id; this.link = link;
        link.onmsg = (x) => this._fromHost(x);
        link.onfast = (buf) => this._fastIn(buf, 0);
        link.onclose = () => { const was = this.active; this.reset(); if (was) this.on.closed?.('The host left, or the connection was lost.'); };
        let n = 0;
        const ping = this._ping = () => { link.send({ t: 'ping', c: performance.now() }); if (++n === 8) { clearInterval(this.pingTimer); this.pingTimer = setInterval(ping, 2000); } };
        this.pingTimer = setInterval(ping, 400); ping();
        ok();
      };
      link.send({ t: 'hello', v: PROTO, p: cleanProfile(profile) });
    });
  }

  leave() {
    if (!this.role) return;
    const links = this.isHost ? this.links.values() : [this.link];
    for (const link of links) {
      if (!link) continue;
      link.onclose = link.onmsg = link.onfast = null;
      link.send({ t: this.isHost ? 'closed' : 'bye' });
      setTimeout(() => link.close(), 300);
    }
    this.room?.close();
    this.reset();
    this.on.lobby?.();
  }

  setProfile(profile) {
    if (!this.role) return;
    const p = cleanProfile(profile);
    if (this.isHost) { Object.assign(this.players[0], named(p, 0)); this._changed(); } else this.link.send({ t: 'me', p });
  }

  setCfg(patch) { if (this.isHost) { Object.assign(this.cfg, patch); this._changed(); } }

  _broadcast(m, racersOnly = false) {
    for (const p of this.players) { if (p.id === 0 || (racersOnly && p.waiting)) continue; this.links.get(p.id)?.send(m); }
  }
  _broadcastLobby() { this._broadcast({ t: 'lobby', players: this.players, cfg: this.cfg, racing: this.inRace }); }
  _changed() { if (this.isHost) this._broadcastLobby(); this.on.lobby?.(); }

  // ------------------------------------------------------------------ host: one connected player
  _accept(link) {
    let p = null;
    const kick = setTimeout(() => { if (!p) link.close(); }, 8000);
    link.onmsg = (m) => {
      if (!m || typeof m !== 'object') return;
      if (!p) {
        if (m.t !== 'hello') return;
        clearTimeout(kick);
        const deny = (why) => { link.send({ t: 'deny', why }); setTimeout(() => link.close(), 500); };
        if (m.v !== PROTO) return deny('version');
        if (this.players.length >= MAX_PLAYERS) return deny('full');
        p = { id: this.nextId, ...named(cleanProfile(m.p), this.nextId++), host: false, waiting: this.inRace, ping: 0 };
        link.id = p.id; this.links.set(p.id, link); this.players.push(p);
        link.send({ t: 'welcome', id: p.id });
        this.on.say?.(`${p.name.toUpperCase()} JOINED`);
        this._changed();
        return;
      }
      if (m.t === 'ping') link.send({ t: 'pong', c: m.c, h: this.now() });
      else if (m.t === 'rtt') p.ping = clamp(Math.round(num(m.ms, 0)), 0, 9999);
      else if (m.t === 'me') { Object.assign(p, named(cleanProfile(m.p), p.id)); this._changed(); }
      else if (m.t === 'ready') { if (m.seq === this.seq) { p.ready = true; this._maybeLights(); } }
      else if (m.t === 'slow') this._slowIn(m, p.id);
      else if (m.t === 'bye') link.close();
    };
    link.onfast = (buf) => { if (p) this._fastIn(buf, p.id); };
    link.onclose = () => {
      clearTimeout(kick);
      if (!p || !this.players.includes(p)) return;
      this.players = this.players.filter((x) => x !== p); this.links.delete(p.id);
      // a car left without its driver is taken over by the host's AI
      if (this.race) this.race.entries.forEach((e, i) => { if (this.owner[i] === p.id) { this.owner[i] = 0; this.race.takeOver(e, this.go.takeover); } });
      this.on.say?.(this.inRace && !p.waiting ? `${p.name.toUpperCase()} LEFT · AI TAKES OVER` : `${p.name.toUpperCase()} LEFT`);
      this._changed();
      this._maybeLights();
    };
  }

  // ------------------------------------------------------------------ client: messages from the host
  _fromHost(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'pong') {
      const t = performance.now(), rtt = t - m.c;
      this.samples.push({ rtt, off: num(m.h, 0) + rtt / 2000 - t / 1000 });
      if (this.samples.length > 10) this.samples.shift();
      const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a)); // the quickest round trip is the cleanest measurement
      this.offset = best.off; this.ping = best.rtt;
      if (!this.synced) { this.synced = true; if (this.pendingGo) { const g = this.pendingGo; this.pendingGo = null; this._go(g); } }
      if (this.samples.length % 4 === 0) this.link.send({ t: 'rtt', ms: best.rtt });
    } else if (m.t === 'lobby') {
      const before = this.players;
      this.players = (Array.isArray(m.players) ? m.players : []).slice(0, MAX_PLAYERS).map((p) => ({ id: num(p.id, -1), ...cleanProfile(p), host: p.id === 0, waiting: !!p.waiting, ping: num(p.ping, 0) }));
      this.cfg = m.cfg && typeof m.cfg === 'object' ? m.cfg : this.cfg;
      this.hostRacing = !!m.racing;
      if (this.race) for (const p of before) if (!this.players.some((x) => x.id === p.id) && !p.waiting) {
        this.race.entries.forEach((e, i) => { if (this.owner[i] === p.id) { this.owner[i] = 0; e.friend = false; } }); // the host's AI has that car now
        this.on.say?.(`${p.name.toUpperCase()} LEFT · AI TAKES OVER`);
      }
      this.on.lobby?.();
    } else if (m.t === 'go') { if (this.synced) this._go(m); else this.pendingGo = m; }
    else if (m.t === 'lights') { if (this.race && m.seq === this.seq) this.race.startAt(num(m.at, 0), num(m.out, 6)); else this.pendingLights = m; }
    else if (m.t === 'slow') this._slowIn(m, 0);
    else if (m.t === 'end') { this.inRace = false; this.race = null; this.go = null; this.on.end?.(); }
    else if (m.t === 'closed') { const l = this.link; l.onclose = null; l.close(); this.reset(); this.on.closed?.('The host closed the room.'); }
  }

  // ------------------------------------------------------------------ race start
  // host: go = { track, laps, wx, changeAt, pits, limits, time, grid: [{ o: owner id, ai, team, seat, ... }], takeover }
  startRace(go) {
    if (!this.isHost || this.inRace) return;
    this.seq++;
    for (const p of this.players) { p.waiting = false; p.ready = false; }
    const msg = { t: 'go', seq: this.seq, tGo: this.now(), ...go };
    this.inRace = true;
    this._broadcast(msg);
    this._broadcastLobby();
    this._go(msg);
    // if somebody's machine is still loading after a quarter of a minute, start without waiting
    clearTimeout(this.lightsTimer);
    this.lightsTimer = setTimeout(() => this._maybeLights(true), 15000);
  }

  _go(m) {
    this.seq = m.seq; this.go = m; this.inRace = true; this.race = null; this.pendingLights = null;
    this.owner = m.grid.map((g) => num(g.o, 0));
    this.on.go?.(m);
  }

  // the race clock for this event: seconds since the host sent the start message
  clock() { const t0 = this.go.tGo; return () => this.now() - t0; }

  // main.js calls this when its Race for the event is built and on screen
  attach(race) {
    this.race = race;
    const n = race.entries.length;
    this.latest = new Array(n).fill(null); this.latestT = new Float64Array(n).fill(-1);
    this.slow = new Array(n).fill(null); this.kin = new Array(n).fill(null);
    this.fastT = 0; this.slowT = 0;
    if (this.isHost) { this.players[0].ready = true; this._maybeLights(); }
    else {
      this.link.send({ t: 'ready', seq: this.seq });
      const l = this.pendingLights;
      if (l && l.seq === this.seq) race.startAt(num(l.at, 0), num(l.out, 6));
    }
  }

  _maybeLights(force = false) {
    if (!this.isHost || !this.inRace || !this.race || this.race.lightsAt != null) return;
    if (!force && !this.players.every((p) => p.waiting || p.ready)) return;
    clearTimeout(this.lightsTimer);
    const at = this.clock()() + 3.2, out = 5.4 + Math.random() * 2.2;
    this._broadcast({ t: 'lights', seq: this.seq, at, out }, true);
    this.race.startAt(at, out);
  }

  // host: everyone goes back to the room
  endRace() {
    if (!this.isHost || !this.inRace) return;
    this.inRace = false; this.race = null; this.go = null;
    clearTimeout(this.lightsTimer);
    for (const p of this.players) p.waiting = false;
    this._broadcast({ t: 'end' });
    this._changed();
    this.on.end?.();
  }

  // ------------------------------------------------------------------ during the race
  frame(dt) {
    const race = this.race;
    if (!race) return;
    this.fastT += dt; this.slowT += dt;
    if (this.fastT >= 1 / 30) { this.fastT = Math.min(this.fastT - 1 / 30, 1 / 30); this._sendFast(); }
    if (this.slowT >= 0.5) { this.slowT = 0; this._sendSlow(); }
  }

  _sendFast() {
    const race = this.race, es = race.entries;
    for (let i = 0; i < es.length; i++) {
      if (es[i].remote) continue;
      const rec = this.latest[i] || (this.latest[i] = new Uint8Array(REC));
      this._pack(es[i], i, new DataView(rec.buffer));
      this.latestT[i] = race.time;
    }
    const head = this.seq & 255;
    if (!this.isHost) {
      const mine = []; for (let i = 0; i < es.length; i++) if (!es[i].remote && this.latest[i]) mine.push(i);
      const out = new Uint8Array(1 + mine.length * REC); out[0] = head;
      mine.forEach((i, k) => out.set(this.latest[i], 1 + k * REC));
      this.link.fast(out.buffer);
      return;
    }
    for (const p of this.players) {
      if (p.id === 0 || p.waiting) continue;
      const link = this.links.get(p.id); if (!link) continue;
      const out = new Uint8Array(1 + es.length * REC); out[0] = head;
      let k = 0;
      for (let i = 0; i < es.length; i++) if (this.owner[i] !== p.id && this.latest[i]) out.set(this.latest[i], 1 + REC * k++);
      link.fast(out.buffer.slice(0, 1 + REC * k));
    }
  }

  _pack(e, i, dv) {
    const race = this.race, b = e.body, p = e.pit, inp = e.input || {};
    const c = Math.cos(b.psi), s = Math.sin(b.psi), wx = b.vx * c - b.vy * s, wy = b.vx * s + b.vy * c;
    // acceleration over the ground, from the change in velocity since the last sample
    const kin = this.kin[i] || (this.kin[i] = { wx, wy, t: race.time, ax: 0, ay: 0, X: b.X, Y: b.Y });
    const d = race.time - kin.t;
    if (Math.hypot(b.X - kin.X, b.Y - kin.Y) > 6) { kin.ax = kin.ay = 0; } // the car was moved (reset to track)
    else if (d > 1e-3) { kin.ax += (clamp((wx - kin.wx) / d, -60, 60) - kin.ax) * 0.7; kin.ay += (clamp((wy - kin.wy) / d, -60, 60) - kin.ay) * 0.7; }
    kin.wx = wx; kin.wy = wy; kin.t = race.time; kin.X = b.X; kin.Y = b.Y;
    const cmp = Math.max(0, CODES.indexOf(b.compound));
    dv.setUint8(0, i);
    dv.setUint8(1, (b.drsOpen ? 1 : 0) | (b.lockF ? 2 : 0) | (b.spinR ? 4 : 0) | (b.harvest > 0.2 ? 8 : 0) | (b.deploying ? 16 : 0) | (cmp << 5) | (p ? 128 : 0));
    dv.setUint8(2, p ? Math.max(0, PHASES.indexOf(p.phase)) | (p.stop ? 4 : 0) | (p.serviced ? 8 : 0) | (Math.max(0, CODES.indexOf(p.to)) << 4) | (e.ghost > 0 ? 64 : 0) : (e.ghost > 0 ? 64 : 0));
    dv.setUint8(3, clamp(e.lap, 0, 255));
    dv.setFloat32(4, race.time, true); dv.setFloat32(8, b.X, true); dv.setFloat32(12, b.Y, true);
    dv.setInt16(16, Math.round(Math.atan2(s, c) * 1e4), true);
    dv.setInt16(18, clamp(Math.round(wx * 100), -32767, 32767), true); dv.setInt16(20, clamp(Math.round(wy * 100), -32767, 32767), true);
    dv.setInt16(22, clamp(Math.round(b.r * 2000), -32767, 32767), true);
    dv.setInt8(24, clamp(Math.round(kin.ax * 2), -127, 127)); dv.setInt8(25, clamp(Math.round(kin.ay * 2), -127, 127));
    dv.setInt8(26, clamp(Math.round(b.delta * 300), -127, 127));
    dv.setUint8(27, clamp(Math.round(b.rpm / 60), 0, 255));
    dv.setUint8(28, clamp(b.gear | 0, 0, 15) | (Math.round(clamp(inp.throttle || 0, 0, 1) * 15) << 4));
    dv.setUint8(29, Math.round(clamp(inp.brake || 0, 0, 1) * 15) | (Math.round(clamp(b.slideF || 0, 0, 1) * 3) << 4) | (Math.round(clamp(b.slideR || 0, 0, 1) * 3) << 6));
    dv.setUint16(30, clamp(e.idx, 0, 65535), true);
    dv.setUint8(32, p ? clamp(Math.round(p.stopT * 20), 0, 255) : 0); dv.setUint8(33, p ? clamp(Math.round(p.dur * 20), 0, 255) : 0);
    dv.setUint8(34, Math.round(clamp(b.tyreWear || 0, 0, 1) * 255));
    dv.setUint8(35, 0);
  }

  _fastIn(buf, from) {
    const race = this.race;
    if (!race || buf.byteLength < 1 + REC) return;
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    if (u8[0] !== (this.seq & 255)) return; // from the previous race
    for (let o = 1; o + REC <= u8.length; o += REC) {
      const i = u8[o], e = race.entries[i];
      if (!e || !e.remote) continue;
      if (this.isHost && this.owner[i] !== from) continue; // a player only speaks for their own car
      const t = dv.getFloat32(o + 4, true);
      if (!(t > this.latestT[i])) continue;
      const f1 = u8[o + 1], f2 = u8[o + 2], g = u8[o + 28], h = u8[o + 29];
      const X = dv.getFloat32(o + 8, true), Y = dv.getFloat32(o + 12, true);
      if (!Number.isFinite(X) || !Number.isFinite(Y) || !Number.isFinite(t)) continue;
      this.latestT[i] = t;
      race.netState(e, {
        t, X, Y, psi: dv.getInt16(o + 16, true) / 1e4, wx: dv.getInt16(o + 18, true) / 100, wy: dv.getInt16(o + 20, true) / 100,
        r: dv.getInt16(o + 22, true) / 2000, ax: dv.getInt8(o + 24) / 2, ay: dv.getInt8(o + 25) / 2, delta: dv.getInt8(o + 26) / 300,
        rpm: u8[o + 27] * 60, gear: g & 15, input: { throttle: (g >> 4) / 15, brake: (h & 15) / 15, steer: 0 },
        slideF: ((h >> 4) & 3) / 3, slideR: ((h >> 6) & 3) / 3,
        drs: !!(f1 & 1), lockF: !!(f1 & 2), spinR: !!(f1 & 4), harvest: !!(f1 & 8), deploying: !!(f1 & 16), compound: CODES[(f1 >> 5) & 3],
        pit: f1 & 128 ? { phase: PHASES[Math.min(2, f2 & 3)], stop: !!(f2 & 4), serviced: !!(f2 & 8), to: CODES[(f2 >> 4) & 3], stopT: u8[o + 32] / 20, dur: Math.max(0.5, u8[o + 33] / 20) } : null,
        ghost: !!(f2 & 64), lap: u8[o + 3], idx: Math.min(race.T.N - 1, dv.getUint16(o + 30, true)), wear: u8[o + 34] / 255,
      });
      if (this.isHost) (this.latest[i] || (this.latest[i] = new Uint8Array(REC))).set(u8.subarray(o, o + REC)); // passed on to the other players
    }
  }

  _sendSlow() {
    const race = this.race, es = race.entries;
    for (let i = 0; i < es.length; i++) if (!es[i].remote) this.slow[i] = race.timingOf(es[i]);
    if (!this.isHost) { this.link.send({ t: 'slow', seq: this.seq, cars: this.slow.filter((r, i) => r && !es[i].remote) }); return; }
    for (const p of this.players) {
      if (p.id === 0 || p.waiting) continue;
      this.links.get(p.id)?.send({ t: 'slow', seq: this.seq, cars: this.slow.filter((r, i) => r && this.owner[i] !== p.id) });
    }
  }

  _slowIn(m, from) {
    const race = this.race;
    if (!race || m.seq !== this.seq || !Array.isArray(m.cars)) return;
    for (const r of m.cars) {
      const i = num(r?.i, -1), e = race.entries[i];
      if (!e || !e.remote) continue;
      if (this.isHost && this.owner[i] !== from) continue;
      const rec = { i, ll: num(r.ll), bl: num(r.bl), st: clamp(num(r.st, 0), 0, 99), pn: clamp(num(r.pn, 0), 0, 999), pr: r.pr ? 1 : 0,
        u: String(r.u || '').replace(/[^SMHW]/g, '').slice(0, 4), fa: num(r.fa), fl: num(r.fl, 0), fc: num(r.fc, 0), ns: r.ns ? 1 : 0, dsq: !!r.dsq, dt: clamp(Math.round(num(r.dt, 0)), 0, 3), dnf: r.dnf ? 1 : 0 };
      race.netTiming(e, rec);
      if (this.isHost) this.slow[i] = rec;
    }
  }
}
