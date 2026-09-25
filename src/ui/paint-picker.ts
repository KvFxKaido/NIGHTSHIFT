import { hslOf, paintFromHsl, paintOf, type Hsl } from "../customization/customization.ts";

/**
 * Paint as a colour rather than a list (2026-09-24, which retired the five presets): hue, saturation and brightness,
 * a row each. A row's value is a slider, which the pad and the arrows nudge with left and right and a pointer drags
 * (design/MENUS.md); each track is painted with what moving along it does, and the swatch above is the colour.
 * Nothing is typed, so the pad has every colour a mouse has.
 *
 * `change` is every nudge and every pixel of a drag, to draw; `commit` is when a change is done, to save, because a
 * drag fires dozens of inputs a second and a save rewrites the address bar, which browsers rate-limit.
 */
export interface PaintPicker {
  readonly element: HTMLElement;
  /** Show `value()`, when something other than these rows changed it: another car on the platform, a link. */
  render(): void;
}

const ROWS = [
  { key: "h", label: "Hue", max: 360, step: 5, unit: "°" },
  { key: "s", label: "Saturation", max: 100, step: 2, unit: "%" },
  { key: "l", label: "Brightness", max: 100, step: 2, unit: "%" },
] as const;

/** The track under each slider: the colours it reaches from where the other two are. */
function track(key: keyof Hsl, { h, s, l }: Hsl): string {
  const at = (hue: number, sat: number, light: number) => `hsl(${hue} ${sat}% ${light}%)`;
  if (key === "h") return `linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360].map(hue => at(hue, 90, 50)).join(", ")})`;
  if (key === "s") return `linear-gradient(90deg, ${at(h, 0, l)}, ${at(h, 100, l)})`;
  return `linear-gradient(90deg, #000, ${at(h, s, 50)}, #fff)`;
}

export function createPaintPicker(options: { value(): string; change(paint: string): void; commit(): void },
  doc: Document = document): PaintPicker {
  const element = doc.createElement("div");
  element.className = "paint-picker";
  const head = doc.createElement("div");
  head.className = "paint-picker-head";
  const title = doc.createElement("span");
  title.className = "menu-row-label";
  title.textContent = "Paint";
  const swatch = doc.createElement("i");
  swatch.className = "paint-picker-swatch";
  swatch.setAttribute("aria-hidden", "true");
  const hex = doc.createElement("span");
  hex.className = "paint-picker-hex";
  head.append(title, swatch, hex);
  element.append(head);

  // The rows' own hue, saturation and brightness, kept rather than read back from the colour: in a grey the hue is
  // not in the colour at all, and brightness to black and back must not lose it.
  let hsl: Hsl = { h: 0, s: 0, l: 0 };
  let shown: string | null = null;
  const rows = ROWS.map(spec => {
    const row = doc.createElement("label");
    row.className = "menu-row paint-row";
    row.dataset.paintRow = spec.key;
    const label = doc.createElement("span");
    label.className = "menu-row-label";
    label.textContent = spec.label;
    const input = doc.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.dataset.customization = "paint";
    input.dataset.paint = spec.key;
    input.setAttribute("aria-label", `Paint ${spec.label.toLowerCase()}`);
    const readout = doc.createElement("output");
    readout.className = "paint-row-value";
    row.append(label, input, readout);
    element.append(row);
    input.addEventListener("input", () => {
      hsl = { ...hsl, [spec.key]: Number(input.value) };
      shown = paintFromHsl(hsl);
      options.change(shown);
      draw();
    });
    input.addEventListener("change", () => options.commit());
    return { spec, input, readout };
  });

  function draw(): void {
    const value = shown ?? options.value();
    const color = `#${paintOf(value).color.toString(16).padStart(6, "0")}`;
    swatch.style.setProperty("--swatch", color);
    hex.textContent = color;
    for (const { spec, input, readout } of rows) {
      input.value = String(Math.round(hsl[spec.key]));
      input.style.setProperty("--track", track(spec.key, hsl));
      readout.textContent = `${Math.round(hsl[spec.key])}${spec.unit}`;
    }
  }

  return {
    element,
    render() {
      const value = options.value();
      // Only a colour these rows did not make is read back into them.
      if (value !== shown) {
        hsl = hslOf(paintOf(value).color);
        shown = value;
      }
      draw();
    },
  };
}
