/** Art-direction controls shared by the upper shell and the modular base.
 * Stable building identity keeps colours unchanged when nearby plots are edited. */
export const BUILDING_PALETTES = [
  { name: "charcoal", wall: 0x3b4043, metal: 0x252b2f, detail: 0x626866, roof: 0x282c2d },
  { name: "weathered", wall: 0x484c4d, metal: 0x303639, detail: 0x686c6a, roof: 0x303333 },
  { name: "cement", wall: 0x4b4944, metal: 0x333431, detail: 0x6a6860, roof: 0x31312e },
] as const;
export type BuildingPalette = typeof BUILDING_PALETTES[number];
export const FACADE_BASE = 0x2b333d;

export function buildingPalette(id:string):BuildingPalette {
  let hash=2166136261;
  for(const char of id)hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return BUILDING_PALETTES[(hash>>>0)%BUILDING_PALETTES.length]!;
}
