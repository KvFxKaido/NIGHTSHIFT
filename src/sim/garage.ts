export interface GarageSite {
  readonly name: string;
  readonly entrance: { readonly x: number; readonly y: number; readonly z: number; readonly heading: number; readonly pitch: number };
}

/** A stopped car outside the shutter may enter. Height matters: proximity in
 * plan view alone must not open a garage from another level. */
export function canEnterGarage(garage: GarageSite, vehicle: { x: number; y: number; z: number; speed: number },
  raceActive: boolean): boolean {
  return !raceActive && vehicle.speed < 1 && Math.abs(vehicle.y - garage.entrance.y) < 2 &&
    Math.hypot(vehicle.x - garage.entrance.x, vehicle.z - garage.entrance.z) <= 4;
}
