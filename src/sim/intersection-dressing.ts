import type { Street } from "./street-path.ts";
import { projectOntoPath } from "./street-path.ts";

export interface JunctionApproach {
  id:string; streetId:string; junctionId:string;
  x:number; z:number; ux:number; uz:number; width:number;
  stopX:number; stopZ:number; poleX:number; poleZ:number;
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

/** Cosmetic inventory, deliberately independent of traffic reservations or AI.
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
  for(const [id,all] of [...nodes].sort(([a],[b])=>a.localeCompare(b))) {
    const arms=all.filter(a=>a.street.kind!=="alley");
    if(arms.length<3)continue;
    const origin=arms[0]!;
    if(arms.some(a=>Math.hypot(a.x-origin.x,a.z-origin.z)>1))continue;
    // Do not duplicate near-identical arms or dress complex acute merges.
    if(arms.some((a,i)=>arms.slice(i+1).some(b=>a.ux*b.ux+a.uz*b.uz>.92)))continue;
    const major=arms.filter(a=>a.width>=16).length>=3;
    const primary=[...arms].sort((a,b)=>b.width-a.width||a.street.id.localeCompare(b.street.id))[0]!;
    const approaches:JunctionApproach[]=[];
    for(const arm of arms) {
      const nearby=streets.filter(s=>s.id!==arm.street.id && s.points.some(p=>Math.hypot(p.x-arm.x,p.z-arm.z)<110));
      let found:JunctionApproach|undefined;
      for(let d=12;d<=Math.min(48,arm.length*.42);d+=2) {
        const stopX=arm.x+arm.ux*d,stopZ=arm.z+arm.uz*d;
        const fitsOwn=[0,-4.9,-2.1].every(along=>[-arm.width/2-shoulder+.3,0,arm.width/2+shoulder-.3].every(side=>{
          const p=projectOntoPath(arm.street.points,stopX+arm.ux*along+arm.uz*side,stopZ+arm.uz*along-arm.ux*side);
          return p.distance<=p.width/2+shoulder+.05;
        }));
        if(!fitsOwn)continue;
        // Reserve the entire crossing width, not just its centre, before paint
        // or poles are allowed. This also catches unsplit crossing streets.
        const clear=[-arm.width/2-shoulder,0,arm.width/2+shoulder].every(side=>{
          const x=stopX-arm.ux*6+arm.uz*side,z=stopZ-arm.uz*6-arm.ux*side;
          return !nearby.some(s=>{const p=projectOntoPath(s.points,x,z);return p.distance<p.width/2+shoulder+1;});
        });
        if(!clear)continue;
        const reach=arm.width/2+shoulder+1.35;
        const poleX=stopX+arm.ux+arm.uz*reach,poleZ=stopZ+arm.uz-arm.ux*reach;
        if(!poleClear(poleX,poleZ)||occupied.some(p=>Math.hypot(p.x-poleX,p.z-poleZ)<3))continue;
        found={id:`${id}/${arm.street.id}`,streetId:arm.street.id,junctionId:id,x:arm.x,z:arm.z,
          ux:arm.ux,uz:arm.uz,width:arm.width,stopX,stopZ,poleX,poleZ,
          control:major?"signal":"stop",flash:Math.abs(arm.ux*primary.ux+arm.uz*primary.uz)>.85?"amber":"red",
          crosswalk:major&&arms.length===4};
        break;
      }
      if(found)approaches.push(found);
    }
    // A coherent complete junction is preferable to unexplained missing heads.
    if(approaches.length!==arms.length)continue;
    result.push({id,x:origin.x,z:origin.z,approaches});
    occupied.push(...approaches.map(a=>({x:a.poleX,z:a.poleZ})));
  }
  return result;
}
