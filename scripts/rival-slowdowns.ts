// Slowdowns (2026-09-25): the stretches where the race rival wants less than its own corner plan allows, for a reason
// that is not a corner, grouped into episodes and named by the rule that held it (`RivalSpeedWhy`, filled by
// `rivalInput`). Shawn's report after racing it: "really good, with a few random slowdowns in random places". A
// slowdown the player cannot see a reason for is one of these; this names the reason.
//
// An episode is one traffic car (or one rule with no car) holding the target more than `HELD` below the plan, joined
// across flickers shorter than `JOIN`. What it cost is the time the car spends behind its plan, (1 - speed / plan) per
// tick, while it is held and for up to `RECOVER` after while it gets back. Read by street-line-batch.ts `--census` and
// summarised by rival-census.ts.
import { sampleDrivingPath, type RivalDefinition } from "../src/sim/rival.ts";
import { TICK_HZ, type Sim } from "../src/sim/sim.ts";

const HELD = 2, JOIN = 15, RECOVER = 3 * TICK_HZ, KEEP = 0.05;
const mph = (v: number) => +(v * 2.237).toFixed(0);

export interface Slowdown {
  /** The rule that held it on most of the episode's ticks (`RivalSpeedWhy.by`), and every rule that did. */
  rule: string; rules: Record<string, number>;
  /** The traffic car, where one held it: its id, kind, and where it was from the rival when the episode began (metres
   *  along the road and across it, in the road's frame at the rival). */
  id?: number; kind?: string; ahead?: number; across?: number;
  /** Which way that car was going against the rival's road at the start (`standing` under 1 m/s), and how fast (mph). */
  going?: "same" | "oncoming" | "across" | "standing"; its?: number;
  /** Metres the rival was across the road from where it meant to be (`driver.avoidance`) when it began, in the road's frame. */
  off: number;
  t: number; along: number; seconds: number; lost: number;
  /** mph: the rival's speed and plan when it began, the lowest it was asked for, the lowest it went. */
  speed: number; plan: number; asked: number; lowest: number;
  inPass: boolean;
}

export function slowdownTracker(route: RivalDefinition) {
  const found: Slowdown[] = [];
  let open: (Slowdown & { key: string; last: number }) | null = null, tail: Slowdown | null = null, tailTicks = 0;
  const close = () => { if (open) { const { key: _key, last: _last, ...done } = open; tail = done; tailTicks = 0; found.push(done); open = null; } };
  return {
    tick(sim: Sim) {
      const r = sim.state.rival!, car = r.vehicle, d = r.driver, why = sim.rivalWhy, tick = r.race.ticks;
      if (r.race.countdown > 0 || r.race.finished) return;
      const plan = Math.max(1, why.plan), behind = Math.max(0, 1 - car.speed / plan) / TICK_HZ;
      const held = why.by !== "corner" && why.by !== "top" && why.by !== "none" && why.plan - why.target > HELD;
      const key = held ? (why.id !== undefined ? `car${why.id}` : why.by) : "";
      if (held && open && key !== open.key) close();
      if (open && !held && tick - open.last > JOIN) close();
      if (held && !open) {
        const here = sampleDrivingPath(route, d.along), v = why.id === undefined ? undefined : sim.state.traffic?.vehicles.find(c => c.id === why.id);
        open = { key, last: tick, rule: why.by, rules: {}, t: +(tick / TICK_HZ).toFixed(1), along: Math.round(d.along), seconds: 0, lost: 0,
          speed: mph(car.speed), plan: mph(why.plan), asked: mph(why.target), lowest: mph(car.speed), inPass: !!d.trafficPass,
          off: +((car.x - here.x) * -here.uz + (car.z - here.z) * here.ux - d.avoidance).toFixed(1),
          ...(v ? { id: v.id, kind: v.kind, ahead: +((v.x - car.x) * here.ux + (v.z - car.z) * here.uz).toFixed(1),
            across: +((v.x - car.x) * -here.uz + (v.z - car.z) * here.ux).toFixed(1), its: mph(v.speed),
            going: v.speed < 1 ? "standing" as const : (() => { const along = -Math.sin(v.heading) * here.ux - Math.cos(v.heading) * here.uz; return along > .7 ? "same" as const : along < -.7 ? "oncoming" as const : "across" as const; })() } : {}) };
        tail = null;
      }
      if (open) {
        open.lost += behind; open.lowest = Math.min(open.lowest, mph(car.speed));
        if (held) {
          open.last = tick; open.rules[why.by] = (open.rules[why.by] ?? 0) + 1;
          open.asked = Math.min(open.asked, mph(why.target));
          open.seconds = +((tick - Math.round(open.t * TICK_HZ)) / TICK_HZ).toFixed(2);
        }
      } else if (tail && tailTicks < RECOVER && car.speed < why.plan - HELD) { tail.lost += behind; tailTicks++; }
      else tail = null;
    },
    /** The episodes that cost at least `KEEP` seconds, each named by its commonest rule. */
    done(): Slowdown[] {
      close();
      return found.filter(s => s.lost >= KEEP).map(s => {
        const rule = Object.entries(s.rules).sort((a, b) => b[1] - a[1])[0]?.[0] ?? s.rule;
        return { ...s, rule, lost: +s.lost.toFixed(2) };
      });
    },
  };
}
