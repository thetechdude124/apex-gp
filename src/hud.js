// DOM HUD: timing tower, lap/sector timing, delta, speed/gear/rev lights, ERS/DRS,
// pedal bars, minimap, toasts, start lights, results.
import { COMPOUNDS } from './sim/physics.js';

const $ = (id) => document.getElementById(id);

export function fmtTime(t, plus = false) {
  if (t == null || !isFinite(t)) return '--:--.---';
  const neg = t < 0; t = Math.abs(t);
  const m = Math.floor(t / 60), s = t - m * 60;
  const str = m > 0 ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3);
  return (neg ? '-' : plus ? '+' : '') + str;
}

export class HUD {
  constructor() {
    this.el = $('hud');
    this.tower = $('tower');
    this.mini = $('minimap');
    this.mctx = this.mini.getContext('2d');
    this.toastT = 0;
    this.lastEvt = 0;
    this.revLeds = [];
    const rev = $('revs');
    rev.innerHTML = '';
    for (let i = 0; i < 15; i++) { const d = document.createElement('i'); rev.appendChild(d); this.revLeds.push(d); }
  }

  setTrack(T) {
    this.T = T;
    // minimap transform
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (let i = 0; i < T.N; i++) { minx = Math.min(minx, T.x[i]); maxx = Math.max(maxx, T.x[i]); miny = Math.min(miny, T.y[i]); maxy = Math.max(maxy, T.y[i]); }
    const W = this.mini.width, H = this.mini.height, pad = 14;
    const s = Math.min((W - 2 * pad) / (maxx - minx), (H - 2 * pad) / (maxy - miny));
    const ox = (W - (maxx - minx) * s) / 2, oy = (H - (maxy - miny) * s) / 2;
    this.mx = (x) => ox + (x - minx) * s;
    this.my = (y) => H - (oy + (y - miny) * s);
    const path = new Path2D();
    for (let i = 0; i <= T.N; i += 3) {
      const k = i % T.N;
      if (i === 0) path.moveTo(this.mx(T.x[k]), this.my(T.y[k])); else path.lineTo(this.mx(T.x[k]), this.my(T.y[k]));
    }
    path.closePath();
    this.path = path;
    // DRS zones (drawn green on the map) and the pit lane
    this.drsPath = new Path2D();
    for (const z of T.drs) {
      const n = (z.end - z.start + T.N) % T.N;
      for (let q = 0; q <= n; q += 3) { const k = (z.start + q) % T.N; if (q === 0) this.drsPath.moveTo(this.mx(T.x[k]), this.my(T.y[k])); else this.drsPath.lineTo(this.mx(T.x[k]), this.my(T.y[k])); }
    }
    this.pitPath = new Path2D();
    const P = T.pit, o = {};
    for (let r = P.e0; r <= P.x1; r += 8) { P.pos(r, P.side * (P.lat(r) + 22), o); if (r === P.e0) this.pitPath.moveTo(this.mx(o.x), this.my(o.y)); else this.pitPath.lineTo(this.mx(o.x), this.my(o.y)); }
    this.drsShown = ''; this.pitHtml = ''; this.bannerHtml = '';
    // the same shapes in world coordinates, for the follow (heading-up) map
    const wp = (path, list) => list.forEach(([x, y], k) => (k ? path.lineTo(x, y) : path.moveTo(x, y)));
    this.wTrack = new Path2D();
    { const pts = []; for (let i = 0; i <= T.N; i += 2) { const k = i % T.N; pts.push([T.x[k], T.y[k]]); } wp(this.wTrack, pts); }
    this.wDrs = new Path2D();
    for (const z of T.drs) { const pts = []; const n = (z.end - z.start + T.N) % T.N; for (let q = 0; q <= n; q += 2) { const k = (z.start + q) % T.N; pts.push([T.x[k], T.y[k]]); } wp(this.wDrs, pts); }
    this.wPit = new Path2D();
    { const pts = []; for (let r = P.e0; r <= P.x1; r += 6) { P.pos(r, P.side * P.lat(r), o); pts.push([o.x, o.y]); } wp(this.wPit, pts); }
  }

  show(on) { this.el.style.display = on ? 'block' : 'none'; }

