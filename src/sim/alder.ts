import { DRIFT_YARD, YARD_RESERVE, YARD_STRUCTURES } from "./drift-yard.ts";
import landmarks from "./alder-landmarks.json" with { type: "json" };
import terrain from "./alder-terrain.json" with { type: "json" };
import data from "./alder-data.json" with { type: "json" };
import { projectOntoPath, type Street } from "./street-path.ts";
import { buildStreetTrafficNetwork } from "./street-traffic.ts";
import { buildingId, layoutFingerprint, layoutHasContent, parseAnyLayout, type AuthoredLayout, type BuildingPlacement } from "./building-layout.ts";
import { blockCorners, blockPenetration, pointFootprintDistance, segmentFootprintDistance, spatialIndex, type BuildingBlock } from "./building-footprint.ts";
import authoredLayout from "./alder-layout.json" with { type: "json" };
import type { CourseProjection } from "./track.ts";
import type { RoadWorld } from "./road-world.ts";
import type { TrafficNetwork } from "./traffic.ts";
import type { RaceDefinition, RaceKind } from "./race.ts";
import type { RivalDefinition } from "./rival.ts";
import { buildRoutingGraph, type RoutingGraph } from "./route-choice.ts";
import { generateRaceFrom, withRaceKind, rivalLineFor, type GeneratedRace, type Turf } from "./race-generator.ts";
import { createEvergreens } from "./alder-evergreens.ts";
import { kerbPoses, ALDER_LAMPS, ALDER_BINS, type KerbPose } from "./kerb-props.ts";
import { ARENA, ARENA_ACCESS, ARENA_BOUNDS, ARENA_LAYOUT_IDS, arenaLap, nearArena } from "./arena.ts";
import type { CoursePoint } from "./track.ts";
import { createCornerProps } from "./corner-dressing.ts";
import { marketUtilities, onMarketPaving } from "./market-block.ts";
import { scaleAlderSkyline } from "./alder-skyline.ts";
import { frontagePavingQuery } from "./building-fronts.ts";
import savedFrontages from "./alder-frontages.json" with { type: "json" };
import { parseFrontageDocument, frontageSurfaceFingerprint } from "./frontage-document.ts";
import { checkedFrontages, type FrontageContext } from "./frontage-generator.ts";
import { marketBuilding } from "./market-block.ts";

export const ALDER_FRONTAGE_DOCUMENT = parseFrontageDocument(savedFrontages);
export const ALDER_DATA = { ...data, version: `${data.version}-evergreens-v1-broadcast-v1-drift-yard-v1-arena-v1-corners-v1-market-v1-scale-v1-fronts-v2-${frontageSurfaceFingerprint(ALDER_FRONTAGE_DOCUMENT.entries.map(e=>e.plan))}` };
export const ALDER_TREES: readonly BuildingBlock[] = data.trees;
const garageBuilding: BuildingBlock = {x:34,z:910,width:32,depth:24,height:10,base:2,rotation:-Math.PI/2};
export const ALDER_GARAGE = {id:"wharf-garage",name:"Wharf Garage",building:garageBuilding,
  entrance:{x:17,y:2,z:910,heading:0,pitch:0}};
/** Clear of the shutter, nose pointing out across the forecourt toward the street. */
export const ALDER_GARAGE_EXIT = {x:13,y:2,z:910,heading:Math.PI/2,pitch:0};
export const GARAGE_PLOT_ID = buildingId(garageBuilding);
/** The paved apron in front of Wharf Garage (drawn as `garage-forecourt`). */
export const ALDER_FORECOURT: BuildingBlock = {x:11.5,z:910,width:21,depth:40,height:1,base:2,rotation:0};
export const GENERATED_ALDER_BLOCKS: readonly BuildingBlock[] = [...scaleAlderSkyline(data.buildings),garageBuilding];
export const ALDER_LAYOUT_BASELINE = layoutFingerprint(GENERATED_ALDER_BLOCKS.map(block=>
  Object.fromEntries(Object.entries(block).map(([key,value])=>[key,Math.round(value*1000)/1000]))));
