// Keyboard bindings: every control has up to two keys, all of them remappable (Options > Controls).
import { prefs } from './prefs.js';

export const ACTIONS = [
  ['throttle', 'Accelerate', ['KeyW', 'ArrowUp']],
  ['brake', 'Brake / reverse', ['KeyS', 'ArrowDown']],
  ['left', 'Steer left', ['KeyA', 'ArrowLeft']],
  ['right', 'Steer right', ['KeyD', 'ArrowRight']],
  ['shiftUp', 'Gear up', ['KeyE']],
  ['shiftDown', 'Gear down', ['KeyQ']],
  ['drs', 'DRS', ['Space']],
  ['ers', 'Overtake boost (ERS)', ['ShiftLeft', 'ShiftRight']],
  ['flashback', 'Flashback (rewind 10 s)', ['KeyF']],
  ['reset', 'Reset to track', ['KeyR']],
  ['camera', 'Change camera', ['KeyC']],
  ['lookBack', 'Look back', ['KeyB']],
  ['fovUp', 'Field of view wider', ['BracketRight']],
  ['fovDown', 'Field of view narrower', ['BracketLeft']],
  ['mirror', 'Mirror on / off', ['KeyV']],
  ['map', 'Track map mode', ['KeyN']],
  ['line', 'Racing line on / off', ['KeyL']],
  ['mute', 'Mute', ['KeyM']],
  ['help', 'How to play', ['KeyH']],
];
const DEFAULTS = Object.fromEntries(ACTIONS.map(([id, , keys]) => [id, keys]));
let map = load();

function load() {
  const saved = prefs.get('keys', null);
  const m = {};
  for (const [id, , keys] of ACTIONS) m[id] = saved && Array.isArray(saved[id]) ? saved[id].slice(0, 2) : keys.slice();
  return m;
}
const save = () => prefs.set('keys', map);

export const bindings = {
  keys: (id) => map[id] || [],
  held(id, down) { const k = map[id]; return !!k && ((k[0] && down.has(k[0])) || (k[1] && down.has(k[1]))); },
  hit(id, pressed) { const k = map[id]; return !!k && ((k[0] && pressed.has(k[0])) || (k[1] && pressed.has(k[1]))); },
  // assign `code` to slot 0/1 of an action; the key is taken away from any other action that had it
  set(id, slot, code) {
    if (code) for (const a of Object.keys(map)) map[a] = map[a].map((k) => (k === code ? null : k));
    const k = map[id].slice(); k[slot] = code || null;
    map[id] = [k[0] || null, k[1] || null];
    if (!map[id][0] && map[id][1]) map[id] = [map[id][1], null];
    save();
  },
  reset() { map = {}; for (const [id, , keys] of ACTIONS) map[id] = keys.slice(); save(); },
  isDefault: (id) => JSON.stringify((map[id] || []).filter(Boolean)) === JSON.stringify(DEFAULTS[id]),
  label(code) {
    if (!code) return '';
    const names = { Space: 'SPACE', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
      AltLeft: 'L-ALT', AltRight: 'R-ALT', Enter: 'ENTER', Tab: 'TAB', Backspace: 'BKSP', BracketLeft: '[', BracketRight: ']', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\' };
    if (names[code]) return names[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
    return code.toUpperCase();
  },
  // "W / ↑" style text for help screens
  text(id) { return (map[id] || []).filter(Boolean).map((k) => this.label(k)).join(' / ') || 'unbound'; },
};
