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
/**
 * Schema 2: authored plots as their own list. An authored placement is a
 * first-class building in world coordinates with its own id, never derived
 * from the generator's output, so regenerating the map cannot orphan it:
 * the builder reserves its footprint and the sim lets it win where a stale
 * build overlaps it. `retired` names generated plots that no longer stand —
 * deleted, or replaced by an authored plot (`authored-from-<plot id>`); an id
 * the generator no longer produces is simply ignored, because the plot is
 * gone anyway. Schema 1 keyed every edit to a generated plot id and refused
 * the whole file once one moved; it stays for the district fixture and is
 * upgraded on read for Seattle.
 */
export interface AuthoredLayout {
  schema: 2;
  authored: BuildingPlacement[];
  retired: string[];
}
export const GENERATED_ID_PREFIX = "plot-";
export const AUTHORED_ID_PREFIX = "authored-";
/** The authored id an edited generated plot takes, so an editor can pair them again. */
export const authoredFromId = (plotId: string): string => `${AUTHORED_ID_PREFIX}from-${plotId}`;
export const authoredSourceId = (id: string): string | null =>
  id.startsWith(`${AUTHORED_ID_PREFIX}from-${GENERATED_ID_PREFIX}`) ? id.slice(`${AUTHORED_ID_PREFIX}from-`.length) : null;
export const layoutHasContent = (layout: AuthoredLayout): boolean => layout.authored.length > 0 || layout.retired.length > 0;

function readPlacement(entry: unknown, ids: Set<string>): BuildingPlacement {
  if (!entry || typeof entry !== "object") throw new Error("Invalid building entry");
  const item = entry as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id.length || item.id.length > 100 || ids.has(item.id)) throw new Error("Missing or duplicate building id");
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
}

export function parseAuthoredLayout(value: unknown): AuthoredLayout {
  if (!value || typeof value !== "object") throw new Error("Expected a building layout");
  const input = value as Record<string, unknown>;
  if (input.schema !== 2 || !Array.isArray(input.authored) || !Array.isArray(input.retired) ||
      input.authored.length > 2000 || input.retired.length > 4000) {
    throw new Error("Unsupported building layout format");
  }
  const ids = new Set<string>();
  const authored = input.authored.map(entry => readPlacement(entry, ids)).sort((a, b) => a.id.localeCompare(b.id, "en"));
  for (const placement of authored) {
    if (!placement.id.startsWith(AUTHORED_ID_PREFIX)) throw new Error(`${placement.id}: an authored id starts with "${AUTHORED_ID_PREFIX}"`);
  }
  const retired = new Set<string>();
  for (const id of input.retired) {
    if (typeof id !== "string" || !id.startsWith(GENERATED_ID_PREFIX) || id.length > 100) throw new Error("Retired ids name generated plots");
    retired.add(id);
  }
  return { schema: 2, authored, retired: [...retired].sort((a, b) => a.localeCompare(b, "en")) };
}

/** A schema-1 file, every edit keyed to a generated plot, as schema 2: the
 *  edit becomes an authored plot and the plot it edited is retired. Only
 *  valid against the generation the edits were made on. */
export function upgradeBuildingLayout(layout: BuildingLayout, baseline: string): AuthoredLayout {
  if (layout.buildings.length && layout.baseline !== baseline) throw new Error("The district changed. Re-export its layout before importing these edits.");
  return { schema: 2, retired: layout.buildings.map(b => b.id),
    authored: layout.buildings.map(b => ({ ...b, id: authoredFromId(b.id) })).sort((a, b) => a.id.localeCompare(b.id, "en")) };
}

/** Whichever schema the file holds, as schema 2. */
export function parseAnyLayout(value: unknown, baseline: string): AuthoredLayout {
  const schema = value && typeof value === "object" ? (value as Record<string, unknown>).schema : undefined;
  return schema === 1 ? upgradeBuildingLayout(parseBuildingLayout(value), baseline) : parseAuthoredLayout(value);
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
