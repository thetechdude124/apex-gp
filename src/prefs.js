// Small persistent preferences (driver profile, key bindings, view settings), kept in this
// browser only. Storage may be unavailable: everything falls back to the defaults.
const KEY = 'apex.prefs.v1';
let data = {};
try { data = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { data = {}; }

export const prefs = {
  get(k, dflt) { return data[k] === undefined ? dflt : data[k]; },
  set(k, v) { data[k] = v; try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } },
};
