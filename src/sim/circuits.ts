/**
 * The lapped circuits whose laps are recorded: Ridge Circuit's layouts and the
 * street circuit. One place that turns a race id into its event, for the game,
 * the replay check and the tools.
 */
import { arenaEvent, arenaRaceFor, ARENA_LAPS, type ArenaEvent } from "./arena-events.ts";
import { streetCircuitEvent, streetCircuitRaceFor, STREET_CIRCUIT_LAPS, type StreetCircuitEvent } from "./street-circuit.ts";

export type CircuitEvent = ArenaEvent | StreetCircuitEvent;

export function isCircuitRace(raceId: string): boolean {
  return !!arenaRaceFor(raceId) || !!streetCircuitRaceFor(raceId);
}

/** The event a circuit race id names, with its default laps unless given; null for any other race. */
export function circuitEvent(raceId: string, laps?: number): CircuitEvent | null {
  const arena = arenaRaceFor(raceId);
  if (arena) return arenaEvent(arena.layout, laps ?? ARENA_LAPS, arena.solo);
  const street = streetCircuitRaceFor(raceId);
  if (street) return streetCircuitEvent(laps ?? STREET_CIRCUIT_LAPS, street.traffic, street.solo);
  return null;
}
