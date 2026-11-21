// Ground materials: the racing surface, grass, gravel. Each is a MeshStandardMaterial with a
// small shader patch, so lighting, shadows, fog and the wet-weather pass (weather.js chains its
// own patch after these) keep working.
//
// Conventions the patches rely on:
//   track ribbon   uv = (metres from the centre line, metres along the lap) / 7
//   verge ribbon   uv.x = metres from the centre line / 20
//   gravel ribbon  uv = (metres across, metres along) / GRAVEL_TILE
import * as THREE from 'three';
import { macroNoise, trackDetail, TRACK_DET_LEN } from './detail.js';

export const GRAVEL_TILE = 2.4;

// Chain a shader patch onto a material without losing an earlier one.
function patch(mat, key, fn) {
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
  mat.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); fn(sh); };
  mat.customProgramCacheKey = () => `${prevKey}|${key}`;
  return mat;
}
// world-space position for the fragment shader
function withWorldPos(sh) {
  sh.vertexShader = 'varying vec3 vApxW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vApxW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = 'varying vec3 vApxW;\n' + sh.fragmentShader;
}

// ---------------------------------------------------------------- racing surface
// Needs a vec3 `aWear` vertex attribute: x = rubber laid on the racing line (0..1),
// y = marbles (loose rubber off line), z = tone of this stretch of tarmac (0.5 = neutral).
export function trackSurface(asp, trackWidth) {
  const mat = new THREE.MeshStandardMaterial({ map: asp.map, normalMap: asp.normal, roughnessMap: asp.rough, roughness: 1.0, metalness: 0.0, normalScale: new THREE.Vector2(0.42, 0.42) });
  const u = { uDet: { value: trackDetail() }, uMacro: { value: macroNoise() } };
  const ux = (1 / (trackWidth + 0.4)).toFixed(5), uy = (1 / TRACK_DET_LEN).toFixed(5);
  return patch(mat, `track:${ux}`, (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute vec3 aWear; varying vec3 vWear;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWear = aWear;');
    sh.fragmentShader = 'uniform sampler2D uDet; uniform sampler2D uMacro; varying vec3 vWear;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 apxTm = vMapUv * 7.0;   // (metres across, metres along)
        // seams, tar snakes, patch repairs and skid marks, stretched over the full width
        float apxDet = texture2D(uDet, vec2(apxTm.x * ${ux} + 0.5, apxTm.y * ${uy})).r;
        float apxMac = texture2D(uMacro, apxTm * vec2(0.011, 0.0031)).r * 0.6 + texture2D(uMacro, apxTm * 0.043 + 0.2).r * 0.4;
        // the same stones read much coarser: hides the 7 m repeat at speed and from the air
        float apxAgg = texture2D(map, vMapUv * 0.29 + 0.37).g;
        diffuseColor.rgb *= (0.55 + 0.45 * apxAgg / 0.085) * (apxDet * 2.0) * (0.82 + 0.36 * apxMac) * (0.78 + 0.44 * vWear.z);
        // rubbered-in racing line: laid in tyre-width streaks, not an airbrushed band
        float apxStreak = texture2D(uMacro, vec2(apxTm.x * 0.8, apxTm.y * 0.0042)).r;
        float apxRub = clamp(vWear.x * (0.45 + 1.1 * apxStreak), 0.0, 1.0);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.3, 0.3, 0.315), apxRub);
        // marbles: crumbs of rubber thrown off line
        float apxChip = texture2D(map, vMapUv * 1.3 + 0.53).g;
        float apxMarb = smoothstep(0.14, 0.2, apxChip) * vWear.y;
        diffuseColor.rgb *= (1.0 - 0.8 * apxMarb) * (1.0 - 0.1 * vWear.y);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // rubber, tar and oil are smoother than open aggregate: they catch the sun
        roughnessFactor *= mix(0.84, 1.04, smoothstep(0.2, 0.52, apxDet));
        roughnessFactor *= mix(1.0, 0.86, apxRub);
        roughnessFactor = clamp(roughnessFactor * (0.9 + 0.2 * apxMac), 0.5, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(mix(normal, nonPerturbedNormal, 0.75 * apxRub));   // rubber fills the texture in`);
  });
}

