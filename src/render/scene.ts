import * as THREE from "three";
import { updateIntersectionSignals } from "./intersection-dressing.ts";
import type { CameraLook } from "../input/input.ts";
import { HANDLING, type SimState, type VehicleState } from "../sim/sim.ts";
import type { TrafficState } from "../sim/traffic.ts";
import { addTraffic, updateTraffic, type TrafficView } from "./traffic.ts";
import { addRaceBeacon, updateRaceBeacon, type RaceView } from "./race.ts";
import type { RoadWorld } from "../sim/road-world.ts";
import {
  CHASE_CAMERAS,
  createCameraOrbitState,
  createChaseFollowState,
  DEFAULT_CHASE_CAMERA,
  resetCameraOrbit,
  trackChaseFollow,
  updateCameraOrbit,
  type CameraOrbitState,
  type ChaseCamera,
  type ChaseCameraId,
  type ChaseFollowState,
} from "./camera.ts";
import type { CarView } from "./car.ts";
import type { CelSmoke } from "./smoke.ts";
import type { GrassView } from "./grass.ts";
import { createGarageScene } from "./garage.ts";
import { ALDER_SKY, NIGHT_HAZE, NIGHT_ZENITH } from "./sky.ts";
import { updateWheelPresentation } from "./wheels.ts";
import { createFacadeMenu } from "./facade-menu.ts";
import { ALDER_GARAGE } from "../sim/alder.ts";
import { shotProgress, easeShot, type GarageCutscene } from "./garage-cutscene.ts";

export type ViewMode = "track" | "garage" | "main";

export interface View extends CarView {
  garageCutscene?: GarageCutscene;
  roadStart: RoadWorld["start"];
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  garageScene: THREE.Scene;
  garageYaw: number;
  garageLiveryEditing: boolean;
  camera: THREE.PerspectiveCamera;
  moon: THREE.DirectionalLight;
  cameraPosition: THREE.Vector3;
  cameraTarget: THREE.Vector3;
  cameraOrbit: CameraOrbitState;
  /** Which chase framing the track camera uses (`CHASE_CAMERAS`). */
  chaseCamera: ChaseCameraId;
  /** Where a carried chase camera last saw the car (`ChaseFollow`); unknown under any other. */
  chaseFollow: ChaseFollowState;
  mode: ViewMode;
  facadeMenu: ReturnType<typeof createFacadeMenu> | null;
  facadeCameraSnap: boolean;
  facadeDeparture: boolean;
  rivalCar: CarView | null;
  parkedRivalCars: Map<string, CarView>;
  /** The sky dome, which follows the car (sky.ts). Null where a world has none. */
  sky: THREE.Object3D | null;
  /** Traffic instances, or null in a world with none. */
  traffic: TrafficView | null;
  /** The next-checkpoint beacon. Hidden unless the state carries a race. */
  race: RaceView;
  /** Road surface height, for things that stand on the road. */
  surface: (x: number, z: number) => number;
  /** The drawn tyre smoke; absent only under `?look=plain`. */
  celSmoke?: CelSmoke;
  grass?: GrassView;
}

/** Place the selected body from simulation state. */
export function placeCar(car: CarView, vehicle: VehicleState): void {
  car.car.position.set(vehicle.x, vehicle.y, vehicle.z);
  car.car.rotation.x = vehicle.pitch;
  car.car.rotation.y = vehicle.heading;
  car.car.rotation.z = vehicle.roll;
  const speedRatio = Math.min(1, vehicle.speed / HANDLING.topSpeed);
  car.carVisual.rotation.z = -vehicle.steering * speedRatio * 0.045;
  car.carVisual.rotation.x = -Math.sign(vehicle.forwardSpeed) * speedRatio * 0.018;
  updateWheelPresentation(car, vehicle);
}

/** Replace the active presentation body without resetting the simulation or camera. */
export function setPlayerCar(view: View, parts: CarView): void {
  if (view.car === parts.car) return;
  const parent = view.car.parent ?? view.scene;
  parts.car.position.copy(view.car.position);
  parts.car.rotation.copy(view.car.rotation);
  view.car.removeFromParent();
  Object.assign(view, parts);
  view.car.rotation.order = "YXZ";
  parent.add(view.car);
}

export function setRivalCar(view: View, parts: CarView | null): void {
  if (view.rivalCar) view.rivalCar.car.removeFromParent();
  view.rivalCar = parts;
  if (parts) { parts.car.rotation.order = "YXZ"; view.scene.add(parts.car); }
}

