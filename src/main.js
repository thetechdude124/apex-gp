import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { TRACKS } from './sim/tracks.js';
import { buildTrack } from './sim/trackgen.js';
import { Race } from './sim/race.js';
import { AIDriver } from './sim/ai.js';
import { COMPOUNDS, tyreGrip } from './sim/physics.js';
import { buildWorld } from './render/world.js';
import { buildPitLane, buildDrsMarkers, wheelSwap, jackLift, STAGGER } from './render/pitlane.js';
import { buildPodium } from './render/podium.js';
import { Mirror } from './render/mirror.js';
import { Tutorial } from './tutorial.js';
import { prefs } from './prefs.js';
import { bindings } from './bindings.js';
import { Options, view, cfg } from './options.js';
import { takeSnapshot, restoreSnapshot } from './sim/snapshot.js';
import { Recorder } from './replay.js';
import { buildCar, setCompound } from './render/carmodel.js';
import { Effects } from './render/effects.js';
import { Audio } from './audio.js';
import { HUD, fmtTime } from './hud.js';
import { TEAMS } from './teams.js';
import { InputFilter } from './inputfilter.js';
import { aiParams } from './sim/difficulty.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- renderer
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 30000);
scene.add(camera);

// Renders the scene into its own multisampled target (with a depth texture the AO pass reads)
// and hands the resolved image to the post chain. Only this pass pays for MSAA: the full-screen
// passes after it (AO, bloom, grade) run on plain buffers, far cheaper at laptop-retina sizes.
class SceneMSAAPass extends Pass {
  constructor(scn, cam, samples, wantDepth) {
    super();
    this.scene = scn; this.camera = cam;
    const opts = { type: THREE.HalfFloatType, samples };
    if (wantDepth) { opts.depthTexture = new THREE.DepthTexture(4, 4); opts.depthTexture.type = THREE.UnsignedIntType; } // resolving MSAA depth is not free
    this.rt = new THREE.WebGLRenderTarget(4, 4, opts);
    this.fsq = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), vertexShader: CopyShader.vertexShader, fragmentShader: CopyShader.fragmentShader, depthTest: false, depthWrite: false }));
    this.needsSwap = false;
  }
  setSize(w, h) { this.rt.setSize(w, h); }
  render(rnd, writeBuffer, readBuffer) {
    rnd.setRenderTarget(this.rt);
    rnd.render(this.scene, this.camera);
    this.fsq.material.uniforms.tDiffuse.value = this.rt.texture;
    rnd.setRenderTarget(readBuffer);
    this.fsq.render(rnd);
  }
  dispose() { this.rt.depthTexture?.dispose(); this.rt.dispose(); this.fsq.dispose(); }
}

let composer, bloom, fxPass, aoPass, scenePass;
const QUALITY = {
  low: { pr: 1, shadow: 1024, bloom: false, samples: 0, ao: false },
  med: { pr: Math.min(1.5, devicePixelRatio), shadow: 2048, bloom: true, samples: 4, ao: false },
  high: { pr: Math.min(2, devicePixelRatio), shadow: 4096, bloom: true, samples: 4, ao: true },
};
let quality = QUALITY.high;