export function alderHeight(x: number, z: number): number {
  const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t*t*(3-2*t); };
  let height = 2 + 34 * smooth((x + 50) / 640) * smooth((330 - z) / 500);
  // Compact support keeps the released southwest's surface unchanged. Cubic
  // falloff reaches zero with continuous slope/curvature at each hill's edge.
  for (const hill of terrain.hills) {
    const r2 = ((x-hill.x)/hill.rx)**2 + ((z-hill.z)/hill.rz)**2;
    if (r2 < 1) height += hill.rise * (1-r2)**3;
  }
  return height;
}
export const ALDER_CORNER_PROPS = createCornerProps(alderHeight);
export const ALDER_CORNER_SOLIDS = ALDER_CORNER_PROPS.map(prop => prop.solid);
export const ALDER_MARKET_UTILITIES = marketUtilities(alderHeight);
export const ALDER_STREETS: readonly Street[] = data.roads.map(road => ({
  id: road.id, name: road.name, from: road.from, to: road.to,
  // An 8 m alley is the lane model's alley class: one lane each way, no divider.
  added: road.sourceId === null, kind: road.width >= 20 ? "arterial" : road.width <= 10 ? "alley" : road.width <= 14 ? "local" : "collector",
  points: road.points.map(([x, z]) => ({ x: x!, z: z!, y: alderHeight(x!, z!), width: road.width,
    zone: z! > 250 ? "freight" : x! < -270 ? "waterfront" : "old-quarter" })),
}));
/**
 * The circuit's paved paths with their height: each layout's lap as a closed
 * polyline, and the access road. They are not streets: no traffic, no routing,
 * no kerb props. They are surface, so the car rides them, and they are paved,
 * so they are not ground.
 */
export const ARENA_ROADS: readonly { readonly id: string; readonly name: string; readonly points: readonly CoursePoint[] }[] = [
  ...ARENA_LAYOUT_IDS.map(id => {
    const lap = arenaLap(id);
    return { id: `arena-${id}`, name: `${ARENA.name} / ${lap.layout.name}`,
      points: [...lap.points, lap.points[0]!].map(p => ({ x: p.x, z: p.z, y: alderHeight(p.x, p.z), width: ARENA.width, zone: "boulevard" as const })) };
  }),
  { id: "arena-access", name: `${ARENA.name} access`, points: Array.from({ length: 22 }, (_, i) => {
    const x = ARENA_ACCESS.from.x + (ARENA_ACCESS.to.x - ARENA_ACCESS.from.x) * i / 21, z = ARENA_ACCESS.from.z + (ARENA_ACCESS.to.z - ARENA_ACCESS.from.z) * i / 21;
    return { x, z, y: alderHeight(x, z), width: ARENA_ACCESS.width, zone: "boulevard" as const };
  }) },
];
/** Where a car can be and still be in Port Alder: the building area, widened to take in the circuit.
 *  [minX, minZ, maxX, maxZ], the order `ALDER_DATA.bounds` uses. */
export const ALDER_DRIVE_BOUNDS: readonly [number, number, number, number] = [data.bounds[0]!, Math.min(data.bounds[1]!, ARENA_BOUNDS.minZ - 60),
  Math.max(data.bounds[2]!, ARENA_BOUNDS.maxX + 60), Math.max(data.bounds[3]!, ARENA_BOUNDS.maxZ + 60)];
const bounds = [...ALDER_STREETS, ...ARENA_ROADS].map(street => ({ street,
  minX: Math.min(...street.points.map(p=>p.x)), maxX: Math.max(...street.points.map(p=>p.x)),
  minZ: Math.min(...street.points.map(p=>p.z)), maxZ: Math.max(...street.points.map(p=>p.z)) }));
