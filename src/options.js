// Settings. The main menu shows only the essentials; everything else lives here, in the
// Advanced overlay (race rules, assists, controls, view, car), and is remembered in this browser.
import { prefs } from './prefs.js';
import { bindings, ACTIONS } from './bindings.js';

export const CAM_FOV = { 'TV POD': 50, COCKPIT: 68, CHASE: 60, 'FAR CHASE': 60 };

const DEFAULTS = {
  // menu essentials
  mode: 'race', laps: 5, diff: 30, team: 3, grid: 'quali', weather: 'random',
  // race
  opps: 19, pits: 'required', tyres: 'M', time: '', limits: 'on',
  // assists
  tc: 'on', abs: 'on', stability: 'on', brakeAssist: 'off', line: 'on', drs: 'assist', ers: 'assist', gearbox: 'auto', steerSpeed: 100, rotation: 3,
  // view
  quality: 'high', mirror: 'on', halo: 'faded', map: 'full',
  // car
  livery: 'team', color: '#1f4fff', color2: '#ffd400', number: '',
};
export const cfg = {
  get(k) { const v = prefs.get('cfg', {})[k]; return v === undefined ? DEFAULTS[k] : v; },
  set(k, v) { prefs.set('cfg', { ...prefs.get('cfg', {}), [k]: v }); },
  reset(keys) { const c = { ...prefs.get('cfg', {}) }; for (const k of keys) delete c[k]; prefs.set('cfg', c); },
};

export const view = {
  fov(cam) { const v = prefs.get('fov', {})[cam]; return typeof v === 'number' ? v : CAM_FOV[cam] ?? 60; },
  setFov(cam, deg) { const f = { ...prefs.get('fov', {}) }; f[cam] = Math.max(35, Math.min(110, Math.round(deg))); prefs.set('fov', f); return f[cam]; },
  get halo() { return cfg.get('halo'); },
  get map() { return cfg.get('map'); },
  set map(v) { cfg.set('map', v); },
  get ers() { return cfg.get('ers'); },
};

const ONOFF = [['on', 'ON'], ['off', 'OFF']];
// [tab, key, label, type, options/range, note]
const ROWS = [
  ['race', 'opps', 'Opponents', 'range', [0, 19, 1]],
  ['race', 'pits', 'Pit stop', 'seg', [['required', 'ONE STOP'], ['off', 'NONE']], 'One stop: every driver must change tyres once, inside their pit window.'],
  ['race', 'tyres', 'Starting tyres', 'seg', [['S', 'SOFT'], ['M', 'MEDIUM'], ['H', 'HARD']], 'Soft is fastest and wears soonest; hard is slowest and lasts longest.'],
  ['race', 'limits', 'Track limits', 'seg', [['on', 'ENFORCED'], ['off', 'OFF']], 'Enforced: laps with all four wheels off the track are flagged and repeat offences cost time.'],
  ['race', 'time', 'Time of day', 'seg', [['', 'TRACK DEFAULT'], ['day', 'CLEAR'], ['sunset', 'GOLDEN HOUR'], ['overcast', 'OVERCAST']]],
  ['assists', 'line', 'Racing line', 'seg', ONOFF, 'Arrows on the road: green = flat out, yellow = lift, red = brake.'],
  ['assists', 'brakeAssist', 'Brake assist', 'seg', ONOFF, 'Slows the car for corners if you miss the braking point.'],
  ['assists', 'stability', 'Stability assist', 'seg', ONOFF, 'Catches slides before they become spins.'],
  ['assists', 'tc', 'Traction control', 'seg', ONOFF],
  ['assists', 'abs', 'Anti-lock brakes', 'seg', ONOFF],
  ['assists', 'drs', 'DRS', 'seg', [['assist', 'ASSIST (OPENS ITSELF)'], ['manual', 'MANUAL']]],
  ['assists', 'ers', 'ERS battery', 'seg', [['assist', 'ASSIST (AUTOMATIC)'], ['manual', 'MANUAL']], 'The overtake button gives full boost anywhere, in both modes.'],
  ['assists', 'gearbox', 'Gearbox', 'seg', [['auto', 'AUTOMATIC'], ['manual', 'MANUAL']]],
  ['assists', 'rotation', 'Differential', 'seg', [[1, '1 STABLE'], [2, '2'], [3, '3'], [4, '4'], [5, '5 LOOSE']], 'How readily the car rotates off the throttle and steps out on power.'],
  ['assists', 'steerSpeed', 'Steering speed', 'range', [60, 160, 5, '%']],
  ['view', 'quality', 'Graphics', 'seg', [['low', 'LOW'], ['med', 'MEDIUM'], ['high', 'ULTRA']]],
  ['view', 'mirror', 'Rear-view mirror strip', 'seg', ONOFF],
  ['view', 'halo', 'Cockpit halo', 'seg', [['solid', 'SOLID'], ['faded', 'SEE-THROUGH'], ['hidden', 'HIDDEN']]],
  ['view', 'map', 'Track map', 'seg', [['full', 'WHOLE CIRCUIT'], ['follow', 'FOLLOW (HEADING UP)'], ['off', 'OFF']]],
];
const TABS = [['race', 'RACE'], ['assists', 'DRIVING AIDS'], ['controls', 'CONTROLS'], ['view', 'VIEW'], ['car', 'MY CAR']];

export class Options {
  constructor(onChange) {
    this.el = document.getElementById('options');
    this.isOpen = false;
    this.tab = 'assists';
    this.capture = null; // { id, slot } while waiting for a key
    this.onChange = onChange || (() => {});
    this.el.addEventListener('click', (ev) => this.click(ev));
    this.el.addEventListener('input', (ev) => this.input(ev));
  }