// Run-off tarmac: same stone, laid later and never rubbered, so paler and more uniform.
export function runoffSurface(asp) {
  const mat = new THREE.MeshStandardMaterial({ map: asp.map, normalMap: asp.normal, roughnessMap: asp.rough, roughness: 1.0, color: 0xd9dadc, normalScale: new THREE.Vector2(0.35, 0.35) });
  const u = { uMacro: { value: macroNoise() } };
  return patch(mat, 'runoff', (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform sampler2D uMacro;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec2 apxTm = vMapUv * 7.0;
      float apxMac = texture2D(uMacro, apxTm * vec2(0.021, 0.006)).r * 0.6 + texture2D(uMacro, apxTm * 0.07 + 0.2).r * 0.4;
      float apxAgg = texture2D(map, vMapUv * 0.29 + 0.37).g;
      // weathering streaks running across the fall of the run-off
      float apxStr = texture2D(uMacro, vec2(apxTm.x * 0.05, apxTm.y * 0.4)).r;
      diffuseColor.rgb *= (0.55 + 0.45 * apxAgg / 0.085) * (0.8 + 0.4 * apxMac) * (0.9 + 0.2 * apxStr);`);
  });
}

// ---------------------------------------------------------------- grass
const lin = (v) => Math.pow(v / 255, 2.2);
// opts.base: the turf texture's base colour [r,g,b] 0..255 (to normalise its fine detail)
// opts.dry 0..1: how much straw there is; opts.stripe: mowing contrast (0 = rough, unmown)
// opts.verge: { edge } marks a track-side verge: stripes follow the track, and the first couple
//   of metres past `edge` (metres from the centre line) are worn to dirt in patches
export function grassSurface(map, { base, dry = 0.3, stripe = 0, stripeW = 2.6, verge = null, vertexColors = false, sandy = false }) {
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 1, vertexColors });
  if (!sandy) mat.color.setRGB(1.28, 1.2, 1.02); // sunlit turf is brighter and yellower than its pigment: blades scatter light forward
  const avg = 0.3 * lin(base[0]) + 0.5 * lin(base[1]) + 0.2 * lin(base[2]);
  const u = {
    uMacro: { value: macroNoise() },
    uStraw: { value: sandy ? new THREE.Color(1.1, 0.96, 0.8) : new THREE.Color(1.34, 1.12, 0.7) },
    uDirt: { value: sandy ? new THREE.Color(0.3, 0.22, 0.13) : new THREE.Color(0.17, 0.125, 0.075) },
  };
  const DRY = (0.15 + dry * 0.6).toFixed(3), STRIPE = stripe.toFixed(3), K = (Math.PI / stripeW).toFixed(4);
  return patch(mat, `grass:${DRY}:${STRIPE}:${K}:${verge ? verge.edge.toFixed(2) : 'x'}:${avg.toFixed(4)}`, (sh) => {
    Object.assign(sh.uniforms, u);
    withWorldPos(sh);
    sh.fragmentShader = 'uniform sampler2D uMacro; uniform vec3 uStraw; uniform vec3 uDirt;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec2 apxGw = vApxW.xz;
      // (each octave is read at its own angle, so the repeats of the noise tile never line up into a grid)
      float apxA = texture2D(uMacro, apxGw * 0.0019).r;
      float apxB = texture2D(uMacro, mat2(0.8, 0.6, -0.6, 0.8) * apxGw * 0.0083 + 0.37).r;
      float apxC = texture2D(uMacro, mat2(0.34, 0.94, -0.94, 0.34) * apxGw * 0.061 + 0.11).r;
      // the turf read again much finer keeps blades crisp right under the camera
      vec3 apxFine = texture2D(map, vMapUv * 5.3 + 0.23).rgb;
      diffuseColor.rgb *= mix(1.0, dot(apxFine, vec3(0.3, 0.5, 0.2)) / ${avg.toFixed(4)}, 0.45);
      // patchy growth: lush and thin areas over tens of metres
      diffuseColor.rgb *= 0.74 + 0.52 * (apxA * 0.45 + apxB * 0.35 + apxC * 0.2);
      // dry, strawy patches
      float apxDry = smoothstep(0.46, 0.76, apxB * 0.55 + apxC * 0.45) * ${DRY};
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uStraw, apxDry);
      ${verge ? `
      float apxLat = abs(vMapUv.x) * 20.0;
      // mown in passes that follow the track
      float apxPh = apxLat * ${K};
      float apxBand = clamp(sin(apxPh) * 4.0, -1.0, 1.0) * (1.0 - smoothstep(0.5, 1.5, fwidth(apxPh)));
      diffuseColor.rgb *= 1.0 + ${STRIPE} * apxBand;
      // the edge of the circuit: thin, dusty grass and bare earth where cars drop wheels
      float apxE = apxLat - ${verge.edge.toFixed(2)};
      float apxWorn = (1.0 - smoothstep(0.2, 3.2, apxE)) * smoothstep(0.34, 0.62, apxC * 0.6 + apxB * 0.4);
      apxWorn = max(apxWorn, (1.0 - smoothstep(0.0, 0.45, apxE)) * 0.7);
      diffuseColor.rgb = mix(diffuseColor.rgb, uDirt * (0.75 + 0.5 * apxC), apxWorn * 0.8);` : `
      float apxPh = dot(apxGw, vec2(0.83, 0.56)) * ${K};
      float apxBand = clamp(sin(apxPh) * 4.0, -1.0, 1.0) * (1.0 - smoothstep(0.5, 1.5, fwidth(apxPh)));
      diffuseColor.rgb *= 1.0 + ${STRIPE} * apxBand;`}`);
  });
}

// ---------------------------------------------------------------- gravel trap
// Pebbles with raked furrows running along the trap and broad tonal drift.
export function gravelSurface(gv) {
  const mat = new THREE.MeshStandardMaterial({ map: gv.map, normalMap: gv.normal, roughness: 0.96, normalScale: new THREE.Vector2(0.9, 0.9) });
  const u = { uMacro: { value: macroNoise() } };
  return patch(mat, 'gravel', (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = 'uniform sampler2D uMacro;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec2 apxGm = vMapUv * ${GRAVEL_TILE.toFixed(2)};
      float apxA = texture2D(uMacro, apxGm * 0.017).r, apxB = texture2D(uMacro, apxGm * 0.09 + 0.4).r;
      vec3 apxCo = texture2D(map, vMapUv * 0.23 + 0.41).rgb;
      diffuseColor.rgb *= (0.7 + 0.3 * apxCo.g / 0.4) * (0.8 + 0.4 * (apxA * 0.6 + apxB * 0.4));
      // rake lines: ridges catch the light, troughs hold shadow
      float apxPh = apxGm.x * 14.0 + sin(apxGm.y * 0.06) * 2.5;
      float apxFur = sin(apxPh) * (1.0 - smoothstep(0.7, 2.2, fwidth(apxPh)));
      diffuseColor.rgb *= 1.0 + 0.13 * apxFur;`);
  });
}
