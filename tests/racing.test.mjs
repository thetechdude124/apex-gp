import test from 'node:test';
import assert from 'node:assert/strict';
import { CarBody, SURF, DIFF_DEFAULT, computeProfile } from '../src/sim/physics.js';
import { Race } from '../src/sim/race.js';
import { TRACKS } from '../src/sim/tracks.js';
import { buildTrack } from '../src/sim/trackgen.js';
import { carParams, VEHICLES, rivalVehicle } from '../src/sim/vehicles.js';
import { takeSnapshot, restoreSnapshot } from '../src/sim/snapshot.js';
import { cleanProfile } from '../src/net/session.js';
import { cfg } from '../src/options.js';
import { prefs } from '../src/prefs.js';

const T = buildTrack(TRACKS[0]);
const idle = { throttle: 0, brake: 0, steer: 0 };
const gas = { ...idle, throttle: 1 };
function raceWith(opts = {}) {
  return new Race(T, { mode: 'race', laps: 5, pits: 'off', grid: [{ isPlayer: true, team: 'Test' }], ...opts });
}
function runLights(r, input = idle) {
  r.start();
  while (!r.racing) r.update(1 / 60, input);
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

test('holding through lights-out earns one penalty and requires release and reapplication', () => {
  const r = raceWith(), e = r.player;
  runLights(r, gas);
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

test('a brief tap during the shared light sequence counts even between physics ticks', () => {
  const r = raceWith();
  r.startAt(0.1, 5.5);
  while (r.state === 'grid') r.update(1 / 60, idle);
  r.update(0.001, { ...idle, throttlePressed: true });
  assert.equal(r.player.driveThroughDue, 3);
  while (!r.racing) r.update(1 / 60, idle);
  r.update(1 / 60, gas);
  assert.ok(r.player.body.speed() > 0);
});

test('an unserved drive-through is a DSQ, never a winner or a chequered flag for other cars', () => {
  const r = raceWith({ grid: [{ isPlayer: true }, { remote: true }] });
  runLights(r, gas);
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
  runLights(r, gas);
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
  runLights(r, gas);
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
