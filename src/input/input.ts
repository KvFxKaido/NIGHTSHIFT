import type { Input } from "../sim/sim.ts";

export interface CameraLook {
  x: number;
  y: number;
}

export type MenuCommand = "up" | "down" | "left" | "right" | "confirm" | "back" | "pause";

export interface InputController {
  update(): void;
  sample(): Input;
  cameraLook(): CameraLook;
  consumeMenuCommands(): MenuCommand[];
  armDrivingInputGate(): void;
  /** True while driving input is still being swallowed waiting for neutral. */
  isDrivingGated(): boolean;
  consumeReset(): boolean;
  consumeCameraReset(): boolean;
  consumeReplay(): boolean;
  consumeDebugToggle(): boolean;
  gamepadName(): string | null;
}

// A small center buffer filters resting-stick noise without the original large
// deadzone. Camera and menu navigation keep their own separate thresholds.
const STEERING_DEADZONE = 0.05;
// Only recognize a released stick when entering/resuming driving; this never
// filters steering after the gate opens, even if the pad has a resting offset.
const DRIVING_GATE_STEERING_NEUTRAL = 0.1;
// Triggers are analog and rest slightly above zero on plenty of pads. Demanding
// a literal 0.01 meant such a pad never read neutral, so the gate never opened
// and every driving input stayed zero for the whole run while the menus, which
// use button presses and a 0.65 axis threshold, kept working perfectly.
// This governs only when the gate OPENS; delivered values are never filtered.
const DRIVING_GATE_ANALOG_NEUTRAL = 0.12;
// And a deadline, because every threshold above is a cliff a pad can rest on
// the wrong side of. Raising the trigger tolerance from 0.01 to 0.12 fixed one
// pad and moved the cliff; a stick resting at 0.15 or a trigger at 0.12 still
// held the gate shut for the whole run, with the menus working perfectly on
// their own 0.65 threshold so the pad looked alive and the car did not.
//
// The gate stops a menu press bleeding into driving. It is worth a few frames
// and it is not worth a run, so it opens on neutral OR when it runs out of
// samples, whichever comes first. Half a second at the fixed tick: the worst
// case is one press carrying into the first metres, and no pad can be locked
// out. Counted in samples rather than clock, because sample() is called once
// per fixed tick and a wall clock here would make replays depend on frame rate.
const DRIVING_GATE_MAX_SAMPLES = 30;

function deadzone(value: number, threshold: number): number {
  if (Math.abs(value) <= threshold) return 0;
  return Math.sign(value) * (Math.abs(value) - threshold) / (1 - threshold);
}

function buttonValue(gamepad: Gamepad | null, index: number): number {
  return gamepad?.buttons[index]?.value ?? 0;
}

function buttonPressed(gamepad: Gamepad | null, index: number): boolean {
  return gamepad?.buttons[index]?.pressed ?? false;
}

export function mapGamepad(gamepad: Gamepad | null): Input {
  const analogSteer = deadzone(gamepad?.axes[0] ?? 0, STEERING_DEADZONE);
  const dpadLeft = buttonPressed(gamepad, 14);
  const dpadRight = buttonPressed(gamepad, 15);
  const dpadSteer = (dpadLeft ? -1 : 0) + (dpadRight ? 1 : 0);

  return {
    throttle: buttonValue(gamepad, 7),
    brake: buttonValue(gamepad, 6),
    steer: dpadLeft || dpadRight ? dpadSteer : analogSteer,
    handbrake: buttonValue(gamepad, 0),
  };
}

export function mapCameraGamepad(gamepad: Gamepad | null): CameraLook {
  return {
    x: deadzone(gamepad?.axes[2] ?? 0, 0.18),
    y: deadzone(gamepad?.axes[3] ?? 0, 0.18),
  };
}

export function mapMenuVertical(gamepad: Gamepad | null): -1 | 0 | 1 {
  if (buttonPressed(gamepad, 12)) return -1;
  if (buttonPressed(gamepad, 13)) return 1;
  const axis = gamepad?.axes[1] ?? 0;
  return axis < -0.65 ? -1 : axis > 0.65 ? 1 : 0;
}

export function mapMenuHorizontal(gamepad: Gamepad | null): -1 | 0 | 1 {
  if (buttonPressed(gamepad, 14)) return -1;
  if (buttonPressed(gamepad, 15)) return 1;
  const axis = gamepad?.axes[0] ?? 0;
  return axis < -0.65 ? -1 : axis > 0.65 ? 1 : 0;
}