// Final pass: speed blur (on the HDR image, so highlights streak like on a real sensor), then
// tone mapping + display encoding, then the grade. One full-screen pass instead of two.
const FXShader = {
  uniforms: { tDiffuse: { value: null }, ca: { value: 0.001 }, vig: { value: 0.3 }, time: { value: 0 }, blur: { value: 0 }, sat: { value: 0.94 }, con: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float ca; uniform float vig; uniform float time; uniform float blur; uniform float sat; uniform float con; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float d = length(c);
      // radial speed blur: grows toward the edges of the frame, zero in the centre where you look
      float amt = blur * smoothstep(0.12, 0.75, d);
      vec3 col;
      if (amt > 0.0004) {
        col = vec3(0.0);
        float j = h(vUv * 311.0) * 0.2;
        for (int i = 0; i < 6; i++) { float t = (float(i) + j) / 5.0; col += texture2D(tDiffuse, vUv - c * amt * t).rgb; }
        col /= 6.0;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
        // a trace of lens fringing at the very edge (only where the frame is sharp: mixing sharp
        // red/blue into blurred green paints coloured outlines around everything at speed)
        vec2 off = c * ca * d * 4.0;
        col.r = mix(col.r, texture2D(tDiffuse, vUv + off).r, 0.5);
        col.b = mix(col.b, texture2D(tDiffuse, vUv - off).b, 0.5);
      }
      #ifdef TONE_MAPPING
        col = toneMapping(col);
      #endif
      col = linearToOutputTexel(vec4(col, 1.0)).rgb;
      // film-style grade: slightly lower saturation, gentle S-curve contrast
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat);
      col = (col - 0.5) * con + 0.5;
      col *= 1.0 - vig * smoothstep(0.35, 0.95, d);
      col += (h(vUv * 800.0) - 0.5) * 0.014;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// Dynamic resolution: if the machine cannot hold the frame rate at the tier's native pixel
// ratio, the internal resolution steps down (and cautiously back up) instead of the game stuttering.
// (?rs=<scale> in the URL pins the scale, for testing)
const dyn = { scale: 1, acc: 0, n: 0, good: 0, bad: 0, block: 0, last: 0, fixed: +new URLSearchParams(location.search).get('rs') || 0 };
if (dyn.fixed) dyn.scale = dyn.fixed;
function applyRenderScale() {
  const p = quality.pr * dyn.scale;
  renderer.setPixelRatio(p);
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(Math.round(innerWidth * p), Math.round(innerHeight * p)); // (the composer was built from a target, so its own pixel ratio is 1)
}
function adaptResolution(now) {
  const dt = now - dyn.last;
  dyn.last = now;
  if (dyn.fixed) return;
  if (dt <= 0 || dt > 250 || document.hidden) { dyn.acc = dyn.n = 0; return; } // paused / tab switch / hitch
  dyn.acc += dt; dyn.n++;
  if (dyn.acc < 1500) return;
  const fps = (dyn.n * 1000) / dyn.acc;
  dyn.acc = dyn.n = 0;
  dyn.block = Math.max(0, dyn.block - 1.5);
  if (fps < 54 && dyn.scale > 0.6) {
    dyn.good = 0;
    if (++dyn.bad < 2) return; // one slow window can be a shader compile or a loading hitch
    dyn.scale = Math.max(0.6, dyn.scale * (fps < 40 ? 0.8 : 0.9));
    // a step up that had to be taken straight back is not retried for a long while
    dyn.bad = 0; dyn.block = now - (dyn.upAt || -1e9) < 20000 ? 400 : 45;
    applyRenderScale();
    window.__renderScale = dyn.scale;
    return;
  }
  dyn.bad = 0;
  if (fps >= 58.5 && dyn.scale < 1 && dyn.block <= 0) {
    if (++dyn.good >= 6) { dyn.scale = Math.min(1, dyn.scale / 0.93); dyn.good = 0; dyn.block = 20; dyn.upAt = now; applyRenderScale(); }
  } else dyn.good = 0;
  window.__renderScale = dyn.scale;
}

function setupComposer() {
  const p = quality.pr * dyn.scale;
  renderer.setPixelRatio(p);
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  const rt = new THREE.WebGLRenderTarget(w * p, h * p, { type: THREE.HalfFloatType });
  if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); bloom?.dispose?.(); aoPass?.dispose?.(); scenePass?.dispose?.(); }
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1); // sizes below are physical pixels (otherwise every pass is sized by the pixel ratio twice)
  window.__composer = composer;
  scenePass = quality.samples > 0 ? new SceneMSAAPass(scene, camera, quality.samples, quality.ao) : null;
  composer.addPass(scenePass || new RenderPass(scene, camera));
  aoPass = null;
  if (quality.ao && scenePass) {
    // Ground-truth ambient occlusion (ULTRA only), computed at a third of the resolution straight from the
    // scene's own depth buffer: darkens the creases light cannot reach (under the cars, inside
    // the cockpit and wheel arches, the foot of the barriers) without drawing the scene twice.
    aoPass = new GTAOPass(scene, camera, 4, 4, undefined,
      { radius: 0.9, distanceExponent: 1.0, thickness: 1.5, scale: 2.0, samples: 8, distanceFallOff: 1.0, screenSpaceRadius: false });
    const ao = aoPass, depth = scenePass.rt.depthTexture;
    ao._renderGBuffer = false;
    const gm = ao.gtaoMaterial;
    gm.defines.NORMAL_VECTOR_TYPE = 0; gm.defines.DEPTH_SWIZZLING = 'x';
    gm.uniforms.tNormal.value = null; gm.uniforms.tDepth.value = depth;
    // - depth precision runs out far away, where a 0.9 m radius is sub-pixel anyway: fade AO out
    // - keep the view distance in alpha so the blur below can respect edges with a single texture
    gm.fragmentShader = gm.fragmentShader
      .replace('ao = pow(ao, scale);', 'ao = pow(ao, scale); ao = mix(ao, 1., smoothstep(90., 240., -viewPos.z));')
      .replace('gl_FragColor = FRAGMENT_OUTPUT;', 'gl_FragColor = vec4(vec3(ao), -viewPos.z);');
    gm.needsUpdate = true;
    // The stock Poisson denoiser rebuilds normals from depth for every tap (~80 fetches a pixel).
    // The AO noise is a 5x5 dither, so a 5x5 depth-aware box blur removes it at a fraction of the cost.
    const blurMat = new THREE.ShaderMaterial({
      uniforms: { tAO: { value: ao.gtaoRenderTarget.texture }, px: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D tAO; uniform vec2 px; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tAO, vUv);
          float z = c.a, sum = c.r, w = 1.0, tol = 1.0 / (0.03 * z + 0.06);
          for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) {
            if (i == 0 && j == 0) continue;
            vec4 s = texture2D(tAO, vUv + vec2(float(i), float(j)) * px);
            float k = max(0.0, 1.0 - abs(s.a - z) * tol);
            sum += s.r * k; w += k;
          }
          gl_FragColor = vec4(vec3(sum / w), 1.0);
        }`,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    });
    ao.gtaoRenderTarget.texture.minFilter = ao.gtaoRenderTarget.texture.magFilter = THREE.NearestFilter;
    ao.setSize = (W, H) => {
      const w2 = Math.ceil(W / 3), h2 = Math.ceil(H / 3); // a third of the frame each way: AO is soft, and this is ~8x cheaper than half
      ao.width = w2; ao.height = h2;
      ao.gtaoRenderTarget.setSize(w2, h2); ao.pdRenderTarget.setSize(w2, h2);
      gm.uniforms.resolution.value.set(w2, h2);
      blurMat.uniforms.px.value.set(1 / w2, 1 / h2);
    };
    // multiply the AO straight onto the image (the stock pass copies the whole frame first)
    ao.needsSwap = false;
    ao.render = (rnd, writeBuffer, readBuffer) => {
      const g = gm.uniforms;
      g.cameraNear.value = camera.near; g.cameraFar.value = camera.far;
      g.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
      g.cameraProjectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
      g.cameraWorldMatrix.value.copy(camera.matrixWorld);
      ao.renderPass(rnd, gm, ao.gtaoRenderTarget, 0xffffff, 1.0);
      ao.renderPass(rnd, blurMat, ao.pdRenderTarget, 0xffffff, 1.0);
      ao.blendMaterial.uniforms.intensity.value = ao.blendIntensity;
      ao.blendMaterial.uniforms.tDiffuse.value = ao.pdRenderTarget.texture;
      ao.renderPass(rnd, ao.blendMaterial, readBuffer);
    };
    const aoDispose = ao.dispose.bind(ao);
    ao.dispose = () => { blurMat.dispose(); aoDispose(); };
    composer.addPass(aoPass);
  }
  // threshold is in HDR units: only emissive lights, sparks and sun glare bloom, not the whole sky
  bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.4, 2.6);
  bloom.enabled = quality.bloom;
  {
    // bloom is a soft glow: a quarter-resolution first mip is indistinguishable and much cheaper
    const full = bloom.setSize.bind(bloom);
    bloom.setSize = (W, H) => full(Math.ceil(W / 2), Math.ceil(H / 2));
  }
  composer.addPass(bloom);
  fxPass = new ShaderPass(FXShader);
  composer.addPass(fxPass);
  const draw = composer.render.bind(composer);
  composer.render = (dt) => { adaptResolution(performance.now()); draw(dt); };
}
function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  setupComposer();
}
addEventListener('resize', onResize);
onResize();

// ---------------------------------------------------------------- input
const keys = new Set();
const pressed = new Set();
addEventListener('keydown', (e) => {
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') && e.target.type !== 'range';
  if (options.isOpen) { e.preventDefault(); options.key(e.code); return; } // remapping keys / closing the overlay
  if (typing) return; // typing a driver name must not drive the car
  if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  audio.init();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const inputFilter = new InputFilter();
let padPrev = [], padFlash = false;

function readInput(dt, v) {
  const k = (id) => bindings.held(id, keys);
  let thrT = k('throttle') ? 1 : 0;
  let brkT = k('brake') ? 1 : 0;
  let steerT = (k('left') ? 1 : 0) - (k('right') ? 1 : 0);
  let drs = k('drs'), ers = k('ers');
  let up = bindings.hit('shiftUp', pressed), down = bindings.hit('shiftDown', pressed);
  let analog = false;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...pads].find((p) => p && p.connected);
  if (gp) {
    const ax = gp.axes[0] || 0;
    const sx = Math.abs(ax) < 0.08 ? 0 : Math.sign(ax) * Math.pow((Math.abs(ax) - 0.08) / 0.92, 1.4);
    const rt = gp.buttons[7]?.value || 0, lt = gp.buttons[6]?.value || 0;
    if (Math.abs(sx) > 0 || rt > 0.02 || lt > 0.02) {
      analog = true;
      steerT = -sx; thrT = Math.max(thrT, rt); brkT = Math.max(brkT, lt);
    }
    const b = (i) => gp.buttons[i]?.pressed;
    const bp = (i) => b(i) && !padPrev[i];
    drs = drs || b(0); ers = ers || b(2);
    up = up || bp(5); down = down || bp(4);
    if (bp(3)) cycleCamera();
    if (bp(13)) padFlash = true;               // d-pad down: flashback
    if (bp(9)) togglePause();
    lookBack = b(1);
    padPrev = gp.buttons.map((x) => x.pressed);
  }
  // optional brake assist: gets you slowed for the corner if you miss the braking point
  if (settings?.brakeAssist && race?.racing && !player.pit) {
    const lp = race.humanProfile(lineGrip), T = race.T, v = player.body.speed();
    const tgt = lp[(player.idx + Math.round((v * 0.2 + 4) / T.ds)) % T.N];
    if (v > tgt + 0.5) { brkT = Math.max(brkT, clamp((v - tgt) / 5, 0.25, 1)); thrT = 0; }
  }
  const out = inputFilter.update(dt, { thr: thrT, brk: brkT, steer: steerT, analog }, player.body, settings?.steerAssist !== false);
  // DRS assist: the flap opens by itself whenever it is allowed
  if (settings?.drsAuto && player.drsAvail && race.inDrsZone(player.idx) && brkT < 0.05) drs = true;
  // overtake button: full electric boost wherever you ask for it. ERS assist: the battery is also
  // spent for you where it is worth most, accelerating out of corners, keeping a reserve.
  boosting = ers;
  if (!ers && view.ers === 'assist' && race.racing && thrT > 0.9 && player.body.speed() < 70 && player.body.ers > player.body.p.ersCap * 0.15) ers = true;
  return { ...out, drs, ers, shiftUp: up, shiftDown: down };
}

// ---------------------------------------------------------------- state
const audio = new Audio();
const hud = new HUD();
const effects = new Effects(scene);
const trackCache = new Map();
let world = null, race = null, cars = [], player = null, ghost = null;
let paused = false, running = false, lookBack = false;
let camMode = 0;
const CAMS = ['TV POD', 'COCKPIT', 'CHASE', 'FAR CHASE', 'TRACKSIDE'];
let showroom = null;
const camRig = new THREE.Object3D();
let camGrade = 0;
let settings = null;
let introT = 0;
let resultsShown = 0;
let lastGear = 1;
let camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camVel = new THREE.Vector3();
let shake = 0;
let tvSpots = [];
let tyreFxT = 0;
let trialGhost = null, trialRec = [], bestRec = null;
let pitFx = null, lineGrip = 1, drsWas = '', lineOn = true;
let podium = null, podiumT = 0, pitCam = false;
let boosting = false, bottoming = 0;
let mfd = null, sideGlass = null, fadedHalo = null;
const mirror = new Mirror(renderer);
let mirrorOn = true, mirrorRect = null;
const tutorial = new Tutorial();
const options = new Options(() => applyLive());

// ---------------------------------------------------------------- menu
function drawTrackPreview(cv, T) {
  const c = cv.getContext('2d');
  cv.width = 300; cv.height = 200;
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let i = 0; i < T.N; i++) { minx = Math.min(minx, T.x[i]); maxx = Math.max(maxx, T.x[i]); miny = Math.min(miny, T.y[i]); maxy = Math.max(maxy, T.y[i]); }
  const s = Math.min(260 / (maxx - minx), 160 / (maxy - miny));
  const ox = (300 - (maxx - minx) * s) / 2, oy = (200 - (maxy - miny) * s) / 2;
  c.lineJoin = 'round';
  c.beginPath();
  for (let i = 0; i <= T.N; i += 3) { const k = i % T.N; const x = ox + (T.x[k] - minx) * s, y = 200 - (oy + (T.y[k] - miny) * s); i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.closePath();
  c.strokeStyle = '#e10600'; c.lineWidth = 9; c.globalAlpha = 0.25; c.stroke();
  c.globalAlpha = 1; c.strokeStyle = '#fff'; c.lineWidth = 3.5; c.stroke();
  c.fillStyle = '#e10600'; c.fillRect(ox + (T.x[0] - minx) * s - 4, 200 - (oy + (T.y[0] - miny) * s) - 4, 8, 8);
}

function getTrack(id) {
  if (!trackCache.has(id)) trackCache.set(id, buildTrack(TRACKS.find((t) => t.id === id)));
  return trackCache.get(id);
}

let selTrack = TRACKS[0].id;
function setupMenu() {
  const tracksEl = $('tracks');
  TRACKS.forEach((def) => {
    const card = document.createElement('div');
    card.className = 'tcard' + (def.id === selTrack ? ' sel' : '');
    card.innerHTML = `<canvas></canvas><h3>${def.name}</h3><div class="meta">${def.country}</div><p>${def.blurb}</p>`;
    card.onclick = () => { selTrack = def.id; [...tracksEl.children].forEach((c) => c.classList.remove('sel')); card.classList.add('sel'); };
    tracksEl.appendChild(card);
    setTimeout(() => {
      const T = getTrack(def.id);
      drawTrackPreview(card.querySelector('canvas'), T);
      card.querySelector('.meta').textContent = `${def.country} · ${(T.length / 1000).toFixed(3)} km`;
    }, 50);
  });
  const teamSel = $('team');
  TEAMS.forEach((t, i) => { const o = document.createElement('option'); o.value = i; o.textContent = t.name; teamSel.appendChild(o); });
  // the few things on the menu itself; they are remembered like every other setting
  const modeSeg = $('mode');
  const setMode = (v) => { modeSeg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === v)); cfg.set('mode', v); for (const id of ['laps', 'grid', 'weather', 'diff']) $(id).closest('label').style.display = v === 'trial' && id !== 'weather' ? 'none' : ''; };
  modeSeg.querySelectorAll('button').forEach((b) => (b.onclick = () => setMode(b.dataset.v)));
  for (const id of ['team', 'laps', 'diff', 'grid', 'weather']) {
    const el = $(id);
    // (the weather choice is deliberately not remembered: every visit starts on Random; and a
    // remembered lap count from the short-lived 10-lap default is dropped once)
    if (id === 'laps' && !prefs.get('laps5')) { prefs.set('laps5', 1); cfg.reset(['laps']); }
    if (id !== 'weather') el.value = cfg.get(id);
    if (el.tagName === 'SELECT' && el.selectedIndex < 0) el.selectedIndex = 0;
    el.addEventListener('input', () => { if (id !== 'weather') cfg.set(id, el.type === 'number' || el.type === 'range' || id === 'team' ? +el.value : el.value); if (id === 'diff') $('diffv').textContent = el.value; });
  }
  $('diffv').textContent = $('diff').value;
  setMode(cfg.get('mode'));
  $('go').onclick = () => { audio.init(); startSession(readSettings()); };
  $('pResume').onclick = () => togglePause(false);
  $('pRestart').onclick = () => { togglePause(false); startSession(settings); };
  $('pMenu').onclick = () => { togglePause(false); toMenu(); };
  $('pReplay').onclick = () => startReplay('pause');
  $('howto').onclick = () => tutorial.open();
  $('pHelp').onclick = () => tutorial.open();
  $('optBtn').onclick = () => options.open('assists');
  $('pOptions').onclick = () => options.open();
  // driver profile: a preset or your own name, remembered in this browser
  const drv = $('driver'), nm = $('dname');
  DRIVERS.forEach((d, i) => { const o = document.createElement('option'); o.value = i; o.textContent = d.name; drv.appendChild(o); });
  { const o = document.createElement('option'); o.value = 'custom'; o.textContent = 'Custom name…'; drv.appendChild(o); }
  drv.value = prefs.get('driver', 'custom');
  if (drv.selectedIndex < 0) drv.value = 'custom';
  nm.value = prefs.get('driverName', '');
  const syncDrv = () => { nm.style.display = drv.value === 'custom' ? '' : 'none'; prefs.set('driver', drv.value); prefs.set('driverName', nm.value.trim()); };
  drv.onchange = syncDrv; nm.oninput = syncDrv; syncDrv();
  renderHelp();
  tutorial.firstRun();
}

// Built-in player profiles (pick one in the menu to race as that driver)
const DRIVERS = [{ name: 'Nico Dascombe', short: 'DAS' }];
function driverProfile() {
  const sel = $('driver').value;
  if (sel !== 'custom' && DRIVERS[+sel]) return DRIVERS[+sel];
  const name = $('dname').value.trim().replace(/[<>&]/g, '').slice(0, 24);
  if (!name) return { name: 'You', short: 'YOU' };
  const last = name.split(/\s+/).pop().replace(/[^A-Za-zÀ-ÿ]/g, '');
  return { name, short: (last || name).slice(0, 3).toUpperCase() };
}

// one-line key summary on the menu (always the current bindings)
function renderHelp() {
  const t = (id) => `<b>${bindings.text(id)}</b>`;
  $('helpkeys').innerHTML = `${t('throttle')} go · ${t('brake')} brake · <b>${bindings.text('left')} · ${bindings.text('right')}</b> steer · ${t('ers')} overtake boost · ${t('flashback')} rewind 10 s · ${t('camera')} camera · <b>ESC</b> pause, replay, settings<br>`
    + 'New here? Press <b>? HOW TO PLAY</b>. Driving aids are on by default; keys, views and aids can be changed in Advanced settings.';
}
function readSettings() {
  const on = (k) => cfg.get(k) === 'on';
  const custom = cfg.get('livery') === 'custom';
  return {
    track: selTrack, mode: cfg.get('mode'), laps: clamp(+$('laps').value || 5, 1, 50), opps: clamp(+cfg.get('opps'), 0, 19),
    diff: +$('diff').value, team: +$('team').value, grid: $('grid').value, weather: $('weather').value, tyres: cfg.get('tyres'), time: cfg.get('time'),
    tc: on('tc'), abs: on('abs'), steerAssist: on('stability'), steerSpeed: cfg.get('steerSpeed') / 100, brakeAssist: on('brakeAssist'), manual: cfg.get('gearbox') === 'manual', line: on('line'),
    driver: driverProfile(), car: { custom, color: cfg.get('color'), color2: cfg.get('color2'), number: +cfg.get('number') || 0 },
    quality: cfg.get('quality'), pits: cfg.get('pits'), limits: cfg.get('limits'), rotation: +cfg.get('rotation'), mirror: on('mirror'), drsAuto: cfg.get('drs') === 'assist',
  };
}

// settings changed in the overlay while a session is running: apply the ones that can change live
function applyLive() {
  renderHelp();
  hud.mapMode = view.map;
  if (!running || !settings) return;
  const s = settings, on = (k) => cfg.get(k) === 'on';
  s.tc = on('tc'); s.abs = on('abs'); s.steerAssist = on('stability'); s.brakeAssist = on('brakeAssist'); s.drsAuto = cfg.get('drs') === 'assist';
  s.steerSpeed = cfg.get('steerSpeed') / 100; s.manual = cfg.get('gearbox') === 'manual';
  const p = race.player;
  p.assists.tc = s.tc; p.assists.abs = s.abs; p.assists.esc = s.steerAssist; p.body.manual = s.manual;
  inputFilter.speed = s.steerSpeed;
  lineOn = on('line'); mirrorOn = on('mirror');
  if (s.quality !== cfg.get('quality')) { s.quality = cfg.get('quality'); quality = QUALITY[s.quality] || QUALITY.high; onResize(); world.sun.shadow.mapSize.set(quality.shadow, quality.shadow); world.sun.shadow.map?.dispose(); world.sun.shadow.map = null; }
}

function toMenu() {
  running = false;
  audio.silence();
  hud.show(false);
  $('results').style.display = 'none';
  $('podium').style.display = 'none';
  $('replaybar').style.display = 'none'; $('rewind').style.display = 'none';
  replay = null; rewind = null;
  $('menu').classList.remove('hidden');
}

// ---------------------------------------------------------------- session
// The rival drivers for this event (fixed for qualifying, the race and any restart).
function makeField(s) {
  const team = TEAMS[s.team];
  let ai = [];
  TEAMS.forEach((t) => t.drivers.forEach(([name, short, num], di) => {
    if (t === team && di === 1) return; // player replaces the team's second driver
    ai.push({ name, short, number: num, team: t.name, color: t.color, color2: t.color2, teamObj: t,
      ...aiParams(s.diff, t.pace, di), compound: ['S', 'S', 'M', 'M', 'M', 'H'][Math.floor(Math.random() * 6)] });
  }));
  // the quickest car/driver combinations make up a short field
  ai.sort((a, b) => b.skill + Math.random() * 0.004 - (a.skill + Math.random() * 0.004));
  return ai.slice(0, s.opps);
}

// the team's livery design repainted in the player's two colours
function customTeam(team, car) {
  const dark = (hex, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
  return { ...team, liveryKey: `${team.name}|${car.color}|${car.color2}`, color: car.color, color2: car.color2, helmet: car.color2,
    livery: team.livery ? { ...team.livery, base: car.color, deep: dark(car.color, 0.42), accent: car.color2 } : undefined };
}

function playerEntry(s, compound = s.tyres) {
  const team = TEAMS[s.team];
  const d = s.driver || { name: 'You', short: 'YOU' };
  const car = s.car || {};
  return { name: d.name, short: d.short, number: car.number || team.drivers[1][2], team: team.name, color: car.custom ? car.color : team.color, color2: car.custom ? car.color2 : team.color2, teamObj: team, isPlayer: true,
    compound, assists: { tc: s.tc, abs: s.abs, esc: s.steerAssist }, manual: s.manual, setup: { diff: s.rotation || 3 } };
}

function buildGrid(s) {
  const me = playerEntry(s);
  if (s.mode === 'trial') return [me];
  const ai = s.field.slice();
  if (s.qualiResult) {
    // grid in qualifying order
    const by = new Map(ai.map((a) => [a.name, a]));
    return s.qualiResult.map((r) => (r.isPlayer ? me : by.get(r.name)));
  }
  const slot = s.grid === 'pole' ? 0 : s.grid === 'back' ? ai.length : s.grid === 'mid' ? Math.min(9, ai.length) : Math.floor(Math.random() * (ai.length + 1));
  ai.splice(slot, 0, me);
  return ai;
}

// One-shot qualifying: every rival's flying lap is driven for real by its AI on an empty track
// (same rolling start as the player gets), so the times match the pace they will race at.
const QUALI_ROLL = { rollBack: 280, rollV: 55 };
function simulateQuali(T, field, weather) {
  const idle = { throttle: 0, brake: 0, steer: 0 };
  return field.map((f) => {
    const r = new Race(T, { laps: 99, mode: 'trial', grid: [{ ...f, compound: 'S' }], ...QUALI_ROLL, weather });
    const e = r.entries[0];
    for (let t = 0; e.lastLap == null && t < 260; t += 1 / 30) r.update(1 / 30, idle);
    return { name: f.name, short: f.short, team: f.team, color: f.color, time: e.lastLap != null ? e.lastLap + Math.random() * 0.12 : 999 };
  }).sort((a, b) => a.time - b.time);
}

function finishQuali() {
  const q = race.quali;
  q.done = true;
  const rows = q.board.map((r) => ({ ...r }));
  const me = { name: player.name, short: player.short, team: player.team, color: player.color, time: q.time, isPlayer: true };
  let at = rows.findIndex((r) => q.time != null && q.time < r.time);
  if (at < 0) at = rows.length;
  rows.splice(at, 0, me);
  q.result = rows;
  player.autopilot = true;
  player.ai = new AIDriver(player, race, { skill: 0.85, aggression: 0, consistency: 1 });
  audio.silence();
  hud.qualiResults(rows, race.T.name);
  $('qRace').onclick = () => { settings.qualiResult = rows; startSession(settings); };
  $('qAgain').onclick = () => startSession(settings);
  $('qMenu').onclick = () => toMenu();
}

function qualiUpdate() {
  const q = race.quali;
  if (!q || q.done) return;
  if (player.lap > q.lapSeen) {
    q.lapSeen = player.lap;
    if (player.lap === 1) hud.toast('FLYING LAP: GO', 'go');
    if (player.lastLap != null && player.lap >= 2) {
      q.attempts++;
      if (player.lastLapValid) { q.time = player.lastLap; q.endT = race.time; }
      else if (q.attempts < 2) hud.toast('LAP DELETED · ONE MORE ATTEMPT', 'warn');
      else { q.time = null; q.endT = race.time; }
    }
  }
  if (q.endT != null && race.time - q.endT > 1.2) finishQuali();
}

function startSession(s) {
  settings = s;
  inputFilter.speed = s.steerSpeed || 1;
  inputFilter.wheel = inputFilter.throttle = inputFilter.brake = 0;
  quality = QUALITY[s.quality] || QUALITY.high;
  $('menu').classList.add('hidden');
  $('results').style.display = 'none';
  $('podium').style.display = 'none';
  $('loading').classList.remove('hidden');
  if (s.mode === 'race' && !s.field) s.field = makeField(s);
  // Weather for the event (qualifying and the race share it). Random: mostly dry, sometimes it
  // changes during the race, sometimes it rains throughout.
  if (!s.wx) {
    let w = s.weather;
    if (w === 'random') { const r = Math.random(); w = s.mode !== 'race' ? 'dry' : r < 0.62 ? 'dry' : r < 0.84 ? 'changing' : 'wet'; }
    if (w === 'changing') w = s.mode !== 'race' ? 'dry' : Math.random() < 0.6 ? 'raining' : 'drying';
    s.wx = w; // 'dry' | 'wet' | 'raining' (dry start, rain arrives) | 'drying' (wet start, dries out)
  }
  // qualifying first, when the grid is to be earned
  const isQuali = s.mode === 'race' && s.grid === 'quali' && s.field.length > 0 && !s.qualiResult;
  $('loadtxt').textContent = isQuali ? 'QUALIFYING · RIVALS ARE SETTING THEIR TIMES' : 'BUILDING CIRCUIT';
  setTimeout(() => {
    const T = getTrack(s.track);
    // teardown
    if (world) world.dispose();
    for (const c of cars) { scene.remove(c.mesh); c.mesh.userData.dispose?.(); }
    if (trialGhost) { scene.remove(trialGhost); trialGhost.userData.dispose?.(); trialGhost = null; }
    effects.clear();
    cars = [];
    onResize();
    renderer.shadowMap.needsUpdate = true;

    podium = null; podiumT = 0;
    const weather = s.wx;
    const wetStart = weather === 'wet' || weather === 'drying';
    if (isQuali) {
      // qualifying is run in the conditions the race will start in
      if (!s.qualiBoard) s.qualiBoard = simulateQuali(T, s.field, wetStart ? 'wet' : 'dry');
      race = new Race(T, { laps: 99, mode: 'trial', grid: [playerEntry(s, 'S')], ...QUALI_ROLL, weather: wetStart ? 'wet' : 'dry', trackLimits: s.limits });
      race.quali = { board: s.qualiBoard, attempts: 0, lapSeen: 0, time: null, endT: null, done: false };
    } else {
      race = new Race(T, { laps: s.laps, mode: s.mode, grid: buildGrid(s), pits: s.pits, weather, trackLimits: s.limits });
    }
    player = race.player;
    const prof = race.profileFor(1.0).I.v;
    lineGrip = 1; drsWas = '';
    world = buildWorld(scene, renderer, T, { time: weather !== 'dry' ? 'overcast' : s.time, profile: prof, lineProfile: race.humanProfile(), poleSide: race.poleSide() });
    pitFx = buildPitLane(world.root, T, { teams: race.boxTeams.map((n) => TEAMS.find((t) => t.name === n)) });
    buildDrsMarkers(world.root, T);
    world.startWeather({ wet: weather !== 'dry', wetness: race.wetness, rain: race.rain, effects }); // sets world.weather (null in settled dry weather)
    world.sun.shadow.mapSize.set(quality.shadow, quality.shadow);
    lineOn = s.line;
    world.line.mesh.visible = s.line;
    effects.setSmokeColor(T.def.scenery === 'desert' ? 0xd9c4a0 : 0xd8d8d8);
    for (const e of race.entries) {
      let team = TEAMS.find((t) => t.name === e.team);
      if (e.isPlayer && s.car?.custom) team = customTeam(team, s.car); // the player's own paint
      const mesh = buildCar(team, e.number, COMPOUNDS[e.body.compound].color);
      scene.add(mesh);
      cars.push({ e, mesh, brakeHeat: 0, sparkT: 0 });
    }
    setupPlayerCar();
    recorder = new Recorder(race.entries.length);
    snaps = []; snapT = 0; rewind = null; replay = null;
    hud.mapMode = view.map;
    if (s.mode === 'trial') {
      trialGhost = buildCar(TEAMS[s.team], 0, '#ffffff');
      trialGhost.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.28; o.material.depthWrite = false; } o.castShadow = false; });
      trialGhost.userData.blob.visible = false;
      trialGhost.visible = false;
      scene.add(trialGhost);
      trialRec = []; bestRec = null;
    }
    // TV camera spots
    tvSpots = [];
    for (let i = 0; i < T.N; i += Math.round(220 / T.ds)) {
      let side = (i / Math.round(220 / T.ds)) % 2 ? 1 : -1;
      if (T.pit.zone[i]) side = -T.pit.side; // never from behind the pit building
      const wall = side === 1 ? T.wallL[i] : T.wallR[i];
      const d = side * (wall + 6);
      tvSpots.push({ i, p: new THREE.Vector3(T.x[i] + T.nx[i] * d, T.h[i] + 5 + Math.random() * 4, -(T.y[i] + T.ny[i] * d)) });
    }
    hud.setTrack(T);
    hud.lastEvt = 0;
    hud.show(true);
    introT = race.mode === 'race' ? 3.0 : 0;
    mirrorOn = s.mirror !== false;
    lineOn = s.line;
    layoutMirror();
    resultsShown = 0;
    paused = false;
    running = true;
    lastGear = 1;
    syncCars(0);
    snapCamera();
    $('loading').classList.add('hidden');
    const wxNote = { wet: 'RAIN', raining: 'DRY NOW · RAIN EXPECTED', drying: 'WET NOW · DRYING LATER' }[weather];
    hud.toast(wxNote && !isQuali ? `${wxNote} · ${s.laps} LAPS` : isQuali ? (wetStart ? 'WET QUALIFYING · ONE FLYING LAP' : 'QUALIFYING · ONE FLYING LAP') : s.mode === 'race' ? `${T.name.toUpperCase()} · ${s.laps} LAPS` : `TIME TRIAL · ${T.name.toUpperCase()}`);
  }, 30);
}

// The player's own car gets three live parts: the steering-wheel display, the two wing mirrors
// (showing the rear-view render) and a halo that can be faded out of the cockpit view.
function setupPlayerCar() {
  const ud = cars.find((c) => c.e === player).mesh.userData;
  if (mfd) { mfd.tex.dispose(); mfd.mat.dispose(); }
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  mfd = { cv, g: cv.getContext('2d'), tex, mat: new THREE.MeshBasicMaterial({ map: tex }), key: '' };
  ud.screen.material = mfd.mat;
  if (sideGlass) for (const g of sideGlass) { g.geo.dispose(); g.mat.dispose(); }
  sideGlass = ud.mirrors.map(({ mesh, side }) => {
    // each mirror shows its own side of the wide rear view: the far edge of the glass looks furthest out
    const geo = mesh.geometry.clone(), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, side === 1 ? 0.46 * (1 - u) : 1 - 0.46 * u, 0.12 + 0.76 * v); }
    const mat = new THREE.MeshBasicMaterial({ map: mirror.rt.texture });
    mesh.geometry = geo; mesh.material = mat;
    return { mesh, geo, mat };
  });
  if (!fadedHalo) fadedHalo = new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.5, transparent: true, opacity: 0.2, depthWrite: false });
}

function drawMfd() {
  const b = player.body, g = mfd.g;
  const rev = Math.max(0, Math.min(15, Math.round(((b.rpm - 7000) / (b.p.rpmMax - 7000)) * 15)));
  const gear = b.gear === -1 ? 'R' : b.gear === 0 ? 'N' : String(b.gear);
  const kmh = Math.round(b.speed() * 3.6), ers = Math.round((b.ers / b.p.ersCap) * 100);
  const key = `${rev}|${gear}|${kmh}|${ers}|${player.pos}|${player.lap}|${b.drsOpen}`;
  if (key === mfd.key) return;
  mfd.key = key;
  g.fillStyle = '#04060a'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 15; i++) { g.fillStyle = i >= rev ? '#1a1d24' : i < 5 ? '#00e676' : i < 10 ? '#ff1744' : '#7c4dff'; g.fillRect(10 + i * 16, 6, 12, 9); }
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillStyle = '#ffe600'; g.font = '900 78px Arial'; g.fillText(gear, 128, 92);
  g.fillStyle = '#ffffff'; g.font = '800 30px Arial'; g.fillText(String(kmh), 50, 62);
  g.fillStyle = '#8a93a0'; g.font = '700 13px Arial'; g.fillText('KM/H', 50, 80);
  g.fillStyle = b.deploying ? '#ffe600' : '#7fd4ff'; g.font = '800 30px Arial'; g.fillText(String(ers), 206, 62);
  g.fillStyle = '#8a93a0'; g.font = '700 13px Arial'; g.fillText('ERS %', 206, 80);
  g.fillStyle = '#ffffff'; g.font = '800 18px Arial';
  g.fillText(race.mode === 'race' ? `P${player.pos}` : 'TT', 50, 116); g.fillText(`L${Math.max(1, player.lap)}`, 206, 116);
  if (b.drsOpen) { g.fillStyle = '#00e676'; g.fillRect(96, 100, 64, 20); g.fillStyle = '#000'; g.font = '900 15px Arial'; g.fillText('DRS', 128, 116); }
  mfd.tex.needsUpdate = true;
}

function togglePause(force) {
  if (!running) return;
  paused = force === undefined ? !paused : force;
  $('pause').style.display = paused ? 'flex' : 'none';
  if (paused) audio.silence();
}

function cycleCamera() {
  camMode = (camMode + 1) % CAMS.length;
  hud.toast(`CAMERA: ${CAMS[camMode]}`);
  snapCamera();
}

// ---------------------------------------------------------------- per-frame visuals
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

function carWorldPos(e, out) {
  return out.set(e.body.X, (e.h ?? 0), -e.body.Y);
}

function syncCars(dt) {
  const T = race.T;
  for (const c of cars) {
    const { e, mesh } = c;
    const b = e.body;
    if (c.parked && !replay) { // parc ferme in front of the podium
      mesh.position.copy(c.parked.pos); mesh.rotation.set(0, c.parked.rotY, 0); mesh.visible = true;
      mesh.userData.driver.visible = false;
      for (const w of mesh.userData.wheels) if (w.front) w.steer.rotation.y = 0;
      continue;
    }
    let herr = b.psi - Math.atan2(T.ty[e.idx], T.tx[e.idx]);
    const grade = (e.grade || 0) * Math.cos(herr);
    // ride height follows the surface the car is on: verges fall away by a few centimetres, the
    // pit lane and its apron are level with the track (a bigger drop here used to bury the wheels)
    const over = Math.abs(e.d) - T.width / 2 - 1.4;
    const inPits = e.pit || e.replayPit || (T.pit.zone[e.idx] && e.d * T.pit.side > 0);
    const off = over <= 0 ? 0 : inPits ? -0.012 : -0.012 - Math.min(0.06, over * 0.008);
    const kerbBump = e.surfF?.bump === 1 && b.speed() > 5 ? Math.sin(e.s * 2.6) * 0.012 : 0; // kerb ridges, not noise
    mesh.position.set(e.rX ?? b.X, (e.rH ?? e.h ?? 0) + off + kerbBump, -(e.rY ?? b.Y));
    mesh.rotation.order = 'YZX';
    mesh.rotation.y = e.rPsi ?? b.psi;
    // stiff race suspension: a few millimetres of dive and roll, no more
    mesh.rotation.z = Math.atan(grade) + clamp(b.axS * 0.00022, -0.011, 0.007);
    mesh.rotation.x = clamp(b.ayS * 0.00038, -0.019, 0.019);
    const ud = mesh.userData;
    for (const w of ud.wheels) {
      if (w.front) w.steer.rotation.y = b.delta;
      w.spin.rotation.z = -(w.front ? b.frontWheelAng || 0 : b.wheelAng);
    }
    // DRS flap (pivots about its trailing edge: the leading edge lifts to open the slot)
    const target = b.drsOpen ? 0.46 : 0;
    ud.flapPivot.rotation.z += (target - ud.flapPivot.rotation.z) * Math.min(1, dt * 14);
    ud.steeringWheel.rotation.x = -b.delta * 5.5;
    // rear light blinks while harvesting
    const blink = Math.floor(performance.now() / 120) % 2 === 0;
    ud.rearLight.material.emissiveIntensity = b.harvest > 0.2 && blink ? 5 : 0.4;
    // brake glow
    c.brakeHeat = clamp(c.brakeHeat + ((e.input?.brake || 0) * b.speed() * 0.02 - 0.35) * dt, 0, 1);
    for (const w of ud.wheels) w.disc.material.emissiveIntensity = c.brakeHeat * 2.5;
    // hide own helmet in cockpit cam
    const inCockpit = e === player && CAMS[camMode] === 'COCKPIT' && !lookBack && !pitCam && !podium;
    ud.driver.visible = !inCockpit;
    const haloMode = inCockpit ? view.halo : 'solid';
    if (c.haloMode !== haloMode) {
      if (!c.haloMat) c.haloMat = ud.halo.material;
      c.haloMode = haloMode; ud.halo.visible = haloMode !== 'hidden'; ud.halo.material = haloMode === 'faded' ? fadedHalo : c.haloMat;
    }
    mesh.visible = !(e.ghost > 0 && Math.floor(performance.now() / 100) % 2 === 0) && !(podium && e.pit);
    pitAnim(c);
  }
}

// Tyre change: the car goes up on its jacks, the four old wheels are pulled off and carried out,
// the new set (in its compound colour) comes in and goes on, and the car drops.
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function pitAnim(c) {
  const { e, mesh } = c, p = e.pit, wheels = mesh.userData.wheels;
  if (!(p && p.stop && p.phase === 'stop')) {
    if (c.pitAnim) {
      for (const w of wheels) { w.steer.position.copy(w.home); w.steer.rotation.x = 0; w.steer.visible = true; }
      c.pitAnim = false; c.pitFresh = false; c.pitSnd = 0;
      pitFx.crews[e.box].userData.pose(-1);
    }
    return;
  }
  if (!c.pitAnim) { c.pitAnim = true; c.oldHex = (COMPOUNDS[e.body.compound] || COMPOUNDS.M).color; }
  const f = clamp(p.stopT / p.dur, 0, 1);
  const newHex = (COMPOUNDS[p.to] || COMPOUNDS.M).color;
  const lift = jackLift(f);
  mesh.position.y += lift;
  // the sidewalls take the new compound's colour once every corner has its new wheel in hand
  if (f >= 0.47 && !c.pitFresh) { c.pitFresh = true; setCompound(mesh, newHex); } // (all four are in the crew's hands at that moment)
  wheels.forEach((w, k) => {
    if (!w.home) w.home = w.steer.position.clone();
    // the car's own wheel plays the old wheel until it is clear, then the new one from when it arrives;
    // in between, the crew's stand-in wheels are the ones on show (same positions, so nothing jumps)
    const s = wheelSwap(clamp(f - STAGGER[k], 0, 1)), sg = Math.sign(w.home.z);
    const q = s.showOld ? s.old : s.neu;
    w.steer.visible = s.showOld || s.showNew;
    w.steer.position.set(w.home.x + q.x, w.home.y + q.h - lift, w.home.z + sg * q.z);
    w.steer.rotation.set(sg * q.tilt, 0, 0);
    w.spin.rotation.z += q.roll;
  });
  // the crew moves with the wheels
  pitFx.crews[e.box].userData.pose(f, newHex, c.oldHex);
  // wheel guns: off, then on (four guns, never quite together)
  if (e.isPlayer) { const stage = f > 0.68 ? 2 : f > 0.09 ? 1 : 0; if (stage > (c.pitSnd || 0)) { c.pitSnd = stage; for (let k = 0; k < 4; k++) setTimeout(() => { audio.crack(0.13); setTimeout(() => audio.crack(0.1), 70); }, STAGGER[k] * p.dur * 1000 + k * 12); } }
}

function emitEffects(dt) {
  const T = race.T;
  for (const c of cars) {
    const { e, mesh } = c;
    const b = e.body;
    const v = b.speed();
    if (v < 3) continue;
    const dCam = mesh.position.distanceTo(camera.position);
    if (dCam > 220) continue;
    const vel = _w.set(b.vx * Math.cos(b.psi) - b.vy * Math.sin(b.psi), 0, -(b.vx * Math.sin(b.psi) + b.vy * Math.cos(b.psi)));
    const at = (lx, lz) => _v.set(lx, 0.05, lz).applyQuaternion(mesh.quaternion).add(mesh.position);
    if (b.lockF || b.slideF > 0.85) { for (const s of [-1, 1]) effects.tyreSmoke(at(1.98, s * 0.8), vel, b.lockF ? 1 : b.slideF * 0.6); }
    if (b.spinR || b.slideR > 0.85) { for (const s of [-1, 1]) effects.tyreSmoke(at(-1.62, s * 0.78), vel, b.spinR ? 1 : b.slideR * 0.6); }
    if ((e.surfR.drag > 0.1 || e.surfF.drag > 0.1) && v > 6 && Math.random() < 0.7) effects.dust(at(-1.62, (Math.random() - 0.5) * 1.6), vel);
    // sparks: high speed, heavy load, kerbs, crests
    // the floor touches down where the car is squashed: compressions, heavy braking at speed, kerbs
    const g1 = e.grade || 0;
    const comp = dt > 0 ? ((g1 - (c.grade0 ?? g1)) / dt) * v : 0; // vertical acceleration from the road's shape
    c.grade0 = g1;
    c.comp = (c.comp || 0) + (comp - (c.comp || 0)) * Math.min(1, dt * 10);
    const load = v > 60 ? Math.min(1.3, (v - 60) / 30) : 0;
    const p = load * (0.06 + (c.comp > 2.2 ? 0.9 : 0) + (b.axS < -32 ? 0.45 : 0)) + (e.surfF.bump === 1 && v > 30 ? 0.4 : 0);
    if (e === player) bottoming = Math.max(bottoming * Math.exp(-dt * 9), Math.min(1, p));
    if (Math.random() < p * dt * 30) effects.spark(at(-1.0 - Math.random() * 0.8, (Math.random() - 0.5) * 0.9), vel, mesh.position.y + 0.02);
  }
  effects.update(dt);
}

// ---------------------------------------------------------------- camera
function snapCamera() {
  if (!player) return;
  const m = cars.find((c) => c.e === player).mesh;
  const fwd = _v.set(1, 0, 0).applyQuaternion(m.quaternion);
  camPos.copy(m.position).addScaledVector(fwd, -6.5).add(new THREE.Vector3(0, 2.0, 0));
  camLook.copy(m.position);
}

function updateCamera(dt) {
  const pc = cars.find((c) => c.e === player);
  if (!pc) return;
  const m = pc.mesh, b = player.body;
  const v = b.speed();
  const yawQ = _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.rPsi ?? b.psi);
  const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(yawQ);
  let fov = 60 + clamp(v / 90, 0, 1) * 9;
  const T = race.T;
  if (podium && !replay) { podium.camera(camera, podiumT); return; }

  if (showroom) {
    const a = showroom.ang * Math.PI / 180 + b.psi;
    camera.position.set(m.position.x + Math.cos(a) * showroom.r, m.position.y + showroom.h, m.position.z - Math.sin(a) * showroom.r);
    camera.lookAt(m.position.x, m.position.y + (showroom.ty ?? 0.45), m.position.z);
    camera.fov = showroom.fov ?? 38; camera.updateProjectionMatrix();
    return;
  }
  if (introT > 0) {
    // grid flyby: orbit around the player's car
    const a = introT * 0.55 + 1.2;
    const r = 9 + introT * 1.5;
    camera.position.set(m.position.x + Math.cos(a) * r, m.position.y + 2.2 + introT * 0.5, m.position.z + Math.sin(a) * r);
    camera.lookAt(m.position.x, m.position.y + 0.5, m.position.z);
    camera.fov = 50; camera.updateProjectionMatrix();
    snapCamera();
    return;
  }
  // pit stop: watch the tyre change from the pit lane, front three-quarter
  {
    const p = player.pit;
    if (p && p.stop && (p.phase === 'stop' || (!p.serviced && p.box - p.r < 16) || (p.serviced && p.r - p.box < 5))) {
      const i = player.idx, sd = -T.pit.side;
      const want = m.position.clone().addScaledVector(fwd, 6.6).add(new THREE.Vector3(T.nx[i] * sd * 5.0, 2.3, -T.ny[i] * sd * 5.0));
      if (!pitCam) { pitCam = true; camPos.copy(camera.position); camLook.copy(m.position); }
      camPos.lerp(want, 1 - Math.exp(-dt * 3.2));
      camLook.lerp(m.position.clone().add(new THREE.Vector3(0, 0.55, 0)), 1 - Math.exp(-dt * 10));
      camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(camLook);
      camera.near = 0.3; camera.fov += (48 - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
      return;
    }
    if (pitCam) { pitCam = false; snapCamera(); }
  }
  const mode = lookBack ? 'back' : CAMS[camMode];
  let wantNear = 0.5;
  if (mode === 'CHASE' || mode === 'FAR CHASE' || mode === 'back') {
    const far = mode === 'FAR CHASE';
    fov = view.fov(far ? 'FAR CHASE' : 'CHASE') + clamp(v / 90, 0, 1) * 9;
    const dist = (far ? 8.5 : 5.4) + v * 0.01;
    const hgt = far ? 2.6 : 1.55;
    // blend heading toward velocity direction (shows slides)
    const velDir = new THREE.Vector3(b.vx * Math.cos(b.psi) - b.vy * Math.sin(b.psi), 0, -(b.vx * Math.sin(b.psi) + b.vy * Math.cos(b.psi)));
    const dir = v > 5 ? fwd.clone().lerp(velDir.normalize(), 0.35).normalize() : fwd.clone();
    const sign = mode === 'back' ? -1 : 1;
    const want = m.position.clone().addScaledVector(dir, -dist * sign).add(new THREE.Vector3(0, hgt, 0));
    const k = 1 - Math.exp(-dt * (mode === 'back' ? 30 : 9));
    camPos.lerp(want, k);
    // keep vertical tight to the car (crests)
    camPos.y += (want.y - camPos.y) * (1 - Math.exp(-dt * 14));
    const look = m.position.clone().addScaledVector(fwd, 4 * sign).add(new THREE.Vector3(0, 0.9, 0));
    camLook.lerp(look, 1 - Math.exp(-dt * 20));
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  } else if (mode === 'TV POD' || mode === 'COCKPIT') {
    // rigidly mounted on the car: TV pod sits on top of the airbox, cockpit is the driver's eye
    const pod = mode === 'TV POD';
    // Mounted on the chassis: follows heading and the road's gradient, nothing else. The view never
    // swings with the steering input, and pedal-induced dive / roll is left to the bodywork you see.
    camGrade += ((player.grade || 0) - camGrade) * Math.min(1, dt * 6);
    camRig.position.copy(m.position);
    camRig.rotation.order = 'YZX';
    camRig.rotation.set(0, player.rPsi ?? b.psi, Math.atan(camGrade));
    camRig.updateMatrix();
    const local = pod ? new THREE.Vector3(-0.38, 1.17, 0) : new THREE.Vector3(0.34, 0.80, 0);
    wantNear = pod ? 0.5 : 0.12; // the pod's own housing / airbox is clipped out of view
    camera.position.copy(local.applyMatrix4(camRig.matrix));
    camera.up.set(0, 1, 0);
    camera.lookAt(new THREE.Vector3(20, pod ? -0.75 : 0.32, 0).applyMatrix4(camRig.matrix));
    fov = view.fov(mode) + clamp(v / 90, 0, 1) * (pod ? 7 : 6);
  } else if (mode === 'TRACKSIDE') {
    let best = tvSpots[0], bd = 1e9;
    for (const s of tvSpots) {
      let di = player.idx - s.i;
      if (di < -T.N / 2) di += T.N; if (di > T.N / 2) di -= T.N;
      const score = Math.abs(di + 25);
      if (score < bd) { bd = score; best = s; }
    }
    camera.position.copy(best.p);
    camLook.lerp(m.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 1 - Math.exp(-dt * 12));
    camera.lookAt(camLook);
    const dist = best.p.distanceTo(m.position);
    fov = clamp(2 * Math.atan(14 / dist) * 57.3, 6, 55);
  }
  // vibration: kerbs and impacts only (smooth, decaying), plus a whisper at very high speed
  const kerb = player.surfF?.bump === 1 && v > 8 ? 0.5 : player.surfF?.bump > 1 ? 0.8 : 0;
  shake = Math.max(shake * Math.exp(-dt * 7), kerb);
  const onboard = mode === 'TV POD' || mode === 'COCKPIT';
  const amp = shake * 0.012 + (onboard ? clamp((v - 70) / 30, 0, 1) * 0.0015 : 0);
  if (mode !== 'TRACKSIDE' && amp > 0.0005) {
    const tt = performance.now() * 0.001;
    camera.position.y += Math.sin(tt * 61) * amp;
    camera.position.x += Math.sin(tt * 47 + 1.3) * amp * 0.4;
  }
  camera.near = wantNear;
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- audio mix
function updateAudio() {
  if (!audio.ctx || paused) return;
  const b = player.body;
  audio.setEngine(audio.player, b.rpm, player.input?.throttle ?? 0, camMode <= 1 ? 0.85 : 0.7);
  if (b.gear !== lastGear) {
    if (b.gear > lastGear && lastGear >= 1) audio.upshift(0.2);
    else if (b.gear < lastGear && b.gear >= 1) audio.downshift(0.3);
    lastGear = b.gear;
  }
  audio.setTurbo(b.rpm, player.input?.throttle ?? 0, 1 / 60);
  // the two ends of the car sound different: the rear squeals, the front scrubs
  const onRoad = b.speed() > 6 && player.surfF.drag === 0;
  audio.setSqueal(onRoad ? Math.max(b.spinR ? 0.8 : 0, b.slideR * 0.9) : 0);
  audio.setScrub(onRoad ? Math.max(b.lockF ? 1 : 0, b.slideF * 0.9) : 0);
  audio.setKerb(player.surfF?.bump === 1 || player.surfR?.bump === 1 ? b.speed() : 0);
  audio.setScrape(bottoming > 0.3 ? bottoming : 0);
  if (bottoming > 0.6) shake = Math.max(shake, 0.35);
  audio.setWind(b.speed());
  audio.setRain(race.rain > 0.02 ? race.rain * (0.6 + Math.min(0.4, b.speed() / 200)) : 0);
  audio.setGravel(player.surfR.drag > 0.1 && b.speed() > 3 ? Math.min(1, player.surfR.drag * 1.5) : 0);
  if (player.impact > 2.5) { audio.thump(player.impact / 14); shake = 2; }
  player.impact = 0;
  for (const c of cars) if (!c.e.isPlayer) c.e.impact = 0;
  // nearest rivals
  const near = cars.filter((c) => !c.e.isPlayer).map((c) => ({ c, d: c.mesh.position.distanceTo(camera.position) })).sort((a, b2) => a.d - b2.d).slice(0, 3);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  audio.rivals.forEach((eng, k) => {
    const n = near[k];
    if (!n) { audio.setEngine(eng, 4000, 0, 0); return; }
    const rel = n.c.mesh.position.clone().sub(camera.position);
    const pan = rel.clone().normalize().dot(right);
    const ob = n.c.e.body;
    const ov = new THREE.Vector3(ob.vx * Math.cos(ob.psi), 0, -ob.vx * Math.sin(ob.psi));
    const pv = new THREE.Vector3(b.vx * Math.cos(b.psi), 0, -b.vx * Math.sin(b.psi));
    const radial = rel.clone().normalize().dot(ov.clone().sub(pv));
    const doppler = clamp(1 - radial / 343, 0.8, 1.25);
    const g = 1 / Math.pow(1 + n.d / 12, 1.3);
    audio.setEngine(eng, ob.rpm, n.c.e.input?.throttle ?? 0.5, g * 1.4, pan, doppler);
  });
}

// ---------------------------------------------------------------- main loop
let last = performance.now();
let recorder = null, snaps = [], snapT = 0, rewind = null, replay = null, holdT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  window.__fps = (window.__fps || 60) * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
  if (tutorial.isOpen) { tutorial.keys(pressed); pressed.clear(); if (!running) { renderMenuBackdrop(dt); return; } }
  if (!running) { pressed.clear(); padFlash = false; renderMenuBackdrop(dt); return; }
  const hit = (id) => bindings.hit(id, pressed);
  if (replay) replayFrame(dt);
  else {
    if (pressed.has('Escape')) togglePause();
    if (hit('camera')) cycleCamera();
    if (hit('line')) { lineOn = !lineOn; hud.toast(`RACING LINE ${lineOn ? 'ON' : 'OFF'}`); }
    if (hit('help')) { togglePause(true); tutorial.open(); }
    if (hit('mute')) { audio.setMaster(audio.volume > 0 ? 0 : 0.7); hud.toast(audio.volume > 0 ? 'SOUND ON' : 'MUTED'); }
    if (hit('mirror')) { mirrorOn = !mirrorOn; hud.toast(`MIRROR ${mirrorOn ? 'ON' : 'OFF'}`); }
    if (hit('map')) { view.map = { full: 'follow', follow: 'off', off: 'full' }[view.map]; hud.mapMode = view.map; hud.toast(`TRACK MAP: ${{ full: 'WHOLE CIRCUIT', follow: 'FOLLOW', off: 'OFF' }[view.map]}`); }
    if ((hit('fovUp') || hit('fovDown')) && CAMS[camMode] !== 'TRACKSIDE') { const v = view.setFov(CAMS[camMode], view.fov(CAMS[camMode]) + (hit('fovUp') ? 2 : -2)); hud.toast(`${CAMS[camMode]} FIELD OF VIEW ${v}°`); }
    if (!gpLook()) lookBack = bindings.held('lookBack', keys);
    if (!paused && !tutorial.isOpen && !options.isOpen) {
      if (rewind) rewindFrame(dt);
      else liveFrame(dt, hit);
    }
  }
  fxPass.uniforms.time.value = now * 0.001;
  {
    const sp = clamp((player.body.speed() - 25) / 65, 0, 1);
    const onboard = CAMS[camMode] === 'TV POD' || CAMS[camMode] === 'COCKPIT';
    fxPass.uniforms.ca.value = 0.00006 + sp * 0.0001;
    fxPass.uniforms.blur.value = paused || podium || rewind || (replay && !replay.playing) ? 0 : sp * sp * (onboard ? 0.085 : 0.05);
  }
  // rear-view image: the strip at the top of the screen and the player's two wing mirrors
  const driving = !podium && !replay && !showroom && introT <= 0 && !pitCam && !race.quali?.done;
  const showMirror = driving && mirrorOn && mirrorRect && race.entries.length > 1 && !lookBack && CAMS[camMode] !== 'TRACKSIDE';
  $('mirror').style.visibility = showMirror ? 'visible' : 'hidden';
  if ((showMirror || (driving && CAMS[camMode] === 'COCKPIT')) && !paused) {
    const pm = cars.find((c) => c.e === race.player).mesh;
    mirror.every = quality === QUALITY.low ? 3 : 2;
    for (const g of sideGlass) g.mesh.visible = false; // never draw the mirror into itself
    mirror.update(scene, pm.position, race.player.rPsi ?? race.player.body.psi, camGrade);
    for (const g of sideGlass) g.mesh.visible = true;
  }
  composer.render();
  if (showMirror) mirror.draw(mirrorRect.x, mirrorRect.y, mirrorRect.w, mirrorRect.h, innerWidth, innerHeight);
  pressed.clear(); padFlash = false;
}

// one frame of normal play
function liveFrame(dt, hit) {
  const inp = readInput(dt, player.body.speed());
  if (hit('reset') && race.racing && !player.pit && !player.autopilot) { race.recover(player); hud.toast('RESET TO TRACK'); }
  if (hit('flashback') || padFlash) startRewind();
  if (introT > 0) {
    introT -= dt;
    if (introT <= 0 && race.state === 'grid') race.start();
  }
  if (holdT > 0) holdT -= dt; // a beat to get your hands back on the wheel after a flashback
  else {
    race.update(dt, inp);
    if (podium) { for (let k = 0; k < 3; k++) race.update(dt, inp); } // the rest of the field finishes while the ceremony runs
    // flashback buffer (last ~16 s) and the replay recording
    const live = race.racing && !podium && player.finishedAt == null && !race.quali?.done;
    if (live) { snapT += dt; if (snapT >= 0.2) { snapT = 0; snaps.push(takeSnapshot(race)); if (snaps.length > 82) snaps.shift(); } }
    if (!podium && !race.quali?.done && race.state !== 'grid') recorder.sample(race, dt);
  }
  if (podium) { podiumT += dt; podium.update(dt); }
  qualiUpdate();
  sessionFx(dt);
  if (race.state === 'lights') {
    const prevOn = world.lightsOn ?? 0;
    if (race.lightsOn !== prevOn) { if (race.lightsOn > prevOn) audio.beep(660, 0.15, 0.2); world.lightsOn = race.lightsOn; }
  }
  world.setLights(race.lightsOn, race.state !== 'lights');
  if (race.state === 'racing' && world.lightsOn) { world.lightsOn = 0; audio.beep(1320, 0.3, 0.25); }
  syncCars(dt);
  drawMfd();
  world.line.mesh.visible = lineOn && !player.pit && !podium;
  world.line.update(player.idx, player.body.speed());
  emitEffects(dt);
  world.weather?.setState(race.wetness, race.rain);
  world.weather?.update(dt, camera, cars); // rain + spray
  updateCamera(dt);
  if (!podium && !race.quali?.done) updateAudio();
  followSun();
  hud.boost = boosting;
  hud.update(race, player, dt);
  timeTrial(dt);
  if (race.mode === 'race' && player.finishedAt != null && !podium) {
    resultsShown += dt;
    const top = race.order.slice(0, 3);
    if (resultsShown > 2.5 && (top.every((e) => e.finishedAt != null) || resultsShown > 14)) startPodium(top);
  }
}

function followSun() {
  const pm = cars.find((c) => c.e === player).mesh.position, pb = player.body;
  world.followSun(_v.set(pm.x + Math.cos(pb.psi) * 40, pm.y, pm.z - Math.sin(pb.psi) * 40));
}

// ---------------------------------------------------------------- flashback
// Rewind about ten seconds: the buffered snapshots are played backwards quickly, then the race
// carries on from there as if the last ten seconds had not happened.
function startRewind() {
  if (rewind || podium || !race.racing || player.finishedAt != null || race.quali?.done) return;
  if (snaps.length < 8) { hud.toast('FLASHBACK: NOTHING TO REWIND YET', 'warn'); return; }
  let to = 0;
  for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i].t <= race.time - 10) { to = i; break; }
  rewind = { i: snaps.length - 1, to, acc: 0 };
  audio.silence(); audio.blowOff?.(0.9);
  effects.clear();
  $('rewind').style.display = 'flex';
}

function rewindFrame(dt) {
  rewind.acc += (dt * 12) / 0.2; // snapshots are 0.2 s apart: run back at about 12x
  while (rewind.acc >= 1 && rewind.i > rewind.to) { rewind.acc -= 1; rewind.i--; }
  restoreSnapshot(race, snaps[rewind.i]);
  syncCars(dt);
  updateCamera(dt);
  followSun();
  if (rewind.i > rewind.to) return;
  // arrived: drop the future and hand the car back
  snaps.length = rewind.to + 1;
  recorder.truncate(race.time);
  rewind = null; holdT = 0.7; snapT = 0;
  $('rewind').style.display = 'none';
  inputFilter.wheel = 0; inputFilter.throttle = inputFilter.brake = 0;
  hud.lastEvt = race.events.length;
  lastGear = player.body.gear; drsWas = ''; lineGrip = -1;
  for (const c of cars) setCompound(c.mesh, (COMPOUNDS[c.e.body.compound] || COMPOUNDS.M).color);
  trialRec = []; trialRec.lapStart = player.lapStart; trialRec.partial = true; // this lap's ghost recording is no longer complete
  if (CAMS[camMode] === 'CHASE' || CAMS[camMode] === 'FAR CHASE') snapCamera();
  hud.toast('FLASHBACK', 'go');
}

// ---------------------------------------------------------------- replay
// The session so far, played back from the recording with free choice of camera and car.
const fmtClock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function startReplay(from) {
  if (!recorder || recorder.count < 60 || replay) return;
  replay = { t: recorder.start, speed: 1, playing: true, focus: race.player.id, save: takeSnapshot(race), cam: camMode, from, hud: $('hud').style.display, paused };
  paused = false;
  camMode = CAMS.indexOf('TRACKSIDE');
  $('pause').style.display = 'none'; $('results').style.display = 'none'; $('podium').style.display = 'none';
  hud.show(false);
  for (const c of cars) { c.parkedWas = c.parked; c.parked = null; c.shown = null; }
  if (podium) podium.group.visible = false;
  for (const g of pitFx.crews) g.visible = false;
  pitFx.guide.visible = false;
  world.line.mesh.visible = false;
  $('replaybar').style.display = 'flex';
  audio.silence();
}

function endReplay() {
  const r = replay;
  replay = null;
  restoreSnapshot(race, r.save);
  player = race.player;
  camMode = r.cam;
  for (const c of cars) { c.parked = c.parkedWas; setCompound(c.mesh, (COMPOUNDS[c.e.body.compound] || COMPOUNDS.M).color); }
  if (podium) podium.group.visible = true;
  $('replaybar').style.display = 'none';
  $('hud').style.display = r.hud;
  audio.silence();
  lastGear = player.body.gear;
  syncCars(0); snapCamera();
  if (r.from === 'results') $('results').style.display = 'block';
  else { paused = true; $('pause').style.display = 'flex'; }
}

function replayFrame(dt) {
  const r = replay, end = recorder.start + recorder.duration;
  if (pressed.has('Escape')) { endReplay(); return; }
  if (pressed.has('Space')) { if (r.t >= end - 0.05) r.t = recorder.start; r.playing = !r.playing; }
  if (pressed.has('ArrowLeft')) r.t -= 5;
  if (pressed.has('ArrowRight')) r.t += 5;
  if (pressed.has('Home')) r.t = recorder.start;
  const n = race.entries.length;
  if (pressed.has('ArrowUp') || pressed.has('Tab')) { r.focus = race.order ? race.order[(race.order.indexOf(race.entries[r.focus]) + n - 1) % n].id : (r.focus + n - 1) % n; snapSoon = true; }
  if (pressed.has('ArrowDown')) { r.focus = race.order ? race.order[(race.order.indexOf(race.entries[r.focus]) + 1) % n].id : (r.focus + 1) % n; snapSoon = true; }
  if (bindings.hit('camera', pressed)) cycleCamera();
  if (pressed.has('Digit1')) r.speed = 0.25; if (pressed.has('Digit2')) r.speed = 0.5; if (pressed.has('Digit3')) r.speed = 1; if (pressed.has('Digit4')) r.speed = 2;
  const step = r.playing ? dt * r.speed : 0;
  r.t = clamp(r.t + step, recorder.start, end);
  if (r.t >= end) r.playing = false;
  recorder.apply(race, r.t, step);
  player = race.entries[r.focus];
  for (const c of cars) if (c.shown !== c.e.replayCompound) { c.shown = c.e.replayCompound; setCompound(c.mesh, (COMPOUNDS[c.shown] || COMPOUNDS.M).color); }
  syncCars(step);
  if (snapSoon) { snapSoon = false; snapCamera(); }
  emitEffects(step);
  world.weather?.update(step, camera, cars);
  updateCamera(Math.max(step, 1e-3));
  if (r.playing) updateAudio(); else audio.silence();
  followSun();
  const el = $('replaybar');
  const key = `${Math.floor(r.t)}|${r.playing}|${r.speed}|${r.focus}|${camMode}`;
  if (key !== r.key) {
    r.key = key;
    const e = race.entries[r.focus];
    el.innerHTML = `<b>REPLAY</b><span class="rt">${fmtClock(r.t - recorder.start)} / ${fmtClock(recorder.duration)}</span><div class="rbar"><i style="width:${(((r.t - recorder.start) / Math.max(1, recorder.duration)) * 100).toFixed(1)}%"></i></div>`
      + `<span class="rc" style="border-color:${e.color}">${e.name}</span><span>${CAMS[camMode]}</span><span>${r.playing ? r.speed + '×' : 'PAUSED'}</span>`
      + `<small><kbd>SPACE</kbd> play/pause · <kbd>←</kbd><kbd>→</kbd> 5 s · <kbd>↑</kbd><kbd>↓</kbd> car · <kbd>${bindings.text('camera')}</kbd> camera · <kbd>1</kbd>–<kbd>4</kbd> speed · <kbd>ESC</kbd> exit</small>`;
  }
}
let snapSoon = false;

// Pit stops need no button: while the stop is still to be made and the window is open (or
// overdue), putting the car on the pit-side white line at the pit entry is the request.
function pitFlow() {
  const T = race.T, P = T.pit;
  const wrong = race.wrongTyres(player); // the weather has turned: these tyres no longer suit the track
  const due = race.mode === 'race' && race.pitRule !== 'off' && race.racing && (player.stops === 0 || wrong) && player.finishedAt == null && !player.pit && !player.autopilot;
  const lap = Math.max(1, player.lap), [w0, w1] = player.plan.window;
  const open = due && (wrong || lap >= w0);
  const r = P.rel(player.s), dl = player.d * P.side;
  if (!player.autopilot && !player.pit) player.pitReq = open && r > P.e0 - 30 && r < P.nose0 && dl > T.width / 2 - 1.3;
  pitFx.guide.visible = open;
  // banner: when the window opens, and again on the approach to the pit entry
  const side = P.side === 1 ? 'LEFT' : 'RIGHT';
  const win = w1 > w0 ? `LAPS ${w0}–${w1}` : `LAP ${w0}`;
  let b = null;
  const wxWhat = wrong ? (race.wantWets() ? 'RAIN · PIT FOR WET TYRES' : 'TRACK IS DRY · PIT FOR SLICK TYRES') : null;
  if (wrong && due && r > P.e0 - 750 && r < P.e0 + 40) b = [`${wxWhat} · ENTRY AHEAD`, `Keep <b>${side}</b> and follow the blue arrows into the pit lane. The car does the rest.`];
  else if (wrong && due && (race.time % 14) < 7) b = [wxWhat, `These tyres do not suit the track any more. At the end of the lap keep <b>${side}</b> and follow the blue arrows.`];
  else if (open && r > P.e0 - 750 && r < P.e0 + 40) b = [lap > w1 ? 'PIT NOW · ENTRY AHEAD' : 'PIT ENTRY AHEAD', `Keep <b>${side}</b> and follow the blue arrows into the pit lane. The car does the rest.`];
  else if (open && lap === w0 && race.time - (player.lapStart ?? race.time) < 8) b = [`PIT STOP DUE · ${win}`, `At the end of the lap keep <b>${side}</b> and follow the blue arrows into the pit lane.`];
  else if (due && lap > w1 && race.time - (player.lapStart ?? race.time) < 6) b = ['YOU STILL NEED TO PIT', `Head for the pit lane at the end of this lap: keep <b>${side}</b>, follow the blue arrows.`];
  hud.pitBanner = b;
  return open;
}

function layoutMirror() {
  const r = $('mirror').getBoundingClientRect();
  mirrorRect = r.width > 10 ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null;
}
addEventListener('resize', () => { if (running) layoutMirror(); });

// podium ceremony: the top three cars are parked in front of the podium in the pit lane
function startPodium(top) {
  const T = race.T;
  podium = buildPodium(world.root, T, top.map((e) => ({ team: TEAMS.find((t) => t.name === e.team), name: e.name })), T.name);
  podiumT = 0;
  top.forEach((e, k) => { cars.find((c) => c.e === e).parked = podium.cars[k]; });
  for (const g of pitFx.crews) g.visible = false;
  hud.show(false);
  audio.silence();
  [523, 659, 784, 1047].forEach((f, k) => setTimeout(() => audio.beep(f, k === 3 ? 0.5 : 0.16, 0.16), 300 + k * 170)); // fanfare
  const lead = top[0];
  const card = (e, k) => `<div class="pc p${k + 1}${e.isPlayer ? ' me' : ''}"><i>${k + 1}</i><b>${e.name}</b><span style="border-color:${e.color}">${e.team}</span><em>${k === 0 ? fmtTime(e.finishedAt - race.raceStart) : (lead.finLaps ?? 0) > (e.finLaps ?? 0) ? '+1 LAP' : fmtTime(e.finishedAt - lead.finishedAt, true)}</em></div>`;
  const order = [top[1], top[0], top[2]].filter(Boolean);
  $('podium').innerHTML = `<h2>${T.name.toUpperCase()} · PODIUM</h2><div class="pcs">${order.map((e) => card(e, top.indexOf(e))).join('')}</div>`
    + `<div class="pyou">${player.pos <= 3 ? 'YOU ARE ON THE PODIUM' : `YOU FINISHED P${player.pos}`}</div><button id="podGo">CLASSIFICATION ▸</button>`;
  $('podium').style.display = 'flex';
  $('podGo').onclick = () => {
    $('podium').style.display = 'none';
    hud.results(race);
    $('resRestart').onclick = () => startSession(settings);
    $('resMenu').onclick = () => toMenu();
    $('resReplay').onclick = () => startReplay('results');
  };
}

// things that follow the session state: markers, tyre colours after a stop, DRS tones
function sessionFx(dt) {
  const T = race.T;
  for (const c of cars) if (c.e.tyreChanged) { c.e.tyreChanged = false; setCompound(c.mesh, COMPOUNDS[c.e.body.compound].color); }
  if (player.pitExit) { player.pitExit = false; inputFilter.wheel = 0; inputFilter.throttle = inputFilter.brake = 0; }
  const pitOpen = pitFlow();
  // crews stand ready while their car is due in or being serviced
  for (let k = 0; k < pitFx.crews.length; k++) pitFx.crews[k].visible = false;
  if (!podium) for (const e of race.entries) { const r = T.pit.rel(e.s); if ((e.pit && !e.pit.serviced) || ((e.pitReq || (e === player && pitOpen)) && r < 0 && r > -900)) pitFx.crews[e.box].visible = true; }
  // the racing line and brake assist follow the grip the tyres have left
  const g = Math.floor(player.body.gripMul * tyreGrip(player.body.tyreWear) * 50 + 1e-6) / 50; // rounded down: the line errs on the safe side
  if (g !== lineGrip) { lineGrip = g; world.line.setProfile(race.humanProfile(g)); }
  // DRS tones: two beeps when it becomes available in the zone, one when the flap opens
  const st = player.body.drsOpen ? 'open' : player.drsAvail && race.inDrsZone(player.idx) ? 'avail' : '';
  if (st !== drsWas) {
    if (st === 'avail') { audio.beep(1250, 0.07, 0.16); setTimeout(() => audio.beep(1250, 0.07, 0.16), 130); }
    else if (st === 'open') audio.beep(1700, 0.09, 0.14);
    drsWas = st;
  }
}

function gpLook() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  return [...pads].some((p) => p && p.connected && p.buttons[1]?.pressed);
}

function timeTrial(dt) {
  if (race.mode !== 'trial') return;
  const b = player.body;
  if (player.lapStart == null) return;
  const t = race.time - player.lapStart;
  if (!trialRec.lapStart || trialRec.lapStart !== player.lapStart) {
    // new lap started: if last lap was the best, keep its recording as the ghost
    if (trialRec.length && !trialRec.partial && player.lastLap != null && player.lastLap === player.bestLap && player.lastLapValid) bestRec = trialRec;
    trialRec = []; trialRec.lapStart = player.lapStart;
  }
  if (!trialRec.length || t - trialRec[trialRec.length - 1][0] > 1 / 30) trialRec.push([t, b.X, b.Y, b.psi, player.h]);
  if (bestRec && trialGhost) {
    let k = 0;
    while (k < bestRec.length - 1 && bestRec[k + 1][0] < t) k++;
    const a = bestRec[k], c = bestRec[Math.min(bestRec.length - 1, k + 1)];
    const f = c[0] > a[0] ? clamp((t - a[0]) / (c[0] - a[0]), 0, 1) : 0;
    let dpsi = c[3] - a[3]; dpsi = Math.atan2(Math.sin(dpsi), Math.cos(dpsi));
    trialGhost.visible = t < bestRec[bestRec.length - 1][0];
    trialGhost.position.set(a[1] + (c[1] - a[1]) * f, a[4] + (c[4] - a[4]) * f, -(a[2] + (c[2] - a[2]) * f));
    trialGhost.rotation.set(0, a[3] + dpsi * f, 0);
  }
}

// ---------------------------------------------------------------- menu backdrop
function renderMenuBackdrop() {
  renderer.setClearColor(0x000000);
  renderer.clear();
}

setupMenu();
requestAnimationFrame(frame);
// ?auto=<trackId>[&cam=n][&mode=trial] starts a session straight away (handy for testing / shortcuts)
{
  const q = new URLSearchParams(location.search);
  if (q.get('auto')) {
    selTrack = q.get('auto');
    const s = readSettings();
    if (q.get('mode')) s.mode = q.get('mode');
    if (q.get('q')) s.quality = q.get('q');
    if (q.get('cam')) camMode = +q.get('cam');
    if (q.get('time')) s.time = q.get('time');
    if (q.get('laps')) s.laps = +q.get('laps');
    if (q.get('team')) s.team = +q.get('team');
    // driving-model test hooks: ?wet=1 (rain), ?diff=1..5 (differential), ?limits=off (no track limits)
    s.wx = q.get('wx') || (q.get('wet') === '1' ? 'wet' : 'dry'); // test shortcut sessions are dry unless asked (?wx=raining|drying|wet)
    if (q.get('diff')) s.rotation = +q.get('diff');
    if (q.get('limits')) s.limits = q.get('limits');
    if (q.get('pits')) s.pits = q.get('pits');
    s.grid = q.get('grid') || 'mid'; // test shortcut: straight to the race unless ?grid=quali
    if (q.get('show')) { const [ang, r, h, fov, ty] = q.get('show').split(',').map(Number); showroom = { ang, r, h, fov: fov || 38, ty: ty || 0.45 }; }
    setTimeout(() => {
      startSession(s);
      if (q.get('at')) setTimeout(() => { const T = race.T, i = +q.get('at') % T.N; race.place(player, i * T.ds, T.rl.alpha[i], 0); }, 300); // test: drop the car at a track index
      if (q.get('autopilot')) setTimeout(() => { player.autopilot = true; player.ai = new AIDriver(player, race, { skill: 0.99, aggression: 0.7, consistency: 0.99 }); if (q.get('box')) player.plan.lap = +q.get('box'); if (q.get('boxnow')) player.pitReq = true; }, 200);
      if (q.get('finish')) setTimeout(() => { race.laps = +q.get('finish'); }, 400); // test: shorten the race
      if (q.get('wxat')) setTimeout(() => { race.changeAt = +q.get('wxat'); }, 400); // test: when the weather turns (share of race distance)
    }, 100);
  }
}
window.__apex = { get race() { return race; }, get cars() { return cars; }, renderer, scene, camera, audio, cfg,
  autopilot() { player.autopilot = true; player.ai = new AIDriver(player, race, { skill: 0.99, aggression: 0.7, consistency: 0.99 }); } }; // test hook