export function setParkedRivalCar(view: View, id: string, parts: CarView): void {
  view.parkedRivalCars.get(id)?.car.removeFromParent();
  view.parkedRivalCars.set(id, parts);
  parts.car.rotation.order = "YXZ";
  view.scene.add(parts.car);
}

/** Night is the district's real presentation; blockout is the flat work light
 *  that exists so junctions and grades can be judged without darkness hiding a
 *  surface error. `?lighting=blockout` still reaches it. */
export type DistrictLighting = "night" | "blockout";

export function createView(canvas: HTMLCanvasElement, carParts: CarView, roadWorld: RoadWorld,
  lighting: DistrictLighting, traffic: TrafficState | null,
  drawWorld: (scene: THREE.Scene) => void, gateRadius: number): View {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = lighting === "night" ? 1.05 : 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10182a);
  scene.fog = new THREE.FogExp2(0x101522, 0.0019);
  drawWorld(scene);
  if (lighting === "blockout") {
    // Work lighting for the blockout: judge junctions and grades, not darkness.
    scene.add(new THREE.AmbientLight(0xbad4e0, 1.5));
    scene.background = new THREE.Color(0x243546);
    scene.fog = new THREE.FogExp2(0x243546, 0.0014);
  } else {
    // Night. Almost all of the district's light is emissive — lit windows, neon,
    // the additive pools under the lamps — so the ambient term only has to stop
    // unlit geometry from going pure black, and the sky has to stay out of the
    // way of the signage.
    scene.add(new THREE.AmbientLight(0x2a3c58, 0.85));
    // The sky dome (sky.ts) covers the background where a world has one. The
    // fog is the haze at its horizon, so distance fades into haze, not black;
    // it was a third colour of its own, matching neither.
    scene.background = new THREE.Color(NIGHT_ZENITH);
    scene.fog = new THREE.FogExp2(NIGHT_HAZE, 0.0026);
  }

  const nightDistrict = lighting === "night";
  scene.add(new THREE.HemisphereLight(0x466488, 0x160e12, nightDistrict ? 0.46 : 1.08));
  const moon = new THREE.DirectionalLight(0xa9d2ff, nightDistrict ? 0.62 : 1.82);
  moon.position.set(-90, 140, 80);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -90;
  moon.shadow.camera.right = 90;
  moon.shadow.camera.top = 90;
  moon.shadow.camera.bottom = -90;
  scene.add(moon);
  scene.add(moon.target);
  const garageScene = createGarageScene();

  carParts.car.rotation.order = "YXZ";
  scene.add(carParts.car);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 650);
  const initialBehind = new THREE.Vector3(
    roadWorld.start.x + Math.sin(roadWorld.start.heading) * 8,
    roadWorld.start.y + 3.2,
    roadWorld.start.z + Math.cos(roadWorld.start.heading) * 8,
  );

  const view: View = {
    roadStart: roadWorld.start,
    renderer,
    scene,
    garageScene,
    garageYaw: 0,
    garageLiveryEditing: false,
    camera,
    moon,
    ...carParts,
    cameraPosition: initialBehind,
    cameraTarget: new THREE.Vector3(roadWorld.start.x, roadWorld.start.y + 0.9, roadWorld.start.z),
    cameraOrbit: createCameraOrbitState(),
    chaseCamera: DEFAULT_CHASE_CAMERA,
    chaseFollow: createChaseFollowState(),
    mode: "track",
    facadeMenu: scene.getObjectByName("district-garage") && document.querySelector('[data-menu-screen="main"]')
      ? createFacadeMenu(scene.getObjectByName("district-garage")!) : null,
    facadeCameraSnap: true,
    facadeDeparture: false,
    rivalCar: null, parkedRivalCars: new Map(),
    sky: scene.getObjectByName(ALDER_SKY) ?? null,
    traffic: traffic ? addTraffic(scene, traffic, roadWorld.traffic ?? null, roadWorld.grade ?? null) : null,
    race: addRaceBeacon(scene, gateRadius),
    surface: (x, z) => roadWorld.project(x, z).height,
  };

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize);
  resize();
  return view;
}

/**
 * How much the chase camera trails the direction of travel instead of the car's
 * heading. 0 bolts it to the body and hides every slide; 1 ignores the body
 * entirely and makes straight-line driving feel loose.
 */
const CAMERA_SLIP_FOLLOW = 0.7;

