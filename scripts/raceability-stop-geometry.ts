// Read-only geometry audit of saved stopping traces.
import { readFileSync } from 'node:fs';
import { batchRace } from './batch-race.ts';
import { sampleDrivingPath } from '../src/sim/rival.ts';
import { forecastTrafficPath, TRAFFIC_KINDS } from '../src/sim/traffic.ts';
const cases = [ ['gen-53', 141, [103.5, 104.5, 105.5]], ['gen-70', 38, [97, 98, 99, 100.2]] ] as const;
for (const [id, target, times] of cases) {
  const scenario = batchRace(id, { seed: 314159, env: {} })!;
  const trace = JSON.parse(readFileSync(`artifacts/raceability-full-gate/cases/${id}-314159-swept.json`, 'utf8'));
  for (const time of times) {
    const r = trace.rows.reduce((a: any, b: any) => Math.abs(a.tick / 60 - time) < Math.abs(b.tick / 60 - time) ? a : b);
    const p = sampleDrivingPath(scenario.options.rival!, r.along);
    const intended = { x: p.x - p.uz * r.driver.avoidance, z: p.z + p.ux * r.driver.avoidance };
    const v = r.traffic.find((v: any) => v.id === target);
    const path = forecastTrafficPath(scenario.world.traffic!, v, 4, .1);
    console.log(JSON.stringify({id, time:r.tick/60, along:r.along, car:r.car, avoidance:r.driver.avoidance,
      intended, error:Math.hypot(r.car.x-intended.x,r.car.z-intended.z),
      headingError:Math.atan2(Math.sin(r.car.heading-Math.atan2(-p.ux,-p.uz)), Math.cos(r.car.heading-Math.atan2(-p.ux,-p.uz))),
      traffic:v, spec:TRAFFIC_KINDS[v.kind as keyof typeof TRAFFIC_KINDS], path}));
  }
}
