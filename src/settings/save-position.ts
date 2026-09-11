import type { DriveSave } from "./saves.ts";
import type { RoadWorld } from "../sim/road-world.ts";

/** A stale map or occupied pose returns to the garage, never inside new scenery. */
export function safeSavePosition(save: DriveSave, world: RoadWorld, bounds: readonly number[]) {
  const p = save.position;
  if (!p || save.world !== world.id || p.x < bounds[0]! + 4 || p.x > bounds[2]! - 4
    || p.z < bounds[1]! + 4 || p.z > bounds[3]! - 4) return null;
  for (const b of world.solids ?? []) {
    const angle = b.rotation ?? 0, c = Math.cos(angle), s = Math.sin(angle);
    const dx = p.x - b.x, dz = p.z - b.z;
    if (Math.hypot(Math.max(0, Math.abs(dx * c + dz * s) - b.width / 2),
      Math.max(0, Math.abs(-dx * s + dz * c) - b.depth / 2)) < 3) return null;
  }
  return { ...p, y: (world.surface ?? world.project)(p.x, p.z).height };
}
