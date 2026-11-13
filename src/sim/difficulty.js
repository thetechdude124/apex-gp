// What AI difficulty means. One slider (0..110) drives several human-like traits, so a lower
// level is a less skilled DRIVER rather than a slower car:
//   commitment   how much of the grip they dare use in corners that are actually hard
//                (easy flat-out kinks stay flat for everyone, see computeProfile)
//   braking      how late / hard they brake (low levels brake early and gently)
//   aggression   how readily they attack, dive for the inside and defend
//   consistency  how often they overcook a corner; lap-to-lap pace variation
//   racecraft    slipstream use, late-braking when attacking, smart ERS, tight wheel-to-wheel
//   reactions    time to get away when the lights go out
// teamPace 1..10 and driverIdx 0/1 add the usual pecking order on top.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function aiParams(diff, teamPace = 1, driverIdx = 0, rnd = Math.random) {
  const d = clamp(diff, 0, 100) / 100;
  const extra = Math.max(0, diff - 100) * 0.0012;
  const car = (teamPace - 1) * 0.0034 + driverIdx * 0.0013;      // field spread
  const skill = clamp(0.44 + 0.56 * Math.pow(d, 0.85) + extra - car + (rnd() - 0.5) * 0.004, 0.4, 1.012);
  return {
    skill,                                                         // commitment (grip use in hard corners)
    brake: clamp(0.34 + 0.66 * d - car * 0.5, 0.3, 1),            // braking effort
    aggression: clamp(0.12 + 0.66 * d + (rnd() - 0.5) * 0.3, 0.05, 1),
    consistency: clamp(0.90 + 0.095 * d + (rnd() - 0.5) * 0.01, 0.88, 0.998),
    racecraft: clamp(d + (rnd() - 0.5) * 0.2, 0, 1),
    startDelay: 0.14 + (1 - d) * 0.45 + rnd() * 0.2,
  };
}
