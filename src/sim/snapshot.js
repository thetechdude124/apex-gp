// Whole-race snapshots for the flashback (rewind) feature and for leaving / returning from a
// replay. A snapshot copies every plain value of the race, its cars, their physics bodies and AI
// drivers; references (track, profiles, other cars) are left out and stay as they are.
const isPlain = (v) => v !== null && typeof v === 'object' && v.constructor === Object;

function cloneVal(v) {
  if (v === null || typeof v !== 'object') return v;
  if (ArrayBuffer.isView(v)) return v.slice();
  if (Array.isArray(v)) return v.map(cloneVal);
  if (v instanceof Set) return new Set(v);
  if (v instanceof Map) return new Map(v);
  if (isPlain(v)) { const o = {}; for (const k in v) { const c = cloneVal(v[k]); if (c !== SKIP) o[k] = c; } return o; }
  return SKIP; // class instances and anything else: not ours to copy
}
const SKIP = Symbol('skip');

function snap(obj, skip) {
  const o = {};
  for (const k of Object.keys(obj)) {
    if (skip.has(k)) continue;
    const c = cloneVal(obj[k]);
    if (c !== SKIP) o[k] = c;
  }
  return o;
}
function put(obj, s) { for (const k in s) { const c = cloneVal(s[k]); obj[k] = c === SKIP ? s[k] : c; } }

const RACE_SKIP = new Set(['T', 'opts', 'profiles', 'entries', 'player', 'order', 'finishOrder', 'bestBy', '_human', '_pa', '_pb', 'boxTeams', 'surf']);
const ENTRY_SKIP = new Set(['body', 'ai', 'pr', 'input', 'surfF', 'surfR', 'bF', 'bR']);
const BODY_SKIP = new Set(['p']);
const AI_SKIP = new Set(['e', 'race', 'prof', 'profLo', 'profHi', 'near', 'ahead', 'corner']);

export function takeSnapshot(race) {
  return {
    t: race.time,
    race: snap(race, RACE_SKIP),
    order: race.order ? race.order.map((e) => e.id) : null,
    finishOrder: race.finishOrder.map((e) => e.id),
    bestBy: race.bestBy ? race.bestBy.id : null,
    cars: race.entries.map((e) => ({ e: snap(e, ENTRY_SKIP), b: snap(e.body, BODY_SKIP), ai: e.ai ? snap(e.ai, AI_SKIP) : null, hadAi: !!e.ai })),
  };
}

export function restoreSnapshot(race, s) {
  put(race, s.race);
  const byId = (id) => race.entries[id];
  race.finishOrder = s.finishOrder.map(byId);
  if (s.order) race.order = s.order.map(byId);
  race.bestBy = s.bestBy != null ? byId(s.bestBy) : null;
  race.entries.forEach((e, k) => {
    const c = s.cars[k];
    // keys that did not exist at snapshot time (set later) must not linger
    for (const key of Object.keys(e)) if (!ENTRY_SKIP.has(key) && !(key in c.e)) delete e[key];
    put(e, c.e);
    put(e.body, c.b);
    if (e.ai && c.ai) { put(e.ai, c.ai); e.ai.near = []; e.ai.ahead = null; e.ai.corner = null; e.ai.gq = -1; e.ai.thinkT = 1; }
    else if (e.ai && !c.hadAi && e.isPlayer) { e.ai = null; }
    // the render pose follows the restored physics state immediately
    e.rX = e.pX = e.body.X; e.rY = e.pY = e.body.Y; e.rPsi = e.pPsi = e.body.psi; e.rH = e.pH = e.h;
    e.snap = true;
  });
}