export function projectOntoAlder(x: number, z: number): CourseProjection {
  let best: CourseProjection | undefined;
  for (const box of bounds) {
    const dx = Math.max(box.minX-x, 0, x-box.maxX), dz = Math.max(box.minZ-z, 0, z-box.maxZ);
    if (best && dx*dx+dz*dz > best.distance*best.distance) continue;
    const on = projectOntoPath(box.street.points, x, z);
    if (!best || on.distance < best.distance) best = on;
  }
  const road = best!;
  // The surface is a continuous landform, independent of which street wins
  // nearest-path selection. Kerb crossings cannot switch elevation profiles.
  const { gradeX: dx, gradeZ: dz } = alderGrade(x, z);
  return { ...road, height: alderHeight(x,z), pitch: Math.atan(dx*road.ux+dz*road.uz), gradeX: dx, gradeZ: dz };
}
/** The landform's slope at a point: rise per metre east and south. */
export function alderGrade(x: number, z: number): { gradeX: number; gradeZ: number } {
  return { gradeX: (alderHeight(x+.1,z)-alderHeight(x-.1,z))/.2, gradeZ: (alderHeight(x,z+.1)-alderHeight(x,z-.1))/.2 };
}
const startSegment = ALDER_STREETS.filter(street=>street.name==='1St Ave S')
  .flatMap(street=>street.points.slice(1).map((b,i)=>({a:street.points[i]!,b})))
  .filter(({a,b})=>Math.abs(b.z-a.z)>Math.abs(b.x-a.x)*2 && Math.hypot(b.x-a.x,b.z-a.z)>60)
  .sort((a,b)=>(b.a.z+b.b.z)-(a.a.z+a.b.z))[0]!;
const startPoint = {x:(startSegment.a.x+startSegment.b.x)/2,z:(startSegment.a.z+startSegment.b.z)/2};
const startOn = projectOntoPath([startSegment.a,startSegment.b], startPoint.x, startPoint.z);
// Begin travelling north in the industrial district, on the right-hand lane.
const northHeading = startOn.uz > 0 ? Math.atan2(startOn.ux,startOn.uz) : Math.atan2(-startOn.ux,-startOn.uz);
const start = { x: startPoint.x + Math.cos(northHeading)*4.5, z: startPoint.z - Math.sin(northHeading)*4.5,
  y: alderHeight(startPoint.x,startPoint.z), heading: northHeading, pitch: 0 };

export function groundBuilding(placement: Omit<BuildingPlacement,"id">): BuildingBlock {
  const shape={...placement,base:0};
  return {...shape,base:Math.round(Math.min(alderHeight(shape.x,shape.z),...blockCorners(shape).map(p=>alderHeight(p.x,p.z)))*1000)/1000};
}
export interface ResolvedLayout {
  /** The layout as schema 2, whichever schema was read. */
  layout: AuthoredLayout;
  blocks: readonly BuildingBlock[];
  /** Every standing building, with its id and where it came from. */
  entries: readonly { id: string; source: "generated" | "authored"; block: BuildingBlock }[];
  /** Generated plots dropped because an authored plot stands on them: authored wins,
   *  so a build that predates the authored plot still loads. */
  displaced: readonly string[];
  issues: string[];
}
/**
 * Compose the map's buildings: the generated plots less those retired or
 * displaced, then the authored plots. Placement rules are checked on the
 * authored plots only; the generated ones were placed by the builder under
 * the same rules. `generated` is a parameter so a test can regenerate the map
 * under a layout and watch the authored plots stand.
 */