  open(tab) { if (tab) this.tab = tab; this.isOpen = true; this.capture = null; this.el.style.display = 'flex'; this.render(); }
  close() { this.isOpen = false; this.capture = null; this.el.style.display = 'none'; this.onChange(); }

  // called for every keydown while the overlay is open
  key(code) {
    if (!this.isOpen) return false;
    if (this.capture) {
      const { id, slot } = this.capture;
      this.capture = null;
      if (code === 'Backspace' || code === 'Delete') bindings.set(id, slot, null);
      else if (code !== 'Escape') bindings.set(id, slot, code);
      this.render();
      return true;
    }
    if (code === 'Escape') this.close();
    return true;
  }

  click(ev) {
    const t = ev.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'close') this.close();
    else if (act === 'tab') { this.tab = t.dataset.tab; this.capture = null; this.render(); }
    else if (act === 'bind') { this.capture = { id: t.dataset.id, slot: +t.dataset.slot }; this.render(); }
    else if (act === 'resetkeys') { bindings.reset(); this.render(); }
    else if (act === 'resetfov') { prefs.set('fov', {}); this.render(); }
    else if (act === 'seg') { const v = t.dataset.v; cfg.set(t.dataset.key, /^\d+$/.test(v) ? +v : v); this.render(); this.onChange(); }
  }

  input(ev) {
    const t = ev.target;
    if (t.dataset.fov) { const v = view.setFov(t.dataset.fov, +t.value); t.parentElement.querySelector('b').textContent = v + '°'; }
    else if (t.dataset.key) {
      let v = t.type === 'range' ? +t.value : t.value;
      if (t.dataset.key === 'number') v = String(v).replace(/\D/g, '').slice(0, 2);
      cfg.set(t.dataset.key, v);
      const b = t.parentElement.querySelector('b'); if (b && t.type === 'range') b.textContent = v + (t.dataset.unit || '');
      if (t.type === 'color') this.swatch();
    }
    this.onChange();
  }

  swatch() {
    const s = this.el.querySelector('.oswatch');
    if (s) { s.style.background = `linear-gradient(105deg, ${cfg.get('color')} 0 62%, ${cfg.get('color2')} 62% 70%, #15161a 70%)`; s.style.opacity = cfg.get('livery') === 'custom' ? 1 : 0.35; }
  }

  render() {
    const seg = (key, cur, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-act="seg" data-key="${key}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const row = ([, key, label, type, o, note]) => {
      const cur = cfg.get(key);
      const ctl = type === 'seg' ? seg(key, cur, o)
        : `<div class="orange"><input type="range" min="${o[0]}" max="${o[1]}" step="${o[2]}" value="${cur}" data-key="${key}" data-unit="${o[3] || ''}"><b>${cur}${o[3] || ''}</b></div>`;
      return `<div class="oset"><div class="olab">${label}${note ? `<small>${note}</small>` : ''}</div>${ctl}</div>`;
    };
    let body = '';
    if (this.tab === 'controls') {
      const cap = this.capture;
      const keyBtn = (id, slot) => {
        const code = bindings.keys(id)[slot];
        const wait = cap && cap.id === id && cap.slot === slot;
        return `<button class="kb${wait ? ' wait' : ''}${code ? '' : ' empty'}" data-act="bind" data-id="${id}" data-slot="${slot}">${wait ? 'press a key…' : code ? bindings.label(code) : '+'}</button>`;
      };
      body = `<p class="onote">Click a key to change it, then press the new key. Backspace clears. Each control can have two keys.</p>
        <div class="okeys">${ACTIONS.map(([id, label]) => `<div class="orow"><span>${label}</span>${keyBtn(id, 0)}${keyBtn(id, 1)}</div>`).join('')}</div>
        <button class="olink" data-act="resetkeys">Reset controls to default</button>`;
    } else if (this.tab === 'car') {
      body = `${row(['car', 'livery', 'Paint', 'seg', [['team', 'TEAM COLOURS'], ['custom', 'MY COLOURS']], 'My colours repaints your team\'s design in the two colours below.'])}
        <div class="oset"><div class="olab">Main colour</div><input type="color" value="${cfg.get('color')}" data-key="color"></div>
        <div class="oset"><div class="olab">Accent colour</div><input type="color" value="${cfg.get('color2')}" data-key="color2"></div>
        <div class="oset"><div class="olab">Race number<small>Leave empty to use the team's number.</small></div><input type="text" inputmode="numeric" maxlength="2" value="${cfg.get('number')}" data-key="number" placeholder="–" class="onum"></div>
        <div class="oswatch"></div>`;
    } else {
      body = ROWS.filter((r) => r[0] === this.tab).map(row).join('');
      if (this.tab === 'view') {
        const fovRow = (cam, label) => `<div class="oset"><div class="olab">${label} field of view</div><div class="orange"><input type="range" min="35" max="110" step="1" value="${view.fov(cam)}" data-fov="${cam}"><b>${view.fov(cam)}°</b></div></div>`;
        body += fovRow('COCKPIT', 'Cockpit') + fovRow('TV POD', 'TV pod') + fovRow('CHASE', 'Chase') + fovRow('FAR CHASE', 'Far chase')
          + `<button class="olink" data-act="resetfov">Reset field of view</button><p class="onote">While driving, <kbd>${bindings.text('fovDown')}</kbd> and <kbd>${bindings.text('fovUp')}</kbd> change the current camera's field of view.</p>`;
      }
    }
    this.el.innerHTML = `
      <div class="obox">
        <div class="ohead"><h2>ADVANCED SETTINGS</h2><button data-act="close">DONE ✓</button></div>
        <div class="otabs">${TABS.map(([id, l]) => `<button data-act="tab" data-tab="${id}" class="${id === this.tab ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="obody">${body}</div>
      </div>`;
    this.swatch();
  }
}
