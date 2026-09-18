import * as THREE from "three";
import { CAR_GEOMETRY } from "./car.ts";
import { LAUNCH } from "../sim/launch.ts";
import type { Drivetrain, SimState, VehicleState, WheelId } from "../sim/sim.ts";

/**
 * Drawn tyre smoke. The cars are drawn (design/LOOK.md), and so is what their
 * tyres throw off.
 *
 * A cloud, not a pile of balls. Every puff draws an ink disc first and its fill
 * after, and the ink writes no depth, so wherever puffs overlap their fills
 * cover each other's ink and only the cloud's outside edge keeps a line; the
 * first pass inked every puff and read as bubble wrap. Puffs are lumpy rather
 * than round and billow upward, overlapping as they climb.
 * Flat colour cannot fade without becoming a gradient, so nothing fades: a
 * puff dies by erosion, a noise threshold rising through it that opens holes,
 * each rimmed in ink, until it falls apart. A puff near the camera erodes early,
 * so the smoke a car leaves behind never fills the frame.
 *
 * NFS Unbound's smoke (reference screenshots, 2026-09-18) is chunky lumps with
 * a hard light edge, stacking into columns, its outline made by a rim of light
 * more than by ink. Here each puff is shaded as a lump: a sphere's normal read
 * off the disc, lit the way the rival portraits are, sodium from above on one
 * side and the race's cyan along the other flank, on a mid warm grey body. The ink edge
 * stays, thinner, because the cars it trails are inked.
 *
 * Read from the tick's state, like everything the renderer draws; it decides
 * nothing. It smokes when a tyre slides across itself, and at a launch: while
 * the start is held (the charge shows as smoke at the line, or in a burnout
 * anywhere else), through the boost, and hardest when a late release lights the
 * tyres up. All of it is the sim's launch state (`sim/launch.ts`).
 */

const PUFFS = 512;
/** Local x (+ right) and z (+ rear) of each tyre's contact patch, as sides of the car. */
const WHEELS: readonly [WheelId, number, number][] = [
  ["front-left", -1, -1], ["front-right", 1, -1], ["rear-left", -1, 1], ["rear-right", 1, 1],
];
/** Metres per second a tyre slides across itself before it smokes, and at which it smokes hardest. */
const SLIDE_FROM = 3, SLIDE_FULL = 10;
/** Puffs a second from one tyre at a standstill smoking flat out: a burnout, a launch. */
const RATE = 34;
/** Puffs a metre from one tyre sliding flat out. Emitted by the second, a faster
 *  slide spread the same puffs further apart and read as a trail of pebbles;
 *  by the metre they overlap into one mass at any speed. */
const PER_METRE = 2;
/** The ink disc's radius against the fill's: the width of the cloud's outline. */
const INK_GROW = 1.07;

export interface CelSmoke {
  update(state: SimState, frameDelta: number): void;
}

