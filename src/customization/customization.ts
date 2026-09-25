export interface PaintOption {
  id: string;
  name: string;
  color: number;
  roughness: number;
  metalness: number;
}

export interface WheelOption {
  id: string;
  name: string;
  color: number;
  roughness: number;
  metalness: number;
}

export interface StanceOption {
  id: string;
  name: string;
  bodyOffset: number;
  wheelInset: number;
}

/**
 * The presets paint was chosen from until 2026-09-24, when the garage took a colour picker instead. They stay as
 * named paints, with their own finishes, so saves, slots and `?paint=ice` links from before still read.
 */
export const PAINT_OPTIONS: readonly PaintOption[] = [
  { id: "signal", name: "Signal Red", color: 0xa80d2f, roughness: 0.2, metalness: 0.72 },
  { id: "blackglass", name: "Blackglass", color: 0x111722, roughness: 0.16, metalness: 0.82 },
  { id: "sodium", name: "Sodium Gold", color: 0xc47a18, roughness: 0.27, metalness: 0.68 },
  { id: "ice", name: "Ice White", color: 0xd8dde2, roughness: 0.22, metalness: 0.62 },
  { id: "ultraviolet", name: "Ultraviolet", color: 0x4a2378, roughness: 0.18, metalness: 0.76 },
];

export const WHEEL_OPTIONS: readonly WheelOption[] = [
  { id: "graphite", name: "Graphite", color: 0x252a31, roughness: 0.3, metalness: 0.88 },
  { id: "alloy", name: "Bright Alloy", color: 0xb7c0c8, roughness: 0.2, metalness: 0.94 },
  { id: "white", name: "Chalk White", color: 0xd7d5ca, roughness: 0.38, metalness: 0.55 },
];

// Lowering spends the tyre-to-arch gap, so the largest drop must stay inside
// CAR_GEOMETRY.archClearance (0.1 m) or the wheels cut through the fenders.
// Slammed leaves roughly 25 mm of daylight, which is what sells the stance.
export const STANCE_OPTIONS: readonly StanceOption[] = [
  { id: "street", name: "Street", bodyOffset: 0, wheelInset: 0 },
  { id: "low", name: "Low", bodyOffset: -0.04, wheelInset: 0.02 },
  { id: "slammed", name: "Slammed", bodyOffset: -0.075, wheelInset: 0.035 },
];

export const BODY_KIT_OPTIONS = [
  { id: "stock", name: "Stock" },
  { id: "street", name: "Street kit" },
  { id: "race", name: "Race kit" },
] as const;
export const WHEEL_DESIGN_OPTIONS = [
  { id: "stock", name: "Factory five" },
  { id: "six", name: "Six spoke" },
  { id: "mesh", name: "Split ten" },
] as const;
export const SPOILER_OPTIONS = [
  { id: "none", name: "Clean trunk" }, { id: "stock", name: "Factory lip" },
  { id: "street", name: "Ducktail" }, { id: "wing", name: "Race wing" },
] as const;
// Opaque stylized glass: vary its surface, not transparency into an unauthored cabin.
export const TINT_OPTIONS = [
  { id: "stock", name: "Factory", color: 0x111d2c, roughness: .16, metalness: .60 },
  { id: "smoke", name: "Smoke", color: 0x091018, roughness: .24, metalness: .30 },
  { id: "dark", name: "Midnight", color: 0x030609, roughness: .32, metalness: .12 },
] as const;
export const CUSTOMIZATION_OPTIONS = {
  paint: PAINT_OPTIONS, wheels: WHEEL_OPTIONS, stance: STANCE_OPTIONS,
  bodyKit: BODY_KIT_OPTIONS, wheelDesign: WHEEL_DESIGN_OPTIONS,
  front: BODY_KIT_OPTIONS, skirts: BODY_KIT_OPTIONS, rear: BODY_KIT_OPTIONS,
  spoiler: SPOILER_OPTIONS, tint: TINT_OPTIONS,
};
export type CustomizationCategory = keyof typeof CUSTOMIZATION_OPTIONS;
export const CUSTOMIZATION_CATEGORIES = Object.keys(CUSTOMIZATION_OPTIONS) as CustomizationCategory[];
export const BODY_PRESET_CATEGORIES: CustomizationCategory[] = ["bodyKit", "front", "skirts", "rear", "spoiler"];

export interface CarCustomization {
  paint: string;
  wheels: string;
  stance: string;
  /** Missing on older saves means factory parts. Currently authored for Cinder. */
  bodyKit?: string;
  wheelDesign?: string;
  front?: string;
  skirts?: string;
  rear?: string;
  spoiler?: string;
  tint?: string;
}

/** A picked paint: `#rrggbb`, lower case. */
const PAINT_HEX = /^#[0-9a-f]{6}$/;
/** The finish a picked colour is laid in: the presets' metallic, between Signal Red's and Ice White's. */
export const PAINT_FINISH = { roughness: 0.2, metalness: 0.7 } as const;

/** Whether `value` is something `category` may be: one of its options, or for paint a picked colour too. */
export function isCustomizationValue(category: CustomizationCategory, value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (category === "paint" && PAINT_HEX.test(value)) return true;
  return CUSTOMIZATION_OPTIONS[category].some(option => option.id === value);
}

/** What a paint value draws as: a named paint's own colour and finish, or a picked colour in `PAINT_FINISH`. */
export function paintOf(value: string): { color: number; roughness: number; metalness: number } {
  if (PAINT_HEX.test(value)) return { color: Number.parseInt(value.slice(1), 16), ...PAINT_FINISH };
  return PAINT_OPTIONS.find(option => option.id === value) ?? PAINT_OPTIONS[0]!;
}

/** Hue in degrees, saturation and lightness in percent: what the garage's three paint rows are. */
export interface Hsl { h: number; s: number; l: number }

export function hslOf(color: number): Hsl {
  const r = (color >> 16 & 255) / 255, g = (color >> 8 & 255) / 255, b = (color & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

export function paintFromHsl({ h, s, l }: Hsl): string {
  const sat = Math.min(100, Math.max(0, s)) / 100, light = Math.min(100, Math.max(0, l)) / 100;
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * light - 1)) * sat, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), m = light - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Resolve old whole-kit saves and new individual parts through one catalog. */
export function customizationOption(current: CarCustomization, category: CustomizationCategory): string {
  const kit = BODY_KIT_OPTIONS.some(option => option.id === current.bodyKit) ? current.bodyKit! : "stock";
  const fallback = category === "front" || category === "skirts" || category === "rear" ? kit
    : category === "spoiler" ? (kit === "race" ? "wing" : kit) : CUSTOMIZATION_OPTIONS[category][0]!.id;
  const value = current[category] ?? fallback;
  return isCustomizationValue(category, value) ? value : fallback;
}

export function bodyPresetIsMixed(current: CarCustomization): boolean {
  const kit = customizationOption(current, "bodyKit");
  return ["front", "skirts", "rear"].some(slot => customizationOption(current, slot as CustomizationCategory) !== kit)
    || customizationOption(current, "spoiler") !== (kit === "race" ? "wing" : kit);
}

export function createDefaultCustomization(): CarCustomization {
  return { paint: "signal", wheels: "graphite", stance: "street" };
}

export function updateCustomization(
  current: CarCustomization,
  category: CustomizationCategory,
  optionId: string,
): CarCustomization {
  if (!isCustomizationValue(category, optionId)) return current;
  if (category === "bodyKit") return { ...current, bodyKit: optionId, front: optionId,
    skirts: optionId, rear: optionId, spoiler: optionId === "race" ? "wing" : optionId };
  return { ...current, [category]: optionId };
}
