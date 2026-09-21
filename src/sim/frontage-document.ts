import type { BuildingBlock } from "./building-footprint.ts";
import { authoredSourceId, layoutFingerprint } from "./building-layout.ts";
import type { FrontKind, FrontModule, FrontPlan, IndustrialStyle } from "./building-fronts.ts";

export interface SavedFrontage {
  buildingId: string;
  seed: number;
  locked: boolean;
  edited: boolean;
  plan: FrontPlan;
}
export interface FrontageIssue { buildingId: string; message: string }
export interface FrontageDocument {
  schema: 1;
  generator: "frontages-v1";
  seed: number;
  entries: SavedFrontage[];
  attention: FrontageIssue[];
}
export interface FrontageSite { id: string; block: BuildingBlock }
export const FRONT_KINDS: readonly FrontKind[] = ["warehouse","shops","office","residential"];
const MODULE_KINDS = ["door","glazing","shutter","sign","blade","light","canopy"];
const object = (value: unknown): Record<string,unknown> => {
  if (!value || typeof value!=="object" || Array.isArray(value)) throw Error("Expected an object");
  return value as Record<string,unknown>;
};
const number = (value: unknown,min: number,max: number): number => {
  if (typeof value!=="number" || !Number.isFinite(value) || value<min || value>max) throw Error(`Expected a number between ${min} and ${max}`);
  return value;
};
const text = (value: unknown,max=120): string => {
  if (typeof value!=="string" || value.length>max || /[\x00-\x1f]/.test(value)) throw Error("Invalid frontage text");
  return value;
};
const boolean = (value: unknown): boolean => { if(typeof value!=="boolean")throw Error("Expected a boolean");return value; };
const array = (value: unknown,max: number): unknown[] => { if(!Array.isArray(value)||value.length>max)throw Error("Invalid frontage list");return value; };

