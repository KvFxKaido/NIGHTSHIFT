import * as THREE from "three";
import {
  COURSE,
  COURSE_BRAKING_ZONES,
  COURSE_POINTS,
  COURSE_SCALE,
  COURSE_SEGMENTS,
  COURSE_WALLS,
  pointIndexForControl,
  signedTurnAt,
  type CourseSegment,
  type CourseWall,
} from "../sim/track.ts";

function part(name: string, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

const asphalt = new THREE.MeshStandardMaterial({ color: 0x11141a, roughness: 0.38, metalness: 0.2 });
const concrete = new THREE.MeshStandardMaterial({ color: 0x25272d, roughness: 0.87, metalness: 0.08 });
const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x191c22, roughness: 0.76, metalness: 0.12 });
const tunnelConcrete = new THREE.MeshStandardMaterial({ color: 0x454950, roughness: 0.72, metalness: 0.1 });
const steel = new THREE.MeshStandardMaterial({ color: 0x242b32, roughness: 0.43, metalness: 0.72 });
const roadLine = new THREE.MeshBasicMaterial({ color: 0xe6e1d4, toneMapped: false });
const warmLight = new THREE.MeshBasicMaterial({ color: 0xffd095, toneMapped: false });
const tunnelLight = new THREE.MeshBasicMaterial({ color: 0xe4f3ff, toneMapped: false });
const safetyBandMaterial = new THREE.MeshStandardMaterial({
  color: 0xb68b35,
  emissive: 0x50340c,
  emissiveIntensity: 1.1,
  roughness: 0.58,
  metalness: 0.12,
});
const embankmentMaterial = new THREE.MeshStandardMaterial({
  color: 0x202329,
  roughness: 0.94,
  metalness: 0.02,
  flatShading: true,
});

function addSky(scene: THREE.Scene): void {
  const sky = part("sky",
    new THREE.SphereGeometry(610, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        horizon: { value: new THREE.Color(0x243554) },
        zenith: { value: new THREE.Color(0x03050c) },
        glow: { value: new THREE.Color(0x6a3448) },
      },
      vertexShader: `
        varying vec3 vLocalPosition;
        void main() {
          vLocalPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 horizon;
        uniform vec3 zenith;
        uniform vec3 glow;
        varying vec3 vLocalPosition;
        void main() {
          float height = clamp(normalize(vLocalPosition).y * 0.72 + 0.28, 0.0, 1.0);
          vec3 base = mix(horizon, zenith, smoothstep(0.06, 0.82, height));
          float cityGlow = pow(1.0 - abs(normalize(vLocalPosition).y), 5.0) * 0.28;
          gl_FragColor = vec4(base + glow * cityGlow, 1.0);
        }
      `,
    }),
  );
  sky.position.y = -48;
  scene.add(sky);
}

