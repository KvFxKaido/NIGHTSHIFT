import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { ARENA, ARENA_ACCESS, ARENA_CORNERS, ARENA_LAYOUT_IDS, ARENA_LAYOUTS, arenaLap, type ArenaLayoutId } from "../src/sim/arena.ts";
import { arenaEvent, arenaLayoutForRace, arenaRaceId, ARENA_LAPS } from "../src/sim/arena-events.ts";
import { ALDER_DRIVE_BOUNDS, ALDER_EVERGREENS, ALDER_STREETS, ARENA_ROADS, ALDER_PAVEMENT, alderGround, alderHeight, createAlderWorld } from "../src/sim/alder.ts";
import { projectOntoPathUnindexed } from "../src/sim/street-path.ts";
import { createRace } from "../src/sim/race.ts";
import { sampleRivalPath, withExits } from "../src/sim/rival.ts";
import { createSim, step, TICK_HZ } from "../src/sim/sim.ts";
import { addArena, ARENA_KERB_RADIUS } from "../src/render/arena.ts";
await RAPIER.init();

const paved = ARENA.width / 2 + ARENA.shoulder;
const distanceTo = (points: readonly { x: number; z: number }[], x: number, z: number) =>
  projectOntoPathUnindexed(points.map(p => ({ ...p, y: 0, width: 0, zone: "boulevard" as const })), x, z).distance;
const closedLap = (id: ArenaLayoutId) => { const lap = arenaLap(id); return [...lap.points, lap.points[0]!]; };

// The lap is the fixture a recorded lap is measured against. Moving a corner
// makes every lap recorded before it incomparable, so these numbers change
// only on purpose, with the recordings in mind.
test("each layout closes, keeps its length and runs its corners in order", () => {
  const expected: Record<ArenaLayoutId, { length: number; gates: number }> = {
    full: { length: 2529.0, gates: 7 }, east: { length: 1907.4, gates: 5 }, ridge: { length: 1611.7, gates: 5 },
  };
  for (const id of ARENA_LAYOUT_IDS) {
    const lap = arenaLap(id), points = closedLap(id);
    assert.ok(Math.abs(lap.length - expected[id].length) < 0.1, `${id} is ${lap.length.toFixed(1)} m`);
    let sum = 0;
    for (let i = 1; i < points.length; i++) {
      const step = Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
      // Straights are sampled every 5 m; a sample within half a metre of a gate gives way to it.
      assert.ok(step > 0.4 && step <= 5.5 + 1e-9, `${id}: a ${step.toFixed(2)} m step at sample ${i}`);
      sum += step;
    }
    // Chords of the arcs fall short of the arcs by millimetres, not metres.
    assert.ok(Math.abs(sum - lap.length) < 0.5, `${id}: samples add to ${sum.toFixed(2)} of ${lap.length.toFixed(2)} m`);
    assert.equal(lap.gates.length, expected[id].gates);
    assert.deepEqual(lap.gates.map(g => g.along), [...lap.gates.map(g => g.along)].sort((a, b) => a - b));
    assert.equal(lap.gates.at(-1)!.along, lap.length);
    for (const gate of lap.gates) assert.ok(lap.points.some(p => p.x === gate.x && p.z === gate.z), `${id}: ${gate.name} is not a sample`);
    // Every rounded corner turns the way the polygon does, by less than a hairpin's half.
    for (const corner of lap.corners) {
      assert.ok(corner.to > corner.from && Math.abs(corner.turn) < Math.PI / 2 + 1e-9, `${id}: ${corner.id}`);
    }
    // A layout never runs over itself away from where it is: 2x the paved width apart at least.
    for (let i = 0; i < lap.points.length; i += 2) {
      for (let j = i + 2; j < lap.points.length; j += 2) {
        const gap = Math.min(lap.along[j]! - lap.along[i]!, lap.length - (lap.along[j]! - lap.along[i]!));
        if (gap < 120) continue;
        const d = Math.hypot(lap.points[i]!.x - lap.points[j]!.x, lap.points[i]!.z - lap.points[j]!.z);
        assert.ok(d > paved * 2 + 10, `${id}: ${lap.along[i]!.toFixed(0)} m and ${lap.along[j]!.toFixed(0)} m are ${d.toFixed(1)} m apart`);
      }
    }
  }
  // Net turn of a closed lap is one full revolution, anticlockwise from above.
  for (const id of ARENA_LAYOUT_IDS) {
    const turn = arenaLap(id).corners.reduce((sum, c) => sum + c.turn, 0);
    assert.ok(Math.abs(turn + Math.PI * 2) < 1e-6, `${id} turns ${(turn * 180 / Math.PI).toFixed(1)} degrees`);
  }
});

