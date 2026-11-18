// "Play with friends": create a room or join one with its code, see who is in, and (as the host)
// choose the circuit and start the race for everyone.
import { CLASSES, VEHICLES, vehicleId, roomVehicle } from './sim/vehicles.js';
import { cleanCode, supported, MAX_PLAYERS } from './net/session.js';

const WHY = {
  noroom: (c) => `No room with the code ${c}. Check the code, and that your friend still has the room open.`,
  blocked: () => 'Could not connect. One of the two networks is blocking direct connections (some school and office networks do). Try a different network, or a phone hotspot.',
  timeout: () => 'Could not connect. One of the two networks is blocking direct connections (some school and office networks do). Try a different network, or a phone hotspot.',
  offline: () => 'Could not reach the meeting server. Check your internet connection and try again.',
  version: () => 'That room is running a different version of the game. Refresh this page, ask your friend to do the same, and try again.',
  full: () => 'That room is full.',
};

export class Lobby {
  // api: { net, tracks, teams, profile(), setName(v), setTeam(i), roomDefaults(), start(), audio() }
  constructor(api) {
    this.api = api; this.net = api.net;
    this.el = document.getElementById('lobby');
    this.isOpen = false; this.busy = false;
    if (!this.el) return;
    const opt = (v, t) => `<option value="${v}">${t}</option>`;
    this.el.innerHTML = `
      <div class="lcard">
        <div class="lhead"><span>PLAY WITH FRIENDS</span><button id="lClose">BACK ✕</button></div>
        <div class="lme">
          <label>Your name<input type="text" id="lName" maxlength="24" placeholder="Your name" autocomplete="off" spellcheck="false"></label>
          <label>Your car<select id="lVehicle" aria-describedby="lClassNote"></select><small id="lClassNote" hidden></small></label>
          <label>Team<select id="lTeam">${api.teams.map((t, i) => opt(i, t.name)).join('')}</select></label>
        </div>
        <div id="lEntry">
          <p class="lnote">Everyone plays on their own computer. One of you creates a room and sends the others the link; up to ${MAX_PLAYERS} can join.</p>
          <button id="lCreate" class="lbig">CREATE A ROOM</button>
          <div class="lor"><span>or join a friend's room</span></div>
          <div class="ljoin"><input type="text" id="lCode" maxlength="5" placeholder="CODE" autocomplete="off" spellcheck="false"><button id="lJoin">JOIN</button></div>
        </div>
        <div id="lRoom">
          <div class="lroom"><div><small>ROOM CODE</small><b id="lCodeBig"></b></div><div class="linv"><button id="lCopy">COPY INVITE LINK</button><small id="lLink"></small></div></div>
          <div class="lcols">
            <div><h3>Drivers <span id="lCount"></span></h3><div id="lPlayers"></div></div>
            <div class="lset"><h3>Race <span id="lWho"></span></h3>
              <label>Circuit<select id="lTrack">${api.tracks.map((t) => opt(t.id, t.name)).join('')}</select></label>
              <label>Laps<input type="number" id="lLaps" min="1" max="50"></label>
              <label>Weather<select id="lWeather">${opt('random', 'Random')}${opt('dry', 'Dry')}${opt('changing', 'Changeable')}${opt('wet', 'Rain all race')}</select></label>
              <label>Car class rule<select id="lField">${opt('mixed', 'Each driver chooses')}${opt('single', 'Lock to host’s class')}</select></label>
              <label>Computer drivers<select id="lAi">${opt('full', 'Fill the grid (20 cars)')}${opt('none', 'None: friends only')}</select></label>
              <label id="lDiffL">Their skill: <span id="lDiffV"></span><input type="range" id="lDiff" min="0" max="110"></label>
            </div>
          </div>
          <div class="lbtns"><button id="lLeave">LEAVE ROOM</button><button id="lStart" class="lbig">START RACE ▸</button></div>
        </div>
        <div id="lStatus"></div>
      </div>`;
    const q = (id) => this.el.querySelector('#' + id);
    this.q = q;
    q('lClose').onclick = () => this.close();
    q('lName').oninput = () => { api.setName(q('lName').value); this.net.setProfile(api.profile()); };
    q('lVehicle').onchange = () => { api.setVehicle(q('lVehicle').value); this.net.setProfile(api.profile()); };
    q('lTeam').onchange = () => { api.setTeam(+q('lTeam').value); this.net.setProfile(api.profile()); };
    q('lCode').oninput = () => { q('lCode').value = cleanCode(q('lCode').value); };
    q('lCode').onkeydown = (e) => { if (e.key === 'Enter') q('lJoin').click(); };
    q('lCreate').onclick = () => this.create();
    q('lJoin').onclick = () => this.join(q('lCode').value);
    q('lLeave').onclick = () => { this.net.leave(); this.status(''); this.refresh(); };
    q('lCopy').onclick = () => this.copy();
    q('lStart').onclick = () => { if (this.net.isHost && !this.net.inRace) api.start(); };
    for (const [id, key] of [['lField', 'fieldType'], ['lTrack', 'track'], ['lLaps', 'laps'], ['lWeather', 'weather'], ['lAi', 'ai'], ['lDiff', 'diff']]) {
      q(id).addEventListener('input', () => {
        if (!this.net.isHost) return;
        const el = q(id), v = key === 'laps' ? Math.max(1, Math.min(50, Math.round(+el.value) || 1)) : key === 'diff' ? +el.value : el.value;
        this.net.setCfg({ [key]: v });
      });
    }
    // keys typed here are not game controls
    for (const t of ['keydown', 'keyup']) this.el.addEventListener(t, (e) => e.stopPropagation());
  }

