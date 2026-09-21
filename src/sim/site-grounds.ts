import { frontPoint, type FrontPlan } from "./building-fronts.ts";
import { blockCorners, blockPenetration, pointFootprintDistance, spatialIndex, type BuildingBlock } from "./building-footprint.ts";
import type { Street } from "./street-path.ts";
import type { ParkedCar } from "./parking-lot.ts";
import { TRAFFIC_KINDS } from "./traffic.ts";

interface LocalRect { across: number; outward: number; width: number; depth: number }
export interface SiteGroundsRecipe {
  id: string;
  frontageId: string;
  kind: string;
  /** Compact sites retain garden ground instead of an asphalt vehicle apron. */
  surface?: "court";
  landingDepth: number;
  driveStart: number;
  walkAcross: number;
  walkWidth: number;
  parking: { across: number[]; outward: number; width: number; depth: number; occupied: number[] };
  planters: LocalRect[];
  benches: LocalRect[];
  loadingDepth: number;
}
export interface GroundsPatch {
  kind: "walk" | "asphalt";
  left: number;
  right: number;
  start: number;
  leftDepth: number;
  rightDepth: number;
}
export interface SiteGrounds {
  recipe: SiteGroundsRecipe;
  front: FrontPlan;
  patches: GroundsPatch[];
  /** The surveyed outer edge follows the sidewalk, including oblique streets. */
  edge: { across: number; depth: number }[];
  parking: BuildingBlock[];
  cars: ParkedCar[];
  planters: BuildingBlock[];
  benches: BuildingBlock[];
  wheelStops: BuildingBlock[];
  loading: BuildingBlock[];
  walk: BuildingBlock;
  landing: BuildingBlock;
  reserves: BuildingBlock[];
  solids: BuildingBlock[];
}

export function groundsRect(front: FrontPlan, across: number, outward: number, width: number, depth: number, height = .55): BuildingBlock {
  return { ...frontPoint(front, across, outward), width, depth, height, base: front.block.base, rotation: front.block.rotation-front.turn };
}

/** Saved site intent, fitted to the real doors and street. Unsupported/moved or
 * obstructed sites are withheld with an issue; never silently reroll a layout. */