const VERTEX = /* glsl */ `
  attribute vec2 aPuff;
  uniform float uGrow;
  varying vec2 vDisc;
  varying vec2 vPuff;
  varying float vDepth;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vPuff = aPuff;
    // In the fill's units: the fill ends at 1, the ink quad reaches uGrow.
    vDisc = (uv * 2.0 - 1.0) * uGrow;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
    mvPosition.xy += position.xy * size * uGrow;
    vDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAGMENT = /* glsl */ `
  uniform float uInk;
  uniform vec3 puffShade;
  uniform vec3 puffBody;
  uniform vec3 puffLit;
  uniform vec3 puffRim;
  uniform vec3 inkColor;
  varying vec2 vDisc;
  varying vec2 vPuff;
  varying float vDepth;
  #include <common>
  #include <fog_pars_fragment>
  float smokeHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float smokeNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(smokeHash(i), smokeHash(i + vec2(1.0, 0.0)), f.x),
               mix(smokeHash(i + vec2(0.0, 1.0)), smokeHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float seed = vPuff.y * 91.7;
    float r = length(vDisc);
    // A lumpy, slightly jagged edge: two octaves of wobble round the puff.
    float angle = atan(vDisc.y, vDisc.x);
    float edge = 1.0 - 0.16 * smokeNoise(vec2(angle * 1.7 + seed, seed)) - 0.07 * smokeNoise(vec2(angle * 5.3 + seed, seed * 1.3));
    // Erosion from the second half of its life, and early within 5 m of the camera.
    float erode = max(smoothstep(0.45, 1.0, vPuff.x), smoothstep(5.0, 2.0, vDepth)) * 1.1;
    float n = smokeNoise(vDisc * 2.6 + seed);
    if (uInk > 0.5) {
      // The ink survives a little further in than the fill, which rims every hole.
      if (r > edge * ${INK_GROW.toFixed(2)} || n < erode - 0.09) discard;
      gl_FragColor = vec4(inkColor, 1.0);
    } else {
      if (r > edge || n < erode) discard;
      // Shaded as a lump: the normal of a sphere under the disc, roughened so
      // the bands break like brushwork rather than tracing circles.
      vec2 q = vDisc / edge;
      vec3 normal = normalize(vec3(q, sqrt(max(0.0, 1.0 - dot(q, q)))));
      float brush = (smokeNoise(vDisc * 4.5 + seed * 2.0) - 0.5) * 0.35;
      // Both lights sit behind the smoke, so each lands as a crescent on its
      // edge: sodium along the top, cyan down one flank. Lit from the front,
      // half of every puff went orange and the smoke read as rocks.
      float key = dot(normal, normalize(vec3(-0.25, 1.0, -0.35))) + brush;
      float rim = dot(normal, normalize(vec3(1.0, -0.15, -0.35))) + brush * 0.5;
      vec3 color = puffBody;
      if (key > 0.62) color = puffLit;
      else if (rim > 0.7) color = puffRim;
      else if (key < -0.15) {
        // The shadow side is printed, not shaded: a halftone screen fixed to the
        // screen, so it reads as ink on paper rather than a texture.
        vec2 cell = fract(gl_FragCoord.xy / 7.0) - 0.5;
        color = length(cell) < 0.28 ? inkColor : puffShade;
      }
      gl_FragColor = vec4(color, 1.0);
    }
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

export function addCelSmoke(scene: THREE.Scene): CelSmoke {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const puffAttribute = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS * 2), 2);
  puffAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aPuff", puffAttribute);
  const material = (ink: boolean) => new THREE.ShaderMaterial({
    name: ink ? "smoke-ink" : "smoke-fill",
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uInk: { value: ink ? 1 : 0 }, uGrow: { value: ink ? INK_GROW : 1 },
      // A mid warm grey lit like the portraits: sodium on top, cyan on the flank.
      // Near-black, the body vanished into the road at night and only the lit
      // caps showed, which read as coal; white would out-shout the car.
      puffShade: { value: new THREE.Color(0x3a3437) },
      puffBody: { value: new THREE.Color(0x5a5352) },
      puffLit: { value: new THREE.Color(0xd9894a) },
      puffRim: { value: new THREE.Color(0x3fa9c9) },
      inkColor: { value: new THREE.Color(0x06080d) },
    }]),
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    fog: true,
    // The ink writes no depth, so any puff's fill, near or far, covers it.
    depthWrite: !ink,
  });
  const fill = new THREE.InstancedMesh(geometry, material(false), PUFFS);
  const ink = new THREE.InstancedMesh(geometry, material(true), PUFFS);
  ink.instanceMatrix = fill.instanceMatrix;
  fill.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fill.name = "cel-smoke"; ink.name = "cel-smoke-ink";
  ink.renderOrder = 1; fill.renderOrder = 2;
  for (const mesh of [fill, ink]) { mesh.frustumCulled = false; scene.add(mesh); }

  const position = new Float32Array(PUFFS * 3), velocity = new Float32Array(PUFFS * 3);
  const age = new Float32Array(PUFFS).fill(1), life = new Float32Array(PUFFS).fill(1);
  const grow = new Float32Array(PUFFS), seed = new Float32Array(PUFFS);
  let next = 0, state32 = 0x2545f491;
  const random = () => { state32 = (Math.imul(state32, 1664525) + 1013904223) >>> 0; return state32 / 4294967296; };
  // Keyed by vehicle slot and tyre, not by object: a drawn state may be a fresh
  // object every frame (render/interpolate.ts), and a map of those only grows.
  const debt: number[] = [];
  const pose = new THREE.Matrix4(), scale = new THREE.Vector3(), at = new THREE.Vector3(), none = new THREE.Quaternion();

  /** 0-1 per tyre: how hard each one slides, and how hard it spins held or launching. */
  function strengths(vehicle: VehicleState, drivetrain: Drivetrain): [number, number][] {
    const launch = vehicle.launch;
    let driven = 0;
    // Held, at the line or in a burnout, the smoke is capped low: a full cloud
    // there hid the car and the road ahead from the chase camera.
    if (launch && launch.heldTicks > 0 && (launch.burnout || !launch.resolved)) driven = 0.15 + 0.2 * launch.charge;
    else if (launch?.penaltyTicks && launch.feedback === "WHEELSPIN") driven = 1;
    else if (launch?.boostTicks) driven = 0.55 * launch.boostTicks / LAUNCH.boostTicks;
    return WHEELS.map(([id, , end]) => {
      const slide = vehicle.speed < 2 ? 0 : Math.min(1, Math.max(0, (Math.abs(vehicle.wheels[id].lateralSpeed) - SLIDE_FROM) / (SLIDE_FULL - SLIDE_FROM)));
      const isDriven = drivetrain === "awd" || (drivetrain === "rwd" ? end > 0 : end < 0);
      return [slide, isDriven ? driven : 0];
    });
  }

  function emit(vehicle: VehicleState, drivetrain: Drivetrain, slot: number, frameDelta: number): void {
    const cos = Math.cos(vehicle.heading), sin = Math.sin(vehicle.heading);
    const vx = -sin * vehicle.forwardSpeed + cos * vehicle.lateralSpeed;
    const vz = -cos * vehicle.forwardSpeed - sin * vehicle.lateralSpeed;
    strengths(vehicle, drivetrain).forEach(([slide, spin], w) => {
      const key = slot * 4 + w;
      const strength = Math.max(slide, spin);
      if (strength <= 0) { debt[key] = 0; return; }
      const travelled = vehicle.speed * frameDelta;
      let owed = (debt[key] ?? 0) + slide * PER_METRE * travelled + spin * RATE * frameDelta;
      const [, side, end] = WHEELS[w]!;
      // Just behind the contact patch.
      const lx = side * CAR_GEOMETRY.halfTrack, lz = end * CAR_GEOMETRY.axleZ + 0.3;
      const count = Math.floor(owed);
      for (let k = 0; k < count; k++) {
        owed -= 1;
        // Spread back along this frame's path rather than stacked where the car
        // is now, so a fast frame lays its puffs out evenly instead of in a clump.
        const behind = count > 1 ? k / count : 0;
        const i = next; next = (next + 1) % PUFFS;
        position[i * 3] = vehicle.x + cos * lx + sin * lz - vx * frameDelta * behind + (random() - 0.5) * 0.3;
        position[i * 3 + 1] = vehicle.y + 0.3;
        position[i * 3 + 2] = vehicle.z - sin * lx + cos * lz - vz * frameDelta * behind + (random() - 0.5) * 0.3;
        // Carried with the car and thrown back off the tyre, spread along the
        // road, rising slowly. Thrown back, smoke at a standstill billows out
        // behind the car towards the camera, where it erodes, instead of
        // towering over the roof: held through a countdown, it hid the road.
        const back = 1.5 + random() * 1.5;
        velocity[i * 3] = vx * 0.5 + sin * back + (random() - 0.5) * 1.6;
        velocity[i * 3 + 1] = 0.3 + random() * 0.4;
        velocity[i * 3 + 2] = vz * 0.5 + cos * back + (random() - 0.5) * 1.6;
        age[i] = 0; life[i] = 1.0 + random() * 0.8; seed[i] = random();
        // Size follows how hard the tyre smokes: a full slide throws lumps big
        // enough to overlap into one mass (shrunk, they spread into a trail of
        // pebbles), and a held burnout, capped low, stays around the wheels.
        grow[i] = (1.2 + random() * 1.2) * (0.25 + 0.75 * strength);
      }
      debt[key] = owed;
    });
  }

  return {
    update(state, frameDelta) {
      if (frameDelta <= 0) return;
      const others = [state.rival?.vehicle ?? state.encounter ?? null, ...state.cruisers.map(c => c.vehicle)];
      emit(state.vehicle, state.drivetrain, 0, frameDelta);
      // Nobody else's drivetrain is in the state; every rival body smokes from the rear.
      others.forEach((vehicle, index) => { if (vehicle) emit(vehicle, "rwd", index + 1, frameDelta); });
      // Heavy drag along the road and a little lift, so lumps pile up where the
      // tyre worked and climb into columns instead of streaming after the car.
      const drag = Math.exp(-3.2 * frameDelta);
      for (let i = 0; i < PUFFS; i++) {
        if (age[i]! >= life[i]!) { fill.setMatrixAt(i, pose.makeScale(0, 0, 0)); continue; }
        age[i]! += frameDelta;
        velocity[i * 3 + 1]! += 1.0 * frameDelta;
        for (let k = 0; k < 3; k++) {
          if (k !== 1) velocity[i * 3 + k]! *= drag;
          position[i * 3 + k]! += velocity[i * 3 + k]! * frameDelta;
        }
        const t = Math.min(1, age[i]! / life[i]!);
        // Swell fast and settle, climbing as it goes: lumps that stayed low and
        // flat on the road, each with its own lit cap, read as a pile of rocks.
        const size = 0.25 + grow[i]! * (1 - (1 - t) * (1 - t));
        at.set(position[i * 3]!, position[i * 3 + 1]! + size * 0.35, position[i * 3 + 2]!);
        fill.setMatrixAt(i, pose.compose(at, none, scale.set(size * (1.15 - 0.15 * t), size * (0.95 + 0.05 * t), 1)));
        puffAttribute.setXY(i, t, seed[i]!);
      }
      fill.instanceMatrix.needsUpdate = true;
      puffAttribute.needsUpdate = true;
    },
  };
}