test("a corner two layouts share is the same asphalt in both", () => {
  const full = closedLap("full"), east = arenaLap("east"), ridge = arenaLap("ridge");
  // East runs Full's opening to the esses; Ridge runs Full's climb to the Drop.
  for (const p of east.points.filter((_, i) => east.along[i]! < 850)) assert.ok(distanceTo(full, p.x, p.z) < 1e-6);
  const climb = ridge.corners.find(c => c.id === "t5")!.from - 60, drop = ridge.corners.find(c => c.id === "kink")!.from;
  for (const p of ridge.points.filter((_, i) => ridge.along[i]! > climb && ridge.along[i]! < drop)) assert.ok(distanceTo(full, p.x, p.z) < 1e-6);
  // The link road and its two junctions are the only things the shorter layouts add. Near the
  // south junction Full bends gently (radius 250) where the others turn, so they part by a metre there.
  for (const lap of [east, ridge]) {
    for (const p of lap.points) {
      if (distanceTo(full, p.x, p.z) < 0.5) continue;
      const nearJunction = [ARENA_CORNERS["north-junction"], ARENA_CORNERS["south-junction"]].some(c => Math.hypot(p.x - c.x, p.z - c.z) < 25);
      const onLink = Math.abs(p.x - ARENA_CORNERS["north-junction"].x) < 1e-6 && p.z > -1300 && p.z < -790;
      assert.ok(nearJunction || onLink, `${lap.layout.id}: (${p.x.toFixed(0)}, ${p.z.toFixed(0)}) is off both the loop and the link`);
    }
  }
});

test("the site is clear: no building, tree or street stands on the circuit", () => {
  const world = createAlderWorld();
  for (const road of ARENA_ROADS) {
    const half = road.points[0]!.width / 2 + ARENA.shoulder;
    for (const solid of world.solids ?? []) {
      const reach = Math.hypot(solid.width, solid.depth) / 2;
      if (Math.abs(solid.x - road.points[0]!.x) > 1500 || Math.abs(solid.z - road.points[0]!.z) > 1500) continue;
      assert.ok(distanceTo(road.points, solid.x, solid.z) > half + reach + 1, `${road.id}: a solid at (${solid.x.toFixed(0)}, ${solid.z.toFixed(0)})`);
    }
    for (const tree of ALDER_EVERGREENS) {
      assert.ok(distanceTo(road.points, tree.trunk.x, tree.trunk.z) >= road.points[0]!.width / 2 + tree.radius + 5 - 1e-6, `${road.id}: canopy of ${tree.id}`);
    }
  }
  // Streets keep their pavement clear of the circuit; the access road alone meets them, where Pine East meets Ridge Scenic Way.
  for (const street of ALDER_STREETS) {
    for (const point of street.points) {
      for (const road of ARENA_ROADS) {
        const clear = point.width / 2 + ALDER_PAVEMENT + road.points[0]!.width / 2 + ARENA.shoulder;
        const d = distanceTo(road.points, point.x, point.z);
        if (d >= clear) continue;
        assert.ok(road.id === "arena-access" && ["Ridge Scenic Way", "Pine East"].includes(street.name) && Math.hypot(point.x - ARENA_ACCESS.from.x, point.z - ARENA_ACCESS.from.z) < 40,
          `${street.name} comes within ${d.toFixed(1)} m of ${road.id}`);
      }
    }
  }
  const [minX, minZ, maxX, maxZ] = ALDER_DRIVE_BOUNDS;
  for (const road of ARENA_ROADS) for (const p of road.points) assert.ok(p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ);
});

