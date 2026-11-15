// Wet weather visuals: falling rain around the camera, a soaked track (dark, glossy, with puddle
// sheen), spray thrown up behind the cars, and a gloomier light. Everything lives under
// world.root, so it is torn down with the world.
//
//   world.weather = buildWeather(scene, world, T, { wet, effects });   // after the world is built
//   world.weather?.update(dt, camera, cars);                            // every frame
//
// `cars` is the game's list of { e (race entry), mesh }. With wet = false this returns null.
import * as THREE from 'three';

const RAIN = 3200;                      // streaks
const BOX = new THREE.Vector3(64, 26, 64); // volume around the camera they live in

function rainMesh() {
  const seed = new Float32Array(RAIN * 2 * 3), end = new Float32Array(RAIN * 2);
  for (let i = 0; i < RAIN; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random();
    for (let k = 0; k < 2; k++) { seed.set([x, y, z], (i * 2 + k) * 3); end[i * 2 + k] = k; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(seed, 3));
  g.setAttribute('end', new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uFall: { value: new THREE.Vector3(1.5, -11, 0.6) }, uStreak: { value: new THREE.Vector3(0, -0.3, 0) }, uBox: { value: BOX }, uColor: { value: new THREE.Color(0.82, 0.86, 0.92) }, uAlpha: { value: 0.5 } },
    vertexShader: `uniform vec3 uCam; uniform float uTime; uniform vec3 uFall; uniform vec3 uStreak; uniform vec3 uBox; attribute float end; varying float vA;
      void main(){
        // each drop keeps a fixed place in the world and falls; the box of drops wraps around the camera
        vec3 p = position * uBox + uFall * uTime;
        p = mod(p - uCam, uBox) - uBox * 0.5 + uCam;
        p += uStreak * end;                         // the streak is the drop's motion over one exposure
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        vA = smoothstep(0.6, 3.0, d) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, d)) * (1.0 - 0.6 * end);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; varying float vA; void main(){ gl_FragColor = vec4(uColor, uAlpha * vA); }',
    transparent: true, depthWrite: false, fog: false,
  });
  const m = new THREE.LineSegments(g, mat);
  m.frustumCulled = false;
  m.renderOrder = 6;
  return m;
}

// Soak a road-type material: darker, much glossier, with broad puddle patches that mirror the sky.
// Works on top of whatever shader detail the material already has.
function soak(mat, WET, { dark = 0.62, gloss = 0.5, puddles = 0.6, key }) {
  if (!mat || mat.userData.wet) return;
  mat.userData.wet = true;
  mat.userData.env0 = mat.envMapIntensity ?? 1;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.apxWet = WET; // 0 dry .. 1 soaked, shared by every soaked material
    sh.fragmentShader = `uniform float apxWet;
      float apxHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float apxNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(apxHash(i), apxHash(i + vec2(1.0, 0.0)), f.x), mix(apxHash(i + vec2(0.0, 1.0)), apxHash(i + vec2(1.0, 1.0)), f.x), f.y); }
      ` + sh.fragmentShader.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        #ifdef USE_MAP
          // standing water collects in long shallow patches; between them the surface is just damp
          float apxPud = apxNoise(vMapUv * vec2(2.6, 0.42)) * 0.6 + apxNoise(vMapUv * vec2(6.5, 1.1) + 7.0) * 0.4;
          apxPud = smoothstep(0.5, 0.68, apxPud) * ${puddles.toFixed(2)};
        #else
          float apxPud = 0.0;
        #endif
        apxPud *= smoothstep(0.35, 1.0, apxWet); // puddles only form once it has rained for a while
        diffuseColor.rgb *= mix(1.0, mix(${dark.toFixed(2)}, ${(dark * 0.6).toFixed(2)}, apxPud), apxWet);
        // (standing water is kept a little rough: a perfect mirror of an overcast sky reads as snow)
        roughnessFactor = mix(roughnessFactor, mix(clamp(roughnessFactor * ${gloss.toFixed(2)}, 0.0, 1.0), 0.22, apxPud), apxWet);`);
  };
  mat.customProgramCacheKey = () => `${prevKey}:wet:${key}`;
  mat.needsUpdate = true;
}

