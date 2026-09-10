import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import validator from "gltf-validator";
import { createBlenderCourse, updateCourseLighting } from "../src/render/blender-course.ts";
import { courseFingerprint } from "../src/render/course-asset-contract.ts";
import { COURSE_POINTS, COURSE_SEGMENTS, COURSE_WALLS } from "../src/sim/track.ts";
import { addCourse } from "../src/render/course.ts";
import { addDistrict } from "../src/render/district.ts";
import { projectOntoDistrict } from "../src/sim/district.ts";

const bytes = await readFile(new URL("../public/assets/tracks/blackglass-rivergate.glb", import.meta.url));
async function asset() {
  return (await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "")).scene;
}

test("authored track is validated, texture-free and inside its delivery budget", async () => {
  const report = await validator.validateBytes(bytes);
  assert.equal(report.issues.numErrors, 0, JSON.stringify(report.issues));
  assert.equal(report.issues.numWarnings, 0, JSON.stringify(report.issues));
  assert.ok(bytes.length < 2_500_000);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(json.textures?.length ?? 0, 0);
  assert.equal(json.cameras?.length ?? 0, 0);
  assert.equal(json.extensions?.KHR_lights_punctual?.lights?.length ?? 0, 0);
  assert.ok(json.meshes.length < 160);
  assert.ok(json.materials.length <= 16);
  assert.ok(json.materials.every((mat: {doubleSided?: boolean}) => !mat.doubleSided));
  assert.ok(!json.nodes.some((node: {name: string}) => /guide|reference|collision|camera/.test(node.name)));
  createBlenderCourse(await asset()); // Actual runtime contract, not just JSON shape.
});

test("the tunnel's inward faces block rays with normal back-face culling", async () => {
  const root = await asset();
  root.updateMatrixWorld(true);
  for (const index of [22,27,32]) {
    const point = COURSE_POINTS[index]!;
    const segment = COURSE_SEGMENTS[index]!;
    const origin = new THREE.Vector3(point.x,point.y+2,point.z);
    for (const direction of [new THREE.Vector3(0,1,0),
      new THREE.Vector3(-segment.uz,0,segment.ux),new THREE.Vector3(segment.uz,0,-segment.ux)]) {
      const ray = new THREE.Raycaster(origin,direction,0,16);
      const hits = ray.intersectObject(root,true);
      assert.ok(hits.length > 0, `tunnel segment ${index} has a hole or reversed face`);
      assert.ok(hits[0]!.distance > 4, "no nearby intrusion into the road");
    }
  }
});

test("authoring guide and shipped GLB match the unchanged road and barriers", async () => {
  const guide = JSON.parse(await readFile(new URL("../assets/tracks/blackglass/route-guide.json", import.meta.url), "utf8"));
  assert.equal(guide.fingerprint, courseFingerprint());
  assert.deepEqual(guide.points, COURSE_POINTS);
  assert.deepEqual(guide.segments, COURSE_SEGMENTS);
  assert.deepEqual(guide.walls, COURSE_WALLS);
  const course = createBlenderCourse(await asset());
  assert.equal(course.root.getObjectByName("blackglass-rivergate")!.userData.routeFingerprint, guide.fingerprint);
});

test("stale, moved, misnamed and guide-contaminated track assets fail explicitly", async () => {
  const stale = await asset();
  stale.getObjectByName("blackglass-rivergate")!.userData.routeFingerprint = "old-route";
  assert.throws(() => createBlenderCourse(stale), /current road/);
  const moved = await asset();
  moved.position.x = .2;
  assert.throws(() => createBlenderCourse(moved), /identity/);
  const anchor = await asset();
  anchor.getObjectByName("anchor-tunnel-exit")!.position.y += .2;
  assert.throws(() => createBlenderCourse(anchor), /anchor/);
  const guides = await asset();
  const guide = new THREE.Group();
  guide.name = "guide-collision";
  guides.getObjectByName("blackglass-rivergate")!.add(guide);
  assert.throws(() => createBlenderCourse(guides), /guides/);
});

