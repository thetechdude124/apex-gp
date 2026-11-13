// Optional "how to play" guide: a few illustrated pages, opened from the menu, the pause
// screen or with H. Shown once on the very first visit (and skippable straight away).
const key = (k, wide = '') => `<kbd class="${wide}">${k}</kbd>`;

const cornerSvg = `
<svg viewBox="0 0 420 230" class="tdiag">
  <path d="M-10 190 L250 190 Q350 190 350 90 L350 -10" fill="none" stroke="#2b2f38" stroke-width="64"/>
  <path d="M-10 190 L250 190 Q350 190 350 90 L350 -10" fill="none" stroke="#fff" stroke-width="64" stroke-dasharray="0" opacity="0.06"/>
  <path d="M-10 160 L250 160 Q320 160 320 90 L320 -10" fill="none" stroke="#fff" stroke-width="2"/>
  <path d="M-10 220 L250 220 Q380 220 380 90 L380 -10" fill="none" stroke="#fff" stroke-width="2"/>
  <path d="M0 208 C120 208 190 206 250 190" fill="none" stroke="#19e06a" stroke-width="7" stroke-dasharray="14 9"/>
  <path d="M150 207 C200 205 235 198 262 184" fill="none" stroke="#ffcf1a" stroke-width="7" stroke-dasharray="14 9"/>
  <path d="M205 201 C260 190 318 168 328 110" fill="none" stroke="#ff2a1a" stroke-width="7" stroke-dasharray="14 9"/>
  <path d="M328 110 C334 70 368 40 372 0" fill="none" stroke="#19e06a" stroke-width="7" stroke-dasharray="14 9"/>
  <text x="18" y="150" class="tl">1 · flat out on green</text>
  <text x="150" y="246" class="tl" dy="-22">2 · brake hard, in a straight line, when it turns red</text>
  <text x="225" y="100" class="tl" text-anchor="end">3 · turn in, clip the inside kerb</text>
  <text x="300" y="30" class="tl" text-anchor="end">4 · back on the power</text>
</svg>`;

const drsSvg = `
<svg viewBox="0 0 420 150" class="tdiag">
  <rect x="0" y="50" width="420" height="56" fill="#2b2f38"/>
  <rect x="150" y="50" width="230" height="56" fill="#0f7a3b" opacity="0.55"/>
  <line x1="70" y1="44" x2="70" y2="112" stroke="#fff" stroke-width="3"/>
  <text x="70" y="34" class="tl" text-anchor="middle">detection line</text>
  <text x="265" y="34" class="tl" text-anchor="middle">DRS zone</text>
  <rect x="28" y="70" width="26" height="12" rx="3" fill="#ffe600"/>
  <rect x="88" y="72" width="26" height="12" rx="3" fill="#8fd3ff"/>
  <path d="M56 92 L86 92" stroke="#fff" stroke-width="2" marker-end="url(#a)"/>
  <text x="70" y="130" class="tl" text-anchor="middle">gap under 1.0 s here…</text>
  <text x="265" y="130" class="tl" text-anchor="middle">…then press SPACE in the green zone</text>
</svg>`;

const pitSvg = `
<svg viewBox="0 0 420 160" class="tdiag">
  <rect x="0" y="26" width="420" height="46" fill="#2b2f38"/>
  <path d="M40 72 C90 72 100 110 150 110 L300 110 C350 110 350 72 395 72" fill="none" stroke="#3a3f4a" stroke-width="26"/>
  <rect x="120" y="84" width="200" height="5" fill="#e9e9e9"/>
  <path d="M40 66 C92 70 102 108 150 110" fill="none" stroke="#35b6ff" stroke-width="5" stroke-dasharray="10 7"/>
  <rect x="196" y="118" width="34" height="22" fill="none" stroke="#ffe600" stroke-width="2"/>
  <rect x="150" y="142" width="170" height="14" fill="#c9cdd2"/>
  <text x="46" y="18" class="tl">keep to the pit side · follow the blue arrows</text>
  <text x="213" y="134" class="tl" text-anchor="middle" style="font-size:9px">BOX</text>
  <text x="335" y="104" class="tl">80 km/h</text>
</svg>`;

