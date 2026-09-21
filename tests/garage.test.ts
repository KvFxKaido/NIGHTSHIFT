import assert from "node:assert/strict";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { ALDER_GARAGE as DISTRICT_GARAGE, ALDER_BLOCKS as DISTRICT_BLOCKS, createAlderWorld as createFreeRoamWorld } from "../src/sim/alder.ts";
import { canEnterGarage } from "../src/sim/garage.ts";
import { createSim, step, type SimState } from "../src/sim/sim.ts";
import { transitionMenu } from "../src/ui/menu-state.ts";
import { addGarageExterior, createGarageScene } from "../src/render/garage.ts";
import { createCar } from "../src/render/car.ts";
import { createChaseFollowState } from "../src/render/camera.ts";
import { ALDER_FORECOURT, ALDER_GARAGE_SOLIDS, ALDER_SOLIDS } from "../src/sim/alder.ts";
import { blockCorners, blockPenetration, segmentFootprintDistance } from "../src/sim/building-footprint.ts";
import { GARAGE_MENU_DEPTH } from "../src/sim/garage-site.ts";
import { addGarageForecourt } from "../src/render/garage.ts";
import { render, resetViewCamera, setViewMode, type View } from "../src/render/scene.ts";

await RAPIER.init();

test("garage planting stays inside the apron and clear of every service bay", () => {
  for (const planter of ALDER_GARAGE_SOLIDS) {
    assert.ok(ALDER_SOLIDS.includes(planter));
    assert.ok(blockPenetration(planter, DISTRICT_GARAGE.building) < 0);
    for (const p of blockCorners(planter)) {
      assert.ok(Math.abs(p.x - ALDER_FORECOURT.x) <= ALDER_FORECOURT.width / 2);
      assert.ok(Math.abs(p.z - ALDER_FORECOURT.z) <= ALDER_FORECOURT.depth / 2);
    }
    for (const z of [901, 910, 919]) {
      assert.ok(segmentFootprintDistance(planter, { x: 1, z }, { x: 22, z }) > 3,
        "a planter intrudes into the service-bay approach");
    }
    assert.ok(segmentFootprintDistance(planter, { x: 17, z: 885 }, { x: 17, z: 935 }) > 1.8,
      "planting blocks a car driving along the facade from the garage entrance");
  }
});

test("garage detail is batched, adds no lights and leaves menu depth clear", () => {
  const scene = new THREE.Scene();
  addGarageExterior(scene, DISTRICT_GARAGE.building);
  addGarageForecourt(scene, DISTRICT_GARAGE.building, ALDER_FORECOURT);
  let meshes = 0, triangles = 0, lights = 0;
  scene.traverse(object => {
    if (object instanceof THREE.Light) lights++;
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3;
    if (object.name === "district-garage-architecture") {
      object.geometry.computeBoundingBox();
      assert.ok(object.geometry.boundingBox!.min.z > -DISTRICT_GARAGE.building.depth / 2 - GARAGE_MENU_DEPTH);
    }
  });
  assert.equal(lights, 0);
  assert.ok(meshes <= 22, `${meshes} garage meshes`);
  assert.ok(triangles < 6500, `${triangles} garage triangles`);
});

test("the garage exterior uses its real solid warehouse footprint", () => {
  assert.ok(DISTRICT_BLOCKS.includes(DISTRICT_GARAGE.building));
  const scene = new THREE.Scene();
  addGarageExterior(scene, DISTRICT_GARAGE.building);
  const body = scene.getObjectByName("district-garage-building") as THREE.Mesh;
  scene.updateMatrixWorld(true);
  const centre = body.getWorldPosition(new THREE.Vector3()), block = DISTRICT_GARAGE.building;
  assert.ok(centre.distanceTo(new THREE.Vector3(block.x, block.base + block.height / 2, block.z)) < 1e-8);
  const parameters = (body.geometry as THREE.BoxGeometry).parameters;
  assert.deepEqual([parameters.width, parameters.height, parameters.depth], [block.width, block.height, block.depth]);
  assert.equal(body.parent!.rotation.y, -block.rotation);
  assert.ok(scene.getObjectByName("district-garage-sign"));
});

