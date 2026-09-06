import { COURSE_POINTS, COURSE_WALLS } from "../sim/track.ts";

export const COURSE_ASSET_NAME = "blackglass-rivergate";
export const COURSE_ASSET_VERSION = 1;
export const BLENDER_COURSE_PATH = "assets/tracks/blackglass-rivergate.glb";

/** Alignment stamp, not a security hash. Includes the road AND barrier envelope. */
export function courseFingerprint(): string {
  // Node/Chromium trig can differ in their last floating-point bits. Quantize
  // to 0.01 mm so equivalent roads produce the same stamp in both runtimes.
  const data = JSON.stringify({ points: COURSE_POINTS, walls: COURSE_WALLS },
    (_key, value: unknown) => typeof value === "number" ? Math.round(value * 1e5) : value);
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data.charCodeAt(i), 16777619);
  return `blackglass-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
