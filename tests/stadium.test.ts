import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, resetSim, step } from "../src/sim/sim.ts";
import { SABLE_DRIFT } from "../src/sim/drift-event.ts";
import { DRIFT_YARD, DRIFT_ZONES, SABLE, YARD_LINE } from "../src/sim/drift-yard.ts";
import { STADIUM_SHELL_MESH } from "../src/sim/stadium-shell.ts";
import { NodeIO } from "@gltf-transform/core";
import * as THREE from "three";
import { YARD_STRUCTURES } from "../src/sim/drift-yard.ts";
import { nearbyChallenge } from "../src/sim/encounter.ts";
import { addStadiumDoors } from "../src/render/stadium.ts";
import {
  STADIUM, STADIUM_FLOOR, STADIUM_GATES, STADIUM_MARKER, STADIUM_VERSION,
  createStadiumWorld, inStadium, onStadiumPad, stadiumGate, stadiumGateAt,
} from "../src/sim/stadium.ts";

await RAPIER.init();

// The venue is a world of its own, entered and left only at its gates (src/sim/stadium.ts). Everything below holds
// it to that: sealed where a car drives, the floor it was drawn with, markers that only work stopped, and Sable's
// event still an event there.

test("the venue is sealed at car height: every way in is a gate's marker", () => {
  // The continuous shell sliced where the car's body is (surface + 0.12..0.88, sim.ts), rasterised at a metre and
  // flooded from the east gate's arrival. The flood must stay off the raster's edge, and reach every place a car
  // is put or asked to go.
  const minX = -1160, maxX = -40, minZ = 790, maxZ = 1200, W = maxX - minX, H = maxZ - minZ;
  const wall = new Uint8Array(W * H);
  for (const mesh of [STADIUM_SHELL_MESH]) for (const y of [STADIUM.base + .2, STADIUM.base + .5, STADIUM.base + .85]) {
    const { vertices: v, indices } = mesh;
    for (let t = 0; t < indices.length; t += 3) {
      const hits: [number, number][] = [];
      for (let e = 0; e < 3; e++) {
        const i = indices[t + e]! * 3, j = indices[t + (e + 1) % 3]! * 3;
        if ((v[i + 1]! - y) * (v[j + 1]! - y) < 0) {
          const f = (y - v[i + 1]!) / (v[j + 1]! - v[i + 1]!);
          hits.push([v[i]! + (v[j]! - v[i]!) * f, v[i + 2]! + (v[j + 2]! - v[i + 2]!) * f]);
        }
      }
      if (hits.length !== 2) continue;
      const [[ax, az], [bx, bz]] = hits as [[number, number], [number, number]];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) * 2) + 1;
      for (let k = 0; k <= n; k++) {
        const x = Math.floor(ax + (bx - ax) * k / n - minX), z = Math.floor(az + (bz - az) * k / n - minZ);
        for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          if (x + dx >= 0 && z + dz >= 0 && x + dx < W && z + dz < H) wall[(z + dz) * W + x + dx] = 1;
        }
      }
    }
  }
  const inside = new Uint8Array(W * H), arrive = STADIUM_GATES[0].venue.arrive;
  const stack = [[Math.floor(arrive.x - minX), Math.floor(arrive.z - minZ)]];
  let leaked = false, area = 0;
  while (stack.length) {
    const [x, z] = stack.pop()!;
    if (x! < 0 || z! < 0 || x! >= W || z! >= H) { leaked = true; continue; }
    const i = z! * W + x!;
    if (inside[i] || wall[i]) continue;
    inside[i] = 1; area++;
    stack.push([x! + 1, z!], [x! - 1, z!], [x!, z! + 1], [x!, z! - 1]);
  }
  assert.equal(leaked, false, "the flood from the east arrival left the arena: the wall is open at car height");
  assert.ok(area > 170_000 && area < 200_000, `the floor floods ${(area / 1e4).toFixed(1)} ha; the continuous shell encloses about 19.5 ha`);
  const reached = (p: { x: number; z: number }) => inside[Math.floor(p.z - minZ) * W + Math.floor(p.x - minX)] === 1;
  const places = [
    ...STADIUM_GATES.flatMap(gate => [{ name: `${gate.id} arrival`, ...gate.venue.arrive }, { name: `${gate.id} marker`, ...gate.venue.marker }]),
    { name: "drift grid", ...DRIFT_YARD.start }, { name: "Sable", ...SABLE.start },
    ...DRIFT_ZONES.map(zone => ({ ...zone, name: zone.id })), ...YARD_LINE.map((p, i) => ({ name: `line ${i}`, ...p })),
  ];
  for (const place of places) assert.ok(reached(place), `${place.name} is not on the sealed floor`);
  // And the drawn floor is that floor: the polygon agrees with the flood at every place, and outside the gates.
  for (const place of places) assert.ok(inStadium(place.x, place.z), `${place.name} is off the drawn floor`);
  for (const gate of STADIUM_GATES) assert.ok(!inStadium(gate.city.leave.x, gate.city.leave.z), `${gate.id}'s city side is on the venue floor`);
  assert.ok(STADIUM_FLOOR.length > 40, `the floor is a ${STADIUM_FLOOR.length}-point polygon`);
});

