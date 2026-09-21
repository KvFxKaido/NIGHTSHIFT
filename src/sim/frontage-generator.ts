import { blockCorners, pointFootprintDistance, spatialIndex, type BuildingBlock } from "./building-footprint.ts";
import { buildingFrontage } from "./frontage.ts";
import { frontPoint, type FrontKind, type FrontModule, type FrontPlan } from "./building-fronts.ts";
import { alderNeighbourhoodAt } from "./alder-neighbourhoods.ts";
import { frontageForSite, frontageModuleIssues, placeFrontagePlan, resolveFrontages, type FrontageDocument, type FrontageSite, type SavedFrontage } from "./frontage-document.ts";
import type { Street } from "./street-path.ts";
import { industrialModules } from "./industrial-fronts.ts";

export interface FrontageContext {
  sites: readonly FrontageSite[];
  streets: readonly Street[];
  obstacles: readonly BuildingBlock[];
  /** Site furniture is validated by its grounds planner, not the legacy full apron. */
  obstacleOwners?: ReadonlyMap<BuildingBlock,string>;
  heightAt: (x:number,z:number)=>number;
  protectedIds: ReadonlySet<string>;
}
const hash=(text:string)=>{let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
const SHOPS=[
  ["LOW TIDE","COFFEE / BAKERY"],["AFTER HOURS","BOOKS / PRINT"],["STATIC","RECORDS / TAPES"],
  ["JUNIPER","FLOWERS / PLANTS"],["WARM BOWL","NOODLES / TAKEAWAY"],["NORTH STAR","LAUNDRY / REPAIRS"],
  ["RAIN CHECK","COFFEE / LATE HOURS"],["PAPER TRAIL","BOOKS / STATIONERY"],
];
const COLOURS=["#bda2cc","#9bb894","#c8bc96","#99b4bb"];

function generatedModules(kind:FrontKind,width:number,seed:number):FrontModule[] {
  const modules:FrontModule[]=[];
  const add=(kind:FrontModule["kind"],owner:string,x:number,y:number,width:number,height:number,extra:Partial<FrontModule>={})=>
    modules.push({kind,owner,x,y,width,height,...extra});
  const door=(owner:string,x:number,width=1.2)=>add("door",owner,x,1.35,width,2.7);
  const sign=(owner:string,x:number,width:number,name:string,caption:string,color:string,y=3.6,height=.75)=>
    add("sign",owner,x,y,width,height,{text:name,caption,color});
  if(kind==="shops") {
    const count=Math.max(1,Math.floor((width-3.8)/6)),bay=(width-3.8)/count;
    for(let i=0;i<count;i++) {
      const owner=`tenant-${i}`,x=-width/2+.5+bay*(i+.5),identity=SHOPS[(seed+i*3)%SHOPS.length]!,color=COLOURS[(seed+i)%COLOURS.length]!;
      door(owner,x-bay/2+1.05);add("glazing",owner,x+.85,1.55,bay-2.5,2.25);
      sign(owner,x,bay-.35,identity[0]!,identity[1]!,color);
      if((seed+i)%3!==0) {
        add("canopy",owner,x,2.98,bay-.2,.14);
        add("light",owner,x,2.84,bay-.45,.045,{color});
      }
    }
    door("residents",width/2-1.55,1.3);
    sign("residents",width/2-1.55,2.5,`${100+seed%800}`,"RESIDENTS","#c5c8c3",3.55,.65);
    if(seed%3===0)add("blade","tenant-0",-width/2+.3,3.65,1.1,1.1,{text:SHOPS[seed%SHOPS.length]![0]!.split(" ")[0],caption:"OPEN LATE",color:COLOURS[seed%4]});
  } else if(kind==="warehouse") {
    const owner="freight";door(owner,-width/2+1.5);
    const count=Math.max(1,Math.floor((width-4)/7)),bay=(width-4)/count;
    for(let i=0;i<count;i++) {
      const x=-width/2+4+bay*(i+.5);
      add("shutter",owner,x,2.15,Math.min(5.2,bay-.8),4.3);
      sign(owner,x,1.4,`0${i+1}`,"LOADING","#d4dcd8",4.75,.65);
      add("light",owner,x,5.4,1.2,.1,{color:"#dfe7ef"});
    }
    sign(owner,0,Math.min(width-1,10),["HARBOR STORES","ALDER FREIGHT","WEST DOCK SUPPLY"][seed%3]!,"WAREHOUSE / RECEIVING","#b7c9b9",6.25,1.1);
  } else {
    const office=kind==="office",owner=office?"lobby":"residents";
    door(owner,0,office?2.6:1.3);
    const glassWidth=Math.min(4.2,(width-6)/2);
    for(const side of [-1,1])add("glazing",owner,side*(1.8+glassWidth/2),1.52,glassWidth,2.8);
    const canopy=office?Math.min(width-1,8):3.2;
    add("canopy",owner,0,3.03,canopy,.18);
    add("light",owner,0,2.9,canopy-.6,.055,{color:"#d2c3a0"});
    const names=office?["CEDAR HOUSE","ALDER EXCHANGE","WESTPORT HOUSE","NORTHLINE"]:["CEDAR COURT","BELL APARTMENTS","ALDER ROOMS","PINE COURT"];
    sign(owner,0,Math.min(width-1,office?8.4:5),names[seed%4]!,`${100+seed%800} / ${office?"OFFICES":"RESIDENTS"}`,"#c4c5bb",3.78,.75);
  }
  return modules;
}

/** Spatial lookups are built once per authoring pass, not once per building. */
export function frontageAccessTools(context:FrontageContext) {
  const segments=context.streets.flatMap(s=>s.points.slice(1).map((b,i)=>({a:s.points[i]!,b})));
  const roads=spatialIndex(segments,({a,b})=>({minX:Math.min(a.x,b.x)-a.width/2-4,maxX:Math.max(a.x,b.x)+a.width/2+4,
    minZ:Math.min(a.z,b.z)-a.width/2-4,maxZ:Math.max(a.z,b.z)+a.width/2+4}));
  const solids=spatialIndex([...context.sites.map(s=>s.block),...context.obstacles],b=>{
    const corners=blockCorners(b);return {minX:Math.min(...corners.map(p=>p.x))-.2,maxX:Math.max(...corners.map(p=>p.x))+.2,
      minZ:Math.min(...corners.map(p=>p.z))-.2,maxZ:Math.max(...corners.map(p=>p.z))+.2};
  });
  const roadDistance=(x:number,z:number)=>Math.min(...roads(x,z).map(({a,b})=>{
    const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
    return Math.hypot(x-a.x-dx*t,z-a.z-dz*t)-Math.max(a.width,b.width)/2;
  }));
  const clear=(plan:FrontPlan,u:number,v:number):string|null=>{
    const p=frontPoint(plan,u,v);
    if(Math.abs(context.heightAt(p.x,p.z)-plan.block.base)>.15)return "Needs a level entrance landing or ramp";
    if(solids(p.x,p.z).some(b=>b!==plan.block&&context.obstacleOwners?.get(b)!==plan.recipe.id&&pointFootprintDistance(b,p.x,p.z)<.12))return "Approach blocked by a building, tree or street prop";
    return null;
  };
  return {roadDistance,clear};
}

function fitAccess(plan:FrontPlan,tools:ReturnType<typeof frontageAccessTools>):FrontPlan|string {
  const edges:{x:number;depth:number;joins:boolean}[]=[],steps=Math.ceil(plan.width);
  for(let i=0;i<=steps;i++) {
    const x=-plan.width/2+i*plan.width/steps;
    const joins=plan.recipe.kind==="warehouse"||plan.recipe.kind==="shops"||Math.abs(x)<=2.1;
    let depth=0;
    for(let d=.15;d<=40;d+=.2) {
      const problem=tools.clear(plan,x,d);if(problem)return problem;
      const p=frontPoint(plan,x,d),distance=tools.roadDistance(p.x,p.z);
      if(distance<1.8)return "Not enough setback for an entrance";
      if(distance<=2.65||(!joins&&d>=2.5)){depth=d;break;}
    }
    if(!depth)return "No reachable sidewalk within 40 metres";
    edges.push({x,depth,joins});
  }
  // A continuous apron serves every door; the centre walk connects office/residential sites.
  const paving=edges.slice(1).map((b,i)=>{const a=edges[i]!,joinsStreet=a.joins&&b.joins;
    return {left:a.x,right:b.x,leftDepth:joinsStreet?a.depth:Math.min(a.depth,2.55),rightDepth:joinsStreet?b.depth:Math.min(b.depth,2.55),joinsStreet};});
  const fitted={...plan,paving};const errors=validateFrontageAccess(fitted,tools);
  return errors.length?errors[0]!:fitted;
}

export function validateFrontageAccess(plan:FrontPlan,tools:ReturnType<typeof frontageAccessTools>):string[] {
  const issues=frontageModuleIssues(plan);
  for(const strip of plan.paving) {
    for(const t of [0,.5,1]) {
      const u=strip.left+(strip.right-strip.left)*t,depth=strip.leftDepth+(strip.rightDepth-strip.leftDepth)*t;
      for(let d=.15;d<=depth;d+=.4) {const problem=tools.clear(plan,u,d);if(problem){issues.push(problem);break;}}
      const p=frontPoint(plan,u,depth),distance=tools.roadDistance(p.x,p.z);
      if(distance<1.8||(strip.joinsStreet&&distance>2.85))issues.push("Paving must connect to the sidewalk without covering the road");
    }
  }
  return [...new Set(issues)];
}

export function refitFrontage(entry:SavedFrontage,site:FrontageSite,tools:ReturnType<typeof frontageAccessTools>):SavedFrontage|string {
  const plan=placeFrontagePlan(entry.plan,site.block);
  const fitted=fitAccess(plan,tools);return typeof fitted==="string"?fitted:{...entry,buildingId:site.id,plan:fitted};
}

/** Validation does not choose or generate modules. Withhold stale access when a
 * changed neighbouring solid or terrain invalidates an otherwise unchanged plot. */
export function checkedFrontages(doc:FrontageDocument,context:FrontageContext) {
  const resolved=resolveFrontages(doc,context.sites),tools=frontageAccessTools(context),plans:FrontPlan[]=[];
  for(const plan of resolved.plans) {
    const problems=validateFrontageAccess(plan,tools);
    if(problems.length)resolved.issues.push({buildingId:context.sites.find(s=>s.block===plan.block)!.id,message:problems[0]!});
    else plans.push(plan);
  }
  return {plans,issues:resolved.issues};
}

export function generateFrontages(doc:FrontageDocument,context:FrontageContext,
  options:{district?:string;buildingId?:string;reroll?:boolean;kind?:FrontKind}):FrontageDocument {
  const next=structuredClone(doc),tools=frontageAccessTools(context);
  const faces=buildingFrontage(context.sites.map(s=>s.block),context.streets,40);
  context.sites.forEach((site,index)=>{
    if(options.buildingId?site.id!==options.buildingId:alderNeighbourhoodAt(site.block.x,site.block.z)?.id!==options.district)return;
    const old=frontageForSite(next,site.id);
    if(context.protectedIds.has(site.id)||old?.locked||(old?.edited&&!options.buildingId)||(!options.reroll&&old))return;
    next.attention=next.attention.filter(i=>i.buildingId!==site.id);
    const seed=old?(old.seed+1)>>>0:hash(`${doc.seed}:${site.id}`),block=site.block;
    const district=alderNeighbourhoodAt(block.x,block.z)?.id;
    const kind=options.kind??(district==="sodo"?"warehouse":block.height>=40?"office":
      ["queen-anne","central-district","madrona-ridge"].includes(district??"")||seed%3===0?"residential":"shops");
    const industrialStyle=district==="sodo"&&kind==="warehouse"?(["freight","workshop","depot"] as const)[seed%3]:undefined;
    const order=[0,1,2,3].sort((a,b)=>faces[index]![a]!-faces[index]![b]!);
    let result:FrontPlan|string="No street-facing wall within 40 metres";
    for(const side of order) {
      if(!Number.isFinite(faces[index]![side]))continue;
      const width=side<2?block.width:block.depth;
      if(width<(kind==="warehouse"?12:kind==="shops"?10:8)||block.height<(industrialStyle?7.5:kind==="warehouse"?7.1:4.4)){result="Not enough usable frontage for this building type";continue;}
      const plan:FrontPlan={block,recipe:{id:site.id,kind,side,x:block.x,z:block.z,width:block.width,depth:block.depth,height:block.height,...(industrialStyle?{industrialStyle}:{})},
        width,turn:[0,Math.PI,Math.PI/2,-Math.PI/2][side]!,wallX:side<2?0:(side===2?1:-1)*block.width/2,
        wallZ:side>=2?0:(side===0?1:-1)*block.depth/2,bandHeight:industrialStyle?7.4:kind==="warehouse"?7.05:4.35,
        modules:industrialStyle?industrialModules(industrialStyle,width,seed):generatedModules(kind,width,seed),paving:[]};
      result=fitAccess(plan,tools);if(typeof result!=="string")break;
    }
    if(typeof result==="string")next.attention.push({buildingId:site.id,message:result});
    else {
      const entry={buildingId:site.id,seed,locked:false,edited:false,plan:result};
      if(old)next.entries[next.entries.indexOf(old)]=entry;else next.entries.push(entry);
    }
  });
  next.entries.sort((a,b)=>a.buildingId.localeCompare(b.buildingId,"en"));
  next.attention.sort((a,b)=>a.buildingId.localeCompare(b.buildingId,"en"));
  return next;
}
