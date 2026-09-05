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
  consumeReset(): boolean;
  consumeCameraReset(): boolean;
  consumeReplay(): boolean;
  consumeDebugToggle(): boolean;
  gamepadName(): string | null;
}

function deadzone(value: number, threshold = 0.14): number {
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
  const analogSteer = deadzone(gamepad?.axes[0] ?? 0);
  const dpadSteer = (buttonPressed(gamepad, 14) ? -1 : 0) +
    (buttonPressed(gamepad, 15) ? 1 : 0);

  return {
    throttle: buttonValue(gamepad, 7),
    brake: buttonValue(gamepad, 6),
    steer: analogSteer !== 0 ? analogSteer : dpadSteer,
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
      const neutral = nextInput.throttle < 0.01 && nextInput.brake < 0.01 &&
        Math.abs(nextInput.steer) < 0.01 && nextInput.handbrake < 0.01;
      if (neutral) drivingInputGated = false;
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
    armDrivingInputGate: () => { drivingInputGated = true; },
    consumeReset: () => consume("reset"),
    consumeCameraReset: () => consume("camera"),
    consumeReplay: () => consume("replay"),
    consumeDebugToggle: () => consume("debug"),
    gamepadName: () => gamepad?.id ?? null,
  };
}
