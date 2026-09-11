import { keyLabel, PAD_LABELS, type Bindings } from "../input/bindings.ts";

/** Known PlayStation pads get their own labels; unknown standard pads use A/B. */
export function padLabel(button: number, name: string | null): string {
  const labels = (PAD_LABELS[button] ?? "Menu / Options").split(" / ");
  return /playstation|dualsense|dualshock|054c/i.test(name ?? "") ? labels.at(-1)! : labels[0]!;
}

let previousHints = "";
export function refreshControlHints(pad: string | null, bindings: Bindings): void {
  const signature = `${pad}:${bindings.keyboard.camera}:${bindings.gamepad.camera}:${bindings.keyboard.map}:${bindings.gamepad.map}`;
  if (signature === previousHints) return;
  previousHints = signature;
  const set = (selector: string, text: string) => document.querySelectorAll<HTMLElement>(selector).forEach(node => { node.textContent = text; });
  set("[data-menu-hint]", pad ? `D-pad / Stick · Navigate / ${padLabel(0, pad)} · Select / ${padLabel(1, pad)} · Back` : "Arrows · Navigate / Enter · Select / Esc · Back");
  set("#city-map-help", `${pad ? padLabel(bindings.gamepad.map, pad) : keyLabel(bindings.keyboard.map)} · Close / ${pad ? padLabel(1, pad) : "Esc"} · Back / Drag · Pan / Scroll · Zoom`);
  set("[data-pause-hint]", `${pad ? padLabel(9, pad) : "Esc"} · Resume`);
  set("[data-camera-binding]", pad ? padLabel(bindings.gamepad.camera, pad) : keyLabel(bindings.keyboard.camera));
}