  link() { return `${location.origin}${location.pathname}?room=${this.net.code}${/[?&]net=local/.test(location.search) ? '&net=local' : ''}`; }

  status(text, kind = '') { const s = this.q('lStatus'); s.textContent = text; s.className = kind; }

  open(code) {
    if (!this.el) return;
    this.isOpen = true;
    this.el.style.display = 'flex';
    const p = this.api.profile();
    this.q('lName').value = p.name === 'You' ? '' : p.name;
    this.q('lTeam').value = p.team;
    if (!supported()) this.status('This browser cannot make the connections online play needs. Try a current version of Chrome, Edge, Firefox or Safari.', 'err');
    else if (code && !this.net.active) { this.q('lCode').value = cleanCode(code); this.status(`You have been invited to room ${cleanCode(code)}. Check your name and team, then press JOIN.`); }
    this.refresh();
  }

  // shown again after a race, or when the room was lost (why: a message to show)
  show(why) { this.open(); if (why) this.status(why, 'err'); }
  hide() { this.isOpen = false; if (this.el) this.el.style.display = 'none'; }
  close() { if (this.net.active) this.net.leave(); this.status(''); this.hide(); }

  async create() {
    if (this.busy) return;
    this.busy = true; this.api.audio();
    this.status('Creating the room…');
    try {
      await this.net.host(this.api.profile(), this.api.roomDefaults());
      this.net.setProfile(this.api.profile()); // picks can change while the broker connects
      this.status('');
    }
    catch (e) { this.status((WHY[e.message] || WHY.offline)(''), 'err'); }
    this.busy = false; this.refresh();
  }

  async join(code) {
    code = cleanCode(code);
    if (this.busy) return;
    if (code.length < 5) { this.status('Type the five-character room code your friend sent you.', 'err'); return; }
    this.busy = true; this.api.audio();
    this.status(`Connecting to room ${code}…`);
    this.refresh();
    try {
      await this.net.join(code, this.api.profile());
      this.net.setProfile(this.api.profile());
      this.status('');
    }
    catch (e) { this.status((WHY[e.message] || WHY.blocked)(code), 'err'); }
    this.busy = false; this.refresh();
  }