export function resolveAlderLayout(value:unknown, generated:readonly BuildingBlock[]=GENERATED_ALDER_BLOCKS): ResolvedLayout {
  const layout=parseAnyLayout(value,ALDER_LAYOUT_BASELINE);
  const retired=new Set(layout.retired);
  if(retired.has(GARAGE_PLOT_ID))throw Error("Wharf Garage is fixed in this editor version");
  const authored=layout.authored.map(({id:_id,...placement})=>groundBuilding(placement));
  const forecourt=ALDER_FORECOURT;
  const entries:{id:string;source:"generated"|"authored";block:BuildingBlock}[]=[];
  const displaced:string[]=[];
  for(const block of generated){
    const id=buildingId(block);
    if(retired.has(id))continue;
    if(id!==GARAGE_PLOT_ID&&authored.some(other=>blockPenetration(block,other)>.01)){displaced.push(id);continue;}
    entries.push({id,source:"generated",block});
  }
  const issues:string[]=[];
  layout.authored.forEach((placement,index)=>{
    const block=authored[index]!, id=placement.id;
    if(ALDER_STREETS.some(street=>street.points.slice(1).some((b,i)=>
      segmentFootprintDistance(block,street.points[i]!,b)<Math.max(b.width,street.points[i]!.width)/2+2.8)))issues.push(`${id}: overlaps a road or its pavement`);
    if (blockPenetration(block, YARD_RESERVE) > 0) issues.push(`${id}: overlaps South Wharf Yard`);
    if(blockPenetration(block,landmarks.broadcastTower)>0)issues.push(`${id}: overlaps the Broadcast Tower`);
    if(ALDER_TREES.some(tree=>blockPenetration(block,tree)>0))issues.push(`${id}: overlaps a park tree`);
    if(blockPenetration(block,forecourt)>0)issues.push(`${id}: blocks the garage entrance`);
    if(blockPenetration(block,garageBuilding)>0)issues.push(`${id}: overlaps Wharf Garage`);
    if(ALDER_CORNER_SOLIDS.some(prop=>blockPenetration(block,prop)>0))issues.push(`${id}: overlaps corner landscaping`);
    if(ALDER_MARKET_UTILITIES.some(prop=>blockPenetration(block,prop)>0))issues.push(`${id}: overlaps Market service utilities`);
    if(blockCorners(block).some(p=>p.x<data.shore+2||p.x>data.bounds[2]!||p.z<data.bounds[1]!||p.z>data.bounds[3]!))issues.push(`${id}: outside the map's building area`);
    if(authored.some((other,j)=>j!==index&&blockPenetration(block,other)>.01))issues.push(`${id}: overlaps another authored building`);
    if(Math.max(...blockCorners(block).map(p=>alderHeight(p.x,p.z)))-block.base>4.1)issues.push(`${id}: ground changes by more than four metres across the footprint`);
    entries.push({id,source:"authored",block});
  });
  return {layout,blocks:entries.map(entry=>entry.block),entries,displaced,issues};
}
const resolvedLayout=resolveAlderLayout(authoredLayout);
if(resolvedLayout.issues.length)throw Error(`Invalid Port Alder layout:\n${resolvedLayout.issues.join("\n")}`);
export const ALDER_BLOCKS=resolvedLayout.blocks;
const evergreensForBlocks = (blocks:readonly BuildingBlock[]) => createEvergreens([...ALDER_STREETS, ...ARENA_ROADS],
  [...blocks, ...YARD_STRUCTURES, YARD_RESERVE, landmarks.broadcastTower, ...ALDER_TREES, ...ALDER_CORNER_SOLIDS,
    { x: 6.5, z: 910, width: 35, depth: 44, height: 1, base: 2, rotation: 0 }], alderHeight);
export const ALDER_EVERGREENS = evergreensForBlocks(ALDER_BLOCKS);
/** One collision list for the player, rivals, grass exclusions and line clearance. */
export const ALDER_SOLIDS = [...ALDER_BLOCKS, ...YARD_STRUCTURES, landmarks.broadcastTower, ...ALDER_TREES,
  ...ALDER_EVERGREENS.map(tree => tree.trunk), ...ALDER_CORNER_SOLIDS, ...ALDER_MARKET_UTILITIES];
