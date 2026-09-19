import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import RAPIER from "@dimforge/rapier3d-compat";
import { PLAYER_CAR_IDS } from "../src/customization/cars.ts";
import { CAR_TUNES } from "../src/sim/car-handling.ts";
import { measureCar } from "../src/sim/car-card.ts";
import { carHandling } from "../src/sim/sim.ts";

await RAPIER.init();
test("garage cards match every car's revision and measured drive exactly", () => {
  const measured = Object.fromEntries(PLAYER_CAR_IDS.map(id => [id, {
    revision: CAR_TUNES[id]!.revision,
    card: measureCar(carHandling(id)),
  }]));
  const committed = JSON.parse(readFileSync(new URL("../src/customization/car-stats.json", import.meta.url), "utf8"));
  assert.deepStrictEqual(committed, measured, "car-stats.json is stale: run pnpm cars:stats");
});
