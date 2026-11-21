// Sky, sun, clouds, distant hills and the reflection environment for a circuit.
//
//   const atmo = buildAtmosphere(scene, renderer, { time, sandy, sea });   // before the ground
//   atmo.addHorizon(root, { cx, cz, radius, baseY, sea, sandy });          // distant ridges
//   atmo.followSun(target)   // every frame: keeps the shadow box on the action (texel-snapped)
//
// The sky is one camera-centred dome with an analytic gradient, sun glow and a procedural cloud
// layer that is lit from the sun's side, all in linear HDR so the tone mapper and bloom treat
// it like the rest of the scene. The same dome (without the sun disc) is baked into the PMREM
// environment, so paint and wet tarmac reflect the real sky of the session.
import * as THREE from 'three';

// Colours are linear scene-referred. `tint` is used for unlit painted things (trees), `cloud`
// is kept in its old [cover, r, g, b] form for code that still reads it.
export const TIMES = {
  day: {
    elev: 38, az: 135, sun: 4.6, sunCol: [1.0, 0.955, 0.87], hemi: 0.1, env: 0.9, exposure: 0.64,
    zen: [0.055, 0.155, 0.44], hor: [0.5, 0.63, 0.8], glow: 0.55, gnd: [0.1, 0.11, 0.08],
    cover: 0.36, soft: 0.05, cLit: [1.0, 0.98, 0.94], cShade: [0.56, 0.6, 0.69],
    fog: [0.52, 0.64, 0.8], fogD: 0.00023, shadowR: 1.6,
    tint: [0.78, 0.8, 0.76], cloud: [0.36, 2.3, 2.3, 2.35], mount: [0.2, 0.27, 0.33], mountLit: [0.27, 0.33, 0.25],
  },
  overcast: {
    elev: 36, az: 200, sun: 1.0, sunCol: [1.0, 0.97, 0.93], hemi: 0.42, env: 1.12, exposure: 0.96,
    zen: [0.25, 0.275, 0.31], hor: [0.44, 0.465, 0.5], glow: 0.4, gnd: [0.07, 0.075, 0.065],
    cover: 0.86, soft: 0.3, cLit: [0.62, 0.64, 0.66], cShade: [0.2, 0.215, 0.24],
    fog: [0.4, 0.425, 0.46], fogD: 0.0003, shadowR: 5,
    tint: [0.6, 0.63, 0.64], cloud: [0.9, 1.25, 1.28, 1.34], mount: [0.16, 0.19, 0.215], mountLit: [0.2, 0.225, 0.2],
  },
  sunset: {
    elev: 9, az: 250, sun: 4.2, sunCol: [1.0, 0.6, 0.32], hemi: 0.26, env: 1.1, exposure: 0.95,
    zen: [0.09, 0.17, 0.42], hor: [0.95, 0.56, 0.3], glow: 1.6, gnd: [0.09, 0.07, 0.06],
    cover: 0.3, soft: 0.07, cLit: [1.25, 0.74, 0.46], cShade: [0.34, 0.27, 0.38],
    fog: [0.72, 0.46, 0.3], fogD: 0.00026, shadowR: 2,
    tint: [0.9, 0.66, 0.46], cloud: [0.42, 2.6, 1.55, 1.0], mount: [0.26, 0.17, 0.19], mountLit: [0.5, 0.3, 0.2],
  },
};

