import landmarks from "./seattle-landmarks.json" with { type: "json" };
import data from "./seattle-data.json" with { type: "json" };
import { projectOntoPath, type Street } from "./street-path.ts";
import { buildStreetTrafficNetwork } from "./street-traffic.ts";
import { buildingId, layoutFingerprint, layoutHasContent, parseAnyLayout, type AuthoredLayout, type BuildingPlacement } from "./building-layout.ts";
import { blockCorners, blockPenetration, segmentFootprintDistance, type BuildingBlock } from "./building-footprint.ts";
import authoredLayout from "./seattle-layout.json" with { type: "json" };
import type { CourseProjection } from "./track.ts";
import type { RoadWorld } from "./road-world.ts";
import type { TrafficNetwork } from "./traffic.ts";
import type { RaceDefinition } from "./race.ts";
import type { RivalDefinition } from "./rival.ts";
import { buildRoutingGraph, type RoutingGraph } from "./route-choice.ts";
import { generateRace, rivalLineFor, startApproach, type GeneratedRace } from "./race-generator.ts";

export const SEATTLE_DATA = data;
const garageBuilding: BuildingBlock = {x:34,z:910,width:32,depth:24,height:10,base:2,rotation:-Math.PI/2};
export const SEATTLE_GARAGE = {id:"wharf-garage",name:"Wharf Garage",building:garageBuilding,
  entrance:{x:17,y:2,z:910,heading:0,pitch:0}};
export const GARAGE_PLOT_ID = buildingId(garageBuilding);
export const GENERATED_SEATTLE_BLOCKS: readonly BuildingBlock[] = [...data.buildings,garageBuilding];
export const SEATTLE_LAYOUT_BASELINE = layoutFingerprint(GENERATED_SEATTLE_BLOCKS.map(block=>
  Object.fromEntries(Object.entries(block).map(([key,value])=>[key,Math.round(value*1000)/1000]))));
export function seattleHeight(x: number, z: number): number {
  const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t*t*(3-2*t); };
  return 2 + 34 * smooth((x + 50) / 640) * smooth((330 - z) / 500);
}
export const SEATTLE_STREETS: readonly Street[] = data.roads.map(road => ({
  id: road.id, name: road.name, from: road.from, to: road.to,
  added: road.sourceId === null, kind: road.width >= 20 ? "arterial" : "collector",
  points: road.points.map(([x, z]) => ({ x: x!, z: z!, y: seattleHeight(x!, z!), width: road.width,
    zone: z! > 250 ? "freight" : x! < -270 ? "waterfront" : "old-quarter" })),
}));
const bounds = SEATTLE_STREETS.map(street => ({ street,
  minX: Math.min(...street.points.map(p=>p.x)), maxX: Math.max(...street.points.map(p=>p.x)),
  minZ: Math.min(...street.points.map(p=>p.z)), maxZ: Math.max(...street.points.map(p=>p.z)) }));
export function projectOntoSeattle(x: number, z: number): CourseProjection {
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
  const dx = (seattleHeight(x+.1,z)-seattleHeight(x-.1,z))/.2;
  const dz = (seattleHeight(x,z+.1)-seattleHeight(x,z-.1))/.2;
  return { ...road, height: seattleHeight(x,z), pitch: Math.atan(dx*road.ux+dz*road.uz) };
}
const startSegment = SEATTLE_STREETS.filter(street=>street.name==='1St Ave S')
  .flatMap(street=>street.points.slice(1).map((b,i)=>({a:street.points[i]!,b})))
  .filter(({a,b})=>Math.abs(b.z-a.z)>Math.abs(b.x-a.x)*2 && Math.hypot(b.x-a.x,b.z-a.z)>60)
  .sort((a,b)=>(b.a.z+b.b.z)-(a.a.z+a.b.z))[0]!;
const startPoint = {x:(startSegment.a.x+startSegment.b.x)/2,z:(startSegment.a.z+startSegment.b.z)/2};
const startOn = projectOntoPath([startSegment.a,startSegment.b], startPoint.x, startPoint.z);
// Begin travelling north in the industrial district, on the right-hand lane.
const northHeading = startOn.uz > 0 ? Math.atan2(startOn.ux,startOn.uz) : Math.atan2(-startOn.ux,-startOn.uz);
const start = { x: startPoint.x + Math.cos(northHeading)*4.5, z: startPoint.z - Math.sin(northHeading)*4.5,
  y: seattleHeight(startPoint.x,startPoint.z), heading: northHeading, pitch: 0 };

