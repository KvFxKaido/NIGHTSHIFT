/**
 * Replay a lap recording and check it reproduces: rebuild the race from the
 * session's identity, feed the input log tick by tick, record again, and
 * compare every completed lap's telemetry. A file that does not reproduce was
 * recorded by another build, or was not recorded from an unbroken run. Rapier
 * must be initialised first, as for any `createSim`.
 */
import { ALDER_VERSION, createAlderWorld } from "./alder.ts";
import { arenaEvent, arenaRaceFor } from "./arena-events.ts";
import { createLapRecorder, recordTick, LAP_RECORDING_FORMAT, type LapSession } from "./lap-recorder.ts";
import { createSim, step, PHYSICS_VERSION, TICK_HZ, type Drivetrain } from "./sim.ts";

export type ReplayResult =
  | { ok: true; laps: number }
  | { ok: false; reason: string };

export function replayLapSession(session: LapSession): ReplayResult {
  if (session.format !== LAP_RECORDING_FORMAT) return { ok: false, reason: `format ${session.format}, expected ${LAP_RECORDING_FORMAT}` };
  // A recording from another world or physics revision cannot be expected to match, so it is refused, not compared.
  if (session.world !== ALDER_VERSION) return { ok: false, reason: `recorded on world ${session.world}, this build is ${ALDER_VERSION}` };
  if (session.physics !== PHYSICS_VERSION) return { ok: false, reason: `recorded on physics ${session.physics}, this build is ${PHYSICS_VERSION}` };
  if (session.tickHz !== TICK_HZ) return { ok: false, reason: `recorded at ${session.tickHz} Hz` };
  const arena = arenaRaceFor(session.race);
  if (!arena) return { ok: false, reason: `unknown race ${session.race}` };
  const event = arenaEvent(arena.layout, session.laps, arena.solo);
  const sim = createSim(session.drivetrain as Drivetrain, createAlderWorld(true, event.start),
    { race: event.race, rival: event.rival ?? undefined, traffic: false });
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