// ---------------------------------------------------------------- noise
function fbmLayer(S, octaves, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = new Float32Array(S * S);
  let amp = 1;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o, grid = new Float32Array(cells * cells).map(() => rnd()), cs = S / cells;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const gx = x / cs, gy = y / cs, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const g = (i, j) => grid[((j % cells) * cells) + (i % cells)];
      const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
      out[y * S + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    amp *= 0.52;
  }
  let mn = 1e9, mx = -1e9;
  for (let i = 0; i < out.length; i++) { mn = Math.min(mn, out[i]); mx = Math.max(mx, out[i]); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / (mx - mn);
  return out;
}

// Three independent tileable fbm fields in R, G, B (shared by every sky).
let NOISE = null;
function noiseTexture() {
  if (NOISE) return NOISE;
  const S = 256, a = fbmLayer(S, 6, 911), b = fbmLayer(S, 6, 1733), c = fbmLayer(S, 5, 277);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { data[i * 4] = a[i] * 255; data[i * 4 + 1] = b[i] * 255; data[i * 4 + 2] = c[i] * 255; data[i * 4 + 3] = 255; }
  NOISE = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  NOISE.wrapS = NOISE.wrapT = THREE.RepeatWrapping;
  NOISE.magFilter = THREE.LinearFilter; NOISE.minFilter = THREE.LinearMipmapLinearFilter;
  NOISE.generateMipmaps = true; NOISE.needsUpdate = true;
  return NOISE;
}

// ---------------------------------------------------------------- sky dome
const SKY_VERT = `varying vec3 vDir;
  void main(){
    vDir = position;
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
    gl_Position = p.xyww;   // always at the far plane, centred on the camera
  }`;
const SKY_FRAG = `uniform sampler2D uN; uniform vec3 uSun, uZen, uHor, uGnd, uSunCol, uCLit, uCShade;
  uniform float uLo, uSoft, uGlow, uDisc, uTime;
  varying vec3 vDir;
  float cloudDensity(vec2 q, float fine){
    return texture2D(uN, q).r * 0.52 + texture2D(uN, q * 3.3 + 0.31).g * 0.3 + fine * 0.18;
  }
  void main(){
    vec3 d = normalize(vDir);
    float mu = max(dot(d, uSun), 0.0);
    float up = max(d.y, 0.0);
    float hz = 1.0 - up;
    // gradient: deep overhead, pale and bright toward the horizon, warmer and brighter around the sun
    vec3 col = mix(uZen, uHor, pow(hz, 3.6));
    col *= 0.88 + 0.26 * mu * mu;
    col += uSunCol * uGlow * (0.3 * pow(mu, 5.0) * hz * hz + 0.5 * pow(mu, 70.0));
    float cov = 0.0;
    if (d.y > 0.0) {
      // one cloud deck on a gently curved shell, so it converges toward the horizon like real cloud streets
      vec2 p = d.xz / (d.y + 0.11);
      vec2 q = p * 0.12 + vec2(0.17, 0.42) + uTime * vec2(0.0016, 0.0006);
      float fine = texture2D(uN, q * 11.0).b;
      float dn = cloudDensity(q, fine);
      cov = smoothstep(uLo, uLo + uSoft, dn);
      if (cov > 0.001) {
        vec2 so = normalize(uSun.xz + vec2(1e-4)) * 0.028;
        float towardSun = cloudDensity(q + so, fine);
        float lit = clamp(0.55 + (dn - towardSun) * 7.0, 0.0, 1.0);   // the sun's side of each cell is bright
        float thick = smoothstep(uLo + uSoft, uLo + uSoft + 0.3, dn); // thick cores have grey bases
        vec3 cc = mix(uCShade, uCLit, clamp(lit * (1.0 - 0.45 * thick) + 0.35 * (1.0 - thick), 0.0, 1.0));
        cc += uSunCol * uGlow * 0.6 * pow(mu, 10.0) * (1.0 - thick);  // silver lining near the sun
        // aerial perspective: far clouds sink into the horizon haze
        float nearK = smoothstep(0.0, 0.3, d.y);
        cc = mix(uHor * 1.04, cc, 0.25 + 0.75 * nearK);
        cov *= smoothstep(0.005, 0.07, d.y);
        col = mix(col, cc, cov);
      }
    }
    col += uSunCol * uDisc * (1.0 - cov) * smoothstep(0.99988, 0.99996, mu);
    // below the horizon: haze into the ground colour (only ever seen past the edge of the terrain)
    col = mix(col, uGnd, smoothstep(0.0, -0.09, d.y));
    gl_FragColor = vec4(col, 1.0);
  }`;

function skyUniforms(time, sunDir, disc) {
  const c = (a, k = 1) => new THREE.Color(a[0] * k, a[1] * k, a[2] * k);
  return {
    uN: { value: noiseTexture() }, uSun: { value: sunDir.clone() }, uZen: { value: c(time.zen) }, uHor: { value: c(time.hor) },
    uGnd: { value: c(time.fog, 0.75) }, uSunCol: { value: c(time.sunCol) }, uCLit: { value: c(time.cLit) }, uCShade: { value: c(time.cShade) },
    // threshold on the density field: the fields are bell-shaped around 0.5
    uLo: { value: 0.5 + (0.5 - time.cover) * 0.4 }, uSoft: { value: time.soft }, uGlow: { value: time.glow }, uDisc: { value: disc }, uTime: { value: 0 },
  };
}

function skyDome(time, sunDir, disc) {
  const mat = new THREE.ShaderMaterial({ uniforms: skyUniforms(time, sunDir, disc), vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = 50; // after the opaque world: only the pixels of sky actually left showing get shaded
  return m;
}

function fbm1(x, y) {
  let s = 0, a = 0.5, f = 1;
  const h = (i, j) => { const v = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return v - Math.floor(v); };
  for (let o = 0; o < 5; o++) {
    const px = x * f, py = y * f, xi = Math.floor(px), yi = Math.floor(py), xf = px - xi, yf = py - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const A = h(xi, yi), B = h(xi + 1, yi), C = h(xi, yi + 1), D = h(xi + 1, yi + 1);
    s += a * (A + (B - A) * u + (C - A) * v + (A - B - C + D) * u * v);
    a *= 0.5; f *= 2.03;
  }
  return s;
}

// ---------------------------------------------------------------- build
export function buildAtmosphere(scene, renderer, { time, sandy = false }) {
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - time.elev), THREE.MathUtils.degToRad(time.az));
  const sky = skyDome(time, sunDir, 26);
  scene.add(sky);

  // ---- reflection environment: the same sky plus a lit ground and a dark tree line, so
  // undersides go dark and paint reflects a horizon instead of floating in mid-air
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = skyDome(time, sunDir, 0);
  envScene.add(envSky);
  {
    const sinE = Math.sin(THREE.MathUtils.degToRad(time.elev));
    const lit = (time.sun * sinE) / Math.PI + 0.22 * time.hemi + 0.1;
    const alb = sandy ? [0.36, 0.28, 0.19] : [0.1, 0.12, 0.07];
    const gcol = new THREE.Color(alb[0] * lit, alb[1] * lit, alb[2] * lit);
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(4500, 48), new THREE.MeshBasicMaterial({ color: gcol }));
    gnd.rotation.x = -Math.PI / 2; gnd.position.y = -1.6;
    envScene.add(gnd);
    // tarmac directly underneath (what the lower bodywork actually reflects)
    const road = new THREE.Mesh(new THREE.CircleGeometry(14, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1 * lit, 0.1 * lit, 0.105 * lit) }));
    road.rotation.x = -Math.PI / 2; road.position.y = -1.55;
    envScene.add(road);
    const band = new THREE.CylinderGeometry(420, 420, 1, 96, 1, true);
    const bp = band.attributes.position;
    for (let k = 0; k < bp.count; k++) {
      if (bp.getY(k) > 0) { const a = Math.atan2(bp.getZ(k), bp.getX(k)); bp.setY(k, (sandy ? 4 : 10) + fbm1(Math.cos(a) * 3 + 2, Math.sin(a) * 3 + 5) * (sandy ? 14 : 34)); } else bp.setY(k, -2);
    }
    const bcol = sandy ? gcol.clone().multiplyScalar(0.8) : new THREE.Color(0.035 * lit, 0.055 * lit, 0.03 * lit);
    envScene.add(new THREE.Mesh(band, new THREE.MeshBasicMaterial({ color: bcol, side: THREE.BackSide })));
  }
  const envRT = pmrem.fromScene(envScene, 0.02, 1, 6000);
  for (const o of envScene.children) { o.geometry.dispose(); o.material.dispose(); }
  pmrem.dispose();
  scene.environment = envRT.texture;
  scene.environmentIntensity = time.env ?? 1.0;
  const fogC = new THREE.Color(time.fog[0], time.fog[1], time.fog[2]);
  scene.fog = new THREE.FogExp2(0xffffff, time.fogD);
  scene.fog.color.copy(fogC);
  renderer.toneMappingExposure = time.exposure;

  // ---- sun + sky fill
  const sun = new THREE.DirectionalLight(new THREE.Color(time.sunCol[0], time.sunCol[1], time.sunCol[2]), time.sun);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const HALF = 80;
  const cam = sun.shadow.camera;
  cam.left = -HALF; cam.right = HALF; cam.top = HALF; cam.bottom = -HALF; cam.near = 200; cam.far = 640;
  // tight depth range keeps the bias small, so shadows start right at the tyres
  sun.shadow.bias = -0.00028; sun.shadow.normalBias = 0.03;
  sun.shadow.radius = time.shadowR ?? 1.5;
  scene.add(sun); scene.add(sun.target);
  const skyFill = new THREE.Color(time.zen[0], time.zen[1], time.zen[2]).lerp(new THREE.Color(time.hor[0], time.hor[1], time.hor[2]), 0.6);
  const m = Math.max(skyFill.r, skyFill.g, skyFill.b); skyFill.multiplyScalar(1 / m);
  const hemi = new THREE.HemisphereLight(skyFill, sandy ? 0x9a7a50 : 0x4a5a30, time.hemi);
  scene.add(hemi);

  // the shadow camera's own axes: snapping the followed point to whole shadow texels along them
  // stops shadow edges from crawling as the car moves
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize();
  const upV = new THREE.Vector3().crossVectors(sunDir, right).normalize();
  const snapped = new THREE.Vector3();
  let clock = 0, lastT = performance.now();

  return {
    sky, sun, hemi, envRT, sunDir, fogColor: fogC,
    followSun(target) {
      const texel = (2 * HALF) / sun.shadow.mapSize.x;
      const a = Math.round(target.dot(right) / texel) * texel, b = Math.round(target.dot(upV) / texel) * texel, c = target.dot(sunDir);
      snapped.set(0, 0, 0).addScaledVector(right, a).addScaledVector(upV, b).addScaledVector(sunDir, c);
      sun.position.copy(snapped).addScaledVector(sunDir, 400);
      sun.target.position.copy(snapped);
      // slow cloud drift
      const now = performance.now();
      clock += Math.min(0.1, (now - lastT) / 1000); lastT = now;
      sky.material.uniforms.uTime.value = clock;
    },
    // Rings of distant ridges around the venue. Each ring is a strip with a few rows so the
    // slopes can be shaded: sunlit and shadowed flanks, darker wooded crests, bases lost in haze.
    addHorizon(root, { cx, cz, radius, baseY, sea = false }) {
      const hazeC = new THREE.Color(time.fog[0], time.fog[1], time.fog[2]);
      const shadeC = new THREE.Color(time.mount[0], time.mount[1], time.mount[2]);
      const litC = new THREE.Color(time.mountLit[0], time.mountLit[1], time.mountLit[2]);
      const SEG = 240, ROWS = 5;
      const rings = [
        { r: radius * 0.55, h: 0.38, seed: 3.1, haze: 0.34, rough: 1.0 },
        { r: radius * 0.8, h: 0.7, seed: 7.7, haze: 0.56, rough: 0.8 },
        { r: radius, h: 1.0, seed: 12.3, haze: 0.74, rough: 0.6 },
      ];
      const geos = [];
      for (const R of rings) {
        const heights = [];
        for (let k = 0; k <= SEG; k++) {
          const a = (k / SEG) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          let hgt = 70 + fbm1(ca * 2.2 + R.seed, sa * 2.2 + 9) * 560 + fbm1(ca * 8 + R.seed, sa * 8) * 150 * R.rough + fbm1(ca * 31, sa * 31 + R.seed) * 34 * R.rough;
          hgt *= R.h;
          if (sea) hgt *= THREE.MathUtils.smoothstep(sa, -0.55, 0.1); // open sea to the south
          if (sandy) hgt *= 0.5;
          heights.push(hgt);
        }
        const pos = [], col = [], idx = [];
        const c3 = new THREE.Color();
        for (let k = 0; k <= SEG; k++) {
          const a = (k / SEG) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          const hgt = heights[k];
          // which way does this flank face? slope along the ring against the sun's azimuth
          const dh = heights[(k + 1) % SEG] - heights[(k - 1 + SEG) % SEG];
          const tangent = new THREE.Vector3(-sa, 0, -ca), inward = new THREE.Vector3(-ca, 0, sa);
          const n = inward.clone().multiplyScalar(0.8).addScaledVector(tangent, -dh * 0.02).add(new THREE.Vector3(0, 0.6, 0)).normalize();
          const lit = THREE.MathUtils.clamp(n.dot(sunDir) * 1.15 + 0.12, 0, 1);
          for (let r = 0; r <= ROWS; r++) {
            const t = r / ROWS;
            // lower rows bulge toward the viewer a little: a slope, not a card
            const rr = R.r - (1 - t) * 260;
            pos.push(cx + ca * rr, baseY - 60 + (hgt + 60) * t, cz - sa * rr);
            const tex = 0.86 + 0.28 * fbm1(k * 0.9 + R.seed, r * 1.7);
            c3.copy(shadeC).lerp(litC, lit * (0.45 + 0.55 * t)).multiplyScalar(tex);
            c3.lerp(hazeC, Math.min(0.97, R.haze + (1 - t) * (1 - R.haze) * 0.85));
            col.push(c3.r, c3.g, c3.b);
            if (k < SEG && r < ROWS) { const o = k * (ROWS + 1) + r; idx.push(o, o + ROWS + 1, o + 1, o + 1, o + ROWS + 1, o + ROWS + 2); }
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        geos.push(g);
      }
      // far ring first, so nearer ridges draw over it without needing depth precision out there
      geos.reverse().forEach((g, k) => {
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }));
        mesh.renderOrder = -6 + k;
        mesh.frustumCulled = false;
        root.add(mesh);
      });
    },
    dispose() {
      scene.remove(sky); scene.remove(sun); scene.remove(sun.target); scene.remove(hemi);
      sun.shadow.map?.dispose();
      envRT.dispose(); sky.geometry.dispose(); sky.material.dispose();
    },
  };
}