function addEmbankments(scene: THREE.Scene): void {
  for (const segment of COURSE_SEGMENTS) {
    if (segment.zone === "bridge") continue;
    const start = COURSE_POINTS[segment.index]!;
    const end = COURSE_POINTS[(segment.index + 1) % COURSE_POINTS.length]!;
    if (Math.max(start.y, end.y) < 0.8) continue;

    const topHalfWidth = segment.width * 0.5 + 1.4;
    const baseHalfWidth = topHalfWidth + Math.min(8, Math.max(start.y, end.y) * 0.42);
    const normalX = -segment.uz;
    const normalZ = segment.ux;
    const vertices = new Float32Array([
      start.x + normalX * topHalfWidth, start.y - 0.12, start.z + normalZ * topHalfWidth,
      start.x - normalX * topHalfWidth, start.y - 0.12, start.z - normalZ * topHalfWidth,
      end.x + normalX * topHalfWidth, end.y - 0.12, end.z + normalZ * topHalfWidth,
      end.x - normalX * topHalfWidth, end.y - 0.12, end.z - normalZ * topHalfWidth,
      start.x + normalX * baseHalfWidth, -0.18, start.z + normalZ * baseHalfWidth,
      start.x - normalX * baseHalfWidth, -0.18, start.z - normalZ * baseHalfWidth,
      end.x + normalX * baseHalfWidth, -0.18, end.z + normalZ * baseHalfWidth,
      end.x - normalX * baseHalfWidth, -0.18, end.z - normalZ * baseHalfWidth,
    ]);
    const indices = [
      0, 2, 1, 1, 2, 3,
      4, 6, 0, 0, 6, 2,
      1, 3, 5, 5, 3, 7,
      4, 0, 5, 5, 0, 1,
      2, 6, 3, 3, 6, 7,
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const fill = part("fill", geometry, embankmentMaterial);
    fill.castShadow = true;
    fill.receiveShadow = true;
    scene.add(fill);
  }
}

function addRoad(scene: THREE.Scene): void {
  for (const segment of COURSE_SEGMENTS) {
    const group = makeSegmentGroup(segment);

    const surface = part(`road-${segment.zone}-${segment.index}`,
      new THREE.BoxGeometry(segment.surfaceLength + 1.2, 0.12, segment.width),
      asphalt,
    );
    surface.position.y = -0.02;
    surface.receiveShadow = true;
    group.add(surface);

    const dashCount = Math.max(1, Math.floor(segment.surfaceLength / 13));
    for (let index = 0; index < dashCount; index++) {
      const localX =
        -segment.surfaceLength * 0.5 +
        ((index + 0.5) / dashCount) * segment.surfaceLength;
      const dash = part("dash", new THREE.BoxGeometry(5.2, 0.025, 0.13), roadLine);
      dash.position.set(localX, 0.06, 0);
      group.add(dash);
    }

    for (const side of [-1, 1]) {
      const edgeLine = part("edge-line",
        new THREE.BoxGeometry(segment.surfaceLength + 0.5, 0.026, 0.12),
        roadLine,
      );
      edgeLine.position.set(0, 0.062, side * (segment.width * 0.5 - 0.72));
      group.add(edgeLine);
    }
    scene.add(group);
  }

  COURSE_POINTS.forEach((point, index) => {
    const group = makeSegmentGroup(COURSE_SEGMENTS[index]!);
    group.position.set(point.x, point.y, point.z);
    const joint = part("joint",
      new THREE.CylinderGeometry(point.width * 0.52, point.width * 0.52, 0.12, 20),
      asphalt,
    );
    joint.position.y = -0.02;
    joint.receiveShadow = true;
    group.add(joint);
    scene.add(group);
  });
}

function addBarrier(scene: THREE.Scene, wall: CourseWall): void {
  const group = new THREE.Group();
  group.position.set(wall.x, wall.y, wall.z);
  applyRoadRotation(group, wall.rotation, wall.pitch);

  const base = part(`barrier-${wall.zone}`,
    new THREE.BoxGeometry(wall.width, 0.82, wall.depth),
    wall.zone === "tunnel" ? darkConcrete : concrete,
  );
  base.position.y = 0.41;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const accentColor = wall.accent === "red" ? 0xb8243c : 0xc9c6bb;
  const reflector = part("reflector",
    new THREE.BoxGeometry(wall.width + 0.02, 0.08, wall.depth + 0.025),
    new THREE.MeshBasicMaterial({ color: accentColor, toneMapped: false }),
  );
  reflector.position.y = 0.84;
  group.add(reflector);
  scene.add(group);
}

function addStartGrid(scene: THREE.Scene): void {
  const startSegment = COURSE_SEGMENTS[0]!;
  const group = makeSegmentGroup(startSegment);
  group.position.set(COURSE.start.x, COURSE.start.y + 0.07, COURSE.start.z);
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 12; column++) {
      const tile = part("tile",
        new THREE.BoxGeometry(1.25, 0.02, 1.25),
        new THREE.MeshBasicMaterial({
          color: (row + column) % 2 === 0 ? 0xe8e5dc : 0x17181c,
          toneMapped: false,
        }),
      );
      tile.position.set(row * 1.25, 0, -6.9 + column * 1.25);
      group.add(tile);
    }
  }
  scene.add(group);
}

