/**
 * Replay a lap recording and check it reproduces: rebuild the race from the
 * session's identity, feed the input log tick by tick, record again, and
 * compare every completed lap's telemetry. A file that does not reproduce was
 * recorded by another build, or was not recorded from an unbroken run. Rapier
 * must be initialised first, as for any `createSim`.
 */
import { ALDER_VERSION, createAlderWorld } from "./alder.ts";
import { GENERATED_LAYOUT, recordedEvent, type RecordedEvent } from "./recorded-event.ts";
import { rivalDifference } from "./rival-revision.ts";
import { TRAFFIC_REVISION } from "./traffic.ts";
import { createLapRecorder, recordTick, LAP_RECORDING_FORMAT, type LapSession } from "./lap-recorder.ts";
import { carHandling, createSim, isDrivetrain, step, PHYSICS_VERSION, TICK_HZ } from "./sim.ts";

export type ReplayResult =
  | { ok: true; laps: number }
  | { ok: false; reason: string };

export function replayLapSession(session: LapSession): ReplayResult {
  if (session.format !== LAP_RECORDING_FORMAT) return { ok: false, reason: `format ${session.format}, expected ${LAP_RECORDING_FORMAT}` };
  // A recording from another world or physics revision cannot be expected to match, so it is refused, not compared.
  if (session.world !== ALDER_VERSION) return { ok: false, reason: `recorded on world ${session.world}, this build is ${ALDER_VERSION}` };
  // A circuit, or a generated race drawn again from its id and its flash (recorded-event.ts).
  let event: RecordedEvent | null;
  try { event = recordedEvent(session.race, session.laps, { start: session.startCode ?? null, solo: session.solo }); }
  catch (error) { return { ok: false, reason: `${session.race} cannot be drawn: ${error instanceof Error ? error.message : String(error)}` }; }
  if (!event) return { ok: false, reason: `unknown race ${session.race}` };
  if (session.arena !== event.identity) return { ok: false, reason: `recorded on ${event.layout === GENERATED_LAYOUT ? "generator" : "circuit"} ${session.arena ?? "ridge-circuit-v1"}, this build is ${event.identity}` };
  if (session.physics !== PHYSICS_VERSION) return { ok: false, reason: `recorded on physics ${session.physics}, this build is ${PHYSICS_VERSION}` };
  if (session.tickHz !== TICK_HZ) return { ok: false, reason: `recorded at ${session.tickHz} Hz` };
  // The rival it raced, by what that rival is made of (rival-revision.ts): only what this race uses can refuse it.
  const another = event.rival ? rivalDifference(session.rival, event.rival) : null;
  if (another) return { ok: false, reason: another };
  if (event.traffic && session.trafficRevision !== TRAFFIC_REVISION) return { ok: false, reason: `recorded in traffic ${session.trafficRevision ?? "from before traffic revisions"}, this build's is ${TRAFFIC_REVISION}` };
  if (!isDrivetrain(session.drivetrain)) return { ok: false, reason: `unknown drivetrain ${session.drivetrain}` };
  // The car it was driven in, on the layout it was driven on (a developer comparison may differ from the car's own).
  const handling = carHandling(session.car, session.drivetrain);
  if ((session.carRevision ?? 1) !== handling.revision) return { ok: false, reason: `driven in the ${session.car} at handling revision ${session.carRevision ?? 1}, this build's is ${handling.revision}` };
  // Traffic is part of the world and replays with it, by its revision.
  const sim = createSim(handling, createAlderWorld(true, event.start),
    { race: event.race, rival: event.rival ?? undefined, traffic: event.traffic, pedalAssist: session.pedalAssist ?? 1 });
  try {
    const recorder = createLapRecorder(event.track);
    const { throttle, brake, steer, handbrake } = session.inputs;
    for (let i = 0; i < throttle.length; i++) {
      const input = { throttle: throttle[i]!, brake: brake[i]!, steer: steer[i]!, handbrake: handbrake[i]! };
      step(sim, input);
      const lap = recordTick(recorder, input, sim.state.vehicle, sim.state.race, TICK_HZ);
      if (!lap) continue;
      const recorded = session.recorded[lap.lap - 1];
      if (!recorded) return { ok: false, reason: `the replay completed lap ${lap.lap}, which the file does not have` };
      if (JSON.stringify(recorded) !== JSON.stringify(lap)) {
        const channel = Object.keys(lap.samples).find(key => JSON.stringify(recorded.samples[key as keyof typeof lap.samples]) !== JSON.stringify(lap.samples[key as keyof typeof lap.samples]));
        return { ok: false, reason: `lap ${lap.lap} differs${channel ? ` first in ${channel}` : " in its summary"}` };
      }
    }
    if (recorder.laps.length !== session.recorded.length) return { ok: false, reason: `the file has ${session.recorded.length} laps, the replay ${recorder.laps.length}` };
    return { ok: true, laps: recorder.laps.length };
  } finally { sim.world.free(); }
}