const PAGES = [
  {
    title: 'Controls',
    body: `
      <div class="tkeys">
        <div>${key('W')} or ${key('↑')}<span>Throttle</span></div>
        <div>${key('S')} or ${key('↓')}<span>Brake (hold when stopped to reverse)</span></div>
        <div>${key('A')} ${key('D')} or ${key('←')} ${key('→')}<span>Steer. Tap for small corrections, hold for more lock</span></div>
        <div>${key('SPACE', 'w')}<span>DRS, when the DRS light is green</span></div>
        <div>${key('SHIFT', 'w')}<span>Overtake: full battery boost while held</span></div>
        <div>${key('F')}<span>Flashback: rewind ten seconds after a mistake</span></div>
        <div>${key('C')} ${key('B')} ${key('V')} ${key('N')}<span>Camera · look back · mirror · track map</span></div>
        <div>${key('[')} ${key(']')}<span>Field of view of the current camera</span></div>
        <div>${key('ESC', 'w')}<span>Pause: replay, options, this guide</span></div>
      </div>
      <p class="tnote">These are the defaults. Every key can be changed under Options · Controls, where you can also set the field of view for each camera, the cockpit halo and the track map style.</p>
      <p class="tnote">A gamepad works too: triggers for pedals, left stick to steer, A for DRS, X for ERS, d-pad up to pit.</p>`,
  },
  {
    title: 'Driving: follow the racing line',
    body: `${cornerSvg}
      <p>The arrows on the road show the fastest path, and their colour tells you what to do <b>right now</b>:
      <b class="g">green</b> = flat out, <b class="y">yellow</b> = lift off, <b class="r">red</b> = brake.</p>
      <p>These cars stop astonishingly quickly but only in a straight line. Brake first, <i>then</i> turn. Come off the brakes as you turn in,
      and wait until the car is pointing down the next straight before going back to full throttle.</p>
      <p class="tnote">Slow in, fast out. If you keep sliding wide, you are arriving too fast: brake a little earlier.</p>`,
  },
  {
    title: 'Qualifying and the start',
    body: `
      <p><b>Qualifying.</b> Before the race you get the track to yourself for <b>one flying lap</b>. You roll up to the start line, and the clock
      runs from the moment you cross it until you cross it again. Your time against the other drivers' times decides where you start.
      Stay inside the white lines: a lap with all four wheels off the track is deleted, and you get one more try.
      You can skip qualifying by choosing a fixed or random grid slot in the menu.</p>
      <div class="tlights"><i></i><i></i><i></i><i></i><i></i></div>
      <p><b>The start.</b> Five red lights come on one by one. When they all go <b>out</b>, go. You cannot move before that, so hold the throttle and be ready.
      Turn 1 on the opening lap is crowded: brake earlier than usual and leave room.</p>
      <p class="tnote">The mirror at the top of the screen shows who is right behind you. Finish in the top three and you are on the podium.</p>`,
  },
  {
    title: 'DRS and ERS: how to overtake',
    body: `${drsSvg}
      <p><b>DRS</b> opens a flap in the rear wing for more top speed. You get it when you cross a <b>detection line</b> less than
      <b>one second</b> behind another car (from lap 2). The HUD then shows <b class="g">DRS READY</b>; when you reach the zone it flashes
      <b class="g">DRS AVAILABLE</b>: press ${key('SPACE', 'w')} once. It closes by itself when you brake.
      Boards beside the track and green "DRS" paint on the road mark each zone. In time trial you can use it every lap.</p>
      <p><b>ERS</b> is the battery. Hold ${key('SHIFT', 'w')} at full throttle for an extra 160 hp. It recharges under braking, so save it for
      attacking or defending on the straights.</p>
      <p class="tnote">Sit in the slipstream behind a car to gain speed, then pull out and brake later on the inside.</p>`,
  },
  {
    title: 'The pit stop',
    body: `${pitSvg}
      <p>Every driver has to make <b>one pit stop</b> for new tyres during the race. The panel at the bottom left tells you which laps to do it on
      (your <b class="g">pit window</b>) and which tyres you will get. There is nothing to choose.</p>
      <p><b>How:</b> there is no button. When your window opens a banner tells you; at the end of that lap keep to the pit side of the
      track and follow the <b class="b">blue arrows</b> into the pit entry. From there the car drives itself: speed limiter, stop, the crew
      swaps all four tyres in about 2.5 seconds, and you get control back at the pit exit.</p>
      <p><span class="tyre s">S</span> Soft is fastest but wears out soonest, <span class="tyre m">M</span> Medium is the balance,
      <span class="tyre h">H</span> Hard is slowest and lasts longest. The tyre % in the HUD shows what is left; worn tyres have less grip, which is why
      the stop matters.</p>
      <p class="tnote">Miss the stop altogether and 20 seconds are added to your race time. You can turn pit stops off in the menu.</p>`,
  },
  {
    title: 'Track limits, flags and assists',
    body: `
      <p><b>Track limits.</b> The white lines are the edge of the track. Put all four wheels beyond them and the lap is flagged:
      three warnings, then a 5 second penalty each time. Kerbs are fine; grass and gravel are very slippery.</p>
      <p><b>Stuck or facing the wrong way?</b> Press ${key('R')} to be put back on the track.</p>
      <p><b>Assists</b> (main menu): traction control and ABS stop wheelspin and lock-ups, stability assist catches slides,
      brake assist slows you for corners if you miss the braking point, DRS assist opens the wing for you and ERS assist
      spends the battery for you. They live under Advanced settings; turn them off one at a time as you get quicker.</p>
      <p class="tnote">Start with AI difficulty around 30. If you are winning from the midfield every time, raise it by 10.</p>`,
  },
];

