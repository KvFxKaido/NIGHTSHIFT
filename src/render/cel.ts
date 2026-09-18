import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { CAR_GEOMETRY, type CarView } from "./car.ts";
import type { SimState, VehicleState, WheelId } from "../sim/sim.ts";

/**
 * The cars are drawn: `cel`, the default since 2026-09-18. At night the
 * undrawn cars read as dark shapes with two tail lights; banded and inked they
 * read as cars again. Two comparisons stay reachable and are never saved:
 * `?look=plain` draws the cars as they were, and `?look=fx` is Driving Rogue's
 * and NFS Unbound's recipe, the undrawn cars with the drawn smoke on top.
 *
 * Unbound's idea, adapted. Its cars are rendered real and the drawn layer
 * sits on and around them. Ours are faceted Blender bodies that read as budget
 * realism under PBR, so here the cars are what gets drawn: their lighting is cut
 * into three flat bands of their own colour, with a hard highlight stripe on the
 * paint, the race's cyan on the rim (the rival portraits' rim light,
 * design/CHARACTERS.md) and an ink outline. Traffic and the city are untouched.
 * Tyre smoke is the one drawn effect.
 *
 * The bands are a patch on the cars' own standard materials, not a swap, so
 * paint, wheel finish and livery edits keep working on the same objects. The
 * smoke is a first pass and needs work.
 */
export type Look = "fx" | "cel";
let look: Look | null = null;
let celOn = false;
export function setLook(value: Look | null): void { look = value; celOn = value === "cel"; }
/** Whether any drawn effects are on. */
export function drawnEffects(): boolean { return look !== null; }

/** Shared by every patched material, so a value changed here changes every car. */
export const CEL_UNIFORMS = {
  /** Albedo multipliers for the dark, mid and lit bands. Night: nothing is lit to full. */
  celBands: { value: new THREE.Vector3(0.16, 0.38, 0.78) },
  /** Lighting relative to albedo at which a surface moves up a band. */
  celThresholds: { value: new THREE.Vector2(0.12, 0.3) },
  /** Specular luma above which the hard highlight stripe shows. Set in the
   *  garage, whose spots are the strongest light a car meets: lower, and the
   *  whole roof and bonnet went pale. */
  celSpecular: { value: 1.2 },
  celStripe: { value: 0.3 },
  celRim: { value: new THREE.Color(0x59d8ff) },
  /** 1 - N.V past which a surface is rim. */
  celRimEdge: { value: 0.78 },
  celRimStrength: { value: 0.35 },
};

const CEL_PARS = /* glsl */ `
uniform vec3 celBands;
uniform vec2 celThresholds;
uniform float celSpecular;
uniform float celStripe;
uniform vec3 celRim;
uniform float celRimEdge;
uniform float celRimStrength;
`;

// In place of the standard shader's sum of light. `material.diffuseColor` is the
// albedo after metalness, so dividing by it measures the light itself: metallic
// paint, which went dark with no environment to reflect, bands like any other.
const CEL_LIGHT = /* glsl */ `
  const vec3 celLuma = vec3(0.2126, 0.7152, 0.0722);
  float celLight = dot(totalDiffuse, celLuma) / max(dot(material.diffuseColor, celLuma), 1e-4);
  float celBand = celLight < celThresholds.x ? celBands.x : (celLight < celThresholds.y ? celBands.y : celBands.z);
  vec3 celColor = diffuseColor.rgb * celBand;
  celColor += step(celSpecular, dot(totalSpecular, celLuma)) * celStripe;
  // The rim is an edge on the flanks. A roof seen from the chase camera is at a
  // grazing angle too, and rimmed whole it read as pale blue paint; a face
  // turned up towards the camera is not a flank.
  float celFacing = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
  celColor += step(celRimEdge, celFacing) * (1.0 - step(0.55, normal.y)) * celRim * celRimStrength;
  vec3 outgoingLight = celColor + totalEmissiveRadiance;
`;
const SUM_OF_LIGHT = "vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;";

