export const ACTIONS = {
  throttle: "Accelerate", brake: "Brake / reverse", left: "Steer left", right: "Steer right",
  shiftUp: "Shift up (drag)", shiftDown: "Shift down (drag)", handbrake: "Handbrake", reset: "Reset car", camera: "Recenter camera / platform",
  cameraView: "Change camera",
  telemetry: "Toggle telemetry", flash: "Flash headlights / challenge rival", interact: "Enter garage", map: "Open / close city map",
} as const;
export type Action = keyof typeof ACTIONS;
/** Every remappable pad button is taken, so the camera cycle is fixed to D-pad Up on a controller. */
export const CAMERA_VIEW_PAD_BUTTON = 12;
/** The soundtrack skips on D-pad Left / Right, fixed the same way. They steered
 *  until 2026-09-18; the left stick steers. */
export const PREVIOUS_TRACK_PAD_BUTTON = 14;
export const NEXT_TRACK_PAD_BUTTON = 15;
export type PadAction = Exclude<Action, "left" | "right" | "interact" | "cameraView">;
export interface Bindings { keyboard: Record<Action, string>; gamepad: Record<PadAction, number> }
export type BindingDevice = keyof Bindings;
export const DEFAULT_BINDINGS: Bindings = {
  keyboard: { throttle: "KeyW", brake: "KeyS", left: "KeyA", right: "KeyD", handbrake: "Space",
    shiftUp: "ShiftLeft", shiftDown: "ControlLeft", reset: "KeyR", camera: "KeyC", cameraView: "KeyV", telemetry: "KeyH", flash: "KeyF", interact: "KeyE", map: "KeyM" },
  gamepad: { throttle: 7, brake: 6, handbrake: 0, reset: 3, camera: 11, telemetry: 10, flash: 2, map: 8, shiftUp: 5, shiftDown: 4 },
};
export const PAD_LABELS: Record<number, string> = {
  0: "A / Cross", 1: "B / Circle", 2: "X / Square", 3: "Y / Triangle", 4: "LB / L1",
  5: "RB / R1", 6: "LT / L2", 7: "RT / R2", 8: "View / Share", 10: "L3", 11: "R3",
};
export function copyBindings(bindings = DEFAULT_BINDINGS): Bindings {
  return { keyboard: { ...bindings.keyboard }, gamepad: { ...bindings.gamepad } };
}
export function keyLabel(code: string): string {
  return code.replace(/^Key|^Digit/, "").replace("Left", " L").replace("Right", " R");
}
function validKey(value: unknown): value is string {
  return typeof value === "string" && /^(Key[A-Z]|Digit[0-9]|Space|Shift(Left|Right)|Control(Left|Right)|Numpad[0-9]|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal)$/.test(value);
}
function validPadButton(action: string, value: unknown): value is number {
  // Driving actions can share A/B with menus because they run on separate screens.
  // Map toggles run in both contexts, so sharing confirm/back would emit two commands.
  return typeof value === "number" && Object.hasOwn(PAD_LABELS, value)
    && (action !== "map" || (value !== 0 && value !== 1));
}
/** Reject collisions rather than silently removing another action's binding. */
export function rebind(bindings: Bindings, device: BindingDevice, action: Action, value: string | number): Bindings {
  const map = bindings[device] as Record<string, string | number>;
  if (!Object.hasOwn(map, action)) throw new Error("That control uses a fixed stick or menu binding.");
  if (device === "keyboard" ? !validKey(value) : !validPadButton(action, value)) {
    throw new Error(device === "keyboard" ? "Choose a letter, number, modifier, Space or punctuation. Menu keys stay fixed."
      : action === "map" ? "Menu buttons (A / Cross, B / Circle, Menu / Options and D-pad) cannot open the map. Choose another button."
      : "Menu / Options and D-pad navigation stay fixed. Choose another button.");
  }
  const conflict = Object.entries(map).find(([other, binding]) => other !== action && binding === value);
  if (conflict) throw new Error(`Already assigned to ${ACTIONS[conflict[0] as Action]}. Change that binding first.`);
  const next = copyBindings(bindings);
  (next[device] as Record<string, string | number>)[action] = value;
  return next;
}
export const BINDINGS_KEY = "nightshift.controls";
/** Invalid saves recover as a complete map so duplicate bindings cannot strand an action. */
export function decodeBindings(raw: string | null): Bindings {
  if (raw === null) return copyBindings();
  const data = JSON.parse(raw);
  if (data?.version !== 1) throw new Error("Unknown controls version");
  const result = copyBindings();
  for (const device of ["keyboard", "gamepad"] as const) {
    const seen = new Set();
    for (const action of Object.keys(result[device])) {
      let value = data[device]?.[action];
      // Older saves predate flash, map, manual shifts or the camera cycle. Preserve their remaps and
      // give the new action an unused control instead of resetting the player's entire setup.
      if ((["flash", "map", "shiftUp", "shiftDown", "cameraView"].includes(action)) && value === undefined) {
        const used = [...Object.values(data[device] ?? {}), ...seen];
        const choices = device === "keyboard" ? [DEFAULT_BINDINGS.keyboard[action as Action], ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(letter => `Key${letter}`)]
          : [DEFAULT_BINDINGS.gamepad[action as PadAction], ...Object.keys(PAD_LABELS).map(Number)];
        value = choices.find(candidate => !used.includes(candidate)
          && (device === "keyboard" ? validKey(candidate) : validPadButton(action, candidate)));
      }
      if (seen.has(value) || (device === "keyboard" ? !validKey(value) : !validPadButton(action, value))) {
        throw new Error("Invalid controls save");
      }
      seen.add(value);
      (result[device] as Record<string, string | number>)[action] = value;
    }
  }
  return result;
}