function addCornerLanguage(scene: THREE.Scene): void {
  const markerWhite = new THREE.MeshBasicMaterial({ color: 0xf0ede3, toneMapped: false });
  const markerRed = new THREE.MeshBasicMaterial({ color: 0xcf2743, toneMapped: false });
  const chevronMaterial = new THREE.MeshBasicMaterial({ color: 0xffb72f, toneMapped: false });
  const curbRed = new THREE.MeshBasicMaterial({ color: 0xc7233d, toneMapped: false });
  const curbWhite = new THREE.MeshBasicMaterial({ color: 0xe8e4d8, toneMapped: false });

  for (const zone of COURSE_BRAKING_ZONES) {
    for (let boardIndex = 0; boardIndex < 3; boardIndex++) {
      const offset = 8 - boardIndex * 3;
      const segmentIndex = (zone.pointIndex - offset + COURSE_SEGMENTS.length) % COURSE_SEGMENTS.length;
      const segment = COURSE_SEGMENTS[segmentIndex]!;
      const group = makeLevelSegmentGroup(segment);
      const roadside = zone.markerSide * (segment.width * 0.5 + 2.1);

      const pole = part("pole", new THREE.CylinderGeometry(0.06, 0.08, 2.3, 6), steel);
      pole.position.set(0, 1.15, roadside);
      group.add(pole);

      const board = part("board", new THREE.BoxGeometry(0.13, 1.18, 1.72), markerWhite);
      board.position.set(0, 2.25, roadside);
      group.add(board);

      for (let bar = 0; bar < 3 - boardIndex; bar++) {
        const distanceBar = part("distance-bar", new THREE.BoxGeometry(0.025, 0.17, 0.34), markerRed);
        distanceBar.position.set(-0.08, 2.25, roadside - 0.42 + bar * 0.42);
        group.add(distanceBar);
      }
      scene.add(group);
    }

    const turn = signedTurnAt(zone.pointIndex);
    const inside = turn >= 0 ? 1 : -1;
    const outside = -inside;
    for (let offset = -1; offset <= 3; offset++) {
      const segmentIndex = (zone.pointIndex + offset + COURSE_SEGMENTS.length) % COURSE_SEGMENTS.length;
      const segment = COURSE_SEGMENTS[segmentIndex]!;
      const roadGroup = makeSegmentGroup(segment);

      const curb = part("curb",
        new THREE.BoxGeometry(segment.surfaceLength + 0.15, 0.08, 0.72),
        offset % 2 === 0 ? curbWhite : curbRed,
      );
      curb.position.set(0, 0.09, inside * (segment.width * 0.5 - 0.42));
      roadGroup.add(curb);
      scene.add(roadGroup);

      if (offset % 2 === 0) {
        const signGroup = makeLevelSegmentGroup(segment);
        const chevron = part("chevron", new THREE.BoxGeometry(0.18, 1.12, 2.35), chevronMaterial);
        chevron.position.set(0, 1.35, outside * (segment.width * 0.5 + 0.8));
        signGroup.add(chevron);
        scene.add(signGroup);
      }
    }
  }
}

function applyRoadRotation(object: THREE.Object3D, yaw: number, pitch: number): void {
  const yawRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    yaw,
  );
  const pitchRotation = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    pitch,
  );
  object.quaternion.copy(yawRotation).multiply(pitchRotation);
}

function makeSegmentGroup(segment: CourseSegment): THREE.Group {
  const group = new THREE.Group();
  group.position.set(segment.x, segment.y, segment.z);
  applyRoadRotation(group, segment.rotation, segment.pitch);
  return group;
}

