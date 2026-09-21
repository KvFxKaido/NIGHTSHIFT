import type { BuildingBlock } from "./building-footprint.ts";

/** Sixteen deliberate peaks, rather than stretching the entire city upward.
 * Downtown carries most of the height; Belltown and the hills get accents. */
export const SKYLINE_PEAKS = [
  [-248,-395], [-78,-171], [-110,-564], [83,-325], [227,-283],
  [-194,-692], [135,-564], [339,-564],
  [490,-615], [660,-391], [629,-258],
  [-500,-948], [-637,-1631], [-23,-1490],
  [400,-2341], [616,-1828],
] as const;

/** Applied to the generated baseline once; authored editor dimensions win. */
export function scaleAlderSkyline(blocks: readonly BuildingBlock[]): BuildingBlock[] {
  return blocks.map(block => block.height >= 40 && SKYLINE_PEAKS.some(([x,z]) => block.x === x && block.z === z)
    ? { ...block, height: block.height * 1.5 } : block);
}