test("free roam starts outside the garage and can drive clear of its collider", () => {
  const sim = createSim("fwd", createFreeRoamWorld(), { traffic: false });
  try {
    assert.ok(canEnterGarage(DISTRICT_GARAGE, sim.state.vehicle, false));
    for (let i = 0; i < 90; i++) step(sim, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
    const distance = Math.hypot(sim.state.vehicle.x - DISTRICT_GARAGE.entrance.x,
      sim.state.vehicle.z - DISTRICT_GARAGE.entrance.z);
    assert.ok(distance > 4, `garage exit travelled only ${distance} m`);
    assert.ok(sim.state.vehicle.speed > 4, "the garage exit is blocked");
  } finally { sim.world.free(); }
});

test("garage entry requires stopping at the door on the correct level outside a race", () => {
  const vehicle = { ...DISTRICT_GARAGE.entrance, speed: 0 };
  assert.ok(canEnterGarage(DISTRICT_GARAGE, vehicle, false));
  assert.equal(canEnterGarage(DISTRICT_GARAGE, { ...vehicle, speed: 10 }, false), false);
  assert.equal(canEnterGarage(DISTRICT_GARAGE, { ...vehicle, x: vehicle.x + 20 }, false), false);
  assert.equal(canEnterGarage(DISTRICT_GARAGE, { ...vehicle, y: vehicle.y + 10 }, false), false);
  assert.equal(canEnterGarage(DISTRICT_GARAGE, vehicle, true), false);
  const garage = transitionMenu({ screen: "playing", returnTo: "main" }, "open-garage");
  assert.equal(garage.screen, "garage");
  assert.equal(transitionMenu(garage, "back").screen, "playing");
});

test("garage input turns the car with the platform while the camera stays in front of the walls", () => {
  // Exercise the actual render path with real Three objects; only the GPU
  // draw is a sink, so camera placement and car parenting remain under test.
  const view = { ...createCar(), scene: new THREE.Scene(), garageScene: createGarageScene(),
    mode: "track", garageYaw: 0, cameraOrbit: { yawOffset: 0, pitchOffset: 0 },
    chaseFollow: createChaseFollowState(),
    camera: new THREE.PerspectiveCamera(48, 1440 / 1000, 0.1, 650),
    cameraPosition: new THREE.Vector3(), cameraTarget: new THREE.Vector3(),
    roadStart: DISTRICT_GARAGE.entrance,
    renderer: { domElement: { clientWidth: 1440 }, render: () => {} } } as unknown as View;
  const state = { vehicle: { x: 11, y: 2, z: 15, heading: 0.4 } } as SimState;
  const originalState = JSON.stringify(state);
  setViewMode(view, "garage");
  for (let i = 0; i < 180; i++) render(view, state, 1 / 60, { x: 0, y: 0 });
  const camera = view.camera.position.clone(), target = view.cameraTarget.clone();
  const platform = view.garageScene.getObjectByName("garage-turntable")!;
  assert.equal(view.car.parent, platform);
  render(view, state, 0.5, { x: 1, y: 1 });
  assert.ok(Math.abs(platform.rotation.y) > 0.5);
  for (let i = 0; i < 600; i++) {
    render(view, state, 1 / 60, { x: 1, y: i % 2 ? 1 : -1 });
    assert.ok(view.camera.position.distanceTo(camera) < 1e-8, "inspection moves the camera");
    assert.ok(view.cameraTarget.distanceTo(target) < 1e-8);
    assert.ok(view.camera.position.z < 5.5 && view.camera.position.x > -8.4);
  }
  assert.equal(JSON.stringify(state), originalState, "inspection mutated the driving simulation");
  resetViewCamera(view);
  render(view, state, 1 / 60, { x: 0, y: 0 });
  assert.equal(platform.rotation.y, 0);
  setViewMode(view, "track");
  assert.equal(view.car.parent, view.scene);
});
