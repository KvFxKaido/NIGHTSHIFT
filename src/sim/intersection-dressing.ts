import type { Street } from "./street-path.ts";
import { projectOntoPath } from "./street-path.ts";

export interface JunctionApproach {
  id:string; streetId:string; junctionId:string;
  x:number; z:number; ux:number; uz:number; width:number;
  stopX:number; stopZ:number;
  /** Where its signal or sign stands, and whether one does: an approach with no room for a pole keeps its paint (a
   *  junction dressed in the second pass, 2026-09-24), and a stop there is painted on the road instead. */
  poleX:number; poleZ:number; pole:boolean;
  control:"signal"|"stop"; flash:"amber"|"red"; crosswalk:boolean;
}
export interface DressedJunction { id:string; x:number; z:number; approaches:JunctionApproach[] }
export interface PaintReserve { x:number; z:number; ux:number; uz:number; halfWidth:number; halfDepth:number }
export function insidePaintReserve(p:PaintReserve,x:number,z:number,margin=0):boolean {
  const dx=x-p.x,dz=z-p.z;
  return Math.abs(dx*p.ux+dz*p.uz)<=p.halfDepth+margin && Math.abs(dx*p.uz-dz*p.ux)<=p.halfWidth+margin;
}
export function intersectionPaintReserves(junctions:readonly DressedJunction[],shoulder:number):PaintReserve[] {
  return junctions.flatMap(j=>j.approaches.map(a=>({x:(a.stopX+j.x)/2,z:(a.stopZ+j.z)/2,
    ux:a.ux,uz:a.uz,halfWidth:a.width/2+shoulder,halfDepth:Math.hypot(a.stopX-j.x,a.stopZ-j.z)/2+1})));
}

/** The junctions' inventory. Drawn first (step 1); since traffic-v10 traffic reads it too (design/INTERSECTIONS.md):
 * a red flash or a stop sign stops a car at its bar, so a change here moves traffic, and every rival raced in it.
 * Endpoints use the traffic graph's junction identities. Degree-two bends and
 * alley-only connections are not promoted into signalized intersections. */
