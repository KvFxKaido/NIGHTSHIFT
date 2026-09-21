import { pointFootprintDistance, spatialIndex, type BuildingBlock } from "./building-footprint.ts";
import type { Street } from "./street-path.ts";

export type FrontKind = "warehouse" | "shops" | "office" | "residential";
export type IndustrialStyle = "freight" | "workshop" | "depot";
export interface FrontModule {
  readonly kind: "door" | "glazing" | "shutter" | "sign" | "blade" | "light" | "canopy";
  readonly owner: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly text?: string;
  readonly caption?: string;
  readonly color?: string;
  /** Painted lettering receives scene light instead of glowing at night. */
  readonly finish?: "painted";
}
export interface FrontRecipe {
  readonly id: string;
  readonly kind: FrontKind;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** +Z, -Z, +X, -X, in the building's local frame. */
  readonly side: number;
  readonly industrialStyle?: IndustrialStyle;
}
/** Authored pilot plots. Edited/moved envelopes fall back to ordinary dressing. */
export const FRONT_RECIPES: readonly FrontRecipe[] = [
  { id: "harbor-supply", kind: "warehouse", x: -44, z: 585, width: 27, depth: 24, height: 9, side: 2 },
  { id: "bell-row", kind: "shops", x: -477, z: -1140, width: 18, depth: 18, height: 30, side: 1 },
  { id: "meridian-house", kind: "office", x: -110, z: -564, width: 24, depth: 23, height: 111, side: 1 },
];
export interface FrontPlan {
  readonly recipe: FrontRecipe;
  readonly block: BuildingBlock;
  readonly width: number;
  readonly turn: number;
  readonly wallX: number;
  readonly wallZ: number;
  readonly bandHeight: number;
  readonly modules: readonly FrontModule[];
  /** Paved strips, measured across/outward from the facade. Subdivided for terrain. */
  readonly paving: readonly { left: number; right: number; leftDepth: number; rightDepth: number; joinsStreet: boolean }[];
}

/** All four elevations use the same frame convention as the saved entrance. */
export function buildingWallFrames(block:BuildingBlock) {
  return [0,1,2,3].map(side=>({block,side,width:side<2?block.width:block.depth,
    turn:[0,Math.PI,Math.PI/2,-Math.PI/2][side]!,
    wallX:side<2?0:(side===2?1:-1)*block.width/2,
    wallZ:side>=2?0:(side===0?1:-1)*block.depth/2}));
}

export function frontPoint(plan: Pick<FrontPlan, "block" | "turn" | "wallX" | "wallZ">, across: number, outward: number) {
  const x = plan.wallX + Math.cos(plan.turn) * across + Math.sin(plan.turn) * outward;
  const z = plan.wallZ - Math.sin(plan.turn) * across + Math.cos(plan.turn) * outward;
  const c = Math.cos(plan.block.rotation), s = Math.sin(plan.block.rotation);
  return { x: plan.block.x + x*c-z*s, z: plan.block.z + x*s+z*c };
}

/** Roles are assembled together: a tenant's door, glass and sign share one bay. */
function modulesFor(kind: FrontKind, width: number): FrontModule[] {
  const modules: FrontModule[] = [];
  const add = (kind: FrontModule["kind"], owner: string, x: number, y: number, width: number, height: number,
    extra: Partial<FrontModule> = {}) => modules.push({ kind, owner, x, y, width, height, ...extra });
  const door = (owner: string, x: number, width = 1.2) => add("door",owner,x,1.35,width,2.7);
  const sign = (owner: string,x: number,y: number,width: number,text: string,caption: string,color: string,height = .8) =>
    add("sign",owner,x,y,width,height,{text,caption,color});
  if (kind === "warehouse") {
    door("harbor",-width*.38);
    for (const [i,x] of [-width*.10,width*.27].entries()) {
      add("shutter","harbor",x,2.15,5.2,4.3);
      sign("harbor",x,4.75,1.4,`0${i+1}`,"LOADING","#d4dcd8",.65);
      add("light","harbor",x,5.4,1.2,.1,{color:"#dfe7ef"});
    }
    sign("harbor",-width*.26,6.25,9.4,"HARBOR SUPPLY","WAREHOUSE / RECEIVING","#b7c9b9",1.1);
    add("light","harbor",-width*.38,3.15,.75,.1,{color:"#dfe7ef"});
  } else if (kind === "shops") {
    const bay = (width-3.8)/2;
    for (const [i,owner] of ["night-owl","second-spin"].entries()) {
      const x = -width/2 + .5 + bay*(i+.5);
      const color = i === 0 ? "#d59be8" : "#a9c782";
      door(owner,x-bay/2+1.05);
      add("glazing",owner,x+.85,1.55,bay-2.5,2.25);
      sign(owner,x,3.6,bay-.35,i===0?"NIGHT OWL":"SECOND SPIN",i===0?"COFFEE / LATE HOURS":"RECORDS / USED & NEW",color);
      add("canopy",owner,x,2.98,bay-.2,.14);
      // Lighting follows the canopy edge; its colour belongs to this tenant.
      add("light",owner,x,2.84,bay-.45,.045,{color});
    }
    door("bell-rooms",width/2-1.55,1.3);
    sign("bell-rooms",width/2-1.55,3.55,2.5,"BELL ROOMS","18 / RESIDENTS","#c5c8c3",.65);
    add("blade","night-owl",-width/2+.3,3.65,1.15,1.15,
      {text:"OWL",caption:"COFFEE",color:"#d59be8"});
  } else {
    door("meridian",0,2.6);
    for (const x of [-4.9,4.9]) add("glazing","meridian",x,1.52,5.4,2.8);
    add("canopy","meridian",0,3.03,8,.18);
    add("light","meridian",0,2.9,7.4,.055,{color:"#e2dbbe"});
    sign("meridian",0,3.78,8.4,"MERIDIAN HOUSE","564 / MAIN ENTRANCE","#d4d2c8",.75);
    sign("meridian",8.8,1.65,1.65,"564","LOBBY / OFFICES","#c3c9c8",1.1);
  }
  return modules;
}