  update(race, player, dt) {
    const T = race.T;
    const b = player.body;
    const v = b.speed() * 3.6;
    $('speed').textContent = Math.round(v);
    $('gear').textContent = b.gear === -1 ? 'R' : b.gear === 0 ? 'N' : b.gear;
    const rpmF = (b.rpm - 7000) / (b.p.rpmMax - 7000);
    const lit = Math.max(0, Math.min(15, Math.round(rpmF * 15)));
    const flash = rpmF > 0.97 && Math.floor(performance.now() / 70) % 2 === 0;
    this.revLeds.forEach((d, i) => {
      const on = i < lit;
      d.className = !on ? '' : flash ? 'p' : i < 5 ? 'g' : i < 10 ? 'r' : 'p';
    });
    $('ersbar').style.width = `${(b.ers / b.p.ersCap) * 100}%`;
    $('ers').classList.toggle('on', b.deploying);
    $('ers').textContent = this.boost && b.deploying ? 'OVERTAKE' : 'ERS';
    const drs = $('drs');
    const inZone = race.inDrsZone(player.idx);
    drs.className = b.drsOpen ? 'open' : player.drsAvail && inZone ? 'avail' : player.drsAvail ? 'armed' : '';
    // big DRS indicator: says what the state is and, after each detection line, why
    {
      let cls = '', txt = '';
      const note = player.drsNote && race.time - player.drsNote.t < 3.5 ? player.drsNote : null;
      if (b.drsOpen) { cls = 'open'; txt = 'OPEN'; }
      else if (player.drsAvail && inZone) { cls = 'avail'; txt = 'AVAILABLE <small>press <kbd>SPACE</kbd></small>'; }
      else if (player.drsAvail) { cls = 'ready'; txt = `READY <small>${note && note.gap != null ? `gap ${note.gap.toFixed(1)}s · ` : ''}opens in the zone ahead</small>`; }
      else if (note && !player.pit && race.state === 'racing') {
        cls = 'no';
        txt = !note.enabled ? '<small>enabled from lap 2</small>' : note.gap == null ? '<small>no car ahead to chase</small>' : `<small>gap ${note.gap.toFixed(1)}s · need under 1.0s at the line</small>`;
      }
      const key = cls + txt;
      if (key !== this.drsShown) {
        this.drsShown = key;
        const el = $('drsbig');
        el.style.display = cls ? 'flex' : 'none';
        el.className = cls;
        $('drstxt').innerHTML = txt;
      }
    }
    $('thr').style.height = `${(player.input?.throttle || 0) * 100}%`;
    $('brk').style.height = `${(player.input?.brake || 0) * 100}%`;
    $('tyre').textContent = `${COMPOUNDS[b.compound].name[0]} ${Math.round((1 - b.tyreWear) * 100)}%`;
    $('tyre').style.color = COMPOUNDS[b.compound].color;

    // lap / position
    const n = race.entries.length;
    if (race.mode === 'race') {
      $('pos').innerHTML = `<b>P${player.pos}</b><span>/${n}</span>`;
      $('lap').innerHTML = `LAP <b>${Math.min(race.laps, Math.max(1, player.lap))}</b>/${race.laps}`;
    } else if (race.quali) {
      $('pos').innerHTML = `<b>Q</b>`;
      $('lap').innerHTML = player.lap < 1 ? 'OUT <b>LAP</b>' : `FLYING LAP <b>${Math.min(2, race.quali.attempts + 1)}</b>/2`;
    } else {
      $('pos').innerHTML = `<b>TT</b>`;
      $('lap').innerHTML = `LAP <b>${Math.max(1, player.lap)}</b>`;
    }
    // weather: what it is doing now and what the track is like
    {
      const w = race.wetness, r = race.rain;
      const txt = race.weatherPlan === 'dry' ? '' : r > 0.5 ? (w > 0.6 ? 'RAIN · WET TRACK' : 'RAIN STARTING') : w > 0.6 ? 'WET TRACK' : w > 0.12 ? 'DRYING · DAMP TRACK' : race.changing ? 'DRY' : 'DRY · RAIN EXPECTED';
      if (txt !== this.wxTxt) { this.wxTxt = txt; const el = $('wx'); el.textContent = txt; el.style.display = txt ? 'block' : 'none'; el.className = 'panel' + (w > 0.5 || r > 0.5 ? ' wet' : ''); }
    }
    const cur = player.lapStart != null ? race.time - player.lapStart : 0;
    $('curlap').textContent = fmtTime(cur);
    $('curlap').classList.toggle('invalid', !player.lapValid);
    $('lapinv').style.display = !player.lapValid && player.lapStart != null && race.mode !== 'race' ? 'block' : 'none';
    $('lastlap').textContent = fmtTime(player.lastLap);
    $('bestlap').textContent = fmtTime(player.bestLap);
    // sectors
    for (let k = 0; k < 3; k++) {
      const el = $(`s${k + 1}`);
      const st = player.sectorIdx > k ? player.curSectors[k] : player.lastSectors[k];
      let cls = '';
      if (st != null) {
        if (race.bestSectors && race.bestSectors[k] != null && st <= race.bestSectors[k] + 1e-6) cls = 'purple';
        else if (player.bestSectors[k] != null && st <= player.bestSectors[k] + 1e-6) cls = 'green';
        else cls = 'yellow';
      }
      el.className = 'sec ' + cls;
      el.textContent = st != null ? st.toFixed(3) : '';
    }
    // delta to best lap
    const dl = $('delta');
    if (player.bestTrace && player.lapStart != null) {
      const k = Math.floor(player.idx / 10);
      const ref = player.bestTrace[k];
      if (ref) {
        const d = cur - ref;
        dl.textContent = (d >= 0 ? '+' : '') + d.toFixed(2);
        dl.className = d >= 0 ? 'slower' : 'faster';
      }
    } else { dl.textContent = ''; }

    // timing tower
    this.towerT = (this.towerT || 0) - dt;
    if (race.mode === 'race' && this.towerT <= 0) {
      this.towerT = 0.2;
      let html = '';
      for (const e of race.order) {
        let gap;
        if (e.pos === 1) gap = race.state === 'finished' ? 'WINNER' : 'LEADER';
        else if (e.finishedAt != null && !e.dnf && race.order[0].finishedAt != null) gap = (race.order[0].finLaps ?? 0) > (e.finLaps ?? 0) ? `+${race.order[0].finLaps - e.finLaps} LAP` : fmtTime(e.finishedAt - race.order[0].finishedAt, true);
        else {
          const lapsDown = Math.floor((race.order[0].dist - e.dist) / T.length);
          const g = e.gap > 0 ? e.gap : (race.order[0].dist - e.dist) / Math.max(15, e.body.speed());
          gap = lapsDown >= 1 ? `+${lapsDown} LAP` : `+${g.toFixed(1)}`;
        }
        const pit = e.pit ? '<em class="pit">PIT</em>' : e.body.drsOpen ? '<em class="d">DRS</em>' : e.penalty ? `<em class="pen">+${e.penalty}s</em>` : '';
        const ty = `<span class="ty" style="border-color:${COMPOUNDS[e.body.compound].color}">${e.body.compound}</span>`;
        html += `<div class="row${e.isPlayer ? ' me' : ''}"><span class="p">${e.pos}</span><span class="c" style="background:${e.color}"></span><span class="n">${e.short}</span>${pit}${ty}<span class="g">${gap}</span></div>`;
      }
      this.tower.innerHTML = html;
      this.tower.style.display = 'block';
    } else if (race.quali && this.towerT <= 0) {
      // qualifying: the times to beat
      this.towerT = 0.5;
      const q = race.quali;
      const mine = q.time;
      let html = '', placed = false, pos = 1;
      const meRow = () => `<div class="row me"><span class="p">${mine != null ? pos : '–'}</span><span class="c" style="background:${player.color}"></span><span class="n">${player.short}</span><span class="g">${mine != null ? fmtTime(mine) : player.lap >= 1 && q.endT == null ? fmtTime(cur).slice(0, -2) : 'no time'}</span></div>`;
      for (const r of q.board) {
        if (!placed && mine != null && mine < r.time) { html += meRow(); placed = true; pos++; }
        html += `<div class="row"><span class="p">${pos++}</span><span class="c" style="background:${r.color}"></span><span class="n">${r.short}</span><span class="g">${fmtTime(r.time)}</span></div>`;
      }
      if (!placed) html += meRow();
      this.tower.innerHTML = html;
      this.tower.style.display = 'block';
    } else if (race.mode !== 'race' && !race.quali) this.tower.style.display = 'none';

    // track map: whole circuit, or a heading-up view of the road ahead
    const c = this.mctx, W = this.mini.width, H = this.mini.height;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);
    const mode = this.mapMode || 'full';
    this.mini.style.display = mode === 'off' ? 'none' : 'block';
    const drsOn = player.drsAvail || b.drsOpen, pitOn = player.pitReq || player.pit;
    if (mode === 'full') {
      c.lineJoin = 'round';
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 11; c.stroke(this.path);
      c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 5.5; c.stroke(this.path);
      c.strokeStyle = drsOn ? '#00e676' : 'rgba(0,200,100,0.8)'; c.lineWidth = drsOn ? 7 : 5.5; c.stroke(this.drsPath);
      if (race.pitRule !== 'off') { c.strokeStyle = pitOn ? '#35b6ff' : 'rgba(255,255,255,0.5)'; c.lineWidth = 2.5; c.stroke(this.pitPath); }
      c.fillStyle = '#fff'; c.fillRect(this.mx(T.x[0]) - 4, this.my(T.y[0]) - 4, 8, 8);
      for (const e of race.entries) {
        if (e === player) continue;
        c.fillStyle = e.color; c.strokeStyle = '#000'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(this.mx(e.body.X), this.my(e.body.Y), 5, 0, 6.3); c.fill(); c.stroke();
      }
      // you: a big arrow pointing the way you are heading
      const px = this.mx(b.X), py = this.my(b.Y);
      c.save(); c.translate(px, py); c.rotate(-b.psi);
      c.beginPath(); c.moveTo(13, 0); c.lineTo(-8, 8.5); c.lineTo(-4, 0); c.lineTo(-8, -8.5); c.closePath();
      c.fillStyle = '#ffe600'; c.strokeStyle = '#000'; c.lineWidth = 2.5; c.stroke(); c.fill();
      c.restore();
    } else if (mode === 'follow') {
      // heading-up: you sit near the bottom, about 520 m of road ahead is in view
      const sc = (H * 0.8) / 430, cx = W / 2, cy = H * 0.84;
      c.save();
      c.beginPath(); c.roundRect(0, 0, W, H, 18); c.clip();
      c.fillStyle = 'rgba(10,12,18,0.55)'; c.fillRect(0, 0, W, H);
      // world (x east, y north) -> screen with the car's heading pointing up
      c.translate(cx, cy); c.rotate(b.psi - Math.PI / 2); c.scale(sc, -sc); c.translate(-b.X, -b.Y);
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.strokeStyle = 'rgba(0,0,0,0.65)'; c.lineWidth = 30; c.stroke(this.wTrack);
      c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = 17; c.stroke(this.wTrack);
      c.strokeStyle = drsOn ? '#00e676' : 'rgba(0,200,100,0.85)'; c.lineWidth = 17; c.stroke(this.wDrs);
      if (race.pitRule !== 'off') { c.strokeStyle = pitOn ? '#35b6ff' : 'rgba(180,190,200,0.75)'; c.lineWidth = 6; c.stroke(this.wPit); }
      for (const e of race.entries) {
        if (e === player) continue;
        c.fillStyle = e.color; c.strokeStyle = '#000'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(e.body.X, e.body.Y, 14, 0, 6.3); c.fill(); c.stroke();
      }
      c.restore();
      c.beginPath(); c.moveTo(cx, cy - 17); c.lineTo(cx + 11, cy + 11); c.lineTo(cx, cy + 5); c.lineTo(cx - 11, cy + 11); c.closePath();
      c.fillStyle = '#ffe600'; c.strokeStyle = '#000'; c.lineWidth = 3; c.stroke(); c.fill();
    }

