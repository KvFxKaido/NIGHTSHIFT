import {
  CAMERA_VIEW_PAD_BUTTON, copyBindings, DEFAULT_BINDINGS, NEXT_TRACK_PAD_BUTTON, PREVIOUS_TRACK_PAD_BUTTON,
  type Bindings, type BindingDevice,
} from "./bindings.ts";
import type { Input } from "../sim/sim.ts";

export interface CameraLook {
  x: number;
  y: number;
}

export type MenuCommand = "up" | "down" | "left" | "right" | "confirm" | "back" | "pause" | "interact" | "flash" | "map";

export interface InputController {
  update(): void;
  bindings(): Bindings;
  setBindings(bindings: Bindings): void;
  beginCapture(device: BindingDevice, done: (value: string | number | null) => void): void;
  cancelCapture(): void;
  sample(): Input;
  cameraLook(): CameraLook;
  consumeMenuCommands(): MenuCommand[];
  armDrivingInputGate(): void;
  /** True while driving input is still being swallowed waiting for neutral. */
  isDrivingGated(): boolean;
  consumeReset(): boolean;
  consumeCameraReset(): boolean;
  /** One press of the change-camera control (keyboard binding or D-pad Up). */
  consumeCameraCycle(): boolean;
  /** One press of D-pad Left (-1) or Right (1): the previous or next track. */
  consumeTrackSkip(): -1 | 0 | 1;
  consumeDebugToggle(): boolean;
  gamepadName(): string | null;
  activeGamepadName(): string | null;
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

// Triggers that never reach 1. Shawn's pad tops out at 231-232/255 (0.906-0.910)
// on the throttle trigger while the brake trigger reaches 255/255, so two
// recorded sessions of Ridge Circuit (2026-09-13) never had full throttle and the
// rival always did. The top of the travel is stretched: a pull past TRIGGER_FULL
// is full, and between TRIGGER_KNEE and it the value is scaled up to meet it.
// Below the knee a trigger delivers exactly what it reads, so resting offsets and
// light pulls are unchanged, and the mapping stays continuous and increasing.
//
// The knee is at the top of the travel (2026-09-20; it was at half). Since the
// player drives with no pedal assist, the throttle that matters is the tyres'
// limit: about 0.42 delivered from rest in the Cinder, 0.5 at 30 mph, 0.65 at 60,
// lower in a corner. At a knee of 0.5 the stretch sat on top of that, 1.32 of
// delivered throttle per unit of travel through the upper half of the band a
// driver is trying to hold. Here everything up to 0.8 is one to one, and the
// stretch is the last eighth of the pull, between "most of it" and "all of it",
// where nothing is being held. A power curve, the obvious answer, is the wrong
// one: it spreads the bottom of the travel and squeezes the limit, 1.31 at 0.42
// for an exponent of 1.6 where this is 1.00.
export const TRIGGER_KNEE = 0.8;
export const TRIGGER_FULL = 0.88;
export function triggerValue(value: number): number {
  if (value <= TRIGGER_KNEE) return value;
  if (value >= TRIGGER_FULL) return 1;
  return TRIGGER_KNEE + (value - TRIGGER_KNEE) * (1 - TRIGGER_KNEE) / (TRIGGER_FULL - TRIGGER_KNEE);
}

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

export function mapGamepad(gamepad: Gamepad | null, bindings = DEFAULT_BINDINGS.gamepad): Input {
  return {
    throttle: triggerValue(buttonValue(gamepad, bindings.throttle)),
    brake: triggerValue(buttonValue(gamepad, bindings.brake)),
    // The stick alone: D-pad Left / Right skip the soundtrack (bindings.ts).
    steer: deadzone(gamepad?.axes[0] ?? 0, STEERING_DEADZONE),
    handbrake: triggerValue(buttonValue(gamepad, bindings.handbrake)),
    ...(buttonPressed(gamepad, bindings.shiftUp) ? { shiftUp: true } : {}),
    ...(buttonPressed(gamepad, bindings.shiftDown) ? { shiftDown: true } : {}),
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

export function createInputController(initialBindings = DEFAULT_BINDINGS): InputController {
  let bindings = copyBindings(initialBindings);
  let capture: { device: BindingDevice; ready: boolean; done: (value: string | number | null) => void } | null = null;
  const held = new Set<string>();
  let shiftUpRequested = false, shiftDownRequested = false;
  let resetRequested = false;
  let cameraResetRequested = false;
  let cameraCycleRequested = false;
  let trackSkipRequested: -1 | 0 | 1 = 0;
  let debugToggleRequested = false;
  let gamepad: Gamepad | null = null;
  let previousButtons: readonly boolean[] = [];
  let previousMenuVertical: -1 | 0 | 1 = 0;
  let previousMenuHorizontal: -1 | 0 | 1 = 0;
  let drivingInputGated = true;
  let drivingGateSamples = 0;
  const menuCommands: MenuCommand[] = [];
  let activeDevice: "keyboard" | "gamepad" = "keyboard";

  function finishCapture(value: string | number | null): void {
    const done = capture?.done;
    capture = null;
    held.clear(); shiftUpRequested = shiftDownRequested = false;
    menuCommands.length = 0;
    resetRequested = cameraResetRequested = cameraCycleRequested = debugToggleRequested = false;
    trackSkipRequested = 0;
    drivingInputGated = true;
    drivingGateSamples = 0;
    done?.(value);
  }

  addEventListener("keydown", (event) => {
    activeDevice = "keyboard";
    if (capture) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === "Escape") finishCapture(null);
      else if (capture.device === "keyboard") finishCapture(event.code);
      return;
    }
    const target = event.target as HTMLInputElement | null;
    if (target?.tagName === "INPUT" && target.type === "text") {
      if (event.code === "Escape") { event.preventDefault(); menuCommands.push("back"); }
      if (event.code === "Enter" || event.code === "NumpadEnter") { event.preventDefault(); menuCommands.push("confirm"); }
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "NumpadEnter"].includes(event.code)) {
      event.preventDefault();
    }
    held.add(event.code);
    if (event.repeat) return;
    if (event.code === bindings.keyboard.shiftUp) shiftUpRequested = true;
    if (event.code === bindings.keyboard.shiftDown) shiftDownRequested = true;
    if (event.code === "Escape") menuCommands.push("pause");
    if (event.code === bindings.keyboard.map) menuCommands.push("map");
    if (event.code === bindings.keyboard.flash) menuCommands.push("flash");
    if (event.code === bindings.keyboard.interact) menuCommands.push("interact");
    if (event.code === "Enter" || event.code === "NumpadEnter") menuCommands.push("confirm");
    if (event.code === "ArrowUp") menuCommands.push("up");
    if (event.code === "ArrowDown") menuCommands.push("down");
    if (event.code === "ArrowLeft") menuCommands.push("left");
    if (event.code === "ArrowRight") menuCommands.push("right");
    if (event.code === bindings.keyboard.reset) resetRequested = true;
    if (event.code === bindings.keyboard.camera) cameraResetRequested = true;
    if (event.code === bindings.keyboard.cameraView) cameraCycleRequested = true;
    if (event.code === bindings.keyboard.telemetry) debugToggleRequested = true;
  });
  addEventListener("keyup", (event) => held.delete(event.code));
  addEventListener("blur", () => { held.clear(); shiftUpRequested = shiftDownRequested = false; if (capture) finishCapture(null); });

