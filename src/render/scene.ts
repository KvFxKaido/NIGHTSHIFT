/* The render layer.

   three.js translates sim state into a picture and is allowed to know
   nothing else (GDD §17.2). If a value matters to gameplay, it does not
   live here. The chase camera is presentation — but per GDD §14 it is
   load-bearing presentation, so it grows here, not in the sim. */

import * as THREE from "three";
import { type SimState } from "../sim/sim.ts";

export interface View {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  car: THREE.Object3D;
}

export function createView(canvas: HTMLCanvasElement): View {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a12);
  scene.fog = new THREE.Fog(0x0a0a12, 40, 140);

  // a wet-asphalt stand-in and a grid to make motion legible
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.35, metalness: 0.1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const grid = new THREE.GridHelper(400, 100, 0x2a2a3a, 0x1a1a26);
  scene.add(grid);

  // placeholder car: a box with a cab — Phase 1 gets a real chassis
  const car = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.5, 4.2),
    new THREE.MeshStandardMaterial({ color: 0x8a1f2b, roughness: 0.25, metalness: 0.6 }),
  );
  body.position.y = 0.45;
  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.42, 1.9),
    new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.1, metalness: 0.4 }),
  );
  cab.position.set(0, 0.85, 0.1);
  car.add(body, cab);
  scene.add(car);

  // sodium-vapor key light, cool fill — the palette argument starts early
  const key = new THREE.DirectionalLight(0xffb46b, 1.1);
  key.position.set(30, 40, 10);
  scene.add(key);
  scene.add(new THREE.AmbientLight(0x33405e, 0.7));

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 300);

  const view = { renderer, scene, camera, car };
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize);
  resize();
  return view;
}

const camPos = new THREE.Vector3(0, 4.5, 8);

export function render(view: View, s: SimState): void {
  view.car.position.set(s.x, 0, s.z);
  view.car.rotation.y = s.heading;

  // dumb chase camera: sits behind the heading, eases toward its target
  const behind = new THREE.Vector3(
    s.x + Math.sin(s.heading) * (7 + s.speed * 0.12),
    3.2 + s.speed * 0.03,
    s.z + Math.cos(s.heading) * (7 + s.speed * 0.12),
  );
  camPos.lerp(behind, 0.08);
  view.camera.position.copy(camPos);
  view.camera.lookAt(s.x, 1, s.z);
  view.camera.fov = 62 + Math.min(18, s.speed * 0.45);
  view.camera.updateProjectionMatrix();

  view.renderer.render(view.scene, view.camera);
}
