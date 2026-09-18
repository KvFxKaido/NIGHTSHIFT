import { DRIFT_YARD, YARD_STRUCTURES } from "../sim/drift-yard.ts";
import landmarks from "../sim/alder-landmarks.json" with { type: "json" };
import { ALDER_DATA, ALDER_BLOCKS, ALDER_GARAGE, ALDER_STREETS, ALDER_RACE, ARENA_ROADS, ALDER_DRIVE_BOUNDS, createAlderWorld } from "../sim/alder.ts";
import { ARENA, ARENA_BOUNDS } from "../sim/arena.ts";
import { pathLength } from "../sim/lanes.ts";
import { ALDER_NEIGHBOURHOODS } from "../sim/alder-neighbourhoods.ts";
import { keepReadable, readable } from "./map-labels.ts";

const svg = document.getElementById("district-map")!;
function shape(tag: string, attributes: Record<string, string | number>, text?: string): SVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text) node.textContent = text;
  svg.append(node);
  return node;
}
const [minX,minZ,maxX,maxZ] = ALDER_DRIVE_BOUNDS;
svg.setAttribute("viewBox", `${minX} ${minZ} ${maxX-minX} ${maxZ-minZ}`);
for (const park of ALDER_DATA.parks) {
  const [x,z,right,bottom]=park.bounds as [number,number,number,number];
  shape("rect",{x,y:z,width:right-x,height:bottom-z,fill:"#365744",opacity:.65});
  shape("text",{x:(x+right)/2,y:(z+bottom)/2,"font-size":24,fill:"#a6c7a8","text-anchor":"middle",...readable(9,24)},park.name);
}
for (const b of ALDER_BLOCKS) shape("rect", {x:b.x-b.width/2,y:b.z-b.depth/2,width:b.width,height:b.depth,
  transform:`rotate(${b.rotation*180/Math.PI} ${b.x} ${b.z})`,fill:"#91a4a4",opacity:.3});
for (const street of ALDER_STREETS) {
  const path = shape("polyline", {points:street.points.map(p=>`${p.x},${p.z}`).join(" "),fill:"none",stroke:street.added?"#ecdaa5":"#6e878c","stroke-width":street.points[0]!.width,"stroke-linejoin":"round"});
  const title = document.createElementNS("http://www.w3.org/2000/svg","title");
  title.textContent = street.name; path.append(title);
}
for (const road of ARENA_ROADS) {
  const path = shape("polyline", {points:road.points.map(p=>`${p.x},${p.z}`).join(" "),fill:"none",stroke:"#8a9ca3","stroke-width":road.points[0]!.width+3,"stroke-linejoin":"round"});
  const title = document.createElementNS("http://www.w3.org/2000/svg","title");
  title.textContent = road.name; path.append(title);
}
shape("text",{x:(ARENA_BOUNDS.minX+ARENA_BOUNDS.maxX)/2+80,y:ARENA_BOUNDS.minZ-40,"font-size":28,fill:"#d8d2bd","text-anchor":"middle",...readable(10,28)},ARENA.name);
ALDER_RACE.checkpoints.forEach((gate,i)=>{
  shape("circle",{cx:gate.x,cy:gate.z,r:25,fill:"#f2cd70",stroke:"#253c49","stroke-width":3,...readable(7,25)});
  shape("text",{x:gate.x,y:gate.z+8,"text-anchor":"middle","font-size":25,fill:"#172c35",...readable(9,25)},String(i+1));
});
const start = createAlderWorld().start;
shape("circle",{cx:start.x,cy:start.z,r:20,fill:"#69e5bd",stroke:"#173f37","stroke-width":4,...readable(5,20)});
shape("text",{x:start.x+34,y:start.z+10,"font-size":26,fill:"#b4ffe5",...readable(10,26)},ALDER_GARAGE.name);
document.getElementById("map-stats")!.textContent = `${(ALDER_STREETS.reduce((n,s)=>n+pathLength(s.points),0)/1000).toFixed(1)} km of streets · ${ALDER_DATA.roadHullKm2.toFixed(1)} km² street footprint · Four open checkpoints`;

const tower = landmarks.broadcastTower;
shape("circle", {cx:tower.x,cy:tower.z,r:22,fill:"#b6c9ff",stroke:"#26374e","stroke-width":4,...readable(5,22)});
shape("text", {x:tower.x+35,y:tower.z+10,"font-size":25,fill:"#d4ddff",...readable(10,25)},"Broadcast Tower");
// Every neighbourhood by its polygon's label (sim/alder-neighbourhoods.ts), the
// same seven the night dressing and the name on screen use. "ALDER CENTER" used
// to be printed on the Broadcast Tower campus, which is Belltown.
for (const area of ALDER_NEIGHBOURHOODS) shape("text",{x:area.label[0],y:area.label[1],"font-size":28,fill:"#c5b898","text-anchor":"middle",...readable(12,28)},area.name.toUpperCase());

for (const b of [DRIFT_YARD.bounds, DRIFT_YARD.driveway]) shape("rect", {x:b.minX,y:b.minZ,width:b.maxX-b.minX,height:b.maxZ-b.minZ,fill:"#38685e",opacity:.8});
for (const b of YARD_STRUCTURES) shape("rect", {x:b.x-b.width/2,y:b.z-b.depth/2,width:b.width,height:b.depth,fill:"#93aaa4"});
shape("text", {x:-460,y:1145,"font-size":25,fill:"#96ebce","text-anchor":"middle",...readable(9,25)}, "South Wharf / Drift Yard");

// The board is drawn in metres at a fixed size, so its labels are sized for the
// screen once it is laid out, and again whenever the window changes.
const board = svg as unknown as SVGSVGElement;
requestAnimationFrame(() => keepReadable(board));
addEventListener("resize", () => keepReadable(board));
