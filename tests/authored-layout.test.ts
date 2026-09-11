import assert from "node:assert/strict";
import test from "node:test";
import { buildingId, layoutFingerprint, layoutHasContent, parseAuthoredLayout } from "../src/sim/building-layout.ts";
import { GENERATED_ALDER_BLOCKS, GARAGE_PLOT_ID, ALDER_VERSION, resolveAlderLayout } from "../src/sim/alder.ts";

// Authored plots are their own list, in world coordinates, with their own ids.
// The generator never touches them, so regenerating the map cannot orphan one:
// a retired plot the generator no longer produces is ignored, and a plot it
// produces under an authored one stands down.

const generated = GENERATED_ALDER_BLOCKS;
const plot = generated.find(block => buildingId(block) !== GARAGE_PLOT_ID)!;
const plotId = buildingId(plot);
/** The plot moved four metres and made taller, as an authored building of its own. */
const authored = { id: "authored-1", x: plot.x + 4, z: plot.z, width: plot.width, depth: plot.depth, height: plot.height + 6, rotation: plot.rotation };
const layout = { schema: 2, authored: [authored], retired: [plotId] };

test("an authored plot stands after the map is regenerated under it", () => {
  const before = resolveAlderLayout(layout);
  assert.deepEqual(before.issues, []);
  assert.ok(!before.blocks.includes(plot), "the retired plot still stands");
  assert.ok(before.entries.some(entry => entry.id === "authored-1" && entry.block.height === plot.height + 6));
  // Regenerate: the old plot moves 40 m and takes a new id, and a fresh plot
  // with an id of its own is generated under the authored one.
  const moved = { ...plot, x: plot.x + 40 }, fresh = { ...plot, x: plot.x + 2, height: plot.height + 1 };
  const regenerated = generated.map(block => block === plot ? moved : block).concat(fresh);
  const after = resolveAlderLayout(layout, regenerated);
  assert.deepEqual(after.issues, []);
  assert.ok(after.entries.some(entry => entry.id === "authored-1" && entry.block.height === plot.height + 6), "the authored plot was lost");
  assert.ok(after.blocks.includes(moved), "the moved plot, no longer retired by anything, should stand");
  assert.deepEqual(after.displaced, [buildingId(fresh)]);
  assert.ok(!after.blocks.includes(fresh), "the fresh plot under the authored one still stands");
  assert.equal(after.entries.filter(entry => entry.source === "generated").length, regenerated.length - 1);
  assert.equal(after.entries.filter(entry => entry.source === "authored").length, 1);
});

test("authored wins only over generated plots: the garage and other authored plots are issues, not displaced", () => {
  const garage = generated.find(block => buildingId(block) === GARAGE_PLOT_ID)!;
  const onGarage = resolveAlderLayout({ schema: 2, authored: [{ ...authored, x: garage.x, z: garage.z }], retired: [] });
  assert.ok(onGarage.issues.some(issue => /Wharf Garage/.test(issue)), onGarage.issues.join("; "));
  assert.deepEqual(onGarage.displaced, []);
  assert.ok(onGarage.blocks.includes(garage));
  const pair = resolveAlderLayout({ schema: 2, authored: [authored, { ...authored, id: "authored-2", z: authored.z + 2 }], retired: [plotId] });
  assert.equal(pair.issues.filter(issue => /another authored/.test(issue)).length, 2);
});

test("the layout's identity follows its content, and an empty one leaves the world version alone", () => {
  const none = parseAuthoredLayout({ schema: 2, authored: [], retired: [] });
  assert.equal(layoutHasContent(none), false);
  assert.equal(layoutHasContent(parseAuthoredLayout(layout)), true);
  assert.equal(layoutHasContent(parseAuthoredLayout({ schema: 2, authored: [], retired: [plotId] })), true);
  assert.notEqual(layoutFingerprint(parseAuthoredLayout(layout)), layoutFingerprint(parseAuthoredLayout({ ...layout, authored: [{ ...authored, height: authored.height + 1 }] })));
  // The parser normalises order, so the fingerprint does not depend on how a file was written.
  const shuffled = { schema: 2, retired: ["plot-9.000-9.000", plotId], authored: [{ ...authored, id: "authored-2" }, authored] };
  const ordered = { schema: 2, retired: [plotId, "plot-9.000-9.000"], authored: [authored, { ...authored, id: "authored-2" }] };
  assert.equal(layoutFingerprint(parseAuthoredLayout(shuffled)), layoutFingerprint(parseAuthoredLayout(ordered)));
  assert.ok(!ALDER_VERSION.includes("-layout-"), `the checked-in layout is empty, but the world is ${ALDER_VERSION}`);
});
