// Shared between the game and the headless tests: turns raw digital/analog controls into
// smooth pedal + steering commands for the car.
import { steerCommand } from './sim/physics.js';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// held-key wind-up: initial rate x lead (falling to lead - leadFast by ~300 km/h), final rate x tail
export const RAMP = { lead: 1.75, leadFast: 0.5, tail: 0.3 };

export class InputFilter {
  constructor() { this.throttle = 0; this.brake = 0; this.wheel = 0; this.speed = 1; }
  // raw: {thr 0..1, brk 0..1, steer -1..1, analog bool}
  update(dt, raw, body, assist = true) {
    const v = body.speed();
    if (raw.analog) {
      this.throttle = raw.thr; this.brake = raw.brk;
      this.wheel += (raw.steer - this.wheel) * Math.min(1, dt * 16);
    } else {
      this.throttle += clamp(raw.thr - this.throttle, -dt * 9, dt * 4.5);
      this.brake += clamp(raw.brk - this.brake, -dt * 9, dt * 6);
      // "Steering rate": a held key winds the wheel from centre to full at a constant, LINEAR rate
      // (0.16 s when slow, ~0.45 s at 300 km/h). Because the wheel position maps linearly to
      // cornering force, a short tap is a small proportional turn and a hold builds evenly.
      // It is front-loaded: the first part of the travel comes quickly (the car answers the moment
      // you touch the key), the last part slowly (it settles into the corner instead of the
      // rotation arriving late). Less front-loading at very high speed keeps taps gentle.
      const base = this.speed / (0.16 + v / 290);
      const lead = RAMP.lead - RAMP.leadFast * clamp((v - 30) / 55, 0, 1);
      const on = base * (lead - (lead - RAMP.tail) * Math.abs(this.wheel));
      const off = this.speed / 0.13;
      const opposite = raw.steer !== 0 && this.wheel !== 0 && Math.sign(raw.steer) !== Math.sign(this.wheel);
      const rate = raw.steer === 0 || opposite ? off : on;
      this.wheel += clamp(raw.steer - this.wheel, -dt * rate, dt * rate);
    }
    return { throttle: this.throttle, brake: this.brake, steer: steerCommand(body, this.wheel, assist) };
  }
}