test("the circuit is paved to its shoulder and ground past it, and it grades along the track", () => {
  const world = createAlderWorld();
  for (const id of ARENA_LAYOUT_IDS) {
    const lap = arenaLap(id), points = closedLap(id);
    for (let i = 0; i < lap.points.length; i += 3) {
      const a = points[i]!, b = points[i + 1]!, l = Math.hypot(b.x - a.x, b.z - a.z);
      const ux = (b.x - a.x) / l, uz = (b.z - a.z) / l;
      for (const side of [-1, 1]) {
        const at = (offset: number) => ({ x: a.x - uz * offset * side, z: a.z + ux * offset * side });
        for (const offset of [0, ARENA.width / 2, paved - 0.05]) {
          const p = at(offset);
          assert.equal(alderGround(p.x, p.z), false, `${id} ${lap.along[i]!.toFixed(0)} m: ${offset} m out is ground`);
        }
        // Past the shoulder is ground unless another of the circuit's paths is there.
        const out = at(paved + 0.3);
        const elsewhere = ARENA_ROADS.some(road => distanceTo(road.points, out.x, out.z) <= road.points[0]!.width / 2 + ARENA.shoulder);
        if (!elsewhere) assert.equal(alderGround(out.x, out.z), true, `${id} ${lap.along[i]!.toFixed(0)} m: past the shoulder is paved`);
      }
      // The world projects onto the circuit here, so a slope pulls along the track, not along the nearest street.
      const road = world.project(a.x, a.z);
      assert.ok(Math.abs(road.ux * ux + road.uz * uz) > 0.95, `${id} ${lap.along[i]!.toFixed(0)} m: projected across the track`);
      const grade = (alderHeight(a.x + ux, a.z + uz) - alderHeight(a.x - ux, a.z - uz)) / 2;
      assert.ok(Math.abs(Math.tan(road.pitch) * Math.sign(road.ux * ux + road.uz * uz) - grade) < 0.01, `${id}: pitch disagrees with the ground`);
    }
  }
  // The ridge half climbs: the Drop falls away by more than ten metres.
  const full = arenaLap("full"), drop = full.corners.find(c => c.id === "drop")!;
  const at = (s: number) => { const i = full.along.findIndex(a => a >= s); return full.points[i]!; };
  assert.ok(alderHeight(at(drop.from).x, at(drop.from).z) - alderHeight(at(drop.to + 150).x, at(drop.to + 150).z) > 10);
});

test("each layout is a lapped race whose rival line passes through every gate", () => {
  for (const id of ARENA_LAYOUT_IDS) {
    const event = arenaEvent(id);
    assert.equal(arenaLayoutForRace(event.race.id), id);
    assert.equal(event.race.id, arenaRaceId(id));
    assert.equal(event.race.laps, ARENA_LAPS);
    assert.equal(event.race.checkpoints.length, ARENA_LAPS * arenaLap(id).gates.length);
    createRace(event.race);
    const race = withExits(event.race, event.rival);
    assert.equal(race.checkpoints.filter(g => !g.exit).length, 1, "only the finish has no arrow");
    const { along, gates, points } = event.rival;
    for (let i = 1; i < along.length; i++) assert.ok(along[i]! > along[i - 1]!, `${id}: the line doubles back at ${i}`);
    for (let i = 1; i < points.length; i++) {
      assert.ok(Math.abs(Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z) - (along[i]! - along[i - 1]!)) < 1e-6);
    }
    gates.forEach((distance, i) => {
      const at = sampleRivalPath(event.rival, distance), gate = event.race.checkpoints[i]!;
      assert.ok(Math.hypot(at.x - gate.x, at.z - gate.z) < 1e-6, `${id}: gate ${i} (${gate.name}) is off the line`);
    });
    assert.ok(along.at(-1)! - gates.at(-1)! >= 145, "no run-off past the flag");
    // Both grid slots are on the asphalt, side by side, behind the line and facing along the track.
    const line = arenaLap(id).points[0]!;
    for (const slot of [event.start, event.rival.start]) {
      assert.equal(alderGround(slot.x, slot.z), false);
      assert.ok(Math.hypot(slot.x - line.x, slot.z - line.z) < 14);
      assert.ok(Math.abs(slot.y - alderHeight(slot.x, slot.z)) < 1e-9);
    }
    assert.ok(Math.hypot(event.start.x - event.rival.start.x, event.start.z - event.rival.start.z) > 7);
  }
  assert.equal(arenaLayoutForRace("arena-nope"), null);
  assert.throws(() => arenaEvent("full", 0));
});

