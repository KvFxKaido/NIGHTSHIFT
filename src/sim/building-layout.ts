/** Serializable authoring data. Shared by the editor, runtime and save endpoint. */
export interface BuildingPlacement {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
}
export interface BuildingLayout {
  schema: 1;
  baseline: string;
  buildings: BuildingPlacement[];
}
export function buildingId(block: { x: number; z: number }): string {
  return `plot-${block.x.toFixed(3)}-${block.z.toFixed(3)}`;
}
/** Stable content identity for replay compatibility, independent of file whitespace. */
export function layoutFingerprint(value: unknown): string {
  let hash = 2166136261;
  for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export function parseBuildingLayout(value: unknown): BuildingLayout {
  if (!value || typeof value !== "object") throw new Error("Expected a building layout");
  const input = value as Record<string, unknown>;
  if (input.schema !== 1 || typeof input.baseline !== "string" || !Array.isArray(input.buildings) || input.buildings.length > 2000) {
    throw new Error("Unsupported building layout format");
  }
  const ids = new Set<string>();
  const buildings = input.buildings.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid building entry");
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || item.id.length > 100 || ids.has(item.id)) throw new Error("Missing or duplicate building id");
    ids.add(item.id);
    const read = (key: string, min: number, max: number) => {
      const number = item[key];
      if (typeof number !== "number" || !Number.isFinite(number) || number < min || number > max) {
        throw new Error(`${item.id}: ${key} must be between ${min} and ${max}`);
      }
      return number;
    };
    return { id: item.id, x: read("x", -1500, 1500), z: read("z", -1500, 1500),
      width: read("width", 2, 100), depth: read("depth", 2, 100), height: read("height", 2, 100),
      rotation: read("rotation", -Math.PI * 2, Math.PI * 2) };
  }).sort((a, b) => a.id.localeCompare(b.id, "en"));
  return { schema: 1, baseline: input.baseline, buildings };
}
