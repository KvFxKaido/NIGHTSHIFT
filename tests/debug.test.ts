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

test("layout selection does not displace garage customization or telemetry links", () => {
  assert.deepEqual(captureDeepLink("?scene=garage&drivetrain=fwd&paint=ice&telemetry=1"), [
    "drivetrain:fwd", "go:garage", 'customize:{"paint":"ice"}', "go:garage", "telemetry:true",
  ]);
});