  function update(): void {
    gamepad = navigator.getGamepads().find(
      (candidate) => candidate?.connected && candidate.mapping === "standard",
    ) ?? null;

    const currentButtons = gamepad?.buttons.map((button) => button.pressed) ?? [];
    const justPressed = (index: number) => currentButtons[index] && !previousButtons[index];
    if (currentButtons.some((pressed, index) => pressed && !previousButtons[index])
      || gamepad?.buttons.some(button => button.value > .2)
      || gamepad?.axes.some(axis => Math.abs(axis) > .35)) activeDevice = "gamepad";
    if (capture) {
      if (justPressed(9)) finishCapture(null);
      else if (capture.device === "gamepad") {
        if (gamepad && gamepad.buttons.every(button => button.value < .2)) capture.ready = true;
        const pressed = gamepad?.buttons.findIndex((button, index) => button.value > .5 && justPressed(index)) ?? -1;
        if (capture.ready && pressed >= 0) finishCapture(pressed);
      }
      previousButtons = currentButtons;
      previousMenuVertical = mapMenuVertical(gamepad);
      previousMenuHorizontal = mapMenuHorizontal(gamepad);
      return;
    }
    if (justPressed(bindings.gamepad.shiftUp)) shiftUpRequested = true;
    if (justPressed(bindings.gamepad.shiftDown)) shiftDownRequested = true;
    if (justPressed(bindings.gamepad.reset)) resetRequested = true;
    if (justPressed(bindings.gamepad.telemetry)) debugToggleRequested = true;
    if (justPressed(bindings.gamepad.camera)) cameraResetRequested = true;
    // The D-pad button itself, never the stick: menu "up" also reads the left
    // stick, and steering must not change the camera.
    if (justPressed(CAMERA_VIEW_PAD_BUTTON)) cameraCycleRequested = true;
    // The buttons again, never the stick, which is steering and menu left/right.
    if (justPressed(PREVIOUS_TRACK_PAD_BUTTON)) trackSkipRequested = -1;
    if (justPressed(NEXT_TRACK_PAD_BUTTON)) trackSkipRequested = 1;
    if (justPressed(bindings.gamepad.map)) menuCommands.push("map");
    if (justPressed(bindings.gamepad.flash)) menuCommands.push("flash");
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
    const padInput = mapGamepad(gamepad, bindings.gamepad);
    const keyboardSteer =
      (held.has(bindings.keyboard.left) || held.has("ArrowLeft") ? -1 : 0) +
      (held.has(bindings.keyboard.right) || held.has("ArrowRight") ? 1 : 0);

    const nextInput: Input = {
      ...(shiftUpRequested ? { shiftUp: true } : {}),
      ...(shiftDownRequested ? { shiftDown: true } : {}),
      throttle: Math.max(
        held.has(bindings.keyboard.throttle) || held.has("ArrowUp") ? 1 : 0,
        padInput.throttle,
      ),
      brake: Math.max(
        held.has(bindings.keyboard.brake) || held.has("ArrowDown") ? 1 : 0,
        padInput.brake,
      ),
      steer: padInput.steer !== 0 ? padInput.steer : keyboardSteer,
      handbrake: Math.max(
        held.has(bindings.keyboard.handbrake) ? 1 : 0,
        padInput.handbrake,
      ),
    };

    shiftUpRequested = shiftDownRequested = false;
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

  function consume(flag: "reset" | "camera" | "cycle" | "debug"): boolean {
    const value = flag === "reset"
      ? resetRequested
      : flag === "camera"
        ? cameraResetRequested
        : flag === "cycle"
          ? cameraCycleRequested
          : debugToggleRequested;
    if (flag === "reset") resetRequested = false;
    if (flag === "camera") cameraResetRequested = false;
    if (flag === "cycle") cameraCycleRequested = false;
    if (flag === "debug") debugToggleRequested = false;
    return value;
  }

  return {
    bindings: () => copyBindings(bindings),
    setBindings: next => { bindings = copyBindings(next); held.clear(); shiftUpRequested = shiftDownRequested = false; drivingInputGated = true; drivingGateSamples = 0; },
    beginCapture: (device, done) => {
      if (capture) finishCapture(null);
      held.clear(); shiftUpRequested = shiftDownRequested = false; menuCommands.length = 0;
      capture = { device, done, ready: false };
    },
    cancelCapture: () => { if (capture) finishCapture(null); },
    update,
    sample,
    cameraLook: () => mapCameraGamepad(gamepad),
    consumeMenuCommands: () => menuCommands.splice(0),
    armDrivingInputGate: () => { shiftUpRequested = shiftDownRequested = false; drivingInputGated = true; drivingGateSamples = 0; },
    isDrivingGated: () => drivingInputGated,
    consumeReset: () => consume("reset"),
    consumeCameraReset: () => consume("camera"),
    consumeCameraCycle: () => consume("cycle"),
    consumeTrackSkip: () => { const skip = trackSkipRequested; trackSkipRequested = 0; return skip; },
    consumeDebugToggle: () => consume("debug"),
    gamepadName: () => gamepad?.id ?? null,
    activeGamepadName: () => activeDevice === "gamepad" ? gamepad?.id ?? null : null,
  };
}