/** Band a car material when the preview is on; a no-op otherwise. */
export function celMaterial<T extends THREE.MeshStandardMaterial>(material: T): T {
  if (!celOn || material.userData.cel) return material;
  // The shared uniforms, reachable from any car mesh for tuning in the browser.
  material.userData.cel = CEL_UNIFORMS;
  material.onBeforeCompile = shader => {
    if (!shader.fragmentShader.includes(SUM_OF_LIGHT)) throw new Error("The standard shader no longer sums light the way the cel patch expects");
    Object.assign(shader.uniforms, CEL_UNIFORMS);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${CEL_PARS}`)
      .replace(SUM_OF_LIGHT, CEL_LIGHT);
  };
  material.customProgramCacheKey = () => "cel";
  material.needsUpdate = true;
  return material;
}

/** The ink: each car mesh again, welded so its normals are smooth, pushed out
 *  along them and drawn back faces only. The push grows with depth, so the
 *  line holds about the same width on screen near and far. */
const INK = new THREE.ShaderMaterial({
  name: "cel-ink",
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    inkColor: { value: new THREE.Color(0x06080d) }, inkWidth: { value: 0.0022 },
  }]),
  vertexShader: /* glsl */ `
    uniform float inkWidth;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      mvPosition.xyz += normalize(normalMatrix * normal) * inkWidth * max(-mvPosition.z, 1.5);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 inkColor;
    #include <common>
    #include <fog_pars_fragment>
    void main() {
      gl_FragColor = vec4(inkColor, 1.0);
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
  side: THREE.BackSide,
  fog: true,
});
export const CEL_INK = INK;

function inkFor(mesh: THREE.Mesh): THREE.Mesh {
  // The optimized GLBs pack positions (interleaved, quantized), which
  // mergeVertices cannot write back into; unpack to plain floats first.
  const packed = mesh.geometry.getAttribute("position");
  const positions = new Float32Array(packed.count * 3);
  for (let i = 0; i < packed.count; i++) positions.set([packed.getX(i), packed.getY(i), packed.getZ(i)], i * 3);
  const source = new THREE.BufferGeometry();
  source.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const index = mesh.geometry.index;
  if (index) source.setIndex(new THREE.BufferAttribute(Uint32Array.from({ length: index.count }, (_, i) => index.getX(i)), 1));
  const welded = mergeVertices(source, 1e-4);
  welded.computeVertexNormals();
  const ink = new THREE.Mesh(welded, INK);
  ink.name = `${mesh.name}-ink`;
  ink.castShadow = ink.receiveShadow = false;
  return ink;
}

/** Draw one loaded car in the cel look: every material banded, every mesh inked. */
export function celCar(parts: CarView): CarView {
  if (!celOn) return parts;
  const meshes: THREE.Mesh[] = [];
  parts.carVisual.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  for (const mesh of meshes) {
    if (mesh.material instanceof THREE.MeshStandardMaterial) celMaterial(mesh.material);
    mesh.add(inkFor(mesh));
  }
  return parts;
}

const PUFFS = 192;
const WHEELS: readonly [WheelId, number, number][] = [
  ["front-left", -1, -1], ["front-right", 1, -1], ["rear-left", -1, 1], ["rear-right", 1, 1],
];
/** Metres per second a tyre slides across itself before it smokes, and at which it smokes hardest. */
const SMOKE_FROM = 3, SMOKE_FULL = 10;
/** Puffs a second from one tyre sliding flat out. */
const SMOKE_RATE = 40;

export interface CelSmoke { update(state: SimState, frameDelta: number): void }

/**
 * Tyre smoke drawn as a cartoon: flat discs with a lit crescent and an ink ring,
 * which swell and then pop rather than fade, since a flat colour cannot fade
 * without turning into a gradient. Read from the tick's state, like everything
 * the renderer draws; it decides nothing.
 */
export function addCelSmoke(scene: THREE.Scene): CelSmoke {
  const material = new THREE.ShaderMaterial({
    name: "cel-smoke",
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      puffShade: { value: new THREE.Color(0x6f7789) },
      puffLit: { value: new THREE.Color(0xb9bfcc) },
      inkColor: { value: new THREE.Color(0x06080d) },
    }]),
    vertexShader: /* glsl */ `
      varying vec2 vDisc;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vDisc = uv * 2.0 - 1.0;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mvPosition.xy += position.xy * length(instanceMatrix[0].xyz);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      varying vec2 vDisc;
      uniform vec3 puffShade;
      uniform vec3 puffLit;
      uniform vec3 inkColor;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float r = length(vDisc);
        if (r > 1.0) discard;
        vec3 color = puffLit;
        if (length(vDisc - vec2(-0.3, 0.34)) >= 0.6) {
          // The shadow side is printed, not shaded: a halftone screen fixed to
          // the screen, so it reads as ink on paper rather than a texture.
          vec2 cell = fract(gl_FragCoord.xy / 7.0) - 0.5;
          color = length(cell) < 0.3 ? inkColor : puffShade;
        }
        if (r > 0.86) color = inkColor;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, PUFFS);
  mesh.name = "cel-smoke";
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const position = new Float32Array(PUFFS * 3), velocity = new Float32Array(PUFFS * 3);
  const age = new Float32Array(PUFFS).fill(1), life = new Float32Array(PUFFS).fill(1), grow = new Float32Array(PUFFS);
  let next = 0, seed = 0x2545f491;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  // Keyed by slot, not by object: a drawn state may be a fresh object every
  // frame (render/interpolate.ts), and a map of those would only ever grow.
  const debt: number[] = [];
  const pose = new THREE.Matrix4(), scale = new THREE.Vector3(), at = new THREE.Vector3(), none = new THREE.Quaternion();

  function emit(vehicle: VehicleState, slot: number, frameDelta: number): void {
    const cos = Math.cos(vehicle.heading), sin = Math.sin(vehicle.heading);
    const vx = -sin * vehicle.forwardSpeed + cos * vehicle.lateralSpeed;
    const vz = -cos * vehicle.forwardSpeed - sin * vehicle.lateralSpeed;
    for (const [id, side, end] of WHEELS) {
      const wheel = vehicle.wheels[id];
      const slide = Math.abs(wheel.lateralSpeed);
      if (slide < SMOKE_FROM || vehicle.speed < 2) continue;
      const strength = Math.min(1, (slide - SMOKE_FROM) / (SMOKE_FULL - SMOKE_FROM));
      let owed = (debt[slot] ?? 0) + strength * SMOKE_RATE * frameDelta;
      const lx = side * CAR_GEOMETRY.halfTrack, lz = end * CAR_GEOMETRY.axleZ;
      while (owed >= 1) {
        owed -= 1;
        const i = next; next = (next + 1) % PUFFS;
        position[i * 3] = vehicle.x + cos * lx + sin * lz + (random() - 0.5) * 0.4;
        position[i * 3 + 1] = vehicle.y + 0.35;
        position[i * 3 + 2] = vehicle.z - sin * lx + cos * lz + (random() - 0.5) * 0.4;
        // Carried along with most of the car's speed and gone within a second, so
        // the smoke hugs the tyres; left standing, it drifted into the chase
        // camera 7 m back and filled the frame.
        velocity[i * 3] = vx * 0.65 + (random() - 0.5) * 1.2;
        velocity[i * 3 + 1] = 0.4 + random() * 0.5;
        velocity[i * 3 + 2] = vz * 0.65 + (random() - 0.5) * 1.2;
        age[i] = 0; life[i] = 0.5 + random() * 0.4; grow[i] = 0.5 + random() * 0.7 * strength;
      }
      debt[slot] = owed;
    }
  }

  return {
    update(state, frameDelta) {
      if (frameDelta <= 0) return;
      const vehicles = [state.vehicle, state.rival?.vehicle ?? state.encounter ?? null, ...state.cruisers.map(c => c.vehicle)];
      vehicles.forEach((vehicle, slot) => { if (vehicle) emit(vehicle, slot, frameDelta); });
      const drag = Math.exp(-2.2 * frameDelta);
      for (let i = 0; i < PUFFS; i++) {
        if (age[i]! >= life[i]!) { mesh.setMatrixAt(i, pose.makeScale(0, 0, 0)); continue; }
        age[i]! += frameDelta;
        for (let k = 0; k < 3; k++) {
          velocity[i * 3 + k]! *= drag;
          position[i * 3 + k]! += velocity[i * 3 + k]! * frameDelta;
        }
        // Swell to full size, hold, then pop in the last fifth of its life.
        const t = Math.min(1, age[i]! / life[i]!);
        const size = (0.3 + grow[i]! * Math.min(1, t / 0.6)) * (t > 0.8 ? Math.max(0, 1 - (t - 0.8) / 0.2) : 1);
        at.set(position[i * 3]!, position[i * 3 + 1]!, position[i * 3 + 2]!);
        mesh.setMatrixAt(i, pose.compose(at, none, scale.setScalar(size)));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