export function resetViewCamera(view: View): void {
  resetCameraOrbit(view.cameraOrbit);
  view.garageYaw = 0;
}

export function setViewMode(view: View, mode: ViewMode): void {
  if (view.mode === mode) return;
  const previous = view.mode;
  view.mode = mode;
  view.facadeMenu?.setActive(mode === "main");
  view.facadeDeparture = previous === "main" && mode === "track";
  view.chaseFollow.known = false;
  resetCameraOrbit(view.cameraOrbit);
  view.garageYaw = 0;

  if (mode === "garage") {
    view.garageScene.getObjectByName("garage-turntable")!.add(view.car);
    view.car.position.set(0, 0.2, 0);
    view.car.rotation.set(0, 0, 0);
    view.cameraPosition.set(5.4, 2.75, -5.4);
    view.cameraTarget.set(0, 0.82, 0);
    return;
  }

  view.scene.add(view.car);
  if (mode === "main") {
    view.facadeCameraSnap = true;
    return;
  }
  if (view.facadeDeparture) return;
  view.cameraPosition.set(
    view.roadStart.x + Math.sin(view.roadStart.heading) * 8,
    view.roadStart.y + 3.2,
    view.roadStart.z + Math.cos(view.roadStart.heading) * 8,
  );
  view.cameraTarget.set(view.roadStart.x, view.roadStart.y + 0.9, view.roadStart.z);
}

function renderGarage(view: View, frameDelta: number, cameraLook: CameraLook): void {
  view.car.position.set(0, 0.2, 0);
  view.car.rotation.set(0, 0, 0);
  view.carVisual.rotation.set(0, 0, 0);
  view.frontWheels.forEach((wheel) => { wheel.rotation.y = 0; });

  view.garageYaw = Math.atan2(Math.sin(view.garageYaw + cameraLook.x * 1.4 * frameDelta),
    Math.cos(view.garageYaw + cameraLook.x * 1.4 * frameDelta));
  view.garageScene.getObjectByName("garage-turntable")!.rotation.y = view.garageYaw;
  const mobileGarage = view.renderer.domElement.clientWidth <= 720;
  const distance = mobileGarage ? (view.garageLiveryEditing ? 12 : 16) : 7.7;
  const orbitHeading = Math.PI * 0.75;
  const horizontalDistance = distance;
  const targetPosition = new THREE.Vector3(
    Math.sin(orbitHeading) * horizontalDistance,
    2.75,
    Math.cos(orbitHeading) * horizontalDistance,
  );
  const targetLook = new THREE.Vector3(0, 0.82, 0);

  // The desktop customization rail owns the right edge of the viewport. Shift
  // the presentation camera toward that rail so the car lands in the center of
  // the unobstructed area instead of sitting underneath the controls.
  const viewportWidth = view.renderer.domElement.clientWidth;
  if (viewportWidth > 720) {
    const railWidth = Math.min(368, viewportWidth * 0.35);
    const halfViewWidth = distance * Math.tan(THREE.MathUtils.degToRad(48 / 2)) * view.camera.aspect;
    const presentationOffset = halfViewWidth * railWidth / viewportWidth;
    const cameraRight = new THREE.Vector3(Math.cos(orbitHeading), 0, -Math.sin(orbitHeading));
    targetPosition.addScaledVector(cameraRight, presentationOffset);
    targetLook.addScaledVector(cameraRight, presentationOffset);
  }

  const blend = 1 - Math.exp(-8.5 * frameDelta);
  view.cameraPosition.lerp(targetPosition, blend);
  view.cameraTarget.lerp(targetLook, blend);
  if (view.garageCutscene?.kind === "enter") {
    const t = easeShot(shotProgress(view.garageCutscene));
    view.car.position.z = (1 - t) * .8;
    view.allWheels.forEach(wheel => { wheel.rotation.x = t * .8 / .36; });
    view.cameraPosition.copy(targetPosition).add(new THREE.Vector3(1.1, -.7, .8).multiplyScalar(1 - t));
    view.cameraTarget.copy(targetLook).add(new THREE.Vector3(0, 0, view.car.position.z));
  }
  view.camera.position.copy(view.cameraPosition);
  view.camera.lookAt(view.cameraTarget);
  view.camera.fov = 48;
  if (mobileGarage) {
    const width = view.renderer.domElement.clientWidth, height = view.renderer.domElement.clientHeight;
    view.camera.setViewOffset(width, height, 0, height * .25, width, height);
  } else view.camera.clearViewOffset();
  view.camera.updateProjectionMatrix();
  view.renderer.render(view.garageScene, view.camera);
}