function makeLevelSegmentGroup(segment: CourseSegment): THREE.Group {
  const group = new THREE.Group();
  group.position.set(segment.x, segment.y, segment.z);
  group.rotation.y = segment.rotation;
  return group;
}

function addTunnel(scene: THREE.Scene): void {
  const tunnelSegments = COURSE_SEGMENTS.filter((segment) => segment.zone === "tunnel");
  let fixtureIndex = 0;
  for (const segment of tunnelSegments) {
    const group = makeSegmentGroup(segment);
    const halfWidth = segment.width * 0.5;

    const roof = part(`tunnel-roof-${segment.index}`,
      new THREE.BoxGeometry(segment.surfaceLength + 2, 0.5, segment.width + 2.2),
      darkConcrete,
    );
    roof.position.y = 6.8;
    roof.castShadow = true;
    group.add(roof);

    for (const side of [-1, 1]) {
      const wall = part(`tunnel-wall-${segment.index}`,
        new THREE.BoxGeometry(segment.surfaceLength + 2, 6.8, 0.55),
        tunnelConcrete,
      );
      wall.position.set(0, 3.4, side * (halfWidth + 0.55));
      wall.receiveShadow = true;
      group.add(wall);

      const safetyBand = part("safety-band",
        new THREE.BoxGeometry(segment.surfaceLength + 2.05, 0.68, 0.58),
        safetyBandMaterial,
      );
      safetyBand.position.set(0, 1.42, side * (halfWidth + 0.57));
      group.add(safetyBand);
    }

    const fixtureCount = Math.max(2, Math.floor(segment.surfaceLength / 11));
    for (let index = 0; index < fixtureCount; index++) {
      const localX =
        -segment.surfaceLength * 0.5 +
        ((index + 0.5) / fixtureCount) * segment.surfaceLength;
      const fixture = part("fixture",
        new THREE.BoxGeometry(0.32, 0.08, segment.width * 0.62),
        tunnelLight,
      );
      fixture.position.set(localX, 6.48, 0);
      group.add(fixture);

      if (fixtureIndex % 5 === 0) {
        const light = new THREE.PointLight(0xdcefff, 38, 28, 1.75);
        light.position.set(localX, 6.05, 0);
        group.add(light);
      }
      fixtureIndex++;
    }
    scene.add(group);
  }

  const tunnelEntrance = pointIndexForControl(4);
  const tunnelExit = pointIndexForControl(7);
  for (const portalSpec of [
    { pointIndex: tunnelEntrance, segmentIndex: tunnelEntrance },
    { pointIndex: tunnelExit, segmentIndex: tunnelExit - 1 },
  ]) {
    const segment = COURSE_SEGMENTS[portalSpec.segmentIndex]!;
    const point = COURSE_POINTS[portalSpec.pointIndex]!;
    const portal = new THREE.Group();
    portal.position.set(point.x, point.y, point.z);
    portal.rotation.y = segment.rotation;
    const beam = part("beam", new THREE.BoxGeometry(1, 7.4, 0.75), steel);
    const left = beam.clone();
    const right = beam.clone();
    left.position.set(0, 3.7, -segment.width * 0.5 - 0.6);
    right.position.set(0, 3.7, segment.width * 0.5 + 0.6);
    const top = part("top", new THREE.BoxGeometry(1, 0.75, segment.width + 1.8), steel);
    top.position.y = 7.05;
    portal.add(left, right, top);
    scene.add(portal);
  }
}