  async copy() {
    const url = this.link(), b = this.q('lCopy');
    try { await navigator.clipboard.writeText(url); b.textContent = 'LINK COPIED ✓'; }
    catch (e) { const r = document.createRange(); r.selectNodeContents(this.q('lLink')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = 'SELECTED: PRESS CTRL/CMD+C'; }
    clearTimeout(this.copyT); this.copyT = setTimeout(() => { b.textContent = 'COPY INVITE LINK'; }, 2500);
  }

  // redraw from the room's current state (called whenever it changes)
  refresh() {
    if (!this.el || !this.isOpen) return;
    const net = this.net, q = this.q, inRoom = net.active;
    q('lEntry').style.display = inRoom ? 'none' : '';
    q('lRoom').style.display = inRoom ? '' : 'none';
    q('lClose').style.display = inRoom ? 'none' : '';
    for (const id of ['lCreate', 'lJoin', 'lCode']) q(id).disabled = this.busy || !supported();
    const hostDriver = net.players.find(p => p.host);
    const hostCar = vehicleId(hostDriver?.vehicle);
    const rule = net.cfg?.fieldType;
    const allowedClass = hostDriver && !net.isHost && rule === 'single' ? VEHICLES[hostCar].classId : '';
    const picker = q('lVehicle');
    if (picker.dataset.allowedClass !== allowedClass) {
      picker.innerHTML = this.api.vehicleOptions(allowedClass);
      picker.dataset.allowedClass = allowedClass;
    }
    const requested = this.api.profile().vehicle;
    picker.value = allowedClass ? roomVehicle(requested, hostCar, rule) : requested;
    picker.disabled = picker.options.length === 1;
    q('lClassNote').hidden = !allowedClass;
    q('lClassNote').textContent = allowedClass ? `Room locked to ${CLASSES[allowedClass]}` : '';
    if (!inRoom) return;
    q('lCodeBig').textContent = net.code;
    q('lLink').textContent = this.link();
    q('lCount').textContent = `${net.players.length} / ${MAX_PLAYERS}`;
    const list = q('lPlayers');
    list.textContent = '';
    for (const p of net.players) {
      const team = this.api.teams[p.team], row = document.createElement('div');
      row.className = 'lp' + (p.id === net.id ? ' me' : '');
      const dot = document.createElement('i'); dot.style.background = p.car.custom ? p.car.color : team.color;
      const name = document.createElement('b'); name.textContent = p.name;
      const tm = document.createElement('span');
      tm.textContent = team.name + ' · ' + VEHICLES[roomVehicle(p.vehicle, hostCar, rule)].name;
      const tag = document.createElement('em');
      tag.textContent = [p.host ? 'HOST' : '', p.id === net.id ? 'YOU' : '', p.waiting ? 'JOINS NEXT RACE' : '', !p.host && p.ping ? `${Math.round(p.ping)} ms` : ''].filter(Boolean).join(' · ');
      row.append(dot, name, tm, tag);
      list.appendChild(row);
    }
    const c = net.cfg || {}, host = net.isHost, hostName = hostDriver?.name || 'the host';
    q('lWho').textContent = host ? '· you choose' : `· chosen by ${hostName}`;
    for (const [id, key] of [['lField', 'fieldType'], ['lTrack', 'track'], ['lLaps', 'laps'], ['lWeather', 'weather'], ['lAi', 'ai'], ['lDiff', 'diff']]) {
      const el = q(id);
      el.disabled = !host;
      if (document.activeElement !== el && c[key] !== undefined) el.value = c[key];
    }
    q('lDiffV').textContent = c.diff ?? '';
    q('lDiffL').style.display = c.ai === 'none' ? 'none' : '';
    const start = q('lStart');
    start.style.display = host ? '' : 'none';
    start.disabled = net.inRace;
    const me = net.me;
    if (!this.q('lStatus').classList.contains('err')) {
      this.status(host ? (net.players.length < 2 ? 'Send your friends the invite link. You can start as soon as they are in (or right away, to try it alone).' : 'Everyone in? Press START RACE.')
        : me?.waiting || net.hostRacing ? 'A race is running. You are in the next one: this screen changes when it ends.' : `Waiting for ${hostName} to start the race.`);
    }
  }
}