export function createInputController(): InputController {
  const held = new Set<string>();
  let resetRequested = false;
  let cameraResetRequested = false;
  let replayRequested = false;
  let debugToggleRequested = false;
  let gamepad: Gamepad | null = null;
  let previousButtons: readonly boolean[] = [];
  let previousMenuVertical: -1 | 0 | 1 = 0;
  let previousMenuHorizontal: -1 | 0 | 1 = 0;
  let drivingInputGated = true;
  let drivingGateSamples = 0;
  const menuCommands: MenuCommand[] = [];

  addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      event.preventDefault();
    }
    held.add(event.code);
    if (event.repeat) return;
    if (event.code === "Escape") menuCommands.push("pause");
    if (event.code === "Enter" || event.code === "NumpadEnter") menuCommands.push("confirm");
    if (event.code === "ArrowUp") menuCommands.push("up");
    if (event.code === "ArrowDown") menuCommands.push("down");
    if (event.code === "ArrowLeft") menuCommands.push("left");
    if (event.code === "ArrowRight") menuCommands.push("right");
    if (event.code === "KeyR") resetRequested = true;
    if (event.code === "KeyC") cameraResetRequested = true;
    if (event.code === "KeyP") replayRequested = true;
    if (event.code === "KeyH") debugToggleRequested = true;
  });
  addEventListener("keyup", (event) => held.delete(event.code));
  addEventListener("blur", () => held.clear());

  function update(): void {
    gamepad = navigator.getGamepads().find(
      (candidate) => candidate?.connected && candidate.mapping === "standard",
    ) ?? null;

    const currentButtons = gamepad?.buttons.map((button) => button.pressed) ?? [];
    const justPressed = (index: number) => currentButtons[index] && !previousButtons[index];
    if (justPressed(3)) resetRequested = true;       // Y / Triangle
    if (justPressed(8)) replayRequested = true;      // View / Share
    if (justPressed(4)) debugToggleRequested = true; // LB / L1
    if (justPressed(11)) cameraResetRequested = true; // R3
    if (justPressed(9)) menuCommands.push("pause");    // Menu / Options
    if (justPressed(0)) menuCommands.push("confirm"); // A / Cross
    if (justPressed(1)) menuCommands.push("back");    // B / Circle

    const menuVertical = mapMenuVertical(gamepad);
    if (menuVertical !== 0 && previousMenuVertical === 0) {
      menuCommands.push(menuVertical < 0 ? "up" : "down");
    }
    previousMenuVertical = menuVertical;

    const menuHorizontal = mapMenuHorizontal(gamepad);
    if (menuHorizontal !== 0 && previousMenuHorizontal === 0) {
      menuCommands.push(menuHorizontal < 0 ? "left" : "right");
    }
    previousMenuHorizontal = menuHorizontal;
    previousButtons = currentButtons;
  }

  function sample(): Input {
    const padInput = mapGamepad(gamepad);
    const keyboardSteer =
      (held.has("KeyA") || held.has("ArrowLeft") ? -1 : 0) +
      (held.has("KeyD") || held.has("ArrowRight") ? 1 : 0);

    const nextInput = {
      throttle: Math.max(
        held.has("KeyW") || held.has("ArrowUp") ? 1 : 0,
        padInput.throttle,
      ),
      brake: Math.max(
        held.has("KeyS") || held.has("ArrowDown") ? 1 : 0,
        padInput.brake,
      ),
      steer: padInput.steer !== 0 ? padInput.steer : keyboardSteer,
      handbrake: Math.max(
        held.has("Space") ? 1 : 0,
        padInput.handbrake,
      ),
    };

    if (drivingInputGated) {
      const neutral =
        nextInput.throttle < DRIVING_GATE_ANALOG_NEUTRAL &&
        nextInput.brake < DRIVING_GATE_ANALOG_NEUTRAL &&
        nextInput.handbrake < DRIVING_GATE_ANALOG_NEUTRAL &&
        Math.abs(nextInput.steer) < DRIVING_GATE_STEERING_NEUTRAL;
      drivingGateSamples++;
      if (neutral || drivingGateSamples >= DRIVING_GATE_MAX_SAMPLES) drivingInputGated = false;
      return { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
    }

    return nextInput;
  }

  function consume(flag: "reset" | "camera" | "replay" | "debug"): boolean {
    const value = flag === "reset"
      ? resetRequested
      : flag === "camera"
        ? cameraResetRequested
        : flag === "replay"
          ? replayRequested
          : debugToggleRequested;
    if (flag === "reset") resetRequested = false;
    if (flag === "camera") cameraResetRequested = false;
    if (flag === "replay") replayRequested = false;
    if (flag === "debug") debugToggleRequested = false;
    return value;
  }

  return {
    update,
    sample,
    cameraLook: () => mapCameraGamepad(gamepad),
    consumeMenuCommands: () => menuCommands.splice(0),
    armDrivingInputGate: () => { drivingInputGated = true; drivingGateSamples = 0; },
    isDrivingGated: () => drivingInputGated,
    consumeReset: () => consume("reset"),
    consumeCameraReset: () => consume("camera"),
    consumeReplay: () => consume("replay"),
    consumeDebugToggle: () => consume("debug"),
    gamepadName: () => gamepad?.id ?? null,
  };
}