function addBridge(scene: THREE.Scene): void {
  const bridgeSegments = COURSE_SEGMENTS.filter((segment) => segment.zone === "bridge");
  for (const [bridgeIndex, segment] of bridgeSegments.entries()) {
    const group = makeLevelSegmentGroup(segment);
    const halfWidth = segment.width * 0.5;

    for (const side of [-1, 1]) {
      const rail = part("rail",
        new THREE.BoxGeometry(segment.surfaceLength + 1.5, 0.24, 0.24),
        steel,
      );
      rail.position.set(0, 2.1, side * (halfWidth + 0.75));
      rail.rotation.z = segment.pitch;
      group.add(rail);
    }

    const frameCount = Math.max(2, Math.floor(segment.length / 16));
    for (let index = 0; index <= frameCount; index++) {
      const localX = -segment.length * 0.5 + (index / frameCount) * segment.length;
      const localRoadY = Math.tan(segment.pitch) * localX;
      for (const side of [-1, 1]) {
        const post = part(`bridge-post-${segment.index}-${index}`, new THREE.BoxGeometry(0.25, 6.5, 0.3), steel);
        post.position.set(localX, localRoadY + 3.25, side * (halfWidth + 0.75));
        group.add(post);
      }
      const crossbeam = part("crossbeam",
        new THREE.BoxGeometry(0.28, 0.3, segment.width + 1.8),
        steel,
      );
      crossbeam.position.set(localX, localRoadY + 6.35, 0);
      group.add(crossbeam);

      if (index === Math.floor(frameCount * 0.5)) {
        const fixture = part("fixture", new THREE.BoxGeometry(0.7, 0.12, 0.25), warmLight);
        fixture.position.set(localX, localRoadY + 5.95, 0);
        group.add(fixture);
        const light = new THREE.PointLight(0xffc97f, 17, 27, 2);
        light.position.set(localX, localRoadY + 5.7, 0);
        group.add(light);
      }
    }

    if (bridgeIndex % 3 === 1 && segment.y > 3) {
      for (const side of [-1, 1]) {
        const pier = part("pier",
          new THREE.BoxGeometry(1.4, segment.y + 0.4, 2.1),
          darkConcrete,
        );
        pier.position.set(0, -segment.y * 0.5, side * halfWidth * 0.62);
        pier.castShadow = true;
        pier.receiveShadow = true;
        group.add(pier);
      }
    }
    scene.add(group);
  }
}

function addStreetlights(scene: THREE.Scene): void {
  const litSegments = COURSE_SEGMENTS.filter(
    (segment) => segment.zone !== "tunnel" && segment.zone !== "bridge",
  );
  let lampIndex = 0;
  for (const segment of litSegments) {
    const group = makeLevelSegmentGroup(segment);
    const count = Math.max(1, Math.floor(segment.length / 34));
    for (let index = 0; index < count; index++) {
      const x = -segment.length * 0.5 + ((index + 0.5) / count) * segment.length;
      const localRoadY = Math.tan(segment.pitch) * x;
      const side = lampIndex % 2 === 0 ? -1 : 1;
      const z = side * (segment.width * 0.5 + 2.1);
      const pole = part("pole", new THREE.CylinderGeometry(0.08, 0.11, 6.5, 7), steel);
      pole.position.set(x, localRoadY + 3.25, z);
      group.add(pole);
      const fixture = part("fixture", new THREE.BoxGeometry(0.72, 0.14, 0.3), warmLight);
      fixture.position.set(x, localRoadY + 6.45, z - side * 0.2);
      group.add(fixture);
      if (lampIndex % 6 === 0) {
        const light = new THREE.PointLight(0xffbd72, 19, 31, 2);
        light.position.set(x, localRoadY + 6.1, z);
        group.add(light);
      }
      lampIndex++;
    }
    scene.add(group);
  }
}

interface BuildingSpec {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  tone: "civic" | "glass" | "brick" | "industrial";
}

