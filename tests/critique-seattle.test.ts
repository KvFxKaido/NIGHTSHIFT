import { SEATTLE_STREETS } from "../src/sim/seattle.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

// The critique asserts nothing about the map; this asserts the critique still
// runs and still says what it measures, so a data or module change cannot
// quietly turn the measuring stick into a stack trace.
test("the Seattle critique runs and reports legs, streets and gate candidates", () => {
  const out = execFileSync(process.execPath,
    ["--experimental-strip-types", "--no-warnings", "scripts/critique-seattle.ts", "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const report = JSON.parse(out) as {
    summary: Record<string, number | null>;
    streets: { id: string; risk: number; time: number; length: number }[];
    legs: { kind: string; detour: number | null; riskFast: number; via: string[] }[];
  };
  assert.deepEqual(report.streets.map(s=>s.id).sort(),SEATTLE_STREETS.map(s=>s.id).sort());
  assert.ok(report.streets.every(s => s.risk >= 0 && s.risk <= 1 && s.time > 0 && s.length > 0));
  assert.ok((report.summary.legs ?? 0) > 500, `only ${report.summary.legs} legs`);
  const kinds = new Set(report.legs.map(l => l.kind));
  for (const kind of ["priced", "free", "even", "twin", "none"]) assert.ok(kinds.has(kind), `no ${kind} legs`);
  for (const leg of report.legs) {
    assert.ok(leg.via.length > 0);
    if (leg.kind === "priced" || leg.kind === "free" || leg.kind === "even") {
      assert.ok(leg.detour !== null && leg.detour >= 0.04 && leg.detour <= 0.4, `${leg.kind} leg with detour ${leg.detour}`);
    }
    if (leg.kind === "twin") assert.ok(leg.detour !== null && leg.detour < 0.04);
  }
});
