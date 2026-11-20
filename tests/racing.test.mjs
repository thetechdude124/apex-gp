import test from 'node:test';
import assert from 'node:assert/strict';
import { CarBody, SURF, DIFF_DEFAULT, computeProfile } from '../src/sim/physics.js';
import { Race } from '../src/sim/race.js';
import { TRACKS } from '../src/sim/tracks.js';
import { buildTrack } from '../src/sim/trackgen.js';
import { carParams, VEHICLES, rivalVehicle, roomVehicle } from '../src/sim/vehicles.js';
import { raceWindow } from '../src/play-hours.js';
import { takeSnapshot, restoreSnapshot } from '../src/sim/snapshot.js';
import { cleanProfile } from '../src/net/session.js';
import { cfg } from '../src/options.js';
import { prefs } from '../src/prefs.js';

const T = buildTrack(TRACKS[0]);

test('open lobbies keep every requested chassis and class locks preserve eligible models', () => {
  for (const host of Object.keys(VEHICLES)) {
    for (const guest of Object.keys(VEHICLES)) {
      assert.equal(roomVehicle(guest, host, 'mixed'), guest);
      const sameClass = VEHICLES[guest].classId === VEHICLES[host].classId;
      assert.equal(roomVehicle(guest, host, 'single'), sameClass ? guest : host);
    }
  }
});

test('race weekends open and close at 4 p.m. Eastern, including both clock-change weekends', () => {
  for (const [friday, sunday] of [
    ['2026-11-20T21:00Z', '2026-11-22T21:00Z'],
    ['2026-07-17T20:00Z', '2026-07-19T20:00Z'],
    ['2026-03-06T21:00Z', '2026-03-08T20:00Z'],
    ['2026-10-30T20:00Z', '2026-11-01T21:00Z'],
  ]) {
    const start = Date.parse(friday), end = Date.parse(sunday);
    assert.deepEqual(raceWindow(start - 1), { open: false, boundary: start });
    assert.deepEqual(raceWindow(start), { open: true, boundary: end });
    assert.deepEqual(raceWindow(end - 1), { open: true, boundary: end });
    assert.equal(raceWindow(end).open, false);
  }
  assert.deepEqual(raceWindow(Date.parse('2026-11-18T04:00Z')), {
    open: false, boundary: Date.parse('2026-11-20T21:00Z'),
  });
});

const idle = { throttle: 0, brake: 0, steer: 0 };
const gas = { ...idle, throttle: 1 };
function raceWith(opts = {}) {
  return new Race(T, { mode: 'race', laps: 5, pits: 'off', grid: [{ isPlayer: true, team: 'Test' }], ...opts });
}
function runLights(r) {
  r.start();
  while (!r.racing) r.update(1 / 60, idle);
}
function jumpOnFive(r) {
  r.start();
  while (r.lightsOn < 5) r.update(1 / 60, idle);
  while (!r.racing) r.update(1 / 60, gas);
}

test('the first post-lights press launches a stationary car and records its reaction', () => {
  const r = raceWith(), e = r.player;
  runLights(r);
  r.update(1 / 30, idle);
  assert.equal(e.body.speed(), 0);
  r.update(1 / 30, { ...gas, reaction: 0.218 });
  assert.equal(e.reaction, 0.218);
  assert.ok(e.body.speed() > 0);
  assert.equal(e.driveThroughDue, 0);
});

test('a stationary pole sitter keeps the lead until a rival actually passes', () => {
  const r = raceWith({ grid: [{ isPlayer: true }, { vehicle: 'f1', startDelay: 0, skill: 1 }] });
  runLights(r);
  r.update(1 / 30, idle);
  const rival = r.entries[1];
  assert.ok(rival.body.speed() > 0);
  assert.ok(rival.s < r.player.s);
  assert.equal(r.player.pos, 1);
  for (let i = 0; i < 240 && r.player.pos === 1; i++) r.update(1 / 60, idle);
  assert.equal(r.player.pos, 2);
});

test('pressing on five reds and holding through lights-out earns one penalty and requires a fresh press', () => {
  const r = raceWith(), e = r.player;
  jumpOnFive(r);
  for (let i = 0; i < 10; i++) r.update(1 / 30, gas);
  assert.equal(e.body.speed(), 0);
  assert.equal(e.driveThroughDue, 3);
  assert.equal(r.events.filter(x => x.type === 'pen').length, 1);
  r.update(1 / 60, { ...gas, rawThrottle: 0.03 }); // filtering and trigger noise after release
  assert.equal(e.reaction, null);
  r.update(1 / 60, { ...gas, rawThrottle: 0.42 });
  assert.ok(e.body.speed() > 0);
  assert.equal(e.driveThroughDue, 3);
});