export function groundBuilding(placement: Omit<BuildingPlacement,"id">): BuildingBlock {
  const shape={...placement,base:0};
  return {...shape,base:Math.round(Math.min(seattleHeight(shape.x,shape.z),...blockCorners(shape).map(p=>seattleHeight(p.x,p.z)))*1000)/1000};
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
export function resolveSeattleLayout(value:unknown, generated:readonly BuildingBlock[]=GENERATED_SEATTLE_BLOCKS): ResolvedLayout {
  const layout=parseAnyLayout(value,SEATTLE_LAYOUT_BASELINE);
  const retired=new Set(layout.retired);
  if(retired.has(GARAGE_PLOT_ID))throw Error("Wharf Garage is fixed in this editor version");
  const authored=layout.authored.map(({id:_id,...placement})=>groundBuilding(placement));
  const forecourt:BuildingBlock={x:6.5,z:910,width:31,depth:40,height:1,base:2,rotation:0};
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
    if(SEATTLE_STREETS.some(street=>street.points.slice(1).some((b,i)=>
      segmentFootprintDistance(block,street.points[i]!,b)<Math.max(b.width,street.points[i]!.width)/2+2.8)))issues.push(`${id}: overlaps a road or its pavement`);
    if(blockPenetration(block,landmarks.needle)>0)issues.push(`${id}: overlaps the Space Needle`);
    if(blockPenetration(block,forecourt)>0)issues.push(`${id}: blocks the garage entrance`);
    if(blockPenetration(block,garageBuilding)>0)issues.push(`${id}: overlaps Wharf Garage`);
    if(blockCorners(block).some(p=>p.x<data.shore+2||p.x>data.bounds[2]!||p.z<data.bounds[1]!||p.z>data.bounds[3]!))issues.push(`${id}: outside the map's building area`);
    if(authored.some((other,j)=>j!==index&&blockPenetration(block,other)>.01))issues.push(`${id}: overlaps another authored building`);
    if(Math.max(...blockCorners(block).map(p=>seattleHeight(p.x,p.z)))-block.base>4.1)issues.push(`${id}: ground changes by more than four metres across the footprint`);
    entries.push({id,source:"authored",block});
  });
  return {layout,blocks:entries.map(entry=>entry.block),entries,displaced,issues};
}
const resolvedLayout=resolveSeattleLayout(authoredLayout);
if(resolvedLayout.issues.length)throw Error(`Invalid Seattle layout:\n${resolvedLayout.issues.join("\n")}`);
export const SEATTLE_BLOCKS=resolvedLayout.blocks;
export const SEATTLE_LAYOUT=resolvedLayout;
export const SEATTLE_VERSION=data.version+(layoutHasContent(resolvedLayout.layout)?`-layout-${layoutFingerprint(resolvedLayout.layout)}`:"");
let network: TrafficNetwork | undefined;
export function createSeattleWorld(racing = false): RoadWorld {
  return { id: SEATTLE_VERSION, start: racing ? start : SEATTLE_GARAGE.entrance, solids: [...SEATTLE_BLOCKS, landmarks.needle],
    // Only the seawall is a barrier; street edges and junctions stay open.
    walls: [{x:data.shore,y:2,z:(data.bounds[1]!+data.bounds[3]!)/2,
      width:1.2,depth:data.bounds[3]!-data.bounds[1]!,rotation:0,pitch:0,accent:"white",zone:"waterfront"}],
    project: projectOntoSeattle, surface: projectOntoSeattle,
    get traffic() { return network ??= buildStreetTrafficNetwork(SEATTLE_STREETS, seattleHeight); } };
}

const gateAt = (name: string, index: number) => {
  const streets = SEATTLE_STREETS.filter(street=>street.name===name);
  const street = streets[Math.min(index,streets.length-1)]!;
  const point = street.points[Math.floor(street.points.length/2)]!;
  return {id:street.id,name,x:point.x,z:point.z,radius:20};
};
export const SEATTLE_RACE: RaceDefinition = {
  id:"sound-to-sky", name:"Sound to Sky", countdownTicks:180,
  checkpoints:[gateAt('S Jackson St',0),gateAt('Harbor Way',0),gateAt('Madison St',0),gateAt('Pike St',0)],
};

let routing: RoutingGraph | undefined;
/** The slice's route-choice graph, measured once: the critique's numbers and the generator's material. */
export function seattleRouting(): RoutingGraph {
  return routing ??= buildRoutingGraph(SEATTLE_STREETS, seattleHeight, SEATTLE_BLOCKS);
}
/** A race drawn from the city by its seed, from the race grid on 1st Ave S, and
 *  the rival's line through its gates. (SEATTLE_VERSION, seed) reproduces it. */
export function seattleGeneratedRace(seed: number): { race: RaceDefinition; rival: RivalDefinition; generated: GeneratedRace } {
  const graph = seattleRouting();
  const approach = startApproach(SEATTLE_STREETS, start);
  const generated = generateRace(graph, seed, approach.node, approach.arriving, [approach.street.id]);
  return { race: generated.definition, generated,
    rival: rivalLineFor(graph, generated, SEATTLE_STREETS, start, seattleHeight) };
}
