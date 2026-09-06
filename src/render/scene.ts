import * as THREE from "three";
import type { CameraLook } from "../input/input.ts";
import { HANDLING, type SimState } from "../sim/sim.ts";
import { COURSE } from "../sim/track.ts";
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
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  garageScene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  moon: THREE.DirectionalLight;
  cameraPosition: THREE.Vector3;
  cameraTarget: THREE.Vector3;
  cameraOrbit: CameraOrbitState;
  mode: ViewMode;
  course: BlenderCourse | null;
}

export function createView(canvas: HTMLCanvasElement, carParts: CarView, course: BlenderCourse | null): View {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10182a);
  scene.fog = new THREE.FogExp2(0x101522, 0.0019);
  addCourse(scene, course?.root);

  scene.add(new THREE.HemisphereLight(0x466488, 0x160e12, 1.08));
  const moon = new THREE.DirectionalLight(0xa9d2ff, 1.82);
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
    COURSE.start.x + Math.sin(COURSE.start.heading) * 8,
    COURSE.start.y + 3.2,
    COURSE.start.z + Math.cos(COURSE.start.heading) * 8,
  );

  const view: View = {
    renderer,
    scene,
    garageScene,
    camera,
    moon,
    ...carParts,
    cameraPosition: initialBehind,
    cameraTarget: new THREE.Vector3(COURSE.start.x, COURSE.start.y + 0.9, COURSE.start.z),
    cameraOrbit: createCameraOrbitState(),
    mode: "track",
    course,
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
}

export function setViewMode(view: View, mode: ViewMode): void {
  if (view.mode === mode) return;
  view.mode = mode;
  resetCameraOrbit(view.cameraOrbit);

  if (mode === "garage") {
    view.garageScene.add(view.car);
    view.car.position.set(0, 0.2, 0);
    view.car.rotation.set(0, 0, 0);
    view.cameraPosition.set(5.4, 2.75, -5.4);
    view.cameraTarget.set(0, 0.82, 0);
    return;
  }

  view.scene.add(view.car);
  view.cameraPosition.set(
    COURSE.start.x + Math.sin(COURSE.start.heading) * 8,
    COURSE.start.y + 3.2,
    COURSE.start.z + Math.cos(COURSE.start.heading) * 8,
  );
  view.cameraTarget.set(COURSE.start.x, COURSE.start.y + 0.9, COURSE.start.z);
}

function renderGarage(view: View, frameDelta: number, cameraLook: CameraLook): void {
  view.car.position.set(0, 0.2, 0);
  view.car.rotation.set(0, 0, 0);
  view.carVisual.rotation.set(0, 0, 0);
  view.frontWheels.forEach((wheel) => { wheel.rotation.y = 0; });

  updateCameraOrbit(view.cameraOrbit, cameraLook, 0, frameDelta);
  const distance = 7.7;
  const orbitHeading = Math.PI * 0.75 + view.cameraOrbit.yawOffset;
  const horizontalDistance = distance * Math.cos(view.cameraOrbit.pitchOffset);
  const targetPosition = new THREE.Vector3(
    Math.sin(orbitHeading) * horizontalDistance,
    2.75 + Math.sin(view.cameraOrbit.pitchOffset) * distance,
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
): void {
  if (view.mode === "garage") {
    renderGarage(view, frameDelta, cameraLook);
    return;
  }

  const car = state.vehicle;
  if (view.course) updateCourseLighting(view.course, car);
  view.car.position.set(car.x, car.y, car.z);
  view.car.rotation.x = car.pitch;
  view.car.rotation.y = car.heading;
  view.moon.position.set(car.x - 90, 140, car.z + 80);
  view.moon.target.position.set(car.x, car.y, car.z);

  const speedRatio = Math.min(1, car.speed / HANDLING.topSpeed);
  view.carVisual.rotation.z = -car.steering * speedRatio * 0.045;
  view.carVisual.rotation.x = -Math.sign(car.forwardSpeed) * speedRatio * 0.018;
  updateWheelPresentation(view, car);

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
