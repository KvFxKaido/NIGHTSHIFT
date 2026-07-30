/* The wiring: input → fixed-tick sim → render. Nothing here decides
   gameplay either — it samples input, advances the sim at TICK_HZ with
   an accumulator, and hands the latest state to the renderer.

   The input log is the ghost door, open from commit one: every tick's
   input is recorded, so (start state + log) IS the run. Phase 2 turns
   this into restarts and ghosts; the witness-style share/verify layer
   can come later, but only because this array exists now. */

import RAPIER from "@dimforge/rapier3d-compat";
import { createSim, step, DT, TICK_HZ, type Input } from "./sim/sim.ts";
import { createView, render } from "./render/scene.ts";

// Prove the wasm pipeline early (dev AND build) — the physics itself
// arrives with the Phase 1 handling prototype, stepping inside the sim
// tick, never in the render loop.
await RAPIER.init();

const boot = document.getElementById("boot")!;
boot.textContent =
  `NIGHTSHIFT — phase 0 wiring\n` +
  `rapier ${RAPIER.version()} ready · sim ${TICK_HZ}Hz fixed tick · WASD / arrows drive`;

const held = new Set<string>();
addEventListener("keydown", (e) => held.add(e.code));
addEventListener("keyup", (e) => held.delete(e.code));

function sampleInput(): Input {
  return {
    throttle: held.has("KeyW") || held.has("ArrowUp") ? 1 : 0,
    brake: held.has("KeyS") || held.has("ArrowDown") ? 1 : 0,
    steer:
      (held.has("KeyA") || held.has("ArrowLeft") ? -1 : 0) +
      (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0),
  };
}

const sim = createSim();
const inputLog: Input[] = [];
const view = createView(document.getElementById("view") as HTMLCanvasElement);

let last = performance.now();
let acc = 0;

function frame(now: number) {
  // real time stays out here; the sim only ever sees whole ticks of DT
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  while (acc >= DT) {
    const input = sampleInput();
    inputLog.push(input);
    step(sim, input);
    acc -= DT;
  }
  render(view, sim);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