test('presses on lights one through four are free, including a hold through lights-out', () => {
  for (let light = 1; light <= 4; light++) {
    const r = raceWith();
    r.start();
    while (r.lightsOn < light) r.update(1 / 60, idle);
    while (!r.racing) r.update(1 / 60, gas);
    r.update(1 / 60, gas);
    assert.equal(r.player.driveThroughDue, 0);
    assert.equal(r.player.body.speed(), 0);
    r.update(1 / 60, idle);
    r.update(1 / 60, gas);
    assert.ok(r.player.body.speed() > 0);
    assert.equal(r.player.driveThroughDue, 0);
  }
});

test('a queued key press is judged against the lights visible at its timestamp', () => {
  const r = raceWith();
  runLights(r);
  r.update(1 / 60, { ...idle, throttlePressed: true, fiveReds: false, reaction: -1.2 });
  assert.equal(r.player.driveThroughDue, 0);
  assert.equal(r.player.launchPending, true);
  r.update(1 / 60, { ...idle, throttlePressed: true, fiveReds: true, reaction: -0.01 });
  assert.equal(r.player.driveThroughDue, 3);
  assert.equal(r.player.launchPending, true);
});

test('a brief tap counts only on five reds on the shared start clock', () => {
  const r = raceWith();
  r.startAt(0.1, 5.5);
  while (r.lightsOn < 4) r.update(1 / 60, idle);
  r.update(0.001, { ...idle, throttlePressed: true });
  assert.equal(r.player.driveThroughDue, 0);
  while (r.lightsOn < 5) r.update(1 / 60, idle);
  r.update(0.001, { ...idle, throttlePressed: true });
  assert.equal(r.player.driveThroughDue, 3);
  while (!r.racing) r.update(1 / 60, idle);
  r.update(1 / 60, gas);
  assert.ok(r.player.body.speed() > 0);
});

test('an unserved drive-through is a DSQ, never a winner or a chequered flag for other cars', () => {
  const r = raceWith({ grid: [{ isPlayer: true }, { remote: true }] });
  jumpOnFive(r);
  const e = r.player;
  e.lap = 3; e.idx = 0; e.s = 0;
  r.timing(e, T.N - 1, T.length - 1);
  r.updatePositions();
  assert.equal(e.dsq, true);
  assert.equal(r.order.at(-1), e);
  assert.equal(r.leaderFinished, undefined);
  assert.equal(r.finishOrder.length, 0);
  const other = raceWith({grid:[{remote:true}, {isPlayer:true}]});
  other.netTiming(other.entries[0], r.timingOf(e));
  assert.ok(other.entries[0].dsq);
  assert.equal(other.finishOrder.length, 0);
});

test('a final-lap drive-through follows the lane to exit and counts without tyre service', () => {
  const r = raceWith({ laps: 1 }), e = r.player, P = T.pit;
  jumpOnFive(r);
  assert.equal(e.driveThroughDue, 1);
  r.update(1 / 60, idle); r.update(1 / 60, gas);
  const entry = P.e0 + 4;
  r.place(e, entry, P.side * P.lat(entry), 30); e.lap = 1; e.pitReq = true;
  r.update(1 / 60, gas);
  assert.equal(e.pit.stop, false);
  let crossed = false;
  for (let i = 0; e.pit && i < 2400; i++) {
    r.update(1 / 60, idle);
    if (e.pit?.finishCross != null) { crossed = true; assert.ok(e.driveThroughDue); assert.equal(e.finishedAt, null); }
  }
  assert.ok(crossed);
  assert.equal(e.pit, null);
  assert.equal(e.driveThroughDue, 0);
  assert.equal(e.stops, 0);
  assert.ok(e.finishedAt > 0 && !e.dsq);
});

test('flashback restores a pending penalty and time trial keeps its rolling start', () => {
  const r = raceWith();
  jumpOnFive(r);
  const snap = takeSnapshot(r);
  r.player.driveThroughDue = 0;
  restoreSnapshot(r, snap);
  assert.equal(r.player.driveThroughDue, 3);
  const trial = raceWith({mode:'trial'});
  trial.update(1 / 60, gas);
  assert.ok(trial.player.body.speed() > 30);
  assert.equal(trial.player.launchPending, false);
  assert.equal(trial.player.driveThroughDue, 0);
});