    // start lights overlay
    const sl = $('startlights');
    if (race.state === 'lights' || (race.state === 'racing' && race.time - (race.raceStart || 0) < 1.2 && race.mode === 'race')) {
      sl.style.display = 'flex';
      [...sl.children].forEach((d, k) => d.classList.toggle('on', race.state === 'lights' && k < race.lightsOn));
    } else sl.style.display = 'none';

    // pit stop panel + scripted pit lane read-out
    {
      let html = '', cls = '';
      if (race.mode === 'race' && race.pitRule !== 'off' && race.state !== 'grid' && player.finishedAt == null) {
        const [w0, w1] = player.plan.window, lap = Math.max(1, player.lap);
        const win = w1 > w0 ? `laps ${w0}–${w1}` : `lap ${w0}`;
        const next = player.pit?.to || race.nextCompound(player);
        const what = { S: 'fastest tyre, for a sprint to the flag', M: 'balanced pace, lasts to the flag', H: 'a little slower, lasts to the flag', W: 'grooved tyres for a wet track' }[next] || '';
        const tyre = `<div class="t"><i class="on ${next}">${next}</i><span>You will get <b>${COMPOUNDS[next].name.toUpperCase()}</b> tyres: ${what}</span></div>`;
        const done = player.stops > 0;
        const side = T.pit.side === 1 ? 'LEFT' : 'RIGHT';
        const how = `At the end of the lap keep <b>${side}</b> and follow the blue arrows into the pit lane.`;
        const wrong = race.wrongTyres(player);
        if (player.pit) { cls = 'req'; html = `<div class="h"><span>IN THE PIT LANE</span></div>${done && !wrong ? '' : tyre}`; }
        else if (wrong && race.state === 'racing') { cls = 'late'; html = `<div class="h"><span class="need">${race.wantWets() ? 'PIT FOR WET TYRES' : 'PIT FOR SLICK TYRES'}</span><small>weather</small></div><div class="s">${how}</div>${tyre}`; }
        else if (done) html = '<div class="h">PIT STOP <span class="ok">DONE ✓</span></div><div class="s">No more stops needed. Race to the flag.</div>';
        else if (race.state !== 'racing' || lap < w0) html = `<div class="h">PIT STOP<small>${win}</small></div><div class="s">One stop is required, on ${win}. The pit lane opens for you then.</div>`;
        else if (lap > w1) { cls = 'late'; html = `<div class="h"><span class="need">PIT NOW</span><small>overdue</small></div><div class="s">${lap >= race.laps ? 'Too late to stop: +20s at the flag.' : how}</div>${tyre}`; }
        else { cls = 'open'; html = `<div class="h"><span class="open">PIT WINDOW OPEN</span><small>${win}</small></div><div class="s">${how}</div>${tyre}`; }
      }
      if (html !== this.pitHtml) { this.pitHtml = html; const el = $('pitbox'); el.innerHTML = html; el.style.display = html ? 'block' : 'none'; el.className = 'panel ' + cls; }
      const pn = $('pitnow');
      if (player.pit) {
        const p = player.pit;
        pn.style.display = 'block';
        if (p.phase === 'stop') { $('pitnowb').textContent = `TYRE CHANGE  ${p.stopT.toFixed(1)}s`; $('pitnows').textContent = `${COMPOUNDS[p.to].name.toUpperCase()} TYRES GOING ON`; }
        else if (p.r < T.pit.lim1) { $('pitnowb').textContent = 'PIT LIMITER · 80 KM/H'; $('pitnows').textContent = p.serviced && p.stop ? 'HEADING FOR THE PIT EXIT' : 'THE CAR DRIVES ITSELF IN THE PIT LANE'; }
        else { $('pitnowb').textContent = 'PIT EXIT'; $('pitnows').textContent = 'GET READY: YOU HAVE CONTROL AT THE END OF THE EXIT ROAD'; }
      } else pn.style.display = 'none';
    }
    // qualifying banner
    {
      let hb = '', hs = '';
      if (this.pitBanner && !player.pit) { hb = this.pitBanner[0]; hs = this.pitBanner[1]; }
      else if (race.quali && !race.quali.done) {
        const pole = race.quali.board[0];
        hb = 'QUALIFYING';
        hs = player.lap < 1 ? 'Your flying lap starts when you cross the line' : `One clean lap sets your grid slot${pole ? ` · pole is <b>${fmtTime(pole.time)}</b>` : ''} · stay inside the white lines`;
      }
      const k = hb + hs;
      if (k !== this.bannerHtml) { this.bannerHtml = k; $('banner').style.display = hb ? 'block' : 'none'; $('banner').className = 'panel' + (this.pitBanner ? ' pit' : ''); $('bannerb').textContent = hb; $('banners').innerHTML = hs; }
    }

