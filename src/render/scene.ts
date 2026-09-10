import * as THREE from "three";
import type { CameraLook } from "../input/input.ts";
import { HANDLING, type SimState, type VehicleState } from "../sim/sim.ts";
import type { TrafficState } from "../sim/traffic.ts";
import type { DistrictRoute } from "../sim/district.ts";
import { addDistrict, SKY_NAME } from "./district.ts";
import { addTraffic, updateTraffic, type TrafficView } from "./traffic.ts";
import { addRaceBeacon, updateRaceBeacon, type RaceView } from "./race.ts";
import { GATE_RADIUS } from "../sim/events.ts";
import { BLACKGLASS_WORLD, type RoadWorld } from "../sim/road-world.ts";
import {
  createCameraOrbitState,
  resetCameraOrbit,
  updateCameraOrbit,
  type CameraOrbitState,
} from "./camera.ts";
import type { CarView } from "./car.ts";
import { addCourse } from "./course.ts";
import { updateCourseLighting, type BlenderCourse } from "./blender-course.ts";
import { createGarageScene } from "./garage.ts";
import { updateWheelPresentation } from "./wheels.ts";

export type ViewMode = "track" | "garage";

export interface View extends CarView {
  roadStart: RoadWorld["start"];
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  garageScene: THREE.Scene;
  garageYaw: number;
  camera: THREE.PerspectiveCamera;
  moon: THREE.DirectionalLight;
  cameraPosition: THREE.Vector3;
  cameraTarget: THREE.Vector3;
  cameraOrbit: CameraOrbitState;
  mode: ViewMode;
  course: BlenderCourse | null;
  /** A second car driving a recorded lap, or null when nobody is out there. */
  rival: CarView | null;
  /** The district's sky dome, which follows the camera. Null off the district. */
  sky: THREE.Object3D | null;
  /** Traffic instances, or null in a world with none. */
  traffic: TrafficView | null;
  /** The next-checkpoint beacon. Hidden unless the state carries a race. */
  race: RaceView;
  /** Road surface height, for things that stand on the road. */
  surface: (x: number, z: number) => number;
}

/**
 * Place any car from a vehicle state. The player and the rival share this so a
 * recorded lap cannot drift into looking different from a live one — the lean,
 * the pitch and the wheels all come from the same code.
 */
export function placeCar(car: CarView, vehicle: VehicleState): void {
  car.car.position.set(vehicle.x, vehicle.y, vehicle.z);
  car.car.rotation.x = vehicle.pitch;
  car.car.rotation.y = vehicle.heading;
  const speedRatio = Math.min(1, vehicle.speed / HANDLING.topSpeed);
  car.carVisual.rotation.z = -vehicle.steering * speedRatio * 0.045;
  car.carVisual.rotation.x = -Math.sign(vehicle.forwardSpeed) * speedRatio * 0.018;
  updateWheelPresentation(car, vehicle);
}

/** Put a rival body in the world, or take it out again. */
export function setRival(view: View, rival: CarView | null): void {
  if (view.rival === rival) return;
  if (view.rival) view.scene.remove(view.rival.car);
  view.rival = rival;
  if (rival) view.scene.add(rival.car);
}

/** Night is the district's real presentation; blockout is the flat work light
 *  that exists so junctions and grades can be judged without darkness hiding a
 *  surface error. `?lighting=blockout` still reaches it. */
export type DistrictLighting = "night" | "blockout";