const BUILDINGS: readonly BuildingSpec[] = [
  { x: -110, z: -222, width: 58, depth: 36, height: 30, tone: "brick" },
  { x: -37, z: -224, width: 54, depth: 40, height: 48, tone: "glass" },
  { x: 36, z: -225, width: 65, depth: 37, height: 37, tone: "civic" },
  { x: 111, z: -220, width: 56, depth: 34, height: 58, tone: "glass" },
  { x: 178, z: -179, width: 42, depth: 30, height: 35, tone: "brick" },
  { x: 265, z: -112, width: 34, depth: 70, height: 44, tone: "glass" },
  { x: 276, z: -22, width: 42, depth: 75, height: 63, tone: "civic" },
  { x: 269, z: 79, width: 44, depth: 58, height: 42, tone: "glass" },
  { x: 204, z: 222, width: 64, depth: 36, height: 38, tone: "glass" },
  { x: 128, z: 229, width: 55, depth: 34, height: 52, tone: "civic" },
  { x: -132, z: 222, width: 63, depth: 35, height: 29, tone: "industrial" },
  { x: -206, z: 166, width: 48, depth: 35, height: 22, tone: "industrial" },
  { x: -266, z: 95, width: 40, depth: 64, height: 18, tone: "industrial" },
  { x: -273, z: 17, width: 42, depth: 58, height: 24, tone: "industrial" },
  { x: -251, z: -67, width: 44, depth: 56, height: 31, tone: "brick" },
  { x: -267, z: -132, width: 23, depth: 20, height: 48, tone: "civic" },
  { x: -61, z: -118, width: 52, depth: 38, height: 38, tone: "brick" },
  { x: 11, z: -119, width: 55, depth: 40, height: 45, tone: "glass" },
  { x: 79, z: -112, width: 48, depth: 44, height: 31, tone: "civic" },
];

interface WindowInstance {
  x: number;
  y: number;
  z: number;
  width: number;
  rotationY: number;
}

function addWindowInstances(
  scene: THREE.Scene,
  instances: readonly WindowInstance[],
  material: THREE.Material,
  name: string,
): void {
  const windows = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material,
    instances.length,
  );
  windows.name = name;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  instances.forEach((instance, index) => {
    position.set(instance.x, instance.y, instance.z);
    rotation.setFromAxisAngle(axis, instance.rotationY);
    scale.set(instance.width, 0.5, 0.07);
    matrix.compose(position, rotation, scale);
    windows.setMatrixAt(index, matrix);
  });
  windows.instanceMatrix.needsUpdate = true;
  scene.add(windows);
}

