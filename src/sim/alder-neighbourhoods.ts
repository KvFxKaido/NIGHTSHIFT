/**
 * Port Alder's neighbourhoods, as polygons in game metres (x east, z south).
 *
 * The data carried four map labels and nothing that said where one place ends
 * and the next begins, so every district rule in design/LOOK.md had nothing to
 * read. Boundaries run along street centrelines, so a street's two sides can
 * belong to different places and a building belongs to the one its centre is in:
 *
 * - Union Commons' east edge (x = 300) separates Queen Anne from Capitol Hill,
 *   so both sides of Broadway are on the Hill; north of the park, Galer Terrace
 *   and Broadway do.
 * - Uptown Link and Mercer separate Queen Anne from Belltown.
 * - Denny East is Belltown's edge east of the downtown grid; a cross line through
 *   the grid, between its two groups of cross streets, separates Belltown from
 *   Alder Center.
 * - Pike Passage and Pine East are Capitol Hill's south edge, so Pike/Pine is on
 *   the strip, and Pine East is Alder Center's east edge.
 * - Madrona Drive is Madrona Ridge's west edge, all the way down.
 * - 6th Ave S and z = -60 separate SoDo, with the port, from Alder Center and
 *   the Central District.
 *
 * Authored 2026-09-17 from the street data, not from Seattle's real boundaries:
 * the hill districts were hand-authored, so real boundaries would not line up.
 * Presentation reads this (the night dressing, the maps' names, the name on
 * screen as you cross in); nothing in the simulation does.
 */

export type AlderNeighbourhoodId = "sodo" | "alder-center" | "belltown" | "queen-anne"
  | "capitol-hill" | "central-district" | "madrona-ridge";

export interface AlderNeighbourhood {
  readonly id: AlderNeighbourhoodId;
  readonly name: string;
  readonly polygon: readonly (readonly [number, number])[];
  /** Where the maps print its name. The four hill labels are the data's own
   *  (`ALDER_DATA.neighborhoods`, which the rival turfs also read); Belltown's
   *  is where the map board always printed it; SoDo's and Alder Center's are
   *  new, since neither had a name on any map. */
  readonly label: readonly [number, number];
}

export const ALDER_NEIGHBOURHOODS: readonly AlderNeighbourhood[] = [
  { id: "sodo", name: "SoDo", label: [-250, 420], polygon: [
    [-1250, -60], [333, -60], [350, 312], [349, 658], [349, 1012], [349, 1250], [-1250, 1250]] },
  { id: "alder-center", name: "Alder Center", label: [-60, -560], polygon: [
    [-1250, -400], [-760, -400], [-440, -720], [20, -1180], [100, -1165], [240, -1140], [620, -1150],
    [650, -840], [420, -610], [258, -343], [333, -206], [333, -60], [-1250, -60]] },
  { id: "belltown", name: "Belltown", label: [-305, -965], polygon: [
    [-1250, -1650], [-1040, -1650], [-820, -1690], [-580, -1650], [-330, -1550], [-100, -1530], [420, -1530],
    [540, -1340], [620, -1150], [240, -1140], [100, -1165], [20, -1180], [-440, -720], [-760, -400], [-1250, -400]] },
  { id: "queen-anne", name: "Queen Anne", label: [-730, -2550], polygon: [
    [-1250, -3150], [700, -3150], [700, -2800], [450, -2560], [304, -2535], [300, -1530],
    [-100, -1530], [-330, -1550], [-580, -1650], [-820, -1690], [-1040, -1650], [-1250, -1650]] },
  { id: "capitol-hill", name: "Capitol Hill", label: [990, -2070], polygon: [
    [700, -3150], [1600, -3150], [1600, -2630], [1600, -2260], [1640, -2050], [1650, -1740], [1650, -1280],
    [1620, -930], [1170, -850], [940, -640], [710, -720], [650, -840], [620, -1150], [540, -1340], [420, -1530],
    [300, -1530], [304, -2535], [450, -2560], [700, -2800]] },
  { id: "central-district", name: "Central District", label: [1430, -140], polygon: [
    [650, -840], [710, -720], [940, -640], [1170, -850], [1620, -930], [1620, -550], [1551, -228], [1490, 60],
    [1510, 330], [1540, 650], [1540, 1250], [349, 1250], [349, 1012], [349, 658], [350, 312], [333, -60],
    [333, -206], [258, -343], [420, -610]] },
  { id: "madrona-ridge", name: "Madrona Ridge", label: [2230, -1520], polygon: [
    [1600, -3150], [2750, -3150], [2750, 1250], [1540, 1250], [1540, 650], [1510, 330], [1490, 60],
    [1551, -228], [1620, -550], [1620, -930], [1650, -1280], [1650, -1740], [1640, -2050], [1600, -2260], [1600, -2630]] },
];

function inside(polygon: readonly (readonly [number, number])[], x: number, z: number): boolean {
  let within = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i]!, [xj, zj] = polygon[j]!;
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) within = !within;
  }
  return within;
}

/** Every neighbourhood containing the point: one inside the city, none past its edge. */
export function alderNeighbourhoodsAt(x: number, z: number): AlderNeighbourhood[] {
  return ALDER_NEIGHBOURHOODS.filter(n => inside(n.polygon, x, z));
}

export function alderNeighbourhoodAt(x: number, z: number): AlderNeighbourhood | null {
  return alderNeighbourhoodsAt(x, z)[0] ?? null;
}