export const ALDER_FRONTAGE_CONTEXT: FrontageContext = {
  sites: resolvedLayout.entries, streets: ALDER_STREETS, heightAt: alderHeight,
  obstacles: ALDER_SOLIDS.filter(b=>!ALDER_BLOCKS.includes(b)),
  protectedIds: new Set(resolvedLayout.entries.filter(s=>s.id===GARAGE_PLOT_ID||marketBuilding(s.block)).map(s=>s.id)),
};
/** Authoring validates against the same trees and solids that a reload will use. */
export function frontageContextForLayout(value:unknown): FrontageContext {
  const layout=resolveAlderLayout(value);
  return {...ALDER_FRONTAGE_CONTEXT,sites:layout.entries,
    obstacles:[...YARD_STRUCTURES,landmarks.broadcastTower,...ALDER_TREES,...ALDER_CORNER_SOLIDS,...ALDER_MARKET_UTILITIES,
      ...evergreensForBlocks(layout.blocks).map(t=>t.trunk)],
    protectedIds:new Set(layout.entries.filter(s=>s.id===GARAGE_PLOT_ID||marketBuilding(s.block)).map(s=>s.id)),
  };
}
const resolvedFrontages = checkedFrontages(ALDER_FRONTAGE_DOCUMENT, ALDER_FRONTAGE_CONTEXT);
export const ALDER_BUILDING_FRONTS = resolvedFrontages.plans;
export const ALDER_FRONTAGE_ISSUES = resolvedFrontages.issues;
const onFrontagePaving = frontagePavingQuery(ALDER_BUILDING_FRONTS);
/** Props that belong to the street rather than to a parcel. The lamps are the
 *  rule the renderer used to apply inline; the bins are the second consumer,
 *  which is how the anchor earns its keep. Neither collides: they are dressing
 *  until something puts them in `solids` on purpose. */
export const ALDER_LAMP_POSES = kerbPoses(ALDER_STREETS, ALDER_LAMPS);
/** Metres inland of the seawall's line that its lamps stand: clear of the wall's face. */
export const SEAWALL_LAMP_SETBACK = 1.5;
/**
 * The seawall's lamps (design/LOOK.md, "Dark is allowed, and it has an edge"):
 * the street lamp itself, at the street lamps' spacing, along the land side of
 * the seawall for its whole length, its pool falling inland. No road comes
 * within 116 m of the water, so without them the city ended in void.
 */
export const ALDER_SEAWALL_LAMP_POSES: readonly KerbPose[] = Array.from(
  { length: Math.floor((data.bounds[3]! - data.bounds[1]! - ALDER_LAMPS.spacing / 2) / ALDER_LAMPS.spacing) + 1 },
  (_, i) => ({ street: "seawall", x: data.shore + SEAWALL_LAMP_SETBACK,
    z: data.bounds[1]! + ALDER_LAMPS.spacing / 2 + i * ALDER_LAMPS.spacing, outX: -1, outZ: 0, heading: Math.PI / 2 }));
export const ALDER_BIN_POSES = kerbPoses(ALDER_STREETS, ALDER_BINS,
  [...ALDER_SOLIDS, YARD_RESERVE]);
export const ALDER_LAYOUT=resolvedLayout;
export const ALDER_VERSION=ALDER_DATA.version+(layoutHasContent(resolvedLayout.layout)?`-layout-${layoutFingerprint(resolvedLayout.layout)}`:"");
let network: TrafficNetwork | undefined;
/** Metres of pavement past each carriageway edge. build-alder.py draws the
 *  pavement as `asphalt.buffer(2.8)`, so the paved ribbon the player sees and
 *  the paved ribbon the tyres feel are the same width. */