function addBuildings(scene: THREE.Scene): void {
  const colors: Record<BuildingSpec["tone"], number> = {
    civic: 0x343235,
    glass: 0x172532,
    brick: 0x302426,
    industrial: 0x252a2d,
  };
  const warmWindows: WindowInstance[] = [];
  const coolWindows: WindowInstance[] = [];
  for (const [buildingIndex, spec] of BUILDINGS.entries()) {
    const material = new THREE.MeshStandardMaterial({
      color: colors[spec.tone],
      roughness: spec.tone === "glass" ? 0.28 : 0.76,
      metalness: spec.tone === "glass" ? 0.46 : 0.1,
    });
    const building = part(`building-${spec.tone}-${buildingIndex}`,
      new THREE.BoxGeometry(spec.width, spec.height, spec.depth),
      material,
    );
    building.position.set(spec.x * COURSE_SCALE, spec.height * 0.5, spec.z * COURSE_SCALE);
    building.castShadow = true;
    building.receiveShadow = true;
    scene.add(building);

    const centerX = spec.x * COURSE_SCALE;
    const centerZ = spec.z * COURSE_SCALE;
    const rows = Math.max(2, Math.floor((spec.height - 4) / 6.4));
    const xColumns = Math.max(2, Math.floor(spec.width / 8));
    const zColumns = Math.max(2, Math.floor(spec.depth / 8));
    for (let row = 0; row < rows; row++) {
      const y = 4.2 + row * 6.4;
      for (let column = 0; column < xColumns; column++) {
        if ((row * 5 + column * 3 + buildingIndex) % 5 === 0) continue;
        const x = centerX - spec.width * 0.5 + ((column + 1) / (xColumns + 1)) * spec.width;
        const target = (row + column + buildingIndex) % 4 === 0 ? coolWindows : warmWindows;
        const paneWidth = Math.min(2.6, spec.width / (xColumns + 1) * 0.48);
        target.push(
          { x, y, z: centerZ + spec.depth * 0.5 + 0.05, width: paneWidth, rotationY: 0 },
          { x, y, z: centerZ - spec.depth * 0.5 - 0.05, width: paneWidth, rotationY: 0 },
        );
      }
      for (let column = 0; column < zColumns; column++) {
        if ((row * 7 + column * 2 + buildingIndex) % 6 === 0) continue;
        const z = centerZ - spec.depth * 0.5 + ((column + 1) / (zColumns + 1)) * spec.depth;
        const target = (row + column + buildingIndex) % 3 === 0 ? coolWindows : warmWindows;
        const paneWidth = Math.min(2.6, spec.depth / (zColumns + 1) * 0.48);
        target.push(
          { x: centerX + spec.width * 0.5 + 0.05, y, z, width: paneWidth, rotationY: Math.PI * 0.5 },
          { x: centerX - spec.width * 0.5 - 0.05, y, z, width: paneWidth, rotationY: Math.PI * 0.5 },
        );
      }
    }
  }

  addWindowInstances(
    scene,
    warmWindows,
    new THREE.MeshBasicMaterial({ color: 0xf0bd76, toneMapped: false }),
    "windows-warm",
  );
  addWindowInstances(
    scene,
    coolWindows,
    new THREE.MeshBasicMaterial({ color: 0x9ed9ee, toneMapped: false }),
    "windows-cool",
  );

  const marquee = part("marquee",
    new THREE.BoxGeometry(19, 2.3, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xc62b48, toneMapped: false }),
  );
  marquee.position.set(-210 * COURSE_SCALE, 12, -142.1 * COURSE_SCALE);
  scene.add(marquee);
}

function addWaterfront(scene: THREE.Scene): void {
  const water = part("water",
    new THREE.PlaneGeometry(420, 105),
    new THREE.MeshPhysicalMaterial({
      color: 0x081b29,
      roughness: 0.2,
      metalness: 0.18,
      clearcoat: 0.85,
      clearcoatRoughness: 0.24,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(38 * COURSE_SCALE, -0.16, 223 * COURSE_SCALE);
  scene.add(water);

  const reflectionColors = [0xe7a65e, 0x74b8dc, 0xc84961] as const;
  for (let index = 0; index < 18; index++) {
    const reflection = part("reflection",
      new THREE.PlaneGeometry(1.1 + (index % 3) * 0.55, 18 + (index % 5) * 7),
      new THREE.MeshBasicMaterial({
        color: reflectionColors[index % reflectionColors.length],
        transparent: true,
        opacity: 0.1 + (index % 4) * 0.025,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    reflection.rotation.x = -Math.PI / 2;
    reflection.position.set(
      (-155 + index * 19.5) * COURSE_SCALE,
      -0.145,
      (207 + (index % 4) * 10) * COURSE_SCALE,
    );
    scene.add(reflection);
  }
}

export function addCourse(scene: THREE.Scene): void {
  addSky(scene);
  const ground = part("ground",
    new THREE.PlaneGeometry(760, 650),
    new THREE.MeshStandardMaterial({ color: 0x17191e, roughness: 0.9, metalness: 0.05 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.1;
  ground.receiveShadow = true;
  scene.add(ground);

  addWaterfront(scene);
  addEmbankments(scene);
  addRoad(scene);
  COURSE_WALLS.forEach((wall) => addBarrier(scene, wall));
  addStartGrid(scene);
  addCornerLanguage(scene);
  addTunnel(scene);
  addBridge(scene);
  addStreetlights(scene);
  addBuildings(scene);
}
