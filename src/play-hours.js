const HOUR = 60 * 60 * 1000;
const zone = 'America/New_York';
const easternHour = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' });
const openingLabel = new Intl.DateTimeFormat('en-US', {
  timeZone: zone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});

// Both Eastern cutoffs fall on the same UTC calendar day. Resolve the offset on
// the boundary date itself: a DST change can occur between Friday and Sunday.
export function raceWindow(now) {
  const day = new Date(now);
  day.setUTCHours(16, 0, 0, 0);
  for (let i = 0; i <= 7; i++) {
    const weekday = day.getUTCDay();
    if (weekday === 5 || weekday === 0) {
      const boundary = day.getTime() + (16 - Number(easternHour.format(day))) * HOUR;
      if (boundary > now) return { open: weekday === 0, boundary };
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  throw new RangeError('Invalid schedule date');
}

let active = false, ending = false, monotonicEnd = 0, wallEnd = 0;

function showNotice(title, message) {
  document.getElementById('game').hidden = true;
  document.getElementById('hoursTitle').textContent = title;
  document.getElementById('hoursMessage').textContent = message;
  document.getElementById('availability').hidden = false;
}

function endSession() {
  active = false;
  ending = true;
  showNotice('Racing is closed', 'Checking the next race weekend…');
  window.dispatchEvent(new Event('racehoursend'));
  // Unload the whole game, including pending starts, audio and peer connections.
  location.reload();
}

export function canPlay() {
  // The monotonic deadline survives device clock edits. The wall deadline also
  // catches a laptop sleeping through the cutoff on platforms that pause performance.now().
  if (active && (performance.now() >= monotonicEnd || Date.now() >= wallEnd)) endSession();
  return active;
}

async function siteTime() {
  const url = new URL('../index.html', import.meta.url);
  url.searchParams.set('clock', Math.random().toString(36).slice(2));
  const response = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(8000) });
  const date = Date.parse(response.headers.get('Date'));
  const age = Number(response.headers.get('Age') ?? 0);
  if (!response.ok || !Number.isFinite(date) || !Number.isFinite(age) || age < 0) throw new Error('Missing site time');
  return date + age * 1000;
}

export function watchRaceHours() {
  let checking = false, timer;
  function wakeAfter(delay) {
    clearTimeout(timer);
    if (active) delay = Math.min(delay, monotonicEnd - performance.now(), wallEnd - Date.now());
    timer = setTimeout(check, Math.max(0, delay));
  }

  async function check() {
    if (active && !canPlay()) return;
    if (checking || ending) return;
    checking = true;
    const sent = performance.now();
    let now;
    try {
      now = await siteTime();
    } catch {
      if (!active) showNotice('Race hours unavailable', 'Reconnect to check the schedule. This page retries automatically.');
      wakeAfter(30000);
      return;
    } finally {
      checking = false;
    }

    if (ending) return;
    const { open, boundary } = raceWindow(now);
    // HTTP dates have one-second precision. Use the earliest possible closing
    // deadline and require a fresh server response before opening on Friday.
    const remaining = boundary - now;
    const safeRemaining = remaining - 1000 - (performance.now() - sent);
    if (!open || safeRemaining <= 0) {
      if (active) { endSession(); return; }
      const opensAt = open ? raceWindow(boundary).boundary : boundary;
      showNotice('Racing is closed', 'Racing reopens ' + openingLabel.format(opensAt) + '.');
      wakeAfter(open ? 1000 : remaining);
      return;
    }

    monotonicEnd = performance.now() + safeRemaining;
    wallEnd = Date.now() + safeRemaining;
    wakeAfter(safeRemaining);
    if (active) return;
    active = true;
    try {
      await import('./main.js');
    } catch (error) {
      console.error(error);
      showNotice('The game could not start', 'Reload the page to try again.');
      return;
    }
    if (canPlay()) {
      document.getElementById('availability').hidden = true;
      document.getElementById('game').hidden = false;
    }
  }

  window.addEventListener('pageshow', e => { if (e.persisted) check(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('online', check);
  check();
}