export const ALDER_PAVEMENT = 2.8;
/** Paved ground that is not a street: drawn as asphalt, so it drives as asphalt. */
const PAVED_AREAS = [DRIFT_YARD.bounds, DRIFT_YARD.driveway, {
  minX: ALDER_FORECOURT.x - ALDER_FORECOURT.width / 2, maxX: ALDER_FORECOURT.x + ALDER_FORECOURT.width / 2,
  minZ: ALDER_FORECOURT.z - ALDER_FORECOURT.depth / 2, maxZ: ALDER_FORECOURT.z + ALDER_FORECOURT.depth / 2 }];
const GROUND_REACH = Math.max(...ALDER_STREETS.flatMap(street => street.points.map(point => point.width))) / 2 + ALDER_PAVEMENT;
const ARENA_REACH = ARENA.width / 2 + ARENA.shoulder;
/** Streets only: the circuit's paths are paved to their shoulder, not to a city pavement. */
const streetBounds = bounds.slice(0, ALDER_STREETS.length);
const groundStreetsNear = spatialIndex(streetBounds, box => ({
  minX: box.minX - GROUND_REACH, maxX: box.maxX + GROUND_REACH,
  minZ: box.minZ - GROUND_REACH, maxZ: box.maxZ + GROUND_REACH,
}));
// Grass asks this thousands of times when a tile arrives. Each circuit path
// has constant paved width, so membership is the union of its segment capsules;
// finding the nearest point on all three complete laps does unnecessary work.
const arenaGroundNear = spatialIndex(ARENA_ROADS.flatMap(road => road.points.slice(1).map((b, i) => {
  const a = road.points[i]!, dx = b.x - a.x, dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  return { a, b, dx, dz, lengthSquared: length * length, reach: a.width / 2 + ARENA.shoulder };
})), ({ a, b, reach }) => ({
  minX: Math.min(a.x, b.x) - reach, maxX: Math.max(a.x, b.x) + reach,
  minZ: Math.min(a.z, b.z) - reach, maxZ: Math.max(a.z, b.z) + reach,
}));
/**
 * True off the paved surface: past every street's carriageway and pavement,
 * and outside the drift yard and the garage forecourt. Nearby streets are asked,
 * not just the nearest centreline: at a junction a point can sit on a wide
 * arterial's asphalt while an alley's centreline is closer, and nearest-path
 * selection would call that ground.
 */
export function alderGround(x: number, z: number): boolean {
  if (onMarketPaving(x, z) || onFrontagePaving(x,z)) return false;
  for (const area of PAVED_AREAS) {
    if (x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ) return false;
  }
  // The circuit's shoulder is paved to the same width everywhere, the access road included.
  if (nearArena(x, z, ARENA_REACH) && arenaGroundNear(x, z).some(({ a, dx, dz, lengthSquared, reach }) => {
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared));
    return Math.hypot(x - a.x - t * dx, z - a.z - t * dz) <= reach;
  })) return false;
  for (const box of groundStreetsNear(x, z)) {
    const dx = Math.max(box.minX - x, 0, x - box.maxX), dz = Math.max(box.minZ - z, 0, z - box.maxZ);
    if (dx * dx + dz * dz > GROUND_REACH * GROUND_REACH) continue;
    const on = projectOntoPath(box.street.points, x, z);
    if (on.distance <= on.width / 2 + ALDER_PAVEMENT) return false;
  }
  return true;
}

/** Metres a car's centre keeps from anything solid: half its width and most of a metre. */
const DRIVABLE_CLEARANCE = 1.8;
let solidsNear: ((x: number, z: number) => BuildingBlock[]) | undefined;
/**
 * Where a rival's line may cut a corner (2026-09-20, Shawn: "letting the cpu cut
 * corners that aren't grass"): paved, as the tyres and the lap recorder judge it
 * (`alderGround`), and clear of everything the world makes solid, buildings and
 * trees alike. A junction's corner is both streets' pavement, which is where a
 * player cuts it; a corner of grass, or with a building on it, is not cut.
 */