export function dressIntersections(streets:readonly Street[],shoulder:number,
  poleClear:(x:number,z:number)=>boolean=()=>true):DressedJunction[] {
  type Arm={street:Street; x:number;z:number;ux:number;uz:number;width:number;length:number};
  const nodes=new Map<string,Arm[]>();
  for(const street of [...streets].sort((a,b)=>a.id.localeCompare(b.id))) {
    for(const reverse of [false,true]) {
      const points=reverse?[...street.points].reverse():street.points;
      const a=points[0]!,b=points[1]!,length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length<.01)continue;
      const id=reverse?street.to:street.from, arms=nodes.get(id)??[];
      arms.push({street,x:a.x,z:a.z,ux:(b.x-a.x)/length,uz:(b.z-a.z)/length,width:a.width,
        length:points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i]!.x,p.z-points[i]!.z),0)});
      nodes.set(id,arms);
    }
  }
  const result:DressedJunction[]=[];
  const occupied:{x:number;z:number}[]=[];
  // Two passes (2026-09-24). The first is step 1's: every approach with its pole, or the junction is not dressed.
  // Traffic obeys the dressing since traffic-v10, and a third of the junctions went bare that way, most of them for one
  // arm with no room for a pole; they were where the rival's crossing incidents were. The second pass dresses those
  // too, an arm with room for its paint and not its pole keeping the paint, after the first pass's poles are placed, so
  // every junction the first pass dressed is dressed exactly as it was.
  const candidates=[...nodes].sort(([a],[b])=>a.localeCompare(b)).flatMap(([id,all])=>{
    const arms=all.filter(a=>a.street.kind!=="alley");
    if(arms.length<3)return [];
    const origin=arms[0]!;
    if(arms.some(a=>Math.hypot(a.x-origin.x,a.z-origin.z)>1))return [];
    // Do not duplicate near-identical arms or dress complex acute merges.
    if(arms.some((a,i)=>arms.slice(i+1).some(b=>a.ux*b.ux+a.uz*b.uz>.92)))return [];
    return [{id,arms,origin}];
  });
  const dressed=new Set<string>();
  // Where a bar may sit. The first pass is step 1's, unchanged. The second (FIELD_NOTES, "Dressing the bare
  // junctions") looks closer in and further along, in finer steps, keeps only a bar's depth clear of the crossing
  // roads where there is no crosswalk (step 1 kept a crosswalk's 6 m at every approach, and on short blocks a 20 m
  // road's asphalt and shoulders left no such spot), leaves out the crosswalks of a junction that cannot fit them,
  // and paints an arm with no room for a pole: 31 more junctions, 145 of 169.
  const passes=[
    {poleOptional:false,from:12,step:2,share:.42,clearance:(_crosswalk:boolean)=>6,depth:(_crosswalk:boolean)=>[0,-4.9,-2.1],crosswalks:[true]},
    {poleOptional:true,from:8,step:1,share:.48,clearance:(crosswalk:boolean)=>crosswalk?6:1.5,
      depth:(crosswalk:boolean)=>crosswalk?[0,-4.9,-2.1,4.5]:[0,-.45,4.5],crosswalks:[true,false]},
  ] as const;
  for(const pass of passes)for(const allowCrosswalk of pass.crosswalks)for(const {id,arms,origin} of candidates) {
    if(dressed.has(id))continue;
    const paintWithoutPole=pass.poleOptional;
    const major=arms.filter(a=>a.width>=16).length>=3;
    // The amber axis is the road that goes straight through, the widest such pair, since traffic stops on red
    // (design/INTERSECTIONS.md, step 2): the widest single arm made the stem of a T the priority and stopped the
    // through road at 12 junctions. With no straight pair, the widest arm.
    const byWidth=(a:Arm,b:Arm)=>b.width-a.width||a.street.id.localeCompare(b.street.id);
    const through=arms.flatMap((a,i)=>arms.slice(i+1).filter(b=>a.ux*b.ux+a.uz*b.uz<-.85).map(b=>[a,b].sort(byWidth) as [Arm,Arm]))
      .sort(([a,b],[c,d])=>Math.min(c.width,d.width)-Math.min(a.width,b.width)||(c.width+d.width)-(a.width+b.width)||byWidth(a,c));
    const primary=through[0]?.[0]??[...arms].sort(byWidth)[0]!;
    const crosswalk=major&&arms.length===4&&allowCrosswalk;
    const approaches:JunctionApproach[]=[];
    for(const arm of arms) {
      const nearby=streets.filter(s=>s.id!==arm.street.id && s.points.some(p=>Math.hypot(p.x-arm.x,p.z-arm.z)<110));
      let found:JunctionApproach|undefined, paintOnly:JunctionApproach|undefined;
      for(let d=pass.from;d<=Math.min(48,arm.length*pass.share);d+=pass.step) {
        const stopX=arm.x+arm.ux*d,stopZ=arm.z+arm.uz*d;
        const fitsOwn=pass.depth(crosswalk).every(along=>[-arm.width/2-shoulder+.3,0,arm.width/2+shoulder-.3].every(side=>{
          const p=projectOntoPath(arm.street.points,stopX+arm.ux*along+arm.uz*side,stopZ+arm.uz*along-arm.ux*side);
          return p.distance<=p.width/2+shoulder+.05;
        }));
        if(!fitsOwn)continue;
        // Reserve the entire crossing width, not just its centre, before paint
        // or poles are allowed. This also catches unsplit crossing streets.
        const reserve=pass.clearance(crosswalk);
        const clear=[-arm.width/2-shoulder,0,arm.width/2+shoulder].every(side=>{
          const x=stopX-arm.ux*reserve+arm.uz*side,z=stopZ-arm.uz*reserve-arm.ux*side;
          return !nearby.some(s=>{const p=projectOntoPath(s.points,x,z);return p.distance<p.width/2+shoulder+1;});
        });
        if(!clear)continue;
        const reach=arm.width/2+shoulder+1.35;
        const poleX=stopX+arm.ux+arm.uz*reach,poleZ=stopZ+arm.uz-arm.ux*reach;
        const approach:JunctionApproach={id:`${id}/${arm.street.id}`,streetId:arm.street.id,junctionId:id,x:arm.x,z:arm.z,
          ux:arm.ux,uz:arm.uz,width:arm.width,stopX,stopZ,poleX,poleZ,pole:true,
          control:major?"signal":"stop",flash:Math.abs(arm.ux*primary.ux+arm.uz*primary.uz)>.85?"amber":"red",
          crosswalk};
        // The nearest bar that fits, should no pole: a stop there says so in paint (render/intersection-dressing.ts).
        paintOnly??={...approach,pole:false};
        if(!poleClear(poleX,poleZ)||occupied.some(p=>Math.hypot(p.x-poleX,p.z-poleZ)<3))continue;
        found=approach;
        break;
      }
      const approach=found??(paintWithoutPole?paintOnly:undefined);
      if(approach)approaches.push(approach);
    }
    // A coherent complete junction is preferable to unexplained missing heads: every arm has its bar, or none do.
    if(approaches.length!==arms.length)continue;
    result.push({id,x:origin.x,z:origin.z,approaches});
    dressed.add(id);
    occupied.push(...approaches.filter(a=>a.pole).map(a=>({x:a.poleX,z:a.poleZ})));
  }
  return result.sort((a,b)=>a.id.localeCompare(b.id));
}
