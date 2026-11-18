// Game tuning in SI units. Gear speeds are metres/second at the rev limiter.
import { CAR } from './physics.js';

export const CLASSES = { f1: 'F1', f2: 'F2', hybrid: 'Hybrid prototype', gt3: 'GT3' };
export const SETUPS = {
  low: { lift: 0.83, drag: 0.91 },
  balanced: { lift: 1, drag: 1 },
  high: { lift: 1.18, drag: 1.10 },
};

const gt3 = {
  mass: 1290, Iz: 1660, h: 0.40, ClA: 2.05, CdA: 1.19, aeroBal: 0.43,
  mu: 1.53, rearGrip: 1.07, B: 16, P: 416e3, brakeForce: 30500,
  drsCd: 0, drsCl: 0, ersP: 0, ersCap: 0, rpmMax: 8500, rpmIdle: 2900,
  gears: [23, 35, 47, 59, 71, 84],
};

export const VEHICLES = {
  f1: { name: 'Formula One', classId: 'f1', params: {} },
  f2: { name: 'Formula Two', classId: 'f2', params: {
    mass: 795, Iz: 1020, a: 1.79, b: 1.34, h: 0.32, ClA: 3.15, CdA: 1.26, mu: 1.65,
    P: 465e3, ersP: 0, ersCap: 0, drsCd: 0.23, drsCl: 0.57, brakeForce: 41500,
    rpmMax: 8750, rpmIdle: 3000, gears: [25, 39, 52, 64, 77, 92],
  } },
  hybrid: { name: 'Hybrid prototype', classId: 'hybrid', params: {
    mass: 1030, Iz: 1370, a: 1.68, b: 1.46, h: 0.32, ClA: 3.75, CdA: 1.06, mu: 1.68,
    P: 485e3, ersP: 80e3, ersCap: 3.4e6, drsCd: 0, drsCl: 0, brakeForce: 46500,
    rpmMax: 9600, rpmIdle: 3100, gears: [23, 36, 48, 59, 69, 80, 94],
  } },
  porsche: { name: 'Porsche 911 GT3 R', classId: 'gt3', params: { ...gt3, a: 1.46, b: 1.05, aeroBal: 0.40, rearGrip: 1.10 } },
  mclaren: { name: 'McLaren 720S GT3', classId: 'gt3', params: { ...gt3, a: 1.52, b: 1.18, h: 0.37, Iz: 1490, CdA: 1.15, rpmMax: 7950 } },
  ferrari: { name: 'Ferrari 296 GT3', classId: 'gt3', params: { ...gt3, a: 1.48, b: 1.23, Iz: 1450, ClA: 2.19, aeroBal: 0.45, rpmMax: 7400 } },
  aston: { name: 'Aston Martin Vantage GT3', classId: 'gt3', params: { ...gt3, a: 1.39, b: 1.32, mass: 1320, Iz: 1850, brakeBias: 0.62, P: 425e3, rpmMax: 7200 } },
};

export function vehicleId(id) { return Object.hasOwn(VEHICLES, id) ? id : 'f1'; }

export function carParams(vehicle = 'f1', setup = 'balanced', human = false) {
  const id = vehicleId(vehicle);
  const preset = Object.hasOwn(SETUPS, setup) ? setup : 'balanced';
  const p = { ...CAR, ...VEHICLES[id].params, profileKey: id + '/' + preset };
  p.L = p.a + p.b;
  p.ClA *= SETUPS[preset].lift;
  p.CdA *= SETUPS[preset].drag;
  if (human) {
    p.aeroBal += 0.01;
    p.rearGrip -= 0.03;
    p.absTurn = 0.88;
  }
  return p;
}

const gtCars = Object.keys(VEHICLES).filter((id) => VEHICLES[id].classId === 'gt3');

// Start with the other classes so even a four-car mixed race has one of each.
export function rivalVehicle(index, playerCar, mixed) {
  const ownClass = VEHICLES[vehicleId(playerCar)].classId;
  const classes = mixed ? [...Object.keys(CLASSES).filter((id) => id !== ownClass), ownClass] : [ownClass];
  const cls = classes[index % classes.length];
  if (cls !== 'gt3') return cls;
  const offset = Math.max(0, gtCars.indexOf(playerCar) + 1);
  return gtCars[(Math.floor(index / classes.length) + offset) % gtCars.length];
}
