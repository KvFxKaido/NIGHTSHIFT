import type { FrontPlan } from "./building-fronts.ts";
import { blockPenetration } from "./building-footprint.ts";
import { frontageAccessTools, validateFrontageAccess, type FrontageContext } from "./frontage-generator.ts";
import { groundsRect, planSiteGrounds, type SiteGrounds, type SiteGroundsRecipe } from "./site-grounds.ts";

const hash=(text:string)=>{let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
const round=(n:number)=>Math.round(n*100)/100;

/** Offline, missing-only generation. Existing recipes (including hand edits) are
 * authoritative. Stable ids/order make a repeated pass a no-op, not a reroll. */
export function generateSiteGrounds(existing:readonly SiteGroundsRecipe[], fronts:readonly FrontPlan[], context:FrontageContext) {
  const recipes=structuredClone([...existing]),attention:{frontageId:string;message:string}[]=[];
  const owners=new Set(recipes.map(r=>r.frontageId)),blocks=context.sites.map(s=>s.block);
  const obstacles=context.obstacles.filter(b=>!context.obstacleOwners?.has(b));
  const initial=planSiteGrounds(recipes,fronts,blocks,context.streets,context.heightAt,obstacles);
  if(initial.issues.length)throw Error(`Existing grounds need attention: ${JSON.stringify(initial.issues)}`);
  const accepted:SiteGrounds[]=[...initial.plans];
  const fit=(r:SiteGroundsRecipe,front:FrontPlan)=>planSiteGrounds([r],[front],blocks,context.streets,context.heightAt,obstacles);

  for(const front of [...fronts].sort((a,b)=>a.recipe.id.localeCompare(b.recipe.id))) {
    if(owners.has(front.recipe.id)||front.recipe.kind==="office")continue;
    const kind=front.recipe.kind,seed=hash(front.recipe.id),width=front.width,side=seed%2?1:-1;
    const door=front.modules.find(m=>m.kind==="door");
    if(!door){attention.push({frontageId:front.recipe.id,message:"No personnel entrance"});continue;}
    const base:SiteGroundsRecipe={id:`grounds-${front.recipe.id}`,frontageId:front.recipe.id,kind,
      landingDepth:3,driveStart:3,walkAcross:round(kind==="warehouse"?door.x:kind==="residential"?door.x:side*(width/2-1.5)),walkWidth:2.4,
      parking:{across:[],outward:7,width:3,depth:5.6,occupied:[]},planters:[],benches:[],loadingDepth:0};
    // Survey through a pedestrian template first, without guessing the setback.
    const survey=fit({...base,
      ...(kind!=="warehouse"?{surface:"court" as const}:{}),loadingDepth:kind==="warehouse"?12:0},front);
    if(!survey.plans.length){attention.push({frontageId:front.recipe.id,message:survey.issues[0]!.message});continue;}
    const depth=Math.min(...survey.plans[0]!.edge.map(e=>e.depth));
    const recipe:SiteGroundsRecipe=structuredClone(base);
    if(kind==="warehouse") {
      recipe.loadingDepth=Math.min(18,Math.floor(depth-7.5));
    } else if(kind==="residential") {
      recipe.landingDepth=depth>=27?5:3;
      recipe.driveStart=depth>=27?12:3;
      recipe.walkWidth=3.2;
      recipe.parking.outward=recipe.driveStart+3.2;
      if(depth<27)recipe.surface="court";
    } else if(depth<18)recipe.surface="court";

    const blank=fit(recipe,front);
    if(!blank.plans.length){attention.push({frontageId:front.recipe.id,message:blank.issues[0]!.message});continue;}
    const paths=blank.plans[0]!;
    const occupied:ReturnType<typeof groundsRect>[]=[];
    function available(across:number,outward:number,w:number,d:number) {
      const rect=groundsRect(front,across,outward,w,d,0);
      return ![paths.walk,paths.landing,...paths.loading,...occupied].some(p=>blockPenetration(rect,p)>.001);
    }
    if(!recipe.surface) {
      // Keep space at the edges for planting and bias visitor parking to one side.
      for(let u=-width/2+1.8;u<width/2-1.6;u+=3) {
        if(kind==="residential"&&u*side>0)continue;
        const across=round(u);
        if(available(across,recipe.parking.outward,3,5.6)) {
          recipe.parking.across.push(across);occupied.push(groundsRect(front,across,recipe.parking.outward,3,5.6,0));
          if(recipe.parking.across.length>=(kind==="shops"?4:2))break;
        }
      }
      // Small sites are intermittently empty, not a parked-car wall everywhere.
      if(recipe.parking.across.length&&seed%4!==0)recipe.parking.occupied=[seed%recipe.parking.across.length];
    }
    const planterDepth=kind==="warehouse"?1.2:Math.min(4.5,depth-recipe.landingDepth-3);
    const planterOut=recipe.landingDepth+1.4+planterDepth/2;
    for(const u of [-width*.28,width*.28]) {
      const w=kind==="warehouse"?2:3.4;
      if(planterDepth<1||!available(u,planterOut,w,planterDepth))continue;
      recipe.planters.push({across:round(u),outward:round(planterOut),width:w,depth:round(planterDepth)});
      occupied.push(groundsRect(front,u,planterOut,w,planterDepth,0));
      if(kind!=="warehouse"&&available(u,recipe.landingDepth+.55,2.2,.65))
        recipe.benches.push({across:round(u),outward:recipe.landingDepth+.55,width:2.2,depth:.65});
    }
    // Leave no empty 'upgrade': a site must acquire a usable layout or planting.
    if(!recipe.parking.across.length&&!recipe.planters.length&&!recipe.loadingDepth) {
      attention.push({frontageId:front.recipe.id,message:"No useful court furniture or parking fits"});continue;
    }
    const result=fit(recipe,front),candidate=result.plans[0];
    if(!candidate){attention.push({frontageId:front.recipe.id,message:result.issues[0]!.message});continue;}
    if(accepted.some(p=>blockPenetration(p.reserves[0]!,candidate.reserves[0]!)>.01)) {
      attention.push({frontageId:front.recipe.id,message:"Overlaps a saved grounds site"});continue;
    }
    // A full-width court must not steal a neighbouring frontage's existing path.
    const proposed=[...accepted,candidate],owned=proposed.flatMap(p=>[...p.reserves,...p.solids].map(b=>[b,p.recipe.frontageId] as const));
    const tools=frontageAccessTools({...context,obstacles:[...obstacles,...owned.map(([b])=>b)],obstacleOwners:new Map(owned)});
    const conflicts=fronts.filter(p=>Math.hypot(p.block.x-front.block.x,p.block.z-front.block.z)<130)
      .filter(p=>validateFrontageAccess(p,tools).length);
    if(conflicts.length){attention.push({frontageId:front.recipe.id,message:"Would obstruct another saved frontage"});continue;}
    recipes.push(recipe);owners.add(recipe.frontageId);accepted.push(candidate);
  }
  return {recipes,attention};
}
