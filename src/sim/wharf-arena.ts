import shell from "../../assets/wharf-arena/collision.json" with { type: "json" };

/** Baked from the same cut geometry as the render asset. No browser loader or
 * Three.js dependency: collisions exist before the first simulation tick. */
export const WHARF_ARENA_MESH = { vertices: shell.vertices, indices: shell.indices };
export const WHARF_ARENA_PROXIES = shell.proxies;
export const WHARF_ARENA_ENTRANCES = shell.cuts;