export function render(
  view: View,
  state: SimState,
  frameDelta: number,
  cameraLook: CameraLook,
): void {
  updateIntersectionSignals(view.scene,state.tick/60);
  if (view.mode === "garage") {
    renderGarage(view, frameDelta, cameraLook);
    return;
  }

  if (view.mode === "main" && view.facadeMenu) {
    const parked = ALDER_GARAGE.entrance;
    view.car.position.set(parked.x, parked.y + .35, parked.z);
    view.car.rotation.set(0, parked.heading, 0);
    view.carVisual.rotation.set(0, 0, 0);
    view.frontWheels.forEach(wheel => { wheel.rotation.y = 0; });
    if (view.sky) view.sky.position.copy(view.car.position);
    view.moon.position.set(parked.x - 90, 140, parked.z + 80);
    view.moon.target.position.copy(view.car.position);
    updateRaceBeacon(view.race, null, view.surface, view.camera);
    view.facadeMenu.frame(view.camera, view.cameraPosition, view.cameraTarget, frameDelta, view.facadeCameraSnap);
    view.facadeCameraSnap = false;
    view.renderer.render(view.scene, view.camera);
    return;
  }

  const car = state.vehicle;
  // At the car's height too: Queen Anne's roads climb 37 m, and a dome centred
  // at sea level would put its horizon band below the skyline up there.
  if (view.sky) view.sky.position.set(car.x, car.y, car.z);
  // Traffic is drawn from the state the tick left behind, never guessed at: the
  // renderer only draws what a tick decided. In live play main.ts hands this a
  // state blended between the last two ticks (render/interpolate.ts), which is
  // still only what ticks decided, shown up to one tick late.
  if (view.traffic && state.traffic) updateTraffic(view.traffic, state.traffic, frameDelta);
  placeCar(view, car);
  for (const rival of [...state.parkedRivals, ...state.cruisers]) {
    const parts = view.parkedRivalCars.get(rival.id);
    if (parts) placeCar(parts, rival.vehicle);
  }
  const opponent = state.rival?.vehicle ?? state.encounter;
  if (view.rivalCar && opponent) placeCar(view.rivalCar, opponent);
  view.moon.position.set(car.x - 90, 140, car.z + 80);
  view.moon.target.position.set(car.x, car.y, car.z);
  const speedRatio = Math.min(1, car.speed / HANDLING.topSpeed);

  const forwardX = -Math.sin(car.heading);
  const forwardZ = -Math.cos(car.heading);
  updateCameraOrbit(view.cameraOrbit, cameraLook, car.speed, frameDelta);
  const chase: ChaseCamera = CHASE_CAMERAS[view.chaseCamera];
  // A carried camera goes where the car went before anything is eased, so the
  // easing below is left only the framing to settle, not the car to catch.
  let speedChange = 0;
  if (chase.follow) {
    const carried = trackChaseFollow(view.chaseFollow, chase.follow, car, frameDelta);
    view.cameraPosition.x += carried.dx;
    view.cameraPosition.z += carried.dz;
    view.cameraTarget.x += carried.dx;
    view.cameraTarget.z += carried.dz;
    speedChange = carried.distance;
  } else view.chaseFollow.known = false;
  const distance = chase.distance + speedRatio * chase.distanceAtSpeed + speedChange;
  // Follow where the car is travelling, not where it is pointing. Locked to the
  // heading, a slide rotates the camera with the body: the car sits square in
  // frame and the whole world swings, so slip reads as the car translating
  // sideways instead of rotating. Trailing the velocity instead lets the nose
  // visibly point into the corner, which is what makes a slide legible.
  const velocityX = -Math.sin(car.heading) * car.forwardSpeed + Math.cos(car.heading) * car.lateralSpeed;
  const velocityZ = -Math.cos(car.heading) * car.forwardSpeed - Math.sin(car.heading) * car.lateralSpeed;
  const travelHeading = car.speed > 1.5 ? Math.atan2(-velocityX, -velocityZ) : car.heading;
  let towardTravel = travelHeading - car.heading;
  while (towardTravel > Math.PI) towardTravel -= Math.PI * 2;
  while (towardTravel < -Math.PI) towardTravel += Math.PI * 2;
  const chaseHeading = car.heading + towardTravel * CAMERA_SLIP_FOLLOW;
  const orbitHeading = chaseHeading + view.cameraOrbit.yawOffset;
  const horizontalDistance = distance * Math.cos(view.cameraOrbit.pitchOffset);
  const targetPosition = new THREE.Vector3(
    car.x + Math.sin(orbitHeading) * horizontalDistance,
    car.y + chase.height + speedRatio * chase.heightAtSpeed + Math.sin(view.cameraOrbit.pitchOffset) * distance,
    car.z + Math.cos(orbitHeading) * horizontalDistance,
  );
  const lookAhead = chase.lookAhead + speedRatio * chase.lookAheadAtSpeed;
  const forwardFocus = Math.max(0, Math.cos(view.cameraOrbit.yawOffset));
  const targetLook = new THREE.Vector3(
    car.x + forwardX * lookAhead * forwardFocus,
    car.y + chase.lookHeight + Math.sin(car.pitch) * lookAhead * forwardFocus,
    car.z + forwardZ * lookAhead * forwardFocus,
  );
  // The shutter is a solid wall. Keep a chase camera behind an outward-facing
  // car on the forecourt side until there is enough space for its full distance.
  const garageFaceX = ALDER_GARAGE.building.x - ALDER_GARAGE.building.depth / 2;
  if (car.x < garageFaceX && Math.abs(car.z - ALDER_GARAGE.building.z) < ALDER_GARAGE.building.width / 2 + 2
    && Math.abs(targetPosition.z - ALDER_GARAGE.building.z) < ALDER_GARAGE.building.width / 2 + 2) {
    targetPosition.x = Math.min(targetPosition.x, garageFaceX - 1);
  }
  if (view.facadeDeparture) {
    // Saved drives and race starts can be far from the facade. Never sweep the
    // camera across the city or through buildings to reach those destinations.
    if (view.cameraPosition.distanceTo(targetPosition) > 70 || view.facadeMenu?.prefersReducedMotion()) {
      view.cameraPosition.copy(targetPosition);
      view.cameraTarget.copy(targetLook);
    }
    view.facadeDeparture = false;
  }
  const positionBlend = 1 - Math.exp(-6.8 * frameDelta);
  const targetBlend = 1 - Math.exp(-9.5 * frameDelta);
  view.cameraPosition.lerp(targetPosition, positionBlend);
  view.cameraTarget.lerp(targetLook, targetBlend);
  view.camera.position.copy(view.cameraPosition);
  view.camera.lookAt(view.cameraTarget);
  view.camera.clearViewOffset();
  view.camera.fov = chase.fov + speedRatio * chase.fovAtSpeed;
  if (view.garageCutscene?.kind === "exit") {
    const shot = view.garageCutscene;
    const progress = shotProgress(shot);
    const roll = shot.roll ? 1.2 * (1 - easeShot(progress / .6)) : 0;
    view.car.position.x -= forwardX * roll;
    view.car.position.z -= forwardZ * roll;
    if (shot.roll) view.allWheels.forEach(wheel => { wheel.rotation.x -= roll / .36; });
    const sideX = Math.cos(car.heading), sideZ = -Math.sin(car.heading);
    const side = sideX > 0 ? -1 : 1;
    const framing = Math.min(2.2, Math.max(1, .95 / view.camera.aspect));
    const shotCamera = new THREE.Vector3(view.car.position.x + (sideX * side * 5.8 - forwardX * 3.2) * framing,
      car.y + 1.5 * framing, view.car.position.z + (sideZ * side * 5.8 - forwardZ * 3.2) * framing);
    shotCamera.x = Math.min(shotCamera.x, garageFaceX - 1);
    const shotTarget = view.car.position.clone().add(new THREE.Vector3(0, .55, 0));
    const handoff = easeShot((progress - .4) / .6);
    view.cameraPosition.copy(shotCamera).lerp(targetPosition, handoff);
    view.cameraTarget.copy(shotTarget).lerp(targetLook, handoff);
    view.camera.position.copy(view.cameraPosition);
    view.camera.lookAt(view.cameraTarget);
    view.camera.fov = THREE.MathUtils.lerp(48, chase.fov, handoff);
  }
  view.camera.updateProjectionMatrix();
  // After the camera: the beacon's sign faces it and points the exit its way.
  updateRaceBeacon(view.race, state.race, view.surface, view.camera);
  view.celSmoke?.update(state, frameDelta);
  view.grass?.update(state, frameDelta);

  view.renderer.render(view.scene, view.camera);
}
