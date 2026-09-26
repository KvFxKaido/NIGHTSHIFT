import shell from "../../assets/wharf-arena/closed-collision.json" with { type: "json" };

/** The city and venue share the continuous shell and its render asset. No browser loader or
 * Three.js dependency: collisions exist before the first simulation tick. */
export { STADIUM_SHELL_MESH as WHARF_ARENA_MESH } from "./stadium-shell.ts";
export const WHARF_ARENA_PROXIES = shell.proxies;