test("authored scenery does not intersect the road's 6 metre driving/camera envelope", async () => {
  const root = await asset();
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
  const triangle = new THREE.Triangle();
  const matrix = new THREE.Matrix4();
  let checks = 0;
  for (const segment of COURSE_SEGMENTS) {
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), segment.rotation)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), segment.pitch));
    const roadWorld = new THREE.Matrix4().compose(new THREE.Vector3(segment.x,segment.y,segment.z),
      rotation, new THREE.Vector3(1,1,1));
    const inverseRoad = roadWorld.clone().invert();
    // Preserve the whole road ribbon, not just the current reference line.
    const road = new THREE.Box3(new THREE.Vector3(-segment.surfaceLength/2,.15,-segment.width/2+.15),
      new THREE.Vector3(segment.surfaceLength/2,6,segment.width/2-.15));
    const broadPhase = road.clone().applyMatrix4(roadWorld);
    for (const mesh of meshes) {
      mesh.geometry.computeBoundingBox();
      if (!broadPhase.intersectsBox(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld))) continue;
      matrix.multiplyMatrices(inverseRoad,mesh.matrixWorld);
      const positions = mesh.geometry.getAttribute("position");
      const indices = mesh.geometry.index;
      const count = indices?.count ?? positions.count;
      for (let index=0; index<count; index+=3) {
        triangle.a.fromBufferAttribute(positions,indices ? indices.getX(index) : index).applyMatrix4(matrix);
        triangle.b.fromBufferAttribute(positions,indices ? indices.getX(index+1) : index+1).applyMatrix4(matrix);
        triangle.c.fromBufferAttribute(positions,indices ? indices.getX(index+2) : index+2).applyMatrix4(matrix);
        checks++;
        assert.equal(road.intersectsTriangle(triangle),false,
          `${mesh.name} triangle ${index/3} clips road segment ${segment.index}`);
      }
    }
  }
  assert.ok(checks > 1000, "clearance gate must exercise actual asset triangles");
});

test("light pool remains bounded and follows authored fixtures without changing sim data", async () => {
  const course = createBlenderCourse(await asset());
  assert.equal(course.lights.length, 4);
  assert.ok(course.fixtures.some(f => f.kind === "tunnel"));
  assert.ok(course.fixtures.some(f => f.kind === "bridge"));
  const position = Object.freeze({ ...COURSE_POINTS[26]! });
  updateCourseLighting(course, position);
  assert.ok(course.lights.every(light => light.intensity > 0 && !light.castShadow));
  for (const light of course.lights) {
    assert.ok(course.fixtures.some(fixture => fixture.position.distanceTo(light.position) < 1e-5));
  }
  updateCourseLighting(course, {x:-1000,y:0,z:-1000});
  assert.ok(course.lights.every(light => light.intensity === 0));
});

test("authored and classic environments retain the same road and collision-wall presentation", async () => {
  const classic = new THREE.Scene();
  const authored = new THREE.Scene();
  addCourse(classic);
  addCourse(authored, createBlenderCourse(await asset()).root);
  function roads(scene: THREE.Scene) {
    scene.updateMatrixWorld(true);
    const data: unknown[] = [];
    scene.traverse(object => {
      if (object.name.startsWith("road-") || object.name.startsWith("barrier-")) {
        data.push({ name: object.name, matrix: object.matrixWorld.elements });
      }
    });
    return data;
  }
  assert.deepEqual(roads(authored), roads(classic));
  assert.ok(classic.getObjectByName("tunnel-roof-20"));
  assert.equal(authored.getObjectByName("tunnel-roof-20"), undefined);
  assert.ok(authored.getObjectByName("blackglass-rivergate"));
});

test("the Rivergate backdrop stays on the circuit's horizon and out of the district", async () => {
  // The backdrop was composed beyond the closed circuit's bridge. In the
  // district those coordinates are inside the street grid, and a backdrop tower
  // is not a DistrictBlock, so the footprint rules never saw it. First the
  // reason: the skyline has corners over a district carriageway. The export
  // batches the three towers into one mesh per material, so ask the vertices.
  const root = await asset();
  root.updateMatrixWorld(true);
  const backdrop = root.getObjectByName("rivergate-backdrop");
  assert.ok(backdrop, "the circuit's backdrop is missing from the asset");
  const skyline = root.getObjectByName("rivergate-backdrop-skyline-stone");
  assert.ok(skyline instanceof THREE.Mesh);
  const position = skyline.geometry.getAttribute("position");
  const vertex = new THREE.Vector3();
  let over = 0;
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i).applyMatrix4(skyline.matrixWorld);
    const road = projectOntoDistrict(vertex.x, vertex.z);
    if (road.distance < road.width / 2) over++;
  }
  assert.ok(over > 0, "the backdrop no longer stands on a district street; is this test still needed?");

  // Then the rule: the district takes the tunnel and the bridge, not the horizon.
  const district = new THREE.Scene();
  addDistrict(district, null, createBlenderCourse(root).root, "night");
  assert.ok(district.getObjectByName("authored-course"), "the tunnel and bridge still arrive");
  const drawn: string[] = [];
  district.traverse(object => { if (object.name.startsWith("rivergate-backdrop")) drawn.push(object.name); });
  assert.deepEqual(drawn, [], "backdrop drawn in the district");

  // Blackglass keeps its skyline.
  const circuit = new THREE.Scene();
  addCourse(circuit, createBlenderCourse(await asset()).root);
  assert.ok(circuit.getObjectByName("rivergate-backdrop-skyline-stone"), "the circuit lost its horizon");
});
