import { raceProgressLabel } from "../sim/race.ts";
import { ALDER_DATA, ALDER_STREETS, ALDER_BLOCKS, ALDER_GARAGE } from "../sim/alder.ts";
import landmarks from "../sim/alder-landmarks.json" with { type: "json" };
import type { Sim } from "../sim/sim.ts";
import { keyLabel, PAD_LABELS, type Bindings } from "../input/bindings.ts";

/** A view of the live world. Opening the menu pauses it without replacing it. */
export function createGameMap(sim: Sim) {
  const svg = document.getElementById("city-map") as unknown as SVGSVGElement;
  const status = document.getElementById("city-map-status")!;
  const help = document.getElementById("city-map-help")!;
  const ns = "http://www.w3.org/2000/svg";
  function shape(parent: SVGElement, tag: string, attributes: Record<string,string|number>, text?: string) {
    const node = document.createElementNS(ns,tag);
    for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,String(value));
    if (text) node.textContent=text;
    parent.append(node); return node;
  }
  for (const park of ALDER_DATA.parks) {
    const [x,z,right,bottom]=park.bounds as [number,number,number,number];
    shape(svg,"rect",{x,y:z,width:right-x,height:bottom-z,fill:"#365744",opacity:.7});
  }
  for (const b of ALDER_BLOCKS) shape(svg,"rect",{x:b.x-b.width/2,y:b.z-b.depth/2,width:b.width,height:b.depth,
    transform:`rotate(${b.rotation*180/Math.PI} ${b.x} ${b.z})`,fill:"#456068",opacity:.55});
  for (const street of ALDER_STREETS) {
    const path=shape(svg,"polyline",{points:street.points.map(p=>`${p.x},${p.z}`).join(" "),fill:"none",
      stroke:street.added?"#bca879":"#66858e","stroke-width":street.points[0]!.width,"stroke-linejoin":"round"});
    shape(path,"title",{},street.name);
  }
  const garage=ALDER_GARAGE.entrance, tower=landmarks.broadcastTower;
  for (const area of ALDER_DATA.neighborhoods) shape(svg,"text",{x:area.x,y:area.z,"font-size":30,fill:"#b9bda9","text-anchor":"middle"},area.name);
  shape(svg,"text",{x:garage.x,y:garage.z+10,fill:"#69e5bd","font-size":40,"text-anchor":"middle"},"G");
  shape(svg,"circle",{cx:tower.x,cy:tower.z,r:16,fill:"#b6c9ff"});
  shape(svg,"text",{x:tower.x+25,y:tower.z+8,fill:"#c9d5ff","font-size":28},"Broadcast Tower");
  const markers=shape(svg,"g",{"data-map-markers":""});
  const [minX,minZ,maxX,maxZ]=ALDER_DATA.bounds as [number,number,number,number];
  let cx=(minX+maxX)/2, cz=(minZ+maxZ)/2, zoom=1;
  function view() {
    const w=(maxX-minX)/zoom, h=(maxZ-minZ)/zoom;
    cx=Math.max(minX,Math.min(maxX,cx));cz=Math.max(minZ,Math.min(maxZ,cz));
    svg.setAttribute("viewBox",`${cx-w/2} ${cz-h/2} ${w} ${h}`);
  }
  function wholeCity() {cx=(minX+maxX)/2;cz=(minZ+maxZ)/2;zoom=1;view();}
  document.querySelectorAll<HTMLButtonElement>("[data-map-view]").forEach(button=>button.addEventListener("click",()=>{
    switch(button.dataset.mapView) {
      case "all": wholeCity();return;
      case "player": cx=sim.state.vehicle.x;cz=sim.state.vehicle.z;zoom=2.5;break;
      case "in": zoom=Math.min(6,zoom*1.5);break;
      case "out": zoom=Math.max(1,zoom/1.5);break;
    }
    view();
  }));
  svg.addEventListener("wheel",event=>{
    event.preventDefault();zoom=Math.max(1,Math.min(6,zoom*(event.deltaY<0?1.2:1/1.2)));view();
  },{passive:false});
  let drag: {id:number;x:number;y:number}|null=null;
  svg.addEventListener("pointerdown",event=>{drag={id:event.pointerId,x:event.clientX,y:event.clientY};svg.setPointerCapture(event.pointerId);});
  svg.addEventListener("pointermove",event=>{
    if (!drag || drag.id!==event.pointerId) return;
    const matrix=svg.getScreenCTM();if(!matrix)return;
    cx-=(event.clientX-drag.x)/matrix.a;cz-=(event.clientY-drag.y)/matrix.d;
    drag={id:event.pointerId,x:event.clientX,y:event.clientY};view();
  });
  svg.addEventListener("lostpointercapture",()=>{drag=null;});
  return { open(bindings: Bindings) {
    wholeCity();markers.replaceChildren();
    const player=sim.state.vehicle, opponent=sim.state.rival?.vehicle??sim.state.encounter;
    const progress=sim.state.race;
    sim.race?.checkpoints.forEach((gate,i)=>{
      const perLap = sim.race?.gatesPerLap ?? sim.race!.checkpoints.length;
      const lapStart = Math.min(Math.floor((progress?.checkpoint ?? 0) / perLap), (sim.race?.laps ?? 1) - 1) * perLap;
      if (sim.race?.kind === "circuit" && (i < lapStart || i >= lapStart + perLap)) return;
      const passed=progress?.collected.includes(i) ?? false;
      const next=!passed && !progress?.finished && (sim.race?.kind === "unordered" || i===progress?.checkpoint);
      shape(markers,"circle",{cx:gate.x,cy:gate.z,r:next?30:22,fill:passed?"#52616b":next?"#ffc56a":"#bc976b",
        stroke:next?"#fff1bf":"#172c35","stroke-width":5,"data-map-gate":i});
      shape(markers,"text",{x:gate.x,y:gate.z+9,"text-anchor":"middle","font-size":28,fill:"#10202b"},String(i % perLap + 1));
    });
    for (const rival of sim.state.parkedRivals) {
      const { x, z } = rival.vehicle;
      shape(markers, "circle", { cx: x, cy: z, r: 24, fill: "#ffb347", stroke: "#491b2c", "stroke-width": 5, "data-map-parked-rival": rival.id });
      shape(markers, "text", { x: x + 34, y: z + 10, fill: "#ffdb9c", "font-size": 28 }, `${rival.name} / Drag`);
    }
    if(opponent)shape(markers,"circle",{cx:opponent.x,cy:opponent.z,r:20,fill:"#ff6679",stroke:"#491b2c","stroke-width":5,"data-map-rival":""});
    shape(markers,"path",{d:"M 0 -30 L 20 22 L 0 12 L -20 22 Z",fill:"#f4f7fa",stroke:"#162631","stroke-width":5,
      transform:`translate(${player.x} ${player.z}) rotate(${-player.heading*180/Math.PI})`,"data-map-player":""});
    status.textContent=sim.race&&progress?`${sim.race.name} · ${progress.finished?"Finished":raceProgressLabel(sim.race, progress)} · Paused`
      :`Free roam · ${ALDER_DATA.roadHullKm2.toFixed(1)} km² Port Alder · Paused${sim.state.parkedRivals.length ? " · Rivet / Drag: southern Harbor Way" : ""}`;
    help.textContent=`${keyLabel(bindings.keyboard.map)} / ${PAD_LABELS[bindings.gamepad.map]} to close · Esc / B to go back · Drag to pan, scroll to zoom`;
  }};
}