export function buildWeather(scene, world, T, opts = {}) {
  if (!opts.wet) return null;
  const root = world.root, S = world.surfaces || {}, effects = opts.effects;

  // ---------- soaked surfaces (the amount is a uniform, so the track can get wetter or dry out)
  const WET = { value: 0 };
  const soaked = [S.track, S.run, S.kerb, S.line, S.gravel, S.verge].filter(Boolean);
  soak(S.track, WET, { dark: 0.42, gloss: 0.62, puddles: 0.9, key: 'track' });
  soak(S.run, WET, { dark: 0.5, gloss: 0.65, puddles: 0.7, key: 'run' });
  soak(S.kerb, WET, { dark: 0.8, gloss: 0.45, puddles: 0.0, key: 'kerb' });
  soak(S.line, WET, { dark: 0.85, gloss: 0.5, puddles: 0.0, key: 'line' });
  soak(S.gravel, WET, { dark: 0.7, gloss: 0.8, puddles: 0.0, key: 'gravel' });
  soak(S.verge, WET, { dark: 0.82, gloss: 0.85, puddles: 0.0, key: 'verge' });
  // everything else under the world just looks damp: a little darker, a little shinier
  const seen = new Set(), damp = [];
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (seen.has(m) || m.userData.wet || !m.isMeshStandardMaterial || m.transparent || m.emissiveIntensity > 0.5) continue;
      seen.add(m);
      m.userData.wet = true;
      damp.push({ m, c: m.color.clone(), r: m.roughness });
    }
  });

  // ---------- gloomier light: thicker air, weaker sun, flatter shadows
  const base = { fogD: scene.fog ? scene.fog.density : 0, fogC: scene.fog ? scene.fog.color.clone() : null, sun: world.sun.intensity, hemi: world.hemi ? world.hemi.intensity : 0 };
  let wetNow = -1, rainNow = -1;
  // w: how wet the road is, r: how hard it is raining (both 0..1)
  const setState = (w, r) => {
    if (Math.abs(w - wetNow) < 0.004 && Math.abs(r - rainNow) < 0.004) return;
    wetNow = w; rainNow = r;
    WET.value = w;
    for (const m of soaked) m.envMapIntensity = m.userData.env0 + (0.4 - m.userData.env0) * w; // a wet road under a bright overcast sky must not turn white
    for (const d of damp) { d.m.color.copy(d.c).multiplyScalar(1 - 0.14 * w); d.m.roughness = d.r + (Math.max(0.12, d.r * 0.72) - d.r) * w; }
    const gloom = Math.max(w * 0.7, r);
    if (scene.fog) { scene.fog.density = base.fogD * (1 + 0.9 * gloom); scene.fog.color.copy(base.fogC).multiplyScalar(1 - 0.2 * gloom); }
    world.sun.intensity = base.sun * (1 - 0.45 * gloom);
    if (world.hemi) world.hemi.intensity = base.hemi * (1 + 0.12 * gloom);
    rain.visible = r > 0.02;
    ru.uAlpha.value = alpha0 * r;
  };

  // ---------- rain
  const rain = rainMesh();
  root.add(rain);
  const ru = rain.material.uniforms, alpha0 = ru.uAlpha.value;
  const last = new THREE.Vector3(), vel = new THREE.Vector3(), tmp = new THREE.Vector3();
  let time = 0, first = true;
  const sprayAcc = new WeakMap();
  const p = new THREE.Vector3(), v = new THREE.Vector3();

  setState(opts.wetness ?? 1, opts.rain ?? 1);
  return {
    wet: true,
    setState,
    update(dt, camera, cars) {
      if (dt <= 0) return;
      time += dt;
      // camera velocity (ignoring cuts) stretches the streaks: at speed the rain comes straight at you
      tmp.copy(camera.position).sub(last).divideScalar(dt);
      if (first || tmp.length() > 160) tmp.set(0, 0, 0);
      first = false;
      vel.lerp(tmp, Math.min(1, dt * 8));
      last.copy(camera.position);
      ru.uCam.value.copy(camera.position);
      ru.uTime.value = time;
      ru.uStreak.value.copy(ru.uFall.value).sub(vel).multiplyScalar(1 / 38);
      // ---------- spray behind every car near the camera
      if (!effects || !effects.spray || !cars || wetNow < 0.12) return;
      for (const c of cars) {
        const e = c.e, b = e.body, sp = b.speed();
        if (sp < 10 || e.pit || !c.mesh.visible) continue;
        const dist = c.mesh.position.distanceTo(camera.position);
        if (dist > 260) continue;
        // more water the faster it goes; cars in the distance get a cheaper plume
        const rate = Math.min(1, (sp - 10) / 45) * (dist < 90 ? 70 : dist < 170 ? 34 : 16) * wetNow;
        let acc = (sprayAcc.get(c) || 0) + rate * dt;
        const cs = Math.cos(b.psi), sn = Math.sin(b.psi);
        v.set(b.vx * cs - b.vy * sn, 0, -(b.vx * sn + b.vy * cs));
        while (acc >= 1) {
          acc -= 1;
          const side = Math.random() < 0.5 ? -1 : 1, back = -1.9 - Math.random() * 0.8, lat = side * (0.55 + Math.random() * 0.4);
          p.set(c.mesh.position.x + cs * back - sn * lat, c.mesh.position.y + 0.25, c.mesh.position.z - sn * back - cs * lat);
          effects.spray(p, v, Math.min(1, sp / 60));
        }
        sprayAcc.set(c, acc);
      }
    },
    dispose() {},
  };
}
