import { HANDLING, WHEEL_LAYOUT, type VehicleState } from "../sim/sim.ts";
import type { CarView } from "./car.ts";

/** The named pivot/mesh order is checked against WHEEL_LAYOUT in scene tests. */
export function updateWheelPresentation(view: Pick<CarView, "wheelPivots" | "allWheels">, car: VehicleState): void {
  WHEEL_LAYOUT.forEach((layout, index) => {
    const tyre = car.wheels[layout.id];
    view.wheelPivots[index]!.rotation.y = -tyre.steeringAngle;
    // Independent free-rolling animation; not wheelspin/lockup physics yet.
    view.allWheels[index]!.rotation.x = -tyre.rollingDistance / HANDLING.wheelRadius;
  });
}