/** No renderer state here. The same access patches drive grass exclusion and grip.
 * This first kit accepts level sites only; a sloping entrance needs an authored
 * platform/ramp rather than a floating door or an invisible physics step. */
export function planBuildingFronts(blocks: readonly BuildingBlock[], streets: readonly Street[],
  heightAt: (x: number,z: number) => number): FrontPlan[] {
  const segments = streets.flatMap(street => street.points.slice(1).map((b,i) => ({a:street.points[i]!,b})));
  const plans: FrontPlan[] = [];
  for (const recipe of FRONT_RECIPES) {
    const block = blocks.find(b => b.x===recipe.x && b.z===recipe.z && b.width===recipe.width
      && b.depth===recipe.depth && b.height===recipe.height && b.rotation===0);
    if (!block) continue;
    const side = recipe.side, turn = [0,Math.PI,Math.PI/2,-Math.PI/2][side]!;
    const width = side<2 ? block.width : block.depth;
    const frame = {block,turn,wallX:side<2?0:(side===2?1:-1)*block.width/2,
      wallZ:side>=2?0:(side===0?1:-1)*block.depth/2};
    const nearby = segments.filter(({a,b}) => Math.min(a.x,b.x)<block.x+80 && Math.max(a.x,b.x)>block.x-80
      && Math.min(a.z,b.z)<block.z+80 && Math.max(a.z,b.z)>block.z-80);
    const roadDistance = (x: number,z: number) => Math.min(...nearby.map(({a,b}) => {
      const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
      return Math.hypot(x-a.x-dx*t,z-a.z-dz*t)-Math.max(a.width,b.width)/2;
    }));
    const others = blocks.filter(b => b!==block && Math.hypot(b.x-block.x,b.z-block.z)<100);
    const edges: {x:number;depth:number}[] = [];
    for (let i=0;i<=Math.ceil(width);i++) {
      const x = -width/2+i*width/Math.ceil(width);
      let reached = false;
      for (let d=.15;d<=40;d+=.2) {
        const p = frontPoint(frame,x,d);
        if (Math.abs(heightAt(p.x,p.z)-block.base)>.15 || others.some(b=>pointFootprintDistance(b,p.x,p.z)<.1)) break;
        // Stop just inside the 2.8 m sidewalk, never paint over the carriageway.
        if (roadDistance(p.x,p.z)<=2.65) { edges.push({x,depth:d}); reached=true;break; }
      }
      if (!reached) break;
    }
    if (edges.length!==Math.ceil(width)+1) continue;
    plans.push({...frame,recipe,width,bandHeight:recipe.kind==="warehouse"?7.05:4.35,
      modules:modulesFor(recipe.kind,width),paving:edges.slice(1).map((edge,i)=>{
        const previous=edges[i]!,joinsStreet=recipe.kind!=="office"||(previous.x>=-2&&edge.x<=2);
        return {left:previous.x,right:edge.x,joinsStreet,
          leftDepth:joinsStreet?previous.depth:3,rightDepth:joinsStreet?edge.depth:3};
      })});
  }
  return plans;
}

export function frontagePavingQuery(plans: readonly FrontPlan[]): (x:number,z:number)=>boolean {
  const nearby = spatialIndex(plans,plan=>{
    const points=plan.paving.flatMap(s=>[frontPoint(plan,s.left,0),frontPoint(plan,s.right,0),
      frontPoint(plan,s.left,s.leftDepth),frontPoint(plan,s.right,s.rightDepth)]);
    return {minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),
      minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))};
  });
  return (x,z) => nearby(x,z).some(plan=>{
    const origin=frontPoint(plan,0,0),along=frontPoint(plan,1,0),out=frontPoint(plan,0,1);
    const dx=x-origin.x,dz=z-origin.z,u=dx*(along.x-origin.x)+dz*(along.z-origin.z),v=dx*(out.x-origin.x)+dz*(out.z-origin.z);
    return v>=-1e-7 && plan.paving.some(s=>u>=s.left-1e-7 && u<=s.right+1e-7
      && v<=s.leftDepth+(s.rightDepth-s.leftDepth)*(u-s.left)/(s.right-s.left)+1e-7);
  });
}
