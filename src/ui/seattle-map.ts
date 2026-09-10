import { SEATTLE_DATA, SEATTLE_BLOCKS, SEATTLE_GARAGE, SEATTLE_STREETS, SEATTLE_RACE, createSeattleWorld } from "../sim/seattle.ts";
import { pathLength } from "../sim/lanes.ts";

const svg = document.getElementById("district-map")!;
function shape(tag: string, attributes: Record<string, string | number>, text?: string): SVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text) node.textContent = text;
  svg.append(node);
  return node;
}
const [minX,minZ,maxX,maxZ] = SEATTLE_DATA.bounds as [number,number,number,number];
svg.setAttribute("viewBox", `${minX} ${minZ} ${maxX-minX} ${maxZ-minZ}`);
for (const b of SEATTLE_BLOCKS) shape("rect", {x:b.x-b.width/2,y:b.z-b.depth/2,width:b.width,height:b.depth,
  transform:`rotate(${b.rotation*180/Math.PI} ${b.x} ${b.z})`,fill:"#91a4a4",opacity:.3});
for (const street of SEATTLE_STREETS) {
  const path = shape("polyline", {points:street.points.map(p=>`${p.x},${p.z}`).join(" "),fill:"none",stroke:street.added?"#ecdaa5":"#6e878c","stroke-width":street.points[0]!.width,"stroke-linejoin":"round"});
  const title = document.createElementNS("http://www.w3.org/2000/svg","title");
  title.textContent = street.name; path.append(title);
}
SEATTLE_RACE.checkpoints.forEach((gate,i)=>{
  shape("circle",{cx:gate.x,cy:gate.z,r:25,fill:"#f2cd70",stroke:"#253c49","stroke-width":3});
  shape("text",{x:gate.x,y:gate.z+8,"text-anchor":"middle","font-size":25,fill:"#172c35"},String(i+1));
});
const start = createSeattleWorld().start;
shape("circle",{cx:start.x,cy:start.z,r:20,fill:"#69e5bd",stroke:"#173f37","stroke-width":4});
shape("text",{x:start.x+34,y:start.z+10,"font-size":26,fill:"#b4ffe5"},SEATTLE_GARAGE.name);
document.getElementById("map-stats")!.textContent = `${(SEATTLE_STREETS.reduce((n,s)=>n+pathLength(s.points),0)/1000).toFixed(1)} km of streets · Four open checkpoints`;
