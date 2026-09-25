import { keyLabel, PAD_LABELS, type Bindings } from "../input/bindings.ts";

/** Known PlayStation pads get their own labels; unknown standard pads use A/B. */
export function padLabel(button: number, name: string | null): string {
  const labels = (PAD_LABELS[button] ?? "Menu / Options").split(" / ");
  return /playstation|dualsense|dualshock|054c/i.test(name ?? "") ? labels.at(-1)! : labels[0]!;
}

/** The symbol a hint bar shows for a menu button: the face and shoulder buttons as
 *  the pad prints them, so a hint reads at a glance where a word would be read. */
export function padGlyph(button: 0 | 1 | 2 | 3 | 4 | 5, name: string | null): string {
  return (/playstation|dualsense|dualshock|054c/i.test(name ?? "") ? ["✕", "○", "□", "△", "L1", "R1"] : ["A", "B", "X", "Y", "LB", "RB"])[button]!;
}

/** Each hint glyph (`data-hint-glyph`, design/MENUS.md), for a pad or, with none, the keyboard. */
export function hintGlyph(hint: string, pad: string | null): string {
  const padButton = ({ confirm: 0, back: 1, "action-x": 2, "action-y": 3, "section-prev": 4, "section-next": 5 } as const)[hint as "confirm"];
  if (pad) return padButton !== undefined ? padGlyph(padButton, pad)
    : ({ change: "◀ ▶", scroll: "▲ ▼", turn: "R-stick" } as Record<string, string>)[hint] ?? "";
  return ({ confirm: "Enter", back: "Esc", "action-x": "X", "action-y": "Y", "section-prev": "Q", "section-next": "E", change: "← →", scroll: "↑ ↓" } as Record<string, string>)[hint] ?? "";
}

let previousHints = "";
export function refreshControlHints(pad: string | null, bindings: Bindings): void {
  const signature = `${pad}:${bindings.keyboard.camera}:${bindings.gamepad.camera}:${bindings.keyboard.map}:${bindings.gamepad.map}`;
  if (signature === previousHints) return;
  previousHints = signature;
  const set = (selector: string, text: string) => document.querySelectorAll<HTMLElement>(selector).forEach(node => { node.textContent = text; });
  document.body.dataset.inputDevice = pad ? "pad" : "keyboard";
  document.querySelectorAll<HTMLElement>("[data-hint-glyph]").forEach(node => { node.textContent = hintGlyph(node.dataset.hintGlyph!, pad); });
  set("[data-menu-hint]", pad ? `D-pad / Stick · Navigate / ${padLabel(0, pad)} · Select / ${padLabel(1, pad)} · Back` : "Arrows · Navigate / Enter · Select / Esc · Back");
  set("#city-map-help", `${pad ? padLabel(bindings.gamepad.map, pad) : keyLabel(bindings.keyboard.map)} · Close / ${pad ? padLabel(1, pad) : "Esc"} · Back / Drag · Pan / Scroll · Zoom`);
  set("[data-pause-hint]", `${pad ? padLabel(9, pad) : "Esc"} · Resume`);
  set("[data-camera-binding]", pad ? padLabel(bindings.gamepad.camera, pad) : keyLabel(bindings.keyboard.camera));
}
