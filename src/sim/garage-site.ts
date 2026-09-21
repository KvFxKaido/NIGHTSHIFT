import type { BuildingBlock } from "./building-footprint.ts";

/** Authored local coordinates; -Z is the street face. Keep the central exit clear. */
export function garageSite(building:BuildingBlock) {
  const rect=(x:number,z:number,width:number,depth:number,height:number):BuildingBlock=>{
    const c=Math.cos(building.rotation),s=Math.sin(building.rotation);
    return {x:building.x+x*c-z*s,z:building.z+x*s+z*c,width,depth,height,base:building.base,rotation:building.rotation};
  };
  return {
    planters:[-1,1].map(side=>rect(side*(building.width/2+1.6),-building.depth/2-1.6,2.4,3,.6)),
  };
}

/** Menu lettering sits ahead of the canopy and wall trim, with real DOM targets. */
export const GARAGE_MENU_DEPTH = 1.7;