export function planSiteGrounds(recipes: readonly SiteGroundsRecipe[], fronts: readonly FrontPlan[],
  blocks: readonly BuildingBlock[], streets: readonly Pick<Street,"points">[], heightAt: (x:number,z:number)=>number,
  obstacles: readonly BuildingBlock[] = []): { plans: SiteGrounds[]; issues: {id:string;message:string}[] } {
  const plans: SiteGrounds[] = [], issues: {id:string;message:string}[] = [], ids = new Set<string>(), owners = new Set<string>();
  for (const recipe of recipes) {
    try {
      if (ids.has(recipe.id) || owners.has(recipe.frontageId)) throw Error("Duplicate site or frontage ownership");
      ids.add(recipe.id); owners.add(recipe.frontageId);
      const saved = fronts.find(f=>f.recipe.id===recipe.frontageId);
      const block = saved && blocks.find(b=>(["x","z","width","depth","height","base","rotation"] as const).every(k=>Math.abs(b[k]-saved.block[k])<.002));
      if (!saved || !block || saved.recipe.kind!==recipe.kind) throw Error("Saved frontage is missing, moved or has changed use");
      const front = {...saved,block};
      const numeric = [recipe.landingDepth,recipe.driveStart,recipe.walkAcross,recipe.walkWidth,recipe.loadingDepth,
        recipe.parking.outward,recipe.parking.width,recipe.parking.depth,...recipe.parking.across,
        ...[...recipe.planters,...recipe.benches].flatMap(r=>[r.across,r.outward,r.width,r.depth])];
      if (!numeric.every(Number.isFinite) || recipe.landingDepth<2.5 || recipe.landingDepth>8 || recipe.walkWidth<2
        || recipe.driveStart<recipe.landingDepth || recipe.driveStart>20 || recipe.parking.width<2.8 || recipe.parking.depth<5.4
        || recipe.parking.across.length>12 || recipe.parking.occupied.some(i=>!Number.isInteger(i)||i<0||i>=recipe.parking.across.length)
        || recipe.planters.length>12 || recipe.benches.length>12 || recipe.loadingDepth<0 || recipe.loadingDepth>25)
        throw Error("Invalid site dimensions or parking selection");
      if(recipe.surface && (recipe.surface!=="court" || recipe.kind==="warehouse" || recipe.parking.across.length || recipe.loadingDepth))
        throw Error("A pedestrian court cannot contain parking or loading bays");
      const nearby = streets.flatMap(s=>s.points.slice(1).map((b,i)=>({a:s.points[i]!,b}))).filter(({a,b})=>
        Math.min(a.x,b.x)<block.x+90 && Math.max(a.x,b.x)>block.x-90 && Math.min(a.z,b.z)<block.z+90 && Math.max(a.z,b.z)>block.z-90);
      const others=[...blocks.filter(b=>b!==block),...obstacles].filter(b=>Math.hypot(b.x-block.x,b.z-block.z)<130);
      const roadDistance=(x:number,z:number)=>Math.min(...nearby.map(({a,b})=>{
        const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
        return Math.hypot(x-a.x-dx*t,z-a.z-dz*t)-Math.max(a.width,b.width)/2;
      }));
      const edge: SiteGrounds["edge"] = [];
      for(let i=0;i<=Math.ceil(front.width);i++) {
        const across=-front.width/2+i*front.width/Math.ceil(front.width);let depth=0;
        for(let d=.15;d<=40;d+=.2) {
          const p=frontPoint(front,across,d);
          if(Math.abs(heightAt(p.x,p.z)-block.base)>.15) throw Error("Site needs a level platform or authored ramp");
          if(others.some(b=>pointFootprintDistance(b,p.x,p.z)<.15)) throw Error("Site approach overlaps a building or reserved prop");
          const distance=roadDistance(p.x,p.z);
          if(distance<1.8)throw Error("Site starts inside the road margin");
          if(distance<=2.65){depth=d;break;}
        }
        if(!depth)throw Error("No reachable sidewalk within 40 metres");
        edge.push({across,depth});
      }
      const depthAt=(across:number)=>{
        if(across < -front.width/2-.001 || across>front.width/2+.001)throw Error("Site detail crosses its frontage width");
        const i=Math.min(edge.length-2,Math.max(0,Math.floor((across+front.width/2)/(front.width/(edge.length-1)))));
        const a=edge[i]!,b=edge[i+1]!;return a.depth+(b.depth-a.depth)*(across-a.across)/(b.across-a.across);
      };
      const rect=(r:LocalRect,height:number)=>{
        if(r.width<=0||r.depth<=0||r.outward-r.depth/2<-.001
          ||r.outward+r.depth/2>Math.min(depthAt(r.across-r.width/2),depthAt(r.across+r.width/2))-.25)
          throw Error("Site detail crosses the street edge or building");
        return groundsRect(front,r.across,r.outward,r.width,r.depth,height);
      };
      const minDepth=Math.min(...edge.map(e=>e.depth));
      if(!recipe.surface && recipe.driveStart>=minDepth-7)throw Error("Driveway needs room to turn off the street");
      if(recipe.landingDepth>=minDepth-.25)throw Error("Entrance court does not fit before the sidewalk");
      const patches:GroundsPatch[] = [{kind:"walk",left:-front.width/2,right:front.width/2,start:0,leftDepth:recipe.landingDepth,rightDepth:recipe.landingDepth}];
      if(!recipe.surface)for(let i=1;i<edge.length;i++) patches.push({kind:"asphalt",left:edge[i-1]!.across,right:edge[i]!.across,
        start:recipe.driveStart,leftDepth:edge[i-1]!.depth,rightDepth:edge[i]!.depth});
      const left=recipe.walkAcross-recipe.walkWidth/2,right=recipe.walkAcross+recipe.walkWidth/2;
      patches.push({kind:"walk",left,right,start:recipe.landingDepth,leftDepth:depthAt(left),rightDepth:depthAt(right)});
      const walkDepth=Math.max(depthAt(left),depthAt(right));
      const walk=groundsRect(front,recipe.walkAcross,walkDepth/2,recipe.walkWidth,walkDepth,0);
      const landing=groundsRect(front,0,recipe.landingDepth/2,front.width,recipe.landingDepth,0);
      const parking=recipe.parking.across.map(across=>rect({across,outward:recipe.parking.outward,width:recipe.parking.width,depth:recipe.parking.depth},0));
      if(parking.length && (recipe.parking.outward-recipe.parking.depth/2<recipe.driveStart
        ||recipe.parking.outward+recipe.parking.depth/2+7>minDepth))throw Error("Parking needs paved bays and a seven-metre aisle");
      const planters=recipe.planters.map(r=>rect(r,.55)),benches=recipe.benches.map(r=>rect(r,.85));
      const wheelStops=recipe.parking.across.map(across=>rect({across,outward:recipe.parking.outward-recipe.parking.depth/2+.65,width:1.8,depth:.24},.14));
      const loading=recipe.kind==="warehouse"?front.modules.filter(m=>m.kind==="shutter").map(m=>
        rect({across:m.x,outward:recipe.loadingDepth/2,width:m.width+.8,depth:recipe.loadingDepth},0)):[];
      if(recipe.kind==="warehouse"&&(!loading.length||recipe.loadingDepth<12||recipe.loadingDepth+7>minDepth))throw Error("Loading bays need a clear service aisle");
      for(const zone of [...parking,...planters,...benches]) {
        if([walk,landing,...loading].some(path=>blockPenetration(path,zone)>.001))throw Error("Furniture or parking blocks a door path or loading bay");
      }
      const occupied=[...parking,...planters,...benches];
      for(let i=0;i<occupied.length;i++)for(let j=i+1;j<occupied.length;j++)
        if(blockPenetration(occupied[i]!,occupied[j]!)>.001)throw Error("Site details overlap");
      const cars:ParkedCar[]=recipe.parking.occupied.map((index)=>{
        const bay=parking[index]!,kind=recipe.kind==="residential"?"suv":"sedan",spec=TRAFFIC_KINDS[kind];
        return {id:`${recipe.id}:${index}`,kind,color:recipe.kind==="warehouse"?0x8a867b:0x34515e,
          solid:{...bay,width:spec.width,depth:spec.length,height:spec.height}};
      });
      const reserve=groundsRect(front,0,Math.max(...edge.map(e=>e.depth))/2,front.width,Math.max(...edge.map(e=>e.depth)),0);
      if(plans.some(p=>p.reserves.some(r=>blockPenetration(reserve,r)>.01)))throw Error("Site overlaps another saved grounds layout");
      plans.push({recipe,front,patches,edge,parking,cars,planters,benches,wheelStops,loading,walk,landing,reserves:[reserve],
        solids:[...planters,...benches,...wheelStops,...cars.map(c=>c.solid)]});
    } catch(error) {issues.push({id:recipe.id,message:error instanceof Error?error.message:String(error)});}
  }
  return {plans,issues};
}

export function groundsPavingQuery(plans:readonly SiteGrounds[]) {
  const nearby=spatialIndex(plans,plan=>{
    const corners=blockCorners(plan.reserves[0]!);return {minX:Math.min(...corners.map(p=>p.x)),maxX:Math.max(...corners.map(p=>p.x)),
      minZ:Math.min(...corners.map(p=>p.z)),maxZ:Math.max(...corners.map(p=>p.z))};
  });
  return (x:number,z:number)=>nearby(x,z).some(plan=>{
    const origin=frontPoint(plan.front,0,0),along=frontPoint(plan.front,1,0),out=frontPoint(plan.front,0,1);
    const dx=x-origin.x,dz=z-origin.z,u=dx*(along.x-origin.x)+dz*(along.z-origin.z),v=dx*(out.x-origin.x)+dz*(out.z-origin.z);
    return plan.patches.some(p=>u>=p.left-1e-7&&u<=p.right+1e-7&&v>=p.start-1e-7
      &&v<=p.leftDepth+(p.rightDepth-p.leftDepth)*(u-p.left)/(p.right-p.left)+1e-7);
  });
}
