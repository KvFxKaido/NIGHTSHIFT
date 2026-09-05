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

export type CustomizationCategory = "paint" | "wheels" | "stance";

export interface CarCustomization {
  paint: string;
  wheels: string;
  stance: string;
}

export function createDefaultCustomization(): CarCustomization {
  return { paint: "signal", wheels: "graphite", stance: "street" };
}

export function updateCustomization(
  current: CarCustomization,
  category: CustomizationCategory,
  optionId: string,
): CarCustomization {
  const options = category === "paint"
    ? PAINT_OPTIONS
    : category === "wheels"
      ? WHEEL_OPTIONS
      : STANCE_OPTIONS;
  if (!options.some((option) => option.id === optionId)) return current;
  return { ...current, [category]: optionId };
}
