import * as THREE from "three";

export { addGarageExterior, addGarageForecourt } from "./garage-exterior.ts";

function box(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createGarageScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070a0f);
  scene.fog = new THREE.FogExp2(0x070a0f, 0.024);

  const concrete = new THREE.MeshStandardMaterial({
    color: 0x171a20,
    roughness: 0.88,
    metalness: 0.06,
  });
  const darkSteel = new THREE.MeshStandardMaterial({
    color: 0x11151b,
    roughness: 0.42,
    metalness: 0.78,
  });
  const cabinetPaint = new THREE.MeshStandardMaterial({
    color: 0x6f1025,
    roughness: 0.36,
    metalness: 0.62,
  });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x75dfff, toneMapped: false });
  const warm = new THREE.MeshBasicMaterial({ color: 0xffc071, toneMapped: false });
  const red = new THREE.MeshBasicMaterial({ color: 0xff3158, toneMapped: false });

  scene.add(new THREE.HemisphereLight(0x36516f, 0x130c10, 0.82));

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 22), concrete);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(22, 22, 0x31516a, 0x202a35);
  grid.position.y = 0.008;
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
  gridMaterials.forEach((material) => {
    material.transparent = true;
    material.opacity = 0.34;
  });
  scene.add(grid);

  scene.add(
    box(18, 6.8, 0.35, concrete, 0, 3.4, 5.9),
    box(0.35, 6.8, 15, concrete, -8.8, 3.4, -1.4),
  );

  const platform = new THREE.Group();
  platform.name = "garage-turntable";
  scene.add(platform);
  const turntable = new THREE.Mesh(
    new THREE.CylinderGeometry(3.45, 3.62, 0.18, 40),
    darkSteel,
  );
  turntable.position.y = 0.09;
  turntable.receiveShadow = true;
  turntable.name = "garage-turntable-deck";
  platform.add(turntable);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.035, 8, 64), cyan);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.19;
  ring.name = "garage-turntable-ring";
  platform.add(ring);
  for (const side of [-1, 1]) {
    const marker = box(0.08, 0.01, 0.7, warm, side * 2.8, 0.185, 0);
    marker.name = `garage-turntable-marker-${side < 0 ? "left" : "right"}`;
    platform.add(marker);
  }

  for (const x of [-5.9, -3.7, -1.5, 0.7, 2.9, 5.1]) {
    scene.add(box(0.09, 5.8, 0.11, darkSteel, x, 2.9, 5.68));
  }

  scene.add(
    box(3.4, 1.5, 0.7, cabinetPaint, -6.6, 0.76, 4.98),
    box(2.1, 2.3, 0.7, darkSteel, 6.6, 1.16, 4.98),
    box(4.8, 0.22, 0.18, red, 2.7, 4.35, 5.68),
  );

  for (const x of [-2.8, 2.8]) {
    const fixture = box(0.18, 0.08, 5.8, warm, x, 5.55, -0.2);
    fixture.castShadow = false;
    scene.add(fixture);
    // 54 cd on a near-horizontal panel clips all three channels, so a red hood
    // renders as a white slab. The hard edge is the clamp, not the geometry.
    const light = new THREE.SpotLight(0xffd6a0, 26, 16, 0.72, 0.62, 1.35);
    light.position.set(x, 5.35, -0.2);
    light.target.position.set(x * 0.22, 0.2, 0);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    scene.add(light, light.target);
  }

  const rimLight = new THREE.PointLight(0x59d8ff, 28, 12, 1.8);
  rimLight.position.set(-4.8, 1.7, -2.8);
  const redLight = new THREE.PointLight(0xff3158, 18, 11, 1.8);
  redLight.position.set(4.7, 1.3, 3.5);
  scene.add(rimLight, redLight);

  return scene;
}
