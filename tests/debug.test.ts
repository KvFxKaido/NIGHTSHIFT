import assert from "node:assert/strict";
import test from "node:test";
import { applyDeepLink } from "../src/debug/debug.ts";

function captureDeepLink(search: string): string[] {
  const calls: string[] = [];
  applyDeepLink({
    drivetrain: (layout) => { calls.push(`drivetrain:${layout}`); },
    go: (screen) => { calls.push(`go:${screen}`); return screen; },
    set: (options) => { calls.push(`customize:${JSON.stringify(options)}`); return []; },
    drive: (script) => { calls.push(`drive:${script}`); },
    freeze: (frozen = true) => { calls.push(`freeze:${frozen}`); return frozen; },
    telemetry: (visible = true) => { calls.push(`telemetry:${visible}`); },
    camera: (id = "standard") => { calls.push(`camera:${id}`); return id; },
  }, search);
  return calls;
}

test("comparison deep links choose the drivetrain before starting or recording a drive", () => {
  assert.deepEqual(captureDeepLink("?scene=track&drivetrain=rwd&drive=W120&freeze=1"), [
    "drivetrain:rwd", "go:track", "drive:W120", "freeze:true",
  ]);
  assert.deepEqual(captureDeepLink("?scene=pause&drivetrain=fwd"), ["drivetrain:fwd", "go:pause"]);
  assert.deepEqual(captureDeepLink("?scene=track"), ["go:track"], "omitting a layout keeps the default");
});

test("invalid comparison layouts fail before changing scenes or driving", () => {
  for (const layout of ["4wd", "__proto__", ""]) {
    assert.throws(() => captureDeepLink(`?scene=track&drivetrain=${layout}&drive=W120`), RangeError);
  }
});

test("a camera link previews its framing after the scene, and a bad one fails before anything moves", () => {
  assert.deepEqual(captureDeepLink("?scene=track&camera=far&drive=W120&freeze=1"), [
    "go:track", "camera:far", "drive:W120", "freeze:true",
  ]);
  for (const camera of ["closest", "__proto__", ""]) {
    assert.throws(() => captureDeepLink(`?scene=track&camera=${camera}&drive=W120`), RangeError);
  }
});

test("layout selection does not displace garage customization or telemetry links", () => {
  assert.deepEqual(captureDeepLink("?scene=garage&drivetrain=fwd&paint=ice&telemetry=1"), [
    "drivetrain:fwd", "go:garage", 'customize:{"paint":"ice"}', "go:garage", "telemetry:true",
  ]);
});

// A race link is a request for that race (2026-09-20). The press-to-start title
// arrived after `?race=<id>` was documented as a way to reach one, and left such
// a link loading the race and the car and then waiting on the menu behind them.
test("a race link goes to the track, and an explicit scene still wins", () => {
  assert.deepEqual(captureDeepLink("?race=sable-yard-drift"), ["go:track"]);
  assert.deepEqual(captureDeepLink("?race=gen-moth-7&car=ns01&unlock=1"), ["go:track"],
    "a previewed car does not change where a race link goes");
  assert.deepEqual(captureDeepLink("?scene=main&race=sable-yard-drift"), ["go:main"],
    "?scene=main asked for the title");
  assert.deepEqual(captureDeepLink("?scene=garage&race=sable-yard-drift"), ["go:garage"]);
  // Without a race there is nothing to go to: a bare preview leaves the screen alone.
  assert.deepEqual(captureDeepLink("?car=ns01&unlock=1"), []);
  assert.deepEqual(captureDeepLink("?drivetrain=rwd"), ["drivetrain:rwd"]);
});