    // toasts
    if (race.events.length > this.lastEvt) {
      const ev = race.events[race.events.length - 1];
      this.lastEvt = race.events.length;
      this.toast(ev.text, ev.type);
    }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('toast').classList.remove('show'); }
  }

  toast(text, type = '') {
    const t = $('toast');
    t.textContent = text;
    t.className = `show ${type}`;
    this.toastT = 2.5;
  }

  qualiResults(rows, trackName) {
    const el = $('results');
    const pole = rows[0].time;
    let html = `<h2>QUALIFYING · ${trackName.toUpperCase()}</h2><table><tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th>TIME</th><th>GAP</th></tr>`;
    rows.forEach((r, k) => {
      html += `<tr class="${r.isPlayer ? 'me' : ''}"><td>${k + 1}</td><td><span class="c" style="background:${r.color}"></span>${r.name}</td><td>${r.team}</td><td class="${k === 0 ? 'purple' : ''}">${r.time != null ? fmtTime(r.time) : 'no time'}</td><td>${k === 0 || r.time == null ? '' : fmtTime(r.time - pole, true)}</td></tr>`;
    });
    const me = rows.findIndex((r) => r.isPlayer) + 1;
    html += `</table><div class="qnote">You start <b>P${me}</b> of ${rows.length}${rows[me - 1].time == null ? ' (no valid lap)' : ''}</div>`
      + '<div class="btns"><button id="qRace" class="go">START RACE ▸</button><button id="qAgain">QUALIFY AGAIN</button><button id="qMenu">MAIN MENU</button></div>';
    el.innerHTML = html;
    el.style.display = 'block';
  }

  results(race) {
    const el = $('results');
    let html = `<h2>${race.mode === 'race' ? 'RACE CLASSIFICATION' : 'TIME TRIAL'}</h2><table><tr><th>POS</th><th>DRIVER</th><th>TEAM</th><th>TIME / GAP</th><th>TYRES</th><th>BEST LAP</th><th>+/-</th></tr>`;
    const lead = race.order.find((e) => e.finishedAt != null && !e.dnf) || race.finishOrder[0];
    const fastest = Math.min(...race.entries.map((e) => e.bestLap ?? 1e9));
    for (const e of race.order) {
      const tm = e.dnf ? 'DNF' : e === lead ? fmtTime(e.finishedAt - race.raceStart) : e.finishedAt != null ? ((lead.finLaps ?? 0) > (e.finLaps ?? 0) ? `+${lead.finLaps - e.finLaps} LAP` : fmtTime(e.finishedAt - lead.finishedAt, true)) : 'on track';
      const gained = e.startPos - e.pos;
      html += `<tr class="${e.isPlayer ? 'me' : ''}"><td>${e.pos}</td><td><span class="c" style="background:${e.color}"></span>${e.name}</td><td>${e.team}</td><td>${tm}${e.penalty ? ` <em>(+${e.penalty}s${e.noStop ? ' no stop' : ''})</em>` : ''}</td><td>${[...e.used].join(' → ')}</td><td class="${e.bestLap === fastest ? 'purple' : ''}">${fmtTime(e.bestLap)}</td><td class="${gained > 0 ? 'up' : gained < 0 ? 'down' : ''}">${gained > 0 ? '▲' + gained : gained < 0 ? '▼' + -gained : '–'}</td></tr>`;
    }
    html += '</table><div class="btns"><button id="resRestart">RESTART</button><button id="resReplay">WATCH REPLAY</button><button id="resMenu">MAIN MENU</button></div>';
    el.innerHTML = html;
    el.style.display = 'block';
  }
}