test("a car driven flat out at either restored gate wall stays in the venue", () => {
  for (const gate of STADIUM_GATES) {
    // From the arrival, turned round to face the marker and the wall where the city gate was.
    const start = { ...gate.venue.arrive, heading: gate.venue.arrive.heading + Math.PI };
    const sim = createSim("awd", createStadiumWorld(start), {});
    try {
      for (let tick = 0; tick < 600; tick++) {
        step(sim, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
        assert.ok(inStadium(sim.state.vehicle.x, sim.state.vehicle.z),
          `${gate.id}: through the wall at ${sim.state.vehicle.x.toFixed(1)}, ${sim.state.vehicle.z.toFixed(1)} on tick ${tick}`);
      }
      // Hit hard: 60 m/s square into it from 20 m inside.
      const marker = gate.venue.marker, arrive = gate.venue.arrive;
      const out = { x: marker.x - arrive.x, z: marker.z - arrive.z }, length = Math.hypot(out.x, out.z);
      sim.body.setTranslation({ x: marker.x, y: STADIUM.base + .5, z: marker.z }, true);
      sim.body.setLinvel({ x: out.x / length * 60, y: 0, z: out.z / length * 60 }, true);
      for (let tick = 0; tick < 60; tick++) {
        step(sim, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
        assert.ok(inStadium(sim.state.vehicle.x, sim.state.vehicle.z), `${gate.id}: a 60 m/s hit passed the wall on tick ${tick}`);
      }
    } finally { sim.world.free(); }
  }
});

test("the floor is dirt, but for Sable's apron and the circuits, and no world here has traffic", () => {
  const world = createStadiumWorld();
  assert.equal(world.traffic, undefined);
  // The east gate arrives on dirt and the west infield is dirt; the north gate arrives on the circuits' north run
  // (tests/stadium-circuits.test.ts holds the circuits' paving).
  for (const p of [STADIUM_GATES[0].venue.arrive, { x: -900, z: 1029 }]) assert.equal(world.ground!(p.x, p.z), true, `${p.x}, ${p.z} is paved`);
  for (const p of [DRIFT_YARD.start, SABLE.start, ...DRIFT_ZONES, ...YARD_LINE]) {
    assert.equal(world.ground!(p.x, p.z), false, `Sable's line is on dirt at ${p.x}, ${p.z}`);
    assert.ok(onStadiumPad(p.x, p.z));
  }
  assert.equal(world.project(-800, 1030).height, STADIUM.base);
  // A 2WD car pays for it, as anywhere dirt is reported: its top of the next 8 s is lower off the pad than on it.
  const topSpeed = (start: { x: number; z: number; heading: number }) => {
    const sim = createSim("rwd", createStadiumWorld({ ...start, y: STADIUM.base, pitch: 0 }), {});
    try {
      for (let tick = 0; tick < 480; tick++) step(sim, { throttle: 1, brake: 0, steer: 0, handbrake: 0 });
      return sim.state.vehicle.speed;
    } finally { sim.world.free(); }
  };
  const onDirt = topSpeed({ x: -1000, z: 1040, heading: -Math.PI / 2 }), onPad = topSpeed({ x: -610, z: 1000, heading: -Math.PI / 2 });
  assert.ok(onDirt < onPad - 1, `dirt ${onDirt.toFixed(1)} m/s against the pad's ${onPad.toFixed(1)}`);
});

test("a gate's marker offers the other side only to a car stopped at it, never in a race", () => {
  for (const gate of STADIUM_GATES) for (const side of ["city", "venue"] as const) {
    const marker = gate[side].marker;
    assert.equal(stadiumGateAt(side, { ...marker, speed: 0 }, false)?.id, gate.id);
    assert.equal(stadiumGateAt(side, { ...marker, speed: STADIUM_MARKER.speed + .5 }, false), null, `${gate.id}/${side} fires at speed`);
    assert.equal(stadiumGateAt(side, { ...marker, speed: 0 }, true), null, `${gate.id}/${side} fires in a race`);
    // Arriving never lands on the marker that would send the car straight back.
    const arrival = side === "venue" ? gate.venue.arrive : gate.city.leave;
    assert.equal(stadiumGateAt(side, { ...arrival, speed: 0 }, false), null, `${gate.id}'s ${side} arrival stands on its marker`);
  }
  assert.equal(stadiumGate("east")?.id, "east");
  assert.equal(stadiumGate("south"), null);
});

test("Sable's drift runs in the venue as it did in the city: repeatable, scored, clean of the scenery", () => {
  const run = (layout: "fwd" | "rwd" | "awd") => {
    const sim = createSim(layout, createStadiumWorld(DRIFT_YARD.start), { race: SABLE_DRIFT, traffic: false, parkedRivals: [SABLE] });
    let index = 1, driftingTicks = 0;
    try {
      for (let tick = 0; !sim.state.race!.finished && tick < 5581; tick++) {
        const c = sim.state.vehicle, target = YARD_LINE[index]!;
        if (Math.hypot(c.x - target.x, c.z - target.z) < 16) index = (index + 1) % YARD_LINE.length;
        const desired = Math.atan2(c.x - target.x, c.z - target.z) - c.heading;
        const error = Math.atan2(Math.sin(desired), Math.cos(desired));
        step(sim, { throttle: c.speed < 23 ? 1 : .3, brake: c.speed > 27 ? .3 : 0,
          steer: Math.max(-1, Math.min(1, -error * 2.8 + c.yawRate * .8)),
          handbrake: Math.abs(error) > .2 && c.speed > 12 && tick % 60 < 22 ? 1 : 0 });
        if (sim.state.race!.drift!.drifting) driftingTicks++;
        assert.ok(!sim.state.race!.drift!.feedback.startsWith("CONTACT"), `${layout} struck yard scenery at ${c.x},${c.z} tick ${tick}`);
      }
      const result = { ...sim.state.race!.drift };
      assert.equal(sim.state.race!.finished, true);
      assert.ok(driftingTicks > 500); assert.ok(result.score! > 1500); assert.ok(result.clips! >= 3);
      resetSim(sim);
      assert.equal(sim.state.race!.drift!.score, 0);
      return result;
    } finally { sim.world.free(); }
  };
  assert.deepEqual(run("rwd"), run("rwd"));
  run("fwd"); run("awd");
});

test("Sable is parked in the venue's free drive and can be challenged there", () => {
  const sim = createSim("rwd", createStadiumWorld(), { parkedRivals: [SABLE] });
  try {
    step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 0 });
    assert.equal(nearbyChallenge({ ...SABLE.start, x: SABLE.start.x - 8, speed: 0 }, null, sim.state.parkedRivals, false), "sable");
  } finally { sim.world.free(); }
});

