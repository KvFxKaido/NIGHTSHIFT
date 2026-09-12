import assert from "node:assert/strict";
import test from "node:test";
import { CAR_DRIVETRAIN, drivetrainFor, isPlayerCarId } from "../src/customization/cars.ts";
import { BLENDER_CARS } from "../src/render/blender-car.ts";
import { DEFAULT_DRIVETRAIN, isDrivetrain } from "../src/sim/sim.ts";
import { defaultSettings } from "../src/settings/settings.ts";
import { RIVET_DRAG_DRIVER } from "../src/sim/drag-event.ts";

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

// Not a restatement of the table: drag-event.ts declared the Hammer rear-drive
// long before the table existed, so this checks the two agree.
test("the Hammer's profile matches the drivetrain its drag rival already declared", () => {
  assert.equal(RIVET_DRAG_DRIVER.drivetrain, "rwd", "the drag rival stopped being rear-drive");
  assert.equal(CAR_DRIVETRAIN.hammer, RIVET_DRAG_DRIVER.drivetrain);
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

test("the garage roster is the player's, and the rival bodies are not", () => {
  for (const id of ["cinder", "bulwark"]) assert.ok(isPlayerCarId(id), `${id} should be a garage choice`);
  for (const id of ["blender", "kestrel", "hammer"]) {
    assert.equal(isPlayerCarId(id), false, `${id} is a rival body and must not be selectable`);
    assert.ok(CAR_DRIVETRAIN[id] !== undefined, `${id} still needs a profile even unselectable`);
  }
});