export function alderDrivable(x: number, z: number): boolean {
  if (alderGround(x, z)) return false;
  solidsNear ??= spatialIndex<BuildingBlock>(ALDER_SOLIDS, block => {
    const reach = Math.hypot(block.width, block.depth) / 2 + DRIVABLE_CLEARANCE;
    return { minX: block.x - reach, maxX: block.x + reach, minZ: block.z - reach, maxZ: block.z + reach };
  });
  return !solidsNear(x, z).some(block => pointFootprintDistance(block, x, z) < DRIVABLE_CLEARANCE);
}

/** `from` is where a race starts: the grid unless the flash said otherwise. */
export function createAlderWorld(racing = false, from: RoadWorld["start"] = start): RoadWorld {
  return { id: ALDER_VERSION, start: racing ? from : ALDER_GARAGE_EXIT,
    solids: ALDER_SOLIDS,
    // Only the seawall is a barrier; street edges and junctions stay open.
    walls: [{x:data.shore,y:2,z:(data.bounds[1]!+data.bounds[3]!)/2,
      width:1.2,depth:data.bounds[3]!-data.bounds[1]!,rotation:0,pitch:0,accent:"white",zone:"waterfront"}],
    project: projectOntoAlder, surface: projectOntoAlder, ground: alderGround, grade: alderGrade,
    get traffic() { return network ??= buildStreetTrafficNetwork(ALDER_STREETS, alderHeight); } };
}

const gateAt = (name: string, index: number) => {
  const streets = ALDER_STREETS.filter(street=>street.name===name);
  const street = streets[Math.min(index,streets.length-1)]!;
  const point = street.points[Math.floor(street.points.length/2)]!;
  return {id:street.id,name,x:point.x,z:point.z,radius:20};
};
export const ALDER_RACE: RaceDefinition = {
  id:"sound-to-sky", name:"Sound to Sky", countdownTicks:180,
  checkpoints:[gateAt('S Jackson St',0),gateAt('Harbor Way',0),gateAt('Madison St',0),gateAt('Pike St',0)],
};

let routing: RoutingGraph | undefined;
/** The slice's route-choice graph, measured once: the critique's numbers and the generator's material. */
export function alderRouting(): RoutingGraph {
  return routing ??= buildRoutingGraph(ALDER_STREETS, alderHeight, ALDER_BLOCKS);
}
/** A race drawn from the city by its seed, from the race grid on 1st Ave S, and
 *  the rival's line through its gates. (ALDER_VERSION, GENERATOR_REVISIONS[kind], seed,
 *  kind, start) reproduces it, and the turf when a rival's draw leans toward one
 *  (`alder-turf.ts`, which names it in the id). */
export function alderGeneratedRace(seed: number, from: RoadWorld["start"] = start, kind: Exclude<RaceKind, "drag" | "drift"> = "sprint", turf: Turf | null = null): { race: RaceDefinition; rival: RivalDefinition; generated: GeneratedRace } {
  const graph = alderRouting();
  // A circuit is drawn as a circuit, so its loop closes under the flow rule; unordered is the sprint's gates in any order.
  // A start that draws nothing from its own junction draws from one street on (generateRaceFrom).
  const { race: drawn, origin, lead } = generateRaceFrom(graph, seed, ALDER_STREETS, from, turf, kind === "circuit");
  const generated = kind === "unordered" ? withRaceKind(graph, drawn, origin, kind) : drawn;
  // A generated road race fields Moth's Kestrel (raceOpponentCar in main.ts)
  // unless a flashed rival brings their own (alder-course.ts). rivalLineFor itself
  // stays ignorant of who is driving it -- it draws a route, not a personality.
  return { race: generated.definition, generated,
    rival: { ...rivalLineFor(graph, generated, ALDER_STREETS, from, alderHeight, lead), car: "kestrel" } };
}