// The venue must be able to load without the city one day (design/VENUES.md): nothing it is built from may reach
// Port Alder's data, streets or traffic. Value imports only, as tests/route-choice.test.ts reads them.
test("nothing the venue is built from reaches the city", () => {
  const root = new URL("../src/sim/", import.meta.url);
  const closure = new Map<string, string>();
  const walk = (file: string, from: string) => {
    if (closure.has(file)) return;
    closure.set(file, from);
    const source = readFileSync(new URL(file, root), "utf8");
    for (const match of source.matchAll(/import\s+(type\s+)?[^;]*?from\s+"\.\/([\w.-]+\.(?:ts|json))"/g)) {
      if (!match[1] && match[2]!.endsWith(".ts")) walk(match[2]!, file);
      else if (!match[1]) closure.set(match[2]!, file);
    }
  };
  walk("stadium.ts", "the venue");
  for (const file of closure.keys()) {
    assert.ok(!/^alder|^traffic|^street-|^lanes|^district/.test(file), `the venue reaches ${file} (through ${closure.get(file)})`);
  }
  assert.ok(closure.has("stadium-shell.ts") && closure.has("drift-yard.ts"), "the import scan found nothing to follow");
});

// What a car drives on and into here, named. A change to the shell, the pad or the yard's solids changes
// this; bump STADIUM.revision in the same commit and repin, so anything that names the venue refuses the old one.
test("the venue's identity is pinned", () => {
  assert.equal(STADIUM_VERSION, "stadium-v3-84732353");
});

