import assert from "node:assert/strict";
import test from "node:test";
import { CAR_DRIVETRAIN, drivetrainFor, isPlayerCarId } from "../src/customization/cars.ts";
import { BLENDER_CARS } from "../src/render/blender-car.ts";
import { carHandling, DEFAULT_DRIVETRAIN, handlingFor, isDrivetrain } from "../src/sim/sim.ts";
import { defaultSettings } from "../src/settings/settings.ts";
import { RIVET_DRAG_DRIVER } from "../src/sim/drag-event.ts";
import { ALDER_RIVAL } from "../src/sim/alder-rival.ts";
import { ALDER_CRUISE } from "../src/sim/encounter.ts";
import { alderGeneratedRace } from "../src/sim/alder.ts";
import type { RivalDefinition } from "../src/sim/rival.ts";
import { BLACKLIST } from "../src/settings/blacklist.ts";

// The drivetrain stopped being a garage toggle and became a property of the
// body. These pin the parts of that which are easy to get silently wrong.

test("every authored body declares a drivetrain, and each one is real", () => {
  for (const id of Object.keys(BLENDER_CARS)) {
    const layout = CAR_DRIVETRAIN[id];
    assert.ok(layout !== undefined, `${id} has no drivetrain; a new body must choose one`);
    assert.ok(isDrivetrain(layout), `${id} declares ${layout}, which is not a drivetrain`);
    assert.equal(drivetrainFor(id), layout);
  }
});

// drivetrainFor cannot import DEFAULT_DRIVETRAIN as a value without dragging
// sim.ts, and therefore Rapier, into every module that reads a car id. So the
// fallback is written out, and this is what stops the two drifting apart.
test("the fallback for an unknown body matches the simulation default", () => {
  assert.equal(drivetrainFor("classic"), DEFAULT_DRIVETRAIN);
  assert.equal(drivetrainFor("no-such-car"), DEFAULT_DRIVETRAIN);
});

// Not a restatement of the table. A RivalDefinition names its car, and main.ts
// draws the rival separately (raceOpponentCar), so a rival can still be drawn as
// one body and driven as another -- which is what Moth did until 2026-09-12,
// racing a rally hatch on front-wheel drive. A definition with no car is not a
// neutral default either: it silently drives the shared model on FWD.
test("every rival drives the body it is rendered as", () => {
  const driven: [string, string, RivalDefinition][] = [
    ["Rivet on the drag strip", "hammer", RIVET_DRAG_DRIVER],
    ["Moth on Sound to Sky", "kestrel", ALDER_RIVAL],
    ["Moth cruising the freight block", "kestrel", ALDER_CRUISE],
    ["Moth in a generated race", "kestrel", alderGeneratedRace(11).rival],
  ];
  for (const [who, car, rival] of driven) {
    assert.equal(rival.car, car, `${who} names ${rival.car ?? "no car"}, so the sim drives something other than the ${car}`);
    assert.equal(handlingFor(rival), carHandling(car), `${who} does not get the ${car}'s numbers`);
    assert.equal(handlingFor(rival).drivetrain, CAR_DRIVETRAIN[car]);
  }
});

test("a new player starts in a rear-drive car, whatever the sim defaults to", () => {
  // The garage toggle is gone, so the starting car is the only thing that
  // decides how NIGHTSHIFT drives on a first run.
  assert.equal(drivetrainFor(defaultSettings().car), "rwd");
  assert.notEqual(drivetrainFor(defaultSettings().car), DEFAULT_DRIVETRAIN,
    "the in-game default collapsed back onto the sim default; one of them moved");
  assert.equal(drivetrainFor("bulwark"), "awd", "the heavy body is no longer the planted one");
});

test("the bodies drive differently enough to be worth winning", () => {
  // A pink slip is only a reward if the car is not a reskin, so the garage pair
  // and the rival bodies must not all collapse onto one layout.
  const layouts = new Set(Object.values(CAR_DRIVETRAIN));
  assert.ok(layouts.size > 1, `every body shares one drivetrain: ${[...layouts]}`);
  // Sable slides for a living; Moth runs a rally hatch.
  assert.equal(CAR_DRIVETRAIN.blender, "rwd", "the car Sable drifts is not rear-drive");
  assert.equal(CAR_DRIVETRAIN.kestrel, "awd", "Moth's rally hatch is not all-wheel drive");
});

test("the garage roster is the Cinder, the Bulwark and every Blacklist car; the retired NS-01 id is not one", () => {
  for (const id of ["cinder", "bulwark", ...BLACKLIST.map(name => name.car)]) {
    assert.ok(isPlayerCarId(id), `${id} should be a garage choice`);
    assert.ok(CAR_DRIVETRAIN[id] !== undefined, `${id} needs a drivetrain`);
  }
  // "blender" is the NS-01's old saved id, migrated to the Cinder (RETIRED_CARS); Sable's pink slip is "ns01".
  assert.equal(isPlayerCarId("blender"), false);
  assert.equal(CAR_DRIVETRAIN.ns01, CAR_DRIVETRAIN.blender, "the won NS-01 drives as Sable's does");
});
