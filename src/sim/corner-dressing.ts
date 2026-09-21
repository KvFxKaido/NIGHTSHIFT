import { blockCorners, type BuildingBlock } from "./building-footprint.ts";

export type CornerKind = "planter" | "terrace" | "freight";
export interface CornerSite {
  readonly id: string;
  readonly name: string;
  readonly kind: CornerKind;
  readonly junction: readonly [number, number];
  /** The two street arms facing the dressed parcel, for driving checks. */
  readonly arms: readonly [string, string];
  readonly x: number;
  readonly z: number;
  /** Footprint convention: local +Z faces the junction. */
  readonly rotation: number;
}
export interface CornerProp {
  readonly id: string;
  readonly site: string;
  readonly kind: CornerKind;
  readonly form: "edge" | "crate";
  readonly solid: BuildingBlock;
}

/** Eight authored parcel corners, not a rule that fences every intersection.
 * The front sits beyond the 2.8 m pavement, leaving the shallow apex usable.
 * Short returns make each group a landscaped pocket or a working yard edge. */
export const CORNER_SITES: readonly CornerSite[] = [
  { id: "harbor-yard", name: "Harbor Way / 1st Ave S", kind: "freight", junction: [-9, 780],
    arms: ["sea-0", "sea-29"], x: -30.25, z: 799.73, rotation: -2.31922 },
  { id: "holgate-yard", name: "Holgate / 4th Ave S", kind: "freight", junction: [215, 658],
    arms: ["sea-50", "sea-52"], x: 234.8, z: 638.2, rotation: .7854 },
  { id: "pike-planters", name: "Pike / 2nd", kind: "planter", junction: [-213, -628],
    arms: ["sea-9", "sea-12"], x: -218.31, z: -605.62, rotation: -2.90851 },
  { id: "union-planters", name: "Union / 4th", kind: "planter", junction: [-77, -625],
    arms: ["sea-15", "sea-22"], x: -83.11, z: -599.73, rotation: -2.90428 },
  { id: "madison-planters", name: "Madison / 1st", kind: "planter", junction: [-97, -373],
    arms: ["sea-10", "sea-21"], x: -91.41, z: -397.37, rotation: .22562 },
  { id: "highland-terrace", name: "Highland / Taylor Terrace", kind: "terrace", junction: [-560, -1910],
    arms: ["sea-east-6", "sea-east-12"], x: -544.21, z: -1888.1, rotation: 2.51707 },
  { id: "broadway-terrace", name: "Broadway / Highland", kind: "terrace", junction: [430, -1950],
    arms: ["sea-east-13", "sea-east-42"], x: 410.36, z: -1926.02, rotation: -2.45533 },
  { id: "olive-terrace", name: "Olive / Denny East", kind: "terrace", junction: [950, -1200],
    arms: ["sea-east-36", "sea-east-98"], x: 961.87, z: -1179.14, rotation: 2.62428 },
];

export function createCornerProps(heightAt: (x: number, z: number) => number): CornerProp[] {
  const props: CornerProp[] = [];
  for (const site of CORNER_SITES) {
    const c = Math.cos(site.rotation), s = Math.sin(site.rotation);
    const depth = site.kind === "planter" ? 3 : 1.4;
    const height = site.kind === "terrace" ? 1.15 : 1.0;
    function add(id: string, x: number, z: number, width: number, depth: number, rise = height, form: CornerProp["form"] = "edge"): void {
      const footprint = { x: site.x + x * c - z * s, z: site.z + x * s + z * c,
        width, depth, rotation: site.rotation, height, base: 0 };
      const ground = blockCorners(footprint).map(p => heightAt(p.x, p.z));
      const base = Math.min(...ground) - .04;
      // Four-metre front sections step with the hillside. The whole visible
      // masonry mass is solid, from the lowest foot to the level coping.
      props.push({ id: `${site.id}-${id}`, site: site.id, kind: site.kind, form,
        solid: { ...footprint, base, height: Math.max(...ground) + rise - base } });
    }
    for (let part = 0; part < 3; part++) add(`front-${part}`, (part - 1) * 4, 0, 3.92, depth);
    const returnDepth = site.kind === "freight" ? 4 : 5.5;
    for (const side of [-1, 1]) add(`return-${side}`, side * (6 - depth / 2), -(depth + returnDepth) / 2,
      depth, returnDepth);
    if (site.kind === "freight") add("storage", 0, -3, 2.6, 2.2, 1.6, "crate");
  }
  return props;
}