test('old differential levels migrate once and the new zero is a real player setting', () => {
  for (let level = 1; level <= 5; level++) {
    prefs.set('cfg', {rotation:level});
    assert.equal(cfg.get('diffOpen'), (level - 1) * 25);
  }
  for (const value of [0, 1, 5, 42, 100]) {
    cfg.set('diffOpen',value);
    const r = raceWith({grid:[{isPlayer:true, setup:{diff:cfg.get('diffOpen')}}, {remote:true}]});
    assert.equal(r.player.body.diff, value);
    assert.equal(r.entries[1].body.diff, null);
  }
  prefs.set('cfg', {});
  assert.equal(cfg.get('diffOpen'), DIFF_DEFAULT);
});

test('increasing differential openness progressively reduces coast yaw damping', () => {
  const yaw = (diff) => {
    const b = new CarBody(carParams('f1', 'balanced', true));
    b.diff = diff; b.vx = 35; b.r = 0.2;
    b.step(1 / 240, idle, { front: SURF.track, rear: SURF.track });
    return b.r;
  };
  for (const value of [0, 25, 50, 75, 99]) assert.ok(yaw(value) < yaw(value + 1));
});

function straight(vehicle, setup, drs) {
  const b = new CarBody(carParams(vehicle, setup));
  b.drsOpen = drs;
  const env = {front:SURF.track, rear:SURF.track, tc:true, abs:true};
  for (let i = 0; i < 90 * 240; i++) b.step(1 / 240, gas, env);
  assert.equal(b.gear, b.p.gears.length);
  return b.speed() * 3.6;
}
test('F1 DRS raises terminal speed with matched power and clean air across all three setups', () => {
  for (const setup of ['low', 'balanced', 'high']) {
    assert.ok(straight('f1', setup, true) > straight('f1', setup, false) + 15);
  }
  assert.ok(straight('f1', 'low', false) > straight('f1', 'high', false));
  assert.ok(carParams('f1', 'high').ClA > carParams('f1', 'low').ClA);
});

test('mixed and single-class grids, AI profiles and online vehicle selection', () => {
  for (const id of Object.keys(VEHICLES)) {
    const cls = VEHICLES[id].classId;
    const rivals = Array.from({length:19}, (_, i) => rivalVehicle(i, id, true));
    const classes = [cls, ...rivals.slice(0, 3).map(id => VEHICLES[id].classId)];
    assert.equal(new Set(classes).size, 4);
    assert.equal(VEHICLES[rivalVehicle(2, id, false)].classId, cls);
    assert.equal(cleanProfile({vehicle:id,downforce:'low'}).vehicle, id);
    const p = carParams(id), e = new CarBody(p);
    e.setPose(0, 0, 0, 95);
    assert.equal(e.gear, p.gears.length);
  }
  const r = raceWith({grid:[{vehicle:'porsche',isPlayer:true}, {vehicle:'f2',skill:0.98}, {vehicle:'aston',remote:true}]});
  r.updatePositions();
  assert.deepEqual(r.entries.map(e=>e.classPos),[1,1,2]);
  assert.equal(r.player.body.p.ersCap, 0);
  assert.equal(r.player.body.p.drsCd, 0);
  assert.notEqual(r.profileFor(1,1,1,r.entries[1].body.p), r.profileFor(1,1,1,r.player.body.p));
  assert.ok(r.profileFor(1,1,1,carParams('porsche')) !== r.profileFor(1,1,1,r.player.body.p));
  assert.ok(computeProfile(T, T.rl, carParams('f1')).lap < computeProfile(T, T.rl, carParams('porsche')).lap);
});

test('DRS still needs the zone and eligibility, and braking closes the flap', () => {
  for (const vehicle of ['f1', 'f2', 'hybrid', 'porsche']) {
    const r = raceWith({mode:'trial', grid:[{isPlayer:true, vehicle}]}), e = r.player;
    const z = T.drs[0], idx = (z.start + 4) % T.N;
    r.place(e, idx * T.ds, 0, 60);
    r.update(1 / 60, {...gas, drs:true});
    assert.equal(e.body.drsOpen, false);
    e.drsAvail = true;
    r.update(1 / 60, {...gas, drs:true});
    assert.equal(e.body.drsOpen, vehicle === 'f1' || vehicle === 'f2');
    r.update(1 / 60, {...idle, brake:0.8});
    assert.equal(e.body.drsOpen, false);
  }
});

