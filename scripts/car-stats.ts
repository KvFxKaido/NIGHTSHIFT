// Commit the real sim's cards for the garage; never run these drives on a phone.
import { writeFileSync } from "node:fs";
import RAPIER from "@dimforge/rapier3d-compat";
import { PLAYER_CAR_IDS } from "../src/customization/cars.ts";
import { CAR_TUNES } from "../src/sim/car-handling.ts";
import { measureCar } from "../src/sim/car-card.ts";
import { carHandling } from "../src/sim/sim.ts";

await RAPIER.init();
const stats = Object.fromEntries(PLAYER_CAR_IDS.map(id => [id, {
  revision: CAR_TUNES[id]!.revision,
  card: measureCar(carHandling(id)),
}]));
writeFileSync(new URL("../src/customization/car-stats.json", import.meta.url), JSON.stringify(stats, null, 2) + "\n");
console.log(`Wrote ${PLAYER_CAR_IDS.length} measured garage cards.`);
