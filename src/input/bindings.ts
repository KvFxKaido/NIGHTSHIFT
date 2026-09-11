export const ACTIONS = {
  throttle: "Accelerate", brake: "Brake / reverse", left: "Steer left", right: "Steer right",
  handbrake: "Handbrake", reset: "Reset car", camera: "Recenter camera / platform",
  telemetry: "Toggle telemetry", flash: "Flash headlights / challenge rival", interact: "Enter garage", map: "Open / close city map",
} as const;
export type Action = keyof typeof ACTIONS;
export type PadAction = Exclude<Action, "left" | "right" | "interact">;
export interface Bindings { keyboard: Record<Action, string>; gamepad: Record<PadAction, number> }
export type BindingDevice = keyof Bindings;
export const DEFAULT_BINDINGS: Bindings = {
  keyboard: { throttle: "KeyW", brake: "KeyS", left: "KeyA", right: "KeyD", handbrake: "Space",
    reset: "KeyR", camera: "KeyC", telemetry: "KeyH", flash: "KeyF", interact: "KeyE", map: "KeyM" },
  gamepad: { throttle: 7, brake: 6, handbrake: 0, reset: 3, camera: 11, telemetry: 4, flash: 2, map: 8 },
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
/** Reject collisions rather than silently removing another action's binding. */
export function rebind(bindings: Bindings, device: BindingDevice, action: Action, value: string | number): Bindings {
  const map = bindings[device] as Record<string, string | number>;
  if (!Object.hasOwn(map, action)) throw new Error("That control uses a fixed stick or menu binding.");
  if (device === "keyboard" ? !validKey(value) : typeof value !== "number" || !Object.hasOwn(PAD_LABELS, value)) {
    throw new Error(device === "keyboard" ? "Choose a letter, number, modifier, Space or punctuation. Menu keys stay fixed."
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
      // Older saves predate flash or map. Preserve their remaps and give the new action
      // an unused control instead of resetting the player's entire setup.
      if ((action === "flash" || action === "map") && value === undefined) {
        const used = [...Object.values(data[device] ?? {}), ...seen];
        const choices = device === "keyboard" ? [action === "map" ? "KeyM" : "KeyF", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(letter => `Key${letter}`)]
          : [action === "map" ? 8 : 2, ...Object.keys(PAD_LABELS).map(Number)];
        value = choices.find(candidate => !used.includes(candidate));
      }
      if (seen.has(value) || (device === "keyboard" ? !validKey(value) : typeof value !== "number" || !Object.hasOwn(PAD_LABELS, value))) {
        throw new Error("Invalid controls save");
      }
      seen.add(value);
      (result[device] as Record<string, string | number>)[action] = value;
    }
  }
  return result;
}
