import { ACTIONS, BINDINGS_KEY, PAD_LABELS, copyBindings, decodeBindings, keyLabel, rebind,
  type Action, type BindingDevice, type PadAction } from "../input/bindings.ts";
import type { InputController } from "../input/input.ts";

/** The input adapter owns capture; this panel only presents and saves bindings. */
export function createControlsPanel(input: InputController) {
  const root = document.querySelector<HTMLElement>('[data-menu-screen="controls"]')!;
  const rows = root.querySelector<HTMLElement>("[data-binding-rows]")!;
  const status = root.querySelector<HTMLElement>("[data-controls-status]")!;
  const cancel = root.querySelector<HTMLButtonElement>("[data-cancel-binding]")!;
  const defaults = root.querySelector<HTMLButtonElement>("[data-default-bindings]")!;
  let listening = false;
  try {
    input.setBindings(decodeBindings(localStorage.getItem(BINDINGS_KEY)));
    status.textContent = "Select a binding, then press its new key or button.";
  } catch {
    status.textContent = "Saved controls unavailable. Defaults are active; changes can still be used this session.";
  }
  for (const [id, label] of Object.entries(ACTIONS)) {
    const row = document.createElement("tr");
    const heading = document.createElement("th");
    heading.scope = "row"; heading.textContent = label; row.append(heading);
    for (const device of ["keyboard", "gamepad"] as const) {
      const cell = document.createElement("td");
      if (device === "gamepad" && !Object.hasOwn(input.bindings().gamepad, id)) {
        cell.textContent = id === "interact" ? "A / Cross" : "Left stick / D-pad";
      } else {
        const button = document.createElement("button");
        button.className = "garage-option binding-button";
        button.dataset.binding = id; button.dataset.bindingDevice = device;
        button.setAttribute("aria-label", `${label}: change ${device === "keyboard" ? "keyboard key" : "controller button"}`);
        button.addEventListener("click", () => listen(device, id as Action, button));
        cell.append(button);
      }
      row.append(cell);
    }
    rows.append(row);
  }
  function render(): void {
    const bindings = input.bindings();
    root.querySelectorAll<HTMLButtonElement>("[data-binding]").forEach(button => {
      const action = button.dataset.binding as Action;
      button.textContent = button.dataset.bindingDevice === "keyboard"
        ? keyLabel(bindings.keyboard[action]) : PAD_LABELS[bindings.gamepad[action as PadAction]]!;
      button.disabled = listening;
    });
    cancel.disabled = !listening;
    defaults.disabled = listening;
  }
  function save(): void {
    try {
      localStorage.setItem(BINDINGS_KEY, JSON.stringify({ version: 1, ...input.bindings() }));
      status.textContent = "Controls saved on this browser.";
    } catch {
      status.textContent = "Saving unavailable — controls changed for this session only.";
    }
  }
  function listen(device: BindingDevice, action: Action, button: HTMLButtonElement): void {
    if (listening) return;
    listening = true;
    render();
    status.textContent = device === "keyboard" ? `Press a key for ${ACTIONS[action]}. Escape cancels.`
      : `Release controller buttons, then press a button for ${ACTIONS[action]}. Escape or Menu / Options cancels.`;
    input.beginCapture(device, value => {
      listening = false;
      if (value === null) status.textContent = "Remapping cancelled.";
      else {
        try { input.setBindings(rebind(input.bindings(), device, action, value)); save(); }
        catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
      }
      render();
      if (!root.hidden) button.focus();
    });
  }
  cancel.addEventListener("click", () => input.cancelCapture());
  defaults.addEventListener("click", () => { input.setBindings(copyBindings()); save(); render(); });
  render();
  return { screenChanged: (screen: string) => { if (screen !== "controls") input.cancelCapture(); } };
}