test("the continuous stadium GLB and collision contain exactly the same triangles", async () => {
  const doc = await new NodeIO().read("public/assets/wharf-arena/closed-shell.glb");
  const key = (vertices: number[][]) => vertices.map(v => v.map(n => n.toFixed(3)).join(",")).sort().join(";");
  const physics = new Map<string, number>(), visual = new Map<string, number>();
  const add = (map: Map<string, number>, k: string) => map.set(k, (map.get(k) ?? 0) + 1);
  const { vertices, indices } = STADIUM_SHELL_MESH;
  for (let i = 0; i < indices.length; i += 3)
    add(physics, key(indices.slice(i, i + 3).map(v => Array.from(new Float32Array(vertices.slice(v * 3, v * 3 + 3))))));
  for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const p = primitive.getAttribute("POSITION")!, index = primitive.getIndices()!;
    for (let i = 0; i < index.getCount(); i += 3)
      add(visual, key([0, 1, 2].map(j => p.getElement(index.getScalar(i + j), []))));
  }
  assert.deepEqual(visual, physics);
  assert.ok(indices.length / 3 < 5000, "shell exceeds its triangle budget");
  assert.equal(doc.getRoot().listMeshes().length, 3, "no entrance caps or blocking slabs");
});


test("retained yard props do not clip the restored stadium shell", () => {
  const { vertices, indices } = STADIUM_SHELL_MESH;
  for (const s of YARD_STRUCTURES) {
    const box = new THREE.Box3(new THREE.Vector3(s.x - s.width / 2, s.base, s.z - s.depth / 2),
      new THREE.Vector3(s.x + s.width / 2, s.base + s.height, s.z + s.depth / 2));
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = indices.slice(i, i + 3).map(v => new THREE.Vector3().fromArray(vertices, v * 3));
      assert.ok(!box.intersectsTriangle(new THREE.Triangle(a!, b!, c!)), `${s.id} clips shell triangle ${i / 3}`);
    }
  }
});


test("the stadium floor follows one closed wall loop and covers the restored gate curves", () => {
  assert.deepEqual(STADIUM_FLOOR[0], STADIUM_FLOOR.at(-1));
  // Midpoints of the former cut mouths sit in the wall, outside the driving floor.
  // The floor must not bridge to the separate structural-feature loop.
  assert.equal(inStadium(-560, 850), false);
  assert.equal(inStadium(-560, 880), true);
  assert.equal(inStadium(-100, 938), false);
  assert.equal(inStadium(-140, 970), true);
  assert.equal(createStadiumWorld().meshes!.length, 1);
});

// The way out is drawn, not built: a roller door on the wall where each city gate was. Drawing only, so it must lie
// on the wall's face (the car meets the shell, and a door standing off it would be a thing it drives into and through)
// and on the floor's side of it, and face the gate's own marker.
test("each gate's roller door lies on the wall where the city gate was, facing its marker", () => {
  const wallDistance = (x: number, z: number) => {
    let best = Infinity;
    for (let i = 1; i < STADIUM_FLOOR.length; i++) {
      const a = STADIUM_FLOOR[i - 1]!, b = STADIUM_FLOOR[i]!, dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(a.x + dx * t - x, a.z + dz * t - z));
    }
    return best;
  };
  for (const night of [true, false]) {
    const scene = new THREE.Scene();
    addStadiumDoors(scene, night);
    for (const gate of STADIUM_GATES) {
      let sumX = 0, sumZ = 0, count = 0;
      for (const part of ["door", "door-ribs", "door-frame"]) {
        const mesh = scene.getObjectByName(`stadium-${part}-${gate.id}`) as THREE.Mesh | undefined;
        assert.ok(mesh, `no ${part} at the ${gate.id} gate`);
        const position = mesh.geometry.getAttribute("position");
        for (let i = 0; i < position.count; i++) {
          const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
          assert.ok(inStadium(x, z), `${gate.id} ${part} is behind the wall at ${x.toFixed(1)}, ${z.toFixed(1)}`);
          assert.ok(wallDistance(x, z) <= .35, `${gate.id} ${part} stands ${wallDistance(x, z).toFixed(2)} m off the wall`);
          assert.ok(y >= STADIUM.base && y < 6.95, `${gate.id} ${part} reaches ${y.toFixed(2)} m, past the barrier's top`);
          if (part === "door") { sumX += x; sumZ += z; count++; }
        }
      }
      const marker = gate.venue.marker;
      assert.ok(Math.hypot(sumX / count - marker.x, sumZ / count - marker.z) < 15, `the ${gate.id} door is not the one its marker faces`);
      assert.equal(scene.getObjectByName(`stadium-door-light-${gate.id}`) !== undefined, night, `${gate.id}'s door light at night: ${night}`);
    }
  }
});