test('Imola preserves lap length, corner elevations and the main-straight DRS zone', () => {
  const track = buildTrack(TRACKS.find(t => t.id === 'imola'));
  assert.ok(Math.abs(track.length - 4909) < 0.5);
  const height = metres => track.h[Math.round(metres / track.ds)];
  assert.ok(Math.abs(height(2325) - height(2740) - 21.09) < 0.6);
  assert.ok(Math.abs(height(3360) - height(2740) - 18.90) < 0.6);
  assert.ok(Math.abs(Math.min(...track.grade) + 0.091) < 0.002);
  assert.ok(Math.abs(Math.max(...track.grade) - 0.0938) < 0.002);
  assert.equal(track.drs.length, 1);
  assert.ok(track.drs[0].start > track.drs[0].end);
});

test('Spa-Francorchamps preserves 7.004 km scale, 102 m elevation, multi-type kerbs, banking, dual DRS and clean pit lane', () => {
  const spa = buildTrack(TRACKS.find(t => t.id === 'spa'));
  assert.ok(Math.abs(spa.length - 7004) < 0.5);
  const height = metres => spa.h[Math.round(metres / spa.ds) % spa.N];
  const elevSpan = Math.max(...spa.h) - Math.min(...spa.h);
  assert.ok(elevSpan > 100 && elevSpan < 104, `expected ~102 m elevation span, got ${elevSpan.toFixed(2)}`);
  assert.ok(height(1195) - height(898) > 36, 'Raidillon climbs sharply out of Eau Rouge');
  assert.ok(height(2535) > height(4985) + 99, 'Malmedy sits ~102 m above Stavelot');
  assert.ok(Math.max(...spa.grade) > 0.16 && Math.max(...spa.grade) < 0.20, 'Raidillon peaks around 17-18% grade');
  // inside walls stay strictly inside the local curvature center (no ribbon folding at La Source / Bus Stop)
  for (let i = 0; i < spa.N; i++) {
    if (spa.kappa[i] > 0.01) assert.ok(spa.wallL[i] < 1 / spa.kappa[i] - 0.5);
    if (spa.kappa[i] < -0.01) assert.ok(spa.wallR[i] < 1 / -spa.kappa[i] - 0.5);
  }
  // dual FIA DRS zones (Kemmel Straight and wrap-around pit straight) and official sector splits
  assert.equal(spa.drs.length, 2);
  assert.ok(spa.drs[0].start < spa.drs[0].end);
  assert.ok(spa.drs[1].start > spa.drs[1].end);
  assert.ok(Math.abs(spa.sectors[1] * spa.ds - 2244) < 4);
  assert.ok(Math.abs(spa.sectors[2] * spa.ds - 5113) < 4);
  // all five kerb types present, with distinct physical bump/height response on chicane sausages and exit astroturf
  const types = new Set([...spa.kerbL, ...spa.kerbR]);
  for (const t of [1, 2, 3, 4, 5]) assert.ok(types.has(t), `missing kerb type ${t}`);
  const r = new Race(spa, { mode: 'trial', laps: 1, pits: 'off', grid: [{ isPlayer: true, vehicle: 'f1' }] });
  const w2 = spa.width / 2;
  const idxBusStop = Math.round(6610 / spa.ds);
  const idxRaidillon = Math.round(1010 / spa.ds);
  const idxPouhonExit = Math.round(4000 / spa.ds);
  assert.equal(r.surfaceAt(idxBusStop, -(w2 + 1.8)), SURF.sausage);
  assert.equal(r.surfaceAt(idxRaidillon, -(w2 + 0.9)), SURF.kerbHigh);
  assert.equal(r.surfaceAt(idxPouhonExit, -(w2 + 2.8)), SURF.astroturf);
  assert.ok(SURF.sausage.bump > SURF.kerbHigh.bump && SURF.kerbHigh.bump > SURF.kerb.bump && SURF.kerb.bump > SURF.kerbFlat.bump);
  // road banking in Pouhon tilts left (negative camber) and adds cornering speed
  const idxPouhon = Math.round(3675 / spa.ds);
  assert.ok(spa.camber[idxPouhon] < -0.04);
  assert.ok(spa.camber[idxRaidillon] > 0.04);
  // scaled pit lane fits cleanly between Bus Stop exit and La Source entry
  assert.ok(spa.pit.e0 > -320 && spa.pit.x1 < 180);
});

test('changeable weather starts partway through a one-lap race or an open time trial', () => {
  for (const mode of ['race', 'trial']) {
    const r = raceWith({ laps: 1, mode, weather: 'raining', changeAt: 0.4 });
    if (mode === 'race') runLights(r);
    r.updatePositions();
    r.weatherUpdate(0.1);
    assert.equal(r.changing, false);
    r.player.dist = 1.85 * T.length;
    r.weatherUpdate(0.1);
    assert.equal(r.changing, true);
    assert.ok(r.rain > 0);
  }
});