// Executed, not inferred: the rival drives a lap of every layout on the
// centreline, never needs a reset or a recovery, and never puts a tyre on the
// grass. The times are the centreline baseline recorded laps are to beat
// (2026-09-13: Full 100.8 s, East 78.8 s, Ridge 66.4 s from a standing start).
test("the rival laps every layout cleanly on the centreline", () => {
  const limits: Record<ArenaLayoutId, number> = { full: 106, east: 83, ridge: 70 };
  for (const id of ARENA_LAYOUT_IDS) {
    const event = arenaEvent(id, 1);
    const sim = createSim("awd", createAlderWorld(true, event.start), { race: event.race, rival: event.rival, traffic: false });
    try {
      let groundTicks = 0;
      for (let tick = 0; tick < TICK_HZ * 150 && !sim.state.rival!.race.finished; tick++) {
        step(sim, { throttle: 0, brake: 0, steer: 0, handbrake: 1 });
        if (sim.state.rival!.vehicle.groundContact > 0) groundTicks++;
      }
      const rival = sim.state.rival!;
      assert.ok(rival.race.finished, `${id}: the rival did not finish (gate ${rival.race.checkpoint})`);
      const seconds = rival.race.ticks / TICK_HZ;
      assert.ok(seconds < limits[id], `${id}: ${seconds.toFixed(1)} s`);
      assert.equal(rival.driver.resets, 0, `${id}: resets`);
      assert.equal(rival.driver.recoveries, 0, `${id}: recoveries`);
      assert.equal(groundTicks, 0, `${id}: on the grass for ${groundTicks} ticks`);
    } finally { sim.world.free(); }
  }
});

test("the renderer draws the circuit's surface over the ground, and kerbs only off other roads", () => {
  const scene = new THREE.Scene();
  const group = addArena(scene, true);
  for (const name of ["arena-asphalt", "arena-edge-lines", "arena-kerbs-red", "arena-kerbs-white", "arena-start-line-light", "arena-lamp-posts", "arena-lamp-pools"]) {
    assert.ok(group.getObjectByName(name), `${name} missing`);
  }
  const vertices = (name: string) => {
    const position = (group.getObjectByName(name) as THREE.Mesh).geometry.getAttribute("position");
    return Array.from({ length: position.count }, (_, i) => ({ x: position.getX(i), y: position.getY(i), z: position.getZ(i) }));
  };
  for (const v of vertices("arena-asphalt")) assert.ok(v.y > alderHeight(v.x, v.z) + 0.02 && v.y < alderHeight(v.x, v.z) + 0.1);
  // Every asphalt vertex is within the paved width of some path: what is drawn is what the tyres feel.
  for (const v of vertices("arena-asphalt").filter((_, i) => i % 7 === 0)) {
    assert.ok(ARENA_ROADS.some(road => distanceTo(road.points, v.x, v.z) <= road.points[0]!.width / 2 + ARENA.shoulder + 0.05), `asphalt drawn at (${v.x.toFixed(1)}, ${v.z.toFixed(1)})`);
  }
  for (const name of ["arena-kerbs-red", "arena-kerbs-white"]) {
    for (const v of vertices(name)) {
      const on = ARENA_ROADS.filter(road => distanceTo(road.points, v.x, v.z) < road.points[0]!.width / 2 - 1);
      assert.equal(on.length, 0, `${name} vertex on ${on[0]?.id} at (${v.x.toFixed(1)}, ${v.z.toFixed(1)})`);
      assert.equal(alderGround(v.x, v.z), false, `${name} vertex on the grass`);
    }
  }
  // Kerbs belong to tight corners only.
  const kerbed = ARENA_LAYOUT_IDS.flatMap(id => arenaLap(id).corners).filter(c => c.radius <= ARENA_KERB_RADIUS);
  assert.ok(kerbed.length > 10 && ARENA_LAYOUTS.full.corners.some(([, r]) => r > ARENA_KERB_RADIUS));
  group.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
});