export function createView(canvas: HTMLCanvasElement, carParts: CarView, course: BlenderCourse | null,
  districtRoute: DistrictRoute | null = null, roadWorld: RoadWorld = BLACKGLASS_WORLD,
  district = districtRoute !== null, lighting: DistrictLighting = "night",
  traffic: TrafficState | null = null): View {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = district && lighting === "night" ? 1.05 : 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10182a);
  scene.fog = new THREE.FogExp2(0x101522, 0.0019);
  if (district) addDistrict(scene, districtRoute, course?.root, lighting);
  else addCourse(scene, course?.root);
  if (district && lighting === "blockout") {
    // Work lighting for the blockout: judge junctions and grades, not darkness.
    scene.add(new THREE.AmbientLight(0xbad4e0, 1.5));
    scene.background = new THREE.Color(0x243546);
    scene.fog = new THREE.FogExp2(0x243546, 0.0014);
  } else if (district) {
    // Night. Almost all of the district's light is emissive — lit windows, neon,
    // the additive pools under the lamps — so the ambient term only has to stop
    // unlit geometry from going pure black, and the sky has to stay out of the
    // way of the signage.
    scene.add(new THREE.AmbientLight(0x2a3c58, 0.85));
    scene.background = new THREE.Color(0x05080f);
    scene.fog = new THREE.FogExp2(0x070c16, 0.0026);
  }

  const nightDistrict = district && lighting === "night";
  scene.add(new THREE.HemisphereLight(0x466488, 0x160e12, nightDistrict ? 0.46 : 1.08));
  const moon = new THREE.DirectionalLight(0xa9d2ff, nightDistrict ? 0.62 : 1.82);
  moon.position.set(-90, 140, 80);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -90;
  moon.shadow.camera.right = 90;
  moon.shadow.camera.top = 90;
  moon.shadow.camera.bottom = -90;
  if (course) {
    // The authored chamfers and grazing-angle retaining walls need separation
    // from their own shadow texels at the existing 180 m shadow-map footprint.
    moon.shadow.normalBias = 0.06;
    moon.shadow.bias = -0.0001;
  }
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
    rival: null,
    scene,
    garageScene,
    garageYaw: 0,
    camera,
    moon,
    ...carParts,
    cameraPosition: initialBehind,
    cameraTarget: new THREE.Vector3(roadWorld.start.x, roadWorld.start.y + 0.9, roadWorld.start.z),
    cameraOrbit: createCameraOrbitState(),
    mode: "track",
    course,
    sky: scene.getObjectByName(SKY_NAME) ?? null,
    traffic: traffic ? addTraffic(scene, traffic) : null,
    race: addRaceBeacon(scene, GATE_RADIUS),
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
  view.mode = mode;
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
  const distance = 7.7;
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
  view.camera.position.copy(view.cameraPosition);
  view.camera.lookAt(view.cameraTarget);
  view.camera.fov = 48;
  view.camera.updateProjectionMatrix();
  view.renderer.render(view.garageScene, view.camera);
}

export function render(
  view: View,
  state: SimState,
  frameDelta: number,
  cameraLook: CameraLook,
  rival: VehicleState | null = null,
): void {
  if (view.mode === "garage") {
    renderGarage(view, frameDelta, cameraLook);
    return;
  }

  const car = state.vehicle;
  if (view.course) updateCourseLighting(view.course, car);
  if (view.sky) view.sky.position.set(car.x, 0, car.z);
  // Traffic is drawn from the state the tick left behind, never interpolated or
  // guessed at: the renderer still only draws what a tick decided.
  if (view.traffic && state.traffic) updateTraffic(view.traffic, state.traffic);
  updateRaceBeacon(view.race, state.race, view.surface);
  placeCar(view, car);
  view.moon.position.set(car.x - 90, 140, car.z + 80);
  view.moon.target.position.set(car.x, car.y, car.z);
  // The rival is drawn from its own simulation's state, never interpolated or
  // guessed at here: the renderer still only draws what a tick decided.
  if (view.rival && rival) placeCar(view.rival, rival);

  const speedRatio = Math.min(1, car.speed / HANDLING.topSpeed);

  const forwardX = -Math.sin(car.heading);
  const forwardZ = -Math.cos(car.heading);
  updateCameraOrbit(view.cameraOrbit, cameraLook, car.speed, frameDelta);
  const distance = 7.2 + speedRatio * 2.7;
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
    car.y + 3.15 + speedRatio * 1.05 + Math.sin(view.cameraOrbit.pitchOffset) * distance,
    car.z + Math.cos(orbitHeading) * horizontalDistance,
  );
  const lookAhead = 2.6 + speedRatio * 4.8;
  const forwardFocus = Math.max(0, Math.cos(view.cameraOrbit.yawOffset));
  const targetLook = new THREE.Vector3(
    car.x + forwardX * lookAhead * forwardFocus,
    car.y + 0.82 + Math.sin(car.pitch) * lookAhead * forwardFocus,
    car.z + forwardZ * lookAhead * forwardFocus,
  );
  const positionBlend = 1 - Math.exp(-6.8 * frameDelta);
  const targetBlend = 1 - Math.exp(-9.5 * frameDelta);
  view.cameraPosition.lerp(targetPosition, positionBlend);
  view.cameraTarget.lerp(targetLook, targetBlend);
  view.camera.position.copy(view.cameraPosition);
  view.camera.lookAt(view.cameraTarget);
  view.camera.fov = 62 + speedRatio * 15;
  view.camera.updateProjectionMatrix();

  view.renderer.render(view.scene, view.camera);
}