export class Tutorial {
  constructor() {
    this.el = document.getElementById('tutorial');
    this.page = 0;
    this.isOpen = false;
    if (!this.el) return;
    this.el.innerHTML = `
      <div class="tcardbox">
        <div class="thead"><span id="tstep"></span><button id="tclose">SKIP ✕</button></div>
        <h2 id="ttitle"></h2>
        <div id="tbody"></div>
        <div class="tnav"><button id="tprev">◂ BACK</button><div id="tdots"></div><button id="tnext">NEXT ▸</button></div>
      </div>`;
    this.el.querySelector('#tclose').onclick = () => this.close();
    this.el.querySelector('#tprev').onclick = () => this.go(-1);
    this.el.querySelector('#tnext').onclick = () => this.go(1);
  }

  firstRun() {
    try {
      if (new URLSearchParams(location.search).get('auto')) return;
      if (localStorage.getItem('apex.tutorial')) return;
      this.open();
    } catch (e) { /* storage unavailable: just do not auto-open */ }
  }

  open(page = 0) {
    if (!this.el) return;
    this.page = page; this.isOpen = true;
    this.el.style.display = 'flex';
    this.render();
    try { localStorage.setItem('apex.tutorial', '1'); } catch (e) { /* ignore */ }
  }

  close() { this.isOpen = false; if (this.el) this.el.style.display = 'none'; }

  go(d) {
    const n = this.page + d;
    if (n >= PAGES.length) { this.close(); return; }
    this.page = Math.max(0, n);
    this.render();
  }

  keys(pressed) {
    if (pressed.has('Escape')) this.close();
    else if (pressed.has('ArrowRight') || pressed.has('Enter') || pressed.has('KeyD')) this.go(1);
    else if (pressed.has('ArrowLeft') || pressed.has('KeyA')) this.go(-1);
  }

  render() {
    const p = PAGES[this.page], q = (id) => this.el.querySelector(id);
    q('#tstep').textContent = `HOW TO PLAY · ${this.page + 1} / ${PAGES.length}`;
    q('#ttitle').textContent = p.title;
    q('#tbody').innerHTML = p.body;
    q('#tprev').style.visibility = this.page ? 'visible' : 'hidden';
    q('#tnext').textContent = this.page === PAGES.length - 1 ? 'GOT IT ✓' : 'NEXT ▸';
    q('#tdots').innerHTML = PAGES.map((_, k) => `<i class="${k === this.page ? 'on' : ''}"></i>`).join('');
  }
}
