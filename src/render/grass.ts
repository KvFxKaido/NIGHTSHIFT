import * as THREE from "three";
import { ALDER_DATA, alderGround, alderHeight } from "../sim/alder.ts";
import { spatialIndex } from "../sim/building-footprint.ts";
import type { RoadWorld } from "../sim/road-world.ts";
import type { SimState, VehicleState } from "../sim/sim.ts";
import { CAR_GEOMETRY } from "./car.ts";

/** Nearby blades, not a second terrain. The sim still owns all surface/grip rules. */
const TILE = 16, CELLS = 32, REACH = 5;
const FADE_END = 62;
const RECOVERY = 7;
const TIRE_RADIUS = .48;

interface Tile {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.MeshLambertMaterial>;
  roots: Float32Array;
  press: THREE.InstancedBufferAttribute;
}
interface Footprint { x: number; z: number }

export interface GrassView {
  update(state: SimState, delta: number): void;
  dispose(): void;
}

/** Repeatable scatter: revisiting a parcel must not rearrange its vegetation. */
function randomFor(x: number, z: number): () => number {
  let seed = (Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ 9517) >>> 0;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Exclude actual paving, water and oriented solid footprints, including their edges. */
export function grassSite(world: Pick<RoadWorld, "solids">): (x: number, z: number) => boolean {
  const nearby = spatialIndex(world.solids ?? [], b => {
    const r = Math.hypot(b.width, b.depth) / 2 + .4;
    return { minX: b.x - r, maxX: b.x + r, minZ: b.z - r, maxZ: b.z + r };
  });
  return (x, z) => {
    if (x <= ALDER_DATA.shore + 1 || !alderGround(x, z)) return false;
    return !nearby(x, z).some(b => {
      const c = Math.cos(b.rotation ?? 0), s = Math.sin(b.rotation ?? 0);
      const dx = x - b.x, dz = z - b.z;
      return Math.abs(dx * c + dz * s) < b.width / 2 + .35
        && Math.abs(-dx * s + dz * c) < b.depth / 2 + .35;
    });
  };
}

function blades(): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const root = new THREE.Color(0x334333), tip = new THREE.Color(0x72805a);
  for (let blade = 0; blade < 4; blade++) {
    const angle = blade * 2.399, c = Math.cos(angle), s = Math.sin(angle);
    const height = [.19, .28, .16, .23][blade]!;
    const base = positions.length / 3;
    // A wide base, narrower elbow, pointed tip: bent ribbons, no alpha cards.
    for (const [x, y, lean] of [[-.018, 0, .055], [.018, 0, .055], [-.012, height * .55, .085], [.012, height * .55, .085], [0, height, .15]]) {
      positions.push(x! * c + lean! * s, y!, -x! * s + lean! * c);
      const shade = root.clone().lerp(tip, y! / height);
      colors.push(shade.r, shade.g, shade.b);
    }
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function addGrass(scene: THREE.Scene, world: RoadWorld): GrassView {
  const site = grassSite(world), shape = blades();
  const tiles = new Map<string, Tile>();
  const previous = new Map<string, Footprint[]>();
  const uniforms = { grassTime: { value: 0 }, grassFocus: { value: new THREE.Vector2() } };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.name = "grass-blades";
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `attribute vec4 grassRoot;
      attribute vec4 grassStyle;
      attribute vec4 grassPress;
      uniform float grassTime;
      uniform vec2 grassFocus;
      ${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
      float grassFlatten = grassPress.z * (1.0 - smoothstep(0.0, ${RECOVERY.toFixed(1)}, grassTime - grassPress.w));
      objectNormal.xz = mat2(cos(grassStyle.x), -sin(grassStyle.x), sin(grassStyle.x), cos(grassStyle.x)) * objectNormal.xz;
      objectNormal = normalize(mix(objectNormal, vec3(0.0, 1.0, 0.0), grassFlatten * .9));
    `);
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
      float c = cos(grassStyle.x), s = sin(grassStyle.x);
      vec3 transformed = position * grassRoot.w;
      transformed.xz = mat2(c, -s, s, c) * transformed.xz;
      vec2 rootWorld = grassRoot.xz + modelMatrix[3].xz;
      float tip = clamp(position.y / .28, 0.0, 1.0);
      float pressed = grassFlatten;
      float wind = sin(grassTime * 1.2 + rootWorld.x * .31 + rootWorld.y * .23)
        + .35 * sin(grassTime * 2.3 + rootWorld.y * .77);
      transformed.xz += vec2(.045, .025) * wind * tip * tip * (1.0 - pressed);
      transformed.xz += grassPress.xy * pressed * tip * .32;
      transformed.y *= 1.0 - pressed * .86;
      // Each tuft has a stable, different reach: no circular wall of blades
      // rising together. A wide fade keeps the approach gradual at road speed.
      float visibility = 1.0 - smoothstep(grassStyle.z - 24.0, grassStyle.z, distance(rootWorld, grassFocus));
      // Newly streamed tiles also grow in gently (including after a teleport).
      visibility *= smoothstep(grassStyle.w, grassStyle.w + .65, grassTime);
      transformed *= visibility;
      transformed += grassRoot.xyz;
    `);
    shader.vertexShader = shader.vertexShader.replace("#include <color_vertex>", `#include <color_vertex>
      vColor *= grassStyle.y;
    `);
  };
  material.customProgramCacheKey = () => "grass-wind-trample-v2";

  function makeTile(tx: number, tz: number): Tile {
    const random = randomFor(tx, tz), roots: number[] = [], style: number[] = [];
    for (let iz = 0; iz < CELLS; iz++) for (let ix = 0; ix < CELLS; ix++) {
      const x = (ix + .05 + random() * .9) * TILE / CELLS;
      const z = (iz + .05 + random() * .9) * TILE / CELLS;
      const patch = .85 + .15 * Math.sin((tx * TILE + x) * .43) * Math.cos((tz * TILE + z) * .37);
      const size = (.6 + random() * .8) * patch, angle = random() * Math.PI * 2, shade = .8 + random() * .4;
      const wx = tx * TILE + x, wz = tz * TILE + z;
      if (!site(wx, wz)) continue;
      roots.push(x, alderHeight(wx, wz) + .015, z, size);
      // Reuse the seeded angle rather than consume another scatter value:
      // extending visibility must not rearrange existing grass or tyre paths.
      const variation = angle / (Math.PI * 2);
      style.push(angle, shade, 40 + variation * (FADE_END - 40), uniforms.grassTime.value + variation * .2);
    }
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = shape.index!.clone();
    for (const [name, attribute] of Object.entries(shape.attributes)) geometry.setAttribute(name, attribute.clone());
    const rootArray = new Float32Array(roots);
    geometry.setAttribute("grassRoot", new THREE.InstancedBufferAttribute(rootArray, 4));
    geometry.setAttribute("grassStyle", new THREE.InstancedBufferAttribute(new Float32Array(style), 4));
    const press = new THREE.InstancedBufferAttribute(new Float32Array(roots.length), 4);
    press.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("grassPress", press);
    geometry.instanceCount = roots.length / 4;
    const box = new THREE.Box3();
    for (let i = 0; i < roots.length; i += 4) box.expandByPoint(new THREE.Vector3(roots[i], roots[i + 1], roots[i + 2]));
    box.expandByScalar(.8);
    geometry.boundingBox = box;
    geometry.boundingSphere = box.isEmpty() ? new THREE.Sphere(new THREE.Vector3(), 0) : box.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `grass-${tx}-${tz}`;
    mesh.position.set(tx * TILE, 0, tz * TILE);
    scene.add(mesh);
    return { mesh, roots: rootArray, press };
  }

  function stamp(from: Footprint, to: Footprint, heading: number): void {
    const dx = to.x - from.x, dz = to.z - from.z, length2 = dx * dx + dz * dz;
    // Reset/teleport: flatten where the tyres landed, never draw a path across town.
    if (length2 > 64) { stamp(to, to, heading); return; }
    const length = Math.sqrt(length2), dirX = length > .01 ? dx / length : -Math.sin(heading), dirZ = length > .01 ? dz / length : -Math.cos(heading);
    for (let tz = Math.floor((Math.min(from.z, to.z) - TIRE_RADIUS) / TILE); tz <= Math.floor((Math.max(from.z, to.z) + TIRE_RADIUS) / TILE); tz++) {
      for (let tx = Math.floor((Math.min(from.x, to.x) - TIRE_RADIUS) / TILE); tx <= Math.floor((Math.max(from.x, to.x) + TIRE_RADIUS) / TILE); tx++) {
        const tile = tiles.get(`${tx},${tz}`);
        if (!tile) continue;
        let changed = false;
        for (let i = 0; i < tile.roots.length; i += 4) {
          const x = tile.roots[i]! + tx * TILE, z = tile.roots[i + 2]! + tz * TILE;
          const along = length2 > .0001 ? Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / length2)) : 0;
          const distance = Math.hypot(x - from.x - along * dx, z - from.z - along * dz);
          if (distance >= TIRE_RADIUS) continue;
          const strength = Math.min(1, (1 - distance / TIRE_RADIUS) * 3);
          const old = tile.press.getZ(i / 4), elapsed = Math.max(0, Math.min(1, (uniforms.grassTime.value - tile.press.getW(i / 4)) / RECOVERY));
          const remaining = old * (1 - elapsed * elapsed * (3 - 2 * elapsed));
          tile.press.setXYZW(i / 4, dirX, dirZ, Math.max(strength, remaining), uniforms.grassTime.value);
          changed = true;
        }
        if (changed) tile.press.needsUpdate = true;
      }
    }
  }

  function vehicleTracks(id: string, car: VehicleState): void {
    const c = Math.cos(car.heading), s = Math.sin(car.heading);
    const now: Footprint[] = [];
    for (const end of [-1, 1]) for (const side of [-1, 1]) {
      const lx = side * CAR_GEOMETRY.halfTrack, lz = end * CAR_GEOMETRY.axleZ;
      now.push({ x: car.x + c * lx + s * lz, z: car.z - s * lx + c * lz });
    }
    const was = previous.get(id) ?? now;
    now.forEach((point, i) => stamp(was[i]!, point, car.heading));
    previous.set(id, now);
  }

  return {
    update(state, delta) {
      uniforms.grassTime.value += Math.max(0, Math.min(delta, .1));
      const car = state.vehicle, cx = Math.floor(car.x / TILE), cz = Math.floor(car.z / TILE);
      uniforms.grassFocus.value.set(car.x, car.z);
      for (const [key, tile] of tiles) {
        if (Math.abs(tile.mesh.position.x / TILE - cx) <= REACH && Math.abs(tile.mesh.position.z / TILE - cz) <= REACH) continue;
        tile.mesh.removeFromParent(); tile.mesh.geometry.dispose(); tiles.delete(key);
      }
      // Nearest first; spread population over frames instead of hitching at a tile boundary.
      let budget = tiles.size === 0 ? 9 : 3;
      for (let ring = 0; ring <= REACH && budget > 0; ring++) {
        for (let dz = -ring; dz <= ring && budget > 0; dz++) for (let dx = -ring; dx <= ring && budget > 0; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const key = `${cx + dx},${cz + dz}`;
          if (!tiles.has(key)) { tiles.set(key, makeTile(cx + dx, cz + dz)); budget--; }
        }
      }
      // The extra resident ring is prefetched before it can be seen. Do not
      // submit its fully faded geometry to the GPU.
      for (const tile of tiles.values()) {
        const x = tile.mesh.position.x, z = tile.mesh.position.z;
        const dx = Math.max(x - car.x, 0, car.x - x - TILE);
        const dz = Math.max(z - car.z, 0, car.z - z - TILE);
        tile.mesh.visible = dx * dx + dz * dz < FADE_END * FADE_END;
      }
      if (delta <= 0) return;
      vehicleTracks("player", car);
      const opponent = state.rival?.vehicle ?? state.encounter;
      if (opponent) vehicleTracks("opponent", opponent);
      for (const rival of state.cruisers) vehicleTracks(rival.id, rival.vehicle);
    },
    dispose() {
      for (const tile of tiles.values()) { tile.mesh.removeFromParent(); tile.mesh.geometry.dispose(); }
      tiles.clear(); previous.clear(); shape.dispose(); material.dispose();
    },
  };
}
