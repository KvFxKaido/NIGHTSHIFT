import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { ALDER_BLOCKS, ALDER_DATA, ALDER_GARAGE } from "../src/sim/alder.ts";
import { ALDER_TURFS } from "../src/sim/alder-turf.ts";
import { ALDER_NEIGHBOURHOODS, alderNeighbourhoodAt, alderNeighbourhoodsAt } from "../src/sim/alder-neighbourhoods.ts";
import { addAlder, NEIGHBOURHOOD_DRESSING } from "../src/render/alder.ts";

// Every district rule reads a building's neighbourhood. A building in none
// silently gets the fallback, and one in two gets whichever polygon is listed
// first, so the claim is exactly one, counted rather than first-matched.
test("every Port Alder building stands in exactly one neighbourhood", () => {
  const strays: string[] = [];
  for (const block of ALDER_BLOCKS) {
    const at = alderNeighbourhoodsAt(block.x, block.z);
    if (at.length !== 1) strays.push(`${block.x.toFixed(0)},${block.z.toFixed(0)} in ${at.map(n => n.id).join("+") || "none"}`);
  }
  assert.deepEqual(strays, []);
  for (const neighbourhood of ALDER_NEIGHBOURHOODS) {
    assert.ok(ALDER_BLOCKS.some(block => alderNeighbourhoodAt(block.x, block.z) === neighbourhood),
      `${neighbourhood.name} has no buildings`);
  }
});

// The polygons were drawn to agree with the names the city already uses: its
// map labels and the places the Blacklist turfs are named for.
test("the map's labels and the rivals' turfs are where the neighbourhoods say", () => {
  const expect = (x: number, z: number, id: string, what: string) =>
    assert.equal(alderNeighbourhoodAt(x, z)?.id, id, `${what} is not in ${id}`);
  const labels: Record<string, string> = {
    "QUEEN ANNE": "queen-anne", "CAPITOL HILL": "capitol-hill", "CENTRAL DISTRICT": "central-district", "MADRONA RIDGE": "madrona-ridge",
  };
  for (const label of ALDER_DATA.neighborhoods) expect(label.x, label.z, labels[label.name]!, label.name);
  // The map board draws BELLTOWN itself (ui/alder-map.ts).
  expect(-305, -965, "belltown", "BELLTOWN");
  const turfs: Record<string, string> = {
    moth: "sodo", stray: "alder-center", rivet: "sodo", bollard: "belltown", deuce: "belltown",
    sable: "sodo", plumb: "madrona-ridge", crest: "queen-anne", wake: "capitol-hill",
  };
  for (const turf of ALDER_TURFS) expect(turf.centre.x, turf.centre.z, turfs[turf.id]!, `${turf.name}'s ${turf.place}`);
  expect(ALDER_GARAGE.building.x, ALDER_GARAGE.building.z, "sodo", "Wharf Garage");
});

// design/LOOK.md: Capitol Hill is the strip that is still open and the only
// place neon is dense; Queen Anne, the Central District and Madrona Ridge are
// asleep. Neon is told from shopfront glass by brightness: glass is tinted at
// a third, signs at full.
test("neon is dense on Capitol Hill and absent where the city is asleep", () => {
  const scene = new THREE.Scene();
  addAlder(scene, "night");
  const neon = new Map<string, number>();
  const position = new THREE.Vector3();
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.name.startsWith("district-signage:")) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry;
    const positions = geometry.getAttribute("position"), colors = geometry.getAttribute("color");
    for (let i = 0; i < positions.count; i += 3) {
      if (Math.max(colors.getX(i), colors.getY(i), colors.getZ(i)) <= 0.5) continue;
      position.fromBufferAttribute(positions, i);
      const id = alderNeighbourhoodAt(position.x, position.z)?.id ?? "none";
      neon.set(id, (neon.get(id) ?? 0) + 1);
    }
  });
  const asleep = Object.entries(NEIGHBOURHOOD_DRESSING).filter(([, dressing]) => dressing.signs === 0).map(([id]) => id);
  assert.deepEqual(asleep.sort(), ["central-district", "madrona-ridge", "queen-anne"]);
  for (const id of asleep) assert.equal(neon.get(id) ?? 0, 0, `${id} is asleep and carries neon`);
  const hill = neon.get("capitol-hill") ?? 0;
  const elsewhere = [...neon].filter(([id]) => id !== "capitol-hill").reduce((sum, [, n]) => sum + n, 0);
  assert.ok(hill > 3 * elsewhere, `Capitol Hill carries ${hill} neon triangles and the rest of the city ${elsewhere}`);
  scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
});

// design/LOOK.md, "Lit means occupied": offices light the cleaners' floors,
// the asleep hills a few rooms, SoDo's warehouses almost nothing, and the busy
// neighbourhoods keep the scattered windows. A tower of 40 m or more is offices
// wherever it stands but among SoDo's warehouses. Each building draws four wall
// panels, six vertices apiece once chunked, into the mesh of its kind.
test("each building's windows say who is in it", () => {
  const scene = new THREE.Scene();
  addAlder(scene, "night");
  const drawn = new Map<string, number>();
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.name.startsWith("district-facades")) return;
    const name = object.name.split(":")[0]!;
    drawn.set(name, (drawn.get(name) ?? 0) + object.geometry.getAttribute("position").count);
  });
  const expected = new Map<string, number>();
  for (const block of ALDER_BLOCKS.filter(b => b !== ALDER_GARAGE.building)) {
    const place = alderNeighbourhoodAt(block.x, block.z)!;
    const kind = block.height >= 40 && place.id !== "sodo" ? "office" : NEIGHBOURHOOD_DRESSING[place.id].windows ?? "scattered";
    const name = kind === "scattered" ? "district-facades" : `district-facades-${kind}`;
    expected.set(name, (expected.get(name) ?? 0) + 24);
  }
  assert.deepEqual(Object.fromEntries([...drawn].sort()), Object.fromEntries([...expected].sort()));
  assert.ok((expected.get("district-facades-office") ?? 0) > 0 && (expected.get("district-facades-freight") ?? 0) > 0);
  scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
});
