import shell from "../../assets/wharf-arena/closed-collision.json" with { type: "json" };

/** The original continuous perimeter, baked before the city's entrance cuts.
 * Rendering and physics use these same triangles, including the restored walls. */
export const STADIUM_SHELL_MESH = { vertices: shell.vertices, indices: shell.indices };