/** Strict, bounded data shared by the editor, save endpoint and runtime. */
export function parseFrontageDocument(value: unknown): FrontageDocument {
  const doc=object(value);if(doc.schema!==1||doc.generator!=="frontages-v1")throw Error("Unsupported frontage document");
  const ids=new Set<string>();
  const entries=array(doc.entries,2500).map(value=>{
    const entry=object(value),buildingId=text(entry.buildingId);
    if(!buildingId||ids.has(buildingId))throw Error("Missing or duplicate frontage building id");ids.add(buildingId);
    const p=object(entry.plan),b=object(p.block),r=object(p.recipe);
    const block:BuildingBlock={x:number(b.x,-10000,10000),z:number(b.z,-10000,10000),width:number(b.width,2,100),
      depth:number(b.depth,2,100),height:number(b.height,2,150),base:number(b.base,-100,500),rotation:number(b.rotation,-Math.PI*2,Math.PI*2)};
    const kind=text(r.kind) as FrontKind;if(!FRONT_KINDS.includes(kind))throw Error("Unknown building use");
    const industrialStyle=r.industrialStyle as IndustrialStyle|undefined;
    if(industrialStyle!==undefined&&(!["freight","workshop","depot"].includes(industrialStyle)||kind!=="warehouse"))throw Error("Invalid industrial building style");
    const side=number(r.side,0,3);if(!Number.isInteger(side))throw Error("Invalid facade side");
    const width=side<2?block.width:block.depth;
    const modules:FrontModule[]=array(p.modules,100).map(value=>{
      const m=object(value),kind=text(m.kind) as FrontModule["kind"];
      if(!MODULE_KINDS.includes(kind))throw Error("Unknown frontage module");
      const color=m.color===undefined?undefined:text(m.color,7);
      if(color&&!/^#[0-9a-f]{6}$/i.test(color))throw Error("Use a six-digit hex colour");
      if(m.finish!==undefined&&(m.finish!=="painted"||kind!=="sign"))throw Error("Painted lettering needs a wall sign");
      return {kind,owner:text(m.owner),x:number(m.x,-50,50),y:number(m.y,0,15),width:number(m.width,.03,50),height:number(m.height,.03,10),
        ...(m.text===undefined?{}:{text:text(m.text,60)}),...(m.caption===undefined?{}:{caption:text(m.caption,80)}),...(color?{color}:{}),...(m.finish==="painted"?{finish:"painted" as const}:{})};
    });
    const paving=array(p.paving,100).map(value=>{
      const s=object(value);return {left:number(s.left,-50,50),right:number(s.right,-50,50),leftDepth:number(s.leftDepth,.1,40),
        rightDepth:number(s.rightDepth,.1,40),joinsStreet:boolean(s.joinsStreet)};
    });
    // Derive the coordinate frame instead of accepting a second conflicting transform.
    const plan:FrontPlan={block,recipe:{id:text(r.id),kind,side,x:block.x,z:block.z,width:block.width,depth:block.depth,height:block.height,...(industrialStyle?{industrialStyle}:{})},
      width,turn:[0,Math.PI,Math.PI/2,-Math.PI/2][side]!,wallX:side<2?0:(side===2?1:-1)*block.width/2,
      wallZ:side>=2?0:(side===0?1:-1)*block.depth/2,bandHeight:number(p.bandHeight,3,Math.min(10,block.height)),modules,paving};
    const problems=frontageModuleIssues(plan);if(problems.length)throw Error(`${buildingId}: ${problems[0]}`);
    return {buildingId,seed:number(entry.seed,0,0xffffffff),locked:boolean(entry.locked),edited:boolean(entry.edited),plan};
  });
  return {schema:1,generator:"frontages-v1",seed:number(doc.seed,0,0xffffffff),entries,
    attention:array(doc.attention,2500).map(value=>{const issue=object(value);return {buildingId:text(issue.buildingId),message:text(issue.message,240)};})};
}

export function frontageModuleIssues(plan: FrontPlan): string[] {
  const issues:string[]=[],doors=plan.modules.filter(m=>m.kind==="door");
  if(!doors.length)issues.push("A frontage needs an entrance");
  for(const m of plan.modules) {
    const w=m.kind==="blade"?.18:m.width;
    if(Math.abs(m.x)+w/2+.14>=plan.width/2 || m.y-m.height/2<-.001 || m.y+m.height/2>plan.bandHeight)issues.push("A module crosses its facade bay");
    if(!doors.some(d=>d.owner===m.owner))issues.push("Every tenant needs its own entrance");
    if(m.kind==="door"&&(Math.abs(m.y-m.height/2)>.05||m.height<2||m.width<.9))issues.push("Doors must reach the landing and allow access");
    if((m.kind==="glazing"||m.kind==="shutter")&&(m.width<.5||m.height<.5))issues.push("Openings need room for their frames");
    if(m.kind==="canopy"&&m.y-m.height/2<2.7)issues.push("Canopies need 2.7 metres of clearance");
    if(m.kind==="blade"&&(m.width>1.6||m.height>3||m.y-m.height/2<2.7))issues.push("Projecting signs must fit above pedestrians and stay within 1.6 metres of projection");
    if((m.kind==="sign"||m.kind==="blade")&&!m.text?.trim())issues.push("Signs need a name or number");
  }
  const openings=plan.modules.filter(m=>["door","glazing","shutter","sign"].includes(m.kind));
  for(let i=0;i<openings.length;i++)for(let j=i+1;j<openings.length;j++) {
    const a=openings[i]!,b=openings[j]!;
    if(Math.abs(a.x-b.x)<(a.width+b.width)/2-.01&&Math.abs(a.y-b.y)<(a.height+b.height)/2-.01)issues.push("Doors, windows and signs must not overlap");
  }
  let end=-plan.width/2;
  for(const s of plan.paving) {
    if(Math.abs(s.left-end)>.01||s.right<=s.left||s.right>plan.width/2+.01)issues.push("Paving strips must cover the facade without gaps");
    end=s.right;
  }
  if(Math.abs(end-plan.width/2)>.01||!plan.paving.some(s=>s.joinsStreet))issues.push("An entrance needs connected paving");
  return issues;
}

export function frontageForSite(doc: FrontageDocument,id: string): SavedFrontage | undefined {
  return doc.entries.find(e=>e.buildingId===id)??doc.entries.find(e=>e.buildingId===authoredSourceId(id));
}
export function sameFrontagePlacement(a: BuildingBlock,b: BuildingBlock): boolean {
  return (["x","z","width","depth","height","base","rotation"] as const).every(k=>Math.abs(a[k]-b[k])<.002);
}
/** Local module coordinates follow the building; access still needs revalidation. */
export function placeFrontagePlan(plan:FrontPlan,block:BuildingBlock):FrontPlan {
  const side=plan.recipe.side;
  return {...plan,block,width:side<2?block.width:block.depth,
    recipe:{...plan.recipe,x:block.x,z:block.z,width:block.width,depth:block.depth,height:block.height},
    wallX:side<2?0:(side===2?1:-1)*block.width/2,wallZ:side>=2?0:(side===0?1:-1)*block.depth/2};
}
/** Runtime loads stored choices only. A changed envelope is flagged, never rerolled. */
export function resolveFrontages(doc: FrontageDocument,sites: readonly FrontageSite[]) {
  const plans:FrontPlan[]=[],issues:FrontageIssue[]=[];
  for(const site of sites) {
    const entry=frontageForSite(doc,site.id);if(!entry)continue;
    if(!sameFrontagePlacement(entry.plan.block,site.block))issues.push({buildingId:site.id,message:"Placement changed — refit access before saving this frontage"});
    else plans.push({...entry.plan,block:site.block});
  }
  return {plans,issues};
}
/** Appearance edits do not invalidate races; paved geometry changes do. */
export function frontageSurfaceFingerprint(plans: readonly FrontPlan[]): string {
  return layoutFingerprint(plans.map(p=>({block:p.block,side:p.recipe.side,paving:p.paving})).sort((a,b)=>a.block.x-b.block.x||a.block.z-b.block.z));
}
