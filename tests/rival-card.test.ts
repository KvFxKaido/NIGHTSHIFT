import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { cardCopy, rivalCard, RIVAL_CARDS } from "../src/ui/rival-card.ts";
import { RIVET } from "../src/sim/drag-event.ts";
import { SABLE } from "../src/sim/drift-yard.ts";
import { MOTH } from "../src/sim/encounter.ts";

// The card is the prompt now: no card, no visible way to accept. So every
// rival `nearbyChallenge` can name has to have one, and the name and car on it
// have to be the sim's, not a second copy that can drift away from it.
test("the roster covers every rival the challenge system can name", () => {
  for (const rival of [RIVET, SABLE, MOTH]) {
    const card = rivalCard(rival.id);
    assert.ok(card, `no contact card for ${rival.id}`);
    assert.equal(card.name, rival.name);
    assert.equal(card.car, rival.carName);
    assert.ok(card.turf.length > 0 && card.offer.length > 0, rival.id);
  }
  assert.equal(rivalCard("nobody"), null);
  assert.equal(rivalCard(null), null);
});

test("the card asks once, then reports, and never asks twice", () => {
  const moth = rivalCard(MOTH.id)!;
  const offer = cardCopy(moth, false, "F");
  assert.equal(offer.name, "Moth");
  assert.equal(offer.meta, "Kestrel · Freight block");
  // The encounter harness reads the action line to prove a remap took, so the
  // binding has to lead it.
  assert.ok(offer.action.startsWith("F · "), offer.action);

  const accepted = cardCopy(moth, true, "F");
  assert.ok(accepted.action.startsWith("Accepted"), accepted.action);
  // Telling a driver to flash again once the race is being drawn is the bug
  // this state exists to avoid.
  assert.doesNotMatch(accepted.action, /Flash headlights/);
  assert.notEqual(accepted.portrait, offer.portrait, "the face changes when they accept");
});

test("every portrait the card names is served, square, and at twice its drawn size", async () => {
  for (const card of RIVAL_CARDS) {
    for (const portrait of [card.portrait.calm, card.portrait.keen]) {
      const bytes = await readFile(new URL(`../public/${portrait}`, import.meta.url));
      assert.equal(bytes.subarray(1, 4).toString(), "PNG", portrait);
      // IHDR carries width and height as the two big-endian uint32s after the
      // signature and chunk header. The card draws 96 px; the file is 192 so
      // the facets stay hard on a dense screen.
      assert.equal(bytes.readUInt32BE(16), 192, `${portrait} width`);
      assert.equal(bytes.readUInt32BE(20), 192, `${portrait} height`);
    }
  }
});

test("the page carries the card's hooks, and the card can still hide", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const hook of ["data-card-portrait", "data-card-name", "data-card-meta", "data-card-action"]) {
    assert.ok(html.includes(hook), `index.html is missing [${hook}]`);
  }
  // The same trap as #race: the card is display:grid, and an author display
  // beats the [hidden] attribute's display:none. Without a rule that names the
  // hidden card, a rival's face sits on screen through the whole free roam.
  const css = await readFile(new URL("../src/ui/menu.css", import.meta.url), "utf8");
  assert.match(css, /#rival-challenge\[hidden\][^{]*\{[^}]*display:\s*none/);
});
