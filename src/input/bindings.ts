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
/** The pad's fixed menu buttons (design/MENUS.md): A and B, and since 2026-09-24 X, Y
 *  and the shoulders, which are a screen's own actions and its sections. */
export const MENU_PAD_BUTTONS = { confirm: 0, back: 1, actionX: 2, actionY: 3, sectionPrev: 4, sectionNext: 5 } as const;
const MENU_FIXED: readonly number[] = Object.values(MENU_PAD_BUTTONS);
/** The same menu commands' keys: Q and E are the shoulders, X and Y the face buttons. */
export const MENU_KEYS = { sectionPrev: "KeyQ", sectionNext: "KeyE", actionX: "KeyX", actionY: "KeyY" } as const;
const MENU_FIXED_KEYS: readonly string[] = Object.values(MENU_KEYS);
function validKey(action: string, value: unknown): value is string {
  // As on the pad (validPadButton): the map toggles in menus too, so on a menu key one press would be two commands,
  // X driving out of the garage and opening the map at once. Driving actions share these keys (E enters the garage).
  return typeof value === "string" && /^(Key[A-Z]|Digit[0-9]|Space|Shift(Left|Right)|Control(Left|Right)|Numpad[0-9]|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal)$/.test(value)
    && (action !== "map" || !MENU_FIXED_KEYS.includes(value));
}
function validPadButton(action: string, value: unknown): value is number {
  // Driving actions can share the menu buttons because they run on separate screens.
  // Map toggles run in both contexts, so sharing one would emit two commands.
  return typeof value === "number" && Object.hasOwn(PAD_LABELS, value)
    && (action !== "map" || !MENU_FIXED.includes(value));
}
/** Reject collisions rather than silently removing another action's binding. */
export function rebind(bindings: Bindings, device: BindingDevice, action: Action, value: string | number): Bindings {
  const map = bindings[device] as Record<string, string | number>;
  if (!Object.hasOwn(map, action)) throw new Error("That control uses a fixed stick or menu binding.");
  if (device === "keyboard" ? !validKey(action, value) : !validPadButton(action, value)) {
    throw new Error(device === "keyboard" ? action === "map" && MENU_FIXED_KEYS.includes(value as string)
      ? "Q, E, X and Y are menu keys and cannot open the map. Choose another key."
      : "Choose a letter, number, modifier, Space or punctuation. Menu keys stay fixed."
      : action === "map" ? "Menu buttons (A, B, X, Y, LB, RB, Menu / Options and D-pad) cannot open the map. Choose another button."
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
      // A map saved on X, Y or a shoulder was valid until those became menu buttons (2026-09-24).
      // It moves to a free button, as a missing action is given one. If every button the map may
      // take is in use (there are five, and the default layout fills them), it stays where the
      // player put it, sharing the button as it did before: that costs a menu one doubled press,
      // where refusing the save would throw away every remap in it. A and B were never allowed, so
      // a map on one of them is still an invalid save below.
      let tolerated = false;
      if (device === "gamepad" && action === "map" && MENU_FIXED.includes(value)
        && value !== MENU_PAD_BUTTONS.confirm && value !== MENU_PAD_BUTTONS.back) {
        const used = [...Object.values(data.gamepad ?? {}), ...seen];
        const free = Object.keys(PAD_LABELS).map(Number).find(candidate => !used.includes(candidate) && validPadButton(action, candidate));
        if (free === undefined) tolerated = true;
        else value = free;
      }
      // The keyboard's map on Q, E, X or Y, valid until the same day, moves the same way. A keyboard always has a
      // free letter, so it always moves: M if that is free, as on a fresh save.
      if (device === "keyboard" && action === "map" && MENU_FIXED_KEYS.includes(value)) {
        const used = [...Object.values(data.keyboard ?? {}), ...seen];
        value = [DEFAULT_BINDINGS.keyboard.map, ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(letter => `Key${letter}`)]
          .find(candidate => !used.includes(candidate) && validKey(action, candidate));
      }
      // Older saves predate flash, map, manual shifts or the camera cycle. Preserve their remaps and
      // give the new action an unused control instead of resetting the player's entire setup.
      if ((["flash", "map", "shiftUp", "shiftDown", "cameraView"].includes(action)) && value === undefined) {
        const used = [...Object.values(data[device] ?? {}), ...seen];
        const choices = device === "keyboard" ? [DEFAULT_BINDINGS.keyboard[action as Action], ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(letter => `Key${letter}`)]
          : [DEFAULT_BINDINGS.gamepad[action as PadAction], ...Object.keys(PAD_LABELS).map(Number)];
        value = choices.find(candidate => !used.includes(candidate)
          && (device === "keyboard" ? validKey(action, candidate) : validPadButton(action, candidate)));
      }
      if (seen.has(value) || (device === "keyboard" ? !validKey(action, value) : !(tolerated || validPadButton(action, value)))) {
        throw new Error("Invalid controls save");
      }
      seen.add(value);
      (result[device] as Record<string, string | number>)[action] = value;
    }
  }
  return result;
}
